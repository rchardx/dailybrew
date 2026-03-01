import * as cheerio from 'cheerio'
import type { Source } from '../config/schema.js'
import { hashUrl, resolveUrl } from '../utils/url.js'

/**
 * Result type for web page fetching
 */
export interface RawItem {
  id: string
  title: string
  link: string
  content: string
  sourceName: string
  pubDate?: number
}

export interface FetchError {
  sourceName: string
  url: string
  error: string
}

export interface FeedResult {
  items: RawItem[]
  errors: FetchError[]
}

const USER_AGENT = 'dailybrew/1.0 (+https://github.com/rchardx/dailybrew)'
const FETCH_TIMEOUT = 10000 // 10 seconds

/**
 * Fetch a web page and extract articles using CSS selectors
 */
export async function fetchWebPage(
  source: Source,
  _lastRunTime: number | null,
  maxItems: number,
  maxContentLength: number,
): Promise<FeedResult> {
  const items: RawItem[] = []
  const errors: FetchError[] = []

  try {
    // Fetch the main page
    const html = await fetchWithTimeout(source.url, FETCH_TIMEOUT)
    const $ = cheerio.load(html)

    // Extract links using the CSS selector
    const links: Array<{ href: string; title: string }> = []

    if (source.selector) {
      $(source.selector).each((_index, element) => {
        const href = $(element).attr('href')
        const title = $(element).text().trim()

        if (href && title) {
          links.push({ href, title })
        }
      })
    }

    // Limit to maxItems
    const linksToFetch = links.slice(0, maxItems)

    // Fetch content for each link
    for (const link of linksToFetch) {
      try {
        const articleUrl = resolveUrl(link.href, source.url)
        const articleHtml = await fetchWithTimeout(articleUrl, FETCH_TIMEOUT)
        const $article = cheerio.load(articleHtml)

        // Extract content with noise removal
        const content = extractContent($article, maxContentLength)

        if (content) {
          const id = hashUrl(articleUrl)
          items.push({
            id,
            title: link.title,
            link: articleUrl,
            content,
            sourceName: source.name,
            pubDate: Date.now(),
          })
        }
      } catch (error) {
        // Log error but continue with other items
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push({
          sourceName: source.name,
          url: source.url,
          error: `Failed to fetch article: ${errorMsg}`,
        })
      }
    }

    return { items, errors }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      items: [],
      errors: [
        {
          sourceName: source.name,
          url: source.url,
          error: errorMsg,
        },
      ],
    }
  }
}

/**
 * Fetch URL with timeout
 */
async function fetchWithTimeout(url: string, timeout: number): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Extract text content from article page
 * Removes noise (script, style, nav, footer, header, aside)
 * Looks for content in: article, main, .content, #content, .post, .entry
 * Falls back to body
 */
function extractContent($: cheerio.CheerioAPI, maxLength: number): string {
  // Remove noise elements
  $('script, style, nav, footer, header, aside').remove()

  // Try to extract from semantic elements
  const selectors = ['article', 'main', '.content', '#content', '.post', '.entry']

  for (const selector of selectors) {
    const element = $(selector).first()
    if (element.length > 0) {
      const text = element.text().trim()
      if (text) {
        return truncateContent(text, maxLength)
      }
    }
  }

  // Fall back to body
  const bodyText = $('body').text().trim()
  return truncateContent(bodyText, maxLength)
}

/**
 * Truncate content to max length
 */
function truncateContent(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength)
}
