import type { Client } from '@libsql/client';
import type { Event, Asset } from '../types';
import type { EmbeddingProvider } from '../embeddings/types';
import { matchesFilters } from '../filters';

export interface VectorSearchOptions {
  limit?: number;
  since?: string;
  until?: string;
  recentMinutes?: number;
  filters?: Record<string, string>;
  contextIds?: string[];
  extensions?: string[];
}

export interface VectorEventResult {
  event: Event;
  distance: number;
}

export interface VectorAssetResult {
  asset: Asset;
  distance: number;
}

export async function hasEventEmbeddings(db: Client): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT COUNT(*) as count FROM event_embeddings LIMIT 1`,
    );
    return (result.rows[0]?.count as number) > 0;
  } catch {
    return false;
  }
}

export async function hasAssetEmbeddings(db: Client): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT COUNT(*) as count FROM asset_embeddings LIMIT 1`,
    );
    return (result.rows[0]?.count as number) > 0;
  } catch {
    return false;
  }
}

export async function searchEventsVector(
  db: Client,
  query: string,
  embeddingProvider: EmbeddingProvider,
  options: VectorSearchOptions = {},
): Promise<VectorEventResult[]> {
  const { limit = 20, since, until, recentMinutes, filters } = options;
  const hasFilters = filters && Object.keys(filters).length > 0;
  const internalLimit = hasFilters ? Math.max(limit * 10, 200) : limit;

  if (!(await hasEventEmbeddings(db))) {
    return [];
  }

  const queryEmbedding = await embeddingProvider.embed(query);
  const vectorJson = `[${Array.from(queryEmbedding).join(',')}]`;

  const whereClauses: string[] = [];
  const args: (string | number)[] = [vectorJson];

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

  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT e.id, e.timestamp, e.message, e.metadata,
           vector_distance_cos(ee.embedding, vector32(?)) as distance
    FROM event_embeddings ee
    JOIN events e ON ee.event_id = e.id
    ${whereClause}
    ORDER BY distance ASC
    LIMIT ?
  `;
  args.push(internalLimit);

  const result = await db.execute({ sql, args });

  let results = result.rows.map((row) => ({
    event: {
      id: row.id as string,
      timestamp: row.timestamp as string,
      message: row.message as string,
      metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    },
    distance: row.distance as number,
  }));

  if (hasFilters) {
    results = results.filter((r) => matchesFilters(r.event.metadata, filters!));
    results = results.slice(0, limit);
  }

  return results;
}

export async function searchAssetsVector(
  db: Client,
  query: string,
  embeddingProvider: EmbeddingProvider,
  options: VectorSearchOptions = {},
): Promise<VectorAssetResult[]> {
  const { limit = 20, since, until, contextIds, extensions, filters } = options;
  const hasFilters =
    (filters && Object.keys(filters).length > 0) || contextIds || extensions;
  const internalLimit = hasFilters ? Math.max(limit * 10, 200) : limit;

  if (!(await hasAssetEmbeddings(db))) {
    return [];
  }

  const queryEmbedding = await embeddingProvider.embed(query);
  const vectorJson = `[${Array.from(queryEmbedding).join(',')}]`;

  const whereClauses: string[] = [];
  const args: (string | number)[] = [vectorJson];

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

  const sql = `
    SELECT a.id, a.context_id, a.key, a.extension, a.content_hash, a.indexed_at, a.metadata,
           vector_distance_cos(ae.embedding, vector32(?)) as distance
    FROM asset_embeddings ae
    JOIN assets a ON ae.asset_id = a.id
    ${whereClause}
    ORDER BY distance ASC
    LIMIT ?
  `;
  args.push(internalLimit);

  const result = await db.execute({ sql, args });

  let results = result.rows.map((row) => ({
    asset: {
      id: row.id as string,
      context_id: row.context_id as string,
      key: row.key as string,
      extension: row.extension as string,
      content_hash: row.content_hash as string,
      indexed_at: row.indexed_at as string,
      metadata: JSON.parse(row.metadata as string),
    },
    distance: row.distance as number,
  }));

  if (filters && Object.keys(filters).length > 0) {
    results = results.filter((r) => matchesFilters(r.asset.metadata, filters));
    results = results.slice(0, limit);
  }

  return results;
}

/**
 * Insert or update event embedding
 */
export async function upsertEventEmbedding(
  db: Client,
  eventId: string,
  embedding: Float32Array,
  model: string,
): Promise<void> {
  const vectorJson = `[${Array.from(embedding).join(',')}]`;

  await db.execute({
    sql: `INSERT OR REPLACE INTO event_embeddings (event_id, embedding, model, created_at)
          VALUES (?, vector32(?), ?, ?)`,
    args: [eventId, vectorJson, model, new Date().toISOString()],
  });
}

/**
 * Batch insert event embeddings
 */
export async function batchUpsertEventEmbeddings(
  db: Client,
  embeddings: Array<{
    eventId: string;
    embedding: Float32Array;
    model: string;
  }>,
): Promise<void> {
  const timestamp = new Date().toISOString();

  await db.batch(
    embeddings.map(({ eventId, embedding, model }) => {
      const vectorJson = `[${Array.from(embedding).join(',')}]`;
      return {
        sql: `INSERT OR REPLACE INTO event_embeddings (event_id, embedding, model, created_at)
              VALUES (?, vector32(?), ?, ?)`,
        args: [eventId, vectorJson, model, timestamp],
      };
    }),
  );
}

/**
 * Get events that don't have embeddings yet
 */
export async function getEventsWithoutEmbeddings(
  db: Client,
  limit = 100,
): Promise<Event[]> {
  const result = await db.execute({
    sql: `SELECT e.id, e.timestamp, e.message, e.metadata
          FROM events e
          LEFT JOIN event_embeddings ee ON e.id = ee.event_id
          WHERE ee.event_id IS NULL
          ORDER BY e.timestamp DESC
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    timestamp: row.timestamp as string,
    message: row.message as string,
    metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
  }));
}

/**
 * Get count of events with and without embeddings
 */
export async function getEmbeddingStats(db: Client): Promise<{
  totalEvents: number;
  withEmbeddings: number;
  withoutEmbeddings: number;
}> {
  const totalResult = await db.execute(`SELECT COUNT(*) as count FROM events`);
  const withResult = await db.execute(
    `SELECT COUNT(*) as count FROM event_embeddings`,
  );

  const totalEvents = (totalResult.rows[0]?.count as number) ?? 0;
  const withEmbeddings = (withResult.rows[0]?.count as number) ?? 0;

  return {
    totalEvents,
    withEmbeddings,
    withoutEmbeddings: totalEvents - withEmbeddings,
  };
}
