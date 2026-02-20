# Phase 2: Intake Pipeline - Research

**Researched:** 2026-02-20
**Domain:** Claude Code agent dispatch, file-based ticket intake pipeline, LLM intent classification, atomic file rename
**Confidence:** HIGH

## Summary

Phase 2 transforms the orchestrator from a direct ticket creator into a dispatch-based intake system. The core change: when a user submits a bug report, the orchestrator pre-creates a ticket file with a temporary slug (reserving the sequential number atomically), then dispatches an intake agent via the Task tool. The intake agent receives only the bug description, does light codebase exploration, writes structured fields and a generated title into the ticket, and renames the file to a descriptive slug via a new `ticket rename` subcommand in fixme-tools.cjs.

The three deliverables are: (1) the intake agent definition at `~/.claude/skills/fixme/agents/intake-agent.md`, (2) updates to SKILL.md's intake flow to dispatch the agent instead of creating tickets directly, and (3) a `ticket rename` subcommand in fixme-tools.cjs for atomic file rename + frontmatter slug update. The existing `ticket create` already handles sequential numbering and template instantiation -- it just needs to accept a temporary slug. The rename operation uses Node.js `fs.renameSync` which is atomic on the same filesystem (POSIX guarantee).

**Primary recommendation:** Structure implementation as three plans: (1) `ticket rename` subcommand in fixme-tools.cjs, (2) intake-agent.md with its codebase exploration and structured field writing logic, (3) SKILL.md updates for dispatch flow with LLM intent detection. Plans 1 and 2 can execute in parallel (no dependency); Plan 3 depends on both.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Submission UX

