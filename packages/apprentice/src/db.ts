import { createClient, type Client } from '@libsql/client';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { paths } from './config';
import type { Context } from './types';

let db: Client | null = null;

/**
 * Initialize and get the database connection
 * @param skipSchema - Skip schema initialization (useful for checkpoint-only operations)
 */
export function getDb(skipSchema = false): Client {
  if (db) return db;

  // Ensure directory exists
  const dbDir = dirname(paths.database);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = createClient({
    url: `file:${paths.database}`,
  });

  // Enable WAL mode for better concurrent access (reduces SQLITE_BUSY errors)
  db.execute('PRAGMA journal_mode = WAL').catch(console.error);
  // Set busy timeout to 30 seconds - will wait instead of failing immediately
  db.execute('PRAGMA busy_timeout = 30000').catch(console.error);
  // Enable foreign keys
  db.execute('PRAGMA foreign_keys = ON').catch(console.error);

  // Initialize schema (async but we don't wait - it's idempotent)
  if (!skipSchema) {
    initSchema(db).catch(console.error);
  }

  return db;
}

/**
 * Ensure schema is initialized (call this before first use)
 */
export async function ensureSchema(): Promise<void> {
  const db = getDb();
  await initSchema(db);
}

async function initSchema(db: Client): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      extra_paths TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      include_patterns TEXT NOT NULL DEFAULT '["**/*"]',
      exclude_patterns TEXT NOT NULL DEFAULT '[]',
      registered_at TEXT NOT NULL,
      last_indexed_at TEXT,
      version_provider_type TEXT
    )
  `);

  await db
    .execute(`ALTER TABLE contexts ADD COLUMN version_provider_type TEXT`)
    .catch(() => {});

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_contexts_enabled ON contexts(enabled)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL,
      key TEXT NOT NULL,
      extension TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      head_version_ref TEXT,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
      UNIQUE(context_id, key)
    )
  `);

  await db
    .execute(`ALTER TABLE assets ADD COLUMN head_version_ref TEXT`)
    .catch(() => {});

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_assets_context ON assets(context_id)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_assets_extension ON assets(extension)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_assets_content_hash ON assets(content_hash)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_assets_indexed_at ON assets(indexed_at)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS content_store (
      content_hash TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      last_accessed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_content_store_last_accessed ON content_store(last_accessed_at)`,
  );

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS content_store_fts USING fts5(
      content_hash,
      content,
      content='content_store',
      content_rowid='rowid'
    )
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS content_store_fts_ai AFTER INSERT ON content_store BEGIN
      INSERT INTO content_store_fts(rowid, content_hash, content)
      VALUES (new.rowid, new.content_hash, new.content);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS content_store_fts_ad AFTER DELETE ON content_store BEGIN
      INSERT INTO content_store_fts(content_store_fts, rowid, content_hash, content)
      VALUES ('delete', old.rowid, old.content_hash, old.content);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS content_store_fts_au AFTER UPDATE ON content_store BEGIN
      INSERT INTO content_store_fts(content_store_fts, rowid, content_hash, content)
      VALUES ('delete', old.rowid, old.content_hash, old.content);
      INSERT INTO content_store_fts(rowid, content_hash, content)
      VALUES (new.rowid, new.content_hash, new.content);
    END
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS version_providers (
      context_id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_sync_ref TEXT,
      last_sync_at TEXT,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS version_refs (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL,
      ref_type TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_ids TEXT NOT NULL DEFAULT '[]',
      timestamp TEXT NOT NULL,
      message TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_version_refs_context ON version_refs(context_id)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_version_refs_timestamp ON version_refs(timestamp)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_version_refs_name ON version_refs(name)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS asset_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id TEXT NOT NULL,
      key TEXT NOT NULL,
      version_ref_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      renamed_from TEXT,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
      FOREIGN KEY (version_ref_id) REFERENCES version_refs(id) ON DELETE CASCADE,
      UNIQUE(context_id, key, version_ref_id)
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_asset_versions_context_key ON asset_versions(context_id, key)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_asset_versions_ref ON asset_versions(version_ref_id)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_asset_versions_hash ON asset_versions(content_hash)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS content_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_hash TEXT NOT NULL,
      context_id TEXT NOT NULL,
      is_head INTEGER NOT NULL DEFAULT 0,
      version_ref_id TEXT,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
      FOREIGN KEY (version_ref_id) REFERENCES version_refs(id) ON DELETE CASCADE,
      UNIQUE(content_hash, context_id, version_ref_id)
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_content_refs_hash ON content_refs(content_hash)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_content_refs_head ON content_refs(is_head)`,
  );
  // Partial unique index to prevent duplicate head refs (NULL version_ref_id bypasses the table UNIQUE constraint)
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_content_refs_head_unique ON content_refs(content_hash, context_id) WHERE is_head = 1`,
  );

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
      id,
      key,
      metadata,
      content='assets',
      content_rowid='rowid'
    )
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS assets_fts_ai AFTER INSERT ON assets BEGIN
      INSERT INTO assets_fts(rowid, id, key, metadata)
      VALUES (new.rowid, new.id, new.key, new.metadata);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS assets_fts_ad AFTER DELETE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, id, key, metadata)
      VALUES ('delete', old.rowid, old.id, old.key, old.metadata);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS assets_fts_au AFTER UPDATE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, id, key, metadata)
      VALUES ('delete', old.rowid, old.id, old.key, old.metadata);
      INSERT INTO assets_fts(rowid, id, key, metadata)
      VALUES (new.rowid, new.id, new.key, new.metadata);
    END
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS asset_embeddings (
      asset_id TEXT PRIMARY KEY,
      embedding F32_BLOB(768),
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`,
  );

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
      id,
      message,
      metadata,
      content='events',
      content_rowid='rowid'
    )
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS events_fts_ai AFTER INSERT ON events BEGIN
      INSERT INTO events_fts(rowid, id, message, metadata)
      VALUES (new.rowid, new.id, new.message, new.metadata);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS events_fts_ad AFTER DELETE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, id, message, metadata)
      VALUES ('delete', old.rowid, old.id, old.message, old.metadata);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS events_fts_au AFTER UPDATE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, id, message, metadata)
      VALUES ('delete', old.rowid, old.id, old.message, old.metadata);
      INSERT INTO events_fts(rowid, id, message, metadata)
      VALUES (new.rowid, new.id, new.message, new.metadata);
    END
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_embeddings (
      event_id TEXT PRIMARY KEY,
      embedding F32_BLOB(768),
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      content_hash TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_embedding_cache_model ON embedding_cache(model)`,
  );

  try {
    await db.execute(`
      CREATE INDEX IF NOT EXISTS asset_embeddings_vec_idx 
      ON asset_embeddings(libsql_vector_idx(embedding))
    `);
  } catch {
    // Vector index creation may fail if not supported
  }

  try {
    await db.execute(`
      CREATE INDEX IF NOT EXISTS event_embeddings_vec_idx 
      ON event_embeddings(libsql_vector_idx(embedding))
    `);
  } catch {
    // Vector index creation may fail if not supported
  }

  await migrateAssetContent(db);
}

async function migrateAssetContent(db: Client): Promise<void> {
  const tableExists = await db.execute(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='asset_content'
  `);
  if (tableExists.rows.length === 0) return;

  const result = await db.execute(`
    SELECT ac.asset_id, ac.content, a.content_hash, a.context_id
    FROM asset_content ac
    JOIN assets a ON a.id = ac.asset_id
    WHERE a.content_hash != ''
  `);

  for (const row of result.rows) {
    const contentHash = row.content_hash as string;
    const content = row.content as string;
    const contextId = row.context_id as string;
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO content_store (content_hash, content, size_bytes, last_accessed_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(content_hash) DO NOTHING`,
      args: [contentHash, content, content.length, now, now],
    });

    await db.execute({
      sql: `INSERT INTO content_refs (content_hash, context_id, is_head)
            VALUES (?, ?, 1)
            ON CONFLICT(content_hash, context_id, version_ref_id) DO NOTHING`,
      args: [contentHash, contextId],
    });
  }

  await db.execute(`DROP TABLE IF EXISTS asset_content`);
}

export async function insertContext(context: Context): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO contexts 
          (id, name, path, enabled, include_patterns, exclude_patterns, registered_at, last_indexed_at, version_provider_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      context.id,
      context.name,
      context.path,
      context.enabled ? 1 : 0,
      JSON.stringify(context.include_patterns),
      JSON.stringify(context.exclude_patterns),
      context.registered_at,
      context.last_indexed_at ?? null,
      context.version_provider_type ?? null,
    ],
  });
}

export async function getContext(id: string): Promise<Context | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM contexts WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return rowToContext(result.rows[0]!);
}

export async function getAllContexts(): Promise<Context[]> {
  const db = getDb();
  const result = await db.execute('SELECT * FROM contexts ORDER BY name');
  return result.rows.map(rowToContext);
}

export async function updateContextIndexTime(
  id: string,
  timestamp: string,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE contexts SET last_indexed_at = ? WHERE id = ?',
    args: [timestamp, id],
  });
}

function rowToContext(row: Record<string, unknown>): Context {
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    mounts: JSON.parse((row.extra_paths as string) || '[]'),
    enabled: (row.enabled as number) === 1,
    include_patterns: JSON.parse(row.include_patterns as string),
    exclude_patterns: JSON.parse(row.exclude_patterns as string),
    registered_at: row.registered_at as string,
    last_indexed_at: row.last_indexed_at as string | undefined,
    version_provider_type: row.version_provider_type as string | undefined,
  };
}

export async function getIndexerState(key: string): Promise<any | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM indexer_state WHERE key = ?',
    args: [key],
  });
  if (result.rows.length === 0 || !result.rows[0]) return null;
  return JSON.parse(result.rows[0].value as string);
}

export async function updateIndexerState(
  key: string,
  value: any,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO indexer_state (key, value, updated_at)
          VALUES (?, ?, ?)`,
    args: [key, JSON.stringify(value), new Date().toISOString()],
  });
}

