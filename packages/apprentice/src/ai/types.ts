// AI module types

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  /** Provider name (e.g., 'openai', 'anthropic', 'ollama') */
  provider: string;
  /** API endpoint URL (optional, uses default for provider) */
  baseURL?: string;
  /** API key (optional, uses env var for provider) */
  apiKey?: string;
  /** Additional headers for API requests */
  headers?: Record<string, string>;
}

/**
 * Model configuration combining provider and model ID
 * Format: "provider/model-name" (e.g., "openai/gpt-4o-mini")
 */
export type ModelId = `${string}/${string}` | string;

/**
 * AI completion options
 */
export interface CompletionOptions {
  /** The model to use */
  model: ModelId;
  /** System prompt/instructions */
  system?: string;
  /** User prompt/messages */
  prompt: string;
  /** Temperature (0-1, lower = more deterministic) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * AI completion result
 */
export interface CompletionResult {
  /** Generated text content */
  text: string;
  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Finish reason */
  finishReason?: string;
}

/**
 * Distinct model roles for different use cases
 */
export interface AIModelConfig {
  /**
   * Fast/cheap model for quick decisions
   * Used for: typo correction, intent classification, safety checks
   * Target latency: < 500ms
   */
  fast: ModelId;

  /**
   * Smart/capable model for complex tasks
   * Used for: script generation, complex reasoning
   * Target quality: high accuracy and coherence
   */
  smart: ModelId;
}

/**
 * Full AI configuration
 */
export interface AIConfig {
  /** Model assignments */
  models: AIModelConfig;
  /** Provider-specific configurations */
  providers?: Record<string, AIProviderConfig>;
  /** Default temperature for completions */
  defaultTemperature?: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
}

/**
 * Parsed model identifier
 */
export interface ParsedModelId {
  provider: string;
  model: string;
}
