# M4a — Test harness, static half (`shakespii test`, evals schemas, TR01)

Date: 2026-07-08
Status: approved design, pending implementation plan
Scope: first half of ROADMAP M4 ("Test harness"), split at the token-spend line.

## §0 Adjudications (user decisions, 2026-07-08)

| # | Question | Decision |
|---|---|---|
| 1 | M4 scope | **Split: M4a static, M4b LLM.** M4a = schema validation, TR01, deterministic stage, cache/runner skeleton, `shakespii test` CLI, repaired compress fixture — zero LLM tokens. M4b = headless executor runs, LLM grading, TR02, benchmark stats. |
| 2 | Runner implementation | **Reimplement in TypeScript on Bun.** Schemas stay byte-compatible with skill-creator's `references/schemas.md`; skill-creator's Python runners are pinned evidence of run mechanics, not a dependency. |
| 3 | Executor + grader invocation (M4b, fixed now for architecture) | **Headless `claude -p`** — the mechanism the ST04 probes proved in M3b. User's existing Claude Code auth, transcript JSONL as evidence. No Agent SDK dependency. |
| 4 | Compress repair placement | **Both, sequenced.** Repo fixture copy in M4a (corpus stays frozen); a follow-up quick task after M4 syncs the repaired `evals/` into the live skill with user sign-off. That follow-up attaches to the open personal-skill-migration decision. |
| 5 | Architecture | **Approach A: validator-core mirroring the lint architecture.** Hand-rolled pure validators, TR01 as an ordinary lint rule, stage-pipeline `shakespii test`, zero new dependencies. |

Locked upstream decisions this spec builds on: reuse skill-creator eval schemas — wrap and enforce, don't reinvent (memory `745a9a`, STRATEGY D3); deterministic checks before LLM grading; eval runs cached and on-demand, never per-commit.

## §1 Scope

**In:**
- `src/lib/evals/`: TypeScript types and validators for `evals.json`, `grading.json`, `benchmark.json`.
- TR01 lint rule (severity `warn`), joining the standard single-skill rule registry.
- `shakespii test <path> [--json]`: stage-pipeline CLI command; `deterministic` stage live; `scenario` and `grading` stages registered but unavailable until M4b.
- Run-dir/cache skeleton: content-hash keying, directory layout, env override — no LLM writes.
- Fixtures: `harness/no-evals`, `harness/bad-evals`, `harness/compress` (the repaired compress), validator document fixtures.
- `skills/using-shakespii/evals/evals.json` authored (weld invariant keeper) and companion updated to v0.3.0.
- Docs: new `docs/HARNESS.md`; LINT-RULES, ROADMAP, README updates; `docs/CALIBRATION-M4A.md`.

**Out (M4b, own brainstorm→spec cycle):** executor scenario runs, LLM grading, TR02 trigger eval, benchmark statistics, `--fresh` flag, live-compress sync.

