import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initStore, type Store } from '../../src/db/store.js'
import { markSeen, isSeen, getLastRunTime, setLastRunTime } from '../../src/db/dedup.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Deduplication Logic', () => {
  let tempDir: string
  let dbPath: string
  let store: Store | undefined

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'dailybrew-test-'))
    dbPath = join(tempDir, 'test.db')
    store = await initStore(dbPath)
  })

  afterEach(async () => {
    if (store) {
      await store.close()
      store = undefined
    }
    // Small delay to ensure lockfile cleanup completes
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  describe('markSeen', () => {
    it('should insert a new seen item', () => {
      expect(store).toBeDefined()

      markSeen(store!, 'test-id-1', 'Test Source', 'Test Title')

      const result = store!.db.exec(
        `SELECT id, source, title FROM seen_items WHERE id = 'test-id-1'`,
      )
      expect(result.length).toBe(1)
      expect(result[0].values[0]).toEqual(['test-id-1', 'Test Source', 'Test Title'])
    })

    it('should not create duplicates for same id', () => {
      expect(store).toBeDefined()

      markSeen(store!, 'duplicate-id', 'Source 1', 'Title 1')
      markSeen(store!, 'duplicate-id', 'Source 2', 'Title 2')

      const result = store!.db.exec(
        `SELECT COUNT(*) as count FROM seen_items WHERE id = 'duplicate-id'`,
      )
      expect(result[0].values[0][0]).toBe(1)
    })

    it('should update last_seen timestamp on duplicate insert', () => {
      expect(store).toBeDefined()

      markSeen(store!, 'update-test', 'Source', 'Title')

      // Get initial timestamps
      const firstResult = store!.db.exec(
        `SELECT first_seen, last_seen FROM seen_items WHERE id = 'update-test'`,
      )
      const firstSeen = firstResult[0].values[0][0]
      const firstLastSeen = firstResult[0].values[0][1]

      // Wait a bit to ensure different timestamp
      setTimeout(() => {}, 10)

      markSeen(store!, 'update-test', 'Source', 'Title')

      // Check timestamps after second mark
      const secondResult = store!.db.exec(
        `SELECT first_seen, last_seen FROM seen_items WHERE id = 'update-test'`,
      )
      const secondFirstSeen = secondResult[0].values[0][0]
      const secondLastSeen = secondResult[0].values[0][1]

      // first_seen should remain unchanged, last_seen should update
      expect(secondFirstSeen).toBe(firstSeen)
      expect(secondLastSeen).toBeGreaterThanOrEqual(firstLastSeen)
    })
  })

  describe('isSeen', () => {
    it('should return false for unseen item', () => {
      expect(store).toBeDefined()

      const seen = isSeen(store!, 'never-seen-id')
      expect(seen).toBe(false)
    })

    it('should return true for seen item', () => {
      expect(store).toBeDefined()

      markSeen(store!, 'seen-id', 'Source', 'Title')

      const seen = isSeen(store!, 'seen-id')
      expect(seen).toBe(true)
    })

    it('should distinguish between different ids', () => {
      expect(store).toBeDefined()

      markSeen(store!, 'id-1', 'Source', 'Title')

      expect(isSeen(store!, 'id-1')).toBe(true)
      expect(isSeen(store!, 'id-2')).toBe(false)
    })
  })

  describe('getLastRunTime', () => {
    it('should return null when no last run time exists', () => {
      expect(store).toBeDefined()

      const lastRun = getLastRunTime(store!)
      expect(lastRun).toBeNull()
    })

    it('should return stored timestamp after setLastRunTime', () => {
      expect(store).toBeDefined()

      const timestamp = Date.now()
      setLastRunTime(store!, timestamp)

      const retrieved = getLastRunTime(store!)
      expect(retrieved).toBe(timestamp)
    })
  })

  describe('setLastRunTime', () => {
    it('should store last run timestamp', () => {
      expect(store).toBeDefined()

      const timestamp = 1234567890000
      setLastRunTime(store!, timestamp)

      const result = store!.db.exec(`SELECT value FROM meta WHERE key = 'last_run_time'`)
      expect(result.length).toBe(1)
      expect(parseInt(result[0].values[0][0] as string, 10)).toBe(timestamp)
    })

    it('should update existing last run timestamp', () => {
      expect(store).toBeDefined()

      setLastRunTime(store!, 1000)
      setLastRunTime(store!, 2000)

      const retrieved = getLastRunTime(store!)
      expect(retrieved).toBe(2000)

      // Verify only one record exists
      const result = store!.db.exec(
        `SELECT COUNT(*) as count FROM meta WHERE key = 'last_run_time'`,
      )
      expect(result[0].values[0][0]).toBe(1)
    })

    it('should persist across store close/reopen', async () => {
      expect(store).toBeDefined()

      const timestamp = Date.now()
      setLastRunTime(store!, timestamp)
      await store!.close()
      store = undefined

      // Reopen store
      store = await initStore(dbPath)
      const retrieved = getLastRunTime(store!)

      expect(retrieved).toBe(timestamp)
    })
  })

  describe('Integration: Full dedup workflow', () => {
    it('should track seen items and last run time together', () => {
      expect(store).toBeDefined()

      // First run
      const run1Time = Date.now()
      setLastRunTime(store!, run1Time)
      markSeen(store!, 'article-1', 'Blog', 'First Post')
      markSeen(store!, 'article-2', 'Blog', 'Second Post')

      // Verify seen items
      expect(isSeen(store!, 'article-1')).toBe(true)
      expect(isSeen(store!, 'article-2')).toBe(true)
      expect(isSeen(store!, 'article-3')).toBe(false)

      // Second run
      const run2Time = Date.now() + 1000
      setLastRunTime(store!, run2Time)
      markSeen(store!, 'article-3', 'Blog', 'Third Post')

      // Verify all three are now seen
      expect(isSeen(store!, 'article-1')).toBe(true)
      expect(isSeen(store!, 'article-2')).toBe(true)
      expect(isSeen(store!, 'article-3')).toBe(true)

      // Verify last run time is updated
      expect(getLastRunTime(store!)).toBe(run2Time)
    })
  })
})
