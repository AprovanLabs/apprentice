# Providers

Apprentice routes LLM requests through OpenAI-compatible APIs.

Currently supported (built-in):

- **GitHub Copilot** via `https://api.githubcopilot.com`
- **Ollama** (local) via `http://localhost:11434`

## Configuration

### GitHub Copilot (Recommended)

Create a Fine-grained PAT with "Copilot Requests" permission:

1. Visit https://github.com/settings/personal-access-tokens/new
2. Under "Permissions," click "add permissions" and select "Copilot Requests"
3. Generate your token
4. Set as environment variable:

```bash
export GITHUB_TOKEN="github_pat_..."
```

Or use one of these environment variables (in order of precedence):

- `APPRENTICE_GITHUB_TOKEN`

### Ollama (Local)

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. Ollama runs on `http://localhost:11434` by default

### Model Selection

Set your preferred models:

```bash
export APPRENTICE_AI_FAST_MODEL=copilot/gpt-4o
export APPRENTICE_AI_SMART_MODEL=copilot/claude-sonnet-4
```

## Security Notes

- Treat tokens like passwords
- Store them securely and avoid logging them
- Fine-grained PATs are preferred over classic PATs
