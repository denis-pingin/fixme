# Roadmap: Fixme

## Overview

Fixme delivers a streaming bug-fix pipeline for Claude Code: bugs flow in as reports, get structured into tickets, then sequentially investigated, fixed, and browser-verified by subagents -- all while the user keeps working. The build progresses from file/state foundations through intake, investigation, fixing, and finally verification with a summary dashboard, each phase delivering a testable vertical slice.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Skeleton** - Skill directory, ticket template, state machine, project context discovery
- [ ] **Phase 2: Intake Pipeline** - Bug reports become structured ticket files via background agent
- [ ] **Phase 3: Investigation & Reproduction** - Browser-based bug reproduction and codebase investigation
- [ ] **Phase 4: Fix & Commit** - Implement fixes, atomic commits, orchestrator dispatch loop
- [ ] **Phase 5: Verification & Close Loop** - Browser-verified fixes, revert on failure, session summary

## Phase Details

### Phase 1: Foundation & Skeleton
**Goal**: The skill directory exists at ~/.claude/skills/fixme/ with working ticket state management, a structured template, and project context discovery -- everything downstream agents need to operate
**Depends on**: Nothing (first phase)
**Requirements**: SYST-01, SYST-02, SYST-03, SYST-04, STAT-01, STAT-02, BROW-01
**Success Criteria** (what must be TRUE):
  1. Running /fixme (or equivalent command) from any project directory launches the skill without errors
  2. A ticket created from the template contains YAML frontmatter with state, timestamps, and all structured sections
  3. Ticket state transitions (queued -> investigating -> fixing -> verifying -> done/failed) update frontmatter and record timestamps with durations
  4. The skill reads a project's package.json and config files to extract dev server URL, build commands, and HMR support into a usable context object
  5. Ticket files in the working directory survive context compaction -- re-reading them after compaction yields the same state
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- fixme-tools.cjs: state gatekeeper with ticket, session, and context subcommands
- [x] 01-02-PLAN.md -- SKILL.md entry point, ticket/session templates, and reference documentation

### Phase 2: Intake Pipeline
**Goal**: Users can submit bug reports mid-session and they become structured, queued ticket files without interrupting ongoing work
**Depends on**: Phase 1
**Requirements**: INTK-01, INTK-02, INTK-03, INTK-04, INTK-05
**Success Criteria** (what must be TRUE):
  1. User submits a bug description (text + optional screenshot reference) and a numbered ticket MD file appears in the tickets directory
  2. The ticket filename contains a sequential number and a descriptive slug derived from the report (e.g., 001-login-button-not-responding.md)
  3. Intake runs as a background agent -- the orchestrator's main loop continues processing while intake writes the ticket
  4. User can submit a second bug report while an implementation agent is actively working on a previous bug, and both tickets exist correctly in the queue
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md -- fixme-tools.cjs: ticket rename subcommand + queued->failed transition
- [ ] 02-02-PLAN.md -- intake-agent.md: agent instructions for processing bug reports
- [ ] 02-03-PLAN.md -- SKILL.md: intake dispatch flow, /fixme:report, LLM intent detection

### Phase 3: Investigation & Reproduction
**Goal**: The implementation agent can navigate to the app, reproduce the reported bug in a real browser, and investigate the codebase to understand root cause before attempting a fix
**Depends on**: Phase 1, Phase 2
**Requirements**: BROW-02, BROW-04
**Success Criteria** (what must be TRUE):
  1. Given a ticket with a URL and reproduction steps, the implementation agent opens the app in Playwright, follows the steps, and captures a snapshot confirming the bug is present
  2. The implementation agent reads source files and traces code paths relevant to the bug, recording investigation findings in the ticket
  3. The ticket's investigation section contains enough detail (affected files, root cause hypothesis) that a human reviewer could understand the bug without additional context
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Fix & Commit
**Goal**: The implementation agent fixes bugs, creates atomic commits, and the orchestrator dispatches work to subagents while staying lean
**Depends on**: Phase 3
**Requirements**: FIXR-01, FIXR-02, FIXR-03, FIXR-05, STAT-03
**Success Criteria** (what must be TRUE):
  1. After a successful fix, exactly one git commit exists with the ticket reference in the commit message and only the relevant file changes
  2. If the implementation agent cannot fix a bug, the ticket is marked failed with a documented reason, and the orchestrator moves to the next queued bug
  3. The orchestrator dispatches investigation and fixing to subagents -- its own context contains only ticket paths and status summaries, not investigation details or code diffs
  4. The ticket records fix details: files changed, approach taken, and commit hash
  5. When a fix attempt doesn't work, the agent retries with a different approach before giving up (fix-verify loop)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Verification & Close Loop
**Goal**: Every fix is browser-verified before closing, failed verifications trigger rollback, and the user gets a session summary of all work done
**Depends on**: Phase 4
**Requirements**: BROW-03, FIXR-04, STAT-04
**Success Criteria** (what must be TRUE):
  1. After a fix is applied, the implementation agent re-navigates to the app, re-runs the original reproduction steps, and confirms the bug behavior is gone -- recording verification evidence in the ticket
  2. If verification fails, the agent reverts the changed files before retrying or moving to the next bug -- no broken code left behind
  3. At session end, a summary shows: number of bugs fixed, number failed, total time, and per-bug breakdown (title, status, duration)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Skeleton | 2/2 | Complete    | 2026-02-18 |
| 2. Intake Pipeline | 1/3 | In Progress | - |
| 3. Investigation & Reproduction | 0/1 | Not started | - |
| 4. Fix & Commit | 0/2 | Not started | - |
| 5. Verification & Close Loop | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-18*
*Last updated: 2026-02-20 (02-02 complete)*
