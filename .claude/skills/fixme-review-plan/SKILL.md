---
name: fixme-review-plan
description: Review an implementation plan for correctness, completeness, and feasibility. Outputs structured findings with evidence and severity. Reads the actual codebase to verify every claim. Designed to minimize false positives.
argument-hint: "<path to plan file>"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Review Plan

Review an implementation plan and produce high-quality, evidence-backed findings.

## Input Resolution

Resolve the plan to review in this order:
1. **Argument**: if a plan path, code map path, or review context packet is passed as an argument, use it
2. **IDE context**: if the user has a file open/selected, use it
3. **Convention**: check `<fixme-dir>/plans/` for the most recent plan
4. **Ask**: prompt the user for the plan location

Read the plan fully before proceeding. If a specification, context document, or task code map is referenced in the plan, read that too. If a review context packet is provided, read it for current-run decisions, prior fixes, and source references. The packet and code map are orientation, not authority; verify against the plan, specs, and codebase before making findings.

## Two-Pass Review Process

**The review is a two-pass process. Do not emit findings as you discover them.**

### Pass 1: Investigation (internal, not in output)

Read the plan, read the task code map if available, read the codebase, identify candidate issues. Use the code map to target source reads and avoid rediscovering unrelated neighboring context. For each candidate, run it through the Pre-Review Gate below. This is your thinking process - none of it appears in the final output.

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
7. **Does this contradict the review context packet?** If the packet records a current-run user decision or fix, verify it against the decision log or plan before flagging. If the packet and artifact conflict, the artifact wins.
8. **Does this contradict or depend on the code map?** Re-read the cited source lines before relying on the map. If the map is stale or incomplete, verify directly and mention the stale map only when it creates a concrete plan risk.
9. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "minor cosmetic", or "not blocking", the finding cannot be MAJOR or BLOCKER. Either downgrade to MINOR or INFO, or drop it entirely. A finding whose suggestion starts with "Minor" or "Consider" is almost certainly not MAJOR.

## Foundational Mindset: Do Not Trust

Plans describe intent, not reality. Every claim a plan makes about the codebase - file paths, function signatures, type shapes, API behaviors, existing patterns - is a hypothesis until verified by reading the actual code. The reviewer's job is to verify these claims, not assume them.

A plan where every step is individually correct but collectively does not solve the stated problem is the most dangerous failure mode. It passes a checklist review but fails goal-backward analysis. Always start from the outcome and work backwards.

## Foundational Principle: DRY and Simplicity (FIRST PRINCIPLE)

**DRY and simplicity are first principles of plan review.** Plans plant the duplication that ships in code. Every duplicate, every unjustified wrapper, every "two names for one rule" defect that ends up in the diff existed first as a sentence in a plan. Catching it here is the cheapest possible point in the pipeline - the executor has not run yet, callers have not attached yet, the cleanup is one plan edit instead of a code revert.

Behavior-correct planning is not enough. A plan that produces working code containing duplication, repeated logic, repeated literals, unjustified wrappers, or two names for one rule is a defective plan. Identical logic at two sites is one bug waiting to diverge - and once the plan ships and the code is written, the next change will edit one site and forget the other.

The plan-level failure modes this principle covers:

- **Sibling-without-delta** - the plan asks the executor to introduce two named entities (functions, predicates, types, helpers, constants) that share the same shape but the plan does not specify a behavioral difference between them. The executor will satisfy the literal wording by writing identical bodies.
- **Loose phrasing** - the plan uses formulations like "introduce named predicates", "make the distinction explicit", "split for clarity", "extract a helper" without specifying the behavioral delta or what each new entity must do that an existing entity does not.
- **Duplicates an existing entity** - the plan asks the executor to create a new function/helper/type/constant that already exists in the codebase under a different name.
- **Unjustified wrapper** - the plan asks for a function that wraps an existing function and adds no behavior.
- **Single-call helper** - the plan extracts a helper that will be called from exactly one place, where inlining would be clearer.
- **Type/alias rename** - the plan introduces a type that resolves to an existing type with no domain difference.
- **Repeated literals/expressions** - the plan asks for the same string/path/key to be hardcoded at multiple call sites instead of centralized, or asks for the same expression to be evaluated multiple times instead of stored.
- **Pattern-level repetition** - the plan describes the same algorithm twice in different steps without acknowledging or extracting it.
- **Speculative split** - the plan justifies introducing two entities with "they will diverge later". Plans should split when divergence actually arrives, not before.

The forcing rule for the plan reviewer: **whenever a plan introduces a new named entity, the plan must answer two questions concretely.** (1) What does this entity do that no existing entity already does? (2) If a sibling entity is introduced in the same patch, what is the behavioral delta between them? If the plan does not answer both questions, the plan is incomplete and the executor will fill the gap with duplication.

