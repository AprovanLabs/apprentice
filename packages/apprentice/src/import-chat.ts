import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { uuidv7 } from 'uuidv7';
import { paths, config, loadUserConfig } from './config';
import { getIndexerState, updateIndexerState } from './db';
import type {
  ChatSession,
  ChatMessage,
  ChatToolCall,
  Event,
  AssetRelation,
} from './types';
import type { ChatSourceAdapter, ChatImportState } from './importers/types';

/**
 * Check if tool call extraction is enabled
 */
function isToolCallExtractionEnabled(): boolean {
  return loadUserConfig().chatImport?.extractToolCalls ?? true;
}

/**
 * Check if tool calls should be created as separate events
 */
function isToolCallsAsEventsEnabled(): boolean {
  return loadUserConfig().chatImport?.toolCallsAsEvents ?? true;
}

/**
 * Keys for chat import state in indexer_state table
 */
const CHAT_IMPORT_STATE_KEY = 'chat.import';

/**
 * Get chat import sessions for a specific source
 */
async function getChatImportSessions(
  sourceId: string,
): Promise<Record<string, string>> {
  const state = await getFullChatImportState();
  return state.sources[sourceId]?.importedSessions ?? {};
}

/**
 * Update imported session record
 */
async function updateChatImportSession(
  sourceId: string,
  sessionPath: string,
  modTime: string,
): Promise<void> {
  const state = await getFullChatImportState();

  if (!state.sources[sourceId]) {
    state.sources[sourceId] = {
      lastImportTime: null,
      importedSessions: {},
    };
  }

  state.sources[sourceId]!.importedSessions[sessionPath] = modTime;
  await updateIndexerState(CHAT_IMPORT_STATE_KEY, state);
}

/**
 * Update last import time for a source
 */
async function updateChatImportSource(
  sourceId: string,
  lastImportTime: string,
): Promise<void> {
  const state = await getFullChatImportState();

  if (!state.sources[sourceId]) {
    state.sources[sourceId] = {
      lastImportTime: null,
      importedSessions: {},
    };
  }

  state.sources[sourceId]!.lastImportTime = lastImportTime;
  await updateIndexerState(CHAT_IMPORT_STATE_KEY, state);
}

/**
 * Get full chat import state
 */
async function getFullChatImportState(): Promise<ChatImportState> {
  const state = await getIndexerState(CHAT_IMPORT_STATE_KEY);
  return state ?? { sources: {} };
}

/**
 * Clear chat import state
 */
async function dbClearChatImportState(sourceId?: string): Promise<void> {
  if (sourceId) {
    const state = await getFullChatImportState();
    delete state.sources[sourceId];
    await updateIndexerState(CHAT_IMPORT_STATE_KEY, state);
  } else {
    await updateIndexerState(CHAT_IMPORT_STATE_KEY, { sources: {} });
  }
}

/**
 * Get timestamp for a message with fallback to session time
 */
function getMessageTimestamp(
  message: ChatMessage,
  session: ChatSession,
): string {
  // Use message timestamp if available, otherwise session creation time
  if (message.timestamp) {
    return message.timestamp;
  }
  return new Date(session.createdAt).toISOString();
}

/**
 * Transform a chat message to an Event
 */
function messageToEvent(
  message: ChatMessage,
  session: ChatSession,
  messageIndex: number,
  sourceId: string,
): Event {
  const timestamp = getMessageTimestamp(message, session);

  // Truncate very long messages
  let content = message.content;
  if (content.length > config.chatImport.maxMessageLength) {
    content =
      content.slice(0, config.chatImport.maxMessageLength) + '... [truncated]';
  }

  return {
    id: uuidv7(),
    timestamp,
    message: content,
    metadata: {
      chat: {
        session_id: session.id,
        role: message.role,
        message_index: messageIndex,
        source: sourceId,
        event_type: 'message',
        ...(session.title && { title: session.title }),
        ...(message.model && { model: message.model }),
        ...(message.waitTimeMs && { wait_time_ms: message.waitTimeMs }),
      },
      ...(session.workspace && { project: { path: session.workspace } }),
      source: 'chat',
    },
  };
}

/**
 * Create an event for a tool call
 */
