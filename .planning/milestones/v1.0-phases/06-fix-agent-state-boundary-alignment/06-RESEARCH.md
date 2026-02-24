# Phase 6: Fix Agent State Boundary Alignment - Research

**Researched:** 2026-02-23
**Domain:** State machine redesign, agent dispatch boundaries, sub-agent ownership
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Remove `fixing` state entirely -- replaced by `researching`, `planning`, `implementing`
- New states: `researching` (fix-researcher active), `planning` (fix-planner active), `implementing` (fix-implementer active)
- `verifying` state retained but semantics fixed -- now means "fix-verifier is actively checking" (not post-fix accounting by SKILL.md)
- Remove `verifying -> investigating` transition (dead code)
- Add `verifying -> planning` transition (retry path, requires --reason, increments current_attempt)
- Add `researching -> planning`, `planning -> implementing`, `implementing -> verifying` transitions
- All new non-terminal states (`researching`, `planning`, `implementing`) can transition to `failed`
- Remove `investigating -> fixing` transition (the `fixing` state no longer exists)

New transition matrix:

| From | Valid To States |
|------|----------------|
| `queued` | `investigating`, `skipped`, `failed` |
| `investigating` | `researching`, `skipped`, `failed` |
| `researching` | `planning`, `failed` |
| `planning` | `implementing`, `failed` |
| `implementing` | `verifying`, `failed` |
| `verifying` | `done`, `planning` (retry), `failed` |

State transition ownership -- agents own their transitions:

- **investigation-agent** transitions: `queued -> investigating`
- **fix-researcher** transitions: `investigating -> researching`
- **fix-planner** transitions: `researching -> planning` (first attempt) or `verifying -> planning` (retry)
- **fix-implementer** transitions: `planning -> implementing`
- **fix-verifier** transitions: `implementing -> verifying`
- **SKILL.md** transitions: `verifying -> done` (after commit), `[any non-terminal] -> failed` (cleanup), `investigating -> skipped` (user decision), `queued -> failed` (agent crash)

Fix-agent simplified to single loop:

- Remove inner loop (implement -> verify -> re-implement). Each attempt is: plan -> implement -> verify
- Remove `max_verify_cycles` from ticket template (no longer used)
- On verify FAIL with attempts remaining: loop back to planner (not implementer)
- On verify FAIL with attempts exhausted: return failure -- no cleanup, no state transition
- Cleanup (git revert) and terminal state transition (-> failed) are the orchestrator's (SKILL.md) responsibility, not fix-agent's

Sub-agent ticket output:

- Each sub-agent writes full output to artifact file AND short summary inline in the ticket
- The verifier on FAIL writes detailed findings: what failed, why, what needs to change

SKILL.md dispatch changes:

- Remove `investigating -> fixing` transition before dispatching fix-agent
- After fix-agent returns success: commit files, edit commit_hash, transition `verifying -> done`
- After fix-agent returns failure: git revert, transition `[current state] -> failed`
- Investigation-agent now owns `queued -> investigating` transition (not SKILL.md)
- If investigation agent crashes without transitioning: SKILL.md transitions `queued -> failed`

fix-agent.md INT-01 resolution:

- Remove Step 3 entirely (the `fixing -> fixing` double transition)
- fix-agent no longer does any state transitions -- all sub-agents own their own transitions
- fix-agent only coordinates dispatch order, enforces hard gates, and records timing

Tech debt items included:

- Remove dead `ticket dir` subcommand (ticketDir) from fixme-tools.cjs
- Fix 05-01-SUMMARY.md inaccuracy ("No deviations" despite architectural refactor)

Validation approach:

- Code-level trace: verify no double transitions remain
- Verify fixme-tools.cjs TRANSITIONS constant matches new matrix
- Verify all agent MD files have correct transition commands
- Run fixme-tools.test.cjs to confirm CLI still works with new states

### Claude's Discretion

- Exact wording of state descriptions in state-machine.md
- Whether to add unit tests for new transitions in fixme-tools.test.cjs
- Ordering of sections within updated agent files

### Deferred Ideas (OUT OF SCOPE)

