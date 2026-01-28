import type { Metadata } from './types';

/**
 * Flatten nested metadata object to dot-notation key-value pairs
 * Used for database storage and querying
 *
 * @example
 * ```typescript
 * flattenMetadata({
 *   git: { sha: "abc123", branch: "main" },
 *   filesystem: { size_bytes: 1024 }
 * })
 * // Returns:
 * // {
 * //   "git.sha": "abc123",
 * //   "git.branch": "main",
 * //   "filesystem.size_bytes": 1024
 * // }
 * ```
 */
export function flattenMetadata(
  metadata: Metadata,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      // Skip null/undefined values
      continue;
    } else if (Array.isArray(value)) {
      // Store arrays as JSON strings
      result[fullKey] = JSON.stringify(value);
    } else if (typeof value === 'object' && !isDate(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flattenMetadata(value as Metadata, fullKey));
    } else {
      // Store primitive values as strings
      result[fullKey] = String(value);
    }
  }

  return result;
}

/**
 * Expand dot-notation keys to nested metadata structure
 * Used for API responses and in-memory processing
 *
 * @example
 * ```typescript
 * expandMetadata({
 *   "git.sha": "abc123",
 *   "git.branch": "main",
 *   "filesystem.size_bytes": "1024"
 * })
 * // Returns:
 * // {
 * //   git: { sha: "abc123", branch: "main" },
 * //   filesystem: { size_bytes: "1024" }
 * // }
 * ```
 */
export function expandMetadata(flat: Record<string, string>): Metadata {
  const result: Metadata = {};

  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: any = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1]!;

    // Try to parse JSON arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        (current as any)[lastPart] = JSON.parse(value);
        continue;
      } catch {
        // Not valid JSON, store as string
      }
    }

    // Try to parse numbers
    if (!isNaN(Number(value)) && value !== '') {
      (current as any)[lastPart] = Number(value);
      continue;
    }

    // Try to parse booleans
    if (value === 'true' || value === 'false') {
      (current as any)[lastPart] = value === 'true';
      continue;
    }

    // Store as string
    (current as any)[lastPart] = value;
  }

  return result;
}

/**
 * Check if a value is a Date object
 */
function isDate(value: unknown): boolean {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Convert metadata to a flat string for FTS indexing
 * Used by FTS triggers to create searchable text
 *
 * @example
 * ```typescript
 * metadataToSearchText({
 *   git: { sha: "abc123", branch: "main" },
 *   script: { description: "Deploy script" }
 * })
 * // Returns: "git.sha:abc123 git.branch:main script.description:Deploy script"
 * ```
 */
export function metadataToSearchText(metadata: Metadata): string {
  const flat = flattenMetadata(metadata);
  return Object.entries(flat)
    .map(([key, value]) => `${key}:${value}`)
    .join(' ');
}

/**
 * Get a value from metadata using dot-notation path
 */
export function getMetadataValue(metadata: Metadata, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = metadata;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Check if metadata matches a set of filters
 * Filters use dot-notation keys to access nested values
 *
 * @example
 * ```typescript
 * const metadata = { git: { branch: "main", sha: "abc" } };
 * matchesFilters(metadata, { "git.branch": "main" }) // true
 * matchesFilters(metadata, { "git.branch": "dev" })  // false
 * ```
 */
export function matchesFilters(
  metadata: Metadata,
  filters: Record<string, string>,
): boolean {
  if (!filters || Object.keys(filters).length === 0) {
    return true;
  }

  for (const [key, expectedValue] of Object.entries(filters)) {
    const actualValue = getMetadataValue(metadata, key);

    // Handle numeric comparisons
    if (typeof actualValue === 'number') {
      const numExpected = Number(expectedValue);
      if (actualValue !== numExpected) {
        return false;
      }
    } else if (String(actualValue) !== expectedValue) {
      return false;
    }
  }

  return true;
}
