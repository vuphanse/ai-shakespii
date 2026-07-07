# M1 — Phase-1 Specification design

**Date:** 2026-07-07 · **Status:** implemented — exit criteria verified 2026-07-07
**Milestone:** M1 (docs/ROADMAP.md) — skill anatomy spec, default lint profile, scaffold template design
**Depends on:** STRATEGY.md D1–D5, LINT-RULES.md v0, AUDIT-2026-07-07.md, REFERENCE-SKILL-CRITIQUE.md

## Context and goals

M1 turns the strategy into concrete, buildable specifications. Three deliverables from the roadmap:

1. **Skill anatomy spec** — map the seven ai-shakespii anatomy elements (Intent / Inputs / Preconditions / Procedure / Output / Examples / Anti-patterns) onto standard SKILL.md section conventions: exact heading names, alias sets, required vs optional.
2. **Default lint profile** — finalize STRATEGY D4's adjudications as concrete config.
3. **Scaffold template** — the files `shakespii init <name>` generates.

## Decisions made during brainstorm

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Anatomy ↔ heading matching | **Alias-based semantic sections** — canonical heading + alias table per section; linter accepts aliases, scaffold emits canonical names | Strict canonical headings (whole dogfood corpus instantly fails, calibration becomes all-noise); frontmatter-declared mapping (nonstandard field, boilerplate, YAGNI) |
| Fresh scaffold lint state | **RED by design** — placeholders are lint errors until authored; init = failing test, authoring = making it green | Green out of the box (gate gameable, unedited scaffold installable); placeholder-as-warning (unenforced rules don't hold — audit evidence) |
| Profile config format | **YAML** — matches frontmatter syntax authors already know; comments carry provenance vintages; all candidate runtimes parse it | JSON (no comments — provenance needs them); TOML (foreign to this ecosystem) |
| Deliverable shape | **Spec-as-data + thin prose** — this doc explains rationale; everything checkable lives in `profiles/default.yaml` and `templates/skill/`, which M2 loads verbatim | Prose-only spec (M2 re-encodes by hand; spec and code drift — the exact defect we criticized in writing-skills); three separate specs (tightly coupled content, invites inconsistency) |

## 1. Skill anatomy spec (the content contract)

### 1.1 Frontmatter contract

| Field | Status | Constraint | Backing rule |
|---|---|---|---|
| `name` | required | kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤64 chars, equals directory name | FM02 (error) |
| `description` | required | third person, trigger-first ("Use when…" or equivalent), concrete searchable keywords; warn >500 chars, error >1024 | FM03 (tiered), FM04 (error) |
| `version` | required | semver | FM05 (error) |
| `compatibility`, `license`, `allowed-tools` | allowed extras | — | FM01 |
| any other field | warned | unknown-field warning | FM01 |

### 1.2 Body section mapping

Each anatomy element defines: a **canonical heading** (what the scaffold emits), an **alias set** (what the linter additionally accepts, sourced from ecosystem conventions documented in AUDIT Part 2), a **requirement level**, and a **backing rule**.

| Anatomy element | Canonical | Aliases | Level | Rule |
|---|---|---|---|---|
| Intent | `## Intent` | Overview, Purpose, Why | required — warn | CT06 (new) |
| Inputs | `## Inputs` | Arguments, Parameters | encouraged — warn | CT04 |
| Preconditions | `## Preconditions` | Requirements, Prerequisites, Dependencies | required — error | CT01 |
| Procedure | `## Procedure` | Process, The Process, Workflow, Steps, Checklist, Usage | required — error | CT07 (new) |
| Output | `## Output` | Output contract, Output format, Deliverable, Handback, Report format | required — error | CT02 |
| Examples | `## Examples` | Example, Worked example, Before/After | required — error | CT03 |
| Anti-patterns | `## Anti-patterns` | Common Mistakes, Red Flags, Pitfalls, When NOT to Use | encouraged — warn | CT05 |

### 1.3 Matching semantics (deterministic)

- Normalize heading text: strip markdown emphasis and trailing punctuation, collapse whitespace, lowercase.
- Match normalized text against canonical + aliases at heading levels h2 and h3.
- Section **presence** = at least one matching heading. Multiple matches are allowed; their content is treated as the union (no duplicate-heading finding in v0).
- No content sniffing for presence — heading-based only. (A bolded "Core principle:" paragraph without an Overview/Intent heading does not satisfy CT06.)
- Section order is not enforced. The scaffold emits the recommended order (table order above).

### 1.4 Presence vs content quality — two layers

The anatomy spec governs **presence** (is the section there?). **Content quality** within a section is separate rule logic implemented from M2 onward:

- CT03: the Examples section must contain at least one concrete input→output worked example; trigger-phrase lists do not count.
- CT01: the Preconditions section must enumerate every external dependency (binaries, env vars, network, files, path-layout assumptions).
- CT02: the Output section's contract must be resolvable from files inside the skill directory.

A section that exists but contains only a PH01 placeholder fails its content-quality check.

### 1.5 New rules (catalog amendments)

- **CT06 — Intent section present (warn).** Evidence: the reference corpus universally opens with `## Overview` carrying a bolded `Core principle:` (AUDIT Part 2, structure conventions); a skill with no stated intent cannot be reviewed for single responsibility.
- **CT07 — Procedure section present (error).** Evidence: every audited skill is procedural; the audit's best-engineered skill (ai-whisper-plan-execution) is praised precisely for explicit gating and procedure (AUDIT Part 1, standouts). The generous alias set keeps error defensible; M2 calibration demotes to warn if it over-fires on the dogfood corpus.
- **PH01 — no unfilled scaffold placeholders (error).** Detects the literal token `TODO(shakespii):` anywhere in SKILL.md (frontmatter values and body) and in sibling scaffold files. Evidence: this spec's RED-by-design decision — without PH01, an unedited scaffold is installable and lint-clean stops meaning authored.

## 2. Default lint profile — `profiles/default.yaml`

The profile is the single machine-readable source of truth. M2's linter loads it at runtime; no threshold, severity, or alias lives in code. Complete content:

```yaml
# profiles/default.yaml — shakespii default lint profile
# Adjudicated choices are pinned to the reference-corpus vintages they were
# calibrated against (see docs/REFERENCE-SKILL-CRITIQUE.md, "pinned authorities").
profile: default
provenance:
  superpowers: 6.1.1          # description style, size furniture, ST05 pattern
  skill-creator: 2026-07      # eval schemas, trigger-accuracy design
  audit: docs/AUDIT-2026-07-07.md

anatomy:
  intent:
    canonical: Intent
    aliases: [Overview, Purpose, Why]
    level: warn               # CT06
  inputs:
    canonical: Inputs
    aliases: [Arguments, Parameters]
    level: warn               # CT04
  preconditions:
    canonical: Preconditions
    aliases: [Requirements, Prerequisites, Dependencies]
    level: error              # CT01
  procedure:
    canonical: Procedure
    aliases: [Process, The Process, Workflow, Steps, Checklist, Usage]
    level: error              # CT07
  output:
    canonical: Output
    aliases: [Output contract, Output format, Deliverable, Handback, Report format]
    level: error              # CT02
  examples:
    canonical: Examples
    aliases: [Example, Worked example, Before/After]
    level: error              # CT03
  anti-patterns:
    canonical: Anti-patterns
    aliases: [Common Mistakes, Red Flags, Pitfalls, When NOT to Use]
    level: warn               # CT05

rules:
  # FM — frontmatter
  FM01: error                 # frontmatter well-formed; unknown fields warned
  FM02: error                 # name discipline, = dir name
  FM03: { severity: warn, options: { warnChars: 500, maxChars: 1024 } }
  FM04: error                 # trigger-first third-person description
  FM05: error                 # version required, semver — D4 flagship
  # CT — content contract (severities mirror the anatomy table above)
  CT01: error                 # preconditions enumerate every external dependency
  CT02: error                 # output contract resolvable inside the skill dir
  CT03: error                 # ≥1 concrete worked example
  CT04: warn                  # inputs declared
  CT05: warn                  # anti-patterns / failure modes present
  CT06: warn                  # intent present (new)
  CT07: error                 # procedure present (new)
  # ST — structure
  ST01: { severity: warn, options: { maxWords: 2000, maxLines: 500, hardMaxWords: 3000 } }
  ST02: error                 # referenced sibling files exist; one level deep; no ../
  ST03: { severity: warn, options: { tocMinLines: 100 } }
  ST04: error                 # no @-prefixed force-load links
  ST05: warn                  # Iron-Law blocks require rationalization table + red flags
  # HY — hygiene
  HY01: error                 # forward-slash paths only
  HY02: error                 # no machine-specific absolute paths
  HY03: warn                  # no time-sensitive phrasing outside Old-patterns blocks
  HY04: warn                  # rot-prone embedded facts need version + last-reviewed
  HY05: warn                  # executable commands inside code fences
  HY06: warn                  # quantitative claims eval-backed or marked unverified
  # XS — cross-skill (require --corpus context)
  XS01: { severity: warn, options: { minLines: 15, minSkills: 2 } }
  XS02: { severity: warn, options: { similarity: 0.8 } }   # calibrate in M3 vs kickoff-clone evidence
  # TR — trigger & eval (harness-backed)
  TR01: { severity: warn, options: { minCases: 3 } }
  TR02: { severity: warn, options: { minQueries: 16, requireNearMissNegatives: true } }
  # PH — placeholders
  PH01: { severity: error, options: { token: "TODO(shakespii):" } }
```

### 2.1 Config semantics

- **Rule entry shape:** `RULE_ID: severity` shorthand, or `{ severity, options }` full form. Valid severities: `error`, `warn`, `off`.
- **Tiered escalation:** the configured severity is the base; a rule may escalate a finding to error when a `hardMax*`/`max*` hard option is breached (FM03 errors past `maxChars`, ST01 past `hardMaxWords`). Stated here once; applies to any tiered rule.
- **Per-project overrides:** a `shakespii.config.yaml` at the project root with `extends: default` plus sparse overrides. Merge = deep-merge with **arrays replaced wholesale** (to add one Procedure alias, copy the full list and append). No additive array magic — deterministic, no surprise inheritance.
- **Fail-fast loading:** unknown rule ID in an override, unknown `extends` target, or malformed YAML is a hard error naming the offending key.
- **Inline suppression (defined now, implemented M3):** `<!-- shakespii-disable RULE_ID: reason -->` with mandatory reason text. Suppression without justification is the unenforced-advice disease in miniature.
- **Provenance block:** records which reference-corpus vintages the adjudications were calibrated against. M1–M2: bookkeeping only. M3+: staleness check comparing pinned vintages against the installed corpus, prompting deliberate recalibration.
- **Deferred:** the score model (severity counts vs 0–100) remains an open ROADMAP decision — the profile encodes severities only. TR02's harness parameters beyond the lint-visible check (60/40 train/held-out split, 3 reps, pass threshold) belong to M4 harness config, not the lint profile.

## 3. Scaffold template — `templates/skill/`

```
templates/skill/
├── SKILL.md          → <name>/SKILL.md
├── README.md         → <name>/README.md
└── evals/
    └── evals.json    → <name>/evals/evals.json
```

### 3.1 `templates/skill/SKILL.md`

```markdown
---
name: {{name}}
description: "TODO(shakespii): Use when <trigger>… — third person, concrete searchable keywords; do not summarize the workflow."
version: 0.1.0
---

# {{name}}

## Intent

TODO(shakespii): one or two sentences — what capability this skill provides and why it exists.

## Inputs

TODO(shakespii): what the skill consumes — arguments, files, context. Mark which are optional.

## Preconditions

TODO(shakespii): every external dependency — binaries on PATH, env vars, network access, files, path-layout assumptions. If it can fail before step 1, it belongs here.

## Procedure

TODO(shakespii): numbered steps. Calibrate freedom — prose for judgment steps, exact commands for fragile ones.

## Output

TODO(shakespii): the deliverable's shape and contract, resolvable from files inside this skill directory — never "obey the handoff format" pointing at unshipped documents.

## Examples

TODO(shakespii): at least one concrete input→output worked example. Trigger-phrase lists do not count.

## Anti-patterns

TODO(shakespii): common mistakes, rationalizations, and when NOT to use this skill.
```

### 3.2 `templates/skill/evals/evals.json`

Three skeleton cases — TR01's minimum made tangible; content stays placeholder so PH01 keeps the skill RED until authored. Shape follows the skill-creator schema (STRATEGY D3).

```json
{
  "skill": "{{name}}",
  "evals": [
    {
      "id": "{{name}}-case-1",
      "prompt": "TODO(shakespii): realistic user request that should trigger this skill",
      "expected_output": "TODO(shakespii): what good output looks like",
      "files": [],
      "expectations": ["TODO(shakespii): one checkable assertion about the output"]
    },
    {
      "id": "{{name}}-case-2",
      "prompt": "TODO(shakespii): a second scenario — vary the input shape",
      "expected_output": "TODO(shakespii):",
      "files": [],
      "expectations": ["TODO(shakespii):"]
    },
    {
      "id": "{{name}}-case-3",
      "prompt": "TODO(shakespii): an edge case or near-miss the skill must handle",
      "expected_output": "TODO(shakespii):",
      "files": [],
      "expectations": ["TODO(shakespii):"]
    }
  ]
}
```

### 3.3 `templates/skill/README.md`

```markdown
# {{name}}

TODO(shakespii): one-paragraph summary for humans browsing the repo.

## Develop

    shakespii lint .
    shakespii test .
```

### 3.4 `shakespii init` behavior (spec for M2)

1. Validate `<name>` against FM02 (same rule, same message the linter emits) **before** creating anything; reject invalid names.
2. Refuse to run if the target directory already exists — no overwrites, no merging.
3. Copy `templates/skill/` to `./<name>/`, substituting `{{name}}`. Substitution is plain string replacement; no template logic.
4. `--description "<text>"` replaces the description placeholder (everything inside the quotes) with the given text; all other placeholders remain.
5. No `references/` or `scripts/` directories scaffolded — authors add them when needed (YAGNI).

PH01 emits one finding per placeholder occurrence. A freshly-scaffolded skill linted with the MVP seed set therefore yields: 18 PH01 errors (8 in SKILL.md — 1 frontmatter + 7 body; 9 in evals.json; 1 in README.md), FM04 error (placeholder description is not trigger-phrased), CT03 error (Examples content is placeholder). Green is reachable only through authoring — init is the failing test, writing the skill makes it pass.

### 3.5 Placeholder design principles

- **One token, one rule:** `TODO(shakespii):` is the only placeholder mechanism — it works in YAML frontmatter values, markdown body, and JSON strings alike. (An HTML-comment marker was considered and dropped: comments cannot live in YAML frontmatter, and two mechanisms for one concept is one too many.)
- **Placeholders teach the contract:** each TODO's text is authoring guidance derived from its backing lint rule — fill in what the placeholder asks for and the corresponding rule goes green. The scaffold is the documentation.

## 4. Repo layout and M2 consumption contract

### 4.1 Layout after M1

```
ai-shakespii/
├── docs/
│   ├── LINT-RULES.md            # amended: +CT06 +CT07 +PH01, seed set updated
│   ├── ROADMAP.md               # amended: companion-skill item after M2
│   └── specs/
│       └── 2026-07-07-m1-phase1-specification-design.md   # this doc (mirror)
├── profiles/
│   └── default.yaml             # section 2
└── templates/
    └── skill/                   # section 3
```

Canonical spec copy: `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/` (docs workflow); the repo copy is the synced mirror.

### 4.2 How M2 consumes the artifacts

- The linter **loads** `profiles/default.yaml` (bundled with the CLI) at runtime. Rule implementations read severities, options, and the anatomy table from it. No threshold or alias is hardcoded.
- `init` **copies** `templates/skill/` verbatim plus substitution. No markdown is generated from code strings.
- First fixture tests fall out of the contract:
  1. **Catalog↔profile consistency** — every rule ID in LINT-RULES.md has an entry in `default.yaml` and vice versa.
  2. **Scaffold RED loop** — `init` output linted with the seed set produces exactly the expected finding set (rule IDs and counts).

### 4.3 Doc amendments bundled into M1 implementation

1. **LINT-RULES.md** — add CT06, CT07, PH01 with evidence citations (section 1.5); amend the MVP seed set to FM01, FM02, FM04, CT03, ST02, **PH01**.
2. **ROADMAP.md** — add the `using-shakespii` companion skill as an explicit deliverable immediately after M2 (agent-first interface decision, confirmed at kickoff): the thin skill that teaches agents the audit and authoring loops; itself linted and tested by shakespii.
3. **README.md** — one line each for `profiles/` and `templates/`.

## Exit criteria

- [x] This spec committed (repo mirror + canonical copy).
- [x] `profiles/default.yaml` exists in the repo exactly as specified in section 2.
- [x] `templates/skill/` exists in the repo exactly as specified in section 3.
- [x] LINT-RULES.md, ROADMAP.md, README.md amendments applied.
- [x] Consistency pass: every profile rule ↔ catalog entry; every scaffold placeholder maps to a backing rule.

## Out of scope for M1

- Any executable code (parser, CLI, rule implementations) — M2, blocked on the runtime-language decision (user's to make).
- Inline suppression implementation (M3), provenance staleness check (M3+), score model (open decision), harness parameters beyond lint-visible eval checks (M4).
