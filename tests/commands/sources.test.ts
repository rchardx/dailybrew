import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { initConfig } from '../../src/commands/init'
import { configSet } from '../../src/commands/config'

// Mock getDefaultConfigPath so sources module uses temp paths
vi.mock('../../src/config/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/loader')>()
  return {
    ...actual,
    getDefaultConfigPath: vi.fn(),
  }
})

// Mock feed detection and fetching (addSource does test-fetch)
vi.mock('../../src/sources/detect', () => ({
  detectFeedUrl: vi.fn(),
}))

vi.mock('../../src/sources/rss', () => ({
  fetchRssFeed: vi.fn(),
}))

vi.mock('../../src/sources/web', () => ({
  fetchWebPage: vi.fn(),
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

import { addSource, removeSource, listSources } from '../../src/commands/list'
import { loadSources } from '../../src/config/sources'
import { detectFeedUrl } from '../../src/sources/detect'
import { fetchRssFeed } from '../../src/sources/rss'
import { fetchWebPage } from '../../src/sources/web'

let tempDir: string
let configDir: string
let configPath: string
let sourcesPath: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-test-'))
  configDir = path.join(tempDir, 'config')
  configPath = path.join(configDir, 'config.yaml')
  sourcesPath = path.join(tempDir, 'config', 'sources.yaml')

  // Point getDefaultConfigPath to temp dir
  const { getDefaultConfigPath } = await import('../../src/config/loader')
  vi.mocked(getDefaultConfigPath).mockReturnValue(configPath)

  // Default mocks: detect returns null (fall back to rss), fetch succeeds
  vi.mocked(detectFeedUrl).mockResolvedValue(null)
  vi.mocked(fetchRssFeed).mockResolvedValue({ items: [], errors: [] })
  vi.mocked(fetchWebPage).mockResolvedValue({ items: [], errors: [] })
})

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('Source Management Commands', () => {
  describe('init command', () => {
    it('should create config file at default location with example content', async () => {
      fs.mkdirSync(configDir, { recursive: true })

      const _result = await initConfig(configPath)

      expect(fs.existsSync(configPath)).toBe(true)
      const content = fs.readFileSync(configPath, 'utf-8')
      expect(content).toContain('dailybrew configuration')
      expect(content).toContain('llm:')
      expect(content).toContain('baseUrl:')
      expect(content).toContain('apiKey:')
      expect(content).toContain('model:')
      // sources are now in sources.yaml, not config.yaml
      expect(content).toContain('sources.yaml')
    })

    it('should refuse to overwrite existing config', async () => {
      fs.mkdirSync(configDir, { recursive: true })

      await initConfig(configPath)
      const firstContent = fs.readFileSync(configPath, 'utf-8')

      const result = await initConfig(configPath)

      expect(result).toContain('already exists')
      const secondContent = fs.readFileSync(configPath, 'utf-8')
      expect(firstContent).toBe(secondContent)
    })

    it('should overwrite with --force flag', async () => {
      fs.mkdirSync(configDir, { recursive: true })

      await initConfig(configPath)

      const result = await initConfig(configPath, { force: true })

      expect(fs.existsSync(configPath)).toBe(true)
      expect(result).not.toContain('already exists')
    })
  })

  describe('add command', () => {
    it('should append source to sources.yaml', async () => {
      const result = await addSource('https://hnrss.org/frontpage')

      expect(result).toContain('Added source')

      const sources = loadSources(sourcesPath)
      expect(sources).toHaveLength(1)
      expect(sources[0].url).toBe('https://hnrss.org/frontpage')
      expect(sources[0].type).toBeDefined()
    })

    it('should use provided name when adding source', async () => {
      await addSource('https://hnrss.org/frontpage', { name: 'My Source' })

      const sources = loadSources(sourcesPath)
      expect(sources[0].name).toBe('My Source')
    })

    it('should force web type with selector', async () => {
      await addSource('http://antirez.com/', {
        selector: 'h2 > a',
      })

      const sources = loadSources(sourcesPath)
      expect(sources[0].type).toBe('web')
      expect(sources[0].selector).toBe('h2 > a')
    })

    it('should add multiple sources to existing config', async () => {
      await addSource('https://hnrss.org/frontpage', { name: 'HN' })
      await addSource('http://antirez.com/', { name: 'Antirez', selector: 'h2 > a' })

      const sources = loadSources(sourcesPath)
      expect(sources).toHaveLength(2)
      expect(sources[0].name).toBe('HN')
      expect(sources[1].name).toBe('Antirez')
    })

    it('should not add duplicate URL', async () => {
      await addSource('https://hnrss.org/frontpage', { name: 'HN' })
      const result = await addSource('https://hnrss.org/frontpage', { name: 'HN2' })

      const sources = loadSources(sourcesPath)
      expect(sources).toHaveLength(1)
      expect(result).toContain('already exists')
    })
  })

  describe('remove command', () => {
    beforeEach(async () => {
      await addSource('https://hnrss.org/frontpage', { name: 'HN' })
      await addSource('http://antirez.com/', { name: 'Antirez', selector: 'h2 > a' })
    })

    it('should remove source by URL', async () => {
      await removeSource('https://hnrss.org/frontpage')

      const sources = loadSources(sourcesPath)
      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('Antirez')
    })

    it('should show warning for non-existent URL', async () => {
      const result = await removeSource('https://non-existent.com/')

      expect(result).toContain('not found')
      const sources = loadSources(sourcesPath)
      expect(sources).toHaveLength(2)
    })

    it('should remove multiple sources one by one', async () => {
      await removeSource('https://hnrss.org/frontpage')
      const sources1 = loadSources(sourcesPath)
      expect(sources1).toHaveLength(1)

      await removeSource('http://antirez.com/')
      const sources2 = loadSources(sourcesPath)
      expect(sources2).toHaveLength(0)
    })
  })

  describe('list command', () => {
    it('should display all configured sources in list format', async () => {
      await addSource('https://hnrss.org/frontpage', { name: 'Hacker News' })
      await addSource('http://antirez.com/', {
        name: 'Antirez',
        selector: 'h2 > a',
      })

      const output = await listSources()

      expect(output).toContain('Hacker News')
      expect(output).toContain('https://hnrss.org/frontpage')
      expect(output).toContain('Antirez')
      expect(output).toContain('http://antirez.com/')
    })

    it('should show "no sources" message for empty config', async () => {
      const output = await listSources()

      expect(output.toLowerCase()).toContain('no sources')
    })

    it('should display source type in list', async () => {
      await addSource('https://hnrss.org/frontpage', { name: 'HN' })

      const output = await listSources()

      expect(output.toLowerCase()).toMatch(/rss|feed|type/)
    })
  })
})

describe('Config Command', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
  })

  it('should set a numeric option', async () => {
    const result = configSet(configPath, 'options.maxItems', '20')

    expect(result).toContain('→ 20')
  })

  it('should set a string option', async () => {
    const result = configSet(configPath, 'llm.model', 'gpt-4o')

    expect(result).toContain('→ gpt-4o')
  })

  it('should reject unknown keys', () => {
    const result = configSet(configPath, 'unknown.key', 'value')

    expect(result).toContain('Unknown config key')
    expect(result).toContain('Settable keys')
  })

  it('should reject invalid number values', () => {
    const result = configSet(configPath, 'options.maxItems', 'abc')

    expect(result).toContain('Invalid value')
    expect(result).toContain('positive integer')
  })

  it('should reject negative number values', () => {
    const result = configSet(configPath, 'options.concurrency', '-1')

    expect(result).toContain('Invalid value')
  })
})
