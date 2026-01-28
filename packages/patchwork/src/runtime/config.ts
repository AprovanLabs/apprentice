// Patchwork Configuration - Runtime config

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ServiceConfig, CacheConfig } from '../services/types.js';

export interface PatchworkConfig {
  widgetsDir: string;
  services: Record<string, ServiceConfig>;
  cache: {
    enabled: boolean;
    maxAge?: number;
    services?: Record<string, CacheConfig>;
  };
}

const DEFAULT_WIDGETS_DIR = join(homedir(), '.patchwork', 'widgets');

let cachedConfig: PatchworkConfig | null = null;

export function setPatchworkConfig(config: Partial<PatchworkConfig>): void {
  cachedConfig = {
    widgetsDir: config.widgetsDir || DEFAULT_WIDGETS_DIR,
    services: config.services || {},
    cache: {
      enabled: config.cache?.enabled !== false,
      maxAge: config.cache?.maxAge,
      services: config.cache?.services,
    },
  };
}

export function getPatchworkConfig(): PatchworkConfig {
  if (cachedConfig) return cachedConfig;

  // Default config
  cachedConfig = {
    widgetsDir: DEFAULT_WIDGETS_DIR,
    services: {},
    cache: {
      enabled: true,
    },
  };

  return cachedConfig;
}

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

export function ensureWidgetsDir(): string {
  const config = getPatchworkConfig();
  const dir = expandPath(config.widgetsDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resetConfig(): void {
  cachedConfig = null;
}
