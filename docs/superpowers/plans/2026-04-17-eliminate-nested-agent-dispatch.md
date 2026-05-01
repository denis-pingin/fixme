# Eliminate Nested Agent Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all agent-within-agent dispatch patterns that are now blocked by Claude Code's flat agent hierarchy constraint (max depth 1).

**Architecture:** Two chains are broken. Chain 1 (fixme-pr-comments -> fixme-task agent -> sub-skill agents) is fixed by invoking fixme-task via the Skill tool instead of the Agent tool - the Skill tool runs inline at depth 0, so fixme-task's sub-agent dispatches become depth 1. Chain 3 (investigation-agent -> fixme-investigate agent) is fixed by loading the fixme-investigate skill into the investigation-agent via `skills` frontmatter so it does the work itself instead of sub-dispatching.

**Tech Stack:** Claude Code skills (Markdown with YAML frontmatter), agent definitions

---

### Task 1: Change fixme-pr-comments to invoke fixme-task via Skill tool

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:598-627` (dispatch block)
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:833` (notes section)

**Why:** fixme-pr-comments currently dispatches fixme-task as `Agent(subagent_type="fixme-task")`. This puts fixme-task at depth 1. When fixme-task then dispatches sub-skills (fixme-write-plan, fixme-execute-plan, etc.) as agents, those are depth 2 - blocked by the platform. Changing to `Skill("fixme-task")` runs fixme-task inline at depth 0, so its sub-agent dispatches are depth 1.

- [ ] **Step 1: Replace the PIPELINE GATE and dispatch block (lines 598-627)**

Replace the text from `**PIPELINE GATE` through the end of the `**CRITICAL**` paragraph (the entire dispatch section for step 3) with:

```markdown
**PIPELINE GATE (self-check before proceeding):** Your next action MUST be a `Skill("fixme-task")` invocation. If you are about to call Read, Edit, Write, Grep, or Bash on source files instead, STOP - you are bypassing the pipeline. There is no "quick fix" path, no "just this one change" exception, no size-based threshold. The Skill tool is the ONLY tool you use in this step.

#### Invoke fixme-task (inline pipeline)

Invoke fixme-task as an inline skill so it can dispatch its sub-agents (fixme-write-plan, fixme-execute-plan, etc.) within platform depth limits. The Skill tool runs fixme-task in the current session context (depth 0), allowing its Agent dispatches to land at depth 1.

    Skill(
      skill="fixme-task",
      args="Fix these PR comment issues. This is a PR comment fix task.

      Fix items:
      - [full list of fix items with file paths, line numbers, and comment text]
      - [for FIX items: the analysis from Step 2]
      - [for resolved FIX_UNCLEAR items: the chosen approach and rationale from Step 2.5]

      Project root: [path]"
    )

fixme-task runs the default pipeline (plan with review loop -> execute with review loop), handling plan writing, plan review, execution, and code review internally.

**NOTE**: fixme-task runs inline in this session's context, not as an isolated agent. This is intentional - the Agent tool cannot be used from within an agent (platform constraint). The pipeline's sub-agents (fixme-write-plan, fixme-execute-plan, etc.) still get isolated context windows when dispatched by fixme-task via the Agent tool.
```

- [ ] **Step 2: Update the notes section (line 833)**

Replace the fixme-task dispatch note:

Old:
```
- **fixme-task dispatch**: uses `subagent_type="fixme-task"` which loads the agent definition from `~/.claude/agents/fixme-task.md`. The agent definition preloads the SKILL.md via `skills` frontmatter. Dispatch prompts only contain task-specific inputs.
```

New:
```
- **fixme-task invocation**: uses `Skill("fixme-task")` to run the pipeline inline in the current session. fixme-task dispatches its sub-agents (fixme-write-plan, fixme-execute-plan, etc.) via the Agent tool at depth 1. This avoids the platform constraint that agents cannot dispatch other agents.
```

- [ ] **Step 3: Verify the changes**

Read `.claude/skills/fixme-pr-comments/SKILL.md` and confirm:
1. No `Agent(subagent_type="fixme-task")` calls remain
2. The Skill invocation syntax is correct: `Skill(skill="fixme-task", args="...")`
3. The PIPELINE GATE references Skill tool, not Agent tool
4. The notes section references the Skill-based invocation

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix: replace Agent dispatch of fixme-task with Skill invocation in fixme-pr-comments"
```

---

### Task 2: Add project root resolution to fixme-task

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md:49` (Input Resolution section, after Task Resolution)

