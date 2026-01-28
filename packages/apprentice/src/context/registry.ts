import { getDb } from '../db';
import type { Context, ContextInput } from '../types';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detectProvider,
  configureVersionProvider,
} from '../versioning/registry';
import '../versioning';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\/[/]+/g, '/')
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateContextId(path: string): string {
  const folderName = path.split('/').filter(Boolean).pop() || 'context';
  return slugify(folderName);
}

export interface AddContextOptions extends ContextInput {
  noVersioning?: boolean;
  versionBranches?: string[];
}

export async function addContext(
  path: string,
  options: AddContextOptions = {},
): Promise<Context> {
  const db = getDb();

  const resolvedPath = resolve(path);
  const realPath = existsSync(resolvedPath)
    ? realpathSync(resolvedPath)
    : resolvedPath;

  if (!existsSync(realPath)) {
    throw new Error(`Path does not exist: ${realPath}`);
  }

  const existing = await db.execute({
    sql: 'SELECT id FROM contexts WHERE path = ?',
    args: [realPath],
  });

  if (existing.rows.length > 0) {
    const existingRow = existing.rows[0];
    throw new Error(
      `Context already registered for path: ${realPath} (id: ${existingRow?.id})`,
    );
  }

  const id = options.name ? slugify(options.name) : generateContextId(realPath);
  const name = options.name || realPath.split('/').filter(Boolean).pop() || id;
  const includePatterns = options.include_patterns || ['**/*'];
  const excludePatterns = options.exclude_patterns || [];
  const registeredAt = new Date().toISOString();

  let versionProviderType: string | null = null;
  if (!options.noVersioning) {
    const detectedProvider = await detectProvider(realPath);
    if (detectedProvider) {
      versionProviderType = detectedProvider;
    }
  }

  await db.execute({
    sql: `
      INSERT INTO contexts (id, name, path, extra_paths, enabled, include_patterns, exclude_patterns, registered_at, version_provider_type)
      VALUES (?, ?, ?, '[]', 1, ?, ?, ?, ?)
    `,
    args: [
      id,
      name,
      realPath,
      JSON.stringify(includePatterns),
      JSON.stringify(excludePatterns),
      registeredAt,
      versionProviderType,
    ],
  });

  if (versionProviderType) {
    await configureVersionProvider(id, versionProviderType as any, {
      branches: options.versionBranches,
    });
  }

  return {
    id,
    name,
    path: realPath,
    mounts: [],
    enabled: true,
    include_patterns: includePatterns,
    exclude_patterns: excludePatterns,
    registered_at: registeredAt,
    version_provider_type: versionProviderType ?? undefined,
  };
}

export interface ContextWithCounts extends Context {
  asset_count: number;
}

export async function listContexts(): Promise<ContextWithCounts[]> {
  const db = getDb();
  const result = await db.execute(`
    SELECT c.*, COALESCE(a.asset_count, 0) as asset_count
    FROM contexts c
    LEFT JOIN (
      SELECT context_id, COUNT(*) as asset_count
      FROM assets
      GROUP BY context_id
    ) a ON c.id = a.context_id
    ORDER BY c.name
  `);

  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    mounts: JSON.parse((row.extra_paths as string) || '[]'),
    enabled: Boolean(row.enabled),
    include_patterns: JSON.parse(row.include_patterns as string),
    exclude_patterns: JSON.parse(row.exclude_patterns as string),
    registered_at: row.registered_at as string,
    last_indexed_at: (row.last_indexed_at as string) || undefined,
    version_provider_type: (row.version_provider_type as string) || undefined,
    asset_count: row.asset_count as number,
  }));
}

export async function getContext(id: string): Promise<Context | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM contexts WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0]!;
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    mounts: JSON.parse((row.extra_paths as string) || '[]'),
    enabled: Boolean(row.enabled),
    include_patterns: JSON.parse(row.include_patterns as string),
    exclude_patterns: JSON.parse(row.exclude_patterns as string),
    registered_at: row.registered_at as string,
    last_indexed_at: (row.last_indexed_at as string) || undefined,
    version_provider_type: (row.version_provider_type as string) || undefined,
  };
}

