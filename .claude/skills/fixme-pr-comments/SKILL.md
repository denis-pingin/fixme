---
name: fixme-pr-comments
description: Fetch unresolved PR comments from review threads, Claude bot, Greptile, and regular human issue comments, analyze EVERY comment individually with exact verdicts, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
argument-hint: "[--pause] [--skip-push] [--skip-commit] [--skip-resolve] [--skip-response]"
---

## Fixme Directory

This skill does not interact with `<fixme-dir>` directly. All pipeline state (decisions log, plans, config, ticket files - anything under the fixme directory) is owned exclusively by `fixme-task` and its sub-skills. This orchestrator's job is limited to:

1. Fetching PR comments
2. Analyzing each comment
3. Consulting the user on ambiguous fixes
4. Invoking `Skill("fixme-task", ...)` with the resolved FIX list as a text argument
5. Verifying, committing, replying to comments, resolving threads

**Never write a literal `.fixme/` path anywhere in this skill's execution.** Forbidden in every tool:

- **Bash:** no `find .fixme`, `ls .fixme`, `test -f .fixme/...`, `cat .fixme/...`, `mkdir .fixme/...`, `rm .fixme/...`, `cd .fixme`, or any other shell command with a literal `.fixme/` argument
- **Read, Write, Edit:** no path argument starting with `.fixme/`
- **Grep, Glob:** no pattern starting with `.fixme/`

If you find yourself about to read `<fixme-dir>/decisions.md`, write `<fixme-dir>/plans/...`, list `<fixme-dir>`, or check whether `<fixme-dir>/config.json` exists, STOP. That is `fixme-task`'s job. Pass the FIX list as text in the `Skill("fixme-task", args=...)` invocation and let `fixme-task` handle all state.

When `fixme-task`'s SKILL.md says "the orchestrator writes to the decision log", **the orchestrator means `fixme-task` itself**, not the caller of `Skill("fixme-task")`. Reading `fixme-task`'s SKILL.md and concluding "I should pre-write the decision log before dispatching" is a misinterpretation - exactly the failure mode this preamble exists to prevent.

# Address PR Comments

Automatically fetch, analyze, and address **unresolved** PR review comments, actionable Claude bot issue comments, Greptile summary findings, AND regular human issue comments posted as full reviews.

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
Step 1   [fetch]            Fetch Sources A, B, C, D with mandatory pagination
Step 2   [fetch/display]    Assign source IDs (A1, B1, C1, D1...) and display all fetched items
Step 3   [analyze]          Analyze every item individually; classify with verdict
Step 4   [analyze/present]  Present `## PR Comment Analysis` to user
Step 5   [analyze/route]    Route: any FIX_UNCLEAR or ASK_USER -> 6, otherwise -> 7
Step 6   [consult]          Run consultation loop until all decisions are resolved
Step 7   [consult/route]    Route: zero FIX items remain -> 14, --pause -> 8, otherwise -> 9
Step 8   [confirm]          Present `## Ready to Execute` and wait for user response
Step 9   [dispatch]         Dispatch Skill("fixme-task") with the resolved FIX list
Step 10  [verify]           Run build/lint/test using project-documented commands
Step 11  [commit/route]     Route: --skip-commit -> 13, otherwise -> 12
Step 12  [commit]           Commit changes (and push unless --skip-push is set)
Step 13  [resolve/route]    Route: --skip-resolve -> 15, otherwise -> 14
Step 14  [resolve]          Reply and resolve threads per source/author rules
Step 15  [done]             Run summary
```

### Routing Rules

- **Step 5 (analyze/route)**: If at least one item was classified `FIX_UNCLEAR` or `ASK_USER`, advance to Step 6. Otherwise jump directly to Step 7.
- **Step 7 (consult/route)**: If after consultation zero `FIX` items remain (every item was rejected or already-fixed), jump to Step 14 to post replies and skip the dispatch path entirely. Otherwise: if `--pause` is set advance to Step 8; if not set, jump to Step 9.
- **Step 11 (commit/route)**: If `--skip-commit` is set, jump to Step 13. Otherwise advance to Step 12.
- **Step 13 (resolve/route)**: If `--skip-resolve` is set, jump to Step 15. Otherwise advance to Step 14.

### BLOCKING GATE

**Dispatching Step 9 (fixme-task) is forbidden until Step 4 (Present `## PR Comment Analysis`) is marked `completed` in TodoWrite.** Even if `--pause` is not set, the analysis presentation is mandatory - `--pause` only controls whether Step 8 (Ready to Execute confirmation) waits for the user. The analysis report is always shown.

