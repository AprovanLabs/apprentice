import { getDb } from '../db';
import type {
  VersionProvider,
  VersionProviderConfig,
  ProviderType,
} from './types';

type ProviderFactory = (config: VersionProviderConfig) => VersionProvider;

const providerFactories = new Map<ProviderType, ProviderFactory>();
const providerInstances = new Map<string, VersionProvider>();

export function registerProvider(
  type: ProviderType,
  factory: ProviderFactory,
): void {
  providerFactories.set(type, factory);
}

export async function getProviderForContext(
  contextId: string,
): Promise<VersionProvider | null> {
  if (providerInstances.has(contextId)) {
    return providerInstances.get(contextId)!;
  }

  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT provider_type, config, enabled FROM version_providers WHERE context_id = ?',
    args: [contextId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  if (!(row.enabled as number)) return null;

  const providerType = row.provider_type as ProviderType;
  const config = JSON.parse(row.config as string) as VersionProviderConfig;

  const factory = providerFactories.get(providerType);
  if (!factory) return null;

  const provider = factory(config);
  providerInstances.set(contextId, provider);
  return provider;
}

export async function detectProvider(
  contextPath: string,
): Promise<ProviderType | null> {
  for (const [type, factory] of providerFactories) {
    const provider = factory({});
    if (await provider.detect(contextPath)) {
      return type;
    }
  }
  return null;
}

export async function configureVersionProvider(
  contextId: string,
  providerType: ProviderType,
  config: VersionProviderConfig = {},
): Promise<void> {
  const db = getDb();

  await db.execute({
    sql: `INSERT INTO version_providers (context_id, provider_type, config, enabled)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(context_id) DO UPDATE SET
            provider_type = excluded.provider_type,
            config = excluded.config,
            enabled = 1`,
    args: [contextId, providerType, JSON.stringify(config)],
  });

  await db.execute({
    sql: 'UPDATE contexts SET version_provider_type = ? WHERE id = ?',
    args: [providerType, contextId],
  });

  providerInstances.delete(contextId);
}

export async function disableVersionProvider(contextId: string): Promise<void> {
  const db = getDb();

  await db.execute({
    sql: 'UPDATE version_providers SET enabled = 0 WHERE context_id = ?',
    args: [contextId],
  });

  await db.execute({
    sql: 'UPDATE contexts SET version_provider_type = NULL WHERE id = ?',
    args: [contextId],
  });

  providerInstances.delete(contextId);
}

export function clearProviderCache(): void {
  providerInstances.clear();
}
