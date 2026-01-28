import * as esbuildNative from 'esbuild';
import * as esbuildWasm from 'esbuild-wasm';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

let initialized = false;
const isNode = typeof process !== 'undefined' && process.versions?.node;
const esbuild = isNode ? esbuildNative : esbuildWasm;

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  errors?: string[];
}

export type Dependencies = Record<string, string>;

export interface VirtualFile {
  contents: string;
  loader?: 'tsx' | 'ts' | 'js' | 'jsx';
}

export type VirtualFileSystem = Record<string, VirtualFile>;

export interface CompilerOptions {
  /** Directory to cache compiled output */
  cacheDir?: string;
  /** CDN URL for external imports (default: "https://esm.sh") */
  cdnUrl?: string;
  /**
   * Dependencies to mark as external (resolved via CDN).
   * React is always included automatically.
   */
  dependencies?: Dependencies;
}

export interface MultiFileCompilerOptions extends CompilerOptions {
  /**
   * Entry point path in the virtual file system.
   * @default "@/entry"
   */
  entryPoint?: string;
  /**
   * Enable minification.
   * @default false
   */
  minify?: boolean;
  /**
   * Generate source maps.
   * @default false
   */
  sourcemap?: boolean;
}

const DEFAULT_CDN_URL = 'https://esm.sh';

function normalizeVersion(version: string): string {
  if (version === 'latest' || version === '*') {
    return '';
  }

  const match = version.match(/[\^~]?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return '';

  const [, major, minor, patch] = match;

  if (version.startsWith('^')) {
    return major ?? '';
  } else if (version.startsWith('~')) {
    return minor ? `${major}.${minor}` : major ?? '';
  } else if (patch) {
    return `${major}.${minor}.${patch}`;
  } else if (minor) {
    return `${major}.${minor}`;
  }
  return major ?? '';
}

function getCdnUrl(
  packageName: string,
  version: string,
  cdnUrl: string,
): string {
  const normalizedVersion = normalizeVersion(version);
  const versionSuffix = normalizedVersion ? `@${normalizedVersion}` : '';
  return `${cdnUrl}/${packageName}${versionSuffix}`;
}

function transformImports(
  code: string,
  dependencies: Dependencies,
  cdnUrl: string,
): string {
  let transformed = code;

  // Sort by package name length (longest first) to avoid partial matches
  const sortedDeps = Object.entries(dependencies).sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [pkg, version] of sortedDeps) {
    const url = getCdnUrl(pkg, version, cdnUrl);
    const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match subpath imports first: from "package/subpath"
    transformed = transformed.replace(
      new RegExp(`from\\s+["']${escapedPkg}/([^"']+)["']`, 'g'),
      `from "${url}/$1"`,
    );

    // Match exact package imports: from "package"
    transformed = transformed.replace(
      new RegExp(`from\\s+["']${escapedPkg}["']`, 'g'),
      `from "${url}"`,
    );
  }

  return transformed;
}

export async function initializeCompiler(): Promise<void> {
  if (initialized) return;

  if (isNode) {
    initialized = true;
    return;
  }

  await esbuildWasm.initialize({
    wasmURL: 'https://unpkg.com/esbuild-wasm@0.24.2/esbuild.wasm',
    worker: true,
  });

  initialized = true;
}

export function generateContentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export async function compileWidget(
  source: string,
  options: CompilerOptions = {},
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateContentHash(source);
  const cacheDir = options.cacheDir;
  const cdnUrl = options.cdnUrl || DEFAULT_CDN_URL;
  // Ensure React is always included for JSX
  const allDependencies: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    ...options.dependencies,
  };

  if (cacheDir) {
    const cachedPath = join(cacheDir, `${hash}.js`);
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

  await initializeCompiler();

  const reactUrl = getCdnUrl(
    'react',
    allDependencies['react'] ?? '^18.0.0',
    cdnUrl,
  );

  try {
    const result = await esbuild.transform(source, {
      loader: 'tsx',
      format: 'esm',
      target: 'es2020',
      jsx: 'automatic',
      jsxImportSource: reactUrl,
      minify: false,
      sourcemap: false,
    });

    const transformedCode = transformImports(
      result.code,
      allDependencies,
      cdnUrl,
    );
    const compilationTimeMs = performance.now() - startTime;

    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      const cachedPath = join(cacheDir, `${hash}.js`);
      await writeFile(cachedPath, transformedCode, 'utf-8');
    }

    return {
      code: transformedCode,
      hash,
      compilationTimeMs,
      fromCache: false,
      errors: result.warnings.map((w) => w.text),
    };
  } catch (error) {
    const compilationTimeMs = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      code: '',
      hash,
      compilationTimeMs,
      fromCache: false,
      errors: [errorMessage],
    };
  }
}

