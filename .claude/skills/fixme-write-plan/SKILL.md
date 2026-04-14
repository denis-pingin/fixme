---
name: fixme-write-plan
description: Write implementation plans that are unambiguous, complete, correct, and efficient. Plans are written for an engineer with zero codebase context. Guards against any source code modifications - only the plan document is produced. Reads the codebase thoroughly before writing. Runs a mandatory Input Audit gate before any planning work to surface ambiguities and locked decision conflicts. Supports four modes - fresh (full exploration), plan revision (incorporate plan review FIX items), code revision (incorporate code review FIX items after execution), and rewrite (improve existing plan without structured FIX items).
argument-hint: "<task description or path to spec>"
---

# Write Plan

Write implementation plans that leave nothing to interpretation. The plan is the only output - no source code modifications allowed.

## Why This Matters

The plan is the foundation of a pipeline where each downstream step has less context and fewer decision-making capabilities than the one before it. A reviewer can only verify - it can't redesign. An executor can only follow instructions - it can't make architectural choices. A code reviewer can only catch bugs in what was built - it can't fix design flaws.

Every gap, ambiguity, or wrong assumption in the plan cascades downstream and costs exponentially more to fix. A missed dependency in the plan becomes a blocking failure in execution. A vague step becomes a wrong implementation becomes a code review finding becomes a revision cycle.

**The goal is one-shot success.** The plan must be so thorough, so precise, and so correct that it flows through review, execution, and code review without generating a single finding. This is the standard. Achieving it requires reading more code than feels necessary, resolving more ambiguity than seems important, and writing more detail than appears needed.

## Hard Constraints

- **NO source code modifications.** Only create/edit the plan document itself. If tempted to "quickly fix" something in the codebase, stop. That's the executor's job.
- **NO assumptions.** If anything is unclear about the task, the codebase, or the approach - surface it in the Questions section or ask the user directly. Never guess.
- **NO thought process in the plan.** No "we could do X or Y" discussions, no tradeoff analysis, no "I considered...". The plan states what to do, not what was considered. Decisions are made before they enter the plan.
- **NO ambiguity.** Every step must be actionable by an engineer who has never seen this codebase. If a step could be interpreted two ways, it's wrong.
- **NO delegation of design to the executor.** If a step requires the executor to decide *what* to write (not just *how* to type it), the step is incomplete. The plan makes all design decisions. The executor makes zero. See the Delegation Test below.

## Delegation Test

Before writing any step that creates or modifies a file, apply this test:

> Could an executor with zero codebase knowledge execute this step by reading it alone, without opening any other file for design guidance?

If the answer is no, the step is incomplete. Common failures:

- **"Write X based on Y, adapted for Z"** - The executor must open Y, understand it, then make adaptation decisions. Instead: resolve the adaptation yourself and write the final content.
- **"Key adaptations include..."** - This describes what to think about, not what to write. Instead: show the result of those adaptations as concrete content.
- **"Similar to the pattern in Z"** - The executor must find Z, study it, then apply the pattern. Instead: include the pattern inline.
- **"Add appropriate error handling"** - The executor must decide what's appropriate. Instead: specify each error case and its handling.

For new files: include the complete file content in a fenced code block. For large files (>100 lines), include the full structural skeleton with exact section headings, all field values, and key behavioral rules spelled out - leaving only prose body text for the executor to fill from the structural spec.

## Input Resolution

Detect mode from provided inputs:

### Fresh Mode

No previous plan provided. Inputs resolved in this order:
1. **Argument**: if a file path or description is passed, use it
2. **IDE context**: if the user has a file open/selected, use it
3. **Conversation context**: if requirements were discussed, use them
4. **Ask**: prompt the user for what to plan

### Plan Revision Mode

Triggered when the orchestrator provides: previous plan path + plan review FIX items.
Required inputs (provided by orchestrator as arguments):
- **Original task**: the unchanged task description
- **Previous plan path**: the plan being revised
- **FIX items**: classified findings from the plan review handler (markdown)
- **Decision log path**: `.fixme/decisions.md` (may not exist on first iteration)

### Code Revision Mode

