---
name: fixme-task
description: End-to-end orchestrator that chains fixme-write-plan, fixme-review-plan, fixme-handle-plan-review, fixme-execute-plan, fixme-review-code, and fixme-handle-code-review into an automated pipeline with review loops, decision persistence, and context accumulation. Use when given a task that should go through the full plan-execute-review cycle.
---

# Fixme Task - End-to-End Orchestrator

Chain all fixme skills into a single automated pipeline. Dispatch each sub-skill as an isolated agent. Manage context accumulation, decision persistence, and loop control.

## Hard Constraints

- **This skill is a dispatcher.** It never writes plans, reviews code, or classifies findings itself. It dispatches sub-skills as agents and routes their outputs.
- **Never lose context.** Every piece of information (task, plans, findings, decisions, execution results) accumulates across iterations. Nothing is dropped.
- **Never override locked decisions silently.** If a conflict arises, present it to the user.
- **Never push code that doesn't pass verification.** The fixme-execute-plan sub-skill enforces this, but the orchestrator must not proceed past execution if verification failed.

## Input Resolution

Resolve the task and starting point:

### Task
Resolve in this order - stop at the first match:

1. **Argument with path**: if a file path is passed, use it directly
2. **Argument referencing context** (e.g. "see plan", "the plan", "attached"): the plan/task is already in the conversation. Check the skill expansion content above (plans are often injected inline when the skill is invoked). Also check IDE selection context (`ide_selection` tags). Do NOT search the filesystem - the user is telling you it's already here.
3. **IDE selection context**: if `ide_selection` tags contain a plan or spec, use it
4. **Conversation context**: if the task was discussed earlier in conversation, use it
5. **Ask**: prompt the user for what to build

**CRITICAL**: When the argument is a reference like "see plan" or "the plan above", the plan content is almost always already present in the current message context (injected by the skill system or IDE). Read the full prompt carefully before searching the filesystem.

### Start From

Detect where to enter the pipeline based on what already exists. Check sources in this order: (1) conversation/prompt context (plans injected inline by skill system), (2) IDE selection, (3) argument as file path, (4) `.fixme/plans/` directory.

- **Plan exists** (found in conversation context, IDE selection, path argument, or `.fixme/plans/`): skip fixme-write-plan, enter at **fixme-review-plan**. The plan loop starts from review, not write.
- **Plan exists + already reviewed** (review findings provided): enter at **fixme-handle-plan-review**.
- **Plan exists + already executed** (execution results or code changes present): enter at **fixme-review-code**.
- **Nothing exists**: start from **fixme-write-plan** (default).

When entering mid-pipeline, still resolve the original task (for context accumulation) and check for an existing decision log at `.fixme/decisions.md`.

## Flow

```
User provides task (+ optional existing plan/findings/execution results)
        |
        v
   Detect entry point (see Start From above)
        |
        v
=== OUTER LOOP (max 2 iterations) ===
  |
  |  --- PLAN LOOP (max 3 inner iterations) ---
  |  |
  |  |  fixme-write-plan(mode based on iteration, task + accumulated context)
  |  |  [ENTRY: skip if plan already exists on first iteration]
  |  |      |
  |  |  fixme-review-plan(plan path)
  |  |  [ENTRY: start here if plan exists but hasn't been reviewed]
  |  |      |
  |  |  fixme-handle-plan-review(findings + plan + decision log)
  |  |      |
  |  |      +-- Has ASK-USER items?
  |  |      |    -> Batch all questions, present to user
  |  |      |    -> User answers all at once
  |  |      |    -> Write answers to decision log as locked decisions
  |  |      |    -> Re-invoke fixme-handle-plan-review with updated decisions
  |  |      |    -> Re-evaluate (may produce new FIX/ASK-USER/Clean)
  |  |      |
  |  |      +-- Has FIX items (and no ASK-USER)?
  |  |      |    -> Increment plan loop counter
  |  |      |    -> If counter > 3: escalate to user
  |  |      |    -> Else: fixme-write-plan(plan revision: task + plan + FIX + decisions)
  |  |      |    -> Back to fixme-review-plan
  |  |      |
  |  |      +-- Clean (no FIX, no ASK-USER)
  |  |           -> Exit plan loop
  |  |
  |  --- END PLAN LOOP ---
  |
  |  fixme-execute-plan(plan path)
  |  [ENTRY: skip fixme-write-plan + plan loop if plan already executed]
  |      |
  |  fixme-review-code(plan path + git diff)
  |  [ENTRY: start here if execution done but not yet reviewed]
  |      |
  |  fixme-handle-code-review(findings + plan + decision log)
  |      |
  |      +-- Has ASK-USER items?
  |      |    -> Same batching flow as plan loop
  |      |    -> Re-invoke fixme-handle-code-review with updated decisions
  |      |
  |      +-- Has FIX items (and no ASK-USER)?
  |      |    -> Increment outer loop counter
  |      |    -> If counter > 2: escalate to user
  |      |    -> Else: next outer iteration
  |      |    -> fixme-write-plan(code revision: task + plan + exec results + FIX + decisions)
  |      |    -> Back to plan loop
  |      |
  |      +-- Clean (no FIX, no ASK-USER)
  |           -> DONE
  |
=== END OUTER LOOP ===
```

