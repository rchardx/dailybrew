import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Use vi.hoisted to create the mock release function before vi.mock hoisting
const { mockRelease } = vi.hoisted(() => ({
  mockRelease: vi.fn(),
}))

// Mock logger to suppress output and allow assertions
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    start: vi.fn(),
    fail: vi.fn(),
    log: vi.fn(),
  },
}))

// Mock proper-lockfile so we can control the release function
vi.mock('proper-lockfile', () => ({
  default: {
    lock: vi.fn().mockResolvedValue(mockRelease),
  },
}))

import { initStore } from '../../src/db/store.js'
import { logger } from '../../src/utils/logger'

describe('SQLite Store — lock release error branch', () => {
  let tempDir: string
  let dbPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dailybrew-test-lock-'))
    dbPath = join(tempDir, 'test.db')
    vi.clearAllMocks()
    // Default: release succeeds
    mockRelease.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  it('should log error when lock release throws during close', async () => {
    // Make release throw an error
    mockRelease.mockRejectedValue(new Error('Lock release failed'))

    const store = await initStore(dbPath)

    // close() should catch the release error and log it, not throw
    await store.close()

    // Verify the error was logged
    expect(logger.error).toHaveBeenCalledWith('Failed to release lock:', expect.any(Error))
  })

  it('should not throw when release succeeds during close', async () => {
    mockRelease.mockResolvedValue(undefined)

    const store = await initStore(dbPath)

    // close() should complete without error
    await store.close()

    // logger.error should not have been called for lock release
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should handle corrupt DB recovery with lock release in recovery path', async () => {
    // Write corrupt data to trigger the corrupt recovery path
    writeFileSync(dbPath, 'CORRUPT_DATA_NOT_SQLITE')

    const store = await initStore(dbPath)

    // During corrupt recovery, the release is called and set to undefined
    // So on close(), release should be undefined and the if(release) branch should be false
    expect(store).toBeDefined()

    // Verify the warn was logged for corrupt DB
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('corrupt'))

    // Close should work fine — release was already called during recovery
    await store.close()
  })
})
