---
name: fixme-handle-plan-review
description: Validate and triage review findings of an implementation plan. Classify each finding using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the actual codebase to verify each finding against reality.
disable-model-invocation: true
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Plan Review Feedback

Validate review findings against the codebase and classify each using the unified finding taxonomy.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if findings, file paths, code map path, or a review context packet are passed as arguments, use them
2. **Conversation context**: if findings, plan, code map, and review context packet are in the current conversation, use them
3. **IDE context**: if the user has a file open/selected, use it
4. **Ask**: prompt the user for the findings and plan locations

Read the plan, findings, task code map if provided or referenced, and spec/context document (if referenced) before proceeding. If a review context packet is provided, read it for current-run user decisions, all fixes since last review, and source references. The code map and packet are orientation, not authority.

If a decision log exists at `<fixme-dir>/decisions.md`, read it. Also read the plan's Locked Decisions section in its Context. These are settled user choices from prior ASK_USER and FIX_UNCLEAR questions.

If the packet/code map and an artifact disagree, trust the artifact after verifying it directly. If the packet mentions a user decision that is not in the decision log or current plan, treat that as context to verify, not as a locked decision.

## Classification

- **FIX** - real issue that affects correctness, performance, security, or maintainability. Either a single clear fix approach exists, OR one approach clearly dominates all alternatives on merit (grounded in concrete tradeoffs, not editorial labels like "simpler"). If the reviewer presented multiple options, you MUST independently evaluate each before classifying as FIX - see Multi-Option Discipline.
- **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist with genuine tradeoffs. This is the default classification whenever the reviewer offered 2+ options and your own independent evaluation does not produce a clear winner on the dimensions that matter (performance on common vs. rare paths, correctness, maintainability, user-visible impact). The issue's validity is not in question - only the approach to resolving it.
- **ASK_USER** - insufficient context to determine whether the finding is even valid. Depends on intent, constraints, or decisions not captured in the plan, spec, or codebase. Requires human input to determine validity (not just approach).
- **REJECT_FALSE_POSITIVE** - finding is factually wrong. The plan is correct, the reviewer misunderstood the plan's approach, the codebase state, or the spec constraints.
- **REJECT_WONT_FIX** - finding is technically valid but intentionally out of scope, contradicts a locked decision (without revealing new concrete problems), or would be net-negative to address.
- **REJECT_ALREADY_FIXED** - the issue described is already addressed by the plan's current state or a prior revision.

## Review Claim Verification Gate

Run this gate before classifying any finding as `FIX`, `FIX_UNCLEAR`, or `FOLLOWUP`.

A reviewer claim is a hypothesis, not evidence. Treat the reviewer's characterization and suggested plan change as inputs to test against the plan, codebase, docs, runtime behavior, and user decisions.

Break the finding into atomic premises before assigning any FIX or revision route. Premises include: the planned behavior, current codebase behavior, external API/tool semantics, semantic equivalence or duplication, reachability, support contract, user/system impact, and whether the suggested change is safe.

For each essential premise, record Evidence receipts. Each receipt must name the source checked and the observed fact: plan text, current source or tests, dependency source/types, installed binary `--help`, rendered config/manifests, official docs for the actual project version, a controlled reproduction, or a recorded user decision.

For duplicate, redundant, or equivalent-parameter claims, prove semantic equivalence before accepting the finding. Identify the exact downstream consumer, prove both values feed the same semantic slot, prove no caller or runtime layer depends on the distinction, and prove the suggested removal or merge would not change behavior. Lexical similarity is not evidence of duplication. Similar names, matching literals, adjacent arguments, or the same IP/port surface are search leads only.

If an essential premise is unverified, contradicted, or only supported by lexical similarity, do not route the item to implementation or plan revision. Classify `REJECT_FALSE_POSITIVE` when evidence contradicts the premise. Classify `ASK_USER` when the missing premise depends on private intent or unavailable authority. Classify `FIX_UNCLEAR` only when validity is proven but the plan revision approach is ambiguous.

