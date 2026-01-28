import { generateImportMap, type Dependencies } from './compiler';
import {
  type Environment,
  type EnvironmentRenderOptions,
  resolveEnvironment,
  getEnvironmentCss,
  getEnvironmentThemeClasses,
  getEnvironmentHeadContent,
  mergeEnvironmentDependencies,
} from './environments';

export interface RenderOptions {
  /** Page title */
  title?: string;
  /** CDN URL for dependencies (default: "https://esm.sh") */
  cdnUrl?: string;
  /** Dependencies for import map generation */
  dependencies?: Dependencies;
  /** Additional CSS to inject */
  customCss?: string;
  /** Additional head content (scripts, links, etc.) */
  headContent?: string;
  /** Root element ID (default: "root") */
  rootId?: string;
  /** HTML class for the root <html> element */
  htmlClass?: string;
  /** Body class */
  bodyClass?: string;
}

function extractDefaultExport(code: string): string {
  let transformed = code;

  // Handle 'export { ComponentName as default }'
  const namedDefaultMatch = transformed.match(
    /export\s*{\s*(\w+)\s+as\s+default\s*}/,
  );
  if (namedDefaultMatch) {
    transformed = transformed.replace(
      /export\s*{\s*\w+\s+as\s+default\s*};?/,
      `window.__WIDGET_COMPONENT__ = ${namedDefaultMatch[1]};`,
    );
  }

  // Handle 'export default function ComponentName' or 'export default ComponentName'
  const directDefaultMatch = transformed.match(
    /export\s+default\s+(?:function\s+)?(\w+)/,
  );
  if (directDefaultMatch && !namedDefaultMatch) {
    transformed = transformed.replace(
      /export\s+default\s+(?:function\s+)?(\w+)/,
      `window.__WIDGET_COMPONENT__ = $1`,
    );
  }

  // Remove any remaining export statements
  transformed = transformed.replace(/export\s*{[^}]*};?/g, '');

  return transformed;
}

const DEFAULT_CDN_URL = 'https://esm.sh';

export function renderToHtml(
  compiledJs: string,
  options: RenderOptions = {},
): string {
  const {
    title = 'Widget',
    cdnUrl = DEFAULT_CDN_URL,
    dependencies = {},
    customCss = '',
    headContent = '',
    rootId = 'root',
    htmlClass = '',
    bodyClass = '',
  } = options;

  // Ensure React is always included
  const allDeps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    ...dependencies,
  };

  // Generate import map
  const importMap = generateImportMap(allDeps, cdnUrl);
  const importMapScript = `<script type="importmap">${JSON.stringify(
    importMap,
    null,
    2,
  )}</script>`;

  // Transform code
  const widgetCode = extractDefaultExport(compiledJs);

  // Build CSS
  const styleTag = customCss ? `<style>${customCss}</style>` : '';

  // Mount script - React is already imported by the widget code
  const mountScript = `
import { createRoot } from "react-dom/client";

const Component = window.__WIDGET_COMPONENT__;
if (Component) {
  const root = createRoot(document.getElementById('${rootId}'));
  root.render(React.createElement(Component));
} else {
  document.getElementById('${rootId}').innerHTML = '<div style="color: red; padding: 20px;"><h2>Error: No component found</h2><p>Make sure your widget has a default export.</p></div>';
}`;

  const htmlClassAttr = htmlClass ? ` class="${htmlClass}"` : '';
  const bodyClassAttr = bodyClass ? ` class="${bodyClass}"` : '';

  return `<!DOCTYPE html>
<html lang="en"${htmlClassAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${importMapScript}
  ${headContent}
  ${styleTag}
</head>
<body${bodyClassAttr}>
  <div id="${rootId}"></div>
  <script type="module">
${widgetCode}

// Mount the component
${mountScript}
  </script>
</body>
</html>`;
}

export function renderWithEnvironment(
  compiledJs: string,
  options: EnvironmentRenderOptions,
): string {
  const {
    environment: envId,
    theme,
    additionalDependencies,
    additionalCss = '',
    additionalHeadContent = '',
    title = 'Widget',
    rootId = 'root',
    cdnUrl = DEFAULT_CDN_URL,
  } = options;

  // Resolve the environment
  const env = resolveEnvironment(envId);

  // Get environment CSS and theme classes
  const envCss = getEnvironmentCss(env, theme);
  const { htmlClass, bodyClass } = getEnvironmentThemeClasses(env, theme);

  // Get environment head content
  const envHeadContent = getEnvironmentHeadContent(env);

  // Merge dependencies
  const allDeps = mergeEnvironmentDependencies(env, additionalDependencies);

  // Combine CSS
  const fullCss = [envCss, additionalCss].filter(Boolean).join('\n');

  // Combine head content
  const fullHeadContent = [envHeadContent, additionalHeadContent]
    .filter(Boolean)
    .join('\n  ');

  return renderToHtml(compiledJs, {
    title,
    cdnUrl,
    dependencies: allDeps,
    customCss: fullCss,
    headContent: fullHeadContent,
    rootId,
    htmlClass,
    bodyClass,
  });
}

export function renderMinimal(
  compiledJs: string,
  options: Omit<EnvironmentRenderOptions, 'environment'> = {},
): string {
  return renderWithEnvironment(compiledJs, {
    ...options,
    environment: 'minimal@latest',
  });
}

export function renderBare(
  compiledJs: string,
  options: Omit<EnvironmentRenderOptions, 'environment'> = {},
): string {
  return renderWithEnvironment(compiledJs, {
    ...options,
    environment: 'bare@latest',
  });
}

export { resolveEnvironment, getEnvironmentCss } from './environments';
export type { Environment, EnvironmentRenderOptions } from './environments';
