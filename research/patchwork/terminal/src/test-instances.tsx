/**
 * Multiple Instance Tests
 *
 * Validates that multiple Ink widgets can run in the same process.
 * Note: Ink has limitations with multiple instances in the same terminal.
 */

import { render } from 'ink';
import React from 'react';
import { Text, Box } from 'ink';
import { compileWidget } from './compiler.js';

function StaticWidget({ id, label }: { id: number; label: string }) {
  return (
    <Box>
      <Text color="cyan">[{id}]</Text>
      <Text> {label}</Text>
    </Box>
  );
}

async function testDirectInkRender() {
  console.log('\n=== Direct Ink Render Test ===\n');

  const element = React.createElement(StaticWidget, {
    id: 1,
    label: 'Direct render works',
  });
  const instance = render(element);

  await new Promise((resolve) => setTimeout(resolve, 100));
  instance.unmount();

  console.log('  ✅ Direct Ink render successful');
  return true;
}

async function testSequentialRenders() {
  console.log('\n=== Sequential Render Test ===\n');

  for (let i = 1; i <= 3; i++) {
    const element = React.createElement(StaticWidget, {
      id: i,
      label: `Widget ${i}`,
    });
    const instance = render(element);
    await new Promise((resolve) => setTimeout(resolve, 50));
    instance.unmount();
    console.log(`  ✅ Widget ${i} rendered and unmounted`);
  }

  return true;
}

async function testRerenderSameInstance() {
  console.log('\n=== Rerender Same Instance Test ===\n');

  const element1 = React.createElement(StaticWidget, {
    id: 1,
    label: 'Initial',
  });
  const instance = render(element1);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const element2 = React.createElement(StaticWidget, {
    id: 1,
    label: 'Updated',
  });
  instance.rerender(element2);

  await new Promise((resolve) => setTimeout(resolve, 50));
  instance.unmount();

  console.log('  ✅ Rerender successful');
  return true;
}

async function testConcurrentInstances() {
  console.log('\n=== Concurrent Instance Test ===\n');
  console.log(
    "  ⚠️  Note: Ink doesn't support multiple concurrent instances in the same terminal",
  );
  console.log('  This test documents the limitation.\n');

  const element1 = React.createElement(StaticWidget, { id: 1, label: 'First' });
  const instance1 = render(element1);

  try {
    const element2 = React.createElement(StaticWidget, {
      id: 2,
      label: 'Second',
    });
    const instance2 = render(element2);

    await new Promise((resolve) => setTimeout(resolve, 100));

    instance2.unmount();
    instance1.unmount();

    console.log('  ⚠️  Both instances created (output may be corrupted)');
  } catch (error) {
    console.log('  ✅ Concurrent instances blocked as expected');
  }

  return true;
}

async function main() {
  console.log('Terminal Multiple Instance Tests');
  console.log('=================================');

  const tests = [
    testDirectInkRender,
    testSequentialRenders,
    testRerenderSameInstance,
    testConcurrentInstances,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      if (await test()) passed++;
    } catch (error) {
      console.error(`❌ Test failed:`, error);
    }
  }

  console.log(`\n=================================`);
  console.log(`Results: ${passed}/${tests.length} tests passed`);

  console.log(
    '\n📝 Key Finding: Ink is designed for single-instance terminal UIs.',
  );
  console.log(
    '   For multiple widgets, use a layout container or sequential rendering.',
  );

  process.exit(passed === tests.length ? 0 : 1);
}

main();
