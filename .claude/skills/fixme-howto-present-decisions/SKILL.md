---
name: fixme-howto-present-decisions
description: Shared decision presentation guidelines for the fixme pipeline. Defines the canonical format for ASK_USER and FIX_UNCLEAR decision blocks presented to users. Preloaded into handler agents via skills frontmatter.
---

# Decision Presentation Guidelines

These guidelines govern how ASK_USER and FIX_UNCLEAR items are presented to users for decision-making. Every skill that produces or presents decisions MUST follow this format.

For ASK_USER, the decision is about validity ("is this a real issue?"). For FIX_UNCLEAR, the decision is about approach ("how should we fix this?").

## Core Principle

The Question field is what the user reads to make a decision. It must be **self-contained** - the user should understand the situation and be able to decide without re-reading the finding, the plan, or the code.

Follow **top-down progressive disclosure**: lead with context (establish the domain and mental model), state what needs deciding, then provide the details needed to decide well.

## Decision Block Structure

Format ASK_USER and FIX_UNCLEAR Question fields as structured decision blocks:

```
## Decision: {short descriptive title}

**Context**: {Establish WHERE in the system this happens - the feature, component, or
module involved. Build just enough mental model for the reader to understand the question.
Define any non-obvious concepts before referencing them. Include clickable file references
with line numbers (e.g., `[auth.ts:42](/absolute/path/auth.ts#L42)`) for every
file/line mentioned.}

**The question**: {One clear statement of what specifically needs to be decided. Not a
paragraph - one or two sentences max.}

**Options**:

1. **{Option A name}**
   - Approach: {what this looks like concretely - files, patterns, APIs involved}
   - Pros: {specific advantages grounded in this codebase, not generic platitudes}
   - Cons: {specific disadvantages grounded in this codebase}
   - Impact: {effects on performance, UX, maintainability, security - only dimensions
     that actually differ between options}
   - Effort: {relative cost to implement - "trivial", "small", "moderate", "significant"}

2. **{Option B name}**
   - Approach: {same structure - cross-reference option A where the contrast matters}
   - Pros: ...
   - Cons: ...
   - Impact: ...
   - Effort: ...

{...more options if genuinely distinct - not variations of the same thing}

**Recommendation**: Option {X}.

{State what you investigated to reach this conclusion - which code you read, what
behavior you traced, what documentation you checked. Then explain WHY this option wins
given the specific tradeoffs above. Cross-reference the Options: name which Pros are
decisive, which Cons are acceptable, how Impact differs. The reasoning must be grounded
in THIS codebase and THIS situation - not generic preference.

The user should be able to just say "yes" if they agree, or disagree with specific
reasoning if they don't.}
```

## Formatting Rules (NON-NEGOTIABLE)

All decision output must be visually scannable. Dense walls of text are never acceptable.

- **Blank line between every section, heading, and paragraph.** No two content blocks should be adjacent without a separator.
- **Use headings** (`##`, `###`) to separate major sections. The user must be able to skim headings to find what they need.
- **Use horizontal rules** (`---`) between independent decision blocks when presenting multiple decisions.
- **Bold key labels** (`**Context**:`, `**The question**:`, etc.) and start each on its own line.
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with absolute path and line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.

## Option Rules

- **All 5 sub-fields are mandatory** for every option: Approach, Pros, Cons, Impact, Effort. If Impact is identical across all options, say "Same as Option A" rather than omitting.
- **Options are mandatory** for FIX_UNCLEAR. For ASK_USER, include options when there are genuinely different directions (fix vs. defer vs. ignore). When the question is purely "is this a real issue?", you can omit Options and instead present the evidence for and against under Context.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options.** When Option B's main advantage is that it avoids Option A's biggest con, say so explicitly. Don't make the reader connect the dots.

## Recommendation Rules

- **Recommendation is mandatory.** Always. No exceptions.
- **Research before recommending.** Read code, check docs, trace call paths. Never recommend based on general preference.
- **Show your work.** State what you investigated (files read, behavior traced, docs checked). The user needs to evaluate whether your research was sufficient.
- **Cross-reference the Options section.** Name which Pros are decisive and which Cons are acceptable. Don't just restate the option description.
- **Grounded in specifics.** Reference actual code, API behavior, data volumes, or user-facing impact from THIS codebase. "This is more scalable" without evidence is not acceptable.

## Quality Bar

- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: context and mental model first, then the question, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with absolute path and line numbers. No exceptions.
