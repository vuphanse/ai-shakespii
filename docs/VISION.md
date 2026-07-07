ai-shakespii

Local-first workbench for crafting reusable AI agent skills.

Vision

Most prompt tools focus on writing better prompts.

ai-shakespii focuses on designing better capabilities.

A skill should be treated like a software component:

* Single responsibility
* Clear inputs and outputs
* Versioned
* Reviewable
* Testable
* Reusable

The goal is not to create clever prompts.

The goal is to build reliable, reusable engineering skills that can be shared across projects and teams.

⸻

Initial Scope

The first version should target one audience only:

Software engineers working with coding agents.

Do not optimize for general-purpose prompting.

Focus on engineering workflows.

Examples:

* Repository inspection
* Architecture review
* Bug investigation
* Root cause analysis
* Performance profiling
* Refactoring planning
* API review
* Security review
* Test generation
* Documentation improvement
* Codebase onboarding

Quality is more important than quantity.

Twenty excellent skills are more valuable than hundreds of mediocre ones.

⸻

Phase 1 — Skill Specification

Before writing any skills, define what a good skill looks like.

A skill should contain:

Skill
├── Metadata
├── Intent
├── Inputs
├── Preconditions
├── Procedure
├── Output
├── Examples
└── Anti-patterns

Example metadata:

name: inspect-repository
purpose:
  Produce an engineering review of a repository.
when:
  - User asks to inspect a repository.
  - User requests an architecture review.
inputs:
  - repository
  - optional focus
outputs:
  - summary
  - strengths
  - weaknesses
  - recommendations

This is not prompt engineering.

This is capability engineering.

⸻

Phase 2 — Skill Writer

Once the specification exists, build the authoring workflow.

Idea
    ↓
Interview
    ↓
Draft Skill
    ↓
Critique
    ↓
Refine
    ↓
Validate
    ↓
Publish

The first implementation can use a single LLM.

The value comes from asking the right questions rather than orchestrating multiple models.

⸻

Phase 3 — Skill Linter

One of the most valuable features would be validating skills.

Questions to evaluate:

* Is the objective clear?
* Are the required inputs defined?
* Are the expected outputs defined?
* Is the procedure deterministic enough?
* Are examples provided?
* Are failure modes documented?
* Does it rely on hidden assumptions?
* Is it reusable outside one project?
* Should this be split into multiple skills?

Example:

shakespii lint review-pr

Possible output:

Warning:
Procedure contains 19 steps.
Suggestion:
Split into two skills.
Warning:
Output format not specified.
Warning:
Examples missing.
Overall score:
82 / 100

Treat skills like code.

Lint them before publishing.

⸻

Phase 4 — Skill Test Harness

A skill should be executable against representative scenarios.

Example:

Skill:
review-pr

Automatically generate evaluation cases.

Scenario 1
Inspect this repository.
Scenario 2
Focus on security concerns.
Scenario 3
Review only the architecture.
Scenario 4
Repository has almost no tests.

Evaluate whether the skill consistently produces outputs that match its intended purpose.

Reliable skills should be verified, not assumed.

⸻

Phase 5 — Skill Library

Only after the tooling is mature.

Start with a curated collection of engineering skills.

Examples:

* Repository inspection
* Architecture review
* Bug investigation
* Root cause analysis
* Performance profiling
* Refactoring planning
* API design review
* Security review
* Test generation
* Migration planning
* Release checklist
* Dependency audit
* Documentation improvement
* Codebase onboarding
* Technical design review

The library should demonstrate quality, consistency, and good engineering practices.

⸻

Guiding Philosophy

The project is not about writing prompts.

It is about designing reusable capabilities.

A good skill should resemble a well-designed software module:

* Clear responsibility
* Explicit contract
* Predictable behavior
* Easy to compose
* Easy to review
* Easy to evolve

If software engineering has APIs, libraries, and modules, AI-assisted engineering should have skills with the same level of discipline.

⸻

MVP

The very first command should be:

shakespii init review-pr

Generate a complete scaffold:

review-pr/
├── skill.md
├── examples.md
├── test-cases.md
└── README.md

Everything else—writing, refinement, linting, validation, and publishing—should operate on this well-defined artifact.

Keep the first version intentionally small.

Build the foundation first.
