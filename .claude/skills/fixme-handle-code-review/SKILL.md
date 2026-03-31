---
name: fixme-handle-code-review
description: Validate and triage code review findings from a post-execution review. Classify each finding as FIX, NO-FIX, or ASK-USER. Reads the plan, spec, implementation, and tests to distinguish real issues from false positives caused by misunderstood context, intent, or approach. Designed to eliminate harmful, incorrect, or context-blind feedback before it reaches implementation.
disable-model-invocation: true
---

# Code Review Feedback

Validate code review findings against the plan, the spec, and the actual implementation. Classify each as FIX, NO-FIX, or ASK-USER.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if file paths are passed as arguments, use them
2. **Conversation context**: if findings, plan, and code are in the current conversation, use them
3. **IDE context**: if the user has a file open/selected, use it
4. **Ask**: prompt the user for the findings, plan, and implementation locations

Before classifying anything, read all of these:
- The review findings
- The implementation plan
- The spec/task description (if referenced)
- Every file the findings reference (full file, not just the cited lines)
- The test files the findings reference (full file)
- Neighboring files when the finding is about conventions or patterns
- The decision log at `.fixme/decisions.md` (if it exists) and the plan's Locked Decisions section. These are settled user choices.

## Classification

- **FIX** - real issue that affects correctness, behavior, security, performance, test quality, or maintainability. Fixing it will improve the implementation without breaking anything or contradicting the plan's intent.
- **NO-FIX** - false positive. The finding is wrong, irrelevant, already handled, based on misunderstood context, or would make things worse if applied. Applying it would be harmful, break things, or contradict the task/approach.
- **ASK-USER** - the finding might be valid but the classification depends on intent, priorities, constraints, or design decisions not captured in the plan, spec, or code. A human decision is needed.

## Pre-Classification Gate

For each finding, before classifying:

1. **Read the actual implementation.** Not just the lines the finding cites - the full function, the full file if needed. Context around the cited code often explains why it was written that way.
2. **Read the plan step that produced it.** If the code follows the plan exactly and the reviewer disagrees with the approach, that's a plan-level concern, not a code fix. Classify NO-FIX and note it's a plan design disagreement.
3. **Read the spec/task.** The reviewer may not have understood the original intent. A finding that says "this doesn't handle X" when X is explicitly out of scope is NO-FIX.
4. **Verify API/framework claims.** If the finding says "this API doesn't work like that" - check the actual dependency version in the project. Reviewers get this wrong frequently.
5. **Check if the finding would break something.** Trace the suggested change through callers, tests, and dependent code. A finding that's locally correct but breaks something downstream is NO-FIX (or needs a larger approach).
6. **Check if "improvement" adds risk.** Refactoring suggestions that touch working code to make it "cleaner" add regression risk for aesthetic benefit. Unless there's a concrete flaw, NO-FIX.
7. **Does this contradict a locked decision?** If yes: does the finding reveal a concrete problem not visible when the decision was made? If so, classify ASK-USER with new evidence. If the finding merely disagrees with the chosen approach, classify NO-FIX. The user already made this call.

## Common False Positive Patterns

These frequently produce NO-FIX findings. Be especially skeptical:

- **"Missing error handling"** for paths that are structurally impossible given the caller or the types
- **"Should use X instead of Y"** when Y is the established pattern in this codebase
- **"Performance concern"** without evidence of actual impact (bounded lists, one-time operations, cold paths)
- **"Missing test for X"** when X is out of the plan's scope
- **"Inconsistent with best practice"** when the codebase consistently does it differently
- **"This could be simplified"** when the "simpler" version loses readability or explicitness
- **Test findings based on misreading the production code** - the reviewer didn't understand what the function does, so they think the test is wrong

## Code-Review-Specific Considerations

Unlike plan review findings, code review findings interact with running software. Additional checks:

- **Would the fix pass the existing tests?** If the fix would break passing tests, it's either wrong or requires test updates too. If the finding doesn't account for this, it's incomplete - classify ASK-USER or NO-FIX.
- **Does the fix match the plan's architecture?** A finding that pushes toward a different architecture than the plan specified is a plan disagreement, not a code fix.
- **Is the test finding about test quality or about production code?** A finding saying "this test reimplements business logic" is about the test. A finding saying "this function has a bug" is about production code. Don't conflate them - they have different fix approaches.
- **Would reverting to make the reviewer happy reintroduce the bug/gap the plan was fixing?** If yes, NO-FIX.

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Finding** | One-line summary of the reviewer's concern |
| **Classification** | FIX / NO-FIX / ASK-USER |
| **Confidence** | HIGH / MEDIUM / LOW |
| **Why** | 1-2 sentences. For FIX: what's actually wrong and why fixing it improves things. For NO-FIX: why the finding is wrong, irrelevant, or harmful to apply. For ASK-USER: what's unknown and why it matters |
| **Question** | (ASK-USER only) A self-contained briefing for the user. See ASK-USER Question Guidelines below |
| **Approach** | (FIX only) Concrete steps to resolve - name files, functions, what to change. Must not break existing passing tests |
| **Risk** | (FIX only) What could go wrong with the fix itself |
| **Blast radius** | (FIX only) Which files/tests/behaviors are affected |

### Output Ordering

Group related findings that would be addressed by the same fix. Order: FIX (HIGH confidence first), then ASK-USER, then NO-FIX.

### Summary

End with a summary section:
1. **Verdict**: how many FIX / NO-FIX / ASK-USER
2. **Overall assessment**: is the implementation solid with minor issues, or does it need significant rework?
3. **NO-FIX rationale summary**: 1-2 sentences explaining the common thread behind rejected findings (helps calibrate future reviews)

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

- Read the actual code, plan, AND spec before classifying. A finding classified without full context is likely wrong.
- A finding that's technically correct but would make the code worse is NO-FIX. Explain the tradeoff.
- A finding that contradicts the plan's explicit approach is NO-FIX unless the plan's approach is demonstrably broken in practice (not just "could be better").
- If two findings would be resolved by the same change, group them.
- When in doubt between FIX and NO-FIX, classify ASK-USER. A wrong FIX wastes implementation time and can introduce bugs. A wrong NO-FIX hides a real issue. ASK-USER costs only a question.
- The NO-FIX rationale summary is mandatory. If you can't articulate why findings were rejected, you didn't analyze them carefully enough.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is NO-FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK-USER with new evidence.

## Routing Directive

End your output with a structured routing block that tells the orchestrator exactly what to do next. This is mandatory.

```
---
HANDLER_RESULT: CLEAN | HAS_FIX | HAS_ASK_USER
FIX_COUNT: <number>
ASK_USER_COUNT: <number>
NEXT_ACTION: DONE | OUTER_LOOP | ASK_USER_BATCH
```

- `CLEAN` (0 FIX, 0 ASK-USER): orchestrator outputs Run Summary, pipeline ends
- `HAS_FIX` (1+ FIX, 0 ASK-USER): orchestrator dispatches fixme-write-plan in code revision mode with the FIX items, entering the next outer loop iteration. The orchestrator MUST NOT apply fixes itself.
- `HAS_ASK_USER` (1+ ASK-USER): orchestrator batches questions to user before routing FIX items
