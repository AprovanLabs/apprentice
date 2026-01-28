import { getDb } from '../db';
import { getProviderForContext } from './registry';
import type { SyncResult, SyncOptions, VersionRef } from './types';

export async function syncVersions(
  contextId: string,
  contextPath: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    refsProcessed: 0,
    filesIndexed: 0,
    contentStored: 0,
    errors: [],
  };

  const provider = await getProviderForContext(contextId);
  if (!provider) return result;

  const db = getDb();
  const batchSize = options.batchSize ?? 50;
  const maxDepth = options.maxDepth ?? 100;

  let lastSyncRef: string | null = null;
  if (!options.force) {
    const providerRow = await db.execute({
      sql: 'SELECT last_sync_ref FROM version_providers WHERE context_id = ?',
      args: [contextId],
    });
    if (providerRow.rows.length > 0) {
      lastSyncRef = providerRow.rows[0]!.last_sync_ref as string | null;
    }
  }

  const refs = await provider.listRefs(contextPath, { limit: maxDepth });
  const refsToProcess: VersionRef[] = [];

  for (const ref of refs) {
    if (lastSyncRef && ref.id === lastSyncRef) break;
    refsToProcess.push(ref);
  }

  refsToProcess.reverse();

  for (let i = 0; i < refsToProcess.length; i += batchSize) {
    const batch = refsToProcess.slice(i, i + batchSize);

    for (const ref of batch) {
      try {
        await db.execute({
          sql: `INSERT INTO version_refs (id, context_id, ref_type, name, parent_ids, timestamp, message, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING`,
          args: [
            ref.id,
            contextId,
            ref.refType,
            ref.name,
            JSON.stringify(ref.parentIds),
            ref.timestamp,
            ref.message ?? null,
            JSON.stringify(ref.metadata),
          ],
        });

        const parentRef = ref.parentIds[0] ?? null;
        const diff = await provider.getDiff(contextPath, parentRef, ref.id);

        for (const change of diff.changes) {
          if (change.status === 'deleted') {
            await db.execute({
              sql: `INSERT INTO asset_versions (context_id, key, version_ref_id, content_hash, status, renamed_from)
                    VALUES (?, ?, ?, '', ?, ?)
                    ON CONFLICT(context_id, key, version_ref_id) DO NOTHING`,
              args: [
                contextId,
                change.key,
                ref.id,
                change.status,
                change.renamedFrom ?? null,
              ],
            });
            continue;
          }

          const contentHash = await provider.getContentHash(
            contextPath,
            change.key,
            ref.id,
          );
          if (!contentHash) continue;

          await db.execute({
            sql: `INSERT INTO asset_versions (context_id, key, version_ref_id, content_hash, status, renamed_from)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(context_id, key, version_ref_id) DO NOTHING`,
            args: [
              contextId,
              change.key,
              ref.id,
              contentHash,
              change.status,
              change.renamedFrom ?? null,
            ],
          });

          const contentExists = await db.execute({
            sql: 'SELECT 1 FROM content_store WHERE content_hash = ?',
            args: [contentHash],
          });

          if (contentExists.rows.length === 0) {
            const content = await provider.getContent(
              contextPath,
              change.key,
              ref.id,
            );
            if (content) {
              const now = new Date().toISOString();
              await db.execute({
                sql: `INSERT INTO content_store (content_hash, content, size_bytes, last_accessed_at, created_at)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(content_hash) DO NOTHING`,
                args: [contentHash, content, content.length, now, now],
              });
              result.contentStored++;
            }
          }

          await db.execute({
            sql: `INSERT INTO content_refs (content_hash, context_id, is_head, version_ref_id)
                  VALUES (?, ?, 0, ?)
                  ON CONFLICT(content_hash, context_id, version_ref_id) DO NOTHING`,
            args: [contentHash, contextId, ref.id],
          });

          result.filesIndexed++;
        }

        result.refsProcessed++;
      } catch (err) {
        result.errors.push(`Error processing ref ${ref.id}: ${err}`);
      }
    }
  }

  if (refsToProcess.length > 0) {
    const latestRef = refsToProcess[refsToProcess.length - 1]!;
    await db.execute({
      sql: 'UPDATE version_providers SET last_sync_ref = ?, last_sync_at = ? WHERE context_id = ?',
      args: [latestRef.id, new Date().toISOString(), contextId],
    });
  }

  return result;
}

export async function getLastSyncRef(
  contextId: string,
): Promise<string | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT last_sync_ref FROM version_providers WHERE context_id = ?',
    args: [contextId],
  });
  if (result.rows.length === 0) return null;
  return result.rows[0]!.last_sync_ref as string | null;
}
