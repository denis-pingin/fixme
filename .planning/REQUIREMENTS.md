# Requirements: Fixme

**Defined:** 2026-02-18
**Core Value:** Bugs flow in continuously and get fixed reliably with browser-verified results

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Intake & Queue

- [x] **INTK-01**: User can submit a bug report (text + optional screenshots) during an active session and it gets captured to a numbered MD ticket file
- [x] **INTK-02**: Intake agent summarizes the request to generate a meaningful, descriptive title used for the ticket filename (e.g., 001-login-button-not-responding.md)
- [x] **INTK-03**: Intake happens via background agent so the orchestrator continues its current work uninterrupted
- [x] **INTK-04**: Ticket files are numbered sequentially for sort-stable FIFO ordering
- [x] **INTK-05**: User can submit new bug reports while an implementation agent is actively fixing a previous bug (streaming intake)

### State & Tracking

- [x] **STAT-01**: Each ticket tracks state: queued → investigating → fixing → verifying → done/failed
- [x] **STAT-02**: Each state transition is timestamped with duration calculated per phase
- [ ] **STAT-03**: Ticket records fix details: files changed, investigation notes, verification evidence, commit hash
- [ ] **STAT-04**: Session-end summary dashboard shows: N fixed, M failed, total time, per-bug breakdown

### Investigation & Browser

- [x] **BROW-01**: Implementation agent reads project CLAUDE.md to discover dev server URL, build commands, and HMR support
- [ ] **BROW-02**: Implementation agent uses Playwright (MCP or CLI) to navigate to the app and reproduce the reported bug
- [ ] **BROW-03**: Implementation agent uses Playwright (MCP or CLI) to verify the fix by re-running reproduction steps and confirming the bug is gone
- [ ] **BROW-04**: Implementation agent investigates the codebase (reads files, traces code paths) to understand root cause before attempting a fix

### Fix & Recovery

- [ ] **FIXR-01**: Each resolved bug produces exactly one atomic git commit with ticket reference in the message
- [ ] **FIXR-02**: If the implementation agent cannot fix a bug, it marks the ticket as failed with a reason and moves to the next queued bug
- [ ] **FIXR-03**: The orchestrator main loop stays lean — all investigation, fixing, and verification work happens in subagents
- [ ] **FIXR-04**: On failed verification, the implementation agent reverts changed files before retrying or moving on
- [ ] **FIXR-05**: The implementation agent iterates in a fix→verify loop — if verification is unsatisfactory, it retries with a different approach until satisfied or exhausted

### System & Architecture

- [x] **SYST-01**: The skill installs at ~/.claude/fixme/ and is invoked via /fixme:start (or similar command)
- [x] **SYST-02**: Structured ticket MD template ensures consistent agent output across all tickets
- [x] **SYST-03**: Architecture supports future parallel implementation agents (separate concerns, no shared mutable state)
- [x] **SYST-04**: Ticket files serve as persistent state that survives context compaction

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Queue Enhancements

- **QUEV-01**: User can mark a bug as urgent to jump the FIFO queue (priority override)
- **QUEV-02**: Intake agent detects potential duplicate reports against existing queue items

### Verification Enhancements

- **VERV-01**: HMR-aware verification skips page refresh when project supports hot module replacement
- **VERV-02**: Visual before/after screenshots captured during reproduction and verification
- **VERV-03**: Run project test suite after fix to catch regressions (test-aware verification)

### Reporting Enhancements

- **REPV-01**: Detailed investigation report per ticket documenting agent reasoning and root cause analysis

## Out of Scope

| Feature | Reason |
|---------|--------|
| Parallel implementation agents | Design for it in v1, build in v2+ after sequential is battle-tested |
| Automated bug detection / monitoring | Different problem domain — Fixme fixes human-reported bugs only |
| External issue tracker integration (Jira, Linear, GitHub Issues) | Massive scope increase, marginal v1 value |
| Cross-browser testing | Single Chromium instance sufficient; multi-browser is QA, not bug-fix |
| CI/CD integration | Local dev environment only |
| Autonomous bug prioritization | AI doesn't know business context; FIFO + future priority override |
| Full visual regression suite | Targeted verification only, not baseline comparison |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTK-01 | Phase 2 | Complete |
| INTK-02 | Phase 2 | Complete |
| INTK-03 | Phase 2 | Complete |
| INTK-04 | Phase 2 | Complete |
| INTK-05 | Phase 2 | Complete |
| STAT-01 | Phase 1 | Complete |
| STAT-02 | Phase 1 | Complete |
| STAT-03 | Phase 4 | Pending |
| STAT-04 | Phase 5 | Pending |
| BROW-01 | Phase 1 | Complete |
| BROW-02 | Phase 3 | Pending |
| BROW-03 | Phase 5 | Pending |
| BROW-04 | Phase 3 | Pending |
| FIXR-01 | Phase 4 | Pending |
| FIXR-02 | Phase 4 | Pending |
| FIXR-03 | Phase 4 | Pending |
| FIXR-04 | Phase 5 | Pending |
| FIXR-05 | Phase 4 | Pending |
| SYST-01 | Phase 1 | Complete |
| SYST-02 | Phase 1 | Complete |
| SYST-03 | Phase 1 | Complete |
| SYST-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after roadmap creation*
