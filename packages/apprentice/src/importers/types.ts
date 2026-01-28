// Chat source adapter interfaces for importing chat history

import type { ChatSession } from '../types';

/**
 * Source adapter for importing chat history from AI assistants
 */
export interface ChatSourceAdapter {
  /** Unique identifier for this source (e.g., "copilot", "cursor") */
  readonly sourceId: string;

  /** Human-readable name */
  readonly sourceName: string;

  /**
   * Discover all chat session files/locations for this source
   * Returns paths or identifiers that can be passed to importSession
   */
  discoverSessions(): Promise<string[]>;

  /**
   * Import a single chat session from its path/identifier
   */
  importSession(sessionPath: string): Promise<ChatSession | null>;

  /**
   * Get the last modified time for a session (for incremental import)
   */
  getSessionModifiedTime(sessionPath: string): Promise<Date | null>;
}

/**
 * Import state tracking per source
 */
export interface ImportState {
  lastImportTime: string | null;
  importedSessions: Record<string, string>; // sessionPath -> lastModified ISO timestamp
}

/**
 * Aggregated import state for all sources
 */
export interface ChatImportState {
  sources: Record<string, ImportState>;
}
