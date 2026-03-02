import type { Client } from '@libsql/client';
import { uuidv7 } from 'uuidv7';
import type {
  Envelope,
  EventBus,
  EventFilter,
  EventHandler,
  QueryOptions,
  Subscription,
} from './types';
import type { EntityGraph } from '../graph/types';
import { eventUri } from '../graph/uri';

export interface EventBusOptions {
  entityGraph?: EntityGraph;
}

interface SubscriptionEntry {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return value === prefix || value.startsWith(prefix + '.');
  }
  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

function matchesFilter(envelope: Envelope, filter: EventFilter): boolean {
  if (filter.types && filter.types.length > 0) {
    if (!filter.types.some((t) => matchesPattern(envelope.type, t))) {
      return false;
    }
  }

  if (filter.sources && filter.sources.length > 0) {
    if (!filter.sources.some((s) => matchesPattern(envelope.source, s))) {
      return false;
    }
  }

  if (filter.subjects && filter.subjects.length > 0) {
    if (!envelope.subject) return false;
    if (!filter.subjects.some((s) => matchesPattern(envelope.subject!, s))) {
      return false;
    }
  }

  if (filter.since && envelope.timestamp < filter.since) {
    return false;
  }

  if (filter.until && envelope.timestamp > filter.until) {
    return false;
  }

  return true;
}

export function createEventBus(
  db: Client,
  options: EventBusOptions = {},
): EventBus {
  const subscriptions = new Map<string, SubscriptionEntry>();
  const { entityGraph } = options;

  return {
    async publish(
      input: Omit<Envelope, 'id' | 'timestamp'>,
    ): Promise<Envelope> {
      const envelope: Envelope = {
        id: uuidv7(),
        timestamp: new Date().toISOString(),
        ...input,
      };

      const message =
        typeof envelope.data === 'string'
          ? envelope.data
          : JSON.stringify(envelope.data);

      await db.execute({
        sql: `INSERT INTO events (id, timestamp, type, source, subject, data, message, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          envelope.id,
          envelope.timestamp,
          envelope.type,
          envelope.source,
          envelope.subject ?? null,
          JSON.stringify(envelope.data),
          message,
          JSON.stringify(envelope.metadata),
        ],
      });

      if (entityGraph) {
        await entityGraph.upsert({
          uri: eventUri(envelope.id),
          type: 'event',
          attrs: {
            eventType: envelope.type,
            source: envelope.source,
            subject: envelope.subject,
            data: envelope.data,
            ...envelope.metadata,
          },
          syncedAt: envelope.timestamp,
        });
      }

      for (const sub of subscriptions.values()) {
        if (matchesFilter(envelope, sub.filter)) {
          try {
            await sub.handler(envelope);
          } catch (err) {
            console.error(`Event handler error (${sub.id}):`, err);
          }
        }
      }

      return envelope;
    },

    subscribe(filter: EventFilter, handler: EventHandler): Subscription {
      const id = uuidv7();
      subscriptions.set(id, { id, filter, handler });

      return {
        id,
        unsubscribe: () => {
          subscriptions.delete(id);
        },
      };
    },

    unsubscribe(subscriptionId: string): void {
      subscriptions.delete(subscriptionId);
    },

    async query(
      filter: EventFilter,
      options: QueryOptions = {},
    ): Promise<Envelope[]> {
      const limit = options.limit ?? 100;
      const offset = options.offset ?? 0;
      const order = options.order ?? 'desc';

      let sql = 'SELECT * FROM events WHERE 1=1';
      const args: unknown[] = [];

      if (filter.types && filter.types.length > 0) {
        const nonWildcard = filter.types.filter(
          (t) => !t.includes('*'),
        );
        const prefixes = filter.types
          .filter((t) => t.endsWith('*'))
          .map((t) => t.slice(0, -1));

        const conditions: string[] = [];

        if (nonWildcard.length > 0) {
          conditions.push(
            `type IN (${nonWildcard.map(() => '?').join(', ')})`,
          );
          args.push(...nonWildcard);
        }

        for (const prefix of prefixes) {
          conditions.push('type LIKE ?');
          args.push(`${prefix}%`);
        }

        if (conditions.length > 0) {
          sql += ` AND (${conditions.join(' OR ')})`;
        }
      }

      if (filter.sources && filter.sources.length > 0) {
        const nonWildcard = filter.sources.filter(
          (s) => !s.includes('*'),
        );
        const prefixes = filter.sources
          .filter((s) => s.endsWith('*'))
          .map((s) => s.slice(0, -1));

        const conditions: string[] = [];

        if (nonWildcard.length > 0) {
          conditions.push(
            `source IN (${nonWildcard.map(() => '?').join(', ')})`,
          );
          args.push(...nonWildcard);
        }

        for (const prefix of prefixes) {
          conditions.push('source LIKE ?');
          args.push(`${prefix}%`);
        }

        if (conditions.length > 0) {
          sql += ` AND (${conditions.join(' OR ')})`;
        }
      }

      if (filter.subjects && filter.subjects.length > 0) {
        const nonWildcard = filter.subjects.filter(
          (s) => !s.includes('*'),
        );
        const prefixes = filter.subjects
          .filter((s) => s.endsWith('*'))
          .map((s) => s.slice(0, -1));

        const conditions: string[] = [];

        if (nonWildcard.length > 0) {
          conditions.push(
            `subject IN (${nonWildcard.map(() => '?').join(', ')})`,
          );
          args.push(...nonWildcard);
        }

        for (const prefix of prefixes) {
          conditions.push('subject LIKE ?');
          args.push(`${prefix}%`);
        }

        if (conditions.length > 0) {
          sql += ` AND (${conditions.join(' OR ')})`;
        }
      }

      if (filter.since) {
        sql += ' AND timestamp >= ?';
        args.push(filter.since);
      }

      if (filter.until) {
        sql += ' AND timestamp <= ?';
        args.push(filter.until);
      }

      sql += ` ORDER BY timestamp ${order.toUpperCase()}`;
      sql += ' LIMIT ? OFFSET ?';
      args.push(limit, offset);

      const result = await db.execute({ sql, args: args as any });

      return result.rows.map((row) => ({
        id: row.id as string,
        timestamp: row.timestamp as string,
        type: (row.type as string) || 'unknown',
        source: (row.source as string) || '',
        subject: (row.subject as string) || undefined,
        data: JSON.parse((row.data as string) || '{}'),
        metadata: JSON.parse((row.metadata as string) || '{}'),
      }));
    },
  };
}
