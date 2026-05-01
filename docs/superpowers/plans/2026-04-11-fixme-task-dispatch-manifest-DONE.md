# Fixme-Task Dispatch Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force fixme-task to expand the pipeline into a flat, numbered dispatch manifest (via TodoWrite) before dispatching any agent, making it structurally impossible to skip review phases.

**Architecture:** Replace the conditional Phase Execution Loop ("does this phase have a review?") with a mandatory Dispatch Manifest that enumerates every step — including review and handler steps — as explicit entries. The manifest is created with TodoWrite and followed mechanically.

**Tech Stack:** Markdown skill files, TodoWrite tool

---

### Task 1: Update Agent Definition

**Files:**
- Modify: `.claude/agents/fixme-task.md:4` (tools line)
- Modify: `.claude/agents/fixme-task.md:20` (role section)

- [ ] **Step 1: Add TodoWrite to tools list**

Change line 4 from:
```
tools: Agent, Read, Write, Bash
```
to:
```
tools: Agent, Read, Write, Bash, TodoWrite
```

- [ ] **Step 2: Add manifest rule to role hard boundaries**

Add after the "NEVER apply fixes directly" line:
```
- ALWAYS build a dispatch manifest with TodoWrite before dispatching the first agent - the manifest is the execution law
```

- [ ] **Step 3: Verify the agent definition reads coherently**

Read the full file and confirm the tools list and role section are consistent.

---

### Task 2: Update Orchestrator Tool Allowlist

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md:144-152`

- [ ] **Step 1: Add TodoWrite to the allowlist**

Add this line after the Bash entry:
```
- **TodoWrite** - to create and track the dispatch manifest steps
```

- [ ] **Step 2: Verify the allowlist section**

Read lines 144-153 and confirm TodoWrite is listed.

---

### Task 3: Replace Phase Execution Loop + Backward Transitions with Dispatch Manifest

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md:154-199`

Replace lines 154-199 (the `## Phase Execution Loop` section including `### Backward Transitions (Outer Loop)`) with the following:

- [ ] **Step 1: Replace the section**

New content:

````markdown
## Dispatch Manifest (NON-NEGOTIABLE)

Before dispatching ANY agent, expand the full pipeline into a flat, numbered dispatch manifest using TodoWrite. Every step — including review and handler steps — becomes an explicit entry. This eliminates conditional branching ("does this phase have a review?") and makes skipping review phases structurally impossible.

### Building the Manifest

Always build the manifest for ALL phases in the pipeline, regardless of entry point. For each phase, add entries in this order:

1. One dispatch entry per skill in `phase.skills`
2. If `phase.review` exists and `review.enabled !== false`:
   a. One dispatch entry per skill in `phase.review.skills` (reviewer first, then handler)
   b. One routing entry with explicit jump targets

After the last phase: add a "Run Summary" entry.

Tag each entry with its phase name and step type: `[phase-name]` for execute steps, `[phase-name/review]` for review steps, `[phase-name/route]` for routing steps.

**Entry point marking:** After building the full manifest, apply the entry point. Mark all steps before the entry point as `completed`. Set the entry point step to `in_progress`. All subsequent steps remain `pending`. This ensures the full manifest exists for cross-phase backward jumps, while execution starts from the correct point.

### Example: Default Pipeline Manifest

For the hardcoded default pipeline (no ticket):

```
Step 1  [plan]              Dispatch fixme-write-plan
Step 2  [plan/review]       Dispatch fixme-review-plan
Step 3  [plan/review]       Dispatch fixme-handle-plan-review
Step 4  [plan/route]        Route: CLEAN->5, HAS_FIX->1 (max 3), HAS_ASK_USER->ask then re-run 3
Step 5  [implement]         Dispatch fixme-execute-plan
Step 6  [implement/review]  Dispatch fixme-review-code
Step 7  [implement/review]  Dispatch fixme-handle-code-review
Step 8  [implement/route]   Route: CLEAN->9, HAS_FIX->1 (outer, max 2), HAS_ASK_USER->ask then re-run 7
Step 9  [done]              Run Summary
```

The manifest always contains ALL steps. When entering mid-pipeline (e.g., plan already exists), pre-entry steps are marked `completed` so backward jumps have valid targets. Example: entering at implement phase marks steps 1-4 as `completed` and step 5 as `in_progress`.

### Routing Rules

Each routing entry specifies explicit jump targets:

