/**
 * GitHub Copilot Proxy - HTTP Server
 *
 * OpenAI-compatible HTTP server that proxies requests through GitHub Copilot.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:http';
import { CopilotClient } from '../client.js';
import { isConfigured, getOAuthToken } from '../auth.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelsResponse,
} from '../types.js';

export interface ServerOptions {
  /** Port to listen on (default: 8080) */
  port?: number;
  /** Host to bind to (default: '127.0.0.1') */
  host?: string;
  /** Optional OAuth token (if not provided, uses stored token) */
  oauthToken?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface ProxyServer {
  /** The underlying HTTP server */
  server: Server;
  /** Start listening */
  start(): Promise<{ port: number; host: string }>;
  /** Stop the server */
  stop(): Promise<void>;
  /** Server address info */
  address(): { port: number; host: string } | null;
}

/**
 * Create an OpenAI-compatible HTTP proxy server
 */
export function createProxyServer(options: ServerOptions = {}): ProxyServer {
  const {
    port = 8080,
    host = '127.0.0.1',
    oauthToken,
    verbose = false,
  } = options;

  let client: CopilotClient | null = null;

  const log = verbose
    ? (...args: unknown[]) => console.log('[copilot-proxy]', ...args)
    : () => {};

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    log(`${req.method} ${url.pathname}`);

    try {
      // Initialize client lazily
      if (!client) {
        const token = oauthToken || (await getOAuthToken());
        if (!token) {
          sendError(
            res,
            401,
            'Not authenticated. Run "copilot-proxy connect" first.',
          );
          return;
        }
        client = new CopilotClient({ oauthToken: token });
      }

      // Route requests
      if (url.pathname === '/v1/models' || url.pathname === '/models') {
        await handleModels(client, res);
      } else if (
        url.pathname === '/v1/chat/completions' ||
        url.pathname === '/chat/completions'
      ) {
        await handleChatCompletions(client, req, res, log);
      } else if (url.pathname === '/health' || url.pathname === '/') {
        sendJson(res, 200, { status: 'ok', service: 'copilot-proxy' });
      } else {
        sendError(res, 404, `Unknown endpoint: ${url.pathname}`);
      }
    } catch (error) {
      log('Error:', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Internal server error',
      );
    }
  });

  return {
    server,

    async start(): Promise<{ port: number; host: string }> {
      // Check authentication before starting
      if (!oauthToken && !(await isConfigured())) {
        throw new Error(
          'Not authenticated. Run "copilot-proxy connect" to authenticate first.',
        );
      }

      return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, host, () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            resolve({ port: addr.port, host: addr.address });
          } else {
            resolve({ port, host });
          }
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    address(): { port: number; host: string } | null {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        return { port: addr.port, host: addr.address };
      }
      return null;
    },
  };
}

async function handleModels(
  client: CopilotClient,
  res: ServerResponse,
): Promise<void> {
  const models = await client.listModels();

  const response: ModelsResponse = {
    object: 'list',
    data: models.map((m) => ({
      id: m.id,
      object: 'model' as const,
      created: Math.floor(Date.now() / 1000),
      owned_by: 'github-copilot',
    })),
  };

  sendJson(res, 200, response);
}

async function handleChatCompletions(
  client: CopilotClient,
  req: IncomingMessage,
  res: ServerResponse,
  log: (...args: unknown[]) => void,
): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  const body = await readBody(req);
  const request = JSON.parse(body) as ChatCompletionRequest;

  log(
    `Chat completion: model=${request.model}, messages=${request.messages.length}`,
  );

  if (request.stream) {
    // Streaming response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      for await (const chunk of client.createChatCompletionStream(request)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (error) {
      log('Stream error:', error);
      // Try to send error if connection still open
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : 'Stream error',
            },
          })}\n\n`,
        );
      }
    } finally {
      res.end();
    }
  } else {
    // Non-streaming response
    const response = await client.createChatCompletion(request);
    sendJson(res, 200, response);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, {
    error: {
      message,
      type: 'error',
      code: status,
    },
  });
}
