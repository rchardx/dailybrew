import { defineCommand } from 'citty'
import type { Source } from '../config/schema'
import { loadSources, saveSources, ensureSources } from '../config/sources'
import { detectFeedUrl } from '../sources/detect'
import { fetchRssFeed } from '../sources/rss'
import { fetchWebPage } from '../sources/web'
import { logger } from '../utils/logger'

export interface AddOptions {
  name?: string
  type?: 'rss' | 'web'
  selector?: string
}

async function listSources(): Promise<string> {
  ensureSources()
  const sources = loadSources()

  if (sources.length === 0) {
    return 'No sources configured.\n\nAdd one with: dailybrew list add <url>'
  }

  // Format sources as detailed list
  let output = 'Configured Sources:\n'
  output += `${'─'.repeat(72)}\n`

  for (const source of sources) {
    const name = source.name || 'Unnamed'
    const typeLabel =
      source.type === 'web' ? 'web    (scrape page via CSS selector)' : 'rss    (RSS/Atom feed)'
    output += `  ${name}\n`
    output += `    URL:      ${source.url}\n`
    output += `    Type:     ${typeLabel}\n`
    if (source.type === 'web' && source.selector) {
      output += `    Selector: ${source.selector}\n`
    }
    output += '\n'
  }

  output += `${'─'.repeat(72)}\n`
  output += `Total: ${sources.length} source(s)\n`

  return output
}

/**
 * Test-fetch a source to verify it's reachable and parseable.
 * Returns null on success, or an error message on failure.
 */
async function testFetchSource(source: Source): Promise<string | null> {
  try {
    if (source.type === 'web') {
      const result = await fetchWebPage(source, null, 1, 1024)
      if (result.errors.length > 0) {
        return result.errors[0].error
      }
      return null
    }

    // RSS
    const result = await fetchRssFeed(source, null, 1)
    if (result.errors.length > 0) {
      return result.errors[0].message
    }
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function addSource(url?: string, options?: AddOptions): Promise<string> {
  if (!url) {
    throw new Error('URL is required')
  }

  ensureSources()
  const sources = loadSources()

  // Check if URL already exists
  const exists = sources.some((s) => s.url === url)
  if (exists) {
    return `Source already exists: ${url}`
  }

  // Determine source type
  let sourceType = options?.type
  let resolvedUrl = url

  if (!sourceType) {
    if (options?.selector) {
      sourceType = 'web'
    } else {
      // Auto-detect: try to find an RSS feed
      logger.start('Detecting source type...')
      const feedUrl = await detectFeedUrl(url)
      if (feedUrl) {
        sourceType = 'rss'
        resolvedUrl = feedUrl
        if (feedUrl !== url) {
          logger.info(`Detected RSS feed: ${feedUrl}`)
        }
      } else {
        sourceType = 'rss'
      }
    }
  }

  // Create new source
  const newSource: Source = {
    name: options?.name || new URL(resolvedUrl).hostname,
    url: resolvedUrl,
    type: sourceType,
  }

  if (options?.selector) {
    newSource.selector = options.selector
  }

  // Test-fetch before saving
  logger.start(`Fetching ${newSource.name}...`)
  const fetchError = await testFetchSource(newSource)

  if (fetchError) {
    logger.fail(`Fetch failed: ${fetchError}`)
    return `Source not added — could not fetch ${resolvedUrl}\n  Error: ${fetchError}\n\nIf you want to add it anyway, check the URL and try again.`
  }

  logger.success(`Fetch OK`)

  // Save
  sources.push(newSource)
  saveSources(sources)

  return `Added source: ${newSource.name} (${resolvedUrl})`
}

async function removeSource(url?: string): Promise<string> {
  if (!url) {
    throw new Error('URL is required')
  }

  ensureSources()
  const sources = loadSources()

  if (sources.length === 0) {
    return 'No sources to remove.'
  }

  const filtered = sources.filter((s) => s.url !== url)

  if (filtered.length === sources.length) {
    return `Source not found: ${url}`
  }

  saveSources(filtered)

  return `Removed source: ${url}`
}

export { listSources, addSource, removeSource }

export default defineCommand({
  meta: {
    name: 'list',
    description: 'Manage sources (list, add <url>, remove <url>)',
  },
  args: {
    name: {
      type: 'string',
      description: 'Display name for the source (with add)',
      alias: 'n',
    },
    type: {
      type: 'string',
      description: 'Source type: rss or web (with add)',
      alias: 't',
    },
    selector: {
      type: 'string',
      description: 'CSS selector for web pages (with add, implies type=web)',
      alias: 's',
    },
  },
  async run({ args, rawArgs }) {
    // Parse action from rawArgs: list add <url> / list remove <url> / list
    const action = rawArgs[0]

    if (action === 'add') {
      const url = rawArgs[1]
      if (!url || url.startsWith('-')) {
        logger.error(
          'Usage: dailybrew list add <url> [--name <name>] [--type rss|web] [--selector <css>]',
        )
        logger.log('')
        logger.log('Examples:')
        logger.log('  dailybrew list add https://hnrss.org/frontpage --name "Hacker News"')
        logger.log(
          '  dailybrew list add https://example.com/blog --type web --selector "article h2 > a"',
        )
        return
      }
      const result = await addSource(url, {
        name: args.name,
        type: args.type as 'rss' | 'web' | undefined,
        selector: args.selector,
      })
      logger.log(result)
      return
    }

    if (action === 'remove') {
      const url = rawArgs[1]
      if (!url || url.startsWith('-')) {
        logger.error('Usage: dailybrew list remove <url>')
        return
      }
      const result = await removeSource(url)
      logger.log(result)
      return
    }

    // Default: list sources
    const result = await listSources()
    logger.log(result)
  },
})
