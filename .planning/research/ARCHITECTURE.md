# Architecture Research

**Domain:** Claude Code skill system with agent orchestration (bug-fixing automation)
**Researched:** 2026-02-18
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
+------------------------------------------------------------------+
|                     SKILL LAYER (Entry Points)                     |
|  ~/.claude/fixme/commands/                                        |
|  +----------+  +-----------+  +----------+  +-----------+         |
|  | /fixme:  |  | /fixme:   |  | /fixme:  |  | /fixme:   |        |
|  | triage   |  | fix       |  | status   |  | close     |        |
|  +----+-----+  +-----+-----+  +----+-----+  +-----+-----+       |
|       |              |              |              |               |
+-------+--------------+--------------+--------------+-------+------+
        |              |                                     |
+-------v--------------v-------------------------------------v------+
|                     ORCHESTRATOR LAYER                             |
|  ~/.claude/fixme/workflows/                                       |
|  +-----------------------------------------------------------+   |
|  |  triage-workflow.md  |  fix-workflow.md  |  close-wf.md    |   |
|  |  (lean orchestrator - reads ticket, spawns subagents,      |   |
|  |   collects results, updates ticket state)                  |   |
|  +-----------------------------------------------------------+   |
|       |              |                                            |
|   Task()         Task()                                           |
|   spawn          spawn                                            |
+---+--+-----------+--+--------------------------------------------+
    |  |           |  |
+---v--v---+  +----v--v---+  +-----------+  +-----------+
| SUBAGENT |  | SUBAGENT  |  | SUBAGENT  |  | SUBAGENT  |
| LAYER    |  |           |  |           |  |           |
|          |  |           |  |           |  |           |
| intake   |  | reproducer|  | fixer     |  | verifier  |
| agent    |  | agent     |  | agent     |  | agent     |
+----+-----+  +-----+-----+  +-----+-----+  +-----+-----+
     |              |              |              |
+----v--------------v--------------v--------------v---------+
|                     STATE LAYER (Ticket Files)             |
|  ~/.claude/fixme/tickets/                                  |
|  +------------------------------------------------------+ |
|  | TICKET-001.md  TICKET-002.md  TICKET-003.md  ...     | |
|  | (frontmatter + structured sections = full state)      | |
|  +------------------------------------------------------+ |
|                                                            |
|  ~/.claude/fixme/state/                                    |
|  +------------------------------------------------------+ |
|  | queue.md  (active ticket list, priorities)            | |
|  | config.json  (system settings)                        | |
|  +------------------------------------------------------+ |
+------------------------------------------------------------+
         |                    |
