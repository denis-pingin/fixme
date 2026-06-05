---
name: fixme-review-code
description: Review code produced by executing an implementation plan. Finds real bugs, gaps, test issues, and inconsistencies by reading the plan, the spec, and every changed file. Designed for high signal - findings are grounded in evidence with minimal false positives. Catches reimplemented business logic in tests, missing coverage, wrong assertions, and deviations from the plan.
argument-hint: "<path to plan file> [base-branch]"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Review Code

Review the code produced by plan execution. Find everything that's actually wrong. Flag nothing that isn't.

## Hard Constraints

- **NO code modifications.** This is a review. The only output is the report.
- **Read everything before writing anything.** The plan, the spec/task, every changed file, every new test, every modified test. Partial reads produce false findings.
- **Every finding must cite evidence.** No "this seems wrong" - show what's wrong and where.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if file paths are passed (plan, code map, spec, diff/branch, review context packet), use them
2. **Conversation context**: if the plan, code map, execution summary, and review context packet are in the current conversation, use them
3. **Git**: use `git diff` against the base branch to identify all changed files, and find the most recent plan in `<fixme-dir>/plans/`
4. **Ask**: prompt the user for plan location and how to identify the changes

Read all of these before writing the report:
- The review context packet, if provided. Use it for current-run decisions, prior fixes, verification summaries, and source references. It is orientation, not authority.
- The implementation plan
- The task code map, if provided or referenced by the plan. Use it to target source reads and avoid rediscovering unrelated neighboring context. It is orientation, not authority.
- The spec/task description (if referenced in the plan)
- Every file created or modified (full file, not just the diff - context matters)
- Every test file created or modified (full file)
- The original files before changes (via git) when needed to understand what changed

## Pre-Review: Build Context

Before evaluating anything, understand:

1. **What was the goal?** Read the plan header and spec. What does "done" look like?
2. **What was the approach?** Read the plan's architecture and file map.
3. **What was actually changed?** Read every diff. Map changes back to plan tasks.
4. **What does the task code map already prove?** Read the code map and re-read its cited source ranges before relying on any mapped pattern, API shape, or file role.
5. **What patterns does the codebase use?** Prefer the code map's cited sources for task-relevant conventions. Read additional neighboring files only when the map is missing, stale, or insufficient for the specific review question.
6. **What stable context and critical invariants does the plan provide?** Read the plan's `## Context` section. Stable Context provides architecture, patterns, conventions, and dependency information discovered during planning. Critical Invariants are mandatory correctness conditions. Use this as a head start - no need to re-explore the full codebase for this information. Re-read changed files directly for current state.
7. **Does the spec/task contain critical invariants the plan omitted?** Look for money movement, external side effects, irreversible state transitions, idempotency, retries, access control, data deletion, public reveal, notifications, webhooks, queues, and provider APIs. Review those invariants even if the plan failed to list them.
8. **What happened since the last review?** Use the review context packet's `Fixes Since Last Review`, `User Decisions For This Run`, `Verification Since Last Review`, and repair context sections to orient the review. Verify all claims against the files and git diff before relying on them.

`Fixes Since Last Review` and repair context never limit review scope. Code review always covers the full changed surface.

This prevents the most common source of false findings: reviewing code without understanding why it was written that way.

## Post-Repair Full Review

Post-repair review is used after `fixme-execute-plan` repair mode handles implementation-only code review findings.

Post-repair review starts with the repair items, then reviews the full changed surface. Start with:

1. The repair items from the previous handler.
2. Files changed by the repair.
3. Tests changed or added by the repair.
4. Callers, imports, generated outputs, and configuration touched by the repaired code.
5. Verification results since the repair.

Then review every file created or modified, every test created or modified, the plan/spec alignment, the task code map, and the full git diff.

Repair context is an ordering hint, not a scope limiter. A clean post-repair review certifies the full changed surface, not only the repaired lines.

Every finding still needs evidence, severity, and a concrete suggestion.

## Foundational Mindset: Do Not Trust

