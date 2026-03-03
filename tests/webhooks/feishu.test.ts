import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatFeishuCard, sendFeishuWebhook } from '../../src/webhooks/feishu'
import type { DigestItem, FetchError } from '../../src/output/markdown'
import type { Webhook } from '../../src/config/schema'

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    start: vi.fn(),
    fail: vi.fn(),
    log: vi.fn(),
  },
}))

describe('Feishu Card Formatter', () => {
  const sampleItems: DigestItem[] = [
    {
      title: 'Critical Article',
      link: 'https://example.com/1',
      sourceName: 'TechCrunch',
      summary: 'Critical news about tech.',
      importance: 5,
    },
    {
      title: 'High Priority Post',
      link: 'https://example.com/2',
      sourceName: 'Hacker News',
      summary: 'Important HN discussion.',
      importance: 4,
    },
    {
      title: 'Normal Item',
      link: 'https://example.com/3',
      sourceName: 'Medium',
      summary: 'A regular post.',
      importance: 2,
    },
  ]

  describe('formatFeishuCard', () => {
    it('should return a valid card JSON v2 structure with schema 2.0', () => {
      const card = formatFeishuCard(sampleItems)
      expect(card.schema).toBe('2.0')
      expect(card.header).toBeDefined()
      expect(card.body).toBeDefined()
    })

    it('should include date in header title', () => {
      const card = formatFeishuCard(sampleItems)
      const header = card.header as Record<string, any>
      expect(header.title.content).toMatch(/Daily Digest — \d{4}-\d{2}-\d{2}/)
    })

    it('should include item count in subtitle', () => {
      const card = formatFeishuCard(sampleItems)
      const header = card.header as Record<string, any>
      expect(header.subtitle.content).toBe('3 items')
    })

    it('should create markdown elements grouped by importance', () => {
      const card = formatFeishuCard(sampleItems)
      const body = card.body as Record<string, any>
      const markdownElements = body.elements.filter(
        (e: Record<string, unknown>) => e.tag === 'markdown',
      )
      // 3 groups: Critical (5), High (4), Normal (2)
      expect(markdownElements.length).toBe(3)
    })

    it('should include hr dividers between groups', () => {
      const card = formatFeishuCard(sampleItems)
      const body = card.body as Record<string, any>
      const hrElements = body.elements.filter((e: Record<string, unknown>) => e.tag === 'hr')
      // 2 dividers between 3 groups
      expect(hrElements.length).toBe(2)
    })

    it('should contain article titles and links in markdown content', () => {
      const card = formatFeishuCard(sampleItems)
      const body = card.body as Record<string, any>
      const allContent = body.elements
        .filter((e: Record<string, unknown>) => e.tag === 'markdown')
        .map((e: Record<string, unknown>) => e.content)
        .join('\n')

      expect(allContent).toContain('[Critical Article](https://example.com/1)')
      expect(allContent).toContain('**Source**: TechCrunch')
      expect(allContent).toContain('Critical news about tech.')
    })

    it('should sort items by importance descending', () => {
      const card = formatFeishuCard(sampleItems)
      const body = card.body as Record<string, any>
      const markdownElements = body.elements.filter(
        (e: Record<string, unknown>) => e.tag === 'markdown',
      )
      const contents = markdownElements.map((e: Record<string, unknown>) => e.content as string)

      // First group should be Critical (5), last should be Normal (2)
      expect(contents[0]).toContain('Critical (5/5)')
      expect(contents[contents.length - 1]).toContain('Normal (2/5)')
    })

    it('should return "No new content" card for empty items', () => {
      const card = formatFeishuCard([])
      const body = card.body as Record<string, any>
      expect(body.elements.length).toBe(1)
      expect(body.elements[0].content).toBe('No new content')
    })

    it('should include errors section when errors provided', () => {
      const errors: FetchError[] = [
        { sourceName: 'Broken Feed', url: 'https://broken.com/feed', error: 'Timeout' },
      ]
      const card = formatFeishuCard(sampleItems, errors)
      const body = card.body as Record<string, any>
      const allContent = body.elements
        .filter((e: Record<string, unknown>) => e.tag === 'markdown')
        .map((e: Record<string, unknown>) => e.content)
        .join('\n')

      expect(allContent).toContain('Fetch Errors')
      expect(allContent).toContain('**Broken Feed**: Timeout')
    })

    it('should not include errors section when no errors provided', () => {
      const card = formatFeishuCard(sampleItems)
      const body = card.body as Record<string, any>
      const allContent = body.elements
        .filter((e: Record<string, unknown>) => e.tag === 'markdown')
        .map((e: Record<string, unknown>) => e.content)
        .join('\n')

      expect(allContent).not.toContain('Fetch Errors')
    })

    it('should escape angle brackets in markdown content', () => {
      const items: DigestItem[] = [
        {
          title: 'Title with <html> tags',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Content with <script>alert("xss")</script>',
          importance: 3,
        },
      ]
      const card = formatFeishuCard(items)
      const body = card.body as Record<string, any>
      const content = body.elements
        .filter((e: Record<string, unknown>) => e.tag === 'markdown')
        .map((e: Record<string, unknown>) => e.content)
        .join('\n')

      expect(content).not.toContain('<html>')
      expect(content).not.toContain('<script>')
      expect(content).toContain('&#60;html&#62;')
    })

    it('should set header tag color to red when highest importance >= 4', () => {
      const card = formatFeishuCard(sampleItems)
      const header = card.header as Record<string, any>
      expect(header.text_tag_list[0].color).toBe('red')
    })

    it('should set header tag color to orange when highest importance is 3', () => {
      const items: DigestItem[] = [
        {
          title: 'Important',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Test',
          importance: 3,
        },
      ]
      const card = formatFeishuCard(items)
      const header = card.header as Record<string, any>
      expect(header.text_tag_list[0].color).toBe('orange')
    })

    it('should set header tag color to blue for low importance items', () => {
      const items: DigestItem[] = [
        {
          title: 'Low',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Test',
          importance: 1,
        },
      ]
      const card = formatFeishuCard(items)
      const header = card.header as Record<string, any>
      expect(header.text_tag_list[0].color).toBe('blue')
    })

    it('should handle single item without dividers', () => {
      const items: DigestItem[] = [
        {
          title: 'Only Item',
          link: 'https://example.com/1',
          sourceName: 'Source',
          summary: 'Solo',
          importance: 3,
        },
      ]
      const card = formatFeishuCard(items)
      const body = card.body as Record<string, any>
      const hrElements = body.elements.filter((e: Record<string, unknown>) => e.tag === 'hr')
      expect(hrElements.length).toBe(0)
    })
  })
})

