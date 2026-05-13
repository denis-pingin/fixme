---
name: fixme-task
description: End-to-end orchestrator that executes config-driven workflows with optional ticket state management. Supports intent flags for product specification, technical specification, planning, execution, and idea-to-production workflows. Loads workflow definitions from <fixme-dir>/config.json (or uses hardcoded standard workflows), dispatches each phase's skills as isolated agents, manages review loops, decision persistence, artifact handoff, task code map paths, compact review context packets, and ticket state transitions.
---

# Fixme Task - Config-Driven Workflow Orchestrator

Execute a named or intent-selected workflow from `<fixme-dir>/config.json`. Each workflow is an ordered list of phases, each phase has skills to dispatch and an optional review loop. Manage compact context handoff, artifact paths, task code map paths, decision persistence, loop control, and optional ticket state transitions.

## Hard Constraints

- **This skill is a dispatcher.** It never writes plans, reviews code, or classifies findings itself. It dispatches sub-skills as agents and routes their outputs.
- **Never read source code during active pipeline execution.** The orchestrator reads ONLY specification files, plan files, task code map metadata/paths, decision logs, config files, and agent outputs while a phase or dispatch is in flight. All codebase exploration, investigation, and understanding happens inside dispatched agents. If you catch yourself using Read, Grep, or Glob on source code files mid-dispatch, STOP - you are about to bypass the pipeline. **Exception:** during a decision pause (after a Review Classification block with HAS_ASK_USER, before the user has provided decisions) the orchestrator may read source code to help the user understand the decision. See "Discussion Mode (Decision-Pause Carve-Out)" below.
- **Never lose retrievable context.** Full artifacts stay available by path; dispatch prompts pass compact, task-scoped context packets. Do not paste full discussion history or unrelated decision-log entries into review cycles.
- **Never override locked decisions silently.** If a conflict arises, present it to the user.
- **Never push code that doesn't pass verification.** The fixme-execute-plan sub-skill enforces this, but the orchestrator must not proceed past execution if verification failed.
- **Never output Run Summary until the FULL pipeline completes.** The pipeline is not done after a phase with no review. If a subsequent phase exists, it must run. If the current phase has a review loop, the review must complete before moving on. The Run Summary is ONLY output after the final phase's review handler returns Clean (or the phase has no review and it's the last phase) or after a loop guard triggers. If you feel like outputting a completion report mid-pipeline, STOP - you are about to skip remaining phases.
- **Never present intermediate findings to the user with bypass options.** Code review findings go to their handler skill. Plan review findings go to their handler skill. After the handler classifies findings, the orchestrator prints the required Review Classification block, then follows the normal route. It must never ask "want me to fix this directly?", "should we skip the loop?", or offer any bypass around the configured workflow.
- **Never hardcode ticket backend paths.** All ticket operations go through the `fixme-tickets` abstraction skill, which reads `ticketBackend` from `<fixme-dir>/config.json` and routes to the correct backend. Never call `fixme-tools.cjs` or any backend directly from this orchestrator.

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

**A decision pause begins** the moment the orchestrator emits a Review Classification block whose closing prompt asks the user to make a decision (HAS_ASK_USER route, FIX_UNCLEAR or ASK_USER items presented). **It ends** the moment the user provides decisions and the orchestrator writes the decision log + re-invokes the handler.

During a decision pause the orchestrator IS the user's interlocutor, not a dispatcher. The user is owed a competent collaborator who can:

- **Read source code** (Read, Grep, Glob) to verify claims, surface evidence, or answer clarifying questions
- **Run read-only Bash** (git log, git show, grep, ls, etc.) to ground the discussion in repo facts
- **Read related plan/spec files** beyond the strict orchestrator allowlist when relevant to the decision
- **Answer follow-up questions inline** about the codebase, the decision options, the tradeoffs, or upstream/downstream phases
- **Re-frame a decision** when the user reveals new context (product intent, future-phase plans, prior decisions) that makes the original framing wrong - then re-present the decision card with the corrected framing

What stays forbidden even during a decision pause:

- Applying code changes (the pipeline still owns implementation - never edit source files)
- Auto-advancing the manifest or re-invoking handlers without an explicit user decision
- Persisting anything to `<fixme-dir>/decisions.md` until the user has actually decided
- Pre-dispatching the next phase "to save time" before the decision is recorded

The pause ends when the user provides a decision (or "go with recommendations"). At that moment, write the decision log, re-invoke the handler, and return to dispatcher-only mode for the next pipeline step.

### User-Instruction Priority

Even outside a decision pause, an explicit user instruction in conversation overrides the dispatcher-only rule. If the user asks "read this file and tell me X", "go check the source for Y", or "what does Z look like in the code right now", comply directly. Do not redirect the request to a sub-agent dispatch when the user has explicitly asked the main thread to do it. The dispatcher rule prevents *autonomous* drift inside the pipeline; it never overrides explicit user requests.