function toolCallToEvent(
  tool: ChatToolCall,
  session: ChatSession,
  messageIndex: number,
  sourceId: string,
): Event {
  // Use session timestamp for tool calls
  const timestamp = new Date(session.createdAt).toISOString();

  // Build relations from files
  const relations: AssetRelation[] | undefined = tool.files?.map((path) => ({
    // Simple path-based asset ID - could be enhanced with context resolution
    asset_id: `files:${path}`,
    type: 'chat.tool_referenced',
  }));

  return {
    id: uuidv7(),
    timestamp,
    message: `Tool: ${tool.toolId} (${tool.confirmation})`,
    metadata: {
      chat: {
        session_id: session.id,
        source: sourceId,
        event_type: 'tool_call',
        message_index: messageIndex,
        ...(session.title && { title: session.title }),
      },
      tool: {
        id: tool.toolId,
        call_id: tool.callId,
        source: tool.source,
        ...(tool.sourceLabel && { source_label: tool.sourceLabel }),
        confirmation: tool.confirmation,
        completed: tool.completed,
        ...(tool.isError !== undefined && { is_error: tool.isError }),
        ...(tool.durationMs && { duration_ms: tool.durationMs }),
        ...(tool.input && { input: tool.input }),
      },
      ...(session.workspace && { project: { path: session.workspace } }),
      source: 'chat',
    },
    ...(relations && relations.length > 0 && { relations }),
  };
}

/**
 * Generate events from a chat session
 * Creates separate events for messages and tool calls (if enabled)
 */
function sessionToEvents(session: ChatSession, sourceId: string): Event[] {
  const events: Event[] = [];

  const createToolCallEvents =
    isToolCallExtractionEnabled() && isToolCallsAsEventsEnabled();

  for (const [msgIdx, msg] of session.messages.entries()) {
    // Message event
    events.push(messageToEvent(msg, session, msgIdx, sourceId));

    // Tool call events (for assistant messages with tool calls)
    if (createToolCallEvents && msg.role === 'assistant' && msg.toolCalls) {
      for (const tool of msg.toolCalls) {
        events.push(toolCallToEvent(tool, session, msgIdx, sourceId));
      }
    }
  }

  return events;
}

/**
 * Ensure log directory exists
 */
function ensureLogDir(): void {
  const logDir = dirname(paths.chatLogFile);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Append events to the chat log file
 */
function appendEventsToLog(events: Event[]): void {
  if (events.length === 0) return;

  ensureLogDir();

  const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  appendFileSync(paths.chatLogFile, lines);
}

/**
 * Import sessions from a single adapter
 * Returns the count of imported messages
 */
export async function importFromAdapter(
  adapter: ChatSourceAdapter,
  options: { verbose?: boolean } = {},
): Promise<number> {
  const { verbose = false } = options;

  const importedSessions = await getChatImportSessions(adapter.sourceId);
  const sessionPaths = await adapter.discoverSessions();

  if (verbose) {
    console.log(
      `[${adapter.sourceName}] Found ${sessionPaths.length} sessions`,
    );
  }

  let totalImported = 0;
  const allEvents: Event[] = [];

  for (const sessionPath of sessionPaths) {
    // Check if session has been modified since last import
    const modTime = await adapter.getSessionModifiedTime(sessionPath);
    if (!modTime) continue;

    const modTimeStr = modTime.toISOString();
    const lastImported = importedSessions[sessionPath];

    // Skip if already imported and not modified
    if (lastImported && lastImported >= modTimeStr) {
      continue;
    }

    // Import the session
    const session = await adapter.importSession(sessionPath);
    if (!session || session.messages.length === 0) continue;

    if (verbose) {
      console.log(
        `[${adapter.sourceName}] Importing: ${session.title ?? session.id} (${
          session.messages.length
        } messages)`,
      );
    }

    // Transform session to events (messages + tool calls)
    const events = sessionToEvents(session, adapter.sourceId);

    allEvents.push(...events);
    totalImported += events.length;

    // Update state for this session in SQLite
    await updateChatImportSession(adapter.sourceId, sessionPath, modTimeStr);
  }

  // Write all events at once
  if (allEvents.length > 0) {
    // Sort by timestamp to maintain chronological order
    allEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    appendEventsToLog(allEvents);
  }

  // Update last import time in SQLite
  await updateChatImportSource(adapter.sourceId, new Date().toISOString());

  return totalImported;
}

/**
 * Run import for all registered adapters
 * Returns counts per source
 */
export async function runChatImport(
  adapters: ChatSourceAdapter[],
  options: { verbose?: boolean } = {},
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  for (const adapter of adapters) {
    try {
      const count = await importFromAdapter(adapter, options);
      results[adapter.sourceId] = count;
    } catch (error) {
      console.error(`Error importing from ${adapter.sourceName}:`, error);
      results[adapter.sourceId] = 0;
    }
  }

  return results;
}

/**
 * Get import status for all sources
 */
export async function getImportStatus(): Promise<ChatImportState> {
  return getFullChatImportState();
}

/**
 * Clear import state for a specific source (forces re-import)
 */
export async function clearImportState(sourceId?: string): Promise<void> {
  await dbClearChatImportState(sourceId);
}
