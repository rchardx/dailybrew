import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Mock getDefaultConfigPath to use temp dirs
vi.mock('../../src/config/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/loader')>()
  return {
    ...actual,
    getDefaultConfigPath: vi.fn(),
  }
})

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

import { configSet, configShow } from '../../src/commands/config'
import { initConfig } from '../../src/commands/init'

let tempDir: string
let configDir: string
let configPath: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-config-test-'))
  configDir = path.join(tempDir, 'config')
  configPath = path.join(configDir, 'config.yaml')

  const { getDefaultConfigPath } = await import('../../src/config/loader')
  vi.mocked(getDefaultConfigPath).mockReturnValue(configPath)
})

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('configSet', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
  })

  it('should set a string config value', () => {
    const result = configSet(configPath, 'llm.model', 'gpt-4o')

    expect(result).toContain('→ gpt-4o')
  })

  it('should set a numeric config value', () => {
    const result = configSet(configPath, 'options.maxItems', '20')

    expect(result).toContain('→ 20')
  })

  it('should show old and new values', () => {
    const result = configSet(configPath, 'llm.model', 'deepseek-chat')

    expect(result).toContain('gpt-4o-mini')
    expect(result).toContain('→')
    expect(result).toContain('deepseek-chat')
  })

  it('should persist changes to disk', () => {
    configSet(configPath, 'llm.model', 'my-new-model')

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('my-new-model')
  })

  it('should reject unknown config keys', () => {
    const result = configSet(configPath, 'unknown.key', 'value')

    expect(result).toContain('Unknown config key')
    expect(result).toContain('Settable keys')
  })

  it('should reject non-integer for numeric fields', () => {
    const result = configSet(configPath, 'options.maxItems', 'abc')

    expect(result).toContain('Invalid value')
    expect(result).toContain('positive integer')
  })

  it('should reject negative numbers for numeric fields', () => {
    const result = configSet(configPath, 'options.concurrency', '-1')

    expect(result).toContain('Invalid value')
  })

  it('should reject zero for numeric fields', () => {
    const result = configSet(configPath, 'options.maxItems', '0')

    expect(result).toContain('Invalid value')
  })

  it('should reject fractional numbers for numeric fields', () => {
    const result = configSet(configPath, 'options.maxItems', '3.5')

    expect(result).toContain('Invalid value')
  })

  it('should set llm.baseUrl correctly', () => {
    const result = configSet(configPath, 'llm.baseUrl', 'https://custom.api.com/v1')

    expect(result).toContain('→ https://custom.api.com/v1')
  })

  it('should set llm.apiKey correctly', () => {
    const result = configSet(configPath, 'llm.apiKey', 'sk-new-key')

    expect(result).toContain('→ sk-new-key')
  })

  it('should set options.maxContentLength correctly', () => {
    const result = configSet(configPath, 'options.maxContentLength', '32000')

    expect(result).toContain('→ 32000')
  })
})

describe('configShow', () => {
  it('should return null contents when config file does not exist', () => {
    const result = configShow(configPath)

    expect(result.path).toBe(configPath)
    expect(result.contents).toBeNull()
  })

  it('should return config contents when file exists', async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)

    const result = configShow(configPath)

    expect(result.path).toBe(configPath)
    expect(result.contents).not.toBeNull()
    expect(result.contents).toContain('llm')
    expect(result.contents).toContain('baseUrl')
    expect(result.contents).toContain('model')
  })

  it('should strip sources key from output (legacy configs)', async () => {
    fs.mkdirSync(configDir, { recursive: true })
    const configWithSources = `llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "test-key"
  model: "gpt-4o-mini"
sources:
  - name: "HN"
    url: "https://hnrss.org/frontpage"
options:
  maxItems: 10
  maxContentLength: 65536
  concurrency: 8
`
    fs.writeFileSync(configPath, configWithSources, 'utf-8')

    const result = configShow(configPath)

    expect(result.contents).not.toBeNull()
    expect(result.contents).not.toContain('sources')
    expect(result.contents).toContain('llm')
  })

  it('should return null contents for empty YAML file', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(configPath, '', 'utf-8')

    const result = configShow(configPath)

    expect(result.path).toBe(configPath)
    expect(result.contents).toBeNull()
  })

  it('should use provided configPath', async () => {
    const customPath = path.join(tempDir, 'custom.yaml')
    fs.writeFileSync(
      customPath,
      `llm:
  baseUrl: "https://custom.com/v1"
  apiKey: "key"
  model: "model"
`,
      'utf-8',
    )

    const result = configShow(customPath)

    expect(result.path).toBe(customPath)
    expect(result.contents).toContain('custom.com')
  })
})
