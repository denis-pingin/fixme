# Assumption Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the fixme-write-plan agent from making unconfirmed design decisions, and ensure the review pipeline catches any that slip through.

**Architecture:** Six targeted edits across three skill files. The plan writer gets a post-exploration decision checkpoint and tighter definitions. The plan reviewer gets two new audit dimensions. The plan review handler gets [assumed] vs [confirmed] awareness.

**Tech Stack:** Markdown skill files (no build/lint/test - pure documentation changes)

---

## File Map

- Modify: `.claude/skills/fixme-write-plan/SKILL.md:155-167` - Restrict `[assumed]` tag to Input Audit context only
- Modify: `.claude/skills/fixme-write-plan/SKILL.md:216-224` - Replace vague "Resolve Remaining Unknowns" with strict classification criteria and a mandatory Design Decision Checkpoint
- Modify: `.claude/skills/fixme-write-plan/SKILL.md:295-298` - Tighten the Questions section definition to prohibit correctness/feasibility deferrals
- Modify: `.claude/skills/fixme-review-plan/SKILL.md:49-76` - Add "Assumption Validity" and "Questions Section Audit" review dimensions
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md:33-43` - Add [assumed] vs [confirmed] distinction to locked decision handling

---

## Tasks

### Task 1: Restrict `[assumed]` tag in fixme-write-plan

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md:155-167`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs` still passes (no behavioral change)
- **Behavior:** The `[assumed]` definition explicitly states it can ONLY result from the Input Audit's Question Resolution Loop, never from exploration-phase discoveries

- [ ] Step 1: Edit lines 155-167 to add an explicit restriction

Replace the current `[assumed]` definition block (lines 155-167):

```markdown
3. **Process the response:**
   - If "Proceed with recommendations": lock ALL questions to their recommended answers, marked as **assumed** (see below).
   - If the user answers some questions explicitly: lock those to the user's answers, marked as **confirmed**. For any question the user did NOT answer, lock to the recommendation, marked as **assumed**.
4. **Record** every locked decision in the plan's `### Locked Decisions` section with its confidence level. Each entry uses the format:

   ```
   N. **[confirmed|assumed]** <decision statement>. (<origin: which question, or "carried forward from prior plan">)
   ```

   Two confidence levels:

   - **[confirmed]**: User explicitly chose this (answered the question directly, or carried forward from a prior plan where it was confirmed). To override, you MUST ask the user again with the new evidence. Never silently override.
   - **[assumed]**: Recommendation accepted by default (user did not explicitly answer this question). If codebase exploration reveals concrete evidence that contradicts this decision, you MAY re-evaluate: present the evidence and the conflicting decision to the user as a new question. The bar is "concrete evidence from the codebase," not "I thought about it more and changed my mind."
```

With:

```markdown
3. **Process the response:**
   - If "Proceed with recommendations": lock ALL questions to their recommended answers, marked as **assumed** (see below).
   - If the user answers some questions explicitly: lock those to the user's answers, marked as **confirmed**. For any question the user did NOT answer, lock to the recommendation, marked as **assumed**.
4. **Record** every locked decision in the plan's `### Locked Decisions` section with its confidence level. Each entry uses the format:

   ```
   N. **[confirmed|assumed]** <decision statement>. (<origin: which question, or "carried forward from prior plan">)
   ```

   Two confidence levels:

   - **[confirmed]**: User explicitly chose this (answered the question directly, or carried forward from a prior plan where it was confirmed). To override, you MUST ask the user again with the new evidence. Never silently override.
   - **[assumed]**: Recommendation accepted by default (user did not explicitly answer this question during the Input Audit). If codebase exploration reveals concrete evidence that contradicts this decision, you MAY re-evaluate: present the evidence and the conflicting decision to the user as a new question. The bar is "concrete evidence from the codebase," not "I thought about it more and changed my mind."

   **The `[assumed]` tag may ONLY be applied to decisions that went through this Question Resolution Loop.** A design decision discovered during codebase exploration that was never presented to the user is NOT assumed - it is unconfirmed. Unconfirmed decisions must go through the Design Decision Checkpoint (below) before entering the plan. Marking exploration-phase decisions as `[assumed]` to bypass user confirmation is the single most common planning failure mode.
```

- [ ] Step 2: Commit

```bash
git add .claude/skills/fixme-write-plan/SKILL.md
git commit -m "fix(write-plan): restrict [assumed] tag to Input Audit context only"
```

---

### Task 2: Replace "Resolve Remaining Unknowns" with Design Decision Checkpoint

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md:216-224`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** existing tests still pass
- **Behavior:** The section now has clear blocking/non-blocking criteria and a mandatory checkpoint that surfaces design decisions to the user before plan writing

- [ ] Step 1: Replace lines 216-224

Replace the current "Resolve Remaining Unknowns" section:

