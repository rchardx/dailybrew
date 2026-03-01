# dailybrew

LLM-powered RSS/web digest CLI — fetch sources, summarize with an OpenAI-compatible LLM, and output importance-sorted markdown digests.

## Features

- **Multi-source support**: RSS feeds and web pages (CSS selector extraction)
- **OPML import**: Bulk-import RSS feeds from any RSS reader's OPML export
- **LLM summarization**: OpenAI-compatible API with fallback JSON parsing
- **Seamless setup**: Config auto-creates on first use, LLM auth prompts when needed — no manual `init` required
- **Multiple LLM providers**: Built-in presets for OpenAI, OpenRouter, Groq, and local models (LM Studio / Ollama)
- **Deduplication**: SQLite-based tracking prevents duplicate content across runs
- **Cross-platform**: No native dependencies — runs on Mac, Linux, and Windows
- **Importance ranking**: Each item rated 1-5, sorted in output
- **Graceful error handling**: Feed failures don't abort the entire run
- **Environment variable support**: API key via `DAILYBREW_API_KEY` or interactive setup

## Installation

### From source (requires Node.js 20+)

```bash
git clone https://github.com/rchardx/dailybrew.git
cd dailybrew
pnpm install
pnpm build

# Install CLI globally
pnpm add -g .
# or: pnpm link
```

### Verify installation

```bash
dailybrew --help
# or: node dist/cli.mjs --help
```

## Quick Start

No manual initialization needed — dailybrew auto-creates config on first use.

### 1. Import your feeds (optional)

If you have an OPML file from another RSS reader:

```bash
dailybrew import feeds.opml
```

Or add feeds individually:

```bash
dailybrew list add https://hnrss.org/frontpage --name "Hacker News"
```

### 2. Run the digest

```bash
dailybrew run
```

On first run, dailybrew will interactively prompt you to configure your LLM provider (OpenAI, OpenRouter, Groq, local, or custom). No need to edit YAML manually.

Output: markdown digest sorted by importance (5=critical, 1=low) on stdout.

Save to file:

```bash
dailybrew run --output digest.md
```

### 3. Manage sources

```bash
# Add a source
dailybrew list add https://hnrss.org/frontpage --name "HN"
dailybrew list add https://example.com/blog --type web --selector "article h2 > a"

# Import from OPML
dailybrew import feeds.opml

# List sources
dailybrew list

# Remove a source
dailybrew list remove https://hnrss.org/frontpage
```

## Commands

### `run`

Fetch all sources, deduplicate against seen items, summarize with LLM, output markdown. This is also the default command when no subcommand is given.

**Flags:**

- `--config <path>` — Override default config location
- `--output <path>` — Write markdown to file instead of stdout
- `--max-items <n>` — Override config maxItems limit
- `--since <duration>` — Only items from the last duration (e.g., `2h`, `1d`, `30m`)

**Example:**

```bash
dailybrew run --config ~/my-config.yaml --output digest.md --since 2h
```

### `init`

Create example config file (skips if already exists, use `--force` to override).

```bash
dailybrew init
```

### `auth`

Interactively configure your LLM provider. Supports presets for OpenAI, OpenRouter, Groq, and local models, or a fully custom endpoint.

```bash
dailybrew auth
```

This is also triggered automatically by `run` if no API key is configured.

### `import <file>`

Import RSS feeds from an OPML file (exported from any RSS reader).

```bash
dailybrew import feeds.opml
```

### `list`

Manage sources: list, add, and remove.

```bash
# List all sources
dailybrew list

# Add a source (auto-detects RSS vs web; use --type to force)
dailybrew list add <url> [--name <name>] [--type rss|web] [--selector <css>]

# Remove a source
dailybrew list remove <url>
```

**Flags (for `list add`):**

- `--name <name>` — Custom name for the source
- `--type <rss|web>` — Force type (default: auto-detect)
- `--selector <css>` — CSS selector for web pages (implies `--type web`)

**Examples:**

```bash
dailybrew list add https://hnrss.org/frontpage --name "Hacker News"
dailybrew list add https://antirez.com --type web --selector "h2 > a"
dailybrew list remove https://hnrss.org/frontpage
```

