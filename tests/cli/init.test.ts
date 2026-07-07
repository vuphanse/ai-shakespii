import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const run = (args: string[], cwd: string) => Bun.spawnSync(['bun', CLI, ...args], { cwd })

test('init scaffolds with {{name}} substituted everywhere', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shakespii-init-'))
  const r = run(['init', 'demo-skill'], cwd)
  expect(r.exitCode).toBe(0)
  expect(r.stdout.toString()).toContain('lint-RED')
  const skillMd = readFileSync(join(cwd, 'demo-skill/SKILL.md'), 'utf8')
  expect(skillMd).toContain('name: demo-skill')
  expect(skillMd).not.toContain('{{name}}')
  const evals = readFileSync(join(cwd, 'demo-skill/evals/evals.json'), 'utf8')
  expect(evals).toContain('"skill": "demo-skill"')
  expect(existsSync(join(cwd, 'demo-skill/README.md'))).toBe(true)
})

test('invalid name: exit 2, nothing created', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shakespii-init-'))
  const r = run(['init', 'Bad_Name'], cwd)
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('kebab-case')
  expect(existsSync(join(cwd, 'Bad_Name'))).toBe(false)
})

test('existing directory: exit 2, refuses overwrite', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shakespii-init-'))
  expect(run(['init', 'demo-skill'], cwd).exitCode).toBe(0)
  const r = run(['init', 'demo-skill'], cwd)
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('already exists')
})

test('--description replaces only the description placeholder', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shakespii-init-'))
  const r = run(['init', 'demo-skill', '--description', 'Use when demoing the scaffold.'], cwd)
  expect(r.exitCode).toBe(0)
  const skillMd = readFileSync(join(cwd, 'demo-skill/SKILL.md'), 'utf8')
  expect(skillMd).toContain('description: "Use when demoing the scaffold."')
  expect(skillMd.match(/TODO\(shakespii\):/g)?.length).toBe(7) // frontmatter placeholder gone, 7 body ones remain
})

test('unknown command and missing args: exit 2', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shakespii-init-'))
  expect(run(['bogus'], cwd).exitCode).toBe(2)
  expect(run(['init'], cwd).exitCode).toBe(2)
})
