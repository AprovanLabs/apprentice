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
