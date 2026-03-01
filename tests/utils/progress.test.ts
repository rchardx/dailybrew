import { describe, it, expect } from 'vitest'
import { truncateName } from '../../src/utils/progress'

describe('truncateName', () => {
  const MAX_NAME_WIDTH = 24

  describe('short names', () => {
    it('should pad short names to MAX_NAME_WIDTH', () => {
      const result = truncateName('HN')

      expect(result.length).toBe(MAX_NAME_WIDTH)
      expect(result.startsWith('HN')).toBe(true)
      expect(result.trimEnd()).toBe('HN')
    })

    it('should pad single character name', () => {
      const result = truncateName('A')

      expect(result.length).toBe(MAX_NAME_WIDTH)
      expect(result.trimEnd()).toBe('A')
    })

    it('should pad empty string to full width', () => {
      const result = truncateName('')

      expect(result.length).toBe(MAX_NAME_WIDTH)
      expect(result.trim()).toBe('')
    })
  })

  describe('exact length names', () => {
    it('should not truncate or pad a name exactly MAX_NAME_WIDTH chars', () => {
      const name = 'A'.repeat(MAX_NAME_WIDTH)
      const result = truncateName(name)

      expect(result.length).toBe(MAX_NAME_WIDTH)
      expect(result).toBe(name)
    })
  })

  describe('long names', () => {
    it('should truncate names longer than MAX_NAME_WIDTH', () => {
      const name = 'A'.repeat(MAX_NAME_WIDTH + 10)
      const result = truncateName(name)

      expect(result.length).toBe(MAX_NAME_WIDTH)
    })

    it('should end with ellipsis character when truncated', () => {
      const name = 'Very Long Source Name That Exceeds Limit'
      const result = truncateName(name)

      expect(result.endsWith('…')).toBe(true)
    })

    it('should preserve the start of the name when truncating', () => {
      const name = 'A'.repeat(MAX_NAME_WIDTH + 5)
      const result = truncateName(name)

      expect(result.startsWith('A'.repeat(MAX_NAME_WIDTH - 1))).toBe(true)
      expect(result.endsWith('…')).toBe(true)
    })

    it('should truncate name exactly one char over limit', () => {
      const name = 'B'.repeat(MAX_NAME_WIDTH + 1)
      const result = truncateName(name)

      expect(result.length).toBe(MAX_NAME_WIDTH)
      expect(result).toBe('B'.repeat(MAX_NAME_WIDTH - 1) + '…')
    })
  })

  describe('consistent output width', () => {
    it('should always return a string of MAX_NAME_WIDTH length', () => {
      const testNames = ['', 'Hi', 'Medium Name', 'A'.repeat(MAX_NAME_WIDTH), 'B'.repeat(50)]

      testNames.forEach((name) => {
        const result = truncateName(name)
        expect(result.length).toBe(MAX_NAME_WIDTH)
      })
    })
  })

  describe('real-world names', () => {
    it('should handle typical RSS feed names', () => {
      const names = [
        'Hacker News',
        'TechCrunch',
        'The Verge - All Posts',
        'Ars Technica - Features',
      ]

      names.forEach((name) => {
        const result = truncateName(name)
        expect(result.length).toBe(MAX_NAME_WIDTH)
        if (name.length <= MAX_NAME_WIDTH) {
          expect(result.trimEnd()).toBe(name)
        } else {
          expect(result.endsWith('…')).toBe(true)
        }
      })
    })
  })
})