- Two submission paths, both equivalent: `/fixme:report <description>` (explicit) and inline text (LLM intent detection by orchestrator)
- `/fixme:report` accepts inline args for quick reports; bare `/fixme:report` prompts for a description
- Orchestrator uses LLM intent detection to classify inline messages as bug reports vs other input
- High-confidence classification: act immediately without confirmation. Low confidence: ask user to confirm before dispatching intake
- One ticket per user message in v1. Multi-bug splitting deferred to later version
- `/fixme:report` without an active session bootstraps full orchestrator (session + intake + dispatch loop)
- Orchestrator is a thin dispatcher -- it does NOT interpret the bug report. It forwards the raw text (stripped of command prefix if present) to the intake agent
- Parallel intake agents are allowed -- multiple can run simultaneously for concurrent report submissions
- fixme-tools.cjs pre-creates the ticket file with the next number (atomic number assignment), then intake agent fills it in
- Ticket file initially gets a temporary/random slug; intake agent generates proper slug after understanding the report, then renames via fixme-tools.cjs
- Orchestrator tracks which intake agents are running (not polling the directory)
- User messages queue up in conversation context naturally; orchestrator picks them up between operations (Claude Code's single-threaded model -- no special polling needed)
- Intake agent receives the bug description only (isolated, no conversation history)

#### Report Content

- Bug report is unstructured free text + optional images. v1 supports text and images only; other file types deferred
- Minimum viable report: any text (even one word), though quality varies with detail
- Original user prompt preserved verbatim in ticket's "Original Report" section -- source of truth
- Intake agent fills: title (generated), original prompt, and structured fields (from its analysis)
- Intake agent does light codebase exploration to understand the report conceptually -- identifies affected areas, not specific files
- Repro steps extracted from report if obvious; otherwise left blank for investigation agent
- Screenshots: inline images from prompt are placed/named/linked by intake agent; path references in description are copied to session directory with proper linking. Missing files reported back to user

#### Feedback & Visibility

- Orchestrator announces dispatch: brief one-liner when it detects/receives a bug report ("Dispatching intake...")
- Intake agent returns a one-liner summary to orchestrator: "Queued #003: Login button broken on mobile Safari"
- Orchestrator relays intake's one-liner summary to user
- No periodic status output during session -- user checks with `/fixme:status` if curious (one-time snapshot)
- Status updates are user-initiated only

#### Queue & Session Lifecycle

- FIFO order -- no reprioritization in v1 (skipping individual tickets deferred to v2)
- When all queued tickets are processed and no agents running: orchestrator auto-closes session with summary display
- Only time orchestrator prompts for input: initial start with no bug report attached
- Session auto-close shows the same summary as manual `/fixme:stop`

#### File Structure

- New file: `~/.claude/skills/fixme/agents/intake-agent.md` -- agent instructions for processing bug reports
- SKILL.md updated: intake section dispatches to intake agent instead of creating tickets directly
- New fixme-tools.cjs subcommand: `ticket rename` -- atomic file rename + frontmatter slug update
- Intake agent writes structured fields directly to ticket file using Write/Edit tools (guided by HTML comment markers)

### Model selection

- Intake agent model (Opus, Sonnet, Haiku) must be configurable in settings. Defaults to the Orchestrator's model.

### Claude's Discretion

- Exact wording of dispatch announcement and intake summary format
- How to handle the case where fixme-tools.cjs pre-creates a file and the intake agent fails (cleanup strategy)
- Temporary slug format for pre-created ticket files

### Deferred Ideas (OUT OF SCOPE)

- Multi-bug splitting from single message -- future version
- Individual ticket skip/cancel -- v2
- Other file types beyond text and images (PDFs, etc.) -- future version
- Timeout on ambiguous classification prompts -- not possible in Claude Code's blocking prompt model
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTK-01 | User can submit a bug report (text + optional screenshots) during an active session and it gets captured to a numbered MD ticket file | fixme-tools.cjs `ticket create` already handles sequential numbering and template instantiation. The orchestrator calls this with a temporary slug, then dispatches the intake agent to fill the ticket body and rename with a proper slug. |
| INTK-02 | Intake agent summarizes the request to generate a meaningful, descriptive title used for the ticket filename (e.g., 001-login-button-not-responding.md) | Intake agent generates a slug from its understanding of the report. New `ticket rename` subcommand in fixme-tools.cjs atomically renames the file and updates the frontmatter `slug` field. |
| INTK-03 | Intake happens via background agent so the orchestrator's main loop continues processing while intake writes the ticket | Claude Code's Task tool spawns a subagent that runs to completion. The orchestrator dispatches the intake agent and continues its dispatch loop. Note: Claude Code is single-threaded -- "background" means the orchestrator dispatches and tracks, but execution is sequential within the conversation turn. True parallel execution requires multiple Task dispatches in a single turn. |
| INTK-04 | Ticket files are numbered sequentially for sort-stable FIFO ordering | Already implemented in fixme-tools.cjs `ticket create` -- scans tickets directory, finds max number, increments. The pre-create-then-rename pattern preserves the original number. |
| INTK-05 | User can submit new bug reports while an implementation agent is actively fixing a previous bug (streaming intake) | Parallel intake agents are allowed per decisions. The orchestrator tracks running intake agents. Each `ticket create` call reserves the next number atomically (filesystem scan + write). Multiple intake agents write to different ticket files (no collision). |
</phase_requirements>

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Claude Code Skills | Current (SKILL.md format) | Skill entry point and orchestrator dispatch | Phase 1 established this pattern. SKILL.md IS the orchestrator. |
| Claude Code Task tool | Current | Subagent dispatch for intake agent | Official API for spawning subagents. Supports `model` parameter for cost optimization. |
| CommonJS (`.cjs`) | Node.js 18+ | `fixme-tools.cjs` with new `ticket rename` subcommand | Extends existing tool. No new runtime dependencies. |
| `fs.renameSync` | Node.js built-in | Atomic file rename for ticket rename | POSIX rename is atomic on the same filesystem. Ticket files stay within the same session directory. |
| Agent MD files | Claude Code format | `intake-agent.md` at `~/.claude/skills/fixme/agents/` | Same pattern as GSD agents. Loaded by subagent via `Read` tool in first turn. |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| Write/Edit tools | Intake agent writes to ticket body sections | Agent fills in Original Report, Structured Fields via HTML comment markers |
| Glob/Grep | Intake agent's light codebase exploration | Identifying affected areas/components from the bug description |
| Read | Intake agent reads its role file + ticket file | First action on dispatch |

### Not Needed (Phase 2)

| Technology | Why Not Yet |
|------------|------------|
| Playwright (MCP or CLI) | Phase 3+ (browser automation). Intake does not reproduce bugs. |
| `/fixme:report` as separate skill | Decision: `/fixme:report` bootstraps the full orchestrator. Not a separate entry point. |
| File watchers / chokidar | No polling needed. Orchestrator tracks intake agents directly. |

## Architecture Patterns

### Recommended File Structure Changes

```
~/.claude/skills/fixme/
  SKILL.md                          # MODIFIED: intake section dispatches to agent
  agents/
    intake-agent.md                 # NEW: intake agent instructions
  templates/
    ticket.md                       # UNCHANGED
    session.md                      # UNCHANGED
  scripts/
    fixme-tools.cjs                 # MODIFIED: add ticket rename subcommand
  references/
    state-machine.md                # UNCHANGED
    project-context-schema.md       # UNCHANGED
```

### Pattern 1: Pre-Create Then Rename (Two-Phase Ticket Creation)

**What:** Ticket creation is split into two phases: (1) orchestrator pre-creates the file with a temporary slug to atomically reserve the sequential number, (2) intake agent fills the ticket and renames it with a descriptive slug.

**When to use:** Every time a bug report is submitted. This pattern ensures sequential numbers are never duplicated even with parallel intake agents.

**Flow:**

```
Orchestrator                          fixme-tools.cjs                     Intake Agent
    |                                      |                                   |
    |-- ticket create --slug intake-tmp-X ->|                                   |
    |<---- { path, number: "0003" } --------|                                   |
    |                                      |                                   |
    |-- Task(intake-agent) ----------------------------------------->|          |
    |                                      |                         |-- Read ticket
    |                                      |                         |-- Write original report
    |                                      |                         |-- Glob/Grep codebase
    |                                      |                         |-- Edit structured fields
    |                                      |                         |-- ticket rename --slug login-broken
    |                                      |<----- rename request ---|
    |                                      |-- rename file + update fm
    |                                      |----> { newPath } ------>|
    |<----------- "Queued #003: ..." --------------------------------|
```

**Critical constraints:**
- The temporary slug must be unique per concurrent intake (use timestamp or random suffix)
- The rename must update both the filename AND the frontmatter `slug` field atomically
- If the intake agent fails, the orchestrator should clean up the pre-created file (transition to failed or delete)

### Pattern 2: Dispatch-and-Track Intake (Orchestrator as Coordinator)

**What:** The orchestrator dispatches intake agents and tracks them by ticket path. It does not poll the filesystem. When the Task tool returns, the orchestrator reads the result.

**When to use:** For all intake dispatches, both from `/fixme:report` and from inline bug detection.

**How it works in SKILL.md:**

```
When user submits a bug report:
1. Pre-create ticket: fixme-tools.cjs ticket create <session-dir> --slug intake-tmp-<random>
2. Announce: "Dispatching intake for bug report..."
3. Dispatch via Task tool:
   prompt: "First, read ~/.claude/skills/fixme/agents/intake-agent.md for your role.
            Ticket path: <ticket-path>
            Bug description: <verbatim user text>
            Session assets dir: <session-dir>/assets/"
4. On Task return:
   - Read ticket state from disk (always)
   - Relay intake summary to user
5. Continue dispatch loop (check for next queued ticket to investigate)
```

**Note on "parallel" intake:** Claude Code's single-threaded conversation model means the orchestrator processes one Task at a time within a conversation turn. "Parallel intake" means the orchestrator can dispatch multiple intake agents in sequence without waiting for investigation agents to complete on prior tickets. The intake is "background" relative to the investigation pipeline, not relative to other intakes.

### Pattern 3: LLM Intent Detection (Orchestrator as Classifier)

**What:** The orchestrator (which IS an LLM) classifies user messages as bug reports vs other input. This is not a separate classifier -- it's part of the orchestrator's natural language understanding, guided by explicit instructions in SKILL.md.

**When to use:** When the user types a message during an active session that is NOT a recognized command.

**Classification logic in SKILL.md:**

```
When user sends a message during active session:
1. If message starts with /fixme:report -> always treat as bug report
2. If message is a session command (stop, status, resume) -> handle as command
3. Otherwise, classify the message:
   - HIGH confidence bug report: problem descriptions, error reports,
     "X is broken", "X is not working", "when I do X, Y happens instead of Z",
     stack traces, error messages
     -> Dispatch intake immediately
   - LOW confidence: ambiguous messages that MIGHT be bug reports but could be
     conversation, questions, or other input
     -> Ask user: "Is this a bug report you'd like me to track? (yes/no)"
   - NOT a bug report: questions about status, general conversation, clarifications
     -> Respond normally
```

**Key principle from decisions:** Err on the side of asking when unsure rather than mis-classifying.

### Pattern 4: Agent Role Loading (Read-First Pattern)

**What:** Subagents load their role instructions by reading an MD file as their first action. The orchestrator passes the file path in the Task prompt.

**When to use:** For all agent dispatches. This is the established GSD pattern.

**Example Task prompt for intake agent:**

```
First, read ~/.claude/skills/fixme/agents/intake-agent.md for your role instructions.

Then process this bug report:
- Ticket file: .fixme/sessions/<session>/tickets/0003-intake-tmp-a7b3.md
- Bug description: "The login button on the homepage doesn't respond to clicks on mobile Safari. I've tried refreshing the page but it still doesn't work."
- Session assets directory: .fixme/sessions/<session>/assets/
```

### Anti-Patterns to Avoid

- **Fat intake agent:** The intake agent should NOT investigate the bug deeply. Light codebase exploration only -- identify the affected component/area, not root cause. Deep investigation is Phase 3.

- **Orchestrator interpreting reports:** The orchestrator forwards raw text to the intake agent. It does NOT extract structured fields, generate titles, or analyze the report. That's the intake agent's job.

- **Shared slug generation:** Don't let the orchestrator generate the final slug. The intake agent generates it because only it understands the report content.

- **Polling filesystem for intake completion:** The orchestrator tracks intake agents by Task dispatch/return, not by watching the tickets directory for file changes.

- **Blocking intake before investigation:** The orchestrator should dispatch intake and then check if there are queued tickets ready for investigation. Don't wait for intake to complete before dispatching investigation agents on already-queued tickets.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential number reservation | Lock file or mutex | `ticket create` with temp slug (filesystem scan is atomic enough for single-process) | Claude Code is single-threaded per conversation. No true concurrent writes to the tickets directory from the same orchestrator. |
| Atomic file rename | Write new file + delete old | `fs.renameSync` in `ticket rename` subcommand | POSIX rename is atomic on same filesystem. The tickets dir stays on one filesystem. |
| Slug generation | Regex/hardcoded rules | Let the LLM (intake agent) generate it | The agent understands natural language. Rules would be fragile. Validate length/format in fixme-tools.cjs. |
| Bug report classification | Separate classifier service | SKILL.md instructions to the orchestrator LLM | The orchestrator IS an LLM. It can classify intent natively. No external service needed. |
| Image handling | Custom image processor | Pass image references in Task prompt, let intake agent handle paths | Claude Code's Task tool passes context including images. The intake agent can use Write to place files in the assets directory. |

**Key insight:** This phase's complexity is in the coordination pattern (pre-create, dispatch, rename), not in the technology. Everything uses existing tools (`ticket create`, Task tool, `fs.renameSync`, Write/Edit). The new code is glue: one new subcommand, one new agent file, updated orchestrator instructions.

## Common Pitfalls

### Pitfall 1: Ticket Number Collision with Parallel Intake

**What goes wrong:** Two rapid bug reports arrive. The orchestrator calls `ticket create` twice. Between the first `readdirSync` and `writeFileSync`, the second call also reads the directory and computes the same next number.

**Why it happens:** `ticket create` is not transactional -- there's a TOCTOU gap between reading the directory and writing the file.

**How to avoid:** Claude Code is single-threaded per conversation. The orchestrator processes messages sequentially. Two `ticket create` calls from the same orchestrator will never interleave. The only risk is if a separate Claude Code session writes to the same session directory, which is explicitly not supported in v1.

**Warning signs:** Duplicate ticket numbers, overwritten ticket files.

### Pitfall 2: Intake Agent Fails, Orphaned Temporary File

**What goes wrong:** `ticket create` succeeds (file exists with temp slug), but the intake agent crashes or times out. A file like `0003-intake-tmp-a7b3.md` sits in the tickets directory with no real content.

**Why it happens:** The two-phase pattern means the file exists before the intake agent runs.

**How to avoid:**
1. On intake agent failure (Task returns error or no summary), the orchestrator transitions the ticket to `failed` with reason "Intake agent failed" using `ticket transition`.
2. Failed tickets with temp slugs are visible in `ticket list` and `session summary` -- the user knows about them.
3. Do NOT delete the file -- the failed state provides an audit trail. The user can review and resubmit.

**Recommendation (discretion area):** Transition to failed, do not delete. Log the failure reason.

### Pitfall 3: Rename Breaks Ticket Path References

**What goes wrong:** The orchestrator pre-creates `0003-intake-tmp-a7b3.md`, passes this path to the intake agent. The intake agent renames it to `0003-login-button-broken.md`. The orchestrator still has the old path in memory.

**Why it happens:** The rename changes the filename, but the orchestrator's `ticket path` tracking still points to the old name.

**How to avoid:**
1. The intake agent returns the new path in its summary response.
2. The `ticket rename` subcommand returns `{ oldPath, newPath, ... }` so the caller knows the new location.
3. The orchestrator uses `ticket list` or `ticket next` to re-derive paths from disk after intake completes (consistent with the "always read from disk" rule).

### Pitfall 4: Slug Validation and Filename Safety

**What goes wrong:** The intake agent generates a slug with spaces, special characters, or excessive length, producing an invalid or unwieldy filename.

**Why it happens:** LLM-generated slugs are unpredictable. The agent might generate "login-button-doesn't-respond-on-mobile-safari-when-user-clicks-repeatedly" (too long) or "fix the broken thing" (not a valid slug).

**How to avoid:**
1. `ticket rename` in fixme-tools.cjs validates and sanitizes the slug: lowercase, hyphens only, max 60 chars, no special characters.
2. If the provided slug is invalid, normalize it (strip invalid chars, truncate, replace spaces with hyphens) rather than erroring.
3. Document the slug format in the intake agent instructions so the LLM generates reasonable slugs from the start.

### Pitfall 5: /fixme:report Without Active Session

**What goes wrong:** User types `/fixme:report some bug` with no active session. The intake needs a session directory to create a ticket.

**Why it happens:** Per decisions, `/fixme:report` without an active session should bootstrap the full orchestrator.

**How to avoid:** The SKILL.md must handle this case explicitly:
1. If no active session: create session first (same as `/fixme start`)
2. Then proceed with intake dispatch
3. Then enter the dispatch loop

This is a SKILL.md instruction update, not a tools change.

## Code Examples

### ticket rename Subcommand (fixme-tools.cjs)

```javascript
// Source: New code for fixme-tools.cjs
function ticketRename(ticketPath, flags) {
  const newSlug = flags.slug;
  if (!newSlug) {
    return error('--slug is required for ticket rename');
  }

  if (!fs.existsSync(ticketPath)) {
    return error(`Ticket file not found: ${ticketPath}`);
  }

  // Validate/sanitize slug
  const sanitized = newSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
    .slice(0, 60);                 // Max 60 chars

  if (!sanitized) {
    return error('Slug is empty after sanitization');
  }

  // Read ticket to get number and update slug
  const content = fs.readFileSync(ticketPath, 'utf8');
  const { frontmatter: fm, body, rawFields } = parseFrontmatter(content);

  const number = fm.number || path.basename(ticketPath).match(/^(\d+)-/)?.[1] || '0000';
  const oldSlug = fm.slug;

  // Update frontmatter
  fm.slug = sanitized;
  fm.updated = new Date().toISOString();

  // Derive new title from slug
  const title = sanitized.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  // Update body heading if it contains old title
  let updatedBody = body;
  if (oldSlug) {
    const oldTitle = oldSlug.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    updatedBody = body.replace(
      `# ${number}: ${oldTitle}`,
      `# ${number}: ${title}`
    );
  }

  const updatedContent = buildContent(fm, updatedBody, rawFields);

  // Compute new filename
  const dir = path.dirname(ticketPath);
  const newFilename = `${number}-${sanitized}.md`;
  const newPath = path.join(dir, newFilename);

  // Atomic rename: write updated content first, then rename
  fs.writeFileSync(ticketPath, updatedContent);
  if (ticketPath !== newPath) {
    fs.renameSync(ticketPath, newPath);
  }

  return output({
    oldPath: ticketPath,
    newPath,
    oldSlug: oldSlug || null,
    newSlug: sanitized,
    number,
    title
  });
}
```

### Intake Agent File Structure (intake-agent.md)

```markdown
---
name: intake-agent
description: Processes bug reports into structured ticket files
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

