import { formatJson, formatJsonCompact } from './json-formatter.js';

const samples = {
  simple: { name: 'Alice', age: 30, active: true },

  nested: {
    user: {
      id: 123,
      name: 'Bob',
      email: 'bob@example.com',
      roles: ['admin', 'user'],
    },
    metadata: {
      created: '2026-01-25',
      updated: null,
      verified: false,
    },
  },

  array: [
    { id: 1, status: 'active' },
    { id: 2, status: 'inactive' },
    { id: 3, status: 'pending' },
  ],

  large: {
    items: Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random(),
    })),
  },
};

console.log('=== Simple JSON ===\n');
console.log(formatJson(samples.simple));

console.log('\n=== Nested JSON ===\n');
console.log(formatJson(samples.nested));

console.log('\n=== Array JSON ===\n');
console.log(formatJson(samples.array));

console.log('\n=== Compact JSON ===\n');
console.log(formatJsonCompact(samples.nested));

console.log('\n=== Truncated Large JSON (max 500 bytes) ===\n');
console.log(formatJson(samples.large, { maxLength: 500 }));