Triggered when the orchestrator provides: previous plan path + code review FIX items + execution results.
Required inputs (provided by orchestrator as arguments):
- **Original task**: the unchanged task description
- **Previous plan path**: the plan that was executed
- **FIX items**: classified findings from the code review handler (markdown)
- **Execution results**: summary from the executor's completion report (markdown)
- **Decision log path**: `.fixme/decisions.md`

### Rewrite Mode

Triggered when a prior plan exists but there are no structured FIX items from a review handler. The user wants the plan improved or rewritten.

Inputs:
- **Original task**: the unchanged task description (may be implicit - "improve this plan")
- **Previous plan path**: the plan to improve
- **Decision log path**: `.fixme/decisions.md` (may not exist)

Key rules for rewrite mode:
- **Locked decisions from the prior plan are constraints, not suggestions.** They were settled by the user or a prior iteration. To change one, flag it during the Input Audit - never silently override.
- **Stable Context from the prior plan is a starting point.** Re-verify against the codebase where needed, but do not discard and re-derive from scratch.
- **The Goal line must remain identical** unless the user explicitly changes it.
- **Quality improvements are always in scope**: more precise steps, complete file content, fixed delegation violations, better task ordering, missing verification steps, tighter Expected Outcomes.
- **Architectural changes require user approval**: different design decisions, reversed locked decisions, different scope, different decomposition. These are surfaced as questions during the Input Audit, not made autonomously.

## Input Audit

**This gate runs before ANY codebase exploration or plan writing. It is non-negotiable in ALL modes.**

Before reading source files, understanding the task in depth, or writing a single line of plan - audit all available inputs to surface ambiguities that require user resolution. The purpose of this gate is to prevent the planner from forming opinions (through codebase exploration) before confirming that the task, constraints, and prior decisions are clearly understood. Confidence formed during exploration makes it less likely to ask questions and more likely to silently override prior decisions.

### Step 1: Inventory Inputs

List everything provided or discoverable:

- **Task description**: what the user wants done (from argument, conversation, or IDE context)
- **Existing plan**: if a prior plan is provided or referenced - note its path and identify its Goal, Locked Decisions, and Stable Context sections
- **Locked decisions**: from existing plan's Context section and/or `.fixme/decisions.md`
- **FIX items**: from review handler output (if plan or code revision)
- **Execution results**: from executor (if code revision)
- **User constraints**: explicit instructions, preferences, or scope limits mentioned anywhere in the conversation

### Step 2: Verify Mode

The Input Resolution section (above) detected the mode. Verify it is correct:

- Do the available inputs match the detected mode's required inputs?
- Could the inputs fit a different mode that would change the plan's approach?
- If the inputs don't cleanly match any mode: add "Mode is ambiguous" to the questions list. Explain the ambiguity and present the mode options with their implications.

**Do not default to the most permissive mode when uncertain.** Fresh mode gives the planner maximum freedom (no locked decisions, no prior context to respect). Choosing fresh mode when rewrite or revision mode applies means silently discarding prior decisions. This is the highest-risk mode selection error.

### Step 3: Check Locked Decisions

If ANY prior plan or decision log exists, extract every locked decision. For each one, evaluate:

1. Does it conflict with the current task description?
2. Does it conflict with any FIX item provided?
3. Would you change it based on your own judgment or codebase understanding?

If (1) or (2): add to questions list. State the conflict, why it matters, and present resolution options.

If (3): **this is the most dangerous case.** Your judgment may be correct, but confidence without user confirmation is exactly the failure mode this gate prevents. Add it to the questions list with your reasoning and recommendation. Let the user decide.

If no prior plan or decision log exists: this step produces no questions. Proceed.

### Step 4: Identify Ambiguities

Scan the task description and all inputs for:

- **Underspecified goals**: "make it better", "improve this", "fix the issues" - better/improved/fixed HOW? Along which dimensions?
- **Architectural decisions not yet made**: choices that fundamentally change the plan's structure or approach
- **Scope boundaries not defined**: what's in scope, what's explicitly out?
- **Contradictions between inputs**: task says X, prior plan says Y, FIX item says Z
- **Multiple valid interpretations**: anything that could reasonably be read two different ways

### Step 5: Question Resolution Loop

Collect all questions from steps 2-4 into a single numbered list. Every question MUST include a recommendation. Format each question as:

- **Q[N]**: [the specific question]
- **Why it matters**: [what concretely changes in the plan based on the answer]
- **Options**: [the choices, if applicable]
- **Recommended**: [your suggested answer with brief reasoning]

