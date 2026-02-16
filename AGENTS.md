# Apprentice

MCP tools for searching, retrieving, executing, and logging content through the indexed knowledge base.

## When to Use

**Search first when:** user references prior commands/workflows, you need project-specific scripts/docs/patterns, troubleshooting errors, or user asks "how did I..."

## Available MCP Tools

### `search` - Unified Search

Search across events (command history) and assets (files, scripts, docs) with semantic matching.

```
query: string       # Keywords, command fragments, or natural language
limit?: number      # Max results (default: 20, max: 50)
scope?: string      # "events", "assets", or "both" (default: "both")
filters?: object    # Metadata filters with dot-notation (e.g., {"shell.exit_code": "0"})
since?: string      # ISO 8601 timestamp - filter to items after this time
related?: bool      # Include related context for event results (default: false)
strategy?: object   # Grouping strategy: { groupBy, orderBy?, direction? }
windowSeconds?: number  # Temporal window for fallback (default: 60)
relatedLimit?: number   # Max related events per result (default: 20)
```

**Version Filters** (for Git-tracked contexts):

```
filters: {
  "version.ref": "<sha>"      # Content at specific commit (short or full SHA)
  "version.branch": "<name>"  # Latest content on branch
  "version.before": "<iso>"   # Content before timestamp
  "version.history": "true"   # Search across all historical versions
}
```

**Example queries:**

- `"deploy production"` with `scope: "assets"` - Find deployment scripts
- `"git rebase"` with `scope: "events"` - Find git command history
- `"failed build"` with `filters: {"shell.exit_code": "1"}` - Find failed builds
- `"what was the command"` with `related: true, strategy: { groupBy: "chat.session_id" }` - Find command with chat context
- `"README"` with `filters: {"version.ref": "abc123"}` - Find file at specific commit
- `"config"` with `filters: {"version.history": "true"}` - Search across all historical versions

**Related Context:** When `related: true`, results include `context.events`, `context.assets`, and `strategyUsed`.

### `get_asset` - Retrieve Asset

```
id: string              # Asset ID (16-char hash from search results)
include_content?: bool  # Include file content (default: false)
```

Content over 50KB truncated; binary content excluded.

### `run_asset` - Execute Asset

```
id: string      # Asset ID from search results (16-char hash)
args?: string[] # Arguments to pass
```

Returns `stdout`, `stderr`, `exit_code`, `duration_ms`, `event_id`. Supports .sh/.bash/.zsh/.py/.js/.ts. 30s timeout.

### `context_list` - List Contexts

```
enabled_only?: bool  # Filter to enabled contexts only (default: true)
```

## Best Practices

1. **Search before assuming** - Check if there's existing context for the task
2. **Let events reveal intent** - Prior chat/command history often clarifies ambiguous requests better than file searches
3. **Narrow scope only with confidence** - Default `scope: "both"` catches cross-type context; premature narrowing misses insights
4. **Leverage filters** - Use `shell.exit_code`, `asset.extension`, etc. for precision
5. **Check asset content selectively** - Only include content when needed
6. **Log your actions** - Use `log_event` to record AI interactions

## Search Strategy

**Default to `scope: "both"` for ambiguous queries:**

Events capture _how users solved problems before_—this context is often more valuable than finding a file directly. When a query could have multiple interpretations (e.g., "version" could mean package.json OR a deployment check script), events reveal the user's actual intent from prior interactions.

**Only narrow scope when you have high confidence:**

- `scope: "assets"` — You know the exact filename/type (e.g., "deploy.sh script", "tsconfig.json")
- `scope: "events"` — You're specifically looking for command history or chat context

**Start with modest limits:**

- Use `limit: 10` as a reasonable default for most queries
- Use `limit: 5` only when you're confident in exact matches
- Use `limit: 15-20` for exploratory searches

**Make queries specific when possible:**

- Include type hints: "deploy script", "build command", "config file"
- Include context: project names, tool names, or known filename fragments
- But don't over-optimize prematurely—a broader query that surfaces intent is better than a narrow query that finds the wrong thing

## Metadata Conventions

Events and assets use namespaced metadata:

- `shell.*` - Shell command metadata (exit_code, duration_ms, cwd)
- `git.*` - Git metadata (branch, commit, remote)
- `ai.*` - AI interaction metadata (model, tokens, prompt)
- `asset.*` - Asset-specific metadata (extension, tags, description)
- `version.*` - Version filters for historical content (ref, branch, before, history)
