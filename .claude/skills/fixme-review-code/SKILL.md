---
name: fixme-review-code
description: Review code produced by executing an implementation plan. Finds real bugs, gaps, test issues, and inconsistencies by reading the plan, the spec, and every changed file. Designed for high signal - findings are grounded in evidence with minimal false positives. Catches reimplemented business logic in tests, missing coverage, wrong assertions, and deviations from the plan.
argument-hint: "<path to plan file> [base-branch]"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

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
3. **Git**: use `git diff` against the base branch to identify all changed files, and find the most recent plan in `<fixme-dir>/plans/`
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

## Foundational Mindset: Do Not Trust

Execution reports describe intent - what the agent said it did. The codebase describes reality - what actually exists. These often differ. Every claim from the execution report, every passing-test assertion, every "implemented as planned" statement is a hypothesis until verified by reading the actual code.

The most dangerous failure mode is code that looks complete but is hollow: files exist but contain stubs, tests exist but do not exercise production code, components are wired but data does not flow through them. Surface-level review catches nothing. Depth-first verification catches everything.

## Verification Dimensions

Use the dimension name as the finding's Category value (e.g., Dimension 3: Stub Detection -> category STUB-DETECTION).

### Dimension 1: Plan Compliance

**Question:** Was every plan step implemented, and are there any unplanned changes?

**Process:**
1. Walk through each plan task and step. For each, find the corresponding change in the codebase (via git diff or file inspection)
2. Check for skipped steps: plan steps with no corresponding code change
3. Check for partial implementations: step was started but not completed (e.g., function created but not all branches implemented)
4. Check for unplanned changes: files modified or created that are not in the plan's File Map
5. For deviations from the plan's approach: check whether the deviation is documented/justified in the execution results

**Red flags:**
- Plan step has no corresponding code change (step was skipped)
- Files in the plan's File Map that were not touched
- Files touched that are not in the plan's File Map (unplanned changes)
- Executor deviated from the plan's approach without documented justification
- Plan specified a particular implementation pattern but the code uses a different one

### Dimension 2: Artifact Verification

**Question:** Do created artifacts pass the 4-level verification check?

For every new file created by the plan, verify at four levels:

**Process:**
1. **Level 1 - Exists:** Does the file exist at the path specified in the plan?
2. **Level 2 - Substantive:** Is the file a real implementation, not a stub? Check for: placeholder returns (`return null`, `return {}`, `return []`), minimal boilerplate with no logic, `// TODO` markers where implementation should be, functions that only log or throw "not implemented"
3. **Level 3 - Wired:** Is the artifact imported/used by other code? Check: is the new module imported somewhere? Is the new route registered? Is the new component rendered by a parent? Is the new function called?
4. **Level 4 - Data flows:** For artifacts that handle dynamic data - does real data actually flow through? Check: does the API route query real data (not return hardcoded values)? Does the component render data from its actual data source (not placeholder text)? Do form handlers send data to actual endpoints?

**Red flags:**
- File exists but contains only boilerplate with no meaningful logic (Level 2 failure)
- File is complete but nothing imports or references it (Level 3 failure)
- Component renders but its data source returns hardcoded empty arrays/objects (Level 4 failure)
- API route exists and is called but returns `Response.json([])` with no database query (Level 4 failure)

### Dimension 3: Stub Detection

**Question:** Are there placeholder implementations masquerading as complete code?

**Process:**
1. Scan all new and modified files for stub patterns (see concrete patterns below)
2. For each match, determine if it is truly a stub or a valid implementation (e.g., `return null` in an error guard is not a stub; `return null` as the entire component render IS a stub)
3. Check that every function body has meaningful logic - not just logging, not just re-throwing, not just returning a default

**Concrete stub patterns to scan for:**
- `return <div>Component</div>` or `return <div>Placeholder</div>` - component that renders only its own name
- `return null` or `return <></>` as the full component return
- `return Response.json([])` or `return Response.json({})` with no preceding data query
- `onClick={() => {}}` or `onChange={() => {}}` - empty event handlers
- `onSubmit={(e) => e.preventDefault()}` with no actual form handling logic
- `console.log('...')` as the only statement in a handler or callback
- `throw new Error('Not implemented')` or `throw new Error('TODO')`
- Functions whose entire body is a single `return` of a hardcoded value

