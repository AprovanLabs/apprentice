import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { truncateOutput, FormatOptions } from './truncation.js';

interface MarkdownFormatOptions extends FormatOptions {
  width?: number;
  reflowText?: boolean;
}

export function formatMarkdown(
  markdown: string,
  options: MarkdownFormatOptions = {},
): string {
  marked.use(
    markedTerminal({
      width: options.width ?? 80,
      reflowText: options.reflowText ?? true,
    }),
  );

  const rendered = marked(markdown) as string;
  return truncateOutput(rendered.trim(), options);
}
