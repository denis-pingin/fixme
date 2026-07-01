---
name: fixme-howto-present-decisions
description: Shared decision presentation guidelines for the fixme pipeline. Defines the canonical format for ASK_USER and FIX_UNCLEAR decision blocks presented to users. Preloaded into handler agents via skills frontmatter.
---

# Decision Presentation Guidelines

These guidelines own two responsibilities: (1) whether an item is a genuine user decision at all, defined by the Decision Eligibility Gate below, and (2) how a genuine decision is presented once it qualifies. Every skill that classifies, produces, or presents user-facing decision prompts MUST apply the Decision Eligibility Gate before emitting a card and MUST follow this presentation format for cards that pass the gate.

Transport is owned by the caller. This skill defines both decision eligibility (the Decision Eligibility Gate) and decision-card content and format. Task-bound runs under `fixme-task` use the Task-Bound User Input Contract and durable attention; standalone or directly user-facing runs may render the decision directly through their normal prompt mechanism.

## Boundary Delivery Contract

A decision card, or any user-facing pause prompt, is only useful if it reaches the user exactly as written. The instruction governing the artifact must travel with the artifact across every boundary, on the channel every parent is guaranteed to read.

Rules for any skill that relays or renders a stored prompt:

- Render `promptMarkdown` verbatim to the user. Do not summarize, rephrase, compress, reformat, or reclassify it, and do not answer it on the user's behalf.
- The safest delivery is durable storage rendered by a broker. A dispatched producer or orchestrator that has a top-level-interactive or liveness signal must store the prompt durably (attention mode) so a broker renders it from storage, instead of returning it as ordinary text a generic relay may summarize.
- When durable storage is unavailable (no liveness signal), the returned message itself must carry the verbatim instruction with the payload, wrapped in an explicit envelope:

  ```text
  FIXME_USER_PROMPT (render verbatim to the user; do not summarize, rephrase, or compress):
  <full promptMarkdown>
  END_FIXME_USER_PROMPT
  ```

- The envelope is a best-effort floor, not a guarantee: a generic relay can still ignore a text marker, so durable storage is always preferred when a liveness signal is present.
- This contract covers every user-facing pause prompt (decision cards, loop-guard escalations, agent escalations), keyed at the single point where the prompt would otherwise be returned as ordinary text. The informational Run Summary is out of scope here; its fidelity is handled by parent-driven or top-level mode, not by this envelope.

These guidelines do not define the persisted format for final product specifications, technical specifications, implementation plans, review reports, or other saved artifacts unless that artifact's owning skill explicitly opts into decision cards. Saved artifacts should record resolved decisions in their own document format.

The output is a decision card: a compact, self-contained block optimized for fast re-entry after context switching. It must guide the user from the high-level situation to the concrete tradeoff before asking them to choose.

## Decision Eligibility Gate

Apply this gate at classification time, before deciding to emit any decision card. An unnecessary escalation is not free: it forces the user into a cold context reload and trains the user to rubber-stamp cards, which destroys the signal value of genuine decisions. Treat an unnecessary escalation as a defect of equal weight to a silently chosen wrong fix. Asking is not free; choose escalation only when this gate proves a real decision exists.

An item is a genuine user decision only if ALL THREE conditions hold:

1. **Plurality after constraints.** More than one outcome survives the hard constraints. Hard constraints are the project rules (including artifact-sync and lockstep rules), locked decisions, specification and contract text, shipped-and-tested behavior, correctness, and safety. For authoring surfaces with no shipped behavior yet, the hard constraints are the request, the product specification, the source material, and the locked decisions. If exactly one outcome survives, the item is determined: classify it as a fix or follow-up (or reject), not a decision.

2. **Materiality.** The surviving outcomes differ in observable behavior, persisted data, cost, risk, scope, or reversibility. Outcomes that are behavior-identical, contract-identical, or strictly dominated by another survivor are not material: pick the best one and classify it as a fix.

3. **Indeterminacy.** The best survivor cannot be chosen from rules and evidence alone; it requires product intent, priority, taste, ownership, or risk tolerance. If the available evidence can choose the winner, classify it as a fix with that choice. A consumer may define a named transparency escalation that survives this condition even when evidence picks a winner - see the fixme-handle-plan-review [assumed]-decision rule; this gate does not override such named exceptions.

