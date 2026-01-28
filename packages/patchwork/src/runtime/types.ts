// Runtime types for Patchwork widget system

export type WidgetRuntime = 'browser' | 'terminal' | 'data';
export type DataOutputFormat = 'json' | 'markdown';

export interface InputSpec {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface ServiceDependency {
  name: string;
  procedures: string[];
}

export interface WidgetMeta {
  name: string;
  description: string;
  inputs: Record<string, InputSpec>;
  runtime: WidgetRuntime;
  output?: DataOutputFormat;
  packages: Record<string, string>;
  services: ServiceDependency[];
}

export interface LoadedWidget {
  path: string;
  meta: WidgetMeta;
  contentHash: string;
}

export interface ServiceProxy {
  [method: string]: (...args: unknown[]) => Promise<unknown>;
}

export interface Services {
  [service: string]: ServiceProxy;
}

export interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface BrowserExecutionResult extends ExecutionResult {
  html: string;
}

export interface TerminalExecutionResult extends ExecutionResult {
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
}

export interface DataExecutionResult extends ExecutionResult {
  formatted: string;
  raw: unknown;
}