If you find yourself with FIX items resolved and Step 4 is still `pending` or `in_progress`, you have skipped the gate. Stop. Present the analysis, mark Step 4 `completed`, then proceed.

### Creating the Manifest with TodoWrite

After deriving the manifest, create it via TodoWrite. Step 1 starts `in_progress`; all other steps start `pending`:

```
TodoWrite([
  { content: "Step 1 [fetch] Fetch Sources A-D with pagination", status: "in_progress", activeForm: "Fetching PR comments" },
  { content: "Step 2 [fetch/display] Display fetched items with source IDs", status: "pending", activeForm: "Displaying fetched items" },
  { content: "Step 3 [analyze] Analyze every item individually", status: "pending", activeForm: "Analyzing comments" },
  { content: "Step 4 [analyze/present] Present `## PR Comment Analysis`", status: "pending", activeForm: "Presenting analysis" },
  { content: "Step 5 [analyze/route] Route on consultation need", status: "pending", activeForm: "Routing on consultation" },
  { content: "Step 6 [consult] Run consultation loop until all decisions resolved", status: "pending", activeForm: "Consulting user on ambiguous fixes" },
  { content: "Step 7 [consult/route] Route on remaining FIX count and --pause", status: "pending", activeForm: "Routing on confirmation" },
  { content: "Step 8 [confirm] Present `## Ready to Execute` and wait", status: "pending", activeForm: "Awaiting confirmation" },
  { content: "Step 9 [dispatch] Dispatch Skill(fixme-task) with FIX list", status: "pending", activeForm: "Dispatching fixme-task" },
  { content: "Step 10 [verify] Run build/lint/test", status: "pending", activeForm: "Running verification" },
  { content: "Step 11 [commit/route] Route on --skip-commit", status: "pending", activeForm: "Routing on commit" },
  { content: "Step 12 [commit] Commit and push", status: "pending", activeForm: "Committing changes" },
  { content: "Step 13 [resolve/route] Route on --skip-resolve", status: "pending", activeForm: "Routing on resolve" },
  { content: "Step 14 [resolve] Reply and resolve threads per source/author rules", status: "pending", activeForm: "Resolving threads" },
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

### 1. Fetch Unresolved PR Comments

There are **four sources** of actionable comments to check:

#### Source A: Review Threads (inline PR review comments)

Get PR info and only unresolved review threads using GraphQL:

```bash
# Get PR number and repo info
gh pr view --json number,headRefName,headRepository

# Get ONLY unresolved review threads with full context.
# IMPORTANT: This query uses cursor-based pagination. The GitHub GraphQL API
# returns at most 100 nodes per request. You MUST loop until hasNextPage is false.
# On each iteration, pass the endCursor from the previous response as $after.

# First request (no cursor):
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

# If pageInfo.hasNextPage is true, fetch the next page:
gh api graphql -f query='
query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {number}) {
      reviewThreads(first: 100, after: "{endCursor}") {
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
}'

# Repeat until hasNextPage is false. Collect all nodes across pages,
# then filter: select only nodes where isResolved == false.
```

**Pagination is mandatory.** PRs with many review comments will span multiple pages.
If you only fetch the first page, you will silently miss comments on later pages.
Always check `pageInfo.hasNextPage` and loop with `after: "{endCursor}"` until all
pages are consumed.

#### Source B: Claude bot issue comments (regular PR comments)

The Claude Code GitHub Action currently posts code review findings as regular PR comments
instead of inline review threads. These must also be checked for actionable issues.

```bash
# Fetch ALL issue comments from claude[bot] - no content filtering at fetch time.
# Claude bot reviews use varied formats so any pattern-based filter WILL miss comments.
# IMPORTANT: Use --paginate to fetch ALL pages. Without it, only the first page
# (default 30 items) is returned, silently missing comments on later pages.
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate \
  --jq '[.[] | select(.user.login == "claude[bot]") | {id, body}]'
```

