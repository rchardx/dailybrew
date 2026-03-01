import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import envPaths from 'env-paths'
import lockfile from 'proper-lockfile'
import { logger } from '../utils/logger'

const paths = envPaths('dailybrew')

export interface Store {
  db: Database
  dbPath: string
  save(): void
  close(): Promise<void>
}

/**
 * Initialize the SQLite store with sql.js.
 * Handles WASM loading, DB file persistence, corrupt DB recovery, and lockfile protection.
 */
export async function initStore(dbPath?: string): Promise<Store> {
  // Default to env-paths data directory
  const finalDbPath = dbPath || join(paths.data, 'dailybrew.db')

  // Ensure data directory exists
  const dbDir = dirname(finalDbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // Create a marker file if DB doesn't exist yet, so we can acquire a lock on it
  if (!existsSync(finalDbPath)) {
    writeFileSync(finalDbPath, Buffer.alloc(0))
  }

  // Acquire lockfile to prevent concurrent access
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(finalDbPath, {
      retries: { retries: 5, minTimeout: 100 },
      stale: 10000,
    })
  } catch (error) {
    throw new Error(
      `Could not acquire lock on database: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  // Load sql.js WASM binary
  // In tests: load from node_modules
  // In production: load from dist/ (copied during build)
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const wasmPath = existsSync(join(currentDir, 'sql-wasm.wasm'))
    ? join(currentDir, 'sql-wasm.wasm')
    : join(currentDir, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  })

  let db: Database
  let _isCorrupt = false

  // Try to load existing DB file
  if (existsSync(finalDbPath)) {
    try {
      const buffer = readFileSync(finalDbPath)
      db = new SQL.Database(buffer)

      // Try a simple query to verify DB is not corrupt
      db.exec('SELECT 1')
    } catch (_error) {
      // Corrupt DB recovery: rename to .corrupt and start fresh
      const corruptPath = `${finalDbPath}.corrupt`
      logger.warn(
        `Database file is corrupt. Renaming to ${corruptPath} and creating fresh database.`,
      )
      renameSync(finalDbPath, corruptPath)
      db = new SQL.Database()
      _isCorrupt = true

      // Release lock on corrupt file since we renamed it
      if (release) {
        await release()
        release = undefined
      }
    }
  } else {
    // Create new DB
    db = new SQL.Database()
  }

  // Ensure schema exists
  db.run(`
    CREATE TABLE IF NOT EXISTS seen_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  const store: Store = {
    db,
    dbPath: finalDbPath,
    save() {
      const data = db.export()
      const buffer = Buffer.from(data)
      writeFileSync(finalDbPath, buffer)
    },
    async close() {
      store.save()
      db.close()

      // Release lockfile
      if (release) {
        try {
          await release()
        } catch (err) {
          logger.error('Failed to release lock:', err)
        }
      }
    },
  }

  return store
}
