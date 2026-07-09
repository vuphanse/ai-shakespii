import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const TEMPLATE = join(import.meta.dir, '../../templates/skill')

test('fresh init output produces exactly the M1 RED set and byte-matches the template', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'shakespii-keystone-'))
  expect(Bun.spawnSync(['bun', CLI, 'init', 'demo-skill'], { cwd }).exitCode).toBe(0)

  const lint = Bun.spawnSync(['bun', CLI, 'lint', 'demo-skill', '--json'], { cwd })
  expect(lint.exitCode).toBe(1)
  const report = JSON.parse(lint.stdout.toString())

  expect(report.summary).toEqual({ errors: 20, warnings: 1 })
  const byRule = new Map<string, number>()
  for (const f of report.findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1)
  expect(byRule.get('PH01')).toBe(18)
  expect(byRule.get('FM04')).toBe(1)
  expect(byRule.get('CT03')).toBe(1)
  expect(byRule.has('TR01')).toBe(false) // migrated template evals validate; TR01 stays silent on fresh scaffolds
  expect(byRule.get('TR02')).toBe(1) // no triggers.json in the fresh scaffold
  expect(report.findings.length).toBe(21) // no other findings

  const ph01ByFile = new Map<string, number>()
  for (const f of report.findings) {
    if (f.ruleId === 'PH01') ph01ByFile.set(f.file, (ph01ByFile.get(f.file) ?? 0) + 1)
  }
  expect(ph01ByFile.get('SKILL.md')).toBe(8)
  expect(ph01ByFile.get('evals/evals.json')).toBe(9)
  expect(ph01ByFile.get('README.md')).toBe(1)

  for (const rel of ['SKILL.md', 'README.md', 'evals/evals.json']) {
    const templated = readFileSync(join(TEMPLATE, rel), 'utf8').replaceAll('{{name}}', 'demo-skill')
    const emitted = readFileSync(join(cwd, 'demo-skill', rel), 'utf8')
    expect(emitted).toBe(templated)
  }
})
