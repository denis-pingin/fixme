---
name: fixme-howto-plan-acceptance
description: Shared plan acceptance contract for plan writers and plan reviewers when implementation plans must be executable, reviewable, and state-safe.
---

# Plan Acceptance Contract

This contract is the single plan-quality source of truth for `fixme-write-plan` and `fixme-review-plan`.

The writer uses it as a pre-save gate. The reviewer uses it as the audit rubric. A plan that fails this contract is not ready for execution.

## Core Rule

No `PLAN_PATH` may be emitted until every required receipt row passes.

Missing, false, unknown, or contradicted receipt entries are blocker findings.

The writer must revise internally until the receipt passes, or return a task-bound attention/blocker when a required fact cannot be proven from the task, prior artifacts, decisions, or codebase. The reviewer must verify the receipt against the plan, code map, specs, decisions, and codebase before reporting clean.

## Required Plan Acceptance Receipt

Every non-trivial implementation plan must include this section before the task list or immediately before final verification:

```md
## Plan Acceptance Receipt

### Goal-Backward Coverage
| Requirement | Source | Plan steps | Behavioral proof |
| --- | --- | --- | --- |

### Invariant Proof Matrix
| Invariant | Source | Enforcement step | Ordering rule | Consumer path | Behavioral proof |
| --- | --- | --- | --- | --- | --- |

### State/Effect Lifecycle Audit
| Effect | First write | Proof before write | Duplicate behavior | Stale/partial behavior | Retry/replay behavior | Test |
| --- | --- | --- | --- | --- | --- | --- |

### Write-Before-Proof Scan
| Write-capable step | Required proof before write | Evidence that proof happens first |
| --- | --- | --- |

### Behavioral Proof Strength
| Behavior | Production entrypoint or public seam | Assertion proving behavior | Why helper/source-shape checks are insufficient |
| --- | --- | --- | --- |

### New Named Entity Delta Table
| Entity | Existing sibling checked | Added behavior | Call sites | Why not reuse/inline |
| --- | --- | --- | --- | --- |

### Sibling-Surface Audit
| Failure family or invariant | Surfaces audited | Surfaces intentionally out of scope | Reason |
| --- | --- | --- | --- |

### Dependency Ordering
| Dependency | Producer step | Consumer step | Ordering proof |
| --- | --- | --- | --- |

### Claim Verification
| Claim | Verified source | Plan step that depends on it |
| --- | --- | --- |

### Acceptance Result
- Goal-Backward Coverage: pass
- Invariant Proof Matrix: pass
- State/Effect Lifecycle Audit: pass
- Write-Before-Proof Scan: pass
- Behavioral Proof Strength: pass
- New Named Entity Delta Table: pass
- Sibling-Surface Audit: pass
- Dependency Ordering: pass
- Claim Verification: pass
```

Use `None - reason` only for sections that truly do not apply. `None` is a claim and must be justified from the task and codebase.

## Gate Definitions

### Goal-Backward Coverage

Start from the requested outcome and work backward. Every requirement from the task, spec, review context, decision log, or saved task must map to at least one exact plan step and one behavioral proof. Every plan step must map back to an in-scope requirement or be removed.

### Invariant Proof Matrix

Every critical invariant must name its source, production enforcement point, ordering rule, consumer path, and behavioral proof. A plan fails when it only says to store, mark, generate, or record safety data without naming the live production path that consumes it.

### State/Effect Lifecycle Audit

For every stateful effect, define first write, proof before write, duplicate behavior, stale or partial prior-state behavior, retry/replay behavior, and the test that observes the behavior. Stateful effects include durable writes, generated artifacts, launch records, runtime actions, owner fences, attention, parent state, task events, retries, replay, publish/acknowledge/finalize transitions, and semantic equality.

### Write-Before-Proof Scan

For every write-capable step, name the validation, replay check, digest check, idempotency check, source-of-truth read, or state proof that happens before the write. If the proof happens after the write, the plan fails. If the ordering is part of the invariant, freeze that ordering explicitly.

### Behavioral Proof Strength

Tests must observe production behavior at the production entrypoint or public seam. Content/state equality must be deep enough to catch mutation of existing durable files, not only file path/type presence. Helper-output tests, generated-shape tests, source-text tests, and mocks do not prove lifecycle safety unless paired with production-path assertions.

### New Named Entity Delta Table

Every planned helper, function, type, constant, command, flag, prompt block, or state field must name the closest existing sibling checked, the behavior it adds, its call sites, and why reuse or inline is not better. Two new siblings with no concrete behavioral delta fail the contract.

### Sibling-Surface Audit

For each failure family or lifecycle invariant, enumerate all sibling surfaces governed by the same rule. For Fixme lifecycle work, consider direct start, parent-aware start, replay, stale parent, pending attention, dispatch observe, task begin, child finalize, task-event consume, runtime action, launch record, prompt blocks, and docs. Mark intentionally excluded surfaces with a reason, not silence.

### Dependency Ordering

No plan step may depend on a helper, digest, launch id, owner fence, state field, test helper, fixture, or command introduced later. A consumer step must appear after the step that creates its dependency.

### Claim Verification

Every file path, function, API shape, state field, command, fixture, and existing behavior named by the plan is a claim until verified against the current codebase. The receipt must cite the source that proves each claim used by an implementation step.

## Writer Obligations

Run the Plan Acceptance Contract before saving the plan. The writer must read the draft as the reviewer would, fill the receipt with concrete rows, verify every row against the plan and codebase, revise failing rows, and only then save.

If any required row is unknown and the answer affects the plan shape, use the task-bound user input contract or standalone user prompt. Do not emit `PLAN_PATH` for a plan with an unknown acceptance row.

## Reviewer Obligations

Review the Plan Acceptance Receipt first. Then verify it against the plan, code map, specs, decisions, and codebase.

A missing receipt is a blocker for non-trivial plans. A receipt row that is missing, false, unknown, contradicted by a plan step, contradicted by code, or weaker than the invariant it claims to prove is a blocker. After receipt audit, continue normal plan review for issues outside the receipt.
