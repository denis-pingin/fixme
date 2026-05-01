# Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce instruction token overhead across all fixme skill files by ~10-20% through conciseness rewording, without changing any behavioral semantics.

**Architecture:** Pure text edits to 9 SKILL.md files. Each edit replaces verbose prose with a shorter version that produces identical LLM behavior. No structural changes, no shared reference extraction, no file creation/deletion.

**Tech Stack:** Markdown (skill definitions)

**Verification:** After all edits, run `./install.sh` and diff source vs installed copies. No build/lint/test needed (these are instruction documents, not code).

**Constraint:** Every rewrite must preserve the exact behavioral instruction. The LLM must do the same thing after the edit as before. Motivational rationale ("why this matters") and redundant restatements are the target - not the actual rules.

---

### Task 1: fixme-task/SKILL.md (~670 token savings, 9.3% reduction)

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md`

- [ ] **Step 1: Tighten Hard Constraint 1 (line 13)**

Replace:
```
- **Never read source code.** The orchestrator reads ONLY plan files, decision logs, config files, and agent outputs. All codebase exploration, investigation, and understanding happens inside dispatched agents. If you catch yourself using Read, Grep, or Glob on source code files, STOP - you are about to bypass the pipeline.
```
With:
```
- **Never read source code.** Only read plan files, decision logs, config files, and agent outputs. All codebase exploration happens inside dispatched agents. If you're about to use Read, Grep, or Glob on source code, STOP.
```

- [ ] **Step 2: Tighten Hard Constraint 4 (line 17)**

Replace:
```
- **Never output Run Summary until the FULL pipeline completes.** The pipeline is not done after a phase with no review. If a subsequent phase exists, it must run. If the current phase has a review loop, the review must complete before moving on. The Run Summary is ONLY output after the final phase's review handler returns Clean (or the phase has no review and it's the last phase) or after a loop guard triggers. If you feel like outputting a completion report mid-pipeline, STOP - you are about to skip remaining phases.
```
With:
```
- **Never output Run Summary until the FULL pipeline completes.** Run Summary is ONLY output after the final phase's review handler returns Clean (or the last phase has no review) or after a loop guard triggers. If you feel like outputting a completion report mid-pipeline, STOP.
```

- [ ] **Step 3: Tighten Hard Constraint 5 (line 18)**

Replace:
```
- **Never present intermediate findings to the user with bypass options.** Code review findings go to their handler skill. Plan review findings go to their handler skill. The orchestrator never shows findings to the user and asks "want me to fix this directly?" or "should we skip the loop?" If your next message to the user is a summary of findings with options, STOP - you are about to bypass the pipeline.
```
With:
```
- **Never present intermediate findings to the user with bypass options.** All findings go to their handler skill. Never show findings to the user and ask "want me to fix this directly?" or "should we skip the loop?" If your next message is a findings summary with options, STOP.
```

- [ ] **Step 4: Tighten argument referencing context (line ~46-48)**

Replace:
```
2. **Argument referencing context** (e.g. "see plan", "the plan", "attached"): the plan/task is already in the conversation. Check the skill expansion content above (plans are often injected inline when the skill is invoked). Also check IDE selection context (`ide_selection` tags). Do NOT search the filesystem - the user is telling you it's already here.
```
With:
```
2. **Argument referencing context** (e.g. "see plan", "the plan", "attached"): the plan/task is already in the conversation. Check the skill expansion content above (plans are often injected inline when the skill is invoked). Also check IDE selection context (`ide_selection` tags). Do NOT search the filesystem - the user is telling you it's already here.
```

**Note:** Step 4 keeps the original phrasing - "skill expansion content above" is a specific hint about where to look that "conversation context" doesn't fully replace.

- [ ] **Step 5: Tighten CRITICAL note about plan references (line ~50)**

Replace:
```
**CRITICAL**: When the argument is a reference like "see plan" or "the plan above", the plan content is almost always already present in the current message context (injected by the skill system or IDE). Read the full prompt carefully before searching the filesystem.
```
With:
```
**CRITICAL**: When the argument references a plan ("see plan", "the plan above"), the content is almost always already present in the current message context (injected by the skill system or IDE). Read the full prompt carefully before searching the filesystem.
```

- [ ] **Step 6: Compress Dispatch Gate (lines ~127-142)**

Replace:
```
## Dispatch Gate (NON-NEGOTIABLE)

You have resolved the task, pipeline, entry point, and ticket path. STOP HERE.

Do NOT:
- Read source code files
- Explore the codebase
- Investigate the problem
- Form a mental model of the root cause
- "Just check" how something works
- Read files to "provide better context" to the agent

All codebase understanding happens INSIDE dispatched agents. They have full tool access and will explore thoroughly.

Dispatch the first agent NOW with the resolved task description and entry point.

If you find yourself understanding the root cause before dispatching, you have already violated this gate. The deeper your understanding, the stronger the temptation to bypass the pipeline - and the more certain you should be that you need the pipeline's review loops to catch what your confidence blinds you to.
```
With:
```
## Dispatch Gate (NON-NEGOTIABLE)

Task, pipeline, entry point, and ticket path are resolved. STOP HERE.

Do NOT: read source code, explore the codebase, investigate the problem, form a mental model of the root cause, "just check" how something works, or read files to "provide better context."

All codebase understanding happens INSIDE dispatched agents. Dispatch the first agent NOW.

If you find yourself understanding the root cause before dispatching, you have already violated this gate.
```

- [ ] **Step 7: Compress dispatch contract section (lines ~202-208)**

Replace:
```
Dispatch each sub-skill as an isolated agent via the Agent tool. Pass all required inputs as prompt content. The agent does the work. You route the output. That's the entire job.

### Dispatch contract (NON-NEGOTIABLE)

Dispatch sub-skills using their agent type via `subagent_type`. Each fixme sub-skill has an agent definition in `~/.claude/agents/` that binds its role constraints (identity, boundaries, tool restrictions) at the system level and preloads its SKILL.md via `skills` frontmatter.

**Never paste SKILL.md content into the agent prompt.** Never tell agents to "read your SKILL.md first." The agent definition handles both role binding and SKILL.md preloading.
```
With:
```
Dispatch each sub-skill as an isolated agent via the Agent tool. Pass all required inputs as prompt content. You route the output. That's the entire job.

### Dispatch contract (NON-NEGOTIABLE)

Dispatch sub-skills using `subagent_type`. Agent definitions in `~/.claude/agents/` bind role constraints and preload SKILL.md via `skills` frontmatter.

**Never paste SKILL.md content into the agent prompt or tell agents to "read your SKILL.md first."**
```

- [ ] **Step 8: Compress tool restrictions section (line ~234-235)**

Replace:
```
Tool access for each sub-skill is enforced by its agent definition in `~/.claude/agents/`. Read-only agents (reviewers, handlers) have no Edit or Write tools. Write-access agents (plan writer, executor, investigator, researcher, browser verifier) have full tool access. See the agent definition files for specifics.
```
With:
```
Tool access is enforced by agent definitions in `~/.claude/agents/`. Read-only agents (reviewers, handlers) lack Edit/Write. Write-access agents have full tool access. See agent definition files for specifics.
```

- [ ] **Step 9: Compress Directive Validation section (lines ~335-356)**

Replace the full "Directive Validation (NON-NEGOTIABLE)" section from "Every agent dispatch has an expected routing directive" through the end of the "temptation" paragraph with:

```
### Directive Validation (NON-NEGOTIABLE)

Every agent dispatch must end with a routing directive. Validate it is present before routing:

| Agent type | Expected directive | Example |
|---|---|---|
| Phase skill (executor) | `EXECUTOR_STATUS: COMPLETE` + `NEXT_PIPELINE_STEP: <skill>` | End of fixme-execute-plan output |
| Review handler | `HANDLER_RESULT: CLEAN\|HAS_FIX\|HAS_ASK_USER` | End of fixme-handle-*-review output |

**If the directive is MISSING**, the agent is incomplete (truncated, crashed, or failed to finish).

**Recovery procedure:**

1. **Do NOT take over the agent's work.** Do not run tests, commit code, verify output, or do anything the agent was supposed to do. You are a dispatcher.
2. **Do NOT proceed to the next phase or output a Run Summary.** The current phase is incomplete.
3. **Re-dispatch automatically (once):**
   - **Executors**: include plan path + summary of prior progress + instruct to continue from last completed step.
   - **Review handlers**: re-dispatch with same inputs (findings, plan path, decision log).
   - **Other phase skills**: re-dispatch with original inputs + summary of what was produced.
4. **If re-dispatch also fails**: escalate to user. Report which agent failed twice, what it produced, and what remains incomplete. Offer to re-dispatch with narrower scope or proceed with manual guidance.

**Resist the temptation** to manually verify when output looks "mostly done." Without the directive, the agent's verification gate did not complete. Your manual check lacks the agent's context and skips the review phase.
```

- [ ] **Step 10: Compress "Never Apply Fixes Directly" (lines ~410-414)**

Replace:
```
When a review handler returns FIX items, **always route through the proper loop** - either intra-phase (re-run phase skills + review) or cross-phase (backward transition to earlier phase).

