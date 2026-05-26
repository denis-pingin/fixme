# Fixme Configuration Schema

## Storage

- **File:** `<fixme-dir>/config.json`
- **Scope:** Per project, shared across all fixme sessions
- **Writer:** `fixme-tools.cjs config ...` commands are the authoritative writer. `/fixme-config` must use those commands instead of rewriting JSON directly so migrations, validation, and atomic writes stay centralized.

Resolve `<fixme-dir>` with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root
```

## Current Shape

```json
{
  "project": {
    "devServer": {
      "url": "http://localhost:3000",
      "command": "yarn dev",
      "hmr": true
    },
    "install": "yarn install --frozen-lockfile",
    "build": "yarn build",
    "lint": "yarn lint",
    "test": {
      "command": "yarn test",
      "runner": "vitest"
    },
    "framework": "next.js"
  },
  "ticketBackend": "fixme-tickets-md",
  "models": {
    "profile": "quality",
    "runtime": "claude",
    "overrides": {
      "fixme-execute-plan": "sonnet"
    }
  },
  "workflows": {
    "default": {
      "outerMaxCycles": 2,
      "phases": [
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
      ]
    }
  },
  "review": {
    "softness": {
      "default": "default",
      "labels": {
        "strict": 0.0,
        "default": 0.3,
        "lenient": 0.6,
        "tactical": 0.85,
        "panic": 1.0
      },
      "surfaces": {
        "spec-review": "strict",
        "plan-review": "lenient",
        "code-review": "lenient",
        "pr-comments": "lenient"
      },
      "workflows": {
        "default": {
          "default": "default",
          "phases": {
            "implement": "strict"
          }
        }
      }
    }
  },
  "linear": {
    "teamId": "abc123-team-id",
    "teamName": "Engineering",
    "defaultLabels": ["bug"],
    "defaultProject": "project-id-or-name"
  },
  "alerts": {
    "enabled": true,
    "sounds": {
      "user_input": "Glass",
      "task_finished": "Hero",
      "task_failed": "Basso"
    },
    "players": {}
  },
  "ticketTemplate": {
    "default": "standard",
    "templates": {
      "standard": {
        "sections": [
          { "heading": "Summary", "hint": "Brief description of the issue or feature" },
          { "heading": "Acceptance Criteria", "hint": "What done looks like" }
        ]
      }
    }
  }
}
```

Every top-level field is optional unless noted below. Missing standard workflow, review softness, and alert defaults are backfilled by `config migrate` or any write through `config set` / `config workflow configure`.

## Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config ensure
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get [key.path]
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set <key.path> '<json-value>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <workflow> --data '<workflow-json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config softness resolve --workflow <workflow> --phase <phase> --surface <surface>
```

`config ensure` and `config migrate` run the same migration path. They create a missing config file, move legacy `pipelines` and `workflowControls` into `workflows`, add missing standard workflows, add review softness defaults, add alert defaults, and preserve unknown custom fields.

## Project Settings

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `project.devServer.url` | string or null | No | Dev server base URL used by session and browser verification flows. |
| `project.devServer.command` | string or null | No | Shell command used to start the dev server. |
| `project.devServer.hmr` | boolean | No | Whether the dev server supports hot module reload. |
| `project.install` | string or null | No | Dependency install command used before verification baselines. |
| `project.build` | string or null | No | Build command. |
| `project.lint` | string or null | No | Lint command. |
| `project.test` | string, object, or null | No | Test command or structured test config. |
| `project.test.command` | string or null | No | Test command when using object form. |
| `project.test.runner` | string or null | No | Test runner label, for example `vitest`, `jest`, `mocha`, or `node`. |
| `project.framework` | string or null | No | Detected framework label. |

`/fixme-config` updates this section through `context detect`, `context load`, and `context save`.

## Workflows

Each entry under `workflows` is one named workflow. The workflow object owns both the ordered phase list and the workflow-level loop limit.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `workflows.<workflowName>.phases` | array | Yes | - | Ordered list of phase objects for this workflow. |
| `workflows.<workflowName>.outerMaxCycles` | number | No | `2` | Max cross-phase cycles before escalation. This counts blocking plan-required loops, not implement-only repair loops. |

Each phase in `workflows.<workflowName>.phases` has these fields:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | - | Phase name. Becomes the ticket state while this phase is active. Must be unique within the workflow. |
| `enabled` | boolean | No | `true` | When `false`, the phase is skipped and excluded from state-machine derivation. |
| `skills` | string[] | Yes | - | Ordered skill names to execute for this phase. |
| `review` | object | No | - | Review loop configuration for the phase. |
| `review.enabled` | boolean | No | `true` | When `false`, review is skipped even if review skills are configured. |
| `review.skills` | string[] | Yes if review is enabled | - | Ordered review and handler skill chain. |
| `review.maxCycles` | number | No | `3`, or `2` for `implement` | Max internal review-loop iterations before escalation. |