Only when all three conditions hold does the item escalate as a decision: use `ASK_USER` when validity or scope is indeterminate, or `FIX_UNCLEAR` when the approach is indeterminate among material survivors.

**Fail-safe direction:** when the surviving outcomes are not material (behavior-identical or strictly dominated), classify the item as a fix even under uncertainty - there is nothing to decide. Uncertainty justifies escalation only when the outcomes are both material AND indeterminate.

**Reconciliation instance:** a project rule that mandates two artifacts stay in sync (for example a same-change spec/code lockstep rule) is a hard constraint. When a doc, spec, or comment diverges from shipped-and-tested reality, reconciling the stale artifact to reality is a determined fix, not a decision - UNLESS the divergence implies the shipped behavior itself is wrong, in which case "which side is correct" is material and indeterminate and escalates as `ASK_USER`.

Before using `ASK_USER` or `FIX_UNCLEAR`, identify the real user task:

- If the agent can safely determine the next action from facts and workflow rules, proceed and present a compact status block if useful.
- If only one path is eligible after hard constraints are applied (condition 1 fails), present that path directly. Do not manufacture alternatives.
- If the workflow is blocked because a fact is unknown, present a compact evidence gate with `Cause`, `Evidence`, `Blocked by`, and `Next`. Do not add option cards unless the user must choose between genuinely different safe actions.
- If every "con" is just an expected mechanism of the recommended action, such as "force-push rewrites the branch ref" during a rebase, the option shape is wrong. State the mechanism under `Safety` or `Impact`, not as a downside.

## Core Principle

The Decision needed and Recommendation fields are what the user reads first. They must let the user understand the situation, compare the real choices, and respond without re-reading the finding, plan, or code.

Use **top-down progressive disclosure**:

1. State the decision.
2. State the recommendation.
3. Add an at-a-glance block that explains where we are, what problem we are solving, what breaks if we do nothing, and why the decision matters now.
4. Give only the context and evidence needed to understand the recommendation.
5. Present options as visually separated mini-cards.
6. Repeat the same recommendation after options, followed by rationale.

## Decision Types

Pick the format by the user's cognitive task, not blindly by the handler label.

### Eligibility Before Cards

Do not emit a decision card just because the workflow paused. Apply the `## Decision Eligibility Gate` above first: an item qualifies as a decision only when all three conditions (plurality after constraints, materiality, indeterminacy) hold. If the gate fails, classify the item as a fix or follow-up and present a compact status or evidence block instead of option cards.

### ASK_USER

Use `ASK_USER` when the handler cannot safely decide whether the finding is valid, in scope, already handled by a locked decision, or intentionally acceptable.

The user's task is adjudication: "is this a real issue for this project?"

Optimize the block for evidence:

- what makes the issue look real
- what makes it questionable
- what verdict you recommend

Options are optional for `ASK_USER`. Include options only when the user must choose between materially different directions such as fix, defer, or reject.

### Edge-Case Validity Decisions

Edge-case validity questions ask whether the reported state should be supported, rejected earlier, or treated as impossible under the current contract.

Use this shape when an edge case is technically plausible but the product, domain, API, or state-machine contract does not clearly say whether it belongs in supported behavior. The decision must be phrased as support/scope first, not as an implementation proposal. Ask "Should this state be supported?" before presenting any fix shape.

### FIX_UNCLEAR

Use `FIX_UNCLEAR` when the finding is valid but multiple reasonable fix paths exist.

The user's task is choice: "which tradeoff should we take?"

Optimize the block for option comparison:

- what changes in each option
- what each option improves
- what each option costs
- which option you recommend

Options are mandatory for `FIX_UNCLEAR`.

### Mismatched Labels

If an `ASK_USER` item is actually an approach choice, use the `FIX_UNCLEAR` shape. If a `FIX_UNCLEAR` item depends on whether the finding is valid, lead with `ASK_USER` evidence before presenting options.

`FIX_UNCLEAR` is not an `ASK_USER` classification, but it requires the same user-input route. Any handler output with one or more `FIX_UNCLEAR` items must route to user decision batching, never to clean/no-fix exit.

