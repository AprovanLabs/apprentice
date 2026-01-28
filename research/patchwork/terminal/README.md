# Patchwork Terminal Runtime Validation

> **Epic 12, Story 12.3:** Terminal Runtime Validation - Ink Components

This package validates that Ink (React for terminals) components can run directly and render correctly, including React hooks, service injection, and multiple instance handling.

## Quick Start

```bash
cd packages/patchwork/terminal
pnpm install
pnpm test          # Run basic compilation tests
pnpm test:hooks    # Run hooks validation
pnpm test:meta     # Run meta extraction tests
pnpm test:bundling # Run bundling strategy tests
pnpm test:instances # Run multiple instance tests
pnpm test:all      # Run full test suite
pnpm demo          # Run interactive demo
```

## Findings

### ✅ Ink Component Rendering

**Status:** Validated

- Ink components (Box, Text, Spinner) render correctly
- `useState`, `useEffect`, `useCallback`, `useMemo`, `useReducer` hooks work
- `useInput` hook for keyboard input works
- TypeScript types are stripped during compilation

### ✅ Compilation Performance

**Status:** Target Met ✅

| Metric               | External (Option A) | Bundled (Option B) | Target |
| -------------------- | ------------------- | ------------------ | ------ |
| Counter (~20 lines)  | ~0.5ms              | ~4ms               | <100ms |
| DataList (~40 lines) | ~0.4ms              | ~4ms               | <100ms |
| Cold compile         | ~20ms               | ~10ms              | <100ms |

All compilations complete well under the 100ms target.

### ✅ Meta Extraction via AST

**Status:** Validated

Same approach as browser runtime:

```typescript
export const meta = {
  name: "Dashboard Widget",
  description: "A terminal dashboard",
  packages: {
    "ink-spinner": "latest",
    "ink-table": "^3.0.0",
  },
  services: ["dataService", "authService"],
};
```

Meta fields extracted:

- `name` - Widget display name
- `description` - Widget description
- `packages` - Additional npm dependencies
- `services` - Required service names

### ✅ Package Resolution Strategy

**Status:** Validated - Recommendation: Option A

| Strategy               | Compile Time | Output Size | Pros                      | Cons                       |
| ---------------------- | ------------ | ----------- | ------------------------- | -------------------------- |
| **Option A: External** | ~0.5ms       | ~800 bytes  | Fast, small, shared React | Requires ink/react in host |
| Option B: Bundled      | ~4ms         | ~1.4KB      | Self-contained            | Larger, version conflicts  |
| Option C: Dynamic      | N/A          | N/A         | None                      | Complex, no benefits       |

**Recommended: Option A (External Dependencies)**

- Mark `ink` and `react` as external
- Resolve from host's node_modules at runtime
- Fast compilation, small output
- Single React instance (no version conflicts)

Use Option B (full bundling) only for distributing standalone widgets.

### ⚠️ Multiple Instance Limitation

**Status:** Documented Limitation

Ink is designed for single-instance terminal UIs:

| Scenario               | Status       | Notes                         |
| ---------------------- | ------------ | ----------------------------- |
| Sequential renders     | ✅ Works     | Unmount before rendering next |
| Rerender same instance | ✅ Works     | Use `instance.rerender()`     |
| Concurrent instances   | ⚠️ Corrupted | Output overlaps/corrupts      |

**Recommendation:** Use a single Ink instance with a layout container that switches between widgets, or render widgets sequentially (unmount before next render).

### ✅ Service Injection

**Status:** Validated

Services are passed as props to widgets:

```typescript
export default function Widget({ services }: { services?: Services }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    services?.dataService?.getData().then(setData);
  }, [services]);

  return <Box>...</Box>;
}
```

### ✅ Hot Reload Approach

**Status:** Documented

For development hot reload:

1. Use `instance.rerender(newElement)` to update existing instance
2. Recompile widget source and re-evaluate
3. Create new React element with updated component
4. No need to unmount/remount

## Architecture

```
src/
├── types.ts           # Type definitions
├── meta.ts            # Meta extraction from source
├── compiler.ts        # esbuild compilation
├── runtime.ts         # Ink widget execution
├── sample-widgets.ts  # Test widget samples
├── index.ts           # Public exports
├── test-runtime.ts    # Basic compilation tests
├── test-hooks.ts      # Hooks validation tests
├── test-meta.ts       # Meta extraction tests
├── test-bundling.ts   # Bundling strategy tests
├── test-instances.tsx # Multiple instance tests
├── run-all-tests.ts   # Full test suite runner
└── demo.tsx           # Interactive demo
```

## API Reference

### `compileWidget(source, options)`

Compiles TSX widget to ESM with external dependencies.

```typescript
import { compileWidget } from "./compiler.js";

const result = await compileWidget(widgetSource, {
  cacheDir: "./.cache",
  external: ["additional-package"],
  minify: false,
});

// result: { code, hash, compilationTimeMs, fromCache, meta, errors }
```

### `bundleWidget(source, options)`

Bundles widget with all dependencies into single ESM file.

```typescript
import { bundleWidget } from "./compiler.js";

const result = await bundleWidget(widgetSource, {
  outDir: "./.patchwork-temp",
  minify: true,
  sourcemap: false,
});
```

### `runWidget(source, options)`

Compiles and runs a widget in the terminal.

```typescript
import { runWidget, registerService } from "./runtime.js";

registerService("dataService", {
  getData: async () => [{ id: 1, name: "Item" }],
});

const instance = await runWidget(widgetSource);
await instance.waitUntilExit();
```

### `extractMeta(source)`

Extracts widget metadata from source.

```typescript
import { extractMeta } from "./meta.js";

const meta = extractMeta(widgetSource);
// { name, description, packages, services }
```

## Key Differences from Browser Runtime

| Aspect             | Browser          | Terminal              |
| ------------------ | ---------------- | --------------------- |
| Compilation target | ES2020           | Node 18               |
| Dependencies       | CDN (esm.sh)     | node_modules          |
| Isolation          | iframe sandbox   | None (same process)   |
| Styling            | Tailwind/CSS     | Ink Box/Text          |
| Multiple widgets   | Multiple iframes | Single Ink instance   |
| Service calls      | postMessage      | Direct function calls |

## Phase 1 Recommendations

Based on validation findings:

1. **Use external dependency strategy** - Mark ink/react as external
2. **Single Ink instance** - Use layout container for multiple widgets
3. **Meta extraction** - Same AST approach as browser
4. **Service injection** - Pass services as component props
5. **Hot reload** - Use `instance.rerender()` for updates
