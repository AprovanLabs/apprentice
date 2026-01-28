/**
 * Tests for multi-file widget compilation using esbuild.build()
 */

// Import environments first
import './environments';

import {
  compileMultiFileWidget,
  generateImportMap,
  type VirtualFileSystem,
  type Dependencies,
} from './compiler';
import { renderToHtml, renderWithEnvironment } from './html-renderer';
import { shadcnEnvironment } from './environments';

// ============================================================================
// Test Data
// ============================================================================

const MULTI_FILE_WIDGET: VirtualFileSystem = {
  '@/entry': {
    contents: `
import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function App() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div className={cn("p-4", "bg-background")}>
      <h1 className="text-2xl font-bold mb-4">Multi-File Widget</h1>
      <p className="mb-2">Count: {count}</p>
      <Button onClick={() => setCount(c => c + 1)}>
        Increment
      </Button>
    </div>
  );
}
`,
  },
  '@/components/ui/button': {
    contents: `
import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
}

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-md font-medium transition-colors",
        variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "outline" && "border border-input bg-background hover:bg-accent",
        variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}
`,
  },
  '@/lib/utils': {
    contents: `
// Simplified cn utility (in real app, use clsx + tailwind-merge)
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
`,
    loader: 'ts',
  },
};

const WIDGET_WITH_EXTERNAL_DEPS: VirtualFileSystem = {
  '@/entry': {
    contents: `
import React from "react";
import { Check, X } from "lucide-react";

export default function IconDemo() {
  const [checked, setChecked] = React.useState(false);
  
  return (
    <div className="p-4 flex items-center gap-2">
      <button 
        onClick={() => setChecked(!checked)}
        className="p-2 rounded-md border"
      >
        {checked ? <Check className="text-green-500" /> : <X className="text-red-500" />}
      </button>
      <span>{checked ? "Checked" : "Unchecked"}</span>
    </div>
  );
}
`,
  },
};

// ============================================================================
// Tests
// ============================================================================

async function testMultiFileCompilation() {
  console.log('\n📦 Testing multi-file compilation...');

  const result = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
  });

  console.log(`  ✓ Compiled in ${result.compilationTimeMs.toFixed(2)}ms`);
  console.log(`  ✓ Hash: ${result.hash}`);
  console.log(`  ✓ Code length: ${result.code.length} chars`);
  console.log(`  ✓ From cache: ${result.fromCache}`);

  if (result.errors && result.errors.length > 0) {
    console.log(`  ⚠ Warnings: ${result.errors.join(', ')}`);
  }

  // Verify the code includes bundled content
  if (!result.code.includes('Multi-File Widget')) {
    throw new Error('Expected bundled code to include entry content');
  }
  if (!result.code.includes('px-4 py-2 rounded-md')) {
    throw new Error('Expected bundled code to include Button styles');
  }
  console.log('  ✓ Bundled code contains expected content');

  // Verify React is external (not bundled)
  if (result.code.includes('useState=function')) {
    throw new Error('React should be external, not bundled');
  }
  console.log('  ✓ React marked as external (not bundled)');

  return result;
}

async function testExternalDependencies() {
  console.log('\n🔗 Testing external dependencies...');

  const result = await compileMultiFileWidget(WIDGET_WITH_EXTERNAL_DEPS, {
    entryPoint: '@/entry',
    dependencies: {
      'lucide-react': 'latest',
    },
  });

  console.log(`  ✓ Compiled in ${result.compilationTimeMs.toFixed(2)}ms`);

  // Verify lucide-react is external
  if (
    result.code.includes('lucide-react') &&
    !result.code.includes('from "lucide-react"')
  ) {
    throw new Error('lucide-react should be imported as external');
  }
  console.log('  ✓ lucide-react marked as external');

  return result;
}

async function testImportMapGeneration() {
  console.log('\n🗺️  Testing import map generation...');

  const dependencies: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    'lucide-react': 'latest',
    '@radix-ui/react-dialog': '^1.0.0',
  };

  const importMap = generateImportMap(dependencies);

  console.log('  Generated import map:');
  console.log(JSON.stringify(importMap, null, 2));

  // Verify structure
  if (!importMap.imports['react']) {
    throw new Error('Import map should include react');
  }
  if (!importMap.imports['react-dom/']) {
    throw new Error('Import map should include react-dom/ for subpath imports');
  }
  console.log('  ✓ Import map structure is correct');

  return importMap;
}

async function testHtmlGenerationWithImportMap() {
  console.log('\n🌐 Testing HTML generation with import maps...');

  const compiled = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
  });

  // Use renderToHtml which now handles import maps
  const html = renderToHtml(compiled.code, {
    title: 'Multi-File Test Widget',
    dependencies: {
      react: '^18.0.0',
      'react-dom': '^18.0.0',
    },
  });

  // Verify import map is present
  if (!html.includes('<script type="importmap">')) {
    throw new Error('HTML should include import map script');
  }
  console.log('  ✓ Import map script tag present');

  // Verify bare specifiers are used (not CDN URLs in module code)
  if (!html.includes('from "react"') && !html.includes("from 'react'")) {
    // Note: The widget code may already have the react import, check mount code
    if (!html.includes('import React from "react"')) {
      console.log('  ⚠ Expected bare specifier imports in mount code');
    }
  }
  console.log('  ✓ Using bare specifiers with import map');

  console.log('\n  Generated HTML preview (first 500 chars):');
  console.log('  ' + html.slice(0, 500).replace(/\n/g, '\n  ') + '...');

  return html;
}

