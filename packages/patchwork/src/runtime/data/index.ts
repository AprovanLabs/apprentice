// Data Runtime - Executes data widgets
//
// Data widgets are simple async functions that return data.
// Formatting is handled by the caller, not by this runtime.

import type { WidgetMeta, DataExecutionResult, Services } from '../types.js';
import { loadWidgetSource, stripMeta } from '../loader.js';
import { injectServiceGlobals } from '../globals.js';

export interface FormatOptions {
  maxLength?: number;
  truncateSuffix?: string;
  jsonIndent?: number;
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

/**
 * Format data as JSON string (no color highlighting - that's a UI concern)
 */
export function formatJson(data: unknown, options: FormatOptions = {}): string {
  const indent = options.jsonIndent ?? 2;
  const json = JSON.stringify(data, null, indent);
  return truncateOutput(json, options.maxLength);
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

    // Inject services as flat globals
    injectServiceGlobals(meta.services);

    const fn = await evaluateDataWidget(cleanSource, services);
    const raw = await fn({ ...props, services });

    // Format as JSON - markdown formatting should be done by the caller if needed
    const formatted = formatJson(raw, options);

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

    // Inject services as flat globals
    injectServiceGlobals(meta.services);

    const fn = await evaluateDataWidget(cleanSource, services);
    const result = fn({ ...props, services });

    const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
      v != null &&
      typeof (v as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';

    if (isAsyncIterable(result)) {
      for await (const chunk of result) {
        const formatted = formatJson(chunk, options);

        yield {
          success: true,
          raw: chunk,
          formatted,
          durationMs: performance.now() - startTime,
        };
      }
    } else {
      const raw = await result;
      const formatted = formatJson(raw, options);

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
