# M3a Rule Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 18 remaining single-skill lint rules (FM03, FM05, CT01, CT02, CT04–CT07, ST01, ST03–ST05, HY01–HY06) plus five extraction-hardening fixes, calibrate against the dogfood corpus, and close out docs — completing M3a per `docs/specs/2026-07-08-m3a-rule-catalog-design.md`.

**Architecture:** Each rule is a pure function `(skill, ctx) → RuleFinding[]` in `src/lib/rules/<ID>.ts`, registered in `src/lib/rules/index.ts`. The engine (`src/lib/engine.ts`) stamps severity from `profiles/default.yaml` and honors per-finding `severity` overrides. No engine, CLI, or profile-schema changes — the profile already declares every rule.

**Tech Stack:** TypeScript on Bun, `bun test`, remark/mdast parser (existing), YAML profile (existing).

## Global Constraints

- CLI surface stays exactly M2's: `shakespii lint <path> [--json]`, exit 0/1/2, `--json` schema `version: 1`. No new flags, no output-schema changes, no profile-schema changes.
- **Keystone invariant** (`tests/cli/keystone.test.ts`): the raw-scaffold finding set stays exactly 20 errors (18 PH01, 1 FM04, 1 CT03). Any delta is an adjudicated plan-level change — never silently re-lock, never weaken an assertion.
- **Weld invariant** (`tests/skill/using-shakespii.test.ts`): `skills/using-shakespii` lints to exit 0, `{errors: 0, warnings: 0}`, `findings: []` through every task. If a new rule fires on it, fix the skill content in the same task.
- The dogfood corpus (`~/.claude/skills/`, `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills`) is strictly read-only. Never edit it.
- TDD: write the failing test first, watch it fail, then implement. Verification is always unpiped `bun test` followed by `echo "exit=$?"`; STOP before any git command if exit is nonzero. No commit lands with a red suite.
- Severities come from `profiles/default.yaml` exactly as declared; demotions happen only through the calibration adjudication protocol (Task 18), with documented evidence.
- Finding message strings shown in tasks are exact contract values — copy them verbatim.
- Every doc created or edited under `docs/` is mirrored to `~/.ai-pref-nsync/local-docs/ai-shakespii/` (canonical), byte-identical, verified with `cmp`.
- Precision-first posture for ST/HY heuristics: fire only on the high-confidence patterns specified; accept misses. Do not "improve" a detection pattern beyond its spec.

## Shared interfaces (from existing code — do not modify)

```ts
// src/lib/types.ts (existing)
export interface RuleFinding { message: string; file: string; line: number | null; severity?: 'error' | 'warn' }
export interface Rule { id: string; check(skill: ParsedSkill, ctx: RuleContext): RuleFinding[] }
export interface RuleContext { options: Record<string, unknown>; anatomy: AnatomyTable }
// ParsedSkill: { dir, dirName, raw, frontmatter: {raw, parsed, error}, body: {raw, lineOffset, h1, sections}, files: FileEntry[], dirs: string[] }
// FileEntry: { relPath: string; size: number; text: string | null }
```

Existing helpers reused as-is: `fieldLine(skill, field)` (`src/lib/rules/frontmatter-util.ts`), `matchAnatomySections(skill, entry)` (`src/lib/rules/anatomy.ts`), `normalizeHeading` (`src/lib/parser/sections.ts`), `resolveRule`/`loadProfile` (`src/lib/profile/load.ts`).

Line attribution convention: `skill.body.raw.split('\n')[i]` is SKILL.md line `i + skill.body.lineOffset`. Sibling file line `i` (0-based) is reported as `i + 1`.

---

### Task 1: CRLF normalization at the parser entry (backlog #2)

**Files:**
- Modify: `src/lib/parser/index.ts`
- Modify: `src/lib/parser/inventory.ts`
- Test: `tests/parser/parse-skill.test.ts`

**Interfaces:**
- Consumes: `parseSkill`, `walkInventory` (existing).
- Produces: guarantee that `skill.raw`, `skill.body.raw`, and every `FileEntry.text` contain no `\r` — every later rule and `textOutsideFences` (Task 5) rely on this.

- [ ] **Step 1: Write the failing test** — append to `tests/parser/parse-skill.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

test('CRLF input is normalized to LF for SKILL.md and sibling text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-crlf-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\r\nname: crlf-skill\r\ndescription: "Use when testing CRLF."\r\n---\r\n# crlf-skill\r\n\r\n## Examples\r\n\r\n```\r\nfenced\r\n```\r\n',
  )
  mkdirSync(join(dir, 'references'))
  writeFileSync(join(dir, 'references/note.md'), 'line one\r\nline two\r\n')
  const skill = parseSkill(dir)
  expect(skill.raw).not.toContain('\r')
  expect(skill.body.raw).not.toContain('\r')
  expect(skill.body.sections.map(s => s.normalized)).toEqual(['examples'])
  const note = skill.files.find(f => f.relPath === 'references/note.md')
  expect(note?.text).toBe('line one\nline two\n')
})
```

(Reuse the file's existing imports of `parseSkill` and `join`; only add the `node:fs`/`node:os` imports if not present.)

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/parser/parse-skill.test.ts; echo "exit=$?"`
Expected: FAIL — `skill.raw` contains `\r`, exit=1.

- [ ] **Step 3: Implement.** In `src/lib/parser/index.ts` change the read line inside `parseSkill`:

```ts
const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n')
```

In `src/lib/parser/inventory.ts` change the text branch of `walk`:

```ts
out.push({ relPath, size: st.size, text: isBinary(buf) ? null : buf.toString('utf8').replace(/\r\n/g, '\n') })
```

- [ ] **Step 4: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (keystone and weld unaffected — templates are LF).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser/index.ts src/lib/parser/inventory.ts tests/parser/parse-skill.test.ts
git commit -m "fix(parser): normalize CRLF to LF at the parser entry points"
```

---

### Task 2: Reference-style links in extractLinks + ST02 fragment lock (backlog #1, #3)

**Files:**
- Modify: `src/lib/parser/sections.ts:59-77` (`extractLinks`)
- Test: `tests/parser/sections.test.ts`, `tests/rules/ST02.test.ts`

**Interfaces:**
- Consumes: `extractLinks(body, lineOffset)` (existing signature, unchanged).
- Produces: `extractLinks` now also returns targets of mdast `definition` nodes (`[ref]: path.md`), so ST02 — and later ST04/HY01/HY02 consumers of link data — see reference-style links.

- [ ] **Step 1: Write the failing test** — append to `tests/parser/sections.test.ts`:

```ts
test('extractLinks includes reference-style link definitions', () => {
  const body = 'See [guide][g] for details.\n\n[g]: references/guide.md'
  const links = extractLinks(body, 1)
  expect(links).toContainEqual({ target: 'references/guide.md', line: 3 })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/parser/sections.test.ts; echo "exit=$?"`
Expected: FAIL — definitions are not collected, exit=1.

- [ ] **Step 3: Implement.** In `extractLinks`, extend the node-type check:

```ts
if ((n.type === 'link' || n.type === 'image' || n.type === 'definition') && typeof n.url === 'string') {
```

- [ ] **Step 4: Lock the two ST02 behaviors** — append to `tests/rules/ST02.test.ts` (this file builds skills from fixture dirs via `parseSkill`; follow its existing pattern; the reference-link case can reuse the in-repo fixture style with a temp dir):

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

test('reference-style link to a missing file is a finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-reflink-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: reflink\ndescription: "Use when testing reference links."\n---\n# reflink\n\nSee [guide][g].\n\n[g]: references/missing.md\n',
  )
  const f = ST02.check(parseSkill(dir), { options: {}, anatomy: {} })
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('references/missing.md')
})

test('fragment on an existing sibling resolves (file.md#fragment)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shakespii-frag-'))
  writeFileSync(
    join(dir, 'SKILL.md'),
    '---\nname: frag\ndescription: "Use when testing fragment links."\n---\n# frag\n\nSee [s](guide.md#section).\n',
  )
  writeFileSync(join(dir, 'guide.md'), '# guide\n\n## section\n')
  expect(ST02.check(parseSkill(dir), { options: {}, anatomy: {} })).toHaveLength(0)
})
```

(The fragment test is a lock on existing behavior — `src/lib/rules/ST02.ts:14` already strips fragments — so it should pass immediately; the reference-link test passes only with Step 3 in place.)

- [ ] **Step 5: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. (Template and `using-shakespii` contain no broken reference-style links: `using-shakespii` links only `references/rule-remediations.md`, inline-style, which exists.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/parser/sections.ts tests/parser/sections.test.ts tests/rules/ST02.test.ts
git commit -m "fix(parser): extractLinks collects reference-style definitions; lock ST02 fragment handling"
```

---

### Task 3: CT03 quoted-list over-strip fix + in-memory test helper (backlog #4)

