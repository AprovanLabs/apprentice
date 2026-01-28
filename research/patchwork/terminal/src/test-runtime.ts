/**
 * Runtime Tests - Basic Ink widget execution
 */

import { compileWidget } from './compiler.js';
import {
  counterWidget,
  spinnerWidget,
  dataListWidget,
} from './sample-widgets.js';

async function testBasicCompilation() {
  console.log('\n=== Basic Compilation Test ===\n');

  const result = await compileWidget(counterWidget);

  console.log(`✅ Compiled in ${result.compilationTimeMs.toFixed(2)}ms`);
  console.log(`   Hash: ${result.hash}`);
  console.log(`   Code size: ${result.code.length} bytes`);
  console.log(`   Errors: ${result.errors?.length || 0}`);

  if (result.errors?.length) {
    console.log(`   ❌ Errors: ${result.errors.join(', ')}`);
    return false;
  }

  return result.code.length > 0;
}

async function testMultipleWidgets() {
  console.log('\n=== Multiple Widget Compilation ===\n');

  const widgets = [
    { name: 'Counter', source: counterWidget },
    { name: 'Spinner', source: spinnerWidget },
    { name: 'DataList', source: dataListWidget },
  ];

  const results = [];
  for (const { name, source } of widgets) {
    const result = await compileWidget(source);
    results.push({ name, ...result });
    console.log(
      `  ${name}: ${result.compilationTimeMs.toFixed(2)}ms, ${
        result.code.length
      } bytes`,
    );
  }

  const allSuccess = results.every((r) => !r.errors?.length);
  console.log(
    `\n${allSuccess ? '✅' : '❌'} All widgets compiled: ${allSuccess}`,
  );
  return allSuccess;
}

async function testCodeOutput() {
  console.log('\n=== Code Output Verification ===\n');

  const result = await compileWidget(counterWidget);

  const checks = [
    { name: 'ESM format', test: result.code.includes('import') },
    { name: 'JSX compiled', test: !result.code.includes('<Box') },
    { name: 'Hooks preserved', test: result.code.includes('useState') },
    { name: 'Export present', test: result.code.includes('export') },
  ];

  let allPassed = true;
  for (const { name, test } of checks) {
    console.log(`  ${test ? '✅' : '❌'} ${name}`);
    if (!test) allPassed = false;
  }

  return allPassed;
}

async function main() {
  console.log('Terminal Runtime Validation Tests');
  console.log('==================================');

  const tests = [testBasicCompilation, testMultipleWidgets, testCodeOutput];

  let passed = 0;
  for (const test of tests) {
    try {
      if (await test()) passed++;
    } catch (error) {
      console.error(`❌ Test failed with error:`, error);
    }
  }

  console.log(`\n==================================`);
  console.log(`Results: ${passed}/${tests.length} tests passed`);
  process.exit(passed === tests.length ? 0 : 1);
}

main();
