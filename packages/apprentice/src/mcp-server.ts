import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { ensureSchema, getDb } from './db';
import { loadUserConfig } from './config';
import { loadEmbeddingConfig, getEmbeddingProvider } from './embeddings';
import { search, type SearchMode } from './search';
import type { Event, Asset, AssetRelation } from './types';

import { getAsset } from './assets/retrieval';
import { executeAsset } from './assets/executor';
import { listContexts, addContext } from './context';
import { insertEvent } from './events/insert';

/**
 * Create and configure the MCP server
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'apprentice',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'apr_search',
          description:
            'Unified search across events and assets. Search command history, scripts, docs, and other indexed content.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'Search query - keywords, phrases, or natural language',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 20,
                maximum: 50,
              },
              scope: {
                type: 'string',
                enum: ['events', 'assets', 'both'],
                description:
                  'Search scope: events (history), assets (files), or both',
                default: 'both',
              },
              filters: {
                type: 'object',
                description:
                  "Metadata filters using dot-notation (e.g., {'shell.exit_code': '0'})",
                additionalProperties: { type: 'string' },
              },
              since: {
                type: 'string',
                description:
                  'ISO 8601 timestamp - filter to items after this time',
              },
              related: {
                type: 'boolean',
                description: 'Include related context for event results',
                default: false,
              },
              strategy: {
                type: 'object',
                description: 'Grouping strategy for related events',
                properties: {
                  groupBy: {
                    type: 'string',
                    description:
                      "Metadata field path to group by (e.g., 'chat.session_id')",
                  },
                  orderBy: {
                    type: 'string',
                    description:
                      "Metadata field path or 'timestamp' for ordering",
                  },
                  direction: {
                    type: 'string',
                    enum: ['asc', 'desc'],
                    description: 'Sort direction',
                  },
                },
              },
              windowSeconds: {
                type: 'number',
                description:
                  'Temporal window in seconds for fallback (default: 60)',
                default: 60,
              },
              relatedLimit: {
                type: 'number',
                description: 'Maximum related events to return (default: 20)',
                default: 20,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'apr_get_asset',
          description:
            'Retrieve a specific asset by ID, optionally including its content.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Asset ID from search results (a 16-char hash)',
              },
              include_content: {
                type: 'boolean',
                description: 'Include file content in response',
                default: false,
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'apr_run_asset',
          description:
            'Execute an executable asset (script) with provided arguments.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Asset ID from search results (a 16-char hash)',
              },
              args: {
                type: 'array',
                items: { type: 'string' },
                description: 'Arguments to pass to the script',
                default: [],
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'apr_context_list',
          description:
            'List all registered contexts (indexed folders) with their status.',
          inputSchema: {
            type: 'object',
            properties: {
              enabled_only: {
                type: 'boolean',
                description: 'Only show enabled contexts',
                default: true,
              },
            },
          },
        },
        {
          name: 'apr_context_add',
          description: 'Register a new folder as a context for indexing.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the folder to index',
              },
              name: {
                type: 'string',
                description: 'Optional name for the context',
              },
              include_patterns: {
                type: 'array',
                items: { type: 'string' },
                description: "Glob patterns to include (default: ['**/*'])",
              },
              exclude_patterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'Glob patterns to exclude',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'apr_log_event',
          description: 'Record a custom event with optional asset relations.',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Event message/description',
              },
              metadata: {
                type: 'object',
                description: 'Event metadata (flexible structure)',
              },
              relations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    asset_id: { type: 'string' },
                    type: { type: 'string' },
                  },
                  required: ['asset_id', 'type'],
                },
                description:
                  "Asset relations (e.g., [{ asset_id: 'scripts:deploy.sh', type: 'ai.referenced' }])",
              },
            },
            required: ['message'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'apr_search':
          return await handleSearch(args as unknown as SearchArgs);
        case 'apr_get_asset':
          return await handleGetAsset(args as unknown as GetAssetArgs);
        case 'apr_run_asset':
          return await handleRunAsset(args as unknown as RunAssetArgs);
        case 'apr_context_list':
          return await handleContextList(args as unknown as ContextListArgs);
        case 'apr_context_add':
          return await handleContextAdd(args as unknown as ContextAddArgs);
        case 'apr_log_event':
          return await handleLogEvent(args as unknown as LogEventArgs);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`Error handling tool ${name}:`, error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  return server;
}

// Type definitions for tool arguments
interface SearchArgs {
  query: string;
  limit?: number;
  scope?: 'events' | 'assets' | 'both';
  filters?: Record<string, string>;
  since?: string;
  related?: boolean;
  strategy?: {
    groupBy: string;
    orderBy?: string;
    direction?: 'asc' | 'desc';
  };
  windowSeconds?: number;
  relatedLimit?: number;
}

interface GetAssetArgs {
  id: string;
  include_content?: boolean;
}

interface RunAssetArgs {
  id: string;
  args?: string[];
}

interface ContextListArgs {
  enabled_only?: boolean;
}

interface ContextAddArgs {
  path: string;
  name?: string;
  include_patterns?: string[];
  exclude_patterns?: string[];
}

interface LogEventArgs {
  message: string;
  metadata?: Record<string, unknown>;
  relations?: AssetRelation[];
}