/**
 * Run a WAL checkpoint to flush the WAL file to the main database.
 * This is important to prevent the WAL file from growing unboundedly.
 *
 * @param mode - Checkpoint mode:
 *   - 'PASSIVE': Checkpoint as much as possible without waiting (default)
 *   - 'FULL': Wait for all readers, then checkpoint
 *   - 'RESTART': Like FULL, but also restart the WAL
 *   - 'TRUNCATE': Like RESTART, but also truncate WAL to zero bytes
 * @returns Promise with checkpoint result or null if db not initialized
 */
export async function checkpoint(
  mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE',
): Promise<{ walPagesWritten: number; walPagesTotal: number } | null> {
  if (!db) return null;

  try {
    const result = await db.execute(`PRAGMA wal_checkpoint(${mode})`);
    const row = result.rows[0] as
      | { busy: number; log: number; checkpointed: number }
      | undefined;
    if (row) {
      return {
        walPagesWritten: row.checkpointed ?? 0,
        walPagesTotal: row.log ?? 0,
      };
    }
    return null;
  } catch (error) {
    console.error(`WAL checkpoint (${mode}) failed:`, error);
    return null;
  }
}

/**
 * Flush the WAL file completely by running a TRUNCATE checkpoint.
 * This will wait for all readers and truncate the WAL to zero bytes.
 * Use this for maintenance or before backups.
 */
export async function flushWal(): Promise<boolean> {
  const result = await checkpoint('TRUNCATE');
  if (result) {
    console.log(
      `WAL flushed: ${result.walPagesWritten}/${result.walPagesTotal} pages written`,
    );
    return true;
  }
  return false;
}

export async function closeDb(): Promise<void> {
  if (db) {
    // Checkpoint before closing to flush WAL
    await checkpoint('TRUNCATE').catch(console.error);
    db.close();
    db = null;
  }
}
