---
name: fixme-review-plan
description: Review an implementation plan for correctness, completeness, and feasibility. Outputs structured findings with evidence and severity. Reads the actual codebase to verify every claim. Designed to minimize false positives.
argument-hint: "<path to plan file>"
---

# Review Plan

Review an implementation plan and produce high-quality, evidence-backed findings.

## Input Resolution

Resolve the plan to review in this order:
1. **Argument**: if a file path is passed as an argument, use it
2. **IDE context**: if the user has a file open/selected, use it
3. **Convention**: check `.fixme/plans/` for the most recent plan
4. **Ask**: prompt the user for the plan location

Read the plan fully before proceeding. If a specification or context document is referenced in the plan, read that too.

## Two-Pass Review Process

**The review is a two-pass process. Do not emit findings as you discover them.**

### Pass 1: Investigation (internal, not in output)

Read the plan, read the codebase, identify candidate issues. For each candidate, run it through the Pre-Review Gate below. This is your thinking process - none of it appears in the final output.

- If gate-checking reveals the candidate is not actually an issue, discard it silently. Do NOT include retracted, dismissed, or "on further analysis, no issue" findings in the output. If you talked yourself out of it, it's not a finding.
- If gate-checking reveals uncertainty, move it to Questions.
- If the candidate survives all gates, promote it to a confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings that survived Pass 1. The report should contain zero artifacts of your investigation process - no "I initially thought X but then realized Y", no retracted findings, no findings where the Evidence is "N/A" or the Confidence is "N/A".

## Pre-Review Gate

Before promoting ANY candidate to a finding, pass it through every gate. If it fails any gate, drop it silently.

1. **Did I read the relevant source code?** If no, read it first. Plans often reference patterns that exist in the codebase but aren't spelled out.
2. **Does the spec/context explain this?** The plan may look odd in isolation but make sense given constraints not yet internalized. Re-read the spec.
3. **Is this an intentional tradeoff?** Plans often choose a suboptimal approach in one dimension to optimize another. If suspected, note it as a question, not a finding.
4. **Am I sure about the API/framework behavior I'm assuming?** If the finding depends on how a library works, verify against the actual dependency version in the project. Do not rely on general knowledge - APIs change.
5. **Would fixing this actually improve the outcome?** Technically correct feedback that makes the plan worse (more complex, slower to ship, harder to maintain) is bad feedback.
6. **Does this contradict a locked decision?** If the plan includes a Locked Decisions section in its Context, those are settled user choices. Do not flag findings that disagree with locked decisions. If a locked decision itself appears problematic (would cause a bug, break something), frame it as a question in the Questions section, not as a finding.
7. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "minor cosmetic", or "not blocking", the finding cannot be IMPORTANT or BLOCKING. Either downgrade to MINOR or drop it entirely. A finding whose suggestion starts with "Minor" or "Consider" is almost certainly not IMPORTANT.

## Foundational Mindset: Do Not Trust

Plans describe intent, not reality. Every claim a plan makes about the codebase - file paths, function signatures, type shapes, API behaviors, existing patterns - is a hypothesis until verified by reading the actual code. The reviewer's job is to verify these claims, not assume them.

A plan where every step is individually correct but collectively does not solve the stated problem is the most dangerous failure mode. It passes a checklist review but fails goal-backward analysis. Always start from the outcome and work backwards.

## Verification Dimensions

Use the dimension name as the finding's Category value (e.g., Dimension 3: Claim Verification -> category CLAIM-VERIFICATION).

### Dimension 1: Goal Achievement

**Question:** If every step executes perfectly, is the stated problem actually solved?

**Process:**
1. Read the plan's Goal line and the spec/task description
2. Work backwards from the goal: what must be TRUE in the codebase for this goal to be achieved?
3. For each required truth, find the plan step(s) that establish it
4. Check for gaps: truths that have no covering step, or steps that exist but do not actually achieve the truth they claim to address

