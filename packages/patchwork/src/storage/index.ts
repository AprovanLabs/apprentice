// Patchwork Storage - Shared state store for cross-widget communication

export {
  getStore,
  resetStore,
  createStore,
  createStoreService,
  type SharedStore,
  type StoreKey,
  type StoreValue,
  type StoreSubscriber,
  type StoreSnapshot,
} from './store.js';