**Never apply FIX items inline in the orchestrator**, no matter how small or obvious they seem. "It's just a 2-line fix" is exactly when bugs slip through - a guard clause that accidentally exits render and violates Rules of Hooks, an init value that creates a hidden coupling to another module's internal ordering. The review loop exists to catch what you can't predict. Skipping it because you're confident is the definition of the problem the pipeline solves.
```
With:
```
When a review handler returns FIX items, **always route through the proper loop** - intra-phase (re-run phase skills + review) or cross-phase (backward transition).

**Never apply FIX items inline in the orchestrator**, no matter how small. "It's just a 2-line fix" is exactly when bugs slip through. The review loop exists to catch what you can't predict.
```

- [ ] **Step 11: Compress Loop Guards (lines ~486-487)**

Replace:
```
- **Phase review loop**: max `phase.review.maxCycles` iterations (default 3). If FIX items remain after max cycles, present them to user with context: "These issues persist after N revision attempts in the [phase] phase: [list]. Options: (a) proceed to next phase anyway, (b) provide guidance on how to resolve, (c) abort."
- **Outer loop**: max 2 iterations. If FIX items remain after 2 full cycles, present them to user: "These review issues persist after 2 full cycles: [list]. Options: (a) accept current state, (b) provide guidance, (c) abort."
```
With:
```
- **Phase review loop**: max `phase.review.maxCycles` (default 3). If FIX items remain after max cycles, escalate: "These issues persist after N attempts in [phase]: [list]. Options: (a) proceed anyway, (b) provide guidance, (c) abort."
- **Outer loop**: max 2 iterations. If FIX items remain, escalate: "These issues persist after 2 full cycles: [list]. Options: (a) accept current state, (b) provide guidance, (c) abort."
```

- [ ] **Step 12: Verify and commit**

Read the modified file, spot-check that no behavioral instructions were lost. Run `./install.sh`.

```bash
git add .claude/skills/fixme-task/SKILL.md && git commit -m "chore: optimize fixme-task token usage"
```

---

### Task 2: fixme-write-plan/SKILL.md (~666 token savings, 7.7% reduction)

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md`

- [ ] **Step 1: Compress "Why This Matters" (lines 13-17)**

Replace:
```
The plan is the foundation of a pipeline where each downstream step has less context and fewer decision-making capabilities than the one before it. A reviewer can only verify - it can't redesign. An executor can only follow instructions - it can't make architectural choices. A code reviewer can only catch bugs in what was built - it can't fix design flaws.

Every gap, ambiguity, or wrong assumption in the plan cascades downstream and costs exponentially more to fix. A missed dependency in the plan becomes a blocking failure in execution. A vague step becomes a wrong implementation becomes a code review finding becomes a revision cycle.

**The goal is one-shot success.** The plan must be so thorough, so precise, and so correct that it flows through review, execution, and code review without generating a single finding. This is the standard. Achieving it requires reading more code than feels necessary, resolving more ambiguity than seems important, and writing more detail than appears needed.
```
With:
```
Each downstream step has less context than the one before. Reviewers verify but can't redesign. Executors follow instructions but can't make architectural choices. Every gap cascades and costs exponentially more to fix.

**The goal is one-shot success.** The plan must flow through review, execution, and code review without generating a single finding. This requires reading more code than feels necessary, resolving more ambiguity than seems important, and writing more detail than appears needed.
```

- [ ] **Step 2: Compress anti-pattern examples (lines 35-41)**

Replace:
```
- **"Write X based on Y, adapted for Z"** - The executor must open Y, understand it, then make adaptation decisions. Instead: resolve the adaptation yourself and write the final content.
- **"Key adaptations include..."** - This describes what to think about, not what to write. Instead: show the result of those adaptations as concrete content.
- **"Similar to the pattern in Z"** - The executor must find Z, study it, then apply the pattern. Instead: include the pattern inline.
- **"Add appropriate error handling"** - The executor must decide what's appropriate. Instead: specify each error case and its handling.
```
With:
```
- **"Write X based on Y, adapted for Z"** - Executor must open Y and make adaptation decisions. Instead: resolve the adaptation and write the final content.
- **"Key adaptations include..."** - Describes what to think about, not what to write. Instead: show the result as concrete content.
- **"Similar to the pattern in Z"** - Executor must find Z and apply the pattern. Instead: include the pattern inline.
- **"Add appropriate error handling"** - Executor must decide what's appropriate. Instead: specify each error case and its handling.
```

- [ ] **Step 3: Compress Input Audit intro (lines 89-93)**

Replace:
```
**This gate runs before ANY codebase exploration or plan writing. It is non-negotiable in ALL modes.**

Before reading source files, understanding the task in depth, or writing a single line of plan - audit all available inputs to surface ambiguities that require user resolution. The purpose of this gate is to prevent the planner from forming opinions (through codebase exploration) before confirming that the task, constraints, and prior decisions are clearly understood. Confidence formed during exploration makes it less likely to ask questions and more likely to silently override prior decisions.
```
With:
```
**This gate runs before ANY codebase exploration or plan writing. Non-negotiable in ALL modes.**

Audit all inputs to surface ambiguities before exploration begins. The purpose: prevent forming opinions through codebase exploration before confirming that the task, constraints, and prior decisions are clearly understood. Exploration-formed confidence makes silent overrides more likely.
```

- [ ] **Step 4: Compress fresh mode warning (lines 114-116)**

Replace:
```
**Do not default to the most permissive mode when uncertain.** Fresh mode gives the planner maximum freedom (no locked decisions, no prior context to respect). Choosing fresh mode when rewrite or revision mode applies means silently discarding prior decisions. This is the highest-risk mode selection error.
```
With:
```
**Do not default to fresh mode when uncertain.** Fresh mode gives maximum freedom (no locked decisions, no prior context). Choosing it when rewrite or revision applies means silently discarding prior decisions - the highest-risk mode selection error.
```

- [ ] **Step 5: Compress confidence levels explanation (lines 163-169)**

Replace the full `[confirmed]` / `[assumed]` explanation (starting "Two confidence levels:" through "...bypass user confirmation is the single most common planning failure mode.") with:

```
   Two confidence levels:

   - **[confirmed]**: User explicitly chose this. To override, MUST ask the user again with new evidence.
   - **[assumed]**: Recommendation accepted by default (user did not explicitly answer). If codebase exploration reveals concrete evidence contradicting this, you MAY re-evaluate by presenting the evidence to the user. The bar is "concrete codebase evidence," not "I reconsidered."

   **The `[assumed]` tag may ONLY be applied to decisions that went through a Question Resolution Loop.** Decisions discovered during exploration that were never presented to the user are unconfirmed and must go through the Design Decision Checkpoint first. Marking exploration-phase decisions as `[assumed]` to bypass confirmation is the most common planning failure mode.
```

- [ ] **Step 6: Compress "You may not skip this gate" block (lines 174-181)**

Replace:
```
**You may not skip this gate because:**
- You feel confident about the answers
- The questions seem obvious or trivial
- Asking would slow things down
- You already explored the codebase and "know" the right answer

These are exactly the conditions under which silent overrides happen. The gate exists for when you are most confident, not least.
```
With:
```
**You may not skip this gate** because you feel confident, the questions seem trivial, or asking would slow things down. The gate exists for when you are most confident, not least.
```

- [ ] **Step 7: Compress "Understand the Codebase" (lines 197-207)**

Replace:
```
Read extensively before writing a single line of plan:
- Directory structure and conventions
- Existing patterns for the type of work being planned (how similar things were done before)
- Relevant source files that will be touched or depended on
- Test patterns and infrastructure (framework, file naming, helper utilities, mock patterns)
- Build/lint/test commands and CI expectations (exact commands from project docs, not guesses)
- Dependencies and their versions (don't assume API shapes - verify by reading source or types)

**Record everything you discover.** Every file you read, every API shape you verify, every pattern you observe goes into the Stable Context section. This is not busywork - it is the foundation that makes one-shot success possible. An incomplete Stable Context means the plan is built on unverified assumptions, and unverified assumptions are where plans fail.
```
With:
```
Read extensively before writing any plan:
- Directory structure and conventions
- Existing patterns for this type of work
- Relevant source files that will be touched or depended on
- Test patterns and infrastructure (framework, file naming, helpers, mocks)
- Build/lint/test commands (exact commands from project docs, not guesses)
- Dependencies and versions (verify API shapes by reading source or types)

**Record everything you discover** in the Stable Context section. Incomplete Stable Context means unverified assumptions, and that's where plans fail.
```

- [ ] **Step 8: Compress Design Decision Checkpoint (lines 233-256)**

Replace the full section from "**This gate runs after codebase exploration**" through "**...Together they ensure every design decision in the plan was either confirmed by the user or explicitly accepted as a recommendation.**" with:

