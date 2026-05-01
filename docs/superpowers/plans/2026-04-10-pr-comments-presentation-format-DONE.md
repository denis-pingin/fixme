# PR Comments Presentation Format Improvement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the fixme-pr-comments categorization presentation format so it follows CLAUDE.md guidelines for top-down progressive disclosure, tradeoff transparency, and behavioral (not mechanical) descriptions.

**Architecture:** Single-file edit to `.claude/skills/fixme-pr-comments/SKILL.md`. Three sections need updating: the categorization template (lines 279-306), the Not Actionable format, and the Presentation Rules examples. No new files, no test changes - this is a skill instruction document.

**Tech Stack:** Markdown (skill definition)

---

### Task 1: Update the Actionable Items template

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:279-306`

The current Actionable Items template has these fields: Context, Problem, Impact, Fix, Files, Threads. It's missing three things from the analysis:

1. **"What was reported"** - separates the reviewer's claim from the analysis finding. The reader needs to know the input to evaluate whether the analysis is correct.
2. **"Impact if not fixed"** - current "Impact" describes the bug itself. The reader needs the cost of inaction to prioritize.
3. **"Effort"** - low/medium/high signal for prioritization.

Also, "Fix" should be renamed to "Recommended fix" to signal that it's a recommendation the reader can evaluate, not a diktat.

- [ ] **Step 1: Replace the Actionable Items template block**

In `.claude/skills/fixme-pr-comments/SKILL.md`, replace the template block at lines 290-305 (from `### Actionable Items` through the closing of the repeated fields) with:

```markdown
### Actionable Items ({N} distinct issues)

{For each deduplicated issue, present ALL of these fields:}

**{N}. {Issue title}** [`{category}`]
- **What was reported**: {What the reviewer flagged - their exact concern, which file/line
  they pointed at, what they suggested. The reader needs to know the input before evaluating
  the analysis.}
- **Context**: {What area of the codebase this touches and what it does. The reader must
  understand the domain before evaluating the problem. Name the feature, subsystem, or flow
  this code belongs to, and what role the affected file/function plays in it.}
- **What's actually happening**: {Your independent analysis of the code. What the code does,
  why it's wrong, how you verified. May confirm the reviewer's concern, refine it, or identify
  a different root cause. Describe as behavior, not code mechanics.}
- **Impact if not fixed**: {What breaks, degrades, or is at risk. User-visible or system-visible
  consequences. Include severity signal: is this causing failures now, or is it a latent risk
  under specific conditions?}
- **Recommended fix**: {Describe the resulting behavior so the reader can independently judge
  whether the fix is correct. For non-trivial fixes, explain why this approach over alternatives.
  For FIX_UNCLEAR: "Requires approach decision - see below."
  For ASK_USER: "Requires validity determination - see below."}
- **Effort**: {low | medium | high}
- **Files**: {[file.ts:line](/absolute/path/file.ts#Lline), [file2.ts:line](/absolute/path/file2.ts#Lline)}
- **Threads**: {N} ({list source names: reviewer-login, claude, greptile})

{Repeat for every actionable item.}
```

- [ ] **Step 2: Verify the edit**

Read `.claude/skills/fixme-pr-comments/SKILL.md` lines 288-310 and confirm the new template is in place with all seven fields: What was reported, Context, What's actually happening, Impact if not fixed, Recommended fix, Effort, Files, Threads.

### Task 2: Update the Not Actionable template

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:285-289`

The current Not Actionable format is a one-liner per item. This violates CLAUDE.md's "Define before you reference" and "Name the tradeoffs" rules. The reader can't evaluate whether a dismissal is correct without understanding what was reported and why it doesn't apply.

- [ ] **Step 1: Replace the Not Actionable template block**

In `.claude/skills/fixme-pr-comments/SKILL.md`, replace the Not Actionable section (lines 285-288, from `### Not Actionable` through the one-line format) with:

```markdown
### Not Actionable ({N} items)
{List REJECT_FALSE_POSITIVE, REJECT_WONT_FIX items. For each:}

**{issue name}** [`{category}`]
- **What was reported**: {What the reviewer flagged and why they think it's a problem.
  Establish what code area this is about - the reader needs domain context to evaluate
  the dismissal.}
- **Why this is not an issue**: {For FALSE_POSITIVE: what the code actually does and why
  the reviewer's concern doesn't apply. For WONT_FIX: what the actual risk is, why it's
  acceptable now, and when/where it should be addressed (if ever). Be specific - name the
  code construct and explain the behavior.}
```

- [ ] **Step 2: Verify the edit**

Read `.claude/skills/fixme-pr-comments/SKILL.md` lines 285-298 and confirm the new Not Actionable template has both fields: What was reported, Why this is not an issue.

### Task 3: Add a summary header to the categorization output

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:279`

The current output jumps straight into "Already Fixed" with no orientation. CLAUDE.md requires "Lead with the problem/subject - one sentence stating what this is about."

- [ ] **Step 1: Add summary header before "Already Fixed"**

In `.claude/skills/fixme-pr-comments/SKILL.md`, insert a summary header at the start of the template block (line 279, right after the opening triple-backtick):

```markdown
## PR Comment Analysis

{1-2 sentences: how many comments were found across which sources, headline result
summary (N already fixed, N not actionable, N to fix). Gives the reader the full
picture before any details.}

---
```

This goes before the existing `### Already Fixed` section.

- [ ] **Step 2: Verify the edit**

Read `.claude/skills/fixme-pr-comments/SKILL.md` lines 279-290 and confirm the summary header is present before "Already Fixed".

### Task 4: Update Presentation Rules to cover new fields

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md:308-358`

The existing 7 presentation rules are good but need two additions to cover the new fields, and Rule 4 needs a stronger example that matches the "Recommended fix" rename.

- [ ] **Step 1: Update Rule 4 examples to match "Recommended fix" field name**

In `.claude/skills/fixme-pr-comments/SKILL.md`, find Rule 4 ("Make planned fixes self-evident, not assertive") and update the field name reference. The rule text itself is fine - just ensure the BAD/GOOD examples use "Recommended fix" framing. Current examples already demonstrate the right principle, no text change needed here. Confirm by reading.

- [ ] **Step 2: Add Rule 8 for "What was reported" field**

After Rule 7 ("No hedging without specifics"), add:

```markdown
**8. Separate what was reported from what you found.**
The "What was reported" field presents the reviewer's claim. "What's actually happening" (or
"Why this is not an issue") presents your independent analysis. Never blend the two - the reader
needs to see both to judge whether your analysis actually addresses the reviewer's concern.

- BAD (blended): "The reviewer noted that JSON.parse is unsafe, and indeed the schema should
  handle deserialization."
- GOOD (separated): What was reported: "Reviewer flagged raw JSON.parse at the R2 boundary,
  noting this PR replaced 9 other occurrences with schema-based parsing." What's actually
  happening: "When R2 returns malformed JSON, the handler throws a raw SyntaxError. The
  schema-based alternative would produce a typed validation error with the field path that
  failed, making error monitoring actionable."
```

- [ ] **Step 3: Add Rule 9 for effort estimation**

After the new Rule 8, add:

```markdown
**9. Ground effort estimates in scope, not gut feel.**
The "Effort" field (low/medium/high) must reflect the actual scope of the change. Low: single
file, mechanical change, no design decisions. Medium: multiple files or a design choice involved.
High: cross-cutting change, new abstractions, or significant refactoring. If you can't determine
effort without deeper investigation, say "medium (needs investigation)" rather than guessing.
```

- [ ] **Step 4: Verify all presentation rules**

Read `.claude/skills/fixme-pr-comments/SKILL.md` from the "Presentation Rules" header through the end of Rule 9. Confirm all 9 rules are present and numbered sequentially.

### Task 5: Run install.sh to deploy

**Files:**
- Run: `./install.sh`

- [ ] **Step 1: Run install.sh**

```bash
cd /Users/denis/projects/denis/ai/fixme && ./install.sh
```

Expected: script copies skill directories to `~/.claude/skills/` without errors.

- [ ] **Step 2: Verify installed copy matches source**

```bash
diff /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-pr-comments/SKILL.md ~/.claude/skills/fixme-pr-comments/SKILL.md
```

Expected: no output (files are identical).
