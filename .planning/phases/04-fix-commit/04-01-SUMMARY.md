---
phase: 04-fix-commit
plan: 01
subsystem: tooling
tags: [fixme-tools, directory-layout, ticket-template, model-inheritance]

# Dependency graph
requires:
  - phase: 01-foundation-skeleton
    provides: "fixme-tools.cjs with ticket/session CRUD, YAML parser, state machine"
  - phase: 02-intake-pipeline
    provides: "intake-agent.md, SKILL.md dispatch loop with intake + investigation"
  - phase: 03-investigation-reproduction
    provides: "investigation-agent.md with browser-based reproduction workflow"
provides:
  - "Ticket-centric directory layout (NNNN-slug/ticket.md with subdirectories)"
  - "Ticket template with fix artifact fields (base_commit, max_verify_cycles, max_timeout_minutes, fix_artifacts, files_changed)"
  - "Model inheritance applied to all agent files and SKILL.md dispatch"
  - "ticket dir subcommand for resolving ticket folder from ticket.md path"
affects: [04-02, 04-03, 05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["ticket-centric directory layout with per-ticket subdirectories", "model: inherit convention for sub-agent dispatch"]

key-files:
  created: []
  modified:
    - ".claude/skills/fixme/scripts/fixme-tools.cjs"
    - ".claude/skills/fixme/scripts/fixme-tools.test.cjs"
    - ".claude/skills/fixme/templates/ticket.md"
    - ".claude/skills/fixme/agents/investigation-agent.md"
    - ".claude/skills/fixme/agents/intake-agent.md"
    - ".claude/skills/fixme/SKILL.md"

key-decisions:
  - "Ticket folders scanned via /^\\d{4}-/ regex on sessionDir entries (no separate tickets/ directory)"
  - "ticketRename moves parent directory via fs.renameSync instead of renaming individual file"
  - "Model inheritance applied retroactively: removed model: opus from investigation-agent.md, removed Use model: sonnet/opus from SKILL.md dispatch"
  - "SKILL.md asset directory paths updated from session-level to ticket-level"

patterns-established:
  - "Ticket layout: NNNN-slug/ticket.md with assets/, research/, plans/, verifications/ subdirectories"
  - "All ticket commands return dir field pointing to ticket folder alongside path to ticket.md"
  - "Model inheritance: sub-agents use model: inherit or omit model field"

requirements-completed: [STAT-03]

# Metrics
duration: 7min
completed: 2026-02-21
---

# Phase 4 Plan 01: Directory Restructuring & Template Updates Summary

**Ticket-centric directory layout with per-ticket subdirectories, fix artifact template fields, and model inheritance applied across all agents**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-21T08:27:03Z
- **Completed:** 2026-02-21T08:34:19Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Restructured fixme-tools.cjs from flat tickets/ directory to per-ticket NNNN-slug/ticket.md folders with assets/, research/, plans/, verifications/ subdirectories
- Updated ticket template with fix artifact frontmatter fields (base_commit, max_verify_cycles, max_timeout_minutes, fix_artifacts, files_changed) for Phase 4 fixer agent
- Applied model inheritance decision retroactively: removed all hardcoded model: opus/sonnet from agent files and SKILL.md dispatch instructions
- Updated all path references in investigation-agent.md, intake-agent.md, and SKILL.md for ticket-centric layout

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure fixme-tools.cjs for ticket-centric directory layout** - `acba839` (feat)
2. **Task 2: Update ticket template, agent path references, and apply model inheritance** - `ebfaea5` (feat)

## Files Created/Modified
- `.claude/skills/fixme/scripts/fixme-tools.cjs` - ticketCreate/List/Next/Rename/Dir, sessionCreate/List/Summary all updated for ticket-centric layout
- `.claude/skills/fixme/scripts/fixme-tools.test.cjs` - 22 tests rewritten for new directory layout (create, list, next, rename, dir, transition, session)
- `.claude/skills/fixme/templates/ticket.md` - Added base_commit, max_verify_cycles, max_timeout_minutes, fix_artifacts, files_changed; updated fix/verification sections to reference artifact files
- `.claude/skills/fixme/agents/investigation-agent.md` - model: inherit, ticket-folder asset paths
- `.claude/skills/fixme/agents/intake-agent.md` - Ticket-level assets directory references, updated example paths
- `.claude/skills/fixme/SKILL.md` - Removed hardcoded model specifications, updated asset directory paths to ticket-centric layout

## Decisions Made
- Ticket folders scanned via /^\d{4}-/ regex on sessionDir entries -- no separate tickets/ directory needed
- ticketRename moves parent directory via fs.renameSync instead of renaming individual file
- Model inheritance applied retroactively: removed all hardcoded model values from SKILL.md dispatch (Use model: opus, Use model: sonnet) and from investigation-agent.md frontmatter
- SKILL.md asset directory paths updated from session-level (`assets/<ticket-number>/`) to ticket-level (`<ticket-dir>/assets/`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed hardcoded model values from SKILL.md dispatch instructions**
- **Found during:** Task 2 (model inheritance)
- **Issue:** Plan specified removing model: values from agent frontmatter but SKILL.md also had "Use model: opus." and "Use model: sonnet." in dispatch instructions
- **Fix:** Removed both hardcoded model lines from SKILL.md dispatch sections
- **Files modified:** .claude/skills/fixme/SKILL.md
- **Verification:** grep confirms no model: opus/sonnet in any agent file or SKILL.md
- **Committed in:** ebfaea5 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Updated SKILL.md asset directory paths for ticket-centric layout**
- **Found during:** Task 2 (agent path references)
- **Issue:** SKILL.md dispatch loop step 3 created session-level `assets/<ticket-number>/` dir; step 4 passed old asset path to investigation agent
- **Fix:** Updated step 3 to reference `<ticket-dir>/assets/`, updated step 4 Task prompt, updated intake dispatch asset path
- **Files modified:** .claude/skills/fixme/SKILL.md
- **Verification:** Smoke test confirms full lifecycle works with new paths
- **Committed in:** ebfaea5 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both fixes necessary for consistency -- SKILL.md paths must match the new directory layout. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Directory layout ready for Phase 4 fixer agent files (04-02)
- Ticket template has all fields needed for fix-verify loop
- SKILL.md ready for fixer dispatch integration (04-03)
- Model inheritance established as convention for all future agent files

## Self-Check: PASSED

All 7 files verified present. Both task commits (acba839, ebfaea5) found in git log.

---
*Phase: 04-fix-commit*
*Completed: 2026-02-21*
