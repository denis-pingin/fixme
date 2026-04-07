---
name: fixme-pr-comments
description: Fetch unresolved PR comments from review threads, Claude bot, and Greptile, analyze each one, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
argument-hint: "[--skip-push] [--skip-commit] [--skip-resolve] [--skip-response]"
---

# Address PR Comments

Automatically fetch, analyze, and address **unresolved** PR review comments, actionable Claude bot issue comments, AND Greptile summary findings.

## Configuration

Parse arguments from skill invocation. All flags default to OFF (all phases run).

| Flag | Effect |
|------|--------|
| `--skip-push` | Skip `git push` after commit |
| `--skip-commit` | Skip both commit and push (implies `--skip-push`) |
| `--skip-resolve` | Skip resolving review threads and posting fix comments |
| `--skip-response` | Skip replying to comments (both fix explanations and not-a-bug replies) |

## Workflow

### 1. Fetch Unresolved PR Comments

There are **three sources** of actionable comments to check:

#### Source A: Review Threads (inline PR review comments)

Get PR info and only unresolved review threads using GraphQL:

```bash
# Get PR number and repo info
gh pr view --json number,headRefName,headRepository

# Get ONLY unresolved review threads with full context
gh api graphql -f query='
query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {number}) {
      reviewThreads(first: 100) {
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
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

#### Source B: Claude bot issue comments (regular PR comments)

The Claude Code GitHub Action currently posts code review findings as regular PR comments
instead of inline review threads. These must also be checked for actionable issues.

```bash
# Fetch ALL issue comments from claude[bot] - no content filtering at fetch time.
# Claude bot reviews use varied formats so any pattern-based filter WILL miss comments.
gh api repos/{owner}/{repo}/issues/{number}/comments \
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
# Fetch the greptile-apps[bot] issue comment
gh api repos/{owner}/{repo}/issues/{number}/comments \
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

#### Display all comments

Display both sources in format:
```
## Unresolved Comments ({count} total)

### Review Threads
- @author file.ts#line (thread_id: {id}):
  > comment text

### Claude Bot Review Comments
- [comment_id: {id}] file.ts#line:
  > issue description

### Greptile Summary Findings
- [comment_id: {id}] file.ts#line (source: outside-diff|confidence):
  > issue description
```

**Skip if no actionable comments**: If all review threads are resolved AND no unaddressed
Claude bot findings exist AND no unaddressed Greptile findings exist, report
"No unresolved comments" and exit.

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

**Structure**: Group items by status, lead with what's already resolved, then what remains.
For each individual item, describe it top-down: what's wrong, what breaks, what will be done.

```
### Already Fixed (resolve immediately)
{List items confirmed fixed in the current code. For each:}
- **{concrete issue name}** ({N} threads) - Fixed in `{commit_sha}`.
  {One sentence: what was wrong and how it was fixed.}

### Actionable Items ({N} distinct issues)

{For each deduplicated issue, present ALL of these fields:}

**{N}. {Issue title}** [`{category}`]
- **Problem**: {One sentence: what is concretely wrong, with file:line references.}
- **Impact**: {One sentence: what breaks, degrades, or is at risk because of this.}
- **Fix**: {One sentence: what will be done to fix it. For FIX_UNCLEAR: "Requires approach decision - see below." For ASK_USER: "Requires validity determination - see below."}
- **Files**: {file.ts:line, file2.ts:line}
- **Threads**: {N} ({list bot names: copilot, claude, greptile})

{Repeat for every actionable item.}
```

**Presentation rules for each item**:
- Problem must name the specific code construct that's wrong, not a category of wrongness.
  BAD: "unsafe cast at system boundary". GOOD: "`JSON.parse(raw) as SpecSummary` in spec-store.ts:90 bypasses schema validation at the KV boundary."
- Impact must describe the concrete consequence, not restate the problem.
  BAD: "violates CLAUDE.md". GOOD: "malformed KV entries crash with an untyped TypeError instead of a typed StoreError, bypassing retry/DLQ routing."
- Fix must describe the specific action, not the category.
  BAD: "will fix". GOOD: "replace with `Schema.decodeUnknown(SpecSummarySchema)` wrapped in Effect.try."
- For `REJECT_ALREADY_FIXED` items: state the commit SHA and one-line summary, nothing more.
- For `REJECT_FALSE_POSITIVE` / `REJECT_WONT_FIX`: include a one-sentence rationale explaining why.
- For `ASK_USER` items: state what's unclear and what information would resolve it.

### 2.5. User Consultation for Ambiguous Fixes

**Skip this step if there are no `FIX_UNCLEAR` or `ASK_USER` items.** Proceed directly to Step 3.

Gather ALL `FIX_UNCLEAR` and `ASK_USER` items and present them to the user in a single structured write-up.
For each decision point, present:

