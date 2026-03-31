import type { Metadata } from './metadata';

// ============================================================================
// Asset Types
// ============================================================================

/**
 * Unique identifier for an asset (auto-generated hash)
 */
export type AssetId = string;

/**
 * Asset represents any content with metadata
 * All tool-specific data lives in the metadata field
 * No hardcoded columns for scripts, widgets, etc.
 */
export interface Asset {
  /** Auto-generated unique identifier */
  id: AssetId;

  /** Context this asset belongs to */
  context_id: string;

  /** Relative path within context (composite key with context_id) */
  key: string;

  /** File extension (e.g., ".sh", ".md", ".json") */
  extension: string;

  /** SHA-256 hash of content for deduplication/change detection */
  content_hash: string;

  /** ISO 8601 timestamp of when asset was indexed */
  indexed_at: string;

  /**
   * Flexible metadata with namespaced tool-specific data
   * Common namespaces: filesystem, git, script, doc, etc.
   */
  metadata: Metadata;

  /**
   * Content (loaded on demand, null for large/binary files)
   * See content_policy in metadata for handling
   */
  content?: string | null;
}

/**
 * Relation from an event to an asset
 * The type is tool-defined using dot-notation namespacing
 *
 * @example
 * ```typescript
 * { asset_id: "scripts:deploy.sh", type: "shell.executed" }
 * { asset_id: "docs:setup.md", type: "ai.referenced" }
 * ```
 */
export interface AssetRelation {
  /** Asset identifier */
  asset_id: AssetId;

  /**
   * Tool-defined relation type using dot-notation
   * Examples: "shell.executed", "git.committed", "ai.generated"
   */
  type: string;

  /** Optional: snapshot identifier at time of relation */
  snapshot_id?: string;
}
