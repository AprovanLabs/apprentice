# Patchwork Data Runtime Validation

> **Status:** ✅ Complete  
> **Date:** January 25, 2026

Validation of markdown and JSON formatters for data widgets in terminal output.

## Overview

Data widgets return structured data (JSON) or documentation (Markdown) that needs terminal-friendly formatting. This package validates formatters with syntax highlighting, truncation, and performance characteristics.

## Implementation

### Markdown Formatter

**Package:** `marked` + `marked-terminal`

```typescript
import { formatMarkdown } from "./markdown-formatter.js";

const output = formatMarkdown("# Hello\n\nThis is **bold** text.");
```

**Features:**

- Converts markdown to styled ANSI terminal output
- Configurable text width (default: 80 columns)
- Text reflow for proper wrapping
- Syntax highlighting for code blocks
- Table rendering
- List formatting with bullets
- Blockquote styling

**Performance:** < 1ms for typical widget output (< 5KB)

### JSON Formatter

**Package:** `chalk` (custom syntax highlighting)

```typescript
import { formatJson, formatJsonCompact } from "./json-formatter.js";

const data = { name: "Alice", age: 30, active: true };
const output = formatJson(data);
```

**Features:**

- Syntax highlighting with configurable colors:
  - Keys: cyan
  - Strings: green
  - Numbers: yellow
  - Booleans: magenta
  - Null: gray
  - Brackets: white
- Configurable indentation (default: 2 spaces)
- Compact mode for inline display

**Performance:** < 1ms for typical widget output (< 10KB)

### Truncation Strategy

**Module:** `truncation.ts`

```typescript
import { truncateOutput } from "./truncation.js";

const output = truncateOutput(largeString, {
  maxLength: 10240, // 10KB
  truncateSuffix: "\\n... (output truncated)",
});
```

**Strategy:**

- Default max length: 10KB (10,240 bytes)
- Truncates at `maxLength - suffix.length` to preserve suffix
- Applies after formatting to respect ANSI codes
- Size estimation utility for pre-check before formatting

**Rationale:**

- Terminal scrollback limits: Most terminals buffer 1K-10K lines
- Performance: Large outputs slow terminal rendering
- User experience: Truncated outputs remain readable with clear indicator

## Test Results

### Test: Markdown Rendering

```bash
pnpm test:markdown
```

**Validated:**

- ✅ Headers (h1-h6) render with bold/colors
- ✅ Bold/italic/code inline formatting
- ✅ Code blocks with syntax highlighting
- ✅ Lists (ordered/unordered)
- ✅ Tables with column alignment
- ✅ Blockquotes with prefix
- ✅ Links display as styled text
- ✅ Large document truncation (500+ KB → 10KB)

### Test: JSON Highlighting

```bash
pnpm test:json
```

**Validated:**

- ✅ Primitive types highlighted correctly
- ✅ Nested objects indented properly
- ✅ Arrays formatted with line breaks
- ✅ Null values styled distinctly
- ✅ Large objects truncated (50KB → 10KB)
- ✅ Compact mode for inline display

### Test: Truncation

```bash
pnpm test:truncation
```

**Results:**

- 100 bytes → 100 bytes (no truncation)
- 1,000 bytes → 1,000 bytes (no truncation)
- 10,000 bytes → 10,000 bytes (no truncation)
- 20,000 bytes → 10,217 bytes (truncated with suffix)

**Size estimation:**

- String: O(1) - returns string length
- Object: O(n) - serializes to JSON and measures

### Demo

```bash
pnpm demo
```

Runs combined markdown + JSON demo showing real-world widget output.

## Integration Approach

### Data Widget Return Values

Data widgets return raw data that Patchwork formats before display:

```typescript
// Widget returns structured data
export function getSystemStatus() {
  return {
    status: "operational",
    uptime: 0.999,
    services: ["api", "db", "cache"],
  };
}

// Patchwork formats before display
const data = widget.execute();
console.log(formatJson(data));
```

### Streaming Output

For long-running widgets that produce incremental output:

```typescript
// Widget yields results over time
export async function* streamLogs() {
  for await (const log of source) {
    yield formatJson(log, { indent: 0 }); // Compact for stream
  }
}

// Patchwork renders each chunk
for await (const chunk of widget.stream()) {
  process.stdout.write(chunk + "\\n");
}
```

**Streaming strategy:**

- Use compact formatting to reduce per-item overhead
- Apply truncation per-item (not cumulative)
- Consider rate limiting (max items/sec) for high-volume streams

### Widget Metadata

Widgets declare output type in metadata:

```typescript
export const meta = {
  name: "system-status",
  type: "data",
  outputFormat: "json", // 'json' | 'markdown' | 'text'
};
```

Patchwork uses `outputFormat` to select formatter automatically.

## Recommendations for Phase 1

### Required for Phase 1

1. **Markdown formatter** - Essential for documentation widgets
2. **JSON formatter** - Essential for data inspection widgets
3. **Truncation** - Required to prevent terminal overflow
4. **Output format detection** - Auto-select formatter from widget metadata

### Optional for Phase 1

1. **Custom color schemes** - Allow user-configurable syntax colors
2. **Streaming helpers** - Rate limiting and batching utilities
3. **Table formatter** - Dedicated CSV/table renderer (can use markdown tables initially)
4. **Error formatting** - Specialized formatter for stack traces

### Not Needed for Phase 1

1. **Binary data formatters** - Hex dump, base64 display
2. **Interactive data exploration** - JSON tree navigation
3. **Diff formatting** - Side-by-side comparisons
4. **Export formats** - HTML, PDF output

## Performance Characteristics

| Operation       | Size  | Time    | Memory |
| --------------- | ----- | ------- | ------ |
| Markdown render | 5KB   | < 1ms   | ~20KB  |
| JSON highlight  | 10KB  | < 1ms   | ~30KB  |
| Truncation      | 100KB | < 0.1ms | ~0KB   |
| Size estimation | 10KB  | < 0.5ms | ~20KB  |

**Notes:**

- All measurements on M1 MacBook Pro
- Times are P50 (median) values
- Memory is peak additional allocation

## Blockers & Limitations

### Identified

None - all formatters work as expected.

### Potential Issues

1. **ANSI code compatibility** - Some terminals may not support all color codes
   - **Mitigation:** Use widely-supported 16-color palette
2. **Unicode rendering** - Emoji and special chars may not render in all terminals
   - **Mitigation:** Provide fallback ASCII mode
3. **Performance with huge objects** - 1MB+ JSON may exceed truncation before formatting
   - **Mitigation:** Pre-check size with `estimateSize()` before formatting

## Dependencies

```json
{
  "marked": "^12.0.0", // Markdown parser
  "marked-terminal": "^7.1.0", // Terminal renderer for marked
  "chalk": "^5.3.0" // ANSI color styling
}
```

All dependencies are stable, widely-used, and actively maintained.

## Conclusion

✅ **Markdown and JSON formatters validated and production-ready.**

- Markdown renders correctly with all common syntax
- JSON highlighting provides clear visual structure
- Truncation prevents terminal overflow
- Performance well under 100ms target for typical widgets
- Integration approach defined for Phase 1

**Next steps:**

- Integrate formatters into Patchwork Core Runtime (E13)
- Implement auto-detection from widget metadata
- Add error formatting for debugging
