---
name: fixme-handle-spec-review
description: Validate and triage specification review findings using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the specification and directly referenced context to distinguish real specification defects from false positives. Outputs HANDLER_RESULT routing directives for specification review loops. Never modifies any files.
disable-model-invocation: true
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixmeDir` from the JSON. Never use a literal `.fixme/` path in any tool.

## User Input Boundary

Handlers do not pause for user input; `fixme-task` presents ASK_USER and FIX_UNCLEAR questions.

When a finding needs user input, include the complete question in the finding's `Question` field and set `HANDLER_RESULT: HAS_ASK_USER`. Do not call AskUserQuestion, do not wait directly, and do not write `<fixme-dir>/decisions.md`.

# Specification Review Feedback

Validate specification review findings against the specification and classify each using the unified finding taxonomy.

This handler enables a review loop for specifications when used in a pipeline phase that has an upstream skill capable of writing or revising the specification. The handler never edits specifications itself; `HAS_BLOCKING_FIX` tells the orchestrator to loop back to that phase's execute skill with the blocking FIX items, while `HAS_NONBLOCKING_FINDINGS` reports MINOR/INFO items as follow-up without consuming a revision cycle.

## Input Resolution

Resolve inputs in this order:

1. **Argument**: if findings, a specification path, or a review context packet are passed, use them
2. **Conversation context**: if findings, specification content, and review context packet are in the current conversation, use them
3. **Fixme context**: if dispatched from a ticket, inspect the ticket folder for an explicitly named specification or requirements document
4. **Ask**: prompt the user for the findings and specification location

Before classifying anything, read all of these:

- The specification review findings
- The review context packet, if provided. Use it for current-run user decisions, all fixes since last review, and source references. It is orientation, not authority.
- The full specification, not just cited sections
- Directly referenced specification/context documents needed to verify a finding
- The merged decision context. Under a task-bound `fixme-task` (a `<task-state-owner>` block is present), obtain it by calling `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task decision list --state <task-state-path> --format markdown` and reading the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly if it exists

Do not use branch names, commit messages, old tickets, or surrounding implementation as authority for private specification scope. Read implementation only if the specification explicitly cites it as source material for the behavior being reviewed.

If the packet and an artifact disagree, trust the artifact after verifying it directly. If the packet mentions a user decision that is not in the decision log or current specification, treat that as context to verify, not as a locked decision.

## Classification

- **FIX** - the finding is valid and the needed specification change is unambiguous. The reviewer supplied concrete specification text or only one exact product, API, data, workflow, migration, or testability decision is consistent with the specification.
- **FIX_UNCLEAR** - the finding is valid, but multiple reasonable specification decisions or specification text shapes exist. The issue's validity is not in question; the unresolved part is which behavior or wording to choose.
- **ASK_USER** - the finding might be valid, but classification depends on product intent, scope, priority, ownership, or a decision not captured in the specification or decision log.
- **REJECT_FALSE_POSITIVE** - the finding is factually wrong. The specification already defines exactly one behavior, or the reviewer misread the specification.
- **REJECT_WONT_FIX** - the finding is valid but intentionally out of scope, acceptable for this specification, contradicts a confirmed locked decision without new concrete risk, or would make the specification worse.
- **REJECT_ALREADY_FIXED** - the issue is already addressed by the current specification or by a prior decision recorded in the decision log.

## Review Claim Verification Gate

Run this gate before classifying any finding as `FIX`, `FIX_UNCLEAR`, or nonblocking follow-up.

A reviewer claim is a hypothesis, not evidence. Treat the reviewer's characterization and suggested specification change as inputs to test against the specification, directly referenced context, docs, and user decisions.

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

Do not classify as `FIX` from local shape alone, such as "payload has X but key omits X", "field name looks duplicated", "branch looks reachable", or "test seems missing." Local shape is a lead, not proof.

For key, ID, dedupe, cache, queue, lock, retry, or refresh findings, the decisive fact is usually the downstream side effect keyed by that value, not the payload shape.

Break the finding into atomic premises before assigning any FIX or revision route. Premises include: the specified behavior, external API/tool semantics when the specification cites them, semantic equivalence or duplication, reachability, support contract, user/system impact, and whether the suggested specification change is safe.

For each essential premise, record Evidence receipts. Each receipt must name the source checked and the observed fact: specification text, referenced context documents, current source when the specification cites it as authority, dependency source/types, installed binary `--help`, rendered config/manifests, official docs for the actual project version, a controlled reproduction, or a recorded user decision.

For duplicate, redundant, or equivalent-parameter claims, prove semantic equivalence before accepting the finding. Identify the exact downstream consumer or specification contract, prove both values feed the same semantic slot, prove no user journey or runtime layer depends on the distinction, and prove the suggested removal or merge would not change behavior. Lexical similarity is not evidence of duplication. Similar names, matching literals, adjacent arguments, or the same IP/port surface are search leads only.

If an essential premise is unverified, contradicted, or only supported by lexical similarity, do not route the item to specification revision. Classify `REJECT_FALSE_POSITIVE` when evidence contradicts the premise. Classify `ASK_USER` when the missing premise depends on private intent or unavailable authority. Classify `FIX_UNCLEAR` only when validity is proven but the specification behavior or wording is ambiguous.

Before a Specification update removes, merges, or renames an argument, config key, protocol flag, service, or generated value, trace the consuming contract and name the verification that would catch a wrong merge. If that proof is missing, do not classify as `FIX`.

For edge-case findings, also assign an edge-case validity classification:

- **FIX_FAIL_FAST** - the reported state is reachable but should not be supported as a normal downstream behavior. The correct specification update is to reject, constrain, parse, type-narrow, or fail earlier so later behavior never depends on the invalid state.
- **ASK_USER_VALIDITY** - the reported state may be reachable, but product/domain/API support is unclear. A human must decide whether this state is supported before any specification behavior or wording is selected.
- **REJECT_IMPOSSIBLE** - the reported state cannot happen because current request shapes, persisted states, workflow transitions, migration rules, or locked decisions already exclude it.
- **REJECT_UNSUPPORTED** - the reported state is explicitly unsupported or out of this specification's scope, and no current specification action is needed.
- **NONE** - not an edge-case validity finding.

## Severity

Every finding must include a severity. Classification answers whether the finding is real. Edge-case validity classification answers whether a reported state should be supported, rejected earlier, rejected as impossible, or escalated for a support decision. Severity answers whether it should block the workflow.

`SEVERITY: BLOCKER | MAJOR | MINOR | INFO`

- **BLOCKER** - the specification has multiple valid implementations, a missing required behavior, a contradiction, an unsafe migration path, or an untestable acceptance criterion. The specification cannot proceed to planning until this is resolved.
- **MAJOR** - the specification is implementable but has a meaningful ambiguity, omission, or risk in a primary path that should be resolved before planning continues.
- **MINOR** - a wording, organization, or completeness improvement in a non-blocking path. Worth reporting but does not block planning.
- **INFO** - observation, optional clarification, or reviewer preference. Never blocks.

MINOR and INFO findings never trigger a revision loop by themselves. If a finding is real but nonblocking, classify it as `FIX` with `SEVERITY: MINOR` or `INFO`; the orchestrator reports it as follow-up without consuming specification review cycles.

If the spec reviewer's per-finding verdict uses `BLOCK | FLAG | NOTE`, treat `BLOCK` as `BLOCKER` (or `MAJOR` when implementable with a single dominant interpretation), `FLAG` as `MAJOR` or `MINOR` based on the finding's blast radius, and `NOTE` as `INFO`.

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

Run this gate before normal classification for every finding about an edge case, missing error handling, null or empty input, invalid input, unsupported product state, rare branch, boundary condition, precondition, negative path, legacy path, partial-failure path, or "this could happen if..." scenario.

Only classify support, unsupported, or impossible when concrete evidence proves that route. If validity is fuzzy, classify ASK_USER_VALIDITY.

Evidence threshold:

1. **Exact state** - identify the specific actor, API input, persisted state, workflow state, migration state, or failure condition being discussed.
2. **Reachability** - prove whether the state is inside the specification's declared user journeys, API inputs, entity states, migrations, background workflows, examples, or acceptance criteria.
3. **Support contract** - prove whether the state is required, unsupported, or out of scope from specification text, examples, requirements, locked decisions, or established product behavior cited by the specification.
4. **Boundary location** - if the state is unsupported but reachable, identify where the specification should reject or constrain it before downstream behavior sees it.

Routing map:

- **Supported and undefined** -> main `Classification: FIX` or `FIX_UNCLEAR`; edge-case validity `NONE`.
- **Unsupported but reachable and not blocked early enough** -> main `Classification: FIX`; edge-case validity `FIX_FAIL_FAST`; `FIX_FAIL_FAST_COUNT` increments and this counts inside `FIX_COUNT`.
- **Validity or support unclear** -> main `Classification: ASK_USER`; edge-case validity `ASK_USER_VALIDITY`; `ASK_USER_VALIDITY_COUNT` increments and this counts inside `ASK_USER_COUNT`.
- **Impossible by construction** -> main `Classification: REJECT_FALSE_POSITIVE`; edge-case validity `REJECT_IMPOSSIBLE`.
- **Unsupported or out of scope with no current-spec action** -> main `Classification: REJECT_WONT_FIX`; edge-case validity `REJECT_UNSUPPORTED`.

For `ASK_USER_VALIDITY`, the Question field must ask whether the reported state should be supported before discussing specification text. Phrase the decision directly: "Should this state be supported?" Include evidence for and against support, then recommend support, fail-fast, reject, or defer based on the evidence.

## Pre-Classification Gate

For each finding:

1. Read the cited specification text and the surrounding section.
2. If the finding is about an absence, read the nearest section where the behavior should have been defined.
3. Check whether examples, acceptance criteria, or referenced context already resolve the ambiguity.
4. Check the merged decision context for prior locked decisions (task-bound: `task decision list --state <task-state-path> --format markdown`, read the `markdown` field; standalone: `<fixme-dir>/decisions.md`).
5. If the finding proposes multiple paths, independently evaluate each path before choosing `FIX` or `FIX_UNCLEAR`.
6. If fixing the finding would require changing product scope, classify `ASK_USER` or `FIX_UNCLEAR`, not `FIX`.

## Output Format

### Per Finding

Use this shape for each finding:

```md
### Finding {n}: {short title}

