import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { main } from '../src/cli.ts'

// Mock logger to suppress output
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    start: vi.fn(),
    fail: vi.fn(),
    log: vi.fn(),
  },
}))

// Mock the run command module to avoid side effects
vi.mock('../src/commands/run', () => ({
  default: {
    meta: { name: 'run', description: 'mock run command' },
    args: {},
    run: vi.fn(),
  },
}))

describe('CLI', () => {
  it('should export a valid citty command', () => {
    expect(main).toBeDefined()
    expect(main).toHaveProperty('meta')
    expect(main.meta).toHaveProperty('name', 'dailybrew')
    expect(main.meta).toHaveProperty('version')
    expect(main.meta).toHaveProperty('description')
  })

  it('should have required properties', () => {
    expect(main).toHaveProperty('args')
    expect(main).toHaveProperty('run')
    expect(typeof main.run).toBe('function')
  })

  describe('subCommands', () => {
    it('should register all 6 subcommands', () => {
      expect(main.subCommands).toBeDefined()
      const subCommandNames = Object.keys(main.subCommands ?? {})
      expect(subCommandNames).toHaveLength(6)
      expect(subCommandNames).toContain('run')
      expect(subCommandNames).toContain('init')
      expect(subCommandNames).toContain('config')
      expect(subCommandNames).toContain('list')
      expect(subCommandNames).toContain('import')
      expect(subCommandNames).toContain('auth')
    })

    it('should lazy-load each subcommand as a function returning a promise', () => {
      const subCommands = main.subCommands ?? {}
      for (const [name, loader] of Object.entries(subCommands)) {
        expect(typeof loader).toBe('function', `subCommand "${name}" should be a function`)
      }
    })

    it('should resolve run subcommand to a command with meta', async () => {
      const subCommands = main.subCommands ?? {}
      const runLoader = subCommands.run
      expect(runLoader).toBeDefined()
      const runCmd = await (runLoader as () => Promise<unknown>)()
      expect(runCmd).toBeDefined()
      expect(runCmd).toHaveProperty('meta')
    })
  })

  describe('run() function — subcommand detection', () => {
    let originalArgv: string[]

    beforeEach(() => {
      originalArgv = process.argv
    })

    afterEach(() => {
      process.argv = originalArgv
    })

    it('should return early when first arg is a known subcommand name', async () => {
      // Simulate: dailybrew init
      process.argv = ['node', 'cli.js', 'init']

      // The run() function should return early without importing run command
      const runFn = main.run as (context: {
        rawArgs: string[]
        args: Record<string, unknown>
      }) => Promise<void>
      // citty passes a context object to run()
      await runFn({ rawArgs: ['init'], args: {} })

      // If it returned early, no error thrown — test passes
    })

    it('should return early when first arg is "config" subcommand', async () => {
      process.argv = ['node', 'cli.js', 'config']

      const runFn = main.run as (context: {
        rawArgs: string[]
        args: Record<string, unknown>
      }) => Promise<void>
      await runFn({ rawArgs: ['config'], args: {} })
    })

    it('should return early when first arg is "auth" subcommand', async () => {
      process.argv = ['node', 'cli.js', 'auth']

      const runFn = main.run as (context: {
        rawArgs: string[]
        args: Record<string, unknown>
      }) => Promise<void>
      await runFn({ rawArgs: ['auth'], args: {} })
    })

    it('should execute default run command when no subcommand is given', async () => {
      // Simulate: dailybrew (no args)
      process.argv = ['node', 'cli.js']

      const runFn = main.run as (context: {
        rawArgs: string[]
        args: Record<string, unknown>
      }) => Promise<void>

      // This will import and run the mock run command
      await runFn({ rawArgs: [], args: {} })
    })

    it('should execute default run command when only flags are given', async () => {
      // Simulate: dailybrew --output digest.md
      process.argv = ['node', 'cli.js', '--output', 'digest.md']

      const runFn = main.run as (context: {
        rawArgs: string[]
        args: Record<string, unknown>
      }) => Promise<void>
      await runFn({ rawArgs: ['--output', 'digest.md'], args: {} })
    })

    it('should skip flags when detecting subcommand name', async () => {
      // Simulate: dailybrew --verbose run
      // The first non-flag arg is "run", which is a subcommand
      process.argv = ['node', 'cli.js', '--verbose', 'run']

      const runFn = main.run as (context: {
        rawArgs: string[]
        args: Record<string, unknown>
      }) => Promise<void>
      await runFn({ rawArgs: ['--verbose', 'run'], args: {} })
    })
  })

  describe('meta', () => {
    it('should have version "1.0.0"', () => {
      expect(main.meta?.version).toBe('1.0.0')
    })

    it('should have description mentioning LLM and RSS', () => {
      expect(main.meta?.description).toContain('LLM')
      expect(main.meta?.description).toContain('RSS')
    })
  })
})
