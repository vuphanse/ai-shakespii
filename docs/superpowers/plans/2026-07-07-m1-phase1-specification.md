# M1 Phase-1 Specification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land and verify every M1 deliverable from the approved spec — machine-readable lint profile, init scaffold templates, doc amendments — and close out the milestone's exit criteria.

**Architecture:** M1 is spec-as-data: the checkable artifacts (`profiles/default.yaml`, `templates/skill/`) are literal files the M2 CLI will load verbatim, and the spec (`docs/specs/2026-07-07-m1-phase1-specification-design.md`) is their single source of truth. Commit `58625e5` already landed first versions of the artifacts and doc amendments during a review-fix cycle, so every task here is verification-first: extract the expected content from the spec, diff against the repo, correct any mismatch, then close out. This is the docs-and-data analog of TDD — the diff/check command is the test; a mismatch is RED; the corrective copy is the implementation; the re-run is GREEN.

**Tech Stack:** Markdown, YAML, JSON. Verification via `awk`/`diff`/`grep` and one ephemeral Python 3 script (stdlib + PyYAML if present). No application code — M1 ships zero executable source.

## Global Constraints

- **No executable code lands in the repo.** Runtime language is an open user decision (`docs/ROADMAP.md` Open decisions); verification scripts run from a temp dir and are never committed.
- **Placeholder token is the literal string `TODO(shakespii):`** — exactly this spelling, everywhere (spec §3.5).
- **Profile ↔ catalog parity:** `profiles/default.yaml` must contain exactly the 28 rule IDs present in `docs/LINT-RULES.md` (FM01–FM05, CT01–CT07, ST01–ST05, HY01–HY06, XS01–XS02, TR01–TR02, PH01), no more, no fewer.
- **Standard Agent Skills format only** (SKILL.md, YAML frontmatter `name`+`description`; spec at agentskills.io). Never a parallel format (STRATEGY.md D1).
- **Docs live in two places:** canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/` (subdirs `specs/`, `plans/`, `knowledge-references/`, `brainstorm/`) and the repo `docs/` mirror. Any task that edits a doc must sync both.
- **Working directory:** `/Users/vuphan/Dev/ai-shakespii`. All commands below run from the repo root. Commit after every task that changes files.

---

### Task 1: Verify `profiles/default.yaml` matches spec §2 exactly

**Files:**
- Read: `docs/specs/2026-07-07-m1-phase1-specification-design.md` (§2 fenced `yaml` block — the only ```yaml fence in the doc)
- Verify (modify only on mismatch): `profiles/default.yaml`

**Interfaces:**
- Consumes: the approved spec (already committed, `e082077`) and the landed profile (`58625e5`).
- Produces: a byte-exact `profiles/default.yaml` that Task 4's consistency script and M2's config loader can trust.

- [ ] **Step 1: Extract the expected profile from the spec (the "test")**

```bash
WORK=$(mktemp -d)
awk 'f && /^```$/{exit} f{print} /^```yaml$/{f=1}' \
  docs/specs/2026-07-07-m1-phase1-specification-design.md > "$WORK/profile-expected.yaml"
wc -l "$WORK/profile-expected.yaml"
```

Expected: around 78 lines extracted (non-zero; if 0 lines, the awk found no ```yaml fence — stop and check the spec file path).

- [ ] **Step 2: Diff against the repo file**

```bash
diff "$WORK/profile-expected.yaml" profiles/default.yaml && echo PROFILE-MATCH
```

Expected: `PROFILE-MATCH` and no diff output.

- [ ] **Step 3: Only if Step 2 shows a diff — overwrite the repo file with the spec's version and re-run**

```bash
cp "$WORK/profile-expected.yaml" profiles/default.yaml
diff "$WORK/profile-expected.yaml" profiles/default.yaml && echo PROFILE-MATCH
```

Expected: `PROFILE-MATCH`.

- [ ] **Step 4: Only if Step 3 ran — commit the correction**

```bash
git add profiles/default.yaml
git commit -m "fix: align profiles/default.yaml byte-exact with M1 spec section 2"
```

If Step 2 matched immediately, this task commits nothing.

### Task 2: Verify `templates/skill/` matches spec §3 exactly

**Files:**
- Read: `docs/specs/2026-07-07-m1-phase1-specification-design.md` (§3.1 first ```markdown block = SKILL.md; §3.2 the only ```json block = evals.json; §3.3 second ```markdown block = README.md)
- Verify (modify only on mismatch): `templates/skill/SKILL.md`, `templates/skill/evals/evals.json`, `templates/skill/README.md`

