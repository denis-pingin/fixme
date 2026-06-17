# Fixme Orchestration Simplification Spec

This document specifies the desired final state for simpler Fixme orchestration.

It is not an implementation plan. It does not define phases, sequencing, or a partial rollout. It defines the workflow contract we want, verifies that contract against the current repo, and names final states that would degrade existing use cases.

## Goal

Fixme agents should spend their attention on workflow decisions and task work, not on repeated manual ceremonies for usage tracking, liveness, durable attention, alerting, child dispatch, parent continuation, and decision persistence.

The final design keeps the current reliability guarantees while moving orchestration mechanics into `fixme-tools.cjs` runtime helpers and durable state.

Behavior changes are allowed when they simplify the system and preserve the real use cases.

## Preserved Use Cases

| Use case | Final state requirement |
| --- | --- |
| Standalone `fixme-task` | A user can run a task, answer decisions, get workflow and review-loop guarantees, and receive a final summary. |
| Resume saved task | A saved task can resume after compaction, interruption, or a new conversation without relying on model memory. |
| PR-comments | PR-comments fetches all review surfaces, classifies every item by source, verdict, and author type, fixes valid current PR issues through `fixme-task`, verifies, commits when configured, replies, resolves allowed threads, and summarizes. |
| PR-comments inline task transport | PR-comments can invoke `fixme-task` inline when a runtime needs `fixme-task` to remain capable of dispatching its own sub-agents. |
| Background session | `fixme-session` stays responsive, reports active task status, brokers user attention, and resumes the background task using recorded answers. |
| Ticket-backed sessions | Session scheduling, ticket creation/listing/next selection, ticket phase transitions, and terminal ticket cleanup keep working through every backend the final product advertises as implemented. |
| Configured workflows | Standard and custom workflows, disabled phases, review levels, review cycles, outer loop limits, and project settings remain authoritative. |
| Standalone workflow skills | Directly invoked Fixme skills keep their standalone behavior, including brainstorm, investigation, research, browser verification, ticket, config, rebase, usage, PR-comments, and direct spec/plan writing or review where applicable. |
| Child user input | Child skills under `fixme-task` never wait directly. Their prompts become task-owned durable attention. |
| Review loops | Review handlers remain authoritative for routing. Blocking fixes, unclear findings, and user questions cannot be skipped accidentally. |
| Usage reports | Users can inspect project, global, per-skill, per-pipeline, orchestrator-overhead, child-subtotal, and unmeasured-row data. |
| Liveness | Parents can tell which agent is active, whether it is running or waiting, what command or prompt is active, and when status last changed. |
| Alerts | User-facing pause, success, and failure gates still emit one non-blocking alert at the same semantic points. |
| Decisions | Locked decisions remain available to spec writers, plan writers, reviewers, handlers, and later workflow steps. |
| Root resolution | Every workflow resolves the actual `<fixme-dir>` through the runtime and does not fragment state in multi-root workspaces. |
| Runtime visibility | Agent dispatch still resolves runtime/model/reasoning settings through the CLI and exposes a user-visible dispatch banner. |

## Final Architecture

### Runtime-Owned Orchestration Mechanics

Skill instructions should describe intent. Lifecycle helpers should perform the repeated aggregate mechanics.

Final orchestration command surface:

```bash
fixme-tools lifecycle invocation start
fixme-tools lifecycle invocation finish
fixme-tools lifecycle dispatch prepare
fixme-tools lifecycle dispatch complete
fixme-tools lifecycle attention open
fixme-tools lifecycle attention broker show
fixme-tools lifecycle attention broker answer
fixme-tools lifecycle attention broker resume
fixme-tools lifecycle attention broker acknowledge-resume
fixme-tools lifecycle wait begin
fixme-tools lifecycle wait end
fixme-tools task decision append
fixme-tools task decision list
fixme-tools lifecycle task-event record
fixme-tools lifecycle task-event consume
fixme-tools lifecycle parent create
fixme-tools lifecycle parent checkpoint
fixme-tools lifecycle parent resolve
fixme-tools root
fixme-tools pipeline resolve
fixme-tools config review-level resolve
fixme-tools alert <event>
```

`lifecycle` is the aggregate orchestration namespace. It batches or wraps multiple lower-level primitives for normal workflow use. `run` remains the low-level liveness, status, and attention primitive namespace.

The current low-level primitives can remain for debugging and compatibility, but ordinary skill instructions may call a helper only when that helper exists in `fixme-tools.cjs` and in the installed Claude and Codex skill copies. Skill docs must not reference a helper command name that the CLI does not support.

Helpers return all state the agent must carry forward instead of requiring the agent to reconstruct it from previous prose. Lifecycle dispatch helpers return resolved runtime settings, a user-visible banner string, child liveness ids, usage context fields, the resolved `<fixme-dir>`, and the prompt blocks that must be passed to children.

Existing primitives listed in the command surface keep their current stdout schemas unless this spec explicitly defines a compatibility wrapper. In particular, `root` continues to return top-level `fixmeRoot` and `fixmeDir`; `pipeline resolve` continues to return the current pipeline-resolution object; `config review-level resolve` continues to return the current review-level object; and `alert <event>` preserves the current alert command behavior. The new `ok`/`error` envelope below applies only to new `lifecycle *` helpers and `task decision *`.

The desired helpers are grounded in current primitives:

| Desired helper | Current backing primitive or required runtime addition |
| --- | --- |
| `lifecycle invocation start` / `lifecycle invocation finish` | Wraps `usage start` / `usage finish`; may also create self-owned liveness for direct `fixme-task`. |
| `lifecycle dispatch prepare` / `lifecycle dispatch complete` | Wraps `resolve-model`, `run start`, parent `run ping`, usage context propagation, and dispatch banner construction. |
| `lifecycle attention open` | Combines `task checkpoint` and `run attention set` with checkpoint-first ordering and repair on failure. |
| `lifecycle attention broker show` / `lifecycle attention broker answer` | Wraps `run attention show` / `run attention answer` and preserves stale/answered attention behavior. |
| `lifecycle attention broker resume` | Wraps parent-state active-child validation, `lifecycle attention broker answer`, parent checkpoint to `brokerChildAttention`, and minimal existing-task resume launch construction. |
| `lifecycle attention broker acknowledge-resume` | Records post-launch `activeChild.resumeDispatch` evidence and checkpoints `brokerChildAttention -> awaitFixmeTask` after the parent launches the returned resume message. |
| `lifecycle wait begin` / `lifecycle wait end` | Wraps guarded `run ping` around commands the agent still executes normally. |
| `task decision append` / `task decision list` | New structured task-decision API with markdown compatibility output. |
| `lifecycle task-event record` / `lifecycle task-event consume` | New durable task terminal event API with parent-run addressing and idempotent parent-state acknowledgement. |
| `lifecycle parent create` / `lifecycle parent checkpoint` / `lifecycle parent resolve` | New parent workflow state API for PR-comments and similar parent orchestrators. |
| `pipeline resolve` | Existing pipeline selection primitive. |
| `config review-level resolve` | Existing review-level resolver. |
| `root` | Existing `<fixme-dir>` resolver. |
| `alert <event>` | Existing alert primitive; no automatic per-invocation alert wrapper is required. |

### Lifecycle Helper Command Contracts

Every new helper is an agent-facing API. The command contract is part of the final state, not an implementation detail.

Common contract for new `lifecycle *` helpers and `task decision *`:

- Every new helper writes JSON to stdout and exits nonzero on validation, state, or IO failure.
- Every JSON object uses camelCase keys.
- Every `--data` payload rejects unknown fields.
- Every new helper that can run outside the current working directory accepts `--fixme-dir <absolute-fixme-dir>`.
- Durable writes are atomic and either fully applied or reported as failed with a recoverable state.
- Error output includes `ok: false`, `error.code`, and `error.message`; it must not require agents to parse prose.
- Error codes are stable strings. The minimum shared set is `invalidInput`, `unknownField`, `missingRequiredField`, `stateNotFound`, `staleState`, `conflictingDuplicate`, `activeAttention`, `attentionBlocked`, `unsupportedCommand`, and `ioFailure`.
- Success output includes `ok: true` plus every id, path, command string, prompt block, and status value the agent must carry forward.
- Installed Claude and Codex skill copies must not mention a helper until the source CLI and both installed runtimes support it.

Per-command output descriptions below name the fields carried by the `ok: true` success envelope. When a helper wraps an existing primitive, such as usage finish or attention show, the helper preserves the primitive's existing fields inside that success envelope; it does not return the primitive's raw schema unless the command is one of the existing primitives explicitly excluded above.

Durable helper retry contract:

- Every helper that creates or mutates durable state has either a required `idempotencyKey` input or an explicit natural key named in this section.
- Repeating the same key with identical durable inputs returns the existing durable result without creating duplicate state.
- Repeating the same key with conflicting durable inputs returns `conflictingDuplicate`.
- A helper that updates an existing durable record also validates the current record state before writing. If the current record no longer matches the expected pre-write state, it returns `staleState` unless the request is an idempotent replay of a previously applied write.
- Read-only helpers do not need idempotency keys.

`lifecycle invocation start`:

```bash
fixme-tools lifecycle invocation start --fixme-dir <fixmeDir> --data '<json>'
```

Input: `skill`, `runtime`, `role`, required `idempotencyKey`, optional `pipelineRunId`, optional `parentInvocationId`, optional `taskStatePath`, and optional `createRunStatusForAgent`. Output: `invocationId`, `pipelineRunId`, `fixmeDir`, `usageFinishCommand`, optional `statusId`, optional `statusPath`. If `createRunStatusForAgent` is present, the helper creates exactly one self-owned run status and returns it. Duplicate retry with the same `idempotencyKey` returns the existing invocation and run status.

`lifecycle invocation finish`:

