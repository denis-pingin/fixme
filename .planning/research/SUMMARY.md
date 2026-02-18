# Project Research Summary

**Project:** Fixme -- Streaming Bug Fix System for Claude Code
**Domain:** Claude Code skill system with agent orchestration and browser automation
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

Fixme is a Claude Code skill system that orchestrates autonomous bug fixing through a streaming intake + sequential dispatch pipeline. The research confirms this is a well-understood architectural pattern: a lean orchestrator spawns specialized subagents (intake, reproducer, fixer, verifier) that communicate through file-based ticket state. The entire system runs as Markdown files + CJS utility scripts within `~/.claude/fixme/`, requiring zero external dependencies beyond Playwright (MCP or CLI) for browser automation. The GSD reference architecture at `~/.claude/get-shit-done/` provides a proven, directly inspectable blueprint for the skill/workflow/agent file structure.

The recommended approach is Skills + Subagents (Task tool) with Playwright (MCP or CLI). The skill system gives native slash-command invocation, subagent spawning, and MCP access. Ticket MD files with YAML frontmatter serve as both persistent state and inter-agent communication -- they survive context compaction, are git-trackable, and are directly readable by all Claude Code tools. The architecture follows a strict "thin command -> lean orchestrator -> fresh subagent" delegation chain. The orchestrator touches only ticket frontmatter and dispatch logic; all investigation, fixing, and verification happens in subagents with fresh 200k context windows.

The dominant risk is context blowup in the orchestrator main loop. If the orchestrator accumulates tool outputs, investigation details, or subagent return values, it will hit context limits after 3-5 bugs and auto-compaction will destroy queue state. This is mitigated architecturally: all state lives on disk in ticket files, orchestrator tool access is restricted to Read/Write/Task only, and subagent returns are single-line summaries. Secondary risks include verification theater (agent declares fix works without actually testing the interaction) and HMR race conditions (verifying before hot-reload completes). Both are addressed through explicit verification protocols with interaction requirements and staleness checks.

## Key Findings

### Recommended Stack

The stack is pure Claude Code native -- no frameworks, no build tools, no runtime dependencies beyond Node.js 18+. See [STACK.md](./STACK.md) for full details.

**Core technologies:**
- **Claude Code Skills**: Entry point system. SKILL.md files with YAML frontmatter define commands, tools, and invocation behavior. Zero-dependency deployment.
- **Claude Code Subagents (Task tool)**: Agent orchestration. Foreground (blocking) for sequential pipeline, background (concurrent) for intake. Each subagent gets fresh 200k context.
- **Playwright (MCP or CLI)**: Browser automation via accessibility tree snapshots (text-based, no vision model needed). MCP registered via `claude mcp add`; CLI invoked via Bash.
- **Markdown files**: Lingua franca for everything -- skill definitions, agent roles, templates, ticket state, workflows. Human-readable and agent-parseable.
- **CommonJS (`.cjs`) scripts**: Utility tooling for state management, ticket operations. Runs with `node` directly, no ESM headaches.
- **JSON**: Configuration and structured state. Parseable by both `jq` (shell) and `JSON.parse()` (Node.js).

**Critical version requirement:** Claude Code v2.1.3+ (unified skills system).

**Key decision:** Start with Skills, only graduate to Agent SDK (`@anthropic-ai/claude-agent-sdk`) if Fixme ever needs to run as a standalone daemon (CI/CD, webhook receiver). For an interactive personal tool, Skills + Subagents is the right abstraction layer.

### Expected Features

See [FEATURES.md](./FEATURES.md) for the full landscape, dependency graph, and competitor analysis.

