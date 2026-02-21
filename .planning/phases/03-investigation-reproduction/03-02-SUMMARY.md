---
phase: 03-investigation-reproduction
plan: 02
subsystem: orchestrator
tags: [playwright-cli, browser-automation, session-environment, investigation-dispatch, auth-state]

requires:
  - phase: 03-investigation-reproduction
    plan: 01
    provides: "investigation-agent.md with 6-phase reproducer/verifier loop"
  - phase: 02-intake-pipeline
    provides: "SKILL.md orchestrator with session flows, intake dispatch, dispatch loop skeleton"
provides:
  - "Session environment setup (dev server, browser, login) in orchestrator"
  - "Concrete investigation agent dispatch in dispatch loop with asset directory and 4-parameter Task prompt"
  - "Browser recovery for crash, server down, and auth expired scenarios"
affects: [04-fix-implementation, 05-verification-reporting]

tech-stack:
  added: []
  patterns:
    - "Session environment setup: dev server -> browser -> login, once per session start/resume"
    - "Investigation dispatch: asset dir creation, Task tool with model: opus, disk state verification"
    - "Browser recovery: diagnose -> attempt recovery -> re-dispatch or escalate to user"
    - "Auth state persistence via .fixme/auth.json with stale detection"

key-files:
  created: []
  modified:
    - ".claude/skills/fixme/SKILL.md"

key-decisions:
  - "Session environment setup runs once per session start/resume, not per ticket -- agents assume environment is ready"
  - "Auth state persisted to .fixme/auth.json with stale detection via snapshot comparison"
  - "Phase 3 dispatch loop stops after investigation -- does not transition to fixing (Phase 4 adds that)"
  - "Browser recovery attempts one retry before escalating to user -- prevents infinite recovery loops"
  - "Playwright MCP tools explicitly forbidden as CRITICAL RULE 8"

patterns-established:
  - "Environment setup pattern: load project context -> start dev server -> open browser -> handle login"
  - "Investigation dispatch pattern: create asset dir -> Task(investigation-agent.md, model: opus) -> read disk state -> handle result"
  - "Recovery pattern: diagnose blocker type -> attempt type-specific recovery -> re-dispatch or escalate"

requirements-completed: [BROW-02, BROW-04]

duration: 2min
completed: 2026-02-21
---

# Phase 3 Plan 2: Orchestrator Session Setup & Investigation Dispatch Summary

**SKILL.md updated with session environment setup (dev server + browser + login), concrete investigation agent dispatch via Task tool with model: opus, and browser recovery for crash/server/auth scenarios**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T07:15:34Z
- **Completed:** 2026-02-21T07:17:53Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Session Environment Setup section with dev server startup, headed browser opening, and login handling with auth state persistence
- Session Start Flow and Resume Flow both updated to include environment setup as step 3
- Dispatch loop replaced with concrete investigation dispatch: asset directory creation, Task tool dispatch with 4 parameters, disk state verification, investigation result handling
- Browser Recovery subsection handling crash, server down, and auth expired scenarios
- Playwright MCP tools forbidden as CRITICAL RULE 8
- allowed-tools frontmatter updated with Bash(playwright-cli:*)
- References section updated with investigation-agent.md link

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Session Environment Setup section to SKILL.md** - `bc428dd` (feat)
2. **Task 2: Update Dispatch Loop with concrete investigation agent dispatch** - `3ca307d` (feat)

## Files Created/Modified
- `.claude/skills/fixme/SKILL.md` - Updated orchestrator with session environment setup, investigation dispatch, browser recovery, and Playwright MCP prohibition

## Decisions Made
- **Environment setup once per session:** Dev server + browser + login happen at session start/resume, not per ticket. Investigation agents assume environment is ready when dispatched.
- **Auth state persistence:** Login state saved to `.fixme/auth.json` with stale detection (snapshot shows login page = stale). Manual user login with state-save/state-load lifecycle.
- **Phase 3 stops after investigation:** Dispatch loop reports findings to user but does not transition to fixing. Phase 4 will add the `investigating -> fixing` transition.
- **Single recovery attempt:** Browser recovery tries once per blocker type before escalating to user. Prevents infinite recovery loops while handling transient failures.
- **Playwright MCP forbidden:** Added as CRITICAL RULE 8 to match the investigation agent's rule and user's global CLAUDE.md preference.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Orchestrator now fully supports the investigation workflow: environment setup, agent dispatch, result handling, recovery
- Phase 4 (Fix Implementation) will add: fixer agent, `investigating -> fixing` transition in dispatch loop, implementation agent wrapper
- Phase 5 (Verification) will add: verification agent, `fixing -> verifying` transition, done/failed terminal states

## Self-Check: PASSED

- [x] `.claude/skills/fixme/SKILL.md` exists
- [x] `.planning/phases/03-investigation-reproduction/03-02-SUMMARY.md` exists
- [x] Commit `bc428dd` exists in git log
- [x] Commit `3ca307d` exists in git log

---
*Phase: 03-investigation-reproduction*
*Completed: 2026-02-21*
