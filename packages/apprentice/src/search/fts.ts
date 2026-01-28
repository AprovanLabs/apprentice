import type { Client } from '@libsql/client';
import type { Event, Asset } from '../types';
import type { VersionedAssetResult } from './types';
import { matchesFilters } from '../filters';
import type { VersionFilter } from '../versioning/types';
import { resolveVersionFilter } from './version-filters';

export interface FtsSearchOptions {
  limit?: number;
  since?: string;
  until?: string;
  recentMinutes?: number;
  filters?: Record<string, string>;
  contextIds?: string[];
  extensions?: string[];
  versionFilter?: VersionFilter | null;
}

export interface FtsEventResult {
  event: Event;
  score: number;
}

export interface FtsAssetResult {
  asset: Asset | VersionedAssetResult;
  score: number;
}

function buildFtsQuery(query: string): string {
  return query
    .replace(/['"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => {
      if (term.includes('"') && !term.includes('*')) {
        return term;
      }
      if (term.includes('*')) {
        return term;
      }
      return `"${term}"*`;
    })
    .join(' OR ');
}

export async function searchEventsFts(
  db: Client,
  query: string,
  options: FtsSearchOptions = {},
): Promise<FtsEventResult[]> {
  const { limit = 20, since, until, recentMinutes, filters } = options;
  const hasFilters = filters && Object.keys(filters).length > 0;
  const internalLimit = hasFilters ? Math.max(limit * 10, 200) : limit;

  const whereClauses: string[] = [];
  const args: (string | number)[] = [];

  if (recentMinutes) {
    const cutoffTime = new Date(
      Date.now() - recentMinutes * 60 * 1000,
    ).toISOString();
    whereClauses.push('e.timestamp >= ?');
    args.push(cutoffTime);
  }

  if (since) {
    whereClauses.push('e.timestamp >= ?');
    args.push(since);
  }

  if (until) {
    whereClauses.push('e.timestamp <= ?');
    args.push(until);
  }

  if (query) {
    const ftsQuery = buildFtsQuery(query);
    if (ftsQuery) {
      whereClauses.push('events_fts MATCH ?');
      args.push(ftsQuery);
    }
  }

  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = query
    ? `SELECT e.id, e.timestamp, e.message, e.metadata, bm25(events_fts) as score
       FROM events_fts
       JOIN events e ON events_fts.rowid = e.rowid
       ${whereClause}
       ORDER BY score
       LIMIT ?`
    : `SELECT e.id, e.timestamp, e.message, e.metadata, 0 as score
       FROM events e
       ${whereClause}
       ORDER BY e.timestamp DESC
       LIMIT ?`;

  args.push(internalLimit);

  const result = await db.execute({ sql, args });

  let events = result.rows.map((row) => ({
    event: {
      id: row.id as string,
      timestamp: row.timestamp as string,
      message: row.message as string,
      metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    },
    score: -(row.score as number),
  }));

  if (hasFilters) {
    events = events.filter((r) => matchesFilters(r.event.metadata, filters!));
    events = events.slice(0, limit);
  }

  return events;
}

export async function searchAssetsFts(
  db: Client,
  query: string,
  options: FtsSearchOptions = {},
): Promise<FtsAssetResult[]> {
  const {
    limit = 20,
    since,
    until,
    contextIds,
    extensions,
    filters,
    versionFilter,
  } = options;
  const hasFilters =
    (filters && Object.keys(filters).length > 0) || contextIds || extensions;
  const internalLimit = hasFilters ? Math.max(limit * 10, 200) : limit;

  if (!query) return [];

  // Resolve branch/before filters to a ref
  let resolvedFilter = versionFilter;
  if (
    versionFilter &&
    (versionFilter.branch || versionFilter.before) &&
    !versionFilter.ref
  ) {
    // Need to resolve across all contexts - for now, use the first contextId or 'apprentice'
    const contextId = contextIds?.[0] ?? 'apprentice';
    const resolvedRef = await resolveVersionFilter(contextId, versionFilter);
    if (resolvedRef) {
      resolvedFilter = { ...versionFilter, ref: resolvedRef };
    }
  }

  if (resolvedFilter?.ref || resolvedFilter?.history) {
    return searchVersionedAssetsFts(db, query, {
      ...options,
      versionFilter: resolvedFilter,
    });
  }

  const whereClauses: string[] = [];
  const args: (string | number)[] = [];

  const ftsQuery = buildFtsQuery(query);
  if (ftsQuery) {
    whereClauses.push('assets_fts MATCH ?');
    args.push(ftsQuery);
  }

  if (since) {
    whereClauses.push('a.indexed_at >= ?');
    args.push(since);
  }

  if (until) {
    whereClauses.push('a.indexed_at <= ?');
    args.push(until);
  }

  if (contextIds && contextIds.length > 0) {
    whereClauses.push(
      `a.context_id IN (${contextIds.map(() => '?').join(',')})`,
    );
    args.push(...contextIds);
  }

  if (extensions && extensions.length > 0) {
    whereClauses.push(
      `a.extension IN (${extensions.map(() => '?').join(',')})`,
    );
    args.push(...extensions);
  }

  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `SELECT a.id, a.context_id, a.key, a.extension, a.content_hash, a.indexed_at, a.metadata, bm25(assets_fts) as score
               FROM assets_fts
               JOIN assets a ON assets_fts.rowid = a.rowid
               ${whereClause}
               ORDER BY score
               LIMIT ?`;

  args.push(internalLimit);

  const result = await db.execute({ sql, args });

  let assets = result.rows.map((row) => ({
    asset: {
      id: row.id as string,
      context_id: row.context_id as string,
      key: row.key as string,
      extension: row.extension as string,
      content_hash: row.content_hash as string,
      indexed_at: row.indexed_at as string,
      metadata: JSON.parse(row.metadata as string),
    },
    score: -(row.score as number),
  }));

  if (filters && Object.keys(filters).length > 0) {
    assets = assets.filter((r) => matchesFilters(r.asset.metadata, filters));
    assets = assets.slice(0, limit);
  }

  return assets;
}

