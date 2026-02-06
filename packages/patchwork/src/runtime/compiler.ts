// Widget Compiler - Generic esbuild-based compilation with injectable globals

import * as esbuild from 'esbuild';
import type { Plugin, TransformOptions, BuildOptions } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface GlobalInjection {
  module: string;
  globalName: string;
}

export interface CompilerOptions {
  platform: 'browser' | 'node';
  target?: string;
  format?: 'esm' | 'iife';
  globals?: GlobalInjection[];
  cacheDir?: string;
  minify?: boolean;
}

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  errors?: string[];
  map?: string;
}

function generateContentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function createGlobalsPlugin(globals: GlobalInjection[]): Plugin {
  const globalMap = new Map(globals.map((g) => [g.module, g.globalName]));

  return {
    name: 'inject-globals',
    setup(build) {
      // Intercept imports for modules that should come from globals
      build.onResolve({ filter: /.*/ }, (args) => {
        if (globalMap.has(args.path)) {
          return {
            path: args.path,
            namespace: 'global-inject',
          };
        }
        return null;
      });

      // Provide the global reference for intercepted modules
      build.onLoad({ filter: /.*/, namespace: 'global-inject' }, (args) => {
        const globalName = globalMap.get(args.path);
        if (!globalName) return null;

        // Export the global as both default and namespace
        return {
          contents: `
            const mod = globalThis.${globalName};
            export default mod;
            export * from '${args.path}';
            // Re-export common named exports for convenience
            const { ${getCommonExports(args.path).join(', ')} } = mod || {};
            export { ${getCommonExports(args.path).join(', ')} };
          `.trim(),
          loader: 'js',
          resolveDir: process.cwd(),
        };
      });
    },
  };
}

function getCommonExports(moduleName: string): string[] {
  // Common exports for known modules - esbuild will tree-shake unused ones
  const exports: Record<string, string[]> = {
    react: [
      'useState',
      'useEffect',
      'useCallback',
      'useMemo',
      'useRef',
      'useContext',
      'useReducer',
      'useLayoutEffect',
      'useImperativeHandle',
      'useDebugValue',
      'useDeferredValue',
      'useTransition',
      'useId',
      'useSyncExternalStore',
      'createContext',
      'createElement',
      'cloneElement',
      'createRef',
      'forwardRef',
      'lazy',
      'memo',
      'Fragment',
      'Suspense',
      'StrictMode',
      'Component',
      'PureComponent',
    ],
  };
  return exports[moduleName] || [];
}

function createExportsWrapper(): Plugin {
  return {
    name: 'exports-wrapper',
    setup(build) {
      build.onEnd((result) => {
        // Post-process to wrap exports for runtime injection
        if (result.outputFiles) {
          for (const file of result.outputFiles) {
            if (file.path.endsWith('.js')) {
              let code = file.text;
              // Convert ESM exports to __EXPORTS__ assignments
              code = code
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
              // @ts-expect-error - modifying readonly property for transformation
              file.text = code;
            }
          }
        }
      });
    },
  };
}

export async function compileWidget(
  source: string,
  options: CompilerOptions,
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateContentHash(source);
  const {
    cacheDir,
    globals = [],
    platform,
    target,
    format = 'esm',
    minify,
  } = options;

  // Check cache
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
    // Use transform for simple single-file compilation
    // Note: We use jsx: 'transform' (classic) instead of 'automatic' because
    // the automatic mode generates imports from 'react/jsx-runtime' which
    // complicates dynamic evaluation. Classic mode just needs React in scope.
    const transformResult = await esbuild.transform(source, {
      loader: 'tsx',
      format: 'esm',
      target: target || (platform === 'browser' ? 'es2020' : 'node18'),
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      platform,
      minify,
      sourcemap: 'inline',
      sourcesContent: true,
    });

    let code = transformResult.code;

    // Transform imports to use injected globals
    // This is still needed for transform() since plugins only work with build()
    // But now it's cleaner and more maintainable
    for (const { module, globalName } of globals) {
      const escaped = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Match all import patterns for this module
      // import Foo, { bar, baz } from 'module'
      code = code.replace(
        new RegExp(
          `import\\s+(\\w+)\\s*,\\s*\\{([^}]+)\\}\\s+from\\s+["']${escaped}["'];?`,
          'g',
        ),
        `const $1 = ${globalName}; const {$2} = ${globalName};`,
      );
      // import { bar, baz } from 'module'
      code = code.replace(
        new RegExp(
          `import\\s+\\{([^}]+)\\}\\s+from\\s+["']${escaped}["'];?`,
          'g',
        ),
        `const {$1} = ${globalName};`,
      );
      // import * as Foo from 'module'
      code = code.replace(
        new RegExp(
          `import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+["']${escaped}["'];?`,
          'g',
        ),
        `const $1 = ${globalName};`,
      );
      // import Foo from 'module'
      code = code.replace(
        new RegExp(`import\\s+(\\w+)\\s+from\\s+["']${escaped}["'];?`, 'g'),
        `const $1 = ${globalName};`,
      );
    }

    // Ensure React is available for JSX (since we're using classic jsx transform)
    // Only add if not already declared by import transforms
    const hasReactGlobal = globals.some((g) => g.module === 'react');
    if (hasReactGlobal && !code.includes('const React =')) {
      const reactGlobal = globals.find((g) => g.module === 'react')!;
      code = `const React = ${reactGlobal.globalName};\n` + code;
    }

    // Transform exports to __EXPORTS__ assignments
    code = code
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

    // Cache the result
    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, `${hash}.mjs`), code, 'utf-8');
    }

    return {
      code,
      hash,
      compilationTimeMs: performance.now() - startTime,
      fromCache: false,
      errors: transformResult.warnings.map((w) => w.text),
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

export async function compileWidgetBundle(
  entrySource: string,
  options: CompilerOptions & { entryName?: string },
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateContentHash(entrySource);
  const {
    cacheDir,
    globals = [],
    platform,
    target,
    minify,
    entryName = 'widget.tsx',
  } = options;

  // Check cache
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
    // Use build() with plugins for full bundling support
    const plugins: Plugin[] = [];

    if (globals.length > 0) {
      plugins.push(createGlobalsPlugin(globals));
    }

    // Virtual entry point
    plugins.push({
      name: 'virtual-entry',
      setup(build) {
        build.onResolve({ filter: new RegExp(`^${entryName}$`) }, () => ({
          path: entryName,
          namespace: 'virtual',
        }));
        build.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
          contents: entrySource,
          loader: 'tsx',
          resolveDir: process.cwd(),
        }));
      },
    });

    const result = await esbuild.build({
      entryPoints: [entryName],
      bundle: true,
      write: false,
      format: 'esm',
      target: target || (platform === 'browser' ? 'es2020' : 'node18'),
      jsx: 'automatic',
      platform,
      minify,
      sourcemap: 'inline',
      plugins,
      external: globals.map((g) => g.module),
    });

    let code = result.outputFiles?.[0]?.text || '';

    // Transform exports for runtime injection
    code = code
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

    // Cache
    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, `${hash}.mjs`), code, 'utf-8');
    }

    return {
      code,
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

// Pre-configured globals for common runtimes
// These should be provided by the image, not hardcoded here
export const REACT_GLOBALS: GlobalInjection[] = [
  { module: 'react', globalName: '__REACT__' },
];

export const BROWSER_GLOBALS: GlobalInjection[] = [
  { module: 'react', globalName: '__REACT__' },
  { module: 'react-dom', globalName: '__REACT_DOM__' },
];
