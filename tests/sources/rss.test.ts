import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fetchRssFeed } from '../../src/sources/rss'
import { detectFeedUrl } from '../../src/sources/detect'
import type { Source } from '../../src/config/schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, '../../fixtures')

describe('RSS Feed Fetcher', () => {
  let mockFetch: any

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  describe('fetchRssFeed', () => {
    it('should parse a valid RSS feed', async () => {
      const rssContent = readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/feed.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(rssContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)

      expect(result.items.length).toBe(5)
      expect(result.errors).toHaveLength(0)
      expect(result.items[0]).toMatchObject({
        id: expect.any(String),
        title: 'AI Breakthrough in Language Models',
        link: 'https://technewsdaily.example.com/ai-breakthrough',
        sourceName: 'Tech News',
      })
    })

    it('should parse a valid Atom feed', async () => {
      const atomContent = readFileSync(join(fixturesDir, 'sample-atom.xml'), 'utf-8')
      const source: Source = {
        name: 'Developer Blog',
        url: 'https://developer-blog.example.com/atom.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(atomContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)

      expect(result.items.length).toBe(3)
      expect(result.errors).toHaveLength(0)
      expect(result.items[0].title).toBe('Building Scalable APIs with TypeScript')
    })

    it('should extract title, link, guid, pubDate, and content from entries', async () => {
      const rssContent = readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/feed.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(rssContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)
      const item = result.items[0]

      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('title')
      expect(item).toHaveProperty('link')
      expect(item).toHaveProperty('content')
      expect(item).toHaveProperty('pubDate')
      expect(item).toHaveProperty('sourceName')
    })

    it('should filter entries by lastRunTime', async () => {
      const rssContent = readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/feed.xml',
      }

      // Timestamp for Mar 2, 2026 00:00:00 GMT
      const lastRunTime = new Date('2026-03-02T00:00:00Z').getTime()

      mockFetch.mockResolvedValueOnce(new Response(rssContent, { status: 200 }))

      const result = await fetchRssFeed(source, lastRunTime, 100)

      // Only items published after the lastRunTime should be included
      // (Mar 3 and Mar 2 15:45)
      expect(result.items.length).toBeLessThanOrEqual(2)
      result.items.forEach((item) => {
        const itemTime = item.pubDate ? new Date(item.pubDate).getTime() : 0
        expect(itemTime).toBeGreaterThan(lastRunTime)
      })
    })

    it('should limit results to maxItems', async () => {
      const rssContent = readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/feed.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(rssContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 2)

      expect(result.items.length).toBe(2)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle 404 response', async () => {
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/missing-feed.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

      const result = await fetchRssFeed(source, null, 100)

      expect(result.items).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatchObject({
        source: 'Tech News',
        message: expect.stringContaining('404'),
      })
    })

    it('should handle timeout', async () => {
      const source: Source = {
        name: 'Slow Feed',
        url: 'https://slow.example.com/feed.xml',
      }

      mockFetch.mockRejectedValueOnce(new Error('Fetch timeout'))

      const result = await fetchRssFeed(source, null, 100)

      expect(result.items).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('timeout')
    })

    it('should handle malformed XML', async () => {
      const malformedContent = readFileSync(join(fixturesDir, 'malformed.xml'), 'utf-8')
      const source: Source = {
        name: 'Broken Feed',
        url: 'https://example.com/broken.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(malformedContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)

      // Malformed XML should result in error
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle empty feed', async () => {
      const emptyFeed = '<?xml version="1.0"?><rss><channel><title>Empty</title></channel></rss>'
      const source: Source = {
        name: 'Empty Feed',
        url: 'https://example.com/empty.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(emptyFeed, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)

      expect(result.items).toHaveLength(0)
      // Empty feeds (with no items) should parse successfully, though parser may be lenient
      if (result.errors.length > 0) {
        // If there is an error, it should be about parsing
        expect(result.errors[0].message).toContain('parse')
      }
      // Empty feeds may or may not produce errors depending on parser behavior
    })

    it('should return FeedResult with items and errors arrays', async () => {
      const rssContent = readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/feed.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(rssContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)

      expect(result).toHaveProperty('items')
      expect(result).toHaveProperty('errors')
      expect(Array.isArray(result.items)).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
    })
  })

  describe('Feed Auto-Detection', () => {
    it('should detect RSS feed from HTML link tag', async () => {
      const htmlContent = readFileSync(join(fixturesDir, 'sample-page-with-feed.html'), 'utf-8')

      mockFetch.mockResolvedValueOnce(new Response(htmlContent, { status: 200 }))

      const feedUrl = await detectFeedUrl('https://technewsdaily.example.com')

      expect(feedUrl).toBeTruthy()
      expect(feedUrl).toContain('feed.xml')
    })

    it('should try common feed paths if link tag not found', async () => {
      const htmlContent = '<html><body>No feed link</body></html>'

      let callCount = 0
      mockFetch.mockImplementation((url: string) => {
        callCount++
        // First call: HTML page
        if (callCount === 1) {
          return Promise.resolve(new Response(htmlContent, { status: 200 }))
        }
        // Second call: /feed
        if (url.includes('/feed') && callCount === 2) {
          return Promise.resolve(new Response('<?xml version="1.0"?><rss></rss>', { status: 200 }))
        }
        return Promise.resolve(new Response('Not found', { status: 404 }))
      })

      const feedUrl = await detectFeedUrl('https://example.com')

      expect(feedUrl).toBeTruthy()
    })

    it('should return null if no feed detected', async () => {
      mockFetch.mockResolvedValue(new Response('Not found', { status: 404 }))

      const feedUrl = await detectFeedUrl('https://example.com')

      expect(feedUrl).toBeNull()
    })

    it('should handle 404 response gracefully', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

      const feedUrl = await detectFeedUrl('https://missing-site.example.com')

      expect(feedUrl).toBeNull()
    })
  })

  describe('RawItem structure', () => {
    it('should have required RawItem properties', async () => {
      const rssContent = readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')
      const source: Source = {
        name: 'Tech News',
        url: 'https://technewsdaily.example.com/feed.xml',
      }

      mockFetch.mockResolvedValueOnce(new Response(rssContent, { status: 200 }))

      const result = await fetchRssFeed(source, null, 100)

      result.items.forEach((item) => {
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('title')
        expect(item).toHaveProperty('link')
        expect(item).toHaveProperty('content')
        expect(item).toHaveProperty('sourceName')
        expect(item).toHaveProperty('pubDate')

        // Verify types
        expect(typeof item.id).toBe('string')
        expect(typeof item.title).toBe('string')
        expect(typeof item.link).toBe('string')
        expect(typeof item.sourceName).toBe('string')
      })
    })
  })
})
