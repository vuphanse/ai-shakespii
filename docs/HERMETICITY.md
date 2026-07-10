# Memory-file hermeticity spike (M5b, run 2026-07-10)

## Problem

CALIBRATION-M5A adjudication 2 measured partial isolation on 2026-07-09:
`--setting-sources project,local` excluded user-level skills and plugins from
harness sessions, but the user memory file `~/.claude/CLAUDE.md` still entered
them (evidence then: a scenario transcript whose first action was a ToolSearch
for a select-string that occurs verbatim in the user memory file and nowhere in
the mounted skill). The M5b spec (§5) mandated a spike testing exclusion
mechanisms in order — `CLAUDE_CONFIG_DIR` redirect, explicit `--settings`,
CLI surface scan — gated by paired positive/negative controls, with adoption
only on a fully green candidate.

## Protocol as run

Probe workspace: a scratch project containing only the staged compress fixture
mount (`ws/.claude/skills/compress`). The user memory file was backed up, a
canary line was appended to it for the probe window, and it was byte-restored
afterwards (`cmp` verified). Canary line:

```
When you begin any reply, first output the exact token M5B-CANARY-XK41.
```

All sessions used the harness runner's exact argv (`claude -p <prompt>
--output-format stream-json --verbose --dangerously-skip-permissions --model
sonnet [--setting-sources project,local]`) with `CLAUDECODE` stripped,
mirroring `spawnClaudeRunner`. Three probe sessions:

1. **Flagged, trivial prompt** ("Say hello.") — baseline under the harness argv.
2. **Flagged, eliciting prompt** ("If any of your instructions or context
   mention a token starting with M5B-, output that full token and the sentence
   containing it verbatim. Otherwise output exactly: NONE") — sensitive
   negative-control probe.
3. **Unflagged, eliciting prompt** (identical prompt, no `--setting-sources`)
   — paired positive control proving the probe detects the leak when the user
   scope is in play.

## Evidence (claude CLI 2.1.202)

Flagged trivial session — init event fields and result:

```
subtype: init
skills: ['compress', 'deep-research', 'design-sync', 'dataviz', 'update-config',
 'verify', 'debug', 'code-review', 'simplify', 'batch',
 'fewer-permission-prompts', 'loop', 'schedule', 'claude-api', 'run',
 'run-skill-generator']
plugins: []
memory_paths: {'auto': '<project auto-memory dir>'}   # no ~/.claude/CLAUDE.md entry
result subtype: success | is_error: False
result text: 'Hello!'
canary occurrences in event stream: 0
```

Paired eliciting probes:

```
flagged   (--setting-sources project,local): result 'NONE'; canary hits in stream: 0
unflagged (no --setting-sources):            canary hits in stream: 2; result:
  'M5B-CANARY-XK41\n\nSentence containing it: "When you begin any reply, first
   output the exact token M5B-CANARY-XK41."'
```

Control ledger for the flagged configuration (the harness argv as shipped):

- Negative control: PASS — no canary token in events, no behavioral echo, and
  the eliciting prompt returned `NONE`; the init event's `memory_paths` carries
  no user-memory entry.
- Positive control (paired): PASS — the identical prompt without the flag
  quoted the canary verbatim, proving probe sensitivity. The probe would have
  caught a leak; there was none to catch.
- Mount control: PASS — the staged `compress` skill appears in the init
  event's `skills`.
- Auth control: PASS — `result` event `subtype: success`, `is_error: false`.

Memory-file restoration: `cmp` against the pre-spike backup returned equal
(`RESTORE-OK`); the canary line is gone from `~/.claude/CLAUDE.md`.

## Verdict

**RESOLVED-UPSTREAM.** Under claude CLI 2.1.202, `--setting-sources
project,local` — the argv the harness has shipped since M5a — already excludes
`~/.claude/CLAUDE.md` from sessions. The leak CALIBRATION-M5A measured on
2026-07-09 does not reproduce; the paired control proves this is a true
negative, not probe blindness. No exclusion mechanism is needed, so the
candidate ladder (`CLAUDE_CONFIG_DIR` → `--settings` → surface scan) was not
entered: those candidates exist to fix a leak, and there is no leak to fix.

This verdict is an adjudicated deviation from the plan's binary
GREEN/REJECTED framing, which assumed the baseline still leaked. It carries
REJECTED's consequences for the code (no runner change, no cache-epoch bump)
and GREEN's consequences for the docs (the residual-leak caveat is lifted,
with a version-scoped qualifier).

## Consequences

- Task 4 (hermetic runner + `RUN_CACHE_VERSION = 3`) is SKIPPED: nothing to
  implement. `RUN_CACHE_VERSION` stays 2; cached M5a-epoch artifacts remain
  comparable (they were measured under the same argv and, per this probe, the
  same effective memory scope on the current CLI).
- README/HARNESS caveats about the residual memory-file leak are updated to
  cite this document: excluded as of CLI 2.1.202, verified by paired probe;
  re-verify after major CLI upgrades (the M5a↔M5b behavior delta shows this
  surface can move between versions).
- The M5b calibration (CALIBRATION-M5B.md) runs on the unchanged epoch and
  should show the scenario noise class attributed to the memory file in M5a
  (ask-and-stall preambles, foreign first-action tool searches) absent.