When in doubt, ask: "Did the user just ask ME to do this, or am I doing it on my own initiative because I think the pipeline needs it?" Direct user requests = comply. Own initiative = dispatch.

## Input Resolution

Parse the invocation argument to extract intent, pipeline name, task description, and optional ticket path.

### Fixme Root Resolution (FIRST)

Before anything else - before parsing arguments, before checking the filesystem for plans, before reading config - resolve `<fixme-dir>` per `fixme-howto-find-fixme-dir` (preloaded into this agent's skills frontmatter; read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md` if not preloaded). Run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and store the `fixme_dir` value as `<fixme-dir>`. Never use a literal `.fixme/` path in any tool.

When dispatching sub-agents, always include `Fixme dir: <fixme-dir>` in the `<project>` block of the dispatch prompt. Sub-agents do NOT re-resolve - they use the value passed in.

### Argument Parsing

```
/fixme-task full fix the login button                 -> pipeline="full", task="fix the login button"
/fixme-task fix the login button                      -> pipeline="default", task="fix the login button"
/fixme-task --ticket <path> fix the login             -> pipeline="default", ticket=<path>, task="fix the login"
/fixme-task full --ticket <path> fix login            -> pipeline="full", ticket=<path>, task="fix login"
/fixme-task --product-spec build import flow          -> pipeline="product-spec", task="build import flow"
/fixme-task --tech-spec <product-spec-path>           -> pipeline="technical-spec", task="<product-spec-path>"
/fixme-task --technical-spec <product-spec-path>      -> pipeline="technical-spec", task="<product-spec-path>"
/fixme-task --plan <technical-spec-path>              -> pipeline="plan", task="<technical-spec-path>"
/fixme-task --execute <plan-path>                     -> pipeline="execute", task="<plan-path>"
/fixme-task --idea-to-production build import flow    -> pipeline="idea-to-production", task="build import flow"
/fixme-task --pipeline product-spec build import flow -> pipeline="product-spec", task="build import flow"
```

**Rules:**
1. Extract `--ticket <path>` if present (anywhere in args). Remove it from remaining args.
2. Extract `--pipeline <name>` if present. Remove it from remaining args.
3. Extract `--nested` if present (boolean flag). Remove it from remaining args. When set, this skill is being invoked inline by a parent skill (typically `fixme-pr-comments`) that owns its own todo list. The dispatch manifest is built in nested mode - see "Creating the Manifest with TodoWrite" below.
4. Extract intent flags if present. Supported flags:
   - `--product-spec` -> pipeline `product-spec`
   - `--tech-spec` -> pipeline `technical-spec`
   - `--technical-spec` -> pipeline `technical-spec`
   - `--plan` -> pipeline `plan`
   - `--execute` -> pipeline `execute`
   - `--idea-to-production` -> pipeline `idea-to-production`
5. If more than one intent flag is present, ask the user which starting point to use. Do not guess.
6. If both `--pipeline <name>` and an intent flag are present, they must resolve to the same pipeline. If they conflict, ask the user which one to use.
7. If no explicit pipeline was set by `--pipeline` or an intent flag, check the first remaining word against pipeline names in `<fixme-dir>/config.json` plus the standard pipeline names listed in Config Loading. If it matches, use it and remove it from remaining args.
8. The remaining args are the task description.
9. If no explicit pipeline was found, leave pipeline as `auto` until Task Resolution and Pipeline Auto-Detection run.

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

### Pipeline Auto-Detection

Run auto-detection only when no explicit pipeline was selected by `--pipeline`, intent flag, or first-word pipeline name. Auto-detection chooses a starting point from the resolved task or current context.

**High-confidence detections:**

- **Product specification source** -> pipeline `technical-spec`
  - Path contains `/specs/product/` or `/product-spec`.
  - Content title or headings indicate a product specification: `# Product Specification`, `# [Feature Name]` with `Product Requirements`, `User Journeys`, or `Users, Roles, and Permissions`.
- **Technical specification source** -> pipeline `plan`
  - Path contains `/specs/technical/`, `/technical-spec`, or `/tech-spec`.
  - Content headings indicate a technical specification: `Architecture and Ownership`, `Interfaces and Data Contracts`, `Persistence, Migration, and Backfill`, or `Workflow, Concurrency, and Failure Semantics`.
- **Implementation plan source** -> pipeline `execute`
  - Path contains `/plans/`.
  - Content title or headings indicate an implementation plan: `Implementation Plan`, `File Map`, `Tasks`, or `> Execute with`.
- **Explicit prose intent** -> matching pipeline
  - User asks to write a product specification -> `product-spec`.
  - User asks to write a technical specification or tech spec -> `technical-spec`.
  - User asks to write a plan -> `plan`.
  - User asks to execute or implement an existing plan -> `execute`.
  - User asks for idea to production or end-to-end from idea -> `idea-to-production`.

**Default detection:**

- If the input is a loose bug fix, feature request, or implementation task and no artifact type is clear, use `default`.

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
- **Technical specification exists** and selected pipeline is `plan`: start from the plan writer phase with the technical specification path as input.
- **Plan exists** and selected pipeline is `execute`: set `planPath` and start from the implement phase's execute skill.
- **Plan exists** and selected pipeline has a `plan` phase: set `planPath`, skip the plan-writing phase, and enter at the plan phase's **review** step. If the plan phase has no review, skip it entirely and enter at the next phase.
- **Plan exists + already reviewed** (review findings provided): enter at the plan phase's **review handler**.
- **Plan exists + already executed** (execution results or code changes present): enter at the implement phase's **review** step (if it has one).
- **Nothing exists**: start from the first phase of the pipeline (default).

When a selected or discovered plan references a `### Code Map` path or the input provides a code map path, set `codeMapPath`. If no code map path exists, continue; the next plan-writing or plan-revision phase must create one.

When entering mid-pipeline, still resolve the original task (for context packet construction) and check for an existing decision log at `<fixme-dir>/decisions.md`.

### Artifact Handoff

Maintain artifact paths as explicit state while routing the pipeline:

- `productSpecificationPath`: last `SPEC_PATH` produced by `fixme-write-product-spec`, or a product specification path selected as input.
- `technicalSpecificationPath`: last `SPEC_PATH` produced by `fixme-write-technical-spec`, or a technical specification path selected as input.
- `currentSpecificationPath`: specification artifact currently being reviewed by `fixme-review-spec`.
- `planPath`: plan artifact selected or produced by `fixme-write-plan` if the output names one.
- `codeMapPath`: task-scoped code map artifact selected or produced by `fixme-write-plan` if the output names one.
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
3. **If `workflows.<pipelineName>` is missing but legacy `pipelines.<pipelineName>` exists**, read that legacy array as the phase list and read `workflowControls.<pipelineName>.outerMaxCycles` as the legacy outer loop limit.
4. **If the selected workflow is missing from config but is one of the standard workflows below**, use the hardcoded standard workflow.
5. **If no config or no workflow/pipeline key and no explicit pipeline was selected**, use the hardcoded `default` workflow.
6. **Extract `outerMaxCycles`** from `workflows.<pipelineName>.outerMaxCycles` if present. Missing or invalid values use the standard default below.

### Standard Workflow Metadata

Every workflow has workflow-scoped metadata. `outerMaxCycles` is independent of per-phase `review.maxCycles`.

```json
{
  "outerMaxCycles": 2
}
```

- `outerMaxCycles`: max blocking `PLAN_REQUIRED` cross-phase cycles for this workflow before escalating to the user. Example: code review proves the plan is wrong, sends work back to plan, then implementation and review run again. `IMPLEMENT_ONLY` repair loops do not count against this limit. Default: `2`.

### Standard Pipelines

`default`:
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
         "maxCycles": 2
       }
     }
   ]
   ```

`full`:
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
         "maxCycles": 2
       }
     },
     {
       "name": "verify",
       "skills": ["fixme-browser-verify"]
     }
   ]
   ```

