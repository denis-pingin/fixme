---
name: fixme-task
description: End-to-end orchestrator that executes config-driven pipelines with optional ticket state management. Loads pipeline definitions from .fixme/config.json (or uses hardcoded defaults), dispatches each phase's skills as isolated agents, manages review loops, decision persistence, context accumulation, and ticket state transitions. Use when given a task that should go through the plan-execute-review cycle (or any configured pipeline).
---

# Fixme Task - Config-Driven Pipeline Orchestrator

Execute a named pipeline from `<fixme-dir>/config.json`. Each pipeline is an ordered list of phases, each phase has skills to dispatch and an optional review loop. Manage context accumulation, decision persistence, loop control, and optional ticket state transitions.

## Hard Constraints

- **This skill is a dispatcher.** It never writes plans, reviews code, or classifies findings itself. It dispatches sub-skills as agents and routes their outputs.
- **Never read source code.** The orchestrator reads ONLY plan files, decision logs, config files, and agent outputs. All codebase exploration, investigation, and understanding happens inside dispatched agents. If you catch yourself using Read, Grep, or Glob on source code files, STOP - you are about to bypass the pipeline.
- **Never lose context.** Every piece of information (task, plans, findings, decisions, execution results) accumulates across iterations. Nothing is dropped.
- **Never override locked decisions silently.** If a conflict arises, present it to the user.
- **Never push code that doesn't pass verification.** The fixme-execute-plan sub-skill enforces this, but the orchestrator must not proceed past execution if verification failed.
- **Never output Run Summary until the FULL pipeline completes.** The pipeline is not done after a phase with no review. If a subsequent phase exists, it must run. If the current phase has a review loop, the review must complete before moving on. The Run Summary is ONLY output after the final phase's review handler returns Clean (or the phase has no review and it's the last phase) or after a loop guard triggers. If you feel like outputting a completion report mid-pipeline, STOP - you are about to skip remaining phases.
- **Never present intermediate findings to the user with bypass options.** Code review findings go to their handler skill. Plan review findings go to their handler skill. The orchestrator never shows findings to the user and asks "want me to fix this directly?" or "should we skip the loop?" If your next message to the user is a summary of findings with options, STOP - you are about to bypass the pipeline.
- **Never hardcode ticket backend paths.** All ticket operations go through the `fixme-tickets` abstraction skill, which reads `ticketBackend` from `<fixme-dir>/config.json` and routes to the correct backend. Never call `fixme-tools.cjs` or any backend directly from this orchestrator.

## Input Resolution

Parse the invocation argument to extract pipeline name, task description, and optional ticket path.

### Fixme Root Resolution (FIRST)

