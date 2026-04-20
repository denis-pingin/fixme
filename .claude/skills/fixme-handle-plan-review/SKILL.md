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

- **FIX** - real issue that affects correctness, performance, security, or maintainability. Either a single clear fix approach exists, OR one approach clearly dominates all alternatives on merit (grounded in concrete tradeoffs, not editorial labels like "simpler"). If the reviewer presented multiple options, you MUST independently evaluate each before classifying as FIX - see Multi-Option Discipline.
- **FIX_UNCLEAR** - real issue, but the fix approach is ambiguous. Multiple viable strategies exist with genuine tradeoffs. This is the default classification whenever the reviewer offered 2+ options and your own independent evaluation does not produce a clear winner on the dimensions that matter (performance on common vs. rare paths, correctness, maintainability, user-visible impact). The issue's validity is not in question - only the approach to resolving it.
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

## Multi-Option Discipline

When a finding's Suggestion presents 2+ plausible fix approaches (including "drop the fix" or "add a comment" as options), apply this discipline before classifying. This section exists because the default failure mode is to anchor on whichever option the reviewer labeled "simpler" and collapse the decision without evaluation.

1. **Independently evaluate every option.** For each, assess concrete tradeoffs: correctness, performance on common vs. rare code paths, maintainability, user-visible behavior, security, effort, risk. Read the referenced code yourself. Do not outsource this evaluation to the reviewer - the reviewer's preference is a hypothesis, not the answer.

2. **Strike editorial shortcuts from your reasoning.** Words like "simpler", "easier", "cleaner", "lighter touch", "just X" are anchors, not arguments. A "simpler" option that makes every request pay an extra I/O round-trip is not simpler in the dimension that matters. If your justification for picking an option reduces to "the reviewer called it simpler", you have not done the evaluation.

3. **Classify based on the evaluation outcome:**
   - **One option clearly dominates** on the dimensions that matter, with no material downside → **FIX**. The Approach field records that option and cites WHY it wins on the concrete tradeoff (e.g. "hoist with guard: same performance as inline duplication, and eliminates the overlap duplication"), not on editorial language.
   - **Multiple options are viable** with genuine tradeoffs, or no option clearly dominates → **FIX_UNCLEAR**. The Question field presents every option with full Approach/Pros/Cons/Impact/Effort and a researched Recommendation (per the fixme-howto-present-decisions format). Let the user choose. This is the default when your evaluation does not produce a clear winner.
   - **Every option is strictly worse than the status quo** (including "drop the fix" as an option) → **REJECT_WONT_FIX**, with per-option disqualifying flaws listed. "Simpler to not do it" is not a disqualifying flaw.

4. **"Drop the fix" or "just add a comment" is not a free answer.** These resolutions require either proving the original concern was invalid (→ REJECT_FALSE_POSITIVE with evidence) OR proving every alternative is strictly worse than leaving the code alone (→ REJECT_WONT_FIX with a per-option evaluation). Collapsing a multi-option finding into "drop it" because one option was labeled "simpler" is the exact failure mode this section exists to prevent.

5. **Default to FIX_UNCLEAR when uncertain.** If you have evaluated every option and cannot confidently name a winner, that is FIX_UNCLEAR. The handler's job is to protect the user's ability to choose the best option, not to save them the decision by picking the path of least resistance.

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

**The full guidelines are preloaded from the `fixme-howto-present-decisions` skill.** Follow them exactly for all ASK_USER and FIX_UNCLEAR Question fields.

Key requirements (see preloaded skill for complete spec):

- The Question field must be the FULL structured decision block - `## Decision:` heading, `**Context**:`, `**The question**:`, `**Options**:` with all 5 sub-fields (Approach, Pros, Cons, Impact, Effort), and `**Recommendation**:` with research evidence
- Never compress the Question field into a flat paragraph or omit sub-fields
- Every file reference must be a clickable markdown link with absolute path and line numbers
- Blank line between every section - no dense walls of text
- Recommendation must show what was investigated and cross-reference the Options section's tradeoffs

## Rules

- Read the actual code before classifying. Don't trust the finding's characterization of what the code does.
- A finding that's technically correct but would make the code worse is REJECT_WONT_FIX. Explain the tradeoff.
- If a finding is ambiguous or context is lacking, classify as ASK_USER rather than guessing. If the finding is clearly valid but the fix approach is unclear, classify as FIX_UNCLEAR. A wrong FIX wastes implementation time. A wrong REJECT hides a real issue. ASK_USER or FIX_UNCLEAR costs only a question.
- If two findings would be resolved by the same change, group them and note it.
- Locked decisions are presumed correct. A finding that contradicts a locked decision is REJECT_WONT_FIX unless it reveals a concrete problem not visible when the decision was made - in which case ASK_USER with new evidence.
- Multi-option findings default to FIX_UNCLEAR. Collapsing multiple alternatives into a single "simpler" FIX approach - or into REJECT_WONT_FIX or "add a comment" - requires an independent evaluation that names concrete tradeoffs, not editorial labels. See Multi-Option Discipline.

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
