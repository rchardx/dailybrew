import type { Store } from './store.js'

/**
 * Mark an item as seen in the database.
 * Uses INSERT OR IGNORE to avoid duplicates.
 */
export function markSeen(store: Store, id: string, source: string, title: string): void {
  const now = Date.now()

  // Try to insert new record
  store.db.run(
    `INSERT OR IGNORE INTO seen_items (id, source, title, first_seen, last_seen) 
     VALUES (?, ?, ?, ?, ?)`,
    [id, source, title, now, now],
  )

  // Update last_seen if record already exists
  store.db.run(`UPDATE seen_items SET last_seen = ? WHERE id = ?`, [now, id])
}

/**
 * Check if an item has been seen before.
 */
export function isSeen(store: Store, id: string): boolean {
  const result = store.db.exec(`SELECT EXISTS(SELECT 1 FROM seen_items WHERE id = ?) AS found`, [
    id,
  ])

  if (result.length === 0 || result[0].values.length === 0) {
    return false
  }

  return result[0].values[0][0] === 1
}

/**
 * Get the timestamp of the last run.
 * Returns null if no previous run exists.
 */
export function getLastRunTime(store: Store): number | null {
  const result = store.db.exec(`SELECT value FROM meta WHERE key = 'last_run_time'`)

  if (result.length === 0 || result[0].values.length === 0) {
    return null
  }

  const value = result[0].values[0][0]
  return typeof value === 'number' ? value : parseInt(value as string, 10)
}

/**
 * Set the timestamp of the last run.
 * Upserts the value in the meta table.
 */
export function setLastRunTime(store: Store, timestamp: number): void {
  store.db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_run_time', ?)`, [
    timestamp.toString(),
  ])
}

/** Number of days to keep seen items before pruning. */
const RETENTION_DAYS = 14

/**
 * Remove seen items older than RETENTION_DAYS.
 * Returns the number of pruned rows.
 */
export function pruneSeen(store: Store): number {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  store.db.run(`DELETE FROM seen_items WHERE last_seen < ?`, [cutoff])
  const result = store.db.exec(`SELECT changes()`)
  if (result.length === 0 || result[0].values.length === 0) {
    return 0
  }
  return Number(result[0].values[0][0])
}