- CLI support for frontmatter fields (base_commit, files_changed, commit_hash) -- currently agents edit frontmatter directly
- Intake agent title derivation inconsistency (derives title manually instead of using `ticket list`)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-01 | Each ticket tracks state: queued -> investigating -> fixing -> verifying -> done/failed | States are being expanded: `fixing` replaced by `researching`, `planning`, `implementing`. The state sequence becomes `queued -> investigating -> researching -> planning -> implementing -> verifying -> done/failed`. Every agent phase is now a visible state in the ticket. |
| STAT-02 | Each state transition is timestamped with duration calculated per phase | All new states (`researching`, `planning`, `implementing`) use the same `ticketTransition()` function which already records timestamps and durations. The `verifying -> planning` retry path increments `current_attempt` (replacing the old `verifying -> investigating` logic). |
| FIXR-01 | Each resolved bug produces exactly one atomic git commit with ticket reference in the message | No change to commit behavior. SKILL.md still commits after fix-agent returns success. The `verifying -> done` transition is now owned by SKILL.md (unchanged). |
| FIXR-05 | The implementation agent iterates in a fix->verify loop -- if verification is unsatisfactory, it retries with a different approach until satisfied or exhausted | The retry loop is simplified: plan -> implement -> verify. On FAIL, loop back to planner (not implementer). The `verifying -> planning` state transition provides visible retry tracking. Inner loop removed; each attempt is a full plan->implement->verify cycle. |
</phase_requirements>

## Summary

This phase is a pure refactoring of the state machine and agent dispatch boundaries. No new functionality is being added -- the same E2E flow (bug report -> investigate -> fix -> verify -> commit -> done) is preserved, but the opaque `fixing` state is replaced by three granular states that reflect which sub-agent is actually active. The core change touches 7 files: `fixme-tools.cjs` (TRANSITIONS constant + requiresReason), `state-machine.md` (complete rewrite), `fix-agent.md` (major simplification), `SKILL.md` (dispatch boundary changes), and 4 sub-agent files (each gains a state transition command).

The most important design insight is that **fix-agent becomes stateless from the state machine's perspective**. It no longer owns any transitions. Instead, each sub-agent it dispatches owns the transition that reflects its own activation. Fix-agent is reduced to a pure coordinator: dispatch order, hard gates, timing, and result collection.

**Primary recommendation:** Execute as a single plan with careful ordering -- update fixme-tools.cjs TRANSITIONS first (since all other changes depend on the valid transition set), then update agent files in dispatch order (investigation-agent -> fix-researcher -> fix-planner -> fix-implementer -> fix-verifier -> fix-agent -> SKILL.md -> state-machine.md), then add tests, then clean up tech debt.

## Architecture Patterns

### Current Architecture (Before Phase 6)

```
SKILL.md                      fix-agent.md
─────────                     ─────────────
queued->investigating (owns)  fixing->fixing (BROKEN: INT-01)
investigating->fixing (owns)  [dispatches sub-agents]
fixing->verifying (dead)      [internal retry, no transitions]
verifying->done (owns)        fixing->failed (owns)
[any]->failed (cleanup)
```

**Problem:** SKILL.md transitions `investigating -> fixing` then dispatches fix-agent. Fix-agent Step 3 attempts `fixing -> fixing` which throws a hard error. The E2E happy path breaks at step 13.

### Target Architecture (After Phase 6)

```
SKILL.md                         Sub-agents
─────────                        ──────────
[no longer owns queued->inv]     investigation-agent: queued->investigating
[no longer owns inv->fixing]     fix-researcher:      investigating->researching
verifying->done (after commit)   fix-planner:         researching->planning (or verifying->planning on retry)
[any non-terminal]->failed       fix-implementer:     planning->implementing
investigating->skipped           fix-verifier:        implementing->verifying
queued->failed (crash cleanup)

fix-agent.md (no state transitions)
─────────────
coordinates: researcher -> planner -> implementer -> verifier
enforces: hard gates, timing, max_attempts
returns: {status, ticket_path, commit_hash: null, attempts, duration, summary}
```

### Pattern: Agent-Owned State Transitions