`quick`:
   ```json
   [
     {
       "name": "plan",
       "skills": ["fixme-write-plan"]
     },
     {
       "name": "implement",
       "skills": ["fixme-execute-plan"]
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

`plan`:
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

`execute`:
   ```json
   [
     {
       "name": "implement",
       "skills": ["fixme-execute-plan"],
       "review": {
         "skills": ["fixme-review-code", "fixme-handle-code-review"],
         "maxCycles": 2
       }
     }
   ]
   ```

`idea-to-production`:
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
         "maxCycles": 2
       }
     }
   ]
   ```

7. **If the selected pipeline is not configured and is not a standard pipeline**, ask the user to choose a configured pipeline or one of the standard intent flags.
8. **Filter out disabled phases** (`enabled === false`)
9. **Extract project settings** from config's `project` field. If absent, project settings are unavailable (agents will detect from CLAUDE.md and project files).
10. **Store `outerMaxCycles`** from the selected workflow. Use `2` if absent or invalid.

## Ticket Integration (Optional)

### When `--ticket <path>` is provided:

Ticket mode. The orchestrator tracks pipeline progress via ticket state transitions.

- **At each phase start**: dispatch ticket transition through the `fixme-tickets` abstraction skill (Agent tool with the fixme-tickets SKILL.md). The fixme-tickets skill handles backend resolution and CLI invocation internally.
  - First transition includes `--pipeline <name>` flag to store the pipeline name in the ticket
  - Subsequent transitions omit the `--pipeline` flag (already stored)
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