```
**Runs after codebase exploration, before writing the plan. Mandatory when design decisions were collected during exploration.**

For each design decision, apply this test:

> Does a realistic alternative exist that would materially change the plan's structure, component boundaries, data flow, or user-facing behavior?

- **Yes**: present to the user. Add to the question list.
- **No** (truly mechanical): document in Stable Context as an observation, not a Locked Decision. Example: "The existing hooks all use `withAuthRetry` wrapping `Effect.runPromise`" is an observation. "We'll create a new `agentsFetchPaginated` helper instead of modifying the shared one" is a design decision.

Present questions using the same format as the Input Audit's Question Resolution Loop (Step 5). Process identically: explicit answers become `[confirmed]`, accepted recommendations become `[assumed]`.

**If no design decisions or all are mechanical:** checkpoint passes silently.

**You may not skip this checkpoint** because you "know" the right approach or the decisions seem obvious. This gate prevents post-exploration confidence from bypassing user confirmation.
```

- [ ] **Step 9: Compress TDD section (lines 350-353, 411-414)**

Replace:
```
**TDD is the primary organizing principle for every task that changes behavior.** This is not a style preference - it is the strongest guarantee of correctness available. A test written before implementation proves the test is meaningful (it fails without the code). A test written after implementation might pass for the wrong reason and catch nothing.
```
With:
```
**TDD is the primary organizing principle for every behavioral task.** A test written before implementation proves it's meaningful (it fails without the code). A test written after might pass for the wrong reason.
```

And replace:
```
**The test code in Step 1 must be complete and correct.** Not "write a test that checks X" - the actual test code. The planner has the deepest codebase context of anyone in the pipeline. The executor has the least. If the planner doesn't write the test, the executor will write a worse one.

**The expected failure in Step 2 must be specific.** Not "test fails" but the actual error message or pattern. This serves as a checkpoint - if the executor sees a different failure, they know something is wrong before wasting time on implementation.
```
With:
```
**The test code in Step 1 must be complete and correct** - the actual test code, not "write a test that checks X". The planner has the deepest codebase context; the executor has the least.

**The expected failure in Step 2 must be specific** - the actual error message or pattern, not "test fails". A different failure tells the executor something is wrong before wasting time on implementation.
```

- [ ] **Step 10: Compress content and commit sections (lines 457-459, 504-506)**

Replace:
```
- **Concrete content for new files** - include the full content in a fenced code block, or a detailed structural specification where every section heading, field value, and behavioral rule is spelled out. The executor should be able to type/paste without making design choices.
- **Code when it helps clarity** - include code snippets when the implementation isn't obvious from the description. The bar is: could an engineer with zero context execute this step without stopping to think about what's meant?
```
With:
```
- **Concrete content for new files** - full content in a fenced code block, or a detailed structural spec with every section heading, field value, and behavioral rule. The executor types/pastes without making design choices.
- **Code when it helps clarity** - include snippets when the implementation isn't obvious. Bar: could an engineer with zero context execute this step without stopping to think?
```

And replace:
```
Include explicit commit steps. Each commit should leave the codebase in a working state (builds, passes lint, passes tests). A commit message is included in the step.

For TDD tasks, the natural commit point is after the full Red-Green-Refactor cycle completes and verification passes. Never commit between "write test" and "make test pass" - that leaves a deliberately failing test in the commit.
```
With:
```
Include explicit commit steps. Each commit leaves the codebase in a working state (builds, lint, tests pass).

For TDD tasks, commit after the full Red-Green-Refactor cycle. Never commit between "write test" and "make test pass."
```

- [ ] **Step 11: Compress task sizing (lines 469-479)**

Replace:
```
Each task should be completable in a single focused session. Signs a task is too large:

- More than ~12 steps (including TDD verification steps)
- Touches more than 4-5 files
- Contains multiple independent logical changes
- The "Expected Outcome" requires more than 2 sentences per category

Split oversized tasks. Each task should have one clear purpose and a verifiable outcome. Two 6-step tasks are better than one 12-step task because:
- The executor can verify and commit between them
- A failure in the second task doesn't invalidate the first
- Issues can be pinpointed to a smaller scope
```
With:
```
Each task should be completable in a single focused session. Too large if:

- More than ~12 steps (including TDD verification steps)
- Touches more than 4-5 files
- Contains multiple independent logical changes
- Expected Outcome requires more than 2 sentences per category

Split oversized tasks. Two 6-step tasks beat one 12-step: the executor can verify/commit between them, failures don't invalidate earlier work, and issues are pinpointed to smaller scope.
```

- [ ] **Step 12: Verify and commit**

Read the modified file, spot-check rewrites. Run `./install.sh`.

```bash
git add .claude/skills/fixme-write-plan/SKILL.md && git commit -m "chore: optimize fixme-write-plan token usage"
```

---

### Task 3: fixme-execute-plan/SKILL.md (~180 token savings, 9.5% reduction)

**Files:**
- Modify: `.claude/skills/fixme-execute-plan/SKILL.md`

- [ ] **Step 1: Compress baseline capture (lines 44-51)**

Replace:
```
Before writing any code, capture the current state:

1. Run the project's full verification suite (build, lint, typecheck, tests)
2. Record the results. This is the **baseline**.
   - If baseline is fully clean: any failure after changes is caused by the changes
   - If baseline has failures: record exactly which tests fail and with what errors. This is the ONLY valid reference for pre-existing failure claims later

This step is non-negotiable. Without a baseline, there is no way to distinguish regressions from pre-existing issues.
```
With:
```
Before writing any code, capture the current state:

1. Run the full verification suite (build, lint, typecheck, tests)
2. Record results. This is the **baseline**.
   - Clean baseline: any post-change failure is caused by the changes
   - Baseline has failures: record exactly which tests fail and with what errors. This is the ONLY valid pre-existing failure reference.

Non-negotiable. Without a baseline, regressions cannot be distinguished from pre-existing issues.
```

- [ ] **Step 2: Compress Final Verification (lines 69-88)**

Replace the full "Phase 4: Final Verification (SACRED)" section with:
```
### Phase 4: Final Verification (SACRED)

Run the FULL verification suite. Not partial. Not "relevant files only". Everything.

Use the project's documented commands (build, lint/format, typecheck, ALL tests).

**Capture sufficient output.** Use `2>&1 | tail -150` or more. Never truncate to few lines.

**Every check must pass with zero errors and zero warnings.** Zero.

If any check fails:
1. Fix it
2. Re-run ALL checks from the beginning (fixes can introduce new issues)
3. Repeat until everything is green

**Work is not done until this phase produces a fully clean run.**
```

- [ ] **Step 3: Compress pre-existing failure proof (lines 94-107)**

Replace the full "Pre-Existing Failure Claims" section with:
```
When a test fails after implementation and the claim is "this was already broken":

**Invalid unless proven.** Proof:

1. Stash/revert all changes
2. Run the exact same failing test/check
3. Confirm EXACT same error (test name, message, failure mode)
4. Re-apply changes

If the error differs in any way, it's a regression. Fix it.

If genuinely identical:
- Document: "Test X was failing before changes with error Y. Verified by running without changes."
- Don't let it block completion, but report in the completion summary.

**Never claim pre-existing without running the proof.**
```

- [ ] **Step 4: Compress "Minimizing FIX_NEEDED Feedback" (lines 122-131)**

Replace:
```
## Minimizing FIX_NEEDED Feedback

Common causes of FIX_NEEDED findings and how to prevent them:

- **Incomplete implementation**: read the plan step fully before starting it. Don't start coding after reading half the step.
- **Wrong API usage**: verify the actual API by reading source code or types, not from memory. APIs change between versions.
- **Missed edge cases**: if the plan specifies error handling or edge cases, implement them. Don't defer "for later".
- **Inconsistent naming**: use exactly the names the plan specifies. If the plan says `computeLandingIndex`, don't write `calculateLandingIndex`.
- **Forgotten test updates**: when implementation changes behavior, check if existing tests need updating. Don't leave tests asserting old behavior.
- **Partial commits**: every commit must build and pass. Don't commit half-implemented features.
- **Skipped verification**: the number one cause. Just run the checks.
```
With:
```
## Minimizing FIX_NEEDED Feedback

- **Incomplete implementation**: read the full plan step before starting. Don't code after reading half.
- **Wrong API usage**: verify APIs by reading source/types, not memory.
- **Missed edge cases**: if the plan specifies them, implement them. Don't defer.
- **Inconsistent naming**: use exactly the plan's names.
- **Forgotten test updates**: check if existing tests need updating when behavior changes.
- **Partial commits**: every commit must build and pass.
- **Skipped verification**: the #1 cause. Just run the checks.
```

- [ ] **Step 5: Verify and commit**

```bash
git add .claude/skills/fixme-execute-plan/SKILL.md && git commit -m "chore: optimize fixme-execute-plan token usage"
```

---

### Task 4: fixme-review-plan/SKILL.md (~251 token savings, 11.4% reduction)

**Files:**
- Modify: `.claude/skills/fixme-review-plan/SKILL.md`

- [ ] **Step 1: Compress Two-Pass Review Process (lines 26-36)**

