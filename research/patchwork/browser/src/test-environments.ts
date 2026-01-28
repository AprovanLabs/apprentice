/**
 * Tests for the Patchwork Environment System
 *
 * Run with: pnpm tsx src/test-environments.ts
 */

// Import environments (auto-registers them)
import './environments';

import {
  environmentRegistry,
  resolveEnvironment,
  getEnvironmentCss,
  getEnvironmentThemeClasses,
  getEnvironmentHeadContent,
  mergeEnvironmentDependencies,
  shadcnEnvironment,
  primereactEnvironment,
  minimalEnvironment,
  bareEnvironment,
} from './environments';
import {
  compileWidget,
  compileMultiFileWidget,
  type VirtualFileSystem,
} from './compiler';
import { renderToHtml, renderWithEnvironment } from './html-renderer';
import { generateSandboxHtml } from './iframe-sandbox';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DIST_DIR = join(import.meta.dirname, '..', 'dist');

// ============================================================================
// Test Helpers
// ============================================================================

interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  message: string;
  timeMs?: number;
}

const results: TestResult[] = [];

function log(emoji: string, message: string): void {
  console.log(`${emoji} ${message}`);
}

async function runTest(
  name: string,
  fn: () => Promise<{ status: 'pass' | 'fail'; message: string }>,
): Promise<void> {
  const start = performance.now();
  try {
    const result = await fn();
    const timeMs = performance.now() - start;
    results.push({ name, ...result, timeMs });
    const emoji = result.status === 'pass' ? '✓' : '✗';
    log(emoji, `${name}: ${result.message} (${timeMs.toFixed(2)}ms)`);
  } catch (error) {
    const timeMs = performance.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'fail', message, timeMs });
    log('✗', `${name}: ${message} (${timeMs.toFixed(2)}ms)`);
  }
}

// ============================================================================
// Environment Registry Tests
// ============================================================================

async function testEnvironmentRegistration(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const envs = environmentRegistry.list();

  // Should have at least these environments
  const expectedIds = [
    'shadcn@latest',
    'shadcn-minimal@latest',
    'primereact@10',
    'primereact-minimal@10',
    'minimal@latest',
    'bare@latest',
  ];

  const missingIds = expectedIds.filter((id) => !envs.find((e) => e.id === id));

  if (missingIds.length > 0) {
    return {
      status: 'fail',
      message: `Missing environments: ${missingIds.join(', ')}`,
    };
  }

  return {
    status: 'pass',
    message: `${envs.length} environments registered`,
  };
}

async function testEnvironmentResolution(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  // Valid resolution
  const env = resolveEnvironment('shadcn@latest');
  if (env.id !== 'shadcn@latest') {
    return { status: 'fail', message: 'Wrong environment resolved' };
  }

  // Invalid resolution should throw
  try {
    resolveEnvironment('nonexistent@1.0.0');
    return { status: 'fail', message: 'Should have thrown for unknown env' };
  } catch (e) {
    // Expected
  }

  return { status: 'pass', message: 'Resolution works correctly' };
}

// ============================================================================
// Environment CSS Tests
// ============================================================================

async function testShadcnCss(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const env = resolveEnvironment('shadcn@latest');

  // Light theme
  const lightCss = getEnvironmentCss(env, 'light');
  if (!lightCss.includes('--background: 0 0% 100%')) {
    return { status: 'fail', message: 'Light theme CSS vars not found' };
  }

  // Dark theme
  const darkCss = getEnvironmentCss(env, 'dark');
  const { htmlClass } = getEnvironmentThemeClasses(env, 'dark');
  if (htmlClass !== 'dark') {
    return { status: 'fail', message: 'Dark theme class not set' };
  }

  return { status: 'pass', message: 'ShadCN CSS variables correct' };
}

async function testPrimereactCss(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const env = resolveEnvironment('primereact@10');

  if (!env.baseCss?.content) {
    return { status: 'fail', message: 'No base CSS' };
  }

  if (!env.themes || env.themes.length === 0) {
    return { status: 'fail', message: 'No themes defined' };
  }

  return {
    status: 'pass',
    message: `${env.themes.length} themes available`,
  };
}

// ============================================================================
// Environment Head Content Tests
// ============================================================================