```markdown
### Resolve Remaining Unknowns

The Input Audit resolved structural ambiguities before codebase exploration began. During exploration, new unknowns may emerge - for example, API shapes that suggest different approaches, patterns that conflict with planned changes, or test infrastructure that doesn't support the planned verification approach.

For these codebase-level discoveries:
- **Blocking** (the plan cannot proceed without resolution): ask the user directly. Do not guess.
- **Non-blocking** (the plan can proceed but the executor may need guidance): collect in the Questions section at the end of the plan.

Do not re-ask questions already resolved by the Input Audit. Do not re-open locked decisions settled during the audit unless you discover concrete codebase evidence that makes a locked decision unimplementable - in which case, flag the specific conflict to the user with the evidence.
```

With:

```markdown
### Resolve Remaining Unknowns

The Input Audit resolved structural ambiguities before codebase exploration began. During exploration, new unknowns may emerge - for example, API shapes that suggest different approaches, patterns that conflict with planned changes, or test infrastructure that doesn't support the planned verification approach.

Classify each discovery:

- **Design decisions** (multiple viable approaches exist, the plan's structure or architecture changes depending on which is chosen): these are NOT unknowns to defer - they are decisions the user must make. Collect them for the Design Decision Checkpoint below.
- **Blocking unknowns** (a single factual question where the plan cannot proceed without the answer - e.g., "does this API support pagination?"): ask the user directly via AskUserQuestion. Do not guess.
- **Informational context** (the plan is correct regardless, but the executor benefits from knowing - e.g., "the API response is double-nested"): collect in the Questions section at the end of the plan.
- **Known flaws** (you discovered that a planned approach won't work - e.g., a route conflict, a spacing bug): these are NOT questions. Fix them in the plan before writing. If you can't fix it without a design decision, it's a design decision - collect it for the checkpoint.

Do not re-ask questions already resolved by the Input Audit. Do not re-open locked decisions settled during the audit unless you discover concrete codebase evidence that makes a locked decision unimplementable - in which case, flag the specific conflict to the user with the evidence.

### Design Decision Checkpoint

**This gate runs after codebase exploration and before writing the plan. It is mandatory whenever design decisions were collected during exploration.**

During exploration, you formed opinions about how to build this. Some of those opinions are mechanical (following an obvious existing pattern with no realistic alternative). Others are genuine design choices where multiple approaches exist and the user's preference matters.

For each design decision collected above, apply this test:

> Does a realistic alternative exist that would materially change the plan's structure, component boundaries, data flow, or user-facing behavior?

- **Yes**: the decision MUST be presented to the user. Add it to the question list below.
- **No** (truly mechanical - only one reasonable approach given the codebase): document it in the plan's Stable Context section as an observation, not a Locked Decision. Example: "The existing hooks all use `withAuthRetry` wrapping `Effect.runPromise`" is an observation. "We'll create a new `agentsFetchPaginated` helper instead of modifying the shared one" is a design decision.

Collect all questions and present them to the user using the same format as the Input Audit's Question Resolution Loop (Step 5). Process answers identically: explicit answers become `[confirmed]`, accepted recommendations become `[assumed]`. The `[assumed]` tag is valid here because the user was asked.

**If no design decisions were collected:** the checkpoint passes silently. Proceed to writing.

**If all design decisions are truly mechanical (no alternatives):** the checkpoint passes silently. Document each in Stable Context.

**You may not skip this checkpoint because:**
- You already explored the codebase and "know" the right approach
- The design decisions seem obvious
- Asking would slow things down
- You can always mark them `[assumed]` later

The Input Audit prevents premature confidence before exploration. This checkpoint prevents post-exploration confidence from bypassing user confirmation. Together they ensure every design decision in the plan was either confirmed by the user or explicitly accepted as a recommendation.
```

- [ ] Step 2: Commit

```bash
git add .claude/skills/fixme-write-plan/SKILL.md
git commit -m "fix(write-plan): add Design Decision Checkpoint after codebase exploration"
```

---

### Task 3: Tighten the Questions section definition

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md:295-298`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** existing tests still pass
- **Behavior:** The Questions section template and description explicitly prohibit deferring correctness/feasibility issues

- [ ] Step 1: Replace the Questions section in the plan template (lines 295-298)

Replace:

```markdown
## Questions

[Non-blocking unknowns that the executor or user should resolve before or during execution. If none, omit this section.]
```

With:

```markdown
## Questions

