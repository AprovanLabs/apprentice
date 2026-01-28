import { listContexts } from '../context';
import { getDb } from '../db';
import { upsertAsset } from '../assets/upsert';
import { discoverFiles } from './file-discovery';
import { computeContentHash } from './content-hash';
import { extractMetadata, registerMetadataHandler } from './metadata-handlers';
import { shellScriptHandler } from './handlers/shell-script';
import { markdownHandler } from './handlers/markdown';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { syncVersions, runContentEviction } from '../versioning';

registerMetadataHandler(shellScriptHandler);
registerMetadataHandler(markdownHandler);

const CONTENT_SIZE_LIMIT = 500_000;

export interface IndexerResult {
  contextId: string;
  filesProcessed: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  errors: number;
  versionRefsProcessed?: number;
  versionFilesIndexed?: number;
}

export interface IndexOptions {
  versionsOnly?: boolean;
  noVersions?: boolean;
  versionDepth?: number;
}

import { createHash } from 'node:crypto';

function generateAssetId(context_id: string, key: string): string {
  return createHash('sha256')
    .update(`${context_id}:${key}`)
    .digest('hex')
    .substring(0, 16);
}

async function getExistingContentHash(
  contextId: string,
  key: string,
): Promise<string | null> {
  const db = getDb();
  const assetId = generateAssetId(contextId, key);

  const result = await db.execute({
    sql: 'SELECT content_hash FROM assets WHERE id = ?',
    args: [assetId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return (result.rows[0]!.content_hash as string) || null;
}

export async function indexContext(
  contextId: string,
  options: IndexOptions = {},
): Promise<IndexerResult> {
  const contexts = await listContexts();
  const context = contexts.find((c) => c.id === contextId);

  if (!context) {
    throw new Error(`Context not found: ${contextId}`);
  }

  if (!context.enabled) {
    return {
      contextId,
      filesProcessed: 0,
      filesAdded: 0,
      filesUpdated: 0,
      filesSkipped: 0,
      errors: 0,
    };
  }

  const result: IndexerResult = {
    contextId,
    filesProcessed: 0,
    filesAdded: 0,
    filesUpdated: 0,
    filesSkipped: 0,
    errors: 0,
  };

  if (!options.versionsOnly) {
    const discoveredFiles = await discoverFiles(context);

    for (const file of discoveredFiles) {
      result.filesProcessed++;

      try {
        const contentHash = await computeContentHash(file.absolutePath);
        const existingHash = await getExistingContentHash(
          contextId,
          file.relativePath,
        );

        if (existingHash === contentHash) {
          result.filesSkipped++;
          continue;
        }

        const stats = await import('node:fs/promises').then((fs) =>
          fs.stat(file.absolutePath),
        );
        const fileSize = stats.size;
        const extension = extname(file.relativePath);

        let content: string | null = null;
        let metadata: Record<string, unknown> = {};

        if (fileSize <= CONTENT_SIZE_LIMIT) {
          try {
            content = await readFile(file.absolutePath, 'utf-8');
            metadata = await extractMetadata(
              file.absolutePath,
              content,
              extension,
            );
          } catch {
            console.warn(
              `Could not read ${file.relativePath} as text, treating as binary`,
            );
            content = null;
          }
        }

        await upsertAsset({
          context_id: contextId,
          key: file.relativePath,
          extension,
          content,
          metadata,
        });

        if (existingHash === null) {
          result.filesAdded++;
        } else {
          result.filesUpdated++;
        }
      } catch (error) {
        result.errors++;
        console.error(`Error indexing ${file.relativePath}:`, error);
      }
    }
  }

  if (!options.noVersions && context.version_provider_type) {
    try {
      const syncResult = await syncVersions(contextId, context.path, {
        maxDepth: options.versionDepth,
      });
      result.versionRefsProcessed = syncResult.refsProcessed;
      result.versionFilesIndexed = syncResult.filesIndexed;
    } catch (err) {
      console.error(`Error syncing versions for ${contextId}:`, err);
      result.errors++;
    }
  }

  const db = getDb();
  await db.execute({
    sql: 'UPDATE contexts SET last_indexed_at = ? WHERE id = ?',
    args: [new Date().toISOString(), contextId],
  });

  return result;
}

export async function indexAllContexts(
  options: IndexOptions = {},
): Promise<IndexerResult[]> {
  const contexts = await listContexts();
  const enabledContexts = contexts.filter((c) => c.enabled);

  const results: IndexerResult[] = [];

  for (const context of enabledContexts) {
    try {
      const result = await indexContext(context.id, options);
      results.push(result);
    } catch (error) {
      console.error(`Error indexing context ${context.id}:`, error);
      results.push({
        contextId: context.id,
        filesProcessed: 0,
        filesAdded: 0,
        filesUpdated: 0,
        filesSkipped: 0,
        errors: 1,
      });
    }
  }

  await runContentEviction();

  return results;
}
