---
name: fixme-task
description: End-to-end orchestrator that executes config-driven pipelines with optional ticket state management. Loads pipeline definitions from .fixme/config.json (or uses hardcoded defaults), dispatches each phase's skills as isolated agents, manages review loops, decision persistence, context accumulation, and ticket state transitions. Use when given a task that should go through the plan-execute-review cycle (or any configured pipeline).
---

# Fixme Task - Config-Driven Pipeline Orchestrator

Execute a named pipeline from `.fixme/config.json`. Each pipeline is an ordered list of phases, each phase has skills to dispatch and an optional review loop. Manage context accumulation, decision persistence, loop control, and optional ticket state transitions.

## Hard Constraints

- **This skill is a dispatcher.** It never writes plans, reviews code, or classifies findings itself. It dispatches sub-skills as agents and routes their outputs.
- **Never read source code.** The orchestrator reads ONLY plan files, decision logs, config files, and agent outputs. All codebase exploration, investigation, and understanding happens inside dispatched agents. If you catch yourself using Read, Grep, or Glob on source code files, STOP - you are about to bypass the pipeline.
- **Never lose context.** Every piece of information (task, plans, findings, decisions, execution results) accumulates across iterations. Nothing is dropped.
- **Never override locked decisions silently.** If a conflict arises, present it to the user.
- **Never push code that doesn't pass verification.** The fixme-execute-plan sub-skill enforces this, but the orchestrator must not proceed past execution if verification failed.
- **Never output Run Summary until the FULL pipeline completes.** The pipeline is not done after a phase with no review. If a subsequent phase exists, it must run. If the current phase has a review loop, the review must complete before moving on. The Run Summary is ONLY output after the final phase's review handler returns Clean (or the phase has no review and it's the last phase) or after a loop guard triggers. If you feel like outputting a completion report mid-pipeline, STOP - you are about to skip remaining phases.
- **Never present intermediate findings to the user with bypass options.** Code review findings go to their handler skill. Plan review findings go to their handler skill. The orchestrator never shows findings to the user and asks "want me to fix this directly?" or "should we skip the loop?" If your next message to the user is a summary of findings with options, STOP - you are about to bypass the pipeline.
- **Never hardcode ticket backend paths.** All ticket operations go through the `fixme-tickets` abstraction skill, which reads `ticketBackend` from `.fixme/config.json` and routes to the correct backend. Never call `fixme-tools.cjs` or any backend directly from this orchestrator.

## Input Resolution

Parse the invocation argument to extract pipeline name, task description, and optional ticket path.

### Argument Parsing

```
/fixme-task full fix the login button        -> pipeline="full", task="fix the login button"
/fixme-task fix the login button             -> pipeline="default", task="fix the login button"
/fixme-task --ticket <path> fix the login    -> pipeline="default", ticket=<path>, task="fix the login"
/fixme-task full --ticket <path> fix login   -> pipeline="full", ticket=<path>, task="fix login"
```

**Rules:**
1. Extract `--ticket <path>` if present (anywhere in args). Remove it from remaining args.
2. Check the first remaining word against pipeline names in `.fixme/config.json`. If it matches a pipeline name, use it and remove it from remaining args. If no match, it's part of the task description and pipeline is `"default"`.
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

### Start From

Detect where to enter the pipeline based on what already exists. Check sources in this order: (1) conversation/prompt context (plans injected inline by skill system), (2) IDE selection, (3) argument as file path, (4) `.fixme/plans/` directory.

- **Plan exists** (found in conversation context, IDE selection, path argument, or `.fixme/plans/`): skip the plan-writing phase, enter at the plan phase's **review** step. If the plan phase has no review, skip it entirely and enter at the next phase.
- **Plan exists + already reviewed** (review findings provided): enter at the plan phase's **review handler**.
- **Plan exists + already executed** (execution results or code changes present): enter at the implement phase's **review** step (if it has one).
- **Nothing exists**: start from the first phase of the pipeline (default).

When entering mid-pipeline, still resolve the original task (for context accumulation) and check for an existing decision log at `.fixme/decisions.md`.

### Investigation Tasks

If the task asks "why", "what causes", "debug", or describes unexpected behavior:
- This is an investigation. The temptation to explore the codebase will be strongest here.
- Pass the user's EXACT description to the first phase's skill. Add nothing from your own exploration.
- Do NOT read source files "to understand the task better." The task description IS the input.

## Config Loading

Load the pipeline definition and project settings:

1. **Read `.fixme/config.json`** if it exists
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
5. **Extract project settings** from config's `project` field. If absent, fall back to `.fixme/project-context.yaml`

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
- **Read** - ONLY on `.fixme/config.json`, `.fixme/plans/*.md`, `.fixme/decisions.md`, `.fixme/project-context.yaml`, or plan files referenced in conversation
- **Write** - ONLY on `.fixme/decisions.md`
- **Bash** - ONLY `mkdir -p .fixme/plans` or `mkdir -p .fixme`

