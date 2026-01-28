// Terminal Runtime - Compiles and renders Ink widgets

import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { WidgetMeta, TerminalExecutionResult, Services } from '../types.js';
import { loadWidgetSource, stripMeta } from '../loader.js';
import { createServicesForWidget } from '../globals.js';
import { getPatchworkConfig } from '../config.js';

type InkModule = typeof import('ink');
type ReactModule = typeof import('react');

let inkModule: InkModule | null = null;
let reactModule: ReactModule | null = null;

async function getInk(): Promise<InkModule> {
  if (!inkModule) inkModule = await import('ink');
  return inkModule;
}

async function getReact(): Promise<ReactModule> {
  if (!reactModule) reactModule = await import('react');
  return reactModule;
}

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  errors?: string[];
}

const DEFAULT_EXTERNAL = ['ink', 'react'];

function generateContentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export async function compileWidget(
  source: string,
  cacheDir?: string,
  external: string[] = [],
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateContentHash(source);

  if (cacheDir) {
    const cachedPath = join(cacheDir, `${hash}.mjs`);
    if (existsSync(cachedPath)) {
      const cached = await readFile(cachedPath, 'utf-8');
      return {
        code: cached,
        hash,
        compilationTimeMs: performance.now() - startTime,
        fromCache: true,
      };
    }
  }

  try {
    const result = await esbuild.transform(source, {
      loader: 'tsx',
      format: 'esm',
      target: 'node18',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      platform: 'node',
    });

    // Transform imports to use injected globals
    let transformedCode = result.code
      .replace(
        /import\s+\{([^}]+)\}\s+from\s+["']react["'];?/g,
        'const {$1} = __REACT__;',
      )
      .replace(
        /import\s+\*\s+as\s+React\s+from\s+["']react["'];?/g,
        'const React = __REACT__;',
      )
      .replace(
        /import\s+React\s+from\s+["']react["'];?/g,
        'const React = __REACT__;',
      )
      .replace(
        /import\s+\{([^}]+)\}\s+from\s+["']ink["'];?/g,
        'const {$1} = __INK__;',
      )
      .replace(/export\s+default\s+function\s+(\w+)/g, 'function $1')
      .replace(/export\s+default\s+/g, '__EXPORTS__.default = ')
      .replace(/export\s+\{([^}]+)\};?/g, (_, names) => {
        return names
          .split(',')
          .map((n: string) => {
            const trimmed = n.trim();
            const [local, exported] = trimmed.includes(' as ')
              ? trimmed.split(' as ').map((s: string) => s.trim())
              : [trimmed, trimmed];
            return `__EXPORTS__.${exported} = ${local};`;
          })
          .join('\n');
      });

    // Ensure React is always defined for JSX
    if (!transformedCode.includes('const React = __REACT__')) {
      transformedCode = 'const React = __REACT__;\n' + transformedCode;
    }

    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, `${hash}.mjs`), transformedCode, 'utf-8');
    }

    return {
      code: transformedCode,
      hash,
      compilationTimeMs: performance.now() - startTime,
      fromCache: false,
      errors: result.warnings.map((w) => w.text),
    };
  } catch (err) {
    return {
      code: '',
      hash,
      compilationTimeMs: performance.now() - startTime,
      fromCache: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

async function evaluateWidget(
  code: string,
  services: Services,
): Promise<React.ComponentType<{ services?: Services }>> {
  (globalThis as Record<string, unknown>).__PATCHWORK_SERVICES__ = services;

  const [ink, React] = await Promise.all([getInk(), getReact()]);

  const __EXPORTS__: Record<string, unknown> = {};
  const __REACT__ = React;
  const __INK__ = ink;

  // Execute the transformed code
  const fn = new Function('__EXPORTS__', '__REACT__', '__INK__', code);
  fn(__EXPORTS__, __REACT__, __INK__);

  const Component =
    __EXPORTS__.default ||
    __EXPORTS__.Widget ||
    Object.values(__EXPORTS__).find(
      (v): v is React.ComponentType => typeof v === 'function',
    );

  if (!Component) {
    throw new Error('No default export or Widget component found');
  }

  return Component as React.ComponentType<{ services?: Services }>;
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
): Promise<WidgetInstance> {
  const result = await compileWidget(source, cacheDir);

  if (result.errors?.length) {
    throw new Error(`Compilation failed: ${result.errors.join(', ')}`);
  }

  const [ink, React] = await Promise.all([getInk(), getReact()]);
  const Component = await evaluateWidget(result.code, services);
  const element = React.createElement(Component, { services });
  const instance = ink.render(element, { exitOnCtrlC: true });

  return {
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
    rerender: (el) => instance.rerender(el),
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

    const widgetServices = createServicesForWidget(meta.services);
    const mergedServices = { ...services, ...widgetServices };

    const result = await compileWidget(cleanSource, cacheDir);

    if (result.errors?.length) {
      return {
        success: false,
        error: result.errors.join('\n'),
        durationMs: performance.now() - startTime,
        unmount: () => {},
        waitUntilExit: async () => {},
      };
    }

    const [ink, React] = await Promise.all([getInk(), getReact()]);
    const Component = await evaluateWidget(result.code, mergedServices);
    const element = React.createElement(Component, {
      ...props,
      services: mergedServices,
    });
    const instance = ink.render(element, { exitOnCtrlC: true });

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
): MultiInstanceManager {
  const instances = new Map<string, WidgetInstance>();

  return {
    instances,
    async run(id: string, source: string, services: Services = {}) {
      instances.get(id)?.unmount();
      const instance = await runWidget(source, services, cacheDir);
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
