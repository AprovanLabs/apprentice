# Patchwork Browser Runtime Validation

> **Epic 12, Story 12.1 & 12.2:** Browser Runtime Validation - esbuild Compilation & Iframe Sandbox

This package validates that esbuild-wasm can compile React JSX/TSX with hooks for the Patchwork browser widget runtime, including **Tailwind CSS** and **ShadCN components**.

## Quick Start

```bash
cd packages/patchwork/browser
pnpm install
pnpm test         # Run compilation tests
pnpm test:shadcn  # Run ShadCN component tests
pnpm test:sandbox # Run iframe sandbox tests
pnpm test:env     # Run environment system tests
pnpm benchmark    # Run performance benchmarks
pnpm test:all     # Run full test suite
pnpm demo:service # Generate interactive service demo
```

## Environment System

The Patchwork browser runtime uses an **environment system** for pre-configured styling and dependencies. Environments encapsulate:

- **Dependencies** - NPM packages resolved via CDN
- **CSS** - Variables, resets, and theme-specific styles
- **CDN imports** - Scripts and stylesheets from CDNs
- **Themes** - Light/dark/system theme variants

### Built-in Environments

| Environment ID          | Description                                 |
| ----------------------- | ------------------------------------------- |
| `shadcn@latest`         | Full ShadCN/UI with Radix, Tailwind, Lucide |
| `shadcn-minimal@latest` | Minimal ShadCN (fewer Radix deps)           |
| `primereact@10`         | PrimeReact with PrimeFlex and PrimeIcons    |
| `primereact-minimal@10` | Minimal PrimeReact                          |
| `minimal@latest`        | React with minimal CSS reset                |
| `bare@latest`           | React with no CSS                           |

### Usage

```typescript
// Import environments (auto-registers them)
import "./environments";

import { compileWidget } from "./compiler";
import { renderWithEnvironment } from "./html-renderer";
import { shadcnEnvironment } from "./environments";

// Compile with environment dependencies
const result = await compileWidget(widgetSource, {
  dependencies: shadcnEnvironment.dependencies,
});

// Render with environment (includes CSS, CDN scripts, theme)
const html = renderWithEnvironment(result.code, {
  environment: "shadcn@latest",
  theme: "dark",
  title: "My Widget",
});
```

### Sandboxed Execution with Environments

```typescript
import { generateSandboxHtml, createSandbox } from "./iframe-sandbox";

// Generate sandbox HTML using an environment
const html = generateSandboxHtml(compiledCode, {
  environment: "shadcn@latest",
  theme: "dark",
  services: [
    {
      name: "dataService",
      methods: { fetchItems: async () => [...] },
    },
  ],
});

// Or create a sandbox controller (for browser environments)
const sandbox = createSandbox(compiledCode, containerElement, {
  environment: "primereact@10",
  theme: "lara-light-indigo",
});
await sandbox.ready;
```

### Custom Environments

You can register custom environments:

```typescript
import { environmentRegistry, type Environment } from "./environments";

const myEnvironment: Environment = {
  id: "my-env@1.0",
  name: "My Custom Environment",
  description: "A custom environment for my project",
  version: "1.0.0",
  dependencies: {
    react: "^18.0.0",
    "react-dom": "^18.0.0",
    "my-ui-lib": "latest",
  },
  baseCss: {
    content: `:root { --primary: blue; }`,
    description: "Custom CSS variables",
  },
  themes: [{ name: "default", htmlClass: "", bodyClass: "" }],
  defaultTheme: "default",
  cdnImports: [
    { type: "stylesheet", url: "https://cdn.example.com/styles.css" },
  ],
};

environmentRegistry.register(myEnvironment);
```

## Compiler API

The compiler is **environment-agnostic** - it only handles JS/TS compilation:

```typescript
import {
  compileWidget,
  compileMultiFileWidget,
  type Dependencies,
} from "./compiler";

// Single file compilation
const result = await compileWidget(tsxSource, {
  dependencies: { react: "^18.0.0", "lucide-react": "latest" },
});

// Multi-file compilation (virtual file system)
const multiResult = await compileMultiFileWidget(
  {
    "@/entry": {
      contents: `import { Button } from "@/components/button"; ...`,
    },
    "@/components/button": { contents: `export function Button() { ... }` },
  },
  {
    entryPoint: "@/entry",
    dependencies: { react: "^18.0.0" },
  },
);
```

### Version Resolution

