---
name: fixme
description: Use first for Fixme-related requests, including bare FIXME-N labels, saved task or ticket refs, named Fixme pipelines, Fixme skill selection, sessions, PR comments, rebases, tickets, configuration, usage reports, and ambiguous ideas that need routing to the right Fixme workflow.
argument-hint: "[request]"
---

# Fixme Router

Select the right Fixme skill for the user's request, then invoke that skill with the normalized arguments. This skill is a router only. It does not investigate, plan, edit code, review, rebase, create tickets, or mutate workflow state itself.

## When To Use

Use this skill before other Fixme skills when the request is Fixme-shaped but not already an explicit single skill invocation.

Fixme-shaped signals include:

- A saved task or ticket label such as `FIXME-9`
- Multiple labels such as `FIXME-9 followed by FIXME-10`
- Pipeline words such as `standard pipeline`, `bugfix pipeline`, `full pipeline`, `plan-only`, or `execute-only`
- A request to choose which Fixme skill to use
- A request about Fixme sessions, PR comments, rebasing, tickets, configuration, usage, alerts, or brainstorming
- A bare task request in a repo that has a Fixme workflow and the user asks to run it through Fixme

If the user explicitly invokes a concrete skill such as `/fixme-task`, `/fixme-session`, or `/fixme-pr-comments`, use that concrete skill directly. Do not insert this router between an explicit invocation and the target skill.

## Hard Constraints

- Route to a concrete Fixme skill as soon as the correct target is clear.
- Do not dispatch more than one `fixme-task` at a time. For multiple `FIXME-N` labels, invoke `fixme-task` sequentially in the user's stated order and wait for each run to finish before starting the next.
- Wait by transport: for an `agent`/`background` child, block silently on the runtime wait primitive with a 5-minute watchdog (`wait_agent({ targets: [id], timeout_ms: 300000 })` for Codex agents); on watchdog timeout call `lifecycle dispatch probe` with `parentStatePath`, `waitActionId`, `watchdogMs: 300000`, and `probeReason: "waitWatchdogTimeout"`, then branch only on the returned `transition` rather than hand-rolling `run status` age thresholds. If the transition is `runtimeWaitTimedOut`, report or surface `reason: "runtimeLivenessUnknown"` and stop the current wait path; a status file, active runtime handle, or heartbeat detail is not proof that an LLM is still working. If the transition is `stalledOwner`, run `lifecycle dispatch stalled-owner recover` with the returned recovery data and then either execute the returned owner resume runtime action or treat `ownerStoppedBeforeDispatchCompletion` as dispatch failure. `run status.updatedAt` is the last status write, not a heartbeat; only `run status.workerHeartbeat.observedAt` is child-owned liveness detail. For an `inline-skill` child, take the synchronous return without a synthetic polling loop; for a `direct` user-facing turn, wait through the normal user turn. "Polling" means watchdog-timeout fallback or explicit status handling, not normal waiting; durable attention semantics are unchanged.
- For long or noisy build/lint/test/install/maintenance commands this router runs directly, capture full combined output to a deterministic generated log under `<fixme-dir>/runs/<statusId>/logs/<timestamp>-<slug>.log` (or `<fixme-dir>/logs/<timestamp>-<slug>.log` when no statusId is available); report command, exit status, and log path on success and add at least the last 150 lines on failure; never hide errors, warnings, prompts, or product-output commands. These logs are generated artifacts and are not committed.
- Do not reinterpret a requested pipeline. Preserve explicit pipeline names such as `standard`, `bugfix`, `full`, `product-spec`, `technical-spec`, `plan-only`, and `execute-only`.
- Parent brokers must not run `task decision append`, `task checkpoint`, `run attention clear`, or `lifecycle dispatch prepare` after recording an attention answer. Task-owned decisions remain owned by `fixme-task`.
- If the current context is brokering a pending `fixme-task` attention prompt or attention answer, call `lifecycle attention broker show`, read the returned `promptMarkdown` and `renderContract`, and present the prompt according to the Boundary Delivery Contract in `fixme-howto-present-decisions`. Decision answer: `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker resume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --status-id <fixmeTaskStatusId> --attention-id <attention-id> --data '{"answer":"<raw user answer>","answeredBy":"user","answerKind":"decision"}'`. Clarifying question: `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker resume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --status-id <fixmeTaskStatusId> --attention-id <attention-id> --data '{"answer":"<raw user clarification question>","answeredBy":"user","answerKind":"clarificationRequest"}'`. Execute exactly the returned `runtimeAction`, then call `lifecycle runtime-action observe` with evidence for that `actionId`; repeat while lifecycle returns `status: "requiresRuntimeAction"`. After lifecycle observes successful runtime launch evidence, copy `acknowledgeResumeTemplate.data` exactly, add only the observed `runtimeHandle` when the runtime action returned one, and call `lifecycle attention broker acknowledge-resume --fixme-dir <fixme-dir>` with that payload. If broker show returns `status: "answered"`, do not present the prompt again; call broker resume with the returned `answer`, execute the returned runtime-action loop, then acknowledge-resume with the same observed-launch evidence shape. If the resumed `fixme-task` returns another `FIXME_ATTENTION_REQUIRED`, broker that new prompt the same way. Do not route the message as a fresh saved task or one-off implementation workflow, and do not duplicate the Boundary Delivery Contract's normative prose in this router. Do not run `--help` to discover the payload for this path.
- If a dispatched `fixme-task` returns a `FIXME_USER_PROMPT ... END_FIXME_USER_PROMPT` envelope, treat the enclosed payload as the user-facing prompt under the Boundary Delivery Contract and route the user's answer through the same broker/resume mechanics when an attention id is present.
- When this router launches `fixme-task`, do not call the skill directly. Build a `lifecycle parent prepare-child --data-stdin` payload with `parent.parentSkill: "fixme"`, launch only through the returned `launch.transport`, and pass the returned `launch.promptBlocks.taskStateOwner`, `launch.promptBlocks.parentContinuation`, `launch.promptBlocks.activeChild`, `launch.promptBlocks.project`, `launch.promptBlocks.liveness`, `launch.promptBlocks.taskInput`, and `launch.usageContext` blocks verbatim. This is the front-door liveness handoff that lets `fixme-task` open durable attention instead of returning hidden prompt text.
- If two routes are plausible and they have different side effects, ask one concise question before dispatching.
- If authoritative Linear ticket content is needed and Linear MCP is unavailable, stop per the repository Linear MCP rule instead of guessing.

