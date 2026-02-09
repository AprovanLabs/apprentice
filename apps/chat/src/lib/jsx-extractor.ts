// Matches fenced code blocks: ```language\n...content...```
// Captures: [1] = language (optional), [2] = content
const CODE_BLOCK_REGEX = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;

// Matches an unclosed code block at the end (streaming case)
const UNCLOSED_BLOCK_REGEX = /```([a-zA-Z0-9_+-]*)\n([\s\S]*)$/;

// Languages that should be treated as JSX/TSX (renderable React components)
const JSX_LANGUAGES = new Set(['jsx', 'tsx', 'react']);

export type TextPart = { type: 'text'; content: string };
export type CodePart = { type: 'code'; content: string; language: string };
export type JsxPart = { type: 'jsx'; content: string; language: string };
export type ParsedPart = TextPart | CodePart | JsxPart;

export interface ExtractOptions {
  /** Languages to treat as JSX (default: jsx, tsx, react) */
  jsxLanguages?: Set<string>;
  /** Only extract these languages (default: all) */
  filterLanguages?: Set<string>;
  /** Include unclosed code blocks at the end (for streaming) */
  includeUnclosed?: boolean;
}

/**
 * Extract code blocks from markdown text.
 * JSX/TSX blocks are returned with type 'jsx', other code blocks with type 'code'.
 */
export function extractCodeBlocks(
  text: string,
  options: ExtractOptions = {}
): ParsedPart[] {
  const { jsxLanguages = JSX_LANGUAGES, filterLanguages, includeUnclosed = false } = options;
  const parts: ParsedPart[] = [];
  let lastIndex = 0;

  // First pass: find all code blocks and track their positions
  const allMatches: Array<{ match: RegExpExecArray; language: string; content: string; included: boolean }> = [];
  const regex = new RegExp(CODE_BLOCK_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const language = match[1]?.toLowerCase() || '';
    const content = match[2];
    const included = !filterLanguages || filterLanguages.has(language);
    allMatches.push({ match, language, content, included });
  }

  // Process matches in order
  for (const { match, language, content, included } of allMatches) {
    // Add preceding text (excluding any skipped code blocks)
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Always advance lastIndex past this block (even if not included)
    lastIndex = match.index + match[0].length;

    // Only add the block if it passes the filter
    if (included) {
      if (jsxLanguages.has(language)) {
        parts.push({ type: 'jsx', content, language });
      } else {
        parts.push({ type: 'code', content, language });
      }
    }
  }

  // Check for unclosed code block at the end (streaming case)
  const remainingText = text.slice(lastIndex);
  if (includeUnclosed && remainingText.includes('```')) {
    const unclosedMatch = remainingText.match(UNCLOSED_BLOCK_REGEX);
    if (unclosedMatch) {
      const language = unclosedMatch[1]?.toLowerCase() || '';
      const content = unclosedMatch[2];
      const included = !filterLanguages || filterLanguages.has(language);
      
      // Add text before the unclosed block
      const unclosedIndex = remainingText.indexOf('```');
      if (unclosedIndex > 0) {
        const textBefore = remainingText.slice(0, unclosedIndex);
        if (textBefore.trim()) {
          parts.push({ type: 'text', content: textBefore });
        }
      }

      if (included) {
        if (jsxLanguages.has(language)) {
          parts.push({ type: 'jsx', content, language });
        } else {
          parts.push({ type: 'code', content, language });
        }
      }
      lastIndex = text.length; // Mark all text as processed
    }
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      parts.push({ type: 'text', content: remaining });
    }
  }

  // If no parts found, return the whole text
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }

  return parts;
}

/**
 * Extract only JSX/TSX blocks from markdown text.
 * Convenience function that filters to only jsx-type parts.
 * Only returns complete (closed) code blocks.
 */
export function extractJsxBlocks(text: string): ParsedPart[] {
  return extractCodeBlocks(text, {
    filterLanguages: JSX_LANGUAGES,
    includeUnclosed: false,
  });
}

/**
 * Find the first JSX/TSX block in the text.
 * Returns null if no JSX block is found.
 */
export function findFirstJsxBlock(text: string): JsxPart | null {
  const parts = extractCodeBlocks(text);
  return (parts.find((p) => p.type === 'jsx') as JsxPart) ?? null;
}

/**
 * Check if text contains any JSX/TSX code blocks.
 */
export function hasJsxBlock(text: string): boolean {
  return findFirstJsxBlock(text) !== null;
}

/**
 * Get all unique languages found in code blocks.
 */
export function getCodeBlockLanguages(text: string): Set<string> {
  const parts = extractCodeBlocks(text);
  const languages = new Set<string>();
  for (const part of parts) {
    if (part.type === 'jsx' || part.type === 'code') {
      languages.add(part.language);
    }
  }
  return languages;
}
