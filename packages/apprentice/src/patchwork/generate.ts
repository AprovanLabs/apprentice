import {
  generateWidget as baseGenerateWidget,
  regenerateWidget as baseRegenerateWidget,
  type GenerateOptions,
  type GenerationResult,
} from '@aprovan/patchwork';
import { smartComplete } from '../ai/client.js';

const llmComplete = async (
  prompt: string,
  system: string,
  options?: { temperature?: number; maxTokens?: number },
) => {
  return smartComplete(prompt, system, options);
};

export async function generateWidget(
  options: Omit<GenerateOptions, 'llm'>,
): Promise<GenerationResult> {
  return baseGenerateWidget({ ...options, llm: llmComplete });
}

export async function regenerateWidget(
  name: string,
  description: string,
): Promise<GenerationResult> {
  return baseRegenerateWidget(name, description, llmComplete);
}
