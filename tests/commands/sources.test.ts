import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import yaml from 'js-yaml'
import { initConfig } from '../../src/commands/init'
import { addSource, removeSource, listSources } from '../../src/commands/list'
import { configSet } from '../../src/commands/config'

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

describe('Source Management Commands', () => {
  describe('init command', () => {
    it('should create config file at default location with example content', async () => {
      // Create the config directory manually for test
      fs.mkdirSync(configDir, { recursive: true })

      const _result = await initConfig(configPath)

      expect(fs.existsSync(configPath)).toBe(true)
      const content = fs.readFileSync(configPath, 'utf-8')
      expect(content).toContain('dailybrew configuration')
      expect(content).toContain('llm:')
      expect(content).toContain('baseUrl:')
      expect(content).toContain('apiKey:')
      expect(content).toContain('model:')
      expect(content).toContain('sources:')
    })

    it('should refuse to overwrite existing config', async () => {
      fs.mkdirSync(configDir, { recursive: true })

      // Create initial config
      await initConfig(configPath)
      const firstContent = fs.readFileSync(configPath, 'utf-8')

      // Try to init again
      const result = await initConfig(configPath)

      // Should refuse to overwrite
      expect(result).toContain('already exists')
      const secondContent = fs.readFileSync(configPath, 'utf-8')
      expect(firstContent).toBe(secondContent)
    })

    it('should overwrite with --force flag', async () => {
      fs.mkdirSync(configDir, { recursive: true })

      // Create initial config
      await initConfig(configPath)

      // Init again with force
      const result = await initConfig(configPath, { force: true })

      expect(fs.existsSync(configPath)).toBe(true)
      expect(result).not.toContain('already exists')
    })
  })

  describe('add command', () => {
    beforeEach(() => {
      fs.mkdirSync(configDir, { recursive: true })
    })

    it('should append source to config YAML', async () => {
      await initConfig(configPath)

      await addSource(configPath, 'https://hnrss.org/frontpage')

      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources).toHaveLength(1)
      expect(config.sources[0].url).toBe('https://hnrss.org/frontpage')
      expect(config.sources[0].type).toBeDefined()
    })

    it('should use provided name when adding source', async () => {
      await initConfig(configPath)

      await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'My Source' })

      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources[0].name).toBe('My Source')
    })

    it('should force web type with selector', async () => {
      await initConfig(configPath)

      await addSource(configPath, 'http://antirez.com/', {
        selector: 'h2 > a',
      })

      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources[0].type).toBe('web')
      expect(config.sources[0].selector).toBe('h2 > a')
    })

    it('should add multiple sources to existing config', async () => {
      await initConfig(configPath)

      await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'HN' })
      await addSource(configPath, 'http://antirez.com/', { name: 'Antirez', selector: 'h2 > a' })

      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources).toHaveLength(2)
      expect(config.sources[0].name).toBe('HN')
      expect(config.sources[1].name).toBe('Antirez')
    })

    it('should not add duplicate URL', async () => {
      await initConfig(configPath)

      await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'HN' })
      const result = await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'HN2' })

      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources).toHaveLength(1)
      expect(result).toContain('already exists')
    })
  })

  describe('remove command', () => {
    beforeEach(async () => {
      fs.mkdirSync(configDir, { recursive: true })
      await initConfig(configPath)
      await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'HN' })
      await addSource(configPath, 'http://antirez.com/', { name: 'Antirez', selector: 'h2 > a' })
    })

    it('should remove source by URL', async () => {
      await removeSource(configPath, 'https://hnrss.org/frontpage')

      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources).toHaveLength(1)
      expect(config.sources[0].name).toBe('Antirez')
    })

    it('should show warning for non-existent URL', async () => {
      const result = await removeSource(configPath, 'https://non-existent.com/')

      expect(result).toContain('not found')
      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config.sources).toHaveLength(2)
    })

    it('should remove multiple sources one by one', async () => {
      await removeSource(configPath, 'https://hnrss.org/frontpage')
      const config1 = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config1.sources).toHaveLength(1)

      await removeSource(configPath, 'http://antirez.com/')
      const config2 = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
      expect(config2.sources).toHaveLength(0)
    })
  })

  describe('list command', () => {
    beforeEach(async () => {
      fs.mkdirSync(configDir, { recursive: true })
      await initConfig(configPath)
    })

    it('should display all configured sources in table format', async () => {
      await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'Hacker News' })
      await addSource(configPath, 'http://antirez.com/', {
        name: 'Antirez',
        selector: 'h2 > a',
      })

      const output = await listSources(configPath)

      expect(output).toContain('Hacker News')
      expect(output).toContain('https://hnrss.org/frontpage')
      expect(output).toContain('Antirez')
      expect(output).toContain('http://antirez.com/')
    })

    it('should show "no sources" message for empty config', async () => {
      const output = await listSources(configPath)

      expect(output.toLowerCase()).toContain('no sources')
    })

    it('should display source type in list', async () => {
      await addSource(configPath, 'https://hnrss.org/frontpage', { name: 'HN' })

      const output = await listSources(configPath)

      expect(output.toLowerCase()).toMatch(/rss|feed|type/)
    })
  })
})

describe('Config Command', () => {
  beforeEach(() => {
    fs.mkdirSync(configDir, { recursive: true })
  })

  it('should set a numeric option', async () => {
    await initConfig(configPath)
    const result = configSet(configPath, 'options.maxItems', '20')

    expect(result).toContain('→ 20')
    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
    expect(config.options.maxItems).toBe(20)
  })

  it('should set a string option', async () => {
    await initConfig(configPath)
    const result = configSet(configPath, 'llm.model', 'gpt-4o')

    expect(result).toContain('→ gpt-4o')
    const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
    expect(config.llm.model).toBe('gpt-4o')
  })

  it('should reject unknown keys', () => {
    initConfig(configPath)
    const result = configSet(configPath, 'unknown.key', 'value')

    expect(result).toContain('Unknown config key')
    expect(result).toContain('Settable keys')
  })

  it('should reject invalid number values', () => {
    initConfig(configPath)
    const result = configSet(configPath, 'options.maxItems', 'abc')

    expect(result).toContain('Invalid value')
    expect(result).toContain('positive integer')
  })

  it('should reject negative number values', () => {
    initConfig(configPath)
    const result = configSet(configPath, 'options.concurrency', '-1')

    expect(result).toContain('Invalid value')
  })
})
