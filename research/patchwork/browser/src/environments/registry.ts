import type { Environment, EnvironmentRegistry } from './types';

class EnvironmentRegistryImpl implements EnvironmentRegistry {
  private environments = new Map<string, Environment>();

  register(env: Environment): void {
    if (this.environments.has(env.id)) {
      console.warn(
        `Environment '${env.id}' already registered, overwriting...`,
      );
    }
    this.environments.set(env.id, env);
  }

  get(id: string): Environment | undefined {
    return this.environments.get(id);
  }

  list(): Environment[] {
    return Array.from(this.environments.values());
  }

  has(id: string): boolean {
    return this.environments.has(id);
  }

  clear(): void {
    this.environments.clear();
  }
}

export const environmentRegistry = new EnvironmentRegistryImpl();

export function resolveEnvironment(id: string): Environment {
  const env = environmentRegistry.get(id);
  if (!env) {
    const available = environmentRegistry.list().map((e) => e.id);
    throw new Error(
      `Environment '${id}' not found. Available: ${
        available.join(', ') || 'none'
      }`,
    );
  }
  return env;
}

export function getEnvironmentCss(
  env: Environment,
  themeName?: string,
): string {
  const cssBlocks: string[] = [];

  // Base CSS
  if (env.baseCss?.content) {
    cssBlocks.push(env.baseCss.content);
  }

  // Theme CSS
  const theme =
    env.themes?.find((t) => t.name === (themeName || env.defaultTheme)) ||
    env.themes?.[0];
  if (theme?.css) {
    cssBlocks.push(theme.css);
  }

  return cssBlocks.join('\n');
}

export function getEnvironmentThemeClasses(
  env: Environment,
  themeName?: string,
): { htmlClass: string; bodyClass: string } {
  const theme =
    env.themes?.find((t) => t.name === (themeName || env.defaultTheme)) ||
    env.themes?.[0];

  return {
    htmlClass: theme?.htmlClass || '',
    bodyClass: theme?.bodyClass || '',
  };
}

export function getEnvironmentHeadContent(env: Environment): string {
  const blocks: string[] = [];

  // CDN imports
  if (env.cdnImports) {
    for (const imp of env.cdnImports) {
      switch (imp.type) {
        case 'script':
          const scriptAttrs = imp.attributes
            ? Object.entries(imp.attributes)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ')
            : '';
          blocks.push(`<script src="${imp.url}" ${scriptAttrs}></script>`);
          break;
        case 'stylesheet':
          blocks.push(`<link rel="stylesheet" href="${imp.url}">`);
          break;
        case 'preload':
          const preloadAs = imp.attributes?.as || 'script';
          blocks.push(
            `<link rel="preload" href="${imp.url}" as="${preloadAs}">`,
          );
          break;
      }
    }
  }

  // Head content blocks
  if (env.headContent) {
    for (const hc of env.headContent) {
      blocks.push(hc.content);
    }
  }

  return blocks.join('\n  ');
}

export function mergeEnvironmentDependencies(
  env: Environment,
  additional?: Record<string, string>,
): Record<string, string> {
  return {
    ...env.dependencies,
    ...additional,
  };
}
