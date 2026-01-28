// Service Global Injection - Creates service proxies for widget execution

import type { Services, ServiceProxy, ServiceDependency } from './types.js';

export type ServiceBackend = Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;
export type ServiceRegistry = Record<string, ServiceBackend>;

const globalRegistry: ServiceRegistry = {};

export function registerService(name: string, backend: ServiceBackend): void {
  globalRegistry[name] = backend;
}

export function unregisterService(name: string): void {
  delete globalRegistry[name];
}

export function getRegisteredServices(): string[] {
  return Object.keys(globalRegistry);
}

function createServiceProxy(
  serviceName: string,
  procedures: string[],
  registry: ServiceRegistry,
  strict = false,
): ServiceProxy {
  const backend = registry[serviceName];

  return new Proxy({} as ServiceProxy, {
    get(_, method: string) {
      if (typeof method !== 'string') return undefined;

      return async (...args: unknown[]): Promise<unknown> => {
        if (!backend) {
          throw new Error(`Service '${serviceName}' not registered`);
        }

        if (strict && !procedures.includes(method)) {
          throw new Error(
            `Procedure '${method}' not declared for service '${serviceName}'. ` +
              `Declared: ${procedures.join(', ')}`,
          );
        }

        const fn = backend[method];
        if (typeof fn !== 'function') {
          throw new Error(`Procedure '${serviceName}.${method}' not found`);
        }

        return fn(...args);
      };
    },
  });
}

export function createServicesForWidget(
  dependencies: ServiceDependency[],
  registry: ServiceRegistry = globalRegistry,
  strict = false,
): Services {
  const services: Services = {};

  for (const dep of dependencies) {
    services[dep.name] = createServiceProxy(
      dep.name,
      dep.procedures,
      registry,
      strict,
    );
  }

  return services;
}

export function generateServiceGlobalsCode(
  dependencies: ServiceDependency[],
): string {
  if (dependencies.length === 0) return '';

  const serviceNames = dependencies.map((d) => d.name);
  return `const { ${serviceNames.join(
    ', ',
  )} } = globalThis.__PATCHWORK_SERVICES__ || {};`;
}

export function generateBrowserServiceBridge(
  dependencies: ServiceDependency[],
): string {
  if (dependencies.length === 0) return '';

  const services = dependencies.map((dep) => {
    const methods = dep.procedures
      .map(
        (proc) => `
      ${proc}: (...args) => new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const handler = (e) => {
          if (e.data?.type === 'service-response' && e.data?.id === id) {
            window.removeEventListener('message', handler);
            if (e.data.error) reject(new Error(e.data.error));
            else resolve(e.data.result);
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({ type: 'service-call', id, service: '${dep.name}', method: '${proc}', args }, '*');
      })`,
      )
      .join(',');

    return `  ${dep.name}: {${methods}\n  }`;
  });

  return `window.__PATCHWORK_SERVICES__ = {\n${services.join(',\n')}\n};`;
}

export interface ServiceCallMessage {
  type: 'service-call';
  id: string;
  service: string;
  method: string;
  args: unknown[];
}

export interface ServiceResponseMessage {
  type: 'service-response';
  id: string;
  result?: unknown;
  error?: string;
}

export function createMessageHandler(
  services: Services,
  postResponse: (msg: ServiceResponseMessage) => void,
): (msg: ServiceCallMessage) => Promise<void> {
  return async (msg) => {
    if (msg.type !== 'service-call') return;

    try {
      const service = services[msg.service];
      if (!service) {
        postResponse({
          type: 'service-response',
          id: msg.id,
          error: `Service '${msg.service}' not available`,
        });
        return;
      }

      const method = service[msg.method];
      if (typeof method !== 'function') {
        postResponse({
          type: 'service-response',
          id: msg.id,
          error: `Method '${msg.method}' not found`,
        });
        return;
      }

      const result = await method(...msg.args);
      postResponse({ type: 'service-response', id: msg.id, result });
    } catch (err) {
      postResponse({
        type: 'service-response',
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
