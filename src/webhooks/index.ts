import type { Webhook } from '../config/schema.js'
import type { DigestItem, FetchError } from '../output/markdown.js'
import { formatFeishuCard, sendFeishuWebhook } from './feishu.js'
import { logger } from '../utils/logger.js'

/** Result of a single webhook dispatch */
export interface WebhookResult {
  name: string
  type: string
  success: boolean
}

/**
 * Dispatch digest to all enabled webhooks.
 * Sends in parallel — returns results for each webhook.
 */
export async function dispatchWebhooks(
  webhooks: Webhook[],
  items: DigestItem[],
  errors?: FetchError[],
): Promise<WebhookResult[]> {
  const enabled = webhooks.filter((w) => w.enabled)

  if (enabled.length === 0) {
    return []
  }

  logger.info(`Dispatching to ${enabled.length} webhook(s)`)

  const results = await Promise.all(
    enabled.map(async (webhook): Promise<WebhookResult> => {
      switch (webhook.type) {
        case 'feishu': {
          const card = formatFeishuCard(items, errors)
          const success = await sendFeishuWebhook(webhook, card)
          return { name: webhook.name, type: webhook.type, success }
        }
        default: {
          logger.warn(`Unknown webhook type "${webhook.type}" for "${webhook.name}", skipping`)
          return { name: webhook.name, type: webhook.type, success: false }
        }
      }
    }),
  )

  const succeeded = results.filter((r) => r.success).length
  const failed = results.length - succeeded
  if (failed > 0) {
    logger.warn(`Webhooks: ${succeeded} succeeded, ${failed} failed`)
  } else {
    logger.success(`All ${succeeded} webhook(s) sent successfully`)
  }

  return results
}
