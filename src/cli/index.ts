#!/usr/bin/env bun
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInit } from './init'
import { packageRoot } from './paths'

const USAGE = `usage: shakespii <command>

commands:
  init <name> [--description "..."]   scaffold a new skill (intentionally lint-RED)
  lint <path> [--json] [--corpus] [--config <file>]   lint a skill directory or corpus root
  test <path> [--json]                run static harness checks on a skill's eval suite

flags: --help, --version`

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'init':
      return runInit(rest)
    case 'lint': {
      const { runLint } = await import('./lint')
      return runLint(rest)
    }
    case 'test': {
      const { runTest } = await import('./test')
      return runTest(rest)
    }
    case '--version': {
      const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version: string }
      console.log(pkg.version)
      return 0
    }
    case '--help':
      console.log(USAGE)
      return 0
    case undefined:
      console.error(USAGE)
      return 2
    default:
      console.error(`unknown command: ${cmd}\n\n${USAGE}`)
      return 2
  }
}

process.exit(await main())