**Reading Claude bot comments**: Read the FULL body of every claude[bot] comment.
Discard only comments that clearly contain no actionable findings (e.g. just
"No issues found"). For everything else, extract each finding and treat it the
same as a review thread comment for analysis.

**CRITICAL: Always read the FULL body of every Claude bot comment.** Claude bot comments often
have wrapper text like `**Claude finished @user's task in Xm Ys**` at the top - this is NOT
an indicator that findings were addressed. It is just a status prefix. The actual review content
with actionable issues is below the `---` separator. NEVER skip a comment based on its prefix.

**Skip already-addressed issues**: For each specific issue extracted from a Claude bot comment,
check if a reply comment exists that SPECIFICALLY references that issue. A reply is only
considered to address an issue if:
1. It was posted AFTER the Claude bot comment (higher comment ID)
2. It explicitly references the specific issue (by title, file path, or description)
3. It references a commit SHA or says "Fixed" in relation to that specific issue

A reply addressing issue X from Claude comment A does NOT count as addressing issue Y from
Claude comment B. Each issue in each comment must be independently checked.

#### Source C: Greptile summary comment (permanent PR comment)

Greptile posts a single summary comment per PR that gets updated on each review. This comment
contains actionable findings in two sections that must be extracted.

```bash
# Fetch the greptile-apps[bot] issue comment.
# IMPORTANT: Use --paginate to fetch ALL pages of issue comments.
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate \
  --jq '[.[] | select(.user.login == "greptile-apps[bot]") | {id, body}]'
```

**Extract findings from three sections:**

1. **Comments Outside Diff** - wrapped in `<!-- greptile_failed_comments -->` markers:
   ```html
   <!-- greptile_failed_comments -->
   <details open><summary><h3>Comments Outside Diff (N)</h3></summary>

   1. `file/path.ts`, line X-Y ([link](...))
      **Issue title in bold**
      Detailed description...

   </details>
   <!-- /greptile_failed_comments -->
   ```
   Each numbered item is a separate finding with: file path, line range, bold title, and description.

2. **Confidence Score section** - contains file-specific findings after the score heading:
   ```html
   <h3>Confidence Score: N/5</h3>
   {assessment paragraphs}
   {file references like:}
   apps/api/src/pipeline/generate-story.ts (line 459) - still uses legacy contentKey...
   apps/api/scripts/generate-topic-images.sh - missing `image.usedPrompt` write.
   ```
   Lines that reference a specific file path with a description are individual findings.

3. **Remaining findings section** - plain-markdown list between the summary and confidence
   score, with priority-labeled items:
   ```
   Remaining findings:

   {Priority} -- {Issue title}: {detailed description with file paths and behavior}
   ```
   Each priority-labeled paragraph is a separate finding. Extract: title (text before the
   colon after the dash), description (text after the colon), and any file paths mentioned.

   **NOTE:** Greptile's format varies across reviews. Headers may use `<h3>` HTML tags or
   plain markdown. The "Remaining findings:" section may or may not be present. Always check
   for all three sections regardless of which format the current comment uses.

**Parsing rules:**
- If the "Comments Outside Diff" section has `(0)` or is absent, skip it
- If the Confidence Score is 5/5 with no file-specific findings listed, skip it
- For each extracted finding, record: file path, line range (if given), title/description
- Treat extracted findings the same as Claude bot findings for analysis in Step 2

**Skip already-addressed issues**: Same logic as Source B - check if a reply comment exists
that specifically references the finding by file path or description.

#### Source D: Regular human issue comments (non-bot PR comments)

Human reviewers sometimes post their entire review as a single regular PR issue comment
instead of a formal review with inline threads. These comments are NOT review threads (so
Source A misses them) and are NOT from a bot allowlisted login (so Sources B and C miss
them). They MUST still be analyzed.

```bash
# Fetch ALL issue comments from non-bot authors.
# Filter: exclude anyone whose user.type is "Bot", anyone whose login ends with "[bot]",
# and the explicit known-AI allowlist (claude[bot], greptile-apps[bot],
# copilot-pull-request-reviewer). This is the exact inverse of the AI author detection
# rule in the Notes section - Source D is "everyone who is NOT an AI reviewer".
#
# IMPORTANT: Use --paginate. Without it, only the first page (default 30 items) is
# returned and later comments are silently missed.
gh api repos/{owner}/{repo}/issues/{number}/comments --paginate \
  --jq '[.[]
    | select(.user.type != "Bot")
    | select((.user.login | endswith("[bot]")) | not)
    | select(.user.login != "claude[bot]")
    | select(.user.login != "greptile-apps[bot]")
    | select(.user.login != "copilot-pull-request-reviewer")
    | {id, user: .user.login, created_at, body}]'
```

