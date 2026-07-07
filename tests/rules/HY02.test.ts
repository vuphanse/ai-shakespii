import { expect, test } from 'bun:test'
import { HY02 } from '../../src/lib/rules/HY02'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY02')

test('/Users/ path in the body fires', () => {
  const raw = cleanSkillRaw({ procedure: 'Data lives in /Users/vuphan/data ready to read.' })
  const f = HY02.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('machine-specific absolute path "/Users/vuphan" will not survive installation')
})

test('/home/ path and Windows Users path fire', () => {
  expect(HY02.check(skillFromRaw(cleanSkillRaw({ procedure: 'See /home/ci/tool for it.' })), CTX)).toHaveLength(1)
  expect(HY02.check(skillFromRaw(cleanSkillRaw({ procedure: 'See C:\\Users\\me for it.' })), CTX)).toHaveLength(1)
})

test('non-md text siblings (scripts) are scanned', () => {
  const sib = { relPath: 'scripts/bench.py', size: 40, text: 'GLOB = "/Users/someone/repo/fixtures"\n' }
  const f = HY02.check(skillFromRaw(cleanSkillRaw(), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('scripts/bench.py')
  expect(f[0].line).toBe(1)
})

test('home-relative tilde paths stay silent', () => {
  const raw = cleanSkillRaw({ procedure: 'Install into ~/.claude/skills/ after approval.' })
  expect(HY02.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})
