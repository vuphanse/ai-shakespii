import { expect, test } from 'bun:test'
import { HY01 } from '../../src/lib/rules/HY01'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY01')

test('drive-letter path fires, with absolute line attribution', () => {
  const raw = cleanSkillRaw({ procedure: 'Open C:\\tools\\run.exe first.' })
  const f = HY01.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('backslash path found — skills use forward-slash paths only')
  expect(f[0].line).toBe(22)
})

test('backslash chain without a drive letter fires, even inside a fence', () => {
  const raw = cleanSkillRaw({ procedure: '```\ncopy docs\\sub\\file.md dest\n```' })
  expect(HY01.check(skillFromRaw(raw), CTX)).toHaveLength(1)
})

test('single-backslash regex escapes stay silent', () => {
  const raw = cleanSkillRaw({ procedure: 'Match with \\s and \\d and a\\b once.' })
  expect(HY01.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('md sibling scanned; forward-slash paths silent', () => {
  const sib = { relPath: 'references/win.md', size: 20, text: 'Run C:\\x\\y.\n' }
  const f = HY01.check(skillFromRaw(cleanSkillRaw({ procedure: 'Use docs/guide.md.' }), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/win.md')
})

// M3 calibration (docs/CALIBRATION-M3.md): markdown-escaped underscores (`field\_name`, used to
// stop `_..._` italics parsing) chain like a Windows path but aren't one — real corpus false
// positive in superpowers' anthropic-best-practices.md.
test('markdown-escaped underscores stay silent (not a path)', () => {
  const raw = cleanSkillRaw({ procedure: 'Fields: signature\\_date\\_signed, order\\_total.' })
  expect(HY01.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('a real backslash chain still fires when a segment contains an underscore', () => {
  const raw = cleanSkillRaw({ procedure: 'Open docs\\my_folder\\file.md next.' })
  expect(HY01.check(skillFromRaw(raw), CTX)).toHaveLength(1)
})