+--------v--------+  +-------v----------+
| BROWSER LAYER   |  | CODEBASE LAYER   |
| (Playwright)    |  | (Read/Write/Bash)|
|                 |  |                  |
| navigate()      |  | grep/glob        |
| snapshot()      |  | edit/write       |
| click()         |  | git commit       |
| screenshot()    |  | test runners     |
+-----------------+  +------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Skill commands** (`commands/`) | Entry points invoked via `/fixme:*`. Thin wrappers: parse args, reference workflow, specify allowed tools. | MD files with frontmatter (`name`, `description`, `allowed-tools`) + `<execution_context>` pointing to workflow |
| **Workflows** (`workflows/`) | Orchestration logic. Stays lean (~15% context). Reads ticket state, spawns subagents via `Task()`, handles routing between agent returns. | MD files with `<process>` steps, spawn patterns, routing logic, state update commands |
| **Agent roles** (`agents/`) | Role definitions for subagents. Each loaded by the subagent at spawn time via `Read`. Defines behavior, tools, protocols. | MD files with `<role>`, `<execution_flow>`, `<success_criteria>` |
| **Ticket files** (`tickets/`) | Persistent state. YAML frontmatter for machine-readable fields + markdown body for structured sections. Single source of truth for each bug. | `TICKET-NNN.md` with status, priority, reproduction steps, root cause, fix plan, verification result |
| **Queue state** (`state/`) | System-level state across tickets. Active queue, config, aggregate metrics. | `queue.md` (ordered list), `config.json` (settings) |
| **Templates** (`templates/`) | Structured output templates for consistent file generation across agents. | MD files with placeholder patterns |
| **References** (`references/`) | Shared reference docs loaded by multiple agents. Domain knowledge, protocols, conventions. | MD files with patterns, rules, lookup tables |
| **Browser tools** (Playwright MCP or CLI) | Browser automation for reproduction and verification. MCP available as `mcp__plugin_playwright_playwright__*` tools; CLI via Bash. | Snapshot-driven interaction: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_screenshot` |

## Recommended Project Structure

```
~/.claude/fixme/
+-- commands/                  # Skill entry points (slash commands)
|   +-- triage.md              # /fixme:triage - intake and classify a bug
|   +-- fix.md                 # /fixme:fix - reproduce, diagnose, fix a ticket
|   +-- status.md              # /fixme:status - show queue and progress
|   +-- close.md               # /fixme:close - verify fix and close ticket
|
+-- workflows/                 # Orchestration logic (lean coordinators)
|   +-- triage-workflow.md     # Intake orchestrator: parse bug -> spawn intake agent -> create ticket
|   +-- fix-workflow.md        # Fix orchestrator: read ticket -> spawn reproducer -> fixer -> verifier
|   +-- close-workflow.md      # Close orchestrator: verify fix holds, update ticket, git
|
+-- agents/                    # Subagent role definitions
|   +-- intake-agent.md        # Parses bug reports, extracts repro steps, classifies severity
|   +-- reproducer-agent.md    # Uses Playwright to reproduce the bug, captures screenshots
|   +-- fixer-agent.md         # Reads codebase, identifies root cause, implements fix
|   +-- verifier-agent.md      # Runs fix verification: tests pass, bug no longer reproduced
|
+-- templates/                 # Output templates
|   +-- ticket.md              # Ticket file template (frontmatter + sections)
|   +-- fix-summary.md         # Fix completion summary template
|
+-- references/                # Shared knowledge docs
|   +-- playwright-patterns.md # Browser automation patterns and anti-patterns
|   +-- ticket-lifecycle.md    # State machine: open -> triaged -> reproducing -> fixing -> verifying -> closed
|   +-- codebase-context.md    # Project-specific patterns (populated per-project)
|
+-- state/                     # System-level state
|   +-- queue.md               # Active ticket queue with priorities
|   +-- config.json            # System configuration
|
+-- tickets/                   # Individual ticket files (the persistent state)
|   +-- TICKET-001.md
|   +-- TICKET-002.md
|   +-- ...
```

### Structure Rationale

- **`commands/`:** Mirrors GSD pattern (`~/.claude/commands/gsd/`). Each file is a thin entry point that references a workflow. Claude Code discovers these as `/fixme:*` slash commands.
- **`workflows/`:** Mirrors GSD pattern (`~/.claude/get-shit-done/workflows/`). Contains the orchestration logic. Workflows are NOT commands -- they are referenced BY commands via `<execution_context>`. This separation lets commands be thin (parse args, declare tools) while workflows contain full process logic.
- **`agents/`:** Mirrors GSD pattern (`~/.claude/agents/gsd-*.md`). Subagents read their role file as the first instruction when spawned. Role files define behavior without being tied to a specific invocation.
- **`templates/`:** Ensures consistent structured output. Agents reference templates when creating files.
- **`references/`:** Shared knowledge across agents. Prevents duplication of patterns (e.g., Playwright usage patterns referenced by both reproducer and verifier).
- **`tickets/`:** File-based state. Each ticket is self-contained. No database needed. Frontmatter enables machine parsing; body sections provide human-readable context.
- **`state/`:** System-level coordination. Queue ordering, configuration. Kept separate from tickets for clean boundaries.

## Architectural Patterns

### Pattern 1: Thin Command -> Rich Workflow -> Lean Orchestrator -> Fresh Subagents

**What:** Three-layer delegation pattern. Command files are minimal (frontmatter + workflow reference). Workflow files contain orchestration logic but stay lean (~15% context). Subagents get fresh 200k context each.

**When to use:** Always. This is the core pattern.

**Trade-offs:**
- Pro: Orchestrator never runs out of context. Each subagent has full capacity.
- Pro: Commands are easy to add/modify without touching orchestration.
- Con: More files to maintain. Agent spawning has overhead.

**Example (command file):**
```markdown
---
name: fixme:fix
description: Reproduce, diagnose, and fix a bug from a ticket
argument-hint: "<ticket-id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Task
  - Glob
  - Grep
  - mcp__plugin_playwright_playwright__*