Any other tool use (Read on source code, Grep, Glob, Edit on source code) is a pipeline violation. If you need information from the codebase, dispatch an agent to get it.

## Phase Execution Loop

```
Load pipeline config -> filter disabled phases -> resolve entry point

for each phase in pipeline (starting from entry point):

  1. TICKET TRANSITION (if ticket path provided):
     Dispatch fixme-tickets: transition <ticket-path> <phase.name>
       First phase: include --pipeline <pipeline-name>
       Backward re-entry: include --reason <reason>

  2. PHASE SKILLS:
     Dispatch each skill in phase.skills sequentially via Agent tool.
     Pass accumulated context from prior phases.

  3. REVIEW LOOP (if phase.review exists and phase.review.enabled !== false):
     a. Run phase.review.skills chain sequentially
        - First skill produces findings (reviewer)
        - Second skill triages findings (handler)
     b. Read HANDLER_RESULT routing directive from handler output
     c. Route:
        - CLEAN: exit review loop, proceed to next phase
        - HAS_ASK_USER: batch questions to user (may include both FIX_UNCLEAR approach
          questions and ASK_USER validity questions), write answers to decision log,
          re-invoke handler with updated decisions
        - HAS_FIX: increment review counter, check against phase.review.maxCycles
          (default 3). If exceeded: escalate to user. Else: re-run phase.skills
          then review chain again.

  4. CONTEXT ACCUMULATION:
     Capture phase outputs (plans, findings, execution results) for next phase.
```

### Backward Transitions (Outer Loop)

When a review handler in a later phase (e.g., `implement`) produces FIX items that require re-entering an earlier phase (e.g., `plan`):

1. Increment the outer loop counter
2. Check the outer loop guard (max 2 iterations). If exceeded: escalate to user.
3. If ticket path: dispatch ticket backward transition (`implement -> plan`) with `--reason` describing what the review found
4. Re-enter the pipeline at the earlier phase
5. Resume forward execution from there

This generalizes the current "code review FIX -> re-plan -> re-execute -> re-review" outer loop. The review handler's FIX output determines which earlier phase to re-enter. For the `implement` phase handler, re-entry is always at the `plan` phase (or whatever phase contains `fixme-write-plan`).

## Sub-Skill Dispatch

Dispatch each sub-skill as an isolated agent via the Agent tool. Pass all required inputs as prompt content. The agent does the work. You route the output. That's the entire job.

### Dispatch contract (NON-NEGOTIABLE)

When dispatching a sub-skill agent, you MUST include the sub-skill's full SKILL.md content in the agent prompt. Read the SKILL.md file at `~/.claude/skills/{skill-name}/SKILL.md` and paste it into the prompt.

**Never paraphrase a skill's instructions in your own words.** The SKILL.md IS the contract - it defines output format, routing directives, classification rules, and behavioral boundaries. An agent that receives your summary instead of the actual skill instructions will default to general-purpose behavior (e.g., applying fixes instead of classifying them, skipping routing directives, producing unstructured output).

The dispatch prompt structure for every sub-skill:
1. The full SKILL.md content (read from file, pasted verbatim)
2. The specific inputs for this invocation (findings, plan path, decision log path, etc.)
3. The project root path

### Read-only vs read-write agents

Sub-skills that **classify, review, or analyze** must be told they are read-only. Add this line to their dispatch prompts:

> "You are a READ-ONLY agent. You MUST NOT use Edit, Write, or Bash commands that modify files. Your job is to analyze and produce a structured report. Do not fix, patch, or change any code."

This applies to: `fixme-review-plan`, `fixme-review-code`, `fixme-handle-plan-review`, `fixme-handle-code-review`, and any custom review skills in the pipeline config.

Sub-skills that **write plans, execute code, investigate, or verify** need write access: `fixme-write-plan`, `fixme-execute-plan`, `fixme-investigate`, `fixme-research`, `fixme-browser-verify`, and any custom action skills in the pipeline config.

### Ticket transition dispatch

Ticket transitions are dispatched through the `fixme-tickets` abstraction skill, not directly to any backend.

1. Read `~/.claude/skills/fixme-tickets/SKILL.md`
2. Dispatch via Agent with the SKILL.md content and the operation details
3. The fixme-tickets skill resolves the backend from `.fixme/config.json` and handles the rest

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

## Step-by-Step Transition Procedures

Follow these EXACTLY after each agent returns. Do not improvise transitions.

### After a phase skill returns:

