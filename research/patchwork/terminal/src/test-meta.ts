/**
 * Meta Extraction Tests
 *
 * Validates AST-based meta extraction for terminal widgets.
 */

import { extractMeta, stripMeta } from './meta.js';
import { widgetWithMeta } from './sample-widgets.js';

function testBasicMetaExtraction() {
  console.log('\n=== Basic Meta Extraction ===\n');

  const meta = extractMeta(widgetWithMeta);

  if (!meta) {
    console.log('  ❌ Failed to extract meta');
    return false;
  }

  console.log('  Extracted meta:', JSON.stringify(meta, null, 2));

  const checks = [
    { name: 'name field', test: meta.name === 'Dashboard Widget' },
    { name: 'description field', test: !!meta.description },
    { name: 'packages field', test: !!meta.packages?.['ink-spinner'] },
    { name: 'services field', test: meta.services?.includes('statsService') },
  ];

  let allPassed = true;
  for (const { name, test } of checks) {
    console.log(`  ${test ? '✅' : '❌'} ${name}`);
    if (!test) allPassed = false;
  }

  return allPassed;
}

function testMetaStripping() {
  console.log('\n=== Meta Stripping ===\n');

  const stripped = stripMeta(widgetWithMeta);

  const noMeta = !stripped.includes('export const meta');
  const hasComponent = stripped.includes('export default function Dashboard');

  console.log(`  ✅ Meta removed: ${noMeta}`);
  console.log(`  ✅ Component preserved: ${hasComponent}`);

  return noMeta && hasComponent;
}

function testNoMetaWidget() {
  console.log('\n=== Widget Without Meta ===\n');

  const noMetaWidget = `
import { Text } from 'ink';
export default function Simple() {
  return <Text>Hello</Text>;
}
`;

  const meta = extractMeta(noMetaWidget);
  const stripped = stripMeta(noMetaWidget);

  console.log(`  ✅ No meta extracted: ${meta === undefined}`);
  console.log(
    `  ✅ Source unchanged: ${stripped.includes(
      'export default function Simple',
    )}`,
  );

  return meta === undefined;
}

function testComplexMeta() {
  console.log('\n=== Complex Meta Extraction ===\n');

  const complexWidget = `
export const meta = {
  name: "Complex Widget",
  description: "A widget with many dependencies",
  packages: {
    "ink-spinner": "^5.0.0",
    "ink-table": "latest",
    "ink-select-input": "^6.0.0"
  },
  services: ["dataService", "authService", "analyticsService"]
};

import { Text } from 'ink';
export default function Complex() {
  return <Text>Complex</Text>;
}
`;

  const meta = extractMeta(complexWidget);

  if (!meta) {
    console.log('  ❌ Failed to extract complex meta');
    return false;
  }

  const packageCount = Object.keys(meta.packages || {}).length;
  const serviceCount = meta.services?.length || 0;

  console.log(`  ✅ Packages extracted: ${packageCount}`);
  console.log(`  ✅ Services extracted: ${serviceCount}`);

  return packageCount === 3 && serviceCount === 3;
}

function main() {
  console.log('Terminal Meta Extraction Tests');
  console.log('==============================');

  const tests = [
    testBasicMetaExtraction,
    testMetaStripping,
    testNoMetaWidget,
    testComplexMeta,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      if (test()) passed++;
    } catch (error) {
      console.error(`❌ Test failed:`, error);
    }
  }

  console.log(`\n==============================`);
  console.log(`Results: ${passed}/${tests.length} tests passed`);
  process.exit(passed === tests.length ? 0 : 1);
}

main();
