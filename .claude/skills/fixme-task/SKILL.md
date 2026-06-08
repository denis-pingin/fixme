---
name: fixme-task
description: End-to-end orchestrator that executes config-driven workflows with optional ticket state management. Supports intent flags for product specification, technical specification, planning, and execution workflows. Loads workflow definitions from <fixme-dir>/config.json (or uses hardcoded standard workflows), dispatches each phase's skills as isolated agents, manages review loops, decision persistence, artifact handoff, task code map paths, compact review context packets, and ticket state transitions.
---

# Fixme Task - Config-Driven Workflow Orchestrator

Execute a named or intent-selected workflow from `<fixme-dir>/config.json`. Each workflow is an ordered list of phases, each phase has skills to dispatch and an optional review loop. Manage compact context handoff, artifact paths, task code map paths, decision persistence, loop control, and optional ticket state transitions.

## Hard Constraints

- **This skill is a dispatcher.** It never writes plans, reviews code, or classifies findings itself. It dispatches sub-skills as agents and routes their outputs.
- **Never read source code during active pipeline execution.** The orchestrator reads ONLY specification files, plan files, task code map metadata/paths, decision logs, config files, and agent outputs while a phase or dispatch is in flight. All codebase exploration, investigation, and understanding happens inside dispatched agents. If you catch yourself using Read, Grep, or Glob on source code files mid-dispatch, STOP - you are about to bypass the pipeline. **Exception:** during a decision pause (after a Review Classification block with HAS_ASK_USER, before the user has provided decisions) the orchestrator may read source code to help the user understand the decision. See "Discussion Mode (Decision-Pause Carve-Out)" below.
- **Never lose retrievable context.** Full artifacts stay available by path; dispatch prompts pass compact, task-scoped context packets. Do not paste full discussion history or unrelated decision-log entries into review cycles.
- **Never override locked decisions silently.** If a conflict arises, present it to the user.
- **Never push code that doesn't pass verification.** The fixme-execute-plan sub-skill enforces this, but the orchestrator must not proceed past execution if verification failed.
- **Never output Run Summary until the FULL pipeline completes.** The pipeline is not done after a phase with no review. If a subsequent phase exists, it must run. If the current phase has a review loop, the review must complete before moving on. The Run Summary is ONLY output after the final phase's review handler returns Clean (or the phase has no review and it's the last phase) or after a loop guard triggers in direct standalone mode. In parent-driven (a parent-provided `parentContinuation`) or attention mode, loop guards use durable attention and do not emit a Run Summary. If you feel like outputting a completion report mid-pipeline, STOP - you are about to skip remaining phases.
- **Never present intermediate findings to the user with bypass options.** Code review findings go to their handler skill. Plan review findings go to their handler skill. After the handler classifies findings, the orchestrator prints the required Review Classification block, then follows the normal route. It must never ask "want me to fix this directly?", "should we skip the loop?", or offer any bypass around the configured workflow.
- **Never hardcode ticket backend paths.** All ticket operations go through the `fixme-tickets` abstraction skill, which reads `ticketBackend` from `<fixme-dir>/config.json` and routes to the correct backend. Never call `fixme-tools.cjs` or any backend directly from this orchestrator.
- **Save follows the full user instruction.** Save-only requests write a deferred task and stop. Save-and-continue requests write the task brief first, then continue into the selected or auto-detected pipeline. Ambiguous save requests stop and ask; never guess.

## Audible Alerts

Fire an audible alert at every attention point so the user is never idling without sound. Use the `fixme-alert` skill's Bash one-liner; do not invoke a skill for this.

| When | Alert |
| --- | --- |
| About to print an ASK_USER decision card (any phase) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input` |
| About to print a Review Classification block with HAS_ASK_USER | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input` |
| Ticket transitions to `done` / pipeline completes successfully | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_finished` |
| Ticket transitions to `failed` or workflow aborts | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_failed` |

Alerts are fire-and-forget. Failures are silent and never block workflow progress. See `fixme-alert/SKILL.md` for the full event taxonomy and `fixme-howto-present-decisions` for the ping-before-decision-card rule (which already covers most user_input gates).

## Discussion Mode (Decision-Pause Carve-Out)

The dispatcher-only rules above (no source-code Read/Grep/Glob, no investigation, no answering questions inline) apply to **active pipeline execution**: parsing the task, dispatching agents, routing handler results, advancing the manifest. They do NOT apply during a **decision pause**.

**A decision pause begins** the moment the orchestrator emits a Review Classification block whose closing prompt asks the user to make a decision (HAS_ASK_USER route, FIX_UNCLEAR or ASK_USER items presented). **It ends** the moment the user provides decisions and the orchestrator persists them with `task decision append` + re-invokes the handler.

During a decision pause the orchestrator IS the user's interlocutor, not a dispatcher. The user is owed a competent collaborator who can:

- **Read source code** (Read, Grep, Glob) to verify claims, surface evidence, or answer clarifying questions
- **Run read-only Bash** (git log, git show, grep, ls, etc.) to ground the discussion in repo facts
- **Read related plan/spec files** beyond the strict orchestrator allowlist when relevant to the decision
- **Answer follow-up questions inline** about the codebase, the decision options, the tradeoffs, or upstream/downstream phases
- **Re-frame a decision** when the user reveals new context (product intent, future-phase plans, prior decisions) that makes the original framing wrong - then re-present the decision card with the corrected framing

What stays forbidden even during a decision pause:

- Applying code changes (the pipeline still owns implementation - never edit source files)
- Auto-advancing the manifest or re-invoking handlers without an explicit user decision
- Persisting any task decision until the user has actually decided
- Pre-dispatching the next phase "to save time" before the decision is recorded

The pause ends when the user provides a decision (or "go with recommendations"). At that moment, persist the decision with `task decision append`, re-invoke the handler, and return to dispatcher-only mode for the next pipeline step.

### User-Instruction Priority

Even outside a decision pause, an explicit user instruction in conversation overrides the dispatcher-only rule. If the user asks "read this file and tell me X", "go check the source for Y", or "what does Z look like in the code right now", comply directly. Do not redirect the request to a sub-agent dispatch when the user has explicitly asked the main thread to do it. The dispatcher rule prevents *autonomous* drift inside the pipeline; it never overrides explicit user requests.

When in doubt, ask: "Did the user just ask ME to do this, or am I doing it on my own initiative because I think the pipeline needs it?" Direct user requests = comply. Own initiative = dispatch.

## Input Resolution

Parse the invocation argument to extract intent, pipeline name, task description, and optional ticket path.

### Fixme Root Resolution (FIRST)

Before anything else - before parsing arguments, before checking the filesystem for plans, before reading config - resolve `<fixme-dir>` per `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter; read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md` if not preloaded). Run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and store the `fixmeDir` value as `<fixme-dir>`. Never use a literal `.fixme/` path in any tool.

When dispatching sub-agents, always include `Fixme dir: <fixme-dir>` in the `<project>` block of the dispatch prompt. Sub-agents do NOT re-resolve - they use the value passed in.

### Usage Invocation State

Start and finish this active `fixme-task` invocation through the lifecycle invocation helper, which brackets usage and (for direct runs) creates a self-owned run status in one call:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle invocation start --fixme-dir <fixme-dir> --data '{"skill":"fixme-task","runtime":"claude","role":"orchestrator","idempotencyKey":"<stable-key>","createRunStatusForAgent":"fixme-task","pipelineRunId":"<incoming-or-omit>","parentInvocationId":"<incoming-or-omit>"}'
```

Direct runs pass `createRunStatusForAgent: "fixme-task"` to get a self-owned run status (`statusId`/`statusPath`) for durable attention. Store the returned `invocationId` as `usageInvocationId`, the returned `pipelineRunId` as `pipelineRunId`, and the returned `statusId` as the self-owned liveness status.

Standalone `fixme-task` has no incoming `pipelineRunId`; the helper returns `pipelineRunId === usageInvocationId`. Parent-driven `fixme-task` receives a `pipelineRunId` from its parent's `lifecycle dispatch prepare` `usageContext` and passes it in; the returned `pipelineRunId` reuses the parent value.

On completion run:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle invocation finish --fixme-dir <fixme-dir> --invocation-id <usageInvocationId> --outcome <complete|failed|aborted>
```

**Finish-before-wake-up ordering:** emit the usage report line from `lifecycle invocation finish` BEFORE any `FIXME_ATTENTION_REQUIRED` directive or terminal task-event notification. Never invent a report line when reporting is suppressed.

If `lifecycle invocation start` fails, set `usageInvocationId = null` and `pipelineRunId = null`, print the required warning, and continue without usage-linked child rows.

### Argument Parsing

```
/fixme-task full build import flow                    -> pipeline="full", task="build import flow"
/fixme-task bugfix fix the login button               -> pipeline="bugfix", task="fix the login button"
/fixme-task fix the login button                      -> pipeline="standard", task="fix the login button"
/fixme-task --ticket <path> fix the login             -> pipeline="standard", ticket=<path>, task="fix the login"
/fixme-task full --ticket <path> fix login            -> pipeline="full", ticket=<path>, task="fix login"
/fixme-task --product-spec build import flow          -> pipeline="product-spec", task="build import flow"
/fixme-task --tech-spec <product-spec-path>           -> pipeline="technical-spec", task="<product-spec-path>"
/fixme-task --technical-spec <product-spec-path>      -> pipeline="technical-spec", task="<product-spec-path>"
/fixme-task --plan <technical-spec-path>              -> pipeline="plan-only", task="<technical-spec-path>"
/fixme-task --execute <plan-path>                     -> pipeline="execute-only", task="<plan-path>"
/fixme-task --pipeline full build import flow         -> pipeline="full", task="build import flow"
/fixme-task --pipeline product-spec build import flow -> pipeline="product-spec", task="build import flow"
/fixme-task --save build import flow                  -> saveIntent=true, continueAfterSave=false, task="build import flow"
/fixme-task save it and proceed with planning         -> saveIntent=true, continueAfterSave=true, pipeline="standard"
/fixme-task standard --save build import flow         -> ambiguous save intent; ask whether to save only or save then run standard
/fixme-task --resume FIXME-23                         -> resumeRef="FIXME-23"
/fixme-task --resume <ticket-path>                    -> resumeRef="<ticket-path>"
/fixme-task --resume FIXME-23 --answer-attention <attention-id> -> resumeRef="FIXME-23", answerAttentionId="<attention-id>"
```

Plain `/fixme-task ...` defaults to `standard`.

**Rules:**
1. Extract `--ticket <path>` if present (anywhere in args). Remove it from remaining args.
2. Extract `--pipeline <name>` if present. Remove it from remaining args.
3. Determine parent context from the dispatch prompt, not a CLI flag. When the dispatch prompt carries a `<task-state-owner>` / `parentContinuation` block (or the parent supplied `transport=inline-skill` via `lifecycle dispatch prepare`), this run is parent-driven: a parent skill (typically `fixme-pr-comments`) owns its own todo list and the parent's final summary. Otherwise the run is direct. The dispatch manifest is built in parent-driven mode when `parentContinuation` is present in task state - see "Creating the Manifest with TodoWrite" below. `transport` is informational launch metadata, never a `fixme-task` command-line flag.
4. Extract `--save` if present (boolean flag). Remove it from remaining args. Also set `saveIntent=true` when the user asks in prose to "save this as a fixme-task", "save this a fixme-task", "save it", or equivalent.
   - Save intent can be terminal or non-terminal depending on the rest of the instruction.
   - Set `continueAfterSave=false` when the prompt only asks to save a task, or when `--save` is present and the remaining text is only the task description.
   - Set `continueAfterSave=true` when the user explicitly asks to continue, proceed, run, plan, execute, implement, or otherwise continue the workflow after saving.
   - If save intent and continuation intent are ambiguous, stop and ask the user which behavior they want. Do not guess.
5. Extract `--resume <FIXME-N|task.md|state.json|ticket.md|ticket-folder>` if present. Remove it from remaining args. Resume mode resolves the ref through `task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>`.
6. Extract `--answer-attention <attention-id>` if present. Remove it from remaining args. This is valid only with `--resume`; it tells `fixme-task` to load the answered attention record, apply the answer to `pendingDecision`, and continue from the stored cursor.
7. Extract intent flags if present. Supported flags:
   - `--product-spec` -> pipeline `product-spec`
   - `--tech-spec` -> pipeline `technical-spec`
   - `--technical-spec` -> pipeline `technical-spec`
   - `--plan` -> pipeline `plan-only`
   - `--execute` -> pipeline `execute-only`
8. If more than one intent flag is present, ask the user which starting point to use. Do not guess.
9. If both `--pipeline <name>` and an intent flag are present, they must resolve to the same pipeline. If they conflict, ask the user which one to use.
10. If no explicit pipeline was set by `--pipeline` or an intent flag, check the first remaining word against pipeline names in `<fixme-dir>/config.json` plus the standard pipeline names listed in Config Loading. If it matches, use it and remove it from remaining args.
11. The remaining args are the task description.
12. If no explicit pipeline was found, leave pipeline as `auto` until Task Resolution and Pipeline Auto-Detection run.

When `resumeRef` is present, resume an existing task continuation, never save a new task. This remains true when the latest user response was produced by a parent skill after an attention prompt. The task file and state file are already the context boundary.

### Pipeline Resolution Contract

Pipeline selection is a candidate-resolution step, not a free-form summary. Keep the existing inference sources, but every selected pipeline must come from eligible user or artifact evidence.

Eligible candidate sources:

- `explicitPipelineArg`: latest invocation supplied `--pipeline <name>`
- `intentFlag`: latest invocation supplied an intent flag such as `--plan` or `--execute`
- `firstArgumentPipelineName`: latest invocation's first remaining argument matched a configured or standard pipeline name
- `userProseIntent`: latest user invocation explicitly asked for a matching workflow, such as "write a plan", "execute the plan", or "end-to-end from idea"
- `artifact`: selected or injected artifact shape determines the starting workflow, such as product spec, technical spec, or plan
- `resumeState`: explicit resume state already has a persisted pipeline resolution
- `default`: resolver output when no eligible candidate existed, so use `standard`

Ineligible sources:

- Assistant menu labels
- Assistant summaries
- Previous assistant wording
- Brainstorm document handoff and recommendation sections
- Unrelated old files
- Vague continuation words such as "proceed" unless they point to an eligible saved/resolved task

