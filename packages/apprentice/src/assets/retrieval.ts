import { getDb } from '../db';
import { join } from 'node:path';
import type { Asset, AssetId, Context } from '../types';
import { getContext } from '../context';
import { getContentByHash } from './content';

export interface FindAssetsOptions {
  context_id?: string;
  context_ids?: string[];
  extensions?: string[];
  limit?: number;
  offset?: number;
  filters?: Record<string, string>;
  sortBy?: 'indexed_at' | 'key';
  sortOrder?: 'asc' | 'desc';
}

export async function getAsset(
  id: AssetId,
  options?: { includeContent?: boolean },
): Promise<Asset | null> {
  const db = getDb();
  const includeContent = options?.includeContent ?? false;

  const result = await db.execute({
    sql: 'SELECT id, context_id, key, extension, content_hash, indexed_at, metadata FROM assets WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  let content: string | null = null;

  if (includeContent) {
    const contentHash = row.content_hash as string;
    if (contentHash) {
      content = await getContentByHash(contentHash);
    }
  }

  return {
    id: row.id as string,
    context_id: row.context_id as string,
    key: row.key as string,
    extension: row.extension as string,
    content_hash: row.content_hash as string,
    indexed_at: row.indexed_at as string,
    metadata: JSON.parse(row.metadata as string),
    content,
  };
}

export async function findAssets(
  options: FindAssetsOptions = {},
): Promise<Asset[]> {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const sortBy = options.sortBy ?? 'indexed_at';
  const sortOrder = options.sortOrder ?? 'desc';

  const conditions: string[] = [];
  const args: unknown[] = [];

  if (options.context_id) {
    conditions.push('context_id = ?');
    args.push(options.context_id);
  } else if (options.context_ids && options.context_ids.length > 0) {
    const placeholders = options.context_ids.map(() => '?').join(',');
    conditions.push(`context_id IN (${placeholders})`);
    args.push(...options.context_ids);
  }

  if (options.extensions && options.extensions.length > 0) {
    const placeholders = options.extensions.map(() => '?').join(',');
    conditions.push(`extension IN (${placeholders})`);
    args.push(...options.extensions);
  }

  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      conditions.push(`json_extract(metadata, ?) = ?`);
      args.push(`$.${key}`, value);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

  const sql = `
    SELECT id, context_id, key, extension, content_hash, indexed_at, metadata 
    FROM assets 
    ${whereClause} 
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  args.push(limit, offset);

  const result = await db.execute({
    sql,
    args: args as any,
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    context_id: row.context_id as string,
    key: row.key as string,
    extension: row.extension as string,
    content_hash: row.content_hash as string,
    indexed_at: row.indexed_at as string,
    metadata: JSON.parse(row.metadata as string),
  }));
}

export async function countAssets(
  options: Pick<
    FindAssetsOptions,
    'context_id' | 'context_ids' | 'extensions' | 'filters'
  > = {},
): Promise<number> {
  const db = getDb();
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (options.context_id) {
    conditions.push('context_id = ?');
    args.push(options.context_id);
  } else if (options.context_ids && options.context_ids.length > 0) {
    const placeholders = options.context_ids.map(() => '?').join(',');
    conditions.push(`context_id IN (${placeholders})`);
    args.push(...options.context_ids);
  }

  if (options.extensions && options.extensions.length > 0) {
    const placeholders = options.extensions.map(() => '?').join(',');
    conditions.push(`extension IN (${placeholders})`);
    args.push(...options.extensions);
  }

  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      conditions.push(`json_extract(metadata, ?) = ?`);
      args.push(`$.${key}`, value);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM assets ${whereClause}`,
    args: args as any,
  });

  return result.rows[0]!.count as number;
}

/**
 * Resolve the absolute filesystem path for an asset.
 * Handles both main context paths and mounted paths.
 *
 * For assets from the main context path, returns: context.path + asset.key
 * For assets from a mounted path, returns: mount.path + (key without mount prefix)
 */
export function resolveAssetPath(asset: Asset, context: Context): string {
  // Check if the key matches any mount prefix
  for (const mount of context.mounts) {
    const mountPrefix = mount.mount + '/';
    if (asset.key.startsWith(mountPrefix)) {
      // Strip the mount prefix and join with the mount's actual path
      const relativePath = asset.key.slice(mountPrefix.length);
      return join(mount.path, relativePath);
    }
    // Also handle exact match (unlikely but safe)
    if (asset.key === mount.mount) {
      return mount.path;
    }
  }

  // Not from a mount, use main context path
  return join(context.path, asset.key);
}

/**
 * Get the absolute filesystem path for an asset by ID.
 * Returns null if asset or context not found.
 */
export async function getAssetPath(id: AssetId): Promise<string | null> {
  const asset = await getAsset(id);
  if (!asset) return null;

  const context = await getContext(asset.context_id);
  if (!context) return null;

  return resolveAssetPath(asset, context);
}
