# Fixme Configuration Schema

## Storage

- **File:** `<fixme-dir>/config.json`
- **Scope:** Per project, shared across all fixme sessions
- **Writer:** `fixme-tools.cjs config ...` commands are the authoritative writer.

Resolve `<fixme-dir>` with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root
```

## Current Shape

```json
{
  "project": {
    "devServer": { "url": "http://localhost:3000", "command": "yarn dev", "hmr": true },
    "install": "yarn install --frozen-lockfile",
    "build": "yarn build",
    "lint": "yarn lint",
    "test": { "command": "yarn test", "runner": "vitest" },
    "framework": "next.js"
  },
  "ticketBackend": "fixme-tickets-md",
  "models": {
    "profile": "quality",
    "runtime": "claude",
    "overrides": { "fixme-execute-plan": "sonnet" }
  },
  "workflows": {
    "standard": {
      "outerMaxCycles": 2,
      "review": { "level": "standard" },
      "phases": [
        {
          "name": "plan",
          "skills": ["fixme-write-plan"],
          "review": {
            "skills": ["fixme-review-plan", "fixme-handle-plan-review"],
            "maxCycles": 3,
            "level": "standard"
          }
        },
        {
          "name": "implement",
          "skills": ["fixme-execute-plan"],
          "review": {
            "skills": ["fixme-review-code", "fixme-handle-code-review"],
            "maxCycles": 3,
            "level": "standard"
          }
        }
      ]
    },
    "bugfix": {
      "outerMaxCycles": 2,
      "phases": [
        { "name": "investigate", "skills": ["fixme-investigate"] },
        { "name": "research", "skills": ["fixme-research"] },
        { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } },
        { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 3 } },
        { "name": "verify", "skills": ["fixme-browser-verify"] }
      ]
    }
  },
  "review": { "level": "standard" },
  "pullRequestComments": { "review": { "level": "standard" } },
  "linear": {
    "teamId": "abc123-team-id",
    "teamName": "Engineering",
    "defaultLabels": ["bug"],
    "defaultProject": "project-id-or-name",
    "defaultPriority": { "value": 3, "label": "Normal" }
  },
  "alerts": {
    "enabled": true,
    "sounds": { "user_input": "Glass", "task_finished": "Hero", "task_failed": "Basso" },
    "players": {}
  }
}
```

Every top-level field is optional unless noted below. Missing standard workflows, review level, alert defaults, and usage defaults are backfilled by `config migrate` or any write through `config set` / `config workflow configure`.

## Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config ensure
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get [key.path]
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set <key.path> '<json-value>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <workflow> --data '<workflow-json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --workflow <workflow> --phase <phase>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --path pullRequestComments
```

`config ensure` and `config migrate` run the same migration path. They create a missing config file, move legacy `pipelines` and `workflowControls` into `workflows`, add missing standard workflows, convert old review filtering fields to `review.level`, add alert defaults, and preserve unknown custom fields.

## Workflows

Workflow names are final names: `standard`, `quick`, `full`, `bugfix`, `product-spec`, `technical-spec`, `plan-only`, and `execute-only`.

Legacy workflow aliases are accepted for compatibility and normalized on write:

| Legacy | Final |
| --- | --- |
| `default` | `standard` |
| `plan` | `plan-only` |
| `execute` | `execute-only` |
| `idea-to-production` | `full` |

Each workflow has:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `outerMaxCycles` | number | No | `2` | Max cross-phase loops before user escalation. |
| `review.level` | string | No | falls back to `review.level` | Workflow review level override. |
| `phases` | array | Yes | - | Ordered phase definitions. |

Each phase in `workflows.<workflowName>.phases` has:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | - | Phase name. Becomes the ticket state while this phase is active. |
| `enabled` | boolean | No | `true` | When `false`, the phase is skipped. |
| `skills` | string[] | Yes | - | Ordered skill names to execute for this phase. |
| `review` | object | No | - | Review loop configuration for the phase. |
| `review.skills` | string[] | Yes if review is enabled | - | Ordered review and handler skill chain. |
| `review.maxCycles` | number | No | `3` | Max internal review-loop iterations before escalation. |
| `review.level` | string | No | workflow/global/builtin fallback | Phase review level override. |

## Review Level

Allowed review levels are exactly `strict`, `standard`, `lenient`, `fast-track`, and `critical`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `review.level` | string | No | Global fallback. Missing means built-in `standard`. |
| `workflows.<workflow>.review.level` | string | No | Workflow-level override. |
| `workflows.<workflow>.phases[n].review.level` | string | No | Phase-level override. |
| `pullRequestComments.review.level` | string | No | PR comment review-level override. |

Resolution priority for workflow phases is phase, workflow, global, then built-in `standard`. PR comment resolution is `pullRequestComments.review.level`, global, then built-in `standard`.

## Models

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `models.profile` | string | No | One of `quality`, `balanced`, `budget`, or `inherit`. |
| `models.runtime` | string | No | Optional CLI default runtime, `claude` or `codex`. |
| `models.overrides.<agent>` | string | No | Claude-only per-agent override, one of `opus`, `sonnet`, `haiku`, or `inherit`. |

## Tickets, Linear, Alerts, And Usage

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `ticketBackend` | string | No | `fixme-tickets-md` or `fixme-tickets-linear`. |
| `linear.teamId` | string | Backend-dependent | Linear team identifier. |
| `linear.teamName` | string | Backend-dependent | Linear team name. |
| `linear.defaultLabels` | string[] | No | Optional labels applied to new Linear tickets. |
| `linear.defaultProject` | string or null | No | Optional default Linear project. |
| `linear.defaultPriority.value` | number | No | Default non-zero issue priority sent by `/fixme-ticket` when no priority signal is detected. |
| `linear.defaultPriority.label` | string | No | Display label for the configured default issue priority. |
| `alerts.enabled` | boolean | No | Enables audible alerts. |
| `alerts.sounds.<event>` | string | No | Sound for `user_input`, `task_finished`, or `task_failed`. |
| `usage.printAfterFinish` | boolean | No | Print compact usage line after skill completion. |
