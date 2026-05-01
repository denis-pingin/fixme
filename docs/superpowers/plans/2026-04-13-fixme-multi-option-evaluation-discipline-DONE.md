# Multi-Option Evaluation Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guards across the fixme review→handle→plan chain so findings with multiple viable fix options are actually evaluated on merit, instead of being collapsed to the "simpler" shortcut and silently dropped.

**Architecture:** All changes are documentation edits to `SKILL.md` files. Fix sits in three places so every link in the chain refuses to anchor on editorial shortcuts: (1) reviewers must present multi-option suggestions as real options with tradeoffs, (2) handlers must independently evaluate each option and default to `FIX_UNCLEAR` when no option clearly dominates, (3) the plan writer must never silently drop or downgrade a FIX item. The existing FIX_UNCLEAR classification is the escape hatch — this plan makes it the default path when multiple alternatives exist.

**Tech Stack:** Pure markdown skill files. No code changes, no tests (skill content has no unit tests in this repo). Verification via `install.sh` + a spot-read of installed files + running the existing `fixme-tools.test.cjs` suite to confirm no regression in the only code under test.

---

## Context

### Stable Context

**Failure mode this plan fixes.** A recent plan review loop dropped a real fix (PATCH handler hoist of `listByUser`/`getLimits` to avoid duplication in overlapping conditionals). The reviewer flagged an unconditional hoist as wasteful, suggested two alternatives (keep inside conditionals vs. hoist with a guard), and editorially added "option A is simpler". The handler anchored on "simpler" and classified the finding so the fix got dropped. The plan writer removed the fix entirely. Nobody compared option A vs. option C on merit — option C was both performant and cleaner, and was the clear winner. The editorial shortcut bypassed evaluation at every step.

**Files involved in the fix.** Five skill files participate in the review → handle → plan chain and each needs an edit:

- [fixme-review-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-plan/SKILL.md) — review output discipline for multi-option suggestions
- [fixme-review-code/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-code/SKILL.md) — mirror for code review
- [fixme-handle-plan-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-plan-review/SKILL.md) — classification gate for multi-option findings
- [fixme-handle-code-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-code-review/SKILL.md) — mirror for code review
- [fixme-write-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-write-plan/SKILL.md) — prohibit silent drops and approach substitution

**Existing taxonomy.** The handler skills already define `FIX_UNCLEAR` ("real issue, but the fix approach is ambiguous. Multiple viable strategies exist, or design tradeoffs are involved"). This is the correct classification for multi-option findings. The current skill text describes it, but does not make it the *default* when the reviewer listed 2+ options. That is the exact bug — this plan closes that gap by making "multiple options exist" a hard trigger for `FIX_UNCLEAR`, not a soft hint.

