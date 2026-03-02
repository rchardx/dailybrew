# Development Guide

This document covers setup, testing, building, and releasing for the dailybrew project.

## Prerequisites

- Node.js >= 20
- pnpm (configured as the package manager in package.json)

## Setup

```bash
git clone https://github.com/rchardx/dailybrew.git
cd dailybrew
pnpm install
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Build | `pnpm build` | Build with tsup (ESM output, `.mjs` extension) |
| Test | `pnpm test` | Run all tests with vitest |
| Test (watch) | `pnpm dev` | Watch mode for tests |
| Test (coverage) | `pnpm test:coverage` | Coverage report (80% lines/functions/statements, 70% branches) |
| Lint | `pnpm lint` | Type-check with `tsc --noEmit` |
| Format | `pnpm format` | Auto-format with Biome (`biome check --write .`) |
| Check | `pnpm check` | Biome check without auto-fix |

## Testing

The project uses vitest with `globals: true`, so `describe`, `it`, `expect`, `vi`, and `beforeEach` are available globally.

### Structure

The test structure mirrors the source directory at `tests/{module}/{name}.test.ts`.

- Run a single file: `pnpm vitest run tests/config/schema.test.ts`
- Run a directory: `pnpm vitest run tests/llm/`

Coverage is handled by `@vitest/coverage-v8` with configuration in `vitest.config.ts`.

### Key Testing Patterns

- Network calls: Mock `globalThis.fetch` with `vi.fn()`.
- Modules: Partial-mock modules with `importOriginal` to keep real exports while mocking specific functions.
- Logging: Suppress noise by mocking `../../src/utils/logger` and returning `vi.fn()` for all methods.
- File system: Use `fs.mkdtempSync` for isolated tests.
- Fixtures: Load test data using `readFileSync(join(fixturesDir, 'sample-rss.xml'), 'utf-8')`.
- Integration: Mock `loadSources` to avoid reading the real user configuration.

## Code Style

Style is enforced by Biome 2.4 via `biome.json`. A pre-commit hook using husky and lint-staged runs `biome check --write` on `*.{ts,js,json}` files.

### Key Rules

- Indent: 2 spaces.
- Line width: 100 characters.
- Quotes: Single quotes.
- Semicolons: `asNeeded` (Biome only inserts where required).
- Trailing commas: Always on multi-line constructs.
- Imports: ESM only. Use the `.js` extension for local imports.
- Import grouping: `node:` builtins, followed by external packages, then internal modules.

### Naming Conventions

- Files: `lowercase-with-hyphens`
- Functions: `camelCase`
- Types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Zod schemas: `camelCase` + `Schema` suffix

## Building

The project uses tsup for building ESM output with a `.mjs` extension.

- Command: `pnpm build`
- Process: Compiles TypeScript and copies the sql.js WASM binary to `dist/`.
- Implementation: The WASM copy is handled by the `tsup.config.ts` onSuccess hook.
- Output: All files are written to the `dist/` directory.

## Releasing

Releases are managed via Changesets.

```bash
# 1. Ensure all checks pass
pnpm lint && pnpm test

# 2. Create a changeset to describe the change and pick the bump type
pnpm changeset

# 3. Apply the version bump to package.json and the CHANGELOG
pnpm version

# 4. Commit the version change
git add . && git commit -m "chore: release vX.Y.Z"

# 5. Build and publish to npm
pnpm release

# 6. Push to remote
git push && git push --tags
```

`pnpm changeset` is interactive and creates a markdown file in `.changeset/`. `pnpm version` reads these files, bumps versions, updates the CHANGELOG, and deletes the consumed changesets. It does not auto-commit. `pnpm release` runs `pnpm build && changeset publish`. The access level is `public` and the base branch is `main`.

## Commit Conventions

Format: `type: description`

- Use imperative mood, approximately 50 to 72 characters, and no period.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
- Each commit represents one logical change. Avoid bundling unrelated changes.
- Never commit broken code. Run `pnpm lint && pnpm test` before every commit.

## Project Structure

- `src/`: Source code including CLI, commands, config, db, llm, output, sources, and utils.
- `tests/`: Tests mirroring the src structure and integration tests.
- `fixtures/`: Test data such as XML feeds and HTML pages.
- `docs/`: Documentation.
- `dist/`: Build output (gitignored).