---
<execution_context>
@~/.claude/fixme/workflows/fix-workflow.md
@~/.claude/fixme/references/ticket-lifecycle.md
</execution_context>

<context>
Ticket: $ARGUMENTS
</context>
```

**Example (workflow spawning subagent):**
```markdown
Task(
  prompt="First, read ~/.claude/fixme/agents/reproducer-agent.md for your role.

  <ticket>
  {ticket_frontmatter_and_repro_steps}
  </ticket>

  <output>
  Update ticket file with reproduction result.
  </output>",
  subagent_type="general-purpose",
  description="Reproduce bug TICKET-{id}"
)
```

### Pattern 2: Ticket-as-State (File-Based State Machine)

**What:** Each ticket MD file IS the state. YAML frontmatter carries machine-readable fields (status, priority, assignee). Markdown body carries structured sections (reproduction steps, root cause, fix plan). Agents read the ticket, do work, write back to the ticket.

**When to use:** For all persistent state that crosses agent boundaries.

**Trade-offs:**
- Pro: No database. Git-trackable. Human-readable. Agent-parseable.
- Pro: Each agent reads only the ticket it needs (no shared mutable state).
- Con: Concurrent writes to same ticket need careful ordering (solve with sequential agent execution per ticket).

**Example (ticket frontmatter):**
```yaml
---
id: TICKET-001
status: triaged          # open | triaged | reproducing | fixing | verifying | closed | wontfix
priority: high           # critical | high | medium | low
source: linear           # linear | manual | stream
source_id: FE-1234       # External reference
created: 2026-02-18
updated: 2026-02-18
url: https://app.example.com/dashboard
component: dashboard
error: "TypeError: Cannot read property 'map' of undefined"
browser: chrome
---

# TICKET-001: Dashboard crashes on empty data

## Bug Report
[Original report text]

## Reproduction Steps
1. Navigate to /dashboard
2. Clear all user data
3. Refresh page
4. Observe crash

## Reproduction Result
Status: confirmed
Screenshot: ./screenshots/TICKET-001-repro.png
Console errors: TypeError at Dashboard.tsx:45

## Root Cause
[Filled by fixer agent]

## Fix Plan
[Filled by fixer agent]

## Fix Result
[Filled by fixer agent]

## Verification
[Filled by verifier agent]
```

### Pattern 3: Snapshot-Driven Browser Automation

**What:** Use Playwright's `browser_snapshot` (accessibility tree) for decision-making and `browser_screenshot` for evidence capture. Snapshots are text-based and parseable by the LLM. Screenshots are visual proof.

**When to use:** For reproduction and verification of UI bugs.

**Trade-offs:**
- Pro: Snapshots are lightweight and LLM-parseable (unlike screenshots which require vision).
- Pro: Element refs from snapshots enable precise interaction (`browser_click` with ref).
- Con: Some visual bugs (styling, layout) need screenshots, not just snapshots.
- Con: Complex multi-step interactions consume significant context.

**Example flow:**
```
1. browser_navigate(url)           -> Load the page
2. browser_snapshot()              -> Get accessibility tree with refs
3. browser_click(ref="button[3]")  -> Interact using snapshot refs
4. browser_snapshot()              -> Check result state
5. browser_screenshot(type="png")  -> Capture visual evidence
6. browser_console_messages()      -> Check for JS errors
```

## Data Flow

### Triage Flow (Bug Report -> Ticket)

```
[Bug Report]  (Linear issue, manual input, or stream)
      |
      v
[/fixme:triage]  (command entry point)
      |
      v
[triage-workflow]  (orchestrator)
      |
      |  reads: bug report source
      |  spawns: intake-agent
      |
      v
[intake-agent]  (subagent, fresh context)
      |
      |  parses: bug description, extracts structured data
      |  classifies: severity, component, affected URL
      |  writes: tickets/TICKET-NNN.md (status: triaged)
      |  updates: state/queue.md (add to queue)
      |
      v
[Ticket Created]
```

### Fix Flow (Ticket -> Code Change)

```
[/fixme:fix TICKET-NNN]  (command entry point)
      |
      v
