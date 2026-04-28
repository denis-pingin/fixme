# Eliminate Literal `.fixme/` Paths in Skill Files - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (2026-04-29):** This plan was executed and refactored mid-flight. Mid-execution, the duplication of the canonical preamble across 17 skills was identified as a DRY violation. The original architecture (full preamble inlined in every skill) was replaced with a shared `fixme-howto-find-fixme-dir` skill referenced via `skills:` frontmatter (for sub-agents) or via a 3-line pointer in the SKILL.md body (for top-level skills). See "DRY Refactor" section at the bottom.

**Goal:** Stop agents from running Bash commands and file operations against literal `.fixme/` paths. In multi-root workspaces the actual fixme directory lives at the parent project root, not at CWD - so any literal `.fixme/` reference in a skill instruction is a footgun. Make `<fixme-dir>` the single placeholder used everywhere in skill bodies, and force agents to resolve it via `fixme-tools.cjs root` before any operation.

**Architecture (final, after DRY refactor):**
- One canonical skill (`fixme-howto-find-fixme-dir/SKILL.md`) defines the resolution rule and the prohibition list. Every other fixme skill references it.
- Sub-skills (those with agent definitions in `.claude/agents/`) preload the howto skill via `skills:` frontmatter. The agent has the rule in context automatically.
- Top-level skills (no agent definition - invoked directly via the Skill tool) include a 3-line pointer in their SKILL.md that references the howto file path and embeds the operational essence (resolve via `fixme-tools.cjs root`, never use literal `.fixme/`).
- Body text uses `<fixme-dir>` as the placeholder for the resolved path. The literal string `.fixme/` only appears in (1) frontmatter `description:` for the howto skill itself, (2) prohibition examples inside preambles, (3) the documented `git clean --exclude=.fixme/` exception, (4) generated code (`fixme-tools.cjs`).

**Tech Stack:** Markdown skill files, YAML frontmatter, Node.js CLI (`fixme-tools.cjs`).

---

## DRY Refactor (executed 2026-04-29)

The original plan inlined a 19-line canonical preamble in every skill. Mid-execution this was flagged as massive duplication. The preamble was extracted into a shared `fixme-howto-find-fixme-dir` skill following the existing pattern (`fixme-howto-present-decisions`, `fixme-howto-code-comments`).

### Final layout

- `.claude/skills/fixme-howto-find-fixme-dir/SKILL.md` - the canonical rule, including the resolution algorithm, the full prohibition list, the multi-root rationale, and the `git clean --exclude` documented exception.
- `.claude/agents/*.md` - every sub-agent definition adds `fixme-howto-find-fixme-dir` to its `skills:` frontmatter so the rule is preloaded automatically when the agent runs.
- All other skill SKILL.md files - replaced their full preamble with a 3-line pointer:

  ```markdown
  Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir`. Short version: when dispatched, use the `Fixme dir:` value from the dispatch prompt; standalone, run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root`. Never use a literal `.fixme/` path in any tool.
  ```

- All body content uses `<fixme-dir>/...` placeholders. Literal `.fixme/...` appears only in the howto skill, the documented `git clean` exception, and prohibition examples.

### Net effect

- Lines added (canonical howto skill): ~63
- Lines removed (deduplicated preambles, body refs): ~150
- Net reduction: ~87 lines
- Single source of truth: changes to the rule now happen in one file.

The original task list (Tasks 1-11 below) describes the inlined approach. The actual commits implement the DRY refactor instead. The end state matches the goal stated above.

---

## Original architecture (superseded)

These bullets describe the pre-refactor approach. They are kept for context but the implementation diverges from them.

- Establish `<fixme-dir>` as the canonical placeholder used in all skill instructions, examples, code blocks, and prose. The literal string `.fixme/` is only allowed in (1) frontmatter `description:` (it names the directory concept), (2) the canonical resolution preamble where the convention is being defined, (3) `.gitignore`-style exclusion examples, (4) generated code (`fixme-tools.cjs`).
- Replace the existing per-skill preambles (which currently say "fall back to `.fixme` relative to CWD" - the exact behavior we are trying to prevent) with a single canonical preamble that **forbids** literal `.fixme/` paths and **requires** resolution before any operation. The fallback wording is deleted.
- Add the canonical preamble to skills that lack one (notably `fixme-pr-comments`).
- Strengthen the prohibition list in skills that interact heavily with fixme state (currently fixme-task only forbids `find` and `ls` - extend to cover `test`, `cat`, `mkdir`, `rm`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, and any literal `.fixme/` argument).
- Mechanically replace every body-text `.fixme/<path>` with `<fixme-dir>/<path>` across 17 skill files, 2 agent definitions, and 6 sub-files (docs/agents/references).

**Tech Stack:** Markdown skill files, YAML frontmatter, Node.js CLI (`fixme-tools.cjs`).

---

## File Structure

### Files to be modified (25 total)

**Top-level user-invoked skills (no agent definition - run inline):**
- `.claude/skills/fixme-task/SKILL.md` - orchestrator; strengthen prohibition + replace body refs
- `.claude/skills/fixme-pr-comments/SKILL.md` - **add new preamble** + add hard constraint against `.fixme/`
- `.claude/skills/fixme-session/SKILL.md` - replace body refs
- `.claude/skills/fixme-rebase/SKILL.md` - replace body refs
- `.claude/skills/fixme-ticket/SKILL.md` - replace body refs (9 hits, the most)
- `.claude/skills/fixme-config/SKILL.md` - replace body refs

