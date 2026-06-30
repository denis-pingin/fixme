---
name: fixme-brainstorm
description: "Socratic brainstorming for a feature, bug fix, or idea before committing to a specification, plan, or ticket. Explores intent, constraints, scope, and tradeoffs through one-question-at-a-time dialogue, optionally dispatches fixme-research mid-conversation, then captures decisions to a brainstorm document and routes to the next fixme skill of the user's choice."
argument-hint: "[topic or path to rough notes]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`).

**Short version:** run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and use the `fixmeDir` field from the JSON output as `<fixme-dir>`. Never use a literal `.fixme/` path in any Bash command, Read/Write/Edit path, or Grep/Glob pattern.

## Task-Bound User Input Contract

When the dispatch prompt contains `<task-state-owner>` with `ownerSkill: fixme-task`, this skill is running under a resumable `fixme-task`.

Do not call AskUserQuestion or wait directly when running under `fixme-task`. If user input is needed, return `FIXME_CHILD_ATTENTION_REQUIRED` as the final output and let `fixme-task` create the durable attention record:

```text
FIXME_CHILD_ATTENTION_REQUIRED
SOURCE_SKILL: fixme-brainstorm
KIND: brainstorm-decision
ANSWER_MODE: <freeform|decision-card|multiple-choice>
PROMPT_MARKDOWN:
<complete user-facing prompt>
END_PROMPT_MARKDOWN
```

Do not write `<fixme-dir>/decisions.md`, do not create a new saved task, and do not offer downstream routing choices in this mode.

# Fixme Brainstorm

Turn a raw idea into a clear next step through a Socratic conversation. The skill captures decisions, defers scope creep, and routes the result to the right fixme skill - product spec, technical spec, plan, ticket, or pure notes.

## Why This Exists

Before you can spec a feature, plan a fix, or open a ticket, you have to know what you actually want. Premature specs lock the wrong scope. Premature plans skip the design tradeoff. Premature tickets push undefined work onto someone else.

This skill is the missing front step: it explores the idea collaboratively until the right downstream action is obvious.

## Hard Constraints

- **NO source code modifications.** The writable artifacts are the brainstorm document under `<fixme-dir>/brainstorms/` and, when task-bound, the saved task preparation artifact index. Downstream skills handle code.
- **NO assumptions.** Every decision must come from the user's input. Speculation is allowed if explicitly flagged with "assumption:" in the conversation and recorded as a deferred question.
- **NO multi-question prompts.** Ask one question at a time. Use AskUserQuestion with concrete multiple-choice options when possible.
- **NO auto-routing.** In standalone direct mode, write the brainstorm document and present the routing menu. In dispatch or resumed saved-task mode, write the brainstorm document and return artifact directives only. Dispatch downstream skills only when the user explicitly picks one from a user-facing standalone routing menu.
- **NO scope creep.** When the user surfaces a separate capability, capture it in the deferred section and steer back to the current topic. Do not silently expand the brainstorm.

## Input Resolution

Detect the topic in this order:

1. **Argument**: if a topic string or file path is passed via `$ARGUMENTS`, use it. A path to rough notes is read and used as starting material.
2. **IDE context**: if the user has source material, screenshots, or notes selected, use it.
3. **Conversation context**: if the user has just described a problem or feature in this conversation, use that.
4. **Empty**: ask the user "What's on your mind?" and use their reply.

## Saved Task Binding

This skill can prepare an existing saved `FIXME-N` task before execution.

Resolve task binding in this order:

1. Explicit `--task <FIXME-N|task.md|state.json|ticket.md|ticket-folder>` in `$ARGUMENTS`.
2. If no explicit flag exists, extract a `FIXME-N` label from the natural-language prompt when the user asks for brainstorm or preparation work for that saved task.
3. If the prompt contains both a Linear label and a saved task label, such as `ALP-304 / FIXME-13`, use the `FIXME-N` saved task as the attachment target. Treat the Linear label as context only unless authoritative Linear content is required.
4. If no explicit task binding or `FIXME-N` label exists, run standalone and do not attach the brainstorm to any saved task.

