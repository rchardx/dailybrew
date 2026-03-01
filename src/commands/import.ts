import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import { parseOpml } from '../sources/opml'
import { loadSources, saveSources, ensureSources } from '../config/sources'
import { logger } from '../utils/logger'

async function importOpml(filePath: string): Promise<string> {
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

  ensureSources()
  const existingSources = loadSources()
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

  saveSources(existingSources)

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
  },
  async run({ args }) {
    const result = await importOpml(args.file)
    logger.log(result)
  },
})