async function testShadcnHeadContent(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const env = resolveEnvironment('shadcn@latest');
  const headContent = getEnvironmentHeadContent(env);

  if (!headContent.includes('cdn.tailwindcss.com')) {
    return { status: 'fail', message: 'Tailwind CDN not included' };
  }

  return { status: 'pass', message: 'Tailwind CDN script injected' };
}

async function testPrimereactHeadContent(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const env = resolveEnvironment('primereact@10');
  const headContent = getEnvironmentHeadContent(env);

  const checks = [
    { test: headContent.includes('primereact'), name: 'PrimeReact styles' },
    { test: headContent.includes('primeflex'), name: 'PrimeFlex' },
    { test: headContent.includes('primeicons'), name: 'PrimeIcons' },
  ];

  const failed = checks.filter((c) => !c.test);
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Missing: ${failed.map((c) => c.name).join(', ')}`,
    };
  }

  return { status: 'pass', message: 'All PrimeReact CDN resources included' };
}

// ============================================================================
// HTML Renderer Tests
// ============================================================================

async function testRenderWithEnvironment(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const simpleWidget = `
    import React from 'react';
    export default function Hello() {
      return <div className="p-4 bg-background text-foreground">Hello ShadCN!</div>;
    }
  `;

  const compiled = await compileWidget(simpleWidget, {
    dependencies: shadcnEnvironment.dependencies,
  });

  if (compiled.errors?.length && !compiled.code) {
    return {
      status: 'fail',
      message: `Compilation failed: ${compiled.errors.join(', ')}`,
    };
  }

  const html = renderWithEnvironment(compiled.code, {
    environment: 'shadcn@latest',
    theme: 'dark',
    title: 'ShadCN Test Widget',
  });

  const checks = [
    { test: html.includes('class="dark"'), name: 'dark theme class' },
    { test: html.includes('--background:'), name: 'CSS variables' },
    { test: html.includes('cdn.tailwindcss.com'), name: 'Tailwind CDN' },
    { test: html.includes('importmap'), name: 'import map' },
    { test: html.includes('lucide-react'), name: 'lucide-react dependency' },
  ];

  const failed = checks.filter((c) => !c.test);
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Missing: ${failed.map((c) => c.name).join(', ')}`,
    };
  }

  // Save for manual inspection
  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(join(DIST_DIR, 'test-shadcn-env.html'), html);

  return {
    status: 'pass',
    message: 'Environment-based HTML rendered correctly',
  };
}

async function testRenderMinimal(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const simpleWidget = `
    import React from 'react';
    export default function Hello() {
      return <div>Hello Minimal!</div>;
    }
  `;

  const compiled = await compileWidget(simpleWidget);
  const html = renderWithEnvironment(compiled.code, {
    environment: 'minimal@latest',
  });

  // Minimal should NOT have Tailwind or ShadCN
  if (html.includes('tailwindcss')) {
    return { status: 'fail', message: 'Minimal env should not have Tailwind' };
  }
  if (html.includes('--background:')) {
    return { status: 'fail', message: 'Minimal env should not have CSS vars' };
  }

  return { status: 'pass', message: 'Minimal environment works correctly' };
}

// ============================================================================
// Sandbox Tests with Environments
// ============================================================================

async function testSandboxWithEnvironment(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const widget = `
    import React from 'react';
    export default function Widget() {
      return <div className="p-4 bg-card rounded-lg shadow">Sandbox Widget</div>;
    }
  `;

  const compiled = await compileWidget(widget, {
    dependencies: shadcnEnvironment.dependencies,
  });

  const html = generateSandboxHtml(compiled.code, {
    environment: 'shadcn@latest',
    theme: 'dark',
    title: 'Sandbox Test',
  });

  const checks = [
    { test: html.includes('class="dark"'), name: 'dark theme' },
    { test: html.includes('--background:'), name: 'CSS variables' },
    { test: html.includes('cdn.tailwindcss.com'), name: 'Tailwind CDN' },
    { test: html.includes('importmap'), name: 'import map' },
    { test: html.includes('postMessage'), name: 'postMessage' },
  ];

  const failed = checks.filter((c) => !c.test);
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Missing: ${failed.map((c) => c.name).join(', ')}`,
    };
  }

  // Save for manual inspection
  await writeFile(join(DIST_DIR, 'test-sandbox-env.html'), html);

  return { status: 'pass', message: 'Sandbox with environment works' };
}

// ============================================================================
// PrimeReact Environment Test
// ============================================================================

async function testPrimereactWidget(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const widget = `
    import React from 'react';
    // In a real widget, you'd import PrimeReact components
    export default function PrimeWidget() {
      return (
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">PrimeReact Widget</h1>
          <p>Using PrimeReact environment</p>
        </div>
      );
    }
  `;

  const compiled = await compileWidget(widget, {
    dependencies: primereactEnvironment.dependencies,
  });

  const html = renderWithEnvironment(compiled.code, {
    environment: 'primereact@10',
    theme: 'lara-light-indigo',
    title: 'PrimeReact Test',
  });

  const checks = [
    { test: html.includes('primereact'), name: 'PrimeReact CSS' },
    { test: html.includes('primeflex'), name: 'PrimeFlex CSS' },
    { test: html.includes('primeicons'), name: 'PrimeIcons' },
    { test: html.includes('importmap'), name: 'import map' },
  ];

  const failed = checks.filter((c) => !c.test);
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Missing: ${failed.map((c) => c.name).join(', ')}`,
    };
  }

  // Save for manual inspection
  await writeFile(join(DIST_DIR, 'test-primereact-env.html'), html);

  return { status: 'pass', message: 'PrimeReact environment works' };
}

