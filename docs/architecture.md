# Architecture

## Overview

dailybrew is a modular CLI pipeline designed for fetching, deduplicating, summarizing, and formatting web content. The system operates as a linear sequence: fetch → dedup → summarize → format. Each stage is independently extensible. The project emphasizes a zero native dependency approach, ensuring it runs on any platform with Node.js 20+ by using WebAssembly for database operations and standard ESM modules.

## Data Flow

The primary `run` pipeline follows this execution path:

1. **Config (YAML)**: Load the main configuration file.
2. **Load Sources (YAML)**: Read the list of RSS feeds and web pages.
3. **Fetch**: Retrieve content from RSS feeds and web scrapers in parallel using p-limit for concurrency control (default: 8).
4. **Dedup**: Check for previously seen items using SQLite via the sql.js WASM library.
5. **Summarize**: Send new content to an LLM for summarization. This happens in parallel with a default limit of 8 and utilizes a content hash cache.
6. **Format**: Convert the summarized results into the requested output format (Markdown, JSON, or HTML).
7. **Output**: Write the formatted digest to stdout or a specified file.
8. **Update DB**: Mark items as seen and prune old entries.

Key processing details:
- The first run defaults to a 24-hour lookback period.
- The `--since` flag overrides the stored lastRunTime in the database.
- Summary results are cached by a combination of content hash and model name.
- Seen items are pruned after 14 days, while cached summaries are removed after 30 days.

## Module Map

Each directory in the `src/` folder has a specific responsibility within the pipeline:

- **src/cli.ts**: The application entry point. It uses citty's `defineCommand` with lazy-loaded subcommands to ensure a fast startup time. The default command is `run`.
- **src/commands/**: Contains individual CLI subcommands such as `run`, `init`, `config`, `list`, `import`, and `auth`. Each file exports a citty command definition.
- **src/config/**: Manages the configuration layer.
    - `schema.ts`: Defines Zod schemas for `configSchema`, `sourceSchema`, and `optionsSchema`. All TypeScript types are derived from these via `z.infer<>`.
    - `loader.ts`: Handles YAML loading, environment variable substitution, and validation.
    - `sources.ts`: Manages the sources list and handles migrations from older configuration formats.
    - `ensure.ts`: Automatically initializes configuration on first use and provides interactive LLM authentication presets.
- **src/db/**: Handles SQLite persistence using sql.js WASM.
    - `store.ts`: Manages database initialization, WASM loading, recovery from corruption, and file locking via `proper-lockfile`.
    - `dedup.ts`: Tracks seen items with functions like `isSeen`, `markSeen`, and `pruneSeen`.
    - `cache.ts`: Manages the summary cache to avoid redundant LLM calls.
- **src/llm/**: Integrates with LLM providers.
    - `client.ts`: Sets up an OpenAI-compatible client.
    - `summarize.ts`: Implements a two-mode summarization strategy using structured output with a fallback to prompt-based JSON.
    - `prompt.ts`: Contains system and user templates that instruct the LLM to respond in the source's original language.
    - `schemas.ts`: Provides Zod schemas for validating LLM responses.
- **src/sources/**: Responsible for content acquisition.
    - `rss.ts`: Fetches RSS/Atom feeds with timeout handling and date filtering.
    - `web.ts`: Scrapes web pages using cheerio. It extracts content via CSS selectors and removes noise like scripts, styles, and navigation elements.
    - `detect.ts`: Automatically identifies feed URLs from a standard web page.
    - `opml.ts`: Parses OPML files for bulk importing feeds.
- **src/output/**: Provides different digest formatters.
    - `markdown.ts`: Groups items by importance (level 5 down to 1) and formats them with blockquote summaries.
    - `json.ts`: Produces a structured JSON representation of the digest.
    - `html.ts`: Generates a standalone, responsive HTML file with inline CSS and XSS protection.
- **src/utils/**: Contains shared utilities for logging (consola), progress bars, and URL normalization.
- **src/types/**: Holds ambient type declarations.

## Design Decisions

- **Functions and modules only**: The codebase avoids classes and complex dependency injection patterns to keep the logic simple and readable.
- **Zod-first configuration**: Runtime validation is the single source of truth for both settings and data structures.
- **YAML split**: Settings are kept in `config.yaml` while feed data resides in `sources.yaml` to separate operational logic from user data.
- **SQLite via WASM**: Using sql.js allows the project to remain cross-platform without requiring native build tools or local SQLite installations.
- **Lockfile protection**: Concurrent access to the SQLite database is managed by `proper-lockfile` to prevent data corruption.
- **XDG paths**: The `env-paths` library ensures that configuration and data files are stored in the correct locations for each operating system.
- **Lazy subcommand loading**: Dynamic imports in the CLI entry point allow for sub-100ms startup times.
- **Two-mode LLM**: The system attempts to use structured output features (zodResponseFormat) first, falling back to JSON-in-prompt for models that do not support it.
- **Content caching**: Using a SHA-256 hash of the content combined with the model name prevents expensive re-summarization of unchanged articles.

## SQLite Schema

The database consists of three primary tables:

- **seen_items**: Tracks content that has already been processed. Columns include id (Primary Key), source, title, first_seen, and last_seen.
- **meta**: A simple key-value store used for tracking state like the lastRunTime.
- **summary_cache**: Stores LLM-generated summaries. Columns include content_hash (Primary Key), title, summary, importance, model, and created_at.

## Extending

The modular nature of the project makes it straightforward to add new functionality:

- **New source type**: Implement the fetcher in `src/sources/` and integrate it into the `fetchSource` function within the run command.
- **New output format**: Create a new formatter in `src/output/` and wire it into the `formatOutput` function.
- **New CLI command**: Add a new definition in `src/commands/` and register it in the `subCommands` object in `src/cli.ts`.
- **New config option**: Update the relevant Zod schema in `src/config/schema.ts` to automatically gain validation and type support.
