---
name: fixme-handle-spec-review
description: Validate and triage specification review findings using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the specification and directly referenced context to distinguish real specification defects from false positives. Outputs HANDLER_RESULT routing directives for specification review loops. Never modifies any files.
disable-model-invocation: true
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Specification Review Feedback

Validate specification review findings against the specification and classify each using the unified finding taxonomy.

This handler enables a review loop for specifications when used in a pipeline phase that has an upstream skill capable of writing or revising the specification. The handler never edits specifications itself; `HAS_FIX` tells the orchestrator to loop back to that phase's execute skill with the FIX items.

## Input Resolution

Resolve inputs in this order:

1. **Argument**: if findings and a specification path are passed, use them
2. **Conversation context**: if findings and specification content are in the current conversation, use them
3. **Fixme context**: if dispatched from a ticket, inspect the ticket folder for an explicitly named specification or requirements document
4. **Ask**: prompt the user for the findings and specification location

Before classifying anything, read all of these:

- The specification review findings
- The full specification, not just cited sections
- Directly referenced specification/context documents needed to verify a finding
- The decision log at `<fixme-dir>/decisions.md` if it exists

Do not use branch names, commit messages, old tickets, or surrounding implementation as authority for private specification scope. Read implementation only if the specification explicitly cites it as source material for the behavior being reviewed.

## Classification

- **FIX** - the finding is valid and the needed specification change is unambiguous. The reviewer supplied concrete specification text or only one exact product, API, data, workflow, migration, or testability decision is consistent with the specification.
- **FIX_UNCLEAR** - the finding is valid, but multiple reasonable specification decisions or specification text shapes exist. The issue's validity is not in question; the unresolved part is which behavior or wording to choose.
- **ASK_USER** - the finding might be valid, but classification depends on product intent, scope, priority, ownership, or a decision not captured in the specification or decision log.
- **REJECT_FALSE_POSITIVE** - the finding is factually wrong. The specification already defines exactly one behavior, or the reviewer misread the specification.
- **REJECT_WONT_FIX** - the finding is valid but intentionally out of scope, acceptable for this specification, contradicts a confirmed locked decision without new concrete risk, or would make the specification worse.
- **REJECT_ALREADY_FIXED** - the issue is already addressed by the current specification or by a prior decision recorded in the decision log.

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
- **Confidence**: HIGH | MEDIUM | LOW
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
HANDLER_RESULT: CLEAN | HAS_FIX | HAS_ASK_USER
FIX_COUNT: <number>
FIX_UNCLEAR_COUNT: <number>
ASK_USER_COUNT: <number>
NEXT_ACTION: SPEC_LOOP_EXIT | SPEC_REVISION | ASK_USER_BATCH
```

- `CLEAN` means 0 FIX, 0 FIX_UNCLEAR, and 0 ASK_USER. The specification review loop exits.
- `HAS_FIX` means 1+ FIX, 0 FIX_UNCLEAR, and 0 ASK_USER. The orchestrator loops back to the phase execute skill with the FIX items.
- `HAS_ASK_USER` means 1+ FIX_UNCLEAR or ASK_USER. The orchestrator batches decision cards to the user, writes answers to the decision log, then re-runs this handler.

Routing consistency is mandatory:

- If `FIX_UNCLEAR_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- If `ASK_USER_COUNT > 0`, `HANDLER_RESULT` MUST be `HAS_ASK_USER` and `NEXT_ACTION` MUST be `ASK_USER_BATCH`.
- Never output `CLEAN` or `HAS_FIX` while any `FIX_UNCLEAR` item exists.
- `FIX_UNCLEAR` never means no-fix. It means the finding is valid and the user must choose the specification behavior or wording.

If the configured phase has no execute skill capable of revising the specification, do not pretend the handler can fix it. State that the pipeline needs a phase that revises the specification or a user-edited specification before `HAS_FIX` can be applied safely.

## Rules

- Read the specification before classifying. Do not trust the finding's characterization.
- Every `FIX` must include concrete specification text or exact specification-edit instructions.
- Every `FIX_UNCLEAR` or `ASK_USER` must include a full decision card from `fixme-howto-present-decisions`.
- If the user must decide whether the issue is real, classify `ASK_USER`.
- If the issue is real but the behavior or wording is a choice, classify `FIX_UNCLEAR`.
- If unsure between `FIX` and `REJECT_*`, classify `ASK_USER` unless the specification evidence resolves it.
- Never skip the routing directive.
