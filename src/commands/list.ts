import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import yaml from 'js-yaml'
import { ensureConfig } from '../config/ensure'
import { logger } from '../utils/logger'

async function listSources(configPath?: string): Promise<string> {
  const finalPath = ensureConfig(configPath)

  // Load current config
  const fileContent = fs.readFileSync(finalPath, 'utf-8')
  const config = yaml.load(fileContent) as any

  // Check if sources exist
  if (!config.sources || config.sources.length === 0) {
    return 'No sources configured.'
  }

  // Format sources as table
  let output = 'Configured Sources:\n'
  output += `${'─'.repeat(80)}\n`
  output += '│ Name                 │ URL                              │ Type   │\n'
  output += `${'─'.repeat(80)}\n`

  for (const source of config.sources) {
    const name = (source.name || 'Unnamed').substring(0, 20).padEnd(20)
    const url = source.url.substring(0, 30).padEnd(30)
    const type = (source.type || 'unknown').padEnd(6)
    output += `│ ${name} │ ${url} │ ${type} │\n`
  }

  output += `${'─'.repeat(80)}\n`
  output += `Total: ${config.sources.length} source(s)\n`

  return output
}

export { listSources }

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List all configured sources',
  },
  args: {},
  async run() {
    const result = await listSources()
    logger.log(result)
  },
})
