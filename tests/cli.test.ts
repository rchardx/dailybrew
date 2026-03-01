import { describe, it, expect } from 'vitest'
import { main } from '../src/cli.ts'

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
})
