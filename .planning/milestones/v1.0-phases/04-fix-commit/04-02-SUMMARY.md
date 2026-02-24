---
phase: 04-fix-commit
plan: 02
subsystem: agents
tags: [fix-agent, sub-agents, retry-loop, coordinator, task-dispatch]

# Dependency graph
requires:
  - phase: 04-fix-commit
    provides: "Ticket-centric directory layout, template fields, model inheritance"
  - phase: 03-investigation-reproduction
    provides: "investigation-agent.md pattern for agent MD file convention"
provides:
  - "Fix coordinator agent (fix-agent.md) with two-level retry loop and timeout enforcement"
  - "4 fixer sub-agents: researcher, planner, implementer, verifier"
  - "Structured artifact output to ticket subdirectories (research/, plans/, verifications/)"
affects: [04-03, 05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["coordinator + sub-agent dispatch via Task tool", "two-level retry loop (inner: verifier->implementer, outer: re-plan)", "structured artifact files per ticket subdirectory"]

key-files:
  created:
    - ".claude/skills/fixme/agents/fix-agent.md"
    - ".claude/skills/fixme/agents/fix-researcher.md"
    - ".claude/skills/fixme/agents/fix-planner.md"
    - ".claude/skills/fixme/agents/fix-implementer.md"
    - ".claude/skills/fixme/agents/fix-verifier.md"
  modified: []

key-decisions:
  - "Researcher runs ONCE per bug -- output reused across all retry attempts"
  - "Verifier loads commands dynamically from project context -- never hardcodes build/lint/test"
  - "Implementer has browser access via playwright-cli but does NOT run build/lint/test"
  - "Git revert on final failure uses checkout + clean --exclude=.fixme/ to preserve artifacts"
  - "files_changed captured via git diff --name-only after each implementer cycle"

patterns-established:
  - "Coordinator dispatches sub-agents via Task tool with file paths, reads results from disk"
  - "Two-level retry: inner loop (verifier->implementer, max_verify_cycles) and outer loop (re-plan, max_attempts)"
  - "Timeout enforcement: check elapsed minutes before each sub-agent dispatch"
  - "Artifact naming: NNNN-research.md, NNNN-plan-N.md, NNNN-verify-N-M.md"

requirements-completed: [FIXR-02, FIXR-05, STAT-03]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 4 Plan 02: Fixer Agent System Summary

**5 fixer agent MD files: coordinator with two-level retry loop dispatching researcher, planner, implementer, and verifier sub-agents via Task tool**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T08:38:31Z
- **Completed:** 2026-02-21T08:42:16Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Created fix-agent.md coordinator with sequential sub-agent dispatch, two-level retry loop, timeout enforcement, and git revert on failure
- Created fix-researcher.md for codebase exploration around root cause with structured research output (affected files, code flow, dependencies, risks, approach candidates)
- Created fix-planner.md for step-by-step fix plans per attempt with retry awareness
- Created fix-implementer.md with browser access (playwright-cli), plan execution, and verifier re-cycle handling
- Created fix-verifier.md with dynamic project context loading for build/lint/test, plan coverage checking, and PASS/FAIL verdicts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fix-agent.md coordinator** - `c881940` (feat)
2. **Task 2: Create 4 fixer sub-agent files** - `67a6f4d` (feat)

## Files Created/Modified
- `.claude/skills/fixme/agents/fix-agent.md` - Coordinator: dispatches researcher->planner->implementer<->verifier with retry, timeout, revert
- `.claude/skills/fixme/agents/fix-researcher.md` - Explores codebase around root cause, writes to research/ dir
- `.claude/skills/fixme/agents/fix-planner.md` - Designs step-by-step fix plans, writes to plans/ dir
- `.claude/skills/fixme/agents/fix-implementer.md` - Executes code changes per plan, has browser access
- `.claude/skills/fixme/agents/fix-verifier.md` - Runs constraints from project context, checks plan coverage, writes to verifications/ dir

## Decisions Made
- Researcher runs ONCE per bug and output is reused across all retry attempts (not re-run on re-plan)
- Verifier loads build/lint/test commands dynamically from project context via fixme-tools.cjs context load -- never hardcodes yarn/npm commands
- Implementer has browser access via playwright-cli for visual bugs but explicitly prohibited from running build/lint/test (verifier's job)
- Git revert on final failure uses git checkout + git clean --exclude=.fixme/ to preserve all artifact files
- files_changed captured via git diff --name-only <base_commit> HEAD after each implementer cycle and written to ticket frontmatter
- Coordinator returns structured result object {status, ticket_path, commit_hash: null, attempts, duration, summary} -- commit_hash left null for Phase 5

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 fixer agent files ready for SKILL.md dispatch integration (04-03)
- Agent files follow established convention from investigation-agent.md
- All use model: inherit for orchestrator model inheritance
- fix-agent.md returns structured result expected by SKILL.md dispatch loop

## Self-Check: PASSED

All 5 agent files verified present. Both task commits (c881940, 67a6f4d) found in git log.

---
*Phase: 04-fix-commit*
*Completed: 2026-02-21*
