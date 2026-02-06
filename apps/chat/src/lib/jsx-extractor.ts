const JSX_BLOCK_REGEX = /```jsx\n([\s\S]*?)```/g;

export type TextPart = { type: 'text'; content: string };
export type JsxPart = { type: 'jsx'; content: string };
export type ParsedPart = TextPart | JsxPart;

export function extractJsxBlocks(text: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(JSX_BLOCK_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    parts.push({ type: 'jsx', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      parts.push({ type: 'text', content: remaining });
    }
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }

  return parts;
}