Replace:
```
### Pass 1: Investigation (internal, not in output)

Read the plan, read the codebase, identify candidate issues. For each candidate, run it through the Pre-Review Gate below. This is your thinking process - none of it appears in the final output.

- If gate-checking reveals the candidate is not actually an issue, discard it silently. Do NOT include retracted, dismissed, or "on further analysis, no issue" findings in the output. If you talked yourself out of it, it's not a finding.
- If gate-checking reveals uncertainty, move it to Questions.
- If the candidate survives all gates, promote it to a confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings that survived Pass 1. The report should contain zero artifacts of your investigation process - no "I initially thought X but then realized Y", no retracted findings, no findings where the Evidence is "N/A" or the Confidence is "N/A".
```
With:
```
### Pass 1: Investigation (internal, not in output)

Read the plan and codebase. For each candidate issue, run it through the Pre-Review Gate. None of this appears in output.

- If not actually an issue: discard silently. No retracted or "on further analysis, no issue" findings.
- If uncertain: move to Questions.
- If it survives all gates: promote to confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings from Pass 1. Zero investigation artifacts - no retractions, no "N/A" Evidence or Confidence fields.
```

- [ ] **Step 2: Compress Pre-Review Gate items (lines 40-48)**

Replace:
```
1. **Did I read the relevant source code?** If no, read it first. Plans often reference patterns that exist in the codebase but aren't spelled out.
2. **Does the spec/context explain this?** The plan may look odd in isolation but make sense given constraints not yet internalized. Re-read the spec.
3. **Is this an intentional tradeoff?** Plans often choose a suboptimal approach in one dimension to optimize another. If suspected, note it as a question, not a finding.
4. **Am I sure about the API/framework behavior I'm assuming?** If the finding depends on how a library works, verify against the actual dependency version in the project. Do not rely on general knowledge - APIs change.
5. **Would fixing this actually improve the outcome?** Technically correct feedback that makes the plan worse (more complex, slower to ship, harder to maintain) is bad feedback.
6. **Does this contradict a locked decision?** If the plan includes a Locked Decisions section in its Context, those are settled user choices. Do not flag findings that disagree with locked decisions. If a locked decision itself appears problematic (would cause a bug, break something), frame it as a question in the Questions section, not as a finding.
7. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "minor cosmetic", or "not blocking", the finding cannot be IMPORTANT or BLOCKING. Either downgrade to MINOR or drop it entirely. A finding whose suggestion starts with "Minor" or "Consider" is almost certainly not IMPORTANT.
```
With:
```
1. **Did I read the relevant source code?** If not, read it first.
2. **Does the spec/context explain this?** The plan may look odd in isolation but make sense given constraints. Re-read the spec.
3. **Is this an intentional tradeoff?** If suspected, note as a question, not a finding.
4. **Am I sure about the API/framework behavior?** Verify against the actual dependency version. Don't rely on general knowledge.
5. **Would fixing this improve the outcome?** Technically correct feedback that makes the plan worse is bad feedback.
6. **Does this contradict a locked decision?** Locked decisions are settled. Don't flag disagreements. If a locked decision appears problematic (bug, breakage), frame as a question, not a finding.
7. **Is severity consistent with actual impact?** If "functionally correct" or "minor cosmetic," it cannot be IMPORTANT or BLOCKING. Downgrade to MINOR or drop.
```

- [ ] **Step 3: Compress "What NOT to Flag" (lines 91-97)**

Replace:
```
- Style preferences or naming opinions
- **Cosmetic issues** - field ordering in config/frontmatter, whitespace, formatting of generated files, indentation preferences. If it's "functionally correct but looks different", it's not a finding.
- Alternative approaches that aren't clearly better - only flag if the planned approach has a concrete flaw
- Missing error handling for scenarios that genuinely can't happen given the codebase
- "Best practices" that don't apply to the specific context (e.g., suggesting pagination for a list that's bounded to 10 items)
- Vague concerns ("this might be slow") without evidence - either quantify it or don't mention it
- Anything where your own analysis concludes "no issue" - if you investigated and found it works correctly, that's Pass 1 doing its job. Don't report it.
```
With:
```
- Style preferences or naming opinions
- **Cosmetic issues** - field ordering, whitespace, formatting, indentation. "Functionally correct but looks different" is not a finding.
- Alternative approaches without a concrete flaw in the planned approach
- Missing error handling for impossible scenarios
- "Best practices" that don't apply to this context
- Vague concerns without evidence - quantify or don't mention
- Anything your analysis concludes is correct - Pass 1 doing its job
```

- [ ] **Step 4: Compress Rules (lines 119-124)**

Replace:
```
- Fewer high-quality findings >>> many low-quality ones. 5 real issues beats 20 maybes.
- NEVER critique what hasn't been verified against the codebase. "I think this API doesn't support X" is not a finding. Read the code, confirm, then report.
- If unsure whether something is an issue, frame it as a question: "Does X handle Y? I couldn't confirm from reading [file]." Questions are cheaper than wrong findings.
- Separate "the plan won't work" (correctness) from "the plan could be better" (suggestions). Don't mix them.
- If the plan is good and there are no findings, say so. Don't manufacture issues to justify the review.
```
With:
```
- 5 real findings beat 20 maybes.
- NEVER critique unverified claims. Read the code, confirm, then report.
- If unsure, frame as a question. Questions are cheaper than wrong findings.
- Separate "won't work" (correctness) from "could be better" (suggestions).
- If no findings, say so. Don't manufacture issues.
```

- [ ] **Step 5: Verify and commit**

```bash
git add .claude/skills/fixme-review-plan/SKILL.md && git commit -m "chore: optimize fixme-review-plan token usage"
```

---

### Task 5: fixme-review-code/SKILL.md (~241 token savings, 9.3% reduction)

**Files:**
- Modify: `.claude/skills/fixme-review-code/SKILL.md`

- [ ] **Step 1: Compress input list (lines 29-30)**

Replace:
```
- The spec/task description (if referenced in the plan)
- Every file created or modified (full file, not just the diff - context matters)
- Every test file created or modified (full file)
- The original files before changes (via git) when needed to understand what changed
```
With:
```
- The spec/task description (if referenced)
- Every created/modified file (full file, not just diff)
- Every created/modified test file (full file)
- Original files before changes (via git) when needed
```

- [ ] **Step 2: Compress investigation steps (lines 36-42)**

Replace:
```
1. **What was the goal?** Read the plan header and spec. What does "done" look like?
2. **What was the approach?** Read the plan's architecture and file map.
3. **What was actually changed?** Read every diff. Map changes back to plan tasks.
4. **What patterns does the codebase use?** Read neighboring files to understand conventions, not just the changed files.
5. **What stable context does the plan provide?** Read the plan's `## Context` section. Stable Context provides architecture, patterns, conventions, and dependency information discovered during planning. Use this as a head start - no need to re-explore the full codebase for this information. Re-read changed files directly for current state.

This prevents the most common source of false findings: reviewing code without understanding why it was written that way.
```
With:
```
1. **What was the goal?** Read the plan header and spec.
2. **What was the approach?** Read the plan's architecture and file map.
3. **What was actually changed?** Read every diff. Map changes to plan tasks.
4. **What codebase patterns exist?** Read neighboring files for conventions.
5. **What stable context does the plan provide?** Read the plan's `## Context` section as a head start. Re-read changed files for current state.

This prevents the most common false finding source: reviewing code without understanding why it was written that way.
```

- [ ] **Step 3: Compress reimplemented business logic finding (lines 63-73)**

Replace:
```
- **Reimplemented business logic in tests (CRITICAL).** If a test file contains a function, calculation, mapping, or transformation that duplicates production code instead of importing and calling it - this is always a finding. The test must exercise the production code, not a copy of it. Common patterns:
  - Test defines its own version of a helper/utility that exists in production
  - Test hardcodes a computation result instead of calling the function
  - Test reimplements a state machine, parser, or transformer to "verify" it matches
  - Test copies constants, configs, or mappings from production instead of importing them
```
With:
```
- **Reimplemented business logic in tests (CRITICAL).** If a test duplicates production logic instead of importing it - always a finding. Common patterns:
  - Test defines its own version of a production helper/utility
  - Test hardcodes a computation result instead of calling the function
  - Test reimplements a state machine, parser, or transformer
  - Test copies constants/configs from production instead of importing
```

- [ ] **Step 4: Compress Two-Pass Review (lines 98-107)**

Replace:
```
### Pass 1: Investigation (internal, not in output)

Read all changed files, the plan, and the spec. Identify candidate issues. For each candidate, run it through the Pre-Finding Gate below. This is your thinking process - none of it appears in the final report.

- If gate-checking reveals the candidate is not actually an issue, discard it silently. Do NOT include retracted, dismissed, or "on further analysis, no issue" findings in the report.
- If gate-checking reveals uncertainty, move it to Questions.
- If the candidate survives all gates, promote it to a confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings that survived Pass 1. The report should contain zero artifacts of your investigation process - no retracted findings, no findings where Evidence or Confidence is "N/A".
```
With:
```
### Pass 1: Investigation (internal, not in output)

Read all changed files, the plan, and spec. For each candidate issue, run through the Pre-Finding Gate. None of this appears in output.

