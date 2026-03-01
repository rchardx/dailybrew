import { defineCommand } from 'citty'
import { ensureConfig, ensureAuth, isAuthConfigured } from '../config/ensure'
import { logger } from '../utils/logger'

export default defineCommand({
  meta: {
    name: 'auth',
    description: 'Configure LLM provider (baseUrl, API key, model)',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file',
      alias: 'c',
    },
  },
  async run({ args }) {
    const configPath = ensureConfig(args.config)

    if (isAuthConfigured(configPath)) {
      logger.info('LLM provider is already configured. Re-running setup to update.')
    }

    // Force re-prompt even if already configured (user explicitly ran `auth`)
    const result = await ensureAuth(configPath, { force: true })
    if (!result) {
      logger.warn('Auth setup cancelled.')
    }
  },
})
