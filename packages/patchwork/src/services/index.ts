// Patchwork Services - Service proxy system for widget backend integration

export * from './types.js';
export {
  callProcedure,
  batchCall,
  configureCacheTtl,
  invalidateCache,
  getCacheStats,
  disposeBackends,
  createServiceProxy,
  initializeFromConfig,
  type BatchCall,
} from './proxy.js';
export { createMcpBackend } from './backends/mcp.js';
export { createHttpBackend } from './backends/http.js';
export { createShellBackend } from './backends/shell.js';
export { createStoreBackend } from './backends/store.js';
