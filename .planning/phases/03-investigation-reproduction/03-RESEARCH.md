# Phase 3: Investigation & Reproduction - Research

**Researched:** 2026-02-21
**Domain:** Browser-based bug reproduction via playwright-cli, multi-agent investigation architecture, codebase root cause analysis
**Confidence:** HIGH

## Summary

Phase 3 transforms the fixme system from a ticket-creating pipeline into one that can actually reproduce bugs and investigate root causes. The core deliverable is an **investigation agent** that: (1) opens a real browser with `playwright-cli`, (2) navigates to the app and reproduces the reported bug, (3) reads source files to understand the root cause, and (4) records self-contained findings in the ticket's Investigation section. This agent is dispatched by the orchestrator after a ticket transitions to `investigating`.

The architecture uses a **reproducer/verifier sub-loop** within the investigation agent: a reproducer sub-agent navigates and captures evidence, then a verifier sub-agent critically compares that evidence against the original report. This loop repeats up to a configurable number of attempts (default 3). The investigation agent also handles environment setup (starting the dev server, opening the browser) and failure recovery (browser crash, unreachable server).

The `playwright-cli` CLI tool (installed globally, invoked via `Bash(playwright-cli:*)`) is the ONLY approved browser automation method. The Playwright MCP tools (`mcp__plugin_playwright_playwright__*`) must NOT be used. The `playwright-cli` skill provides the command reference -- preloaded into the agent via the `skills` frontmatter field, with `Bash(playwright-cli:*)` in the `tools` list for execution permission.

**Primary recommendation:** Structure implementation as 3 plans: (1) investigation-agent.md with reproducer/verifier sub-loop and codebase analysis logic, (2) SKILL.md updates for investigation dispatch + session initialization (dev server, browser, login), (3) screenshot asset management and ticket Investigation section format. Plans 1 and 2 have a dependency (SKILL.md dispatches the agent), so plan 1 first.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Multi-Agent Architecture

- Three specialist agents, each with distinct personality, instructions, and tools:
  - **Investigation agent** -- exploratory/curious, reproduces bug + analyzes root cause (Phase 3)
  - **Fixer agent** -- precise/methodical, plans fix then implements (Phase 4)
  - **Verification agent** -- skeptical, browser-verifies the fix (Phase 5)
- An **implementation agent** orchestrates these three sequentially per ticket, dispatching each as a Task sub-agent (Phase 4, when there are 2+ steps to chain)
- For Phase 3: the orchestrator dispatches the investigation agent directly (no implementation agent wrapper yet)
- Sub-agents within investigation: **reproducer** (navigates, takes screenshots, writes evidence) and **verifier** (critically compares evidence vs original report). They loop until verifier is satisfied or max attempts reached
- Ticket file is the shared state between all agents -- each agent reads and writes to its own section
- Token-efficient: each agent gets a fresh context window, only essential output crosses boundaries

#### Browser & Environment

- **Playwright-cli skill** is the ONLY browser automation method -- NOT Playwright MCP. This must be specified in the agent instructions file
- **Browser runs headed** -- user can watch the agent work in real time
- **Session initialization** includes starting the dev server AND logging in (once, at session start). Orchestrator handles this
- Agents **assume environment is ready** (server running, logged in). If they hit a blocker they can't resolve, they report back to the orchestrator with a clear description + evidence. Orchestrator tells the user, who resolves it, then orchestrator restarts the agent
- Agent starts dev server itself if it's not running (project context has dev_server.command)
- Assume clean environment -- no need to check for build issues, missing deps, or stale cache
- On browser crash: agent tries to fix the issue (relaunch browser). If it can't, reports back to orchestrator

#### Investigation Output (Ticket Format)

- **Ticket is append-only history** -- each agent writes to its own section, never overwrites other agents' sections
- Investigation section uses structured subsections per attempt:
  - **Reproduction Steps** -- exact browser commands/actions the agent performed
  - **Reproduction Evidence** -- screenshot + description of what confirms the bug
  - **Affected Files** -- specific file paths with line references and relevant code snippets
  - **Root Cause Hypothesis** -- what's causing the bug and why
- The investigation agent's output must be self-contained -- the fixer agent should understand the bug without re-reading source files
- **Root cause only** -- investigation does not propose a fix approach. The fixer agent decides how to fix
- No limit on files read -- agent uses its own judgment and context window is the natural limit

#### Screenshot Naming Schema

- Screenshots stored in ticket-specific directory: `.fixme/sessions/<session>/assets/<ticket-number>/`
- Prefix-based naming convention:
  - `intake-<description>.png` -- user-submitted screenshots (from intake)
  - `repro-<description>.png` -- reproduction evidence (from investigation)
  - `verify-<description>.png` -- verification evidence (from Phase 5)
  - `fix-<description>.png` -- fixer captures (if needed)
- Descriptions are freeform but descriptive. Prefix tells you which agent produced it and why

#### Reproduction Strategy

- Agent is the intelligence -- it handles vague or detailed tickets without relying on perfect input
- Agent deduces reproduction steps from the user's freeform report (users click around, they don't report precise steps)
- Produces exact reproduction steps (browser commands, navigation actions) as output
- Internal verifier sub-agent compares reproduction evidence against original report:
  - **Best:** Screenshot-to-screenshot comparison (if user submitted one)
  - **Good:** Screenshot compared against user's text description
  - **Fallback:** Text explanation with justification for why screenshot wasn't possible
