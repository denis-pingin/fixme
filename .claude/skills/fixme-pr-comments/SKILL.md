---
name: fixme-pr-comments
description: Fetch PR feedback from the three GitHub API surfaces, normalize every fetched container into review_item records, analyze EVERY item individually with exact verdicts, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
argument-hint: "[--pause] [--skip-push] [--skip-commit] [--skip-resolve] [--skip-response]"
---

## Fixme Directory

This skill does not interact with `<fixme-dir>` directly. All pipeline state (decisions log, plans, config, ticket files - anything under the fixme directory) is owned exclusively by `fixme-task` and its sub-skills. This orchestrator's job is limited to:

1. Fetching PR comments
2. Analyzing each comment
3. Consulting the user on ambiguous fixes
4. Invoking `Skill("fixme-task", ...)` with the routed `CURRENT_PR_FIX` groups as a text argument
5. Verifying, committing, replying to comments, resolving threads

**Never use a literal `.fixme/` path or any `<fixme-dir>/` path in any tool.** Resolution rules and the full prohibition list are in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`). If you find yourself about to read `<fixme-dir>/decisions.md`, write `<fixme-dir>/plans/...`, list `<fixme-dir>`, or check whether `<fixme-dir>/config.json` exists, STOP. That is `fixme-task`'s job. Pass the routed current PR fix groups as text in the `Skill("fixme-task", args=...)` invocation and let `fixme-task` handle all state.

When `fixme-task`'s SKILL.md says "the orchestrator writes to the decision log", **the orchestrator means `fixme-task` itself**, not the caller of `Skill("fixme-task")`. Reading `fixme-task`'s SKILL.md and concluding "I should pre-write the decision log before dispatching" is a misinterpretation - exactly the failure mode this preamble exists to prevent.

# Address PR Comments

Automatically fetch, normalize, analyze, and address PR feedback from inline review threads, PR issue comments, and top-level PR review bodies.

## Hard Constraints

- **This skill is an analyzer and dispatcher.** It fetches comments, categorizes them, consults the user on ambiguous items, and dispatches fixme-task for fixes. It NEVER fixes code itself.
- **Never read source code except during analysis (Step 2).** Step 2 reads referenced code to determine if comments are valid. After categorization is complete, no more source code reads. All implementation happens inside fixme-task.
- **Never use Edit, Write, or Bash to modify source files.** If you catch yourself about to edit a source file, STOP - you are bypassing the pipeline. Even "just one line" must go through fixme-task. The pipeline exists to catch what your confidence blinds you to.
- **Never skip fixme-task dispatch for "simple" fixes.** The temptation is strongest when there's only 1 fix and it looks trivial. That is exactly when this constraint matters most - a one-line type change can break downstream consumers that the pipeline's review loop would catch.
- **"Inline fix" is a forbidden concept.** If the words "inline", "no pipeline needed", "fixing directly", or "just one line" appear in your output, you are about to violate the pipeline constraint. There is no inline path. Every FIX item goes through fixme-task dispatch. No exceptions, no size threshold, no shortcut.
- **Never touch `.fixme/` or `<fixme-dir>/` files. Ever.** See the "Fixme Directory" preamble above. The pipeline state is owned exclusively by `fixme-task`. Reading `fixme-task`'s SKILL.md and deciding to "persist resolved decisions before dispatching" is the exact failure mode this constraint prevents - decisions from Step 6 consultation are passed as text inputs to `Skill("fixme-task", args=...)`, never written to disk by this skill.

## Configuration

Parse arguments from skill invocation. All flags default to OFF (all phases run).

| Flag | Effect |
|------|--------|
| `--pause` | Pause for user confirmation after analysis, before execution |
| `--skip-push` | Skip `git push` after commit |
| `--skip-commit` | Skip both commit and push (implies `--skip-push`) |
| `--skip-resolve` | Skip resolving review threads and posting fix comments |
| `--skip-response` | Skip replying to comments (both fix explanations and not-a-bug replies) |

## Workflow Manifest (NON-NEGOTIABLE)

Before fetching any comments, expand the entire workflow into a flat, numbered manifest using TodoWrite. Every step - including routing decisions and conditional skips - becomes an explicit entry. This eliminates conditional branching ("did I present analysis yet?") and makes skipping the analysis-presentation gate structurally impossible.

### Building the Manifest

Always build the full 15-step manifest, regardless of which flags are set. Conditional steps still get manifest entries; the routing entries decide whether their bodies execute.

### The Manifest

```
Step 1   [fetch]            Fetch three GitHub API surfaces with mandatory pagination
Step 2   [fetch/display]    Normalize into review_item records and display all fetched items
Step 3   [analyze]          Analyze every item individually; classify with verdict
Step 4   [analyze/present]  Present `## PR Comment Analysis` to user
Step 5   [analyze/route]    Route: any FIX_UNCLEAR, ASK_USER, or ROUTE: DECISION -> 6, otherwise -> 7
Step 6   [consult]          Run consultation loop until all decisions are resolved
Step 7   [consult/route]    Route: zero CURRENT_PR_FIX groups remain -> 14, --pause -> 8, otherwise -> 9
Step 8   [confirm]          Present `## Ready to Execute` and wait for user response
Step 9   [dispatch]         Dispatch Skill("fixme-task") with routed CURRENT_PR_FIX groups
Step 10  [verify]           Run build/lint/test using project-documented commands
Step 11  [commit/route]     Route: --skip-commit -> 13, otherwise -> 12
Step 12  [commit]           Commit changes (and push unless --skip-push is set)
Step 13  [resolve/route]    Route: --skip-resolve -> 15, otherwise -> 14
Step 14  [resolve]          Build reply execution table, preflight reply bodies, then reply/resolve per surface/author rules
Step 15  [done]             Run summary
```

### Routing Rules

- **Step 5 (analyze/route)**: If at least one item was classified `FIX_UNCLEAR`, `ASK_USER`, or `ROUTE: DECISION`, advance to Step 6. Otherwise jump directly to Step 7.
- **Step 7 (consult/route)**: If after consultation zero `CURRENT_PR_FIX` groups remain (every item was rejected, already-fixed, or routed to follow-up only), jump to Step 14 to post replies and skip the dispatch path entirely. Otherwise: if `--pause` is set advance to Step 8; if not set, jump to Step 9.
- **Step 11 (commit/route)**: If `--skip-commit` is set, jump to Step 13. Otherwise advance to Step 12.
- **Step 13 (resolve/route)**: If `--skip-resolve` is set, jump to Step 15. Otherwise advance to Step 14.

### BLOCKING GATE

**Dispatching Step 9 (fixme-task) is forbidden until Step 4 (Present `## PR Comment Analysis`) is marked `completed` in TodoWrite.** Even if `--pause` is not set, the analysis presentation is mandatory - `--pause` only controls whether Step 8 (Ready to Execute confirmation) waits for the user. The analysis report is always shown.