**Sub-skill files (have agent definitions in `.claude/agents/`):**
- `.claude/skills/fixme-write-plan/SKILL.md` - replace body refs
- `.claude/skills/fixme-execute-plan/SKILL.md` - replace body refs
- `.claude/skills/fixme-review-plan/SKILL.md` - replace body refs
- `.claude/skills/fixme-review-code/SKILL.md` - replace body refs
- `.claude/skills/fixme-handle-plan-review/SKILL.md` - replace body refs
- `.claude/skills/fixme-handle-code-review/SKILL.md` - replace body refs
- `.claude/skills/fixme-investigate/SKILL.md` - replace body refs
- `.claude/skills/fixme-research/SKILL.md` - replace body refs
- `.claude/skills/fixme-browser-verify/SKILL.md` - replace body refs

**Backend skills:**
- `.claude/skills/fixme-tickets/SKILL.md` - replace body refs
- `.claude/skills/fixme-tickets-md/SKILL.md` - replace body refs
- `.claude/skills/fixme-tickets-linear/SKILL.md` - replace body refs

**Agent definitions:**
- `.claude/agents/fixme-task.md` - replace `.fixme/` in role constraints
- `.claude/agents/fixme-write-plan.md` - replace `.fixme/` in role constraints

**Sub-files (docs, agents, references):**
- `.claude/skills/fixme-session/docs/data-flow.md`
- `.claude/skills/fixme-session/agents/intake-agent.md`
- `.claude/skills/fixme-session/agents/investigation-agent.md`
- `.claude/skills/fixme-session/references/config-schema.md`
- `.claude/skills/fixme-tickets-md/references/state-machine.md`
- `.claude/skills/fixme-tickets-md/references/project-context-schema.md`

### Files NOT modified (intentional)

- `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs` - the CLI **must** know the literal `.fixme/` directory name to do its job (`findFixmeRoot` walks the filesystem looking for `.fixme/`). This is the one place where `.fixme/` is correctly used as a literal.
- `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs` - tests for the CLI.
- `CLAUDE.md` (project) - architectural overview; literal `.fixme/` is appropriate when describing the static layout.
- `README.md` - user-facing docs; literal `.fixme/` is fine.
- `install.sh` - shell script; doesn't reference `.fixme/`.
- Frontmatter `description:` fields in skill files - keeps the canonical name visible in skill metadata; the skill body forbids literal usage in instructions.

### What `<fixme-dir>` resolves to

`<fixme-dir>` is the absolute path returned by:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

The CLI returns `{ "fixme_root": "<absolute-path>", "fixme_dir": "<absolute-path>/.fixme" }`. The `fixme_dir` field is the value substituted for `<fixme-dir>` in every skill instruction. When dispatched by `fixme-task`, the dispatch prompt includes `Fixme dir: <absolute-path>/.fixme` in the `<project>` block - the dispatched agent uses that value directly without re-resolving.

---

## Task 1: Define the canonical preamble + prohibition

**Files:**
- Create: `docs/superpowers/plans/2026-04-28-eliminate-literal-fixme-paths-in-skills/canonical-preamble.md` (reference text - referenced by all subsequent tasks; not shipped to users)

**Why this task:** Subsequent tasks paste this exact text into many files. Defining it once here keeps the wording consistent and makes review easier.

- [ ] **Step 1: Write the canonical preamble file**

Create `docs/superpowers/plans/2026-04-28-eliminate-literal-fixme-paths-in-skills/canonical-preamble.md` with the following content:

````markdown
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

Same as combined variant but the "When dispatched" bullet is omitted.

## Dispatched-only variant (skills like fixme-handle-plan-review that are only ever dispatched by fixme-task)

Same as combined variant but the "When running standalone" bullet is replaced with: "If you find yourself running standalone (no `Fixme dir:` field in your prompt), STOP and ask the orchestrator to dispatch correctly. This skill should not be invoked outside fixme-task."
````

- [ ] **Step 2: Verify the file is correctly formatted**

```bash
cat docs/superpowers/plans/2026-04-28-eliminate-literal-fixme-paths-in-skills/canonical-preamble.md | head -30
```

Expected: shows the markdown formatted as above with no encoding issues.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-28-eliminate-literal-fixme-paths-in-skills/canonical-preamble.md
git commit -m "docs(plan): canonical fixme dir preamble reference"
```

---

## Task 2: Strengthen fixme-task SKILL.md (orchestrator)

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md`

**Why this task:** `fixme-task` is the most common entry point for `<fixme-dir>` interactions. Its existing rule (line 35) only forbids `find`/`ls` - the agent in the bug report bypassed it with `test -f`. Replace with the comprehensive prohibition. Also fix the misleading "fall back to `.fixme` relative to CWD" line (line 33) which is the exact behavior we are trying to eliminate.

- [ ] **Step 1: Replace the Fixme Root Resolution section**

Replace lines 25-35 of `.claude/skills/fixme-task/SKILL.md`:

**Old (lines 25-35):**

```markdown
### Fixme Root Resolution (FIRST)

Before anything else - before parsing arguments, before checking the filesystem for plans, before reading config - resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Store `fixme_dir` - use it as the base for ALL `.fixme/` paths in this skill and in dispatch prompts. If the command fails, fall back to `.fixme` relative to CWD.

**Never use `find`, `ls`, or any other filesystem command to look for `.fixme/` before this step.** In multi-root workspaces the `.fixme/` directory lives at the parent project root, not at CWD - only `fixme-tools.cjs root` knows where to find it.
```

**New (replaces same block):**

```markdown
### Fixme Root Resolution (FIRST)

Before anything else - before parsing arguments, before checking the filesystem for plans, before reading config - resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<absolute-path>", "fixme_dir": "<absolute-path>/.fixme" }`. Store the `fixme_dir` value - it is what `<fixme-dir>` refers to throughout this skill, in every dispatch prompt, and in every agent's `<project>` block.

**Never write a literal `.fixme/` path anywhere in this skill's execution.** This rule covers every tool the agent has:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, `[ -e .fixme/... ]`, or any other shell command with a literal `.fixme/` argument
- **Read, Write, Edit:** no path argument starting with `.fixme/`
- **Grep, Glob:** no pattern starting with `.fixme/`