Standalone mode. Execute the pipeline identically but skip all ticket transition dispatches. No state tracking overhead.

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
- **Read** - ONLY on `<fixme-dir>/config.json`, `<fixme-dir>/specs/**/*.md`, `<fixme-dir>/plans/*.md`, `<fixme-dir>/context/*-code-map.md`, `<fixme-dir>/decisions.md`, or specification/plan/code-map files referenced in conversation
- **Write** - ONLY on `<fixme-dir>/decisions.md`
- **Bash** - ONLY:
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` (the FIRST command, always)
  - `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs resolve-model <agent-name>` (before each Agent dispatch; installed Codex skills pass `--runtime codex`)
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

For the hardcoded default pipeline (no ticket):

```
Step 1  [plan]              Dispatch fixme-write-plan
Step 2  [plan/review]       Dispatch fixme-review-plan
Step 3  [plan/review]       Dispatch fixme-handle-plan-review
Step 4  [plan/route]        Route: CLEAN->5, PLAN_REQUIRED->1 (max 3), FOLLOWUP_ONLY->5, HAS_ASK_USER->ask then re-run 3
Step 5  [implement]         Dispatch fixme-execute-plan
Step 6  [implement/review]  Dispatch fixme-review-code
Step 7  [implement/review]  Dispatch fixme-handle-code-review
Step 8  [implement/route]   Route: CLEAN->9, PLAN_REQUIRED->1 (outer, max workflows.<pipeline>.outerMaxCycles), IMPLEMENT_ONLY->5 repair mode, HAS_ASK_USER->ask then re-run 7
Step 9  [done]              Run Summary
```

The manifest always contains ALL steps. When entering mid-pipeline (e.g., plan already exists), pre-entry steps are marked `completed` so backward jumps have valid targets. Example: entering at implement phase marks steps 1-4 as `completed` and step 5 as `in_progress`.

### Routing Rules

Each routing entry specifies explicit jump targets:

Handler route actions use this contract: `NEXT_ACTION: DONE | PLAN_REVISION | IMPLEMENT_REPAIR | ASK_USER_BATCH | FOLLOWUP_ONLY`.

- **CLEAN**: advance to the next numbered step
- **HAS_BLOCKING_FIX with PLAN_REQUIRED (intra-phase)**: jump back to the phase's first execute step. Increment the phase review counter. If counter > `phase.review.maxCycles` (default 3): escalate to user.
- **HAS_BLOCKING_FIX with PLAN_REQUIRED (cross-phase)**: jump back to the earlier phase's first execute step. Increment the outer loop counter. PLAN_REQUIRED findings use the outer loop and count against outerMaxCycles. If counter > `workflows.<pipelineName>.outerMaxCycles` (default 2): escalate to user. If ticket path provided: dispatch ticket backward transition with `--reason` before re-entering.
- **HAS_BLOCKING_FIX with IMPLEMENT_ONLY**: jump back to the current implementation phase's execute step in repair mode. IMPLEMENT_ONLY findings route to fixme-execute-plan repair mode and do not count against outerMaxCycles.
- **HAS_NONBLOCKING_FINDINGS**: print the review classification, record follow-up-only items in the run summary, and advance without re-running the producer. MINOR and INFO findings are reported as follow-up-only and do not trigger loop counters.
- **HAS_ASK_USER**: batch questions to user (see ASK_USER Batching), write to decision log, re-dispatch the handler (go back to the handler entry, NOT this routing step). Do NOT advance past the routing step until the handler returns CLEAN, HAS_BLOCKING_FIX, or HAS_NONBLOCKING_FINDINGS.

### PR Comment Triage Inputs

When invoked by `fixme-pr-comments`, the task input may already contain risk-aware PR comment triage. Incoming PR comment fix items may include VERDICT, SEVERITY, COMPLEXITY, CONFIDENCE, ROUTE, and ROUTE_SCOPE metadata.

Use that metadata as intake routing context, not as a substitute for normal plan and code review:

- Only items with ROUTE: CURRENT_PR_FIX enter the producer/review loop.
- FOLLOWUP_ONLY and INFO items are recorded in the run summary and never trigger planning, execution, or loop counters.
- Batch CURRENT_PR_FIX items by dependency cluster, not by comment source.
- Split dispatch only when a high-complexity PLAN_REQUIRED fix touches an unrelated subsystem or blocks low-risk fixes.
- `ROUTE_SCOPE` governs review-loop routing only - it does not shortcut entry into the pipeline. A fresh fixme-task entry always starts at the plan phase regardless of incoming `ROUTE_SCOPE`, because there is no existing plan to repair against. `IMPLEMENT_ONLY` takes effect during the code review loop (Step 8): blocking FIX items skip replanning and route directly back to `fixme-execute-plan` in repair mode. `PLAN_REQUIRED` items in that same loop trigger plan revision and count against `outerMaxCycles`.
- Use severity and complexity to choose review depth: BLOCKER or high-complexity PLAN_REQUIRED work gets full review; low-risk IMPLEMENT_ONLY repair gets focused re-review.

The planner and executor still validate the requested route. If a supposedly implementation-only PR fix actually requires plan, contract, persistence, migration, or acceptance-criteria changes, promote it to `PLAN_REQUIRED` before execution. If a current PR fix is found to be valid but disproportionate for this PR after deeper inspection, demote it to `FOLLOWUP_ONLY`, record the reason, and do not spend a revision cycle on it.

When the dispatch input already contains a complete pre-planned recipe (TDD steps, exact file paths, exact code, exact commit message - typical for `fixme-pr-comments` PR fix dispatches), the planner runs in validate-and-persist mode rather than re-design mode. See `fixme-write-plan`'s "Pre-Planned Input" section for the contract.

### Creating the Manifest with TodoWrite

After building the manifest, create it using TodoWrite. One todo per step. All steps start as `pending` for a fresh pipeline, or with pre-entry steps as `completed` for mid-pipeline entry.

The manifest is created in one of two modes depending on the `--nested` flag parsed in Argument Parsing:

- **Standalone mode** (default): replace the todo list entirely with the standard manifest. Use this for `/fixme-task` invocations and for dispatch from `fixme-session` or any other parent that does not own a wrapping todo list.
- **Nested mode** (`--nested` is set): preserve the parent's todo list and replace ONLY the parent's `in_progress` dispatch placeholder for this skill with the expanded substeps. Used by `fixme-pr-comments` and any other parent that wraps `fixme-task` with surrounding workflow steps.

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

**Nested mode (`--nested` set):**

When invoked nested, the parent skill (e.g. `fixme-pr-comments`) has already created a todo list with a single `in_progress` placeholder dispatching this skill - typically labeled `Step N [dispatch] Dispatch Skill(fixme-task) ...` or similar. The most recent `TodoWrite` tool call in conversation history is the source of truth for the parent's list.

**CRITICAL: Nested mode produces NO Run Summary and has NO terminal `[done]` step.** The parent skill owns the workflow's final summary at its own terminal step (e.g. `fixme-pr-comments`'s `Step 15 [done] Run summary`). fixme-task in nested mode ends at the implement-routing step (own `Step N.8`) - there is no `Step N.9`. After `Step N.8` is marked `completed`, control passes immediately to the parent's next pending step in the same turn. Do NOT print a `## Run Summary` block. Do NOT write a paragraph announcing the handoff. Just continue executing the parent's next step.