- **CLEAN**: advance to the next numbered step
- **HAS_FIX (intra-phase)**: jump back to the phase's first execute step. Increment the phase review counter. If counter > `phase.review.maxCycles` (default 3): escalate to user.
- **HAS_FIX (cross-phase)**: jump back to the earlier phase's first execute step. Increment the outer loop counter. If counter > 2: escalate to user. If ticket path provided: dispatch ticket backward transition with `--reason` before re-entering.
- **HAS_ASK_USER**: batch questions to user (see ASK_USER Batching), write to decision log, re-dispatch the handler (go back to the handler entry, NOT this routing step). Do NOT advance past the routing step until the handler returns CLEAN or HAS_FIX.

### Creating the Manifest with TodoWrite

After building the manifest, create it using TodoWrite. One todo per step. All steps start as `pending` for a fresh pipeline, or with pre-entry steps as `completed` for mid-pipeline entry:

**Fresh start (no prior state):**
```
TodoWrite([
  { content: "Step 1 [plan] Dispatch fixme-write-plan", status: "in_progress", activeForm: "Dispatching fixme-write-plan" },
  { content: "Step 2 [plan/review] Dispatch fixme-review-plan", status: "pending", activeForm: "Dispatching fixme-review-plan" },
  { content: "Step 3 [plan/review] Dispatch fixme-handle-plan-review", status: "pending", activeForm: "Dispatching fixme-handle-plan-review" },
  { content: "Step 4 [plan/route] Route on HANDLER_RESULT", status: "pending", activeForm: "Routing on plan review result" },
  { content: "Step 5 [implement] Dispatch fixme-execute-plan", status: "pending", activeForm: "Dispatching fixme-execute-plan" },
  { content: "Step 6 [implement/review] Dispatch fixme-review-code", status: "pending", activeForm: "Dispatching fixme-review-code" },
  { content: "Step 7 [implement/review] Dispatch fixme-handle-code-review", status: "pending", activeForm: "Dispatching fixme-handle-code-review" },
  { content: "Step 8 [implement/route] Route on HANDLER_RESULT", status: "pending", activeForm: "Routing on code review result" },
  { content: "Step 9 [done] Run Summary", status: "pending", activeForm: "Writing run summary" }
])
```

**Mid-pipeline entry (plan exists, entering at plan review):**
```
TodoWrite([
  { content: "Step 1 [plan] Dispatch fixme-write-plan", status: "completed", activeForm: "Dispatching fixme-write-plan" },
  { content: "Step 2 [plan/review] Dispatch fixme-review-plan", status: "in_progress", activeForm: "Dispatching fixme-review-plan" },
  ...remaining steps as pending...
])
```

### Following the Manifest

Execute steps in order. After each dispatch:

1. Process the output (see Step Processing below)
2. Mark the current step `completed` via TodoWrite
3. Set the next step to `in_progress`
4. Dispatch the next agent — or jump per routing rules

**Never skip steps. Never combine steps. Never "optimize" the sequence. The manifest is the law.**

**Never treat any step as pipeline completion unless it is the Run Summary step.** If uncompleted steps remain in the manifest, the pipeline is not done. If you feel like outputting a completion message and there are pending steps, STOP — you are about to skip remaining phases.

### Ticket Transitions

If ticket path is provided, dispatch ticket transitions before each phase's first execute step:

- First phase: include `--pipeline <pipeline-name>`
- Backward re-entry (HAS_FIX cross-phase jump): include `--reason <reason>`

Ticket transitions are dispatched inline before the execute step — they are not separate manifest entries. They do not produce output that affects routing.
````

- [ ] **Step 2: Verify the new section**

Read the section and confirm:
- The example manifest matches the hardcoded default pipeline (plan with review maxCycles 3, implement with review maxCycles 2)
- Routing rules cover all three handler results
- TodoWrite example is syntactically valid
- The section flows logically from Config Loading to Sub-Skill Dispatch

---

### Task 4: Replace Step-by-Step Transition Procedures with Step Processing

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md:330-409`

Replace lines 330-409 (the `## Step-by-Step Transition Procedures` section) with the following:

- [ ] **Step 1: Replace the section**

New content:

````markdown
## Step Processing

Follow these procedures after each agent dispatch returns. The manifest determines WHICH step comes next. These procedures determine HOW to process each step type.

### Directive Validation (NON-NEGOTIABLE)

Every agent dispatch has an expected routing directive in its output. Before processing, you MUST validate that the directive is present:

| Agent type | Expected directive | Example |
|---|---|---|
| Phase skill (executor) | `EXECUTOR_STATUS: COMPLETE` + `NEXT_PIPELINE_STEP: <skill>` | End of fixme-execute-plan output |
| Review handler | `HANDLER_RESULT: CLEAN\|HAS_FIX\|HAS_ASK_USER` | End of fixme-handle-*-review output |

**If the expected directive is MISSING from the agent's output**, the agent is incomplete — it was truncated (hit context/output limit), crashed, or otherwise failed to finish. This is NOT "agent done without a directive."

