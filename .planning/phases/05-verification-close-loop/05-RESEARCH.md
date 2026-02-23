# Phase 5: Verification & Close Loop - Research

**Researched:** 2026-02-23
**Domain:** Browser verification, git commit mechanics, session summary, agent orchestration
**Confidence:** HIGH

## Summary

Phase 5 closes the last four open requirements (BROW-03, FIXR-01, FIXR-04, STAT-04) by adding three capabilities on top of the Phase 4 fix-verify loop: (1) browser verification of every fix by re-running the investigation's reproduction steps to confirm the bug is gone, (2) one atomic git commit per browser-verified fix, and (3) a session summary display at session end. The fix-agent's internal build/lint/test verifier (Phase 4) already gates code quality; Phase 5 adds the functional correctness gate via browser and the commit/close step.

The current architecture makes Phase 5 straightforward. The fix-agent returns `{status: "fixed", ...}` with the ticket in `fixing` state. The state machine already has `fixing -> verifying` and `verifying -> done` transitions. The SKILL.md dispatch loop has a placeholder comment ("Awaiting browser verification (Phase 5)") at exactly the right insertion point. The ticket template already has `<!-- section: verification -->` for browser evidence, `commit_hash:` in frontmatter, and `files_changed: []` populated by the fix-agent. The `session summary` command already returns JSON with per-ticket stats. The investigation agent already writes structured reproduction steps and screenshots to the ticket. All the building blocks exist; Phase 5 wires them together.

The main technical decisions are: (a) whether browser verification is a new agent file or integrated into SKILL.md's dispatch loop, (b) how browser verification failure feeds back into the fix loop within the existing `max_attempts` budget, and (c) how the session summary is formatted for terminal display.

**Primary recommendation:** Split into 2-3 plans: (1) browser verification agent + SKILL.md dispatch integration (the core loop change), (2) git commit step + ticket close + session summary formatting. Optionally a third plan if the state machine or fixme-tools.cjs needs changes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Commit message format
- Conventional commit prefix: `fix: <ticket title>` (e.g., `fix: resolve login redirect loop`)
- No FIXME ticket numbers in the commit message -- keep it clean and project-native
- No commit body -- one-liner only

#### Browser verification: what "verified" means
- Re-run the original reproduction steps from the investigation section of the ticket
- Confirm that the reported bug symptom no longer occurs
- Confirm that the expected/desired state is present (not just "no error" -- the page should show correct behavior)
- This is a functional check, not just a visual glance

#### Browser verification evidence
- Screenshot of the fixed state only -- the investigation agent already captured the "before" (bug-present) screenshots during reproduction
- No before/after pair needed at verification time
- Evidence goes to ticket's `<!-- section: verification -->` section, screenshots to `<ticket-folder>/assets/`
- Verification reports to `<ticket-folder>/verifications/`

#### Browser verification failure handling
- On failure: do NOT revert code. Keep all changes in place
- Write detailed failure evidence to the ticket (what was expected vs. what was observed, screenshots, why it failed)
- Re-enter the fix-agent loop with accumulated context -- the fixer can read the browser verification report to understand what's still wrong
- Browser verification failure counts toward the existing `max_attempts` budget (default 3) -- same pool as fix attempts
- Final failure (all attempts exhausted) still triggers the existing fix-agent Step 6 revert (checkout + clean)

#### Commit mechanics
- One git commit per successfully browser-verified fix
- Commit only the files changed by the fix (use `files_changed` from ticket frontmatter)
- Set `commit_hash` in ticket frontmatter after commit
- Transition ticket to `done` after successful commit

#### Session summary
- Already implemented: `session summary` command returns JSON with per-ticket stats (number, slug, state, total_seconds), updates session.md frontmatter
- Per-bug detail: minimal -- title + done/failed status
- Session ends naturally when all tickets are resolved/addressed, or early if the user stops it
- On early stop: show per-ticket state breakdown with counts (e.g., 3 done, 1 failed, 2 queued). Queued/in-progress tickets stay in their current state -- no automatic transitions
- Display format: terminal output + persisted to session.md (already the pattern)

### Claude's Discretion