Standard workflows are hardcoded in `fixme-tools.cjs`, `fixme-task`, and `fixme-config`: `default`, `full`, `quick`, `product-spec`, `technical-spec`, `plan`, `execute`, and `idea-to-production`.

Legacy configs with `pipelines.<workflowName>` and `workflowControls.<workflowName>.outerMaxCycles` remain readable. `config migrate` converts them into `workflows.<workflowName>` and removes the legacy keys from the saved file.

## Models

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `models.profile` | string | No | One of `quality`, `balanced`, `budget`, or `inherit`. Missing means `quality`; `inherit` omits model and reasoning controls. |
| `models.runtime` | string | No | Optional CLI default runtime, `claude` or `codex`. Missing means `claude`. |
| `models.overrides.<agent>` | string | No | Claude-only per-agent override, one of `opus`, `sonnet`, `haiku`, or `inherit`. |

Resolve effective settings with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs resolve-model <agent-name> [--runtime claude|codex]
```

Claude dispatch uses short model tags plus agent-specific reasoning effort. Codex dispatch omits model names and passes only the resolved reasoning effort so the user-selected Codex model remains in force.

## Review Softness

Review softness controls how aggressively reviewers and handlers treat marginal findings.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `review.softness.default` | label or float | No | Global fallback. |
| `review.softness.labels.<label>` | float | No | Label-to-float mapping. Supported built-in labels are `strict`, `default`, `lenient`, `tactical`, and `panic`. |
| `review.softness.surfaces.<surface>` | label or float | No | Surface default for `spec-review`, `plan-review`, `code-review`, or `pr-comments`. |
| `review.softness.workflows.<workflow>.default` | label or float | No | Workflow-level override. |
| `review.softness.workflows.<workflow>.phases.<phase>` | label or float | No | Phase-level override. |

Resolution priority is phase, workflow, surface, global, then builtin default.

## Tickets And Linear

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `ticketBackend` | string | No | Ticket backend skill name. Supported values: `fixme-tickets-md`, `fixme-tickets-linear`. Missing means `fixme-tickets-md`. |
| `linear.teamId` | string or null | No | Linear team ID used by `/fixme-ticket` and the Linear backend. |
| `linear.teamName` | string or null | No | Human-readable Linear team name. |
| `linear.defaultLabels` | string[] | No | Optional labels applied to new Linear tickets. Supported by the config schema, but not configured by `/fixme-config`. |
| `linear.defaultProject` | string or null | No | Optional default Linear project. Supported by the config schema, but not configured by `/fixme-config`. |

`/fixme-config` always attempts Linear team discovery because `/fixme-ticket` uses `linear.teamId` and `linear.teamName` even when `ticketBackend` remains `fixme-tickets-md`. If Linear MCP is unavailable and the backend is markdown, the Linear round is skipped with a warning and existing Linear settings are preserved. If the backend is Linear, missing Linear MCP is a hard stop.

## Alerts

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `alerts.enabled` | boolean | No | Enables or silences all audible alerts. Defaults to `true`. |
| `alerts.sounds.user_input` | string | No | Sound played before user-input decision gates. Defaults to `Glass` on macOS-compatible catalogs. |
| `alerts.sounds.task_finished` | string | No | Sound played when a task finishes. Defaults to `Hero`. |
| `alerts.sounds.task_failed` | string | No | Sound played when a task fails. Defaults to `Basso`. |
| `alerts.players` | object | No | Optional platform player overrides. |

List platform sounds with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert --list-sounds
```

## Ticket Templates

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `ticketTemplate.default` | string | No | Name of the default template. |
| `ticketTemplate.templates` | object | No | Named template definitions. |
| `ticketTemplate.templates.<name>.sections` | array | Yes if template is defined | Ordered section objects. |
| `ticketTemplate.templates.<name>.sections[].heading` | string | Yes | Section heading text. |
| `ticketTemplate.templates.<name>.sections[].hint` | string | Yes | Placeholder hint shown when section content is empty. |

## State Machine Derivation

Ticket states are derived from the selected workflow's enabled phases plus structural states:

- Structural states: `queued`, `done`, `failed`, `skipped`
- Phase states: each enabled phase name in workflow order

Forward transitions advance one phase at a time. Backward transitions may go to any earlier phase, require `--reason`, and increment `current_attempt`. `done`, `failed`, and `skipped` are terminal.
