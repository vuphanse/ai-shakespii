# Critique rubric — qualities lint cannot check

Run this pass with fresh eyes after the draft is complete and before the
lint loop. For each item: read the named section, apply the check, fix what
fails, and re-read once more after fixing.

## Freedom calibration

- Pick any Procedure step. Can you answer "why this tight?" for prescriptive
  steps and "why this loose?" for open ones? A fragile operation (exact
  command, exact format, ordering that matters) must be prescribed; a
  judgment call (thresholds, phrasing, scope) must not pretend to be exact.
- Look for disguised judgment: a step that gives a precise-looking number
  nobody measured. Either cite where the number comes from or open it up.

## Executable procedure

- Walk the Procedure as a reader who knows the domain but not this workflow.
  At every step, ask: could I act right now without asking a question the
  skill does not answer? Each unanswerable question is a defect.
- Check every command, path, and file the steps mention: does the skill
  declare it (Inputs, Preconditions) or ship it (references/)?

## Real examples

- The Examples section must show a genuine input→output pair — concrete
  values a reader could compare their own run against. A restated trigger
  list or a placeholder-shaped invention fails this check.

## Progressive disclosure

- SKILL.md carries the loop a reader follows; depth lives in `references/`
  files linked at the point of use. If a section reads as a reference table
  or a long rule list, move it and link it.

## Description quality

- The description leads with trigger situations the interview actually
  named, phrased the way a requester would phrase them, in third person.
- It names concrete, searchable things (formats, tools, activities) rather
  than abstractions.

## Anti-patterns are earned

- Each anti-pattern traces to a failure mode the interview surfaced or a
  defect the critique found — not generic advice.

## Headless-safe evals

- Apply [headless-eval-rules.md](headless-eval-rules.md) to every eval case
  before running the harness.