In a multi-root VS Code workspace the actual `.fixme/` directory lives at the parent project root, not at CWD. A literal `.fixme/` path silently resolves to a non-existent or wrong location and the skill creates state in the wrong place. Only `<fixme-dir>` (the value resolved above) points to the correct location.

If `fixme-tools.cjs root` cannot run (e.g., the CLI script is missing), STOP and report the failure to the user. Do NOT fall back to literal `.fixme/`.

When dispatching sub-agents, always include `Fixme dir: <fixme-dir>` in the `<project>` block of the dispatch prompt. Sub-agents do NOT re-resolve - they use the value passed in.
```

- [ ] **Step 2: Replace remaining literal `.fixme/` references in the body**

Two remaining hits in `.claude/skills/fixme-task/SKILL.md`:

**Line 3 (frontmatter description):** keep as-is - this is metadata describing the canonical directory name. Frontmatter `description:` fields are exempt from this refactor.

**Line 33 (the line we already replaced in Step 1):** already done.

Verify with grep that no other body refs remain:

```bash
grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-task/SKILL.md | grep -v "^3:"
```

Expected output: only lines that are part of the new prohibition block (the `find .fixme`, `ls .fixme`, etc. examples) - those are intentional because they teach the agent what the forbidden patterns look like.

- [ ] **Step 3: Update the Bash allowlist (line 187)**

Find this line in `.claude/skills/fixme-task/SKILL.md`:

```markdown
- **Bash** - ONLY `mkdir -p <fixme-dir>/plans` or `mkdir -p <fixme-dir>`, or `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root`
```

Replace with:

```markdown
- **Bash** - ONLY:
  - `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` (the FIRST command, always)
  - `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model <agent-name>` (before each Agent dispatch)
  - `mkdir -p <fixme-dir>` or `mkdir -p <fixme-dir>/plans` (using the resolved path, never literal `.fixme/`)

Any Bash command with a literal `.fixme/` argument is forbidden. The value `<fixme-dir>` must be a substituted absolute path before the command runs.
```

- [ ] **Step 4: Verify with grep**

```bash
grep -c "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-task/SKILL.md
```

Expected: a small number (the frontmatter description + the example forbidden patterns inside the prohibition block). Manually inspect the matches to confirm each is intentional.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "fix(fixme-task): forbid literal .fixme paths and strengthen prohibition"
```

---

## Task 3: Add canonical preamble + hard constraint to fixme-pr-comments

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md`

**Why this task:** This skill triggered the original bug. It currently has zero `.fixme/` references in its body, so the agent had no rule to follow when it decided to pre-write `.fixme/decisions.md`. Add the canonical preamble + a hard constraint that this skill never touches `<fixme-dir>` files at all (that is fixme-task's exclusive responsibility).

- [ ] **Step 1: Insert the canonical preamble after the frontmatter**

Find the frontmatter end (`---` line) at the top of `.claude/skills/fixme-pr-comments/SKILL.md`:

```markdown
---
name: fixme-pr-comments
description: Fetch unresolved PR comments from review threads, Claude bot, Greptile, and regular human issue comments, analyze EVERY comment individually with exact verdicts, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
argument-hint: "[--pause] [--skip-push] [--skip-commit] [--skip-resolve] [--skip-response]"
---

# Address PR Comments
```

Insert (between the closing `---` and the `# Address PR Comments` heading):

```markdown
## Fixme Directory

This skill does not interact with `<fixme-dir>` directly. All pipeline state (decisions log, plans, config, ticket files - anything under the fixme directory) is owned exclusively by `fixme-task` and its sub-skills. This orchestrator's job is limited to:

1. Fetching PR comments
2. Analyzing each comment
3. Consulting the user on ambiguous fixes
4. Invoking `Skill("fixme-task", ...)` with the resolved FIX list as a text argument
5. Verifying, committing, replying to comments, resolving threads

**Never write a literal `.fixme/` path anywhere in this skill's execution.** Forbidden in every tool:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, or any other shell command with a literal `.fixme/` argument
- **Read, Write, Edit:** no path argument starting with `.fixme/`
- **Grep, Glob:** no pattern starting with `.fixme/`

If you find yourself about to read `<fixme-dir>/decisions.md`, write `<fixme-dir>/plans/...`, list `<fixme-dir>`, or check whether `<fixme-dir>/config.json` exists, STOP. That is `fixme-task`'s job. Pass the FIX list as text in the `Skill("fixme-task", args=...)` invocation and let `fixme-task` handle all state.

When `fixme-task`'s SKILL.md says "the orchestrator writes to the decision log", **the orchestrator means `fixme-task` itself**, not the caller of `Skill("fixme-task")`. Reading `fixme-task`'s SKILL.md and concluding "I should pre-write the decision log before dispatching" is a misinterpretation - exactly the failure mode this preamble exists to prevent.
```

- [ ] **Step 2: Add a hard constraint inside the existing Hard Constraints section**

Find the bullet list under `## Hard Constraints` (lines 12-17 in the current file). Insert a new bullet at the end of the list (after the "Inline fix" bullet):

```markdown
- **Never touch `.fixme/` or `<fixme-dir>/` files. Ever.** See the "Fixme Directory" preamble above. The pipeline state is owned exclusively by `fixme-task`. Reading `fixme-task`'s SKILL.md and deciding to "persist resolved decisions before dispatching" is the exact failure mode this constraint prevents - decisions from Step 6 consultation are passed as text inputs to `Skill("fixme-task", args=...)`, never written to disk by this skill.
```

- [ ] **Step 3: Verify with grep**

```bash
grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-pr-comments/SKILL.md
```