### `config`

Show or modify configuration.

```bash
# Show current config
dailybrew config

# Print config file path only
dailybrew config --path

# Set a config value
dailybrew config set <key> <value>
```

**Settable keys:**

- `llm.baseUrl` — LLM API endpoint URL
- `llm.apiKey` — API key (prefer `DAILYBREW_API_KEY` env var)
- `llm.model` — Model name (e.g., `gpt-4o`, `deepseek-chat`)
- `options.maxItems` — Max items per source per run (default: 10)
- `options.maxContentLength` — Max characters sent to LLM per item (default: 65536)
- `options.concurrency` — Parallel source fetches (default: 8)

**Examples:**

```bash
dailybrew config set llm.model gpt-4o
dailybrew config set options.maxItems 20
```

## Configuration

Config file: `~/.config/dailybrew/config.yaml` (auto-created on first use by any command)

Sources file: `~/.config/dailybrew/sources.yaml` (managed via `dailybrew list add/remove`)

State DB: `~/.local/share/dailybrew/dailybrew.db` (auto-created on first run)

### Environment Variables

- `DAILYBREW_API_KEY` — LLM API key (recommended over hardcoding in YAML)

```bash
export DAILYBREW_API_KEY=sk-...
dailybrew run
```

## Output Format

Markdown digest with:

- Date header: `# Daily Digest — 2026-03-01`
- Importance levels: 🔴 Critical (5), 🟠 High (4), 🟡 Important (3), 🟢 Normal (2), ⚪ Low (1)
- Each item: Title (linked), source name, summary, importance group
- Fetch errors section at bottom

Example:

```markdown
# Daily Digest — 2026-03-01

## 🔴 Critical (5/5)

### [Groundbreaking AI Discovery](https://example.com/ai)
> **Source**: TechCrunch
>
> Researchers announce major LLM breakthrough...

---

## 🟠 High (4/5)

### [New JavaScript Feature](https://example.com/js)
> **Source**: JavaScript Blog
>
> ES2024 adds powerful new syntax...

---

## ⚠️ Fetch Errors

- **Broken Feed**: Connection timeout (https://broken-feed.com/rss)
```

## Scheduling

dailybrew is a **run-once CLI**, not a daemon. Schedule it with your system's task scheduler:

**macOS/Linux (cron):**

```bash
# Add to crontab: run every 6 hours
0 */6 * * * /usr/local/bin/dailybrew run >> ~/dailybrew.log 2>&1
```

**Windows (Task Scheduler):**

Create a scheduled task:

- Action: Run `node C:\path\to\dist\cli.mjs run`
- Or: Run `dailybrew run` (if pnpm link installed)
- Frequency: Every 6 hours
- Redirect output to file

## Requirements

- **Node.js**: 20 or higher
- **LLM API**: OpenAI-compatible endpoint (OpenAI, Anthropic Claude via proxy, LM Studio local, etc.)
- **Network**: Fetch RSS feeds and web pages during run

## Limitations

- No TUI or web UI — CLI only
- No streaming LLM responses — batch processing
- Content is fetched fresh every run (no caching)

## Troubleshooting

### `DAILYBREW_API_KEY` not recognized

Make sure to export the env var before running:

```bash
export DAILYBREW_API_KEY=sk-...
dailybrew run
```

Check it's set:

```bash
echo $DAILYBREW_API_KEY
```

### Feed fetch fails

Check your network and feed URL. dailybrew logs errors to stdout; failing feeds are listed in the digest error section, not fatal.

### LLM returns garbage

Fallback JSON parsing handles most cases. If LLM response is unparseable, the item is skipped with a warning. Check your API key and LLM endpoint configuration.

### Dedup not working

Ensure SQLite DB file exists at `~/.local/share/dailybrew/dailybrew.db` (auto-created on first run). Corrupt DB files are automatically renamed to `.corrupt` and a fresh DB is created.

## Development

```bash
# Install deps
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Watch tests
pnpm dev

# Type check
pnpm lint
```

## License

ISC
