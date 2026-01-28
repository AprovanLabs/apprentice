// Embedding module types - follows AI module conventions

/**
 * Embedding model ID in format "provider/model"
 * @example "ollama/all-minilm" or "openai/text-embedding-3-small"
 */
export type EmbeddingModelId = `${string}/${string}` | string;

/**
 * Interface for embedding providers
 */
export interface EmbeddingProvider {
  /** Provider name (e.g., "ollama", "openai") */
  name: string;

  /** Vector dimension size */
  dimensions: number;

  /** Model name being used */
  model: string;

  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<Float32Array>;

  /**
   * Generate embeddings for multiple texts (batch)
   * More efficient than calling embed() multiple times
   */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Provider configuration overrides (doesn't need provider key since it's the map key)
 */
export interface EmbeddingProviderOverride {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

/**
 * Embedding-specific configuration
 */
export interface EmbeddingConfig {
  /** Whether embeddings are enabled */
  enabled: boolean;

  /**
   * Embedding model ID in format "provider/model"
   * @example "ollama/all-minilm", "openai/text-embedding-3-small"
   */
  model: EmbeddingModelId;

  /** Provider-specific overrides (optional) */
  providers?: Record<string, EmbeddingProviderOverride>;
}

/**
 * Parsed embedding model identifier
 */
export interface ParsedEmbeddingModelId {
  provider: string;
  model: string;
}

/**
 * Embedding generation options
 */
export interface EmbedOptions {
  /** The model to use */
  model: EmbeddingModelId;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Cached embedding entry
 */
export interface CachedEmbedding {
  contentHash: string;
  embedding: Float32Array;
  model: string;
  createdAt: string;
}