1. Capture the agent's full output (this is phase output, part of accumulated context).
2. If this phase has a review loop (`phase.review` exists and `review.enabled !== false`):
   - Dispatch the first review skill with appropriate inputs.
3. If this phase has NO review loop:
   - If there are more phases: proceed to the next phase.
   - If this is the last phase: output Run Summary -> DONE.

### After a review skill (reviewer) returns:

1. Read the agent's full output (findings).
2. Dispatch the next skill in the review chain (the handler) with:
   - Review findings: the full agent output (paste as markdown in prompt)
   - Plan path (if applicable)
   - Decision log path: `.fixme/decisions.md` (if exists)
3. Do NOT classify findings yourself. Do NOT skip this dispatch.

### After a review handler returns:

1. Read the HANDLER_RESULT routing directive at the end of the output.
2. **If `CLEAN`**:
   - If there are more phases in the pipeline: proceed to the next phase.
   - If this is the last phase: output Run Summary -> DONE.
3. **If `HAS_ASK_USER`**: batch questions to user (see ASK_USER Batching). After user answers, write to decision log, re-dispatch the same handler with updated decisions.
4. **If `HAS_FIX`**:
   - If this is an intra-phase review (e.g., plan review in the `plan` phase):
     - Increment the phase's review counter.
     - If counter > `phase.review.maxCycles` (default 3): escalate to user.
     - Else: re-run the phase's skills (e.g., fixme-write-plan in revision mode), then re-run the review chain.
   - If this is a cross-phase review (e.g., code review in `implement` phase that requires replanning):
     - Increment the outer loop counter.
     - If counter > 2: escalate to user.
     - Else: re-enter the pipeline at the earlier phase (see Backward Transitions).
5. Do NOT apply fixes yourself. Do NOT proceed without dispatching.

### After fixme-execute-plan returns (CRITICAL):

**This is NOT the end of the pipeline if the `implement` phase has a review loop.**

1. Capture the full completion report from the agent output.
2. If the phase has a review loop: dispatch the first review skill with plan path + git diff info.
3. Do NOT output any summary, completion message, or status to the user.
4. Do NOT stop to ask if the user wants to continue.
5. The execution report is INPUT to the code review step, not OUTPUT to the user.

### Pipeline Exit Points (ONLY these)

- Last phase completes with no review, or last phase's review handler returns CLEAN -> output Run Summary -> DONE
- Outer loop guard triggers (max 2 iterations) -> escalate to user
- A sub-skill agent fails unexpectedly -> report error to user (include ticket path if applicable)

## Never Apply Fixes Directly

When a review handler returns FIX items, **always route through the proper loop** - either intra-phase (re-run phase skills + review) or cross-phase (backward transition to earlier phase).

**Never apply FIX items inline in the orchestrator**, no matter how small or obvious they seem. "It's just a 2-line fix" is exactly when bugs slip through - a guard clause that accidentally exits render and violates Rules of Hooks, an init value that creates a hidden coupling to another module's internal ordering. The review loop exists to catch what you can't predict. Skipping it because you're confident is the definition of the problem the pipeline solves.

## Decision Log

Persisted at `.fixme/decisions.md` in the project root. Created by the orchestrator on first ASK_USER or FIX_UNCLEAR interaction. Only the orchestrator writes to this file - sub-skills read it.

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

1. Collect all FIX_UNCLEAR and ASK_USER items from the handler output.
2. Present to user as a numbered list. Each item includes the full Question field from the handler (which follows the Question Guidelines: Problem, Context, Why it matters, Options, Recommendation, The actual question).
3. User provides all answers in one response.
4. Write each answer to decision log with a derived Locked Decision.
5. Re-invoke the SAME handler with updated locked decisions (not restart the loop). The handler re-evaluates remaining findings against the new decisions - FIX_UNCLEAR items with approach answers become FIX items. ASK_USER items may become FIX, REJECT_*, or remain ASK_USER.
6. If the handler produces MORE FIX_UNCLEAR or ASK_USER items after re-invocation: batch and present again (max 2 rounds of questions per handler invocation, then escalate to user).

## Loop Guards

- **Phase review loop**: max `phase.review.maxCycles` iterations (default 3). If FIX items remain after max cycles, present them to user with context: "These issues persist after N revision attempts in the [phase] phase: [list]. Options: (a) proceed to next phase anyway, (b) provide guidance on how to resolve, (c) abort."
- **Outer loop**: max 2 iterations. If FIX items remain after 2 full cycles, present them to user: "These review issues persist after 2 full cycles: [list]. Options: (a) accept current state, (b) provide guidance, (c) abort."

## Error Handling

- **Sub-skill agent fails unexpectedly**: stop, report to user with full context of what succeeded and what failed, offer to resume from last successful step. If ticket path provided, include it in the error report (but do NOT transition to `failed` - the session owns that).
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
