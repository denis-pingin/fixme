---
name: fixme-execute-plan
description: Execute an implementation plan with maximum reliability. Follows plan steps exactly, verifies after every task, and enforces a non-negotiable final verification gate where build, lint, and ALL tests must pass before work is considered complete. Pre-existing failure claims require proof.
argument-hint: "<path to plan file> [--repair]"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Execute Plan

Execute an implementation plan step by step. Verification is sacred. Work is never done until everything passes.

## Hard Constraints

- **Follow the plan exactly.** Do not improvise, skip steps, reorder, or "improve" beyond what the plan says. If the plan is wrong, stop and surface it - don't silently deviate.
- **Never claim work is done until verification passes.** "It should work" is not done. "Tests pass" is done.
- **Never skip a verification step.** Every "run test", "run lint", "run build" step in the plan is mandatory. If the plan doesn't include one where it should, add it.
- **Never dismiss failures as pre-existing without proof.** See the Pre-Existing Failures section.
- **Never start implementation on main/master without explicit user consent.**

## Input Resolution

Resolve the plan in this order:
1. **Argument**: if a plan path and optional code map path are passed as arguments, use them
2. **IDE context**: if the user has a plan file open/selected, use it
3. **Convention**: check `<fixme-dir>/plans/` for the most recent plan
4. **Ask**: prompt the user for the plan location

## Process

### Repair Mode

Repair Mode is used only when `fixme-task` routes blocking code review findings with `ROUTE_SCOPE: IMPLEMENT_ONLY` back to the executor. Repair items come from implementation-only code review findings. The existing plan remains authoritative.

In repair mode:

1. Read the plan, task code map, execution summary, review context packet, and repair items.
2. Confirm every repair item is implementation-only. If any item requires changing task scope, architecture, ordering, locked decisions, or the plan itself, stop and report it as plan-required.
3. Apply the smallest code and test changes that satisfy the repair items.
4. Preserve all unrelated code and all plan decisions.
5. Run the same final verification gate as normal execution.
6. End with the normal executor directive.

Do not redesign the plan in repair mode. Do not implement follow-up-only `MINOR` or `INFO` items unless they are directly adjacent to the repair and add no extra risk.

### Phase 1: Load and Review

1. Read the plan fully
2. Read the plan's `## Context` section. Stable Context provides architectural background. Locked Decisions are settled user choices - do not question or deviate from them during execution. If a plan step seems to contradict a locked decision, treat it as a plan concern and stop (step 5).
3. Read the task code map if provided or referenced in the plan. Use it to target source reads and verify API shapes, patterns, and commands. It is orientation, not authority.
4. Read every file referenced in the plan's File Map - verify paths exist (for modifications) and parent directories exist (for creations)
5. Identify concerns:
   - Steps that seem wrong given the current codebase state
   - Missing dependencies or prerequisites
   - Ambiguous steps that could be interpreted multiple ways
   - Steps that reference files/APIs/types that don't exist
6. If concerns exist: **stop and raise them with the user before writing any code**
7. If no concerns: proceed

### Phase 2: Baseline

Before writing any code, capture the current state:

1. Run the project's full verification suite (build, lint, typecheck, tests). Run independent commands in parallel - see [Running Verification Commands in Parallel](#running-verification-commands-in-parallel).
2. Record the results. This is the **baseline**.
   - If baseline is fully clean: any failure after changes is caused by the changes
   - If baseline has failures: record exactly which tests fail and with what errors. This is the ONLY valid reference for pre-existing failure claims later

This step is non-negotiable. Without a baseline, there is no way to distinguish regressions from pre-existing issues.

### Phase 3: Execute

For each task in the plan:

1. Read the task steps
2. Execute each step exactly as written
3. After each code change, verify it compiles/typechecks before moving on
4. Run task-level verifications as specified in the plan
5. If a step fails:
   - Read the error carefully
   - Check if the plan's approach is wrong or if the implementation has a bug
   - Fix the implementation if it's a bug in your code
   - If the plan's approach is wrong: **stop and surface to the user**. Do not invent an alternative approach
6. If an ambiguity arises not covered by the plan steps or locked decisions: stop and surface to the user. Do not make ad-hoc decisions that should be locked. When running inside the orchestrator, this routes back to the plan loop.
7. Commit at every commit point specified in the plan. Each commit must leave the codebase in a buildable, passing state

### Phase 4: Final Verification (SACRED)

After all tasks are complete, run the FULL verification suite. Not partial. Not "relevant files only". Everything.

Use the project's documented commands. Common patterns:
- Build: the project's build command
- Lint/format: the project's lint command
- Typecheck: the project's typecheck command
- Tests: ALL test suites, not just the ones touched

