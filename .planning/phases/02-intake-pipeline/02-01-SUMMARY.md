---
phase: 02-intake-pipeline
plan: 01
subsystem: infra
tags: [cjs, state-machine, ticket-rename, slug-sanitization, atomic-rename]

# Dependency graph
requires:
  - phase: 01-foundation-skeleton
    provides: fixme-tools.cjs with ticket CRUD, session lifecycle, YAML frontmatter parser/serializer
provides:
  - ticket rename subcommand with slug sanitization and atomic file rename
  - queued->failed transition for intake failure cleanup
  - updated state-machine.md with new transition documentation
affects: [02-02, 02-03, 03-investigation, 04-fix-commit]

# Tech tracking
tech-stack:
  added: []
  patterns: [slug sanitization (lowercase, a-z0-9 hyphens, max 60 chars), atomic file rename via fs.renameSync]

key-files:
  created:
    - "~/.claude/skills/fixme/scripts/fixme-tools.test.cjs"
  modified:
    - "~/.claude/skills/fixme/scripts/fixme-tools.cjs"
    - "~/.claude/skills/fixme/references/state-machine.md"

key-decisions:
  - "Slug sanitization normalizes invalid input (strip special chars, collapse hyphens, truncate) rather than rejecting it"
  - "ticketRename writes updated content then renames file (write-first for atomicity on same filesystem)"
  - "queued->failed requires --reason flag consistent with all other failed transitions"
  - "Added inline object parsing ({}) to YAML parser to fix durations: {} roundtrip"

patterns-established:
  - "Slug sanitization: lowercase, replace non-alphanumeric with hyphens, collapse, trim, max 60 chars"
  - "ticket rename returns { oldPath, newPath, oldSlug, newSlug, number, title } for caller path tracking"

requirements-completed: [INTK-01, INTK-02, INTK-04]

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 2 Plan 1: ticket rename + queued->failed Summary

**ticket rename subcommand with slug sanitization and atomic file rename, plus queued->failed transition for intake agent failure cleanup**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T20:14:39Z
- **Completed:** 2026-02-20T20:18:49Z
- **Tasks:** 2
- **Files modified:** 3 (all at ~/.claude/skills/fixme/)

## Accomplishments
- Built `ticketRename` function: reads ticket, sanitizes slug, updates frontmatter (slug + updated timestamp), updates body heading, writes content, atomically renames file via `fs.renameSync`
- Slug sanitization handles edge cases: special characters, uppercase, repeated hyphens, leading/trailing hyphens, max 60 char truncation, empty-after-sanitization error
- Added `queued -> failed` transition to TRANSITIONS matrix for intake agent failure cleanup
- Updated state-machine.md with new transition in matrix table, diagram, and reason requirements table
- 8 test cases covering all rename scenarios and transition edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: ticket rename subcommand** - Files at ~/.claude/skills/fixme/ (external to project repo)
2. **Task 2: queued->failed transition and state-machine.md update** - Same external files

_Note: All files live at ~/.claude/skills/fixme/ which is outside this project's git repository. Per-task commits are not applicable for external skill files. The SUMMARY.md and state updates are committed as the tracking mechanism._

## Files Created/Modified
- `~/.claude/skills/fixme/scripts/fixme-tools.cjs` - Added ticketRename function (~60 lines), added 'rename' to subcommand router, added 'failed' to TRANSITIONS['queued'], fixed inline object parsing for empty {} values
- `~/.claude/skills/fixme/scripts/fixme-tools.test.cjs` - 8 test cases (6 rename, 2 transition) using temp directories and fixture ticket files
- `~/.claude/skills/fixme/references/state-machine.md` - Added queued->failed to transition matrix, diagram, and reason requirements table

## Decisions Made
- Slug sanitization normalizes rather than rejects: `"Hello World!!!"` becomes `"hello-world"` instead of erroring. This is more resilient to LLM-generated slugs.
- ticketRename checks `typeof newSlug !== 'string'` to guard against arg parser edge cases where `--slug` value looks like a flag
- Write-then-rename ordering: updated content is written to the original path first, then `fs.renameSync` moves the file. Both operations are on the same filesystem.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed inline object parsing for empty {} values**
- **Found during:** Task 2 (queued->failed transition test)
- **Issue:** `durations: {}` in ticket frontmatter was parsed as string `"{}"` instead of empty object, causing `Cannot create property 'failed' on string '{}'` when ticketTransition tried to set duration fields
- **Fix:** Added inline object detection (`valueStr.startsWith('{')`) to `parseYamlLines` alongside existing inline array detection
- **Files modified:** ~/.claude/skills/fixme/scripts/fixme-tools.cjs
- **Verification:** All 8 tests pass, transition correctly creates duration entries
- **Committed in:** Part of final file (external to repo)

**2. [Rule 1 - Bug] Added type guard for non-string slug values**
- **Found during:** Task 1 (empty slug test)
- **Issue:** `--slug ---` caused arg parser to treat `---` as a flag (starts with `--`), passing `true` instead of a string to ticketRename. Calling `.toLowerCase()` on `true` threw TypeError.
- **Fix:** Added `typeof newSlug !== 'string'` check alongside null check. Also adjusted test to use `!!!` which correctly tests empty-after-sanitization path.
- **Files modified:** ~/.claude/skills/fixme/scripts/fixme-tools.cjs, fixme-tools.test.cjs
- **Verification:** Empty slug test passes with correct error message
- **Committed in:** Part of final files (external to repo)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both were correctness bugs discovered during TDD. The inline object parsing fix is important for any ticket with `durations: {}` or `transitions: []` style inline empty values. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ticket rename` is ready for the intake agent (Plan 02) to call after processing a bug report
- `queued -> failed` transition is ready for the orchestrator (Plan 03) to clean up failed intake agents
- All existing ticket subcommands verified working (no regressions)

## Self-Check: PASSED

- [x] fixme-tools.cjs exists at ~/.claude/skills/fixme/scripts/ with ticketRename function
- [x] fixme-tools.test.cjs exists at ~/.claude/skills/fixme/scripts/ with 8 test cases
- [x] state-machine.md exists at ~/.claude/skills/fixme/references/ with queued->failed (2 occurrences)
- [x] TRANSITIONS['queued'] includes 'failed' in fixme-tools.cjs
- [x] All 8 tests pass (6 rename + 2 transition)
- [x] SUMMARY.md created at .planning/phases/02-intake-pipeline/

---
*Phase: 02-intake-pipeline*
*Completed: 2026-02-20*
