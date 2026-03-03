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
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key-123"
  model: "deepseek-reasoner"

options:
  maxItems: 10
  maxContentLength: 65536
  concurrency: 8
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.baseUrl).toBe('https://api.deepseek.com')
    expect(config.llm.apiKey).toBe('test-key-123')
    expect(config.llm.model).toBe('deepseek-reasoner')
    expect(config.options.maxItems).toBe(10)
  })

  it('should resolve env var substitution in apiKey', () => {
    process.env.TEST_API_KEY = 'secret-key-from-env'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "\${TEST_API_KEY}"
  model: "deepseek-reasoner"
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
  baseUrl: "https://api.deepseek.com"
  apiKey: "\${DAILYBREW_API_KEY}"
  model: "deepseek-reasoner"
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
  baseUrl: "https://api.deepseek.com"
  apiKey: "\${NONEXISTENT_VAR}"
  model: "deepseek-reasoner"
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
  model: "deepseek-reasoner"
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
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.options.maxItems).toBe(10)
    expect(config.options.maxContentLength).toBe(65536)
    expect(config.options.concurrency).toBe(8)
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
  baseUrl: "https://api.deepseek.com"
  model: "deepseek-reasoner"
`
    fs.writeFileSync(configPath, configContent)

    expect(() => loadConfig(configPath)).toThrow(/apiKey/)
  })

  it('should ignore extra fields in YAML (like sources)', () => {
    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"

sources:
  - name: "Antirez"
    url: "http://antirez.com/"
    type: web
    selector: "h2 > a"
`
    fs.writeFileSync(configPath, configContent)

    // loadConfig should succeed — sources are ignored by configSchema
    const config = loadConfig(configPath)
    expect(config.llm.apiKey).toBe('test-key')
    expect(config.options.maxItems).toBe(10) // default applied
  })

  it('should support both DAILYBREW_API_KEY and explicit env var substitution', () => {
    process.env.DAILYBREW_API_KEY = 'key-from-env'

    const configPath = path.join(tempDir, 'config.yaml')
    const configContent = `
llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "\${DAILYBREW_API_KEY}"
  model: "deepseek-reasoner"
`
    fs.writeFileSync(configPath, configContent)

    const config = loadConfig(configPath)
    expect(config.llm.apiKey).toBe('key-from-env')

    delete process.env.DAILYBREW_API_KEY
  })
})