The dimension that operationalizes this principle is **Dimension 11: DRY and Simplicity (Plan-Level)**. Despite its number, it is checked first - the Findings ordering rule places `DRY-AND-SIMPLICITY` ahead of every other category.

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
2. Use the task code map to find cited source ranges for those claims when available
3. For each claim, read the actual code to verify it
4. Check the plan's Stable Context section and code map - are the recorded patterns and conventions accurate?
5. For modifications: verify the line ranges cited in the plan match what is actually at those lines

**Red flags:**
- Plan references a file path that does not exist
- Plan assumes a function signature that differs from the actual code
- Plan claims a type has a field it does not have, or misses a required field
- Plan assumes an import path that would not resolve
- Plan cites a line range but the content at those lines is different from what the plan describes
- Plan's Stable Context describes patterns that have changed since it was written
- Plan has no task code map, or the code map omits source references for claims that drive implementation
- Code map contains stale or contradictory facts that would mislead review or revision cycles

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
1. Read the plan's Locked Decisions section and the decision log at `<fixme-dir>/decisions.md` (if it exists)
2. For each `[confirmed]` decision: verify the plan implements it as stated. Do not flag findings that merely disagree with confirmed decisions.
3. For each `[assumed]` decision: check whether a realistic alternative exists that would materially change the plan. If yes, flag it (severity: MAJOR) - the plan writer should have surfaced this during the Design Decision Checkpoint.
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

### Dimension 11: DRY and Simplicity (Plan-Level)

**Question:** Does the plan ask the executor to write duplication, repeated logic, repeated literals, unjustified wrappers, or two names for one rule?

**This is checked first, not last.** Despite being numbered last for backwards compatibility, every plan review starts here. See the Foundational Principle section above. Plans plant the duplication that ships in code - the cheapest place to catch it is here, before the executor runs and before downstream callers attach.

**Why this category exists:** when a plan instructs "make the distinction explicit", "introduce named predicates", "extract a helper for clarity", or "split this into separate functions", the literal wording can be satisfied by adding a second name with an identical body. Type checks pass, tests pass, behavior is unchanged - but the codebase now has two names for one rule, and downstream callers will treat them as two distinct domains. The plan reviewer must close this loophole at the planning stage by demanding a behavioral delta whenever the plan introduces multiple named entities.

**Process:**

1. **Enumerate every new named entity the plan introduces.** List every new function, helper, predicate, hook, type, interface, type alias, enum, module-level constant, component, and significant variable that the plan asks the executor to create.

2. **For each new entity, find the closest sibling that could already do the job.** Read the codebase. A "sibling" is any existing entity with overlapping shape and purpose - same parameter list, same return type, same general role.

3. **Apply the existence test.** Ask: does this entity already exist somewhere, possibly under a different name? If yes, the plan should reuse the existing entity, not introduce a new one. Flag the duplicate-of-existing case.

4. **Apply the sibling-delta test.** When the plan introduces two or more entities of the same shape (siblings introduced together):
   - Does the plan specify what each entity does that the others do not?
   - Is the behavioral delta described in concrete terms (different filter, different argument, different return) or only in naming terms ("X is the followed-agent version, Y is the circle version")?
   - If the plan only specifies names without describing the behavioral delta, the plan is incomplete - flag it. The executor will write identical bodies because the plan does not tell them otherwise.

5. **Apply the wrapper test.** For every new entity that delegates to or wraps an existing entity, ask: what behavior does the new entity add that callers cannot get by calling the existing entity directly? If the answer is "none", the wrapper is unjustified - flag it.

6. **Apply the inline test.** For every new helper the plan extracts, count its planned call sites. If the helper will be called from exactly one place and the plan does not anticipate additional callers, the extraction is unjustified - inlining would be clearer.

7. **Scan for plan-level repetition:**
   - The same algorithm or transformation described in two different steps without acknowledging the duplication
   - The same literal value (string, path, key, ID, tag) hardcoded at multiple call sites that the plan describes as separate edits
   - The same expression evaluated multiple times in the planned code instead of stored once
   - Multiple plan steps that produce structurally identical code in different files

8. **Detect loose phrasing that produces duplicates.** Flag plan instructions like:
   - "introduce named predicates X and Y" without specifying what X filters that Y does not (and vice versa)
   - "make the distinction explicit by splitting into A and B" without saying what each side actually does differently
   - "extract a helper for clarity" without specifying the call sites that will use it and the behavior it encapsulates
   - "create a wrapper for X" without specifying what the wrapper adds
   - "for future divergence" or "we may want to differ later" - these are speculative and not a license to ship duplication

9. **Apply the speculative-divergence test.** If the plan justifies introducing two entities by claiming "they will diverge later" or "we want the option to change one without the other", treat this as a defect. Plans should split when divergence actually arrives. Speculative future divergence is not a license to plant duplication today.

**Concrete patterns to flag:**

- Plan introduces two predicates with names that imply a domain split (`isVisibleX`, `isVisibleXForCircle`) without specifying what each one filters
- Plan introduces a "specialized" version of a generic function without saying what the specialization does
- Plan creates a new helper with a body that already exists in a shared module the plan does not import
- Plan asks for a wrapper that calls one underlying function and does nothing else
- Plan introduces a type alias whose definition matches an existing type
- Plan hardcodes the same string literal in three new files instead of asking for a constant
- Plan describes the same transformation in two different task sections without extracting it
- Plan uses "split for clarity" or "introduce named X" without giving the behavioral contract for each side

