# Fixme

A Claude Code skill that runs as a long-lived orchestrator, accepting a **stream of bug reports** during a session. Each report is ingested into a structured ticket, then sequentially dispatched to implementation subagents that investigate, fix, and verify each bug using Playwright browser automation.

Bugs flow in continuously. Fixes flow out reliably — browser-verified, one atomic commit each.

## How It Works

```text
You (reporting bugs mid-session)
  │
  ▼
/fixme:start  ──►  Orchestrator (lean main loop)
                        │
                        ├─► Intake Agent (background)
                        │     captures report → numbered ticket MD file
                        │
                        ├─► Reproducer Agent
                        │     Playwright → navigate, interact, confirm bug
                        │
                        ├─► Fixer Agent
                        │     read code, find root cause, implement fix
                        │
                        └─► Verifier Agent
                              re-run repro steps, confirm bug is gone
                              → atomic git commit
```

You keep reporting bugs while the system works through the queue. Intake runs in the background so the orchestrator is never interrupted.

## Key Design Decisions

- **Ticket files are the state.** Each bug gets a numbered MD file with YAML frontmatter. Agents read from and write to ticket files directly — the orchestrator only passes file paths, never content. This survives context compaction and serves as a complete audit trail.

- **Lean orchestrator, fresh subagents.** The main loop touches only ticket frontmatter and dispatch logic (~15% context budget). All investigation, fixing, and verification happens in subagents with fresh 200k context windows. This lets the system handle many bugs per session without context blowup.

- **Sequential execution per ticket.** Reproducer → Fixer → Verifier, strictly ordered. No concurrent writes to the same ticket. Architecture supports future parallel dispatch across different tickets.

- **Snapshot-driven browser automation.** Playwright (MCP or CLI) accessibility snapshots (text-based) for decisions, screenshots only for evidence capture. No vision model dependency.

- **Project context auto-discovery.** Reads the target project's `CLAUDE.md` and `package.json` for dev server URL, build commands, and HMR support.

## Architecture

Four layers:

| Layer              | Location     | Role                                                               |
| ------------------ | ------------ | ------------------------------------------------------------------ |
| **Skill Commands** | `commands/`  | Thin entry points (`/fixme:*`). Parse args, reference workflows.   |
| **Workflows**      | `workflows/` | Orchestration logic. Spawn subagents, route on results.            |
| **Agent Roles**    | `agents/`    | Role definitions loaded by subagents at spawn.                     |
| **Ticket State**   | `tickets/`   | File-based state machine. The communication channel between agents.|

Ticket lifecycle: `queued → investigating → fixing → verifying → done/failed`

Each state transition is timestamped with duration tracking.

## Project Structure

```text
.claude/skills/fixme/
├── SKILL.md              # Entry point, sub-command routing
├── scripts/
│   └── fixme-tools.cjs   # State management CLI (ticket, session, context)
├── templates/
│   ├── ticket.md          # Ticket file template
│   └── session.md         # Session summary template
├── references/
│   ├── state-machine.md   # Valid transitions, duration tracking
│   └── project-context-schema.md
└── agents/                # Subagent role definitions (Phase 2+)
```

## Current Status

**Phase 1 (Foundation & Skeleton):** Complete. Skill directory, ticket template, state machine, project context discovery, and tooling are in place.

**Remaining phases:**

| Phase                            | What                                                         | Status      |
| -------------------------------- | ------------------------------------------------------------ | ----------- |
| 2. Intake Pipeline               | Bug reports → structured tickets via background agent        | Not started |
| 3. Investigation & Reproduction  | Playwright-based bug reproduction                            | Not started |
| 4. Fix & Commit                  | Root cause analysis, fix implementation, atomic commits      | Not started |
| 5. Verification & Close          | Browser-verified fixes, rollback on failure, session summary | Not started |

## Inspiration

Architecture modeled after [GSD (Get Shit Done)](https://github.com/get-shit-done/gsd) — a Claude Code skill system for agent orchestration using JS tooling + MD files for agent definitions, templates, and workflows. Fixme is a focused, simpler variant: fewer agent types, simpler state, no research/roadmap phases.

## Requirements

- Claude Code v2.1.3+
- Playwright MCP (`@playwright/mcp`) or Playwright CLI — at least one registered
- Node.js 18+
- No other external dependencies
