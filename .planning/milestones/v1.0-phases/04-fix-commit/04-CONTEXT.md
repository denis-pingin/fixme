# Phase 4: Fix & Commit - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The implementation agent fixes bugs, creates atomic commits, and the orchestrator dispatches work to subagents while staying lean. This phase delivers the fixer agent (with internal sub-agents), directory restructuring for ticket-centric layouts, SKILL.md dispatch integration, and the fix-verify loop. Commits are NOT created in this phase — Phase 5 gates commits after browser verification.

</domain>

<decisions>
## Implementation Decisions

### Fixer Agent Architecture

- Fixer is a single Task sub-agent dispatched by the orchestrator (SKILL.md)
- Fixer internally manages 4 sub-agents, each with its own agent MD file:
  1. **Researcher** (`fix-researcher.md`) — explores codebase around root cause, finds relevant files/code paths, produces structured research output
  2. **Planner** (`fix-planner.md`) — reads full ticket + research output, designs fix plan with structured template
  3. **Implementer** (`fix-implementer.md`) — executes code changes per plan, has browser access + code + terminal
  4. **Verifier** (`fix-verifier.md`) — checks constraints (from project context) + plan coverage, loops back to implementer if gaps found
- All 4 sub-agents dispatched as separate Task calls from the fixer
- Fixer orchestrator agent file: `fix-agent.md`
- All agent files live in `.claude/skills/fixme/agents/`

### Fixer Flow

- Sequence: Researcher → Planner → Implementer ↔ Verifier
- Researcher runs ONCE per bug (not re-run on retry attempts)
- Planner re-plans each attempt with feedback from previous failure
- Changes accumulate between attempts — no revert between re-plan attempts
- Previous attempt results feed into next attempt

### Retry & Failure

- All loop limits configurable, default to 3:
  - Verifier → Implementer cycles: 3 (before triggering re-plan)
  - Re-plan attempts: 3 (full planner → implementer → verifier cycles)
- Both timeout AND attempt count enforced — whichever hits first
- On final failure: revert ALL changes via git (git checkout changed files)
- Each attempt's approach + why it failed recorded in ticket (detailed log)

### Verifier Behavior

- Checks constraints from project context (build, lint, tests — dynamic, not hardcoded)
- Runs full test suite to catch regressions, not just related tests
- Checks plan coverage: nothing missed, nothing done incorrectly
- Produces structured report: pass/fail per check with details on failures
- Verification reports persisted as separate files per attempt

### Sub-Agent Models

- **Global decision (applies to ALL phases, retroactive):** All sub-agents inherit the orchestrator's model by default
- Each sub-agent's model is configurable to override the inherited value
- Default model setting in config: `inherit` (meaning use orchestrator's model)
- This replaces any hardcoded model values in existing phases (e.g., Phase 2 intake used `model: sonnet`)

### Commit Discipline

- **No commits in Phase 4** — commit happens after Phase 5 browser verification
- Single atomic commit per bug when verification passes
- Commit message format: `fix: short description [FIXME-NNNN]` (ticket ref at end)
- Commit includes: code changes + ticket updates + all artifacts (plans, research, verifications)
- Pre-commit hooks respected (not bypassed)

### Directory Restructuring (Ticket-Centric)

- **Restructure session layout** from flat folders to per-ticket folders:
  ```
  session/
    NNNN-slug/
      ticket.md
      assets/
        screenshot.png
      research/
        NNNN-research-slug.md
      plans/
        NNNN-plan-slug-1.md
        NNNN-plan-slug-2.md
      verifications/
        NNNN-verify-slug-1.md
  ```
- All artifacts for a ticket co-located in its folder
- This replaces the current flat `assets/` and `tickets/` structure from Phase 1/2
- Restructuring is part of Phase 4 (first plan), not a separate phase
- Affects existing `fixme-tools.cjs` commands and SKILL.md paths

### Orchestrator Dispatch

- Fixer dispatched as Task sub-agent (separate context from orchestrator)
- Orchestrator passes the ticket folder path — fixer reads everything it needs from there
- Bugs processed sequentially (one fixer at a time), not in parallel
- FIFO order (oldest queued ticket first) — already established
- Orchestrator logs dispatch decisions in session file (audit trail)
- Fixer returns structured result: `{status, ticket_path, commit_hash, attempts, duration, summary}`
- Orchestrator reads ticket state from disk after fixer returns (never trusts in-memory)

### Ticket State Updates

- Each stage updates the ticket in real-time (fixing started, research done, plan created, implementation started, verification result)
- Ticket references all artifacts by relative path
- Per-step timing recorded: researcher duration, planner duration, implementer duration, verifier duration
- On failure: detailed per-attempt log in ticket (the last plan file serves as "what might work" hint)

### Claude's Discretion

- Structured template design for research output (sections: affected files, code flow, dependencies, risks, approach candidates)
- Structured template design for plan output (sections: approach, files to modify, step-by-step changes, expected outcomes)
- Structured template design for verification report (sections: constraint checklist, plan coverage, failure details)
- Exact naming convention for artifact files within ticket folders
- Timeout default value
- How fixer orchestrator coordinates the internal sub-agent loop

</decisions>

<specifics>
## Specific Ideas

- The verifier's constraint checks come from project context (Phase 1's context detection) — not hardcoded. Build command, lint command, test command are all discovered dynamically.
- The fixer agent is modeled after the investigation agent pattern: a coordinator that dispatches specialized sub-agents, each with focused instructions.
- "The orchestrator should stay lean" — SKILL.md dispatch loop already follows this pattern. The fixer extension should maintain the same discipline.
- Browser access for the implementer — it can visually check its changes while coding, same as a human developer would.

</specifics>

<deferred>
## Deferred Ideas

- Parallel bug fixing (multiple fixers working on different bugs simultaneously) — future optimization, not v1
- Git worktree isolation per fix — decided against for v1, may reconsider if conflicts become an issue
- Browser verification as commit gate — this is Phase 5's responsibility

</deferred>

---

*Phase: 04-fix-commit*
*Context gathered: 2026-02-21*
