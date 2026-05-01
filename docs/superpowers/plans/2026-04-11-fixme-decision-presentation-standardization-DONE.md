# Decision Presentation Standardization - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize how the fixme pipeline presents decisions, findings, and escalations to the user - extracting the decision presentation format into a shared skill, enforcing formatting/spacing rules, and eliminating routing metadata from user-facing output.

**Architecture:** Create a new `fixme-decision-presentation` skill containing the canonical decision block format (Context / The question / Options with 5 sub-fields / Recommendation with research evidence). Handler agent definitions add this as a second preloaded skill. Handler SKILL.md files replace their inline guidelines with a pointer. fixme-task and fixme-pr-comments reference the shared format for their user-facing presentation.

**Tech Stack:** Claude Code skills (SKILL.md markdown files), agent definitions (YAML frontmatter + markdown)

---

## Context

### Problem

The fixme pipeline's user-facing output for decisions and escalations is broken:

1. **Routing metadata leaks** - Internal terms like "HAS_ASK_USER + HAS_FIX" appear in user-facing output
2. **Compressed decisions** - Structured decision blocks get flattened into paragraphs without Pros/Cons/Impact/Effort
3. **No formatting** - Sections are crammed together without spacing, headings, or visual hierarchy
4. **Inconsistent format** - fixme-pr-comments uses 3 option sub-fields (Approach/Pros/Cons), handlers use 5 (adds Impact/Effort)
5. **Weak Recommendation spec** - Doesn't require showing research evidence or cross-referencing option tradeoffs
6. **Duplicated guidelines** - Decision Presentation Guidelines are duplicated (nearly identically) across fixme-handle-code-review and fixme-handle-plan-review SKILL.md files

### Approach

Extract the shared Decision Presentation Guidelines into a new `fixme-decision-presentation` skill. Use the `skills` frontmatter array in agent definitions to preload it alongside the handler's own SKILL.md - same harness-level preloading mechanism, zero runtime file reads. Strengthen the Recommendation spec. Standardize all skills to the 5-field option format. Add formatting rules and escalation templates to fixme-task.

### Key files

| File | Role | Change |
|------|------|--------|
| `.claude/skills/fixme-decision-presentation/SKILL.md` | Shared decision format | **Create** |
| `.claude/agents/fixme-handle-code-review.md` | Handler agent definition | **Modify** - add second skill |
| `.claude/agents/fixme-handle-plan-review.md` | Handler agent definition | **Modify** - add second skill |
| `.claude/skills/fixme-handle-code-review/SKILL.md` | Code review handler instructions | **Modify** - replace inline guidelines with pointer |
| `.claude/skills/fixme-handle-plan-review/SKILL.md` | Plan review handler instructions | **Modify** - replace inline guidelines with pointer |
| `.claude/skills/fixme-pr-comments/SKILL.md` | PR comment analyzer | **Modify** - replace Step 2.5 format, add Impact/Effort |
| `.claude/skills/fixme-task/SKILL.md` | Pipeline orchestrator | **Modify** - Loop Guards + Directive Validation escalation formats |

### What NOT to change

- `install.sh` - already matches `fixme*` glob, picks up `fixme-decision-presentation` automatically
- `fixme-write-plan/SKILL.md` - has its own question format for planning-phase questions (different domain)
- `fixme-session/SKILL.md` - already uses structured AskUserQuestion
- `fixme-task/SKILL.md` ASK_USER Batching section - already rewritten (done in current session)
- Agent definitions for non-handler agents - they don't produce decision output

---

## Tasks

### Task 1: Create the shared fixme-decision-presentation skill

**Files:**
- Create: `.claude/skills/fixme-decision-presentation/SKILL.md`

- [ ] **Step 1: Create the skill directory and SKILL.md**

Create `.claude/skills/fixme-decision-presentation/SKILL.md` with the following content. This is the canonical decision presentation format that all handler and presenter skills reference.