## Sub-Skill Dispatch

Dispatch each sub-skill as an isolated agent via the Agent tool. Pass all required inputs as prompt content.

### fixme-write-plan

**Fresh mode (first invocation):**
- Original task description

**Plan revision mode:**
- Original task description
- Path to previous plan (agent reads it)
- FIX items from fixme-handle-plan-review (full handler output, markdown)
- Path to decision log (agent reads it)

**Code revision mode:**
- Original task description
- Path to previous plan (agent reads it)
- Execution results from fixme-execute-plan completion report (full report, markdown)
- FIX items from fixme-handle-code-review (full handler output, markdown)
- Path to decision log (agent reads it)

### fixme-review-plan

- Path to plan

### fixme-handle-plan-review

- Review findings (full output from fixme-review-plan)
- Path to plan
- Path to decision log (if it exists)

### fixme-execute-plan

- Path to plan

### fixme-review-code

- Path to plan
- Git diff information (base branch or commit range)

### fixme-handle-code-review

- Review findings (full output from fixme-review-code)
- Path to plan
- Path to decision log (if it exists)

## Decision Log

Persisted at `.fixme/decisions.md` in the project root. Created by the orchestrator on first ASK-USER interaction. Only the orchestrator writes to this file - sub-skills read it.

Format:

```markdown
# Decision Log

## Iteration 1 - Plan Review

### Decision 1
- **Question**: [full question text as presented to user]
- **Answer**: [user's answer]
- **Locked Decision**: [one-line decision derived from the Q&A, used by downstream skills]

### Decision 2
...

## Iteration 1 - Code Review

### Decision 3
...

## Iteration 2 - Plan Review
...
```

Rules:
- Accumulates across all iterations. Never remove previous entries.
- Each entry has a sequential number across the entire log (Decision 1, 2, 3...) for easy reference.
- The "Locked Decision" line is what downstream skills match against. It must be a clear, actionable statement (e.g., "Use WebSocket for real-time updates, not SSE" not "User prefers WebSocket").
- When a locked decision is revisited via ASK-USER (because new evidence emerged), append a new entry that references and supersedes the old one: "Supersedes Decision N: [new decision]".

## ASK-USER Batching

When a handler produces ASK-USER items:

1. Collect all ASK-USER items from the handler output.
2. Present to user as a numbered list. Each item includes the full Question field from the handler (which follows the ASK-USER Question Guidelines: Problem, Context, Why it matters, Options, Recommendation, The actual question).
3. User provides all answers in one response.
4. Write each answer to decision log with a derived Locked Decision.
5. Re-invoke the SAME handler with updated locked decisions (not restart the loop). The handler re-evaluates remaining findings against the new decisions - some may flip from ASK-USER to FIX or NO-FIX.
6. If the handler produces MORE ASK-USER items after re-invocation: batch and present again (max 2 rounds of questions per handler invocation, then escalate to user).

## Loop Guards

- **Plan loop**: max 3 iterations. If FIX items remain after 3, present them to user with context: "These issues persist after 3 plan revision attempts: [list]. Options: (a) proceed to execution anyway, (b) provide guidance on how to resolve, (c) abort."
- **Outer loop**: max 2 iterations. If FIX items remain after 2, present them to user: "These code review issues persist after 2 full cycles: [list]. Options: (a) accept current state, (b) provide guidance, (c) abort."

## Error Handling

- **Sub-skill agent fails unexpectedly**: stop, report to user with full context of what succeeded and what failed, offer to resume from last successful step.
- **Loop guard triggers**: present accumulated FIX items with context and options (see Loop Guards).
- **Execute-plan surfaces a plan concern during execution**: route back through plan loop as a plan revision (not handled ad-hoc by executor).
- **Execute-plan pre-existing failure proof**: include in execution results passed to code revision fixme-write-plan.

## Run Summary

At completion, output:

```markdown
## Run Summary

**Task**: [original task]
**Result**: [completed / escalated to user / aborted]
**Iterations**: [N outer x M inner plan loops]

### Decisions Made
[numbered list of all locked decisions]

### FIX Items Resolved
[per iteration: what was found and how it was addressed]

### Final Verification
[paste fixme-execute-plan's clean verification output]

### Commits
[list with hashes and messages]

### Files Changed
[list of all files created/modified across all iterations]
```
