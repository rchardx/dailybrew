import cliProgress from 'cli-progress'

/**
 * Create a progress bar that writes to stderr (pipe-friendly).
 * Format: `{stage} [{bar}] {value}/{total} | {duration_formatted}`
 *
 * Usage:
 *   const bar = createProgressBar()
 *   bar.start(92, 0, { stage: 'Fetching' })
 *   bar.increment(1, { stage: 'Fetching — HN' })
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