Before an Approach removes, merges, or renames an argument, config key, protocol flag, service, or generated value, trace the consuming code and name the verification that would catch a wrong merge. If that proof is missing, do not classify as `FIX`.

For edge-case findings, also assign an edge-case validity classification:

- **FIX_FAIL_FAST** - the reported state is reachable but should not be supported downstream. The correct fix is to reject, constrain, parse, type-narrow, or fail earlier so later code never handles the invalid state.
- **ASK_USER_VALIDITY** - the reported state may be reachable, but product/domain/API support is unclear. A human must decide whether this state is supported before any fix approach is selected.
- **REJECT_IMPOSSIBLE** - the reported state cannot happen because current types, schemas, caller guards, state-machine transitions, or plan constraints already exclude it.
- **REJECT_UNSUPPORTED** - the reported state is reachable but explicitly unsupported or out of this task's scope, and the plan already preserves the correct boundary behavior or no current-task action is needed.
- **NONE** - not an edge-case validity finding.

## Severity and Route Scope

Every finding must include both severity and route scope. Classification answers whether the finding is real. Edge-case validity classification answers whether a reported state should be supported, rejected earlier, rejected as impossible, or escalated for a support decision. Severity answers whether it should block the workflow. Route scope answers which producer must handle it.

`SEVERITY: BLOCKER | MAJOR | MINOR | INFO`

- **BLOCKER** - the plan will fail, produce wrong behavior, miss a required deliverable, break verification, create a security/data-loss risk, or create patch-level duplication that must not ship.
- **MAJOR** - the plan can execute but would produce significant maintainability, performance, test-quality, or correctness risk that should be fixed before implementation continues.
- **MINOR** - improvement opportunity, cleanup, naming, small maintainability issue, or localized duplication with low blast radius. It is worth reporting but does not block execution.
- **INFO** - observation, context note, optional improvement, or reviewer preference. It never blocks.

`ROUTE_SCOPE: PLAN_REQUIRED | IMPLEMENT_ONLY | FOLLOWUP | NONE`

- **PLAN_REQUIRED** - the plan, specification interpretation, task scope, architecture, ordering, or locked decision must change before execution. Plan review `BLOCKER` and `MAJOR` fixes normally use this route.
- **IMPLEMENT_ONLY** - the plan is acceptable, but the later implementation can address the issue directly if it appears during code review. Use rarely in plan review.
- **FOLLOWUP** - real but nonblocking work that should be reported or optionally bundled, not looped.
- **NONE** - no workflow action is needed because the finding was rejected or already addressed.

MINOR and INFO findings never trigger a revision loop by themselves. If a finding is real but nonblocking, classify it as `FIX` with `SEVERITY: MINOR` or `INFO` and `ROUTE_SCOPE: FOLLOWUP`; the orchestrator reports it without consuming plan review cycles.

## Review level Routing

Use the shared `fixme-howto-importance` rubric after classification.