**Why:** When fixme-task was dispatched as an Agent, the project root was passed explicitly in the prompt's `<project>` block. Now that fixme-task can also be invoked as a Skill (with task description in `$ARGUMENTS`), it needs a way to resolve the project root when it's not in a structured XML block. The solution: extract it from the task text if present, otherwise use the current working directory.

- [ ] **Step 1: Add Project Root Resolution subsection**

After the "Task Resolution" subsection (which ends around line 49 with the "Ask" bullet), add:

```markdown
### Project Root Resolution

Resolve the project root for sub-agent dispatch prompts:

1. **Explicit in task text**: if the task description contains `Project root: <path>`, extract and use that path
2. **Current working directory**: use the working directory (always the project root in Claude Code)
```

- [ ] **Step 2: Verify the change**

Read `.claude/skills/fixme-task/SKILL.md` and confirm the new subsection appears in the Input Resolution section, between Task Resolution and Start From.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "fix: add project root resolution to fixme-task for Skill invocation"
```

---

### Task 3: Eliminate nested dispatch in investigation-agent

**Files:**
- Modify: `.claude/skills/fixme-session/agents/investigation-agent.md` (full rewrite)

**Why:** The investigation-agent currently dispatches fixme-investigate as a sub-agent (`Agent(subagent_type: "fixme-investigate")`), creating a depth-2 dispatch when the investigation-agent itself is dispatched by fixme-session. The fix: load the fixme-investigate skill into the investigation-agent via `skills` frontmatter and expand its tool access so it conducts the investigation itself.

Note: fixme-session's current SKILL.md dispatches fixme-investigate directly (`subagent_type: "fixme-investigate"`) at line 205, bypassing investigation-agent entirely. The investigation-agent.md contains a stale design with the nested pattern. This task updates the file to be correct if used, and consistent with the no-nesting constraint.

- [ ] **Step 1: Update the frontmatter**

Replace the frontmatter:

Old:
```yaml
---
name: investigation-agent
description: "Wraps the fixme-investigate skill with session-specific ticket management"
tools: Read, Write, Edit, Bash(mkdir *)
model: inherit
---
```

New:
```yaml
---
name: investigation-agent
description: "Investigates bugs with session-specific ticket management - reads ticket, conducts investigation following fixme-investigate procedures, writes findings back"
tools: Read, Write, Edit, Bash, Grep, Glob
skills:
  - fixme-investigate
model: inherit
---
```

Key changes:
- `skills: - fixme-investigate` loads the investigation skill so this agent does the work itself
- `tools` expanded to `Read, Write, Edit, Bash, Grep, Glob` (matching what fixme-investigate needs for browser automation, codebase tracing, and report writing)

- [ ] **Step 2: Replace the body (everything after the frontmatter closing `---`)**

Replace the entire body with:

```markdown
# Investigation Agent

This agent investigates bugs with session-specific ticket management. It reads the ticket, conducts the investigation following the fixme-investigate skill procedures (loaded via `skills` frontmatter), then writes findings back to the ticket.

## Input

You receive four things via your prompt:

1. **Ticket file path** -- read for original report, structured fields, and prior investigation attempts
2. **Project config** -- `.fixme/config.json` for dev server URL, framework info
3. **Asset directory path** -- the `assets/` subdirectory inside the ticket folder (e.g., `.fixme/sessions/<session>/NNNN-slug/assets/`)
4. **Dev server URL** -- the base URL of the running dev server

## Workflow

### Phase 1: Read Ticket and Build Task Description

Note: The ticket has already been transitioned to "investigating" by the orchestrator (fixme-session) before dispatching this agent.

- Read the ticket file using the Read tool
- Extract from structured fields: affected URL, expected vs actual behavior, error messages, title, ticket number
- Read `.fixme/config.json` and extract `project.devServer.url` for dev server URL
- Note any user-submitted screenshots in the Original Report section
- Read any prior `### Attempt N` sections in the investigation section to include as context

### Phase 2: Conduct Investigation

Determine the output directory: `<ticket-folder>/investigation/`

