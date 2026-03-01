import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import yaml from 'js-yaml'
import type { Source } from '../config/schema'
import { parseOpml } from '../sources/opml'
import { ensureConfig } from '../config/ensure'
import { logger } from '../utils/logger'

async function importOpml(filePath: string, configPath?: string): Promise<string> {
  const finalConfigPath = ensureConfig(configPath)

  // Check if OPML file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`OPML file not found at ${filePath}`)
  }

  // Read and parse OPML
  const opmlContent = fs.readFileSync(filePath, 'utf-8')
  const newSources = parseOpml(opmlContent)

  if (newSources.length === 0) {
    return 'Imported 0 sources (0 skipped as duplicates)'
  }

  // Load current config
  const fileContent = fs.readFileSync(finalConfigPath, 'utf-8')
  const config = yaml.load(fileContent) as Record<string, unknown>

  // Ensure sources array exists
  if (!config.sources) {
    config.sources = []
  }

  const existingSources = config.sources as Source[]
  const existingUrls = new Set(existingSources.map((s) => s.url))

  let imported = 0
  let skipped = 0

  for (const source of newSources) {
    if (existingUrls.has(source.url)) {
      skipped++
    } else {
      existingSources.push(source)
      existingUrls.add(source.url)
      imported++
    }
  }

  // Write back to file
  const yamlDump = yaml.dump(config, { lineWidth: -1 })
  fs.writeFileSync(finalConfigPath, yamlDump, 'utf-8')

  return `Imported ${imported} sources (${skipped} skipped as duplicates)`
}

export { importOpml }

export default defineCommand({
  meta: {
    name: 'import',
    description: 'Import sources from an OPML file',
  },
  args: {
    file: {
      type: 'positional',
      required: true,
      description: 'Path to OPML file',
    },
    config: {
      type: 'string',
      description: 'Path to config file',
      alias: 'c',
    },
  },
  async run({ args }) {
    const result = await importOpml(args.file, args.config)
    logger.log(result)
  },
})
