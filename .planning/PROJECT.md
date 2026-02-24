# Fixme — Streaming Bug Fix System for Claude Code

## What This Is

A Claude Code skill system (`/fixme:*`) that runs as a long-lived orchestrator, accepting a stream of bug reports during a session. Each report is ingested into a structured ticket file, then sequentially dispatched to implementation subagents that investigate, fix, and verify each bug using Playwright browser automation. The system lives at `~/.claude/fixme/` and works with any web application. v1.0 delivers the complete pipeline: intake → investigate → fix → verify → commit → done.

## Core Value

Bugs flow in continuously and get fixed reliably with browser-verified results — without the user needing to manage the queue, context, or verification process.

## Requirements

### Validated

- ✓ Orchestrator main loop that accepts bug reports mid-work — v1.0
- ✓ Background intake agent that captures reports to numbered MD ticket files — v1.0
- ✓ Sequential implementation agent dispatch (ordered by arrival) — v1.0
- ✓ Implementation agent cycle: investigate → fix → verify → commit — v1.0
- ✓ Playwright browser automation for reproduction and verification — v1.0
- ✓ Project context auto-discovery from CLAUDE.md (URLs, build commands, dev server) — v1.0
- ✓ Detailed ticket state tracking: queued → investigating → researching → planning → implementing → verifying → done/failed — v1.0
- ✓ Timestamps per state transition with cumulative duration tracking — v1.0
- ✓ Investigation report, fix details, verification evidence per ticket — v1.0
- ✓ Structured ticket MD template for consistent agent output — v1.0
- ✓ Failure handling: mark failed, capture reason, move to next bug — v1.0
- ✓ Architecture supports future parallel implementation agents — v1.0
- ✓ One atomic git commit per fixed bug — v1.0
- ✓ Fix-verify retry loop with max_attempts enforcement — v1.0
- ✓ Targeted git revert on failure with crash safety guards — v1.0
- ✓ Session summary dashboard (fixed/failed/time/per-bug breakdown) — v1.0
- ✓ Ticket files survive context compaction (disk-persisted state) — v1.0

### Active

- [ ] Hot-reload awareness — skip manual refresh when project supports HMR
- [ ] Parallel implementation agents (v1 designed for it, v2 builds it)
- [ ] Priority queue override (urgent bugs jump FIFO)
- [ ] Duplicate report detection
- [ ] Visual before/after screenshots
- [ ] Test suite regression check after fix
- [ ] Detailed investigation report export

### Out of Scope

- Integration with external issue trackers (Jira, Linear, GitHub Issues) — massive scope increase, marginal value
- Automated bug detection / monitoring — different problem domain, human-reported bugs only
- Cross-browser testing — single Chromium instance sufficient
- CI/CD integration — local development only
- Autonomous bug prioritization — AI doesn't know business context
- Full visual regression suite — targeted verification only

## Context

**Shipped v1.0** with 4,319 LOC across 14 files (CJS + MD).
Tech stack: Node.js CLI (fixme-tools.cjs), Markdown agent definitions, YAML frontmatter state.
Architecture: SKILL.md orchestrator → background intake-agent → sequential fix pipeline (investigation-agent → fix-agent → fix-researcher/planner/implementer/verifier).
9-state lifecycle with clear ownership: agents own their state transitions (Phase 0 pattern), orchestrator owns only terminal transitions (done/failed).
11 integration gaps found and closed through 3 hardening phases (6, 7, 8).
2 low-severity tech debt items carried forward (active_intakes atomicity, sessionCreate fallback).

## Constraints

- **Platform**: Claude Code skill system — must follow skill file conventions (MD-based, Skill tool invocation)
- **Installation**: Global at `~/.claude/fixme/`, not project-specific
- **Agent model**: Use Claude Code's Task tool for subagent dispatch — constrained to available subagent types
- **Browser**: Playwright CLI only (MCP tools explicitly forbidden) — single browser instance per agent
- **Context budget**: Main loop must stay lean; all investigation/fix/verify work happens in subagents
- **Sequential execution**: v1 processes bugs one at a time (architecture allows future parallelism)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Model after GSD architecture | Proven pattern for Claude Code skill systems with agent orchestration | ✓ Good — consistent structure, reusable patterns |
| Ticket files as persistent state | Survives context compaction, provides audit trail, human-readable | ✓ Good — critical for long-running sessions |
| Background intake + sequential dispatch | Keeps main loop responsive while ensuring orderly execution | ✓ Good — streaming UX works well |
| Playwright CLI for verification | Built into Claude Code, no external dependencies needed | ✓ Good — MCP tools explicitly forbidden for reliability |
| Project context from CLAUDE.md | Standard Claude Code convention, no extra config needed | ✓ Good — zero-config for users |
| Detailed state tracking with timestamps | Enables audit trail, performance analysis, user oversight | ✓ Good — cumulative durations across retries |
| Ticket-centric directory layout | Per-ticket folders with assets/, research/, plans/, verifications/ | ✓ Good — clean artifact organization |
| Model inheritance (no hardcoded models) | Agents use model: inherit, dispatch has no model values | ✓ Good — flexible, user-controlled |
| 9-state lifecycle (splitting fixing into researching/planning/implementing) | Clear sub-agent ownership, enables targeted retry | ✓ Good — Phase 0 pattern eliminates ownership ambiguity |
| Agents own state transitions (Phase 0 pattern) | Each sub-agent claims its state on entry | ✓ Good — eliminated duplicate transitions (INT-01) |
| fix-agent owns zero transitions | All transitions delegated to sub-agents | ✓ Good — coordinator stays stateless |
| Retry path: verifying→planning (not verifying→investigating) | Researcher runs once per bug, not per retry attempt | ✓ Good — saves tokens, research is reusable |
| Tool-level max_attempts enforcement | fixme-tools.cjs rejects transition when exhausted | ✓ Good — can't be bypassed by agent prose |
| Sole writer pattern for Fix section | fix-agent writes structured bullets, sub-agents write artifact files only | ✓ Good — no duplicate entries |

---

_Last updated: 2026-02-24 after v1.0 milestone_