Before anything else - before parsing arguments, before checking the filesystem for plans, before reading config - resolve `<fixme-dir>` per `fixme-howto-fixme-dir` (preloaded into this agent's skills frontmatter; read at `~/.claude/skills/fixme-howto-fixme-dir/SKILL.md` if not preloaded). Run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and store the `fixme_dir` value as `<fixme-dir>`. Never use a literal `.fixme/` path in any tool.

When dispatching sub-agents, always include `Fixme dir: <fixme-dir>` in the `<project>` block of the dispatch prompt. Sub-agents do NOT re-resolve - they use the value passed in.

### Argument Parsing

```
/fixme-task full fix the login button        -> pipeline="full", task="fix the login button"
/fixme-task fix the login button             -> pipeline="default", task="fix the login button"
/fixme-task --ticket <path> fix the login    -> pipeline="default", ticket=<path>, task="fix the login"
/fixme-task full --ticket <path> fix login   -> pipeline="full", ticket=<path>, task="fix login"
```

**Rules:**
1. Extract `--ticket <path>` if present (anywhere in args). Remove it from remaining args.
2. Check the first remaining word against pipeline names in `<fixme-dir>/config.json`. If it matches a pipeline name, use it and remove it from remaining args. If no match, it's part of the task description and pipeline is `"default"`.
3. The remaining args are the task description.
4. If no config file exists, only `"default"` is recognized as a pipeline name (and it uses the hardcoded default pipeline).

### Task Resolution

Resolve the task description in this order - stop at the first match:

1. **Argument with path**: if a file path is passed, use it directly
2. **Argument referencing context** (e.g. "see plan", "the plan", "attached"): the plan/task is already in the conversation. Check the skill expansion content above (plans are often injected inline when the skill is invoked). Also check IDE selection context (`ide_selection` tags). Do NOT search the filesystem - the user is telling you it's already here.
3. **IDE selection context**: if `ide_selection` tags contain a plan or spec, use it
4. **Conversation context**: if the task was discussed earlier in conversation, use it
5. **Ask**: prompt the user for what to build

**CRITICAL**: When the argument is a reference like "see plan" or "the plan above", the plan content is almost always already present in the current message context (injected by the skill system or IDE). Read the full prompt carefully before searching the filesystem.

**The filesystem is never a source of tasks.** `<fixme-dir>/plans/` is checked only in the "Start From" step below, and only to find a plan **for the already-resolved task** - never to discover what the task is. If you cannot resolve the task from arguments, IDE selection, or conversation context, the answer is rule 5 (ask the user). Listing `<fixme-dir>/plans/` to find "something to work on" is a pipeline violation.

**Failure mode to avoid**: when conversation context already specifies the task (rule 4), do not then go scan `<fixme-dir>/plans/` and treat the most recent file as relevant. Old plans in that directory are for past tasks. They will mislead the pipeline. The "Start From" check below is for finding a plan that matches the current task - if no plan in conversation matches, start fresh.

### Project Root Resolution

Resolve the project root for sub-agent dispatch prompts:

1. **Explicit in task text**: if the task description contains `Project root: <path>`, extract and use that path
2. **Current working directory**: use the working directory

### Start From

Detect where to enter the pipeline based on what already exists **for the resolved task**. Check sources in this order: (1) conversation/prompt context (plans injected inline by skill system), (2) IDE selection, (3) argument as file path, (4) `<fixme-dir>/plans/` directory.

- **Plan exists** (found in conversation context, IDE selection, path argument, or `<fixme-dir>/plans/`): skip the plan-writing phase, enter at the plan phase's **review** step. If the plan phase has no review, skip it entirely and enter at the next phase.
- **Plan exists + already reviewed** (review findings provided): enter at the plan phase's **review handler**.
- **Plan exists + already executed** (execution results or code changes present): enter at the implement phase's **review** step (if it has one).
- **Nothing exists**: start from the first phase of the pipeline (default).

When entering mid-pipeline, still resolve the original task (for context accumulation) and check for an existing decision log at `<fixme-dir>/decisions.md`.

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
- Do NOT read source files "to understand the task better." The task description IS the input.

## Config Loading

Load the pipeline definition and project settings (using `<fixme-dir>` resolved in Input Resolution):

1. **Read `<fixme-dir>/config.json`** if it exists
2. **Extract the named pipeline** (or `"default"`) from `pipelines`
3. **If no config or no `pipelines` key**, use the hardcoded default pipeline:
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
4. **Filter out disabled phases** (`enabled === false`)
5. **Extract project settings** from config's `project` field. If absent, project settings are unavailable (agents will detect from CLAUDE.md and project files).

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
- **Read** - ONLY on `<fixme-dir>/config.json`, `<fixme-dir>/plans/*.md`, `<fixme-dir>/decisions.md`, or plan files referenced in conversation
- **Write** - ONLY on `<fixme-dir>/decisions.md`
- **Bash** - ONLY:
  - `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` (the FIRST command, always)
  - `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model <agent-name>` (before each Agent dispatch)
  - `mkdir -p <fixme-dir>` or `mkdir -p <fixme-dir>/plans` (using the resolved path, never literal `.fixme/`)

  Any Bash command with a literal `.fixme/` argument is forbidden. The value `<fixme-dir>` must be a substituted absolute path before the command runs.
- **TodoWrite** - to create and track the dispatch manifest steps

Any other tool use (Read on source code, Grep, Glob, Edit on source code) is a pipeline violation. If you need information from the codebase, dispatch an agent to get it.

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
Step 4  [plan/route]        Route: CLEAN->5, HAS_FIX->1 (max 3), HAS_ASK_USER->ask then re-run 3
Step 5  [implement]         Dispatch fixme-execute-plan
Step 6  [implement/review]  Dispatch fixme-review-code
Step 7  [implement/review]  Dispatch fixme-handle-code-review
Step 8  [implement/route]   Route: CLEAN->9, HAS_FIX->1 (outer, max 2), HAS_ASK_USER->ask then re-run 7
Step 9  [done]              Run Summary
```

The manifest always contains ALL steps. When entering mid-pipeline (e.g., plan already exists), pre-entry steps are marked `completed` so backward jumps have valid targets. Example: entering at implement phase marks steps 1-4 as `completed` and step 5 as `in_progress`.

### Routing Rules

Each routing entry specifies explicit jump targets:

- **CLEAN**: advance to the next numbered step
- **HAS_FIX (intra-phase)**: jump back to the phase's first execute step. Increment the phase review counter. If counter > `phase.review.maxCycles` (default 3): escalate to user.
- **HAS_FIX (cross-phase)**: jump back to the earlier phase's first execute step. Increment the outer loop counter. If counter > 2: escalate to user. If ticket path provided: dispatch ticket backward transition with `--reason` before re-entering.
- **HAS_ASK_USER**: batch questions to user (see ASK_USER Batching), write to decision log, re-dispatch the handler (go back to the handler entry, NOT this routing step). Do NOT advance past the routing step until the handler returns CLEAN or HAS_FIX.

### Creating the Manifest with TodoWrite

After building the manifest, create it using TodoWrite. One todo per step. All steps start as `pending` for a fresh pipeline, or with pre-entry steps as `completed` for mid-pipeline entry:

**Fresh start (no prior state):**
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

**Mid-pipeline entry (plan exists, entering at plan review):**
```
TodoWrite([
  { content: "Step 1 [plan] Dispatch fixme-write-plan", status: "completed", activeForm: "Dispatching fixme-write-plan" },
  { content: "Step 2 [plan/review] Dispatch fixme-review-plan", status: "in_progress", activeForm: "Dispatching fixme-review-plan" },
  ...remaining steps as pending...
])
```

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
- Backward re-entry (HAS_FIX cross-phase jump): include `--reason <reason>`

Ticket transitions are dispatched inline before the execute step - they are not separate manifest entries. They do not produce output that affects routing.

## Sub-Skill Dispatch

Dispatch each sub-skill as an isolated agent via the Agent tool. Pass all required inputs as prompt content. The agent does the work. You route the output. That's the entire job.

### Dispatch contract (NON-NEGOTIABLE)

Dispatch sub-skills using their agent type via `subagent_type`. Each fixme sub-skill has an agent definition in `~/.claude/agents/` that binds its role constraints (identity, boundaries, tool restrictions) at the system level and preloads its SKILL.md via `skills` frontmatter.

**Never paste SKILL.md content into the agent prompt.** Never tell agents to "read your SKILL.md first." The agent definition handles both role binding and SKILL.md preloading.

**Before every Agent dispatch, resolve the model via the CLI and print a visibility banner.** This is non-negotiable. The orchestrator must not dispatch without first asking the tool what model to use, and must not dispatch silently.

Step 1 - Resolve the model:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model <agent-name>
```

Returns JSON like `{"agent":"fixme-write-plan","model":"opus","profile":"quality","source":"profile"}`. The CLI reads `<fixme-dir>/config.json` (or returns defaults if none exists). Do not hardcode models, do not skip the call.

Step 2 - Print the banner as a single line of user-visible text before the Agent tool call:

```
→ dispatching fixme-write-plan (model: opus, profile: quality, source: profile)
```

The banner is the user's only window into model selection. If you dispatch without it, you are hiding state the user needs to audit runtime behavior.

Step 3 - Dispatch with the resolved model:

```
Agent(
  subagent_type="{skill-name}",
  model="{resolved-model}",
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

The agent's role and operational procedures are already loaded by its agent definition. The dispatch prompt only contains task-specific inputs.

### Tool restrictions

Tool access for each sub-skill is enforced by its agent definition in `~/.claude/agents/`. Read-only agents (reviewers, handlers) have no Edit or Write tools. Write-access agents (plan writer, executor, investigator, researcher, browser verifier) have full tool access. See the agent definition files for specifics.

### Model Resolution

Model resolution is performed by `fixme-tools.cjs resolve-model` (see the dispatch contract above). The CLI is the authoritative source for both the profile table and the `override > profile > default` resolution order. When `models.profile` is not set or the `models` section is missing, the CLI returns `opus` with `profile: quality` and `source: default`. When a configured profile is unknown (typo, future value), the CLI also falls back to `opus`/`quality`/`default` - so a malformed profile never silently picks a different model.

**`source` field values:**
- `override` - came from `models.overrides[agent]`
- `profile` - came from the profile table lookup
- `default` - nothing applied (no config, unknown profile, or agent absent from the profile table)

Profile quick reference (authoritative table lives in `fixme-tools.cjs`):

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| fixme-write-plan | opus | opus | sonnet |
| fixme-review-plan | opus | opus | sonnet |
| fixme-review-code | opus | opus | sonnet |
| fixme-investigate | opus | opus | sonnet |
| fixme-research | opus | opus | sonnet |
| fixme-handle-plan-review | opus | opus | sonnet |
| fixme-handle-code-review | opus | opus | sonnet |
| fixme-execute-plan | opus | sonnet | sonnet |
| fixme-task | opus | sonnet | haiku |
| fixme-browser-verify | opus | sonnet | haiku |

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

Valid model values: `opus`, `sonnet`, `haiku`, `inherit`. The CLI does not validate the model string - it returns whatever is configured so malformed values surface at Agent dispatch time rather than being silently dropped.

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
- Plan revision mode (review FIX loop): original task + path to previous plan + FIX items from handler + path to decision log
- Code revision mode (outer loop from later phase): original task + path to previous plan + execution results + FIX items from handler + path to decision log

**fixme-review-plan** (in `plan` phase review):
- Path to plan

**fixme-handle-plan-review** (in `plan` phase review):
- Review findings (full output from reviewer)
- Path to plan
- Path to decision log (if it exists)

**fixme-execute-plan** (in `implement` phase):
- Path to plan

**fixme-review-code** (in `implement` phase review):
- Path to plan
- Git diff information (base branch or commit range)

**fixme-handle-code-review** (in `implement` phase review):
- Review findings (full output from reviewer)
- Path to plan
- Path to decision log (if it exists)

**fixme-investigate** (in `investigate` phase):
- Task description (user's exact bug report / question)

**fixme-research** (in `research` phase):
- Task description + investigation output from prior phase

**fixme-browser-verify** (in `verify` phase):
- Task description + plan path + execution results

For custom skills not listed above: pass the task description and all accumulated context from prior phases.

## Step Processing

Follow these procedures after each agent dispatch returns. The manifest determines WHICH step comes next. These procedures determine HOW to process each step type.

### Directive Validation (NON-NEGOTIABLE)

Every agent dispatch has an expected routing directive in its output. Before processing, you MUST validate that the directive is present:

| Agent type | Expected directive | Example |
|---|---|---|
| Phase skill (executor) | `EXECUTOR_STATUS: COMPLETE` + `NEXT_PIPELINE_STEP: <skill>` | End of fixme-execute-plan output |
| Review handler | `HANDLER_RESULT: CLEAN\|HAS_FIX\|HAS_ASK_USER` | End of fixme-handle-*-review output |

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
2. Capture the agent's full output as accumulated context for subsequent steps
3. Mark step `completed`, set next step to `in_progress`, dispatch next agent

**Review steps** (`[phase/review]` entries - reviewers like fixme-review-plan, fixme-review-code):

1. Capture the agent's full output (these are findings)
2. Mark step `completed`, set next step to `in_progress`
3. Pass the findings as input to the handler dispatch (the next manifest step)

**Handler steps** (`[phase/review]` entries - handlers like fixme-handle-plan-review, fixme-handle-code-review):

1. Validate the routing directive: `HANDLER_RESULT: CLEAN|HAS_FIX|HAS_ASK_USER`
2. Capture the handler's full output
3. Mark step `completed`, set next step to `in_progress` (the routing step)

**Routing steps** (`[phase/route]` entries):

1. Read the HANDLER_RESULT from the previous handler's output
2. Follow the routing rules specified in the manifest entry:
   - **CLEAN**: mark step `completed`, advance to the next numbered step
   - **HAS_FIX**: mark step `completed`, jump back to the target step specified in the manifest. Check loop guards before jumping (see Loop Guards). When jumping back, reset ALL steps from the target step through the current routing step to `pending`, then set the target step to `in_progress`. This ensures the full loop (including review steps) runs again - resetting only the target would leave intermediate steps as `completed` and they'd be skipped.
   - **HAS_ASK_USER**: batch questions to user (see ASK_USER Batching). Write answers to decision log. Re-dispatch the handler (set the handler step back to `in_progress`). Do NOT mark this routing step `completed` until the handler returns CLEAN or HAS_FIX.
3. Do NOT apply fixes yourself. Do NOT proceed without dispatching.

**Run Summary step** (`[done]` entry):

1. Mark step `in_progress`
2. Output the Run Summary (see format below)
3. Mark step `completed`. Pipeline is DONE.

## Never Apply Fixes Directly

When a review handler returns FIX items, **always route through the proper loop** - either intra-phase (re-run phase skills + review) or cross-phase (backward transition to earlier phase).

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

## ASK_USER Batching

When a handler produces FIX_UNCLEAR or ASK_USER items:

### 1. Collect

Gather all items from the handler output:

- All FIX_UNCLEAR and ASK_USER items (need user input)
- All FIX items (will be applied automatically)
- All REJECT_* items (dismissed)

### 2. Present to user

**The user reads this output directly. It is the primary interface between the pipeline and the human. Follow these rules without exception.**

#### Formatting Rules (NON-NEGOTIABLE)

All user-facing output from the orchestrator must be visually scannable:

- **Blank line between every section, heading, and paragraph.** No two content blocks should be adjacent without a separator. Dense walls of text are never acceptable.
- **Use headings** (`##`, `###`) to separate major sections (summary, confirmed fixes, decisions, closing prompt). The user must be able to skim headings to find what they need.
- **Use bullet lists** for multiple items within a section. Never pack multiple items into a single paragraph.
- **Use horizontal rules** (`---`) between independent decision blocks when presenting multiple decisions. Each decision is visually distinct.
- **Bold key labels** (`**Context**:`, `**The question**:`, etc.) and start each on its own line.
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.

#### Routing Metadata Prohibition

**Never expose internal pipeline state to the user.** These terms are internal routing language and must NEVER appear in user-facing output:

- `HAS_FIX`, `HAS_ASK_USER`, `HANDLER_RESULT`, `CLEAN`
- `FIX_COUNT`, `FIX_UNCLEAR_COUNT`, `ASK_USER_COUNT`
- `NEXT_ACTION`, `OUTER_LOOP`, `ASK_USER_BATCH`
- `EXECUTOR_STATUS`, `NEXT_PIPELINE_STEP`

Use human language instead. "The code review found 3 issues" not "Handler returned HAS_ASK_USER + HAS_FIX."

#### Output Structure

Present the output in this exact order, with proper spacing between all sections:

**1. Summary line** - One sentence in plain language. Exact counts, no routing metadata.

```
The {plan/code} review found {N} issues: {X} confirmed fix(es) that will be applied
automatically, {Y} need(s) your input{, Z dismissed}.
```

**2. Confirmed fixes** (only when FIX items coexist with questions) - Brief list so the user knows what will be applied automatically after their decisions. Keep each item to one sentence.

```markdown
### Confirmed Fixes (will be applied after your decisions)

1. **{short title}** - {one sentence: what's wrong and what the fix will do.}
   Files: [{file.ts:line}](/absolute/path/file.ts#Lline)

2. **{short title}** - {one sentence.}
   Files: [{file.ts:line}](/absolute/path/file.ts#Lline)
```

**3. Decision points** - Present each ASK_USER and FIX_UNCLEAR item using the handler's **full Question field verbatim**. The handler's Question field follows the Decision Presentation Guidelines (from the `fixme-howto-present-decisions` shared skill) and is already formatted as a structured decision block.

**Do NOT summarize, rephrase, or compress the handler's Question field.** The handler invested significant effort in making the question self-contained, properly structured, and concrete. Summarizing it destroys the context, clickable file references, option structure (Pros/Cons/Impact/Effort), and cross-references that make the decision possible.

**Do NOT replace the handler's structured format with flat paragraphs.** If the handler produced:

```
## Decision: {title}

**Context**: {established context with clickable file references}

**The question**: {clear statement}

**Options**:

1. **{Option A}**
   - Approach: ...
   - Pros: ...
   - Cons: ...
   - Impact: ...
   - Effort: ...

2. **{Option B}**
   - Approach: ...
   - Pros: ...
   - Cons: ...
   - Impact: ...
   - Effort: ...

**Recommendation**: Option {X} - {reasoning}
```

...then that EXACT structure, with all its spacing and sub-fields, is what the user sees. Not a compressed paragraph. Not a flat list. The full structured block with blank lines between sections.

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
- [ ] Each decision block has the full structured format (Context, The question, Options with sub-fields, Recommendation)
- [ ] Options have Pros, Cons, Impact, and Effort sub-fields (not just a flat sentence)
- [ ] Context explains WHAT the affected code does and WHERE it lives before stating the problem

### 3. Process answers

Parse the user's response. Map each answer to its decision point.

- If remaining questions exist (user didn't address all), re-present ONLY those and ask again.
- Repeat until all decisions are resolved.

**Exit conditions** (any one ends the loop):

- User answered all decision points explicitly
- User said "go with recommendations" or equivalent (use recommended option for all unanswered)
- User said "up to you" / "your call" / equivalent for specific items (use recommendation for those)

### 4. Record and re-invoke

Write each answer to the decision log with a derived Locked Decision. Re-invoke the SAME handler with updated locked decisions (not restart the loop). The handler re-evaluates remaining findings against the new decisions - FIX_UNCLEAR items with approach answers become FIX items. ASK_USER items may become FIX, REJECT_*, or remain ASK_USER.

If the handler produces MORE FIX_UNCLEAR or ASK_USER items after re-invocation: batch and present again (max 2 rounds of questions per handler invocation, then escalate to user).

## Loop Guards

- **Phase review loop**: max `phase.review.maxCycles` iterations (default 3). If FIX items remain after max cycles, escalate to user using the format below.
- **Outer loop**: max 2 iterations. If FIX items remain after 2 full cycles, escalate to user using the format below.

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

**ONLY output this after the final phase completes (with clean review or no review) or after a loop guard triggers. NEVER mid-pipeline.**

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