## Ping Before Printing

Before emitting any decision card to the user, fire one `user_input` alert so the user knows the workflow is waiting:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input
```

If you are emitting multiple decision cards in a single response, ping once at the start of that response. Do NOT ping per-card. The alert is fire-and-forget and never blocks; if alerts are disabled or the platform is unsupported, the command silently no-ops.

## Visual Layout Contract

Decision cards must read like designed cards, not logs.

The first visible block must answer, in order:

1. What does the user need to decide?
2. What do you recommend?
3. What context, problem, impact, and urgency make the decision necessary?

Use this visual rhythm:

- Blank line before every major section.
- Bold label on its own line.
- Blank line after the label when the content is more than one sentence.
- One idea per line.
- Horizontal rule (`---`) between separate decision cards.

Do not place more than one sentence after a bold label. If a label needs more explanation, put the label on its own line, add a blank line, then write a short paragraph.

Each option is a mini-card. Use an option heading, then the same field order for every option so the eye can compare them without re-parsing the structure.

## Decision Card Structure

Every decision card starts with the same fast-orientation header:

```md
## D{number}: {short descriptive title}

**Decision needed**: {one sentence}

**Recommendation**: {specific recommendation}

**At a glance**:

- **Context**: {where we are in the product, workflow, or system}
- **Problem**: {the concrete issue or ambiguity}
- **Impact**: {what breaks, degrades, or remains blocked if undecided}
- **Why now**: {what this decision unlocks or prevents}
```

Then add the body that fits the decision type.

`Why now` must explain what makes this PR/phase the right place to act, not the workflow's own pause. "The workflow is waiting on this decision" or "the reviewer left a comment" are circular and not valid - the workflow paused BECAUSE this was routed for input. Valid reasons: reviewer-blocking pressure on this PR, cohesion with files already touched in this PR's diff, or concrete operational/correctness pain that justifies acting now over deferring. If none apply, the item probably belongs in follow-up, not in a decision card.

### ASK_USER Body

Use this body when the decision is about validity or scope:

```md
**Context**:

- {fact needed to understand the issue}
- {fact needed to understand the surrounding system}
- {clickable file reference with line number}

**Impact if not fixed**:

{one sentence. Required when the decision is about a reported issue. Omit only when the decision is not about a reported issue.}

**Evidence**:

- **For real issue**: {decisive evidence that supports the finding}
- **Against real issue**: {decisive evidence that weakens or explains away the finding}

**Recommendation**: {plain-language verdict first, option label only in parentheses if options exist}

**Rationale**:

{why the recommendation follows from the evidence}

**Acceptance**:

Reply `{expected response}`, or name the missing fact that would change the verdict.
```

### FIX_UNCLEAR Body

Use this body when the decision is about fix approach:

```md
**Context**:

- {fact needed to understand the issue}
- {fact needed to understand the existing code path}
- {clickable file reference with line number}

**Recommendation**: Choose {option name} (Option A/B/C)

**Options**:

If one option qualifies as the first-principles baseline under `fixme-howto-solution-shape`, place it first as Option A. The label string is owned by `fixme-howto-solution-shape`: `[First-principles baseline]`. Omit the label when no option qualifies.

### Option A: {option name} [First-principles baseline]

**What**: {one sentence naming the change}

**How it solves the issue**: {one sentence connecting the change to the reported issue or requirement}

**Pros**:

- {specific advantage grounded in this codebase}

**Cons**:

- {specific cost or risk grounded in this codebase}

**Tradeoff**: {the decisive cost or compromise of this option}

**Effort**: {trivial | small | moderate | significant}

### Option B: {option name}

**What**: {one sentence naming the change}

**How it solves the issue**: {one sentence connecting the change to the reported issue or requirement}

**Pros**:

- {specific advantage grounded in this codebase}

**Cons**:

- {specific cost or risk grounded in this codebase}

**Tradeoff**: {the decisive cost or compromise of this option}

**Effort**: {trivial | small | moderate | significant}

**Recommendation**: Choose {option name} (Option A/B/C)

**Rationale**:

{why the recommended option wins, referencing the decisive option tradeoffs}

