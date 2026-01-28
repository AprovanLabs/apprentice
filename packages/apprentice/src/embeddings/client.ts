// Embedding client - follows AI module client patterns

import { createHash } from 'node:crypto';
import type { EmbeddingProvider, EmbeddingModelId } from './types';
import {
  parseEmbeddingModelId,
  getEmbeddingProviderConfig,
  getModelDimensions,
  isEmbeddingProviderConfigured,
  getEmbeddingProviderHint,
} from './config';

/**
 * OpenAI-compatible embedding response
 */
interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Ollama embedding response
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Universal embedding provider that works with OpenAI-compatible and Ollama APIs
 */
class UniversalEmbeddingProvider implements EmbeddingProvider {
  public name: string;
  public dimensions: number;
  public model: string;

  private baseURL: string;
  private apiKey?: string;
  private headers: Record<string, string>;
  private isOllama: boolean;

  public constructor(modelId: EmbeddingModelId) {
    const { provider, model } = parseEmbeddingModelId(modelId);

    if (!isEmbeddingProviderConfigured(provider)) {
      const hint = getEmbeddingProviderHint(provider);
      throw new Error(
        `Embedding provider not configured: ${provider}. ${hint || ''}`,
      );
    }

    const config = getEmbeddingProviderConfig(provider);

    this.name = provider;
    this.model = model;
    this.dimensions = getModelDimensions(model);
    this.baseURL = config.baseURL || '';
    this.apiKey = config.apiKey;
    this.headers = config.headers || {};
    this.isOllama = provider === 'ollama';
  }

  public async embed(text: string): Promise<Float32Array> {
    if (this.isOllama) {
      return this.embedOllama(text);
    }
    return this.embedOpenAI(text);
  }

  public async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (this.isOllama) {
      // Ollama doesn't support batch, process sequentially
      const results: Float32Array[] = [];
      for (const text of texts) {
        const embedding = await this.embedOllama(text);
        results.push(embedding);
        // Small delay to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return results;
    }
    return this.embedBatchOpenAI(texts);
  }

  private async embedOllama(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.baseURL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;

    if (!Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }

    // Update dimensions if different
    if (this.dimensions !== data.embedding.length) {
      this.dimensions = data.embedding.length;
    }

    return new Float32Array(data.embedding);
  }

  private async embedOpenAI(text: string): Promise<Float32Array> {
    const embeddings = await this.embedBatchOpenAI([text]);
    return embeddings[0]!;
  }

  private async embedBatchOpenAI(texts: string[]): Promise<Float32Array[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // OpenAI supports up to 2048 inputs, use smaller batches for safety
    const batchSize = 100;
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Embedding API error: ${response.status} ${response.statusText}\n${error}`,
        );
      }

      const data = (await response.json()) as EmbeddingResponse;

      // Sort by index to ensure correct order
      const sorted = [...data.data].sort((a, b) => a.index - b.index);

      for (const item of sorted) {
        results.push(new Float32Array(item.embedding));
      }
    }

    return results;
  }
}

// Cache provider instances by model ID
const providerCache = new Map<string, EmbeddingProvider>();

/**
 * Get an embedding provider for the specified model
 */
export function getEmbeddingProvider(
  modelId: EmbeddingModelId,
): EmbeddingProvider {
  const existing = providerCache.get(modelId);
  if (existing) {
    return existing;
  }

  const provider = new UniversalEmbeddingProvider(modelId);
  providerCache.set(modelId, provider);
  return provider;
}

/**
 * Reset provider cache (useful for testing or config changes)
 */
export function resetEmbeddingProviders(): void {
  providerCache.clear();
}

/**
 * Generate embedding for a single text using the specified model
 */
export async function embed(
  text: string,
  modelId: EmbeddingModelId,
): Promise<Float32Array> {
  const provider = getEmbeddingProvider(modelId);
  return provider.embed(text);
}

/**
 * Generate embeddings for multiple texts using the specified model
 */
export async function embedBatch(
  texts: string[],
  modelId: EmbeddingModelId,
): Promise<Float32Array[]> {
  const provider = getEmbeddingProvider(modelId);
  return provider.embedBatch(texts);
}

/**
 * Create a content hash for caching
 */
export function hashContent(text: string, model: string): string {
  return createHash('sha256').update(`${model}:${text}`).digest('hex');
}

/**
 * Convert Float32Array to Buffer for SQLite storage
 */
export function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Convert Buffer back to Float32Array
 */
export function deserializeEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4,
  );
}
