// HTTP/OpenAPI Backend - Routes procedure calls to HTTP APIs

import type { ServiceConfig, ServiceResult, ServiceBackend } from '../types.js';

interface OpenApiSpec {
  paths: Record<
    string,
    Record<
      string,
      { operationId?: string; parameters?: unknown[]; requestBody?: unknown }
    >
  >;
  servers?: Array<{ url: string }>;
}

interface ResolvedEndpoint {
  method: string;
  path: string;
  baseUrl: string;
}

const specCache = new Map<string, OpenApiSpec>();

function inferHttpMethod(procedure: string): string {
  const lower = procedure.toLowerCase();
  if (
    lower.startsWith('get') ||
    lower.startsWith('list') ||
    lower.startsWith('fetch')
  )
    return 'GET';
  if (
    lower.startsWith('create') ||
    lower.startsWith('post') ||
    lower.startsWith('add')
  )
    return 'POST';
  if (
    lower.startsWith('update') ||
    lower.startsWith('put') ||
    lower.startsWith('set')
  )
    return 'PUT';
  if (lower.startsWith('patch')) return 'PATCH';
  if (lower.startsWith('delete') || lower.startsWith('remove')) return 'DELETE';
  return 'POST';
}

function procedureToPath(procedure: string): string {
  return (
    '/' +
    procedure
      .replace(/\./g, '/')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
  );
}

async function fetchSpec(specUrl: string): Promise<OpenApiSpec | null> {
  const cached = specCache.get(specUrl);
  if (cached) return cached;

  try {
    const res = await fetch(specUrl);
    if (!res.ok) return null;
    const spec = (await res.json()) as OpenApiSpec;
    specCache.set(specUrl, spec);
    return spec;
  } catch {
    return null;
  }
}

function resolveEndpoint(
  procedure: string,
  spec: OpenApiSpec | null,
  baseUrl?: string,
): ResolvedEndpoint {
  if (spec) {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, def] of Object.entries(methods)) {
        if (def.operationId === procedure) {
          return {
            method: method.toUpperCase(),
            path,
            baseUrl: baseUrl || spec.servers?.[0]?.url || '',
          };
        }
      }
    }
  }

  return {
    method: inferHttpMethod(procedure),
    path: procedureToPath(procedure),
    baseUrl: baseUrl || '',
  };
}

function getAuthHeader(config: ServiceConfig): Record<string, string> {
  if (!config.auth) return {};

  const value = process.env[config.auth.env];
  if (!value) return {};

  switch (config.auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${value}` };
    case 'api-key':
      return { [config.auth.header || 'X-API-Key']: value };
    case 'basic':
      return {
        Authorization: `Basic ${Buffer.from(value).toString('base64')}`,
      };
    default:
      return {};
  }
}

function substitutePathParams(
  path: string,
  args: Record<string, unknown>,
): { path: string; remaining: Record<string, unknown> } {
  const remaining = { ...args };
  const substituted = path.replace(/\{(\w+)\}/g, (_, key) => {
    const val = remaining[key];
    delete remaining[key];
    return String(val ?? '');
  });
  return { path: substituted, remaining };
}

export async function createHttpBackend(
  name: string,
  config: ServiceConfig,
): Promise<ServiceBackend> {
  const spec = config.spec ? await fetchSpec(config.spec) : null;
  const baseUrl =
    (config as { baseUrl?: string }).baseUrl || spec?.servers?.[0]?.url || '';

  if (!baseUrl && !spec) {
    throw new Error(
      `HTTP backend '${name}' requires baseUrl or spec configuration`,
    );
  }

  return {
    name,

    async call(procedure: string, args: unknown[]): Promise<ServiceResult> {
      const startTime = performance.now();

      try {
        const endpoint = resolveEndpoint(procedure, spec, baseUrl);
        const argObj =
          args.length === 1 && typeof args[0] === 'object'
            ? (args[0] as Record<string, unknown>)
            : {};
        const { path: finalPath, remaining } = substitutePathParams(
          endpoint.path,
          argObj,
        );

        const url = new URL(finalPath, endpoint.baseUrl);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...getAuthHeader(config),
        };

        let body: string | undefined;
        if (endpoint.method === 'GET' || endpoint.method === 'HEAD') {
          for (const [k, v] of Object.entries(remaining)) {
            if (v !== undefined) url.searchParams.set(k, String(v));
          }
        } else if (Object.keys(remaining).length > 0) {
          body = JSON.stringify(remaining);
        }

        const res = await fetch(url.toString(), {
          method: endpoint.method,
          headers,
          body,
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          return {
            success: false,
            error: `Rate limited. Retry after ${
              retryAfter || 'unknown'
            } seconds`,
            durationMs: performance.now() - startTime,
          };
        }

        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
            durationMs: performance.now() - startTime,
          };
        }

        const contentType = res.headers.get('Content-Type') || '';
        const data = contentType.includes('json')
          ? await res.json()
          : await res.text();

        return {
          success: true,
          data,
          durationMs: performance.now() - startTime,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - startTime,
        };
      }
    },
  };
}
