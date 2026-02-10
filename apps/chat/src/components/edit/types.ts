export interface EditHistoryEntry {
  prompt: string;
  summary: string;
  isRetry?: boolean;
}

export interface EditSessionState {
  code: string;
  originalCode: string;
  history: EditHistoryEntry[];
  isApplying: boolean;
  error: string | null;
  streamingNotes: string[];
  pendingPrompt: string | null;
}

export interface EditSessionActions {
  submitEdit: (prompt: string) => Promise<void>;
  revert: () => void;
  updateCode: (code: string) => void;
  clearError: () => void;
}

export interface EditRequest {
  code: string;
  prompt: string;
}

export interface EditResponse {
  newCode: string;
  summary: string;
  progressNotes: string[];
}

export interface CompileResult {
  success: boolean;
  error?: string;
}

export type CompileFn = (code: string) => Promise<CompileResult>;
