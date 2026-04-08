---
name: fixme-handle-code-review
description: Validate and triage code review findings from a post-execution review. Classify each finding using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the plan, spec, implementation, and tests to distinguish real issues from false positives caused by misunderstood context, intent, or approach. Designed to eliminate harmful, incorrect, or context-blind feedback before it reaches implementation.
disable-model-invocation: true
---

# Code Review Feedback

Validate code review findings against the plan, the spec, and the actual implementation. Classify each using the unified finding taxonomy.

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

- **FIX** - real issue that affects correctness, behavior, security, performance, test quality, or maintainability. A single clear fix approach exists. Fixing it will improve the implementation without breaking anything or contradicting the plan's intent.
- **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist, tradeoffs are involved, or the fix might require changes the finding doesn't account for (e.g., test updates, upstream changes). The issue's validity is not in question - only the approach.
- **ASK_USER** - the finding might be valid but classification depends on intent, priorities, constraints, or design decisions not captured in the plan, spec, or code. A human decision is needed to determine validity.
- **REJECT_FALSE_POSITIVE** - finding is factually wrong. The code is correct, the reviewer misunderstood the implementation, the API behavior, or the codebase conventions.
- **REJECT_WONT_FIX** - finding is technically valid but implementing it would make things worse, contradicts the plan's approach (which is not demonstrably broken), contradicts a locked decision, or adds regression risk for marginal benefit.
- **REJECT_ALREADY_FIXED** - the issue described is already addressed in the current implementation or was fixed in a prior iteration.

## Pre-Classification Gate

For each finding, before classifying:

1. **Read the actual implementation.** Not just the lines the finding cites - the full function, the full file if needed. Context around the cited code often explains why it was written that way.
2. **Read the plan step that produced it.** If the code follows the plan exactly and the reviewer disagrees with the approach, that's a plan-level concern, not a code fix. Classify REJECT_WONT_FIX and note it's a plan design disagreement.
3. **Read the spec/task.** The reviewer may not have understood the original intent. A finding that says "this doesn't handle X" when X is explicitly out of scope is REJECT_FALSE_POSITIVE.
4. **Verify API/framework claims.** If the finding says "this API doesn't work like that" - check the actual dependency version in the project. Reviewers get this wrong frequently.
5. **Check if the finding would break something.** Trace the suggested change through callers, tests, and dependent code. A finding that's locally correct but breaks something downstream is REJECT_WONT_FIX (or if the broader approach is unclear, FIX_UNCLEAR).
6. **Check if "improvement" adds risk.** Refactoring suggestions that touch working code to make it "cleaner" add regression risk for aesthetic benefit. Unless there's a concrete flaw, REJECT_WONT_FIX.
7. **Does this contradict a locked decision?** If yes: does the finding reveal a concrete problem not visible when the decision was made? If so, classify ASK_USER with new evidence. If the finding merely disagrees with the chosen approach, classify REJECT_WONT_FIX. The user already made this call.

## Common False Positive Patterns

These frequently produce REJECT_FALSE_POSITIVE or REJECT_WONT_FIX findings. Be especially skeptical:

- **"Missing error handling"** for paths that are structurally impossible given the caller or the types
- **"Should use X instead of Y"** when Y is the established pattern in this codebase
- **"Performance concern"** without evidence of actual impact (bounded lists, one-time operations, cold paths)
- **"Missing test for X"** when X is out of the plan's scope
- **"Inconsistent with best practice"** when the codebase consistently does it differently
- **"This could be simplified"** when the "simpler" version loses readability or explicitness
- **Test findings based on misreading the production code** - the reviewer didn't understand what the function does, so they think the test is wrong

## Code-Review-Specific Considerations

Unlike plan review findings, code review findings interact with running software. Additional checks:

- **Would the fix pass the existing tests?** If the fix would break passing tests, it's either wrong or requires test updates too. If the finding doesn't account for this, it's incomplete - classify ASK_USER, FIX_UNCLEAR, or REJECT_WONT_FIX.
- **Does the fix match the plan's architecture?** A finding that pushes toward a different architecture than the plan specified is a plan disagreement, REJECT_WONT_FIX (plan design disagreement).
- **Is the test finding about test quality or about production code?** A finding saying "this test reimplements business logic" is about the test. A finding saying "this function has a bug" is about production code. Don't conflate them - they have different fix approaches.
- **Would reverting to make the reviewer happy reintroduce the bug/gap the plan was fixing?** If yes, REJECT_WONT_FIX.

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Finding** | One-line summary of the reviewer's concern |
| **Classification** | FIX / FIX_UNCLEAR / ASK_USER / REJECT_FALSE_POSITIVE / REJECT_WONT_FIX / REJECT_ALREADY_FIXED |
| **Confidence** | HIGH / MEDIUM / LOW |
| **Why** | 1-2 sentences. For FIX: what's actually wrong and why fixing it improves things. For FIX_UNCLEAR: what's wrong AND what makes the fix approach ambiguous (name the competing approaches). For REJECT_*: why the finding is wrong, irrelevant, or harmful to apply. For ASK_USER: what's unknown and why it matters |
| **Question** | (ASK_USER and FIX_UNCLEAR only) For ASK_USER: a self-contained briefing on whether this is a real issue. For FIX_UNCLEAR: a self-contained briefing presenting the competing fix approaches. See Question Guidelines below |
| **Approach** | (FIX only) Concrete steps to resolve - name files, functions, what to change. Must not break existing passing tests. For FIX_UNCLEAR: omitted (user chooses approach first) |
| **Risk** | (FIX only) What could go wrong with the fix itself |
| **Blast radius** | (FIX only) Which files/tests/behaviors are affected |

