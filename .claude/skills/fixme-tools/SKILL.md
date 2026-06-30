---
name: fixme-tools
description: Shared fixme runtime CLI package. Provides fixme-tools.cjs for fixme root resolution, config schema migration/writes, project context commands, agent runtime resolution, Codex skill and agent installation, markdown ticket/session state operations, and dynamic workflow state-machine helpers.
disable-model-invocation: true
---

# Fixme Tools

Shared runtime CLI used by the fixme skill suite.

## Tool Path

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs
```

## Responsibilities

- Resolve `<fixme-dir>` with `root`
- Create, migrate, validate, and atomically write `<fixme-dir>/config.json`
- Detect, load, and save project context
- Resolve configured agent runtime settings
- Install Claude and Codex-adapted Fixme skill copies under `~/.claude/skills` and `~/.codex/skills`
- Register Fixme agents in Codex `config.toml`
- Enforce markdown ticket and session state transitions for `fixme-tickets-md`
- Build dynamic state transitions from workflow config
- Resolve workflow pipeline selection from eligible user and artifact candidates
- Synthesize deterministic clean review-handler routing blocks for zero-finding reviewer outputs
- Validate compact plan-readiness routing blocks before `fixme-task` routes around full plan review
- Record dispatched-agent liveness under `<fixme-dir>/runs/<statusId>/status.json`
- Save standalone task briefs and maintain low-level resumable task state
- Record usage start and finish events with pending state, runtime counter extraction, and append-only project/global usage JSONL
- Aggregate token usage reports from project and global usage JSONL

## Config Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get [key.path]
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set <key.path> '<json-value>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <workflow> --data '<json-object>'
```

`config migrate` creates missing config, backfills final standard workflows, upgrades recognized legacy standard workflow shapes, validates final review-level fields, and preserves custom workflows and unknown keys. It rejects obsolete `pipelines`, `workflowControls`, removed workflow aliases, and old review filters instead of translating them. Workflow writes must use `config workflow configure` so phase shapes and cycle limits are validated before JSON is saved.

## Review Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs review validate-plan-readiness --data-file <absolute-json-file>
```

The JSON payload is `{ "output": "<full readiness checker output>" }`.

## Codex Install Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs claude-skills install --skills-src <skills-dir> --claude-dir ~/.claude
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs codex-skills install --skills-src <skills-dir> --codex-dir ~/.codex
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs codex-agents install --agents-src <agents-dir> --codex-dir ~/.codex
```

`claude-skills install` copies source `fixme*` skills into `~/.claude/skills`, injects generated usage tracking instructions into installed `SKILL.md` entrypoints, installs the managed `UserPromptSubmit` usage hook in `~/.claude/settings.json`, removes stale Fixme skill copies, and excludes `fixme-tickets-md/scripts`.

`codex-skills install` copies source `fixme*` skills into `~/.codex/skills`, rewrites `.claude` paths to `.codex`, prepends a Codex runtime adapter to each installed `SKILL.md`, removes stale Fixme skill copies, and excludes `fixme-tickets-md/scripts`.

`codex-agents install` generates `~/.codex/agents/fixme-*.toml`, copies converted `fixme-*.md` agent files, removes stale Fixme agent files, and updates `~/.codex/config.toml` with `[agents.fixme-*]` tables that point at absolute `config_file` paths. Generated Codex agents set `model_reasoning_effort` but do not pin a model. It deliberately does not emit `[[agents]]`.

