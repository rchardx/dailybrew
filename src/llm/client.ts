import OpenAI from 'openai'
import type { LLMConfig } from '../config/schema'

const DEFAULT_LLM_TIMEOUT = 60_000 // 60 seconds

/**
 * Create an OpenAI client configured with custom baseURL, apiKey, retries, and timeout.
 */
export function createLLMClient(
  config: LLMConfig,
  llmTimeout: number = DEFAULT_LLM_TIMEOUT,
): OpenAI {
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    maxRetries: 3,
    timeout: llmTimeout,
  })
}