Expected: only the example forbidden patterns inside the new preamble + hard constraint (`find .fixme`, `ls .fixme`, etc.). Each match should be inside a "forbidden" enumeration, not an actionable instruction.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix(fixme-pr-comments): forbid touching fixme dir and add resolution preamble"
```

---

## Task 4: Replace preamble in skills that have an existing weaker version

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md` (line 9 only - the existing preamble)
- Modify: `.claude/skills/fixme-execute-plan/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-review-plan/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-review-code/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-handle-code-review/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-investigate/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-research/SKILL.md` (line 9 only)
- Modify: `.claude/skills/fixme-browser-verify/SKILL.md` (line 9 only)

**Why this task:** All nine skills currently share the same one-paragraph preamble that ends with "fall back to `.fixme` relative to CWD" - the exact behavior that caused the bug. Replace with the new combined-variant preamble. This task only touches the preamble; body content is replaced in the next task.

- [ ] **Step 1: Apply the same replacement to each file**

For each file in the list above, find this exact line (it appears as a single line - line 9 in all nine files):

```markdown
All `.fixme/` paths in this document are relative to the fixme root directory. When dispatched by fixme-task, the `Fixme dir` is provided in the `<project>` block of the dispatch prompt - use it as the base for all `.fixme/` paths (e.g., `<fixme-dir>/plans/`, `<fixme-dir>/decisions.md`). When running standalone, resolve by running `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and using the `fixme_dir` field.
```

Replace with the canonical preamble (combined variant from Task 1's reference doc - inlined here for clarity):

```markdown
Every `<fixme-dir>` placeholder in this document refers to the resolved fixme directory.

**Resolve `<fixme-dir>` BEFORE any operation:**

- **When dispatched by fixme-task or another orchestrator:** `<fixme-dir>` is provided as `Fixme dir: <absolute-path>` in the `<project>` block of the dispatch prompt. Use that value directly.
- **When running standalone (no orchestrator):** Run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output.

**Never write a literal `.fixme/` path anywhere in this skill's execution.** Forbidden in every tool:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, or any other shell command with a literal `.fixme/` argument
- **Read, Write, Edit:** no path argument starting with `.fixme/`
- **Grep, Glob:** no pattern starting with `.fixme/`

In a multi-root VS Code workspace the actual `.fixme/` directory lives at the parent project root, not at CWD. A literal `.fixme/` path silently resolves to a non-existent or wrong location and the skill creates state in the wrong place. Only `<fixme-dir>` (resolved above) points to the correct location.

If `fixme-tools.cjs root` cannot run, STOP and report the failure. Do NOT fall back to literal `.fixme/`.
```

The `## Fixme Directory` heading immediately above the line being replaced stays in place.

- [ ] **Step 2: Verify each file's preamble is updated**

For each file, run:

```bash
sed -n '7,30p' .claude/skills/<skill-name>/SKILL.md
```

Expected: shows the new preamble structure with the prohibition list.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-write-plan/SKILL.md \
        .claude/skills/fixme-execute-plan/SKILL.md \
        .claude/skills/fixme-review-plan/SKILL.md \
        .claude/skills/fixme-review-code/SKILL.md \
        .claude/skills/fixme-handle-plan-review/SKILL.md \
        .claude/skills/fixme-handle-code-review/SKILL.md \
        .claude/skills/fixme-investigate/SKILL.md \
        .claude/skills/fixme-research/SKILL.md \
        .claude/skills/fixme-browser-verify/SKILL.md
git commit -m "fix(skills): replace weak preamble with strict prohibition across sub-skills"
```

---

## Task 5: Add canonical preamble to top-level user-invoked skills that lack one

**Files:**
- Modify: `.claude/skills/fixme-session/SKILL.md`
- Modify: `.claude/skills/fixme-rebase/SKILL.md`
- Modify: `.claude/skills/fixme-ticket/SKILL.md`
- Modify: `.claude/skills/fixme-config/SKILL.md`
- Modify: `.claude/skills/fixme-tickets/SKILL.md`
- Modify: `.claude/skills/fixme-tickets-md/SKILL.md`
- Modify: `.claude/skills/fixme-tickets-linear/SKILL.md`

**Why this task:** These skills already have a Fixme Directory section but each uses slightly different language and they all include the misleading fallback line. Replace with the canonical version (combined or standalone variant as appropriate).

- [ ] **Step 1: fixme-session/SKILL.md - replace existing Fixme Directory section**

Find the existing Fixme Directory section (lines 11-22 approximately - it currently begins with "## Fixme Root Resolution" or similar). Replace the entire section with the standalone variant:

```markdown
## Fixme Directory

Every `<fixme-dir>` placeholder in this document refers to the resolved fixme directory.

**Resolve `<fixme-dir>` BEFORE any operation:**

Run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output. This skill is always user-invoked; there is no orchestrator to provide `<fixme-dir>` in a dispatch prompt.

**Never write a literal `.fixme/` path anywhere in this skill's execution.** Forbidden in every tool:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, or any other shell command with a literal `.fixme/` argument
- **Read, Write, Edit:** no path argument starting with `.fixme/`
- **Grep, Glob:** no pattern starting with `.fixme/`

In a multi-root VS Code workspace the actual `.fixme/` directory lives at the parent project root, not at CWD. A literal `.fixme/` path silently resolves to a non-existent or wrong location and the skill creates state in the wrong place. Only `<fixme-dir>` (resolved above) points to the correct location.

If `fixme-tools.cjs root` cannot run, STOP and report the failure. Do NOT fall back to literal `.fixme/`.

