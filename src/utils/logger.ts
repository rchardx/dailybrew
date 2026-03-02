import { createConsola } from 'consola'

export const logger = createConsola({
  // Force ALL log levels to stderr so stdout is reserved for data output (markdown digest).
  // By default consola sends level >= 2 (info, success, log) to stdout,
  // which pollutes pipe-redirected output like `dailybrew run > digest.md`.
  stdout: process.stderr,
  defaults: {
    tag: 'dailybrew',
  },
})

/**
 * Set the log level for the logger.
 * - 0: Fatal/Error only (quiet)
 * - 3: Info (default)
 * - 5: Debug/Trace (verbose)
 */
export function setLogLevel(level: number): void {
  logger.level = level
}
