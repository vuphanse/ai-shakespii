# Headless eval rules

Scenario evals run in single-turn, non-interactive sessions: the executor
gets one prompt, produces one transcript, and the session ends. An eval that
expects a mid-run conversation stalls at its first question and fails its
grading. Author every case against these rules.

1. Every expectation must be observable in a single-turn transcript: a tool
   call made, a file written, or content of the final message.
2. The prompt carries every input the skill's procedure would elicit from a
   human. If the procedure says "confirm X with the human", the prompt
   supplies X and states that approval is granted.
3. No expectation may require asking and waiting. Reword "asks approval
   before Y" to the observable form: "does not do Y", plus — where the
   presentation itself is the deliverable — "presents Y in its final
   message".
4. Token-spend confirmations are pre-granted in the prompt for any eval
   whose procedure requires them.
5. Keep at least one near-miss negative case: a prompt that resembles the
   skill's triggers but must not engage it, with expectations asserting the
   skill's behavior is absent.

Example rewording. Before: "Confirms the plan with the user before editing."
After (prompt gains: "The plan is approved — proceed without checking in.")
the expectation becomes: "Proceeds under the prompt's approval without
stalling for further confirmation."