[fix-workflow]  (orchestrator, ~15% context)
      |
      |  reads: ticket frontmatter + repro steps
      |  updates: ticket status -> reproducing
      |
      +------> [reproducer-agent]  (subagent, fresh 200k context)
      |              |
      |              |  reads: ticket repro steps
      |              |  uses: Playwright (MCP or CLI)
      |              |  actions: navigate, interact, capture screenshots
      |              |  captures: console errors, network failures
      |              |  writes: ticket "Reproduction Result" section
      |              |  returns: confirmed | could-not-reproduce | different-behavior
      |              |
      |        <-----+
      |
      |  reads: reproduction result from ticket
      |  updates: ticket status -> fixing
      |
      +------> [fixer-agent]  (subagent, fresh 200k context)
      |              |
      |              |  reads: ticket (full), codebase context
      |              |  uses: Grep, Glob, Read, Edit, Bash
      |              |  actions: find root cause, implement fix, run tests
      |              |  writes: ticket "Root Cause" + "Fix Plan" + "Fix Result"
      |              |  commits: atomic git commit per fix
      |              |  returns: fixed | needs-architectural-decision | blocked
      |              |
      |        <-----+
      |
      |  reads: fix result from ticket
      |  updates: ticket status -> verifying
      |
      +------> [verifier-agent]  (subagent, fresh 200k context)
                     |
                     |  reads: ticket (full), reproduction steps
                     |  uses: Playwright (MCP or CLI) + Bash (test runner)
                     |  actions: re-run reproduction (should NOT reproduce)
                     |  actions: run test suite (should pass)
                     |  writes: ticket "Verification" section
                     |  returns: verified | still-broken | regression-found
                     |
               <-----+

[Orchestrator routes based on return]
  - verified    -> update ticket status: closed
  - still-broken -> update ticket, offer retry or escalate
  - regression  -> create new ticket for regression
```

### Key Data Flows

1. **Ticket as Message Bus:** Every agent reads from and writes to the ticket file. The ticket IS the communication channel between agents. Orchestrator never relays content -- it passes ticket paths and agents read directly.

2. **Orchestrator Stays Lean:** Orchestrator reads only ticket frontmatter (status, priority) to make routing decisions. It never reads full ticket body. Subagents read what they need with their fresh context.

3. **Evidence Accumulation:** Each agent adds to the ticket rather than replacing. Reproduction adds screenshots and console logs. Fixer adds root cause and commit hashes. Verifier adds verification result. The ticket grows into a complete audit trail.

4. **Linear Integration (Bidirectional):** Triage can pull from Linear issues. Close can push status back to Linear. The Linear MCP tools (`mcp__plugin_linear_linear__*`) handle this without custom API code.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 tickets | Single queue file. Sequential processing. Manual triage. |
| 10-50 tickets | Priority queue. Batch triage from Linear. Consider parallel fix attempts on independent tickets. |
| 50+ tickets | Archive closed tickets to `tickets/closed/`. Add deduplication in triage. Consider ticket categories for routing to specialized fixer agents. |

### Scaling Priorities

1. **First bottleneck: Context per ticket.** Complex bugs with long reproduction steps + large codebases eat context fast. Mitigation: Keep each agent focused (reproducer only reproduces, fixer only fixes). Never combine roles.

2. **Second bottleneck: Queue management.** As tickets accumulate, the orchestrator needs efficient priority selection without reading all ticket files. Mitigation: `queue.md` maintains a sorted list with just IDs and priorities, not full content.

## Anti-Patterns

### Anti-Pattern 1: Fat Orchestrator

**What people do:** Put reproduction logic, fix logic, and verification in the orchestrator workflow.

**Why it's wrong:** Orchestrator context fills up after 2-3 tickets. Quality degrades. Can't handle complex bugs.

**Do this instead:** Orchestrator only reads frontmatter, makes routing decisions, and spawns subagents. All heavy work in subagents with fresh 200k context each.

### Anti-Pattern 2: Passing Content Through Orchestrator

**What people do:** Orchestrator reads ticket body, extracts repro steps, passes them in the `Task()` prompt to the subagent.

**Why it's wrong:** Wastes orchestrator context budget. Information may be lossy in transit.

**Do this instead:** Pass the ticket FILE PATH. Subagent reads the file directly with its own fresh context. Orchestrator only passes paths and routing metadata.

### Anti-Pattern 3: Screenshot-First Browser Interaction

**What people do:** Take screenshots and try to parse them visually for every interaction step.

**Why it's wrong:** Screenshots consume massive context (vision tokens). LLMs are unreliable at pixel-level UI parsing.

**Do this instead:** Use `browser_snapshot()` for the accessibility tree (text-based, precise element refs). Use `browser_screenshot()` only for visual evidence capture, not for interaction decision-making.

### Anti-Pattern 4: Shared Mutable State

**What people do:** Multiple agents writing to the same section of a ticket simultaneously.

**Why it's wrong:** Race conditions. Last writer wins. Data loss.

**Do this instead:** Sequential agent execution per ticket (reproducer finishes before fixer starts). Each agent owns specific sections of the ticket. Orchestrator enforces ordering.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Linear | MCP tools (`mcp__plugin_linear_linear__*`) | Pull issues for triage, push status updates on close. Already available in tool set. |
| Playwright | MCP tools (`mcp__plugin_playwright_playwright__*`) | Browser automation for reproduction and verification. Snapshot-driven interaction. |
| Git | Bash (`git add`, `git commit`) | Atomic commits per fix. Branch management for isolation. |
| Test Runners | Bash (`yarn test`, etc.) | Verification step runs project test suite. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Command <-> Workflow | `@` file reference in `<execution_context>` | Command declares tools + args. Workflow contains full process. |
| Workflow <-> Agent | `Task()` with file paths | Orchestrator spawns, passes ticket path. Agent reads file directly. |
| Agent <-> Ticket | `Read` + `Write`/`Edit` tools | Agent reads ticket, does work, writes back specific sections. |
| Agent <-> Browser | Playwright (MCP or CLI) tool calls | Snapshot for decisions, click/type for interaction, screenshot for evidence. |
| Agent <-> Codebase | `Grep`/`Glob`/`Read`/`Edit`/`Bash` | Standard code tools. Fixer agent does all codebase interaction. |

## Build Order (Dependency Chain)

The components have clear dependency ordering. This directly informs roadmap phasing:

```
Phase 1: Skeleton + Ticket State
  - commands/ directory with stub commands
  - templates/ticket.md
  - state/queue.md
  - references/ticket-lifecycle.md
  Produces: Can create and read ticket files manually

