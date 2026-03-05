import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

import { defineCommand } from 'citty'
import pLimit from 'p-limit'

import { loadConfig } from '../config/loader'
import { ensureConfig, ensureAuth } from '../config/ensure'
import { loadSources } from '../config/sources'
import { initStore } from '../db/store'
import { isSeen, markSeen, getLastRunTime, setLastRunTime, pruneSeen } from '../db/dedup'
import { getCachedSummary, cacheSummary, pruneSummaryCache } from '../db/cache'
import { fetchRssFeed } from '../sources/rss'
import { fetchWebPage } from '../sources/web'
import { createLLMClient } from '../llm/client'
import { summarizeItem } from '../llm/summarize'
import {
  formatDigest,
  type DigestItem,
  type FetchError as MarkdownFetchError,
} from '../output/markdown'
import { formatDigestJson } from '../output/json'
import { formatDigestHtml } from '../output/html'
import type { Source } from '../config/schema'
import type { FetchError as RssFetchError } from '../sources/rss'
import { logger, setLogLevel } from '../utils/logger'
import { createProgressBar, truncateName } from '../utils/progress'
import { dispatchWebhooks } from '../webhooks/index'

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

/** Options for the run pipeline */
export interface RunOptions {
  configPath: string
  maxItems?: number
  output?: string
  since?: string
  format?: 'markdown' | 'json' | 'html'
  dryRun?: boolean
  verbose?: boolean
  quiet?: boolean
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
  fetchTimeout: number,
): Promise<{ items: RawItem[]; errors: MarkdownFetchError[] }> {
  const items: RawItem[] = []
  const errors: MarkdownFetchError[] = []

  if (source.type === 'web') {
    const result = await fetchWebPage(source, lastRunTime, maxItems, maxContentLength, fetchTimeout)
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
    const result = await fetchRssFeed(source, lastRunTime, maxItems, fetchTimeout)
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
 * Format the digest using the specified output format.
 */
function formatOutput(
  format: 'markdown' | 'json' | 'html',
  items: DigestItem[],
  errors?: MarkdownFetchError[],
): string {
  switch (format) {
    case 'json':
      return formatDigestJson(items, errors)
    case 'html':
      return formatDigestHtml(items, errors)
    default:
      return formatDigest(items, errors)
  }
}

/**
 * Run the full digest pipeline.
 * Extracted as a testable function separate from the citty command definition.
 *
 * Pipeline:
 * 1. Load config
 * 2. Init SQLite store
 * 3. Get lastRunTime (or use --since override)
 * 4. Fetch sources (parallel, capped by concurrency)
 * 5. Filter via dedup
 * 6. Summarize via LLM (parallel, capped by concurrency) — with cache
 * 7. Format digest (markdown/json/html)
 * 7b. Dispatch to webhooks (if configured)
 * 8. Output to stdout or file
 * 9. Mark items as seen + update lastRunTime
 * 10. Save + close store
 */
export async function runPipeline(options: RunOptions): Promise<string> {
  // Apply log level early
  if (options.verbose) {
    setLogLevel(5)
  } else if (options.quiet) {
    setLogLevel(0)
  }

  const config = loadConfig(options.configPath)
  const sources = loadSources()
  const maxItems = options.maxItems ?? config.options.maxItems
  const concurrency = config.options.concurrency
  const maxContentLength = config.options.maxContentLength
  const fetchTimeout = config.options.fetchTimeout
  const llmTimeout = config.options.llmTimeout
  const format = options.format ?? 'markdown'

  logger.info(`Loaded ${sources.length} sources (maxItems=${maxItems}, concurrency=${concurrency})`)

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
    fetchBar.start(sources.length, 0, { stage: 'Fetching' })
    const fetchLimit = pLimit(concurrency)
    const fetchResults = await Promise.all(
      sources.map((source) =>
        fetchLimit(async () => {
          const result = await fetchSource(
            source,
            lastRunTime,
            maxItems,
            maxContentLength,
            fetchTimeout,
          ).catch((err): { items: RawItem[]; errors: MarkdownFetchError[] } => {
            const message = err instanceof Error ? err.message : String(err)
            return {
              items: [],
              errors: [{ sourceName: source.name, url: source.url, error: message }],
            }
          })
          fetchBar.increment(1, { stage: `Fetching — ${truncateName(source.name)}` })
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
    logger.success(`Fetched ${allItems.length} items from ${sources.length} sources${errorSuffix}`)
    // Step 2: Filter already-seen items
    const newItems = allItems.filter((item) => !isSeen(store, item.id))
    const skippedCount = allItems.length - newItems.length
    if (skippedCount > 0) {
      logger.info(`${newItems.length} new items (${skippedCount} already seen)`)
    } else {
      logger.info(`${newItems.length} new items`)
    }

    // Dry-run mode: output summary and skip LLM + DB updates
    if (options.dryRun) {
      const contentItems = newItems.filter((item) => item.content.trim().length > 0)
      const summary = [
        `Dry run summary:`,
        `  Sources fetched: ${sources.length}`,
        `  Items found: ${allItems.length}`,
        `  New items: ${newItems.length}`,
        `  Items with content: ${contentItems.length}`,
        `  Errors: ${allErrors.length}`,
      ].join('\n')
      logger.info(summary)
      // Still save store (to persist any schema changes) but do NOT update seen/lastRunTime
      store.save()
      return summary
    }

    // Step 2b: Filter items with empty content (no point sending to LLM)
    const contentItems = newItems.filter((item) => item.content.trim().length > 0)
    const emptyCount = newItems.length - contentItems.length
    if (emptyCount > 0) {
      logger.info(`Skipped ${emptyCount} items with no content`)
    }
    // Step 3: Summarize new items via LLM (with caching)
    if (contentItems.length === 0) {
      logger.info('Nothing to summarize')
    }
    const llmClient = createLLMClient(config.llm, llmTimeout)
    const model = config.llm.model
    const summarizeLimit = pLimit(concurrency)

    // Progress bar for summarization
    let summarizeBar: ReturnType<typeof createProgressBar> | null = null
    if (contentItems.length > 0) {
      summarizeBar = createProgressBar()
      summarizeBar.start(contentItems.length, 0, { stage: `Summarizing (${model})` })
    }

    const summaryResults = await Promise.all(
      contentItems.map((item) =>
        summarizeLimit(async () => {
          // Check summary cache first
          const contentHash = createHash('sha256').update(item.content).digest('hex')
          const cached = getCachedSummary(store, contentHash, model)
          if (cached) {
            logger.info(`Cache hit for "${truncateName(item.title)}"`)
            summarizeBar?.increment(1, {
              stage: `Summarizing — ${truncateName(item.sourceName)} (cached)`,
            })
            return cached
          }

          const result = await summarizeItem(llmClient, model, item.content, item.sourceName)

          // Cache successful results
          if (result !== null) {
            cacheSummary(store, contentHash, model, result)
          }

          summarizeBar?.increment(1, { stage: `Summarizing — ${truncateName(item.sourceName)}` })
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

    // Step 4: Format digest in requested format
    const formatted = formatOutput(
      format,
      digestItems,
      allErrors.length > 0 ? allErrors : undefined,
    )

    // Step 4b: Dispatch to webhooks (if configured)
    const webhooks = config.webhooks ?? []
    if (webhooks.length > 0) {
      await dispatchWebhooks(webhooks, digestItems, allErrors.length > 0 ? allErrors : undefined)
    }

    // Step 5: Output
    let output: string
    if (options.output) {
      writeFileSync(options.output, formatted, 'utf-8')
      logger.success(`Digest written to ${options.output}`)
      output = `Digest written to ${options.output}`
    } else {
      output = formatted
    }

    // Step 6: Update DB state — mark all processed items as seen
    logger.start('Saving to database...')
    for (const item of newItems) {
      markSeen(store, item.id, item.sourceName, item.title)
    }

    // Set lastRunTime to now
    setLastRunTime(store, Date.now())

    // Prune old seen items (>14 days)
    const pruned = pruneSeen(store)
    if (pruned > 0) {
      logger.info(`Pruned ${pruned} seen items older than 14 days`)
    }

    // Prune old cached summaries (>30 days)
    const prunedCache = pruneSummaryCache(store)
    if (prunedCache > 0) {
      logger.info(`Pruned ${prunedCache} cached summaries older than 30 days`)
    }

    // Save store
    store.save()
    logger.success('Database updated')
    return output
  } finally {
    await store.close()
  }
}

/**
 * Citty command definition for `run`
 */
export default defineCommand({
  meta: {
    name: 'run',
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
    format: {
      type: 'string',
      description: 'Output format: markdown, json, html (default: markdown)',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Fetch and dedup only — skip LLM summarization and DB updates',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose logging (debug/trace level)',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress all output except errors',
    },
  },
  async run({ args }) {
    const configPath = ensureConfig(args.config)

    // Auto-prompt for LLM auth if not configured
    const authOk = await ensureAuth(configPath)
    if (!authOk) {
      logger.warn('LLM auth setup cancelled. Cannot run without LLM configuration.')
      return
    }

    const runOptions: RunOptions = {
      configPath,
      maxItems: args['max-items'] ? parseInt(args['max-items'], 10) : undefined,
      output: args.output,
      since: args.since,
      format: (args.format as RunOptions['format']) ?? undefined,
      dryRun: args['dry-run'] ?? undefined,
      verbose: args.verbose ?? undefined,
      quiet: args.quiet ?? undefined,
    }

    const result = await runPipeline(runOptions)
    if (!args.output) {
      // Write digest to stdout directly — not through logger (which goes to stderr)
      process.stdout.write(`${result}\n`)
    }
  },
})
