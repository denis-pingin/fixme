# Phase 1: Foundation & Skeleton - Research

**Researched:** 2026-02-18
**Domain:** Claude Code skill system — file-based state management, ticket lifecycle, session management, project context discovery
**Confidence:** HIGH

## Summary

Phase 1 delivers the infrastructure layer: the skill directory at `.claude/skills/fixme/`, a ticket template with YAML frontmatter state machine, session management, project context auto-discovery, and a CJS tooling script for state operations. All downstream agents (intake, investigation, fix, verification) depend on these primitives being correct from day one. The critical architectural decision is **standalone skill** (not a GSD extension) — GSD's command-based single-turn model is fundamentally incompatible with Fixme's long-running session orchestrator.

The skill uses Claude Code's native skills system (`SKILL.md` with frontmatter), file-based state through ticket markdown files with YAML frontmatter, and a CJS utility script (`fixme-tools.cjs`) for state management operations (ticket creation, state transitions, session lifecycle). The state machine is strict: invalid transitions throw errors, every transition is logged with timestamps, and terminal states (`done`, `failed`, `skipped`) are final. Project context lives in YAML format at `.fixme/project-context.yaml` and is auto-detected from CLAUDE.md, package.json, and other config files.

**Primary recommendation:** Build as a standalone Claude Code skill at `.claude/skills/fixme/`. Use GSD's file patterns as a reference architecture (CJS tooling, MD agents, frontmatter conventions), but share zero runtime code with GSD. The two systems have incompatible execution models.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Architecture Investigation (CRITICAL)
- **Evaluate building on top of GSD (Get Shit Done) framework vs standalone skill** — GSD already has subagents (researcher, planner, executor, verifier) that could be reused
- If GSD extension: only build what's missing (intake system, bug-specific agents)
- If standalone: build everything from scratch
- This decision affects everything downstream — researcher must evaluate this FIRST

#### Ticket Template
- Full lifecycle template — all sections present from creation, empty until filled by agents
- Sections: Original Report, Structured Fields (intake-populated), Clarifications, Investigation, Fix, Verification
- Original report is always the source of truth — structured fields are agent interpretations that may be wrong
- YAML frontmatter: state, timestamps, ticket number, session name, per-state duration tracking, affected URL, reporter context, commit hash, optional related field
- No priority field — FIFO queue
- Investigation: numbered attempts with investigation/fix/verify sub-sections per attempt
- Root cause hypothesis required before any fix attempt
- Fix section: approach description (required), list of changed files, commit hash
- Verification: before/after browser snapshots required in assets
- Dedicated failure reason field for failed tickets
- Clarifications section for intake agent Q&A with user
- Tickets at `.fixme/sessions/<session-name>/tickets/` with 4-digit numbering: `0001-descriptive-slug.md`
- Screenshots in per-ticket subfolders: `.fixme/sessions/<session-name>/assets/0001-slug/01.png`

#### Sessions
- Sessions are folders: `.fixme/sessions/<session-name>/`
- Each session contains `tickets/` and `assets/` subdirectories
- Session manifest (`session.md`): basic metadata at start, completion stats at end
- Auto-generated default name, optional custom name
- Resuming continues from current state (no reset)

#### Max Attempts
- Configurable max fix attempts — settable globally, per project, or at session start

#### Project Context
- Multiple source detection: CLAUDE.md, package.json, .env, config files
- Content: dev server command/URL, build command, test infrastructure, lint command, framework detection, HMR availability
- YAML format: `.fixme/project-context.yaml` (per-project, shared across sessions)
- First time: auto-detect → present for confirmation → save
- Subsequent: silent reuse
- Agent corrections: propose → user confirms → save
- No silent writes ever

#### State Machine
- States: `queued`, `investigating`, `fixing`, `verifying`, `done`, `failed`, `skipped`
- Valid transitions: queued->investigating, investigating->fixing, fixing->verifying, verifying->done, verifying->investigating (retry), queued->skipped, investigating->skipped, any active->failed
- Terminal states: done, failed, skipped
- Hard error on invalid transitions
- Reasons required for non-happy-path transitions
- Full transition log in frontmatter: {from, to, timestamp, reason}
- Timeouts on agent steps, not ticket states
- Sequential queue (v1)
- Auto-advance on failure

#### Orchestration
- Invocation mechanism: TBD (depends on GSD vs standalone — now resolved: standalone)
- Orchestrator runs single continuous turn, dispatching subagents sequentially via Task
- Orchestrator keeps turn alive by prompting for new bugs when idle