**Red flags:**
- Plan steps are all individually reasonable but collectively miss the root cause
- Goal says "fix X" but steps only address a symptom of X
- Success criteria in the plan are weaker than what the spec requires
- Plan solves a different (easier) problem than the one stated

### Dimension 2: Requirement Coverage

**Question:** Does every requirement from the spec/task map to one or more plan steps?

**Process:**
1. Extract all requirements from the spec, task description, and any referenced context documents
2. For each requirement, find the plan step(s) that implement it
3. For each plan step, verify it maps back to at least one requirement (detect scope creep)
4. Check for partial coverage: requirement has a step but the step only addresses part of it

**Red flags:**
- Requirement mentioned in spec but no plan step addresses it
- Multiple requirements share one vague step ("implement the fix" for three distinct behaviors)
- Plan includes steps not traceable to any requirement (scope creep)
- Requirement partially covered (handles the happy path but not the error case the spec mentions)

### Dimension 3: Claim Verification

**Question:** Are the plan's factual claims about the codebase actually true?

**Process:**
1. Identify every factual claim the plan makes: file paths, function signatures, type shapes, import paths, API behaviors, existing patterns, dependency versions
2. For each claim, read the actual code to verify it
3. Check the plan's Stable Context section - are the recorded patterns and conventions accurate?
4. For modifications: verify the line ranges cited in the plan match what is actually at those lines

**Red flags:**
- Plan references a file path that does not exist
- Plan assumes a function signature that differs from the actual code
- Plan claims a type has a field it does not have, or misses a required field
- Plan assumes an import path that would not resolve
- Plan cites a line range but the content at those lines is different from what the plan describes
- Plan's Stable Context describes patterns that have changed since it was written

### Dimension 4: Step Correctness

**Question:** Will each step work as described given the actual state of the codebase?

**Process:**
1. For each step that creates or modifies code, trace through the logic against the actual codebase
2. Check for: wrong API usage (verify against actual dependency version), type mismatches, missing awaits, race conditions, swapped arguments, off-by-one errors
3. Check that each step's preconditions are met by the steps that come before it
4. Check that steps do not contradict each other (step 3 adds X, step 7 removes X)

**Red flags:**
- Step assumes an API or framework behavior that differs from the actual dependency version in the project
- Step creates a function call with wrong argument types or order
- Step modifies a file but the modification would cause a type error, lint error, or runtime crash
- Two steps make contradictory changes to the same code
- Step relies on a side effect of a previous step that is not guaranteed (ordering assumption)
- Plan fights existing codebase patterns instead of working with them
- Result would not be maintainable by someone who didn't write the plan
- Simpler approaches exist that achieve the same outcome
- Step introduces a performance regression not acknowledged in the plan (N+1 queries, unnecessary re-renders, large payloads)

### Dimension 5: Artifact Wiring

**Question:** Are the artifacts the plan creates connected to each other and to the existing codebase, not just created in isolation?

**Process:**
1. For each new file the plan creates, check: does another step import/reference/register it?
2. For each new function/component/route, check: does a step wire it to its caller/consumer/route table?
3. For modifications to existing files, check: are downstream consumers of the modified code updated if the interface changes?
4. Check for missing "glue" steps: barrel export updates, route registrations, config entries, dependency injections

**Red flags:**
- New component created but no step imports it into a parent
- New API route created but no step calls it from the client
- New utility function created but no step uses it (or the plan says "the executor will wire it up")
- Interface of an existing function changed but callers are not updated
- New test file created but not added to test configuration (if the project requires explicit registration)

### Dimension 6: Executability

**Question:** Can an executor follow each step without making judgment calls not specified in the plan?

**Process:**
1. For each step, apply the Delegation Test: could an executor with zero codebase knowledge execute this step by reading it alone?
2. Check for ambiguous instructions: "update appropriately", "add error handling", "similar to X", "adapt from Y"
3. For new file steps: is the complete content provided, or must the executor design the content?
4. For modification steps: are exact locations (file path, line range, or anchor text) specified?

