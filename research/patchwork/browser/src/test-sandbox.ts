/**
 * Iframe Sandbox Tests - Story 12.2
 *
 * Tests sandbox isolation, service injection, and postMessage communication.
 * Run with: pnpm test:sandbox
 */

import { compileWidget, type Dependencies } from './compiler.js';
import {
  generateSandboxHtml,
  sandboxSecurityTests,
  type ServiceGlobal,
} from './iframe-sandbox.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DIST_DIR = join(import.meta.dirname, '..', 'dist');

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  timeMs?: number;
}

const results: TestResult[] = [];

function log(emoji: string, message: string): void {
  console.log(`${emoji} ${message}`);
}

async function runTest(
  name: string,
  fn: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }>,
): Promise<void> {
  const start = performance.now();
  try {
    const result = await fn();
    const timeMs = performance.now() - start;
    results.push({ name, ...result, timeMs });
    const emoji =
      result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
    log(emoji, `${name}: ${result.message} (${timeMs.toFixed(2)}ms)`);
  } catch (error) {
    const timeMs = performance.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'fail', message, timeMs });
    log('✗', `${name}: ${message} (${timeMs.toFixed(2)}ms)`);
  }
}

// =============================================================================
// Test: Sandbox HTML Generation
// =============================================================================

async function testSandboxHtmlGeneration(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  const simpleWidget = `
    import React from 'react';
    export default function HelloWidget() {
      return <div>Hello from sandbox!</div>;
    }
  `;

  const deps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  };

  const compiled = await compileWidget(simpleWidget, { dependencies: deps });
  if (compiled.errors?.length) {
    return {
      status: 'fail',
      message: `Compilation failed: ${compiled.errors.join(', ')}`,
    };
  }

  const html = generateSandboxHtml(compiled.code, {
    title: 'Test Widget',
    cssPreset: 'shadcn-dark',
    includeTailwind: true,
  });

  // Verify HTML structure
  const checks = [
    { test: html.includes('<!DOCTYPE html>'), name: 'DOCTYPE' },
    { test: html.includes('class="dark"'), name: 'dark theme class' },
    { test: html.includes('<title>Test Widget</title>'), name: 'title' },
    { test: html.includes('cdn.tailwindcss.com'), name: 'Tailwind CDN' },
    { test: html.includes('--background:'), name: 'ShadCN CSS vars' },
    {
      test: html.includes('window.__WIDGET_COMPONENT__'),
      name: 'component export',
    },
    { test: html.includes('createRoot'), name: 'React mount code' },
    { test: html.includes('postMessage'), name: 'postMessage communication' },
    { test: html.includes('window.onerror'), name: 'error handler' },
  ];

  const failed = checks.filter((c) => !c.test);
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Missing: ${failed.map((f) => f.name).join(', ')}`,
    };
  }

  return {
    status: 'pass',
    message: `All ${checks.length} HTML structure checks passed`,
  };
}

// =============================================================================
// Test: Service Proxy Generation
// =============================================================================

async function testServiceProxyGeneration(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  const services: ServiceGlobal[] = [
    {
      name: 'dataService',
      methods: {
        fetchData: async () => ({ items: [] }),
        saveData: async () => true,
      },
    },
    {
      name: 'configService',
      methods: {
        getConfig: async () => ({}),
      },
    },
  ];

  const simpleWidget = `
    export default function TestWidget() {
      return <div>Test</div>;
    }
  `;

  const compiled = await compileWidget(simpleWidget, {});
  const html = generateSandboxHtml(compiled.code, { services });

  // Verify service proxy code
  const checks = [
    { test: html.includes('window.__services'), name: 'services global' },
    { test: html.includes('__pendingCalls'), name: 'pending calls map' },
    { test: html.includes('service-response'), name: 'response listener' },
    { test: html.includes('"dataService"'), name: 'dataService config' },
    { test: html.includes('"configService"'), name: 'configService config' },
    { test: html.includes('"fetchData"'), name: 'fetchData method' },
    { test: html.includes('"saveData"'), name: 'saveData method' },
    { test: html.includes('"getConfig"'), name: 'getConfig method' },
  ];

  const failed = checks.filter((c) => !c.test);
  if (failed.length > 0) {
    return {
      status: 'fail',
      message: `Missing: ${failed.map((f) => f.name).join(', ')}`,
    };
  }

  return {
    status: 'pass',
    message: `All ${checks.length} service proxy checks passed`,
  };
}

// =============================================================================
// Test: Compile Security Test Widgets
// =============================================================================

async function testSecurityWidgetCompilation(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  const deps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  };

  const testNames = Object.keys(sandboxSecurityTests) as Array<
    keyof typeof sandboxSecurityTests
  >;
  const compiled: Record<string, string> = {};

  for (const testName of testNames) {
    const source = sandboxSecurityTests[testName];
    const result = await compileWidget(source, { dependencies: deps });

    if (
      result.errors?.length &&
      result.errors.some((e) => !e.includes('warning'))
    ) {
      return {
        status: 'fail',
        message: `Failed to compile ${testName}: ${result.errors.join(', ')}`,
      };
    }

    compiled[testName] = result.code;
  }

  return {
    status: 'pass',
    message: `All ${testNames.length} security test widgets compiled successfully`,
  };
}

// =============================================================================
// Test: Generate Security Test HTML Files
// =============================================================================

async function testGenerateSecurityTestFiles(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  await mkdir(DIST_DIR, { recursive: true });

  const deps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  };

  // Test service for service call test
  const testService: ServiceGlobal = {
    name: 'testService',
    methods: {
      getData: async (input: unknown) => ({
        received: input,
        timestamp: Date.now(),
      }),
    },
  };

  const testConfigs = [
    {
      name: 'parent-access',
      source: sandboxSecurityTests.parentAccessBlocked,
      services: [],
    },
    {
      name: 'top-access',
      source: sandboxSecurityTests.topAccessBlocked,
      services: [],
    },
    {
      name: 'fetch-blocked',
      source: sandboxSecurityTests.fetchBlocked,
      services: [],
    },
    {
      name: 'service-call',
      source: sandboxSecurityTests.serviceCallWorks,
      services: [testService],
    },
  ];

  const files: string[] = [];

  for (const config of testConfigs) {
    const compiled = await compileWidget(config.source, { dependencies: deps });
    const sandboxHtml = generateSandboxHtml(compiled.code, {
      title: `Security Test: ${config.name}`,
      services: config.services,
    });

    // Create a host page that contains the sandboxed iframe
    const hostHtml = generateHostPage(config.name, sandboxHtml);
    const filename = `sandbox-test-${config.name}.html`;
    await writeFile(join(DIST_DIR, filename), hostHtml);
    files.push(filename);
  }

  return {
    status: 'pass',
    message: `Generated ${files.length} test files: ${files.join(', ')}`,
  };
}

/**
 * Generates a host page that embeds the sandbox via srcdoc.
 * This simulates how the sandbox would be used in a real application.
 */
function generateHostPage(testName: string, sandboxHtml: string): string {
  // Escape the HTML for use in srcdoc attribute
  const escapedHtml = sandboxHtml
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sandbox Test: ${testName}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #4fc3f7; margin-bottom: 10px; }
    .description { color: #aaa; margin-bottom: 20px; }
    .sandbox-container {
      border: 2px solid #333;
      border-radius: 8px;
      overflow: hidden;
      background: #0f0f1a;
    }
    .sandbox-header {
      background: #252540;
      padding: 10px 15px;
      font-size: 12px;
      color: #888;
      border-bottom: 1px solid #333;
    }
    .sandbox-header code {
      background: #1a1a2e;
      padding: 2px 6px;
      border-radius: 4px;
      color: #4fc3f7;
    }
    iframe {
      width: 100%;
      height: 200px;
      border: none;
    }
    .messages {
      margin-top: 20px;
      padding: 15px;
      background: #0f0f1a;
      border-radius: 8px;
      font-family: monospace;
      font-size: 13px;
    }
    .messages h3 { margin-top: 0; color: #4fc3f7; }
    .message { padding: 5px 0; border-bottom: 1px solid #252540; }
    .message:last-child { border-bottom: none; }
    .message.ready { color: #4caf50; }
    .message.error { color: #f44336; }
    .message.service-call { color: #ff9800; }
    .explanation {
      margin-top: 20px;
      padding: 15px;
      background: #252540;
      border-radius: 8px;
      line-height: 1.6;
    }
    .explanation h3 { margin-top: 0; }
    .explanation code {
      background: #1a1a2e;
      padding: 2px 6px;
      border-radius: 4px;
      color: #4fc3f7;
    }
  </style>
</head>
<body>
  <h1>🔒 Sandbox Security Test: ${testName}</h1>
  <p class="description">Testing iframe sandbox isolation and postMessage communication</p>
  
  <div class="sandbox-container">
    <div class="sandbox-header">
      Sandbox Attributes: <code>sandbox="allow-scripts"</code>
    </div>
    <iframe 
      id="widget-frame" 
      sandbox="allow-scripts"
      srcdoc="${escapedHtml}"
    ></iframe>
  </div>

  <div class="messages">
    <h3>📬 PostMessage Log</h3>
    <div id="message-log"></div>
  </div>

  <div class="explanation">
    <h3>How This Test Works</h3>
    <p>
      The widget runs inside an iframe with <code>sandbox="allow-scripts"</code>.
      This sandbox attribute:
    </p>
    <ul>
      <li>✓ Allows JavaScript execution</li>
      <li>✗ Blocks access to parent/top window</li>
      <li>✗ Blocks same-origin access (no cookies, localStorage from parent)</li>
      <li>⚠ Network requests may work but are restricted</li>
    </ul>
    <p>
      The widget communicates with this host page via <code>postMessage</code>.
      Check the message log above to see the communication.
    </p>
  </div>

  <script>
    const log = document.getElementById('message-log');
    const iframe = document.getElementById('widget-frame');
    
    function addMessage(type, data) {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = new Date().toISOString().split('T')[1].slice(0, 12) + 
        ' [' + type + '] ' + JSON.stringify(data);
      log.appendChild(div);
    }

    // Listen for messages from the sandbox
    window.addEventListener('message', (event) => {
      if (event.source !== iframe.contentWindow) return;
      
      const { type, payload } = event.data;
      addMessage(type, payload || 'Widget mounted successfully');
      
      // Handle service calls
      if (type === 'service-call' && payload) {
        const { id, service, method, args } = payload;
        addMessage('service-response', { id, handling: service + '.' + method });
        
        // Simulate service response
        setTimeout(() => {
          iframe.contentWindow.postMessage({
            type: 'service-response',
            payload: { id, result: { received: args, timestamp: Date.now() } }
          }, '*');
        }, 100);
      }
    });

    addMessage('info', 'Host page loaded, waiting for sandbox...');
  </script>
</body>
</html>`;
}

