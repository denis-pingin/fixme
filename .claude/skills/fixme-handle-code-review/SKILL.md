---
name: fixme-handle-code-review
description: Validate and triage code review findings from a post-execution review. Classify each finding using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the plan, spec, implementation, and tests to distinguish real issues from false positives caused by misunderstood context, intent, or approach. Designed to eliminate harmful, incorrect, or context-blind feedback before it reaches implementation.
disable-model-invocation: true
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixmeDir` from the JSON. Never use a literal `.fixme/` path in any tool.

## User Input Boundary

Handlers do not pause for user input; `fixme-task` presents ASK_USER and FIX_UNCLEAR questions.

When a finding needs user input, include the complete question in the finding's `Question` field and set `HANDLER_RESULT: HAS_ASK_USER`. Do not call AskUserQuestion, do not wait directly, and do not write `<fixme-dir>/decisions.md`.

# Code Review Feedback

Validate code review findings against the plan, the spec, and the actual implementation. Classify each using the unified finding taxonomy.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if findings, file paths, code map path, or a review context packet are passed as arguments, use them
2. **Conversation context**: if findings, plan, code map, review context packet, and code are in the current conversation, use them
3. **IDE context**: if the user has a file open/selected, use it
4. **Ask**: prompt the user for the findings, plan, and implementation locations

Before classifying anything, read all of these:
- The review findings
- The review context packet, if provided. Use it for current-run user decisions, all fixes since last review, verification summaries, and source references. It is orientation, not authority.
- The implementation plan
- The task code map, if provided or referenced by the plan. Use it to target source reads and avoid rediscovering unrelated neighboring context. It is orientation, not authority.
- The spec/task description (if referenced)
- Every file the findings reference (full file, not just the cited lines)
- The test files the findings reference (full file)
- Neighboring files when the finding is about conventions or patterns and the code map's cited sources are missing, stale, or insufficient
- The merged decision context and the plan's Locked Decisions section. Under a task-bound `fixme-task` (a `<task-state-owner>` block is present), obtain the decision context by calling `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task decision list --state <task-state-path> --format markdown` and reading the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly if it exists. These are settled user choices.

If the packet/code map and an artifact disagree, trust the artifact after verifying it directly. If the packet mentions a user decision that is not in the decision log or current plan, treat that as context to verify, not as a locked decision.

## Classification

- **FIX** - real issue that affects correctness, behavior, security, performance, test quality, or maintainability. Either a single clear fix approach exists, OR one approach clearly dominates all alternatives on merit (grounded in concrete tradeoffs, not editorial labels like "simpler"). Fixing it will improve the implementation without breaking anything or contradicting the plan's intent. If the reviewer presented multiple options, you MUST independently evaluate each before classifying as FIX - see Multi-Option Discipline.
- **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist with genuine tradeoffs, the fix might require changes the finding doesn't account for (e.g. test updates, upstream changes), or no option clearly dominates the others. This is the default classification whenever the reviewer offered 2+ options and your own independent evaluation does not produce a clear winner. The issue's validity is not in question - only the approach.
- **ASK_USER** - the finding might be valid but classification depends on intent, priorities, constraints, or design decisions not captured in the plan, spec, or code. A human decision is needed to determine validity.
- **REJECT_FALSE_POSITIVE** - finding is factually wrong. The code is correct, the reviewer misunderstood the implementation, the API behavior, or the codebase conventions.
- **REJECT_WONT_FIX** - finding is technically valid but implementing it would make things worse, contradicts the plan's approach (which is not demonstrably broken), contradicts a locked decision, or adds regression risk for marginal benefit.
- **REJECT_ALREADY_FIXED** - the issue described is already addressed in the current implementation or was fixed in a prior iteration.

## Review Claim Verification Gate

Run this gate before classifying any finding as `FIX`, `FIX_UNCLEAR`, or `FOLLOWUP`.

A reviewer claim is a hypothesis, not evidence. Treat the reviewer's characterization and suggested fix as inputs to test against the codebase, docs, runtime behavior, and user decisions.

## Fix Classification Proof Gate

Before classifying any review finding as `FIX`, `FIX_UNCLEAR`, or nonblocking follow-up, answer these three questions:

1. **What is the reviewer's core claim?**
   State the claim as one falsifiable sentence, without the reviewer's proposed fix.

2. **What fact would make that claim true or false?**
   Identify the one decisive code/spec/API/runtime fact. Prefer the downstream consumer, side effect, support contract, or intended behavior over the local line the reviewer cited.

3. **Did we verify that fact?**
   Cite the source checked and the observed fact.

Routing rule:

- If the decisive fact proves the claim true -> continue to severity and route-scope classification.
- If the decisive fact proves the claim false -> `REJECT_FALSE_POSITIVE`.
- If the decisive fact is unavailable or depends on product intent -> `ASK_USER`.
- If the claim is true but nonblocking -> classify as follow-up per severity and review level.

Before assigning `ASK_USER` or `FIX_UNCLEAR` to any finding, apply the Decision Eligibility Gate from `fixme-howto-present-decisions`. A finding escalates only when all three gate conditions hold (plurality after constraints, materiality, indeterminacy). If only one outcome survives the hard constraints, or the surviving outcomes are behavior-identical or strictly dominated, classify the finding as `FIX` even under uncertainty, not as a decision. This precondition does not weaken Multi-Option Discipline: once the gate proves a genuine decision exists, Multi-Option Discipline governs how the options are evaluated and presented.

Do not classify as `FIX` from local shape alone, such as "payload has X but key omits X", "field name looks duplicated", "branch looks reachable", or "test seems missing." Local shape is a lead, not proof.

For key, ID, dedupe, cache, queue, lock, retry, or refresh findings, the decisive fact is usually the downstream side effect keyed by that value, not the payload shape.

Break the finding into atomic premises before assigning any FIX or CURRENT_PR_FIX route. Premises include: the current code behavior, external API/tool semantics, semantic equivalence or duplication, reachability, support contract, user/system impact, and whether the suggested change is safe.

For each essential premise, record Evidence receipts. Each receipt must name the source checked and the observed fact: current source or tests, dependency source/types, installed binary `--help`, rendered config/manifests, official docs for the actual project version, a controlled reproduction, or a recorded user decision.

For duplicate, redundant, or equivalent-parameter claims, prove semantic equivalence before accepting the finding. Identify the exact downstream consumer, prove both values feed the same semantic slot, prove no caller or runtime layer depends on the distinction, and prove the suggested removal or merge would not change behavior. Lexical similarity is not evidence of duplication. Similar names, matching literals, adjacent arguments, or the same IP/port surface are search leads only.

If an essential premise is unverified, contradicted, or only supported by lexical similarity, do not route the item to implementation. Classify `REJECT_FALSE_POSITIVE` when evidence contradicts the premise. Classify `ASK_USER` when the missing premise depends on private intent or unavailable authority. Classify `FIX_UNCLEAR` only when validity is proven but the implementation approach is ambiguous.

Before an Approach removes, merges, or renames an argument, config key, protocol flag, service, or generated value, trace the consuming code and name the verification that would catch a wrong merge. If that proof is missing, do not classify as `FIX`.

For edge-case findings, also assign an edge-case validity classification:

- **FIX_FAIL_FAST** - the reported state is reachable but should not be supported downstream. The correct fix is to reject, constrain, parse, type-narrow, or fail earlier so later code never handles the invalid state.
- **ASK_USER_VALIDITY** - the reported state may be reachable, but product/domain/API support is unclear. A human must decide whether this state is supported before any fix approach is selected.
- **REJECT_IMPOSSIBLE** - the reported state cannot happen because current types, schemas, caller guards, state-machine transitions, plan constraints, or implementation guards already exclude it.
- **REJECT_UNSUPPORTED** - the reported state is reachable but explicitly unsupported or out of this task's scope, and the implementation already preserves the correct boundary behavior or no current-task action is needed.
- **NONE** - not an edge-case validity finding.

## Severity and Route Scope

Every finding must include both severity and route scope. Classification answers whether the finding is real. Edge-case validity classification answers whether a reported state should be supported, rejected earlier, rejected as impossible, or escalated for a support decision. Severity answers whether it should block the workflow. Route scope answers which producer must handle it.

`SEVERITY: BLOCKER | MAJOR | MINOR | INFO`

- **BLOCKER** - the implementation is wrong, incomplete, unsafe, unverifiable, silently failing, missing required tests, or introduces duplication/complexity that must not ship.
- **MAJOR** - the implementation works on the happy path but has significant maintainability, performance, test-quality, or regression risk that should be fixed before completion.
- **MINOR** - improvement opportunity, cleanup, naming, small maintainability issue, or localized duplication with low blast radius. It is worth reporting but does not block completion.
- **INFO** - observation, context note, optional improvement, or reviewer preference. It never blocks.

`ROUTE_SCOPE: PLAN_REQUIRED | IMPLEMENT_ONLY | FOLLOWUP | NONE`

- **PLAN_REQUIRED** - the plan, specification interpretation, task scope, architecture, or locked decision must change before a correct implementation can be produced.
- **IMPLEMENT_ONLY** - the plan is still correct and the executor can repair the implementation directly against the current plan.
- **FOLLOWUP** - real but nonblocking work that should be reported or optionally bundled, not looped.
- **NONE** - no workflow action is needed because the finding was rejected or already addressed.

MINOR and INFO findings never trigger a revision loop by themselves. Most valid code review fixes should be `IMPLEMENT_ONLY`; use `PLAN_REQUIRED` only when the implementation exposes a plan-level defect, ambiguous scope, or architecture problem that the executor should not decide alone.

### Effect Lifecycle Contract Routing

For findings about stateful effects, critical invariants, retries, durable markers, generated artifacts, state transitions, public visibility, deletion, acknowledgement, or irreversible workflow advancement, classify the root cause before assigning route scope:

- If the specification or source task spec omitted the lifecycle contract, classify route scope as `PLAN_REQUIRED` and the approach must require specification or plan revision before implementation.
- If the specification defined the lifecycle contract but the plan omitted or weakened it, classify route scope as `PLAN_REQUIRED` and the approach must revise the plan.
- If the plan defined the lifecycle contract but the implementation omitted or bypassed it, classify route scope as `IMPLEMENT_ONLY`.
- If one finding contains mixed root causes, split it into separate classified items. Do not collapse a spec omission, plan omission, and implementation omission into one repair.

Use this routing before ordinary "can the executor fix it?" reasoning. An executor can repair missed implementation details, but must not invent missing lifecycle contracts.

## Review level Routing

Use the shared `fixme-howto-importance` rubric after classification.

Resolve review level with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --workflow <workflow> --phase <phase>
```