**Why the filter is redundant**: `user.type != "Bot"` catches GitHub App bots and the
`endswith("[bot]")` check catches bots whose `type` is mislabelled. The explicit
allowlist checks are a belt-and-braces guard against GitHub API inconsistencies and
keep Source D in strict parity with the Sources B/C allowlist. Do not remove any of the
three filter layers.

**Double-count avoidance**: Source B already claims `claude[bot]`, Source C already
claims `greptile-apps[bot]`, and Source A already claims any comment that is part of a
review thread. The jq filter above excludes the two known bot logins. GitHub review
thread comments are returned by a DIFFERENT endpoint (`reviewThreads` in GraphQL) and
do NOT appear in `/issues/{number}/comments`, so there is no overlap with Source A. A
single comment can belong to at most one source.

**Reading Source D comments**: Read the FULL body of every Source D comment. A human
review posted as a single issue comment can contain multiple distinct findings in
prose, numbered lists, bullet points, or inline-quoted code blocks. Extract each
finding as a separate item the same way Source B (Claude bot) findings are extracted.
For each extracted finding, record: the originating comment's `id` (needed for the
resolution reply in Step 6), the author's login (for the report), the finding title
or first-sentence summary, the description, and any file paths / line ranges mentioned
in the prose.

If a Source D comment body contains no actionable findings (e.g. it is just a
"LGTM", a "thanks!", or a question for the author), skip it with verdict
`REJECT_FALSE_POSITIVE` and record "no actionable finding in comment body" as the
reasoning. Do NOT silently drop it - every comment must appear in the final report
with a verdict (see presentation rule 11).

**Skip already-addressed findings**: For each specific finding extracted from a
Source D comment, check if a LATER issue comment exists that specifically references
that finding. A reply is only considered to address a finding if:

1. It was posted AFTER the Source D comment (higher comment ID or later `created_at`)
2. It explicitly references the specific finding (by title, file path, or description)
3. It references a commit SHA or says "Fixed" in relation to that specific finding

This is the same rule used for Sources B and C. A reply addressing finding X from
comment A does NOT count as addressing finding Y from comment B. Each finding in each
comment must be independently checked.

#### Display all comments

Assign each comment a **source-prefixed ID** at fetch time: A1, A2, ... for review threads; B1, B2, ... for Claude bot findings; C1, C2, ... for Greptile findings; D1, D2, ... for regular human issue comments. These IDs are permanent - they follow the item through analysis and into the final report regardless of verdict.

Display all sources in format:
```
## PR Comments ({count} total)

### Review Threads ({count})
- **A1.** @author file.ts#line (thread_id: {id}):
  > comment text
- **A2.** @author file.ts#line (thread_id: {id}):
  > comment text

### Claude Bot Review Comments ({count})
- **B1.** [comment_id: {id}] file.ts#line:
  > issue description

### Greptile Summary Findings ({count})
- **C1.** [comment_id: {id}] file.ts#line (source: outside-diff|confidence):
  > issue description

### Human Review Comments ({count})
- **D1.** [comment_id: {id}] @author file.ts#line:
  > issue description (one finding extracted from the comment body)
- **D2.** [comment_id: {id}] @author:
  > another finding from a different comment
```

**Skip if no actionable comments**: If all review threads are resolved AND no unaddressed Claude bot findings exist AND no unaddressed Greptile findings exist AND no unaddressed human issue-comment findings exist, report "No unresolved comments" and exit.

### 2. Analyze Each Unresolved Comment