**Acceptance**:

Reply `Approve {option}`, `Choose {option}`, or describe the preferred tradeoff.
```

Do not use markdown tables. Tables often render poorly in agent surfaces. Use compact option bullets instead.

## Formatting Rules (NON-NEGOTIABLE)

All decision output must be visually scannable. Dense walls of text are never acceptable.

- **Blank line between every section, heading, and paragraph.** No two content blocks should be adjacent without a separator.
- **Use decision numbers** (`D1`, `D2`, etc.) in headings so multiple decisions can be referenced unambiguously.
- **Use horizontal rules** (`---`) between independent decision blocks when presenting multiple decisions.
- **Bold key labels** (`**Decision needed**:`, `**Recommendation**:`, etc.) and start each on its own line.
- **Put `Decision needed` immediately after the decision title, then `Recommendation` right after it.** Do not make the user read the whole card before seeing what they must decide and the recommended path.
- **Use `At a glance` for orientation.** It must contain Context, Problem, Impact, and Why now in that order.
- **Use option headings** (`### Option A: ...`) for every option. Do not compress options into one dense bullet list.
- **Make option fields visually repeatable.** Every option uses the same field order: What, How it solves the issue, Pros, Cons, Tradeoff, Effort.
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with absolute path and line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.
- **No markdown tables.** Represent comparisons as option bullets.
- **No preamble before the first decision card.** Workflow status ("only D1 is blocking", "PR #2-#6 don't change the count", "we are paused inside Step 6") goes in a separate status line above all cards or is omitted entirely. It must never appear inside or immediately above a card. If multiple cards are presented together, do not insert workflow-status sentences between them either.

## Length Budget

Default budget:

- Opening block: exactly 3 fields after the title: `Decision needed`, `Recommendation`, `At a glance`.
- At a glance: exactly 4 bullets: Context, Problem, Impact, Why now.
- Context: max 5 bullets.
- Impact if not fixed: one sentence, only for reported issues.
- Evidence: max 2 bullets for `For real issue` and max 2 bullets for `Against real issue`.
- Top recommendation: one sentence.
- Options: max 4 options.
- Option fields: one short `What` line, one short `How it solves the issue` line, 1-2 `Pros` bullets, 1-2 `Cons` bullets, one `Tradeoff` line, and one `Effort` line.
- Post-options recommendation: one sentence after `Evidence` for `ASK_USER`, or after `Options` for `FIX_UNCLEAR`.
- Rationale: one short paragraph or max 4 bullets.
- Acceptance: one line.

If the decision cannot fit this budget, keep the opening block, options, and recommendation compact, then add a `Details` section after `Acceptance`. Put only non-decisive supporting detail there.

## Option Rules

- **Do not invent costs to fill the format.** A `Cons` bullet must name a real cost, risk, ownership burden, regression risk, user-visible downside, or irreversible effect. Expected mechanics, already-mitigated safety steps, and normal workflow consequences are not cons.
- **All 6 option fields are mandatory and exhaustive** for every option: What, How it solves the issue, Pros, Cons, Tradeoff, Effort. Do not invent additional fields like "Product impact", "Complexity", "Risk", or "Why now". If a field would have the same value across all options (e.g. "Product impact: user-facing fallback remains unchanged" repeated for every option), it is filler and must not appear at all.
- **Options are mandatory** for `FIX_UNCLEAR`.
- **Options are optional** for `ASK_USER`. Include them only when there are genuinely different directions.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options.** When Option B's main advantage is that it avoids Option A's biggest downside, say so explicitly. Do not make the reader connect the dots.
- **Dropping the fix is a default option to consider, not an afterthought - but only when it is a material survivor of the Decision Eligibility Gate.** Before listing fix-shape options, ask whether keeping current behavior is viable AND survives the hard constraints. For MINOR or INFO severity findings whose "accept current behavior" outcome is eligible (it violates no project rule, locked decision, or shipped-and-tested contract) and materially differs from the fix outcomes, "accept current behavior" must appear as an option, framed with the same 6 sub-fields so the user can compare it on equal footing. Do not add "accept current behavior" as a strictly-dominated filler option when a hard constraint already rules it out.
- **A root-cause / redesign shape is a default option to consider when options are competing solution shapes.** If one option is the first-principles baseline from `fixme-howto-solution-shape`, place it first as Option A and tag it. Alternatives appear only when each has a real named benefit over the baseline; otherwise they are strictly dominated and should be dropped.

