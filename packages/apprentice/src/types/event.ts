import type { Metadata } from './metadata';
import type { AssetRelation } from './asset';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event represents a point-in-time occurrence
 * Can reference assets via relations
 */
export interface Event {
  /** Unique identifier (e.g., "evt_abc123") */
  id: string;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Human-readable message/description */
  message: string;

  /**
   * Flexible metadata with namespaced tool-specific data
   * Common namespaces: shell, git, slack, ai, etc.
   */
  metadata: Metadata;

  /** Relations to assets (tool-defined types) */
  relations?: AssetRelation[];
}
