import { expect, test } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanSkillRaw } from '../helpers/skill'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')

const run = (args: string[], env: Record<string, string> = {}) =>
  Bun.spawnSync(['bun', CLI, ...args], { cwd: tmpdir(), env: { ...process.env, ...env } })

const freshHome = () => mkdtempSync(join(tmpdir(), 'shakespii-home-'))

/** Write a lint-clean skill dir (name defaults to test-skill) and return its path. */
function writeSkill(parent: string, opts: { name?: string; description?: string } = {}): string {
  const name = opts.name ?? 'test-skill'
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  let raw = cleanSkillRaw({ description: opts.description })
  if (name !== 'test-skill') raw = raw.replace('name: test-skill', `name: ${name}`).replace('# test-skill', `# ${name}`)
  writeFileSync(join(dir, 'SKILL.md'), raw)
  return dir
}

const VALID_EVALS = JSON.stringify({
  skill_name: 'test-skill',
  evals: [
    { id: 1, prompt: 'p1', expected_output: 'o1', files: [], expectations: ['e1'] },
    { id: 2, prompt: 'p2', expected_output: 'o2', files: [], expectations: ['e2'] },
    { id: 3, prompt: 'p3', expected_output: 'o3', files: [], expectations: ['e3'] },
  ],
})

test('clean skill installs to the default claude target under $HOME, exit 0', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--json'], { HOME: home })
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.skill).toBe('test-skill')
  expect(rep.source.kind).toBe('path')
  expect(rep.gate.lint.status).toBe('pass')
  expect(rep.gate.test.status).toBe('skipped')
  expect(rep.targets).toHaveLength(1)
  expect(rep.targets[0].provider).toBe('claude')
  expect(rep.targets[0].path).toBe(join(home, '.claude/skills/test-skill'))
  expect(rep.targets[0].installed).toBe(true)
  expect(rep.targets[0].advisory).toBeNull() // fresh corpus: advisory skipped, reported as null
  expect(existsSync(join(home, '.claude/skills/test-skill/SKILL.md'))).toBe(true)
})

test('INSTALL_REPORT v1 key order is pinned', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const rep = JSON.parse(run(['install', src, '--json'], { HOME: home }).stdout.toString())
  expect(rep.version).toBe(1)
  expect(Object.keys(rep)).toEqual(['version', 'skill', 'source', 'gate', 'targets'])
  expect(Object.keys(rep.source)).toEqual(['kind', 'path'])
  expect(Object.keys(rep.gate)).toEqual(['lint', 'test'])
  expect(Object.keys(rep.gate.lint)).toEqual(['status', 'errors', 'warnings', 'findings'])
  expect(Object.keys(rep.gate.test)).toEqual(['status', 'failures'])
  expect(Object.keys(rep.targets[0])).toEqual(['provider', 'path', 'advisory', 'installed', 'forced', 'reason'])
})

test('lint error blocks: exit 1, nothing written, findings in report', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')), {
    description: 'Compresses shell output into a single line.', // no trigger phrase → FM04 error
  })
  const r = run(['install', src, '--json'], { HOME: home })
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.gate.lint.status).toBe('fail')
  expect(rep.gate.lint.findings.some((f: { ruleId: string }) => f.ruleId === 'FM04')).toBe(true)
  expect(rep.targets[0].installed).toBe(false)
  expect(rep.targets[0].reason).toBe('gate: lint errors')
  expect(rep.targets[0].advisory).toBeNull() // gate blocked before the advisory step
  expect(existsSync(join(home, '.claude/skills/test-skill'))).toBe(false)
})

test('lint warnings alone do not block', () => {
  // cleanSkillRaw ships no evals/triggers.json, so TR01/TR02 warn — install must still land
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const rep = JSON.parse(run(['install', src, '--json'], { HOME: home }).stdout.toString())
  expect(rep.gate.lint.status).toBe('pass')
  expect(rep.gate.lint.warnings).toBeGreaterThan(0)
  expect(rep.targets[0].installed).toBe(true)
})

test('broken evals.json blocks with gate.test fail', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  mkdirSync(join(src, 'evals'))
  writeFileSync(join(src, 'evals/evals.json'), '{ not json')
  const r = run(['install', src, '--json'], { HOME: home })
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.gate.test.status).toBe('fail')
  expect(rep.gate.test.failures.length).toBeGreaterThan(0)
  expect(Object.keys(rep.gate.test.failures[0])).toEqual(['severity', 'message', 'file', 'line'])
  expect(rep.targets[0].reason).toBe('gate: deterministic test failures')
})

test('valid evals.json passes the deterministic gate', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  mkdirSync(join(src, 'evals'))
  writeFileSync(join(src, 'evals/evals.json'), VALID_EVALS)
  const rep = JSON.parse(run(['install', src, '--json'], { HOME: home }).stdout.toString())
  expect(rep.gate.test.status).toBe('pass')
  expect(rep.targets[0].installed).toBe(true)
})