// =============================================================================
// Test: Verify Sandbox Attribute Requirements
// =============================================================================

async function testSandboxAttributeDocumentation(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  // Document the sandbox attribute behavior
  const sandboxBehaviors = {
    'allow-scripts': {
      description: 'Allows JavaScript execution in the iframe',
      required: true,
      security: 'Widgets can run code but cannot access parent',
    },
    'allow-same-origin': {
      description: 'Would allow same-origin access (NOT USED)',
      required: false,
      security: 'We intentionally omit this to prevent DOM access',
    },
    'allow-forms': {
      description: 'Allows form submission',
      required: false,
      security: 'Forms submit to sandbox URL, not exploitable',
    },
    'allow-popups': {
      description: 'Allows window.open()',
      required: false,
      security: 'Could be added if widgets need to open links',
    },
  };

  const requiredOnly = Object.entries(sandboxBehaviors)
    .filter(([_, v]) => v.required)
    .map(([k]) => k);

  return {
    status: 'pass',
    message: `Sandbox config documented. Required attributes: ${requiredOnly.join(
      ', ',
    )}`,
  };
}

// =============================================================================
// Test: Light/Dark Theme Support
// =============================================================================

async function testThemeSupport(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  const widget = `
    export default function ThemeWidget() {
      return <div className="p-4 bg-background text-foreground">Themed content</div>;
    }
  `;

  const compiled = await compileWidget(widget, {});

  const lightHtml = generateSandboxHtml(compiled.code, {
    cssPreset: 'shadcn-light',
  });
  const darkHtml = generateSandboxHtml(compiled.code, {
    cssPreset: 'shadcn-dark',
  });

  const lightHasClass =
    lightHtml.includes('<html lang="en" class="">') ||
    lightHtml.includes('<html lang="en">');
  const darkHasClass = darkHtml.includes('<html lang="en" class="dark">');

  if (!lightHasClass) {
    return { status: 'fail', message: 'Light theme should have empty class' };
  }
  if (!darkHasClass) {
    return { status: 'fail', message: "Dark theme should have 'dark' class" };
  }

  return {
    status: 'pass',
    message: 'Both light and dark themes generate correct HTML classes',
  };
}

