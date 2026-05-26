# Fixme State Machine Reference

This document describes the transition rules enforced by:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket transition <ticket.md> <state> [--pipeline <name>] [--reason <reason>]
```

## State Sources

The markdown backend supports workflow-derived states and a legacy fallback.

### Workflow-Derived States

When a transition includes `--pipeline <name>` or the ticket frontmatter already has `pipeline: <name>`, `fixme-tools.cjs` loads the named workflow from `<fixme-dir>/config.json`.

Resolution order:

1. `workflows.<name>.phases`
2. Legacy `pipelines.<name>` read support
3. No workflow found, fall back to the legacy transition matrix

Enabled phase names become valid states. Phases with `"enabled": false` are skipped.

Standard workflow examples:

| Workflow | Phase States |
| --- | --- |
| `default` | `plan`, `implement` |
| `full` | `investigate`, `research`, `plan`, `implement`, `verify` |
| `quick` | `plan`, `implement` |
| `product-spec` | `product-spec` |
| `technical-spec` | `technical-spec` |
| `execute` | `implement` |
| `idea-to-production` | `product-spec`, `technical-spec`, `plan`, `implement` |

### Structural States

These states are always present:

| State | Description | Terminal? |
| --- | --- | --- |
| `queued` | Ticket created and waiting for work | No |
| `done` | Work completed successfully | Yes |
| `failed` | Work could not be completed. Reason is stored in `failure_reason`. | Yes |
| `skipped` | Ticket intentionally skipped. Reason is stored in `failure_reason`. | Yes |

### Legacy Fallback States

If no workflow can be resolved, the backend uses this historical state chain:

```text
queued -> investigating -> researching -> planning -> implementing -> verifying -> done
```

Legacy fallback exists for old tickets and session flows that have not stored `pipeline` yet.

## Workflow Transition Rules

Given enabled workflow phases `[P0, P1, P2, ..., PN]`:

| From | Valid To States | Notes |
| --- | --- | --- |
| `queued` | `P0`, `skipped`, `failed` | Can enter only the first enabled phase. |
| `Pi` before last | `P(i+1)`, any earlier phase, `failed` | Forward one step or retry backward. |
| `PN` last phase | `done`, any earlier phase, `failed` | Last phase may complete the ticket. |
| `done` | none | Terminal. |
| `failed` | none | Terminal. |
| `skipped` | none | Terminal. |

Rules:

- Forward skipping is invalid.
- Backward transitions are allowed to any earlier phase.
- Backward transitions require `--reason` and increment `current_attempt`.
- `failed` always requires `--reason`.
- `skipped` requires `--reason`.
- `done` does not require a reason.

## Legacy Transition Rules

When no workflow is resolved, valid transitions are:

| From | Valid To |
| --- | --- |
| `queued` | `investigating`, `skipped`, `failed` |
| `investigating` | `researching`, `skipped`, `failed` |
| `researching` | `planning`, `failed` |
| `planning` | `implementing`, `failed` |
| `implementing` | `verifying`, `failed` |
| `verifying` | `done`, `planning`, `failed` |

In legacy mode, `verifying -> planning` is the only backward retry transition. It requires `--reason` and increments `current_attempt`.

## Pipeline Storage

When `ticket transition` receives `--pipeline <name>` and the ticket has no `pipeline` value, the command stores that pipeline name in ticket frontmatter. Later transitions can omit `--pipeline` and will reuse the stored workflow.

The flag is still named `--pipeline` for backward compatibility, even though the current config object is named `workflows`.

## Retry Semantics

| Field | Meaning |
| --- | --- |
| `current_attempt` | Incremented on backward transitions. Defaults to `0`. |
| `max_attempts` | Maximum allowed attempts. Defaults to `3`. |

If a backward transition would exceed `max_attempts`, `ticket transition` rejects it and the ticket must move to `failed` or wait for user intervention.

## Duration Tracking

Every transition updates `durations.<state>`:

- `entered` is set when a state begins.
- `exited` and `seconds` are set when a state ends.
- `prior_seconds` preserves accumulated time for states visited more than once.

## Transition Log

Every transition appends an entry to `transitions[]`:

```yaml
transitions:
  - from: queued
    to: plan
    timestamp: "2026-03-19T14:35:00Z"
    reason: null
  - from: implement
    to: plan
    timestamp: "2026-03-19T15:02:00Z"
    reason: "Code review found a plan-level issue"
```

## Ownership

| Transition | Owner |
| --- | --- |
| `queued -> <first workflow phase>` | `fixme-task` when running with `--ticket`; session pre-investigation may use legacy fallback before pipeline storage. |
| `<phase> -> <next phase>` | `fixme-task` at phase boundaries. |
| `<phase> -> <earlier phase>` | `fixme-task` after handler routing requires a retry. |
| `<last phase> -> done` | `fixme-session` for session tickets; standalone `fixme-task` reports completion without session cleanup. |
| `[any non-terminal] -> failed` | `fixme-session` for cleanup or `fixme-task` for workflow failure reporting through the backend. |
| `queued -> skipped` | `fixme-session`. |

## Enforcement

1. Invalid transitions return a JSON error and exit non-zero.
2. Terminal states have no outgoing transitions.
3. Backward and terminal failure/skip transitions enforce reasons.
4. Retry limits are enforced before the transition is written.
5. Ticket frontmatter is rewritten atomically through `fixme-tools.cjs`; callers should not hand-edit state.
