# Fixme Skill -- Data Flow Map

Complete map of inputs, outputs, shared state, and data flow between all agents.

## Agent Topology

```
                                    User
                                      |
                                      v
                               +-----------+
                               | SKILL.md  |  (Orchestrator)
                               +-----------+
                                /    |     \
                               v     v      v
                          Intake  Invest.  Fix-Agent
                                           /   |   \   \
                                          v    v    v    v
                                      Resrch Plan Impl Verify
```

**Dispatch chain:** SKILL.md dispatches 3 top-level agents. Fix-Agent is itself a coordinator that dispatches 4 sub-agents sequentially. All dispatch uses `Task` tool with `subagent_type: "general-purpose"`.

---

## Shared State (Files on Disk)

All inter-agent communication goes through files. No agent passes data to another via in-memory state.

### 1. Ticket File (`<session-dir>/NNNN-slug/ticket.md`)

The central shared artifact. Every agent reads it; several write to specific sections.

| Section / Field | Written By | Read By |
|-----------------|-----------|---------|
| **Frontmatter: `state`** | `fixme-tools.cjs ticket transition` (called by each agent at Phase 0, and SKILL.md for terminal states) | SKILL.md (after every agent return), Fix-Agent (after sub-agent returns) |
| **Frontmatter: `number`, `slug`** | `fixme-tools.cjs ticket create` + Intake (rename) | All agents (for logging, file naming) |
| **Frontmatter: `base_commit`** | Fix-Agent (Step 2, before dispatching researcher) | SKILL.md (on fix failure, for git revert) |
| **Frontmatter: `files_changed`** | Fix-Agent (after implementer returns, Step 4b) | SKILL.md (for `git add` on commit) |
| **Frontmatter: `commit_hash`** | SKILL.md (after git commit) | -- |
| **Frontmatter: `failure_reason`** | `fixme-tools.cjs ticket transition` (on `--reason` flag) | SKILL.md (for user reporting) |
| **Frontmatter: `current_attempt`** | `fixme-tools.cjs` (auto-incremented on `verifying -> planning` retry) | Fix-Agent (loop control), Fix-Planner (attempt number) |
| **Frontmatter: `max_attempts`** | Template default (3) | Fix-Agent (loop bound), Investigation-Agent (repro retry limit) |
| **Frontmatter: `max_timeout_minutes`** | Template default (30) | Fix-Agent (timeout check before each dispatch) |
| **Frontmatter: `transitions[]`** | `fixme-tools.cjs` (appended on every transition) | -- (audit trail) |
| **Frontmatter: `durations{}`** | `fixme-tools.cjs` (computed on state exit) | Session summary command |
| **`<!-- section: original-report -->`** | Intake Agent (Step 2) | Investigation Agent (Phase 1) |
| **`<!-- section: structured-fields -->`** | Intake Agent (Step 4) | Investigation Agent (Phase 1), Fix-Verifier (Phase 5 -- expected/actual behavior) |
| **`<!-- section: investigation -->`** | Investigation Agent (Phase 5, append-only) | Fix-Researcher (Phase 1), Fix-Planner (Phase 1 on retry), Fix-Verifier (Phase 5 -- repro steps) |
| **`<!-- section: fix -->`** | Fix-Agent (status bullets after each sub-agent) | Fix-Planner (Phase 1 on retry -- prior attempt history) |

**Key pattern:** SKILL.md and Fix-Agent NEVER read ticket body sections. They only interact with frontmatter via `fixme-tools.cjs` commands. Sub-agents read the body sections they need.

### 2. Session File (`<session-dir>/session.md`)

| Field | Written By | Read By |
|-------|-----------|---------|
| `status` (active/completed) | `fixme-tools.cjs session create` / session close | SKILL.md (resume flow) |
| `active_intakes[]` | SKILL.md (add on intake dispatch, remove on intake return) | SKILL.md (auto-close check, resume flow) |
| `tickets_done/failed/skipped/total` | `fixme-tools.cjs session summary` | SKILL.md (summary display) |
| `duration_seconds` | `fixme-tools.cjs session summary` | SKILL.md (summary display) |

