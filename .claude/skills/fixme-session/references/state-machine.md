# Fixme State Machine Reference

This document is the single source of truth for ticket state transitions. Both the orchestrator (SKILL.md) and agents reference this document. The `fixme-tools.cjs ticket transition` command enforces these rules.

## States

| State | Description | Terminal? |
|-------|-------------|-----------|
| `queued` | Ticket created, waiting to be picked up by the dispatch loop | No |
| `investigating` | Investigation agent is analyzing the bug: reading code, reproducing in browser, forming a root cause hypothesis | No |
| `researching` | Fix-researcher is exploring the codebase around the root cause: finding relevant files, tracing code paths, identifying approach candidates | No |
| `planning` | Fix-planner is designing a step-by-step fix plan based on research findings (or re-planning after verification failure) | No |
| `implementing` | Fix-implementer is executing code changes according to the fix plan | No |
| `verifying` | Fix-verifier is checking the implementation: running build/lint/test, checking plan coverage, browser-verifying the bug is gone | No |
| `done` | Fix verified and committed. Ticket complete. | Yes |
| `failed` | Ticket could not be resolved. Reason recorded in `failure_reason` field. | Yes |
| `skipped` | Ticket skipped. Reason recorded in `failure_reason` field. | Yes |

## Transition Matrix

### Table Format

| From | Valid To States |
|------|-----------------|
| `queued` | `investigating`, `skipped`, `failed` |
| `investigating` | `researching`, `skipped`, `failed` |
| `researching` | `planning`, `failed` |
| `planning` | `implementing`, `failed` |
| `implementing` | `verifying`, `failed` |
| `verifying` | `done`, `planning` (retry), `failed` |
| `done` | _(none -- terminal)_ |
| `failed` | _(none -- terminal)_ |
| `skipped` | _(none -- terminal)_ |

### Diagram

```
queued -> investigating -> researching -> planning -> implementing -> verifying -> done
  |           |                |             |             |              |
  +-> skip    +-> skip         +-> fail      +-> fail      +-> fail       +-> planning (retry)
  +-> fail    +-> fail                                                    +-> fail
```

### Happy Path

The normal successful flow is linear:

```
queued -> investigating -> researching -> planning -> implementing -> verifying -> done
```

### Retry Path

When verification fails but the ticket has remaining attempts:

```
verifying -> planning (retry, attempt N+1)
```

The planner starts a new plan informed by the verifier's failure feedback. The ticket's `current_attempt` field is incremented. The cycle then continues: `planning -> implementing -> verifying`.

The researcher is NOT re-dispatched on retry. Research output is reused across all attempts.

## State Transition Ownership

Each agent owns the transition that reflects its own activation. Terminal transitions remain with SKILL.md because they require cleanup actions (git commit, git revert) that span multiple concerns.

| Transition | Owner |
|------------|-------|
| `queued -> investigating` | investigation-agent |
| `investigating -> researching` | fix-researcher |
| `researching -> planning` | fix-planner (first attempt) |
| `verifying -> planning` | fix-planner (retry) |
| `planning -> implementing` | fix-implementer |
| `implementing -> verifying` | fix-verifier |
| `verifying -> done` | SKILL.md (after commit) |
| `[any non-terminal] -> failed` | SKILL.md (cleanup) |
| `investigating -> skipped` | SKILL.md (user decision) |
| `queued -> skipped` | SKILL.md (user decision) |
| `queued -> failed` | SKILL.md (crash cleanup) |

**Pattern:** Sub-agents transition at the BEGINNING of their execution (first action after reading the ticket). If a sub-agent crashes mid-work, the ticket's state accurately reflects where it got stuck. The orchestrator reads the actual state from disk and transitions from that state to `failed`.

## Terminal States

`done`, `failed`, and `skipped` are terminal. No transitions out of these states are allowed. The tool will throw a hard error if you attempt to transition from a terminal state.

If a "done" ticket regresses later, create a **new ticket** referencing the old one via the `related` field. Do not reopen the original.

## Reason Requirements

Certain transitions require a `--reason` flag. The tool will throw an error if the reason is missing.

| Transition | Reason Required? | Example Reason |
|------------|-----------------|----------------|
| `queued -> investigating` | No | |
| `investigating -> researching` | No | |
| `researching -> planning` | No | |
| `planning -> implementing` | No | |
| `implementing -> verifying` | No | |
| `verifying -> done` | No | |
| `queued -> skipped` | **Yes** | "Duplicate of #0001" |
| `queued -> failed` | **Yes** | "Intake agent failed" |
| `investigating -> skipped` | **Yes** | "Cannot reproduce" |
| `investigating -> failed` | **Yes** | "No source code access to relevant module" |
| `researching -> failed` | **Yes** | "Root cause in third-party library, no fix possible" |
| `planning -> failed` | **Yes** | "Fix requires schema migration, beyond scope" |
| `implementing -> failed` | **Yes** | "Implementation conflicts with critical system invariant" |
| `verifying -> failed` | **Yes** | "Fix introduced new regression, max attempts reached" |
| `verifying -> planning` | **Yes** | "Verification failed: button still unresponsive after fix" |

