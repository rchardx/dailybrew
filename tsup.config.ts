import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outExtension() {
    return {
      js: '.mjs',
    }
  },
  target: 'node18',
  clean: true,
  dts: true,
  sourcemap: true,
  onSuccess: async () => {
    // Copy sql.js WASM binary to dist/
    try {
      mkdirSync('dist', { recursive: true })
      copyFileSync(
        join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
        join('dist', 'sql-wasm.wasm'),
      )
      console.log('✓ Copied sql-wasm.wasm to dist/')
    } catch (error) {
      console.error('Failed to copy WASM binary:', error)
    }
  },
})