### Claude's Discretion
- Ticket YAML frontmatter field ordering and exact key names
- Auto-generated session name format
- Smoke test implementation details
- Exact structured section names in the ticket template
- How the orchestrator detects bug-like messages vs conversation
- Internal architecture of the state machine (code structure, validation approach)

### Deferred Ideas (OUT OF SCOPE)
- Live session manifest tracking (real-time ticket updates in session.md)
- Per-section confidence indicators on intake-populated fields
- Bug type/severity categorization in frontmatter
- Auth credentials in project context (for logged-in app testing)
- Parallel ticket processing (multiple active tickets simultaneously)
- Batch bug submission (multiple bugs in one message)
- .fixme/ git commit strategy (multi-user collision handling)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYST-01 | The skill installs at ~/.claude/fixme/ and is invoked via /fixme:start (or similar command) | Skill system docs verified: `.claude/skills/fixme/SKILL.md` is the entry point. `/fixme` invokes it. `disable-model-invocation: true` prevents auto-triggering. |
| SYST-02 | Structured ticket MD template ensures consistent agent output across all tickets | Ticket template design with full lifecycle sections, YAML frontmatter with state machine fields. Template file at `.claude/skills/fixme/templates/ticket.md`. |
| SYST-03 | Architecture supports future parallel implementation agents (separate concerns, no shared mutable state) | File-per-ticket state, no shared index file, sequential-per-ticket agent execution. Queue derived from filesystem listing. Each ticket is self-contained. |
| SYST-04 | Ticket files serve as persistent state that survives context compaction | Tickets are `.md` files on disk at `.fixme/sessions/<name>/tickets/`. Orchestrator reads from disk every cycle, never from memory. Survives compaction by design. |
| STAT-01 | Each ticket tracks state: queued -> investigating -> fixing -> verifying -> done/failed | State machine with 7 states, valid transition matrix, hard error on invalid transitions. State stored in YAML frontmatter `state:` field. |
| STAT-02 | Each state transition is timestamped with duration calculated per phase | Transition log array in frontmatter: `{from, to, timestamp, reason}`. Per-state duration calculated from entered/exited timestamps. |
| BROW-01 | Implementation agent reads project CLAUDE.md to discover dev server URL, build commands, and HMR support | Project context discovery from multiple sources. Stored as `.fixme/project-context.yaml`. Auto-detected first time, reused silently after. |
</phase_requirements>

## Architecture Decision: Standalone Skill (Not GSD Extension)

**Recommendation: Standalone skill. HIGH confidence.**

This was the CRITICAL architecture investigation called out in CONTEXT.md. After deep analysis of GSD's codebase, here is the evaluation.

### What GSD Provides

| Component | How It Works in GSD | Reusable for Fixme? |
|-----------|---------------------|---------------------|
| Commands (`~/.claude/commands/gsd/`) | Single-turn invocations. User types `/gsd:plan-phase 1`, command runs, returns result. | **No.** Fixme needs a long-running session that stays alive. |
| Workflows (`~/.claude/get-shit-done/workflows/`) | Step-by-step orchestration loaded via `@` references. Each workflow is one operation. | **No.** Fixme's orchestrator is a continuous loop, not a linear workflow. |
| Agents (`~/.claude/agents/gsd-*.md`) | Specialized for planning: researcher, planner, executor, verifier. | **No.** None of these match bug-fixing agents (intake, reproducer, fixer, browser verifier). The "executor" runs plan tasks, not bug fixes. The "verifier" checks phase goals, not browser states. |
| CJS tooling (`bin/gsd-tools.cjs`) | 2400+ lines specialized for planning: frontmatter CRUD, phase management, roadmap operations, summary generation. | **Partially.** The frontmatter parser pattern is reusable, but the actual code is tightly coupled to GSD's domain (phases, plans, summaries, milestones). |
| Templates (`templates/`) | Plan templates, summary templates, project templates. | **No.** All GSD-specific structures. |
| State management | `STATE.md` + `ROADMAP.md` + per-phase directories. | **No.** Fixme uses per-ticket state in YAML frontmatter + session directories. Completely different model. |

### Why GSD Extension Fails

1. **Incompatible execution models.** GSD is command-based: each `/gsd:*` invocation is a single turn that does work and returns. Fixme needs a **session** that stays alive indefinitely, accepting streaming input. GSD has no concept of a persistent session loop.