Apply review level after classification and pattern aggregation, before deriving HANDLER_RESULT counts.

Review level applies to FIX and FIX_UNCLEAR only. ASK_USER and REJECT_* items stay visible through their existing paths.

Missing or invalid review assessment dimensions route to `decision-needed` for this run and must be reported with a warning. Use warning text like `WARNING: Missing review assessment dimensions: confidence`.

Every classified finding must include:

- `Review level: <level>`
- `Review assessment: reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>`
- `Level route: blocking-fix | follow-up | decision-needed | dismissed`
- `Route scope: PLAN_REQUIRED | IMPLEMENT_ONLY | FOLLOWUP | NONE`

Items with `Level route: follow-up` contribute to NONBLOCKING_COUNT. Items with `Level route: dismissed` contribute only to DISMISSED_COUNT.

## Edge-Case Validity Gate

Run this gate before normal classification for every finding about an edge case, missing error handling, null or empty input, invalid input, unsupported product state, rare branch, boundary condition, precondition, or "this could happen if..." scenario.

Only classify support, unsupported, or impossible when concrete evidence proves that route. If validity is fuzzy, classify ASK_USER_VALIDITY.

Evidence threshold:

1. **Exact state** - identify the specific values, input shape, entity state, caller behavior, timing condition, or implementation precondition being discussed.
2. **Reachability** - prove whether the state can happen from changed code, plan steps, specs, tests, schemas, API contracts, caller guards, or state-machine transitions.
3. **Support contract** - prove whether the state is required, unsupported, or out of scope from user journeys, requirements, locked decisions, documented API contracts, existing tests, or established product behavior.
4. **Boundary location** - if the state is unsupported but reachable, identify where it should be rejected or constrained before downstream code sees it.