For each unresolved review comment:

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
"N comments from M sources (N review threads, N Claude bot findings,
N Greptile findings, N human issue comment findings). Verdict: N to fix, N already fixed, N not actionable
(N false positive, N won't fix), N need user input."
Every comment must be accounted for - the numbers MUST sum to the total. If they
don't, you miscounted - recount before presenting. No vague quantifiers.}

---

### Already Fixed (resolve immediately)
{List items confirmed fixed in the current code. For each:}
- **{ID}. {concrete issue name}** ({N} threads) - Fixed in `{commit_sha}`.
  {One sentence: what was wrong and how it was fixed.}

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

**{ID}. {Issue title}** [`{category}`]
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
- **Effort**: {low | medium | high}
- **Files**: {[file.ts:line](/absolute/path/file.ts#Lline), [file2.ts:line](/absolute/path/file2.ts#Lline)}
- **Threads**: {N} ({list source names: reviewer-login, claude, greptile})

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

**9. Ground effort estimates in scope, not gut feel.**
The "Effort" field (low/medium/high) must reflect the actual scope of the change. Low: single
file, mechanical change, no design decisions. Medium: multiple files or a design choice involved.
High: cross-cutting change, new abstractions, or significant refactoring. If you can't determine
effort without deeper investigation, say "medium (needs investigation)" rather than guessing.

**10. Absolute precision in all quantification (NON-NEGOTIABLE).**
Never use vague quantifiers: "most", "many", "some", "several", "likely", "probably",
"generally", "appears to", "seems like", or approximate counts ("~65", "around 12").
Every comment must have an explicit, definitive status. Use exact counts. Every number
in the report must be verifiable by counting the items listed.

- BAD: "Most comments were addressed or out of scope."
- GOOD: "12 comments total: 8 fixed (commits abc123, def456), 3 false positives, 1 out of scope."

- BAD: "~65 bot threads - no individual replies needed, most addressed by subsequent commits."
- GOOD: "65 bot threads: 41 fixed (commit abc123 addressed items A1-A30, commit def456
  addressed items A31-A41), 18 false positives (each listed below with reasoning), 6 out
  of scope (each listed below with reasoning)."

- BAD: "The remaining issues are likely already fixed."
- GOOD: "3 remaining issues: A4 confirmed fixed in commit def456 (verified: function
  now returns Result<T>), B7 confirmed fixed in commit ghi789 (verified: null check
  added at line 42), C2 not fixed (still returns raw string at line 88)."

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

**Skip this step if there are no `FIX_UNCLEAR` or `ASK_USER` items.** Proceed directly to Step 3.

Gather ALL `FIX_UNCLEAR` and `ASK_USER` items and present them to the user in a single structured write-up.

**Follow the Decision Presentation Guidelines from the `fixme-howto-present-decisions` skill** (read it at `~/.claude/skills/fixme-howto-present-decisions/SKILL.md`). Each decision point uses the full structured decision block format:

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

Once all decisions are resolved, merge them into the fix list: each `FIX_UNCLEAR` becomes
a resolved fix item with the chosen approach noted. Each `ASK_USER` item becomes FIX (with approach), REJECT_FALSE_POSITIVE, REJECT_WONT_FIX, or REJECT_ALREADY_FIXED based on the user's answer. These join the `FIX` items for
Step 3.

### 2.7. Pre-Execution Confirmation (when `--pause` is set)

**Skip this gate if `--pause` is NOT set.** Proceed directly to Step 3.

After all analysis is complete and all decisions are resolved, present a final execution plan
and wait for explicit user confirmation before proceeding.

```
## Ready to Execute ({N} fixes via fixme-task pipeline)

{For each fix item, one line:}
{N}. **{Issue title}** - {the planned fix action} -> [{files affected}]

All fixes will be dispatched to fixme-task (plan -> execute -> review). Proceed? (yes / no / modify)
```

**User responses:**
- **yes** / **go** / **proceed**: Continue to Step 3.
- **no** / **stop** / **cancel**: Stop the workflow. Do not execute any fixes. Report which items were categorized and exit.
- **modify** (with specifics, e.g., "skip item 3", "change approach for item 1 to X"): Adjust the fix list per the user's instructions. Re-present the updated execution plan and ask again.
- **Any specific instructions** (e.g., "only fix items 1 and 3"): Adjust accordingly, re-present, and confirm.

### 3. Address Valid Issues

For all resolved fix items (`FIX` + resolved `FIX_UNCLEAR` + `ASK_USER` items classified as FIX by user), invoke fixme-task to handle the full plan-execute-review pipeline.

**PIPELINE GATE (self-check before proceeding):** Your next action MUST be a `Skill("fixme-task")` invocation. If you are about to call Read, Edit, Write, Grep, or Bash on source files instead, STOP - you are bypassing the pipeline. There is no "quick fix" path, no "just this one change" exception, no size-based threshold. The Skill tool is the ONLY tool you use in this step.

**BLOCKING GATE (manifest check):** Manifest Step 4 (Present `## PR Comment Analysis`) MUST be marked `completed` in TodoWrite before this dispatch can run. If Step 4 is still `pending` or `in_progress`, you have skipped the analysis-presentation gate. Stop. Present the analysis, mark Step 4 `completed`, then proceed. This gate is independent of `--pause` - the analysis report is always required, even when execution proceeds automatically.

#### Invoke fixme-task (inline pipeline)

Invoke fixme-task as an inline skill so it can dispatch its sub-agents (fixme-write-plan, fixme-execute-plan, etc.) within platform depth limits. The Skill tool runs fixme-task in the current session context (depth 0), allowing its Agent dispatches to land at depth 1.

    Skill(
      skill="fixme-task",
      args="Fix these PR comment issues. This is a PR comment fix task.

      Fix items:
      - [full list of fix items with file paths, line numbers, and comment text]
      - [for FIX items: the analysis from Step 2]
      - [for resolved FIX_UNCLEAR items: the chosen approach and rationale from Step 2.5]

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

#### For review thread comments (Source A):

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
   the thread — there is no human reviewer to defer to:
   ```bash
   gh api graphql -f query='
   mutation {
     resolveReviewThread(input: {threadId: "{thread_id}"}) {
       thread { isResolved }
     }
   }'
   ```
   **If the author is human**, do NOT resolve — the reviewer should have the final say.

#### For Claude bot issue comments (Source B):

**If addressed (fix that was implemented)**:
1. Reply to the issue comment explaining which findings were fixed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="Addressed in {commit_sha}:
   - **{issue title}**: {brief explanation of fix}
   - ..."
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply explaining why each finding was not addressed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="Reviewed findings:
   - **{issue title}**: {explanation why not fixing}"
   ```

#### For Greptile summary findings (Source C):

**If addressed (fix that was implemented)**:
1. Reply to the Greptile issue comment explaining which findings were fixed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="@greptileai Addressed Greptile findings in {commit_sha}:
   - **{finding title}**: {brief explanation of fix}
   - ..."
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply explaining why each finding was not addressed:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="@greptileai Reviewed Greptile findings:
   - **{finding title}**: {explanation why not fixing}"
   ```

#### For human review issue comments (Source D):

Regular issue comments cannot be "resolved" via the GraphQL `resolveReviewThread`
mutation - that mutation only applies to review threads. The resolution pattern for
Source D is therefore identical to Sources B and C: post a new issue comment that
references the original reviewer and summarizes which findings were addressed or
rejected. Thread resolution is not applicable.

**If addressed (fix that was implemented)**:
1. Reply to the PR with a new issue comment explaining which findings were fixed,
   addressing the original reviewer by login:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="@{reviewer_login} Addressed review findings from your comment in {commit_sha}:
   - **{finding title}**: {brief explanation of fix}
   - ..."
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply with a new issue comment explaining why each finding was not addressed,
   addressing the original reviewer by login:
   ```bash
   gh api /repos/{owner}/{repo}/issues/{number}/comments \
     -X POST -f body="@{reviewer_login} Reviewed findings from your comment:
   - **{finding title}**: {explanation why not fixing}"
   ```

**Mixed outcomes**: If the original Source D comment contains multiple findings with
different verdicts (some addressed, some rejected), post a SINGLE reply that lists
every finding with its individual outcome, so the reviewer sees the full accounting
in one notification. Do not split into two separate reply comments.

**No thread resolve**: There is NO `resolveReviewThread` call for Source D. Regular
issue comments remain visible on the PR timeline - they do not have a "resolved"
state. The reply comment IS the resolution signal.

## Decision Guide

| Scenario | Action | Resolve? |
|----------|--------|----------|
| Valid bug, obvious fix [`FIX`] | Fix autonomously, reply with commit SHA | Yes |
| Valid bug, ambiguous fix [`FIX_UNCLEAR`] | Consult user (Step 2.5), then fix per chosen approach | Yes |
| Uncertain validity [`ASK_USER`] | Consult user (Step 2.5) for validity determination | Depends |
| Not a bug (code is correct) [`REJECT_FALSE_POSITIVE`] | Reply explaining why | Bot: Yes, Human: No |
| Already fixed in prior commit [`REJECT_ALREADY_FIXED`] | Reply noting it's fixed | Yes |
| Out of scope / intentional [`REJECT_WONT_FIX`] | Reply explaining rationale | Bot: Yes, Human: No |
| Unable to reproduce | Reply asking for clarification | No |
| Requires more investigation | Reply noting will investigate | No |

## Notes

- **Four sources of comments**: Review threads (inline), Claude bot issue comments (regular), Greptile summary findings (permanent PR comment), AND regular human issue comments (non-bot PR issue comments posted as full reviews)
- **Only unresolved review threads are fetched** - resolved threads are skipped entirely
- **All claude[bot] comments are fetched and read in full** - no pattern-based filtering
- **Greptile summary comment**: Extract findings from both "Comments Outside Diff" section (between `<!-- greptile_failed_comments -->` markers) and "Confidence Score" section (file-specific findings). Identified by `greptile-apps[bot]` user login.
- **Human issue comments (Source D)**: Fetched from the same `/issues/{number}/comments` REST endpoint as Sources B and C, filtered to `user.type != "Bot"` AND login not ending in `[bot]` AND login not in the known-AI allowlist (claude[bot], greptile-apps[bot], copilot-pull-request-reviewer). Each comment body may contain multiple findings, parsed and analyzed like Source B. Resolution posts a reply issue comment addressing the reviewer by login - no GraphQL thread resolve (not applicable to regular issue comments).
- **Skip already-replied findings**: If a reply already addresses a Claude bot or Greptile finding (references a commit SHA or says "Fixed"), skip it
- **FIX vs FIX_UNCLEAR vs ASK_USER**: FIX items proceed without user input. FIX_UNCLEAR items pause for user consultation on fix approach. ASK_USER items pause for user consultation on whether the issue is valid.
- **`--pause` flag**: When set, the workflow pauses after analysis (Step 2/2.5) and presents a final execution plan before dispatching fixme-task. The user can approve, cancel, or modify the fix list. Without `--pause`, execution proceeds automatically after analysis.
- If no actionable comments exist from any source, report "No unresolved comments to address" and exit
- Always verify before committing
- One commit for all fixes (unless logically separate)
- Be specific in replies - reference exact lines/commits
- Don't resolve review thread conversations you can't fully address (unless the author is an AI - see below)
- **AI author detection**: A comment author is considered AI if their login ends with `[bot]` (e.g. `claude[bot]`, `greptile-apps[bot]`) OR matches a known AI reviewer login (e.g. `copilot-pull-request-reviewer`). When in doubt, check the author's `type` field from the GitHub API - bots have `type: "Bot"`. AI-authored threads are resolved even on REJECT categories because there is no human reviewer to defer to. Human-authored threads are left unresolved on REJECT so the reviewer can have the final say.
- The thread_id from GraphQL query is needed for resolving review threads - save it when fetching
- **Pagination is mandatory for all API calls.** REST endpoints (issue comments) must use `--paginate` to fetch all pages. GraphQL endpoints (review threads) must use cursor-based pagination (`pageInfo { hasNextPage endCursor }` + `after` parameter) and loop until `hasNextPage` is false. Without pagination, comments beyond the first page are silently missed.
- **Source-prefixed item IDs**: Every comment gets a permanent ID at fetch time (A1, A2 for review threads; B1, B2 for Claude bot; C1, C2 for Greptile; D1, D2 for regular human issue comments). IDs persist through analysis - the same ID appears in the display, analysis report, and any follow-up references regardless of verdict.
- **Precision is non-negotiable**: Every comment gets an exact verdict. No vague quantifiers (most, likely, ~N). No batch dismissals. All counts must be exact and sum to total. See presentation rules 10-11.
- **Bot comments get individual analysis**: Comments from bots (Copilot, Codex, Claude, Greptile) are analyzed individually, same as human comments. Being bot-generated is not a reason to skip analysis or batch-dismiss.
- **fixme-task invocation**: uses `Skill("fixme-task")` to run the pipeline inline in the current session. fixme-task dispatches its sub-agents (fixme-write-plan, fixme-execute-plan, etc.) via the Agent tool at depth 1. This avoids the platform constraint that agents cannot dispatch other agents.
