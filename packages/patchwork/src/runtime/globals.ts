// Service Global Injection - Injects services as flat global namespaces
//
// Services are injected directly on globalThis, not nested under __PATCHWORK_SERVICES__.
// Widget code accesses services as: git.branch(), github.repos.get(), etc.

import type { ServiceDependency, ServiceProxy } from './types.js';
import { callProcedure } from '../services/proxy.js';

/**
 * Registry of service backends (for local/testing use)
 */
export type LocalServiceBackend = Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;
export type ServiceRegistry = Record<string, LocalServiceBackend>;

const globalRegistry: ServiceRegistry = {};

/**
 * Register a local service backend (for testing/mocking)
 */
export function registerService(
  name: string,
  backend: LocalServiceBackend,
): void {
  globalRegistry[name] = backend;
}

/**
 * Unregister a service
 */
export function unregisterService(name: string): void {
  delete globalRegistry[name];
}

/**
 * Creates a proxy that enables fluent method chaining for dynamic field access.
 *
 * Allows arbitrary nested property access that resolves to a callable function,
 * e.g., `proxy.foo()`, `proxy.foo.bar()`, `proxy.bar.baz()`.
 */
export function createFieldAccessProxy<T = unknown>(
  namespace: string,
  handler: (
    namespace: string,
    methodPath: string,
    ...args: T[]
  ) => Promise<unknown>,
): Record<string, (...args: T[]) => Promise<unknown>> {
  function createNestedProxy(path: string): (...args: T[]) => Promise<unknown> {
    const fn = (...args: T[]) => handler(namespace, path, ...args);

    return new Proxy(fn, {
      get(_, nestedName: string) {
        if (typeof nestedName === 'symbol') return undefined;
        const newPath = path ? `${path}.${nestedName}` : nestedName;
        return createNestedProxy(newPath);
      },
    }) as (...args: T[]) => Promise<unknown>;
  }

  return new Proxy(
    {},
    {
      get(_, fieldName: string) {
        if (typeof fieldName === 'symbol') return undefined;
        return createNestedProxy(fieldName);
      },
    },
  );
}

/**
 * Create a service proxy for a namespace
 *
 * Checks local registry first (for mocks), then falls back to callProcedure.
 */
function createServiceNamespaceProxy(serviceName: string): ServiceProxy {
  return createFieldAccessProxy(serviceName, async (ns, method, ...args) => {
    // Check local registry first (for mocks/testing)
    const localBackend = globalRegistry[ns];
    if (localBackend) {
      const fn = localBackend[method];
      if (typeof fn === 'function') {
        return fn(...args);
      }
    }

    const result = await callProcedure(ns, method, args);
    if (!result.success) {
      throw new Error(result.error || 'Service call failed');
    }
    return result.data;
  }) as ServiceProxy;
}

/**
 * Inject services as flat globals on globalThis
 */
export function injectServiceGlobals(dependencies: ServiceDependency[]): void {
  for (const dep of dependencies) {
    const proxy = createServiceNamespaceProxy(dep.name);
    (globalThis as Record<string, unknown>)[dep.name] = proxy;
  }
}

/**
 * Remove injected service globals
 */
export function removeServiceGlobals(dependencies: ServiceDependency[]): void {
  for (const dep of dependencies) {
    delete (globalThis as Record<string, unknown>)[dep.name];
  }
}