**Interfaces:**
- Consumes: spec §3 template blocks; landed templates from `58625e5`.
- Produces: byte-exact scaffold files that `shakespii init` (M2) copies verbatim and Task 4 counts placeholders in.

- [ ] **Step 1: Extract all three expected templates from the spec**

```bash
WORK=$(mktemp -d)
SPEC=docs/specs/2026-07-07-m1-phase1-specification-design.md
awk 'f && /^```$/{exit} f{print} /^```markdown$/{n++; if(n==1) f=1}' "$SPEC" > "$WORK/skill-expected.md"
awk 'f && /^```$/{exit} f{print} /^```json$/{f=1}' "$SPEC" > "$WORK/evals-expected.json"
awk 'f && /^```$/{exit} f{print} /^```markdown$/{n++; if(n==2) f=1}' "$SPEC" > "$WORK/readme-expected.md"
wc -l "$WORK"/skill-expected.md "$WORK"/evals-expected.json "$WORK"/readme-expected.md
```

Expected: three non-empty files (roughly 39, 27, and 8 lines respectively). Zero lines for any file means the fence-counting missed — stop and inspect the spec's §3 fences before proceeding.

- [ ] **Step 2: Diff each against the repo**

```bash
diff "$WORK/skill-expected.md"  templates/skill/SKILL.md          && echo SKILL-MATCH
diff "$WORK/evals-expected.json" templates/skill/evals/evals.json && echo EVALS-MATCH
diff "$WORK/readme-expected.md"  templates/skill/README.md        && echo README-MATCH
```

Expected: all three `*-MATCH` lines, no diff output.

- [ ] **Step 3: Only if any diff — overwrite the mismatched file(s) with the spec's version and re-run Step 2**

```bash
cp "$WORK/skill-expected.md"   templates/skill/SKILL.md
cp "$WORK/evals-expected.json" templates/skill/evals/evals.json
cp "$WORK/readme-expected.md"  templates/skill/README.md
```

(Copy only the files that diffed; re-run Step 2 and require all three MATCH lines.)

- [ ] **Step 4: Only if Step 3 ran — commit the correction**

```bash
git add templates/skill/
git commit -m "fix: align templates/skill/ byte-exact with M1 spec section 3"
```

### Task 3: Verify the doc amendments (LINT-RULES, ROADMAP, README)

**Files:**
- Verify (modify only on mismatch): `docs/LINT-RULES.md`, `docs/ROADMAP.md`, `README.md`

**Interfaces:**
- Consumes: amendments landed in `58625e5`; spec §1.5 (new rules) and §4.3 (amendment list).
- Produces: catalog rows CT06/CT07/PH01 and the PH01 seed set that Task 4's parity check reads; the M2.5 roadmap item; README artifact pointers.

- [ ] **Step 1: Check every required amendment with one grep battery**

```bash
grep -c "^| CT06 | warn |"  docs/LINT-RULES.md   # expect 1
grep -c "^| CT07 | error |" docs/LINT-RULES.md   # expect 1
grep -c "^| PH01 | error |" docs/LINT-RULES.md   # expect 1
grep -c "FM01, FM02, FM04, CT03, ST02, PH01" docs/LINT-RULES.md   # expect 1 (seed set)
grep -c "^## M2.5" docs/ROADMAP.md               # expect 1 (companion-skill milestone)
grep -c "profiles/default.yaml" README.md        # expect >=1
grep -c "templates/skill/" README.md             # expect >=1
```

Expected: every command prints the count shown in its comment. Any `0` is a missing amendment.

- [ ] **Step 2: Only if a count is 0 — apply the missing amendment from the spec**

Authoritative content for each possible gap (apply only the missing ones, then re-run Step 1 until all counts pass):

CT06/CT07 rows — append to the CT table in `docs/LINT-RULES.md`:

