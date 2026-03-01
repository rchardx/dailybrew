#!/usr/bin/env node

import { runMain } from 'citty'
import { main } from '../dist/cli.mjs'

runMain(main).catch(error => {
  console.error(error)
  process.exit(1)
})
