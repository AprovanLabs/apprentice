/**
 * GitHub Copilot Proxy - Client
 *
 * SDK client for making OpenAI-compatible API calls through GitHub Copilot.
 */

import {
  getOAuthToken,
  getSessionToken,
  isConfigured,
  COPILOT_HEADERS,
} from './auth.js';
import type {
  CopilotClientOptions,
  CopilotModel,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  OpenAICompatibleTransport,
} from './types.js';

export const COPILOT_API_BASE = 'https://api.githubcopilot.com';
const MODELS_URL = 'https://api.githubcopilot.com/models';

/**
 * GitHub Copilot Client
 *
 * Provides OpenAI-compatible API access through GitHub Copilot.
 */
export class CopilotClient {
  private oauthToken?: string;
  private baseURL: string;

  constructor(options: CopilotClientOptions = {}) {
    this.oauthToken = options.oauthToken;
    this.baseURL = options.baseURL || COPILOT_API_BASE;
  }

  /**
   * Check if client is configured and ready to use
   */
  async isReady(): Promise<boolean> {
    if (this.oauthToken) return true;
    return isConfigured();
  }

  /**
   * Get the OAuth token (from constructor or storage)
   */
  private async getToken(): Promise<string> {
    if (this.oauthToken) return this.oauthToken;

    const token = await getOAuthToken();
    if (!token) {
      throw new Error(
        "GitHub Copilot not connected. Run 'copilot-proxy connect' to authenticate.",
      );
    }
    return token;
  }

  /**
   * Create authenticated fetch for API calls
   */
  private async createAuthenticatedFetch(): Promise<typeof fetch> {
    const oauthToken = await this.getToken();

    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const session = await getSessionToken(oauthToken);

      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${session.token}`);
      headers.set('Content-Type', 'application/json');
      headers.set('Accept', 'application/json');
      Object.entries(COPILOT_HEADERS).forEach(([k, v]) => headers.set(k, v));
      headers.set('Openai-Intent', 'conversation-panel');
      headers.set('Copilot-Integration-Id', 'vscode-chat');

      return fetch(input, { ...init, headers });
    };
  }

  /**
   * List available models
   */
  async listModels(): Promise<CopilotModel[]> {
    const authFetch = await this.createAuthenticatedFetch();

    const res = await authFetch(MODELS_URL);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list models: ${res.status} ${text}`);
    }

    const data = await res.json();
    const models = Array.isArray(data) ? data : data.data || [];

    return models.map((m: any) => ({
      id: m.id || m.name,
      name: m.name || m.id,
    }));
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const authFetch = await this.createAuthenticatedFetch();

    const res = await authFetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: false }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat completion failed: ${res.status} ${text}`);
    }

    return res.json();
  }

  /**
   * Create a streaming chat completion
   */
  async *createChatCompletionStream(
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionChunk> {
    const authFetch = await this.createAuthenticatedFetch();

    const res = await authFetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat completion failed: ${res.status} ${text}`);
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            yield json as ChatCompletionChunk;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get an OpenAI-compatible transport for use with other libraries
   */
  async getTransport(): Promise<OpenAICompatibleTransport> {
    const authFetch = await this.createAuthenticatedFetch();

    return {
      baseURL: this.baseURL,
      fetch: authFetch,
      headers: {},
      chatCompletionsPath: '/chat/completions',
    };
  }
}

/**
 * Create a fetch wrapper with automatic auth
 */
export function createFetch(oauthToken: string): typeof fetch {
  return async (input, init) => {
    const session = await getSessionToken(oauthToken);

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${session.token}`);
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    Object.entries(COPILOT_HEADERS).forEach(([k, v]) => headers.set(k, v));
    headers.set('Openai-Intent', 'conversation-panel');
    headers.set('Copilot-Integration-Id', 'vscode-chat');

    return fetch(input, { ...init, headers });
  };
}

/**
 * Get OpenAI-compatible transport (standalone function for backward compatibility)
 */
export async function getOpenAICompatibleTransport(
  oauthToken?: string,
): Promise<OpenAICompatibleTransport> {
  const token = oauthToken || (await getOAuthToken());
  if (!token) {
    throw new Error(
      "GitHub Copilot not connected. Run 'copilot-proxy connect' to authenticate.",
    );
  }

  return {
    baseURL: COPILOT_API_BASE,
    fetch: createFetch(token),
    headers: {},
    chatCompletionsPath: '/chat/completions',
  };
}
