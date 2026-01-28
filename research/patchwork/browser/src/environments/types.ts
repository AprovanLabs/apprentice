import type { Dependencies } from '../compiler';

export interface EnvironmentCss {
  content: string;
  description?: string;
}

export interface EnvironmentHeadContent {
  content: string;
  description?: string;
}

export interface EnvironmentTheme {
  name: string;
  htmlClass?: string;
  bodyClass?: string;
  css?: string;
}

export interface Environment {
  id: string;
  name: string;
  description: string;
  version: string;
  dependencies: Dependencies;
  baseCss?: EnvironmentCss;
  themes?: EnvironmentTheme[];
  defaultTheme?: string;
  headContent?: EnvironmentHeadContent[];
  cdnImports?: Array<{
    type: 'script' | 'stylesheet' | 'preload';
    url: string;
    attributes?: Record<string, string>;
  }>;
  esbuildConfig?: {
    external?: string[];
    define?: Record<string, string>;
  };
}

export interface EnvironmentRenderOptions {
  environment: string;
  theme?: string;
  additionalDependencies?: Dependencies;
  additionalCss?: string;
  additionalHeadContent?: string;
  title?: string;
  rootId?: string;
  cdnUrl?: string;
}

export interface EnvironmentSandboxOptions extends EnvironmentRenderOptions {
  services?: Array<{
    name: string;
    methods: Record<string, (...args: unknown[]) => unknown>;
  }>;
  onMessage?: (message: unknown) => void;
  onError?: (error: Error) => void;
}

export interface EnvironmentRegistry {
  register(env: Environment): void;
  get(id: string): Environment | undefined;
  list(): Environment[];
  has(id: string): boolean;
}