# Intake Agent

You process a single bug report into a structured ticket file.

## Input

You receive:
1. A ticket file path (pre-created with temporary slug)
2. The verbatim bug description from the user
3. The session assets directory path

## Process

1. Read the ticket file
2. Write the verbatim bug description into the Original Report section
3. Do light codebase exploration (Glob/Grep) to understand the affected area
4. Fill structured fields based on your analysis
5. Generate a descriptive slug (lowercase, hyphens, max 60 chars)
6. Rename the ticket: fixme-tools.cjs ticket rename <path> --slug <slug>
7. Return a one-liner summary: "Queued #NNN: <generated title>"

## Rules
- Do NOT investigate root cause. That's the investigation agent's job.
- Do NOT fix the bug. You are intake only.
- Keep codebase exploration to < 5 Glob/Grep calls.
- If the report mentions screenshots with file paths, copy them to the assets dir.
```

### SKILL.md Intake Dispatch Update

```markdown
## Bug Intake (In-Session) -- UPDATED for Phase 2

When the user describes a bug during an active session:

1. **Classify the message** (for inline reports, not /fixme:report):
   - HIGH confidence bug report -> proceed to step 2
   - LOW confidence -> ask: "Is this a bug report you'd like me to track?"
   - NOT a bug report -> respond normally

