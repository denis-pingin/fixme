---
name: fixme-handle-spec-review
description: Validate and triage spec review findings using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the spec and directly referenced context to distinguish real spec defects from false positives. Outputs HANDLER_RESULT routing directives for spec review loops. Never modifies any files.
disable-model-invocation: true
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Spec Review Feedback

Validate spec review findings against the spec and classify each using the unified finding taxonomy.

This handler enables a spec review loop when used in a pipeline phase that has an upstream spec-writing or spec-revision skill. The handler never edits specs itself; `HAS_FIX` tells the orchestrator to loop back to that phase's execute skill with the FIX items.

## Input Resolution

Resolve inputs in this order:

1. **Argument**: if findings and a spec path are passed, use them
2. **Conversation context**: if findings and spec content are in the current conversation, use them
3. **Fixme context**: if dispatched from a ticket, inspect the ticket folder for an explicitly named spec or requirements document
4. **Ask**: prompt the user for the findings and spec location

Before classifying anything, read all of these:

- The spec review findings
- The full spec, not just cited sections
- Directly referenced spec/context documents needed to verify a finding
- The decision log at `<fixme-dir>/decisions.md` if it exists

Do not use branch names, commit messages, old tickets, or surrounding implementation as authority for private spec scope. Read implementation only if the spec explicitly cites it as source material for the behavior being reviewed.

## Classification

- **FIX** - the finding is valid and the needed spec change is unambiguous. The reviewer supplied concrete spec text or only one exact product, API, data, workflow, migration, or testability decision is consistent with the spec.
- **FIX_UNCLEAR** - the finding is valid, but multiple reasonable spec decisions or spec text shapes exist. The issue's validity is not in question; the unresolved part is which behavior or wording to choose.
- **ASK_USER** - the finding might be valid, but classification depends on product intent, scope, priority, ownership, or a decision not captured in the spec or decision log.
- **REJECT_FALSE_POSITIVE** - the finding is factually wrong. The spec already defines exactly one behavior, or the reviewer misread the spec.
- **REJECT_WONT_FIX** - the finding is valid but intentionally out of scope, acceptable for this spec, contradicts a confirmed locked decision without new concrete risk, or would make the spec worse.
- **REJECT_ALREADY_FIXED** - the issue is already addressed by the current spec or by a prior decision recorded in the decision log.

## Pre-Classification Gate

For each finding:

1. Read the cited spec text and the surrounding section.
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
- **Why**: {1-2 sentences grounded in the spec}
- **Spec evidence**: {clickable spec location, or nearest section for absence}
- **Question**: {ASK_USER and FIX_UNCLEAR only; full decision card from fixme-howto-present-decisions}
- **Spec update**: {FIX only; concrete text or exact instruction for the spec revision skill}
- **Risk**: {FIX only; what could go wrong with the spec update}
```

Omit fields that are marked for other classifications.

### Output Ordering

Group related findings that would be addressed by the same spec revision. Order: FIX, then FIX_UNCLEAR, then ASK_USER, then REJECT_*.

### Summary

End with a summary before the routing block:

1. **Verdict**: exact counts for each classification
2. **Overall assessment**: whether the spec can proceed, needs revision, or needs user decisions first
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

- `CLEAN` means 0 FIX, 0 FIX_UNCLEAR, and 0 ASK_USER. The spec review loop exits.
- `HAS_FIX` means 1+ FIX, 0 FIX_UNCLEAR, and 0 ASK_USER. The orchestrator loops back to the phase execute skill with the FIX items.
- `HAS_ASK_USER` means 1+ FIX_UNCLEAR or ASK_USER. The orchestrator batches decision cards to the user, writes answers to the decision log, then re-runs this handler.

If a spec review phase has no execute skill capable of revising the spec, do not pretend the handler can fix it. State that the pipeline needs a spec-revision phase or user-edited spec before `HAS_FIX` can be applied safely.

## Rules

- Read the spec before classifying. Do not trust the finding's characterization.
- Every `FIX` must include concrete spec text or exact spec-edit instructions.
- Every `FIX_UNCLEAR` or `ASK_USER` must include a full decision card from `fixme-howto-present-decisions`.
- If the user must decide whether the issue is real, classify `ASK_USER`.
- If the issue is real but the behavior or wording is a choice, classify `FIX_UNCLEAR`.
- If unsure between `FIX` and `REJECT_*`, classify `ASK_USER` unless the spec evidence resolves it.
- Never skip the routing directive.