If you find yourself with CURRENT_PR_FIX groups resolved and Step 4 is still `pending` or `in_progress`, you have skipped the gate. Stop. Present the analysis, mark Step 4 `completed`, then proceed.

### Creating the Manifest with TodoWrite

After deriving the manifest, create it via TodoWrite. Step 1 starts `in_progress`; all other steps start `pending`:

```
TodoWrite([
  { content: "Step 1 [fetch] Fetch three GitHub API surfaces with pagination", status: "in_progress", activeForm: "Fetching PR comments" },
  { content: "Step 2 [fetch/display] Normalize and display review_item records", status: "pending", activeForm: "Displaying fetched items" },
  { content: "Step 3 [analyze] Analyze every item individually", status: "pending", activeForm: "Analyzing comments" },
  { content: "Step 4 [analyze/present] Present `## PR Comment Analysis`", status: "pending", activeForm: "Presenting analysis" },
  { content: "Step 5 [analyze/route] Route on consultation need", status: "pending", activeForm: "Routing on consultation" },
  { content: "Step 6 [consult] Run consultation loop until all decisions resolved", status: "pending", activeForm: "Consulting user on ambiguous fixes" },
  { content: "Step 7 [consult/route] Route on remaining CURRENT_PR_FIX groups and --pause", status: "pending", activeForm: "Routing on confirmation" },
  { content: "Step 8 [confirm] Present `## Ready to Execute` and wait", status: "pending", activeForm: "Awaiting confirmation" },
  { content: "Step 9 [dispatch] Dispatch Skill(fixme-task) with CURRENT_PR_FIX groups", status: "pending", activeForm: "Dispatching fixme-task" },
  { content: "Step 10 [verify] Run build/lint/test", status: "pending", activeForm: "Running verification" },
  { content: "Step 11 [commit/route] Route on --skip-commit", status: "pending", activeForm: "Routing on commit" },
  { content: "Step 12 [commit] Commit and push", status: "pending", activeForm: "Committing changes" },
  { content: "Step 13 [resolve/route] Route on --skip-resolve", status: "pending", activeForm: "Routing on resolve" },
  { content: "Step 14 [resolve] Build reply execution table, preflight reply bodies, then reply/resolve", status: "pending", activeForm: "Resolving threads" },
  { content: "Step 15 [done] Run summary", status: "pending", activeForm: "Writing run summary" }
])
```

### Following the Manifest

Execute steps in order. After each step (whether a Bash command, an analysis, a presentation, a consultation, or a dispatch):

1. Process the output of the step
2. Mark the current step `completed` via TodoWrite
3. Set the next step (per routing rules) to `in_progress`
4. Execute the next step

**Never skip steps. Never combine steps. Never "optimize" the sequence. The manifest is the law.**

**Never treat any step as workflow completion unless it is Step 15 (Run summary).** If uncompleted steps remain in the manifest, the workflow is not done. If you feel like outputting a completion message and there are pending steps, STOP - you are about to skip remaining steps.

## Workflow

### 1. Fetch PR Feedback

Fetch three GitHub API surfaces. These are API storage surfaces, not reviewer identities:

| Surface | GitHub API | What it contains |
|---------|------------|------------------|
| `inline_review_threads` | GraphQL `pullRequest.reviewThreads` | Inline review conversations with `isResolved` state |
| `issue_comments` | REST `/issues/{number}/comments` | Top-level PR timeline comments, including Claude, Greptile, humans, and prior replies |
| `pull_request_reviews` | REST `/pulls/{number}/reviews` | Top-level review bodies from submitted PR reviews, including `chatgpt-codex-connector[bot]` |

Reviewer identities like Claude, Greptile, Codex, Copilot, and humans are parser and reply-strategy hints after normalization. Do not model each reviewer as a separate fetch source.

#### Surface 1: `inline_review_threads`

Get PR info and all review threads with GraphQL cursor pagination. Analyze only unresolved threads, but fetch enough metadata to know which threads are already resolved.

```bash
# Get PR number and repo info.
gh pr view --json number,headRefName,headRepository

# First page.
gh api graphql -f query='
query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {number}) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          path
          line
          comments(first: 10) {
            nodes {
              id
              databaseId
              author { login }
              body
              diffHunk
            }
          }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads'

# Repeat with reviewThreads(first: 100, after: "{endCursor}") until hasNextPage is false.
```

#### Surface 2: `issue_comments`

Fetch all PR issue comments once. Do not filter by author at fetch time; parser hints are assigned during normalization.

```bash
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate \
  --jq '[.[] | {
    id,
    user: .user.login,
    user_type: .user.type,
    created_at,
    body
  }]'
```

Known parser hints for this surface:

- `claude[bot]`: read the full body. Wrapper text like `**Claude finished @user's task in Xm Ys**` is only status text; actual findings may appear below a separator.
- `greptile-apps[bot]`: extract findings from `<!-- greptile_failed_comments -->`, confidence-score file references, and any "Remaining findings:" section. Replies must mention `@greptileai`; the fetch login is not the reply mention.
- Human or other non-AI author: read the full body and extract each actionable finding from prose, numbered lists, bullets, or quoted code blocks.
- Prior resolution comments: keep them as records. They may prove a later finding is already addressed, but they are not silently dropped.

#### Surface 3: `pull_request_reviews`

Fetch top-level PR review bodies. These are separate from review threads and issue comments; this is where Codex connector review summaries can appear.

