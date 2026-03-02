# AGENTS.md — dailybrew

<!-- Tier 1: Quick Orientation — read every time -->

## Project Overview

LLM-powered RSS/web digest CLI — fetch sources, summarize with an OpenAI-compatible LLM, and output
importance-sorted markdown digests. Node.js 20+, ESM only, managed by pnpm. ~2900 LOC (src), ~7900 LOC (tests),
426 tests, 80%+ coverage.

**Tech stack**: TypeScript (strict), citty (CLI), Zod (validation), openai (LLM), sql.js (SQLite WASM), cheerio
(scraping), rss-parser (feeds), consola (logging), p-limit (concurrency), js-yaml (config), env-paths (XDG paths),
proper-lockfile (lock), tsup (build), Biome 2.4 (format/lint), vitest (test).

**Purpose**: CLI tool for aggregating RSS feeds and web pages, deduplicating articles via SQLite, summarizing with any
OpenAI-compatible LLM, and outputting ranked markdown digests. Modular design — sources, LLM, storage, and output are
independently extensible. Supports OPML import, interactive LLM auth, CSS selector extraction, and cross-platform
operation with zero native dependencies.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
pnpm lint                                   # Type-check (tsc --noEmit)
pnpm format                                 # Auto-format with Biome
pnpm vitest run tests/config/schema.test.ts # Single test file
pnpm vitest run tests/llm/                  # Tests matching a directory
pnpm dev                                    # Watch mode
pnpm test:coverage                          # Coverage (80% lines/functions/statements, 70% branches)
# All checks (run before committing)
pnpm lint && pnpm test
```

## Project Structure

```
src/
  cli.ts              # Entry point, subcommand routing (default = run)
  commands/           # CLI subcommands: run, init, config, list, import, auth
  config/             # Schema (Zod), loader (YAML), sources management, ensure/auto-init
  db/                 # SQLite store (sql.js WASM) + dedup logic + lockfile protection
  llm/                # OpenAI client, summarizer, prompt building, response schemas
  output/             # Digest formatters: Markdown, JSON, HTML
  sources/            # RSS fetcher, web scraper, feed detection, OPML parser
  types/              # Ambient type declarations (e.g., sql.js.d.ts)
  utils/              # URL normalization, logger (consola), progress bars
tests/
  {module}/           # Mirrors src/ structure: tests/sources/rss.test.ts
  integration/        # End-to-end pipeline tests (mock network + LLM, real fs + SQLite)
fixtures/             # Test data: sample-rss.xml, sample-atom.xml, sample-article.html,
                      #   sample-blog.html, sample-page-with-feed.html, malformed.xml