Execution reports describe intent - what the agent said it did. The codebase describes reality - what actually exists. These often differ. Every claim from the execution report, every passing-test assertion, every "implemented as planned" statement is a hypothesis until verified by reading the actual code.

The most dangerous failure mode is code that looks complete but is hollow: files exist but contain stubs, tests exist but do not exercise production code, components are wired but data does not flow through them. Surface-level review catches nothing. Depth-first verification catches everything.

## Foundational Principle: DRY and Simplicity (FIRST PRINCIPLE)

**DRY and simplicity are the first principles of this review.** Before checking correctness, before checking tests, before scanning for stubs, ask the question that comes before all the others: is this code as simple as it can be, and does it avoid repeating logic that already exists or that the patch introduces alongside itself?

Behavior-correct code that should not exist is still wrong. Two pieces of code that do the same thing are one bug waiting to diverge - the next change will edit one and forget the other, and a subtle inconsistency will ship. Every duplicate doubles maintenance cost. Every needless layer of indirection raises reading cost without raising value. Every name that claims a distinction its body does not implement seeds a fake domain that downstream code will attach to.

Plan-driven execution is biased toward producing more code than is needed. The executor mechanically adds whatever named entity the plan asks for, even when an existing entity already does the job, even when a sibling entity it is creating in the same patch already does the job. Type checks pass. Tests pass. Behavior is unchanged. Behavior-focused review will not catch this - identical logic does not change runtime behavior - so the reviewer must explicitly look for it. The reviewer is the only line of defense against duplication and unjustified complexity.

The duplication this principle covers is not limited to byte-identical functions. It includes:

- **Identical bodies under different names** - two helpers/predicates/types/constants that do the same thing
- **Near-identical bodies** - two pieces of code that differ only in a literal, a parameter, or a trivial transformation
- **Pattern-level repetition** - the same algorithm or transformation spelled out in multiple places
- **Repeated expressions** - the same expression evaluated three times instead of stored in a variable once
- **Repeated literals** - the same string/path/key/tag scattered across call sites instead of centralized
- **Unjustified wrappers** - a function that adds no behavior over the function it wraps
- **Single-call helpers** - a helper called from exactly one place where inlining would be clearer
- **Type/alias renames** - an alias that renames an existing type without adding meaning
- **Speculative split** - two names introduced for "future divergence" with no divergence in the bodies today

The question is never "could these legitimately diverge later?" - it is "do they differ today in behavior, contract, or documented semantics?" Speculative future divergence is not a license to ship duplication. A verified present-day semantic distinction is.

## Semantic Equivalence Gate for Duplication Findings

Do not report duplicate, redundant, or equivalent parameters until semantic equivalence is proven. This gate applies to CLI flags, Helm values, environment variables, config keys, service ports, protocol selectors, API arguments, type aliases, constants, and any other values where two names or literals look like they might represent the same thing.

Two values that look similar may encode different protocol versions, transports, network roles, runtime layers, or consumer contracts. A numeric suffix, matching literal, similar name, adjacent declaration, or shared destination file is a search lead, not proof.

Before emitting any DRY-AND-SIMPLICITY finding that proposes removing, merging, renaming, or parameterizing one value into another, prove all of these:

1. **Same consumer contract** - identify the exact downstream parser, binary, API, chart template, generated manifest, or runtime code that consumes both values.
2. **Same semantic slot** - prove both values feed the same meaning in that consumer, not separate meanings such as protocol version, verbosity level, transport, endpoint role, tenant, environment, or discovery mode.
3. **Same runtime effect** - verify from local source/types, installed binary `--help`, official docs for the project version, rendered config, or a controlled reproduction that removing one value does not change behavior.
4. **No distinct caller obligation** - trace call sites and deployment wiring to prove no caller, service, or operator depends on the distinction.
5. **Safe suggested change** - if the suggestion removes or merges a value, state which tests, renders, or runtime probes would catch a wrong merge.

Evidence receipts are mandatory for this gate. Each receipt names the source checked and the observed fact, for example: `binary --help: -v5 selects discovery v5`, `chart render: --verbosity=5 is passed to log level`, or `source: both flags map to the same parser field`.

