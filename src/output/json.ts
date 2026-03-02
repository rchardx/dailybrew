import type { DigestItem, FetchError } from './markdown.js'

/**
 * Format a digest of items into pretty-printed JSON output.
 * Sorts by importance (5→1), same as markdown formatter.
 */
export function formatDigestJson(items: DigestItem[], errors?: FetchError[]): string {
  const today = new Date().toISOString().split('T')[0]

  // Sort items by importance descending (5 → 1)
  const sortedItems = [...items].sort((a, b) => b.importance - a.importance)

  const output: {
    date: string
    items: DigestItem[]
    errors: FetchError[]
  } = {
    date: today,
    items: sortedItems,
    errors: errors ?? [],
  }

  return JSON.stringify(output, null, 2)
}
