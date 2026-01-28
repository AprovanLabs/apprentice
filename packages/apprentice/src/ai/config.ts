// AI module configuration

import type {
  AIConfig,
  AIModelConfig,
  AIProviderConfig,
  ParsedModelId,
} from './types';

const DEFAULT_CONFIG: AIConfig = {
  models: {
    fast: 'copilot/gpt-4o',
    smart: 'copilot/gpt-4o',
  },
  defaultTemperature: 0.2,
  defaultTimeoutMs: 30000,
};

/**
 * Environment variable mappings for provider API keys
 */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  ollama: 'OLLAMA_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Default base URLs for providers
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  copilot: 'https://api.githubcopilot.com',
};

let config: AIConfig = { ...DEFAULT_CONFIG };

/**
 * Load AI configuration from environment and optional overrides
 */
export function loadAIConfig(overrides?: Partial<AIConfig>): AIConfig {
  const models: AIModelConfig = {
    fast:
      process.env.APPRENTICE_AI_FAST_MODEL ||
      overrides?.models?.fast ||
      DEFAULT_CONFIG.models.fast,
    smart:
      process.env.APPRENTICE_AI_SMART_MODEL ||
      overrides?.models?.smart ||
      DEFAULT_CONFIG.models.smart,
  };

  config = {
    models,
    providers: overrides?.providers || {},
    defaultTemperature:
      overrides?.defaultTemperature || DEFAULT_CONFIG.defaultTemperature,
    defaultTimeoutMs:
      overrides?.defaultTimeoutMs || DEFAULT_CONFIG.defaultTimeoutMs,
  };

  return config;
}

/**
 * Get the current AI configuration
 */
export function getAIConfig(): AIConfig {
  return config;
}

/**
 * Parse a model ID string into provider and model parts
 * @example parseModelId("copilot/gpt-4o") => { provider: "copilot", model: "gpt-4o" }
 */
export function parseModelId(modelId: string): ParsedModelId {
  const slashIndex = modelId.indexOf('/');
  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  };
}

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: string): AIProviderConfig {
  const customConfig = config.providers?.[provider] as
    | AIProviderConfig
    | undefined;

  return {
    provider,
    baseURL: customConfig?.baseURL || PROVIDER_BASE_URLS[provider],
    apiKey:
      customConfig?.apiKey || process.env[PROVIDER_ENV_VARS[provider] || ''],
    headers: customConfig?.headers,
  };
}

/**
 * Check if AI capabilities are available
 */
export function isAIAvailable(): boolean {
  const { provider } = parseModelId(config.models.fast);

  if (provider === 'ollama') return true;
  if (provider === 'copilot') return true;

  const envVar = PROVIDER_ENV_VARS[provider];
  return !!process.env[envVar || ''];
}

// Initialize config on module load
loadAIConfig();