- Browser verification agent structure: whether it's a new agent file or integrated into the existing verification flow
- How to format the session summary table in terminal output
- Whether to include commit hash in the minimal summary line per done ticket

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BROW-03 | Implementation agent uses Playwright (MCP or CLI) to verify the fix by re-running reproduction steps and confirming the bug is gone | Browser verification agent reads investigation reproduction steps from ticket, re-executes them via `playwright-cli`, compares outcome against expected behavior, captures screenshot evidence. Uses existing investigation section format. |
| FIXR-01 | Each resolved bug produces exactly one atomic git commit with ticket reference in the message | After browser verification PASS, orchestrator runs `git add` on `files_changed` list from ticket frontmatter, creates commit with `fix: <ticket title>` format, records `commit_hash` in ticket frontmatter. |
| FIXR-04 | On failed verification, the implementation agent reverts changed files before retrying or moving on | Browser verification failure does NOT revert (per user decision). Instead, it re-enters the fix-agent loop with accumulated context. Revert only happens on FINAL failure (all attempts exhausted) via existing fix-agent Step 6. The requirement is satisfied by the existing revert-on-final-failure mechanism. |
| STAT-04 | Session-end summary dashboard shows: N fixed, M failed, total time, per-bug breakdown | `session summary` already returns JSON with all needed data. Phase 5 adds formatted terminal output: table with per-ticket rows and summary counts. Already persisted to session.md. |
</phase_requirements>

## Standard Stack

### Core

No new dependencies. Phase 5 is entirely agent instruction files (MD), SKILL.md dispatch updates, and minor fixme-tools.cjs extensions.

| Component | File | Purpose | Status |
|-----------|------|---------|--------|
| SKILL.md | `.claude/skills/fixme/SKILL.md` | Orchestrator dispatch loop -- adds browser verification + commit + session summary | Exists, needs modification |
| Browser verification agent | `.claude/skills/fixme/agents/browser-verifier.md` (new) | Re-runs reproduction steps to verify fix | New file |
| fix-agent.md | `.claude/skills/fixme/agents/fix-agent.md` | Fixer coordinator -- minor adjustments for browser verification re-entry | Exists, needs minor changes |
| fixme-tools.cjs | `.claude/skills/fixme/scripts/fixme-tools.cjs` | CLI tool -- may need minor extensions for commit support | Exists, minor changes |
| Ticket template | `.claude/skills/fixme/templates/ticket.md` | Template already has verification section and commit_hash | Exists, no changes expected |
| State machine | `.claude/skills/fixme/references/state-machine.md` | Reference doc -- transitions already defined | Exists, no changes |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `git add <files>` | Stage files for commit | After browser verification PASS, before commit |
| `git commit -m "fix: <title>"` | Create atomic commit | After staging files |
| `git rev-parse HEAD` | Capture commit hash | After commit succeeds |
| `playwright-cli snapshot` | Get page state for verification | During browser verification |
| `playwright-cli screenshot` | Capture verification evidence | During browser verification |
| `playwright-cli open <url>` | Navigate to affected page | During browser verification |
| `playwright-cli click/fill/type/etc.` | Re-run reproduction steps | During browser verification |

### No External Libraries

Zero new npm dependencies. All work is in markdown instruction files, the existing fixme-tools.cjs, and git commands.

## Architecture Patterns

### Current Flow (Phase 4)

```
SKILL.md dispatch loop:
  1. Find next queued ticket
  2. Transition: queued -> investigating
  3. Dispatch investigation-agent
  4. Transition: investigating -> fixing
  5. Dispatch fix-agent (researcher -> planner -> implementer <-> verifier)
  6. Fix-agent returns {status: "fixed"|"failed", ...}
  7. If fixed: Report "Awaiting browser verification (Phase 5)"
     Ticket remains in `fixing` state
  8. If failed: Ticket already in `failed` state, move on
  9. Loop to step 1
```

### New Flow (Phase 5)

```
SKILL.md dispatch loop:
  1. Find next queued ticket
  2. Transition: queued -> investigating
  3. Dispatch investigation-agent
  4. Transition: investigating -> fixing
  5. Dispatch fix-agent
  6. Fix-agent returns {status: "fixed"|"failed", ...}
  7. If fixed:
     a. Transition: fixing -> verifying
     b. Dispatch browser-verifier agent
     c. If PASS:
        i.   Git commit (add files_changed, commit with fix: <title>)
        ii.  Update ticket: commit_hash in frontmatter
        iii. Transition: verifying -> done
     d. If FAIL:
        i.   Write failure evidence to ticket
        ii.  Check if attempts remain (current_attempt < max_attempts)
        iii. If yes: re-enter fix-agent loop (back to step 5)
             Ticket stays in verifying (or transitions: verifying -> fixing)
        iv.  If no: Revert via fix-agent Step 6 logic, transition: verifying -> failed
  8. If failed: already handled, move on
  9. After all tickets processed: run session summary, display to user
  10. Loop to step 1
```

### Pattern 1: Browser Verification Agent (New Agent File)

**What:** A new agent (`browser-verifier.md`) that reads the ticket's investigation section, re-runs the original reproduction steps, and determines if the bug is fixed.