Each agent that does work owns the state transition that reflects what it's doing:

```
Sub-agent starts -> reads ticket state -> transitions to own state -> does work -> returns result
```

The transition happens at the BEGINNING of the sub-agent's execution (first action after reading the ticket), not at the end. This means:
- If a sub-agent crashes mid-work, the ticket's state accurately reflects where it got stuck
- The orchestrator can read the ticket state to know which sub-agent was active
- No double-transition bugs are possible because each state has exactly one valid "next active state"

### Pattern: Orchestrator-Owned Terminal Transitions

Terminal transitions (`-> done`, `-> failed`, `-> skipped`) remain with SKILL.md because they require cleanup actions (git commit, git revert) that span multiple concerns.

### Anti-Patterns to Avoid

- **Double transitions:** Never have both the dispatcher and the dispatched agent attempt the same transition. The new design eliminates this by assigning each transition to exactly one owner.
- **Stateless retries:** Never retry without visible state transitions. The old design retried internally (researcher->planner->implementer->verifier loop) without state changes, making retry cycles invisible. The new `verifying -> planning` transition makes retries visible.
- **Orchestrator doing cleanup in agent scope:** fix-agent previously owned git revert and `-> failed` transitions. Now fix-agent returns failure without cleanup, and SKILL.md handles revert + state transition. This separates "what failed" (fix-agent determines) from "how to handle failure" (SKILL.md determines).

## Current State Inventory (What Changes Where)

### 1. fixme-tools.cjs (TRANSITIONS constant + requiresReason)

**Current** (line 529-537):
```javascript
const TRANSITIONS = {
  'queued':        ['investigating', 'skipped', 'failed'],
  'investigating': ['fixing', 'skipped', 'failed'],
  'fixing':        ['verifying', 'failed'],
  'verifying':     ['done', 'investigating', 'failed'],
  'done':          [],
  'failed':        [],
  'skipped':       [],
};
```

**Target:**
```javascript
const TRANSITIONS = {
  'queued':         ['investigating', 'skipped', 'failed'],
  'investigating':  ['researching', 'skipped', 'failed'],
  'researching':    ['planning', 'failed'],
  'planning':       ['implementing', 'failed'],
  'implementing':   ['verifying', 'failed'],
  'verifying':      ['done', 'planning', 'failed'],
  'done':           [],
  'failed':         [],
  'skipped':        [],
};
```

**Changes:**
- Remove `fixing` state entirely
- Add `researching`, `planning`, `implementing` states
- Change `investigating` targets: `fixing` -> `researching`
- Change `verifying` retry: `investigating` -> `planning`

**requiresReason** (line 542-547):

**Current:**
```javascript
function requiresReason(fromState, toState) {
  if (toState === 'failed') return true;
  if (toState === 'skipped') return true;
  if (fromState === 'verifying' && toState === 'investigating') return true;
  return false;
}
```

**Target:**
```javascript
function requiresReason(fromState, toState) {
  if (toState === 'failed') return true;
  if (toState === 'skipped') return true;
  if (fromState === 'verifying' && toState === 'planning') return true;
  return false;
}
```

**Change:** `investigating` -> `planning` in the retry reason check.

**current_attempt increment** (line 722-725):

**Current:**
```javascript
if (currentState === 'verifying' && newState === 'investigating') {
  fm.current_attempt = (fm.current_attempt || 0) + 1;
}
```

**Target:**
```javascript
if (currentState === 'verifying' && newState === 'planning') {
  fm.current_attempt = (fm.current_attempt || 0) + 1;
}
```

**Durations cumulative bug (line 704-709):**
Current code always overwrites `durations[newState]` with `{ entered: now }`, losing any prior `seconds` value. The state-machine.md claims durations are cumulative. Under the new design, states are never revisited (`planning` on retry is a new visit, but the code still overwrites the old `planning` entry). This is an existing bug but also exists in the new design (planning could be visited 1-3 times across retry attempts). The planner should fix this if they want cumulative durations for retry states -- adding old seconds to the new entry.

**Dead code: ticketDir** (line 890-895):

