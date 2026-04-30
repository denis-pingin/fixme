---
name: fixme-tickets-md
description: "Markdown file ticket backend. Wraps fixme-tools.cjs CLI for ticket and session CRUD operations. Used by fixme-tickets abstraction layer."
disable-model-invocation: true
---

## Fixme Directory

This backend is dispatched by `fixme-tickets`, which passes the resolved `Project root` in the dispatch prompt. Use that as the base for any path. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`). The CLI tool (`fixme-tools.cjs`) auto-resolves the fixme root internally, so paths passed to CLI commands are resolved automatically.

# Fixme Tickets MD - Markdown File Backend

Ticket and session management backed by markdown files with YAML frontmatter. Each ticket is a `.md` file in a session directory. State transitions are enforced by the `fixme-tools.cjs` CLI.

## Tool Path

```
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs
```

## State Machine

See [references/state-machine.md](references/state-machine.md) for the full transition rules, pipeline resolution, retry semantics, and duration tracking.

## Operations

### Ticket Operations

**create** - Create a new ticket in a session

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket create <session-dir> [--slug <slug>] [--max-attempts <n>]
```

Creates a numbered ticket folder with `ticket.md`, plus `assets/`, `research/`, `plans/`, and `verifications/` subdirectories. Auto-increments the ticket number.

**transition** - Change a ticket's state

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket transition <ticket.md> <state> [--reason <reason>] [--pipeline <name>]
```

Validates the transition against the state machine (derived from pipeline config). Records the transition in the frontmatter log. Updates duration tracking. Backward transitions require `--reason` and increment `current_attempt`.

**list** - List all tickets in a session

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket list <session-dir>
```

Returns JSON array of tickets with their number, slug, state, and path.

**next** - Get the next queued ticket

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket next <session-dir>
```

Returns the first ticket in `queued` state, or null if none.

**rename** - Rename a ticket's slug

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket rename <ticket.md> --slug <new-slug>
```

Renames the ticket folder and updates the slug in frontmatter.

**summary** - Get ticket summary

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs ticket summary <ticket.md>
```

Returns ticket metadata and current state.

### Session Operations

**session create** - Create a new session directory

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs session create <base-dir> [--name <name>]
```

Creates the session directory with a `session.md` file from the template. Auto-generates a timestamped name if `--name` is not provided.

**session list** - List all sessions

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs session list <base-dir>
```

Returns JSON array of sessions with name, status, and path.

**session summary** - Get session summary

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs session summary <session-dir>
```

Returns session metadata with ticket counts by state.

### Context Operations

**context detect** - Auto-detect project config

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs context detect
```

Scans the project and outputs a JSON project config object (camelCase keys matching config.json project section).

**context load** - Load saved project config

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs context load
```

Reads `<fixme-dir>/config.json` and returns the project section.

**context save** - Save project config

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs context save --data '<json>'
```

Writes the provided JSON data to the project section of `<fixme-dir>/config.json`, preserving other config keys.

## Output Format

All commands output JSON to stdout. Errors output JSON with an `error` field and exit code 1. Successful operations output JSON with the relevant data fields.

## File Layout

```
<session-dir>/
  session.md                    # Session metadata (YAML frontmatter)
  0001-<slug>/
    ticket.md                   # Ticket file (YAML frontmatter + markdown body)
    assets/                     # Screenshots, logs
    research/                   # Investigation notes
    plans/                      # Implementation plans
    verifications/              # Test results, verification logs
  0002-<slug>/
    ...
```
