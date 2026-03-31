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
