---
name: fixme-howto-review-spec
description: Shared specification review guidelines for the fixme pipeline. Defines the canonical rubric for reviewing specifications for deterministic implementability, ambiguity, conflicts, gaps, migration safety, and testability. Preloaded into specification reviewer agents and usable standalone in other contexts.
---

# Specification Review Guidelines

These guidelines govern how specifications are reviewed before implementation planning. Every skill or agent that reviews a specification should use this rubric.

When the review asks the user to decide anything, present that question with `fixme-howto-present-decisions`. Do not emit free-form questions.

## Core Principle

A specification passes review when it makes exactly one valid behavior possible for every declared user action, API input, persisted state, background workflow, and migration path.

A specification is broken when an implementer can ask "what should happen here?" and answer it multiple defensible ways.

The best review outcome is the smallest useful set of evidence-backed findings that, once fixed, makes the specification deterministic, testable, self-contained, and safe to implement.

## Review Workflow

1. Build the surface inventory before writing findings.
2. Extract entities, states, actions, inputs, outputs, stores, derived projections, examples, and acceptance criteria.
3. Trace each primary user, API, background job, and migration journey end to end.
4. Trace negative, legacy, retry, replay, stale, deleted, archived, unauthorized, and partial-failure paths.
5. Check that every example compiles into exact requests, intents, artifact graphs, persisted shapes, and observable outcomes without inventing unstated concepts.
6. Write only evidence-backed findings using the required finding format.
7. Assign a verdict after all findings are classified.

## Surface Inventory

Before writing findings, enumerate the specification's behavioral surfaces:

- product entities and deleted or collapsed legacy concepts
- user roles, ownership rules, and admin behavior
- screens, deep links, and route compatibility
- API endpoints, request modes, response shapes, and auth boundaries
- persisted records, durable identifiers, generated versions, and schema versions
- authoritative stores, caches, projections, indexes, queues, and mobile copies
- background jobs, locks, retries, polling, replay, force, and idempotency semantics
- migrations, backfills, legacy decoders, invalidation, rebuilds, and deletion paths
- external providers, durable assets, transient URLs, and media type boundaries

## Verdict Rules

Use `BLOCK` when implementation would require the engineer to make a product, data, API, workflow, migration, or testing decision not made by the specification.

Use `FLAG` when the specification is implementable but likely incomplete, confusing, or risky in a non-blocking path.

Use `NOTE` for out-of-scope concerns that should be preserved for later but do not affect this specification's implementability.

Use `PASS` only when every core path has one valid behavior, negative and legacy paths are specified, examples compile into exact outcomes, and acceptance criteria are testable.

Block the specification if any of these are true:

- one user action, API input, state transition, durable field, migration path, or failure mode has multiple defensible outcomes
- entity identity, state ownership, source of truth, versioning, or migration behavior is underspecified
- persisted data shape, derived projection behavior, or repair behavior can diverge without a specified resolution
- examples introduce concepts not defined elsewhere in the specification
- acceptance criteria cannot be converted into tests
- old concepts, routes, fields, or subsystems must be deleted or collapsed but the target action is unspecified

## Finding Classification

Classify every finding as exactly one of:

- `Ambiguity`: multiple valid implementations are possible
- `Conflict`: two specification statements cannot both be true
- `Gap`: required behavior is absent
- `Untestable`: acceptance criteria cannot be verified
- `Out of scope`: real concern, but not needed to implement this specification

## Required Finding Format

Every finding or note must use this format:

```md
Severity: BLOCK | FLAG | NOTE
Classification: Ambiguity | Conflict | Gap | Untestable | Out of scope
Specification location:
Problem:
Competing valid behaviors:
Required decision:
Recommended specification text:
Acceptance test implied:
Importance axes:
```

`Specification location` must cite the text that creates the issue. If the issue is an absence, cite the nearest section where the behavior should have been defined.

`Competing valid behaviors` must name the concrete alternatives an implementer could reasonably choose. For a pure gap, state the missing behavior and why the surrounding specification makes it required.

`Required decision` must describe the product, API, data, workflow, migration, or testability decision needed to remove ambiguity. For `NOTE`, state why no decision is required in this specification.

`Recommended specification text` must be concrete enough to paste into the specification or adapt directly.

`Acceptance test implied` must describe the observable test shape using given state, actor or input, action, and expected result.

