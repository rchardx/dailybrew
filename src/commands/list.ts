import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import yaml from 'js-yaml';
import envPaths from 'env-paths';
import { logger } from '../utils/logger';

async function listSources(configPath?: string): Promise<string> {
  const finalPath = configPath || getDefaultConfigPath();

  // Check if config exists
  if (!fs.existsSync(finalPath)) {
    throw new Error(`Config file not found at ${finalPath}`);
  }

  // Load current config
  const fileContent = fs.readFileSync(finalPath, 'utf-8');
  const config = yaml.load(fileContent) as any;

  // Check if sources exist
  if (!config.sources || config.sources.length === 0) {
    return 'No sources configured.';
  }

  // Format sources as table
  let output = 'Configured Sources:\n';
  output += '─'.repeat(80) + '\n';
  output += '│ Name                 │ URL                              │ Type   │\n';
  output += '─'.repeat(80) + '\n';

  for (const source of config.sources) {
    const name = (source.name || 'Unnamed').substring(0, 20).padEnd(20);
    const url = source.url.substring(0, 30).padEnd(30);
    const type = (source.type || 'unknown').padEnd(6);
    output += `│ ${name} │ ${url} │ ${type} │\n`;
  }

  output += '─'.repeat(80) + '\n';
  output += `Total: ${config.sources.length} source(s)\n`;

  return output;
}

function getDefaultConfigPath(): string {
  const paths = envPaths('dailybrew');
  return path.join(paths.config, 'config.yaml');
}

export { listSources };

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List all configured sources'
  },
  args: {},
  async run() {
    const result = await listSources();
    logger.log(result);
  }
});
