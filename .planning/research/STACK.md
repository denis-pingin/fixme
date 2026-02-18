# Stack Research

**Domain:** Claude Code skill system with agent orchestration and browser automation
**Researched:** 2026-02-18
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Claude Code Skills | Current (v2.1.3+) | Skill system framework | Native skill discovery, slash-command invocation, frontmatter config, supporting files. Skills replaced slash commands as the unified invocation model. Every "fixme" workflow is a skill directory with SKILL.md + supporting files. **Confidence: HIGH** (Official docs verified) |
| Claude Code Subagents | Current | Agent orchestration | Built-in Task tool spawns isolated agents with custom system prompts, tool restrictions, model selection, and permission modes. Subagents cannot spawn sub-subagents, but the main thread can chain them. Supports foreground (blocking) and background (concurrent) execution. **Confidence: HIGH** (Official docs verified) |
| Playwright MCP (`@playwright/mcp`) | Latest | Browser automation | Microsoft's official MCP server for Playwright. Uses accessibility tree snapshots (not screenshots), so no vision model needed. Registered via `claude mcp add` or inline in subagent `mcpServers` config. **Confidence: HIGH** (Official docs verified) |
| Markdown (MD files) | N/A | Agent definitions, skill definitions, templates, state | The entire Claude Code extension system is Markdown-native. Skills are SKILL.md, agents are .md with YAML frontmatter, templates are .md. This is the lingua franca. **Confidence: HIGH** (Official docs verified) |
| CommonJS (`.cjs`) | Node.js 18+ | CLI tooling scripts | GSD reference uses `.cjs` for tooling (`gsd-tools.cjs`). CJS runs without bundling, works with `node` directly, no ESM import issues. Perfect for utility scripts invoked from skill files. **Confidence: HIGH** (Verified from GSD reference architecture) |
| JSON | N/A | Configuration and state persistence | `config.json` for project settings, structured state files for ticket tracking. JSON is parseable by both shell (`jq`) and Node.js, and Claude Code natively handles JSON output. **Confidence: HIGH** |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@anthropic-ai/claude-agent-sdk` | Latest | Programmatic agent orchestration | If Fixme needs to run outside Claude Code interactive mode (CI/CD, webhook receivers, long-running daemons). Provides `query()` with streaming, sessions, subagents, hooks, and MCP support in TypeScript/Python. **Confidence: HIGH** (Official docs verified) |
| `@playwright/mcp` | Latest | Browser MCP server | Registered once via `claude mcp add playwright npx @playwright/mcp@latest`. All browser tools (navigate, click, snapshot, fill forms, evaluate JS) become available to any agent with MCP access. **Confidence: HIGH** (Official docs verified) |
| `chokidar` | 4.x | File watching | If Fixme uses a file-drop pattern for incoming bug reports (watch a directory for new .md files). Lightweight, cross-platform. Only needed if not using stdin/pipe approach. **Confidence: MEDIUM** |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `claude mcp add` | Register MCP servers | One-time setup: `claude mcp add playwright npx @playwright/mcp@latest`. Persists in `.claude/settings.json` or `~/.claude/.claude.json`. |
| `jq` | Parse JSON from CLI | Used extensively in GSD patterns for parsing init output, extracting fields from structured responses. Essential for shell-level JSON manipulation in skill scripts. |
| `gh` CLI | GitHub operations | For PR creation, issue management. Already in use in existing skills (`create-pr`, `address-pr-comments`). |
| Node.js 18+ | Runtime for CJS tools | Required by Playwright MCP (`npx`), GSD tools, and any custom `.cjs` utilities. |

## File Structure Conventions

Based on official Claude Code docs and GSD reference architecture:

```
~/.claude/fixme/                    # Skill system root (personal scope)
  SKILL.md                          # Main entry point — orchestrator skill
  agents/                           # Subagent definitions (if project-scoped)
    intake-agent.md                 # Bug report intake agent
    implementation-agent.md         # Bug fix implementation agent
    verification-agent.md           # Browser verification agent
  templates/                        # Structured output templates
    bug-report.md                   # Bug report capture template
    fix-summary.md                  # Fix completion summary template
    verification-report.md          # Browser verification report template
  scripts/                          # Executable utilities
    fixme-tools.cjs                 # CLI tooling (state management, ticket ops)
  references/                       # Supporting documentation
    workflow.md                     # Detailed workflow reference
  state/                            # Runtime state (gitignored)
    tickets/                        # Per-ticket state files
      TICK-001.json                 # Individual ticket state
    config.json                     # Fixme configuration