```bash
gh api repos/{owner}/{repo}/pulls/{number}/reviews --paginate \
  --jq '[.[] | select(.body != null and (.body | length) > 0) | {
    id,
    user: .user.login,
    user_type: .user.type,
    state,
    submitted_at,
    body,
    html_url
  }]'
```

Known parser hints for this surface:

- `chatgpt-codex-connector[bot]`: read the full review body. Codex review summaries can contain actionable P0/P1/P2 findings even when there are zero unresolved review threads.
- Any other reviewer: read the full review body and extract each actionable finding the same way as top-level issue comments.

#### Normalize fetched containers

Normalize every fetched container into `review_item` records before analysis:

| Field | Meaning |
|-------|---------|
| `id` | Stable item ID: `T1`, `T2` for threads; `I1`, `I2` for issue-comment findings; `R1`, `R2` for PR-review findings |
| `surface` | `inline_review_thread`, `issue_comment`, or `pull_request_review` |
| `container_id` | GitHub thread ID, issue comment ID, or PR review ID |
| `author_login` | GitHub login that wrote the source container |
| `author_type` | GitHub user type, e.g. `Bot` or `User` |
| `body` | The exact finding text being analyzed |
| `parser_hint` | `inline_thread`, `claude_bot`, `greptile_summary`, `codex_review`, `generic_ai_review`, or `generic_human_review` |
| `reply_strategy` | `inline_thread_reply` or `issue_comment_reply` |
| `resolve_strategy` | `resolve_review_thread` or `none` |

One fetched container may yield multiple `review_item` records when its body contains multiple findings. Every fetched container must either produce finding records or produce one `REJECT_FALSE_POSITIVE` record that explains why the body contains no actionable finding.

For each specific `review_item`, check whether a later issue comment already addresses it. A later reply counts only if it was posted after the source container and explicitly references the same title, file path, or description plus a commit SHA or fixed/resolved wording. A reply for item X never addresses item Y by implication.

#### Display all normalized items

Display all surfaces in format:

```
## PR Comments ({count} total)

### Inline Review Threads ({count})
- **T1.** @author file.ts#line (thread_id: {id}):
  > comment text

### PR Issue Comments ({count})
- **I1.** [comment_id: {id}] @author file.ts#line (parser: claude_bot|greptile_summary|generic_human_review):
  > extracted finding or non-actionable body summary

### Top-Level PR Review Bodies ({count})
- **R1.** [review_id: {id}] @author (state: COMMENTED, parser: codex_review|generic_ai_review|generic_human_review):
  > extracted finding or non-actionable body summary
```

**Do not skip analysis based on source or author.** `ROUTE` is assigned only after Step 3 analysis. After Step 3, if every `review_item` has route `FOLLOWUP` or `NO_ACTION`, report "No current PR fixes to dispatch" and proceed to Step 14 if replies are needed.

### 2. Analyze Each Unresolved Comment

For each unresolved `review_item`:

1. **Read the referenced code** to understand the context
2. **Determine if it's a valid issue**:
   - Is it a real bug/problem?
   - Is the suggested fix correct?
   - Does it apply to the current code state?
3. **Categorize**:
   - `FIX`: Valid issue with a single clear solution - no ambiguity in how to fix it
   - `FIX_UNCLEAR`: Valid issue but multiple viable approaches exist, or tradeoffs/design choices are involved
   - `ASK_USER`: Cannot determine whether this is even a valid issue - need human input on validity (not just approach)
   - `REJECT_FALSE_POSITIVE`: Comment is incorrect or doesn't apply - the code is correct
   - `REJECT_ALREADY_FIXED`: Issue was already addressed
   - `REJECT_WONT_FIX`: Valid concern but intentional/out of scope
   - `FOLLOWUP_ONLY`: Valid concern, but not worth expanding the current PR because the fix is minor/high-complexity, informational, or outside the PR goal

4. **Assign triage metadata** to every `review_item` and deduplicated issue group:
   - `VERDICT: FIX | FIX_UNCLEAR | ASK_USER | REJECT_FALSE_POSITIVE | REJECT_ALREADY_FIXED | REJECT_WONT_FIX | FOLLOWUP_ONLY`
   - `SEVERITY: BLOCKER | MAJOR | MINOR | INFO`
   - `COMPLEXITY: LOW | MEDIUM | HIGH`
   - `CONFIDENCE: HIGH | MEDIUM | LOW`
   - `ROUTE: CURRENT_PR_FIX | DECISION | FOLLOWUP | NO_ACTION`
   - `ROUTE_SCOPE: PLAN_REQUIRED | IMPLEMENT_ONLY | NONE`

Keep the dimensions independent: severity decides importance, complexity decides execution shape, confidence decides autonomy. Do not use severity as a substitute for validity, and do not use low complexity as a substitute for importance.

**Severity definitions**:
- `BLOCKER`: Correctness, data loss, security, privacy, crash, migration, or public API risk that can break the PR goal or production behavior.
- `MAJOR`: Real behavioral, compatibility, reliability, test, or maintainability issue that should be fixed before this PR is accepted.
- `MINOR`: Real issue with limited blast radius, mostly local cleanup, narrow readability, small test hardening, or low-risk consistency.
- `INFO`: Educational note, optional observation, or future improvement that should not block or drive a fix loop.

**Complexity definitions**:
- `LOW`: One local file or mechanical change, no design choice, no cross-module contract change.
- `MEDIUM`: Multiple files, moderate test changes, or a contained design choice.
- `HIGH`: Cross-cutting change, new abstraction, migration, public contract change, or significant refactor.

**Confidence definitions**:
- `HIGH`: The referenced code and current state clearly confirm validity and the implementation path.
- `MEDIUM`: The issue is probably valid after code inspection, but some impact or implementation detail needs confirmation.
- `LOW`: Validity is uncertain. Route to `ASK_USER` instead of guessing.

**Routing matrix**:
- BLOCKER findings always route to CURRENT_PR_FIX.
- MAJOR + LOW or MEDIUM complexity + HIGH confidence routes to CURRENT_PR_FIX.
- MAJOR + HIGH complexity routes to CURRENT_PR_FIX with `ROUTE_SCOPE: PLAN_REQUIRED`.
- MINOR + LOW complexity + same touched area may be opportunistic CURRENT_PR_FIX.
- MINOR + MEDIUM or HIGH complexity routes to FOLLOWUP unless the user explicitly asks to include it.
- INFO never triggers fixme-task dispatch.
- LOW confidence on validity routes to ASK_USER.
- Valid issues with multiple defensible approaches route to FIX_UNCLEAR and DECISION.
- Duplicate comments about the same root cause become one issue group with all source IDs preserved.

