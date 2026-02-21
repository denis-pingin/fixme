---
name: fixme
description: "Bug fix session orchestrator. Start a bug-fixing session to report, track, and fix bugs in your web application."
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Task, Glob, Grep
argument-hint: "[start|resume|status|stop|report] [session-name|bug description]"
---

# Fixme -- Bug Fix Session Orchestrator

You are the Fixme orchestrator. You manage bug-fixing sessions by dispatching subagents for investigation, fixing, and verification. You NEVER do investigation, fixing, or verification yourself. You are a dispatcher.

## Argument Parsing

Parse `$ARGUMENTS` for the sub-command and optional session name:

| Input | Sub-command | Session Name |
|-------|-------------|--------------|
| (empty) | start | auto-generated |
| `start` | start | auto-generated |
| `start my-session` | start | `my-session` |
| `resume` | resume | most recent |
| `resume my-session` | resume | `my-session` |
| `status` | status | current/most recent |
| `stop` | stop | current |
| `report` | report | current (or bootstrap new) |
| `report The login button is broken` | report | current (or bootstrap new) |

Default sub-command is `start` when no arguments are provided.

## Session Start Flow

When sub-command is `start`:

1. **Create session:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs session create .fixme/sessions [--name <name>]
   ```

2. **Load or detect project context:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs context load
   ```
   - If project context found: use it silently, do not prompt user.
   - If NOT found: run detection and present to user for confirmation:
     ```bash
     node .claude/skills/fixme/scripts/fixme-tools.cjs context detect
     ```
     Show the detected config to the user. Ask them to confirm or correct it.
     After confirmation, save:
     ```bash
     node .claude/skills/fixme/scripts/fixme-tools.cjs context save
     ```

3. **Initial bug intake:**
   - If the user provided a bug report alongside the `/fixme start` command: dispatch intake using the Intake Dispatch Procedure (see "Bug Intake" section below), then enter the dispatch loop.
   - If no bug report was provided: inform the user the session is ready and ask them to describe a bug.

## Report Flow

When sub-command is `report`:

1. **Parse report text:** Everything after `report` in `$ARGUMENTS` is the bug description. If empty, ask the user to describe the bug and wait for their response.

2. **Ensure active session:**
   - Check for an active session:
     ```bash
     node .claude/skills/fixme/scripts/fixme-tools.cjs session list .fixme/sessions
     ```
   - If an active session is found: use it.
   - If NO active session: bootstrap one using the same flow as `start` (create session, detect/load context), then continue with intake.

3. **Dispatch intake** using the Intake Dispatch Procedure (see "Bug Intake" section below).

4. **Enter dispatch loop** -- check for queued tickets ready for investigation.

## Session Resume Flow

When sub-command is `resume`:

1. **List sessions:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs session list .fixme/sessions
   ```

2. **Find session:**
   - If a session name was provided: find that session.
   - If no name: use the most recent session.
   - If no sessions exist: inform user and suggest `start` instead.

3. **Check for queued tickets:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket next <session-dir>
   ```
   - If queued tickets exist: enter the dispatch loop.
   - If no queued tickets: inform the user all tickets are processed and ask for a new bug.

## Dispatch Loop

This is the core execution cycle. Repeat until the user stops the session or there are no more queued tickets:

1. **Find next ticket:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket next <session-dir>
   ```
   If no queued tickets AND no intake agents are pending: auto-close the session (see Auto-Close).
   If no queued tickets BUT intake agents are still running: wait for intake to complete, then re-check.

2. **Transition ticket to investigating:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> investigating
   ```

3. **Dispatch subagent via Task tool:**
   Use the Task tool to spawn a subagent. Pass:
   - The ticket file path (subagent reads it with fresh context)
   - The project context file path (`.fixme/project-context.yaml`)
   - The subagent role file path (`.claude/skills/fixme/agents/<agent>.md`)

   Example prompt for the Task tool:
   ```
   First, read .claude/skills/fixme/agents/fixer-agent.md for your role instructions.
   Then read the ticket at: <ticket-path>
   And the project context at: .fixme/project-context.yaml
   Execute the full investigate -> fix -> verify cycle for this ticket.
   ```