**Red flags:**
- Handler that only calls `preventDefault()` with no submission logic
- API route that returns static data without querying a data source
- Component that accepts props but never reads them
- Callback that logs but takes no action
- Function body that is empty or contains only a comment

### Dimension 4: Test Quality

**Question:** Do tests call production code, or do they reimplement logic and test themselves?

**This is a primary focus area.** Bad tests are worse than no tests - they create false confidence.

**Process:**
1. For each test file, check: does the test import and call the production function/component it claims to test?
2. Check for reimplemented business logic: does the test file contain a function, calculation, mapping, or transformation that duplicates production code instead of importing and calling it?
3. Check assertions: does each assertion verify the intended behavior? Look for: assertions that are always true, assertions on the wrong value, missing assertions after setup
4. Check test coverage: are all plan-specified tests written? Are behavioral changes covered? Are error paths tested?
5. Check test independence: does each test mock only external dependencies, never the code under test?

**Reimplemented logic patterns (always BLOCKING):**
- Test defines its own version of a helper/utility that exists in production
- Test hardcodes a computation result instead of calling the production function
- Test reimplements a state machine, parser, or transformer to "verify" it matches
- Test copies constants, configs, or mappings from production instead of importing them

**Other red flags:**
- Test has setup but no assertions (or only asserts "no error thrown")
- Test asserts implementation details (internal state, private methods, call order) rather than observable behavior
- Test mocks the very function/component it should be testing
- Plan specified a test but no corresponding test exists in the code
- Test passes but does not actually verify what its name claims

### Dimension 5: Silent Failure Scan

**Question:** Do catch blocks, fallbacks, and defaults log enough context to debug failures?

**Process:**
1. Find all `catch` blocks, `.catch()` callbacks, fallback/default values, and error boundaries in changed files
2. For each, check: is there a log statement (or equivalent) that includes what failed, which entity was affected (IDs, keys, paths), and what the fallback was?
3. Check for silent swallowing: `catch(() => defaultValue)` with no logging, `catch(e) {}` with empty body, `catch(e) { return null }` with no log

**Red flags:**
- `catch(() => defaultValue)` with no logging whatsoever
- `catch(e) {}` - empty catch body
- `.catch(() => null)` or `.catch(() => [])` - silent fallback
- Error caught but only the message is logged, not which entity/operation was affected
- `try/catch` that returns a generic error message without logging the original error
- Default values used silently when the data source fails (no indication that degradation occurred)

### Dimension 6: Correctness

**Question:** Are there logic errors, race conditions, null access, or type issues in the implementation?

**Process:**
1. Trace through each changed function's logic with concrete inputs (happy path AND edge cases)
2. Check for: off-by-one errors, wrong comparisons, swapped arguments, missing awaits, unhandled promise rejections
3. Check for null/undefined access paths that are not guarded
4. Check for type issues: wrong types, unsafe casts, type assertions that hide real mismatches
5. Check for state mutations where immutability is expected (or vice versa)

**Red flags:**
- Missing `await` on an async function call where the result is used
- Array index access without bounds checking where the array could be empty
- String comparison where numeric comparison is needed (or vice versa)
- Object spread that silently drops properties due to key collision
- Promise created but never awaited (fire-and-forget without explicit intent)
- Conditional logic with unreachable branches or always-true/always-false conditions
- Missing cleanup of event listeners, subscriptions, or timers in components/hooks
- User input used without sanitization in security-sensitive contexts
- N+1 queries or API calls inside loops
- Unnecessary re-renders (missing memoization where components receive new object/array references on every render)
- Large data structures created on every call where they could be static
- Synchronous blocking operations where async is expected
- Secrets or tokens hardcoded in source code or logged in plaintext
- Missing authentication/authorization checks that the plan specified
- Catch block handles the wrong error class (e.g., catches generic Error when a specific subclass is expected, or rethrows with a different type that loses information)

