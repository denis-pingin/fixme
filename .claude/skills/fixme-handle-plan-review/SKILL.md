---
name: fixme-handle-plan-review
description: Validate and triage review findings of an implementation plan. Classify each finding as FIX, NO-FIX, or ASK-USER with reasoning, confidence, and suggested approach. Reads the actual codebase to verify each finding against reality.
---

# Plan Review Feedback

Validate review findings against the codebase and classify each as FIX, NO-FIX, or ASK-USER.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if file paths are passed as arguments, use them
2. **Conversation context**: if findings and plan are in the current conversation, use them
3. **IDE context**: if the user has a file open/selected, use it
4. **Ask**: prompt the user for the findings and plan locations

Read the plan, the findings, and the spec/context document (if referenced) before proceeding.

If a decision log exists at `.fixme/decisions.md`, read it. Also read the plan's Locked Decisions section in its Context. These are settled user choices from prior ASK-USER questions.

## Classification

- **FIX** - real issue that affects correctness, performance, security, or maintainability
- **NO-FIX** - false positive, stylistic preference, already handled, or net-negative to change
- **ASK-USER** - insufficient context to classify confidently. The finding might be valid but depends on intent, constraints, or decisions that aren't captured in the plan, spec, or codebase. Requires human input to resolve

## Process

For each finding:

1. Read the actual code referenced by the finding
2. Verify the finding's characterization of what the code does - do not trust it blindly
3. Check whether the plan's context/spec explains the approach
4. Check finding against locked decisions. If the finding contradicts a locked decision:
   - If the finding reveals the locked decision causes a concrete problem (bug, security issue, data loss): classify ASK-USER. In the Question, explain what new evidence suggests the previous decision may need revisiting, and recommend a path forward. The user can confirm, override, or modify their original decision.
   - If the finding merely disagrees with the approach chosen by the locked decision: classify NO-FIX. The user already made this call.
5. Assess whether the suggested change would actually improve the outcome
5. Classify and document

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Finding** | One-line summary of the reviewer's concern |
| **Classification** | FIX / NO-FIX / ASK-USER |
| **Confidence** | HIGH / MEDIUM / LOW |
| **Why** | 1-2 sentences. For FIX: what breaks or degrades. For NO-FIX: why it's wrong, irrelevant, or already covered. For ASK-USER: what's unknown and why it matters |
| **Question** | (ASK-USER only) A self-contained briefing for the user. See ASK-USER Question Guidelines below |
| **Approach** | (FIX only) Concrete steps to resolve - name files, functions, patterns. No hand-waving |
| **Risk** | (FIX only) What could go wrong with the fix itself |
| **Blast radius** | (FIX only) Which files/tests/behaviors are affected |

### Output Ordering

Group related findings that would be addressed by the same fix. Order: FIX (HIGH confidence first), then ASK-USER, then NO-FIX.

## ASK-USER Question Guidelines

The Question field is what the user reads. It must be self-contained - the user should understand the problem and be able to answer without re-reading the finding, the plan, or the code.

### Structure

Break the question into these sections (skip any that don't apply):

1. **Problem**: what the reviewer flagged and why it might matter. 1-2 sentences, plain language, right level of abstraction - don't over-explain what the user already knows, don't under-explain what they'd need to look up.
2. **Context**: where this happens and why. Include clickable file references with line numbers (e.g., `[auth.ts:42](src/auth.ts#L42)`) for every file/line mentioned. Never use plain text file paths.
3. **Why it matters**: the concrete impact if the finding is valid - what breaks, degrades, or becomes harder to maintain.
4. **Options** (if applicable): the possible directions, each in one line. Not a debate - just the choices and their tradeoffs.
5. **Recommendation**: do research first (read code, check docs, trace call paths) and provide the best recommendation with reasoning. The user should be able to just say "yes" if they agree. Never ask without a recommendation.
6. **The actual question**: a single, direct question the user can answer in one sentence.

### Quality bar

- **Digestible**: short paragraphs, no walls of text. If it takes more than 30 seconds to read, it's too long.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Actionable**: the user should know exactly what decision they're being asked to make.
- **Neutral**: present the tradeoff honestly. Don't bias toward FIX or NO-FIX in how the question is framed.
- **Clickable**: every file reference is a markdown link with line numbers. No exceptions.

## Rules

- Read the actual code before classifying. Don't trust the finding's characterization of what the code does.
- A finding that's technically correct but would make the code worse is NO-FIX. Explain the tradeoff.
- If a finding is ambiguous or context is lacking, classify as ASK-USER rather than guessing. A wrong FIX wastes implementation time. A wrong NO-FIX hides a real issue. ASK-USER costs only a question.
- If two findings would be resolved by the same change, group them and note it.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is NO-FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK-USER with new evidence.
