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

import {
  loadWebhooks,
  saveWebhooks,
  listWebhooks,
  addWebhook,
  removeWebhook,
  toggleWebhook,
} from '../../src/commands/webhook'
import { initConfig } from '../../src/commands/init'

let tempDir: string
let configDir: string
let configPath: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailybrew-webhook-test-'))
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

describe('loadWebhooks', () => {
  it('should return empty array when config file does not exist', () => {
    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toEqual([])
  })

  it('should return empty array when config has no webhooks field', async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toEqual([])
  })

  it('should return empty array for null YAML content', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(configPath, '', 'utf-8')

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toEqual([])
  })

  it('should parse valid webhooks from config', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"
webhooks:
  - type: feishu
    name: team-bot
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc123"
    enabled: true
`,
      'utf-8',
    )

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].name).toBe('team-bot')
    expect(webhooks[0].type).toBe('feishu')
    expect(webhooks[0].url).toBe('https://open.feishu.cn/open-apis/bot/v2/hook/abc123')
    expect(webhooks[0].enabled).toBe(true)
  })

  it('should skip invalid webhook entries', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"
webhooks:
  - type: feishu
    name: valid-bot
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc123"
    enabled: true
  - type: unknown
    name: invalid-bot
    url: "not-a-url"
`,
      'utf-8',
    )

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].name).toBe('valid-bot')
  })

  it('should parse multiple valid webhooks', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"
webhooks:
  - type: feishu
    name: bot-1
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/aaa"
    enabled: true
  - type: feishu
    name: bot-2
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/bbb"
    enabled: false
`,
      'utf-8',
    )

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(2)
    expect(webhooks[0].name).toBe('bot-1')
    expect(webhooks[0].enabled).toBe(true)
    expect(webhooks[1].name).toBe('bot-2')
    expect(webhooks[1].enabled).toBe(false)
  })
})

describe('saveWebhooks', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
  })

  it('should save webhooks to config file', () => {
    saveWebhooks(configPath, [
      {
        type: 'feishu',
        name: 'team-bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc123',
        enabled: true,
      },
    ])

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('webhooks')
    expect(content).toContain('team-bot')
    expect(content).toContain('feishu')
  })

  it('should preserve existing config fields when saving webhooks', () => {
    saveWebhooks(configPath, [
      {
        type: 'feishu',
        name: 'bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc',
        enabled: true,
      },
    ])

    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('llm')
    expect(content).toContain('webhooks')
  })

  it('should remove webhooks key when saving empty array', () => {
    // First add a webhook
    saveWebhooks(configPath, [
      {
        type: 'feishu',
        name: 'bot',
        url: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc',
        enabled: true,
      },
    ])
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('webhooks')

    // Then remove all
    saveWebhooks(configPath, [])
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).not.toContain('webhooks')
  })
})

describe('listWebhooks', () => {
  it('should show "no webhooks" message when none configured', async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)

    const output = listWebhooks(configPath)
    expect(output).toContain('No webhooks configured')
    expect(output).toContain('dailybrew webhook add')
  })

  it('should display configured webhooks', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"
webhooks:
  - type: feishu
    name: team-bot
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc123"
    enabled: true
`,
      'utf-8',
    )

    const output = listWebhooks(configPath)
    expect(output).toContain('team-bot')
    expect(output).toContain('feishu')
    expect(output).toContain('https://open.feishu.cn/open-apis/bot/v2/hook/abc123')
    expect(output).toContain('enabled')
    expect(output).toContain('Total: 1 webhook(s)')
  })

  it('should show disabled status', () => {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      configPath,
      `llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "test-key"
  model: "deepseek-reasoner"
webhooks:
  - type: feishu
    name: paused-bot
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc123"
    enabled: false
`,
      'utf-8',
    )

    const output = listWebhooks(configPath)
    expect(output).toContain('disabled')
  })
})

describe('addWebhook', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
  })

  it('should add a feishu webhook', () => {
    const result = addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/abc123', {
      name: 'team-bot',
      type: 'feishu',
    })

    expect(result).toContain('Added webhook')
    expect(result).toContain('team-bot')
    expect(result).toContain('feishu')

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].name).toBe('team-bot')
    expect(webhooks[0].enabled).toBe(true)
  })

  it('should reject unknown webhook type', () => {
    const result = addWebhook(configPath, 'https://example.com/hook', {
      name: 'bad-bot',
      type: 'slack',
    })

    expect(result).toContain('Unknown webhook type')
    expect(result).toContain('Supported types')
    expect(result).toContain('feishu')
  })

  it('should reject duplicate name', () => {
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/aaa', {
      name: 'team-bot',
      type: 'feishu',
    })
    const result = addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/bbb', {
      name: 'team-bot',
      type: 'feishu',
    })

    expect(result).toContain('already exists')
    expect(loadWebhooks(configPath)).toHaveLength(1)
  })

  it('should reject duplicate URL', () => {
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/aaa', {
      name: 'bot-1',
      type: 'feishu',
    })
    const result = addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/aaa', {
      name: 'bot-2',
      type: 'feishu',
    })

    expect(result).toContain('already exists')
    expect(loadWebhooks(configPath)).toHaveLength(1)
  })

  it('should add multiple webhooks', () => {
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/aaa', {
      name: 'bot-1',
      type: 'feishu',
    })
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/bbb', {
      name: 'bot-2',
      type: 'feishu',
    })

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(2)
    expect(webhooks[0].name).toBe('bot-1')
    expect(webhooks[1].name).toBe('bot-2')
  })

  it('should reject invalid URL', () => {
    const result = addWebhook(configPath, 'not-a-url', {
      name: 'bad-bot',
      type: 'feishu',
    })

    expect(result).toContain('Invalid webhook')
  })
})