Lexical similarity is not evidence of duplication. If semantic equivalence is not proven, do not emit a finding. If a distinction is unclear but the risk looks real, put it in Questions instead of recommending a fix.

**Dimension 9: DRY and Simplicity** operationalizes this principle. Despite its position in the list, it is checked first - the Findings ordering rule places `DRY-AND-SIMPLICITY` ahead of every other category, and the Rules section makes its findings BLOCKER by default.

## Verification Dimensions

Use the dimension name as the finding's Category value (e.g., Dimension 3: Stub Detection -> category STUB-DETECTION).

### Dimension 0: Critical Invariant Trace

**Question:** Are every critical invariant and every external side-effect contract enforced on the live production path, with a behavioral test that would fail if omitted?

This runs before ordinary plan compliance. A plan step can be "implemented" textually while still failing the invariant. Example failure shape: code computes and stores a safety marker but the live path never consumes it.

**Process:**
1. List critical invariants from the plan's `### Critical Invariants` section, the spec/task, and changed code that touches money movement, external side effects, irreversible state transitions, idempotency, retries, access control, data deletion, public reveal, notifications, webhooks, queues, or provider APIs.
2. For each invariant, trace the live production path from entrypoint to side effect or state transition. Do not stop at helper definitions, schema fields, or stored metadata.
3. Verify the enforcement point named by the plan actually exists on that path: outbound request field, provider/API method, guard, reconcile lookup, durable identifier write, confirmation check, database constraint, or state transition.
4. Verify the ordering. For irreversible transitions, the external confirmation or durable proof must happen before the terminal state, public reveal, unlock, delete, publish, or acknowledgement.
5. Verify retries. A retry must consult durable state and provider/source-of-truth identifiers before repeating an external side effect.
6. Verify tests. The test must execute the production entrypoint or a public seam that includes the side-effect decision, and it must assert the observable contract. Tests that only assert helper output or source shape are insufficient.

**Red flags:**
- A required safety value, marker, status, artifact, or durable record is computed or stored but not consumed by the live path.
- Reconcile-before-repeat is described in the plan but retry logic can repeat work from `pending`, `submitted`, `processing`, or unknown state without querying durable evidence or the source of truth.
- Code marks work complete, releases locks, deletes data, publishes, reveals, acknowledges, or advances a terminal state before the source of truth proves the effect.
- A status enum or attempt row exists, but the live retry path does not branch on it.
- A helper implements the invariant, but the scheduled action, handler, mutation, job, or public API path never calls it.
- A behavioral test asserts a wrapper/helper was called but not that the live path consumes required fields or advances state only after proof.
- A mock is configured to succeed in a way that skips the failure, retry, replay, or proof behavior the invariant is supposed to protect.

**Severity:** BLOCKER when failure can duplicate, lose, reveal, delete, publish, charge, pay, or authorize incorrectly; otherwise MAJOR.

### Dimension 0A: Effect Lifecycle Contract Trace

**Question:** Are every stateful effect and every Effect Lifecycle Contract enforced on the live production path, with a behavioral test that would fail if omitted?

A stateful effect is any operation where correctness depends on more than local code returning a value: state transition, retry, job, queue, webhook, cache invalidation, external API, durable write, generated artifact, public visibility, deletion, authorization, notification, deployment action, or similar observable behavior.

**Process:**
1. List stateful effects from the plan, specification, review context, and changed code.
2. For each effect, trace the live production path from entrypoint to effect crossing point. Do not stop at helper definitions, schema fields, generated artifacts, stored metadata, or execution-report claims.
3. Verify state meanings against proof. A status, flag, phase, marker, or derived state must not be set before the source of truth and durable evidence justify the name.
4. Verify every generated key, marker, status, artifact, or record is consumed by the production path that makes the behavior safe.
5. Verify repeat behavior: duplicate execution, retry, interruption, races, and partial prior state must read durable evidence before repeating or advancing work.
6. Verify the advancement gate runs before public visibility, deletion, acknowledgement, unlock, commit, publish, terminal state, or irreversible transition.
7. Verify the test executes the production entrypoint or public seam and would fail if the lifecycle contract were omitted or bypassed.

