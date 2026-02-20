---
phase: 02-intake-pipeline
plan: 03
subsystem: orchestrator
tags: [skill-md, dispatch, intake-pipeline, intent-detection, auto-close, report-command]

# Dependency graph
requires:
  - phase: 01-foundation-skeleton
    provides: "SKILL.md orchestrator with session lifecycle, dispatch loop, argument parsing"
  - phase: 02-intake-pipeline
    plan: 01
    provides: "ticket rename subcommand, queued->failed transition"
  - phase: 02-intake-pipeline
    plan: 02
    provides: "intake-agent.md with 7-step intake process"
provides:
  - "Dispatch-based intake flow in SKILL.md: pre-create, Task dispatch, failure handling"
  - "/fixme:report sub-command with session bootstrap"
  - "LLM intent detection for inline bug reports (HIGH/LOW/NOT confidence)"
  - "Intake agent tracking (mental list pattern)"
  - "Auto-close: session ends when all tickets processed and no agents pending"
affects: [03-investigation, 04-fix-commit, 05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-create-then-dispatch: orchestrator reserves ticket number, intake agent fills and renames"
    - "LLM intent classification: HIGH (act immediately), LOW (ask), NOT (respond normally)"
    - "Mental list tracking: in-memory awareness of running intake agents, not persistent data"
    - "Auto-close: dispatch loop terminates session when no work and no agents pending"

key-files:
  created: []
  modified:
    - "~/.claude/skills/fixme/SKILL.md"

key-decisions:
  - "Intake dispatch uses model: sonnet for balance of quality and cost"
  - "Temp slug format: intake-tmp-<4-hex> via /dev/urandom for uniqueness"
  - "Failed intake transitions ticket to failed (not skipped) with error reason preserved"
  - "One bug per message in v1 -- user asked to submit remaining bugs separately"
  - "Auto-close uses same summary display as manual /fixme:stop"

patterns-established:
  - "Intake Dispatch Procedure: 5-step reusable flow for both /fixme:report and inline detection"
  - "Message Classification: HIGH/LOW/NOT confidence levels for LLM intent detection"
  - "Session bootstrap: /fixme:report without active session creates one transparently"

requirements-completed: [INTK-01, INTK-03, INTK-04, INTK-05]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 2 Plan 03: Orchestrator Intake Dispatch Summary

**Dispatch-based intake pipeline in SKILL.md: pre-create-then-dispatch pattern, /fixme:report command, LLM intent classification (HIGH/LOW/NOT), intake agent tracking, and auto-close session lifecycle**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T20:22:35Z
- **Completed:** 2026-02-20T20:24:40Z
- **Tasks:** 2
- **Files modified:** 1 (~/.claude/skills/fixme/SKILL.md, 202 -> 287 lines)

## Accomplishments
- Added `/fixme:report` as a recognized sub-command with session bootstrap (creates session if none active)
- Replaced direct ticket creation flow with dispatch-based Intake Dispatch Procedure: pre-create with temp slug, announce, dispatch intake agent via Task tool, handle success/failure, continue loop
- Added LLM intent detection with 3-tier Message Classification: HIGH confidence (dispatch immediately), LOW confidence (ask first), NOT a bug (respond normally)
- Added Intake Agent Tracking section (mental list of dispatched agents by ticket path)
- Added Auto-Close behavior: session ends automatically when dispatch loop finds no queued tickets and no pending intake agents
- Updated Dispatch Loop to reference auto-close and handle pending intake agents
- Updated Session Start Flow step 3 to use Intake Dispatch Procedure instead of direct ticket creation
- Updated argument-hint in frontmatter to include `report`

## Task Commits

1. **Task 1: Update argument parsing and add /fixme:report command** - No project repo commit (SKILL.md at ~/.claude/skills/fixme/ outside project git repo)
2. **Task 2: Replace Bug Intake section with dispatch-based intake pipeline** - No project repo commit (same external file)

_Note: All changes are to ~/.claude/skills/fixme/SKILL.md which is outside this project's git repository. Per-task commits are not applicable for external skill files. The SUMMARY.md and state updates are committed as the tracking mechanism._

## Files Created/Modified
- `~/.claude/skills/fixme/SKILL.md` - Added `report` sub-command to argument table, added Report Flow section with session bootstrap, replaced Bug Intake section with Message Classification + Intake Dispatch Procedure + Intake Agent Tracking + One Bug Per Message, added Auto-Close subsection, updated Dispatch Loop and Session Start Flow references

## Decisions Made
- Intake agent dispatched with `model: sonnet` per research recommendation (balance of quality and cost for intake tasks)
- Temporary slug generated via `/dev/urandom` hex (4 chars = 65536 combinations, sufficient for concurrent intakes within a session)
- Failed intake transitions to `failed` state (not `skipped`) preserving the error reason -- audit trail is more valuable than a clean queue
- Auto-close uses the same session summary as manual stop -- consistent user experience regardless of how session ends
- Err on the side of asking (LOW confidence) rather than mis-classifying normal messages as bug reports

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The full intake pipeline is now connected: tooling (Plan 01) + agent (Plan 02) + orchestrator dispatch (Plan 03)
- Phase 2 is complete -- the orchestrator can pre-create tickets, dispatch intake agents, track them, handle failures, and auto-close sessions
- Ready for Phase 3 (Investigation): the dispatch loop already dispatches investigation agents for queued tickets -- Phase 3 builds the investigation agent itself
- All existing sub-commands (start, resume, status, stop) remain functional and documented

## Self-Check: PASSED

- [x] SKILL.md exists at ~/.claude/skills/fixme/ with all new sections
- [x] `report` sub-command in argument parsing table
- [x] Report Flow section with session bootstrap
- [x] Message Classification with HIGH/LOW/NOT confidence tiers
- [x] Intake Dispatch Procedure with 5 steps (pre-create, announce, dispatch, handle return, continue loop)
- [x] Intake Agent Tracking section (mental list pattern)
- [x] One Bug Per Message (v1) documented
- [x] Auto-Close subsection in Session Control
- [x] intake-agent.md referenced in dispatch instructions
- [x] intake-tmp temporary slug pattern present
- [x] Old direct-creation pattern ("Write the user's verbatim report") removed
- [x] All existing sub-commands (start, resume, status, stop) still documented
- [x] 02-03-SUMMARY.md created at .planning/phases/02-intake-pipeline/

---
*Phase: 02-intake-pipeline*
*Completed: 2026-02-20*
