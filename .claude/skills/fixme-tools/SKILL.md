---
name: fixme-tools
description: Shared fixme runtime CLI package. Provides fixme-tools.cjs for fixme root resolution, config schema migration/writes, project context commands, model resolution, markdown ticket/session state operations, and dynamic workflow state-machine helpers.
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
- Resolve configured agent models
- Enforce markdown ticket and session state transitions for `fixme-tickets-md`
- Build dynamic state transitions from workflow config

## Config Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get [key.path]
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set <key.path> '<json-value>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <workflow> --data '<json-object>'
```

`config migrate` creates missing config, migrates legacy `pipelines` plus `workflowControls` into unified `workflows`, backfills standard workflows, and preserves custom workflows and unknown keys. Workflow writes must use `config workflow configure` so phase shapes and cycle limits are validated before JSON is saved.

## Ownership

This skill owns the CLI. Backend skills may call it, but the CLI is not owned by any ticket backend.

All commands output JSON to stdout. Errors output JSON with an `error` field and exit code 1.
