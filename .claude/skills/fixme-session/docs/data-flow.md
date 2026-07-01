# Fixme Skill Data Flow Map

This document maps the current session-mode data flow: bug intake, optional browser investigation, background `fixme-task` execution, ticket state, and files shared between agents.

## Agent Topology

```
User
  |
  v
fixme-session
  |-- fixme-tickets ------------------------> configured ticket backend
  |                                             default: fixme-tickets-md
  |
  |-- intake-agent -------------------------> fills ticket report fields
  |
  |-- fixme-investigate --------------------> writes investigation output
  |
  `-- fixme-task (background) --------------> dispatches workflow phases
         |-- fixme-write-product-spec
         |-- fixme-write-technical-spec
         |-- fixme-write-plan
         |-- fixme-execute-plan
         |-- fixme-review-*
         |-- fixme-handle-*
         `-- fixme-browser-verify
```

`fixme-session` is a dispatcher. It owns session lifecycle, intake, browser setup, background-task tracking, and terminal ticket cleanup. `fixme-task` owns workflow phase dispatch and review-loop routing while a task is active.

## State Model

Ticket state is stored in ticket frontmatter and changed through `fixme-tickets`, which routes to the configured backend.

Ticket state uses workflow-derived phase names plus structural states:

- **Workflow-derived states:** when a ticket has a stored `pipeline` value or a transition uses `--pipeline`, enabled workflow phase names become ticket states. `full` uses `product-spec`, `technical-spec`, `plan`, `implement`, and `verify`; `bugfix` uses `investigate`, `research`, `plan`, `implement`, and `verify`.
- **Default workflow:** when no project config or selected workflow exists yet, the built-in `standard` workflow supplies `plan` and `implement`.
- **Invalid workflows:** malformed workflow config, removed workflow aliases, and removed phase names fail closed instead of falling back to another state chain.

Structural states always exist: `queued`, `done`, `failed`, and `skipped`.

## Shared State

### Ticket File

Path: `<session-dir>/NNNN-slug/ticket.md`

| Field or Section | Written By | Read By | Purpose |
| --- | --- | --- | --- |
| `state` | `fixme-tools.cjs ticket transition` via `fixme-tickets` | `fixme-session`, `fixme-task`, ticket backend | Current workflow or terminal state. |
| `pipeline` | First transition with `--pipeline` | `fixme-tools.cjs ticket transition`, `fixme-task` | Selects workflow-derived transition rules. |
| `number`, `slug`, `session` | `ticket create` and intake rename | All session components | Stable ticket identity. |
| `base_commit` | Session/task cleanup flow when a baseline is captured | `fixme-session` | Revert or recovery anchor. |
| `files_changed` | Execution or completion flow when changed files are known | `fixme-session` | Commit staging scope. |
| `commit_hash` | `fixme-session` after commit | Status/report flows | Links ticket to committed work. |
| `failure_reason` | `ticket transition --reason` | Status/report flows | User-facing terminal failure or skip reason. |
| `current_attempt`, `max_attempts` | Ticket template and transition logic | `fixme-tools.cjs`, `fixme-task` | Retry accounting for backward transitions. |
| `transitions[]`, `durations{}` | `fixme-tools.cjs ticket transition` | Session summary and audit flows | Transition history and time-in-state data. |
| `original-report` section | `intake-agent` | `fixme-investigate`, downstream workflow agents | Verbatim user report. |
| `structured-fields` section | `intake-agent` | `fixme-investigate`, browser verification | Affected URL, component, expected/actual behavior, errors. |
| `clarifications` section | `fixme-session` / intake flow | Investigation and task context | Follow-up user details. |
| `investigation` section | Session investigation flow if it writes back to the ticket | `fixme-task`, review context | Human-readable investigation notes. |
| `fix` section | Session completion/status flow | Status/report flows | Progress notes for the ticket. |

### Session File

Path: `<session-dir>/session.md`