**Red flags:**
- A marker, key, status, artifact, durable record, generated file, or queue item is created but the live path never consumes it.
- A status name is stronger than the evidence used before setting it.
- A helper implements the lifecycle contract but the scheduled action, handler, mutation, job, component action, or public API never calls it.
- Retry or replay can repeat work without first reading durable evidence from prior attempts.
- The implementation advances public, terminal, destructive, or acknowledgement state before its source of truth proves the effect.
- A test asserts source shape, helper output, artifact existence, or mock calls without proving production behavior.

**Severity:** BLOCKER when failure can duplicate, lose, reveal, delete, publish, charge, pay, authorize, corrupt durable state, or make workflow state untrustworthy; otherwise MAJOR.

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

**Reimplemented logic patterns (always BLOCKER):**
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

### Dimension 9: DRY and Simplicity

**Question:** Does the patch avoid duplication and unjustified complexity? Is every newly-introduced named entity (function, helper, predicate, type, constant) actually doing something no existing or sibling entity already does?

**This is checked first, not last.** Despite being numbered last for backwards compatibility, every review starts here. See the Foundational Principle section above. Behavior-correct code that should not exist is still wrong - identical logic does not change runtime behavior, so test runs and behavioral spot-checks will not flag it. Only this dimension catches it.

**Why plan-driven execution produces this defect:** when a plan says "make the distinction explicit", "introduce named predicates", "extract a helper", or "split this for clarity", the executor often satisfies the literal wording by mechanically adding a second name with a body that is identical (or trivially equivalent) to an existing one. Type checks pass. Tests pass. Behavior is unchanged. The codebase now has two names for one rule, and downstream callers will treat them as two distinct domains. The reviewer must catch this before it ships, because once the duplicate has callers, the fix is more expensive every week.

**Process:**

1. **Enumerate every new named entity in the patch.** List every new function, helper, predicate, hook, type, interface, type alias, enum, module-level constant, component, and significant variable. Skip pure renames (a single name changed across the file with no new entity introduced).

2. **For each new entity, find the closest sibling that could already do the job.** Look in this order: same file, adjacent files in the same module, files imported by the same callers, shared utility/helper modules. A "sibling" is any existing entity with overlapping shape and purpose - same parameter list (modulo renames), same return type, same general role.

3. **Compare for equivalence at three levels:**
   - **Byte-identical:** same parameters (modulo renames), same body, same return - the obvious case
   - **Behaviorally identical:** different syntax, same outcome for every input - still a duplicate
   - **Pattern-identical:** same algorithm/transformation spelled out in two places, possibly with different literals - structural duplication that should be parameterized or extracted

4. **Scan the patch for repetition introduced inside a single change:**
   - Same expression evaluated multiple times instead of stored in a variable
   - Same block of code copy-pasted across two branches/files
   - Same conditional/guard repeated at multiple call sites instead of pushed into the callee
   - Long if-chains that should be a lookup table or polymorphism
   - Multiple cases in a switch that resolve to the same expression
   - Test fixtures with identical fields and different variable names introduced in the same patch
   - Repeated string keys, paths, IDs, or tags across call sites that should be a constant

5. **Check for unjustified complexity:**
   - A new wrapper that adds no behavior over the function it wraps
   - A new layer of indirection that does not encode a real abstraction
   - A type/alias that simply renames an existing type without adding meaning
   - A helper called from exactly one place where inlining would be clearer
   - An options/config object that holds a single field
   - A flag parameter that never gets passed `false` (or never `true`)

6. **Apply the name-vs-body test for every pair of new entities introduced together.** When a patch adds a named entity beside an existing or sibling entity, ask:
   - Does the *name* claim a domain distinction? (e.g., specialization, scope, variant, suffix like `ForCircle`, `ForUser`, `Strict`, `Async`)
   - Does the *body* implement that distinction? (does one apply a filter, condition, transformation, or rule the other does not?)
   - If the name claims a distinction the body does not implement, the duplicate is real - flag it.

   Speculative future divergence is not a justification. "These will diverge later" means flag now and split when the divergence actually arrives, not before.

