import { defineCommand } from 'citty'
import { writeFileSync } from 'node:fs'
import pLimit from 'p-limit'
import { loadConfig } from '../config/loader'
import { ensureConfig, ensureAuth } from '../config/ensure'
import { initStore } from '../db/store'
import { isSeen, markSeen, getLastRunTime, setLastRunTime } from '../db/dedup'
import { fetchRssFeed } from '../sources/rss'
import { fetchWebPage } from '../sources/web'
import { createLLMClient } from '../llm/client'
import { summarizeItem } from '../llm/summarize'
import {
  formatDigest,
  type DigestItem,
  type FetchError as MarkdownFetchError,
} from '../output/markdown'
import type { Source } from '../config/schema'
import type { FetchError as RssFetchError } from '../sources/rss'
import { logger } from '../utils/logger'
import { createProgressBar } from '../utils/progress'

/**
 * Parse a human-readable duration string into a Unix timestamp (ms).
 * Supported formats: "2h" (hours), "1d" (days), "30m" (minutes).
 * Returns the timestamp representing "duration ago from now".
 */
export function parseSinceDuration(since: string): number {
  const match = since.match(/^(\d+)([mhd])$/)
  if (!match) {
    throw new Error(`Invalid --since format: "${since}". Use: 30m (minutes), 2h (hours), 1d (days)`)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const multipliers: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }

  return Date.now() - value * multipliers[unit]
}

/** Unified raw item type for the pipeline */
interface RawItem {
  id: string
  title: string
  link: string
  content: string
  sourceName: string
}

/** Normalize RSS FetchError to markdown FetchError format */
function normalizeRssError(err: RssFetchError, sourceUrl: string): MarkdownFetchError {
  return {
    sourceName: err.source,
    url: sourceUrl,
    error: err.message,
  }
}

/** Options for the brew pipeline */
export interface BrewOptions {
  configPath: string
  maxItems?: number
  output?: string
  since?: string
}

/**
 * Fetch items from a single source.
 * Routes to RSS or web fetcher based on source type.
 */
async function fetchSource(
  source: Source,
  lastRunTime: number | null,
  maxItems: number,
  maxContentLength: number,
): Promise<{ items: RawItem[]; errors: MarkdownFetchError[] }> {
  const items: RawItem[] = []
  const errors: MarkdownFetchError[] = []

  if (source.type === 'web') {
    const result = await fetchWebPage(source, lastRunTime, maxItems, maxContentLength)
    items.push(
      ...result.items.map((i) => ({
        id: i.id,
        title: i.title,
        link: i.link,
        content: i.content,
        sourceName: i.sourceName,
      })),
    )
    errors.push(...result.errors)
  } else {
    // Default to RSS
    const result = await fetchRssFeed(source, lastRunTime, maxItems)
    items.push(
      ...result.items.map((i) => ({
        id: i.id,
        title: i.title,
        link: i.link,
        content: i.content,
        sourceName: i.sourceName,
      })),
    )
    errors.push(...result.errors.map((e) => normalizeRssError(e, source.url)))
  }

  return { items, errors }
}

/**
 * Run the full brew pipeline.
 * Extracted as a testable function separate from the citty command definition.
 *
 * Pipeline:
 * 1. Load config
 * 2. Init SQLite store
 * 3. Get lastRunTime (or use --since override)
 * 4. Fetch sources (parallel, capped by concurrency)
 * 5. Filter via dedup
 * 6. Summarize via LLM (parallel, capped by concurrency)
 * 7. Format markdown digest
 * 8. Output to stdout or file
 * 9. Mark items as seen + update lastRunTime
 * 10. Save + close store
 */