Before task save, task init, Config Loading, ticket transitions, or dispatch, construct a compact camelCase candidate payload and run:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs pipeline resolve --data '<json-object>'
```

Input shape:

```json
{
  "candidates": []
}
```

Use the resolver output as `pipelineResolution`. Dispatch using `pipelineResolution.pipeline`. Do not hand-author the final pipeline after resolver output exists.

Do not call `task save` or `task init` without `pipelineResolution`. These commands do not infer a default workflow; the orchestrator must resolve the pipeline first and pass the exact resolver output.

### Task Resolution

Resolve the task description in this order - stop at the first match:

1. **Argument with path**: if a file path is passed, use it directly
2. **Argument referencing context** (e.g. "see plan", "the plan", "attached"): the plan/task is already in the conversation. Check the skill expansion content above (plans are often injected inline when the skill is invoked). Also check IDE selection context (`ide_selection` tags). Do NOT search the filesystem - the user is telling you it's already here.
3. **IDE selection context**: if `ide_selection` tags contain a plan or specification, use it
4. **Conversation context**: if the task was discussed earlier in conversation, use it
5. **Ask**: prompt the user for what to build

**CRITICAL**: When the argument is a reference like "see plan" or "the plan above", the plan content is almost always already present in the current message context (injected by the skill system or IDE). Read the full prompt carefully before searching the filesystem.

**The filesystem is never a source of tasks.** `<fixme-dir>/plans/` is checked only in the "Start From" step below, and only to find a plan **for the already-resolved task** - never to discover what the task is. If you cannot resolve the task from arguments, IDE selection, or conversation context, the answer is rule 5 (ask the user). Listing `<fixme-dir>/plans/` to find "something to work on" is a pipeline violation.

**Failure mode to avoid**: when conversation context already specifies the task (rule 4), do not then go scan `<fixme-dir>/plans/` and treat the most recent file as relevant. Old plans in that directory are for past tasks. They will mislead the pipeline. The "Start From" check below is for finding a plan that matches the current task - if no plan in conversation matches, start fresh.

## Save Mode

Use save mode when `saveIntent=true`, including `/fixme-task --save ...`, `$fixme-task --save ...`, or a conversational request such as "save this as a fixme-task". Save mode captures the previously discussed task, issue, solution approach, or implementation shape.

Save intent can be terminal or non-terminal depending on the rest of the instruction.

- If the user only asks to save, write the saved task brief and stop before manifest creation, config loading, ticket transitions, or agent dispatch.
- If the user explicitly asks to continue, proceed, run, plan, execute, implement, or otherwise continue the workflow after saving, write the saved task brief first, then continue into the selected or auto-detected pipeline using the saved task brief as task context.
- If save intent and continuation intent are ambiguous, stop and ask the user which behavior they want. Do not guess.

Save to `<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.md`. Use ISO date format `YYYY-MM-DD`. Use a short lowercase slug derived from the generated title. The saved task state lives beside it as `<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.state.json`.

Every saved task gets a project-scoped label in the form `FIXME-<number>`. Label: `FIXME-<number>`. The label is assigned by the shared CLI from `<fixme-dir>/tasks/.counter`, which belongs to the resolved Fixme directory and is therefore per project.

The counter file stores the next available task number. The CLI reads and updates `<fixme-dir>/tasks/.counter`. If the counter file is missing, the CLI uses `1` as the next number. If the counter file exists but is not a positive integer, the CLI aborts; relay this user note and do not write a task file yourself:

```text
The saved-task counter at <absolute path to counter> is invalid. Fix it to contain the next positive integer, then run `fixme-task --save` again.
```

After assigning label `FIXME-N`, the CLI writes `N + 1` plus a trailing newline back to `<fixme-dir>/tasks/.counter`. Gaps are acceptable if task writing fails after counter reservation; duplicate labels are not.

The orchestrator does not hand-write saved task markdown, the counter, or task state JSON. It constructs a compact camelCase JSON input object and runs:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data '<json-object>'
```

The JSON input must use camelCase JSON keys only. Required keys: `title`, `taskGoal`, `agreedApproach`, `userVisibleBehavior`, `scope.inScope`, `laterPlanningNotes`, and `pipelineResolution`. Optional keys: `scope.outOfScope`, `lockedDecisions`, `constraints`, `knownContext`, `openQuestions`, `source`, and `tags`. Do not send `pipelineHint` or `pipeline` in task-save JSON; the CLI rejects those fields.

### Save Mode Lossless Handoff Gate

Treat the saved task file as the context boundary. A future run must be able to plan and execute from the task file alone, with no chat history.

Before calling `task save`, build the payload from the resolved task context and check it against this invariant:

- Every settled solution-shape detail from the conversation appears under `agreedApproach`, including concrete systems, data shapes, fallback behavior, and rejected alternatives when relevant.
- Every observed behavior or expected change appears under `userVisibleBehavior`.
- Every included and excluded work item appears under `scope.inScope` or `scope.outOfScope`.
- Every known fact, investigated root cause, file reference, command, data value, or constraint needed to avoid re-discussion appears under `knownContext` or `constraints`.
- Every test, verification, sequencing, or risk note that the planner should preserve appears under `laterPlanningNotes`.

Do not compress a rich discussion into only a title and one-sentence goal. Do not rely on the next agent to rediscover already-settled approach details. If the payload would lose any information needed after context loss, repair the payload before saving. If the missing information cannot be recovered from arguments, IDE selection, or conversation context, abort and ask the user for the missing scope.

The CLI rejects skeletal handoffs that omit concrete `agreedApproach`, `userVisibleBehavior`, `scope.inScope`, or `laterPlanningNotes`. Treat that rejection as a save-mode bug in your payload, not as a reason to hand-write the task file.

### Save Mode Context Resolution

Resolve the saved task context from the same sources as Task Resolution, with one difference: save mode never asks the user to invent missing scope.

1. Use the explicit task argument if present.
2. Use IDE selection context if it contains a task, issue, plan, specification, or agreed approach.
3. Use conversation context if the task, issue, solution approach, or agreed shape was discussed earlier.
4. If no task, issue, solution approach, or agreed shape exists in arguments, IDE selection, or conversation context, abort with this user note:

   ```text
   I do not have a task, issue, or agreed solution approach to save yet. Discuss the work first, then say `fixme-task --save`.
   ```

Do not search `<fixme-dir>/plans/`, `<fixme-dir>/specs/`, or any source directories to discover a task to save. Save mode preserves context already provided; it never guesses from filesystem recency.

### Save Mode Title And Filename

The title is always auto-generated from the resolved task context. Do not ask the user for a title.

Generate the title from the concrete outcome, affected system, and saved approach. Prefer a concise imperative or noun phrase, for example `Save Deferred Fixme Task` or `Add Usage Report Pipeline Summary`. If the user supplied a title in prose, treat it as context, not as an instruction to copy it verbatim; normalize it to the same style as other generated titles.

Generate the filename slug from the title:

- lowercase ASCII
- words separated by `-`
- omit filler words when the slug would be too long
- no ticket, requirement, acceptance, migration, or phase codes unless needed to disambiguate the saved work

### Save Mode Document Structure

The CLI writes this document shape:

```markdown
---
title: "<auto-generated title>"
label: "FIXME-<number>"
slug: "<auto-generated-slug>"
created: "<YYYY-MM-DD>"
updated: "<YYYY-MM-DD>"
status: saved
source: conversation
pipeline: "<standard|quick|full|bugfix|product-spec|technical-spec|plan-only|execute-only>"
tags: []
---

# FIXME-<number>: <auto-generated title>

## Task Goal

One sentence describing the outcome, not the implementation steps.

## Agreed Approach

- The concrete solution shape already agreed.
- Important design choices and rejected alternatives when relevant.
- How this should be planned or executed later.

## User-Visible Behavior

- What changes for a user, operator, reviewer, or developer.
- Expected success behavior.
- Expected failure, edge, or recovery behavior.

## Scope

### In Scope

- Specific behaviors, files, systems, workflows, or docs included in the saved work.

### Out Of Scope

- Adjacent cleanup, future work, or rejected expansions.

## Locked Decisions

1. **Decision title**
   - **Answer:** What was agreed.
   - **Reason:** Why this choice won.
   - **Status:** confirmed

## Constraints

- Project rules, compatibility constraints, verification requirements, style constraints, and "must not" behavior.

## Known Context

- Relevant facts from the conversation.
- Existing artifacts or file paths if already known.
- Do not invent codebase facts here.

## Open Questions

- Questions that must be answered before planning.
- Omit this section if there are none.

## Suggested Pipeline

`<pipeline>`

## Later Planning Notes

- What `fixme-write-plan` should pay special attention to.
- Risks likely to need codebase verification.
- Tests likely needed, without writing exact test code unless it was already agreed.
```

### Save Mode Output

Do not dispatch agents, create a manifest, transition tickets, or enter Config Loading only when save is terminal.

After the CLI writes the file, output a short confirmation and always emit:

```markdown
Saved [FIXME-<number>](<absolute path to saved task brief>)
```

```text
TASK_PATH: <absolute path to saved task brief>
```

```text
TASK_STATE_PATH: <absolute path to saved task state JSON>
```

If save is terminal and usage tracking is active in the installed runtime, finish usage normally with outcome `complete` before the `TASK_PATH` directive.

If `continueAfterSave=true`, do not finish usage after writing the task brief. Store the CLI-returned `taskPath` as `savedTaskPath`, store `statePath` as `taskStatePath`, set the task context to `taskPath`, then proceed to Pipeline Auto-Detection, Project Root Resolution, Start From, Config Loading, manifest creation, ticket transitions, task checkpoints, and agent dispatch as usual.

### Pipeline Auto-Detection

Run auto-detection only when no explicit pipeline was selected by `--pipeline`, intent flag, or first-word pipeline name. Auto-detection chooses a starting point from the resolved task or current context.

**High-confidence detections:**

- **Product specification source** -> pipeline `technical-spec`
  - Path contains `/specs/product/` or `/product-spec`.
  - Content title or headings indicate a product specification: `# Product Specification`, `# [Feature Name]` with `Product Requirements`, `User Journeys`, or `Users, Roles, and Permissions`.
- **Technical specification source** -> pipeline `plan-only`
  - Path contains `/specs/technical/`, `/technical-spec`, or `/tech-spec`.
  - Content headings indicate a technical specification: `Architecture and Ownership`, `Interfaces and Data Contracts`, `Persistence, Migration, and Backfill`, or `Workflow, Concurrency, and Failure Semantics`.
- **Implementation plan source** -> pipeline `execute-only`
  - Path contains `/plans/`.
  - Content title or headings indicate an implementation plan: `Implementation Plan`, `File Map`, `Tasks`, or `> Execute with`.
- **Explicit prose intent** -> matching pipeline
  - User asks to write a product specification -> `product-spec`.
  - User asks to write a technical specification or tech spec -> `technical-spec`.
  - User asks to write a plan -> `plan-only`.
  - User asks to execute or implement an existing plan -> `execute-only`.
  - User asks for idea to production or end-to-end from idea -> `full`.
  - User reports a bug that needs investigation -> `bugfix`.

**Default detection:**

- If the input is a loose implementation task and no artifact type is clear, use `standard`.

**Brainstorm artifact handling:**

- Brainstorm document handoff sections are assistant-authored metadata, not pipeline evidence.
- Treat `## Handoff` and `## Recommended Next Step` in brainstorm files as user-facing routing notes only.
- Do not select `plan-only` because a brainstorm artifact says to write an implementation plan.

**Ambiguous detection:**

- If multiple artifact types are present in conversation or IDE context and none is explicitly selected, ask once before continuing.
- Present choices in user language: product specification, technical specification, plan, execute, or normal task.
- Use `fixme-howto-present-decisions` for the user-facing decision.
- Include a recommendation. Do not silently choose a long pipeline.

### Project Root Resolution

Resolve the project root for sub-agent dispatch prompts:

1. **Explicit in task text**: if the task description contains `Project root: <path>`, extract and use that path
2. **Current working directory**: use the working directory

### Start From

Detect where to enter the selected pipeline based on what already exists **for the resolved task**. Check sources in this order: (1) conversation/prompt context (plans or specifications injected inline by skill system), (2) IDE selection, (3) argument as file path, (4) `<fixme-dir>/plans/` directory for plan pipelines only.

- **Product specification exists** and selected pipeline is `product-spec`: skip the writer phase, enter at the product-spec phase's review step. If the phase has no review, run summary.
- **Product specification exists** and selected pipeline is `technical-spec`: start from the technical-spec writer phase with the product specification path as input.
- **Technical specification exists** and selected pipeline is `technical-spec`: skip the writer phase, enter at the technical-spec phase's review step. If the phase has no review, run summary.
- **Technical specification exists** and selected pipeline is `plan-only`: start from the plan writer phase with the technical specification path as input.
- **Plan exists** and selected pipeline is `execute-only`: set `planPath` and start from the implement phase's execute skill.
- **Plan exists** and selected pipeline has a `plan` phase: set `planPath`, skip the plan-writing phase, and enter at the plan phase's **review** step. If the plan phase has no review, skip it entirely and enter at the next phase.
- **Plan exists + already reviewed** (review findings provided): enter at the plan phase's **review handler**.
- **Plan exists + already executed** (execution results or code changes present): enter at the implement phase's **review** step (if it has one).
- **Nothing exists**: start from the first phase of the pipeline (default).

When a selected or discovered plan references a `### Code Map` path or the input provides a code map path, set `codeMapPath`. If no code map path exists, continue; the next plan-writing or plan-revision phase must create one.

When entering mid-pipeline, still resolve the original task (for context packet construction) and check for an existing decision log at `<fixme-dir>/decisions.md`.

### Artifact Handoff

Maintain artifact paths as explicit live routing state while routing the pipeline. Persist only the durable task state fields listed in Task Resume State.

- `productSpecificationPath`: last `SPEC_PATH` produced by `fixme-write-product-spec`, or a product specification path selected as input.
- `technicalSpecificationPath`: last `SPEC_PATH` produced by `fixme-write-technical-spec`, or a technical specification path selected as input.
- `currentSpecificationPath`: live alias for the specification artifact currently being reviewed by `fixme-review-spec`; never persist it in task state JSON.
- `planPath`: plan artifact selected or produced by `fixme-write-plan` if the output names one.
- `codeMapPath`: task-scoped code map artifact selected or produced by `fixme-write-plan` if the output names one.
- `preparationArtifacts`: brainstorm, research, investigation, or other pre-work artifacts explicitly attached to the saved task with `task attach-artifact`. These are task context, not pipeline entry-point artifacts.
- `executionResults`: completion report from `fixme-execute-plan`.

After every phase skill dispatch, parse its output for artifact directives:

```text
SPEC_PATH: <absolute path to specification>
PLAN_PATH: <absolute path to plan>
CODE_MAP_PATH: <absolute path to task code map>
```

When `fixme-write-product-spec` returns `SPEC_PATH`, set both `productSpecificationPath` and `currentSpecificationPath`.

When `fixme-write-technical-spec` returns `SPEC_PATH`, set both `technicalSpecificationPath` and `currentSpecificationPath`.

When `fixme-write-plan` returns `PLAN_PATH`, set `planPath`.

When `fixme-write-plan` returns `CODE_MAP_PATH`, set `codeMapPath`.

If a downstream standard skill requires an artifact path and the path is missing, do not search broadly or guess from newest files. Re-dispatch the producer once with a resume prompt asking it to output the missing directive. If the directive is still missing, escalate to the user.

#### Match-or-skip rule for `<fixme-dir>/plans/` (NON-NEGOTIABLE)

