// Terminal Runtime - Compiles and renders terminal widgets using image-provided runners
//
// This runtime is image-agnostic. Images (like @aprovan/patchwork-ink) provide:
// - Framework dependencies
// - evaluateWidget for code evaluation
// - renderComponent for mounting

import { join } from 'node:path';
import type {
  WidgetMeta,
  TerminalExecutionResult,
  Services,
} from '../types.js';
import { loadWidgetSource, stripMeta } from '../loader.js';
import { injectServiceGlobals } from '../globals.js';
import { getPatchworkConfig } from '../config.js';
import {
  compileWidget as compileWidgetCore,
  REACT_GLOBALS,
  type CompilationResult,
  type GlobalInjection,
} from '../compiler.js';

/**
 * Terminal Image interface - what terminal images must provide
 */
export interface TerminalImageModule {
  /** Evaluate widget code and return a component */
  evaluateWidget: (
    code: string,
    services?: Services,
  ) => Promise<React.ComponentType<{ services?: Services }>>;

  /** Render a component and return instance controls */
  renderComponent: (
    Component: React.ComponentType<Record<string, unknown>>,
    props?: Record<string, unknown>,
    options?: { exitOnCtrlC?: boolean },
  ) => {
    id: string;
    unmount: () => void;
    waitUntilExit: () => Promise<void>;
    rerender: (props: Record<string, unknown>) => void;
  };

  /** Get the global injections for this image */
  getGlobals?: () => GlobalInjection[];
}

// Cache for loaded image modules
const imageCache = new Map<string, TerminalImageModule>();

/**
 * Load a terminal image module dynamically
 */
async function loadTerminalImage(
  imageName: string,
): Promise<TerminalImageModule> {
  const cached = imageCache.get(imageName);
  if (cached) return cached;

  try {
    const imageModule = (await import(imageName)) as TerminalImageModule;

    if (
      typeof imageModule.evaluateWidget !== 'function' ||
      typeof imageModule.renderComponent !== 'function'
    ) {
      throw new Error(
        `Terminal image '${imageName}' missing required exports: evaluateWidget, renderComponent`,
      );
    }

    imageCache.set(imageName, imageModule);
    return imageModule;
  } catch (err) {
    throw new Error(
      `Failed to load terminal image '${imageName}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Clear the terminal image cache
 */
export function clearTerminalImageCache(): void {
  imageCache.clear();
}

export type { CompilationResult };

/**
 * Compile a terminal widget with default settings
 */
export async function compileWidget(
  source: string,
  cacheDir?: string,
  globals: GlobalInjection[] = REACT_GLOBALS,
): Promise<CompilationResult> {
  return compileWidgetCore(source, {
    platform: 'node',
    target: 'node18',
    globals,
    cacheDir,
  });
}

export interface WidgetInstance {
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
  rerender: (element: React.ReactElement) => void;
}

export async function runWidget(
  source: string,
  services: Services = {},
  cacheDir?: string,
  imageName = '@aprovan/patchwork-ink',
): Promise<WidgetInstance> {
  // Load the image first to get its globals for compilation
  const image = await loadTerminalImage(imageName);
  const globals = image.getGlobals?.() ?? REACT_GLOBALS;

  const result = await compileWidget(source, cacheDir, globals);

  if (result.errors?.length && result.errors.some((e) => e.length > 0)) {
    const errors = result.errors.filter((e) => e.length > 0);
    if (errors.length > 0) {
      throw new Error(`Compilation failed: ${errors.join(', ')}`);
    }
  }

  const Component = await image.evaluateWidget(result.code, services);
  const instance = image.renderComponent(
    Component as React.ComponentType<Record<string, unknown>>,
    { services },
    { exitOnCtrlC: true },
  );

  return {
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
    rerender: (el) =>
      instance.rerender(el as unknown as Record<string, unknown>),
  };
}

export async function executeTerminalWidget(
  widgetPath: string,
  meta: WidgetMeta,
  services: Services,
  props: Record<string, unknown> = {},
): Promise<TerminalExecutionResult> {
  const startTime = performance.now();

  try {
    const source = await loadWidgetSource(widgetPath);
    const cleanSource = stripMeta(source);
    const config = getPatchworkConfig();
    const cacheDir = join(config.widgetsDir, '.cache');

    // Inject services as flat globals
    injectServiceGlobals(meta.services);

    const result = await compileWidget(cleanSource, cacheDir);

    if (result.errors?.length && result.errors.some((e) => e.length > 0)) {
      return {
        success: false,
        error: result.errors.filter((e) => e.length > 0).join('\n'),
        durationMs: performance.now() - startTime,
        unmount: () => {},
        waitUntilExit: async () => {},
      };
    }

    // Use image from metadata or default to @aprovan/patchwork-ink
    const imageName = meta.image || '@aprovan/patchwork-ink';
    const image = await loadTerminalImage(imageName);
    const Component = await image.evaluateWidget(result.code, services);
    const instance = image.renderComponent(
      Component as React.ComponentType<Record<string, unknown>>,
      { ...props, services },
      { exitOnCtrlC: true },
    );

    return {
      success: true,
      durationMs: performance.now() - startTime,
      unmount: () => instance.unmount(),
      waitUntilExit: () => instance.waitUntilExit(),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - startTime,
      unmount: () => {},
      waitUntilExit: async () => {},
    };
  }
}

export interface MultiInstanceManager {
  instances: Map<string, WidgetInstance>;
  run: (
    id: string,
    source: string,
    services?: Services,
  ) => Promise<WidgetInstance>;
  stop: (id: string) => void;
  stopAll: () => void;
}

export function createMultiInstanceManager(
  cacheDir?: string,
  imageName = '@aprovan/patchwork-ink',
): MultiInstanceManager {
  const instances = new Map<string, WidgetInstance>();

  return {
    instances,
    async run(id: string, source: string, services: Services = {}) {
      instances.get(id)?.unmount();
      const instance = await runWidget(source, services, cacheDir, imageName);
      instances.set(id, instance);
      return instance;
    },
    stop(id: string) {
      const instance = instances.get(id);
      if (instance) {
        instance.unmount();
        instances.delete(id);
      }
    },
    stopAll() {
      for (const [id, instance] of instances) {
        instance.unmount();
        instances.delete(id);
      }
    },
  };
}