// =============================================================================
// Test: Custom CSS Injection
// =============================================================================

async function testCustomCssInjection(): Promise<{
  status: 'pass' | 'fail' | 'warn';
  message: string;
}> {
  const widget = `export default function W() { return <div>Test</div>; }`;
  const compiled = await compileWidget(widget, {});

  const customCss = `
    .custom-class { color: hotpink; }
    #special-id { font-size: 24px; }
  `;

  const html = generateSandboxHtml(compiled.code, { customCss });

  if (!html.includes('.custom-class')) {
    return { status: 'fail', message: 'Custom CSS class not included' };
  }
  if (!html.includes('#special-id')) {
    return { status: 'fail', message: 'Custom CSS ID not included' };
  }

  return {
    status: 'pass',
    message: 'Custom CSS properly injected into sandbox HTML',
  };
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function main(): Promise<void> {
  console.log('\n🔒 Patchwork Iframe Sandbox Tests - Story 12.2\n');
  console.log('='.repeat(60) + '\n');

  await runTest('Sandbox HTML Generation', testSandboxHtmlGeneration);
  await runTest('Service Proxy Generation', testServiceProxyGeneration);
  await runTest('Security Widget Compilation', testSecurityWidgetCompilation);
  await runTest('Generate Security Test Files', testGenerateSecurityTestFiles);
  await runTest(
    'Sandbox Attribute Documentation',
    testSandboxAttributeDocumentation,
  );
  await runTest('Theme Support', testThemeSupport);
  await runTest('Custom CSS Injection', testCustomCssInjection);

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`   ✓ Passed:   ${passed}`);
  console.log(`   ⚠ Warnings: ${warnings}`);
  console.log(`   ✗ Failed:   ${failed}`);
  console.log(`   Total:      ${results.length}`);

  console.log('\n📁 Generated Test Files:');
  console.log('   dist/sandbox-test-parent-access.html');
  console.log('   dist/sandbox-test-top-access.html');
  console.log('   dist/sandbox-test-fetch-blocked.html');
  console.log('   dist/sandbox-test-service-call.html');
  console.log(
    '\n   Open these files in a browser to manually verify sandbox behavior.\n',
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
