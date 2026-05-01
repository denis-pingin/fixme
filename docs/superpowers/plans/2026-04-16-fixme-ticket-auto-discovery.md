# fixme-ticket Auto-Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fixme-ticket auto-discover Linear metadata (labels, projects, team members) upfront so the preview is pre-populated and useful without any config, and fix incorrect MCP tool name references.

**Architecture:** Insert an auto-discovery step into Phase 2 between team resolution and preview. This step fetches labels, projects, and team members from Linear, matches detected values against real data, and pre-resolves IDs. The old "resolve IDs" step (Step 3) is eliminated since discovery handles resolution. Also fix three MCP tool names that don't match the actual Linear MCP server.

**Tech Stack:** Markdown skill files (no code), Linear MCP tools

---

## File Structure

Only one file is modified:

- **Modify:** `.claude/skills/fixme-ticket/SKILL.md` - the fixme-ticket skill definition

Changes span three areas of the file:
1. **Phase 2 section** (lines 110-226) - add auto-discovery, update preview, update metadata editing, remove redundant ID resolution
2. **Phase 4 section** (line 283) - fix `create_comment` -> `save_comment`
3. **MCP Tool Reference table** (lines 328-339) - fix three tool names
4. **Rules section** (lines 351, 365) - fix bare tool name references in Rules 4 and 11
5. **Configuration Reference section** (line 318) - fix stale annotation description

---

### Task 1: Fix MCP tool names globally [DONE]

Three tool names in the skill don't match the actual Linear MCP server tools. These are real bugs that would cause "tool not found" errors at runtime. This task also fixes bare (non-prefixed) references to the same incorrect tool names in the Rules section.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md`

- [x] **Step 1: Replace `list_labels` with `list_issue_labels`**

Find-replace the prefixed form across the file (2 occurrences):

```
old: mcp__claude_ai_Linear__list_labels
new: mcp__claude_ai_Linear__list_issue_labels
```

Occurrences: line 156 (Labels subsection), line 212 (resolve IDs step).

Also update the reference table row (line 335), which uses the bare form that the prefixed find-replace won't match:

```
old: | List labels | `list_labels` | Resolve label names to IDs (team-scoped) |
new: | List issue labels | `list_issue_labels` | Resolve label names to IDs (team-scoped) |
```

- [x] **Step 2: Replace `list_workflow_states` with `list_issue_statuses`**

Find-replace across the entire file (1 occurrence + reference table):

```
old: mcp__claude_ai_Linear__list_workflow_states
new: mcp__claude_ai_Linear__list_issue_statuses
```

Also update the reference table row:

```
old: | List workflow states | `list_workflow_states` | Resolve status name to ID (team-scoped) |
new: | List issue statuses | `list_issue_statuses` | Resolve status name to ID (team-scoped) |
```

- [x] **Step 3: Replace `create_comment` with `save_comment`**

Find-replace across the entire file (1 occurrence in Phase 4 + reference table):

Line 283:
```
old: mcp__claude_ai_Linear__create_comment
new: mcp__claude_ai_Linear__save_comment
```

Reference table:
```
old: | Create comment | `create_comment` | Attachment fallback, add context |
new: | Save comment | `save_comment` | Attachment fallback, add context |
```

- [x] **Step 4: Fix bare tool name references in Rules 4 and 11**

Rule 4 (line 351) uses bare tool names that Steps 1-3 won't catch because they lack the `mcp__claude_ai_Linear__` prefix.

Replace:
```
old: If `list_labels`, `list_users`, `list_workflow_states`, `create_attachment`, or `create_comment` are unavailable
new: If `list_issue_labels`, `list_users`, `list_issue_statuses`, `create_attachment`, or `save_comment` are unavailable
```

Rule 11 (line 365) also uses bare tool names.

Replace:
```
old: Never call `list_labels`, `list_users`, or `list_workflow_states` without a resolved team ID.
new: Never call `list_issue_labels`, `list_users`, or `list_issue_statuses` without a resolved team ID.
```

- [x] **Step 5: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "fix: correct MCP tool names in fixme-ticket skill"
```

---

### Task 2: Add auto-discovery step to Phase 2 [DONE]

This is the core change. Insert a new Step 2 between team resolution (Step 1) and preview (currently Step 2, becomes Step 3). The auto-discovery step fetches metadata from Linear and pre-resolves IDs.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md:110-122` (Phase 2 heading + Step 1 tail)

