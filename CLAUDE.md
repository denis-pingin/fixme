# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Fixme is a suite of Claude Code skills for automated bug fixing and task execution. It has two main systems:

1. **fixme-session** - A long-lived bug fix session orchestrator. Accepts bug reports, creates tickets, and dispatches fixme-task in the background per ticket. Stays responsive for intake and status queries while tasks execute.

2. **fixme-task** - A config-driven pipeline executor. Reads pipeline definitions from `.fixme/config.json`, executes phases in order, manages review loops within phases, and optionally updates ticket state at phase boundaries.

## Commands

### Running Tests

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
```

There is no `package.json` - this is a pure skill repo with no build/lint steps. The only runnable code is `fixme-tools.cjs` (Node.js CLI) and its test file.

### Installing Skills

```bash
./install.sh
```

Copies all `fixme*` skill directories from `.claude/skills/` to `~/.claude/skills/`.

### fixme-tools.cjs CLI

The state management tool used by ticket backends. Key commands:

```bash
# Session management
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs session create .fixme/sessions [--name <name>]
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs session list .fixme/sessions
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs session summary <session-dir>

# Ticket management
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs ticket create <session-dir> [--slug <slug>]
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs ticket next <session-dir>
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs ticket list <session-dir>
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs ticket transition <ticket.md> <state> [--pipeline <name>] [--reason <reason>]

# Project context
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs context detect
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs context load
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs context save --data '<json>'
```

## Architecture

### Skill Suite Layout

```
.claude/skills/
  fixme-session/            # Session orchestrator (dispatch loop, intake, browser setup)
    SKILL.md                # Orchestrator: background dispatch of fixme-task per ticket
    agents/                 # intake-agent.md, investigation-agent.md
    references/             # config-schema.md
    docs/                   # data-flow.md
  fixme-task/               # Config-driven pipeline executor
  fixme-write-plan/         # Writes implementation plans
  fixme-review-plan/        # Reviews plans for correctness/completeness/feasibility
  fixme-handle-plan-review/ # Triages plan review findings (FIX/NO-FIX/ASK-USER)
  fixme-execute-plan/       # Executes plans step-by-step with verification gates
  fixme-review-code/        # Reviews executed code against plan
  fixme-handle-code-review/ # Triages code review findings (FIX/NO-FIX/ASK-USER)
  fixme-investigate/        # Browser reproduction + root cause analysis (standalone)
  fixme-pr-comments/        # Fetch, analyze, and address unresolved PR review comments (standalone)
  fixme-research/           # Codebase exploration around a known issue (standalone)
  fixme-browser-verify/     # Browser verification after code changes (standalone)
  fixme-tickets/            # Abstract ticket interface (routes to backend)
  fixme-tickets-md/         # Markdown file ticket backend (wraps fixme-tools.cjs)
    scripts/                # fixme-tools.cjs (state CLI) + tests
    references/             # state-machine.md, project-context-schema.md
    templates/              # ticket.md, session.md templates
  fixme-tickets-linear/     # Linear ticket backend (v2 stub)
```

### Key Design Principles

- **Ticket files are the state.** Each bug gets a numbered markdown file with YAML frontmatter. Ticket operations go through the fixme-tickets abstraction which routes to the configured backend.
- **Lean orchestrators, fresh subagents.** Orchestrators (fixme-session, fixme-task) are dispatchers only. They never investigate, write code, or read source files. All real work happens in subagents spawned via the Agent tool with fresh context windows.
- **State on disk, not in memory.** After every subagent returns, state is re-read from disk. Context compaction can discard in-memory state at any time.
- **Dynamic state machine.** The state machine is derived from pipeline config. Phase names ARE ticket states. `fixme-tools.cjs` builds valid transitions from the pipeline definition.
- **Background dispatch.** fixme-session dispatches fixme-task in the background per ticket, staying responsive for new intake and status queries.

### Ticket State Machine

The state machine is derived from the pipeline configuration in `.fixme/config.json`. Given a pipeline with phases `[A, B, C]`:

```
queued -> A -> B -> C -> done
```

Terminal states: `done`, `failed`, `skipped`. Backward transitions (any phase to any earlier phase) allowed with `--reason`. Legacy hardcoded transitions used as fallback when no pipeline is configured.

### fixme-task Pipeline Flow

Config-driven: reads pipeline phases from `.fixme/config.json`. Each phase can have skills and optional review loops:

```
for each phase:
  execute phase skills -> review loop (if configured) -> next phase
```

Handlers output routing directives (`HANDLER_RESULT: CLEAN|HAS_FIX|HAS_ASK_USER`) that drive review loop control flow.

### Runtime State Locations

- `.fixme/sessions/` - Session directories with ticket folders
- `.fixme/config.json` - Pipeline definitions and project settings
- `.fixme/plans/` - Implementation plans (written by fixme-write-plan)
- `.fixme/decisions.md` - Accumulated user decisions across pipeline iterations
- `.fixme/project-context.yaml` - Detected project configuration (fallback)

## Writing Skills

Skills are markdown files with YAML frontmatter (`name`, `description`, optional `allowed-tools`, `argument-hint`). The `SKILL.md` file in each skill directory is the entry point. Agent role definitions go in `agents/` subdirectories.

When modifying skill instructions, remember that the orchestrator skills (fixme-session, fixme-task) must never read source code or do implementation work - they only dispatch and route.