```
## Decision {N}: {short title}

**Context**: {what code is involved, what the reviewer asked for, why this came up}

**The issue**: {concise description of what needs to be decided}

**Options**:

1. **{Option A name}**
   - Approach: {what this would look like concretely}
   - Pros: {advantages}
   - Cons: {disadvantages}

2. **{Option B name}**
   - Approach: {what this would look like concretely}
   - Pros: {advantages}
   - Cons: {disadvantages}

{...more options if applicable}

**Recommendation**: Option {X} - {why this is the best choice in this specific situation,
referencing the concrete tradeoffs above}
```

**Presentation rules**:
- Be specific and concrete - reference actual file names, function names, line numbers
- Options must be genuinely distinct approaches, not variations of the same thing
- Pros/cons must be grounded in the actual codebase context, not generic platitudes
- The recommendation must explain WHY for this specific situation, not just state a preference
- Keep each decision point self-contained - the user should understand it without scrolling back

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

### 3. Address Valid Issues

For all resolved fix items (`FIX` + resolved `FIX_UNCLEAR` + `ASK_USER` items classified as FIX by user), dispatch a single fixme-task agent to handle the full plan-execute-review pipeline.

#### Dispatch fixme-task (synchronous)

Dispatch a **foreground** Agent with a clean prompt containing:
1. The full content of `~/.claude/skills/fixme-task/SKILL.md` (read it, paste it verbatim into the agent prompt)
2. A task description that includes:
   - The full list of fix items with file paths, line numbers, and comment text
   - For `FIX` items: the analysis from Step 2
   - For resolved `FIX_UNCLEAR` items: the chosen approach and rationale from Step 2.5
   - Instruction: "Fix these PR comment issues. This is a PR comment fix task."
3. The project root path

Wait for the fixme-task agent to complete. fixme-task runs the default pipeline (plan with review loop -> execute with review loop), handling plan writing, plan review, execution, and code review internally.

**CRITICAL**: The agent runs with a clean prompt - do NOT leak your current conversation context into the agent prompt. Provide only the structured data listed above. Follow the fixme dispatch contract: always include the full SKILL.md content verbatim, never paraphrase skill instructions.

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
   # Get thread ID
   gh api graphql -f query='
   query {
     repository(owner: "{owner}", name: "{repo}") {
       pullRequest(number: {number}) {
         reviewThreads(first: 50) {
           nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
         }
       }
     }
   }'

   # Resolve thread
   gh api graphql -f query='
   mutation {
     resolveReviewThread(input: {threadId: "{thread_id}"}) {
       thread { isResolved }
     }
   }'
   ```

**If NOT addressed (REJECT_FALSE_POSITIVE, REJECT_ALREADY_FIXED, REJECT_WONT_FIX)**:
1. Reply with explanation but DO NOT resolve:
   ```bash
   gh api /repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies \
     -X POST -f body="{explanation why not fixing}"
   ```

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

## Decision Guide

| Scenario | Action | Resolve? |
|----------|--------|----------|
| Valid bug, obvious fix [`FIX`] | Fix autonomously, reply with commit SHA | Yes |
| Valid bug, ambiguous fix [`FIX_UNCLEAR`] | Consult user (Step 2.5), then fix per chosen approach | Yes |
| Uncertain validity [`ASK_USER`] | Consult user (Step 2.5) for validity determination | Depends |
| Not a bug (code is correct) [`REJECT_FALSE_POSITIVE`] | Reply explaining why | No |
| Already fixed in prior commit [`REJECT_ALREADY_FIXED`] | Reply noting it's fixed | Yes |
| Out of scope / intentional [`REJECT_WONT_FIX`] | Reply explaining rationale | No |
| Unable to reproduce | Reply asking for clarification | No |
| Requires more investigation | Reply noting will investigate | No |

## Notes

- **Three sources of comments**: Review threads (inline), Claude bot issue comments (regular), AND Greptile summary findings (permanent PR comment)
- **Only unresolved review threads are fetched** - resolved threads are skipped entirely
- **All claude[bot] comments are fetched and read in full** - no pattern-based filtering
- **Greptile summary comment**: Extract findings from both "Comments Outside Diff" section (between `<!-- greptile_failed_comments -->` markers) and "Confidence Score" section (file-specific findings). Identified by `greptile-apps[bot]` user login.
- **Skip already-replied findings**: If a reply already addresses a Claude bot or Greptile finding (references a commit SHA or says "Fixed"), skip it
- **FIX vs FIX_UNCLEAR vs ASK_USER**: FIX items proceed without user input. FIX_UNCLEAR items pause for user consultation on fix approach. ASK_USER items pause for user consultation on whether the issue is valid.
- If no actionable comments exist from any source, report "No unresolved comments to address" and exit
- Always verify before committing
- One commit for all fixes (unless logically separate)
- Be specific in replies - reference exact lines/commits
- Don't resolve review thread conversations you can't fully address
- The thread_id from GraphQL query is needed for resolving review threads - save it when fetching
- **fixme-task dispatch follows the fixme dispatch contract**: always read the full SKILL.md from `~/.claude/skills/fixme-task/SKILL.md` and include it verbatim in the agent prompt. Never paraphrase skill instructions. fixme-task handles the full plan-execute-review pipeline internally.
