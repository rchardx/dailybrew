import * as fs from 'node:fs'
import * as path from 'node:path'
import yaml from 'js-yaml'
import envPaths from 'env-paths'
import { configSchema, type Config } from './schema'

/**
 * Resolves environment variable substitutions in string values
 * Pattern: ${VAR_NAME} is replaced with process.env.VAR_NAME
 */
function resolveEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    // Replace ${VAR_NAME} with env var value
    return obj.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
      const value = process.env[varName]
      if (value === undefined) {
        throw new Error(
          `Environment variable '${varName}' is not set (referenced in config as '${match}')`,
        )
      }
      return value
    })
  }

  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars)
  }

  if (obj !== null && typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      result[key] = resolveEnvVars(obj[key])
    }
    return result
  }

  return obj
}

/**
 * Loads and parses a config YAML file
 * Supports:
 * - Environment variable substitution: ${VAR_NAME}
 * - Zod validation with clear error messages
 * - Default values for options
 */
export function loadConfig(configPath: string): Config {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }

  let rawYaml: any
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8')
    rawYaml = yaml.load(fileContent)
  } catch (error) {
    throw new Error(
      `Failed to parse YAML config: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  // Resolve environment variables
  let configWithEnvVars: any
  try {
    configWithEnvVars = resolveEnvVars(rawYaml)
  } catch (error) {
    throw new Error(
      `Failed to resolve environment variables in config: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  // Validate with Zod schema
  const validation = configSchema.safeParse(configWithEnvVars)

  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
        return `  - ${path}: ${issue.message}`
      })
      .join('\n')

    throw new Error(`Config validation failed:\n${errorMessages}`)
  }

  return validation.data
}

/**
 * Gets the default config path using env-paths
 * Returns: ~/.config/dailybrew/config.yaml (cross-platform)
 */
export function getDefaultConfigPath(): string {
  const paths = envPaths('dailybrew')
  return path.join(paths.config, 'config.yaml')
}

/**
 * Loads config from a specified path or default path
 * Supports CLI flag override
 */
export function loadConfigWithDefaults(configPathOverride?: string): Config {
  const configPath = configPathOverride || getDefaultConfigPath()
  return loadConfig(configPath)
}
