---
name: fixme-handle-spec-review
description: Validate and triage specification review findings using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the specification and directly referenced context to distinguish real specification defects from false positives. Outputs HANDLER_RESULT routing directives for specification review loops. Never modifies any files.
disable-model-invocation: true
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

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
- The decision log at `<fixme-dir>/decisions.md` if it exists

Do not use branch names, commit messages, old tickets, or surrounding implementation as authority for private specification scope. Read implementation only if the specification explicitly cites it as source material for the behavior being reviewed.

If the packet and an artifact disagree, trust the artifact after verifying it directly. If the packet mentions a user decision that is not in the decision log or current specification, treat that as context to verify, not as a locked decision.

## Classification

- **FIX** - the finding is valid and the needed specification change is unambiguous. The reviewer supplied concrete specification text or only one exact product, API, data, workflow, migration, or testability decision is consistent with the specification.
- **FIX_UNCLEAR** - the finding is valid, but multiple reasonable specification decisions or specification text shapes exist. The issue's validity is not in question; the unresolved part is which behavior or wording to choose.
- **ASK_USER** - the finding might be valid, but classification depends on product intent, scope, priority, ownership, or a decision not captured in the specification or decision log.
- **REJECT_FALSE_POSITIVE** - the finding is factually wrong. The specification already defines exactly one behavior, or the reviewer misread the specification.
- **REJECT_WONT_FIX** - the finding is valid but intentionally out of scope, acceptable for this specification, contradicts a confirmed locked decision without new concrete risk, or would make the specification worse.
- **REJECT_ALREADY_FIXED** - the issue is already addressed by the current specification or by a prior decision recorded in the decision log.

## Severity

Every finding must include a severity. Classification answers whether the finding is real. Severity answers whether it should block the workflow.

`SEVERITY: BLOCKER | MAJOR | MINOR | INFO`

- **BLOCKER** - the specification has multiple valid implementations, a missing required behavior, a contradiction, an unsafe migration path, or an untestable acceptance criterion. The specification cannot proceed to planning until this is resolved.
- **MAJOR** - the specification is implementable but has a meaningful ambiguity, omission, or risk in a primary path that should be resolved before planning continues.
- **MINOR** - a wording, organization, or completeness improvement in a non-blocking path. Worth reporting but does not block planning.
- **INFO** - observation, optional clarification, or reviewer preference. Never blocks.

MINOR and INFO findings never trigger a revision loop by themselves. If a finding is real but nonblocking, classify it as `FIX` with `SEVERITY: MINOR` or `INFO`; the orchestrator reports it as follow-up without consuming specification review cycles.

If the spec reviewer's per-finding verdict uses `BLOCK | FLAG | NOTE`, treat `BLOCK` as `BLOCKER` (or `MAJOR` when implementable with a single dominant interpretation), `FLAG` as `MAJOR` or `MINOR` based on the finding's blast radius, and `NOTE` as `INFO`.

## Softness Routing

Use the shared `fixme-howto-importance` rubric after classification.

Resolve softness with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config softness resolve --workflow <workflow> --phase <phase> --surface spec-review
```

Apply softness after classification and pattern aggregation, before deriving HANDLER_RESULT counts.

Softness applies to FIX and FIX_UNCLEAR only. ASK_USER and REJECT_* items stay visible through their existing paths.

Floor findings from `fixme-howto-importance` are never softness-suppressed. Missing or invalid importance axes are treated as floor-equivalent for this run and must be reported with a warning.

Every classified finding must include one of these `Importance` outputs:

- `Importance: floor / softness <resolved_float> -> survives`
- `Importance: <score> / softness <resolved_float> -> survives`
- `Importance: <score> / softness <resolved_float> -> suppressed`
- `Importance: not-eligible / softness <resolved_float> -> not-eligible`

For every suppressed item, add it to the suppressed ledger using this wording:

`Suppressed at softness=<resolved_float> with importance=<score>, axes={harm_class=..., user_impact=..., fire_rate=..., reversibility=..., confidence=..., fix_risk=...}`

Suppressed items do not contribute to FIX_COUNT, FIX_UNCLEAR_COUNT, ASK_USER_COUNT, BLOCKING_FIX_COUNT, NONBLOCKING_COUNT, or HANDLER_RESULT. They only contribute to SUPPRESSED_COUNT.

## Pre-Classification Gate

For each finding:

1. Read the cited specification text and the surrounding section.
2. If the finding is about an absence, read the nearest section where the behavior should have been defined.
3. Check whether examples, acceptance criteria, or referenced context already resolve the ambiguity.
4. Check the decision log for prior locked decisions.
5. If the finding proposes multiple paths, independently evaluate each path before choosing `FIX` or `FIX_UNCLEAR`.
6. If fixing the finding would require changing product scope, classify `ASK_USER` or `FIX_UNCLEAR`, not `FIX`.

## Output Format

### Per Finding

Use this shape for each finding:

```md
### Finding {n}: {short title}

