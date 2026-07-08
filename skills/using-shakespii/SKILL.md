---
name: using-shakespii
description: "Use when creating a new agent skill or auditing, linting, testing, or fixing an existing one — drives the shakespii CLI (init, lint --json, test --run) to scaffold standard SKILL.md skills and resolve findings until clean."
version: 0.4.0
---

# using-shakespii

## Intent

Teach an agent to drive the shakespii CLI — the deterministic lint and scaffold
substrate for Agent Skills — so skills get created and repaired against the anatomy
contract instead of by taste. The CLI decides; this skill teaches the loop around it.

## Inputs

- Audit: the path to an existing skill directory (one containing `SKILL.md`), or a
  corpus root — a directory of skill directories — audited in one run with `--corpus`.
- Authoring: the new skill's kebab-case name, its purpose, and the situations that
  should trigger it — all three confirmed with the human before scaffolding.
- Optional: a specific finding or rule ID the human wants addressed first.

## Preconditions

- Bun is installed and on PATH (`bun --version` succeeds).
- The shakespii repo is cloned, dependencies installed, and the CLI linked:
  `bun install && bun link` inside the repo; `shakespii --version` then resolves.
- Audit: the target skill directory is readable.
- Authoring: the parent directory for the new skill is writable.

## Procedure

Shared core, both branches:

1. Run `shakespii lint <dir> --json` and parse stdout (schema `version: 1`). Each
   finding carries `ruleId`, `severity`, `file`, `line`, `message`.
2. Exit codes: `0` means no errors — proceed. `1` means errors — enter the fix loop.
   `2` means lint itself could not run — report the stderr message verbatim and stop;
   never guess around a broken run.
3. For each finding, look up its `ruleId` in
   [references/rule-remediations.md](references/rule-remediations.md) and apply the
   minimal fix. A finding whose rule has no entry there is fixed from its own
   `message` — messages are written to be actionable.
4. Re-lint. Loop until exit 0, then handle warnings: fix each one, or surface it to
   the human explicitly with a reason. Never silently ignore a warning.

Audit branch — fix an existing skill:

5. Lint the directory the human named and work the fix loop above. For a corpus
   root, run `shakespii lint <root> --corpus --json`: work each skill's findings
   with the same loop, and treat `corpusFindings` (XS rules, whose `sites` name
   every involved skill) as refactor suggestions spanning skills.
6. Preserve the skill's voice and intent: reword a description to lead with its
   trigger; do not rewrite what the skill is for.
7. Report before/after finding counts, what changed per rule, and any warnings left
   standing with reasons.

### Testing a skill's evals

After a skill lints clean, verify its eval suite with the harness:

```bash
shakespii test <skill-dir> --json
```

Exit codes: 0 = no error findings (warnings allowed), 1 = error findings to
fix, 2 = the run itself failed (bad path, no SKILL.md, claude CLI missing).
The deterministic stage checks that `evals/evals.json` exists, parses,
follows the skill-creator schema (`skill_name` equal to the frontmatter
name, unique integer ids, non-empty prompts and expectations, at least
three cases), and references only files that exist inside the skill
directory. Without `--run` the `scenario` and `grading` stages report
`skipped` — the command is free and safe to loop on.

To actually execute the evals — a headless agent runs each case, then an
LLM grader scores every expectation with cited evidence — add `--run`:

```bash
shakespii test <skill-dir> --run --json
```

`--run` spends real tokens (one executor and one grader session per eval
case), so confirm with the human before the first run on a suite. Results
are cached per (skill content, eval, model): re-running after no changes
replays instantly from cache; editing the skill or its evals re-runs only
because the content hash changed. `--fresh` forces re-execution despite the
cache; `--model <name>` overrides the default executor/grader model
(sonnet). Fix loop: deterministic findings name the JSON path of the defect
in `evals/evals.json`; `scenario` findings mean the executor run itself
failed (timeout, crash); `grading` findings quote the failed expectation
and the grader's evidence — fix the skill (or a genuinely wrong
expectation, with the human's approval) and re-run until exit 0.

Authoring branch — create a new skill:

5. Confirm name, purpose, and trigger situations with the human, then run
   `shakespii init <name>` in the agreed parent directory.
6. Fill every section of the scaffold, replacing each placeholder token (the scaffold
   marks them with `TODO(shakespii)` plus a trailing colon) with real content.
7. Write at least one concrete worked example in Examples — real input, real output.
8. Fill `evals/evals.json` with at least three cases, one of them a near-miss
   negative that must not trigger the skill.
9. Work the fix loop until lint is clean, then present the skill, its lint output,
   and its evals to the human. Do not install into `~/.claude/skills/` without
   explicit approval, and never with findings outstanding.

## Output

- Audit: the skill's files fixed in place, plus a report of before/after finding
  counts and per-rule changes.
- Authoring: a new skill directory (`SKILL.md`, `README.md`, `evals/evals.json`) that
  lints clean, presented to the human for approval — not installed.

## Examples

Audit, end to end. The user says: "Lint my skill at `~/.claude/skills/summarize-notes`
and fix what it finds."

Input: `shakespii lint ~/.claude/skills/summarize-notes --json` exits 1 with one
finding — `ruleId` FM04, severity error, file `SKILL.md`, line 3, message
"description must begin with a trigger phrase (one of: use when, use for, use if,
use this, invoke when, when the user)".

The agent opens the FM04 entry in the remediation reference and rewrites the
description from "Compresses long chat threads into short bullet summaries" to "Use
when the user asks to summarize a long chat thread into short bullets", changing
nothing else.

Output: the re-lint exits 0 with zero findings, and the agent reports "1 error → 0
findings; FM04 fixed by rewording the description trigger-first", listing no
remaining warnings.

## Anti-patterns

- Editing skill files by taste without running lint first — the CLI is the arbiter.
- Weakening content to appease a rule: deleting a section to silence a finding, or
  gutting a description. Fix the defect, keep the substance.
- Pointing `--corpus` at a single skill directory — corpus mode takes the *parent*
  directory; lint a single skill without the flag.
- Installing a freshly authored skill without human approval, or with findings open.
- Looping on a run that exited `2` — that exit means lint itself could not run;
  report it instead of retrying.
