---
name: fixme-howto-code-map
description: Shared task-scoped code map contract for the fixme pipeline. Defines how planners record verified codebase context once, how downstream agents reuse it, and how stale map entries are invalidated across review cycles.
---

# Task Code Map

A task code map is a compact, source-referenced artifact that preserves verified codebase context for one fixme-task run. It exists to reduce rediscovery across plan, review, execution, and revision cycles.

## Authority

- The code map is orientation, not authority. Source files, tests, specs, plans, and decision logs remain authoritative.
- If the code map conflicts with source, source wins.
- Any agent that relies on a code map claim for a finding, fix, or plan step must re-read the cited source lines first.
- Write-capable agents should update stale map entries when their work changes the mapped files. Read-only agents should report stale entries in their output instead of editing the map.

## Location

Save task code maps under:

```text
<fixme-dir>/context/<plan-slug>-code-map.md
```

Use the plan filename stem as `<plan-slug>` when a plan exists. Example:

```text
<fixme-dir>/plans/2026-04-30-agent-gallery.md
<fixme-dir>/context/2026-04-30-agent-gallery-code-map.md
```

## Shape

Use this structure:

```markdown
# Code Map: [task title]

**Task:** [one sentence]
**Plan:** [absolute path or "not created yet"]
**Last updated:** [ISO date/time]
**Map status:** current | needs targeted refresh

## Invalidation Inputs

- **Base/source material:** [spec, ticket, branch, or task source]
- **Current changed files:** [paths or "none yet"]
- **Refresh triggers:** [files or facts that require re-reading if changed]

## Relevant Files

- `path/to/file.ts:L10-L80` - [role in this task]
  - **Verified facts:** [1-3 concrete facts: exported symbols, data shape, behavior, dependency]
  - **Why it matters:** [how this affects the plan/review]

## Files To Touch

- **Create:** `path/to/new-file.ts` - [responsibility]
- **Modify:** `path/to/existing.ts:L42-L68` - [planned or actual change]
- **Test:** `path/to/file.test.ts` - [coverage target]

## Interfaces And Data Shapes

- **Name:** [function/type/API/config key]
  - **Defined at:** `path:Lx-Ly`
  - **Shape:** [compact signature or fields]
  - **Usage constraint:** [what must be preserved]

## Patterns To Reuse

- **Pattern:** [short name]
  - **Evidence:** `path:Lx-Ly`
  - **Use here:** [exactly how this task should follow it]

## Commands

- **Build:** [exact command or N/A]
- **Lint:** [exact command or N/A]
- **Tests:** [exact command or N/A]

## Open Verification Points

- [Facts that were not verified yet but may matter. Empty if none.]
```

## Writing Rules

- Keep entries compact. Prefer file paths, symbols, line ranges, and one-line facts over pasted code.
- Record only task-relevant files and facts. Do not build a global project map.
- Include line ranges whenever possible.
- Include every source file whose API shape, behavior, pattern, command, or test convention influenced the plan.
- Include all files that are planned to be touched or were touched in execution.
- Update the existing code map in revision mode; do not create a parallel map unless the plan path changes.
- Replace stale facts instead of appending contradictory history.

## Consumer Rules

- Read the code map before broad codebase exploration.
- Use it to target which files and line ranges to re-read.
- Do not re-read unrelated neighboring files when the map already cites the relevant convention and the cited source still matches.
- Re-read changed files directly; file-level context can become stale after execution.
- Treat missing or stale map entries as a reason for targeted reads, not as a reason to abandon the map.