### 3. Project Context (`.fixme/project-context.yaml`)

| Field | Written By | Read By |
|-------|-----------|---------|
| `dev_server.url` | `context detect` + user confirmation | SKILL.md (browser setup, passed to agents), Investigation Agent, Fix-Verifier |
| `dev_server.command` | `context detect` + user confirmation | SKILL.md (server start) |
| `build.command` | `context detect` + user confirmation | Fix-Verifier (Phase 3a) |
| `lint.command` | `context detect` + user confirmation | Fix-Verifier (Phase 3b) |
| `test.command` | `context detect` + user confirmation | Fix-Verifier (Phase 3c) |
| `framework`, `dev_server.hmr` | `context detect` + user confirmation | Investigation Agent, Fix-Researcher (context) |

**Lifecycle:** Written once on first session start (with user confirmation). Read silently on subsequent starts. Never modified without user approval.

### 4. Research File (`<ticket-folder>/research/NNNN-research.md`)

| Written By | Read By |
|-----------|---------|
| Fix-Researcher (Phase 5, written as last step) | Fix-Planner (Phase 1) |

Single-write, single-reader. NOT rewritten on retry -- same research is reused across all attempts.

### 5. Plan File (`<ticket-folder>/plans/NNNN-plan-N.md`)

| Written By | Read By |
|-----------|---------|
| Fix-Planner (Phase 4, one per attempt) | Fix-Implementer (Phase 1), Fix-Verifier (Phase 1 + Phase 4 plan coverage) |

One file per attempt. On retry, a new plan file is created (e.g., `0003-plan-2.md`). Old plans remain as history.

### 6. Verification Report (`<ticket-folder>/verifications/NNNN-verify-N.md`)

| Written By | Read By |
|-----------|---------|
| Fix-Verifier (Phase 6, one per attempt) | Fix-Agent (Step 4d -- verdict + failure summary), Fix-Planner (Phase 1 on retry), Fix-Implementer (Phase 1 on re-cycle) |

### 7. Screenshots / Assets (`<ticket-folder>/assets/`)

| File Pattern | Written By | Read By |
|-------------|-----------|---------|
| `repro-*.png` | Investigation Agent (Phase 2) | Fix-Verifier (comparison reference) |
| `fix-check-*.png` | Fix-Implementer (Phase 4, optional) | -- (debug aid) |
| `verify-*.png` | Fix-Verifier (Phase 5c) | -- (evidence) |
| User screenshots | Intake Agent (copied from user paths) | Investigation Agent (Phase 1) |

---

## Agent-by-Agent I/O

### Intake Agent

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Ticket file (edited):
  - Ticket file path              - original-report section filled
  - Verbatim bug description      - structured-fields section filled
  - Assets directory path         - Renamed with descriptive slug
                                  - Screenshots copied to assets/
Reads from disk:
  - Ticket file (template)      Return value:
  - Codebase (5 Glob/Grep max)   "Queued #NNNN: <Title>"
```

**State transitions owned:** None (ticket stays `queued`).

### Investigation Agent

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Ticket file (appended):
  - Ticket file path              - investigation section (### Attempt N)
  - Project context path            - Reproduction steps
  - Asset directory path             - Reproduction evidence
  - Dev server URL                   - Affected files + code snippets
                                     - Root cause hypothesis
Reads from disk:
  - Ticket file (report +        Assets:
    structured fields +             - repro-*.png screenshots
    prior attempts if retry)
  - Project context YAML          Return value:
  - Codebase (Grep/Glob/Read)      "Investigated #NNNN: ..."
  - Browser (snapshot/console/      or "BLOCKER #NNNN: ..."
    network via playwright-cli)
```

**State transitions owned:** `queued -> investigating`

