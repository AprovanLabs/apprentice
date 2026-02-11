export interface ServerConfig {
  port: number;
  host: string;
  copilotProxyUrl: string;
  localPackages: Record<string, string>;
  mcpServers: McpServerConfig[];
  verbose: boolean;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

export interface ChatRequest {
  messages: UIMessage[];
  metadata?: {
    patchwork?: {
      compilers?: string[];
    };
  };
}

export interface EditRequest {
  code: string;
  prompt: string;
}

export interface UIMessage {
  role: string;
  content: string;
  parts?: Array<{ type: string; text: string }>;
}