```bash
fixme-tools lifecycle invocation finish --fixme-dir <fixmeDir> --invocation-id <invocationId> --outcome <complete|failed|aborted> [--reason <reason>]
```

Natural key: `invocationId`. Output is the current usage finish output, including `reportLine` when reporting is enabled. It preserves the existing usage outcome enum. It never invents a report line when usage reporting is suppressed. Repeating finish for the same `invocationId` with the same outcome and reason returns the finalized usage event. Repeating it with a different outcome or reason returns `conflictingDuplicate`.

`lifecycle dispatch prepare`:

```bash
fixme-tools lifecycle dispatch prepare --fixme-dir <fixmeDir> --data '<json>'
```

Input: required `idempotencyKey`, `agentName`, `transport`, optional `parentStatusId`, optional `parentInvocationId`, optional `pipelineRunId`, optional `taskStatePath`, optional `parentContinuation`, and `promptInputs`. Output: `dispatchId`, `fixmeDir`, `agentName`, `transport`, `statusId`, `statusPath`, `runtimeSettings`, `bannerMarkdown`, `usageContext`, and `promptBlocks`. The helper wraps model resolution, child run-status creation, parent heartbeat update, and banner construction. It does not start the child usage record; the child invocation starts usage with the returned `usageContext`. Duplicate retry with the same `idempotencyKey` returns the existing dispatch, run status, banner, usage context, and prompt blocks.

`lifecycle dispatch complete`:

```bash
fixme-tools lifecycle dispatch complete --fixme-dir <fixmeDir> --data '<json>'
```

Natural key: `dispatchId`. Input: `dispatchId`, `statusId`, `status` (`completed` or `failed`), optional `parentStatusId`, optional `currentCommand`, optional `failure`. Output: `dispatchId`, `statusId`, `status`, and the final liveness status path. The helper finalizes the child run status and, when `parentStatusId` is provided, clears the parent wait marker without overwriting active attention. Repeating the same completion returns the existing finalized dispatch. A different completion status or failure payload returns `conflictingDuplicate`.

`lifecycle attention open`:

```bash
fixme-tools lifecycle attention open --fixme-dir <fixmeDir> --data '<json>'
```

Natural key: `statusId + attention.attentionId`. Input: `statusId`, `taskStatePath`, `checkpointData`, and `attention` with the existing attention record fields. Output: `attentionId`, `statusId`, `taskStatePath`, `attentionPath`, and the final `FIXME_ATTENTION_REQUIRED` directive text. The helper applies checkpoint-first ordering. If checkpointing fails, it does not create attention. If attention creation fails after checkpointing, the helper must restore the exact pre-open task state snapshot before returning `ok: false` with `error.code: "attentionBlocked"`, `repaired: true`, the failed command, and the attention id. If that restore cannot be confirmed, it returns `ok: false` with `error.code: "ioFailure"`, `repaired: false`, the task state path, and the attention id; the caller must stop and mark the owning task failed or blocked rather than continuing from the waiting checkpoint. It never emits an attention-required directive for a prompt that cannot be shown. Repeating an identical open request for an already-open attention returns the existing attention directive; conflicting prompt, state path, or checkpoint data returns `conflictingDuplicate`.

`lifecycle attention broker show`:

```bash
fixme-tools lifecycle attention broker show --fixme-dir <fixmeDir> --status-id <statusId> --attention-id <attentionId>
```

Output is the current attention prompt record plus display metadata. It preserves stale, missing, and already-answered attention errors from `run attention show`.

`lifecycle attention broker answer`:

```bash
fixme-tools lifecycle attention broker answer --fixme-dir <fixmeDir> --status-id <statusId> --attention-id <attentionId> --data '<json>'
```

Natural key: `statusId + attentionId`. Input: `answer`, `answeredBy: "user"`, and `answerKind` (`decision` or `clarificationRequest`). Output is the answered attention record. The broker records the answer only; it does not interpret the answer, write decisions, or clear task state. Repeating the same answer returns the existing answered record. Repeating with a different answer or answer kind returns `conflictingDuplicate`.

`lifecycle attention broker resume`:

```bash
fixme-tools lifecycle attention broker resume --fixme-dir <fixmeDir> --parent-run-id <parentRunId> --status-id <statusId> --attention-id <attentionId> --data '<json>'
```

Natural key: `parentRunId + statusId + attentionId + answer`. Input: raw answer fields (`answer`, `answeredBy: "user"`, `answerKind`) plus flags identifying the parent run and child attention. Output: a `resume` object whose message is exactly `--resume <activeChild.resumeRef> --answer-attention <attentionId>` plus the existing child liveness context. The helper validates `activeChild`, records or reuses the raw answer, and never returns original task prose or task-owned decision state.

`lifecycle attention broker acknowledge-resume`:

```bash
fixme-tools lifecycle attention broker acknowledge-resume --fixme-dir <fixmeDir> --parent-run-id <parentRunId> --status-id <statusId> --attention-id <attentionId> --data '<json>'
```

Natural key: `parentRunId + statusId + attentionId + resumeMessage`. Input: `{ "resumeMessage": "--resume <ref> --answer-attention <attentionId>", "transport": "<agent|inline-skill|background|direct>", "runtime": "<claude|codex>", "runtimeHandle": <optional handle> }`. Output: parent status/cursor plus the stored `resumeDispatch`. The helper is called only after the parent launches the returned resume message. It validates the active child, rejects mismatched launch evidence, records `activeChild.resumeDispatch`, and checkpoints the parent from `brokerChildAttention` / `waitingForUser` back to `awaitFixmeTask` / `waitingForChild`.

`lifecycle wait begin` and `lifecycle wait end`:

```bash
fixme-tools lifecycle wait begin --fixme-dir <fixmeDir> --status-id <statusId> --label "<command label>"
fixme-tools lifecycle wait end --fixme-dir <fixmeDir> --status-id <statusId>
```

Natural key: `statusId`. Output is the updated liveness status. These helpers only update liveness around a command the agent runs normally. They do not execute the command and cannot alter stdout, stderr, exit status, shell behavior, environment, quoting, redirection, pipelines, or PTY behavior. `wait begin` sets `state: "running"`, `checkpoint: "working"`, and `currentCommand` to the provided label. Repeating `wait begin` with the same label keeps the same command marker and updates `updatedAt`; `wait begin` with a different label while another non-attention command marker is active returns `staleState`. `wait end` clears that command marker and returns `state: "running"`, `checkpoint: "working"`, and `currentCommand: null`; repeating `wait end` after the command marker is already cleared returns the current non-waiting status. They reject attempts to overwrite or clear an active `attention:<attentionId>` marker.

`task decision append`:

```bash
fixme-tools task decision append --state <taskStatePath> --data '<json>'
```

Natural key: `taskStatePath + decision.id`. Input is one completed decision record with `id`, `attentionId`, `sourceSkill`, `prompt`, `answer`, `interpretation`, `status`, `supersedesDecisionIds`, optional `supersedesProjectDecisionRefs`, `supersededByDecisionId`, and `createdAt`. New appended decision records must have `status: "active"` and `supersededByDecisionId: null`; the runtime, not the caller, changes older referenced task-owned decisions to `status: "superseded"`. The helper rejects missing fields, unknown fields, invalid status values, attempts to append a directly superseded new record, references to missing task-owned decisions, attempts to supersede already-superseded task-owned decisions, malformed project decision references, and project decision references that do not exist in the current project-level decision log. To replace a superseding decision, append a new active decision that supersedes the active replacement. Repeating the same decision id with identical data returns the existing decision and active list. Repeating it with different data returns `conflictingDuplicate`. Output includes the appended decision, active decision list, project-level decision markdown, and merged markdown compatibility text.

`task decision list`:

```bash
fixme-tools task decision list --state <taskStatePath> [--include-superseded] [--task-owned-only] [--format json|markdown]
```

Default JSON output contains a task-bound decision context, not just the task-owned store. It includes `taskDecisions`, `taskDecisionMarkdown`, `projectDecisionMarkdown`, and `mergedMarkdown`. `projectDecisionMarkdown` is read from `<fixme-dir>/decisions.md` when present. `mergedMarkdown` is the compatibility view for current task-bound readers. `--include-superseded` includes task-owned audit records. `--task-owned-only` is an explicit audit/debug option and must not be used by task-bound spec, plan, review, or handler readers. `--format markdown` still returns JSON under the common helper contract, with the compatibility text in a `markdown` field equal to `mergedMarkdown`. That markdown is equivalent to the current decision log reader surface plus the current task-owned decisions.

`lifecycle task-event record`:

```bash
fixme-tools lifecycle task-event record --fixme-dir <fixmeDir> --data '<json>'
```

Input: `parentRunId`, `taskRunId`, `taskStatePath`, `resultSummaryPath`, `terminalResultId`, and `status` (`completed` or `failed`). Output: the durable event record. The idempotency key is `parentRunId + terminalResultId`; duplicate matching records return the existing event, and conflicting duplicate records are rejected.

`lifecycle task-event consume`:

```bash
fixme-tools lifecycle task-event consume --fixme-dir <fixmeDir> --parent-run-id <parentRunId> [--event-id <eventId>|--next]
```

Natural key: explicit consumption uses `parentRunId + eventId`; `--next` uses `parentRunId + activeChild.taskRunId + activeChild.taskStatePath`. Output is either `event` or `noPendingEvent`. If the parent already recorded the event in parent state, the helper returns that same event idempotently and completes any missing consumed marker. For both explicit `--event-id` and `--next`, the helper resolves parent state and reads the active child from the parent cursor payload before consuming a new event. It may consume only an unacknowledged event whose `parentRunId`, `taskRunId`, and `taskStatePath` match that active child; if the active child already has `terminalResultId`, the event must match that too. If explicit `--event-id` names an event for a different child, return `staleState`. If no active child exists, return `stateNotFound`. If no matching unacknowledged event exists, return `noPendingEvent`. If multiple matching unacknowledged events exist, return `conflictingDuplicate`.

