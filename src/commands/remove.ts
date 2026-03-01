import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import yaml from 'js-yaml'
import { ensureConfig } from '../config/ensure'
import { logger } from '../utils/logger'

async function removeSource(configPath?: string, url?: string): Promise<string> {
  if (!url) {
    throw new Error('URL is required')
  }

  const finalPath = ensureConfig(configPath)

  // Load current config
  const fileContent = fs.readFileSync(finalPath, 'utf-8')
  const config = yaml.load(fileContent) as any

  // Ensure sources array exists
  if (!config.sources || config.sources.length === 0) {
    return `No sources to remove. Config has no sources.`
  }

  // Find the source to remove
  const initialLength = config.sources.length
  config.sources = config.sources.filter((s: any) => s.url !== url)

  // Check if anything was removed
  if (config.sources.length === initialLength) {
    return `Source with URL ${url} not found in config.`
  }

  // Write back to file
  const yaml_dump = yaml.dump(config, { lineWidth: -1 })
  fs.writeFileSync(finalPath, yaml_dump, 'utf-8')

  return `Removed source with URL: ${url}`
}

export { removeSource }

export default defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove a source',
  },
  args: {
    url: {
      type: 'positional',
      required: true,
      description: 'URL of the source to remove',
    },
  },
  async run({ args }) {
    const result = await removeSource(undefined, args.url)
    logger.log(result)
  },
})
