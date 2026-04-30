---
name: fixme-howto-present-decisions
description: Shared decision presentation guidelines for the fixme pipeline. Defines the canonical format for ASK_USER and FIX_UNCLEAR decision blocks presented to users. Preloaded into handler agents via skills frontmatter.
---

# Decision Presentation Guidelines

These guidelines govern how `ASK_USER` and `FIX_UNCLEAR` items are presented to users for decision-making. Every skill that produces or presents decisions MUST follow this format.

The output is a decision card: a compact, self-contained block optimized for fast re-entry after context switching.

## Core Principle

The Question field is what the user reads to make a decision. It must let the user understand the situation, compare the real choices, and respond without re-reading the finding, plan, or code.

Use **top-down progressive disclosure**:

1. State the decision.
2. State the recommendation.
3. State why the decision matters now.
4. Give only the context and evidence needed to decide.
5. Put deeper detail after the recommendation only when necessary.

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

## Decision Card Structure

Every decision card starts with the same fast-orientation header:

```md
## D{number}: {short descriptive title}

**Decision needed**: {one sentence}

**Recommendation**: {Option A/B/C, yes/no, fix/reject/defer}

**Why now**: {one sentence explaining what this blocks or what risk it resolves}
```

Then add the body that fits the decision type.

### ASK_USER Body

Use this body when the decision is about validity or scope:

```md
**Context**:

- {fact needed to understand the issue}
- {fact needed to understand the surrounding system}
- {clickable file reference with line number}

**Evidence**:

- **For real issue**: {decisive evidence that supports the finding}
- **Against real issue**: {decisive evidence that weakens or explains away the finding}

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

**Options**:

- **A: {option name}**
  - Changes: {what changes concretely}
  - Upside: {specific advantage grounded in this codebase}
  - Downside: {specific cost or risk grounded in this codebase}
  - Effort: {trivial | small | moderate | significant}

- **B: {option name}**
  - Changes: {what changes concretely}
  - Upside: {specific advantage grounded in this codebase}
  - Downside: {specific cost or risk grounded in this codebase}
  - Effort: {trivial | small | moderate | significant}

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
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with absolute path and line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.
- **No markdown tables.** Represent comparisons as option bullets.

## Length Budget

Default budget:

- Header: exactly 3 fields after the title: `Decision needed`, `Recommendation`, `Why now`.
- Context: max 5 bullets.
- Evidence: max 2 bullets for `For real issue` and max 2 bullets for `Against real issue`.
- Options: max 4 options.
- Option fields: one line each for `Changes`, `Upside`, `Downside`, and `Effort`.
- Rationale: one short paragraph or max 4 bullets.
- Acceptance: one line.

If the decision cannot fit this budget, keep the header and recommendation compact, then add a `Details` section after `Acceptance`. Put only non-decisive supporting detail there.

## Option Rules

- **All 4 sub-fields are mandatory** for every option: Changes, Upside, Downside, Effort.
- **Options are mandatory** for `FIX_UNCLEAR`.
- **Options are optional** for `ASK_USER`. Include them only when there are genuinely different directions.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options.** When Option B's main advantage is that it avoids Option A's biggest downside, say so explicitly. Do not make the reader connect the dots.
- **Dropping the fix is an option when real.** If keeping the current behavior is viable, include it as an option with the same sub-fields.

## Recommendation Rules

- **Recommendation is mandatory.** Always. No exceptions.
- **Research before recommending.** Read code, check docs, trace call paths. Never recommend based on general preference.
- **Show only decisive work.** Include evidence that changes the recommendation. Omit non-decisive detail or move it to `Details`.
- **Cross-reference the Options section.** Name which upsides are decisive and which downsides are acceptable. Do not just restate the option description.
- **Grounded in specifics.** Reference actual code, API behavior, data volumes, or user-facing impact from THIS codebase. "This is more scalable" without evidence is not acceptable.

## Quality Bar

- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: context and mental model first, then the question, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with absolute path and line numbers. No exceptions.
- **Actionable**: the `Acceptance` line must tell the user exactly how to reply.
