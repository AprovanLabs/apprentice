import { useState, useCallback } from 'react';
import { sendEditRequest } from './api';
import type {
  EditHistoryEntry,
  EditSessionState,
  EditSessionActions,
  CompileFn,
} from './types';

export interface UseEditSessionOptions {
  originalCode: string;
  compile?: CompileFn;
  apiEndpoint?: string;
}

export function useEditSession(
  options: UseEditSessionOptions,
): EditSessionState & EditSessionActions {
  const { originalCode, compile, apiEndpoint } = options;

  const [code, setCode] = useState(originalCode);
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingNotes, setStreamingNotes] = useState<string[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const performEdit = useCallback(
    async (
      currentCode: string,
      prompt: string,
      isRetry = false,
    ): Promise<{ newCode: string; entries: EditHistoryEntry[] }> => {
      const entries: EditHistoryEntry[] = [];

      const response = await sendEditRequest(
        { code: currentCode, prompt },
        {
          endpoint: apiEndpoint,
          onProgress: (note) => setStreamingNotes((prev) => [...prev, note]),
        },
      );

      entries.push({
        prompt: isRetry ? `Fix: ${prompt}` : prompt,
        summary: response.summary,
        isRetry,
      });

      if (compile) {
        const compileResult = await compile(response.newCode);
        if (!compileResult.success && compileResult.error) {
          setStreamingNotes([]);
          const errorPrompt = `Compilation error: ${compileResult.error}\n\nPlease fix this error.`;
          const retryResult = await performEdit(
            response.newCode,
            errorPrompt,
            true,
          );
          return {
            newCode: retryResult.newCode,
            entries: [...entries, ...retryResult.entries],
          };
        }
      }

      return { newCode: response.newCode, entries };
    },
    [compile, apiEndpoint],
  );

  const submitEdit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isApplying) return;

      setIsApplying(true);
      setError(null);
      setStreamingNotes([]);
      setPendingPrompt(prompt);

      try {
        const result = await performEdit(code, prompt);
        setCode(result.newCode);
        setHistory((prev) => [...prev, ...result.entries]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Edit failed');
      } finally {
        setIsApplying(false);
        setStreamingNotes([]);
        setPendingPrompt(null);
      }
    },
    [code, isApplying, performEdit],
  );

  const revert = useCallback(() => {
    setCode(originalCode);
    setHistory([]);
    setError(null);
    setStreamingNotes([]);
  }, [originalCode]);

  const updateCode = useCallback((newCode: string) => {
    setCode(newCode);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    code,
    originalCode,
    history,
    isApplying,
    error,
    streamingNotes,
    pendingPrompt,
    submitEdit,
    revert,
    updateCode,
    clearError,
  };
}