**Why a separate agent (not inline in SKILL.md):**
- SKILL.md is a dispatcher -- it never does investigation/verification work directly (Critical Rule 1)
- Browser verification requires reading ticket bodies (reproduction steps) -- SKILL.md must never read ticket bodies (Critical Rule 2)
- The verification logic is non-trivial (step re-execution, state comparison, evidence capture)
- Follows the established pattern: investigation-agent.md for investigation, browser-verifier.md for browser verification

**Agent structure:**
```yaml
---
name: browser-verifier
description: "Re-runs reproduction steps to verify bug is fixed after code changes"
tools: Read, Write, Edit, Bash(playwright-cli:*), Bash(mkdir *), Bash(node ~/.claude/skills/fixme/scripts/fixme-tools.cjs *), Glob, Grep
model: inherit
skills:
  - playwright-cli
---
```

**Workflow:**
1. Read ticket: extract reproduction steps and expected behavior from `<!-- section: investigation -->`
2. Read structured fields: extract affected URL, expected behavior, actual behavior
3. Navigate to affected URL via `playwright-cli open`
4. Wait for page ready
5. Execute each reproduction step from the investigation section
6. Take snapshot after each step, compare against expected behavior
7. Capture screenshot evidence
8. Determine verdict: PASS (bug is gone, expected behavior present) or FAIL (bug still present or new issue)
9. Write verification report to `<ticket-folder>/verifications/`
10. Write evidence to `<!-- section: verification -->` in ticket
11. Return one-liner summary

**Confidence:** HIGH -- follows investigation-agent.md pattern exactly, reuses the reproduction steps format already established.

### Pattern 2: Browser Verification Failure Re-Entry

**What:** When browser verification fails, the ticket re-enters the fix-agent loop. This uses the existing retry mechanism but with a twist: the failure evidence comes from browser verification, not the build/lint/test verifier.

**How it works with the state machine:**

The state machine supports `verifying -> investigating` (retry) with a reason and `current_attempt` increment. But the Phase 5 context says browser verification failure counts toward `max_attempts` in the same pool as fix attempts. This means:

1. Fix-agent runs (attempt 1, uses its internal cycles). Succeeds at build/lint/test.
2. Browser verifier runs. FAILS.
3. `current_attempt` was already incremented by the fix-agent's internal loop (or stays at its current value).
4. Re-dispatch fix-agent with the browser verification failure report as additional context.
5. The fix-agent reads the browser verification report and uses it as feedback for a new plan.

**Key insight:** The existing `max_attempts` in the ticket frontmatter controls the OUTER budget. The fix-agent's internal `max_verify_cycles` controls the inner build/lint/test loop. Browser verification is a THIRD layer outside the fix-agent. The simplest approach:

- SKILL.md maintains a browser verification attempt counter
- Each browser-verify fail increments it
- Total budget = `max_attempts` (default 3), shared between fix-agent runs and browser verification failures
- When budget exhausted: revert (same as fix-agent Step 6 logic) and transition to failed

**State transitions for the retry path:**

Option A (use existing `verifying -> investigating` retry):
```
fixing -> verifying (browser verification)
verifying -> investigating (browser fail, retry)
investigating -> fixing (re-enter fix loop)
fixing -> verifying (browser verification again)
verifying -> done (success)
```

Option B (keep in `fixing` and re-dispatch fix-agent directly):
```
fixing -> verifying (browser verification)
verifying FAIL: stay in verifying, re-dispatch fix-agent somehow
```

**Recommendation: Option A.** It uses the state machine as designed. The `verifying -> investigating` retry path already exists, requires a reason, and increments `current_attempt`. Then `investigating -> fixing` re-enters the fix loop. This is more state transitions but uses the system correctly. The orchestrator skips re-running the investigation agent on retry (it goes straight to dispatching fix-agent with browser failure context).

Actually, on re-examination, Option A is problematic: `investigating -> fixing` implies the investigation step should run. But the investigation already ran. And the fix-agent starts from Step 1 (read ticket) every time. The key is that `verifying -> investigating` transitions are designed for when the whole cycle needs to restart. Then `investigating -> fixing` happens, then fix-agent is re-dispatched.

**Simpler approach:** The orchestrator can short-circuit: on `verifying -> investigating` retry, skip the investigation dispatch and go directly to `investigating -> fixing` + fix-agent dispatch, passing the browser verification report path as additional context. This is consistent with the pattern -- the state machine doesn't mandate that the investigation agent must run in `investigating` state, only that the state machine tracks where the ticket is.

