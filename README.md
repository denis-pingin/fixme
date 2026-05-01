# Fixme

A Claude Code skill suite for automated task execution. Turn a task description into a verified fix through config-driven workflows with plan/review/execute/review cycles, ticket state management, and PR comment resolution.

Primary entry points:

- **`/fixme-task`** - Single-task pipeline executor. Plan, review, execute, review code - with configurable phases and review loops.
- **`/fixme-session`** - Long-lived session that accepts bug reports, creates tickets, and dispatches background workflows to investigate, fix, and verify each bug.
- **`/fixme-pr-comments`** - Fetch and address unresolved PR review comments through the full plan/execute cycle.
- **`/fixme-rebase`** - Safe branch rebasing with conflict resolution and verification.
- **`/fixme-ticket`** - Create Linear tickets from a description or conversation context.
- **`/fixme-config`** - Interactive configuration for workflows, model profiles, and project settings.

## Quick Start

### Fix a single task

```text
/fixme-task fix the login button being unresponsive on mobile
```

Runs the default pipeline: plan -> review -> execute -> code review. Fully automated with review loops that catch issues before they ship.

### Fix a task with a specific pipeline

```text
/fixme-task full investigate why the checkout flow fails on Safari
```

Runs the "full" pipeline: investigate -> research -> plan -> execute -> verify. Adds browser reproduction and codebase research before planning.

### Write specifications explicitly

```text
/fixme-task --product-spec describe the new import flow
/fixme-task --tech-spec /absolute/path/to/product-spec.md
/fixme-task --technical-spec /absolute/path/to/product-spec.md
```

`--product-spec` writes and reviews a product specification. `--tech-spec` and `--technical-spec` write and review a technical specification.

### Start from a known artifact

```text
/fixme-task --plan /absolute/path/to/technical-spec.md
/fixme-task --execute /absolute/path/to/plan.md
/fixme-task --idea-to-production describe the full feature
```

`--plan` runs the planning loop from source material. `--execute` runs implementation and code review from an existing plan. `--idea-to-production` runs product specification -> technical specification -> plan -> implementation with review loops at every stage.

### Let fixme-task auto-detect the next step

```text
/fixme-task /absolute/path/to/product-spec.md
/fixme-task /absolute/path/to/technical-spec.md
/fixme-task /absolute/path/to/plan.md
```

When no pipeline is named, `fixme-task` detects the artifact type from the path and headings. Product specifications continue to `technical-spec`, technical specifications continue to `plan`, and implementation plans continue to `execute`.

### Run a bug fix session

```text
/fixme-session
```

Starts an interactive session. Report bugs conversationally - each gets a ticket, queued for automated fix. The session stays responsive while fixes execute in the background.

### Review an existing plan

```text
/fixme-task --plan /absolute/path/to/plan.md
```

Skips plan writing, enters at plan review. Useful when you've written or refined a plan yourself.

### Address PR review comments

```text
/fixme-pr-comments
```

Fetches unresolved PR comments (review threads, Claude bot, Greptile), analyzes each one, fixes valid issues through the plan-execute cycle, verifies, and resolves addressed conversations. Comments on non-issues without resolving.

### Rebase a branch

```text
/fixme-rebase
/fixme-rebase main
```

Safely rebases the current branch onto its base branch (auto-detected from PR target or merge-base). Backs up when needed, resolves conflicts with intent awareness, and runs full verification before declaring done.

### Create a Linear ticket

```text
/fixme-ticket login button broken on mobile, only on iOS Safari
```

Creates a Linear ticket from a description or the current conversation context. Auto-discovers team, project, and label metadata upfront. Supports templates, assignment, status, due dates, and attachments.

### Configure workflows and models

```text
/fixme-config
```

Interactive setup for `.fixme/config.json` - workflows, workflow skills, per-phase review cycles, workflow outer cycles, model profiles (quality/balanced/budget), project commands (install/build/lint/test), and Linear backend. Auto-detects project commands from `package.json` on first run.

`/fixme-config` writes through `fixme-tools.cjs config` commands, not by hand-editing JSON. The tool creates missing config files, backfills newly added standard workflows, validates workflow cycle limits, preserves custom config, and writes atomically.

## Architecture

### Two Orchestrators

**fixme-session** manages the session lifecycle: intake, queuing, browser setup, and dispatching fixme-task in the background per ticket. It owns terminal transitions (done, failed, skipped) because those require cleanup (git commit/revert).

**fixme-task** executes workflows. It reads phase definitions from `.fixme/config.json`, dispatches each phase's skills as isolated agents, manages review loops within phases, and optionally updates ticket state at phase boundaries.

### Config-Driven Workflows

Workflows are defined in `.fixme/config.json`:

