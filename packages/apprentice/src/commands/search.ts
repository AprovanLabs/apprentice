import chalk from 'chalk';
import { getDb } from '../db';
import { loadUserConfig } from '../config';
import { getEmbeddingProvider } from '../embeddings';
import { search, type SearchMode, type SearchResponse } from '../search';
import type { Event, Asset, Metadata } from '../types';

interface SearchOptions {
  limit?: number;
  since?: string;
  filter?: string[];
  format?: 'text' | 'json' | 'md';
  mode?: SearchMode;
  scope?: 'events' | 'assets' | 'all';
  related?: boolean;
  groupBy?: string;
  orderBy?: string;
  direction?: 'asc' | 'desc';
  window?: number;
  relatedLimit?: number;
}

/**
 * Get a nested metadata value using dot-notation path
 */
function getMetaValue(metadata: Metadata, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = metadata;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format an asset for text output
 */
function formatAssetText(asset: Asset, score?: number): string {
  const id = chalk.cyan(asset.id);
  const key = chalk.dim(asset.key);
  const scoreStr =
    score !== undefined ? chalk.yellow(`[${score.toFixed(2)}]`) : '';

  let output = `${id} ${key} ${scoreStr}`;
  const summary = getMetaValue(asset.metadata, 'asset.summary') as
    | string
    | undefined;
  if (summary) {
    output += '\n           ' + chalk.dim(summary.slice(0, 80));
  }

  return output;
}

/**
 * Format an event for human-readable text output
 */
function formatEventText(event: Event, score?: number): string {
  const timestamp = chalk.dim(formatTimestamp(event.timestamp).padEnd(10));
  const scoreStr =
    score !== undefined ? chalk.yellow(`[${score.toFixed(2)}]`) : '';
  let output = `${timestamp} ${event.message} ${scoreStr}`;

  const data = event.metadata;
  const parts: string[] = [];

  const exitCode = getMetaValue(data, 'shell.exit_code');
  if (exitCode !== undefined) {
    parts.push(exitCode === 0 ? chalk.green('✓') : chalk.red(`✗ ${exitCode}`));
  }

  const cwd = getMetaValue(data, 'shell.cwd') as string | undefined;
  if (cwd) {
    const cwdShort = cwd.replace(process.env['HOME'] ?? '', '~');
    parts.push(chalk.dim(cwdShort));
  }

  const branch = getMetaValue(data, 'git.branch');
  if (branch) {
    parts.push(chalk.cyan(`(${branch})`));
  }

  if (parts.length > 0) {
    output += '\n           ' + parts.join(' ');
  }

  return output;
}

/**
 * Format related context in tree format
 */
function formatRelatedContext(
  context: { events: Event[]; strategyUsed: string },
  groupBy?: string,
): string {
  if (context.events.length === 0) return '';

  const strategyInfo =
    context.strategyUsed === 'grouped' && groupBy
      ? `grouped by ${groupBy}`
      : 'temporal proximity';

  let output = chalk.dim(
    `\n           Related context (${strategyInfo}, ${context.events.length} events):\n`,
  );

  context.events.forEach((event, idx) => {
    const isLast = idx === context.events.length - 1;
    const prefix = isLast ? '└─' : '├─';
    const timestamp = chalk.dim(formatTimestamp(event.timestamp));
    output +=
      chalk.dim(`           ${prefix} `) + `${timestamp} ${event.message}\n`;
  });

  return output;
}

/**
 * Format events as markdown (useful for LLMs)
 */
function formatEventsMarkdown(events: Event[]): string {
  let output = '';

  for (const event of events) {
    const exitCode = getMetaValue(event.metadata, 'shell.exit_code');
    const exitIcon = exitCode === 0 ? '✓' : `✗${exitCode}`;
    const timestamp =
      new Date(event.timestamp).toISOString().split('T')[1]?.slice(0, 8) || '';
    const cwd = (getMetaValue(event.metadata, 'shell.cwd') as string) || '';
    const cwdShort = cwd.replace(/\/Users\/[^/]+/, '~');

    output += `\`${event.message}\` ${exitIcon} ${timestamp} ${cwdShort}`;

    const outputPreview = getMetaValue(
      event.metadata,
      'shell.output_preview',
    ) as string;
    if (
      outputPreview &&
      outputPreview.trim() &&
      outputPreview.trim() !== '\n'
    ) {
      output += `\n\`\`\`\n${outputPreview.trim()}\n\`\`\`\n`;
    }

    output += '\n\n';
  }

  return output.trim();
}

/**
 * Parse time filter (e.g., "1 hour ago", "30m", "2d")
 */
function parseTimeFilter(since: string): Date {
  const now = new Date();
  const match = since.match(
    /^(\d+)\s*(m|h|d|minutes?|hours?|days?)\s*(ago)?$/i,
  );

  if (!match) {
    throw new Error(`Invalid time filter: ${since}`);
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase()[0];

  const ms = {
    m: value * 60 * 1000,
    h: value * 60 * 60 * 1000,
    d: value * 24 * 60 * 60 * 1000,
  }[unit!];

  if (!ms) {
    throw new Error(`Invalid time unit: ${match[2]}`);
  }

  return new Date(now.getTime() - ms);
}

/**
 * Parse metadata filter (e.g., "shell.exit_code=1", "extension=.sh")
 */
function parseMetadataFilter(filterStr: string): Record<string, any> {
  const filters: Record<string, any> = {};

  const parts = filterStr.split('=');
  if (parts.length !== 2) {
    throw new Error(`Invalid filter format: ${filterStr}. Use key=value`);
  }

  const [key, value] = parts;

  // Try to parse as number or boolean
  if (value === 'true') {
    filters[key!] = true;
  } else if (value === 'false') {
    filters[key!] = false;
  } else if (/^\d+$/.test(value!)) {
    filters[key!] = parseInt(value!, 10);
  } else {
    filters[key!] = value;
  }

  return filters;
}

/**
 * Execute the unified search command
 */
export async function searchCommand(
  query: string,
  options: SearchOptions,
): Promise<void> {
  const {
    limit = 20,
    since,
    filter: filterStrings = [],
    format = 'text',
    mode: requestedMode,
    scope = 'all',
  } = options;

  // Parse metadata filters
  const filters: Record<string, any> = {};
  for (const filterStr of filterStrings) {
    try {
      const parsed = parseMetadataFilter(filterStr);
      Object.assign(filters, parsed);
    } catch (err) {
      console.error(chalk.red(`${err}`));
      process.exit(1);
    }
  }

  // Parse time filter
  let sinceDate: Date | undefined;
  if (since) {
    try {
      sinceDate = parseTimeFilter(since);
    } catch (err) {
      console.error(chalk.red(`${err}`));
      process.exit(1);
    }
  }

  // Load user config
  const userConfig = loadUserConfig();
  const embeddingsConfig = userConfig.embeddings;
  const searchConfig = userConfig.search;

  // Determine search mode
  const mode = requestedMode ?? searchConfig?.defaultMode ?? 'hybrid';

  // Get embedding provider if configured and needed
  let embeddingProvider = null;
  if (embeddingsConfig?.enabled && (mode === 'vector' || mode === 'hybrid')) {
    try {
      const modelId = embeddingsConfig.model ?? 'ollama/all-minilm';
      embeddingProvider = getEmbeddingProvider(modelId);
    } catch (err) {
      if (mode === 'vector') {
        console.error(chalk.red(`Vector search requires embeddings: ${err}`));
        process.exit(1);
      }
    }
  }

  const db = getDb();
  const response: SearchResponse = await search(db, embeddingProvider, {
    query,
    mode,
    limit,
    since: sinceDate?.toISOString(),
    filters,
    scope: {
      events: scope === 'events' || scope === 'all',
      assets: scope === 'assets' || scope === 'all',
    },
    hybridWeights: searchConfig?.hybridWeights,
    related: options.related,
    strategy: options.groupBy
      ? {
          groupBy: options.groupBy,
          orderBy: options.orderBy,
          direction: options.direction,
        }
      : undefined,
    windowSeconds: options.window,
    relatedLimit: options.relatedLimit,
  });

  // Handle different output formats
  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          results: response.results,
          mode: response.mode,
          durationMs: response.durationMs,
          embeddingsAvailable: response.embeddingsAvailable,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (format === 'md') {
    const events = response.results
      .filter((r) => r.type === 'event')
      .map((r) => r.item as Event);
    console.log(formatEventsMarkdown(events));
    return;
  }

  // Default text format
  if (response.results.length === 0) {
    console.log(chalk.yellow(`No results found for: ${query}`));
    return;
  }

  console.log(chalk.bold(`\nSearch results for "${query}":\n`));

  for (const result of response.results) {
    if (result.type === 'event') {
      console.log(formatEventText(result.item as Event, result.score));
    } else if (result.type === 'asset') {
      console.log(formatAssetText(result.item as Asset, result.score));
    }

    if (response.mode === 'hybrid' && result.matchType === 'both') {
      console.log(
        chalk.dim('           ') + chalk.magenta('⚡ keyword + semantic match'),
      );
    } else if (result.matchType === 'vector') {
      console.log(chalk.dim('           ') + chalk.blue('🔮 semantic match'));
    }

    if (result.context && result.context.events.length > 0) {
      console.log(formatRelatedContext(result.context, options.groupBy));
    }

    console.log();
  }

  const filters_display: string[] = [];
  if (sinceDate) {
    filters_display.push(`since ${since}`);
  }
  if (Object.keys(filters).length > 0) {
    filters_display.push(
      `filtered by ${Object.entries(filters)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    );
  }

  const modeInfo = chalk.dim(
    `[${response.mode}${
      response.embeddingsAvailable ? '' : ' (no embeddings)'
    }]`,
  );
  const filterInfo =
    filters_display.length > 0 ? ` (${filters_display.join(', ')})` : '';
  const timeInfo = chalk.dim(`${response.durationMs}ms`);
  const scopeInfo = scope !== 'all' ? chalk.dim(`[${scope}]`) : '';
  console.log(
    chalk.dim(
      `Found ${response.results.length} results${filterInfo} ${modeInfo} ${scopeInfo} ${timeInfo}`,
    ),
  );
}
