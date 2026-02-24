---
phase: 07-integration-hardening
plan: 03
subsystem: orchestration
tags: [git, error-handling, null-safety, skill-orchestrator]

# Dependency graph
requires:
  - phase: 06-fix-agent-state-boundary-alignment
    provides: "SKILL.md failure handler with git revert logic"
provides:
  - "Null-safe base_commit handling in SKILL.md failure handler"
affects: [fixme-skill, fix-agent]

# Tech tracking
tech-stack:
  added: []
  patterns: [null-guard-before-git-commands]

key-files:
  created: []
  modified:
    - ".claude/skills/fixme/SKILL.md"

key-decisions:
  - "Guard skips steps 3-4 (git diff + checkout) and proceeds directly to failed transition -- no partial revert attempted"

patterns-established:
  - "Null-guard pattern: check extracted frontmatter values before using them in shell commands"

requirements-completed: [FIXR-04]

# Metrics
duration: 1min
completed: 2026-02-24
---

# Phase 7 Plan 3: Null-Guard base_commit in Failure Handler Summary

**SKILL.md failure handler skips git revert with user warning when base_commit is null/empty, preventing invalid git commands on fix-agent crash**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-24T01:46:22Z
- **Completed:** 2026-02-24T01:47:16Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added null/empty check on base_commit before git diff and git checkout commands in failure handler
- Null case logs warning to user about manual cleanup and proceeds to failed transition
- Non-null case preserves existing revert behavior unchanged
- Step numbering renumbered from 1-5 to 1-6 to accommodate the new guard step

## Task Commits

Each task was committed atomically:

1. **Task 1: Add null-guard on base_commit in SKILL.md failure handler** - `f8606f1` (fix)

## Files Created/Modified
- `.claude/skills/fixme/SKILL.md` - Added null-guard on base_commit in failure handler (steps 2-6), warning message for missing base_commit

## Decisions Made
- Guard skips steps 3-4 entirely (no partial revert) and proceeds to step 5 (transition to failed) -- attempting partial cleanup with no base_commit reference is unsafe

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- INT-08 gap closed: failure handler degrades gracefully when fix-agent crashes before recording base_commit
- All three Phase 7 plans address independent integration gaps and can be committed separately

## Self-Check: PASSED

- FOUND: .claude/skills/fixme/SKILL.md
- FOUND: .planning/phases/07-integration-hardening/07-03-SUMMARY.md
- FOUND: commit f8606f1

---
*Phase: 07-integration-hardening*
*Completed: 2026-02-24*