## Usage Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage start --skill <skill-name> --runtime claude
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage finish --invocation-id <id> --outcome complete
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage report --scope project
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage claude-hook
```

`usage start` creates pending invocation state and captures the runtime counter source at start only. Codex source binding uses an explicit `--source-path`, `FIXME_USAGE_SOURCE_PATH`, `CODEX_SESSION_FILE`, or `CODEX_THREAD_ID` to read `threads.rollout_path` from `CODEX_SQLITE_HOME/state_5.sqlite` first and legacy `~/.codex/state_5.sqlite` second; Claude source binding uses the managed hook's `session_id` to read the hook-recorded `transcript_path`. `usage claude-hook` is run by Claude Code's `UserPromptSubmit` hook and records only session metadata and transcript path, never transcript contents. `usage finish` extracts runtime counters only from the start-captured source, finalizes one immutable event, and appends it to both project and global usage JSONL. `usage report` reads those JSONL files and returns token-only totals, unmeasured-row counts, warning summaries, by-skill breakdowns, and pipeline totals. An explicit `usage start --runtime codex --source-path <path>` is validated as a Codex runtime counter source before any pending state is created. Fixme artifact paths (task, ticket, spec, plan, report, and decision files) are not valid `usageSourcePath` values and fail fast with `INVALID_USAGE_SOURCE_PATH`; only runtime transcript or counter files are accepted.

## Trace Attribution Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs trace hook --fixme-managed-hook-id fixmeTraceHook
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage report --view summary|buckets|cycles|spans|commands|unknowns
```

`trace hook --fixme-managed-hook-id fixmeTraceHook` is the managed runtime hook entry point. It reads runtime hook JSON from stdin, resolves the Fixme directory from the hook `cwd` via the Fixme root resolver (multi-root `subRepos` and Codex linked worktrees included), enriches the event from the active-context state machine, and appends one normalized trace event to `<fixmeDir>/trace/events.jsonl`. Trace events store hashes, byte counts, durations, and safe metadata only - never raw command strings, command output, or transcript bodies. Managed hook registration is installed automatically by `claude-skills install` and `codex-skills install`; a managed entry is identified only when its tokenized argv contains `--fixme-managed-hook-id fixmeTraceHook` and invokes `trace hook` for the current installed path, so user hooks (including substring false positives) are preserved across install, reinstall, and uninstall. `usage report --view summary|buckets|cycles|spans|commands|unknowns` reads the trace ledger and returns detailed orchestration and work bucket tables (every bucket in fixed order, including zero rows), cycle breakdowns, merged activity spans, verification command counters, and unknown/mixed attribution; the default `usage report` (no `--view`) augments the token-only summary with the same full bucket tables.

