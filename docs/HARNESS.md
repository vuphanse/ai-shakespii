# shakespii test harness — contract

Status: M4b-1 shipped (deterministic + scenario + grading stages; scenario
and grading are opt-in via --run). M4b-2 pending (TR02 trigger eval,
benchmark stats). Upstream schema authority: skill-creator
`references/schemas.md` (pinned evidence, vintage 2026-07 — see
profiles/default.yaml provenance).

## Stage pipeline

`shakespii test <path> [--json] [--run] [--fresh] [--model <name>]` runs
three stages, always in this order: `deterministic`, `scenario`, `grading`.

- Without `--run`, scenario/grading report
  `status: "skipped", note: "pass --run to execute LLM stages"` and the
  command is free — no LLM calls, ever. TR01 (lint) delegates to the
  deterministic stage only; lint never spends tokens.
- With `--run`, each eval case is executed headlessly (`claude -p`,
  stream-json, model default `sonnet`, 300s timeout per LLM call) and then
  graded by a second LLM call. If the deterministic stage produced errors,
  both LLM stages report `status: "skipped", note: "deterministic stage
  failed"` — an invalid suite never burns tokens. Deterministic warnings
  alone do not block.
- `--fresh` and `--model` require `--run` (usage error, exit 2, otherwise).

Exit codes: 0 — no error findings (warnings allowed); 1 — at least one
error finding (failed expectations, executor/grader failures included);
2 — run error only (bad usage, unreadable target, `claude` CLI not
spawnable, unexpected exception).

**Permissions bypass — accepted risk.** The executor runs
`claude -p --dangerously-skip-permissions` inside a disposable per-run
workspace. This is opt-in (`--run`), intended for the user's own trusted
skills; the workspace cwd is containment by convention, not a sandbox — a
malicious skill could escape via Bash. Do NOT point `--run` at untrusted
third-party skills.

## test-JSON v1

Top-level key order is contractual: `version, mode, skill, stages, summary`.
Findings: `severity, message, file, line` (no ruleId; schema-path detail is
folded into `message`). Executed scenario stage: `stage, status, findings,
runs` with runs entries `evalId, cached, status, durationSeconds`
(`status` ∈ ok | timeout | nonzero-exit | no-result). Executed grading
stage: `stage, status, findings, expectations` with `expectations`
`{passed, total}` counting graded expectations across cold and cached
cases. Skipped stages: `stage, status, note`. `summary` counts all findings
across stages.

## Executor

Per eval case (sequential, ascending id): runKey → run dir; cache check;
cold path stages a workspace (`outputs/`): the skill mounted at
`outputs/.claude/skills/<skill_name>/`, each eval `files` entry copied at
its skill-relative path. Prompt: force-load preamble ("Read
.claude/skills/<name>/SKILL.md first…") plus the eval prompt verbatim —
scenario evals measure capability with the skill; natural triggering is
TR02's concern (M4b-2). Executor failures (timeout / nonzero-exit /
completed with no result event) become scenario error findings; the case
is not graded and stays uncached.

## Grader

Second `claude -p` call, cwd = the run dir. The grader reads transcript.md
and outputs/ and replies with JSON; the harness validates
(`validateGradingJson` + rubric fidelity: expectation texts verbatim, same
count and order) and persists. One retry (shared budget across gate and
runner-level failures — at most two grader calls per case); the summary is
recomputed by the harness (LLM arithmetic is never trusted); grading.json
is written atomically (tmp + rename). Grading findings: one error per
failed expectation, quoting the text and the grader's evidence.

## Run-dir and cache (`src/lib/harness/run-dir.ts`)

- Cache root: `SHAKESPII_CACHE_DIR`, else `$XDG_CACHE_HOME/shakespii`,
  else `~/.cache/shakespii`. The harness never writes inside a skill dir.
- `skillContentHash`: sha256 over SKILL.md raw bytes plus every inventory
  file's (relPath, raw bytes), sorted; any byte change rotates the hash.
- `runKey({skillHash, evalId, model})`: first 16 hex of
  sha256(`HARNESS_SCHEMA_VERSION \n skillHash \n evalId \n model`).
- Layout: `<root>/runs/<skillName>/<runKey>/` holds `outputs/` (workspace:
  skill mount, staged files, agent artifacts, `metrics.json`),
  `events.jsonl` (raw stream-json), `transcript.md`, `timing.json`, and
  `grading.json` — written last, only after validation.
- **Cache-hit definition: `grading.json` exists under the runKey AND
  passes schema + rubric-fidelity validation against the current case.**
  A missing, unparseable, schema-invalid, or rubric-mismatched file is a
  self-healing miss. Cached replay derives identical findings
  deterministically at zero token cost.
- `HARNESS_SCHEMA_VERSION` (currently 1) bumps when the layout or grading
  contract changes. Eval runs are on-demand and cached — never per-commit.

## M4b-2 output contracts

`validateBenchmarkJson` (`src/lib/evals/validate.ts`) encodes the
`benchmark.json` shape (configurations `with_skill`/`without_skill`,
nested result, run_summary aggregate stats) that the M4b-2 benchmark
writer must satisfy.
