import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NAME_RE } from '../lib/rules/FM02'
import { templateDir } from './paths'

function copyTemplate(src: string, dest: string, name: string, description?: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyTemplate(s, d, name, description)
      continue
    }
    let text = readFileSync(s, 'utf8').replaceAll('{{name}}', name)
    if (description !== undefined && entry.name === 'SKILL.md') {
      text = text.replace(/^description: ".*"$/m, `description: ${JSON.stringify(description)}`)
    }
    writeFileSync(d, text)
  }
}

export function runInit(argv: string[]): number {
  let description: string | undefined
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--description') {
      description = argv[++i]
      if (description === undefined) {
        console.error('--description requires a value')
        return 2
      }
    } else {
      positionals.push(argv[i])
    }
  }
  const name = positionals[0]
  if (!name || positionals.length > 1) {
    console.error('usage: shakespii init <name> [--description "..."]')
    return 2
  }
  if (!NAME_RE.test(name) || name.length > 64) {
    console.error(`invalid name "${name}": must be kebab-case (${NAME_RE.source}), ≤64 chars (FM02)`)
    return 2
  }
  const target = resolve(process.cwd(), name)
  if (existsSync(target)) {
    console.error(`refusing to overwrite: ${target} already exists`)
    return 2
  }
  copyTemplate(templateDir, target, name, description)
  console.log(`Scaffolded ${name}/ — intentionally lint-RED (RED-by-design; fill each TODO(shakespii) to go green).`)
  console.log(`Next: shakespii lint ${name}`)
  return 0
}
