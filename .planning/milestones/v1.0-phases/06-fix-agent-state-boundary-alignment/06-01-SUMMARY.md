---
phase: 06-fix-agent-state-boundary-alignment
plan: 01
subsystem: state-machine
tags: [transitions, yaml, cli, tdd]

# Dependency graph
requires:
  - phase: 01-foundation-skeleton
    provides: "fixme-tools.cjs CLI with YAML parser, ticket CRUD, transition engine"
provides:
  - "9-state transition matrix (queued, investigating, researching, planning, implementing, verifying, done, failed, skipped)"
  - "Retry path verifying->planning with --reason and attempt increment"
  - "Cumulative duration tracking via prior_seconds on state re-entry"
  - "Dead code removal (ticketDir function and switch case)"
affects: [06-02, 06-03, agent-files, fix-agent, fix-researcher, fix-planner, fix-implementer, fix-verifier]

# Tech tracking
tech-stack:
  added: []
  patterns: [prior_seconds cumulative duration tracking, 9-state lifecycle]

key-files:
  created: []
  modified:
    - ".claude/skills/fixme/scripts/fixme-tools.cjs"
    - ".claude/skills/fixme/scripts/fixme-tools.test.cjs"

key-decisions:
  - "prior_seconds field tracks cumulative time when a state is re-entered (not just overwriting)"
  - "hadPriorEntry boolean check ensures prior_seconds: 0 is set even for instant transitions"
  - "Retry path is verifying->planning (not verifying->investigating) -- researcher runs once per bug"

patterns-established:
  - "9-state lifecycle: queued -> investigating -> researching -> planning -> implementing -> verifying -> done"
  - "Cumulative durations: prior_seconds accumulates across re-entries to same state"

requirements-completed: [STAT-01, STAT-02]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 06 Plan 01: State Machine Transition Matrix Summary

**Replaced fixing state with researching/planning/implementing granular states, fixed cumulative durations bug, removed ticketDir dead code -- all TDD with 28 passing tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T23:32:54Z
- **Completed:** 2026-02-23T23:36:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 9-state TRANSITIONS constant replacing the old 7-state matrix (fixing -> researching + planning + implementing)
- Retry path updated from verifying->investigating to verifying->planning with --reason requirement
- Cumulative duration tracking via prior_seconds field preserved across state re-entry
- ticketDir function and switch case removed as dead code
- 8 new tests covering happy path, retry, invalid transitions, failure paths, cumulative durations, dead code removal

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for new state transitions** - `f27fa69` (test)
2. **Task 2: Implement state machine changes and fix all tests** - `a32b45a` (feat)

_TDD: Task 1 = RED (8 failing tests), Task 2 = GREEN (all 28 pass)_

## Files Created/Modified
- `.claude/skills/fixme/scripts/fixme-tools.cjs` - Updated TRANSITIONS constant, requiresReason, cumulative durations, removed ticketDir
- `.claude/skills/fixme/scripts/fixme-tools.test.cjs` - 8 new test cases, flipped ticket dir tests to expect rejection

## Decisions Made
- Used `hadPriorEntry` boolean (checks if `entered` timestamp existed) rather than checking `priorSeconds > 0`, so `prior_seconds: 0` is recorded even for instant transitions
- Retry goes to planning (not investigating) because researcher output is reused across attempts
- Dead code test checks the "Valid:" portion of the error message only, since the unknown subcommand name naturally appears in the error prefix

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed false-positive failure path tests**
- **Found during:** Task 1 (RED phase)
- **Issue:** Failure path tests (researching/planning/implementing -> failed) were passing in RED phase because the walk-to-state calls failed silently, leaving the ticket in `investigating`, and `investigating -> failed` is valid
- **Fix:** Added explicit `assert(r.ok)` checks on each walk step so tests fail for the right reason
- **Files modified:** .claude/skills/fixme/scripts/fixme-tools.test.cjs
- **Verification:** Tests now correctly fail at "Walk to researching should succeed"
- **Committed in:** f27fa69 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed cumulative durations not recording prior_seconds: 0**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Cumulative duration `if (priorSeconds + priorAccumulated > 0)` guard skipped setting `prior_seconds` when prior visit had 0 seconds (instant transitions in tests)
- **Fix:** Changed guard to check `hadPriorEntry` (whether the state was previously visited) instead of whether accumulated time was > 0
- **Files modified:** .claude/skills/fixme/scripts/fixme-tools.cjs
- **Verification:** Cumulative durations test passes with `prior_seconds: 0`
- **Committed in:** a32b45a (Task 2 commit)

**3. [Rule 1 - Bug] Fixed dead code test assertion too strict**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Test asserted `!error.includes('dir')` but the error message "Unknown ticket subcommand: 'dir'" naturally contains 'dir' as the rejected subcommand name
- **Fix:** Changed assertion to extract the "Valid:" portion of the error and check only that list
- **Files modified:** .claude/skills/fixme/scripts/fixme-tools.test.cjs
- **Verification:** Dead code removal test passes
- **Committed in:** a32b45a (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs)
**Impact on plan:** All fixes necessary for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TRANSITIONS constant is the foundation for plans 06-02 (agent MD files) and 06-03 (state machine reference doc)
- All 9 states are available for agent file updates
- Retry path (verifying->planning) ready for fix-agent coordinator updates

## Self-Check: PASSED

- Files: fixme-tools.cjs FOUND, fixme-tools.test.cjs FOUND, 06-01-SUMMARY.md FOUND
- Commits: f27fa69 FOUND (Task 1), a32b45a FOUND (Task 2)

---
*Phase: 06-fix-agent-state-boundary-alignment*
*Completed: 2026-02-23*
