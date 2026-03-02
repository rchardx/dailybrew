import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initStore, type Store } from '../../src/db/store.js'
import { getCachedSummary, cacheSummary, pruneSummaryCache } from '../../src/db/cache.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Summary Cache', () => {
  let tempDir: string
  let dbPath: string
  let store: Store | undefined

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'dailybrew-cache-test-'))
    dbPath = join(tempDir, 'test.db')
    store = await initStore(dbPath)
  })

  afterEach(async () => {
    if (store) {
      await store.close()
      store = undefined
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  describe('getCachedSummary', () => {
    it('should return null for uncached content', () => {
      expect(store).toBeDefined()
      const result = getCachedSummary(store!, 'nonexistent-hash', 'gpt-4')
      expect(result).toBeNull()
    })

    it('should return cached summary after cacheSummary', () => {
      expect(store).toBeDefined()

      cacheSummary(store!, 'hash-1', 'gpt-4', {
        title: 'Test Title',
        summary: 'Test Summary',
        importance: 4,
      })

      const result = getCachedSummary(store!, 'hash-1', 'gpt-4')
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Test Title')
      expect(result!.summary).toBe('Test Summary')
      expect(result!.importance).toBe(4)
    })

    it('should return null for different model with same hash', () => {
      expect(store).toBeDefined()

      cacheSummary(store!, 'hash-1', 'gpt-4', {
        title: 'Test Title',
        summary: 'Test Summary',
        importance: 4,
      })

      const result = getCachedSummary(store!, 'hash-1', 'gpt-3.5')
      expect(result).toBeNull()
    })
  })

  describe('cacheSummary', () => {
    it('should store a summary in the cache', () => {
      expect(store).toBeDefined()

      cacheSummary(store!, 'hash-abc', 'model-x', {
        title: 'Cached',
        summary: 'Cached summary',
        importance: 3,
      })

      const result = store!.db.exec(
        `SELECT title, summary, importance, model FROM summary_cache WHERE content_hash = 'hash-abc'`,
      )
      expect(result.length).toBe(1)
      expect(result[0].values[0]).toEqual(['Cached', 'Cached summary', 3, 'model-x'])
    })

    it('should overwrite existing entry for same hash (INSERT OR REPLACE)', () => {
      expect(store).toBeDefined()

      cacheSummary(store!, 'hash-dup', 'gpt-4', {
        title: 'First',
        summary: 'First summary',
        importance: 2,
      })

      cacheSummary(store!, 'hash-dup', 'gpt-4', {
        title: 'Updated',
        summary: 'Updated summary',
        importance: 5,
      })

      const result = getCachedSummary(store!, 'hash-dup', 'gpt-4')
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Updated')
      expect(result!.importance).toBe(5)

      // Only one record should exist
      const count = store!.db.exec(
        `SELECT COUNT(*) FROM summary_cache WHERE content_hash = 'hash-dup'`,
      )
      expect(count[0].values[0][0]).toBe(1)
    })
  })

  describe('pruneSummaryCache', () => {
    it('should remove entries older than retention days', () => {
      expect(store).toBeDefined()

      // Insert an old entry (manually set created_at to 60 days ago)
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000
      store!.db.run(
        `INSERT INTO summary_cache (content_hash, title, summary, importance, model, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ['old-hash', 'Old', 'Old summary', 3, 'gpt-4', sixtyDaysAgo],
      )

      // Insert a recent entry
      cacheSummary(store!, 'new-hash', 'gpt-4', {
        title: 'New',
        summary: 'New summary',
        importance: 4,
      })

      const pruned = pruneSummaryCache(store!, 30)
      expect(pruned).toBe(1)

      // Old entry should be gone
      expect(getCachedSummary(store!, 'old-hash', 'gpt-4')).toBeNull()
      // New entry should still exist
      expect(getCachedSummary(store!, 'new-hash', 'gpt-4')).not.toBeNull()
    })

    it('should return 0 when nothing to prune', () => {
      expect(store).toBeDefined()

      cacheSummary(store!, 'recent-hash', 'gpt-4', {
        title: 'Recent',
        summary: 'Recent summary',
        importance: 3,
      })

      const pruned = pruneSummaryCache(store!, 30)
      expect(pruned).toBe(0)
    })

    it('should default to 30-day retention', () => {
      expect(store).toBeDefined()

      // Insert entry 31 days old
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
      store!.db.run(
        `INSERT INTO summary_cache (content_hash, title, summary, importance, model, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ['borderline-hash', 'Borderline', 'Borderline summary', 3, 'gpt-4', thirtyOneDaysAgo],
      )

      const pruned = pruneSummaryCache(store!)
      expect(pruned).toBe(1)
    })
  })
})