**Files:**
- Create: `tests/helpers/skill.ts`
- Modify: `src/lib/rules/CT03.ts:25-34` (`stripQuotedListItems`)
- Test: `tests/rules/CT03.test.ts`

**Interfaces:**
- Consumes: `splitFrontmatter`, `extractSections`, `loadProfile`, `resolveRule` (existing).
- Produces: `skillFromRaw(raw: string, files?: FileEntry[], dirName?: string): ParsedSkill` and `ctxFor(ruleId: string): RuleContext` in `tests/helpers/skill.ts` — every later rule test builds skills in memory with these instead of new fixture directories.

- [ ] **Step 1: Create the shared test helper** — `tests/helpers/skill.ts`:

```ts
import { join } from 'node:path'
import { splitFrontmatter } from '../../src/lib/parser/frontmatter'
import { extractSections } from '../../src/lib/parser/sections'
import { loadProfile, resolveRule } from '../../src/lib/profile/load'
import type { FileEntry, ParsedSkill, RuleContext } from '../../src/lib/types'

const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

/** Build a ParsedSkill from raw SKILL.md text without touching disk. */
export function skillFromRaw(raw: string, files: FileEntry[] = [], dirName = 'test-skill'): ParsedSkill {
  const normalized = raw.replace(/\r\n/g, '\n')
  const { fm, body, bodyLineOffset } = splitFrontmatter(normalized)
  const { h1, sections } = extractSections(body, bodyLineOffset)
  return {
    dir: `/virtual/${dirName}`,
    dirName,
    raw: normalized,
    frontmatter: fm,
    body: { raw: body, lineOffset: bodyLineOffset, h1, sections },
    files,
    dirs: [],
  }
}

/** Real default-profile options + anatomy for a rule ID. */
export function ctxFor(ruleId: string): RuleContext {
  return { options: resolveRule(profile.rules[ruleId]).options, anatomy: profile.anatomy }
}

/** Frontmatter + H1 + all seven canonical sections; override body parts per test. */
export function cleanSkillRaw(overrides: Partial<Record<string, string>> = {}): string {
  const s = (name: string, fallback: string) => overrides[name] ?? fallback
  return [
    '---',
    `name: test-skill`,
    `description: "${s('description', 'Use when exercising a lint rule in a unit test.')}"`,
    `version: ${s('version', '0.1.0')}`,
    '---',
    '# test-skill',
    '',
    '## Intent', '', s('intent', 'Exercise one rule.'), '',
    '## Inputs', '', s('inputs', 'None.'), '',
    '## Preconditions', '', s('preconditions', 'None.'), '',
    '## Procedure', '', s('procedure', '1. Run the rule.'), '',
    '## Output', '', s('output', 'Findings, or none.'), '',
    '## Examples', '', s('examples', 'Given the input `x`, the expected output is `y`.'), '',
    '## Anti-patterns', '', s('anti-patterns', 'None.'),
    '',
  ].join('\n')
}
```

- [ ] **Step 2: Write the failing test** — append to `tests/rules/CT03.test.ts`:

```ts
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

test('quoted input→output one-liner counts as a worked example', () => {
  const raw = cleanSkillRaw({ examples: '- "report.pdf" → "the extracted tables as CSV"' })
  expect(CT03.check(skillFromRaw(raw), ctxFor('CT03'))).toHaveLength(0)
})

test('bare quoted trigger-phrase list is still stripped', () => {
  const raw = cleanSkillRaw({ examples: '- "use this for PDFs"\n- "extract my tables"' })
  const f = CT03.check(skillFromRaw(raw), ctxFor('CT03'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('no concrete input→output')
})
```

- [ ] **Step 3: Run it, verify the first new test fails**

Run: `bun test tests/rules/CT03.test.ts; echo "exit=$?"`
Expected: FAIL — the quoted pair line is stripped, so no worked example is seen; exit=1. (The trigger-list test passes already; it locks against over-correction.)

- [ ] **Step 4: Implement.** In `src/lib/rules/CT03.ts`, replace the filter body of `stripQuotedListItems` so only single-quoted-phrase items (nothing outside one pair of quotes, no quote chars inside) are stripped:

```ts
function stripQuotedListItems(text: string): string {
  return text
    .split('\n')
    .filter(ln => {
      const m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(ln)
      if (!m) return true
      return !/^["'""''`][^"'""''`]*["'""''`]$/.test(m[1].trim())
    })
    .join('\n')
}
```

- [ ] **Step 5: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (keystone CT03 count unchanged — the scaffold's Examples placeholder path is untouched).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/skill.ts src/lib/rules/CT03.ts tests/rules/CT03.test.ts
git commit -m "fix(ct03): stop stripping quoted input→output examples; add in-memory skill test helper"
```

---

### Task 4: FM04 pronoun-I vs "I/O" fix (backlog #5)

**Files:**
- Modify: `src/lib/rules/FM04.ts:4`
- Test: `tests/rules/FM04.test.ts`

**Interfaces:**
- Consumes: `skillFromRaw`, `ctxFor`, `cleanSkillRaw` from Task 3.
- Produces: nothing new — FM04 behavior change only.

- [ ] **Step 1: Write the failing test** — append to `tests/rules/FM04.test.ts`:

```ts
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

test('"I/O" in the description is not first person', () => {
  const raw = cleanSkillRaw({ description: 'Use when handling file I/O in a build script.' })
  expect(FM04.check(skillFromRaw(raw), ctxFor('FM04'))).toHaveLength(0)
})

test('pronoun I still fires', () => {
  const raw = cleanSkillRaw({ description: 'Use when I need to summarize a thread.' })
  const f = FM04.check(skillFromRaw(raw), ctxFor('FM04'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toContain('third person')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/FM04.test.ts; echo "exit=$?"`
Expected: FAIL — `\bI\b` matches the I in "I/O"; exit=1.

- [ ] **Step 3: Implement.** In `src/lib/rules/FM04.ts` replace the first pattern (pronoun-I must not be adjacent to `/` or word chars):

```ts
const FIRST_PERSON = [/(?<![\w/])I(?![\w/])/, /\b(my|me|we|our|mine|us)\b/i]
```

