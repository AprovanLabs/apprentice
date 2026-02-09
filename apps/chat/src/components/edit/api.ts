import { applyDiffs, hasDiffBlocks, parseEditResponse } from '@/lib/diff';
import type { EditRequest, EditResponse } from './types';

export interface EditApiOptions {
  endpoint?: string;
  onProgress?: (note: string) => void;
}

export async function sendEditRequest(
  request: EditRequest,
  options: EditApiOptions = {},
): Promise<EditResponse> {
  const { endpoint = '/api/edit', onProgress } = options;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('Edit request failed');
  }

  const text = await streamResponse(response, onProgress);

  if (!hasDiffBlocks(text)) {
    throw new Error('No valid diffs in response');
  }

  const parsed = parseEditResponse(text);
  const result = applyDiffs(request.code, parsed.diffs);

  if (result.applied === 0) {
    // Provide detailed context about failed diffs for better error feedback
    const failedDetails = result.failed.map((f, i) => `[${i + 1}] "${f}"`).join('\n');
    throw new Error(
      `Failed to apply ${parsed.diffs.length} diff(s). None of the SEARCH blocks matched the code.\n\nFailed searches:\n${failedDetails}\n\nThis usually means the code has changed or the SEARCH text doesn't match exactly.`
    );
  }

  return {
    newCode: result.code,
    summary: parsed.summary || `Applied ${result.applied} change(s)`,
    progressNotes: parsed.progressNotes,
  };
}

async function streamResponse(
  response: Response,
  onProgress?: (note: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  let fullText = '';
  const emittedNotes = new Set<string>();

  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) {
      fullText += decoder.decode(result.value, { stream: true });

      if (onProgress) {
        // Only emit notes that are followed by a diff block fence, which confirms the note is complete.
        // This prevents emitting partial notes as they stream in character-by-character.
        // Allow any whitespace (including multiple newlines) between the note and fence.
        const noteWithFenceRegex = /\[note\]\s*([^\n]+)\n\s*```?\s*\n?<<<<<<< SEARCH|\[note\]\s*([^\n]+)\n\s*<<<<<<< SEARCH/g;
        let match;
        while ((match = noteWithFenceRegex.exec(fullText)) !== null) {
          const note = (match[1] || match[2]).trim();
          if (!emittedNotes.has(note)) {
            emittedNotes.add(note);
            onProgress(note);
          }
        }
      }
    }
  }

  return fullText;
}
