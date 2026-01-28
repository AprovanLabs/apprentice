// Shared State Store - Cross-widget communication with reactive updates

import { EventEmitter } from 'node:events';

export type StoreKey = string;
export type StoreValue = unknown;
export type StoreSubscriber = (value: StoreValue, key: StoreKey) => void;

export interface StoreSnapshot {
  [key: string]: StoreValue;
}

export interface SharedStore {
  get<T = StoreValue>(key: StoreKey): T | undefined;
  set(key: StoreKey, value: StoreValue): void;
  delete(key: StoreKey): boolean;
  has(key: StoreKey): boolean;
  keys(): string[];
  subscribe(key: StoreKey, callback: StoreSubscriber): () => void;
  subscribeAll(callback: StoreSubscriber): () => void;
  snapshot(): StoreSnapshot;
  namespace(prefix: string): SharedStore;
  clear(): void;
}

function createInMemoryStore(): SharedStore {
  const data = new Map<StoreKey, StoreValue>();
  const emitter = new EventEmitter();

  const store: SharedStore = {
    get<T = StoreValue>(key: StoreKey): T | undefined {
      return data.get(key) as T | undefined;
    },

    set(key: StoreKey, value: StoreValue): void {
      const prev = data.get(key);
      if (prev === value) return;
      data.set(key, value);
      emitter.emit(`change:${key}`, value, key);
      emitter.emit('change', value, key);
    },

    delete(key: StoreKey): boolean {
      const existed = data.delete(key);
      if (existed) {
        emitter.emit(`change:${key}`, undefined, key);
        emitter.emit('change', undefined, key);
      }
      return existed;
    },

    has(key: StoreKey): boolean {
      return data.has(key);
    },

    keys(): string[] {
      return [...data.keys()];
    },

    subscribe(key: StoreKey, callback: StoreSubscriber): () => void {
      const handler = (value: StoreValue, k: StoreKey) => callback(value, k);
      emitter.on(`change:${key}`, handler);
      return () => emitter.off(`change:${key}`, handler);
    },

    subscribeAll(callback: StoreSubscriber): () => void {
      const handler = (value: StoreValue, key: StoreKey) =>
        callback(value, key);
      emitter.on('change', handler);
      return () => emitter.off('change', handler);
    },

    snapshot(): StoreSnapshot {
      return Object.fromEntries(data);
    },

    namespace(prefix: string): SharedStore {
      const sep = prefix.endsWith(':') ? '' : ':';
      return {
        get: <T>(key: StoreKey) => store.get<T>(`${prefix}${sep}${key}`),
        set: (key: StoreKey, value: StoreValue) =>
          store.set(`${prefix}${sep}${key}`, value),
        delete: (key: StoreKey) => store.delete(`${prefix}${sep}${key}`),
        has: (key: StoreKey) => store.has(`${prefix}${sep}${key}`),
        keys: () =>
          store
            .keys()
            .filter((k) => k.startsWith(`${prefix}${sep}`))
            .map((k) => k.slice(prefix.length + sep.length)),
        subscribe: (key: StoreKey, cb: StoreSubscriber) =>
          store.subscribe(`${prefix}${sep}${key}`, cb),
        subscribeAll: (cb: StoreSubscriber) => {
          const handler: StoreSubscriber = (v, k) => {
            if (k.startsWith(`${prefix}${sep}`)) {
              cb(v, k.slice(prefix.length + sep.length));
            }
          };
          return store.subscribeAll(handler);
        },
        snapshot: () => {
          const snap = store.snapshot();
          const result: StoreSnapshot = {};
          for (const [k, v] of Object.entries(snap)) {
            if (k.startsWith(`${prefix}${sep}`)) {
              result[k.slice(prefix.length + sep.length)] = v;
            }
          }
          return result;
        },
        namespace: (subPrefix: string) =>
          store.namespace(`${prefix}${sep}${subPrefix}`),
        clear: () => {
          for (const key of store.keys()) {
            if (key.startsWith(`${prefix}${sep}`)) store.delete(key);
          }
        },
      };
    },

    clear(): void {
      for (const key of [...data.keys()]) {
        store.delete(key);
      }
    },
  };

  return store;
}

let globalStore: SharedStore | null = null;

export function getStore(): SharedStore {
  if (!globalStore) {
    globalStore = createInMemoryStore();
  }
  return globalStore;
}

export function resetStore(): void {
  if (globalStore) {
    globalStore.clear();
  }
  globalStore = null;
}

export function createStore(): SharedStore {
  return createInMemoryStore();
}

export function createStoreService(): {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  subscribe: (key: string, callback: (value: unknown) => void) => () => void;
  keys: () => string[];
} {
  const store = getStore();
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    subscribe: (key, callback) => store.subscribe(key, (v) => callback(v)),
    keys: () => store.keys(),
  };
}