**If the questions list is empty:** the gate passes. Proceed to Before Writing.

**If the questions list is non-empty:** enter the resolution loop:

1. **Output** the full numbered question list as formatted text (markdown renders in text output).
2. **Ask** the user via AskUserQuestion: "I have [N] questions to resolve before planning. See above. You can answer specific questions by number, or accept all recommendations." with the option "Proceed with recommendations".
3. **Process the response:**
   - If "Proceed with recommendations": lock ALL questions to their recommended answers, marked as **assumed** (see below).
   - If the user answers some questions explicitly: lock those to the user's answers, marked as **confirmed**. For any question the user did NOT answer, lock to the recommendation, marked as **assumed**.
4. **Record** every locked decision in the plan's `### Locked Decisions` section with its confidence level. Each entry uses the format:

   ```
   N. **[confirmed|assumed]** <decision statement>. (<origin: which question, or "carried forward from prior plan">)
   ```

   Two confidence levels:

   - **[confirmed]**: User explicitly chose this (answered the question directly, or carried forward from a prior plan where it was confirmed). To override, you MUST ask the user again with the new evidence. Never silently override.
   - **[assumed]**: Recommendation accepted by default (user did not explicitly answer this question during the Input Audit or Design Decision Checkpoint). If codebase exploration reveals concrete evidence that contradicts this decision, you MAY re-evaluate: present the evidence and the conflicting decision to the user as a new question. The bar is "concrete evidence from the codebase," not "I thought about it more and changed my mind."

   **The `[assumed]` tag may ONLY be applied to decisions that went through a Question Resolution Loop (Input Audit or Design Decision Checkpoint).** A design decision discovered during codebase exploration that was never presented to the user is NOT assumed - it is unconfirmed. Unconfirmed decisions must go through the Design Decision Checkpoint (below) before entering the plan. Marking exploration-phase decisions as `[assumed]` to bypass user confirmation is the single most common planning failure mode.

5. **Consistency check:** review the full set of locked decisions (both confirmed and assumed, including any carried forward from prior plans). Look for contradictions: does decision A imply X while decision B implies not-X? Does a scope decision conflict with an architectural decision? If inconsistencies exist, formulate new questions that surface each inconsistency and go to step 1 with ONLY the new questions.
6. If no inconsistencies: the gate passes.

**You may not skip this gate because:**
- You feel confident about the answers
- The questions seem obvious or trivial
- Asking would slow things down
- You already explored the codebase and "know" the right answer

These are exactly the conditions under which silent overrides happen. The gate exists for when you are most confident, not least.

## Before Writing

### Context Recovery (revision and rewrite modes - skip in fresh mode)

1. Read the previous plan's `## Context` section for Stable Context (architecture, patterns, conventions, dependency versions, API shapes).
2. Read locked decisions from the previous plan's Context section AND from the decision log at `.fixme/decisions.md` (if it exists). Locked decisions are settled - never re-ask.
3. Read the FIX items. For each FIX item:
   - Re-read the specific files it references (targeted, not full codebase)
   - If it contradicts a Stable Context item, re-verify that item against the codebase
   - If it contradicts a locked decision, flag the conflict to the user - do not silently override
   - **Never silently drop a FIX item.** If you believe a FIX should not be implemented, that is not your call - flag it back to the user via the Input Audit as a new question with concrete evidence (what you read, what tradeoff changed your mind, what alternative you propose). "Drop it and add a clarifying comment" is only acceptable when the handler's Approach field explicitly specifies exactly that as the full resolution.
   - **Never substitute your own "lighter touch" for the handler's specified Approach.** If the handler classified a finding as FIX with a specific Approach, implement that Approach as written. If the handler classified as FIX_UNCLEAR, the user's answer in Locked Decisions is the source of truth - follow it. Replacing either with a smaller edit because it seems "simpler" is a silent override and the exact failure mode the handler's Multi-Option Discipline exists to prevent.
