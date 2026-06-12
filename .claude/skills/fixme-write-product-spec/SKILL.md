---
name: fixme-write-product-spec
description: Write product specifications that define user-facing behavior and product intent without implementation details. Reads relevant context and current behavior, reuses the fixme-howto-write-product-spec rubric, writes only product specification documents, and supports fresh, specification revision, and rewrite modes.
argument-hint: "<feature description or path to source material>"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixmeDir` from the JSON. Never use a literal `.fixme/` path in any tool.

## Task-Bound User Input Contract

When the dispatch prompt contains `<task-state-owner>` with `ownerSkill: fixme-task`, this skill is running under a resumable `fixme-task`.

Do not call AskUserQuestion or wait directly when running under `fixme-task`. If product behavior is unclear or a FIX item conflicts with a locked decision, return `FIXME_CHILD_ATTENTION_REQUIRED` as the final output and let `fixme-task` create the durable attention record:

```text
FIXME_CHILD_ATTENTION_REQUIRED
SOURCE_SKILL: fixme-write-product-spec
KIND: spec-decision
ANSWER_MODE: decision-card
PROMPT_MARKDOWN:
<complete user-facing prompt>
END_PROMPT_MARKDOWN
```

Do not write `<fixme-dir>/decisions.md`; `fixme-task` owns decision persistence and resume.

## Producer Continuation Resume Contract

Live context is an optimization cache only. Re-read the current authoritative artifacts named in the prompt and in this skill workflow before writing or acting on every resume.

Durable artifacts, source files, task state, current review findings, current decisions, and current prompt inputs override remembered context. If remembered context conflicts with current artifacts and the conflict cannot be reconciled safely, do not proceed from memory.

Output this directive before any normal completion directive:

```text
PRODUCER_CONTINUATION_REJECTED
REASON: <artifact-conflict|missing-authoritative-artifact|stale-plan|runtime-state-invalid|other>
DETAILS: <short concrete explanation>
```

Do not ask the user directly. If user input is genuinely required and `<task-state-owner>` is present, use `FIXME_CHILD_ATTENTION_REQUIRED` according to the existing task-bound contract.

# Write Product Specification

Write a product specification that defines what the feature does, why it exists, and how users experience it. The specification is the only output file - no source code modifications allowed.

## Hard Constraints

- **NO source code modifications.** Only create or edit product specification documents.
- **NO implementation details.** Product specifications must not include APIs, schemas, components, functions, architecture, packages, or implementation steps.
- **NO unresolved questions in the final specification.** If a product behavior is unclear, resolve it through the Task-Bound User Input Contract when running under `fixme-task`; standalone runs can ask the user before finalizing.
- **NO assumptions.** Product behavior must come from user input, source material, existing user-visible behavior, or explicit user decisions.
- **NO tables by default.** Follow `fixme-howto-write-product-spec` and use bullets for scan-friendly output.

## Input Resolution

Detect mode from provided inputs:

### Fresh Mode

No previous product specification provided. Resolve inputs in this order:

1. **Argument**: if a file path or feature description is passed, use it.
2. **IDE context**: if the user has source material open or selected, use it.
3. **Conversation context**: if requirements were discussed, use them.
4. **Fixme context**: if dispatched from a ticket, inspect the ticket folder for an explicitly named product brief, request, or specification source.
5. **Ask**: prompt the user for the feature or behavior to specify.

### Specification Revision Mode

Triggered when the orchestrator provides: previous product specification path + specification review FIX items.

Required inputs:

- **Original request**: unchanged product request or feature description
- **Previous product specification path**: the specification being revised
- **Review context packet**: compact current-run decisions, fixes since last review, and source references
- **FIX items**: classified findings from `fixme-handle-spec-review`
- **Decision log path**: task-bound runs call `task decision list --state <task-state-path> --format markdown` and read the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly (may not exist)

### Rewrite Mode

Triggered when a previous product specification exists but no structured review FIX items are provided. The user wants the specification improved, clarified, or reformatted.

Inputs:

- **Original request**: unchanged product request or feature description, if available
- **Previous product specification path**: the specification to improve
- **Decision log path**: task-bound runs call `task decision list --state <task-state-path> --format markdown` and read the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly (may not exist)

## Before Writing

### Shared Rubric

Follow `fixme-howto-write-product-spec` exactly. If it was not preloaded, read `~/.claude/skills/fixme-howto-write-product-spec/SKILL.md` or `~/.codex/skills/fixme-howto-write-product-spec/SKILL.md`.

Follow `fixme-howto-present-decisions` for every user-facing decision. Do not emit free-form questions when a decision card is required.

### Fresh Mode Context

Read enough context to understand product behavior:

- user request, ticket, existing product docs, designs, screenshots, and decision log
- current user-visible behavior in code when relevant
- neighboring flows, roles, permissions, empty states, error states, and legacy behavior

Use code only to understand observable behavior. Do not transfer code structure into the product specification.

### Revision and Rewrite Context

1. Read the full previous product specification.
2. Read the review context packet if provided. Use it for current-run user decisions, all fixes since last review, and source references. It is orientation, not authority.
3. Read the decision log. Under a task-bound `fixme-task` (a `<task-state-owner>` block is present), obtain locked decisions by calling `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task decision list --state <task-state-path> --format markdown` and reading the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly if it exists.
4. In revision mode, read every FIX item and the cited specification sections.
5. Carry forward all confirmed and assumed decisions unless the user explicitly changes them.
6. If a FIX item conflicts with a locked decision, resolve it with a decision card through the Task-Bound User Input Contract when running under `fixme-task`; standalone runs can ask the user directly.
7. Never silently drop a FIX item. Address it in the revised specification or route the conflict for user resolution.

## Product Decision Gate

Before writing the final specification, identify product choices that materially affect behavior:

- scope, target users, or roles
- permission and ownership behavior
- user-visible states, copy, recovery, or compatibility behavior
- deletion, migration, or replacement of old product concepts
- acceptance criteria that could be interpreted multiple ways

Apply the Decision Eligibility Gate from `fixme-howto-present-decisions` to each choice before presenting it. A choice is a genuine product decision only when all three gate conditions hold: more than one outcome survives the hard constraints (here the request, product source material, established product behavior, and locked decisions); the survivors differ observably (behavior-identical or strictly-dominated survivors are not material); and the best survivor needs product intent, priority, ownership, or risk tolerance rather than evidence to choose. Reconciliation instance: when product copy or a documented behavior diverges from shipped-and-tested reality under a sync rule, reconciling it to reality is a determined edit, not a decision, unless the divergence implies the shipped behavior itself is wrong. If a choice passes the gate, present it with `fixme-howto-present-decisions`; when running under `fixme-task`, return it through `FIXME_CHILD_ATTENTION_REQUIRED`; standalone runs can wait for the answer directly. Record the answer in the specification's Source Material and Decisions or Purpose and Scope section, whichever fits the document shape. If a choice fails the gate, resolve it directly and record it as source material, not as a decision.

## Save Location

Save product specifications to:

```text
<fixme-dir>/specs/product/<date>-<feature-name>.md
```

Use ISO date format: `YYYY-MM-DD`. Use a short slug for `<feature-name>`.

In specification revision or rewrite mode, overwrite the existing specification file unless the user explicitly asks for a new file.

## Output Document

Use the document shape from `fixme-howto-write-product-spec`.

The specification must include:

- frontmatter with title, date_created, last_updated, and tags
- purpose and scope
- definitions when needed
- users, roles, and permissions when relevant
- user journeys
- product requirements with stable IDs
- states, messages, edge cases, and error states
- acceptance criteria
- out-of-scope items

Omit irrelevant sections rather than padding the document.

## Final Check Before Saving

Before saving, verify:

- every declared user action has one expected product outcome
- every role, permission, state, edge case, and recovery path is specified when relevant
- every requirement is observable and testable without reading implementation
- no implementation details leaked into the document
- every review FIX item is addressed or escalated
- no open questions remain
- the specification should pass `fixme-review-spec`

## Output Rules

- Write only the product specification file.
- After saving, output the specification path and a short summary.
- Do not echo the full specification unless the user asks.
- End with `SPEC_PATH: <absolute path to specification>`.