## Routing Table

| User intent | Route |
| --- | --- |
| Run or resume a saved task, ticket, or `FIXME-N` label | Prepare a `parentSkill: "fixme"` child launch with `child.handoff.mode: "existingTask"` and `child.handoff.resumeRef: "<ref>"`; launch `fixme-task` only from the returned `launch.transport` and prompt blocks |
| Preparation work for a saved task mentioned in natural language | Extract the saved task ref and dispatch the requested preparation skills with `--task <ref>` in the user's stated order |
| Run a normal one-off implementation workflow | Prepare a `parentSkill: "fixme"` child launch with `child.handoff.mode: "createOrReuse"` and a self-contained child task handoff built from the request; launch `fixme-task` only from the returned `launch.transport` and prompt blocks |
| Run a named pipeline | Same as one-off, with the selected pipeline written into `child.handoff.taskSaveData.pipelineResolution` and `parent.lookupInput.pipeline` |
| Start, resume, report, stop, or check a bug-fix session | `Skill("fixme-session", "<request>")` |
| Address PR review comments or CI review feedback comments | `Skill("fixme-pr-comments", "<flags if any>")` |
| Rebase a branch | `Skill("fixme-rebase", "<branch/base/flags if any>")` |
| Create a Linear ticket | `Skill("fixme-ticket", "<description and flags>")` |
| Explore an idea before choosing a workflow | `Skill("fixme-brainstorm", "<topic>")` |
| Configure workflows, models, review level, Linear, ticket backend, commands, or alerts | `Skill("fixme-config", "<request>")` |
| Show token or usage reports | `Skill("fixme-usage", "<scope/view args>")` |
| Verify a completed browser-facing change | `Skill("fixme-browser-verify", "<verification target>")` |

## Fixme-Task Front-Door Launch

For every route that launches `fixme-task`, use the same parent-aware handoff shape. This router is the parent, so `parent.parentSkill` is `"fixme"`.

