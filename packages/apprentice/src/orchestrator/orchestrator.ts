import type {
  Orchestrator,
  OrchestratorConfig,
  SessionManager,
  SkillResolver,
  ExternalNotifier,
} from './types';
import type { EventBus, Envelope, Subscription } from '../events/types';

interface QueuedEvent {
  envelope: Envelope;
  skillId: string;
}

export interface CreateOrchestratorOptions extends OrchestratorConfig {
  eventBus: EventBus;
  sessionManager: SessionManager;
  notifier?: ExternalNotifier;
}

export function createOrchestrator(
  options: CreateOrchestratorOptions,
): Orchestrator {
  const {
    eventBus,
    sessionManager,
    maxConcurrent = 5,
    skillResolver,
    notifier,
  } = options;

  let subscription: Subscription | null = null;
  let running = false;
  let activeCount = 0;
  const queue: QueuedEvent[] = [];

  const INTERNAL_TYPES = [
    'session.created',
    'session.started',
    'session.completed',
    'session.failed',
    'session.cancelled',
  ];

  function isInternalEvent(envelope: Envelope): boolean {
    return INTERNAL_TYPES.some(
      (t) => envelope.type === t || envelope.type.startsWith('orchestrator.'),
    );
  }

  async function processEvent(envelope: Envelope, skillId: string): Promise<void> {
    const session = await sessionManager.create({ skillId });

    try {
      await sessionManager.update(session.id, { status: 'running' });
      await sessionManager.addEvent(session.id, envelope.id);

      if (notifier) {
        await notifier.notify({ ...session, status: 'running' }, 'started');
      }

      await eventBus.publish({
        type: 'session.started',
        source: `orchestrator:${session.id}`,
        subject: skillId,
        data: { sessionId: session.id, skillId, triggerEventId: envelope.id },
        metadata: {},
      });

      await sessionManager.update(session.id, {
        status: 'complete',
        completedAt: new Date().toISOString(),
        result: { processed: true },
      });

      if (notifier) {
        await notifier.notify(
          { ...session, status: 'complete', completedAt: new Date().toISOString() },
          'completed',
        );
      }

      await eventBus.publish({
        type: 'session.completed',
        source: `orchestrator:${session.id}`,
        subject: skillId,
        data: { sessionId: session.id, skillId },
        metadata: {},
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await sessionManager.update(session.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: errorMessage,
      });

      if (notifier) {
        await notifier.notify(
          {
            ...session,
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: errorMessage,
          },
          'failed',
        );
      }

      await eventBus.publish({
        type: 'session.failed',
        source: `orchestrator:${session.id}`,
        subject: skillId,
        data: { sessionId: session.id, skillId, error: errorMessage },
        metadata: {},
      });
    } finally {
      activeCount--;
      processQueue();
    }
  }

  function processQueue(): void {
    while (running && activeCount < maxConcurrent && queue.length > 0) {
      const next = queue.shift();
      if (next) {
        activeCount++;
        processEvent(next.envelope, next.skillId).catch(console.error);
      }
    }
  }

  async function handleEvent(envelope: Envelope): Promise<void> {
    if (isInternalEvent(envelope)) return;

    if (!skillResolver) return;

    const skillId = await skillResolver(envelope);
    if (!skillId) return;

    queue.push({ envelope, skillId });
    processQueue();
  }

  return {
    start(): void {
      if (running) return;
      running = true;

      subscription = eventBus.subscribe({ types: ['*'] }, (envelope) => {
        handleEvent(envelope).catch(console.error);
      });
    },

    stop(): void {
      running = false;
      if (subscription) {
        subscription.unsubscribe();
        subscription = null;
      }
    },

    async onEvent(envelope: Envelope): Promise<void> {
      await handleEvent(envelope);
    },

    getSessionManager(): SessionManager {
      return sessionManager;
    },
  };
}
