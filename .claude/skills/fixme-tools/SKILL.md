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
- Validate compact plan-readiness routing blocks before fixme-task routes plan-phase readiness results.
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

`config migrate` creates missing config, backfills final standard workflows, validates final review-level fields, and preserves custom workflows and unknown keys. It rejects obsolete `pipelines`, `workflowControls`, removed workflow aliases, and old review filters instead of translating them. Workflow writes must use `config workflow configure` so phase shapes and cycle limits are validated before JSON is saved.

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

`usage start` creates pending invocation state and captures the runtime counter source at start only. Codex source binding uses an explicit `--source-path`, `FIXME_USAGE_SOURCE_PATH`, `CODEX_SESSION_FILE`, or `CODEX_THREAD_ID` to read `threads.rollout_path` from `~/.codex/state_5.sqlite`; Claude source binding uses the managed hook's `session_id` to read the hook-recorded `transcript_path`. `usage claude-hook` is run by Claude Code's `UserPromptSubmit` hook and records only session metadata and transcript path, never transcript contents. `usage finish` extracts runtime counters only from the start-captured source, finalizes one immutable event, and appends it to both project and global usage JSONL. `usage report` reads those JSONL files and returns token-only totals, unmeasured-row counts, warning summaries, by-skill breakdowns, and pipeline totals.

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
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention consume --fixme-dir <absolute-fixme-dir> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker resume --fixme-dir <absolute-fixme-dir> --parent-run-id <parent-run-id> --status-id <status-id> --attention-id <attention-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker acknowledge-resume --fixme-dir <absolute-fixme-dir> --parent-run-id <parent-run-id> --status-id <status-id> --attention-id <attention-id> --data '<json-object>'
```

Parent-facing brokers use `lifecycle attention broker show` to render prompts, `lifecycle attention broker resume` to answer prompts and obtain the existing-task resume launch, and `lifecycle attention broker acknowledge-resume` immediately after launching the returned message. `lifecycle attention broker answer` is the lower-level raw-answer primitive; normal parent skills should not call it and then compose their own task resume. `run attention answer` and `run attention clear` are owner/internal APIs.

`run start` creates `<fixme-dir>/runs/<statusId>/status.json` with `state=running`, `checkpoint=dispatched`, and `currentCommand=null`. `run ping` atomically updates that same JSON file. `run ping` refuses non-terminal updates that would replace an active `currentCommand: attention:<attentionId>`; after a prompt is answered, use `run attention clear` before normal liveness updates resume. `run status` reads the current JSON file and rejects stored status files with unsupported top-level fields. `run attention set` stores a camelCase attention record under the run directory, marks the run as waiting, and sets `currentCommand` to `attention:<attentionId>` so a parent runner can discover the prompt without reading task state. `run attention set` requires non-empty `ownerSkill`, `kind`, and `promptMarkdown`, requires every provided routing string field to be non-empty, and rejects malformed `metadata` unless it is a JSON object. Provided `attentionId` values must be non-empty strings starting with `attn_` and must not contain surrounding whitespace; omit `attentionId` to let the runtime generate one. `run attention set` rejects overlapping pending attention and terminal run states. If an attention file exists but the run no longer references it in `currentCommand`, `run attention set` treats it as stale and replaces it. For `ownerSkill: "fixme-task"`, `run attention set` also requires `resumeRef` and `taskStatePath` so the owning task can be resumed after the parent records an answer; fixme-task `taskStatePath` must be absolute. For `ownerSkill: "fixme-task"`, `run attention set` also requires `sourceSkill` and a supported `answerMode` (`freeform`, `decision-card`, or `multiple-choice`) so resume can route the answer deterministically. `run attention show` only renders the attention currently referenced by `currentCommand`, which prevents stale prompts after the owner moved on or failed. Attention reads reject stored records with unsupported top-level fields, missing `promptMarkdown`, malformed `metadata`, invalid timestamps, answer-shape mismatches, mismatched `attentionId`, or unsupported `status`. `run attention answer` stores the user's non-empty answer for the owner skill to consume; it does not write decisions. `run attention answer` requires `answerKind: "decision"` or `answerKind: "clarificationRequest"` so the owner can distinguish final choices from clarification turns. `run attention answer` requires `answeredBy: "user"` so brokered answers are attributable. `run attention answer` rejects unsupported answer fields; answer payloads are exactly `answer`, `answeredBy`, and `answerKind`. `run attention answer` only accepts the attention currently referenced by `currentCommand`, which prevents stale answers after the owner moved on. `run attention clear` only clears an answered attention record that is still referenced by `currentCommand`, restores the run to `state=running`, `checkpoint=working`, and `currentCommand=null`, then removes the stale record. If stale-record removal fails after the run status is restored, `run attention clear` still returns success with `recordRemoved: false` and a `warnings` entry because stale prompts are no longer renderable once `currentCommand` is cleared. Liveness is independent of usage tracking; it works even when usage IDs are unavailable.

`lifecycle attention consume` is the owner-only helper for `fixme-task` attention resumes. It validates the answered attention, appends supplied decision records when `mode` is `resolvedDecision`, checkpoints `pendingDecision` for `clarificationRequest` and `partialDecision`, clears the consumed run attention, and treats equivalent replay states as success.

## Task Resume Commands
Parent brokers answer child `fixme-task` attention with `lifecycle attention broker resume`. The helper validates the parent run's `activeChild`, verifies the child run is still waiting on `attention:<attentionId>`, records or reuses the raw answer, checkpoints the parent into `brokerChildAttention`, and returns `resume.message` plus `resume.liveness`. Parent brokers answer attention through `lifecycle attention broker resume`, launch the returned `resume.message`, then call `lifecycle attention broker acknowledge-resume` to persist resume-dispatch evidence. The helper does not expose task-owned decision state and does not call `lifecycle dispatch prepare`.

After the runtime launch succeeds, parent brokers call `lifecycle attention broker acknowledge-resume` with `{ "resumeMessage": "<returned resume.message>", "transport": "<transport>", "runtime": "<runtime>", "runtimeHandle": <optional handle> }`. The acknowledgement records `activeChild.resumeDispatch` and checkpoints the parent from `brokerChildAttention` to `waitingForChild` / `awaitFixmeTask`. Repeating the same acknowledgement is a no-op; changing the resume-dispatch evidence returns `conflictingDuplicate`.


```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs pipeline resolve --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs pipeline resolve --data-stdin
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --ticket <ticket.md|ticket-folder> --pipeline-resolution-file <absolute-json-file> --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --task <task.md> --pipeline-resolution-file <absolute-json-file> --parent-continuation-file <absolute-json-file> --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --state <task.state.json> --pipeline-resolution-file <absolute-json-file> --parent-continuation-file <absolute-json-file> --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task checkpoint --state <task-state.json> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task producer-continuation mark-bad --state <task-state.json> --agent-name <resumable-producer> --runtime <claude|codex> --reason <reason>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task attach-artifact --task <FIXME-N|task.md|state.json|ticket.md|ticket-folder> --data-file <absolute-json-file>
```

JSON-bearing inputs accept exactly one direct/file/stdin source per logical argument: `--data`, `--data-file`, or `--data-stdin`; `--pipeline-resolution`, `--pipeline-resolution-file`, or `--pipeline-resolution-stdin`; and `--parent-continuation`, `--parent-continuation-file`, or `--parent-continuation-stdin`. File paths must be absolute. Only one logical JSON argument may use stdin in a single command.

`pipeline resolve` selects one pipeline from eligible user/artifact candidates and returns a camelCase `pipelineResolution` object. Assistant-authored candidates are ignored. `task save` creates a standalone task brief at `<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.md`, creates its sibling `.state.json`, and returns `taskRef`, `taskPath`, and `statePath`. `task save` rejects skeletal inputs that are not self-contained handoffs with concrete approach, behavior, scope, and planning notes. `task save` and `task init` both require the caller to pass a resolved `pipelineResolution`; they do not infer a default workflow. `task init` creates resumable state for an existing saved task or ticket. `task init --task` is idempotent for existing saved task state: it validates compatible `projectRoot`, `pipeline`, and `pipelineResolution`, merges a provided `parentContinuation` only when the existing value is null, rejects conflicting parent continuation, and preserves existing cursor, artifacts, handoff, loops, decisions, producer continuations, and terminal result. Task state may include `producerContinuations`, an exact-handle, task-local, producer-only cache of runtime handles. `task checkpoint` atomically merges allowed camelCase JSON state fields, validates `status`, `cursor`, `loops`, `pendingDecision`, and `producerContinuations` resume-control shapes, and rejects live or derived task-state fields such as `currentSpecificationPath`, `currentStep`, and `manifest` at any depth. `task producer-continuation mark-bad` updates one exact `agentName` plus `runtime` continuation entry to bad while preserving sibling entries. `task resolve` converts a user-facing ref or path into canonical `taskPath`, `ticketPath`, and `statePath` values. `task attach-artifact` indexes a generated preparation artifact on the resolved task markdown under `Preparation Artifacts` and mirrors it into task state as `artifacts.preparationArtifacts`.

## Lifecycle Dispatch Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare --fixme-dir <absolute-fixme-dir> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch complete --fixme-dir <absolute-fixme-dir> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent prepare-child --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent abandon --fixme-dir <absolute-fixme-dir> --data-file <absolute-json-file>
```