- **Classification**: FIX | FIX_UNCLEAR | ASK_USER | REJECT_FALSE_POSITIVE | REJECT_WONT_FIX | REJECT_ALREADY_FIXED
- **Severity**: BLOCKER | MAJOR | MINOR | INFO
- **Confidence**: HIGH | MEDIUM | LOW
- **Importance**: Importance: floor / softness <resolved_float> -> survives OR Importance: <score> / softness <resolved_float> -> survives OR Importance: <score> / softness <resolved_float> -> suppressed OR Importance: not-eligible / softness <resolved_float> -> not-eligible
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
BLOCKING_FIX_COUNT: <number>
NONBLOCKING_COUNT: <number>
SUPPRESSED_COUNT: <number>
NEXT_ACTION: DONE | SPEC_REVISION | ASK_USER_BATCH | FOLLOWUP_ONLY
```

- `CLEAN` (0 FIX, 0 FIX_UNCLEAR, 0 ASK_USER): the specification review loop exits and the pipeline advances.
- `HAS_BLOCKING_FIX` (1+ BLOCKER or MAJOR FIX, 0 FIX_UNCLEAR, 0 ASK_USER): the orchestrator loops back to the phase execute skill with the blocking FIX items.
- `HAS_NONBLOCKING_FINDINGS` (only MINOR or INFO FIX items, 0 FIX_UNCLEAR, 0 ASK_USER): the orchestrator reports follow-up items and exits the specification review loop.
- `HAS_ASK_USER` (1+ FIX_UNCLEAR or ASK_USER): the orchestrator batches decision cards to the user, writes answers to the decision log, then re-runs this handler.

Routing consistency is mandatory:

- If `FIX_UNCLEAR_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- If `ASK_USER_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- If `BLOCKING_FIX_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_BLOCKING_FIX` and `NEXT_ACTION` MUST be `SPEC_REVISION`.
- If `BLOCKING_FIX_COUNT = 0` and `NONBLOCKING_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_NONBLOCKING_FINDINGS` and `NEXT_ACTION` MUST be `FOLLOWUP_ONLY`.
- Never output `CLEAN`, `HAS_BLOCKING_FIX`, or `HAS_NONBLOCKING_FINDINGS` while any `FIX_UNCLEAR` item exists.
- `FIX_UNCLEAR` never means no-fix. It means the finding is valid and the user must choose the specification behavior or wording.

If the configured phase has no execute skill capable of revising the specification, do not pretend the handler can fix it. State that the pipeline needs a phase that revises the specification or a user-edited specification before `HAS_BLOCKING_FIX` can be applied safely.

## Rules

- Read the specification before classifying. Do not trust the finding's characterization.
- Every `FIX` must include concrete specification text or exact specification-edit instructions.
- Every `FIX_UNCLEAR` or `ASK_USER` must include a full decision card from `fixme-howto-present-decisions`.
- If the user must decide whether the issue is real, classify `ASK_USER`.
- If the issue is real but the behavior or wording is a choice, classify `FIX_UNCLEAR`.
- If unsure between `FIX` and `REJECT_*`, classify `ASK_USER` unless the specification evidence resolves it.
- Never skip the routing directive.