**Must have (table stakes -- v1 launch):**
- Bug report intake to structured ticket (the entry point)
- Sequential dispatch queue (FIFO processing)
- Ticket state machine (queued -> investigating -> fixing -> verifying -> done/failed)
- Project context auto-discovery from CLAUDE.md
- Investigation phase (understand before fixing)
- Browser-based reproduction and verification via Playwright
- One atomic git commit per fix
- Failure handling with move-on (don't block the queue)
- Fix details and evidence recording (audit trail)
- Timestamp and duration tracking
- Orchestrator context efficiency (survival requirement)
- **Streaming intake (accept bugs mid-fix)** -- core differentiator, promoted to v1

**Should have (v1.x after validation):**
- HMR-aware verification (skip unnecessary refresh)
- Visual before/after evidence (screenshots at repro + verify)
- Investigation report per ticket (agent reasoning trail)
- Git rollback on failed verification
- Retry with different approach (configurable max attempts)
- Summary dashboard (N fixed, M failed, total time)
- Priority override (urgent bugs jump the queue)

**Defer (v2+):**
- Duplicate/related bug detection
- Test-aware verification (run project test suite)
- Parallel implementation agents (design for it in v1, build in v2)
- External tracker integration (Jira/Linear/GitHub Issues)

**Key competitive insight:** No existing tool combines streaming bug intake + sequential autonomous fixing + browser-based verification in a single local Claude Code session. SWE-agent lacks browser verification. Codex runs in the cloud. Devin is a full environment, not a lightweight skill.

### Architecture Approach

The architecture is a four-layer system: Skill Commands (thin entry points) -> Workflows (lean orchestrators) -> Subagents (fresh-context workers) -> Persistent State (ticket MD files on disk). See [ARCHITECTURE.md](./ARCHITECTURE.md) for full component diagram and data flows.

**Major components:**
1. **Skill commands** (`commands/`): Thin MD files invoked via `/fixme:*`. Parse args, declare tools, reference workflows. Never contain logic.
2. **Workflows** (`workflows/`): Orchestration logic. Stay lean (~15% context). Read ticket frontmatter, spawn subagents via Task(), route based on results.
3. **Subagent roles** (`agents/`): Role definitions loaded by subagents at spawn. Intake, reproducer, fixer, verifier -- each owns specific ticket sections.
4. **Ticket state** (`tickets/`): File-based state machine. YAML frontmatter for machine parsing, markdown body for structured sections. THE communication channel between agents.
5. **Browser layer** (Playwright MCP or CLI): Snapshot-driven interaction for reproduction and verification. Accessibility tree for decisions, screenshots for evidence.

**Core patterns:**
- Ticket-as-state: agents read from and write to ticket files directly. Orchestrator never relays content -- passes file paths only.
- Sequential agents per ticket: reproducer -> fixer -> verifier. No concurrent writes to same ticket.
- Evidence accumulation: each agent adds to the ticket. The ticket grows into a complete audit trail.

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for all 8 pitfalls with detailed prevention strategies, warning signs, and recovery procedures.

1. **Context blowup in orchestrator** -- The #1 risk. Orchestrator accumulates state in conversation memory, compaction destroys queue knowledge. **Prevention:** All state on disk, orchestrator restricted to Read/Write/Task tools only, subagent returns are single-line summaries. Must be correct from Phase 1 -- retrofitting is a rewrite.

2. **Verification theater** -- Agent declares fix works after a superficial page-load check without actually testing the interaction that triggered the bug. **Prevention:** Verification protocol requires multi-step interaction (reproduce bug -> apply fix -> re-run same steps -> confirm behavior changed). Mandate clicks/submissions, not just snapshots.

3. **Subagent instruction ambiguity** -- Implementation agent misinterprets the bug because the ticket lost the user's original intent through summarization. **Prevention:** Intake agent preserves VERBATIM user description. Structured ticket fields: URL, element, expected vs actual behavior. Agent reads full ticket, not just task description.

4. **Stale ticket state from concurrent file access** -- Background intake agent and orchestrator write to shared state simultaneously, corrupting files. **Prevention:** Timestamp-based filenames (no shared index file), intake only creates new files (never modifies existing), queue order derived from directory listing.

5. **HMR race conditions** -- Agent verifies before hot-reload completes, sees stale state, wrongly concludes fix failed. **Prevention:** Mandatory wait/staleness check between code save and verification. Full page refresh as fallback when HMR status is unknown.

## Implications for Roadmap

Based on combined research, the build order follows clear dependency chains identified in ARCHITECTURE.md, feature dependencies from FEATURES.md, and pitfall-to-phase mapping from PITFALLS.md.

### Phase 1: Skeleton + State Foundation

**Rationale:** Everything depends on the ticket state system and orchestrator loop being architecturally correct. The PITFALLS research identifies context blowup and concurrent file access as Phase 1 concerns -- getting these wrong is a rewrite. This phase also establishes the file structure that all subsequent phases build on.

**Delivers:** Working skill directory structure, ticket template, state management conventions, stub commands, lean orchestrator loop that reads from disk and dispatches subagents.

**Addresses features:** Ticket state machine, timestamp tracking, project context discovery, orchestrator context efficiency, failure handling skeleton.

**Avoids pitfalls:** Context blowup (state on disk from day 1), concurrent file access (naming conventions established), orchestrator doing too much (tool restrictions enforced).

### Phase 2: Intake Pipeline

**Rationale:** Can't fix bugs without capturing them first. Intake is the entry point and the dependency root for the entire dispatch chain. Streaming intake (background agent) is a v1 differentiator -- include it here.

**Delivers:** Working `/fixme:triage` command. Bug reports become structured ticket files with verbatim descriptions, extracted fields, and proper queue ordering. Background intake accepts reports while other work proceeds.

**Addresses features:** Bug report intake to structured ticket, sequential dispatch queue, streaming intake (accept bugs mid-fix).

**Avoids pitfalls:** Subagent instruction ambiguity (verbatim preservation + structured fields in ticket template).

### Phase 3: Browser Reproduction

**Rationale:** The ARCHITECTURE research identifies browser reproduction as the highest-risk component that blocks both fixing and verification. Build it early, validate Playwright (MCP or CLI) patterns work reliably. The reproducer agent shares patterns with the verifier agent -- get them right once.

**Delivers:** Working reproducer agent that navigates to bug URL, interacts with the page, captures reproduction evidence (snapshots + screenshots), and writes results to the ticket.

**Addresses features:** Browser-based reproduction, fix details and evidence recording.

**Uses:** Playwright (MCP or CLI) — `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_screenshot`.

### Phase 4: Fix Implementation

**Rationale:** Depends on Phase 3 (reproduction results inform fixing). The fixer agent needs reproduction evidence to understand root cause. This is the core value delivery -- actually fixing bugs.

**Delivers:** Working fixer agent that reads the ticket, investigates root cause in the codebase, implements a fix, and creates an atomic git commit. Working `/fixme:fix` command with the full orchestrator workflow.

**Addresses features:** Investigation phase, one commit per fix, project context utilization.

**Avoids pitfalls:** Implementation agent lacking project context (reads cached project-context file), orchestrator doing too much (all fixing in subagent).

### Phase 5: Verification + Close Loop

**Rationale:** Depends on Phase 3 (reuses reproduction patterns) and Phase 4 (fixes exist to verify). Closes the end-to-end pipeline. Without verification, the system is just an unreliable auto-fixer.

**Delivers:** Working verifier agent that re-runs reproduction steps post-fix, confirms behavior changed, captures evidence. Working `/fixme:close` command. Full end-to-end pipeline: intake -> reproduce -> fix -> verify -> commit -> close.

**Addresses features:** Browser-based verification, fix details and evidence recording, failure handling with move-on (verified or failed, move to next).

**Avoids pitfalls:** Verification theater (multi-step interaction protocol, not just page-load checks), HMR race conditions (wait/staleness check before verification).

### Phase 6: Hardening + Polish

**Rationale:** Core pipeline works. Now harden edge cases, add UX improvements, and prepare for real usage. This phase addresses the v1.x features and remaining pitfall mitigations.

**Delivers:** HMR-aware verification, git rollback on failed verification, retry with different approach, summary dashboard, investigation reports, Shadow DOM fallbacks, progress visibility during agent runs.

**Addresses features:** HMR-aware verification, visual before/after evidence, investigation report per ticket, git rollback, retry logic, summary dashboard, priority override.

**Avoids pitfalls:** Shadow DOM blind spots (fallback chain), hot-reload race conditions (staleness detection).

### Phase Ordering Rationale

- **Phases 1-2 before 3-5:** State management and intake are the foundation. Browser automation and fixing depend on tickets existing and queue state being reliable.
- **Phase 3 before 4-5:** Browser reproduction is the highest-risk technical component (Playwright integration patterns). It blocks both fixing (needs repro evidence) and verification (reuses repro patterns). Build and validate it early.
- **Phase 4 before 5:** Fixer must produce a fix before verifier can verify it. Sequential dependency.
- **Phase 6 after 1-5:** Hardening and polish only make sense after the core pipeline works end-to-end.
- **Pitfall alignment:** The 3 critical pitfalls (context blowup, verification theater, instruction ambiguity) are all addressed in Phases 1-2, not deferred to later phases. This is deliberate -- they're architectural, not polish.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (Browser Reproduction):** Playwright accessibility tree limitations are partially documented (GitHub issue #514). Shadow DOM behavior, multi-tab management, and interaction reliability need hands-on validation. Run `/gsd:research-phase` before planning.
- **Phase 5 (Verification):** The verification protocol (multi-step interaction, staleness detection, before/after comparison) is novel -- no established pattern exists for LLM-driven browser verification. Needs design research.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Skeleton + State):** Directly mirrors GSD reference architecture. File structure, naming conventions, and state management patterns are proven and locally inspectable.
- **Phase 2 (Intake Pipeline):** Standard subagent dispatch pattern. Text parsing + file creation. Well-documented in Claude Code skill/subagent docs.
- **Phase 4 (Fix Implementation):** Standard code investigation and editing. The fixer agent is a focused version of what Claude Code already does in normal interactive use.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official Anthropic docs and local GSD reference. No speculative choices -- everything is production-ready and battle-tested. |
| Features | HIGH | Feature landscape cross-referenced with SWE-agent, Codex, Devin capabilities. Dependency graph is clean. MVP scope is well-scoped -- 13 features, none speculative. |
| Architecture | HIGH | Directly derived from local GSD reference architecture (inspectable code, not documentation). Four-layer pattern is proven. Data flow through ticket files is the key insight. |
| Pitfalls | HIGH | 8 pitfalls identified from Anthropic engineering docs, Claude Code official docs, Playwright issues, and community incident reports. Each has prevention strategy and phase mapping. |

