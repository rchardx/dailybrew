import { describe, it, expect } from 'vitest'
import { createLLMClient } from '../../src/llm/client'

describe('LLM Client', () => {
  it('should create an OpenAI client with custom baseURL', () => {
    const client = createLLMClient({
      baseUrl: 'https://api.custom-llm.com/v1',
      apiKey: 'test-api-key-123',
      model: 'gpt-4o-mini',
    })

    expect(client).toBeDefined()
    // Verify baseURL is set (OpenAI client exposes it)
    expect(client.baseURL).toBe('https://api.custom-llm.com/v1')
  })

  it('should create a client with the provided apiKey', () => {
    const client = createLLMClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-key-abc',
      model: 'gpt-4o',
    })

    expect(client).toBeDefined()
    expect(client.apiKey).toBe('sk-test-key-abc')
  })

  it('should configure maxRetries to 3', () => {
    const client = createLLMClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    })

    expect(client).toBeDefined()
    // maxRetries is exposed on the client
    expect(client.maxRetries).toBe(3)
  })

  it('should configure timeout to 30000ms', () => {
    const client = createLLMClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    })

    // The OpenAI client exposes the timeout
    expect((client as any)._options?.timeout ?? (client as any).timeout).toBe(30000)
  })

  it('should work with different LLM providers via baseURL', () => {
    // Test with a local LLM server (e.g., ollama, vLLM)
    const client = createLLMClient({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'llama3',
    })

    expect(client.baseURL).toBe('http://localhost:11434/v1')
    expect(client.apiKey).toBe('ollama')
  })
})
