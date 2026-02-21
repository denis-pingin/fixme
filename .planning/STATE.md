# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Bugs flow in continuously and get fixed reliably with browser-verified results
**Current focus:** Phase 3: Investigation & Reproduction

## Current Position

**Current Phase:** 03
**Current Phase Name:** Investigation & Reproduction
**Total Phases:** 5
**Current Plan:** 2
**Total Plans in Phase:** 2
**Status:** Phase complete — ready for verification
**Last Activity:** 2026-02-21

**Progress:** [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 5min
- Total execution time: 0.32 hours

**By Phase:**

| Phase                  | Plans | Total | Avg/Plan |
|------------------------|-------|-------|----------|
| 01-foundation-skeleton | 2/2   | 13min | 7min     |
| 02-intake-pipeline     | 2/3   | 6min  | 3min     |

**Recent Trend:**
- Last 5 plans: 01-01 (8min), 01-02 (5min), 02-02 (2min), 02-01 (4min)
- Trend: Accelerating

*Updated after each plan completion*
| Phase 02 P03 | 2min | 2 tasks | 1 files |
| Phase 03 P01 | 2min | 1 tasks | 1 files |
| Phase 03 P02 | 2min | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5-phase structure derived from requirement clusters -- Foundation, Intake, Investigation, Fix, Verification
- [Roadmap]: Merged dashboard (STAT-04) into Phase 5 to avoid single-requirement phase
- [01-01]: Zero-padded ticket numbers stored as YAML strings to avoid integer parsing
- [01-01]: Inline object format for transitions/durations (compact single-line entries)
- [01-01]: Context detection uses yarn prefix per user CLAUDE.md preference
- [01-02]: SKILL.md uses $ARGUMENTS parsing for sub-commands rather than separate command files
- [01-02]: Session template includes status field with completion stats placeholders
- [01-02]: State machine durations are cumulative across retry visits to the same state
- [02-02]: Agent MD file ~120 lines with worked example -- concise but complete for Task dispatch
- [02-02]: Vague reports still processed (best-effort slug/fields) -- investigation agent fills gaps
- [02-02]: Screenshot handling: check existence, copy to assets dir, note missing in report
- [02-01]: Slug sanitization normalizes invalid input rather than rejecting -- resilient to LLM-generated slugs
- [02-01]: queued->failed transition added for intake agent failure cleanup
- [02-01]: Fixed inline object parsing ({}) in YAML parser for durations/transitions roundtrip
- [Phase 02-03]: Intake dispatch uses model: sonnet for balance of quality and cost
- [Phase 02-03]: Temp slug format: intake-tmp-<4-hex> via /dev/urandom for uniqueness
- [Phase 02-03]: Failed intake transitions ticket to failed (not skipped) with error reason preserved
- [Phase 02-03]: Auto-close uses same session summary as manual stop for consistent UX
- [Phase 02-03]: LLM intent detection errs on asking (LOW confidence) rather than mis-classifying as bug
- [Phase 03-01]: Structured prompting over sub-sub-agents: reproducer/verifier roles are sequential phases within one context window
- [Phase 03-01]: Investigation agent uses model: opus for reasoning depth needed for vague report interpretation and multi-file code tracing
- [Phase 03-01]: Screenshots use repro-<descriptive-name>.png naming with --filename= flag for traceability
- [Phase 03-02]: Session environment setup runs once per session start/resume, not per ticket
- [Phase 03-02]: Auth state persisted to .fixme/auth.json with stale detection via snapshot comparison
- [Phase 03-02]: Phase 3 dispatch loop stops after investigation -- does not transition to fixing (Phase 4 scope)
- [Phase 03-02]: Playwright MCP tools explicitly forbidden as CRITICAL RULE 8 in SKILL.md

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Playwright (MCP or CLI) tab/browser management under concurrent agents untested -- validate in Phase 3
- [Research]: Context compaction behavior with repeated ticket file reads is theoretical -- validate empirically in Phase 1
- [Research]: Streaming intake UX (how user submits bug mid-fix) is an open design question -- decide during Phase 2 planning

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 03-01-PLAN.md
Resume file: .planning/phases/03-investigation-reproduction/03-01-SUMMARY.md
