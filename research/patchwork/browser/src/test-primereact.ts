/**
 * PrimeReact Environment Tests
 *
 * Tests for PrimeReact widget compilation and rendering.
 * Run with: pnpm test:primereact
 */

// Import environments first
import './environments';

import {
  compileWidget,
  initializeCompiler,
  generateImportMap,
  type Dependencies,
} from './compiler';
import { renderWithEnvironment } from './html-renderer';
import { primereactEnvironment } from './environments';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Use the standardized PrimeReact dependencies from environment
const WIDGET_DEPENDENCIES: Dependencies = primereactEnvironment.dependencies;

// ============================================================================
// Sample PrimeReact Widgets
// ============================================================================

/**
 * Simple PrimeReact Button Demo
 * Uses PrimeFlex for layout and PrimeIcons
 */
const primeButtonDemo = `
import React from "react";

// Note: In browser, PrimeReact components would be imported from CDN
// For this test, we're validating the compilation and HTML generation

export default function ButtonDemo() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div className="surface-card p-4 border-round shadow-2">
      <h2 className="text-2xl font-bold mb-3 text-primary">PrimeReact Button Demo</h2>
      <p className="mb-3 text-color-secondary">Count: {count}</p>
      
      <div className="flex gap-2">
        <button 
          className="p-button p-component"
          onClick={() => setCount(c => c + 1)}
        >
          <span className="p-button-icon p-button-icon-left pi pi-plus"></span>
          <span className="p-button-label">Increment</span>
        </button>
        
        <button 
          className="p-button p-component p-button-outlined"
          onClick={() => setCount(0)}
        >
          <span className="p-button-icon p-button-icon-left pi pi-refresh"></span>
          <span className="p-button-label">Reset</span>
        </button>
      </div>
    </div>
  );
}
`;

/**
 * PrimeReact Card Component Demo
 * Shows card with header, content, and footer using PrimeFlex
 */
const primeCardDemo = `
import React from "react";

export default function CardDemo() {
  return (
    <div className="p-4">
      <div className="surface-card p-4 border-round shadow-2">
        <div className="flex align-items-center justify-content-between mb-3">
          <span className="text-xl font-medium text-900">Card Title</span>
          <span className="p-tag p-component p-tag-success">
            <span className="p-tag-value">Active</span>
          </span>
        </div>
        
        <div className="text-color-secondary mb-3">
          This is a PrimeReact-style card using PrimeFlex utilities for layout
          and styling. PrimeIcons provide the icon set.
        </div>
        
        <div className="flex gap-2">
          <button className="p-button p-component p-button-sm">
            <span className="pi pi-check mr-2"></span>
            <span>Confirm</span>
          </button>
          <button className="p-button p-component p-button-outlined p-button-sm">
            <span className="pi pi-times mr-2"></span>
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
`;

/**
 * PrimeReact Data Table Demo (simplified)
 * Shows a data list with PrimeFlex styling
 */
const primeDataListDemo = `
import React from "react";

const users = [
  { id: 1, name: "Alice Johnson", email: "alice@example.com", status: "Active" },
  { id: 2, name: "Bob Smith", email: "bob@example.com", status: "Pending" },
  { id: 3, name: "Carol White", email: "carol@example.com", status: "Active" },
  { id: 4, name: "David Brown", email: "david@example.com", status: "Inactive" },
];

function StatusBadge({ status }) {
  const severity = {
    Active: "success",
    Pending: "warning",
    Inactive: "danger",
  }[status] || "info";
  
  return (
    <span className={\`p-tag p-component p-tag-\${severity}\`}>
      <span className="p-tag-value">{status}</span>
    </span>
  );
}

export default function DataListDemo() {
  const [selected, setSelected] = React.useState(null);
  
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4 text-primary">
        <span className="pi pi-users mr-2"></span>
        User Directory
      </h2>
      
      <div className="surface-card border-round shadow-2 overflow-hidden">
        {/* Header */}
        <div className="surface-ground px-4 py-3 border-bottom-1 surface-border">
          <div className="grid">
            <div className="col-4 font-bold text-color-secondary">Name</div>
            <div className="col-4 font-bold text-color-secondary">Email</div>
            <div className="col-4 font-bold text-color-secondary">Status</div>
          </div>
        </div>
        
        {/* Data Rows */}
        {users.map(user => (
          <div 
            key={user.id}
            className={\`px-4 py-3 border-bottom-1 surface-border cursor-pointer hover:surface-hover \${selected === user.id ? 'surface-hover' : ''}\`}
            onClick={() => setSelected(user.id)}
          >
            <div className="grid align-items-center">
              <div className="col-4">
                <span className="font-medium text-900">{user.name}</span>
              </div>
              <div className="col-4">
                <span className="text-color-secondary">{user.email}</span>
              </div>
              <div className="col-4">
                <StatusBadge status={user.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {selected && (
        <div className="mt-3 p-3 surface-ground border-round">
          <span className="pi pi-info-circle mr-2 text-primary"></span>
          Selected user ID: {selected}
        </div>
      )}
    </div>
  );
}
`;

