# Fixme — Streaming Bug Fix System for Claude Code

## What This Is

A Claude Code skill system (`/fixme:*`) that runs as a long-lived orchestrator, accepting a stream of bug reports from the user during a session. Each report is ingested into a structured ticket file, then sequentially dispatched to implementation subagents that investigate, fix, and verify each bug using Playwright browser automation. The system lives at `~/.claude/fixme/` and works with any web application.

## Core Value

Bugs flow in continuously and get fixed reliably with browser-verified results — without the user needing to manage the queue, context, or verification process.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Orchestrator main loop that accepts bug reports mid-work
- [ ] Background intake agent that captures reports to numbered MD ticket files
- [ ] Sequential implementation agent dispatch (ordered by arrival)
- [ ] Implementation agent cycle: investigate → fix → verify → commit
- [ ] Playwright browser automation for reproduction and verification
- [ ] Project context auto-discovery from CLAUDE.md (URLs, build commands, dev server)
- [ ] Hot-reload awareness — skip manual refresh when project supports HMR
- [ ] Detailed ticket state tracking: queued → investigating → fixing → verifying → done/failed
- [ ] Timestamps per state transition with duration tracking
- [ ] Investigation report, fix details, verification evidence per ticket
- [ ] Commit hash and link recorded per completed fix
- [ ] Summary of changes and decisions per ticket
- [ ] Structured ticket MD template for consistent agent output
- [ ] Failure handling: mark failed, capture reason, move to next bug
- [ ] Architecture supports future parallel implementation agents
- [ ] One git commit per fixed bug
- [ ] Full build/restart cycle support (agent can run build commands)

### Out of Scope

- Parallel implementation agents — design for it, build sequential only
- Integration with external issue trackers (Jira, Linear, GitHub Issues)
- Automated bug detection / monitoring — this is human-reported bugs only
- Cross-browser testing — single browser instance per agent
- CI/CD integration — local development only for now

## Context

**Inspiration:** The GSD (Get Shit Done) system at `~/.claude/get-shit-done/` provides the architectural reference. GSD uses:
- JS tooling (`bin/gsd-tools.cjs`) for init, commits, config management
- MD files for agent definitions (role, instructions, tools available)
- Template files for structured output
- Workflow MD files for orchestrator instructions (skill definitions)
- Config JSON for preferences and state

Fixme follows this pattern but is much simpler — fewer agent types, simpler state management, no research/roadmap phases. The key agents are:
1. **Orchestrator** — main loop, manages queue, dispatches agents
2. **Intake agent** — captures incoming bug report to ticket file
3. **Implementation agent** — investigates, fixes, verifies a single bug

**Browser automation:** Uses Playwright MCP tools (browser_snapshot, browser_click, browser_navigate, browser_take_screenshot, etc.) for both reproduction and verification. Agents interact with the app the same way a human tester would.

**Project context:** The skill reads the target project's CLAUDE.md to discover:
- Dev server URL and how to start it
- Build commands
- Hot-reload capabilities (if HMR is supported, agents skip page refresh after code changes)
- Project structure and conventions

**Token/context optimization is critical.** The main orchestrator loop is long-running. Minimize what stays in main context — push all heavy work to subagents. Ticket files serve as persistent state that survives context compaction.

## Constraints

- **Platform**: Claude Code skill system — must follow skill file conventions (MD-based, Skill tool invocation)
- **Installation**: Global at `~/.claude/fixme/`, not project-specific
- **Agent model**: Use Claude Code's Task tool for subagent dispatch — constrained to available subagent types
- **Browser**: Playwright MCP — single browser instance per agent, must manage tabs
- **Context budget**: Main loop must stay lean; all investigation/fix/verify work happens in subagents
- **Sequential execution**: v1 processes bugs one at a time (architecture allows future parallelism)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Model after GSD architecture | Proven pattern for Claude Code skill systems with agent orchestration | — Pending |
| Ticket files as persistent state | Survives context compaction, provides audit trail, human-readable | — Pending |
| Background intake + sequential dispatch | Keeps main loop responsive while ensuring orderly execution | — Pending |
| Playwright MCP for verification | Built into Claude Code, no external dependencies needed | — Pending |
| Project context from CLAUDE.md | Standard Claude Code convention, no extra config needed | — Pending |
| Detailed state tracking with timestamps | Enables audit trail, performance analysis, user oversight | — Pending |
| Hot-reload awareness | Saves tokens and time by skipping unnecessary refresh/rebuild commands | — Pending |

---
*Last updated: 2026-02-18 after initialization*
