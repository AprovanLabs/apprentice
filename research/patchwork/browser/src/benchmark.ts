import { compileWidget, initializeCompiler } from './compiler.js';
import {
  simpleCounter,
  widgetWithEffects,
  complexWidget,
} from './sample-widgets.js';

interface BenchmarkResult {
  name: string;
  sourceLines: number;
  sourceBytes: number;
  outputBytes: number;
  coldTimeMs: number;
  warmTimesMs: number[];
  avgWarmTimeMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

async function benchmark(
  name: string,
  source: string,
  iterations: number = 20,
): Promise<BenchmarkResult> {
  const coldResult = await compileWidget(source);
  const coldTimeMs = coldResult.compilationTimeMs;
  const warmTimesMs: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await compileWidget(source);
    warmTimesMs.push(result.compilationTimeMs);
  }

  const avgWarmTimeMs =
    warmTimesMs.reduce((a, b) => a + b, 0) / warmTimesMs.length;

  return {
    name,
    sourceLines: source.split('\n').length,
    sourceBytes: source.length,
    outputBytes: coldResult.code.length,
    coldTimeMs,
    warmTimesMs,
    avgWarmTimeMs,
    p50Ms: percentile(warmTimesMs, 50),
    p95Ms: percentile(warmTimesMs, 95),
    p99Ms: percentile(warmTimesMs, 99),
  };
}

async function runBenchmarks() {
  console.log('🧪 Patchwork Browser Runtime - Performance Benchmarks\n');
  console.log('='.repeat(70));

  console.log('\n📦 Initializing esbuild-wasm...');
  const initStart = performance.now();
  await initializeCompiler();
  const initTime = performance.now() - initStart;
  console.log(`   ✅ Initialized in ${initTime.toFixed(2)}ms\n`);

  const widgets = [
    { name: 'Simple Counter', source: simpleCounter },
    { name: 'Data Widget', source: widgetWithEffects },
    { name: 'Complex Todo', source: complexWidget },
  ];

  console.log('📊 Running benchmarks (20 iterations each)...\n');

  const results: BenchmarkResult[] = [];

  for (const widget of widgets) {
    process.stdout.write(`   Benchmarking: ${widget.name}...`);
    const result = await benchmark(widget.name, widget.source);
    results.push(result);
    console.log(' done');
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n📈 RESULTS\n');

  console.log('┌' + '─'.repeat(68) + '┐');
  console.log(
    '│ Widget              │ Lines │  Cold  │  Avg   │  P50   │  P95   │',
  );
  console.log('├' + '─'.repeat(68) + '┤');

  for (const r of results) {
    const name = r.name.padEnd(19);
    const lines = r.sourceLines.toString().padStart(5);
    const cold = r.coldTimeMs.toFixed(1).padStart(5) + 'ms';
    const avg = r.avgWarmTimeMs.toFixed(1).padStart(5) + 'ms';
    const p50 = r.p50Ms.toFixed(1).padStart(5) + 'ms';
    const p95 = r.p95Ms.toFixed(1).padStart(5) + 'ms';
    console.log(`│ ${name} │ ${lines} │ ${cold} │ ${avg} │ ${p50} │ ${p95} │`);
  }

  console.log('└' + '─'.repeat(68) + '┘');

  console.log('\n📋 Summary:\n');

  const allTimes = results.flatMap((r) => r.warmTimesMs);
  const avgAll = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
  const maxTime = Math.max(...allTimes);
  const minTime = Math.min(...allTimes);

  console.log(`   Total compilations: ${allTimes.length}`);
  console.log(`   Average time: ${avgAll.toFixed(2)}ms`);
  console.log(`   Min time: ${minTime.toFixed(2)}ms`);
  console.log(`   Max time: ${maxTime.toFixed(2)}ms`);
  console.log(`   P50: ${percentile(allTimes, 50).toFixed(2)}ms`);
  console.log(`   P95: ${percentile(allTimes, 95).toFixed(2)}ms`);
  console.log(`   P99: ${percentile(allTimes, 99).toFixed(2)}ms`);

  const underTarget = allTimes.filter((t) => t < 100).length;
  const targetMet = (underTarget / allTimes.length) * 100;

  console.log(`\n   Target (<100ms): ${targetMet.toFixed(1)}% of compilations`);
  console.log(`   Status: ${targetMet >= 95 ? '✅ PASS' : '⚠️  REVIEW'}`);

  console.log('\n' + '='.repeat(70));
  console.log('\n✅ Benchmarks complete!\n');
}

runBenchmarks().catch(console.error);