**Confidence:** HIGH -- state machine supports this exact pattern.

### Pattern 3: Atomic Git Commit

**What:** After browser verification PASS, create one commit with only the fix-relevant files.

**Flow:**
```bash
# 1. Get files changed from ticket frontmatter (already populated by fix-agent)
# files_changed: [src/components/LoginButton.tsx, src/components/LoginButton.test.tsx]

# 2. Stage only those files
git add src/components/LoginButton.tsx src/components/LoginButton.test.tsx

# 3. Create commit with conventional format
git commit -m "fix: resolve login redirect loop"

# 4. Capture commit hash
COMMIT_HASH=$(git rev-parse HEAD)

# 5. Update ticket frontmatter with commit_hash
# (via Edit tool on ticket.md)
```

**Important:** The commit message uses `fix: <ticket title>` with NO ticket number (per user decision). The title comes from the ticket's `slug` field, converted to readable form (e.g., `login-redirect-loop` -> `resolve login redirect loop`). Actually, the title is in the ticket's markdown heading (`# NNNN: Title`). The orchestrator needs to extract it. Since SKILL.md cannot read ticket bodies (Critical Rule 2), the commit step should either:
- Use the slug (already available from `ticket list` output) and convert it to a title
- Or add a `title` field to the `ticket list` JSON output

**Recommendation:** The slug-to-title conversion is already implemented in fixme-tools.cjs (`ticketRename` does it). Extract it as a reusable function. Or more simply: add a `title` field to the `ticket list` output by reading the first markdown heading from the ticket.

Actually, the simpler approach: the orchestrator can derive the title from the slug (already has it from `ticket list`/`ticket next`). The slug is `login-redirect-loop`, which becomes `Login Redirect Loop`. The commit message becomes `fix: login redirect loop` (lowercase). This is good enough and avoids reading the ticket body.

**Confidence:** HIGH -- git operations are straightforward and well-understood.

### Pattern 4: Session Summary Display

**What:** Format the `session summary` JSON output as a readable terminal table.

**Current `session summary` output:**
```json
{
  "session": "fix-20260223-143000",
  "created": "2026-02-23T14:30:00Z",
  "completed": "2026-02-23T15:45:00Z",
  "duration_seconds": 4500,
  "total_tickets": 5,
  "counts": { "done": 3, "failed": 1, "skipped": 1 },
  "tickets": [
    { "number": "0001", "slug": "login-button-broken", "state": "done", "total_seconds": 185 },
    { "number": "0002", "slug": "sidebar-overflow", "state": "done", "total_seconds": 120 },
    ...
  ]
}
```

**Recommended terminal display format:**
```
Session Complete: fix-20260223-143000

  # | Bug                    | Status  | Time
 ---|------------------------|---------|------
  1 | Login Button Broken    | done    | 3m 5s
  2 | Sidebar Overflow       | done    | 2m 0s
  3 | Form Validation        | done    | 4m 12s
  4 | Nav Menu Flickering    | failed  | 5m 30s
  5 | Footer Alignment       | skipped | 0m 10s

Summary: 3 fixed, 1 failed, 1 skipped | Total: 75m 0s
```

This is output by the SKILL.md orchestrator as a normal text message (markdown table renders well in terminal). The orchestrator reads the JSON from `session summary`, formats it, and displays.

**Confidence:** HIGH -- straightforward formatting of existing data.

### Anti-Patterns to Avoid

- **SKILL.md reading ticket bodies for reproduction steps:** The browser verification agent reads the ticket. SKILL.md only reads frontmatter via `fixme-tools.cjs`.
- **Committing .fixme/ artifacts in the fix commit:** Only source code changes go in the commit. `.fixme/` is not tracked by git (presumably in `.gitignore`). If it IS tracked, the commit should explicitly list only `files_changed` files.
- **Browser verification agent modifying source code:** The browser verifier is read-only for source code. It only writes to the ticket's verification section and assets directory.
- **Reverting on browser verification failure:** Per user decision, do NOT revert on browser verification failure. Keep changes in place and re-enter the fix loop. Only revert on FINAL failure.
- **Running browser verification inside the fix-agent:** Browser verification happens AFTER the fix-agent returns, at the SKILL.md orchestrator level. The fix-agent handles build/lint/test; SKILL.md handles browser verification and commit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State transitions | Manual frontmatter editing | `fixme-tools.cjs ticket transition` | Validates transitions, computes durations, maintains log |
| Session summary data | Custom ticket scanning | `fixme-tools.cjs session summary` | Already computes per-ticket stats, state counts, durations |
| File change tracking | Custom diff tracking | `files_changed` from ticket frontmatter (populated by fix-agent) | Already computed and stored by Phase 4 |
| Reproduction step parsing | Custom extraction from ticket | Browser verifier reads the investigation section directly | Investigation agent writes structured steps in a consistent format |
| Git commit creation | Complex git scripting | Simple `git add <files> && git commit -m "..."` | Straightforward and reliable |

