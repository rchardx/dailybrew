import type { DigestItem, FetchError } from './markdown.js'

/**
 * Importance level metadata for HTML rendering.
 */
const IMPORTANCE_LEVELS: Record<number, { emoji: string; name: string; color: string }> = {
  5: { emoji: '🔴', name: 'Critical', color: '#dc2626' },
  4: { emoji: '🟠', name: 'High', color: '#ea580c' },
  3: { emoji: '🟡', name: 'Important', color: '#ca8a04' },
  2: { emoji: '🟢', name: 'Normal', color: '#16a34a' },
  1: { emoji: '⚪', name: 'Low', color: '#6b7280' },
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Group items by importance level.
 */
function groupByImportance(items: DigestItem[]): Record<number, DigestItem[]> {
  const grouped: Record<number, DigestItem[]> = { 5: [], 4: [], 3: [], 2: [], 1: [] }
  for (const item of items) {
    grouped[item.importance].push(item)
  }
  return grouped
}

/**
 * Format a digest of items into standalone HTML with inline CSS.
 * Sorts by importance (5→1), same structure as markdown formatter.
 */
export function formatDigestHtml(items: DigestItem[], errors?: FetchError[]): string {
  const today = new Date().toISOString().split('T')[0]

  // Sort items by importance descending (5 → 1)
  const sortedItems = [...items].sort((a, b) => b.importance - a.importance)
  const grouped = groupByImportance(sortedItems)

  let body = ''

  if (items.length === 0) {
    body = '<p>No new content</p>'
  } else {
    let isFirst = true
    for (const level of [5, 4, 3, 2, 1]) {
      if (!grouped[level] || grouped[level].length === 0) continue

      if (!isFirst) {
        body += '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">\n'
      }
      isFirst = false

      const { emoji, name, color } = IMPORTANCE_LEVELS[level]
      body += `<h2 style="color:${color};margin-bottom:12px;">${emoji} ${escapeHtml(name)} (${level}/5)</h2>\n`

      for (const item of grouped[level]) {
        body += '<div style="margin-bottom:20px;">\n'
        body += `  <h3 style="margin:0 0 4px 0;"><a href="${escapeHtml(item.link)}" style="color:#1d4ed8;text-decoration:none;">${escapeHtml(item.title)}</a></h3>\n`
        body += `  <blockquote style="margin:4px 0;padding:8px 12px;border-left:3px solid #d1d5db;color:#4b5563;">\n`
        body += `    <strong>Source</strong>: ${escapeHtml(item.sourceName)}<br>\n`
        body += `    ${escapeHtml(item.summary)}\n`
        body += '  </blockquote>\n'
        body += '</div>\n'
      }
    }
  }

  // Add errors section
  if (errors && errors.length > 0) {
    body += '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">\n'
    body += '<h2 style="color:#b45309;">⚠️ Fetch Errors</h2>\n'
    body += '<ul style="color:#991b1b;">\n'
    for (const error of errors) {
      body += `  <li><strong>${escapeHtml(error.sourceName)}</strong>: ${escapeHtml(error.error)} (${escapeHtml(error.url)})</li>\n`
    }
    body += '</ul>\n'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Digest — ${escapeHtml(today)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1f2937; line-height: 1.6; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Daily Digest — ${escapeHtml(today)}</h1>
${body}
</body>
</html>`
}