| Field | Written By | Read By | Purpose |
| --- | --- | --- | --- |
| `status` | Session create/stop/auto-close | `fixme-session` | Active or completed session lifecycle. |
| `active_intakes[]` | `fixme-session` | `fixme-session` | Intake agents still in flight across context compaction. |
| `active_task` | `fixme-session` | `fixme-session` | The one background `fixme-task` ticket path currently running. |
| `activeRunStatusId` | `fixme-session` | `fixme-session` | The active background `fixme-task` run status id used for liveness and attention brokering. |
| `activeParentRunId` | `fixme-session` | `fixme-session`, `lifecycle attention broker resume` | The parent run id used by `lifecycle attention broker resume` to validate the active background child. |
| `tickets_done`, `tickets_failed`, `tickets_skipped`, `tickets_total` | `session summary` | Status/report flows | Session-level ticket counts. |
| `duration_seconds` | `session summary` | Status/report flows | Session duration. |

| `activeChild.resumeDispatch` | `lifecycle attention broker acknowledge-resume` | `fixme-session`, `lifecycle attention broker acknowledge-resume` replay | Durable evidence that the parent executed and observed the sealed child resume runtime action before returning to `awaitFixmeTask` and before later task-event consumption. |

The broker answer path is `lifecycle attention broker resume` followed by `lifecycle runtime-action observe` and `lifecycle attention broker acknowledge-resume`: the first helper records or reuses the raw answer, validates the active child from parent state, creates or reuses resume dispatch/status records, persists a sealed runtime action, returns liveness context, and returns a copy-ready `acknowledgeResumeTemplate`. The parent executes exactly each returned `runtimeAction`, observes evidence by `actionId`, repeats while lifecycle returns `status: "requiresRuntimeAction"`, then copies `acknowledgeResumeTemplate.data` and adds only runtime evidence requested by the template before calling acknowledge-resume, which records `activeChild.resumeDispatch`, checkpoints the parent back to `waitingForChild` / `awaitFixmeTask`, and leaves decision persistence to `fixme-task`.

Runtime wait semantics: parents that wait on a dispatched child treat `run status.updatedAt` as the last status write, not a heartbeat. Only `run status.workerHeartbeat.observedAt` is child-owned liveness detail. On a runtime wait watchdog timeout the parent calls `lifecycle dispatch probe` and branches only on its returned transition (`runtimeWaitTimedOut`, `terminalEvent`, `attention`, `stalledOwner`, `dispatchFailure`). `runtimeWaitTimedOut` reports `reason: "runtimeLivenessUnknown"` and stops the current wait path instead of re-arming the wait. An old or missing `workerHeartbeat` with an attached active runtime and no terminal/attention evidence is not proof of live host-runtime work.

### Project Config

Path: `<fixme-dir>/config.json`

| Field | Written By | Read By | Purpose |
| --- | --- | --- | --- |
| `project` | `/fixme-config` or `context save` | Session setup, execution, verification | Dev server and verification commands. |
| `ticketBackend` | `/fixme-config` | `fixme-tickets` | Backend routing. |
| `workflows` | `/fixme-config` or config CLI | `fixme-task`, ticket transition logic | Named phase graphs and review loops. |
| `models` | `/fixme-config` or config CLI | `resolve-model`, dispatchers | Runtime profile and overrides. |
| `review.level` | `/fixme-config` or config CLI | Review handlers and PR comment flows | Finding routing by global, workflow, phase, or PR comment override. |
| `linear` | `/fixme-config` | `/fixme-ticket`, Linear backend | Linear team metadata and optional defaults. |
| `alerts` | `/fixme-config` | Orchestrators and interactive skills | Audible alert preferences. |

Review level is resolved with `config review-level resolve`. Standard workflows include `standard` and `bugfix`.

## Artifact Locations

| Artifact | Written By | Read By | Notes |
| --- | --- | --- | --- |
| `<ticket-folder>/assets/` | Intake, investigation, browser verification | Investigation and verification flows | Screenshots and other evidence. |
| `<ticket-folder>/research/` | `fixme-investigate` in session mode | `fixme-task`, planners, reviewers | Root-cause or reproduction reports. |
| `<ticket-folder>/verifications/` | Browser verification flow | Session completion/status | Verification evidence for session tickets. |
| `<fixme-dir>/specs/product/*.md` | `fixme-write-product-spec` | Spec review, technical spec, planning | Product behavior documents. |
| `<fixme-dir>/specs/technical/*.md` | `fixme-write-technical-spec` | Spec review, planning | Implementation contract documents. |
| `<fixme-dir>/plans/*.md` | `fixme-write-plan` | Plan review, execution, code review | Implementation plans. |
| `<fixme-dir>/context/*-code-map.md` | `fixme-write-plan` | Executors and reviewers | Verified codebase context for a specific task. |
| `<fixme-dir>/decisions.md` | `fixme-task` decision handling | Review handlers and later phases | Persisted user decisions across loops. |

