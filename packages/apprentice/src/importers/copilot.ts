// VS Code GitHub Copilot Chat adapter

import type { ChatSourceAdapter } from './types';
import type {
  ChatSession,
  ChatMessage,
  ChatToolCall,
  ChatContextRef,
  ToolConfirmation,
} from '../types';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';

/**
 * Copilot chat session file structure (from investigation)
 */
interface CopilotSessionFile {
  version: number;
  sessionId: string;
  creationDate: number; // Unix timestamp (ms)
  lastMessageDate: number; // Unix timestamp (ms)
  customTitle?: string;
  mode?: { id: string; kind: string };
  selectedModel?: {
    identifier: string;
    metadata?: {
      name?: string;
      family?: string;
    };
  };
  responderUsername?: string;
  requests?: CopilotRequest[];
}

interface CopilotRequest {
  requestId: string;
  timestamp?: string | number; // Encoded timestamp: "c1765573675084" or numeric ms
  timeSpentWaiting?: number; // Time waiting for response (ms)
  message?: {
    text: string;
    parts?: Array<{ text?: string; kind?: string }>;
  };
  variableData?: CopilotVariableData;
  contentReferences?: Array<{ uri?: string }>;
  modelId?: string;
  response?: ResponsePart[];
  agent?: unknown;
}

interface CopilotVariableData {
  variables?: CopilotVariable[];
}

interface CopilotVariable {
  kind: string; // "workspace", "file", "promptFile", etc.
  name?: string;
  value?: unknown;
  originLabel?: string;
  uri?: string;
  range?: {
    startLineNumber?: number;
    endLineNumber?: number;
  };
}

interface ResponsePart {
  kind: string | null;
  value?: string;
  generatedTitle?: string;
  // Tool invocation fields
  toolId?: string;
  toolCallId?: string;
  invocationMessage?: string | { value: string; uris?: Record<string, string> };
  pastTenseMessage?: string | { value: string; uris?: Record<string, string> };
  isConfirmed?: {
    type: number; // 1=auto, 2=rejected, 3=trusted, 4=approved, 5=pending
    scope?: string;
  };
  isComplete?: boolean;
  source?: {
    type: 'internal' | 'mcp';
    label?: string;
    serverLabel?: string;
    collectionId?: string;
    definitionId?: string;
  };
  resultDetails?: {
    input: string;
    output: Array<{ type: string; isText: boolean; value: string }>;
    isError: boolean;
  };
  toolSpecificData?: {
    kind: 'terminal' | 'todoList' | 'input';
    commandLine?: { original: string; toolEdited?: string };
    terminalCommandState?: {
      exitCode?: number;
      timestamp?: number;
      duration?: number;
    };
    terminalCommandOutput?: { text: string; lineCount: number };
    todoList?: Array<{
      id: string;
      title: string;
      description?: string;
      status: string;
    }>;
    rawInput?: unknown;
  };
}

/**
 * VS Code GitHub Copilot Chat adapter
 */
export class CopilotAdapter implements ChatSourceAdapter {
  public readonly sourceId = 'copilot';
  public readonly sourceName = 'GitHub Copilot (VS Code)';

  /**
   * Get the platform-specific storage path
   */
  private getStoragePath(): string {
    return config.chatImport.sources.copilot();
  }