async function handleSearch(args: SearchArgs) {
  await ensureSchema();

  const {
    query,
    limit = 20,
    scope = 'both',
    filters,
    since,
    related,
    strategy,
    windowSeconds,
    relatedLimit,
  } = args;

  const userConfig = loadUserConfig();
  const embeddingsConfig = userConfig.embeddings;
  const searchConfig = userConfig.search;

  const mode: SearchMode = searchConfig?.defaultMode ?? 'hybrid';

  let embeddingProvider = null;
  if (embeddingsConfig?.enabled && (mode === 'vector' || mode === 'hybrid')) {
    try {
      const modelId = embeddingsConfig.model ?? 'ollama/all-minilm';
      loadEmbeddingConfig({
        enabled: true,
        model: modelId,
      });
      embeddingProvider = getEmbeddingProvider(modelId);
    } catch {
      // Ignore embedding provider errors
    }
  }

  const db = getDb();

  let recentMinutes: number | undefined;
  if (since) {
    const sinceDate = new Date(since);
    const now = new Date();
    recentMinutes = Math.floor((now.getTime() - sinceDate.getTime()) / 60000);
  }

  const response = await search(db, embeddingProvider, {
    query,
    mode,
    limit,
    recentMinutes,
    filters,
    scope: {
      events: scope === 'events' || scope === 'both',
      assets: scope === 'assets' || scope === 'both',
    },
    hybridWeights: searchConfig?.hybridWeights,
    related,
    strategy,
    windowSeconds,
    relatedLimit,
  });

  const results = response.results.map((r) => {
    if (r.type === 'event') {
      const event = r.item as Event;
      return {
        type: 'event',
        id: event.id,
        timestamp: event.timestamp,
        message: event.message,
        metadata: event.metadata,
        score: r.score,
        context: r.context
          ? {
              events: r.context.events.map((e) => ({
                id: e.id,
                timestamp: e.timestamp,
                message: e.message,
                metadata: e.metadata,
              })),
              assets: r.context.assets.map((a) => ({
                id: a.id,
                key: a.key,
                extension: a.extension,
              })),
              strategyUsed: r.context.strategyUsed,
            }
          : undefined,
      };
    } else {
      const asset = r.item as Asset;
      return {
        type: 'asset',
        id: asset.id,
        context_id: asset.context_id,
        key: asset.key,
        extension: asset.extension,
        metadata: asset.metadata,
        indexed_at: asset.indexed_at,
        score: r.score,
      };
    }
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

async function handleGetAsset(args: GetAssetArgs) {
  const { id, include_content = false } = args;

  const asset = await getAsset(id, { includeContent: include_content });

  if (!asset) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Asset '${id}' not found` }, null, 2),
        },
      ],
    };
  }

  // Truncate content if too large
  const MAX_CONTENT_SIZE = 50000;
  if (asset.content && asset.content.length > MAX_CONTENT_SIZE) {
    asset.content =
      asset.content.slice(0, MAX_CONTENT_SIZE) + '\n\n...[content truncated]';
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(asset, null, 2),
      },
    ],
  };
}

async function handleRunAsset(args: RunAssetArgs) {
  const { id, args: scriptArgs = [] } = args;

  try {
    const startTime = Date.now();
    const result = await executeAsset(id, { args: scriptArgs });
    const durationMs = Date.now() - startTime;

    // Create event recording the execution with relation stored in metadata
    const event = await insertEvent({
      message: `Executed asset: ${id}`,
      metadata: {
        shell: {
          exit_code: result.exitCode,
          duration_ms: durationMs,
        },
        asset: {
          id,
          args: scriptArgs,
        },
        relations: [{ asset_id: id, type: 'shell.executed' }],
      },
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              stdout: result.stdout,
              stderr: result.stderr,
              exit_code: result.exitCode,
              duration_ms: durationMs,
              event_id: event.id,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

async function handleContextList(args: ContextListArgs) {
  const { enabled_only = true } = args;

  const contexts = await listContexts();

  const filtered = enabled_only ? contexts.filter((c) => c.enabled) : contexts;

  const summary = filtered.map((c) => ({
    id: c.id,
    name: c.name,
    path: c.path,
    enabled: c.enabled,
    last_indexed_at: c.last_indexed_at,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}

async function handleContextAdd(args: ContextAddArgs) {
  const { path, name, include_patterns, exclude_patterns } = args;

  try {
    const context = await addContext(path, {
      name,
      include_patterns,
      exclude_patterns,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(context, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

async function handleLogEvent(args: LogEventArgs) {
  const { message, metadata = {}, relations = [] } = args;

  try {
    // Validate relation asset IDs exist
    if (relations.length > 0) {
      for (const rel of relations) {
        const asset = await getAsset(rel.asset_id);
        if (!asset) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Asset '${rel.asset_id}' not found in relations`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }
    }

    // Store relations in metadata for the generic related context flow
    const eventMetadata =
      relations.length > 0 ? { ...metadata, relations } : metadata;

    const event = await insertEvent({
      message,
      metadata: eventMetadata,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...event,
              relations: relations.length > 0 ? relations : undefined,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

/**
 * Main entry point for the MCP server
 */
async function main() {
  // Ensure database schema is initialized
  try {
    await ensureSchema();
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  }

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  console.error('Apprentice MCP Server running on stdio');

  await server.connect(transport);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error in MCP server:', error);
    process.exit(1);
  });
}