2. **Different agent types.** GSD's agents (researcher, planner, executor, verifier) map to a software planning lifecycle. Fixme's agents (intake, investigator, fixer, browser verifier) map to a bug-fixing lifecycle. None are substitutable. A GSD "executor" executes plan tasks with atomic commits. A Fixme "fixer" investigates a codebase bug and applies a targeted fix. These are fundamentally different operations.

3. **Different state models.** GSD tracks phases, plans, summaries, milestones — a hierarchical tree. Fixme tracks tickets in sessions — a flat queue with per-item state machines. GSD's `gsd-tools.cjs` has zero ticket/session awareness.

4. **Coupling risk.** Extending GSD means depending on GSD's release cycle (currently v1.20.4). Breaking changes in GSD could break Fixme. GSD is installed via `npx get-shit-done-cc@latest` and updates independently.

5. **Skill system is the right abstraction.** Claude Code's skills system (`.claude/skills/fixme/SKILL.md`) gives everything needed: slash-command invocation, tool restrictions, supporting files, dynamic context injection. Skills are the official way to extend Claude Code — commands are legacy (still work, but skills are recommended).

### What We Borrow from GSD (Patterns, Not Code)

| Pattern | How GSD Does It | How Fixme Adapts It |
|---------|-----------------|---------------------|
| CJS tooling script | `gsd-tools.cjs` with subcommands | `fixme-tools.cjs` with ticket/session/context subcommands |
| YAML frontmatter in MD files | Plans and summaries have frontmatter | Tickets have frontmatter with state machine fields |
| Agent MD files | `~/.claude/agents/gsd-*.md` loaded by subagents | `.claude/skills/fixme/agents/*.md` loaded by Fixme subagents |
| Lean orchestrator | Orchestrator passes file paths, not content | Same pattern: pass ticket paths, agents read with fresh context |
| State on disk | `STATE.md` + `ROADMAP.md` | Ticket files + session.md |
| Subagent spawning via Task | `Task(subagent_type="gsd-executor", ...)` | `Task(prompt="Read fixme/agents/fixer.md for your role. Ticket: <path>")` |

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| Claude Code Skills | Current (SKILL.md format) | Skill entry point and invocation | Official way to extend Claude Code. Frontmatter controls invocation, tool access, context forking. Skills > commands for new work. |
| YAML frontmatter in MD | N/A | Ticket state, session metadata | Human-readable, agent-parseable. Same pattern used by GSD, Hugo, Jekyll, every static site generator. |
| CommonJS (`.cjs`) | Node.js 18+ | `fixme-tools.cjs` utility script | Runs with `node` directly. No ESM issues. GSD proves the pattern works. |
| Markdown files | N/A | Agent definitions, templates, ticket content | Claude Code's lingua franca. Skills, agents, CLAUDE.md — everything is MD. |
| YAML | N/A | Project context file (`.fixme/project-context.yaml`) | User-specified format from CONTEXT.md decisions. More readable than JSON for config that users edit. |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `jq` | Parse JSON from CJS tool output in skill files | Shell-level JSON manipulation when orchestrator calls `fixme-tools.cjs` |
| Node.js 18+ | Runtime for CJS tools | Required for `fixme-tools.cjs` execution |

### Not Needed (Phase 1)

| Technology | Why Not Yet |
|------------|------------|
| Playwright (MCP or CLI) | Phase 3+ (browser automation). Phase 1 has no browser interaction. |
| Agent SDK | Only if Fixme needs headless/CI mode. Interactive skill is sufficient for v1. |
| `chokidar` / file watchers | Phase 2+ (streaming intake). Phase 1 has no file watching. |

## Architecture Patterns

### Recommended Directory Structure

```
.claude/skills/fixme/           # Skill root (personal scope)
  SKILL.md                        # Entry point: /fixme
  agents/                         # Subagent role definitions
    intake-agent.md               # Bug report intake (Phase 2)
    investigator-agent.md         # Codebase investigation + browser repro (Phase 3)
    fixer-agent.md                # Root cause fix + commit (Phase 4)
    verifier-agent.md             # Browser verification (Phase 5)
  templates/                      # Structured output templates
    ticket.md                     # Full lifecycle ticket template
    session.md                    # Session manifest template
  scripts/                        # Executable utilities
    fixme-tools.cjs               # CLI tooling (state management, ticket ops)
  references/                     # Shared reference docs
    state-machine.md              # Valid transitions, enforcement rules
    project-context-schema.md     # What to detect, YAML structure

<project-root>/.fixme/            # Per-project runtime state
  project-context.yaml            # Operational project context (shared across sessions)
  sessions/                       # Session directories
    <session-name>/               # One folder per session
      session.md                  # Session manifest (metadata + stats)
      tickets/                    # Ticket files
        0001-descriptive-slug.md  # Individual ticket
        0002-another-bug.md
      assets/                     # Visual evidence
        0001-descriptive-slug/    # Per-ticket asset folder
          01.png                  # Screenshot
          02.png
```

