---
name: fixme-review-code
description: Review code produced by executing an implementation plan. Finds real bugs, gaps, test issues, and inconsistencies by reading the plan, the spec, and every changed file. Designed for high signal - findings are grounded in evidence with minimal false positives. Catches reimplemented business logic in tests, missing coverage, wrong assertions, and deviations from the plan.
argument-hint: "<path to plan file> [base-branch]"
---

# Review Code

Review the code produced by plan execution. Find everything that's actually wrong. Flag nothing that isn't.

## Hard Constraints

- **NO code modifications.** This is a review. The only output is the report.
- **Read everything before writing anything.** The plan, the spec/task, every changed file, every new test, every modified test. Partial reads produce false findings.
- **Every finding must cite evidence.** No "this seems wrong" - show what's wrong and where.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if file paths are passed (plan, spec, diff/branch), use them
2. **Conversation context**: if the plan and execution results are in the current conversation, use them
3. **Git**: use `git diff` against the base branch to identify all changed files, and find the most recent plan in `.fixme/plans/`
4. **Ask**: prompt the user for plan location and how to identify the changes

Read all of these before writing the report:
- The implementation plan
- The spec/task description (if referenced in the plan)
- Every file created or modified (full file, not just the diff - context matters)
- Every test file created or modified (full file)
- The original files before changes (via git) when needed to understand what changed

## Pre-Review: Build Context

Before evaluating anything, understand:

1. **What was the goal?** Read the plan header and spec. What does "done" look like?
2. **What was the approach?** Read the plan's architecture and file map.
3. **What was actually changed?** Read every diff. Map changes back to plan tasks.
4. **What patterns does the codebase use?** Read neighboring files to understand conventions, not just the changed files.
5. **What stable context does the plan provide?** Read the plan's `## Context` section. Stable Context provides architecture, patterns, conventions, and dependency information discovered during planning. Use this as a head start - no need to re-explore the full codebase for this information. Re-read changed files directly for current state.

This prevents the most common source of false findings: reviewing code without understanding why it was written that way.

## What to Look For

### Plan Compliance
- Steps that were skipped or partially implemented
- Deviations from the plan's approach without documented justification
- Files in the plan's File Map that weren't touched, or files touched that aren't in the File Map

### Correctness
- Logic errors, off-by-one, wrong comparisons, swapped arguments
- Race conditions, missing awaits, unhandled promise rejections
- Null/undefined access paths that aren't guarded
- Wrong types, unsafe casts, type assertions that hide real mismatches
- State mutations where immutability is expected (or vice versa)
- Error handling that swallows errors silently or handles the wrong error type

### Test Quality

**This is a primary focus area.** Bad tests are worse than no tests - they create false confidence.

- **Reimplemented business logic in tests (CRITICAL).** If a test file contains a function, calculation, mapping, or transformation that duplicates production code instead of importing and calling it - this is always a finding. The test must exercise the production code, not a copy of it. Common patterns:
  - Test defines its own version of a helper/utility that exists in production
  - Test hardcodes a computation result instead of calling the function
  - Test reimplements a state machine, parser, or transformer to "verify" it matches
  - Test copies constants, configs, or mappings from production instead of importing them
- **Wrong assertions.** Test passes but doesn't actually verify the intended behavior. Assertions that are always true, assertions on the wrong value, assertions that test implementation details instead of behavior.
- **Missing assertions.** Test sets up a scenario but doesn't assert the important outcomes. Especially: tests that only assert "no error thrown" when they should assert specific results.
- **Missing test cases.** Plan specified tests that weren't written. Behavioral changes without corresponding tests. Error paths without tests.
- **Fragile tests.** Tests coupled to implementation details (internal state, private methods, call order) rather than observable behavior.
- **Mocked production code.** Tests that mock the very thing they should be testing. Mocks are for external dependencies, not for the code under test.

### Performance
- N+1 queries or API calls in loops
- Unnecessary re-renders (missing memoization where components receive new object/array references on every render)
- Large data structures created on every call where they could be static
- Synchronous blocking operations where async is expected
- Missing cleanup (event listeners, subscriptions, timers not torn down)

### Security
- User input used without sanitization
- Secrets or tokens in code or logs
- Missing authentication/authorization checks that the plan specified

