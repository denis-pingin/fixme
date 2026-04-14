---
name: fixme-ticket
description: "Create Linear tickets from a description or conversation context. Supports labels, project, templates, assignment, status, due dates, and attachments."
argument-hint: "[ticket description or 'from context'] [--dry-run] [--template <name>]"
---

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
| `--template <name>` | Use a named template from `.fixme/config.json` |

Flags can appear anywhere in the arguments. The non-flag text is the ticket description.

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

After initial content is gathered (from either mode), read `.fixme/config.json` and check for `linear.defaultLabels` and `linear.defaultProject`:

1. If `.fixme/config.json` exists and has a `linear` key:
   - If `linear.defaultLabels` is a non-empty array, add each label to the detected labels list. Deduplicate: if a label name from the config already appears in the user-detected labels (case-insensitive match), keep only one copy. Track the source of each label -- "config default" or "detected from text".
   - If `linear.defaultProject` is a non-empty string, store it as the default project value. Track the source as "config default". If the user's text also explicitly mentions a project, the user mention takes priority and the config default is discarded.
2. If `.fixme/config.json` does not exist, or `linear` is absent, or both fields are absent/empty, proceed with only the user-detected metadata.

**In both modes**, after initial content is gathered and config defaults are applied, apply any configured template (see Template Application below), then proceed to Phase 2 for preview.

**Template Application (after raw content is gathered):**

If `--template <name>` was specified OR if `.fixme/config.json` has a `ticketTemplate.default` field:

1. Read `.fixme/config.json`
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

### Phase 2: Resolve Team and Preview Ticket

**Step 1: Resolve team context (prerequisite for all metadata operations)**

The Linear MCP requires a team context for creating issues, and labels/users/workflow states are team-scoped. Resolve the team before anything else:

1. Check `.fixme/config.json` for `linear.teamId` or `linear.teamName`
2. If `linear.teamId` is configured, use it directly
3. If `linear.teamName` is configured but not `teamId`, call `mcp__claude_ai_Linear__list_teams` and match by name to get the ID
4. If neither is configured, call `mcp__claude_ai_Linear__list_teams`:
   - If exactly one team exists, use it automatically
   - If multiple teams exist, present the list to the user via AskUserQuestion and let them pick
5. Store the resolved team ID for use by all subsequent steps in Phase 2 and Phase 3

**Step 2: Present the ticket preview**

Present the ticket preview to the user as formatted text output. This preview shows the final content (including any template formatting applied in Phase 1). For labels and project, annotate each value with its source so the user can see what came from config defaults vs. what was detected from their text:

```
## Ticket Preview

**Title:** <extracted or composed title>

**Description:**
<full description text, with template sections applied if a template was used>

**Metadata (detected):**
- Team: <resolved team name>
- Labels: <each label with source annotation, e.g., "bug (config default), urgent (detected from text)" -- or "none detected" if no labels from either source>
- Project: <project name with source annotation, e.g., "Alpha (config default)" or "Alpha (detected from text)" -- or "none detected">
- Priority: <any detected priority, or "none detected">
- Files mentioned: <list, or "none">
```

Then use AskUserQuestion to ask: "Review the ticket preview above. What would you like to adjust?" with options:
- "Looks good, create it"
- "I want to set metadata" (labels, project, assignee, etc.)
- "Edit the description"
- "Cancel"

**If "I want to set metadata":**

Present metadata options. Use AskUserQuestion for each one the user wants to set. For each metadata field, resolve the value using Linear MCP tools, passing the resolved team ID where required:

#### Labels

1. Fetch available labels: use `mcp__claude_ai_Linear__list_labels` with the resolved team ID
2. Present available labels to the user. Pre-select any labels already attached to the ticket (both config-default labels and text-detected labels). Show the source of each pre-selected label, e.g., "bug (config default) [pre-selected]", "urgent (detected from text) [pre-selected]".
3. Let the user pick additional labels, remove pre-selected ones, or type a new label name. The user's selections here are final -- they override both config defaults and text detection.
4. Store the resolved label IDs from the `list_labels` response. Match each selected label name against the fetched labels (case-insensitive). These IDs are ready for Phase 3 -- no further resolution needed.

#### Project

1. Fetch available projects: use `mcp__claude_ai_Linear__list_projects`
2. Present available projects to the user. If a default project is already set (from config or text detection), show it as pre-selected with its source annotation, e.g., "Alpha (config default) [pre-selected]".
3. Let the user pick a different project, confirm the pre-selected one, or clear the selection. The user's choice here is final.
4. Store the resolved project ID from the `list_projects` response. This ID is ready for Phase 3 -- no further resolution needed.

#### Assignee

1. Fetch team members: use `mcp__claude_ai_Linear__list_users` or equivalent
2. Present available team members to the user
3. Let the user pick one

#### Status

