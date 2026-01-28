// Embedding cache for avoiding recomputation

import type { Client } from '@libsql/client';
import {
  hashContent,
  serializeEmbedding,
  deserializeEmbedding,
} from './client';

/**
 * Initialize embedding cache table
 */
export async function initEmbeddingCache(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      content_hash TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_embedding_cache_model 
    ON embedding_cache(model)
  `);
}

/**
 * Get cached embedding
 */
export async function getCachedEmbedding(
  db: Client,
  text: string,
  model: string,
): Promise<Float32Array | null> {
  const hash = hashContent(text, model);

  const result = await db.execute({
    sql: `SELECT embedding FROM embedding_cache WHERE content_hash = ?`,
    args: [hash],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0]!;
  const buffer = Buffer.from(row.embedding as ArrayBuffer);
  return deserializeEmbedding(buffer);
}

/**
 * Store embedding in cache
 */
export async function setCachedEmbedding(
  db: Client,
  text: string,
  model: string,
  embedding: Float32Array,
): Promise<void> {
  const hash = hashContent(text, model);
  const buffer = serializeEmbedding(embedding);

  await db.execute({
    sql: `INSERT OR REPLACE INTO embedding_cache 
          (content_hash, embedding, model, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [hash, buffer, model, new Date().toISOString()],
  });
}

/**
 * Get cached embeddings for multiple texts
 */
export async function getCachedEmbeddingBatch(
  db: Client,
  texts: string[],
  model: string,
): Promise<(Float32Array | null)[]> {
  const hashes = texts.map((text) => hashContent(text, model));

  // Build placeholders for IN clause
  const placeholders = hashes.map(() => '?').join(',');

  const result = await db.execute({
    sql: `SELECT content_hash, embedding 
          FROM embedding_cache 
          WHERE content_hash IN (${placeholders})`,
    args: hashes,
  });

  // Build hash map for fast lookup
  const embeddingMap = new Map<string, Float32Array>();
  for (const row of result.rows) {
    const hash = row.content_hash as string;
    const buffer = Buffer.from(row.embedding as ArrayBuffer);
    embeddingMap.set(hash, deserializeEmbedding(buffer));
  }

  // Return in same order as input texts
  return hashes.map((hash) => embeddingMap.get(hash) || null);
}

/**
 * Store multiple embeddings in cache
 */
export async function setCachedEmbeddingBatch(
  db: Client,
  texts: string[],
  model: string,
  embeddings: Float32Array[],
): Promise<void> {
  if (texts.length !== embeddings.length) {
    throw new Error('Texts and embeddings arrays must have the same length');
  }

  const timestamp = new Date().toISOString();

  // Use a transaction for batch insert
  await db.batch(
    texts.map((text, i) => {
      const hash = hashContent(text, model);
      const buffer = serializeEmbedding(embeddings[i]!);

      return {
        sql: `INSERT OR REPLACE INTO embedding_cache 
              (content_hash, embedding, model, created_at)
              VALUES (?, ?, ?, ?)`,
        args: [hash, buffer, model, timestamp],
      };
    }),
  );
}

/**
 * Clear cache for a specific model
 */
export async function clearCacheForModel(
  db: Client,
  model: string,
): Promise<void> {
  await db.execute({
    sql: `DELETE FROM embedding_cache WHERE model = ?`,
    args: [model],
  });
}

/**
 * Get cache statistics
 */
export async function getCacheStats(db: Client): Promise<{
  totalEntries: number;
  modelCounts: Record<string, number>;
}> {
  const totalResult = await db.execute(
    `SELECT COUNT(*) as count FROM embedding_cache`,
  );
  const totalEntries = (totalResult.rows[0]?.count as number) ?? 0;

  const modelResult = await db.execute(
    `SELECT model, COUNT(*) as count 
     FROM embedding_cache 
     GROUP BY model`,
  );

  const modelCounts: Record<string, number> = {};
  for (const row of modelResult.rows) {
    modelCounts[row.model as string] = row.count as number;
  }

  return { totalEntries, modelCounts };
}
