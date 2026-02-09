# Component Editing

Edit rendered JSX components via inline diff-based modifications with a unified chat-like experience.

## Overview

The component editing system allows users to iteratively refine generated JSX components through natural language instructions. Instead of regenerating entire components, the LLM produces targeted search/replace diffs that are applied to the existing code. The edit experience matches the main chat interface, with progress indicators and markdown-formatted summaries.

## Usage

1. Generate a component via chat
2. Click the **pencil icon** on the rendered component
3. Component expands into **edit mode** modal with a chat-like interface
4. Type your desired changes using the full markdown editor
5. Progress notes stream in during LLM processing
6. Diffs are applied and the component re-renders
7. If compilation fails, the system auto-retries with the error context
8. Click **Done** to exit edit mode, showing an edit count indicator
9. Click **revert** (↩️) to reset to the original code

## Architecture

The edit system is modular and extractable to a separate package:

```
src/components/edit/
├── types.ts          # Core types (EditHistoryEntry, EditSessionState, CompileFn)
├── api.ts            # Streaming edit API client  
├── useEditSession.ts # State management hook with auto-retry
├── EditHistory.tsx   # Chat-style history display
├── EditModal.tsx     # Full-screen modal with pluggable preview
└── index.ts          # Barrel export

src/components/
└── JsxPreview.tsx    # JSX-specific integration using edit module
```

```
┌─────────────────────────────────────────────────────────┐
│                    JsxPreview                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ EditModal (full-screen)                          │    │
│  │  ┌─────────────────────────────────────────────┐│    │
│  │  │ Header: Pencil + status + Preview/Code toggle││    │
│  │  └─────────────────────────────────────────────┘│    │
│  │  ┌─────────────────────────────────────────────┐│    │
│  │  │ Preview/Code area (pluggable renderPreview) ││    │
│  │  └─────────────────────────────────────────────┘│    │
│  │  ┌─────────────────────────────────────────────┐│    │
│  │  │ EditHistory (chat-like)                     ││    │
│  │  │ - User prompts                              ││    │
│  │  │ - Markdown summaries                        ││    │
│  │  │ - Streaming progress notes                  ││    │
│  │  └─────────────────────────────────────────────┘│    │
│  │  ┌─────────────────────────────────────────────┐│    │
│  │  │ MarkdownEditor + Send Button                ││    │
│  │  └─────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Normal View: Code/Preview + Edit count indicator        │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/components/edit/types.ts` | Core types and interfaces |
| `src/components/edit/api.ts` | Streaming API client with progress callbacks |
| `src/components/edit/useEditSession.ts` | State hook with auto-retry on compile errors |
| `src/components/edit/EditHistory.tsx` | Chat-style history with markdown rendering |
| `src/components/edit/EditModal.tsx` | Reusable modal with pluggable preview renderer |
| `src/components/JsxPreview.tsx` | JSX compiler integration |
| `src/lib/diff.ts` | Parse diffs, progress notes, and extract summaries |
| `vite.config.ts` | `/api/edit` endpoint |

## Diff Format

The LLM generates progress notes before each diff block:

```
[note] Brief description of what this change does
<<<<<<< SEARCH
exact code to find
=======
replacement code
>>>>>>> REPLACE
```

Multiple diff blocks can be included, each with its own progress note.

## Core Types

```typescript
interface EditHistoryEntry {
  prompt: string;
  summary: string;
  isRetry?: boolean;
}

interface EditSessionState {
  code: string;
  originalCode: string;
  history: EditHistoryEntry[];
  isApplying: boolean;
  error: string | null;
  streamingNotes: string[];
}

type CompileFn = (code: string) => Promise<CompileResult>;

interface CompileResult {
  success: boolean;
  error?: string;
}
```

## Edit Modal Props

```typescript
interface EditModalProps {
  isOpen: boolean;
  onClose: (finalCode: string, editCount: number) => void;
  originalCode: string;
  compile?: CompileFn;           // Optional compile validation
  apiEndpoint?: string;          // Default: '/api/edit'
  renderPreview: (code: string) => ReactNode;  // Pluggable preview
  renderLoading?: () => ReactNode;
  renderError?: (error: string) => ReactNode;
  previewError?: string | null;
  previewLoading?: boolean;
}
```

## Visual Indicators

- **Full-screen modal** with dark backdrop in edit mode
- **"Applying edits..."** with spinner during API calls
- **Streaming progress notes** appear in real-time
- **MessageSquare icon** with edit count when not in edit mode
- **Revert button** (↩️) visible when code differs from original
- **Preview/Code toggle** to switch views

## API

### /api/edit Endpoint

```typescript
// Request
{ code: string; prompt: string }

// Response (streamed)
Plain text containing:
- [note] progress annotations before each diff
- SEARCH/REPLACE diff blocks
- Markdown summary at the end
```

### Edit API Client

```typescript
sendEditRequest(
  request: EditRequest,
  options?: {
    endpoint?: string;
    onProgress?: (note: string) => void;
  }
): Promise<EditResponse>
```

### Diff Utilities

```typescript
parseEditResponse(text: string): ParsedEditResponse
// Returns: { progressNotes: string[], diffs: DiffBlock[], summary: string }

applyDiffs(code: string, diffs: DiffBlock[]): { code: string; applied: number; failed: string[] }

hasDiffBlocks(text: string): boolean

extractSummary(text: string): string
// Returns markdown summary with diffs and notes removed
```

## Auto-Retry on Compile Errors

The `useEditSession` hook automatically retries when compilation fails:

1. Apply diffs to code
2. Run `compile(newCode)` if provided
3. If compilation fails, submit a new edit request with the error
4. Retry entries are marked with `isRetry: true` in history