A plan candidate found via the filesystem (source 4) is only usable if it **demonstrably matches the resolved task**. Source 4 is a fallback - it is never a tiebreaker, never a "best guess," never a substitute for resolving the task in the first place.

**Required match check before treating a filesystem plan as the entry point:**

1. The plan's title, scope, or top-level summary must reference the same subject as the resolved task. A PR-comments plan does not match a feature-development task. A plan dated last week for ticket-X does not match today's ticket-Y.
2. If the resolved task came from **conversation context** (Task Resolution rule 4) and conversation context did NOT explicitly reference an existing plan, **skip source 4 entirely**. Conversation-context tasks start fresh by default. Do not list `<fixme-dir>/plans/`. Do not open candidate files. The pipeline enters at phase 1.
3. If you list `<fixme-dir>/plans/` and the most recent file looks plausibly related but you are not certain it is for THIS task, treat it as no match. Start fresh. A wrong plan is worse than no plan - it pulls the executor toward the wrong work.

**The most recent file in `<fixme-dir>/plans/` is not "the current task's plan" by default.** That directory is an archive of past work. Treating recency as relevance is a pipeline violation.

If no candidate plan matches the resolved task across all four sources, the answer is **"Nothing exists" -> start from the first phase**. Never paper over the absence of a plan by adopting an unrelated one.

### Investigation Tasks

If the task asks "why", "what causes", "debug", or describes unexpected behavior:
- This is an investigation. The temptation to explore the codebase will be strongest here.
- Pass the user's EXACT description to the first phase's skill. Add nothing from your own exploration.
- Do NOT read source files "to understand the task better." The task description IS the input. (This applies to the dispatch-time investigation impulse. The Discussion Mode carve-out for decision pauses still applies.)

## Config Loading

Load the workflow definition and project settings (using `<fixme-dir>` resolved in Input Resolution):

1. **Read `<fixme-dir>/config.json`** if it exists
2. **Extract the selected workflow** from `workflows.<pipelineName>.phases`
3. **If the selected workflow is missing from config but is one of the standard workflows below**, use the hardcoded standard workflow.
4. **If no config or no workflow key and no explicit pipeline was selected**, use the hardcoded `standard` workflow.
5. **Extract `outerMaxCycles`** from `workflows.<pipelineName>.outerMaxCycles` if present. Missing or invalid values use the standard default below.

### Standard Workflow Metadata

Every workflow has workflow-scoped metadata. `outerMaxCycles` is independent of per-phase `review.maxCycles`.

```json
{
  "outerMaxCycles": 2
}
```

- `outerMaxCycles`: max blocking `PLAN_REQUIRED` cross-phase cycles for this workflow before escalating to the user. Example: code review proves the plan is wrong, sends work back to plan, then implementation and review run again. `IMPLEMENT_ONLY` repair loops do not count against this limit. Default: `2`.

### Standard Pipelines

Review levels use `strict | standard | lenient | fast-track | critical`. The top-level default is `review.level`; workflow overrides use `workflows.<workflow>.review.level`; phase overrides use `phase.review.level`; PR comment handling uses `pullRequestComments.review.level`.

`standard`:
   ```json
   [
     {
       "name": "plan",
       "skills": ["fixme-write-plan"],
       "review": {
         "skills": ["fixme-review-plan", "fixme-handle-plan-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "implement",
       "skills": ["fixme-execute-plan"],
       "review": {
         "skills": ["fixme-review-code", "fixme-handle-code-review"],
         "maxCycles": 3
       }
     }
   ]
   ```

`quick` has the same `plan -> implement` phase order as `standard` and no `review` blocks.

`full`:
   ```json
   [
     {
       "name": "product-spec",
       "skills": ["fixme-write-product-spec"],
       "review": {
         "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "technical-spec",
       "skills": ["fixme-write-technical-spec"],
       "review": {
         "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "plan",
       "skills": ["fixme-write-plan"],
       "review": {
         "skills": ["fixme-review-plan", "fixme-handle-plan-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "implement",
       "skills": ["fixme-execute-plan"],
       "review": {
         "skills": ["fixme-review-code", "fixme-handle-code-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "verify",
       "skills": ["fixme-browser-verify"]
     }
   ]
   ```

`bugfix`:
   ```json
   [
     {
       "name": "investigate",
       "skills": ["fixme-investigate"]
     },
     {
       "name": "research",
       "skills": ["fixme-research"]
     },
     {
       "name": "plan",
       "skills": ["fixme-write-plan"],
       "review": {
         "skills": ["fixme-review-plan", "fixme-handle-plan-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "implement",
       "skills": ["fixme-execute-plan"],
       "review": {
         "skills": ["fixme-review-code", "fixme-handle-code-review"],
         "maxCycles": 3
       }
     },
     {
       "name": "verify",
       "skills": ["fixme-browser-verify"]
     }
   ]
   ```

`product-spec`:
   ```json
   [
     {
       "name": "product-spec",
       "skills": ["fixme-write-product-spec"],
       "review": {
         "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
         "maxCycles": 3
       }
     }
   ]
   ```

`technical-spec`:
   ```json
   [
     {
       "name": "technical-spec",
       "skills": ["fixme-write-technical-spec"],
       "review": {
         "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
         "maxCycles": 3
       }
     }
   ]
   ```

`plan-only`:
   ```json
   [
     {
       "name": "plan",
       "skills": ["fixme-write-plan"],
       "review": {
         "skills": ["fixme-review-plan", "fixme-handle-plan-review"],
         "maxCycles": 3
       }
     }
   ]
   ```

`execute-only`:
   ```json
   [
     {
       "name": "implement",
       "skills": ["fixme-execute-plan"],
       "review": {
         "skills": ["fixme-review-code", "fixme-handle-code-review"],
         "maxCycles": 3
       }
     }
   ]
   ```

7. **If the selected pipeline is not configured and is not a standard pipeline**, ask the user to choose a configured pipeline or one of the standard intent flags.
8. **Filter out disabled phases** (`enabled === false`)
9. **Extract project settings** from config's `project` field. If absent, project settings are unavailable (agents will detect from CLAUDE.md and project files).
10. **Store `outerMaxCycles`** from the selected workflow. Use `2` if absent or invalid.

## Task Resume State

Every non-terminal `fixme-task` run has a low-level task state JSON file. Ticket state remains the high-level session scheduler state; task state is the exact resume cursor for this orchestrator.

Task state JSON uses camelCase JSON keys only. Do not persist `currentSpecificationPath`, numbered manifest steps, or `currentStep`. Those are either derivable from `cursor.phase` and artifact paths or are live TodoWrite UI state.

Standalone saved task state path:

```text
<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.state.json
```

Ticket task state path:

```text
<ticket-folder>/task-state.json
```

Durable state shape:

```json
{
  "schemaVersion": 1,
  "projectRoot": "/absolute/project/root",
  "status": "running",
  "pipeline": "standard",
  "pipelineResolution": {
    "pipeline": "standard",
    "source": "default",
    "evidence": null,
    "reason": "Latest user invocation did not contain an eligible pipeline signal.",
    "candidates": []
  },
  "cursor": {
    "phase": "implement",
    "stage": "review",
    "skill": "fixme-review-code",
    "dispatchMode": "normal"
  },
  "artifacts": {
    "productSpecificationPath": null,
    "technicalSpecificationPath": null,
    "planPath": "/absolute/.fixme/plans/plan.md",
    "codeMapPath": "/absolute/.fixme/context/task-code-map.md",
    "preparationArtifacts": [
      {
        "artifactType": "research",
        "artifactPath": "/absolute/.fixme/research/research.md",
        "title": "Validate approach",
        "summary": ["Research found the approach is implementable."],
        "sourceSkill": "fixme-research",
        "status": "current",
        "updatedAt": "2026-06-02T12:00:00.000Z"
      }
    ]
  },
  "handoff": {
    "executionSummary": "Plan executed; verification passed.",
    "reviewFindings": null,
    "handlerResult": null,
    "followUpItems": []
  },
  "loops": {
    "phaseReviewCycles": [
      {
        "phase": "plan",
        "cycles": 1
      }
    ],
    "outerCycles": 0
  },
  "pendingDecision": null,
  "updatedAt": "2026-06-02T12:00:00.000Z"
}
```

Run `task checkpoint --state <task-state-path> --data '<json-object>'` after every dispatch return, route, artifact capture, loop counter change, and user-decision pause. The checkpoint data may update only `status`, `cursor`, `artifacts`, `handoff`, `loops`, and `pendingDecision`.

Resume mode:

1. Run `task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>`.
2. Read the returned state path.
3. Rebuild the live TodoWrite manifest from the workflow config and the semantic `cursor`.
4. If `status` is `waitingForUser` and `answerAttentionId` is present, follow Durable Attention Requests instead of presenting `pendingDecision` directly. If `status` is `waitingForUser` without `answerAttentionId`, present `pendingDecision` only in a direct user-facing resume; in attention mode, return the existing `FIXME_ATTENTION_REQUIRED: <attention-id>` for the parent broker.
5. If the cursor points at a dispatch step, re-dispatch that skill with the artifact and handoff data in the state file.
6. If the saved task brief or state contains `Preparation Artifacts`, include only those explicit artifacts in the next dispatch context. Do not discover brainstorm or research files by recency.
7. If a ticket-backed task has no task state but the ticket is at a phase boundary, initialize task state at that phase's first execute step. Do not guess from newest files.

### Durable Attention Requests

Human input belongs to the owner of the task state, but the owner is not always the user-facing runner. A `fixme-task` may be running directly in the main session, inline inside a parent skill, or inside a registered agent whose output is not automatically shown to the user. For that reason, every decision pause must be durable and resumable.

If `fixme-task` is running in a non-user-facing context (a parent-provided `parentContinuation` (transport `inline-skill` or `background`) or any parent-provided `<liveness>` status id), do not wait on normal text output. Use the `lifecycle attention open` path below to store the complete Review Classification block, then return `FIXME_ATTENTION_REQUIRED: <attention-id>`. Direct user-facing runs may print the block and wait normally when no parent or broker owns the prompt surface.

If attention mode is required but no current fixme-task liveness status id is available, stop with `FIXME_ATTENTION_BLOCKED`. Do not print a hidden prompt, do not create a new saved task, and do not guess that the parent will see normal output. The parent must restart or resume `fixme-task` with a `<liveness>` `statusId`.

Agent escalation prompts are user-input prompts. In attention mode, use the `lifecycle attention open` path to checkpoint `waitingForUser` and store the Agent Escalation block, and return `FIXME_ATTENTION_REQUIRED: <attention-id>` instead of relying on hidden text output.

Loop guard escalations are user-input prompts. In attention mode, use the `lifecycle attention open` path to checkpoint `waitingForUser` and store the Pipeline Escalation block, and return `FIXME_ATTENTION_REQUIRED: <attention-id>`. A loop guard escalation in parent-driven mode returns `FIXME_ATTENTION_REQUIRED: <attention-id>`, not a Run Summary.

Child skills never persist task-owned decisions, never own task-state user decisions, and never create a second saved task to collect an answer. When a child skill needs user input while running under `fixme-task`, it returns a child attention directive instead of waiting directly:

```text
FIXME_CHILD_ATTENTION_REQUIRED
SOURCE_SKILL: <child-skill-name>
KIND: <input-audit|design-decision|spec-decision|execution-ambiguity|other>
ANSWER_MODE: <freeform|decision-card|multiple-choice>
PROMPT_MARKDOWN:
<complete user-facing prompt>
END_PROMPT_MARKDOWN
```

When a dispatched child returns `FIXME_CHILD_ATTENTION_REQUIRED`, convert the child request into `lifecycle attention open` owned by `fixme-task`, using the checkpoint-first ordering below. Preserve the child output, dispatch inputs, artifact paths, `pendingDecision.attentionId`, `pendingDecision.attentionStatusId`, and cursor in `pendingDecision` so resume can re-dispatch the same child step after the answer is applied.

When `fixme-task` needs user input in attention mode, it must:

1. Build the complete user-facing prompt exactly as the Review Classification block or child-skill decision card should appear.
2. Generate the attention id before checkpointing task state. Use a new id in the form `attn_<short-unique-suffix>` and include that same `attentionId` in the attention payload.
3. Open the durable attention through a single `lifecycle attention open` call, which checkpoints task state before creating the attention record (checkpoint-first). Set the `checkpointData` to state `waitingForUser` with `pendingDecision.attentionId`, `pendingDecision.attentionStatusId`, the same `sourceSkill`, the current `cursor`, and enough routing context to re-dispatch the same handler or child step. `pendingDecision.attentionStatusId` is the current fixme-task liveness status id.
4. Open the prompt through:
   ```bash
   node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention open --fixme-dir <fixme-dir> --data '{"statusId":"<current-fixme-task-status-id>","taskStatePath":"<absolute-task-state-path>","checkpointData":{"status":"waitingForUser","pendingDecision":{...}},"attention":{"attentionId":"<attn-id>","ownerSkill":"fixme-task","sourceSkill":"<source>","kind":"<kind>","resumeRef":"<resume-ref>","taskStatePath":"<absolute-task-state-path>","promptMarkdown":"<prompt>","answerMode":"<answer-mode>"}}'
   ```
   Installed Codex skills use the Codex-installed tool path. The attention payload must include `attentionId`, `ownerSkill: "fixme-task"`, `sourceSkill`, `kind`, `resumeRef`, absolute `taskStatePath`, `promptMarkdown`, and `answerMode`.
5. `lifecycle attention open` is checkpoint-first and self-repairing: it checkpoints, then creates the attention; if attention creation fails it restores the pre-open task-state snapshot and returns `attentionBlocked` (`repaired:true`) or `ioFailure` (`repaired:false`). On `attentionBlocked` report `FIXME_ATTENTION_BLOCKED` with the failed command and attention id; on `ioFailure` mark the task failed/blocked. Do not return `FIXME_ATTENTION_REQUIRED` for a prompt the parent cannot show.
6. After a successful `lifecycle attention open`, do not send any ordinary `run ping` before returning `FIXME_ATTENTION_REQUIRED`; the helper already marked the run as waiting, and ordinary pings are rejected while `currentCommand` points at active attention.
7. Return the helper's `directive` as the final content:
   ```text
   FIXME_ATTENTION_REQUIRED: <attention-id>
   OWNER_SKILL: fixme-task
   RESUME_REF: <FIXME-N|task-path|state-path|ticket-path>
   ```

The parent runner, if any, is only a broker. It renders the attention prompt and records the answer through `lifecycle attention broker answer`; it never decides what the answer means. Only `fixme-task` persists the decision through `task decision append` after an attention answer, clears `pendingDecision`, and re-dispatches the same handler or child step.

When invoked with `--resume <ref> --answer-attention <attention-id>`:

1. Resolve the task state from `<ref>`.
2. Verify the state is `waitingForUser`.
3. Verify `pendingDecision.attentionId` matches `<attention-id>`.
4. Load the answered attention record from `pendingDecision.attentionStatusId`.
   Consume `--answer-attention` before any normal liveness ping, Agent dispatch, or status reset so the runtime does not reject the liveness update while the active `currentCommand: attention:<attention-id>` marker is still pending. Normal liveness resumes only after `run attention clear`.
