import {
  compileWidget,
  initializeCompiler,
  generateImportMap,
  type Dependencies,
} from './compiler.js';
import {
  simpleCounter,
  widgetWithEffects,
  complexWidget,
} from './sample-widgets.js';

async function runTests() {
  console.log('🧪 Patchwork Browser Runtime - Compilation Tests\n');
  console.log('='.repeat(60));

  console.log('\n📦 Initializing esbuild-wasm...');
  const initStart = performance.now();
  await initializeCompiler();
  const initTime = performance.now() - initStart;
  console.log(`   ✅ Initialized in ${initTime.toFixed(2)}ms\n`);

  const tests = [
    {
      name: 'Simple Counter (useState)',
      source: simpleCounter,
      expectedLines: 25,
    },
    {
      name: 'Data Widget (useState, useEffect, useCallback)',
      source: widgetWithEffects,
      expectedLines: 95,
    },
    {
      name: 'Complex Todo (useReducer, useMemo, useEffect)',
      source: complexWidget,
      expectedLines: 130,
    },
  ];

  console.log('📊 Compilation Tests:\n');

  for (const test of tests) {
    console.log(`   Testing: ${test.name}`);
    console.log(`   Source: ~${test.source.split('\n').length} lines\n`);

    const result = await compileWidget(test.source);

    if (result.errors && result.errors.length > 0 && !result.code) {
      console.log(`   ❌ FAILED: ${result.errors.join(', ')}\n`);
      continue;
    }

    const outputLines = result.code.split('\n').length;
    const passed = result.compilationTimeMs < 100;

    console.log(
      `   Compilation time: ${result.compilationTimeMs.toFixed(2)}ms`,
    );
    console.log(`   Output: ${outputLines} lines, ${result.code.length} bytes`);
    console.log(`   Cache hash: ${result.hash}`);
    console.log(
      `   Performance: ${passed ? '✅ PASS' : '⚠️  SLOW'} (target: <100ms)\n`,
    );

    if (result.errors && result.errors.length > 0) {
      console.log(`   Warnings: ${result.errors.join(', ')}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('\n📋 Import Map Configuration:\n');
  const deps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  };
  console.log(JSON.stringify(generateImportMap(deps), null, 2));

  console.log('\n✅ Compilation tests complete!\n');
}

runTests().catch(console.error);