- [ ] **Step 4: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Keystone FM04 count stays exactly 1: the scaffold description begins with `TODO(shakespii):`, not a trigger phrase, so the trigger finding fires; it contains no first-person pronoun, so the pronoun fix changes nothing there.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/FM04.ts tests/rules/FM04.test.ts
git commit -m "fix(fm04): pronoun-I detection no longer matches I/O"
```

---

### Task 5: `textOutsideFences` shared helper

**Files:**
- Modify: `src/lib/parser/sections.ts` (add one exported function)
- Test: `tests/parser/sections.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `textOutsideFences(body: string): string` — same line count as input; fenced-block lines (``` and ~~~, including the fence lines themselves) become empty strings; inline code spans become same-length runs of spaces. Consumers: ST04, ST05, HY03, HY05, HY06.

- [ ] **Step 1: Write the failing tests** — append to `tests/parser/sections.test.ts`:

```ts
import { textOutsideFences } from '../../src/lib/parser/sections'

test('textOutsideFences blanks fenced blocks, preserves line positions', () => {
  const body = ['before', '```bash', 'git commit -m "x"', '```', 'after'].join('\n')
  const out = textOutsideFences(body).split('\n')
  expect(out).toHaveLength(5)
  expect(out[0]).toBe('before')
  expect(out[1]).toBe('')
  expect(out[2]).toBe('')
  expect(out[3]).toBe('')
  expect(out[4]).toBe('after')
})

test('textOutsideFences handles ~~~ fences and unclosed fences', () => {
  expect(textOutsideFences('~~~\nhidden\n~~~\nvisible').split('\n')[3]).toBe('visible')
  const unclosed = textOutsideFences('```\nhidden forever').split('\n')
  expect(unclosed[1]).toBe('')
})

test('textOutsideFences blanks inline code spans with same-length spaces', () => {
  const out = textOutsideFences('run `git commit` now')
  expect(out).toBe('run              now')
  expect(out.length).toBe('run `git commit` now'.length)
})
```

- [ ] **Step 2: Run them, verify they fail**

Run: `bun test tests/parser/sections.test.ts; echo "exit=$?"`
Expected: FAIL — `textOutsideFences` does not exist; exit=1.

- [ ] **Step 3: Implement** — append to `src/lib/parser/sections.ts`:

```ts
/**
 * Body text with fenced code blocks (``` / ~~~) and inline code spans blanked
 * out, preserving line positions: fence-block lines become empty, inline code
 * becomes same-length spaces. Heuristic ST/HY rules scan this, never raw body.
 */
export function textOutsideFences(body: string): string {
  let fence: { char: string; len: number } | null = null
  return body
    .split('\n')
    .map(ln => {
      const m = /^\s*(`{3,}|~{3,})/.exec(ln)
      if (fence !== null) {
        if (m && m[1][0] === fence.char && m[1].length >= fence.len && ln.trim() === m[1]) fence = null
        return ''
      }
      if (m) {
        fence = { char: m[1][0], len: m[1].length }
        return ''
      }
      return ln.replace(/`[^`\n]+`/g, s => ' '.repeat(s.length))
    })
    .join('\n')
}
```

- [ ] **Step 4: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parser/sections.ts tests/parser/sections.test.ts
git commit -m "feat(parser): textOutsideFences helper with line-position preservation"
```

---

### Task 6: FM03 + FM05 + harden the warn-only fixture

**Files:**
- Create: `src/lib/rules/FM03.ts`, `src/lib/rules/FM05.ts`
- Modify: `src/lib/rules/index.ts`, `tests/fixtures/warn-only/SKILL.md`
- Test: `tests/rules/FM03.test.ts`, `tests/rules/FM05.test.ts`

**Interfaces:**
- Consumes: `fieldLine`, `skillFromRaw`/`ctxFor`/`cleanSkillRaw`.
- Produces: `FM03`, `FM05` rule objects registered in the engine.

**Fixture adjudication (do this first):** `tests/fixtures/warn-only/SKILL.md` currently has no `version` and only an Examples section. FM05 (error) and the CT presence rules (Task 7) would break `tests/cli/lint.test.ts`, which locks it to `{errors: 0, warnings: 1}`. Its purpose is "exactly one warning (FM01 unknown field `author`), exit 0" — harden it once, now, so it keeps that purpose through the full catalog.

- [ ] **Step 1: Harden the fixture.** Replace `tests/fixtures/warn-only/SKILL.md` with:

```markdown
---
name: warn-only
description: "Use when testing warning-only exit code behavior."
version: 0.1.0
author: somebody
---
# warn-only

## Intent

Control fixture: exactly one warning (FM01 unknown field), exit 0.

## Inputs

None — the fixture is static.

## Preconditions

None — no external dependencies.

## Procedure

1. Lint this directory and expect one warning.

## Output

A findings list with a single FM01 warning.

## Examples

Given the input `shakespii lint tests/fixtures/warn-only`, the expected output is one warning and exit code 0.

## Anti-patterns

Adding a second unknown field — the CLI test locks the count at one.
```

Run: `bun test tests/cli/lint.test.ts; echo "exit=$?"` — Expected: PASS, exit=0 (still exactly one FM01 warning).

- [ ] **Step 2: Write the failing FM03 tests** — `tests/rules/FM03.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { FM03 } from '../../src/lib/rules/FM03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const descOf = (n: number) => `Use when ${'x'.repeat(n)}`.slice(0, n)

test('short description: no findings', () => {
  expect(FM03.check(skillFromRaw(cleanSkillRaw()), ctxFor('FM03'))).toHaveLength(0)
})

test('description over 500 chars: one warn-tier finding', () => {
  const f = FM03.check(skillFromRaw(cleanSkillRaw({ description: descOf(501) })), ctxFor('FM03'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('description is 501 chars (warn threshold 500)')
  expect(f[0].severity).toBeUndefined()
  expect(f[0].line).toBe(3)
})

test('description over 1024 chars: one finding with error override, warn subsumed', () => {
  const f = FM03.check(skillFromRaw(cleanSkillRaw({ description: descOf(1025) })), ctxFor('FM03'))
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('description is 1025 chars (hard limit 1024)')
  expect(f[0].severity).toBe('error')
})
```

- [ ] **Step 3: Write the failing FM05 tests** — `tests/rules/FM05.test.ts`:

```ts
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
```

(Note `cleanSkillRaw` interpolates the version value unquoted — pass embedded quotes for string values, bare for the YAML-number case.)

- [ ] **Step 4: Run both, verify they fail**

Run: `bun test tests/rules/FM03.test.ts tests/rules/FM05.test.ts; echo "exit=$?"`
Expected: FAIL — modules do not exist; exit=1.

- [ ] **Step 5: Implement FM03** — `src/lib/rules/FM03.ts`:

```ts
import type { Rule } from '../types'
import { fieldLine } from './frontmatter-util'

export const FM03: Rule = {
  id: 'FM03',
  check(skill, ctx) {
    const desc = skill.frontmatter.parsed?.['description']
    if (typeof desc !== 'string') return []
    const warnChars = Number(ctx.options['warnChars'] ?? 500)
    const maxChars = Number(ctx.options['maxChars'] ?? 1024)
    const line = fieldLine(skill, 'description')
    if (desc.length > maxChars) {
      return [{ message: `description is ${desc.length} chars (hard limit ${maxChars})`, file: 'SKILL.md', line, severity: 'error' }]
    }
    if (desc.length > warnChars) {
      return [{ message: `description is ${desc.length} chars (warn threshold ${warnChars})`, file: 'SKILL.md', line }]
    }
    return []
  },
}
```

- [ ] **Step 6: Implement FM05** — `src/lib/rules/FM05.ts`:

```ts
import type { Rule } from '../types'
import { fieldLine } from './frontmatter-util'

// SemVer 2.0 (semver.org grammar): no leading zeros in numeric identifiers;
// pre-release/build identifiers are dot-separated and non-empty; numeric
// pre-release identifiers have no leading zeros.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export const FM05: Rule = {
  id: 'FM05',
  check(skill) {
    const fm = skill.frontmatter.parsed
    if (fm === null) return [] // FM01 owns malformed/absent frontmatter
    if (!('version' in fm)) {
      return [{ message: 'version field missing — skills are versioned components (semver)', file: 'SKILL.md', line: 1 }]
    }
    const v = fm['version']
    if (typeof v === 'string' && SEMVER.test(v)) return []
    const shown = typeof v === 'string' ? v : String(v)
    return [{ message: `version "${shown}" is not valid semver`, file: 'SKILL.md', line: fieldLine(skill, 'version') }]
  },
}
```

- [ ] **Step 7: Register both** — in `src/lib/rules/index.ts` add imports and extend the array:

```ts
import { FM03 } from './FM03'
import { FM05 } from './FM05'
// ...
export const rules: Rule[] = [FM01, FM02, FM03, FM04, FM05, CT03, ST02, PH01]
```

- [ ] **Step 8: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Keystone unchanged (scaffold: description 110 chars, `version: 0.1.0` real semver). Weld unchanged (`using-shakespii`: ~200-char description, `0.1.0`). `minimal-pass` control unchanged (88-char description, `0.1.0`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/rules/FM03.ts src/lib/rules/FM05.ts src/lib/rules/index.ts tests/rules/FM03.test.ts tests/rules/FM05.test.ts tests/fixtures/warn-only/SKILL.md
git commit -m "feat(rules): FM03 description length and FM05 semver version; harden warn-only fixture for the full catalog"
```

---

### Task 7: CT presence rules (CT01, CT02, CT04–CT07) + profile-consistency lock

**Files:**
- Create: `src/lib/rules/section-presence.ts`, `src/lib/rules/CT01.ts`, `src/lib/rules/CT02.ts`, `src/lib/rules/CT04.ts`, `src/lib/rules/CT05.ts`, `src/lib/rules/CT06.ts`, `src/lib/rules/CT07.ts`
- Modify: `src/lib/rules/index.ts`, `tests/profile/load.test.ts`
- Test: `tests/rules/section-presence.test.ts`

**Interfaces:**
- Consumes: `matchAnatomySections(skill, entry)` (existing), `ctx.anatomy`.
- Produces: `sectionPresenceRule(id, anatomyKey): Rule` factory; six one-line rule modules. CT02 is **presence-only** per the spec's adjudication — link resolvability stays ST02's job; do not add any link checking here.

- [ ] **Step 1: Write the failing tests** — `tests/rules/section-presence.test.ts` (table-driven across all six rules):

```ts
import { expect, test } from 'bun:test'
import { CT01 } from '../../src/lib/rules/CT01'
import { CT02 } from '../../src/lib/rules/CT02'
import { CT04 } from '../../src/lib/rules/CT04'
import { CT05 } from '../../src/lib/rules/CT05'
import { CT06 } from '../../src/lib/rules/CT06'
import { CT07 } from '../../src/lib/rules/CT07'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'
import type { Rule } from '../../src/lib/types'

const CASES: Array<[Rule, string, string, string]> = [
  // rule, canonical heading to remove, canonical name in message, passing alias heading
  [CT01, 'Preconditions', 'Preconditions', 'Requirements'],
  [CT02, 'Output', 'Output', 'Output format'],
  [CT04, 'Inputs', 'Inputs', 'Arguments'],
  [CT05, 'Anti-patterns', 'Anti-patterns', 'Common Mistakes'],
  [CT06, 'Intent', 'Intent', 'Overview'],
  [CT07, 'Procedure', 'Procedure', 'Steps'],
]

for (const [rule, heading, canonical, alias] of CASES) {
  test(`${rule.id}: missing ${canonical} section is one null-line finding`, () => {
    const raw = cleanSkillRaw().replace(`## ${heading}`, '## Unrelated')
    const f = rule.check(skillFromRaw(raw), ctxFor(rule.id))
    expect(f).toHaveLength(1)
    expect(f[0].line).toBeNull()
    expect(f[0].message).toBe(`no ${canonical} section found (canonical "${canonical}" or an alias)`)
  })

  test(`${rule.id}: alias heading "${alias}" satisfies presence`, () => {
    const raw = cleanSkillRaw().replace(`## ${heading}`, `## ${alias}`)
    expect(rule.check(skillFromRaw(raw), ctxFor(rule.id))).toHaveLength(0)
  })

  test(`${rule.id}: no anatomy entry → no findings`, () => {
    const raw = cleanSkillRaw().replace(`## ${heading}`, '## Unrelated')
    expect(rule.check(skillFromRaw(raw), { options: {}, anatomy: {} })).toHaveLength(0)
  })
}

test('canonical full skeleton passes all six', () => {
  const skill = skillFromRaw(cleanSkillRaw())
  for (const [rule] of CASES) expect(rule.check(skill, ctxFor(rule.id))).toHaveLength(0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/section-presence.test.ts; echo "exit=$?"`
Expected: FAIL — modules do not exist; exit=1.

- [ ] **Step 3: Implement the factory** — `src/lib/rules/section-presence.ts`:

```ts
import type { Rule } from '../types'
import { matchAnatomySections } from './anatomy'

/** Presence-only anatomy check (CT01/CT02/CT04–CT07). Content depth is the M4 harness's job. */
export function sectionPresenceRule(id: string, anatomyKey: string): Rule {
  return {
    id,
    check(skill, ctx) {
      const entry = ctx.anatomy[anatomyKey]
      if (!entry) return []
      if (matchAnatomySections(skill, entry).length > 0) return []
      return [{
        message: `no ${entry.canonical} section found (canonical "${entry.canonical}" or an alias)`,
        file: 'SKILL.md',
        line: null,
      }]
    },
  }
}
```

Then the six modules, each exactly (adjusting ID/key):

```ts
// src/lib/rules/CT01.ts
import { sectionPresenceRule } from './section-presence'
export const CT01 = sectionPresenceRule('CT01', 'preconditions')
```

| Module | Call |
|---|---|
| `CT01.ts` | `sectionPresenceRule('CT01', 'preconditions')` |
| `CT02.ts` | `sectionPresenceRule('CT02', 'output')` |
| `CT04.ts` | `sectionPresenceRule('CT04', 'inputs')` |
| `CT05.ts` | `sectionPresenceRule('CT05', 'anti-patterns')` |
| `CT06.ts` | `sectionPresenceRule('CT06', 'intent')` |
| `CT07.ts` | `sectionPresenceRule('CT07', 'procedure')` |

- [ ] **Step 4: Register** — `src/lib/rules/index.ts`:

```ts
export const rules: Rule[] = [FM01, FM02, FM03, FM04, FM05, CT01, CT02, CT03, CT04, CT05, CT06, CT07, ST02, PH01]
```

(with the matching imports added)

- [ ] **Step 5: Extend the profile-consistency test** — append to `tests/profile/load.test.ts`:

```ts
test('anatomy levels mirror the CT-rule severities (spec §8)', () => {
  const p = loadProfile(PROFILE_PATH)
  const pairs: Array<[string, string]> = [
    ['intent', 'CT06'], ['inputs', 'CT04'], ['preconditions', 'CT01'],
    ['procedure', 'CT07'], ['output', 'CT02'], ['examples', 'CT03'], ['anti-patterns', 'CT05'],
  ]
  for (const [key, ruleId] of pairs) {
    expect(resolveRule(p.rules[ruleId]).severity).toBe(p.anatomy[key].level)
  }
})
```

Run: `bun test tests/profile/load.test.ts; echo "exit=$?"` — Expected: PASS immediately (the profile is already consistent); this is a lock, not a RED.

- [ ] **Step 6: Full suite green**

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Keystone unchanged (scaffold carries all seven canonical headings — presence satisfied even with TODO bodies; PH01 owns placeholder content). Weld unchanged (`using-shakespii` has all seven canonical headings). `warn-only` survives via Task 6's hardening.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rules/section-presence.ts src/lib/rules/CT0*.ts src/lib/rules/index.ts tests/rules/section-presence.test.ts tests/profile/load.test.ts
git commit -m "feat(rules): CT01/CT02/CT04-CT07 anatomy presence rules via shared factory"
```

---

### Task 8: ST01 — H1 + size budgets

**Files:**
- Create: `src/lib/rules/ST01.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/ST01.test.ts`

**Interfaces:**
- Consumes: `ctx.options` `{ maxWords: 2000, maxLines: 500, hardMaxWords: 3000 }` (already in the profile); per-finding `severity` override (engine mechanism, already lock-tested).
- Produces: `ST01` registered.

- [ ] **Step 1: Write the failing tests** — `tests/rules/ST01.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { ST01 } from '../../src/lib/rules/ST01'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('ST01')
const fmOnly = '---\nname: test-skill\ndescription: "Use when testing."\nversion: 0.1.0\n---\n'

test('clean skeleton: no findings', () => {
  expect(ST01.check(skillFromRaw(cleanSkillRaw()), CTX)).toHaveLength(0)
})

test('missing H1: one warn finding', () => {
  const f = ST01.check(skillFromRaw(`${fmOnly}\n## Intent\n\nNo title here.\n`), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('no H1 title found')
  expect(f[0].severity).toBeUndefined()
})

test('word budget breach: warn naming the count', () => {
  const f = ST01.check(skillFromRaw(`${fmOnly}# t\n\n${'word '.repeat(2100)}\n`), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toMatch(/^body is \d+ words \(budget 2000\)$/)
  expect(f[0].severity).toBeUndefined()
})

test('hard word breach: single error-override finding subsumes the word warn', () => {
  const f = ST01.check(skillFromRaw(`${fmOnly}# t\n\n${'word '.repeat(3100)}\n`), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toMatch(/^body is \d+ words \(hard limit 3000\)$/)
  expect(f[0].severity).toBe('error')
})

test('line budget breach: warn; co-fires with hard word breach', () => {
  const longLines = Array.from({ length: 520 }, () => 'seven words on this line here now').join('\n')
  const f = ST01.check(skillFromRaw(`${fmOnly}# t\n\n${longLines}\n`), CTX)
  expect(f).toHaveLength(2)
  expect(f.map(x => x.message).join(' | ')).toMatch(/hard limit 3000/)
  expect(f.map(x => x.message).join(' | ')).toMatch(/lines \(budget 500\)/)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/ST01.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/ST01.ts`:

```ts
import type { Rule, RuleFinding } from '../types'

export const ST01: Rule = {
  id: 'ST01',
  check(skill, ctx) {
    const maxWords = Number(ctx.options['maxWords'] ?? 2000)
    const maxLines = Number(ctx.options['maxLines'] ?? 500)
    const hardMaxWords = Number(ctx.options['hardMaxWords'] ?? 3000)
    const out: RuleFinding[] = []
    if (skill.body.h1 === null) {
      out.push({ message: 'no H1 title found', file: 'SKILL.md', line: null })
    }
    const words = skill.body.raw.split(/\s+/).filter(w => w !== '').length
    const lines = skill.body.raw.split('\n').length
    if (words > hardMaxWords) {
      out.push({ message: `body is ${words} words (hard limit ${hardMaxWords})`, file: 'SKILL.md', line: null, severity: 'error' })
    } else if (words > maxWords) {
      out.push({ message: `body is ${words} words (budget ${maxWords})`, file: 'SKILL.md', line: null })
    }
    if (lines > maxLines) {
      out.push({ message: `body is ${lines} lines (budget ${maxLines})`, file: 'SKILL.md', line: null })
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `ST01` to `src/lib/rules/index.ts` (imports + array, before `ST02`).

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (scaffold, `using-shakespii`, `minimal-pass`, `warn-only` all have an H1 and tiny bodies).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/ST01.ts src/lib/rules/index.ts tests/rules/ST01.test.ts
git commit -m "feat(rules): ST01 H1 and body size budgets with hard-limit error override"
```

---

### Task 9: ST03 — long references carry a TOC

**Files:**
- Create: `src/lib/rules/ST03.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/ST03.test.ts`

**Interfaces:**
- Consumes: `ctx.options` `{ tocMinLines: 100 }`; `skill.files` (md siblings = `relPath.endsWith('.md')`, text non-null; inventory already excludes SKILL.md); `normalizeHeading`.
- Produces: `ST03` registered. TOC = within the first 40 lines, either a heading normalizing to `contents`/`table of contents`, or ≥3 internal anchor links `](#…)`.

- [ ] **Step 1: Write the failing tests** — `tests/rules/ST03.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { ST03 } from '../../src/lib/rules/ST03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'
import type { FileEntry } from '../../src/lib/types'

const CTX = ctxFor('ST03')
const md = (relPath: string, text: string): FileEntry => ({ relPath, size: text.length, text })
const longBody = (head: string) => `${head}\n${Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n')}`

test('101+ line md sibling with no TOC: one finding on that file', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [md('references/big.md', longBody('# big'))])
  const f = ST03.check(skill, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/big.md')
  expect(f[0].message).toBe('references/big.md is 121 lines with no table of contents')
})

test('Contents heading in the first 40 lines satisfies the TOC', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [md('references/big.md', longBody('# big\n\n## Contents'))])
  expect(ST03.check(skill, CTX)).toHaveLength(0)
})

test('three anchor links in the first 40 lines satisfy the TOC', () => {
  const head = '# big\n- [a](#a)\n- [b](#b)\n- [c](#c)'
  const skill = skillFromRaw(cleanSkillRaw(), [md('references/big.md', longBody(head))])
  expect(ST03.check(skill, CTX)).toHaveLength(0)
})

test('short sibling and non-md sibling are ignored', () => {
  const skill = skillFromRaw(cleanSkillRaw(), [
    md('references/short.md', '# short\nfine'),
    { relPath: 'scripts/gen.py', size: 10, text: longBody('# not md') },
  ])
  expect(ST03.check(skill, CTX)).toHaveLength(0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/ST03.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/ST03.ts`:

```ts
import { normalizeHeading } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

export const ST03: Rule = {
  id: 'ST03',
  check(skill, ctx) {
    const min = Number(ctx.options['tocMinLines'] ?? 100)
    const out: RuleFinding[] = []
    for (const f of skill.files) {
      if (f.text === null || !f.relPath.endsWith('.md')) continue
      const lines = f.text.split('\n')
      if (lines.length <= min) continue
      const head = lines.slice(0, 40)
      const tocHeading = head.some(ln => {
        const h = /^#{1,6}\s+(.+)$/.exec(ln)
        if (!h) return false
        const n = normalizeHeading(h[1])
        return n === 'contents' || n === 'table of contents'
      })
      const anchors = head.join('\n').match(/\]\(#[^)]*\)/g)?.length ?? 0
      if (!tocHeading && anchors < 3) {
        out.push({ message: `${f.relPath} is ${lines.length} lines with no table of contents`, file: f.relPath, line: null })
      }
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `ST03` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (`using-shakespii`'s only md sibling `references/rule-remediations.md` is 73 lines — under threshold; scaffold README is 8 lines).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/ST03.ts src/lib/rules/index.ts tests/rules/ST03.test.ts
git commit -m "feat(rules): ST03 long reference files require a table of contents"
```

---

### Task 10: ST04 — no `@`-force-load links

**Files:**
- Create: `src/lib/rules/ST04.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/ST04.test.ts`

**Interfaces:**
- Consumes: `textOutsideFences` (Task 5); md siblings.
- Produces: `ST04` registered. Detection: outside code, `@` preceded by start-of-line or whitespace, followed by a path-like token (contains `/` or ends `.md`).

- [ ] **Step 1: Write the failing tests** — `tests/rules/ST04.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { ST04 } from '../../src/lib/rules/ST04'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('ST04')

test('@path in body prose fires with the bare-path suggestion', () => {
  const raw = cleanSkillRaw({ procedure: '1. Read @references/guide.md first.' })
  const f = ST04.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('SKILL.md')
  expect(f[0].message).toBe('@-prefixed link "@references/guide.md" force-loads the file into context — use the bare path instead')
})

test('email addresses and non-path @mentions stay silent', () => {
  const raw = cleanSkillRaw({ procedure: 'Mail vu.phan.se@gmail.com or ping @reviewer.' })
  expect(ST04.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('@path inside a fence or inline code stays silent', () => {
  const raw = cleanSkillRaw({ procedure: '```\n@references/guide.md\n```\nAnd `@references/guide.md` inline.' })
  expect(ST04.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('md siblings are scanned with sibling attribution', () => {
  const sib = { relPath: 'references/notes.md', size: 30, text: 'Read @docs/plan.md now.\n' }
  const f = ST04.check(skillFromRaw(cleanSkillRaw(), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/notes.md')
  expect(f[0].line).toBe(1)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/ST04.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/ST04.ts`:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const AT_PATH = /(?:^|\s)@(\S+)/g

export const ST04: Rule = {
  id: 'ST04',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        for (const m of ln.matchAll(AT_PATH)) {
          const path = m[1]
          if (!path.includes('/') && !path.endsWith('.md')) continue
          out.push({
            message: `@-prefixed link "@${path}" force-loads the file into context — use the bare path instead`,
            file,
            line: i + offset,
          })
        }
      })
    }
    scan('SKILL.md', skill.body.raw, skill.body.lineOffset)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text, 1)
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `ST04` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (no `@`-paths in the scaffold, `using-shakespii`, or fixtures).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/ST04.ts src/lib/rules/index.ts tests/rules/ST04.test.ts
git commit -m "feat(rules): ST04 flags @-prefixed force-load links outside code"
```

---

### Task 11: ST05 — discipline furniture complete

**Files:**
- Create: `src/lib/rules/ST05.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/ST05.test.ts`

**Interfaces:**
- Consumes: `textOutsideFences`.
- Produces: `ST05` registered. Trigger (any, outside code): (a) `iron law` case-insensitive; (b) ALL-CAPS XML-style tag `<[A-Z][A-Z-]+>`; (c) ≥3 standalone ALL-CAPS `MUST`/`NEVER` tokens, combined count. Once triggered, require BOTH a table header row containing a Reality column AND a heading matching `/red flags?/i`. One finding naming whichever half is missing.

- [ ] **Step 1: Write the failing tests** — `tests/rules/ST05.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { ST05 } from '../../src/lib/rules/ST05'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('ST05')
const FURNITURE = '\n| Excuse | Reality |\n|---|---|\n| busy | do it |\n\n## Red Flags\n\n- skipping steps\n'

test('no discipline emphasis: silent even without furniture', () => {
  expect(ST05.check(skillFromRaw(cleanSkillRaw()), CTX)).toHaveLength(0)
})

test('iron law without any furniture: one finding naming both halves', () => {
  const raw = cleanSkillRaw({ procedure: 'This is the iron law of the skill.' })
  const f = ST05.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe(
    'discipline emphasis found without a rationalization table with a Reality column or a Red Flags heading',
  )
})

test('caps tag triggers; complete furniture satisfies', () => {
  const raw = cleanSkillRaw({ procedure: `<HARD-GATE>stop</HARD-GATE>\n${FURNITURE}` })
  expect(ST05.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('three MUST/NEVER tokens combined trigger; table-only names the missing heading', () => {
  const raw = cleanSkillRaw({ procedure: 'You MUST run it. NEVER skip. You MUST commit.\n\n| Thought | Reality |\n|---|---|\n| fine | not fine |' })
  const f = ST05.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('discipline emphasis found without a Red Flags heading')
})

test('Reality only in a data row does not satisfy the table half', () => {
  const table = '| Excuse | Response |\n|---|---|\n| busy | Reality check |'
  const raw = cleanSkillRaw({ procedure: `This is the iron law.\n\n${table}\n\n## Red Flags\n\n- skipping steps` })
  const f = ST05.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('discipline emphasis found without a rationalization table with a Reality column')
})

test('two MUST tokens do not trigger; caps inside fences do not trigger', () => {
  expect(ST05.check(skillFromRaw(cleanSkillRaw({ procedure: 'You MUST run it. You MUST commit.' })), CTX)).toHaveLength(0)
  expect(ST05.check(skillFromRaw(cleanSkillRaw({ procedure: '```\nMUST NEVER MUST <HARD-GATE>\n```' })), CTX)).toHaveLength(0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/ST05.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/ST05.ts`:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule } from '../types'

const PIPE_ROW = /^\s*\|.*\|\s*$/
const DELIMITER_ROW = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/

/** True only when a pipe table's HEADER row (the row directly above the delimiter row) carries a Reality column. */
function hasRealityHeader(text: string): boolean {
  const lines = text.split('\n')
  return lines.some((ln, i) => {
    if (!PIPE_ROW.test(ln)) return false
    if (!/\|[^|\n]*reality[^|\n]*\|/i.test(ln)) return false
    return DELIMITER_ROW.test(lines[i + 1] ?? '')
  })
}

export const ST05: Rule = {
  id: 'ST05',
  check(skill) {
    const text = textOutsideFences(skill.body.raw)
    const triggered =
      /iron law/i.test(text) ||
      /<[A-Z][A-Z-]+>/.test(text) ||
      (text.match(/\b(MUST|NEVER)\b/g)?.length ?? 0) >= 3
    if (!triggered) return []
    const hasRealityTable = hasRealityHeader(text)
    const hasRedFlags = /^#{1,6}\s+.*red flags?/im.test(text)
    const missing: string[] = []
    if (!hasRealityTable) missing.push('a rationalization table with a Reality column')
    if (!hasRedFlags) missing.push('a Red Flags heading')
    if (missing.length === 0) return []
    return [{
      message: `discipline emphasis found without ${missing.join(' or ')}`,
      file: 'SKILL.md',
      line: null,
    }]
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `ST05` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Weld check: `using-shakespii` body has no `iron law`, no ALL-CAPS tag, zero ALL-CAPS MUST/NEVER — untriggered. Scaffold likewise (its `<trigger>` placeholder is lowercase and lives in frontmatter).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/ST05.ts src/lib/rules/index.ts tests/rules/ST05.test.ts
git commit -m "feat(rules): ST05 discipline furniture completeness check"
```

---

### Task 12: HY01 — forward-slash paths only

**Files:**
- Create: `src/lib/rules/HY01.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/HY01.test.ts`

**Interfaces:**
- Consumes: `skill.raw` (SKILL.md **including fences** — offending paths live in commands) and md siblings' raw text.
- Produces: `HY01` registered. Detection per line: drive-letter prefix `/[A-Za-z]:\\/` or a two-hop backslash word chain `/\w+\\{1,2}\w+\\{1,2}\w+/`. Single backslashes (regex escapes like `\s`, `\d`) never flagged.

- [ ] **Step 1: Write the failing tests** — `tests/rules/HY01.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/HY01.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/HY01.ts`:

```ts
import type { Rule, RuleFinding } from '../types'

const DRIVE = /[A-Za-z]:\\/
const BACKSLASH_CHAIN = /\w+\\{1,2}\w+\\{1,2}\w+/

export const HY01: Rule = {
  id: 'HY01',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string): void => {
      text.split('\n').forEach((ln, i) => {
        if (DRIVE.test(ln) || BACKSLASH_CHAIN.test(ln)) {
          out.push({ message: 'backslash path found — skills use forward-slash paths only', file, line: i + 1 })
        }
      })
    }
    scan('SKILL.md', skill.raw)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text)
    }
    return out
  },
}
```

(`skill.raw` is scanned whole — frontmatter included — so line numbers are absolute; fences are deliberately NOT stripped.)

- [ ] **Step 4: Register, full suite green**

Add `HY01` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (no backslash paths anywhere in the scaffold, `using-shakespii`, or fixtures).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/HY01.ts src/lib/rules/index.ts tests/rules/HY01.test.ts
git commit -m "feat(rules): HY01 forward-slash paths only"
```

---

### Task 13: HY02 — no machine-specific absolute paths

**Files:**
- Create: `src/lib/rules/HY02.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/HY02.test.ts`

**Interfaces:**
- Consumes: `skill.raw` + **all** text siblings (scripts included — this closes the M2 calibration coverage gap on compress's Python glob), fences included.
- Produces: `HY02` registered. Detection: `/\/(Users|home)\/[A-Za-z0-9._-]+/` or `/[A-Za-z]:\\Users\\/`.

- [ ] **Step 1: Write the failing tests** — `tests/rules/HY02.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/HY02.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/HY02.ts`:

```ts
import type { Rule, RuleFinding } from '../types'

const ABS = /\/(Users|home)\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\/

export const HY02: Rule = {
  id: 'HY02',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string): void => {
      text.split('\n').forEach((ln, i) => {
        const m = ABS.exec(ln)
        if (m) {
          out.push({ message: `machine-specific absolute path "${m[0].replace(/\\$/, '')}" will not survive installation`, file, line: i + 1 })
        }
      })
    }
    scan('SKILL.md', skill.raw)
    for (const f of skill.files) {
      if (f.text !== null) scan(f.relPath, f.text)
    }
    return out
  },
}
```

(For the Windows form the match is `C:\Users\` — the trailing backslash is trimmed for the message.)

- [ ] **Step 4: Register, full suite green**

Add `HY02` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0 (scaffold evals stub and `using-shakespii` evals carry no absolute user paths; `using-shakespii` uses `~/.claude/skills/...` forms only).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/HY02.ts src/lib/rules/index.ts tests/rules/HY02.test.ts
git commit -m "feat(rules): HY02 machine-specific absolute path detection across all text siblings"
```

---

### Task 14: HY03 — no time-sensitive phrasing

**Files:**
- Create: `src/lib/rules/HY03.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/HY03.test.ts`

**Interfaces:**
- Consumes: `textOutsideFences`; md siblings.
- Produces: `HY03` registered. Phrase list ONLY (word-boundary, case-insensitive): `currently`, `as of`, `recently`, `at the time of writing`. **Bare dates are never flagged.** Exempt inside `<details>` blocks and under any heading matching `/old patterns/i` (until the next heading of the same or shallower depth).

- [ ] **Step 1: Write the failing tests** — `tests/rules/HY03.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { HY03 } from '../../src/lib/rules/HY03'
import { cleanSkillRaw, ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY03')

test('phrase hits fire once per phrase per line, with the phrase named', () => {
  const raw = cleanSkillRaw({ intent: 'Currently the tool ships as of 2026.' })
  const f = HY03.check(skillFromRaw(raw), CTX)
  expect(f).toHaveLength(2)
  expect(f[0].message).toBe('time-sensitive phrase "currently" — describe the steady state or move it under an Old patterns heading')
  expect(f[1].message).toContain('"as of"')
  expect(f[0].line).toBe(10)
})

test('bare dates and provenance markers never fire', () => {
  const raw = cleanSkillRaw({ intent: 'Last reviewed: 2026-07-07. Calibrated 2026-07.' })
  expect(HY03.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})

test('<details> block and Old patterns heading are exempt', () => {
  const details = '<details>\nCurrently broken.\n</details>'
  expect(HY03.check(skillFromRaw(cleanSkillRaw({ intent: details })), CTX)).toHaveLength(0)
  const sib = {
    relPath: 'references/history.md',
    size: 80,
    text: '# history\n\n## Old patterns\n\nRecently we did X.\n\n## Now\n\nRecently again.\n',
  }
  const f = HY03.check(skillFromRaw(cleanSkillRaw(), [sib]), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].file).toBe('references/history.md')
  expect(f[0].line).toBe(9)
})

test('phrases inside fences stay silent', () => {
  const raw = cleanSkillRaw({ intent: '```\ncurrently as of recently\n```' })
  expect(HY03.check(skillFromRaw(raw), CTX)).toHaveLength(0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/HY03.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/HY03.ts`:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const PHRASES = ['currently', 'as of', 'recently', 'at the time of writing']
const PHRASE_RES = PHRASES.map(p => ({ p, re: new RegExp(`\\b${p.replace(/ /g, '\\s+')}\\b`, 'i') }))

function scanDoc(file: string, text: string, offset: number, out: RuleFinding[]): void {
  let details = 0
  let exemptDepth: number | null = null
  textOutsideFences(text).split('\n').forEach((ln, i) => {
    const h = /^(#{1,6})\s+(.+)$/.exec(ln)
    if (h) {
      if (exemptDepth !== null && h[1].length <= exemptDepth) exemptDepth = null
      if (/old patterns/i.test(h[2])) exemptDepth = h[1].length
    }
    details += ln.match(/<details\b/gi)?.length ?? 0
    if (details === 0 && exemptDepth === null) {
      for (const { p, re } of PHRASE_RES) {
        if (re.test(ln)) {
          out.push({
            message: `time-sensitive phrase "${p}" — describe the steady state or move it under an Old patterns heading`,
            file,
            line: i + offset,
          })
        }
      }
    }
    details = Math.max(0, details - (ln.match(/<\/details>/gi)?.length ?? 0))
  })
}

export const HY03: Rule = {
  id: 'HY03',
  check(skill) {
    const out: RuleFinding[] = []
    scanDoc('SKILL.md', skill.body.raw, skill.body.lineOffset, out)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scanDoc(f.relPath, f.text, 1, out)
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `HY03` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Weld check: `using-shakespii`'s `references/rule-remediations.md` carries `Last reviewed: 2026-07-07` — a bare date plus a marker phrase NOT in the list; by construction HY03 stays silent there (spec §5 interplay note).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/HY03.ts src/lib/rules/index.ts tests/rules/HY03.test.ts
git commit -m "feat(rules): HY03 time-sensitive phrasing with details/old-patterns exemptions"
```

---

### Task 15: HY04 — rot-prone embedded stats

**Files:**
- Create: `src/lib/rules/HY04.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/HY04.test.ts`

**Interfaces:**
- Consumes: `textOutsideFences`; md siblings; frontmatter `version`.
- Produces: `HY04` registered. Detection: a magnitude token (`\d+` with optional decimal and `K/M/B` suffix) within 6 tokens of a rot noun (`installs`, `downloads`, `stars`, `users`, `leaderboard`, `rank`, `ranking`), outside code. Whole rule exempt when the skill has a frontmatter `version` AND a `/last reviewed/i` marker in SKILL.md or an md sibling.

- [ ] **Step 1: Write the failing tests** — `tests/rules/HY04.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/HY04.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/HY04.ts`:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const MAGNITUDE = /^\d+(\.\d+)?[KMB]?$/i
const ROT_NOUN = /^(installs?|downloads?|stars?|users?|leaderboards?|ranks?|rankings?)$/i
const strip = (t: string): string => t.replace(/^[([{"'~]+/, '').replace(/[)\]}"'.,:;!?]+$/, '')

export const HY04: Rule = {
  id: 'HY04',
  check(skill) {
    const hasVersion = typeof skill.frontmatter.parsed?.['version'] === 'string'
    const marker = /last reviewed/i
    const hasMarker =
      marker.test(skill.raw) ||
      skill.files.some(f => f.text !== null && f.relPath.endsWith('.md') && marker.test(f.text))
    if (hasVersion && hasMarker) return []
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        const toks = ln.split(/\s+/).filter(Boolean).map(strip)
        toks.forEach((t, j) => {
          if (!MAGNITUDE.test(t) || !/\d/.test(t)) return
          for (let k = Math.max(0, j - 6); k <= Math.min(toks.length - 1, j + 6); k++) {
            if (ROT_NOUN.test(toks[k])) {
              out.push({
                message: `rot-prone stat "${t}" near "${toks[k].toLowerCase()}" — external counts rot; add version + a last-reviewed marker or drop the stat`,
                file,
                line: i + offset,
              })
              return
            }
          }
        })
      })
    }
    scan('SKILL.md', skill.body.raw, skill.body.lineOffset)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text, 1)
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `HY04` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Weld: `using-shakespii` has `version` + `Last reviewed:` in `references/rule-remediations.md` → exempt (and carries no rot stats anyway). Scaffold: no rot nouns.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/HY04.ts src/lib/rules/index.ts tests/rules/HY04.test.ts
git commit -m "feat(rules): HY04 rot-prone embedded stats with version+last-reviewed exemption"
```

---

### Task 16: HY05 — commands belong in fences

**Files:**
- Create: `src/lib/rules/HY05.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/HY05.test.ts`

**Interfaces:**
- Consumes: `textOutsideFences`; md siblings.
- Produces: `HY05` registered. Detection: a line outside code starting — at column 0, after an optional `$ ` — with a known command word (**case-sensitive lowercase**: `git bun npm npx node python python3 pip pip3 brew curl wget make docker cargo go shakespii whisper claude`), whose remainder carries a flag (`-x`/`--flag`) or a path-ish token (contains `/` or a dotted file extension). Anchoring at column 0 keeps list items, numbered steps, and indented code blocks silent by construction; inline backticks are blanked by `textOutsideFences`.

- [ ] **Step 1: Write the failing tests** — `tests/rules/HY05.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/HY05.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/HY05.ts`:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const COMMANDS = [
  'git', 'bun', 'npm', 'npx', 'node', 'python', 'python3', 'pip', 'pip3',
  'brew', 'curl', 'wget', 'make', 'docker', 'cargo', 'go', 'shakespii', 'whisper', 'claude',
]
// Case-sensitive on purpose: sentence-initial prose ("Go to docs/…") stays silent.
const CMD_LINE = new RegExp(`^(?:\\$ )?(${COMMANDS.join('|')})\\b(.*)$`)
const FLAG = /(?:^|\s)-{1,2}[A-Za-z]/
const PATHISH = /\S\/\S|\S+\.[A-Za-z0-9]{1,8}(?:\s|$)/

export const HY05: Rule = {
  id: 'HY05',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        const m = CMD_LINE.exec(ln)
        if (!m) return
        if (!FLAG.test(m[2]) && !PATHISH.test(m[2])) return
        out.push({
          message: `unfenced command line starting with "${m[1]}" — executable commands belong in code fences`,
          file,
          line: i + offset,
        })
      })
    }
    scan('SKILL.md', skill.body.raw, skill.body.lineOffset)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text, 1)
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `HY05` to `src/lib/rules/index.ts`.

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Weld: every command in `using-shakespii` is inline-backticked or mid-line (verified against the current SKILL.md — the spec named this the worst known candidate; if the suite disagrees, fix the skill content in THIS task, keeping substance). Scaffold README's `shakespii lint .` lines are 4-space-indented — not column 0 — silent by construction.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/HY05.ts src/lib/rules/index.ts tests/rules/HY05.test.ts
git commit -m "feat(rules): HY05 unfenced command lines with flag/path argument requirement"
```

---

### Task 17: HY06 — quantitative claims backed

**Files:**
- Create: `src/lib/rules/HY06.ts`
- Modify: `src/lib/rules/index.ts`
- Test: `tests/rules/HY06.test.ts`

**Interfaces:**
- Consumes: `textOutsideFences`; md siblings; inventory (`evals/evals.json` presence).
- Produces: `HY06` registered. Detection: a `%` figure or `Nx` multiplier within 8 tokens of a claim word (`save/savings/saved`, `faster`, `speedup`, `reduc-`, `compress-`, `improvement`, `smaller`), outside code. Whole rule exempt when the skill ships `evals/evals.json`; a line containing `unverified` or `anecdotal` is exempt.

- [ ] **Step 1: Write the failing tests** — `tests/rules/HY06.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { HY06 } from '../../src/lib/rules/HY06'
import { ctxFor, skillFromRaw } from '../helpers/skill'

const CTX = ctxFor('HY06')
const body = (claim: string) =>
  `---\nname: test-skill\ndescription: "Use when testing claims."\nversion: 0.1.0\n---\n# t\n\n## Intent\n\n${claim}\n`

test('percent figure near a claim word fires', () => {
  const f = HY06.check(skillFromRaw(body('Saves ~75% of tokens on long threads.')), CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('quantitative claim "75%" near "saves" — back it with a shipped eval or mark it unverified')
})

test('Nx multiplier near a claim word fires', () => {
  expect(HY06.check(skillFromRaw(body('Roughly 3x faster than the naive loop.')), CTX)).toHaveLength(1)
})

test('figures without a claim word in range stay silent', () => {
  expect(HY06.check(skillFromRaw(body('Set the threshold to 80% in the profile.')), CTX)).toHaveLength(0)
})

test('unverified/anecdotal marker on the line exempts it', () => {
  expect(HY06.check(skillFromRaw(body('Saves ~75% of tokens (unverified).')), CTX)).toHaveLength(0)
  expect(HY06.check(skillFromRaw(body('Anecdotal: 2x speedup on my machine.')), CTX)).toHaveLength(0)
})

test('shipped evals/evals.json exempts the whole skill', () => {
  const evals = { relPath: 'evals/evals.json', size: 2, text: '{}' }
  expect(HY06.check(skillFromRaw(body('Saves ~75% of tokens.'), [evals]), CTX)).toHaveLength(0)
})

test('claims inside fences stay silent', () => {
  expect(HY06.check(skillFromRaw(body('```\nSaves 75% faster\n```')), CTX)).toHaveLength(0)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun test tests/rules/HY06.test.ts; echo "exit=$?"`
Expected: FAIL — module does not exist; exit=1.

- [ ] **Step 3: Implement** — `src/lib/rules/HY06.ts`:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const FIGURE = /^~?\d+(\.\d+)?(%|x)$/i
const CLAIM = /^(saves?|savings|saved|faster|speedups?|reduc\w*|compress\w*|improvements?|smaller)$/i
const strip = (t: string): string => t.replace(/^[([{"'~]+/, '').replace(/[)\]}"'.,:;!?]+$/, '')

export const HY06: Rule = {
  id: 'HY06',
  check(skill) {
    if (skill.files.some(f => f.relPath === 'evals/evals.json')) return []
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        if (/unverified|anecdotal/i.test(ln)) return
        const toks = ln.split(/\s+/).filter(Boolean).map(strip)
        toks.forEach((t, j) => {
          if (!FIGURE.test(t)) return
          for (let k = Math.max(0, j - 8); k <= Math.min(toks.length - 1, j + 8); k++) {
            if (CLAIM.test(toks[k])) {
              out.push({
                message: `quantitative claim "${t.replace(/^~/, '')}" near "${toks[k].toLowerCase()}" — back it with a shipped eval or mark it unverified`,
                file,
                line: i + offset,
              })
              return
            }
          }
        })
      })
    }
    scan('SKILL.md', skill.body.raw, skill.body.lineOffset)
    for (const f of skill.files) {
      if (f.text !== null && f.relPath.endsWith('.md')) scan(f.relPath, f.text, 1)
    }
    return out
  },
}
```

- [ ] **Step 4: Register, full suite green**

Add `HY06` to `src/lib/rules/index.ts`. Final registry order:

```ts
export const rules: Rule[] = [
  FM01, FM02, FM03, FM04, FM05,
  CT01, CT02, CT03, CT04, CT05, CT06, CT07,
  ST01, ST02, ST03, ST04, ST05,
  HY01, HY02, HY03, HY04, HY05, HY06,
  PH01,
]
```

Run: `bun test; echo "exit=$?"`
Expected: all pass, exit=0. Scaffold and `using-shakespii` both ship `evals/evals.json` → exempt by inventory (and carry no figures anyway). All 24 catalog single-skill rules are now live.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/HY06.ts src/lib/rules/index.ts tests/rules/HY06.test.ts
git commit -m "feat(rules): HY06 quantitative claims need evals or an unverified marker"
```

---

### Task 18: Calibration sweep + CALIBRATION-M3.md

**Files:**
- Create: `docs/CALIBRATION-M3.md`
- Create (mirror): `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3.md`
- Possibly modify: rule sources/tests (only for adjudicated `rule-logic bug` rows), `profiles/default.yaml` options (only for adjudicated `miscalibration` rows)

**Interfaces:**
- Consumes: `scripts/calibrate.ts` (existing — runs the real CLI over both corpus roots and prints per-rule count tables).
- Produces: the M3 calibration record under the M2 adjudication protocol.

**The corpus is read-only. Never edit anything under `~/.claude/`.**

- [ ] **Step 1: Write the predictions table FIRST.** Create `docs/CALIBRATION-M3.md` with a `## Predictions (written before the sweep)` section. Seed rows from the spec (§7) — extend with any per-rule expectations you can justify from `docs/AUDIT-2026-07-07.md` and `docs/LINT-RULES.md` evidence, before running anything:

| Rule | Prediction | Evidence |
|---|---|---|
| FM05 | fires on every corpus skill (~27/27) | 0/30 audit compliance; zero corpus skills carry `version` |
| CT01 | fires widely | audit S6 undeclared dependencies |
| ST01 | writing-skills (689 lines / 3,807 words), subagent-driven-development (419 / 3,085) | LINT-RULES evidence row |
| ST04 | writing-skills `@`-links (lines 283–288) | LINT-RULES evidence row |
| ST05 | discipline-furniture skills lacking the table/red-flags pair (e.g. brainstorming's `<HARD-GATE>`) | audit Part 2 |
| HY04 | find-skills ("185K installs") | LINT-RULES evidence row |
| HY06 | caveman (~75%), compress (~65%) | LINT-RULES evidence row |

Commit the predictions before the sweep:

```bash
git add docs/CALIBRATION-M3.md
git commit -m "docs(m3a): calibration predictions written before the sweep"
```

- [ ] **Step 2: Run the sweep, capture verbatim**

Run: `bun scripts/calibrate.ts > /tmp/claude-m3-calibration.txt 2>&1; echo "exit=$?"`
Expected: exit=0; the file contains one `## <root> — N skills` table per corpus root.

- [ ] **Step 3: Paste actual counts verbatim** into `docs/CALIBRATION-M3.md` under `## Actual counts (verbatim)` — the two tables exactly as printed.

- [ ] **Step 4: Adjudicate every deviation.** One row per prediction↔actual mismatch under `## Adjudications`, classified exactly as one of:
  - `rule-logic bug` → fix the rule with a RED fixture first (same TDD cycle as Tasks 6–17), in this task;
  - `miscalibration` → edit the rule's `options` in `profiles/default.yaml` (never the severity), with the row citing the evidence;
  - `audit-miss` → document only.

  Preference order: documentation over churn unless the evidence is unambiguous. **Severity demotions require documented evidence and are a §0 user decision — if a severity looks wrong, record the evidence and leave the severity alone.**

- [ ] **Step 5: Document the CT02 coverage gap.** Add the spec §4 note verbatim in spirit: CT02 is presence-only; prose-path contracts ("obey the format in docs/deliberations/") and external-URL contracts are not statically checked — mirroring the M2 compress adjudication.

- [ ] **Step 6: Full suite green, sync, commit**

Run: `bun test; echo "exit=$?"` — Expected: exit=0.

```bash
mkdir -p ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references
cp docs/CALIBRATION-M3.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3.md
cmp docs/CALIBRATION-M3.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3.md && echo SYNC-OK
git add docs/CALIBRATION-M3.md profiles/default.yaml src tests
git commit -m "docs(m3a): calibration sweep with adjudicated findings"
```

(Expected `SYNC-OK`. Include `profiles/default.yaml`/`src`/`tests` in the add only if adjudications touched them.)

---

### Task 19: Docs close-out — ROADMAP, LINT-RULES, syncs

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/LINT-RULES.md`
- Mirror: `~/.ai-pref-nsync/local-docs/ai-shakespii/` copies of both, plus the spec if it changed

**Interfaces:**
- Consumes: shipped rule semantics from Tasks 6–17; calibration outcomes from Task 18.
- Produces: docs matching shipped reality; M3a closed on the roadmap.

- [ ] **Step 1: Restructure `docs/ROADMAP.md` M3.** Replace the current `## M3 — Full rule catalog` section (lines 32–36) with:

```markdown
## M3a — Single-skill rule catalog

- [x] Remaining 18 single-skill FM/CT/ST/HY rules from LINT-RULES.md (all 24 single-skill rules live)
- [x] Extraction hardening: reference-style links, CRLF normalization, CT03 quoted-example fix, FM04 I/O fix, ST02 fragment lock
- [x] Calibration sweep against the dogfood corpus (docs/CALIBRATION-M3.md)

## M3b — Corpus mode + config

- [ ] Cross-skill rules XS01/XS02 (corpus-context mode: `shakespii lint --corpus ~/.claude/skills`)
- [ ] Config file for profile overrides
```

- [ ] **Step 2: Close the score-model open decision** in the ROADMAP decisions table — replace the `Score model` row with:

```markdown
| Score model | ~~Severity counts only vs 0–100 aggregate score~~ | **Decided 2026-07-08: severity counts only** — no research-backed weighting exists; revisit condition: M6 library ranking (M3a spec §0) |
```

The `Personal-skill migration` row stays open — do not touch it.

- [ ] **Step 3: Update `docs/LINT-RULES.md` to shipped semantics.**
  - Under the CT table, extend the existing matching note with the scope adjudication: CT01/CT02/CT04–CT07 ship as **presence-only** checks at M3a; content-completeness (e.g. CT01's "enumerates every external dependency", CT02's resolvable-contract phrasing) is statically undecidable and graduates to the M4 harness (M3a spec §4).
  - Under the ST/HY tables, add a short `Shipped detection (M3a)` note per narrowed rule, copying the Detection column semantics from spec §5 (ST03 TOC definition, ST04 whitespace-`@`+path, ST05 trigger/furniture pair, HY01/HY02 patterns, HY03 phrase-list-only + exemptions, HY04 window + exemption, HY05 command-word line-start + argument requirement, HY06 figure/claim window + evals exemption).
  - Update the `Seed set for MVP` closing section to note the M3a completion: all 24 single-skill rules live; XS pending M3b; TR pending M4.

- [ ] **Step 4: Verify keystone/weld one last time, full suite**

Run: `bun test; echo "exit=$?"`
Expected: exit=0 — keystone still locks exactly 20 errors (18 PH01, 1 FM04, 1 CT03); weld still `{errors: 0, warnings: 0}`.

- [ ] **Step 5: Dual-location sync + commit.** The canonical copies live at `~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md` and `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md` (verified 2026-07-08):

```bash
cp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
cp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md
cmp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md \
  && cmp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md \
  && echo SYNC-OK
git add docs/ROADMAP.md docs/LINT-RULES.md
git commit -m "docs(m3a): close out M3a — roadmap restructured, score model decided, LINT-RULES at shipped semantics"
```

Expected: `SYNC-OK` before the commit.

---

## Execution notes

- **Task order is dependency-honest and fixed:** 1–5 (hardening + helpers) → 6–7 (FM, CT) → 8–11 (ST) → 12–17 (HY) → 18 (calibration) → 19 (close-out). Do not reorder: ST04/ST05/HY03/HY05/HY06 need Task 5's `textOutsideFences`; Task 6 hardens `warn-only` before CT rules would break it; ST02's reference-link coverage (Task 2) must precede calibration.
- **Per-task discipline:** if any new rule fires on `skills/using-shakespii` or changes the raw-scaffold finding set, handle it inside the same task — fix the skill content, or (for keystone) STOP and treat it as a plan-level adjudication. Do not re-lock keystone numbers to make a suite pass.
- **Exit criteria (spec §10):** 18 rules implemented + fixture-tested + registered; five backlog fixes locked; full suite green unpiped; CALIBRATION-M3.md with predictions/verbatim counts/adjudications; ROADMAP + LINT-RULES updated; all docs dual-location synced (cmp-verified).