- Not actually an issue: discard silently. No retracted or "on further analysis" findings.
- Uncertain: move to Questions.
- Survives all gates: promote to confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings from Pass 1. Zero investigation artifacts.
```

- [ ] **Step 5: Compress Pre-Finding Gate items (lines 112-119)**

Replace:
```
1. **Did I read the full context?** Both the changed file AND the plan step that produced it. A finding based on reading only the diff is likely wrong.
2. **Is the plan responsible?** If the code follows the plan exactly and the issue is in the plan's design, this is a plan review finding, not a code review finding. Flag only if the implementation made it worse than the plan specified.
3. **Am I sure about the API/framework behavior?** Verify against the actual dependency version. Don't flag "missing await" on a function that's synchronous.
4. **Is this a real convention in this codebase?** Read neighboring files before flagging style issues. The convention might be different from what you'd expect.
5. **Does fixing this actually improve the outcome?** If the change would make code more complex for marginal benefit, drop it.
6. **Does this contradict a locked decision?** If the plan includes Locked Decisions in its Context section, those are settled user choices. Do not flag code that implements a locked decision. If the locked decision itself appears to cause a problem in practice, frame it as a question, not a finding.
7. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "cosmetic", or "not blocking", the finding cannot be IMPORTANT or BLOCKING. Either downgrade to MINOR or drop it entirely.
```
With:
```
1. **Did I read full context?** Both the changed file AND the plan step. Diff-only findings are likely wrong.
2. **Is the plan responsible?** If code follows the plan exactly and the issue is in the plan's design, this is a plan review finding. Flag only if implementation made it worse.
3. **Am I sure about the API/framework behavior?** Verify against actual dependency version.
4. **Is this a real codebase convention?** Read neighboring files before flagging style issues.
5. **Does fixing this improve the outcome?** If the change adds complexity for marginal benefit, drop it.
6. **Does this contradict a locked decision?** Locked decisions are settled. Don't flag code implementing them. If a locked decision causes a practical problem, frame as a question.
7. **Is severity consistent with actual impact?** "Functionally correct" or "cosmetic" cannot be IMPORTANT or BLOCKING. Downgrade or drop.
```

- [ ] **Step 6: Verify and commit**

```bash
git add .claude/skills/fixme-review-code/SKILL.md && git commit -m "chore: optimize fixme-review-code token usage"
```

---

### Task 6: fixme-handle-plan-review/SKILL.md (~318 token savings, 11.8% reduction)

**Files:**
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md`

- [ ] **Step 1: Compress classification definitions (lines 26-28)**

Replace:
```
- **FIX** - real issue that affects correctness, performance, security, or maintainability. A single clear fix approach exists.
- **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist, or design tradeoffs are involved. The issue's validity is not in question - only the approach to resolving it.
- **ASK_USER** - insufficient context to determine whether the finding is even valid. Depends on intent, constraints, or decisions not captured in the plan, spec, or codebase. Requires human input to determine validity (not just approach).
```
With:
```
- **FIX** - real issue affecting correctness, performance, security, or maintainability. Single clear fix exists.
- **FIX_UNCLEAR** - real issue, but fix approach is ambiguous (multiple viable strategies or design tradeoffs). Validity is not in question - only the approach.
- **ASK_USER** - insufficient context to determine validity. Depends on intent, constraints, or decisions not captured anywhere. Requires human input on validity (not approach).
```

- [ ] **Step 2: Compress locked decision handling (lines 40-48)**

Replace the full locked decision section with the compressed version that keeps the `[confirmed]` vs `[assumed]` distinction but uses shorter phrasing:

```
4. Check finding against locked decisions. Distinguish `[confirmed]` (user explicitly chose) from `[assumed]` (accepted by default):
   - **Contradicts `[confirmed]`:**
     - Concrete problem (bug, security, data loss): ASK_USER with new evidence and recommended path.
     - Mere disagreement with approach: REJECT_WONT_FIX.
   - **Contradicts `[assumed]`:**
     - Concrete problem: ASK_USER. User never confirmed this; new evidence suggests it's wrong.
     - Materially better alternative: ASK_USER. Present both approaches.
     - Minor stylistic disagreement: REJECT_WONT_FIX.
   - **`[assumed]` that should have been confirmed** (Assumption Validity issue): ASK_USER. Present decision and alternatives.
```

- [ ] **Step 3: Compress Question field description (line ~74-76)**

Replace:
```
The Question field is what the user reads to make a decision. It must be self-contained - the user should understand the situation and be able to decide without re-reading the finding, the plan, or the code. Follow top-down progressive disclosure: lead with context, state what needs deciding, then provide the details needed to decide well.
```
With:
```
The Question field must be self-contained - the user decides without re-reading the finding, plan, or code. Lead with context, state what needs deciding, then details.
```

- [ ] **Step 4: Compress Rules section (lines ~118-122)**

Replace:
```
- **Options are mandatory** for FIX_UNCLEAR. For ASK_USER, include options when there are genuinely different directions (fix vs. defer vs. ignore). When the question is purely "is this a real issue?", you can omit Options and instead present the evidence for and against under Context.
- **Recommendation is mandatory**. Always. Do research first (read code, check docs, trace call paths). Never ask without a recommendation.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options**. When Option B's main advantage is that it avoids Option A's biggest con, say so explicitly. Don't make the reader connect the dots.
```
With:
```
- **Options are mandatory** for FIX_UNCLEAR. For ASK_USER, include when genuinely different directions exist. For pure "is this real?" questions, present evidence for/against under Context instead.
- **Recommendation is mandatory**. Research first. Never ask without one.
- **Options must be genuinely distinct** - not variations. Merge similar options and note the variation.
- **Cross-reference between options** - say explicitly when Option B's advantage is avoiding Option A's con.
```

- [ ] **Step 5: Compress Quality bar (lines ~125-131)**

Replace:
```
- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: context and mental model first, then the question, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format above. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with line numbers. No exceptions.
```
With:
```
- **Self-contained**: reader understands everything from this block alone.
- **Top-down**: context first, then question, then details. Never reference undefined concepts.
- **Concrete**: actual file names, line numbers, data volumes, error messages. Not "a size-related issue" but "API returns 502 when payload exceeds 1MB."
- **Right abstraction level**: match explanation depth to concept complexity.
- **Neutral**: don't bias toward FIX or REJECT.
- **Scannable**: use structured format. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with line numbers.
```

- [ ] **Step 6: Compress general rules (lines ~135-139)**

Replace:
```
- Read the actual code before classifying. Don't trust the finding's characterization of what the code does.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- If a finding is ambiguous or context is lacking, classify as ASK_USER rather than guessing. If the finding is clearly valid but the fix approach is unclear, classify as FIX_UNCLEAR. A wrong FIX wastes implementation time. A wrong REJECT hides a real issue. ASK_USER or FIX_UNCLEAR costs only a question.
- If two findings would be resolved by the same change, group them and note it.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.
```
With:
```
- Read actual code before classifying. Don't trust the finding's characterization.
- Technically correct but makes code worse: REJECT_WONT_FIX. Explain the tradeoff.
- Ambiguous or lacking context: ASK_USER. Valid but unclear fix: FIX_UNCLEAR. Wrong FIX wastes time; wrong REJECT hides issues; ASK_USER/FIX_UNCLEAR costs only a question.
- Same-change findings: group them.
- Locked decisions are presumed correct. Contradiction is REJECT_WONT_FIX unless it reveals a concrete new problem - then ASK_USER.
```

- [ ] **Step 7: Verify and commit**

```bash
git add .claude/skills/fixme-handle-plan-review/SKILL.md && git commit -m "chore: optimize fixme-handle-plan-review token usage"
```

---

### Task 7: fixme-handle-code-review/SKILL.md (~476 token savings, 13.6% reduction)

**Files:**
- Modify: `.claude/skills/fixme-handle-code-review/SKILL.md`

Apply the same compression patterns as Task 6 - this file has near-identical sections. The key differences are the code-review-specific additions.

- [ ] **Step 1: Compress classification definitions (lines 30-35)**

Replace with the code-review-specific compressed version:
```
- **FIX** - real issue affecting correctness, behavior, security, performance, test quality, or maintainability. Single clear fix exists that improves the implementation without breaking anything.
- **FIX_UNCLEAR** - real issue, but fix approach is ambiguous (multiple strategies, tradeoffs, or unaccounted downstream changes). Validity is not in question - only approach.
- **ASK_USER** - classification depends on intent, priorities, or design decisions not captured in plan/spec/code. Human decision needed on validity.
- **REJECT_FALSE_POSITIVE** - finding is factually wrong. Reviewer misunderstood the implementation, API behavior, or conventions.
- **REJECT_WONT_FIX** - technically valid but would make things worse, contradicts the plan/locked decision (not demonstrably broken), or adds regression risk for marginal benefit.
- **REJECT_ALREADY_FIXED** - already addressed in current implementation or a prior iteration.
```

- [ ] **Step 2: Compress Pre-Classification Gate (lines 41-48)**