## Session Flow

1. `fixme-session` resolves `<fixme-dir>` with `fixme-tools.cjs root`.
2. `fixme-session` uses `fixme-tickets` for session and ticket operations. It never hardcodes a backend path.
3. `ticket create` creates the ticket folder, ticket frontmatter, and `assets/`, `research/`, `plans/`, and `verifications/` directories.
4. `intake-agent` fills the original report and structured fields, then returns the ticket to the queued pool.
5. `fixme-session` loads project config and prepares the browser when a dev server is configured.
6. For bug-fix sessions, `fixme-session` may run a synchronous investigation before background task dispatch. Investigation output is written under the ticket folder and can also be appended to the ticket.
7. `fixme-session` records `active_task`, `activeParentRunId`, and `activeRunStatusId`, then dispatches `fixme-task` in the background with the returned launch prompt blocks and selected pipeline context.
8. `fixme-task` resolves the workflow, builds a dispatch manifest, transitions ticket phase state at boundaries, dispatches each phase skill, runs review loops, and writes artifact paths into its own context.
9. On background task completion, `fixme-session` clears `active_task` and `activeRunStatusId`, inspects ticket state and task output, runs terminal cleanup, and transitions the ticket to `done`, `failed`, or `skipped`.

## Workflow Phase Flow

Inside `fixme-task`, data moves by artifact path, not in-memory assumptions:

| Producer | Output Marker or File | Consumer |
| --- | --- | --- |
| `fixme-write-product-spec` | `SPEC_PATH: <absolute path>` | `fixme-review-spec`, `fixme-write-technical-spec` |
| `fixme-write-technical-spec` | `SPEC_PATH: <absolute path>` | `fixme-review-spec`, `fixme-write-plan` |
| `fixme-write-plan` | `PLAN_PATH: <absolute path>` | `fixme-review-plan`, `fixme-execute-plan`, `fixme-review-code` |
| `fixme-write-plan` | `CODE_MAP_PATH: <absolute path>` | `fixme-execute-plan`, reviewers, handlers |
| `fixme-execute-plan` | Execution report and changed files | `fixme-review-code`, completion flow |
| `fixme-review-*` | Findings report | Matching `fixme-handle-*` |
| `fixme-handle-*` | `HANDLER_RESULT: ...` plus route scopes | `fixme-task` routing logic |
| `fixme-browser-verify` | Verification report and screenshots | `fixme-session` or final run summary |

If a required artifact marker is missing, `fixme-task` re-dispatches the producer once to emit the missing path. It must not guess from the newest file in a directory.

## Backend Boundary

`fixme-tickets` is the only abstraction `fixme-session` and `fixme-task` use for ticket operations.

| Operation Family | Markdown Backend Command |
| --- | --- |
| Ticket create/list/next/rename/summary/transition | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket ...` |
| Session create/list/summary | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs session ...` |
| Project context detect/load/save | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs context ...` |

The Linear backend has its own skill boundary. Session and task orchestrators should not reach around `fixme-tickets` to call a concrete backend directly.

## Refresh Points

State is re-read from disk after every agent return and before every routing decision:

| Reader | When | Reads | Why |
| --- | --- | --- | --- |
| `fixme-session` | After intake returns | Session file and ticket list | Remove `active_intakes`, find queued work. |
| `fixme-session` | After background task returns or on resume | Session file, ticket list, task output, run status | Clear `active_task` and `activeRunStatusId`, complete or fail the ticket, and broker pending attention prompts before coarse status reporting. |
| `fixme-task` | Before each phase transition | Ticket state through backend | Avoid stale state after compaction or external edits. |
| Review handlers | Before classification | Artifact files, code map, decision log | Validate findings against current evidence. |

This disk-first rule is what keeps the workflow resumable after context compaction.