### Fix-Agent (Coordinator)

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Ticket file (edited):
  - Ticket folder path            - base_commit frontmatter
  - Project context path          - files_changed frontmatter
                                  - fix section (status bullets
Reads from disk:                    per sub-agent with durations
  - Ticket frontmatter (via         and work summaries)
    fixme-tools.cjs)
  - Research file (existence      Return value:
    check via Glob)                 { status, ticket_path,
  - Plan file (existence             commit_hash, attempts,
    check via Glob)                  duration, summary }
  - Verification report
    (existence check + verdict)
  - git diff --name-only
    (for files_changed)
```

**State transitions owned:** None. All transitions delegated to sub-agents.

### Fix-Researcher

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Research file:
  - Ticket folder path            <ticket>/research/NNNN-research.md
  - Project context path            - Affected files table
                                     - Code flow trace
Reads from disk:                     - Dependencies
  - Ticket file (investigation       - Risks
    section -- root cause,           - Approach candidates (1-3)
    affected files, evidence)
  - Project context YAML          Return value:
  - Codebase (max 15 tool calls)    Work summary (~3-8 lines)
```

**State transitions owned:** `investigating -> researching`

### Fix-Planner

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Plan file:
  - Ticket folder path            <ticket>/plans/NNNN-plan-N.md
  - Attempt number                   - Approach description
  - Previous failure feedback        - Files to modify table
    (path or "first attempt")        - Step-by-step changes
  - Transition reason (retry)        - Expected outcomes
                                     (build/lint/test/browser)
Reads from disk:
  - Ticket file (investigation    Return value:
    + fix section history)          Work summary (~3-8 lines)
  - Research file
  - Previous plan (on retry)
  - Previous verification
    report (on retry)
  - Codebase (Read/Grep for
    feasibility validation)
```

**State transitions owned:** `researching -> planning` (first), `verifying -> planning` (retry, requires `--reason`)

### Fix-Implementer

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Source code changes:
  - Ticket folder path            (files modified per plan)
  - Plan file path
  - Project context path         Optional assets:
  - Verifier feedback (path        fix-check-*.png (visual bugs)
    or "first cycle")
                                Return value:
Reads from disk:                  Work summary (~3-8 lines)
  - Plan file (step-by-step)
  - Verification report
    (on re-cycle)
  - Source code files
    (Read before Edit)
  - Browser (optional visual
    check via playwright-cli)
```

**State transitions owned:** `planning -> implementing`

### Fix-Verifier

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
Task prompt:                    Verification report:
  - Ticket folder path            <ticket>/verifications/NNNN-verify-N.md
  - Plan file path                   - Constraint checklist (build/lint/test/browser)
  - Project context path             - Plan coverage table
  - Attempt number                   - Failure details (on FAIL)
  - Dev server URL                   - Verdict: PASS or FAIL

Reads from disk:                Assets:
  - Plan file (expected            verify-*.png screenshots
    changes list)
  - Ticket file (repro steps,   Return value:
    expected/actual behavior)     Work summary (~3-8 lines)
  - Project context (commands)
  - Source files (plan coverage
    check via Read/Grep)
  - Browser (repro steps replay,
    console, network)
```

**State transitions owned:** `implementing -> verifying`

### SKILL.md (Orchestrator)

```
INPUTS                          OUTPUTS
----------------------------    ----------------------------
$ARGUMENTS:                     Session file:
  - Sub-command (start/resume/    - Created, active_intakes managed
    status/stop/report)
  - Session name (optional)     Ticket frontmatter:
  - Bug description (report)      - commit_hash (after commit)

Reads from disk (via CLI):      Git:
  - Session list/state             - git commit (on fix success)
  - Ticket list/state/next         - git revert (on fix failure)
  - Project context
                                User-facing:
Agent return values:              - Status tables
  - Intake summary                 - Session summaries
  - Investigation summary          - AskUserQuestion prompts
  - Fix-Agent result JSON
