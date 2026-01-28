import { uuidv7 } from 'uuidv7';
import { getDb } from '../db';
import type { Event, Metadata } from '../types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function generateEventId(): string {
  return uuidv7();
}

function isValidTimestamp(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime()) && date.toISOString() === timestamp;
}

async function getGitInfo(
  cwd?: string,
): Promise<{ ref?: string; branch?: string } | null> {
  if (!cwd) return null;
  try {
    const [refResult, branchResult] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd }).catch(() => null),
      execFileAsync('git', ['branch', '--show-current'], { cwd }).catch(
        () => null,
      ),
    ]);

    if (!refResult) return null;

    return {
      ref: refResult.stdout.trim(),
      branch: branchResult?.stdout.trim() || undefined,
    };
  } catch {
    return null;
  }
}

export interface EventInput {
  id?: string;
  timestamp?: string;
  message: string;
  metadata?: Metadata;
  cwd?: string;
}

/**
 * Insert a single event into the database
 *
 * @param event - Event data to insert
 * @returns The created event with generated ID
 *
 * @example
 * ```typescript
 * const event = await insertEvent({
 *   message: "User ran deployment script",
 *   metadata: {
 *     shell: { exit_code: 0, duration_ms: 1234 }
 *   }
 * });
 * // event.id = "evt_a1b2c3d4e5f6g7h8"
 * ```
 */
export async function insertEvent(event: EventInput): Promise<Event> {
  const db = getDb();

  const id = event.id ?? generateEventId();
  const timestamp = event.timestamp ?? new Date().toISOString();

  if (!isValidTimestamp(timestamp)) {
    throw new Error(
      `Invalid timestamp format: ${timestamp}. Must be valid ISO 8601 string.`,
    );
  }

  const metadata: Record<string, unknown> = { ...(event.metadata ?? {}) };

  if (event.cwd) {
    const gitInfo = await getGitInfo(event.cwd);
    if (gitInfo) {
      metadata.git = {
        ...((metadata.git as Record<string, unknown>) ?? {}),
        ref: gitInfo.ref,
        branch: gitInfo.branch,
      };
    }
  }

  await db.execute({
    sql: `INSERT OR IGNORE INTO events (id, timestamp, message, metadata)
          VALUES (?, ?, ?, ?)`,
    args: [id, timestamp, event.message, JSON.stringify(metadata)],
  });

  return {
    id,
    timestamp,
    message: event.message,
    metadata,
  };
}

/**
 * Insert multiple events in a single transaction for efficiency
 *
 * @param events - Array of event inputs
 * @returns Array of created events with generated IDs
 *
 * @example
 * ```typescript
 * const events = await insertEvents([
 *   { message: "Event 1", metadata: { shell: { exit_code: 0 } } },
 *   { message: "Event 2", metadata: { shell: { exit_code: 1 } } }
 * ]);
 * ```
 */
export async function insertEvents(events: EventInput[]): Promise<Event[]> {
  const db = getDb();

  const preparedEvents: Event[] = [];

  for (const event of events) {
    const id = event.id ?? generateEventId();
    const timestamp = event.timestamp ?? new Date().toISOString();

    if (!isValidTimestamp(timestamp)) {
      throw new Error(
        `Invalid timestamp format: ${timestamp}. Must be valid ISO 8601 string.`,
      );
    }

    const metadata: Record<string, unknown> = { ...(event.metadata ?? {}) };

    if (event.cwd) {
      const gitInfo = await getGitInfo(event.cwd);
      if (gitInfo) {
        metadata.git = {
          ...((metadata.git as Record<string, unknown>) ?? {}),
          ref: gitInfo.ref,
          branch: gitInfo.branch,
        };
      }
    }

    preparedEvents.push({
      id,
      timestamp,
      message: event.message,
      metadata,
    });
  }

  await db.batch(
    preparedEvents.map((event) => ({
      sql: `INSERT OR IGNORE INTO events (id, timestamp, message, metadata)
            VALUES (?, ?, ?, ?)`,
      args: [
        event.id,
        event.timestamp,
        event.message,
        JSON.stringify(event.metadata),
      ],
    })),
  );

  return preparedEvents;
}
