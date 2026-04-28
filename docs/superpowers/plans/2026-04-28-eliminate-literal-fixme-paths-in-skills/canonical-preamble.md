# Canonical Fixme Directory Preamble

This preamble is pasted (verbatim) at the top of every fixme skill SKILL.md (immediately after the frontmatter, before the first `# Title` heading). Skills that are dispatched as sub-agents (have an agent definition in `.claude/agents/`) use the "dispatched" variant. Skills invoked directly by the user use the "standalone" variant. Some skills can be both - they get the combined variant.

## Combined variant (used by skills that can be dispatched OR run standalone)

```markdown
## Fixme Directory

Every `<fixme-dir>` placeholder in this document refers to the resolved fixme directory.

**Resolve `<fixme-dir>` BEFORE any operation:**

- **When dispatched by fixme-task or another orchestrator:** `<fixme-dir>` is provided as `Fixme dir: <absolute-path>` in the `<project>` block of the dispatch prompt. Use that value directly.
- **When running standalone (no orchestrator):** Run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output.

**Never write a literal `.fixme/` path anywhere in this skill's execution.** This rule covers every tool the agent has:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, `[ -e .fixme/... ]`, or any other shell command with a literal `.fixme/` argument
- **Read, Write, Edit:** no path argument starting with `.fixme/`
- **Grep, Glob:** no pattern starting with `.fixme/`

In a multi-root VS Code workspace the actual `.fixme/` directory lives at the parent project root, not at CWD. A literal `.fixme/` path silently resolves to a non-existent or wrong location and the skill creates state in the wrong place. Only `<fixme-dir>` (resolved via the rule above) points to the correct location.

If `fixme-tools.cjs root` cannot run (e.g., the CLI script is missing), STOP and report the failure to the user. Do NOT fall back to literal `.fixme/`.
```

## Standalone-only variant (skills like fixme-config, fixme-session, fixme-ticket that are always user-invoked)

Same as combined variant but the "When dispatched" bullet is omitted, and the standalone bullet becomes:

```markdown
Run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output. This skill is always user-invoked; there is no orchestrator to provide `<fixme-dir>` in a dispatch prompt.
```

## Dispatched-only variant (skills like fixme-handle-plan-review that are only ever dispatched by fixme-task)

Same as combined variant but the "When running standalone" bullet is replaced with:

```markdown
If you find yourself running standalone (no `Fixme dir:` field in your prompt), STOP and ask the orchestrator to dispatch correctly. This skill should not be invoked outside fixme-task.
```
