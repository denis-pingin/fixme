---
name: fixme-ticket
description: "Create Linear tickets from a description or conversation context. Supports labels, project, templates, assignment, status, due dates, and attachments."
argument-hint: "[ticket description or 'from context'] [--dry-run] [--template <name>]"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`).

**Short version:** run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output as `<fixme-dir>`. Never use a literal `.fixme/` path in any Bash command, Read/Write/Edit path, or Grep/Glob pattern.

# Create Linear Ticket

Create a well-formed Linear ticket from a user-provided description or extracted from conversation context. Configures all ticket metadata (labels, project, assignee, status, due date) and optionally attaches documents.

## Prerequisites

**Linear MCP must be available.** If any Linear MCP tool call fails with a "tool not found" or connection error, stop immediately and tell the user:

> "Linear MCP is not available. Please enable it and tell me to continue."

Do NOT fall back to local file creation or any other workaround. The skill requires Linear MCP.

## Argument Parsing

Parse `$ARGUMENTS` for the description and optional flags:

| Input | Behavior |
|-------|----------|
| `<text>` | Use text as the ticket description |
| `from context` | Extract ticket details from conversation context |
| (empty) | Ask the user for a description |
| `--dry-run` | Show what would be created without creating it |
| `--template <name>` | Use a named template from `<fixme-dir>/config.json` |

Flags can appear anywhere in the arguments. The non-flag text is the ticket description.

## Audible Alerts

Fire an alert before any AskUserQuestion prompt and at the terminal outcome so the user is never idling without sound. Use the Bash one-liner; do not invoke a skill.

| When | Alert |
| --- | --- |
| Before any AskUserQuestion prompt (missing description, team selection, label / project / assignee / status / due date / priority confirmation, ticket preview confirmation) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input` |
| Ticket successfully created in the Linear backend | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_finished` |
| Ticket creation failed (Linear MCP unavailable, validation error, dry-run aborted) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_failed` |

Alerts are fire-and-forget. Fire once per pause; if a single AskUserQuestion batches multiple sub-questions (e.g. all labels in one prompt), ping once.

## Workflow

### Phase 1: Gather Raw Ticket Content

**Mode A: User-provided description**

If a description is provided (directly or via AskUserQuestion), use it as the starting point. Parse the text for:
- **Title**: first sentence or line, or a concise summary if the text is long
- **Description**: the full text, formatted as markdown
- **Mentioned files**: any file paths referenced in the text
- **Labels**: any explicit label mentions (e.g., "bug", "feature", "urgent")
- **Priority signals**: urgency indicators ("critical", "blocker", "nice to have")

**Mode B: Extract from conversation context**

When the user says "from context" or equivalent:
1. Review the conversation history for the most recent technical discussion
2. Extract: what was discussed, what problem was identified, what files were involved, what decisions were made
3. Compose a structured ticket description from the extracted information
4. Present the extracted content to the user for confirmation before proceeding

**Apply config defaults (both modes):**

After initial content is gathered (from either mode), read `<fixme-dir>/config.json` and check for `linear.defaultLabels` and `linear.defaultProject`:

1. If `<fixme-dir>/config.json` exists and has a `linear` key:
   - If `linear.defaultLabels` is a non-empty array, add each label to the detected labels list. Deduplicate: if a label name from the config already appears in the user-detected labels (case-insensitive match), keep only one copy. Track the source of each label -- "config default" or "detected from text".
   - If `linear.defaultProject` is a non-empty string, store it as the default project value. Track the source as "config default". If the user's text also explicitly mentions a project, the user mention takes priority and the config default is discarded.
2. If `<fixme-dir>/config.json` does not exist, or `linear` is absent, or both fields are absent/empty, proceed with only the user-detected metadata.

**In both modes**, after initial content is gathered and config defaults are applied, apply any configured template (see Template Application below), then proceed to Phase 2 for preview.

**Template Application (after raw content is gathered):**

If `--template <name>` was specified OR if `<fixme-dir>/config.json` has a `ticketTemplate.default` field:

1. Read `<fixme-dir>/config.json`
2. Look up the template by name under `ticketTemplate.templates.<name>` (or use `ticketTemplate.default` to find the default template name, then look it up under `ticketTemplate.templates`)
3. Apply the template to the ticket description

**Template format in config:**

```json
{
  "ticketTemplate": {
    "default": "standard",
    "templates": {
      "standard": {
        "sections": [
          { "heading": "Summary", "hint": "Brief description of the issue or feature" },
          { "heading": "Context", "hint": "Background and motivation" },
          { "heading": "Acceptance Criteria", "hint": "What done looks like" },
          { "heading": "Technical Notes", "hint": "Implementation considerations" }
        ]
      },
      "bug": {
        "sections": [
          { "heading": "Bug Description", "hint": "What's happening" },
          { "heading": "Steps to Reproduce", "hint": "Numbered steps" },
          { "heading": "Expected Behavior", "hint": "What should happen" },
          { "heading": "Actual Behavior", "hint": "What actually happens" },
          { "heading": "Environment", "hint": "Browser, OS, versions" }
        ]
      }
    }
  }
}
```