**Recovery procedure:**

1. **Do NOT take over the agent's work.** Do not run tests, commit code, verify output, or do anything the agent was supposed to do. You are a dispatcher.
2. **Do NOT advance to the next manifest step.** The current step is incomplete.
3. **Re-dispatch the agent automatically (once).** Construct a resume prompt:
   - For **executors**: include the plan path, a summary of what the previous dispatch accomplished (based on its truncated output), and instruct it to continue from the last completed plan step.
   - For **review handlers**: re-dispatch with the same inputs as the original dispatch (findings, plan path, decision log).
   - For **other phase skills**: re-dispatch with the original inputs plus a summary of what was already produced.
4. **If the re-dispatched agent also returns without the expected directive**: escalate to user. Report which agent was dispatched twice, what it produced each time, and what remains incomplete. Do NOT advance the manifest.

**The temptation**: When an executor returns without its directive but the output looks "mostly done" (tests seem to pass, code looks committed), it feels natural to just run verification yourself, confirm it's good, and move on. This is the exact failure mode this rule prevents. "Mostly done" without the directive means the agent's own verification gate did not run to completion. Your manual check is NOT equivalent — you lack the agent's accumulated context about what was changed and why, and you will skip the review phase that exists to catch what manual checks miss.

### Processing by Step Type

**Execute steps** (`[phase]` entries — phase skills like fixme-write-plan, fixme-execute-plan):

1. Validate the directive if one is expected (executors produce `EXECUTOR_STATUS: COMPLETE`)
2. Capture the agent's full output as accumulated context for subsequent steps
3. Mark step `completed`, set next step to `in_progress`, dispatch next agent

**Review steps** (`[phase/review]` entries — reviewers like fixme-review-plan, fixme-review-code):

1. Capture the agent's full output (these are findings)
2. Mark step `completed`, set next step to `in_progress`
3. Pass the findings as input to the handler dispatch (the next manifest step)

**Handler steps** (`[phase/review]` entries — handlers like fixme-handle-plan-review, fixme-handle-code-review):

1. Validate the routing directive: `HANDLER_RESULT: CLEAN|HAS_FIX|HAS_ASK_USER`
2. Capture the handler's full output
3. Mark step `completed`, set next step to `in_progress` (the routing step)

**Routing steps** (`[phase/route]` entries):

1. Read the HANDLER_RESULT from the previous handler's output
2. Follow the routing rules specified in the manifest entry:
   - **CLEAN**: mark step `completed`, advance to the next numbered step
   - **HAS_FIX**: mark step `completed`, jump back to the target step specified in the manifest. Check loop guards before jumping (see Loop Guards). When jumping back, reset ALL steps from the target step through the current routing step to `pending`, then set the target step to `in_progress`. This ensures the full loop (including review steps) runs again — resetting only the target would leave intermediate steps as `completed` and they'd be skipped.
   - **HAS_ASK_USER**: batch questions to user (see ASK_USER Batching). Write answers to decision log. Re-dispatch the handler (set the handler step back to `in_progress`). Do NOT mark this routing step `completed` until the handler returns CLEAN or HAS_FIX.
3. Do NOT apply fixes yourself. Do NOT proceed without dispatching.

**Run Summary step** (`[done]` entry):

1. Mark step `in_progress`
2. Output the Run Summary (see format below)
3. Mark step `completed`. Pipeline is DONE.
````

- [ ] **Step 2: Verify the new section**

Read the section and confirm:
- Directive validation is preserved in full (critical safety mechanism)
- All step types are covered (execute, review, handler, routing, run summary)
- TodoWrite state transitions are explicit (pending -> in_progress -> completed)
- Routing step handling covers all three handler results
- The section references Loop Guards and ASK_USER Batching sections (which are kept unchanged)

---

### Task 5: Install and Verify

- [ ] **Step 1: Read the full modified SKILL.md**

Read the entire file to verify:
- All sections flow logically
- No dangling references to removed sections ("Phase Execution Loop", "Backward Transitions", "After fixme-execute-plan returns")
- The Dispatch Manifest section is referenced from Sub-Skill Dispatch and other sections that need it
- No duplicate content between Dispatch Manifest routing rules and Loop Guards

- [ ] **Step 2: Run install.sh**

```bash
cd /Users/denis/projects/denis/ai/fixme && ./install.sh
```

- [ ] **Step 3: Verify installed copies**

```bash
diff .claude/agents/fixme-task.md ~/.claude/agents/fixme-task.md
diff .claude/skills/fixme-task/SKILL.md ~/.claude/skills/fixme-task/SKILL.md
```

Both diffs should show no differences.
