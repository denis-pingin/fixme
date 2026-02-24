---
phase: 07-integration-hardening
plan: 01
subsystem: tooling
tags: [state-machine, retry-guard, max-attempts, tdd]

requires:
  - phase: 01-foundation-skeleton
    provides: fixme-tools.cjs ticketTransition function and test infrastructure
provides:
  - max_attempts enforcement in ticketTransition preventing infinite retry loops
affects: [fix-agent, SKILL.md dispatch loop, state-machine]

tech-stack:
  added: []
  patterns: [pre-transition guard pattern in ticketTransition]

key-files:
  created: []
  modified:
    - .claude/skills/fixme/scripts/fixme-tools.cjs
    - .claude/skills/fixme/scripts/fixme-tools.test.cjs

key-decisions:
  - "Guard uses pre-increment check: current_attempt >= max_attempts - 1 rejects before increment happens"
  - "Defaults to max_attempts=3 when field missing from frontmatter for backward compatibility"

patterns-established:
  - "Pre-transition guard: validation logic goes between valid-transition check and reason check in ticketTransition"

requirements-completed: [FIXR-05, STAT-01]

duration: 2min
completed: 2026-02-24
---

# Phase 7 Plan 1: max_attempts Enforcement Summary

**Programmatic retry guard in ticketTransition() rejecting verifying->planning when attempts exhausted, closing INT-06**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T01:46:15Z
- **Completed:** 2026-02-24T01:49:04Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Added 9-line guard in ticketTransition() that rejects verifying->planning when current_attempt >= max_attempts - 1
- 8 new tests covering all boundary cases (allow/reject at various attempt/max combinations)
- Error message includes attempt count and max for agent debugging
- All 36 tests pass (28 existing + 8 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED - Failing tests** - `78f22bb` (test)
2. **Task 2: GREEN - Implementation** - `2e8e443` (feat)

_TDD: No refactor needed -- implementation is minimal and clean._

## Files Created/Modified
- `.claude/skills/fixme/scripts/fixme-tools.cjs` - Added max_attempts guard (9 lines) in ticketTransition between valid-transition check and reason check
- `.claude/skills/fixme/scripts/fixme-tools.test.cjs` - Added 8 tests for max_attempts enforcement (walkToVerifying helper + boundary cases)

## Decisions Made
- Guard uses `current_attempt >= max_attempts - 1` (pre-increment check). Since current_attempt starts at 0 and gets incremented AFTER the guard, this correctly prevents the Nth+1 attempt when max_attempts=N.
- Defaults to `max_attempts || 3` for backward compatibility with tickets created before max_attempts field existed.
- Error message format: `"Retry limit reached: attempt N of M (max_attempts). Transition verifying -> planning denied."` -- includes both values for debugging.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test missing current_attempt override**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Test "rejects retry when current_attempt=1, max_attempts=2" only set max_attempts override but not current_attempt, leaving it at 0. With current_attempt=0 and max_attempts=2, the guard correctly allows the transition (0 < 1), so the test assertion was wrong.
- **Fix:** Added `current_attempt: 1` to the test overrides
- **Files modified:** .claude/skills/fixme/scripts/fixme-tools.test.cjs
- **Verification:** Test now correctly verifies rejection at the boundary
- **Committed in:** 2e8e443 (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test)
**Impact on plan:** Test logic error caught during GREEN phase. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- max_attempts enforcement is active at the tool level
- Fix-agent prose guidance in fix-agent.md still exists as defense-in-depth
- Ready for 07-02 (next integration hardening plan)

---
*Phase: 07-integration-hardening*
*Completed: 2026-02-24*
