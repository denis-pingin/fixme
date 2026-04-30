---
name: fixme-howto-find-fixme-dir
description: Canonical rule for resolving the fixme directory and the prohibition against literal .fixme/ paths. Preloaded into agents via skills frontmatter; referenced by every fixme skill.
---

# Fixme Directory Resolution Rule

Every fixme skill that needs to read or write any file under the fixme directory MUST follow this rule. The placeholder `<fixme-dir>` is used in skill instructions to mean "the resolved fixme directory" - the rules below define how to resolve it and what is forbidden.

## How to resolve `<fixme-dir>`

Resolve it BEFORE any operation that touches the fixme directory.

- **When dispatched by an orchestrator** (fixme-task, fixme-session, fixme-tickets, etc.): the orchestrator passes `Fixme dir: <absolute-path>` in the `<project>` block of the dispatch prompt. Use that value directly. Do NOT re-resolve.
- **When running standalone** (user invoked the skill directly via the Skill tool, with no orchestrator above): run

  ```bash
  node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root
  ```

  and use the `fixme_dir` field from the JSON output. The CLI walks up from the working directory looking for `.fixme/` and handles the multi-root workspace case (where `.fixme/` lives at a parent project root, not at CWD).

If `fixme-tools.cjs root` cannot run (e.g., the script is missing), STOP and report the failure to the user. **Do NOT fall back to a literal `.fixme/` relative path.** Falling back is the exact failure mode this rule exists to prevent.

## What is forbidden

**Never write a literal `.fixme/` path anywhere in the skill's execution.** This rule covers every tool the agent has:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, `[ -e .fixme/... ]`, or any other shell command with a literal `.fixme/` argument.
- **Read, Write, Edit:** no path argument starting with `.fixme/`.
- **Grep, Glob:** no pattern starting with `.fixme/`.

Every actionable path that targets the fixme directory must use the resolved absolute path (substituted from `<fixme-dir>`), never the literal string `.fixme/`.

## Why this matters

In a multi-root VS Code workspace the actual `.fixme/` directory lives at the parent project root, not at CWD. The current working directory of the skill is usually a sub-repo (the code project), so a literal `.fixme/` path silently resolves to a non-existent or wrong location. The skill then either reads nothing (and proceeds as if the file did not exist) or creates a fresh `.fixme/` inside the sub-repo, fragmenting state across the workspace.

`fixme-tools.cjs root` is the only authority on where the fixme directory actually lives. It walks up the filesystem looking for `.fixme/` and respects the `sub_repos` config when a parent fixme directory is shared by multiple sub-projects.

## Documented exception

The `git clean --exclude=<pattern>` command takes a working-tree-relative pattern, not an absolute path. When excluding the fixme directory from git operations, the literal pattern `.fixme/` is the correct value. This is the only place in any fixme skill where literal `.fixme/` is allowed in an actionable command. Run from the resolved `fixme_root` (the parent of `<fixme-dir>`):

```bash
cd <fixme-root>
git clean -fd --exclude=.fixme/
```

The comment above the command should make the exception explicit so the rule remains clear.

## When dispatching sub-agents

Orchestrators that dispatch sub-agents must include the resolved value in the dispatch prompt:

```
<project>
Project root: <absolute-path-to-project>
Fixme dir: <absolute-path-to-fixme-dir>
</project>
```

Sub-agents then use the provided `Fixme dir:` value directly without re-resolving.
