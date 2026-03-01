import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineCommand, runMain, runCommand } from 'citty'
import { logger } from './utils/logger'

export const main = defineCommand({
  meta: {
    name: 'dailybrew',
    version: '1.0.0',
    description: 'LLM-powered RSS/web digest CLI',
  },
  subCommands: {
    run: () => import('./commands/run').then((m) => m.default),
    init: () => import('./commands/init').then((m) => m.default),
    config: () => import('./commands/config').then((m) => m.default),
    add: () => import('./commands/add').then((m) => m.default),
    remove: () => import('./commands/remove').then((m) => m.default),
    list: () => import('./commands/list').then((m) => m.default),
    import: () => import('./commands/import').then((m) => m.default),
    auth: () => import('./commands/auth').then((m) => m.default),
  },
  args: {},
  async run() {
    // Default: no subcommand = run
    const runCmd = await import('./commands/run').then((m) => m.default)
    await runCommand(runCmd, { rawArgs: process.argv.slice(2) })
  },
})

export default main

// Run if called directly
const currentFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (currentFile === entryFile) {
  runMain(main).catch((error) => {
    logger.error(error)
    process.exit(1)
  })
}
