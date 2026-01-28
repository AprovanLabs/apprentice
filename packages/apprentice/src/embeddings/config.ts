// Embedding configuration - follows AI module patterns

import type {
  EmbeddingConfig,
  EmbeddingModelId,
  ParsedEmbeddingModelId,
} from './types';

/**
 * Resolved provider configuration (includes provider name and resolved values)
 */
export interface ResolvedProviderConfig {
  provider: string;
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

/**
 * Default embedding configuration
 */
const DEFAULT_CONFIG: EmbeddingConfig = {
  enabled: false,
  model: 'ollama/all-minilm',
};

/**
 * Default base URLs for embedding providers
 * Note: Ollama uses different endpoint for embeddings vs chat
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434',
  voyage: 'https://api.voyageai.com/v1',
};

/**
 * Environment variable mappings for provider API keys
 */
const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  voyage: 'VOYAGE_API_KEY',
  // ollama doesn't require API key
};

/**
 * Known embedding dimensions for common models
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  // Ollama models
  'all-minilm': 384,
  'all-minilm-l6-v2': 384,
  'nomic-embed-text': 768,
  mxbai: 1024,
  // OpenAI models
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  // Voyage models
  'voyage-code-2': 1536,
  'voyage-2': 1024,
};

let config: EmbeddingConfig = { ...DEFAULT_CONFIG };

/**
 * Load embedding configuration
 */
export function loadEmbeddingConfig(
  overrides?: Partial<EmbeddingConfig>,
): EmbeddingConfig {
  config = {
    enabled: overrides?.enabled ?? DEFAULT_CONFIG.enabled,
    model: overrides?.model ?? DEFAULT_CONFIG.model,
    providers: overrides?.providers,
  };

  return config;
}

/**
 * Get the current embedding configuration
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return config;
}

/**
 * Parse an embedding model ID string into provider and model parts
 * @example parseEmbeddingModelId("ollama/all-minilm") => { provider: "ollama", model: "all-minilm" }
 */
export function parseEmbeddingModelId(
  modelId: EmbeddingModelId,
): ParsedEmbeddingModelId {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex === -1) {
    // Default to ollama if no provider specified
    return { provider: 'ollama', model: modelId };
  }
  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  };
}

/**
 * Get provider configuration for embeddings
 */
export function getEmbeddingProviderConfig(
  provider: string,
): ResolvedProviderConfig {
  const customConfig = config.providers?.[provider];
  const envVar = PROVIDER_ENV_VARS[provider];
  const apiKey =
    customConfig?.apiKey || (envVar ? process.env[envVar] : undefined);

  return {
    provider,
    baseURL: customConfig?.baseURL || PROVIDER_BASE_URLS[provider],
    apiKey,
    headers: customConfig?.headers,
  };
}

/**
 * Get the expected dimensions for a model
 */
export function getModelDimensions(model: string): number {
  return MODEL_DIMENSIONS[model] || 384; // Default to 384 (MiniLM)
}

/**
 * Check if an embedding provider is configured
 */
export function isEmbeddingProviderConfigured(provider: string): boolean {
  // Ollama doesn't require API key
  if (provider === 'ollama') {
    return true;
  }

  const providerConfig = getEmbeddingProviderConfig(provider);
  return !!providerConfig.apiKey;
}

/**
 * Get configuration hint for a provider
 */
export function getEmbeddingProviderHint(provider: string): string | null {
  const envVar = PROVIDER_ENV_VARS[provider];
  if (envVar) {
    return `Set ${envVar} environment variable or configure in embeddings.providers.${provider}.apiKey`;
  }
  return null;
}
