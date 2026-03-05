# dailybrew

[![CI](https://github.com/rchardx/dailybrew/actions/workflows/ci.yml/badge.svg)](https://github.com/rchardx/dailybrew/actions/workflows/ci.yml)

LLM-powered RSS/web digest CLI — fetch sources, summarize with an OpenAI-compatible LLM, and output importance-sorted markdown digests.

## Features

- **Multi-source**: RSS feeds and web pages (CSS selector extraction)
- **OPML import**: Bulk-import from any RSS reader export
- **LLM summarization**: OpenAI-compatible API with multiple provider presets
- **Seamless setup**: Auto-creates config on first use, interactive LLM auth
- **Deduplication**: SQLite-based tracking across runs
- **Cross-platform**: No native dependencies — Mac, Linux, Windows
- **Webhooks**: Push digests to Feishu (飞书) bot endpoints as rich card messages

## Installation

Requires **Node.js 20+** and **pnpm**.

```bash
git clone https://github.com/rchardx/dailybrew.git
cd dailybrew
pnpm install && pnpm build
pnpm add -g .
```

## Quick Start

```bash
# Import feeds from OPML (optional)
dailybrew import feeds.opml

# Or add individually
dailybrew list add https://hnrss.org/frontpage --name "Hacker News"

# Run — prompts for LLM setup on first use
dailybrew run

# Save to file
dailybrew run --output digest.md
```

## Commands

| Command | Description |
|---------|-------------|
| `run` | Fetch, deduplicate, summarize, output markdown (default) |
| `init` | Create example config (`--force` to overwrite) |
| `auth` | Configure LLM provider interactively |
| `import <file>` | Import feeds from OPML |
| `list` | List all sources |
| `list add <url>` | Add source (`--name`, `--type rss\|web`, `--selector <css>`) |
| `list remove <url>` | Remove source |
| `config` | Show config (`--path` for file path only) |
| `config set <key> <value>` | Set config value |
| `webhook` | List all configured webhooks |
| `webhook add <url>` | Add webhook (`--name <name>`, `--type feishu`) |
| `webhook remove <name>` | Remove webhook by name |
| `webhook toggle <name>` | Enable/disable webhook |

**`run` flags**: `--config <path>`, `--output <path>`, `--max-items <n>`, `--since <duration>`

**Config keys**: `llm.baseUrl`, `llm.apiKey`, `llm.model`, `options.maxItems`, `options.maxContentLength`, `options.concurrency`, `options.fetchTimeout`, `options.llmTimeout`

## Configuration

| File | Path |
|------|------|
| Config | `~/.config/dailybrew/config.yaml` |
| Sources | `~/.config/dailybrew/sources.yaml` |
| State DB | `~/.local/share/dailybrew/dailybrew.db` |

### LLM

Run `dailybrew auth` for interactive setup, or edit `config.yaml` directly:

```yaml
llm:
  baseUrl: "https://api.deepseek.com"
  apiKey: "${DAILYBREW_API_KEY}"
  model: "deepseek-reasoner"
```

The `auth` command includes a few common presets (DeepSeek, OpenRouter, local) for convenience, but any OpenAI-compatible endpoint works — just provide the base URL, model name, and API key.

API key can be set via environment variable (recommended) or hardcoded in YAML:

```bash
export DAILYBREW_API_KEY=sk-...
```

### Webhooks

Webhooks push digests to external services after each run. Currently supports **Feishu (飞书)** bot endpoints.

```yaml
webhooks:
  - type: feishu
    name: team-bot
    url: https://open.feishu.cn/open-apis/bot/v2/hook/xxx
    enabled: true
```

Manage via CLI: `dailybrew webhook add <url>`, `webhook remove <name>`, `webhook toggle <name>`.

## Development

```bash
pnpm install       # Install deps
pnpm build         # Build
pnpm test          # Run tests
pnpm dev           # Watch tests
pnpm lint          # Type check
```

## License

MIT
