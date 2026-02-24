# Phase 1: Foundation & Skeleton - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The skill directory exists with working ticket state management, a structured ticket template, session management, and project context discovery. Everything downstream agents (investigation, fix, verification) need to operate. No bug intake, no browser interaction, no fixing — just the infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Architecture Investigation (CRITICAL)
- **Evaluate building on top of GSD (Get Shit Done) framework vs standalone skill** — GSD already has subagents (researcher, planner, executor, verifier) that could be reused
- If GSD extension: only build what's missing (intake system, bug-specific agents)
- If standalone: build everything from scratch
- This decision affects everything downstream — researcher must evaluate this FIRST

### Ticket Template

**Structure:**
- Full lifecycle template — all sections present from creation, empty until filled by agents
- Sections: Original Report, Structured Fields (intake-populated), Clarifications, Investigation, Fix, Verification
- Original report is **always the source of truth** — structured fields are agent interpretations that may be wrong
- Original report includes verbatim text AND references to submitted screenshots

**Frontmatter (YAML):**
- State, created/updated timestamps, ticket number, session name
- Per-state duration tracking (entered/exited timestamps for each state)
- Affected URL, reporter context, commit hash (when fixed)
- Optional `related` field for cross-linking tickets
- No priority field — FIFO queue
- No bug type/severity categorization (v2)
- No confidence indicators on structured sections (v2)

