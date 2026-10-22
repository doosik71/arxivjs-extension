# AGENTS.md

This file defines the working rules that agents contributing to this project must follow.

## Think Before Coding

* Respect the project goals described in `README.md`.
* Do not guess requirements on your own.
* When requirements, intent, or expected behavior are ambiguous, ask before implementing.
* If there are trade-offs that could materially affect architecture, UX, data flow, model behavior, file layout, or tests, present them before coding.
* Do not hide confusion or uncertainty.
* When you proceed on reasonable assumptions, state those assumptions explicitly in your final report.

## Simplicity First

* Aim for the simplest solution that solves the problem.
* Do not introduce abstractions prematurely.
* Avoid speculative generalization, bloated APIs, and unnecessary flexibility.
* If a small change solves the problem, do not swap in a large framework or rewrite the code.

## Surgical Changes

* Modify only the files relevant to the task.
* Avoid drive-by refactors and rewriting unrelated code.
* Do not overwrite or revert unrelated user changes.
* Preserve the existing architecture and comments unless a change is required or a comment is wrong.

## Goal-Driven Execution

* Before starting a substantive change, define a clear, verifiable success goal.
* Prioritize the narrowest useful verification.
* When fixing build or runtime errors, verify with the actual script or command the user runs whenever possible.
* If verification is blocked by environmental constraints, state exactly what was blocked and what remains unverified.
* Do not introduce temporary placeholder implementations without clearly marking their limitations and rationale.
* If a platform-specific dependency does not work on another target, document the constraint and choose an implementation that keeps the project buildable.

## Commit Message Rules

* Write commit messages in clear English.
* Use a subject line that starts with an imperative verb.
* Keep the subject concise and specific about the actual change.
* Avoid vague subjects such as `fix stuff`, `update code`, or `changes`.
* Prefer the style already established in the repository:

```text
Add desktop fallback runner and fix activation exit code

- return success explicitly from `bin/activate.bat` so launcher scripts do not
  treat successful activation as a failure
- replace Android-only Desktop LiteRT usage with a JVM-safe fallback runner so
  `app-desktop` can compile and run
- keep model-file existence checks so missing Desktop assets still fail fast
```

* When needed, add short bullet points after the subject explaining what changed, why, and any important constraints or compatibility notes.
* The commit message must match the actual staged diff, not the intended plan.
