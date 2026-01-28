// Service Proxy - Routes procedure calls from widgets to configured backends

import type {
  ServiceConfig,
  ServiceResult,
  ServiceBackend,
  CacheEntry,
  CacheConfig,
} from './types.js';
import { createMcpBackend } from './backends/mcp.js';
import { createHttpBackend } from './backends/http.js';
import { createShellBackend } from './backends/shell.js';
import { createStoreBackend } from './backends/store.js';
import { getPatchworkConfig } from '../runtime/config.js';

const backends = new Map<string, ServiceBackend>();
const cache = new Map<string, CacheEntry>();
const cacheConfig = new Map<string, CacheConfig>();
const MAX_CACHE_SIZE = 1000;

function getCacheKey(
  service: string,
  procedure: string,
  args: unknown[],
): string {
  return `${service}:${procedure}:${JSON.stringify(args)}`;
}

function evictOldestCache(): void {
  if (cache.size < MAX_CACHE_SIZE) return;
  const oldest = Array.from(cache.entries())
    .sort(([, a], [, b]) => a.expiresAt - b.expiresAt)
    .slice(0, Math.floor(MAX_CACHE_SIZE * 0.2));
  for (const [key] of oldest) cache.delete(key);
}

function getFromCache(key: string): ServiceResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCache(key: string, result: ServiceResult, ttl: number): void {
  evictOldestCache();
  cache.set(key, { result, expiresAt: Date.now() + ttl * 1000 });
}

async function getOrCreateBackend(
  serviceName: string,
): Promise<ServiceBackend> {
  const existing = backends.get(serviceName);
  if (existing) return existing;

  const config = getPatchworkConfig();
  const serviceConfig = config.services[serviceName] as
    | ServiceConfig
    | undefined;

  if (!serviceConfig) {
    throw new Error(`Service '${serviceName}' not configured`);
  }

  let backend: ServiceBackend;
  switch (serviceConfig.backend) {
    case 'mcp':
      backend = await createMcpBackend(serviceName, serviceConfig);
      break;
    case 'http':
      backend = await createHttpBackend(serviceName, serviceConfig);
      break;
    case 'shell':
      backend = await createShellBackend(serviceName, serviceConfig);
      break;
    case 'store':
      backend = await createStoreBackend(serviceName, serviceConfig);
      break;
    default:
      throw new Error(`Unknown backend type: ${serviceConfig.backend}`);
  }

  backends.set(serviceName, backend);
  return backend;
}

export async function callProcedure(
  service: string,
  procedure: string,
  args: unknown[] = [],
  options: { bypassCache?: boolean } = {},
): Promise<ServiceResult> {
  const cacheKey = getCacheKey(service, procedure, args);
  const ttlConfig = cacheConfig.get(service);

  if (!options.bypassCache && ttlConfig) {
    const cached = getFromCache(cacheKey);
    if (cached) return cached;
  }

  const backend = await getOrCreateBackend(service);
  const result = await backend.call(procedure, args);

  if (result.success && ttlConfig) {
    setCache(cacheKey, result, ttlConfig.ttl);
  }

  return result;
}

export function configureCacheTtl(service: string, ttl: number): void {
  cacheConfig.set(service, { ttl });
}

export function invalidateCache(service?: string): void {
  if (service) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${service}:`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

export function getCacheStats(): { size: number; services: string[] } {
  const services = new Set<string>();
  for (const key of cache.keys()) {
    const service = key.split(':')[0];
    if (service) services.add(service);
  }
  return { size: cache.size, services: [...services] };
}

export async function disposeBackends(): Promise<void> {
  const disposals = Array.from(backends.values())
    .filter((b) => b.dispose)
    .map((b) => b.dispose!());
  await Promise.all(disposals);
  backends.clear();
  cache.clear();
}

export function createServiceProxy(
  serviceName: string,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return new Proxy(
    {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
    {
      get(_, method: string) {
        if (typeof method !== 'string') return undefined;
        return async (...args: unknown[]): Promise<unknown> => {
          const result = await callProcedure(serviceName, method, args);
          if (!result.success)
            throw new Error(result.error || 'Service call failed');
          return result.data;
        };
      },
    },
  );
}

export interface BatchCall {
  service: string;
  procedure: string;
  args?: unknown[];
  bypassCache?: boolean;
}

export async function batchCall(calls: BatchCall[]): Promise<ServiceResult[]> {
  const grouped = new Map<string, { indices: number[]; calls: BatchCall[] }>();

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;
    if (!grouped.has(call.service))
      grouped.set(call.service, { indices: [], calls: [] });
    const group = grouped.get(call.service)!;
    group.indices.push(i);
    group.calls.push(call);
  }

  const results: ServiceResult[] = new Array(calls.length);
  const promises = Array.from(grouped.entries()).map(async ([, group]) => {
    const groupResults = await Promise.all(
      group.calls.map((c) =>
        callProcedure(c.service, c.procedure, c.args || [], {
          bypassCache: c.bypassCache,
        }),
      ),
    );
    for (let i = 0; i < group.indices.length; i++) {
      results[group.indices[i]!] = groupResults[i]!;
    }
  });

  await Promise.all(promises);
  return results;
}

export function initializeFromConfig(): void {
  const config = getPatchworkConfig();
  const cacheServices = config.cache?.services;
  if (!cacheServices) return;

  for (const [service, settings] of Object.entries(cacheServices)) {
    if (settings?.ttl) {
      configureCacheTtl(service, settings.ttl);
    }
  }
}
