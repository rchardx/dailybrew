import cliProgress from 'cli-progress'

/** Max display width for the source name portion of progress bar labels. */
const MAX_NAME_WIDTH = 24

/**
 * Truncate and pad a name to a fixed width for progress bar alignment.
 * Names longer than MAX_NAME_WIDTH are truncated with '…'.
 * Names shorter are right-padded with spaces.
 */
export function truncateName(name: string): string {
  if (name.length > MAX_NAME_WIDTH) {
    return `${name.slice(0, MAX_NAME_WIDTH - 1)}…`
  }
  return name.padEnd(MAX_NAME_WIDTH)
}

/**
 * Create a progress bar that writes to stderr (pipe-friendly).
 * Format: `{stage} [{bar}] {value}/{total} | {duration_formatted}`
 *
 * Usage:
 *   const bar = createProgressBar()
 *   bar.start(92, 0, { stage: 'Fetching' })
 *   bar.increment(1, { stage: `Fetching — ${truncateName('HN')}` })
 *   bar.stop()
 */
export function createProgressBar(): cliProgress.SingleBar {
  return new cliProgress.SingleBar(
    {
      format: '{stage} [{bar}] {value}/{total} | {duration_formatted}',
      hideCursor: true,
      clearOnComplete: true,
      barsize: 25,
      linewrap: false,
    },
    cliProgress.Presets.shades_classic,
  )
}
