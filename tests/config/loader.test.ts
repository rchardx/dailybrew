import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '../../src/config/loader'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

describe('Config Loader', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should load valid YAML config from file', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "test-key-123"
  model: "gpt-4o-mini"

sources:
  - name: "Hacker News"
    url: "https://hnrss.org/frontpage"
    type: rss

options:
  maxItems: 50
  maxContentLength: 4000
  concurrency: 5
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.baseUrl).toBe('https://api.openai.com/v1')
    expect(config.llm.apiKey).toBe('test-key-123')
    expect(config.llm.model).toBe('gpt-4o-mini')
    expect(config.sources).toHaveLength(1)
    expect(config.sources[0].name).toBe('Hacker News')
    expect(config.options.maxItems).toBe(50)
  })

  it('should resolve env var substitution in apiKey', () => {
    process.env.TEST_API_KEY = 'secret-key-from-env'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "\${TEST_API_KEY}"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.apiKey).toBe('secret-key-from-env')

    delete process.env.TEST_API_KEY
  })

  it('should resolve DAILYBREW_API_KEY env var', () => {
    process.env.DAILYBREW_API_KEY = 'my-api-key'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "\${DAILYBREW_API_KEY}"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.apiKey).toBe('my-api-key')

    delete process.env.DAILYBREW_API_KEY
  })

  it('should throw error on missing env var in substitution', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "\${NONEXISTENT_VAR}"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    expect(() => loadConfig(configPath)).toThrow(/NONEXISTENT_VAR/)
  })

  it('should resolve env vars in multiple fields', () => {
    process.env.BASE_URL = 'https://custom.api.com/v1'
    process.env.API_KEY = 'custom-key'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "\${BASE_URL}"
  apiKey: "\${API_KEY}"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.baseUrl).toBe('https://custom.api.com/v1')
    expect(config.llm.apiKey).toBe('custom-key')

    delete process.env.BASE_URL
    delete process.env.API_KEY
  })

  it('should apply default options when not specified', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "test-key"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.options.maxItems).toBe(50)
    expect(config.options.maxContentLength).toBe(4000)
    expect(config.options.concurrency).toBe(5)
  })

  it('should throw error on invalid YAML', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    fs.writeFileSync(configPath, 'invalid: yaml: content: [')

    expect(() => loadConfig(configPath)).toThrow()
  })

  it('should throw error when file does not exist', () => {
    const nonExistentPath = path.join(tempDir, 'nonexistent.yaml')

    expect(() => loadConfig(nonExistentPath)).toThrow()
  })

  it('should throw error on validation failure with clear message', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    expect(() => loadConfig(configPath)).toThrow(/apiKey/)
  })

  it('should handle sources with all fields', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "test-key"
  model: "gpt-4o-mini"

sources:
  - name: "Antirez"
    url: "http://antirez.com/"
    type: web
    selector: "h2 > a"
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.sources[0].selector).toBe('h2 > a')
    expect(config.sources[0].type).toBe('web')
  })

  it('should handle multiple sources', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "test-key"
  model: "gpt-4o-mini"

sources:
  - name: "HN"
    url: "https://hnrss.org/frontpage"
    type: rss
  - name: "Antirez"
    url: "http://antirez.com/"
    type: web
    selector: "h2 > a"
  - name: "Example"
    url: "https://example.com"
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.sources).toHaveLength(3)
  })

  it('should support both DAILYBREW_API_KEY and explicit env var substitution', () => {
    process.env.DAILYBREW_API_KEY = 'key-from-env'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "\${DAILYBREW_API_KEY}"
  model: "gpt-4o-mini"

sources: []
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.apiKey).toBe('key-from-env')

    delete process.env.DAILYBREW_API_KEY
  })

  it('should resolve env var in source URL field', () => {
    process.env.FEED_URL = 'https://example.com/feed'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "test-key"
  model: "gpt-4o-mini"

sources:
  - name: "Dynamic Feed"
    url: "\${FEED_URL}"
    type: rss
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.sources[0].url).toBe('https://example.com/feed')

    delete process.env.FEED_URL
  })
})