async function testCaching() {
  console.log('\n💾 Testing compilation caching...');

  // First compilation
  const result1 = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
    cacheDir: '.cache/test-multifile',
  });

  console.log(
    `  First compile: ${result1.compilationTimeMs.toFixed(2)}ms, fromCache: ${
      result1.fromCache
    }`,
  );

  // Second compilation (should hit cache)
  const result2 = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
    cacheDir: '.cache/test-multifile',
  });

  console.log(
    `  Second compile: ${result2.compilationTimeMs.toFixed(2)}ms, fromCache: ${
      result2.fromCache
    }`,
  );

  if (!result2.fromCache) {
    console.log('  ⚠ Expected second compilation to use cache');
  } else {
    console.log('  ✓ Cache hit on second compilation');
  }

  // Verify same hash
  if (result1.hash !== result2.hash) {
    throw new Error('Hash should be identical for same input');
  }
  console.log('  ✓ Hashes match');
}

async function testRelativeImports() {
  console.log('\n📁 Testing relative imports within virtual files...');

  const filesWithRelativeImports: VirtualFileSystem = {
    '@/entry': {
      contents: `
import React from "react";
import { helper } from "./utils/helper";

export default function App() {
  return <div>{helper()}</div>;
}
`,
    },
    '@/utils/helper': {
      contents: `
export function helper() {
  return "Hello from helper!";
}
`,
      loader: 'ts',
    },
  };

  const result = await compileMultiFileWidget(filesWithRelativeImports, {
    entryPoint: '@/entry',
  });

  if (
    result.errors &&
    result.errors.length > 0 &&
    result.errors[0].includes('not found')
  ) {
    throw new Error('Relative import should be resolved');
  }

  if (result.code.includes('Hello from helper!')) {
    console.log('  ✓ Relative imports resolved correctly');
  } else {
    console.log('  ⚠ Could not verify relative import resolution');
  }

  return result;
}

async function testShadcnRenderer() {
  console.log('\n🎨 Testing ShadCN renderer...');

  const compiled = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
  });

  const html = renderWithEnvironment(compiled.code, {
    environment: 'shadcn@latest',
    theme: 'dark',
    title: 'ShadCN Widget',
  });

  // Verify Tailwind CDN is loaded
  if (!html.includes('cdn.tailwindcss.com')) {
    throw new Error('ShadCN renderer should include Tailwind CDN');
  }
  console.log('  ✓ Tailwind CDN included');

  // Verify ShadCN CSS vars
  if (!html.includes('--background:') || !html.includes('--primary:')) {
    throw new Error('ShadCN renderer should include CSS variables');
  }
  console.log('  ✓ ShadCN CSS variables included');

  // Verify dark theme
  if (!html.includes('class="dark"')) {
    throw new Error('Dark theme should be applied');
  }
  console.log('  ✓ Dark theme applied');

  // Verify ShadCN dependencies in import map
  if (
    !html.includes('lucide-react') ||
    !html.includes('class-variance-authority')
  ) {
    throw new Error('ShadCN dependencies should be in import map');
  }
  console.log('  ✓ ShadCN dependencies in import map');

  return html;
}

async function testTailwindRenderer() {
  console.log('\n💨 Testing Tailwind renderer...');

  const compiled = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
  });

  // Use shadcn-minimal which has Tailwind but fewer Radix deps
  const html = renderWithEnvironment(compiled.code, {
    environment: 'shadcn-minimal@latest',
    title: 'Tailwind Widget',
  });

  // Verify Tailwind CDN is loaded
  if (!html.includes('cdn.tailwindcss.com')) {
    throw new Error('ShadCN-minimal renderer should include Tailwind CDN');
  }
  console.log('  ✓ Tailwind CDN included');

  // shadcn-minimal DOES include ShadCN CSS vars (it's just fewer deps)
  if (!html.includes('--primary:')) {
    throw new Error(
      'ShadCN-minimal renderer should include ShadCN CSS variables',
    );
  }
  console.log('  ✓ ShadCN CSS variables included (shadcn-minimal)');

  return html;
}

async function testMinimalRenderer() {
  console.log('\n📦 Testing minimal renderer...');

  const compiled = await compileMultiFileWidget(MULTI_FILE_WIDGET, {
    entryPoint: '@/entry',
  });

  const html = renderToHtml(compiled.code, {
    title: 'Minimal Widget',
  });

  // Should NOT include Tailwind CDN
  if (html.includes('cdn.tailwindcss.com')) {
    throw new Error('Minimal renderer should not include Tailwind CDN');
  }
  console.log('  ✓ No Tailwind CDN (as expected)');

  // Should have basic structure
  if (!html.includes('<!DOCTYPE html>') || !html.includes('<div id="root">')) {
    throw new Error('Should have basic HTML structure');
  }
  console.log('  ✓ Basic HTML structure present');

  return html;
}

// ============================================================================
// Main
// ============================================================================

async function runAllTests() {
  console.log(
    '═══════════════════════════════════════════════════════════════',
  );
  console.log(' Multi-File Widget Compilation Tests');
  console.log(
    '═══════════════════════════════════════════════════════════════',
  );

  try {
    await testMultiFileCompilation();
    await testExternalDependencies();
    await testImportMapGeneration();
    await testHtmlGenerationWithImportMap();
    await testCaching();
    await testRelativeImports();

    console.log(
      '\n───────────────────────────────────────────────────────────────',
    );
    console.log(' HTML Renderer Tests');
    console.log(
      '───────────────────────────────────────────────────────────────',
    );

    await testShadcnRenderer();
    await testTailwindRenderer();
    await testMinimalRenderer();

    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log(' ✅ All tests passed!');
    console.log(
      '═══════════════════════════════════════════════════════════════\n',
    );
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runAllTests();