**Untouched:** the frozen single-skill lint CLI surface (`shakespii lint <path> [--json]` plus M3b's `--corpus`/`--config`), lint JSON v1 byte-compatibility, `profiles/default.yaml` severities/options for existing rules (TR01 is an addition), `shakespii init` scaffold content, the read-only dogfood corpus.

## §2 CLI surface

```
shakespii test <path> [--json]
```

- New `case 'test'` in `src/cli/index.ts` (lazy import, same shape as `lint`). Usage strings in `src/cli/index.ts` and the test command's own USAGE updated to include `test <path> [--json]`.
- Unknown options fail loud: `unknown option: <flag>` + usage on stderr, exit 2 (M3b precedent).
- Missing `<path>`, nonexistent path, path not a directory, or unparseable SKILL.md → run error: message on stderr, exit 2.

**Exit codes** (mirror lint):
- `0` — deterministic stage completed with no `error`-severity findings (warnings allowed).
- `1` — at least one `error`-severity finding.
- `2` — run error (bad usage, unreadable target). Nothing else exits 2.

**JSON output (`--json`), test-JSON v1 — byte-stable contract:**

```json
{
  "version": 1,
  "mode": "test",
  "skill": { "dir": "<abs path>", "name": "<frontmatter name or null>" },
  "stages": [
    { "stage": "deterministic", "status": "pass" | "fail", "findings": [ { "severity": "error" | "warn", "message": "...", "file": "evals/evals.json", "line": null } ] },
    { "stage": "scenario", "status": "unavailable", "note": "ships in M4b" },
    { "stage": "grading",  "status": "unavailable", "note": "ships in M4b" }
  ],
  "summary": { "errors": 0, "warnings": 0 }
}
```

- Stage order is fixed: `deterministic`, `scenario`, `grading`.
- `status` is `"fail"` iff the stage produced ≥1 error finding; warnings alone leave it `"pass"`.
- Findings use a distinct harness shape — **not** the lint `Finding` (which requires `ruleId`; harness findings carry none, the enclosing stage already identifies the source):

  ```ts
  export interface HarnessFinding {
    severity: Severity      // 'error' | 'warn'
    message: string
    file: string            // e.g. 'evals/evals.json', 'SKILL.md'
    line: number | null     // null for JSON-document findings
  }
  ```

  `HarnessFinding` lives in `src/lib/harness/types.ts`. Schema-path detail is folded into `message` (e.g. `evals[2].prompt: must be a non-empty string`). The JSON example above is the byte-stable contract; it contains exactly these four keys per finding.
- `summary` counts findings across live stages only.

**Pretty output (default) — contractual lines:**

```
<skill-dir-name>
  deterministic  FAIL
    error  evals/evals.json  evals[2].prompt: must be a non-empty string
    warn   evals/evals.json  only 2 eval cases — Anthropic guidance is a minimum of three
  scenario       unavailable (ships in M4b)
  grading        unavailable (ships in M4b)

deterministic: 1 error, 1 warning · scenario/grading pending M4b
```

The final summary line format `deterministic: ${E} error(s), ${W} warning(s) · scenario/grading pending M4b` (with `PASS`/`FAIL` stage labels above) is contractual and keystone-tested; exact singular/plural wording is locked by the tests written in the plan.

## §3 evals module — types and validators

`src/lib/evals/types.ts` — field names byte-compatible with skill-creator `references/schemas.md`:

```ts
export interface EvalCase {
  id: number
  prompt: string
  expected_output: string
  files?: string[]
  expectations: string[]
}
export interface EvalsJson {
  skill_name: string
  evals: EvalCase[]
}
```

plus `GradingJson` (expectations[] with `text`/`passed`/`evidence`, `summary` with `passed`/`failed`/`total`/`pass_rate`, optional `execution_metrics`, `timing`, `claims`, `user_notes_summary`, `eval_feedback`) and `BenchmarkJson` (`metadata`, `runs[]` with `configuration: 'with_skill' | 'without_skill'` and nested `result`, `run_summary` with `with_skill`/`without_skill`/`delta`, `notes`) — mirroring schemas.md exactly, optional fields optional.

`src/lib/evals/validate.ts` — pure functions over `unknown`:

```ts
export interface SchemaDiagnostic { path: string; message: string }
export function validateEvalsJson(doc: unknown): SchemaDiagnostic[]
export function validateGradingJson(doc: unknown): SchemaDiagnostic[]
export function validateBenchmarkJson(doc: unknown): SchemaDiagnostic[]
```

- `path` is a JSON-path-style locator (`evals[2].expectations[0]`, `summary.pass_rate`, `$` for root).
- Diagnostics are ordered by document position (top-down), deterministic.
- Validators check structure only; they never read the filesystem. File-existence checks belong to the deterministic stage and TR01, which know the skill dir.

**`validateEvalsJson` checks (each → one diagnostic):**
1. Root is an object; `skill_name` is a non-empty string; `evals` is a non-empty array.
2. Per case: object; `id` an integer; `prompt` a non-empty string; `expected_output` a non-empty string; `expectations` a non-empty array of non-empty strings; `files`, when present, an array of non-empty strings.
3. `id` values unique across cases (diagnostic on each duplicate after the first).
4. Unknown keys at root or case level → diagnostic (`unknown key "foo"`) — fail-loud posture matching M3b config validation; a typo like `expectation` must not pass silently.

**`validateGradingJson` / `validateBenchmarkJson`:** same posture — required fields typed as in schemas.md, unknown-key diagnostics at the levels schemas.md defines, `configuration` restricted to the two exact strings, `pass_rate` a number in [0,1]. These validators are the output contracts the M4b runner must satisfy; in M4a nothing calls them from the CLI path — they are library surface with fixture tests (plus the note in §9 that HY06/benchmark evidence checking may consume them later).

**Cross-document checks** (need skill context, live in the deterministic stage, not the validator):
- `skill_name` equals the skill's frontmatter `name`. When the skill has no parseable frontmatter `name`, this check is skipped — lint (FM rules) owns that defect; `test` does not re-lint.
- Each `files` entry resolves to an existing file strictly inside the skill dir — relative path, no `../` escape, no absolute paths (ST02 precedent). Resolution is checked against the parsed skill's inventory (no extra filesystem reads), the same way ST02 resolves link targets.

## §4 Deterministic stage

`src/lib/harness/deterministic.ts`, orchestrated by `src/lib/harness/index.ts` `runTest(dir)`:

1. Parse the skill with the existing parser (`parseSkill`). Parse failure at the file level (unreadable SKILL.md) is a run error → exit 2. A parseable-but-lint-dirty skill is fine — `test` does not re-lint; lint and test are separate commands.
2. `evals/evals.json` missing from the skill inventory → single **error** finding: `no evals/evals.json — author evals first (see TR01); shakespii test requires a reproducible eval suite`. Stage fails, exit 1. This is the enforcement teeth and the free `init → test` RED loop: a raw scaffold fails `shakespii test` without any init changes.
3. File present but not valid JSON → single **error** finding with the parse position folded into the message.
4. `validateEvalsJson` diagnostics → one **error** finding each (`${path}: ${message}` in the message field).
5. Cross-document checks (§3) → **error** findings: name mismatch (`skill_name "x" does not match frontmatter name "y"`), unresolvable or escaping `files` entries (one finding per entry).
6. Case count < 3 (structurally valid file) → one **warn** finding: `only ${n} eval case(s) — Anthropic guidance is a minimum of three`.

Ordering within findings: file-level first (missing/unparseable), then validator diagnostics in document order, then cross-document, then the case-count warning. Deterministic across runs.

## §5 TR01 lint rule

`src/lib/rules/TR01.ts`, registered in the standard single-skill registry; severity **warn** in `profiles/default.yaml` (an addition — existing entries untouched). Evidence line in LINT-RULES already present (Anthropic "minimum three evaluations"; compress's fixtures break because they don't resolve relative to the skill).

Pure function over `ParsedSkill`. At most **one finding per skill** — the most fundamental defect:

1. No `evals/evals.json` in inventory → `skill ships no evals/evals.json — no reproducible eval`.
2. Present but JSON-invalid or schema-invalid (delegates to `validateEvalsJson` + the cross-document name/files checks, reusing the same helpers as the stage) → `evals/evals.json fails validation (${n} error(s)) — run shakespii test for details`.
3. Valid but < 3 cases → `only ${n} eval case(s) — Anthropic guidance is a minimum of three`.

Finding `file` is `evals/evals.json` for shapes 2–3 and `SKILL.md` for shape 1; `line` is `null`.

Rationale for the single-finding cap: lint is the cheap always-on surface; the full diagnostic list lives in `shakespii test` (ST02/CT02 dedup precedent — one defect, one place to read the detail). TR02 stays a catalog entry pending M4b.

## §6 Keystone amendments and fixture blast radius

Adding TR01 changes lint output everywhere a skill ships no evals. The governing rule for existing tests and fixtures:

> A fixture whose test focus is *not* TR01 gets a **minimal valid evals/evals.json** (3 tiny cases, `skill_name` matching its frontmatter) so its asserted lint output is unchanged. Assertions are never weakened to absorb the new warning. The only intentional count amendment is the scaffold keystone.

Enumerated consequences:

- **Scaffold keystone** (`tests/cli/keystone.test.ts`): raw scaffold expectation amends from `{ errors: 20, warnings: 0 }` to `{ errors: 20, warnings: 1 }` — the one new warning is TR01 shape 1. The scaffold stays intentionally RED; `shakespii init` output is not modified.
- **Weld invariant** (`tests/skill/using-shakespii.test.ts`): `skills/using-shakespii/` gets a real, authored `evals/evals.json` (≥3 cases — see §8), keeping the weld at `{ errors: 0, warnings: 0 }`. using-shakespii becomes the first TR01-clean skill.
- **Corpus fixtures** (`tests/fixtures/corpus/*`: clean-pair, with-skipped, with-broken, clone-pair, shared-block-trio) and **config fixtures** (`tests/fixtures/config/*`): every fixture skill gains a minimal valid evals file. The corpus keystone's locked values (`{skills, skipped, errors, warnings}` and per-skill `{0,0}`) remain byte-identical. evals files live outside SKILL.md, so XS01/XS02 body-line analysis and all load-bearing line positions are untouched; `skill_name` values differ per fixture so no new cross-skill identical blocks arise in SKILL.md bodies (XS rules read only SKILL.md bodies regardless).
- **Engine/helper-built skills** (`tests/helpers/skill.ts` synthetic skills with empty inventory): any test running the full registry and asserting totals accounts for TR01 shape 1. Rule-scoped unit tests are unaffected. The plan enumerates each touched test file explicitly.

## §7 Run-dir / cache skeleton

`src/lib/harness/run-dir.ts`:

- Cache root resolution, in order: `SHAKESPII_CACHE_DIR` env var → `$XDG_CACHE_HOME/shakespii` → `~/.cache/shakespii`. The env override is what makes CLI tests hermetic (tests point it at a temp dir). The harness never writes inside the skill directory (corpus stays read-only).
- `skillContentHash(dir)`: sha256 over SKILL.md's raw bytes plus, for every inventory file in sorted `relPath` order, the pair (`relPath`, sha256 of the file's **raw bytes read from disk**). Hashing raw bytes — never the parsed `FileEntry.text`, which is `null` for binary and oversized files — guarantees the spec's invariant: *any* byte change in *any* file changes the hash, including a same-size mutation of a binary fixture. Unit tests cover: any content change changes the hash; a same-size binary mutation changes the hash; enumeration-order independence. (This module reads the filesystem by design — the §3 no-filesystem constraint applies to schema validators only.)
- `runKey({ skillHash, evalId, model })`: first 16 hex chars of `sha256(schemaVersion + '\n' + skillHash + '\n' + String(evalId) + '\n' + model)` where `schemaVersion` is the harness contract version (starts at `1`, bumps when the run-dir layout or grading contract changes, invalidating stale caches).
- `runDir(root, skillName, key)` → `<root>/runs/<skillName>/<key>/`; `ensureRunDir` creates it.
- Documented layout (M4b fills it): `outputs/` (executor artifacts + `metrics.json`), `timing.json`, `grading.json`. **Cache-hit definition, fixed now:** a run is cached iff `grading.json` exists under the runKey. Cache granularity is per (skill content, eval case, model) — selective re-runs after single-eval edits.
- M4a writes nothing under `runs/` from the CLI path; the module is library surface with tests.