## Run Liveness Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run start --fixme-dir <absolute-fixme-dir> --agent <agent-name>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run ping --fixme-dir <absolute-fixme-dir> --status-id <status-id> --state <running|waiting|blocked|completed|failed> --checkpoint <dispatched|started|working|waiting|finalizing|done> --current-command <string|null>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run status --fixme-dir <absolute-fixme-dir> --status-id <status-id>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run attention set --fixme-dir <absolute-fixme-dir> --status-id <status-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run attention show --fixme-dir <absolute-fixme-dir> --status-id <status-id> --attention-id <attention-id>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run attention answer --fixme-dir <absolute-fixme-dir> --status-id <status-id> --attention-id <attention-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run attention clear --fixme-dir <absolute-fixme-dir> --status-id <status-id> --attention-id <attention-id>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker show --fixme-dir <absolute-fixme-dir> --status-id <status-id> --attention-id <attention-id>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker answer --fixme-dir <absolute-fixme-dir> --status-id <status-id> --attention-id <attention-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker resume --fixme-dir <absolute-fixme-dir> --parent-run-id <parent-run-id> --status-id <status-id> --attention-id <attention-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker acknowledge-resume --fixme-dir <absolute-fixme-dir> --parent-run-id <parent-run-id> --status-id <status-id> --attention-id <attention-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention consume --fixme-dir <absolute-fixme-dir> --data '<json-object>'
```

Parent-facing brokers use `lifecycle attention broker show` to render prompts, `lifecycle attention broker resume` to answer prompts and obtain a sealed existing-task resume runtime action, `lifecycle runtime-action observe` to report host-runtime evidence for each returned action, and `lifecycle attention broker acknowledge-resume` after lifecycle observes successful launch evidence. `lifecycle attention broker answer` is the lower-level raw-answer primitive; normal parent skills should not call it and then compose their own task resume. `run attention answer` and `run attention clear` are owner/internal APIs.

`run start` creates `<fixme-dir>/runs/<statusId>/status.json` with `state=running`, `checkpoint=dispatched`, and `currentCommand=null`. `run ping` atomically updates that same JSON file. `run ping` refuses non-terminal updates that would replace an active `currentCommand: attention:<attentionId>`; after a prompt is answered, use `run attention clear` before normal liveness updates resume. `run status` reads the current JSON file and rejects stored status files with unsupported top-level fields. `run attention set` stores a camelCase attention record under the run directory, marks the run as waiting, and sets `currentCommand` to `attention:<attentionId>` so a parent runner can discover the prompt without reading task state. `run attention set` requires non-empty `ownerSkill`, `kind`, and `promptMarkdown`, requires every provided routing string field to be non-empty, and rejects malformed `metadata` unless it is a JSON object. Provided `attentionId` values must be non-empty strings starting with `attn_` and must not contain surrounding whitespace; omit `attentionId` to let the runtime generate one. `run attention set` rejects overlapping pending attention and terminal run states. If an attention file exists but the run no longer references it in `currentCommand`, `run attention set` treats it as stale and replaces it. For `ownerSkill: "fixme-task"`, `run attention set` also requires `resumeRef` and `taskStatePath` so the owning task can be resumed after the parent records an answer; fixme-task `taskStatePath` must be absolute. For `ownerSkill: "fixme-task"`, `run attention set` also requires `sourceSkill` and a supported `answerMode` (`freeform`, `decision-card`, or `multiple-choice`) so resume can route the answer deterministically. `run attention show` only renders the attention currently referenced by `currentCommand`, which prevents stale prompts after the owner moved on or failed. Attention reads reject stored records with unsupported top-level fields, missing `promptMarkdown`, malformed `metadata`, invalid timestamps, answer-shape mismatches, mismatched `attentionId`, or unsupported `status`. `run attention answer` stores the user's non-empty answer for the owner skill to consume; it does not write decisions. `run attention answer` requires `answerKind: "decision"` or `answerKind: "clarificationRequest"` so the owner can distinguish final choices from clarification turns. `run attention answer` requires `answeredBy: "user"` so brokered answers are attributable. `run attention answer` rejects unsupported answer fields; answer payloads are exactly `answer`, `answeredBy`, and `answerKind`. `run attention answer` only accepts the attention currently referenced by `currentCommand`, which prevents stale answers after the owner moved on. `run attention clear` only clears an answered attention record that is still referenced by `currentCommand`, restores the run to `state=running`, `checkpoint=working`, and `currentCommand=null`, then removes the stale record. If stale-record removal fails after the run status is restored, `run attention clear` still returns success with `recordRemoved: false` and a `warnings` entry because stale prompts are no longer renderable once `currentCommand` is cleared. Liveness is independent of usage tracking; it works even when usage IDs are unavailable.

`lifecycle attention consume` is the owner-only helper for `fixme-task` attention resumes. It validates the answered attention, appends supplied decision records when `mode` is `resolvedDecision`, checkpoints `pendingDecision` for `clarificationRequest` and `partialDecision`, clears the consumed run attention, and treats equivalent replay states as success.

Parent brokers answer child `fixme-task` attention with `lifecycle attention broker resume`. The helper validates the parent run's `activeChild`, verifies the child run is still waiting on `attention:<attentionId>`, records or reuses the raw answer, checkpoints the parent into `brokerChildAttention`, creates or reuses resume dispatch/status records, and returns a persisted `runtimeAction` plus `resume.liveness`. Parent brokers answer attention through `lifecycle attention broker resume`, execute exactly the returned `runtimeAction`, observe it through `lifecycle runtime-action observe`, and repeat until lifecycle returns a non-action state; then they call `lifecycle attention broker acknowledge-resume` to persist resume-dispatch evidence. The helper does not expose task-owned decision state and does not call `lifecycle dispatch prepare`.

`lifecycle attention broker resume` output also includes a copy-ready `acknowledgeResumeTemplate` whose `data` contains the sealed launch plan fields. After lifecycle observes successful runtime launch evidence, parent brokers copy `acknowledgeResumeTemplate.data`, add only runtime evidence requested by the template, then call `lifecycle attention broker acknowledge-resume`. The acknowledgement records `activeChild.resumeDispatch` and checkpoints the parent from `brokerChildAttention` to `waitingForChild` / `awaitFixmeTask`. Repeating the same acknowledgement is a no-op; changing the resume-dispatch evidence returns `conflictingDuplicate`.

## Task Resume Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs pipeline resolve --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs pipeline resolve --data-stdin
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --ticket <ticket.md|ticket-folder> --pipeline-resolution-file <absolute-json-file> --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --task <task.md> --pipeline-resolution-file <absolute-json-file> --parent-continuation-file <absolute-json-file> --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --state <task.state.json> --pipeline-resolution-file <absolute-json-file> --parent-continuation-file <absolute-json-file> --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task checkpoint --state <task-state.json> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task producer-continuation mark-bad --state <task-state.json> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task supersede --task <FIXME-N|task.md|state.json> --by <replacement-ref> --reason <reason>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task attach-artifact --task <FIXME-N|task.md|state.json|ticket.md|ticket-folder> --data-file <absolute-json-file>
```

