# Fixme State Machine Reference

This document is the single source of truth for ticket state transitions. The `fixme-tools.cjs ticket transition` command enforces these rules.

## State Model

The state machine is **derived from the pipeline configuration**. There are no hardcoded phase states. States come from two sources:

### Structural States (always exist)

| State | Description | Terminal? |
|-------|-------------|-----------|
| `queued` | Ticket created, waiting to be picked up | No |
| `done` | Work completed successfully | Yes |
| `failed` | Work could not be completed. Reason in `failure_reason`. | Yes |
| `skipped` | Ticket skipped. Reason in `failure_reason`. | Yes |

### Phase States (from pipeline config)

Each enabled phase in the pipeline definition becomes a valid ticket state. Phases with `"enabled": false` are excluded. For example, the `"full"` pipeline defines phases `[investigate, research, plan, implement, verify]`, so valid phase states are `investigate`, `research`, `plan`, `implement`, `verify`.

Different pipelines have different phase states:
- `"default"`: `plan`, `implement`
- `"full"`: `investigate`, `research`, `plan`, `implement`, `verify`
- `"quick"`: `plan`, `implement`

## Transition Rules

Given a pipeline with enabled phases `[P0, P1, P2, ..., PN]` (phases with `enabled: false` are excluded):

| From | Valid To States | Notes |
|------|-----------------|-------|
| `queued` | `P0`, `skipped`, `failed` | Can only enter at first phase |
| `Pi` (not last) | `P(i+1)`, any `Pj` where j < i, `failed` | Forward one step, backward any |
| `PN` (last) | `done`, any `Pj` where j < N, `failed` | Last phase can complete ticket |
| `done` | _(terminal)_ | |
| `failed` | _(terminal)_ | |
| `skipped` | _(terminal)_ | |

**Key rules:**
- **No forward skipping.** `queued -> P2` is invalid if P0 and P1 exist. Must go through enabled phases in order.
- **Backward transitions allowed.** Any phase can return to any earlier phase (for retries). Backward transitions require `--reason` and increment `current_attempt`.
- **`skipped` only from `queued`.** Mid-work abandonment uses `failed` with a descriptive reason.
- **Review cycles don't change state.** Plan review loops stay in the current phase. The ticket state doesn't change during internal review iterations.

## Pipeline Resolution

When `ticket transition` is called, it resolves the valid transitions in this order:

1. **`--pipeline` flag** on the command: loads the named pipeline from `<fixme-dir>/config.json`, stores the name in ticket frontmatter
2. **`pipeline` field in ticket frontmatter**: loads that pipeline from config
3. **Hardcoded fallback**: uses the legacy transition matrix (backwards compatible with tickets created before this change)

## Example: Default Pipeline

Pipeline: `[plan, implement]`

```
queued -> plan -> implement -> done
  |        |        |
  +-> skip +-> fail +-> plan (backward retry)
  +-> fail          +-> fail
```

## Example: Full Pipeline

Pipeline: `[investigate, research, plan, implement, verify]`

```
queued -> investigate -> research -> plan -> implement -> verify -> done
  |           |            |          |          |           |
  +-> skip    +-> fail     +-> fail   +-> fail   +-> fail    +-> plan (retry)
  +-> fail                 +-> inv.   +-> inv.   +-> inv.    +-> inv. (retry)
                                      +-> res.   +-> res.    +-> res. (retry)
                                                 +-> plan    +-> impl. (retry)
                                                             +-> fail
```

## State Transition Ownership

| Transition | Owner |
|------------|-------|
| `queued -> <first phase>` | fixme-task (at pipeline start) |
| `<phase> -> <next phase>` | fixme-task (at phase boundary) |
| `<phase> -> <earlier phase>` | fixme-task (on review retry) |
| `<last phase> -> done` | fixme-session (after commit) |
| `[any non-terminal] -> failed` | fixme-session (cleanup) |
| `queued -> skipped` | fixme-session (user decision) |
| `queued -> failed` | fixme-session (crash cleanup) |

**Pattern:** fixme-task owns all phase transitions (forward and backward) during pipeline execution. fixme-session owns terminal transitions (`done`, `failed`, `skipped`) because they require cleanup (git commit/revert).

## Reason Requirements

| Transition Type | Reason Required? |
|-----------------|-----------------|
| Forward (next phase) | No |
| Backward (earlier phase) | **Yes** |
| To `failed` | **Yes** |
| To `skipped` | **Yes** |
| To `done` | No |

## Retry Semantics

- **Trigger:** Any backward transition (e.g., `implement -> plan`)
- **Behavior:** Increments `current_attempt` by 1
- **Bound:** `current_attempt` must be less than `max_attempts` (default 3). If at limit, backward transition is denied - ticket must be transitioned to `failed`.
- **Reason:** Required. Should describe what failed (e.g., "Code review found issues: missing error handling")

## Transition Log Format

Every state change is recorded in the `transitions` array in frontmatter (unchanged from before):

```yaml
transitions:
  - from: queued
    to: plan
    timestamp: "2026-03-19T14:35:00Z"
    reason: null
  - from: plan
    to: implement
    timestamp: "2026-03-19T14:45:00Z"
    reason: null
```

## Duration Tracking

Same as before. The `durations` object tracks `entered`, `exited`, `seconds`, and `prior_seconds` (for phases revisited on retry). fixme-tools.cjs handles this automatically.

## Terminal States

`done`, `failed`, and `skipped` are terminal. No transitions out. If a "done" ticket regresses, create a new ticket.

## Enforcement

1. Hard errors on invalid transitions
2. fixme-tools.cjs is the ONLY way to change state
3. Reason enforcement on backward and terminal transitions
4. Max attempts enforcement on backward transitions
5. Terminal state enforcement