`Importance axes` must use the shared `fixme-howto-importance` values: `harm_class`, `user_impact`, `fire_rate`, `reversibility`, `confidence`, and `fix_risk`.

## Report Structure

Return the review in this order:

1. `Summary`: one or two sentences stating whether the specification passes or needs revision.
2. `Surface inventory`: concise list of behavioral surfaces reviewed.
3. `Findings`: one block per finding using the required finding format.
4. `Verdict`: `PASS`, `BLOCK`, `FLAG`, or `NOTE`, following the verdict rules.
5. `Decisions`: only unresolved questions required to complete the review, formatted as decision cards from `fixme-howto-present-decisions`.

If there are no findings, state that the specification passes and list the surfaces and acceptance criteria verified.

## Review Checks

### Entity Model

Check what exists as a product concept, what does not exist, and what old concepts must be deleted or collapsed. No ghost surfaces.

### State Machines

Check every entity state, transition, blocked transition, default state, and reversible action. Include archive/unarchive, run/regenerate, fork, follow, freshness, replay, and deletion semantics when those states exist.

### User Journeys

For every screen and entity state, check what is visible, editable, read-only, hidden, blocked, or in overflow. Include admin, owner, unauthorized, stale deep-link, and deleted-entity paths.

### API Contract

Check exact request unions, defaults, invalid combinations, auth rules, owner/admin behavior, idempotency/replay/force semantics, response shapes, and examples that map to valid requests.

### Identity and Versioning

Check which IDs identify the durable slot versus a regenerated version, which version fields mean freshness, and which version fields are schema migrations only.

### Source of Truth

For every field, check the authoritative store versus cache, projection, index, or copied representation. KV, R2, Convex, queues, mobile projections, and publication indexes must not disagree without repair rules.

### Persistence and Migration

Every durable schema change needs versioning, backfill, decode, and legacy behavior. Old data must have a target action: migrate, delete, rebuild, invalidate, or intentionally leave unchanged.

### Planner Determinism

The same inputs must compile to one DAG. Artifact matching must be exact. Duplicate producers, missing producers, ambiguous roles, and missing required artifacts must fail predictably.

### Pipeline Ownership

Each component must own one responsibility. For example: query before pipeline, generation hydrates final blocks, assembly stays mechanical, and candidates are explicit inputs.

### Workflow Semantics

Check what starts work, observes work, retries work, locks work, polls work, copies assets, and resolves partial failure.

### Asset and Media Boundaries

Durable story state must not leak provider URLs or transient generation state. Asset types should only carry fields that belong to that type.

### Negative Cases

Check invalid fields, incompatible modes, stale versions, missing artifacts, deleted entities, archived entities, unauthorized access, legacy decode, cache staleness, old routes, retry exhaustion, and partial writes.

### Examples as Tests

Every example must compile into one exact request, intent, artifact graph, persisted shape, and observable outcome without inventing unstated concepts.

### Acceptance Coverage

Every critical invariant needs a testable acceptance criterion, including deletion of old subsystems and failure behavior.

Use this shape when checking testability:

```md
Given persisted state:
Given actor or API input:
When action occurs:
Then response, UI, durable state, logs, projections, or emitted work are:
```

### Self-Containment

The specification must have no undefined terms, no "if needed", no reliance on old tickets/specifications/code, and no vague "existing behavior" unless the exact behavior is named.

## Reviewer Anti-Patterns

Do not:

- write "clarify" without naming the competing valid behaviors
- batch unrelated ambiguities into one finding
- request implementation details unless they affect observable behavior, data safety, migration safety, workflow semantics, or testability
- emit free-form user questions instead of decision cards from `fixme-howto-present-decisions`
- assume old behavior unless the specification names it
- accept "existing behavior" unless the exact behavior is restated
- raise speculative cases outside declared inputs, roles, states, workflows, or migrations
- use branch names, commit messages, old tickets, or surrounding implementation as authority for private specification scope
- produce preference-only comments that do not change deterministic implementability

## Final Consistency Check

Before returning the review, verify:

- every finding has evidence, classification, required decision, recommended specification text, and an implied acceptance test
- every `BLOCK` maps to a missing or conflicting decision required for implementation
- every `FLAG` is implementable as written and clearly non-blocking
- every `NOTE` is out of scope and does not affect the final verdict
- no original checklist area was skipped
- no finding relies on unstated old behavior, private ticket memory, or implementation guesses
- the final verdict follows from the findings
