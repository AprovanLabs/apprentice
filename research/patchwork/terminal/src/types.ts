export interface WidgetMeta {
  name?: string;
  description?: string;
  packages?: Record<string, string>;
  services?: string[];
}

export interface CompilationResult {
  code: string;
  hash: string;
  compilationTimeMs: number;
  fromCache: boolean;
  meta?: WidgetMeta;
  errors?: string[];
}

export interface ServiceProxy {
  [method: string]: (...args: unknown[]) => Promise<unknown>;
}

export interface Services {
  [service: string]: ServiceProxy;
}

export interface WidgetContext {
  services: Services;
}