```
| CT06 | warn | Intent section present (canonical `## Intent`; aliases: Overview, Purpose, Why) | Reference corpus universally opens with `## Overview` + bolded `Core principle:` (audit Part 2); a skill with no stated intent can't be reviewed for single responsibility |
| CT07 | error | Procedure section present (aliases: Process, The Process, Workflow, Steps, Checklist, Usage) | Every audited skill is procedural; the standout (ai-whisper-plan-execution) is praised precisely for explicit gating and procedure (audit Part 1). Generous alias set keeps error defensible; M2 calibration may demote |
```

PH section — insert before `## TR — Trigger & eval (harness-backed, not static)`:

```
## PH — Placeholders

| ID | Severity | Rule | Evidence |
|---|---|---|---|
| PH01 | error | No unfilled scaffold placeholders: the literal token `TODO(shakespii):` anywhere in SKILL.md (frontmatter values and body) or sibling scaffold files | RED-by-design scaffold decision (M1 spec §3.5): without PH01 an unedited scaffold is installable and lint-clean stops meaning authored |
```

Seed-set line — the `## Seed set for MVP` body must read: `FM01, FM02, FM04, CT03, ST02, PH01 — highest signal, fully static, real offenders in the dogfood corpus to test against. PH01 is in the seed set because without it the init→lint RED loop doesn't exist at MVP (M1 spec §3.4).`

ROADMAP — insert between the M2 and M3 sections of `docs/ROADMAP.md`:

```
## M2.5 — `using-shakespii` companion skill

Agent-first interface decision (docs/REFERENCE-SKILL-CRITIQUE.md): humans instruct agents; agents drive the CLI. The thin operational skill ships with the MVP, not at M5.

- [ ] Companion skill teaching agents the audit loop (`lint --corpus` → interpret findings → fix → re-lint) and the authoring loop (init → draft → lint-loop until clean → evals → present)
- [ ] Dogfood: the companion skill itself passes `shakespii lint` and ships its own evals
```

README — insert after the canonical-copies paragraph of `README.md`:

```
## Machine-readable artifacts (spec-as-data)

- `profiles/default.yaml` — the default lint profile: anatomy alias table, rule severities and options, provenance vintages. Loaded verbatim by the CLI from M2 on; no threshold or alias lives in code.
- `templates/skill/` — the literal scaffold `shakespii init` copies (RED-by-design `TODO(shakespii):` placeholders).
```

- [ ] **Step 3: Only if Step 2 changed files — sync canonical copies and commit**

```bash
cp docs/LINT-RULES.md ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/LINT-RULES.md
cp docs/ROADMAP.md    ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
git add docs/LINT-RULES.md docs/ROADMAP.md README.md
git commit -m "fix: restore missing M1 doc amendments per spec section 4.3"
```

### Task 4: Run the full consistency pass (spec exit criterion 5)

**Files:**
- Read: `docs/LINT-RULES.md`, `profiles/default.yaml`, `templates/skill/*` (no modifications expected)

**Interfaces:**
- Consumes: the verified artifacts from Tasks 1–3.
- Produces: recorded proof (terminal output) that catalog↔profile parity and placeholder counts hold — quoted in Task 5's close-out commit message.

- [ ] **Step 1: Run the consistency script (ephemeral — from a temp dir, never committed)**

```bash
cd /Users/vuphan/Dev/ai-shakespii && python3 - <<'EOF'
import re, json

catalog = open('docs/LINT-RULES.md').read()
catalog_ids = set(re.findall(r'^\| ((?:FM|CT|ST|HY|XS|TR|PH)\d{2}) \|', catalog, re.M))
profile = open('profiles/default.yaml').read()
rules_block = profile.split('rules:')[1]
profile_ids = set(re.findall(r'^  ((?:FM|CT|ST|HY|XS|TR|PH)\d{2}):', rules_block, re.M))
assert catalog_ids == profile_ids, (sorted(catalog_ids - profile_ids), sorted(profile_ids - catalog_ids))
assert len(catalog_ids) == 28, len(catalog_ids)
print("rule parity OK:", len(catalog_ids), "ids match 1:1")

for f, expect in [('templates/skill/SKILL.md', 8),
                  ('templates/skill/evals/evals.json', 9),
                  ('templates/skill/README.md', 1)]:
    n = open(f).read().count('TODO(shakespii):')
    assert n == expect, (f, n, expect)
    print(f"placeholders OK: {f} = {n}")

d = json.load(open('templates/skill/evals/evals.json'))
assert len(d['evals']) == 3
print("evals.json OK: valid JSON, 3 cases")

try:
    import yaml
    y = yaml.safe_load(profile)
    assert len(y['anatomy']) == 7 and len(y['rules']) == 28
    print("yaml OK: 7 anatomy sections, 28 rules")
except ImportError:
    print("pyyaml unavailable — parse check skipped (regex parity above still authoritative)")

print("CONSISTENCY-PASS")
EOF
```

