import { expect, test } from 'bun:test'
import { HY04 } from '../../src/lib/rules/HY04'
import { ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY04')
// No version field — the exemption needs version AND marker, so absence keeps the rule armed.
const statBody = (stat: string) =>
  `---\nname: test-skill\ndescription: "Use when testing rot stats."\n---\n# t\n\n## Intent\n\n${stat}\n`

test('"185K installs" fires with the pair named', () => {
  const f = HY04.check(skillFromRaw(statBody('It has 185K installs on the marketplace.')), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('rot-prone stat "185K" near "installs" — external counts rot; add version + a last-reviewed marker or drop the stat')
})

test('numbers without a rot noun in range stay silent', () => {
  expect(HY04.check(skillFromRaw(statBody('Run the 5 steps in order, then the 3 checks.')), CTX)).toHaveLength(0)
})

test('version + last-reviewed marker (in an md sibling) exempts the whole skill', () => {
  const raw = statBody('It has 185K installs on the marketplace.').replace('---\n# t', 'version: 0.1.0\n---\n# t')
  const sib = { relPath: 'references/notes.md', size: 30, text: 'Last reviewed: 2026-07-07.\n' }
  expect(HY04.check(skillFromRaw(raw, [sib]), CTX)).toHaveLength(0)
})

test('version alone (no marker) does not exempt', () => {
  const raw = statBody('Ranked 3 on the leaderboard today.').replace('---\n# t', 'version: 0.1.0\n---\n# t')
  expect(HY04.check(skillFromRaw(raw), CTX)).toHaveLength(1)
})

test('stats inside fences stay silent', () => {
  expect(HY04.check(skillFromRaw(statBody('```\n185K installs\n```')), CTX)).toHaveLength(0)
})

// M3 calibration (docs/CALIBRATION-M3.md): ordered-list markers ("2.") and "Step N:" headings
// collided with nearby rot nouns on real corpus skills — 9 false positives across 4 skills.
test('leading ordered-list marker near a rot noun stays silent', () => {
  expect(HY04.check(skillFromRaw(statBody('2. Waiting on user input.')), CTX)).toHaveLength(0)
})

test('numbered heading ("### 2. Title") near a rot noun stays silent', () => {
  expect(HY04.check(skillFromRaw(statBody('### 2. Waiting on user input')), CTX)).toHaveLength(0)
})

test('"Step N:" heading number near a rot noun stays silent', () => {
  expect(HY04.check(skillFromRaw(statBody('### Step 5: Present Options to the User')), CTX)).toHaveLength(0)
})

test('a real stat still fires on a line that also carries a list marker', () => {
  const f = HY04.check(skillFromRaw(statBody('1. It has 205K installs today.')), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('"205K" near "installs"')
})
