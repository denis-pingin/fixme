# Fixme Howto Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `fixme-howto-code-comments` skill with code comment rules and rename `fixme-decision-presentation` to `fixme-howto-present-decisions`, updating all references.

**Architecture:** Two independent changes. The rename is a directory move + find-and-replace across 6 live files (agent defs, handler skills, orchestrator skills). The new skill is a single SKILL.md creation + adding it to 2 agent definitions via `skills` frontmatter. Both follow the existing pattern established by `fixme-decision-presentation` - reference skills preloaded into agents at dispatch time.

**Tech Stack:** Markdown skill files, YAML frontmatter in agent definitions.

---

### Task 1: Rename fixme-decision-presentation directory to fixme-howto-present-decisions

**Files:**
- Rename: `.claude/skills/fixme-decision-presentation/` -> `.claude/skills/fixme-howto-present-decisions/`
- Modify: `.claude/skills/fixme-howto-present-decisions/SKILL.md` (the `name:` frontmatter field)

- [ ] **Step 1: Move the directory**

```bash
mv .claude/skills/fixme-decision-presentation .claude/skills/fixme-howto-present-decisions
```

- [ ] **Step 2: Update the `name:` field in the SKILL.md frontmatter**

In `.claude/skills/fixme-howto-present-decisions/SKILL.md`, change line 2:

```
name: fixme-decision-presentation
```

to:

```
name: fixme-howto-present-decisions
```

- [ ] **Step 3: Verify**

```bash
ls .claude/skills/fixme-howto-present-decisions/SKILL.md
```

Expected: file exists. Old directory should not exist:

```bash
ls .claude/skills/fixme-decision-presentation/ 2>&1
```

Expected: "No such file or directory"

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-decision-presentation .claude/skills/fixme-howto-present-decisions
git commit -m "rename fixme-decision-presentation to fixme-howto-present-decisions"
```

### Task 2: Update all references from fixme-decision-presentation to fixme-howto-present-decisions

Six files reference the old name. Update each one. The DONE plan docs in `docs/superpowers/plans/` are historical records and must NOT be modified.

**Files:**
- Modify: `.claude/agents/fixme-handle-code-review.md:7` - skills frontmatter
- Modify: `.claude/agents/fixme-handle-plan-review.md:7` - skills frontmatter
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md:61,89` - inline text references
- Modify: `.claude/skills/fixme-handle-code-review/SKILL.md:81,116` - inline text references
- Modify: `.claude/skills/fixme-task/SKILL.md:574` - inline text reference
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:533` - inline text reference

- [ ] **Step 1: Update agent definitions**

In `.claude/agents/fixme-handle-code-review.md`, change:

```
  - fixme-decision-presentation
```

to:

```
  - fixme-howto-present-decisions
```

In `.claude/agents/fixme-handle-plan-review.md`, same change:

```
  - fixme-decision-presentation
```

to:

```
  - fixme-howto-present-decisions
```

- [ ] **Step 2: Update handler skill files**

In `.claude/skills/fixme-handle-plan-review/SKILL.md`, two replacements:

Line 61 - replace `fixme-decision-presentation` with `fixme-howto-present-decisions` in:
```
(per the fixme-decision-presentation format)
```

Line 89 - replace in:
```
**The full guidelines are preloaded from the `fixme-decision-presentation` skill.**
```

In `.claude/skills/fixme-handle-code-review/SKILL.md`, two replacements:

Line 81 - replace `fixme-decision-presentation` with `fixme-howto-present-decisions` in:
```
(per the fixme-decision-presentation format)
```

Line 116 - replace in:
```
**The full guidelines are preloaded from the `fixme-decision-presentation` skill.**
```

- [ ] **Step 3: Update orchestrator skill files**

In `.claude/skills/fixme-task/SKILL.md` line 574, replace:
```
(from the `fixme-decision-presentation` shared skill)
```
with:
```
(from the `fixme-howto-present-decisions` shared skill)
```

In `.claude/skills/fixme-pr-comments/SKILL.md` line 533, replace:
```
**Follow the Decision Presentation Guidelines from the `fixme-decision-presentation` skill** (read it at `~/.claude/skills/fixme-decision-presentation/SKILL.md`).
```
with:
```
**Follow the Decision Presentation Guidelines from the `fixme-howto-present-decisions` skill** (read it at `~/.claude/skills/fixme-howto-present-decisions/SKILL.md`).
```

- [ ] **Step 4: Verify no remaining references to the old name in live code**

```bash
grep -r "fixme-decision-presentation" .claude/ --include="*.md" | grep -v "node_modules"
```

Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/fixme-handle-code-review.md .claude/agents/fixme-handle-plan-review.md .claude/skills/fixme-handle-plan-review/SKILL.md .claude/skills/fixme-handle-code-review/SKILL.md .claude/skills/fixme-task/SKILL.md .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "update all references from fixme-decision-presentation to fixme-howto-present-decisions"
```