`lifecycle parent create`, `lifecycle parent checkpoint`, and `lifecycle parent resolve`:

```bash
fixme-tools lifecycle parent create --fixme-dir <fixmeDir> --data '<json>'
fixme-tools lifecycle parent checkpoint --fixme-dir <fixmeDir> --parent-run-id <parentRunId> --data '<json>'
fixme-tools lifecycle parent resolve --fixme-dir <fixmeDir> [--parent-run-id <parentRunId>|--data '<json>']
```

Parent input and state use a real schema with `schemaVersion`, `parentRunId`, `parentSkill`, `normalizedLookupInput`, `parentNaturalKey`, `lookupKeys`, `createInputDigest`, `status`, `cursor`, `revision`, `payload`, `ledger`, `createdAt`, and `updatedAt`. `parent create` requires `parentSkill`, `idempotencyKey`, `lookupInput`, `status`, `cursor`, and `payload`; it initializes `ledger` to an empty object. The runtime, not the caller, normalizes `lookupInput`, stores the normalized result as immutable `normalizedLookupInput`, computes `parentNaturalKey`, computes every `lookupKeys` entry, and records `createInputDigest` over the immutable normalized create fields. Duplicate create with the same idempotency key returns the same `parentRunId`. Duplicate create with the same exact natural key and a different idempotency key returns the existing nonterminal parent run when `createInputDigest` matches the original create request, and returns `conflictingDuplicate` when it differs. If only terminal runs exist for that natural key, a new create request with a new idempotency key creates a new parent run instead of reviving completed state. `parent checkpoint` requires `parentRunId`, `idempotencyKey`, `expectedRevision`, `status`, `cursor`, `payload`, and `ledger`; `failure` is required when `status` is `failed` and forbidden otherwise. Checkpoint is a full replacement for mutable parent fields and preserves immutable schema, normalized lookup input, lookup keys, natural key, and create-digest fields. Duplicate checkpoint with the same key returns the already-written revision, while a new checkpoint with a stale `expectedRevision` returns `staleState`. `parent resolve` with `--parent-run-id` returns that exact run, terminal or nonterminal. `parent resolve --data` requires `parentSkill` and lookup input; for `parentSkill: "fixme-pr-comments"`, exact lookup uses PR identity plus `normalizedFlags`, and broad lookup uses only PR identity. Exact and broad lookup return only nonterminal runs, return `stateNotFound` when no nonterminal run exists, and return `conflictingDuplicate` with matching parent run ids when multiple nonterminal runs match. The API rejects unsupported fields, unknown parent skills, invalid cursor values, invalid lookup shapes, ledger regressions that drop durable evidence required by the current or any later enabled cursor, and writes that would erase acknowledged task events. It stores only parent-owned orchestration state and does not expose task-owned plans, specs, decisions, tickets, config, or task internals.

### Task Workflow State

`fixme-task` is the only owner of task workflow state.

Task state contains:

- workflow cursor
- workflow phase and review-loop counters
- current artifacts
- pending task-owned attention
- structured task decisions
- initial request and parent dispatch payload snapshot
- child dispatch routing context
- terminal task result
- optional parent continuation pointer

Parent workflows do not inspect task internals. They start or resume `fixme-task`, broker attention when they are user-facing, and react to terminal task events.

All correctness-critical task-to-parent state transfer is disk-backed. Text output can wake the current conversation, but it is never the state channel and never the only way a parent learns what happened.

Parent-to-task transfer is also captured durably. When a parent dispatches `fixme-task`, the routed task input, continuation pointer, and resume reference are persisted in task state before the task advances to child dispatch. A parent must not depend on the original dispatch prompt remaining in conversation history after interruption.

Ticket state remains separate from task state. Ticket state is the high-level scheduler and user-visible phase state. Task state is the exact resumable cursor for one `fixme-task` run.

### Configuration And Workflow Resolution

Workflow configuration remains authoritative.

The final design preserves:

- built-in standard workflows
- custom workflows from config
- disabled phase filtering
- per-workflow and per-phase review levels
- review-cycle limits
- outer workflow-cycle limits
- project command and project metadata loading
- explicit rejection of obsolete config keys instead of silent migration

Lifecycle helpers can simplify how agents resolve this data, but they do not flatten workflow behavior into a hardcoded sequence.

### Parent Workflow State

Parent workflows that do work around a child `fixme-task` have their own durable parent run state.

For PR-comments, parent run state contains:

- parsed flags such as `--pause`, `--skip-commit`, `--skip-push`, `--skip-resolve`, and `--skip-response`
- current parent workflow step
- fetched review item records with source ids, thread ids, comment ids, author type, and parser hint
- analysis and accounting ledger
- consultation results
- routed current-fix, follow-up-only, and info groups
- fix batches derived from implementation dependency clusters
- active fix-batch index
- active child `fixme-task` status id, task run id, task state path, and resume reference
- child task result summary paths by fix batch
- verification results
- commit result, including skipped or no-change evidence and commit sha when applicable
- push result when applicable
- reply execution table state
- unresolved accounting, including allowed unresolved items for successful summaries and failure-blocked unresolved items for failed summaries

TodoWrite can remain a user-facing progress display, but it is not the correctness mechanism for parent continuation.

For parent workflows that currently prohibit direct `<fixme-dir>` access, the parent-state API is an explicit runtime-state carve-out. It stores only parent-owned orchestration state. It must not let the parent read, write, list, or infer task-owned pipeline state such as decisions, plans, specs, tickets, config, or task internals.

For `fixme-session`, the existing session and ticket state are also parent workflow state. The final design can add helper APIs around them, but it must preserve the active task pointer, active run status id, one-background-task concurrency guarantee, and terminal cleanup responsibilities.

Parent run state is a real runtime schema, not freeform notes. It uses camelCase JSON, has `schemaVersion`, stable `parentRunId`, `parentSkill`, immutable `normalizedLookupInput`, status, cursor, revision, cursor-local payload, durable ledger, updated time, and atomic checkpoint semantics. It rejects unsupported fields that would make resume ambiguous.

For PR-comments parent lookup, `lookupInput.pullRequestRef` is a camelCase object with required PR identity fields `host`, `owner`, `repo`, and `number`, plus optional push-target snapshot fields `headOwner`, `headRepo`, and `headRef`. `host`, `owner`, `repo`, `headOwner`, and `headRepo` are normalized to lowercase for lookup and remote matching. `number` is a positive integer. `headRef` is stored case-preserving, must be a non-empty branch name rather than a full ref, and must pass `git check-ref-format --branch` before it can be used for push. Strings with surrounding whitespace, empty strings, null required fields, unknown fields, and malformed branch refs are rejected. `normalizedFlags` is a camelCase object with boolean `pause`, `skipCommit`, `skipPush`, `skipResolve`, and `skipResponse`; `skipCommit: true` canonicalizes `skipPush` to `true`. The exact parent natural key is a stable hash over canonical JSON containing `parentSkill`, normalized PR identity fields, and `normalizedFlags`. The broad lookup key is a stable hash over canonical JSON containing `parentSkill` and normalized PR identity fields. Push-target snapshot fields are stored in immutable `normalizedLookupInput.pullRequestRef` and may be copied into parent payload for commit and push convenience, but they are not part of parent-run rediscovery identity.

For `parentSkill: "fixme-pr-comments"`, `status` is exactly one of:

- `running`: parent workflow is executing the current cursor.
- `waitingForUser`: parent workflow is at a user-facing consultation or child-attention broker prompt.
- `waitingForChild`: parent workflow is waiting for an active child `fixme-task`.
- `completed`: parent workflow has finished every enabled reply, resolution, alert, and summary step required by the parsed flags.
- `failed`: parent workflow cannot continue and has recorded a failure summary.

For `parentSkill: "fixme-pr-comments"`, `cursor` is exactly one of:

| Cursor | Required payload | Allowed next cursors |
| --- | --- | --- |
| `fetchReviewItems` | `flags`, `pullRequestRef` | `analyzeReviewItems`, `summarize` |
| `analyzeReviewItems` | `flags`, `reviewItems` | `consultUser`, `presentAnalysis` |
| `consultUser` | `reviewItems`, `analysis`, `pendingConsultation` | `presentAnalysis` |
| `presentAnalysis` | `reviewItems`, `analysis`, `routedGroups`, `flags` | `confirmExecution`, `dispatchFixmeTask`, `replyComments`, `summarize` |
| `confirmExecution` | `analysis`, `routedGroups`, `flags`, `pendingConfirmation` | `presentAnalysis`, `dispatchFixmeTask`, `summarize` |
| `dispatchFixmeTask` | `fixBatches`, `activeBatchIndex`, `parentContinuation` | `awaitFixmeTask` |
| `awaitFixmeTask` | `fixBatches`, `activeBatchIndex`, `activeChild.statusId`, `activeChild.taskRunId`, `activeChild.taskStatePath`, `activeChild.resumeRef` | `brokerChildAttention`, `consumeTaskEvent` |
| `brokerChildAttention` | `fixBatches`, `activeBatchIndex`, `activeChild.statusId`, `activeChild.attentionId`, `activeChild.resumeRef` | `awaitFixmeTask` |
| `consumeTaskEvent` | `fixBatches`, `activeBatchIndex`, `activeChild.taskRunId`, `taskEvent.eventId`, `taskEvent.resultSummaryPath` | `dispatchFixmeTask`, `verify`, `summarize` |
| `verify` | `childResultSummaryPaths`, `routedGroups`, `flags` | `commit`, `replyComments`, `summarize` |
| `commit` | `verificationResults`, `changedFiles`, `expectedHeadSha`, `changedFilesDigest`, `flags` | `push`, `replyComments`, `summarize` |
| `push` | `commitSha`, `pushRemote`, `pushRef`, `pushTarget`, `flags` | `replyComments`, `summarize` |
| `replyComments` | `analysis`, `routedGroups`, `replyExecutionTable`, `flags` | `resolveThreads`, `summarize` |
| `resolveThreads` | `replyExecutionTable`, `allowedUnresolvedSet`, `flags` | `summarize` |
| `summarize` | none; reads required ledger slots plus optional `failure` | terminal `completed` or `failed` |

