import { getDb } from '../db';

export async function getContentByHash(
  contentHash: string,
): Promise<string | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT content FROM content_store WHERE content_hash = ?',
    args: [contentHash],
  });

  if (result.rows.length === 0) return null;

  await db.execute({
    sql: 'UPDATE content_store SET last_accessed_at = ? WHERE content_hash = ?',
    args: [new Date().toISOString(), contentHash],
  });

  return result.rows[0]!.content as string;
}

export async function getAssetContent(id: string): Promise<string | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT content_hash FROM assets WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) return null;
  const contentHash = result.rows[0]!.content_hash as string;
  if (!contentHash) return null;

  return getContentByHash(contentHash);
}

export async function setContent(
  contentHash: string,
  content: string,
  contextId: string,
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO content_store (content_hash, content, size_bytes, last_accessed_at, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(content_hash) DO UPDATE SET last_accessed_at = excluded.last_accessed_at`,
    args: [contentHash, content, content.length, now, now],
  });

  // Use the partial unique index idx_content_refs_head_unique for conflict detection
  // This properly deduplicates head refs (the table-level UNIQUE doesn't work with NULL version_ref_id)
  await db.execute({
    sql: `INSERT INTO content_refs (content_hash, context_id, is_head)
          VALUES (?, ?, 1)
          ON CONFLICT(content_hash, context_id) WHERE is_head = 1 DO NOTHING`,
    args: [contentHash, contextId],
  });
}

export async function deleteContent(contentHash: string): Promise<void> {
  const db = getDb();

  const refs = await db.execute({
    sql: 'SELECT COUNT(*) as cnt FROM content_refs WHERE content_hash = ?',
    args: [contentHash],
  });

  if ((refs.rows[0]?.cnt as number) <= 1) {
    await db.execute({
      sql: 'DELETE FROM content_store WHERE content_hash = ?',
      args: [contentHash],
    });
  }

  await db.execute({
    sql: 'DELETE FROM content_refs WHERE content_hash = ? AND is_head = 1',
    args: [contentHash],
  });
}

export async function hasContent(contentHash: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT 1 FROM content_store WHERE content_hash = ? LIMIT 1',
    args: [contentHash],
  });
  return result.rows.length > 0;
}