### Pattern 1: Skill as Session Orchestrator

**What:** The SKILL.md file IS the orchestrator. It runs as a long-lived turn, maintaining a dispatch loop. It reads ticket state from disk, dispatches subagents via Task tool, reports results, and prompts for new bugs when idle.

**When to use:** This is the core execution model. The `/fixme` command starts a session, and the SKILL.md instructions drive the orchestrator loop.

**How it works:**

```yaml
---
name: fixme
description: Bug fix session orchestrator. Accepts bug reports, dispatches fix agents, manages ticket lifecycle.
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Task, Glob, Grep
---
```

The SKILL.md body contains the orchestrator loop instructions:
1. Initialize session (new or resume)
2. Detect/load project context
3. Enter dispatch loop: scan tickets dir -> find next queued -> dispatch subagent -> report result -> repeat
4. When queue empty: prompt user for new bug report
5. Exit only on explicit user stop command

**Critical constraint:** The orchestrator NEVER does investigation, fixing, or verification. It only reads ticket frontmatter for status, dispatches subagents by passing ticket file paths, and updates ticket status. All heavy work happens in subagents with fresh context.

### Pattern 2: Ticket-as-State (File-Based State Machine)

**What:** Each ticket MD file carries its complete state in YAML frontmatter. The state machine is enforced by `fixme-tools.cjs` — agents call the tool to transition state, and the tool validates the transition before writing.

**When to use:** For all ticket state mutations. Agents never write frontmatter directly; they call `fixme-tools.cjs transition <ticket-path> <new-state> [--reason "..."]`.

**Example ticket frontmatter:**

```yaml
---
number: 1
slug: login-button-not-responding
session: fix-session-20260218
state: investigating
created: 2026-02-18T14:30:00Z
updated: 2026-02-18T14:35:00Z
url: https://app.example.com/login
reporter_context: "User clicked login button, nothing happened"
commit_hash:
failure_reason:
related: []
max_attempts: 3
current_attempt: 1
transitions:
  - { from: queued, to: investigating, timestamp: "2026-02-18T14:35:00Z" }
durations:
  queued: { entered: "2026-02-18T14:30:00Z", exited: "2026-02-18T14:35:00Z", seconds: 300 }
  investigating: { entered: "2026-02-18T14:35:00Z" }
---
```

### Pattern 3: CJS Tool as State Gatekeeper

**What:** `fixme-tools.cjs` is the single source of truth for all state mutations. It validates transitions, computes durations, manages sequential numbering, creates sessions, and auto-detects project context.

**Why:** Centralizing state logic in a CJS script (vs inline bash in skill files) means one place to fix bugs, one place to enforce invariants, and easy testing.

**Subcommands (Phase 1 scope):**

```
node fixme-tools.cjs ticket create <session> --slug <slug>
  Creates ticket from template, assigns next sequential number

node fixme-tools.cjs ticket transition <ticket-path> <new-state> [--reason "..."]
  Validates transition, updates frontmatter, logs transition, computes durations

node fixme-tools.cjs ticket list <session> [--state <state>]
  Lists tickets in session, optionally filtered by state

node fixme-tools.cjs ticket next <session>
  Returns path to next queued ticket (FIFO by number)

node fixme-tools.cjs session create [--name <name>]
  Creates session directory with manifest

node fixme-tools.cjs session summary <session>
  Generates completion stats for session.md

node fixme-tools.cjs context detect
  Auto-detects project context from CLAUDE.md, package.json, etc.
  Outputs YAML for user confirmation

node fixme-tools.cjs context load
  Reads existing .fixme/project-context.yaml
  Returns JSON for agent consumption

node fixme-tools.cjs context save <yaml-content>
  Writes confirmed project context to .fixme/project-context.yaml
```

### Pattern 4: Project Context Auto-Detection

**What:** On first session in a project, scan multiple sources to detect operational context. Present to user for confirmation. Save as YAML. Reuse silently on subsequent sessions.

**Detection sources (in order of priority):**