The cursor table names cursor-local required payload fields. Durable cross-step evidence lives in parent `ledger`, not in optional payload carry-forward. Defined ledger slots are `reviewItems`, `analysis`, `routedGroups`, `childResultSummaryPaths`, `verificationResults`, `commitResult`, `pushResult`, `replyExecutionTable`, and `unresolvedAccounting`. A cursor transition writes the ledger slot it produces before or atomically with advancing past that cursor. Later cursors read prior evidence from `ledger`; they do not depend on earlier cursor payloads still containing that data. Checkpoint validation rejects clearing a populated ledger slot once the current cursor or any later enabled cursor can depend on it.

`ledger.unresolvedAccounting` is a parent-owned object with `fetchComplete`, `allowedUnresolvedSet`, `failedUnresolvedSet`, and optional `failureIncomplete`. `fetchComplete` is `true` only after all three GitHub review surfaces have completed mandatory pagination. `allowedUnresolvedSet` contains items intentionally left unresolved by allowed workflow rules or flags. Each allowed entry has source item id, optional thread id, author type when known, `allowed: true`, and reason exactly one of `skipResolve`, `skipResponse`, `humanReviewerFinalSay`, `needsClarification`, or `requiresInvestigation`. `failedUnresolvedSet` contains fetched items left unresolved because the parent run failed. When a fetch fails before all pages are loaded, `fetchComplete` is `false`, `failureIncomplete` is an object with `surface`, optional `cursor`, and non-empty `message`, and `failedUnresolvedSet` includes every unresolved item fetched before the failure. Completed summaries require `fetchComplete: true` and an allowed-unresolved accounting entry for every fetched item or thread that remains unresolved.

For PR-comments parent state, `failure` is required whenever `status: "failed"` or terminal `summarize` writes a failed summary. Shape: `reason`, `message`, and optional `details`. `message` is a non-empty user-readable string. `details` is a camelCase JSON object.

Parent failure reasons and usage mapping:

| Parent failure reason | Usage outcome | Usage reason |
| --- | --- | --- |
| `userAborted` | `aborted` | `user_aborted` |
| `fetchFailed` | `failed` | `runtime_error` |
| `analysisFailed` | `failed` | `runtime_error` |
| `taskDispatchFailed` | `failed` | `dispatch_failed` |
| `childFailed` | `failed` | `runtime_error` |
| `verificationFailed` | `failed` | `verification_failed` |
| `commitFailed` | `failed` | `runtime_error` |
| `pushFailed` | `failed` | `runtime_error` |
| `replyFailed` | `failed` | `runtime_error` |
| `resolveFailed` | `failed` | `runtime_error` |
| `usageTrackingFailed` | `failed` | `usage_tracking_failed` |
| `toolUnavailable` | `failed` | `runtime_error` |
| `runtimeError` | `failed` | `runtime_error` |
| `unknown` | `failed` | `unknown` |

PR-comments cursor rules:

- `fetchReviewItems` with no fetched review items may advance directly to `summarize` with `status: "completed"` only after all three surfaces completed pagination and after checkpointing empty `ledger.analysis`, `ledger.routedGroups`, and `ledger.unresolvedAccounting` with `fetchComplete: true`.
- `fetchReviewItems` failure advances to `summarize` with parent `status: "failed"` and `failure.reason: "fetchFailed"` after recording incomplete fetch details and every fetched unresolved item into `ledger.unresolvedAccounting.failedUnresolvedSet`.
- `analyzeReviewItems` failure advances to `summarize` with parent `status: "failed"` and `failure.reason: "analysisFailed"` after recording every fetched unresolved item into `ledger.unresolvedAccounting.failedUnresolvedSet`.
- `consultUser` user cancellation advances to `summarize` with parent `status: "failed"` and `failure.reason: "userAborted"`. `consultUser` runtime failure advances to `summarize` with parent `status: "failed"` and `failure.reason: "analysisFailed"`.
- `presentAnalysis` advances to `confirmExecution` when `--pause` is true and `routedGroups.currentFix` is non-empty. It advances to `dispatchFixmeTask` when `--pause` is false and `routedGroups.currentFix` is non-empty. If no current fixes remain and `--skip-resolve` is false, it advances to `replyComments`. If no current fixes remain and `--skip-resolve` is true, it advances to `summarize`.
- `confirmExecution` uses `status: "waitingForUser"`. User approval advances to `dispatchFixmeTask`. User-requested modifications update `routedGroups` and return to `presentAnalysis`. User cancellation advances to `summarize` with parent `status: "failed"` and `failure.reason: "userAborted"`.
- Before `dispatchFixmeTask`, the parent builds `fixBatches[]` by implementation dependency cluster. A single batch is preferred. Separate batches are allowed only when a high-complexity `PLAN_REQUIRED` fix touches an unrelated subsystem, would block low-risk implementation-only fixes, or requires a materially different verification strategy. `activeBatchIndex` starts at `0`.
- `dispatchFixmeTask` dispatches exactly one batch: `fixBatches[activeBatchIndex]`. It stores that batch's `activeChild.statusId`, `activeChild.taskRunId`, `activeChild.taskStatePath`, and `activeChild.resumeRef` before advancing to `awaitFixmeTask`. Dispatch failure advances to `summarize` with parent `status: "failed"` and `failure.reason: "taskDispatchFailed"`.
- `awaitFixmeTask` uses `status: "waitingForChild"`. It advances to `brokerChildAttention` only when the active child has a pending attention record. After brokered attention is answered, it may wait for a task event only after the active child has a persisted `resumeDispatch` for that attention answer. It advances to `consumeTaskEvent` only after a durable task event exists for the active child selected by `activeBatchIndex`.
- `brokerChildAttention` uses `status: "waitingForUser"` while showing the child prompt. `lifecycle attention broker resume` owns recording the answer, validating the active child, checkpointing to `brokerChildAttention`, and returning the minimal existing-task resume launch shape. Parent brokers never interpret the answer, create a new task, re-pass routed PR fix text, or synthesize selected answer prose into a fresh prompt. After the parent launches the returned `resume.message`, `lifecycle attention broker acknowledge-resume` owns durable `activeChild.resumeDispatch` evidence and the `brokerChildAttention -> awaitFixmeTask` checkpoint. If the answer or acknowledgement already exists with identical evidence, retry returns the existing state. Conflicting answer or resume-dispatch evidence returns `conflictingDuplicate`.
- `consumeTaskEvent` records the child result summary path into `fixBatches[activeBatchIndex].resultSummaryPath`. If the child result has `status: "failed"`, it advances to `summarize` with parent `status: "failed"` and `failure.reason: "childFailed"`. If the child result has `status: "completed"` and more fix batches remain, it increments `activeBatchIndex` and advances back to `dispatchFixmeTask`. It advances to `verify` only after every fix batch has a completed child result.
- `verify` advances to `commit` only when verification passes, changed files exist, and `--skip-commit` is false. Before advancing, it records `expectedHeadSha` and `changedFilesDigest` for the verified worktree state. `changedFilesDigest` is a stable hash over the sorted changed file paths and their diff contents relative to `expectedHeadSha`. If verification passes but commit is skipped or no files changed, it records `ledger.commitResult.status: "skipped"` with reason `skipCommit` or `noChangedFiles`, then advances to `replyComments` when `--skip-resolve` is false and to `summarize` when `--skip-resolve` is true. If verification fails, it advances to `summarize` with parent `status: "failed"` and `failure.reason: "verificationFailed"`.
- `commit` records `ledger.commitResult.status: "committed"`, `commitSha`, committed file list, and committed tree evidence. Commit preflight requires current `HEAD` and changed files to match `expectedHeadSha` and `changedFilesDigest` unless a matching `ledger.commitResult.commitSha` is already recorded. Retrying the `commit` cursor reuses an existing recorded `commitSha` when present, never creates a second commit for the same parent run, and may mark the cursor committed without a new commit only when the current `HEAD` or recorded Git evidence proves the intended commit already exists. Commit failure records `ledger.commitResult.status: "failed"` and advances to `summarize` with parent `status: "failed"` and `failure.reason: "commitFailed"`. Commit success resolves and records `pushRemote`, `pushRef`, and credential-stripped `pushTarget` evidence before advancing to `push`, unless `--skip-push` is true. To resolve `pushRemote`, enumerate local git remotes with push URLs, normalize each push URL by accepting SSH scp syntax, `ssh://`, `https://`, and `git://` forms, strip credentials and `.git`, lowercase host/owner/repo for comparison, and match exactly `normalizedLookupInput.pullRequestRef.host`, `normalizedLookupInput.pullRequestRef.headOwner`, and `normalizedLookupInput.pullRequestRef.headRepo`. Exactly one local remote must match. `pushRef` is the full remote branch ref `refs/heads/<normalizedLookupInput.pullRequestRef.headRef>`, and `headRef` must already have passed the branch-name validation defined in PR-comments parent lookup. The parent state stores the remote name, normalized host/owner/repo, and full push ref; it never stores raw remote URLs because those URLs can contain credentials. If head push metadata is missing, the branch ref is invalid, zero remotes match, or multiple remotes match, commit success advances to failed `summarize` with `failure.reason: "pushFailed"` instead of guessing a different target. Skipped push is recorded in parent state before advancing according to the `--skip-resolve` rule.
- `commit` and `push` advance to `replyComments` only when `--skip-resolve` is false; otherwise they advance to `summarize` after recording commit or skipped-push/push evidence.
- `push` runs `git push <pushRemote> <commitSha>:<pushRef>` for the recorded commit and recorded push target. Push success records `ledger.pushResult` with remote, full branch ref, normalized credential-free target coordinates, commit sha, pushed-at time, and evidence that the recorded remote ref contains the commit. Retrying the `push` cursor reuses only the recorded `commitSha`, `pushRemote`, `pushRef`, and `pushTarget`; it never pushes the current branch, upstream branch, PR head inferred at retry time, raw remote URL text, or any different commit. If the recorded remote ref already contains the recorded commit, retry records idempotent success without another push. If the local checkout changed, the push cursor still verifies and pushes only the recorded target. If push still cannot complete, it advances to `summarize` with parent `status: "failed"` and `failure.reason: "pushFailed"`.
- Any path that advances to `summarize` because `--skip-resolve` is true must first record `ledger.unresolvedAccounting.allowedUnresolvedSet` as every fetched unresolved review item or thread that was intentionally left unresolved by the flag, with reason `skipResolve`, source item id, thread id when present, author type when known, and no GitHub reply or resolve attempt. This applies to no-current-fix, verified-no-commit, skipped-push, and pushed-success paths.
- `replyComments` is skipped entirely when `--skip-resolve` is true. When reached, it materializes the reply execution table before external GitHub calls. Each row records `pending`, `skipped`, `posted`, or `failed`, plus the source item id, target id, command type, required body prefix, commit reference text, and posted comment id or verified matching-comment evidence. Commit reference text is derived from `ledger.commitResult`: use the commit sha when committed, `commit skipped by --skip-commit` when skipped by flag, and `no code changes required` when no files changed. Reply preflight rejects addressed-fix bodies that need a commit reference but have no valid `ledger.commitResult`. With `--skip-response`, required reply rows are marked `skipped` with reason `skipResponse`. Without `--skip-response`, preflight or post failure records the row as `failed`. A row may move to `posted` only after recording durable GitHub evidence: the created comment id, or a verified existing comment id whose body matches the required prefix and source item. Retrying the `replyComments` cursor reuses the same table, never reposts rows with posted evidence, and retries only rows still `pending` or `failed` without external evidence. If a required reply row still cannot complete, the parent advances to `summarize` with `status: "failed"` and `failure.reason: "replyFailed"`. It advances to `resolveThreads` only after every required reply row is `posted` or explicitly `skipped`.
- `resolveThreads` resolves only items allowed by the PR-comments resolution matrix below. Each resolution row records `pending`, `notResolvable`, `deferred`, `resolved`, or `failed`, plus the source item id, thread id when applicable, author type, and reason. A row may move to `resolved` only after recording durable GitHub evidence that the thread id is resolved. Retrying the `resolveThreads` cursor reuses the same table, never repeats rows already `resolved`, and retries only rows still `pending` or `failed` without resolved-thread evidence. Required resolution failure advances to `summarize` with parent `status: "failed"` and `failure.reason: "resolveFailed"`. Successful resolution accounting records `ledger.unresolvedAccounting.allowedUnresolvedSet` before `summarize`.
- Every transition to failed `summarize` before successful resolution accounting must first record `ledger.unresolvedAccounting.failedUnresolvedSet` for every fetched unresolved review item or thread that remains unresolved because the parent workflow failed. Each entry includes source item id, thread id when present, author type when known, `allowed: false`, and `reason` equal to the parent `failure.reason`.
- `summarize` is the only terminal cursor. It requires `ledger.unresolvedAccounting`; fires the user-facing terminal alert exactly once; and records the final user summary.

