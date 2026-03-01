import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initStore, Store } from '../../src/db/store.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('SQLite Store', () => {
  let tempDir: string;
  let dbPath: string;
  let store: Store | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dailybrew-test-'));
    dbPath = join(tempDir, 'test.db');
  });

  afterEach(async () => {
    if (store) {
      await store.close();
      store = undefined;
    }
    // Small delay to ensure lockfile cleanup completes
    await new Promise(resolve => setTimeout(resolve, 50));
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  it('should initialize a new database with schema', async () => {
    store = await initStore(dbPath);
    
    expect(store).toBeDefined();
    expect(store.db).toBeDefined();
    expect(store.dbPath).toBe(dbPath);
    
    // Verify tables exist
    const tables = store.db.exec(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `);
    
    expect(tables[0].values).toContainEqual(['meta']);
    expect(tables[0].values).toContainEqual(['seen_items']);
  });

  it('should persist data across store init/close cycles', async () => {
    // Create store and insert data
    store = await initStore(dbPath);
    store.db.run(`INSERT INTO seen_items (id, source, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)`,
      ['test-id', 'Test Source', 'Test Title', 1000, 2000]);
    store.save();
    await store.close();
    store = undefined;

    // Reopen and verify data persists
    store = await initStore(dbPath);
    const result = store.db.exec(`SELECT id, source, title FROM seen_items WHERE id = 'test-id'`);
    
    expect(result.length).toBe(1);
    expect(result[0].values).toHaveLength(1);
    expect(result[0].values[0]).toEqual(['test-id', 'Test Source', 'Test Title']);
  });

  it('should recover from corrupt database file', async () => {
    // Create a corrupt DB file with garbage data
    writeFileSync(dbPath, 'This is not a valid SQLite database file!');
    
    // Should not throw, should rename corrupt file and create fresh DB
    store = await initStore(dbPath);
    
    expect(store).toBeDefined();
    
    // Verify tables exist in new DB
    const tables = store.db.exec(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `);
    
    expect(tables[0].values).toContainEqual(['meta']);
    expect(tables[0].values).toContainEqual(['seen_items']);
  });

  it('should explicitly save database to file', async () => {
    store = await initStore(dbPath);
    
    // Insert data
    store.db.run(`INSERT INTO seen_items (id, source, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)`,
      ['save-test', 'Source', 'Title', 1000, 2000]);
    
    // Explicitly save
    store.save();
    
    // Close properly to release lock (save was already called)
    await store.close();
    store = undefined;

    // Reopen and verify
    store = await initStore(dbPath);
    const result = store.db.exec(`SELECT id FROM seen_items WHERE id = 'save-test'`);
    
    expect(result.length).toBe(1);
    expect(result[0].values).toHaveLength(1);
    expect(result[0].values[0][0]).toBe('save-test');
  });

  it('should prevent concurrent access with lockfile', async () => {
    // First instance - create and save to disk
    const store1 = await initStore(dbPath);
    store1.save(); // Save to create the file
    
    // Try to open second instance - should throw lockfile error
    await expect(async () => {
      await initStore(dbPath);
    }).rejects.toThrow(/lock/i);
    
    await store1.close();
  });

  it('should close database properly', async () => {
    store = await initStore(dbPath);
    
    store.db.run(`INSERT INTO meta (key, value) VALUES ('test', 'value')`);
    
    // Close should save and close DB
    await store.close();
    store = undefined;
    
    // Reopen and verify data was saved
    store = await initStore(dbPath);
    const result = store.db.exec(`SELECT value FROM meta WHERE key = 'test'`);
    
    expect(result[0].values[0][0]).toBe('value');
  });
});
