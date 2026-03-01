# AGENTS.md - dailybrew

Guidelines for AI coding agents working in this repository.

## Build, Lint, Test Commands

```bash
# Package manager — MUST use pnpm (see packageManager field in package.json)
pnpm install

# Build (TypeScript → dist/ via tsup, copies sql-wasm.wasm)
pnpm build

# Type-check without emitting
pnpm lint

# Run all tests
pnpm test

# Run a single test file
pnpm vitest run tests/config/schema.test.ts

# Run tests matching a directory
pnpm vitest run tests/llm/

# Run tests in watch mode
pnpm dev

# Run tests with coverage (thresholds: 80% lines/functions/statements, 70% branches)
pnpm test:coverage

# Auto-format with Biome
pnpm format
```

## Code Style Guidelines

Enforced by **Biome 2.4** via `biome.json` and **husky + lint-staged** pre-commit hook.

### Imports & Modules
- ESM only (`"type": "module"` in package.json)
- Single quotes for strings
- Use `.js` extension for local imports (e.g., `import { foo } from './bar.js'`)
- Group imports: `node:` builtins first, external packages, then internal modules
- Imports are NOT auto-organized by Biome (organizeImports is off) — maintain manual grouping

### Formatting
- 2-space indentation
- Semicolons: `asNeeded` (Biome inserts only where required for ASI hazards — most lines have none)
- Line width: 100 characters
- Trailing commas in multi-line objects, arrays, and parameters

### Naming Conventions
- **Files**: lowercase with hyphens (`url.ts`, `rss.test.ts`, `cli-progress.ts`)
- **Functions**: camelCase (`fetchRssFeed`, `normalizeUrl`, `parseSinceDuration`)
- **Types**: PascalCase (`LLMConfig`, `Source`, `Config`, `DigestItem`)
- **Constants**: UPPER_SNAKE_CASE for true constants (`MAX_SUMMARY_LENGTH`)
- **Zod schemas**: camelCase + `Schema` suffix (`configSchema`, `sourceSchema`)

### TypeScript
- Strict mode enabled (`tsconfig.json` has `"strict": true`)
- Target: ES2022, module: ESNext, moduleResolution: bundler
- Use **Zod** for runtime validation; derive types with `z.infer<>`:
  ```typescript
  export const sourceSchema = z.object({ name: z.string(), url: z.string().url() })
  export type Source = z.infer<typeof sourceSchema>
  ```
- Prefer `type` over `interface` for data shapes
- Note: Biome's `noExplicitAny` is off, but avoid `any` where possible — prefer `unknown`
- Never use `@ts-ignore` or `@ts-expect-error`

### Error Handling
- Return `null` or error objects instead of throwing when possible
- Wrap external calls (fetch, file I/O, LLM) in try/catch with descriptive messages
- Use `try/finally` to clean up resources (e.g., `store.close()`)
- Never use empty catch blocks — always log or handle the error
- Use `consola` logger (`import { logger } from './utils/logger'`) — all logs go to stderr

### Architecture
- **Functions + modules** only — no classes, no dependency injection
- CLI commands use `citty` with `defineCommand`
- Lazy-load subcommands: `run: () => import('./commands/run').then((m) => m.default)`
- Configuration in `~/.config/dailybrew/config.yaml` (LLM settings, options)
- Sources in separate `~/.config/dailybrew/sources.yaml` (managed via `list add/remove`)
- SQLite state in `~/.local/share/dailybrew/dailybrew.db`
- Paths resolved via `env-paths('dailybrew')` — never hardcode `~/.config` or `~/.local`

## File Organization

```
src/
  cli.ts              # Entry point, subcommand routing (default = run)
  commands/           # CLI subcommands: run, init, config, list, import, auth
  config/             # Schema (Zod), loader (YAML), sources management, ensure/auto-init
  db/                 # SQLite store (sql.js WASM) + dedup logic + lockfile protection
  llm/                # OpenAI client, summarizer, prompt building, response schemas
  output/             # Markdown digest formatter
  sources/            # RSS fetcher, web scraper, feed detection, OPML parser
  types/              # Ambient type declarations (e.g., sql.js.d.ts)
  utils/              # URL normalization, logger (consola), progress bars
tests/
  {module}/           # Mirrors src/ structure: tests/sources/rss.test.ts
  integration/        # End-to-end pipeline tests (mock network + LLM, real fs + SQLite)
fixtures/             # Test data: sample-rss.xml, sample-atom.xml, sample-article.html,
                      #   sample-blog.html, sample-page-with-feed.html, malformed.xml
```

## Testing (Vitest)

- Config: `vitest.config.ts` — `globals: true` means `describe`, `it`, `expect`, `vi`, `beforeEach`, etc. are available globally (no import needed, though importing from `vitest` also works)
- Test files: `tests/{module}/{name}.test.ts`
- Use `describe`/`it` blocks, test both success and error paths
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
- Use temp directories for file system tests (`fs.mkdtempSync`)
- Integration tests mock `loadSources` to avoid reading real user config
- Prefer strict assertions: `expect(x).toBe(true)` over `expect(x).toBeTruthy()`
- Load fixtures with `readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')`

## Key Dependencies

- **citty**: CLI framework with `defineCommand` + subcommands
- **zod**: Schema validation and type inference
- **vitest**: Test framework (globals mode)
- **openai**: LLM client (OpenAI-compatible endpoints)
- **sql.js**: SQLite via WASM (no native deps, cross-platform)
- **cheerio**: HTML parsing for web scraping
- **rss-parser**: RSS/Atom feed parsing
- **p-limit**: Concurrency control for parallel fetches
- **consola**: Logging (all output to stderr)
- **js-yaml**: YAML config parsing
- **env-paths**: XDG-compliant config/data/cache paths
- **proper-lockfile**: File locking for concurrent SQLite access
- **tsup**: Build tool (ESM output, `.mjs` extension)

## Environment & Constraints

- **Node.js >= 20** required (target: node20)
- Cross-platform: Mac/Linux/Windows (zero native dependencies)
- ESM output only — no CommonJS
- sql.js WASM binary is copied to `dist/` during build (`tsup.config.ts` onSuccess hook)
- Pre-commit: husky runs `lint-staged` → `biome check --write` on `*.{ts,js,json}`

## Git Commit Guidelines

- Do NOT add `Co-authored-by` trailers to commits
- Do NOT add `Ultraworked with [Sisyphus]` or any agent attribution lines to commit messages
- Commit messages should contain ONLY the subject line (and optionally a body describing the change)
- Use semantic commit style: `type: description` (e.g., `feat:`, `fix:`, `test:`, `ci:`, `docs:`, `chore:`, `refactor:`)
- Language: English