docs/                # Project documentation: architecture, commands, configuration, development
```

### Data Flow

- `run` (default): Config → Sources → Fetch (RSS/Web) → Dedup (SQLite) → Summarize (LLM) → Markdown digest
- `init`: Create example config (`--force` to overwrite)
- `auth`: Interactive LLM provider configuration
- `import <file>`: OPML → Sources YAML
- `list add/remove`: Manage `sources.yaml` entries
- `config set`: Modify `config.yaml` values

### Configuration Files

| File | Path | Purpose |
| ---- | ---- | ------- |
| Config | `~/.config/dailybrew/config.yaml` | LLM settings, options |
| Sources | `~/.config/dailybrew/sources.yaml` | Feed/page list (managed via `list add/remove`) |
| State DB | `~/.local/share/dailybrew/dailybrew.db` | SQLite dedup tracking |

Paths resolved via `env-paths('dailybrew')` — never hardcode `~/.config` or `~/.local`.

<!-- Tier 2: Development Standards — reference when writing code -->

## Boundaries

### Always Do

- Read relevant files before modifying code.
- Run all checks before committing (see [Quick Start](#quick-start)).
- Follow existing code patterns in the same module.
- Add tests for new functionality.
- Use Zod schemas for runtime validation; derive types with `z.infer<>`.
- Use `.js` extension for local imports (e.g., `import { foo } from './bar.js'`).
- Group imports: `node:` builtins first, external packages, then internal modules.

### Ask First

- Adding new dependencies to `package.json`.
- Changing Zod schemas in `config/` (affects config loading for all users).
- Deleting or renaming public APIs / exports.
- Modifying CLI command signatures in `commands/`.

### Never Do

- `@ts-ignore` or `@ts-expect-error` — fix the type error properly.
- `as any` — prefer `unknown` and narrow.
- Empty catch blocks `catch(e) {}` — always log or handle the error.
- Classes or dependency injection — functions + modules only.
- CommonJS (`require`, `module.exports`) — ESM only.
- Hardcode paths (`~/.config`, `~/.local`) — use `env-paths`.
- Wildcard imports (`from x import *`).
- Bare `except:` or catch-all without re-raise/log.
- `Co-authored-by` trailers or agent attribution in commits.

## Code Conventions

Enforced by **Biome 2.4** via `biome.json` and **husky + lint-staged** pre-commit hook.

| Rule | Standard |
| ---- | -------- |
| Indent | 2 spaces |
| Line width | 100 characters |
| Quotes | Single quotes |
| Semicolons | `asNeeded` (Biome inserts only where required for ASI hazards) |
| Trailing commas | Always on multi-line constructs |
| Imports | ESM only, `.js` extension for local, manual grouping (organizeImports off) |
| Type annotations | Strict mode (`tsconfig.json`), target ES2022, module ESNext, moduleResolution bundler |
| Zod schemas | `z.infer<>` for type derivation; prefer `type` over `interface` |

| Naming | Pattern | Example |
| ------ | ------- | ------- |
| Files | lowercase-with-hyphens | `url.ts`, `rss.test.ts`, `cli-progress.ts` |
| Functions | camelCase | `fetchRssFeed`, `normalizeUrl`, `parseSinceDuration` |
| Types | PascalCase | `LLMConfig`, `Source`, `Config`, `DigestItem` |
| Constants | UPPER_SNAKE_CASE | `MAX_SUMMARY_LENGTH` |
| Zod schemas | camelCase + `Schema` suffix | `configSchema`, `sourceSchema` |

### Error Handling

- Return `null` or error objects instead of throwing when possible.
- Wrap external calls (fetch, file I/O, LLM) in try/catch with descriptive messages.
- Use `try/finally` to clean up resources (e.g., `store.close()`).
- Never use empty catch blocks — always log or handle the error.
- Use `consola` logger (`import { logger } from './utils/logger'`) — all logs go to stderr.

## Design Patterns

- **Functions + modules only** — no classes, no dependency injection.
- **CLI via citty**: `defineCommand` with subcommands.
- **Lazy-load subcommands**: `run: () => import('./commands/run').then((m) => m.default)` for fast startup.
- **Zod-first config**: Runtime validation with Zod schemas, derive TypeScript types via `z.infer<>`.
- **YAML config**: Split config (`config.yaml`) and sources (`sources.yaml`) for separation of concerns.
- **SQLite via WASM**: sql.js for cross-platform dedup — no native deps.
- **Lockfile protection**: `proper-lockfile` for concurrent SQLite access safety.
- **XDG paths**: `env-paths('dailybrew')` for platform-correct config/data/cache locations.

### Zod Schema Example

```typescript
export const sourceSchema = z.object({ name: z.string(), url: z.string().url() })
export type Source = z.infer<typeof sourceSchema>
```

## Testing

- Framework: **vitest** — `globals: true` (`describe`, `it`, `expect`, `vi`, `beforeEach` available globally).
- Config: `vitest.config.ts`. Coverage: `@vitest/coverage-v8`, `fail_under = 80`.
- Mirror source structure: `tests/{module}/{name}.test.ts`.
- Use `describe`/`it` blocks, test both success and error paths.
- Mock fetch with `vi.fn()` on `globalThis.fetch`:
  ```typescript
  const mockFetch = vi.fn()
  globalThis.fetch = mockFetch
  mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }))
  ```
- Partial-mock modules with `importOriginal` to keep real exports:
  ```typescript
  vi.mock('../../src/config/sources', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/config/sources')>()
    return { ...actual, loadSources: vi.fn(() => []) }
  })
  ```
- Suppress logger noise in tests:
  ```typescript
  vi.mock('../../src/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn(),
              start: vi.fn(), fail: vi.fn(), log: vi.fn() },
  }))
  ```
- Use temp directories for file system tests (`fs.mkdtempSync`).
- Integration tests mock `loadSources` to avoid reading real user config.
- Prefer strict assertions: `expect(x).toBe(true)` over `expect(x).toBeTruthy()`.
- Load fixtures with `readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')`.

<!-- Tier 3: Workflows — reference when committing / releasing -->

## Git Workflow

