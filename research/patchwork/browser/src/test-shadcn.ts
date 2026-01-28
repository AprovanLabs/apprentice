// Import environments first
import './environments';

import {
  compileWidget,
  initializeCompiler,
  generateImportMap,
  type Dependencies,
} from './compiler.js';
import { renderWithEnvironment } from './html-renderer.js';
import { shadcnEnvironment } from './environments';
import {
  shadcnButton,
  shadcnCard,
  shadcnBadge,
  shadcnButtonDemo,
  shadcnDashboardWidget,
} from './shadcn-widgets.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Use the standardized ShadCN dependencies from environment
const WIDGET_DEPENDENCIES: Dependencies = shadcnEnvironment.dependencies;

async function runShadcnTests() {
  console.log('🧪 Patchwork Browser Runtime - ShadCN Component Tests\n');
  console.log('='.repeat(60));

  // Show the dependency-based API
  console.log('\n📦 Dependencies (package.json style):\n');
  console.log(JSON.stringify(WIDGET_DEPENDENCIES, null, 2));

  console.log('\n📦 Initializing compiler...');
  const initStart = performance.now();
  await initializeCompiler();
  const initTime = performance.now() - initStart;
  console.log(`   ✅ Initialized in ${initTime.toFixed(2)}ms\n`);

  const tests = [
    {
      name: 'ShadCN Button Component',
      source: shadcnButton,
      description: 'class-variance-authority + clsx + tailwind-merge',
    },
    {
      name: 'ShadCN Card Component',
      source: shadcnCard,
      description: 'Compound component with forwardRef',
    },
    {
      name: 'ShadCN Badge Component',
      source: shadcnBadge,
      description: 'CVA variants for badges',
    },
    {
      name: 'Button Demo Widget',
      source: shadcnButtonDemo,
      description: 'Complete demo with all button variants',
    },
    {
      name: 'Dashboard Widget',
      source: shadcnDashboardWidget,
      description: 'Full dashboard with Lucide icons + Cards + Badges',
    },
  ];

  console.log('📊 ShadCN Compilation Tests:\n');

  const results: Array<{
    name: string;
    passed: boolean;
    timeMs: number;
    outputBytes: number;
  }> = [];

  for (const test of tests) {
    console.log(`   Testing: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    console.log(`   Source: ~${test.source.split('\n').length} lines\n`);

    const result = await compileWidget(test.source, {
      dependencies: WIDGET_DEPENDENCIES,
    });

    if (result.errors && result.errors.length > 0 && !result.code) {
      console.log(`   ❌ FAILED: ${result.errors.join(', ')}\n`);
      results.push({
        name: test.name,
        passed: false,
        timeMs: result.compilationTimeMs,
        outputBytes: 0,
      });
      continue;
    }

    const passed = result.compilationTimeMs < 100;
    results.push({
      name: test.name,
      passed: true,
      timeMs: result.compilationTimeMs,
      outputBytes: result.code.length,
    });

    console.log(
      `   Compilation time: ${result.compilationTimeMs.toFixed(2)}ms`,
    );
    console.log(
      `   Output: ${result.code.split('\n').length} lines, ${
        result.code.length
      } bytes`,
    );
    console.log(`   Cache hash: ${result.hash}`);
    console.log(
      `   Performance: ${passed ? '✅ PASS' : '⚠️  SLOW'} (target: <100ms)\n`,
    );

    if (result.errors && result.errors.length > 0) {
      console.log(`   Warnings: ${result.errors.join(', ')}\n`);
    }
  }

  // Generate HTML output for the dashboard widget
  console.log('='.repeat(60));
  console.log('\n📄 Generating HTML Output...\n');

  const dashboardResult = await compileWidget(shadcnDashboardWidget, {
    dependencies: WIDGET_DEPENDENCIES,
  });
  if (dashboardResult.code) {
    const html = renderWithEnvironment(dashboardResult.code, {
      environment: 'shadcn@latest',
      title: 'ShadCN Dashboard Demo',
    });

    const outputDir = join(process.cwd(), 'dist');
    await mkdir(outputDir, { recursive: true });
    const htmlPath = join(outputDir, 'dashboard-demo.html');
    await writeFile(htmlPath, html, 'utf-8');
    console.log(`   ✅ Generated: ${htmlPath}`);
  }

  // Also generate simpler button demo
  const buttonResult = await compileWidget(shadcnButtonDemo, {
    dependencies: WIDGET_DEPENDENCIES,
  });
  if (buttonResult.code) {
    const html = renderWithEnvironment(buttonResult.code, {
      environment: 'shadcn@latest',
      title: 'ShadCN Button Demo',
    });

    const outputDir = join(process.cwd(), 'dist');
    const htmlPath = join(outputDir, 'button-demo.html');
    await writeFile(htmlPath, html, 'utf-8');
    console.log(`   ✅ Generated: ${htmlPath}`);
  }

  console.log(`   Open in browser to see the rendered widgets\n`);

  // Import map output
  console.log('='.repeat(60));
  console.log('\n📋 Generated Import Map from Dependencies:\n');
  console.log(JSON.stringify(generateImportMap(WIDGET_DEPENDENCIES), null, 2));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:\n');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avgTime = results.reduce((a, r) => a + r.timeMs, 0) / results.length;

  console.log(`   Tests passed: ${passed}/${total}`);
  console.log(`   Average compilation time: ${avgTime.toFixed(2)}ms`);
  console.log(
    `   Status: ${passed === total ? '✅ ALL PASS' : '⚠️  SOME FAILED'}`,
  );

  console.log('\n✅ ShadCN compilation tests complete!\n');
}

runShadcnTests().catch(console.error);
