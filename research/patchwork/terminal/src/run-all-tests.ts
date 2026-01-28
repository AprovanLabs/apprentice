/**
 * Run All Terminal Validation Tests
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tests = [
  { name: 'Runtime Tests', script: 'test-runtime.ts' },
  { name: 'Hooks Tests', script: 'test-hooks.ts' },
  { name: 'Meta Extraction Tests', script: 'test-meta.ts' },
  { name: 'Bundling Strategy Tests', script: 'test-bundling.ts' },
  { name: 'Instance Tests', script: 'test-instances.tsx' },
];

async function runTest(name: string, script: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${name}`);
    console.log('='.repeat(60));

    const child = spawn('npx', ['tsx', join(__dirname, script)], {
      stdio: 'inherit',
      cwd: join(__dirname, '..'),
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', (error) => {
      console.error(`Failed to run ${script}:`, error);
      resolve(false);
    });
  });
}

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  PATCHWORK TERMINAL RUNTIME VALIDATION');
  console.log('█'.repeat(60));

  const results: { name: string; passed: boolean }[] = [];

  for (const { name, script } of tests) {
    const passed = await runTest(name, script);
    results.push({ name, passed });
  }

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60) + '\n');

  for (const { name, passed } of results) {
    console.log(`  ${passed ? '✅' : '❌'} ${name}`);
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`\n  Total: ${passed}/${total} test suites passed`);
  console.log('='.repeat(60) + '\n');

  process.exit(passed === total ? 0 : 1);
}

main();