## Recommendation Rules

- **Recommendation is mandatory.** Always. No exceptions.
- **When a first-principles baseline is tagged, the recommendation defaults to the first-principles baseline.** Recommend an alternative only when its named benefit is decisive, and explain why that benefit is worth the added tradeoff under `fixme-howto-solution-shape`.
- **Every decision card surfaces the recommendation near the top.** Put it immediately after the `Decision needed` line.
- **Option decisions get two recommendation lines.** Put the same recommendation in the opening block and after options.
- **Spell out the recommendation before the option label.** Use `Choose Convex paginated result (Option A)`, not `Option A`.
- **The pre-options recommendation must never be only an option label.** It must name the concrete choice and then include the label in parentheses.
- **The top recommendation and post-options recommendation must match exactly.** Do not recommend one option before the list and a different wording after the list.
- **Research before recommending.** Read code, check docs, trace call paths. Never recommend based on general preference.
- **Show only decisive work.** Include evidence that changes the recommendation. Omit non-decisive detail or move it to `Details`.
- **Cross-reference the Options section.** Name which upsides are decisive and which downsides are acceptable. Do not just restate the option description.
- **Grounded in specifics.** Reference actual code, API behavior, data volumes, or user-facing impact from THIS codebase. "This is more scalable" without evidence is not acceptable.

## Quality Bar

- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: decision first, then the recommendation, then the mental model, then the concrete tension, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with absolute path and line numbers. No exceptions.
- **Actionable**: the `Acceptance` line must tell the user exactly how to reply.

## Example

```md
## D1: Agent Gallery Result Shape

**Decision needed**: Choose the return shape for the Convex Agent gallery query.

**Recommendation**: Choose Convex paginated result (Option A).

**At a glance**:

- **Context**: The Agent gallery is moving from a static list to a mobile-friendly paginated feed.
- **Problem**: The specification does not define the result container the mobile hook should consume.
- **Impact**: The mobile hook and tests cannot agree on what the query returns.
- **Why now**: Mobile pagination cannot be implemented or tested until the query result contract is fixed.

**Context**:

- The spec defines `AgentGalleryQueryArgs` and `AgentGalleryItem`, but not the result container.
- The current mobile Agent hook already consumes Convex pagination through `usePaginatedQuery`.
- The gap is in [alp-183-agent-format-gallery.md:298](/absolute/path/alp-183-agent-format-gallery.md#L298).

**Options**:

In this example, Option A is tagged because the current hook already consumes Convex pagination and no adapter layer is needed.

### Option A: Convex paginated result [First-principles baseline]

**What**: Define the result as `{ page, isDone, continueCursor }`.

**How it solves the issue**: It gives the mobile hook the exact fields Convex pagination already returns.

**Pros**:

- Matches the current `usePaginatedQuery` integration.
- Avoids adapter code between the query and the hook.

**Cons**:

- Leaks Convex naming into the technical contract.

**Tradeoff**: Accepts Convex-specific names to avoid unnecessary adapter code.

**Effort**: trivial

### Option B: Custom API-like result

**What**: Define the result as `{ items, nextCursor }`.

**How it solves the issue**: It gives the gallery a domain-shaped contract independent of Convex naming.

**Pros**:

- Keeps the specification cleaner if the backing store changes later.

**Cons**:

- Requires adapter logic around Convex pagination.
- Avoids Option A's naming leak, but adds a translation layer the current hook does not need.

**Tradeoff**: Improves abstraction at the cost of extra code in a path that already uses Convex pagination.

**Effort**: small

**Recommendation**: Choose Convex paginated result (Option A).

**Rationale**:

Convex paginated result wins because this gallery is explicitly Convex-backed and the existing mobile hook already speaks Convex pagination. Custom API-like result improves naming, but its adapter cost does not buy enough flexibility for this path.

**Acceptance**:

Reply `Approve A`, `Choose B`, or describe the preferred result shape.
```