`ROUTE_SCOPE` rules:
- Use `IMPLEMENT_ONLY` when the current plan remains correct and the fix is local implementation repair.
- Use `PLAN_REQUIRED` when the fix changes the plan, architecture, public contract, persistence, migration, or acceptance criteria.
- Use `NONE` for `FOLLOWUP`, `NO_ACTION`, and unresolved `DECISION` items.

**Distinguishing FIX vs FIX_UNCLEAR**: A fix is `FIX` when there is exactly one
reasonable way to address it (e.g., "add missing null check", "fix typo in variable name",
"add missing import", "handle uncaught error"). A fix is `FIX_UNCLEAR` when ANY of these
apply:
- Multiple valid implementation strategies exist with different tradeoffs
- The fix touches architecture or design patterns where a choice must be made
- Performance vs. readability vs. correctness tradeoffs are involved
- The reviewer's suggestion conflicts with existing patterns and either direction is defensible
- Scope is unclear - the fix could be minimal or could warrant a broader refactor

When in doubt, classify as `FIX_UNCLEAR`. It is far better to ask an unnecessary question
than to silently pick the wrong approach.

**Distinguishing FIX_UNCLEAR vs ASK_USER**: Use `FIX_UNCLEAR` when the issue is clearly valid
(it IS a bug or a real problem) but you need guidance on which fix approach to take. Use
`ASK_USER` when you cannot determine whether the comment even identifies a real issue - perhaps
the code behavior is intentional, or the context is insufficient to judge. When in doubt about
validity, use `ASK_USER`. When in doubt about approach (but not validity), use `FIX_UNCLEAR`.

#### Present categorization to the user

After analyzing all comments, present the results using the format below. This format is
mandatory - follow it exactly regardless of any other presentation guidelines.

**All file references in the report MUST be clickable markdown links with absolute file paths
and line numbers**, e.g. `[config.ts:42-58](/absolute/path/to/config.ts#L42-L58)`. This applies
to every file mentioned anywhere in the report - problem descriptions, fix descriptions, file
lists, decision context, options, everything. No plain-text file paths.

**Structure**: Group items by status, lead with what's already resolved, then what remains.
For each individual item, describe it top-down: context, what's wrong, what breaks, what will be done.

```
## PR Comment Analysis

{EXACT counts with full accounting. Format:
"N review items from 3 fetched surfaces (T inline review threads, I issue comments,
R pull request reviews), grouped into G issue groups. Routes: N current PR fix groups,
N decision groups, N follow-up groups, N already fixed groups, N not actionable groups
(N false positive, N won't fix)."
Every review_item must be accounted for - the numbers MUST sum to the total. If they
don't, you miscounted - recount before presenting. No vague quantifiers.}

---

### Triage Table

ID | Items | Verdict | Severity | Complexity | Confidence | Route | Scope | Files
---|---|---|---|---|---|---|---|---
{One row per deduplicated issue group. Every source item ID appears in exactly one row.}

### Execution Batches

{List only groups with `ROUTE: CURRENT_PR_FIX`. Batch by implementation dependency cluster, not by comment source.}

**B{N}. {batch title}** [`{ROUTE_SCOPE}`]
- **Groups**: {G1, G2, ...}
- **Why batched together**: {shared files, shared behavior, or same root cause}
- **Execution shape**: {implementation repair | plan-required change}
- **Review shape**: {focused re-review | full review}

Expand full evidence cards only for BLOCKER, MAJOR, FIX_UNCLEAR, ASK_USER, LOW confidence, or PLAN_REQUIRED groups. For lower-risk groups, keep the table row plus one concise planned-action line.

### Already Fixed (resolve immediately)
{List items confirmed fixed in the current code. For each:}
- **{ID}. {concrete issue name}** ({N} threads) - Fixed in `{commit_sha}`.
  {One sentence: what was wrong and how it was fixed.}

### Follow-Up Only ({N} groups)
{List valid but deferred groups. These are not rejections. For each:}

**{ID}. {issue name}** [`FOLLOWUP_ONLY`] [`{severity}`] [`{complexity}`]
- **What was reported**: {What the reviewer flagged.}
- **Why not in this PR**: {Why the valid concern is disproportionate for the current PR fix loop. Tie this to severity, complexity, PR goal, and blast radius.}
- **Follow-up action**: {Concrete follow-up title or "No durable follow-up artifact created" if the project has no follow-up backend in this workflow.}

### Not Actionable ({N} items)
{List REJECT_FALSE_POSITIVE, REJECT_WONT_FIX items. For each:}

**{ID}. {issue name}** [`{category}`]
- **What was reported**: {What the reviewer flagged and why they think it's a problem.
  Establish what code area this is about - the reader needs domain context to evaluate
  the dismissal.}
- **Why this is not an issue**: {For FALSE_POSITIVE: what the code actually does and why
  the reviewer's concern doesn't apply. For WONT_FIX: what the actual risk is, why it's
  acceptable now, and when/where it should be addressed (if ever). Be specific - name the
  code construct and explain the behavior.}

### Actionable Items ({N} distinct issues)

{For each deduplicated issue, present ALL of these fields:}

**{ID}. {Issue title}** [`{category}`] [`{severity}`] [`{complexity}`] [`{confidence}`]
- **Route**: `{ROUTE}` / `{ROUTE_SCOPE}`
- **What was reported**: {What the reviewer flagged - their exact concern, which file/line
  they pointed at, what they suggested. The reader needs to know the input before evaluating
  the analysis.}
- **Context**: {What area of the codebase this touches and what it does. The reader must
  understand the domain before evaluating the problem. Name the feature, subsystem, or flow
  this code belongs to, and what role the affected file/function plays in it.}
- **What's actually happening**: {Your independent analysis of the code. What the code does,
  why it's wrong, how you verified. May confirm the reviewer's concern, refine it, or identify
  a different root cause. Describe as behavior, not code mechanics.}
- **Impact if not fixed**: {What breaks, degrades, or is at risk. User-visible or system-visible
  consequences. Include severity signal: is this causing failures now, or is it a latent risk
  under specific conditions?}
- **Recommended fix**: {Describe the resulting behavior so the reader can independently judge
  whether the fix is correct. For non-trivial fixes, explain why this approach over alternatives.
  For FIX_UNCLEAR: "Requires approach decision - see below."
  For ASK_USER: "Requires validity determination - see below."}
- **Effort**: {LOW | MEDIUM | HIGH, matching `COMPLEXITY`}
- **Files**: {[file.ts:line](/absolute/path/file.ts#Lline), [file2.ts:line](/absolute/path/file2.ts#Lline)}
- **Review items**: {N} ({list IDs and authors: T1 reviewer-login, I2 claude[bot], R1 chatgpt-codex-connector[bot]})

{Repeat for every actionable item.}
```