Phase 2: Intake/Triage Pipeline
  - agents/intake-agent.md
  - workflows/triage-workflow.md
  - commands/triage.md (flesh out)
  Depends on: Phase 1 (ticket template exists)
  Produces: Can create tickets from bug reports

Phase 3: Browser Reproduction
  - agents/reproducer-agent.md
  - references/playwright-patterns.md
  - Playwright (MCP or CLI) integration patterns
  Depends on: Phase 2 (tickets exist to reproduce)
  Produces: Can reproduce bugs and capture evidence

Phase 4: Fix Implementation
  - agents/fixer-agent.md
  - workflows/fix-workflow.md (orchestrator)
  - commands/fix.md (flesh out)
  Depends on: Phase 3 (reproduction results inform fixing)
  Produces: Can find root cause and implement fixes

Phase 5: Verification + Close
  - agents/verifier-agent.md
  - workflows/close-workflow.md
  - commands/close.md (flesh out)
  Depends on: Phase 3 (reuses reproduction patterns) + Phase 4 (fixes exist to verify)
  Produces: End-to-end bug fix pipeline

Phase 6: Linear Integration
  - Linear MCP integration in triage (pull issues)
  - Linear MCP integration in close (push status)
  Depends on: Phase 2 + Phase 5 (full pipeline works)
  Produces: Automated pipeline from Linear issue to closed fix
```

**Key dependency insight:** Browser reproduction (Phase 3) is the highest-risk component and blocks both fixing and verification. Build it early, validate the Playwright (MCP or CLI) patterns work reliably, then the downstream phases can leverage those patterns.

## Sources

- GSD reference architecture at `~/.claude/get-shit-done/` (direct code analysis, HIGH confidence)
- Claude Code skill system: `~/.claude/commands/`, `~/.claude/skills/` directory conventions (direct inspection, HIGH confidence)
- Playwright (MCP or CLI) tools: available tool definitions in current session (direct observation, HIGH confidence)
- Linear MCP tools: available tool definitions in current session (direct observation, HIGH confidence)
- GSD agent patterns: `~/.claude/agents/gsd-*.md` (direct code analysis, HIGH confidence)

---
*Architecture research for: Claude Code skill system with agent orchestration (Fixme)*
*Researched: 2026-02-18*
