import * as fs from 'node:fs'
import * as path from 'node:path'
import { defineCommand } from 'citty'
import { getDefaultConfigPath } from '../config/loader'
import { logger } from '../utils/logger'

const EXAMPLE_CONFIG = `# dailybrew configuration
# Docs: https://github.com/rchardx/dailybrew

llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "\${DAILYBREW_API_KEY}"    # Set env var: export DAILYBREW_API_KEY=your-key
  model: "gpt-4o-mini"

sources:
  # Example RSS feed:
  # - name: "Hacker News"
  #   url: "https://hnrss.org/frontpage"
  #   type: rss
  #
  # Example web page:
  # - name: "Antirez"
  #   url: "http://antirez.com/"
  #   type: web
  #   selector: "h2 > a"

options:
  maxItems: 10
  maxContentLength: 65536
  concurrency: 8
`

async function initConfig(configPath?: string, options?: { force?: boolean }): Promise<string> {
  const finalPath = configPath || getDefaultConfigPath()
  const configDir = path.dirname(finalPath)

  // Check if config already exists
  if (fs.existsSync(finalPath) && !options?.force) {
    return `Config file already exists at ${finalPath}. Use --force to overwrite.`
  }

  // Create config directory if it doesn't exist
  fs.mkdirSync(configDir, { recursive: true })

  // Write example config
  fs.writeFileSync(finalPath, EXAMPLE_CONFIG, 'utf-8')

  return `Config initialized at ${finalPath}`
}

export { initConfig }

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new config file',
  },
  args: {
    force: {
      type: 'boolean',
      description: 'Overwrite existing config',
      alias: 'f',
    },
  },
  async run({ args }) {
    const result = await initConfig(undefined, { force: args.force })
    logger.log(result)
  },
})
