---
name: fixme-review-plan
description: Review an implementation plan for correctness, completeness, and feasibility. Outputs structured findings with evidence and severity. Reads the actual codebase to verify every claim. Designed to minimize false positives.
argument-hint: "<path to plan file>"
---

# Review Plan

Review an implementation plan and produce high-quality, evidence-backed findings.

## Input Resolution

Resolve the plan to review in this order:
1. **Argument**: if a file path is passed as an argument, use it
2. **IDE context**: if the user has a file open/selected, use it
3. **Convention**: check `.fixme/plans/` for the most recent plan
4. **Ask**: prompt the user for the plan location

Read the plan fully before proceeding. If a specification or context document is referenced in the plan, read that too.

## Two-Pass Review Process

**The review is a two-pass process. Do not emit findings as you discover them.**

### Pass 1: Investigation (internal, not in output)

Read the plan, read the codebase, identify candidate issues. For each candidate, run it through the Pre-Review Gate below. This is your thinking process - none of it appears in the final output.

- If gate-checking reveals the candidate is not actually an issue, discard it silently. Do NOT include retracted, dismissed, or "on further analysis, no issue" findings in the output. If you talked yourself out of it, it's not a finding.
- If gate-checking reveals uncertainty, move it to Questions.
- If the candidate survives all gates, promote it to a confirmed finding.

### Pass 2: Report (the actual output)

Write ONLY confirmed findings that survived Pass 1. The report should contain zero artifacts of your investigation process - no "I initially thought X but then realized Y", no retracted findings, no findings where the Evidence is "N/A" or the Confidence is "N/A".

## Pre-Review Gate

Before promoting ANY candidate to a finding, pass it through every gate. If it fails any gate, drop it silently.

1. **Did I read the relevant source code?** If no, read it first. Plans often reference patterns that exist in the codebase but aren't spelled out.
2. **Does the spec/context explain this?** The plan may look odd in isolation but make sense given constraints not yet internalized. Re-read the spec.
3. **Is this an intentional tradeoff?** Plans often choose a suboptimal approach in one dimension to optimize another. If suspected, note it as a question, not a finding.
4. **Am I sure about the API/framework behavior I'm assuming?** If the finding depends on how a library works, verify against the actual dependency version in the project. Do not rely on general knowledge - APIs change.
5. **Would fixing this actually improve the outcome?** Technically correct feedback that makes the plan worse (more complex, slower to ship, harder to maintain) is bad feedback.
6. **Does this contradict a locked decision?** If the plan includes a Locked Decisions section in its Context, those are settled user choices. Do not flag findings that disagree with locked decisions. If a locked decision itself appears problematic (would cause a bug, break something), frame it as a question in the Questions section, not as a finding.
7. **Is the severity consistent with the actual impact?** If your own analysis concludes "functionally correct", "minor cosmetic", or "not blocking", the finding cannot be IMPORTANT or BLOCKING. Either downgrade to MINOR or drop it entirely. A finding whose suggestion starts with "Minor" or "Consider" is almost certainly not IMPORTANT.

## What to Look For

### Correctness
- Steps that won't work as described given the actual codebase state
- Wrong assumptions about existing APIs, types, data shapes (verify by reading code)
- Race conditions, ordering issues, missing error propagation
- Steps that contradict each other

### Completeness
- Missing steps that are implied but not explicit (especially cleanup, error handling, state reset)
- Happy path only - no handling of failure modes that are likely in practice
- Missing test steps for behavioral changes
- Migrations, backwards compatibility, or rollback not addressed when they should be

### Feasibility
- Steps that assume APIs or capabilities that don't exist in the dependencies
- Performance implications that aren't acknowledged (N+1 queries, unnecessary re-renders, large payloads)
- Steps that would require changes outside the plan's stated scope

### Architecture
- Does the plan fight existing patterns or work with them?
- Will the result be maintainable by someone who didn't write the plan?
- Are there simpler approaches that achieve the same outcome?

### Ordering and Dependencies
- Steps that depend on outputs of later steps
- Parallelizable work that's sequenced unnecessarily (observation, not a problem)
- Missing verification checkpoints between risky phases

## What NOT to Flag

- Style preferences or naming opinions
- **Cosmetic issues** - field ordering in config/frontmatter, whitespace, formatting of generated files, indentation preferences. If it's "functionally correct but looks different", it's not a finding.
- Alternative approaches that aren't clearly better - only flag if the planned approach has a concrete flaw
- Missing error handling for scenarios that genuinely can't happen given the codebase
- "Best practices" that don't apply to the specific context (e.g., suggesting pagination for a list that's bounded to 10 items)
- Vague concerns ("this might be slow") without evidence - either quantify it or don't mention it
- Anything where your own analysis concludes "no issue" - if you investigated and found it works correctly, that's Pass 1 doing its job. Don't report it.

## Output Format

### Per Finding

| Field | Description |
|-------|-------------|
| **Location** | Which plan step(s) this relates to |
| **Category** | CORRECTNESS / COMPLETENESS / FEASIBILITY / ARCHITECTURE / ORDERING |
| **Severity** | BLOCKING (plan will fail) / IMPORTANT (plan will work but with significant issues) / MINOR (improvement opportunity) |
| **Issue** | What's wrong - be specific. Reference actual file paths, function names, types |
| **Evidence** | The code, spec section, or dependency doc that supports the claim |
| **Suggestion** | How to fix it. Concrete enough to act on. If unsure of the best fix, say so and offer options |
| **Confidence** | HIGH / MEDIUM / LOW - be honest. LOW confidence findings are fine to include IF they're BLOCKING severity |

### Final Output Structure

1. **Summary**: 1-2 sentences - is this plan ready to execute, or does it need revision? Be direct.
2. **Findings**: ordered by severity (BLOCKING first, then IMPORTANT, then MINOR). Within severity, CORRECTNESS before other categories.
3. **Questions**: things that couldn't be determined from the code/spec that the plan author should clarify.

## Rules

- Fewer high-quality findings >>> many low-quality ones. 5 real issues beats 20 maybes.
- NEVER critique what hasn't been verified against the codebase. "I think this API doesn't support X" is not a finding. Read the code, confirm, then report.
- If unsure whether something is an issue, frame it as a question: "Does X handle Y? I couldn't confirm from reading [file]." Questions are cheaper than wrong findings.
- Separate "the plan won't work" (correctness) from "the plan could be better" (suggestions). Don't mix them.
- If the plan is good and there are no findings, say so. Don't manufacture issues to justify the review.