describe('removeWebhook', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/aaa', {
      name: 'bot-1',
      type: 'feishu',
    })
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/bbb', {
      name: 'bot-2',
      type: 'feishu',
    })
  })

  it('should remove webhook by name', () => {
    const result = removeWebhook(configPath, 'bot-1')

    expect(result).toContain('Removed webhook')
    expect(result).toContain('bot-1')

    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].name).toBe('bot-2')
  })

  it('should return error for non-existent webhook', () => {
    const result = removeWebhook(configPath, 'non-existent')

    expect(result).toContain('not found')
    expect(loadWebhooks(configPath)).toHaveLength(2)
  })

  it('should remove all webhooks one by one', () => {
    removeWebhook(configPath, 'bot-1')
    expect(loadWebhooks(configPath)).toHaveLength(1)

    removeWebhook(configPath, 'bot-2')
    expect(loadWebhooks(configPath)).toHaveLength(0)
  })

  it('should show message when no webhooks to remove', async () => {
    // Create fresh config with no webhooks
    const emptyConfigPath = path.join(configDir, 'empty-config.yaml')
    await initConfig(emptyConfigPath)

    const result = removeWebhook(emptyConfigPath, 'any')
    expect(result).toContain('No webhooks to remove')
  })
})

describe('toggleWebhook', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/aaa', {
      name: 'team-bot',
      type: 'feishu',
    })
  })

  it('should disable an enabled webhook', () => {
    const result = toggleWebhook(configPath, 'team-bot')

    expect(result).toContain('disabled')

    const webhooks = loadWebhooks(configPath)
    expect(webhooks[0].enabled).toBe(false)
  })

  it('should enable a disabled webhook', () => {
    // First disable
    toggleWebhook(configPath, 'team-bot')
    expect(loadWebhooks(configPath)[0].enabled).toBe(false)

    // Then enable
    const result = toggleWebhook(configPath, 'team-bot')
    expect(result).toContain('enabled')
    expect(loadWebhooks(configPath)[0].enabled).toBe(true)
  })

  it('should return error for non-existent webhook', () => {
    const result = toggleWebhook(configPath, 'non-existent')
    expect(result).toContain('not found')
  })
})

describe('Webhook Command Handler (citty)', () => {
  beforeEach(async () => {
    fs.mkdirSync(configDir, { recursive: true })
    await initConfig(configPath)
  })

  it('should list webhooks when no action provided', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({ args: {}, rawArgs: [] })

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('No webhooks configured'))
  })

  it('should add webhook with add action and all required args', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({
      args: { name: 'test-bot', type: 'feishu' },
      rawArgs: ['add', 'https://open.feishu.cn/open-apis/bot/v2/hook/test123'],
    })

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Added webhook'))
    const webhooks = loadWebhooks(configPath)
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].name).toBe('test-bot')
  })

  it('should log error when add is missing url', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({
      args: { name: 'test-bot', type: 'feishu' },
      rawArgs: ['add'],
    })

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage: dailybrew webhook add'),
    )
  })

  it('should log error when add is missing name', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({
      args: { type: 'feishu' },
      rawArgs: ['add', 'https://open.feishu.cn/open-apis/bot/v2/hook/test123'],
    })

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage: dailybrew webhook add'),
    )
  })

  it('should log error when add is missing type', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({
      args: { name: 'test-bot' },
      rawArgs: ['add', 'https://open.feishu.cn/open-apis/bot/v2/hook/test123'],
    })

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage: dailybrew webhook add'),
    )
  })

  it('should remove webhook with remove action and name', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    // First add a webhook
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/test', {
      name: 'test-bot',
      type: 'feishu',
    })

    await webhookCommand.run({
      args: {},
      rawArgs: ['remove', 'test-bot'],
    })

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Removed webhook'))
    expect(loadWebhooks(configPath)).toHaveLength(0)
  })

  it('should log error when remove is missing name', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({
      args: {},
      rawArgs: ['remove'],
    })

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage: dailybrew webhook remove'),
    )
  })

  it('should toggle webhook with toggle action and name', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    // First add a webhook
    addWebhook(configPath, 'https://open.feishu.cn/open-apis/bot/v2/hook/test', {
      name: 'test-bot',
      type: 'feishu',
    })

    await webhookCommand.run({
      args: {},
      rawArgs: ['toggle', 'test-bot'],
    })

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('disabled'))
    expect(loadWebhooks(configPath)[0].enabled).toBe(false)
  })

  it('should log error when toggle is missing name', async () => {
    const webhookCommand = (await import('../../src/commands/webhook')).default
    const { logger } = await import('../../src/utils/logger')

    await webhookCommand.run({
      args: {},
      rawArgs: ['toggle'],
    })

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage: dailybrew webhook toggle'),
    )
  })
})
