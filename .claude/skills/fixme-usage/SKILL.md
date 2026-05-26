---
name: fixme-usage
description: Show Fixme token usage reports for the current project or global user usage. Supports overview, recent, per-skill, and per-pipeline views. Delegates parsing and aggregation to fixme-tools.cjs usage report.
allowed-tools: Bash
argument-hint: "[project|global] [recent|skill <name>|pipeline <pipeline-run-id>]"
---

# Fixme Usage

Show token usage recorded by active Fixme skill invocations.

## Fixme Directory

Resolve `<fixme-dir>` before running report commands:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root
```

Use the returned `fixme_dir` value as the current project Fixme directory. Do not use a relative `.fixme/` path.

## Usage Tracking

This skill is instrumented by the generated `## Fixme Usage Tracking` install block like every other active Fixme skill. Do not add separate recording logic here.

## Supported Forms

```text
/fixme-usage
/fixme-usage project
/fixme-usage project recent
/fixme-usage project skill fixme-review-code
/fixme-usage project pipeline <pipeline-run-id>
/fixme-usage global
/fixme-usage global recent
/fixme-usage global skill fixme-review-code
/fixme-usage global pipeline <pipeline-run-id>
/fixme-usage recent
/fixme-usage skill fixme-review-code
/fixme-usage pipeline <pipeline-run-id>
```

## Argument Parsing

Parse `$ARGUMENTS` as whitespace-separated tokens:

1. If the first token is `global`, set `scope = global` and parse the view from the remaining tokens.
2. If the first token is `project`, set `scope = project` and parse the view from the remaining tokens.
3. If the first token is omitted, `recent`, `skill`, or `pipeline`, set `scope = project` and parse the view from all tokens.
4. If no view token remains, use `overview`.
5. For `recent`, set `limit = 20`.
6. For `skill <name>`, require a non-empty skill name and set `--skill <name> --limit 20`.
7. For `pipeline <pipeline-run-id>`, require a non-empty pipeline ID and set `--pipeline-run-id <pipeline-run-id> --limit 20`.
8. For any unknown form, print the supported forms and finish the invocation with `--outcome failed --reason invalid_usage_request`.

## Report Command

Run exactly one report command for the selected view. Always request JSON and render markdown from the returned JSON:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs usage report --scope <project|global> --format json [--limit 20] [--skill <skill-name>] [--pipeline-run-id <pipeline-run-id>]
```

Never parse JSONL directly.

Never inspect runtime transcripts directly.

If `usage report` exits non-zero, print the JSON error, finish this skill with `--outcome failed --reason runtime_error`, and stop.

## Markdown Output

Render one of these markdown reports.

### Overview

```markdown
## Usage Report

**Scope**: project
**Usage file**: /absolute/path/to/events.jsonl

Total usage: 165,000 tokens
Not included in total: 1 invocation with unavailable exact counters

### By Skill
| Skill | Invocations | Complete | Partial | Total usage |
| --- | ---: | ---: | ---: | ---: |
| fixme-write-plan | 2 | 2 | 0 | 42,000 |

### Recent Invocations
| Finished | Skill | Runtime | Status | Total usage |
| --- | --- | --- | --- | ---: |
| 2026-05-26T19:55:01Z | fixme-write-plan | codex | complete | 42,000 |

### Warnings
| Code | Count |
| --- | ---: |
| COUNTERS_UNAVAILABLE | 1 |
```

Omit the `Not included in total` line when the count is zero. Omit `### Warnings` when no warnings exist.

### Recent

Use the same heading and totals as overview, then render only the latest 20 matching `recent[]` rows.

### Skill

Use heading `## Usage Report: <skill-name>`, show filtered total usage and not-included count, then render the latest 20 matching rows and warning summaries.

### Pipeline

Use heading `## Usage Report: <pipeline-run-id>`, show pipeline total usage, orchestrator overhead when present, child usage subtotal, not-included count, child rows by `startedAt` ascending, and warning summaries.

## Output Rules

- Use `Total usage` exactly for numeric totals.
- Show token numbers with comma grouping.
- Show `unavailable` for rows whose `totalTokens` is `null`.
- Do not display `outcomeReason` in markdown reports.
- Include warning summaries for partial rows, duplicate invocation conflicts, corrupt JSONL rows, and trailing partial lines.
- Include the active usage file path from the report JSON.
- Do not display prompt text, response text, tool arguments, tool outputs, file contents, or secrets.
