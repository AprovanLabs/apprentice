import type { WidgetMeta } from './types.js';

export function extractMeta(source: string): WidgetMeta | undefined {
  const metaStart = source.indexOf('export const meta');
  if (metaStart === -1) return undefined;

  const objectStart = source.indexOf('{', metaStart);
  if (objectStart === -1) return undefined;

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

  if (objectEnd === -1) return undefined;

  const metaStr = source.slice(objectStart, objectEnd);

  try {
    // Convert JS object literal to JSON:
    // 1. Quote unquoted property names (but not already quoted ones)
    // 2. Convert single quotes to double quotes
    // 3. Remove trailing commas
    const normalized = metaStr
      .replace(/([{,]\s*)([a-zA-Z_][\w-]*)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/,\s*([\]}])/g, '$1');

    return JSON.parse(normalized);
  } catch {
    return undefined;
  }
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
  while (
    end < source.length &&
    (source[end] === ';' || source[end] === '\n' || source[end] === ' ')
  ) {
    end++;
  }

  return (source.slice(0, metaStart) + source.slice(end)).trim();
}
