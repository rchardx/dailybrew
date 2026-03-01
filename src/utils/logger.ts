import { createConsola } from 'consola'

export const logger = createConsola({
  // Force ALL log levels to stderr so stdout is reserved for data output (markdown digest).
  // By default consola sends level >= 2 (info, success, log) to stdout,
  // which pollutes pipe-redirected output like `dailybrew brew > digest.md`.
  stdout: process.stderr,
  defaults: {
    tag: 'dailybrew',
  },
})
