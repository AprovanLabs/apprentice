// MCP Tool Backend - Routes procedure calls to MCP server tools

import { spawn, type ChildProcess } from 'node:child_process';
import type { ServiceConfig, ServiceResult, ServiceBackend } from '../types.js';

interface McpConnection {
  process: ChildProcess;
  requestId: number;
  pending: Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >;
  tools: Map<string, { name: string; inputSchema?: Record<string, unknown> }>;
}

const connections = new Map<string, McpConnection>();

function sendRequest(
  conn: McpConnection,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const id = ++conn.requestId;
  return new Promise((resolve, reject) => {
    conn.pending.set(id, { resolve, reject });
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    conn.process.stdin?.write(msg);
  });
}

async function initializeConnection(server: string): Promise<McpConnection> {
  const existing = connections.get(server);
  if (existing) return existing;

  const proc = spawn(server, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const conn: McpConnection = {
    process: proc,
    requestId: 0,
    pending: new Map(),
    tools: new Map(),
  };

  let buffer = '';
  proc.stdout?.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && conn.pending.has(msg.id)) {
          const { resolve, reject } = conn.pending.get(msg.id)!;
          conn.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
          else resolve(msg.result);
        }
      } catch {
        // Ignore invalid JSON lines
      }
    }
  });

  proc.on('error', (err) => {
    for (const { reject } of conn.pending.values()) {
      reject(new Error(`MCP process error: ${err.message}`));
    }
    conn.pending.clear();
  });

  proc.on('exit', () => {
    connections.delete(server);
    for (const { reject } of conn.pending.values()) {
      reject(new Error('MCP process exited'));
    }
    conn.pending.clear();
  });

  await sendRequest(conn, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'patchwork', version: '1.0.0' },
  });

  const toolsResult = (await sendRequest(conn, 'tools/list', {})) as {
    tools: Array<{ name: string; inputSchema?: Record<string, unknown> }>;
  };
  for (const tool of toolsResult.tools || []) {
    conn.tools.set(tool.name, tool);
  }

  connections.set(server, conn);
  return conn;
}

export async function createMcpBackend(
  name: string,
  config: ServiceConfig,
): Promise<ServiceBackend> {
  const server = config.server;
  if (!server)
    throw new Error(`MCP backend '${name}' requires server configuration`);

  let conn: McpConnection | null = null;

  const getConnection = async () => {
    if (!conn) conn = await initializeConnection(server);
    return conn;
  };

  return {
    name,

    async call(procedure: string, args: unknown[]): Promise<ServiceResult> {
      const startTime = performance.now();

      try {
        const connection = await getConnection();

        if (!connection.tools.has(procedure)) {
          return {
            success: false,
            error: `Tool '${procedure}' not found on MCP server '${server}'`,
            durationMs: performance.now() - startTime,
          };
        }

        const toolArgs =
          args.length === 1 && typeof args[0] === 'object' ? args[0] : { args };
        const result = await sendRequest(connection, 'tools/call', {
          name: procedure,
          arguments: toolArgs,
        });

        return {
          success: true,
          data: result,
          durationMs: performance.now() - startTime,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - startTime,
        };
      }
    },

    async dispose() {
      if (conn) {
        conn.process.kill();
        connections.delete(server);
        conn = null;
      }
    },
  };
}
