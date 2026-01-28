/**
 * Flatten a nested object to dot-notation
 * @example flatten({ git: { branch: "main" } }) → { "git.branch": "main" }
 */
export function flatten(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Unflatten dot-notation to nested object
 * @example unflatten({ "git.branch": "main" }) → { git: { branch: "main" } }
 */
export function unflatten(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;

      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  return result;
}

/**
 * Parse an attribute filter string
 * @example parseAttrFilter("git.branch=main") → { key: "git.branch", value: "main" }
 */
export function parseAttrFilter(filter: string): {
  key: string;
  value: string;
} {
  const [key, ...rest] = filter.split('=');
  return {
    key: key?.trim() ?? '',
    value: rest.join('=').trim(),
  };
}

/**
 * Get a value from a nested object using dot-notation path
 */
function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;

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
 * Match an event against attribute filters
 */
export function matchesFilters(
  data: Record<string, unknown>,
  filters: Record<string, string>,
): boolean {
  for (const [key, expectedValue] of Object.entries(filters)) {
    const actualValue = getNestedValue(data, key);

    // Handle numeric comparisons
    if (typeof actualValue === 'number') {
      const numExpected = Number(expectedValue);
      if (actualValue !== numExpected) {
        return false;
      }
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}
