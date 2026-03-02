import type { Client } from '@libsql/client';
import type { Entity } from './types';
import { fileUri, eventUri, parseUri, isFileUri, isEventUri } from './uri';

export interface Asset {
  id: string;
  context_id: string;
  key: string;
  extension: string;
  content_hash: string;
  indexed_at: string;
  metadata: Record<string, unknown>;
}

export interface Event {
  id: string;
  timestamp: string;
  message: string;
  metadata: Record<string, unknown>;
}

export function assetToEntity(asset: Asset): Entity {
  return {
    uri: fileUri(asset.context_id, asset.key),
    type: 'file',
    attrs: {
      id: asset.id,
      contextId: asset.context_id,
      key: asset.key,
      extension: asset.extension,
      contentHash: asset.content_hash,
      ...asset.metadata,
    },
    syncedAt: asset.indexed_at,
  };
}

export function entityToAsset(entity: Entity): Asset | null {
  if (!isFileUri(entity.uri)) return null;

  const parsed = parseUri(entity.uri);
  const pathParts = parsed.path.split('/');
  const contextId = pathParts[0] ?? '';
  const key = pathParts.slice(1).join('/');

  return {
    id: (entity.attrs.id as string) || entity.uri,
    context_id: contextId,
    key,
    extension: (entity.attrs.extension as string) || '',
    content_hash: (entity.attrs.contentHash as string) || '',
    indexed_at: entity.syncedAt || new Date().toISOString(),
    metadata: Object.fromEntries(
      Object.entries(entity.attrs).filter(
        ([k]) => !['id', 'contextId', 'key', 'extension', 'contentHash'].includes(k),
      ),
    ),
  };
}

export function eventToEntity(event: Event): Entity {
  return {
    uri: eventUri(event.id),
    type: 'event',
    attrs: {
      id: event.id,
      message: event.message,
      ...event.metadata,
    },
    syncedAt: event.timestamp,
  };
}

export function entityToEvent(entity: Entity): Event | null {
  if (!isEventUri(entity.uri)) return null;

  const parsed = parseUri(entity.uri);

  return {
    id: (entity.attrs.id as string) || parsed.path,
    timestamp: entity.syncedAt || new Date().toISOString(),
    message: (entity.attrs.message as string) || '',
    metadata: Object.fromEntries(
      Object.entries(entity.attrs).filter(([k]) => !['id', 'message'].includes(k)),
    ),
  };
}

export async function getAssetAsEntity(
  db: Client,
  uri: string,
): Promise<Entity | null> {
  if (!isFileUri(uri)) return null;

  const parsed = parseUri(uri);
  const pathParts = parsed.path.split('/');
  const contextId = pathParts[0] ?? '';
  const key = pathParts.slice(1).join('/');

  if (!contextId || !key) return null;

  const result = await db.execute({
    sql: 'SELECT * FROM assets WHERE context_id = ? AND key = ?',
    args: [contextId, key],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  const asset: Asset = {
    id: row.id as string,
    context_id: row.context_id as string,
    key: row.key as string,
    extension: row.extension as string,
    content_hash: row.content_hash as string,
    indexed_at: row.indexed_at as string,
    metadata: JSON.parse((row.metadata as string) || '{}'),
  };

  return assetToEntity(asset);
}

export async function getEventAsEntity(
  db: Client,
  uri: string,
): Promise<Entity | null> {
  if (!isEventUri(uri)) return null;

  const parsed = parseUri(uri);
  const eventId = parsed.path;

  const result = await db.execute({
    sql: 'SELECT * FROM events WHERE id = ?',
    args: [eventId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  const event: Event = {
    id: row.id as string,
    timestamp: row.timestamp as string,
    message: row.message as string,
    metadata: JSON.parse((row.metadata as string) || '{}'),
  };

  return eventToEntity(event);
}

export async function queryAssetsAsEntities(
  db: Client,
  filter: { types?: string[]; uriPrefix?: string; limit?: number },
): Promise<Entity[]> {
  if (filter.types && !filter.types.includes('file')) return [];

  let sql = 'SELECT * FROM assets WHERE 1=1';
  const args: unknown[] = [];

  if (filter.uriPrefix && isFileUri(filter.uriPrefix)) {
    const parsed = parseUri(filter.uriPrefix);
    const pathParts = parsed.path.split('/');
    const contextId = pathParts[0];
    const keyPrefix = pathParts.slice(1).join('/');

    if (contextId) {
      sql += ' AND context_id = ?';
      args.push(contextId);
    }
    if (keyPrefix) {
      sql += ' AND key LIKE ?';
      args.push(`${keyPrefix}%`);
    }
  }

  sql += ' ORDER BY indexed_at DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    args.push(filter.limit);
  }

  const result = await db.execute({ sql, args: args as any });

  return result.rows.map((row) => {
    const asset: Asset = {
      id: row.id as string,
      context_id: row.context_id as string,
      key: row.key as string,
      extension: row.extension as string,
      content_hash: row.content_hash as string,
      indexed_at: row.indexed_at as string,
      metadata: JSON.parse((row.metadata as string) || '{}'),
    };
    return assetToEntity(asset);
  });
}

export async function queryEventsAsEntities(
  db: Client,
  filter: { types?: string[]; uriPrefix?: string; limit?: number },
): Promise<Entity[]> {
  if (filter.types && !filter.types.includes('event')) return [];

  let sql = 'SELECT * FROM events WHERE 1=1';
  const args: unknown[] = [];

  if (filter.uriPrefix && isEventUri(filter.uriPrefix)) {
    const parsed = parseUri(filter.uriPrefix);
    if (parsed.path) {
      sql += ' AND id LIKE ?';
      args.push(`${parsed.path}%`);
    }
  }

  sql += ' ORDER BY timestamp DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    args.push(filter.limit);
  }

  const result = await db.execute({ sql, args: args as any });

  return result.rows.map((row) => {
    const event: Event = {
      id: row.id as string,
      timestamp: row.timestamp as string,
      message: row.message as string,
      metadata: JSON.parse((row.metadata as string) || '{}'),
    };
    return eventToEntity(event);
  });
}