Construction rules:

1. Locate the parent's `in_progress` placeholder by scanning the latest todo state in conversation history. The placeholder is the single `in_progress` item whose content references dispatching `fixme-task` (text such as `Dispatch Skill(fixme-task)`, `Dispatch fixme-task`, or `dispatch fixme-task`).
2. Note the parent's step number on that placeholder (e.g. parent's `Step 9`). This becomes the prefix for own substeps - parent's `Step 9` -> own steps `Step 9.1` through `Step 9.8`. If no parent step number is detectable, use `9.` as the prefix (the conventional position).
3. Build own substeps from the standalone manifest's Steps 1-8 ONLY (omit Step 9 "Run Summary" entirely - nested mode does not have a Run Summary step), with each step content prefixed by the parent step number. Example: `Step 1 [plan] Dispatch fixme-write-plan` becomes `Step 9.1 [plan] Dispatch fixme-write-plan`. The full nested substep list is `Step N.1` ... `Step N.8`.
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

Parent list before nested dispatch:
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

First merged TodoWrite call from nested fixme-task:
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

The parent's `Step 9 [dispatch]` placeholder is gone - it has been replaced by the eight `Step 9.1` ... `Step 9.8` substeps. There is NO `Step 9.9` and NO Run Summary in nested mode - the parent owns the final summary at its own terminal step (`Step 15 [done] Run summary`). Every other parent item is carried through unchanged. When `Step 9.8` is marked `completed` (CLEAN handler result), the same TodoWrite call also marks `Step 10 [verify]` as `in_progress`, and the model immediately starts executing the parent's Step 10 (running build/lint/test) in the same turn. No paragraph announcing the handoff. No Run Summary. Just continue with the parent's next step.

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