`lifecycle dispatch prepare` accepts `allowProducerContinuation` to opt a task-bound producer dispatch into exact-handle continuation and `forceFreshReason` to bypass a stored handle after runtime resume failure or producer rejection. Prepare output includes `continuation.mode`, `continuation.reason`, and `continuation.runtimeHandle`. It also propagates `usageContext.usageSourcePath` from explicit input, the dispatching `parentInvocationId` usage record, or the current runtime source binding so nested Codex agents can pass `--source-path` to `usage start` without guessing session files. Continuation is exact-handle, task-local, producer-only, and optional. If no valid handle exists, callers dispatch fresh.

`lifecycle dispatch complete` accepts `runtimeHandle` on successful resumable producer completion. The helper records that handle in task-state `producerContinuations` so later prepare calls for the same task, agent, and runtime can return `continuation.mode: "resume"`.

`lifecycle parent prepare-child` is the canonical parent-aware handoff helper. It preflights the child handoff index, saves or reuses the child task and sidecar payload, prepares dispatch, persists `activeChild`, preserves parent ledger slots, advances the parent to await-child state, and returns a `launch` block. Runtime adapters perform the returned Claude Skill or Codex agent launch.

`lifecycle parent abandon` closes stale nonterminal parent runs as failed while preserving every populated ledger slot.

## Ownership

This skill owns the CLI. Backend skills may call it, but the CLI is not owned by any ticket backend.

All commands output JSON to stdout. Errors output JSON with an `error` field and exit code 1.
