export type {
  Entity,
  EntityLink,
  EntityFilter,
  EntityGraph,
  ParsedUri,
} from './graph';
export {
  createEntityGraph,
  parseUri,
  formatUri,
  normalizeUri,
  fileUri,
  eventUri,
  isFileUri,
  isEventUri,
} from './graph';

export type {
  Envelope,
  EventBus,
  EventFilter,
  EventHandler,
  QueryOptions,
  Subscription,
} from './events';
export { createEventBus, insertEvent, insertEvents, generateEventId } from './events';
export type { EventInput } from './events';

export type {
  Session,
  SessionConfig,
  SessionFilter,
  SessionManager,
  SessionStatus,
  Orchestrator,
  OrchestratorConfig,
  SkillResolver,
  ExternalNotifier,
  CreateOrchestratorOptions,
} from './orchestrator';
export { createSessionManager, createOrchestrator } from './orchestrator';

export type {
  SearchMode,
  SearchOptions,
  SearchResult,
  SearchResponse,
  GroupingStrategy,
  RelatedContextOptions,
  RelatedContextResult,
  VersionedAssetResult,
} from './search';
export { search } from './search';

export type { Context, Asset, Event } from './types';
export { getDb, ensureSchema, closeDb, checkpoint, flushWal } from './db';

import type { Client } from '@libsql/client';
import { getDb } from './db';
import { createEntityGraph } from './graph';
import { createEventBus } from './events';
import { createSessionManager, createOrchestrator } from './orchestrator';
import type { EntityGraph } from './graph';
import type { EventBus } from './events';
import type { SessionManager, Orchestrator, SkillResolver, ExternalNotifier } from './orchestrator';

export interface ApprenticeConfig {
  db?: Client;
  skillResolver?: SkillResolver;
  notifier?: ExternalNotifier;
  maxConcurrent?: number;
}

export interface Apprentice {
  db: Client;
  entityGraph: EntityGraph;
  eventBus: EventBus;
  sessionManager: SessionManager;
  orchestrator: Orchestrator;
}

export function createApprentice(config: ApprenticeConfig = {}): Apprentice {
  const db = config.db ?? getDb();
  const entityGraph = createEntityGraph(db);
  const eventBus = createEventBus(db, { entityGraph });
  const sessionManager = createSessionManager(db);
  const orchestrator = createOrchestrator({
    eventBus,
    sessionManager,
    skillResolver: config.skillResolver,
    notifier: config.notifier,
    maxConcurrent: config.maxConcurrent,
  });

  return {
    db,
    entityGraph,
    eventBus,
    sessionManager,
    orchestrator,
  };
}
