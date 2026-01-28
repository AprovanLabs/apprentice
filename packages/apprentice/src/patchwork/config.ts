// Patchwork Configuration - Runtime config from config.yaml

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ServiceConfig, CacheConfig } from '@aprovan/patchwork';
import { config as appConfig } from '../config.js';

export interface PatchworkConfig {
  widgetsDir: string;
  services: Record<string, ServiceConfig>;
  cache: {
    enabled: boolean;
    maxAge?: number;
    services?: Record<string, CacheConfig>;
  };
}

const DEFAULT_WIDGETS_DIR = join(homedir(), '.apprentice', 'widgets');

let cachedConfig: PatchworkConfig | null = null;

export function getPatchworkConfig(): PatchworkConfig {
  if (cachedConfig) return cachedConfig;

  const patchworkSection = (appConfig as Record<string, unknown>)?.patchwork as
    | Record<string, unknown>
    | undefined;

  cachedConfig = {
    widgetsDir: patchworkSection?.widgets_dir
      ? expandPath(patchworkSection.widgets_dir as string)
      : DEFAULT_WIDGETS_DIR,
    services:
      (patchworkSection?.services as Record<string, ServiceConfig>) || {},
    cache: {
      enabled:
        (patchworkSection?.cache as Record<string, unknown>)?.enabled !== false,
      maxAge: (patchworkSection?.cache as Record<string, unknown>)?.max_age as
        | number
        | undefined,
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
  const cacheDir = join(config.widgetsDir, '.cache');

  if (!existsSync(config.widgetsDir)) {
    mkdirSync(config.widgetsDir, { recursive: true });
  }

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  return config.widgetsDir;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
