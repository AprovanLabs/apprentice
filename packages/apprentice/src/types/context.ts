// ============================================================================
// Context Registry Types
// ============================================================================

/**
 * A mounted external path within a context
 */
export interface MountedPath {
  /** Absolute filesystem path to the external directory */
  path: string;
  /** Virtual mount point (key prefix for assets from this path) */
  mount: string;
}

/**
 * Registered context - a folder Apprentice indexes
 * Replaces hardcoded script/widget directories
 */
export interface Context {
  /** Unique identifier for this context */
  id: string;

  /** Human-readable name */
  name: string;

  /** Absolute filesystem path */
  path: string;

  /** Additional mounted paths (external directories with virtual mount points) */
  mounts: MountedPath[];

  /** Whether this context is currently active */
  enabled: boolean;

  /** Glob patterns to include (default: all files) */
  include_patterns: string[];

  /** Glob patterns to exclude */
  exclude_patterns: string[];

  /** ISO 8601 timestamp of registration */
  registered_at: string;

  /** ISO 8601 timestamp of last index run */
  last_indexed_at?: string;

  /** Version provider type (e.g., "git") if versioning is enabled */
  version_provider_type?: string;
}

/**
 * Options for registering a new context
 */
export interface ContextInput {
  /** Human-readable name (defaults to folder name) */
  name?: string;

  /** Glob patterns to include */
  include_patterns?: string[];

  /** Glob patterns to exclude */
  exclude_patterns?: string[];
}
