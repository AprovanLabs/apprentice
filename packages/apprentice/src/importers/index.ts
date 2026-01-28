// Adapter registry - exports all available chat source adapters

import type { ChatSourceAdapter } from './types';
import { CopilotAdapter } from './copilot';

// Registry of all available adapters
export const adapters: ChatSourceAdapter[] = [new CopilotAdapter()];

/**
 * Get an adapter by source ID
 */
export function getAdapter(sourceId: string): ChatSourceAdapter | undefined {
  return adapters.find((a) => a.sourceId === sourceId);
}

/**
 * Get all available source IDs
 */
export function getAvailableSources(): string[] {
  return adapters.map((a) => a.sourceId);
}

// Re-export types and adapters
export type { ChatSourceAdapter, ImportState, ChatImportState } from './types';
export { CopilotAdapter } from './copilot';
