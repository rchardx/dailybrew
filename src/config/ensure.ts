import * as fs from 'node:fs'
import * as path from 'node:path'
import yaml from 'js-yaml'
import { consola } from 'consola'
import { getDefaultConfigPath } from './loader'
import { logger } from '../utils/logger'

const DEFAULT_CONFIG = `# dailybrew configuration
# Docs: https://github.com/rchardx/dailybrew

llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "\${DAILYBREW_API_KEY}"    # Set env var: export DAILYBREW_API_KEY=your-key
  model: "gpt-4o-mini"

options:
  maxItems: 10
  maxContentLength: 65536
  concurrency: 8
`

/**
 * Ensure a config file exists. If not, create one with defaults.
 * Returns the resolved config path.
 */
export function ensureConfig(configPath?: string): string {
  const finalPath = configPath || getDefaultConfigPath()

  if (fs.existsSync(finalPath)) {
    return finalPath
  }

  const configDir = path.dirname(finalPath)
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(finalPath, DEFAULT_CONFIG, 'utf-8')
  logger.info(`Config created at ${finalPath}`)

  return finalPath
}

/**
 * Check if LLM auth is configured (apiKey is not a placeholder or missing).
 * Returns true if auth is ready, false if interactive setup is needed.
 */
export function isAuthConfigured(configPath: string): boolean {
  if (!fs.existsSync(configPath)) {
    return false
  }

  const fileContent = fs.readFileSync(configPath, 'utf-8')
  const config = yaml.load(fileContent) as Record<string, unknown>
  const llm = config?.llm as Record<string, unknown> | undefined

  if (!llm?.apiKey) {
    return false
  }

  const apiKey = String(llm.apiKey)

  // Placeholder pattern: ${...} that hasn't been resolved
  if (/^\$\{.+\}$/.test(apiKey)) {
    // Check if the env var is actually set
    const varMatch = apiKey.match(/^\$\{(.+)\}$/)
    if (varMatch && process.env[varMatch[1]]) {
      return true
    }
    return false
  }

  return apiKey.length > 0
}

const PROVIDER_PRESETS: Record<string, { baseUrl: string; model: string }> = {
  OpenAI: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  OpenRouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  Groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  'Local (LM Studio / Ollama)': { baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
}

/**
 * Interactively prompt the user for LLM provider configuration.
 * Writes the result back to the config file.
 * Returns true if auth was set up, false if cancelled.
 */
export async function ensureAuth(
  configPath: string,
  options?: { force?: boolean },
): Promise<boolean> {
  if (!options?.force && isAuthConfigured(configPath)) {
    return true
  }

  logger.info("LLM provider not configured. Let's set it up.\n")

  // Step 1: Pick provider
  const providerNames = Object.keys(PROVIDER_PRESETS)
  const provider = (await consola.prompt('Select your LLM provider:', {
    type: 'select',
    options: [...providerNames, 'Custom'],
  })) as unknown as string

  if (typeof provider === 'symbol') {
    // User cancelled (Ctrl+C)
    return false
  }

  let baseUrl: string
  let model: string

  if (provider === 'Custom') {
    const customBaseUrl = (await consola.prompt('Base URL (OpenAI-compatible):', {
      type: 'text',
      placeholder: 'https://api.example.com/v1',
    })) as unknown as string
    if (typeof customBaseUrl === 'symbol' || !customBaseUrl) return false
    baseUrl = customBaseUrl

    const customModel = (await consola.prompt('Model name:', {
      type: 'text',
      placeholder: 'gpt-4o-mini',
    })) as unknown as string
    if (typeof customModel === 'symbol' || !customModel) return false
    model = customModel
  } else {
    const preset = PROVIDER_PRESETS[provider]
    baseUrl = preset.baseUrl
    model = preset.model

    // Let user override model
    const modelInput = (await consola.prompt(`Model (default: ${model}):`, {
      type: 'text',
      default: model,
    })) as unknown as string
    if (typeof modelInput === 'symbol') return false
    if (modelInput) model = modelInput
  }

  // Step 2: API key
  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
  let apiKey: string

  if (isLocal) {
    const keyInput = (await consola.prompt('API key (press Enter to skip for local):', {
      type: 'text',
      default: 'not-needed',
    })) as unknown as string
    if (typeof keyInput === 'symbol') return false
    apiKey = keyInput || 'not-needed'
  } else {
    const keyInput = (await consola.prompt('API key:', {
      type: 'text',
      placeholder: 'sk-...',
    })) as unknown as string
    if (typeof keyInput === 'symbol' || !keyInput) {
      logger.warn('API key is required for remote providers.')
      return false
    }
    apiKey = keyInput
  }

  // Step 3: Write to config
  const fileContent = fs.readFileSync(configPath, 'utf-8')
  const config = yaml.load(fileContent) as Record<string, unknown>

  if (!config.llm) {
    config.llm = {}
  }

  const llm = config.llm as Record<string, unknown>
  llm.baseUrl = baseUrl
  llm.apiKey = apiKey
  llm.model = model

  const yamlDump = yaml.dump(config, { lineWidth: -1 })
  fs.writeFileSync(configPath, yamlDump, 'utf-8')

  logger.success(`LLM configured: ${provider} (${model})`)
  logger.info(`Config saved to ${configPath}\n`)

  return true
}
