---
phase: 01-foundation-skeleton
plan: 02
subsystem: infra
tags: [claude-code-skills, markdown-templates, state-machine, yaml, orchestrator]

# Dependency graph
requires:
  - phase: none
    provides: "First plan in phase, no prior dependencies"
provides:
  - "SKILL.md entry point for /fixme command"
  - "Ticket template with lifecycle sections and HTML comment markers"
  - "Session template with metadata frontmatter"
  - "State machine reference document (7 states, transition matrix, enforcement rules)"
  - "Project context schema reference (YAML structure, detection sources)"
  - "Directory structure: agents/, templates/, scripts/, references/"
affects: [02-intake-agent, 03-investigation-agent, 04-fix-agent, 05-verification-agent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skill-as-orchestrator: SKILL.md IS the orchestrator with dispatch loop"
    - "Ticket-as-state: each ticket MD file carries complete state in YAML frontmatter"
    - "Lean orchestrator: dispatcher reads status, dispatches subagents, never investigates"
    - "HTML comment markers for machine-readable section parsing"

key-files:
  created:
    - "~/.claude/skills/fixme/SKILL.md"
    - "~/.claude/skills/fixme/templates/ticket.md"
    - "~/.claude/skills/fixme/templates/session.md"
    - "~/.claude/skills/fixme/references/state-machine.md"
    - "~/.claude/skills/fixme/references/project-context-schema.md"
  modified: []

key-decisions:
  - "SKILL.md uses $ARGUMENTS parsing for sub-commands (start/resume/status/stop) rather than separate command files"
  - "Session template includes status field with 'active' default plus completion stats placeholders"
  - "State machine durations are cumulative across retry visits to the same state"
  - "All files live at ~/.claude/skills/fixme/ (external to project repo, tracked via empty commits)"

patterns-established:
  - "Lean orchestrator: read status from disk, dispatch subagent, report result, repeat"
  - "File path passing: subagents receive ticket file paths, read with fresh context"
  - "fixme-tools.cjs gatekeeper: all state mutations go through the tool, never direct frontmatter edits"
  - "HTML comment markers (<!-- section: xxx -->) for programmatic section finding"

requirements-completed: [SYST-01, SYST-02, SYST-03, SYST-04]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase 1 Plan 2: Skill Directory, SKILL.md, Templates & References Summary

**Claude Code skill entry point with orchestrator loop, full lifecycle ticket template, session manifest, and state machine + project context reference docs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-18T22:30:13Z
- **Completed:** 2026-02-18T22:35:12Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Created complete `~/.claude/skills/fixme/` directory structure with agents/, templates/, scripts/, references/
- SKILL.md (201 lines) with full orchestrator instructions: session start/resume, dispatch loop, bug intake, session control, status query, and CRITICAL RULES
- Ticket template with YAML frontmatter (all state machine fields) and 6 lifecycle sections with HTML comment markers
- State machine reference (160 lines) documenting all 7 states, transition matrix, retry semantics, duration tracking, and enforcement rules
- Project context schema reference (158 lines) documenting YAML structure, detection sources, and lifecycle rules

## Task Commits

Each task was committed atomically:

1. **Task 1: Create skill directory structure and SKILL.md entry point** - `d3ac951` (feat)
2. **Task 2: Create ticket template, session template, and reference documents** - `e409a79` (feat)

## Files Created/Modified
- `~/.claude/skills/fixme/SKILL.md` - Skill entry point with complete orchestrator loop instructions (201 lines)
- `~/.claude/skills/fixme/templates/ticket.md` - Full lifecycle ticket template with YAML frontmatter and HTML comment markers (51 lines)
- `~/.claude/skills/fixme/templates/session.md` - Session manifest template with metadata and completion stats (19 lines)
- `~/.claude/skills/fixme/references/state-machine.md` - State machine reference: 7 states, transition matrix, enforcement rules, retry semantics (160 lines)
- `~/.claude/skills/fixme/references/project-context-schema.md` - Project context YAML schema, detection sources, lifecycle rules (158 lines)

## Decisions Made
- Used `$ARGUMENTS` parsing in SKILL.md for sub-command routing (start/resume/status/stop) rather than separate skill/command files per sub-command
- Session template includes `status: active` field alongside completion stats placeholders to support active/completed lifecycle tracking
- State machine durations are cumulative across retry visits (e.g., if a ticket visits `investigating` twice, the seconds add up)
- All skill files live at `~/.claude/skills/fixme/` (user's home directory), tracked in project repo via empty commits since files are external

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored session template fields after linter modification**
- **Found during:** Task 2
- **Issue:** A linter modified session.md, stripping completion stats fields (tickets_done, tickets_failed, tickets_skipped, tickets_total, completed, duration_seconds)
- **Fix:** Re-wrote session.md with all required fields, keeping the linter's `status: active` addition
- **Files modified:** `~/.claude/skills/fixme/templates/session.md`
- **Verification:** File confirmed to have all frontmatter fields
- **Committed in:** e409a79 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor -- linter stripped fields that were immediately restored. No scope creep.

## Issues Encountered
- All skill files are external to the project git repo (at `~/.claude/skills/fixme/`). Task commits are empty commits in the project repo to track progress. This is inherent to the Claude Code skills architecture where skills live in the user's home directory.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Skill directory structure complete and ready for future agent additions (agents/ dir exists, empty)
- Templates ready for fixme-tools.cjs to use for ticket/session creation
- Reference docs serve as single source of truth for state machine rules and context schema
- Plan 01 (fixme-tools.cjs) is the companion plan -- both plans together complete Phase 1

## Self-Check: PASSED

All 5 created files verified present on disk. Both task commits (d3ac951, e409a79) verified in git log. Directory structure (agents/, scripts/, templates/, references/) confirmed.

---
*Phase: 01-foundation-skeleton*
*Completed: 2026-02-18*