**Red flags:**

- Two new named entities with the same described shape but no described behavioral delta
- Plan creates an entity whose described behavior matches an existing entity's behavior
- Wrappers, helpers, or aliases that the plan introduces without specifying what they add over what already exists
- Single-call helpers extracted "for clarity" that obscure rather than clarify
- Repeated literal values across plan steps that should be a constant
- Plan steps that describe identical or near-identical code blocks in different files
- Loose verbs in the plan ("split", "extract", "introduce", "make explicit") without a concrete behavioral contract for each new entity

**Verification before flagging:**

For each suspected case, write down what the plan tells the executor about the new entity's behavior. If you cannot construct an unambiguous body from the plan alone - one that differs from every sibling entity - the plan is the defect. The executor cannot guess the missing delta; they will produce duplication.

**Possible fixes (the finding's Suggestion must list these as Multi-Option when more than one applies):**

1. **Reuse:** drop the new entity from the plan; have the executor use the existing entity at all call sites. Best when the new entity duplicates an existing one.
2. **Specify the delta:** rewrite the plan step to spell out exactly what each sibling entity does that the others do not (e.g., "X excludes archived agents, Y includes them when state==='archived' is requested"). Best when the names imply a real distinction the plan failed to describe.
3. **Collapse to one:** rewrite the plan to introduce one named entity instead of two. Best when the names were never meant to encode distinct rules.
4. **Inline:** rewrite the plan to inline the proposed helper at its single call site instead of extracting it. Best when there is exactly one caller.
5. **Centralize:** rewrite the plan to introduce a shared constant/helper/module instead of repeating the same value or logic across multiple steps.
6. **Defer the split:** remove the speculative split from the plan; revisit when divergence actually arrives.

The Suggestion must classify which case applies based on the plan's intent. When more than one fix is plausible, present them per Multi-Option Suggestions.

**Severity:** BLOCKER by default. A plan that asks the executor to write duplication is a defective plan and must be revised before execution. The only exception is MINOR severity for a plan-level duplicate that is clearly localized, has zero downstream callers, and the plan explicitly anticipates would be cleaned up in a follow-up step.

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
| **Category** | DRY-AND-SIMPLICITY / GOAL-ACHIEVEMENT / REQUIREMENT-COVERAGE / CLAIM-VERIFICATION / STEP-CORRECTNESS / ARTIFACT-WIRING / EXECUTABILITY / SCOPE-SANITY / ORDERING-AND-DEPENDENCIES / DECISION-COMPLIANCE / COMPLETENESS |
| **Severity** | BLOCKER (plan will fail or must not execute) / MAJOR (plan will work but with significant issues) / MINOR (nonblocking improvement) / INFO (observation only) |
| **Issue** | What's wrong - be specific. Reference actual file paths, function names, types |
| **Evidence** | The code, spec section, or dependency doc that supports the claim |
| **Suggestion** | How to fix it. Concrete enough to act on. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
| **Confidence** | HIGH / MEDIUM / LOW - be honest. LOW confidence findings are fine to include IF they're BLOCKER severity |

### Final Output Structure

1. **Summary**: 1-2 sentences - is this plan ready to execute, or does it need revision? Be direct.
2. **Findings**: ordered by severity (BLOCKER first, then MAJOR, then MINOR, then INFO). Within severity, **DRY-AND-SIMPLICITY first**, then GOAL-ACHIEVEMENT and STEP-CORRECTNESS, then other categories.
3. **Questions**: things that couldn't be determined from the code/spec that the plan author should clarify.
4. **Scope**: plan reviewed, code map used if provided, and review context packet used if provided.

## Rules

- Fewer high-quality findings >>> many low-quality ones. 5 real issues beats 20 maybes.
- DRY-AND-SIMPLICITY findings where the plan asks the executor to introduce duplication, repeated logic, repeated literals, unjustified wrappers, single-call helpers, type aliases without domain difference, or two named entities without a specified behavioral delta are BLOCKER severity. Plans plant the duplication that ships in code. The only exception is MINOR severity for a plan-level duplicate that is clearly localized, has zero downstream callers, and the plan explicitly schedules its cleanup. Loose phrasing like "introduce named predicates" or "split for clarity" without a behavioral contract for each new entity is itself the finding - the plan is incomplete and will produce duplication.
- NEVER critique what hasn't been verified against the codebase. "I think this API doesn't support X" is not a finding. Read the code, confirm, then report.
- If unsure whether something is an issue, frame it as a question: "Does X handle Y? I couldn't confirm from reading [file]." Questions are cheaper than wrong findings.
- Separate "the plan won't work" (correctness) from "the plan could be better" (suggestions). Don't mix them.
- If the plan is good and there are no findings, say so. Don't manufacture issues to justify the review.
- When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
