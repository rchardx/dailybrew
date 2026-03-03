import { describe, it, expect, vi, beforeEach } from 'vitest'
import OpenAI from 'openai'
import { summarizeItem } from '../../src/llm/summarize'
import { logger } from '../../src/utils/logger'

vi.mock('../../src/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Helper to create a mock OpenAI client
function createMockClient() {
  const client = {
    beta: {
      chat: {
        completions: {
          parse: vi.fn(),
        },
      },
    },
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  } as unknown as OpenAI
  return client
}

// Helper to build a structured response (for beta.chat.completions.parse)
function structuredResponse(data: { title: string; summary: string; importance: number }) {
  return {
    choices: [
      {
        message: {
          parsed: data,
          content: JSON.stringify(data),
        },
      },
    ],
  }
}

// Helper to build a fallback response (for chat.completions.create)
function fallbackResponse(content: string) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  }
}

// Helper to create OpenAI API errors
function createAPIError(status: number, message: string) {
  const error = new OpenAI.APIError(
    status,
    { message, type: 'error', code: null, param: null },
    message,
    {} as any,
  )
  return error
}

describe('summarizeItem', () => {
  let client: OpenAI

  beforeEach(() => {
    client = createMockClient()
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  describe('Structured output mode', () => {
    it('should parse a valid structured response correctly', async () => {
      const mockParse = vi.fn().mockResolvedValue(
        structuredResponse({
          title: 'Breaking: New TypeScript Feature',
          summary: 'TypeScript 6.0 introduces pattern matching, a long-awaited feature.',
          importance: 4,
        }),
      )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(
        client,
        'deepseek-reasoner',
        'Article about TypeScript 6.0...',
        'TechCrunch',
      )

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Breaking: New TypeScript Feature')
      expect(result!.summary).toBe(
        'TypeScript 6.0 introduces pattern matching, a long-awaited feature.',
      )
      expect(result!.importance).toBe(4)
    })

    it('should pass correct model and messages to the API', async () => {
      const mockParse = vi
        .fn()
        .mockResolvedValue(structuredResponse({ title: 'Test', summary: 'Test', importance: 3 }))
      ;(client.beta.chat.completions as any).parse = mockParse

      await summarizeItem(client, 'gpt-4o', 'Some content here', 'HackerNews')

      expect(mockParse).toHaveBeenCalledTimes(1)
      const callArgs = mockParse.mock.calls[0][0]
      expect(callArgs.model).toBe('gpt-4o')
      expect(callArgs.messages).toHaveLength(2)
      expect(callArgs.messages[0].role).toBe('system')
      expect(callArgs.messages[1].role).toBe('user')
      expect(callArgs.messages[1].content).toContain('HackerNews')
      expect(callArgs.messages[1].content).toContain('Some content here')
      expect(callArgs.response_format).toBeDefined()
    })
  })

  describe('Fallback mode', () => {
    it('should fall back to prompt-based JSON when structured output returns 400', async () => {
      // Mode 1 fails with 400
      const mockParse = vi
        .fn()
        .mockRejectedValue(createAPIError(400, 'Unsupported response_format'))
      ;(client.beta.chat.completions as any).parse = mockParse

      // Mode 2 succeeds with JSON in text
      const mockCreate = vi
        .fn()
        .mockResolvedValue(
          fallbackResponse(
            '{"title": "Fallback Title", "summary": "Fallback summary.", "importance": 3}',
          ),
        )
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'llama3', 'Content...', 'Blog')

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Fallback Title')
      expect(result!.summary).toBe('Fallback summary.')
      expect(result!.importance).toBe(3)

      // Verify structured was tried first
      expect(mockParse).toHaveBeenCalledTimes(1)
      // Then fallback was used
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('should parse JSON from response with markdown code fences', async () => {
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi
        .fn()
        .mockResolvedValue(
          fallbackResponse(
            '```json\n{"title": "Fenced Title", "summary": "Fenced summary.", "importance": 2}\n```',
          ),
        )
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Fenced Title')
      expect(result!.summary).toBe('Fenced summary.')
      expect(result!.importance).toBe(2)
    })

    it('should include JSON format instructions in fallback prompt', async () => {
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi
        .fn()
        .mockResolvedValue(fallbackResponse('{"title": "T", "summary": "S", "importance": 3}'))
      ;(client.chat.completions as any).create = mockCreate

      await summarizeItem(client, 'model', 'Content', 'Source')

      const callArgs = mockCreate.mock.calls[0][0]
      const userMsg = callArgs.messages.find((m: any) => m.role === 'user')
      expect(userMsg.content).toContain('JSON')
      expect(userMsg.content).toContain('"title"')
      expect(userMsg.content).toContain('"summary"')
      expect(userMsg.content).toContain('"importance"')
    })
  })

  describe('Importance clamping', () => {
    it('should clamp importance > 5 down to 5', async () => {
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'High', summary: 'Overclaimed importance.', importance: 7 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.importance).toBe(5)
    })

    it('should clamp importance < 1 up to 1', async () => {
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'Low', summary: 'Zero importance.', importance: 0 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.importance).toBe(1)
    })

    it('should clamp negative importance to 1', async () => {
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'Neg', summary: 'Negative.', importance: -3 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.importance).toBe(1)
    })

    it('should round fractional importance to nearest integer', async () => {
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'Frac', summary: 'Fractional.', importance: 3.7 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.importance).toBe(4)
    })

    it('should clamp importance in fallback mode too', async () => {
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi
        .fn()
        .mockResolvedValue(fallbackResponse('{"title": "T", "summary": "S", "importance": 10}'))
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.importance).toBe(5)
    })
  })

  describe('Summary truncation', () => {
    it('should truncate summary longer than 500 chars', async () => {
      const longSummary = 'A'.repeat(5000)
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'Long', summary: longSummary, importance: 3 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.summary.length).toBeLessThanOrEqual(500)
      expect(result!.summary.endsWith('...')).toBe(true)
    })

    it('should not truncate summary exactly 500 chars', async () => {
      const exactSummary = 'B'.repeat(500)
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'Exact', summary: exactSummary, importance: 3 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.summary.length).toBe(500)
      expect(result!.summary).not.toContain('...')
    })

    it('should not modify short summaries', async () => {
      const shortSummary = 'Brief summary.'
      const mockParse = vi
        .fn()
        .mockResolvedValue(
          structuredResponse({ title: 'Short', summary: shortSummary, importance: 3 }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Brief summary.')
    })

    it('should truncate summary in fallback mode too', async () => {
      const longSummary = 'C'.repeat(2000)
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi
        .fn()
        .mockResolvedValue(
          fallbackResponse(JSON.stringify({ title: 'T', summary: longSummary, importance: 2 })),
        )
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.summary.length).toBeLessThanOrEqual(500)
      expect(result!.summary.endsWith('...')).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should return null on LLM timeout (connection error)', async () => {
      const timeoutError = new OpenAI.APIConnectionTimeoutError({ message: 'Request timed out' })
      const mockParse = vi.fn().mockRejectedValue(timeoutError)
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to summarize'))
    })

    it('should return null on garbage (non-JSON) LLM response', async () => {
      // Structured mode fails with 400
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      // Fallback returns garbage
      const mockCreate = vi
        .fn()
        .mockResolvedValue(
          fallbackResponse(
            'I cannot provide a summary. This is just plain text with no JSON at all.',
          ),
        )
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Fallback mode failed'))
    })

    it('should return null on auth error (401) with clear message about API key', async () => {
      const authError = createAPIError(401, 'Invalid API key')
      const mockParse = vi.fn().mockRejectedValue(authError)
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('API key'))
    })

    it('should return null on auth error in fallback mode too', async () => {
      // Structured fails with 400
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      // Fallback fails with 401
      const mockCreate = vi.fn().mockRejectedValue(createAPIError(401, 'Invalid API key'))
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'))
    })

    it('should return null when structured response has no parsed content', async () => {
      const mockParse = vi.fn().mockResolvedValue({
        choices: [{ message: { parsed: null, content: null } }],
      })
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
    })

    it('should return null when fallback response has no content', async () => {
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: null } }],
      })
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
    })

    it('should return null on generic 500 server error', async () => {
      const serverError = createAPIError(500, 'Internal server error')
      const mockParse = vi.fn().mockRejectedValue(serverError)
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
    })

    it('should never throw — always return SummaryResult or null', async () => {
      // Even with the most unexpected errors
      const mockParse = vi.fn().mockRejectedValue(new Error('Completely unexpected'))
      ;(client.beta.chat.completions as any).parse = mockParse

      // This should NOT throw
      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
    })
  })

  describe('Rate limit handling', () => {
    it('should surface 429 errors (SDK handles retries internally)', async () => {
      // After SDK exhausts retries, it throws 429
      const rateLimitError = createAPIError(429, 'Rate limit exceeded')
      const mockParse = vi.fn().mockRejectedValue(rateLimitError)
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      // After SDK retries are exhausted, we return null gracefully
      expect(result).toBeNull()
    })
  })

  describe('Multilingual content', () => {
    it('should handle Chinese content and produce valid summary', async () => {
      const mockParse = vi.fn().mockResolvedValue(
        structuredResponse({
          title: '最新人工智能突破',
          summary: '研究人员开发了一种新的深度学习方法，大幅提高了自然语言处理的准确性。',
          importance: 4,
        }),
      )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(
        client,
        'model',
        '今天，AI领域迎来了重大突破...',
        '科技日报',
      )

      expect(result).not.toBeNull()
      expect(result!.title).toBe('最新人工智能突破')
      expect(result!.summary).toContain('深度学习')
      expect(result!.importance).toBe(4)
    })

    it('should handle Japanese content and produce valid summary', async () => {
      const mockParse = vi.fn().mockResolvedValue(
        structuredResponse({
          title: '新しいプログラミング言語の登場',
          summary: 'Rustの影響を受けた新言語が発表され、メモリ安全性と高性能を両立しています。',
          importance: 3,
        }),
      )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(
        client,
        'model',
        'プログラミング言語の新たなトレンド...',
        'ITmedia',
      )

      expect(result).not.toBeNull()
      expect(result!.title).toBe('新しいプログラミング言語の登場')
      expect(result!.summary).toContain('Rust')
      expect(result!.importance).toBe(3)
    })

    it('should handle English content and produce valid summary', async () => {
      const mockParse = vi.fn().mockResolvedValue(
        structuredResponse({
          title: 'Kubernetes 2.0 Released',
          summary:
            'The new major version of Kubernetes brings simplified API and improved scalability.',
          importance: 5,
        }),
      )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(
        client,
        'model',
        'Kubernetes releases version 2.0...',
        'The Register',
      )

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Kubernetes 2.0 Released')
      expect(result!.importance).toBe(5)
    })
  })

  describe('Edge cases', () => {
    it('should handle response with extra text around JSON in fallback', async () => {
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi
        .fn()
        .mockResolvedValue(
          fallbackResponse(
            'Here is the analysis:\n{"title": "Edge", "summary": "Works.", "importance": 2}\nHope this helps!',
          ),
        )
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Edge')
    })

    it('should handle fallback with invalid JSON structure (missing fields)', async () => {
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      // Missing importance field
      const mockCreate = vi
        .fn()
        .mockResolvedValue(fallbackResponse('{"title": "Only Title", "summary": "No importance"}'))
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      // Should return null because Zod safeParse fails
      expect(result).toBeNull()
    })
  })

  describe('Retry logic', () => {
    it('should retry on transient structured mode error and succeed on second attempt', async () => {
      const mockParse = vi
        .fn()
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(
          structuredResponse({
            title: 'Retry Success',
            summary: 'Worked on retry.',
            importance: 3,
          }),
        )
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Retry Success')
      expect(mockParse).toHaveBeenCalledTimes(2)
    })

    it('should not retry on auth error (401)', async () => {
      const authError = createAPIError(401, 'Invalid API key')
      const mockParse = vi.fn().mockRejectedValue(authError)
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
      // Should only be called once — no retries
      expect(mockParse).toHaveBeenCalledTimes(1)
    })

    it('should return null after exhausting all retries', async () => {
      const mockParse = vi.fn().mockRejectedValue(new Error('Persistent failure'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).toBeNull()
      // 3 total attempts: initial + 2 retries
      expect(mockParse).toHaveBeenCalledTimes(3)
    })

    it('should retry fallback mode failures and succeed on retry', async () => {
      // Structured always fails with 400 (unsupported) — triggers fallback
      const mockParse = vi.fn().mockRejectedValue(createAPIError(400, 'Unsupported'))
      ;(client.beta.chat.completions as any).parse = mockParse

      const mockCreate = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary fallback failure'))
        .mockResolvedValueOnce(
          fallbackResponse('{"title": "Retry FB", "summary": "OK", "importance": 2}'),
        )
      ;(client.chat.completions as any).create = mockCreate

      const result = await summarizeItem(client, 'model', 'Content', 'Source')

      expect(result).not.toBeNull()
      expect(result!.title).toBe('Retry FB')
      // Structured tried each attempt, fallback tried twice
      expect(mockParse).toHaveBeenCalledTimes(2)
      expect(mockCreate).toHaveBeenCalledTimes(2)
    })
  })
})
