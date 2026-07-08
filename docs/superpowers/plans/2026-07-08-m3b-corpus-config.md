# M3b — Corpus Mode + Config Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `shakespii lint --corpus <root>` (full per-skill lint + cross-skill rules XS01/XS02), `--config <file>` profile overrides, and the two M3a-parked rule refinements (ST04 verify-then-decide, HY05 segment-scan), per the approved spec `docs/specs/2026-07-08-m3b-corpus-config-design.md`.

**Architecture:** Approach A (spec §0): a thin corpus loop (`src/lib/corpus/`) reuses the existing parser and 24-rule engine per skill unchanged, then runs XS rules from a separate corpus registry (`src/lib/rules/corpus/`) with their own `(skills[], ctx)` signature. The CLI branches on `--corpus`; the single-skill code path stays byte-identical. Config overrides are a partial profile validated fail-loud and merged over `profiles/default.yaml` only when `--config` is passed.

**Tech Stack:** TypeScript on Bun, `bun test`, `yaml` package (already a dependency), picocolors (already a dependency).

## Global Constraints

Every task's requirements implicitly include this section.

1. **Dogfood corpus is read-only.** Never modify anything under `~/.claude/skills/` or `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/`. Calibration reads only.
2. **Keystone invariant:** `tests/cli/keystone.test.ts` must keep passing — the raw scaffold lints to exactly 20 errors (18 PH01, 1 FM04, 1 CT03). Any delta requires adjudication; never silently re-lock.
3. **Weld invariant:** `tests/skill/using-shakespii.test.ts` must keep passing — `skills/using-shakespii` lints to `{errors: 0, warnings: 0}` through the real CLI.
4. **Frozen single-skill surface:** `shakespii lint <path> [--json]` behavior and the single-skill JSON v1 report (`{version: 1, skill: {dir, name}, profile, summary, findings}`) stay byte-identical when the new flags are not passed. Exit-code semantics stay 0/1/2 (0 = no errors, 1 = error findings, 2 = lint could not run).
5. **`profiles/default.yaml` is untouched** — no severity, option, or alias changes in this milestone. XS01/XS02 entries already exist there (`XS01: { severity: warn, options: { minLines: 15, minSkills: 2 } }`, `XS02: { severity: warn, options: { similarity: 0.8 } }`).
6. **TDD:** every code task writes the failing test first, runs it RED, implements, runs GREEN, then runs the full suite. Run `bun test` directly — NEVER piped (`bun test 2>&1 | tail` masks the exit code). Expect `0 fail` before every commit.
7. **Docs are dual-location:** canonical copies live under `~/.ai-pref-nsync/local-docs/ai-shakespii/` (subdirs `specs/`, `plans/`, `knowledge-references/`); repo `docs/` is the synced mirror. Every doc edit updates both, verified with `cmp` (expect no output, exit 0).
8. **Commit per task** with the message given in that task. Work directly on `main` (this repository's convention — operator-sanctioned via the workflow mount).
9. **Registry order** for corpus rules is `[XS01, XS02]`.
10. Exact strings matter: rule messages, CLI error strings, and JSON field names in this plan are contractual — copy them verbatim.

**Model-allocation guidance for the executing controller** (plan-completeness based): Tasks 2, 3, 4, 5, 6, 7, 8, 10, 12 contain complete code and are transcription+testing (cheapest tier). Tasks 1, 9, 11, 14 are complete but touch multiple files or rewrite an existing file (standard tier). Tasks 13, 15, 16, 17, 18 need judgment (experiment interpretation, calibration adjudication, doc coherence — standard tier or better; reviewers at least one tier above throughout).

## File Structure

New files:

- `src/lib/rules/corpus/normalize.ts` — shared body-line normalization (`bodyLines`)
- `src/lib/rules/corpus/XS01.ts`, `src/lib/rules/corpus/XS02.ts` — corpus rules
- `src/lib/rules/corpus/index.ts` — corpus registry `[XS01, XS02]`
- `src/lib/corpus/discover.ts` — corpus-root discovery
- `src/lib/corpus/index.ts` — `lintCorpus` composition
- `src/lib/profile/config.ts` — `--config` override validation + merge
- `src/cli/format/corpus-json.ts`, `src/cli/format/corpus-pretty.ts` — corpus output
- `tests/…` — mirrors of each (see tasks), plus fixture mini-corpora under `tests/fixtures/corpus/` and config fixtures under `tests/fixtures/config/`
- `docs/CALIBRATION-M3B.md` — experiment record, predictions, sweep, adjudications

Modified files:

- `src/lib/types.ts` (corpus types + `RuleSeverity`), `src/lib/engine.ts` (corpus pass + `off`), `src/lib/profile/load.ts` (`resolveRule` return type only), `src/cli/lint.ts` (flags), `src/cli/index.ts` (usage line), `src/lib/rules/HY05.ts` (segment-scan), possibly `src/lib/rules/ST04.ts` (experiment-gated), `tests/helpers/skill.ts` (`corpusFromRaws`), `scripts/calibrate.ts` (corpus-mode refactor), `skills/using-shakespii/` (SKILL.md + references), `docs/LINT-RULES.md`, `docs/ROADMAP.md`, `README.md`.

---

### Task 1: Corpus types, body-line normalization, corpus test helper

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/rules/corpus/normalize.ts`
- Modify: `tests/helpers/skill.ts`
- Test: `tests/rules/corpus/normalize.test.ts`

**Interfaces:**
- Consumes: `ParsedSkill` (`src/lib/types.ts`), `skillFromRaw` (`tests/helpers/skill.ts`)
- Produces: `bodyLines(skill: ParsedSkill): BodyLine[]` where `BodyLine = { text: string; line: number }` (trailing whitespace stripped, blank lines dropped, `line` is 1-indexed original file coordinates); types `CorpusSite`, `CorpusRuleFinding`, `CorpusFinding`, `CorpusRule`; test helper `corpusFromRaws(raws: string[], dirNames?: string[]): ParsedSkill[]`

- [ ] **Step 1: Write the failing test**

Create `tests/rules/corpus/normalize.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { bodyLines } from '../../../src/lib/rules/corpus/normalize'
import { skillFromRaw } from '../../helpers/skill'

const RAW = [
  '---',
  'name: test-skill',
  'description: "Use when testing normalization."',
  '---',
  '# test-skill',
  '',
  'alpha   ',
  '',
  '',
  'beta',
].join('\n')

test('strips trailing whitespace and drops blank lines, keeping original line numbers', () => {
  const lines = bodyLines(skillFromRaw(RAW))
  expect(lines).toEqual([
    { text: '# test-skill', line: 5 },
    { text: 'alpha', line: 7 },
    { text: 'beta', line: 10 },
  ])
})

test('frontmatter is excluded by construction', () => {
  const lines = bodyLines(skillFromRaw(RAW))
  expect(lines.some(l => l.text.startsWith('name:'))).toBe(false)
})

test('whitespace-only lines count as blank', () => {
  const raw = '---\nname: t\ndescription: "Use when testing."\n---\nx\n   \ny\n'
  const texts = bodyLines(skillFromRaw(raw)).map(l => l.text)
  expect(texts).toEqual(['x', 'y'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/rules/corpus/normalize.test.ts`
Expected: FAIL — cannot resolve `src/lib/rules/corpus/normalize`.

- [ ] **Step 3: Add corpus types to `src/lib/types.ts`**

Append at the end of `src/lib/types.ts`:

```ts
export interface CorpusSite {
  skill: string
  file: 'SKILL.md'
  startLine: number
  endLine: number
}

export interface CorpusRuleFinding {
  message: string
  sites: CorpusSite[]
}

export interface CorpusFinding {
  ruleId: string
  severity: Severity
  message: string
  sites: CorpusSite[]
}

export interface CorpusRule {
  id: string
  check(skills: ParsedSkill[], ctx: RuleContext): CorpusRuleFinding[]
}
```

- [ ] **Step 4: Create `src/lib/rules/corpus/normalize.ts`**

```ts
import type { ParsedSkill } from '../../types'

export interface BodyLine {
  text: string
  line: number
}

/**
 * SKILL.md body as (text, originalLine) pairs: trailing whitespace stripped,
 * blank lines dropped. Blank lines neither break duplicate runs nor count
 * toward thresholds; line numbers map back to the original file (spec §2).
 */
export function bodyLines(skill: ParsedSkill): BodyLine[] {
  const out: BodyLine[] = []
  skill.body.raw.split('\n').forEach((ln, i) => {
    const text = ln.replace(/\s+$/, '')
    if (text === '') return
    out.push({ text, line: i + skill.body.lineOffset })
  })
  return out
}
```

- [ ] **Step 5: Add `corpusFromRaws` to `tests/helpers/skill.ts`**

Append at the end of the file:

```ts
/** Build a ParsedSkill[] corpus from raw SKILL.md texts without touching disk. */
export function corpusFromRaws(raws: string[], dirNames?: string[]): ParsedSkill[] {
  return raws.map((raw, i) => skillFromRaw(raw, [], dirNames?.[i] ?? `corpus-skill-${i + 1}`))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test tests/rules/corpus/normalize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/types.ts src/lib/rules/corpus/normalize.ts tests/helpers/skill.ts tests/rules/corpus/normalize.test.ts
git commit -m "feat(corpus): body-line normalization and corpus rule types"
```

---

### Task 2: XS01 — duplicate-block detection

**Files:**
- Create: `src/lib/rules/corpus/XS01.ts`
- Test: `tests/rules/corpus/XS01.test.ts`

**Interfaces:**
- Consumes: `bodyLines` (Task 1), `CorpusRule`/`CorpusRuleFinding`/`CorpusSite` types (Task 1), options `minLines`/`minSkills` from the profile
- Produces: `XS01: CorpusRule` with message `` `${n}-line block shared by ${k} skills — extract to a shared reference` ``; one finding per duplicated block, sites sorted by skill name then startLine

- [ ] **Step 1: Write the failing test**

Create `tests/rules/corpus/XS01.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { XS01 } from '../../../src/lib/rules/corpus/XS01'
import { cleanSkillRaw, corpusFromRaws, ctxFor } from '../../helpers/skill'
import type { RuleContext } from '../../../src/lib/types'

const CTX = ctxFor('XS01') // { minLines: 15, minSkills: 2 }
const smallCtx = (minLines: number, minSkills: number): RuleContext => ({
  options: { minLines, minSkills },
  anatomy: CTX.anatomy,
})

const block = (n: number): string =>
  Array.from({ length: n }, (_, i) => `Shared corpus preamble sentence number ${'x'.repeat(i + 1)}.`).join('\n')

// Every section differs per skill except `procedure`, so the maximal identical
// run is exactly: "## Procedure" + the shared block + "## Output" (block + 2).
const withProcedure = (tag: string, procedure: string): string =>
  cleanSkillRaw({
    intent: `${tag} intent prose.`,
    inputs: `${tag} inputs prose.`,
    preconditions: `${tag} preconditions prose.`,
    procedure,
    output: `${tag} output prose.`,
    examples: `Given the input \`${tag}\`, the expected output is \`${tag}-out\`.`,
    'anti-patterns': `${tag} anti-pattern prose.`,
  })

test('a shared 16-line block fires once with two sites (run = block + flanking headings = 18)', () => {
  const shared = block(16)
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('18-line block shared by 2 skills — extract to a shared reference')
  expect(f[0].sites.map(s => s.skill)).toEqual(['dup-a', 'dup-b'])
  expect(f[0].sites.every(s => s.file === 'SKILL.md')).toBe(true)
})

test('a shared 12-line block stays silent at minLines 15 (run = 14)', () => {
  const shared = block(12)
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  expect(XS01.check(skills, CTX)).toHaveLength(0)
})

test('a shared 13-line block fires exactly at the boundary (run = 15)', () => {
  const shared = block(13)
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('15-line block shared by 2 skills — extract to a shared reference')
})

test('three sharers merge into one finding with three sites', () => {
  const shared = block(16)
  const skills = corpusFromRaws(
    [withProcedure('Alpha', shared), withProcedure('Beta', shared), withProcedure('Gamma', shared)],
    ['dup-a', 'dup-b', 'dup-c'],
  )
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('18-line block shared by 3 skills — extract to a shared reference')
  expect(f[0].sites.map(s => s.skill)).toEqual(['dup-a', 'dup-b', 'dup-c'])
})

test('duplication within a single skill does not count', () => {
  const shared = block(16)
  const skills = corpusFromRaws(
    [
      withProcedure('Alpha', `${shared}\n\nBridge prose between copies.\n\n${shared}`),
      withProcedure('Beta', 'Nothing shared here at all.'),
    ],
    ['dup-a', 'dup-b'],
  )
  expect(XS01.check(skills, CTX)).toHaveLength(0)
})

test('blank lines inside one copy neither break nor shrink the run', () => {
  const shared = block(16)
  const lines = shared.split('\n')
  const withBlanks = [...lines.slice(0, 8), '', ...lines.slice(8)].join('\n')
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', withBlanks)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('18-line block shared by 2 skills — extract to a shared reference')
})

test('minSkills 3 suppresses a two-skill duplicate', () => {
  const shared = block(6) // run = 8
  const skills = corpusFromRaws([withProcedure('Alpha', shared), withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  expect(XS01.check(skills, smallCtx(5, 3))).toHaveLength(0)
  expect(XS01.check(skills, smallCtx(5, 2))).toHaveLength(1)
})

test('reported line ranges are original file coordinates', () => {
  const shared = block(16)
  const raw = withProcedure('Alpha', shared)
  const procedureHeadingLine = raw.split('\n').findIndex(l => l === '## Procedure') + 1
  const skills = corpusFromRaws([raw, withProcedure('Beta', shared)], ['dup-a', 'dup-b'])
  const f = XS01.check(skills, CTX)
  expect(f[0].sites[0].startLine).toBe(procedureHeadingLine)
  expect(f[0].sites[0].endLine).toBeGreaterThan(procedureHeadingLine)
})
```

Run arithmetic, for the record: with every non-procedure section overridden per skill, the only identical consecutive non-blank lines are `## Procedure`, the shared block, and `## Output` (the next line — that skill's output prose — differs). The `# test-skill` H1 and `## Intent` pair form a 2-line run; every other heading is an isolated 1-line run. So block(16) → 18-line finding, block(13) → 15 (fires at boundary), block(12) → 14 (silent).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/rules/corpus/XS01.test.ts`
Expected: FAIL — cannot resolve `src/lib/rules/corpus/XS01`.

- [ ] **Step 3: Create `src/lib/rules/corpus/XS01.ts`**

```ts
import type { CorpusRule, CorpusRuleFinding, CorpusSite } from '../../types'
import { bodyLines } from './normalize'

const bySkillThenLine = (x: CorpusSite, y: CorpusSite): number =>
  x.skill < y.skill ? -1 : x.skill > y.skill ? 1 : x.startLine - y.startLine

export const XS01: CorpusRule = {
  id: 'XS01',
  check(skills, ctx) {
    const minLines = ctx.options['minLines'] as number
    const minSkills = ctx.options['minSkills'] as number
    const seqs = skills.map(s => ({ name: s.dirName, lines: bodyLines(s) }))

    // blockKey (joined normalized text) -> siteKey -> site
    const blocks = new Map<string, Map<string, CorpusSite>>()
    for (let i = 0; i < seqs.length; i++) {
      for (let j = i + 1; j < seqs.length; j++) {
        const a = seqs[i].lines
        const b = seqs[j].lines
        for (let ai = 0; ai < a.length; ai++) {
          for (let bi = 0; bi < b.length; bi++) {
            if (a[ai].text !== b[bi].text) continue
            // only start at run starts — interior anchors are covered by extension
            if (ai > 0 && bi > 0 && a[ai - 1].text === b[bi - 1].text) continue
            let len = 0
            while (ai + len < a.length && bi + len < b.length && a[ai + len].text === b[bi + len].text) len++
            if (len < minLines) continue
            const key = a.slice(ai, ai + len).map(l => l.text).join('\n')
            const sites = blocks.get(key) ?? new Map<string, CorpusSite>()
            for (const [seq, at] of [
              [seqs[i], ai],
              [seqs[j], bi],
            ] as const) {
              const site: CorpusSite = {
                skill: seq.name,
                file: 'SKILL.md',
                startLine: seq.lines[at].line,
                endLine: seq.lines[at + len - 1].line,
              }
              sites.set(`${site.skill}:${site.startLine}`, site)
            }
            blocks.set(key, sites)
          }
        }
      }
    }

    const keys = [...blocks.keys()]
    const out: CorpusRuleFinding[] = []
    for (const key of keys) {
      const sites = [...blocks.get(key)!.values()]
      const skillSet = new Set(sites.map(s => s.skill))
      if (skillSet.size < minSkills) continue
      // containment: a shorter block inside a longer reported block covering
      // the same skills is the same duplication, not a second finding
      const contained = keys.some(other => {
        if (other === key || other.length <= key.length || !other.includes(key)) return false
        const otherSkills = new Set([...blocks.get(other)!.values()].map(s => s.skill))
        if (otherSkills.size < minSkills) return false
        return [...skillSet].every(s => otherSkills.has(s))
      })
      if (contained) continue
      out.push({
        message: `${key.split('\n').length}-line block shared by ${skillSet.size} skills — extract to a shared reference`,
        sites: sites.sort(bySkillThenLine),
      })
    }
    return out.sort((x, y) => bySkillThenLine(x.sites[0], y.sites[0]))
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/rules/corpus/XS01.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/rules/corpus/XS01.ts tests/rules/corpus/XS01.test.ts
git commit -m "feat(corpus): XS01 duplicate-block detection"
```

---

### Task 3: XS02 — near-clone detection

**Files:**
- Create: `src/lib/rules/corpus/XS02.ts`
- Test: `tests/rules/corpus/XS02.test.ts`

**Interfaces:**
- Consumes: `bodyLines` (Task 1), corpus types (Task 1), option `similarity` from the profile
- Produces: `XS02: CorpusRule` with message `` `near-clone cluster of ${k} skills (pairwise similarity ≥ ${threshold}) — consider parameterizing into one skill` ``; union-find clustering, one finding per cluster, site per member spanning that skill's full body range

- [ ] **Step 1: Write the failing test**

Create `tests/rules/corpus/XS02.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { XS02 } from '../../../src/lib/rules/corpus/XS02'
import { cleanSkillRaw, corpusFromRaws, ctxFor } from '../../helpers/skill'

const CTX = ctxFor('XS02') // { similarity: 0.8 }

test('two skills with identical bodies form one cluster of two', () => {
  const raw = cleanSkillRaw()
  const skills = corpusFromRaws([raw, raw], ['clone-a', 'clone-b'])
  const f = XS02.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('near-clone cluster of 2 skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill')
  expect(f[0].sites.map(s => s.skill)).toEqual(['clone-a', 'clone-b'])
})

test('three identical bodies form ONE cluster of three, not three pair findings', () => {
  const raw = cleanSkillRaw()
  const skills = corpusFromRaws([raw, raw, raw], ['clone-a', 'clone-b', 'clone-c'])
  const f = XS02.check(skills, CTX)
  expect(f).toHaveLength(1)
  expect(f[0].message).toBe('near-clone cluster of 3 skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill')
  expect(f[0].sites.map(s => s.skill)).toEqual(['clone-a', 'clone-b', 'clone-c'])
})

test('dissimilar bodies stay silent', () => {
  const a = cleanSkillRaw({
    intent: 'Alpha intent prose.',
    inputs: 'Alpha inputs prose.',
    preconditions: 'Alpha preconditions prose.',
    procedure: 'Alpha procedure line one.\nAlpha procedure line two.\nAlpha procedure line three.',
    output: 'Alpha output prose.',
    examples: 'Given the input `a`, the expected output is `alpha`.',
    'anti-patterns': 'Alpha anti-pattern prose.',
  })
  const b = cleanSkillRaw({
    intent: 'Beta intent prose.',
    inputs: 'Beta inputs prose.',
    preconditions: 'Beta preconditions prose.',
    procedure: 'Beta procedure line one.\nBeta procedure line two.\nBeta procedure line three.',
    output: 'Beta output prose.',
    examples: 'Given the input `b`, the expected output is `beta`.',
    'anti-patterns': 'Beta anti-pattern prose.',
  })
  expect(XS02.check(corpusFromRaws([a, b], ['diff-a', 'diff-b']), CTX)).toHaveLength(0)
})

test('two separate clone groups produce two findings', () => {
  const raw1 = cleanSkillRaw({ procedure: 'Group one procedure prose, deliberately unlike group two.' })
  const raw2 = cleanSkillRaw({
    intent: 'Group two intent prose.',
    inputs: 'Group two inputs prose.',
    preconditions: 'Group two preconditions prose.',
    procedure: 'Group two procedure line one.\nGroup two procedure line two.',
    output: 'Group two output prose.',
    examples: 'Given the input `two`, the expected output is `group-two`.',
    'anti-patterns': 'Group two anti-pattern prose.',
  })
  const skills = corpusFromRaws([raw1, raw1, raw2, raw2], ['g1-a', 'g1-b', 'g2-a', 'g2-b'])
  const f = XS02.check(skills, CTX)
  expect(f).toHaveLength(2)
  expect(f[0].sites.map(s => s.skill)).toEqual(['g1-a', 'g1-b'])
  expect(f[1].sites.map(s => s.skill)).toEqual(['g2-a', 'g2-b'])
})

test('within-skill duplicate lines collapse (set semantics)', () => {
  const line = 'Repeated line of prose for the set-semantics check.'
  const a = cleanSkillRaw({ procedure: [line, line, line, line].join('\n') })
  const b = cleanSkillRaw({ procedure: line })
  const f = XS02.check(corpusFromRaws([a, b], ['set-a', 'set-b']), CTX)
  expect(f).toHaveLength(1)
})

test('sites span the full body range', () => {
  const raw = cleanSkillRaw()
  const skills = corpusFromRaws([raw, raw], ['clone-a', 'clone-b'])
  const f = XS02.check(skills, CTX)
  const body = skills[0].body
  const firstNonBlank = body.raw.split('\n').findIndex(l => l.trim() !== '') + body.lineOffset
  expect(f[0].sites[0].startLine).toBe(firstNonBlank)
  expect(f[0].sites[0].endLine).toBeGreaterThan(firstNonBlank)
})
```

Note on the two-cluster test: `raw2` overrides every section, so the two groups share only the seven heading lines; each group's skills have ~10 further lines. Jaccard between groups ≈ 7/(7+20) « 0.8 — comfortably silent across groups, identical (1.0) within each.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/rules/corpus/XS02.test.ts`
Expected: FAIL — cannot resolve `src/lib/rules/corpus/XS02`.

- [ ] **Step 3: Create `src/lib/rules/corpus/XS02.ts`**

```ts
import type { CorpusRule, CorpusRuleFinding, CorpusSite } from '../../types'
import { bodyLines } from './normalize'

export const XS02: CorpusRule = {
  id: 'XS02',
  check(skills, ctx) {
    const threshold = ctx.options['similarity'] as number
    const entries = skills.map(s => {
      const lines = bodyLines(s)
      return {
        name: s.dirName,
        set: new Set(lines.map(l => l.text)),
        startLine: lines[0]?.line ?? 1,
        endLine: lines[lines.length - 1]?.line ?? 1,
      }
    })

    const parent = entries.map((_, i) => i)
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i].set
        const b = entries[j].set
        if (a.size === 0 || b.size === 0) continue
        let inter = 0
        for (const t of a) if (b.has(t)) inter++
        const union = a.size + b.size - inter
        if (union > 0 && inter / union >= threshold) parent[find(i)] = find(j)
      }
    }

    const clusters = new Map<number, number[]>()
    entries.forEach((_, i) => {
      const root = find(i)
      clusters.set(root, [...(clusters.get(root) ?? []), i])
    })

    const out: CorpusRuleFinding[] = []
    for (const members of clusters.values()) {
      if (members.length < 2) continue
      const sites: CorpusSite[] = members
        .map(i => ({
          skill: entries[i].name,
          file: 'SKILL.md' as const,
          startLine: entries[i].startLine,
          endLine: entries[i].endLine,
        }))
        .sort((x, y) => (x.skill < y.skill ? -1 : x.skill > y.skill ? 1 : 0))
      out.push({
        message: `near-clone cluster of ${members.length} skills (pairwise similarity ≥ ${threshold}) — consider parameterizing into one skill`,
        sites,
      })
    }
    return out.sort((x, y) => (x.sites[0].skill < y.sites[0].skill ? -1 : x.sites[0].skill > y.sites[0].skill ? 1 : 0))
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/rules/corpus/XS02.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/rules/corpus/XS02.ts tests/rules/corpus/XS02.test.ts
git commit -m "feat(corpus): XS02 near-clone detection"
```

---
### Task 4: Corpus registry, `runCorpusRules`, and `off` severity support

**Files:**
- Create: `src/lib/rules/corpus/index.ts`
- Modify: `src/lib/types.ts` (RuleSetting/RuleSeverity), `src/lib/profile/load.ts` (resolveRule return type), `src/lib/engine.ts`
- Test: `tests/engine/corpus-engine.test.ts`

**Interfaces:**
- Consumes: `XS01` (Task 2), `XS02` (Task 3), `resolveRule` (`src/lib/profile/load.ts`)
- Produces: `corpusRules: CorpusRule[]` (order `[XS01, XS02]`); `runCorpusRules(skills: ParsedSkill[], profile: Profile): CorpusFinding[]` and `runCorpusRulesWith(registry, skills, profile)`; `RuleSeverity = Severity | 'off'`; both engines skip a rule whose resolved severity is `'off'`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/corpus-engine.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { runCorpusRules, runRulesWith } from '../../src/lib/engine'
import { loadProfile } from '../../src/lib/profile/load'
import { rules } from '../../src/lib/rules'
import { corpusRules } from '../../src/lib/rules/corpus'
import { cleanSkillRaw, corpusFromRaws, skillFromRaw } from '../helpers/skill'

const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

test('corpus registry is [XS01, XS02]', () => {
  expect(corpusRules.map(r => r.id)).toEqual(['XS01', 'XS02'])
})

test('runCorpusRules stamps profile severity on corpus findings', () => {
  const raw = cleanSkillRaw()
  const findings = runCorpusRules(corpusFromRaws([raw, raw], ['a-clone', 'b-clone']), profile)
  expect(findings.length).toBeGreaterThan(0)
  for (const f of findings) expect(f.severity).toBe('warn')
  expect(findings.map(f => f.ruleId)).toContain('XS02')
})

test('off disables a corpus rule', () => {
  const raw = cleanSkillRaw()
  const off = { ...profile, rules: { ...profile.rules, XS01: 'off' as const, XS02: 'off' as const } }
  expect(runCorpusRules(corpusFromRaws([raw, raw], ['a-clone', 'b-clone']), off)).toEqual([])
})

test('off disables a single-skill rule', () => {
  const skill = skillFromRaw(cleanSkillRaw({ procedure: 'TODO(shakespii): fill this in' }))
  expect(runRulesWith(rules, skill, profile).some(f => f.ruleId === 'PH01')).toBe(true)
  const off = { ...profile, rules: { ...profile.rules, PH01: 'off' as const } }
  expect(runRulesWith(rules, skill, off).some(f => f.ruleId === 'PH01')).toBe(false)
})
```

(Identical `cleanSkillRaw()` bodies also trip XS01 — its whole body is one 15-line identical run — so the severity test sees both rules fire; it asserts on the aggregate.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/engine/corpus-engine.test.ts`
Expected: FAIL — cannot resolve `src/lib/rules/corpus` (no index) and `runCorpusRules` is not exported.

- [ ] **Step 3: Create `src/lib/rules/corpus/index.ts`**

```ts
import type { CorpusRule } from '../../types'
import { XS01 } from './XS01'
import { XS02 } from './XS02'

export const corpusRules: CorpusRule[] = [XS01, XS02]
```

- [ ] **Step 4: Widen `RuleSetting` in `src/lib/types.ts`**

Replace the line:

```ts
export type RuleSetting = Severity | { severity: Severity; options?: Record<string, unknown> }
```

with:

```ts
export type RuleSeverity = Severity | 'off'
export type RuleSetting = RuleSeverity | { severity: RuleSeverity; options?: Record<string, unknown> }
```

- [ ] **Step 5: Update `resolveRule` in `src/lib/profile/load.ts`**

Change its import line to `import type { Profile, RuleSetting, RuleSeverity, Severity } from '../types'` and its signature to:

```ts
export function resolveRule(setting: RuleSetting): {
  severity: RuleSeverity
  options: Record<string, unknown>
} {
  if (typeof setting === 'string') return { severity: setting, options: {} }
  return { severity: setting.severity, options: setting.options ?? {} }
}
```

(`Severity` stays imported for `validateProfile`'s anatomy check; leave that function untouched.)

- [ ] **Step 6: Replace `src/lib/engine.ts` with**

```ts
import type { CorpusFinding, CorpusRule, Finding, ParsedSkill, Profile, Rule } from './types'
import { resolveRule } from './profile/load'
import { rules } from './rules'
import { corpusRules } from './rules/corpus'

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

export function runRulesWith(registry: Rule[], skill: ParsedSkill, profile: Profile): Finding[] {
  const findings: Finding[] = []
  for (const rule of registry) {
    const setting = profile.rules[rule.id]
    if (setting === undefined) continue
    const { severity, options } = resolveRule(setting)
    if (severity === 'off') continue
    for (const f of rule.check(skill, { options, anatomy: profile.anatomy })) {
      findings.push({ ruleId: rule.id, message: f.message, file: f.file, line: f.line, severity: f.severity ?? severity })
    }
  }
  return findings.sort(
    (a, b) =>
      cmp(a.file, b.file) ||
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
      cmp(a.ruleId, b.ruleId),
  )
}

export function runRules(skill: ParsedSkill, profile: Profile): Finding[] {
  return runRulesWith(rules, skill, profile)
}

export function runCorpusRulesWith(registry: CorpusRule[], skills: ParsedSkill[], profile: Profile): CorpusFinding[] {
  const findings: CorpusFinding[] = []
  for (const rule of registry) {
    const setting = profile.rules[rule.id]
    if (setting === undefined) continue
    const { severity, options } = resolveRule(setting)
    if (severity === 'off') continue
    for (const f of rule.check(skills, { options, anatomy: profile.anatomy })) {
      findings.push({ ruleId: rule.id, severity, message: f.message, sites: f.sites })
    }
  }
  return findings.sort((a, b) => cmp(a.ruleId, b.ruleId) || cmp(a.sites[0]?.skill ?? '', b.sites[0]?.skill ?? ''))
}

export function runCorpusRules(skills: ParsedSkill[], profile: Profile): CorpusFinding[] {
  return runCorpusRulesWith(corpusRules, skills, profile)
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun test tests/engine/corpus-engine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Full suite, then commit**

Run: `bun test`
Expected: 0 fail (the `Severity` → `RuleSeverity` widening is source-compatible with every existing call site: string settings still resolve, and no existing profile entry uses `off`).

```bash
git add src/lib/rules/corpus/index.ts src/lib/types.ts src/lib/profile/load.ts src/lib/engine.ts tests/engine/corpus-engine.test.ts
git commit -m "feat(engine): corpus rule pass and off severity support"
```

---

### Task 5: `discoverSkills` + first fixture roots

**Files:**
- Create: `src/lib/corpus/discover.ts`
- Create fixtures: `tests/fixtures/corpus/clean-pair/corpus-clean-a/SKILL.md`, `tests/fixtures/corpus/clean-pair/corpus-clean-b/SKILL.md`, `tests/fixtures/corpus/with-skipped/corpus-solo/SKILL.md`, `tests/fixtures/corpus/with-skipped/notes/README.md`, `tests/fixtures/corpus/with-skipped/stray.md`
- Test: `tests/corpus/discover.test.ts`

**Interfaces:**
- Consumes: nothing project-internal (node:fs, node:path only)
- Produces: `discoverSkills(root: string): { skillDirs: string[]; skipped: SkippedDir[] }` with `SkippedDir = { dir: string; reason: string }`; throws `Error('target is a single skill; drop --corpus or point at its parent directory')` and `Error(\`not a directory: ${root}\`)`

- [ ] **Step 1: Create the fixture files**

`tests/fixtures/corpus/clean-pair/corpus-clean-a/SKILL.md`:

```markdown
---
name: corpus-clean-a
description: "Use when verifying corpus discovery against a clean fixture pair."
version: 0.1.0
---

# corpus-clean-a

## Intent

Serves as the alpha half of the clean corpus fixture pair.

## Inputs

The corpus root path handed over by the alpha test.

## Preconditions

The alpha fixture tree is checked out unchanged.

## Procedure

1. Stay deliberately unlike the beta sibling in every sentence.
2. Provide alpha-flavored prose for the discovery assertions.

## Output

An empty findings list for the alpha fixture.

## Examples

Given the input `alpha`, the expected output is `alpha-lint-clean`.

## Anti-patterns

Copying beta prose into the alpha fixture.
```

`tests/fixtures/corpus/clean-pair/corpus-clean-b/SKILL.md`:

```markdown
---
name: corpus-clean-b
description: "Use when verifying corpus discovery against a clean fixture pair."
version: 0.1.0
---

# corpus-clean-b

## Intent

Serves as the beta half of the clean corpus fixture pair.

## Inputs

The corpus root path handed over by the beta test.

## Preconditions

The beta fixture tree is checked out unchanged.

## Procedure

1. Stay deliberately unlike the alpha sibling in every sentence.
2. Provide beta-flavored prose for the discovery assertions.

## Output

An empty findings list for the beta fixture.

## Examples

Given the input `beta`, the expected output is `beta-lint-clean`.

## Anti-patterns

Copying alpha prose into the beta fixture.
```

(The pair shares only its seven `##` headings, each an isolated 1-line run — far below `minLines: 15` — and line-set Jaccard ≈ 7/25 ≈ 0.28, far below 0.8. Both skills lint 0/0 under all 24 single-skill rules: trigger-first third-person description, version present, all seven canonical sections, a marker-bearing example, no commands/paths/claims.)

`tests/fixtures/corpus/with-skipped/corpus-solo/SKILL.md`:

```markdown
---
name: corpus-solo
description: "Use when verifying that corpus discovery reports skipped directories."
version: 0.1.0
---

# corpus-solo

## Intent

Serves as the only real skill in the skipped-directory fixture root.

## Inputs

The corpus root path handed over by the skip test.

## Preconditions

The skip fixture tree is checked out unchanged.

## Procedure

1. Sit beside a non-skill directory and a stray file.
2. Remain the only discovered skill in this root.

## Output

An empty findings list for the solo fixture.

## Examples

Given the input `solo`, the expected output is `solo-lint-clean`.

## Anti-patterns

Adding a SKILL.md to the notes directory.
```

`tests/fixtures/corpus/with-skipped/notes/README.md`:

```markdown
Not a skill — corpus discovery must record this directory as skipped.
```

`tests/fixtures/corpus/with-skipped/stray.md`:

```markdown
A stray file at the corpus root; discovery ignores plain files silently.
```

- [ ] **Step 2: Write the failing test**

Create `tests/corpus/discover.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { discoverSkills } from '../../src/lib/corpus/discover'

const FIXTURES = join(import.meta.dir, '../fixtures/corpus')

test('discovers skill directories sorted, one level deep', () => {
  const { skillDirs, skipped } = discoverSkills(join(FIXTURES, 'clean-pair'))
  expect(skillDirs.map(d => basename(d))).toEqual(['corpus-clean-a', 'corpus-clean-b'])
  expect(skipped).toEqual([])
})

test('directories without SKILL.md are skipped with a reason; plain files are ignored silently', () => {
  const root = join(FIXTURES, 'with-skipped')
  const { skillDirs, skipped } = discoverSkills(root)
  expect(skillDirs.map(d => basename(d))).toEqual(['corpus-solo'])
  expect(skipped).toEqual([{ dir: join(root, 'notes'), reason: 'no SKILL.md' }])
})

test('symlinked skill directories are followed', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakespii-corpus-'))
  symlinkSync(join(FIXTURES, 'clean-pair/corpus-clean-a'), join(root, 'linked-skill'))
  const { skillDirs } = discoverSkills(root)
  expect(skillDirs.map(d => basename(d))).toEqual(['linked-skill'])
})

test('a root that is itself a skill throws the exact contract message', () => {
  expect(() => discoverSkills(join(import.meta.dir, '../fixtures/minimal-pass'))).toThrow(
    'target is a single skill; drop --corpus or point at its parent directory',
  )
})

test('a missing root throws not-a-directory', () => {
  expect(() => discoverSkills(join(FIXTURES, 'does-not-exist'))).toThrow('not a directory:')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/corpus/discover.test.ts`
Expected: FAIL — cannot resolve `src/lib/corpus/discover`.

- [ ] **Step 4: Create `src/lib/corpus/discover.ts`**

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface SkippedDir {
  dir: string
  reason: string
}

export interface Discovered {
  skillDirs: string[]
  skipped: SkippedDir[]
}

/**
 * One level deep, sorted, symlink-following (spec §1). A child directory with
 * a SKILL.md is a skill; one without is recorded as skipped; plain files are
 * ignored. A root that is itself a skill, or not a directory, throws — the
 * CLI turns that into exit 2.
 */
export function discoverSkills(root: string): Discovered {
  let rootIsDir: boolean
  try {
    rootIsDir = statSync(root).isDirectory()
  } catch {
    rootIsDir = false
  }
  if (!rootIsDir) throw new Error(`not a directory: ${root}`)
  if (existsSync(join(root, 'SKILL.md'))) {
    throw new Error('target is a single skill; drop --corpus or point at its parent directory')
  }
  const skillDirs: string[] = []
  const skipped: SkippedDir[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    let isDir: boolean
    try {
      isDir = statSync(dir).isDirectory() // statSync follows symlinks
    } catch {
      continue // dangling symlink — nothing to lint
    }
    if (!isDir) continue
    if (existsSync(join(dir, 'SKILL.md'))) skillDirs.push(dir)
    else skipped.push({ dir, reason: 'no SKILL.md' })
  }
  return { skillDirs, skipped }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/corpus/discover.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/corpus/discover.ts tests/corpus/discover.test.ts tests/fixtures/corpus/
git commit -m "feat(corpus): skill discovery for corpus roots"
```

---

### Task 6: `lintCorpus` composition (+ broken-skill fixture)

**Files:**
- Create: `src/lib/corpus/index.ts`
- Create fixtures: `tests/fixtures/corpus/with-broken/corpus-good/SKILL.md`, `tests/fixtures/corpus/with-broken/broken/SKILL.md/.gitkeep`
- Test: `tests/corpus/lint-corpus.test.ts`

**Interfaces:**
- Consumes: `discoverSkills` (Task 5), `parseSkill` (`src/lib/parser`), `runRules`/`runCorpusRules` (Task 4)
- Produces: `lintCorpus(root: string, profile: Profile): CorpusResult` with `SkillReport = { dir: string; name: string | null; findings: Finding[]; runError: string | null }` and `CorpusResult = { root: string; skills: SkillReport[]; corpusFindings: CorpusFinding[]; skipped: SkippedDir[] }`

- [ ] **Step 1: Create the broken-skill fixture**

`tests/fixtures/corpus/with-broken/corpus-good/SKILL.md`:

```markdown
---
name: corpus-good
description: "Use when verifying that one broken skill does not abort the corpus run."
version: 0.1.0
---

# corpus-good

## Intent

Serves as the healthy neighbor of a deliberately broken fixture skill.

## Inputs

The corpus root path handed over by the broken-skill test.

## Preconditions

The broken fixture tree is checked out unchanged.

## Procedure

1. Lint cleanly while the neighbor fails to parse.
2. Prove the corpus loop isolates per-skill failures.

## Output

An empty findings list for the good fixture.

## Examples

Given the input `good`, the expected output is `good-lint-clean`.

## Anti-patterns

Fixing the broken neighbor; it is broken by design.
```

`tests/fixtures/corpus/with-broken/broken/SKILL.md/.gitkeep` — create `SKILL.md` as a **directory** containing an empty `.gitkeep` file:

```bash
mkdir -p tests/fixtures/corpus/with-broken/broken/SKILL.md
touch tests/fixtures/corpus/with-broken/broken/SKILL.md/.gitkeep
```

(Discovery sees `broken/SKILL.md` exists; `parseSkill` then throws `EISDIR` on read — a committable, deterministic `runError` trigger.)

- [ ] **Step 2: Write the failing test**

Create `tests/corpus/lint-corpus.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { lintCorpus } from '../../src/lib/corpus'
import { loadProfile } from '../../src/lib/profile/load'

const FIXTURES = join(import.meta.dir, '../fixtures/corpus')
const profile = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

test('clean pair: two named reports, zero findings, zero corpus findings', () => {
  const r = lintCorpus(join(FIXTURES, 'clean-pair'), profile)
  expect(r.skills.map(s => s.name)).toEqual(['corpus-clean-a', 'corpus-clean-b'])
  expect(r.skills.every(s => s.findings.length === 0 && s.runError === null)).toBe(true)
  expect(r.corpusFindings).toEqual([])
  expect(r.skipped).toEqual([])
})

test('broken skill: runError captured, neighbors still lint, exit decision left to the CLI', () => {
  const r = lintCorpus(join(FIXTURES, 'with-broken'), profile)
  expect(r.skills).toHaveLength(2)
  const broken = r.skills.find(s => s.dir.endsWith('broken'))!
  const good = r.skills.find(s => s.dir.endsWith('corpus-good'))!
  expect(typeof broken.runError).toBe('string')
  expect((broken.runError as string).length).toBeGreaterThan(0)
  expect(broken.findings).toEqual([])
  expect(broken.name).toBeNull()
  expect(good.runError).toBeNull()
  expect(good.findings).toEqual([])
})

test('broken skill is excluded from the XS pass input', () => {
  const r = lintCorpus(join(FIXTURES, 'with-broken'), profile)
  expect(r.corpusFindings).toEqual([])
})

test('skipped directories pass through from discovery', () => {
  const r = lintCorpus(join(FIXTURES, 'with-skipped'), profile)
  expect(r.skipped).toEqual([{ dir: join(FIXTURES, 'with-skipped/notes'), reason: 'no SKILL.md' }])
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/corpus/lint-corpus.test.ts`
Expected: FAIL — cannot resolve `src/lib/corpus`.

- [ ] **Step 4: Create `src/lib/corpus/index.ts`**

```ts
import { runCorpusRules, runRules } from '../engine'
import { parseSkill } from '../parser'
import type { CorpusFinding, Finding, ParsedSkill, Profile } from '../types'
import { discoverSkills, type SkippedDir } from './discover'

export interface SkillReport {
  dir: string
  name: string | null
  findings: Finding[]
  runError: string | null
}

export interface CorpusResult {
  root: string
  skills: SkillReport[]
  corpusFindings: CorpusFinding[]
  skipped: SkippedDir[]
}

/**
 * Full corpus lint (spec §1): every discovered skill gets the complete
 * single-skill rule set; XS rules then run across the successfully parsed
 * skills. A skill that throws mid-lint is reported via runError and excluded
 * from the XS pass; the rest of the corpus still lints.
 */
export function lintCorpus(root: string, profile: Profile): CorpusResult {
  const { skillDirs, skipped } = discoverSkills(root)
  const parsed: ParsedSkill[] = []
  const skills: SkillReport[] = []
  for (const dir of skillDirs) {
    try {
      const skill = parseSkill(dir)
      const findings = runRules(skill, profile)
      parsed.push(skill)
      const name = skill.frontmatter.parsed?.['name']
      skills.push({ dir: skill.dir, name: typeof name === 'string' ? name : null, findings, runError: null })
    } catch (e) {
      skills.push({ dir, name: null, findings: [], runError: (e as Error).message })
    }
  }
  return { root, skills, corpusFindings: runCorpusRules(parsed, profile), skipped }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/corpus/lint-corpus.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/corpus/index.ts tests/corpus/lint-corpus.test.ts tests/fixtures/corpus/with-broken/
git commit -m "feat(corpus): lintCorpus composition with per-skill runError"
```

---

### Task 7: Corpus JSON report

**Files:**
- Create: `src/cli/format/corpus-json.ts`
- Test: `tests/cli/format-corpus-json.test.ts`

**Interfaces:**
- Consumes: `CorpusResult` (Task 6), `CorpusFinding` (Task 1)
- Produces: `jsonCorpusReport(result: CorpusResult, profileName: string): CorpusJsonReport` — the spec §3 schema: `{version: 1, mode: 'corpus', profile, root, skills[], corpusFindings[], skipped[], summary}` where each corpus finding is counted exactly once in `summary`

- [ ] **Step 1: Write the failing test**

Create `tests/cli/format-corpus-json.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { jsonCorpusReport } from '../../src/cli/format/corpus-json'
import type { CorpusResult } from '../../src/lib/corpus'

const result: CorpusResult = {
  root: '/r',
  skills: [
    {
      dir: '/r/a',
      name: 'a',
      runError: null,
      findings: [
        { ruleId: 'FM05', severity: 'error', file: 'SKILL.md', line: 1, message: 'm1' },
        { ruleId: 'CT04', severity: 'warn', file: 'SKILL.md', line: 2, message: 'm2' },
      ],
    },
    { dir: '/r/b', name: null, findings: [], runError: 'boom' },
  ],
  corpusFindings: [
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: 'dup',
      sites: [
        { skill: 'a', file: 'SKILL.md', startLine: 1, endLine: 20 },
        { skill: 'c', file: 'SKILL.md', startLine: 2, endLine: 21 },
      ],
    },
  ],
  skipped: [{ dir: '/r/notes', reason: 'no SKILL.md' }],
}

test('corpus report shape, runError entries, and count-once summary identity', () => {
  const rep = jsonCorpusReport(result, 'default')
  expect(rep.version).toBe(1)
  expect(rep.mode).toBe('corpus')
  expect(rep.profile).toBe('default')
  expect(rep.root).toBe('/r')
  expect(rep.skills[0]).toEqual({
    skill: { dir: '/r/a', name: 'a' },
    summary: { errors: 1, warnings: 1 },
    findings: [
      { ruleId: 'FM05', severity: 'error', file: 'SKILL.md', line: 1, message: 'm1' },
      { ruleId: 'CT04', severity: 'warn', file: 'SKILL.md', line: 2, message: 'm2' },
    ],
  })
  expect(rep.skills[1]).toEqual({ skill: { dir: '/r/b', name: null }, runError: 'boom' })
  expect(rep.corpusFindings).toEqual(result.corpusFindings)
  expect(rep.skipped).toEqual([{ dir: '/r/notes', reason: 'no SKILL.md' }])
  // one XS01 warn counted once — not per site, not per involved skill
  expect(rep.summary).toEqual({ skills: 2, skipped: 1, errors: 1, warnings: 2 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli/format-corpus-json.test.ts`
Expected: FAIL — cannot resolve `src/cli/format/corpus-json`.

- [ ] **Step 3: Create `src/cli/format/corpus-json.ts`**

```ts
import type { CorpusResult } from '../../lib/corpus'
import type { CorpusFinding } from '../../lib/types'

interface SkillEntry {
  skill: { dir: string; name: string | null }
  summary?: { errors: number; warnings: number }
  findings?: Array<{ ruleId: string; severity: string; file: string; line: number | null; message: string }>
  runError?: string
}

export interface CorpusJsonReport {
  version: 1
  mode: 'corpus'
  profile: string
  root: string
  skills: SkillEntry[]
  corpusFindings: CorpusFinding[]
  skipped: Array<{ dir: string; reason: string }>
  summary: { skills: number; skipped: number; errors: number; warnings: number }
}

export function jsonCorpusReport(result: CorpusResult, profileName: string): CorpusJsonReport {
  let errors = 0
  let warnings = 0
  const skills: SkillEntry[] = result.skills.map(s => {
    if (s.runError !== null) return { skill: { dir: s.dir, name: s.name }, runError: s.runError }
    const skillErrors = s.findings.filter(f => f.severity === 'error').length
    errors += skillErrors
    warnings += s.findings.length - skillErrors
    return {
      skill: { dir: s.dir, name: s.name },
      summary: { errors: skillErrors, warnings: s.findings.length - skillErrors },
      findings: s.findings.map(f => ({ ruleId: f.ruleId, severity: f.severity, file: f.file, line: f.line, message: f.message })),
    }
  })
  for (const f of result.corpusFindings) {
    if (f.severity === 'error') errors++
    else warnings++
  }
  return {
    version: 1,
    mode: 'corpus',
    profile: profileName,
    root: result.root,
    skills,
    corpusFindings: result.corpusFindings,
    skipped: result.skipped,
    summary: { skills: result.skills.length, skipped: result.skipped.length, errors, warnings },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/cli/format-corpus-json.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/cli/format/corpus-json.ts tests/cli/format-corpus-json.test.ts
git commit -m "feat(cli): corpus JSON report"
```

---

### Task 8: Corpus pretty output

**Files:**
- Create: `src/cli/format/corpus-pretty.ts`
- Test: `tests/cli/format-corpus-pretty.test.ts`

**Interfaces:**
- Consumes: `CorpusResult` (Task 6), `formatPretty` (`src/cli/format/pretty.ts`)
- Produces: `formatCorpusPretty(result: CorpusResult): string` — per-skill sections in discovery order, each corpus finding rendered under every involved skill with `[with: <partners>]`, skipped lines, and the spec §3 closing summary `` `${K} skills linted, ${S} skipped · ${E} errors, ${W} warnings (of which ${C} corpus-level)` ``

- [ ] **Step 1: Write the failing test**

Create `tests/cli/format-corpus-pretty.test.ts` (assertions use color-code-free contiguous substrings, so they hold with or without a TTY):

```ts
import { expect, test } from 'bun:test'
import { formatCorpusPretty } from '../../src/cli/format/corpus-pretty'
import type { CorpusResult } from '../../src/lib/corpus'

const result: CorpusResult = {
  root: '/r',
  skills: [
    {
      dir: '/r/a',
      name: 'a',
      runError: null,
      findings: [{ ruleId: 'FM05', severity: 'error', file: 'SKILL.md', line: 1, message: 'm1' }],
    },
    { dir: '/r/b', name: null, findings: [], runError: 'boom' },
  ],
  corpusFindings: [
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: 'dup',
      sites: [
        { skill: 'a', file: 'SKILL.md', startLine: 1, endLine: 20 },
        { skill: 'c', file: 'SKILL.md', startLine: 2, endLine: 21 },
      ],
    },
  ],
  skipped: [{ dir: '/r/notes', reason: 'no SKILL.md' }],
}

test('sections, corpus findings under involved skills, skipped lines, and the closing summary', () => {
  const out = formatCorpusPretty(result)
  expect(out).toContain('dup [with: c]')
  expect(out).toContain('lint failed')
  expect(out).toContain('boom')
  expect(out).toContain('skipped /r/notes — no SKILL.md')
  expect(out).toContain('2 skills linted, 1 skipped · 1 errors, 2 warnings (of which 1 corpus-level)')
})

test('a corpus finding is not rendered under an uninvolved skill', () => {
  const out = formatCorpusPretty(result)
  const sectionB = out.slice(out.indexOf('corpus-b') === -1 ? out.indexOf('/r/b') : 0)
  expect(sectionB).not.toContain('dup [with:')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli/format-corpus-pretty.test.ts`
Expected: FAIL — cannot resolve `src/cli/format/corpus-pretty`.

- [ ] **Step 3: Create `src/cli/format/corpus-pretty.ts`**

```ts
import { basename } from 'node:path'
import pc from 'picocolors'
import type { CorpusResult } from '../../lib/corpus'
import { formatPretty } from './pretty'

export function formatCorpusPretty(result: CorpusResult): string {
  const lines: string[] = []
  let errors = 0
  let warnings = 0
  for (const s of result.skills) {
    const dirName = basename(s.dir)
    lines.push(pc.bold(pc.underline(dirName)) + pc.dim(` (${s.dir})`))
    if (s.runError !== null) {
      lines.push(`  ${pc.red('lint failed')}: ${s.runError}`)
      lines.push('')
      continue
    }
    lines.push(formatPretty(s.dir, s.findings))
    errors += s.findings.filter(f => f.severity === 'error').length
    warnings += s.findings.filter(f => f.severity === 'warn').length
    for (const f of result.corpusFindings) {
      if (!f.sites.some(site => site.skill === dirName)) continue
      const partners = [...new Set(f.sites.map(site => site.skill).filter(n => n !== dirName))]
      const sev = f.severity === 'error' ? pc.red('error') : pc.yellow('warn ')
      lines.push(`  ${sev}  ${f.message} [with: ${partners.join(', ')}]  ${pc.dim(f.ruleId)}`)
    }
    lines.push('')
  }
  for (const sk of result.skipped) lines.push(pc.dim(`skipped ${sk.dir} — ${sk.reason}`))
  if (result.skipped.length > 0) lines.push('')
  for (const f of result.corpusFindings) {
    if (f.severity === 'error') errors++
    else warnings++
  }
  lines.push(
    pc.bold(
      `${result.skills.length} skills linted, ${result.skipped.length} skipped · ${errors} errors, ${warnings} warnings (of which ${result.corpusFindings.length} corpus-level)`,
    ),
  )
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/cli/format-corpus-pretty.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/cli/format/corpus-pretty.ts tests/cli/format-corpus-pretty.test.ts
git commit -m "feat(cli): corpus pretty output"
```

---

### Task 9: CLI `--corpus` wiring, XS fixture roots, corpus keystone

**Files:**
- Modify: `src/cli/lint.ts`, `src/cli/index.ts`
- Create fixtures: `tests/fixtures/corpus/clone-pair/corpus-clone-a/SKILL.md`, `tests/fixtures/corpus/clone-pair/corpus-clone-b/SKILL.md`, `tests/fixtures/corpus/shared-block-trio/corpus-shared-a/SKILL.md`, `tests/fixtures/corpus/shared-block-trio/corpus-shared-b/SKILL.md`, `tests/fixtures/corpus/shared-block-trio/corpus-shared-c/SKILL.md`
- Test: `tests/cli/corpus.test.ts`, `tests/cli/corpus-keystone.test.ts`

**Interfaces:**
- Consumes: `lintCorpus` (Task 6), `jsonCorpusReport` (Task 7), `formatCorpusPretty` (Task 8)
- Produces: `shakespii lint <root> --corpus [--json]`; exit 0 = no error findings, 1 = any error finding (per-skill or corpus), 2 = discovery throw or any per-skill `runError`. Single-skill invocations remain byte-identical.

- [ ] **Step 1: Create the clone-pair fixtures**

`tests/fixtures/corpus/clone-pair/corpus-clone-a/SKILL.md` — exactly this content (line positions are load-bearing for the keystone: the identical run is lines 9–38, 17 non-blank lines; the body spans lines 7–38):

```markdown
---
name: corpus-clone-a
description: "Use when verifying near-clone detection against a fixture pair."
version: 0.1.0
---

# corpus-clone-a

## Intent

Provides one half of a deliberately duplicated fixture pair.

## Inputs

A corpus root path supplied by the near-clone test.

## Preconditions

The clone fixture tree is checked out unchanged.

## Procedure

1. Repeat the shared fixture prose verbatim.
2. Keep both siblings byte-identical below the title.
3. Trigger near-clone detection by construction.
4. Trigger duplicate-block detection by construction.

## Output

An empty findings list for the clone fixture.

## Examples

Given the input `clone`, the expected output is `clone-lint-clean`.

## Anti-patterns

Letting the siblings drift apart.
```

`tests/fixtures/corpus/clone-pair/corpus-clone-b/SKILL.md` — identical except line 2 (`name: corpus-clone-b`) and line 7 (`# corpus-clone-b`).

- [ ] **Step 2: Create the shared-block-trio fixtures**

`tests/fixtures/corpus/shared-block-trio/corpus-shared-a/SKILL.md` — exactly this content (the identical run is `## Procedure` line 21 through `## Output` line 40 = 18 non-blank lines):

```markdown
---
name: corpus-shared-a
description: "Use when verifying duplicate-block detection across a fixture trio."
version: 0.1.0
---

# corpus-shared-a

## Intent

Serves as the alpha member of the shared-block fixture trio.

## Inputs

The corpus root path handed to the alpha assertions.

## Preconditions

The alpha member of the fixture tree is unchanged.

## Procedure

Shared corpus preamble line one.
Shared corpus preamble line two.
Shared corpus preamble line three.
Shared corpus preamble line four.
Shared corpus preamble line five.
Shared corpus preamble line six.
Shared corpus preamble line seven.
Shared corpus preamble line eight.
Shared corpus preamble line nine.
Shared corpus preamble line ten.
Shared corpus preamble line eleven.
Shared corpus preamble line twelve.
Shared corpus preamble line thirteen.
Shared corpus preamble line fourteen.
Shared corpus preamble line fifteen.
Shared corpus preamble line sixteen.

## Output

An empty findings list for the alpha member.

## Examples

Given the input `alpha`, the expected output is `alpha-trio-clean`.

## Anti-patterns

Diverging from the shared preamble in the alpha copy.
```

`corpus-shared-b/SKILL.md` and `corpus-shared-c/SKILL.md` — identical except: `name:`/`# ` H1 use `corpus-shared-b`/`corpus-shared-c`, and every occurrence of the word `alpha` in the Intent/Inputs/Preconditions/Output/Examples/Anti-patterns *content* lines becomes `beta`/`gamma` (the 16 `Shared corpus preamble` lines stay byte-identical in all three). The three files must agree on line positions (identical layout).

(Pairwise Jaccard for the trio ≈ 23 shared / 37 union ≈ 0.62 — XS02 stays silent; XS01 fires once with three sites.)

- [ ] **Step 3: Write the failing behavior tests**

Create `tests/cli/corpus.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/corpus')

test('root-is-a-skill exits 2 with the contract message', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(import.meta.dir, '../fixtures/minimal-pass'), '--corpus'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('target is a single skill; drop --corpus or point at its parent directory')
})

test('missing root exits 2', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'nope'), '--corpus'])
  expect(r.exitCode).toBe(2)
  expect(r.stderr.toString()).toContain('not a directory:')
})

test('skipped directories are reported in JSON; stray files are not', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'with-skipped'), '--corpus', '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.skipped).toHaveLength(1)
  expect(rep.skipped[0].reason).toBe('no SKILL.md')
  expect(rep.skipped[0].dir.endsWith('notes')).toBe(true)
  expect(rep.summary).toEqual({ skills: 1, skipped: 1, errors: 0, warnings: 0 })
})

test('a broken skill still prints the full report but exits 2', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'with-broken'), '--corpus', '--json'])
  expect(r.exitCode).toBe(2)
  const rep = JSON.parse(r.stdout.toString())
  expect(rep.skills).toHaveLength(2)
  const broken = rep.skills.find((s: { runError?: string }) => s.runError !== undefined)
  expect(typeof broken.runError).toBe('string')
})

test('pretty corpus output names partners and prints the summary line', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, 'clone-pair'), '--corpus'])
  expect(r.exitCode).toBe(0) // XS findings are warn — they never flip the exit code
  const out = r.stdout.toString()
  expect(out).toContain('[with: corpus-clone-b]')
  expect(out).toContain('2 skills linted, 0 skipped · 0 errors, 2 warnings (of which 2 corpus-level)')
})

test('single-skill JSON v1 is byte-stable without the new flags', () => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(import.meta.dir, '../fixtures/minimal-pass'), '--json'])
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout.toString())
  expect(Object.keys(rep).sort()).toEqual(['findings', 'profile', 'skill', 'summary', 'version'])
  expect(rep.version).toBe(1)
})
```

Create `tests/cli/corpus-keystone.test.ts` — the locked mini-corpus counts (same delta-adjudication discipline as the scaffold keystone; never silently re-lock):

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIXTURES = join(import.meta.dir, '../fixtures/corpus')

const corpusJson = (root: string) => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', join(FIXTURES, root), '--corpus', '--json'])
  return { exitCode: r.exitCode, rep: JSON.parse(r.stdout.toString()) }
}

test('KEYSTONE clean-pair: 2 skills, all zero, no corpus findings, exit 0', () => {
  const { exitCode, rep } = corpusJson('clean-pair')
  expect(exitCode).toBe(0)
  expect(rep.summary).toEqual({ skills: 2, skipped: 0, errors: 0, warnings: 0 })
  expect(rep.corpusFindings).toEqual([])
  for (const s of rep.skills) expect(s.summary).toEqual({ errors: 0, warnings: 0 })
})

test('KEYSTONE clone-pair: XS01 17-line block + XS02 cluster of 2, exit 0', () => {
  const { exitCode, rep } = corpusJson('clone-pair')
  expect(exitCode).toBe(0)
  expect(rep.summary).toEqual({ skills: 2, skipped: 0, errors: 0, warnings: 2 })
  for (const s of rep.skills) expect(s.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.corpusFindings).toEqual([
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: '17-line block shared by 2 skills — extract to a shared reference',
      sites: [
        { skill: 'corpus-clone-a', file: 'SKILL.md', startLine: 9, endLine: 38 },
        { skill: 'corpus-clone-b', file: 'SKILL.md', startLine: 9, endLine: 38 },
      ],
    },
    {
      ruleId: 'XS02',
      severity: 'warn',
      message: 'near-clone cluster of 2 skills (pairwise similarity ≥ 0.8) — consider parameterizing into one skill',
      sites: [
        { skill: 'corpus-clone-a', file: 'SKILL.md', startLine: 7, endLine: 38 },
        { skill: 'corpus-clone-b', file: 'SKILL.md', startLine: 7, endLine: 38 },
      ],
    },
  ])
})

test('KEYSTONE shared-block-trio: one XS01 finding, three sites, XS02 silent, exit 0', () => {
  const { exitCode, rep } = corpusJson('shared-block-trio')
  expect(exitCode).toBe(0)
  expect(rep.summary).toEqual({ skills: 3, skipped: 0, errors: 0, warnings: 1 })
  for (const s of rep.skills) expect(s.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.corpusFindings).toEqual([
    {
      ruleId: 'XS01',
      severity: 'warn',
      message: '18-line block shared by 3 skills — extract to a shared reference',
      sites: [
        { skill: 'corpus-shared-a', file: 'SKILL.md', startLine: 21, endLine: 40 },
        { skill: 'corpus-shared-b', file: 'SKILL.md', startLine: 21, endLine: 40 },
        { skill: 'corpus-shared-c', file: 'SKILL.md', startLine: 21, endLine: 40 },
      ],
    },
  ])
})

test('KEYSTONE summary identity: per-skill sums plus corpus counts equal the top-level summary', () => {
  for (const root of ['clean-pair', 'clone-pair', 'shared-block-trio', 'with-skipped']) {
    const { rep } = corpusJson(root)
    const perSkill = rep.skills.reduce(
      (acc: { e: number; w: number }, s: { summary?: { errors: number; warnings: number } }) => ({
        e: acc.e + (s.summary?.errors ?? 0),
        w: acc.w + (s.summary?.warnings ?? 0),
      }),
      { e: 0, w: 0 },
    )
    const ce = rep.corpusFindings.filter((f: { severity: string }) => f.severity === 'error').length
    const cw = rep.corpusFindings.length - ce
    expect(rep.summary.errors).toBe(perSkill.e + ce)
    expect(rep.summary.warnings).toBe(perSkill.w + cw)
  }
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test tests/cli/corpus.test.ts tests/cli/corpus-keystone.test.ts`
Expected: FAIL — `--corpus` is treated as a second positional, `usage:` on stderr, exit 2.

- [ ] **Step 5: Replace `src/cli/lint.ts` with**

```ts
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { lintCorpus } from '../lib/corpus'
import { runRules } from '../lib/engine'
import { parseSkill } from '../lib/parser'
import { loadProfile } from '../lib/profile/load'
import type { Profile } from '../lib/types'
import { jsonCorpusReport } from './format/corpus-json'
import { formatCorpusPretty } from './format/corpus-pretty'
import { jsonReport } from './format/json'
import { formatPretty } from './format/pretty'
import { defaultProfilePath } from './paths'

const USAGE = 'usage: shakespii lint <path> [--json] [--corpus]'

export function runLint(argv: string[]): number {
  const json = argv.includes('--json')
  const corpus = argv.includes('--corpus')
  const positionals = argv.filter(a => a !== '--json' && a !== '--corpus')
  if (positionals.length !== 1) {
    console.error(USAGE)
    return 2
  }
  let profile: Profile
  try {
    profile = loadProfile(defaultProfilePath)
  } catch (e) {
    console.error(`profile unreadable: ${(e as Error).message}`)
    return 2
  }

  if (corpus) {
    const root = resolve(positionals[0])
    let result
    try {
      result = lintCorpus(root, profile)
    } catch (e) {
      console.error((e as Error).message)
      return 2
    }
    console.log(json ? JSON.stringify(jsonCorpusReport(result, profile.profile), null, 2) : formatCorpusPretty(result))
    if (result.skills.some(s => s.runError !== null)) return 2
    const anyError =
      result.skills.some(s => s.findings.some(f => f.severity === 'error')) ||
      result.corpusFindings.some(f => f.severity === 'error')
    return anyError ? 1 : 0
  }

  let dir = resolve(positionals[0])
  if (basename(dir) === 'SKILL.md') dir = dirname(dir)
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  try {
    const skill = parseSkill(dir)
    const findings = runRules(skill, profile)
    if (json) {
      console.log(JSON.stringify(jsonReport(skill, profile.profile, findings), null, 2))
    } else {
      console.log(formatPretty(dir, findings))
    }
    return findings.some(f => f.severity === 'error') ? 1 : 0
  } catch (e) {
    console.error(`lint failed: ${(e as Error).message}`)
    return 2
  }
}
```

- [ ] **Step 6: Update the usage text in `src/cli/index.ts`**

Replace the line:

```
  lint <path> [--json]                lint a skill directory
```

with:

```
  lint <path> [--json] [--corpus]     lint a skill directory, or a corpus root with --corpus
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test tests/cli/corpus.test.ts tests/cli/corpus-keystone.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 8: Full suite, then commit**

Run: `bun test`
Expected: 0 fail — including the untouched scaffold keystone and weld.

```bash
git add src/cli/lint.ts src/cli/index.ts tests/cli/corpus.test.ts tests/cli/corpus-keystone.test.ts tests/fixtures/corpus/clone-pair/ tests/fixtures/corpus/shared-block-trio/
git commit -m "feat(cli): lint --corpus wiring and corpus keystone"
```

---
### Task 10: Config override validation and merge (`applyConfig`)

**Files:**
- Create: `src/lib/profile/config.ts`
- Test: `tests/profile/config.test.ts`

**Interfaces:**
- Consumes: `Profile`, `RuleSetting`, `RuleSeverity`, `AnatomySection`, `AnatomyTable` (`src/lib/types.ts`), `resolveRule` (`src/lib/profile/load.ts`)
- Produces: `applyConfig(base: Profile, doc: unknown): Profile` (pure, non-mutating) and `loadConfigOverride(path: string, base: Profile): Profile`; every invalid input throws `Error` whose message names the offending key (spec §4 fail-loud contract)

- [ ] **Step 1: Write the failing test**

Create `tests/profile/config.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { applyConfig } from '../../src/lib/profile/config'
import { loadProfile, resolveRule } from '../../src/lib/profile/load'

const base = loadProfile(join(import.meta.dir, '../../profiles/default.yaml'))

test('shorthand severity replaces severity and keeps default options', () => {
  const p = applyConfig(base, { rules: { FM03: 'error' } })
  expect(resolveRule(p.rules.FM03)).toEqual({ severity: 'error', options: { warnChars: 500, maxChars: 1024 } })
})

test('off is a legal severity', () => {
  const p = applyConfig(base, { rules: { PH01: 'off' } })
  expect(resolveRule(p.rules.PH01).severity).toBe('off')
})

test('object form: omitted severity keeps the default; options merge key-wise', () => {
  const p = applyConfig(base, { rules: { FM03: { options: { warnChars: 10 } } } })
  expect(resolveRule(p.rules.FM03)).toEqual({ severity: 'warn', options: { warnChars: 10, maxChars: 1024 } })
})

test('anatomy level is replaced; aliases untouched when not given', () => {
  const p = applyConfig(base, { anatomy: { intent: { level: 'error' } } })
  expect(p.anatomy.intent.level).toBe('error')
  expect(p.anatomy.intent.aliases).toEqual(['Overview', 'Purpose', 'Why'])
})

test('anatomy aliases are replaced wholesale, never merged', () => {
  const p = applyConfig(base, { anatomy: { intent: { aliases: ['Mission'] } } })
  expect(p.anatomy.intent.aliases).toEqual(['Mission'])
  expect(p.anatomy.intent.canonical).toBe('Intent')
})

test('the base profile is never mutated', () => {
  const aliasesBefore = [...base.anatomy.intent.aliases]
  applyConfig(base, { rules: { FM03: 'error' }, anatomy: { intent: { aliases: ['Mission'], level: 'error' } } })
  expect(base.anatomy.intent.aliases).toEqual(aliasesBefore)
  expect(resolveRule(base.rules.FM03).severity).toBe('warn')
})

test('empty rules/anatomy sections are no-ops', () => {
  const p = applyConfig(base, {})
  expect(p.rules).toEqual(base.rules)
  expect(p.anatomy).toEqual(base.anatomy)
})

test('fail-loud: every invalid shape names the offending key', () => {
  expect(() => applyConfig(base, null)).toThrow('invalid config: not a mapping')
  expect(() => applyConfig(base, { provenance: {} })).toThrow('unknown top-level key "provenance"')
  expect(() => applyConfig(base, { rules: { HY99: 'off' } })).toThrow('unknown rule "HY99"')
  expect(() => applyConfig(base, { rules: { FM05: 'fatal' } })).toThrow('invalid severity')
  expect(() => applyConfig(base, { rules: { FM05: { level: 'warn' } } })).toThrow('unknown key "level"')
  expect(() => applyConfig(base, { anatomy: { nonexistent: { level: 'warn' } } })).toThrow('unknown anatomy key "nonexistent"')
  expect(() => applyConfig(base, { anatomy: { intent: { canonical: 'Mission' } } })).toThrow('cannot override "canonical"')
  expect(() => applyConfig(base, { anatomy: { intent: { level: 'off' } } })).toThrow('level must be error or warn')
  expect(() => applyConfig(base, { anatomy: { intent: { aliases: 'Mission' } } })).toThrow('aliases must be a list of strings')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/profile/config.test.ts`
Expected: FAIL — cannot resolve `src/lib/profile/config`.

- [ ] **Step 3: Create `src/lib/profile/config.ts`**

```ts
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import type { AnatomySection, AnatomyTable, Profile, RuleSetting, RuleSeverity } from '../types'
import { resolveRule } from './load'

const RULE_SEVERITIES = new Set(['error', 'warn', 'off'])
const ANATOMY_LEVELS = new Set(['error', 'warn'])

export function loadConfigOverride(path: string, base: Profile): Profile {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`config unreadable: ${(e as Error).message}`)
  }
  let doc: unknown
  try {
    doc = parse(text)
  } catch (e) {
    throw new Error(`invalid config: malformed YAML — ${(e as Error).message}`)
  }
  return applyConfig(base, doc)
}

/**
 * A config file is a partial profile (spec §4): rules may be re-severitied
 * (error|warn|off) or re-optioned (key-wise merge); anatomy entries may change
 * level or replace their alias list wholesale. Everything else — unknown keys,
 * unknown rules, canonical overrides, bad severities — throws with the
 * offending key named. Never silently ignores a typo.
 */
export function applyConfig(base: Profile, doc: unknown): Profile {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Error('invalid config: not a mapping')
  }
  const c = doc as Record<string, unknown>
  for (const key of Object.keys(c)) {
    if (key !== 'rules' && key !== 'anatomy') {
      throw new Error(`invalid config: unknown top-level key "${key}" (only "rules" and "anatomy" are allowed)`)
    }
  }
  return { ...base, rules: mergeRules(base, c.rules), anatomy: mergeAnatomy(base, c.anatomy) }
}

function assertSeverity(id: string, val: unknown): RuleSeverity {
  if (typeof val !== 'string' || !RULE_SEVERITIES.has(val)) {
    throw new Error(`invalid config: rule "${id}" has invalid severity ${JSON.stringify(val)} (use error, warn, or off)`)
  }
  return val as RuleSeverity
}

function mergeRuleSetting(id: string, baseSetting: RuleSetting, val: unknown): RuleSetting {
  const { severity: baseSeverity, options: baseOptions } = resolveRule(baseSetting)
  if (typeof val === 'string') {
    const severity = assertSeverity(id, val)
    return Object.keys(baseOptions).length === 0 ? severity : { severity, options: baseOptions }
  }
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    throw new Error(`invalid config: rule "${id}" must be a severity string or a { severity, options } mapping`)
  }
  const entry = val as Record<string, unknown>
  for (const key of Object.keys(entry)) {
    if (key !== 'severity' && key !== 'options') {
      throw new Error(`invalid config: rule "${id}" has unknown key "${key}"`)
    }
  }
  const severity = entry.severity === undefined ? baseSeverity : assertSeverity(id, entry.severity)
  let options = baseOptions
  if (entry.options !== undefined) {
    if (typeof entry.options !== 'object' || entry.options === null || Array.isArray(entry.options)) {
      throw new Error(`invalid config: rule "${id}" options is not a mapping`)
    }
    options = { ...baseOptions, ...(entry.options as Record<string, unknown>) }
  }
  return Object.keys(options).length === 0 ? severity : { severity, options }
}

function mergeRules(base: Profile, raw: unknown): Record<string, RuleSetting> {
  if (raw === undefined) return base.rules
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('invalid config: "rules" is not a mapping')
  }
  const rules = { ...base.rules }
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    const baseSetting = base.rules[id]
    if (baseSetting === undefined) throw new Error(`invalid config: unknown rule "${id}"`)
    rules[id] = mergeRuleSetting(id, baseSetting, val)
  }
  return rules
}

function mergeAnatomy(base: Profile, raw: unknown): AnatomyTable {
  if (raw === undefined) return base.anatomy
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('invalid config: "anatomy" is not a mapping')
  }
  const anatomy: AnatomyTable = { ...base.anatomy }
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const baseEntry = base.anatomy[key]
    if (baseEntry === undefined) throw new Error(`invalid config: unknown anatomy key "${key}"`)
    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      throw new Error(`invalid config: anatomy "${key}" is not a mapping`)
    }
    const next: AnatomySection = { ...baseEntry, aliases: [...baseEntry.aliases] }
    for (const [field, fv] of Object.entries(val as Record<string, unknown>)) {
      if (field === 'canonical') {
        throw new Error(`invalid config: anatomy "${key}" cannot override "canonical"`)
      } else if (field === 'level') {
        if (typeof fv !== 'string' || !ANATOMY_LEVELS.has(fv)) {
          throw new Error(`invalid config: anatomy "${key}" level must be error or warn`)
        }
        next.level = fv as AnatomySection['level']
      } else if (field === 'aliases') {
        if (!Array.isArray(fv) || fv.some(x => typeof x !== 'string')) {
          throw new Error(`invalid config: anatomy "${key}" aliases must be a list of strings`)
        }
        next.aliases = fv as string[]
      } else {
        throw new Error(`invalid config: anatomy "${key}" has unknown key "${field}"`)
      }
    }
    anatomy[key] = next
  }
  return anatomy
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/profile/config.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/profile/config.ts tests/profile/config.test.ts
git commit -m "feat(profile): config override validation and merge"
```

---

### Task 11: CLI `--config` wiring + config fixtures

**Files:**
- Modify: `src/cli/lint.ts`, `src/cli/index.ts`
- Create fixtures: `tests/fixtures/config/no-version-skill/SKILL.md`, `tests/fixtures/config/mission-skill/SKILL.md`, and YAML files `tests/fixtures/config/demote-fm05.yaml`, `off-fm05.yaml`, `fm03-options.yaml`, `intent-alias.yaml`, `xs01-off.yaml`, `bad-unknown-rule.yaml`, `bad-severity.yaml`, `bad-top-key.yaml`, `bad-canonical.yaml`
- Test: `tests/cli/config.test.ts`

**Interfaces:**
- Consumes: `loadConfigOverride` (Task 10), everything already wired in `src/cli/lint.ts` (Task 9)
- Produces: `shakespii lint <path> [--json] [--corpus] [--config <file>]` — the override applies in both modes; config errors print their message verbatim to stderr and exit 2

- [ ] **Step 1: Create the fixture skills**

`tests/fixtures/config/no-version-skill/SKILL.md` (exactly one finding under the default profile: the FM05 missing-version error):

```markdown
---
name: no-version-skill
description: "Use when verifying config overrides against a version-less fixture skill."
---

# no-version-skill

## Intent

Carries exactly one default-profile finding: the missing version error.

## Inputs

The config fixture path handed over by the test.

## Preconditions

The config fixture tree is checked out unchanged.

## Procedure

1. Lint once without a config to observe the FM05 error.
2. Lint again with each override fixture to observe the change.

## Output

One FM05 finding by default; fewer under overrides.

## Examples

Given the input `no-version`, the expected output is `one FM05 error`.

## Anti-patterns

Adding a version field; the missing field is the fixture's point.
```

`tests/fixtures/config/mission-skill/SKILL.md` (exactly one finding: the CT06 intent-missing warning, because `## Mission` matches no default alias):

```markdown
---
name: mission-skill
description: "Use when verifying anatomy alias overrides against a fixture skill."
version: 0.1.0
---

# mission-skill

## Mission

States its purpose under a heading only a config override can accept.

## Inputs

The config fixture path handed over by the alias test.

## Preconditions

The alias fixture tree is checked out unchanged.

## Procedure

1. Lint once without a config to observe the CT06 warning.
2. Lint again with the intent-alias override to observe silence.

## Output

One CT06 warning by default; none under the alias override.

## Examples

Given the input `mission`, the expected output is `one CT06 warning`.

## Anti-patterns

Renaming the Mission heading back to Intent.
```

- [ ] **Step 2: Create the YAML fixtures**

`tests/fixtures/config/demote-fm05.yaml`:

```yaml
rules:
  FM05: warn
```

`tests/fixtures/config/off-fm05.yaml`:

```yaml
rules:
  FM05: off
```

`tests/fixtures/config/fm03-options.yaml`:

```yaml
rules:
  FM03: { options: { warnChars: 10 } }
```

`tests/fixtures/config/intent-alias.yaml`:

```yaml
anatomy:
  intent:
    aliases: [Mission]
```

`tests/fixtures/config/xs01-off.yaml`:

```yaml
rules:
  XS01: off
```

`tests/fixtures/config/bad-unknown-rule.yaml`:

```yaml
rules:
  HY99: off
```

`tests/fixtures/config/bad-severity.yaml`:

```yaml
rules:
  FM05: fatal
```

`tests/fixtures/config/bad-top-key.yaml`:

```yaml
provenance:
  superpowers: 9.9.9
```

`tests/fixtures/config/bad-canonical.yaml`:

```yaml
anatomy:
  intent:
    canonical: Mission
```

- [ ] **Step 3: Write the failing test**

Create `tests/cli/config.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const CLI = join(import.meta.dir, '../../src/cli/index.ts')
const FIX = join(import.meta.dir, '../fixtures/config')
const CORPUS = join(import.meta.dir, '../fixtures/corpus')

const lint = (...args: string[]) => {
  const r = Bun.spawnSync(['bun', CLI, 'lint', ...args])
  return { exitCode: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() }
}

test('baseline: no-version-skill has exactly one FM05 error', () => {
  const r = lint(join(FIX, 'no-version-skill'), '--json')
  expect(r.exitCode).toBe(1)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 1, warnings: 0 })
  expect(rep.findings[0].ruleId).toBe('FM05')
})

test('--config demotes FM05 to warn and flips the exit code', () => {
  const r = lint(join(FIX, 'no-version-skill'), '--json', '--config', join(FIX, 'demote-fm05.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 0, warnings: 1 })
  expect(rep.findings[0]).toMatchObject({ ruleId: 'FM05', severity: 'warn' })
})

test('--config off removes the rule entirely', () => {
  const r = lint(join(FIX, 'no-version-skill'), '--json', '--config', join(FIX, 'off-fm05.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 0, warnings: 0 })
  expect(rep.findings).toEqual([])
})

test('--config option override merges over default options', () => {
  const r = lint(join(import.meta.dir, '../fixtures/minimal-pass'), '--json', '--config', join(FIX, 'fm03-options.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.summary).toEqual({ errors: 0, warnings: 1 })
  expect(rep.findings[0].ruleId).toBe('FM03')
})

test('--config alias replacement silences CT06 on mission-skill', () => {
  const before = lint(join(FIX, 'mission-skill'), '--json')
  expect(JSON.parse(before.stdout).summary).toEqual({ errors: 0, warnings: 1 })
  expect(JSON.parse(before.stdout).findings[0].ruleId).toBe('CT06')
  const after = lint(join(FIX, 'mission-skill'), '--json', '--config', join(FIX, 'intent-alias.yaml'))
  expect(after.exitCode).toBe(0)
  expect(JSON.parse(after.stdout).summary).toEqual({ errors: 0, warnings: 0 })
})

test('--config applies in corpus mode too', () => {
  const r = lint(join(CORPUS, 'clone-pair'), '--corpus', '--json', '--config', join(FIX, 'xs01-off.yaml'))
  expect(r.exitCode).toBe(0)
  const rep = JSON.parse(r.stdout)
  expect(rep.corpusFindings).toHaveLength(1)
  expect(rep.corpusFindings[0].ruleId).toBe('XS02')
  expect(rep.summary).toEqual({ skills: 2, skipped: 0, errors: 0, warnings: 1 })
})

test('invalid configs exit 2 naming the offending key', () => {
  const target = join(import.meta.dir, '../fixtures/minimal-pass')
  const cases: Array<[string, string]> = [
    ['bad-unknown-rule.yaml', 'HY99'],
    ['bad-severity.yaml', 'fatal'],
    ['bad-top-key.yaml', 'provenance'],
    ['bad-canonical.yaml', 'canonical'],
  ]
  for (const [file, needle] of cases) {
    const r = lint(target, '--config', join(FIX, file))
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toContain(needle)
  }
})

test('missing config file exits 2', () => {
  const r = lint(join(import.meta.dir, '../fixtures/minimal-pass'), '--config', join(FIX, 'nope.yaml'))
  expect(r.exitCode).toBe(2)
  expect(r.stderr).toContain('config unreadable')
})

test('--config without a value exits 2 with usage', () => {
  const r = lint(join(import.meta.dir, '../fixtures/minimal-pass'), '--config')
  expect(r.exitCode).toBe(2)
  expect(r.stderr).toContain('usage:')
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test tests/cli/config.test.ts`
Expected: FAIL — `--config` and its value are treated as extra positionals (usage error, exit 2) on the override cases; the baseline test passes.

- [ ] **Step 5: Replace `src/cli/lint.ts` with the final version**

This is the Task 9 version plus `--config` parsing (only the marked parts are new):

```ts
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { lintCorpus } from '../lib/corpus'
import { runRules } from '../lib/engine'
import { parseSkill } from '../lib/parser'
import { loadConfigOverride } from '../lib/profile/config'
import { loadProfile } from '../lib/profile/load'
import type { Profile } from '../lib/types'
import { jsonCorpusReport } from './format/corpus-json'
import { formatCorpusPretty } from './format/corpus-pretty'
import { jsonReport } from './format/json'
import { formatPretty } from './format/pretty'
import { defaultProfilePath } from './paths'

const USAGE = 'usage: shakespii lint <path> [--json] [--corpus] [--config <file>]'

export function runLint(argv: string[]): number {
  const json = argv.includes('--json')
  const corpus = argv.includes('--corpus')
  const rest = argv.filter(a => a !== '--json' && a !== '--corpus')
  let configPath: string | null = null
  const positionals: string[] = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--config') {
      if (i + 1 === rest.length) {
        console.error(USAGE)
        return 2
      }
      configPath = rest[++i]
    } else {
      positionals.push(rest[i])
    }
  }
  if (positionals.length !== 1) {
    console.error(USAGE)
    return 2
  }
  let profile: Profile
  try {
    profile = loadProfile(defaultProfilePath)
  } catch (e) {
    console.error(`profile unreadable: ${(e as Error).message}`)
    return 2
  }
  if (configPath !== null) {
    try {
      profile = loadConfigOverride(resolve(configPath), profile)
    } catch (e) {
      console.error((e as Error).message)
      return 2
    }
  }

  if (corpus) {
    const root = resolve(positionals[0])
    let result
    try {
      result = lintCorpus(root, profile)
    } catch (e) {
      console.error((e as Error).message)
      return 2
    }
    console.log(json ? JSON.stringify(jsonCorpusReport(result, profile.profile), null, 2) : formatCorpusPretty(result))
    if (result.skills.some(s => s.runError !== null)) return 2
    const anyError =
      result.skills.some(s => s.findings.some(f => f.severity === 'error')) ||
      result.corpusFindings.some(f => f.severity === 'error')
    return anyError ? 1 : 0
  }

  let dir = resolve(positionals[0])
  if (basename(dir) === 'SKILL.md') dir = dirname(dir)
  if (!existsSync(join(dir, 'SKILL.md'))) {
    console.error(`not a skill: no SKILL.md at ${dir}`)
    return 2
  }
  try {
    const skill = parseSkill(dir)
    const findings = runRules(skill, profile)
    if (json) {
      console.log(JSON.stringify(jsonReport(skill, profile.profile, findings), null, 2))
    } else {
      console.log(formatPretty(dir, findings))
    }
    return findings.some(f => f.severity === 'error') ? 1 : 0
  } catch (e) {
    console.error(`lint failed: ${(e as Error).message}`)
    return 2
  }
}
```

- [ ] **Step 6: Final usage text in `src/cli/index.ts`**

Replace the line added in Task 9 with:

```
  lint <path> [--json] [--corpus] [--config <file>]   lint a skill directory or corpus root
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun test tests/cli/config.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 8: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/cli/lint.ts src/cli/index.ts tests/cli/config.test.ts tests/fixtures/config/
git commit -m "feat(cli): lint --config profile overrides"
```

---

### Task 12: HY05 segment-scan for compound commands

**Files:**
- Modify: `src/lib/rules/HY05.ts`
- Test: `tests/rules/HY05.test.ts` (append new tests; the existing six stay byte-identical)

**Interfaces:**
- Consumes: `textOutsideFences` (unchanged), existing `COMMANDS` list (unchanged — `cd` stays out)
- Produces: HY05 additionally fires on segments after `&&`, `||`, `;` with the message `` `unfenced command "${word}" after a shell operator — executable commands belong in code fences` ``; first-segment behavior and message are unchanged; `|` is deliberately not a split operator (spec §6 — table rows)

- [ ] **Step 1: Append the failing tests to `tests/rules/HY05.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `bun test tests/rules/HY05.test.ts`
Expected: the three new firing tests FAIL (0 findings); every pre-existing test still passes.

- [ ] **Step 3: Replace `src/lib/rules/HY05.ts` with**

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const COMMANDS = [
  'git', 'bun', 'npm', 'npx', 'node', 'python', 'python3', 'pip', 'pip3',
  'brew', 'curl', 'wget', 'make', 'docker', 'cargo', 'go', 'shakespii', 'whisper', 'claude',
]
// Case-sensitive on purpose: sentence-initial prose ("Go to docs/…") stays silent.
const CMD_FIRST = new RegExp(`^(?:\\$ )?(${COMMANDS.join('|')})\\b(.*)$`)
const CMD_LATER = new RegExp(`^(${COMMANDS.join('|')})\\b(.*)$`)
// && / || / ; only — never a bare |, which would slice markdown table rows
// documenting commands into false command segments (spec §6).
const SHELL_OPERATOR = /\s*(?:&&|\|\||;)\s*/
const FLAG = /(?:^|\s)-{1,2}[A-Za-z]/
const PATHISH = /\S\/\S|\S+\.[A-Za-z0-9]{1,8}(?:\s|$)/

export const HY05: Rule = {
  id: 'HY05',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        const segments = ln.split(SHELL_OPERATOR)
        for (let si = 0; si < segments.length; si++) {
          const m = (si === 0 ? CMD_FIRST : CMD_LATER).exec(segments[si])
          if (!m) continue
          if (!FLAG.test(m[2]) && !PATHISH.test(m[2])) continue
          out.push({
            message:
              si === 0
                ? `unfenced command line starting with "${m[1]}" — executable commands belong in code fences`
                : `unfenced command "${m[1]}" after a shell operator — executable commands belong in code fences`,
            file,
            line: i + offset,
          })
          break // one finding per line
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

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/rules/HY05.test.ts`
Expected: PASS (13 tests — 6 pre-existing + 7 new).

- [ ] **Step 5: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add src/lib/rules/HY05.ts tests/rules/HY05.test.ts
git commit -m "fix(rules): HY05 segment-scan for compound commands"
```

---

### Task 13: ST04 quoted-utterance experiment (autonomous) + decision gate

**Files:**
- Create: `docs/CALIBRATION-M3B.md` (experiment section) + canonical mirror `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md`
- Modify: `docs/LINT-RULES.md` (ST04 note) + canonical mirror `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md`
- Branch-dependent: `src/lib/rules/ST04.ts`, `tests/rules/ST04.test.ts`

This task interprets live output — controller: dispatch at standard tier or better, and treat the branch decision as spec-governed, not implementer discretion. All probe files live under a fresh temp directory; `~/.claude/skills/` is never touched (spec §5).

- [ ] **Step 1: Build the two probe projects**

```bash
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/st04-probe-XXXXXX")
mkdir -p "$SCRATCH/control/.claude/skills/st04-probe" "$SCRATCH/control/docs"
mkdir -p "$SCRATCH/subject/.claude/skills/st04-probe" "$SCRATCH/subject/docs"
```

`$SCRATCH/control/docs/marker.md`:

```markdown
ST04-CONTROL-SENTINEL-9f27c1 — if this exact token is visible in the agent context, the control @-path force-loaded this file.
```

`$SCRATCH/control/.claude/skills/st04-probe/SKILL.md`:

```markdown
---
name: st04-probe
description: "Use when asked to run the st04 probe check in this workspace."
---

# st04-probe

## Procedure

Consult the reference before answering: @docs/marker.md

Reply by stating verbatim every token beginning with ST04- that is visible in your context, or "none" if none are visible.
```

`$SCRATCH/subject/docs/marker.md`:

```markdown
ST04-SUBJECT-SENTINEL-4b81d2 — if this exact token is visible in the agent context, the quoted @-path force-loaded this file.
```

`$SCRATCH/subject/.claude/skills/st04-probe/SKILL.md` — identical to the control skill except the Procedure's reference line is replaced by the quoted-utterance form:

```markdown
Match phrases like:
- *"run the probe on the spec @docs/marker.md"*
```

- [ ] **Step 2: Run both probes headlessly and collect both signals**

```bash
(cd "$SCRATCH/control" && claude -p 'Use the st04-probe skill now and follow its procedure exactly.') > "$SCRATCH/control-reply.txt" 2>&1
(cd "$SCRATCH/subject" && claude -p 'Use the st04-probe skill now and follow its procedure exactly.') > "$SCRATCH/subject-reply.txt" 2>&1
# Signal (a): the model's own reports
cat "$SCRATCH/control-reply.txt" "$SCRATCH/subject-reply.txt"
# Signal (b) — authoritative: the session transcripts
grep -l 'ST04-CONTROL-SENTINEL-9f27c1' ~/.claude/projects/*st04-probe*/*.jsonl || echo 'CONTROL: no transcript hit'
grep -l 'ST04-SUBJECT-SENTINEL-4b81d2' ~/.claude/projects/*st04-probe*/*.jsonl || echo 'SUBJECT: no transcript hit'
```

A sentinel counts as force-loaded only when signal (b) finds it in the transcript of the matching probe run. (The sentinel string in the transcript proves the marker file's *content* entered the session; the probe skill itself never contains the sentinel.)

- [ ] **Step 3: Decide the branch (spec §5 gate — every branch autonomous)**

- **Branch A — control hit AND subject hit:** expansion fires inside quotes; the M3a findings are true positives. No rule change. Append this locking test to `tests/rules/ST04.test.ts` and run it (it passes against the unchanged rule):

```ts
test('quoted-utterance @-paths still fire (verified 2026-07-08: @-expansion ignores quoting — docs/CALIBRATION-M3B.md)', () => {
  const f = ST04.check(skillFromRaw(cleanSkillRaw({ procedure: '- *"run SDD on the spec @docs/spec.md"*' })), CTX)
  expect(f).toHaveLength(1)
})
```

- **Branch B — control hit AND subject no-hit:** expansion respects quoting; implement the exemption TDD-style. First append the RED tests:

```ts
test('an @-path inside a straight-quoted utterance stays silent', () => {
  expect(ST04.check(skillFromRaw(cleanSkillRaw({ procedure: '- *"run SDD on the spec @docs/spec.md"*' })), CTX)).toHaveLength(0)
})

test('an @-path inside curly quotes stays silent', () => {
  expect(ST04.check(skillFromRaw(cleanSkillRaw({ procedure: '- *“run SDD on the spec @docs/spec.md”*' })), CTX)).toHaveLength(0)
})

test('an unquoted @-path still fires on a line that also carries a quoted phrase', () => {
  expect(ST04.check(skillFromRaw(cleanSkillRaw({ procedure: 'See "the plan" then load @docs/spec.md' })), CTX)).toHaveLength(1)
})
```

Run `bun test tests/rules/ST04.test.ts` — the first two FAIL. Then replace `src/lib/rules/ST04.ts` with:

```ts
import { textOutsideFences } from '../parser/sections'
import type { Rule, RuleFinding } from '../types'

const AT_PATH = /(?:^|\s)@(\S+)/g
// Verified 2026-07-08 (docs/CALIBRATION-M3B.md): @-expansion does not fire inside
// quoted spans, so quoted illustrative utterances are exempt.
const QUOTED_SPAN = /"[^"\n]*"|“[^”\n]*”/g

const blankQuotedSpans = (ln: string): string => ln.replace(QUOTED_SPAN, m => ' '.repeat(m.length))

export const ST04: Rule = {
  id: 'ST04',
  check(skill) {
    const out: RuleFinding[] = []
    const scan = (file: string, text: string, offset: number): void => {
      textOutsideFences(text).split('\n').forEach((ln, i) => {
        for (const m of blankQuotedSpans(ln).matchAll(AT_PATH)) {
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

Run `bun test tests/rules/ST04.test.ts` — all pass, existing tests untouched.

- **Branch C — control no-hit, or the skill never engaged, or the two signals disagree:** inconclusive. **Default: no rule change** (the conservative branch — an evidence-free exemption could blind the rule to a real force-load vector). Append the Branch A locking test with the comment changed to `(experiment inconclusive — conservative default, see docs/CALIBRATION-M3B.md)`, and record the deferred follow-up in the doc (Step 4): re-run in a live interactive session, an operator decision outside this milestone.

- [ ] **Step 4: Create `docs/CALIBRATION-M3B.md` with the experiment record**

```markdown
# M3B calibration — corpus mode, config overrides, rule refinements

**Date:** 2026-07-08 · **Profile:** default · Corpus strictly read-only throughout.

## ST04 quoted-utterance experiment (spec §5)

Protocol: two throwaway project-scoped probe skills (control: unquoted `@docs/marker.md`;
subject: the quoted-utterance form from the M3a calibration findings), each run headlessly
(`claude -p`), judged by two signals — the model's reply and, authoritatively, a sentinel
grep over the session transcript JSONL.

### Commands and verbatim evidence

<paste: the exact commands run, both reply files, and both grep outcomes>

### Verdict

<one of, verbatim evidence-matched:>
- Branch A: control hit, subject hit — @-expansion ignores quoting. The five M3a ST04
  findings are true positives; no rule change; locking test added.
- Branch B: control hit, subject no-hit — @-expansion respects quoting. Narrow quoted-span
  exemption implemented TDD-style (RED fixtures first); the five M3a findings are
  reclassified as false positives of the pre-M3b rule.
- Branch C: inconclusive (<why>). Conservative default: no rule change; ST04 keeps firing.
  Deferred follow-up: re-run in a live interactive session — operator decision outside
  this milestone.
```

Fill the placeholders with the real evidence before committing. Sync the canonical copy and `cmp` both files.

- [ ] **Step 5: Update `docs/LINT-RULES.md`**

Append one sentence to ST04's shipped-detection note (after its M3a text) stating the verified behavior and pointing at `docs/CALIBRATION-M3B.md`: Branch A — "Quoted utterances verified force-loading (2026-07-08 probe); no exemption."; Branch B — "Quoted utterances verified non-loading (2026-07-08 probe); quoted spans exempt as of M3b."; Branch C — "Probe inconclusive (2026-07-08); no exemption by conservative default — live-session re-run deferred to the operator." Sync the canonical copy and `cmp`.

- [ ] **Step 6: Clean up, verify, commit**

```bash
rm -rf "$SCRATCH"
bun test
```

Expected: 0 fail.

Branch A/C commit:

```bash
git add docs/CALIBRATION-M3B.md docs/LINT-RULES.md tests/rules/ST04.test.ts
git commit -m "docs(m3b): ST04 quoted-utterance experiment — findings stand"
```

Branch B commit:

```bash
git add docs/CALIBRATION-M3B.md docs/LINT-RULES.md src/lib/rules/ST04.ts tests/rules/ST04.test.ts
git commit -m "fix(rules): ST04 quoted-span exemption per @-expansion experiment"
```

---
### Task 14: Refactor `scripts/calibrate.ts` onto corpus mode

**Files:**
- Modify: `scripts/calibrate.ts` (full replacement below)

**Interfaces:**
- Consumes: the corpus JSON contract from Task 9 (`skills[]`, `corpusFindings[]`, `skipped[]`)
- Produces: the same per-rule markdown tables the M2/M3 calibration docs paste verbatim, plus a `### Corpus findings` section; the script becomes the first dogfood consumer of `lint --corpus --json`

- [ ] **Step 1: Replace `scripts/calibrate.ts` with**

```ts
#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

// Calibration drives the CLI's corpus mode (M3b spec §8) — one invocation per
// root. The corpus CLI/JSON contract itself is what the sweep exercises, and
// this script is its first dogfood consumer (it replaces the M2-era
// hand-rolled per-directory walk).
const CLI = join(import.meta.dir, '../src/cli/index.ts')

interface ReportFinding {
  ruleId: string
  severity: 'error' | 'warn'
}
interface SkillEntry {
  skill: { dir: string }
  findings?: ReportFinding[]
  runError?: string
}
interface CorpusReport {
  skills: SkillEntry[]
  corpusFindings: Array<{ ruleId: string; severity: string; message: string; sites: Array<{ skill: string }> }>
  skipped: Array<{ dir: string; reason: string }>
}

const roots = process.argv.length > 2
  ? process.argv.slice(2)
  : [
      join(homedir(), '.claude/skills'),
      join(homedir(), '.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills'),
    ]

for (const root of roots) {
  if (!existsSync(root)) {
    console.error(`skip missing corpus root: ${root}`)
    continue
  }
  const r = Bun.spawnSync(['bun', CLI, 'lint', root, '--corpus', '--json'])
  if (r.stdout.length === 0) {
    console.error(`corpus lint produced no report for ${root}: ${r.stderr.toString().trim()}`)
    continue
  }
  const report = JSON.parse(r.stdout.toString()) as CorpusReport
  const perRule = new Map<string, { errors: number; warns: number; skills: Set<string> }>()
  let total = 0
  for (const s of report.skills) {
    if (s.runError !== undefined) {
      console.error(`lint failed on ${s.skill.dir}: ${s.runError}`)
      continue
    }
    total++
    for (const f of s.findings ?? []) {
      const e = perRule.get(f.ruleId) ?? { errors: 0, warns: 0, skills: new Set<string>() }
      if (f.severity === 'error') e.errors++
      else e.warns++
      e.skills.add(basename(s.skill.dir))
      perRule.set(f.ruleId, e)
    }
  }
  console.log(`\n## ${root} — ${total} skills\n`)
  console.log('| Rule | Errors | Warnings | Skills affected |')
  console.log('|---|---|---|---|')
  for (const id of [...perRule.keys()].sort()) {
    const e = perRule.get(id)!
    console.log(`| ${id} | ${e.errors} | ${e.warns} | ${e.skills.size} |`)
  }
  if (report.corpusFindings.length > 0) {
    console.log('\n### Corpus findings\n')
    for (const f of report.corpusFindings) {
      console.log(`- ${f.ruleId} (${f.severity}): ${f.message} — sites: ${f.sites.map(s => s.skill).join(', ')}`)
    }
  }
  for (const sk of report.skipped) console.error(`skipped ${sk.dir} — ${sk.reason}`)
}
```

(Note the script keys on `r.stdout` being non-empty, not on the exit code — a corpus with one broken skill exits 2 but still emits the full report, and the per-skill `runError` lines land on stderr.)

- [ ] **Step 2: Verify against the fixture corpora**

Run: `bun scripts/calibrate.ts tests/fixtures/corpus/clone-pair tests/fixtures/corpus/clean-pair`
Expected: clone-pair prints an empty per-rule table (headers only) plus a `### Corpus findings` section listing the XS01 17-line block and the XS02 cluster with sites `corpus-clone-a, corpus-clone-b`; clean-pair prints headers only and no corpus section.

- [ ] **Step 3: Full suite, then commit**

Run: `bun test`
Expected: 0 fail.

```bash
git add scripts/calibrate.ts
git commit -m "refactor(scripts): calibrate via lint --corpus"
```

---

### Task 15: Calibration predictions (committed BEFORE the sweep)

**Files:**
- Modify: `docs/CALIBRATION-M3B.md` (created in Task 13) + canonical mirror

Protocol (docs/CALIBRATION-M3.md precedent): the predictions commit must land before any sweep output exists — the commit order is the integrity evidence.

- [ ] **Step 1: Add the predictions section**

Insert into `docs/CALIBRATION-M3B.md`, after the header and before the ST04 experiment section, adjusting the ST04 row to the branch Task 13 actually recorded:

```markdown
## Predictions (written before the sweep)

Sweep command: `bun scripts/calibrate.ts` (both default roots, via `lint --corpus --json`).
Corpus strictly read-only; severity changes recorded, never made (M2/M3 protocol).

| Prediction | Evidence |
|---|---|
| XS01, personal root: exactly one finding — the collab-readiness block shared by the five ai-whisper kickoff skills (`ai-whisper-bugfix`, `-deliberation`, `-quick-task`, `-ralph`, `-sdd`), on the order of 70 normalized lines. If the five copies have drifted, fragmented shorter runs may appear instead — each fragment still confined to those five skills. | docs/LINT-RULES.md XS01 evidence row (~70-line block × 5 skills) |
| XS02, personal root: exactly one cluster — the same five kickoff skills (~80% shared bodies). No other cluster on either root. | docs/LINT-RULES.md XS02 evidence row |
| Superpowers root: zero XS findings of either kind. | No known ≥15-line identical cross-skill block or ≥0.8 body pair in that corpus |
| Per-skill single-skill counts on both roots are identical to the CALIBRATION-M3 post-fix tables, with exactly two sanctioned deltas: HY05 gains one personal-root warning (compress's `cd … && python3 …` line — the M3b segment-scan closes the documented miss) and ST04 changes only per the Task 13 branch (A/C: unchanged at 5 errors; B: those 5 errors disappear). Any other delta is a corpus-loop regression, not a finding. | Corpus mode reuses the engine unchanged (spec §8); CALIBRATION-M3 HY05/ST04 adjudication rows |
| Skipped reporting: personal root reports `personal-preferences` (`no SKILL.md`); superpowers root reports none; zero `runError` entries on either root. | M3 corpus-composition notes (14 + 14 skills, one empty dir) |
```

- [ ] **Step 2: Sync the canonical mirror and verify**

```bash
cp docs/CALIBRATION-M3B.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md docs/CALIBRATION-M3B.md
```

Expected: no output (byte-identical).

- [ ] **Step 3: Commit (before any sweep output exists)**

```bash
git add docs/CALIBRATION-M3B.md
git commit -m "docs(m3b): calibration predictions written before the sweep"
```

---

### Task 16: Calibration sweep + adjudications

**Files:**
- Modify: `docs/CALIBRATION-M3B.md` + canonical mirror
- Possibly (adjudicated rule-logic bugs only): rule sources + RED fixtures

This task interprets sweep output against predictions — controller: standard tier or better.

- [ ] **Step 1: Run the sweep (read-only)**

Run: `bun scripts/calibrate.ts` — both default roots. Do not modify anything under either corpus root. Capture stdout AND stderr in full.

- [ ] **Step 2: Paste verbatim counts**

Append to `docs/CALIBRATION-M3B.md` an `## Actual counts (verbatim)` section containing the sweep output unedited (both roots' tables, corpus-findings sections, and any stderr `skipped`/`lint failed` lines).

- [ ] **Step 3: Adjudicate every deviation**

Append an `## Adjudications` section using the CALIBRATION-M3 row protocol — one row per deviation from a prediction, classified exactly one of:

- `rule-logic bug` — fix the code, RED fixture first, full suite green, then re-run the sweep and record post-fix counts;
- `miscalibration` — a profile *option* would need to change; record the evidence and the proposed option change but do NOT edit `profiles/default.yaml` (Global Constraint 5 — it is the user's decision);
- `audit-miss` — the prediction or its source evidence was wrong; document only.

Close with an `## Outcome` paragraph: totals per classification, confirmation the corpus was untouched (`git status --porcelain` clean apart from docs), and the regression cross-check verdict (per-skill counts vs CALIBRATION-M3 post-fix tables, sanctioned deltas only).

- [ ] **Step 4: Sync, verify, commit**

```bash
cp docs/CALIBRATION-M3B.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md docs/CALIBRATION-M3B.md
bun test
```

Expected: `cmp` silent; suite 0 fail.

```bash
git add docs/CALIBRATION-M3B.md
git commit -m "docs(m3b): calibration sweep with adjudicated findings"
```

(If Step 3 produced rule fixes, include those source/test files in the same commit, or commit them separately immediately before this one with message `fix(rules): <rule> calibration fix — <mechanism>`.)

---

### Task 17: `using-shakespii` companion update (v0.2.0)

**Files:**
- Modify: `skills/using-shakespii/SKILL.md`, `skills/using-shakespii/references/rule-remediations.md`
- Verify: `tests/skill/using-shakespii.test.ts` (unchanged — must stay green)

The M2.5 skill teaches "there is no corpus-wide lint mode" — true then, false after Task 9 (spec §9). Four SKILL.md edits, exact old → new:

- [ ] **Step 1: Bump the version**

`version: 0.1.0` → `version: 0.2.0` (frontmatter line 4).

- [ ] **Step 2: Update the audit input**

Old:

```markdown
- Audit: the path to an existing skill directory (one containing `SKILL.md`). Multiple
  skills are audited one directory at a time.
```

New:

```markdown
- Audit: the path to an existing skill directory (one containing `SKILL.md`), or a
  corpus root — a directory of skill directories — audited in one run with `--corpus`.
```

- [ ] **Step 3: Extend audit-branch step 5**

Old:

```markdown
5. Lint the directory the human named and work the fix loop above.
```

New:

```markdown
5. Lint the directory the human named and work the fix loop above. For a corpus
   root, run `shakespii lint <root> --corpus --json`: work each skill's findings
   with the same loop, and treat `corpusFindings` (XS rules, whose `sites` name
   every involved skill) as refactor suggestions spanning skills.
```

- [ ] **Step 4: Replace the stale anti-pattern (spec-pinned wording)**

Old:

```markdown
- Referencing CLI features that do not exist yet. There is no corpus-wide lint mode;
  audit multiple skills one directory at a time.
```

New:

```markdown
- Pointing `--corpus` at a single skill directory — corpus mode takes the *parent*
  directory; lint a single skill without the flag.
```

- [ ] **Step 5: Extend `references/rule-remediations.md`**

Update its header: `# Rule remediations — seed rules` → `# Rule remediations — rule catalog`, and `Last reviewed: 2026-07-07` → `Last reviewed: 2026-07-08`. Append at the end:

```markdown
## XS01 — duplicate block across skills (corpus mode)

- Contract: no block of 15+ identical non-blank lines appears in two or more skills'
  `SKILL.md` bodies; the finding lists every sharing skill in `sites`.
- Common cause: copy-pasting a shared preamble or checklist between sibling skills.
- Fix: extract the block to one shared reference file and link it from each skill,
  keeping skill-specific deviations inline.
- Before → after: the same seventy-line readiness checklist in five skills → one
  `references/readiness.md` linked five times.

## XS02 — near-clone skills (corpus mode)

- Contract: no cluster of skills whose `SKILL.md` bodies are near-identical
  (line-set similarity at or above the profile threshold).
- Common cause: forking a skill as a template and editing only a few lines.
- Fix: parameterize the shared behavior into one skill whose inputs select the
  variant, or reduce the clones to thin wrappers around one shared reference.
- Before → after: five kickoff clones sharing most of their bodies → one
  parameterized kickoff skill.
```

- [ ] **Step 6: Verify the weld and the suite, then commit**

Run: `bun test tests/skill/using-shakespii.test.ts`
Expected: PASS — still `{errors: 0, warnings: 0}` through the real CLI.

Run: `bun test`
Expected: 0 fail.

```bash
git add skills/using-shakespii/
git commit -m "feat(skill): using-shakespii corpus-audit loop (v0.2.0)"
```

---

### Task 18: Docs close-out + final verification

**Files:**
- Modify: `docs/LINT-RULES.md`, `docs/ROADMAP.md`, `README.md` + canonical mirrors

- [ ] **Step 1: `docs/LINT-RULES.md`**

Three edits (the file's per-rule "Shipped detection" note pattern is established from M3a — follow it):

1. Under the XS table (LINT-RULES §XS), add shipped-detection notes:

```markdown
**Shipped detection (M3b).** XS01: SKILL.md bodies are normalized to non-blank,
trailing-whitespace-stripped lines (blanks neither break runs nor count); maximal
identical runs of ≥ `minLines` lines shared by ≥ `minSkills` distinct skills fire once
per block, with contained sub-blocks merged into the longer block when their skill
sets agree, and sites reported in original file coordinates. XS02: Jaccard similarity
over each skill's deduplicated normalized line set; pairs at or above `similarity`
are union-find-clustered and each cluster fires once, one site per member spanning
its body range. Both require `--corpus`; both count once in summaries.
```

2. Update HY05's shipped-detection note: append —

```markdown
As of M3b, unfenced lines are additionally split on `&&`, `||`, and `;`, and every
segment's leading word is checked (the `$ ` prompt prefix stays legal only at true
line start); one finding per line. Single `|` deliberately does not split — an
unfenced table row documenting commands (`| git status | … |`) must not fire. This
closes the compress compound-command miss documented in CALIBRATION-M3.
```

3. Extend the M3a completion paragraph at the bottom with:

```markdown
**M3b completion (2026-07-08):** XS01/XS02 are implemented and live behind `shakespii
lint --corpus` (docs/CALIBRATION-M3B.md); `--config` profile overrides shipped
(severity error|warn|off, option merge, alias replacement, fail-loud validation);
HY05 gained the compound-command segment scan; ST04's quoted-utterance question was
resolved by the recorded experiment. TR01/TR02 remain pending M4 (harness-backed).
```

(Task 13 already added the ST04 note; verify it is present.)

- [ ] **Step 2: `docs/ROADMAP.md`**

Tick both M3b boxes:

```markdown
## M3b — Corpus mode + config

- [x] Cross-skill rules XS01/XS02 (corpus-context mode: `shakespii lint --corpus ~/.claude/skills`)
- [x] Config file for profile overrides
```

- [ ] **Step 3: `README.md`**

Update the Status paragraph to record M3b (corpus mode + config overrides shipped; next up: M4 test harness), and in "What this will be", extend the lint bullet:

```markdown
- `shakespii lint <path>` — validate a skill against the rule catalog; `--corpus`
  lints a whole directory of skills (cross-skill XS rules included) and `--config`
  applies profile overrides
```

- [ ] **Step 4: Dual-location sync (canonical + mirror, cmp-verified)**

```bash
cp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md
cp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
cp docs/CALIBRATION-M3B.md ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md docs/LINT-RULES.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md docs/ROADMAP.md
cmp ~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/CALIBRATION-M3B.md docs/CALIBRATION-M3B.md
```

Expected: all three `cmp` calls silent. (README has no canonical mirror — repo-only.)

- [ ] **Step 5: Final verification gate**

Run: `bun test`
Expected: 0 fail, exit 0 — never piped. Confirm the scaffold keystone, corpus keystone, and weld tests are all in the passing set.

Run: `git status --porcelain`
Expected: only the files this task edits (then empty after the commit).

- [ ] **Step 6: Commit**

```bash
git add docs/LINT-RULES.md docs/ROADMAP.md README.md
git commit -m "docs(m3b): close out M3b — roadmap, LINT-RULES, README"
```

---

## Execution notes

- Tasks run strictly in order; Task 13's recorded branch feeds Task 15's ST04 prediction row and Task 18's LINT-RULES verification.
- The ST04 experiment (Task 13) and the calibration sweep (Task 16) read the live dogfood corpus and the live `claude` CLI — both are read-only with respect to every corpus root; probe projects live in fresh temp directories and are deleted.
- If the Task 13 probes cannot run at all (e.g. no `claude` CLI available headlessly), that IS Branch C — inconclusive, conservative default, documented; do not block.
- Where this plan and the spec disagree, the spec (`docs/specs/2026-07-08-m3b-corpus-config-design.md`) governs; where observed reality disagrees with both (e.g. drifted corpus counts), adjudicate in CALIBRATION-M3B.md — never silently re-lock an invariant.
