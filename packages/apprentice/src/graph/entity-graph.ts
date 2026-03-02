import type { Client, InValue } from '@libsql/client';
import type { Entity, EntityFilter, EntityGraph } from './types';
import { isFileUri, isEventUri } from './uri';
import {
  getAssetAsEntity,
  getEventAsEntity,
  queryAssetsAsEntities,
  queryEventsAsEntities,
} from './adapters';

export function createEntityGraph(db: Client): EntityGraph {
  return {
    async upsert(entity: Entity): Promise<void> {
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO entities (uri, type, attrs, version, synced_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(uri) DO UPDATE SET
                type = excluded.type,
                attrs = excluded.attrs,
                version = excluded.version,
                synced_at = excluded.synced_at,
                updated_at = excluded.updated_at`,
        args: [
          entity.uri,
          entity.type,
          JSON.stringify(entity.attrs),
          entity.version ?? null,
          entity.syncedAt ?? null,
          now,
          now,
        ],
      });
    },

    async get(uri: string, _version?: string): Promise<Entity | null> {
      const result = await db.execute({
        sql: 'SELECT * FROM entities WHERE uri = ?',
        args: [uri],
      });

      if (result.rows.length > 0) {
        return rowToEntity(result.rows[0]!);
      }

      if (isFileUri(uri)) {
        return getAssetAsEntity(db, uri);
      }

      if (isEventUri(uri)) {
        return getEventAsEntity(db, uri);
      }

      return null;
    },

    async delete(uri: string): Promise<void> {
      await db.execute({
        sql: 'DELETE FROM entities WHERE uri = ?',
        args: [uri],
      });
    },

    async link(
      from: string,
      to: string,
      type: string,
      attrs?: Record<string, unknown>,
    ): Promise<void> {
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO entity_links (source_uri, target_uri, type, attrs, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(source_uri, target_uri, type) DO UPDATE SET
                attrs = excluded.attrs`,
        args: [from, to, type, JSON.stringify(attrs ?? {}), now],
      });
    },

    async unlink(from: string, to: string, type: string): Promise<void> {
      await db.execute({
        sql: 'DELETE FROM entity_links WHERE source_uri = ? AND target_uri = ? AND type = ?',
        args: [from, to, type],
      });
    },

    async traverse(uri: string, depth = 1): Promise<Entity[]> {
      if (depth < 1) return [];

      const visited = new Set<string>();
      const result: Entity[] = [];
      const queue: { uri: string; currentDepth: number }[] = [
        { uri, currentDepth: 0 },
      ];

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (visited.has(item.uri) || item.currentDepth > depth) continue;
        visited.add(item.uri);

        if (item.uri !== uri) {
          const entity = await this.get(item.uri);
          if (entity) result.push(entity);
        }

        if (item.currentDepth < depth) {
          const links = await db.execute({
            sql: 'SELECT target_uri FROM entity_links WHERE source_uri = ?',
            args: [item.uri],
          });

          for (const row of links.rows) {
            const targetUri = row.target_uri as string;
            if (!visited.has(targetUri)) {
              queue.push({ uri: targetUri, currentDepth: item.currentDepth + 1 });
            }
          }
        }
      }

      return result;
    },

    async query(filter: EntityFilter): Promise<Entity[]> {
      const results: Entity[] = [];
      const wantsFiles = !filter.types || filter.types.includes('file');
      const wantsEvents = !filter.types || filter.types.includes('event');
      const wantsOther =
        !filter.types ||
        filter.types.some((t) => t !== 'file' && t !== 'event');

      if (wantsOther) {
        let sql = 'SELECT * FROM entities WHERE 1=1';
        const args: InValue[] = [];

        if (filter.types && filter.types.length > 0) {
          const otherTypes = filter.types.filter(
            (t) => t !== 'file' && t !== 'event',
          );
          if (otherTypes.length > 0) {
            sql += ` AND type IN (${otherTypes.map(() => '?').join(', ')})`;
            args.push(...otherTypes);
          } else if (!wantsFiles && !wantsEvents) {
            sql += ' AND 1=0';
          }
        }

        if (filter.uriPrefix) {
          sql += ' AND uri LIKE ?';
          args.push(`${filter.uriPrefix}%`);
        }

        if (filter.attrs) {
          for (const [key, value] of Object.entries(filter.attrs)) {
            sql += ` AND json_extract(attrs, '$.${key}') = ?`;
            args.push(JSON.stringify(value) as InValue);
          }
        }

        sql += ' ORDER BY updated_at DESC';

        if (filter.limit) {
          sql += ' LIMIT ?';
          args.push(filter.limit);
        }

        if (filter.offset) {
          sql += ' OFFSET ?';
          args.push(filter.offset);
        }

        const result = await db.execute({ sql, args });
        results.push(...result.rows.map(rowToEntity));
      }

      if (wantsFiles) {
        const fileEntities = await queryAssetsAsEntities(db, filter);
        results.push(...fileEntities);
      }

      if (wantsEvents) {
        const eventEntities = await queryEventsAsEntities(db, filter);
        results.push(...eventEntities);
      }

      results.sort((a, b) => {
        const aTime = a.syncedAt || '';
        const bTime = b.syncedAt || '';
        return bTime.localeCompare(aTime);
      });

      if (filter.limit) {
        return results.slice(0, filter.limit);
      }

      return results;
    },
  };
}

function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    uri: row.uri as string,
    type: row.type as string,
    attrs: JSON.parse((row.attrs as string) || '{}'),
    version: (row.version as string) || undefined,
    syncedAt: (row.synced_at as string) || undefined,
  };
}
