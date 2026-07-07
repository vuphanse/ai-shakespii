import { expect, test } from 'bun:test'
import { runRulesWith } from '../../src/lib/engine'
import type { ParsedSkill, Profile, Rule } from '../../src/lib/types'

const SKILL = { dir: '/x', dirName: 'x', raw: '', frontmatter: { raw: null, parsed: null, error: null }, body: { raw: '', lineOffset: 1, h1: null, sections: [] }, files: [], dirs: [] } as ParsedSkill

const PROFILE = {
  profile: 'test',
  provenance: {},
  anatomy: { intent: { canonical: 'Intent', aliases: [], level: 'warn' } },
  rules: { T1: 'error', T2: { severity: 'warn', options: { flag: true } } },
} as unknown as Profile

const T1: Rule = {
  id: 'T1',
  check: () => [
    { message: 'b-file', file: 'b.md', line: 3 },
    { message: 'null-line', file: 'a.md', line: null },
    { message: 'downgraded', file: 'a.md', line: 1, severity: 'warn' },
  ],
}
const T2: Rule = {
  id: 'T2',
  check: (_s, ctx) => [{ message: `opts:${String(ctx.options.flag)}`, file: 'a.md', line: 1 }],
}
const T3: Rule = { id: 'T3', check: () => [{ message: 'no profile entry', file: 'a.md', line: 1 }] }

test('engine stamps severity from profile, respects per-finding override, skips unlisted rules, sorts', () => {
  const findings = runRulesWith([T1, T2, T3], SKILL, PROFILE)
  expect(findings.map(f => f.ruleId)).toEqual(['T1', 'T2', 'T1', 'T1'])
  expect(findings[0]).toEqual({ ruleId: 'T1', severity: 'warn', message: 'downgraded', file: 'a.md', line: 1 })
  expect(findings[1].message).toBe('opts:true')
  expect(findings[1].severity).toBe('warn')
  expect(findings[2]).toEqual({ ruleId: 'T1', severity: 'error', message: 'null-line', file: 'a.md', line: null })
  expect(findings[3].file).toBe('b.md')
})