Routing map:

- **Supported and unhandled** -> main `Classification: FIX` or `FIX_UNCLEAR`; edge-case validity `NONE`.
- **Unsupported but reachable and not blocked early enough** -> main `Classification: FIX`; edge-case validity `FIX_FAIL_FAST`; `FIX_FAIL_FAST_COUNT` increments and this counts inside `FIX_COUNT`.
- **Validity or support unclear** -> main `Classification: ASK_USER`; edge-case validity `ASK_USER_VALIDITY`; `ASK_USER_VALIDITY_COUNT` increments and this counts inside `ASK_USER_COUNT`.
- **Impossible by construction** -> main `Classification: REJECT_FALSE_POSITIVE`; edge-case validity `REJECT_IMPOSSIBLE`.
- **Unsupported or out of scope with no current-task action** -> main `Classification: REJECT_WONT_FIX`; edge-case validity `REJECT_UNSUPPORTED`.

For `ASK_USER_VALIDITY`, the Question field must ask whether the reported state should be supported before discussing implementation. Phrase the decision directly: "Should this state be supported?" Include evidence for and against support, then recommend support, fail-fast, reject, or defer based on the evidence.

## Pre-Classification Gate

For each finding, before classifying:

1. **Read the actual implementation.** Not just the lines the finding cites - the full function, the full file if needed. Context around the cited code often explains why it was written that way.
2. **Read the plan step that produced it.** If the code follows the plan exactly and the reviewer disagrees with the approach, that's a plan-level concern, not a code fix. Classify REJECT_WONT_FIX and note it's a plan design disagreement.
3. **Read the spec/task.** The reviewer may not have understood the original intent. A finding that says "this doesn't handle X" when X is explicitly out of scope is REJECT_FALSE_POSITIVE.
4. **Use the task code map to target source reads.** Re-read cited source ranges before relying on mapped facts. If the map is stale or incomplete, verify directly.
5. **Verify API/framework claims.** If the finding says "this API doesn't work like that" - check the actual dependency version in the project. Reviewers get this wrong frequently.
6. **Check if the finding would break something.** Trace the suggested change through callers, tests, and dependent code. A finding that's locally correct but breaks something downstream is REJECT_WONT_FIX (or if the broader approach is unclear, FIX_UNCLEAR).
7. **Check if "improvement" adds risk.** Refactoring suggestions that touch working code to make it "cleaner" add regression risk for aesthetic benefit. Unless there's a concrete flaw, REJECT_WONT_FIX.
8. **Does this contradict a locked decision?** If yes: does the finding reveal a concrete problem not visible when the decision was made? If so, classify ASK_USER with new evidence. If the finding merely disagrees with the chosen approach, classify REJECT_WONT_FIX. The user already made this call.
9. **Multi-option evaluation.** If the finding's Suggestion presents 2+ plausible fix approaches, you MUST independently evaluate each on concrete tradeoffs (correctness, performance on common vs. rare paths, maintainability, test quality, effort, risk) before classifying. Never anchor on editorial shortcuts ("simpler", "easier", "cleaner", "lighter touch", "just X") - an option that is "simpler" in line count but slower on the common code path is not simpler in the dimension that matters. See Multi-Option Discipline below for the full decision tree.

