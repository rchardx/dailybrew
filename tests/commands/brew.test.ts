import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock all dependencies before importing brew module
vi.mock('../../src/config/loader', () => ({
  loadConfig: vi.fn(),
  loadConfigWithDefaults: vi.fn(),
  getDefaultConfigPath: vi.fn(() => '/default/config.yaml'),
}));

vi.mock('../../src/db/store', () => ({
  initStore: vi.fn(),
}));

vi.mock('../../src/db/dedup', () => ({
  isSeen: vi.fn(),
  markSeen: vi.fn(),
  getLastRunTime: vi.fn(),
  setLastRunTime: vi.fn(),
}));

vi.mock('../../src/sources/rss', () => ({
  fetchRssFeed: vi.fn(),
}));

vi.mock('../../src/sources/web', () => ({
  fetchWebPage: vi.fn(),
}));

vi.mock('../../src/llm/client', () => ({
  createLLMClient: vi.fn(),
}));

vi.mock('../../src/llm/summarize', () => ({
  summarizeItem: vi.fn(),
}));

vi.mock('../../src/output/markdown', () => ({
  formatDigest: vi.fn(),
}));

import { runBrewPipeline, parseSinceDuration } from '../../src/commands/brew';
import { loadConfig } from '../../src/config/loader';
import { initStore } from '../../src/db/store';
import { isSeen, markSeen, getLastRunTime, setLastRunTime } from '../../src/db/dedup';
import { fetchRssFeed } from '../../src/sources/rss';
import { fetchWebPage } from '../../src/sources/web';
import { createLLMClient } from '../../src/llm/client';
import { summarizeItem } from '../../src/llm/summarize';
import { formatDigest } from '../../src/output/markdown';
import type { Config } from '../../src/config/schema';
import type { Store } from '../../src/db/store';

