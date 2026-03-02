export interface Envelope {
  id: string;
  timestamp: string;
  type: string;
  source: string;
  subject?: string;
  data: unknown;
  metadata: Record<string, unknown>;
}

export interface EventFilter {
  types?: string[];
  sources?: string[];
  subjects?: string[];
  since?: string;
  until?: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export type EventHandler = (envelope: Envelope) => void | Promise<void>;

export interface Subscription {
  id: string;
  unsubscribe: () => void;
}

export interface EventBus {
  publish(envelope: Omit<Envelope, 'id' | 'timestamp'>): Promise<Envelope>;
  subscribe(filter: EventFilter, handler: EventHandler): Subscription;
  unsubscribe(subscriptionId: string): void;
  query(filter: EventFilter, options?: QueryOptions): Promise<Envelope[]>;
}