## §8 Fixtures

- `tests/fixtures/harness/no-evals/` — minimal valid-enough skill, no `evals/` dir. Exercises stage step 2 and TR01 shape 1.
- `tests/fixtures/harness/bad-evals/` — one skill whose `evals/evals.json` carries several co-existing violations (name mismatch, duplicate id, empty `expectations`, `../escape` file entry, unresolvable file entry, unknown key, < 3 cases) proving the CLI path end-to-end with deterministic finding order. Exhaustive per-defect-class coverage (incl. root-not-object, non-string fields) lives in validator unit tests over inline documents.
- `tests/fixtures/harness/compress/` — **the repaired compress**: `SKILL.md`, `README.md`, `scripts/` copied verbatim from the read-only original at `~/.claude/skills/compress/`, plus authored `evals/evals.json` (≥3 cases) and `evals/files/` inputs. Eval cases target what M4b can execute and grade headlessly, e.g.:
  1. Compress a sample memory file (`evals/files/sample-memory.md`) — expectations: all URLs survive verbatim; all code blocks survive verbatim; compressed output is smaller than the input; backup written as `sample-memory.original.md`.
  2. Compress a file containing only code fences — expectation: content byte-identical (nothing compressible).
  3. Idempotency: compressing an already-compressed file changes nothing material.
  Exact case wording is authored in the plan; the schema-validity and files-resolution of this fixture are what M4a asserts (`shakespii test` → deterministic pass, exit 0 — the new test-command keystone).
