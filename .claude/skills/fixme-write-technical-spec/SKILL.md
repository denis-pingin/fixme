---
name: fixme-write-technical-spec
description: Write technical specifications that turn product behavior into deterministic implementation contracts for architecture, interfaces, data, migrations, workflows, integrations, and validation. Reads the codebase thoroughly, reuses the fixme-howto-write-technical-spec rubric, writes only technical specification documents, and supports fresh, specification revision, and rewrite modes.
argument-hint: "<product specification, feature description, or path to source material>"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined once in `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter). Short version: when dispatched, use the `Fixme dir:` value from the `<project>` block of the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and read `fixmeDir` from the JSON. Never use a literal `.fixme/` path in any tool.

## Task-Bound User Input Contract

When the dispatch prompt contains `<task-state-owner>` with `ownerSkill: fixme-task`, this skill is running under a resumable `fixme-task`.

Do not call AskUserQuestion or wait directly when running under `fixme-task`. If product behavior, technical contract, or a stateful effect boundary is unclear, return `FIXME_CHILD_ATTENTION_REQUIRED` as the final output and let `fixme-task` create the durable attention record:

```text
FIXME_CHILD_ATTENTION_REQUIRED
SOURCE_SKILL: fixme-write-technical-spec
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

# Write Technical Specification

Write a technical specification that defines implementation contracts without becoming an implementation plan. The specification is the only output file - no source code modifications allowed.

## Hard Constraints

- **NO source code modifications.** Only create or edit technical specification documents.
- **NO product behavior changes.** Product behavior comes from the product specification, user request, ticket, or locked decisions.
- **NO implementation steps.** Technical specifications define contracts, not task-by-task execution.
- **NO unverified codebase claims.** Read the relevant code before naming patterns, modules, interfaces, data shapes, or commands.
- **NO unresolved questions in the final specification.** If a product or technical contract is unclear, resolve it through the Task-Bound User Input Contract when running under `fixme-task`; standalone runs can ask the user before finalizing.
- **NO tables by default.** Follow `fixme-howto-write-technical-spec` and use bullets plus fenced blocks for structured contracts.

## Input Resolution

Detect mode from provided inputs:

### Fresh Mode

No previous technical specification provided. Resolve inputs in this order:

1. **Argument**: if a product specification path, source-material path, or feature description is passed, use it.
2. **IDE context**: if the user has source material open or selected, use it.
3. **Conversation context**: if behavior or constraints were discussed, use them.
4. **Fixme context**: if dispatched from a ticket, inspect the ticket folder for an explicitly named product specification, technical brief, request, or prior specification.
5. **Ask**: prompt the user for the behavior or product specification to turn into a technical specification.

### Specification Revision Mode

Triggered when the orchestrator provides: previous technical specification path + specification review FIX items.

Required inputs:

- **Original request**: unchanged source behavior or product specification
- **Previous technical specification path**: the specification being revised
- **Review context packet**: compact current-run decisions, fixes since last review, and source references
- **FIX items**: classified findings from `fixme-handle-spec-review`
- **Decision log path**: task-bound runs call `task decision list --state <task-state-path> --format markdown` and read the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly (may not exist)

### Rewrite Mode

Triggered when a previous technical specification exists but no structured review FIX items are provided. The user wants the specification improved, clarified, or reformatted.

Inputs:

- **Original request**: unchanged source behavior or product specification, if available
- **Previous technical specification path**: the specification to improve
- **Decision log path**: task-bound runs call `task decision list --state <task-state-path> --format markdown` and read the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly (may not exist)

## Before Writing

### Shared Rubric

Follow `fixme-howto-write-technical-spec` exactly. If it was not preloaded, read `~/.claude/skills/fixme-howto-write-technical-spec/SKILL.md` or `~/.codex/skills/fixme-howto-write-technical-spec/SKILL.md`.

Follow `fixme-howto-present-decisions` for every user-facing decision. Do not emit free-form questions when a decision card is required.

### Fresh Mode Context

Read enough context to define deterministic contracts:

- product specification, user request, ticket, decision log, and related docs
- relevant source files and neighboring implementations
- current APIs, types, schemas, migrations, queues, jobs, integrations, and tests
- project commands and validation expectations from project docs
- dependency versions or API shapes only when they constrain the contract

Record source material inside the specification. Every codebase claim that affects the contract must be verified by reading the current code.

### Revision and Rewrite Context

1. Read the full previous technical specification.
2. Read the review context packet if provided. Use it for current-run user decisions, all fixes since last review, and source references. It is orientation, not authority.
3. Read the decision log. Under a task-bound `fixme-task` (a `<task-state-owner>` block is present), obtain locked decisions by calling `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task decision list --state <task-state-path> --format markdown` and reading the `markdown` field; standalone runs read `<fixme-dir>/decisions.md` directly if it exists.
4. In revision mode, read every FIX item and the cited specification sections.
5. Re-read any code referenced by the previous specification or FIX items when it affects the contract.
6. Carry forward all confirmed and assumed decisions unless the user explicitly changes them.
7. If a FIX item conflicts with a locked decision or product behavior, resolve it with a decision card through the Task-Bound User Input Contract when running under `fixme-task`; standalone runs can ask the user directly.
8. Never silently drop a FIX item. Address it in the revised specification or route the conflict for user resolution.