async function searchVersionedAssetsFts(
  db: Client,
  query: string,
  options: FtsSearchOptions = {},
): Promise<FtsAssetResult[]> {
  const {
    limit = 20,
    contextIds,
    extensions,
    filters,
    versionFilter,
  } = options;
  const internalLimit = Math.max(limit * 10, 200);

  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const args: (string | number)[] = [ftsQuery];

  let sql: string;

  if (versionFilter?.ref) {
    // Support both full SHA and short SHA prefix matching
    const refMatch =
      versionFilter.ref.length < 40
        ? `${versionFilter.ref}%`
        : versionFilter.ref;
    const refOp = versionFilter.ref.length < 40 ? 'LIKE' : '=';
    // Search both content and key (filename)
    const keyPattern = `%${query}%`;
    sql = `
      SELECT av.context_id, av.key, av.content_hash, av.status,
             vr.id as version_ref, vr.name as version_name, vr.timestamp as version_timestamp,
             a.id, a.extension, a.metadata, a.indexed_at,
             bm25(content_store_fts) as score
      FROM content_store_fts
      JOIN asset_versions av ON av.content_hash = content_store_fts.content_hash
      JOIN version_refs vr ON vr.id = av.version_ref_id
      LEFT JOIN assets a ON a.context_id = av.context_id AND a.key = av.key
      WHERE content_store_fts MATCH ? AND av.version_ref_id ${refOp} ?
      UNION
      SELECT av.context_id, av.key, av.content_hash, av.status,
             vr.id as version_ref, vr.name as version_name, vr.timestamp as version_timestamp,
             a.id, a.extension, a.metadata, a.indexed_at,
             1.0 as score
      FROM asset_versions av
      JOIN version_refs vr ON vr.id = av.version_ref_id
      LEFT JOIN assets a ON a.context_id = av.context_id AND a.key = av.key
      WHERE av.key LIKE ? AND av.version_ref_id ${refOp} ?
    `;
    args.length = 0;
    args.push(ftsQuery, refMatch, keyPattern, refMatch);
  } else if (versionFilter?.history) {
    sql = `
      SELECT av.context_id, av.key, av.content_hash, av.status,
             vr.id as version_ref, vr.name as version_name, vr.timestamp as version_timestamp,
             a.id, a.extension, a.metadata, a.indexed_at,
             bm25(content_store_fts) as score
      FROM content_store_fts
      JOIN asset_versions av ON av.content_hash = content_store_fts.content_hash
      JOIN version_refs vr ON vr.id = av.version_ref_id
      LEFT JOIN assets a ON a.context_id = av.context_id AND a.key = av.key
      WHERE content_store_fts MATCH ?
      UNION
      SELECT a.context_id, a.key, a.content_hash, 'current' as status,
             NULL as version_ref, NULL as version_name, a.indexed_at as version_timestamp,
             a.id, a.extension, a.metadata, a.indexed_at,
             bm25(content_store_fts) as score
      FROM content_store_fts
      JOIN content_refs cr ON cr.content_hash = content_store_fts.content_hash AND cr.is_head = 1
      JOIN assets a ON a.content_hash = cr.content_hash
      WHERE content_store_fts MATCH ?
    `;
    args.length = 0;
    args.push(ftsQuery, ftsQuery);
  } else {
    return [];
  }

  if (contextIds && contextIds.length > 0) {
    sql += ` AND av.context_id IN (${contextIds.map(() => '?').join(',')})`;
    args.push(...contextIds);
  }

  sql += ` ORDER BY score LIMIT ?`;
  args.push(internalLimit);

  const result = await db.execute({ sql, args });

  let assets: FtsAssetResult[] = result.rows.map((row) => ({
    asset: {
      id:
        (row.id as string) ||
        `${row.context_id}:${row.key}:${row.version_ref || 'head'}`,
      context_id: row.context_id as string,
      key: row.key as string,
      extension: (row.extension as string) || '',
      content_hash: row.content_hash as string,
      indexed_at:
        (row.indexed_at as string) || (row.version_timestamp as string),
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
      version_ref: row.version_ref as string | undefined,
      version_name: row.version_name as string | undefined,
      version_timestamp: row.version_timestamp as string | undefined,
    } as VersionedAssetResult,
    score: -(row.score as number),
  }));

  if (extensions && extensions.length > 0) {
    assets = assets.filter((r) => extensions.includes(r.asset.extension));
  }

  if (filters && Object.keys(filters).length > 0) {
    assets = assets.filter((r) => matchesFilters(r.asset.metadata, filters));
  }

  return assets.slice(0, limit);
}