## Common False Positive Patterns

These frequently produce REJECT_FALSE_POSITIVE or REJECT_WONT_FIX findings. Be especially skeptical:

- **"Missing error handling"** for paths that are structurally impossible given the caller or the types
- **"Should use X instead of Y"** when Y is the established pattern in this codebase
- **"Performance concern"** without evidence of actual impact (bounded lists, one-time operations, cold paths)
- **"Missing test for X"** when X is out of the plan's scope
- **"Inconsistent with best practice"** when the codebase consistently does it differently
- **"This could be simplified"** when the "simpler" version loses readability or explicitness
- **Test findings based on misreading the production code** - the reviewer didn't understand what the function does, so they think the test is wrong

## Code-Review-Specific Considerations

Unlike plan review findings, code review findings interact with running software. Additional checks:

- **Would the fix pass the existing tests?** If the fix would break passing tests, it's either wrong or requires test updates too. If the finding doesn't account for this, it's incomplete - classify ASK_USER, FIX_UNCLEAR, or REJECT_WONT_FIX.
- **Does the fix match the plan's architecture?** A finding that pushes toward a different architecture than the plan specified is a plan disagreement, REJECT_WONT_FIX (plan design disagreement).
- **Is the test finding about test quality or about production code?** A finding saying "this test reimplements business logic" is about the test. A finding saying "this function has a bug" is about production code. Don't conflate them - they have different fix approaches.
- **Would reverting to make the reviewer happy reintroduce the bug/gap the plan was fixing?** If yes, REJECT_WONT_FIX.