### Task 3: Create the fixme-howto-code-comments skill

**Files:**
- Create: `.claude/skills/fixme-howto-code-comments/SKILL.md`

- [ ] **Step 1: Create the skill directory and SKILL.md**

Create `.claude/skills/fixme-howto-code-comments/SKILL.md` with the following content:

```markdown
---
name: fixme-howto-code-comments
description: Rules for writing code comments in generated source code. Bans opaque planning tags, phase references, and forward-references. Preloaded into planner and executor agents via skills frontmatter.
---

# Code Comments Guidelines

These guidelines govern how code comments are written in generated source code (.ts, .tsx, .js, .jsx, and similar). Every skill that writes or modifies code comments MUST follow these rules.

## Three Rules (Non-Negotiable)

### Rule 1: No opaque planning tags

Never write planning-system identifiers into code comments. These tags are meaningless to anyone reading the code without access to the planning session that produced them.

**Banned patterns:**
- Decision tags: `D-1`, `D-2`, `P1`, `P-7`, `T-3`, `F-5`
- Skill/domain tags: `FED-12`, `MOB-3`, `AUT-7`, `BFL-2`, `FOL-1`, `CON-4`, `SEC-8`, `REA-5`, `FIX-3`
- Pitfall references: `Pitfall #3`, `Pitfall 7`
- Plan references: `Plan 24-03`, `Plan 27-04`
- Phase references with 2+ digit numbers: `Phase 24`, `Phase 12`
- Open questions: `Open Question 3`
- Research patterns: `RESEARCH Pattern 5`

**If the reference is load-bearing** (the comment would be meaningless without it), replace the tag with a concrete description of the mechanism, constraint, or rationale it refers to.

Before:
```typescript
// D-7: Use guard pattern here
// See Pitfall #3 for why we clone
// Phase 24 consumer — will be wired in FOL-2
```

After:
```typescript
// Guard pattern: return early when session is expired to avoid cascading null checks downstream
// Clone the config object — mutating the shared instance causes race conditions in concurrent requests
// Consumed by the notification dispatcher in services/notifications/sender.ts
```

### Rule 2: No phase references

Never reference planning phases, plan numbers, or planning-system artifacts as the reason code exists. The code outlives the plan that created it.

Before:
```typescript
// Phase 24 consumer
// Added in Plan 27-04
// Part of the Phase 12 migration
```

After:
```typescript
// Consumed by services/notifications/sender.ts
// Validates webhook signatures before processing (required by Stripe API v2024-06)
// Migrated from the legacy sync adapter in lib/legacy/sync.ts
```

### Rule 3: No forward-references to unfinished work

Never write comments that reference work that "will happen elsewhere" or "will be added later" unless they are actionable TODOs with a ticket reference.

Before:
```typescript
// Will be wired up in the next phase
// The handler for this will be added in FOL-2
// Placeholder — real implementation coming in Phase 25
```

After (if the work exists now):
```typescript
// Handler: src/handlers/webhook.ts:processPayment()
```

