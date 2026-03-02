---
name: GitHub Sync
description: Sync GitHub issues and PRs with local state
triggers:
  - eventFilter:
      types: ["sync.request"]
      subjects: ["github:*"]
tools:
  - hardcopy.fetch
  - hardcopy.push
---

When a sync request arrives for a GitHub URI:
1. Parse the URI to extract owner/repo/number
2. Fetch from GitHub API
3. Convert to Entity format
4. Return for merge with local state

## URI Format

GitHub URIs follow the pattern: `github:{owner}/{repo}#{number}`

Examples:
- `github:facebook/react#1234` - Issue or PR #1234 in facebook/react
- `github:microsoft/vscode#5678` - Issue or PR #5678 in microsoft/vscode

## Entity Schema

```yaml
uri: github:{owner}/{repo}#{number}
type: github.Issue | github.PullRequest
attrs:
  title: string
  body: string
  state: open | closed
  author: string
  assignees: string[]
  labels: string[]
  created_at: ISO8601
  updated_at: ISO8601
  comments_count: number
```

## Sync Behavior

- **Fetch**: GET /repos/{owner}/{repo}/issues/{number}
- **Push**: PATCH /repos/{owner}/{repo}/issues/{number}
- **Conflict**: Use `updated_at` for last-write-wins, or prompt user for manual merge