// ============================================================================
// Multi-file with Environment Test
// ============================================================================

async function testMultiFileWithEnvironment(): Promise<{
  status: 'pass' | 'fail';
  message: string;
}> {
  const files: VirtualFileSystem = {
    '@/entry': {
      contents: `
import React from "react";
import { Button } from "@/components/button";

export default function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Multi-file with Environment</h1>
      <Button>Click Me</Button>
    </div>
  );
}
`,
    },
    '@/components/button': {
      contents: `
import React from "react";

export function Button({ children, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
    >
      {children}
    </button>
  );
}
`,
    },
  };

  const compiled = await compileMultiFileWidget(files, {
    entryPoint: '@/entry',
    dependencies: shadcnEnvironment.dependencies,
  });

  if (compiled.errors?.length && !compiled.code) {
    return {
      status: 'fail',
      message: `Compilation failed: ${compiled.errors.join(', ')}`,
    };
  }

  const html = renderWithEnvironment(compiled.code, {
    environment: 'shadcn@latest',
    theme: 'light',
    title: 'Multi-file ShadCN Widget',
  });

  // Verify bundling worked
  if (!html.includes('Multi-file with Environment')) {
    return { status: 'fail', message: 'Entry content not found' };
  }
  if (!html.includes('bg-primary')) {
    return { status: 'fail', message: 'Button component not bundled' };
  }

  // Save for manual inspection
  await writeFile(join(DIST_DIR, 'test-multifile-env.html'), html);

  return {
    status: 'pass',
    message: 'Multi-file compilation with environment works',
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n🧪 Patchwork Environment System Tests\n');
  console.log('='.repeat(60));

  await mkdir(DIST_DIR, { recursive: true });

  // Registry tests
  console.log('\n📋 Registry Tests:');
  await runTest('Environment registration', testEnvironmentRegistration);
  await runTest('Environment resolution', testEnvironmentResolution);

  // CSS tests
  console.log('\n🎨 CSS Tests:');
  await runTest('ShadCN CSS variables', testShadcnCss);
  await runTest('PrimeReact CSS', testPrimereactCss);

  // Head content tests
  console.log('\n📦 Head Content Tests:');
  await runTest('ShadCN head content', testShadcnHeadContent);
  await runTest('PrimeReact head content', testPrimereactHeadContent);

  // Renderer tests
  console.log('\n🖼️ Renderer Tests:');
  await runTest('Render with ShadCN environment', testRenderWithEnvironment);
  await runTest('Render with minimal environment', testRenderMinimal);

  // Sandbox tests
  console.log('\n📦 Sandbox Tests:');
  await runTest('Sandbox with environment', testSandboxWithEnvironment);

  // Full integration tests
  console.log('\n🔧 Integration Tests:');
  await runTest('PrimeReact widget', testPrimereactWidget);
  await runTest('Multi-file with environment', testMultiFileWithEnvironment);

  // Summary
  console.log('\n' + '='.repeat(60));
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results
      .filter((r) => r.status === 'fail')
      .forEach((r) => console.log(`   - ${r.name}: ${r.message}`));
    process.exit(1);
  }

  console.log('\n✅ All tests passed!');
  console.log(`\n📁 HTML files written to: ${DIST_DIR}`);
}

main().catch(console.error);
