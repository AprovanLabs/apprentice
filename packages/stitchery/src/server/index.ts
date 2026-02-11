import { createServer, type Server } from 'node:http';
import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { Tool } from 'ai';
import type { ServerConfig, McpServerConfig } from '../types.js';
import { handleChat, handleEdit, type RouteContext } from './routes.js';
import { handleLocalPackages } from './local-packages.js';

export interface StitcheryServer {
  server: Server;
  start(): Promise<{ port: number; host: string }>;
  stop(): Promise<void>;
}

async function initMcpTools(
  configs: McpServerConfig[],
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  for (const config of configs) {
    const client = await createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
      }),
    });
    Object.assign(tools, await client.tools());
  }

  return tools;
}

export async function createStitcheryServer(
  config: Partial<ServerConfig> = {},
): Promise<StitcheryServer> {
  const {
    port = 6434,
    host = '127.0.0.1',
    copilotProxyUrl = 'http://127.0.0.1:6433/v1',
    localPackages = {},
    mcpServers = [],
    verbose = false,
  } = config;

  const log = verbose
    ? (...args: unknown[]) => console.log('[stitchery]', ...args)
    : () => {};

  log('Initializing MCP tools...');
  const tools = await initMcpTools(mcpServers);
  log(
    `Loaded ${Object.keys(tools).length} tools from ${
      mcpServers.length
    } MCP servers`,
  );
  log('Local packages:', localPackages);

  const routeCtx: RouteContext = {
    copilotProxyUrl,
    tools,
    log,
  };

  const localPkgCtx = { localPackages, log };

  const server = createServer(async (req, res) => {
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

    const url = req.url || '/';
    log(`${req.method} ${url}`);

    try {
      if (handleLocalPackages(req, res, localPkgCtx)) {
        return;
      }

      if (url === '/api/chat' && req.method === 'POST') {
        await handleChat(req, res, routeCtx);
        return;
      }

      if (url === '/api/edit' && req.method === 'POST') {
        await handleEdit(req, res, routeCtx);
        return;
      }

      if (url === '/health' || url === '/') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', service: 'stitchery' }));
        return;
      }

      res.writeHead(404);
      res.end(`Not found: ${url}`);
    } catch (err) {
      log('Error:', err);
      res.writeHead(500);
      res.end(err instanceof Error ? err.message : 'Internal server error');
    }
  });

  return {
    server,

    async start() {
      return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, host, () => {
          log(`Server listening on http://${host}:${port}`);
          resolve({ port, host });
        });
      });
    },

    async stop() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
