# AGENTS.md - dailybrew

Guidelines for agentic coding agents working in the dailybrew repository.

## Build, Lint, Test Commands

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript to dist/)
npm run build

# Run all tests
npm test

# Run a single test file
npx vitest run tests/config/schema.test.ts

# Run tests in watch mode (for development)
npm run dev

# Type check without emitting (lint)
npm run lint
```

## Code Style Guidelines

### Imports & Modules
- Use **ESM modules** (`"type": "module"` in package.json)
- Prefer **single quotes** for strings
- Use explicit imports with `.js` extension for local modules (e.g., `import { foo } from './bar.js'`)
- Group imports: external deps first, then internal modules

### Formatting
- **No semicolons** (project style - be consistent)
- 2-space indentation
- Max line length: follow existing patterns (~100 chars)
- Trailing commas in multi-line objects/arrays

### Naming Conventions
- **Files**: lowercase with hyphens (e.g., `brew.test.ts`, `url-utils.ts`)
- **Functions**: camelCase (e.g., `fetchRssFeed`, `normalizeUrl`)
- **Types/Interfaces**: PascalCase (e.g., `LLMConfig`, `Source`, `Config`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `MAX_SUMMARY_LENGTH`)
- **Schemas**: camelCase with `Schema` suffix (e.g., `configSchema`, `sourceSchema`)

### TypeScript
- **Strict mode enabled** - no `any` types, proper null checks
- Use Zod for runtime validation and type inference
- Export types alongside schemas: `export type Config = z.infer<typeof configSchema>`
- Prefer `type` over `interface` for simple type aliases
- Use explicit return types for public functions

### Architecture Patterns
- **Functions + modules** - no classes, no dependency injection
- Each module exports specific functions, not generic classes
- CLI commands use `citty` with `defineCommand`
- Lazy-load subcommands: `() => import('./commands/brew').then(m => m.default)`

### Error Handling
- Use **Zod** for input validation with descriptive error messages
- Return `null` or error objects instead of throwing when possible
- Wrap external calls in try/catch, return clean error messages
- Use `try/finally` to ensure resources are cleaned up (e.g., `store.close()`)
- Never use empty catch blocks - always log or handle the error

### Testing (Vitest)
- Test files: `tests/{module}/{name}.test.ts`
- Use `describe` and `it` blocks
- Mock external dependencies (network, LLM, file system)
- Use `vi.mock()` for module mocking
- Prefer `expect(result.success).toBe(true)` over truthy checks
- Test both success and error paths

### File Organization
```
src/
  cli.ts              # Main entry point
  commands/           # CLI subcommands (brew, init, add, remove, list)
  config/             # Schema + loader
  db/                 # SQLite store + dedup logic
  llm/                # OpenAI client + summarizer
  output/             # Markdown formatter
  sources/            # RSS + web fetchers
  utils/              # URL normalization, hashing
```

### Key Dependencies
- **citty**: CLI framework
- **zod**: Schema validation
- **vitest**: Testing framework
- **openai**: LLM client
- **sql.js**: SQLite (WASM, no native deps)
- **cheerio**: HTML parsing
- **rss-parser**: RSS/Atom feed parsing
- **p-limit**: Concurrency control

### Environment & Constraints
- **Node.js >= 20** required
- Cross-platform: Mac/Linux/Windows (no native dependencies)
- ESM output only (no CommonJS)
- sql.js WASM must be copied to `dist/` during build

## Running Single Tests

```bash
# Run specific test file
npx vitest run tests/commands/brew.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose tests/llm/

# Run with coverage
npx vitest run --coverage
```

## Common Patterns

### Zod Schema Definition
```typescript
export const mySchema = z.object({
  name: z.string().min(1, 'name is required'),
  count: z.number().int().positive().default(10),
})

export type MyType = z.infer<typeof mySchema>
```

### CLI Command Structure
```typescript
import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'command', description: '...' },
  args: {
    url: { type: 'positional', required: true },
    name: { type: 'string' },
  },
  async run({ args }) {
    // Implementation
  },
})
```

### Error-Resilient Function
```typescript
async function fetchData(url: string): Promise<Result | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error)
    return null
  }
}
```