test('--target installs into an arbitrary directory with provider null', () => {
  const target = mkdtempSync(join(tmpdir(), 'shakespii-target-'))
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--target', target, '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.targets[0].provider).toBeNull()
  expect(rep.targets[0].path).toBe(join(target, 'test-skill'))
  expect(existsSync(join(target, 'test-skill/SKILL.md'))).toBe(true)
})

test('SKILL.md path argument resolves to its parent directory', () => {
  const target = mkdtempSync(join(tmpdir(), 'shakespii-target-'))
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', join(src, 'SKILL.md'), '--target', target, '--json'])
  expect(r.exitCode).toBe(0)
})

test('bundled name resolution installs using-shakespii end to end', () => {
  const home = freshHome()
  const r = run(['install', 'using-shakespii', '--json'], { HOME: home })
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.source.kind).toBe('bundled')
  expect(rep.gate.lint).toMatchObject({ status: 'pass', errors: 0, warnings: 0 })
  expect(rep.gate.test.status).toBe('pass')
  expect(existsSync(join(home, '.claude/skills/using-shakespii/SKILL.md'))).toBe(true)
  expect(existsSync(join(home, '.claude/skills/using-shakespii/evals/evals.json'))).toBe(true)
})

test('bundled name resolution installs authoring-skills too', () => {
  const home = freshHome()
  const r = run(['install', 'authoring-skills', '--json'], { HOME: home })
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.source.kind).toBe('bundled')
  expect(rep.gate.lint.status).toBe('pass')
  expect(existsSync(join(home, '.claude/skills/authoring-skills/SKILL.md'))).toBe(true)
})

test('occupied destination directory: refused without --force, replaced with it', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const dest = join(home, '.claude/skills/test-skill')
  mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, 'old-marker.txt'), 'old')

  const refused = run(['install', src, '--json'], { HOME: home })
  expect(refused.exitCode).toBe(1)
  const rep1 = JSON.parse(refused.stdout.toString())
  expect(rep1.targets[0]).toMatchObject({ installed: false, forced: false, reason: 'occupied: directory' })
  expect(existsSync(join(dest, 'old-marker.txt'))).toBe(true)

  const forced = run(['install', src, '--force', '--json'], { HOME: home })
  expect(forced.exitCode).toBe(0)
  const rep2 = JSON.parse(forced.stdout.toString())
  expect(rep2.targets[0]).toMatchObject({ installed: true, forced: true, reason: null })
  expect(existsSync(join(dest, 'old-marker.txt'))).toBe(false)
  expect(existsSync(join(dest, 'SKILL.md'))).toBe(true)
})

test('symlink destination: refused without --force; --force removes the link, never its referent', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const referent = mkdtempSync(join(tmpdir(), 'shakespii-referent-'))
  writeFileSync(join(referent, 'referent-marker.txt'), 'keep me')
  const skillsDir = join(home, '.claude/skills')
  mkdirSync(skillsDir, { recursive: true })
  symlinkSync(referent, join(skillsDir, 'test-skill'))

  const refused = run(['install', src, '--json'], { HOME: home })
  expect(refused.exitCode).toBe(1)
  expect(JSON.parse(refused.stdout.toString()).targets[0].reason).toBe('occupied: symlink')

  const forced = run(['install', src, '--force', '--json'], { HOME: home })
  expect(forced.exitCode).toBe(0)
  expect(lstatSync(join(skillsDir, 'test-skill')).isSymbolicLink()).toBe(false)
  expect(existsSync(join(skillsDir, 'test-skill/SKILL.md'))).toBe(true)
  expect(existsSync(join(referent, 'referent-marker.txt'))).toBe(true) // referent untouched
})

test('unresolvable source: exit 2 naming both attempts', () => {
  const r = run(['install', 'no-such-skill-xyz', '--json'], { HOME: freshHome() })
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('no-such-skill-xyz')
})

test('existing directory without SKILL.md: path wins over bundled lookup, exit 2', () => {
  const decoy = mkdtempSync(join(tmpdir(), 'shakespii-decoy-'))
  const r = run(['install', decoy, '--json'], { HOME: freshHome() })
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('no SKILL.md')
})

test('--provider with --target: exit 2', () => {
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--provider', 'claude', '--target', '/tmp/x'], { HOME: freshHome() })
  expect(r.exitCode).toBe(2)
})

test('pretty mode prints gate lines and an action line', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src], { HOME: home })
  expect(r.exitCode).toBe(0)
  const out = r.stdout.toString()
  expect(out).toContain('gate lint: pass')
  expect(out).toContain('installed test-skill →')
})