**Red flags:**
- Step says "based on X" or "adapted from Y" without specifying the final result
- Step says "add appropriate error handling" without specifying which errors and how to handle each
- Step says "similar to the pattern in Z" without inlining the pattern
- New file step lacks complete content or detailed structural specification
- Step could be interpreted two different ways with materially different outcomes
- Step uses "the executor should decide" or "may need to adjust" language

### Dimension 7: Scope Sanity

**Question:** Is the plan small enough to execute without quality degradation?

**Process:**
1. Count total steps across all tasks
2. Count total files created or modified
3. Assess complexity: are the changes straightforward (rename, config) or complex (new algorithms, state machines, concurrency)?
4. Check whether the plan should be split: are there independent subsystems being changed in a single plan?

**Red flags:**
- Plan has more than ~15 implementation steps (excluding verification/commit steps)
- Plan modifies more than ~10 files
- Single task has more than ~12 steps
- Plan combines unrelated changes (bug fix + refactor + new feature in one plan)
- Complex domain logic (auth, payments, concurrency) crammed into a task with many other changes
- Steps that would require changes outside the plan's stated scope

### Dimension 8: Ordering and Dependencies

**Question:** Are steps correctly ordered with no circular dependencies or missing prerequisites?

**Process:**
1. For each step, identify what it depends on (files that must exist, functions that must be defined, types that must be available)
2. Verify that every dependency is satisfied by a step that comes before it in the plan
3. Check for circular dependencies between tasks (Task 2 needs Task 3's output, Task 3 needs Task 2's output)
4. Check for missing verification checkpoints between risky phases (e.g., no build check between two tasks that could conflict)

**Red flags:**
- Step N uses a function/type/file created in step M where M > N
- Two tasks have mutual dependencies (Task A imports from Task B and vice versa, but only one can be implemented first)
- Commit step appears between "write failing test" and "implement to make test pass" (breaks TDD contract)
- No verification step between tasks that modify the same files

### Dimension 9: Decision Compliance

**Question:** Does the plan respect locked decisions and exclude deferred scope?

**Process:**
1. Read the plan's Locked Decisions section and the decision log at `.fixme/decisions.md` (if it exists)
2. For each `[confirmed]` decision: verify the plan implements it as stated. Do not flag findings that merely disagree with confirmed decisions.
3. For each `[assumed]` decision: check whether a realistic alternative exists that would materially change the plan. If yes, flag it (severity: IMPORTANT) - the plan writer should have surfaced this during the Design Decision Checkpoint.
4. Check whether the plan includes work that was explicitly deferred or marked out of scope in previous iterations
5. Read the plan's Questions section (if present). Each item should be purely informational context. Promote to a finding any item that is actually: a correctness concern, a feasibility risk, an unresolved design decision, or a known flaw being deferred to the executor.

**Red flags:**
- Plan contradicts a `[confirmed]` locked decision
- Plan includes work explicitly marked as deferred or out of scope
- `[assumed]` decision has a realistic alternative that would materially change the plan structure
- Questions section contains items that start with "if", "might", "may need to", or "the executor should decide" - these suggest the plan writer deferred real work
- Questions section contains correctness concerns or feasibility risks disguised as informational notes

### Dimension 10: Completeness

**Question:** Does the plan include all the work required to actually complete the task, including implicit steps not spelled out in the spec?

**Process:**
1. Identify the category of change (new feature, refactor, bug fix, schema change, UI change)
2. For each category, check against the standard implicit-work checklist:
   - State-modifying steps -> cleanup / error handling / state reset
   - Behavioral changes -> test steps
   - Schema/contract changes -> migration, backwards compatibility, rollback plan
3. Flag items from the checklist that the plan omits

**Red flags:**
- Missing steps that are implied but not explicit (especially cleanup, error handling, state reset)
- Missing test steps for behavioral changes
- Migrations, backwards compatibility, or rollback not addressed when they should be