export async function runBrewPipeline(options: BrewOptions): Promise<string> {
  const config = loadConfig(options.configPath)
  const maxItems = options.maxItems ?? config.options.maxItems
  const concurrency = config.options.concurrency
  const maxContentLength = config.options.maxContentLength

  logger.info(
    `Loaded ${config.sources.length} sources (maxItems=${maxItems}, concurrency=${concurrency})`,
  )

  const store = await initStore()
  try {
    // Determine lastRunTime: --since flag overrides DB value
    let lastRunTime: number | null
    if (options.since) {
      lastRunTime = parseSinceDuration(options.since)
    } else {
      lastRunTime = getLastRunTime(store)
    }

    // Default first run to 24h — never fetch the entire feed history
    if (lastRunTime === null) {
      lastRunTime = Date.now() - 24 * 60 * 60 * 1000
      logger.info('First run — fetching items from the last 24 hours')
    }

    // Step 1: Fetch all sources in parallel with concurrency cap
    const fetchBar = createProgressBar()
    fetchBar.start(config.sources.length, 0, { stage: 'Fetching' })
    const fetchLimit = pLimit(concurrency)
    const fetchResults = await Promise.all(
      config.sources.map((source) =>
        fetchLimit(async () => {
          const result = await fetchSource(source, lastRunTime, maxItems, maxContentLength).catch(
            (err): { items: RawItem[]; errors: MarkdownFetchError[] } => {
              const message = err instanceof Error ? err.message : String(err)
              return {
                items: [],
                errors: [{ sourceName: source.name, url: source.url, error: message }],
              }
            },
          )
          fetchBar.increment(1, { stage: `Fetching — ${source.name}` })
          return result
        }),
      ),
    )
    fetchBar.stop()

    // Collect all items and errors
    const allItems: RawItem[] = []
    const allErrors: MarkdownFetchError[] = []
    for (const result of fetchResults) {
      allItems.push(...result.items)
      allErrors.push(...result.errors)
    }

    // Log each error individually so the user knows what broke and why
    for (const err of allErrors) {
      logger.fail(`${err.sourceName}: ${err.error} (${err.url})`)
    }

    const errorSuffix = allErrors.length > 0 ? ` (${allErrors.length} errors)` : ''
    logger.success(
      `Fetched ${allItems.length} items from ${config.sources.length} sources${errorSuffix}`,
    )
    // Step 2: Filter already-seen items
    const newItems = allItems.filter((item) => !isSeen(store, item.id))
    const skippedCount = allItems.length - newItems.length
    if (skippedCount > 0) {
      logger.info(`${newItems.length} new items (${skippedCount} already seen)`)
    } else {
      logger.info(`${newItems.length} new items`)
    }

    // Step 2b: Filter items with empty content (no point sending to LLM)
    const contentItems = newItems.filter((item) => item.content.trim().length > 0)
    const emptyCount = newItems.length - contentItems.length
    if (emptyCount > 0) {
      logger.info(`Skipped ${emptyCount} items with no content`)
    }
    // Step 3: Summarize new items via LLM
    if (contentItems.length === 0) {
      logger.info('Nothing to summarize')
    }
    const llmClient = createLLMClient(config.llm)
    const summarizeLimit = pLimit(concurrency)

    // Progress bar for summarization
    let summarizeBar: ReturnType<typeof createProgressBar> | null = null
    if (contentItems.length > 0) {
      summarizeBar = createProgressBar()
      summarizeBar.start(contentItems.length, 0, { stage: `Summarizing (${config.llm.model})` })
    }

    const summaryResults = await Promise.all(
      contentItems.map((item) =>
        summarizeLimit(async () => {
          const result = await summarizeItem(
            llmClient,
            config.llm.model,
            item.content,
            item.sourceName,
          )
          summarizeBar?.increment(1, { stage: `Summarizing — ${item.sourceName}` })
          return result
        }),
      ),
    )
    summarizeBar?.stop()

    // Build digest items from successful summaries
    const digestItems: DigestItem[] = []
    for (let i = 0; i < contentItems.length; i++) {
      const summary = summaryResults[i]
      if (summary !== null) {
        digestItems.push({
          title: summary.title,
          link: contentItems[i].link,
          sourceName: contentItems[i].sourceName,
          summary: summary.summary,
          importance: summary.importance,
        })
      }
    }

    if (contentItems.length > 0) {
      const failedCount = contentItems.length - digestItems.length
      const failSuffix = failedCount > 0 ? ` (${failedCount} failed)` : ''
      logger.success(`Summarized ${digestItems.length} items${failSuffix}`)
    }

    // Step 4: Format markdown digest
    const markdown = formatDigest(digestItems, allErrors.length > 0 ? allErrors : undefined)

    // Step 5: Output
    let output: string
    if (options.output) {
      writeFileSync(options.output, markdown, 'utf-8')
      logger.success(`Digest written to ${options.output}`)
      output = `Digest written to ${options.output}`
    } else {
      output = markdown
    }

    // Step 6: Update DB state — mark all processed items as seen
    logger.start('Saving to database...')
    for (const item of newItems) {
      markSeen(store, item.id, item.sourceName, item.title)
    }

    // Set lastRunTime to now
    setLastRunTime(store, Date.now())

    // Save store
    store.save()
    logger.success('Database updated')
    return output
  } finally {
    await store.close()
  }
}

/**
 * Citty command definition for `brew`
 */
export default defineCommand({
  meta: {
    name: 'brew',
    description: 'Fetch sources, summarize with LLM, and output markdown digest',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file (default: ~/.config/dailybrew/config.yaml)',
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Write digest to file instead of stdout',
    },
    'max-items': {
      type: 'string',
      description: 'Override max items per source',
    },
    since: {
      type: 'string',
      description: 'Override last run time (e.g., 2h, 1d, 30m)',
    },
  },
  async run({ args }) {
    const configPath = ensureConfig(args.config)

    // Auto-prompt for LLM auth if not configured
    const authOk = await ensureAuth(configPath)
    if (!authOk) {
      logger.warn('LLM auth setup cancelled. Cannot brew without LLM configuration.')
      return
    }

    const brewOptions: BrewOptions = {
      configPath,
      maxItems: args['max-items'] ? parseInt(args['max-items'], 10) : undefined,
      output: args.output,
      since: args.since,
    }

    const result = await runBrewPipeline(brewOptions)
    if (!args.output) {
      logger.log(result)
    }
  },
})
