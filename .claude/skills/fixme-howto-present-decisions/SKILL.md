---
name: fixme-howto-present-decisions
description: Shared decision presentation guidelines for the fixme pipeline. Defines the canonical format for ASK_USER and FIX_UNCLEAR decision blocks presented to users. Preloaded into handler agents via skills frontmatter.
---

# Decision Presentation Guidelines

These guidelines govern how `ASK_USER` and `FIX_UNCLEAR` items are presented to users for decision-making. Every skill that produces or presents decisions MUST follow this format.

The output is a decision card: a compact, self-contained block optimized for fast re-entry after context switching. It must guide the user from the high-level situation to the concrete tradeoff before asking them to choose.

## Core Principle

The Recommendation and Decision needed fields are what the user reads first. They must let the user understand the situation, compare the real choices, and respond without re-reading the finding, plan, or code.

Use **top-down progressive disclosure**:

1. State the recommendation.
2. State the decision.
3. Add an at-a-glance block that explains where we are, what problem we are solving, what breaks if we do nothing, and why the decision matters now.
4. Give only the context and evidence needed to understand the recommendation.
5. Present options as visually separated mini-cards.
6. Repeat the same recommendation after options, followed by rationale.

## Decision Types

Pick the format by the user's cognitive task, not blindly by the handler label.

### ASK_USER

Use `ASK_USER` when the handler cannot safely decide whether the finding is valid, in scope, already handled by a locked decision, or intentionally acceptable.

The user's task is adjudication: "is this a real issue for this project?"

Optimize the block for evidence:

- what makes the issue look real
- what makes it questionable
- what verdict you recommend

Options are optional for `ASK_USER`. Include options only when the user must choose between materially different directions such as fix, defer, or reject.

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

1. What do you recommend?
2. What does the user need to decide?
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

**Recommendation**: {specific recommendation}

**Decision needed**: {one sentence}

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

### Option A: {option name}

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
- **Put `Recommendation` immediately after the decision title.** Do not make the user read the whole card before seeing the recommended path.
- **Use `At a glance` for orientation.** It must contain Context, Problem, Impact, and Why now in that order.
- **Use option headings** (`### Option A: ...`) for every option. Do not compress options into one dense bullet list.
- **Make option fields visually repeatable.** Every option uses the same field order: What, How it solves the issue, Pros, Cons, Tradeoff, Effort.
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with absolute path and line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.
- **No markdown tables.** Represent comparisons as option bullets.
- **No preamble before the first decision card.** Workflow status ("only D1 is blocking", "PR #2-#6 don't change the count", "we are paused inside Step 6") goes in a separate status line above all cards or is omitted entirely. It must never appear inside or immediately above a card. If multiple cards are presented together, do not insert workflow-status sentences between them either.

## Length Budget

Default budget:

- Opening block: exactly 3 fields after the title: `Recommendation`, `Decision needed`, `At a glance`.
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

- **All 6 option fields are mandatory and exhaustive** for every option: What, How it solves the issue, Pros, Cons, Tradeoff, Effort. Do not invent additional fields like "Product impact", "Complexity", "Risk", or "Why now". If a field would have the same value across all options (e.g. "Product impact: user-facing fallback remains unchanged" repeated for every option), it is filler and must not appear at all.
- **Options are mandatory** for `FIX_UNCLEAR`.
- **Options are optional** for `ASK_USER`. Include them only when there are genuinely different directions.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options.** When Option B's main advantage is that it avoids Option A's biggest downside, say so explicitly. Do not make the reader connect the dots.
- **Dropping the fix is a default option to consider, not an afterthought.** Before listing fix-shape options, ask whether keeping current behavior is viable. For MINOR or INFO severity findings, "accept current behavior" must appear as an option unless there is a specific named reason it cannot. Frame it with the same 6 sub-fields as the fix options so the user can compare it on equal footing.

## Recommendation Rules

- **Recommendation is mandatory.** Always. No exceptions.
- **Every decision card starts with a recommendation.** Put it immediately after the title.
- **Option decisions get two recommendation lines.** Put the same recommendation after the title and after options.
- **Spell out the recommendation before the option label.** Use `Choose Convex paginated result (Option A)`, not `Option A`.
- **The pre-options recommendation must never be only an option label.** It must name the concrete choice and then include the label in parentheses.
- **The top recommendation and post-options recommendation must match exactly.** Do not recommend one option before the list and a different wording after the list.
- **Research before recommending.** Read code, check docs, trace call paths. Never recommend based on general preference.
- **Show only decisive work.** Include evidence that changes the recommendation. Omit non-decisive detail or move it to `Details`.
- **Cross-reference the Options section.** Name which upsides are decisive and which downsides are acceptable. Do not just restate the option description.
- **Grounded in specifics.** Reference actual code, API behavior, data volumes, or user-facing impact from THIS codebase. "This is more scalable" without evidence is not acceptable.

## Quality Bar

- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: recommendation first, then the decision, then the mental model, then the concrete tension, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with absolute path and line numbers. No exceptions.
- **Actionable**: the `Acceptance` line must tell the user exactly how to reply.

## Example

```md
## D1: Agent Gallery Result Shape

**Recommendation**: Choose Convex paginated result (Option A).

**Decision needed**: Choose the return shape for the Convex Agent gallery query.

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

### Option A: Convex paginated result

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
