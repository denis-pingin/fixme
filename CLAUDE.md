# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Fixme is a suite of Claude Code skills for automated bug fixing and task execution. It has two main systems:

1. **fixme-session** - A long-lived bug fix session orchestrator. Accepts bug reports, creates tickets, and dispatches subagents (investigation, research, planning, implementation, verification) to fix each bug with Playwright browser automation.

2. **fixme-task** - An end-to-end plan-execute-review pipeline. Chains `fixme-write-plan` -> `fixme-review-plan` -> `fixme-handle-plan-review` -> `fixme-execute-plan` -> `fixme-review-code` -> `fixme-handle-code-review` with review loops and decision persistence.

## Commands

### Running Tests

```bash
node ~/.claude/skills/fixme-session/scripts/fixme-tools.test.cjs
```

There is no `package.json` - this is a pure skill repo with no build/lint steps. The only runnable code is `fixme-tools.cjs` (Node.js CLI) and its test file.

### Installing Skills

```bash
./install.sh
```

Copies all `fixme*` skill directories from `.claude/skills/` to `~/.claude/skills/`.

### fixme-tools.cjs CLI

The state management tool used by all agents. Key commands:

```bash
# Session management
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs session create .fixme/sessions [--name <name>]
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs session list .fixme/sessions
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs session summary <session-dir>

# Ticket management
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs ticket create <session-dir> [--slug <slug>]
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs ticket next <session-dir>
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs ticket list <session-dir>
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs ticket transition <ticket.md> <state> [--reason <reason>]

# Project context
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs context detect
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs context load
node ~/.claude/skills/fixme-session/scripts/fixme-tools.cjs context save --data '<json>'
```

## Architecture

### Skill Suite Layout

```
.claude/skills/
  fixme-session/          # Bug fix session orchestrator (main SKILL.md + agents + tooling)
    SKILL.md              # Orchestrator: dispatch loop, session lifecycle, browser setup
    agents/               # Subagent role definitions (investigation-agent, fix-agent, etc.)
    scripts/              # fixme-tools.cjs (state CLI) + tests
    references/           # state-machine.md, project-context-schema.md
    templates/            # ticket.md, session.md templates
    docs/                 # data-flow.md
  fixme-task/             # End-to-end plan-execute-review orchestrator
  fixme-write-plan/       # Writes implementation plans (fresh, plan revision, code revision modes)
  fixme-review-plan/      # Reviews plans for correctness/completeness/feasibility
  fixme-handle-plan-review/  # Triages plan review findings (FIX/NO-FIX/ASK-USER)
  fixme-execute-plan/     # Executes plans step-by-step with verification gates
  fixme-review-code/      # Reviews executed code against plan
  fixme-handle-code-review/  # Triages code review findings (FIX/NO-FIX/ASK-USER)
  fixme-pr-comments/      # (stub) PR comment handling
```

### Key Design Principles

- **Ticket files are the state.** Each bug gets a numbered markdown file with YAML frontmatter. Agents read/write ticket files via `fixme-tools.cjs` - never edit frontmatter directly.
- **Lean orchestrators, fresh subagents.** Orchestrators (fixme-session, fixme-task) are dispatchers only. They never investigate, write code, or read source files. All real work happens in subagents spawned via the Agent tool with fresh context windows.
- **State on disk, not in memory.** After every subagent returns, state is re-read from disk. Context compaction can discard in-memory state at any time.
- **fixme-tools.cjs enforces the state machine.** All ticket state transitions go through the CLI tool which validates against the transition matrix, computes durations, and maintains the append-only transition log.

### Ticket State Machine

```
queued -> investigating -> researching -> planning -> implementing -> verifying -> done
```

Terminal states: `done`, `failed`, `skipped`. Retry path: `verifying -> planning` (max 3 attempts). Each agent owns the transition at the START of its execution. The orchestrator owns terminal transitions (`done`, `failed`, `skipped`) because they require cleanup (git commit/revert).

### fixme-task Pipeline Flow

```
write-plan -> review-plan -> handle-plan-review -> [plan loop max 3x]
  -> execute-plan -> review-code -> handle-code-review -> [outer loop max 2x]
```

Handlers output routing directives (`HANDLER_RESULT: CLEAN|HAS_FIX|HAS_ASK_USER`) that drive the orchestrator's control flow. FIX items loop back to write-plan. ASK-USER items are batched to the user. CLEAN exits the loop.

### Runtime State Locations

- `.fixme/sessions/` - Session directories with ticket folders
- `.fixme/plans/` - Implementation plans (written by fixme-write-plan)
- `.fixme/decisions.md` - Accumulated user decisions across pipeline iterations
- `.fixme/project-context.yaml` - Detected project configuration (dev server, commands)

## Writing Skills

Skills are markdown files with YAML frontmatter (`name`, `description`, optional `allowed-tools`, `argument-hint`). The `SKILL.md` file in each skill directory is the entry point. Agent role definitions go in `agents/` subdirectories.

When modifying skill instructions, remember that the orchestrator skills (fixme-session, fixme-task) must never read source code or do implementation work - they only dispatch and route.
