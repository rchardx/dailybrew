import * as fs from 'node:fs'
import * as path from 'node:path'
import yaml from 'js-yaml'
import { sourceSchema, type Source } from './schema'
import { getDefaultConfigPath } from './loader'

/**
 * Get the default sources file path (sibling to config.yaml).
 * Returns: ~/.config/dailybrew/sources.yaml
 */
export function getDefaultSourcesPath(): string {
  const configPath = getDefaultConfigPath()
  return path.join(path.dirname(configPath), 'sources.yaml')
}

/**
 * Ensure a sources file exists. If not, create an empty one.
 * Returns the resolved sources path.
 */
export function ensureSources(sourcesPath?: string): string {
  const finalPath = sourcesPath || getDefaultSourcesPath()

  // Try to migrate sources from config.yaml if needed
  migrateSourcesFromConfig(finalPath)

  if (fs.existsSync(finalPath)) {
    return finalPath
  }

  const dir = path.dirname(finalPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    finalPath,
    '# dailybrew sources\n# Manage with: dailybrew list add <url>\nsources: []\n',
    'utf-8',
  )

  return finalPath
}

/**
 * Migrate sources from config.yaml to sources.yaml.
 * Runs when sources.yaml is missing or empty and config.yaml still has sources.
 */
function migrateSourcesFromConfig(sourcesPath: string): void {
  const configPath = getDefaultConfigPath()
  if (!fs.existsSync(configPath)) return

  const configContent = fs.readFileSync(configPath, 'utf-8')
  const config = yaml.load(configContent) as Record<string, unknown> | null
  if (!config || !Array.isArray(config.sources) || config.sources.length === 0) return

  // Check if sources.yaml already has content
  if (fs.existsSync(sourcesPath)) {
    const existing = yaml.load(fs.readFileSync(sourcesPath, 'utf-8')) as Record<
      string,
      unknown
    > | null
    if (existing && Array.isArray(existing.sources) && existing.sources.length > 0) {
      return // sources.yaml already populated, skip migration
    }
  }

  // Migrate
  const dir = path.dirname(sourcesPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(sourcesPath, yaml.dump({ sources: config.sources }, { lineWidth: -1 }), 'utf-8')

  // Remove sources from config.yaml
  delete config.sources
  fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }), 'utf-8')
}

/**
 * Load sources from the sources YAML file.
 * Returns an array of validated Source objects.
 */
export function loadSources(sourcesPath?: string): Source[] {
  const finalPath = sourcesPath || getDefaultSourcesPath()

  if (!fs.existsSync(finalPath)) {
    return []
  }

  const fileContent = fs.readFileSync(finalPath, 'utf-8')
  const raw = yaml.load(fileContent) as Record<string, unknown> | null

  if (!raw || !raw.sources || !Array.isArray(raw.sources)) {
    return []
  }

  const sources: Source[] = []
  for (const entry of raw.sources) {
    const result = sourceSchema.safeParse(entry)
    if (result.success) {
      sources.push(result.data)
    }
  }

  return sources
}

/**
 * Save sources to the sources YAML file.
 */
export function saveSources(sources: Source[], sourcesPath?: string): void {
  const finalPath = sourcesPath || getDefaultSourcesPath()

  const dir = path.dirname(finalPath)
  fs.mkdirSync(dir, { recursive: true })

  const yamlDump = yaml.dump({ sources }, { lineWidth: -1 })
  fs.writeFileSync(finalPath, yamlDump, 'utf-8')
}
