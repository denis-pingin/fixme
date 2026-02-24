# Phase 5: Verification & Close Loop - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Browser-verify every fix before closing, create one atomic git commit per resolved bug, handle browser verification failures by re-entering the fix loop, and produce a session summary at session end. The fix-agent retry loop and build/lint/test verification are already implemented (Phase 4) -- this phase adds the browser verification layer on top, the commit step, and the session summary display.

</domain>

<decisions>
## Implementation Decisions

### Commit message format
- Conventional commit prefix: `fix: <ticket title>` (e.g., `fix: resolve login redirect loop`)
- No FIXME ticket numbers in the commit message -- keep it clean and project-native
- No commit body -- one-liner only

### Browser verification: what "verified" means
- Re-run the original reproduction steps from the investigation section of the ticket
- Confirm that the reported bug symptom no longer occurs
- Confirm that the expected/desired state is present (not just "no error" -- the page should show correct behavior)
- This is a functional check, not just a visual glance

### Browser verification evidence
- Screenshot of the fixed state only -- the investigation agent already captured the "before" (bug-present) screenshots during reproduction
- No before/after pair needed at verification time
- Evidence goes to ticket's `<!-- section: verification -->` section, screenshots to `<ticket-folder>/assets/`
- Verification reports to `<ticket-folder>/verifications/`

### Browser verification failure handling
- On failure: do NOT revert code. Keep all changes in place
- Write detailed failure evidence to the ticket (what was expected vs. what was observed, screenshots, why it failed)
- Re-enter the fix-agent loop with accumulated context -- the fixer can read the browser verification report to understand what's still wrong
- Browser verification failure counts toward the existing `max_attempts` budget (default 3) -- same pool as fix attempts
- Final failure (all attempts exhausted) still triggers the existing fix-agent Step 6 revert (checkout + clean)

### Commit mechanics
- One git commit per successfully browser-verified fix
- Commit only the files changed by the fix (use `files_changed` from ticket frontmatter)
- Set `commit_hash` in ticket frontmatter after commit
- Transition ticket to `done` after successful commit

### Session summary
- Already implemented: `session summary` command returns JSON with per-ticket stats (number, slug, state, total_seconds), updates session.md frontmatter
- Per-bug detail: minimal -- title + done/failed status
- Session ends naturally when all tickets are resolved/addressed, or early if the user stops it
- On early stop: show per-ticket state breakdown with counts (e.g., 3 done, 1 failed, 2 queued). Queued/in-progress tickets stay in their current state -- no automatic transitions
- Display format: terminal output + persisted to session.md (already the pattern)

### Claude's Discretion
- Browser verification agent structure: whether it's a new agent file or integrated into the existing verification flow
- How to format the session summary table in terminal output
- Whether to include commit hash in the minimal summary line per done ticket

</decisions>

<specifics>
## Specific Ideas

- Browser verification should reuse the investigation agent's reproduction steps (they're already in the ticket) rather than re-deriving them
- The browser verification failure report must be detailed enough for the fixer agent to iterate -- not just "FAIL" but "expected X, saw Y, screenshot shows Z"
- Commit messages should feel native to the project, not like they came from an automated tool

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 05-verification-close-loop*
*Context gathered: 2026-02-23*