## Technical Decision Gate

Before writing the final specification, identify choices that materially affect the implementation contract:

- architecture or ownership boundaries
- interface shape, request/response contract, or error behavior
- source of truth, durable data shape, versioning, or migration path
- workflow trigger, locking, retry, replay, idempotency, or partial failure behavior
- stateful effect boundary, state meanings, source of truth, durable evidence, repeat behavior, advancement gate, or failure signal
- integration fallback, timeout, rate limit, or degraded behavior
- rollout, rollback, compatibility, observability, or validation strategy

Apply the Decision Eligibility Gate from `fixme-howto-present-decisions` to each choice before presenting it. A choice is a genuine technical decision only when all three gate conditions hold: more than one outcome survives the hard constraints (here the request, product specification, source material, locked decisions, and shipped-and-tested behavior); the survivors differ observably in contract, data, cost, risk, or reversibility (behavior-identical, contract-identical, or strictly-dominated survivors are not material); and the best survivor needs architecture intent, ownership, or risk tolerance rather than evidence to choose. If any hard constraint leaves exactly one eligible outcome, OR the survivors are behavior/contract-identical, OR the available evidence selects the best survivor (for example the codebase already has one established pattern), record the verified outcome as source material rather than a decision. If a choice passes the gate, present it with `fixme-howto-present-decisions`; when running under `fixme-task`, return it through `FIXME_CHILD_ATTENTION_REQUIRED`; standalone runs can wait for the answer directly.

Every stateful effect must have an Effect Lifecycle Contract. A stateful effect is any operation where correctness depends on more than local code returning a value, including state transitions, retries, jobs, queues, webhooks, cache invalidation, external APIs, durable writes, generated artifacts, public visibility, deletion, authorization, notifications, and deployment actions. If the contract cannot define the boundary, state meanings, source of truth, durable evidence, consumer path, repeat behavior, advancement gate, failure signal, and behavioral proof, resolve it through the Task-Bound User Input Contract when running under `fixme-task`; standalone runs can ask the user before finalizing.

## Save Location

Save technical specifications to:

```text
<fixme-dir>/specs/technical/<date>-<feature-name>.md
```

Use ISO date format: `YYYY-MM-DD`. Use a short slug for `<feature-name>`.

In specification revision or rewrite mode, overwrite the existing specification file unless the user explicitly asks for a new file.

## Output Document

Use the document shape from `fixme-howto-write-technical-spec`.

The specification must include:

- frontmatter with title, version or date, date_created, last_updated, owner when known, and tags
- purpose and scope
- source material and decisions
- definitions when needed
- architecture and ownership
- requirements, constraints, security, and observability requirements
- interfaces and data contracts
- persistence, migration, and backfill behavior
- workflow, concurrency, and failure semantics
- effect lifecycle contracts for every stateful effect
- dependencies and integration boundaries
- test and validation criteria
- rollout, compatibility, and operations
- out-of-scope items

Omit irrelevant sections rather than padding the document.

## Decision Formatting In Final Specifications

Decision cards are only for user-facing pauses before a decision is made.

Do not embed option-comparison decision cards in the final technical specification. In the final specification, record only resolved decisions that constrain implementation.

Use compact bullets:

```md
- **Decision**: [chosen implementation contract]
  - Rationale: [why this contract is required]
  - Source: [decision log, user answer, product specification, or verified code reference]
```

Omit rejected options unless they define an explicit out-of-scope boundary, compatibility constraint, or implementation prohibition.

## Final Check Before Saving

Before saving, verify:

- every product behavior has a technical owner or contract
- every interface, data, workflow, migration, and integration path has one valid implementation
- every failure mode has a specified outcome and observable signal
- every stateful effect has an Effect Lifecycle Contract with boundary, state meanings, source of truth, durable evidence, consumer path, repeat behavior, advancement gate, failure signal, and behavioral proof
- every terminal state, public visibility, deletion, acknowledgement, unlock, commit, publish, or irreversible transition names the exact proof that permits advancement
- every durable change has migration, rollback, and legacy behavior
- every contract maps to validation criteria
- every review FIX item is addressed or escalated
- no product decisions are hidden as technical assumptions
- no open questions remain
- the specification should pass `fixme-review-spec`

## Output Rules

- Write only the technical specification file.
- After saving, output the specification path and a short summary.
- Do not echo the full specification unless the user asks.
- End with `SPEC_PATH: <absolute path to specification>`.
