# Phase 2: Intake Pipeline - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can submit bug reports mid-session and they become structured, queued ticket files without interrupting ongoing work. This phase delivers the intake agent, updates the orchestrator's intake flow, and adds a `ticket rename` subcommand to fixme-tools.cjs. Investigation, fixing, and verification are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Submission UX

- Two submission paths, both equivalent: `/fixme:report <description>` (explicit) and inline text (LLM intent detection by orchestrator)
- `/fixme:report` accepts inline args for quick reports; bare `/fixme:report` prompts for a description
- Orchestrator uses LLM intent detection to classify inline messages as bug reports vs other input
- High-confidence classification: act immediately without confirmation. Low confidence: ask user to confirm before dispatching intake
- One ticket per user message in v1. Multi-bug splitting deferred to later version
- `/fixme:report` without an active session bootstraps full orchestrator (session + intake + dispatch loop)
- Orchestrator is a thin dispatcher — it does NOT interpret the bug report. It forwards the raw text (stripped of command prefix if present) to the intake agent
- Parallel intake agents are allowed — multiple can run simultaneously for concurrent report submissions
- fixme-tools.cjs pre-creates the ticket file with the next number (atomic number assignment), then intake agent fills it in
- Ticket file initially gets a temporary/random slug; intake agent generates proper slug after understanding the report, then renames via fixme-tools.cjs
- Orchestrator tracks which intake agents are running (not polling the directory)
- User messages queue up in conversation context naturally; orchestrator picks them up between operations (Claude Code's single-threaded model — no special polling needed)
- Intake agent receives the bug description only (isolated, no conversation history)

### Report Content

- Bug report is unstructured free text + optional images. v1 supports text and images only; other file types deferred
- Minimum viable report: any text (even one word), though quality varies with detail
- Original user prompt preserved verbatim in ticket's "Original Report" section — source of truth
- Intake agent fills: title (generated), original prompt, and structured fields (from its analysis)
- Intake agent does light codebase exploration to understand the report conceptually — identifies affected areas, not specific files
- Repro steps extracted from report if obvious; otherwise left blank for investigation agent
- Screenshots: inline images from prompt are placed/named/linked by intake agent; path references in description are copied to session directory with proper linking. Missing files reported back to user

### Feedback & Visibility

- Orchestrator announces dispatch: brief one-liner when it detects/receives a bug report ("Dispatching intake...")
- Intake agent returns a one-liner summary to orchestrator: "Queued #003: Login button broken on mobile Safari"
- Orchestrator relays intake's one-liner summary to user
- No periodic status output during session — user checks with `/fixme:status` if curious (one-time snapshot)
- Status updates are user-initiated only

### Queue & Session Lifecycle

- FIFO order — no reprioritization in v1 (skipping individual tickets deferred to v2)
- When all queued tickets are processed and no agents running: orchestrator auto-closes session with summary display
- Only time orchestrator prompts for input: initial start with no bug report attached
- Session auto-close shows the same summary as manual `/fixme:stop`

### File Structure

- New file: `~/.claude/skills/fixme/agents/intake-agent.md` — agent instructions for processing bug reports
- SKILL.md updated: intake section dispatches to intake agent instead of creating tickets directly
- New fixme-tools.cjs subcommand: `ticket rename` — atomic file rename + frontmatter slug update
- Intake agent writes structured fields directly to ticket file using Write/Edit tools (guided by HTML comment markers)

### Claude's Discretion

- Exact wording of dispatch announcement and intake summary format
- How to handle the case where fixme-tools.cjs pre-creates a file and the intake agent fails (cleanup strategy)
- Temporary slug format for pre-created ticket files
- Whether to use haiku or sonnet model for the intake agent Task dispatch

</decisions>

<specifics>
## Specific Ideas

- The orchestrator should feel invisible — user types a bug, it just gets queued. No ceremony.
- LLM intent detection should err on the side of asking when unsure rather than mis-classifying
- The intake agent is NOT a transcriber — it understands the report enough to write a meaningful title and identify affected areas

</specifics>

<deferred>
## Deferred Ideas

- Multi-bug splitting from single message — future version
- Individual ticket skip/cancel — v2
- Other file types beyond text and images (PDFs, etc.) — future version
- Timeout on ambiguous classification prompts — not possible in Claude Code's blocking prompt model

</deferred>

---

*Phase: 02-intake-pipeline*
*Context gathered: 2026-02-20*