**Key insight:** Phase 5 mostly wires together existing capabilities. The browser verification agent is the only genuinely new component. Everything else (state transitions, session summary, file tracking, git operations) already exists.

## Common Pitfalls

### Pitfall 1: .fixme/ Directory in Git Commits

**What goes wrong:** The `git add` command could accidentally include `.fixme/` artifacts (ticket files, screenshots, research, plans) in the fix commit.

**Why it happens:** If `.fixme/` is not in `.gitignore`, and the orchestrator uses `git add .` instead of staging specific files.

**How to avoid:**
- Always use `git add <specific files>` from the `files_changed` list, NEVER `git add .` or `git add -A`
- Verify `.fixme/` is in `.gitignore` (it should be -- if not, add it as a prerequisite)
- The orchestrator should check `git status` after staging to confirm only expected files are staged

**Warning signs:** Commit includes `.fixme/` paths in `git diff --cached --name-only`.

### Pitfall 2: Browser Verification Running Before Page Updates

**What goes wrong:** The fix was applied to source code, but the browser still shows the old version. Browser verification fails even though the fix is correct.

**Why it happens:** The dev server may not have recompiled/hot-reloaded yet. Or the browser has cached the old page.

**How to avoid:**
- After fix-agent returns (code changes applied), wait for HMR to process or do a full page reload
- The browser verifier should: (1) reload the page (`playwright-cli open <url>` or `playwright-cli run-code "async page => { await page.reload(); }"`), (2) wait for `networkidle`, (3) then run reproduction steps
- Check `dev_server.hmr` from project context -- if true, a brief wait (2-3 seconds) before verification is wise

**Warning signs:** Browser verification fails with the page showing stale content that doesn't match the applied code changes.

### Pitfall 3: max_attempts Budget Confusion

**What goes wrong:** The fix-agent uses `max_attempts` for its internal outer loop (re-plan attempts). Browser verification failures also count against `max_attempts`. If the fix-agent uses all 3 attempts internally but succeeds at build/lint/test, there are 0 attempts left for browser verification retries.

**Why it happens:** The `max_attempts` budget is shared between fix-agent retries and browser verification retries (per user decision).

**How to avoid:**
- The fix-agent should NOT consume all `max_attempts` internally. It should return success after its first successful build/lint/test pass, preserving remaining attempts for browser verification.
- Currently the fix-agent's outer loop runs up to `max_attempts` only on FAILURE. On first PASS, it returns immediately. So this is only a problem if the fix-agent fails multiple times before succeeding.
- The orchestrator needs to track total attempts across both layers: fix-agent attempts + browser verification failures
- If fix-agent used 2 attempts and browser verification fails, there's 1 attempt left for the whole re-cycle

**Implementation detail:** The `current_attempt` field in ticket frontmatter tracks this. The fix-agent increments it on internal retries. Browser verification failure triggers `verifying -> investigating` which also increments it. The state machine's max_attempts enforcement (`current_attempt < max_attempts`) handles this automatically IF the fix-agent correctly uses the ticket's `current_attempt` rather than its own internal counter.

**Warning signs:** Ticket hits `current_attempt >= max_attempts` before browser verification gets a chance.

### Pitfall 4: Fix-Agent Re-Entry After Browser Failure

**What goes wrong:** The fix-agent is re-dispatched after browser verification fails, but it doesn't know about the browser failure. It re-runs from scratch (research -> plan -> implement -> verify) instead of focusing on what the browser verifier found wrong.

**Why it happens:** The fix-agent reads the ticket folder for context. If the browser verification report isn't in the right place or the fix-agent doesn't know to look for it, the context is lost.

