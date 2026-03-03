import type { DigestItem, FetchError } from '../output/markdown.js'
import type { Webhook } from '../config/schema.js'
import { logger } from '../utils/logger.js'

/** Importance level metadata for Feishu card rendering */
const IMPORTANCE_LEVELS: Record<number, { emoji: string; name: string; color: string }> = {
  5: { emoji: '🔴', name: 'Critical', color: 'red' },
  4: { emoji: '🟠', name: 'High', color: 'orange' },
  3: { emoji: '🟡', name: 'Important', color: 'yellow' },
  2: { emoji: '🟢', name: 'Normal', color: 'green' },
  1: { emoji: '⚪', name: 'Low', color: 'grey' },
}

/** Feishu card header template colors matching importance */
const HEADER_TEMPLATE = 'blue'

/**
 * Escape special characters for Feishu card markdown.
 * Feishu uses a subset of markdown — angle brackets need HTML entity escaping.
 */
function escapeFeishuMarkdown(text: string): string {
  return text.replace(/</g, '&#60;').replace(/>/g, '&#62;')
}

/** Group items by importance level */
function groupByImportance(items: DigestItem[]): Record<number, DigestItem[]> {
  const grouped: Record<number, DigestItem[]> = { 5: [], 4: [], 3: [], 2: [], 1: [] }
  for (const item of items) {
    grouped[item.importance].push(item)
  }
  return grouped
}

/**
 * Build a single Feishu card markdown element (one importance group).
 */
function buildGroupMarkdown(level: number, items: DigestItem[]): string {
  const { emoji, name } = IMPORTANCE_LEVELS[level]
  let md = `**${emoji} ${name} (${level}/5)**\n`

  for (const item of items) {
    const title = escapeFeishuMarkdown(item.title)
    const source = escapeFeishuMarkdown(item.sourceName)
    const summary = escapeFeishuMarkdown(item.summary)
    md += `\n[${title}](${item.link})\n`
    md += `**Source**: ${source}\n`
    md += `${summary}\n`
  }

  return md
}

/**
 * Build the errors section markdown for Feishu card.
 */
function buildErrorsMarkdown(errors: FetchError[]): string {
  let md = '**⚠️ Fetch Errors**\n'
  for (const error of errors) {
    const name = escapeFeishuMarkdown(error.sourceName)
    const msg = escapeFeishuMarkdown(error.error)
    md += `- **${name}**: ${msg}\n`
  }
  return md
}

/**
 * Format DigestItem[] + FetchError[] into a Feishu Card JSON v2 object.
 * Returns the card body (not the webhook wrapper).
 */
export function formatFeishuCard(
  items: DigestItem[],
  errors?: FetchError[],
): Record<string, unknown> {
  const today = new Date().toISOString().split('T')[0]
  const sortedItems = [...items].sort((a, b) => b.importance - a.importance)
  const grouped = groupByImportance(sortedItems)

  const elements: Record<string, unknown>[] = []

  if (items.length === 0) {
    elements.push({
      tag: 'markdown',
      content: 'No new content',
    })
  } else {
    let isFirst = true
    for (const level of [5, 4, 3, 2, 1]) {
      if (!grouped[level] || grouped[level].length === 0) continue

      if (!isFirst) {
        elements.push({ tag: 'hr' })
      }
      isFirst = false

      elements.push({
        tag: 'markdown',
        content: buildGroupMarkdown(level, grouped[level]),
      })
    }
  }

  // Add errors section
  if (errors && errors.length > 0) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'markdown',
      content: buildErrorsMarkdown(errors),
    })
  }

  // Determine header tag based on highest importance present
  const highestLevel = sortedItems.length > 0 ? sortedItems[0].importance : 0
  const tagColor = highestLevel >= 4 ? 'red' : highestLevel >= 3 ? 'orange' : 'blue'

  return {
    schema: '2.0',
    header: {
      title: {
        tag: 'plain_text',
        content: `Daily Digest — ${today}`,
      },
      subtitle: {
        tag: 'plain_text',
        content: `${items.length} items`,
      },
      text_tag_list: [
        {
          tag: 'text_tag',
          text: {
            tag: 'plain_text',
            content: `${items.length} articles`,
          },
          color: tagColor,
        },
      ],
      template: HEADER_TEMPLATE,
    },
    body: {
      elements,
    },
  }
}

/**
 * Send a Feishu card to a webhook URL.
 * Returns true on success, false on failure (logs error).
 */
export async function sendFeishuWebhook(
  webhook: Webhook,
  card: Record<string, unknown>,
): Promise<boolean> {
  const body = JSON.stringify({
    msg_type: 'interactive',
    card,
  })

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown')
      logger.error(`Webhook "${webhook.name}" failed: HTTP ${response.status} — ${text}`)
      return false
    }

    const result = (await response.json().catch(() => null)) as {
      StatusCode?: number
      msg?: string
    } | null
    if (result && result.StatusCode !== 0) {
      logger.error(`Webhook "${webhook.name}" returned error: ${result.msg ?? 'unknown'}`)
      return false
    }

    logger.success(`Webhook "${webhook.name}" sent successfully`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Webhook "${webhook.name}" failed: ${message}`)
    return false
  }
}
