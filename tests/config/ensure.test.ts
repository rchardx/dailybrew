import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import yaml from 'js-yaml'
import { ensureConfig, isAuthConfigured, ensureAuth } from '../../src/config/ensure'

let tempDir: string
let configDir: string
let configPath: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-ensure-'))
  configDir = path.join(tempDir, 'config')
  configPath = path.join(configDir, 'config.yaml')
})

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true })
  }
  vi.restoreAllMocks()
})

describe('ensureConfig', () => {
  it('should create config file if it does not exist', () => {
    const result = ensureConfig(configPath)

    expect(result).toBe(configPath)
    expect(fs.existsSync(configPath)).toBe(true)

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('dailybrew configuration')
    expect(content).toContain('llm:')
    // sources are now in sources.yaml, not config.yaml
    expect(content).toContain('options:')
  })

  it('should return existing config path without overwriting', () => {
    fs.mkdirSync(configDir, { recursive: true })
    const customContent = 'custom: true\n'
    fs.writeFileSync(configPath, customContent, 'utf-8')

    const result = ensureConfig(configPath)

    expect(result).toBe(configPath)
    // Content should NOT be overwritten
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toBe(customContent)
  })

  it('should create nested directories as needed', () => {
    const deepPath = path.join(tempDir, 'a', 'b', 'c', 'config.yaml')

    const result = ensureConfig(deepPath)

    expect(result).toBe(deepPath)
    expect(fs.existsSync(deepPath)).toBe(true)
  })
})

describe('isAuthConfigured', () => {
  beforeEach(() => {
    fs.mkdirSync(configDir, { recursive: true })
  })

  it('should return false if config file does not exist', () => {
    expect(isAuthConfigured(configPath)).toBe(false)
  })

  it('should return false if apiKey is a placeholder and env var is not set', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder for testing
        apiKey: '${DAILYBREW_API_KEY}',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    delete process.env.DAILYBREW_API_KEY
    expect(isAuthConfigured(configPath)).toBe(false)
  })

  it('should return true if apiKey is a placeholder but env var IS set', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder for testing
        apiKey: '${DAILYBREW_TEST_KEY}',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    process.env.DAILYBREW_TEST_KEY = 'sk-test-123'
    expect(isAuthConfigured(configPath)).toBe(true)
    delete process.env.DAILYBREW_TEST_KEY
  })

  it('should return true if apiKey is a real value', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-real-key-here',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    expect(isAuthConfigured(configPath)).toBe(true)
  })

  it('should return false if llm section is missing', () => {
    const config = { sources: [] }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    expect(isAuthConfigured(configPath)).toBe(false)
  })

  it('should return false if apiKey is empty string', () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    expect(isAuthConfigured(configPath)).toBe(false)
  })
})

describe('ensureAuth', () => {
  beforeEach(() => {
    fs.mkdirSync(configDir, { recursive: true })
  })

  it('should return true immediately if already configured', async () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-existing-key',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    const result = await ensureAuth(configPath)
    expect(result).toBe(true)
  })

  it('should return false when user cancels provider selection', async () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder for testing
        apiKey: '${DAILYBREW_API_KEY}',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')
    delete process.env.DAILYBREW_API_KEY

    // Mock consola.prompt to return Symbol (cancel)
    const { consola } = await import('consola')
    vi.spyOn(consola, 'prompt').mockResolvedValueOnce(Symbol('cancel') as any)

    const result = await ensureAuth(configPath)
    expect(result).toBe(false)
  })

  it('should write config when user completes setup with preset', async () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder for testing
        apiKey: '${DAILYBREW_API_KEY}',
        model: 'gpt-4o-mini',
      },
      sources: [],
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')
    delete process.env.DAILYBREW_API_KEY

    const { consola } = await import('consola')
    const promptMock = vi.spyOn(consola, 'prompt')
    // Step 1: Select provider
    promptMock.mockResolvedValueOnce('OpenAI' as any)
    // Step 2: Model (accept default)
    promptMock.mockResolvedValueOnce('gpt-4o-mini' as any)
    // Step 3: API key
    promptMock.mockResolvedValueOnce('sk-test-key-123' as any)

    const result = await ensureAuth(configPath)
    expect(result).toBe(true)

    // Verify config was written
    const updatedConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
    expect(updatedConfig.llm.baseUrl).toBe('https://api.openai.com/v1')
    expect(updatedConfig.llm.apiKey).toBe('sk-test-key-123')
    expect(updatedConfig.llm.model).toBe('gpt-4o-mini')
  })

  it('should write config for custom provider', async () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder for testing
        apiKey: '${DAILYBREW_API_KEY}',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')
    delete process.env.DAILYBREW_API_KEY

    const { consola } = await import('consola')
    const promptMock = vi.spyOn(consola, 'prompt')
    // Step 1: Select Custom
    promptMock.mockResolvedValueOnce('Custom' as any)
    // Step 2: Base URL
    promptMock.mockResolvedValueOnce('https://my-llm.example.com/v1' as any)
    // Step 3: Model
    promptMock.mockResolvedValueOnce('my-model' as any)
    // Step 4: API key
    promptMock.mockResolvedValueOnce('custom-key-456' as any)

    const result = await ensureAuth(configPath)
    expect(result).toBe(true)

    const updatedConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
    expect(updatedConfig.llm.baseUrl).toBe('https://my-llm.example.com/v1')
    expect(updatedConfig.llm.apiKey).toBe('custom-key-456')
    expect(updatedConfig.llm.model).toBe('my-model')
  })

  it('should allow skipping API key for local providers', async () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional placeholder for testing
        apiKey: '${DAILYBREW_API_KEY}',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')
    delete process.env.DAILYBREW_API_KEY

    const { consola } = await import('consola')
    const promptMock = vi.spyOn(consola, 'prompt')
    // Select local provider
    promptMock.mockResolvedValueOnce('Local (LM Studio / Ollama)' as any)
    // Model (accept default)
    promptMock.mockResolvedValueOnce('local-model' as any)
    // API key (accept default 'not-needed')
    promptMock.mockResolvedValueOnce('not-needed' as any)

    const result = await ensureAuth(configPath)
    expect(result).toBe(true)

    const updatedConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
    expect(updatedConfig.llm.baseUrl).toBe('http://localhost:1234/v1')
    expect(updatedConfig.llm.apiKey).toBe('not-needed')
  })

  it('should re-prompt when force option is set even if configured', async () => {
    const config = {
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-existing-key',
        model: 'gpt-4o-mini',
      },
    }
    fs.writeFileSync(configPath, yaml.dump(config), 'utf-8')

    const { consola } = await import('consola')
    const promptMock = vi.spyOn(consola, 'prompt')
    promptMock.mockResolvedValueOnce('Groq' as any)
    promptMock.mockResolvedValueOnce('llama-3.3-70b-versatile' as any)
    promptMock.mockResolvedValueOnce('gsk-new-key' as any)

    const result = await ensureAuth(configPath, { force: true })
    expect(result).toBe(true)

    const updatedConfig = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any
    expect(updatedConfig.llm.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(updatedConfig.llm.apiKey).toBe('gsk-new-key')
  })
})