5. Use `answer.answerKind` to distinguish `decision` from `clarificationRequest`. If the answered attention record contains `answerKind: "clarificationRequest"`, treat it as Discussion Mode input. Do not persist a task decision, do not clear `pendingDecision`, and do not advance the cursor.
6. For a clarification turn, answer the clarification from the task-owned context, then clear the consumed attention before creating the replacement attention. For a clarification turn, build the replacement prompt and open the replacement attention with another `lifecycle attention open`, and return the new `FIXME_ATTENTION_REQUIRED: <attention-id>`. The replacement prompt includes the clarification answer plus the still-unresolved decision points.
7. If `answer.answerKind` is `decision` but only some decision points are resolved, keep the parsed partial answers in `pendingDecision.partialAnswers`, do not persist a task decision, do not advance the cursor, and clear the consumed attention before creating the replacement attention. For partial decision answers, build the replacement prompt for only the unresolved decision points and open the replacement attention with another `lifecycle attention open`, and return the new `FIXME_ATTENTION_REQUIRED: <attention-id>`.
8. If `answer.answerKind` is `decision` and the answer resolves the pending decision, apply the answer to the pending decision plus any `pendingDecision.partialAnswers`, persist the decision with `task decision append --state <task-state-path> --data '<decision-record-json>'` for every answered attention decision that constrains task behavior, run `run attention clear --fixme-dir <fixme-dir> --status-id <pendingDecision.attentionStatusId> --attention-id <attention-id>`, clear `pendingDecision`, set status back to `running`, and continue from the stored cursor. In attention mode, `--answer-attention` supplies the answer for ASK_USER Batching.
9. If the pending decision came from `FIXME_CHILD_ATTENTION_REQUIRED`, re-dispatch the same child step with the answered input, the same source artifact paths, and the current decision log. Do not advance the cursor until that child step returns a normal artifact or routing directive.

If the attention record is missing, unanswered, or does not match `pendingDecision.attentionId`, stop and report the mismatch. Do not create a new saved task and do not re-ask a different question.

#### Attention Resume Examples

These examples are executable shapes, not new task creation. The saved task already exists; `--resume` points at it, and `--answer-attention` points at the answered durable prompt.

Attention examples use the same checkpoint-first order as the main contract.

