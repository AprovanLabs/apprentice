// Patchwork Runtime - Exports all runtime APIs

export * from './types.js';
export * from './loader.js';
export * from './globals.js';
export * from './config.js';
export * from './compiler.js';

export * as browser from './browser/index.js';
export * as terminal from './terminal/index.js';
export * as data from './data/index.js';

import type { Services, ExecutionResult } from './types.js';
import { loadWidget } from './loader.js';
import { injectServiceGlobals } from './globals.js';
import { executeBrowserWidget } from './browser/index.js';
import { executeTerminalWidget } from './terminal/index.js';
import { executeDataWidget } from './data/index.js';

export async function executeWidget(
  widgetPath: string,
  services: Services = {},
  props: Record<string, unknown> = {},
): Promise<ExecutionResult> {
  const result = await loadWidget(widgetPath);

  if (result.errors.length > 0 || !result.widget) {
    return {
      success: false,
      error: result.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
      durationMs: 0,
    };
  }

  const { widget } = result;
  // Inject services as flat globals
  injectServiceGlobals(widget.meta.services);

  switch (widget.meta.runtime) {
    case 'browser':
      return executeBrowserWidget(widgetPath, widget.meta, {
        props,
      });

    case 'terminal':
      return executeTerminalWidget(widgetPath, widget.meta, services, props);

    case 'data':
      return executeDataWidget(widgetPath, widget.meta, services, props);

    default:
      return {
        success: false,
        error: `Unknown runtime: ${widget.meta.runtime}`,
        durationMs: 0,
      };
  }
}
