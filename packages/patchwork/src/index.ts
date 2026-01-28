// Patchwork - Intelligent context-aware widget system

// Types - Core types
export * from './types';

// Types - Service types
export type { ServiceConfig, CacheConfig } from './services/types.js';

// Runtime
export * as runtime from './runtime/index.js';
export {
  loadWidget,
  loadWidgetSource,
  stripMeta,
  clearMetaCache,
} from './runtime/loader.js';
export {
  registerService,
  unregisterService,
  createServicesForWidget,
} from './runtime/globals.js';
export {
  getPatchworkConfig,
  ensureWidgetsDir,
  setPatchworkConfig,
} from './runtime/config.js';
export { executeWidget } from './runtime/index.js';

// Services
export * as services from './services/index.js';
export {
  callProcedure,
  batchCall,
  configureCacheTtl,
  invalidateCache,
  getCacheStats,
  disposeBackends,
  createServiceProxy,
  initializeFromConfig as initializeServices,
} from './services/proxy.js';

// Layout & Orchestration
export * as layout from './layout/index.js';
export {
  PRESETS,
  getPreset,
  getPresetNames,
  createTerminalLayoutManager,
  createBrowserLayoutManager,
  getLayoutAssets,
  createHotReloadManager,
  startHotReload,
  stopHotReload,
  isDevMode,
  type LayoutManager,
  type LayoutSpec,
  type LayoutPreset,
  type SlotId,
  type SlotBounds,
} from './layout/index.js';

// Storage
export * as storage from './storage/index.js';
export {
  getStore,
  createStore,
  createStoreService,
  type SharedStore,
} from './storage/index.js';

// Context Management
export {
  ContextManager,
  getContextManager,
  resetContextManager,
  hashContext,
} from './context-manager';
