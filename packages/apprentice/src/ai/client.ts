// AI completion client

import { getAIConfig, parseModelId, getProviderConfig } from './config';
import type { CompletionOptions, CompletionResult } from './types';
import {
  getOpenAICompatibleTransport,
  getProviderConfigHint,
  isProviderConfigured,
} from '../providers/llm-transport';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAICompatibleResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generate a completion using the specified model
 * Uses OpenAI-compatible API format which works with most providers
 */
export async function complete(
  options: CompletionOptions,
): Promise<CompletionResult> {
  const config = getAIConfig();
  const { provider, model } = parseModelId(options.model);
  const providerConfig = getProviderConfig(provider);

  if (!(await isProviderConfigured(provider, providerConfig))) {
    const hint = getProviderConfigHint(provider);
    throw new Error(
      `Provider not configured: ${provider}. ${
        hint ||
        'Set the appropriate environment variable or configure in AI settings.'
      }`,
    );
  }

  const messages: ChatMessage[] = [];

  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }

  messages.push({ role: 'user', content: options.prompt });

  const timeoutMs = options.timeoutMs || config.defaultTimeoutMs || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const baseURL = providerConfig.baseURL || getDefaultBaseURL(provider);
    const transport = await getOpenAICompatibleTransport(provider, {
      ...providerConfig,
      baseURL,
    });

    const response = await transport.fetch(
      `${transport.baseURL}${transport.chatCompletionsPath}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? config.defaultTemperature ?? 0.2,
          max_tokens: options.maxTokens,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AI API error (${provider}): ${response.status} ${response.statusText}\n${errorText}`,
      );
    }

    const data = (await response.json()) as OpenAICompatibleResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('No response from AI model');
    }

    return {
      text: choice.message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: choice.finish_reason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get default base URL for a provider
 */
function getDefaultBaseURL(provider: string): string {
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
    ollama: 'http://localhost:11434/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    copilot: 'https://api.githubcopilot.com',
  };

  return defaults[provider] || `https://api.${provider}.com/v1`;
}

/**
 * Quick completion using the fast model
 * Used for routing, typo correction, and quick decisions
 */
export async function fastComplete(
  prompt: string,
  system?: string,
): Promise<CompletionResult> {
  const config = getAIConfig();
  const { provider } = parseModelId(config.models.fast);
  // Ollama needs more time for local model inference
  const timeout = provider === 'ollama' ? 60000 : 5000;
  return complete({
    model: config.models.fast,
    prompt,
    system,
    temperature: 0,
    timeoutMs: timeout,
  });
}

/**
 * Full completion using the smart model
 * Used for complex generation tasks
 */
export async function smartComplete(
  prompt: string,
  system?: string,
  options?: Partial<CompletionOptions>,
): Promise<CompletionResult> {
  const config = getAIConfig();
  return complete({
    model: config.models.smart,
    prompt,
    system,
    temperature: options?.temperature ?? 0.2,
    maxTokens: options?.maxTokens ?? 2000,
    timeoutMs: options?.timeoutMs ?? 30000,
  });
}

/**
 * Parse JSON from AI response, handling markdown code blocks
 */
export function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(cleaned) as T;
}
