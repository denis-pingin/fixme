---
name: fixme-handle-plan-review
description: Validate and triage review findings of an implementation plan. Classify each finding using the unified taxonomy (FIX, FIX_UNCLEAR, ASK_USER, REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, REJECT_ALREADY_FIXED). Reads the actual codebase to verify each finding against reality.
disable-model-invocation: true
---

# Plan Review Feedback

Validate review findings against the codebase and classify each using the unified finding taxonomy.

## Input Resolution

Resolve inputs in this order:
1. **Argument**: if file paths are passed as arguments, use them
2. **Conversation context**: if findings and plan are in the current conversation, use them
3. **IDE context**: if the user has a file open/selected, use it
4. **Ask**: prompt the user for the findings and plan locations

Read the plan, the findings, and the spec/context document (if referenced) before proceeding.

If a decision log exists at `.fixme/decisions.md`, read it. Also read the plan's Locked Decisions section in its Context. These are settled user choices from prior ASK_USER and FIX_UNCLEAR questions.

## Classification

- **FIX** - real issue that affects correctness, performance, security, or maintainability. A single clear fix approach exists.
- **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist, or design tradeoffs are involved. The issue's validity is not in question - only the approach to resolving it.
- **ASK_USER** - insufficient context to determine whether the finding is even valid. Depends on intent, constraints, or decisions not captured in the plan, spec, or codebase. Requires human input to determine validity (not just approach).
- **REJECT_FALSE_POSITIVE** - finding is factually wrong. The plan is correct, the reviewer misunderstood the plan's approach, the codebase state, or the spec constraints.
- **REJECT_WONT_FIX** - finding is technically valid but intentionally out of scope, contradicts a locked decision (without revealing new concrete problems), or would be net-negative to address.
- **REJECT_ALREADY_FIXED** - the issue described is already addressed by the plan's current state or a prior revision.

## Process

For each finding:

1. Read the actual code referenced by the finding
2. Verify the finding's characterization of what the code does - do not trust it blindly
3. Check whether the plan's context/spec explains the approach
4. Check finding against locked decisions. Distinguish between `[confirmed]` decisions (user explicitly chose) and `[assumed]` decisions (user accepted recommendation by default or never explicitly answered):
   - **Finding contradicts a `[confirmed]` decision:**
     - If the finding reveals a concrete problem (bug, security issue, data loss): classify ASK_USER. Explain what new evidence suggests the previous decision may need revisiting, and recommend a path forward.
     - If the finding merely disagrees with the approach: classify REJECT_WONT_FIX. The user explicitly made this call.
   - **Finding contradicts an `[assumed]` decision:**
     - If the finding reveals a concrete problem: classify ASK_USER. The user never explicitly confirmed this decision, and new evidence suggests it's wrong.
     - If the finding offers a materially better alternative: classify ASK_USER. The user accepted this by default - they deserve to see the better option. Present both the assumed approach and the proposed alternative.
     - If the finding is a minor stylistic disagreement: classify REJECT_WONT_FIX.
   - **Finding identifies an `[assumed]` decision that should have been confirmed** (the reviewer flagged it as an Assumption Validity issue): classify ASK_USER. Present the decision and its alternatives to the user for explicit confirmation.
5. Assess whether the suggested change would actually improve the outcome
5. Classify and document

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Finding** | One-line summary of the reviewer's concern |
| **Classification** | FIX / FIX_UNCLEAR / ASK_USER / REJECT_FALSE_POSITIVE / REJECT_WONT_FIX / REJECT_ALREADY_FIXED |
| **Confidence** | HIGH / MEDIUM / LOW |
| **Why** | 1-2 sentences. For FIX: what breaks or degrades. For FIX_UNCLEAR: what breaks AND what makes the fix approach ambiguous (name the competing approaches). For REJECT_*: why it's wrong, irrelevant, or already covered. For ASK_USER: what's unknown and why it matters |
| **Question** | (ASK_USER and FIX_UNCLEAR only) For ASK_USER: a self-contained briefing on whether this is a real issue. For FIX_UNCLEAR: a self-contained briefing presenting the competing fix approaches. See Question Guidelines below |
| **Approach** | (FIX only) Concrete steps to resolve - name files, functions, patterns. No hand-waving. For FIX_UNCLEAR: omitted (user chooses approach first) |
| **Risk** | (FIX only) What could go wrong with the fix itself |
| **Blast radius** | (FIX only) Which files/tests/behaviors are affected |

### Output Ordering

Group related findings that would be addressed by the same fix. Order: FIX (HIGH confidence first), then FIX_UNCLEAR, then ASK_USER, then REJECT_* items.

## Decision Presentation Guidelines (ASK_USER and FIX_UNCLEAR)

These guidelines apply to both ASK_USER and FIX_UNCLEAR questions. For ASK_USER, the decision is about validity ('is this a real issue?'). For FIX_UNCLEAR, the decision is about approach ('how should we fix this?').

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

- Read the actual code before classifying. Don't trust the finding's characterization of what the code does.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- If a finding is ambiguous or context is lacking, classify as ASK_USER rather than guessing. If the finding is clearly valid but the fix approach is unclear, classify as FIX_UNCLEAR. A wrong FIX wastes implementation time. A wrong REJECT hides a real issue. ASK_USER or FIX_UNCLEAR costs only a question.
- If two findings would be resolved by the same change, group them and note it.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.

## Routing Directive

End your output with a structured routing block that tells the orchestrator exactly what to do next. This is mandatory.

```
---
HANDLER_RESULT: CLEAN | HAS_FIX | HAS_ASK_USER
FIX_COUNT: <number>
FIX_UNCLEAR_COUNT: <number>
ASK_USER_COUNT: <number>
NEXT_ACTION: PLAN_LOOP_EXIT | PLAN_REVISION | ASK_USER_BATCH
```

- `CLEAN` (0 FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator exits the plan loop and proceeds to fixme-execute-plan
- `HAS_FIX` (1+ FIX, 0 FIX_UNCLEAR, 0 ASK_USER): orchestrator dispatches fixme-write-plan in plan revision mode with the FIX items
- `HAS_ASK_USER` (1+ FIX_UNCLEAR or ASK_USER): orchestrator batches questions to user before routing FIX items. FIX_UNCLEAR questions ask about approach. ASK_USER questions ask about validity.