  /**
   * Discover all chat session files across all workspaces
   */
  public async discoverSessions(): Promise<string[]> {
    const storagePath = this.getStoragePath();
    if (!existsSync(storagePath)) return [];

    const sessions: string[] = [];

    try {
      const workspaceDirs = readdirSync(storagePath);

      for (const wsDir of workspaceDirs) {
        const chatSessionsPath = join(storagePath, wsDir, 'chatSessions');
        if (!existsSync(chatSessionsPath)) continue;

        try {
          const files = readdirSync(chatSessionsPath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              sessions.push(join(chatSessionsPath, file));
            }
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    } catch {
      // Storage path not accessible
    }

    return sessions;
  }

  /**
   * Import a single chat session from a file path
   */
  public async importSession(sessionPath: string): Promise<ChatSession | null> {
    try {
      const content = readFileSync(sessionPath, 'utf-8');
      const raw = JSON.parse(content) as CopilotSessionFile;

      const workspacePath = this.resolveWorkspacePath(sessionPath);
      const messages: ChatMessage[] = [];

      for (const request of raw.requests ?? []) {
        // Extract user message with context refs and timestamp
        if (request.message?.text) {
          const userMessage: ChatMessage = {
            role: 'user',
            content: request.message.text,
            timestamp: this.parseTimestamp(request.timestamp),
            contextRefs: this.extractContextRefs(request.variableData),
            model: request.modelId,
            waitTimeMs: request.timeSpentWaiting,
          };
          messages.push(userMessage);
        }

        // Extract assistant response with tool calls
        const responseText = this.extractResponseText(request.response ?? []);
        if (responseText) {
          const toolCalls = this.extractToolCalls(request.response ?? []);
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: responseText,
            ...(toolCalls.length > 0 && { toolCalls }),
          };
          messages.push(assistantMessage);
        }
      }

      // Skip empty sessions
      if (messages.length === 0) return null;

      return {
        id: raw.sessionId,
        title: raw.customTitle,
        messages,
        createdAt: new Date(raw.creationDate).toISOString(),
        updatedAt: raw.lastMessageDate
          ? new Date(raw.lastMessageDate).toISOString()
          : undefined,
        workspace: workspacePath,
        metadata: {
          mode: raw.mode?.kind,
          model:
            raw.selectedModel?.metadata?.name ?? raw.selectedModel?.identifier,
        },
      };
    } catch {
      // Failed to parse session file
      return null;
    }
  }

  // ===========================================================================
  // Tool Call Extraction
  // ===========================================================================

  /**
   * Extract tool calls from response parts
   */
  private extractToolCalls(response: ResponsePart[]): ChatToolCall[] {
    return response
      .filter((p) => p.kind === 'toolInvocationSerialized')
      .map((p) => this.mapToolInvocation(p))
      .filter((t): t is ChatToolCall => t !== null);
  }

  /**
   * Map Copilot-specific tool invocation to generic ChatToolCall
   */
  private mapToolInvocation(inv: ResponsePart): ChatToolCall | null {
    if (!inv.toolId || !inv.toolCallId) return null;

    const confirmation = this.mapConfirmationType(inv.isConfirmed?.type);
    const files = this.extractFilesFromInvocation(inv);

    return {
      toolId: inv.toolId,
      callId: inv.toolCallId,
      source: inv.source?.type === 'mcp' ? 'mcp' : 'builtin',
      sourceLabel: inv.source?.label,
      confirmation,
      completed: inv.isComplete ?? false,
      isError: inv.resultDetails?.isError,
      input: this.extractToolInput(inv),
      output: this.extractToolOutput(inv),
      files: files.length > 0 ? files : undefined,
      durationMs: inv.toolSpecificData?.terminalCommandState?.duration,
    };
  }

  /**
   * Map Copilot confirmation type to generic confirmation state
   */
  private mapConfirmationType(type?: number): ToolConfirmation {
    switch (type) {
      case 1:
        return 'auto';
      case 2:
        return 'rejected';
      case 3:
        return 'trusted';
      case 4:
        return 'approved';
      case 5:
        return 'pending';
      default:
        return 'auto';
    }
  }

  /**
   * Extract tool input from invocation
   */
  private extractToolInput(
    inv: ResponsePart,
  ): Record<string, unknown> | undefined {
    // Try MCP result details first
    if (inv.resultDetails?.input) {
      try {
        return JSON.parse(inv.resultDetails.input);
      } catch {
        // Not valid JSON
      }
    }
    // Try tool-specific raw input
    if (inv.toolSpecificData?.rawInput) {
      return inv.toolSpecificData.rawInput as Record<string, unknown>;
    }
    // For terminal commands, use command line
    if (inv.toolSpecificData?.commandLine?.original) {
      return { command: inv.toolSpecificData.commandLine.original };
    }
    return undefined;
  }

  /**
   * Extract tool output from invocation
   */
  private extractToolOutput(inv: ResponsePart): unknown | undefined {
    // MCP output
    if (inv.resultDetails?.output) {
      const textOutputs = inv.resultDetails.output
        .filter((o) => o.isText && o.value)
        .map((o) => o.value);
      if (textOutputs.length === 1) return textOutputs[0];
      if (textOutputs.length > 1) return textOutputs;
    }
    // Terminal output
    if (inv.toolSpecificData?.terminalCommandOutput?.text) {
      return {
        text: inv.toolSpecificData.terminalCommandOutput.text,
        exitCode: inv.toolSpecificData.terminalCommandState?.exitCode,
      };
    }
    return undefined;
  }

  /**
   * Extract file paths referenced by a tool invocation
   */
  private extractFilesFromInvocation(inv: ResponsePart): string[] {
    const files: string[] = [];

    // Extract from invocation message URIs
    if (
      typeof inv.invocationMessage === 'object' &&
      inv.invocationMessage.uris
    ) {
      files.push(...this.extractFilePathsFromUris(inv.invocationMessage.uris));
    }

    // Extract from past tense message URIs
    if (typeof inv.pastTenseMessage === 'object' && inv.pastTenseMessage.uris) {
      files.push(...this.extractFilePathsFromUris(inv.pastTenseMessage.uris));
    }

    // Dedupe
    return [...new Set(files)];
  }

  /**
   * Extract file paths from URI map
   * URIs can be strings or objects with different structures
   */
  private extractFilePathsFromUris(uris: Record<string, unknown>): string[] {
    return Object.values(uris)
      .filter(
        (uri): uri is string =>
          typeof uri === 'string' && uri.startsWith('file://'),
      )
      .map((uri) => decodeURIComponent(uri.slice(7)));
  }

  // ===========================================================================
  // Context Reference Extraction
  // ===========================================================================

  /**
   * Extract context references from request variables
   */
  private extractContextRefs(
    variableData?: CopilotVariableData,
  ): ChatContextRef[] | undefined {
    if (!variableData?.variables?.length) return undefined;

    const refs = variableData.variables
      .map((v) => this.mapVariable(v))
      .filter((r): r is ChatContextRef => r !== null);

    return refs.length > 0 ? refs : undefined;
  }

  /**
   * Map a Copilot variable to a ChatContextRef
   */
  private mapVariable(v: CopilotVariable): ChatContextRef | null {
    const kind = this.mapVariableKind(v.kind);
    if (!kind) return null;

    return {
      kind,
      path: this.extractVariablePath(v),
      range: this.extractSelectionRange(v),
      name: v.name,
      metadata: v.originLabel ? { originLabel: v.originLabel } : undefined,
    };
  }

  /**
   * Map Copilot variable kind to generic context ref kind
   */
  private mapVariableKind(kind: string): ChatContextRef['kind'] | null {
    switch (kind) {
      case 'file':
        return 'file';
      case 'workspace':
        return 'workspace';
      case 'promptFile':
        return 'prompt';
      default:
        return null;
    }
  }

  /**
   * Extract path from a Copilot variable
   */
  private extractVariablePath(v: CopilotVariable): string | undefined {
    if (v.uri?.startsWith('file://')) {
      return decodeURIComponent(v.uri.slice(7));
    }
    return undefined;
  }

  /**
   * Extract selection range from a Copilot variable
   */
  private extractSelectionRange(
    v: CopilotVariable,
  ): { startLine: number; endLine: number } | undefined {
    if (v.range?.startLineNumber && v.range?.endLineNumber) {
      return {
        startLine: v.range.startLineNumber,
        endLine: v.range.endLineNumber,
      };
    }
    return undefined;
  }

  // ===========================================================================
  // Timestamp Parsing
  // ===========================================================================

  /**
   * Parse Copilot's encoded timestamp format
   * Format can be:
   * - Number: Unix timestamp in ms (e.g., 1765573675084)
   * - String with "c" prefix: "c1765573675084" -> 1765573675084
   * - String without prefix: "1765573675084" -> 1765573675084
   */
  private parseTimestamp(encoded?: string | number): string | undefined {
    if (encoded === undefined || encoded === null) return undefined;

    let timestamp: number;

    if (typeof encoded === 'number') {
      // Direct numeric timestamp
      timestamp = encoded;
    } else if (typeof encoded === 'string') {
      // String timestamp, possibly with "c" prefix
      const numStr = encoded.startsWith('c') ? encoded.slice(1) : encoded;
      timestamp = parseInt(numStr, 10);
    } else {
      return undefined;
    }

    if (isNaN(timestamp)) return undefined;

    try {
      return new Date(timestamp).toISOString();
    } catch {
      return undefined;
    }
  }

  /**
   * Extract text content from response parts
   * Focus on main response (kind: undefined/missing) and thinking traces
   */
  private extractResponseText(response: ResponsePart[]): string {
    const parts: string[] = [];

    for (const part of response) {
      // Main response (kind is undefined/missing) - markdown text content
      if (part.kind === undefined && part.value) {
        parts.push(part.value);
      }
      // Thinking/reasoning traces (optional - include if present)
      else if (part.kind === 'thinking' && part.value && part.generatedTitle) {
        parts.push(`[Thinking: ${part.generatedTitle}]`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Resolve the workspace path from the session file location
   */
  private resolveWorkspacePath(sessionPath: string): string | undefined {
    // Go up from chatSessions/<file>.json to workspace root
    const wsDir = join(sessionPath, '..', '..');
    const workspaceJson = join(wsDir, 'workspace.json');

    if (existsSync(workspaceJson)) {
      try {
        const ws = JSON.parse(readFileSync(workspaceJson, 'utf-8'));
        // folder is "file:///path/to/project"
        if (ws.folder?.startsWith('file://')) {
          return decodeURIComponent(ws.folder.slice(7));
        }
      } catch {
        // Failed to parse workspace.json
      }
    }
    return undefined;
  }

  /**
   * Get the last modified time for a session file
   */
  public async getSessionModifiedTime(
    sessionPath: string,
  ): Promise<Date | null> {
    try {
      return statSync(sessionPath).mtime;
    } catch {
      return null;
    }
  }
}
