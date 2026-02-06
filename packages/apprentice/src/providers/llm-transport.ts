import type { AIProviderConfig } from '../ai/types';
import {
  createFetch as createCopilotFetch,
  getOAuthToken,
  isConfigured as isCopilotConfigured,
  COPILOT_API_BASE,
} from '@aprovan/copilot-proxy';

export interface OpenAICompatibleTransport {
  baseURL: string;
  fetch: typeof fetch;
  headers: Record<string, string>;
  chatCompletionsPath: string;
}

export function isProviderConfigured(
  provider: string,
  providerConfig: AIProviderConfig,
): Promise<boolean> {
  switch (provider.trim().toLowerCase()) {
    case 'ollama':
      return Promise.resolve(true);
    case 'copilot':
      // Use sync version for backward compatibility
      // Callers needing full keychain check should use isProviderConfiguredAsync
      return isCopilotConfigured();
    default:
      return Promise.resolve(!!providerConfig.apiKey);
  }
}

/**
 * Async version that checks keychain storage
 */
export async function isProviderConfiguredAsync(
  provider: string,
  providerConfig: AIProviderConfig,
): Promise<boolean> {
  switch (provider.trim().toLowerCase()) {
    case 'ollama':
      return true;
    case 'copilot':
      return isCopilotConfigured();
    default:
      return !!providerConfig.apiKey;
  }
}

export function getProviderConfigHint(provider: string): string {
  switch (provider.trim().toLowerCase()) {
    case 'ollama':
      return 'Start the Ollama local server to use it as a provider.';
    case 'copilot':
      return "Run 'apr connect copilot' to authenticate.";
    default:
      return 'Set the appropriate provider API key environment variable.';
  }
}

/**
 * Returns a transport for calling an OpenAI-compatible Chat Completions API.
 */
export async function getOpenAICompatibleTransport(
  provider: string,
  providerConfig: AIProviderConfig,
): Promise<OpenAICompatibleTransport> {
  if (provider === 'copilot') {
    const oauthToken = providerConfig.apiKey || (await getOAuthToken());
    if (!oauthToken) {
      throw new Error(
        "GitHub Copilot not connected. Run 'apr connect copilot'.",
      );
    }

    return {
      baseURL: providerConfig.baseURL || COPILOT_API_BASE,
      fetch: createCopilotFetch(oauthToken),
      headers: {},
      chatCompletionsPath: '/chat/completions',
    };
  }

  // Default: plain fetch + optional Bearer auth
  return {
    baseURL: providerConfig.baseURL || '',
    fetch,
    headers: providerConfig.apiKey
      ? {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          ...(providerConfig.headers || {}),
        }
      : { ...(providerConfig.headers || {}) },
    chatCompletionsPath: '/chat/completions',
  };
}

/**
 * Async version that supports keychain storage for copilot
 */
export async function getOpenAICompatibleTransportAsync(
  provider: string,
  providerConfig: AIProviderConfig,
): Promise<OpenAICompatibleTransport> {
  if (provider === 'copilot') {
    const oauthToken = providerConfig.apiKey || (await getOAuthToken());
    if (!oauthToken) {
      throw new Error(
        "GitHub Copilot not connected. Run 'apr connect copilot'.",
      );
    }

    return {
      baseURL: providerConfig.baseURL || COPILOT_API_BASE,
      fetch: createCopilotFetch(oauthToken),
      headers: {},
      chatCompletionsPath: '/chat/completions',
    };
  }

  // Default: plain fetch + optional Bearer auth
  return {
    baseURL: providerConfig.baseURL || '',
    fetch,
    headers: providerConfig.apiKey
      ? {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          ...(providerConfig.headers || {}),
        }
      : { ...(providerConfig.headers || {}) },
    chatCompletionsPath: '/chat/completions',
  };
}