## Multi-Option Discipline

When a finding's Suggestion presents 2+ plausible fix approaches (including "drop the fix" or "add a comment" as options), apply this discipline before classifying. This section exists because the default failure mode is to anchor on whichever option the reviewer labeled "simpler" and collapse the decision without evaluation.

1. **Independently evaluate every option.** For each, assess concrete tradeoffs: correctness, performance on common vs. rare code paths, maintainability, user-visible behavior, security, test quality, effort, risk. Read the referenced code yourself. Do not outsource this evaluation to the reviewer - the reviewer's preference is a hypothesis, not the answer.

2. **Strike editorial shortcuts from your reasoning.** Words like "simpler", "easier", "cleaner", "lighter touch", "just X" are anchors, not arguments. A "simpler" option that makes every request pay an extra I/O round-trip is not simpler in the dimension that matters. If your justification for picking an option reduces to "the reviewer called it simpler", you have not done the evaluation.

3. **Classify based on the evaluation outcome:**
   - **One option clearly dominates** on the dimensions that matter, with no material downside → **FIX**. The Approach field records that option and cites WHY it wins on the concrete tradeoff, not on editorial language.
   - **Multiple options are viable** with genuine tradeoffs, or no option clearly dominates → **FIX_UNCLEAR**. The Question field presents a full decision card with compact option bullets from `fixme-howto-present-decisions`. Let the user choose. This is the default when your evaluation does not produce a clear winner.
   - **Every option is strictly worse than the status quo** (including "drop the fix" as an option) → **REJECT_WONT_FIX**, with per-option disqualifying flaws listed. "Simpler to not do it" is not a disqualifying flaw.

4. **"Drop the fix" or "just add a comment" is not a free answer.** These resolutions require either proving the original concern was invalid (→ REJECT_FALSE_POSITIVE with evidence) OR proving every alternative is strictly worse than leaving the code alone (→ REJECT_WONT_FIX with a per-option evaluation). Collapsing a multi-option finding into "drop it" because one option was labeled "simpler" is the exact failure mode this section exists to prevent.

