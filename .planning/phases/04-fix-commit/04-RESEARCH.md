# Phase 4: Fix & Commit - Research

**Researched:** 2026-02-21
**Domain:** Agent orchestration, fix-verify loops, directory restructuring, git operations
**Confidence:** HIGH

## Summary

Phase 4 delivers the fixer agent system (a coordinator with 4 internal sub-agents), restructures the session directory layout from flat to ticket-centric, integrates fixer dispatch into SKILL.md, and implements the fix-verify loop with retry and revert logic. The core challenge is not any single piece but the coordination: the fixer agent must orchestrate Researcher -> Planner -> Implementer <-> Verifier with configurable retry limits, accumulate changes across attempts, revert everything on final failure, and keep structured artifacts in the new ticket-centric directory layout. No commits are created in Phase 4 -- that's Phase 5's responsibility.

The codebase is well-established with clear patterns. The investigation agent (Phase 3) provides the direct template for how sub-agents are structured: YAML frontmatter with tools/model/skills, phased workflow with structured output, one-liner return summaries, and progressive ticket writing. The fixme-tools.cjs state machine already supports the full transition chain (`investigating -> fixing -> verifying -> done/failed`), and the transition matrix in code already includes the `verifying -> investigating` retry path. The main new work is: 5 new agent MD files, directory restructuring in fixme-tools.cjs, SKILL.md updates for fixer dispatch, and the structured artifact templates that are left to Claude's discretion.

**Primary recommendation:** Split into 4 plans: (1) directory restructuring + fixme-tools.cjs updates, (2) fixer agent MD files (fix-agent.md + 4 sub-agents), (3) SKILL.md dispatch integration, (4) model inheritance cleanup (retroactive).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Fixer Agent Architecture

- Fixer is a single Task sub-agent dispatched by the orchestrator (SKILL.md)
- Fixer internally manages 4 sub-agents, each with its own agent MD file:
  1. **Researcher** (`fix-researcher.md`) -- explores codebase around root cause, finds relevant files/code paths, produces structured research output
  2. **Planner** (`fix-planner.md`) -- reads full ticket + research output, designs fix plan with structured template
  3. **Implementer** (`fix-implementer.md`) -- executes code changes per plan, has browser access + code + terminal
  4. **Verifier** (`fix-verifier.md`) -- checks constraints (from project context) + plan coverage, loops back to implementer if gaps found
- All 4 sub-agents dispatched as separate Task calls from the fixer
- Fixer orchestrator agent file: `fix-agent.md`
- All agent files live in `.claude/skills/fixme/agents/`

#### Fixer Flow

- Sequence: Researcher -> Planner -> Implementer <-> Verifier
- Researcher runs ONCE per bug (not re-run on retry attempts)
- Planner re-plans each attempt with feedback from previous failure
- Changes accumulate between attempts -- no revert between re-plan attempts
- Previous attempt results feed into next attempt

#### Retry & Failure

- All loop limits configurable, default to 3:
  - Verifier -> Implementer cycles: 3 (before triggering re-plan)
  - Re-plan attempts: 3 (full planner -> implementer -> verifier cycles)
- Both timeout AND attempt count enforced -- whichever hits first
- On final failure: revert ALL changes via git (git checkout changed files)
- Each attempt's approach + why it failed recorded in ticket (detailed log)

#### Verifier Behavior

- Checks constraints from project context (build, lint, tests -- dynamic, not hardcoded)
- Runs full test suite to catch regressions, not just related tests
- Checks plan coverage: nothing missed, nothing done incorrectly
- Produces structured report: pass/fail per check with details on failures
- Verification reports persisted as separate files per attempt

#### Sub-Agent Models

