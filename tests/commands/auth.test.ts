import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock config/ensure before importing the command
vi.mock('../../src/config/ensure', () => ({
  ensureConfig: vi.fn(),
  isAuthConfigured: vi.fn(),
  ensureAuth: vi.fn(),
}))

// Suppress logger output during tests
vi.mock('../../src/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    start: vi.fn(),
    success: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { ensureConfig, isAuthConfigured, ensureAuth } from '../../src/config/ensure'
import { logger } from '../../src/utils/logger'

// Extract the run function from the default export
async function getRunFn() {
  const mod = await import('../../src/commands/auth')
  return mod.default.run! as (ctx: { args: Record<string, unknown> }) => Promise<void>
}

let runAuth: (ctx: { args: Record<string, unknown> }) => Promise<void>

beforeEach(async () => {
  vi.clearAllMocks()

  // Default mocks
  vi.mocked(ensureConfig).mockReturnValue('/tmp/test-config.yaml')
  vi.mocked(isAuthConfigured).mockReturnValue(false)
  vi.mocked(ensureAuth).mockResolvedValue(true)

  runAuth = await getRunFn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('auth command', () => {
  it('should call ensureConfig with args.config', async () => {
    await runAuth({ args: { config: '/custom/path.yaml' } })

    expect(ensureConfig).toHaveBeenCalledWith('/custom/path.yaml')
  })

  it('should call ensureConfig with undefined when no config arg', async () => {
    await runAuth({ args: {} })

    expect(ensureConfig).toHaveBeenCalledWith(undefined)
  })

  it('should check if auth is already configured', async () => {
    vi.mocked(ensureConfig).mockReturnValue('/resolved/config.yaml')

    await runAuth({ args: {} })

    expect(isAuthConfigured).toHaveBeenCalledWith('/resolved/config.yaml')
  })

  it('should log info when auth is already configured', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(true)

    await runAuth({ args: {} })

    expect(logger.info).toHaveBeenCalledWith(
      'LLM provider is already configured. Re-running setup to update.',
    )
  })

  it('should not log "already configured" when auth is not configured', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false)

    await runAuth({ args: {} })

    expect(logger.info).not.toHaveBeenCalledWith(
      'LLM provider is already configured. Re-running setup to update.',
    )
  })

  it('should call ensureAuth with force: true', async () => {
    vi.mocked(ensureConfig).mockReturnValue('/resolved/config.yaml')

    await runAuth({ args: {} })

    expect(ensureAuth).toHaveBeenCalledWith('/resolved/config.yaml', { force: true })
  })

  it('should call ensureAuth with force: true even when already configured', async () => {
    vi.mocked(ensureConfig).mockReturnValue('/resolved/config.yaml')
    vi.mocked(isAuthConfigured).mockReturnValue(true)

    await runAuth({ args: {} })

    expect(ensureAuth).toHaveBeenCalledWith('/resolved/config.yaml', { force: true })
  })

  it('should log warning when ensureAuth returns false (cancelled)', async () => {
    vi.mocked(ensureAuth).mockResolvedValue(false)

    await runAuth({ args: {} })

    expect(logger.warn).toHaveBeenCalledWith('Auth setup cancelled.')
  })

  it('should not log warning when ensureAuth returns true (success)', async () => {
    vi.mocked(ensureAuth).mockResolvedValue(true)

    await runAuth({ args: {} })

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should pass custom config path through to ensureConfig and ensureAuth', async () => {
    vi.mocked(ensureConfig).mockReturnValue('/my/custom/config.yaml')

    await runAuth({ args: { config: '/my/custom/config.yaml' } })

    expect(ensureConfig).toHaveBeenCalledWith('/my/custom/config.yaml')
    expect(ensureAuth).toHaveBeenCalledWith('/my/custom/config.yaml', { force: true })
  })

  it('should log info then call ensureAuth when already configured', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(true)
    vi.mocked(ensureAuth).mockResolvedValue(true)

    await runAuth({ args: {} })

    expect(logger.info).toHaveBeenCalledWith(
      'LLM provider is already configured. Re-running setup to update.',
    )
    expect(ensureAuth).toHaveBeenCalledWith(expect.any(String), { force: true })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should log info and warning when already configured but user cancels', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(true)
    vi.mocked(ensureAuth).mockResolvedValue(false)

    await runAuth({ args: {} })

    expect(logger.info).toHaveBeenCalledWith(
      'LLM provider is already configured. Re-running setup to update.',
    )
    expect(logger.warn).toHaveBeenCalledWith('Auth setup cancelled.')
  })
})
