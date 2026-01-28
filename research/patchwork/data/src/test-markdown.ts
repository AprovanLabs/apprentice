import { formatMarkdown } from './markdown-formatter.js';

const samples = {
  simple: '# Hello World\n\nThis is **bold** and *italic* text.',

  complex: `# Data Formatter Test

## Features

- Markdown rendering with **bold** and *italic*
- Syntax highlighting for \`code\`
- Lists and tables

### Code Example

\`\`\`typescript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

### Table

| Column 1 | Column 2 |
|----------|----------|
| Value A  | Value B  |
| Value C  | Value D  |
`,

  large: '# Large Document\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(500),
};

console.log('=== Simple Markdown ===\n');
console.log(formatMarkdown(samples.simple));

console.log('\n=== Complex Markdown ===\n');
console.log(formatMarkdown(samples.complex));

console.log('\n=== Truncated Large Markdown (max 500 bytes) ===\n');
console.log(formatMarkdown(samples.large, { maxLength: 500 }));
