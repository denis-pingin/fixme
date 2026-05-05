---
name: fixme-howto-importance
description: Shared review-importance and softness rubric for fixme reviewers, handlers, and PR comment triage. Defines axes, floor findings, scoring, suppression, and aggregation.
---

# Review Importance and Softness

Review softness controls which valid findings remain loud enough to show in the main report or route into another fix loop. It does not reduce review coverage.

softness 0.0 is loudest and softness 1.0 is most permissive. At 0.0, every valid finding survives softness. At 1.0, only floor findings survive.

## Required Importance Axes

Every review finding must carry these axes exactly:

- `harm_class: correctness | security | privacy | data-loss | migration | test-fakeness | stub-claimed-complete | locked-decision-violation | none`
- `user_impact: user-visible | internal-shippable | internal-dev-only`
- `fire_rate: hot-path | warm-path | rare-path | only-during-existing-failure`
- `reversibility: cheap-later | costly-later | irreversible-once-shipped`
- `confidence: HIGH | MEDIUM | LOW`
- `fix_risk: localized | cross-cutting | speculative-rewrite`

If a reviewer cannot assign one axis from evidence, it must say so in the finding. The handler treats missing or invalid axes as floor-equivalent for that run, keeps the finding visible, and reports a warning.

All harm classes are valid emissions from spec review, plan review, code review, and PR comment triage. For example, a spec review can emit `test-fakeness` when the specification asks for tests that copy business logic instead of exercising production code.

## Floor Findings

The floor is the non-negotiable set of harm classes that softness cannot suppress:

- `correctness`
- `security`
- `privacy`
- `data-loss`
- `migration`
- `test-fakeness`
- `stub-claimed-complete`
- `locked-decision-violation`

Floor findings always appear in the main report and always route through normal handler rules. A floor finding can still be rejected as a false positive or wont-fix if the handler proves that classification independently; softness is not involved in that decision.

## Deterministic Importance Score

Handlers compute importance for non-floor findings from the axes. Reviewers do not assign numeric importance directly.

Use this deterministic formula for non-floor findings:

1. Start at `0.0`.
2. Add user impact:
   - `user-visible`: `0.35`
   - `internal-shippable`: `0.20`
   - `internal-dev-only`: `0.05`
3. Add fire rate:
   - `hot-path`: `0.25`
   - `warm-path`: `0.15`
   - `rare-path`: `0.05`
   - `only-during-existing-failure`: `0.0`
4. Add reversibility:
   - `irreversible-once-shipped`: `0.25`
   - `costly-later`: `0.15`
   - `cheap-later`: `0.05`
5. Add confidence:
   - `HIGH`: `0.10`
   - `MEDIUM`: `0.0`
   - `LOW`: `-0.10`
6. Subtract fix risk:
   - `localized`: `0.0`
   - `cross-cutting`: `0.10`
   - `speculative-rewrite`: `0.25`
7. Clamp the result to `[0.0, 0.99]`.

The `0.99` cap is intentional: softness=1.0 suppresses every non-floor finding regardless of computed importance.

## Suppression Rule

Softness applies to FIX and FIX_UNCLEAR only.

ASK_USER and all REJECT_* classifications stay visible through their existing paths. ASK_USER is about missing validity or scope context; softness cannot answer that question. REJECT_* items are already non-actionable or already handled; softness does not change their classification.

For every non-floor FIX or FIX_UNCLEAR finding:

- if `importance >= active_softness` and `active_softness < 1.0`, keep it in the main report and include it in routing counts
- if `importance < active_softness`, suppress it into the ledger and remove it from routing counts
- if `active_softness = 1.0`, suppress it into the ledger regardless of computed importance

Suppression is never silent. Every suppressed record must include the finding ID, configured softness, resolved softness float, importance score, all axes, and the full finding body or a durable pointer to that body.

Every classified review item must include an `Importance` line. This applies to FIX, FIX_UNCLEAR, ASK_USER, REJECT_*, FOLLOWUP_ONLY, and already-fixed items. Reviewers emit axes; handlers and PR comment triage emit the resolved importance result.

Use one of these exact output shapes:

- `Importance: floor / softness <resolved_float> -> survives`
- `Importance: <score> / softness <resolved_float> -> survives`
- `Importance: <score> / softness <resolved_float> -> suppressed`
- `Importance: not-eligible / softness <resolved_float> -> not-eligible`

Use `not-eligible` for ASK_USER, REJECT_*, already-fixed items, and file-overlap-only deferral candidates. Keep those items visible through their normal route; softness does not decide them.

Use this ledger wording:

`Suppressed at softness=<resolved_float> with importance=<score>, axes={harm_class=..., user_impact=..., fire_rate=..., reversibility=..., confidence=..., fix_risk=...}`

## Pattern Aggregation

Aggregate before suppression.

Aggregate only findings that share severity, category, surface, and harm_class. When 5 or more findings share those keys in a single review phase, collapse them into one aggregated MAJOR finding before computing importance.

The aggregate inherits the shared `harm_class`. The aggregate references every original finding ID so the user can recover the individual bodies on demand.

Do not aggregate across review phases. Do not stream-aggregate while findings are still being discovered. Aggregation runs once after all findings for that phase are emitted and before importance scoring.

## File-Overlap Deferral Guard

Softness cannot bypass the PR comment rule that file overlap alone is not a valid deferral reason.

If a PR comment's only reason for deferral is "same file", "area is being reworked", "stack-mate", or similar file-overlap wording without a named code path being superseded, it is not eligible for softness suppression. Keep it visible and mark why it failed the softness eligibility gate.
