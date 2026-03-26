# FixMe Configuration Schema

## Storage

- **File:** `.fixme/config.json`
- **Scope:** Per-project (shared across all sessions)

## Schema

```json
{
  "project": {
    "devServer": {
      "url": "http://localhost:3000",
      "command": "yarn dev",
      "hmr": true
    },
    "build": "yarn build",
    "lint": "yarn lint",
    "test": "yarn test"
  },
  "ticketBackend": "fixme-tickets-md",
  "pipelines": {
    "default": [
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
    ],
    "full": [
      { "name": "investigate", "skills": ["fixme-investigate"] },
      { "name": "research", "skills": ["fixme-research"] },
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
      },
      { "name": "verify", "skills": ["fixme-browser-verify"] }
    ],
    "quick": [
      { "name": "plan", "skills": ["fixme-write-plan"] },
      { "name": "implement", "skills": ["fixme-execute-plan"] }
    ]
  }
}
```

## Pipeline Phase Object

Each phase in a pipeline array has these fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Phase name. Becomes the ticket state when this phase is active. Must be unique within the pipeline. |
| `enabled` | boolean | No | `true` | When `false`, the phase is skipped by the executor and excluded from state machine derivation. Allows toggling phases without removing config. |
| `skills` | string[] | Yes | - | Ordered list of skill names to execute for this phase. Run sequentially. |
| `review` | object | No | - | Review loop configuration. When present and enabled, the phase has an internal review loop: execute skills, then run review chain, route on handler result (CLEAN/HAS_FIX/HAS_ASK_USER). FIX loops back to re-execute skills. |
| `review.enabled` | boolean | No | `true` | When `false`, review is skipped even if `review.skills` is configured. |
| `review.skills` | string[] | Yes (if review) | - | Review skill chain. Run sequentially after phase skills complete. |
| `review.maxCycles` | number | No | `3` | Max review loop iterations before escalating to user. |

## State Machine Derivation

The state machine is derived from the pipeline definition. Disabled phases (`"enabled": false`) are excluded. Given a pipeline with enabled phases `[A, B, C]`:

- **Structural states** (always exist): `queued`, `done`, `failed`, `skipped`
- **Phase states**: `A`, `B`, `C` (from enabled phases in the pipeline)

**Valid transitions:**

| From | Valid To |
|------|----------|
| `queued` | `A` (first phase), `skipped`, `failed` |
| `A` | `B` (next phase), `failed` |
| `B` | `C` (next phase), `A` (backward), `failed` |
| `C` (last) | `done`, `A` (backward), `B` (backward), `failed` |
| `done` | _(terminal)_ |
| `failed` | _(terminal)_ |
| `skipped` | _(terminal)_ |

**Rules:**
- Forward: each phase can transition to the next phase only (no skipping)
- Backward: each phase can transition to any earlier phase (for retries)
- Terminal: `failed` is always valid. `done` is only valid from the last phase. `skipped` is only valid from `queued`.
- Backward transitions require `--reason` and increment `current_attempt`

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project` | object | No | Project settings. If absent, auto-detected. |
| `project.devServer.url` | string | No | Dev server base URL |
| `project.devServer.command` | string | No | Shell command to start dev server |
| `project.devServer.hmr` | boolean | No | Whether HMR is supported |
| `project.build` | string | No | Build command |
| `project.lint` | string | No | Lint command |
| `project.test` | string | No | Test command |
| `ticketBackend` | string | No | Ticket backend skill name. Default: `"fixme-tickets-md"` |
| `pipelines` | object | No | Named pipeline definitions. Default pipelines provided if absent. |

## Defaults

If `config.json` doesn't exist or `pipelines` is absent, fixme-task uses the `"default"` pipeline hardcoded in the skill (identical to the `"default"` above).

If `project` is absent, fixme-task reads `.fixme/project-context.yaml` as fallback (backwards compatible).
