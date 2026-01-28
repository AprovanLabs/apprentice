import { getDb } from '../db';

export interface EvictionResult {
  rowsEvicted: number;
  bytesFreed: number;
}

export interface EvictionOptions {
  thresholdDays?: number;
  batchSize?: number;
}

export async function runContentEviction(
  options: EvictionOptions = {},
): Promise<EvictionResult> {
  const db = getDb();
  const thresholdDays = options.thresholdDays ?? 7;
  const batchSize = options.batchSize ?? 1000;

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - thresholdDays);
  const thresholdIso = threshold.toISOString();

  const toEvict = await db.execute({
    sql: `
      SELECT cs.content_hash, cs.size_bytes
      FROM content_store cs
      WHERE cs.last_accessed_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM content_refs cr
          WHERE cr.content_hash = cs.content_hash AND cr.is_head = 1
        )
      LIMIT ?
    `,
    args: [thresholdIso, batchSize],
  });

  let rowsEvicted = 0;
  let bytesFreed = 0;

  for (const row of toEvict.rows) {
    const contentHash = row.content_hash as string;
    const sizeBytes = row.size_bytes as number;

    await db.execute({
      sql: 'DELETE FROM content_store WHERE content_hash = ?',
      args: [contentHash],
    });

    rowsEvicted++;
    bytesFreed += sizeBytes;
  }

  return { rowsEvicted, bytesFreed };
}