**Before every Agent dispatch, resolve the runtime settings via the CLI and print a visibility banner.** This is non-negotiable. The orchestrator must not dispatch without first asking the tool what model or reasoning controls to use, and must not dispatch silently.

Step 1 - Resolve runtime settings:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs resolve-model <agent-name>
```

Returns JSON like `{"agent":"fixme-write-plan","runtime":"claude","model":"opus","reasoning_effort":"xhigh","profile":"quality","source":"profile"}`. The CLI reads `<fixme-dir>/config.json` (or returns defaults if none exists). Do not hardcode models, reasoning effort, or runtime behavior, and do not skip the call.

Installed Codex skills resolve Codex settings with:

```bash
node ~/.codex/skills/fixme-tools/scripts/fixme-tools.cjs resolve-model <agent-name> --runtime codex
```

Codex results intentionally return `model: null`. Codex dispatch must preserve the user-selected Codex model and pass only `reasoning_effort` when the resolver returns one.

Step 2 - Print the banner as a single line of user-visible text before the Agent tool call:

```
→ dispatching fixme-write-plan (runtime: claude, model: opus, reasoning: xhigh, profile: quality, source: profile)
```

The banner is the user's only window into runtime selection. If you dispatch without it, you are hiding state the user needs to audit runtime behavior.

Step 3 - Dispatch with the resolved runtime settings:

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
    Fixme dir: [fixme_dir from root resolution]
    </project>
  "
)
```

When `model` or `reasoning_effort` is `null`, omit that field from the Agent dispatch instead of passing a string value.

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

Valid model override values: `opus`, `sonnet`, `haiku`, `inherit`. Config writes validate override values; legacy malformed values may still surface from an existing hand-edited config, so the visibility banner must be checked before dispatch.

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

Do not configure `fixme-handle-spec-review` for a phase that only dispatches `fixme-review-spec`. `HAS_FIX` routes back to the phase's first execute skill; without a skill that writes or revises the specification there is nothing safe to re-run.

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
- Focused re-review flag when the previous step was implementation repair. Focused re-review mode reviews fixes since last review plus directly affected call sites.

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
- For code review, `Fixes Since Last Review` is extra orientation, not a scope limiter unless focused re-review mode is active. Focused re-review mode reviews fixes since last review plus directly affected call sites.

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
| Plan/code review handler | `HANDLER_RESULT: CLEAN\|HAS_BLOCKING_FIX\|HAS_NONBLOCKING_FINDINGS\|HAS_ASK_USER` | End of fixme-handle-plan-review or fixme-handle-code-review output |
| Specification review handler | `HANDLER_RESULT: CLEAN\|HAS_FIX\|HAS_ASK_USER` | End of fixme-handle-spec-review output |

**If the expected directive is MISSING from the agent's output**, the agent is incomplete - it was truncated (hit context/output limit), crashed, or otherwise failed to finish. This is NOT "agent done without a directive."

**Recovery procedure:**

1. **Do NOT take over the agent's work.** Do not run tests, commit code, verify output, or do anything the agent was supposed to do. You are a dispatcher.
2. **Do NOT advance to the next manifest step.** The current step is incomplete.
3. **Re-dispatch the agent automatically (once).** Construct a resume prompt:
   - For **executors**: include the plan path, a summary of what the previous dispatch accomplished (based on its truncated output), and instruct it to continue from the last completed plan step.
   - For **review handlers**: re-dispatch with the same inputs as the original dispatch (findings, plan path, decision log).
   - For **other phase skills**: re-dispatch with the original inputs plus a summary of what was already produced.
4. **If the re-dispatched agent also returns without the expected directive**: escalate to user with structured context. Do NOT advance the manifest.

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

**Handler steps** (`[phase/review]` entries - handlers like fixme-handle-plan-review, fixme-handle-code-review):

1. Validate the routing directive. Plan/code handlers use `HANDLER_RESULT: CLEAN|HAS_BLOCKING_FIX|HAS_NONBLOCKING_FINDINGS|HAS_ASK_USER`. Specification handlers still use `HANDLER_RESULT: CLEAN|HAS_FIX|HAS_ASK_USER`.
2. Capture only the routing summary, classification counts, severity counts, route-scope counts, FIX items, decision cards, follow-up-only items, and rejection rationale needed for routing and the next review context packet
3. Mark step `completed`, set next step to `in_progress` (the routing step)

**Routing steps** (`[phase/route]` entries):