JSON-bearing inputs accept exactly one direct/file/stdin source per logical argument: `--data`, `--data-file`, or `--data-stdin`; `--pipeline-resolution`, `--pipeline-resolution-file`, or `--pipeline-resolution-stdin`; and `--parent-continuation`, `--parent-continuation-file`, or `--parent-continuation-stdin`. File paths must be absolute. Only one logical JSON argument may use stdin in a single command.

The `task producer-continuation mark-bad --data-file` payload must include `ownerFence`, `agentName`, `runtime`, `reason`, and `idempotencyKey`. Legacy flag-only `--agent-name`, `--runtime`, and `--reason` remain accepted only for ownerless states; current attempt-managed task paths use the owner-fenced JSON form.

`pipeline resolve` selects one pipeline from eligible user/artifact candidates and returns a camelCase `pipelineResolution` object. Assistant-authored candidates are ignored. `task save` creates a standalone task brief at `<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.md`, creates its sibling `.state.json`, and returns `taskRef`, `taskPath`, and `statePath`. `task save` rejects skeletal inputs that are not self-contained handoffs with concrete settled solution shape, approach, behavior, scope, and planning notes. It also rejects non-empty `openQuestions`; callers must resolve questions, integrate the answers into the task payload, and retry with `openQuestions` omitted or empty. `task save` and `task init` both require the caller to pass a resolved `pipelineResolution`; they do not infer a default workflow. `task init` creates resumable state for an existing saved task or ticket and rejects superseded saved tasks. `task init --task` is idempotent for existing saved task state: it validates compatible `projectRoot`, `pipeline`, and `pipelineResolution`, merges a provided `parentContinuation` only when the existing value is null, rejects conflicting parent continuation, and preserves existing cursor, artifacts, handoff, loops, decisions, producer continuations, and terminal result. Task state may include `producerContinuations`, an exact-handle, task-local, producer-only cache of runtime handles. `task checkpoint` atomically merges allowed camelCase JSON state fields, validates `status`, `cursor`, `loops`, `pendingDecision`, and `producerContinuations` resume-control shapes, and rejects live or derived task-state fields such as `currentSpecificationPath`, `currentStep`, and `manifest` at any depth. `task producer-continuation mark-bad` updates one exact `agentName` plus `runtime` continuation entry to bad while preserving sibling entries. `task resolve` converts a user-facing ref or path into canonical `taskPath`, `ticketPath`, and `statePath` values. `task supersede` durably marks a standalone saved task as replaced in both markdown frontmatter and sibling state JSON so stale saved tasks do not resume as active work. `task attach-artifact` indexes a generated preparation artifact on the resolved task markdown under `Preparation Artifacts` and mirrors it into task state as `artifacts.preparationArtifacts`.

`lifecycle task continue` classifies an existing task state and acquires a task owner only when lifecycle evidence permits it. Required task-continue JSON fields: `resumeRef`, `runtime`, `transport`, and `idempotencyKey`. Optional task-continue JSON fields: `topLevelInteractive`, `parentRunId`, `parentStatusId`, and `answerAttentionId`. Do not include `taskStatePath`, `projectRoot`, `currentStatusId`, or `usageInvocationId` in `lifecycle task continue` JSON. The command resolves task state from `resumeRef`; caller liveness and usage context remain outside the continue payload.

Direct top-level resume payload shape:

