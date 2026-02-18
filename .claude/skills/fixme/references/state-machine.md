# Fixme State Machine Reference

This document is the single source of truth for ticket state transitions. Both the orchestrator (SKILL.md) and agents reference this document. The `fixme-tools.cjs ticket transition` command enforces these rules.

## States

| State | Description | Terminal? |
|-------|-------------|-----------|
| `queued` | Ticket created, waiting to be picked up by the dispatch loop | No |
| `investigating` | Subagent is analyzing the bug: reading code, reproducing in browser, forming a root cause hypothesis | No |
| `fixing` | Subagent is implementing a fix based on the investigation findings | No |
| `verifying` | Subagent is verifying the fix works: running tests, checking browser behavior | No |
| `done` | Fix verified successfully. Ticket complete. | Yes |
| `failed` | Ticket could not be resolved. Reason recorded in `failure_reason` field. | Yes |
| `skipped` | Ticket skipped (e.g., duplicate, not reproducible, out of scope). Reason recorded in `failure_reason` field. | Yes |

## Transition Matrix

### Table Format

| From | Valid To States |
|------|-----------------|
| `queued` | `investigating`, `skipped` |
| `investigating` | `fixing`, `skipped`, `failed` |
| `fixing` | `verifying`, `failed` |
| `verifying` | `done`, `investigating` (retry), `failed` |
| `done` | _(none -- terminal)_ |
| `failed` | _(none -- terminal)_ |
| `skipped` | _(none -- terminal)_ |

### Diagram

```
queued -----> investigating -----> fixing -----> verifying -----> done
  |              |                    |              |
  +-> skipped    +-> skipped          +-> failed     +-> investigating (retry)
                 +-> failed                          +-> failed
```

### Happy Path

The normal successful flow is linear:

```
queued -> investigating -> fixing -> verifying -> done
```

### Retry Path

When verification fails but the ticket has remaining attempts:

```
verifying -> investigating (retry, attempt N+1)
```

The subagent starts a new investigation attempt with accumulated context from prior attempts. The ticket's `current_attempt` field is incremented.

## Terminal States

`done`, `failed`, and `skipped` are terminal. No transitions out of these states are allowed. The tool will throw a hard error if you attempt to transition from a terminal state.

If a "done" ticket regresses later, create a **new ticket** referencing the old one via the `related` field. Do not reopen the original.

## Reason Requirements

Certain transitions require a `--reason` flag. The tool will throw an error if the reason is missing.

| Transition | Reason Required? | Example Reason |
|------------|-----------------|----------------|
| `queued -> investigating` | No | |
| `investigating -> fixing` | No | |
| `fixing -> verifying` | No | |
| `verifying -> done` | No | |
| `queued -> skipped` | **Yes** | "Duplicate of #0001" |
| `investigating -> skipped` | **Yes** | "Cannot reproduce" |
| `investigating -> failed` | **Yes** | "No source code access to relevant module" |
| `fixing -> failed` | **Yes** | "Fix requires schema migration, beyond scope" |
| `verifying -> failed` | **Yes** | "Fix introduced new regression, max attempts reached" |
| `verifying -> investigating` | **Yes** | "Verification failed: button still unresponsive after fix" |

## Retry Semantics

- **Trigger:** `verifying -> investigating` transition.
- **Behavior:** Increments `current_attempt` by 1.
- **Bound:** `current_attempt` must be less than `max_attempts` (default 3). If `current_attempt >= max_attempts`, the retry transition is invalid -- the ticket must be transitioned to `failed` instead.
- **Context:** The subagent starts a new `### Attempt N` section in the Investigation section with access to all prior attempts. This accumulated context helps avoid repeating failed approaches.
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
    to: fixing
    timestamp: "2026-02-18T14:40:00Z"
    reason: null
  - from: fixing
    to: verifying
    timestamp: "2026-02-18T14:55:00Z"
    reason: null
  - from: verifying
    to: investigating
    timestamp: "2026-02-18T15:00:00Z"
    reason: "Fix did not resolve the issue -- button still unresponsive"
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
  fixing:
    entered: "2026-02-18T14:40:00Z"
```

- `entered`: ISO timestamp when the ticket entered this state.
- `exited`: ISO timestamp when the ticket left this state. Absent if currently in this state.
- `seconds`: Computed duration. Calculated by `fixme-tools.cjs` on exit from the state.

For states visited multiple times (e.g., `investigating` during retries), the duration is cumulative across all visits. The tool adds to the existing `seconds` value rather than replacing it.

## Enforcement Rules

1. **Hard errors on invalid transitions.** If a transition is not in the matrix, `fixme-tools.cjs` throws an error and makes no changes to the file.

2. **fixme-tools.cjs is the ONLY way to change state.** Agents must never edit ticket frontmatter directly. The tool validates transitions, computes durations, and maintains the transition log atomically.

3. **Reason enforcement.** Transitions to `failed`, `skipped`, or retry (`verifying -> investigating`) require a `--reason` flag. Missing reason throws an error.

4. **Max attempts enforcement.** The `verifying -> investigating` retry transition is only valid when `current_attempt < max_attempts`. Exceeding max attempts requires transitioning to `failed` instead.

5. **Terminal state enforcement.** No transitions out of `done`, `failed`, or `skipped`. Any attempt throws an error.

## Timeout Model

Timeouts are on **agent steps**, not on ticket states:

- Each subagent has a configurable time limit (settable globally and per-project).
- If a subagent exceeds its time limit, the orchestrator receives a timeout signal.
- On timeout: the orchestrator transitions the ticket to `failed` with reason "Agent timeout".
- The next queued ticket is then dispatched (auto-advance).

Tickets themselves have no timeout. A ticket in `investigating` state stays there until the agent finishes or times out. There is no "stale ticket" cleanup.
