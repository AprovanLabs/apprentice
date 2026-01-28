import { truncateOutput, estimateSize } from './truncation.js';

const samples = [
  'Short string',
  'A'.repeat(100),
  'B'.repeat(1000),
  'C'.repeat(10000),
  'D'.repeat(20000),
];

console.log('=== Truncation Tests ===\n');

samples.forEach((sample, i) => {
  const size = sample.length;
  const truncated = truncateOutput(sample, { maxLength: 100 });
  console.log(`Sample ${i + 1}: ${size} bytes → ${truncated.length} bytes`);

  if (truncated !== sample) {
    console.log('  Truncated:', truncated.slice(0, 50) + '...');
  }
});

console.log('\n=== Size Estimation ===\n');

const data = {
  string: 'Hello',
  number: 12345,
  array: [1, 2, 3],
  nested: { a: 1, b: 2 },
};

console.log(`String size: ${estimateSize('Hello')} bytes`);
console.log(`Object size: ${estimateSize(data)} bytes`);
console.log(`Array size: ${estimateSize([1, 2, 3, 4, 5])} bytes`);