```

**State transitions owned:** `verifying -> done`, `[any] -> failed`, `investigating -> skipped`, `queued -> failed/skipped`

---

## Complete Happy-Path Data Flow

```
Step  Agent              Reads                          Writes                         State
----  -----------------  -----------------------------  ----------------------------   --------
 1    SKILL.md           --                             session.md (create)            --
 2    SKILL.md           project-context.yaml           (load or detect+save)          --
 3    SKILL.md           --                             browser opened, login done     --
 4    SKILL.md           --                             ticket.md (create template)    queued
 5    Intake Agent       ticket.md (template)           ticket.md (report, fields)     queued
                         codebase (5 Glob/Grep)         ticket renamed (new slug)
                         user screenshot files           assets/ (copied screenshots)
 6    SKILL.md           ticket list (find next)        active_intakes updated         queued
 7    Invest. Agent      ticket.md (report, fields)     ticket.md (investigation       investigating
                         project-context.yaml             section: repro + root cause)
                         codebase (Grep/Read)           assets/repro-*.png
                         browser (snapshot/console)
 8    SKILL.md           ticket list (check state)      --                             investigating
 9    Fix-Agent          ticket.md (frontmatter)        ticket.md (base_commit)        investigating
10    Fix-Researcher     ticket.md (investigation)      research/NNNN-research.md      researching
                         project-context.yaml
                         codebase (15 calls max)
11    Fix-Agent          Glob (research file exists?)   ticket.md fix section          researching
                                                          (research bullet + summary)
12    Fix-Planner        ticket.md (investigation+fix)  plans/NNNN-plan-1.md           planning
                         research/NNNN-research.md
                         codebase (feasibility)
13    Fix-Agent          Glob (plan file exists?)       ticket.md fix section          planning
                                                          (plan bullet + summary)
14    Fix-Implementer    plans/NNNN-plan-1.md           SOURCE CODE changes            implementing
                         source files (Read)
                         browser (optional check)
15    Fix-Agent          git diff --name-only           ticket.md fix section          implementing
                                                          (implement bullet + summary)
                                                        ticket.md (files_changed)
16    Fix-Verifier       plans/NNNN-plan-1.md           verifications/NNNN-verify-1.md verifying
                         ticket.md (repro steps,        assets/verify-*.png
                           expected/actual behavior)
                         project-context.yaml
                         source files (coverage)
                         browser (repro replay)
17    Fix-Agent          Glob (report exists?)          ticket.md fix section          verifying
                         verification report (verdict)    (verify bullet + summary)
18    SKILL.md           ticket list (state=verifying)  git add + git commit           verifying
                         ticket.md (files_changed,      ticket.md (commit_hash)
                           title)                       ticket transition -> done       done
19    SKILL.md           ticket next (no more queued)   session summary                --
                         session summary command         user output (summary table)
```

---

## Retry Path Data Flow (Verification FAIL)

When the verifier returns FAIL at step 17:

```
Step  Agent              Reads                          Writes                         State
----  -----------------  -----------------------------  ----------------------------   --------
17    Fix-Agent          verification report            ticket.md fix section          verifying
                           (FAIL verdict + details)       (verify FAIL bullet)
                                                        Extracts failure summary
18    Fix-Planner        ticket.md (all history)        plans/NNNN-plan-2.md           planning
                         research/NNNN-research.md        (different approach)
                         plans/NNNN-plan-1.md (prior)
                         verifications/NNNN-verify-1.md
19    Fix-Agent          Glob (plan-2 exists?)          ticket.md fix section          planning
20    Fix-Implementer    plans/NNNN-plan-2.md           SOURCE CODE changes            implementing
                         verifications/NNNN-verify-1.md
                           (failure details)
21    Fix-Agent          git diff --name-only           ticket.md (files_changed)      implementing
22    Fix-Verifier       plans/NNNN-plan-2.md           verifications/NNNN-verify-2.md verifying
                         ticket.md, project-context     assets/verify-*.png
                         browser
