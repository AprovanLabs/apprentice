import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runScript(name: string, script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n${'#'.repeat(70)}`);
    console.log(`# Running: ${name}`);
    console.log(`${'#'.repeat(70)}\n`);

    const child = spawn('npx', ['tsx', script], {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${name} failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function runAllTests() {
  console.log('🚀 Patchwork Browser Runtime - Full Test Suite\n');
  console.log('='.repeat(70));
  console.log('Running all validation tests...');

  const tests = [
    { name: 'Compilation Tests', script: 'src/test-compilation.ts' },
    { name: 'Cache Tests', script: 'src/test-cache.ts' },
    { name: 'Error Handling Tests', script: 'src/test-error-handling.ts' },
    { name: 'Environment System Tests', script: 'src/test-environments.ts' },
    { name: 'Sandbox Tests', script: 'src/test-sandbox.ts' },
    { name: 'Multi-file Tests', script: 'src/test-multifile.ts' },
    { name: 'ShadCN Tests', script: 'src/test-shadcn.ts' },
    { name: 'PrimeReact Tests', script: 'src/test-primereact.ts' },
    { name: 'Performance Benchmarks', script: 'src/benchmark.ts' },
  ];

  const startTime = performance.now();

  for (const test of tests) {
    await runScript(test.name, test.script);
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(70));
  console.log(`\n✅ All tests complete in ${totalTime}s\n`);
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err.message);
  process.exit(1);
});