````markdown
---
name: fixme-decision-presentation
description: Shared decision presentation guidelines for the fixme pipeline. Defines the canonical format for ASK_USER and FIX_UNCLEAR decision blocks presented to users. Preloaded into handler agents via skills frontmatter.
---

# Decision Presentation Guidelines

These guidelines govern how ASK_USER and FIX_UNCLEAR items are presented to users for decision-making. Every skill that produces or presents decisions MUST follow this format.

For ASK_USER, the decision is about validity ("is this a real issue?"). For FIX_UNCLEAR, the decision is about approach ("how should we fix this?").

## Core Principle

The Question field is what the user reads to make a decision. It must be **self-contained** - the user should understand the situation and be able to decide without re-reading the finding, the plan, or the code.

Follow **top-down progressive disclosure**: lead with context (establish the domain and mental model), state what needs deciding, then provide the details needed to decide well.

## Decision Block Structure

Format ASK_USER and FIX_UNCLEAR Question fields as structured decision blocks:

```
## Decision: {short descriptive title}

**Context**: {Establish WHERE in the system this happens - the feature, component, or
module involved. Build just enough mental model for the reader to understand the question.
Define any non-obvious concepts before referencing them. Include clickable file references
with line numbers (e.g., `[auth.ts:42](/absolute/path/auth.ts#L42)`) for every
file/line mentioned.}

**The question**: {One clear statement of what specifically needs to be decided. Not a
paragraph - one or two sentences max.}

**Options**:

1. **{Option A name}**
   - Approach: {what this looks like concretely - files, patterns, APIs involved}
   - Pros: {specific advantages grounded in this codebase, not generic platitudes}
   - Cons: {specific disadvantages grounded in this codebase}
   - Impact: {effects on performance, UX, maintainability, security - only dimensions
     that actually differ between options}
   - Effort: {relative cost to implement - "trivial", "small", "moderate", "significant"}

2. **{Option B name}**
   - Approach: {same structure - cross-reference option A where the contrast matters}
   - Pros: ...
   - Cons: ...
   - Impact: ...
   - Effort: ...

{...more options if genuinely distinct - not variations of the same thing}

**Recommendation**: Option {X}.