describe('Feishu Webhook Sender', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = mockFetch
  })

  const webhook: Webhook = {
    type: 'feishu',
    name: 'test-bot',
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-id',
    enabled: true,
  }

  const sampleCard = { schema: '2.0', header: {}, body: { elements: [] } }

  it('should send POST request with correct body structure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
    )

    await sendFeishuWebhook(webhook, sampleCard)

    expect(mockFetch).toHaveBeenCalledWith(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'interactive', card: sampleCard }),
    })
  })

  it('should return true on successful response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
    )

    const result = await sendFeishuWebhook(webhook, sampleCard)
    expect(result).toBe(true)
  })

  it('should return false on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const result = await sendFeishuWebhook(webhook, sampleCard)
    expect(result).toBe(false)
  })

  it('should return false when Feishu returns non-zero StatusCode', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ StatusCode: 1, msg: 'invalid token' }), { status: 200 }),
    )

    const result = await sendFeishuWebhook(webhook, sampleCard)
    expect(result).toBe(false)
  })

  it('should return false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

    const result = await sendFeishuWebhook(webhook, sampleCard)
    expect(result).toBe(false)
  })

  it('should handle non-JSON response body gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }))

    const result = await sendFeishuWebhook(webhook, sampleCard)
    // Non-JSON but 200 — json parse fails, result is null, treated as success (no StatusCode)
    expect(result).toBe(true)
  })

  it('should handle error response without msg field', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ StatusCode: 1 }), { status: 200 }),
    )

    const result = await sendFeishuWebhook(webhook, sampleCard)
    expect(result).toBe(false)
  })

  it('should handle non-Error rejection', async () => {
    mockFetch.mockRejectedValueOnce('string error')

    const result = await sendFeishuWebhook(webhook, sampleCard)
    expect(result).toBe(false)
  })
})