4. In **code revision only**: re-read all files that were modified during execution (listed in execution results). The codebase has changed - file-level context is stale.
5. Skip full codebase exploration. Only do targeted re-reads as described above.
6. **Never repeat a failed approach.** If the previous plan was executed and failed, understand why from the execution results and FIX items. Design a fundamentally different approach, not a tweak of the same one. If all obvious approaches have been tried, combine insights from prior failures to derive a new strategy.
7. **Rewrite mode only**: re-read the entire prior plan to understand its structure, task decomposition, and approach. Identify which aspects are quality issues (precision, completeness, delegation violations) vs. architectural choices (design decisions, scope, decomposition). Quality issues are in scope for improvement. Architectural choices are locked unless the user approved changes during the Input Audit.

### Understand the Codebase

Read extensively before writing a single line of plan:
- Directory structure and conventions
- Existing patterns for the type of work being planned (how similar things were done before)
- Relevant source files that will be touched or depended on
- Test patterns and infrastructure (framework, file naming, helper utilities, mock patterns)
- Build/lint/test commands and CI expectations (exact commands from project docs, not guesses)
- Dependencies and their versions (don't assume API shapes - verify by reading source or types)

**Record everything you discover.** Every file you read, every API shape you verify, every pattern you observe goes into the Stable Context section. This is not busywork - it is the foundation that makes one-shot success possible. An incomplete Stable Context means the plan is built on unverified assumptions, and unverified assumptions are where plans fail.

### Understand the Task

- What is the goal? What does "done" look like?
- What are the boundaries? What's explicitly out of scope?
- Are there constraints from the spec, the user, or the codebase architecture?
- What are the risks? What's most likely to go wrong?

In revision mode, the original task is the source of truth for the goal. Do not re-derive or drift. The Goal line in the plan header must remain identical across all revisions.

### Resolve Remaining Unknowns

The Input Audit resolved structural ambiguities before codebase exploration began. During exploration, new unknowns may emerge - for example, API shapes that suggest different approaches, patterns that conflict with planned changes, or test infrastructure that doesn't support the planned verification approach.

Classify each discovery:

- **Design decisions** (multiple viable approaches exist, the plan's structure or architecture changes depending on which is chosen): these are NOT unknowns to defer - they are decisions the user must make. Collect them for the Design Decision Checkpoint below.
- **Blocking unknowns** (a single factual question where the plan cannot proceed without the answer - e.g., "does this API support pagination?"): ask the user directly via AskUserQuestion. Do not guess.
- **Informational context** (the plan is correct regardless, but the executor benefits from knowing - e.g., "the API response is double-nested"): collect in the Questions section at the end of the plan.
- **Known flaws** (you discovered that a planned approach won't work - e.g., a route conflict, a spacing bug): these are NOT questions. Fix them in the plan before writing. If you can't fix it without a design decision, it's a design decision - collect it for the checkpoint.

Do not re-ask questions already resolved by the Input Audit. Do not re-open locked decisions settled during the audit unless you discover concrete codebase evidence that makes a locked decision unimplementable - in which case, flag the specific conflict to the user with the evidence.

### Design Decision Checkpoint

**This gate runs after codebase exploration and before writing the plan. It is mandatory whenever design decisions were collected during exploration.**

During exploration, you formed opinions about how to build this. Some of those opinions are mechanical (following an obvious existing pattern with no realistic alternative). Others are genuine design choices where multiple approaches exist and the user's preference matters.

For each design decision collected above, apply this test:

> Does a realistic alternative exist that would materially change the plan's structure, component boundaries, data flow, or user-facing behavior?

- **Yes**: the decision MUST be presented to the user. Add it to the question list below.
- **No** (truly mechanical - only one reasonable approach given the codebase): document it in the plan's Stable Context section as an observation, not a Locked Decision. Example: "The existing hooks all use `withAuthRetry` wrapping `Effect.runPromise`" is an observation. "We'll create a new `agentsFetchPaginated` helper instead of modifying the shared one" is a design decision.

Collect all questions and present them to the user using the same format as the Input Audit's Question Resolution Loop (Step 5). Process answers identically: explicit answers become `[confirmed]`, accepted recommendations become `[assumed]`. The `[assumed]` tag is valid here because the user was asked.

**If no design decisions were collected:** the checkpoint passes silently. Proceed to writing.

**If all design decisions are truly mechanical (no alternatives):** the checkpoint passes silently. Document each in Stable Context.

**You may not skip this checkpoint because:**
- You already explored the codebase and "know" the right approach
- The design decisions seem obvious
- Asking would slow things down
- You can always mark them `[assumed]` later

The Input Audit prevents premature confidence before exploration. This checkpoint prevents post-exploration confidence from bypassing user confirmation. Together they ensure every design decision in the plan was either confirmed by the user or explicitly accepted as a recommendation.

## Plan Save Location

Save to `.fixme/plans/<date>-<feature-name>.md` in the project root. Create the directory if it doesn't exist. Use ISO date format: `YYYY-MM-DD`.

In revision mode, overwrite the existing plan file at the same path. Do not create a new file.

## Plan Document Structure

```markdown
# [Feature Name] Implementation Plan

> Execute with `/fixme-execute-plan`

**Goal:** [One sentence - what this builds or fixes]

**Architecture:** [2-3 sentences - approach and key design decisions]

**Tech Stack:** [Key technologies/libraries involved]

---

## Context

### Stable Context
- [Architecture patterns and conventions discovered during codebase exploration]
- [Dependency versions and API shapes that influenced decisions]
- [Project structure and naming conventions]
- [Build/test/lint commands and CI expectations - exact commands]
- [Key constraints and design decisions with rationale]
- [File-level context: summaries of key files read, their roles, relevant line ranges]

### Locked Decisions
[User answers from ASK_USER and FIX_UNCLEAR questions. Each entry: the question, the answer, and the resulting decision. Empty on first pass. In revision mode, carry forward from previous plan and decision log.]

---

## File Map

[List every file that will be created or modified, with a one-line description of what changes and why]

- Create: `exact/path/to/file.ts` - [responsibility]
- Modify: `exact/path/to/existing.ts:L42-L68` - [what changes]
- Test: `exact/path/to/file.test.ts` - [what's tested]

---

## Tasks

### Task 1: [Component/Feature Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Test: `exact/path/to/file.test.ts`

**Expected Outcome:**
- **Build:** [passes / N/A]
- **Lint:** [passes / N/A]
- **Tests:** [which tests pass, new test names]
- **Behavior:** [observable state change, verifiable condition]

- [ ] Step 1: [action]
- [ ] Step 2: [action]
...
- [ ] Step N: Commit

### Task 2: ...

---

## Questions

[Informational context for the executor - things that are true regardless of the plan's approach but useful to know during implementation. If none, omit this section.

This section is NOT a place to defer:
- **Correctness concerns** ("this might not work because...") - fix the plan or ask the user
- **Feasibility risks** ("if routing issues arise...") - resolve before writing the plan
- **Design decisions** ("we could do X or Y") - decide via the Design Decision Checkpoint
- **Known flaws** ("the executor may need to override this") - that means the plan is incomplete

If an item starts with "if", "might", "may need to", or "the executor should decide" - it does not belong here. Either resolve it or escalate it.]
```

## File Map

Before defining tasks, map every file that will be created or modified. This locks in the decomposition.

- Each file gets one clear responsibility
- Files that change together live together
- Follow existing codebase patterns for structure and naming
- Include exact paths, always
- Include line ranges for modifications when possible (after reading the file)

## TDD-First Task Structure

**TDD is the primary organizing principle for every task that changes behavior.** This is not a style preference - it is the strongest guarantee of correctness available. A test written before implementation proves the test is meaningful (it fails without the code). A test written after implementation might pass for the wrong reason and catch nothing.

### Behavioral Tasks (code that changes observable behavior)

Every behavioral task MUST use this step pattern:

```markdown
### Task N: [Feature/Fix Name]

**Files:**
- Test: `exact/path/to/file.test.ts`
- Create/Modify: `exact/path/to/file.ts`

**Expected Outcome:**
- **Build:** passes with zero errors
- **Lint:** passes with zero warnings
- **Tests:** `test_name_here` passes; full suite passes
- **Behavior:** [specific observable change]

- [ ] Step 1: Write failing test for [specific behavior]

  In `exact/path/to/file.test.ts`, add:
  ```lang
  [exact test code]
  ```

- [ ] Step 2: Run test, verify it fails

  ```bash
  [exact test command]
  ```
  Expected: [exact failure message or pattern, e.g., "FAIL - expected 200, received 404"]

- [ ] Step 3: Implement [specific change]

  In `exact/path/to/file.ts:L42-L68`, [exact description of change with code if non-obvious]

- [ ] Step 4: Run test, verify it passes

  ```bash
  [exact test command]
  ```
  Expected: all tests pass

- [ ] Step 5: Run full verification

  ```bash
  [build command] && [lint command] && [test command]
  ```
  Expected: zero errors, zero warnings, all tests pass

- [ ] Step 6: Commit

  ```bash
  git add [specific files]
  git commit -m "[message]"
  ```
```

**The test code in Step 1 must be complete and correct.** Not "write a test that checks X" - the actual test code. The planner has the deepest codebase context of anyone in the pipeline. The executor has the least. If the planner doesn't write the test, the executor will write a worse one.

**The expected failure in Step 2 must be specific.** Not "test fails" but the actual error message or pattern. This serves as a checkpoint - if the executor sees a different failure, they know something is wrong before wasting time on implementation.

### Non-Behavioral Tasks (config, docs, refactors with existing coverage, file moves)

Non-behavioral tasks skip the test-first steps but MUST still include verification:

```markdown
- [ ] Step 1: [the change]
- [ ] Step 2: Run full verification
  ```bash
  [build command] && [lint command] && [test command]
  ```
  Expected: zero errors, zero warnings, all existing tests still pass
- [ ] Step 3: Commit
```

### Classifying Tasks

| Task Type | TDD Required? | Examples |
|-----------|--------------|----------|
| New feature | Yes | Adding an endpoint, component, function |
| Bug fix | Yes | The test reproduces the bug first |
| Behavior change | Yes | Changing how existing code works |
| Refactor (same behavior) | No, but verify | Renaming, restructuring, extracting |
| Config/docs | No, but verify | `.json`, `.md`, env vars, CI config |
| File moves/deletes | No, but verify | Moving files, updating imports |
| New file (no behavior) | No, but verify | Templates, schemas, reference docs |

## Task Granularity

Each step is one action, small enough to verify immediately:

- "Write failing test for [specific behavior]" - one step
- "Run test, verify it fails with [expected error]" - one step
- "Implement [specific thing]" - one step
- "Run test, verify it passes" - one step
- "Run full lint/typecheck/test suite" - one step
- "Commit" - one step

### What Goes in a Step

- **Exact file paths** - never "the config file", always `src/config/auth.ts`
- **Exact commands** with expected output - never "run tests", always the project's actual test command with the specific test filter and what success/failure looks like
- **Concrete content for new files** - include the full content in a fenced code block, or a detailed structural specification where every section heading, field value, and behavioral rule is spelled out. The executor should be able to type/paste without making design choices.
- **Code when it helps clarity** - include code snippets when the implementation isn't obvious from the description. The bar is: could an engineer with zero context execute this step without stopping to think about what's meant?
- **Line references** for modifications - "In `src/auth.ts:L45-L52`, replace the token check with..."
- **Expected output for verification steps** - what success looks like ("Expected: 14 tests pass, 0 failures") and what failure looks like for test-first steps ("Expected: FAIL - TypeError: X is not a function")

### What Never Goes in a Step

- Alternatives or options ("you could do X or Y")
- Reasoning or justification ("because this pattern is better")
- Vague actions ("add appropriate error handling")
- Multiple unrelated changes in one step
- Delegation phrases: "based on X", "adapted from Y", "similar to Z", "key adaptations include..." - these shift design work to the executor. Resolve the adaptation yourself and write the final result into the step.

## Task Sizing

Each task should be completable in a single focused session. Signs a task is too large:

- More than ~12 steps (including TDD verification steps)
- Touches more than 4-5 files
- Contains multiple independent logical changes
- The "Expected Outcome" requires more than 2 sentences per category

Split oversized tasks. Each task should have one clear purpose and a verifiable outcome. Two 6-step tasks are better than one 12-step task because:
- The executor can verify and commit between them
- A failure in the second task doesn't invalidate the first
- Issues can be pinpointed to a smaller scope

## Expected Outcomes

Every task MUST have a structured **Expected Outcome** block immediately after the Files block:

- **Build:** "passes with zero errors" or "N/A" for non-code tasks
- **Lint:** "passes with zero warnings" or "N/A"
- **Tests:** specific test names that pass + "full suite passes"
- **Behavior:** observable state change, verifiable condition

Examples:
- **For bug fixes:** Build: passes. Tests: `test_auth_redirect_after_login` passes (was failing). Behavior: Login page redirects to `/dashboard` instead of 404.
- **For new features:** Build: passes. Tests: `test_create_ticket`, `test_list_tickets` pass. Behavior: `POST /tickets` returns 201 with ticket object.
- **For refactors:** Build: passes. Tests: all 47 existing tests still pass. Behavior: `grep -r 'OldName' src/` returns zero results.
- **For file operations:** Build: passes. Tests: all pass. Behavior: File exists at new path, `grep -r 'old/path' .` returns zero results.

## Scope Check

If the task covers multiple independent subsystems, suggest breaking into separate plans - one per subsystem. Each plan should produce working, testable software on its own.

## Commit Points

Include explicit commit steps. Each commit should leave the codebase in a working state (builds, passes lint, passes tests). A commit message is included in the step.

For TDD tasks, the natural commit point is after the full Red-Green-Refactor cycle completes and verification passes. Never commit between "write test" and "make test pass" - that leaves a deliberately failing test in the commit.

## Self-Consistency Check

After writing the complete plan, read it end-to-end as if you were the executor. Check:

- **Forward references.** Does step N depend on something created in step M where M > N? Reorder.
- **File Map vs Tasks.** Does every file in the File Map appear in at least one task? Does every file touched in a task appear in the File Map?
- **Expected Outcomes vs Steps.** Can every Expected Outcome be verified by the steps in the task? If an outcome mentions a test name, does a step create that test?
- **Verified claims.** Did you actually read every file path you reference? Did you actually verify every API shape you assume? If you're not sure, go read it now - before saving.
- **Implied steps.** Does creating a new module require updating a barrel export? Does moving a file require updating imports? Does adding a dependency require an install command? These are the steps most often missed.
- **TDD completeness.** Does every behavioral task have the full cycle: write test, verify fails, implement, verify passes?
- **Command accuracy.** Are all commands the project's actual commands from its docs/config, not generic guesses?
- **Delegation violations.** Apply the Delegation Test to every create/modify step. Any "based on", "adapted from", "similar to"?

## Final Checklist

Before saving the plan, verify:
- [ ] Input Audit was performed and all questions were resolved before codebase exploration began
- [ ] Mode was explicitly verified during audit (not defaulted to most permissive)
- [ ] Every locked decision from prior plans was either carried forward unchanged or flagged to the user during audit - none were silently overridden
- [ ] Every step is unambiguous - one interpretation only
- [ ] Every file path is exact and verified to exist (for modifications) or has a clear parent directory (for creation)
- [ ] Every command is exact and runnable (verified against project's actual tooling)
- [ ] No source code was modified during planning
- [ ] No assumptions were made that should be questions
- [ ] Design Decision Checkpoint was performed after codebase exploration - all design decisions with realistic alternatives were presented to the user
- [ ] Questions section contains only informational context - no correctness concerns, feasibility risks, design decisions, or known flaws were deferred there
- [ ] The plan can be executed top-to-bottom without backtracking
- [ ] Dependencies between tasks are explicit and ordered correctly
- [ ] The File Map matches the actual steps (nothing missing, nothing extra)
- [ ] Context section is populated with all significant discoveries from codebase exploration
- [ ] Locked Decisions section carries forward all decisions from previous iterations (revision mode)
- [ ] No FIX item was silently ignored, dropped, downgraded to a clarifying comment, or collapsed to a "simpler" substitute - each is either implemented using the handler's specified Approach (for FIX), resolved via the user's Locked Decision (for FIX_UNCLEAR), or flagged back to the user as a new question with concrete evidence
- [ ] Every task has a structured Expected Outcome (Build/Lint/Tests/Behavior)
- [ ] No step delegates design decisions to the executor - apply the Delegation Test to every create/modify step
- [ ] New file steps include full content or detailed structural specification
- [ ] Every referenced path, API, type, and function was verified against the codebase during exploration
- [ ] Every behavioral task follows TDD structure (test first, verify fail, implement, verify pass)
- [ ] Every verification step includes the exact command and expected output
- [ ] No commit step falls between "write test" and "make test pass"
- [ ] Revision mode: the approach is fundamentally different from any previously failed approach