Resolve review level with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --workflow <workflow> --phase <phase>
```

Apply review level after classification and pattern aggregation, before deriving HANDLER_RESULT counts.

Review level applies to FIX and FIX_UNCLEAR only. ASK_USER and REJECT_* items stay visible through their existing paths.

Missing or invalid review assessment dimensions route to `decision-needed` for this run and must be reported with a warning.

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

1. **Exact state** - identify the specific values, input shape, entity state, caller behavior, timing condition, or plan precondition being discussed.
2. **Reachability** - prove whether the state can happen from source code, plan steps, specs, tests, schemas, API contracts, caller guards, or state-machine transitions.
3. **Support contract** - prove whether the state is required, unsupported, or out of scope from user journeys, requirements, locked decisions, documented API contracts, existing tests, or established product behavior.
4. **Boundary location** - if the state is unsupported but reachable, identify where it should be rejected or constrained before downstream code sees it.

Routing map:

- **Supported and unhandled** -> main `Classification: FIX` or `FIX_UNCLEAR`; edge-case validity `NONE`.
- **Unsupported but reachable and not blocked early enough** -> main `Classification: FIX`; edge-case validity `FIX_FAIL_FAST`; `FIX_FAIL_FAST_COUNT` increments and this counts inside `FIX_COUNT`.
- **Validity or support unclear** -> main `Classification: ASK_USER`; edge-case validity `ASK_USER_VALIDITY`; `ASK_USER_VALIDITY_COUNT` increments and this counts inside `ASK_USER_COUNT`.
- **Impossible by construction** -> main `Classification: REJECT_FALSE_POSITIVE`; edge-case validity `REJECT_IMPOSSIBLE`.
- **Unsupported or out of scope with no current-task action** -> main `Classification: REJECT_WONT_FIX`; edge-case validity `REJECT_UNSUPPORTED`.

For `ASK_USER_VALIDITY`, the Question field must ask whether the reported state should be supported before discussing implementation. Phrase the decision directly: "Should this state be supported?" Include evidence for and against support, then recommend support, fail-fast, reject, or defer based on the evidence.

## Process

For each finding:

1. Read the actual code referenced by the finding
2. Verify the finding's characterization of what the code does - do not trust it blindly
3. Check whether the plan's context/spec explains the approach
4. Use the task code map to target source reads, but re-read cited source ranges before relying on mapped facts
5. Check finding against locked decisions. Distinguish between `[confirmed]` decisions (user explicitly chose) and `[assumed]` decisions (user accepted recommendation by default or never explicitly answered):
   - **Finding contradicts a `[confirmed]` decision:**
     - If the finding reveals a concrete problem (bug, security issue, data loss): classify ASK_USER. Explain what new evidence suggests the previous decision may need revisiting, and recommend a path forward.
     - If the finding merely disagrees with the approach: classify REJECT_WONT_FIX. The user explicitly made this call.
   - **Finding contradicts an `[assumed]` decision:**
     - If the finding reveals a concrete problem: classify ASK_USER. The user never explicitly confirmed this decision, and new evidence suggests it's wrong.
     - If the finding offers a materially better alternative: classify ASK_USER. The user accepted this by default - they deserve to see the better option. Present both the assumed approach and the proposed alternative.
     - If the finding is a minor stylistic disagreement: classify REJECT_WONT_FIX.
   - **Finding identifies an `[assumed]` decision that should have been confirmed** (the reviewer flagged it as an Assumption Validity issue): classify ASK_USER. Present the decision and its alternatives to the user for explicit confirmation.
6. Assess whether the suggested change would actually improve the outcome
7. Classify and document

## Multi-Option Discipline

When a finding's Suggestion presents 2+ plausible fix approaches (including "drop the fix" or "add a comment" as options), apply this discipline before classifying. This section exists because the default failure mode is to anchor on whichever option the reviewer labeled "simpler" and collapse the decision without evaluation.

1. **Independently evaluate every option.** For each, assess concrete tradeoffs: correctness, performance on common vs. rare code paths, maintainability, user-visible behavior, security, effort, risk. Read the referenced code yourself. Do not outsource this evaluation to the reviewer - the reviewer's preference is a hypothesis, not the answer.

2. **Strike editorial shortcuts from your reasoning.** Words like "simpler", "easier", "cleaner", "lighter touch", "just X" are anchors, not arguments. A "simpler" option that makes every request pay an extra I/O round-trip is not simpler in the dimension that matters. If your justification for picking an option reduces to "the reviewer called it simpler", you have not done the evaluation.

3. **Classify based on the evaluation outcome:**
   - **One option clearly dominates** on the dimensions that matter, with no material downside → **FIX**. The Approach field records that option and cites WHY it wins on the concrete tradeoff (e.g. "hoist with guard: same performance as inline duplication, and eliminates the overlap duplication"), not on editorial language.
   - **Multiple options are viable** with genuine tradeoffs, or no option clearly dominates → **FIX_UNCLEAR**. The Question field presents a full decision card with compact option bullets from `fixme-howto-present-decisions`. Let the user choose. This is the default when your evaluation does not produce a clear winner.
   - **Every option is strictly worse than the status quo** (including "drop the fix" as an option) → **REJECT_WONT_FIX**, with per-option disqualifying flaws listed. "Simpler to not do it" is not a disqualifying flaw.

4. **"Drop the fix" or "just add a comment" is not a free answer.** These resolutions require either proving the original concern was invalid (→ REJECT_FALSE_POSITIVE with evidence) OR proving every alternative is strictly worse than leaving the code alone (→ REJECT_WONT_FIX with a per-option evaluation). Collapsing a multi-option finding into "drop it" because one option was labeled "simpler" is the exact failure mode this section exists to prevent.

5. **Default to FIX_UNCLEAR when uncertain.** If you have evaluated every option and cannot confidently name a winner, that is FIX_UNCLEAR. The handler's job is to protect the user's ability to choose the best option, not to save them the decision by picking the path of least resistance.

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
| **Why** | 1-2 sentences. For FIX: what breaks or degrades. For FIX_UNCLEAR: what breaks AND what makes the fix approach ambiguous (name the competing approaches). For REJECT_*: why it's wrong, irrelevant, or already covered. For ASK_USER: what's unknown and why it matters |
| **Question** | (ASK_USER and FIX_UNCLEAR only) For ASK_USER: a self-contained briefing on whether this is a real issue. For FIX_UNCLEAR: a self-contained briefing presenting the competing fix approaches. See Question Guidelines below |
| **Approach** | (FIX only) Concrete steps to resolve - name files, functions, patterns. No hand-waving. For FIX_UNCLEAR: omitted (user chooses approach first) |
| **Risk** | (FIX only) What could go wrong with the fix itself |
| **Blast radius** | (FIX only) Which files/tests/behaviors are affected |

### Output Ordering

Group related findings that would be addressed by the same fix. Order: FIX (HIGH confidence first), then FIX_UNCLEAR, then ASK_USER, then REJECT_* items.

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

- Read the actual code before classifying. Don't trust the finding's characterization of what the code does.
- Do not accept the reviewer's stated premise as truth. Verify the premise first, then classify the finding.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- If a finding is ambiguous or context is lacking, classify as ASK_USER rather than guessing. If the finding is clearly valid but the fix approach is unclear, classify as FIX_UNCLEAR. A wrong FIX wastes implementation time. A wrong REJECT hides a real issue. ASK_USER or FIX_UNCLEAR costs only a question.
- If two findings would be resolved by the same change, group them and note it.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.
- Multi-option findings default to FIX_UNCLEAR. Collapsing multiple alternatives into a single "simpler" FIX approach - or into REJECT_WONT_FIX or "add a comment" - requires an independent evaluation that names concrete tradeoffs, not editorial labels. See Multi-Option Discipline.

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

- `CLEAN` (0 FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator exits the plan loop and proceeds to fixme-execute-plan
- `HAS_BLOCKING_FIX` (1+ BLOCKER or MAJOR FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator dispatches the route indicated by `NEXT_ACTION`
- `HAS_NONBLOCKING_FINDINGS` (only MINOR or INFO FIX items, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator reports follow-up items and exits the plan loop
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

## Review Level Routing Contract

Resolve review level with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --workflow <workflow> --phase <phase>
```

Every classified finding includes Classification, Validity, Review assessment, Review level, Level route, Route scope, Why, Question, Approach, and Risk.

Missing or invalid review assessment dimensions produce Classification: ASK_USER, Validity: NONE, Level route: decision-needed, Route scope: NONE, and WARNING: Missing review assessment dimensions: confidence.

DISMISSED_COUNT: <number>

Level route values: blocking-fix | follow-up | decision-needed | dismissed