/**
 * PrimeReact Dashboard Widget
 * Combines multiple components into a dashboard layout
 */
const primeDashboardWidget = `
import React from "react";

function StatCard({ title, value, icon, trend, trendValue }) {
  const trendColor = trend === "up" ? "text-green-500" : "text-red-500";
  const trendIcon = trend === "up" ? "pi-arrow-up" : "pi-arrow-down";
  
  return (
    <div className="surface-card p-4 border-round shadow-2">
      <div className="flex justify-content-between mb-3">
        <div>
          <span className="block text-color-secondary font-medium mb-2">{title}</span>
          <div className="text-900 font-bold text-3xl">{value}</div>
        </div>
        <div className="flex align-items-center justify-content-center bg-primary border-round" 
             style={{ width: '2.5rem', height: '2.5rem' }}>
          <span className={\`pi \${icon} text-white text-xl\`}></span>
        </div>
      </div>
      <span className={\`\${trendColor} font-medium\`}>
        <span className={\`pi \${trendIcon} mr-1\`}></span>
        {trendValue}
      </span>
      <span className="text-color-secondary ml-2">since last week</span>
    </div>
  );
}

function ActivityItem({ icon, title, time, type }) {
  const iconColors = {
    success: "bg-green-500",
    warning: "bg-orange-500",
    info: "bg-blue-500",
    error: "bg-red-500",
  };
  
  return (
    <div className="flex align-items-start mb-3">
      <div className={\`flex align-items-center justify-content-center border-round mr-3 \${iconColors[type]}\`}
           style={{ width: '2rem', height: '2rem' }}>
        <span className={\`pi \${icon} text-white text-sm\`}></span>
      </div>
      <div className="flex-1">
        <div className="text-900 font-medium">{title}</div>
        <div className="text-color-secondary text-sm">{time}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="p-4 surface-ground min-h-screen">
      <h1 className="text-3xl font-bold text-900 mb-4">
        <span className="pi pi-chart-bar mr-3 text-primary"></span>
        Dashboard
      </h1>
      
      {/* Stats Grid */}
      <div className="grid mb-4">
        <div className="col-12 md:col-6 lg:col-3">
          <StatCard 
            title="Total Revenue" 
            value="$45,231" 
            icon="pi-dollar"
            trend="up"
            trendValue="+12.5%"
          />
        </div>
        <div className="col-12 md:col-6 lg:col-3">
          <StatCard 
            title="New Users" 
            value="1,234" 
            icon="pi-users"
            trend="up"
            trendValue="+8.2%"
          />
        </div>
        <div className="col-12 md:col-6 lg:col-3">
          <StatCard 
            title="Orders" 
            value="567" 
            icon="pi-shopping-cart"
            trend="down"
            trendValue="-3.1%"
          />
        </div>
        <div className="col-12 md:col-6 lg:col-3">
          <StatCard 
            title="Active Sessions" 
            value="89" 
            icon="pi-globe"
            trend="up"
            trendValue="+5.4%"
          />
        </div>
      </div>
      
      {/* Activity Section */}
      <div className="grid">
        <div className="col-12 lg:col-6">
          <div className="surface-card p-4 border-round shadow-2">
            <div className="flex align-items-center justify-content-between mb-4">
              <h2 className="text-xl font-bold text-900 m-0">Recent Activity</h2>
              <button className="p-button p-component p-button-text p-button-sm">
                <span className="pi pi-ellipsis-v"></span>
              </button>
            </div>
            
            <ActivityItem 
              icon="pi-check" 
              title="Order #1234 completed" 
              time="2 minutes ago"
              type="success"
            />
            <ActivityItem 
              icon="pi-user-plus" 
              title="New user registered" 
              time="15 minutes ago"
              type="info"
            />
            <ActivityItem 
              icon="pi-exclamation-triangle" 
              title="Low inventory alert" 
              time="1 hour ago"
              type="warning"
            />
            <ActivityItem 
              icon="pi-times" 
              title="Payment failed" 
              time="2 hours ago"
              type="error"
            />
          </div>
        </div>
        
        <div className="col-12 lg:col-6">
          <div className="surface-card p-4 border-round shadow-2 h-full">
            <h2 className="text-xl font-bold text-900 mb-4">Quick Actions</h2>
            
            <div className="grid">
              <div className="col-6">
                <button className="p-button p-component w-full mb-2 justify-content-center">
                  <span className="pi pi-plus mr-2"></span>
                  <span>New Order</span>
                </button>
              </div>
              <div className="col-6">
                <button className="p-button p-component p-button-outlined w-full mb-2 justify-content-center">
                  <span className="pi pi-download mr-2"></span>
                  <span>Export</span>
                </button>
              </div>
              <div className="col-6">
                <button className="p-button p-component p-button-success w-full mb-2 justify-content-center">
                  <span className="pi pi-send mr-2"></span>
                  <span>Send Report</span>
                </button>
              </div>
              <div className="col-6">
                <button className="p-button p-component p-button-help w-full mb-2 justify-content-center">
                  <span className="pi pi-cog mr-2"></span>
                  <span>Settings</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

// ============================================================================
// Test Runner
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  timeMs: number;
  outputBytes: number;
}

async function runPrimeReactTests() {
  console.log('🧪 Patchwork Browser Runtime - PrimeReact Component Tests\n');
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
      name: 'PrimeReact Button Demo',
      source: primeButtonDemo,
      description: 'Basic button with PrimeIcons and PrimeFlex',
    },
    {
      name: 'PrimeReact Card Demo',
      source: primeCardDemo,
      description: 'Card component with tags and actions',
    },
    {
      name: 'PrimeReact Data List',
      source: primeDataListDemo,
      description: 'Interactive data list with status badges',
    },
    {
      name: 'PrimeReact Dashboard',
      source: primeDashboardWidget,
      description: 'Full dashboard with stats, activity feed, and actions',
    },
  ];

  console.log('📊 PrimeReact Compilation Tests:\n');

  const results: TestResult[] = [];

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

  const outputDir = join(process.cwd(), 'dist');
  await mkdir(outputDir, { recursive: true });

  const dashboardResult = await compileWidget(primeDashboardWidget, {
    dependencies: WIDGET_DEPENDENCIES,
  });
  if (dashboardResult.code) {
    const html = renderWithEnvironment(dashboardResult.code, {
      environment: 'primereact@10',
      title: 'PrimeReact Dashboard Demo',
    });

    const htmlPath = join(outputDir, 'primereact-dashboard-demo.html');
    await writeFile(htmlPath, html, 'utf-8');
    console.log(`   ✅ Generated: ${htmlPath}`);
  }

  // Also generate the data list demo
  const dataListResult = await compileWidget(primeDataListDemo, {
    dependencies: WIDGET_DEPENDENCIES,
  });
  if (dataListResult.code) {
    const html = renderWithEnvironment(dataListResult.code, {
      environment: 'primereact@10',
      title: 'PrimeReact Data List Demo',
    });

    const htmlPath = join(outputDir, 'primereact-datalist-demo.html');
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

  console.log('\n✅ PrimeReact compilation tests complete!\n');
}

runPrimeReactTests().catch(console.error);