## Retry Semantics

- **Trigger:** `verifying -> planning` transition.
- **Behavior:** Increments `current_attempt` by 1.
- **Bound:** `current_attempt` must be less than `max_attempts` (default 3). If `current_attempt >= max_attempts`, the retry transition is invalid -- the ticket must be transitioned to `failed` instead.
- **Context:** The planner starts a new plan informed by the verifier's failure feedback. The verifier writes detailed findings (what failed, why, what needs to change) to the verification artifact file. The planner reads this feedback to design a different approach.
- **Reason:** Required. Should describe what failed during verification.

## Transition Log Format

Every state change is recorded in the `transitions` array in the ticket's YAML frontmatter:

```yaml
transitions:
  - from: queued
    to: investigating
    timestamp: "2026-02-18T14:35:00Z"
    reason: null
  - from: investigating
    to: researching
    timestamp: "2026-02-18T14:40:00Z"
    reason: null
  - from: researching
    to: planning
    timestamp: "2026-02-18T14:42:00Z"
    reason: null
  - from: planning
    to: implementing
    timestamp: "2026-02-18T14:45:00Z"
    reason: null
  - from: implementing
    to: verifying
    timestamp: "2026-02-18T14:55:00Z"
    reason: null
  - from: verifying
    to: done
    timestamp: "2026-02-18T15:00:00Z"
    reason: null
```

The transition log is append-only. Entries are never removed or modified.

## Duration Tracking

The `durations` object in frontmatter tracks time spent in each state:

```yaml
durations:
  queued:
    entered: "2026-02-18T14:30:00Z"
    exited: "2026-02-18T14:35:00Z"
    seconds: 300
  investigating:
    entered: "2026-02-18T14:35:00Z"
    exited: "2026-02-18T14:40:00Z"
    seconds: 300
  researching:
    entered: "2026-02-18T14:40:00Z"
    exited: "2026-02-18T14:42:00Z"
    seconds: 120
  planning:
    entered: "2026-02-18T14:42:00Z"
    exited: "2026-02-18T14:45:00Z"
    seconds: 180
    prior_seconds: 0
  implementing:
    entered: "2026-02-18T14:45:00Z"
```

- `entered`: ISO timestamp when the ticket entered this state (most recent entry).
- `exited`: ISO timestamp when the ticket left this state. Absent if currently in this state.
- `seconds`: Computed duration for the current/latest visit. Calculated by `fixme-tools.cjs` on exit from the state.
- `prior_seconds`: Cumulative time from previous visits to this state. Present when a state is re-entered (e.g., `planning` on retry). The total time in a state is `seconds + prior_seconds`.

The `planning` state can be visited multiple times on retry (once per attempt). Each re-entry preserves the accumulated time via `prior_seconds`. The `fixme-tools.cjs` tool handles this automatically using a `hadPriorEntry` check -- `prior_seconds: 0` is set even for instant prior transitions.

## Enforcement Rules

1. **Hard errors on invalid transitions.** If a transition is not in the matrix, `fixme-tools.cjs` throws an error and makes no changes to the file.

2. **fixme-tools.cjs is the ONLY way to change state.** Agents must never edit ticket frontmatter directly. The tool validates transitions, computes durations, and maintains the transition log atomically.

3. **Reason enforcement.** Transitions to `failed`, `skipped`, or retry (`verifying -> planning`) require a `--reason` flag. Missing reason throws an error.

4. **Max attempts enforcement.** The `verifying -> planning` retry transition is only valid when `current_attempt < max_attempts`. Exceeding max attempts requires transitioning to `failed` instead.

5. **Terminal state enforcement.** No transitions out of `done`, `failed`, or `skipped`. Any attempt throws an error.

## Timeout Model

Timeouts are on **agent steps**, not on ticket states:

- Each subagent has a configurable time limit (settable globally and per-project).
- If a subagent exceeds its time limit, the orchestrator receives a timeout signal.
- On timeout: the orchestrator transitions the ticket to `failed` with reason "Agent timeout".
- The next queued ticket is then dispatched (auto-advance).

Tickets themselves have no timeout. A ticket in `investigating` state stays there until the agent finishes or times out. There is no "stale ticket" cleanup.
