import type { Metadata } from './metadata';

// ============================================================================
// Snapshot Provider Types (generic versioning)
// ============================================================================

/**
 * Snapshot provider interface - implements versioning for a context
 * Built-in providers: "git", "manual"
 * Extensible for other VCS or snapshot systems
 */
export interface SnapshotProvider {
  /** Provider identifier */
  id: string;

  /** Check if this provider applies to a context path */
  detect(contextPath: string): Promise<boolean>;

  /** Get current snapshot identifier */
  getCurrentSnapshot(contextPath: string): Promise<string | null>;

  /** Get metadata for current snapshot */
  getSnapshotMetadata(contextPath: string): Promise<Metadata>;

  /** List available snapshots (optional, for history) */
  listSnapshots?(contextPath: string, limit?: number): Promise<SnapshotInfo[]>;
}

export interface SnapshotInfo {
  id: string;
  timestamp: string;
  message?: string;
  metadata: Metadata;
}
