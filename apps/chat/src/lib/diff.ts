const DIFF_BLOCK_REGEX = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

/** Patterns that indicate diff markers in text */
const DIFF_MARKER_PATTERNS = [
  /^<<<<<<< SEARCH\s*$/m,
  /^=======\s*$/m,
  /^>>>>>>> REPLACE\s*$/m,
];

export interface DiffBlock {
  search: string;
  replace: string;
  progressNote?: string;
}

/**
 * Check if text contains any diff markers.
 * Returns the first marker found, or null if clean.
 */
export function findDiffMarkers(text: string): string | null {
  for (const pattern of DIFF_MARKER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * Remove stray diff markers from text.
 * Use as a fallback when markers leak into output.
 */
export function sanitizeDiffMarkers(text: string): string {
  let result = text;
  // Remove standalone marker lines
  result = result.replace(/^<<<<<<< SEARCH\s*\n?/gm, '');
  result = result.replace(/^=======\s*\n?/gm, '');
  result = result.replace(/^>>>>>>> REPLACE\s*\n?/gm, '');
  // Clean up any double newlines created by removals
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

export interface ParsedEditResponse {
  progressNotes: string[];
  diffs: DiffBlock[];
  summary: string;
}

/**
 * Parse progress notes and diffs from an edit response.
 * Format expected:
 * `[note] Progress note text`
 * followed by `SEARCH`/`REPLACE` diff blocks.
 *
 * Summary markdown at the end.
 */
export function parseEditResponse(text: string): ParsedEditResponse {
  const progressNotes: string[] = [];
  const diffs: DiffBlock[] = [];
  
  // Match progress notes: [note] followed by text until diff block or another note
  const noteRegex = /\[note\]\s*([^\n]+)/g;
  let noteMatch;
  while ((noteMatch = noteRegex.exec(text)) !== null) {
    progressNotes.push(noteMatch[1].trim());
  }
  
  // Parse diff blocks with their associated progress notes
  const diffBlockRegex = /(?:\[note\]\s*([^\n]+)\n)?<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let match;
  while ((match = diffBlockRegex.exec(text)) !== null) {
    diffs.push({
      progressNote: match[1]?.trim(),
      search: match[2],
      replace: match[3],
    });
  }
  
  // Extract summary: everything after the last diff block (if any), excluding notes
  const summary = extractSummary(text);
  
  return { progressNotes, diffs, summary };
}

export function parseDiffs(text: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const regex = new RegExp(DIFF_BLOCK_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ search: match[1], replace: match[2] });
  }
  return blocks;
}

export function applyDiffs(
  code: string,
  diffs: DiffBlock[],
  options: { sanitize?: boolean } = {},
): { code: string; applied: number; failed: string[]; warning?: string } {
  let result = code;
  let applied = 0;
  const failed: string[] = [];

  for (const diff of diffs) {
    if (result.includes(diff.search)) {
      result = result.replace(diff.search, diff.replace);
      applied++;
    } else {
      // Provide more context: first 100 chars or first 3 lines, whichever is shorter
      const lines = diff.search.split('\n').slice(0, 3);
      const preview = lines.join('\n').slice(0, 100);
      const suffix = diff.search.length > preview.length ? '...' : '';
      failed.push(preview + suffix);
    }
  }

  // Check for stray diff markers in the result
  const marker = findDiffMarkers(result);
  let warning: string | undefined;

  if (marker) {
    if (options.sanitize) {
      result = sanitizeDiffMarkers(result);
      warning = `Removed stray diff marker "${marker}" from output`;
    } else {
      warning = `Output contains diff marker "${marker}" - the LLM may have generated a malformed response`;
    }
  }

  return { code: result, applied, failed, warning };
}

export function hasDiffBlocks(text: string): boolean {
  return DIFF_BLOCK_REGEX.test(text);
}

export function extractTextWithoutDiffs(text: string): string {
  return text.replace(DIFF_BLOCK_REGEX, '').trim();
}

/**
 * Extract the summary markdown from an edit response.
 * Removes diff blocks, progress notes, empty code blocks, and any leading/trailing whitespace.
 */
export function extractSummary(text: string): string {
  // Remove all diff blocks
  let summary = text.replace(DIFF_BLOCK_REGEX, '');
  // Remove progress notes
  summary = summary.replace(/\[note\]\s*[^\n]+\n?/g, '');
  // Remove empty or near-empty code blocks (```...``` with only whitespace/newlines)
  summary = summary.replace(/```[a-z]*\n?\s*```/gi, '');
  // Remove stray diff fence markers that might be left over
  summary = summary.replace(/^<<<<<<< SEARCH\s*$/gm, '');
  summary = summary.replace(/^=======\s*$/gm, '');
  summary = summary.replace(/^>>>>>>> REPLACE\s*$/gm, '');
  // Remove standalone ``` markers (not part of a code block)
  summary = summary.replace(/^```[a-z]*\s*$/gm, '');
  // Clean up multiple newlines (2+ becomes 2) and trim
  summary = summary.replace(/\n{2,}/g, '\n\n').trimStart().trim();
  return summary;
}
