import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Mock getDefaultConfigPath so sources module uses temp paths
vi.mock('../../src/config/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/loader')>()
  return {
    ...actual,
    getDefaultConfigPath: vi.fn(),
  }
})

import { loadSources, saveSources, ensureSources } from '../../src/config/sources'

let tempDir: string
let configDir: string
let configPath: string
let sourcesPath: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-sources-test-'))
  configDir = path.join(tempDir, 'config')
  configPath = path.join(configDir, 'config.yaml')
  sourcesPath = path.join(configDir, 'sources.yaml')

  // Point getDefaultConfigPath to temp dir
  const { getDefaultConfigPath } = await import('../../src/config/loader')
  vi.mocked(getDefaultConfigPath).mockReturnValue(configPath)
})

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('Config Sources', () => {
  describe('loadSources', () => {
    it('should return empty array when file does not exist', () => {
      const sources = loadSources(sourcesPath)

      expect(sources).toEqual([])
    })

    it('should load valid sources from YAML file', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(
        sourcesPath,
        `sources:
  - name: "Hacker News"
    url: "https://hnrss.org/frontpage"
    type: rss
  - name: "Antirez"
    url: "http://antirez.com/"
    type: web
    selector: "h2 > a"
`,
        'utf-8',
      )

      const sources = loadSources(sourcesPath)

      expect(sources).toHaveLength(2)
      expect(sources[0].name).toBe('Hacker News')
      expect(sources[0].url).toBe('https://hnrss.org/frontpage')
      expect(sources[0].type).toBe('rss')
      expect(sources[1].name).toBe('Antirez')
      expect(sources[1].type).toBe('web')
      expect(sources[1].selector).toBe('h2 > a')
    })

    it('should return empty array for file with no sources key', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(sourcesPath, 'other_key: value\n', 'utf-8')

      const sources = loadSources(sourcesPath)

      expect(sources).toEqual([])
    })

    it('should return empty array for file with empty sources', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(sourcesPath, 'sources: []\n', 'utf-8')

      const sources = loadSources(sourcesPath)

      expect(sources).toEqual([])
    })

    it('should skip invalid source entries', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(
        sourcesPath,
        `sources:
  - name: "Valid"
    url: "https://example.com/feed"
  - name: ""
    url: "https://example.com/other"
  - invalid_entry: true
`,
        'utf-8',
      )

      const sources = loadSources(sourcesPath)

      // Only the valid entry should be included
      expect(sources).toHaveLength(1)
      expect(sources[0].name).toBe('Valid')
    })

    it('should return empty array for null YAML content', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(sourcesPath, '', 'utf-8')

      const sources = loadSources(sourcesPath)

      expect(sources).toEqual([])
    })
  })

  describe('saveSources', () => {
    it('should write sources to YAML file', () => {
      const sources = [
        { name: 'Feed 1', url: 'https://feed1.com/rss', type: 'rss' as const },
        { name: 'Feed 2', url: 'https://feed2.com/rss', type: 'rss' as const },
      ]

      saveSources(sources, sourcesPath)

      expect(fs.existsSync(sourcesPath)).toBe(true)
      const content = fs.readFileSync(sourcesPath, 'utf-8')
      expect(content).toContain('Feed 1')
      expect(content).toContain('https://feed1.com/rss')
      expect(content).toContain('Feed 2')
    })

    it('should create directory if it does not exist', () => {
      const deepPath = path.join(tempDir, 'deep', 'nested', 'sources.yaml')
      const sources = [{ name: 'Feed', url: 'https://example.com/feed', type: 'rss' as const }]

      saveSources(sources, deepPath)

      expect(fs.existsSync(deepPath)).toBe(true)
    })

    it('should overwrite existing file', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(sourcesPath, 'old content', 'utf-8')

      const sources = [{ name: 'New', url: 'https://new.com/feed', type: 'rss' as const }]
      saveSources(sources, sourcesPath)

      const content = fs.readFileSync(sourcesPath, 'utf-8')
      expect(content).not.toContain('old content')
      expect(content).toContain('New')
    })

    it('should save empty sources array', () => {
      saveSources([], sourcesPath)

      expect(fs.existsSync(sourcesPath)).toBe(true)
      const loaded = loadSources(sourcesPath)
      expect(loaded).toEqual([])
    })
  })

  describe('ensureSources', () => {
    it('should create sources file if it does not exist', () => {
      fs.mkdirSync(configDir, { recursive: true })

      const result = ensureSources(sourcesPath)

      expect(result).toBe(sourcesPath)
      expect(fs.existsSync(sourcesPath)).toBe(true)
    })

    it('should return existing sources file path', () => {
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(
        sourcesPath,
        `sources:
  - name: "Existing"
    url: "https://existing.com/feed"
    type: rss
`,
        'utf-8',
      )

      const result = ensureSources(sourcesPath)

      expect(result).toBe(sourcesPath)
      const content = fs.readFileSync(sourcesPath, 'utf-8')
      expect(content).toContain('Existing')
    })

    it('should create directory structure for sources file', () => {
      const deepPath = path.join(tempDir, 'new', 'dir', 'sources.yaml')

      const result = ensureSources(deepPath)

      expect(result).toBe(deepPath)
      expect(fs.existsSync(deepPath)).toBe(true)
    })

    it('should write default content with comment header', () => {
      fs.mkdirSync(configDir, { recursive: true })

      ensureSources(sourcesPath)

      const content = fs.readFileSync(sourcesPath, 'utf-8')
      expect(content).toContain('dailybrew')
      expect(content).toContain('sources:')
    })
  })

  describe('round-trip save/load', () => {
    it('should preserve sources through save and load', () => {
      const original = [
        { name: 'HN', url: 'https://hnrss.org/frontpage', type: 'rss' as const },
        {
          name: 'Blog',
          url: 'https://blog.example.com/',
          type: 'web' as const,
          selector: 'article h2',
        },
      ]

      saveSources(original, sourcesPath)
      const loaded = loadSources(sourcesPath)

      expect(loaded).toHaveLength(2)
      expect(loaded[0].name).toBe('HN')
      expect(loaded[0].url).toBe('https://hnrss.org/frontpage')
      expect(loaded[1].name).toBe('Blog')
      expect(loaded[1].type).toBe('web')
      expect(loaded[1].selector).toBe('article h2')
    })
  })
})