export async function updateContext(
  id: string,
  updates: Partial<
    Pick<Context, 'name' | 'path' | 'include_patterns' | 'exclude_patterns'>
  >,
): Promise<Context> {
  const db = getDb();

  const existing = await getContext(id);
  if (!existing) {
    throw new Error(`Context not found: ${id}`);
  }

  const setClauses: string[] = [];
  const args: (string | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    args.push(updates.name);
  }
  if (updates.path !== undefined) {
    const resolvedPath = resolve(updates.path);
    const realPath = existsSync(resolvedPath)
      ? realpathSync(resolvedPath)
      : resolvedPath;
    if (!existsSync(realPath)) {
      throw new Error(`Path does not exist: ${realPath}`);
    }
    setClauses.push('path = ?');
    args.push(realPath);
  }
  if (updates.include_patterns !== undefined) {
    setClauses.push('include_patterns = ?');
    args.push(JSON.stringify(updates.include_patterns));
  }
  if (updates.exclude_patterns !== undefined) {
    setClauses.push('exclude_patterns = ?');
    args.push(JSON.stringify(updates.exclude_patterns));
  }

  if (setClauses.length === 0) {
    return existing;
  }

  args.push(id);

  await db.execute({
    sql: `UPDATE contexts SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  return (await getContext(id))!;
}

export async function enableContext(id: string): Promise<void> {
  const db = getDb();
  const result = await db.execute({
    sql: 'UPDATE contexts SET enabled = 1 WHERE id = ?',
    args: [id],
  });

  if (result.rowsAffected === 0) {
    throw new Error(`Context not found: ${id}`);
  }
}

export async function disableContext(id: string): Promise<void> {
  const db = getDb();
  const result = await db.execute({
    sql: 'UPDATE contexts SET enabled = 0 WHERE id = ?',
    args: [id],
  });

  if (result.rowsAffected === 0) {
    throw new Error(`Context not found: ${id}`);
  }
}

export async function removeContext(id: string): Promise<void> {
  const db = getDb();
  const result = await db.execute({
    sql: 'DELETE FROM contexts WHERE id = ?',
    args: [id],
  });

  if (result.rowsAffected === 0) {
    throw new Error(`Context not found: ${id}`);
  }
}

export async function addPathToContext(
  contextId: string,
  path: string,
  mount: string,
): Promise<Context> {
  const db = getDb();

  const context = await getContext(contextId);
  if (!context) {
    throw new Error(`Context not found: ${contextId}`);
  }

  const resolvedPath = resolve(path);
  const realPath = existsSync(resolvedPath)
    ? realpathSync(resolvedPath)
    : resolvedPath;

  if (!existsSync(realPath)) {
    throw new Error(`Path does not exist: ${realPath}`);
  }

  // Normalize mount point (remove leading/trailing slashes)
  const normalizedMount = mount.replace(/^\/+|\/+$/g, '');
  if (!normalizedMount) {
    throw new Error('Mount point cannot be empty');
  }

  // Check if path is already the main path
  if (context.path === realPath) {
    throw new Error(`Path is already the main path for context '${contextId}'`);
  }

  // Check if path is already mounted
  if (context.mounts.some((m) => m.path === realPath)) {
    throw new Error(`Path already mounted in context '${contextId}'`);
  }

  // Check if mount point is already used
  if (context.mounts.some((m) => m.mount === normalizedMount)) {
    throw new Error(`Mount point '${normalizedMount}' already in use`);
  }

  const updatedMounts = [
    ...context.mounts,
    { path: realPath, mount: normalizedMount },
  ];

  await db.execute({
    sql: 'UPDATE contexts SET extra_paths = ? WHERE id = ?',
    args: [JSON.stringify(updatedMounts), contextId],
  });

  return (await getContext(contextId))!;
}

export async function removePathFromContext(
  contextId: string,
  mountOrPath: string,
): Promise<Context> {
  const db = getDb();

  const context = await getContext(contextId);
  if (!context) {
    throw new Error(`Context not found: ${contextId}`);
  }

  // Try to match by mount point first, then by path
  const normalizedMount = mountOrPath.replace(/^\/+|\/+$/g, '');
  let matchIndex = context.mounts.findIndex((m) => m.mount === normalizedMount);

  if (matchIndex === -1) {
    // Try matching by path
    const resolvedPath = resolve(mountOrPath);
    const realPath = existsSync(resolvedPath)
      ? realpathSync(resolvedPath)
      : resolvedPath;
    matchIndex = context.mounts.findIndex((m) => m.path === realPath);
  }

  if (matchIndex === -1) {
    throw new Error(
      `Mount '${mountOrPath}' not found in context '${contextId}'`,
    );
  }

  const updatedMounts = context.mounts.filter((_, i) => i !== matchIndex);

  await db.execute({
    sql: 'UPDATE contexts SET extra_paths = ? WHERE id = ?',
    args: [JSON.stringify(updatedMounts), contextId],
  });

  return (await getContext(contextId))!;
}