{State what you investigated to reach this conclusion - which code you read, what
behavior you traced, what documentation you checked. Then explain WHY this option wins
given the specific tradeoffs above. Cross-reference the Options: name which Pros are
decisive, which Cons are acceptable, how Impact differs. The reasoning must be grounded
in THIS codebase and THIS situation - not generic preference.

The user should be able to just say "yes" if they agree, or disagree with specific
reasoning if they don't.}
```

## Formatting Rules (NON-NEGOTIABLE)

All decision output must be visually scannable. Dense walls of text are never acceptable.

- **Blank line between every section, heading, and paragraph.** No two content blocks should be adjacent without a separator.
- **Use headings** (`##`, `###`) to separate major sections. The user must be able to skim headings to find what they need.
- **Use horizontal rules** (`---`) between independent decision blocks when presenting multiple decisions.
- **Bold key labels** (`**Context**:`, `**The question**:`, etc.) and start each on its own line.
- **One idea per line/bullet.** Never combine two pieces of information into one bullet.
- **Clickable file references everywhere.** Every file path is a markdown link with absolute path and line numbers: `[schema.test.ts:132-143](/absolute/path/schema.test.ts#L132-L143)`. No plain-text paths.

## Option Rules

- **All 5 sub-fields are mandatory** for every option: Approach, Pros, Cons, Impact, Effort. If Impact is identical across all options, say "Same as Option A" rather than omitting.
- **Options are mandatory** for FIX_UNCLEAR. For ASK_USER, include options when there are genuinely different directions (fix vs. defer vs. ignore). When the question is purely "is this a real issue?", you can omit Options and instead present the evidence for and against under Context.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options.** When Option B's main advantage is that it avoids Option A's biggest con, say so explicitly. Don't make the reader connect the dots.

## Recommendation Rules

- **Recommendation is mandatory.** Always. No exceptions.
- **Research before recommending.** Read code, check docs, trace call paths. Never recommend based on general preference.
- **Show your work.** State what you investigated (files read, behavior traced, docs checked). The user needs to evaluate whether your research was sufficient.
- **Cross-reference the Options section.** Name which Pros are decisive and which Cons are acceptable. Don't just restate the option description.
- **Grounded in specifics.** Reference actual code, API behavior, data volumes, or user-facing impact from THIS codebase. "This is more scalable" without evidence is not acceptable.

## Quality Bar

- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: context and mental model first, then the question, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with absolute path and line numbers. No exceptions.
````

- [ ] **Step 2: Verify the file was created correctly**

Run: `ls -la .claude/skills/fixme-decision-presentation/SKILL.md`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-decision-presentation/SKILL.md
git commit -m "feat(fixme): add shared decision-presentation skill"
```

---

### Task 2: Update handler agent definitions to preload shared skill

**Files:**
- Modify: `.claude/agents/fixme-handle-code-review.md`
- Modify: `.claude/agents/fixme-handle-plan-review.md`

- [ ] **Step 1: Add fixme-decision-presentation to fixme-handle-code-review agent**

In `.claude/agents/fixme-handle-code-review.md`, change the `skills` frontmatter from:

```yaml
skills:
  - fixme-handle-code-review
```

to:

```yaml
skills:
  - fixme-handle-code-review
  - fixme-decision-presentation
```

No other changes to this file.

- [ ] **Step 2: Add fixme-decision-presentation to fixme-handle-plan-review agent**

In `.claude/agents/fixme-handle-plan-review.md`, change the `skills` frontmatter from:

```yaml
skills:
  - fixme-handle-plan-review
```

to:

```yaml
skills:
  - fixme-handle-plan-review
  - fixme-decision-presentation
```

No other changes to this file.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/fixme-handle-code-review.md .claude/agents/fixme-handle-plan-review.md
git commit -m "feat(fixme): preload decision-presentation skill in handler agents"
```

---

### Task 3: Replace inline guidelines in fixme-handle-code-review

**Files:**
- Modify: `.claude/skills/fixme-handle-code-review/SKILL.md`

- [ ] **Step 1: Replace the Decision Presentation Guidelines section**

In `.claude/skills/fixme-handle-code-review/SKILL.md`, replace the entire section from line 96 (`## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)`) through line 155 (`- **Clickable**: every file reference is a markdown link with line numbers. No exceptions.`). IMPORTANT: Line 157 starts a DIFFERENT top-level `## Rules` section (general classification rules) that must NOT be touched. Only replace lines 96-155. Replace with:

```markdown
## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)

**The full guidelines are preloaded from the `fixme-decision-presentation` skill.** Follow them exactly for all ASK_USER and FIX_UNCLEAR Question fields.

Key requirements (see preloaded skill for complete spec):
- The Question field must be the FULL structured decision block - `## Decision:` heading, `**Context**:`, `**The question**:`, `**Options**:` with all 5 sub-fields (Approach, Pros, Cons, Impact, Effort), and `**Recommendation**:` with research evidence
- Never compress the Question field into a flat paragraph or omit sub-fields
- Every file reference must be a clickable markdown link with absolute path and line numbers
- Blank line between every section - no dense walls of text
- Recommendation must show what was investigated and cross-reference the Options section's tradeoffs
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-handle-code-review/SKILL.md
git commit -m "refactor(fixme): replace inline decision guidelines with shared skill reference in code review handler"
```

---

### Task 4: Replace inline guidelines in fixme-handle-plan-review

**Files:**
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md`

- [ ] **Step 1: Replace the Decision Presentation Guidelines section**

In `.claude/skills/fixme-handle-plan-review/SKILL.md`, replace the entire section from line 70 (`## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)`) through line 131 (`- **Clickable**: every file reference is a markdown link with line numbers. No exceptions.`). IMPORTANT: Line 133 starts a DIFFERENT top-level `## Rules` section (general classification rules) that must NOT be touched. Only replace lines 70-131. Replace with:

```markdown
## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)

**The full guidelines are preloaded from the `fixme-decision-presentation` skill.** Follow them exactly for all ASK_USER and FIX_UNCLEAR Question fields.

Key requirements (see preloaded skill for complete spec):
- The Question field must be the FULL structured decision block - `## Decision:` heading, `**Context**:`, `**The question**:`, `**Options**:` with all 5 sub-fields (Approach, Pros, Cons, Impact, Effort), and `**Recommendation**:` with research evidence
- Never compress the Question field into a flat paragraph or omit sub-fields
- Every file reference must be a clickable markdown link with absolute path and line numbers
- Blank line between every section - no dense walls of text
- Recommendation must show what was investigated and cross-reference the Options section's tradeoffs
```

This is identical to Task 3's replacement text. Both handlers produce the same type of output.

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-handle-plan-review/SKILL.md
git commit -m "refactor(fixme): replace inline decision guidelines with shared skill reference in plan review handler"
```

---

### Task 5: Standardize fixme-pr-comments Step 2.5

**Files:**
- Modify: `.claude/skills/fixme-pr-comments/SKILL.md`

- [ ] **Step 1: Replace Step 2.5 decision format**

In `.claude/skills/fixme-pr-comments/SKILL.md`, replace the Step 2.5 section starting at line 458 (`### 2.5. User Consultation for Ambiguous Fixes`) through line 512 (`- User said "up to you" / "your call" / equivalent for specific items (use recommendation for those)`) with the text below. Lines 514-516 ("Once all decisions are resolved, merge them into the fix list...") remain unchanged - they describe classification outcomes, not presentation format, and are still correct.

```markdown
### 2.5. User Consultation for Ambiguous Fixes

**Skip this step if there are no `FIX_UNCLEAR` or `ASK_USER` items.** Proceed directly to Step 3.

Gather ALL `FIX_UNCLEAR` and `ASK_USER` items and present them to the user in a single structured write-up.

**Follow the Decision Presentation Guidelines from the `fixme-decision-presentation` skill** (read it at `~/.claude/skills/fixme-decision-presentation/SKILL.md`). Each decision point uses the full structured decision block format:

- `## Decision {N}: {short title}` heading
- `**Context**:` establishing WHERE in the codebase and WHAT the code does, with clickable file references
- `**The question**:` one clear statement of what needs deciding
- `**Options**:` each with all 5 sub-fields: Approach, Pros, Cons, Impact, Effort
- `**Recommendation**:` with research evidence - what was investigated, why this option wins, cross-referencing the tradeoffs from Options

**Presentation rules**:

- Be specific and concrete - reference actual file names, function names, line numbers
- All file references must be clickable markdown links with absolute paths and line numbers
- Options must be genuinely distinct approaches, not variations of the same thing
- Pros/cons must be grounded in the actual codebase context, not generic platitudes
- The recommendation must show what was researched and explain WHY for this specific situation
- Keep each decision point self-contained - the user should understand it without scrolling back
- Blank line between every section - decisions separated by `---` horizontal rules

After presenting ALL decision points, ask the user a SINGLE question:

> Please provide your decisions for the above. You can answer by number (e.g., "1: A, 2: B")
> or describe your preferred approach. Reply "go with recommendations" to accept all
> recommended options.

**Consultation loop**:

1. Parse the user's response. Map each answer to its decision point.
2. For any decision point NOT addressed in the response, collect them as "remaining questions".
3. If remaining questions exist, re-present ONLY those (same format as above) and ask again.
4. Repeat until ALL decisions are resolved.

**Exit conditions** (any one ends the loop):

- User answered all decision points explicitly
- User said "go with recommendations" or equivalent (use recommended option for all unanswered)
- User said "up to you" / "your call" / equivalent for specific items (use recommendation for those)
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-pr-comments/SKILL.md
git commit -m "refactor(fixme): standardize pr-comments decision format to shared guidelines"
```

---

### Task 6: Add Loop Guards escalation template to fixme-task

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md`

- [ ] **Step 1: Replace Loop Guards section**

In `.claude/skills/fixme-task/SKILL.md`, replace the Loop Guards section (lines 619-622, from `## Loop Guards` through the outer loop bullet) with:

````markdown
## Loop Guards

- **Phase review loop**: max `phase.review.maxCycles` iterations (default 3). If FIX items remain after max cycles, escalate to user using the format below.
- **Outer loop**: max 2 iterations. If FIX items remain after 2 full cycles, escalate to user using the format below.

### Loop Guard Escalation Format

When escalating persistent issues to the user, follow top-down progressive disclosure. No routing metadata. The user needs enough context to make an informed decision.

```markdown
## Pipeline Escalation: {phase name} review

The {phase name} review has run {N} cycles. {M} issues were fixed across iterations,
but {K} remain unresolved.

### Unresolved Issues

{For each remaining FIX item:}

**{N}. {short title}**

- **What**: {one sentence - what's wrong, with clickable file/line references}
- **Why it persists**: {one sentence - why prior iterations didn't resolve it
  (e.g., fix introduced a new issue, fix broke tests, competing constraints)}
- **Impact if shipped as-is**: {one sentence - what breaks or degrades}

### How to proceed

1. **Proceed to next phase** - Ship with these known issues.
   Risk: {concrete statement of what will happen, e.g., "Users will see X when Y"}

2. **Provide guidance** - Tell me how to approach these differently.
   I'll revise and re-enter the review loop.

3. **Abort** - Stop the pipeline. No further changes.
```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "feat(fixme): add structured Loop Guards escalation template"
```

---

### Task 7: Add Directive Validation escalation format to fixme-task

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md`

- [ ] **Step 1: Replace Directive Validation escalation step**

In `.claude/skills/fixme-task/SKILL.md`, in the Directive Validation section, replace step 4 (line ~404, starting `4. **If the re-dispatched agent also returns without the expected directive**`) with:

````markdown
4. **If the re-dispatched agent also returns without the expected directive**: escalate to user with structured context. Do NOT advance the manifest.

   Present the escalation using this format:

   ```markdown
   ## Agent Escalation: {agent name} failed twice

   **What was dispatched**: {agent name} for the {phase name} phase, handling {brief task description}.

   **First attempt**: {2-3 sentences - what the agent produced before truncation/failure.
   Name specific outputs: files created, tests written, findings classified.}

   **Second attempt**: {2-3 sentences - same structure.}

   **What remains incomplete**: {specific items the agent didn't finish - e.g., "verification
   gate did not run", "3 of 7 findings not yet classified", "HANDLER_RESULT directive missing"}

   ### How to proceed

   1. **Retry with guidance** - I'll re-dispatch with specific instructions you provide.
   2. **Skip this step** - Advance to the next manifest step. Risk: {what gets skipped}.
   3. **Abort** - Stop the pipeline.
   ```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "feat(fixme): add structured Directive Validation escalation format"
```

---

### Task 8: Install and verify

- [ ] **Step 1: Run install.sh**

Run: `./install.sh`

Expected output should include `Installed fixme-decision-presentation` among the other installed skills.

- [ ] **Step 2: Verify shared skill was installed**

Run: `ls ~/.claude/skills/fixme-decision-presentation/SKILL.md`
Expected: file exists

- [ ] **Step 3: Verify agent definitions were installed**

Run: `grep -A2 'skills:' ~/.claude/agents/fixme-handle-code-review.md`
Expected output:
```
skills:
  - fixme-handle-code-review
  - fixme-decision-presentation
```

Run: `grep -A2 'skills:' ~/.claude/agents/fixme-handle-plan-review.md`
Expected output:
```
skills:
  - fixme-handle-plan-review
  - fixme-decision-presentation
```

- [ ] **Step 4: Commit if any uncommitted changes remain**

All changes should already be committed from prior tasks. Run `git status` to confirm clean working tree (except for pre-existing untracked files).
