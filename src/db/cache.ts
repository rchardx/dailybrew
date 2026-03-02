import type { Store } from './store.js'
import type { SummaryResult } from '../llm/schemas.js'

/**
 * Look up a cached summary by content hash and model.
 * Returns null if no cache entry exists.
 */
export function getCachedSummary(
  store: Store,
  contentHash: string,
  model: string,
): SummaryResult | null {
  const result = store.db.exec(
    `SELECT title, summary, importance FROM summary_cache WHERE content_hash = ? AND model = ?`,
    [contentHash, model],
  )

  if (result.length === 0 || result[0].values.length === 0) {
    return null
  }

  const [title, summary, importance] = result[0].values[0]
  return {
    title: title as string,
    summary: summary as string,
    importance: importance as 1 | 2 | 3 | 4 | 5,
  }
}

/**
 * Store a summary in the cache.
 */
export function cacheSummary(
  store: Store,
  contentHash: string,
  model: string,
  result: SummaryResult,
): void {
  store.db.run(
    `INSERT OR REPLACE INTO summary_cache (content_hash, title, summary, importance, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contentHash, result.title, result.summary, result.importance, model, Date.now()],
  )
}

/**
 * Remove cached summaries older than retentionDays.
 * Returns the number of pruned rows.
 */
export function pruneSummaryCache(store: Store, retentionDays = 30): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  store.db.run(`DELETE FROM summary_cache WHERE created_at < ?`, [cutoff])
  const result = store.db.exec(`SELECT changes()`)
  if (result.length === 0 || result[0].values.length === 0) {
    return 0
  }
  return Number(result[0].values[0][0])
}
