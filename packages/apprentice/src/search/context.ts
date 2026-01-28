import type { Client } from '@libsql/client';
import type { Event, Asset } from '../types';
import type { RelatedContextOptions, RelatedContextResult } from './types';

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 20;

export async function getRelatedContext(
  db: Client,
  event: Event,
  options: RelatedContextOptions = {},
): Promise<RelatedContextResult> {
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const strategy = options.strategy;

  let events: Event[] = [];
  let strategyUsed: 'grouped' | 'temporal' = 'temporal';

  if (strategy?.groupBy) {
    const groupValue = getNestedMetadata(event.metadata, strategy.groupBy);
    if (groupValue !== undefined) {
      events = await getGroupedEvents(db, event, strategy, groupValue, limit);
      if (events.length > 0) {
        strategyUsed = 'grouped';
      }
    }
  }

  if (events.length === 0) {
    events = await getTemporalEvents(db, event, windowSeconds, limit);
    strategyUsed = 'temporal';
  }

  const assets = await getRelatedAssets(db, events);

  return {
    events,
    assets,
    strategyUsed,
  };
}

async function getGroupedEvents(
  db: Client,
  event: Event,
  strategy: NonNullable<RelatedContextOptions['strategy']>,
  groupValue: unknown,
  limit: number,
): Promise<Event[]> {
  const orderBy = strategy.orderBy || 'timestamp';
  const direction = strategy.direction || 'asc';

  const metadataPath = strategy.groupBy.split('.');
  const jsonPath = `$.${metadataPath.join('.')}`;

  const query = `
    SELECT id, timestamp, message, metadata
    FROM events
    WHERE json_extract(metadata, ?) = ?
    ORDER BY ${
      orderBy === 'timestamp'
        ? 'timestamp'
        : `json_extract(metadata, '$.' || ?)`
    } ${direction.toUpperCase()}
    LIMIT ?
  `;

  const params =
    orderBy === 'timestamp'
      ? [jsonPath, JSON.stringify(groupValue), limit]
      : [jsonPath, JSON.stringify(groupValue), orderBy, limit];

  const result = await db.execute({
    sql: query,
    args: params,
  });

  return result.rows.map((row) => ({
    id: String(row.id),
    timestamp: String(row.timestamp),
    message: String(row.message),
    metadata: JSON.parse(String(row.metadata)),
  }));
}

async function getTemporalEvents(
  db: Client,
  event: Event,
  windowSeconds: number,
  limit: number,
): Promise<Event[]> {
  const eventTime = new Date(event.timestamp);
  const startTime = new Date(eventTime.getTime() - windowSeconds * 1000);
  const endTime = new Date(eventTime.getTime() + windowSeconds * 1000);

  const query = `
    SELECT id, timestamp, message, metadata
    FROM events
    WHERE timestamp >= ? AND timestamp <= ? AND id != ?
    ORDER BY ABS(CAST((julianday(timestamp) - julianday(?)) * 86400 AS INTEGER))
    LIMIT ?
  `;

  const result = await db.execute({
    sql: query,
    args: [
      startTime.toISOString(),
      endTime.toISOString(),
      event.id,
      event.timestamp,
      limit,
    ],
  });

  return result.rows.map((row) => ({
    id: String(row.id),
    timestamp: String(row.timestamp),
    message: String(row.message),
    metadata: JSON.parse(String(row.metadata)),
  }));
}

/**
 * Extract related assets from event metadata.
 * Assets are linked via metadata.relations array or metadata.asset.id.
 */
async function getRelatedAssets(db: Client, events: Event[]): Promise<Asset[]> {
  if (events.length === 0) return [];

  // Extract unique asset IDs from event metadata
  const assetIds = new Set<string>();

  for (const event of events) {
    // Check metadata.relations array (standard pattern)
    const relations = event.metadata?.relations;
    if (Array.isArray(relations)) {
      for (const rel of relations) {
        if (typeof rel === 'object' && rel !== null && 'asset_id' in rel) {
          assetIds.add(String(rel.asset_id));
        }
      }
    }

    // Check metadata.asset.id (from script execution)
    const assetMeta = event.metadata?.asset;
    if (
      typeof assetMeta === 'object' &&
      assetMeta !== null &&
      'id' in assetMeta
    ) {
      assetIds.add(String((assetMeta as { id: string }).id));
    }
  }

  if (assetIds.size === 0) return [];

  const ids = Array.from(assetIds);
  const placeholders = ids.map(() => '?').join(',');

  const query = `
    SELECT id, context_id, key, extension, content_hash, indexed_at, metadata
    FROM assets
    WHERE id IN (${placeholders})
  `;

  const result = await db.execute({
    sql: query,
    args: ids,
  });

  return result.rows.map((row) => ({
    id: String(row.id),
    context_id: String(row.context_id),
    key: String(row.key),
    extension: String(row.extension),
    content_hash: String(row.content_hash),
    indexed_at: String(row.indexed_at),
    metadata: JSON.parse(String(row.metadata)),
  }));
}

function getNestedMetadata(
  metadata: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.');
  let current: unknown = metadata;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