##### Presentation Rules (NON-NEGOTIABLE)

These rules govern how every finding in the report is written. The reader is a developer
reviewing PR feedback - they need to quickly understand each issue, judge its validity, and
evaluate whether the planned fix is correct. Every item must be independently comprehensible
without referring to any other part of the report or the codebase.

**1. Establish context before the issue.**
Every finding starts by explaining WHERE we are in the codebase and WHAT this code does. The
reader must build a mental model of the domain before encountering the problem.

- BAD: "Unsafe cast at system boundary in `processData`."
- GOOD: "`processData` in spec-store.ts:90 handles incoming webhook payloads - it parses raw
  JSON from external providers and transforms it into typed domain objects for the processing
  pipeline. The cast happens at the boundary between the untyped KV store read and the typed
  internal API."

**2. Never reference code symbols without explaining what they represent.**
Every variable, function, class, or technical term must be introduced with what it IS and what
it DOES before being used in the explanation. Assume the reader last looked at this file weeks ago.

- BAD: "The `svc` return type changed."
- GOOD: "The `svc` variable (the singleton instance of the configuration service - the central
  registry for feature flags and rate limits) had its `getLimit()` method changed to return
  `Result<Limit>` instead of a raw `Limit`, meaning every caller now needs to unwrap the result."

**3. Describe problems and fixes as behavior, not code mechanics.**
Frame issues in terms of what changes for the user or the system, not what lines of code are wrong.

- BAD: "Missing null check on line 42."
- GOOD: "When a webhook arrives with a missing `event_type` field (which happens with legacy
  integrations), the handler throws an untyped TypeError instead of returning a 400 response.
  The caller gets a 500 and no actionable error message."

**4. Make planned fixes self-evident, not assertive.**
Describe the resulting behavior so the reader can independently judge whether the fix is correct.

- BAD: "Will add validation."
- GOOD: "Will add a Zod schema check at the handler entry point that rejects payloads missing
  `event_type` with a 400 response including the field name. Existing valid payloads are
  unaffected - the schema matches the current TypeScript type exactly."

**5. Ground impact in behavior, not just locations.**
When describing what breaks, explain the user-visible or system-visible consequence.

- BAD: "Affects the API response."
- GOOD: "API consumers receive a 500 with a stack trace instead of a structured 400 error,
  making it impossible to programmatically distinguish bad input from server failures."

**6. One idea per bullet. No compound explanations.**
Each point conveys exactly one thing. If a sentence has "and also" or packs two issues, split them.

**7. No hedging without specifics.**
Don't write "there might be implications" or "this could affect other areas." Either you
checked and found specific impacts (list them), or you checked and found nothing (say what
you searched for and that it came back clean).

**8. Separate what was reported from what you found.**
The "What was reported" field presents the reviewer's claim. "What's actually happening" (or
"Why this is not an issue") presents your independent analysis. Never blend the two - the reader
needs to see both to judge whether your analysis actually addresses the reviewer's concern.

- BAD (blended): "The reviewer noted that JSON.parse is unsafe, and indeed the schema should
  handle deserialization."
- GOOD (separated): What was reported: "Reviewer flagged raw JSON.parse at the R2 boundary,
  noting this PR replaced 9 other occurrences with schema-based parsing." What's actually
  happening: "When R2 returns malformed JSON, the handler throws a raw SyntaxError. The
  schema-based alternative would produce a typed validation error with the field path that
  failed, making error monitoring actionable."

**9. Ground complexity estimates in scope, not gut feel.**
The `COMPLEXITY` field must reflect the actual scope of the change. LOW: single
file, mechanical change, no design decisions. MEDIUM: multiple files or a design choice involved.
HIGH: cross-cutting change, new abstractions, or significant refactoring. If you cannot determine
complexity without deeper investigation, classify confidence as `LOW` and route to `ASK_USER` rather than guessing.

**10. Absolute precision in all quantification (NON-NEGOTIABLE).**
Never use vague quantifiers: "most", "many", "some", "several", "likely", "probably",
"generally", "appears to", "seems like", or approximate counts ("~65", "around 12").
Every comment must have an explicit, definitive status. Use exact counts. Every number
in the report must be verifiable by counting the items listed.

- BAD: "Most comments were addressed or out of scope."
- GOOD: "12 comments total: 8 fixed (commits abc123, def456), 3 false positives, 1 out of scope."

- BAD: "~65 bot threads - no individual replies needed, most addressed by subsequent commits."
- GOOD: "65 bot threads: 41 fixed (commit abc123 addressed items T1-T30, commit def456
  addressed items T31-T41), 18 false positives (each listed below with reasoning), 6 out
  of scope (each listed below with reasoning)."

- BAD: "The remaining issues are likely already fixed."
- GOOD: "3 remaining issues: T4 confirmed fixed in commit def456 (verified: function
  now returns Result<T>), I7 confirmed fixed in commit ghi789 (verified: null check
  added at line 42), R2 not fixed (still returns raw string at line 88)."

If you cannot determine a definitive status for a comment, the status is "undetermined -
needs investigation". Never hedge with "probably" or "likely" as a substitute for checking.

**11. Every comment gets individual analysis. No batch dismissals.**
Regardless of source, author, or volume - every single comment receives its own verdict
with its own reasoning. These are explicitly forbidden:

