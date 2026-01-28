import type { MetadataHandler } from '../metadata-handlers';

function extractShebang(content: string): string | undefined {
  const lines = content.split('\n');
  if (lines[0]?.startsWith('#!')) {
    return lines[0].slice(2).trim();
  }
  return undefined;
}

function extractHeaderComments(content: string): {
  description?: string;
  usage?: string;
  args?: string[];
} {
  const lines = content.split('\n');
  const result: {
    description?: string;
    usage?: string;
    args?: string[];
  } = {};

  const descriptionLines: string[] = [];
  const usageLines: string[] = [];
  const argLines: string[] = [];
  let currentSection: 'description' | 'usage' | 'args' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    if (i === 0 && line.startsWith('#!')) {
      continue;
    }

    if (!line.trim().startsWith('#')) {
      if (line.trim() !== '') {
        break;
      }
      continue;
    }

    const commentContent = line.replace(/^#\s*/, '').trim();

    if (
      commentContent.toLowerCase().startsWith('description:') ||
      commentContent.toLowerCase().startsWith('desc:')
    ) {
      currentSection = 'description';
      const desc = commentContent
        .replace(/^(description|desc):\s*/i, '')
        .trim();
      if (desc) descriptionLines.push(desc);
    } else if (commentContent.toLowerCase().startsWith('usage:')) {
      currentSection = 'usage';
      const usage = commentContent.replace(/^usage:\s*/i, '').trim();
      if (usage) usageLines.push(usage);
    } else if (
      commentContent.toLowerCase().startsWith('args:') ||
      commentContent.toLowerCase().startsWith('arguments:')
    ) {
      currentSection = 'args';
      const args = commentContent.replace(/^(args|arguments):\s*/i, '').trim();
      if (args) argLines.push(args);
    } else if (commentContent && currentSection) {
      if (currentSection === 'description') {
        descriptionLines.push(commentContent);
      } else if (currentSection === 'usage') {
        usageLines.push(commentContent);
      } else if (currentSection === 'args') {
        argLines.push(commentContent);
      }
    } else if (!currentSection && commentContent) {
      descriptionLines.push(commentContent);
    }
  }

  if (descriptionLines.length > 0) {
    result.description = descriptionLines.join(' ').trim();
  }
  if (usageLines.length > 0) {
    result.usage = usageLines.join('\n').trim();
  }
  if (argLines.length > 0) {
    result.args = argLines;
  }

  return result;
}

export const shellScriptHandler: MetadataHandler = {
  name: 'script',
  extensions: ['.sh', '.bash', '.zsh'],
  priority: 10,
  extract: (filePath: string, content: string) => {
    const shebang = extractShebang(content);
    const headerInfo = extractHeaderComments(content);

    return {
      interpreter: shebang,
      ...headerInfo,
    };
  },
};
