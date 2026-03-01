import { defineCommand, runMain } from 'citty'
import { logger } from './utils/logger'

export const main = defineCommand({
  meta: {
    name: 'dailybrew',
    version: '1.0.0',
    description: 'LLM-powered RSS/web digest CLI'
  },
  subCommands: {
    brew: () => import('./commands/brew').then(m => m.default),
    init: () => import('./commands/init').then(m => m.default),
    add: () => import('./commands/add').then(m => m.default),
    remove: () => import('./commands/remove').then(m => m.default),
    list: () => import('./commands/list').then(m => m.default)
  },
  args: {},
  run() {
    logger.info('dailybrew CLI initialized')
  }
})

export default main

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMain(main).catch((error) => {
    logger.error(error)
    process.exit(1)
  })
}