- Reproduction attempts: configurable, defaulting to 3
- If reproduction fails after all attempts: agent still writes up everything it tried, makes best-effort root cause guess, marks findings clearly as **unverified/assumption** with a warning. Pipeline continues (doesn't block)

#### Failure & Recovery

- On blocker: agent writes partial findings to ticket, reports to orchestrator with clear description + evidence
- On user intervention + restart: new agent reads ticket (which has partial progress) and resumes from there
- No automatic ticket failure from investigation -- agent always moves forward with best-effort findings
- Agent does not prescribe investigation strategy -- framework provides base instructions, agent uses judgment

### Claude's Discretion

- Exact investigation strategy (how the agent navigates, reads code, traces paths)
- How the reproducer and verifier sub-agents communicate within the investigation task (direct sub-agent dispatch or structured prompting)
- Console/network error checking as part of investigation
- Model selection for each agent (research during planning)

### Deferred Ideas (OUT OF SCOPE)

- User can pass steering commands to the currently working agent (v2)
- Detailed investigation behavior tuning and constraints (v2)
- Multi-bug splitting from single message (v2, from Phase 2)
- Individual ticket skip/cancel (v2, from Phase 2)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BROW-02 | Implementation agent uses Playwright (MCP or CLI) to navigate to the app and reproduce the reported bug | Investigation agent uses `playwright-cli` (CLI, not MCP per user constraint) to open browser, navigate to affected URL, perform reproduction steps, and capture evidence via `playwright-cli snapshot` and `playwright-cli screenshot`. The agent receives `Bash(playwright-cli:*)` tool access and the `playwright-cli` skill preloaded for command reference. |
| BROW-04 | Implementation agent investigates the codebase (reads files, traces code paths) to understand root cause before attempting a fix | Investigation agent uses `Read`, `Grep`, `Glob` tools to trace code paths from the reproduction evidence (component names, URLs, error messages) to source files. Records affected files with line references, relevant code snippets, and a root cause hypothesis in the ticket's Investigation section. |
</phase_requirements>

## Standard Stack

### Core

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| `playwright-cli` | Global install (current) | Browser automation via CLI commands | Mandated by user CLAUDE.md. Installed at `/Users/denis/.nvm/versions/node/v22.21.1/bin/playwright-cli`. Provides `open`, `goto`, `click`, `fill`, `snapshot`, `screenshot`, `console`, `network` commands. Returns accessibility tree snapshots (text-based, LLM-native). |
| Claude Code Skills (`skills:` frontmatter) | Current | Preload `playwright-cli` skill content into agent context | Official mechanism for injecting skill content (command reference) into subagent. Agent gets the full command reference without reading files manually. |
| `Bash(playwright-cli:*)` tool filter | Current | Execute browser commands from subagent | Bash permission filter pattern. Agent can run `playwright-cli open`, `playwright-cli snapshot`, etc. Must be in agent's `tools` list. |
| Agent MD files | Claude Code format | `investigation-agent.md` at `.claude/skills/fixme/agents/` | Same pattern as `intake-agent.md`. Loaded by subagent via `Read` tool in first turn. |
| Claude Code Task tool | Current | Orchestrator dispatches investigation agent | Same dispatch pattern as intake. Orchestrator passes ticket path, project context path, agent reads them with fresh context. |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `playwright-cli snapshot` | Capture accessibility tree (text snapshot of page state) | After every navigation/interaction to understand page state. Primary verification method. |
| `playwright-cli screenshot` | Capture visual screenshot (.png) | For evidence storage in ticket assets. Used for before/after comparison. |
| `playwright-cli console` | Read browser console messages | Check for JavaScript errors during reproduction. Part of investigation evidence. |
| `playwright-cli network` | View network requests | Check for failed API calls, 4xx/5xx responses during reproduction. |
| `Read`, `Grep`, `Glob` | Codebase investigation | Trace from UI components to source code. Find affected files, relevant code paths. |

### Not Needed (Phase 3)

| Technology | Why Not Yet |
|------------|------------|
| Playwright MCP (`mcp__plugin_playwright_playwright__*`) | Explicitly forbidden by user CLAUDE.md. `playwright-cli` is the only approved method. |
| `Skill` tool for browser | Subagents don't use the Skill tool. They use `Bash(playwright-cli:*)` directly + `skills:` preload for reference. |
| Git operations | Investigation doesn't modify code. Fix/commit is Phase 4. |
| Test runner | Investigation doesn't run tests. That's Phase 4 (fixer) and Phase 5 (verification). |

## Architecture Patterns

### Recommended File Structure Changes

```
.claude/skills/fixme/
  SKILL.md                          # MODIFIED: investigation dispatch, session env setup
  agents/
    intake-agent.md                 # UNCHANGED
    investigation-agent.md          # NEW: investigation agent instructions
  templates/
    ticket.md                       # UNCHANGED (Investigation section already exists)
  scripts/
    fixme-tools.cjs                 # POTENTIALLY MODIFIED: asset directory creation
  references/
    state-machine.md                # UNCHANGED
    project-context-schema.md       # UNCHANGED

<project-root>/.fixme/
  project-context.yaml              # UNCHANGED
  sessions/
    <session-name>/
      tickets/                      # UNCHANGED
      assets/
        <ticket-number>/            # NEW: per-ticket asset directories
          repro-<description>.png   # NEW: reproduction screenshots
```

### Pattern 1: Reproducer/Verifier Sub-Loop (Internal to Investigation Agent)

**What:** The investigation agent runs an internal loop with two roles: a reproducer that navigates and captures evidence, and a verifier that critically evaluates whether the evidence matches the original report.

**When to use:** For every investigation attempt. The loop ensures reproduction evidence is credible before proceeding to codebase analysis.

**How it works (within the investigation agent's single Task execution):**

```
Investigation Agent (single Task, fresh context)
  |
  |-- Read ticket file (original report, structured fields)
  |-- Read project context (dev server URL, framework)
  |
  |-- REPRODUCER PHASE:
  |   |-- Navigate to affected URL
  |   |-- Deduce reproduction steps from report
  |   |-- Execute steps via playwright-cli commands
  |   |-- Capture snapshot + screenshot as evidence
  |   |-- Check console/network for errors
  |   |-- Write exact reproduction steps
  |
  |-- VERIFIER PHASE:
  |   |-- Compare captured evidence against original report
  |   |-- If user submitted screenshot: compare visually
  |   |-- If text description only: compare against snapshot text
  |   |-- Verdict: CONFIRMED / NOT_CONFIRMED / PARTIAL
  |
  |-- If NOT_CONFIRMED and attempts remaining: retry REPRODUCER
  |-- If CONFIRMED or max attempts: proceed to CODEBASE ANALYSIS
  |
  |-- CODEBASE ANALYSIS PHASE:
  |   |-- Use error messages, component names from reproduction
  |   |-- Grep/Glob to find affected source files
  |   |-- Read files, trace code paths
  |   |-- Form root cause hypothesis
  |
  |-- Write investigation findings to ticket
  |-- Return summary to orchestrator
```

**Discretion area -- sub-agent communication:** Two approaches were considered:

1. **Structured prompting (RECOMMENDED):** The investigation agent has explicit sections in its instructions for reproducer and verifier roles. It performs both roles sequentially within its single context. No sub-sub-agents. Simpler, fewer context switches, all evidence stays in one context window.

2. **Direct sub-agent dispatch:** Investigation agent spawns reproducer and verifier as separate Task sub-agents. More isolated but burns 2 extra context windows per attempt, and evidence must cross boundaries. The Task tool does support sub-sub-agents only from the main thread, so investigation agent (itself a Task sub-agent) would need to be dispatched from the main thread, not as a nested Task.

**Recommendation: Structured prompting.** The investigation agent is already a sub-agent. Claude Code does not support sub-sub-agents (a Task sub-agent cannot spawn another Task). The reproducer/verifier roles are sequential steps within one context, not parallel work. The agent instructions define the loop explicitly.

### Pattern 2: Environment Initialization (Orchestrator Responsibility)

**What:** Before dispatching the first investigation agent, the orchestrator ensures the dev server is running and the browser is open with authenticated state.

**When to use:** At session start (before first investigation dispatch) and on resume.

**How it works in SKILL.md:**

```
Session Start / Resume:
  1. Load project context (existing flow)
  2. Start dev server if not running:
     - Run: node .claude/skills/fixme/scripts/fixme-tools.cjs context load
     - Extract dev_server.command (e.g., "yarn dev")
     - Start dev server in background: Bash("yarn dev &")
     - Wait for server to be ready (curl/wget the URL)
  3. Open browser:
     - playwright-cli open <dev_server.url>
  4. Login if needed:
     - User provides login steps or auth state file
     - Save auth state: playwright-cli state-save .fixme/auth.json
  5. Dispatch investigation agent
     - Agent ASSUMES browser is open and logged in
```

**Critical:** The orchestrator handles environment setup, NOT the investigation agent. If the agent hits a blocker (server down, browser crashed), it reports back to the orchestrator rather than trying to fix environment issues itself.

**Exception:** If the browser crashes mid-investigation, the agent should attempt one relaunch (`playwright-cli open <url>` + `playwright-cli state-load .fixme/auth.json`). If that fails, report back.

### Pattern 3: Ticket Investigation Section Format

**What:** The investigation agent writes findings to the `<!-- section: investigation -->` section of the ticket using structured subsections per attempt.

**When to use:** Every investigation writes to this section. The format is append-only -- if investigation retries (from Phase 5's `verifying -> investigating` transition), new attempts are appended, not overwritten.

**Investigation section format:**

```markdown
## Investigation

### Attempt 1

#### Reproduction Steps
1. Navigated to `http://localhost:3000/login`
2. Clicked email input field (ref: e3)
3. Typed "test@example.com"
4. Clicked "Login" button (ref: e7)
5. Observed: button click handler not firing

#### Reproduction Evidence
- Screenshot: `assets/0001/repro-login-button-no-response.png`
- Console errors: `TypeError: Cannot read property 'submit' of null` at login.tsx:42
- Network: No POST request to /api/auth/login observed

**Reproduction status:** CONFIRMED -- bug reproduced on first attempt

#### Affected Files
- `src/components/LoginButton.tsx` (lines 38-52) -- click handler references `formRef.current` which is null when rendered outside `<LoginForm>`
- `src/pages/login.tsx` (lines 15-20) -- `LoginButton` rendered without wrapping `LoginForm` provider
- `src/hooks/useAuth.ts` (lines 8-12) -- `submit` function expects form context

```typescript
// src/components/LoginButton.tsx:38-52
const handleClick = () => {
  const form = formRef.current; // null when no LoginForm parent
  form.submit(); // TypeError here
};
```

#### Root Cause Hypothesis
The `LoginButton` component assumes it's always rendered inside a `LoginForm` context provider. On the login page, the button is rendered standalone without the form wrapper, causing `formRef.current` to be `null`. When clicked, `form.submit()` throws a TypeError. The button's click handler has no null check.

**Confidence:** HIGH -- error message matches, code path confirmed
```

### Pattern 4: Screenshot Asset Management

**What:** Screenshots are stored in per-ticket directories under the session assets folder with prefix-based naming.

**When to use:** Every screenshot captured during investigation.

**Directory structure:**

```
.fixme/sessions/<session>/assets/<ticket-number>/
  repro-login-button-no-response.png
  repro-console-errors.png
```

**How to create assets directory and save screenshot:**

```bash
# Create ticket asset directory (agent does this)
mkdir -p .fixme/sessions/<session>/assets/<ticket-number>/

# Save screenshot with descriptive name
playwright-cli screenshot --filename=.fixme/sessions/<session>/assets/<ticket-number>/repro-login-button-no-response.png
```

**Note:** The `playwright-cli screenshot` command supports `--filename=<path>` for specifying the output path. If the agent uses `playwright-cli screenshot` without a filename, it saves to an auto-generated path. The agent must use `--filename=` to control the output location.

### Pattern 5: Investigation Agent Tool Access

**What:** The investigation agent needs both codebase tools (Read, Grep, Glob) and browser tools (playwright-cli via Bash).

**Agent frontmatter:**

```yaml
---
name: investigation-agent
description: Reproduces bugs in a real browser and investigates codebase to find root cause
tools: Read, Write, Edit, Bash(playwright-cli:*), Bash(mkdir *), Bash(node .claude/skills/fixme/scripts/fixme-tools.cjs *), Glob, Grep
model: opus
skills:
  - playwright-cli
---
```

**Tool breakdown:**
- `Read` -- read ticket file, source code files, project context
- `Write` / `Edit` -- write investigation findings to ticket's Investigation section
- `Bash(playwright-cli:*)` -- all browser automation commands
- `Bash(mkdir *)` -- create asset directories
- `Bash(node .claude/skills/fixme/scripts/fixme-tools.cjs *)` -- fixme-tools commands (if needed)
- `Glob` / `Grep` -- codebase exploration (find files, search for patterns)
- `skills: [playwright-cli]` -- preload playwright-cli command reference into context

### Anti-Patterns to Avoid

- **Investigation agent modifying source code.** The investigation agent finds the root cause but does NOT propose or implement fixes. That's the fixer agent's job (Phase 4). The agent must resist "I see the fix, let me just..." temptation.

- **Using Playwright MCP tools.** `mcp__plugin_playwright_playwright__*` tools exist in the environment but are FORBIDDEN by user CLAUDE.md. The agent instructions must explicitly state to use `playwright-cli` commands only.

- **Overwriting previous investigation attempts.** Investigation section is append-only. If the agent retries (from `verifying -> investigating`), it creates `### Attempt 2`, not overwrites `### Attempt 1`. Prior attempts provide context for future attempts.

- **Investigation agent managing environment.** The agent does not start the dev server or handle login. It assumes the environment is ready. On failure, it reports back rather than trying to fix environment issues.

- **Sub-sub-agent dispatch.** The investigation agent is already a Task sub-agent. It cannot spawn further Task sub-agents (Claude Code limitation). The reproducer/verifier loop must be implemented as structured prompting within the single agent context.

- **Screenshots without descriptive names.** Using auto-generated names (`page-timestamp.png`) makes evidence hard to trace in the ticket. Always use `--filename=` with the `repro-<description>.png` convention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser automation | Custom Puppeteer/Selenium wrapper | `playwright-cli` commands via `Bash(playwright-cli:*)` | Mandated by user CLAUDE.md. playwright-cli returns accessibility snapshots (text-based, LLM-native). No vision model needed for page understanding. |
| Page state understanding | Screenshot + vision model analysis | `playwright-cli snapshot` (accessibility tree text) | Snapshots are text, directly parseable by the LLM. Cheaper, faster, more deterministic than vision. Use `screenshot` only for evidence storage. |
| Console/network error capture | `run-code` with custom JS | `playwright-cli console` and `playwright-cli network` | Built-in commands that return structured console and network data. No custom JS needed. |
| Dev server health check | Custom HTTP client / curl wrapper | `playwright-cli goto <url>` and check for error | If navigation succeeds, server is up. If it fails, agent reports the error. Simple and sufficient. |
| Auth state persistence | Custom cookie/token management | `playwright-cli state-save` / `state-load` | Built-in storage state management handles cookies + localStorage + sessionStorage. Save once at session start, reload on browser crash. |
| Asset directory creation | Complex tooling script | `mkdir -p` via Bash | Simple directory creation. No need for fixme-tools.cjs involvement. |

**Key insight:** `playwright-cli` provides everything needed for browser interaction. The investigation agent's complexity is in its intelligence (deducing reproduction steps, analyzing code), not in its tooling.

## Common Pitfalls

### Pitfall 1: Browser Not Open When Agent Starts

**What goes wrong:** The investigation agent tries to run `playwright-cli goto <url>` but no browser session exists. Command fails with an error about no active browser.

**Why it happens:** The orchestrator was supposed to open the browser during session initialization but forgot or the browser crashed between agents.

**How to avoid:**
1. Orchestrator explicitly runs `playwright-cli open <dev_server.url>` during session init.
2. Investigation agent's first action is `playwright-cli snapshot` to verify browser is alive.
3. If snapshot fails: attempt `playwright-cli open <url>`, then `playwright-cli state-load .fixme/auth.json` if auth state exists.
4. If recovery fails: write partial findings to ticket, return error to orchestrator.

**Warning signs:** `Error: No active browser session` in agent output.

### Pitfall 2: Dev Server Not Running

**What goes wrong:** Agent navigates to `http://localhost:3000` but gets connection refused. The page shows an error, not the app.

**Why it happens:** Dev server wasn't started, or it crashed, or it's on a different port than expected.

**How to avoid:**
1. Orchestrator starts dev server during session init using `dev_server.command` from project context.
2. Orchestrator waits for server readiness before dispatching investigation (simple: try `playwright-cli goto <url>`, retry on failure with backoff).
3. If agent hits a dead server mid-investigation: report back to orchestrator rather than trying to restart the server.

**Warning signs:** `ERR_CONNECTION_REFUSED` in navigation output, page snapshot showing browser error page.

### Pitfall 3: Snapshot Returns Stale State After Navigation

**What goes wrong:** Agent runs `playwright-cli goto <url>`, then immediately runs `playwright-cli snapshot`. The snapshot shows the loading state or previous page because the navigation hasn't finished.

**Why it happens:** `playwright-cli goto` returns after the navigation starts, but dynamic content (React/Next.js hydration, API calls) may not have completed.

**How to avoid:**
1. After navigation, use `playwright-cli run-code "async page => { await page.waitForLoadState('networkidle'); }"` for SPAs.
2. Or: check the snapshot for expected content. If it shows loading spinners, wait and re-snapshot.
3. The agent should learn this pattern from the instructions -- include a "wait for page ready" step in the reproduction workflow.

**Warning signs:** Snapshots showing loading indicators, empty content areas, or hydration-pending state.

### Pitfall 4: Accessibility Snapshot Doesn't Show the Bug

**What goes wrong:** The bug is visual (CSS overlap, wrong color, layout issue) but `playwright-cli snapshot` returns an accessibility tree that looks fine. The tree doesn't capture visual styling.

**Why it happens:** Accessibility snapshots represent DOM structure and text content, not visual appearance. A button that's visually hidden behind another element still appears in the accessibility tree.

**How to avoid:**
1. For visual bugs: use `playwright-cli screenshot` to capture visual evidence, not just `playwright-cli snapshot`.
2. The agent should recognize when a bug is visual vs functional and adjust its evidence strategy.
3. For CSS-related bugs: supplement with `playwright-cli eval "getComputedStyle(el).property"` to check specific CSS values.
4. Include both snapshot (for text verification) and screenshot (for visual verification) as standard practice.

**Warning signs:** Snapshot says "everything looks normal" but the user's report describes a visual issue.

### Pitfall 5: Investigation Agent Exceeds Context Window

**What goes wrong:** Agent reads too many source files, the context fills up, and the agent starts losing earlier information (investigation notes, reproduction steps, original report).

**Why it happens:** No explicit file-read limit per the CONTEXT.md decision ("No limit on files read -- agent uses its own judgment"). But the LLM's context window IS the natural limit.

**How to avoid:**
1. Agent instructions should encourage strategic reading: start from the affected component, follow imports, stop when root cause is found.
2. Read relevant code sections (line ranges), not entire files. Use `Read` with `offset` and `limit` for large files.
3. Write investigation findings to the ticket progressively (Edit tool), so findings persist even if context compacts.
4. The model choice matters -- Opus has a larger effective context window than Sonnet. Recommend Opus for investigation.

**Warning signs:** Agent "forgetting" what it already found, repeating file reads, producing contradictory findings.

### Pitfall 6: Auth State Not Persisted Across Browser Restarts

**What goes wrong:** Browser crashes during investigation. Agent relaunches with `playwright-cli open`, but now it's logged out. The app shows a login page instead of the page being investigated.

**Why it happens:** In-memory browser sessions don't persist cookies/storage. If the session was started with default (non-persistent) mode, all auth state is lost on crash.

**How to avoid:**
1. During session init, after login, save auth state: `playwright-cli state-save .fixme/auth.json`.
2. On browser relaunch, restore: `playwright-cli state-load .fixme/auth.json`.
3. Store auth state in `.fixme/` which is gitignored.
4. Document in SKILL.md that session init must save auth state.

**Warning signs:** After browser relaunch, snapshots show login page instead of expected page.

## Code Examples

### Investigation Agent Frontmatter

```yaml
---
name: investigation-agent
description: Reproduces bugs in a real browser and investigates codebase to find root cause
tools: Read, Write, Edit, Bash(playwright-cli:*), Bash(mkdir *), Bash(node .claude/skills/fixme/scripts/fixme-tools.cjs *), Glob, Grep
model: opus
skills:
  - playwright-cli
---
```

**Model recommendation: `opus`**

Investigation is the most cognitively demanding phase: the agent must deduce reproduction steps from vague reports, interpret accessibility snapshots, trace code paths across files, and form a coherent root cause hypothesis. Sonnet could handle simple bugs but may struggle with:
- Vague reports requiring creative reproduction strategies
- Complex codebases with deep import chains
- Multi-file root causes spanning several modules
- Distinguishing between symptoms and root causes

Opus provides the reasoning depth needed. Cost is acceptable because investigation runs once per ticket (typically 1-3 attempts).

### playwright-cli Commands for Investigation

```bash
# Open browser and navigate (orchestrator does this at session start)
playwright-cli open http://localhost:3000

# Navigate to specific page
playwright-cli goto http://localhost:3000/login

# Get page state as accessibility tree (primary understanding tool)
playwright-cli snapshot

# Take visual screenshot for evidence
playwright-cli screenshot --filename=.fixme/sessions/fix-20260221-120000/assets/0001/repro-login-page.png

# Interact with elements (refs from snapshot)
playwright-cli click e7
playwright-cli fill e3 "test@example.com"
playwright-cli type "some text"
playwright-cli press Enter

# Check for errors
playwright-cli console         # console messages
playwright-cli network         # network requests (failed API calls)

# Wait for dynamic content (SPAs)
playwright-cli run-code "async page => { await page.waitForLoadState('networkidle'); }"

# Check specific CSS/computed values (for visual bugs)
playwright-cli eval "getComputedStyle(document.querySelector('.login-btn')).display"

# Save/restore auth state
playwright-cli state-save .fixme/auth.json
playwright-cli state-load .fixme/auth.json
```

### Orchestrator Session Init Update (SKILL.md addition)

```markdown
## Session Initialization (Environment Setup)

After loading/detecting project context and before entering the dispatch loop:

1. **Start dev server** (if not already running):
   ```bash
   # Check if server is already running
   playwright-cli open <dev_server.url>
   ```
   If navigation fails (connection refused):
   ```bash
   # Start dev server in background
   <dev_server.command> &
   ```
   Wait for server readiness: retry `playwright-cli goto <url>` every 2 seconds, up to 30 seconds.

2. **Browser setup:**
   The `playwright-cli open` from step 1 already opens the browser.
   The browser runs headed (default) so the user can watch.

3. **Login (if applicable):**
   Check if `.fixme/auth.json` exists:
   - If YES: `playwright-cli state-load .fixme/auth.json`, then verify by checking if the page shows authenticated content.
   - If NO: Ask the user "Does this app require login? If so, please log in now in the browser, then tell me when ready."
     On user confirmation: `playwright-cli state-save .fixme/auth.json`

4. **Ready for dispatch.** Investigation agents assume browser is open and authenticated.
```

### Task Dispatch for Investigation Agent

```markdown
## Dispatch Loop (Investigation)

When dispatching an investigation agent:

1. Transition ticket to investigating:
   ```bash
   node .claude/skills/fixme/scripts/fixme-tools.cjs ticket transition <ticket-path> investigating
   ```

2. Create ticket asset directory:
   ```bash
   mkdir -p .fixme/sessions/<session>/assets/<ticket-number>/
   ```

3. Dispatch via Task tool:
   ```
   First, read .claude/skills/fixme/agents/investigation-agent.md for your role instructions.

   Then investigate this bug:
   - Ticket file: <ticket-path>
   - Project context: .fixme/project-context.yaml
   - Asset directory: .fixme/sessions/<session>/assets/<ticket-number>/
   - Dev server URL: <dev_server.url>
   ```

4. On Task return:
   - Read ticket state from disk (always)
   - Read agent's summary response
   - If investigation succeeded: transition to fixing (Phase 4)
   - If investigation found issues but couldn't reproduce: leave in investigating, report to user
   - If blocker: report to user, wait for resolution
```

### Investigation Agent Instruction Structure (Outline)

```markdown
# Investigation Agent

You are the Fixme investigation agent. Your personality is
**exploratory and curious** -- you're a detective, not a surgeon.
You reproduce bugs and find root causes.

## Input
- Ticket file path (read for original report + structured fields)
- Project context path (read for framework, dev server URL)
- Asset directory path (where to save screenshots)
- Dev server URL

## Workflow

### Phase 1: Understand the Report
- Read the ticket file
- Extract: affected URL, reproduction steps (if any), expected vs actual behavior
- Read project context for framework info

### Phase 2: Reproduce the Bug (Reproducer Role)
- Navigate to the affected URL: playwright-cli goto <url>
- Wait for page ready
- Take initial snapshot: playwright-cli snapshot
- Deduce reproduction steps from the report
- Execute each step via playwright-cli commands
- After each interaction: take snapshot to observe result
- Capture evidence: playwright-cli screenshot --filename=<asset-dir>/repro-<desc>.png
- Check console: playwright-cli console
- Check network: playwright-cli network

### Phase 3: Verify Reproduction (Verifier Role)
- Compare captured evidence against the original report
- If user provided a screenshot: compare visually
- If text description: compare snapshot text against described behavior
- Verdict: CONFIRMED / NOT_CONFIRMED / PARTIAL
- If NOT_CONFIRMED and attempts < max: go back to Phase 2 with adjusted strategy
- If CONFIRMED or max attempts reached: proceed to Phase 4

### Phase 4: Investigate Root Cause
- From reproduction evidence, identify:
  - Component names (from snapshot refs)
  - Error messages (from console)
  - Failed requests (from network)
- Use Grep/Glob to find source files:
  - Search for component names
  - Search for error message text
  - Search for URL route definitions
- Read relevant source files
- Trace the code path from UI to the bug
- Form a root cause hypothesis

### Phase 5: Write Findings
- Use Edit tool to append to ticket's Investigation section
- Format as structured subsections (see Pattern 3)
- Include all evidence: steps, screenshots, affected files, hypothesis

### Phase 6: Return Summary
- One-liner: "Investigated #NNN: <bug title> -- <status>"
- Status: "reproduction confirmed, root cause identified"
        or "reproduction failed after N attempts, best-effort analysis"

## Rules
- You do NOT fix the bug. Root cause only.
- You do NOT propose a fix approach. The fixer decides.
- Use playwright-cli commands for ALL browser interaction.
  NEVER use mcp__plugin_playwright_playwright__* tools.
- Write findings progressively to the ticket (not all at the end).
- If you hit a blocker you can't resolve, write partial findings
  to the ticket and return an error to the orchestrator.
```

## Discretion Recommendations

### 1. Investigation Strategy (Agent Intelligence)

**Recommendation:** The investigation agent should follow a flexible, evidence-driven strategy rather than a rigid script.

**Base strategy (documented in agent instructions):**
1. Start with the affected URL from the ticket's structured fields
2. If URL is missing, deduce from the report (look for page names, routes)
3. Navigate and take a baseline snapshot
4. Deduce reproduction steps from the freeform report
5. Execute steps, observing after each action
6. If the first approach doesn't reproduce: try variations (different input, different sequence, different viewport)

**The agent should NOT be constrained to a specific investigation order.** The instructions provide a framework, but the agent uses its own judgment for:
- Which files to read and in what order
- How many reproduction variations to try
- When to switch from reproduction to codebase analysis
- How deep to trace code paths

### 2. Reproducer/Verifier Communication

**Recommendation: Structured prompting within a single agent context.**

The investigation agent performs both roles sequentially. No sub-agent dispatch. The agent instructions define explicit phases (Reproducer, Verifier) with clear criteria for each.

Rationale:
- Claude Code does not support sub-sub-agents (Task within Task)
- A single context window retains all reproduction evidence for the verifier role
- Simpler implementation, no context boundary overhead
- The "loop" is just the agent re-entering Phase 2 after a failed verification

### 3. Console/Network Error Checking

**Recommendation: Yes, include as standard practice.**

After reproduction, the agent should always run:
```bash
playwright-cli console    # Check for JS errors, warnings
playwright-cli network    # Check for failed API calls
```

These provide critical diagnostic evidence:
- Console errors often contain the exact error message and stack trace location
- Network failures (4xx, 5xx) can explain why UI isn't working
- Both feed directly into the codebase investigation phase

Include in agent instructions as a mandatory post-reproduction step.

### 4. Model Selection

**Recommendation:**

| Agent | Model | Rationale |
|-------|-------|-----------|
| Investigation agent | `opus` | Most cognitively demanding phase. Must deduce reproduction steps from vague reports, interpret page state, trace multi-file code paths, form coherent hypotheses. |
| Fixer agent (Phase 4) | `opus` | Needs deep code understanding to implement correct fixes without regressions. |
| Verification agent (Phase 5) | `sonnet` | Simpler task: re-run known reproduction steps, compare before/after. Doesn't need the reasoning depth of Opus. |
| Intake agent | `sonnet` | Already decided in Phase 2. Light analysis, structured field extraction. |

Opus for investigation is the critical recommendation. The quality difference between sonnet and opus for:
- Deducing steps from vague reports: significant
- Multi-file code tracing: significant
- Root cause vs symptom distinction: significant

## State Machine Implications

No state machine changes needed for Phase 3. The existing transition matrix already supports:

```
queued -> investigating     (orchestrator dispatches investigation agent)
investigating -> fixing     (investigation complete, ready for fix -- Phase 4)
investigating -> skipped    (cannot reproduce, out of scope)
investigating -> failed     (blocker, unrecoverable error)
```

The `investigating -> fixing` transition is the happy path from investigation. However, Phase 3 only builds the investigation agent -- the orchestrator won't transition to `fixing` yet (that's Phase 4). For Phase 3, after investigation completes:

- **Option A:** Leave ticket in `investigating` state and report findings to user
- **Option B:** Transition to `fixing` state even though no fixer agent exists yet (pipeline continues manually)

**Recommendation: Option A for Phase 3.** The dispatch loop should stop after investigation and report findings. Phase 4 adds the `investigating -> fixing` transition trigger.

## SKILL.md Changes Required

### New: Session Environment Setup

Add between "Load project context" and "Dispatch loop":
1. Start dev server (background)
2. Open browser (`playwright-cli open <url>`)
3. Handle login (ask user or load auth state)
4. Save auth state to `.fixme/auth.json`

### Updated: Dispatch Loop

Currently the dispatch loop has a placeholder for investigation dispatch (step 3 says "Use the Task tool to spawn a subagent"). This needs concrete instructions for the investigation agent:
1. Create asset directory for ticket
2. Dispatch investigation agent with specific prompt template
3. Handle investigation results (success, partial, blocker)
4. For Phase 3: stop after investigation, report to user

### New: Browser Recovery

If investigation agent reports browser crash:
1. Attempt `playwright-cli open <url>`
2. Restore auth: `playwright-cli state-load .fixme/auth.json`
3. Re-dispatch investigation agent (ticket has partial findings from prior attempt)

## Open Questions

1. **Login Flow Details**
   - What we know: Orchestrator handles login at session start. Auth state saved/loaded via `playwright-cli state-save/load`.
   - What's unclear: How does the user specify login steps? Options: (a) user manually logs in while agent waits, (b) user provides login credentials in project context, (c) user provides a pre-saved auth state file.
   - Recommendation: Option (a) for v1 -- simplest and most secure. Orchestrator opens the app, asks user to log in manually, user confirms, orchestrator saves state. No credentials stored.

2. **Investigation Agent Result to Orchestrator**
   - What we know: Investigation agent writes findings to the ticket. It also returns a summary to the orchestrator via the Task tool return value.
   - What's unclear: What exactly should the return value contain? Enough for the orchestrator to decide next action without reading the ticket body.
   - Recommendation: Return a structured one-liner like intake: `"Investigated #0001: Login Button Unresponsive -- reproduction CONFIRMED, root cause identified"` or `"Investigated #0001: Login Button Unresponsive -- reproduction FAILED after 3 attempts, best-effort analysis provided"`. The orchestrator reads the state from disk regardless.

3. **Phase 3 Dispatch Loop Behavior**
   - What we know: Phase 3 builds the investigation agent. Phase 4 builds the fixer agent. The dispatch loop currently says "dispatch appropriate subagent" generically.
   - What's unclear: Should Phase 3's dispatch loop stop after investigation (since no fixer exists yet), or should it transition to `fixing` state and report that fixing isn't implemented yet?
   - Recommendation: Phase 3's dispatch loop dispatches investigation, then reports findings to user and moves to next ticket. It does NOT transition to `fixing`. The `investigating -> fixing` trigger is added in Phase 4.

## Sources

### Primary (HIGH confidence)
- `playwright-cli` skill SKILL.md at `~/.claude/plugins/marketplaces/playwright-cli/skills/playwright-cli/SKILL.md` -- Full command reference, 250+ lines. Commands: open, goto, click, fill, snapshot, screenshot, console, network, state-save, state-load, run-code. Verified locally.
- `playwright-cli` references at `~/.claude/plugins/marketplaces/playwright-cli/skills/playwright-cli/references/` -- session-management.md, storage-state.md, running-code.md. Verified locally.
- `playwright-cli` global binary at `/Users/denis/.nvm/versions/node/v22.21.1/bin/playwright-cli` -- Confirmed installed and available.
- Claude Code subagent docs (`/websites/code_claude` via Context7) -- Verified `skills` frontmatter field preloads skill content into subagent context. Verified `tools` field with `Bash(prefix:*)` filtering pattern.
- Claude Code permissions docs (Context7) -- Verified `Bash(playwright-cli:*)` permission filter syntax with wildcard matching.
- Existing codebase: `.claude/skills/fixme/SKILL.md` (286 lines), `agents/intake-agent.md` (122 lines), `scripts/fixme-tools.cjs` (1387 lines), `references/state-machine.md` (161 lines) -- Direct inspection of Phase 1 and Phase 2 deliverables.

### Secondary (MEDIUM confidence)
- Phase 1 and Phase 2 research files (`.planning/phases/01-*/01-RESEARCH.md`, `.planning/phases/02-*/02-RESEARCH.md`) -- Established patterns, prior decisions, architecture conventions.
- Claude Code official docs -- Subagent model selection aliases (`opus`, `sonnet`, `haiku`, `inherit`). Verified via Context7.

## Metadata

**Confidence breakdown:**
- Standard stack (playwright-cli): HIGH -- Installed, verified locally, command reference inspected, permission filter pattern confirmed via official docs
- Architecture (reproducer/verifier loop): HIGH -- Structured prompting within single agent context is the only viable approach (no sub-sub-agents). Well-understood pattern.
- Investigation agent design: HIGH -- Follows established agent MD pattern from Phase 2 (intake-agent.md). Tool access, skill preload, model selection all verified.
- Environment initialization: MEDIUM -- Login flow details unclear (how user specifies auth). Recommended manual login approach is simple but needs user testing.
- Screenshot management: HIGH -- `playwright-cli screenshot --filename=<path>` syntax verified from SKILL.md reference. Asset directory pattern consistent with Phase 1 decisions.
- Pitfalls: HIGH -- All pitfalls derived from direct inspection of playwright-cli behavior and Claude Code subagent constraints.

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days -- stable domain, playwright-cli and Claude Code subagent API unlikely to change)