- Dismissing a group of comments with a shared rationale ("bot-generated, no replies needed")
- Summarizing N comments as a batch ("65 Copilot threads - mostly style suggestions")
- Skipping analysis because the author is a bot
- Using source or author as a proxy for validity

Being from a bot does not make a comment invalid. Being in a resolved thread does not mean
it was addressed. Being one of many does not exempt it from analysis.

When there are many comments (>20), you MUST still analyze each one individually, but you
MAY group them by verdict in the output. For example: list all 41 that are FIX with their
individual one-line descriptions, then all 18 that are REJECT_FALSE_POSITIVE with their
individual reasons. But the analysis and verdict must be per-comment, and the grouping must
show every item - not "and 15 more similar".

### 2.5. User Consultation for Ambiguous Fixes

**Skip this step if there are no `FIX_UNCLEAR`, `ASK_USER`, or `ROUTE: DECISION` items.** Proceed directly to Step 3.

Gather ALL `FIX_UNCLEAR`, `ASK_USER`, and `ROUTE: DECISION` items and present them to the user in a single structured write-up.

**Follow the Decision Presentation Guidelines from the `fixme-howto-present-decisions` skill.** If it was not preloaded, read it at `~/.claude/skills/fixme-howto-present-decisions/SKILL.md` or `~/.codex/skills/fixme-howto-present-decisions/SKILL.md`.

The PR comment analysis report has its own format, but embedded user decisions do not. Each `FIX_UNCLEAR` or `ASK_USER` item must be presented as a current decision card from `fixme-howto-present-decisions`.

Do not use legacy decision-card labels: `Decision {N}`, `The question`, `Changes`, `Upside`, `Downside`, or `Approach/Pros/Cons/Impact/Effort`.

**Presentation rules**:

- Be specific and concrete - reference actual file names, function names, line numbers
- All file references must be clickable markdown links with absolute paths and line numbers
- Options must be genuinely distinct approaches, not variations of the same thing
- Pros/cons must be grounded in the actual codebase context, not generic platitudes
- The recommendation must follow the current shared decision-card schema and explain why for this specific situation
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

Once all decisions are resolved, merge them into the routed issue groups: each `FIX_UNCLEAR` becomes
a resolved `CURRENT_PR_FIX` or `FOLLOWUP` group with the chosen approach noted. Each `ASK_USER` item becomes `CURRENT_PR_FIX`, `FOLLOWUP`, `REJECT_FALSE_POSITIVE`, `REJECT_WONT_FIX`, or `REJECT_ALREADY_FIXED` based on the user's answer. Only `CURRENT_PR_FIX` groups proceed to Step 3.

### 2.7. Pre-Execution Confirmation (when `--pause` is set)

**Skip this gate if `--pause` is NOT set.** Proceed directly to Step 3.

After all analysis is complete and all decisions are resolved, present a final execution plan
and wait for explicit user confirmation before proceeding.

```
## Ready to Execute ({N} CURRENT_PR_FIX groups via fixme-task pipeline)

{For each current PR fix group, one line:}
{N}. **{Issue title}** [`{severity}`] [`{complexity}`] [`{ROUTE_SCOPE}`] - {the planned fix action} -> [{files affected}]

Only CURRENT_PR_FIX groups will be dispatched to fixme-task (plan -> execute -> review). Follow-up groups will be replied to but will not consume this pipeline. Proceed? (yes / no / modify)
```

**User responses:**
- **yes** / **go** / **proceed**: Continue to Step 3.
- **no** / **stop** / **cancel**: Stop the workflow. Do not execute any fixes. Report which items were categorized and exit.
- **modify** (with specifics, e.g., "skip item 3", "change approach for item 1 to X"): Adjust the fix list per the user's instructions. Re-present the updated execution plan and ask again.
- **Any specific instructions** (e.g., "only fix items 1 and 3"): Adjust accordingly, re-present, and confirm.

### 3. Address Valid Issues

For all routed current PR fix groups (`ROUTE: CURRENT_PR_FIX`, including resolved `FIX_UNCLEAR` and `ASK_USER` items classified as current fixes by the user), invoke fixme-task to handle the plan-execute-review pipeline. Do not dispatch `FOLLOWUP`, `NO_ACTION`, `INFO`, or `FOLLOWUP_ONLY` groups.

Batch CURRENT_PR_FIX groups by implementation dependency cluster, not by comment source. Keep source IDs only as provenance.

Split into separate fixme-task dispatches only when a high-complexity `PLAN_REQUIRED` fix touches an unrelated subsystem, would block low-risk implementation-only fixes, or requires a materially different verification strategy. Otherwise prefer one dispatch with all current PR fix groups.

**PIPELINE GATE (self-check before proceeding):** Your next action MUST be a `Skill("fixme-task")` invocation. If you are about to call Read, Edit, Write, Grep, or Bash on source files instead, STOP - you are bypassing the pipeline. There is no "quick fix" path, no "just this one change" exception, no size-based threshold. The Skill tool is the ONLY tool you use in this step.

**BLOCKING GATE (manifest check):** Manifest Step 4 (Present `## PR Comment Analysis`) MUST be marked `completed` in TodoWrite before this dispatch can run. If Step 4 is still `pending` or `in_progress`, you have skipped the analysis-presentation gate. Stop. Present the analysis, mark Step 4 `completed`, then proceed. This gate is independent of `--pause` - the analysis report is always required, even when execution proceeds automatically.

#### Invoke fixme-task (inline pipeline)

Invoke fixme-task as an inline skill so it can dispatch its sub-agents (fixme-write-plan, fixme-execute-plan, etc.) within platform depth limits. The Skill tool runs fixme-task in the current session context (depth 0), allowing its Agent dispatches to land at depth 1.

    Skill(
      skill="fixme-task",
      args="Fix these PR comment issues. This is a PR comment fix task.

      Fix items:
      - [full list of CURRENT_PR_FIX groups with file paths, line numbers, comment text, and source IDs]
      - [for each group: VERDICT, SEVERITY, COMPLEXITY, CONFIDENCE, ROUTE, ROUTE_SCOPE]
      - [for FIX items: the analysis from Step 2]
      - [for resolved FIX_UNCLEAR or ASK_USER items: the chosen approach and rationale from Step 2.5]
      - [list FOLLOWUP_ONLY and INFO groups separately as non-dispatch context for the run summary]

      Project root: [path]"
    )