2. **Pre-create ticket with temporary slug:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket create <session-dir> --slug intake-tmp-<random>
   ```

3. **Announce dispatch:** Brief one-liner to user.

4. **Dispatch intake agent via Task tool:**
   ```
   First, read ~/.claude/skills/fixme/agents/intake-agent.md for your role instructions.

   Ticket path: <ticket-path>
   Bug description: <verbatim user text>
   Session assets directory: <session-dir>/assets/
   ```

5. **On intake return:**
   - Read ticket state from disk
   - Relay the intake agent's summary to user
   - If intake failed: transition ticket to failed with reason

6. **Continue dispatch loop.** Check for next queued ticket.
```

### Temporary Slug Format

```
intake-tmp-<4-char-hex>

Examples:
  intake-tmp-a7b3
  intake-tmp-f1c2
  intake-tmp-0e9d
```

Generated in SKILL.md orchestrator instructions using a simple 4-char random hex. Enough to avoid collision for concurrent intakes within a single session (max 9999 tickets anyway).

## Discretion Recommendations

These are the areas marked as "Claude's Discretion" in CONTEXT.md. Recommendations follow:

### 1. Dispatch Announcement and Intake Summary Format

**Recommendation:**

Dispatch announcement (orchestrator to user):
```
Intake dispatched for bug report (#003)...
```