**How to avoid:**
- Browser verification reports go to `<ticket-folder>/verifications/` (same directory the fix-agent's verifier uses)
- Name them distinctly: `NNNN-browser-verify-<attempt>.md` vs `NNNN-verify-<attempt>-<cycle>.md`
- When re-dispatching fix-agent, include the browser verification report path in the Task prompt
- The fix-agent's researcher runs ONCE (per Phase 4 decision), so re-dispatch starts at the planner step
- The planner reads previous verifications (both build/lint/test and browser) and plans accordingly

**Warning signs:** Fix-agent on re-entry repeats the exact same fix that already passed build/lint/test but failed browser verification.

### Pitfall 5: Commit Title Derivation from Slug

**What goes wrong:** The slug `intake-tmp-a7b3` (from temporary intake slugs) produces a nonsensical commit message: `fix: intake tmp a7b3`.

**Why it happens:** During intake, tickets get temporary slugs that are later renamed. But if the rename fails or the slug wasn't updated, the commit message inherits the temp slug.

**How to avoid:**
- Verify the slug is not a temp slug before committing. Temp slugs match pattern `intake-tmp-*`.
- If temp slug detected, read the ticket heading for the real title (exception to SKILL.md not reading bodies -- or add title to frontmatter/CLI output)
- Better: add a `title` field to the ticket list/next CLI output so the orchestrator has it without reading the ticket body

**Warning signs:** Commit messages containing `intake-tmp` or similar non-descriptive strings.

### Pitfall 6: State Machine Transition Ordering for Re-Entry

**What goes wrong:** After browser verification FAIL, the orchestrator needs to transition `verifying -> investigating` (retry), then `investigating -> fixing`, then re-dispatch fix-agent. But the fix-agent's Step 3 also does `ticket transition fixing`. This means the fix-agent would try to transition from `fixing` to `fixing` (same state), which would fail.

**Why it happens:** The fix-agent assumes it receives a ticket in `investigating` state and transitions to `fixing` itself. But on re-entry from browser verification, the ticket is already in `fixing` state (after `investigating -> fixing`).

**How to avoid:**
- Option A: The fix-agent checks the current state before transitioning. If already in `fixing`, skip the transition.
- Option B: The orchestrator transitions all the way to `fixing` before re-dispatching, and the fix-agent skips Step 3 on re-entry.
- Option C: Make the fix-agent idempotent for the `fixing` transition -- if already in `fixing`, no-op.

**Recommendation:** Option A is cleanest. The fix-agent reads the ticket state in Step 1 and only transitions in Step 3 if NOT already in `fixing`. This is a minor adjustment to fix-agent.md.

**Warning signs:** `fixme-tools.cjs ticket transition` error: "Invalid transition: fixing -> fixing".

## Code Examples

### Example 1: Browser Verifier Agent Workflow

```markdown
# Browser Verifier (browser-verifier.md)

## Workflow

### Phase 1: Read Ticket
- Read ticket.md from the ticket folder
- Extract from investigation section:
  - Reproduction steps (numbered list under "#### Reproduction Steps")
  - Reproduction evidence (screenshots, console errors)
  - Reproduction status (CONFIRMED/PARTIAL)
- Extract from structured fields:
  - Affected URL
  - Expected behavior
  - Actual behavior (the bug)

### Phase 2: Navigate and Reload
- playwright-cli open <affected-url>
- playwright-cli run-code "async page => { await page.waitForLoadState('networkidle'); }"
- Wait 2-3 seconds for HMR to settle
- playwright-cli snapshot (baseline after reload)

### Phase 3: Execute Reproduction Steps
- For each step from investigation:
  - Execute via playwright-cli (click, fill, type, etc.)
  - Take snapshot after each step
  - Compare against the bug behavior
- After all steps: take final snapshot and screenshot

### Phase 4: Determine Verdict
- PASS: Bug symptom is gone AND expected behavior is present
- FAIL: Bug symptom still present OR expected behavior not achieved

### Phase 5: Write Evidence
- Write verification report to verifications/NNNN-browser-verify-<N>.md
- Write screenshot to assets/
- Append to ticket's <!-- section: verification -->

### Phase 6: Return Summary
- "Browser verified #NNNN: PASS -- <description of correct behavior>"
- "Browser verified #NNNN: FAIL -- <what's still wrong>"
```

### Example 2: SKILL.md Dispatch Loop Update (After Fixer Returns Success)

```markdown
d. **Handle fixer result:**
   - If fixer returned "Fixed #NNNN: ..." (success):

     i. **Transition ticket to verifying:**
        ```bash
        node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> verifying
        ```

     ii. **Dispatch browser verifier via Task tool:**
        ```
        First, read ~/.claude/skills/fixme/agents/browser-verifier.md for your role instructions.

        Verify this fix in the browser:
        - Ticket folder: <ticket-folder-dir>
        - Project context: .fixme/project-context.yaml
        - Dev server URL: <dev_server.url from project context>
        ```

     iii. **After browser verifier returns:**
        Read verifier's return summary.

        - If "Browser verified #NNNN: PASS":
          a. **Create git commit:**
             Read ticket state to get files_changed and slug.
             ```bash
             git add <file1> <file2> ...
             git commit -m "fix: <title from slug>"
             ```
          b. **Record commit hash:**
             ```bash
             git rev-parse HEAD
             ```
             Use Edit to set commit_hash in ticket frontmatter.
          c. **Transition to done:**
             ```bash
             node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> done
             ```
          d. Report to user: "Fixed and committed #NNNN: <summary>"

        - If "Browser verified #NNNN: FAIL":
          a. Check if attempts remain (read current_attempt and max_attempts from ticket)
          b. If attempts remain:
             Transition: verifying -> investigating (with reason from failure)
             Then transition: investigating -> fixing
             Re-dispatch fix-agent with browser failure context
          c. If no attempts remain:
             Revert code: git checkout <base_commit> -- . && git clean -fd --exclude=.fixme/
             Transition: verifying -> failed (with reason)
             Report to user: "Failed to fix #NNNN after all attempts"
```

### Example 3: Git Commit Sequence

```bash
# Files changed by the fix (from ticket frontmatter files_changed field)
# e.g., files_changed: [src/components/LoginButton.tsx, src/components/__tests__/LoginButton.test.tsx]

# Stage only fix files
git add src/components/LoginButton.tsx src/components/__tests__/LoginButton.test.tsx

# Create commit with conventional prefix, no ticket number
git commit -m "fix: login button broken"

# Capture the new commit hash
git rev-parse HEAD
# -> abc1234567890...
```

### Example 4: Session Summary Formatting

```markdown
# Terminal output by SKILL.md orchestrator:

Session Complete: fix-20260223-143000 (75m 0s)

  # | Bug                    | Status  | Time
 ---|------------------------|---------|------
  1 | Login Button Broken    | done    | 3m 5s
  2 | Sidebar Overflow       | done    | 2m 0s
  3 | Form Validation        | done    | 4m 12s
  4 | Nav Menu Flickering    | failed  | 5m 30s
  5 | Footer Alignment       | skipped | 0m 10s

3 fixed, 1 failed, 1 skipped
```

## Discretion Recommendations

### Browser Verification Agent Structure

**Recommendation: New agent file (`browser-verifier.md`)**

Rationale:
1. SKILL.md is a dispatcher -- Critical Rule 1 says "NEVER investigate bugs yourself." Browser verification is verification work, not dispatch.
2. Critical Rule 2 says "NEVER read ticket bodies." The browser verifier MUST read the investigation section for reproduction steps.
3. The investigation agent already established the pattern: a specialized agent for browser-based work with `playwright-cli` access.
4. Keeps the orchestrator lean (FIXR-03 requirement).

The agent is structurally similar to the investigation agent but with a focused scope:
- Input: ticket folder path, project context, dev server URL
- Output: PASS/FAIL verdict with evidence
- Tools: same as investigation agent (Read, Write, Edit, Bash(playwright-cli:*), etc.)
- Returns one-liner summary

**Confidence:** HIGH -- follows established patterns and respects critical rules.

### Session Summary Table Format

**Recommendation: Simple markdown table with state breakdown**

```
Session Complete: <session-name> (<total-duration>)

  # | Bug                    | Status  | Time
 ---|------------------------|---------|------
  N | Title From Slug        | state   | Xm Ys

X fixed, Y failed, Z skipped
```

- Title derived from slug (already a convention: `slug.split('-').map(capitalize).join(' ')`)
- Duration formatted as `Xm Ys` for readability
- Status uses raw state names (done/failed/skipped/queued/investigating/fixing/verifying)
- For early stop: non-terminal state tickets shown as-is (e.g., "queued", "fixing")
- Commit hash NOT included in the summary line (keep it minimal per user decision, and most users don't care about hashes)

**Confidence:** MEDIUM -- formatting is a stylistic choice. The planner may adjust.

### Commit Hash in Summary

**Recommendation: Omit from summary table, available in ticket frontmatter**

The summary table is for human overview. Commit hashes are for tooling. Including them clutters the table. The hash is recorded in ticket frontmatter for anyone who needs it.

**Confidence:** MEDIUM -- reasonable default, could be reconsidered.

## Integration Points

### Where Phase 5 Hooks Into Existing Code

1. **SKILL.md Dispatch Loop, step 5d:** Currently says "Awaiting browser verification (Phase 5)." Phase 5 replaces this with the browser verification dispatch, commit, and close logic.

2. **SKILL.md Auto-Close / Graceful Stop:** Currently runs `session summary` and displays to user. Phase 5 enhances the display formatting.

3. **fix-agent.md Step 3:** May need adjustment to handle re-entry (skip transition if already in `fixing` state).

4. **fix-agent.md Task dispatch prompts:** On re-entry from browser verification failure, the planner receives the browser verification report as "previous failure feedback."

5. **fixme-tools.cjs:** May need a minor enhancement -- adding `title` to `ticket list`/`ticket next` output so the orchestrator can derive commit messages without reading ticket bodies.

6. **Ticket template `<!-- section: verification -->`:** Already has the comment "Browser verification evidence added by Phase 5 verification agent." Ready for use.

7. **State machine:** All transitions already defined. No changes needed: `fixing -> verifying`, `verifying -> done`, `verifying -> investigating` (retry), `verifying -> failed`.

### What Phase 5 Does NOT Change

- Investigation agent (Phase 3) -- untouched
- Fix researcher, planner, implementer, verifier (Phase 4) -- untouched (except minor fix-agent.md re-entry adjustment)
- State machine transitions -- already defined
- Ticket template structure -- already has needed sections and fields
- fixme-tools.cjs core functions -- ticketCreate, ticketTransition, sessionSummary work as-is

## Open Questions

1. **Title for Commit Message**
   - What we know: Commit format is `fix: <ticket title>`. SKILL.md cannot read ticket bodies (Critical Rule 2). The slug is available from `ticket list`/`ticket next` output.
   - What's unclear: Is slug-to-title conversion good enough? Temp slugs like `intake-tmp-a7b3` would produce bad commit messages.
   - Recommendation: Add a `title` field to `ticket list`/`ticket next` JSON output by reading the first heading from the ticket file. Minor addition to fixme-tools.cjs. This gives the orchestrator access to the real title without violating the "don't read ticket bodies" rule (the title is metadata, not investigation content).

2. **Transition Path for Browser Verification Re-Entry**
   - What we know: State machine supports `verifying -> investigating` (retry) and `investigating -> fixing`. Fix-agent Step 3 transitions to `fixing`.
   - What's unclear: When re-dispatching fix-agent after browser failure, should the orchestrator transition `verifying -> investigating -> fixing` (two hops) before dispatch? Or should fix-agent handle it?
   - Recommendation: Orchestrator does `verifying -> investigating` (with browser failure reason), then `investigating -> fixing`, then dispatches fix-agent. Fix-agent skips Step 3 if already in `fixing`. This is explicit and uses the state machine correctly.

3. **.fixme/ in .gitignore**
   - What we know: Git commits should only include fix files, not `.fixme/` artifacts.
   - What's unclear: Is `.fixme/` already in `.gitignore`? If the project doesn't have a `.gitignore` entry for it, the commit step could accidentally include artifacts.
   - Recommendation: As a prerequisite check, verify `.fixme/` is in `.gitignore` before the first commit. If not, add it. Or simply always use explicit `git add <files>` from `files_changed` and never use `git add .`.

## Sources

### Primary (HIGH confidence)
- Codebase: `.claude/skills/fixme/SKILL.md` -- current dispatch loop with Phase 5 placeholder at line 231
- Codebase: `.claude/skills/fixme/agents/fix-agent.md` -- fixer coordinator workflow, return structure, Step 6 revert logic
- Codebase: `.claude/skills/fixme/agents/fix-verifier.md` -- build/lint/test verification pattern (template for browser verifier)
- Codebase: `.claude/skills/fixme/agents/investigation-agent.md` -- reproduction step format, browser interaction pattern, agent MD convention
- Codebase: `.claude/skills/fixme/scripts/fixme-tools.cjs` -- session summary implementation, ticket list/next output format, transition validation
- Codebase: `.claude/skills/fixme/references/state-machine.md` -- transition matrix confirming all needed paths exist
- Codebase: `.claude/skills/fixme/templates/ticket.md` -- verification section, commit_hash field, files_changed field
- Codebase: `.planning/phases/04-fix-commit/04-RESEARCH.md` -- Phase 4 architecture patterns and code examples
- Codebase: `.planning/phases/04-fix-commit/04-VERIFICATION.md` -- Phase 4 verification confirming all artifacts exist

### Secondary (MEDIUM confidence)
- Git documentation: `git add`, `git commit`, `git rev-parse HEAD` behavior
- Phase 5 CONTEXT.md: user decisions on commit format, browser verification semantics, session summary

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing tools
- Architecture: HIGH -- follows established patterns, state machine already supports all transitions
- Browser verification agent: HIGH -- direct analog of investigation agent pattern
- Commit mechanics: HIGH -- straightforward git operations
- Session summary: HIGH -- data already exists, just formatting
- Re-entry logic: MEDIUM -- state transition ordering needs careful implementation, potential for pitfall #6
- Pitfalls: HIGH -- identified from direct codebase analysis

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain, no external dependencies)