Follow the fixme-investigate skill procedures (loaded into your context via `skills` frontmatter) to conduct the investigation. Use these inputs:

- **Task description**: The bug report composed from Phase 1 (title, description, affected URL, expected vs actual behavior, error messages, prior attempts)
- **Dev server URL**: From project config
- **Output directory**: `<ticket-folder>/investigation/`

Execute the full investigation workflow as defined by the fixme-investigate skill: browser reproduction, codebase tracing, root cause analysis, and report writing. Write the investigation report to the output directory.

### Phase 3: Write Findings to Ticket

After completing the investigation:

1. **Read the investigation report** from `<ticket-folder>/investigation/investigation.md`

2. **Write findings to the ticket.** Use the Edit tool to append to the ticket's `<!-- section: investigation -->` section. Format the content as a new `### Attempt N` subsection (check existing attempts to determine N).

   Copy the key sections from the investigation report into the ticket:
   - Reproduction steps and evidence
   - Reproduction status verdict (CONFIRMED/NOT_CONFIRMED/PARTIAL)
   - Affected files
   - Root cause hypothesis and confidence

   The investigation section is append-only -- never overwrite prior attempts.

3. **Parse the investigation result** to determine the verdict (CONFIRMED, NOT_CONFIRMED, PARTIAL, or BLOCKER).

### Phase 4: Return Summary

Return ONLY a one-liner summary as your final response. No explanations, no recommendations, no additional text.

- **Success:** `"Investigated #NNNN: <title> -- reproduction CONFIRMED, root cause identified (<confidence>)"`
- **Partial:** `"Investigated #NNNN: <title> -- reproduction PARTIAL, best-effort analysis provided"`
- **Failed:** `"Investigated #NNNN: <title> -- reproduction FAILED after N attempts, best-effort analysis provided"`
- **Blocker:** `"BLOCKER #NNNN: <title> -- <description of blocker>"`

## Rules

1. **You do NOT fix bugs.** You investigate and write findings back to the ticket.
2. **You conduct the investigation yourself** following the fixme-investigate skill procedures loaded via frontmatter. You do NOT dispatch fixme-investigate as a sub-agent.
3. **Investigation section is append-only.** If the ticket has prior attempts from a previous investigation dispatch, create `### Attempt N` -- never overwrite prior attempts.
4. **On blocker:** Write whatever partial findings exist to the ticket and return a BLOCKER summary to the orchestrator.
5. **Always read the investigation report from disk** after writing it, to ensure the ticket gets the full findings.
```

- [ ] **Step 3: Verify the changes**

Read `.claude/skills/fixme-session/agents/investigation-agent.md` and confirm:
1. Frontmatter has `skills: - fixme-investigate`
2. Frontmatter tools include `Read, Write, Edit, Bash, Grep, Glob`
3. No `Agent(` or `subagent_type` references exist in the body
4. Phase 2 says "follow the fixme-investigate skill procedures" not "dispatch fixme-investigate"
5. Rule 2 explicitly states it does NOT dispatch fixme-investigate as a sub-agent

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-session/agents/investigation-agent.md
git commit -m "fix: eliminate nested agent dispatch in investigation-agent"
```

---

### Task 4: Deploy and verify

**Files:**
- Run: `./install.sh`

- [ ] **Step 1: Run install.sh**

```bash
./install.sh
```

Expected: copies all fixme skill directories to `~/.claude/skills/`.

- [ ] **Step 2: Verify installed files match source**

Diff key files to confirm install deployed the changes:
```bash
diff .claude/skills/fixme-pr-comments/SKILL.md ~/.claude/skills/fixme-pr-comments/SKILL.md
diff .claude/skills/fixme-task/SKILL.md ~/.claude/skills/fixme-task/SKILL.md
diff .claude/skills/fixme-session/agents/investigation-agent.md ~/.claude/skills/fixme-session/agents/investigation-agent.md
```

Expected: no differences for all three files.

- [ ] **Step 3: Verify no remaining nested dispatch patterns**

Search the installed skills for any remaining agent-within-agent dispatch patterns:
```bash
grep -r "subagent_type.*fixme-investigate" ~/.claude/skills/fixme-session/agents/
grep -r "subagent_type.*fixme-task" ~/.claude/skills/fixme-pr-comments/
```

Expected: no matches. All nested dispatch patterns have been replaced.
