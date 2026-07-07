# Reference-skill critique & authority posture

Pre-kickoff discussion, 2026-07-07. Question answered: should shakespii (and its users) simply follow `superpowers:writing-skills` and `skill-creator`, or diverge? These are the working conclusions; they extend STRATEGY.md D4 and inform the lint profile and the writer.

## Verdict

Follow neither as authority. Treat both as **evidence sources**: harvest what is empirically validated, discard what is aspirational, and encode everything checkable as lint rules instead of prose. The two authorities already contradict each other (description style, size budgets — see STRATEGY.md D4), so "just follow them" was never an option.

## Keep — empirically grounded, adopt as-is

1. **Trigger-first, third-person descriptions with searchable keywords.** Validated in the corpus: 13/14 superpowers descriptions begin "Use when"; one documented case of a workflow-summarizing description causing wrong agent behavior (writing-skills:154-156). → FM04.
2. **Freedom calibration** — prose for judgment steps, exact scripts for fragile steps. Correct insight about LLM reliability.
3. **Progressive disclosure** — `references/` loaded on demand, `scripts/` executed not loaded. Correct token economics.
4. **TDD-for-skills mindset** — pressure scenarios, baseline-without-skill, variance as metric. Right methodology, never practiced by its own authors.
5. **skill-creator's eval schemas and trigger-accuracy design.** Genuinely good engineering; adopted wholesale per D3.

## Change — the structural defects

1. **Advice is prose, so it can't hold itself.** writing-skills is 3,807 words instructing a <500-line cap while being 689 lines. Not hypocrisy — structural inevitability: unenforced rules drift, and prose is unenforceable. Fix: everything checkable moves into lint rules; guidance skills shrink to judgment-only content.
2. **Drift is invisible by design.** No `version`, no changelog, no last-reviewed marker anywhere in the ecosystem. When guidance changes its mind, nothing records that it did; skills authored under old guidance silently diverge. Fix: FM05 (version required), HY03/HY04 (staleness markers), calibration re-runs when the reference corpus upgrades.
3. **Empirical claims, zero evals.** "This description style triggers better" is measurable. skill-creator ships the measurement tools and its own `evals/` directory does not exist. Eval-backed guidance would make drift harmless — re-run the eval, learn whether the advice still holds. Fix: guidance skills carry benchmarks like any other skill (HY06).
4. **Compliance-furniture arms race.** EXTREMELY-IMPORTANT blocks, Iron Laws, ALL-CAPS, "1% chance → MUST invoke". Works when one skill shouts; with 30 installed skills shouting, it's inflation, and the over-triggering (false-fire) cost is never measured. Fix: reserve the furniture for genuinely fragile discipline steps; replace "shout louder" with trigger-accuracy evals (TR02) that measure false-fires on near-miss negatives. ST05 keeps the pattern only in its honest, paired form (Iron Law ⇒ rationalization table + red flags).
5. **Corpus-blind authoring.** skill-creator's interview never asks "does an installed skill already do 80% of this?" Result in the personal corpus: five kickoff near-clones. Fix: the writer consults the corpus (XS02) and ai-cortex memory before drafting.
6. **Single-responsibility violation in the flagship.** writing-skills mixes philosophy + process + TDD methodology + anti-pattern catalog in one body. By its own component standards it should be a thin hub + references. The audit's best skill (ai-whisper-plan-execution) is dense and single-purpose — that is the model.

## Posture: authorities become pinned dependencies

Do not fork the reference guidance and do not obey it — **pin it**. Reference skills are versioned inputs to calibration; the lint profile records which vintage each adjudication came from (e.g. "superpowers 6.1.1"). When a new major version lands and contradicts the pinned one, the calibration run against the dogfood corpus decides whether the new advice measures better, and the profile updates deliberately instead of drifting.

One-line thesis: the ecosystem's problem isn't bad advice, it's unenforced advice — enforcement is the part nobody built.

## Agent-first interface principle

From the same discussion (user direction): humans will not compose skills by typing CLI commands; agents do the work under human instruction. Therefore:

- The `shakespii` CLI is the **deterministic substrate** — built for agents and CI: parseable output (`--json`), exit codes, rule IDs, zero LLM calls. Same reason agents run `tsc`/`eslint` instead of eyeballing code: pure functions don't drift, don't hallucinate, and cost no tokens.
- The **primary human interface is conversation**; agents drive shakespii via a companion skill. shakespii ships its own skill(s) teaching agents the workflows: audit ("lint the corpus, interpret findings, propose fixes") and authoring (init → draft → lint-loop until clean → evals → present).
- Roadmap implication (to confirm at kickoff): a "using-shakespii" companion skill belongs right after M2, not waiting for M5. The M5 writer-as-skill remains the full authoring loop; the companion skill is the thin operational layer that arrives with the MVP.
- Recursive dogfood holds: the companion skill is itself linted and tested by shakespii.
- Layering mirrors the ecosystem's own convention (skills wrap `scripts/`): CLI = script layer, skill = interface layer, human = intent layer.
