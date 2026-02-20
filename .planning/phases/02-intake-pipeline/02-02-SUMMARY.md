---
phase: 02-intake-pipeline
plan: 02
subsystem: agents
tags: [claude-code-task, subagent, intake, markdown-agent, glob, grep]

# Dependency graph
requires:
  - phase: 01-foundation-skeleton
    provides: "Ticket template with HTML comment section markers and placeholder format"
provides:
  - "intake-agent.md -- complete agent instructions for Task tool dispatch"
  - "Agent file pattern: frontmatter + identity + input + process + rules + example"
affects: [02-03-PLAN, 03-investigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agent MD file structure: frontmatter (name, description, tools) + numbered process steps + rules + example"
    - "Read-first agent pattern: subagent reads its role file as first action"
    - "Light codebase exploration: max 5 Glob/Grep calls for area identification"

key-files:
  created:
    - "~/.claude/skills/fixme/agents/intake-agent.md"
  modified: []

key-decisions:
  - "Agent file ~120 lines -- concise but complete with worked example"
  - "Screenshot handling: check existence, copy to assets dir, note missing ones in report"
  - "Vague reports still processed -- generate best-effort slug and fields, investigation agent fills gaps"

patterns-established:
  - "Agent MD files at ~/.claude/skills/fixme/agents/ with frontmatter metadata"
  - "7-step intake process: read -> write report -> explore codebase -> fill fields -> generate slug -> rename -> return summary"
  - "One-liner return format for subagent results: 'Queued #NNN: <Title>'"

requirements-completed: [INTK-01, INTK-02]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 2 Plan 02: Intake Agent Summary

**Intake agent definition file with 7-step process: verbatim report capture, light codebase exploration, structured field filling, slug generation, ticket rename, and one-liner summary return**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T20:14:44Z
- **Completed:** 2026-02-20T20:16:34Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Created `~/.claude/skills/fixme/agents/intake-agent.md` (122 lines) with complete agent instructions
- All 7 process steps documented with specific tool usage (Edit for placeholders, Glob/Grep for exploration, Bash for rename)
- Explicit constraints: no root cause investigation, max 5 exploration calls, one-liner return format only
- Worked example showing full flow from input to expected output

## Task Commits

1. **Task 1: Create agents directory and intake-agent.md** - No project repo commit (file lives at `~/.claude/skills/fixme/agents/` outside project git repo, consistent with Phase 1 pattern)

**Plan metadata:** See final commit below

## Files Created/Modified
- `~/.claude/skills/fixme/agents/intake-agent.md` - Complete intake agent instructions for Task tool dispatch

## Decisions Made
- Agent file is 122 lines (within target ~80-120 range), balancing completeness with conciseness
- Screenshot handling covers three cases: exists (copy to assets), does not exist (note in report), none mentioned (write "None")
- Vague/minimal reports are still processed rather than rejected -- the investigation agent handles depth
- Structured fields use "(To be determined during investigation)" when repro steps aren't clear from the report

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- intake-agent.md is ready for dispatch by SKILL.md (Plan 02-03)
- Agent references `fixme-tools.cjs ticket rename` which is delivered by Plan 02-01
- Plan 02-03 (SKILL.md updates) can now reference this agent file in its Task dispatch instructions

## Self-Check: PASSED

- FOUND: `~/.claude/skills/fixme/agents/intake-agent.md` (122 lines, frontmatter with name/description/tools, 7 process steps, references ticket rename, one-liner return format)
- FOUND: `.planning/phases/02-intake-pipeline/02-02-SUMMARY.md`

---
*Phase: 02-intake-pipeline*
*Completed: 2026-02-20*
