# FixMe Configuration Schema

## Storage

- **File:** `<fixme-dir>/config.json`
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
    "test": {
      "command": "yarn test",
      "runner": "vitest"
    },
    "framework": "next.js"
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
    ],
    "product-spec": [
      {
        "name": "product-spec",
        "skills": ["fixme-write-product-spec"],
        "review": {
          "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
          "maxCycles": 3
        }
      }
    ],
    "technical-spec": [
      {
        "name": "technical-spec",
        "skills": ["fixme-write-technical-spec"],
        "review": {
          "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
          "maxCycles": 3
        }
      }
    ],
    "plan": [
      {
        "name": "plan",
        "skills": ["fixme-write-plan"],
        "review": {
          "skills": ["fixme-review-plan", "fixme-handle-plan-review"],
          "maxCycles": 3
        }
      }
    ],
    "execute": [
      {
        "name": "implement",
        "skills": ["fixme-execute-plan"],
        "review": {
          "skills": ["fixme-review-code", "fixme-handle-code-review"],
          "maxCycles": 2
        }
      }
    ],
    "idea-to-production": [
      {
        "name": "product-spec",
        "skills": ["fixme-write-product-spec"],
        "review": {
          "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
          "maxCycles": 3
        }
      },
      {
        "name": "technical-spec",
        "skills": ["fixme-write-technical-spec"],
        "review": {
          "skills": ["fixme-review-spec", "fixme-handle-spec-review"],
          "maxCycles": 3
        }
      },
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
  },
  "linear": {
    "teamId": "abc123-team-id",
    "teamName": "Engineering",
    "defaultLabels": ["bug"],
    "defaultProject": "project-id-or-name"
  },
  "ticketTemplate": {
    "default": "standard",
    "templates": {
      "standard": {
        "sections": [
          { "heading": "Summary", "hint": "Brief description of the issue or feature" },
          { "heading": "Acceptance Criteria", "hint": "What done looks like" }
        ]
      },
      "bug": {
        "sections": [
          { "heading": "Bug Description", "hint": "What's happening" },
          { "heading": "Steps to Reproduce", "hint": "Numbered steps" },
          { "heading": "Expected Behavior", "hint": "What should happen" },
          { "heading": "Actual Behavior", "hint": "What actually happens" }
        ]
      }
    }
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
| `review` | object | No | - | Review loop configuration. When present and enabled, the phase has an internal review loop: execute skills, then run review chain, route on handler result (CLEAN/HAS_FIX/HAS_ASK_USER). FIX loops back to re-execute skills. HAS_ASK_USER triggers on both FIX_UNCLEAR (approach questions) and ASK_USER (validity questions). |
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
| `project` | object | No | Project settings. If absent, auto-detected via `/fixme-config` or `context detect`. |
| `project.devServer.url` | string | No | Dev server base URL |
| `project.devServer.command` | string | No | Shell command to start dev server |
| `project.devServer.hmr` | boolean | No | Whether HMR is supported |
| `project.build` | string | No | Build command |
| `project.lint` | string | No | Lint command |
| `project.test` | string\|object | No | Test command (string) or test config object |
| `project.test.command` | string | No | Test command (when using object form) |
| `project.test.runner` | string | No | Test runner: `vitest`, `jest`, `mocha`, or null |
| `project.framework` | string | No | Detected framework: `next.js`, `nuxt`, `angular`, `svelte`, `vue`, `react` |
| `ticketBackend` | string | No | Ticket backend skill name. Default: `"fixme-tickets-md"` |
| `pipelines` | object | No | Named pipeline definitions. Default pipelines provided if absent. |
| `linear` | object | No | Linear integration settings. Used by `fixme-ticket` skill. |
| `linear.teamId` | string | No | Default Linear team ID. If set, skips team selection prompt. |
| `linear.teamName` | string | No | Default Linear team name. Resolved to team ID via `list_teams` if `teamId` is not set. |
| `linear.defaultLabels` | string[] | No | Label names applied to new tickets by default. Merged with user-detected labels (deduplicated, case-insensitive). User can override during metadata editing. |
| `linear.defaultProject` | string | No | Default project ID or name for new tickets. Used only when user text does not explicitly mention a project. User can override during metadata editing. |
| `ticketTemplate` | object | No | Ticket template configuration. Used by `fixme-ticket` skill. |
| `ticketTemplate.default` | string | No | Name of the default template (must match a key in `ticketTemplate.templates`). |
| `ticketTemplate.templates` | object | No | Named template definitions. Each key is a template name, value is a template object. |
| `ticketTemplate.templates.<name>.sections` | array | Yes (if template) | Ordered list of section objects defining the template structure. |
| `ticketTemplate.templates.<name>.sections[].heading` | string | Yes | Section heading text. |
| `ticketTemplate.templates.<name>.sections[].hint` | string | Yes | Placeholder hint shown when section content is empty. |

## Defaults

If `config.json` doesn't exist or `pipelines` is absent, fixme-task uses the `"default"` pipeline hardcoded in the skill (identical to the `"default"` above).

Standard intent pipelines (`product-spec`, `technical-spec`, `plan`, `execute`, and `idea-to-production`) are also hardcoded in `fixme-task`. Projects may override them in config.

If `project` is absent, run `/fixme-config` to auto-detect and configure project settings.