```json
{
  "resumeRef": "FIXME-14",
  "runtime": "codex",
  "transport": "direct",
  "topLevelInteractive": true,
  "idempotencyKey": "continue-FIXME-14-<stable-attempt-key>"
}
```

Direct top-level resume command shape:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle task continue --fixme-dir <fixme-dir> --data-file <task-continue.json>
```

## Review Helper Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs review synthesize-clean-handler --kind <plan|code|specification>
```

`review synthesize-clean-handler` returns a camelCase JSON object containing a validated clean handler result and `routingBlock`. `fixme-task` uses it only after a reviewer machine footer proves `REVIEW_RESULT: CLEAN`, `FINDING_COUNT: 0`, and `QUESTION_COUNT: 0`; all non-empty or malformed review outputs still dispatch the configured handler.

## Lifecycle Dispatch Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch attach-runtime-handle --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch complete --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch probe --fixme-dir <absolute-fixme-dir> --dispatch-id <dispatch-id> --status-id <status-id> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch reconcile-wait --fixme-dir <absolute-fixme-dir> --dispatch-id <dispatch-id> --status-id <status-id> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch stalled-owner recover --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle child finalize --fixme-dir <absolute-fixme-dir> --state <task-state.json> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent prepare-child --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent abandon --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
```

`lifecycle dispatch prepare` accepts `allowProducerContinuation` to opt a task-bound producer dispatch into exact-handle continuation and `forceFreshReason` to bypass a stored handle after runtime resume failure or producer rejection. Prepare output includes `continuation.mode`, `continuation.reason`, `continuation.runtimeHandle`, top-level `completionRuntimeHandlePolicy`, and copy-ready `completionTemplates.completed` / `completionTemplates.failed` bases. The policy is `"persistProducerContinuation"` for resumable producers and `"omit"` for every other child; when it is `"omit"`, do not include `runtimeHandle` in `lifecycle dispatch complete`. It also returns `usageContext.usageSourcePath` from explicit input, the dispatching `parentInvocationId` usage record, or the current runtime source binding only when that source is eligible for the requested transport. Codex `agent` and `background` dispatches do not inherit parent `usageSourcePath` and do not accept request `usageSourcePath`; fresh Codex children bind their own runtime source at `usage start`. Claude dispatches (any transport) and `inline-skill` dispatches may pass a validated same-runtime `usageSourcePath` to `usage start` without guessing session files. Continuation is exact-handle, task-local, producer-only, and optional. If no valid handle exists, callers dispatch fresh.

Prepare output also returns `attachRuntimeHandleTemplate`, a copy-ready payload of `{ dispatchId, statusId, parentStatusId, runtime, transport }`. The caller adds only `runtimeHandle` and calls `lifecycle dispatch attach-runtime-handle`; the template omits `runtimeHandle` and `currentCommand` because they are not known before the runtime launch. Prepare accepts an optional `checkpointData` field that applies a pre-dispatch task checkpoint patch (using the `task checkpoint` contract) before the dispatch record is created. `checkpointData` participates in idempotency: an identical replay reuses the dispatch and a different `checkpointData` under the same idempotency key returns `conflictingDuplicate`. Invalid `checkpointData` is rejected before any dispatch record is created.

`lifecycle dispatch attach-runtime-handle` records the canonical runtime handle for a prepared dispatch as the dispatch record `activeRuntime` and mirrors it onto the child run status and parent activeChild. This is the source of truth for producer continuation runtime identity.

`lifecycle dispatch complete` is terminal-only. Build the payload from prepare output `completionTemplates.completed` or `completionTemplates.failed`; do not add `runtime`, `transport`, or `result`. Follow `completionRuntimeHandlePolicy`: when it is `"persistProducerContinuation"`, a successful resumable producer completion may persist a producer continuation, but only when the completion `runtimeHandle` matches the dispatch-owned `activeRuntime` from a prior attach; omit `runtimeHandle` to derive the attached handle. When the policy is `"omit"`, do not include `runtimeHandle`. A supplied handle that does not match the attached `activeRuntime`, or a supplied handle on a current-format resumable producer that has no attached `activeRuntime`, fails closed before any run status update, dispatch completion record, checkpoint patch, or producer continuation write. Complete also accepts an optional `checkpointData` field that applies a post-completion task checkpoint patch after the accepted terminal completion is recorded; it is never applied on the mismatch/fail-closed path and participates in completion idempotency.

`lifecycle dispatch probe` is the parent wait watchdog probe. A parent calls it after a runtime wait watchdog timeout with a payload containing `parentStatePath`, `waitActionId`, `watchdogMs`, and `probeReason: "waitWatchdogTimeout"`, then branches only on the returned `transition`, which is exactly one of `terminalEvent`, `attention`, `stalledOwner`, `continueWait`, or `dispatchFailure`. It reads durable terminal events, attention state, stalled-owner facts, and child-owned `workerHeartbeat` data. `continueWait` means the timeout was only a parent watchdog wakeup; it carries `liveness.state` (`heartbeatRecent`, `heartbeatStale`, or `heartbeatMissing`) and a `wait` block with the same wait action and timeout. A timeout is not terminal runtime evidence and does not consume the runtime-action `observation` slot. `lifecycle runtime-action observe` with `waitOutcome: "timeout"` records a non-terminal watchdog event and returns the same probe-shaped result; a later `completed` or `failed` wait observation for the same action still completes the dispatch. `lifecycle dispatch reconcile-wait` is compatibility-only and returns the same durable transitions without requiring `waitActionId`.

`run status.updatedAt` is the last status-file write by any actor, not a heartbeat. `run status.workerHeartbeat.observedAt` is the child-owned liveness timestamp written only by `run ping`; parent lifecycle writes preserve it but never refresh it. An old or missing `workerHeartbeat` with an attached active runtime is not proof of dead host-runtime work.

`lifecycle dispatch stalled-owner recover` revalidates the stalled-owner facts before mutation: owner wait marker, terminal child run, matching dispatch id, and missing dispatch completion. If the owner runtime is resumable, it returns a sealed `resumeAgentAndSendInput` runtime action for the owning dispatcher. If the owner stopped before it consumed completion, it records `ownerStoppedBeforeDispatchCompletion` through the dispatch failure boundary and does not fresh-spawn a replacement owner.

`lifecycle child finalize` is the parent-driven-only single terminal command. It runs a single parent-linkage gate before any terminal side effect, then writes the result summary, writes the task-state `terminalResult`, records and consumes the parent task event, closes child liveness by durable `parentContinuation.childStatusId`, updates parent liveness to the next route, fires the `task_finished`/`task_failed` alert, and finishes usage from `parentContinuation.usageInvocationId`. The payload is the task-result contract (`status`, `summaryMarkdown`, `changedFiles`, `artifactPaths`, plus `failure` for failed) with `ownerFence`; do not supply `terminalResultId`, and do not treat caller `changedFiles` as authoritative. A verifiable parent `taskRunId` mismatch fails before any terminal write. Direct (non-parent-driven) runs continue to use `lifecycle invocation finish` plus a run summary.

`lifecycle parent prepare-child` is the canonical parent-aware handoff helper. It preflights the child handoff index, saves or reuses the child task and sidecar payload, prepares dispatch, persists `activeChild`, preserves parent ledger slots, advances the parent to await-child state, and returns a `launch` block. The returned `launch.promptBlocks.parentContinuation` carries the durable linkage identity `taskRunId` (parent linkage) and `childStatusId` (durable child liveness id). Runtime adapters perform the returned `agent` or `background` child launch.

`lifecycle parent abandon` closes stale nonterminal parent runs as failed while preserving every populated ledger slot.

`lifecycle invocation start` auto-resolves `<fixme-dir>` from the working-directory root when `--fixme-dir` is omitted; passing it explicitly is also supported. When `taskStatePath` points at a parent-driven child state, the returned usage invocation id is persisted as `parentContinuation.usageInvocationId` so `lifecycle child finalize` can finish usage without an extra terminal payload field.

Command help is registry-backed: every command above supports `<command> --help`, and router dispatch, `--help`, and coverage tests all derive from the single command registry.

## Ownership

This skill owns the CLI. Backend skills may call it, but the CLI is not owned by any ticket backend.

All commands output JSON to stdout. Errors output JSON with an `error` field and exit code 1.
