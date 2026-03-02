import { describe, it, expect } from 'vitest'
import { formatDigestJson } from '../../src/output/json'
import type { DigestItem, FetchError } from '../../src/output/markdown'

describe('JSON Output Formatter', () => {
  describe('Basic formatting', () => {
    it('should return valid JSON with date, items, and errors fields', () => {
      const items: DigestItem[] = [
        {
          title: 'Article Title',
          link: 'https://example.com/article',
          sourceName: 'TechCrunch',
          summary: 'Summary of the article',
          importance: 5,
        },
      ]

      const result = formatDigestJson(items)
      const parsed = JSON.parse(result)

      expect(parsed).toHaveProperty('date')
      expect(parsed).toHaveProperty('items')
      expect(parsed).toHaveProperty('errors')
      expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(parsed.items).toHaveLength(1)
      expect(parsed.errors).toHaveLength(0)
    })

    it('should include all item fields in output', () => {
      const items: DigestItem[] = [
        {
          title: 'Test Article',
          link: 'https://example.com/1',
          sourceName: 'Source A',
          summary: 'A test summary',
          importance: 3,
        },
      ]

      const result = formatDigestJson(items)
      const parsed = JSON.parse(result)
      const item = parsed.items[0]

      expect(item.title).toBe('Test Article')
      expect(item.link).toBe('https://example.com/1')
      expect(item.sourceName).toBe('Source A')
      expect(item.summary).toBe('A test summary')
      expect(item.importance).toBe(3)
    })
  })

  describe('Sorting by importance', () => {
    it('should sort items by importance descending (5 → 1)', () => {
      const items: DigestItem[] = [
        {
          title: 'Low',
          link: 'https://example.com/1',
          sourceName: 'A',
          summary: 'Low',
          importance: 1,
        },
        {
          title: 'Critical',
          link: 'https://example.com/2',
          sourceName: 'B',
          summary: 'Critical',
          importance: 5,
        },
        {
          title: 'High',
          link: 'https://example.com/3',
          sourceName: 'C',
          summary: 'High',
          importance: 4,
        },
      ]

      const result = formatDigestJson(items)
      const parsed = JSON.parse(result)

      expect(parsed.items[0].importance).toBe(5)
      expect(parsed.items[1].importance).toBe(4)
      expect(parsed.items[2].importance).toBe(1)
    })
  })

  describe('Empty input', () => {
    it('should return empty items array for no items', () => {
      const result = formatDigestJson([])
      const parsed = JSON.parse(result)

      expect(parsed.items).toHaveLength(0)
      expect(parsed.errors).toHaveLength(0)
    })
  })

  describe('Error handling', () => {
    it('should include errors when provided', () => {
      const items: DigestItem[] = [
        {
          title: 'Article',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Test',
          importance: 3,
        },
      ]
      const errors: FetchError[] = [
        {
          sourceName: 'Broken Feed',
          url: 'https://broken.com/feed',
          error: 'Connection timeout',
        },
      ]

      const result = formatDigestJson(items, errors)
      const parsed = JSON.parse(result)

      expect(parsed.errors).toHaveLength(1)
      expect(parsed.errors[0].sourceName).toBe('Broken Feed')
      expect(parsed.errors[0].url).toBe('https://broken.com/feed')
      expect(parsed.errors[0].error).toBe('Connection timeout')
    })

    it('should default to empty errors array when errors not provided', () => {
      const result = formatDigestJson([])
      const parsed = JSON.parse(result)
      expect(parsed.errors).toEqual([])
    })
  })

  describe('Output format', () => {
    it('should return pretty-printed JSON (indented)', () => {
      const items: DigestItem[] = [
        {
          title: 'Test',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Summary',
          importance: 3,
        },
      ]

      const result = formatDigestJson(items)

      // Pretty-printed JSON should have newlines and indentation
      expect(result).toContain('\n')
      expect(result).toContain('  ')
    })

    it('should include today date in output', () => {
      const today = new Date().toISOString().split('T')[0]
      const result = formatDigestJson([])
      const parsed = JSON.parse(result)

      expect(parsed.date).toBe(today)
    })
  })

  describe('Edge cases', () => {
    it('should handle special characters in content', () => {
      const items: DigestItem[] = [
        {
          title: 'Title with "quotes" & <brackets>',
          link: 'https://example.com/article?id=1&foo=bar',
          sourceName: 'Source "Name"',
          summary: 'Summary with special chars: <>&"',
          importance: 3,
        },
      ]

      const result = formatDigestJson(items)
      const parsed = JSON.parse(result)

      expect(parsed.items[0].title).toBe('Title with "quotes" & <brackets>')
      expect(parsed.items[0].summary).toBe('Summary with special chars: <>&"')
    })
  })
})