- **Classification**: FIX | FIX_UNCLEAR | ASK_USER | REJECT_FALSE_POSITIVE | REJECT_WONT_FIX | REJECT_ALREADY_FIXED
- **Validity**: FIX_FAIL_FAST | ASK_USER_VALIDITY | REJECT_IMPOSSIBLE | REJECT_UNSUPPORTED | NONE
- **Severity**: BLOCKER | MAJOR | MINOR | INFO
- **Confidence**: HIGH | MEDIUM | LOW
- **Review route**: Review level: <level>; Level route: blocking-fix | follow-up | decision-needed | dismissed
- **Evidence receipts**: Source -> observed fact for each essential premise. For duplicate/equivalent-parameter claims, include the consumer contract and semantic-equivalence proof
- **Why**: {1-2 sentences grounded in the specification}
- **Specification evidence**: {clickable specification location, or nearest section for absence}
- **Question**: {ASK_USER and FIX_UNCLEAR only; full decision card from fixme-howto-present-decisions}
- **Specification update**: {FIX only; concrete text or exact instruction for the specification revision skill}
- **Risk**: {FIX only; what could go wrong with the specification update}
```

Omit fields that are marked for other classifications.

### Output Ordering

Group related findings that would be addressed by the same specification revision. Order: FIX, then FIX_UNCLEAR, then ASK_USER, then REJECT_*.

### Summary

End with a summary before the routing block:

1. **Verdict**: exact counts for each classification
2. **Overall assessment**: whether the specification can proceed, needs revision, or needs user decisions first
3. **Rejected findings**: one short rationale summary grouped by rejection type

## Decision Presentation Guidelines

The full guidelines are preloaded from `fixme-howto-present-decisions`. Follow them exactly for all ASK_USER and FIX_UNCLEAR Question fields.

Use decision cards with `D1`, `D2`, etc. Do not emit markdown tables. Do not emit free-form questions.

## Routing Directive

End your output with a structured routing block. This is mandatory.

```md
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
NEXT_ACTION: DONE | SPEC_REVISION | ASK_USER_BATCH | FOLLOWUP_ONLY
```

- `CLEAN` (0 FIX, 0 FIX_UNCLEAR, 0 ASK_USER): the specification review loop exits and the pipeline advances.
- `HAS_BLOCKING_FIX` (1+ BLOCKER or MAJOR FIX, 0 FIX_UNCLEAR, 0 ASK_USER): the orchestrator loops back to the phase execute skill with the blocking FIX items.
- `HAS_NONBLOCKING_FINDINGS` (only MINOR or INFO FIX items, 0 FIX_UNCLEAR, 0 ASK_USER): the orchestrator reports follow-up items and exits the specification review loop.
- `HAS_ASK_USER` (1+ FIX_UNCLEAR or ASK_USER): the orchestrator batches decision cards to the user, writes answers to the decision log, then re-runs this handler.

Routing consistency is mandatory:

- If `FIX_UNCLEAR_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- If `ASK_USER_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- `FIX_FAIL_FAST_COUNT` is a subset of `FIX_COUNT`. Every `FIX_FAIL_FAST` item must also be counted in `FIX_COUNT` and routed like a normal blocking or nonblocking fix based on severity.
- `ASK_USER_VALIDITY_COUNT` is a subset of `ASK_USER_COUNT`. Every `ASK_USER_VALIDITY` item must also be counted in `ASK_USER_COUNT` and routed to `ASK_USER_BATCH`.
- `REJECT_IMPOSSIBLE_COUNT` and `REJECT_UNSUPPORTED_COUNT` are dismissed counts. They do not contribute to `FIX_COUNT`, `ASK_USER_COUNT`, blocking counts, or loop routing.
- If `BLOCKING_FIX_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_BLOCKING_FIX` and `NEXT_ACTION` MUST be `SPEC_REVISION`.
- If `BLOCKING_FIX_COUNT = 0` and `NONBLOCKING_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_NONBLOCKING_FINDINGS` and `NEXT_ACTION` MUST be `FOLLOWUP_ONLY`.
- Never output `CLEAN`, `HAS_BLOCKING_FIX`, or `HAS_NONBLOCKING_FINDINGS` while any `FIX_UNCLEAR` item exists.
- `FIX_UNCLEAR` never means no-fix. It means the finding is valid and the user must choose the specification behavior or wording.

If the configured phase has no execute skill capable of revising the specification, do not pretend the handler can fix it. State that the pipeline needs a phase that revises the specification or a user-edited specification before `HAS_BLOCKING_FIX` can be applied safely.

## Rules

- Read the specification before classifying. Do not trust the finding's characterization.
- Do not accept the reviewer's stated premise as truth. Verify the premise first, then classify the finding.
- Every `FIX` must include concrete specification text or exact specification-edit instructions.
- Every `FIX_UNCLEAR` or `ASK_USER` must include a full decision card from `fixme-howto-present-decisions`.
- If the user must decide whether the issue is real, classify `ASK_USER`.
- If the issue is real but the behavior or wording is a choice, classify `FIX_UNCLEAR`.
- If unsure between `FIX` and `REJECT_*`, classify `ASK_USER` unless the specification evidence resolves it.
- Never skip the routing directive.