**Template application logic:** Take the user's description and reorganize it into the template's sections. Map the content intelligently:
- If the description already has sections that match template headings, slot them in
- If the description is freeform, distribute the content across sections based on meaning
- Leave sections empty (with the hint as placeholder) if no matching content exists
- Never discard user content that doesn't fit a section -- add it under the closest matching section or a "Notes" section

If no template is configured and `--template` was not specified, skip template application and use the raw description as-is.

### Phase 2: Resolve Team, Auto-Discover, and Preview Ticket

**Step 1: Resolve team context (prerequisite for all metadata operations)**

The Linear MCP requires a team context for creating issues, and labels/users/workflow states are team-scoped. Resolve the team before anything else:

1. Check `<fixme-dir>/config.json` for `linear.teamId` or `linear.teamName`
2. If `linear.teamId` is configured, use it directly
3. If `linear.teamName` is configured but not `teamId`, call `mcp__claude_ai_Linear__list_teams` and match by name to get the ID
4. If neither is configured, call `mcp__claude_ai_Linear__list_teams`:
   - If exactly one team exists, use it automatically
   - If multiple teams exist, present the list to the user via AskUserQuestion and let them pick
5. Store the resolved team ID for use by all subsequent steps

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

**Step 3: Present the ticket preview**

Present the enriched ticket preview with auto-discovered suggestions clearly annotated:

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

Then use AskUserQuestion to ask: "Review the ticket preview above. What would you like to adjust?" with options:
- "Looks good, create it"
- "I want to change metadata" (labels, project, assignee, etc.)
- "Edit the description"
- "Cancel"

**If "I want to change metadata":**

Present metadata options using the data already fetched in Step 2. No additional API calls needed for listing labels, projects, or users.

#### Labels

1. Present `availableLabels` (fetched in Step 2). Pre-select any labels that were auto-matched. Show the source of each pre-selected label.
2. Let the user pick additional labels, remove pre-selected ones, or type a new label name. The user's selections are final.
3. Store the resolved label IDs from the already-fetched `availableLabels`. Match each selected label name case-insensitively.

#### Project

1. Present `availableProjects` (fetched in Step 2). If a project was auto-selected, show it as pre-selected.
2. Let the user pick a different project, confirm the selection, or clear it.
3. Store the resolved project ID from the already-fetched `availableProjects`.

#### Assignee

1. Present `teamMembers` (fetched in Step 2). If an assignee was auto-suggested, show them as pre-selected.
2. Let the user pick one.

#### Status