// Helper: create a minimal config
function makeConfig(overrides?: Partial<Config>): Config {
  return {
    llm: {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
    },
    sources: [
      { name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' },
      { name: 'Lobsters', url: 'https://lobste.rs/rss', type: 'rss' },
    ],
    options: {
      maxItems: 50,
      maxContentLength: 4000,
      concurrency: 5,
    },
    ...overrides,
  };
}

// Helper: create a mock store
function makeStore(): Store {
  return {
    db: {} as any,
    dbPath: '/tmp/test.db',
    save: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

let tempDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-brew-'));
  // Suppress console output during tests
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  vi.restoreAllMocks();
});

describe('parseSinceDuration', () => {
  it('should parse "2h" as 2 hours in milliseconds', () => {
    const now = Date.now();
    const result = parseSinceDuration('2h');
    // Should be roughly 2 hours ago (within 1 second tolerance)
    expect(Math.abs(result - (now - 2 * 60 * 60 * 1000))).toBeLessThan(1000);
  });

  it('should parse "1d" as 1 day in milliseconds', () => {
    const now = Date.now();
    const result = parseSinceDuration('1d');
    expect(Math.abs(result - (now - 24 * 60 * 60 * 1000))).toBeLessThan(1000);
  });

  it('should parse "30m" as 30 minutes in milliseconds', () => {
    const now = Date.now();
    const result = parseSinceDuration('30m');
    expect(Math.abs(result - (now - 30 * 60 * 1000))).toBeLessThan(1000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseSinceDuration('abc')).toThrow();
    expect(() => parseSinceDuration('')).toThrow();
    expect(() => parseSinceDuration('5x')).toThrow();
  });
});

describe('runBrewPipeline', () => {
  let mockStore: Store;

  beforeEach(() => {
    mockStore = makeStore();
    vi.mocked(initStore).mockResolvedValue(mockStore);
    vi.mocked(getLastRunTime).mockReturnValue(null);
    vi.mocked(isSeen).mockReturnValue(false);
    vi.mocked(createLLMClient).mockReturnValue({} as any);
  });

  it('should run full pipeline: config → fetch → dedup → LLM → markdown → stdout', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);

    // RSS feeds return items
    vi.mocked(fetchRssFeed)
      .mockResolvedValueOnce({
        items: [{ id: 'item-1', title: 'Article 1', link: 'https://a.com/1', content: 'Content 1', sourceName: 'HN' }],
        errors: [],
      })
      .mockResolvedValueOnce({
        items: [{ id: 'item-2', title: 'Article 2', link: 'https://b.com/2', content: 'Content 2', sourceName: 'Lobsters' }],
        errors: [],
      });

    // LLM summarizes both items
    vi.mocked(summarizeItem)
      .mockResolvedValueOnce({ title: 'Summary 1', summary: 'Sum 1', importance: 4 })
      .mockResolvedValueOnce({ title: 'Summary 2', summary: 'Sum 2', importance: 3 });

    // Markdown formatter
    vi.mocked(formatDigest).mockReturnValue('# Daily Digest\n\n## Item 1\n## Item 2');

    const result = await runBrewPipeline({ configPath: '/test/config.yaml' });

    expect(loadConfig).toHaveBeenCalledWith('/test/config.yaml');
    expect(initStore).toHaveBeenCalled();
    expect(fetchRssFeed).toHaveBeenCalledTimes(2);
    expect(summarizeItem).toHaveBeenCalledTimes(2);
    expect(formatDigest).toHaveBeenCalledTimes(1);
    expect(result).toContain('Daily Digest');
  });

  it('should use --config flag to override default config path', async () => {
    const config = makeConfig({ sources: [] });
    vi.mocked(loadConfig).mockReturnValue(config);
    vi.mocked(formatDigest).mockReturnValue('No new content');

    await runBrewPipeline({ configPath: '/custom/path.yaml' });

    expect(loadConfig).toHaveBeenCalledWith('/custom/path.yaml');
  });

  it('should use --max-items flag to override config maxItems', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], errors: [] });
    vi.mocked(formatDigest).mockReturnValue('No new content');

    await runBrewPipeline({ configPath: '/test/config.yaml', maxItems: 10 });

    // fetchRssFeed should be called with maxItems=10 instead of config default 50
    for (const call of vi.mocked(fetchRssFeed).mock.calls) {
      expect(call[2]).toBe(10);
    }
  });

  it('should use --output flag to write to file instead of returning stdout', async () => {
    const config = makeConfig({ sources: [] });
    vi.mocked(loadConfig).mockReturnValue(config);
    vi.mocked(formatDigest).mockReturnValue('# Daily Digest\n\nTest content');

    const outputPath = path.join(tempDir, 'output.md');
    const result = await runBrewPipeline({ configPath: '/test/config.yaml', output: outputPath });

    expect(fs.existsSync(outputPath)).toBe(true);
    const fileContent = fs.readFileSync(outputPath, 'utf-8');
    expect(fileContent).toContain('Daily Digest');
    // When writing to file, result should indicate file was written
    expect(result).toContain(outputPath);
  });

  it('should use --since flag to override last run time', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], errors: [] });
    vi.mocked(formatDigest).mockReturnValue('No new content');

    // Override with "2h" — should use the parsed timestamp instead of DB lastRunTime
    const beforeRun = Date.now();
    await runBrewPipeline({ configPath: '/test/config.yaml', since: '2h' });

    // getLastRunTime should NOT be called when --since is provided
    // (or if called, its result should be ignored)
    // The fetch calls should use a timestamp ~2 hours ago
    for (const call of vi.mocked(fetchRssFeed).mock.calls) {
      const lastRunArg = call[1];
      expect(lastRunArg).not.toBeNull();
      // Should be approximately 2 hours ago
      const twoHoursAgo = beforeRun - 2 * 60 * 60 * 1000;
      expect(Math.abs(lastRunArg! - twoHoursAgo)).toBeLessThan(2000);
    }
  });

  it('should handle mixed sources: 2 RSS + 1 web in same config', async () => {
    const config = makeConfig({
      sources: [
        { name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' },
        { name: 'Lobsters', url: 'https://lobste.rs/rss', type: 'rss' },
        { name: 'Antirez', url: 'http://antirez.com', type: 'web', selector: 'h2 > a' },
      ],
    });
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed)
      .mockResolvedValueOnce({
        items: [{ id: 'rss-1', title: 'RSS 1', link: 'https://a.com/1', content: 'C1', sourceName: 'HN' }],
        errors: [],
      })
      .mockResolvedValueOnce({
        items: [{ id: 'rss-2', title: 'RSS 2', link: 'https://b.com/2', content: 'C2', sourceName: 'Lobsters' }],
        errors: [],
      });

    vi.mocked(fetchWebPage).mockResolvedValueOnce({
      items: [{ id: 'web-1', title: 'Web 1', link: 'http://antirez.com/1', content: 'C3', sourceName: 'Antirez' }],
      errors: [],
    });

    vi.mocked(summarizeItem).mockResolvedValue({ title: 'Sum', summary: 'S', importance: 3 });
    vi.mocked(formatDigest).mockReturnValue('# Digest');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    expect(fetchRssFeed).toHaveBeenCalledTimes(2);
    expect(fetchWebPage).toHaveBeenCalledTimes(1);
    expect(summarizeItem).toHaveBeenCalledTimes(3);
  });

  it('should handle partial failure: 1 source fails, 2 succeed → output includes successes + errors', async () => {
    const config = makeConfig({
      sources: [
        { name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' },
        { name: 'Broken', url: 'https://broken.com/feed', type: 'rss' },
        { name: 'Lobsters', url: 'https://lobste.rs/rss', type: 'rss' },
      ],
    });
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed)
      .mockResolvedValueOnce({
        items: [{ id: 'item-1', title: 'A1', link: 'https://a.com', content: 'C1', sourceName: 'HN' }],
        errors: [],
      })
      .mockResolvedValueOnce({
        items: [],
        errors: [{ source: 'Broken', message: 'HTTP 500' }],
      })
      .mockResolvedValueOnce({
        items: [{ id: 'item-2', title: 'A2', link: 'https://b.com', content: 'C2', sourceName: 'Lobsters' }],
        errors: [],
      });

    vi.mocked(summarizeItem).mockResolvedValue({ title: 'Sum', summary: 'S', importance: 3 });
    vi.mocked(formatDigest).mockReturnValue('# Digest with errors');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    // Should still summarize the 2 successful items
    expect(summarizeItem).toHaveBeenCalledTimes(2);

    // formatDigest should receive the errors
    const formatCall = vi.mocked(formatDigest).mock.calls[0];
    const errorsArg = formatCall[1];
    expect(errorsArg).toBeDefined();
    expect(errorsArg!.length).toBeGreaterThanOrEqual(1);
  });

  it('should return "No new content" message when no new items since last run', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);

    // All feeds return empty
    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], errors: [] });
    vi.mocked(formatDigest).mockReturnValue('# Daily Digest\n\nNo new content');

    const result = await runBrewPipeline({ configPath: '/test/config.yaml' });

    expect(summarizeItem).not.toHaveBeenCalled();
    expect(result).toContain('No new content');
  });

  it('should handle first run: no lastRunTime → fetches all (capped by maxItems)', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);
    vi.mocked(getLastRunTime).mockReturnValue(null);

    vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], errors: [] });
    vi.mocked(formatDigest).mockReturnValue('No new content');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    // On first run, lastRunTime should be null → passed through to fetchers
    for (const call of vi.mocked(fetchRssFeed).mock.calls) {
      expect(call[1]).toBeNull();
    }
  });

  it('should cap concurrency: with 10 sources and concurrency=3, max 3 fetch in parallel', async () => {
    // Create 10 RSS sources
    const sources = Array.from({ length: 10 }, (_, i) => ({
      name: `Source${i}`, url: `https://src${i}.com/rss`, type: 'rss' as const,
    }));
    const config = makeConfig({ sources, options: { maxItems: 50, maxContentLength: 4000, concurrency: 3 } });
    vi.mocked(loadConfig).mockReturnValue(config);

    // Track concurrent calls
    let currentConcurrent = 0;
    let maxConcurrent = 0;

    vi.mocked(fetchRssFeed).mockImplementation(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10));
      currentConcurrent--;
      return { items: [], errors: [] };
    });

    vi.mocked(formatDigest).mockReturnValue('No new content');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    expect(fetchRssFeed).toHaveBeenCalledTimes(10);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('should update DB state after run: lastRunTime set, seen items marked', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed)
      .mockResolvedValueOnce({
        items: [{ id: 'item-1', title: 'A1', link: 'https://a.com', content: 'C1', sourceName: 'HN' }],
        errors: [],
      })
      .mockResolvedValueOnce({
        items: [{ id: 'item-2', title: 'A2', link: 'https://b.com', content: 'C2', sourceName: 'Lobsters' }],
        errors: [],
      });

    vi.mocked(summarizeItem).mockResolvedValue({ title: 'Sum', summary: 'S', importance: 3 });
    vi.mocked(formatDigest).mockReturnValue('# Digest');

    const beforeRun = Date.now();
    await runBrewPipeline({ configPath: '/test/config.yaml' });
    const afterRun = Date.now();

    // Both items should be marked as seen
    expect(markSeen).toHaveBeenCalledTimes(2);
    expect(markSeen).toHaveBeenCalledWith(mockStore, 'item-1', 'HN', 'A1');
    expect(markSeen).toHaveBeenCalledWith(mockStore, 'item-2', 'Lobsters', 'A2');

    // lastRunTime should be set to approximately now
    expect(setLastRunTime).toHaveBeenCalledTimes(1);
    const setTime = vi.mocked(setLastRunTime).mock.calls[0][1];
    expect(setTime).toBeGreaterThanOrEqual(beforeRun);
    expect(setTime).toBeLessThanOrEqual(afterRun);

    // Store should be saved and closed
    expect(mockStore.save).toHaveBeenCalled();
    expect(mockStore.close).toHaveBeenCalled();
  });

  it('should filter out already-seen items via dedup', async () => {
    const config = makeConfig({ sources: [{ name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' }] });
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed).mockResolvedValueOnce({
      items: [
        { id: 'seen-1', title: 'Old', link: 'https://a.com', content: 'C1', sourceName: 'HN' },
        { id: 'new-1', title: 'New', link: 'https://b.com', content: 'C2', sourceName: 'HN' },
      ],
      errors: [],
    });

    // First item is already seen
    vi.mocked(isSeen).mockImplementation((_store, id) => id === 'seen-1');

    vi.mocked(summarizeItem).mockResolvedValue({ title: 'Sum', summary: 'S', importance: 3 });
    vi.mocked(formatDigest).mockReturnValue('# Digest');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    // Only the new item should be summarized
    expect(summarizeItem).toHaveBeenCalledTimes(1);
    // Only the new item should be marked as seen
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(markSeen).toHaveBeenCalledWith(mockStore, 'new-1', 'HN', 'New');
  });

  it('should skip null LLM results (failed summaries)', async () => {
    const config = makeConfig({ sources: [{ name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' }] });
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed).mockResolvedValueOnce({
      items: [
        { id: 'item-1', title: 'A1', link: 'https://a.com', content: 'C1', sourceName: 'HN' },
        { id: 'item-2', title: 'A2', link: 'https://b.com', content: 'C2', sourceName: 'HN' },
      ],
      errors: [],
    });

    // First item fails LLM, second succeeds
    vi.mocked(summarizeItem)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ title: 'Sum 2', summary: 'S2', importance: 4 });

    vi.mocked(formatDigest).mockReturnValue('# Digest');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    // formatDigest should only receive 1 item (the non-null one)
    const formatCall = vi.mocked(formatDigest).mock.calls[0];
    const itemsArg = formatCall[0];
    expect(itemsArg).toHaveLength(1);
    expect(itemsArg[0].title).toBe('Sum 2');
  });

  it('should ensure store.close() is called even if pipeline throws', async () => {
    const config = makeConfig();
    vi.mocked(loadConfig).mockReturnValue(config);

    // Force a fetch error that propagates
    vi.mocked(fetchRssFeed).mockRejectedValue(new Error('Catastrophic fetch error'));

    vi.mocked(formatDigest).mockReturnValue('');

    try {
      await runBrewPipeline({ configPath: '/test/config.yaml' });
    } catch {
      // Expected to throw
    }

    // store.close() must still be called
    expect(mockStore.close).toHaveBeenCalled();
  });

  it('should normalize web FetchError to markdown FetchError format', async () => {
    const config = makeConfig({
      sources: [{ name: 'Antirez', url: 'http://antirez.com', type: 'web', selector: 'h2 > a' }],
    });
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchWebPage).mockResolvedValueOnce({
      items: [],
      errors: [{ sourceName: 'Antirez', url: 'http://antirez.com', error: 'HTTP 500' }],
    });

    vi.mocked(formatDigest).mockReturnValue('# Digest');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    // formatDigest errors should be in the markdown FetchError format
    const formatCall = vi.mocked(formatDigest).mock.calls[0];
    const errorsArg = formatCall[1];
    expect(errorsArg).toBeDefined();
    expect(errorsArg![0]).toHaveProperty('sourceName');
    expect(errorsArg![0]).toHaveProperty('url');
    expect(errorsArg![0]).toHaveProperty('error');
  });

  it('should normalize RSS FetchError to markdown FetchError format', async () => {
    const config = makeConfig({
      sources: [{ name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' }],
    });
    vi.mocked(loadConfig).mockReturnValue(config);

    vi.mocked(fetchRssFeed).mockResolvedValueOnce({
      items: [],
      errors: [{ source: 'HN', message: 'Feed timeout' }],
    });

    vi.mocked(formatDigest).mockReturnValue('# Digest');

    await runBrewPipeline({ configPath: '/test/config.yaml' });

    const formatCall = vi.mocked(formatDigest).mock.calls[0];
    const errorsArg = formatCall[1];
    expect(errorsArg).toBeDefined();
    expect(errorsArg![0]).toHaveProperty('sourceName', 'HN');
    expect(errorsArg![0]).toHaveProperty('error', 'Feed timeout');
  });
});