| Version Spec | CDN Version | Example   |
| ------------ | ----------- | --------- |
| `^18.0.0`    | Major only  | `@18`     |
| `~18.2.0`    | Major.minor | `@18.2`   |
| `18.2.3`     | Exact       | `@18.2.3` |
| `latest`     | No version  | (latest)  |
| `*`          | No version  | (latest)  |

## Findings

### ✅ esbuild-wasm Compilation

**Status:** Validated

- esbuild-wasm successfully compiles React components with `useState`, `useEffect`, `useCallback`, `useMemo`, and `useReducer` hooks
- JSX automatic runtime works correctly with `jsxImportSource` configuration
- TypeScript types are stripped during compilation (no type checking)

### ✅ ShadCN Components + Tailwind CSS

**Status:** Validated ✅

ShadCN-style components compile and run successfully in the browser with:

| Component | Dependencies                                   | Status |
| --------- | ---------------------------------------------- | ------ |
| Button    | class-variance-authority, clsx, tailwind-merge | ✅     |
| Card      | forwardRef, compound components                | ✅     |
| Badge     | CVA variants                                   | ✅     |
| Dashboard | Lucide icons, Cards, Badges, Buttons           | ✅     |

**Tailwind CSS:** Loaded via CDN (`cdn.tailwindcss.com`) with ShadCN CSS variables.

**Demo files generated:**

- `dist/button-demo.html` - Button variants showcase
- `dist/dashboard-demo.html` - Full dashboard with stats cards and activity feed

### ✅ Compilation Performance

**Status:** Target Met ✅

| Widget Size | Cold Compile | Warm Compile | Target |
| ----------- | ------------ | ------------ | ------ |
| ~28 lines   | ~20ms        | ~0.4ms       | <100ms |
| ~94 lines   | ~0.3ms       | ~0.3ms       | <100ms |
| ~156 lines  | ~0.7ms       | ~0.4ms       | <100ms |

**Benchmark Results (60 compilations):**

- **Average time:** 0.39ms
- **P50:** 0.34ms
- **P95:** 0.68ms
- **P99:** 0.74ms
- **Target Met:** 100% of compilations under 100ms

The first compilation has initialization overhead (~20ms) but all subsequent compilations complete in under 1ms.

### ✅ Disk Caching

**Status:** Validated ✅

- Content-based hashing (SHA256, 16-char) ensures cache correctness
- Cache hit speedup: **70x faster** than cold compilation
- Cache invalidation works correctly when source changes
- Hash stability verified (same source = same hash)

### ✅ Import Maps

**Status:** Validated

React dependencies are resolved from esm.sh CDN:

```json
{
  "imports": {
    "react": "https://esm.sh/react@18",
    "react/": "https://esm.sh/react@18/",
    "react-dom": "https://esm.sh/react-dom@18",
    "react-dom/": "https://esm.sh/react-dom@18/"
  }
}
```

### ⚠️ Error Handling

**Status:** Partial

| Error Type     | Detection     | Notes                               |
| -------------- | ------------- | ----------------------------------- |
| Syntax errors  | ✅ Caught     | Missing brackets, invalid JSX       |
| Type errors    | ❌ Not caught | esbuild strips types, doesn't check |
| Runtime errors | ❌ Not caught | Requires iframe execution           |

**Recommendation:** For type safety, run `tsc --noEmit` before compilation or use a separate type-checking step.

---

## Story 12.2: Iframe Sandbox Validation

> **Status:** ✅ Validated

### ✅ Sandbox Isolation

**Status:** Validated

The `sandbox="allow-scripts"` attribute provides strong isolation:

| Security Aspect              | Status | Notes                                         |
| ---------------------------- | ------ | --------------------------------------------- |
| Parent window access blocked | ✅     | `window.parent.document` throws SecurityError |
| Top window access blocked    | ✅     | `window.top.document` throws SecurityError    |
| Same-origin access blocked   | ✅     | No access to parent's cookies, localStorage   |
| JavaScript execution allowed | ✅     | Required for widget functionality             |
| Form submission blocked      | ✅     | `allow-forms` not included                    |
| Popups blocked               | ✅     | `allow-popups` not included                   |

**Sandbox Attribute Used:** `sandbox="allow-scripts"` (minimal permissions)

### ✅ srcdoc HTML Injection

**Status:** Validated

- Compiled widget HTML uses `srcdoc` attribute (inline HTML)
- No network request needed to load widget content
- HTML properly escaped for srcdoc attribute
- Works in both Electron and standard browsers

