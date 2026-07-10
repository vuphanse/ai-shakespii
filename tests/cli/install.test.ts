import { expect, test } from 'bun:test'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
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

// ---- Task 5: multi-provider + advisory ----

/** A body long and distinctive enough to trip XS02 (similarity 0.65) when duplicated. */
const CLONE_PROCEDURE = [
  '1. Read the incident channel and collect every alert fired in the last hour.',
  '2. Group the alerts by originating service and sort each group by first-seen time.',
  '3. For each group, open the runbook named after the service and follow its triage table.',
  '4. Record the triage verdict for every alert in the incident timeline document.',
  '5. Escalate any group whose verdict is page-worthy to the on-call engineer directly.',
  '6. Summarize the remaining groups into a single digest message for the channel.',
  '7. Attach the digest to the incident timeline and mark the sweep complete.',
  '8. Schedule a follow-up sweep for one hour later unless the incident is closed.',
  '9. If the incident is closed, write the closing summary and archive the timeline.',
  '10. File one ticket per recurring alert group with the digest linked as evidence.',
  '11. Tag each ticket with the originating service and the sweep timestamp.',
  '12. Post the ticket links back into the incident channel as the final step.',
  '13. Hand the sweep log to the next on-call shift with open questions highlighted.',
  '14. Review the runbook steps that produced wrong verdicts and note corrections.',
  '15. Propose one runbook amendment per wrong verdict in the weekly review doc.',
].join('\n')

test('advisory: duplicate-heavy candidate reports XS findings but still installs', () => {
  const home = freshHome()
  const skillsDir = join(home, '.claude/skills')
  // an existing installed clone
  const neighborSrc = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')), { name: 'alert-sweep' })
  writeFileSync(join(neighborSrc, 'SKILL.md'), cleanSkillRaw({ procedure: CLONE_PROCEDURE }).replace('name: test-skill', 'name: alert-sweep').replace('# test-skill', '# alert-sweep'))
  mkdirSync(skillsDir, { recursive: true })
  cpSync(neighborSrc, join(skillsDir, 'alert-sweep'), { recursive: true })
  // the candidate: same body, different name
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')), { name: 'alert-sweeper' })
  writeFileSync(join(src, 'SKILL.md'), cleanSkillRaw({ procedure: CLONE_PROCEDURE }).replace('name: test-skill', 'name: alert-sweeper').replace('# test-skill', '# alert-sweeper'))

  const r = run(['install', src, '--json'], { HOME: home })
  expect(r.exitCode).toBe(0) // advisory never blocks
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.targets[0].installed).toBe(true)
  expect(rep.targets[0].advisory.length).toBeGreaterThan(0)
  expect(rep.targets[0].advisory.some((f: { ruleId: string }) => f.ruleId === 'XS02')).toBe(true)
  const sites = rep.targets[0].advisory.flatMap((f: { sites: Array<{ skill: string }> }) => f.sites.map(s => s.skill))
  expect(sites).toContain('alert-sweeper')
})

test('advisory excludes the same-name copy being replaced (no self-similarity)', () => {
  const home = freshHome()
  const skillsDir = join(home, '.claude/skills')
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')), { name: 'alert-sweep' })
  writeFileSync(join(src, 'SKILL.md'), cleanSkillRaw({ procedure: CLONE_PROCEDURE }).replace('name: test-skill', 'name: alert-sweep').replace('# test-skill', '# alert-sweep'))
  mkdirSync(skillsDir, { recursive: true })
  cpSync(src, join(skillsDir, 'alert-sweep'), { recursive: true }) // same skill already installed
  const r = run(['install', src, '--force', '--json'], { HOME: home })
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.targets[0].advisory).toBeNull() // only the old copy existed and it is excluded → skipped, reported as null
})

