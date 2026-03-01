import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fetchWebPage } from '../../src/sources/web'
import type { Source } from '../../src/config/schema'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Web Page Fetcher', () => {
  const baseUrl = 'http://example.com'
  const source: Source = {
    name: 'Test Blog',
    url: baseUrl,
    type: 'web',
    selector: 'article h2 a',
  }

  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('CSS Selector Extraction', () => {
    it('should extract links from blog page using CSS selector', async () => {
      const blogHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-blog.html'),
        'utf-8',
      )
      const articleHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-article.html'),
        'utf-8',
      )

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => blogHtml,
      })
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.items[0]).toHaveProperty('title')
      expect(result.items[0]).toHaveProperty('link')
      expect(result.items[0]).toHaveProperty('id')
      expect(result.errors).toHaveLength(0)
    })

    it('should extract correct number of links matching selector', async () => {
      const blogHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-blog.html'),
        'utf-8',
      )
      const articleHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-article.html'),
        'utf-8',
      )

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => blogHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 10, 4000)

      expect(result.items).toHaveLength(3)
    })

    it('should handle no matches for selector', async () => {
      const html = '<html><body><h1>No articles here</h1></body></html>'

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => html,
      })

      const noMatchSource: Source = {
        name: 'Test',
        url: baseUrl,
        type: 'web',
        selector: 'article h2 a',
      }

      const result = await fetchWebPage(noMatchSource, null, 10, 4000)

      expect(result.items).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('Relative URL Resolution', () => {
    it('should resolve relative URLs to absolute', async () => {
      const blogHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-blog.html'),
        'utf-8',
      )
      const articleHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-article.html'),
        'utf-8',
      )

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => blogHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      if (result.items.length > 0) {
        expect(result.items[0].link).toMatch(/^http/)
        expect(result.items[0].link).toContain(baseUrl)
      }
    })

    it('should handle absolute URLs in selector', async () => {
      const html = `
        <html>
          <body>
            <article>
              <h2><a href="https://other.com/post">Post 1</a></h2>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<html><body>Content</body></html>',
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].link).toBe('https://other.com/post')
    })
  })

  describe('Content Extraction and Cleaning', () => {
    it('should extract text content from article page', async () => {
      const blogHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-blog.html'),
        'utf-8',
      )
      const articleHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-article.html'),
        'utf-8',
      )

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => blogHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.items[0].content).toBeTruthy()
      expect(result.items[0].content.length).toBeGreaterThan(0)
    })

    it('should strip script tags from content', async () => {
      const html = `
        <html>
          <body>
            <article>
              <h2><a href="/post1">Post 1</a></h2>
            </article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <article>
              <p>Article content here</p>
              <script>malicious();</script>
              <p>More real content</p>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).not.toContain('malicious')
      expect(result.items[0].content).toContain('Article content')
    })

    it('should strip style tags from content', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <article>
              <h1>Title</h1>
              <style>body { color: red; }</style>
              <p>Real content</p>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).not.toContain('color: red')
      expect(result.items[0].content).toContain('Real content')
    })

    it('should strip nav tags from content', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <nav><a href="/home">Home</a><a href="/about">About</a></nav>
            <article>
              <h1>Title</h1>
              <p>Article content</p>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).not.toContain('Home')
      expect(result.items[0].content).not.toContain('About')
      expect(result.items[0].content).toContain('Article content')
    })

    it('should strip footer tags from content', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <article>
              <h1>Title</h1>
              <p>Article content</p>
            </article>
            <footer><p>Copyright 2024</p></footer>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).not.toContain('Copyright')
    })

    it('should extract from article tag when present', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <article>
              <h1>Article Title</h1>
              <p>Article content with important information</p>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).toContain('important information')
    })

    it('should extract from main tag when article not found', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <main>
              <h1>Title</h1>
              <p>Main content here</p>
            </main>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).toContain('Main content')
    })

    it('should extract from .content class when no article or main', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <div class="content">
              <h1>Title</h1>
              <p>Content class text</p>
            </div>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).toContain('Content class')
    })

    it('should fall back to body when no semantic elements found', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <h1>Title</h1>
            <p>Fallback body content</p>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).toContain('Fallback body content')
    })
  })

  describe('Content Truncation', () => {
    it('should truncate content to maxContentLength', async () => {
      const longContent = 'a'.repeat(5000)
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <article>
              <h1>Title</h1>
              <p>${longContent}</p>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const maxLength = 1000
      const result = await fetchWebPage(source, null, 1, maxLength)

      expect(result.items[0].content.length).toBeLessThanOrEqual(maxLength)
    })

    it('should not truncate content shorter than maxContentLength', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post">Post</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = `
        <html>
          <body>
            <article>
              <h1>Title</h1>
              <p>Short content</p>
            </article>
          </body>
        </html>
      `

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items[0].content).toContain('Short content')
    })
  })

  describe('Error Handling', () => {
    it('should handle 404 response from main page', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await fetchWebPage(source, null, 10, 4000)

      expect(result.items).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].sourceName).toBe(source.name)
      expect(result.errors[0].url).toBe(source.url)
    })

    it('should handle timeout', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('timeout'))

      const result = await fetchWebPage(source, null, 10, 4000)

      expect(result.items).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
    })

    it('should handle empty page', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html><body></body></html>',
      })

      const result = await fetchWebPage(source, null, 10, 4000)

      expect(result.items).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle 404 on article fetch without stopping', async () => {
      const html = `
        <html>
          <body>
            <article><h2><a href="/post1">Post 1</a></h2></article>
            <article><h2><a href="/post2">Post 2</a></h2></article>
            <article><h2><a href="/post3">Post 3</a></h2></article>
          </body>
        </html>
      `

      const articleHtml = '<article><p>Content</p></article>'

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => html,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 10, 4000)

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('maxItems Limit', () => {
    it('should limit results to maxItems', async () => {
      const blogHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-blog.html'),
        'utf-8',
      )
      const articleHtml = fs.readFileSync(
        path.join(process.cwd(), 'fixtures', 'sample-article.html'),
        'utf-8',
      )

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => blogHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => articleHtml,
        })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items.length).toBeLessThanOrEqual(1)
    })
  })

  describe('User-Agent Header', () => {
    it('should include User-Agent header in requests', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<article><h2><a href="/post">Post</a></h2></article>',
      })
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<article><p>Content</p></article>',
      })

      await fetchWebPage(source, null, 1, 4000)

      const firstCall = fetchSpy.mock.calls[0]
      expect(firstCall[1]).toBeDefined()
      expect(firstCall[1].headers).toBeDefined()
      expect(firstCall[1].headers['User-Agent']).toBeDefined()
    })
  })

  describe('Item Structure', () => {
    it('should return items with required fields', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<article><h2><a href="/post">Post Title</a></h2></article>',
      })
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<article><p>Content here</p></article>',
      })

      const result = await fetchWebPage(source, null, 1, 4000)

      expect(result.items).toHaveLength(1)
      const item = result.items[0]
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('title')
      expect(item).toHaveProperty('link')
      expect(item).toHaveProperty('content')
      expect(item).toHaveProperty('sourceName')
      expect(item.sourceName).toBe(source.name)
    })
  })
})
