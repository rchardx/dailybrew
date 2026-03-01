import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectFeedUrl } from '../../src/sources/detect'

describe('detectFeedUrl', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  describe('HTML link tag detection', () => {
    it('should detect RSS feed from link rel="alternate" type="application/rss+xml"', async () => {
      const html = `
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="https://example.com/feed.xml" />
        </head><body></body></html>
      `
      mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should detect Atom feed when RSS link is absent', async () => {
      const html = `
        <html><head>
          <link rel="alternate" type="application/atom+xml" href="/atom.xml" />
        </head><body></body></html>
      `
      mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBe('https://example.com/atom.xml')
    })

    it('should prefer RSS over Atom when both are present', async () => {
      const html = `
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="/rss.xml" />
          <link rel="alternate" type="application/atom+xml" href="/atom.xml" />
        </head><body></body></html>
      `
      mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBe('https://example.com/rss.xml')
    })

    it('should resolve relative feed URLs against the page URL', async () => {
      const html = `
        <html><head>
          <link rel="alternate" type="application/rss+xml" href="/blog/feed" />
        </head><body></body></html>
      `
      mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

      const result = await detectFeedUrl('https://example.com/page')

      expect(result).toBe('https://example.com/blog/feed')
    })
  })

  describe('common feed paths fallback', () => {
    it('should try common paths when no link tag is found', async () => {
      const html = '<html><head><title>No feed</title></head><body></body></html>'

      let callCount = 0
      mockFetch.mockImplementation((url: string) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(html, { status: 200 }))
        }
        // /feed returns valid XML
        if (url.includes('/feed') && callCount === 2) {
          return Promise.resolve(
            new Response('<?xml version="1.0"?><rss></rss>', {
              status: 200,
              headers: { 'content-type': 'application/rss+xml' },
            }),
          )
        }
        return Promise.resolve(new Response('Not found', { status: 404 }))
      })

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBeTruthy()
      expect(result).toContain('/feed')
    })

    it('should detect feed by XML content when content-type is generic', async () => {
      const html = '<html><body>No feed link</body></html>'

      let callCount = 0
      mockFetch.mockImplementation((url: string) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(html, { status: 200 }))
        }
        // /feed returns plain text that starts with <rss
        if (url.includes('/feed') && callCount === 2) {
          return Promise.resolve(
            new Response('<rss version="2.0"><channel></channel></rss>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            }),
          )
        }
        return Promise.resolve(new Response('Not found', { status: 404 }))
      })

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBeTruthy()
    })

    it('should detect Atom feed content at common path', async () => {
      const html = '<html><body>No feed link</body></html>'

      let callCount = 0
      mockFetch.mockImplementation((url: string) => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(html, { status: 200 }))
        }
        // All common paths fail except atom.xml
        if (url.endsWith('/atom.xml')) {
          return Promise.resolve(
            new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', {
              status: 200,
              headers: { 'content-type': 'application/atom+xml' },
            }),
          )
        }
        return Promise.resolve(new Response('Not found', { status: 404 }))
      })

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBeTruthy()
      expect(result).toContain('/atom.xml')
    })
  })

  describe('error handling', () => {
    it('should return null when initial page fetch returns 404', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      // Common paths also 404
      mockFetch.mockResolvedValue(new Response('Not found', { status: 404 }))

      const result = await detectFeedUrl('https://missing.example.com')

      expect(result).toBeNull()
    })

    it('should return null when fetch throws (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await detectFeedUrl('https://unreachable.example.com')

      expect(result).toBeNull()
    })

    it('should return null when no feed is found anywhere', async () => {
      const html = '<html><body>No feed</body></html>'
      mockFetch.mockImplementation((_url: string) => {
        return Promise.resolve(new Response(html, { status: 200 }))
      })

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBeNull()
    })

    it('should return null when HTML has no link tags and all common paths return 404', async () => {
      const html = '<html><head></head><body></body></html>'

      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(html, { status: 200 }))
        }
        return Promise.resolve(new Response('Not found', { status: 404 }))
      })

      const result = await detectFeedUrl('https://example.com')

      expect(result).toBeNull()
    })
  })
})
