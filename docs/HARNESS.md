# shakespii test harness — contract (M4a substrate)

Status: M4a shipped (deterministic stage); M4b pending (scenario runs, grading).
Upstream schema authority: skill-creator `references/schemas.md` (pinned
evidence, vintage 2026-07 — see profiles/default.yaml provenance).

## Stage pipeline

`shakespii test <path> [--json]` runs three registered stages, always in this
order: `deterministic`, `scenario`, `grading`. In M4a only `deterministic` is
live; the other two report `status: "unavailable", note: "ships in M4b"` and
never affect the exit code. M4b implements them as headless `claude -p` runs
(executor) and LLM rubric grading (grader) writing `grading.json`.

Exit codes: 0 — no error-severity findings (warnings allowed); 1 — at least
one error finding; 2 — run error (bad usage, unknown option, unreadable
target). Nothing else exits 2.

## test-JSON v1

Top-level key order is contractual: `version, mode, skill, stages, summary`.

    {
      "version": 1,
      "mode": "test",
      "skill": { "dir": "<abs path>", "name": "<frontmatter name or null>" },
      "stages": [
        { "stage": "deterministic", "status": "pass" | "fail",
          "findings": [ { "severity": "error" | "warn", "message": "...",
                          "file": "evals/evals.json", "line": null } ] },
        { "stage": "scenario", "status": "unavailable", "note": "ships in M4b" },
        { "stage": "grading",  "status": "unavailable", "note": "ships in M4b" }
      ],
      "summary": { "errors": 0, "warnings": 0 }
    }

Harness findings are NOT lint findings: they carry no `ruleId` (the enclosing
stage identifies the source) and their key order is `severity, message, file,
line`. Schema-path detail is folded into `message` (`evals[2].prompt: must be
a non-empty string`).

## Deterministic stage checks (in order)

1. `evals/evals.json` present in the inventory — missing is the contractual
   error `no evals/evals.json — author evals first (see TR01); shakespii test
   requires a reproducible eval suite`.
2. Readable as UTF-8 text and valid JSON.
3. `validateEvalsJson` structural diagnostics (skill-creator shape:
   `skill_name`, `evals[]` with unique integer `id`, non-empty `prompt` /
   `expected_output` / `expectations`, optional `files`; unknown keys are
   errors — fail-loud).
4. Cross-document: `skill_name` equals the frontmatter `name` (skipped when
   the frontmatter has no parseable name — lint owns that defect); every
   `files` entry resolves inside the skill dir against the inventory (no
   absolute paths, no `../`).
5. Fewer than 3 cases in a structurally valid file — one warning.

TR01 (lint, warn) is the cheap always-on twin: at most one finding per skill,
delegating to the same deterministic-stage helpers, so lint and test can
never disagree about validity.

## Output contracts for M4b

`validateGradingJson` and `validateBenchmarkJson`
(`src/lib/evals/validate.ts`) encode the shapes the M4b runner must emit —
`grading.json` (graded expectations + summary with `pass_rate` in [0,1]) and
`benchmark.json` (`configuration` restricted to `with_skill` /
`without_skill`, nested `result`). They are library surface in M4a; the M4b
grader/benchmark writers must satisfy them.

## Run-dir and cache (`src/lib/harness/run-dir.ts`)

- Cache root resolution: `SHAKESPII_CACHE_DIR` env var, else
  `$XDG_CACHE_HOME/shakespii`, else `~/.cache/shakespii`. The harness never
  writes inside a skill directory.
- `skillContentHash`: sha256 over SKILL.md raw bytes plus every inventory
  file's (relPath, raw bytes) in sorted relPath order — bytes are read from
  disk, so any byte change (including same-size binary mutations) changes
  the hash.
- `runKey({skillHash, evalId, model})`: first 16 hex chars of
  sha256(`HARNESS_SCHEMA_VERSION \n skillHash \n evalId \n model`). Cache
  granularity is per (skill content, eval case, model).
- Layout: `<root>/runs/<skillName>/<runKey>/` will hold `outputs/` (executor
  artifacts + `metrics.json`), `timing.json`, `grading.json` (schemas.md
  layout). **Cache-hit definition: `grading.json` exists under the runKey.**
- `HARNESS_SCHEMA_VERSION` (currently 1) bumps when the run-dir layout or
  grading contract changes, invalidating stale caches. Eval runs are
  on-demand and cached — never per-commit.
