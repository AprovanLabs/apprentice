# apprentice

![Aprovan Labs](https://raw.githubusercontent.com/AprovanLabs/aprovan.com/main/docs/assets/header-labs.svg)
<br />
<a href="https://aprovan.com">
<img height="20" src="https://img.shields.io/badge/aprovan.com-ef4444?style=flat-square" alt="aprovan.com">
</a>
<a href="https://github.com/AprovanLabs">
<img height="20" src="https://img.shields.io/badge/-AprovanLabs-000000?style=flat-square&logo=GitHub&logoColor=white&link=https://github.com/AprovanLabs/" alt="Aprovan Labs GitHub" />
</a>
<a href="https://www.linkedin.com/company/aprovan">
<img height="20" src="https://img.shields.io/badge/-Aprovan-blue?style=flat-square&logo=Linkedin&logoColor=white&link=https://www.linkedin.com/company/aprovan)" alt="Aprovan LinkedIn">
</a>

Apprentice learns from you.

## Usage

### CLI Commands

```bash
# Search events and assets
apr search "kubernetes"                       # Search everything
apr search "git" --since 30m                  # Last 30 minutes only
apr search "build" -f shell.exit_code=0       # Filter by metadata
apr search "deploy" --scope events            # Search events only
apr search "deploy" --scope assets            # Search assets only
apr search "deploy" --json                    # JSON output
apr search "error" --md                       # Markdown output for LLMs

# Execute assets (scripts)
apr run <asset-id> [args...]    # Execute an asset
apr run scripts:deploy.sh       # Execute by context:path

# Manage contexts
apr context list                # List registered contexts
apr context add <path>          # Register a folder for indexing
apr context disable <id>        # Disable a context

# Indexer
apr index                       # Run indexer manually
apr index -c <context-id>       # Index specific context
```

### MCP Server

The Apprentice MCP server exposes your personal knowledge base to LLMs via the Model Context Protocol.

#### Setup with VS Code Copilot

Add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "apprentice": {
      "command": "node",
      "args": ["packages/apprentice/dist/mcp-server.js"],
    }
  }
}
```

#### Available MCP Tools

- `search` - Unified search across events and assets (query, scope, limit, filters, since)
- `get_asset` - Retrieve a specific asset by ID
- `run_asset` - Execute an executable asset (script)
- `context_list` - List registered context folders
- `context_add` - Register a folder for indexing
- `log_event` - Record a custom event

## Building

```bash
pnpm install
pnpm build
```

## Development

```bash
# Watch mode for development
pnpm dev

# Run indexer manually
pnpm indexer

# Start MCP server
pnpm mcp
```

## Planning Workflow

https://github.com/bmad-code-org/BMAD-METHOD

```bash
npx bmad-method@alpha install
```