Prepare child:
```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-stdin <<'JSON'
{"parent":{"parentSkill":"fixme","idempotencyKey":"fixme-router:<resume-ref-or-task-slug>:parent","lookupInput":{"routeRef":"create:<resume-ref-or-task-slug>","pipeline":"standard"},"payload":{"source":"router","routeRef":"create:<resume-ref-or-task-slug>","pipeline":"standard"}},"child":{"idempotencyKey":"fixme-router:<resume-ref-or-task-slug>:child","agentName":"fixme-task","transport":"agent","runtime":"codex","handoff":{"mode":"createOrReuse","taskSaveData":{"title":"<short saved task title>","taskGoal":"<goal>","settledSolutionShape":"<shape>","agreedApproach":"<approach>","userVisibleBehavior":"<behavior>","scope":{"inScope":["<requested behavior>"],"outOfScope":[]},"laterPlanningNotes":["<planning note>"],"pipelineResolution":{"pipeline":"standard","source":"userProseIntent","evidence":"Router selected the standard workflow from the user request.","reason":"The standard workflow is the executable workflow for this router-created child task."}},"payload":{"source":"fixme-router"}},"promptInputs":{"resumeRef":"<resume-ref-or-task-slug>","source":"fixme-router"}},"parentContinuation":{"resumeStep":"awaitFixmeTaskResult"},"await":{"fixBatches":[{"id":"batch-0","summary":"router task"}],"activeBatchIndex":0,"ledger":{}},"recoverStaleParent":true}
JSON
```

Do not run `--help` to discover the payload for this path. Use `parent.lookupInput.routeRef` for router launches and use the returned `launch.promptBlocks` verbatim.

Saved task, ticket, or `FIXME-N` resume:

```json
{
  "parent": {
    "parentSkill": "fixme",
    "idempotencyKey": "<stable-router-parent-key>",
    "lookupInput": {
      "routeRef": "resume:<ref>",
      "pipeline": "<pipeline-or-auto>"
    },
    "payload": {
      "routeRef": "resume:<ref>",
      "pipeline": "<pipeline-or-auto>"
    }
  },
  "child": {
    "idempotencyKey": "<stable-router-child-key>",
    "agentName": "fixme-task",
    "runtime": "<claude|codex>",
    "transport": "agent",
    "parentInvocationId": "<usage invocation id if available>",
    "pipelineRunId": "<pipeline run id if available>",
    "handoff": {
      "mode": "existingTask",
      "resumeRef": "<ref>"
    },
    "promptInputs": {
      "summary": "Resume <ref>",
      "source": "fixme",
      "route": "savedTask",
      "resumeRef": "<ref>"
    }
  },
  "parentContinuation": {
    "resumeStep": "awaitFixmeTaskResult"
  },
  "await": {
    "fixBatches": [{ "id": "batch-0", "summary": "Resume <ref>" }],
    "activeBatchIndex": 0,
    "ledger": {}
  },
  "recoverStaleParent": true
}
```

Parent-driven `fixme-task` launches use `agent` by default. Use `background` only for fire-and-forget parent workflows such as `fixme-session`. Never use `inline-skill` or `direct` for a `fixme-task` child launch.

The `resumeRef` value may be a `FIXME-N` label, standalone task markdown/state path, ticket markdown/folder path, or reserved task-state path. `lifecycle parent prepare-child` resolves it through `task resolve` and returns `launch.promptBlocks.taskInput.resolvedMode` plus the correct nullable path set; the router must not infer task/ticket/reserved shape itself.

One-off and named workflow routes use the same shape, except `child.handoff.mode` is `"createOrReuse"` and `child.handoff.taskSaveData` is a self-contained saved-task handoff built from the user's request. The named workflow route writes the selected workflow into `child.handoff.taskSaveData.pipelineResolution`; do not pass workflow names only as prose.

After `lifecycle parent prepare-child` returns, render and launch exactly these returned blocks, in this order:

```text
<launch.promptBlocks.taskStateOwner>
<launch.promptBlocks.parentContinuation>
<launch.promptBlocks.activeChild>
<launch.promptBlocks.project>
<launch.promptBlocks.liveness>
<launch.promptBlocks.taskInput>
<launch.usageContext>
```

Do not reconstruct the liveness id, parent continuation, active child handle, task state path, or prompt blocks by hand. The returned `launch.promptBlocks.liveness.statusId` is the fixme-task run id that durable attention uses.