test('advisory ran clean is [] — distinguishable from skipped null', () => {
  const home = freshHome()
  const skillsDir = join(home, '.claude/skills')
  // A genuinely different neighbor (every section distinct), so the advisory
  // runs and finds nothing — the default helper body would be near-identical
  // to the candidate's and could trip XS02 by construction.
  const neighborDir = join(mkdtempSync(join(tmpdir(), 'shakespii-src-')), 'weather-brief')
  mkdirSync(neighborDir, { recursive: true })
  writeFileSync(
    join(neighborDir, 'SKILL.md'),
    cleanSkillRaw({
      description: 'Use when the user asks for a one-line weather brief for a named city.',
      intent: 'Turn a city name into a single-line weather brief.',
      inputs: 'A city name in plain text.',
      preconditions: 'A weather source is reachable.',
      procedure: '1. Fetch the current conditions for the city.\n2. Compose one line: city, sky, temperature.',
      output: 'One line of weather, nothing else.',
      examples: 'Given the input `Hanoi`, the expected output is `Hanoi: clear, 31°C`.',
      'anti-patterns': 'Multi-line forecasts.',
    })
      .replace('name: test-skill', 'name: weather-brief')
      .replace('# test-skill', '# weather-brief'),
  )
  mkdirSync(skillsDir, { recursive: true })
  cpSync(neighborDir, join(skillsDir, 'weather-brief'), { recursive: true })
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const rep = JSON.parse(run(['install', src, '--json'], { HOME: home }).stdout.toString())
  expect(rep.targets[0].advisory).toEqual([])
  expect(rep.targets[0].installed).toBe(true)
})

test('empty target corpus: advisory skipped — null in JSON, noted in pretty output', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const j = run(['install', src, '--json'], { HOME: home })
  const rep = JSON.parse(j.stdout.toString())
  expect(rep.targets[0].advisory).toBeNull()
  expect(rep.targets[0].installed).toBe(true)

  const home2 = freshHome()
  const p = run(['install', src], { HOME: home2 })
  expect(p.exitCode).toBe(0)
  expect(p.stdout.toString()).toContain('advisory: skipped')
})

test('--provider repeated installs to both, deduplicated', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--provider', 'claude', '--provider', 'codex', '--provider', 'claude', '--json'], { HOME: home })
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.targets.map((t: { provider: string }) => t.provider)).toEqual(['claude', 'codex'])
  expect(existsSync(join(home, '.claude/skills/test-skill/SKILL.md'))).toBe(true)
  expect(existsSync(join(home, '.codex/skills/test-skill/SKILL.md'))).toBe(true)
})

test('unknown provider: exit 2 listing the registry', () => {
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--provider', 'emacs'], { HOME: freshHome() })
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('unknown provider: emacs')
  expect(r.stderr.toString()).toContain('ezio')
})

test('--provider all targets only detected providers', () => {
  const home = freshHome()
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(home, '.config/ai-ezio'), { recursive: true })
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--provider', 'all', '--json'], { HOME: home })
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.targets.map((t: { provider: string }) => t.provider)).toEqual(['claude', 'ezio'])
  expect(existsSync(join(home, '.config/ai-ezio/skills/test-skill/SKILL.md'))).toBe(true)
})

test('--provider all with nothing detected: exit 2', () => {
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  const r = run(['install', src, '--provider', 'all'], { HOME: freshHome() })
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('no providers detected')
})

test('partial multi-target outcome: occupied target blocked, other installed, exit 1', () => {
  const home = freshHome()
  const src = writeSkill(mkdtempSync(join(tmpdir(), 'shakespii-src-')))
  mkdirSync(join(home, '.codex/skills/test-skill'), { recursive: true }) // pre-occupy codex only
  const r = run(['install', src, '--provider', 'claude', '--provider', 'codex', '--json'], { HOME: home })
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout.toString())
  const byProvider = Object.fromEntries(rep.targets.map((t: { provider: string }) => [t.provider, t]))
  expect(byProvider.claude.installed).toBe(true)
  expect(byProvider.codex).toMatchObject({ installed: false, reason: 'occupied: directory' })
  expect(existsSync(join(home, '.claude/skills/test-skill/SKILL.md'))).toBe(true)
})
