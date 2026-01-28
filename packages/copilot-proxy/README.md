# @apprentice/copilot-proxy

GitHub Copilot OpenAI-compatible proxy.

Use GitHub Copilot as a backend for OpenAI-compatible API calls, either directly via the SDK or through a local HTTP proxy server.

## Installation

```bash
pnpm add @apprentice/copilot-proxy
```

## Quick Start

### 1. Authenticate

```bash
npx copilot-proxy connect
```

This will initiate the GitHub device flow - you'll be given a code to enter at github.com.

### 2. Start the Server

```bash
npx copilot-proxy serve
```

The server will start on `http://127.0.0.1:8080` by default.

### 3. Use with OpenAI SDK

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8080/v1',
  apiKey: 'not-needed', // Required by SDK but not validated
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## CLI Commands

```bash
copilot-proxy connect      # Authenticate with GitHub
copilot-proxy disconnect   # Remove stored credentials
copilot-proxy status       # Check connection status
copilot-proxy models       # List available models
copilot-proxy serve        # Start HTTP proxy server
  --port, -p <port>        # Port (default: 8080)
  --host, -h <host>        # Host (default: 127.0.0.1)
  --verbose, -v            # Enable verbose logging
```

## SDK Usage

Use the SDK directly without starting an HTTP server:

```typescript
import { CopilotClient, connect, isConfigured } from '@apprentice/copilot-proxy';

// Check if authenticated
if (!await isConfigured()) {
  const { userCode, verificationUrl, waitForAuth } = await connect();
  console.log(`Go to ${verificationUrl} and enter: ${userCode}`);
  await waitForAuth();
}

// Create client
const client = new CopilotClient();

// List models
const models = await client.listModels();
console.log(models);

// Chat completion
const response = await client.createChatCompletion({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});

// Streaming
for await (const chunk of client.createChatCompletionStream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
})) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## Server Integration

Start the proxy server programmatically:

```typescript
import { createProxyServer } from '@apprentice/copilot-proxy/server';

const server = createProxyServer({
  port: 8080,
  host: '127.0.0.1',
  verbose: true,
});

await server.start();
console.log('Server running on', server.address());

// Later...
await server.stop();
```

## API Endpoints

The HTTP server implements OpenAI-compatible endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Create chat completion (streaming supported) |
| `/health` | GET | Health check |

## Transport Layer

For advanced use cases, get an OpenAI-compatible transport:

```typescript
import { getOpenAICompatibleTransport } from '@apprentice/copilot-proxy';

const transport = await getOpenAICompatibleTransport();

// Use with custom fetch calls
const response = await transport.fetch(
  `${transport.baseURL}${transport.chatCompletionsPath}`,
  {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello!' }],
    }),
  }
);
```

## License

MIT
