import { expect, test } from 'bun:test'
import { HY05 } from '../../src/lib/rules/HY05'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY05')

test('bare command line with a flag fires', () => {
  const f = HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'git commit -m "done"' })), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('unfenced command line starting with "git" — executable commands belong in code fences')
})

test('"$ " prefix and path-ish arguments fire', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: '$ bun test tests/rules/HY05.test.ts' })), CTX)).toHaveLength(1)
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'python scripts/bench.py' })), CTX)).toHaveLength(1)
})

test('inline code and fenced commands stay silent', () => {
  const raw = cleanSkillRaw({ procedure: 'Run `git commit -m "done"` then:\n\n```\ngit push --force-with-lease\n```' })
  expect(HY05.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('capitalized prose and argument-less mentions stay silent', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'Go to docs/guide.md for details.' })), CTX)).toHaveLength(0)
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'git history proves it works' })), CTX)).toHaveLength(0)
})

test('numbered steps and list items stay silent (not column 0)', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: '1. git commit -m "x"\n- bun test tests/a.test.ts' })), CTX)).toHaveLength(0)
})

test('md siblings are scanned', () => {
  const sib = { relPath: 'references/setup.md', size: 40, text: 'curl -fsSL https://bun.sh/install\n' }
  const f = HY05.check(skillFromRaw(cleanSkillRaw(), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/setup.md')
})

test('compound command after && fires with the segment message', () => {
  const f = HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'cd ~/repo && python3 -m scripts run.py' })), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('unfenced command "python3" after a shell operator — executable commands belong in code fences')
})

test('semicolon-chained command fires', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'cd out; bun test tests/a.test.ts' })), CTX)).toHaveLength(1)
})

test('||-chained command fires', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'test -f lockfile || bun install --frozen-lockfile' })), CTX)).toHaveLength(1)
})

test('cd prose stays silent — cd is not in the command list and a comma is not an operator', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'cd to the repo, then run the tests' })), CTX)).toHaveLength(0)
})

test('command-documenting table rows stay silent — single pipes never split', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: '| git status | shows the working tree |' })), CTX)).toHaveLength(0)
})

test('prose after a semicolon without command shape stays silent', () => {
  expect(HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'Run the loop; git history proves it works' })), CTX)).toHaveLength(0)
})

test('one finding per line even with two command segments', () => {
  const f = HY05.check(skillFromRaw(cleanSkillRaw({ procedure: 'git add --all && git commit -m "x"' })), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('unfenced command line starting with "git" — executable commands belong in code fences')
})