Replace with compressed version:
```
1. **Read the actual implementation.** Full function/file, not just cited lines. Surrounding context often explains the approach.
2. **Read the plan step.** Code follows plan exactly but reviewer disagrees? REJECT_WONT_FIX (plan design disagreement).
3. **Read the spec/task.** "Doesn't handle X" when X is out of scope? REJECT_FALSE_POSITIVE.
4. **Verify API/framework claims.** Check actual dependency version. Reviewers get this wrong frequently.
5. **Would the fix break something?** Trace through callers, tests, dependents. Locally correct but downstream breakage: REJECT_WONT_FIX (or FIX_UNCLEAR if broader approach is unclear).
6. **Does "improvement" add risk?** Refactoring for aesthetics with regression risk and no concrete flaw: REJECT_WONT_FIX.
7. **Contradicts a locked decision?** New concrete problem: ASK_USER. Mere disagreement: REJECT_WONT_FIX.
```

- [ ] **Step 3: Compress Common False Positive Patterns (lines 52-59)**

Replace:
```
These frequently produce REJECT_FALSE_POSITIVE or REJECT_WONT_FIX findings. Be especially skeptical:

- **"Missing error handling"** for paths that are structurally impossible given the caller or the types
- **"Should use X instead of Y"** when Y is the established pattern in this codebase
- **"Performance concern"** without evidence of actual impact (bounded lists, one-time operations, cold paths)
- **"Missing test for X"** when X is out of the plan's scope
- **"Inconsistent with best practice"** when the codebase consistently does it differently
- **"This could be simplified"** when the "simpler" version loses readability or explicitness
- **Test findings based on misreading the production code** - the reviewer didn't understand what the function does, so they think the test is wrong
```
With:
```
Be especially skeptical of these common false positives:

- **"Missing error handling"** for structurally impossible paths
- **"Should use X instead of Y"** when Y is the established codebase pattern
- **"Performance concern"** without evidence (bounded lists, one-time ops, cold paths)
- **"Missing test for X"** when X is out of scope
- **"Inconsistent with best practice"** when the codebase consistently does it differently
- **"This could be simplified"** when the "simpler" version loses readability
- **Test findings from misread production code**
```

- [ ] **Step 4: Compress Code-Review-Specific Considerations (lines 63-68)**

Replace:
```
Unlike plan review findings, code review findings interact with running software. Additional checks:

- **Would the fix pass the existing tests?** If the fix would break passing tests, it's either wrong or requires test updates too. If the finding doesn't account for this, it's incomplete - classify ASK_USER, FIX_UNCLEAR, or REJECT_WONT_FIX.
- **Does the fix match the plan's architecture?** A finding that pushes toward a different architecture than the plan specified is a plan disagreement, REJECT_WONT_FIX (plan design disagreement).
- **Is the test finding about test quality or about production code?** A finding saying "this test reimplements business logic" is about the test. A finding saying "this function has a bug" is about production code. Don't conflate them - they have different fix approaches.
- **Would reverting to make the reviewer happy reintroduce the bug/gap the plan was fixing?** If yes, REJECT_WONT_FIX.
```
With:
```
Code review findings interact with running software. Additional checks:

- **Would the fix pass existing tests?** If it would break passing tests and the finding doesn't account for test updates, classify ASK_USER, FIX_UNCLEAR, or REJECT_WONT_FIX.
- **Does the fix match the plan's architecture?** Different architecture push: REJECT_WONT_FIX (plan design disagreement).
- **Test quality vs. production code finding?** Don't conflate them - different fix approaches.
- **Would reverting reintroduce the bug the plan fixed?** If yes, REJECT_WONT_FIX.
```

- [ ] **Step 5: Compress Decision Presentation Guidelines - same as Task 6**

Apply the same Question field, Rules, and Quality bar compressions from Task 6 steps 3-5 (the sections are near-identical).

- [ ] **Step 6: Compress general rules (lines ~159-165)**

Replace:
```
- Read the actual code, plan, AND spec before classifying. A finding classified without full context is likely wrong.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- A finding that contradicts the plan's explicit approach is REJECT_WONT_FIX unless the plan's approach is demonstrably broken in practice (not just "could be better").
- If two findings would be resolved by the same change, group them.
- When in doubt between FIX and REJECT, classify ASK_USER. If the issue is clearly valid but the approach is ambiguous, classify FIX_UNCLEAR. A wrong FIX wastes implementation time and can introduce bugs. A wrong REJECT hides a real issue. ASK_USER or FIX_UNCLEAR costs only a question.
- The REJECT rationale summary is mandatory. If you can't articulate why findings were rejected, you didn't analyze them carefully enough.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.
```
With:
```
- Read code, plan, AND spec before classifying. Classification without full context is likely wrong.
- Technically correct but makes code worse: REJECT_WONT_FIX. Explain the tradeoff.
- Contradicts plan's explicit approach: REJECT_WONT_FIX unless demonstrably broken in practice.
- Same-change findings: group them.
- When in doubt: ASK_USER. Valid but unclear fix: FIX_UNCLEAR. Wrong FIX wastes time and can introduce bugs; wrong REJECT hides issues.
- REJECT rationale summary is mandatory.
- Locked decisions are presumed correct. Contradiction is REJECT_WONT_FIX unless it reveals a new concrete problem - then ASK_USER.
```

- [ ] **Step 7: Verify and commit**

```bash
git add .claude/skills/fixme-handle-code-review/SKILL.md && git commit -m "chore: optimize fixme-handle-code-review token usage"
```

---

### Task 8: fixme-pr-comments/SKILL.md (~960 token savings, 12% reduction)

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md`

- [ ] **Step 1: Tighten Hard Constraints 3 and 4 (lines 15-16)**

Replace constraint 3:
```
**Never use Edit, Write, or Bash to modify source files.** If you catch yourself about to edit a source file, STOP - you are bypassing the pipeline. Even "just one line" must go through fixme-task. The pipeline exists to catch what your confidence blinds you to.
```
With:
```
**Never use Edit, Write, or Bash to modify source files.** Even "just one line" must go through fixme-task.
```

Replace constraint 4:
```
**Never skip fixme-task dispatch for "simple" fixes.** The temptation is strongest when there's only 1 fix and it looks trivial. That is exactly when this constraint matters most - a one-line type change can break downstream consumers that the pipeline's review loop would catch.
```
With:
```
**Never skip fixme-task dispatch for "simple" fixes.** Even a single trivial-looking fix must go through the pipeline - it catches downstream breakage you won't anticipate.
```

- [ ] **Step 2: Compress pagination explanation after Source A (lines 107-110)**

Replace:
```
**Pagination is mandatory.** PRs with many review comments will span multiple pages.
If you only fetch the first page, you will silently miss comments on later pages.
Always check `pageInfo.hasNextPage` and loop with `after: "{endCursor}"` until all
pages are consumed.
```
With:
```
**Pagination is mandatory.** Loop with `after: "{endCursor}"` until `hasNextPage` is false, or you silently miss comments.
```

- [ ] **Step 3: Merge Claude bot reading paragraphs (lines 126-134)**

Replace the two paragraphs ("Reading Claude bot comments" + "CRITICAL: Always read the FULL body") with single merged version:
```
**Reading Claude bot comments**: Read the FULL body of every claude[bot] comment - the status prefix (`**Claude finished @user's task...**`) is NOT an indicator findings were addressed. Actual findings are below the `---` separator. Discard only comments with no actionable findings (e.g. "No issues found"). Extract each finding and treat it the same as review thread comments for analysis.
```

- [ ] **Step 4: Compress skip-already-addressed (lines 136-144)**

Replace:
```
**Skip already-addressed issues**: For each specific issue extracted from a Claude bot comment,
check if a reply comment exists that SPECIFICALLY references that issue. A reply is only
considered to address an issue if:
1. It was posted AFTER the Claude bot comment (higher comment ID)
2. It explicitly references the specific issue (by title, file path, or description)
3. It references a commit SHA or says "Fixed" in relation to that specific issue

A reply addressing issue X from Claude comment A does NOT count as addressing issue Y from
Claude comment B. Each issue in each comment must be independently checked.
```
With:
```
**Skip already-addressed issues**: For each extracted issue, check if a later reply (higher comment ID) specifically references that issue (by title, file path, or description) and references a commit SHA or says "Fixed". Each issue must be independently matched - a reply addressing one issue does not cover others.
```

- [ ] **Step 5: Compress Greptile NOTE and skip-addressed (lines 194-196, 204-205)**

Replace the NOTE:
```
   **NOTE:** Greptile's format varies across reviews. Headers may use `<h3>` HTML tags or
   plain markdown. The "Remaining findings:" section may or may not be present. Always check
   for all three sections regardless of which format the current comment uses.
```
With:
```
   **NOTE:** Greptile's format varies - headers may be `<h3>` or markdown, and "Remaining findings:" may be absent. Always check for all three sections.
