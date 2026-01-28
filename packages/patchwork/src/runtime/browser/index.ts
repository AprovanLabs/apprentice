// Browser Runtime - Compiles and renders React widgets in iframe sandbox

import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { WidgetMeta, BrowserExecutionResult, Services } from '../types.js';
import { loadWidgetSource, stripMeta } from '../loader.js';
import { generateBrowserServiceBridge } from '../globals.js';
import { getPatchworkConfig } from '../config.js';

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  errors?: string[];
}

type Dependencies = Record<string, string>;

const DEFAULT_CDN = 'https://esm.sh';

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
  deps: Dependencies,
  cdn: string,
): string {
  let result = code;
  const sorted = Object.entries(deps).sort(([a], [b]) => b.length - a.length);

  for (const [pkg, version] of sorted) {
    const url = getCdnUrl(pkg, version, cdn);
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result
      .replace(
        new RegExp(`from\\s+["']${escaped}/([^"']+)["']`, 'g'),
        `from "${url}/$1"`,
      )
      .replace(new RegExp(`from\\s+["']${escaped}["']`, 'g'), `from "${url}"`);
  }

  return result;
}

function generateContentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export async function compileWidget(
  source: string,
  packages: Dependencies = {},
  cacheDir?: string,
): Promise<CompilationResult> {
  const startTime = performance.now();
  const hash = generateContentHash(source);
  const cdn = DEFAULT_CDN;

  const deps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    ...packages,
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

  try {
    const reactUrl = getCdnUrl('react', deps['react']!, cdn);
    const result = await esbuild.transform(source, {
      loader: 'tsx',
      format: 'esm',
      target: 'es2020',
      jsx: 'automatic',
      jsxImportSource: reactUrl,
      minify: false,
    });

    const transformed = transformImports(result.code, deps, cdn);

    if (cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, `${hash}.js`), transformed, 'utf-8');
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

const CSS_PRESETS = {
  light: `
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}
body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
`,
  dark: `
:root {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;
  --radius: 0.5rem;
}
body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
`,
};

export interface RenderOptions {
  title?: string;
  theme?: 'light' | 'dark';
  customCss?: string;
  props?: Record<string, unknown>;
  packages?: Dependencies;
}

function extractDefaultExport(code: string): string {
  let result = code;

  const namedMatch = result.match(/export\s*{\s*(\w+)\s+as\s+default\s*}/);
  if (namedMatch) {
    result = result.replace(
      /export\s*{\s*\w+\s+as\s+default\s*};?/,
      `window.__WIDGET__ = ${namedMatch[1]};`,
    );
  }

  const directMatch = result.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (directMatch && !namedMatch) {
    result = result.replace(
      /export\s+default\s+(?:function\s+)?(\w+)/,
      `window.__WIDGET__ = $1`,
    );
  }

  return result.replace(/export\s*{[^}]*};?/g, '');
}

function generateImportMap(deps: Dependencies): string {
  const imports: Record<string, string> = {};
  for (const [pkg, version] of Object.entries(deps)) {
    const url = getCdnUrl(pkg, version, DEFAULT_CDN);
    imports[pkg] = url;
    imports[`${pkg}/`] = `${url}/`;
  }
  return JSON.stringify({ imports }, null, 2);
}

export function renderWidgetHtml(
  compiledJs: string,
  meta: WidgetMeta,
  services: Services,
  options: RenderOptions = {},
): string {
  const {
    title = meta.name,
    theme = 'dark',
    customCss = '',
    props = {},
  } = options;
  const deps = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    ...meta.packages,
    ...options.packages,
  };

  const serviceBridge = generateBrowserServiceBridge(meta.services);
  const widgetCode = extractDefaultExport(compiledJs);
  const importMap = generateImportMap(deps);
  const presetCss = CSS_PRESETS[theme];
  const propsJson = JSON.stringify(props);

  return `<!DOCTYPE html>
<html lang="en" class="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="importmap">${importMap}</script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    ${presetCss}
    ${customCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    ${serviceBridge}
    window.__WIDGET_PROPS__ = ${propsJson};
  </script>
  <script type="module">
    import { createRoot } from "react-dom/client";
    import React from "react";

    ${widgetCode}

    const Component = window.__WIDGET__;
    const root = createRoot(document.getElementById('root'));

    if (Component) {
      root.render(React.createElement(Component, window.__WIDGET_PROPS__));
      window.parent.postMessage({ type: 'ready' }, '*');
    } else {
      root.render(React.createElement('div', { style: { color: 'red', padding: '20px' } },
        React.createElement('h2', null, 'Error: No component found'),
        React.createElement('p', null, 'Make sure your widget has a default export.')
      ));
      window.parent.postMessage({ type: 'error', message: 'No component found' }, '*');
    }

    window.addEventListener('error', (e) => {
      window.parent.postMessage({ type: 'error', message: e.message }, '*');
    });
  </script>
</body>
</html>`;
}

export async function executeBrowserWidget(
  widgetPath: string,
  meta: WidgetMeta,
  services: Services,
  options: RenderOptions = {},
): Promise<BrowserExecutionResult> {
  const startTime = performance.now();

  try {
    const source = await loadWidgetSource(widgetPath);
    const cleanSource = stripMeta(source);
    const config = getPatchworkConfig();
    const cacheDir = join(config.widgetsDir, '.cache');

    const compiled = await compileWidget(cleanSource, meta.packages, cacheDir);

    if (compiled.errors?.length) {
      return {
        success: false,
        error: compiled.errors.join('\n'),
        html: '',
        durationMs: performance.now() - startTime,
      };
    }

    const html = renderWidgetHtml(compiled.code, meta, services, options);

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