Do not search by recency for a task to attach to. Do not infer a task from the newest file in `<fixme-dir>/tasks/`, `<fixme-dir>/brainstorms/`, or `<fixme-dir>/research/`.

When task-bound:

1. Run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task resolve <ref>`.
2. Read the resolved saved task brief and task state before starting the Socratic loop.
3. Include explicitly attached preparation artifacts from the saved task as context. Do not discover unrelated brainstorm or research files by recency.
4. After writing the brainstorm document, attach it with:

   ```bash
   node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task attach-artifact --task <ref> --data '<json-object>'
   ```

   The JSON must use camelCase keys:

   ```json
   {
     "artifactType": "brainstorm",
     "artifactPath": "<absolute path to brainstorm.md>",
     "title": "<brainstorm title>",
     "summary": ["<1-3 concise bullets from the brainstorm outcome>"],
     "sourceSkill": "fixme-brainstorm",
     "status": "current"
   }
   ```

If attachment fails, warn with the task ref, brainstorm path, failed command, and fallback: the brainstorm still exists but is not indexed on the saved task.

## Audible Alerts

Fire an alert before any user-facing prompt and at terminal outcomes so the user is never idling without sound. Alerts are fire-and-forget; never invoke the alert skill itself - call the CLI directly.

| When | Alert |
| --- | --- |
| Before any AskUserQuestion prompt (topic confirmation, clarifying questions, design approval, routing menu) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input` |
| Brainstorm document written and routing dispatch complete (or user chose "Save only") | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_finished` |
| Brainstorm aborted (cancelled, irrecoverable scope mismatch, fixme-dir resolution failed) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_failed` |

Ping once per pause; if a single AskUserQuestion batches multiple sub-questions, ping once.

## Process

### Step 1: Resolve context

1. Resolve `<fixme-dir>` per the Fixme Directory rule above. If resolution fails, fire `task_failed` and stop with a clear error.
2. Read these inputs in parallel:
   - `<fixme-dir>/decisions.md` if it exists - prior locked decisions in this project
   - `<fixme-dir>/config.json` if it exists - workflow defaults, Linear backend, ticket templates
   - `<fixme-dir>/brainstorms/` listing if it exists - prior brainstorms, especially with related slugs
   - the topic source (argument, IDE selection, conversation context)
3. Build an internal `<context>` summary: project hints, prior decisions that may apply, related brainstorms, ticket backend.

Do NOT scan the codebase here. Codebase exploration only happens via the mid-conversation research offer (Step 3) when a question warrants it.

### Step 2: Open the conversation

State the topic in one sentence and start exploring. Do not dump the internal context - reference it only when it matters.

```
## Brainstorm: <topic>

Let's think this through. I'll ask one question at a time before we commit to anything.
```

If no topic could be resolved:

```
## Brainstorm

What's on your mind? Could be a feature idea, a bug you're wrestling with, an architectural question, or something you're not sure about yet.
```

### Step 3: Socratic loop (typically 3-6 exchanges)

Drive the conversation with one question at a time. Prefer AskUserQuestion with 2-4 concrete options. Use freeform questions only when the answer cannot be enumerated.

Cover, in roughly this order, only what the topic actually needs:

1. **Purpose** - what outcome does this produce? Who benefits and how?
2. **Users and roles** - who interacts with this? Owner, admin, anonymous, system?
3. **Scope boundary** - what is in, what is intentionally out? Name the things that look related but are separate.
4. **Constraints** - what cannot change? Existing data, contracts, deadlines, dependencies?
5. **Success criteria** - what would make this obviously done? What observable behavior must exist?
6. **Failure modes** - what can go wrong? What must NOT happen?

Skip categories that do not apply. Ask follow-ups when an answer reveals new ambiguity.

**Listening rules:**

- When the user says "or", "versus", "we could", "maybe", or "tradeoff" - that is a gray area. Stop and probe it with `fixme-howto-present-decisions` style (see Step 4).
- When the user references a doc, spec, file, or ADR - record it as a canonical reference for the brainstorm document.
- When the user introduces a new capability outside the original topic - acknowledge it, capture it in deferred ideas, and steer back.