Run independent commands in parallel - see [Running Verification Commands in Parallel](#running-verification-commands-in-parallel).

**Capture sufficient output.** Use `2>&1 | tail -150` or more. Never truncate to a small number of lines - missing the actual error and re-running a multi-minute suite is unacceptable.

**Every check must pass with zero errors and zero warnings.** Not "mostly passes". Not "only warnings". Zero.

If any check fails:
1. Fix it
2. Re-run ALL checks from the beginning (not just the one that failed - fixes can introduce new issues)
3. Repeat until everything is green

**Work is not done until this phase produces a fully clean run.**

### Running Verification Commands in Parallel

Verification commands that do not depend on each other MUST run in parallel, not sequentially. This applies to Phase 2 (Baseline), Phase 3 task-level verifications, and Phase 4 (Final Verification).

**What is independent:**
- Build, lint, and typecheck of the same target are independent of each other.
- Test suites for separate apps, packages, or workspaces in a monorepo (e.g. `yarn workspace api test`, `yarn workspace web test`, `yarn workspace mobile test`) are independent of each other.
- Build/lint/typecheck across separate workspaces are independent of each other.

**What is NOT independent:**
- A test command that requires a build artifact produced by an earlier step. Run the build first, then the dependent test.
- Commands that mutate shared state (lockfiles, generated files, the same output directory) - run sequentially or fix the conflict.

**How to run in parallel:**

1. For each independent command, start it with `Bash` using `run_in_background: true`. Capture the returned shell ID.
2. Do not poll or sleep. The runtime notifies you when each background shell completes.
3. After every shell has completed, read each shell's output with `BashOutput` and aggregate results. Capture sufficient output per shell using `2>&1 | tail -150` or more.
4. Treat the verification gate as failed if ANY shell fails. Do not stop the others early - finish collecting results so the user sees every failure on the first run.
5. If any shell fails, fix the issue and re-run ALL verification commands from the beginning, again in parallel. Fixes can introduce new failures elsewhere.

**Sequential is acceptable only when:**
- There is exactly one verification command (single test command that internally fans out, e.g. Turbo/Nx/Lerna already running its own internal parallelism).
- A later command genuinely depends on an earlier command's output.
- Running in parallel would exhaust system resources (only when verified, not assumed).

**Example - monorepo with three independent test suites:**
- BAD: run `yarn workspace api test`, wait, run `yarn workspace web test`, wait, run `yarn workspace mobile test`. Three serial multi-minute waits.
- GOOD: start all three with `run_in_background: true` in a single message, wait for all completion notifications, read each output via `BashOutput`, then report aggregated pass/fail.

## Pre-Existing Failures

When a test or check fails after implementation and the claim is "this was already broken":

**The claim is INVALID unless proven.** To prove it:

1. Stash or revert all changes from this execution
2. Run the exact same failing test/check
3. Confirm it produces the EXACT same error (same test name, same error message, same failure mode)
4. Re-apply changes

If the error is different in any way - different message, different test, different line number - it is NOT pre-existing. It's a regression. Fix it.

If the error is genuinely identical:
- Document it explicitly: "Test X was failing before changes with error Y. Verified by running without changes."
- Do not let it block completion, but report it clearly in the completion summary

**Never claim pre-existing without running the proof.** "I think this was already broken" is not evidence.

## When to Stop and Ask

**Stop immediately when:**
- A plan step is ambiguous or could be interpreted multiple ways
- A plan step references something that doesn't exist
- A verification fails and the fix isn't obvious from the plan
- The plan's approach seems wrong given what you've learned during execution
- You've attempted to fix a failure 3 times without success

**Ask rather than guess.** A wrong guess costs more than a pause.

## Minimizing FIX_NEEDED Feedback

Common causes of FIX_NEEDED findings and how to prevent them:

- **Incomplete implementation**: read the plan step fully before starting it. Don't start coding after reading half the step.
- **Wrong API usage**: verify the actual API by reading source code or types, not from memory. APIs change between versions.
- **Missed edge cases**: if the plan specifies error handling or edge cases, implement them. Don't defer "for later".
- **Inconsistent naming**: use exactly the names the plan specifies. If the plan says `computeLandingIndex`, don't write `calculateLandingIndex`.
- **Forgotten test updates**: when implementation changes behavior, check if existing tests need updating. Don't leave tests asserting old behavior.
- **Partial commits**: every commit must build and pass. Don't commit half-implemented features.
- **Skipped verification**: the number one cause. Just run the checks.

## Completion

When final verification passes with zero errors and zero warnings:

Report:
1. **Summary**: what was implemented
2. **Tasks completed**: list with status
3. **Commits created**: list with hashes and messages
4. **Verification results**: paste the clean output
5. **Pre-existing issues**: if any were proven, list them with evidence
6. **Notes**: anything the user should know that isn't captured above

## Output Format

When running as part of the fixme-task pipeline (dispatched by the orchestrator), end your report with:

```
---
EXECUTOR_STATUS: COMPLETE
NEXT_PIPELINE_STEP: fixme-review-code
```

This signals the orchestrator to continue the pipeline. Do NOT output a "Run Summary" or any language suggesting the overall task is done - you are one step in a larger pipeline. The orchestrator owns the final summary.