## What NOT to Flag

- Style preferences or naming opinions
- **Cosmetic issues** - field ordering in config/frontmatter, whitespace, formatting of generated files, indentation preferences. If it's "functionally correct but looks different", it's not a finding.
- Alternative approaches that aren't clearly better - only flag if the planned approach has a concrete flaw
- Missing error handling for scenarios that genuinely can't happen given the codebase
- "Best practices" that don't apply to the specific context (e.g., suggesting pagination for a list that's bounded to 10 items)
- Vague concerns ("this might be slow") without evidence - either quantify it or don't mention it
- Anything where your own analysis concludes "no issue" - if you investigated and found it works correctly, that's Pass 1 doing its job. Don't report it.

## Multi-Option Suggestions

When a finding admits more than one plausible fix, the Suggestion field must preserve that multiplicity instead of collapsing it to a favorite.

- **List every genuinely distinct option.** If three approaches are viable, list three - not one option with a parenthetical "or alternatively...".
- **For each option, give Approach / Pros / Cons / Impact / Effort.** Keep it tight but concrete. Pros and Cons must be grounded in this codebase, not generic ("cleaner code" is not a Pro).
- **Do not use editorial shortcut labels** like "simpler", "easier", "cleaner", "lighter touch", "just do X" as the basis for preferring one option. These are anchors, not arguments. An option that is "simpler" in line count but slower on the common code path is not simpler in the dimension that matters.
- **If you can confidently recommend one option**, state the recommendation and cite the evidence (what you read, what you measured, what tradeoff is decisive). Otherwise, say explicitly: "Recommendation: none - classify as FIX_UNCLEAR, let the user choose."
- **Dropping the fix entirely is itself an option** and must be evaluated the same way. "Keep the current code" is only acceptable when every alternative is demonstrably worse than the status quo - not when one alternative is just "simpler".

The downstream handler treats your Suggestion as a hypothesis. Single-option suggestions push the handler toward FIX. Multi-option suggestions push it toward FIX_UNCLEAR. Get this right or the user never sees the real choice.

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Location** | Which plan step(s) this relates to |
| **Category** | GOAL-ACHIEVEMENT / REQUIREMENT-COVERAGE / CLAIM-VERIFICATION / STEP-CORRECTNESS / ARTIFACT-WIRING / EXECUTABILITY / SCOPE-SANITY / ORDERING-AND-DEPENDENCIES / DECISION-COMPLIANCE / COMPLETENESS |
| **Severity** | BLOCKING (plan will fail) / IMPORTANT (plan will work but with significant issues) / MINOR (improvement opportunity) |
| **Issue** | What's wrong - be specific. Reference actual file paths, function names, types |
| **Evidence** | The code, spec section, or dependency doc that supports the claim |
| **Suggestion** | How to fix it. Concrete enough to act on. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
| **Confidence** | HIGH / MEDIUM / LOW - be honest. LOW confidence findings are fine to include IF they're BLOCKING severity |

### Final Output Structure

1. **Summary**: 1-2 sentences - is this plan ready to execute, or does it need revision? Be direct.
2. **Findings**: ordered by severity (BLOCKING first, then IMPORTANT, then MINOR). Within severity, GOAL-ACHIEVEMENT and STEP-CORRECTNESS before other categories.
3. **Questions**: things that couldn't be determined from the code/spec that the plan author should clarify.

## Rules

- Fewer high-quality findings >>> many low-quality ones. 5 real issues beats 20 maybes.
- NEVER critique what hasn't been verified against the codebase. "I think this API doesn't support X" is not a finding. Read the code, confirm, then report.
- If unsure whether something is an issue, frame it as a question: "Does X handle Y? I couldn't confirm from reading [file]." Questions are cheaper than wrong findings.
- Separate "the plan won't work" (correctness) from "the plan could be better" (suggestions). Don't mix them.
- If the plan is good and there are no findings, say so. Don't manufacture issues to justify the review.
- When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