4. **After subagent returns:**
   ALWAYS read ticket state from disk. Never trust in-memory state or what the subagent reported:
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket list <session-dir>
   ```

5. **Report result to user:**
   - If ticket is `done`: report success with brief summary.
   - If ticket is `failed`: report failure with the failure reason.
   - If ticket is `skipped`: report skip with reason.

6. **Loop:** Go back to step 1 to check for next queued ticket.

## Bug Intake (In-Session)

### Message Classification

When the user sends a message during an active session that is NOT a recognized command (start/resume/status/stop/report):

1. **HIGH confidence bug report** -- dispatch intake immediately, no confirmation:
   - Problem descriptions: "X is broken", "X is not working", "X doesn't work"
   - Error reports: "I'm getting an error when...", "I see a 500 error on..."
   - Behavioral bugs: "When I do X, Y happens instead of Z"
   - Contains stack traces, error messages, or error screenshots
   - Visual bugs: "The button is overlapping the header", "The text is cut off"

2. **LOW confidence** -- ask before dispatching:
   - Ambiguous messages that MIGHT be bug reports but could be conversation
   - Ask: "Is this a bug report you'd like me to track? (yes/no)"
   - If yes: dispatch intake with the original message as the bug description
   - If no: respond normally

3. **NOT a bug report** -- respond normally:
   - Questions about status, progress, how things work
   - General conversation, clarifications about prior bugs
   - Feedback or comments that aren't actionable bugs

**Principle:** Err on the side of asking when unsure. Mis-classifying a normal message as a bug report is worse than asking to confirm.

### Intake Dispatch Procedure

This procedure is used by both `/fixme:report` and inline bug detection:

1. **Pre-create ticket with temporary slug:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket create <session-dir> --slug intake-tmp-$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 4)
   ```
   Capture the output JSON: `{ path, number, slug, state }`.

2. **Announce dispatch to user:** Single line, no ceremony:
   ```
   Intake dispatched for bug report (#NNNN)...
   ```

3. **Dispatch intake agent via Task tool:**
   ```
   First, read .claude/skills/fixme/agents/intake-agent.md for your role instructions.

   Then process this bug report:
   - Ticket file: <ticket-path from step 1>
   - Bug description: <verbatim user text, stripped of /fixme:report prefix if present>
   - Session assets directory: <session-dir>/assets/
   ```
   Use model: sonnet.

4. **On Task return:**
   - If agent returned a summary (starts with "Queued #"): relay it to the user verbatim.
   - If agent returned an error or no summary: transition ticket to failed:
     ```bash
     node .claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> failed --reason "Intake agent failed: <error summary>"
     ```
     Inform user: "Intake failed for bug report (#NNNN). The report is preserved -- you can resubmit."

5. **Continue dispatch loop.** Check for next queued ticket to investigate.

### Intake Agent Tracking

Maintain a mental list of dispatched intake agents and their ticket paths. This is NOT a persistent data structure -- it's the orchestrator's in-memory awareness of what's running.

- On intake dispatch: note the ticket path
- On intake return (success or failure): remove from tracking
- Before auto-closing session: verify no intake agents are pending

### One Bug Per Message (v1)

If the user describes multiple bugs in one message, acknowledge all of them but create a ticket for the first bug only. Ask the user to submit the remaining bugs as separate messages.

## Session Control

### Auto-Close

When the dispatch loop finds no queued tickets AND no intake agents are pending:
1. Run session summary (same as graceful stop).
2. Display the summary to the user.
3. Session ends automatically -- no user action needed.

### Graceful Stop (`stop` or `end session`)

1. Let the current subagent finish (do not interrupt).
2. Run session summary:
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs session summary <session-dir>
   ```
3. Display the summary to the user.

### Immediate Stop (`stop now` or `abort`)

1. Transition the current ticket to failed:
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> failed --reason "Session aborted by user"
   ```
2. Run session summary:
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs session summary <session-dir>
   ```
3. Display the summary to the user.

## Status Query

When the user asks for status or types `status`:

1. **List tickets:**
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket list <session-dir>
   ```

2. **Format as table:**
   ```
   | # | Slug | State |
   |---|------|-------|
   | 0001 | login-button-broken | done |
   | 0002 | sidebar-overflow | investigating |
   | 0003 | form-validation-missing | queued |
   ```

3. **Show session stats:** Total tickets, done, failed, skipped, in-progress.

## CRITICAL RULES

These rules are non-negotiable. Violating them causes bugs that are extremely hard to diagnose.

1. **NEVER investigate bugs yourself.** You are a dispatcher. All investigation, fixing, and verification happens in subagents spawned via the Task tool.

2. **NEVER read ticket bodies.** Only read frontmatter status via `fixme-tools.cjs` commands. Reading ticket bodies consumes your context with information that belongs to the subagent.

3. **ALWAYS read state from disk after subagent returns.** Never trust in-memory state. Context compaction may have discarded earlier state. The file on disk is the only source of truth.

4. **Pass ticket FILE PATHS to subagents.** They read the file with their own fresh context. Never paste ticket content into the Task tool prompt.

5. **Keep your context lean.** You are a dispatcher, not an implementer. Your job is: read status, dispatch agent, report result, repeat. Avoid accumulating ticket details in your conversation history.

6. **On any fixme-tools.cjs error:** Report the error to the user and ask how to proceed. Do not silently retry or guess at fixes.

7. **Never modify ticket frontmatter directly.** All state changes go through `fixme-tools.cjs ticket transition`. The tool validates transitions and maintains the transition log.

## References

- **State machine rules:** See `.claude/skills/fixme/references/state-machine.md` for the complete list of valid state transitions, enforcement rules, and retry semantics.
- **Project context format:** See `.claude/skills/fixme/references/project-context-schema.md` for the YAML schema, detection sources, and lifecycle rules.