5. **Default to FIX_UNCLEAR when uncertain and the outcomes are material.** "Uncertain" here means material and indeterminate after the Decision Eligibility Gate from `fixme-howto-present-decisions`: you have evaluated every option, the surviving options differ observably, and you cannot confidently name a winner from rules and evidence. If the surviving options are behavior-identical or strictly dominated, the gate fails and you classify `FIX`, not `FIX_UNCLEAR`. When a genuine decision survives, the handler's job is to protect the user's ability to choose the best option, not to save them the decision by picking the path of least resistance.

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Finding** | One-line summary of the reviewer's concern |
| **Classification** | FIX / FIX_UNCLEAR / ASK_USER / REJECT_FALSE_POSITIVE / REJECT_WONT_FIX / REJECT_ALREADY_FIXED |
| **Validity** | FIX_FAIL_FAST / ASK_USER_VALIDITY / REJECT_IMPOSSIBLE / REJECT_UNSUPPORTED / NONE |
| **Severity** | BLOCKER / MAJOR / MINOR / INFO |
| **Route Scope** | PLAN_REQUIRED / IMPLEMENT_ONLY / FOLLOWUP / NONE |
| **Confidence** | HIGH / MEDIUM / LOW |
| **Review assessment** | `reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>` |
| **Review level** | `strict | standard | lenient | fast-track | critical` |
| **Level route** | `blocking-fix | follow-up | decision-needed | dismissed` |
Level route: blocking-fix` OR `Level route: blocking-fix` OR `Level route: follow-up` OR `Level route: dismissed` |
| **Evidence receipts** | Source -> observed fact for each essential premise. For duplicate/equivalent-parameter claims, include the consumer contract and semantic-equivalence proof |
| **Why** | 1-2 sentences. For FIX: what's actually wrong and why fixing it improves things. For FIX_UNCLEAR: what's wrong AND what makes the fix approach ambiguous (name the competing approaches). For REJECT_*: why the finding is wrong, irrelevant, or harmful to apply. For ASK_USER: what's unknown and why it matters |
| **Question** | (ASK_USER and FIX_UNCLEAR only) For ASK_USER: a self-contained briefing on whether this is a real issue. For FIX_UNCLEAR: a self-contained briefing presenting the competing fix approaches. See Question Guidelines below |
| **Approach** | (FIX only) Concrete steps to resolve - name files, functions, what to change. Must not break existing passing tests. For FIX_UNCLEAR: omitted (user chooses approach first) |
| **Risk** | (FIX only) What could go wrong with the fix itself |
| **Blast radius** | (FIX only) Which files/tests/behaviors are affected |

### Output Ordering

Group related findings that would be addressed by the same fix. Order: FIX (HIGH confidence first), then FIX_UNCLEAR, then ASK_USER, then REJECT_* items.

### Summary

End with a summary section:
1. **Verdict**: how many FIX / FIX_UNCLEAR / ASK_USER / REJECT_FALSE_POSITIVE / REJECT_WONT_FIX / REJECT_ALREADY_FIXED
2. **Overall assessment**: is the implementation solid with minor issues, or does it need significant rework?
3. **REJECT rationale summary**: 1-2 sentences explaining the common thread behind rejected findings (group by rejection sub-type if the reasons differ)

## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)

**The full guidelines are preloaded from the `fixme-howto-present-decisions` skill.** Follow them exactly for all ASK_USER and FIX_UNCLEAR Question fields.

The shared skill is the only source of decision-card field names, order, and examples. Do not copy older local formats into the Question field.

Operational requirements:

- Use the `ASK_USER` body for validity or scope decisions.
- Use the `FIX_UNCLEAR` body for approach choices.
- Do not use legacy decision-card labels: `The question`, `Changes`, `Upside`, `Downside`, or `Approach/Pros/Cons/Impact/Effort`.
- Every file reference must be a clickable markdown link with absolute path and line numbers.
- Blank line between every section - no dense walls of text.

## Rules

- Read the actual code, plan, AND spec before classifying. A finding classified without full context is likely wrong.
- Do not accept the reviewer's stated premise as truth. Verify the premise first, then classify the finding.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- A finding that contradicts the plan's explicit approach is REJECT_WONT_FIX unless the plan's approach is demonstrably broken in practice (not just "could be better").
- If two findings would be resolved by the same change, group them.
- When in doubt between FIX and REJECT after applying the Decision Eligibility Gate from `fixme-howto-present-decisions` (the validity choice is material and indeterminate), classify ASK_USER. If the issue is clearly valid but the approach is genuinely ambiguous among material survivors, classify FIX_UNCLEAR. A wrong FIX wastes implementation time and can introduce bugs. A wrong REJECT hides a real issue. An unnecessary escalation is also a defect: it costs a cold context reload and erodes the signal of genuine decisions, so do not escalate an item the gate proves is determined.
- The REJECT rationale summary is mandatory. If you can't articulate why findings were rejected, you didn't analyze them carefully enough.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.
- Multi-option findings that pass the Decision Eligibility Gate (material and indeterminate survivors) default to FIX_UNCLEAR. Collapsing multiple alternatives into a single "simpler" FIX approach - or into REJECT_WONT_FIX or "add a comment" - requires an independent evaluation that names concrete tradeoffs, not editorial labels. When the surviving options are behavior-identical or strictly dominated, the gate fails and the correct classification is FIX, not FIX_UNCLEAR. See the Decision Eligibility Gate in `fixme-howto-present-decisions`, Multi-Option Discipline, and Pre-Classification Gate 8.

## Routing Directive

End your output with a structured routing block that tells the orchestrator exactly what to do next. This is mandatory.

```
---
HANDLER_RESULT: CLEAN | HAS_BLOCKING_FIX | HAS_NONBLOCKING_FINDINGS | HAS_ASK_USER
FIX_COUNT: <number>
FIX_UNCLEAR_COUNT: <number>
ASK_USER_COUNT: <number>
FIX_FAIL_FAST_COUNT: <number>
ASK_USER_VALIDITY_COUNT: <number>
REJECT_IMPOSSIBLE_COUNT: <number>
REJECT_UNSUPPORTED_COUNT: <number>
BLOCKING_FIX_COUNT: <number>
NONBLOCKING_COUNT: <number>
DISMISSED_COUNT: <number>
PLAN_REQUIRED_COUNT: <number>
IMPLEMENT_ONLY_COUNT: <number>
NEXT_ACTION: DONE | PLAN_REVISION | IMPLEMENT_REPAIR | ASK_USER_BATCH | FOLLOWUP_ONLY
```

- `CLEAN` (0 FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator outputs Run Summary, pipeline ends
- `HAS_BLOCKING_FIX` (1+ BLOCKER or MAJOR FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator dispatches the route indicated by `NEXT_ACTION`. `IMPLEMENT_ONLY` fixes go to fixme-execute-plan repair mode; `PLAN_REQUIRED` fixes go to plan revision and count against the outer loop.
- `HAS_NONBLOCKING_FINDINGS` (only MINOR or INFO FIX items, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator reports follow-up items and completes without another loop.
- `HAS_ASK_USER` (1+ FIX_UNCLEAR or ASK_USER): orchestrator batches questions to user before routing FIX items. FIX_UNCLEAR questions ask about approach. ASK_USER questions ask about validity.

Routing consistency is mandatory:

- If `FIX_UNCLEAR_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- If `ASK_USER_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- `FIX_FAIL_FAST_COUNT` is a subset of `FIX_COUNT`. Every `FIX_FAIL_FAST` item must also be counted in `FIX_COUNT` and routed like a normal blocking or nonblocking fix based on severity.
- `ASK_USER_VALIDITY_COUNT` is a subset of `ASK_USER_COUNT`. Every `ASK_USER_VALIDITY` item must also be counted in `ASK_USER_COUNT` and routed to `ASK_USER_BATCH`.
- `REJECT_IMPOSSIBLE_COUNT` and `REJECT_UNSUPPORTED_COUNT` are dismissed counts. They do not contribute to `FIX_COUNT`, `ASK_USER_COUNT`, blocking counts, or loop routing.
- If `BLOCKING_FIX_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_BLOCKING_FIX`.
- If `BLOCKING_FIX_COUNT = 0` and `NONBLOCKING_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_NONBLOCKING_FINDINGS` and `NEXT_ACTION` MUST be `FOLLOWUP_ONLY`.
- If `PLAN_REQUIRED_COUNT > 0`, `NEXT_ACTION` MUST be `PLAN_REVISION`.
- If `IMPLEMENT_ONLY_COUNT > 0` and `PLAN_REQUIRED_COUNT = 0`, `NEXT_ACTION` MUST be `IMPLEMENT_REPAIR`.
- Never output `CLEAN`, `HAS_BLOCKING_FIX`, or `HAS_NONBLOCKING_FINDINGS` while any `FIX_UNCLEAR` item exists.
- `FIX_UNCLEAR` never means no-fix. It means the finding is valid and the user must choose the approach.