fixme-task runs the default pipeline (plan with review loop -> execute with review loop), handling plan writing, plan review, execution, and code review internally.

**NOTE**: fixme-task runs inline in this session's context, not as an isolated agent. This is intentional - the Agent tool cannot be used from within an agent (platform constraint). The pipeline's sub-agents (fixme-write-plan, fixme-execute-plan, etc.) still get isolated context windows when dispatched by fixme-task via the Agent tool.

### 4. Verify All Changes

After all fixes are made, run full verification using the project's documented commands:

```bash
# Build - must have zero errors AND zero warnings
yarn build

# Lint - must have zero errors AND zero warnings
yarn lint

# Full test suite - ALL tests must pass
yarn test
```

**IMPORTANT**: Do NOT proceed if any verification step fails. Fix issues first.

**NOTE**: The fixme-task pipeline already runs verification as its final gate (via fixme-execute-plan). This step is a safety net - if the pipeline completed successfully, verification should already pass. If it doesn't, something went wrong during execution that needs investigation.

### 5. Commit and Push

**Skip entirely if `--skip-commit` is set.**

```bash
# Stage all changed files
git add <changed-files>

# Commit with descriptive message
git commit -m "Address PR review comments"
```

**Skip push if `--skip-push` or `--skip-commit` is set.**

```bash
git push
```

### 6. Resolve Conversations

**Skip entirely if `--skip-resolve` is set.**

**Skip all replies if `--skip-response` is set** (both fix explanations and not-a-bug replies). Thread resolution still happens unless `--skip-resolve` is also set.

#### Reply Execution Table (REQUIRED)

Before posting any reply or resolving any thread, materialize a reply execution table with one
row per `review_item` or grouped container. Do not run `gh api` or `gh pr comment` until
every row has all required fields.

Required columns:

```
ID | surface | parser_hint | verdict | reply target | required body prefix | resolve action | command type
```

Use these surface-specific values:

- `inline_review_thread`: reply target is the inline review comment; required body prefix is
  `Fixed in {commit_sha}.` for addressed fixes or the rejection explanation for rejected
  findings; resolve action depends on author type.
- `issue_comment`: reply target is the PR issue comment stream; required body prefix depends on
  `parser_hint`; resolve action is `none`.
- `pull_request_review`: reply target is the PR issue comment stream; required body prefix
  references the review ID or reviewer; resolve action is `none`.

Parser-specific issue-comment prefixes:

- `claude_bot` or `generic_ai_review`: `Addressed in {commit_sha}:` for fixed findings or
  `Reviewed findings:` for rejected findings.
- `greptile_summary`: exactly `@greptileai Addressed Greptile findings in {commit_sha}:` for fixed
  findings or exactly `@greptileai Reviewed Greptile findings:` for rejected findings.
- `generic_human_review`: `@{reviewer_login} Addressed review findings from your comment in {commit_sha}:`
  for fixed findings or `@{reviewer_login} Reviewed findings from your comment:` for rejected findings.

Parser-specific pull-request-review prefixes:

- `codex_review` or `generic_ai_review`: `Addressed review {review_id} in {commit_sha}:` for fixed
  findings or `Reviewed review {review_id}:` for rejected findings.
- `generic_human_review`: `@{reviewer_login} Addressed review {review_id} in {commit_sha}:` for fixed
  findings or `@{reviewer_login} Reviewed review {review_id}:` for rejected findings.

**Preflight gate:** immediately before each reply command, compare the actual body against the
row's required body prefix. If it does not match, do not post. Rewrite the body and re-run the
preflight. Greptile bodies that start with `Greptile follow-up`, `Greptile findings`,
`Reviewed Greptile findings` without `@greptileai`, or any other unmentioned prefix are invalid.

#### For `inline_review_thread` items:

**If addressed (fix that was implemented)**:
1. Reply explaining the fix:
   ```bash
   gh api /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies \
     -X POST -f body="Fixed in {commit_sha}. {brief explanation}"
   ```
2. Get thread ID and resolve:
   ```bash
   # Get thread ID - use the thread IDs saved from the initial fetch in Step 1.
   # If thread IDs were not saved, re-fetch with pagination (same cursor-based
   # approach as Step 1 - loop with first:100/after until hasNextPage is false):
   gh api graphql -f query='
   query {
     repository(owner: "{owner}", name: "{repo}") {
       pullRequest(number: {number}) {
         reviewThreads(first: 100) {
           pageInfo { hasNextPage endCursor }
           nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
         }
       }
     }
   }'
   # Paginate with after: "{endCursor}" if hasNextPage is true, same as Step 1.

   # Resolve thread
   gh api graphql -f query='
   mutation {
     resolveReviewThread(input: {threadId: "{thread_id}"}) {
       thread { isResolved }
     }
   }'
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply with explanation:
   ```bash
   gh api /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies \
     -X POST -f body="{explanation why not fixing}"
   ```
2. **If the comment author is an AI** (see AI author detection in Notes), resolve
   the thread - there is no human reviewer to defer to:
   ```bash
   gh api graphql -f query='
   mutation {
     resolveReviewThread(input: {threadId: "{thread_id}"}) {
       thread { isResolved }
     }
   }'
   ```
   **If the author is human**, do NOT resolve - the reviewer should have the final say.

#### For `issue_comment` items:

Regular issue comments cannot be resolved via the GraphQL `resolveReviewThread`
mutation. The resolution pattern is a new PR issue comment that references the original
container and summarizes which findings were addressed or rejected.

Group multiple findings from the same original issue comment into one reply when they share
the same reply prefix. For mixed outcomes, post one reply that lists every finding with its
individual outcome, so the reviewer sees the full accounting in one notification.

**If addressed (fix that was implemented)**:
1. Reply to the PR with the parser-specific prefix:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="{required addressed prefix}
   - **{issue title}**: {brief explanation of fix}
   - ..."
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply explaining why each finding was not addressed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="{required reviewed prefix}
   - **{issue title}**: {explanation why not fixing}"
   ```

