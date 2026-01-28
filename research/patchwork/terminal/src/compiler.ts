import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { extractMeta, stripMeta } from './meta.js';
import type { CompilationResult, WidgetMeta } from './types.js';

export interface CompilerOptions {
  cacheDir?: string;
  external?: string[];
  minify?: boolean;
}

const DEFAULT_EXTERNAL = ['ink', 'react'];

export function generateContentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export async function compileWidget(
  source: string,
  options: CompilerOptions = {},
): Promise<CompilationResult> {
  const startTime = performance.now();
  const meta = extractMeta(source);
  const cleanSource = stripMeta(source);
  const hash = generateContentHash(cleanSource);
  const { cacheDir, minify = false } = options;

  // External packages: Ink + React always external, plus user-specified
  const external = [...DEFAULT_EXTERNAL, ...(options.external ?? [])];

  if (cacheDir) {
    const cachedPath = join(cacheDir, `${hash}.mjs`);
    if (existsSync(cachedPath)) {
      const cached = await readFile(cachedPath, 'utf-8');
      return {
        code: cached,
        hash,
        compilationTimeMs: performance.now() - startTime,
        fromCache: true,
        meta,
      };
    }
  }

  try {
    const result = await esbuild.transform(cleanSource, {
      loader: 'tsx',
      format: 'esm',
      target: 'node18',
      jsx: 'automatic',
      minify,
      platform: 'node',
    });

    const compilationTimeMs = performance.now() - startTime;

    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      const cachedPath = join(cacheDir, `${hash}.mjs`);
      await writeFile(cachedPath, result.code, 'utf-8');
    }

    return {
      code: result.code,
      hash,
      compilationTimeMs,
      fromCache: false,
      meta,
      errors: result.warnings.map((w) => w.text),
    };
  } catch (error) {
    const compilationTimeMs = performance.now() - startTime;
    return {
      code: '',
      hash,
      compilationTimeMs,
      fromCache: false,
      meta,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export interface BundleOptions {
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean;
}

/**
 * Bundles a widget with all dependencies into a single ESM file.
 * Alternative approach when you want a fully self-contained widget.
 */
export async function bundleWidget(
  source: string,
  options: BundleOptions = {},
): Promise<CompilationResult> {
  const startTime = performance.now();
  const meta = extractMeta(source);
  const cleanSource = stripMeta(source);
  const hash = generateContentHash(cleanSource);
  const {
    outDir = './.patchwork-temp',
    minify = false,
    sourcemap = false,
  } = options;

  const tempDir = join(outDir, hash);
  const entryFile = join(tempDir, 'entry.tsx');
  const outFile = join(tempDir, 'bundle.mjs');

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(entryFile, cleanSource);

    await esbuild.build({
      entryPoints: [entryFile],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      jsx: 'automatic',
      minify,
      sourcemap,
      external: ['ink', 'react'],
    });

    const code = await readFile(outFile, 'utf-8');
    const compilationTimeMs = performance.now() - startTime;

    await rm(tempDir, { recursive: true, force: true });

    return {
      code,
      hash,
      compilationTimeMs,
      fromCache: false,
      meta,
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const compilationTimeMs = performance.now() - startTime;
    return {
      code: '',
      hash,
      compilationTimeMs,
      fromCache: false,
      meta,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
