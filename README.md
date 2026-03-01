# dailybrew

LLM-powered RSS/web digest CLI — fetch sources, summarize with an OpenAI-compatible LLM, and output importance-sorted markdown digests.

## Features

- **Multi-source support**: RSS feeds and web pages (CSS selector extraction)
- **LLM summarization**: OpenAI-compatible API with fallback JSON parsing
- **Deduplication**: SQLite-based tracking prevents duplicate content across runs
- **Cross-platform**: No native dependencies — runs on Mac, Linux, and Windows
- **Importance ranking**: Each item rated 1-5, sorted in output
- **Graceful error handling**: Feed failures don't abort the entire run
- **Environment variable support**: API key via `DAILYBREW_API_KEY`

## Installation

### From source (requires Node.js 18+)

```bash
git clone https://github.com/rchardx/dailybrew.git
cd dailybrew
pnpm install
pnpm build

# Install CLI globally or use npm link
pnpm add -g .
# or: npm link
```

### Verify installation

```bash
dailybrew --help
# or: node dist/cli.mjs --help
```

## Quick Start

### 1. Initialize configuration

```bash
dailybrew init
```

This creates a config file at `~/.config/dailybrew/config.yaml` (cross-platform) with example sources.

### 2. Configure your sources

Edit `~/.config/dailybrew/config.yaml` to add your RSS feeds and web pages:

```yaml
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "${DAILYBREW_API_KEY}"    # Set env var: export DAILYBREW_API_KEY=sk-...
  model: "gpt-4o-mini"

sources:
  - name: "Hacker News"
    url: "https://hnrss.org/frontpage"
    type: rss

  - name: "Antirez Blog"
    url: "http://antirez.com/"
    type: web
    selector: "h2 > a"               # CSS selector for article links

options:
  maxItems: 50                       # Max items per source per run
  maxContentLength: 4000             # Truncate before sending to LLM
  concurrency: 5                     # Parallel fetches
```

### 3. Run the digest

```bash
dailybrew brew
```

Output: markdown digest sorted by importance (5=critical, 1=low) on stdout.

Option: Save to file

```bash
dailybrew brew --output digest.md
```

### 4. Manage sources

Add a source:

```bash
dailybrew add https://hnrss.org/frontpage --name "HN"
dailybrew add https://example.com/blog --type web --selector "article h2 > a"
```

List sources:

```bash
dailybrew list
```

Remove a source:

```bash
dailybrew remove https://hnrss.org/frontpage
```

## Commands

### `brew`

Fetch all sources, deduplicate against seen items, summarize with LLM, output markdown.

**Flags:**

- `--config <path>` — Override default config location
- `--output <path>` — Write markdown to file instead of stdout
- `--max-items <n>` — Override config maxItems limit
- `--since <duration>` — Only items from the last duration (e.g., `2h`, `1d`, `30m`)

**Example:**

```bash
dailybrew brew --config ~/my-config.yaml --output digest.md --since 2h
```

### `init`

Create example config file (skips if already exists, use `--force` to override).

```bash
dailybrew init
```

### `add <url>`

Add a source to config. Auto-detects RSS vs web; use `--type` to force.

**Flags:**

- `--name <name>` — Custom name for the source
- `--type <rss|web>` — Force type (default: auto-detect)
- `--selector <css>` — CSS selector for web pages

**Examples:**

```bash
dailybrew add https://hnrss.org/frontpage --name "Hacker News"
dailybrew add https://antirez.com --type web --selector "h2 > a"
```

### `remove <url>`

Remove a source from config.

```bash
dailybrew remove https://hnrss.org/frontpage
```

### `list`

Show all configured sources.

```bash
dailybrew list
```

## Configuration

Config file: `~/.config/dailybrew/config.yaml` (auto-created by `init`)

State DB: `~/.local/share/dailybrew/dailybrew.db` (auto-created on first run)

### Environment Variables

- `DAILYBREW_API_KEY` — LLM API key (recommended over hardcoding in YAML)

```bash
export DAILYBREW_API_KEY=sk-...
dailybrew brew
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
0 */6 * * * /usr/local/bin/dailybrew brew >> ~/dailybrew.log 2>&1
```

**Windows (Task Scheduler):**

Create a scheduled task:

- Action: Run `node C:\path\to\dist\cli.mjs brew`
- Or: Run `dailybrew brew` (if npm link installed)
- Frequency: Every 6 hours
- Redirect output to file

## Requirements

- **Node.js**: 18 or higher
- **LLM API**: OpenAI-compatible endpoint (OpenAI, Anthropic Claude via proxy, LM Studio local, etc.)
- **Network**: Fetch RSS feeds and web pages during run

## Limitations

- No TUI or web UI — CLI only
- No streaming LLM responses — batch processing
- No interactive config wizard — YAML editing required
- No OPML import — manual source addition
- Content is fetched fresh every run (no caching)

## Troubleshooting

### `DAILYBREW_API_KEY` not recognized

Make sure to export the env var before running:

```bash
export DAILYBREW_API_KEY=sk-...
dailybrew brew
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
