import { describe, it, expect } from 'vitest'
import { summaryResponseSchema, summaryResponseLenientSchema } from '../../src/llm/schemas'

describe('LLM Response Schemas', () => {
  describe('summaryResponseSchema', () => {
    it('should validate a correct response', () => {
      const data = { title: 'Test Title', summary: 'A brief summary.', importance: 3 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe('Test Title')
        expect(result.data.summary).toBe('A brief summary.')
        expect(result.data.importance).toBe(3)
      }
    })

    it('should accept importance of 1 (minimum)', () => {
      const data = { title: 'Low', summary: 'Low importance.', importance: 1 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(true)
    })

    it('should accept importance of 5 (maximum)', () => {
      const data = { title: 'Critical', summary: 'Critical news.', importance: 5 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(true)
    })

    it('should reject importance below 1', () => {
      const data = { title: 'Bad', summary: 'Too low.', importance: 0 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject importance above 5', () => {
      const data = { title: 'Bad', summary: 'Too high.', importance: 6 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject negative importance', () => {
      const data = { title: 'Bad', summary: 'Negative.', importance: -1 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject missing title', () => {
      const data = { summary: 'No title.', importance: 3 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject missing summary', () => {
      const data = { title: 'No summary', importance: 3 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject missing importance', () => {
      const data = { title: 'No importance', summary: 'Missing field.' }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject non-number importance', () => {
      const data = { title: 'Bad type', summary: 'String importance.', importance: 'high' }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should reject null input', () => {
      const result = summaryResponseSchema.safeParse(null)

      expect(result.success).toBe(false)
    })

    it('should reject empty object', () => {
      const result = summaryResponseSchema.safeParse({})

      expect(result.success).toBe(false)
    })

    it('should accept fractional importance within range', () => {
      const data = { title: 'Fractional', summary: 'Fractional.', importance: 3.5 }
      const result = summaryResponseSchema.safeParse(data)

      expect(result.success).toBe(true)
    })
  })

  describe('summaryResponseLenientSchema', () => {
    it('should validate a correct response', () => {
      const data = { title: 'Test', summary: 'A summary.', importance: 3 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(true)
    })

    it('should accept importance above 5 (lenient)', () => {
      const data = { title: 'Over', summary: 'Over five.', importance: 10 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(true)
    })

    it('should accept importance below 1 (lenient)', () => {
      const data = { title: 'Under', summary: 'Under one.', importance: 0 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(true)
    })

    it('should accept negative importance (lenient)', () => {
      const data = { title: 'Neg', summary: 'Negative.', importance: -5 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(true)
    })

    it('should still reject missing title', () => {
      const data = { summary: 'No title.', importance: 3 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should still reject missing summary', () => {
      const data = { title: 'No summary', importance: 3 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should still reject missing importance', () => {
      const data = { title: 'Title', summary: 'Summary' }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should still reject non-number importance', () => {
      const data = { title: 'Title', summary: 'Summary', importance: 'high' }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(false)
    })

    it('should accept fractional importance', () => {
      const data = { title: 'Frac', summary: 'Fractional.', importance: 2.7 }
      const result = summaryResponseLenientSchema.safeParse(data)

      expect(result.success).toBe(true)
    })
  })

  describe('schema differences', () => {
    it('strict schema rejects importance=0 but lenient accepts it', () => {
      const data = { title: 'Test', summary: 'Test.', importance: 0 }

      expect(summaryResponseSchema.safeParse(data).success).toBe(false)
      expect(summaryResponseLenientSchema.safeParse(data).success).toBe(true)
    })

    it('strict schema rejects importance=6 but lenient accepts it', () => {
      const data = { title: 'Test', summary: 'Test.', importance: 6 }

      expect(summaryResponseSchema.safeParse(data).success).toBe(false)
      expect(summaryResponseLenientSchema.safeParse(data).success).toBe(true)
    })

    it('both schemas accept importance within 1-5 range', () => {
      for (let i = 1; i <= 5; i++) {
        const data = { title: 'Test', summary: 'Test.', importance: i }

        expect(summaryResponseSchema.safeParse(data).success).toBe(true)
        expect(summaryResponseLenientSchema.safeParse(data).success).toBe(true)
      }
    })
  })
})