Expected final line: `CONSISTENCY-PASS`. An `AssertionError` names the exact mismatch — fix the offending file per Task 1/2/3's corrective steps, commit there, and re-run this script until it passes. This script never lands in the repo (Global Constraints: no executable code).

### Task 5: Close out M1 — tick exit criteria, update statuses, sync, commit

**Files:**
- Modify: `docs/specs/2026-07-07-m1-phase1-specification-design.md` (status header + 5 exit-criteria checkboxes)
- Modify: `docs/ROADMAP.md` (tick the 3 M1 items)
- Sync: `~/.ai-pref-nsync/local-docs/ai-shakespii/specs/2026-07-07-m1-phase1-specification-design.md`, `~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md`

**Interfaces:**
- Consumes: `CONSISTENCY-PASS` output from Task 4 (do not start this task without it).
- Produces: an M1 milestone marked complete; repo ready for the M2 gate (which is blocked on the user's runtime-language decision — do NOT pick it).

- [ ] **Step 1: Update the spec's status header**

In `docs/specs/2026-07-07-m1-phase1-specification-design.md` replace:

```
**Date:** 2026-07-07 · **Status:** approved in brainstorm, pending spec review
```

with:

```
**Date:** 2026-07-07 · **Status:** implemented — exit criteria verified 2026-07-07
```

- [ ] **Step 2: Tick all five exit-criteria checkboxes in the spec**

In the `## Exit criteria` section, change each `- [ ]` to `- [x]` on these five lines (and only these):

```
- [x] This spec committed (repo mirror + canonical copy).
- [x] `profiles/default.yaml` exists in the repo exactly as specified in section 2.
- [x] `templates/skill/` exists in the repo exactly as specified in section 3.
- [x] LINT-RULES.md, ROADMAP.md, README.md amendments applied.
- [x] Consistency pass: every profile rule ↔ catalog entry; every scaffold placeholder maps to a backing rule.
```

- [ ] **Step 3: Tick the three M1 items in the roadmap**

In `docs/ROADMAP.md` under `## M1 — Phase-1 specification`, change the three `- [ ]` prefixes to `- [x]` (items: skill anatomy spec, default lint profile, scaffold template design). Touch nothing in M0, M2, or later sections.

- [ ] **Step 4: Verify the edits took**

```bash
grep -c '^\- \[x\]' docs/specs/2026-07-07-m1-phase1-specification-design.md   # expect 5
grep -A4 '^## M1' docs/ROADMAP.md | grep -c '\- \[x\]'                        # expect 3
grep -c 'implemented — exit criteria verified' docs/specs/2026-07-07-m1-phase1-specification-design.md  # expect 1
```

Expected: `5`, `3`, `1`.

- [ ] **Step 5: Sync canonical copies and commit**

```bash
cp docs/specs/2026-07-07-m1-phase1-specification-design.md \
   ~/.ai-pref-nsync/local-docs/ai-shakespii/specs/2026-07-07-m1-phase1-specification-design.md
cp docs/ROADMAP.md ~/.ai-pref-nsync/local-docs/ai-shakespii/plans/ROADMAP.md
git add docs/specs/2026-07-07-m1-phase1-specification-design.md docs/ROADMAP.md
git commit -m "docs: close out M1 — exit criteria verified, roadmap M1 complete"
git status --short   # expect: clean (empty output)
```

Expected: commit succeeds; `git status --short` prints nothing.
