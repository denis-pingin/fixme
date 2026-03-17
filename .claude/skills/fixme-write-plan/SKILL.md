---
name: fixme-write-plan
description: Write implementation plans that are unambiguous, complete, correct, and efficient. Plans are written for an engineer with zero codebase context. Guards against any source code modifications - only the plan document is produced. Reads the codebase thoroughly before writing. Supports three modes - fresh (full exploration), plan revision (incorporate plan review FIX items), and code revision (incorporate code review FIX items after execution).
---

# Write Plan

Write implementation plans that leave nothing to interpretation. The plan is the only output - no source code modifications allowed.

## Hard Constraints

- **NO source code modifications.** Only create/edit the plan document itself. If tempted to "quickly fix" something in the codebase, stop. That's the executor's job.
- **NO assumptions.** If anything is unclear about the task, the codebase, or the approach - surface it in the Questions section or ask the user directly. Never guess.
- **NO thought process in the plan.** No "we could do X or Y" discussions, no tradeoff analysis, no "I considered...". The plan states what to do, not what was considered. Decisions are made before they enter the plan.
- **NO ambiguity.** Every step must be actionable by an engineer who has never seen this codebase. If a step could be interpreted two ways, it's wrong.

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
- **FIX items**: classified findings from fixme-handle-plan-review (markdown - same format as handler output)
- **Decision log path**: `.fixme/decisions.md` (may not exist on first iteration)

### Code Revision Mode

Triggered when the orchestrator provides: previous plan path + code review FIX items + execution results.
Required inputs (provided by orchestrator as arguments):
- **Original task**: the unchanged task description
- **Previous plan path**: the plan that was executed
- **FIX items**: classified findings from fixme-handle-code-review (markdown - same format as handler output)
- **Execution results**: summary from fixme-execute-plan completion report (markdown)
- **Decision log path**: `.fixme/decisions.md`

## Before Writing

### Revision Mode: Context Recovery (skip in fresh mode)

1. Read the previous plan's `## Context` section for Stable Context (architecture, patterns, conventions, dependency versions, API shapes).
2. Read locked decisions from the previous plan's Context section AND from the decision log at `.fixme/decisions.md` (if it exists). Locked decisions are settled - never re-ask.
3. Read the FIX items. For each FIX item:
   - Re-read the specific files it references (targeted, not full codebase)
   - If it contradicts a Stable Context item, re-verify that item against the codebase
   - If it contradicts a locked decision, flag the conflict to the user - do not silently override
4. In **code revision only**: re-read all files that were modified during execution (listed in execution results). The codebase has changed - file-level context is stale.
5. Skip full codebase exploration. Only do targeted re-reads as described above.

### Understand the Codebase

Read extensively before writing a single line of plan:
- Directory structure and conventions
- Existing patterns for the type of work being planned (how similar things were done before)
- Relevant source files that will be touched or depended on
- Test patterns and infrastructure
- Build/lint/test commands and CI expectations
- Dependencies and their versions (don't assume API shapes - verify)

### Understand the Task

- What is the goal? What does "done" look like?
- What are the boundaries? What's explicitly out of scope?
- Are there constraints from the spec, the user, or the codebase architecture?
- What are the risks? What's most likely to go wrong?

In revision mode, the original task is the source of truth for the goal. Do not re-derive or drift. The Goal line in the plan header must remain identical across all revisions.

### Resolve Unknowns

If anything is unresolved after reading the codebase and spec:
- Ask the user directly for critical unknowns that block the plan
- Collect non-blocking unknowns in the Questions section at the end

In revision mode, read locked decisions first (from plan Context section and `.fixme/decisions.md`). Never re-ask a question the user already answered. If a locked decision conflicts with a FIX finding, flag the conflict to the user - do not silently override either the decision or the finding.

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
- [Build/test/lint commands and CI expectations]
- [Key constraints and design decisions with rationale]
- [File-level context: summaries of key files read, their roles, relevant line ranges]

### Locked Decisions
[User answers from ASK-USER questions. Each entry: the question, the answer, and the resulting decision. Empty on first pass. In revision mode, carry forward from previous plan and decision log.]

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

- [ ] Step 1: [action]
- [ ] Step 2: [action]
...
- [ ] Step N: Commit

### Task 2: ...

---

## Questions

[Non-blocking unknowns that the executor or user should resolve before or during execution. If none, omit this section.]
```

## File Map

Before defining tasks, map every file that will be created or modified. This locks in the decomposition.

- Each file gets one clear responsibility
- Files that change together live together
- Follow existing codebase patterns for structure and naming
- Include exact paths, always
- Include line ranges for modifications when possible (after reading the file)

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
- **Exact commands** with expected output - never "run tests", always `bun run test:mobile -- --testPathPattern auth` with what success/failure looks like
- **Code when it helps clarity** - include code snippets when the implementation isn't obvious from the description. Code is welcome but not mandatory for every step. The bar is: could an engineer with zero context execute this step without stopping to think about what's meant?
- **Line references** for modifications - "In `src/auth.ts:L45-L52`, replace the token check with..."

### What Never Goes in a Step

- Alternatives or options ("you could do X or Y")
- Reasoning or justification ("because this pattern is better")
- Vague actions ("add appropriate error handling")
- Multiple unrelated changes in one step

## Scope Check

If the task covers multiple independent subsystems, suggest breaking into separate plans - one per subsystem. Each plan should produce working, testable software on its own.

## TDD Structure

Every behavioral change follows this cycle in the plan:

1. Write the failing test (include test code or clear specification)
2. Verify it fails (include command and expected failure)
3. Implement the change
4. Verify it passes (include command)
5. Verify full suite still passes (include command)

Non-behavioral changes (config, docs, refactors with existing coverage) can skip the test-first steps but must still verify the full suite passes.

## Commit Points

Include explicit commit steps. Each commit should leave the codebase in a working state (builds, passes lint, passes tests). A commit message is included in the step.

## Final Check Before Saving

Before saving the plan, verify:
- [ ] Every step is unambiguous - one interpretation only
- [ ] Every file path is exact and verified to exist (for modifications) or has a clear parent directory (for creation)
- [ ] Every command is exact and runnable
- [ ] No source code was modified during planning
- [ ] No assumptions were made that should be questions
- [ ] The plan can be executed top-to-bottom without backtracking
- [ ] Dependencies between tasks are explicit and ordered correctly
- [ ] The File Map matches the actual steps (nothing missing, nothing extra)
- [ ] Context section is populated with all significant discoveries from codebase exploration
- [ ] Locked Decisions section carries forward all decisions from previous iterations (revision mode)
- [ ] No FIX item was silently ignored - each is addressed in the revised plan or flagged as a conflict