```

### Key Conventions

**SKILL.md frontmatter format:**
```yaml
---
name: fixme
description: Bug report intake and automated fix system. Accepts streaming bug reports, dispatches agents to capture, fix, and verify.
disable-model-invocation: true    # User-invoked only (side effects)
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
---
```

**Agent MD frontmatter format:**
```yaml
---
name: fixme-intake
description: Captures bug reports into structured MD files with timestamps
tools: Read, Write, Bash, Grep, Glob
model: haiku                       # Fast/cheap for intake work
permissionMode: acceptEdits        # Auto-accept file writes
maxTurns: 20                       # Bounded execution
---
```

**Subagent invocation from skill (conceptual):**
- Foreground (sequential): Implementation agent runs blocking, results return to orchestrator
- Background (concurrent): Intake agents run in background, multiple bug reports processed simultaneously
- Chain pattern: Intake -> Implementation -> Verification (each subagent completes before next starts)

**String substitutions in skills:**
- `$ARGUMENTS` — all arguments passed to the skill
- `$ARGUMENTS[N]` or `$N` — positional arguments
- `${CLAUDE_SESSION_ID}` — session ID for logging/correlation
- `` !`command` `` — dynamic context injection (shell command output injected before Claude sees prompt)

**State management pattern (from GSD):**
- JSON files for structured state (parseable by `jq` and Node.js)
- MD files for human-readable state (tickets, summaries)
- CJS tool script for all state mutations (single source of truth)
- Timestamps in ISO-8601 format

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Skills (`~/.claude/skills/`) | Agent SDK (`@anthropic-ai/claude-agent-sdk`) | When Fixme needs to run as a standalone daemon outside Claude Code (e.g., webhook receiver, CI/CD pipeline). SDK gives programmatic control but loses interactive skill invocation. |
| Subagents (Task tool) | Agent Teams | When work requires sustained parallelism across independent sessions with inter-agent communication. Overkill for Fixme's linear intake->fix->verify pipeline. Agent Teams is still experimental (research preview). |
| Playwright MCP plugin | Playwright CLI skill | When MCP overhead is too high per-invocation. A CLI-based skill wrapping Playwright commands is more token-efficient for simple checks but loses the rich tool set (snapshot, evaluate, form filling). |
| CJS tooling scripts | Shell scripts (bash/zsh) | When logic is trivial (< 20 lines). CJS is better for anything involving JSON parsing, state management, or complex control flow. |
| File-based state (JSON/MD) | SQLite / LevelDB | When ticket volume exceeds hundreds. For a personal tool processing a handful of bugs, file-based is simpler and Claude Code can read/write files natively. |
| Personal skills (`~/.claude/skills/`) | Project skills (`.claude/skills/`) | When the skill is project-specific. Fixme is a general-purpose personal tool, so personal scope is correct. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| ESM modules (`.mjs`) for tool scripts | ESM requires `--experimental-vm-modules`, has import resolution issues, and Claude Code's own tooling uses CJS. GSD reference confirms CJS pattern. | CommonJS `.cjs` files executed with `node` |
| Agent Teams for this use case | Experimental (research preview), requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag, designed for multi-session coordination with inter-agent communication. Fixme's workflow is sequential (intake -> fix -> verify), not parallel multi-agent. | Subagents via Task tool (foreground/background) |
| Screenshot-based browser verification | Requires vision model, higher token cost, non-deterministic, slower. Playwright MCP uses accessibility tree snapshots which are text-based and LLM-native. | Playwright MCP `browser_snapshot` tool |
| Custom MCP server | Building a custom MCP server for browser automation is unnecessary when `@playwright/mcp` exists and is maintained by Microsoft. Custom MCP only makes sense for domain-specific tools not covered by existing servers. | `@playwright/mcp@latest` via npx |
| Python for tooling scripts | Adds a runtime dependency (Python + venv), when the entire Claude Code ecosystem is Node.js-native. GSD, existing skills, and the Agent SDK TypeScript package all use JS/Node. | Node.js CJS scripts |
| `--system-prompt` override in subagents | Replaces Claude Code's default system prompt entirely, losing built-in capabilities. | Agent MD files with focused system prompts in the markdown body (additive, not replacing) |
| Database for state | SQLite/Postgres adds deployment complexity for what is a single-user CLI tool. File-based state is directly readable by Claude Code's Read tool and editable by Write/Edit tools. | JSON files for structured state, MD files for human-readable state |
| YAML for configuration | JSON is natively parseable by both `jq` (shell) and `JSON.parse()` (Node.js). GSD uses JSON for config. YAML requires a parser dependency. | JSON for all configuration |

## Stack Patterns by Variant

**If running as interactive Claude Code skill (recommended):**
- Use `~/.claude/skills/fixme/SKILL.md` as entry point
- Invoke with `/fixme <bug-description>` or `/fixme @bug-report.md`
- Orchestrator spawns subagents via Task tool
- Playwright MCP registered globally, available to all agents
- State persists in `~/.claude/fixme/state/` or `/tmp/fixme/`

**If running as programmatic pipeline (CI/CD, webhook):**
- Use Agent SDK TypeScript package (`@anthropic-ai/claude-agent-sdk`)
- `query()` with custom agents, MCP servers, and streaming
- Session management via `resume` for multi-step workflows
- Playwright MCP passed inline: `mcpServers: { playwright: { command: "npx", args: ["@playwright/mcp@latest"] } }`
- State persists in project directory or database

**If running as long-lived watcher:**
- Use `claude -p` (headless mode) with `--continue` for session continuity
- File watcher (chokidar) drops `.md` files into intake directory
- Each file triggers a new `claude -p` invocation or resume
- State tracked via JSON files in watched directory

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Claude Code v2.1.3+ | Skills system (unified) | Skills merged with slash commands in v2.1.3. Earlier versions use `.claude/commands/` (still backward-compatible). |
| `@playwright/mcp@latest` | Node.js 18+ | Requires Node 18 minimum. Runs via npx, no explicit install needed. |
| `@anthropic-ai/claude-agent-sdk` | Node.js 18+ / Python 3.10+ | TypeScript and Python packages available. Use TypeScript to stay in the Node.js ecosystem. |
| Subagent `model` field | `sonnet`, `opus`, `haiku`, `inherit` | Model aliases, not full model IDs. `inherit` uses parent conversation model. |
| Subagent `mcpServers` field | Any MCP server | Can reference already-configured servers by name or define inline. MCP tools not available in background subagents. |

## Architectural Decision: Skill vs. Agent SDK

**Recommendation: Start with Skills, graduate to Agent SDK only if needed.**

The skill system provides:
- Zero-dependency deployment (just MD files + optional CJS scripts)
- Native Claude Code integration (slash commands, context injection, tool access)
- Subagent orchestration via Task tool (foreground + background)
- MCP access (Playwright) for browser automation
- CLAUDE.md context loading for project awareness
- Live reload during development (edit SKILL.md, changes detected immediately)

The Agent SDK adds:
- Programmatic control (callbacks, streaming, structured output)
- Session management (resume, fork)
- Headless execution (no interactive terminal needed)
- Custom tool approval logic
- Native hooks as code (not shell commands)

For Fixme's use case (personal tool, invoked from Claude Code, processes a handful of bugs), Skills + Subagents is the right layer. The Agent SDK would be over-engineering unless Fixme needs to run as a standalone daemon.

## Sources

- [Extend Claude with skills](https://code.claude.com/docs/en/skills) -- Official Claude Code skills documentation. **HIGH confidence.** Verified skill file format, frontmatter fields, directory layout, invocation control, subagent integration, dynamic context injection.
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents) -- Official subagent documentation. **HIGH confidence.** Verified agent MD format, frontmatter fields, model selection, tool restrictions, permission modes, hooks, persistent memory, foreground/background execution.
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) -- Official headless/SDK CLI documentation. **HIGH confidence.** Verified `-p` mode, `--continue`, `--resume`, structured output, streaming.
- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- Official Agent SDK documentation. **HIGH confidence.** Verified `query()` API, subagent definitions, MCP integration, session management, hooks, Python and TypeScript packages.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) -- Microsoft's official Playwright MCP server. **HIGH confidence.** Verified installation (`claude mcp add playwright npx @playwright/mcp@latest`), accessibility snapshot approach, configuration options.
- GSD reference architecture (`~/.claude/get-shit-done/`) -- Local reference. **HIGH confidence.** Verified CJS tooling pattern, MD agent/workflow file format, JSON config, template structure, state management patterns, subagent spawning patterns.
- Existing skills (`~/.claude/skills/`) -- Local reference. **HIGH confidence.** Verified skill directory structure (SKILL.md + scripts/ + references/), frontmatter conventions, invocation patterns.

---
*Stack research for: Claude Code skill system with agent orchestration and Playwright browser automation*
*Researched: 2026-02-18*
