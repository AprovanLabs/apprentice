/**
 * GitHub Copilot Proxy - Types
 */

export interface StoredToken {
  access_token: string;
  created_at: number;
}

export interface SessionToken {
  token: string;
  expiresAt: number;
}

export interface ConnectionStatus {
  connected: boolean;
  createdAt?: Date;
  storage?: 'keychain' | 'memory';
}

export interface DeviceFlowResult {
  userCode: string;
  verificationUrl: string;
  waitForAuth: () => Promise<void>;
}

export interface CopilotModel {
  id: string;
  name: string;
}

export interface OpenAICompatibleTransport {
  baseURL: string;
  fetch: typeof fetch;
  headers: Record<string, string>;
  chatCompletionsPath: string;
}

// OpenAI-compatible types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  functions?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
  function_call?: 'none' | 'auto' | { name: string };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?:
    | 'none'
    | 'auto'
    | { type: 'function'; function: { name: string } };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason:
    | 'stop'
    | 'length'
    | 'function_call'
    | 'tool_calls'
    | 'content_filter'
    | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason:
      | 'stop'
      | 'length'
      | 'function_call'
      | 'tool_calls'
      | 'content_filter'
      | null;
  }>;
}

export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}

export interface CopilotClientOptions {
  /** Optional OAuth token (if not provided, will use stored token) */
  oauthToken?: string;
  /** Custom base URL for Copilot API */
  baseURL?: string;
}
