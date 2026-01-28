/**
 * Flexible metadata using dot-notation namespacing
 * Tool-specific data is nested under a namespace key
 *
 * @example
 * ```typescript
 * {
 *   "filesystem": { "modified_at": "...", "size_bytes": 1024 },
 *   "git": { "sha": "abc123", "branch": "main" },
 *   "script": { "description": "...", "args": [...] }
 * }
 * ```
 */
export type Metadata = Record<string, unknown>;

/**
 * Common metadata namespaces (conventions, not enforced)
 */

export interface FilesystemMetadata {
  modified_at: string; // ISO 8601
  size_bytes: number;
  permissions?: string;
  mime_type?: string;
}

export interface GitMetadata {
  sha?: string;
  branch?: string;
  author?: string;
  committed_at?: string;
}

export interface ScriptMetadata {
  description?: string;
  usage?: string;
  tags?: string[];
  args?: Array<{
    name: string;
    required?: boolean;
    options?: string[];
    description?: string;
  }>;
}

export interface ContentPolicyMetadata {
  /** Whether full content is stored */
  stored: boolean;
  /** Reason if not stored */
  reason?: 'size_limit' | 'binary' | 'excluded';
  /** LLM-generated summary for large/binary files */
  summary?: string;
}

export interface ShellMetadata {
  cwd?: string;
  exit_code?: number;
  duration_ms?: number;
  user?: string;
}

export interface SlackMetadata {
  channel?: string;
  thread_ts?: string;
  user_id?: string;
}

export interface AIMetadata {
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  temperature?: number;
}

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

// ============================================================================
// Chat Import Types
// ============================================================================

/**
 * Tool call confirmation states
 */
export type ToolConfirmation =
  | 'auto'
  | 'approved'
  | 'rejected'
  | 'trusted'
  | 'pending';

/**
 * A tool call within a chat message
 * Generic structure - adapter fills in from source-specific data
 */
export interface ChatToolCall {
  /** Tool identifier (e.g., "run_in_terminal", "mcp_server_tool") */
  toolId: string;
  /** Unique call identifier */
  callId: string;
  /** Tool source type */
  source: 'builtin' | 'mcp' | 'extension';
  /** Source label for MCP tools */
  sourceLabel?: string;
  /** Confirmation state */
  confirmation: ToolConfirmation;
  /** Whether the call completed */
  completed: boolean;
  /** Whether the tool errored */
  isError?: boolean;
  /** Tool-specific input parameters (JSON-serializable) */
  input?: Record<string, unknown>;
  /** Tool-specific output/result */
  output?: unknown;
  /** Files referenced by the tool */
  files?: string[];
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Context reference attached to a chat message
 */
export interface ChatContextRef {
  /** Reference type */
  kind: 'file' | 'workspace' | 'selection' | 'prompt';
  /** Path or identifier */
  path?: string;
  /** Selection range (for file references) */
  range?: { startLine: number; endLine: number };
  /** Display name */
  name?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A message within a chat session
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Optional timestamp for this specific message */
  timestamp?: string;
  /** Tool calls made during this message (assistant only) */
  toolCalls?: ChatToolCall[];
  /** Context references (user only) */
  contextRefs?: ChatContextRef[];
  /** Model used for this message */
  model?: string;
  /** Duration waiting for response (ms) */
  waitTimeMs?: number;
}

/**
 * A chat session from an AI assistant
 */
export interface ChatSession {
  /** Unique session identifier */
  id: string;
  /** Optional title/summary of the session */
  title?: string;
  /** Messages in the session */
  messages: ChatMessage[];
  /** ISO 8601 timestamp when session was created */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt?: string;
  /** Workspace path associated with this session */
  workspace?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
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
