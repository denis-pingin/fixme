---
name: fixme-howto-write-technical-spec
description: Shared technical specification writing guidelines for the fixme pipeline. Defines how to write deterministic implementation contracts for architecture, interfaces, data, migrations, workflows, integrations, and validation without turning the document into an implementation plan. Preloaded into specification-writing agents and usable standalone in other contexts.
---

# Technical Specification Writing Guidelines

These guidelines govern how technical specifications are written after product behavior is known and before implementation planning. A technical specification defines the implementation contract; it is not a step-by-step plan.

When writing requires a user decision, present the decision with `fixme-howto-present-decisions`. Do not leave unresolved questions in the final specification.

Transport is owned by the caller. This skill defines technical-spec decision content only. Task-bound runs under `fixme-task` use the Task-Bound User Input Contract and durable attention; standalone or directly user-facing runs may render the decision directly through their normal prompt mechanism.

## Core Principle

A technical specification is ready when an engineer can implement the system without inventing architecture, API, data, migration, workflow, integration, security, observability, or validation decisions.

The best technical specification turns product behavior into deterministic contracts while preserving the product intent exactly.

## Relationship To Product Specifications

Use the product specification, ticket, or user request as source material for behavior. Do not change product behavior inside the technical specification.

If product behavior is missing or contradictory, stop and ask with a decision card. Do not bury product choices as technical assumptions.

## Writing Workflow

1. Read the product specification, user request, decision log, and directly relevant code.
2. Inventory affected modules, interfaces, stores, jobs, migrations, integrations, auth boundaries, and validation surfaces.
3. Verify current codebase patterns before prescribing a contract.
4. Separate requirements, constraints, guidelines, and recommendations.
5. Define exact interfaces, data contracts, state transitions, failure modes, and compatibility behavior.
6. Define migration, backfill, repair, rollback, and legacy behavior when durable state changes.
7. Define acceptance criteria and validation criteria for every critical contract.
8. Resolve every ambiguity with decision cards before finalizing.
9. Run the readiness check at the end.

## Technical Surface Inventory

Before writing requirements, enumerate the technical surfaces the work touches:

- modules, packages, services, clients, routes, handlers, and background jobs
- API endpoints, request unions, response shapes, errors, auth, and idempotency
- data models, durable identifiers, schema versions, indexes, caches, and projections
- migrations, backfills, legacy decoders, rebuilds, invalidation, and deletion paths
- queues, locks, retries, polling, replay, concurrency, and partial failure
- external providers, assets, media types, URLs, tokens, and service limits
- feature flags, rollout, compatibility, rollback, and operational procedures
- logging, metrics, tracing, audit events, alerts, and degraded behavior
- security, privacy, compliance, rate limits, and abuse boundaries
- test levels, fixtures, data setup, and acceptance validation

## Required Output Shape

Use this structure unless the caller supplies a stricter template:

```md
---
title: [Concise technical title]
version: [Version or date]
date_created: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
owner: [Team or person, if known]
tags: [short, relevant, tags]
---

# [Technical Specification Name]

[One to three sentences explaining the system contract and the outcome it enables.]

## 1. Purpose and Scope

[What this technical specification covers, what it excludes, and which product behavior it supports.]

## 2. Source Material and Decisions

- **SRC-001**: [Product specification, ticket, decision log, or code reference]
- **DEC-001**: [Locked decision that constrains the design]

## 3. Definitions

- **[Term]**: [Concrete definition]

## 4. Architecture and Ownership

- **ARC-001**: [Component or module responsibility]
- **OWN-001**: [Source of truth or ownership rule]

## 5. Requirements and Constraints

- **REQ-001**: [Technical requirement]
- **CON-001**: [Constraint that must not be violated]
- **SEC-001**: [Security, privacy, or permission requirement]
- **OBS-001**: [Logging, metric, trace, audit, or alert requirement]

## 6. Interfaces and Data Contracts

### 6.1 [Interface Name]

- Path or entry point: [Endpoint, function boundary, route, job, or event]
- Caller: [Who calls it]
- Inputs: [Exact fields, modes, defaults, invalid combinations]
- Outputs: [Exact response, emitted event, side effect, or artifact]
- Errors: [Error cases and returned/logged behavior]
- Compatibility: [Legacy behavior or versioning rule]

## 7. Persistence, Migration, and Backfill

- **DAT-001**: [Durable data shape or invariant]
- **MIG-001**: [Migration, backfill, rebuild, invalidation, or deletion behavior]
- **REP-001**: [Repair or recovery behavior]

## 8. Workflow, Concurrency, and Failure Semantics

- **WRK-001**: [What starts work, observes work, retries work, and finishes work]
- **FAIL-001**: [Partial failure, retry exhaustion, stale state, or replay behavior]

## 9. Dependencies and Integration Boundaries

- **EXT-001**: [External system, required capability, limit, and fallback]
- **PLT-001**: [Runtime or platform constraint]

## 10. Test and Validation Criteria

- **AC-001**: Given [state/input], when [operation], then [observable result]
- **VAL-001**: [Build, lint, test, migration, smoke, or operational validation]

## 11. Rollout, Compatibility, and Operations

- **ROL-001**: [Rollout, rollback, feature flag, or compatibility requirement]
- **OPS-001**: [Operational check, alert, dashboard, or runbook requirement]

## 12. Out of Scope

- [Technical path, behavior, or follow-up intentionally excluded]
```