```json
{
  "workflows": {
    "default": {
      "outerMaxCycles": 2,
      "phases": [
        { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } },
        { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 2 } }
      ]
    },
    "product-spec": {
      "outerMaxCycles": 2,
      "phases": [
        { "name": "product-spec", "skills": ["fixme-write-product-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } }
      ]
    },
    "idea-to-production": {
      "outerMaxCycles": 2,
      "phases": [
        { "name": "product-spec", "skills": ["fixme-write-product-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } },
        { "name": "technical-spec", "skills": ["fixme-write-technical-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } },
        { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } },
        { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 2 } }
      ]
    }
  }
}
```

No config file? Falls back to standard workflows built into `fixme-task`. Plain `/fixme-task ...` uses the default workflow unless the input clearly contains a product specification, technical specification, or implementation plan.

Legacy configs using `pipelines` plus `workflowControls` are migrated to `workflows` by `fixme-tools.cjs config migrate`.

Config CLI:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get [key.path]
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set <key.path> '<json-value>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <workflow> --data '<json>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs codex-skills install --skills-src .claude/skills --codex-dir ~/.codex
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs codex-agents install --agents-src .claude/agents --codex-dir ~/.codex
```

### Dynamic State Machine

The ticket state machine is derived from the selected workflow. Phase names become ticket states. Given phases `[plan, implement]`:

```text
queued -> plan -> implement -> done
```

Backward transitions (any phase to any earlier phase) are allowed with a reason - used for retries when review finds issues. Terminal states: `done`, `failed`, `skipped`.

### Ticket Abstraction

Ticket operations go through `fixme-tickets` which routes to the configured backend:

- **fixme-tickets-md** - Markdown files with YAML frontmatter (default, built-in)
- **fixme-tickets-linear** - Linear integration (v2 stub)

### Skill Suite

| Skill | Purpose |
| ----- | ------- |
| `fixme-session` | Session orchestrator (intake, dispatch, cleanup) |
| `fixme-task` | Config-driven pipeline executor |
| `fixme-howto-write-product-spec` | Shared product specification writing rubric for behavior-first specifications |
| `fixme-howto-write-technical-spec` | Shared technical specification writing rubric for deterministic implementation contracts |
| `fixme-howto-review-spec` | Shared specification review rubric for reviewers or standalone use |
| `fixme-write-product-spec` | Write product specifications from feature requests or review FIX items |
| `fixme-write-technical-spec` | Write technical specifications from product specifications, source material, or review FIX items |
| `fixme-write-plan` | Write implementation plans (4 modes: fresh, plan revision, code revision, rewrite) |
| `fixme-review-spec` | Review specifications for deterministic implementability |
| `fixme-handle-spec-review` | Triage specification review findings (unified taxonomy) |
| `fixme-review-plan` | Review plans for correctness and feasibility |
| `fixme-handle-plan-review` | Triage plan review findings (unified taxonomy) |
| `fixme-execute-plan` | Execute plans with verification gates |
| `fixme-review-code` | Review executed code against plan |
| `fixme-handle-code-review` | Triage code review findings (unified taxonomy) |
| `fixme-investigate` | Browser reproduction + root cause analysis |
| `fixme-research` | Codebase exploration around a known issue |
| `fixme-pr-comments` | Fetch, analyze, and address unresolved PR review comments |
| `fixme-rebase` | Safe branch rebasing with conflict resolution and verification |
| `fixme-browser-verify` | Browser verification after code changes |
| `fixme-ticket` | Create Linear tickets from description or conversation context |
| `fixme-config` | Interactive configuration for workflows, models, and project settings |
| `fixme-tickets` | Abstract ticket interface (routes to backend) |
| `fixme-tickets-md` | Markdown file ticket backend |
| `fixme-tickets-linear` | Linear ticket backend (v2 stub) |

## Key Design Principles

- **Ticket files are the state.** Each bug gets a numbered markdown file with YAML frontmatter. State transitions go through `fixme-tools.cjs` which validates, computes durations, and maintains the transition log.

- **Lean orchestrators, fresh subagents.** Orchestrators never read source code or do implementation work. All real work happens in subagents spawned with fresh context windows.

- **State on disk, not in memory.** After every subagent returns, state is re-read from disk. Context compaction can discard in-memory state at any time.

- **Review loops catch what confidence blinds you to.** Every plan is reviewed before execution. Every execution is reviewed after. FIX items loop back through the pipeline - never applied inline.

## Installation

```bash
./install.sh
```

Copies all `fixme*` skill directories from `.claude/skills/` to `~/.claude/skills/`. It installs Codex-adapted skill copies into `~/.codex/skills/`, installs Claude agent definitions, generates Codex agent TOML files, and registers Codex agents through `~/.codex/config.toml` with `[agents.fixme-*]` tables.

## Requirements

- Claude Code
- Node.js 18+
- Playwright CLI (for browser automation skills)
- No other external dependencies
