import { describe, it, expect } from 'vitest'
import { parseOpml } from '../../src/sources/opml'

describe('parseOpml', () => {
  describe('basic parsing', () => {
    it('should extract RSS sources from OPML XML', () => {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Hacker News" xmlUrl="https://hnrss.org/frontpage" />
    <outline type="rss" text="TechCrunch" xmlUrl="https://techcrunch.com/feed/" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(2)
      expect(sources[0]).toMatchObject({
        name: 'Hacker News',
        url: 'https://hnrss.org/frontpage',
        type: 'rss',
      })
      expect(sources[1]).toMatchObject({
        name: 'TechCrunch',
        url: 'https://techcrunch.com/feed/',
        type: 'rss',
      })
    })

    it('should use title attribute when text is missing', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" title="My Blog" xmlUrl="https://blog.example.com/feed" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('My Blog')
    })

    it('should use hostname when both text and title are missing', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" xmlUrl="https://blog.example.com/feed" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('blog.example.com')
    })

    it('should fallback to raw URL as name when URL parsing fails', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" xmlUrl="not-a-valid-url" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('not-a-valid-url')
    })
  })

  describe('nested folders', () => {
    it('should extract sources from nested outline folders', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline type="rss" text="Ars Technica" xmlUrl="https://arstechnica.com/feed/" />
      <outline text="Programming">
        <outline type="rss" text="Go Blog" xmlUrl="https://go.dev/blog/feed.atom" />
      </outline>
    </outline>
    <outline text="News">
      <outline type="rss" text="BBC" xmlUrl="https://bbc.co.uk/news/rss.xml" />
    </outline>
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(3)
      expect(sources.map((s) => s.name)).toEqual(['Ars Technica', 'Go Blog', 'BBC'])
    })
  })

  describe('deduplication', () => {
    it('should deduplicate sources with the same URL', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="HN" xmlUrl="https://hnrss.org/frontpage" />
    <outline type="rss" text="Hacker News" xmlUrl="https://hnrss.org/frontpage" />
    <outline type="rss" text="HN Feed" xmlUrl="https://hnrss.org/frontpage" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('HN')
    })
  })

  describe('edge cases', () => {
    it('should skip outlines without xmlUrl', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="No URL" />
    <outline type="rss" text="Has URL" xmlUrl="https://example.com/feed" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('Has URL')
    })

    it('should handle lowercase xmlurl attribute', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Feed" xmlurl="https://example.com/feed" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].url).toBe('https://example.com/feed')
    })

    it('should return empty array for OPML with no rss outlines', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Folder" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(0)
    })

    it('should return empty array for empty body', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body></body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(0)
    })

    it('should trim whitespace from text attribute', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="  Spaced Name  " xmlUrl="https://example.com/feed" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('Spaced Name')
    })

    it('should set all sources as type rss', () => {
      const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Feed 1" xmlUrl="https://a.com/feed" />
    <outline type="rss" text="Feed 2" xmlUrl="https://b.com/feed" />
  </body>
</opml>`

      const sources = parseOpml(opml)

      sources.forEach((s) => {
        expect(s.type).toBe('rss')
      })
    })
  })
})
