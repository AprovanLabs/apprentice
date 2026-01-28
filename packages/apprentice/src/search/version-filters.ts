import { getDb } from '../db';
import type { VersionFilter } from '../versioning/types';

export interface ExtractedFilters {
  versionFilter: VersionFilter | null;
  regularFilters: Record<string, string>;
}

export function extractVersionFilters(
  filters?: Record<string, string>,
): ExtractedFilters {
  if (!filters) {
    return { versionFilter: null, regularFilters: {} };
  }

  const versionFilter: VersionFilter = {};
  const regularFilters: Record<string, string> = {};
  let hasVersionFilter = false;

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'version.ref') {
      versionFilter.ref = value;
      hasVersionFilter = true;
    } else if (key === 'version.branch') {
      versionFilter.branch = value;
      hasVersionFilter = true;
    } else if (key === 'version.before') {
      versionFilter.before = value;
      hasVersionFilter = true;
    } else if (key === 'version.history') {
      versionFilter.history = value === 'true';
      hasVersionFilter = true;
    } else {
      regularFilters[key] = value;
    }
  }

  return {
    versionFilter: hasVersionFilter ? versionFilter : null,
    regularFilters,
  };
}

export async function resolveVersionFilter(
  contextId: string,
  filter: VersionFilter,
): Promise<string | null> {
  const db = getDb();

  if (filter.ref) {
    return filter.ref;
  }

  if (filter.branch) {
    const result = await db.execute({
      sql: `SELECT id FROM version_refs 
            WHERE context_id = ? AND name = ?
            ORDER BY timestamp DESC LIMIT 1`,
      args: [contextId, filter.branch],
    });
    if (result.rows.length > 0) {
      return result.rows[0]!.id as string;
    }
  }

  if (filter.before) {
    const result = await db.execute({
      sql: `SELECT id FROM version_refs 
            WHERE context_id = ? AND timestamp < ?
            ORDER BY timestamp DESC LIMIT 1`,
      args: [contextId, filter.before],
    });
    if (result.rows.length > 0) {
      return result.rows[0]!.id as string;
    }
  }

  return null;
}

export async function isVersionedContext(contextId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT version_provider_type FROM contexts WHERE id = ?',
    args: [contextId],
  });
  if (result.rows.length === 0) return false;
  return !!result.rows[0]!.version_provider_type;
}
