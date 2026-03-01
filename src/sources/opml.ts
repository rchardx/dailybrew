import * as cheerio from 'cheerio'
import type { Source } from '../config/schema.js'

/**
 * Parse an OPML XML string and extract RSS sources.
 * Handles nested outline elements (folders) and deduplicates by URL.
 */
export function parseOpml(xmlContent: string): Source[] {
  const $ = cheerio.load(xmlContent, { xml: true })
  const sources: Source[] = []
  const seenUrls = new Set<string>()

  $('outline[type="rss"]').each((_index, element) => {
    const xmlUrl = $(element).attr('xmlUrl') || $(element).attr('xmlurl')
    if (!xmlUrl) return

    if (seenUrls.has(xmlUrl)) return
    seenUrls.add(xmlUrl)

    const text = $(element).attr('text') || $(element).attr('title')
    let name = text?.trim()

    if (!name) {
      try {
        name = new URL(xmlUrl).hostname
      } catch {
        name = xmlUrl
      }
    }

    sources.push({
      name,
      url: xmlUrl,
      type: 'rss',
    })
  })

  return sources
}
