import { getDb } from '../db';
import { getEmbeddingProvider, getEmbeddingConfig } from '../embeddings';
import type { AssetId } from '../types';

export interface EmbeddingTask {
  assetId: AssetId;
  text: string;
}

async function getAssetsWithoutEmbeddings(
  limit: number,
): Promise<EmbeddingTask[]> {
  const db = getDb();

  const result = await db.execute({
    sql: `
      SELECT a.id, a.metadata, a.content_hash, cs.content
      FROM assets a
      LEFT JOIN asset_embeddings ae ON a.id = ae.asset_id
      LEFT JOIN content_store cs ON a.content_hash = cs.content_hash
      WHERE ae.asset_id IS NULL
      LIMIT ?
    `,
    args: [limit],
  });

  const tasks: EmbeddingTask[] = [];

  // nomic-embed-text has 8192 token limit
  // Code files can have 2-3 chars per token, so use conservative limit
  const MAX_EMBED_CHARS = 4000;

  for (const row of result.rows) {
    const assetId = row.id as AssetId;
    const content = row.content as string | null;
    const metadata = JSON.parse(row.metadata as string);

    let text = '';

    if (content) {
      text = content.slice(0, MAX_EMBED_CHARS);
    } else {
      const parts: string[] = [];

      if (metadata.script?.description) {
        parts.push(metadata.script.description);
      }
      if (metadata.script?.usage) {
        parts.push(metadata.script.usage);
      }
      if (metadata.frontmatter?.title) {
        parts.push(metadata.frontmatter.title);
      }
      if (metadata.frontmatter?.description) {
        parts.push(metadata.frontmatter.description);
      }
      if (metadata.content?.summary) {
        parts.push(metadata.content.summary);
      }

      text = parts.join('\n').slice(0, MAX_EMBED_CHARS);
    }

    if (text.trim()) {
      tasks.push({ assetId, text });
    }
  }

  return tasks;
}

async function upsertAssetEmbedding(
  assetId: AssetId,
  embedding: number[],
  model: string,
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO asset_embeddings (asset_id, embedding, model, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        embedding = excluded.embedding,
        model = excluded.model,
        created_at = excluded.created_at
    `,
    args: [assetId, JSON.stringify(embedding), model, now],
  });
}

export async function generateAssetEmbeddings(
  batchSize = 100,
): Promise<number> {
  const config = getEmbeddingConfig();
  if (!config.enabled) {
    return 0;
  }

  const provider = getEmbeddingProvider(config.model);

  const tasks = await getAssetsWithoutEmbeddings(batchSize);

  if (tasks.length === 0) {
    return 0;
  }

  let successCount = 0;

  for (const task of tasks) {
    try {
      const embedding = await provider.embed(task.text);
      await upsertAssetEmbedding(
        task.assetId,
        Array.from(embedding),
        provider.model,
      );
      successCount++;
    } catch (error) {
      console.warn(
        `Failed to embed asset ${task.assetId}:`,
        (error as Error).message,
      );
    }
  }

  return successCount;
}