1. Fetch workflow states: use `mcp__claude_ai_Linear__list_workflow_states` with the resolved team ID
2. Present available statuses to the user
3. Let the user pick one (default: team's default status, typically "Backlog" or "Todo")

#### Due Date

Ask the user for a due date. Accept natural language ("next Friday", "2026-04-20") and convert to ISO date format (YYYY-MM-DD).

#### Priority

Map user input to Linear priority levels:
- 0 = No priority
- 1 = Urgent
- 2 = High
- 3 = Medium
- 4 = Low

After the user finishes setting metadata, proceed directly to Phase 3 (IDs are already resolved).

**If "Edit the description":**

Use AskUserQuestion: "What should the description be?" The user provides updated text. Return to Phase 2 Step 2 with the updated content (template is NOT re-applied -- the user is editing the final form).

**If "Cancel":**

Stop. Output: "Ticket creation cancelled."

**If "Looks good, create it":**

Proceed to Phase 2 Step 3 (resolve names to IDs).

**Step 3: Resolve label and project names to IDs**

At this point, labels and project are stored as name strings (from Phase 1 text detection and config defaults). Before entering Phase 3, resolve them to IDs:

1. **Labels:** If there are any accumulated label names:
   - Call `mcp__claude_ai_Linear__list_labels` with the resolved team ID
   - For each label name, find a match in the response (case-insensitive name comparison)
   - If a label name has no match, warn: "Label '<name>' not found in team labels -- skipping." Drop that label from the list.
   - Collect the matched label IDs into an array for Phase 3
   - If `list_labels` fails entirely (tool unavailable), warn: "Could not resolve label names to IDs -- labels will be omitted." Clear the labels list.
2. **Project:** If a project value is set and it is a name string (not already a UUID/ID):
   - Call `mcp__claude_ai_Linear__list_projects`
   - Find a match by name (case-insensitive) in the response
   - If no match is found, warn: "Project '<name>' not found -- project will be omitted." Clear the project value.
   - If matched, store the project ID for Phase 3
   - If `list_projects` fails entirely (tool unavailable), warn: "Could not resolve project name to ID -- project will be omitted." Clear the project value.

**Note:** This step only runs on the "Looks good" path. The "I want to set metadata" path resolves IDs during the interactive editing flow (labels in the Labels subsection step 4, project in the Project subsection step 4), so those IDs are already available when that path reaches Phase 3.

Proceed to Phase 3.

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
   - `labelIds`: array of label IDs (resolved in Phase 2 Step 3 or during metadata editing)
   - `projectId`: project ID (resolved in Phase 2 Step 3 or during metadata editing)
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
     - Create a comment on the issue via `mcp__claude_ai_Linear__create_comment` (or update the description) with the file content in a fenced code block
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

The skill reads optional configuration from `.fixme/config.json`:

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

**Config default behavior:** `linear.defaultLabels` and `linear.defaultProject` are automatically applied to new tickets during Phase 1 content gathering. They appear in the Phase 2 preview with "(config default)" source annotations. The user can override, add to, or clear them during the metadata editing flow. Config defaults never override explicit user mentions -- user text takes priority for project, and labels are deduplicated.

## MCP Tool Reference

The skill uses these Linear MCP tools. Tool names follow the pattern `mcp__claude_ai_Linear__<operation>`.

| Operation | Tool | Purpose |
|-----------|------|---------|
| Create/update issue | `save_issue` | Create the ticket with all metadata |
| List issues | `list_issues` | Search for duplicates (future) |
| Get issue | `get_issue` | Verify creation succeeded |
| List projects | `list_projects` | Resolve project name to ID |
| List teams | `list_teams` | Resolve team for issue creation |
| List labels | `list_labels` | Resolve label names to IDs (team-scoped) |
| List users | `list_users` | Resolve assignee name to ID |
| List workflow states | `list_workflow_states` | Resolve status name to ID (team-scoped) |
| Create comment | `create_comment` | Attachment fallback, add context |
| Create attachment | `create_attachment` | Attach files to issue |

**Tool discovery:** Not all tools may be available in every environment. The skill attempts each tool as needed and handles "tool not found" errors gracefully (with warnings), except for `save_issue` which is required -- without it, no ticket can be created.

## Rules

1. **Linear MCP is required.** If `save_issue` is not available, stop and tell the user to enable the Linear MCP. Do not attempt workarounds.

2. **Always preview before creating.** Never create a ticket without showing the user what will be created and getting explicit confirmation (unless this is a programmatic dispatch with all fields pre-populated).

3. **Use AskUserQuestion for all user decisions.** Structured prompts with options, not freeform text questions.

4. **Graceful degradation for optional tools.** If `list_labels`, `list_users`, `list_workflow_states`, `create_attachment`, or `create_comment` are unavailable, warn the user and skip that feature. The core flow (create issue with title + description) must always work.

5. **Template application preserves user content.** Never discard content that doesn't fit a template section. Add a "Notes" section as a catch-all.

6. **Natural language date parsing.** Accept "next Friday", "end of month", "2026-04-20" and convert to ISO format. If ambiguous, confirm with the user.

7. **Send markdown content directly.** Per the Linear MCP server instruction, send real newlines in markdown content, not escaped `\n` characters.

8. **Log all MCP failures with context.** Every failed MCP call gets a warning message that includes: which tool failed, what parameters were used (excluding any sensitive data), and what the fallback behavior is.

9. **Respect Linear's data model.** Labels, projects, statuses, and users are resolved by ID, not by name. Always resolve names to IDs via MCP list/search tools before passing to `save_issue`. Both paths through Phase 2 (direct confirmation and metadata editing) must produce resolved IDs before reaching Phase 3.

10. **One ticket per invocation.** The skill creates exactly one ticket. For batch creation, the user invokes the skill multiple times.

11. **Resolve team before metadata.** Labels, users, and workflow states are team-scoped in Linear. The team must be resolved before any metadata listing operations. Never call `list_labels`, `list_users`, or `list_workflow_states` without a resolved team ID.

12. **Config defaults are additive, never overriding.** `linear.defaultLabels` are merged with user-detected labels (deduplicated, case-insensitive). `linear.defaultProject` is used only when no project was explicitly mentioned by the user. The user can always override or clear config defaults during the metadata editing flow.
