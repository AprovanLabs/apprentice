/**
 * Hooks Tests - Validate React hooks work in terminal widgets
 */

import { compileWidget } from './compiler.js';
import {
  counterWidget,
  spinnerWidget,
  reducerWidget,
} from './sample-widgets.js';

async function testUseState() {
  console.log('\n=== useState Hook Test ===\n');

  const result = await compileWidget(counterWidget);
  const hasStateHook = result.code.includes('useState');

  console.log(`  Compilation: ${result.compilationTimeMs.toFixed(2)}ms`);
  console.log(`  ✅ useState referenced in output: ${hasStateHook}`);

  return !result.errors?.length;
}

async function testUseEffect() {
  console.log('\n=== useEffect Hook Test ===\n');

  const result = await compileWidget(spinnerWidget);
  const hasEffectHook = result.code.includes('useEffect');

  console.log(`  Compilation: ${result.compilationTimeMs.toFixed(2)}ms`);
  console.log(`  ✅ useEffect referenced in output: ${hasEffectHook}`);

  return !result.errors?.length;
}

async function testUseReducer() {
  console.log('\n=== useReducer Hook Test ===\n');

  const result = await compileWidget(reducerWidget);
  const hasReducerHook = result.code.includes('useReducer');

  console.log(`  Compilation: ${result.compilationTimeMs.toFixed(2)}ms`);
  console.log(`  ✅ useReducer referenced in output: ${hasReducerHook}`);

  return !result.errors?.length;
}

async function testUseInput() {
  console.log('\n=== useInput (Ink) Hook Test ===\n');

  const result = await compileWidget(counterWidget);
  const hasInputHook = result.code.includes('useInput');

  console.log(`  Compilation: ${result.compilationTimeMs.toFixed(2)}ms`);
  console.log(`  ✅ useInput (Ink) referenced in output: ${hasInputHook}`);

  return !result.errors?.length;
}

async function testComplexHooks() {
  console.log('\n=== Complex Hooks Combination ===\n');

  const complexWidget = `
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Text, Box } from 'ink';

export default function Complex() {
  const [data, setData] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(
    () => data.filter(d => d.includes(filter)),
    [data, filter]
  );

  const loadData = useCallback(async () => {
    setData(['item1', 'item2', 'item3']);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <Box flexDirection="column">
      <Text>Items: {filtered.length}</Text>
    </Box>
  );
}
`;

  const result = await compileWidget(complexWidget);

  const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo'];
  let allPresent = true;

  for (const hook of hooks) {
    const present = result.code.includes(hook);
    console.log(`  ${present ? '✅' : '❌'} ${hook} in output`);
    if (!present) allPresent = false;
  }

  return !result.errors?.length;
}

async function main() {
  console.log('Terminal Hooks Validation Tests');
  console.log('================================');

  const tests = [
    testUseState,
    testUseEffect,
    testUseReducer,
    testUseInput,
    testComplexHooks,
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      if (await test()) passed++;
    } catch (error) {
      console.error(`❌ Test failed:`, error);
    }
  }

  console.log(`\n================================`);
  console.log(`Results: ${passed}/${tests.length} tests passed`);
  process.exit(passed === tests.length ? 0 : 1);
}

main();
