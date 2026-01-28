// Data Runtime - Executes data widgets and formats output

import chalk from 'chalk';
import { marked } from 'marked';
// @ts-ignore - marked-terminal lacks type declarations
import { markedTerminal } from 'marked-terminal';
import type { WidgetMeta, DataExecutionResult, Services } from '../types.js';
import { loadWidgetSource, stripMeta } from '../loader.js';
import { createServicesForWidget } from '../globals.js';

export interface FormatOptions {
  maxLength?: number;
  truncateSuffix?: string;
  jsonIndent?: number;
  markdownWidth?: number;
}

const DEFAULT_MAX_LENGTH = 10240;
const DEFAULT_TRUNCATE_SUFFIX = '\n... (output truncated)';

function truncateOutput(
  output: string,
  maxLength = DEFAULT_MAX_LENGTH,
  suffix = DEFAULT_TRUNCATE_SUFFIX,
): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength - suffix.length) + suffix;
}

const JSON_COLORS = {
  key: chalk.cyan,
  string: chalk.green,
  number: chalk.yellow,
  boolean: chalk.magenta,
  null: chalk.gray,
  bracket: chalk.white,
};

function highlightJson(json: string): string {
  return json
    .replace(/"([^"]+)":/g, (_, key) => `${JSON_COLORS.key(`"${key}"`)}:`)
    .replace(/: "([^"]*)"/g, (_, str) => `: ${JSON_COLORS.string(`"${str}"`)}`)
    .replace(/: (-?\d+\.?\d*)/g, (_, num) => `: ${JSON_COLORS.number(num)}`)
    .replace(/: (true|false)/g, (_, bool) => `: ${JSON_COLORS.boolean(bool)}`)
    .replace(/: null/g, `: ${JSON_COLORS.null('null')}`)
    .replace(/([{}[\],])/g, (bracket) => JSON_COLORS.bracket(bracket));
}

export function formatJson(data: unknown, options: FormatOptions = {}): string {
  const indent = options.jsonIndent ?? 2;
  const json = JSON.stringify(data, null, indent);
  const highlighted = highlightJson(json);
  return truncateOutput(highlighted, options.maxLength);
}

export function formatMarkdown(
  content: string,
  options: FormatOptions = {},
): string {
  marked.use(
    markedTerminal({ width: options.markdownWidth ?? 80, reflowText: true }),
  );
  const rendered = marked(content) as string;
  return truncateOutput(rendered.trim(), options.maxLength);
}

async function evaluateDataWidget(
  source: string,
  services: Services,
): Promise<(props: Record<string, unknown>) => Promise<unknown>> {
  (globalThis as Record<string, unknown>).__PATCHWORK_SERVICES__ = services;

  const dataUri = `data:text/javascript;base64,${Buffer.from(source).toString(
    'base64',
  )}`;
  const module = await import(dataUri);

  const fn = module.default || module.getData || module.run;
  if (typeof fn !== 'function') {
    throw new Error('Data widget must export a default async function');
  }

  return fn;
}

export async function executeDataWidget(
  widgetPath: string,
  meta: WidgetMeta,
  services: Services,
  props: Record<string, unknown> = {},
  options: FormatOptions = {},
): Promise<DataExecutionResult> {
  const startTime = performance.now();

  try {
    const source = await loadWidgetSource(widgetPath);
    const cleanSource = stripMeta(source);

    const widgetServices = createServicesForWidget(meta.services);
    const mergedServices = { ...services, ...widgetServices };

    const fn = await evaluateDataWidget(cleanSource, mergedServices);
    const raw = await fn({ ...props, services: mergedServices });

    const outputFormat = meta.output || 'json';
    const formatted =
      outputFormat === 'markdown'
        ? formatMarkdown(String(raw), options)
        : formatJson(raw, options);

    return {
      success: true,
      raw,
      formatted,
      durationMs: performance.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      raw: null,
      formatted: '',
      durationMs: performance.now() - startTime,
    };
  }
}

export async function* executeStreamingDataWidget(
  widgetPath: string,
  meta: WidgetMeta,
  services: Services,
  props: Record<string, unknown> = {},
  options: FormatOptions = {},
): AsyncGenerator<DataExecutionResult> {
  const startTime = performance.now();

  try {
    const source = await loadWidgetSource(widgetPath);
    const cleanSource = stripMeta(source);

    const widgetServices = createServicesForWidget(meta.services);
    const mergedServices = { ...services, ...widgetServices };

    const fn = await evaluateDataWidget(cleanSource, mergedServices);
    const result = fn({ ...props, services: mergedServices });

    const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
      v != null &&
      typeof (v as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';

    if (isAsyncIterable(result)) {
      for await (const chunk of result) {
        const outputFormat = meta.output || 'json';
        const formatted =
          outputFormat === 'markdown'
            ? formatMarkdown(String(chunk), options)
            : formatJson(chunk, options);

        yield {
          success: true,
          raw: chunk,
          formatted,
          durationMs: performance.now() - startTime,
        };
      }
    } else {
      const raw = await result;
      const outputFormat = meta.output || 'json';
      const formatted =
        outputFormat === 'markdown'
          ? formatMarkdown(String(raw), options)
          : formatJson(raw, options);

      yield {
        success: true,
        raw,
        formatted,
        durationMs: performance.now() - startTime,
      };
    }
  } catch (err) {
    yield {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      raw: null,
      formatted: '',
      durationMs: performance.now() - startTime,
    };
  }
}
