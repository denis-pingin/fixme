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
- One-line commit message reflecting the ticket title (e.g., `fix: resolve login redirect loop`)
- No FIXME ticket numbers in the commit message -- keep it clean and project-native
- No commit body -- one-liner only

### Browser verification flow
- After fix-agent returns "fixed" (build/lint/test passed), run browser verification: re-navigate to the affected URL, re-run the original reproduction steps, confirm the bug behavior is gone
- Follows the same browser interaction pattern as the investigation agent: `playwright-cli open`, `playwright-cli snapshot`, `playwright-cli screenshot`, console/network checks
- Browser verification evidence captured: screenshots (before/after), snapshots, console checks -- written to the ticket's `<!-- section: verification -->` section
- Screenshots go to `<ticket-folder>/assets/`, verification reports to `<ticket-folder>/verifications/`

### Browser verification failure handling
- On failure: do NOT revert code. Keep all changes in place
- Write detailed failure evidence to the ticket (what was expected vs. what was observed, screenshots, why it failed)
- Re-enter the fix-agent loop with accumulated context -- the fixer can read the browser verification report to understand what's still wrong
- This counts toward the existing `max_attempts` budget from ticket frontmatter
- Final failure (all attempts exhausted) still triggers the existing fix-agent Step 6 revert (checkout + clean)

### Commit mechanics
- One git commit per successfully browser-verified fix
- Commit only the files changed by the fix (use `files_changed` from ticket frontmatter)
- Set `commit_hash` in ticket frontmatter after commit
- Transition ticket to `done` after successful commit

### Session summary
- Already implemented: `session summary` command returns JSON with per-ticket stats (number, slug, state, total_seconds), updates session.md frontmatter
- Phase 5 addition: include `commit_hash` per ticket in the summary output
- Display format: terminal output + persisted to session.md (already the pattern)
- Per-bug detail: title + status + duration (per ROADMAP success criteria). Commit hash added for done tickets

### Claude's Discretion
- Exact `fix:` prefix vs. bare title in commit message (as long as no ticket numbers appear)
- Browser verification agent structure: whether it's a new agent file or integrated into the existing verification flow
- How to format the session summary table in terminal output

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