```javascript
function ticketDir(ticketPath) {
  if (!fs.existsSync(ticketPath)) {
    return error(`Ticket file not found: ${ticketPath}`);
  }
  return output({ dir: path.dirname(ticketPath) });
}
```

Remove this function and its case in the switch statement (line 1403-1404). Also remove from the "Valid:" list in the default error message (line 1406).

### 2. state-machine.md (Complete Rewrite)

The entire document needs to be rewritten to reflect:
- 9 states (add `researching`, `planning`, `implementing`; remove `fixing`)
- New transition matrix
- Updated happy path: `queued -> investigating -> researching -> planning -> implementing -> verifying -> done`
- Updated retry path: `verifying -> planning` (not `verifying -> investigating`)
- Updated retry semantics: `current_attempt` increments on `verifying -> planning`
- Updated reason requirements: `verifying -> planning` requires reason
- State descriptions matching the 1:1 agent mapping
- Transition log example with new states
- Duration tracking for new states (note: `planning` is visited multiple times on retry)

### 3. fix-agent.md (Major Simplification)

**Remove:**
- Step 3 (lines 40-44): The `fixing -> fixing` transition (INT-01 root cause)
- Step 6 (lines 154-176): Revert + `-> failed` transition (now SKILL.md's responsibility)
- Inner loop (Step 5b): The implement -> verify -> re-implement cycle
- `max_verify_cycles` from Step 1 frontmatter extraction
- Rule 4 reference to "Changes accumulate between retry attempts"

**Restructure:**
- Step 1: Read ticket (keep, but remove `max_verify_cycles` extraction)
- Step 2: Record base state and start time (keep as-is)
- Step 3 (new): Dispatch fix-researcher (was Step 4). Researcher now owns `investigating -> researching` transition.
- Step 4 (new): Outer loop (attempts 1..max_attempts). Each attempt = planner -> implementer -> verifier.
  - Planner owns `researching -> planning` (first attempt) or `verifying -> planning` (retry)
  - Implementer owns `planning -> implementing`
  - Verifier owns `implementing -> verifying`
  - On PASS: return success (no state transition, no commit)
  - On FAIL with attempts remaining: continue loop (planner gets verification feedback)
  - On FAIL with attempts exhausted OR timeout: return failure (no state transition, no revert, no cleanup)
- Step 5 (new): Return structured result (was Step 7). Same format as current.

**Key behavior change:** fix-agent no longer does ANY state transitions. All transitions are delegated to sub-agents. fix-agent no longer does cleanup (revert, `-> failed`). It returns a result and SKILL.md handles everything terminal.

### 4. SKILL.md (Dispatch Boundary Changes)

**Dispatch loop changes (lines 176-264):**

Step 2 (line 176-179): REMOVE the `queued -> investigating` transition. Investigation-agent now owns this.

Step 3 (line 181-191): Update dispatch prompt -- investigation-agent now needs to know it should transition the ticket.

Step 5 (line 204-263): Rewrite the fix dispatch section:
- Remove `investigating -> fixing` transition (line 207-209). The `fixing` state no longer exists.
- Dispatch fix-agent with ticket already in `investigating` state (after investigation) -- but the fix-researcher will transition it to `researching`.
- After fix-agent returns SUCCESS: ticket is in `verifying` state. SKILL.md transitions `verifying -> done`.
- After fix-agent returns FAILURE: ticket is in whatever non-terminal state it was in when failure occurred. SKILL.md does git revert + transitions `[current state] -> failed`.

Step 5c handling: Currently SKILL.md transitions `fixing -> verifying` before commit. This is now unnecessary -- the ticket is already in `verifying` (the fix-verifier transitioned `implementing -> verifying`).

**Crash handling:**
- If investigation-agent crashes without transitioning from `queued`: SKILL.md reads ticket state (still `queued`), transitions `queued -> failed`.
- If fix-agent crashes: SKILL.md reads ticket state, transitions `[current state] -> failed`.

### 5. investigation-agent.md (Gains State Transition)

Add at the beginning of the workflow (before Phase 1 or as a new Phase 0):
```bash
node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> investigating
```

This is the FIRST thing the investigation-agent does after receiving the ticket path. It replaces SKILL.md step 2 in the dispatch loop.

### 6. fix-researcher.md (Gains State Transition)

Add at the beginning of the workflow (before Phase 1 or as a new Phase 0):
```bash
node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> researching
```

The researcher also needs the `Bash(node ~/.claude/skills/fixme/scripts/fixme-tools.cjs *)` tool permission in its frontmatter header (currently only has `Read, Write, Glob, Grep`).

### 7. fix-planner.md (Gains State Transition)

Add at the beginning of the workflow:
```bash
node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> planning
```

On first attempt: this transitions `researching -> planning`.
On retry: this transitions `verifying -> planning` (requires `--reason` flag).

The planner needs the `Bash(node ~/.claude/skills/fixme/scripts/fixme-tools.cjs *)` tool permission.

The fix-agent dispatch prompt for the planner on retry must include `--reason` text from the verifier's failure findings.

### 8. fix-implementer.md (Gains State Transition)

Add at the beginning of the workflow:
```bash
node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> implementing
```

The implementer already has `Bash` access so it can run the transition command.

### 9. fix-verifier.md (Gains State Transition)

Add at the beginning of the workflow:
```bash
node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> verifying
```

The verifier already has `Bash(node ~/.claude/skills/fixme/scripts/fixme-tools.cjs *)` tool permission.

### 10. ticket.md template (Remove max_verify_cycles)

**Current** (line 16):
```yaml
max_verify_cycles: 3
```

Remove this field. The inner loop no longer exists.

### 11. 05-01-SUMMARY.md (Fix Inaccuracy)

**Current** (line 84-86):
```markdown
## Deviations from Plan

None - plan executed exactly as written.
```

**Target:** Acknowledge the architectural refactor (browser-verifier.md was absorbed into fix-verifier.md during Phase 5 execution, per commit 7bb602d).

## Common Pitfalls

### Pitfall 1: Forgetting the --reason flag on verifying -> planning

**What goes wrong:** The planner dispatches the transition but forgets `--reason`. fixme-tools.cjs throws a hard error. The fix-agent loop breaks.
**Why it happens:** `requiresReason` requires a reason for `verifying -> planning`. The fix-agent must pass the verifier's failure summary as the reason when dispatching the planner on retry.
**How to avoid:** The fix-agent dispatch prompt for the planner on retry must explicitly include the `--reason` flag text. The fix-agent should extract a short summary from the verifier's return and pass it.
**Warning signs:** "requires a --reason" error from fixme-tools.cjs during retry attempts.

### Pitfall 2: Sub-agent tool permissions

**What goes wrong:** fix-researcher or fix-planner attempts to run `fixme-tools.cjs ticket transition` but doesn't have `Bash(node ...)` in its tools list.
**Why it happens:** These agents were originally read-only researchers/planners with no state machine interaction.
**How to avoid:** Explicitly add `Bash(node ~/.claude/skills/fixme/scripts/fixme-tools.cjs *)` to the tools list in the frontmatter of fix-researcher.md and fix-planner.md.
**Warning signs:** "Tool not allowed" errors in sub-agent execution.

### Pitfall 3: SKILL.md crash handler reading stale state

**What goes wrong:** Investigation-agent crashes BEFORE transitioning `queued -> investigating`. SKILL.md reads ticket state and sees `queued`. But SKILL.md no longer transitions `queued -> investigating` itself, so it must transition `queued -> failed` instead.
**Why it happens:** The previous design had SKILL.md own the `queued -> investigating` transition before dispatching. Now the agent owns it, so a crash means the transition never happened.
**How to avoid:** SKILL.md's crash handler must read the ticket's current state from disk and transition from THAT state to `failed`, not assume a specific state.
**Warning signs:** Tickets stuck in `queued` state after agent crashes.

### Pitfall 4: Durations not cumulative for planning state on retry

**What goes wrong:** On retry, `verifying -> planning` transition overwrites the `planning` duration entry. The time spent in `planning` on attempt 1 is lost.
**Why it happens:** Line 709 of fixme-tools.cjs: `durations[newState] = { entered: now }` always overwrites.
**How to avoid:** Fix the durations code to preserve cumulative seconds: before overwriting, save the existing `seconds` value and add it back after the state exits. OR document this as a known limitation (planning duration reflects only the latest attempt).
**Warning signs:** Session summary shows implausibly short planning durations for tickets that were retried.

### Pitfall 5: fix-agent still referencing fixing state or max_verify_cycles

**What goes wrong:** After refactoring, leftover references to `fixing` state or `max_verify_cycles` cause confusion or errors.
**Why it happens:** Incomplete refactoring. Multiple files reference these concepts.
**How to avoid:** After making all changes, grep the entire `.claude/skills/fixme/` directory for `fixing` (as a state name, not as a word like "fixing the bug") and `max_verify_cycles`. Remove all references.
**Warning signs:** Grep results showing `fixing` in transition commands or state descriptions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State validation | Custom validation per agent | fixme-tools.cjs `ticket transition` | Single source of truth for valid transitions, already handles timestamps, durations, reason validation |
| Retry tracking | Agent-internal counters | `current_attempt` in ticket frontmatter via fixme-tools.cjs | Persists across agent restarts, visible in ticket state |

## Code Examples

### New TRANSITIONS constant (fixme-tools.cjs)

```javascript
const TRANSITIONS = {
  'queued':         ['investigating', 'skipped', 'failed'],
  'investigating':  ['researching', 'skipped', 'failed'],
  'researching':    ['planning', 'failed'],
  'planning':       ['implementing', 'failed'],
  'implementing':   ['verifying', 'failed'],
  'verifying':      ['done', 'planning', 'failed'],
  'done':           [],
  'failed':         [],
  'skipped':        [],
};
```

### Sub-agent transition pattern (fix-researcher.md example)

```markdown
### Phase 0: Transition State

Transition the ticket to researching:
\```bash
node ~/.claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-folder>/ticket.md researching
\```
If this fails, return immediately with error. Do not proceed.
```

### fix-agent retry dispatch (planner on retry)

```
First, read ~/.claude/skills/fixme/agents/fix-planner.md for your role instructions.

Create a fix plan:
- Ticket folder: <ticket-folder>
- Attempt number: <N>
- Previous failure feedback: <path to last verification report>
- Transition reason: "<short summary of why verification failed>"
```

The planner uses the "Transition reason" to construct the `--reason` flag for the `verifying -> planning` transition.

### SKILL.md crash handler pattern

```
After sub-agent returns:
1. Read ticket state from disk: `ticket list <session-dir>`
2. If ticket in non-terminal state AND agent returned error/empty:
   - Run git revert if needed (check for uncommitted changes)
   - Transition [current state] -> failed --reason "Agent crashed: <error>"
```

## Discretion Recommendations

### Unit tests for new transitions

**Recommendation: YES, add tests.** The test file currently tests `queued -> investigating`, `queued -> failed`, and basic list/next/create operations. It does NOT test:
- The new states (`researching`, `planning`, `implementing`)
- The new transitions (`investigating -> researching`, `researching -> planning`, etc.)
- The retry transition (`verifying -> planning` with --reason)
- The removal of `fixing` state

Add tests for:
1. Happy path: `queued -> investigating -> researching -> planning -> implementing -> verifying -> done`
2. Retry path: `verifying -> planning` with --reason, verify current_attempt increments
3. Invalid transitions: `investigating -> fixing` should now fail (the old path is gone)
4. New failure paths: `researching -> failed`, `planning -> failed`, `implementing -> failed`

### Ordering of sections within updated agent files

**Recommendation:** Add the state transition as a "Phase 0" or "Step 0" at the very beginning of the workflow, before any reading or processing. This makes it clear that the transition is the first action, and if it fails, the agent should bail immediately. Pattern:

```
### Phase 0: Claim State
[transition command]
If this fails, return error immediately.

### Phase 1: [original first phase]
...
```

### State descriptions in state-machine.md

**Recommendation:** Use active present tense tied to the specific sub-agent:

| State | Description |
|-------|-------------|
| `queued` | Ticket created, waiting to be picked up by the dispatch loop |
| `investigating` | Investigation agent is analyzing the bug: reading code, reproducing in browser, forming a root cause hypothesis |
| `researching` | Fix-researcher is exploring the codebase around the root cause: finding relevant files, tracing code paths, identifying approach candidates |
| `planning` | Fix-planner is designing a step-by-step fix plan based on research findings (or re-planning after verification failure) |
| `implementing` | Fix-implementer is executing code changes according to the fix plan |
| `verifying` | Fix-verifier is checking the implementation: running build/lint/test, checking plan coverage, browser-verifying the bug is gone |
| `done` | Fix verified and committed. Ticket complete. |
| `failed` | Ticket could not be resolved. Reason recorded in `failure_reason` field. |
| `skipped` | Ticket skipped. Reason recorded in `failure_reason` field. |

## Open Questions

1. **Cumulative durations for retry states**
   - What we know: The code at line 709 overwrites `durations[newState]` on re-entry. Under the new design, `planning` can be visited 1-3 times.
   - What's unclear: Should we fix the cumulative duration bug as part of this phase, or document it as a known limitation?
   - Recommendation: Fix it. The change is 3-4 lines in `ticketTransition()`: save old seconds before overwriting, add them back when the state exits. This is small and directly relevant since `planning` is now a retry target.

2. **Session summary display of new states**
   - What we know: The session summary format in SKILL.md mentions raw state names. The new states (`researching`, `planning`, `implementing`) will appear in early-stop summaries.
   - What's unclear: Does the session summary code in fixme-tools.cjs need updating to recognize the new states?
   - Recommendation: Check `sessionSummary()` in fixme-tools.cjs. It likely just reads the `state` field from frontmatter, which is a free-form string. No code change needed unless it has hardcoded state lists.

3. **fix-agent timeout and crash: which state is the ticket in?**
   - What we know: fix-agent no longer transitions states. Sub-agents do. If fix-agent crashes mid-dispatch (e.g., between planner finishing and implementer starting), the ticket is in `planning` state.
   - What's unclear: SKILL.md's crash handler needs to handle any of the new intermediate states. It currently assumes the ticket is in `fixing` on fix-agent failure.
   - Recommendation: SKILL.md should read the actual state from disk and transition from whatever state to `failed`. The transition matrix already allows all non-terminal states to transition to `failed`.

## Sources

### Primary (HIGH confidence)
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/scripts/fixme-tools.cjs` (lines 529-537, 542-547, 654-732, 890-895, 1390-1406) -- current TRANSITIONS matrix, transition logic, dead code
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/references/state-machine.md` -- current state machine documentation
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/SKILL.md` (lines 176-264) -- current dispatch loop with transition commands
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/agents/fix-agent.md` -- current fix coordinator with Step 3 (INT-01) and inner loop
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/agents/fix-researcher.md` -- no current state transitions
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/agents/fix-planner.md` -- no current state transitions
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/agents/fix-implementer.md` -- no current state transitions
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/agents/fix-verifier.md` -- no current state transitions
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/agents/investigation-agent.md` -- no current state transitions
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/templates/ticket.md` -- current template with max_verify_cycles field
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.claude/skills/fixme/scripts/fixme-tools.test.cjs` -- current test suite (22 tests)
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.planning/v1.0-MILESTONE-AUDIT.md` -- INT-01, INT-02 gap details
- `/Users/denis/projects/gelato/ai/frontend-bug-stream/.planning/phases/05-verification-close-loop/05-01-SUMMARY.md` -- inaccurate "No deviations" claim

## Metadata

**Confidence breakdown:**
- State machine redesign: HIGH -- all code paths traced, every file read, exact line numbers identified
- Architecture (agent ownership): HIGH -- clear 1:1 mapping between agents and states, no ambiguity
- Pitfalls: HIGH -- identified from actual code analysis (durations bug at line 709, missing tool permissions in frontmatter, crash handler state assumptions)

**Research date:** 2026-02-23
**Valid until:** Indefinite (internal tooling, no external dependencies)