### Output Ordering

Group related findings that would be addressed by the same fix. Order: FIX (HIGH confidence first), then FIX_UNCLEAR, then ASK_USER, then REJECT_* items.

### Summary

End with a summary section:
1. **Verdict**: how many FIX / FIX_UNCLEAR / ASK_USER / REJECT_FALSE_POSITIVE / REJECT_WONT_FIX / REJECT_ALREADY_FIXED
2. **Overall assessment**: is the implementation solid with minor issues, or does it need significant rework?
3. **REJECT rationale summary**: 1-2 sentences explaining the common thread behind rejected findings (group by rejection sub-type if the reasons differ)

## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)

The Question field is what the user reads to make a decision. It must be self-contained - the user should understand the situation and be able to decide without re-reading the finding, the plan, or the code. Follow top-down progressive disclosure: lead with context, state what needs deciding, then provide the details needed to decide well.

### Structure

Format the Question field as a structured decision block:

```
## Decision: {short descriptive title}

**Context**: {Establish WHERE in the system this happens - the feature, component, or
module involved. Build just enough mental model for the reader to understand the question.
Define any non-obvious concepts before referencing them. Include clickable file references
with line numbers (e.g., `[auth.ts:42](src/auth.ts#L42)`) for every file/line mentioned.}

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
   - Approach: {same structure - cross-reference option 1 where the contrast matters}
   - Pros: ...
   - Cons: ...
   - Impact: ...
   - Effort: ...

{...more options if genuinely distinct - not variations of the same thing}

**Recommendation**: Option {X} - {concrete reasoning tied to THIS specific situation.
Reference actual code, API behavior, data volumes, or user-facing impact. Explain WHY
this option wins given the tradeoffs above, not just that you prefer it. The user should
be able to just say "yes" if they agree.}
```

### Rules

- **Options are mandatory** for FIX_UNCLEAR. For ASK_USER, include options when there are genuinely different directions (fix vs. defer vs. ignore). When the question is purely "is this a real issue?", you can omit Options and instead present the evidence for and against under Context.
- **Recommendation is mandatory**. Always. Do research first (read code, check docs, trace call paths). Never ask without a recommendation.
- **Options must be genuinely distinct** approaches, not variations of the same thing. If two options only differ in a minor detail, merge them and note the variation.
- **Cross-reference between options**. When Option B's main advantage is that it avoids Option A's biggest con, say so explicitly. Don't make the reader connect the dots.

### Quality bar

- **Self-contained**: the reader understands the full situation from this block alone, without scrolling back or re-reading code.
- **Top-down**: context and mental model first, then the question, then the details. Never reference a concept before establishing it.
- **Concrete**: actual file names, function names, line numbers, data volumes, error messages. "There's a size-related issue" is not acceptable - "the API returns 502 when payload exceeds 1MB" is.
- **Right abstraction level**: a question about API design doesn't need to explain what an API is. A question about a race condition does need to explain the specific timing window.
- **Neutral**: present the tradeoffs honestly. Don't bias toward FIX or REJECT in how the question is framed.
- **Scannable**: use the structured format above. Dense paragraphs are a last resort.
- **Clickable**: every file reference is a markdown link with line numbers. No exceptions.

## Rules

- Read the actual code, plan, AND spec before classifying. A finding classified without full context is likely wrong.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- A finding that contradicts the plan's explicit approach is REJECT_WONT_FIX unless the plan's approach is demonstrably broken in practice (not just "could be better").
- If two findings would be resolved by the same change, group them.
- When in doubt between FIX and REJECT, classify ASK_USER. If the issue is clearly valid but the approach is ambiguous, classify FIX_UNCLEAR. A wrong FIX wastes implementation time and can introduce bugs. A wrong REJECT hides a real issue. ASK_USER or FIX_UNCLEAR costs only a question.
- The REJECT rationale summary is mandatory. If you can't articulate why findings were rejected, you didn't analyze them carefully enough.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.

## Routing Directive

End your output with a structured routing block that tells the orchestrator exactly what to do next. This is mandatory.

```
---
HANDLER_RESULT: CLEAN | HAS_FIX | HAS_ASK_USER
FIX_COUNT: <number>
FIX_UNCLEAR_COUNT: <number>
ASK_USER_COUNT: <number>
NEXT_ACTION: DONE | OUTER_LOOP | ASK_USER_BATCH
```

- `CLEAN` (0 FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator outputs Run Summary, pipeline ends
- `HAS_FIX` (1+ FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator dispatches fixme-write-plan in code revision mode with the FIX items, entering the next outer loop iteration. The orchestrator MUST NOT apply fixes itself.
- `HAS_ASK_USER` (1+ FIX_UNCLEAR or ASK_USER): orchestrator batches questions to user before routing FIX items. FIX_UNCLEAR questions ask about approach. ASK_USER questions ask about validity.
