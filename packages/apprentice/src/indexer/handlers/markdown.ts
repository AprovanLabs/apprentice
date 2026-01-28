import type { MetadataHandler } from '../metadata-handlers';
import { parse as parseYaml } from 'yaml';

function extractFrontmatter(content: string): Record<string, unknown> | null {
  const lines = content.split('\n');

  if (!lines[0]?.trim().startsWith('---')) {
    return null;
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim().startsWith('---')) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const frontmatterText = lines.slice(1, endIndex).join('\n');

  try {
    const parsed = parseYaml(frontmatterText);
    return parsed || {};
  } catch {
    // Common frontmatter issues (e.g., unquoted brackets in titles like "[JIRA-123]")
    // are not worth logging - just skip frontmatter silently
    return null;
  }
}

export const markdownHandler: MetadataHandler = {
  name: 'frontmatter',
  extensions: ['.md', '.mdx'],
  priority: 10,
  extract: (_filePath: string, content: string) => {
    const frontmatter = extractFrontmatter(content);
    return frontmatter || {};
  },
};