**Concrete patterns to scan for:**

- Two new functions/predicates in the same file with byte-equivalent bodies and different names (e.g. `isVisibleX` and `isVisibleXForCircle` both returning `a !== null && a.deletedAt === undefined && a.state !== 'archived'`)
- A new function whose body matches an existing function line-for-line modulo parameter rename
- Two new types/interfaces with identical members and different names
- Constants holding the same literal value with different names
- A "specialized" wrapper that just delegates to the generic version with no added logic
- The same expression evaluated three times in a row instead of stored once
- A copy-pasted code block in two branches of an if/else where the branch could be lifted out
- A test that sets up identical fixtures twice instead of using a shared helper
- A new helper that re-implements a utility that already exists in the project's shared modules
- A new file whose contents could be replaced by importing an existing module
- A computation written inline in three call sites that should be a single function

**Red flags:**

- Adjacent declarations that share the same return expression
- Type aliases resolving to the same type with no documented domain difference
- A new file whose contents could be replaced by importing an existing module
- Helpers introduced "for clarity" that are called only once and obscure rather than clarify
- Repeated literal values across multiple call sites that should be a constant
- Repeated string keys, paths, IDs, or tags that should be centralized
- A wrapper function that calls one underlying function and does nothing else

**Verification before flagging:**

For each suspected duplicate, line up the two pieces of code side-by-side. Normalize whitespace, parameter names, comments, and formatting. If the remaining content is the same expression/algorithm, the duplicate is real. Do not accept "they are conceptually different" as justification when the bodies are identical. Do not accept "these will diverge later" as justification - flag the duplicate now, split when divergence arrives.

