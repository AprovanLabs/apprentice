import type { Envelope } from '../events/types';

export type SessionStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface Session {
  id: string;
  skillId: string;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  events: Envelope[];
  result?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface SessionConfig {
  skillId: string;
  metadata?: Record<string, unknown>;
}

export interface SessionFilter {
  status?: SessionStatus | SessionStatus[];
  skillId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface SessionManager {
  create(config: SessionConfig): Promise<Session>;
  get(sessionId: string): Promise<Session | null>;
  update(
    sessionId: string,
    updates: Partial<Pick<Session, 'status' | 'result' | 'error' | 'completedAt'>>,
  ): Promise<void>;
  addEvent(sessionId: string, eventId: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  list(filter?: SessionFilter): Promise<Session[]>;
}

export type SkillResolver = (
  envelope: Envelope,
) => Promise<string | null> | string | null;

export interface OrchestratorConfig {
  maxConcurrent?: number;
  skillResolver?: SkillResolver;
}

export interface Orchestrator {
  start(): void;
  stop(): void;
  onEvent(envelope: Envelope): Promise<void>;
  getSessionManager(): SessionManager;
}

export interface ExternalNotifier {
  notify(session: Session, event: 'started' | 'completed' | 'failed'): Promise<void>;
}