1. Fetch workflow states: use `mcp__claude_ai_Linear__list_issue_statuses` with the resolved team ID
2. Present available statuses to the user
3. Let the user pick one (default: team's default status, typically "Backlog" or "Todo")

#### Due Date

Ask the user for a due date. Accept natural language ("next Friday", "2026-04-20") and convert to ISO date format (YYYY-MM-DD).

#### Priority

Present Linear priority levels. Pre-select the auto-detected priority if any. Let the user adjust:
- 0 = No priority
- 1 = Urgent
- 2 = High
- 3 = Medium
- 4 = Low

After the user finishes setting metadata, proceed directly to Phase 3 (IDs are already resolved).

**If "Edit the description":**

Use AskUserQuestion: "What should the description be?" The user provides updated text. Return to Step 3 with the updated content (template is NOT re-applied -- the user is editing the final form).

**If "Cancel":**

Stop. Output: "Ticket creation cancelled."

**If "Looks good, create it":**

Labels, project, assignee, and priority are already resolved from auto-discovery (Step 2). Proceed directly to Phase 3.

### Phase 3: Create the Ticket

**If `--dry-run` is set:**

Output the complete ticket payload as formatted text and stop:

```
## Dry Run - Ticket Would Be Created

**Title:** <title>
**Description:** <full markdown description>
**Team:** <team name>
**Labels:** <labels or "none">
**Project:** <project or "none">
**Assignee:** <assignee or "unassigned">
**Status:** <status or "default">
**Due Date:** <date or "none">
**Priority:** <priority or "none">

No ticket was created (dry run mode).
```

**If not dry run:**

1. **Create the issue:** Call `mcp__claude_ai_Linear__save_issue` with all gathered fields:
   - `title`: the ticket title
   - `description`: the full markdown description (with template applied if applicable)
   - `teamId`: resolved team ID (from Phase 2 Step 1)
   - `labelIds`: array of label IDs (resolved in auto-discovery (Phase 2 Step 2) or during metadata editing)
   - `projectId`: project ID (resolved in auto-discovery (Phase 2 Step 2) or during metadata editing)
   - `assigneeId`: assignee user ID (if any)
   - `stateId`: workflow state ID (if any)
   - `dueDate`: ISO date string (if any)
   - `priority`: priority number (if any)

2. **Handle the response:**
   - On success: extract the issue identifier (e.g., "ALP-123") and URL from the response
   - On failure: report the error and ask the user if they want to retry or cancel

### Phase 4: Handle Attachments (if any)

If the user mentioned files to attach or documents to upload:

1. **Check if attachment tool is available:** Attempt to use `mcp__claude_ai_Linear__create_attachment` or equivalent.

2. **If attachment tool is available:**
   - For each file path mentioned:
     - Read the file content
     - Call the attachment tool with the issue ID and file content
     - Report success/failure for each attachment

3. **If attachment tool is NOT available (graceful degradation):**
   - Warn the user: "Linear MCP doesn't support file attachments directly. Embedding file content in a comment instead."
   - For each file:
     - Read the file content
     - Create a comment on the issue via `mcp__claude_ai_Linear__save_comment` (or update the description) with the file content in a fenced code block
   - If the comment tool is also unavailable:
     - Warn: "Could not attach files. The following files were referenced: <list>. Please attach them manually."

### Phase 5: Output Result

On successful creation, output:

```
Ticket created: <IDENTIFIER> - <title>
URL: <linear-url>
[metadata summary: labels, project, assignee, status, due date - only fields that were set]
[attachments: N files attached | N files embedded as comments | no attachments]
```

## Configuration Reference

The skill reads optional configuration from `<fixme-dir>/config.json`:

```json
{
  "linear": {
    "teamId": "optional-default-team-id",
    "teamName": "optional-default-team-name",
    "defaultLabels": ["bug"],
    "defaultProject": "optional-project-id-or-name"
  },
  "ticketTemplate": {
    "default": "standard",
    "templates": {
      "standard": { "sections": [...] },
      "bug": { "sections": [...] }
    }
  }
}
```

All configuration is optional. Without it, the skill resolves everything interactively via Linear MCP tool calls and user prompts.

**Config default behavior:** `linear.defaultLabels` and `linear.defaultProject` are automatically applied to new tickets during Phase 1 content gathering. They are matched against Linear data during auto-discovery (Phase 2 Step 2) and shown in the preview with match status annotations. The user can override, add to, or clear them during the metadata editing flow. Config defaults never override explicit user mentions -- user text takes priority for project, and labels are deduplicated.

## MCP Tool Reference

The skill uses these Linear MCP tools. Tool names follow the pattern `mcp__claude_ai_Linear__<operation>`.

| Operation | Tool | Purpose |
|-----------|------|---------|
| Create/update issue | `save_issue` | Create the ticket with all metadata |
| List issues | `list_issues` | Search for duplicates (future) |
| Get issue | `get_issue` | Verify creation succeeded |
| List projects | `list_projects` | Resolve project name to ID |
| List teams | `list_teams` | Resolve team for issue creation |
| List issue labels | `list_issue_labels` | Resolve label names to IDs (team-scoped) |
| List users | `list_users` | Resolve assignee name to ID |
| List issue statuses | `list_issue_statuses` | Resolve status name to ID (team-scoped) |
| Save comment | `save_comment` | Attachment fallback, add context |
| Create attachment | `create_attachment` | Attach files to issue |

**Tool discovery:** Not all tools may be available in every environment. The skill attempts each tool as needed and handles "tool not found" errors gracefully (with warnings), except for `save_issue` which is required -- without it, no ticket can be created.

## Rules

1. **Linear MCP is required.** If `save_issue` is not available, stop and tell the user to enable the Linear MCP. Do not attempt workarounds.

2. **Always preview before creating.** Never create a ticket without showing the user what will be created and getting explicit confirmation (unless this is a programmatic dispatch with all fields pre-populated).

3. **Use AskUserQuestion for all user decisions.** Structured prompts with options, not freeform text questions.

4. **Graceful degradation for optional tools.** If `list_issue_labels`, `list_users`, `list_issue_statuses`, `create_attachment`, or `save_comment` are unavailable, warn the user and skip that feature. The core flow (create issue with title + description) must always work.

5. **Template application preserves user content.** Never discard content that doesn't fit a template section. Add a "Notes" section as a catch-all.

6. **Natural language date parsing.** Accept "next Friday", "end of month", "2026-04-20" and convert to ISO format. If ambiguous, confirm with the user.

7. **Send markdown content directly.** Per the Linear MCP server instruction, send real newlines in markdown content, not escaped `\n` characters.

8. **Log all MCP failures with context.** Every failed MCP call gets a warning message that includes: which tool failed, what parameters were used (excluding any sensitive data), and what the fallback behavior is.

9. **Respect Linear's data model.** Labels, projects, statuses, and users are resolved by ID, not by name. Auto-discovery (Phase 2 Step 2) resolves IDs upfront. The metadata editing path uses the same pre-fetched data. All paths must have resolved IDs before reaching Phase 3.

10. **One ticket per invocation.** The skill creates exactly one ticket. For batch creation, the user invokes the skill multiple times.

11. **Resolve team before metadata.** Labels, users, and workflow states are team-scoped in Linear. The team must be resolved before any metadata listing operations. Never call `list_issue_labels`, `list_users`, or `list_issue_statuses` without a resolved team ID.

12. **Config defaults are additive, never overriding.** `linear.defaultLabels` are merged with user-detected labels (deduplicated, case-insensitive). `linear.defaultProject` is used only when no project was explicitly mentioned by the user. The user can always override or clear config defaults during the metadata editing flow.
