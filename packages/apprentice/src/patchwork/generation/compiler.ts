// Browser Widget Compiler - Compilation pipeline for browser widgets

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as esbuild from 'esbuild';
import { getPatchworkConfig } from '../config.js';

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  errors: string[];
}

export interface CompilerOptions {
  cacheDir?: string;
  cdnUrl?: string;
  minify?: boolean;
}

const DEFAULT_CDN = 'https://esm.sh';

function generateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function normalizeVersion(version: string): string {
  if (version === 'latest' || version === '*') return '';
  const match = version.match(/[\^~]?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return '';
  const [, major, minor, patch] = match;
  if (version.startsWith('^')) return major ?? '';
  if (version.startsWith('~')) return minor ? `${major}.${minor}` : major ?? '';
  if (patch) return `${major}.${minor}.${patch}`;
  if (minor) return `${major}.${minor}`;
  return major ?? '';
}

function getCdnUrl(pkg: string, version: string, cdn: string): string {
  const normalized = normalizeVersion(version);
  return `${cdn}/${pkg}${normalized ? `@${normalized}` : ''}`;
}

function transformImports(
  code: string,
  packages: Record<string, string>,
  cdn: string,
): string {
  let result = code;
  const sorted = Object.entries(packages).sort(
    ([a], [b]) => b.length - a.length,
  );
  for (const [pkg, version] of sorted) {
    const url = getCdnUrl(pkg, version, cdn);
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`from\\s+["']${escaped}/([^"']+)["']`, 'g'),
      `from "${url}/$1"`,
    );
    result = result.replace(
      new RegExp(`from\\s+["']${escaped}["']`, 'g'),
      `from "${url}"`,
    );
  }
  return result;
}

export function extractMetaFromSource(
  source: string,
): Record<string, unknown> | null {
  const metaStart = source.indexOf('export const meta');
  if (metaStart === -1) return null;
  const objectStart = source.indexOf('{', metaStart);
  if (objectStart === -1) return null;

  let depth = 0;
  let objectEnd = -1;
  for (let i = objectStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        objectEnd = i + 1;
        break;
      }
    }
  }
  if (objectEnd === -1) return null;

  const metaStr = source.slice(objectStart, objectEnd);
  try {
    const normalized = metaStr
      .replace(/([{,]\s*)([a-zA-Z_][\w-]*)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

async function getCachedResult(
  hash: string,
  cacheDir: string,
): Promise<string | null> {
  const path = join(cacheDir, `${hash}.js`);
  if (!existsSync(path)) return null;
  return readFile(path, 'utf-8');
}

async function writeCache(
  hash: string,
  code: string,
  cacheDir: string,
): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, `${hash}.js`), code, 'utf-8');
}

export async function compileWidget(
  source: string,
  options: CompilerOptions = {},
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateHash(source);
  const cdn = options.cdnUrl || DEFAULT_CDN;
  const config = getPatchworkConfig();
  const cacheDir = options.cacheDir || join(config.widgetsDir, '.cache');

  const cached = await getCachedResult(hash, cacheDir);
  if (cached) {
    return {
      code: cached,
      hash,
      compilationTimeMs: performance.now() - startTime,
      fromCache: true,
      errors: [],
    };
  }

  const rawMeta = extractMetaFromSource(source);
  const packages: Record<string, string> = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    ...((rawMeta?.packages as Record<string, string>) || {}),
  };

  const reactUrl = getCdnUrl('react', packages.react ?? '^18.0.0', cdn);

  try {
    const result = await esbuild.transform(source, {
      loader: 'tsx',
      format: 'esm',
      target: 'es2020',
      jsx: 'automatic',
      jsxImportSource: reactUrl,
      minify: options.minify ?? false,
    });

    const code = transformImports(result.code, packages, cdn);
    await writeCache(hash, code, cacheDir);

    return {
      code,
      hash,
      compilationTimeMs: performance.now() - startTime,
      fromCache: false,
      errors: result.warnings.map(
        (w) => `${w.location?.line}:${w.location?.column} ${w.text}`,
      ),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: '',
      hash,
      compilationTimeMs: performance.now() - startTime,
      fromCache: false,
      errors: [message],
    };
  }
}

export async function compileWidgetFile(
  filePath: string,
  options: CompilerOptions = {},
): Promise<CompilationResult & { sourcePath: string }> {
  const source = await readFile(filePath, 'utf-8');
  const result = await compileWidget(source, options);
  return { ...result, sourcePath: filePath };
}

export async function clearCompiledCache(widgetName: string): Promise<boolean> {
  const config = getPatchworkConfig();
  const cacheDir = join(config.widgetsDir, '.cache');
  const sourcePath = join(config.widgetsDir, `${widgetName}.tsx`);

  if (!existsSync(sourcePath)) return false;

  const source = await readFile(sourcePath, 'utf-8');
  const hash = generateHash(source);
  const cachePath = join(cacheDir, `${hash}.js`);

  if (existsSync(cachePath)) {
    await unlink(cachePath);
    return true;
  }
  return false;
}

export function generateImportMap(
  packages: Record<string, string>,
  cdn: string = DEFAULT_CDN,
): { imports: Record<string, string> } {
  const imports: Record<string, string> = {};
  for (const [pkg, version] of Object.entries(packages)) {
    const url = getCdnUrl(pkg, version, cdn);
    imports[pkg] = url;
    imports[`${pkg}/`] = `${url}/`;
  }
  return { imports };
}
