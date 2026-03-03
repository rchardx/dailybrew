import * as cheerio from 'cheerio'
import { resolveUrl } from '../utils/url'

const COMMON_FEED_PATHS = ['/feed', '/rss', '/atom.xml', '/index.xml']
const DEFAULT_FETCH_TIMEOUT_MS = 20000 // 20 seconds

/**
 * Auto-detect a feed URL from a given web page URL.
 * 1. Fetch the page and look for <link rel="alternate" type="application/rss+xml">
 * 2. If not found, try common feed paths
 * 3. Return the first successful feed URL or null
 */
export async function detectFeedUrl(
  url: string,
  fetchTimeout: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  try {
    // First, try to detect from HTML link tags
    const feedUrl = await detectFromHtml(url, fetchTimeout)
    if (feedUrl) {
      return feedUrl
    }

    // If not found, try common paths
    for (const path of COMMON_FEED_PATHS) {
      const candidateUrl = new URL(path, url).href
      if (await isFeedUrl(candidateUrl, fetchTimeout)) {
        return candidateUrl
      }
    }

    return null
  } catch (_error) {
    return null
  }
}

/**
 * Detect feed URL from HTML content by looking for <link rel="alternate"> tags
 */
async function detectFromHtml(url: string, fetchTimeout: number): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), fetchTimeout)

    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Look for RSS feed link
    let feedLink = $('link[rel="alternate"][type="application/rss+xml"]').attr('href')
    if (!feedLink) {
      // Fallback to Atom feed
      feedLink = $('link[rel="alternate"][type="application/atom+xml"]').attr('href')
    }

    if (feedLink) {
      // Resolve relative URLs
      return resolveUrl(feedLink, url)
    }

    return null
  } catch (_error) {
    return null
  }
}

/**
 * Check if a URL returns valid feed content (RSS/Atom XML)
 */
async function isFeedUrl(url: string, fetchTimeout: number): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), fetchTimeout)

    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      return false
    }

    const contentType = response.headers.get('content-type') || ''

    // Check content-type header
    if (
      contentType.includes('application/rss+xml') ||
      contentType.includes('application/atom+xml') ||
      contentType.includes('application/xml') ||
      contentType.includes('text/xml')
    ) {
      return true
    }

    // Fallback: check if content looks like XML
    const content = await response.text()
    return (
      content.trim().startsWith('<?xml') ||
      content.trim().startsWith('<rss') ||
      content.trim().startsWith('<feed')
    )
  } catch (_error) {
    return false
  }
}
