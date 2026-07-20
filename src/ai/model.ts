import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Single model configuration for the whole app (SPEC.md → AI Model
// Configuration). Swapping providers is a matter of changing the LLM_* env
// vars; no code changes required.
export const buildModel = (config: LlmConfig) =>
  createOpenAICompatible({
    name: 'llm',
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  }).chatModel(config.model);