| Source | What to Extract |
|--------|----------------|
| CLAUDE.md (project + user) | Dev server URL, build commands, test commands, lint commands |
| package.json | `scripts.dev`, `scripts.build`, `scripts.test`, `scripts.lint`, framework from dependencies |
| vite.config.* / next.config.* / webpack.config.* | HMR availability, dev server port |
| .env / .env.local | Dev server port (PORT=), base URL |
| tsconfig.json / jsconfig.json | Framework hints (jsx settings) |

**Output format (`.fixme/project-context.yaml`):**

```yaml
dev_server:
  command: "yarn dev"
  url: "http://localhost:3000"
  hmr: true
build:
  command: "yarn build"
test:
  runner: "vitest"
  command: "yarn test"
  filter_by_file: "yarn test -- {file}"
  filter_by_name: "yarn test -- -t '{name}'"
  init_command: null
lint:
  command: "yarn lint"
framework: "next.js"
detected_from:
  - CLAUDE.md
  - package.json
  - next.config.js
detected_at: "2026-02-18T14:30:00Z"
```

### Anti-Patterns to Avoid

- **Fat orchestrator:** Orchestrator reading ticket bodies, investigating bugs, or making Grep/Bash calls. It should ONLY: read ticket dir listing, read frontmatter status, dispatch subagents, update status. Tool restriction: Read, Write, Bash (only for fixme-tools.cjs calls), Task, Glob.

- **Shared mutable index file:** No `queue.md` or `queue.json` tracking ticket order. Queue order is derived from ticket filenames (0001 < 0002 < 0003). Eliminates concurrent write corruption.

- **State in orchestrator memory:** Never cache ticket state in conversation memory. Always read from disk. Auto-compaction will destroy in-memory state. This is the #1 pitfall identified in project research.

- **Direct frontmatter writes by agents:** Agents should call `fixme-tools.cjs transition` instead of editing YAML directly. The tool validates transitions and computes durations atomically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex parser per agent | `fixme-tools.cjs` with centralized parser | GSD proves this pattern: one parser, many consumers. Frontmatter edge cases (multiline, special chars, nested arrays) are deceptively complex. |
| Sequential ticket numbering | Each agent reads dir and picks next number | `fixme-tools.cjs ticket create` | Race condition if two agents create tickets simultaneously (intake + orchestrator). Centralize in the tool. |
| State transition validation | Each agent checks `if state === 'investigating' then ...` | `fixme-tools.cjs ticket transition` with transition matrix | Scatter validation across agents = guaranteed inconsistency. One matrix, one validator. |
| Duration calculation | Each agent computes `Date.now() - entered` | `fixme-tools.cjs` computes on transition | Timezone bugs, format inconsistencies. Centralize timestamp math. |
| Project context detection | Agent reads CLAUDE.md and package.json inline | `fixme-tools.cjs context detect` | Multi-source detection with fallbacks is complex. Do it once, cache the result. |
| Session directory scaffolding | Agent creates dirs with mkdir | `fixme-tools.cjs session create` | Consistent structure (tickets/, assets/, session.md) guaranteed. |

**Key insight:** Every state mutation goes through `fixme-tools.cjs`. Agents are consumers of state, not producers. This is the same pattern GSD uses — `gsd-tools.cjs` is the state gatekeeper, agents call it.

## Common Pitfalls

### Pitfall 1: YAML Frontmatter Corruption on Concurrent Writes

**What goes wrong:** Intake agent creates a new ticket (writes frontmatter) while orchestrator updates an existing ticket's state (writes frontmatter). If they collide on directory scanning or temporary files, state gets garbled.

**Why it happens:** File-based state has no locking. Phase 1 is sequential, but the architecture must support Phase 2's background intake agent.

**How to avoid:**
1. Ticket creation and ticket state updates operate on different files — no collision possible.
2. The intake agent ONLY creates new files. It never modifies existing tickets.
3. The orchestrator ONLY modifies the currently-dispatched ticket. It never touches other tickets.
4. Queue order derives from filenames, not a shared index.

**Warning signs:** Truncated frontmatter, duplicate ticket numbers, tickets with garbled YAML.

### Pitfall 2: Transition Log Array Growing Unbounded

**What goes wrong:** A ticket with many retry attempts accumulates a large `transitions` array in frontmatter. When agents read the ticket, the frontmatter consumes significant context tokens. After 10+ retries, the frontmatter is larger than the ticket body.

**How to avoid:**
1. Max attempts config (default 3) caps retry count.
2. Transition log is append-only but bounded by max_attempts * transitions_per_attempt.
3. Worst case: 3 attempts * 6 transitions/attempt = 18 entries. Manageable.

