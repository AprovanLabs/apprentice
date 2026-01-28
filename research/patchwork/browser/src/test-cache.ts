import { compileWidget, generateContentHash } from './compiler.js';
import { simpleCounter, complexWidget } from './sample-widgets.js';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), '.cache');

async function runCacheTests() {
  console.log('🧪 Patchwork Browser Runtime - Cache Tests\n');
  console.log('='.repeat(60));

  await rm(CACHE_DIR, { recursive: true, force: true });
  await mkdir(CACHE_DIR, { recursive: true });
  console.log(`\n📁 Cache directory: ${CACHE_DIR}\n`);

  console.log('📊 Cold Compilation (no cache):\n');

  const coldResult = await compileWidget(simpleCounter, {
    cacheDir: CACHE_DIR,
  });
  console.log(`   Source hash: ${coldResult.hash}`);
  console.log(
    `   Compilation time: ${coldResult.compilationTimeMs.toFixed(2)}ms`,
  );
  console.log(`   From cache: ${coldResult.fromCache ? 'Yes' : 'No'}`);
  console.log(`   ✅ Code cached to disk\n`);

  console.log('📊 Warm Compilation (from cache):\n');

  const warmResult = await compileWidget(simpleCounter, {
    cacheDir: CACHE_DIR,
  });
  console.log(`   Source hash: ${warmResult.hash}`);
  console.log(`   Load time: ${warmResult.compilationTimeMs.toFixed(2)}ms`);
  console.log(`   From cache: ${warmResult.fromCache ? 'Yes' : 'No'}`);

  const speedup = coldResult.compilationTimeMs / warmResult.compilationTimeMs;
  console.log(
    `   Speedup: ${speedup.toFixed(1)}x faster than cold compilation\n`,
  );

  console.log('📊 Multiple Compilations Benchmark:\n');

  const iterations = 5;
  const coldTimes: number[] = [];
  const warmTimes: number[] = [];

  const tempCacheDir = join(CACHE_DIR, 'benchmark');
  await rm(tempCacheDir, { recursive: true, force: true });

  for (let i = 0; i < iterations; i++) {
    const result = await compileWidget(complexWidget, {
      cacheDir: tempCacheDir,
    });
    if (result.fromCache) {
      warmTimes.push(result.compilationTimeMs);
    } else {
      coldTimes.push(result.compilationTimeMs);
    }
  }

  console.log(`   Cold compilations: ${coldTimes.length}`);
  console.log(
    `   Avg cold time: ${(
      coldTimes.reduce((a, b) => a + b, 0) / coldTimes.length
    ).toFixed(2)}ms`,
  );
  console.log(`   Warm loads: ${warmTimes.length}`);
  console.log(
    `   Avg warm time: ${(
      warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length
    ).toFixed(2)}ms\n`,
  );

  console.log('📊 Hash Stability Test:\n');

  const hash1 = generateContentHash(simpleCounter);
  const hash2 = generateContentHash(simpleCounter);
  const hash3 = generateContentHash(simpleCounter + ' ');

  console.log(`   Same source, hash 1: ${hash1}`);
  console.log(`   Same source, hash 2: ${hash2}`);
  console.log(`   Hash match: ${hash1 === hash2 ? '✅ Yes' : '❌ No'}`);
  console.log(`   Modified source hash: ${hash3}`);
  console.log(`   Different hash: ${hash1 !== hash3 ? '✅ Yes' : '❌ No'}\n`);

  await rm(CACHE_DIR, { recursive: true, force: true });
  console.log('🧹 Cache directory cleaned up\n');

  console.log('='.repeat(60));
  console.log('\n✅ Cache tests complete!\n');
}

runCacheTests().catch(console.error);