23    Fix-Agent          verification report            ticket.md fix section          verifying
                           (PASS or FAIL)
 ...continues to SKILL.md commit (PASS) or next retry / failure...
```

**Key difference on retry:** Researcher is NOT re-dispatched. The same research file is reused. Planner reads prior plan + verification report to design a different approach.

---

## When Is the Ticket File Re-Read from Disk?

| Who | When | What They Read | Why |
|-----|------|----------------|-----|
| SKILL.md | After EVERY agent return | `ticket list` (frontmatter only via CLI) | Never trust in-memory state; context compaction may discard earlier reads |
| SKILL.md | Before commit | `ticket list` (files_changed, title) | Get final state for git operations |
| Fix-Agent | After EVERY sub-agent return | Glob check (artifact exists?) + ticket list | Verify sub-agent produced output; get state |
| Fix-Agent | Before each retry | Verification report | Extract failure details for planner prompt |
| Intake Agent | Step 1 | Full ticket file (template) | Fill in sections |
| Investigation Agent | Phase 1 | Full ticket file (report + fields + prior attempts) | Understand the bug |
| Fix-Researcher | Phase 1 | Full ticket file (investigation section) | Root cause + affected files |
| Fix-Planner | Phase 1 | Full ticket file (investigation + fix history) | Context for plan design |
| Fix-Planner (retry) | Phase 1 | Full ticket + prior plan + verification report | Understand what failed |
| Fix-Verifier | Phase 1 | Plan file | Expected changes |
| Fix-Verifier | Phase 5 | Ticket file (repro steps, expected/actual) | Browser verification script |

**Rule:** SKILL.md and Fix-Agent never read ticket body -- only frontmatter via CLI. Sub-agents read the full file because they need body sections.

---

## Ticket Folder Structure (Complete)

```
.fixme/sessions/<session-name>/
  session.md                          # Session metadata + active_intakes
  NNNN-slug/                          # One folder per ticket
    ticket.md                         # Central ticket file (frontmatter + sections)
    assets/                           # Screenshots and visual evidence
      repro-<description>.png         # Investigation screenshots
      fix-check-<attempt>-<cycle>.png # Implementer sanity check (optional)
      verify-<description>.png        # Verifier evidence
      <user-screenshots>.png          # Copied from user-provided paths
    research/                         # Fix research output
      NNNN-research.md                # One file, reused across retries
    plans/                            # Fix plans (one per attempt)
      NNNN-plan-1.md
      NNNN-plan-2.md                  # Created on retry
    verifications/                    # Verification reports (one per attempt)
      NNNN-verify-1.md
      NNNN-verify-2.md               # Created on retry
```

---

## Cross-Cutting: `fixme-tools.cjs` CLI

All agents interact with shared state through `fixme-tools.cjs`. Direct frontmatter editing is forbidden (except for `base_commit` and `files_changed` by Fix-Agent).

| Command | Called By | Effect |
|---------|----------|--------|
| `ticket create` | SKILL.md (intake dispatch) | Creates ticket folder + template file |
| `ticket rename` | Intake Agent | Renames ticket file + folder with new slug |
| `ticket transition` | Each agent (Phase 0), SKILL.md (terminal states) | Validates transition, updates state, logs transition, computes durations |
| `ticket next` | SKILL.md (dispatch loop) | Returns next `queued` ticket |
| `ticket list` | SKILL.md (after agent returns), Fix-Agent (after sub-agent returns) | Lists all tickets with frontmatter state |
| `session create` | SKILL.md (start flow) | Creates session directory + session.md |
| `session list` | SKILL.md (resume flow) | Lists sessions |
| `session summary` | SKILL.md (auto-close, graceful stop) | Computes session stats |
| `context detect` | SKILL.md (first run) | Auto-detects project config |
| `context load` | SKILL.md (every start/resume), Fix-Verifier | Reads project-context.yaml |
| `context save` | SKILL.md (after user confirmation) | Writes project-context.yaml |
