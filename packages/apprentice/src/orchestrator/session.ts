import type { Client } from '@libsql/client';
import { uuidv7 } from 'uuidv7';
import type { Session, SessionConfig, SessionFilter, SessionManager } from './types';
import type { Envelope } from '../events/types';

export function createSessionManager(db: Client): SessionManager {
  return {
    async create(config: SessionConfig): Promise<Session> {
      const id = uuidv7();
      const now = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO sessions (id, skill_id, status, started_at, metadata)
              VALUES (?, ?, 'pending', ?, ?)`,
        args: [id, config.skillId, now, JSON.stringify(config.metadata ?? {})],
      });

      return {
        id,
        skillId: config.skillId,
        status: 'pending',
        startedAt: now,
        events: [],
        metadata: config.metadata ?? {},
      };
    },

    async get(sessionId: string): Promise<Session | null> {
      const result = await db.execute({
        sql: 'SELECT * FROM sessions WHERE id = ?',
        args: [sessionId],
      });

      if (result.rows.length === 0) return null;

      const row = result.rows[0]!;
      const events = await getSessionEvents(db, sessionId);

      return {
        id: row.id as string,
        skillId: row.skill_id as string,
        status: row.status as Session['status'],
        startedAt: row.started_at as string,
        completedAt: (row.completed_at as string) || undefined,
        events,
        result: row.result ? JSON.parse(row.result as string) : undefined,
        error: (row.error as string) || undefined,
        metadata: JSON.parse((row.metadata as string) || '{}'),
      };
    },

    async update(
      sessionId: string,
      updates: Partial<Pick<Session, 'status' | 'result' | 'error' | 'completedAt'>>,
    ): Promise<void> {
      const sets: string[] = [];
      const args: unknown[] = [];

      if (updates.status !== undefined) {
        sets.push('status = ?');
        args.push(updates.status);
      }

      if (updates.completedAt !== undefined) {
        sets.push('completed_at = ?');
        args.push(updates.completedAt);
      }

      if (updates.result !== undefined) {
        sets.push('result = ?');
        args.push(JSON.stringify(updates.result));
      }

      if (updates.error !== undefined) {
        sets.push('error = ?');
        args.push(updates.error);
      }

      if (sets.length === 0) return;

      args.push(sessionId);

      await db.execute({
        sql: `UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`,
        args: args as any,
      });
    },

    async addEvent(sessionId: string, eventId: string): Promise<void> {
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT OR IGNORE INTO session_events (session_id, event_id, created_at)
              VALUES (?, ?, ?)`,
        args: [sessionId, eventId, now],
      });
    },

    async cancel(sessionId: string): Promise<void> {
      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE sessions SET status = 'cancelled', completed_at = ? WHERE id = ? AND status IN ('pending', 'running')`,
        args: [now, sessionId],
      });
    },

    async list(filter: SessionFilter = {}): Promise<Session[]> {
      let sql = 'SELECT * FROM sessions WHERE 1=1';
      const args: unknown[] = [];

      if (filter.status) {
        if (Array.isArray(filter.status)) {
          sql += ` AND status IN (${filter.status.map(() => '?').join(', ')})`;
          args.push(...filter.status);
        } else {
          sql += ' AND status = ?';
          args.push(filter.status);
        }
      }

      if (filter.skillId) {
        sql += ' AND skill_id = ?';
        args.push(filter.skillId);
      }

      if (filter.since) {
        sql += ' AND started_at >= ?';
        args.push(filter.since);
      }

      if (filter.until) {
        sql += ' AND started_at <= ?';
        args.push(filter.until);
      }

      sql += ' ORDER BY started_at DESC';

      if (filter.limit) {
        sql += ' LIMIT ?';
        args.push(filter.limit);
      }

      if (filter.offset) {
        sql += ' OFFSET ?';
        args.push(filter.offset);
      }

      const result = await db.execute({ sql, args: args as any });

      const sessions: Session[] = [];
      for (const row of result.rows) {
        const id = row.id as string;
        const events = await getSessionEvents(db, id);

        sessions.push({
          id,
          skillId: row.skill_id as string,
          status: row.status as Session['status'],
          startedAt: row.started_at as string,
          completedAt: (row.completed_at as string) || undefined,
          events,
          result: row.result ? JSON.parse(row.result as string) : undefined,
          error: (row.error as string) || undefined,
          metadata: JSON.parse((row.metadata as string) || '{}'),
        });
      }

      return sessions;
    },
  };
}

async function getSessionEvents(db: Client, sessionId: string): Promise<Envelope[]> {
  const result = await db.execute({
    sql: `SELECT e.* FROM events e
          JOIN session_events se ON se.event_id = e.id
          WHERE se.session_id = ?
          ORDER BY e.timestamp ASC`,
    args: [sessionId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    timestamp: row.timestamp as string,
    type: (row.type as string) || 'unknown',
    source: (row.source as string) || '',
    subject: (row.subject as string) || undefined,
    data: JSON.parse((row.data as string) || '{}'),
    metadata: JSON.parse((row.metadata as string) || '{}'),
  }));
}
