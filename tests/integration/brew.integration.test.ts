/**
 * Integration tests for the full brew pipeline.
 *
 * Uses real file system (temp dirs), real SQLite via sql.js, real config loading,
 * real markdown formatting — but mocks network (fetch) and LLM (OpenAI SDK).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import OpenAI from 'openai';

// We mock only external I/O: network fetch and OpenAI SDK
vi.mock('openai', () => {
  const MockOpenAI = vi.fn();
  // APIError must be constructable for summarize error handling
  class APIError extends Error {
    status: number;
    constructor(status: number, body: any, message: string, headers: any) {
      super(message);
      this.status = status;
    }
  }
  (MockOpenAI as any).APIError = APIError;
  return { default: MockOpenAI, APIError };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Structured LLM response for beta.chat.completions.parse */
function makeLLMStructuredResponse(data: {
  title: string;
  summary: string;
  importance: number;
}) {
  return {
    choices: [
      {
        message: {
          parsed: data,
          content: JSON.stringify(data),
        },
      },
    ],
  };
}

/** Generate a minimal RSS XML feed */
function makeRssXml(
  items: Array<{ title: string; link: string; guid: string; description: string; pubDate: string }>
): string {
  const itemsXml = items
    .map(
      (i) => `
      <item>
        <title>${i.title}</title>
        <link>${i.link}</link>
        <guid>${i.guid}</guid>
        <description>${i.description}</description>
        <pubDate>${i.pubDate}</pubDate>
      </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://test.com</link>
    <description>A test feed</description>
    ${itemsXml}
  </channel>
</rss>`;
}

/** Generate a minimal web page with article links */
function makeWebPageHtml(
  articles: Array<{ href: string; title: string }>
): string {
  const links = articles
    .map((a) => `<article><h2><a href="${a.href}">${a.title}</a></h2></article>`)
    .join('\n');
  return `<html><body>${links}</body></html>`;
}

/** Generate an article page */
function makeArticleHtml(content: string): string {
  return `<html><body><article><p>${content}</p></article></body></html>`;
}

/** Write a YAML config file and return path */
function writeConfig(
  dir: string,
  config: {
    llm: { baseUrl: string; apiKey: string; model: string };
    sources: Array<{ name: string; url: string; type?: string; selector?: string }>;
    options?: { maxItems?: number; concurrency?: number; maxContentLength?: number };
  }
): string {
  const configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(configPath, yaml.dump(config), 'utf-8');
  return configPath;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Integration: Full Brew Pipeline', () => {
  let tmpDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  let mockParse: ReturnType<typeof vi.fn>;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-integ-'));

    // Mock fetch globally
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // Setup OpenAI mock
    mockParse = vi.fn();
    mockCreate = vi.fn();
    vi.mocked(OpenAI).mockImplementation(
      () =>
        ({
          beta: { chat: { completions: { parse: mockParse } } },
          chat: { completions: { create: mockCreate } },
        }) as any
    );

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Wait for lockfile cleanup
    await new Promise((r) => setTimeout(r, 100));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── Test: Complete flow ─────────────────────────────────────────────────

  it('complete flow: config → fetch RSS → LLM summarize → markdown output', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');

    const dbPath = path.join(tmpDir, 'brew.db');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'TestFeed', url: 'https://test-feed.com/rss', type: 'rss' },
      ],
      options: { maxItems: 10, concurrency: 2 },
    });

    // Mock RSS feed fetch
    const now = new Date();
    const rssXml = makeRssXml([
      {
        title: 'TypeScript 6.0 Released',
        link: 'https://test-feed.com/ts6',
        guid: 'ts6-guid',
        description: 'TypeScript 6.0 brings pattern matching and more.',
        pubDate: now.toUTCString(),
      },
      {
        title: 'Rust 2.0 Announced',
        link: 'https://test-feed.com/rust2',
        guid: 'rust2-guid',
        description: 'Rust 2.0 simplifies async programming.',
        pubDate: now.toUTCString(),
      },
    ]);

    fetchMock.mockImplementation(async (url: string, opts?: any) => {
      if (url === 'https://test-feed.com/rss') {
        return new Response(rssXml, { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    // Mock LLM responses
    mockParse
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'TypeScript 6.0 Released',
          summary: 'TypeScript 6.0 introduces pattern matching.',
          importance: 5,
        })
      )
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'Rust 2.0 Announced',
          summary: 'Rust 2.0 simplifies async.',
          importance: 3,
        })
      );

    // Patch initStore to use our temp DB
    const storeModule = await import('../../src/db/store');
    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    const result = await runBrewPipeline({ configPath });

    // Verify markdown output
    expect(result).toContain('Daily Digest');
    expect(result).toContain('TypeScript 6.0 Released');
    expect(result).toContain('Rust 2.0 Announced');
    expect(result).toContain('pattern matching');
    expect(result).toContain('🔴'); // importance 5 = Critical

    // Verify LLM was called twice
    expect(mockParse).toHaveBeenCalledTimes(2);

    // Verify fetch was called for the RSS feed
    expect(fetchMock).toHaveBeenCalled();

    vi.mocked(storeModule.initStore).mockRestore();
  });

  // ─── Test: Dedup across runs ─────────────────────────────────────────────

  it('dedup across runs: second run with same feed produces fewer items', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');
    const storeModule = await import('../../src/db/store');

    const dbPath = path.join(tmpDir, 'dedup.db');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'DedupFeed', url: 'https://dedup-feed.com/rss', type: 'rss' },
      ],
      options: { maxItems: 10, concurrency: 1 },
    });

    const now = new Date();
    const rssXml = makeRssXml([
      {
        title: 'Article Alpha',
        link: 'https://dedup-feed.com/alpha',
        guid: 'alpha-guid',
        description: 'Alpha content.',
        pubDate: now.toUTCString(),
      },
      {
        title: 'Article Beta',
        link: 'https://dedup-feed.com/beta',
        guid: 'beta-guid',
        description: 'Beta content.',
        pubDate: now.toUTCString(),
      },
    ]);

    fetchMock.mockImplementation(async () => new Response(rssXml, { status: 200 }));

    // LLM responses for first run (2 items)
    mockParse
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({ title: 'Alpha', summary: 'Alpha summary.', importance: 3 })
      )
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({ title: 'Beta', summary: 'Beta summary.', importance: 2 })
      );

    // Use a shared DB path across runs
    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    // First run — both items are new
    const result1 = await runBrewPipeline({ configPath });
    expect(result1).toContain('Alpha');
    expect(result1).toContain('Beta');
    expect(mockParse).toHaveBeenCalledTimes(2);

    // Reset call counts but keep same DB
    mockParse.mockClear();

    // LLM response for second run — shouldn't need any since both are already seen
    // But we'll provide one in case something unexpected happens
    mockParse.mockResolvedValue(
      makeLLMStructuredResponse({ title: 'Unexpected', summary: 'Should not appear.', importance: 1 })
    );

    // Second run — items already seen, should produce "No new content"
    const result2 = await runBrewPipeline({ configPath });
    expect(result2).toContain('No new content');
    expect(mockParse).toHaveBeenCalledTimes(0);

    vi.mocked(storeModule.initStore).mockRestore();
  });

  // ─── Test: Mixed sources (RSS + Web) ─────────────────────────────────────

  it('mixed sources: config with 1 RSS + 1 web source → both appear in output', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');
    const storeModule = await import('../../src/db/store');

    const dbPath = path.join(tmpDir, 'mixed.db');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'RSSSource', url: 'https://rss-source.com/feed.xml', type: 'rss' },
        { name: 'WebSource', url: 'https://web-source.com', type: 'web', selector: 'article h2 a' },
      ],
      options: { maxItems: 5, concurrency: 2 },
    });

    const now = new Date();
    const rssXml = makeRssXml([
      {
        title: 'RSS Article',
        link: 'https://rss-source.com/article-1',
        guid: 'rss-article-1',
        description: 'RSS article content.',
        pubDate: now.toUTCString(),
      },
    ]);

    const webPage = makeWebPageHtml([
      { href: 'https://web-source.com/post-1', title: 'Web Post' },
    ]);

    const articlePage = makeArticleHtml('Web article body content here.');

    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://rss-source.com/feed.xml') {
        return new Response(rssXml, { status: 200 });
      }
      if (url === 'https://web-source.com') {
        return new Response(webPage, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url === 'https://web-source.com/post-1') {
        return new Response(articlePage, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('Not found', { status: 404 });
    });

    // LLM: 1 RSS item + 1 web item = 2 calls
    mockParse
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'RSS Article Summary',
          summary: 'Summary of the RSS article.',
          importance: 4,
        })
      )
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'Web Post Summary',
          summary: 'Summary of the web post.',
          importance: 3,
        })
      );

    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    const result = await runBrewPipeline({ configPath });

    // Both sources should appear
    expect(result).toContain('RSS Article Summary');
    expect(result).toContain('Web Post Summary');
    expect(result).toContain('RSSSource');
    expect(result).toContain('WebSource');
    expect(mockParse).toHaveBeenCalledTimes(2);

    vi.mocked(storeModule.initStore).mockRestore();
  });

  // ─── Test: Error resilience ──────────────────────────────────────────────

  it('error resilience: 1 source returns 500 → other source still processed', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');
    const storeModule = await import('../../src/db/store');

    const dbPath = path.join(tmpDir, 'resilience.db');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'GoodFeed', url: 'https://good-feed.com/rss', type: 'rss' },
        { name: 'BrokenFeed', url: 'https://broken-feed.com/rss', type: 'rss' },
      ],
      options: { maxItems: 10, concurrency: 2 },
    });

    const now = new Date();
    const goodRss = makeRssXml([
      {
        title: 'Good Article',
        link: 'https://good-feed.com/article',
        guid: 'good-1',
        description: 'Good content.',
        pubDate: now.toUTCString(),
      },
    ]);

    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://good-feed.com/rss') {
        return new Response(goodRss, { status: 200 });
      }
      if (url === 'https://broken-feed.com/rss') {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response('Not found', { status: 404 });
    });

    // LLM for the 1 good article
    mockParse.mockResolvedValueOnce(
      makeLLMStructuredResponse({
        title: 'Good Article Summary',
        summary: 'This came from the good feed.',
        importance: 4,
      })
    );

    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    const result = await runBrewPipeline({ configPath });

    // Good source processed despite broken source
    expect(result).toContain('Good Article Summary');
    expect(result).toContain('This came from the good feed.');

    // Should include error section about broken feed
    expect(result).toContain('Fetch Errors');
    expect(result).toContain('BrokenFeed');

    expect(mockParse).toHaveBeenCalledTimes(1);

    vi.mocked(storeModule.initStore).mockRestore();
  });

  // ─── Test: --output flag ─────────────────────────────────────────────────

  it('--output flag: verify file is created with correct content', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');
    const storeModule = await import('../../src/db/store');

    const dbPath = path.join(tmpDir, 'output.db');
    const outputPath = path.join(tmpDir, 'digest.md');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'OutputFeed', url: 'https://output-feed.com/rss', type: 'rss' },
      ],
      options: { maxItems: 5, concurrency: 1 },
    });

    const now = new Date();
    const rssXml = makeRssXml([
      {
        title: 'Output Test Article',
        link: 'https://output-feed.com/article',
        guid: 'output-1',
        description: 'Content for output test.',
        pubDate: now.toUTCString(),
      },
    ]);

    fetchMock.mockImplementation(async () => new Response(rssXml, { status: 200 }));

    mockParse.mockResolvedValueOnce(
      makeLLMStructuredResponse({
        title: 'Output Test Summary',
        summary: 'Summary for file output verification.',
        importance: 3,
      })
    );

    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    const result = await runBrewPipeline({ configPath, output: outputPath });

    // Result should indicate file was written
    expect(result).toContain(outputPath);

    // File should exist and contain the digest
    expect(fs.existsSync(outputPath)).toBe(true);
    const fileContent = fs.readFileSync(outputPath, 'utf-8');
    expect(fileContent).toContain('Daily Digest');
    expect(fileContent).toContain('Output Test Summary');
    expect(fileContent).toContain('Summary for file output verification.');

    vi.mocked(storeModule.initStore).mockRestore();
  });

  // ─── Test: --since flag ──────────────────────────────────────────────────

  it('--since 1h flag: only items from last hour appear', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');
    const storeModule = await import('../../src/db/store');

    const dbPath = path.join(tmpDir, 'since.db');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'SinceFeed', url: 'https://since-feed.com/rss', type: 'rss' },
      ],
      options: { maxItems: 10, concurrency: 1 },
    });

    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const rssXml = makeRssXml([
      {
        title: 'Recent Article',
        link: 'https://since-feed.com/recent',
        guid: 'recent-1',
        description: 'This is recent.',
        pubDate: thirtyMinAgo.toUTCString(),
      },
      {
        title: 'Old Article',
        link: 'https://since-feed.com/old',
        guid: 'old-1',
        description: 'This is old.',
        pubDate: twoHoursAgo.toUTCString(),
      },
    ]);

    fetchMock.mockImplementation(async () => new Response(rssXml, { status: 200 }));

    // Only 1 item should pass the since filter
    mockParse.mockResolvedValueOnce(
      makeLLMStructuredResponse({
        title: 'Recent Article Summary',
        summary: 'Recent content only.',
        importance: 3,
      })
    );

    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    const result = await runBrewPipeline({ configPath, since: '1h' });

    // Recent article should appear
    expect(result).toContain('Recent Article Summary');
    // Old article should NOT be summarized (filtered by --since 1h)
    expect(mockParse).toHaveBeenCalledTimes(1);

    vi.mocked(storeModule.initStore).mockRestore();
  });

  // ─── Test: Importance sorting ────────────────────────────────────────────

  it('importance sorting in output: 🔴 before 🟢', async () => {
    const { runBrewPipeline } = await import('../../src/commands/brew');
    const storeModule = await import('../../src/db/store');

    const dbPath = path.join(tmpDir, 'sorting.db');
    const configPath = writeConfig(tmpDir, {
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      sources: [
        { name: 'SortFeed', url: 'https://sort-feed.com/rss', type: 'rss' },
      ],
      options: { maxItems: 10, concurrency: 1 },
    });

    const now = new Date();
    const rssXml = makeRssXml([
      {
        title: 'Low Priority News',
        link: 'https://sort-feed.com/low',
        guid: 'low-1',
        description: 'Low priority.',
        pubDate: now.toUTCString(),
      },
      {
        title: 'Critical Breaking News',
        link: 'https://sort-feed.com/critical',
        guid: 'critical-1',
        description: 'Critical news.',
        pubDate: now.toUTCString(),
      },
      {
        title: 'Normal News',
        link: 'https://sort-feed.com/normal',
        guid: 'normal-1',
        description: 'Normal news.',
        pubDate: now.toUTCString(),
      },
    ]);

    fetchMock.mockImplementation(async () => new Response(rssXml, { status: 200 }));

    // Return items with different importance levels
    mockParse
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'Low Priority News',
          summary: 'Not very important.',
          importance: 2,
        })
      )
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'Critical Breaking News',
          summary: 'Extremely important!',
          importance: 5,
        })
      )
      .mockResolvedValueOnce(
        makeLLMStructuredResponse({
          title: 'Normal News',
          summary: 'Standard news.',
          importance: 3,
        })
      );

    const origInitStore = storeModule.initStore;
    vi.spyOn(storeModule, 'initStore').mockImplementation(() => origInitStore(dbPath));

    const result = await runBrewPipeline({ configPath });

    // 🔴 Critical should appear before 🟡 Important before 🟢 Normal
    const criticalIdx = result.indexOf('🔴');
    const importantIdx = result.indexOf('🟡');
    const normalIdx = result.indexOf('🟢');

    expect(criticalIdx).toBeGreaterThan(-1);
    expect(importantIdx).toBeGreaterThan(-1);
    expect(normalIdx).toBeGreaterThan(-1);
    expect(criticalIdx).toBeLessThan(importantIdx);
    expect(importantIdx).toBeLessThan(normalIdx);

    // Content ordering
    expect(result.indexOf('Critical Breaking News')).toBeLessThan(
      result.indexOf('Normal News')
    );
    expect(result.indexOf('Normal News')).toBeLessThan(
      result.indexOf('Low Priority News')
    );

    vi.mocked(storeModule.initStore).mockRestore();
  });
});
