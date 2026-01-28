// Widget Loader - Extracts and validates meta exports from widget files

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { WidgetMeta, LoadedWidget, WidgetRuntime } from './types.js';

const metaCache = new Map<string, { hash: string; meta: WidgetMeta }>();

export function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function extractMetaFromSource(source: string): Record<string, unknown> | null {
  const metaStart = source.indexOf('export const meta');
  if (metaStart === -1) return null;

  const objectStart = source.indexOf('{', metaStart);
  if (objectStart === -1) return null;

  let depth = 0;
  let objectEnd = -1;

  for (let i = objectStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        objectEnd = i + 1;
        break;
      }
    }
  }

  if (objectEnd === -1) return null;

  const metaStr = source.slice(objectStart, objectEnd);

  try {
    const normalized = metaStr
      .replace(/([{,]\s*)([a-zA-Z_][\w-]*)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/,\s*([\]}])/g, '$1');

    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function inferRuntime(filePath: string): WidgetRuntime | null {
  const ext = extname(filePath);
  if (filePath.endsWith('.ink.tsx') || filePath.endsWith('.ink.ts')) {
    return 'terminal';
  }
  if (filePath.endsWith('.data.ts') || filePath.endsWith('.data.js')) {
    return 'data';
  }
  if (ext === '.tsx' || ext === '.jsx') {
    return 'browser';
  }
  return null;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateMeta(
  raw: Record<string, unknown>,
  filePath: string,
): { meta: WidgetMeta; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const inferredRuntime = inferRuntime(filePath);

  if (!raw.name || typeof raw.name !== 'string') {
    errors.push({
      field: 'name',
      message: "Required string field 'name' missing",
    });
  }

  if (!raw.description || typeof raw.description !== 'string') {
    errors.push({
      field: 'description',
      message: "Required string field 'description' missing",
    });
  }

  if (!raw.inputs || typeof raw.inputs !== 'object') {
    errors.push({
      field: 'inputs',
      message: "Required object field 'inputs' missing",
    });
  }

  const runtime = (raw.runtime as WidgetRuntime) || inferredRuntime;
  if (!runtime || !['browser', 'terminal', 'data'].includes(runtime)) {
    errors.push({
      field: 'runtime',
      message: `Invalid runtime '${raw.runtime}'. Must be 'browser', 'terminal', or 'data'`,
    });
  }

  if (runtime === 'data') {
    if (raw.output && !['json', 'markdown'].includes(raw.output as string)) {
      errors.push({
        field: 'output',
        message: `Invalid output format '${raw.output}'. Must be 'json' or 'markdown'`,
      });
    }
  }

  if (raw.packages && typeof raw.packages !== 'object') {
    errors.push({
      field: 'packages',
      message: "Field 'packages' must be an object",
    });
  }

  if (raw.services) {
    if (!Array.isArray(raw.services)) {
      errors.push({
        field: 'services',
        message: "Field 'services' must be an array",
      });
    } else {
      for (let i = 0; i < raw.services.length; i++) {
        const svc = raw.services[i] as Record<string, unknown>;
        if (!svc.name || typeof svc.name !== 'string') {
          errors.push({
            field: `services[${i}].name`,
            message: 'Service name required',
          });
        }
        if (!Array.isArray(svc.procedures)) {
          errors.push({
            field: `services[${i}].procedures`,
            message: 'Service procedures must be an array',
          });
        }
      }
    }
  }

  const meta: WidgetMeta = {
    name: (raw.name as string) || 'unnamed',
    description: (raw.description as string) || '',
    inputs: (raw.inputs as WidgetMeta['inputs']) || {},
    runtime: runtime || 'browser',
    output:
      runtime === 'data'
        ? (raw.output as 'json' | 'markdown') || 'json'
        : undefined,
    packages: (raw.packages as Record<string, string>) || {},
    services: (raw.services as WidgetMeta['services']) || [],
  };

  return { meta, errors };
}

export interface LoadResult {
  widget?: LoadedWidget;
  errors: ValidationError[];
}

export async function loadWidget(filePath: string): Promise<LoadResult> {
  if (!existsSync(filePath)) {
    return {
      errors: [
        { field: 'path', message: `Widget file not found: ${filePath}` },
      ],
    };
  }

  const content = await readFile(filePath, 'utf-8');
  const contentHash = generateContentHash(content);

  const cached = metaCache.get(filePath);
  if (cached && cached.hash === contentHash) {
    return {
      widget: { path: filePath, meta: cached.meta, contentHash },
      errors: [],
    };
  }

  const rawMeta = extractMetaFromSource(content);
  if (!rawMeta) {
    return {
      errors: [
        { field: 'meta', message: "No 'export const meta' found in widget" },
      ],
    };
  }

  const { meta, errors } = validateMeta(rawMeta, filePath);

  if (errors.length > 0) {
    return { errors };
  }

  metaCache.set(filePath, { hash: contentHash, meta });

  return { widget: { path: filePath, meta, contentHash }, errors: [] };
}

export async function loadWidgetSource(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export function clearMetaCache(): void {
  metaCache.clear();
}

export function stripMeta(source: string): string {
  const metaStart = source.indexOf('export const meta');
  if (metaStart === -1) return source;

  const objectStart = source.indexOf('{', metaStart);
  if (objectStart === -1) return source;

  let depth = 0;
  let objectEnd = -1;

  for (let i = objectStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        objectEnd = i + 1;
        break;
      }
    }
  }

  if (objectEnd === -1) return source;

  let end = objectEnd;
  while (end < source.length && /[;\n\s]/.test(source[end]!)) {
    end++;
  }

  return (source.slice(0, metaStart) + source.slice(end)).trim();
}