After (if the work doesn't exist yet):
```typescript
// TODO(ALP-XXX): Add payment webhook handler
```

## What Good Comments Look Like

Good comments explain **why**, not **what**. They describe constraints, non-obvious decisions, and context that the code alone can't convey.

```typescript
// Rate-limit to 10 req/s per tenant — higher rates trigger 429s from the upstream billing API
const limiter = createRateLimiter({ maxPerSecond: 10 });

// Intentionally not awaited — fire-and-forget analytics that must not block the checkout flow
void trackPurchaseEvent(order);

// Stripe requires idempotency keys for retry safety on payment intents
const key = `pi_${orderId}_${attempt}`;
```

## Applying These Rules

When writing or modifying any code comment:
1. Check: does it contain any banned pattern from Rule 1?
2. Check: does it reference a planning phase, plan number, or planning artifact?
3. Check: does it promise work that doesn't exist yet without a ticket reference?

If any check fails, rewrite the comment to be self-contained — describe the actual mechanism, constraint, or rationale in concrete terms that make sense to a developer reading this file for the first time with no access to planning documents.
```

- [ ] **Step 2: Verify the file was created correctly**

```bash
ls .claude/skills/fixme-howto-code-comments/SKILL.md
```

Expected: file exists.

```bash
head -3 .claude/skills/fixme-howto-code-comments/SKILL.md
```

Expected: frontmatter with `name: fixme-howto-code-comments`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-howto-code-comments/SKILL.md
git commit -m "feat: add fixme-howto-code-comments skill"
```

### Task 4: Add fixme-howto-code-comments to planner and executor agent definitions

**Files:**
- Modify: `.claude/agents/fixme-write-plan.md:6` - add to skills array
- Modify: `.claude/agents/fixme-execute-plan.md:6` - add to skills array

- [ ] **Step 1: Add to fixme-write-plan agent**

In `.claude/agents/fixme-write-plan.md`, change the skills block from:

```yaml
skills:
  - fixme-write-plan
```

to:

```yaml
skills:
  - fixme-write-plan
  - fixme-howto-code-comments
```

- [ ] **Step 2: Add to fixme-execute-plan agent**

In `.claude/agents/fixme-execute-plan.md`, change the skills block from:

```yaml
skills:
  - fixme-execute-plan
```

to:

```yaml
skills:
  - fixme-execute-plan
  - fixme-howto-code-comments
```

- [ ] **Step 3: Verify both agent definitions**

```bash
grep -A2 "^skills:" .claude/agents/fixme-write-plan.md
```

Expected:
```
skills:
  - fixme-write-plan
  - fixme-howto-code-comments
```

```bash
grep -A2 "^skills:" .claude/agents/fixme-execute-plan.md
```

Expected:
```
skills:
  - fixme-execute-plan
  - fixme-howto-code-comments
```

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/fixme-write-plan.md .claude/agents/fixme-execute-plan.md
git commit -m "preload fixme-howto-code-comments into planner and executor agents"
```

### Task 5: Run install.sh and verify

- [ ] **Step 1: Run install**

```bash
./install.sh
```

Expected output should include:
- `Installed fixme-howto-code-comments`
- `Installed fixme-howto-present-decisions`
- NO line for `fixme-decision-presentation` (old name gone)

- [ ] **Step 2: Verify installed files exist**

```bash
ls ~/.claude/skills/fixme-howto-code-comments/SKILL.md
ls ~/.claude/skills/fixme-howto-present-decisions/SKILL.md
```

Expected: both exist.

```bash
ls ~/.claude/skills/fixme-decision-presentation/ 2>&1
```

Expected: directory should still exist from a previous install (install.sh only copies, doesn't clean up old names). This is expected - the old copy is orphaned but harmless since no agent references it.

- [ ] **Step 3: Verify installed agent definitions**

```bash
grep "fixme-howto-code-comments" ~/.claude/agents/fixme-write-plan.md ~/.claude/agents/fixme-execute-plan.md
```

Expected: one match per file.

```bash
grep "fixme-howto-present-decisions" ~/.claude/agents/fixme-handle-code-review.md ~/.claude/agents/fixme-handle-plan-review.md
```

Expected: one match per file.

- [ ] **Step 4: Clean up orphaned old skill from ~/.claude/skills/**

```bash
rm -rf ~/.claude/skills/fixme-decision-presentation
```

## Open Decisions

None. All changes are mechanical renames and a new skill with content specified by the user.
