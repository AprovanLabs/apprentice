// Store Backend - Shared state store as a service backend

import type { ServiceConfig, ServiceResult, ServiceBackend } from '../types.js';
import { getStore } from '../../storage/index.js';

const subscriptions = new Map<string, Map<string, () => void>>();

export async function createStoreBackend(
  name: string,
  _config: ServiceConfig,
): Promise<ServiceBackend> {
  const store = getStore();

  return {
    name,

    async call(procedure: string, args: unknown[]): Promise<ServiceResult> {
      const startTime = performance.now();

      try {
        switch (procedure) {
          case 'get': {
            const key = args[0] as string;
            return {
              success: true,
              data: store.get(key),
              durationMs: performance.now() - startTime,
            };
          }

          case 'set': {
            const key = args[0] as string;
            const value = args[1];
            store.set(key, value);
            return { success: true, durationMs: performance.now() - startTime };
          }

          case 'delete': {
            const key = args[0] as string;
            const deleted = store.delete(key);
            return {
              success: true,
              data: deleted,
              durationMs: performance.now() - startTime,
            };
          }

          case 'has': {
            const key = args[0] as string;
            return {
              success: true,
              data: store.has(key),
              durationMs: performance.now() - startTime,
            };
          }

          case 'keys': {
            return {
              success: true,
              data: store.keys(),
              durationMs: performance.now() - startTime,
            };
          }

          case 'snapshot': {
            return {
              success: true,
              data: store.snapshot(),
              durationMs: performance.now() - startTime,
            };
          }

          default:
            return {
              success: false,
              error: `Unknown procedure: ${procedure}`,
              durationMs: performance.now() - startTime,
            };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - startTime,
        };
      }
    },

    async dispose(): Promise<void> {
      const subs = subscriptions.get(name);
      if (subs) {
        for (const unsub of subs.values()) unsub();
        subs.clear();
        subscriptions.delete(name);
      }
    },
  };
}