export async function compileMultiple(
  sources: string[],
  options: CompilerOptions = {},
): Promise<CompilationResult[]> {
  const results: CompilationResult[] = [];
  for (const source of sources) {
    results.push(await compileWidget(source, options));
  }
  return results;
}

function createVirtualFilePlugin(
  files: VirtualFileSystem,
  externalDeps: string[],
): esbuildNative.Plugin {
  return {
    name: 'virtual-files',
    setup(build) {
      // Resolver: mark externals and resolve @/ paths to virtual namespace
      build.onResolve({ filter: /.*/ }, (args) => {
        // Mark dependencies as external (loaded via import map)
        for (const dep of externalDeps) {
          if (args.path === dep || args.path.startsWith(`${dep}/`)) {
            return { path: args.path, external: true };
          }
        }

        // Resolve @/ paths to virtual namespace
        if (args.path.startsWith('@/')) {
          return {
            path: args.path,
            namespace: 'virtual',
          };
        }

        // Resolve relative imports from virtual files
        if (
          args.namespace === 'virtual' &&
          (args.path.startsWith('./') || args.path.startsWith('../'))
        ) {
          const basePath = args.importer.replace(/\/[^/]+$/, '');
          const resolved = normalizePath(basePath + '/' + args.path);
          return {
            path: resolved,
            namespace: 'virtual',
          };
        }

        return undefined;
      });

      // Loader: return virtual file contents
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const file = files[args.path];
        if (!file) {
          return {
            errors: [
              {
                text: `Virtual file not found: ${args.path}`,
                location: null,
              },
            ],
          };
        }
        return {
          contents: file.contents,
          loader: file.loader || 'tsx',
        };
      });
    },
  };
}

function normalizePath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const result: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.') {
      result.push(part);
    }
  }

  return '@/' + result.slice(1).join('/');
}

export async function compileMultiFileWidget(
  files: VirtualFileSystem,
  options: MultiFileCompilerOptions = {},
): Promise<CompilationResult> {
  const startTime = performance.now();
  const entryPoint = options.entryPoint || '@/entry';
  const cdnUrl = options.cdnUrl || DEFAULT_CDN_URL;

  // Generate hash from all file contents
  const allContents = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, file]) => `${path}:${file.contents}`)
    .join('\n');
  const hash = generateContentHash(allContents);

  // Check cache
  const cacheDir = options.cacheDir;
  if (cacheDir) {
    const cachedPath = join(cacheDir, `${hash}.js`);
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

  await initializeCompiler();

  // Build dependencies list - these will be external (loaded via import map)
  const allDependencies: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    ...options.dependencies,
  };
  const externalDeps = Object.keys(allDependencies);

  try {
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      format: 'esm',
      target: 'es2020',
      write: false,
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? false,
      jsx: 'automatic',
      jsxImportSource: getCdnUrl(
        'react',
        allDependencies['react'] ?? '^18.0.0',
        cdnUrl,
      ),
      plugins: [createVirtualFilePlugin(files, externalDeps)],
    });

    const bundledCode = result.outputFiles?.[0]?.text || '';
    const compilationTimeMs = performance.now() - startTime;

    // Cache the result
    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      const cachedPath = join(cacheDir, `${hash}.js`);
      await writeFile(cachedPath, bundledCode, 'utf-8');
    }

    return {
      code: bundledCode,
      hash,
      compilationTimeMs,
      fromCache: false,
      errors: result.warnings.map((w) => w.text),
    };
  } catch (error) {
    const compilationTimeMs = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      code: '',
      hash,
      compilationTimeMs,
      fromCache: false,
      errors: [errorMessage],
    };
  }
}

export function generateImportMap(
  dependencies: Dependencies,
  cdnUrl: string = DEFAULT_CDN_URL,
): { imports: Record<string, string> } {
  const imports: Record<string, string> = {};

  for (const [pkg, version] of Object.entries(dependencies)) {
    const url = getCdnUrl(pkg, version, cdnUrl);
    imports[pkg] = url;
    imports[`${pkg}/`] = `${url}/`;
  }

  return { imports };
}
