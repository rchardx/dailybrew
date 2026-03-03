# Configuration

## Overview

dailybrew uses two YAML configuration files and one SQLite database to manage its operations. All file paths are resolved using `env-paths`, ensuring they follow the XDG Base Directory Specification and other platform-specific standards.

## File Locations

| File | Path | Purpose |
| ---- | ---- | ------- |
| Config | `~/.config/dailybrew/config.yaml` | LLM settings and global options |
| Sources | `~/.config/dailybrew/sources.yaml` | List of RSS feeds and web pages to monitor |
| Database | `~/.local/share/dailybrew/dailybrew.db` | SQLite database for article deduplication |

*Note: Actual paths vary by platform. `env-paths` handles this automatically to ensure your data resides in the correct location for your operating system.*

## config.yaml Reference

The `config.yaml` file defines how dailybrew interacts with LLM providers and sets global processing limits.

```yaml
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "${DAILYBREW_API_KEY}"    # environment variable substitution supported
  model: "gpt-4o-mini"
options:
  maxItems: 10                      # max items per source per run
  maxContentLength: 65536           # max characters of content sent to LLM
  concurrency: 8                    # parallel fetch/summarize limit
```

### Fields

- **llm.baseUrl** (string): The base URL for the OpenAI-compatible API. Default: `https://api.openai.com/v1`.
- **llm.apiKey** (string): Your API key for the LLM provider. Supports `${VAR_NAME}` syntax for environment variable substitution.
- **llm.model** (string): The specific model ID to use for summarization. Default: `gpt-4o-mini`.
- **options.maxItems** (positive integer): The maximum number of new articles to process per source during a single run. Default: `10`.
- **options.maxContentLength** (positive integer): The maximum number of characters from an article sent to the LLM. Content exceeding this limit is truncated. Default: `65536`.
- **options.concurrency** (positive integer): The number of parallel requests allowed for fetching and summarizing articles. Higher values speed up processing but may hit rate limits. Default: `8`.

### Environment Variable Substitution

Any value in `config.yaml` can use the `${VAR_NAME}` pattern. dailybrew resolves these variables from your environment at load time. This is the recommended way to handle sensitive data like API keys.

## sources.yaml Reference

The `sources.yaml` file contains the list of content sources. While you can edit this file manually, it is typically managed via the `dailybrew list` command.

```yaml
sources:
  - name: "Hacker News"
    url: "https://hnrss.org/frontpage"
    type: rss
  - name: "Example Blog"
    url: "https://example.com/blog"
    type: web
    selector: "article h2 > a"
```

### Fields

- **name** (string, required): A descriptive name for the source.
- **url** (string, required): The full URL of the RSS feed or web page.
- **type** (string, optional): The type of source. Must be either `rss` or `web`. Defaults to `rss` if omitted.
- **selector** (string, optional): A CSS selector used to find article links on a web page. This is only used when `type` is set to `web`.

While this file can be edited manually, it is primarily managed via `dailybrew list add/remove` and should not be edited manually unless needed.

## Webhooks

Webhooks push digest output to external services after each run. They are configured in the `webhooks` array within `config.yaml`. When the `run` command completes, it sends the digest to all enabled webhooks.

```yaml
webhooks:
  - type: feishu
    name: team-bot
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-id"
    enabled: true
  - type: feishu
    name: alerts-bot
    url: "https://open.feishu.cn/open-apis/bot/v2/hook/another-id"
    enabled: false
```

### Fields

- **type** (string, required): The webhook service type. Currently supported: `feishu`.
- **name** (string, required): A unique display name for this webhook.
- **url** (string, required): The full webhook endpoint URL.
- **enabled** (boolean, optional): Whether this webhook is active. Defaults to `true`.

### Supported Types

| Type | Service | Card Format |
| ---- | ------- | ----------- |
| `feishu` | Feishu (飞书) Bot | Interactive Card JSON v2 with rich text, importance grouping, error sections |

Webhooks can be managed via the `dailybrew webhook` command or by editing `config.yaml` directly.
],op:
## Environment Variables

- **DAILYBREW_API_KEY**: The standard environment variable for providing your LLM API key.
- **Custom Variables**: Any variable defined in your environment can be referenced in `config.yaml` using the `${VAR_NAME}` syntax.

## LLM Provider Presets

The `dailybrew auth` command provides interactive setup with presets for popular providers:

| Provider | Base URL | Default Model |
| -------- | -------- | ------------- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Local (LM Studio / Ollama) | `http://localhost:1234/v1` | `local-model` |
| Custom | User provided | User provided |

## Settable Config Keys

You can modify individual configuration values using the `dailybrew config set <key> <value>` command. The following keys are supported:

- `llm.baseUrl` (string): LLM API endpoint URL.
- `llm.apiKey` (string): API key for authentication.
- `llm.model` (string): The model name to use.
- `options.maxItems` (positive integer): Maximum items per source.
- `options.maxContentLength` (positive integer): Maximum content characters per article.
- `options.concurrency` (positive integer): Parallel processing limit.

## Auto-initialization

dailybrew is designed for zero-config startup. If configuration files do not exist, the tool automatically creates them on the first use. Using `dailybrew init` is optional and mainly used for explicit setup or resetting to defaults. If an API key is required but not found in the configuration or environment, dailybrew will prompt you to run the `auth` command to configure your provider.