**Greptile completion check:** If any `greptile_summary` item was included in this run and
`--skip-response` is not set, Step 14 is incomplete until the posted issue comment body starts
with `@greptileai Addressed Greptile findings in` or `@greptileai Reviewed Greptile findings:`.

#### For `pull_request_review` items:

Top-level PR reviews cannot be resolved via `resolveReviewThread` and do not have an inline
reply endpoint for the whole review body. The reply target is the PR issue comment stream.
This covers Codex connector review bodies from `chatgpt-codex-connector[bot]` and any other
reviewer who leaves actionable findings in the review body instead of inline threads.

`pull_request_review: reply target is the PR issue comment stream`

**If addressed (fix that was implemented)**:
1. Reply to the PR with a new issue comment explaining which review findings were fixed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="{required addressed prefix}
   - **{finding title}**: {brief explanation of fix}
   - ..."
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply with a new issue comment explaining why each review finding was not addressed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="{required reviewed prefix}
   - **{finding title}**: {explanation why not fixing}"
   ```

**No thread resolve**: There is no `resolveReviewThread` call for `issue_comment` or
`pull_request_review` items. The reply comment is the resolution signal.

## Decision Guide

| Scenario | Action | Resolve? |
|----------|--------|----------|
| Valid bug, obvious fix [`FIX`] | Fix autonomously, reply with commit SHA | Yes |
| Valid bug, ambiguous fix [`FIX_UNCLEAR`] | Consult user (Step 2.5), then fix per chosen approach | Yes |
| Uncertain validity [`ASK_USER`] | Consult user (Step 2.5) for validity determination | Depends |
| Valid but deferred [`FOLLOWUP_ONLY`] | Reply with follow-up rationale; do not dispatch fixme-task | Bot: Yes, Human: No |
| Not a bug (code is correct) [`REJECT_FALSE_POSITIVE`] | Reply explaining why | Bot: Yes, Human: No |
| Already fixed in prior commit [`REJECT_ALREADY_FIXED`] | Reply noting it's fixed | Yes |
| Out of scope / intentional [`REJECT_WONT_FIX`] | Reply explaining rationale | Bot: Yes, Human: No |
| Unable to reproduce | Reply asking for clarification | No |
| Requires more investigation | Reply noting will investigate | No |

## Notes

- **Three GitHub API surfaces**: Fetch `inline_review_threads`, `issue_comments`, and `pull_request_reviews`. Reviewer identities are parser hints, not fetch sources.
- **Only unresolved review threads are analyzed** - resolved threads are fetched for accounting and skipped from actionable analysis.
- **All issue comments are fetched and read in full** - no pattern-based filtering at fetch time.
- **Top-level PR review bodies are fetched and read in full** - this covers Codex connector findings from `chatgpt-codex-connector[bot]` that are not review threads or issue comments.
- **Greptile summary parsing**: Extract findings from both "Comments Outside Diff" section (between `<!-- greptile_failed_comments -->` markers) and "Confidence Score" section (file-specific findings). Identified by `greptile-apps[bot]` user login and replied to with `@greptileai`.
- **Human issue comments and review bodies**: Each body may contain multiple findings. Parse every finding individually and post a reply issue comment addressing the reviewer by login when a response is needed.
- **Skip already-replied findings**: If a later reply already addresses the same finding (references a commit SHA or says "Fixed"), mark that item `REJECT_ALREADY_FIXED`.
- **FIX vs FIX_UNCLEAR vs ASK_USER vs FOLLOWUP_ONLY**: FIX items proceed without user input only when routed as `CURRENT_PR_FIX`. FIX_UNCLEAR items pause for user consultation on fix approach. ASK_USER items pause for user consultation on whether the issue is valid. FOLLOWUP_ONLY items are valid but do not consume the current PR fix pipeline.
- **`--pause` flag**: When set, the workflow pauses after analysis (Step 2/2.5) and presents a final execution plan before dispatching fixme-task. The user can approve, cancel, or modify the fix list. Without `--pause`, execution proceeds automatically after analysis.
- If no current PR fixes exist from any surface, report "No current PR fixes to dispatch" and proceed to replies/resolution
- Always verify before committing
- One commit for all fixes (unless logically separate)
- Be specific in replies - reference exact lines/commits
- Don't resolve review thread conversations you can't fully address (unless the author is an AI - see below)
- **AI author detection**: A comment author is considered AI if their login ends with `[bot]` (e.g. `claude[bot]`, `greptile-apps[bot]`, `chatgpt-codex-connector[bot]`) OR matches a known AI reviewer login (e.g. `copilot-pull-request-reviewer`). When in doubt, check the author's `type` field from the GitHub API - bots have `type: "Bot"`. AI-authored threads are resolved even on REJECT categories because there is no human reviewer to defer to. Human-authored threads are left unresolved on REJECT so the reviewer can have the final say.
- The thread_id from GraphQL query is needed for resolving review threads - save it when fetching
- **Pagination is mandatory for all API calls.** REST endpoints (`issue_comments`, `pull_request_reviews`) must use `--paginate` to fetch all pages. GraphQL endpoints (`inline_review_threads`) must use cursor-based pagination (`pageInfo { hasNextPage endCursor }` + `after` parameter) and loop until `hasNextPage` is false. Without pagination, comments beyond the first page are silently missed.
- **Surface item IDs**: Every `review_item` gets a permanent ID at normalization time: `T1`, `T2` for inline review threads; `I1`, `I2` for issue-comment findings; `R1`, `R2` for PR-review findings. IDs persist through analysis - the same ID appears in the display, analysis report, and any follow-up references regardless of verdict.
- **Precision is non-negotiable**: Every comment gets an exact verdict. No vague quantifiers (most, likely, ~N). No batch dismissals. All counts must be exact and sum to total. See presentation rules 10-11.
- **Bot comments get individual analysis**: Comments from bots (Copilot, Codex, Claude, Greptile) are analyzed individually, same as human comments. Being bot-generated is not a reason to skip analysis or batch-dismiss.
- **fixme-task invocation**: uses `Skill("fixme-task")` to run the pipeline inline in the current session. fixme-task dispatches its sub-agents (fixme-write-plan, fixme-execute-plan, etc.) via the Agent tool at depth 1. This avoids the platform constraint that agents cannot dispatch other agents.
