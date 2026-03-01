import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import yaml from 'js-yaml'
import { initConfig } from '../../src/commands/init'
import { importOpml } from '../../src/commands/import'

let tempDir: string
let configDir: string
let configPath: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-test-'))
  configDir = path.join(tempDir, 'config')
  configPath = path.join(configDir, 'config.yaml')
})

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
})

const VALID_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Hacker News" type="rss" xmlUrl="https://hnrss.org/frontpage" />
    <outline text="TechCrunch" type="rss" xmlUrl="https://techcrunch.com/feed/" />
  </body>
</opml>`

const NESTED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Tech" title="Tech Folder">
      <outline text="Hacker News" type="rss" xmlUrl="https://hnrss.org/frontpage" />
      <outline text="TechCrunch" type="rss" xmlUrl="https://techcrunch.com/feed/" />
    </outline>
    <outline text="News" title="News Folder">
      <outline text="BBC News" type="rss" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml" />
    </outline>
  </body>
</opml>`

const NO_RSS_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Empty</title></head>
  <body>
    <outline text="Just a folder">
      <outline text="A bookmark" type="link" url="https://example.com" />
    </outline>
  </body>
</opml>`

const MISSING_URL_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Partial</title></head>
  <body>
    <outline text="Good Feed" type="rss" xmlUrl="https://hnrss.org/frontpage" />
    <outline text="Bad Feed" type="rss" />
    <outline type="rss" xmlUrl="https://techcrunch.com/feed/" />
  </body>
</opml>`

const TITLE_ATTR_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Title Test</title></head>
  <body>
    <outline title="Title Feed" type="rss" xmlUrl="https://example.com/feed1" />
    <outline text="Text Feed" type="rss" xmlUrl="https://example.com/feed2" />
    <outline text="Both Text" title="Both Title" type="rss" xmlUrl="https://example.com/feed3" />
    <outline type="rss" xmlUrl="https://example.com/feed4" />
  </body>
</opml>`

describe('import command', () => {
  beforeEach(() => {
    fs.mkdirSync(configDir, { recursive: true })
  })

  it('should import all sources from valid OPML file', async () => {
    await initConfig(configPath)

    const opmlPath = path.join(tempDir, 'feeds.opml')
    fs.writeFileSync(opmlPath, VALID_OPML, 'utf-8')

    const result = await importOpml(opmlPath, configPath)

    expect(result).toContain('Imported 2 sources')
    expect(result).toContain('0 skipped')

    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    const sources = config.sources as Array<Record<string, unknown>>
    expect(sources).toHaveLength(2)
    expect(sources[0].url).toBe('https://hnrss.org/frontpage')
    expect(sources[0].name).toBe('Hacker News')
    expect(sources[0].type).toBe('rss')
    expect(sources[1].url).toBe('https://techcrunch.com/feed/')
    expect(sources[1].name).toBe('TechCrunch')
  })

  it('should skip sources that already exist in config', async () => {
    await initConfig(configPath)

    // First import
    const opmlPath = path.join(tempDir, 'feeds.opml')
    fs.writeFileSync(opmlPath, VALID_OPML, 'utf-8')
    await importOpml(opmlPath, configPath)

    // Second import of same file
    const result = await importOpml(opmlPath, configPath)

    expect(result).toContain('Imported 0 sources')
    expect(result).toContain('2 skipped')

    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    const sources = config.sources as Array<Record<string, unknown>>
    expect(sources).toHaveLength(2)
  })

  it('should handle nested OPML outlines (folders)', async () => {
    await initConfig(configPath)

    const opmlPath = path.join(tempDir, 'nested.opml')
    fs.writeFileSync(opmlPath, NESTED_OPML, 'utf-8')

    const result = await importOpml(opmlPath, configPath)

    expect(result).toContain('Imported 3 sources')

    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    const sources = config.sources as Array<Record<string, unknown>>
    expect(sources).toHaveLength(3)
    expect(sources[0].name).toBe('Hacker News')
    expect(sources[1].name).toBe('TechCrunch')
    expect(sources[2].name).toBe('BBC News')
  })

  it('should handle OPML with no RSS outlines', async () => {
    await initConfig(configPath)

    const opmlPath = path.join(tempDir, 'empty.opml')
    fs.writeFileSync(opmlPath, NO_RSS_OPML, 'utf-8')

    const result = await importOpml(opmlPath, configPath)

    expect(result).toContain('Imported 0 sources')
    expect(result).toContain('0 skipped')
  })

  it('should throw error for non-existent OPML file', async () => {
    await initConfig(configPath)

    const opmlPath = path.join(tempDir, 'nonexistent.opml')

    await expect(importOpml(opmlPath, configPath)).rejects.toThrow('OPML file not found')
  })

  it('should auto-create config file when missing', async () => {
    const opmlPath = path.join(tempDir, 'feeds.opml')
    fs.writeFileSync(opmlPath, VALID_OPML, 'utf-8')

    const missingConfigPath = path.join(tempDir, 'missing', 'config.yaml')

    // Should auto-create config and import successfully
    const result = await importOpml(opmlPath, missingConfigPath)
    expect(result).toContain('Imported')
    expect(fs.existsSync(missingConfigPath)).toBe(true)
  })

  it('should handle OPML with missing xmlUrl attributes gracefully', async () => {
    await initConfig(configPath)

    const opmlPath = path.join(tempDir, 'partial.opml')
    fs.writeFileSync(opmlPath, MISSING_URL_OPML, 'utf-8')

    const result = await importOpml(opmlPath, configPath)

    expect(result).toContain('Imported 2 sources')

    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    const sources = config.sources as Array<Record<string, unknown>>
    expect(sources).toHaveLength(2)
    expect(sources[0].url).toBe('https://hnrss.org/frontpage')
    expect(sources[1].url).toBe('https://techcrunch.com/feed/')
  })

  it('should use text/title as source name', async () => {
    await initConfig(configPath)

    const opmlPath = path.join(tempDir, 'titles.opml')
    fs.writeFileSync(opmlPath, TITLE_ATTR_OPML, 'utf-8')

    const result = await importOpml(opmlPath, configPath)

    expect(result).toContain('Imported 4 sources')

    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    const sources = config.sources as Array<Record<string, unknown>>
    expect(sources).toHaveLength(4)
    // title attribute used when text is not present
    expect(sources[0].name).toBe('Title Feed')
    // text attribute preferred
    expect(sources[1].name).toBe('Text Feed')
    // text attribute preferred over title
    expect(sources[2].name).toBe('Both Text')
    // fallback to hostname when neither text nor title present
    expect(sources[3].name).toBe('example.com')
  })
})
