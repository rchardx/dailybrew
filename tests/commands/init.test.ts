import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

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

import { initConfig } from '../../src/commands/init'

let tempDir: string
let configDir: string
let configPath: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-init-test-'))
  configDir = path.join(tempDir, 'config')
  configPath = path.join(configDir, 'config.yaml')
})

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('initConfig', () => {
  it('should create config file at specified path', async () => {
    fs.mkdirSync(configDir, { recursive: true })

    const result = await initConfig(configPath)

    expect(fs.existsSync(configPath)).toBe(true)
    expect(result).toContain('Config initialized')
    expect(result).toContain(configPath)
  })

  it('should create config directory if it does not exist', async () => {
    const result = await initConfig(configPath)

    expect(fs.existsSync(configDir)).toBe(true)
    expect(fs.existsSync(configPath)).toBe(true)
    expect(result).toContain('Config initialized')
  })

  it('should write example config with LLM settings', async () => {
    const result = await initConfig(configPath)

    expect(result).toContain('Config initialized')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('llm:')
    expect(content).toContain('baseUrl:')
    expect(content).toContain('apiKey:')
    expect(content).toContain('model:')
  })

  it('should include options section in example config', async () => {
    await initConfig(configPath)

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('options:')
    expect(content).toContain('maxItems:')
    expect(content).toContain('maxContentLength:')
    expect(content).toContain('concurrency:')
  })

  it('should include comment header', async () => {
    await initConfig(configPath)

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('# dailybrew configuration')
  })

  it('should refuse to overwrite existing config without force', async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
    const firstContent = fs.readFileSync(configPath, 'utf-8')

    const result = await initConfig(configPath)

    expect(result).toContain('already exists')
    const secondContent = fs.readFileSync(configPath, 'utf-8')
    expect(firstContent).toBe(secondContent)
  })

  it('should overwrite existing config with force option', async () => {
    fs.mkdirSync(configDir, { recursive: true })

    // Write custom content first
    fs.writeFileSync(configPath, 'custom: content\n', 'utf-8')

    const result = await initConfig(configPath, { force: true })

    expect(result).toContain('Config initialized')
    expect(result).not.toContain('already exists')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('llm:')
    expect(content).not.toContain('custom: content')
  })

  it('should mention sources.yaml in config', async () => {
    await initConfig(configPath)

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('sources.yaml')
  })

  it('should create config in deeply nested directory', async () => {
    const deepPath = path.join(tempDir, 'a', 'b', 'c', 'config.yaml')

    const result = await initConfig(deepPath)

    expect(result).toContain('Config initialized')
    expect(fs.existsSync(deepPath)).toBe(true)
  })

  it('should produce valid YAML content', async () => {
    await initConfig(configPath)

    const content = fs.readFileSync(configPath, 'utf-8')
    // Should not throw when loaded as YAML
    const yaml = await import('js-yaml')
    const parsed = yaml.load(content) as Record<string, unknown>
    expect(parsed).toHaveProperty('llm')
    expect(parsed).toHaveProperty('options')
  })
})
