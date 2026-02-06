import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { WidgetMeta, WidgetRuntime } from '../runtime/types';
import { loadWidget, clearMetaCache } from '../runtime/loader';
import { getPatchworkConfig, ensureWidgetsDir } from '../runtime/config';
import { compileWidget } from '../runtime/compiler';
import { getPromptForRuntime, buildGenerationPrompt } from './prompts';
import { validateWidget, type ValidationResult } from './validator';

export interface LLMComplete {
  (
    prompt: string,
    system: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<{ text: string }>;
}

export interface GenerateOptions {
  description: string;
  name?: string;
  runtime: WidgetRuntime;
  save?: boolean;
  llm: LLMComplete;
}

export interface GenerationResult {
  success: boolean;
  code?: string;
  meta?: WidgetMeta;
  path?: string;
  compiledHash?: string;
  validation: ValidationResult;
  errors: string[];
}

export interface WidgetInfo {
  name: string;
  path: string;
  runtime: WidgetRuntime;
  description: string;
  packages: Record<string, string>;
  services: string[];
}

function cleanGeneratedCode(code: string): string {
  let cleaned = code.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:tsx?|javascript|js)?\n?/, '')
      .replace(/\n?```$/, '');
  }
  return cleaned.trim();
}

function inferWidgetName(description: string): string {
  return (
    description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 3)
      .join('-') || 'widget'
  );
}

function getWidgetExtension(runtime: WidgetRuntime): string {
  switch (runtime) {
    case 'terminal':
      return '.ink.tsx';
    case 'data':
      return '.data.ts';
    default:
      return '.tsx';
  }
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

export async function generateWidget(
  options: GenerateOptions,
): Promise<GenerationResult> {
  const { description, runtime, save = false, llm } = options;
  const name = options.name || inferWidgetName(description);
  const errors: string[] = [];

  const systemPrompt = getPromptForRuntime(runtime);
  const userPrompt = buildGenerationPrompt(description, runtime, name);

  let code: string;
  try {
    const result = await llm(userPrompt, systemPrompt, {
      temperature: 0.3,
      maxTokens: 4000,
    });
    code = cleanGeneratedCode(result.text);
  } catch (err) {
    return {
      success: false,
      validation: { valid: false, errors: [] },
      errors: [
        `LLM generation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ],
    };
  }

  const validation = validateWidget(code, runtime);
  if (!validation.valid) {
    errors.push(
      ...validation.errors.map(
        (e) => `${e.code}: ${e.message}${e.line ? ` (line ${e.line})` : ''}`,
      ),
    );
  }

  const rawMeta = extractMetaFromSource(code);
  const meta: WidgetMeta = {
    name: (rawMeta?.name as string) || name,
    description: (rawMeta?.description as string) || description,
    inputs: (rawMeta?.inputs as WidgetMeta['inputs']) || {},
    runtime,
    packages: (rawMeta?.packages as Record<string, string>) || {},
    services: (rawMeta?.services as WidgetMeta['services']) || [],
    output:
      runtime === 'data'
        ? (rawMeta?.output as 'json' | 'markdown') || 'json'
        : undefined,
  };

  let path: string | undefined;
  let compiledHash: string | undefined;

  if (save && validation.valid) {
    try {
      const config = getPatchworkConfig();
      await ensureWidgetsDir();

      const ext = getWidgetExtension(runtime);
      const fileName = `${meta.name}${ext}`;
      path = join(config.widgetsDir, fileName);

      await writeFile(path, code, 'utf-8');

      if (runtime === 'browser') {
        const compiled = await compileWidget(code, {
          platform: 'browser',
          globals: [{ module: 'react', globalName: '__REACT__' }],
          cacheDir: join(config.widgetsDir, '.cache'),
        });
        if (!compiled.errors?.length) {
          compiledHash = compiled.hash;
        } else {
          errors.push(...compiled.errors.map((e) => `Compile: ${e}`));
        }
      }

      clearMetaCache();
    } catch (err) {
      errors.push(
        `Save failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    success: validation.valid && errors.length === 0,
    code,
    meta,
    path,
    compiledHash,
    validation,
    errors,
  };
}

export async function regenerateWidget(
  name: string,
  description: string,
  llm: LLMComplete,
): Promise<GenerationResult> {
  const widgets = await listWidgets();
  const existing = widgets.find((w) => w.name === name);

  if (!existing) {
    return {
      success: false,
      validation: { valid: false, errors: [] },
      errors: [`Widget '${name}' not found`],
    };
  }

  return generateWidget({
    description,
    name,
    runtime: existing.runtime,
    save: true,
    llm,
  });
}

export async function listWidgets(): Promise<WidgetInfo[]> {
  const config = getPatchworkConfig();
  if (!existsSync(config.widgetsDir)) return [];

  const files = await readdir(config.widgetsDir);
  const widgets: WidgetInfo[] = [];

  for (const file of files) {
    if (file.startsWith('.') || file === '.cache') continue;
    const ext = extname(file);
    if (!['.tsx', '.ts'].includes(ext)) continue;

    const filePath = join(config.widgetsDir, file);
    const loadResult = await loadWidget(filePath);

    if (loadResult.widget) {
      const { meta } = loadResult.widget;
      widgets.push({
        name: meta.name,
        path: filePath,
        runtime: meta.runtime,
        description: meta.description,
        packages: meta.packages,
        services: meta.services.map((s) => s.name),
      });
    }
  }

  return widgets;
}

export async function searchWidgets(
  query: string,
  filters?: { runtime?: WidgetRuntime; service?: string },
): Promise<WidgetInfo[]> {
  const widgets = await listWidgets();
  const q = query.toLowerCase();

  return widgets.filter((w) => {
    if (filters?.runtime && w.runtime !== filters.runtime) return false;
    if (filters?.service && !w.services.includes(filters.service)) return false;
    return (
      w.name.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.services.some((s) => s.toLowerCase().includes(q)) ||
      Object.keys(w.packages).some((p) => p.toLowerCase().includes(q))
    );
  });
}

export async function getWidget(
  name: string,
): Promise<{ info: WidgetInfo; code: string } | null> {
  const widgets = await listWidgets();
  const info = widgets.find((w) => w.name === name);
  if (!info) return null;
  const code = await readFile(info.path, 'utf-8');
  return { info, code };
}

export async function deleteWidget(name: string): Promise<boolean> {
  const widgets = await listWidgets();
  const widget = widgets.find((w) => w.name === name);
  if (!widget) return false;

  try {
    await unlink(widget.path);
    clearMetaCache();
    return true;
  } catch {
    return false;
  }
}

export async function importWidget(
  name: string,
  code: string,
  runtime: WidgetRuntime,
): Promise<GenerationResult> {
  const validation = validateWidget(code, runtime);
  const errors: string[] = [];

  if (!validation.valid) {
    errors.push(...validation.errors.map((e) => `${e.code}: ${e.message}`));
    return { success: false, validation, errors };
  }

  const config = getPatchworkConfig();
  await ensureWidgetsDir();

  const ext = getWidgetExtension(runtime);
  const path = join(config.widgetsDir, `${name}${ext}`);

  await writeFile(path, code, 'utf-8');

  let compiledHash: string | undefined;
  if (runtime === 'browser') {
    const compiled = await compileWidget(code, {
      platform: 'browser',
      globals: [{ module: 'react', globalName: '__REACT__' }],
      cacheDir: join(config.widgetsDir, '.cache'),
    });
    if (!compiled.errors?.length) {
      compiledHash = compiled.hash;
    } else {
      errors.push(...compiled.errors);
    }
  }

  const rawMeta = extractMetaFromSource(code);
  const meta: WidgetMeta = {
    name: (rawMeta?.name as string) || name,
    description: (rawMeta?.description as string) || '',
    inputs: (rawMeta?.inputs as WidgetMeta['inputs']) || {},
    runtime,
    packages: (rawMeta?.packages as Record<string, string>) || {},
    services: (rawMeta?.services as WidgetMeta['services']) || [],
  };

  clearMetaCache();

  return {
    success: errors.length === 0,
    code,
    meta,
    path,
    compiledHash,
    validation,
    errors,
  };
}
