// Patchwork Services - Service proxy and caching layer
//
// Provides a simple service proxy interface. The actual backend (UTCP, MCP, etc.)
// is configured at runtime through the ServiceBackend interface.

export * from './types.js';

// Service proxy (caching layer)
export {
  createServiceProxy,
  callProcedure,
  batchCall,
  configureCacheTtl,
  invalidateCache,
  getCacheStats,
  setServiceBackend,
  type ServiceBackend,
  type BatchCall,
} from './proxy.js';