**Overall confidence:** HIGH

All four research streams converge on the same architectural conclusions. The GSD reference is a locally inspectable, working system -- not documentation that might be outdated. The skill/subagent/MCP stack is first-party Anthropic technology with official documentation. Playwright (MCP and CLI) is maintained by Microsoft with active development.

### Gaps to Address

- **Playwright (MCP or CLI) tab/browser management under concurrent agents:** The research identifies that subagents may share a browser process. Exact behavior when intake (background) and fixer (foreground) both need browser access is untested. Validate in Phase 3.
- **Background subagent MCP limitations:** Official docs confirm background subagents cannot use MCP tools. Intake agent must be designed without Playwright access. This is noted but not a gap -- it's a confirmed constraint.
- **Context compaction behavior with ticket file reads:** The exact behavior of auto-compaction when the orchestrator repeatedly reads ticket frontmatter is theoretical. Validate empirically in Phase 1 by processing 5+ tickets in a session.
- **Subagent `skills` field for project context preloading:** The Stack research mentions this capability but it wasn't verified with a working example. Validate during Phase 4 planning whether skills frontmatter can inject project context at subagent startup.
- **Streaming intake UX:** How the user reports a new bug while a fix is in progress (interrupt? separate input? file drop?) is a UX decision not resolved by research. Decide during Phase 2 planning.

## Sources

### Primary (HIGH confidence)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) -- Skill file format, frontmatter, directory layout, invocation
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents) -- Agent MD format, model selection, tool restrictions, foreground/background
- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- Programmatic orchestration alternative
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) -- Browser automation, accessibility snapshots, installation
- [Effective Context Engineering -- Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) -- Context management patterns
- [Compaction -- Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/compaction) -- Auto-compaction behavior
- GSD reference architecture (`~/.claude/get-shit-done/`) -- File structure, CJS tooling, agent patterns, state management

### Secondary (MEDIUM confidence)
- [Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf) -- Planner/worker/judge pattern
- [AI Coding Agents: Coherence Through Orchestration](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) -- Orchestration patterns
- [Why AI Agent Fix PRs Remain Unmerged](https://arxiv.org/html/2602.00164) -- 18% failure rate on test validation
- [Playwright MCP issue #514](https://github.com/microsoft/playwright-mcp/issues/514) -- Shadow DOM accessibility snapshot gaps

### Tertiary (LOW confidence)
- [Shipyard: Multi-agent Orchestration](https://shipyard.build/blog/claude-code-multi-agent/) -- Agent team patterns (experimental)

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
