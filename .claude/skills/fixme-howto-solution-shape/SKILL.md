---
name: fixme-howto-solution-shape
description: Shared rubric for choosing the shape of a solution whenever a fixme skill designs, recommends, or selects a fix for a finding (PR comment, code review, plan review, spec review) or an approach candidate. Defines the simplest-best-from-first-principles principle, the precise meaning of simplicity, the reconciliation with the strike-editorial-simpler guard, the band-aid and gold-plating bounds, decision boundaries, and the first-principles baseline label for decision cards.
---

# Solution Shape Rubric

This rubric defines how any Fixme skill designs, recommends, or selects the shape of a solution for a finding or approach candidate.

## Core Principle

Derive the solution from the requirement and the root cause, not from the shape of the current code or the reviewer's suggested patch. Choose the simplest best solution shape: the design that fully resolves the root cause with the least essential and accidental complexity and leaves the architecture sound. Prefer this even when it means redesigning a component or changing more than a minimal patch would.

The failure mode this prevents is the band-aid: a fix that resolves the reported symptom while preserving the bad structure that produced it. Examples: an added guard where the real fix is to make the invalid state unrepresentable; a patched call site where the contract is wrong; a special-cased input where the parsing or type is the issue; a flag or config added to avoid changing a wrong default. Band-aids accumulate into architecture nobody chose.

## What "Simplest" Means

Simplicity is a property of the resulting design, measured on:

- fewest concepts and moving parts a reader must hold at once
- least coupling between components; clear single responsibility
- fewest special cases and branches; invalid states made unrepresentable rather than guarded
- the root cause addressed once, not its symptoms patched in many places
- no new abstraction, flag, or config that does not pay for itself

Simplicity is NOT measured by diff size, line count, or implementation effort. A larger change that removes a redundant layer or a whole class of bugs is simpler than a one-line guard that adds a permanent special case. "Fewer lines" and "less work" are never evidence of simplicity.

## Relationship To The Strike-Editorial "Simpler" Rule

Other fixme skills tell you to strike words like "simpler", "cleaner", "easier", "lighter touch", and "just X" from your reasoning. That rule and this one are the same value, not opposites.

The banned move is asserting "simpler" as an unjustified anchor: picking an option because the reviewer labeled it simpler, because it is fewer lines, or because it is less work, without evaluating the design.

This rubric defines the justified sense: simplicity demonstrated on the design axes above. When you call a shape "simpler", show it on those axes, never on diff size or effort.

Both rules reject the lazy minimal patch. Neither lets "it is less code" or "it is less work" decide.

## Bounded: Not A License To Rewrite

Simplest-best cuts both ways. The chosen shape must be the minimal essential design that is correct at the root, not a speculative or grander rewrite. Apply YAGNI to the architecture itself: do not add layers, generality, or scope the root cause does not require. "More changes than a patch" is bounded by the root cause, not by ambition. If you cannot show that the extra structure removes essential complexity or a class of defects, it is gold-plating, and gold-plating is its own band-aid.

## Scope And Decision Boundaries

This rubric changes which shape is "best"; it does not change who decides or the task's scope.

- Respect scope and locked decisions. If the simplest-best shape requires changes outside the task's scope, contradicts a locked decision, or changes plan-level architecture, route it as the workflow requires: plan revision, specification revision, `PLAN_REQUIRED`, or a user decision. Never expand scope silently.
- Respect the Decision Eligibility Gate in `fixme-howto-present-decisions`. Leaving bad architecture in place is itself a material downside of a patch, so a band-aid rarely dominates a root-cause fix. When a root-cause shape carries real material cost, risk, or scope that the patch avoids, and evidence cannot pick the winner, classify it as a genuine decision (`FIX_UNCLEAR`) and recommend the simplest-best shape.
- When one shape dominates on first principles because it resolves the root cause with no material downside the patch avoids, that is the fix. "It is a bigger diff" is not a material downside.

## First-Principles Baseline Option

When competing solution shapes are presented to the user in `FIX_UNCLEAR` cards, or in any decision card whose options are competing solution shapes:

1. If one candidate cleanly resolves the root cause with no tradeoff, drawback, or negative consequence, it is Option A and carries the tag `[First-principles baseline]` in its option heading. At most one option carries the tag.
2. Alternatives appear only because each offers a real, named benefit over the baseline. State that benefit explicitly as the reason the alternative exists. An alternative with no real benefit over the baseline is strictly dominated and must be dropped.
3. The recommendation defaults to the baseline. It may name an alternative only when that alternative's benefit is decisive, and the rationale must justify accepting the added complexity or tradeoff over the clean baseline.
4. If no candidate qualifies as the baseline because every option carries a tradeoff, label none; ordering and recommendation follow the normal decision-card rules.

"No tradeoff" is judged on the resulting design, not on diff size or effort. A larger root-cause redesign can still be the clean baseline and carry the tag, because a bigger diff is not a tradeoff. The Decision Eligibility Gate excludes an option only when it carries a real design tradeoff, drawback, or negative consequence.

This rule applies only when the card's options are competing solution shapes. A pure validity or direction card whose options are "fix", "defer", or "reject" carries no `[First-principles baseline]` tag because none of its options is itself the simplest-best solution shape.

The exact label string is `[First-principles baseline]`. It is owned here and referenced by `fixme-howto-present-decisions`; do not redefine it elsewhere.

## Applying It By Role

- Reviewers (`fixme-review-code`, `fixme-review-plan`, `fixme-review-spec`): when the only fixes you would suggest are patches, also surface the first-principles best-shape option, including a root-cause redesign, in the Suggestion or recommended text. Do not collapse options to one editorial favorite. Mark which option, if any, is the first-principles solution so downstream cards can label it.
- Handlers (`fixme-handle-spec-review`, `fixme-handle-plan-review`, `fixme-handle-code-review`): when designing a `FIX` Approach or Specification update, choose the simplest-best shape per this rubric and show why it wins on the design axes. Escalate material, indeterminate redesign-vs-patch tradeoffs as `FIX_UNCLEAR`, with the simplest-best shape recommended and marked as the baseline when it qualifies.
- PR comment analysis (`fixme-pr-comments`): when scoping a fix, choose the simplest-best shape. A fix that warrants broader root-cause work is the correct `PLAN_REQUIRED` route, not scope creep.
- Plan writer revision (`fixme-write-plan`): the First-Principles Expansion Gate is governed by this rubric's target shape. Implement the handler's chosen shape; never substitute a smaller band-aid.
- Research (`fixme-research`): approach candidates must include the simplest-best root-cause shape, ranked on the design axes alongside feasibility, not only the least-effort routes.
