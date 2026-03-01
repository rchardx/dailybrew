/**
 * Type definitions for markdown output formatter
 */
export interface DigestItem {
  title: string
  link: string
  sourceName: string
  summary: string
  importance: 1 | 2 | 3 | 4 | 5
}

export interface FetchError {
  sourceName: string
  url: string
  error: string
}

/**
 * Format a digest of items into markdown output
 * Sorts by importance (5→1), groups by level with emoji headers
 */
export function formatDigest(items: DigestItem[], errors?: FetchError[]): string {
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0]

  // If no items, return "No new content" message
  if (items.length === 0) {
    return `# Daily Digest — ${today}\n\nNo new content`
  }

  // Sort items by importance descending (5 → 1)
  const sortedItems = [...items].sort((a, b) => b.importance - a.importance)

  // Group items by importance level
  const groupedByImportance = groupByImportance(sortedItems)

  // Build markdown output
  let output = `# Daily Digest — ${today}\n\n`

  // Define importance levels with emoji and description
  const importanceLevels: Record<number, { emoji: string; name: string }> = {
    5: { emoji: '🔴', name: 'Critical' },
    4: { emoji: '🟠', name: 'High' },
    3: { emoji: '🟡', name: 'Important' },
    2: { emoji: '🟢', name: 'Normal' },
    1: { emoji: '⚪', name: 'Low' },
  }

  // Add sections for each importance level (in order 5→1)
  let isFirst = true
  for (const level of [5, 4, 3, 2, 1]) {
    if (!groupedByImportance[level] || groupedByImportance[level].length === 0) {
      continue
    }

    if (!isFirst) {
      output += '\n---\n\n'
    }
    isFirst = false

    const { emoji, name } = importanceLevels[level]
    output += `## ${emoji} ${name} (${level}/5)\n\n`

    // Add items in this group
    for (const item of groupedByImportance[level]) {
      output += `### [${item.title}](${item.link})\n`
      output += `> **Source**: ${item.sourceName}\n`
      output += `>\n`
      output += `> ${item.summary}\n\n`
    }
  }

  // Add fetch errors section if provided
  if (errors && errors.length > 0) {
    output += '---\n\n'
    output += '## ⚠️ Fetch Errors\n\n'
    for (const error of errors) {
      output += `- **${error.sourceName}**: ${error.error} (${error.url})\n`
    }
  }

  return output.trim()
}

/**
 * Group items by importance level
 */
function groupByImportance(items: DigestItem[]): Record<number, DigestItem[]> {
  const grouped: Record<number, DigestItem[]> = {
    5: [],
    4: [],
    3: [],
    2: [],
    1: [],
  }

  for (const item of items) {
    grouped[item.importance].push(item)
  }

  return grouped
}
