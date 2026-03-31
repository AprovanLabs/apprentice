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

/**
 * Returns true if the given provider is configured and ready to use.
 * For copilot, checks keychain/token storage.
 * Never throws — configuration errors surface as `false`.
 */
export async function isProviderConfigured(
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
 *
 * @throws {Error} If the copilot provider is selected but no OAuth token is available.
 *   Callers should catch this and surface a user-friendly message (e.g. "Run 'apr connect copilot'").
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

