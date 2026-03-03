import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchWebhooks } from '../../src/webhooks/index'
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

const mockFetch = vi.fn()

beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = mockFetch
})

const sampleItems: DigestItem[] = [
  {
    title: 'Test Article',
    link: 'https://example.com/1',
    sourceName: 'Source',
    summary: 'Summary',
    importance: 3,
  },
]

const sampleErrors: FetchError[] = [
  { sourceName: 'Broken', url: 'https://broken.com', error: 'Timeout' },
]

describe('Webhook Dispatcher', () => {
  it('should return empty array when no webhooks provided', async () => {
    const results = await dispatchWebhooks([], sampleItems)
    expect(results).toEqual([])
  })

  it('should skip disabled webhooks', async () => {
    const webhooks: Webhook[] = [
      {
        type: 'feishu',
        name: 'disabled-bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
        enabled: false,
      },
    ]

    const results = await dispatchWebhooks(webhooks, sampleItems)
    expect(results).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should dispatch to enabled feishu webhook', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
    )

    const webhooks: Webhook[] = [
      {
        type: 'feishu',
        name: 'team-bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
        enabled: true,
      },
    ]

    const results = await dispatchWebhooks(webhooks, sampleItems, sampleErrors)
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].name).toBe('team-bot')
    expect(results[0].type).toBe('feishu')
  })

  it('should dispatch to multiple webhooks in parallel', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
      )

    const webhooks: Webhook[] = [
      {
        type: 'feishu',
        name: 'bot-1',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/id1',
        enabled: true,
      },
      {
        type: 'feishu',
        name: 'bot-2',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/id2',
        enabled: true,
      },
    ]

    const results = await dispatchWebhooks(webhooks, sampleItems)
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.success)).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('should handle mixed success and failure', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error('Network error'))

    const webhooks: Webhook[] = [
      {
        type: 'feishu',
        name: 'ok-bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/ok',
        enabled: true,
      },
      {
        type: 'feishu',
        name: 'fail-bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/fail',
        enabled: true,
      },
    ]

    const results = await dispatchWebhooks(webhooks, sampleItems)
    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(false)
  })

  it('should pass errors to the card formatter', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ StatusCode: 0, msg: 'success' }), { status: 200 }),
    )

    const webhooks: Webhook[] = [
      {
        type: 'feishu',
        name: 'bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
        enabled: true,
      },
    ]

    await dispatchWebhooks(webhooks, sampleItems, sampleErrors)

    // Verify the card body contains error info
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    const allContent = callBody.card.body.elements
      .filter((e: Record<string, unknown>) => e.tag === 'markdown')
      .map((e: Record<string, unknown>) => e.content)
      .join('\n')

    expect(allContent).toContain('Fetch Errors')
    expect(allContent).toContain('Broken')
  })
})

it('should handle unknown webhook type gracefully', async () => {
  const webhooks = [
    {
      type: 'slack' as any,
      name: 'unknown-bot',
      url: 'https://example.com/hook',
      enabled: true,
    },
  ] as Webhook[]

  const results = await dispatchWebhooks(webhooks, sampleItems)
  expect(results).toHaveLength(1)
  expect(results[0].success).toBe(false)
  expect(results[0].type).toBe('slack')
  expect(results[0].name).toBe('unknown-bot')
  expect(mockFetch).not.toHaveBeenCalled()
})