[Informational context for the executor - things that are true regardless of the plan's approach but useful to know during implementation. If none, omit this section.

This section is NOT a place to defer:
- **Correctness concerns** ("this might not work because...") - fix the plan or ask the user
- **Feasibility risks** ("if routing issues arise...") - resolve before writing the plan
- **Design decisions** ("we could do X or Y") - decide via the Design Decision Checkpoint
- **Known flaws** ("the executor may need to override this") - that means the plan is incomplete

If an item starts with "if", "might", "may need to", or "the executor should decide" - it does not belong here. Either resolve it or escalate it.]
```

- [ ] Step 2: Commit

```bash
git add .claude/skills/fixme-write-plan/SKILL.md
git commit -m "fix(write-plan): prohibit deferring real issues to Questions section"
```

---

### Task 4: Add assumption audit to fixme-review-plan

**Files:**
- Modify: `.claude/skills/fixme-review-plan/SKILL.md:49-86`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** existing tests still pass
- **Behavior:** The reviewer now audits `[assumed]` Locked Decisions and the Questions section as explicit review dimensions

- [ ] Step 1: Add two new subsections after "Ordering and Dependencies" (after line 76) and before "What NOT to Flag" (line 78)

Insert after line 76 (`- Missing verification checkpoints between risky phases`):

```markdown

### Assumption Validity
- Check every `[assumed]` Locked Decision. For each: does a realistic alternative exist that would materially change the plan? If yes, this should have been confirmed by the user - flag it as a finding (category: COMPLETENESS, severity: IMPORTANT). The plan writer should have surfaced this during the Design Decision Checkpoint.
- Check whether any `[assumed]` decision contradicts patterns observed in the codebase. An assumption that fights the codebase is higher risk than one that follows it.
- Do NOT flag `[confirmed]` decisions - those were explicitly chosen by the user.

### Questions Section Audit
- Read the plan's Questions section (if present). Each item should be purely informational context for the executor.
- Promote to a finding any item that is actually: a correctness concern (the plan might not work), a feasibility risk (something might break), an unresolved design decision (multiple approaches exist), or a known flaw being deferred to the executor. These are plan incompleteness, not questions.
- Items that start with "if", "might", "may need to", or "the executor should decide" are red flags - they suggest the plan writer deferred real work.
```

- [ ] Step 2: Commit

```bash
git add .claude/skills/fixme-review-plan/SKILL.md
git commit -m "fix(review-plan): add assumption validity and questions section audit"
```

---

### Task 5: Add [assumed] vs [confirmed] distinction to fixme-handle-plan-review

**Files:**
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md:33-43`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** existing tests still pass
- **Behavior:** The handler treats `[assumed]` and `[confirmed]` decisions differently when a finding contradicts them

- [ ] Step 1: Replace the locked decision handling in the Process section (lines 39-41)

Replace:

```markdown
4. Check finding against locked decisions. If the finding contradicts a locked decision:
   - If the finding reveals the locked decision causes a concrete problem (bug, security issue, data loss): classify ASK_USER. In the Question, explain what new evidence suggests the previous decision may need revisiting, and recommend a path forward. The user can confirm, override, or modify their original decision.
   - If the finding merely disagrees with the approach chosen by the locked decision: classify REJECT_WONT_FIX. The user already made this call.
```

With:

```markdown
4. Check finding against locked decisions. Distinguish between `[confirmed]` decisions (user explicitly chose) and `[assumed]` decisions (user accepted recommendation by default or never explicitly answered):
   - **Finding contradicts a `[confirmed]` decision:**
     - If the finding reveals a concrete problem (bug, security issue, data loss): classify ASK_USER. Explain what new evidence suggests the previous decision may need revisiting, and recommend a path forward.
     - If the finding merely disagrees with the approach: classify REJECT_WONT_FIX. The user explicitly made this call.
   - **Finding contradicts an `[assumed]` decision:**
     - If the finding reveals a concrete problem: classify ASK_USER. The user never explicitly confirmed this decision, and new evidence suggests it's wrong.
     - If the finding offers a materially better alternative: classify ASK_USER. The user accepted this by default - they deserve to see the better option. Present both the assumed approach and the proposed alternative.
     - If the finding is a minor stylistic disagreement: classify REJECT_WONT_FIX.
   - **Finding identifies an `[assumed]` decision that should have been confirmed** (the reviewer flagged it as an Assumption Validity issue): classify ASK_USER. Present the decision and its alternatives to the user for explicit confirmation.
```

- [ ] Step 2: Commit

```bash
git add .claude/skills/fixme-handle-plan-review/SKILL.md
git commit -m "fix(handle-plan-review): distinguish [assumed] vs [confirmed] in locked decision handling"
```

---

### Task 6: Update the Final Checklist in fixme-write-plan

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md:481-505`

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** existing tests still pass
- **Behavior:** The checklist includes the Design Decision Checkpoint and Questions section rules

- [ ] Step 1: Add two new checklist items after line 491 (`- [ ] No assumptions were made that should be questions`)

Insert after that line:

```markdown
- [ ] Design Decision Checkpoint was performed after codebase exploration - all design decisions with realistic alternatives were presented to the user
- [ ] Questions section contains only informational context - no correctness concerns, feasibility risks, design decisions, or known flaws were deferred there
```

- [ ] Step 2: Commit

```bash
git add .claude/skills/fixme-write-plan/SKILL.md
git commit -m "fix(write-plan): add checkpoint and questions audit to final checklist"
```