### Dimension 7: Behavioral Spot-Check

**Question:** Does runnable code actually work when invoked?

**Process:**
1. Identify code that can be verified without running a full application: CLI tools, module exports, test files, build scripts
2. For test files: can the test file be run? Does it produce the expected pass/fail results?
3. For modules: can the module be imported without errors? Does it export the expected functions/types?
4. For CLI tools: does `--help` or basic invocation produce expected output?
5. This dimension is optional - skip with a note if no code is practically spot-checkable in the review context

**Red flags:**
- Test file that cannot run due to import errors or missing dependencies
- Module that throws on import due to circular dependencies or missing re-exports
- Build script that fails because it references a file that was moved or renamed by the plan
- CLI command that crashes on basic invocation

### Dimension 8: Anti-Pattern Scan

**Question:** Are there TODOs, placeholders, hardcoded empties, or console-only handlers in the implementation?

**Process:**
1. Search all new and modified files for: `TODO`, `FIXME`, `XXX`, `HACK`, `PLACEHOLDER`, `not yet implemented`, `coming soon`
2. Search for empty implementations: `return null`, `return {}`, `return []`, `=> {}`, empty function bodies
3. Search for console-only handlers: functions whose entire logic is `console.log(...)` or `console.warn(...)`
4. Search for hardcoded empty data that flows to rendering: `useState([])` that is never populated, props with `={[]}` or `={{}}`
5. For each match, verify it is actually an anti-pattern in context (e.g., `return null` in a conditional guard is fine; `return null` as the entire render is not)

**Red flags:**
- `TODO` or `FIXME` comment in code that the plan claimed to fully implement
- Empty function body (`() => {}`) for an event handler that should have logic
- `return []` or `return {}` where the function should query or compute data
- `console.log` as the only action in a handler (no side effect, no state change, no API call)
- Placeholder text in UI ("Lorem ipsum", "Coming soon", component name as display text)
- `useState([])` or `useState(null)` that is never updated by a fetch/subscription/event
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
| **Category** | PLAN-COMPLIANCE / ARTIFACT-VERIFICATION / STUB-DETECTION / TEST-QUALITY / SILENT-FAILURE-SCAN / CORRECTNESS / BEHAVIORAL-SPOT-CHECK / ANTI-PATTERN-SCAN |
| **Severity** | BLOCKING (broken/wrong behavior) / IMPORTANT (works but with significant issues) / MINOR (improvement) |
| **Issue** | What's wrong - specific, referencing actual code |
| **Evidence** | The code that demonstrates the problem. For test issues: show both the test code and the production code it should be exercising |
| **Suggestion** | How to fix it. Concrete: name the file, the function, what to change. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
| **Confidence** | HIGH / MEDIUM / LOW |

### Report Structure

1. **Summary**: 1-2 sentences. Is this implementation solid, or does it need revision? Be direct.
2. **Scope**: list of files reviewed, plan referenced, base branch compared against
3. **Findings**: ordered by severity (BLOCKING first, then IMPORTANT, then MINOR). Within severity, TEST-QUALITY, STUB-DETECTION, and CORRECTNESS before other categories.
4. **Verified OK**: brief list of things that were checked and found correct - this builds trust in the review's thoroughness and helps the handler skip re-checking these areas
5. **Questions**: things that couldn't be determined and need clarification

## Rules

- Fewer high-quality findings over many low-quality ones. Every finding that gets classified REJECT_* is noise that wastes time.
- NEVER flag what hasn't been verified against the code AND the plan AND the codebase conventions.
- If unsure, frame as a question, not a finding.
- TEST-QUALITY findings about reimplemented business logic are always BLOCKING severity. There are no exceptions. A test that doesn't exercise production code is not a test.
- STUB-DETECTION findings for artifacts that the plan claimed to fully implement are BLOCKING severity. A stub masquerading as a complete implementation is a missed deliverable.
- The "Verified OK" section is mandatory. If you can't list things you checked, you didn't review thoroughly enough.
- When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