- `skills/using-shakespii/evals/evals.json` — real evals for the companion skill (≥3 cases: scaffold-then-lint loop produces expected RED set; lint --json drives fix loop to clean; corpus audit surfaces XS findings on a clone corpus). Same authoring bar as compress's; graded in M4b.
- Validator document fixtures: valid + per-defect-class invalid `grading.json` and `benchmark.json` documents (inline in tests or under `tests/fixtures/harness/docs/`).

## §9 Testing strategy and calibration

- TDD for every unit: validators, TR01, stage, run-dir, CLI formatting — fixture/unit tests written first, unpiped `bun test`, exit code preserved.
- CLI tests spawn the real binary (existing pattern), with `SHAKESPII_CACHE_DIR` pointed at temp dirs.
- Keystones after M4a: amended scaffold keystone (`{20, 1}`), weld `{0,0}` with authored evals, **new test-command keystone** (`shakespii test tests/fixtures/harness/compress --json` → byte-shape locked: stage statuses, summary, exit 0; and `no-evals` → exit 1 with the exact missing-evals message), corpus keystone byte-identical (per §6).
- **Calibration sweep** (`docs/CALIBRATION-M4A.md`), M3 protocol — predictions committed before the sweep, verbatim counts, adjudication table (rule-logic bug / miscalibration / audit-miss):
  - Predicted: TR01 fires on **every** discovered skill in both corpora except `using-shakespii` (verified pre-spec: zero `evals.json` files exist anywhere in `~/.claude/skills/` or the superpowers 6.1.1 cache). The prediction doc enumerates exact expected counts per corpus root at sweep time (personal corpus discovery ≈ 14 skills incl. the using-shakespii symlink, minus dangling/skipped; superpowers = 14).
  - Predicted: zero new **error** findings anywhere (TR01 is warn-only); weld stays `{0,0}`; scaffold `{20, 1}`.
  - `shakespii test ~/.claude/skills/compress` (read-only invocation) → exit 1 with the missing-evals error — recorded as the "before" evidence; the repo fixture is the "after".