**Existing no-silent-drop rule.** [fixme-write-plan/SKILL.md:539](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-write-plan/SKILL.md#L539) already has a final checklist item "No FIX item was silently ignored — each is addressed in the revised plan or flagged as a conflict". It is too weak: it did not prevent the observed failure because "addressed" was interpreted as "replaced with a clarifying comment". The rule needs to explicitly forbid downgrading/collapsing a FIX item into a no-op based on editorial language.

**Existing decision presentation format.** [fixme-decision-presentation/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-decision-presentation/SKILL.md) already defines the canonical decision block (Context / The question / Options with Approach+Pros+Cons+Impact+Effort / Recommendation). This plan reuses that format rather than inventing a new one — the "Multi-Option Discipline" sections reference it instead of duplicating it.

**Install mechanism.** [install.sh](/Users/denis/projects/denis/ai/fixme/install.sh) copies every `fixme*` directory from `.claude/skills/` to `~/.claude/skills/` (wiping the destination first). There are no partial-update semantics. After editing source files, the executor must run `./install.sh` to deploy. **Never edit `~/.claude/skills/` directly** — those copies are overwritten on every install and edits there are lost.

**Test surface.** There is no `package.json` and no test runner for skill content. The only executable test is [fixme-tools.test.cjs](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs), which tests the ticket state CLI. Skill markdown changes cannot regress it, but the plan runs it anyway as the minimum verification gate.

### Locked Decisions

_None — this is a fresh plan with no prior iterations and no user-confirmed constraints yet. All design decisions below were made by the planner based on the observed failure mode and will be recorded here if the user revises the plan._

---

## File Map

- Modify: [fixme-review-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-plan/SKILL.md) — add "Multi-Option Suggestions" section, update Suggestion field description in the finding table, add a rule to the Rules list
- Modify: [fixme-review-code/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-code/SKILL.md) — mirror of the review-plan changes
- Modify: [fixme-handle-plan-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-plan-review/SKILL.md) — update FIX and FIX_UNCLEAR definitions, add "Multi-Option Discipline" section, add a rule to the Rules list
- Modify: [fixme-handle-code-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-code-review/SKILL.md) — mirror of the handle-plan-review changes, plus Gate 8 in the Pre-Classification Gate list
- Modify: [fixme-write-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-write-plan/SKILL.md) — strengthen the Context Recovery FIX-item handling rules, tighten the final checklist
- Modify: nothing else. No code files, no tests, no config.

---

## Tasks

### Task 1: Reviewer discipline for multi-option suggestions (plan review)

**Files:**
- Modify: [fixme-review-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-plan/SKILL.md)

**Expected Outcome:**
- **Build:** N/A (markdown only)
- **Lint:** N/A
- **Tests:** N/A
- **Behavior:** The file contains a new `## Multi-Option Suggestions` section between `## What NOT to Flag` and `## Output Format`; the `Suggestion` row of the finding table references it; the `## Rules` section contains a new bullet forbidding collapse to a "simpler" favorite.

- [ ] **Step 1: Insert the Multi-Option Suggestions section**

  In [fixme-review-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-plan/SKILL.md), find the line `- Anything where your own analysis concludes "no issue" - if you investigated and found it works correctly, that's Pass 1 doing its job. Don't report it.` (last bullet of `## What NOT to Flag`, around line 96). After that bullet and its trailing blank line, and before `## Output Format`, insert this section verbatim:

  ```markdown
  ## Multi-Option Suggestions

  When a finding admits more than one plausible fix, the Suggestion field must preserve that multiplicity instead of collapsing it to a favorite.

  - **List every genuinely distinct option.** If three approaches are viable, list three - not one option with a parenthetical "or alternatively...".
  - **For each option, give Approach / Pros / Cons / Impact / Effort.** Keep it tight but concrete. Pros and Cons must be grounded in this codebase, not generic ("cleaner code" is not a Pro).
  - **Do not use editorial shortcut labels** like "simpler", "easier", "cleaner", "lighter touch", "just do X" as the basis for preferring one option. These are anchors, not arguments. An option that is "simpler" in line count but slower on the common code path is not simpler in the dimension that matters.
  - **If you can confidently recommend one option**, state the recommendation and cite the evidence (what you read, what you measured, what tradeoff is decisive). Otherwise, say explicitly: "Recommendation: none - classify as FIX_UNCLEAR, let the user choose."
  - **Dropping the fix entirely is itself an option** and must be evaluated the same way. "Keep the current code" is only acceptable when every alternative is demonstrably worse than the status quo - not when one alternative is just "simpler".

  The downstream handler treats your Suggestion as a hypothesis. Single-option suggestions push the handler toward FIX. Multi-option suggestions push it toward FIX_UNCLEAR. Get this right or the user never sees the real choice.

  ```

- [ ] **Step 2: Update the Suggestion row in the finding table**

  In the same file, find the table row:

  ```
  | **Suggestion** | How to fix it. Concrete enough to act on. If unsure of the best fix, say so and offer options |
  ```

  Replace it with:

  ```
  | **Suggestion** | How to fix it. Concrete enough to act on. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
  ```

- [ ] **Step 3: Add the multi-option rule to the Rules section**

  In the same file, find the last rule in the `## Rules` section (the bullet starting `If the plan is good and there are no findings`). After that bullet, append:

  ```markdown
  - When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
  ```

- [ ] **Step 4: Spot-verify the edits**

  Read the modified file and confirm:
  - The `## Multi-Option Suggestions` section appears between `## What NOT to Flag` and `## Output Format`.
  - The Suggestion row of the finding table references Multi-Option Suggestions.
  - The new bullet appears at the end of the `## Rules` section.
  - No other content was moved, duplicated, or deleted.

  Expected: all three checks pass. If any fail, fix in place before committing.

- [ ] **Step 5: Commit**

  ```bash
  git add .claude/skills/fixme-review-plan/SKILL.md
  git commit -m "fixme-review-plan: require multi-option suggestions to preserve alternatives"
  ```

---

### Task 2: Reviewer discipline for multi-option suggestions (code review)

**Files:**
- Modify: [fixme-review-code/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-code/SKILL.md)

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** N/A
- **Behavior:** The file contains the same `## Multi-Option Suggestions` section (verbatim content), its `Suggestion` table row references it, and the Rules list contains the same new bullet as Task 1.

- [ ] **Step 1: Insert the Multi-Option Suggestions section**

  In [fixme-review-code/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-review-code/SKILL.md), find the line `- Missing features that aren't in the plan or spec (that's a plan gap, not a code issue)` (last bullet of `## What NOT to Flag`, around line 127). After that bullet and its trailing blank line, and before `## Output Format`, insert the exact same section as in Task 1 Step 1:

  ```markdown
  ## Multi-Option Suggestions

  When a finding admits more than one plausible fix, the Suggestion field must preserve that multiplicity instead of collapsing it to a favorite.

  - **List every genuinely distinct option.** If three approaches are viable, list three - not one option with a parenthetical "or alternatively...".
  - **For each option, give Approach / Pros / Cons / Impact / Effort.** Keep it tight but concrete. Pros and Cons must be grounded in this codebase, not generic ("cleaner code" is not a Pro).
  - **Do not use editorial shortcut labels** like "simpler", "easier", "cleaner", "lighter touch", "just do X" as the basis for preferring one option. These are anchors, not arguments. An option that is "simpler" in line count but slower on the common code path is not simpler in the dimension that matters.
  - **If you can confidently recommend one option**, state the recommendation and cite the evidence (what you read, what you measured, what tradeoff is decisive). Otherwise, say explicitly: "Recommendation: none - classify as FIX_UNCLEAR, let the user choose."
  - **Dropping the fix entirely is itself an option** and must be evaluated the same way. "Keep the current code" is only acceptable when every alternative is demonstrably worse than the status quo - not when one alternative is just "simpler".

  The downstream handler treats your Suggestion as a hypothesis. Single-option suggestions push the handler toward FIX. Multi-option suggestions push it toward FIX_UNCLEAR. Get this right or the user never sees the real choice.

  ```

- [ ] **Step 2: Update the Suggestion row in the finding table**

  In the same file, find the table row:

  ```
  | **Suggestion** | How to fix it. Concrete: name the file, the function, what to change |
  ```

  Replace it with:

  ```
  | **Suggestion** | How to fix it. Concrete: name the file, the function, what to change. If multiple viable approaches exist, list them as distinct options with Approach/Pros/Cons/Impact/Effort and either recommend one with evidence or mark the finding as "needs FIX_UNCLEAR classification". See Multi-Option Suggestions. |
  ```

- [ ] **Step 3: Add the multi-option rule to the Rules section**

  In the same file, find the last rule in the `## Rules` section (the bullet starting `The "Verified OK" section is mandatory`). After that bullet, append:

  ```markdown
  - When a finding has multiple viable fix approaches, never collapse them to a single "simpler" favorite. Either recommend one with evidence grounded in concrete tradeoffs (performance, correctness, maintainability), or explicitly hand the choice to the handler via a Suggestion marked for FIX_UNCLEAR. Anchoring on editorial labels like "simpler" or "easier" is the exact pattern this rule forbids.
  ```

- [ ] **Step 4: Spot-verify the edits**

  Read the modified file and confirm:
  - The `## Multi-Option Suggestions` section appears between `## What NOT to Flag` and `## Output Format`.
  - The Suggestion row references Multi-Option Suggestions.
  - The new bullet appears at the end of the `## Rules` section.
  - No other content was moved, duplicated, or deleted.

  Expected: all three checks pass. Fix in place if any fail.

- [ ] **Step 5: Commit**

  ```bash
  git add .claude/skills/fixme-review-code/SKILL.md
  git commit -m "fixme-review-code: require multi-option suggestions to preserve alternatives"
  ```

---

### Task 3: Handler multi-option discipline (plan review)

**Files:**
- Modify: [fixme-handle-plan-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-plan-review/SKILL.md)

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** N/A
- **Behavior:** The FIX and FIX_UNCLEAR definitions explicitly address the multi-option case; a new `## Multi-Option Discipline` section sits between `## Process` and `## Output Format`; the `## Rules` section contains a new bullet about defaulting multi-option findings to FIX_UNCLEAR.

- [ ] **Step 1: Update the FIX and FIX_UNCLEAR classification definitions**

  In [fixme-handle-plan-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-plan-review/SKILL.md), find the two lines:

  ```
  - **FIX** - real issue that affects correctness, performance, security, or maintainability. A single clear fix approach exists.
  - **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist, or design tradeoffs are involved. The issue's validity is not in question - only the approach to resolving it.
  ```

  Replace them with:

  ```
  - **FIX** - real issue that affects correctness, performance, security, or maintainability. Either a single clear fix approach exists, OR one approach clearly dominates all alternatives on merit (grounded in concrete tradeoffs, not editorial labels like "simpler"). If the reviewer presented multiple options, you MUST independently evaluate each before classifying as FIX - see Multi-Option Discipline.
  - **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist with genuine tradeoffs. This is the default classification whenever the reviewer offered 2+ options and your own independent evaluation does not produce a clear winner on the dimensions that matter (performance on common vs. rare paths, correctness, maintainability, user-visible impact). The issue's validity is not in question - only the approach to resolving it.
  ```

- [ ] **Step 2: Insert the Multi-Option Discipline section**

  In the same file, find the end of the `## Process` section — the last line of step 5 is `5. Classify and document`. After the blank line that follows and before `## Output Format`, insert this section verbatim:

  ```markdown
  ## Multi-Option Discipline

  When a finding's Suggestion presents 2+ plausible fix approaches (including "drop the fix" or "add a comment" as options), apply this discipline before classifying. This section exists because the default failure mode is to anchor on whichever option the reviewer labeled "simpler" and collapse the decision without evaluation.

  1. **Independently evaluate every option.** For each, assess concrete tradeoffs: correctness, performance on common vs. rare code paths, maintainability, user-visible behavior, security, effort, risk. Read the referenced code yourself. Do not outsource this evaluation to the reviewer - the reviewer's preference is a hypothesis, not the answer.

  2. **Strike editorial shortcuts from your reasoning.** Words like "simpler", "easier", "cleaner", "lighter touch", "just X" are anchors, not arguments. A "simpler" option that makes every request pay an extra I/O round-trip is not simpler in the dimension that matters. If your justification for picking an option reduces to "the reviewer called it simpler", you have not done the evaluation.

  3. **Classify based on the evaluation outcome:**
     - **One option clearly dominates** on the dimensions that matter, with no material downside → **FIX**. The Approach field records that option and cites WHY it wins on the concrete tradeoff (e.g. "hoist with guard: same performance as inline duplication, and eliminates the overlap duplication"), not on editorial language.
     - **Multiple options are viable** with genuine tradeoffs, or no option clearly dominates → **FIX_UNCLEAR**. The Question field presents every option with full Approach/Pros/Cons/Impact/Effort and a researched Recommendation (per the fixme-decision-presentation format). Let the user choose. This is the default when your evaluation does not produce a clear winner.
     - **Every option is strictly worse than the status quo** (including "drop the fix" as an option) → **REJECT_WONT_FIX**, with per-option disqualifying flaws listed. "Simpler to not do it" is not a disqualifying flaw.

  4. **"Drop the fix" or "just add a comment" is not a free answer.** These resolutions require either proving the original concern was invalid (→ REJECT_FALSE_POSITIVE with evidence) OR proving every alternative is strictly worse than leaving the code alone (→ REJECT_WONT_FIX with a per-option evaluation). Collapsing a multi-option finding into "drop it" because one option was labeled "simpler" is the exact failure mode this section exists to prevent.

  5. **Default to FIX_UNCLEAR when uncertain.** If you have evaluated every option and cannot confidently name a winner, that is FIX_UNCLEAR. The handler's job is to protect the user's ability to choose the best option, not to save them the decision by picking the path of least resistance.

  ```

- [ ] **Step 3: Add the multi-option rule to the Rules section**

  In the same file, find the last rule in the `## Rules` section (the bullet starting `Locked decisions are presumed correct`). After that bullet, append:

  ```markdown
  - Multi-option findings default to FIX_UNCLEAR. Collapsing multiple alternatives into a single "simpler" FIX approach - or into REJECT_WONT_FIX or "add a comment" - requires an independent evaluation that names concrete tradeoffs, not editorial labels. See Multi-Option Discipline.
  ```

- [ ] **Step 4: Spot-verify the edits**

  Read the modified file and confirm:
  - The FIX and FIX_UNCLEAR definitions match the replacement text.
  - The `## Multi-Option Discipline` section appears between `## Process` and `## Output Format`.
  - The new bullet appears at the end of the `## Rules` section.
  - The `## Routing Directive` section at the end of the file is unchanged.

  Expected: all four checks pass. Fix in place if any fail.

- [ ] **Step 5: Commit**

  ```bash
  git add .claude/skills/fixme-handle-plan-review/SKILL.md
  git commit -m "fixme-handle-plan-review: require independent evaluation of multi-option findings"
  ```

---

### Task 4: Handler multi-option discipline (code review)

**Files:**
- Modify: [fixme-handle-code-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-code-review/SKILL.md)

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** N/A
- **Behavior:** The FIX and FIX_UNCLEAR definitions match Task 3; a new Gate 8 is appended to the Pre-Classification Gate list; a new `## Multi-Option Discipline` section sits between `## Code-Review-Specific Considerations` and `## Output Format`; the `## Rules` section contains the same new bullet as Task 3.

- [ ] **Step 1: Update the FIX and FIX_UNCLEAR classification definitions**

  In [fixme-handle-code-review/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-handle-code-review/SKILL.md), find the two lines:

  ```
  - **FIX** - real issue that affects correctness, behavior, security, performance, test quality, or maintainability. A single clear fix approach exists. Fixing it will improve the implementation without breaking anything or contradicting the plan's intent.
  - **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist, tradeoffs are involved, or the fix might require changes the finding doesn't account for (e.g., test updates, upstream changes). The issue's validity is not in question - only the approach.
  ```

  Replace them with:

  ```
  - **FIX** - real issue that affects correctness, behavior, security, performance, test quality, or maintainability. Either a single clear fix approach exists, OR one approach clearly dominates all alternatives on merit (grounded in concrete tradeoffs, not editorial labels like "simpler"). Fixing it will improve the implementation without breaking anything or contradicting the plan's intent. If the reviewer presented multiple options, you MUST independently evaluate each before classifying as FIX - see Multi-Option Discipline.
  - **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist with genuine tradeoffs, the fix might require changes the finding doesn't account for (e.g. test updates, upstream changes), or no option clearly dominates the others. This is the default classification whenever the reviewer offered 2+ options and your own independent evaluation does not produce a clear winner. The issue's validity is not in question - only the approach.
  ```

- [ ] **Step 2: Append Gate 8 to the Pre-Classification Gate list**

  In the same file, find the last item in the Pre-Classification Gate list — the line starting `7. **Does this contradict a locked decision?**`. After that item (and its content through the end of that bullet), append a new gate 8:

  ```markdown
  8. **Multi-option evaluation.** If the finding's Suggestion presents 2+ plausible fix approaches, you MUST independently evaluate each on concrete tradeoffs (correctness, performance on common vs. rare paths, maintainability, test quality, effort, risk) before classifying. Never anchor on editorial shortcuts ("simpler", "easier", "cleaner", "lighter touch", "just X") - an option that is "simpler" in line count but slower on the common code path is not simpler in the dimension that matters. See Multi-Option Discipline below for the full decision tree.
  ```

- [ ] **Step 3: Insert the Multi-Option Discipline section**

  In the same file, find the end of the `## Code-Review-Specific Considerations` section — the last bullet ends with `If yes, REJECT_WONT_FIX.`. After the blank line that follows and before `## Output Format`, insert this section verbatim:

  ```markdown
  ## Multi-Option Discipline

  When a finding's Suggestion presents 2+ plausible fix approaches (including "drop the fix" or "add a comment" as options), apply this discipline before classifying. This section exists because the default failure mode is to anchor on whichever option the reviewer labeled "simpler" and collapse the decision without evaluation.

  1. **Independently evaluate every option.** For each, assess concrete tradeoffs: correctness, performance on common vs. rare code paths, maintainability, user-visible behavior, security, test quality, effort, risk. Read the referenced code yourself. Do not outsource this evaluation to the reviewer - the reviewer's preference is a hypothesis, not the answer.

  2. **Strike editorial shortcuts from your reasoning.** Words like "simpler", "easier", "cleaner", "lighter touch", "just X" are anchors, not arguments. A "simpler" option that makes every request pay an extra I/O round-trip is not simpler in the dimension that matters. If your justification for picking an option reduces to "the reviewer called it simpler", you have not done the evaluation.

  3. **Classify based on the evaluation outcome:**
     - **One option clearly dominates** on the dimensions that matter, with no material downside → **FIX**. The Approach field records that option and cites WHY it wins on the concrete tradeoff, not on editorial language.
     - **Multiple options are viable** with genuine tradeoffs, or no option clearly dominates → **FIX_UNCLEAR**. The Question field presents every option with full Approach/Pros/Cons/Impact/Effort and a researched Recommendation (per the fixme-decision-presentation format). Let the user choose. This is the default when your evaluation does not produce a clear winner.
     - **Every option is strictly worse than the status quo** (including "drop the fix" as an option) → **REJECT_WONT_FIX**, with per-option disqualifying flaws listed. "Simpler to not do it" is not a disqualifying flaw.

  4. **"Drop the fix" or "just add a comment" is not a free answer.** These resolutions require either proving the original concern was invalid (→ REJECT_FALSE_POSITIVE with evidence) OR proving every alternative is strictly worse than leaving the code alone (→ REJECT_WONT_FIX with a per-option evaluation). Collapsing a multi-option finding into "drop it" because one option was labeled "simpler" is the exact failure mode this section exists to prevent.

  5. **Default to FIX_UNCLEAR when uncertain.** If you have evaluated every option and cannot confidently name a winner, that is FIX_UNCLEAR. The handler's job is to protect the user's ability to choose the best option, not to save them the decision by picking the path of least resistance.

  ```

- [ ] **Step 4: Add the multi-option rule to the Rules section**

  In the same file, find the last rule in the `## Rules` section (the bullet starting `Locked decisions are presumed correct`). After that bullet, append:

  ```markdown
  - Multi-option findings default to FIX_UNCLEAR. Collapsing multiple alternatives into a single "simpler" FIX approach - or into REJECT_WONT_FIX or "add a comment" - requires an independent evaluation that names concrete tradeoffs, not editorial labels. See Multi-Option Discipline and Pre-Classification Gate 8.
  ```

- [ ] **Step 5: Spot-verify the edits**

  Read the modified file and confirm:
  - The FIX and FIX_UNCLEAR definitions match the replacement text.
  - Gate 8 is the last item in the Pre-Classification Gate list.
  - The `## Multi-Option Discipline` section appears between `## Code-Review-Specific Considerations` and `## Output Format`.
  - The new bullet appears at the end of the `## Rules` section.
  - The `## Routing Directive` section at the end of the file is unchanged.

  Expected: all five checks pass. Fix in place if any fail.

- [ ] **Step 6: Commit**

  ```bash
  git add .claude/skills/fixme-handle-code-review/SKILL.md
  git commit -m "fixme-handle-code-review: require independent evaluation of multi-option findings"
  ```

---

### Task 5: Plan writer no-silent-drop enforcement

**Files:**
- Modify: [fixme-write-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-write-plan/SKILL.md)

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** N/A
- **Behavior:** The Context Recovery section in the Before Writing block contains two new sub-bullets prohibiting silent drops and approach substitution for FIX items; the Final Checklist item about FIX items is strengthened.

- [ ] **Step 1: Extend the Context Recovery FIX-item handling rules**

  In [fixme-write-plan/SKILL.md](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-write-plan/SKILL.md), find item 3 under `### Context Recovery (revision and rewrite modes - skip in fresh mode)`. It currently reads:

  ```
  3. Read the FIX items. For each FIX item:
     - Re-read the specific files it references (targeted, not full codebase)
     - If it contradicts a Stable Context item, re-verify that item against the codebase
     - If it contradicts a locked decision, flag the conflict to the user - do not silently override
  ```

  Replace it with:

  ```
  3. Read the FIX items. For each FIX item:
     - Re-read the specific files it references (targeted, not full codebase)
     - If it contradicts a Stable Context item, re-verify that item against the codebase
     - If it contradicts a locked decision, flag the conflict to the user - do not silently override
     - **Never silently drop a FIX item.** If you believe a FIX should not be implemented, that is not your call - flag it back to the user via the Input Audit as a new question with concrete evidence (what you read, what tradeoff changed your mind, what alternative you propose). "Drop it and add a clarifying comment" is only acceptable when the handler's Approach field explicitly specifies exactly that as the full resolution.
     - **Never substitute your own "lighter touch" for the handler's specified Approach.** If the handler classified a finding as FIX with a specific Approach, implement that Approach as written. If the handler classified as FIX_UNCLEAR, the user's answer in Locked Decisions is the source of truth - follow it. Replacing either with a smaller edit because it seems "simpler" is a silent override and the exact failure mode the handler's Multi-Option Discipline exists to prevent.
  ```

- [ ] **Step 2: Strengthen the Final Checklist item about FIX items**

  In the same file, find the Final Checklist line:

  ```
  - [ ] No FIX item was silently ignored - each is addressed in the revised plan or flagged as a conflict
  ```

  Replace it with:

  ```
  - [ ] No FIX item was silently ignored, dropped, downgraded to a clarifying comment, or collapsed to a "simpler" substitute - each is either implemented using the handler's specified Approach (for FIX), resolved via the user's Locked Decision (for FIX_UNCLEAR), or flagged back to the user as a new question with concrete evidence
  ```

- [ ] **Step 3: Spot-verify the edits**

  Read the modified file and confirm:
  - The two new sub-bullets (`Never silently drop a FIX item` and `Never substitute your own "lighter touch"`) appear under Context Recovery item 3, in that order, after the existing three sub-bullets.
  - The Final Checklist item matches the replacement text.
  - No other content was moved, duplicated, or deleted.

  Expected: all three checks pass. Fix in place if any fail.

- [ ] **Step 4: Commit**

  ```bash
  git add .claude/skills/fixme-write-plan/SKILL.md
  git commit -m "fixme-write-plan: forbid silent drop or approach substitution for FIX items"
  ```

---

### Task 6: Install skills and run regression gate

**Files:**
- Run: [install.sh](/Users/denis/projects/denis/ai/fixme/install.sh)
- Run: [fixme-tools.test.cjs](/Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs)

**Expected Outcome:**
- **Build:** N/A
- **Lint:** N/A
- **Tests:** `fixme-tools.test.cjs` exits 0 (all assertions pass)
- **Behavior:** The five edited `SKILL.md` files are deployed under `~/.claude/skills/fixme*/` and contain the new sections; the ticket-tools test suite is unaffected.

- [ ] **Step 1: Run install.sh**

  From the repo root:

  ```bash
  cd /Users/denis/projects/denis/ai/fixme && ./install.sh
  ```

  Expected output: one `Installed fixme-*` line per skill directory (including the five edited ones). No errors.

- [ ] **Step 2: Verify each edited skill was deployed**

  Spot-check that the new sections AND their companion sub-edits landed in the installed copies. The first three commands anchor the new section headers; the remaining four anchor the companion edits (Suggestion-row updates in the reviewers, FIX/FIX_UNCLEAR definition replacements in the handlers, Gate 8 in the code-review handler, and the strengthened no-silent-drop bullet in the plan writer). If any task's sub-step was dropped, one of these greps will miss its expected file.

  ```bash
  grep -l "Multi-Option Suggestions" ~/.claude/skills/fixme-review-plan/SKILL.md ~/.claude/skills/fixme-review-code/SKILL.md
  grep -l "Multi-Option Discipline" ~/.claude/skills/fixme-handle-plan-review/SKILL.md ~/.claude/skills/fixme-handle-code-review/SKILL.md
  grep -l "Never silently drop a FIX item" ~/.claude/skills/fixme-write-plan/SKILL.md
  grep -l "needs FIX_UNCLEAR classification" ~/.claude/skills/fixme-review-plan/SKILL.md ~/.claude/skills/fixme-review-code/SKILL.md
  grep -l "one approach clearly dominates" ~/.claude/skills/fixme-handle-plan-review/SKILL.md ~/.claude/skills/fixme-handle-code-review/SKILL.md
  grep -l "Never substitute your own" ~/.claude/skills/fixme-write-plan/SKILL.md
  grep -l "Multi-option evaluation" ~/.claude/skills/fixme-handle-code-review/SKILL.md
  ```

  Expected: each command prints the file path(s) it was given. If any file does not contain the expected string, re-run `install.sh` and investigate before proceeding.

- [ ] **Step 3: Run the existing test suite**

  ```bash
  node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
  ```

  Expected: exit code 0, no assertion failures. This is a regression gate — the edits are markdown-only and must not affect the ticket-tools test. A failure here would indicate the executor edited the wrong file or corrupted the scripts directory.

- [ ] **Step 4: Verify no uncommitted changes remain**

  ```bash
  git status
  ```

  Expected: working tree clean for `.claude/skills/` — all five edits from Tasks 1-5 are in their own commits. Any untracked or modified skill file is a bug (likely a partial edit in a prior task); resolve before finishing.

- [ ] **Step 5: Commit if any verification-related changes were needed**

  If Steps 1-4 required no corrective edits, skip this step. Otherwise, stage and commit the corrective edits separately:

  ```bash
  git add -A
  git commit -m "fixme: verification fixes for multi-option discipline rollout"
  ```

---

## Questions

_None. Every design decision was made by the planner based on the observed failure mode; none is deferred to the executor. If the user wants to revise the approach (e.g. put the Multi-Option Discipline in a shared `fixme-decision-presentation` file instead of duplicating it across handler skills), flag that during review and re-enter revision mode._
