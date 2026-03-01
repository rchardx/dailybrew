import { describe, it, expect } from 'vitest'
import { configSchema, sourceSchema } from '../../src/config/schema'

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

  it('should validate source schema separately', () => {
    const validSource = {
      name: 'Hacker News',
      url: 'https://hnrss.org/frontpage',
      type: 'rss',
    }
    expect(sourceSchema.safeParse(validSource).success).toBe(true)

    // Missing url
    const noUrl = { name: 'Missing URL Source', type: 'rss' }
    const noUrlResult = sourceSchema.safeParse(noUrl)
    expect(noUrlResult.success).toBe(false)
    if (!noUrlResult.success) {
      expect(
        noUrlResult.error.issues.some((issue: any) => issue.path.some((p: any) => p === 'url')),
      ).toBe(true)
    }

    // Missing name
    const noName = { url: 'https://hnrss.org/frontpage', type: 'rss' }
    const noNameResult = sourceSchema.safeParse(noName)
    expect(noNameResult.success).toBe(false)
    if (!noNameResult.success) {
      expect(
        noNameResult.error.issues.some((issue: any) => issue.path.some((p: any) => p === 'name')),
      ).toBe(true)
    }

    // Optional type
    const noType = { name: 'Source without type', url: 'https://example.com' }
    expect(sourceSchema.safeParse(noType).success).toBe(true)

    // Optional selector
    const withSelector = {
      name: 'Web source with selector',
      url: 'https://example.com',
      type: 'web',
      selector: 'h2 > a',
    }
    const selectorResult = sourceSchema.safeParse(withSelector)
    expect(selectorResult.success).toBe(true)
    if (selectorResult.success) {
      expect(selectorResult.data.selector).toBe('h2 > a')
    }
  })

  it('should provide clear error message for invalid config', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
      },
    }

    const result = configSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.issues
      expect(errors.length).toBeGreaterThan(0)
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