**Lifecycle sections:**
- Investigation: numbered attempts (### Attempt 1, ### Attempt 2), each with investigation/fix/verify sub-sections
- Root cause hypothesis is **required** before any fix attempt
- Fix section: approach description (required), list of changed files, commit hash
- Verification: before/after browser snapshots required — visual proof stored in assets
- Dedicated failure reason field for failed tickets (top-level, visible at a glance)

**Clarifications:**
- Dedicated section for intake agent Q&A with user
- If clarification changes meaning of structured sections → rewrite affected sections AND log in clarifications
- If clarification only adds detail → log in clarifications only

**Files & directories:**
- Tickets live project-local at `.fixme/sessions/<session-name>/tickets/`
- 4-digit sequential numbering: `0001-descriptive-slug.md`
- Screenshots in per-ticket subfolders: `.fixme/sessions/<session-name>/assets/0001-slug/01.png`
- .fixme/ gitignore behavior is user's choice (not defined by the tool)

### Sessions
- Sessions are folders: `.fixme/sessions/<session-name>/`
- Each session contains `tickets/` and `assets/` subdirectories
- Session naming: auto-generated default, user can optionally pass a custom name
- Session manifest (`session.md`): created at session start with basic metadata (name, start time)
- During session: no live updates to session.md (v2 feature)
- Session end: write completion stats (duration, ticket counts by state) to session.md
- Sessions allow parallel runs and clean separation between unrelated bug batches
- Resuming a session continues processing queued tickets
- Mid-flight tickets resume from their current state (not reset to queued)

### Max Attempts
- Configurable max fix attempts before giving up — settable globally, per project, or at session start

### Project Context

**Source:** Multiple sources — CLAUDE.md, package.json, .env, other standard config files
- Agents already inherit CLAUDE.md through normal Claude Code mechanisms — project context only captures supplementary operational info

**Content (operational only):**
- Dev server command and base URL
- Build command
- Test infrastructure: init commands (e.g., start container), test runner, how to filter tests by name/file/criteria
- Lint command
- Framework detection
- HMR availability (agents use this to decide refresh strategy)
- No coding conventions (agents get those from CLAUDE.md)
- No language/framework detection (agents discover this from codebase)
- No auth credentials (v2)

**Storage:**
- YAML format: `.fixme/project-context.yaml`
- Per-project (shared across all sessions)

**Detection flow:**
- First time: auto-detect from multiple sources → present with smart defaults for user confirmation → save
- Subsequent sessions: silent reuse (no prompt)
- Agent corrections: agents propose updates → user must confirm → save
- No silent writes to project context, ever

**Dev server management:**
- Session orchestrator manages dev server lifecycle — starts it when session begins, keeps running while agents work

### State Machine

**States:** `queued`, `investigating`, `fixing`, `verifying`, `done`, `failed`, `skipped`

**Valid transitions:**
- `queued → investigating`
- `investigating → fixing`
- `fixing → verifying`
- `verifying → done`
- `verifying → investigating` (retry — new attempt with accumulated context)
- `queued → skipped` (with reason)
- `investigating → skipped` (with reason)
- Any active state → `failed` (with reason)

**Terminal states:** `done`, `failed`, `skipped` — regressions get a new ticket referencing the old one

**Enforcement:**
- Hard error on invalid transitions — strict state machine, no shortcuts
- Reasons required only for non-happy-path transitions (failures, skips, retries)
- Full transition log in frontmatter: `{from, to, timestamp, reason}` for every state change

**Timeouts:**
- Timeouts are on agent steps, not ticket states
- Each sub-agent has a configurable time limit (globally + per project)
- Step timeout → ticket fails → next ticket

**Queue behavior (v1):**
- Strictly sequential — one active ticket at a time, rest queued
- Parallelization deferred to v2

**On failure:**
- Auto-advance — failed ticket logged, orchestrator moves to next queued ticket
- No forced revert on verification failure — agent decides whether to revert as part of their approach

### Skill Entry Point / Orchestration

**Invocation mechanism:** TBD — depends on GSD extension vs standalone research

**Session start flow:**
- Resume existing session: load → queued tickets? → continue dispatch loop. All done? → prompt for new bug
- New session: detect/load project context → bug report attached? → first ticket, start working. No bug report? → smoke test → prompt
- Smoke test: full environment check — dev server, build, browser navigates to app, app is in expected state (logged in, correct page)

**Dispatch model:**
- Orchestrator runs in a single continuous turn, dispatching subagents sequentially via Task tool
- Between subagent returns: orchestrator reports results to user (real-time notifications)
- When queue empty: orchestrator asks user for new bug report (keeps turn alive)
- Orchestrator turn only ends when user explicitly stops the session

**Bug submission:**
- One bug at a time (v1) — batch submission in v2
- Both explicit command AND smart detection of bug-like messages in conversation
- Intake agent clarification happens within orchestrator's turn — questions relayed to user, answers passed back

**Notifications:**
- Real-time: both completions and failures reported in the conversation thread as they happen

**Status:**
- Natural language queries AND a dedicated status command for formatted output

**Session control:**
- Graceful stop: finish current ticket, then stop
- Immediate stop: abort now, current ticket fails
- Both modes available to user

**Session summary:**
- Auto-generated at session end
- Written to session.md AND displayed in conversation
- Content: tickets processed, outcomes, total duration, per-ticket breakdown

### Claude's Discretion
- Ticket YAML frontmatter field ordering and exact key names
- Auto-generated session name format
- Smoke test implementation details
- Exact structured section names in the ticket template
- How the orchestrator detects bug-like messages vs conversation
- Internal architecture of the state machine (code structure, validation approach)

</decisions>

<specifics>
## Specific Ideas

- "The original unstructured report is always the primary source of truth. The structured derivation should be treated with grain of salt that it may have misinterpretations."
- "Getting Shit Done has all kinds of subagents already and we can reuse them. We don't need to create them from scratch." — Evaluate GSD as the foundation
- The orchestrator stays alive by asking questions when idle — it never exits its turn until the user stops the session
- Intake stage doubles as validation — if the bug description has gaps, the intake agent asks for clarification before proceeding

</specifics>

<deferred>
## Deferred Ideas

### v2 Features
- Live session manifest tracking (real-time ticket updates in session.md)
- Per-section confidence indicators on intake-populated fields
- Bug type/severity categorization in frontmatter
- Auth credentials in project context (for logged-in app testing)
- Parallel ticket processing (multiple active tickets simultaneously)
- Batch bug submission (multiple bugs in one message)
- .fixme/ git commit strategy (multi-user collision handling)

</deferred>

---

*Phase: 01-foundation-skeleton*
*Context gathered: 2026-02-18*