**Scope creep handling:**

```
"<new capability> sounds like its own thing - I'll note it in deferred ideas. Back to <current topic>: <last question or reflection>"
```

### Step 4: Mid-conversation research offer (optional)

When the conversation surfaces a factual or codebase question that the user cannot answer from memory (e.g. "does this endpoint already exist?", "what does the current migration do?", "is there a library that already handles this?"), offer a short research pass:

```
This touches on <specific question>. Want me to run a quick fixme-research pass before we continue? It will scan the codebase and external docs and return key findings.

[Yes, research it] / [No, keep going]
```

If yes, dispatch `fixme-research` via the Agent tool. Pass the specific question and the resolved `<fixme-dir>` in the prompt. Wait by transport: for an `agent`/`background` dispatch, block on the runtime wait primitive with a 5-minute watchdog (`wait_agent({ targets: [id], timeout_ms: 300000 })` for Codex agents); for an `inline-skill` dispatch, take the synchronous return without a synthetic polling loop. This is a direct Agent-tool dispatch with no lifecycle dispatch record, so do not call `lifecycle dispatch probe` or `lifecycle dispatch reconcile-wait`; on a watchdog timeout, report the timeout and ask whether to continue waiting. Do not infer that the research dispatch is stale or failed from an unchanged run status or an old `updatedAt`; `updatedAt` is the last status write, not a heartbeat. Then summarize the 3-5 most relevant findings into the conversation, and continue the loop. For any long or noisy command this skill runs directly, capture full combined output to a deterministic generated log under `<fixme-dir>/runs/<statusId>/logs/<timestamp>-<slug>.log` (or `<fixme-dir>/logs/<timestamp>-<slug>.log` when no statusId is available), report command/exit/log path on success, and show at least the last 150 lines on failure; never hide errors, warnings, prompts, or product output. These logs are generated artifacts and are not committed.

If no, skip and continue. Do not force research. If the topic is purely product or experiential, skip the offer entirely.

### Step 5: Surface gray areas

When the conversation reveals a design choice with more than one defensible answer, present it using `fixme-howto-present-decisions` (read at `~/.claude/skills/fixme-howto-present-decisions/SKILL.md` if not already in context).

Use the `FIX_UNCLEAR` shape when the user must pick a path. Always:

1. State the situation in one sentence.
2. Give 2-3 options as visually separated mini-cards with what changes / what it improves / what it costs.
3. Give your recommendation with rationale.
4. Use AskUserQuestion to capture the pick.

Record each resolved gray area as a decision in the running brainstorm. Reflect the user's choice back in one sentence before moving on.

### Step 6: Feasibility gate

Before proposing any route, convert possible approaches into candidate routes and prove feasibility from evidence. Only present approaches whose hard requirements have been verified.

For each route:

1. List hard requirements: runtime compatibility, package or SDK availability, API contract, auth path, deployment owner, data access, build or test command, and rollout dependency.
2. Verify each hard requirement with concrete evidence: current repository files, existing dependencies, local command output, official docs, package metadata, or a `fixme-research` or spike report that performed the check. If a claim depends on current third-party behavior, verify it with current docs or local tool output before treating it as true.
3. If verification requires source changes, dependency installation, credentials, a networked build, or a runtime experiment that has not been run, the route is unproven. Ask to run that verification before choosing or park it outside the menu.
4. Do not ask the user to choose between an unverified option and a verified option. If an option is attractive but unproven, put it under unproven alternatives or Open Questions with the exact proof needed.
5. If fewer than two verified approaches remain, recommend the single verified route instead of manufacturing a choice.

### Step 7: Reflect and propose approaches

Once you understand purpose, users, scope, constraints, and success criteria, reflect what you heard back in 3-5 bullets and confirm:

```
Here's what I'm hearing:
- <bullet>
- <bullet>
- <bullet>

Does this match what you have in mind?

[Yes, that's right] / [Adjust one of these] / [I want to revisit something]
```

If "adjust" or "revisit", return to the relevant Socratic step. If confirmed, propose 1-3 verified approaches:

```
Approaches I'd consider:

**A. <name>** - <one-sentence summary>
- Feasibility: <specific evidence that proves the hard requirements>
- Trades: <what you give up>
- Effort: <small | medium | large>

**B. <name>** - <one-sentence summary>
- Feasibility: <specific evidence that proves the hard requirements>
- Trades: <what you give up>
- Effort: <small | medium | large>

**C. <name>** - <one-sentence summary>
- Feasibility: <specific evidence that proves the hard requirements>
- Trades: <what you give up>
- Effort: <small | medium | large>

Recommendation: **<letter>** - <one-sentence rationale>.
```

Use AskUserQuestion to pick the approach only when two or more verified approaches remain. If there is one verified approach, recommend it directly and ask whether to proceed or run verification for an unproven alternative. If the user picks something else, capture it.

### Step 8: Write the brainstorm document

Save to `<fixme-dir>/brainstorms/<YYYY-MM-DD>-<slug>.md`. The slug is short kebab-case derived from the topic.

Document shape:

```markdown
---
title: <Topic>
date_created: <YYYY-MM-DD>
last_updated: <YYYY-MM-DD>
tags: [brainstorm]
related: []
---

# <Topic>

## Summary

<2-4 sentences: what we are building or fixing and why>

## Purpose

<Outcome and beneficiary, captured from Step 3.1>

## Users and Roles

<Captured from Step 3.2 - omit if not relevant>

## Scope

**In scope:**
- <bullet>

**Out of scope:**
- <bullet>

## Constraints

<Captured from Step 3.4>

## Success Criteria

<Captured from Step 3.5 - one bullet per observable outcome>

## Failure Modes

<Captured from Step 3.6 - omit if not relevant>

## Decisions

- **D-01:** <decision> - <one-sentence rationale>
- **D-02:** <decision> - <one-sentence rationale>

## Selected Approach

**<Approach name>** - <one-sentence summary>

<Brief explanation of why this approach over the alternatives>

## Alternatives Considered

- **<Other approach name>** - <why not chosen>
- **<Unproven route>** - not selectable yet; proof needed: <specific feasibility check>

## Open Questions

<Anything unresolved that the next skill should answer>

## Deferred Ideas

<Scope-creep items captured during the conversation, parked for later>

## Canonical References

<Files, docs, ADRs, or specs the user pointed to during the conversation. Full relative paths.>

## Handoff

Route menu default: run configured fixme-task workflow. This is not a fixme-task pipeline hint; downstream pipeline selection must come from explicit user choice or artifact type.
```

Omit sections that have no content. Keep entries terse.

Append a line to `<fixme-dir>/decisions.md` for each new decision if that file exists or the user wants it persisted across brainstorms. Use the same `D-XX` numbering scheme as the document. If `decisions.md` does not exist, do not create it from this skill - leave that to the spec/plan skills.

If this brainstorm is task-bound, run `task attach-artifact --task <ref> --data '<json-object>'` now so future `fixme-task --resume <ref>` runs can discover the brainstorm without chat history.

### Step 9: Present the routing menu (standalone direct mode only)

Skip this step in dispatch mode or resumed saved-task mode. In those modes, return artifact directives only and let the owning orchestrator continue from the saved task state.

Fire `user_input` alert. Then use AskUserQuestion to route to the next step:

```
Brainstorm saved: <absolute-path-to-brainstorm.md>

What do you want to do next?
```

Options (single-select):

Present the options in this exact order with these labels:

| Label | Option | What happens |
|-------|--------|--------------|
| B | B. Run configured fixme-task workflow - recommended | Dispatch `fixme-task` with the brainstorm path as input - runs the configured workflow end to end |
| A | A. Write implementation plan | Dispatch `fixme-write-plan` with the brainstorm path as input |
| C | C. Save only | Stop here. The brainstorm document is the artifact. |

`Run configured fixme-task workflow` is the recommended option. This means the workflow selected by config resolution; it does not mean the workflow named `full`. Do not reorder options based on the document's `Handoff` section.

