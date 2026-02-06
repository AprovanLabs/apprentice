// Browser Runtime - Compiles and renders widgets in iframe sandbox
//
// This runtime is framework-agnostic. Images provide:
// - Framework dependencies (react, vue, etc.)
// - HTML generation and mounting code
// - CSS theming

import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { WidgetMeta, BrowserExecutionResult } from '../types.js';
import { loadWidgetSource, stripMeta } from '../loader.js';
import { getPatchworkConfig } from '../config.js';

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  errors?: string[];
}

export type Dependencies = Record<string, string>;

const DEFAULT_CDN = 'https://esm.sh';

/**
 * Image interface - what images must provide
 */
export interface ImageModule {
  /** Generate complete HTML for rendering a widget */
  generateHtml: (
    compiledJs: string,
    importMap: Record<string, string>,
    options: {
      title?: string;
      theme?: 'light' | 'dark';
      customCss?: string;
      props?: Record<string, unknown>;
      services?: string[];
    },
  ) => string;

  /** Get default import map entries */
  getDefaultImportMap: (cdn?: string) => Record<string, string>;

  /** Get framework dependencies */
  getFrameworkDependencies: () => Dependencies;
}

// Cache for loaded image modules
const imageCache = new Map<string, ImageModule>();

/**
 * Load an image module dynamically
 */
