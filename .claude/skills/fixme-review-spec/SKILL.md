---
name: fixme-review-spec
description: Review product, API, workflow, persistence, and migration specifications for deterministic implementability. Finds ambiguity, conflicts, missing behavior, and untestable acceptance criteria before planning or execution. Uses the shared fixme-howto-review-spec rubric and produces evidence-backed findings with recommended spec text.
argument-hint: "<path to spec file>"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and read `fixme_dir` from the JSON. Never use a literal `.fixme/` path in any tool.

# Review Spec

Review a specification before implementation planning. The goal is to decide whether the spec makes exactly one valid behavior possible for every declared user action, API input, persisted state, background workflow, and migration path.

## Hard Constraints

- **NO code or spec modifications.** This is a review. The only output is the findings report.
- **Read the full spec before writing findings.** Partial reads produce false positives and missed ambiguity.
- **Use the shared spec review rubric.** This agent preloads `fixme-howto-review-spec`; if running standalone, read `~/.claude/skills/fixme-howto-review-spec/SKILL.md` or `~/.codex/skills/fixme-howto-review-spec/SKILL.md` before evaluating the spec.
- **Every finding must cite spec evidence.** If the issue is an absence, cite the nearest section where the behavior should have been defined.

## Input Resolution

Resolve the spec to review in this order:

1. **Argument**: if a spec path is passed, use it
2. **Conversation context**: if the user pasted or referenced a spec, use that
3. **Fixme context**: if dispatched from a ticket, inspect the ticket folder for an explicitly named spec or requirements document
4. **Ask**: prompt the user for the spec location

Read any directly referenced documents needed to understand the spec. Do not use branch names, commit messages, old tickets, or surrounding implementation as authority for private spec scope.

## Review Process

Follow the workflow from `fixme-howto-review-spec` exactly:

1. Build the surface inventory.
2. Extract entities, states, actions, inputs, outputs, stores, derived projections, examples, and acceptance criteria.
3. Trace primary journeys end to end.
4. Trace negative, legacy, retry, replay, stale, deleted, archived, unauthorized, and partial-failure paths.
5. Check that examples compile into exact requests, artifact graphs, persisted shapes, and observable outcomes without inventing unstated concepts.
6. Emit only evidence-backed findings in the required format.
7. Assign the final verdict after all findings are classified.

## Two-Pass Review Process

### Pass 1: Investigation

Build the inventory, trace the journeys, and collect candidate findings. For each candidate, verify that it changes deterministic implementability, data safety, workflow semantics, migration safety, or testability.

Discard preference-only issues, speculative edge cases outside the declared surface, and findings that rely on unstated old behavior.

### Pass 2: Report

Write only confirmed findings. Do not include retracted candidates, investigation notes, or "no issue" commentary.

## Output Format

Return the report in this structure:

1. **Summary**: 1-2 sentences stating whether the spec passes or needs revision.
2. **Surface Inventory**: concise list of the behavioral surfaces reviewed.
3. **Findings**: one block per finding using the required finding format from `fixme-howto-review-spec`.
4. **Verdict**: `PASS`, `BLOCK`, `FLAG`, or `NOTE`, following the shared verdict rules.
5. **Questions**: only include questions that could not be resolved from the spec and are needed to complete review.

If there are no findings, say the spec passes and list the surfaces and acceptance criteria you verified.

## Rules

- Prefer fewer high-signal findings over many low-value comments.
- Never write "clarify" without naming the competing valid behaviors.
- Never batch unrelated ambiguities into one finding.
- Never request implementation details unless they affect observable behavior, data safety, migration safety, workflow semantics, or testability.
- Every `BLOCK` must map to a missing or conflicting decision required for implementation.