- [x] **Step 1: Update Phase 2 heading**

```
old: ### Phase 2: Resolve Team and Preview Ticket
new: ### Phase 2: Resolve Team, Auto-Discover, and Preview Ticket
```

- [x] **Step 2: Trim Step 1 closing line**

The current Step 1 ends with:
```
5. Store the resolved team ID for use by all subsequent steps in Phase 2 and Phase 3
```

Replace with:
```
5. Store the resolved team ID for use by all subsequent steps
```

- [x] **Step 3: Insert new Step 2 after Step 1**

Insert the following block immediately after Step 1's last line (after "5. Store the resolved team ID for use by all subsequent steps"), before the current Step 2:

````markdown
**Step 2: Auto-discover metadata from Linear**

After resolving the team, immediately fetch metadata from Linear to pre-populate the ticket. These calls are independent -- make them in parallel:

1. Fetch labels: call `mcp__claude_ai_Linear__list_issue_labels` with the resolved team ID -> store as `availableLabels`
2. Fetch projects: call `mcp__claude_ai_Linear__list_projects` -> store as `availableProjects`
3. Fetch team members: call `mcp__claude_ai_Linear__list_users` -> store as `teamMembers`

If any call fails, log a warning and continue without that metadata. Auto-discovery failures are non-blocking.

**Match and pre-select metadata using the fetched data:**

- **Labels**: For each label name from text detection or config defaults, case-insensitive match against `availableLabels`. Matched labels get their IDs resolved immediately. Unmatched labels are dropped with a note in the preview (e.g., "'xyz' not found in Linear labels"). If no labels were detected or matched, note the count of available labels for awareness.
- **Project**: If a project name was detected or set from config, match case-insensitively against `availableProjects` and auto-select with resolved ID. If nothing was detected and exactly one project exists, auto-suggest it. If multiple projects and nothing detected, note count and top 3 names.
- **Assignee**: Identify the authenticated user in `teamMembers` and pre-suggest assigning to them. Show as "Your Name (you)". If the authenticated user cannot be identified, leave as "unassigned" but note the count of team members.
- **Priority**: Map detected priority signals to Linear levels: "urgent"/"critical"/"blocker" -> 1 (Urgent), "high" -> 2 (High), "medium" -> 3 (Medium), "low"/"nice to have" -> 4 (Low). No signals -> 0 (No priority).

All resolved IDs from this step carry through to Phase 3 -- no redundant resolution needed later.
````

- [x] **Step 4: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "feat: add auto-discovery step to fixme-ticket Phase 2"
```

---

### Task 3: Update preview section to show auto-discovered values [DONE]

Replace the current Step 2 (preview) with Step 3 that shows enriched metadata from auto-discovery.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md` - the current "Step 2: Present the ticket preview" section

- [x] **Step 1: Rename Step 2 to Step 3 and replace preview format**

Replace the current Step 2 header and preview block:

```
old: **Step 2: Present the ticket preview**

Present the ticket preview to the user as formatted text output. This preview shows the final content (including any template formatting applied in Phase 1). For labels and project, annotate each value with its source so the user can see what came from config defaults vs. what was detected from their text:
```

```
new: **Step 3: Present the ticket preview**

Present the enriched ticket preview with auto-discovered suggestions clearly annotated:
```

- [x] **Step 2: Replace the preview template**

Replace the preview code block (lines 128-142) with:

````
```
## Ticket Preview

**Title:** <title>

**Description:**
<full description text>

**Metadata:**
- Team: <resolved team name>
- Labels: <matched labels, e.g., "bug (matched)" -- or "none (15 labels available)" if none matched>
- Project: <auto-selected, e.g., "Alpha (only project)" or "Alpha (matched)" -- or "none (pick from: Alpha, Beta, Gamma)" if multiple>
- Assignee: <auto-suggested, e.g., "Denis Pingin (you)" -- or "unassigned (5 members available)">
- Priority: <mapped priority, e.g., "3 - Medium (detected)" -- or "None">
- Files mentioned: <list, or "none">
```
````

- [x] **Step 3: Update AskUserQuestion options**

