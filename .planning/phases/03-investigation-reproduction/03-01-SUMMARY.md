---
phase: 03-investigation-reproduction
plan: 01
subsystem: agents
tags: [playwright-cli, browser-automation, investigation, subagent, opus]

requires:
  - phase: 02-intake-pipeline
    provides: "intake-agent.md pattern, ticket template with Investigation section"
provides:
  - "investigation-agent.md -- complete subagent instructions for browser-based bug reproduction and codebase root cause analysis"
affects: [04-fix-implementation, 05-verification-reporting]

tech-stack:
  added: []
  patterns:
    - "6-phase investigation workflow: understand, reproduce, verify, investigate, write, return"
    - "Reproducer/verifier loop with CONFIRMED/NOT_CONFIRMED/PARTIAL verdicts"
    - "Structured per-attempt output format (Reproduction Steps, Evidence, Affected Files, Root Cause Hypothesis)"
    - "Progressive ticket writing via Edit tool (findings persist if context compacts)"

key-files:
  created:
    - ".claude/skills/fixme/agents/investigation-agent.md"
  modified: []

key-decisions:
  - "Structured prompting over sub-sub-agents: reproducer/verifier roles are sequential phases within one context window, not separate Task dispatches"
  - "playwright-cli is the only browser automation method; MCP tools explicitly forbidden in agent instructions"
  - "Agent uses model: opus for the reasoning depth needed for vague report interpretation and multi-file code tracing"
  - "Browser recovery: agent attempts one relaunch (open + state-load) before reporting BLOCKER"
  - "Screenshots use repro-<descriptive-name>.png naming with --filename= flag for traceability"

patterns-established:
  - "Investigation agent pattern: 6-phase workflow with reproducer/verifier loop for browser-based bug investigation"
  - "Verdict system: CONFIRMED/NOT_CONFIRMED/PARTIAL with configurable retry via max_attempts frontmatter field"
  - "One-liner return format with 4 variants: success, partial, failed, blocker"

requirements-completed: [BROW-02, BROW-04]

duration: 2min
completed: 2026-02-21
---

# Phase 3 Plan 1: Investigation Agent Summary

**Investigation agent with 6-phase reproducer/verifier loop, codebase analysis via Grep/Glob/Read, and structured per-attempt ticket output using playwright-cli for browser automation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T07:10:52Z
- **Completed:** 2026-02-21T07:12:47Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Complete investigation agent instructions (205 lines) for Task tool dispatch with model: opus
- 6-phase workflow covering report understanding, browser reproduction, verification, codebase analysis, ticket writing, and summary return
- Reproducer/verifier internal loop with CONFIRMED/NOT_CONFIRMED/PARTIAL verdicts and configurable retry limit
- Structured per-attempt output format with 4 subsections for the ticket's Investigation section
- 10 explicit rules including MCP tool prohibition, progressive writing, and strategic file reading

## Task Commits

Each task was committed atomically:

1. **Task 1: Create investigation-agent.md with reproducer/verifier loop and codebase analysis** - `348bdb8` (feat)

## Files Created/Modified
- `.claude/skills/fixme/agents/investigation-agent.md` - Complete investigation agent instructions for browser-based bug reproduction and root cause analysis

## Decisions Made
- **Structured prompting over sub-sub-agents:** Reproducer and verifier roles are sequential phases within one context window. Claude Code does not support Task-within-Task, and a single context retains all reproduction evidence. Simpler and more reliable.
- **Model: opus:** Investigation is the most cognitively demanding phase -- deducing steps from vague reports, interpreting accessibility snapshots, tracing multi-file code paths. Opus provides the reasoning depth needed.
- **Browser recovery strategy:** Agent attempts one recovery (playwright-cli open + state-load .fixme/auth.json) before reporting BLOCKER. Single retry keeps the agent focused; persistent browser issues go back to the orchestrator.
- **Progressive ticket writing:** Findings written to ticket via Edit tool after each phase (not accumulated to the end). Ensures partial findings survive context compaction.
- **Screenshot naming convention:** `repro-<descriptive-name>.png` with mandatory `--filename=` flag. Descriptive names make evidence traceable in the ticket without opening each image.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Investigation agent ready for orchestrator dispatch via Task tool
- SKILL.md updates needed (Plan 02): session environment setup, investigation dispatch in the loop, browser recovery handling
- Phase 4 (fixer agent) will consume the investigation agent's structured ticket output

## Self-Check: PASSED

- [x] `.claude/skills/fixme/agents/investigation-agent.md` exists
- [x] Commit `348bdb8` exists in git log

---
*Phase: 03-investigation-reproduction*
*Completed: 2026-02-21*
