---
name: fixme-tickets-linear
description: "Linear ticket backend (v2 stub). Maps ticket operations to Linear MCP tool calls."
---

# Fixme Tickets Linear - Linear Backend (v2 Stub)

Maps ticket and session operations to Linear via MCP tool calls. This is a v2 stub - not yet implemented.

## Status

**Not implemented.** This backend will be built in a future version. The operation interface below documents the intended mapping from abstract ticket operations to Linear MCP tools.

## Planned Operation Mapping

### Ticket Operations

| Operation | Linear MCP Tool | Notes |
|-----------|----------------|-------|
| `create` | `mcp__claude_ai_Linear__save_issue` | Creates a Linear issue. Session maps to a Linear project or label. |
| `transition` | `mcp__claude_ai_Linear__save_issue` | Updates issue status. State machine enforcement happens in this skill before calling Linear. |
| `list` | `mcp__claude_ai_Linear__list_issues` | Filters by project/label matching the session. |
| `next` | `mcp__claude_ai_Linear__list_issues` | Filters for issues in the "queued" equivalent status, returns first. |
| `rename` | `mcp__claude_ai_Linear__save_issue` | Updates issue title/identifier. |
| `summary` | `mcp__claude_ai_Linear__get_issue` | Fetches issue details. |

### Session Operations

| Operation | Linear MCP Tool | Notes |
|-----------|----------------|-------|
| `session create` | `mcp__claude_ai_Linear__save_project` | Creates a Linear project to represent the session. |
| `session list` | `mcp__claude_ai_Linear__list_projects` | Lists projects matching the fixme session pattern. |
| `session summary` | `mcp__claude_ai_Linear__get_project` | Fetches project with issue counts. |

### Context Operations

Context operations (`detect`, `load`, `save`) are local-only and do not map to Linear. They will use the same `fixme-tools.cjs` context commands as the MD backend.

## Implementation Notes

When implemented, this backend will need to:

1. **Map state machine to Linear statuses.** Each Linear team has its own workflow statuses. The backend will need to resolve pipeline phases to Linear status IDs on first use.
2. **Store the Linear-to-fixme mapping.** A local mapping file (`.fixme/linear-mapping.json`) will track which Linear status IDs correspond to which pipeline phases.
3. **Enforce transition rules locally.** The state machine validation runs before calling Linear, not after. Invalid transitions are rejected without touching the API.
4. **Handle offline/conflict.** If Linear state diverges from expected (e.g., someone moved an issue in the UI), the backend should detect and report the conflict rather than silently overwriting.
