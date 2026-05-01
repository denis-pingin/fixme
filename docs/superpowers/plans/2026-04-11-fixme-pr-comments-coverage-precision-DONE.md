# fixme-pr-comments: Precision Rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix imprecise analysis output in the fixme-pr-comments skill. Three problems: (1) vague quantifiers ("most", "likely", "~N") and batch dismissals instead of individual verdicts, (2) no universal item IDs - items can't be referenced precisely across sections, (3) summary format doesn't enforce exact accounting.

**Architecture:** All changes to `.claude/skills/fixme-pr-comments/SKILL.md`. Add precision presentation rules, add source-prefixed item IDs to display and analysis formats, update summary format, add notes.

**Tech Stack:** Markdown skill file

---

## Scope

Single file: `.claude/skills/fixme-pr-comments/SKILL.md`

5 edit regions, top-to-bottom.

---

### Task 1: Update frontmatter description

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:3`

- [ ] **Step 1: Update description to mention individual analysis**

Change:
```
description: Fetch unresolved PR comments from review threads, Claude bot, and Greptile, analyze each one, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
```
To:
```
description: Fetch unresolved PR comments from review threads, Claude bot, and Greptile, analyze EVERY comment individually with exact verdicts, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix(fixme-pr-comments): update description to emphasize individual analysis"
```

---

### Task 2: Add source-prefixed item IDs to display and analysis formats

Every comment gets a unique ID assigned at fetch time (Step 1) that persists through analysis (Step 2). IDs are source-prefixed: A1, A2 for review threads; B1, B2 for Claude bot; C1, C2 for Greptile. All sections of the analysis use the same IDs regardless of verdict.

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:207-224` (Step 1 display format)
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:279-331` (Step 2 analysis format)

- [ ] **Step 1: Update Step 1 display format with numbered items**

Change the display template (lines 207-224):

```
#### Display all comments

Display both sources in format:
```
```
## Unresolved Comments ({count} total)

### Review Threads
- @author file.ts#line (thread_id: {id}):
  > comment text

### Claude Bot Review Comments
- [comment_id: {id}] file.ts#line:
  > issue description

### Greptile Summary Findings
- [comment_id: {id}] file.ts#line (source: outside-diff|confidence):
  > issue description
```

To:

```
#### Display all comments

Assign each comment a **source-prefixed ID** at fetch time: A1, A2, ... for review threads;
B1, B2, ... for Claude bot findings; C1, C2, ... for Greptile findings. These IDs are permanent -
they follow the item through analysis and into the final report regardless of verdict.

Display all sources in format:
```
```
## PR Comments ({count} total)

### Review Threads ({count})
- **A1.** @author file.ts#line (thread_id: {id}):
  > comment text
- **A2.** @author file.ts#line (thread_id: {id}):
  > comment text

### Claude Bot Review Comments ({count})
- **B1.** [comment_id: {id}] file.ts#line:
  > issue description

### Greptile Summary Findings ({count})
- **C1.** [comment_id: {id}] file.ts#line (source: outside-diff|confidence):
  > issue description
```

- [ ] **Step 2: Update Step 2 analysis format to use source-prefixed IDs in all sections**

Change the analysis template (lines 279-331). The `## PR Comment Analysis` header and structure stay the same, but every section uses source-prefixed IDs:

Change the "Already Fixed" section (lines 288-291):
```
### Already Fixed (resolve immediately)
{List items confirmed fixed in the current code. For each:}
- **{concrete issue name}** ({N} threads) - Fixed in `{commit_sha}`.
  {One sentence: what was wrong and how it was fixed.}
```
To:
```
### Already Fixed (resolve immediately)
{List items confirmed fixed in the current code. For each:}
- **{ID}. {concrete issue name}** ({N} threads) - Fixed in `{commit_sha}`.
  {One sentence: what was wrong and how it was fixed.}
```

Change the "Not Actionable" section header and item format (lines 293-303):
```
### Not Actionable ({N} items)
{List REJECT_FALSE_POSITIVE, REJECT_WONT_FIX items. For each:}

**{issue name}** [`{category}`]
```
To:
```
### Not Actionable ({N} items)
{List REJECT_FALSE_POSITIVE, REJECT_WONT_FIX items. For each:}

**{ID}. {issue name}** [`{category}`]
```

Change the "Actionable Items" item format (line 309):
```
**{N}. {Issue title}** [`{category}`]
```
To:
```
**{ID}. {Issue title}** [`{category}`]
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix(fixme-pr-comments): add source-prefixed item IDs across all sections"
```

---

### Task 3: Add precision rules to presentation section