### ✅ Service Globals Injection

**Status:** Validated

Services are injected as global proxies before widget mounts:

```typescript
// Widget code accesses services via global
const data = await window.__services.dataService.fetchItems();
```

**Implementation:**

1. Host defines service methods in JavaScript
2. Service proxy code generated and injected into sandbox HTML
3. Proxy methods use `postMessage` to call host
4. Host executes actual service logic and responds via `postMessage`

### ✅ PostMessage Communication

**Status:** Validated

Bidirectional communication works correctly:

| Direction      | Message Type       | Payload                         |
| -------------- | ------------------ | ------------------------------- |
| Sandbox → Host | `ready`            | Widget mounted successfully     |
| Sandbox → Host | `error`            | Runtime error details           |
| Sandbox → Host | `service-call`     | `{id, service, method, args}`   |
| Host → Sandbox | `service-response` | `{id, result}` or `{id, error}` |

**Message Protocol:**

```javascript
// Widget calls service
window.__services.dataService.getData("arg");
// Internally sends: { type: 'service-call', payload: { id, service, method, args } }
// Host responds: { type: 'service-response', payload: { id, result } }
```

### ✅ Network Request Restrictions

**Status:** Validated with Caveats

| Request Type           | Behavior                              |
| ---------------------- | ------------------------------------- |
| CDN imports (esm.sh)   | ✅ Allowed (required for React, etc.) |
| Fetch to external APIs | ⚠️ May work depending on CORS         |
| Fetch to same-origin   | ❌ Blocked (no `allow-same-origin`)   |
| WebSocket connections  | ⚠️ External connections may work      |

**Note:** Without `allow-same-origin`, the sandbox cannot access the parent's cookies, localStorage, or make same-origin requests. However, cross-origin requests to external APIs may still work if CORS allows them.

### ✅ Tailwind CSS in Sandbox

**Status:** Validated

- Tailwind loaded via CDN (`cdn.tailwindcss.com`)
- ShadCN CSS variables included
- Light/dark theme support via `class="dark"` on `<html>`
- Custom CSS injection supported

### Demo Files Generated

Run `pnpm test:sandbox` to generate:

- `dist/sandbox-test-parent-access.html` - Tests parent window access blocking
- `dist/sandbox-test-top-access.html` - Tests top window access blocking
- `dist/sandbox-test-fetch-blocked.html` - Tests network request behavior
- `dist/sandbox-test-service-call.html` - Tests service proxy communication

Run `pnpm demo:service` to generate:

- `dist/service-demo.html` - Interactive dashboard with service communication log

### Key Learnings

1. **`sandbox="allow-scripts"` is sufficient** - Provides good isolation while allowing widget execution
2. **Service proxy pattern works well** - Clean API for widgets, secure communication via postMessage
3. **CDN dependencies load correctly** - No issues with esm.sh imports in sandbox
4. **Error handling needs work** - Should add timeout for service calls, better error messages
5. **No typing in sandbox** - Widgets need TypeScript declarations for `window.__services`

## Architecture

```
src/
├── compiler.ts            # Core esbuild wrapper + HTML generation
├── iframe-sandbox.ts      # Sandbox runtime, service injection, postMessage
├── sample-widgets.ts      # Basic React test widgets
├── shadcn-widgets.ts      # ShadCN component samples
├── test-compilation.ts    # Basic compilation tests
├── test-cache.ts          # Caching tests
├── test-error-handling.ts # Error handling tests
├── test-shadcn.ts         # ShadCN compilation tests
├── test-sandbox.ts        # Iframe sandbox tests
├── demo-service.ts        # Interactive service demo generator
├── benchmark.ts           # Performance benchmarks
└── run-all-tests.ts       # Full test suite runner

dist/
├── button-demo.html             # ShadCN Button variants demo
├── dashboard-demo.html          # Full dashboard demo
├── service-demo.html            # Interactive service communication demo
├── sandbox-test-*.html          # Security test files
```

## API Reference

### `compileWidget(source, options)`

Compiles a TSX/JSX widget source to ES modules.