- Severity/option changes discovered during calibration are recorded, never applied silently (XS02-threshold precedent).

## §10 Documentation

- **`docs/HARNESS.md`** (new, committed, dual-location synced): stage contract and semantics, test-JSON v1 schema, run-dir layout, cache keying and cache-hit definition, schemaVersion policy, pointers to skill-creator schemas.md as upstream. This is M4b's substrate document.
- **LINT-RULES.md**: TR01 moves to implemented with a detection-notes entry (three firing shapes, single-finding cap, delegation to `shakespii test`); TR02 remains pending M4b; M4a completion paragraph.
- **ROADMAP.md**: M4 splits into M4a (this spec's bullets, ticked on completion) and M4b (executor runs via `claude -p`, LLM grading, TR02, benchmark stats, `--fresh`, live-compress sync gate).
- **README.md**: `test` command bullet + status line.
- **using-shakespii → v0.3.0**: test-loop section (author evals → `shakespii test` → fix to green), TR01 entry in `references/rule-remediations.md`, changelog note; weld relint after.
- All docs dual-location: canonical `~/.ai-pref-nsync/local-docs/ai-shakespii/` (specs/, knowledge-references/), repo mirror, cmp-verified.

## §11 Non-goals and carried decisions

Non-goals (M4a): any LLM invocation, TR02, `--fresh`, benchmark command or stats, `shakespii init` changes, writes to `~/.claude/skills/` or the plugin cache, watch mode, parallel test of multiple skills (`test` takes one skill dir; a `--corpus` test mode is future work, not designed here).

Carried open decisions (user's, unchanged): XS02 threshold (options recorded in CALIBRATION-M3B), personal-skill migration — now explicitly including the live-compress `evals/` sync (adjudication #4).