**Ticket operations always go through the fixme-tickets abstraction skill.** Never hardcode a backend path. Always dispatch to fixme-tickets, which reads `ticketBackend` from `<fixme-dir>/config.json` and routes to the correct backend.
```

- [ ] **Step 2: Apply the same standalone variant to fixme-rebase, fixme-ticket, fixme-config, fixme-tickets, fixme-tickets-md, fixme-tickets-linear**

For each remaining file:
1. Find the existing Fixme Directory / Fixme Root Resolution section
2. Replace it with the standalone variant from Step 1 (omitting the trailing fixme-tickets-specific paragraph - that one stays only in fixme-session)

For `fixme-tickets-md/SKILL.md`, adapt the preamble to acknowledge that the skill receives `<fixme-dir>` either via the dispatch prompt (when called by fixme-tickets) or via direct CLI invocation. Use the combined variant.

- [ ] **Step 3: Verify each file**

```bash
for skill in fixme-session fixme-rebase fixme-ticket fixme-config fixme-tickets fixme-tickets-md fixme-tickets-linear; do
  echo "=== $skill ==="
  grep -A 2 "## Fixme Directory" /Users/denis/projects/denis/ai/fixme/.claude/skills/$skill/SKILL.md | head -5
done
```

Expected: each shows the canonical heading + first line of the new preamble.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-session/SKILL.md \
        .claude/skills/fixme-rebase/SKILL.md \
        .claude/skills/fixme-ticket/SKILL.md \
        .claude/skills/fixme-config/SKILL.md \
        .claude/skills/fixme-tickets/SKILL.md \
        .claude/skills/fixme-tickets-md/SKILL.md \
        .claude/skills/fixme-tickets-linear/SKILL.md
git commit -m "fix(skills): canonical preamble for top-level user-invoked skills"
```

---

## Task 6: Replace literal `.fixme/<path>` in fixme-task body content

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md`

**Why this task:** Task 2 fixed the preamble. Body content still has `.fixme/` references in code examples and prose. Sweep them all.

- [ ] **Step 1: Find all body references**

```bash
grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-task/SKILL.md
```

Each hit (except the frontmatter description on line 3 and the prohibition examples in the preamble) needs to be replaced.

- [ ] **Step 2: Apply mechanical replacement**

For each remaining body hit, replace `.fixme/<rest>` with `<fixme-dir>/<rest>`. Specific known hits:

- `.fixme/config.json` → `<fixme-dir>/config.json`
- `.fixme/plans/` → `<fixme-dir>/plans/`
- `.fixme/decisions.md` → `<fixme-dir>/decisions.md`
- `.fixme/sessions/` → `<fixme-dir>/sessions/`

Do NOT modify hits that are inside the prohibition block (the `find .fixme`, `ls .fixme`, `test -f .fixme/...` examples). Those examples need the literal form to be intelligible as forbidden patterns.

- [ ] **Step 3: Verify**

```bash
grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-task/SKILL.md
```

Expected matches:
- Line 3 (frontmatter description) - exempt
- Lines inside the prohibition block (the `find .fixme`, `ls .fixme`, etc. examples) - intentional

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "fix(fixme-task): replace literal .fixme paths in body with <fixme-dir>"
```

---

## Task 7: Replace literal `.fixme/<path>` in remaining sub-skills

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md` (5 hits)
- Modify: `.claude/skills/fixme-execute-plan/SKILL.md` (1 hit)
- Modify: `.claude/skills/fixme-review-plan/SKILL.md` (2 hits)
- Modify: `.claude/skills/fixme-review-code/SKILL.md` (1 hit)
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md` (1 hit)
- Modify: `.claude/skills/fixme-handle-code-review/SKILL.md` (1 hit)
- Modify: `.claude/skills/fixme-investigate/SKILL.md` (5 hits)
- Modify: `.claude/skills/fixme-research/SKILL.md` (2 hits)
- Modify: `.claude/skills/fixme-browser-verify/SKILL.md` (1 hit)

**Why this task:** Task 4 replaced the preamble for these. Body content still has literal references that need to become `<fixme-dir>/` placeholders.

- [ ] **Step 1: Apply mechanical replacement to each file**

For each file:

```bash
# List all body hits
grep -n "\.fixme/" .claude/skills/<skill-name>/SKILL.md
```

