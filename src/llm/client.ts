import OpenAI from 'openai'
import type { LLMConfig } from '../config/schema'

/**
 * Create an OpenAI client configured with custom baseURL, apiKey, retries, and timeout.
 */
export function createLLMClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    maxRetries: 3,
    timeout: 30_000,
  })
}
