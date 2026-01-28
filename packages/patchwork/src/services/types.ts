// Service Types - Core types for the service proxy system

export interface ServiceConfig {
  backend: 'mcp' | 'http' | 'shell' | 'store';
  server?: string;
  spec?: string;
  cwd?: string;
  auth?: {
    type: 'bearer' | 'api-key' | 'basic';
    env: string;
    header?: string;
  };
}

export interface CacheConfig {
  ttl: number;
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
  durationMs: number;
}

export interface ServiceBackend {
  name: string;
  call(procedure: string, args: unknown[]): Promise<ServiceResult>;
  dispose?(): Promise<void>;
}

export interface CacheEntry {
  result: ServiceResult;
  expiresAt: number;
}

export interface BackendFactory {
  create(name: string, config: ServiceConfig): Promise<ServiceBackend>;
}