### Consistency
- Naming that doesn't match codebase conventions
- Patterns that diverge from how neighboring code does the same thing
- Import style inconsistencies
- Error handling approach different from the rest of the codebase

## Two-Pass Review Process

**The review is a two-pass process. Do not emit findings as you discover them.**

### Pass 1: Investigation (internal, not in output)

Read all changed files, the plan, and the spec. Identify candidate issues. For each candidate, run it through the Pre-Finding Gate below. This is your thinking process - none of it appears in the final report.

- If gate-checking reveals the candidate is not actually an issue, discard it silently. Do NOT include retracted, dismissed, or "on further analysis, no issue" findings in the report.
- If gate-checking reveals uncertainty, move it to Questions.
- If the candidate survives all gates, promote it to a confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings that survived Pass 1. The report should contain zero artifacts of your investigation process - no retracted findings, no findings where Evidence or Confidence is "N/A".

## Pre-Finding Gate

Before promoting ANY candidate to a finding, pass it through every gate. If it fails any gate, drop it silently.

1. **Did I read the full context?** Both the changed file AND the plan step that produced it. A finding based on reading only the diff is likely wrong.
2. **Is the plan responsible?** If the code follows the plan exactly and the issue is in the plan's design, this is a plan review finding, not a code review finding. Flag only if the implementation made it worse than the plan specified.
3. **Am I sure about the API/framework behavior?** Verify against the actual dependency version. Don't flag "missing await" on a function that's synchronous.
4. **Is this a real convention in this codebase?** Read neighboring files before flagging style issues. The convention might be different from what you'd expect.
5. **Does fixing this actually improve the outcome?** If the change would make code more complex for marginal benefit, drop it.
6. **Does this contradict a locked decision?** If the plan includes Locked Decisions in its Context section, those are settled user choices. Do not flag code that implements a locked decision. If the locked decision itself appears to cause a problem in practice, frame it as a question, not a finding.
7. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "cosmetic", or "not blocking", the finding cannot be IMPORTANT or BLOCKING. Either downgrade to MINOR or drop it entirely.

## What NOT to Flag

- Style preferences not established by the codebase's linter/formatter
- Alternative approaches that aren't clearly better - only flag if the implementation has a concrete flaw
- "Best practices" that don't apply to the specific context
- Pre-existing issues in unchanged code (review scope is the changes only)
- Missing features that aren't in the plan or spec (that's a plan gap, not a code issue)

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
| **Location** | Exact file path and line range |
| **Category** | PLAN-COMPLIANCE / CORRECTNESS / TEST-QUALITY / PERFORMANCE / SECURITY / CONSISTENCY |
| **Severity** | BLOCKING (broken/wrong behavior) / IMPORTANT (works but with significant issues) / MINOR (improvement) |
| **Issue** | What's wrong - specific, referencing actual code |
| **Evidence** | The code that demonstrates the problem. For test issues: show both the test code and the production code it should be exercising |
| **Suggestion** | How to fix it. Concrete: name the file, the function, what to change. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
| **Confidence** | HIGH / MEDIUM / LOW |

### Report Structure

1. **Summary**: 1-2 sentences. Is this implementation solid, or does it need revision? Be direct.
2. **Scope**: list of files reviewed, plan referenced, base branch compared against
3. **Findings**: ordered by severity (BLOCKING first, then IMPORTANT, then MINOR). Within severity, TEST-QUALITY and CORRECTNESS before other categories.
4. **Verified OK**: brief list of things that were checked and found correct - this builds trust in the review's thoroughness and helps the handler skip re-checking these areas
5. **Questions**: things that couldn't be determined and need clarification

## Rules

- Fewer high-quality findings over many low-quality ones. Every finding that gets classified REJECT_* is noise that wastes time.
- NEVER flag what hasn't been verified against the code AND the plan AND the codebase conventions.
- If unsure, frame as a question, not a finding.
- TEST-QUALITY findings about reimplemented business logic are always BLOCKING severity. There are no exceptions. A test that doesn't exercise production code is not a test.
- The "Verified OK" section is mandatory. If you can't list things you checked, you didn't review thoroughly enough.
- When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
