import * as fs from 'node:fs'
import { defineCommand } from 'citty'
import { getDefaultConfigPath } from '../config/loader'
import { logger } from '../utils/logger'

export default defineCommand({
  meta: {
    name: 'config',
    description: 'Show config file path and contents',
  },
  args: {
    path: {
      type: 'boolean',
      description: 'Only print the config file path',
    },
  },
  async run({ args }) {
    const configPath = getDefaultConfigPath()

    if (args.path) {
      logger.log(configPath)
      return
    }

    if (!fs.existsSync(configPath)) {
      logger.warn(`No config file found. Run \`dailybrew init\` to create one.`)
      logger.log(configPath)
      return
    }

    logger.info(`Config: ${configPath}\n`)
    const contents = fs.readFileSync(configPath, 'utf-8')
    logger.log(contents)
  },
})