Change the second option label from "I want to set metadata" to "I want to change metadata" (since metadata is now pre-populated, the user is changing it, not setting it from scratch):

```
old: - "I want to set metadata" (labels, project, assignee, etc.)
new: - "I want to change metadata" (labels, project, assignee, etc.)
```

Also update the corresponding handler heading:

```
old: **If "I want to set metadata":**
new: **If "I want to change metadata":**
```

- [x] **Step 4: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "feat: update fixme-ticket preview to show auto-discovered metadata"
```

---

### Task 4: Update metadata editing subsections to use pre-fetched data [DONE]

The current metadata editing subsections fetch labels/projects/users on demand. Since auto-discovery already fetched them, update the subsections to reference pre-fetched data.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md` - the "If I want to set metadata" subsection

- [x] **Step 1: Update the intro paragraph**

Replace:

```
old: Present metadata options. Use AskUserQuestion for each one the user wants to set. For each metadata field, resolve the value using Linear MCP tools, passing the resolved team ID where required:
new: Present metadata options using the data already fetched in Step 2. No additional API calls needed for listing labels, projects, or users.
```

- [x] **Step 2: Replace Labels subsection**

Replace the entire Labels subsection (#### Labels through step 4) with:

```markdown
#### Labels

1. Present `availableLabels` (fetched in Step 2). Pre-select any labels that were auto-matched. Show the source of each pre-selected label.
2. Let the user pick additional labels, remove pre-selected ones, or type a new label name. The user's selections are final.
3. Store the resolved label IDs from the already-fetched `availableLabels`. Match each selected label name case-insensitively.
```

- [x] **Step 3: Replace Project subsection**

Replace the entire Project subsection with:

```markdown
#### Project

1. Present `availableProjects` (fetched in Step 2). If a project was auto-selected, show it as pre-selected.
2. Let the user pick a different project, confirm the selection, or clear it.
3. Store the resolved project ID from the already-fetched `availableProjects`.
```

- [x] **Step 4: Replace Assignee subsection**

Replace the entire Assignee subsection with:

```markdown
#### Assignee

1. Present `teamMembers` (fetched in Step 2). If an assignee was auto-suggested, show them as pre-selected.
2. Let the user pick one.
```

- [x] **Step 5: Update Status subsection tool name**

This was already fixed in Task 1, but verify the status subsection now reads:

```
1. Fetch workflow states: use `mcp__claude_ai_Linear__list_issue_statuses` with the resolved team ID
```

(Status is the only metadata NOT pre-fetched in auto-discovery because it's rarely changed from the default. It stays as a lazy fetch.)

- [x] **Step 6: Update Priority subsection**

Replace the Priority subsection with:

```markdown
#### Priority

Present Linear priority levels. Pre-select the auto-detected priority if any. Let the user adjust:
- 0 = No priority
- 1 = Urgent
- 2 = High
- 3 = Medium
- 4 = Low
```

- [x] **Step 7: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "feat: update metadata editing to use pre-fetched data"
```

---

### Task 5: Update "Looks good" path and remove old Step 3 [DONE]

The old Step 3 (resolve label and project names to IDs) is no longer needed since auto-discovery resolves IDs upfront. Remove it and update the "Looks good" path.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md`

- [x] **Step 1: Update "Edit the description" handler**

Change the back-reference from Step 2 to Step 3:

```
old: Return to Phase 2 Step 2 with the updated content
new: Return to Step 3 with the updated content
```

- [x] **Step 2: Replace "Looks good, create it" handler**

Replace:

```
old: **If "Looks good, create it":**

Proceed to Phase 2 Step 3 (resolve names to IDs).
```

With:

```
new: **If "Looks good, create it":**

Labels, project, assignee, and priority are already resolved from auto-discovery (Step 2). Proceed directly to Phase 3.
```

- [x] **Step 3: Delete old Step 3 (resolve names to IDs)**

Remove the entire section from `**Step 3: Resolve label and project names to IDs**` through `Proceed to Phase 3.` (lines 207-226). This includes:
- The step heading
- The "At this point..." intro paragraph
- The Labels resolution logic (items 1-5)
- The Project resolution logic (items 1-4)
- The "Note:" paragraph about which path runs this step
- The "Proceed to Phase 3." line

This section is fully superseded by auto-discovery in Step 2.

- [x] **Step 4: Update Phase 3 `save_issue` parameter cross-references**

Lines 256-257 reference "resolved in Phase 2 Step 3 or during metadata editing" for `labelIds` and `projectId`. After the step renumbering, Step 3 is the preview step. ID resolution now lives in Step 2 (auto-discovery).

Line 256:
```
old: - `labelIds`: array of label IDs (resolved in Phase 2 Step 3 or during metadata editing)
new: - `labelIds`: array of label IDs (resolved in auto-discovery (Phase 2 Step 2) or during metadata editing)
```

Line 257:
```
old: - `projectId`: project ID (resolved in Phase 2 Step 3 or during metadata editing)
new: - `projectId`: project ID (resolved in auto-discovery (Phase 2 Step 2) or during metadata editing)
```

- [x] **Step 5: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "feat: remove redundant ID resolution step from fixme-ticket"
```

---

### Task 6: Update Rule 9 reference [DONE]

Rule 9 references "Both paths through Phase 2" which assumed the old structure. Update it.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md` - Rules section

- [x] **Step 1: Update Rule 9**

Replace:

```
old: 9. **Respect Linear's data model.** Labels, projects, statuses, and users are resolved by ID, not by name. Always resolve names to IDs via MCP list/search tools before passing to `save_issue`. Both paths through Phase 2 (direct confirmation and metadata editing) must produce resolved IDs before reaching Phase 3.
```

With:

```
new: 9. **Respect Linear's data model.** Labels, projects, statuses, and users are resolved by ID, not by name. Auto-discovery (Phase 2 Step 2) resolves IDs upfront. The metadata editing path uses the same pre-fetched data. All paths must have resolved IDs before reaching Phase 3.
```

- [x] **Step 2: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "chore: update fixme-ticket rule 9 for auto-discovery"
```

---

### Task 7: Install and verify [DONE]

- [x] **Step 1: Run install script**

```bash
./install.sh
```

Verify it copies the updated skill to `~/.claude/skills/fixme-ticket/`.

- [x] **Step 2: Verify by reading the installed file**

```bash
head -5 ~/.claude/skills/fixme-ticket/SKILL.md
```

Confirm it matches the source file.

- [x] **Step 3: Squash commits into one**

Squash the 6 task commits into a single feature commit:

```bash
git reset --soft HEAD~6
git commit -m "feat: add auto-discovery to fixme-ticket skill"
```

---

### Task 8: Fix stale config-default annotation description

The Configuration Reference section at line 318 still describes the old `"(config default)"` source annotations, but the preview template (implemented in Task 3) now uses `"(matched)"` style annotations. The preview no longer distinguishes config-default vs. text-detected sources -- it only shows whether labels matched against Linear data.

**Files:**
- Modify: `.claude/skills/fixme-ticket/SKILL.md:318`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** N/A
- **Behavior:** Line 318 accurately describes the current annotation style used in the preview template

- [ ] **Step 1: Update the config default behavior description**

In `.claude/skills/fixme-ticket/SKILL.md`, find line 318 which currently reads:

```
**Config default behavior:** `linear.defaultLabels` and `linear.defaultProject` are automatically applied to new tickets during Phase 1 content gathering. They appear in the Phase 2 preview with "(config default)" source annotations. The user can override, add to, or clear them during the metadata editing flow. Config defaults never override explicit user mentions -- user text takes priority for project, and labels are deduplicated.
```

Replace the second sentence only. Change:

```
old: They appear in the Phase 2 preview with "(config default)" source annotations.
new: They are matched against Linear data during auto-discovery (Phase 2 Step 2) and shown in the preview with match status annotations.
```

The full line after the edit:

```
**Config default behavior:** `linear.defaultLabels` and `linear.defaultProject` are automatically applied to new tickets during Phase 1 content gathering. They are matched against Linear data during auto-discovery (Phase 2 Step 2) and shown in the preview with match status annotations. The user can override, add to, or clear them during the metadata editing flow. Config defaults never override explicit user mentions -- user text takes priority for project, and labels are deduplicated.
```

- [ ] **Step 2: Run install script**

```bash
./install.sh
```

Verify it copies the updated skill to `~/.claude/skills/fixme-ticket/`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-ticket/SKILL.md
git commit -m "fix: update stale config-default annotation description in fixme-ticket"
```
