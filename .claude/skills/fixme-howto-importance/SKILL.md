---
name: fixme-howto-importance
description: Shared review assessment and review-level gate rubric for fixme reviewers, handlers, and PR comment triage.
---

# Review Assessment and Review Level Gate

Review assessment is the evidence-backed dimension block emitted for every finding before judgement. Review level is the configured gate that turns a classified finding into one of four visible routes.

## Required Dimensions

Every review finding must carry these dimensions exactly:

- `reachability`
- `state_contract`
- `trigger_window`
- `target_scale`
- `impact`
- `fix_risk`
- `confidence`

Use this compact output shape:

```text
Review assessment: reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>
```

Reviewers do not assign handler classification or level-route metadata.

## Dimension Meanings

- `reachability`: whether the issue can execute or affect the reviewed workflow.
- `state_contract`: whether the reported state is supported, unsupported, impossible, or unclear.
- `trigger_window`: when the issue can occur, such as always, common path, rare path, or only during an existing failure.
- `target_scale`: who or what is affected, such as one item, one workflow, many users, or project-wide behavior.
- `impact`: `blocking`, `incorrect`, `data-loss`, `security`, `privacy`, `migration`, `test-validity`, `maintainability`, or `none`.
- `fix_risk`: `localized`, `cross-cutting`, or `speculative-rewrite`.
- `confidence`: `high`, `medium`, or `low`.

Malformed assessment data routes to decision-needed. Missing or invalid dimensions produce a warning naming the dimensions, and the handler must not silently choose a fix route.

## Level Routes

Level route values are:

```text
blocking-fix | follow-up | decision-needed | dismissed
```

- `blocking-fix`: fix in the current workflow before advancing.
- `follow-up`: record visibly for later work; do not hide it.
- `decision-needed`: ask the user because validity, supported behavior, or fix approach cannot be selected safely from evidence.
- `dismissed`: no action because the item is false positive, already fixed, out of scope with no required current action, impossible by construction, or `impact=none`.

## Review-Level Gate

Handlers apply the active review level after classification and assessment validation.

- `strict`: valid blocking, incorrect, data-loss, security, privacy, migration, and test-validity findings route to `blocking-fix`; lower-impact valid findings route to `follow-up`.
- `standard`: valid user-visible or shippable correctness and safety findings route to `blocking-fix`; localized maintainability findings route to `follow-up`.
- `lenient`: only high-confidence shippable correctness and safety findings route to `blocking-fix`; the rest route to `follow-up`.
- `fast-track`: only severe high-confidence findings route to `blocking-fix`; most valid findings route to `follow-up`.
- `critical`: only data-loss, security, privacy, migration blockers, or unusable workflows route to `blocking-fix`.

Follow-up visibility is mandatory. A follow-up route must preserve enough evidence for a later ticket, PR comment reply, or run summary entry.

## Aggregation

Aggregate only findings that share route, severity, category, impact, and affected workflow. Do not aggregate findings that need different user decisions or different implementation approaches.