Dispatch the selected skill via the Skill tool (`Skill(skill="fixme-task", args="...")`), or via the Agent tool when running under an orchestrator that prefers agent dispatch. Pass:

- The absolute brainstorm path
- The original topic (one sentence)
- The resolved `<fixme-dir>` value if dispatching as an agent
- The liveness `statusId` when the selected downstream skill maps to a known Fixme agent

For "Save only", skip dispatch.

Before dispatching a selected downstream skill that maps to a known Fixme agent, create liveness:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run start --fixme-dir <fixme-dir> --agent <selected-fixme-agent>
```

Use this mapping:

| Routing option | `<selected-fixme-agent>` |
| --- | --- |
| Write implementation plan | `fixme-write-plan` |
| Run configured fixme-task workflow | `fixme-task` |

For `Run configured fixme-task workflow`, set `<selected-fixme-agent>` to `fixme-task`. `Save only` has no dispatch.

Store the returned `statusId`. Do not dispatch the downstream skill if `run start` fails. Surface the JSON error, fire `task_failed`, and stop.

Include liveness in the downstream dispatch arguments:

```
<project>
Fixme dir: <fixme-dir>
</project>

<liveness>
statusId: <statusId from run start>
</liveness>
```

### Step 10: Close

Fire `task_finished`. Output a short summary:

```
## Brainstorm Complete

- Topic: <topic>
- Document: <absolute path>
- Decisions captured: <N>
- Deferred ideas: <M>
- Next step: <selected route or "save only">
```

If dispatch failed for any reason, fire `task_failed` and show the error and the brainstorm path - the user can re-invoke the next skill manually with that path.

## Modes

### Standalone Mode

Default when invoked directly by the user via `/fixme-brainstorm`. The skill resolves `<fixme-dir>` itself, runs the full Socratic loop, writes the brainstorm document, presents the routing menu, and dispatches the selected downstream skill.

### Dispatch Mode

When an orchestrator (e.g. fixme-task) dispatches this skill as the first phase of a workflow, the orchestrator passes:

- `Fixme dir: <absolute-path>` in the `<project>` block
- `Topic:` line with the topic
- Optional `Route:` line that pre-selects the routing choice (e.g. `Route: product-spec`)
- Optional `resumeRef:` line when the brainstorm is part of an existing saved task continuation

In dispatch mode:

- Use the passed `Fixme dir:` value directly. Do not re-resolve.
- Run the same Socratic loop and write the brainstorm document.
- In dispatch mode, never present the routing menu.
- If `resumeRef:` is present, treat this as an existing saved task continuation.
- Do not offer `Save only`, `Write implementation plan`, or `Run configured fixme-task workflow` in resumed or dispatch mode.
- If user input is needed while running in a non-user-facing dispatch, return `FIXME_CHILD_ATTENTION_REQUIRED` so the owning `fixme-task` can create durable attention and the parent broker can present it.
- Return only artifact directives such as `BRAINSTORM_PATH: <absolute path>` plus any pre-selected `Route:` value. The orchestrator handles the next dispatch.

## Anti-patterns

- **Asking multiple questions in one message.** One question at a time, even when it feels slow.
- **Free-form questions when AskUserQuestion would do.** Use multiple-choice when the answer space is finite.
- **Scope creep absorption.** Adding "while we're at it" features to the brainstorm. Capture in deferred ideas instead.
- **Forcing research.** The mid-conversation research offer is optional. Don't dispatch fixme-research for trivial questions.
- **Auto-routing.** Never dispatch a downstream skill without explicit user selection from the routing menu.
- **Code reading.** Resist the urge to grep the codebase for context. Use fixme-research only when the conversation genuinely requires it.
- **Writing source code.** The brainstorm document is the only writable artifact. Code is downstream.

## Output Rules

- Write only the brainstorm document. Do not modify any source code.
- Use absolute paths when reporting file locations.
- After dispatching a downstream skill, do not re-summarize its output - that skill owns its own report.
- End with `BRAINSTORM_PATH: <absolute path to brainstorm document>` so orchestrators and follow-up skills can parse the handoff.