Intake summary (agent returns to orchestrator, orchestrator relays):
```
Queued #003: Login button not responding on mobile Safari
```

Short, informational, no ceremony. The number confirms the ticket was created. The title confirms the agent understood the report.

### 2. Cleanup Strategy for Failed Intake

**Recommendation:** Transition to `failed` state, do NOT delete the file.

Rationale:
- A failed ticket with temp slug is visible in `ticket list` and `session summary` -- provides audit trail
- The user can resubmit the same bug
- Deleting files makes it harder to debug what went wrong
- The `failure_reason` field captures why intake failed

Implementation: On Task tool error or timeout, orchestrator calls:
```bash
node fixme-tools.cjs ticket transition <ticket-path> failed --reason "Intake agent failed: <error summary>"
```

Note: the transition `queued -> failed` is NOT in the current transition matrix (`queued` can only go to `investigating` or `skipped`). Two options:
- Add `failed` as a valid target from `queued` (simpler, directly represents what happened)
- Use `skipped` with reason "Intake agent failed" (uses existing matrix but semantically imprecise)

**Recommendation:** Add `queued -> failed` to the transition matrix. This is a small fixme-tools.cjs change and makes the state machine more honest.

### 3. Temporary Slug Format

**Recommendation:** `intake-tmp-<4-hex>` (e.g., `intake-tmp-a7b3`)

