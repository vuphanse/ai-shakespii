# M2 — MVP CLI: design specification

**Date:** 2026-07-07 · **Status:** approved — awaiting implementation

Builds the first runnable `shakespii`: parser, rule engine with the six seed rules, `init`, `lint` (pretty + `--json`), and the dogfood calibration run. Consumes the M1 artifacts verbatim: `profiles/default.yaml` and `templates/skill/` (spec: `docs/specs/2026-07-07-m1-phase1-specification-design.md`).

## Decisions (user-adjudicated 2026-07-07)

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Runtime language | TypeScript on Bun | Python (distribution friction, weaker md AST tooling), Go (slow iteration for a rule-catalog codebase) |
| Distribution at M2 | Local link only (`git clone` + `bun link`) | npm publish from M2 (release discipline before the tool is proven), compiled binaries (build-matrix overhead) |
| CLI name | `shakespii` (confirmed, was working name) | skillsmith, sksp |
| `--json` timing | Pulled from M3 into M2 | Keeping at M3 (would churn the M2.5 companion-skill contract) |
| Architecture | Approach A: lib-first, thin CLI in one package | Flat CLI (rules tangle with I/O), monorepo workspaces (YAGNI at single-user MVP) |

Still open (user's, untouched by M2): score model, personal-skill migration.

## §1 Tech stack and repository layout

**Stack:** Bun runtime, TypeScript strict mode, `bun test`. Runtime dependencies limited to four:

- `yaml` — parses both `profiles/default.yaml` and SKILL.md frontmatter. We fence-split `---` ourselves (~20 lines, fully tested) so one YAML parser owns everything and FM01 gets raw frontmatter text plus precise parse-error line numbers. No `gray-matter` (would bundle a second YAML library).
- `unified` + `remark-parse` — mdast body AST with position info.
- `picocolors` — pretty formatter colors.

CLI argument parsing uses node's built-in `util.parseArgs`. Dev dependencies: `typescript`, `@types/mdast`.

**Layout** (the Approach A lib/CLI boundary is folder discipline: `src/lib/` is pure — no `process.exit`, no `console`, no cwd access; `src/cli/` does all I/O and never gets imported by lib):

```
src/
  lib/
    types.ts                # ParsedSkill, Section, FileEntry, Rule, Finding, Severity
    parser/
      frontmatter.ts        # fence split + YAML parse → raw text + parsed fields + error
      sections.ts           # remark → Section[] with absolute line spans
      inventory.ts          # recursive sibling-file walk (skips .git, depth cap 5)
      index.ts              # parseSkill(dir) → ParsedSkill
    profile/
      load.ts               # loads default.yaml, validates shape, deep-merge for overrides
      types.ts
    rules/
      FM01.ts FM02.ts FM04.ts CT03.ts ST02.ts PH01.ts
      anatomy.ts            # anatomyPresence(sectionKey) helper shared by CT rules
      index.ts              # registry: Map<string, Rule>
    engine.ts               # runRules(skill, profile) → Finding[]
  cli/
    index.ts                # #!/usr/bin/env bun — parseArgs, dispatch, exit codes
    init.ts
    lint.ts
    format/
      pretty.ts
      json.ts
tests/
  fixtures/                 # real skill directories (see §5)
  parser/  profile/  rules/  engine/  cli/
scripts/
  calibrate.ts              # dogfood corpus sweep (§5)
profiles/default.yaml       # M1 artifact, loaded verbatim (FM04 amendment below)
templates/skill/            # M1 artifact, copied verbatim by init
package.json                # "type": "module", "bin": { "shakespii": "src/cli/index.ts" }
```

`templates/` and `profiles/` resolve relative to the **installed package root** (via `import.meta`), never cwd, so `bun link` works from any directory.

## §2 Parser and the `ParsedSkill` shape

Core principle: **the parser never throws on bad content.** Malformed frontmatter, missing sections, empty body are all representable as data; rules turn them into findings. Only true I/O failure (path has no readable `SKILL.md`) is a CLI-level error (exit 2), not a finding.

```ts
type ParsedSkill = {
  dir: string                 // absolute path to the skill directory
  dirName: string             // basename — FM02 compares against frontmatter name
  raw: string                 // full SKILL.md text
  frontmatter: {
    raw: string | null        // text between --- fences; null = fences absent/unterminated
    parsed: Record<string, unknown> | null   // null = YAML parse failed or raw is null
    error: { message: string; line: number } | null   // YAML/fence error, FM01 cites it
  }
  body: {
    raw: string               // everything after the closing fence
    lineOffset: number        // line number in SKILL.md where the body starts
    h1: string | null         // first depth-1 heading text, for ST01 later
    sections: Section[]
  }
  files: FileEntry[]          // sibling inventory
}

type Section = {
  heading: string             // raw heading text
  normalized: string          // lowercased, trimmed, trailing punctuation stripped (M1 §1 form)
  depth: 2 | 3                // only h2/h3 participate in anatomy matching (M1 §1)
  startLine: number           // 1-based, absolute in SKILL.md
  endLine: number
  text: string                // raw markdown from after the heading to the next h2/h3 (any depth) or EOF
}

type FileEntry = { relPath: string; size: number; text: string | null }
```

Semantics:

- **Fence split:** frontmatter exists only if line 1 is exactly `---`; it ends at the next `---` line. Missing opening fence → `raw: null`, `error: null` (FM01 reports "frontmatter missing"). Unterminated fence → `raw: null`, `error: { message: "unterminated frontmatter fence", line: 1 }`.
- **Sections are flat, not nested.** A section's text ends at the next h2 or h3 regardless of depth relationship. h1 and h4+ headings never create sections; their text belongs to the enclosing section's span.
- **Line fidelity:** remark positions are body-relative; the parser adds `body.lineOffset` so every `Section.startLine` and every finding line is absolute in SKILL.md.
- **Anatomy-agnostic:** the parser extracts *all* h2/h3 sections; matching against the profile's alias table happens in the rules layer. Anatomy changes are profile edits, never parser edits.
- **Inventory:** recursive walk of the skill dir, excluding `.git`, depth capped at 5; `SKILL.md` itself is excluded from `files`. The walk loads each file's `text` so rules stay disk-free; `text` is `null` for binary or oversized files (>1 MB, or a NUL byte in the first 8 KB).

Pipeline: fence split → `yaml.parse` frontmatter → `remark-parse` body → walk mdast headings → slice section text by position → `readdir` inventory. Each step is its own tested pure function; `parseSkill(dir)` composes them. `parseSkill` and the profile loader are the only places lib touches the filesystem, both read-only.

## §3 Rule engine and seed rules

```ts
type Rule = {
  id: string
  check: (skill: ParsedSkill, ctx: RuleContext) => RuleFinding[]
}
type RuleContext = {
  options: Record<string, unknown>   // resolved from the profile entry for this rule
  anatomy: AnatomyTable              // the profile's anatomy alias table
}
type RuleFinding = {
  message: string
  file: string                       // relative to skill dir, usually "SKILL.md"
  line: number | null
  severity?: 'error' | 'warn'        // optional per-finding override (see FM01)
}
type Finding = RuleFinding & { ruleId: string; severity: 'error' | 'warn' }
```

**Engine** (`runRules`): iterate the registry; run each rule that has a profile entry; stamp `ruleId` and severity from the profile (normalizing the `"error"` string form and the `{ severity, options }` object form); respect a rule's per-finding severity override; sort findings by file, then line (null lines last), then ruleId. Profile entries without an implementation (22 of 28 at M2) are silently skipped — the catalog leads implementation by design. Rules never see each other and never touch disk.

### Seed rules (exact semantics)

**FM01 — frontmatter well-formed** (error)
- Fences absent or unterminated → error finding (cite `frontmatter.error.line` when present).
- YAML parse failure → error finding citing the parser-captured line.
- `name` or `description` missing, not a string, or empty/whitespace → one error finding each.
- Any field outside `{name, description, version, compatibility, license, allowed-tools}` → one finding per field with `severity: 'warn'` override (the catalog's "unknown fields warned"). FM01 is the only seed rule using the override.

**FM02 — name discipline** (error)
- `name` must match `^[a-z0-9]+(-[a-z0-9]+)*$`, be ≤64 chars, and equal `dirName`. One finding per violated condition. Skipped entirely (no findings) when `name` is absent — that is FM01's finding, not FM02's.

**FM04 — trigger-first third-person description** (error)
- First-person check: `/\bI\b/` (case-sensitive) or `/\b(my|me|we|our|mine|us)\b/i` in the description → error finding.
- Trigger-phrase check: the description must contain at least one pattern from `options.triggerPatterns` (case-insensitive substring match) → otherwise one error finding naming the expected patterns.
- Skipped when `description` is absent/empty (FM01's finding).
- Requires this amendment to `profiles/default.yaml` (calibration tunes the list as data, not code):

```yaml
FM04: { severity: error, options: { triggerPatterns: ["use when", "use for", "use if", "use this", "invoke when", "when the user"] } }
```

**CT03 — worked example present** (error)
- Presence of an Examples section per the anatomy alias table: some section's `normalized` heading equals the canonical name or an alias (M1 §1 matching: normalize, h2/h3 only, presence = ≥1 match, no content sniffing).
- Implemented as `anatomyPresence('examples')` from `rules/anatomy.ts`, so CT01/CT02/CT04–CT07 at M3 are one-liners. Content quality ("trigger lists don't count") remains M3+ per M1's presence-vs-quality layering.
- Finding has `line: null` (absence has no location).

**ST02 — sibling references resolve** (error)
- Extract mdast `link` and `image` node targets from the body. Ignore targets with a URL scheme (`http:`, `https:`, `mailto:`, etc.) and pure-fragment targets (`#…`). Strip any `#fragment`, URL-decode.
- Any remaining target containing `../` → error finding.
- Otherwise the target must exist (file or directory) inside the skill dir → else error finding citing the link's line.
- M2 scope is link/image nodes only; sniffing paths from inline code spans is deferred to M3 (too false-positive-prone to ship uncalibrated).

**PH01 — no unfilled scaffold placeholders** (error)
- The literal token from `options.token` (default `TODO(shakespii):`) anywhere in SKILL.md (frontmatter and body) or in any sibling text file → one error finding **per occurrence**, with file and line.
- Sibling scanning uses `FileEntry.text` from the inventory (§2); entries with `text: null` (binary/oversized) are skipped. The rule itself never touches disk.
- This rule makes a fresh `init` lint RED: the untouched scaffold yields exactly 18 findings (8 SKILL.md + 9 `evals/evals.json` + 1 `README.md`).

## §4 CLI surface

### `shakespii init <name> [--description "…"]`

Per M1 spec §3.4, unchanged: validate `<name>` against the FM02 regex first (reject with the FM02 message, exit 2); refuse to overwrite an existing directory (exit 2); copy `templates/skill/` verbatim into `./<name>/` with `{{name}}` substitution only; `--description` replaces the placeholder description when given. Success output states the scaffold is intentionally lint-RED and prints the next step: `shakespii lint <name>`.

### `shakespii lint <path> [--json]`

`<path>` is a skill directory; a path ending in `SKILL.md` is accepted and resolved to its parent. Single path only at M2 — corpus sweeps are a shell loop (`--corpus` arrives with the XS rules at M3). Zero LLM calls; deterministic: same input produces byte-identical output.

**Exit codes** (both output modes):

| Code | Meaning |
|---|---|
| 0 | Lint ran; no error-severity findings (warnings allowed) |
| 1 | Lint ran; at least one error finding |
| 2 | Usage/IO failure: bad args, no readable SKILL.md at path, profile unreadable |

**Pretty output** (default) — ESLint-style; column is fixed at 1 in M2 (findings carry lines only):

```
/Users/vuphan/.claude/skills/foo/SKILL.md
   2:1  error  description lacks a trigger phrase ("use when", …)  FM04
   1:1  warn   unknown frontmatter field "author"                  FM01
  40:1  error  unfilled scaffold placeholder "TODO(shakespii):"    PH01

✖ 3 problems (2 errors, 1 warning)
```

A clean run prints `✔ 0 problems`. Findings with `line: null` print without the `line:col` prefix.

**`--json` output** — the normative contract M2.5's companion skill consumes; this section is its schema definition:

```json
{
  "version": 1,
  "skill": { "dir": "/abs/path/foo", "name": "foo" },
  "profile": "default",
  "summary": { "errors": 2, "warnings": 1 },
  "findings": [
    { "ruleId": "FM04", "severity": "error", "file": "SKILL.md", "line": 2, "message": "…" }
  ]
}
```

- `skill.name` is the frontmatter name, or `null` when unparseable.
- `findings` sorted by file, then line (null last), then ruleId. `line` is a number or `null`.
- JSON mode writes **only** this object to stdout; all diagnostics go to stderr — `shakespii lint . --json | jq` always works.
- `version` bumps only on breaking shape changes; additive fields do not bump it.

### Global flags

`--help` and `--version` (reads package.json). **Not shipping at M2** (YAGNI until a consumer exists): `--profile` override flag, `--fix`, multiple paths, inline-suppression handling (M3).

## §5 Testing and calibration

TDD is non-negotiable (STRATEGY D4): every rule lands as a failing fixture test first. Fixtures are real skill directories:

```
tests/fixtures/
  minimal-pass/           # clean skill — all six seeds green (the control)
  fm01-no-frontmatter/  fm01-bad-yaml/  fm01-unknown-field/
  fm02-bad-name/  fm02-dir-mismatch/
  fm04-first-person/  fm04-no-trigger/
  ct03-no-examples/  ct03-alias-heading/   # "## Worked example" must count via alias
  st02-broken-link/  st02-parent-escape/
  ph01-one-token/
```

Three test tiers:

1. **Unit** — parser, profile loader, each rule, engine: import `src/lib/` directly, run on fixtures, assert exact findings (rule ID, line, message substring).
2. **The M1↔M2 keystone test** — lint `templates/skill/` itself: must produce exactly 18 PH01 errors (8 SKILL.md + 9 evals.json + 1 README) and exit 1; and `init` output must byte-match the template modulo `{{name}}` substitution. This welds the RED-by-design contract shut — the scaffold cannot drift without a test failing.
3. **CLI integration (few)** — `Bun.spawn` the real binary on fixtures: exit codes 0/1/2, `--json` parses and matches the §4 schema, stdout purity in JSON mode. Plus a profile-consistency test loading the real `profiles/default.yaml` (7 anatomy sections, 28 rules) — the permanent replacement for M1's ephemeral consistency script.

**Calibration protocol** (M2's final gate):

- `scripts/calibrate.ts` sweeps the dogfood corpus (`~/.claude/skills/*` and the superpowers 6.1.1 skill directories), runs lint with `--json` per skill, and aggregates per-rule counts. **Read-only** — never edits installed skills.
- Counts are checked against the audit's predictions (docs/AUDIT-2026-07-07.md): CT03 fires on ~10/13 personal skills; FM04 stays near-silent on superpowers (13/14 start "Use when") and bites the personal corpus; PH01 fires nowhere.
- Every mismatch is adjudicated one of three ways: rule-logic bug (fix code), miscalibrated threshold/pattern (edit profile options, e.g. FM04's trigger list), or a genuine finding the audit missed (document it).
- Results and adjudications land in `docs/CALIBRATION-M2.md` (+ canonical copy in `~/.ai-pref-nsync/local-docs/ai-shakespii/knowledge-references/`).

## Exit criteria

- [ ] `bun test` green; all six seed rules have failing-first fixture tests
- [ ] Keystone test locks the scaffold contract: exactly 18 PH01 errors on `templates/skill/`, exit 1; `init` output byte-matches the template modulo `{{name}}`
- [ ] `bun link` exposes a working `shakespii` from an arbitrary cwd (templates/profile resolve from package root)
- [ ] `profiles/default.yaml` amended with the FM04 options block exactly as in §3
- [ ] `docs/CALIBRATION-M2.md` committed with per-rule counts and every deviation from audit predictions adjudicated
- [ ] §4 `--json` schema is implemented as written (it is the M2.5 contract)

## Out of scope for M2

The remaining 22 catalog rules; `--corpus` mode and XS rules; config-file profile overrides and `--profile`; inline suppressions; score model (open decision); `--fix`; multiple lint paths; npm publish (M5); the M2.5 companion skill itself (next milestone, consumes this CLI).
