import { defineCommand } from 'citty'
import { writeFileSync } from 'node:fs'
import pLimit from 'p-limit'
import { loadConfig } from '../config/loader'
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

  const store = await initStore()
  try {
    // Determine lastRunTime: --since flag overrides DB value
    let lastRunTime: number | null
    if (options.since) {
      lastRunTime = parseSinceDuration(options.since)
    } else {
      lastRunTime = getLastRunTime(store)
    }

    // Step 1: Fetch all sources in parallel with concurrency cap
    const fetchLimit = pLimit(concurrency)
    const fetchResults = await Promise.all(
      config.sources.map((source) =>
        fetchLimit(() =>
          fetchSource(source, lastRunTime, maxItems, maxContentLength).catch(
            (err): { items: RawItem[]; errors: MarkdownFetchError[] } => {
              // Catch unexpected errors per-source so others can continue
              const message = err instanceof Error ? err.message : String(err)
              return {
                items: [],
                errors: [{ sourceName: source.name, url: source.url, error: message }],
              }
            },
          ),
        ),
      ),
    )

    // Collect all items and errors
    const allItems: RawItem[] = []
    const allErrors: MarkdownFetchError[] = []
    for (const result of fetchResults) {
      allItems.push(...result.items)
      allErrors.push(...result.errors)
    }

    // Step 2: Filter already-seen items
    const newItems = allItems.filter((item) => !isSeen(store, item.id))

    // Step 3: Summarize new items via LLM
    const llmClient = createLLMClient(config.llm)
    const summarizeLimit = pLimit(concurrency)
    const summaryResults = await Promise.all(
      newItems.map((item) =>
        summarizeLimit(() =>
          summarizeItem(llmClient, config.llm.model, item.content, item.sourceName),
        ),
      ),
    )

    // Build digest items from successful summaries
    const digestItems: DigestItem[] = []
    for (let i = 0; i < newItems.length; i++) {
      const summary = summaryResults[i]
      if (summary !== null) {
        digestItems.push({
          title: summary.title,
          link: newItems[i].link,
          sourceName: newItems[i].sourceName,
          summary: summary.summary,
          importance: summary.importance,
        })
      }
    }

    // Step 4: Format markdown digest
    const markdown = formatDigest(digestItems, allErrors.length > 0 ? allErrors : undefined)

    // Step 5: Output
    let output: string
    if (options.output) {
      writeFileSync(options.output, markdown, 'utf-8')
      output = `Digest written to ${options.output}`
    } else {
      output = markdown
    }

    // Step 6: Update DB state — mark all processed items as seen
    for (const item of newItems) {
      markSeen(store, item.id, item.sourceName, item.title)
    }

    // Set lastRunTime to now
    setLastRunTime(store, Date.now())

    // Save store
    store.save()

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
    const configPath =
      args.config ||
      (() => {
        // Lazy import to avoid requiring env-paths at module load
        const { getDefaultConfigPath } = require('../config/loader')
        return getDefaultConfigPath()
      })()

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