1. Read the HANDLER_RESULT from the previous handler's output
2. Validate the handler's classification counts before following the route:
   - For specification handlers, use the specification handler's legacy routing contract: `CLEAN`, `HAS_FIX`, or `HAS_ASK_USER` with `NEXT_ACTION: SPEC_LOOP_EXIT | SPEC_REVISION | ASK_USER_BATCH`. The remaining bullets in this list apply to plan/code handlers.
   - `FIX_UNCLEAR_COUNT > 0` or `ASK_USER_COUNT > 0` requires `HANDLER_RESULT: HAS_ASK_USER` and `NEXT_ACTION: ASK_USER_BATCH`
   - `HANDLER_RESULT: CLEAN` is valid only when `FIX_COUNT`, `FIX_UNCLEAR_COUNT`, and `ASK_USER_COUNT` are all `0`
   - `HANDLER_RESULT: HAS_BLOCKING_FIX` is valid only when `BLOCKING_FIX_COUNT > 0`, `FIX_UNCLEAR_COUNT = 0`, and `ASK_USER_COUNT = 0`
   - `HANDLER_RESULT: HAS_NONBLOCKING_FINDINGS` is valid only when `BLOCKING_FIX_COUNT = 0`, `NONBLOCKING_COUNT > 0`, `FIX_UNCLEAR_COUNT = 0`, and `ASK_USER_COUNT = 0`
   - `NEXT_ACTION: PLAN_REVISION` requires `PLAN_REQUIRED_COUNT > 0`
   - `NEXT_ACTION: IMPLEMENT_REPAIR` requires `IMPLEMENT_ONLY_COUNT > 0` and `PLAN_REQUIRED_COUNT = 0`
   - `NEXT_ACTION: FOLLOWUP_ONLY` requires `BLOCKING_FIX_COUNT = 0` and `NONBLOCKING_COUNT > 0`
   - `FIX_UNCLEAR` never means no-fix and never allows the loop to exit. It means the finding is real and the user must choose the approach.
3. If the directive and counts conflict, do not advance the loop. Re-dispatch the same handler with a correction prompt that quotes the inconsistent routing block and asks for a corrected routing directive.
4. Print the Review Classification block (see Review Classification Visibility). This happens for every handler output: CLEAN, HAS_BLOCKING_FIX, HAS_NONBLOCKING_FINDINGS, and HAS_ASK_USER.
5. Follow the routing rules specified in the manifest entry:
   - **CLEAN**: mark step `completed`, advance to the next numbered step
   - **HAS_BLOCKING_FIX + PLAN_REVISION**: mark step `completed`, jump back to the target plan step. Check loop guards before jumping. Reset ALL steps from the target step through the current routing step to `pending`, then set the target step to `in_progress`.
   - **HAS_BLOCKING_FIX + IMPLEMENT_REPAIR**: mark step `completed`, jump back to the implement execute step in repair mode. Check loop guards before jumping. Reset the implement execute, focused code review, handler, and routing steps to `pending`, then set the implement execute step to `in_progress`.
   - **HAS_NONBLOCKING_FINDINGS**: mark step `completed`, record follow-up-only items for the Run Summary, and advance to the next numbered step.
   - **HAS_ASK_USER**: batch questions to user (see ASK_USER Batching). Write answers to decision log. Re-dispatch the handler (set the handler step back to `in_progress`). Do NOT mark this routing step `completed` until the handler returns CLEAN, HAS_BLOCKING_FIX, or HAS_NONBLOCKING_FINDINGS.
6. Do NOT apply fixes yourself. Do NOT proceed past blocking fixes without dispatching the required producer. Follow-up-only items may proceed without a producer dispatch.

**Run Summary step** (`[done]` entry, **standalone mode only** - does not exist in nested mode):

1. Mark step `in_progress`
2. Output the Run Summary (see format below)
3. Mark step `completed`. Pipeline is DONE.

In nested mode (`--nested`) there is no Run Summary step. After the implement-routing step (`Step N.8`) returns CLEAN, in the same TodoWrite call mark `Step N.8 completed` AND mark the parent's next pending item (e.g. `Step 10 [verify]`) as `in_progress`, then immediately begin executing the parent's Step 10 instructions. Do NOT print a `## Run Summary` block. Do NOT narrate the handoff. The parent owns the final summary at its own terminal step.

## Never Apply Fixes Directly

When a review handler returns blocking FIX items, **always route through the proper producer** - plan-required fixes go through the plan loop, implementation-only fixes go through execute-plan repair mode, and nonblocking follow-up items are reported without a loop.

**Never apply FIX items inline in the orchestrator**, no matter how small or obvious they seem. "It's just a 2-line fix" is exactly when bugs slip through - a guard clause that accidentally exits render and violates Rules of Hooks, an init value that creates a hidden coupling to another module's internal ordering. The review loop exists to catch what you can't predict. Skipping it because you're confident is the definition of the problem the pipeline solves.

## Decision Log

Persisted at `<fixme-dir>/decisions.md`. Created by the orchestrator on first ASK_USER or FIX_UNCLEAR interaction. Only the orchestrator writes to this file - sub-skills read it.

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

