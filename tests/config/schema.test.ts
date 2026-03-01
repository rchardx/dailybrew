import { describe, it, expect } from 'vitest'
import { configSchema } from '../../src/config/schema'

describe('Config Schema', () => {
  it('should validate a complete valid config', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          name: 'Hacker News',
          url: 'https://hnrss.org/frontpage',
          type: 'rss',
        },
      ],
      options: {
        maxItems: 10,
        maxContentLength: 65536,
        concurrency: 8,
      },
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.options.maxItems).toBe(10)
      expect(result.data.options.maxContentLength).toBe(65536)
      expect(result.data.options.concurrency).toBe(8)
    }
  })

  it('should apply default values for missing options', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          name: 'Hacker News',
          url: 'https://hnrss.org/frontpage',
          type: 'rss' as const,
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.options.maxItems).toBe(10)
      expect(result.data.options.maxContentLength).toBe(65536)
      expect(result.data.options.concurrency).toBe(8)
    }
  })

  it('should reject config missing llm.baseUrl', () => {
    const config = {
      llm: {
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          name: 'Hacker News',
          url: 'https://hnrss.org/frontpage',
          type: 'rss',
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('baseUrl'))).toBe(true)
    }
  })

  it('should reject config missing llm.apiKey', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      sources: [],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('apiKey'))).toBe(true)
    }
  })

  it('should reject config missing llm.model', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
      },
      sources: [],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('model'))).toBe(true)
    }
  })

  it('should reject invalid baseUrl (not a valid URL)', () => {
    const config = {
      llm: {
        baseUrl: 'not-a-url',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('should require url in source entries', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          name: 'Missing URL Source',
          type: 'rss',
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.some((p) => p === 'url'))).toBe(true)
    }
  })

  it('should require name in source entries', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          url: 'https://hnrss.org/frontpage',
          type: 'rss',
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.some((p) => p === 'name'))).toBe(true)
    }
  })

  it('should allow optional type in source entries', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          name: 'Source without type',
          url: 'https://example.com',
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('should allow optional selector in source entries', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      },
      sources: [
        {
          name: 'Web source with selector',
          url: 'https://example.com',
          type: 'web',
          selector: 'h2 > a',
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sources[0].selector).toBe('h2 > a')
    }
  })

  it('should provide clear error message for invalid config', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
      },
      sources: [
        {
          name: 'Test',
        },
      ],
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.issues
      expect(errors.length).toBeGreaterThan(0)
    }
  })
})