Insert two new presentation rules after rule 9. These are the core fix for vague language and batch dismissals.

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md` - insert after line 407 (`say "medium (needs investigation)" rather than guessing.`), before line 409 (`### 2.5. User Consultation`)

- [ ] **Step 1: Insert rules 10 and 11**

Insert after `effort without deeper investigation, say "medium (needs investigation)" rather than guessing.` and before `### 2.5. User Consultation for Ambiguous Fixes`:

```markdown

**10. Absolute precision in all quantification (NON-NEGOTIABLE).**
Never use vague quantifiers: "most", "many", "some", "several", "likely", "probably",
"generally", "appears to", "seems like", or approximate counts ("~65", "around 12").
Every comment must have an explicit, definitive status. Use exact counts. Every number
in the report must be verifiable by counting the items listed.

- BAD: "Most comments were addressed or out of scope."
- GOOD: "12 comments total: 8 fixed (commits abc123, def456), 3 false positives, 1 out of scope."

- BAD: "~65 bot threads - no individual replies needed, most addressed by subsequent commits."
- GOOD: "65 bot threads: 41 fixed (commit abc123 addressed items A1-A30, commit def456
  addressed items A31-A41), 18 false positives (each listed below with reasoning), 6 out
  of scope (each listed below with reasoning)."

- BAD: "The remaining issues are likely already fixed."
- GOOD: "3 remaining issues: A4 confirmed fixed in commit def456 (verified: function
  now returns Result<T>), B7 confirmed fixed in commit ghi789 (verified: null check
  added at line 42), C2 not fixed (still returns raw string at line 88)."

If you cannot determine a definitive status for a comment, the status is "undetermined -
needs investigation". Never hedge with "probably" or "likely" as a substitute for checking.

**11. Every comment gets individual analysis. No batch dismissals.**
Regardless of source, author, or volume - every single comment receives its own verdict
with its own reasoning. These are explicitly forbidden:

- Dismissing a group of comments with a shared rationale ("bot-generated, no replies needed")
- Summarizing N comments as a batch ("65 Copilot threads - mostly style suggestions")
- Skipping analysis because the author is a bot
- Using source or author as a proxy for validity

Being from a bot does not make a comment invalid. Being in a resolved thread does not mean
it was addressed. Being one of many does not exempt it from analysis.

When there are many comments (>20), you MUST still analyze each one individually, but you
MAY group them by verdict in the output. For example: list all 41 that are FIX with their
individual one-line descriptions, then all 18 that are REJECT_FALSE_POSITIVE with their
individual reasons. But the analysis and verdict must be per-comment, and the grouping must
show every item - not "and 15 more similar".
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix(fixme-pr-comments): add precision and individual-analysis presentation rules"
```

---

### Task 4: Update summary format for precision

Strengthen the summary template to mandate exact counts with full accounting.

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:282-284`

- [ ] **Step 1: Update summary template**

Change:
```
{1-2 sentences: how many comments were found across which sources, headline result
summary (N already fixed, N not actionable, N to fix). Gives the reader the full
picture before any details.}
```
To:
```
{EXACT counts with full accounting. Format:
"N comments from M sources (N review threads, N Claude bot findings,
N Greptile findings). Verdict: N to fix, N already fixed, N not actionable
(N false positive, N won't fix), N need user input."
Every comment must be accounted for - the numbers MUST sum to the total. If they
don't, you miscounted - recount before presenting. No vague quantifiers.}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix(fixme-pr-comments): mandate exact counts in summary format"
```

---

### Task 5: Update Notes section and install

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:669-686`

- [ ] **Step 1: Add precision and ID notes**

Insert before the last bullet (`- **fixme-task dispatch**:...`):

```markdown
- **Source-prefixed item IDs**: Every comment gets a permanent ID at fetch time (A1, A2 for review threads; B1, B2 for Claude bot; C1, C2 for Greptile). IDs persist through analysis - the same ID appears in the display, analysis report, and any follow-up references regardless of verdict.
- **Precision is non-negotiable**: Every comment gets an exact verdict. No vague quantifiers (most, likely, ~N). No batch dismissals. All counts must be exact and sum to total. See presentation rules 10-11.
- **Bot comments get individual analysis**: Comments from bots (Copilot, Codex, Claude, Greptile) are analyzed individually, same as human comments. Being bot-generated is not a reason to skip analysis or batch-dismiss.
```

- [ ] **Step 2: Run install.sh**

```bash
./install.sh
```

- [ ] **Step 3: Verify installed skill matches source**

```bash
diff .claude/skills/fixme-pr-comments/SKILL.md ~/.claude/skills/fixme-pr-comments/SKILL.md
```

Expected: no differences.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "fix(fixme-pr-comments): add precision and ID notes, deploy"
```
