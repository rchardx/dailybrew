import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import yaml from 'js-yaml'
import { getDefaultConfigPath } from '../config/loader'
import { ensureConfig } from '../config/ensure'
import { logger } from '../utils/logger'

/** Settable config keys: type and description */
const SETTABLE_KEYS: Record<string, { type: 'string' | 'number'; desc: string }> = {
  'llm.baseUrl': { type: 'string', desc: 'LLM API endpoint URL (e.g. https://api.openai.com/v1)' },
  'llm.apiKey': {
    type: 'string',
    desc: 'API key for LLM authentication (prefer DAILYBREW_API_KEY env var)',
  },
  'llm.model': {
    type: 'string',
    desc: 'Model name for summarization (e.g. gpt-4o, deepseek-chat)',
  },
  'options.maxItems': {
    type: 'number',
    desc: 'Max items per source to process per run (default: 10)',
  },
  'options.maxContentLength': {
    type: 'number',
    desc: 'Max characters of content sent to LLM per item (default: 65536)',
  },
  'options.concurrency': {
    type: 'number',
    desc: 'Number of sources to fetch in parallel (default: 8)',
  },
}

/**
 * Set a dotted key on a nested object.
 * e.g. setNestedKey(obj, 'llm.model', 'gpt-4o')
 */
function setNestedKey(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {}
    }
    current = current[parts[i]] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

/**
 * Get a dotted key from a nested object.
 */
function getNestedKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Set a config value by dotted key path.
 * Returns a status message.
 */
export function configSet(configPath: string, key: string, value: string): string {
  const entry = SETTABLE_KEYS[key]
  if (!entry) {
    const keys = Object.keys(SETTABLE_KEYS).join(', ')
    return `Unknown config key: ${key}\nSettable keys: ${keys}`
  }

  const finalPath = ensureConfig(configPath)
  const fileContent = fs.readFileSync(finalPath, 'utf-8')
  const config = yaml.load(fileContent) as Record<string, unknown>

  let parsed: unknown = value
  if (entry.type === 'number') {
    const num = Number(value)
    if (Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
      return `Invalid value for ${key}: expected a positive integer, got "${value}"`
    }
    parsed = num
  }

  const oldValue = getNestedKey(config, key)
  setNestedKey(config, key, parsed)
  fs.writeFileSync(finalPath, yaml.dump(config, { lineWidth: -1 }), 'utf-8')

  return `${key}: ${String(oldValue ?? '(unset)')} → ${String(parsed)}`
}

/**
 * Show current config.
 */
export function configShow(configPath?: string): { path: string; contents: string | null } {
  const finalPath = configPath || getDefaultConfigPath()

  if (!fs.existsSync(finalPath)) {
    return { path: finalPath, contents: null }
  }

  // Load and strip sources (they live in sources.yaml now)
  const fileContent = fs.readFileSync(finalPath, 'utf-8')
  const config = yaml.load(fileContent) as Record<string, unknown> | null

  if (!config) {
    return { path: finalPath, contents: null }
  }

  // Remove sources key if present (legacy configs)
  delete config.sources

  return { path: finalPath, contents: yaml.dump(config, { lineWidth: -1 }) }
}

export default defineCommand({
  meta: {
    name: 'config',
    description: 'Show or modify config — use "config set <key> <value>" to update',
  },
  args: {
    path: {
      type: 'boolean',
      description: 'Only print the config file path',
    },
  },
  async run({ args, rawArgs }) {
    // Handle: dailybrew config set <key> <value>
    if (rawArgs[0] === 'set') {
      const key = rawArgs[1]
      const value = rawArgs[2]
      if (!key || !value) {
        logger.error('Usage: dailybrew config set <key> <value>')
        logger.log('')
        logger.log('Settable keys:')
        for (const [k, v] of Object.entries(SETTABLE_KEYS)) {
          logger.log(`  ${k.padEnd(26)} ${v.desc}`)
        }
        logger.log('')
        logger.log('Examples:')
        logger.log('  dailybrew config set llm.model gpt-4o')
        logger.log('  dailybrew config set llm.baseUrl https://api.openai.com/v1')
        logger.log('  dailybrew config set options.maxItems 20')
        return
      }
      const result = configSet(getDefaultConfigPath(), key, value)
      logger.log(result)
      return
    }

    // Handle: dailybrew config / dailybrew config --path
    const { path: configPath, contents } = configShow()

    if (args.path) {
      logger.log(configPath)
      return
    }

    if (contents === null) {
      logger.warn(`No config file found. Run \`dailybrew init\` to create one.`)
      logger.log(configPath)
      return
    }

    logger.info(`Config: ${configPath}\n`)
    logger.log(contents)
  },
})
