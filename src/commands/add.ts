import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import yaml from 'js-yaml';
import envPaths from 'env-paths';
import { type Source } from '../config/schema';
import { logger } from '../utils/logger';

export interface AddOptions {
  name?: string;
  type?: 'rss' | 'web';
  selector?: string;
}

async function addSource(
  configPath?: string,
  url?: string,
  options?: AddOptions
): Promise<string> {
  if (!url) {
    throw new Error('URL is required');
  }

  const finalPath = configPath || getDefaultConfigPath();

  // Check if config exists
  if (!fs.existsSync(finalPath)) {
    throw new Error(`Config file not found at ${finalPath}. Run 'init' first.`);
  }

  // Load current config
  const fileContent = fs.readFileSync(finalPath, 'utf-8');
  const config = yaml.load(fileContent) as any;

  // Ensure sources array exists
  if (!config.sources) {
    config.sources = [];
  }

  // Check if URL already exists
  const exists = config.sources.some((s: any) => s.url === url);
  if (exists) {
    return `Source with URL ${url} already exists in config.`;
  }

  // Determine source type
  let sourceType = options?.type;
  if (!sourceType) {
    // If selector is provided, default to web
    if (options?.selector) {
      sourceType = 'web';
    } else {
      // Default to rss, could be enhanced with detect.ts
      sourceType = 'rss';
    }
  }

  // Create new source
  const newSource: Source = {
    name: options?.name || new URL(url).hostname,
    url,
    type: sourceType,
  };

  if (options?.selector) {
    newSource.selector = options.selector;
  }

  // Add to sources array
  config.sources.push(newSource);

  // Write back to file
  const yaml_dump = yaml.dump(config, { lineWidth: -1 });
  fs.writeFileSync(finalPath, yaml_dump, 'utf-8');

  return `Added source: ${newSource.name} (${url})`;
}

function getDefaultConfigPath(): string {
  const paths = envPaths('dailybrew');
  return path.join(paths.config, 'config.yaml');
}

export { addSource };

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a new source (RSS feed or web page)'
  },
  args: {
    url: {
      type: 'positional',
      required: true,
      description: 'URL of the source (RSS feed or web page)'
    },
    name: {
      type: 'string',
      description: 'Display name for the source',
      alias: 'n'
    },
    type: {
      type: 'string',
      description: 'Source type: rss or web',
      alias: 't'
    },
    selector: {
      type: 'string',
      description: 'CSS selector for web pages (implies type=web)',
      alias: 's'
    }
  },
  async run({ args }) {
    const result = await addSource(undefined, args.url, {
      name: args.name,
      type: args.type as 'rss' | 'web' | undefined,
      selector: args.selector
    });
    logger.log(result);
  }
});