Do not use markdown tables in the default template. Use bullets and fenced code blocks for data shapes.

## Decision Handling In Final Specifications

Decision cards are only for user-facing pauses before a decision is made. They are not the persisted format for final technical specifications.

In final technical specifications, record only resolved decisions that constrain implementation:

```md
- **Decision**: [chosen implementation contract]
  - Rationale: [why this contract is required]
  - Source: [decision log, user answer, product specification, or verified code reference]
```

Do not embed option-comparison cards, `ASK_USER` prompts, acceptance instructions, or rejected-option matrices in the final specification. Omit rejected options unless they define an explicit out-of-scope boundary, compatibility constraint, or implementation prohibition.

## Contract Rules

- Every contract must be exact enough that implementation does not require a design choice.
- Every interface must define inputs, outputs, errors, auth, defaults, invalid combinations, and compatibility behavior.
- Every durable data change must define versioning, migration, backfill, decode, repair, rollback, and old-data behavior.
- Every background workflow must define trigger, ownership, locking, retries, idempotency, progress observation, and partial failure.
- Every integration must define required capability, limits, timeout or retry expectations, fallback behavior, and logging.
- Every fallback or degraded behavior must be visible through logs, metrics, user-facing state, or an explicit operational signal.
- Every stateful effect must define an Effect Lifecycle Contract.
- Every requirement must map to validation criteria.

## Effect Lifecycle Contracts

A stateful effect is any operation where correctness depends on more than local code returning a value. This includes state transitions, retries, queues, jobs, webhooks, cache invalidation, external APIs, database writes, filesystem writes, public UI visibility, deletion, authorization, notifications, generated artifacts, deployment steps, and similar durable or observable behavior.

For every stateful effect, define:

- **Boundary**: the operation crossing point, such as handler, job, mutation, API call, filesystem write, queue publish, cache update, UI publish, provider call, deploy action, or artifact generation.
- **State meanings**: every status, flag, phase, marker, or derived state introduced or consumed, with the exact proof required for that name to be true. Do not use names like `done`, `sent`, `synced`, `confirmed`, `published`, or `valid` unless the contract defines what proves them.
- **Source of truth**: where reality is checked for each state: local store, remote system, generated file, event log, queue state, rendered output, user-visible surface, or another concrete authority.
- **Durable evidence**: the persisted fact that proves the effect was requested, applied, observed, skipped, failed, or completed.
- **Consumer path**: every generated key, marker, status, artifact, or record must name the production path that consumes it. Storage alone is not enforcement.
- **Repeat behavior**: what happens when the same operation runs twice, resumes after interruption, races with another run, or sees partial prior state.
- **Advancement gate**: the exact proof required before downstream state advances, especially before public visibility, deletion, acknowledgement, unlock, commit, publish, terminal state, or any irreversible transition.
- **Failure signal**: the observable status, log, metric, error, report, or user-facing state emitted when the effect cannot complete.
- **Behavioral proof**: the test or validation must execute the production entrypoint or public seam and fail if the lifecycle contract is violated.

The universal rule: any value, state, or artifact that exists to make behavior safe must be consumed by the live path that makes the behavior safe, and a behavioral test must prove that consumption.

## Data Contract Shape

Use fenced blocks for structured contracts:

```md
Input:
- fieldName: type, required/optional, default, validation

Output:
- fieldName: type, source, nullable/non-nullable, meaning

Errors:
- condition: returned status/state/logged signal/recovery behavior
```

Do not include production code unless the caller explicitly asks for code-level examples. Prefer schemas, field lists, state diagrams in text, and observable contracts.

## What To Exclude

Do not include:

- product behavior changes not present in source material
- task-by-task implementation steps
- speculative abstractions that are not required by the current contract
- package or library versions unless they are architectural constraints
- vague references to "existing behavior" without restating the exact behavior
- unverified claims about the codebase

## Readiness Check

Before finalizing, verify:

- every product behavior has a technical owner or contract
- every API, data, workflow, migration, and integration path has one valid implementation
- every failure mode has a specified outcome and observable signal
- every stateful effect has an Effect Lifecycle Contract
- every durable change has migration and legacy behavior
- every contract can be converted into tests or validation commands
- no product decisions are hidden as technical assumptions
- no open questions remain
- any user-facing decision was presented with `fixme-howto-present-decisions`