```

Replace Greptile skip-addressed:
```
**Skip already-addressed issues**: Same logic as Source B - check if a reply comment exists
that specifically references the finding by file path or description.
```
With:
```
**Skip already-addressed issues**: Same logic as Source B.
```

- [ ] **Step 6: Compress GraphQL code comment (inside first query, lines 44-46)**

Replace:
```
# IMPORTANT: This query uses cursor-based pagination. The GitHub GraphQL API
# returns at most 100 nodes per request. You MUST loop until hasNextPage is false.
# On each iteration, pass the endCursor from the previous response as $after.
```
With:
```
# Paginate: loop until hasNextPage is false, passing endCursor as $after each iteration.
```

- [ ] **Step 7: Compress Source B fetch comment (lines 118-121)**

Replace:
```
# Fetch ALL issue comments from claude[bot] - no content filtering at fetch time.
# Claude bot reviews use varied formats so any pattern-based filter WILL miss comments.
# IMPORTANT: Use --paginate to fetch ALL pages. Without it, only the first page
# (default 30 items) is returned, silently missing comments on later pages.
```
With:
```
# Fetch ALL claude[bot] issue comments. Use --paginate (default returns only 30 items).
# No content filtering - Claude bot formats vary, so pattern filters miss comments.
```

- [ ] **Step 8: Compress presentation template field descriptions (lines 310-325)**

Replace:
```
- **What was reported**: {What the reviewer flagged - their exact concern, which file/line
  they pointed at, what they suggested. The reader needs to know the input before evaluating
  the analysis.}
- **Context**: {What area of the codebase this touches and what it does. The reader must
  understand the domain before evaluating the problem. Name the feature, subsystem, or flow
  this code belongs to, and what role the affected file/function plays in it.}
- **What's actually happening**: {Your independent analysis of the code. What the code does,
  why it's wrong, how you verified. May confirm the reviewer's concern, refine it, or identify
  a different root cause. Describe as behavior, not code mechanics.}
- **Impact if not fixed**: {What breaks, degrades, or is at risk. User-visible or system-visible
  consequences. Include severity signal: is this causing failures now, or is it a latent risk
  under specific conditions?}
- **Recommended fix**: {Describe the resulting behavior so the reader can independently judge
  whether the fix is correct. For non-trivial fixes, explain why this approach over alternatives.
  For FIX_UNCLEAR: "Requires approach decision - see below."
  For ASK_USER: "Requires validity determination - see below."}
```
With:
```
- **What was reported**: {Reviewer's exact concern: file/line, what they flagged, what they suggested.}
- **Context**: {Feature/subsystem this code belongs to, what the affected file/function does.}
- **What's actually happening**: {Independent analysis: what the code does, why it's wrong, how you verified. May confirm, refine, or identify a different root cause. Behavior, not code mechanics.}
- **Impact if not fixed**: {What breaks or degrades. User/system-visible consequences. Severity: failing now vs latent risk.}
- **Recommended fix**: {Resulting behavior, so the reader can judge correctness. For non-trivial: why this approach. FIX_UNCLEAR: "Requires approach decision - see below." ASK_USER: "Requires validity determination - see below."}
```

- [ ] **Step 9: Compress Presentation Rules preamble (lines 335-338)**

Replace:
```
These rules govern how every finding in the report is written. The reader is a developer
reviewing PR feedback - they need to quickly understand each issue, judge its validity, and
evaluate whether the planned fix is correct. Every item must be independently comprehensible
without referring to any other part of the report or the codebase.
```
With:
```
Every item must be independently comprehensible without referring to other parts of the report or the codebase.
```

- [ ] **Step 10: Compress FIX_UNCLEAR vs ASK_USER (lines 260-264)**

Replace:
```
**Distinguishing FIX_UNCLEAR vs ASK_USER**: Use `FIX_UNCLEAR` when the issue is clearly valid
(it IS a bug or a real problem) but you need guidance on which fix approach to take. Use
`ASK_USER` when you cannot determine whether the comment even identifies a real issue - perhaps
the code behavior is intentional, or the context is insufficient to judge. When in doubt about
validity, use `ASK_USER`. When in doubt about approach (but not validity), use `FIX_UNCLEAR`.
```
With:
```
**Distinguishing FIX_UNCLEAR vs ASK_USER**: `FIX_UNCLEAR` = issue is clearly valid but fix approach needs guidance. `ASK_USER` = cannot determine if the comment identifies a real issue. Doubt about validity -> `ASK_USER`. Doubt about approach only -> `FIX_UNCLEAR`.
```

- [ ] **Step 11: Compress file references instruction (lines 271-274)**

Replace:
```
**All file references in the report MUST be clickable markdown links with absolute file paths
and line numbers**, e.g. `[config.ts:42-58](/absolute/path/to/config.ts#L42-L58)`. This applies
to every file mentioned anywhere in the report - problem descriptions, fix descriptions, file
lists, decision context, options, everything. No plain-text file paths.
```
With:
```
**All file references MUST be clickable markdown links with absolute paths and line numbers**, e.g. `[config.ts:42-58](/absolute/path/to/config.ts#L42-L58)`. No plain-text file paths anywhere in the report.
```

- [ ] **Step 12: Compress Rule 9, Step 4 NOTE, consultation loop, dispatch note**

Rule 9 - replace:
```
**9. Ground effort estimates in scope, not gut feel.**
The "Effort" field (low/medium/high) must reflect the actual scope of the change. Low: single
file, mechanical change, no design decisions. Medium: multiple files or a design choice involved.
High: cross-cutting change, new abstractions, or significant refactoring. If you can't determine
effort without deeper investigation, say "medium (needs investigation)" rather than guessing.
```
With:
```
**9. Ground effort estimates in scope.**
Low: single file, mechanical, no design decisions. Medium: multiple files or a design choice. High: cross-cutting, new abstractions, or significant refactoring. If unclear, say "medium (needs investigation)".
```

Step 4 NOTE - replace:
```
**NOTE**: The fixme-task pipeline already runs verification as its final gate (via fixme-execute-plan). This step is a safety net - if the pipeline completed successfully, verification should already pass. If it doesn't, something went wrong during execution that needs investigation.
```
With:
```
**NOTE**: This is a safety net - fixme-task already runs verification via fixme-execute-plan. If verification fails here, investigate what went wrong during execution.
```

Dispatch CRITICAL note - replace:
```
**CRITICAL**: The agent runs with a clean prompt - do NOT leak your current conversation context into the agent prompt. Provide only the task-specific data listed above. The agent definition handles role binding and SKILL.md preloading via `skills` frontmatter.
```
With:
```
**CRITICAL**: Do NOT leak conversation context into the agent prompt. Provide only the task-specific data listed above. The agent definition handles role binding and SKILL.md preloading.
```

- [ ] **Step 13: Trim Notes section to non-redundant items only (lines 660-674)**

Replace the entire Notes section with only items not already covered in the workflow:
```
## Notes

- One commit for all fixes (unless logically separate)
- Be specific in replies - reference exact lines/commits
- Don't resolve threads you can't fully address
- Save thread_id from initial GraphQL fetch for resolving threads later
- Pagination is mandatory: REST uses `--paginate`, GraphQL loops with `after`/`hasNextPage`
- fixme-task dispatch uses `subagent_type`; dispatch prompts contain only task-specific inputs
```

- [ ] **Step 14: Verify and commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md && git commit -m "chore: optimize fixme-pr-comments token usage"
```

---

### Task 9: fixme-rebase/SKILL.md (~700 token savings, 5.3% reduction)

**Files:**
- Modify: `.claude/skills/fixme-rebase/SKILL.md`

This file is 52KB - the largest skill. Only high-value rewrites with exact text are included. Smaller items (<100 chars) are deferred.

- [ ] **Step 1: Compress Phase 2.5 intro paragraph (line ~225)**

Replace:
```
When a parent feature branch has been squash-merged to the target branch, the current branch retains the parent's individual commits. A normal `git rebase <target>` tries to replay ALL those commits (including the parent's) onto the target, causing massive conflicts because the target already contains those changes in squashed form. The fix is `git rebase --onto <target> <fork-point>` which replays only the current branch's own commits.
```
With:
```
If a parent branch was squash-merged to the target, the current branch still has the parent's individual commits. `git rebase <target>` replays all of them, causing conflicts since the target already has those changes. Fix: `git rebase --onto <target> <fork-point>` to replay only our own commits.
```

- [ ] **Step 2: Compress Phase 2.5 cascade intro (line ~227)**

Replace:
```
This phase runs a cascade of increasingly expensive detection steps, short-circuiting when a definitive answer is found. If a squash-merged ancestor is detected, the rebase switches to `--onto` mode. The user always confirms before execution.
```
With:
```
Runs increasingly expensive detection steps, short-circuiting on definitive answer. If detected, switches to `--onto` mode. User confirms before execution.
```

- [ ] **Step 3: Compress "When to skip" (line ~229)**

Replace:
```
**When to skip:** If the commit count from Phase 2 step 2 is small (5 or fewer commits in `MERGE_BASE..HEAD`) AND the cherry-mark analysis from Phase 2 step 6 shows no `=`-marked commits, skip this phase - the scenario is unlikely and detection cost isn't justified. Proceed directly to Phase 3.
```
With:
```
**When to skip:** If 5 or fewer commits in `MERGE_BASE..HEAD` AND no `=`-marked commits in cherry-mark analysis, skip this phase. Proceed to Phase 3.
```

- [ ] **Step 4: Compress --is-ancestor note (line ~250)**

