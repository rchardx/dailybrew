import { describe, it, expect } from 'vitest'
import { formatDigestHtml } from '../../src/output/html'
import type { DigestItem, FetchError } from '../../src/output/markdown'

describe('HTML Output Formatter', () => {
  describe('Basic structure', () => {
    it('should return valid HTML with DOCTYPE, head, and body', () => {
      const items: DigestItem[] = [
        {
          title: 'Article Title',
          link: 'https://example.com/article',
          sourceName: 'TechCrunch',
          summary: 'Summary of the article',
          importance: 5,
        },
      ]

      const result = formatDigestHtml(items)

      expect(result).toContain('<!DOCTYPE html>')
      expect(result).toContain('<html lang="en">')
      expect(result).toContain('<head>')
      expect(result).toContain('</head>')
      expect(result).toContain('<body>')
      expect(result).toContain('</body>')
      expect(result).toContain('</html>')
    })

    it('should include date in title and h1', () => {
      const today = new Date().toISOString().split('T')[0]
      const items: DigestItem[] = [
        {
          title: 'Test',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Test',
          importance: 3,
        },
      ]

      const result = formatDigestHtml(items)

      expect(result).toContain(`<title>Daily Digest — ${today}</title>`)
      expect(result).toContain(`<h1>Daily Digest — ${today}</h1>`)
    })

    it('should include inline CSS styles', () => {
      const result = formatDigestHtml([])

      expect(result).toContain('<style>')
      expect(result).toContain('font-family')
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

      const result = formatDigestHtml(items)
      const criticalIdx = result.indexOf('Critical')
      const highIdx = result.indexOf('High')
      const lowIdx = result.indexOf('Low')

      expect(criticalIdx).toBeLessThan(highIdx)
      expect(highIdx).toBeLessThan(lowIdx)
    })
  })

  describe('Grouping by importance', () => {
    it('should group items by importance level with emoji headers', () => {
      const items: DigestItem[] = [
        {
          title: 'Critical Item',
          link: 'https://example.com/1',
          sourceName: 'Source A',
          summary: 'Critical',
          importance: 5,
        },
        {
          title: 'Normal Item',
          link: 'https://example.com/2',
          sourceName: 'Source B',
          summary: 'Normal',
          importance: 2,
        },
      ]

      const result = formatDigestHtml(items)

      expect(result).toContain('🔴 Critical (5/5)')
      expect(result).toContain('🟢 Normal (2/5)')
    })
  })

  describe('Empty input', () => {
    it('should show "No new content" for empty items', () => {
      const result = formatDigestHtml([])
      expect(result).toContain('No new content')
    })
  })

  describe('Fetch errors', () => {
    it('should include error section when errors provided', () => {
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

      const result = formatDigestHtml(items, errors)

      expect(result).toContain('⚠️ Fetch Errors')
      expect(result).toContain('Broken Feed')
      expect(result).toContain('Connection timeout')
      expect(result).toContain('https://broken.com/feed')
    })

    it('should not include error section when no errors provided', () => {
      const items: DigestItem[] = [
        {
          title: 'Article',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Test',
          importance: 3,
        },
      ]

      const result = formatDigestHtml(items)
      expect(result).not.toContain('Fetch Errors')
    })
  })

  describe('HTML escaping', () => {
    it('should escape special HTML characters to prevent XSS', () => {
      const items: DigestItem[] = [
        {
          title: '<script>alert("xss")</script>',
          link: 'https://example.com/1',
          sourceName: 'Source & "Friends"',
          summary: 'Summary with <html> & "quotes"',
          importance: 3,
        },
      ]

      const result = formatDigestHtml(items)

      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('Source &amp; &quot;Friends&quot;')
      expect(result).toContain('&lt;html&gt;')
    })
  })

  describe('Item rendering', () => {
    it('should render items with links, source names, and summaries', () => {
      const items: DigestItem[] = [
        {
          title: 'Test Article',
          link: 'https://example.com/article',
          sourceName: 'TechCrunch',
          summary: 'A great article about testing',
          importance: 4,
        },
      ]

      const result = formatDigestHtml(items)

      expect(result).toContain('href="https://example.com/article"')
      expect(result).toContain('Test Article')
      expect(result).toContain('TechCrunch')
      expect(result).toContain('A great article about testing')
    })

    it('should include separators between importance groups', () => {
      const items: DigestItem[] = [
        {
          title: 'Critical',
          link: 'https://example.com/1',
          sourceName: 'Source A',
          summary: 'Critical item',
          importance: 5,
        },
        {
          title: 'Low',
          link: 'https://example.com/2',
          sourceName: 'Source B',
          summary: 'Low item',
          importance: 1,
        },
      ]

      const result = formatDigestHtml(items)
      expect(result).toContain('<hr')
    })
  })
})
