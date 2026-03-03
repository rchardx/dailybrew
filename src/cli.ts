import { fileURLToPath } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineCommand, runMain, runCommand } from 'citty'
import { logger } from './utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

export const main = defineCommand({
  meta: {
    name: 'dailybrew',
    version: pkg.version,
    description: 'LLM-powered RSS/web digest CLI',
  },
  subCommands: {
    run: () => import('./commands/run').then((m) => m.default),
    init: () => import('./commands/init').then((m) => m.default),
    config: () => import('./commands/config').then((m) => m.default),
    list: () => import('./commands/list').then((m) => m.default),
    import: () => import('./commands/import').then((m) => m.default),
    auth: () => import('./commands/auth').then((m) => m.default),
    webhook: () => import('./commands/webhook').then((m) => m.default),
  },
  args: {},
  async run() {
    // citty always calls parent run() even after subcommand — guard against double execution
    const subCommandNames = new Set(Object.keys(main.subCommands ?? {}))
    const firstArg = process.argv.slice(2).find((a) => !a.startsWith('-'))
    if (firstArg && subCommandNames.has(firstArg)) {
      return
    }
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