### Pitfall 3: Project Context YAML Parsing Without a Proper Parser

**What goes wrong:** The CJS tool uses regex or line-by-line parsing for YAML (like GSD does for frontmatter). Works for simple key-value pairs but breaks on multiline strings, special characters in commands (e.g., `yarn test -- --grep "foo bar"`), or nested structures.

**How to avoid:**
1. For YAML frontmatter in tickets: use the simple line-by-line parser (frontmatter is controlled, predictable format).
2. For project-context.yaml: the structure is known and shallow (max 2 levels deep). A purpose-built parser for this specific schema is sufficient. No need for a full YAML library.
3. Quote all string values that might contain special characters.
4. Test with real-world CLAUDE.md files that have complex build commands.

**Warning signs:** Commands with quotes or pipes don't round-trip correctly through parse/write.

### Pitfall 4: Session Name Collisions

**What goes wrong:** Auto-generated session names collide if two sessions start in the same second, or if the naming scheme produces duplicates.

**How to avoid:**
1. Include timestamp with second precision: `fix-20260218-143052`
2. On collision (directory exists): append a counter: `fix-20260218-143052-2`
3. Custom names: validate uniqueness before creating.

### Pitfall 5: Ticket Template Sections Drift from Agent Expectations

**What goes wrong:** The ticket template defines section headers (## Original Report, ## Investigation, etc.) but agents write slightly different headers (## Bug Report, ## Investigation Notes). Downstream agents can't find the sections they expect.

**How to avoid:**
1. Template defines canonical section names. These are documented in `references/state-machine.md`.
2. Agent system prompts reference the exact section names.
3. `fixme-tools.cjs` validates section presence when reading tickets (warning, not error, for missing sections).
4. Use HTML comments in the template as machine-readable markers: `<!-- section: investigation -->`

## Code Examples

### Skill Entry Point (SKILL.md)

```yaml
---
name: fixme
description: Bug fix session orchestrator. Start a bug-fixing session to report, track, and fix bugs in your web application.
disable-model-invocation: true
allowed-tools: Read, Write, Bash, Task, Glob, Grep
argument-hint: "[start|resume|status|stop] [session-name]"
---

# Fixme — Bug Fix Session Orchestrator

You are the Fixme orchestrator. You manage bug-fixing sessions.

## Session Lifecycle

When invoked with `/fixme` or `/fixme start`:

1. **Initialize session**
   - Check for existing sessions: `node .claude/skills/fixme/scripts/fixme-tools.cjs session list`
   - If resuming: load session, scan for queued tickets
   - If new: create session, detect project context

2. **Project context** (first time only)
   - Run: `node .claude/skills/fixme/scripts/fixme-tools.cjs context detect`
   - Present detected config to user for confirmation
   - Save confirmed config: `node .claude/skills/fixme/scripts/fixme-tools.cjs context save`

3. **Dispatch loop**
   - Find next ticket: `node .claude/skills/fixme/scripts/fixme-tools.cjs ticket next <session>`
   - If ticket found: dispatch appropriate subagent via Task tool
   - If no tickets: prompt user "Describe a bug to fix, or say 'stop' to end the session"
   - Report results between dispatches

4. **Session control**
   - "stop" / "end session" → graceful stop (finish current, summarize)
   - "stop now" → immediate stop (fail current ticket, summarize)

## CRITICAL RULES

- **NEVER investigate bugs yourself.** Dispatch to subagents.
- **NEVER read ticket bodies.** Only read frontmatter (status) via fixme-tools.cjs.
- **ALWAYS read state from disk.** Never trust memory after subagent returns.
- **Pass ticket FILE PATHS to subagents.** They read the file with their fresh context.
```

### Ticket Template

```markdown
---
number: {NUMBER}
slug: "{SLUG}"
session: "{SESSION}"
state: queued
created: "{TIMESTAMP}"
updated: "{TIMESTAMP}"
url:
reporter_context:
commit_hash:
failure_reason:
related: []
max_attempts: 3
current_attempt: 0
transitions: []
durations: {}
---

# {NUMBER}: {TITLE}

<!-- section: original-report -->
## Original Report

{VERBATIM_USER_REPORT}

**Screenshots:** {SCREENSHOT_REFERENCES}

<!-- section: structured-fields -->
## Structured Fields

- **Affected URL:**
- **Component:**
- **Expected Behavior:**
- **Actual Behavior:**
- **Error Messages:**
- **Reproduction Steps:**

<!-- section: clarifications -->
## Clarifications

<!-- section: investigation -->
## Investigation

<!-- section: fix -->
## Fix

<!-- section: verification -->
## Verification
```

### State Transition (fixme-tools.cjs)

```javascript
// Transition matrix: state -> [valid next states]
const TRANSITIONS = {
  'queued':        ['investigating', 'skipped'],
  'investigating': ['fixing', 'skipped', 'failed'],
  'fixing':        ['verifying', 'failed'],
  'verifying':     ['done', 'investigating', 'failed'],
  'done':          [],  // terminal
  'failed':        [],  // terminal
  'skipped':       [],  // terminal
};

// States that require a reason for transition
const REASON_REQUIRED = {
  'skipped': true,
  'failed': true,
  'investigating': (from) => from === 'verifying',  // retry needs reason
};

function transition(ticketPath, newState, reason) {
  const content = fs.readFileSync(ticketPath, 'utf8');
  const fm = extractFrontmatter(content);
  const currentState = fm.state;

  // Validate transition
  const validNext = TRANSITIONS[currentState];
  if (!validNext || !validNext.includes(newState)) {
    throw new Error(
      `Invalid transition: ${currentState} -> ${newState}. ` +
      `Valid: ${validNext ? validNext.join(', ') : 'none (terminal state)'}`
    );
  }

  // Check reason requirement
  const needsReason = REASON_REQUIRED[newState];
  const reasonRequired = typeof needsReason === 'function'
    ? needsReason(currentState) : needsReason;
  if (reasonRequired && !reason) {
    throw new Error(`Transition to '${newState}' requires a reason`);
  }

  // Record transition
  const now = new Date().toISOString();
  const transitions = fm.transitions || [];
  transitions.push({
    from: currentState,
    to: newState,
    timestamp: now,
    reason: reason || null,
  });

  // Update durations
  const durations = fm.durations || {};
  if (durations[currentState] && durations[currentState].entered) {
    durations[currentState].exited = now;
    const entered = new Date(durations[currentState].entered);
    durations[currentState].seconds = Math.round((new Date(now) - entered) / 1000);
  }
  durations[newState] = { entered: now };

  // Update frontmatter
  fm.state = newState;
  fm.updated = now;
  fm.transitions = transitions;
  fm.durations = durations;
  if (reason && (newState === 'failed' || newState === 'skipped')) {
    fm.failure_reason = reason;
  }

  // Write back
  const updated = replaceFrontmatter(content, fm);
  fs.writeFileSync(ticketPath, updated);

  return { from: currentState, to: newState, timestamp: now };
}
```

### Project Context Detection (fixme-tools.cjs)

```javascript
function detectProjectContext() {
  const context = {
    dev_server: { command: null, url: null, hmr: false },
    build: { command: null },
    test: { runner: null, command: null, filter_by_file: null, filter_by_name: null, init_command: null },
    lint: { command: null },
    framework: null,
    detected_from: [],
    detected_at: new Date().toISOString(),
  };

  // 1. package.json
  if (fs.existsSync('package.json')) {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const scripts = pkg.scripts || {};
    context.detected_from.push('package.json');

    if (scripts.dev) context.dev_server.command = `yarn dev`;
    if (scripts.build) context.build.command = `yarn build`;
    if (scripts.test) context.test.command = `yarn test`;
    if (scripts.lint) context.lint.command = `yarn lint`;

    // Framework detection from dependencies
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps['next']) context.framework = 'next.js';
    else if (allDeps['nuxt']) context.framework = 'nuxt';
    else if (allDeps['@angular/core']) context.framework = 'angular';
    else if (allDeps['svelte'] || allDeps['@sveltejs/kit']) context.framework = 'svelte';
    else if (allDeps['vue']) context.framework = 'vue';
    else if (allDeps['react']) context.framework = 'react';

    // Test runner detection
    if (allDeps['vitest']) context.test.runner = 'vitest';
    else if (allDeps['jest']) context.test.runner = 'jest';
    else if (allDeps['mocha']) context.test.runner = 'mocha';
  }

  // 2. Config files for HMR and port
  const hmrConfigs = ['vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.mjs'];
  for (const cfg of hmrConfigs) {
    if (fs.existsSync(cfg)) {
      context.dev_server.hmr = true; // Vite and Next.js have HMR by default
      context.detected_from.push(cfg);
      break;
    }
  }

  // 3. Default URL if not set
  if (context.dev_server.command && !context.dev_server.url) {
    context.dev_server.url = 'http://localhost:3000';
  }

  return context;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.claude/commands/` for slash commands | `.claude/skills/` with SKILL.md | Claude Code v2.1.3 (2025) | Skills are recommended. Commands still work but are legacy. Skills add: supporting files, invocation control, context forking. |
| Hardcoded agent model names | Model aliases (`sonnet`, `opus`, `haiku`, `inherit`) | Claude Code 2025 | Use aliases, not full model IDs. `inherit` uses parent model. |
| All tools available to subagents | `tools` and `disallowedTools` frontmatter fields | Claude Code 2025 | Subagents should have minimal tool access for their role. |
| Manual subagent context management | `memory` frontmatter field with persistent storage | Claude Code 2025-2026 | Subagents can maintain persistent memory across sessions. Useful for Fixme agents learning project patterns. |

**Deprecated/outdated:**
- `.claude/commands/` directory: Still works but skills are preferred. Both create slash commands.
- `--system-prompt` override in subagents: Replaces Claude Code's default system prompt. Use agent MD files instead (additive).
- Agent Teams: Experimental (research preview). Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag. Overkill for Fixme's sequential model.

## Open Questions

1. **YAML Parsing for project-context.yaml**
   - What we know: GSD's frontmatter parser is regex-based and handles simple structures. Project context YAML is shallow (2 levels max).
   - What's unclear: Whether commands with special characters (pipes, quotes, semicolons) survive round-trip through a simple parser.
   - Recommendation: Build a purpose-specific parser for the known schema. Test with real-world CLAUDE.md examples containing complex commands. If parsing breaks, fall back to storing commands as JSON strings.

2. **Skill vs Command for /fixme Entry Point**
   - What we know: Skills (`.claude/skills/fixme/SKILL.md`) are the modern approach. Commands (`~/.claude/commands/fixme/start.md`) are legacy but work.
   - What's unclear: Whether a single SKILL.md can handle multiple sub-commands (`/fixme start`, `/fixme status`, `/fixme stop`).
   - Recommendation: Use a single `/fixme` skill with `$ARGUMENTS` parsing for sub-commands. The SKILL.md parses `$ARGUMENTS[0]` to route: `start` (default), `status`, `stop`, `resume`. This matches the `argument-hint: "[start|resume|status|stop]"` pattern.

3. **Subagent Type for Task Dispatch**
   - What we know: Task tool supports `subagent_type` field. Built-in types: `Explore`, `Plan`, `general-purpose`. Custom agents in `.claude/agents/` or `.claude/skills/fixme/agents/`.
   - What's unclear: Whether agents in `.claude/skills/fixme/agents/` are auto-discovered as subagent types, or if they need to be in `~/.claude/agents/`.
   - Recommendation: During Phase 1, use `subagent_type="general-purpose"` and pass the agent role file path in the prompt: `"First, read .claude/skills/fixme/agents/fixer-agent.md for your role."` This is the GSD pattern and works regardless of auto-discovery. If custom subagent types work from skill directories, optimize later.

## Sources

### Primary (HIGH confidence)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) — Verified SKILL.md format, frontmatter fields, directory layout, invocation control, `$ARGUMENTS` substitution, `context: fork`, supporting files, `disable-model-invocation`.
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — Verified agent MD format, frontmatter fields (`tools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`), foreground/background execution, resume, auto-compaction.
- GSD reference architecture (`~/.claude/get-shit-done/`) — Direct code inspection of `gsd-tools.cjs` (2400+ lines), workflows, agents, commands, templates. Verified CJS tooling pattern, frontmatter parser, subagent spawning, state management. v1.20.4.
- Existing skills (`~/.claude/skills/create-pr/`, `push-to-develop/`, `address-pr-comments/`) — Direct inspection of working skill files. Verified SKILL.md format, supporting files pattern, script bundling.

### Secondary (MEDIUM confidence)
- Project-level research files (`.planning/research/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`, `FEATURES.md`) — Prior research conducted at project level. HIGH quality but not independently re-verified during this phase research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All based on official docs and locally inspectable working code
- Architecture (standalone vs GSD): HIGH — Deep analysis of GSD source code confirms incompatibility
- State machine design: HIGH — Simple, well-understood pattern with clear constraints from CONTEXT.md
- Project context detection: MEDIUM — Detection heuristics need real-world validation. Schema is clear but parser robustness is uncertain.
- Skill entry point format: HIGH — Verified against official Claude Code docs and working examples

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days — stable domain, no fast-moving dependencies)
