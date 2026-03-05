# CLI Commands

dailybrew is invoked as `dailybrew [command] [options]`. The default command (no subcommand) is `run`.

## run

Fetch sources, deduplicate via SQLite, summarize with LLM, output markdown digest.

### Flags

- `--config <path>`: Path to config file (default: auto-detected via env-paths)
- `--output, -o <path>`: Write digest to file instead of stdout
- `--max-items <n>`: Override max items per source
- `--since <duration>`: Override last run time filter (e.g., `30m`, `2h`, `1d`)
- `--format <type>`: Output format: `markdown` (default), `json`, `html`
- `--dry-run`: Fetch and dedup only. Skip LLM summarization and DB updates.
- `--verbose`: Enable debug/trace logging
- `--quiet`: Suppress all output except errors

### Examples

```bash
dailybrew                           # run with defaults
dailybrew run --since 2h            # items from last 2 hours
dailybrew run --output digest.md    # save to file
dailybrew run --format json         # JSON output
dailybrew run --dry-run             # preview without LLM
dailybrew run --max-items 5 --quiet # limit items, minimal output
```

### Pipeline

Config -> Sources -> Fetch (RSS/Web parallel) -> Dedup (SQLite) -> Summarize (LLM parallel, with cache) -> Format -> Output

The first run defaults to fetching items from the last 24 hours.

## init

Create an example config file.

### Flags

- `--force, -f`: Overwrite existing config

### Examples

```bash
dailybrew init
dailybrew init --force
```

## auth

Interactively configure LLM provider (baseUrl, API key, model). Walks through provider selection (DeepSeek, OpenRouter, Local, Custom), model, and API key.

### Flags

- `--config, -c <path>`: Path to config file

### Examples

```bash
dailybrew auth
dailybrew auth --config ./my-config.yaml
```

## import <file>

Import sources from an OPML file. This command deduplicates against existing sources by URL.

### Positional Arguments

- `file`: Path to OPML file (required)

### Examples

```bash
dailybrew import feeds.opml
dailybrew import ~/Downloads/subscriptions.opml
```

## list

List all configured sources with details (name, URL, type, selector).

## list add <url>

Add a new source. It auto-detects feed type by looking for `<link rel="alternate">` tags, then trying common paths like /feed, /rss, /atom.xml, or /index.xml. It test-fetches the source before saving and won't add if the fetch fails.

### Flags

- `--name, -n <name>`: Display name (default: hostname)
- `--type, -t <rss|web>`: Source type (auto-detected if omitted)
- `--selector, -s <css>`: CSS selector for web pages (implies type=web)

### Examples

```bash
dailybrew list add https://hnrss.org/frontpage --name "Hacker News"
dailybrew list add https://example.com/blog --type web --selector "article h2 > a"
dailybrew list add https://example.com    # auto-detect feed
```

## list remove <url>

Remove a source by URL.

### Examples

```bash
dailybrew list remove https://hnrss.org/frontpage
```

## config

Show current config.

### Flags

- `--path`: Only print the config file path

## config set <key> <value>

Set a config value by dotted key path.

### Settable Keys

- `llm.baseUrl`
- `llm.apiKey`
- `llm.model`
- `options.maxItems`
- `options.maxContentLength`
- `options.concurrency`

### Examples

```bash
dailybrew config set llm.model deepseek-reasoner
dailybrew config set options.maxItems 20
dailybrew config set llm.baseUrl https://api.deepseek.com
```

## webhook

List all configured webhooks with details (name, type, URL, status).

## webhook add <url>

Add a new webhook endpoint.

### Flags

- `--name, -n <name>`: Display name for the webhook (required)
- `--type, -t <type>`: Webhook type: `feishu` (required)

### Examples

```bash
dailybrew webhook add https://open.feishu.cn/open-apis/bot/v2/hook/xxx --name team-bot --type feishu
```

## webhook remove <name>

Remove a webhook by name.

### Examples

```bash
dailybrew webhook remove team-bot
```

## webhook toggle <name>

Toggle a webhook's enabled/disabled state.

### Examples

```bash
dailybrew webhook toggle team-bot
```