**Possible fixes (the finding's Suggestion must list these as Multi-Option when more than one applies):**

1. **Collapse:** delete the duplicate, reuse the existing name at all call sites. Best when the names were never meant to encode distinct rules.
2. **Rename and merge:** keep one entity, rename it to express what it actually does. Best when one of the names is misleading.
3. **Extract:** pull the repeated block into a shared helper called from both sites. Best when the same logic is genuinely needed in multiple places.
4. **Parameterize:** if the only difference is a literal or flag, accept it as an argument instead of duplicating the function.
5. **Inline:** if a wrapper or helper adds no value, remove it and inline its body at the single call site.
6. **Implement the missing distinction:** if the names *should* encode distinct rules, the body of one of them is wrong - flag the missing rule explicitly so the executor fills it in.

The Suggestion must classify which case applies based on the plan's intent. When more than one fix is plausible, present them per Multi-Option Suggestions.

**Severity:** BLOCKER by default. A duplicate or unjustified complexity introduced by the patch must be fixed before merge - once it has callers, the fix becomes more expensive. The only exception is a MINOR severity for a duplication that is clearly localized, has zero callers outside the patch, and the plan explicitly anticipated would be cleaned up later.

## Two-Pass Review Process

**The review is a two-pass process. Do not emit findings as you discover them.**

## Review assessment

Use the shared `fixme-howto-importance` rubric for every finding. Every finding must include:

- `reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>`
- ``
- ``
- ``
- ``
- ``

Assign axes from verified implementation, plan, specification, test, and codebase evidence. Do not assign a numeric assessment route; the handler computes that deterministically from these axes.

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
7. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "cosmetic", or "not blocking", the finding cannot be MAJOR or BLOCKER. Either downgrade to MINOR or INFO, or drop it entirely.

## Edge-Case Validity Gate

Run this gate for any candidate about an edge case, missing error handling, null or empty input, invalid input, unsupported product state, rare branch, boundary condition, precondition, or "this could happen if..." scenario.

Do not promote an edge-case candidate to a finding until you have identified the exact state, the code path that could produce it, and the contract that says whether that state is supported.

Answer these questions in order:

1. **What is the exact reported state?** Name the values, inputs, entity state, caller behavior, or timing condition. Vague labels like "bad input" or "edge case" are insufficient.
2. **Can this state actually happen?** Verify reachability from the changed code, plan, spec, tests, API contracts, schemas, caller guards, or state machine.
3. **Is this state supported behavior?** Look for concrete evidence in user journeys, requirements, existing tests, documented API contracts, locked decisions, or established product behavior.
4. **If unsupported, where should it be excluded?** Prefer a boundary guard, parser, schema, type constraint, caller precondition, or state-machine transition over downstream special-case handling.
5. **If the support contract is unclear, do not guess.** Move it to Questions and frame the decision as: "Should this state be supported?"

Validity outcomes:

- **Supported** - the state is reachable and the product/domain/API contract says it must work. Promote a finding only if the implementation fails to support it.
- **Unsupported but reachable** - the state can happen, but should be rejected or constrained earlier. Promote a finding only when the implementation lacks that boundary behavior; the suggestion must be fail-fast or make-impossible, not broad downstream support.
- **Impossible by construction** - the current types, schema, caller guards, or state machine make the state unreachable. Drop the candidate silently unless the implementation weakens those guarantees.
- **Out of scope** - the state may be meaningful in a different product journey or future phase, but not this task. Do not promote it as a blocking finding.
- **Unclear** - evidence does not prove supported, unsupported, or impossible. Put it in Questions instead of recommending a fix.

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
| **Category** | DRY-AND-SIMPLICITY / PLAN-COMPLIANCE / ARTIFACT-VERIFICATION / STUB-DETECTION / TEST-QUALITY / SILENT-FAILURE-SCAN / CORRECTNESS / BEHAVIORAL-SPOT-CHECK / ANTI-PATTERN-SCAN |
| **Severity** | BLOCKER (broken/wrong behavior or must not ship) / MAJOR (works but with significant issues) / MINOR (nonblocking improvement) / INFO (observation only) |
| **Issue** | What's wrong - specific, referencing actual code |
| **Evidence** | The code that demonstrates the problem. For test issues: show both the test code and the production code it should be exercising |
| **Suggestion** | How to fix it. Concrete: name the file, the function, what to change. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
| **Confidence** | HIGH / MEDIUM / LOW |
| **Review assessment** | `reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>` from `fixme-howto-importance`. Reviewers do not assign handler classification, level route, numeric scores, or suppression. |

### Report Structure

1. **Summary**: 1-2 sentences. Is this implementation solid, or does it need revision? Be direct.
2. **Scope**: list of files reviewed, plan referenced, code map used if provided, base branch compared against, and review context packet used if provided
3. **Findings**: ordered by severity (BLOCKER first, then MAJOR, then MINOR, then INFO). Within severity, **DRY-AND-SIMPLICITY first**, then TEST-QUALITY, STUB-DETECTION, and CORRECTNESS, then other categories.
4. **Verified OK**: brief list of things that were checked and found correct - this builds trust in the review's thoroughness and helps the handler skip re-checking these areas
5. **Questions**: things that couldn't be determined and need clarification

## Rules

- Fewer high-quality findings over many low-quality ones. Every finding that gets classified REJECT_* is noise that wastes time.
- NEVER flag what hasn't been verified against the code AND the plan AND the codebase conventions.
- If unsure, frame as a question, not a finding.
- DRY-AND-SIMPLICITY findings where the patch introduces duplication, unjustified complexity, repeated logic, repeated literals, unjustified wrappers, or two names for one rule are BLOCKER severity. Behavior-correct code that should not exist is still wrong. Identical logic at two sites is one bug waiting to diverge. The only exception is MINOR severity for a duplication that is clearly localized, has zero callers outside the patch, and the plan explicitly anticipated would be cleaned up later. "Tests pass and behavior is unchanged" is never a justification - that is exactly how this defect ships.
- TEST-QUALITY findings about reimplemented business logic are always BLOCKER severity. There are no exceptions. A test that doesn't exercise production code is not a test.
- STUB-DETECTION findings for artifacts that the plan claimed to fully implement are BLOCKER severity. A stub masquerading as a complete implementation is a missed deliverable.
- The "Verified OK" section is mandatory. If you can't list things you checked, you didn't review thoroughly enough.
- When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