Rationale:
- Clearly identifies pre-intake files in directory listings
- 4 hex chars = 65536 combinations, far more than needed for concurrent intakes
- The `intake-tmp-` prefix makes it easy to grep for orphaned temp files
- Short enough to not clutter filenames

Generated by orchestrator using: `Math.random().toString(16).slice(2, 6)`

### 4. Model Selection for Intake Agent

**Recommendation:** Use `sonnet` model.

Rationale:
- Intake requires reading user text, doing light codebase exploration (Glob/Grep), writing structured fields, and generating a slug -- moderate complexity
- `haiku` would be cheaper/faster but may produce lower quality titles and worse codebase understanding
- `opus` is overkill for intake -- save it for investigation/fixing agents
- `sonnet` offers the best balance of quality and cost for this task

Model is set in intake-agent.md frontmatter: `model: sonnet`

If cost becomes a concern later, `haiku` could work for simple text-only reports. But start with `sonnet` for reliability.

## State Machine Update Required

The current transition matrix needs one addition for this phase:

```
Current: queued -> [investigating, skipped]
Updated: queued -> [investigating, skipped, failed]
```

This enables the orchestrator to fail a pre-created ticket if the intake agent crashes. Without this, the orchestrator would have to use `skipped` (semantically wrong) or leave orphaned `queued` tickets with temp slugs.

