---
name: fixme-tools
description: Shared fixme runtime CLI package. Provides fixme-tools.cjs for fixme root resolution, config schema migration/writes, project context commands, agent runtime resolution, Codex skill and agent installation, markdown ticket/session state operations, and dynamic workflow state-machine helpers.
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
- Resolve configured agent runtime settings
- Install Claude and Codex-adapted Fixme skill copies under `~/.claude/skills` and `~/.codex/skills`
- Register Fixme agents in Codex `config.toml`
- Enforce markdown ticket and session state transitions for `fixme-tickets-md`
- Build dynamic state transitions from workflow config
- Resolve workflow pipeline selection from eligible user and artifact candidates
- Record dispatched-agent liveness under `<fixme-dir>/runs/<status_id>/status.json`
- Save standalone task briefs and maintain low-level resumable task state
- Record usage start and finish events with pending state, runtime counter extraction, and append-only project/global usage JSONL
- Aggregate token usage reports from project and global usage JSONL

## Config Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get [key.path]
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set <key.path> '<json-value>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <workflow> --data '<json-object>'
```

`config migrate` creates missing config, migrates legacy `pipelines` plus `workflowControls` into unified `workflows`, backfills standard workflows, and preserves custom workflows and unknown keys. Workflow writes must use `config workflow configure` so phase shapes and cycle limits are validated before JSON is saved.

## Codex Install Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs claude-skills install --skills-src <skills-dir> --claude-dir ~/.claude
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs codex-skills install --skills-src <skills-dir> --codex-dir ~/.codex
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs codex-agents install --agents-src <agents-dir> --codex-dir ~/.codex
```

`claude-skills install` copies source `fixme*` skills into `~/.claude/skills`, injects generated usage tracking instructions into installed `SKILL.md` entrypoints, removes stale Fixme skill copies, and excludes `fixme-tickets-md/scripts`.

`codex-skills install` copies source `fixme*` skills into `~/.codex/skills`, rewrites `.claude` paths to `.codex`, prepends a Codex runtime adapter to each installed `SKILL.md`, removes stale Fixme skill copies, and excludes `fixme-tickets-md/scripts`.

`codex-agents install` generates `~/.codex/agents/fixme-*.toml`, copies converted `fixme-*.md` agent files, removes stale Fixme agent files, and updates `~/.codex/config.toml` with `[agents.fixme-*]` tables that point at absolute `config_file` paths. Generated Codex agents set `model_reasoning_effort` but do not pin a model. It deliberately does not emit `[[agents]]`.

## Usage Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage start --skill <skill-name> --runtime claude
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage finish --invocation-id <id> --outcome complete
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage report --scope project
```

`usage start` creates pending invocation state. `usage finish` extracts runtime counters when available, finalizes one immutable event, and appends it to both project and global usage JSONL. `usage report` reads those JSONL files and returns token-only totals, unmeasured-row counts, warning summaries, by-skill breakdowns, and pipeline totals.

## Run Liveness Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run start --fixme-dir <absolute-fixme-dir> --agent <agent-name>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run ping --fixme-dir <absolute-fixme-dir> --status-id <status-id> --state <running|waiting|blocked|completed|failed> --checkpoint <dispatched|started|working|waiting|finalizing|done> --current-command <string|null>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run status --fixme-dir <absolute-fixme-dir> --status-id <status-id>
```

`run start` creates `<fixme-dir>/runs/<status_id>/status.json` with `state=running`, `checkpoint=dispatched`, and `current_command=null`. `run ping` atomically updates that same JSON file. `run status` reads the current JSON file. Liveness is independent of usage tracking; it works even when usage IDs are unavailable.

## Task Resume Commands

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs pipeline resolve --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --ticket <ticket.md|ticket-folder> --pipeline-resolution '<pipeline-resolution-json>' --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task init --task <task.md> --pipeline-resolution '<pipeline-resolution-json>' --project-root <project-root>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task checkpoint --state <task-state.json> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task attach-artifact --task <FIXME-N|task.md|state.json|ticket.md|ticket-folder> --data '<json-object>'
```

`pipeline resolve` selects one pipeline from eligible user/artifact candidates and returns a camelCase `pipelineResolution` object. Assistant-authored candidates are ignored. `task save` creates a standalone task brief at `<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.md`, creates its sibling `.state.json`, and returns `taskRef`, `taskPath`, and `statePath`. `task save` rejects skeletal inputs that are not self-contained handoffs with concrete approach, behavior, scope, and planning notes. `task init` creates resumable state for an existing saved task or ticket. `task checkpoint` atomically merges allowed camelCase JSON state fields. `task resolve` converts a user-facing ref or path into canonical `taskPath`, `ticketPath`, and `statePath` values. `task attach-artifact` indexes a generated preparation artifact on the resolved task markdown under `Preparation Artifacts` and mirrors it into task state as `artifacts.preparationArtifacts`.

## Ownership

This skill owns the CLI. Backend skills may call it, but the CLI is not owned by any ticket backend.

All commands output JSON to stdout. Errors output JSON with an `error` field and exit code 1.