Replace:
```
**Note:** Do NOT verify whether the candidate's tip is an ancestor of BASE_BRANCH. After a squash merge, the original branch's commits are unreachable from the target (the squash commit is a new single-parent commit). An `--is-ancestor` check would reject all valid squash-merge candidates - the exact scenario this phase exists to detect. The merge-base proximity check above is sufficient signal for a candidate to proceed to user confirmation. Step 2 (GitHub PR metadata) provides independent verification.
```
With:
```
**Note:** Do NOT check `--is-ancestor` against BASE_BRANCH. After squash merge, original commits are unreachable from the target (squash commit is single-parent). This check would reject all valid candidates. Merge-base proximity is sufficient signal; Step 2 provides independent verification.
```

- [ ] **Step 5: Compress deleted branches note (line ~261)**

Replace:
```
**Note on deleted branches:** The common case after squash-merge is that the parent branch was deleted. In that case, no local branch will match and this step produces no result. That's expected - Steps 2-4 handle this case.
```
With:
```
**Note:** If the parent branch was deleted (common after squash-merge), this step produces no result. Steps 2-4 handle that case.
```

- [ ] **Step 6: Compress Step 3 heuristic evaluation intro (lines ~342-346)**

Replace:
```
The squash-merge signal is the ratio between the actual diff against target (`git diff --stat <BASE_BRANCH> HEAD`) and the sum of individual commit diffs. In a normal branch, these are roughly similar. In a squash-merge scenario:
- The individual commits include all the parent's commits (large cumulative diff)
- The actual diff against target is small (parent's changes already on target via squash)
- So the ratio (actual_diff / cumulative_commit_diff) is much less than 1
```
With:
```
Signal: ratio of actual diff vs cumulative commit diffs. Normally these are similar. In a squash-merge scenario, cumulative diffs are large (include parent's commits) but actual diff is small (parent's changes already on target), so the ratio is much less than 1.
```

- [ ] **Step 7: Compress Step 4 "The insight" paragraph (line ~364)**

Replace:
```
**The insight:** Inherited commits (from the squash-merged parent) produce diffs against the target that SHRINK as we walk forward in time. This is because each inherited commit brings the branch closer to the state that was squash-merged. At the fork point (where the current branch's own commits begin), the diff starts GROWING because new work is diverging from the target.
```
With:
```
**The insight:** Inherited commits produce diffs against target that SHRINK over time (each brings the branch closer to the squash-merged state). At the fork point, the diff starts GROWING (new work diverging from target).
```

- [ ] **Step 8: Compress Step 4 inflection algorithm (lines ~384-388)**

Replace:
```
2. For each position `i` from 1 to N-1, compute:
   - `left_trend` = average change in size for commits 0..i (is the diff shrinking?)
   - `right_trend` = average change in size for commits i..N-1 (is the diff growing?)
3. The optimal inflection point is the position `i` where `left_trend` is most negative (shrinking) and `right_trend` is most positive (growing). More precisely, maximize: `right_trend - left_trend`.
4. The commit at position `i` is the first own commit (the inflection point). The FORK_POINT is the commit at position `i-1` (the last inherited commit, i.e., the parent of the inflection). This is because `git rebase --onto <target> <FORK_POINT>` replays `FORK_POINT..HEAD`, which excludes FORK_POINT itself. Recording `i-1` ensures the first own commit at position `i` is included in the replay range.
```
With:
```
2. For each position `i` from 1 to N-1, compute:
   - `left_trend` = average change in size for commits 0..i (shrinking?)
   - `right_trend` = average change in size for commits i..N-1 (growing?)
3. Optimal inflection: maximize `right_trend - left_trend`.
4. `FORK_POINT` = commit at `i-1` (last inherited commit). This is correct because `git rebase --onto <target> <FORK_POINT>` replays `FORK_POINT..HEAD`, so `i-1` ensures commit `i` (first own commit) is included.
```

- [ ] **Step 9: Compress Deep Hierarchy section (lines ~449-459)**

Replace:
```
The branch hierarchy can be deep: `master -> feat-1 -> feat-2 -> current`. If both `feat-1` and `feat-2` were squash-merged to master, the detection needs to find where the current branch's own commits begin - which is the fork point from `feat-2` (the most recent parent).

The detection steps naturally handle this:
- **Step 1** finds the closest parent branch by checking merge-base proximity
- **Step 2** finds the most recently merged PR whose branch shares history
- **Step 3** heuristic signals are the same regardless of depth
- **Step 4** content walk finds the inflection point regardless of how many ancestors were squashed - inherited commits still shrink the diff, own commits still grow it

The fork point from any detection step is the point where the CURRENT branch's own commits begin, which is correct for `--onto` regardless of hierarchy depth. We don't need to identify or enumerate intermediate ancestors.
```
With:
```
Hierarchy can be deep: `master -> feat-1 -> feat-2 -> current`. If both parents were squash-merged, detection must find where the current branch's own commits begin (fork point from the most recent parent, `feat-2`).

All detection steps handle this naturally - Steps 1-4 each find the most recent fork point regardless of hierarchy depth. No need to identify intermediate ancestors.
```

- [ ] **Step 10: Compress Phase 1 Step 3 ranking explanation (lines ~112-114)**

Replace:
```
   **Ranking:** The branch whose merge-base produces the FEWEST commits on our side (`merge-base..HEAD`) is the most likely parent. This works because:
   - If we forked from `feat/alp-84`, the merge-base with it is close to HEAD (only our new commits above it).
   - If we check `master`, the merge-base is much further back (all of `feat/alp-84`'s commits plus ours).
```
With:
```
   **Ranking:** The branch whose merge-base produces the FEWEST commits on our side (`merge-base..HEAD`) is the most likely parent - a closer merge-base means fewer commits between fork point and HEAD.
```

- [ ] **Step 11: Compress Phase 1 Step 5 CRITICAL note (lines ~124-126)**

Replace:
```
   **CRITICAL: Do NOT evaluate edge cases (already up-to-date, empty rebase, etc.) until AFTER this step completes.** The local base branch may be stale or diverged from its remote. Any comparison against a stale local ref is meaningless. Step 6 performs those checks after freshening.

   Before rebasing, ensure both the base branch and the current branch are up-to-date with their remotes. These checks ONLY apply when a branch has a remote tracking branch - local-only branches are fine as-is.
```
With:
```
   **CRITICAL: Do NOT evaluate edge cases (already up-to-date, empty rebase, etc.) until AFTER this step completes.** A stale local ref makes all comparisons meaningless.

   Ensure both branches are up-to-date with their remotes. These checks only apply when a branch has a remote tracking branch - local-only branches are fine as-is.
```

- [ ] **Step 12: Compress Shallow clone explanation (lines ~931-936)**

Replace:
```
A shallow clone is a partial copy of the repository that only includes recent commit history (created with `git clone --depth N`). The merge-base - the common ancestor commit where the current branch diverged from the base branch - may lie beyond the shallow boundary. Without the merge-base, git cannot determine which commits belong to the branch vs the base, and the rebase will fail.

The fix is `git fetch --unshallow origin`, which downloads the full history. This can be a large download on repos with extensive history.
```
With:
```
The merge-base may lie beyond the shallow boundary, causing rebase to fail. Fix: `git fetch --unshallow origin` (may be a large download).
```

- [ ] **Step 13: Compress Error Recovery intro (lines ~957-961)**

Replace:
```
At any point if something goes wrong, **present the situation and recovery options to the user.** Never execute destructive recovery commands without explicit confirmation.

Present to the user:

"Something went wrong during rebase. Here's the current state and recovery options:"
```
With:
```
If something goes wrong, **present the situation and recovery options.** Never execute destructive commands without explicit confirmation.

Present:
```

- [ ] **Step 14: Verify and commit**

```bash
git add .claude/skills/fixme-rebase/SKILL.md && git commit -m "chore: optimize fixme-rebase token usage"
```

---

### Task 10: Final verification and deploy

- [ ] **Step 1: Run install.sh**

```bash
cd /Users/denis/projects/denis/ai/fixme && ./install.sh
```

- [ ] **Step 2: Verify all installed copies match source**

```bash
for skill in fixme-task fixme-write-plan fixme-execute-plan fixme-review-plan fixme-review-code fixme-handle-plan-review fixme-handle-code-review fixme-pr-comments fixme-rebase; do
  diff .claude/skills/$skill/SKILL.md ~/.claude/skills/$skill/SKILL.md || echo "MISMATCH: $skill"
done
```

Expected: no output (all match).

- [ ] **Step 3: Measure results**

```bash
echo "=== After optimization ===" && for f in .claude/skills/fixme-task/SKILL.md .claude/skills/fixme-write-plan/SKILL.md .claude/skills/fixme-execute-plan/SKILL.md .claude/skills/fixme-review-plan/SKILL.md .claude/skills/fixme-review-code/SKILL.md .claude/skills/fixme-handle-plan-review/SKILL.md .claude/skills/fixme-handle-code-review/SKILL.md .claude/skills/fixme-pr-comments/SKILL.md .claude/skills/fixme-rebase/SKILL.md; do wc -c "$f"; done
```

Compare against baseline measurements to confirm savings.
