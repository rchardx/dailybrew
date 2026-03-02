import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initStore, type Store } from '../../src/db/store.js'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('SQLite Store', () => {
  let tempDir: string
  let dbPath: string
  let store: Store | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dailybrew-test-'))
    dbPath = join(tempDir, 'test.db')
  })

  afterEach(async () => {
    if (store) {
      await store.close()
      store = undefined
    }
    // Small delay to ensure lockfile cleanup completes
    await new Promise((resolve) => setTimeout(resolve, 50))
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  it('should initialize a new database with schema', async () => {
    store = await initStore(dbPath)

    expect(store).toBeDefined()
    expect(store.db).toBeDefined()
    expect(store.dbPath).toBe(dbPath)

    // Verify tables exist
    const tables = store.db.exec(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `)

    expect(tables[0].values).toContainEqual(['meta'])
    expect(tables[0].values).toContainEqual(['seen_items'])
  })

  it('should persist data across store init/close cycles', async () => {
    // Create store and insert data
    store = await initStore(dbPath)
    store.db.run(
      `INSERT INTO seen_items (id, source, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)`,
      ['test-id', 'Test Source', 'Test Title', 1000, 2000],
    )
    store.save()
    await store.close()
    store = undefined

    // Reopen and verify data persists
    store = await initStore(dbPath)
    const result = store.db.exec(`SELECT id, source, title FROM seen_items WHERE id = 'test-id'`)

    expect(result.length).toBe(1)
    expect(result[0].values).toHaveLength(1)
    expect(result[0].values[0]).toEqual(['test-id', 'Test Source', 'Test Title'])
  })

  it('should recover from corrupt database file', async () => {
    // Create a corrupt DB file with garbage data
    writeFileSync(dbPath, 'This is not a valid SQLite database file!')

    // Should not throw, should rename corrupt file and create fresh DB
    store = await initStore(dbPath)

    expect(store).toBeDefined()

    // Verify tables exist in new DB
    const tables = store.db.exec(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `)

    expect(tables[0].values).toContainEqual(['meta'])
    expect(tables[0].values).toContainEqual(['seen_items'])
  })

  it('should explicitly save database to file', async () => {
    store = await initStore(dbPath)

    // Insert data
    store.db.run(
      `INSERT INTO seen_items (id, source, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)`,
      ['save-test', 'Source', 'Title', 1000, 2000],
    )

    // Explicitly save
    store.save()

    // Close properly to release lock (save was already called)
    await store.close()
    store = undefined

    // Reopen and verify
    store = await initStore(dbPath)
    const result = store.db.exec(`SELECT id FROM seen_items WHERE id = 'save-test'`)

    expect(result.length).toBe(1)
    expect(result[0].values).toHaveLength(1)
    expect(result[0].values[0][0]).toBe('save-test')
  })

  it('should prevent concurrent access with lockfile', async () => {
    // First instance - create and save to disk
    const store1 = await initStore(dbPath)
    store1.save() // Save to create the file

    // Try to open second instance - should throw lockfile error
    await expect(async () => {
      await initStore(dbPath)
    }).rejects.toThrow(/lock/i)

    await store1.close()
  })

  it('should close database properly', async () => {
    store = await initStore(dbPath)

    store.db.run(`INSERT INTO meta (key, value) VALUES ('test', 'value')`)

    // Close should save and close DB
    await store.close()
    store = undefined

    // Reopen and verify data was saved
    store = await initStore(dbPath)
    const result = store.db.exec(`SELECT value FROM meta WHERE key = 'test'`)

    expect(result[0].values[0][0]).toBe('value')
  })

  it('should create data directory if it does not exist', async () => {
    // Use a nested path where the parent directory doesn't exist
    const nestedDbPath = join(tempDir, 'sub', 'dir', 'nested.db')

    store = await initStore(nestedDbPath)

    expect(store).toBeDefined()
    expect(store.dbPath).toBe(nestedDbPath)

    // Verify the directory was created
    expect(existsSync(join(tempDir, 'sub', 'dir'))).toBe(true)

    // Verify tables exist
    const tables = store.db.exec(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `)
    expect(tables[0].values).toContainEqual(['meta'])
    expect(tables[0].values).toContainEqual(['seen_items'])
  })

  it('should work when dbDir already exists', async () => {
    // tempDir already exists from mkdtempSync, so dbDir (dirname of dbPath) exists
    // This exercises the branch where existsSync(dbDir) returns true and mkdirSync is skipped
    expect(existsSync(tempDir)).toBe(true)

    store = await initStore(dbPath)

    expect(store).toBeDefined()
    expect(store.dbPath).toBe(dbPath)
  })

  it('should work when DB file already exists on disk', async () => {
    // Create a valid first store, save data, close
    const firstStore = await initStore(dbPath)
    firstStore.db.run(
      `INSERT INTO seen_items (id, source, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)`,
      ['existing-test', 'Source', 'Title', 1000, 2000],
    )
    firstStore.save()
    await firstStore.close()

    // Now the DB file exists on disk — reopen
    expect(existsSync(dbPath)).toBe(true)
    store = await initStore(dbPath)

    // Verify existing data persists (exercises the existsSync(finalDbPath) = true branch for loading)
    const result = store.db.exec(`SELECT id FROM seen_items WHERE id = 'existing-test'`)
    expect(result.length).toBe(1)
    expect(result[0].values[0][0]).toBe('existing-test')
  })

  it('should use default path when no dbPath is provided', async () => {
    // We can't actually test the default env-paths location easily,
    // but we can verify the function doesn't throw when given undefined
    // and returns a store with a valid dbPath
    // Note: this also exercises the dbPath || join(paths.data, ...) branch
    try {
      store = await initStore()
      expect(store).toBeDefined()
      expect(store.dbPath).toBeDefined()
      expect(store.dbPath).toContain('dailybrew')
      await store.close()
      store = undefined
    } catch (error) {
      // May fail due to lockfile if other tests are using the default path — that's OK
      expect(String(error)).toMatch(/lock/i)
    }
  })

  it('should handle corrupt DB and rename to .corrupt file', async () => {
    // Write corrupt data
    writeFileSync(dbPath, 'CORRUPT_DATA_HERE')

    store = await initStore(dbPath)

    // The corrupt file should have been renamed
    expect(existsSync(`${dbPath}.corrupt`)).toBe(true)

    // The store should still be functional
    store.db.run(`INSERT INTO meta (key, value) VALUES ('recovery', 'success')`)
    const result = store.db.exec(`SELECT value FROM meta WHERE key = 'recovery'`)
    expect(result[0].values[0][0]).toBe('success')
  })

  it('should handle lock release error during close gracefully', async () => {
    // Suppress logger output for this test
    const loggerModule = await import('../../src/utils/logger')
    const errorSpy = vi.spyOn(loggerModule.logger, 'error').mockImplementation(() => {})

    store = await initStore(dbPath)

    // Manually remove the lock file/dir before close to cause release() to fail
    const lockPath = `${dbPath}.lock`
    try {
      rmSync(lockPath, { recursive: true, force: true })
    } catch (_error) {
      // lockfile may be a directory or file
    }

    // Now close — release() should fail since lock was already removed
    await store.close()
    store = undefined

    // The error should have been caught and logged (not thrown)
    // Verify no uncaught exception — test completes means it was handled

    errorSpy.mockRestore()
  })

  it('should create marker file when DB does not exist yet', async () => {
    // The DB file should not exist before initStore
    expect(existsSync(dbPath)).toBe(false)

    store = await initStore(dbPath)

    // After init, the DB file should exist (marker was created, then actual data written)
    expect(store).toBeDefined()
    expect(existsSync(dbPath)).toBe(true)
  })

  it('should handle save and verify data integrity', async () => {
    store = await initStore(dbPath)

    // Insert multiple rows
    for (let i = 0; i < 5; i++) {
      store.db.run(
        `INSERT INTO seen_items (id, source, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)`,
        [`item-${i}`, `Source ${i}`, `Title ${i}`, 1000 + i, 2000 + i],
      )
    }

    store.save()
    await store.close()
    store = undefined

    // Reopen and verify all data
    store = await initStore(dbPath)
    const result = store.db.exec('SELECT COUNT(*) FROM seen_items')
    expect(result[0].values[0][0]).toBe(5)
  })
})
