---
phase: 01-foundation-skeleton
plan: 01
subsystem: infra
tags: [cjs, state-machine, yaml, cli, tickets, sessions, context-detection]

# Dependency graph
requires:
  - phase: none
    provides: first phase, no dependencies
provides:
  - fixme-tools.cjs CJS CLI tool with 10 subcommands
  - ticket create/transition/list/next operations
  - session create/list/summary operations
  - context detect/save/load operations
  - YAML frontmatter parser/serializer for ticket state
  - strict 7-state transition matrix with duration tracking
  - project context auto-detection from package.json, config files, .env
affects: [01-02, 02-intake-pipeline, 03-investigation, 04-fix-commit, 05-verification]

# Tech tracking
tech-stack:
  added: [Node.js CJS (fixme-tools.cjs)]
  patterns: [subcommand routing via process.argv, JSON output by default, YAML frontmatter state, file-per-ticket design]

key-files:
  created:
    - ".claude/skills/fixme/scripts/fixme-tools.cjs"
    - ".claude/skills/fixme/templates/ticket.md"
    - ".claude/skills/fixme/templates/session.md"
  modified: []

key-decisions:
  - "Zero-padded ticket numbers (0001) preserved as strings in YAML to avoid integer parsing"
  - "Inline object serialization for transitions and durations (compact, single-line per entry)"
  - "Session template includes status field for active/completed tracking"
  - "Context detect uses yarn as package manager prefix per user CLAUDE.md preference"
  - "YAML round-trip preserves field ordering from original parse"

patterns-established:
  - "Subcommand routing: fixme-tools.cjs <domain> <action> [args] [--flags]"
  - "All output is JSON to stdout, errors are { error: message } with exit code 1"
  - "Frontmatter parser handles inline objects { key: val }, inline arrays [a, b], nested objects (2 levels)"
  - "State transitions validated against TRANSITIONS matrix before any write"
  - "Duration tracking: entered/exited timestamps + computed seconds per state"

requirements-completed: [STAT-01, STAT-02, SYST-03, SYST-04, BROW-01]

# Metrics
duration: 8min
completed: 2026-02-18
---

# Phase 1 Plan 1: fixme-tools.cjs Summary

**CJS state gatekeeper with 10 subcommands: ticket CRUD + state machine, session lifecycle, project context auto-detection from package.json/config/.env**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-18T22:30:17Z
- **Completed:** 2026-02-18T22:37:58Z
- **Tasks:** 2
- **Files created:** 3 (all at .claude/skills/fixme/)

## Accomplishments
- Built fixme-tools.cjs (1306 lines) as sole state gatekeeper for all Fixme operations
- Implemented strict 7-state transition matrix with hard errors on invalid transitions, reason requirements for failed/skipped/retry
- Duration tracking per state with entered/exited timestamps and computed seconds
- Project context auto-detection from package.json (framework, test runner, scripts), config files (HMR), and .env (PORT)
- YAML frontmatter parser/serializer that round-trips ticket state correctly including nested objects and arrays of objects

## Task Commits

Each task was committed atomically:

1. **Task 1: Build fixme-tools.cjs with ticket and session subcommands** - Files at .claude/skills/fixme/ (external to project repo, no git commit)
2. **Task 2: Add project context subcommands** - Same file extended (context detect/save/load already included in Task 1 implementation)

_Note: All files live at .claude/skills/fixme/ which is outside this project's git repository. Per-task commits are not applicable for external skill files. The SUMMARY.md and state updates are committed as the tracking mechanism._

## Files Created/Modified
- `.claude/skills/fixme/scripts/fixme-tools.cjs` - 1306-line CJS CLI tool with all 10 subcommands (ticket create/transition/list/next, session create/list/summary, context detect/save/load)
- `.claude/skills/fixme/templates/ticket.md` - Ticket template with YAML frontmatter (state, timestamps, transitions, durations) and lifecycle sections
- `.claude/skills/fixme/templates/session.md` - Session manifest template with status tracking fields

## Decisions Made
- Zero-padded ticket numbers (0001, 0002) stored as YAML strings to prevent integer parsing stripping leading zeros
- Inline object format for transitions array entries and duration sub-objects (compact single-line representation)
- Built purpose-specific YAML parser for known schema (not a general YAML parser) -- handles frontmatter, inline objects/arrays, nested objects to 2 levels
- Context detection uses `yarn` prefix for all commands per user's CLAUDE.md preference
- Session template includes `status: active` field for lifecycle tracking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed frontmatter body separator in buildContent**
- **Found during:** Task 1 (ticket transition verification)
- **Issue:** After writing updated frontmatter, the closing `---` delimiter merged with the body content (`---# 0001: Title`) because no newline separator was added
- **Fix:** Added conditional newline separator in `buildContent()` between closing `---` and body content
- **Files modified:** .claude/skills/fixme/scripts/fixme-tools.cjs
- **Verification:** All subsequent transition round-trips parse correctly
- **Committed in:** Part of final file (external to repo)

**2. [Rule 1 - Bug] Fixed zero-padded number parsing**
- **Found during:** Task 1 (ticket create verification)
- **Issue:** `parseScalar` converted `0001` to integer `1`, losing the zero padding needed for ticket filenames
- **Fix:** Modified number regex to only parse integers that don't start with `0` (except `0` itself): `/^-?[1-9]\d*$/`
- **Files modified:** .claude/skills/fixme/scripts/fixme-tools.cjs
- **Verification:** `number: "0001"` preserved through parse/serialize round-trip
- **Committed in:** Part of final file (external to repo)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both were correctness bugs in the YAML parser/serializer. Essential fixes for reliable state management. No scope creep.

## Issues Encountered
- Task 2 (context subcommands) was implemented alongside Task 1 in a single file creation pass, since all subcommands share the same argument parsing, output helpers, and YAML parser infrastructure. The verification for Task 2 was run separately and passed.

## User Setup Required
None - no external service configuration required. The skill files are written to .claude/skills/fixme/ which is a standard Claude Code skill directory.

## Next Phase Readiness
- fixme-tools.cjs is ready for Plan 02 to build SKILL.md entry point, finalize templates, and create reference docs
- All 10 subcommands verified via integration tests covering happy path, failure, skip, retry, invalid transitions, context round-trip
- Templates exist but will be finalized in Plan 02 (ticket.md may need refinement for section markers)

## Self-Check: PASSED

- [x] fixme-tools.cjs exists at .claude/skills/fixme/scripts/ (1306 lines, executable)
- [x] ticket.md template exists at .claude/skills/fixme/templates/
- [x] session.md template exists at .claude/skills/fixme/templates/
- [x] SUMMARY.md created at .planning/phases/01-foundation-skeleton/
- [x] All 10 subcommands respond (ticket create/transition/list/next, session create/list/summary, context detect/save/load)

---
*Phase: 01-foundation-skeleton*
*Completed: 2026-02-18*