- **Global decision (applies to ALL phases, retroactive):** All sub-agents inherit the orchestrator's model by default
- Each sub-agent's model is configurable to override the inherited value
- Default model setting in config: `inherit` (meaning use orchestrator's model)
- This replaces any hardcoded model values in existing phases (e.g., Phase 2 intake used `model: sonnet`)

#### Commit Discipline

- **No commits in Phase 4** -- commit happens after Phase 5 browser verification
- Single atomic commit per bug when verification passes
- Commit message format: `fix: short description [FIXME-NNNN]` (ticket ref at end)
- Commit includes: code changes + ticket updates + all artifacts (plans, research, verifications)
- Pre-commit hooks respected (not bypassed)

#### Directory Restructuring (Ticket-Centric)

- **Restructure session layout** from flat folders to per-ticket folders:
  ```
  session/
    NNNN-slug/
      ticket.md
      assets/
        screenshot.png
      research/
        NNNN-research-slug.md
      plans/
        NNNN-plan-slug-1.md
        NNNN-plan-slug-2.md
      verifications/
        NNNN-verify-slug-1.md
  ```
- All artifacts for a ticket co-located in its folder
- This replaces the current flat `assets/` and `tickets/` structure from Phase 1/2
- Restructuring is part of Phase 4 (first plan), not a separate phase
- Affects existing `fixme-tools.cjs` commands and SKILL.md paths

#### Orchestrator Dispatch

- Fixer dispatched as Task sub-agent (separate context from orchestrator)
- Orchestrator passes the ticket folder path -- fixer reads everything it needs from there
- Bugs processed sequentially (one fixer at a time), not in parallel
- FIFO order (oldest queued ticket first) -- already established
- Orchestrator logs dispatch decisions in session file (audit trail)
- Fixer returns structured result: `{status, ticket_path, commit_hash, attempts, duration, summary}`
- Orchestrator reads ticket state from disk after fixer returns (never trusts in-memory)

#### Ticket State Updates

- Each stage updates the ticket in real-time (fixing started, research done, plan created, implementation started, verification result)
- Ticket references all artifacts by relative path
- Per-step timing recorded: researcher duration, planner duration, implementer duration, verifier duration
- On failure: detailed per-attempt log in ticket (the last plan file serves as "what might work" hint)

### Claude's Discretion

- Structured template design for research output (sections: affected files, code flow, dependencies, risks, approach candidates)
- Structured template design for plan output (sections: approach, files to modify, step-by-step changes, expected outcomes)
- Structured template design for verification report (sections: constraint checklist, plan coverage, failure details)
- Exact naming convention for artifact files within ticket folders
- Timeout default value
- How fixer orchestrator coordinates the internal sub-agent loop

### Deferred Ideas (OUT OF SCOPE)

- Parallel bug fixing (multiple fixers working on different bugs simultaneously) -- future optimization, not v1
- Git worktree isolation per fix -- decided against for v1, may reconsider if conflicts become an issue
- Browser verification as commit gate -- this is Phase 5's responsibility
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIXR-01 | Each resolved bug produces exactly one atomic git commit with ticket reference in the message | Phase 4 prepares for this but does NOT create commits -- commit discipline section documents the format (`fix: short description [FIXME-NNNN]`). Phase 5 gates commits after browser verification. Phase 4's fixer tracks changed files for the future commit. |
| FIXR-02 | If the implementation agent cannot fix a bug, it marks the ticket as failed with a reason and moves to the next queued bug | Fixer agent returns structured result with status; on final failure, reverts all changes via git, transitions ticket to `failed` with reason. Orchestrator reads state from disk and advances to next queued ticket. State machine already supports `fixing -> failed` and `verifying -> failed`. |
| FIXR-03 | The orchestrator main loop stays lean -- all investigation, fixing, and verification work happens in subagents | Fixer dispatched as single Task sub-agent from SKILL.md. Orchestrator passes only the ticket folder path. Fixer internally dispatches 4 sub-agents. Orchestrator never reads ticket bodies or investigation details. |
| FIXR-05 | The implementation agent iterates in a fix->verify loop -- if verification is unsatisfactory, it retries with a different approach until satisfied or exhausted | Two-level retry: Verifier->Implementer cycles (default 3) for minor fixes, then re-plan attempts (default 3) with Planner->Implementer->Verifier. Each attempt recorded as structured artifact. On exhaustion, revert and fail. |
| STAT-03 | Ticket records fix details: files changed, investigation notes, verification evidence, commit hash | Ticket template gains new sections for fix details. Artifacts (research, plans, verifications) stored as separate files in ticket folder, referenced by relative path. Per-step timing in frontmatter. Commit hash left null until Phase 5. |
</phase_requirements>

## Standard Stack

### Core

This phase creates no new dependencies. It is entirely agent instruction files (MD), tooling updates (CJS), and orchestrator updates (MD).

| Component | File | Purpose | Why Standard |
|-----------|------|---------|--------------|
| fixme-tools.cjs | `.claude/skills/fixme/scripts/fixme-tools.cjs` | CLI tool for ticket/session operations | Already exists, extended for new directory layout |
| SKILL.md | `.claude/skills/fixme/SKILL.md` | Orchestrator instructions | Already exists, extended for fixer dispatch |
| Agent MD files | `.claude/skills/fixme/agents/*.md` | Sub-agent instruction files | Established pattern from intake-agent.md and investigation-agent.md |
| Ticket template | `.claude/skills/fixme/templates/ticket.md` | Ticket structure | Already exists, extended for fix/verification sections |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `git diff --name-only HEAD` | Track which files were changed by the fixer | Before revert on failure, for artifact recording |
| `git checkout -- <files>` | Revert changes on final failure | Only after all retry attempts exhausted |
| `git stash` | Alternative revert mechanism | Not used -- `git checkout` is simpler for targeted file revert |

### No External Libraries

Phase 4 adds zero new npm dependencies. All work is in markdown instruction files and the existing `fixme-tools.cjs` Node.js script. The fixer agents use only tools already available in the Claude Code environment (Read, Write, Edit, Bash, Glob, Grep, Task, playwright-cli).

## Architecture Patterns

### Current Directory Layout (Phase 1/2/3)

```
.fixme/sessions/<session>/
  session.md
  tickets/
    0001-login-button-broken.md
    0002-sidebar-overflow.md
  assets/
    0001/
      repro-login-no-response.png
    0002/
      repro-sidebar-mobile.png
```

### New Directory Layout (Phase 4 -- Ticket-Centric)

```
.fixme/sessions/<session>/
  session.md
  0001-login-button-broken/
    ticket.md
    assets/
      repro-login-no-response.png
    research/
      0001-research-login-handler.md
    plans/
      0001-plan-add-null-check-1.md
      0001-plan-refactor-form-ref-2.md
    verifications/
      0001-verify-null-check-1.md
      0001-verify-refactor-form-2.md
  0002-sidebar-overflow/
    ticket.md
    assets/
      repro-sidebar-mobile.png
    research/
      0002-research-css-overflow.md
    plans/
      0002-plan-add-overflow-hidden-1.md
    verifications/
      0002-verify-overflow-hidden-1.md
```

### Pattern 1: Fixer Agent Hierarchy (Coordinator + 4 Sub-Agents)

**What:** The fixer agent (`fix-agent.md`) is dispatched by SKILL.md as a single Task sub-agent. It internally dispatches 4 specialized sub-agents via their own Task calls.

**When to use:** Every time a ticket transitions from `investigating` to `fixing`.

**Architecture:**
```
SKILL.md (orchestrator)
  |
  +-- Task: fix-agent.md (fixer coordinator)
        |
        +-- Task: fix-researcher.md    (runs ONCE)
        +-- Task: fix-planner.md       (runs per attempt)
        +-- Task: fix-implementer.md   (runs per attempt, may loop with verifier)
        +-- Task: fix-verifier.md      (runs per attempt, may loop with implementer)
```

**Data flow:**
- SKILL.md passes: ticket folder path
- fix-agent.md passes to researcher: ticket folder path, project context path
- fix-agent.md passes to planner: ticket folder path, research output path, previous failure feedback (if retry)
- fix-agent.md passes to implementer: ticket folder path, plan output path, project context path
- fix-agent.md passes to verifier: ticket folder path, plan output path, project context path

### Pattern 2: Two-Level Retry Loop

**What:** The fixer has two nested loops:
1. **Inner loop (Implementer <-> Verifier):** Verifier finds issues, implementer fixes them. Up to N cycles (default 3).
2. **Outer loop (Re-plan):** If inner loop exhausts without success, planner re-plans with accumulated feedback. Up to M attempts (default 3).

**Flow:**
```
Researcher (once)
  |
  v
[Outer loop: attempt 1..M]
  Planner (with feedback from previous attempt if retry)
    |
    v
  [Inner loop: cycle 1..N]
    Implementer (executes plan / applies verifier feedback)
      |
      v
    Verifier
      |
      +-- PASS -> done (exit both loops)
      +-- FAIL (minor) -> back to Implementer (inner loop continues)
      +-- FAIL (exhausted inner) -> back to Planner (outer loop continues)
  |
  +-- All attempts exhausted -> revert + fail
```

**Key rule:** Changes accumulate. No revert between re-plan attempts. Only revert on final failure.

### Pattern 3: Agent MD File Convention

**What:** Each agent is a markdown file with YAML frontmatter specifying tools, model, and optional skills. The file body contains the agent's instructions.

**Established pattern from investigation-agent.md:**
```yaml
---
name: <agent-name>
description: "<one-liner>"
tools: Read, Write, Edit, Bash(...), Glob, Grep
model: opus          # or inherit (Phase 4 changes this)
skills:
  - playwright-cli   # only for browser-capable agents
---
```

**Body structure:**
1. Identity and personality (one paragraph)
2. Input section (what the agent receives via Task prompt)
3. Workflow section (numbered phases)
4. Rules section (critical constraints)
5. Example section (optional, condensed worked example)
6. Return format (one-liner summary)

### Pattern 4: Structured Artifact Files

**What:** Research, plans, and verifications are stored as separate markdown files in the ticket folder, not inline in the ticket.

**Recommended naming convention:**
```
NNNN-research-<slug>.md          # e.g., 0001-research-login-handler.md
NNNN-plan-<approach-slug>-<N>.md  # e.g., 0001-plan-add-null-check-1.md
NNNN-verify-<approach-slug>-<N>.md # e.g., 0001-verify-null-check-1.md
```

Where `NNNN` is the ticket number and `N` is the attempt number.

### Anti-Patterns to Avoid

- **Fixer reading ticket body directly in SKILL.md:** The orchestrator must NEVER read ticket bodies. Pass the ticket folder path to the fixer; the fixer reads everything it needs from there.
- **Hardcoding verification commands:** The verifier must read build/lint/test commands from project context (`fixme-tools.cjs context load`), not hardcode `yarn build` etc.
- **Reverting between retry attempts:** Changes accumulate. Only revert on final failure. Mid-attempt reverts lose valuable partial fixes.
- **Putting artifact content in the ticket file:** Large research/plan/verification content goes in separate files in the ticket folder. The ticket references them by relative path.
- **Fixer sub-agents modifying ticket frontmatter:** Only `fixme-tools.cjs ticket transition` changes state. Sub-agents write to the ticket body sections and artifact files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ticket state transitions | Manual frontmatter editing | `fixme-tools.cjs ticket transition` | Validates transitions, computes durations, maintains log atomically |
| File change tracking | Custom diff tracking | `git diff --name-only HEAD` (or vs a saved commit hash) | Git already tracks everything; no need to duplicate |
| Change revert on failure | Manual file restoration | `git checkout -- <files>` using tracked file list | Git handles this reliably; custom solutions miss edge cases (new files, renames) |
| YAML frontmatter parsing | New parser | Existing `parseFrontmatter`/`buildContent` in fixme-tools.cjs | Already handles the ticket format including nested objects, arrays of objects |
| Directory creation | Custom mkdirp | `fs.mkdirSync(path, { recursive: true })` | Node.js built-in, already used in fixme-tools.cjs |

**Key insight:** The existing fixme-tools.cjs has all the primitives needed. The main extension is adapting the `ticket create` and `ticket list`/`ticket next` commands to work with the new ticket-centric directory layout instead of the flat `tickets/` directory.

## Common Pitfalls

### Pitfall 1: Directory Restructuring Breaking Existing Commands

**What goes wrong:** Changing from `tickets/NNNN-slug.md` to `NNNN-slug/ticket.md` breaks every `fixme-tools.cjs` command that references the old path pattern. Also breaks SKILL.md's intake dispatch, investigation dispatch, and status queries.

**Why it happens:** The flat `tickets/` directory is assumed in `ticketList`, `ticketNext`, `ticketCreate`, and all SKILL.md dispatch flows.

**How to avoid:**
- Update `fixme-tools.cjs` functions: `ticketCreate` creates `NNNN-slug/ticket.md` instead of `tickets/NNNN-slug.md`. `ticketList` and `ticketNext` scan for `*/ticket.md` pattern instead of `tickets/*.md`. `ticketTransition` and `ticketRename` need path adjustments.
- Update SKILL.md: intake dispatch creates ticket in new location, investigation dispatch uses new paths, asset directories move inside ticket folder.
- Update investigation-agent.md: asset directory is now `<ticket-folder>/assets/` not `<session>/assets/<ticket-number>/`.
- Backward compatibility: the old `tickets/` and `assets/` directories from Phase 1/2 are NOT migrated. New sessions use the new layout; old sessions remain as-is (they're archived anyway).

**Warning signs:** Any `fixme-tools.cjs` command failing with "not found" after directory restructuring.

### Pitfall 2: Fixer Sub-Agent Context Isolation

**What goes wrong:** Sub-agents spawned via Task tool have isolated contexts. If the fixer coordinator passes information via in-memory variables instead of file paths, sub-agents can't access it.

**Why it happens:** Task tool creates a fresh context for each sub-agent. Only the prompt text and tools are available.

**How to avoid:**
- All inter-agent communication goes through files on disk (ticket folder).
- The fixer coordinator passes file paths, not content, to each sub-agent.
- Each sub-agent reads its inputs from disk and writes its outputs to disk.
- The fixer coordinator reads results from disk after each sub-agent returns.

**Warning signs:** Sub-agent returns "file not found" or produces output that doesn't reference prior sub-agent work.

### Pitfall 3: Git Revert Missing New Files

**What goes wrong:** `git checkout -- <files>` only reverts modified tracked files. If the fixer created new files (e.g., new test files, new components), they won't be cleaned up.

**Why it happens:** `git checkout` only handles files that existed before the changes. New untracked files are invisible to it.

**How to avoid:**
- Before the fixer starts, record the git state: `git rev-parse HEAD` to get the base commit.
- On final failure, use a two-step revert:
  1. `git checkout HEAD -- .` to revert all tracked file modifications
  2. `git clean -fd` to remove untracked files created by the fixer
- Alternatively, track new files explicitly and `rm` them.
- Be careful: `git clean` is destructive. Scope it to the project source directory, not the `.fixme/` directory (artifact files should be preserved).

**Warning signs:** After a failed fix attempt, `git status` shows untracked files that shouldn't be there.

### Pitfall 4: Model Inheritance Breaking Intake Agent

**What goes wrong:** The context decision says "all sub-agents inherit the orchestrator's model by default" and "this replaces any hardcoded model values in existing phases." The intake agent currently uses `model: sonnet` hardcoded in SKILL.md. Removing this without careful handling could cause intake to run on an expensive model.

**Why it happens:** The retroactive model change needs to update both agent MD frontmatter and SKILL.md dispatch instructions.

**How to avoid:**
- Remove `model: opus` from `investigation-agent.md` frontmatter (or change to `inherit`).
- Remove `Use model: sonnet.` / `Use model: opus.` from SKILL.md dispatch instructions.
- Document in SKILL.md that model is inherited from the orchestrator by default.
- If a specific agent needs a different model, it's configured per-project or per-agent via a future config mechanism.

**Warning signs:** After the change, check that SKILL.md no longer contains any `model:` specifications in dispatch instructions.

### Pitfall 5: Verifier Running Full Test Suite Causing Timeouts

**What goes wrong:** Running the full test suite on every verifier cycle can take minutes. With 3 inner cycles x 3 outer attempts, that's potentially 9 full test suite runs.

**Why it happens:** The decision says "runs full test suite to catch regressions, not just related tests."

**How to avoid:**
- The verifier should run the full suite, but the timeout should be generous. Recommend 10-minute default timeout for the fixer agent overall.
- The verifier should fail fast on build/lint before running tests (no point running tests if build fails).
- The verifier's structured report should clearly indicate which step failed so the implementer knows where to focus.

**Warning signs:** Fixer hitting timeout limits repeatedly without completing verification.

### Pitfall 6: Ticket Body Sections Not Matching New Artifact Pattern

**What goes wrong:** The current ticket template has `<!-- section: fix -->` and `<!-- section: verification -->` sections inline. Phase 4 moves fix plans and verification reports to separate files. If agents still write to inline sections AND separate files, there's duplicated/conflicting information.

**Why it happens:** The ticket template from Phase 1 was designed for inline content.

**How to avoid:**
- Update the ticket template: `<!-- section: fix -->` should reference the artifact files, not contain full fix details inline.
- Keep a brief summary in the ticket body (what approach was taken, outcome) but put detailed plans/verifications in the artifact files.
- The ticket frontmatter should have fields for artifact paths (or conventions that agents follow).

**Warning signs:** Ticket body has large sections of duplicated content that also exists in artifact files.

## Code Examples

### Example 1: Updated ticketCreate for Ticket-Centric Layout

```javascript
// Source: Based on existing fixme-tools.cjs ticketCreate function
function ticketCreate(sessionDir, flags) {
  const slug = flags.slug;
  if (!slug) return error('--slug is required for ticket create');

  // Scan for existing ticket folders (NNNN-*/) instead of tickets/*.md
  const existing = fs.readdirSync(sessionDir)
    .filter(d => {
      const dirPath = path.join(sessionDir, d);
      return fs.statSync(dirPath).isDirectory() && /^\d{4}-/.test(d);
    })
    .map(d => parseInt(d.match(/^(\d+)-/)[1], 10))
    .sort((a, b) => a - b);

  const nextNumber = existing.length > 0 ? existing[existing.length - 1] + 1 : 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');

  // Create ticket folder structure
  const ticketFolderName = `${paddedNumber}-${slug}`;
  const ticketDir = path.join(sessionDir, ticketFolderName);
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'research'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'plans'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'verifications'), { recursive: true });

  // Write ticket.md inside the folder
  const ticketPath = path.join(ticketDir, 'ticket.md');
  // ... template filling logic same as before ...
  fs.writeFileSync(ticketPath, finalContent);

  return output({ path: ticketPath, dir: ticketDir, number: paddedNumber, slug, state: 'queued' });
}
```

### Example 2: Updated ticketList for Ticket-Centric Layout

```javascript
// Source: Based on existing fixme-tools.cjs ticketList function
function ticketList(sessionDir, flags) {
  const stateFilter = flags.state || null;

  // Scan for ticket folders (NNNN-*/) containing ticket.md
  const entries = fs.readdirSync(sessionDir)
    .filter(d => {
      const dirPath = path.join(sessionDir, d);
      return fs.statSync(dirPath).isDirectory()
        && /^\d{4}-/.test(d)
        && fs.existsSync(path.join(dirPath, 'ticket.md'));
    })
    .sort();

  const tickets = entries.map(d => {
    const ticketPath = path.join(sessionDir, d, 'ticket.md');
    const content = fs.readFileSync(ticketPath, 'utf8');
    const { frontmatter: fm } = parseFrontmatter(content);
    return {
      number: fm.number || d.match(/^(\d+)-/)?.[1] || '0000',
      slug: fm.slug || d.replace(/^\d+-/, ''),
      state: fm.state || 'unknown',
      path: ticketPath,
      dir: path.join(sessionDir, d),
    };
  });

  const filtered = stateFilter ? tickets.filter(t => t.state === stateFilter) : tickets;
  return output(filtered);
}
```

### Example 3: Fixer Agent Return Structure

```javascript
// Source: CONTEXT.md decision on orchestrator dispatch
// The fixer returns this structure to SKILL.md
{
  status: "fixed",        // "fixed" | "failed" | "timeout"
  ticket_path: ".fixme/sessions/.../0001-login-button-broken/ticket.md",
  commit_hash: null,      // null in Phase 4 (Phase 5 creates commits)
  attempts: 2,            // number of outer-loop attempts used
  duration: 185,          // total seconds
  summary: "Fixed #0001: Login Button Broken -- null check added to formRef (2 attempts)"
}
```

### Example 4: Git Operations for Revert on Failure

```bash
# Before fixer starts: save the current HEAD
BASE_COMMIT=$(git rev-parse HEAD)

# ... fixer runs and fails after all attempts ...

# Revert all tracked file changes back to the base commit
git checkout $BASE_COMMIT -- .

# Remove any new untracked files (but preserve .fixme/ artifacts)
git clean -fd --exclude=.fixme/
```

### Example 5: Verifier Constraint Check Flow

```markdown
## Verification Report

### Constraint Checks

| Check | Command | Result | Details |
|-------|---------|--------|---------|
| Build | `yarn build` | PASS | No errors, no warnings |
| Lint | `yarn lint` | PASS | No errors, no warnings |
| Tests | `yarn test` | FAIL | 2 tests failed in `src/components/__tests__/LoginButton.test.tsx` |

### Failed Test Details
- `LoginButton > should submit form on click`: Expected `submit` to have been called, but it was not
- `LoginButton > should handle null ref`: Test not found (new test needed?)

### Plan Coverage

| Plan Step | Status | Details |
|-----------|--------|---------|
| Add null check to formRef | DONE | Line 42 of LoginButton.tsx |
| Update test expectations | MISSING | No test changes found |

### Verdict: FAIL
**Reason:** 2 test failures. The null check was added but existing tests expect the old behavior. Tests need updating.
```

## Discretion Recommendations

These are areas marked as "Claude's Discretion" in CONTEXT.md. Here are my recommendations.

### Structured Template: Research Output

**Recommended sections:**
```markdown
# Fix Research: [ticket-title]

## Affected Files
| File | Lines | Relevance |
|------|-------|-----------|
| path/to/file.tsx | 35-55 | Component containing the bug |

## Code Flow
1. User clicks [element] -> `ComponentA.handleClick()` (line N)
2. Handler calls `ServiceB.submit()` (line M)
3. Service accesses `ref.current` which is null (root cause)

## Dependencies
- [file] depends on [other file] for [reason]
- Changes to [file] may affect [downstream]

## Risks
- Changing [X] could break [Y]
- [Z] has no test coverage

## Approach Candidates
1. **[Approach A]:** [description] -- Pros: [x], Cons: [y]
2. **[Approach B]:** [description] -- Pros: [x], Cons: [y]
```

**Confidence:** HIGH -- follows the structure suggested in CONTEXT.md decisions.

### Structured Template: Plan Output

**Recommended sections:**
```markdown
# Fix Plan: [ticket-title] (Attempt N)

## Approach
[One paragraph describing the chosen approach and why]

## Files to Modify
| File | Action | Description |
|------|--------|-------------|
| path/to/file.tsx | MODIFY | Add null check to formRef |
| path/to/file.test.tsx | MODIFY | Update test for null case |

## Step-by-Step Changes
### Step 1: [description]
- File: `path/to/file.tsx`
- Location: Line N, inside `handleClick()`
- Change: Add `if (!formRef.current) return;` guard
- Why: Prevents null reference when component rendered without form wrapper

### Step 2: [description]
...

## Expected Outcomes
- Build: Should pass (no type changes)
- Lint: Should pass (guard follows existing patterns)
- Tests: Should pass after Step 2 updates test expectations
- Browser: Login button should respond to clicks on homepage
```

**Confidence:** HIGH -- follows the structure suggested in CONTEXT.md decisions.

### Structured Template: Verification Report

**Recommended sections:**
```markdown
# Verification Report: [ticket-title] (Attempt N, Cycle M)

## Constraint Checklist
| Constraint | Command | Result | Output |
|------------|---------|--------|--------|
| Build | [from project context] | PASS/FAIL | [relevant output] |
| Lint | [from project context] | PASS/FAIL | [relevant output] |
| Tests | [from project context] | PASS/FAIL | [relevant output if failed] |

## Plan Coverage
| Plan Step | Status | Evidence |
|-----------|--------|----------|
| [step from plan] | DONE/MISSING/INCORRECT | [what was found] |

## Failure Details (if any)
### [Failure 1]
- **What failed:** [description]
- **Why it failed:** [analysis]
- **Suggested fix:** [actionable guidance for implementer]

## Verdict: PASS/FAIL
**Summary:** [one-liner explanation]
```

**Confidence:** HIGH -- follows the structure suggested in CONTEXT.md decisions.

### Artifact File Naming Convention

**Recommended convention:**
- Research: `NNNN-research.md` (one per ticket, written by fix-researcher)
- Plans: `NNNN-plan-<N>.md` where N is the attempt number (e.g., `0001-plan-1.md`, `0001-plan-2.md`)
- Verifications: `NNNN-verify-<attempt>-<cycle>.md` where attempt is the outer loop and cycle is the inner loop (e.g., `0001-verify-1-1.md`, `0001-verify-1-2.md`, `0001-verify-2-1.md`)

Rationale: Simple numbered scheme is unambiguous and sorts naturally. Slugs in filenames add complexity without value (the ticket folder already has the slug).

**Confidence:** MEDIUM -- reasonable convention but could be simplified further. The planner may adjust.

### Timeout Default Value

**Recommended:** 600 seconds (10 minutes) per fixer agent invocation.

Rationale: A full fix cycle includes research (30s), planning (15s), implementation (60-120s), and verification with build+lint+test (120-300s depending on project). With retries, 10 minutes is generous but prevents runaway agents.

**Confidence:** MEDIUM -- depends heavily on project size. May need to be configurable per-project.

### Fixer Orchestrator Coordination Pattern

**Recommended approach:**

```
fix-agent.md coordinates via sequential Task dispatches:

1. Record base git state: git rev-parse HEAD
2. Update ticket: "fixing started"
3. Dispatch fix-researcher -> writes to <ticket-dir>/research/
4. Update ticket: "research done" + timing
5. FOR attempt = 1 to max_replan_attempts:
   a. Dispatch fix-planner (with previous failure feedback if retry) -> writes to <ticket-dir>/plans/
   b. Update ticket: "plan created" + timing
   c. FOR cycle = 1 to max_verify_cycles:
      i.   Dispatch fix-implementer -> modifies source code
      ii.  Update ticket: "implementation done" + timing
      iii. Dispatch fix-verifier -> writes to <ticket-dir>/verifications/
      iv.  Update ticket: "verification done" + timing
      v.   IF verifier PASS: return success
      vi.  IF verifier FAIL and cycles remaining: continue inner loop
      vii. IF verifier FAIL and cycles exhausted: break to outer loop
   d. IF all cycles failed: continue outer loop with failure feedback
6. All attempts exhausted: revert via git, return failure
```

The fixer agent reads loop limits from ticket frontmatter (`max_attempts` for outer loop) and from a new config value (or hardcoded default) for the inner loop.

**Confidence:** HIGH -- follows the established pattern from investigation-agent.md and aligns with all context decisions.

## State of the Art

| Old Approach (Phase 1-3) | New Approach (Phase 4) | Impact |
|---------------------------|------------------------|--------|
| Flat `tickets/` + `assets/` directories | Per-ticket folders with `ticket.md` + subdirectories | All path references in fixme-tools.cjs and SKILL.md must update |
| Hardcoded `model: opus` / `model: sonnet` in dispatch | Model inheritance from orchestrator | SKILL.md dispatch instructions remove model specifications; agent frontmatter uses `inherit` or omits model |
| Investigation findings inline in ticket body | Artifacts as separate files in ticket folder | Better organization, less ticket bloat, easier for sub-agents to read specific artifacts |
| Single agent per ticket (investigation only) | Coordinator + 4 sub-agents per ticket | More complex orchestration but better separation of concerns |

**Existing state machine already supports Phase 4:**
The transition matrix in `fixme-tools.cjs` already includes:
- `investigating -> fixing` (new in Phase 4 dispatch)
- `fixing -> verifying` (used by fixer internally)
- `verifying -> done` (not used in Phase 4; Phase 5)
- `verifying -> investigating` (retry path, with reason)
- `fixing -> failed` / `verifying -> failed` (failure paths)

No changes to the transition matrix itself are needed.

## Integration Points

### Where Phase 4 Connects to Existing Code

1. **SKILL.md Dispatch Loop (step 6):** Currently says "(Phase 4 will add the `investigating -> fixing` transition here.)" -- Phase 4 adds fixer dispatch after investigation completes successfully.

2. **fixme-tools.cjs:** Needs significant updates to `ticketCreate`, `ticketList`, `ticketNext`, `ticketRename` for the new directory layout. May also need a new `ticket info` or `ticket dir` subcommand to return the ticket folder path.

3. **investigation-agent.md:** Asset directory path changes from `<session>/assets/<ticket-number>/` to `<ticket-folder>/assets/`. Needs path update in SKILL.md dispatch and possibly in the agent instructions.

4. **intake-agent.md:** References the old `tickets/` directory structure for ticket creation and rename. Needs to understand the new layout.

5. **Ticket template:** The `<!-- section: fix -->` and `<!-- section: verification -->` sections need updating to reference artifact files rather than contain all content inline.

6. **State machine:** No changes needed. All transitions are already defined.

### What Phase 4 Does NOT Do

- Create git commits (Phase 5)
- Browser-verify fixes (Phase 5)
- Revert on failed browser verification (Phase 5)
- Generate session summary dashboard (Phase 5)
- Support parallel fixers (deferred)

## Open Questions

1. **Backward Compatibility for Old Sessions**
   - What we know: New sessions will use the ticket-centric layout. Old sessions used flat `tickets/`+`assets/`.
   - What's unclear: Should `fixme-tools.cjs` support both layouts for `session list` and `session summary`? Or treat old sessions as archived?
   - Recommendation: Support both layouts in read operations (`ticketList`, `ticketNext`, `sessionSummary`). Detect layout by checking for `tickets/` directory vs `*/ticket.md` pattern. New `ticketCreate` always uses new layout.

2. **Inner Loop Limit Configuration**
   - What we know: Outer loop (re-plan attempts) uses `max_attempts` from ticket frontmatter (default 3). Inner loop (verifier -> implementer cycles) defaults to 3.
   - What's unclear: Where is the inner loop limit configured? Ticket frontmatter? Project context? Hardcoded in fix-agent.md?
   - Recommendation: Add `max_verify_cycles` to ticket frontmatter (alongside `max_attempts`). Default to 3. The fixer reads both from the ticket.

3. **How Fixer Records Changed Files**
   - What we know: The fixer needs to track which files it changed for future commit (Phase 5) and for revert on failure.
   - What's unclear: Should the fixer explicitly log changed files, or rely on `git diff`?
   - Recommendation: Use `git diff --name-only <base-commit>` to get the changed file list. Store the base commit hash in ticket frontmatter when fixing starts. On final failure, use this for revert. On success, Phase 5 uses this for the commit.

4. **Ticket `commit_hash` Field Timing**
   - What we know: CONTEXT.md says "no commits in Phase 4." The ticket frontmatter has a `commit_hash` field.
   - What's unclear: Should Phase 4 populate `commit_hash` with `null` explicitly, or leave it for Phase 5?
   - Recommendation: Leave `commit_hash` as `null` (it's already null in the template). Phase 5 populates it after creating the commit. Phase 4 sets a new `base_commit` field to track the git state before fixing started.

## Sources

### Primary (HIGH confidence)
- Codebase: `.claude/skills/fixme/scripts/fixme-tools.cjs` -- transition matrix, ticket create/list/next/rename implementations, YAML parser
- Codebase: `.claude/skills/fixme/SKILL.md` -- current orchestrator instructions, dispatch loop, critical rules
- Codebase: `.claude/skills/fixme/agents/investigation-agent.md` -- agent MD file pattern, workflow phases, return format
- Codebase: `.claude/skills/fixme/agents/intake-agent.md` -- simpler agent pattern reference
- Codebase: `.claude/skills/fixme/references/state-machine.md` -- complete transition rules, retry semantics, duration tracking
- Codebase: `.claude/skills/fixme/references/project-context-schema.md` -- build/lint/test command discovery
- Codebase: `.claude/skills/fixme/templates/ticket.md` -- current ticket structure
- Codebase: `.planning/phases/03-investigation-reproduction/03-02-PLAN.md` -- SKILL.md dispatch pattern reference

### Secondary (MEDIUM confidence)
- Git documentation: `git checkout`, `git clean`, `git diff --name-only` for revert/tracking operations
- Claude Code Task tool behavior: context isolation between parent and child tasks

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- entirely based on existing codebase patterns, no external libraries
- Architecture: HIGH -- clear decisions in CONTEXT.md, established patterns from Phase 3
- Pitfalls: HIGH -- identified from direct codebase analysis of what will break during restructuring
- Discretion items: MEDIUM -- templates and conventions are reasonable recommendations but planner may adjust

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable domain, no external dependencies to go stale)
