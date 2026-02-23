# Phase 6: Fix Agent State Boundary Alignment - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Close audit integration gaps (INT-01, INT-02) and unblock the E2E happy path. Replace the opaque `fixing` state with granular states that mirror sub-agent phases 1:1. Every agent that does work owns the state transition that reflects what it's doing. The state machine becomes a live map of ticket progress.

</domain>

<decisions>
## Implementation Decisions

### State machine redesign

- Remove `fixing` state entirely — replaced by `researching`, `planning`, `implementing`
- New states: `researching` (fix-researcher active), `planning` (fix-planner active), `implementing` (fix-implementer active)
- `verifying` state retained but semantics fixed — now means "fix-verifier is actively checking" (not post-fix accounting by SKILL.md)
- Remove `verifying → investigating` transition (dead code)
- Add `verifying → planning` transition (retry path, requires --reason, increments current_attempt)
- Add `researching → planning`, `planning → implementing`, `implementing → verifying` transitions
- All new non-terminal states (`researching`, `planning`, `implementing`) can transition to `failed`
- Remove `investigating → fixing` transition (the `fixing` state no longer exists)

### New transition matrix

| From | Valid To States |
|------|----------------|
| `queued` | `investigating`, `skipped`, `failed` |
| `investigating` | `researching`, `skipped`, `failed` |
| `researching` | `planning`, `failed` |
| `planning` | `implementing`, `failed` |
| `implementing` | `verifying`, `failed` |
| `verifying` | `done`, `planning` (retry), `failed` |

### State transition ownership — agents own their transitions

- **investigation-agent** transitions: `queued → investigating`
- **fix-researcher** transitions: `investigating → researching`
- **fix-planner** transitions: `researching → planning` (first attempt) or `verifying → planning` (retry)
- **fix-implementer** transitions: `planning → implementing`
- **fix-verifier** transitions: `implementing → verifying`
- **SKILL.md** transitions: `verifying → done` (after commit), `[any non-terminal] → failed` (cleanup), `investigating → skipped` (user decision), `queued → failed` (agent crash)

SKILL.md no longer transitions `investigating → fixing` or `fixing → verifying`. The `fixing` state is gone.

### Fix-agent simplified to single loop

- Remove inner loop (implement → verify → re-implement). Each attempt is: plan → implement → verify
- Remove `max_verify_cycles` from ticket template (no longer used)
- On verify FAIL with attempts remaining: loop back to planner (not implementer)
- On verify FAIL with attempts exhausted: return failure — no cleanup, no state transition
- Cleanup (git revert) and terminal state transition (`→ failed`) are the orchestrator's (SKILL.md) responsibility, not fix-agent's

### Sub-agent ticket output

- Each sub-agent (researcher, planner, implementer, verifier) writes:
  1. Full output to artifact file (research/, plans/, verifications/)
  2. Short summary inline in the ticket — path to artifact + 1-2 line result description
- The ticket's fix section becomes self-contained — readable without opening artifact files
- The verifier on FAIL writes detailed findings: what failed, why it was not accepted, what needs to change — this is the feedback loop for the next planning attempt

### SKILL.md dispatch changes

- Remove `investigating → fixing` transition before dispatching fix-agent
- After fix-agent returns success: commit files, edit commit_hash, transition `verifying → done`
- After fix-agent returns failure: git revert (checkout + clean --exclude=.fixme/), transition `[current state] → failed`
- Investigation-agent now owns `queued → investigating` transition (not SKILL.md)
- If investigation agent crashes without transitioning: SKILL.md transitions `queued → failed`

### fix-agent.md INT-01 resolution

- Remove Step 3 entirely (the `fixing → fixing` double transition)
- fix-agent no longer does any state transitions — all sub-agents own their own transitions
- fix-agent only coordinates dispatch order, enforces hard gates, and records timing

### Tech debt items included

- Remove dead `ticket dir` subcommand (ticketDir) from fixme-tools.cjs — never called by any agent
- Fix 05-01-SUMMARY.md inaccuracy ("No deviations" despite architectural refactor)

### Validation approach

- Code-level trace: verify no double transitions remain in transition matrix, fix-agent.md, and SKILL.md dispatch path
- Verify fixme-tools.cjs TRANSITIONS constant matches new matrix
- Verify all agent MD files have correct transition commands
- Run fixme-tools.test.cjs to confirm CLI still works with new states

### Claude's Discretion

- Exact wording of state descriptions in state-machine.md
- Whether to add unit tests for new transitions in fixme-tools.test.cjs
- Ordering of sections within updated agent files

</decisions>

<specifics>
## Specific Ideas

- "Every agent that does something sets the state of the ticket to what it actually does right now" — 1:1 agent-state mapping is the core design principle
- "There is no inner loop" — each attempt is plan → implement → verify, full stop
- "The cleaning is the task of the orchestrator" — fix-agent returns result, SKILL.md handles cleanup and terminal transitions
- "The verifier needs to write into the ticket file exactly why it failed and what failed, why it did not accept the work and what needs to change" — verification failure feedback drives re-planning

</specifics>

<deferred>
## Deferred Ideas

- CLI support for frontmatter fields (base_commit, files_changed, commit_hash) — currently agents edit frontmatter directly, needs a `ticket set-field` or similar command
- Intake agent title derivation inconsistency (derives title manually instead of using `ticket list`) — minor source-of-truth issue

</deferred>

---

*Phase: 06-fix-agent-state-boundary-alignment*
*Context gathered: 2026-02-23*
