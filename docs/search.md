# Search

## CLI Version Filters

Search for assets at specific Git commits or across version history:

```bash
# Search for file at specific commit (short or full SHA)
apr search "README" -f version.ref=84b6747 --scope assets

# Search across all historical versions
apr search "config" -f version.history=true --scope assets

# Search content on specific branch (latest commit)
apr search "deploy" -f version.branch=main --scope assets

# Search content before a timestamp
apr search "schema" -f version.before=2026-01-01T00:00:00Z --scope assets
```

**Notes:**

- Version filters only apply to asset searches (`--scope assets`)
- Contexts must have Git version tracking enabled (auto-detected on `apr context add`)
- Short SHAs (7+ chars) work via prefix matching

## LEANN

```bash
brew update && brew upgrade uv
uv tool install leann-core --with leann
leann build apprentice --docs $(git ls-files) --no-recompute --embedding-model qwen3-coder:30b
leann -v search --top-k 3 apprentice "command like"
leann -v ask --top-k 3 --model qwen3-coder:30b apprentice "how is command like used"
```