Every review handler classification must be printed to the main conversation before routing continues. This is informational output, not a permission gate and not an invitation to bypass the pipeline.

### When To Print

Print one Review Classification block after every handler output is validated and before following the route:

- `CLEAN`: print the block, then continue to the next manifest step.
- `HAS_BLOCKING_FIX`: print the block, then loop through the configured route automatically.
- `HAS_NONBLOCKING_FINDINGS`: print the block, then continue without a revision loop.
- `HAS_ASK_USER`: print the block, then wait for the user decisions contained in that same block.

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

**The user reads the Review Classification block directly. It is the primary interface between the pipeline and the human. Follow these rules without exception.**

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
- [ ] No legacy decision-card labels appear as schema fields: `The question`, `Changes`, `Upside`, `Downside`, or `Approach/Pros/Cons/Impact/Effort`
- [ ] Context explains WHAT the affected code does and WHERE it lives before stating the problem

### 3. Process answers

Parse the user's response. Map each answer to its decision point.

- If remaining questions exist (user didn't address all), re-present ONLY those and ask again.
- Repeat until all decisions are resolved.

**Discussion Mode is active during this loop.** From the moment Step 2 (Present to user) finishes to the moment Step 4 (Record and re-invoke) begins, the orchestrator is in a decision pause and may read source code, run read-only Bash, fetch related files, and engage in inline discussion to help the user understand the decision (see "Discussion Mode (Decision-Pause Carve-Out)" near the top of this file). If the user asks a clarifying question that requires reading the codebase, **answer it directly with Read/Grep/Glob** - do NOT dispatch a sub-agent for it. Sub-agent dispatch during a decision pause is the failure mode this carve-out exists to prevent.

The loop only exits when the user has provided decisions (or "go with recommendations"). Inline discussion does NOT count as a decision - keep the pause open until the user explicitly resolves the decision points.

**Exit conditions** (any one ends the loop):

- User answered all decision points explicitly
- User said "go with recommendations" or equivalent (use recommended option for all unanswered)
- User said "up to you" / "your call" / equivalent for specific items (use recommendation for those)

### 4. Record and re-invoke

Write each answer to the decision log with a derived Locked Decision. Re-invoke the SAME handler with updated locked decisions (not restart the loop). The handler re-evaluates remaining findings against the new decisions - FIX_UNCLEAR items with approach answers become FIX items. ASK_USER items may become FIX, REJECT_*, or remain ASK_USER.

If the handler produces MORE FIX_UNCLEAR or ASK_USER items after re-invocation: batch and present again (max 2 rounds of questions per handler invocation, then escalate to user).

## Loop Guards

- **Phase review loop**: max `phase.review.maxCycles` iterations (default 3). Count only blocking revision loops. If blocking FIX items remain after max cycles, escalate to user using the format below.
- **Implementation repair loop**: max `phase.review.maxCycles` iterations for the implement phase (default 2). Count only blocking `IMPLEMENT_ONLY` repair loops. If blocking implementation-only FIX items remain after max cycles, escalate to user using the format below.
- **Outer loop**: max `workflows.<pipelineName>.outerMaxCycles` iterations (default 2). Count only blocking `PLAN_REQUIRED` cross-phase loops. If blocking plan-required FIX items remain after the configured number of full cycles, escalate to user using the format below.
- **Stall detection**: track unresolved blocking issue count for each comparable loop route (`PLAN_REQUIRED` and `IMPLEMENT_ONLY`). If the unresolved blocking issue count is not lower than the previous comparable cycle, stop the loop and escalate as stalled.

Do not increment any loop counter for `MINOR`, `INFO`, or `FOLLOWUP_ONLY` items.

### Loop Guard Escalation Format

When escalating persistent issues to the user, follow top-down progressive disclosure. No routing metadata. The user needs enough context to make an informed decision.

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
- **Loop guard triggers**: present accumulated FIX items with context and options (see Loop Guards).
- **Execute-plan surfaces a plan concern during execution**: route back through plan loop as a plan revision (not handled ad-hoc by executor).
- **Execute-plan pre-existing failure proof**: include in execution results passed to code revision fixme-write-plan.
- **Ticket transition fails**: log the error, continue pipeline execution. Ticket state is informational - a transition failure should not block work. Report the transition failure in the Run Summary.

## Run Summary

**Standalone mode only.** In nested mode (`--nested`), do NOT output a Run Summary at any point - the parent skill owns the final summary at its own terminal step. See "Nested mode" under "Creating the Manifest with TodoWrite" above.

**ONLY output this after the final phase completes (with clean review or no review) or after a loop guard triggers. NEVER mid-pipeline. NEVER in nested mode.**

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
