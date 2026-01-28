# Chat Interface Daemon

Enable users to interact with Apprentice coding agents through Discord (Slack and Teams coming soon).

## Quick Start

### 1. Set up Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name (e.g., "Apprentice Agent")
3. Go to "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - **MESSAGE CONTENT INTENT** (required)
   - SERVER MEMBERS INTENT (optional)
5. Click "Reset Token" and copy your bot token

### 2. Configure Apprentice

**Option A: Using .env file (Recommended)**

Create `~/.apprentice/.env`:

```bash
DISCORD_BOT_TOKEN=your-bot-token-here
```

**Option B: Using environment variables**

```bash
export DISCORD_BOT_TOKEN="your-bot-token-here"
```

Then create or edit `~/.apprentice/config.yaml`:

```yaml
# Chat import settings (existing)
chatImport:
  enabled: true
  intervalMs: 300000

# Daemon settings
daemon:
  discord:
    enabled: true
    token: ${DISCORD_BOT_TOKEN}
    triggers:
      - dm # Respond to direct messages
      - mention # Respond to @mentions
      # - prefix: "!agent"  # Optional: command prefix

  agent:
    type: cursor # Use "cursor" for Cursor agent, "local" for testing
    defaultRepository: owner/repo # Optional default
    timeoutMinutes: 30
    maxConcurrentSessions: 3

  progress:
    updateIntervalMs: 15000 # Update Discord widget every 15 seconds
    fileMonitorIntervalMs: 1000 # Check progress file every 1 second
    theme: dark # or "light"
    maxLogEntries: 50 # Maximum rolling log entries to keep
```

The `.env` file is automatically loaded from `~/.apprentice/.env` if it exists.

### 3. Invite Bot to Server

1. In Developer Portal, go to "OAuth2" > "URL Generator"
2. Select scopes:
   - `bot`
3. Select bot permissions:
   - Send Messages
   - Create Public Threads
   - Send Messages in Threads
   - Embed Links
   - Attach Files
   - Read Message History
4. Copy the generated URL and open in your browser
5. Select your Discord server and authorize

### 4. Start the Daemon

```bash
pnpm daemon
# or
apr daemon
```

You should see:

```
Agent daemon started, listening on: discord
Discord connected as YourBot#1234
```

### 5. Use the Agent

In Discord:

**Direct Message:**

```
Add dark mode toggle to settings page
```

**Channel Mention:**

```
@Apprentice Agent Fix the login bug
```

### Progress File Format

The progress file (`daemon/{session_id}.json`) contains:

```json
{
  "sessionId": "uuid-here",
  "stage": "implementing",
  "tasks": {
    "total": 5,
    "completed": 2,
    "current": "Running edit_file",
    "estimatedPercentComplete": 40
  },
  "progressLogs": [
    { "timestamp": "2025-01-11T10:00:00Z", "message": "Agent starting..." },
    { "timestamp": "2025-01-11T10:00:05Z", "message": "🔍 Analyzing codebase" },
    { "timestamp": "2025-01-11T10:00:10Z", "message": "🔧 Running edit_file" }
  ],
  "result": null,
  "updatedAt": "2025-01-11T10:00:10Z"
}
```

### Stages

The agent progresses through these stages:

- `starting` - Agent initializing
- `analyzing` - Reading and understanding code
- `planning` - Deciding what changes to make
- `implementing` - Making code changes
- `testing` - Running tests
- `reviewing` - Final review of changes
- `complete` - Task finished successfully
- `error` - Task failed
- `waiting` - Agent needs user input

## Agent Types

### Cursor Agent

To use the Cursor coding agent:

```yaml
agent:
  type: cursor
  default_repository: owner/repo
```

Requirements:

- Cursor CLI installed and available in PATH
- Repository cloned locally

## Features

### Git Worktree Isolation

By default, each agent task runs in an isolated git worktree:

- Branch name: `agent/<task-slug>-<session-id>`
- Worktree path: `/tmp/agent-worktree-<session-id>`
- Automatic cleanup on completion

This allows multiple agents to work simultaneously without conflicts.

### Session Management

- Max concurrent sessions per user (default: 3)
- Automatic timeout (default: 30 minutes)
- Session threads for organized conversation
- Progress tracking across daemon restarts (sessions in memory)

## Configuration Reference

```yaml
daemon:
  # Discord configuration
  discord:
    enabled: boolean # Enable Discord adapter
    token: string # Bot token (use ${ENV_VAR} for env vars)
    triggers: # When to respond
      - dm # Direct messages
      - mention # @mentions
      - prefix: "string" # Command prefix

  # Agent configuration
  agent:
    type: "cursor"
    default_repository: string # Fallback repository
    timeout_minutes: number # Task timeout
    max_concurrent_sessions: number # Per-user limit

  # Progress configuration
  progress:
    updateIntervalMs: number # Discord UI update frequency (default: 15000)
    fileMonitorIntervalMs: number # Progress file check frequency (default: 1000)
    theme: "dark" # Visual theme
    maxLogEntries: number # Max rolling log entries (default: 50)
```

## Architecture

```
User (Discord) ←→ Discord Gateway ←→ Agent Daemon
                                        │
                               ┌────────┴────────┐
                               │                 │
                          Session           Progress
                          Manager           Monitor
                               │                 │
                               │            Progress
                               │              File
                               │         (JSON on disk)
                               │                 │
                               └────────┬────────┘
                                        │
                                   Agent Runner
                                   (writes JSON)
                                        │
                                   Coding Agent
```