```typescript
import { compileWidget, type Dependencies } from "./compiler.js";

const dependencies: Dependencies = {
  react: "^18.0.0",
  "lucide-react": "latest",
};

const result = await compileWidget(widgetSource, {
  cacheDir: ".cache", // Optional: disk cache directory
  cdnUrl: "https://esm.sh", // Optional: CDN base URL
  dependencies, // Optional: package.json-style deps
});

// Returns:
// {
//   code: string;              // Compiled JavaScript with CDN imports
//   hash: string;              // Content hash (16 chars)
//   compilationTimeMs: number;
//   fromCache: boolean;
//   errors?: string[];         // Compilation errors/warnings
// }
```

### `generateWidgetHtml(compiledJs, options)`

Generates a complete HTML file for rendering a compiled widget.

```typescript
import { compileWidget, generateWidgetHtml } from "./compiler.js";

const result = await compileWidget(widgetSource, { dependencies });
const html = generateWidgetHtml(result.code, {
  title: "My Widget",
  theme: "dark", // "light" | "dark" | "system"
  includeShadcnVars: true, // Include CSS variables
  tailwindConfig: { theme: { extend: {} } }, // Optional Tailwind config
  customCss: "", // Additional CSS
});

// HTML includes:
// - Tailwind CSS via CDN
// - ShadCN CSS variables (light/dark mode)
// - React 18 from esm.sh
// - Auto-mounting of default export component
```

### `generateImportMap(dependencies, cdnUrl)`

Generates an import map from dependencies.

```typescript
import { generateImportMap, type Dependencies } from "./compiler.js";

const dependencies: Dependencies = {
  react: "^18.0.0",
  "react-dom": "^18.0.0",
  "lucide-react": "latest",
};

const importMap = generateImportMap(dependencies);
// {
//   "imports": {
//     "react": "https://esm.sh/react@18",
//     "react/": "https://esm.sh/react@18/",
//     "lucide-react": "https://esm.sh/lucide-react",
//     ...
//   }
// }
```

### `generateSandboxHtml(compiledJs, options)`

Generates HTML for a sandboxed iframe widget with service injection.

```typescript
import { generateSandboxHtml, type ServiceGlobal } from "./iframe-sandbox.js";

const services: ServiceGlobal[] = [
  {
    name: "dataService",
    methods: {
      fetchItems: async () => items,
      addItem: async (name: string) => ({ id: 1, name }),
    },
  },
];

const html = generateSandboxHtml(compiledJs, {
  title: "My Widget",
  theme: "dark", // "light" | "dark"
  services, // Services to inject as window.__services
  customCss: "", // Additional CSS
});

// Use with iframe srcdoc:
// <iframe sandbox="allow-scripts" srcdoc="${html}"></iframe>
```

### `createSandbox(compiledJs, container, options)`

Creates a sandboxed iframe in a container element (browser-only).

```typescript
import { createSandbox, type SandboxOptions } from "./iframe-sandbox.js";

const options: SandboxOptions = {
  title: "My Widget",
  theme: "dark",
  services: [
    {
      name: "api",
      methods: {
        getData: async () => ({ items: [] }),
      },
    },
  ],
  onMessage: (msg) => console.log("Widget message:", msg),
  onError: (err) => console.error("Widget error:", err),
};

const sandbox = createSandbox(
  compiledJs,
  document.getElementById("container"),
  options,
);

// Wait for widget to mount
await sandbox.ready;

// Clean up when done
sandbox.destroy();
```

## Limitations Discovered

1. **esbuild-wasm requires browser environment** - Cannot run WASM version directly in Node.js
2. **Type checking not included** - esbuild performs transformation only
3. **First compilation overhead** - ~20ms initialization cost on first compile
4. **Source maps disabled** - Could be enabled if debugging is needed

### Node.js vs Browser

For **Node.js** environments (testing, build tools), use native `esbuild` package - it's faster and has no WASM overhead.

For **Browser** environments (iframe sandboxes), use `esbuild-wasm` with:

```typescript
await esbuild.initialize({
  wasmURL: "https://unpkg.com/esbuild-wasm@0.24.2/esbuild.wasm",
  worker: true,
});
```

The compiler module automatically selects the right implementation.

## Recommendations for Phase 1

1. **Pre-initialize esbuild** on application startup
2. **Implement compilation cache** using content hashes
3. **Add optional type checking** via tsc before compilation
4. **Consider source maps** for development mode
5. **Bundle WASM file** with the application to avoid network fetch

## Test Results

Run `pnpm test:all` to see complete test output including:

- Compilation validation for different widget complexities
- Cache hit/miss behavior verification
- Error handling for malformed source code
- Performance benchmarks with percentile statistics
