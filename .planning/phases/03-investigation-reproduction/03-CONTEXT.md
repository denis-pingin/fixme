# Phase 3: Investigation & Reproduction - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The implementation agent can navigate to the app, reproduce the reported bug in a real browser, and investigate the codebase to understand root cause before attempting a fix. This phase creates the investigation agent, the multi-agent dispatch framework, and updates to the orchestrator's session initialization. Fixing and verification are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Multi-Agent Architecture

- Three specialist agents, each with distinct personality, instructions, and tools:
  - **Investigation agent** — exploratory/curious, reproduces bug + analyzes root cause (Phase 3)
  - **Fixer agent** — precise/methodical, plans fix then implements (Phase 4)
  - **Verification agent** — skeptical, browser-verifies the fix (Phase 5)
- An **implementation agent** orchestrates these three sequentially per ticket, dispatching each as a Task sub-agent (Phase 4, when there are 2+ steps to chain)
- For Phase 3: the orchestrator dispatches the investigation agent directly (no implementation agent wrapper yet)
- Sub-agents within investigation: **reproducer** (navigates, takes screenshots, writes evidence) and **verifier** (critically compares evidence vs original report). They loop until verifier is satisfied or max attempts reached
- Ticket file is the shared state between all agents — each agent reads and writes to its own section
- Token-efficient: each agent gets a fresh context window, only essential output crosses boundaries

### Browser & Environment

- **Playwright-cli skill** is the ONLY browser automation method — NOT Playwright MCP. This must be specified in the agent instructions file
- **Browser runs headed** — user can watch the agent work in real time
- **Session initialization** includes starting the dev server AND logging in (once, at session start). Orchestrator handles this
- Agents **assume environment is ready** (server running, logged in). If they hit a blocker they can't resolve, they report back to the orchestrator with a clear description + evidence. Orchestrator tells the user, who resolves it, then orchestrator restarts the agent
- Agent starts dev server itself if it's not running (project context has dev_server.command)
- Assume clean environment — no need to check for build issues, missing deps, or stale cache
- On browser crash: agent tries to fix the issue (relaunch browser). If it can't, reports back to orchestrator

### Investigation Output (Ticket Format)

- **Ticket is append-only history** — each agent writes to its own section, never overwrites other agents' sections
- Investigation section uses structured subsections per attempt:
  - **Reproduction Steps** — exact browser commands/actions the agent performed
  - **Reproduction Evidence** — screenshot + description of what confirms the bug
  - **Affected Files** — specific file paths with line references and relevant code snippets
  - **Root Cause Hypothesis** — what's causing the bug and why
- The investigation agent's output must be self-contained — the fixer agent should understand the bug without re-reading source files
- **Root cause only** — investigation does not propose a fix approach. The fixer agent decides how to fix
- No limit on files read — agent uses its own judgment and context window is the natural limit

### Screenshot Naming Schema

- Screenshots stored in ticket-specific directory: `.fixme/sessions/<session>/assets/<ticket-number>/`
- Prefix-based naming convention:
  - `intake-<description>.png` — user-submitted screenshots (from intake)
  - `repro-<description>.png` — reproduction evidence (from investigation)
  - `verify-<description>.png` — verification evidence (from Phase 5)
  - `fix-<description>.png` — fixer captures (if needed)
- Descriptions are freeform but descriptive. Prefix tells you which agent produced it and why

### Reproduction Strategy

- Agent is the intelligence — it handles vague or detailed tickets without relying on perfect input
- Agent deduces reproduction steps from the user's freeform report (users click around, they don't report precise steps)
- Produces exact reproduction steps (browser commands, navigation actions) as output
- Internal verifier sub-agent compares reproduction evidence against original report:
  - **Best:** Screenshot-to-screenshot comparison (if user submitted one)
  - **Good:** Screenshot compared against user's text description
  - **Fallback:** Text explanation with justification for why screenshot wasn't possible
- Reproduction attempts: configurable, defaulting to 3
- If reproduction fails after all attempts: agent still writes up everything it tried, makes best-effort root cause guess, marks findings clearly as **unverified/assumption** with a warning. Pipeline continues (doesn't block)

### Failure & Recovery

- On blocker: agent writes partial findings to ticket, reports to orchestrator with clear description + evidence
- On user intervention + restart: new agent reads ticket (which has partial progress) and resumes from there
- No automatic ticket failure from investigation — agent always moves forward with best-effort findings
- Agent does not prescribe investigation strategy — framework provides base instructions, agent uses judgment

### Claude's Discretion

- Exact investigation strategy (how the agent navigates, reads code, traces paths)
- How the reproducer and verifier sub-agents communicate within the investigation task (direct sub-agent dispatch or structured prompting)
- Console/network error checking as part of investigation
- Model selection for each agent (research during planning)

</decisions>

<specifics>
## Specific Ideas

- "The fixer needs to first write the plan and then proceed with implementation. Not start with the implementation directly." (Phase 4 scope, but captured for continuity)
- "The system should be efficient in terms of tokens. Sub-agents with clear boundaries minimize context window usage because inputs and outputs are well defined"
- "We are designing the framework first, not prescribing how the agent investigates. Agent behavior details come in v2"

</specifics>

<deferred>
## Deferred Ideas

- User can pass steering commands to the currently working agent (v2)
- Detailed investigation behavior tuning and constraints (v2)
- Multi-bug splitting from single message (v2, from Phase 2)
- Individual ticket skip/cancel (v2, from Phase 2)

</deferred>

---

*Phase: 03-investigation-reproduction*
*Context gathered: 2026-02-21*