PR-comments resolution matrix:

| Surface | Outcome | Author type | Reply behavior when `--skip-response` is false | Resolve behavior |
| --- | --- | --- | --- | --- |
| `inline_review_thread` | Implemented current fix from `FIX`, resolved `FIX_UNCLEAR`, or resolved `ASK_USER` | Any | Reply to the inline comment with fix evidence and commit reference text derived from `ledger.commitResult`. | Resolve the review thread. |
| `inline_review_thread` | `REJECT_ALREADY_FIXED` | Any | Reply to the inline comment with already-fixed evidence and commit reference text when known. | Resolve the review thread because the finding is already addressed. |
| `inline_review_thread` | `REJECT_FALSE_POSITIVE`, `REJECT_WONT_FIX`, or `FOLLOWUP_ONLY` | AI reviewer | Reply to the inline comment with the rejection or follow-up rationale. | Resolve the review thread because there is no human reviewer to defer to. |
| `inline_review_thread` | `REJECT_FALSE_POSITIVE`, `REJECT_WONT_FIX`, or `FOLLOWUP_ONLY` | Human reviewer | Reply to the inline comment with the rejection or follow-up rationale. | Do not resolve; leave the human reviewer final say. |
| `inline_review_thread` | unresolved `ASK_USER`, unable to reproduce, or requires more investigation | Any | Reply asking for clarification or stating the investigation path. | Do not resolve. |
| `issue_comment` | Any addressed, rejected, already-fixed, or follow-up outcome | Any | Post or group a PR issue comment using the parser-specific prefix and per-item outcome accounting. | No thread resolve exists; the reply comment is the resolution signal. |
| `pull_request_review` | Any addressed, rejected, already-fixed, or follow-up outcome | Any | Post or group a PR issue comment referencing the review id or reviewer and per-item outcome accounting. | No thread resolve exists; the reply comment is the resolution signal. |

`--skip-response` marks required reply rows as `skipped` with reason `skipResponse`, but does not by itself skip eligible thread resolution. `--skip-resolve` skips both reply posting and thread resolution and records the allowed-unresolved accounting described above.

### Parent Continuation

When a parent workflow dispatches `fixme-task`, the task receives a continuation pointer to the parent run state.

Example:

```json
{
  "parentContinuation": {
    "parentSkill": "fixme-pr-comments",
    "parentRunId": "parent_...",
    "transport": "inline-skill",
    "resumeStep": "verify",
    "parentStatusId": "run_..."
  }
}
```

When the task reaches a terminal state, the runtime records a task event:

```json
{
  "schemaVersion": 1,
  "eventId": "taskEvent_...",
  "parentRunId": "parent_...",
  "taskRunId": "taskRun_...",
  "taskStatePath": "...",
  "resultSummaryPath": "...",
  "status": "completed",
  "terminalResultId": "terminalResult_...",
  "createdAt": "2026-06-07T00:00:00.000Z",
  "consumedAt": null,
  "consumedBy": null
}
```

An optional text notification may include `eventId`, but it contains no required state and is not a handoff mechanism. If compaction, interruption, or retry loses that line, the parent resumes by resolving its parent run state and consuming unconsumed task events from disk.

The parent consumes the durable event through parent-state acknowledgement, reloads its own parent run state, and continues. It does not infer continuation from conversation history, stdout, chat text, or task TodoWrite state.

Task event recording is idempotent. The runtime event key is `parentRunId + terminalResultId`. Re-recording the same terminal result returns the existing event. Re-recording the same key with a conflicting `status`, `resultSummaryPath`, or `taskStatePath` is rejected.

`terminalResultId` is generated once when terminal task state is checkpointed and is stored in both task state and the result summary. It is not regenerated on retry.

Task event recording happens only after the terminal task result has been written and the task state points at it. If event recording fails, parent-visible completion has not happened; resume retries event recording before any parent can advance.

Task event consumption is crash-safe. The consume helper records the consumed event id and event payload into parent state before or atomically with marking the event consumed. If interruption happens after parent state records the event but before the consumed marker is written, retrying consumption marks the same event consumed and returns the parent state's recorded event. If interruption happens before parent state records the event, the event remains unconsumed.

Repeated consumption is deterministic. `lifecycle task-event consume` returns the parent-recorded event idempotently when the same `parentRunId` already acknowledged that event. A separate consume-next mode returns `noPendingEvent` only when no unacknowledged event exists for that parent. Re-consuming an event acknowledged by a different parent run is rejected.

Task terminal status values are exactly `completed` and `failed`. `completed` maps to run state `completed`, usage outcome `complete`, and the parent workflow's success path. `failed` maps to run state `failed`; usage finish uses `failed` or `aborted` according to the failure reason, and the parent workflow's failure path fires `task_failed`. User aborts are represented as `status: "failed"` with `failure.reason: "userAborted"` unless a future spec adds an `aborted` task status everywhere it is consumed.

Parent-context task completion is not the same as user-facing workflow completion. In parent contexts, `fixme-task` records terminal task events and exposes result paths through those events; the parent owns verification, commit, replies, resolution, terminal alerts, and final user summary.

This task terminal event is part of the desired final state. Current nested `fixme-task` does not have this explicit event contract; it relies on the inline caller preserving TodoWrite context and continuing the parent's next step.

### Task Result Surface

The task result summary is the intentionally parent-readable task output surface. It is not a license for parents to inspect arbitrary task internals.

Minimum result summary shape:

```json
{
  "schemaVersion": 1,
  "terminalResultId": "terminalResult_...",
  "taskStatePath": "...",
  "status": "completed",
  "summaryMarkdown": "...",
  "changedFiles": [],
  "artifactPaths": [],
  "failure": null,
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

When `status` is `completed`, `failure` is exactly `null`.

When `status` is `failed`, `failure` is required:

```json
{
  "reason": "workflowBlocked",
  "message": "Review loop stopped with unresolved blocking findings.",
  "details": {}
}
```

`failure.reason` is exactly one of:

| Task failure reason | Usage outcome | Usage reason |
| --- | --- | --- |
| `userAborted` | `aborted` | `user_aborted` |
| `verificationFailed` | `failed` | `verification_failed` |
| `usageTrackingFailed` | `failed` | `usage_tracking_failed` |
| `runtimeError` | `failed` | `runtime_error` |
| `dispatchFailed` | `failed` | `dispatch_failed` |
| `timeout` | `failed` | `timeout` |
| `invalidUsageRequest` | `failed` | `invalid_usage_request` |
| `attentionBlocked` | `failed` | `runtime_error` |
| `workflowBlocked` | `failed` | `unknown` |
| `childFailed` | `failed` | `runtime_error` |
| `toolUnavailable` | `failed` | `runtime_error` |
| `unknown` | `failed` | `unknown` |

`failure.message` is a non-empty user-readable string. `failure.details` is an optional camelCase JSON object for structured evidence such as failed command, child skill, attention id, or blocking review artifact path. Parent workflows preserve the full `failure` object in parent state and summaries, but usage finish receives only the mapped usage outcome and usage reason. Every parent-context failed task result fires `task_failed` at the user-facing terminal owner.

Parents may read only the result summary path exposed by the terminal task event, plus parent-owned state. They must not discover plans, specs, decisions, tickets, config, or task internals by listing or reading `<fixme-dir>` directly.

### Transport

Transport describes how a task is launched:

```text
transport=agent
transport=inline-skill
transport=background
transport=direct
```

Transport does not decide whether state exists, whether attention is durable, whether usage is recorded, or whether a parent continues.

Inline skill transport remains available for runtimes where an agent-dispatched `fixme-task` cannot dispatch its own sub-agents. The final design removes semantic behavior from `--nested`; if a compatibility flag remains, it maps to explicit transport and parent continuation metadata.

### Dispatch Contract

Lifecycle dispatch helpers preserve the existing dispatch contract.

Every agent dispatch still has:

- resolved runtime settings from `resolve-model`
- the user-visible dispatch banner
- child liveness status
- parent heartbeat updates while waiting
- the resolved project root and `<fixme-dir>`
- usage context when a pipeline run is active
- task-state-owner context when the child runs under resumable `fixme-task`
- role isolation through the agent definition, not copied SKILL.md text

Codex dispatch keeps the user-selected Codex model and passes only resolved reasoning effort when available.

### Durable Attention

Every `fixme-task` user-input pause is durable.

Final attention flow:

```text
fixme-task has a run status id
fixme-task checkpoints waiting state
runtime opens attention
direct UI or parent broker shows prompt
user answers
runtime records answer
fixme-task resumes, interprets answer, writes decision, clears attention
```

Direct user-facing runs still render the prompt naturally in the conversation, but the prompt and answer are also represented in durable task state and run attention state.

For direct user-facing runs, the task owner records the user's answer through the same attention answer path before interpreting it. Direct mode must not degrade to a plain chat prompt whose answer is unavailable after interruption.

Parent brokers render prompts and record answers only. They never interpret the answer or write task decisions.

Clarification requests and partial answers remain resumable. A clarification request records the user's question, resumes the task owner to answer it, and opens replacement attention for the unresolved decision. A partial answer records resolved parts without writing final decisions, then opens replacement attention for the remaining decision points.

### Structured Decisions

Task-owned decisions are structured records.

Example:

```json
{
  "decisions": [
    {
      "id": "decision-001",
      "attentionId": "attn_abc",
      "sourceSkill": "fixme-handle-code-review",
      "prompt": "Which behavior should win?",
      "answer": "Use the stricter validation behavior.",
      "interpretation": "Validation must reject ambiguous imports.",
      "status": "active",
      "supersedesDecisionIds": [],
      "supersedesProjectDecisionRefs": [],
      "supersededByDecisionId": null,
      "createdAt": "2026-06-07T00:00:00.000Z"
    }
  ]
}
```

Task-bound decision readers consume a merged decision context through `fixme-tools task decision list`. Existing task-bound readers that currently read markdown decision text are updated to call `fixme-tools task decision list --format markdown` for a compatibility view generated from both the structured task-decision store and project-level markdown decisions. A task-bound reader must not keep reading a stale global markdown file directly for task-owned decisions, and it must not use a task-owned-only view for normal planning, specification, review, or handler work.

There are two decision sources in the final state:

- Task-owned decisions are structured records in the task state.
- Project-level decisions from non-task flows remain markdown-primary in `<fixme-dir>/decisions.md`.

The merged task-bound decision context preserves both. Markdown decision output is a compatibility view generated from active task-owned decisions plus the current project-level decision log. It is not the primary task decision store in the final design, and it is not a second writable source of truth. Moving project-level decisions to a structured store would need its own future specification.

Project-level decisions are constraints for task-bound work unless the current task records an explicit user-approved supersession. A task-owned decision may supersede a project-level decision only by recording a stable project decision reference in `supersedesProjectDecisionRefs`; this supersession is task-local and must be rendered in the merged markdown view. If a task-owned decision appears to conflict with a project-level decision without explicit supersession, readers treat that as an unresolved decision conflict and route it to the normal user decision path instead of silently picking one source.

Structured decision records are append-only for completed decisions. Clarification turns and partial answers stay in pending attention or pending decision state until the task owner interprets them as completed decisions.

Completed task-owned decisions have explicit active/superseded semantics. `status` is exactly `active` or `superseded`. Newly appended task-owned decisions are always active; older task-owned records become superseded only as the atomic side effect of appending a later active decision with `supersedesDecisionIds`. Appending such a decision atomically marks every referenced active task-owned decision as `superseded` and writes its `supersededByDecisionId`. `task decision list` returns only active task-owned decisions by default, with an explicit option to include superseded records for audit. Markdown compatibility output preserves the same semantics by rendering supersession lines and by making the active locked decision set unambiguous to current readers.

### Usage Reporting

Usage helpers preserve the current user-facing report value.

Final usage reports still support:

- project usage
- global usage
- per-skill breakdown
- per-pipeline totals
- orchestrator overhead
- child usage subtotal
- unmeasured-row warnings

Pipeline-only accounting with approximate child attribution is not the desired final state.

Usage finish ordering remains part of the contract. If a run emits a final wake-up directive such as attention required or an optional task-event notification, any usage finish/report line must be handled before that directive so the directive remains the final parseable output. Consumers still load authoritative state from disk; they do not treat the wake-up directive as state transfer.

### Alerts

Alerts remain explicit user-facing gates, not automatic invocation hooks.

Final alert behavior:

- `user_input` fires at user-facing decision, question, or confirmation gates.
- `task_finished` fires at user-facing successful terminal workflow outcomes.
- `task_failed` fires at user-facing failed or aborted terminal workflow outcomes.
- Alerts are fire-and-forget and never block workflow progress.
- Internal child invocations do not automatically emit terminal alerts.

### Command Liveness

Long-running commands update liveness without changing command semantics.

Desired shape:

```bash
fixme-tools lifecycle wait begin --fixme-dir <fixmeDir> --status-id <statusId> --label "<command label>"
# agent runs the documented command normally
fixme-tools lifecycle wait end --fixme-dir <fixmeDir> --status-id <statusId>
```

A universal command runner is not part of the final design unless tests prove stdout, stderr, exit status, shell behavior, environment, quoting, redirection, pipelines, and PTY-sensitive commands remain equivalent.

### Fixme Directory Resolution

The runtime remains the authority for `<fixme-dir>` resolution.

Final behavior:

- standalone skills call the runtime root resolver
- orchestrators pass the resolved absolute `<fixme-dir>` to children
- children use the passed value without re-resolving
- helper commands accept explicit `fixmeDir` where cross-directory execution is possible
- no skill falls back to a literal `.fixme/` path

This preserves multi-root projects where `.fixme/` may live above the current working directory.

## Verified Current Gaps

These are the gaps between the desired final state and the current repo.

### Task State Does Not Store Parent Continuation

Current task checkpointing accepts only:

- `status`
- `cursor`
- `artifacts`
- `handoff`
- `loops`
- `pendingDecision`

The desired final state needs `parentContinuation` or an equivalent continuation field. The runtime schema must include that field for the final state to be internally consistent.

### Task State Does Not Store Structured Decisions Or Terminal Results

Current task state has no structured `decisions` store and no explicit terminal result field. Current decision persistence is markdown-based, and current nested completion relies on live inline continuation rather than a durable terminal event.

The desired final state needs schema support for structured decisions, terminal task result metadata, and any task-owned event reference needed for parent consumption.

### PR-Comments Has No Durable Parent Workflow State

PR-comments currently uses a TodoWrite manifest as its parent workflow continuation mechanism. It also prohibits direct `<fixme-dir>` access outside liveness and attention brokering.

The desired final state needs a runtime-backed parent state API so PR-comments can persist and reload its own workflow without hand-editing task-owned `.fixme` files.

### `--nested` Carries Semantics

`--nested` currently preserves parent todo entries, suppresses nested `fixme-task` run summary behavior, and keeps the parent verification step visible when child execution completes.

The desired final state removes that semantic role. Parent continuation is represented by parent run state and task terminal events, not by TodoWrite shape.

### Nested Task Has No Explicit Terminal Event

Current nested `fixme-task` has no run summary and no machine-readable completion event. It relies on the same inline context continuing the parent's next TodoWrite step after the nested substeps complete.

The desired final state needs a terminal task event and result path contract so parent continuation is durable and parseable without depending on live TodoWrite context, stdout, or chat text.

### Parent-To-Task Dispatch Payload Is Prompt-Carried Today

Current PR-comments passes routed fix groups to nested `fixme-task` as invocation text. Current `fixme-task` creates or reuses saved task state before phase dispatch, but the parent-to-task payload is not yet represented as a first-class runtime dispatch record.

The desired final state needs task initialization or lifecycle dispatch preparation to persist the dispatch payload, continuation pointer, and resume reference before child work starts, so retry and resume do not depend on the original prompt text.

### Task Decision API Does Not Exist Yet

Current `task` subcommands are `save`, `init`, `checkpoint`, `resolve`, and `attach-artifact`. There is no `task decision` command yet.

The desired final state needs the structured task-decision API implemented and tested before skill instructions can depend on it.

### Durable Attention Depends On Run Status

Current durable attention is tied to a run `statusId`.

The desired final state makes direct `fixme-task` prompts durable too, so direct runs need a self-owned run status id at task start.

### Decision Markdown Is Still A Shared Reader Surface

Several task skills read `<fixme-dir>/decisions.md` directly. Some non-task flows can also write project-level decisions.

The desired final state needs structured task decisions plus either markdown compatibility output or updated readers. Project-level decisions remain markdown-primary for non-task flows.

### Usage Reporting Has Exact Granularity Expectations

The current repo documents and tests per-skill, per-project, per-pipeline, orchestrator-overhead, child-subtotal, and unmeasured-row reporting.

The desired final state preserves that granularity.

### Alerts Are Spread Across Interactive Skills

Several interactive skills explicitly fire alerts at user pause and terminal gates. The alert runtime supports exactly `user_input`, `task_finished`, and `task_failed`.

The desired final state can simplify alert calls, but it must preserve event meaning and avoid alert spam.

### Lifecycle Helper Commands Do Not Exist Yet

Current `run` subcommands are `start`, `ping`, `status`, and `attention`. There is currently no `lifecycle` command. The desired final state adds higher-level lifecycle helper commands around the low-level primitives.

Current stable backing primitives include `root`, `pipeline resolve`, `config review-level resolve`, `resolve-model`, `usage start`, `usage finish`, `usage report`, `run start`, `run ping`, `run status`, `run attention set/show/answer/clear`, `task init`, `task checkpoint`, `task resolve`, `task attach-artifact`, and markdown ticket/session commands. The new helper surface must be implemented in terms of these primitives or explicit new state APIs. It is not enough to update skill prose.

### Dispatch Contract Is Manual

Current skill text manually requires `resolve-model`, liveness creation, parent heartbeat pings, visibility banners, usage blocks, task-state-owner blocks, and `<fixme-dir>` propagation.

The desired final state moves that repeated ceremony into lifecycle dispatch helpers without changing what is propagated.

### Ticket And Session State Are Separate From Task State

Current `fixme-task` says ticket state remains the high-level session scheduler state and task state is the exact resume cursor. `fixme-session` stores `active_task` and `activeRunStatusId` and owns terminal ticket cleanup.

The desired final state must keep those ownership boundaries.

### Fixme Directory Resolution Is A Shared Safety Rule

Current skills use `fixme-tools.cjs root` and explicitly forbid literal `.fixme/` paths because multi-root workspaces can place the actual fixme directory above the current working directory.

The desired final state must keep runtime-owned root resolution and explicit fixmeDir propagation.

### Workflow Config Controls Behavior

Current workflow behavior is driven by `.fixme/config.json`, built-in standard workflows, disabled phases, review-level resolution, and review-cycle controls.

The desired final state simplifies mechanics without flattening configured workflows.

### Active Attention Has Guard Semantics

Current `run ping` cannot overwrite an active `currentCommand: attention:<attentionId>` marker.

The desired final state keeps that guard for all liveness helpers.

### Linear Ticket Backend Is Currently A Stub

Current `fixme-tickets-linear` documents planned mappings but is not implemented.

Current config validation still accepts `fixme-tickets-linear` as a valid `ticketBackend` value.

The desired final state must not claim Linear-backed sessions as working unless the Linear backend is implemented and verified. If a backend is selectable in config, the final system must either fully support it or reject it clearly.

## Invalid Final States

These states would simplify text or commands while degrading behavior. They are not acceptable final designs.

### Semantic `--nested` Removed Without Parent State

Invalid because PR-comments can lose the continuation path to verification, commit, reply, resolve, and summary.

Valid final state: parent continuation is stored in durable parent workflow state and driven by task terminal events.

### `parentContinuation` Documented But Not Persistable

Invalid because `fixme-task` would be instructed to save a field that runtime checkpointing rejects.

Valid final state: the task-state schema accepts and validates the continuation field.

### Structured Decisions Written But Readers Still Depend On Markdown

Invalid because downstream skills can miss locked decisions.

Valid final state: task-bound readers consume the merged task-bound decision context through `task decision list` or `task decision list --format markdown`; markdown compatibility is generated from active task-owned decisions plus the current project-level decision log and is not a stale writable second source of truth.

### Direct Durable Attention Without Self-Owned Liveness

Invalid because `run attention set` requires a run status id.

Valid final state: direct `fixme-task` creates or receives a run status at task start so every user-input pause can open durable attention.

### Usage Collapsed To Pipeline Totals

Invalid because users lose per-skill attribution and current pipeline reporting detail.

Valid final state: helpers preserve current usage report granularity.

### Alerts Auto-Fired For Every Invocation

Invalid because child invocations would produce user-facing alert spam.

Valid final state: alerts fire only at the same semantic user-facing gates.

### Universal Command Runner Changes Command Semantics

Invalid because verification commands can behave differently.

Valid final state: liveness wrappers surround the documented command execution path without changing the command.

### Parent Workflows Interpret Task Decisions

Invalid because task-state decisions belong to `fixme-task`.

Valid final state: parents broker prompts and answers, while `fixme-task` interprets answers and writes task decisions.

### Transport Replaces Capability

Invalid because PR-comments still needs a way to invoke `fixme-task` so `fixme-task` can dispatch its own sub-agents in runtimes with subagent-depth limits.

Valid final state: inline transport remains available, but it is explicit launch metadata rather than a behavior bundle.

### Lifecycle Helpers Drop Dispatch Context

Invalid because children would lose runtime settings, liveness, usage attribution, task-state ownership, or `<fixme-dir>` authority.

Valid final state: lifecycle dispatch helpers preserve the full dispatch contract and return all required context explicitly.

### Model Resolution Or Visibility Banner Removed

Invalid because the user loses the current audit signal for runtime, model, reasoning effort, profile, and config source.

Valid final state: the helper resolves model settings through the runtime and returns the exact banner to print.

### Task State Replaces Ticket Or Session State

Invalid because sessions need high-level ticket scheduling, phase state, active task tracking, and terminal cleanup independent of one task cursor.

Valid final state: task state, ticket state, and parent/session state remain distinct but connected through helper APIs.

### Workflow Config Flattened Into A Fixed Sequence

Invalid because configured workflows, disabled phases, review levels, and custom skills would stop being authoritative.

Valid final state: helpers resolve configured workflow behavior and `fixme-task` executes that resolved behavior.

### Fixme Directory Resolution Falls Back To `.fixme/`

Invalid because multi-root workspaces can silently fragment state.

Valid final state: helpers and skills use runtime root resolution and pass explicit absolute `fixmeDir`.

### Ticket Backend Bypassed

Invalid because markdown and future Linear ticket backends would diverge and transition ownership would become ambiguous.

Valid final state: ticket operations go through the ticket abstraction or an equivalent runtime API that preserves backend routing.

### Stub Ticket Backend Advertised As Working

Invalid because users could select a backend whose operations cannot actually create, transition, list, or resume tickets.

Valid final state: every selectable backend is implemented and verified, or unsupported backends are not advertised as supported.

### PR-Comment Resolution Collapsed To Fixed Versus Not Fixed

Invalid because PR-comments currently depends on source, verdict, author type, route, allowed unresolved set, and response behavior.

Valid final state: parent state and verification preserve the full resolution matrix.

### Child Task Completion Treated As Parent Workflow Completion

Invalid because PR-comments still has verification, commit, reply, resolve, and final summary work after `fixme-task` completes.

Valid final state: parent-context task completion emits task terminal events and the parent owns the user-facing terminal workflow outcome.

### Parent State Without A Task Terminal Event

Invalid because the parent can persist its own state but still have no reliable signal that child work completed, failed, or produced result artifacts.

Valid final state: parent workflows persist state and acknowledge explicit task terminal events through idempotent parent-state consumption.

### Task Event Consumed Before Parent State Records It

Invalid because interruption after marking the event consumed but before parent checkpointing would lose the child completion forever.

Valid final state: task event consumption stores the event in parent state before or atomically with the consumed marker, and retry semantics recover either side of a partial write.

### Task Completion Event Before Result Artifact Exists

Invalid because the parent can consume a terminal event and then fail to load the result it needs for verification, commit, replies, resolve, or summary.

Valid final state: terminal task events are recorded only after terminal task state and the parent-readable result summary have been durably written.

### Parent-To-Task Payload Only In Dispatch Text

Invalid because compaction or interruption before task initialization could lose the exact PR-comment fix groups, consultation choices, or continuation pointer.

Valid final state: lifecycle dispatch or task initialization persists the routed task payload before child work starts.

### Text-Carried Task Terminal State

Invalid because text output can be lost or duplicated across compaction, interruption, retry, or parent resume.

Valid final state: task terminal events are durable records with stable ids and consumed markers. Text notifications are optional wake-ups only and contain no required state.

### Usage Output After Wake-Up Directives

Invalid because adapters may parse the final wake-up directive, and extra output after it can hide the directive from the current conversation.

Valid final state: usage finish and any usage report line happen before the final wake-up directive, suppressed usage reporting does not invent a report line, and authoritative continuation still comes from disk state.

### Liveness Helper Overwrites Active Attention

Invalid because a parent can lose the durable prompt marker and fail to broker the user's answer.

Valid final state: lifecycle wait, dispatch, and heartbeat helpers preserve the active attention guard.

### Review Handler Directives Collapsed Or Skipped

Invalid because review loops depend on handler directives to route blocking fixes, nonblocking findings, unclear findings, and user questions.

Valid final state: helpers reduce orchestration ceremony but preserve the handler directive contract and review-level gates.

### Clarification Or Partial-Answer Flow Becomes Terminal

Invalid because a user clarification or partial decision answer could be mistaken for a final decision.

Valid final state: clarification and partial-answer records resume the task owner and keep unresolved decision points open.

### Lifecycle Helper Names Documented Without CLI Support

Invalid because agents would attempt commands that do not exist.

Valid final state: every helper name in skill instructions is implemented in the source CLI, installed into Claude and Codex copies, and covered by tests.

## Verification Requirements

The final design is verified by behavior, not by source shape alone.

Required verification:

- PR-comments continues from child `fixme-task` completion to verification, commit, reply, resolve, and summary using parent state.
- PR-comments preserves source, verdict, author-type, and allowed-unresolved rules.
- PR-comments resolves inline `REJECT_ALREADY_FIXED` threads for human and AI authors, resolves AI-authored rejected or follow-up inline threads, leaves human-authored rejected or follow-up inline threads unresolved, and never tries to thread-resolve issue comments or top-level PR reviews.
- `fixme-task` task state persists parent continuation and rejects malformed continuation data.
- Parent-to-task dispatch payloads are persisted before child work starts and can be resumed without the original dispatch prompt.
- `fixme-task` task state persists structured decisions and terminal task result metadata without breaking markdown compatibility.
- Parent-context `fixme-task` records durable terminal `completed` and `failed` events with result paths, and uses durable attention records for user-input pauses.
- Task terminal events are durable records with stable ids, parent run addressing, result paths, status, and consumed markers.
- Task terminal event recording is idempotent for the same terminal result and rejects conflicting duplicate records.
- Task terminal events are not recordable until terminal task state and the parent-readable result summary already exist.
- Task terminal event consumption rejects mismatched parent run ids, active-child mismatches for both explicit `--event-id` and `--next`, missing result paths, malformed status values, and events already consumed by a different or unacknowledged parent state.
- Repeated task terminal event consumption for the same parent-acknowledged event returns the parent-recorded event idempotently without losing the recorded parent state.
- Task terminal event consumption records the event into parent state before or atomically with the consumed marker, and retry recovers partial writes.
- Every durable helper create or mutation path has deterministic retry behavior: repeated identical keys return the existing result, conflicting duplicates are rejected, and stale updates return `staleState`.
- `task decision append/list` exists, validates shape, rejects malformed records, and emits markdown compatibility output through `task decision list --format markdown` for task-bound readers that need the markdown view.
- `task decision list` default output includes both active task-owned decisions and project-level markdown decisions; `--format markdown` returns merged compatibility markdown in a JSON `markdown` field; `--task-owned-only` is not used by normal task-bound spec, plan, review, or handler readers.
- `task decision append` rejects conflicting duplicate decision ids, directly appended superseded records, supersession of already-superseded task-owned decisions, malformed project decision references, and references to project-level decisions that do not exist.
- Project-level decisions created by standalone non-task flows remain visible to task-bound spec writers, plan writers, reviewers, and handlers after the structured task-decision migration.
- A task-owned decision that conflicts with a project-level decision is accepted only when it records explicit user-approved `supersedesProjectDecisionRefs`; otherwise readers treat the conflict as an unresolved decision and route to the normal user decision path.
- Lifecycle parent state commands create, checkpoint, resolve by parent run id, resolve by exact PR-comments natural key, resolve by broad PR-comments pull-request lookup, validate, reject malformed parent state, store immutable normalized lookup input, preserve durable ledger slots across cursor payload replacements, compute parent natural keys and lookup keys from normalized lookup input, reject conflicting duplicate creates using the original create-input digest, and reject ambiguous broad lookups without relying on TodoWrite or conversation memory.
- PR-comments parent state accepts only the specified status and cursor values, validates required payload fields for every cursor, rejects invalid transitions, and resumes from `awaitFixmeTask` through attention brokering or task-event consumption.
- PR-comments brokered child attention records the user answer, persists idempotent child resume-dispatch evidence, resumes the same child `fixme-task` with `--answer-attention` and the same child status id, and only then returns to waiting for the child terminal event.
- PR-comments with `--pause` persists the pre-execution confirmation cursor, survives interruption before approval, resumes to the same analysis and routed groups, and records cancellation as a failed parent run.
- PR-comments with multiple implementation dependency clusters dispatches one active fix batch at a time, consumes only the terminal task event for the active batch, persists each batch result summary, and verifies only after all batches complete.
- PR-comments with `--skip-commit` records skipped-commit evidence, does not require a commit sha for truthful reply text, and still replies and resolves when `--skip-resolve` is false.
- PR-comments commit cursor records expected head and changed-files digest from the verified state, rejects mismatched preflight state, never creates a second commit for the same parent run on retry, and records `ledger.commitResult` with committed tree evidence before advancing.
- PR-comments with `--skip-push` records skipped-push evidence after a successful commit and continues to reply and resolve only when `--skip-resolve` is false.
- PR-comments push cursor records `pushRemote`, full `pushRef`, and credential-free normalized `pushTarget` evidence from the immutable normalized PR head snapshot before entering push, rejects missing, invalid, zero-match, or ambiguous push targets, never stores raw remote URLs, retries only the recorded commit sha and recorded target, records `ledger.pushResult` with remote-contains-commit evidence before advancing, and treats an already-pushed recorded commit as idempotent success.
- PR-comments with `--skip-resolve` never enters reply or resolve cursors, including no-current-fix, verified-no-commit, skipped-push, and pushed-success paths, and records every fetched unresolved item in `ledger.unresolvedAccounting.allowedUnresolvedSet` with reason `skipResolve` before summary.
- PR-comments allowed-unresolved accounting rejects unknown reason values and accepts only `skipResolve`, `skipResponse`, `humanReviewerFinalSay`, `needsClarification`, and `requiresInvestigation`.
- PR-comments reply and resolve cursors persist per-row external-effect evidence, resume pending or failed rows deterministically, and fail the parent run when a required GitHub reply or required thread resolution cannot complete.
- Failed PR-comments summaries require `ledger.unresolvedAccounting.failedUnresolvedSet` for every fetched unresolved item left unresolved by the parent failure, and successful PR-comments summaries require `ledger.unresolvedAccounting.allowedUnresolvedSet`.
- PR-comments summarize rejects missing `ledger.unresolvedAccounting` for both completed and failed terminal summaries.
- PR-comments fetch failure records `fetchComplete: false`, failed surface and cursor details, every fetched unresolved item in `ledger.unresolvedAccounting.failedUnresolvedSet`, and `failure.reason: "fetchFailed"`.
- PR-comments analysis and consultation failures record every fetched unresolved item in `ledger.unresolvedAccounting.failedUnresolvedSet` and use the specified parent failure reason.
- PR-comments failed summaries reject missing or invalid parent `failure.reason` values and map every allowed parent failure reason to the specified usage outcome and usage reason.
- Failed task result summaries require a valid failure object, reject invalid failure reasons, and map every failure reason to the specified usage outcome and usage reason.
- Configured workflows, disabled phases, review levels, review cycles, outer loop limits, and custom skills resolve exactly as they do today.
- Ticket transitions still route through implemented backends, unsupported backends fail clearly, and sessions still track active ticket, active run status, concurrency limit, and terminal cleanup.
- Lifecycle dispatch helpers preserve model resolution, Codex model behavior, user-visible banners, child liveness ids, usage context, task-state-owner context, and `<fixme-dir>` propagation.
- Every helper command mentioned in installed skill text exists in both Claude and Codex installed runtime paths.
- Runtime root resolution still handles multi-root workspaces and never falls back to literal `.fixme/` paths.
- Parent-state APIs are the only new `<fixme-dir>` carve-out for PR-comments-style parents; they do not expose task-owned decisions, plans, specs, tickets, config, or task internals.
- Direct `fixme-task` creates or receives liveness at task start so durable decision pauses always have a status id.
- Direct user-facing attention records answers through the runtime before task interpretation, so direct prompts are resumable after interruption.
- Parent brokers can show, answer, and resume durable attention without interpreting answers.
- Liveness helpers cannot overwrite active attention markers.
- `lifecycle wait begin` rejects replacing a different active non-attention command marker, and `lifecycle wait end` rejects clearing an active attention marker.
- Clarification requests and partial decision answers remain resumable and do not write final decisions prematurely.
- Child skills cannot wait directly under `fixme-task`; their prompts become task-owned durable attention.
- Review handler directives and review-level gates still drive review-loop routing.
- Structured task decisions and project-level markdown decisions are visible together to every current task-bound decision reader through `task decision list` or `task decision list --format markdown`; no normal task-bound reader uses stale direct markdown or `--task-owned-only` output.
- Standalone non-task flows can still read and write project-level markdown decisions through `<fixme-dir>/decisions.md`.
- Usage reports still include by-skill and by-pipeline data, orchestrator overhead, child subtotal, and unmeasured-row warnings.
- Alerts fire once per existing semantic user-facing gate and do not fire for internal child invocations.
- Usage finish/report output never appears after a final wake-up directive.
- Long-running command liveness does not alter command stdout, stderr, exit status, shell behavior, environment, quoting, redirection, or pipelines.
- Parent-context `fixme-task` completion does not suppress required parent follow-up work: verification, commit and push when enabled, reply and resolve when enabled, terminal alerts, and final summary.

## Final Recommendation

The desired final state is a stateful runtime contract:

- `fixme-task` owns task state, task attention, task decisions, child dispatch, and terminal task result.
- Parent workflows own parent workflow state and continue from task terminal events.
- Transport is launch metadata only.
- TodoWrite is progress UI only.
- Lifecycle helpers own aggregate usage, liveness, attention, wait markers, and parent state orchestration. Existing `alert <event>` remains explicit user-facing alerting, and `task decision` remains the task-owned decision API.

This is the simplest reliable shape because it removes the agent's manual orchestration dance without removing the state and gates that currently make the workflows reliable.