### Conventional Commits

Format: `type: description` (e.g., `feat:`, `fix:`, `test:`, `ci:`, `docs:`, `chore:`, `refactor:`).

| Type | When to Use |
| ---- | ----------- |
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change without feature/fix |
| `test` | Adding or fixing tests |
| `chore` | Build, deps, config changes |
| `ci` | CI/CD configuration |

**Rules**: Subject in imperative mood, ~50-72 chars, no period. Body optional for non-trivial commits. Language: English.
Write as a human engineer — **NEVER** include AI-internal concepts (phase numbers, todo IDs, agent names, workflow
metadata). No `Co-authored-by` trailers. No agent attribution lines.

**Good**: `feat: add OPML import command with duplicate detection`

**Bad**: `feat: Phase 2 - Todo 1 - implement OPML import`

### Commit Policy

Commit after completing each logical change with all checks passing. Each commit should represent ONE logical change.
Split unrelated concerns into separate commits — never bundle multiple unrelated changes into a single large commit.
Never commit broken code.

## CI & Tooling

**Biome 2.4**: Formatting + linting via `biome.json`. Rules: `recommended` on, `noExplicitAny` off, `noNonNullAssertion`
off, `noForEach` off.

**Pre-commit**: husky runs `lint-staged` → `biome check --write` on `*.{ts,js,json}`.

**Build**: tsup (ESM output, `.mjs` extension). sql.js WASM binary copied to `dist/` via `tsup.config.ts` onSuccess hook.

**Release**: release-please (automated via GitHub Actions) — conventional commits determine version bumps.

<!-- Tier 4: Extended Reference — consult when needed -->

## Key Dependencies

| Package | Purpose |
| ------- | ------- |
| **citty** | CLI framework with `defineCommand` + subcommands |
| **zod** | Schema validation and type inference |
| **vitest** | Test framework (globals mode) |
| **openai** | LLM client (OpenAI-compatible endpoints) |
| **sql.js** | SQLite via WASM (no native deps, cross-platform) |
| **cheerio** | HTML parsing for web scraping |
| **rss-parser** | RSS/Atom feed parsing |
| **p-limit** | Concurrency control for parallel fetches |
| **consola** | Logging (all output to stderr) |
| **js-yaml** | YAML config parsing |
| **env-paths** | XDG-compliant config/data/cache paths |
| **proper-lockfile** | File locking for concurrent SQLite access |
| **tsup** | Build tool (ESM output, `.mjs` extension) |
| **@biomejs/biome** | Formatter and linter (Biome 2.4) |

## Environment & Constraints

- **Node.js >= 20** required (target: node20).
- Cross-platform: Mac/Linux/Windows (zero native dependencies).
- ESM output only — no CommonJS.
- Package manager: **pnpm** (see `packageManager` field in `package.json`).
- sql.js WASM binary is copied to `dist/` during build (`tsup.config.ts` onSuccess hook).

## Extending the Project

| Task | Reference |
| ---- | --------- |
| Add CLI command | `src/commands/` + register in `src/cli.ts` |
| Add source type | `src/sources/` |
| Add LLM provider | `src/llm/` |
| Add output format | `src/output/` |
| Change config schema | `src/config/` (Zod schemas) |
| Add DB logic | `src/db/` |
| Add utility | `src/utils/` |
| Add tests | `tests/{module}/` mirroring `src/` |
| Add fixtures | `fixtures/` |
| Update documentation | `docs/` (architecture, commands, configuration, development) |

### New Module Checklist

1. Create module under `src/<domain>/`.
2. Add test file(s) under `tests/<domain>/`.
3. Update `docs/` if the module introduces new commands, config, or architecture changes.
4. Update this AGENTS.md (Structure section). Run all checks.

## Gotchas

- Default CLI command is `run` — no subcommand needed for normal operation.
- Config auto-creates on first use; `init` is optional for explicit setup.
- `auth` command interactively configures LLM provider — stores API key in `config.yaml`.
- Set `DAILYBREW_API_KEY` env var for the LLM API key (recommended over hardcoding in YAML).
- sql.js WASM binary must be in `dist/` — the build step copies it automatically.
- `proper-lockfile` prevents concurrent SQLite corruption — don't bypass it.
- Biome's `noExplicitAny` is off but avoid `any` where possible — prefer `unknown`.
- Coverage threshold: 80% lines/functions/statements, 70% branches.
