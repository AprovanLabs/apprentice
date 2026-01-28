import { formatMarkdown } from './markdown-formatter.js';
import { formatJson } from './json-formatter.js';

console.log('╔════════════════════════════════════════╗');
console.log('║  Patchwork Data Formatter Validation     ║');
console.log('╚════════════════════════════════════════╝\n');

console.log('→ Markdown Formatting\n');
const markdown = `# System Status

**Status:** Operational  
**Uptime:** 99.9%

- Database: ✓ Connected
- API: ✓ Responding
- Cache: ✓ Ready

> All systems operational`;

console.log(formatMarkdown(markdown));

console.log('\n→ JSON Formatting\n');
const data = {
  service: 'api-gateway',
  status: 'healthy',
  metrics: {
    requests: 1247,
    errors: 3,
    latency_ms: 42.5,
  },
  active: true,
  lastCheck: null,
};

console.log(formatJson(data));

console.log('\n✓ All formatters validated');
