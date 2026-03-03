import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import yaml from 'js-yaml'
import { getDefaultConfigPath } from '../config/loader'
import { ensureConfig } from '../config/ensure'
import { webhookSchema, type Webhook } from '../config/schema'
import { logger } from '../utils/logger'

/**
 * Load webhooks from config.yaml.
 * Returns an empty array if no webhooks are configured.
 */
export function loadWebhooks(configPath: string): Webhook[] {
  if (!fs.existsSync(configPath)) {
    return []
  }

  const fileContent = fs.readFileSync(configPath, 'utf-8')
  const raw = yaml.load(fileContent) as Record<string, unknown> | null

  if (!raw || !Array.isArray(raw.webhooks)) {
    return []
  }

  const webhooks: Webhook[] = []
  for (const entry of raw.webhooks) {
    const result = webhookSchema.safeParse(entry)
    if (result.success) {
      webhooks.push(result.data)
    }
  }

  return webhooks
}

/**
 * Save webhooks to config.yaml (preserves other config fields).
 */
export function saveWebhooks(configPath: string, webhooks: Webhook[]): void {
  const fileContent = fs.readFileSync(configPath, 'utf-8')
  const config = (yaml.load(fileContent) as Record<string, unknown>) ?? {}

  if (webhooks.length === 0) {
    delete config.webhooks
  } else {
    config.webhooks = webhooks
  }

  fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }), 'utf-8')
}

/** Supported webhook types */
const WEBHOOK_TYPES = ['feishu'] as const
type WebhookType = (typeof WEBHOOK_TYPES)[number]

function isValidType(type: string): type is WebhookType {
  return WEBHOOK_TYPES.includes(type as WebhookType)
}

/**
 * List all configured webhooks.
 */
export function listWebhooks(configPath: string): string {
  const finalPath = ensureConfig(configPath)
  const webhooks = loadWebhooks(finalPath)

  if (webhooks.length === 0) {
    return 'No webhooks configured.\n\nAdd one with: dailybrew webhook add <url> --name <name> --type feishu'
  }

  let output = 'Configured Webhooks:\n'
  output += `${'─'.repeat(72)}\n`

  for (const webhook of webhooks) {
    const status = webhook.enabled ? '✓ enabled' : '✗ disabled'
    output += `  ${webhook.name} (${webhook.type})\n`
    output += `    URL:    ${webhook.url}\n`
    output += `    Status: ${status}\n`
    output += '\n'
  }

  output += `${'─'.repeat(72)}\n`
  output += `Total: ${webhooks.length} webhook(s)\n`

  return output
}

/**
 * Add a webhook to config.
 */
export function addWebhook(
  configPath: string,
  url: string,
  options: { name: string; type: string },
): string {
  if (!isValidType(options.type)) {
    return `Unknown webhook type: "${options.type}"\nSupported types: ${WEBHOOK_TYPES.join(', ')}`
  }

  const finalPath = ensureConfig(configPath)
  const webhooks = loadWebhooks(finalPath)

  // Check for duplicate name
  const nameExists = webhooks.some((w) => w.name === options.name)
  if (nameExists) {
    return `Webhook with name "${options.name}" already exists. Use a different --name.`
  }

  // Check for duplicate URL
  const urlExists = webhooks.some((w) => w.url === url)
  if (urlExists) {
    return `Webhook with URL already exists: ${url}`
  }

  const newWebhook: Webhook = {
    type: options.type,
    name: options.name,
    url,
    enabled: true,
  }

  // Validate with Zod
  const validation = webhookSchema.safeParse(newWebhook)
  if (!validation.success) {
    const errors = validation.error.issues.map((i) => i.message).join(', ')
    return `Invalid webhook: ${errors}`
  }

  webhooks.push(validation.data)
  saveWebhooks(finalPath, webhooks)

  return `Added webhook: ${options.name} (${options.type}) → ${url}`
}

/**
 * Remove a webhook by name.
 */
export function removeWebhook(configPath: string, name: string): string {
  const finalPath = ensureConfig(configPath)
  const webhooks = loadWebhooks(finalPath)

  if (webhooks.length === 0) {
    return 'No webhooks to remove.'
  }

  const filtered = webhooks.filter((w) => w.name !== name)

  if (filtered.length === webhooks.length) {
    return `Webhook not found: "${name}"`
  }

  saveWebhooks(finalPath, filtered)

  return `Removed webhook: ${name}`
}

/**
 * Toggle a webhook's enabled state by name.
 */
export function toggleWebhook(configPath: string, name: string): string {
  const finalPath = ensureConfig(configPath)
  const webhooks = loadWebhooks(finalPath)

  const webhook = webhooks.find((w) => w.name === name)
  if (!webhook) {
    return `Webhook not found: "${name}"`
  }

  webhook.enabled = !webhook.enabled
  saveWebhooks(finalPath, webhooks)

  const status = webhook.enabled ? 'enabled' : 'disabled'
  return `Webhook "${name}" is now ${status}`
}

export default defineCommand({
  meta: {
    name: 'webhook',
    description: 'Manage webhooks (list, add <url>, remove <name>, toggle <name>)',
  },
  args: {
    name: {
      type: 'string',
      description: 'Display name for the webhook (required with add)',
      alias: 'n',
    },
    type: {
      type: 'string',
      description: 'Webhook type: feishu (required with add)',
      alias: 't',
    },
  },
  async run({ args, rawArgs }) {
    const action = rawArgs[0]

    if (action === 'add') {
      const url = rawArgs[1]
      if (!url || url.startsWith('-') || !args.name || !args.type) {
        logger.error('Usage: dailybrew webhook add <url> --name <name> --type <type>')
        logger.log('')
        logger.log('Options:')
        logger.log('  --name, -n    Display name for the webhook (required)')
        logger.log(`  --type, -t    Webhook type: ${WEBHOOK_TYPES.join(', ')} (required)`)
        logger.log('')
        logger.log('Examples:')
        logger.log(
          '  dailybrew webhook add https://open.feishu.cn/open-apis/bot/v2/hook/xxx --name team-bot --type feishu',
        )
        return
      }
      const result = addWebhook(getDefaultConfigPath(), url, {
        name: args.name,
        type: args.type,
      })
      logger.log(result)
      return
    }

    if (action === 'remove') {
      const name = rawArgs[1]
      if (!name || name.startsWith('-')) {
        logger.error('Usage: dailybrew webhook remove <name>')
        return
      }
      const result = removeWebhook(getDefaultConfigPath(), name)
      logger.log(result)
      return
    }

    if (action === 'toggle') {
      const name = rawArgs[1]
      if (!name || name.startsWith('-')) {
        logger.error('Usage: dailybrew webhook toggle <name>')
        return
      }
      const result = toggleWebhook(getDefaultConfigPath(), name)
      logger.log(result)
      return
    }

    // Default: list webhooks
    const result = listWebhooks(getDefaultConfigPath())
    logger.log(result)
  },
})
