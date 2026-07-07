import { expect, test } from 'bun:test'
import { FM05 } from '../../src/lib/rules/FM05'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const noVersion = cleanSkillRaw().replace('version: 0.1.0\n', '')

test('missing version: distinct message, frontmatter-start line', () => {
  const f = FM05.check(skillFromRaw(noVersion), ctxFor('FM05'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('version field missing — skills are versioned components (semver)')
  expect(f[0].line).toBe(1)
})

test('YAML number version is present-but-not-semver', () => {
  const f = FM05.check(skillFromRaw(cleanSkillRaw({ version: '1.0' })), ctxFor('FM05'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('version "1" is not valid semver')
})

test('non-semver string fires with the value named', () => {
  const f = FM05.check(skillFromRaw(cleanSkillRaw({ version: '"v1.2"' })), ctxFor('FM05'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('version "v1.2" is not valid semver')
})

test('semver with pre-release and build passes', () => {
  expect(FM05.check(skillFromRaw(cleanSkillRaw({ version: '"1.2.3-beta.1+build.5"' })), ctxFor('FM05'))).toHaveLength(0)
})

test('invalid pre-release/build identifiers fire (SemVer 2.0 strictness)', () => {
  for (const bad of ['1.2.3-..', '1.2.3-alpha..1', '1.2.3+build..5', '1.2.3-01', '01.2.3']) {
    const f = FM05.check(skillFromRaw(cleanSkillRaw({ version: `"${bad}"` })), ctxFor('FM05'))
    expect(f).toHaveLength(1)
    expect(f[0].message).toBe(`version "${bad}" is not valid semver`)
  }
})

test('malformed frontmatter is FM01 territory: no FM05 finding', () => {
  expect(FM05.check(skillFromRaw('not a skill at all'), ctxFor('FM05'))).toHaveLength(0)
})