For each hit (except those inside the new preamble's prohibition examples), replace `.fixme/<rest>` with `<fixme-dir>/<rest>`. Common patterns:

- `.fixme/config.json` → `<fixme-dir>/config.json`
- `.fixme/plans/` → `<fixme-dir>/plans/`
- `.fixme/decisions.md` → `<fixme-dir>/decisions.md`
- `.fixme/investigations/` → `<fixme-dir>/investigations/`
- `.fixme/sessions/` → `<fixme-dir>/sessions/`

For `fixme-write-plan/SKILL.md` line 266 (the long paragraph about saving the plan), the existing wording already references `<fixme-dir>` correctly but also says "from the `Fixme dir` field in the dispatch prompt". Update the paragraph to match the new preamble structure - the resolution mechanism is now defined upfront in the preamble, so the body text only needs `Save to `<fixme-dir>/plans/<date>-<feature-name>.md`. Use ISO date format: `YYYY-MM-DD`.`

For `fixme-investigate/SKILL.md` lines 198-220 (the example walkthrough), update the example paths to `<fixme-dir>/investigations/login-button/...` instead of `.fixme/investigations/login-button/...`. Note: this is example output from a `playwright-cli screenshot` command. The agent running the example should substitute the actual `<fixme-dir>` value.

- [ ] **Step 2: Verify each file**

```bash
for skill in fixme-write-plan fixme-execute-plan fixme-review-plan fixme-review-code fixme-handle-plan-review fixme-handle-code-review fixme-investigate fixme-research fixme-browser-verify; do
  echo "=== $skill ==="
  grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/$skill/SKILL.md
done
```

Expected output: each file shows only matches inside prohibition blocks. No actionable `.fixme/<path>` references in instructions.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-write-plan/SKILL.md \
        .claude/skills/fixme-execute-plan/SKILL.md \
        .claude/skills/fixme-review-plan/SKILL.md \
        .claude/skills/fixme-review-code/SKILL.md \
        .claude/skills/fixme-handle-plan-review/SKILL.md \
        .claude/skills/fixme-handle-code-review/SKILL.md \
        .claude/skills/fixme-investigate/SKILL.md \
        .claude/skills/fixme-research/SKILL.md \
        .claude/skills/fixme-browser-verify/SKILL.md
git commit -m "fix(skills): replace literal .fixme paths in sub-skill bodies with <fixme-dir>"
```

---

## Task 8: Replace literal `.fixme/<path>` in top-level skills' bodies

**Files:**
- Modify: `.claude/skills/fixme-session/SKILL.md` (5 hits)
- Modify: `.claude/skills/fixme-rebase/SKILL.md` (5 hits, including a Bash variable assignment on line 260)
- Modify: `.claude/skills/fixme-ticket/SKILL.md` (9 hits)
- Modify: `.claude/skills/fixme-config/SKILL.md` (4 hits)
- Modify: `.claude/skills/fixme-tickets/SKILL.md` (6 hits)
- Modify: `.claude/skills/fixme-tickets-md/SKILL.md` (2 hits)
- Modify: `.claude/skills/fixme-tickets-linear/SKILL.md` (1 hit)

**Why this task:** Task 5 fixed preambles for these. Body content has the most hits across the codebase - especially `fixme-ticket` (9 hits, mostly `.fixme/config.json` references in prose).

- [ ] **Step 1: fixme-session/SKILL.md**

Body hits to fix:

- Line 22: `**All ticket operations go through the fixme-tickets abstraction skill.** Never hardcode a backend path. Always dispatch to fixme-tickets, which reads `ticketBackend` from `.fixme/config.json` and routes to the correct backend.` → change `.fixme/config.json` to `<fixme-dir>/config.json`. (Note: this exact text is duplicated in the new preamble from Task 5 - delete the duplicate here.)
- Line 205: `Read `.fixme/config.json` to determine which pipeline...` → `Read `<fixme-dir>/config.json` to determine which pipeline...`
- Line 283: `- Config: .fixme/config.json` → `- Config: <fixme-dir>/config.json`
- Line 339: `git clean -fd --exclude=.fixme/` - **special case**: this is a real git command that needs the literal directory name to actually exclude the directory. Replace with: `git clean -fd --exclude=<fixme-dir>` and add a code comment above it: `# <fixme-dir> here is substituted with the resolved absolute path; git accepts absolute paths for --exclude when run from the project root`.

  Wait - re-read the actual line. `git clean --exclude` takes a relative pattern, not an absolute path. For this one Bash command we DO need the literal `.fixme/` because git operates on the working tree. Document this exception:

  Replace line 339 with:
  ```bash
  # Exception: `git clean --exclude` takes a working-tree-relative pattern.
  # Run from <fixme-root> (the parent of <fixme-dir>) and use the literal
  # directory name `.fixme/` for the exclusion pattern. This is the ONLY
  # place in this skill where literal `.fixme/` is correct.
  cd <fixme-root>
  git clean -fd --exclude=.fixme/
  ```

  The `<fixme-root>` value is the `fixme_root` field from the same `fixme-tools.cjs root` JSON output (as opposed to `fixme_dir`).

- [ ] **Step 2: fixme-rebase/SKILL.md**

Body hits to fix:

- Line 48: `**Check `.fixme/config.json`** for...` → `**Check `<fixme-dir>/config.json`** for...`
- Line 260: `REBASE_DIR=".fixme/rebase/$(date -u ...)"` - **shell variable assignment**. Replace with: `REBASE_DIR="<fixme-dir>/rebase/$(date -u +%Y%m%dT%H%M%SZ)-$(git branch --show-current)-$(echo <BASE_BRANCH> | tr '/' '-')"`. The agent must substitute `<fixme-dir>` with the actual absolute path before running this assignment.
- Line 734: `**First**, check `.fixme/config.json`...` → `**First**, check `<fixme-dir>/config.json`...`

- [ ] **Step 3: fixme-ticket/SKILL.md**

Body hits to fix (9 total):

- Line 39: `| `--template <name>` | Use a named template from `.fixme/config.json` |` → `| `--template <name>` | Use a named template from `<fixme-dir>/config.json` |`
- Line 66, 68, 71, 77, 79, 126, 306: similar substitution from `.fixme/config.json` to `<fixme-dir>/config.json`

The substitution is mechanical - one find-replace operation across the file (excluding the preamble's prohibition examples).

- [ ] **Step 4: fixme-config/SKILL.md**

Body hits to fix:

- Line 24: `Updates `.fixme/config.json`.` → `Updates `<fixme-dir>/config.json`.`
- Line 104: `description: "Local markdown files in .fixme/sessions/"` - this is text inside a TypeScript-like AskUserQuestion config object that gets shown to the user. Replace with: `description: "Local markdown files in the fixme sessions directory"` (rephrase to avoid the literal path entirely - the user doesn't need to see implementation details).

- [ ] **Step 5: fixme-tickets/SKILL.md**

Body hits to fix:

- Line 19: `The backend is determined by the `ticketBackend` field in `.fixme/config.json`.` → `... in `<fixme-dir>/config.json`.`
- Line 56: `| `context load` | _(none)_ | Load project config from `.fixme/config.json` |` → `... from `<fixme-dir>/config.json` |`
- Line 57: `| `context save` | `--data '<json>'` | Save project config to `.fixme/config.json` (merges into existing config) |` → `... to `<fixme-dir>/config.json` ...`
- Line 82: `1. Read .fixme/config.json -> ticketBackend: "fixme-tickets-md"` → `1. Read <fixme-dir>/config.json -> ticketBackend: "fixme-tickets-md"`

- [ ] **Step 6: fixme-tickets-md/SKILL.md**

Body hits to fix:

- Line 9 (preamble): already replaced in Task 5
- Line 119: `Reads `.fixme/config.json`...` → `Reads `<fixme-dir>/config.json`...`
- Line 127: `Writes the provided JSON data to the project section of `.fixme/config.json`...` → `... of `<fixme-dir>/config.json`...`

- [ ] **Step 7: fixme-tickets-linear/SKILL.md**

Body hit to fix:

- Line 45: `A local mapping file (`.fixme/linear-mapping.json`) will track...` → `A local mapping file (`<fixme-dir>/linear-mapping.json`) will track...`

- [ ] **Step 8: Verify each file**

```bash
for skill in fixme-session fixme-rebase fixme-ticket fixme-config fixme-tickets fixme-tickets-md fixme-tickets-linear; do
  echo "=== $skill ==="
  grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/$skill/SKILL.md
done
```

Expected: matches only inside prohibition examples + the documented `git clean --exclude=.fixme/` exception in fixme-session.

- [ ] **Step 9: Commit**

```bash
git add .claude/skills/fixme-session/SKILL.md \
        .claude/skills/fixme-rebase/SKILL.md \
        .claude/skills/fixme-ticket/SKILL.md \
        .claude/skills/fixme-config/SKILL.md \
        .claude/skills/fixme-tickets/SKILL.md \
        .claude/skills/fixme-tickets-md/SKILL.md \
        .claude/skills/fixme-tickets-linear/SKILL.md
git commit -m "fix(skills): replace literal .fixme paths in top-level skills with <fixme-dir>"
```

---

## Task 9: Update agent definitions

**Files:**
- Modify: `.claude/agents/fixme-task.md` (3 hits)
- Modify: `.claude/agents/fixme-write-plan.md` (1 hit, possibly 2)

**Why this task:** Agent definitions in `.claude/agents/` set role constraints at the system level. They are loaded for every dispatched sub-agent. The constraints in these files reference literal `.fixme/` and need the same treatment.

- [ ] **Step 1: fixme-task.md**

Three body hits:

- Line 16: `- NEVER use Read on source code files (only .fixme/config.json, .fixme/plans/*.md, .fixme/decisions.md)` → `- NEVER use Read on source code files (only <fixme-dir>/config.json, <fixme-dir>/plans/*.md, <fixme-dir>/decisions.md). The agent receives the resolved <fixme-dir> from the orchestrator's dispatch or resolves it via fixme-tools.cjs root.`
- Line 24: `Resolve model from `.fixme/config.json` models section...` → `Resolve model from `<fixme-dir>/config.json` models section...`

- [ ] **Step 2: fixme-write-plan.md**

Two body hits:

- Line 15: `Your job: Explore the codebase, understand the task, write a complete plan to .fixme/plans/, and output the plan path.` → `Your job: Explore the codebase, understand the task, write a complete plan to <fixme-dir>/plans/, and output the plan path. Resolve <fixme-dir> from the dispatch prompt's `Fixme dir:` field or via fixme-tools.cjs root if running standalone.`
- Line 19: `- NEVER use Write on source code files - only .fixme/plans/*.md` → `- NEVER use Write on source code files - only <fixme-dir>/plans/*.md`

- [ ] **Step 3: Verify**

```bash
grep -n "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/agents/fixme-task.md /Users/denis/projects/denis/ai/fixme/.claude/agents/fixme-write-plan.md
```

Expected: no hits remaining.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/fixme-task.md .claude/agents/fixme-write-plan.md
git commit -m "fix(agents): use <fixme-dir> placeholder in agent role constraints"
```

---

## Task 10: Update sub-files (docs, agents, references)

**Files:**
- Modify: `.claude/skills/fixme-session/docs/data-flow.md` (6 hits)
- Modify: `.claude/skills/fixme-session/agents/intake-agent.md` (2 hits)
- Modify: `.claude/skills/fixme-session/agents/investigation-agent.md` (3 hits)
- Modify: `.claude/skills/fixme-session/references/config-schema.md` (1 hit)
- Modify: `.claude/skills/fixme-tickets-md/references/state-machine.md` (1 hit)
- Modify: `.claude/skills/fixme-tickets-md/references/project-context-schema.md` (1 hit)

**Why this task:** Reference docs and per-skill internal agent definitions also contain literal `.fixme/`. These docs are read inline when their parent skill loads, so they have the same risk.

- [ ] **Step 1: fixme-session/docs/data-flow.md (6 hits)**

Mechanical substitution of `.fixme/<rest>` → `<fixme-dir>/<rest>` for the lines: 63, 137, 182, 368, 404, 405. All are descriptive prose or diagram labels. Apply substitution and add a one-paragraph note at the top of the doc:

```markdown
> **Note:** All `<fixme-dir>` references below resolve to the absolute path returned by `fixme-tools.cjs root`. See the parent skill's preamble for resolution rules.
```

- [ ] **Step 2: fixme-session/agents/intake-agent.md (2 hits)**

Lines 91, 93: example ticket paths starting with `.fixme/sessions/...`. Replace with `<fixme-dir>/sessions/...`.

- [ ] **Step 3: fixme-session/agents/investigation-agent.md (3 hits)**

Lines 19, 20, 31: replace `.fixme/<rest>` → `<fixme-dir>/<rest>`.

- [ ] **Step 4: fixme-session/references/config-schema.md (1 hit)**

Line 5: `**File:** `.fixme/config.json`` → `**File:** `<fixme-dir>/config.json``.

- [ ] **Step 5: fixme-tickets-md/references/state-machine.md (1 hit)**

Line 50: `loads the named pipeline from `.fixme/config.json`` → `... from `<fixme-dir>/config.json``.

- [ ] **Step 6: fixme-tickets-md/references/project-context-schema.md (1 hit)**

Line 3: `Project context is now stored in `.fixme/config.json` under the `project` key.` → `... stored in `<fixme-dir>/config.json` under the `project` key.`

- [ ] **Step 7: Verify**

```bash
grep -rn "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-session/docs/ /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-session/agents/ /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-session/references/ /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/references/
```

Expected: no actionable `.fixme/<path>` references. Any remaining hits should only be inside fenced code blocks demonstrating forbidden patterns.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/fixme-session/docs/data-flow.md \
        .claude/skills/fixme-session/agents/intake-agent.md \
        .claude/skills/fixme-session/agents/investigation-agent.md \
        .claude/skills/fixme-session/references/config-schema.md \
        .claude/skills/fixme-tickets-md/references/state-machine.md \
        .claude/skills/fixme-tickets-md/references/project-context-schema.md
git commit -m "fix(refs): replace literal .fixme paths in sub-files with <fixme-dir>"
```

---

## Task 11: Audit and final verification

**Files:**
- No modifications. Verification only.

**Why this task:** After the mechanical replacements, run a comprehensive grep across the entire `.claude/` tree. Any remaining `.fixme/` references should be either (a) inside a frontmatter `description:` field, (b) inside the prohibition block of a preamble (showing forbidden patterns), or (c) the documented `git clean --exclude` exception in `fixme-session/SKILL.md`. Anything else is a bug.

- [ ] **Step 1: Full grep audit**

```bash
grep -rn "\.fixme/" /Users/denis/projects/denis/ai/fixme/.claude/ 2>/dev/null | grep -v "scripts/fixme-tools" | grep -v "\.test\.cjs"
```

For each line in the output, verify it falls in one of the allowed categories:

1. **Frontmatter `description:`** - line starts with `description:` and is in YAML frontmatter
2. **Prohibition example** - line is inside a `Forbidden in every tool:` block, listing patterns like `find .fixme`, `ls .fixme`, etc.
3. **Documented exception** - the `git clean --exclude=.fixme/` line in fixme-session/SKILL.md, which has an explanatory comment above it

Document the audit result. If the count is non-trivial, save it to `docs/superpowers/plans/2026-04-28-eliminate-literal-fixme-paths-in-skills/audit-result.txt`.

- [ ] **Step 2: Categorize each remaining hit**

For each line in the audit output, manually verify it is intentional. Add a comment in the audit-result.txt file next to each line explaining why it stays:

```
.claude/skills/fixme-task/SKILL.md:3:description: ... .fixme/config.json ...   [frontmatter description - exempt]
.claude/skills/fixme-task/SKILL.md:N:- **Bash:** no `find .fixme`, `ls .fixme`, ... [prohibition example - intentional]
.claude/skills/fixme-session/SKILL.md:N:git clean -fd --exclude=.fixme/             [documented exception - intentional]
```

If any line cannot be categorized as intentional, return to the appropriate task and fix the omission.

- [ ] **Step 3: Run the existing fixme-tools test suite**

```bash
node /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
```

Expected: all tests pass. The CLI is unchanged, so this is a regression check that no change accidentally touched the script.

- [ ] **Step 4: Run install.sh in dry-run mode (visual inspection)**

```bash
cat /Users/denis/projects/denis/ai/fixme/install.sh
```

Verify the install script copies the modified skill files. No changes expected.

- [ ] **Step 5: Run install.sh for real**

```bash
cd /Users/denis/projects/denis/ai/fixme && ./install.sh
```

Expected: all fixme skills are copied to `~/.claude/skills/`. No errors.

- [ ] **Step 6: Sanity check - dispatch fixme-task standalone**

Open a new conversation context (or use a worktree) and run:

```
Skill("fixme-task", args="default Add a comment to README.md saying 'foo'")
```

Verify the agent:
1. Resolves `<fixme-dir>` via `fixme-tools.cjs root` BEFORE any other operation
2. Does NOT use literal `.fixme/` in any Bash command
3. Stores plans/decisions at the resolved path

- [ ] **Step 7: Commit the audit result (if any)**

```bash
git add docs/superpowers/plans/2026-04-28-eliminate-literal-fixme-paths-in-skills/audit-result.txt 2>/dev/null || true
git commit -m "docs(audit): final audit of literal .fixme references" --allow-empty
```

---

## Self-Review Checklist

After completing all tasks:

- [ ] **Spec coverage:** Every file listed in the File Structure section has a corresponding task. The 17 skill files, 2 agent definitions, and 6 sub-files are all covered.
- [ ] **Placeholder scan:** No "TBD", "TODO", or "implement later" tokens in this plan. All replacements are spelled out with old-string and new-string.
- [ ] **Type consistency:** The placeholder name is `<fixme-dir>` everywhere (not `<fixme_dir>`, not `$FIXME_DIR`, not `${fixmeDir}`). Task 1's canonical preamble fixes the wording in one place; subsequent tasks reuse it.
- [ ] **Bash exception documented:** The `git clean --exclude=.fixme/` case in fixme-session is the only intentional literal `.fixme/` outside a description or prohibition block. Task 8 Step 1 documents it explicitly.
- [ ] **No silent fallback:** The old preamble's "fall back to `.fixme` relative to CWD" wording is deleted from every skill. The new preamble says "STOP and report" instead.
- [ ] **fixme-pr-comments hard constraint:** Task 3 adds an explicit "never touch `<fixme-dir>`" constraint, addressing the original bug's root cause.

## Out of Scope

- Changing `fixme-tools.cjs` itself - the CLI must know the literal `.fixme/` directory name to find it.
- Updating user-facing docs (`README.md`, project `CLAUDE.md`) - these describe the static layout and using `.fixme/` literally is appropriate.
- Adding new features. This refactor is purely about path-resolution discipline.
- Adding automated tests for skill instruction adherence (would require an instrumented agent harness - separate effort).
