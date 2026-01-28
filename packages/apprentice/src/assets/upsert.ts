import { getDb } from '../db';
import type { Asset, AssetId } from '../types';
import { createHash } from 'node:crypto';
import { setContent } from './content';

function generateAssetId(context_id: string, key: string): AssetId {
  return createHash('sha256')
    .update(`${context_id}:${key}`)
    .digest('hex')
    .substring(0, 16);
}

export interface UpsertAssetOptions {
  context_id: string;
  key: string;
  extension: string;
  content?: string | null;
  metadata: Record<string, unknown>;
}

export async function upsertAsset(options: UpsertAssetOptions): Promise<Asset> {
  const db = getDb();

  const id = generateAssetId(options.context_id, options.key);
  const content_hash = options.content
    ? createHash('sha256').update(options.content).digest('hex')
    : '';
  const indexed_at = new Date().toISOString();

  const contextCheck = await db.execute({
    sql: 'SELECT id FROM contexts WHERE id = ?',
    args: [options.context_id],
  });

  if (contextCheck.rows.length === 0) {
    throw new Error(`Context '${options.context_id}' does not exist`);
  }

  await db.execute({
    sql: `INSERT INTO assets 
          (id, context_id, key, extension, content_hash, indexed_at, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            extension = excluded.extension,
            content_hash = excluded.content_hash,
            indexed_at = excluded.indexed_at,
            metadata = excluded.metadata`,
    args: [
      id,
      options.context_id,
      options.key,
      options.extension,
      content_hash,
      indexed_at,
      JSON.stringify(options.metadata),
    ],
  });

  if (
    options.content !== undefined &&
    options.content !== null &&
    content_hash
  ) {
    await setContent(content_hash, options.content, options.context_id);
  }

  const asset: Asset = {
    id,
    context_id: options.context_id,
    key: options.key,
    extension: options.extension,
    content_hash,
    indexed_at,
    metadata: options.metadata,
    content: options.content,
  };

  return asset;
}

export async function deleteAsset(id: AssetId): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM assets WHERE id = ?',
    args: [id],
  });
}

export async function deleteAssetsByContext(context_id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM assets WHERE context_id = ?',
    args: [context_id],
  });
}