## Parsing Rules

1. Extract every `FIXME-N` label in the order the user wrote it.
2. Extract one explicit pipeline if present. Accept `standard`, `bugfix`, `full`, `product-spec`, `technical-spec`, `plan-only`, and `execute-only`.
3. If the user says `both`, `all`, or otherwise applies one pipeline to multiple labels, pass that same pipeline to each routed invocation.
4. If the user says `followed by`, `then`, `after that`, or gives an ordered list, preserve that order.
5. If no pipeline is supplied for a `FIXME-N` label, route with `--resume <ref>` only and let `fixme-task` resolve the saved pipeline or default.
6. If the request includes non-Fixme work plus a Fixme route, route the Fixme work first only when the user made sequencing explicit. Otherwise ask which should happen first.

### Saved Task Preparation Parsing

Preparation work for a saved task mentioned in natural language must attach its artifacts to that saved task, even when the user did not pass explicit `--task` flags.

Use this rule when the prompt includes:

- A saved task ref, usually a `FIXME-N` label. If the prompt also names a Linear ticket such as `ALP-304 / FIXME-13`, extract the saved task ref from any `FIXME-N` label in the prompt and use it as `<ref>`.
- A preparation intent such as "prepare for execution", "preparing for implementation", "check if you can find issues", "validate the approach against hard evidence", "make sure everything is implementable", "do Fixme Research", or "do Fixme Brainstorm".
- One or more preparation skills in prose, especially ordered phrases such as "Fixme Research followed by Fixme Brainstorm".

Routing:

```text
Fixme Research followed by Fixme Brainstorm for FIXME-13
Route:
Skill("fixme-research", "--task <ref> <specific research request from prompt>")
wait for completion
Skill("fixme-brainstorm", "--task <ref> <specific brainstorm request from prompt>")
```

If the user gives non-Fixme prerequisites before the preparation sequence, such as "switch to master and refresh it first", perform those prerequisites first when they are safe and explicit. Then route the preparation skills in the stated order. Do not start `fixme-task --resume <ref>` unless the user explicitly asks to execute or resume the saved task after preparation.

## Canonical Examples

Bare sequential labels with one shared pipeline:

```text
User: FIXME-9 followed by FIXME-10, both standard pipeline
Route:
Prepare a `parentSkill: "fixme"` existingTask handoff for `FIXME-9` with `parent.lookupInput.pipeline: "standard"`
Launch `fixme-task` from the returned `launch.transport` and prompt blocks
wait for completion
Prepare a `parentSkill: "fixme"` existingTask handoff for `FIXME-10` with `parent.lookupInput.pipeline: "standard"`
Launch `fixme-task` from the returned `launch.transport` and prompt blocks
```

Single saved task or ticket:

```text
User: resume FIXME-12
Route:
Prepare a `parentSkill: "fixme"` existingTask handoff with `child.handoff.resumeRef: "FIXME-12"`
Launch `fixme-task` from the returned `launch.transport` and prompt blocks
```

Named pipeline:

```text
User: run bugfix pipeline for the Safari checkout failure
Route:
Prepare a `parentSkill: "fixme"` createOrReuse handoff with bugfix pipelineResolution in `child.handoff.taskSaveData`
Launch `fixme-task` from the returned `launch.transport` and prompt blocks
```

Session request:

```text
User: start a Fixme session and queue this bug
Route:
Skill("fixme-session", "report <bug description>")
```

PR comments:

```text
User: address PR comments without pushing
Route:
Skill("fixme-pr-comments", "--skip-push")
```

Rebase:

```text
User: rebase this branch onto develop
Route:
Skill("fixme-rebase", "--base develop")
```

Ticket creation:

```text
User: create a Linear ticket for the mobile login bug
Route:
Skill("fixme-ticket", "mobile login bug")
```

Ambiguous idea:

```text
User: I have an idea for improving imports but I am not sure how to scope it
Route:
Skill("fixme-brainstorm", "improving imports")
```

## Output Style

Keep the user-facing explanation short:

```text
Using `fixme` to route this to `<target-skill>`.
```

When the route is obvious, do not present a menu. Invoke the target skill immediately. Use a menu only when the user is actually choosing between different side effects, such as creating a ticket versus running an implementation workflow.