export async function loadImage(imageName: string): Promise<ImageModule> {
  const cached = imageCache.get(imageName);
  if (cached) return cached;

  try {
    // Try to import the image package
    const imageModule = (await import(imageName)) as ImageModule;

    if (
      !imageModule.generateHtml ||
      !imageModule.getDefaultImportMap ||
      !imageModule.getFrameworkDependencies
    ) {
      throw new Error(
        `Image '${imageName}' missing required exports: generateHtml, getDefaultImportMap, getFrameworkDependencies`,
      );
    }

    imageCache.set(imageName, imageModule);
    return imageModule;
  } catch (err) {
    throw new Error(
      `Failed to load image '${imageName}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Clear the image cache
 */
export function clearImageCache(): void {
  imageCache.clear();
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

function generateContentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export interface CompileOptions {
  /** Additional package dependencies */
  packages?: Dependencies;
  /** Cache directory */
  cacheDir?: string;
  /** CDN URL base */
  cdn?: string;
  /** esbuild options from image */
  esbuildOptions?: {
    jsx?: 'automatic' | 'transform';
    jsxImportSource?: string;
    target?: string;
  };
}

/**
 * Compile widget source to JavaScript
 */
export async function compileWidget(
  source: string,
  options: CompileOptions = {},
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateContentHash(source);
  const cdn = options.cdn ?? DEFAULT_CDN;
  const packages = options.packages ?? {};

  // Check cache
  if (options.cacheDir) {
    const cachedPath = join(options.cacheDir, `${hash}.js`);
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
    // Get jsxImportSource from esbuild options or default to react
    const jsxImportSource = options.esbuildOptions?.jsxImportSource ?? 'react';
    const jsxImportSourceUrl = packages[jsxImportSource]
      ? getCdnUrl(jsxImportSource, packages[jsxImportSource]!, cdn)
      : `${cdn}/${jsxImportSource}`;

    const result = await esbuild.transform(source, {
      loader: 'tsx',
      format: 'esm',
      target: options.esbuildOptions?.target ?? 'es2020',
      jsx: options.esbuildOptions?.jsx ?? 'automatic',
      jsxImportSource: jsxImportSourceUrl,
      minify: false,
    });

    // Transform imports to use CDN URLs
    let transformed = result.code;
    const sorted = Object.entries(packages).sort(
      ([a], [b]) => b.length - a.length,
    );

    for (const [pkg, version] of sorted) {
      const url = getCdnUrl(pkg, version, cdn);
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      transformed = transformed
        .replace(
          new RegExp(`from\\s+["']${escaped}/([^"']+)["']`, 'g'),
          `from "${url}/$1"`,
        )
        .replace(
          new RegExp(`from\\s+["']${escaped}["']`, 'g'),
          `from "${url}"`,
        );
    }

    // Cache result
    if (options.cacheDir) {
      await mkdir(options.cacheDir, { recursive: true });
      await writeFile(
        join(options.cacheDir, `${hash}.js`),
        transformed,
        'utf-8',
      );
    }

    return {
      code: transformed,
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

export interface RenderOptions {
  /** Widget title */
  title?: string;
  /** Theme */
  theme?: 'light' | 'dark';
  /** Custom CSS */
  customCss?: string;
  /** Widget props */
  props?: Record<string, unknown>;
  /** Additional packages */
  packages?: Dependencies;
  /** Image to use (default: @aprovan/patchwork-shadcn) */
  image?: string;
}

/**
 * Generate import map from dependencies
 */
export function generateImportMap(
  deps: Dependencies,
  cdn = DEFAULT_CDN,
): Record<string, string> {
  const imports: Record<string, string> = {};
  for (const [pkg, version] of Object.entries(deps)) {
    const url = getCdnUrl(pkg, version, cdn);
    imports[pkg] = url;
    imports[`${pkg}/`] = `${url}/`;
  }
  return imports;
}

/**
 * Render widget to HTML using the specified image
 */
export async function renderWidgetHtml(
  compiledJs: string,
  meta: WidgetMeta,
  options: RenderOptions = {},
): Promise<string> {
  const imageName = options.image ?? '@aprovan/patchwork-shadcn';
  const image = await loadImage(imageName);

  // Get framework dependencies from image
  const frameworkDeps = image.getFrameworkDependencies();

  // Merge all dependencies
  const deps: Dependencies = {
    ...frameworkDeps,
    ...meta.packages,
    ...options.packages,
  };

  // Generate import map (image provides base, we add widget deps)
  const baseImportMap = image.getDefaultImportMap(DEFAULT_CDN);
  const widgetImportMap = generateImportMap(deps, DEFAULT_CDN);
  const importMap = { ...baseImportMap, ...widgetImportMap };

  // Extract service namespaces
  const services = meta.services.map((s) => s.name);

  // Delegate HTML generation to image
  return image.generateHtml(compiledJs, importMap, {
    title: options.title ?? meta.name,
    theme: options.theme ?? 'dark',
    customCss: options.customCss,
    props: options.props,
    services,
  });
}

/**
 * Execute a browser widget - compile and render to HTML
 */
export async function executeBrowserWidget(
  widgetPath: string,
  meta: WidgetMeta,
  options: RenderOptions = {},
): Promise<BrowserExecutionResult> {
  const startTime = performance.now();

  try {
    const source = await loadWidgetSource(widgetPath);
    const cleanSource = stripMeta(source);
    const config = getPatchworkConfig();
    const cacheDir = join(config.widgetsDir, '.cache');

    // Load image to get esbuild config
    const imageName = options.image ?? '@aprovan/patchwork-shadcn';
    let esbuildOptions: CompileOptions['esbuildOptions'];

    try {
      // Try to read patchwork config from image package.json
      const imagePackageJson = await import(`${imageName}/package.json`, {
        with: { type: 'json' },
      });
      esbuildOptions = imagePackageJson.default?.patchwork?.esbuild;
    } catch {
      // Image might not have patchwork config, use defaults
    }

    // Get framework deps for compilation
    const image = await loadImage(imageName);
    const frameworkDeps = image.getFrameworkDependencies();

    const compiled = await compileWidget(cleanSource, {
      packages: { ...frameworkDeps, ...meta.packages, ...options.packages },
      cacheDir,
      esbuildOptions,
    });

    if (compiled.errors?.length) {
      return {
        success: false,
        error: compiled.errors.join('\n'),
        html: '',
        durationMs: performance.now() - startTime,
      };
    }

    const html = await renderWidgetHtml(compiled.code, meta, options);

    return {
      success: true,
      html,
      durationMs: performance.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      html: '',
      durationMs: performance.now() - startTime,
    };
  }
}