This change affects:
- `fixme-tools.cjs`: Add `'failed'` to `TRANSITIONS['queued']` array
- `references/state-machine.md`: Update the transition matrix table and diagram

The `failed` transition from `queued` requires a `--reason` flag (consistent with all other `failed` transitions).

## SKILL.md Update Scope

The current SKILL.md `Bug Intake (In-Session)` section (lines 122-136) needs replacement. Current behavior: orchestrator creates ticket directly with a final slug and writes the verbatim report itself. New behavior: orchestrator pre-creates with temp slug, dispatches intake agent, tracks completion.

Additional SKILL.md changes:
1. Add `/fixme:report` as a recognized command (alongside start/resume/status/stop)
2. Add LLM intent classification instructions for inline messages
3. Add intake agent tracking (list of dispatched intake agent ticket paths)
4. Update auto-close logic: session closes when all tickets processed AND no intake agents running
5. Handle `/fixme:report` without active session (bootstrap flow)

## fixme-tools.cjs Changes

### New Subcommand: `ticket rename`

```
node fixme-tools.cjs ticket rename <ticket-path> --slug <new-slug>
```

Behavior:
1. Validate new slug (lowercase, hyphens, a-z0-9, max 60 chars)
2. Read ticket frontmatter
3. Update `slug` field and `updated` timestamp
4. Update body heading (# NNNN: Title)
5. Write updated content to current path
6. Rename file to `<number>-<new-slug>.md`
7. Return `{ oldPath, newPath, oldSlug, newSlug, number, title }`

### Transition Matrix Update

Add `'failed'` to `TRANSITIONS['queued']`:

```javascript
// Before:
'queued': ['investigating', 'skipped'],

// After:
'queued': ['investigating', 'skipped', 'failed'],
```

### Router Update

Add `rename` case to the ticket subcommand switch.

## Open Questions

1. **Image Handling in Task Dispatch**
   - What we know: Claude Code's Task tool can pass text prompts. The intake agent needs to handle images referenced in the bug report.
   - What's unclear: Whether inline images from the conversation context are automatically available to the Task subagent, or if they need to be explicitly passed as file paths.
   - Recommendation: For v1, focus on image paths mentioned in the text (e.g., "see screenshot at /path/to/img.png"). The intake agent copies these to the assets directory. Inline conversation images may require explicit passing -- test during implementation and document findings.

2. **`/fixme:report` as Separate Skill vs SKILL.md Argument**
   - What we know: The decision says `/fixme:report` bootstraps the full orchestrator. This could be implemented as: (a) a new argument parsed by the existing `/fixme` skill (`/fixme report <text>`), or (b) a separate skill file `report/SKILL.md` that internally invokes the orchestrator.
   - What's unclear: Whether Claude Code's skill system supports `/fixme:report` as a colon-separated namespace automatically, or if it requires a separate skill directory at `~/.claude/skills/fixme/commands/report.md`.
   - Recommendation: Implement as `$ARGUMENTS` parsing in the existing SKILL.md. Add `report` as a sub-command alongside `start/resume/status/stop`. This is consistent with Phase 1's design and avoids creating a separate skill entry point.

## Sources

### Primary (HIGH confidence)
- `/anthropics/claude-code` (Context7) - Task tool API, agent model selection, SKILL.md frontmatter fields, subagent dispatch patterns
- `/websites/code_claude` (Context7) - Custom subagent file structure, model options (haiku/sonnet/opus/inherit), skill directory structure, `context: fork` pattern
- Direct inspection of `~/.claude/skills/fixme/scripts/fixme-tools.cjs` (1306 lines) - Existing ticket create flow, frontmatter parser, transition matrix
- Direct inspection of `~/.claude/skills/fixme/SKILL.md` (201 lines) - Current orchestrator instructions, bug intake section
- Direct inspection of `~/.claude/skills/fixme/templates/ticket.md` - Template structure, HTML comment markers, placeholder format
- Node.js `fs.renameSync` documentation - POSIX atomic rename guarantee on same filesystem

### Secondary (MEDIUM confidence)
- Phase 1 research and summaries (`.planning/phases/01-foundation-skeleton/`) - Established patterns, decisions, deviations
- Claude Code plugin development docs (Context7) - Atomic file update patterns using temp file + rename

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All tools are existing (Task, fixme-tools.cjs, Write/Edit). No new dependencies.
- Architecture (dispatch pattern): HIGH -- Pre-create-then-rename is a well-understood pattern. Task tool dispatch is verified via Context7 docs.
- Intake agent design: HIGH -- Follows established GSD agent pattern (Read role file first, execute, return summary).
- State machine update: HIGH -- Single addition to transition matrix. Simple, well-contained change.
- LLM intent classification: MEDIUM -- The approach (SKILL.md instructions) is standard, but the exact confidence thresholds and classification quality depend on prompt engineering during implementation. May need iteration.
- Image handling: LOW -- How inline conversation images pass through Task dispatch is unclear. Path-based images are straightforward.

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days -- stable domain, tools unlikely to change)