**Inside `fixme-task`, handler asks for input:** If `fixme-handle-code-review` returns `HANDLER_RESULT: HAS_ASK_USER`, `fixme-task` first generates `attn_review_123`, checkpoints `pendingDecision.attentionId` and `pendingDecision.attentionStatusId`, then stores the Review Classification block:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention open --fixme-dir <fixme-dir> --data '{"statusId":"<fixmeTaskStatusId>","taskStatePath":"<absolute-task-state-path>","checkpointData":{"status":"waitingForUser","pendingDecision":{"attentionId":"attn_review_123"}},"attention":{"attentionId":"attn_review_123","ownerSkill":"fixme-task","sourceSkill":"fixme-handle-code-review","kind":"reviewDecision","resumeRef":"FIXME-13","taskStatePath":"<absolute-task-state-path>","promptMarkdown":"<Review Classification block>","answerMode":"decision-card"}}'
```

Then it returns:

```text
FIXME_ATTENTION_REQUIRED: attn_review_123
OWNER_SKILL: fixme-task
RESUME_REF: FIXME-13
```

**Inside `fixme-task`, child skill asks for input:** If `fixme-write-plan`, `fixme-execute-plan`, or another child returns `FIXME_CHILD_ATTENTION_REQUIRED`, `fixme-task` creates the same `lifecycle attention open` record with `ownerSkill: "fixme-task"` and `sourceSkill` copied from the child directive. Parent brokers do not need to know whether the prompt came from native review routing or from `fixme-handle-plan-review`; both resume the same way.

**Claude parent broker, inline task transport:** After `lifecycle attention broker show` and `lifecycle attention broker answer`, resume the existing inline-transport task:

```text
Skill("fixme-task", "--resume FIXME-13 --answer-attention attn_review_123")
```

The parent supplied `transport=inline-skill` and `parentContinuation` via `lifecycle dispatch prepare`; transport is launch metadata, not a `fixme-task` flag. If the parent has the current `fixmeTaskStatusId`, keep that same liveness status in the resumed invocation context. The status id is context, not a command-line flag.

**Codex parent broker, inline task transport:** Load the installed Codex skill and run the same workflow arguments:

```text
$HOME/.codex/skills/fixme-task/SKILL.md
args: --resume FIXME-13 --answer-attention attn_review_123
```

Use `$HOME/.codex/skills/fixme-tools/scripts/fixme-tools.cjs` for the preceding `lifecycle attention broker show` and `lifecycle attention broker answer` calls.

**Background task broker:** A session broker resumes the `fixme-task` agent with the same `--resume FIXME-13 --answer-attention attn_review_123` arguments. In Claude this is an `Agent(subagent_type="fixme-task", ...)` resume prompt; in Codex this is `spawn_agent(agent_type="fixme-task", message=...)` with the resolved reasoning effort. In both runtimes, the broker only renders and records the user's answer; the resumed `fixme-task` consumes the answer, writes decisions, clears attention, and continues.

## Ticket Integration (Optional)

### When `--ticket <path>` is provided:

Ticket mode. The orchestrator tracks pipeline progress via ticket state transitions.

- **Before the first phase dispatch**: initialize low-level task state with:
  ```bash
  node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --ticket <ticket-path> --pipeline-resolution '<pipeline-resolution-json>' --project-root <project-root>
  ```
  Store the returned `statePath` as `taskStatePath`.
- **At each phase start**: dispatch ticket transition through the `fixme-tickets` abstraction skill (Agent tool with the fixme-tickets SKILL.md). The fixme-tickets skill handles backend resolution and CLI invocation internally.
  - First transition includes `--pipeline <name>` flag to store the pipeline name in the ticket
  - Subsequent transitions omit the `--pipeline` flag (already stored)
- **After every low-level routing change**: update `taskStatePath` with `task checkpoint --state <task-state-path> --data '<json-object>'`.
- **On pipeline completion**: do NOT transition to `done`. The session orchestrator owns terminal transitions (`done`, `failed`, `skipped`) because they require cleanup (git commit/revert). Report success via output.
- **On pipeline failure**: do NOT transition to `failed`. Report failure details via output. The session orchestrator handles the terminal transition.
- **Report final status** in the Run Summary: success/failure + details for the session to act on.

**Dispatch format for ticket transitions:**

```
Operation: transition
Arguments: <ticket-path> <phase-name> [--pipeline <pipeline-name>] [--reason <reason>]
```

Backward transitions (review retry) require `--reason`. Forward transitions do not.

### When no `--ticket` is provided:

No-ticket mode, including parent-driven dispatches (transport `inline-skill`/`background` with `parentContinuation`), must still create or reuse a saved task state before the first phase dispatch. Execute the pipeline identically but skip all ticket transition dispatches. If the run did not start from terminal save mode or `--resume`, first create a saved task with `task save --data '<json-object>'` and use the returned `taskPath` and `statePath`. This saved task is the `resumeRef` boundary for later `--answer-attention` resumes. Parent-driven dispatches persist `parentContinuation` into task state before child work. No-ticket task state is mandatory so another session can resume without chat history.

## Dispatch Gate (NON-NEGOTIABLE)

You have resolved the task, pipeline, entry point, and ticket path. STOP HERE.

Do NOT:
- Read source code files
- Explore the codebase
- Investigate the problem
- Form a mental model of the root cause
- "Just check" how something works
- Read files to "provide better context" to the agent

All codebase understanding happens INSIDE dispatched agents. They have full tool access and will explore thoroughly.

Dispatch the first agent NOW with the resolved task description and entry point.

If you find yourself understanding the root cause before dispatching, you have already violated this gate. The deeper your understanding, the stronger the temptation to bypass the pipeline - and the more certain you should be that you need the pipeline's review loops to catch what your confidence blinds you to.

## Orchestrator Tool Allowlist

The orchestrator may ONLY use these tools:
- **Agent** - to dispatch sub-skills (phase skills, review skills, ticket transitions)
- **Read** - ONLY on `<fixme-dir>/config.json`, `<fixme-dir>/tasks/*.md`, `<fixme-dir>/tasks/*.state.json`, ticket `task-state.json` files, `<fixme-dir>/specs/**/*.md`, `<fixme-dir>/plans/*.md`, `<fixme-dir>/context/*-code-map.md`, `<fixme-dir>/decisions.md`, or specification/plan/code-map files referenced in conversation
- **Bash** - ONLY:
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` (the FIRST command, always)
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data '<json-object>'`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --ticket <ticket-path> --pipeline-resolution '<pipeline-resolution-json>' --project-root <project-root>`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --task <task-path> --pipeline-resolution '<pipeline-resolution-json>' --project-root <project-root>`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task checkpoint --state <task-state-path> --data '<json-object>'`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task decision append --state <task-state-path> --data '<decision-record-json>'`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task decision list --state <task-state-path> --format markdown`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task result write --state <task-state-path> --data '<json-object>'`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle invocation start --fixme-dir <fixme-dir> --data '<json-object>'`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle invocation finish --fixme-dir <fixme-dir> --invocation-id <id> --outcome <complete|failed|aborted>`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare --fixme-dir <fixme-dir> --data '<json-object>'` (before each Agent dispatch; installed Codex skills use the `.codex` tool path)
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch complete --fixme-dir <fixme-dir> --data '<json-object>'` (after each dispatched agent returns)
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention open --fixme-dir <fixme-dir> --data '<json-object>'`
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle task-event record --fixme-dir <fixme-dir> --data '<json-object>'` (parent-driven runs only)
  - `mkdir -p <fixme-dir>`, `mkdir -p <fixme-dir>/plans`, `mkdir -p <fixme-dir>/specs/product`, or `mkdir -p <fixme-dir>/specs/technical` (using the resolved path, never literal `.fixme/`)

  Any Bash command with a literal `.fixme/` argument is forbidden. The value `<fixme-dir>` must be a substituted absolute path before the command runs.
- **TodoWrite** - to create and track the dispatch manifest steps

Any other tool use (Read on source code, Grep, Glob, Edit on source code) **during active pipeline execution** is a pipeline violation. If you need information from the codebase mid-dispatch, dispatch an agent to get it.

**Decision-pause carve-out:** during a decision pause (after a HAS_ASK_USER Review Classification block, before the user has provided decisions) the orchestrator may use Read, Grep, Glob, and read-only Bash on source files to help the user understand the decision and to answer their clarifying questions inline. Edit on source code remains forbidden at all times - the pipeline owns implementation. See "Discussion Mode (Decision-Pause Carve-Out)" near the top of this file for the full contract.

## Dispatch Manifest (NON-NEGOTIABLE)

Before dispatching ANY agent, expand the full pipeline into a flat, numbered dispatch manifest using TodoWrite. Every step - including review and handler steps - becomes an explicit entry. This eliminates conditional branching ("does this phase have a review?") and makes skipping review phases structurally impossible.

### Building the Manifest

Always build the manifest for ALL phases in the pipeline, regardless of entry point. For each phase, add entries in this order:

1. One dispatch entry per skill in `phase.skills`
2. If `phase.review` exists and `review.enabled !== false`:
   a. One dispatch entry per skill in `phase.review.skills` (reviewer first, then handler)
   b. One routing entry with explicit jump targets

After the last phase: add a "Run Summary" entry.

Tag each entry with its phase name and step type: `[phase-name]` for execute steps, `[phase-name/review]` for review steps, `[phase-name/route]` for routing steps.

**Entry point marking:** After building the full manifest, apply the entry point. Mark all steps before the entry point as `completed`. Set the entry point step to `in_progress`. All subsequent steps remain `pending`. This ensures the full manifest exists for cross-phase backward jumps, while execution starts from the correct point.

### Example: Default Pipeline Manifest

For the hardcoded standard pipeline (no ticket):

```
Step 1  [plan]              Dispatch fixme-write-plan
Step 2  [plan/review]       Dispatch fixme-review-plan
Step 3  [plan/review]       Dispatch fixme-handle-plan-review
Step 4  [plan/route]        Route: CLEAN->5, PLAN_REQUIRED->1 (max 3), FOLLOWUP_ONLY->5, HAS_ASK_USER->decision input then re-run 3
Step 5  [implement]         Dispatch fixme-execute-plan
Step 6  [implement/review]  Dispatch fixme-review-code
Step 7  [implement/review]  Dispatch fixme-handle-code-review
Step 8  [implement/route]   Route: CLEAN->9, PLAN_REQUIRED->1 (outer, max workflows.<pipeline>.outerMaxCycles), IMPLEMENT_ONLY->5 repair mode, HAS_ASK_USER->decision input then re-run 7
Step 9  [done]              Run Summary
```

The manifest always contains ALL steps. When entering mid-pipeline (e.g., plan already exists), pre-entry steps are marked `completed` so backward jumps have valid targets. Example: entering at implement phase marks steps 1-4 as `completed` and step 5 as `in_progress`.

### Routing Rules

Each routing entry specifies explicit jump targets:

Handler route actions use this contract: `NEXT_ACTION: DONE | SPEC_REVISION | PLAN_REVISION | IMPLEMENT_REPAIR | ASK_USER_BATCH | FOLLOWUP_ONLY`. Spec handlers use `SPEC_REVISION`; plan/code handlers use `PLAN_REVISION` or `IMPLEMENT_REPAIR`. `FOLLOWUP_ONLY`, `ASK_USER_BATCH`, and `DONE` apply to all handlers.

- **CLEAN**: advance to the next numbered step
- **HAS_BLOCKING_FIX with SPEC_REVISION**: jump back to the specification phase's first execute step. Increment the phase review counter. If counter > `phase.review.maxCycles` (default 3): escalate through the Loop Guard Escalation Format.
- **HAS_BLOCKING_FIX with PLAN_REQUIRED (intra-phase)**: jump back to the phase's first execute step. Increment the phase review counter. If counter > `phase.review.maxCycles` (default 3): escalate through the Loop Guard Escalation Format.
- **HAS_BLOCKING_FIX with PLAN_REQUIRED (cross-phase)**: jump back to the earlier phase's first execute step. Increment the outer loop counter. PLAN_REQUIRED findings use the outer loop and count against outerMaxCycles. If counter > `workflows.<pipelineName>.outerMaxCycles` (default 2): escalate through the Loop Guard Escalation Format. If ticket path provided: dispatch ticket backward transition with `--reason` before re-entering.
- **HAS_BLOCKING_FIX with IMPLEMENT_ONLY**: jump back to the current implementation phase's execute step in repair mode. IMPLEMENT_ONLY findings route to fixme-execute-plan repair mode and do not count against outerMaxCycles.
- **HAS_NONBLOCKING_FINDINGS**: print the review classification, record follow-up-only items in the run summary, and advance without re-running the producer. MINOR and INFO findings are reported as follow-up-only and do not trigger loop counters.
- **HAS_ASK_USER**: batch questions for user input through the direct-or-attention path (see ASK_USER Batching), persist the answer with `task decision append` after it is available, and re-dispatch the handler (go back to the handler entry, NOT this routing step). Do NOT advance past the routing step until the handler returns CLEAN, HAS_BLOCKING_FIX, or HAS_NONBLOCKING_FINDINGS.

### Edge-Case Validity Routing

Handlers may include edge-case validity classifications in addition to the normal `Classification` field. These classifications make the support decision explicit without changing the top-level `HANDLER_RESULT` contract.

- FIX_FAIL_FAST counts as a blocking fix when severity is BLOCKER or MAJOR, and as a follow-up item when severity is MINOR or INFO. It routes through the same producer loop as a normal FIX, but the producer must reject, constrain, parse, type-narrow, or fail earlier instead of adding downstream support for the invalid state.
- ASK_USER_VALIDITY counts as a decision needed. It routes through the normal decision batching flow and asks whether the reported state should be supported before any fix approach is selected.
- `REJECT_IMPOSSIBLE` and `REJECT_UNSUPPORTED` are dismissed findings. They appear in the Review Classification block as dismissed findings and do not trigger producer loops.

### PR Comment Triage Inputs

When invoked by `fixme-pr-comments`, the task input may already contain risk-aware PR comment triage. Incoming PR comment fix items may include VERDICT, SEVERITY, COMPLEXITY, CONFIDENCE, ROUTE, and ROUTE_SCOPE metadata.

Use that metadata as intake routing context, not as a substitute for normal plan and code review:

- Only items with ROUTE: CURRENT_PR_FIX enter the producer/review loop.
- FOLLOWUP_ONLY and INFO items are recorded in the run summary and never trigger planning, execution, or loop counters.
- Batch CURRENT_PR_FIX items by dependency cluster, not by comment source.
- Split dispatch only when a high-complexity PLAN_REQUIRED fix touches an unrelated subsystem or blocks low-risk fixes.
- `ROUTE_SCOPE` governs review-loop routing only - it does not shortcut entry into the pipeline. A fresh fixme-task entry always starts at the plan phase regardless of incoming `ROUTE_SCOPE`, because there is no existing plan to repair against. `IMPLEMENT_ONLY` takes effect during the code review loop (Step 8): blocking FIX items skip replanning and route directly back to `fixme-execute-plan` in repair mode. `PLAN_REQUIRED` items in that same loop trigger plan revision and count against `outerMaxCycles`.
- IMPLEMENT_ONLY repair keeps the current plan but returns to a full code review before the pipeline can advance.

The planner and executor still validate the requested route. If a supposedly implementation-only PR fix actually requires plan, contract, persistence, migration, or acceptance-criteria changes, promote it to `PLAN_REQUIRED` before execution. If a current PR fix is found to be valid but disproportionate for this PR after deeper inspection, demote it to `FOLLOWUP_ONLY`, record the reason, and do not spend a revision cycle on it.

When the dispatch input already contains a complete pre-planned recipe (TDD steps, exact file paths, exact code, exact commit message - typical for `fixme-pr-comments` PR fix dispatches), the planner runs in validate-and-persist mode rather than re-design mode. See `fixme-write-plan`'s "Pre-Planned Input" section for the contract.

### Creating the Manifest with TodoWrite

After building the manifest, create it using TodoWrite. One todo per step. All steps start as `pending` for a fresh pipeline, or with pre-entry steps as `completed` for mid-pipeline entry.

The manifest is created in one of two modes depending on whether this run is parent-driven (a `parentContinuation` block is present in task state / the dispatch prompt) as determined in Argument Parsing:

- **Standalone mode** (default): replace the todo list entirely with the standard manifest. Use this for `/fixme-task` invocations and for dispatch from `fixme-session` or any other parent that does not own a wrapping todo list.
- **Parent-driven mode** (`parentContinuation` is present): preserve the parent's todo list and replace ONLY the parent's `in_progress` dispatch placeholder for this skill with the expanded substeps. Used by `fixme-pr-comments` and any other parent that wraps `fixme-task` (via transport `inline-skill`/`background` with `parentContinuation`) with surrounding workflow steps.

**Fresh start (standalone, no prior state):**
```
TodoWrite([
  { content: "Step 1 [plan] Dispatch fixme-write-plan", status: "in_progress", activeForm: "Dispatching fixme-write-plan" },
  { content: "Step 2 [plan/review] Dispatch fixme-review-plan", status: "pending", activeForm: "Dispatching fixme-review-plan" },
  { content: "Step 3 [plan/review] Dispatch fixme-handle-plan-review", status: "pending", activeForm: "Dispatching fixme-handle-plan-review" },
  { content: "Step 4 [plan/route] Route on HANDLER_RESULT", status: "pending", activeForm: "Routing on plan review result" },
  { content: "Step 5 [implement] Dispatch fixme-execute-plan", status: "pending", activeForm: "Dispatching fixme-execute-plan" },
  { content: "Step 6 [implement/review] Dispatch fixme-review-code", status: "pending", activeForm: "Dispatching fixme-review-code" },
  { content: "Step 7 [implement/review] Dispatch fixme-handle-code-review", status: "pending", activeForm: "Dispatching fixme-handle-code-review" },
  { content: "Step 8 [implement/route] Route on HANDLER_RESULT", status: "pending", activeForm: "Routing on code review result" },
  { content: "Step 9 [done] Run Summary", status: "pending", activeForm: "Writing run summary" }
])
```

**Mid-pipeline entry (standalone, plan exists, entering at plan review):**
```
TodoWrite([
  { content: "Step 1 [plan] Dispatch fixme-write-plan", status: "completed", activeForm: "Dispatching fixme-write-plan" },
  { content: "Step 2 [plan/review] Dispatch fixme-review-plan", status: "in_progress", activeForm: "Dispatching fixme-review-plan" },
  ...remaining steps as pending...
])
```

**Parent-driven mode (`parentContinuation` present):**

When parent-driven, the parent skill (e.g. `fixme-pr-comments`) has already created a todo list with a single `in_progress` placeholder dispatching this skill - typically labeled `Step N [dispatch] Dispatch Skill(fixme-task) ...` or similar. The most recent `TodoWrite` tool call in conversation history is the source of truth for the parent's list.

**CRITICAL: Parent-driven mode produces NO Run Summary and has NO terminal `[done]` step.** The parent skill owns the workflow's final summary at its own terminal step (e.g. `fixme-pr-comments`'s `Step 15 [done] Run summary`). fixme-task in parent-driven mode ends at the implement-routing step (own `Step N.8`) - there is no `Step N.9`. After `Step N.8` is marked `completed`, control passes immediately to the parent's next pending step in the same turn. Do NOT print a `## Run Summary` block. Do NOT write a paragraph announcing the handoff. Just continue executing the parent's next step.

Construction rules:

1. Locate the parent's `in_progress` placeholder by scanning the latest todo state in conversation history. The placeholder is the single `in_progress` item whose content references dispatching `fixme-task` (text such as `Dispatch Skill(fixme-task)`, `Dispatch fixme-task`, or `dispatch fixme-task`).
2. Note the parent's step number on that placeholder (e.g. parent's `Step 9`). This becomes the prefix for own substeps - parent's `Step 9` -> own steps `Step 9.1` through `Step 9.8`. If no parent step number is detectable, use `9.` as the prefix (the conventional position).
3. Build own substeps from the standalone manifest's Steps 1-8 ONLY (omit Step 9 "Run Summary" entirely - parent-driven mode does not have a Run Summary step), with each step content prefixed by the parent step number. Example: `Step 1 [plan] Dispatch fixme-write-plan` becomes `Step 9.1 [plan] Dispatch fixme-write-plan`. The full parent-driven substep list is `Step N.1` ... `Step N.8`.
4. The first own substep is `in_progress`. All other own substeps are `pending` (or `completed` for mid-pipeline entry, same as standalone mode).
5. Issue ONE `TodoWrite` call that emits the full merged list: every parent item before the placeholder (status unchanged) + own substeps (replacing the placeholder) + every parent item after the placeholder (status unchanged).
6. Every subsequent `TodoWrite` call (for status updates as the pipeline progresses) MUST also include the full merged list. Parent items before and after own substeps must be carried through every call with their statuses preserved exactly as they were in the most recent state. Never drop parent items.
7. **Handoff at Step N.8.** When the implement-routing step (own `Step N.8`) returns CLEAN and the pipeline has nothing more to do internally, you have reached the handoff point. In the SAME TURN as marking `Step N.8 completed`:
   - In the same TodoWrite call that marks `Step N.8 completed`, also mark the immediately-following parent pending item (e.g. parent's `Step 10 [verify]`) as `in_progress`.
   - Do NOT output any `## Run Summary` block. Do NOT output any structured ending document. Do NOT write a paragraph that says "returning control to...", "the pipeline is complete", "now handing off", or any equivalent narration. The parent owns the summary at its own terminal step.
   - Begin executing the parent's next step's instructions immediately. The parent skill's content (e.g. `fixme-pr-comments`) is in conversation history - read what its Step 10 says to do (typically: run build/lint/test verification commands) and start doing it in this turn.
   - Do NOT end the turn after marking Step N.8 completed. Continue with the parent's Step 10 action (e.g. running `bun run biome:check && bun run typecheck && bun run test`) before stopping.
8. This skill does NOT mark any parent items completed during its own substeps - that is the parent's responsibility (and the model continues to be the parent at the handoff point, marking each parent step completed as it finishes).

**Nested mode example** (parent is `fixme-pr-comments` at Step 9, full default pipeline):

Parent list before parent-driven dispatch:
```
[
  { content: "Step 1 [fetch] Fetch three GitHub API surfaces with pagination", status: "completed", ... },
  { content: "Step 2 [fetch/display] Normalize and display review_item records", status: "completed", ... },
  { content: "Step 3 [analyze] Analyze every item individually", status: "completed", ... },
  { content: "Step 4 [analyze/present] Present `## PR Comment Analysis` AND immediately dispatch Step 9 in same turn", status: "completed", ... },
  { content: "Step 5 [analyze/route] Route on consultation need", status: "completed", ... },
  { content: "Step 6 [consult] Run consultation loop until all decisions resolved", status: "completed", ... },
  { content: "Step 7 [consult/route] Route to dispatch (no --pause confirmation gate)", status: "completed", ... },
  { content: "Step 9 [dispatch] Dispatch Skill(fixme-task) with CURRENT_PR_FIX groups (SAME TURN as Step 4)", status: "in_progress", ... },
  { content: "Step 10 [verify] Run build/lint/test", status: "pending", ... },
  { content: "Step 11 [commit/route] Route on --skip-commit", status: "pending", ... },
  { content: "Step 12 [commit] Commit and push", status: "pending", ... },
  { content: "Step 13 [resolve/route] Route on --skip-resolve", status: "pending", ... },
  { content: "Step 14 [resolve] Build reply execution table, preflight reply bodies, then reply/resolve", status: "pending", ... },
  { content: "Step 15 [done] Run summary", status: "pending", ... }
]
```

First merged TodoWrite call from parent-driven fixme-task:
```
TodoWrite([
  { content: "Step 1 [fetch] Fetch three GitHub API surfaces with pagination", status: "completed", ... },
  { content: "Step 2 [fetch/display] Normalize and display review_item records", status: "completed", ... },
  { content: "Step 3 [analyze] Analyze every item individually", status: "completed", ... },
  { content: "Step 4 [analyze/present] Present `## PR Comment Analysis` AND immediately dispatch Step 9 in same turn", status: "completed", ... },
  { content: "Step 5 [analyze/route] Route on consultation need", status: "completed", ... },
  { content: "Step 6 [consult] Run consultation loop until all decisions resolved", status: "completed", ... },
  { content: "Step 7 [consult/route] Route to dispatch (no --pause confirmation gate)", status: "completed", ... },
  { content: "Step 9.1 [plan] Dispatch fixme-write-plan", status: "in_progress", activeForm: "Dispatching fixme-write-plan" },
  { content: "Step 9.2 [plan/review] Dispatch fixme-review-plan", status: "pending", activeForm: "Dispatching fixme-review-plan" },
  { content: "Step 9.3 [plan/review] Dispatch fixme-handle-plan-review", status: "pending", activeForm: "Dispatching fixme-handle-plan-review" },
  { content: "Step 9.4 [plan/route] Route on HANDLER_RESULT", status: "pending", activeForm: "Routing on plan review result" },
  { content: "Step 9.5 [implement] Dispatch fixme-execute-plan", status: "pending", activeForm: "Dispatching fixme-execute-plan" },
  { content: "Step 9.6 [implement/review] Dispatch fixme-review-code", status: "pending", activeForm: "Dispatching fixme-review-code" },
  { content: "Step 9.7 [implement/review] Dispatch fixme-handle-code-review", status: "pending", activeForm: "Dispatching fixme-handle-code-review" },
  { content: "Step 9.8 [implement/route] Route on HANDLER_RESULT", status: "pending", activeForm: "Routing on code review result" },
  { content: "Step 10 [verify] Run build/lint/test", status: "pending", ... },
  { content: "Step 11 [commit/route] Route on --skip-commit", status: "pending", ... },
  { content: "Step 12 [commit] Commit and push", status: "pending", ... },
  { content: "Step 13 [resolve/route] Route on --skip-resolve", status: "pending", ... },
  { content: "Step 14 [resolve] Build reply execution table, preflight reply bodies, then reply/resolve", status: "pending", ... },
  { content: "Step 15 [done] Run summary", status: "pending", ... }
])
```

The parent's `Step 9 [dispatch]` placeholder is gone - it has been replaced by the eight `Step 9.1` ... `Step 9.8` substeps. There is NO `Step 9.9` and NO Run Summary in parent-driven mode - the parent owns the final summary at its own terminal step (`Step 15 [done] Run summary`). Every other parent item is carried through unchanged. When `Step 9.8` is marked `completed` (CLEAN handler result), the same TodoWrite call also marks `Step 10 [verify]` as `in_progress`, and the model immediately starts executing the parent's Step 10 (running build/lint/test) in the same turn. No paragraph announcing the handoff. No Run Summary. Just continue with the parent's next step.

### Following the Manifest

Execute steps in order. After each dispatch:

1. Process the output (see Step Processing below)
2. Mark the current step `completed` via TodoWrite
3. Set the next step to `in_progress`
4. Dispatch the next agent - or jump per routing rules

**Never skip steps. Never combine steps. Never "optimize" the sequence. The manifest is the law.**

**Never treat any step as pipeline completion unless it is the Run Summary step.** If uncompleted steps remain in the manifest, the pipeline is not done. If you feel like outputting a completion message and there are pending steps, STOP - you are about to skip remaining phases.

### Ticket Transitions

If ticket path is provided, dispatch ticket transitions before each phase's first execute step:

- First phase: include `--pipeline <pipeline-name>`
- Backward re-entry for blocking PLAN_REQUIRED cross-phase jump: include `--reason <reason>`

Ticket transitions are dispatched inline before the execute step - they are not separate manifest entries. They do not produce output that affects routing.

## Sub-Skill Dispatch

Dispatch each sub-skill as an isolated agent via the Agent tool. Pass all required inputs as prompt content. The agent does the work. You route the output. That's the entire job.

### Dispatch contract (NON-NEGOTIABLE)

Dispatch sub-skills using their agent type via `subagent_type`. Each fixme sub-skill has an agent definition in `~/.claude/agents/` that binds its role constraints (identity, boundaries, tool restrictions) at the system level and preloads its SKILL.md via `skills` frontmatter.

**Never paste SKILL.md content into the agent prompt.** Never tell agents to "read your SKILL.md first." The agent definition handles both role binding and SKILL.md preloading.

**Before every Agent dispatch, prepare the dispatch via the lifecycle helper and print a visibility banner.** This is non-negotiable. The orchestrator must not dispatch without first asking the tool what model or reasoning controls to use, and must not dispatch silently.

Step 1 - Prepare the dispatch (resolves runtime settings, creates the child liveness status, updates the parent heartbeat, and builds the banner + prompt blocks in one call):

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare --fixme-dir <fixme-dir> --data '{"idempotencyKey":"<stable-key>","agentName":"<agent-name>","transport":"agent","parentInvocationId":"<usageInvocationId>","pipelineRunId":"<pipelineRunId>","taskStatePath":"<task-state-path>","promptInputs":{...}}'
```

Returns `{ok:true, dispatchId, statusId, statusPath, runtimeSettings, bannerMarkdown, usageContext, promptBlocks}`. `runtimeSettings` contains `runtime`/`model`/`reasoning_effort`/`profile`/`source` (do not hardcode models, reasoning effort, or runtime behavior). Codex `runtimeSettings.model` is intentionally `null`; preserve the user-selected Codex model and pass only `reasoning_effort` when present. Store the returned `statusId` as the dispatched agent's liveness status. Do not dispatch the agent if `lifecycle dispatch prepare` fails; surface the failure with the agent name, `<fixme-dir>`, and the JSON error, then stop the current manifest step.

Installed Codex skills use the Codex-installed tool path `node ~/.codex/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare ...`.

After the dispatched agent returns, finalize the child liveness status:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch complete --fixme-dir <fixme-dir> --data '{"dispatchId":"<dispatchId>","statusId":"<statusId>","status":"<completed|failed>"}'
```

Step 2.5 - Refresh this fixme-task invocation's own liveness while it waits on the dispatched agent:

Before every Agent dispatch wait, ping the current fixme-task invocation if this fixme-task invocation received its own `<liveness>` `statusId`:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run ping --fixme-dir <fixme-dir> --status-id <current-fixme-task-status-id> --state running --checkpoint working --current-command "waiting for <agent-name>"
```

Installed Codex skills use the Codex-installed tool path:

```bash
node ~/.codex/skills/fixme-tools/scripts/fixme-tools.cjs run ping --fixme-dir <fixme-dir> --status-id <current-fixme-task-status-id> --state running --checkpoint working --current-command "waiting for <agent-name>"
```

After the dispatched agent returns, ping the current fixme-task invocation again:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run ping --fixme-dir <fixme-dir> --status-id <current-fixme-task-status-id> --state running --checkpoint working --current-command null
```

If the current fixme-task invocation did not receive its own `<liveness>` `statusId`, skip only these parent heartbeat pings and continue the normal dispatch path while no user-input prompt is pending. The child agent still receives its own liveness status id from Step 4. If a later user-input prompt needs attention, the missing parent status id triggers `FIXME_ATTENTION_BLOCKED`.

Step 3 - Print the banner as a single line of user-visible text before the Agent tool call:

```
→ dispatching fixme-write-plan (runtime: claude, model: opus, reasoning: xhigh, profile: quality, source: profile)
```

The banner is the user's only window into runtime selection. If you dispatch without it, you are hiding state the user needs to audit runtime behavior.

Step 4 - Dispatch with the resolved runtime settings and liveness id:

```
Agent(
  subagent_type="{skill-name}",
  model="{resolved-model}",
  reasoning_effort="{resolved-reasoning-effort}",
  prompt="
    <task>
    [operation description with specific inputs]
    </task>

    <project>
    Project root: [path]
    Fixme dir: [fixmeDir from root resolution]
    </project>

    <usage>
    pipelineRunId: <pipelineRunId>
    parentInvocationId: <usageInvocationId>
    </usage>

    <task-state-owner>
    ownerSkill: fixme-task
    resumeRef: <FIXME-N|task-path|state-path|ticket-path>
    taskStatePath: <task-state-path>
    </task-state-owner>

    <liveness>
    statusId: <statusId from lifecycle dispatch prepare>
    </liveness>
  "
)
```

When `model` or `reasoning_effort` is `null`, omit that field from the Agent dispatch instead of passing a string value.

Include the `<usage>` block only when both `pipelineRunId` and `usageInvocationId` are known. Child skill dispatches inside `fixme-task` must receive the same `pipelineRunId` and the dispatching `fixme-task` `parentInvocationId`; non-pipeline direct skill invocations omit both fields.

Include the `<task-state-owner>` block only when this dispatch is part of a resumable `fixme-task` run with a known task state. It tells child skills that user-facing pauses must return `FIXME_CHILD_ATTENTION_REQUIRED` to `fixme-task` instead of calling AskUserQuestion or waiting directly.

Always include the `<liveness>` block for every Agent dispatch after `lifecycle dispatch prepare` succeeds. The receiving agent uses `statusId` plus the `Fixme dir:` value in the `<project>` block to ping `fixme-tools.cjs run ping`.

The agent's role and operational procedures are already loaded by its agent definition. The dispatch prompt only contains task-specific inputs.

### Tool restrictions

Tool access for each sub-skill is enforced by its agent definition in `~/.claude/agents/`. Read-only agents (reviewers, handlers) have no Edit or Write tools. Write-access agents (plan writer, executor, investigator, researcher, browser verifier) have full tool access. See the agent definition files for specifics.

### Model Resolution

Model and reasoning resolution is performed by `fixme-tools.cjs resolve-model` (see the dispatch contract above). The CLI is the authoritative source for the profile tables and the `override > profile > default` resolution order.

Claude runtime receives short model tags only (`opus`, `sonnet`, `haiku`, `inherit`) plus agent-specific `reasoning_effort` for every non-inherit model. Specification, planning, review, and classifier agents use `xhigh`; `fixme-execute-plan` uses `medium`; other agents use `high`. No versioned Claude model IDs are emitted.

Codex runtime receives no model value. It receives only `reasoning_effort`, so the user-selected Codex model remains in force. Inherit omits both model and reasoning controls. `fixme-execute-plan` uses `medium` on Codex across profiles too, because implementation should spend less reasoning than planning and review.

**`source` field values:**
- `override` - came from `models.overrides[agent]`
- `profile` - came from the profile table lookup
- `default` - nothing applied (no config, unknown profile, or agent absent from the profile table)

Claude profile quick reference (authoritative table lives in `fixme-tools.cjs`):

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| fixme-write-plan | opus | opus | sonnet |
| fixme-write-product-spec | opus | opus | sonnet |
| fixme-write-technical-spec | opus | opus | sonnet |
| fixme-review-spec | opus | opus | sonnet |
| fixme-review-plan | opus | opus | sonnet |
| fixme-review-code | opus | opus | sonnet |
| fixme-investigate | opus | opus | sonnet |
| fixme-research | opus | opus | sonnet |
| fixme-handle-spec-review | opus | opus | sonnet |
| fixme-handle-plan-review | opus | opus | sonnet |
| fixme-handle-code-review | opus | opus | sonnet |
| fixme-execute-plan | opus | sonnet | sonnet |
| fixme-task | opus | sonnet | haiku |
| fixme-browser-verify | opus | sonnet | haiku |

Codex reasoning quick reference:

| Agent group | quality | balanced | budget |
|-------------|---------|----------|--------|
| planning, specs, review, handlers, research, investigation | xhigh | xhigh | high |
| fixme-task | xhigh | xhigh | medium |
| fixme-execute-plan | medium | medium | medium |
| fixme-browser-verify | xhigh | high | medium |

**Config example:**

```json
{
  "models": {
    "profile": "balanced",
    "overrides": {
      "fixme-execute-plan": "opus"
    }
  }
}
```

Valid model override values: `opus`, `sonnet`, `haiku`, `inherit`. Config writes validate override values; malformed hand-edited values may still surface from an existing config, so the visibility banner must be checked before dispatch.

### Ticket transition dispatch

Ticket transitions are dispatched through the `fixme-tickets` abstraction skill, not directly to any backend.

1. Dispatch via Agent with a prompt that tells the agent to read its own SKILL.md first:
   ```
   First, read ~/.claude/skills/fixme-tickets/SKILL.md for your role instructions.

   Then execute this operation:
   - Operation: [transition/create/list/etc.]
   - Arguments: [all arguments]
   - Project root: [path]
   ```
2. The fixme-tickets skill resolves the backend from `<fixme-dir>/config.json` and handles the rest

### Phase-specific dispatch contracts

For phases using the standard skills, these are the input contracts:

Custom skills and standard skills also receive the `<liveness>` block. They also receive the `<usage>` block when `pipelineRunId` and `usageInvocationId` are known.

**fixme-write-plan** (in `plan` phase):
- Fresh mode (first invocation): original task description
- PR comment task mode: original task description + only `ROUTE: CURRENT_PR_FIX` groups + their `VERDICT`, `SEVERITY`, `COMPLEXITY`, `CONFIDENCE`, `ROUTE`, and `ROUTE_SCOPE` metadata + separate non-dispatch summary of `FOLLOWUP_ONLY` and `INFO` groups
- Plan revision mode (review FIX loop): original task + path to previous plan + current code map path if available + current review context packet + FIX items from handler + path to decision log
- Code revision mode (PLAN_REQUIRED outer loop from later phase): original task + path to previous plan + current code map path if available + current review context packet + execution results summary + PLAN_REQUIRED FIX items from handler + path to decision log
- Must output `PLAN_PATH: <absolute path>` and `CODE_MAP_PATH: <absolute path>`; capture them as `planPath` and `codeMapPath`

**fixme-write-product-spec** (when writing a product specification):
- Fresh mode: original product request, ticket, or source material
- Specification revision mode: original request + path to previous product specification + current review context packet + FIX items from `fixme-handle-spec-review` + path to decision log
- Rewrite mode: original request if available + path to previous product specification + path to decision log
- Must output `SPEC_PATH: <absolute path>`; capture it as `productSpecificationPath` and `currentSpecificationPath`

**fixme-write-technical-spec** (when writing a technical specification):
- Fresh mode: product specification path, original request, ticket, or source material
- Specification revision mode: original request or product specification path + path to previous technical specification + current review context packet + FIX items from `fixme-handle-spec-review` + path to decision log
- Rewrite mode: original request or product specification path if available + path to previous technical specification + path to decision log
- Must output `SPEC_PATH: <absolute path>`; capture it as `technicalSpecificationPath` and `currentSpecificationPath`

**fixme-review-plan** (in `plan` phase review):
- Path to plan
- Path to task code map if available
- Current review context packet

**fixme-review-spec** (when reviewing a specification):
- Path to `currentSpecificationPath`
- Current review context packet

**fixme-handle-spec-review** (when handling specification review findings):
- Review findings from reviewer
- Path to `currentSpecificationPath`
- Current review context packet
- Path to decision log (if it exists)
- The phase must have an execute skill capable of revising the specification when the handler returns FIX items

Do not configure `fixme-handle-spec-review` for a phase that only dispatches `fixme-review-spec`. `HAS_BLOCKING_FIX` routes back to the phase's first execute skill; without a skill that writes or revises the specification there is nothing safe to re-run.

**fixme-handle-plan-review** (in `plan` phase review):
- Review findings from reviewer
- Path to plan
- Path to task code map if available
- Current review context packet
- Path to decision log (if it exists)

**fixme-execute-plan** (in `implement` phase):
- Path to plan
- Path to task code map if available
- Repair mode: path to plan + current review context packet + IMPLEMENT_ONLY code review FIX items + execution results summary. Do not rewrite the plan for this route.

**fixme-review-code** (in `implement` phase review):
- Path to plan
- Path to task code map if available
- Current review context packet
- Git diff information (base branch or commit range)
- Repair context when the previous step was implementation repair. Implementation-only repairs return to full code review and do not count against outerMaxCycles.

**fixme-handle-code-review** (in `implement` phase review):
- Review findings from reviewer
- Path to plan
- Path to task code map if available
- Current review context packet
- Path to decision log (if it exists)

**fixme-investigate** (in `investigate` phase):
- Task description (user's exact bug report / question)

**fixme-research** (in `research` phase):
- Task description + investigation output from prior phase

**fixme-browser-verify** (in `verify` phase):
- Task description + plan path + current code map path if available + current review context packet + execution results summary

For custom skills not listed above: pass the task description, artifact paths, the current code map path if available, and the current review context packet. Do not pass full accumulated discussion by default.

## Review Context Packets

Before each review, handler, revision, or verification dispatch, construct a compact packet for the current `fixme-task` instance. The packet is summary context, not authority. The referenced plan, specification, decision log, review findings, git diff, and source files remain authoritative.

### Scope

- Include only decisions relevant to the current ticket, task, plan/specification, phase, or review loop.
- If `decisions.md` contains unrelated prior runs, exclude them unless the current artifacts explicitly reference them.
- If decision metadata is insufficient, include only decisions made during this `fixme-task` invocation or decisions already carried in the current plan/specification.
- Include every fix applied since the previous review cycle, whether it came from automatic `FIX` routing or from a user decision that resolved `FIX_UNCLEAR` or `ASK_USER`.
- Include the task code map path when one exists. Do not paste the full code map into the packet.
- For code review, `Fixes Since Last Review` and repair context are extra orientation, not scope limiters. Code review always covers the full changed surface.

### Packet Shape

Use this shape in dispatch prompts:

```md
## Review Context Packet

**Task**: {one-sentence task goal}
**Pipeline/phase**: {pipeline name} / {phase name}
**Review cycle**: {phase review cycle number and outer loop number}
**Review scope**: full changed surface | full specification | full plan

### Artifacts

- **Plan**: {absolute path, if any}
- **Code map**: {absolute path, if any}
- **Specification**: {absolute path, if any}
- **Decision log**: {absolute path or "none yet"}
- **Previous review findings**: {path or compact summary, if any}
- **Execution summary**: {path or compact summary, if any}

### User Decisions For This Run

- **D{n}: {title}**
  - **Answer**: {user answer}
  - **Locked decision**: {one-line actionable decision}
  - **Applied in fixes**: {fix IDs or "not yet applied"}

### Fixes Since Last Review

- **F{n}: {short title}**
  - **Origin**: automatic FIX | user decision D{n}
  - **What changed**: {one sentence}
  - **Why**: {source finding or user decision}
  - **Files changed**: {clickable file refs or paths from the executor summary}

### Verification Since Last Review

- **Commands**: {commands run}
- **Result**: {pass/fail/blocked}
- **Important output**: {short summary or output reference}

### Prior Findings Not To Re-raise Without New Evidence

- **{finding title}**: {rejected/already fixed/wont fix rationale and source}
```

### Packet Rules

- Keep the packet compact. Prefer paths and one-line summaries over pasted artifacts.
- Do not paste full conversation history, full agent output, or unrelated decision log entries.
- Do not omit user decisions that affect the current task.
- Do not omit user-decision-driven fixes from `Fixes Since Last Review`; list them alongside automatic fixes.
- If a packet statement conflicts with an artifact, the artifact wins. The receiving agent must verify from source before making findings.
- If the code map is missing when a plan exists, continue with the plan and source artifacts, but ask the next plan revision to create the missing map.

## Step Processing

Follow these procedures after each agent dispatch returns. The manifest determines WHICH step comes next. These procedures determine HOW to process each step type.

### Directive Validation (NON-NEGOTIABLE)

Every agent dispatch has an expected routing directive in its output. Before processing, you MUST validate that the directive is present:

| Agent type | Expected directive | Example |
|---|---|---|
| Phase skill (executor) | `EXECUTOR_STATUS: COMPLETE` + `NEXT_PIPELINE_STEP: <skill>` | End of fixme-execute-plan output |
| Specification writer | `SPEC_PATH: <absolute path>` | End of fixme-write-product-spec or fixme-write-technical-spec output |
| Plan writer | `PLAN_PATH: <absolute path>` + `CODE_MAP_PATH: <absolute path>` | End of fixme-write-plan output |
| Review handler (spec/plan/code) | `HANDLER_RESULT: CLEAN\|HAS_BLOCKING_FIX\|HAS_NONBLOCKING_FINDINGS\|HAS_ASK_USER` | End of fixme-handle-spec-review, fixme-handle-plan-review, or fixme-handle-code-review output |

**If the expected directive is MISSING from the agent's output**, the agent is incomplete - it was truncated (hit context/output limit), crashed, or otherwise failed to finish. This is NOT "agent done without a directive."

**Recovery procedure:**

1. **Do NOT take over the agent's work.** Do not run tests, commit code, verify output, or do anything the agent was supposed to do. You are a dispatcher.
2. **Do NOT advance to the next manifest step.** The current step is incomplete.
3. **Re-dispatch the agent automatically (once).** Construct a resume prompt:
   - For **executors**: include the plan path, a summary of what the previous dispatch accomplished (based on its truncated output), and instruct it to continue from the last completed plan step.
   - For **review handlers**: re-dispatch with the same inputs as the original dispatch (findings, plan path, decision log).
   - For **other phase skills**: re-dispatch with the original inputs plus a summary of what was already produced.
4. **If the re-dispatched agent also returns without the expected directive**: escalate with structured context. In a direct user-facing run, present the Agent Escalation block and wait for the user's choice. In attention mode, use the checkpoint-first attention path to checkpoint `waitingForUser`, store the Agent Escalation block with `lifecycle attention open`, and return `FIXME_ATTENTION_REQUIRED: <attention-id>`. Do NOT advance the manifest.

   Present the escalation using this format:

   ```markdown
   ## Agent Escalation: {agent name} failed twice

   **What was dispatched**: {agent name} for the {phase name} phase, handling {brief task description}.

   **First attempt**: {2-3 sentences - what the agent produced before truncation/failure.
   Name specific outputs: files created, tests written, findings classified.}

   **Second attempt**: {2-3 sentences - same structure.}

   **What remains incomplete**: {specific items the agent didn't finish - e.g., "verification
   gate did not run", "3 of 7 findings not yet classified", "HANDLER_RESULT directive missing"}

   ### How to proceed

   1. **Retry with guidance** - I'll re-dispatch with specific instructions you provide.
   2. **Skip this step** - Advance to the next manifest step. Risk: {what gets skipped}.
   3. **Abort** - Stop the pipeline.
   ```

**The temptation**: When an executor returns without its directive but the output looks "mostly done" (tests seem to pass, code looks committed), it feels natural to just run verification yourself, confirm it's good, and move on. This is the exact failure mode this rule prevents. "Mostly done" without the directive means the agent's own verification gate did not run to completion. Your manual check is NOT equivalent - you lack the agent's accumulated context about what was changed and why, and you will skip the review phase that exists to catch what manual checks miss.

### Processing by Step Type

**Execute steps** (`[phase]` entries - phase skills like fixme-write-plan, fixme-execute-plan):

1. Validate the directive if one is expected (executors produce `EXECUTOR_STATUS: COMPLETE`)
2. Capture a compact execution summary for the next review context packet: what changed, why, files changed, verification commands/results, and any deviations from plan
3. Extract artifact directives (`SPEC_PATH`, `PLAN_PATH`, `CODE_MAP_PATH`) and update the artifact handoff state
4. Mark step `completed`, set next step to `in_progress`, dispatch next agent

**Review steps** (`[phase/review]` entries - reviewers like fixme-review-plan, fixme-review-code):

1. Capture the review findings needed by the handler. Keep the dispatch context compact; do not append unrelated prior outputs.
2. Mark step `completed`, set next step to `in_progress`
3. Pass the findings and current review context packet as input to the handler dispatch (the next manifest step)

**Handler steps** (`[phase/review]` entries - handlers like fixme-handle-spec-review, fixme-handle-plan-review, fixme-handle-code-review):

1. Validate the routing directive. All review handlers use the same contract: `HANDLER_RESULT: CLEAN|HAS_BLOCKING_FIX|HAS_NONBLOCKING_FINDINGS|HAS_ASK_USER`.
2. Capture only the routing summary, classification counts, severity counts, route-scope counts (plan/code only), FIX items, decision cards, follow-up-only items, and rejection rationale needed for routing and the next review context packet
3. Mark step `completed`, set next step to `in_progress` (the routing step)

**Routing steps** (`[phase/route]` entries):

1. Read the HANDLER_RESULT from the previous handler's output
2. Validate the handler's classification counts before following the route. All handlers (spec/plan/code) share the same `HANDLER_RESULT` vocabulary and the same severity-based blocking semantics; the only difference is per-handler `NEXT_ACTION` values (spec uses `SPEC_REVISION`; plan/code use `PLAN_REVISION` or `IMPLEMENT_REPAIR`):
   - `FIX_UNCLEAR_COUNT > 0` or `ASK_USER_COUNT > 0` requires `HANDLER_RESULT: HAS_ASK_USER` and `NEXT_ACTION: ASK_USER_BATCH`
   - `HANDLER_RESULT: CLEAN` is valid only when `FIX_COUNT`, `FIX_UNCLEAR_COUNT`, and `ASK_USER_COUNT` are all `0`
   - `HANDLER_RESULT: HAS_BLOCKING_FIX` is valid only when `BLOCKING_FIX_COUNT > 0`, `FIX_UNCLEAR_COUNT = 0`, and `ASK_USER_COUNT = 0`
   - `HANDLER_RESULT: HAS_NONBLOCKING_FINDINGS` is valid only when `BLOCKING_FIX_COUNT = 0`, `NONBLOCKING_COUNT > 0`, `FIX_UNCLEAR_COUNT = 0`, and `ASK_USER_COUNT = 0`
   - `NEXT_ACTION: SPEC_REVISION` requires `BLOCKING_FIX_COUNT > 0` from a specification handler
   - `NEXT_ACTION: PLAN_REVISION` requires `PLAN_REQUIRED_COUNT > 0`
   - `NEXT_ACTION: IMPLEMENT_REPAIR` requires `IMPLEMENT_ONLY_COUNT > 0` and `PLAN_REQUIRED_COUNT = 0`
   - `NEXT_ACTION: FOLLOWUP_ONLY` requires `BLOCKING_FIX_COUNT = 0` and `NONBLOCKING_COUNT > 0`
   - `FIX_UNCLEAR` never means no-fix and never allows the loop to exit. It means the finding is real and the user must choose the approach.
3. If the directive and counts conflict, do not advance the loop. Re-dispatch the same handler with a correction prompt that quotes the inconsistent routing block and asks for a corrected routing directive.
4. Print the Review Classification block (see Review Classification Visibility). This happens for every handler output: CLEAN, HAS_BLOCKING_FIX, HAS_NONBLOCKING_FINDINGS, and HAS_ASK_USER.
5. Follow the routing rules specified in the manifest entry. Treat printing the Review Classification block and taking the route as one atomic operation unless `HAS_ASK_USER` requires a user decision. Do not send a final response between the visible classification block and the next manifest action.
   - **CLEAN**: mark step `completed`, advance to the next numbered step
   - **HAS_BLOCKING_FIX + SPEC_REVISION**: mark step `completed`, jump back to the specification phase's first execute step. Check loop guards before jumping. Reset ALL steps from the target step through the current routing step to `pending`, then set the target step to `in_progress`.
   - **HAS_BLOCKING_FIX + PLAN_REVISION**: mark step `completed`, jump back to the target plan step. Check loop guards before jumping. Reset ALL steps from the target step through the current routing step to `pending`, then set the target step to `in_progress`.
   - **HAS_BLOCKING_FIX + IMPLEMENT_REPAIR**: mark step `completed`, jump back to the implement execute step in repair mode. Check loop guards before jumping. Reset the implement execute, code review, handler, and routing steps to `pending`, then set the implement execute step to `in_progress`.
   - **HAS_NONBLOCKING_FINDINGS**: mark step `completed`, record follow-up-only items for the Run Summary, and advance to the next numbered step.
   - **HAS_ASK_USER**: batch questions for user input (see ASK_USER Batching). In a direct user-facing run, present the Review Classification block and wait normally. In attention mode, use the checkpoint-first attention path to checkpoint `waitingForUser`, store the complete Review Classification block with `lifecycle attention open`, and return `FIXME_ATTENTION_REQUIRED: <attention-id>`. After the answer is available, persist answers with `task decision append`. Re-dispatch the handler (set the handler step back to `in_progress`). Do NOT mark this routing step `completed` until the handler returns CLEAN, HAS_BLOCKING_FIX, or HAS_NONBLOCKING_FINDINGS.
6. Do NOT apply fixes yourself. Do NOT proceed past blocking fixes without dispatching the required producer. Follow-up-only items may proceed without a producer dispatch.

**Run Summary step** (`[done]` entry, **standalone mode only** - does not exist in parent-driven mode):

1. Mark step `in_progress`
2. Output the Run Summary (see format below)
3. Mark step `completed`. Pipeline is DONE.

In parent-driven mode (`parentContinuation` present) there is no Run Summary step. After the implement-routing step (`Step N.8`) returns CLEAN, in the same TodoWrite call mark `Step N.8 completed` AND mark the parent's next pending item (e.g. `Step 10 [verify]`) as `in_progress`, then immediately begin executing the parent's Step 10 instructions. Do NOT print a `## Run Summary` block. Do NOT narrate the handoff. The parent owns the final summary at its own terminal step.

## Pre-Final Response Gate

Before sending any final response from this skill, verify one terminal condition is true:

- Standalone mode completed the `[done]` Run Summary step.
- The current handler route is `HAS_ASK_USER` and either a direct user-facing Review Classification block has asked the user for decisions, or attention mode stored that block and returned `FIXME_ATTENTION_REQUIRED: <attention-id>`.
- A loop guard escalation in direct user-facing mode has asked the user for a choice, or attention mode stored the escalation and returned `FIXME_ATTENTION_REQUIRED: <attention-id>`.
- The workflow failed or cannot continue after the documented recovery path.

If none of these is true, do not final-answer. Continue the manifest from the current step. A Review Classification block with no user decision is never terminal by itself.

## Never Apply Fixes Directly

When a review handler returns blocking FIX items, **always route through the proper producer** - plan-required fixes go through the plan loop, implementation-only fixes go through execute-plan repair mode, and nonblocking follow-up items are reported without a loop.

**Never apply FIX items inline in the orchestrator**, no matter how small or obvious they seem. "It's just a 2-line fix" is exactly when bugs slip through - a guard clause that accidentally exits render and violates Rules of Hooks, an init value that creates a hidden coupling to another module's internal ordering. The review loop exists to catch what you can't predict. Skipping it because you're confident is the definition of the problem the pipeline solves.

## Parent Continuation And Terminal Events

When `parentContinuation` is present in task state (parent-driven mode), `fixme-task` does NOT print a Run Summary and does NOT own verification, commit, reply, resolve, or the final summary - the parent owns those. On reaching a terminal state, `fixme-task` instead produces a durable terminal result and an optional wake-up notification, in this order:

1. Write the terminal result summary (this stamps a once-generated `terminalResultId` into task state and writes a parent-readable `<taskStem>.result.json`):
   ```bash
   node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task result write --state <task-state-path> --data '{"status":"<completed|failed>","summaryMarkdown":"<summary>","changedFiles":[...],"artifactPaths":[...],"failure":<null|{"reason":"<reason>","message":"<msg>"}>}'
   ```
2. Record the terminal task event so the parent can consume it (recordable only AFTER the result summary and terminal task state exist):
   ```bash
   node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle task-event record --fixme-dir <fixme-dir> --data '{"parentRunId":"<parentRunId>","taskRunId":"<taskRunId>","taskStatePath":"<task-state-path>","resultSummaryPath":"<result-summary-path>","terminalResultId":"<terminalResultId>","status":"<completed|failed>"}'
   ```
3. Emit an OPTIONAL plain-text notification carrying only the `eventId` (no required state). Place it AFTER the `lifecycle invocation finish` usage report line.

Direct user-facing runs (no `parentContinuation`) keep the existing Run Summary behavior and do NOT write task result summaries or record task events.

## Decision Log

Task-owned decisions are persisted with `task decision append --state <task-state-path> --data '<decision-record-json>'`, which writes one structured decision into task-state `decisions` and applies active/superseded semantics. Only the orchestrator (`fixme-task`) persists task-owned decisions; sub-skills read the merged decision context with `task decision list --state <task-state-path> --format markdown` (the `markdown` field). Project-level `<fixme-dir>/decisions.md` remains markdown-primary for non-task standalone flows.

The merged markdown view (`task decision list --format markdown`) renders the same human-readable shape downstream readers consume:

Format:

```markdown
# Decision Log

## Iteration 1 - Plan Review

### Decision 1
- **Question**: [full question text as presented to user]
- **Answer**: [user's answer]
- **Locked Decision**: [one-line decision derived from the Q&A, used by downstream skills]

### Decision 2
...

## Iteration 1 - Code Review

### Decision 3
...

## Iteration 2 - Plan Review
...
```

Rules:
- Accumulates across all iterations. Never remove previous entries.
- Each entry has a sequential number across the entire log (Decision 1, 2, 3...) for easy reference.
- The "Locked Decision" line is what downstream skills match against. It must be a clear, actionable statement (e.g., "Use WebSocket for real-time updates, not SSE" not "User prefers WebSocket").
- When a locked decision is revisited via ASK_USER (because new evidence emerged), append a new entry that references and supersedes the old one: "Supersedes Decision N: [new decision]".

## Review Classification Visibility

Every review handler classification must be emitted by `fixme-task` before routing continues. In a direct user-facing run, emit it in the main conversation. In a non-user-facing run, ordinary non-decision classifications can remain in `fixme-task` output; decision classifications must be stored as durable attention so the parent broker can render them to the user. This is informational output, not a permission gate and not an invitation to bypass the pipeline.

### When To Print

Print one Review Classification block after every handler output is validated and before following the route:

- `CLEAN`: print the block, then continue to the next manifest step.
- `HAS_BLOCKING_FIX`: print the block, then loop through the configured route automatically.
- `HAS_NONBLOCKING_FINDINGS`: print the block, then continue without a revision loop.
- `HAS_ASK_USER`: in a direct user-facing run, print the block and wait for the user decisions contained in that same block. In attention mode, use the checkpoint-first attention path to store the same block through `lifecycle attention open`, return `FIXME_ATTENTION_REQUIRED: <attention-id>`, and continue only after `--answer-attention` resumes the task.

Do not print raw reviewer findings before the handler runs. Raw reviewer findings may contain false positives; the handler-classified output is the user-visible source of truth.

### Output Shape

Use the same structure for all handler outcomes. Omit sections that have no items, except always include the closing route sentence.

```markdown
## Review Classification: {plan | code | specification} review

The {plan | code | specification} review found {N} issue(s): {X} blocking fix(es), {Y} follow-up item(s), {Z} decision(s) needed, {W} dismissed.

### Blocking Fixes

1. **{finding title}** - {one sentence: what is wrong and what the next workflow step will change.}
   Files: [{file.ts:line}](/absolute/path/file.ts#Lline)

### Follow-Up Items

1. **{finding title}** - {one sentence: why this is nonblocking and where it is recorded.}

### Decisions Needed

{Copy each ASK_USER or FIX_UNCLEAR Question field verbatim, separated by `---`.}

### Dismissed Findings

1. **{finding title}** - {one sentence explaining why it was rejected or already covered.}

No decisions needed. The pipeline will continue through the configured {repair | revision | next} step.
```

When decisions exist, replace the closing route sentence with the standard consolidated prompt from ASK_USER Batching:

```text
Please provide your decisions for the above. You can answer by number (e.g., "1: A, 2: B")
or describe your preferred approach. Reply "go with recommendations" to accept all
recommended options.
```

### Visibility Rules

- Use handler-classified findings only. Do not invent classifications or reclassify findings in the orchestrator.
- Use human-language labels in the visible block: "blocking fixes", "follow-up items", "decisions needed", and "dismissed findings".
- Never expose internal routing metadata in the visible block.
- Include `REJECT_FALSE_POSITIVE`, `REJECT_WONT_FIX`, and `REJECT_ALREADY_FIXED` items under "Dismissed Findings".
- If there are zero findings, say: `The {plan | code | specification} review found no issues. No decisions needed. The pipeline will continue.`
- If there are blocking fixes but no decisions, print the blocking fixes and continue automatically.
- If there are follow-up-only items but no blocking fixes or decisions, print them and continue without looping.
- If there are decisions, the exact same block is printed, but the route waits after the consolidated prompt.
- The block must not include bypass options. It may describe the route the pipeline will take, but it must not ask whether to take that route.

## ASK_USER Batching

When a handler produces FIX_UNCLEAR or ASK_USER items:

`FIX_UNCLEAR` is included here intentionally. It is not an `ASK_USER` classification, but it uses the same user-input route because the issue is real and the approach choice belongs to the user. Never treat `FIX_UNCLEAR` as clean, no-fix, dismissed, or loop-exit.

### 1. Collect

Gather all items from the handler output:

- All FIX_UNCLEAR and ASK_USER items (need user input)
- All FIX items (will be applied automatically)
- All REJECT_* items (dismissed)

### 2. Present to user

**The user reads the Review Classification block directly in a user-facing run, or through the parent broker rendering `promptMarkdown` in attention mode. It is the primary interface between the pipeline and the human. Follow these rules without exception.**

#### Formatting Rules (NON-NEGOTIABLE)

All user-facing output from the orchestrator must be visually scannable:

- **Blank line between every section, heading, and paragraph.** No two content blocks should be adjacent without a separator. Dense walls of text are never acceptable.
- **Use headings** (`##`, `###`) to separate major sections (summary, blocking fixes, follow-up items, decisions, closing prompt). The user must be able to skim headings to find what they need.
- **Use bullet lists** for multiple items within a section. Never pack multiple items into a single paragraph.
- **Use horizontal rules** (`---`) between independent decision blocks when presenting multiple decisions. Each decision is visually distinct.
- **Bold key labels** (`**Decision needed**:`, `**Recommendation**:`, etc.) and start each on its own line.
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.

#### Routing Metadata Prohibition

**Never expose internal pipeline state to the user.** These terms are internal routing language and must NEVER appear in user-facing output:

- `HAS_FIX`, `HAS_ASK_USER`, `HANDLER_RESULT`, `CLEAN`
- `FIX_COUNT`, `FIX_UNCLEAR_COUNT`, `ASK_USER_COUNT`
- `NEXT_ACTION`, `OUTER_LOOP`, `ASK_USER_BATCH`
- `HAS_BLOCKING_FIX`, `HAS_NONBLOCKING_FINDINGS`, `BLOCKING_FIX_COUNT`, `NONBLOCKING_COUNT`
- `PLAN_REQUIRED_COUNT`, `IMPLEMENT_ONLY_COUNT`, `PLAN_REVISION`, `IMPLEMENT_REPAIR`, `FOLLOWUP_ONLY`
- `EXECUTOR_STATUS`, `NEXT_PIPELINE_STEP`

Use human language instead. "The code review found 3 issues" not "Handler returned HAS_ASK_USER + HAS_FIX."

#### Output Structure

The Review Classification block already defines the shared output structure for both decision and non-decision outcomes. For ASK_USER and FIX_UNCLEAR routes, apply these additional requirements:

**1. Summary line** - One sentence in plain language. Exact counts, no routing metadata.

```
The {plan/code/specification} review found {N} issues: {X} blocking fix(es) that will be applied
automatically, {Y} follow-up item(s), {Z} need(s) your input{, W dismissed}.
```

**2. Blocking fixes** (only when blocking FIX items coexist with questions) - Brief list so the user knows what will be applied automatically after their decisions. Keep each item to one sentence.

```markdown
### Blocking Fixes (will be applied after your decisions)

1. **{short title}** - {one sentence: what's wrong and what the fix will do.}
   Files: [{file.ts:line}](/absolute/path/file.ts#Lline)

2. **{short title}** - {one sentence.}
   Files: [{file.ts:line}](/absolute/path/file.ts#Lline)
```

**3. Decision points** - Present each ASK_USER and FIX_UNCLEAR item using the handler's **full Question field verbatim**. The handler's Question field follows the Decision Presentation Guidelines (from the `fixme-howto-present-decisions` shared skill) and is already formatted as a structured decision card.

**Do NOT summarize, rephrase, or compress the handler's Question field.** The handler invested significant effort in making the question self-contained, properly structured, and concrete. Summarizing it destroys the context, clickable file references, option structure, and cross-references that make the decision possible.

**Do NOT replace the handler's structured format with flat paragraphs.** The current decision-card schema lives only in `fixme-howto-present-decisions`. Do not maintain a second copy here. If the handler's Question field appears stale, malformed, or inconsistent with the shared skill, re-dispatch the handler for a corrected Question field instead of rewriting the decision yourself.

When presenting multiple decisions, separate them with `---` horizontal rules.

**4. Closing prompt** - After ALL decision points, one consolidated question:

```
Please provide your decisions for the above. You can answer by number (e.g., "1: A, 2: B")
or describe your preferred approach. Reply "go with recommendations" to accept all
recommended options.
```

#### Quality Verification

Before sending the output to the user, verify:

- [ ] No routing metadata terms appear anywhere in the text
- [ ] Every file reference is a clickable markdown link with line numbers
- [ ] Every section is separated by a blank line
- [ ] Each decision block is copied verbatim from the handler's Question field
- [ ] Each decision block follows the current `fixme-howto-present-decisions` schema
- [ ] No obsolete decision-card labels appear as schema fields: `The question`, `Changes`, `Upside`, `Downside`, or `Approach/Pros/Cons/Impact/Effort`
- [ ] Context explains WHAT the affected code does and WHERE it lives before stating the problem

### 3. Process answers

Parse the user's response. Map each answer to its decision point.

In attention mode, `--answer-attention` supplies the answer for ASK_USER Batching. Load the answered attention record, parse the stored `answer.answer` text as the user's response, then apply the same mapping rules below.

- If remaining questions exist (user didn't address all), re-present ONLY those and ask again.
- Repeat until all decisions are resolved.

**Discussion Mode is active during this loop.** From the moment Step 2 (Present to user) finishes to the moment Step 4 (Record and re-invoke) begins, the orchestrator is in a decision pause and may read source code, run read-only Bash, fetch related files, and engage in inline discussion to help the user understand the decision (see "Discussion Mode (Decision-Pause Carve-Out)" near the top of this file). If the user asks a clarifying question that requires reading the codebase, **answer it directly with Read/Grep/Glob** - do NOT dispatch a sub-agent for it. Sub-agent dispatch during a decision pause is the failure mode this carve-out exists to prevent.

The loop only exits when the user has provided decisions (or "go with recommendations"). Inline discussion does NOT count as a decision - keep the pause open until the user explicitly resolves the decision points.

**Exit conditions** (any one ends the loop):

- User answered all decision points explicitly
- User said "go with recommendations" or equivalent (use recommended option for all unanswered)
- User said "up to you" / "your call" / equivalent for specific items (use recommendation for those)

### 4. Record and re-invoke

Persist each answer with `task decision append` (a structured decision with a derived interpretation). Re-invoke the SAME handler with updated locked decisions (not restart the loop). The handler re-evaluates remaining findings against the new decisions - FIX_UNCLEAR items with approach answers become FIX items. ASK_USER items may become FIX, REJECT_*, or remain ASK_USER.

If the handler produces MORE FIX_UNCLEAR or ASK_USER items after re-invocation: batch and present again (max 2 rounds of questions per handler invocation, then escalate through the same direct-or-attention user-input path).

## Loop Guards

- **Phase review loop**: max `phase.review.maxCycles` iterations (default 3). Count only blocking revision loops. If blocking FIX items remain after max cycles, escalate using the format below.
- **Implementation repair loop**: max `phase.review.maxCycles` iterations for the implement phase (default 3). Count only blocking `IMPLEMENT_ONLY` repair loops. If blocking implementation-only FIX items remain after max cycles, escalate using the format below.
- **Outer loop**: max `workflows.<pipelineName>.outerMaxCycles` iterations (default 2). Count only blocking `PLAN_REQUIRED` cross-phase loops. If blocking plan-required FIX items remain after the configured number of full cycles, escalate using the format below.
- **Stall detection**: track unresolved blocking issue count for each comparable loop route (`PLAN_REQUIRED` and `IMPLEMENT_ONLY`). If the unresolved blocking issue count is not lower than the previous comparable cycle, stop the loop and escalate as stalled.

Do not increment any loop counter for `MINOR`, `INFO`, or `FOLLOWUP_ONLY` items.

### Loop Guard Escalation Format

When escalating persistent issues to the user, follow top-down progressive disclosure. No routing metadata. The user needs enough context to make an informed decision. In a direct user-facing run, present this block and wait for the user's choice. In attention mode, use the checkpoint-first attention path to checkpoint `waitingForUser`, store this block as `promptMarkdown` through `lifecycle attention open`, and return `FIXME_ATTENTION_REQUIRED: <attention-id>`.

```markdown
## Pipeline Escalation: {phase name} review

The {phase name} review has run {N} cycles. {M} issues were fixed across iterations,
but {K} remain unresolved.

### Unresolved Issues

{For each remaining FIX item:}

**{N}. {short title}**

- **What**: {one sentence - what's wrong, with clickable file/line references}
- **Why it persists**: {one sentence - why prior iterations didn't resolve it
  (e.g., fix introduced a new issue, fix broke tests, competing constraints)}
- **Impact if shipped as-is**: {one sentence - what breaks or degrades}

### How to proceed

1. **Proceed to next phase** - Ship with these known issues.
   Risk: {concrete statement of what will happen, e.g., "Users will see X when Y"}

2. **Provide guidance** - Tell me how to approach these differently.
   I'll revise and re-enter the review loop.

3. **Abort** - Stop the pipeline. No further changes.
```

## Error Handling

- **Sub-skill agent fails unexpectedly or returns without expected routing directive**: follow the Directive Validation recovery procedure (auto-retry once, then escalate). If ticket path provided, include it in any escalation report (but do NOT transition to `failed` - the session owns that).
- **Loop guard triggers**: present accumulated FIX items with context and options through the direct-or-attention path (see Loop Guards).
- **Execute-plan surfaces a plan concern during execution**: route back through plan loop as a plan revision (not handled ad-hoc by executor).
- **Execute-plan pre-existing failure proof**: include in execution results passed to code revision fixme-write-plan.
- **Ticket transition fails**: log the error, continue pipeline execution. Ticket state is informational - a transition failure should not block work. Report the transition failure in the Run Summary.

## Run Summary

**Standalone mode only.** In parent-driven mode (`parentContinuation` present), do NOT output a Run Summary at any point - the parent skill owns the final summary at its own terminal step. See "Parent-driven mode" under "Creating the Manifest with TodoWrite" above. See also "Parent Continuation And Terminal Events" below.

**ONLY output this after the final phase completes (with clean review or no review), or after a loop guard triggers in a direct standalone run. NEVER mid-pipeline. NEVER in parent-driven mode.**

At completion, output:

```markdown
## Run Summary

**Task**: [original task]
**Pipeline**: [pipeline name] ([phase names joined by " -> "])
**Ticket**: [ticket path, or "standalone (no ticket)"]
**Result**: [completed / escalated to user / aborted]
**Iterations**: [N outer x M inner review loops per phase]

### Phase Timing
| Phase | Duration | Review Cycles |
|-------|----------|---------------|
| [name] | [time] | [N cycles or "no review"] |
| ... | ... | ... |

### Usage
[Before rendering this section, when `pipelineRunId` is known, run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage report --scope project --pipeline-run-id <pipelineRunId> --format json`. Show pipeline total usage, not-included count, orchestrator overhead, child usage subtotal, by-skill breakdown, and project usage file path. If the report command fails, print a warning with `pipelineRunId` and continue this section with `Usage unavailable`. v1 does not include per-phase usage.]

### Decisions Made
[numbered list of all locked decisions]

### FIX Items Resolved
[per iteration: what was found and how it was addressed]

### Final Verification
[paste fixme-execute-plan's clean verification output]

### Commits
[list with hashes and messages]

### Files Changed
[list of all files created/modified across all iterations]
```
