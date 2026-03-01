import Parser from 'rss-parser'
import { createHash } from 'node:crypto'
import type { Source } from '../config/schema'

export interface RawItem {
  id: string
  title: string
  link: string
  content: string
  sourceName: string
  pubDate?: string
}

export interface FetchError {
  source: string
  message: string
}

export interface FeedResult {
  items: RawItem[]
  errors: FetchError[]
}

const FETCH_TIMEOUT_MS = 10000 // 10 seconds
const USER_AGENT = 'dailybrew/1.0 (+https://github.com/rchardx/dailybrew)'

/**
 * Fetch and parse an RSS/Atom feed, with filtering by last run time and item limits.
 */
export async function fetchRssFeed(
  source: Source,
  lastRunTime: number | null,
  maxItems: number,
): Promise<FeedResult> {
  const items: RawItem[] = []
  const errors: FetchError[] = []

  try {
    // Fetch feed with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(source.url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      errors.push({
        source: source.name,
        message: `Failed to fetch feed: HTTP ${response.status}`,
      })
      return { items, errors }
    }

    const feedContent = await response.text()

    // Parse feed using rss-parser
    const parser = new Parser()
    let feed: Awaited<ReturnType<typeof parser.parseString>> | undefined
    try {
      feed = await parser.parseString(feedContent)
    } catch (parseError) {
      errors.push({
        source: source.name,
        message: `Failed to parse feed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      })
      return { items, errors }
    }

    // Process feed items
    if (feed.items && Array.isArray(feed.items)) {
      const _now = Date.now()

      for (const feedItem of feed.items) {
        // Filter by lastRunTime if provided
        if (lastRunTime !== null && feedItem.pubDate) {
          const itemTime = new Date(feedItem.pubDate).getTime()
          if (itemTime <= lastRunTime) {
            continue
          }
        }

        // Generate ID from guid or hash the link
        let id = feedItem.guid || ''
        if (!id && feedItem.link) {
          id = createHash('sha256').update(feedItem.link).digest('hex')
        }
        if (!id) {
          // Fallback: hash the title + pubDate
          id = createHash('sha256')
            .update(`${feedItem.title || ''}${feedItem.pubDate || ''}`)
            .digest('hex')
        }

        const item: RawItem = {
          id,
          title: feedItem.title || '(No title)',
          link: feedItem.link || '',
          content: feedItem.contentSnippet || feedItem.content || '',
          sourceName: source.name,
          pubDate: feedItem.pubDate,
        }

        items.push(item)
      }
    }

    // Sort by pubDate descending (most recent first) and limit to maxItems
    items.sort((a, b) => {
      const aTime = a.pubDate ? new Date(a.pubDate).getTime() : 0
      const bTime = b.pubDate ? new Date(b.pubDate).getTime() : 0
      return bTime - aTime
    })

    return {
      items: items.slice(0, maxItems),
      errors,
    }
  } catch (error) {
    // Handle network/timeout errors
    const message = error instanceof Error ? error.message : 'Unknown error'

    if (message.includes('abort')) {
      errors.push({
        source: source.name,
        message: 'Feed fetch timeout',
      })
    } else {
      errors.push({
        source: source.name,
        message: `Feed fetch error: ${message}`,
      })
    }

    return { items, errors }
  }
}
