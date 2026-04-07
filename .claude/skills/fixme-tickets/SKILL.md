---
name: fixme-tickets
description: "Abstract ticket interface. Routes operations to the configured backend (fixme-tickets-md, fixme-tickets-linear, etc). Reads ticketBackend from .fixme/config.json."
disable-model-invocation: true
---

# Fixme Tickets - Abstract Ticket Interface

Routes ticket and session operations to the configured backend. The backend is determined by the `ticketBackend` field in `.fixme/config.json`. If the field is missing or the file doesn't exist, defaults to `fixme-tickets-md`.

## Backend Resolution

1. Read `.fixme/config.json` from the project root
2. Extract `ticketBackend` field (e.g., `"fixme-tickets-md"`, `"fixme-tickets-linear"`)
3. If missing or file doesn't exist, use `fixme-tickets-md`
4. Dispatch the operation to `~/.claude/skills/{ticketBackend}/SKILL.md`

## Operations

All operations are dispatched to the backend skill via the Agent tool. Pass the operation name and all arguments verbatim.

### Ticket Operations

| Operation | Arguments | Description |
|-----------|-----------|-------------|
| `create` | `<session-dir> [--slug <slug>]` | Create a new ticket in the session |
| `transition` | `<ticket.md> <state> [--reason <reason>] [--pipeline <name>]` | Transition a ticket to a new state |
| `list` | `<session-dir>` | List all tickets in the session |
| `next` | `<session-dir>` | Get the next queued ticket |
| `rename` | `<ticket.md> --slug <new-slug>` | Rename a ticket's slug |
| `summary` | `<ticket.md>` | Get a summary of a single ticket |

### Session Operations

| Operation | Arguments | Description |
|-----------|-----------|-------------|
| `session create` | `<base-dir> [--name <name>]` | Create a new session |
| `session list` | `<base-dir>` | List all sessions |
| `session summary` | `<session-dir>` | Get session summary with ticket stats |

### Context Operations

| Operation | Arguments | Description |
|-----------|-----------|-------------|
| `context detect` | _(none)_ | Auto-detect project context |
| `context load` | _(none)_ | Load saved project context |
| `context save` | `--data '<json>'` | Save project context |

## Dispatch Protocol

For each operation:

1. Resolve the backend skill name (see Backend Resolution above)
2. Dispatch via Agent tool with a prompt that tells the agent to read its own SKILL.md first:
   ```
   First, read ~/.claude/skills/{backend}/SKILL.md for your role instructions.

   Then execute this operation:
   - Operation: {operation name}
   - Arguments: {all arguments}
   - Project root: {path}
   ```
3. Return the backend's output verbatim

**Never paste SKILL.md content into the prompt** - long skill files get truncated, causing the agent to default to general-purpose behavior. The agent reads its own SKILL.md as its first action.

## Example

```
User invokes: fixme-tickets create /path/to/session --slug login-bug

1. Read .fixme/config.json -> ticketBackend: "fixme-tickets-md"
2. Agent dispatch:
   "First, read ~/.claude/skills/fixme-tickets-md/SKILL.md for your role instructions.

   Then execute this operation:
   - Operation: create
   - Arguments: /path/to/session --slug login-bug
   - Project root: /path/to/project"
3. Return result
```
