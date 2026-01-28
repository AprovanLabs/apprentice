// Context Manager - Aggregates context from providers and emits change events

import { EventEmitter } from 'node:events';
import {
  ContextProvider,
  AggregatedContext,
  ContextManagerOptions,
} from './types';

/**
 * Manages context from multiple providers
 * - Aggregates context from registered providers
 * - Accepts context pushes from external sources (via MCP)
 * - Debounces rapid updates
 * - Emits events on context changes
 */
export class ContextManager extends EventEmitter {
  private providers: Map<string, ContextProvider> = new Map();
  private externalContext: Map<string, Record<string, unknown>> = new Map();
  private cachedContext: AggregatedContext | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private unsubscribers: Map<string, () => void> = new Map();

  public constructor(options: ContextManagerOptions = {}) {
    super();
    this.debounceMs = options.debounce_ms ?? 100;
  }

  /**
   * Register a context provider
   */
  public registerProvider(provider: ContextProvider): void {
    if (this.providers.has(provider.name)) {
      this.unregisterProvider(provider.name);
    }

    this.providers.set(provider.name, provider);

    // Subscribe to changes if provider supports it
    if (provider.subscribe) {
      const unsub = provider.subscribe((context) => {
        this.handleProviderUpdate(provider.name, context);
      });
      this.unsubscribers.set(provider.name, unsub);
    }

    // Trigger initial context fetch
    this.scheduleRefresh();
  }

  /**
   * Unregister a provider
   */
  public unregisterProvider(name: string): void {
    // Call unsubscribe if registered
    const unsub = this.unsubscribers.get(name);
    if (unsub) {
      unsub();
      this.unsubscribers.delete(name);
    }

    this.providers.delete(name);
    this.externalContext.delete(name);
    this.invalidateCache();
    this.scheduleEmit();
  }

  /**
   * Push context from an external source (via MCP)
   * This is the primary way external providers send context
   */
  public pushContext(
    providerName: string,
    context: Record<string, unknown>,
  ): void {
    this.externalContext.set(providerName, context);
    this.invalidateCache();
    this.scheduleEmit();
  }

  /**
   * Get current aggregated context from all sources
   */
  public getContext(): AggregatedContext {
    if (this.cachedContext) {
      return this.cachedContext;
    }

    // Build aggregated context from external pushes
    // (registered providers are fetched on-demand during refresh)
    const providers: Record<string, Record<string, unknown>> = {};

    for (const [name, context] of this.externalContext) {
      providers[name] = context;
    }

    this.cachedContext = {
      timestamp: new Date().toISOString(),
      providers,
    };

    return this.cachedContext;
  }

  /**
   * Force refresh context from all registered providers
   */
  public async refresh(): Promise<AggregatedContext> {
    const providers: Record<string, Record<string, unknown>> = {};

    // Fetch from registered providers
    const fetchPromises = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const context = await provider.getContext();
          return { name, context };
        } catch (error) {
          console.warn(`Failed to fetch context from provider ${name}:`, error);
          return { name, context: {} };
        }
      },
    );

    const results = await Promise.all(fetchPromises);
    for (const { name, context } of results) {
      providers[name] = context;
    }

    // Merge with external context (external takes precedence for same provider)
    for (const [name, context] of this.externalContext) {
      providers[name] = context;
    }

    this.cachedContext = {
      timestamp: new Date().toISOString(),
      providers,
    };

    this.emit('contextChange', this.cachedContext);
    return this.cachedContext;
  }

  /**
   * Subscribe to context changes
   */
  public onContextChange(
    callback: (context: AggregatedContext) => void,
  ): () => void {
    this.on('contextChange', callback);
    return () => this.off('contextChange', callback);
  }

  /**
   * Get list of registered providers
   */
  public getProviders(): string[] {
    const registered = Array.from(this.providers.keys());
    const external = Array.from(this.externalContext.keys());
    return [...new Set([...registered, ...external])];
  }

  /**
   * Clear all context
   */
  public clear(): void {
    this.providers.clear();
    this.externalContext.clear();
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers.clear();
    this.invalidateCache();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleProviderUpdate(
    providerName: string,
    context: Record<string, unknown>,
  ): void {
    // Store update (treating it like an external push)
    this.externalContext.set(providerName, context);
    this.invalidateCache();
    this.scheduleEmit();
  }

  private invalidateCache(): void {
    this.cachedContext = null;
  }

  private scheduleEmit(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      this.debounceTimeout = null;
      const context = this.getContext();
      this.emit('contextChange', context);
    }, this.debounceMs);
  }

  private scheduleRefresh(): void {
    // Schedule a refresh without debouncing
    setImmediate(() => {
      this.refresh().catch((error) => {
        console.warn('Context refresh failed:', error);
      });
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _contextManager: ContextManager | null = null;

/**
 * Get the global context manager instance
 */
export function getContextManager(): ContextManager {
  if (!_contextManager) {
    _contextManager = new ContextManager();
  }
  return _contextManager;
}

/**
 * Reset the context manager (for testing)
 */
export function resetContextManager(): void {
  if (_contextManager) {
    _contextManager.clear();
  }
  _contextManager = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple hash from context for comparison
 */
export function hashContext(context: AggregatedContext): string {
  const str = JSON.stringify(context.providers);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}
