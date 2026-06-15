---
name: fixme-pr-comments
description: Fetch PR feedback from the three GitHub API surfaces, normalize every fetched container into review_item records, analyze EVERY item individually with exact verdicts, fix valid issues via fixme-task pipeline, verify, commit/push, and resolve addressed conversations. For non-issues or unfixable items, comment without resolving.
argument-hint: "[--pause] [--skip-push] [--skip-commit] [--skip-resolve] [--skip-response]"
---

## Fixme Directory

This skill does not interact with `<fixme-dir>` directly outside the carve-outs below: liveness and attention brokering. All pipeline state (decisions log, plans, config, ticket files - anything under the fixme directory) is owned exclusively by `fixme-task` and its sub-skills. This orchestrator's job is limited to:

1. Fetching PR comments
2. Analyzing each comment
3. Consulting the user on ambiguous fixes
4. Preparing a saved child `fixme-task` handoff with `lifecycle parent prepare-child --data-file`
5. Verifying, committing, replying to comments, resolving threads

**Never use a literal `.fixme/` path or any task-owned `<fixme-dir>/` path in any tool except for the lifecycle, liveness, and attention brokering commands listed below.** Resolution rules and the full prohibition list are in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`). If you find yourself about to read `<fixme-dir>/decisions.md`, write `<fixme-dir>/plans/...`, list `<fixme-dir>`, or check whether `<fixme-dir>/config.json` exists, STOP. That is `fixme-task`'s job. Put the routed current PR fix groups in `child.handoff.payload`, let `lifecycle parent prepare-child` save the child task boundary, and let `fixme-task` handle all pipeline state from that saved reference.

Parent run state (via `lifecycle parent *`), liveness, and attention brokering are the runtime-state carve-outs; the parent-state API stores only parent-owned orchestration state and must not expose task-owned plans/specs/decisions/tickets/config/internals. This skill may resolve `<fixme-dir>`, prepare the saved child handoff, read child run status, and broker a child `fixme-task` attention prompt only through:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent resolve --fixme-dir <fixme-dir> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run status --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker show --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId> --attention-id <attention-id>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle attention broker answer --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId> --attention-id <attention-id> --data '<json-object>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle task-event consume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --next
```

Use only the `fixmeDir` field returned by `root`. Do not call `run start` for the child `fixme-task`; `lifecycle parent prepare-child` creates child liveness and returns the dispatched child's `statusId`. Store that returned `statusId` as `fixmeTaskStatusId`. Do not read, write, list, or mutate any task-owned `<fixme-dir>` path (decisions, plans, specs, tickets, config) from this skill.

When `fixme-task`'s SKILL.md says "the orchestrator persists the decision", **the orchestrator means `fixme-task` itself**, not this parent PR-comments skill. Reading `fixme-task`'s SKILL.md and concluding "I should pre-write the decision log before dispatching" is a misinterpretation - exactly the failure mode this preamble exists to prevent.

Parent brokers must not run `task decision append`, `task checkpoint`, `run attention clear`, or `lifecycle dispatch prepare` after recording an attention answer.

If child `fixme-task` returns `FIXME_ATTENTION_REQUIRED` or `run status` reports `currentCommand` in the form `attention:<attention-id>`, this skill becomes only the user-facing broker for that prompt:

1. Call `lifecycle attention broker show --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId> --attention-id <attention-id>`.
2. Print the returned `promptMarkdown` exactly, then wait for the user's answer.
3. If the user response is a decision answer, call `lifecycle attention broker answer` with `{ "answer": "<user answer>", "answeredBy": "user", "answerKind": "decision" }`.
4. If the user response is a clarifying question, call the same command with `{ "answer": "<user answer>", "answeredBy": "user", "answerKind": "clarificationRequest" }`.
5. Use `activeChild.resumeRef` from parent state and resume the child `fixme-task` with only `--resume <activeChild.resumeRef> --answer-attention <attention-id>` through the transport returned by the original launch (`transport=inline-skill` for Claude, `transport=agent` for Codex, with `parentContinuation` carrying `parentRunId`/`parentStatusId`/`resumeStep`). `lifecycle attention broker show` returns display fields only and does not return task-owned resume metadata. The saved task state is the context boundary; do not re-pass the routed PR fix item text on an attention resume. In Claude inline mode this is `Skill("fixme-task", "--resume <activeChild.resumeRef> --answer-attention <attention-id>")`; in Codex agent mode call `spawn_agent(agent_type="fixme-task", message="--resume <activeChild.resumeRef> --answer-attention <attention-id>")` after resolving runtime settings. The installed Codex skill path `$HOME/.codex/skills/fixme-task/SKILL.md` remains the source skill copy, but parent-driven resume launches the registered agent. When resuming, reuse the same `<liveness>` `statusId: <fixmeTaskStatusId>` so `fixme-task` can consume the original attention status. The status id is context, not a command-line flag.

If `lifecycle attention broker show` returns `status: "answered"`, do not print the prompt or call `lifecycle attention broker answer` again. Resume the child `fixme-task` immediately with `--resume <activeChild.resumeRef> --answer-attention <attention-id>` and the same `<liveness>` `statusId: <fixmeTaskStatusId>` so an interrupted broker does not duplicate a user decision.

If the user asks a clarifying question instead of giving a decision, record it with `answerKind: "clarificationRequest"` and resume `fixme-task` exactly the same way. Do not answer the clarification in this parent skill. If the resumed `fixme-task` returns another `FIXME_ATTENTION_REQUIRED`, broker that new prompt the same way.

Do not persist any task-owned decision; `fixme-task` resumes and writes decisions itself. Do not summarize, reclassify, or answer the prompt on behalf of the user.

# Address PR Comments

Automatically fetch, normalize, analyze, and address PR feedback from inline review threads, PR issue comments, and top-level PR review bodies.

## Hard Constraints

- **This skill is an analyzer and dispatcher.** It fetches comments, categorizes them, consults the user on ambiguous items, and dispatches fixme-task for fixes. It NEVER fixes code itself.
- **Never read source code except during analysis (Step 2) or during a Step 6 consultation pause.** Step 2 reads referenced code to determine if comments are valid. Step 6 consultation is a decision pause - while waiting for the user to resolve `FIX_UNCLEAR` / `ASK_USER` / `ROUTE: DECISION` items, the orchestrator may read source code to answer the user's clarifying questions inline. After categorization AND after all consultation decisions are resolved, no more source code reads - all implementation happens inside fixme-task. See "Discussion Mode at Step 6 Consultation Pause" near the consultation loop for the contract.
- **Never use Edit, Write, or Bash to modify source files.** If you catch yourself about to edit a source file, STOP - you are bypassing the pipeline. Even "just one line" must go through fixme-task. The pipeline exists to catch what your confidence blinds you to.
- **Never skip fixme-task dispatch for "simple" fixes.** The temptation is strongest when there's only 1 fix and it looks trivial. That is exactly when this constraint matters most - a one-line type change can break downstream consumers that the pipeline's review loop would catch.
- **"Inline fix" is a forbidden concept.** If the words "inline", "no pipeline needed", "fixing directly", or "just one line" appear in your output, you are about to violate the pipeline constraint. There is no inline path. Every FIX item goes through fixme-task dispatch. No exceptions, no size threshold, no shortcut.
- **Never touch `.fixme/` or `<fixme-dir>/` files outside the lifecycle, liveness, and attention brokering carve-outs.** See the "Fixme Directory" preamble above. The pipeline state is owned exclusively by `fixme-task`. Reading `fixme-task`'s SKILL.md and deciding to "persist resolved decisions before dispatching" is the exact failure mode this constraint prevents - decisions from Step 6 consultation are included in the saved child handoff payload, never written to disk by this skill.

## Audible Alerts

Fire an alert at decision points and the terminal outcome so the user is never idling without sound. Use the Bash one-liner; do not invoke a skill.

| When | Alert |
| --- | --- |
| About to present a Step 6 consultation pause (FIX_UNCLEAR / ASK_USER / ROUTE: DECISION items) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input` |
| About to print a contested-verdict decision card | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input` |
| All PR comments processed, fixes verified and pushed | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_finished` |
| Halted before completion (verification failure, fixme-task aborted, unresolvable comment) | `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_failed` |

Alerts are fire-and-forget. See `fixme-alert/SKILL.md` for full event semantics.

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

Before fetching any comments, expand the entire workflow into a flat, numbered manifest using the live manifest task list. Every step - including routing decisions and conditional skips - becomes an explicit entry. This eliminates conditional branching ("did I present analysis yet?") and makes skipping the analysis-presentation gate structurally impossible.

### Building the Manifest

Build the manifest based on the parsed flags. Step 8 (Pre-Execution Confirmation) is the ONLY step whose presence in the manifest is controlled by a flag: it is included if and only if `--pause` is set. When `--pause` is OFF, Step 8 is omitted entirely - it does not appear in the live manifest task list, and there is no "skip" entry for it.

This is intentional. Keeping a Step 8 manifest around when `--pause` is OFF creates a recency anchor that biases the model toward inserting a "Proceed? (yes / no / modify)" prompt between Step 4 (analysis presentation) and Step 9 (dispatch). The presence-or-absence of the Step 8 manifest entry IS the signal: if it is in the list, you pause; if it is not, you do not.

All other steps are unconditional. Steps 11 and 13 are routing entries that decide whether 12 and 14 execute; Step 8 is different because it represents an in-line user prompt, not a backend action.

### The Manifest

```
Step 1   [fetch]            Fetch three GitHub API surfaces with mandatory pagination
Step 2   [fetch/display]    Normalize into review_item records and display all fetched items
Step 3   [analyze]          Analyze every item individually; classify with verdict
Step 4   [analyze/present]  Present `## PR Comment Analysis` to user
Step 5   [analyze/route]    Route: any FIX_UNCLEAR, ASK_USER, or ROUTE: DECISION -> 6, otherwise -> 7
Step 6   [consult]          Run consultation loop until all decisions are resolved
Step 7   [consult/route]    Route: zero CURRENT_PR_FIX groups remain -> 14, --pause -> 8, otherwise -> 9
Step 8   [confirm]          Present `## Ready to Execute` and wait for user response  (CONDITIONAL: included only if --pause is set; OMIT entirely otherwise)
Step 9   [dispatch]         Prepare and launch fixme-task through returned launch.transport with routed CURRENT_PR_FIX groups
Step 10  [verify]           Run build/lint/test using project-documented commands
Step 11  [commit/route]     Route: --skip-commit -> 13, otherwise -> 12
Step 12  [commit]           Commit changes (and push unless --skip-push is set)
Step 13  [resolve/route]    Route: --skip-resolve -> 15, otherwise -> 14
Step 14  [resolve]          Build reply execution table, preflight reply bodies, then reply/resolve per surface/author rules
Step 15  [done]             Run summary
```

Step numbers are stable anchors to the workflow definition, not sequence indices. When Step 8 is omitted, Step 9 is still numbered 9; the live manifest task list simply has no entry between Step 7 and Step 9.

### Routing Rules

- **Step 5 (analyze/route)**: If at least one item was classified `FIX_UNCLEAR`, `ASK_USER`, or `ROUTE: DECISION`, advance to Step 6. Otherwise jump directly to Step 7.
- **Step 7 (consult/route)**:
  - If after consultation zero `CURRENT_PR_FIX` groups remain (every item was rejected, already-fixed, or routed to follow-up only), jump to Step 14 to post replies and skip the dispatch path entirely. When zero `CURRENT_PR_FIX` groups remain and replies are needed, Step 14 runs in the same turn as the Step 4 presentation. Do not ask whether to proceed with replies, thread resolution, or hand-picked fixes.
  - If `--pause` IS set and at least one `CURRENT_PR_FIX` group remains: advance to Step 8 and wait for user confirmation in a separate turn.
  - If `--pause` is NOT set and at least one `CURRENT_PR_FIX` group remains: jump to Step 9 in the **same turn** as the Step 4 presentation. The turn output must contain (a) the analysis report from Step 4, (b) **no** closing question or confirmation prompt, and (c) the `lifecycle parent prepare-child --data-file` call plus the returned launch action for Step 9. Splitting Step 4 and Step 9 across two turns when `--pause` is OFF is forbidden - the user did not ask to be consulted.
- **Step 11 (commit/route)**: If `--skip-commit` is set, jump to Step 13. Otherwise advance to Step 12.
- **Step 13 (resolve/route)**: If `--skip-resolve` is set, jump to Step 15. Otherwise advance to Step 14.

### BLOCKING GATE

**Dispatching Step 9 (fixme-task) is forbidden until Step 4 (Present `## PR Comment Analysis`) is marked `completed` in live manifest task list.** Even if `--pause` is not set, the analysis presentation is mandatory - `--pause` only controls whether Step 8 (Ready to Execute confirmation) waits for the user. The analysis report is always shown.

If you find yourself with CURRENT_PR_FIX groups resolved and Step 4 is still `pending` or `in_progress`, you have skipped the gate. Stop. Present the analysis, mark Step 4 `completed`, then proceed.

### Closing-Form Constraint (when `--pause` is OFF)

When `--pause` is NOT set, the turn that emits the Step 4 presentation has a strict closing form:

- The last user-visible line of the report is the final entry of the **Accounting Ledger** section.
- **No question, prompt, or call-to-action** follows the ledger. The following phrases are explicitly forbidden as closings: `Proceed?`, `Should I dispatch?`, `Should I proceed with replies?`, `stop here`, `hand-pick`, `Continue with B1 and B2?`, `(yes / no / modify)`, `Ready to dispatch?`, `Want me to proceed?`, or any other interrogative or confirmation-seeking sentence.
- If at least one `CURRENT_PR_FIX` group remains, the same turn must contain the `prepare-child` call and runtime-specific launch action for Step 9, immediately after the report. The launch action is the closing - not a prompt to the user.
- If zero `CURRENT_PR_FIX` groups remain and replies are needed, the same turn must execute Step 14 immediately after the report. The Step 14 reply/resolve execution is the closing action - not a prompt to the user.

When `--pause` IS set, the turn that emits the Step 4 presentation may end with a neutral pointer to Step 8 (e.g. `See ## Ready to Execute below.`) followed by the Step 8 prompt in the same turn. The Step 8 prompt is the **only** place a user-facing confirmation question is allowed in this skill.

**Anti-pattern self-check.** Before submitting the turn that contains the Step 4 presentation, scan your draft output for any of these tokens: `?`, `(yes`, `(modify`, `Proceed`, `dispatch?`, `Continue`. If any appear in your final paragraph and `--pause` is OFF, STOP. You are about to violate this gate. The cause is almost always recency-driven pattern matching from a prior session that did use `--pause`. Re-read the parsed flags. Confirm `--pause` is OFF. Replace the closing question with the Step 9 prepare-child call and returned launch action.

### Creating the Manifest with the live manifest task list

After deriving the manifest, create it via the live manifest task list. Step 1 starts `in_progress`; all other steps start `pending`. The live manifest task list **depends on whether `--pause` was set in the invocation**:

**When `--pause` IS set (15-step manifest, Step 8 included):**

```
TaskCreate([
  { content: "Step 1 [fetch] Fetch three GitHub API surfaces with pagination", status: "in_progress", activeForm: "Fetching PR comments" },
  { content: "Step 2 [fetch/display] Normalize and display review_item records", status: "pending", activeForm: "Displaying fetched items" },
  { content: "Step 3 [analyze] Analyze every item individually", status: "pending", activeForm: "Analyzing comments" },
  { content: "Step 4 [analyze/present] Present `## PR Comment Analysis`", status: "pending", activeForm: "Presenting analysis" },
  { content: "Step 5 [analyze/route] Route on consultation need", status: "pending", activeForm: "Routing on consultation" },
  { content: "Step 6 [consult] Run consultation loop until all decisions resolved", status: "pending", activeForm: "Consulting user on ambiguous fixes" },
  { content: "Step 7 [consult/route] Route on remaining CURRENT_PR_FIX groups and --pause", status: "pending", activeForm: "Routing on confirmation" },
  { content: "Step 8 [confirm] Present `## Ready to Execute` and wait", status: "pending", activeForm: "Awaiting confirmation" },
  { content: "Step 9 [dispatch] Prepare child handoff and launch fixme-task through returned transport with CURRENT_PR_FIX groups", status: "pending", activeForm: "Launching fixme-task" },
  { content: "Step 10 [verify] Run build/lint/test", status: "pending", activeForm: "Running verification" },
  { content: "Step 11 [commit/route] Route on --skip-commit", status: "pending", activeForm: "Routing on commit" },
  { content: "Step 12 [commit] Commit and push", status: "pending", activeForm: "Committing changes" },
  { content: "Step 13 [resolve/route] Route on --skip-resolve", status: "pending", activeForm: "Routing on resolve" },
  { content: "Step 14 [resolve] Build reply execution table, preflight reply bodies, then reply/resolve", status: "pending", activeForm: "Resolving threads" },
  { content: "Step 15 [done] Run summary", status: "pending", activeForm: "Writing run summary" }
])
```

**When `--pause` is NOT set (14-step manifest, Step 8 OMITTED entirely):**

```
TaskCreate([
  { content: "Step 1 [fetch] Fetch three GitHub API surfaces with pagination", status: "in_progress", activeForm: "Fetching PR comments" },
  { content: "Step 2 [fetch/display] Normalize and display review_item records", status: "pending", activeForm: "Displaying fetched items" },
  { content: "Step 3 [analyze] Analyze every item individually", status: "pending", activeForm: "Analyzing comments" },
  { content: "Step 4 [analyze/present] Present `## PR Comment Analysis` AND immediately continue to Step 9 or Step 14 in same turn", status: "pending", activeForm: "Presenting analysis and continuing" },
  { content: "Step 5 [analyze/route] Route on consultation need", status: "pending", activeForm: "Routing on consultation" },
  { content: "Step 6 [consult] Run consultation loop until all decisions resolved", status: "pending", activeForm: "Consulting user on ambiguous fixes" },
  { content: "Step 7 [consult/route] Route to dispatch or resolve (no --pause confirmation gate)", status: "pending", activeForm: "Routing to dispatch or resolve" },
  { content: "Step 9 [dispatch] Prepare child handoff and launch fixme-task through returned transport with CURRENT_PR_FIX groups (SAME TURN as Step 4)", status: "pending", activeForm: "Launching fixme-task" },
  { content: "Step 10 [verify] Run build/lint/test", status: "pending", activeForm: "Running verification" },
  { content: "Step 11 [commit/route] Route on --skip-commit", status: "pending", activeForm: "Routing on commit" },
  { content: "Step 12 [commit] Commit and push", status: "pending", activeForm: "Committing changes" },
  { content: "Step 13 [resolve/route] Route on --skip-resolve", status: "pending", activeForm: "Routing on resolve" },
  { content: "Step 14 [resolve] Build reply execution table, preflight reply bodies, then reply/resolve", status: "pending", activeForm: "Resolving threads" },
  { content: "Step 15 [done] Run summary", status: "pending", activeForm: "Writing run summary" }
])
```

Note that Step 9 keeps its number even when Step 8 is absent - step numbers are stable workflow anchors, not list indices. The Step 4, Step 7, Step 9, and Step 14 entries in the no-`--pause` variant are explicitly worded to remind you the routed next action executes in the **same turn**, eliminating the implicit "I should pause here" pattern.

### Following the Manifest

Execute steps in order. After each step (whether a Bash command, an analysis, a presentation, a consultation, or a dispatch):

1. Process the output of the step
2. Mark the current step `completed` via the live manifest task list
3. Set the next step (per routing rules) to `in_progress`
4. Execute the next step

**Same-turn execution rule (when `--pause` is OFF):** Step 4 (analysis presentation) and the routed next action are executed in a single turn. If current fixes remain, the analysis report is emitted, then the `prepare-child` call and returned launch action follow in the same turn. If zero current fixes remain and replies are needed, the analysis report is emitted, then Step 14 reply/resolve execution follows in the same turn. Do not return to the user between Step 4 and the routed next action in this mode. The user invoked the skill without `--pause` precisely so they would not have to confirm; honor that contract.

**Never skip steps. Never combine steps (except the explicit Step 4 + Step 9 same-turn execution above when `--pause` is OFF). Never "optimize" the sequence. The manifest is the law.**

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

#### Do not print the normalized items list at this stage

Normalize every fetched container into `review_item` records internally, but do not enumerate them in the user-visible output. The Accounting Ledger at the end of the analysis report enumerates every container by ID (`T*`, `I*`, `R*`) and proves nothing was skipped. Printing the full list before analysis is pure duplication.

**Do not skip analysis based on source or author.** `ROUTE` is assigned only after Step 3 analysis. After Step 3, if every `review_item` has route `FOLLOWUP` or `NO_ACTION`, report "No current PR fixes to dispatch" and proceed to Step 14 if replies are needed.

### 2. Analyze Each Unresolved Comment

For each unresolved `review_item`:

1. **Read the referenced code** to understand the context
2. **Determine if it's a valid issue**:
   - Is it a real bug/problem?
   - Is the suggested fix correct?
   - Does it apply to the current code state?
   - For edge-case review items, run the Edge-Case Validity Gate before assigning VERDICT.
3. **Categorize**:
   - `FIX`: Valid issue with a single clear solution - no ambiguity in how to fix it
   - `FIX_UNCLEAR`: Valid issue but multiple viable approaches exist, or tradeoffs/design choices are involved
   - `ASK_USER`: Cannot determine whether this is even a valid issue - need human input on validity (not just approach)
   - `REJECT_FALSE_POSITIVE`: Comment is incorrect or doesn't apply - the code is correct
   - `REJECT_ALREADY_FIXED`: Issue was already addressed
   - `REJECT_WONT_FIX`: Valid concern but intentional/out of scope
   - `FOLLOWUP_ONLY`: Valid concern, but not worth expanding the current PR because the fix is minor/high-complexity, informational, or outside the PR goal. **Note**: file-level overlap with another PR (existing, planned, or stack-mate) is not on its own a defer reason - it must be the *specific code path* the comment flags that another PR replaces or makes obsolete. "Same file" is not "same problem."

## Review Claim Verification Gate

Run this gate before assigning `VERDICT: FIX`, `VERDICT: FIX_UNCLEAR`, `VERDICT: FOLLOWUP_ONLY`, or `ROUTE: CURRENT_PR_FIX`.

A reviewer claim is a hypothesis, not evidence. The reviewer's wording can point to a real issue, but it cannot prove code behavior, API semantics, duplication, reachability, or fix safety by itself.

## Current-Fix Proof Gate

Before routing any PR comment to `CURRENT_PR_FIX`, answer these three questions:

1. **What is the reviewer's core claim?**
   State the claim as one falsifiable sentence, without the reviewer's proposed fix.

2. **What fact would make that claim true or false?**
   Identify the one decisive code/API/runtime fact. Prefer the downstream consumer or side effect over the local line the reviewer cited.

3. **Did we verify that fact?**
   Cite the source checked and the observed fact.

Decision Eligibility Gate (inlined here because this skill has no `fixme-howto-present-decisions` preload at Step 3; keep in sync with the canonical gate in `fixme-howto-present-decisions`). Before routing any item to `ASK_USER` or `FIX_UNCLEAR`/`DECISION`, an item is a genuine user decision only if ALL THREE hold: (1) Plurality after constraints - more than one outcome survives the hard constraints (project rules including artifact-sync/lockstep rules, locked decisions, spec/contract text, shipped-and-tested behavior, correctness, safety); if exactly one survives, the item is determined -> `CURRENT_PR_FIX` (or `REJECT_*`/`FOLLOWUP_ONLY`). (2) Materiality - the survivors differ in observable behavior, persisted data, cost, risk, scope, or reversibility; behavior-identical or strictly-dominated survivors are not material -> pick the best -> `CURRENT_PR_FIX`. (3) Indeterminacy - the best survivor cannot be chosen from rules and evidence alone; if evidence can choose -> `CURRENT_PR_FIX` with that choice. Fail-safe: when outcomes are not material, route to `CURRENT_PR_FIX` even under uncertainty. Reconciliation instance: reconciling a stale doc/comment to shipped-and-tested reality under a sync rule is a determined fix, not a decision, unless the divergence implies the shipped behavior is wrong (then `ASK_USER`). An unnecessary escalation is not free: it forces a cold context reload and erodes the signal of genuine decisions, so escalate only when all three conditions hold.

Routing rule:

- If the decisive fact proves the claim true -> `CURRENT_PR_FIX`.
- If the decisive fact proves the claim false -> `REJECT_FALSE_POSITIVE`.
- If the decisive fact is unavailable or depends on product intent -> `ASK_USER`.
- If the claim is true but not worth this PR -> `FOLLOWUP_ONLY`.

Do not route to `CURRENT_PR_FIX` from local shape alone, such as "payload has X but key omits X", "field name looks duplicated", "branch looks reachable", or "test seems missing." Local shape is a lead, not proof.

For key, ID, dedupe, cache, queue, lock, retry, or refresh comments, the decisive fact is usually the downstream side effect keyed by that value, not the payload shape.

Break the finding into atomic premises before assigning any FIX or CURRENT_PR_FIX route. Premises include: the current code state, external API/tool semantics, semantic equivalence or duplication, reachability, user/system impact, and whether the suggested change is safe.

For each premise, record Evidence receipts. Each receipt must name the source checked and the fact observed: current source or tests, dependency source/types, installed binary `--help`, rendered config/manifests, official docs for the actual project version, a controlled reproduction, or a recorded user decision.

For duplicate, redundant, or equivalent-parameter claims, prove semantic equivalence before accepting the finding. Identify the exact downstream consumer, prove both values feed the same semantic slot, prove no caller or runtime layer depends on the distinction, and prove the suggested removal or merge would not change behavior. Lexical similarity is not evidence of duplication. Similar names, matching literals, adjacent arguments, or the same IP/port surface are search leads only.

If an essential premise is unverified, contradicted, or only supported by lexical similarity, do not route the item to implementation. Use `REJECT_FALSE_POSITIVE` when evidence contradicts the premise. Use `ASK_USER` when the missing premise depends on private intent or unavailable authority. Use `FIX_UNCLEAR` only when validity is proven but the implementation approach is ambiguous.

Before recommending removal, merging, or renaming of an argument, config key, protocol flag, service, or generated value, trace the consuming code and name the verification that would catch a wrong merge. If that proof is missing, the route is not `CURRENT_PR_FIX`.

Edge-Case Validity Gate:

Run this gate for any PR review item about an edge case, missing error handling, null or empty input, invalid input, unsupported product state, rare branch, boundary condition, precondition, or "this could happen if..." scenario.

Only classify support, unsupported, or impossible when concrete evidence proves that route. If edge-case validity is fuzzy, set VERDICT: ASK_USER and EDGE_VALIDITY: ASK_USER_VALIDITY.

1. **Exact state** - identify the specific values, input shape, entity state, caller behavior, timing condition, or implementation precondition being discussed.
2. **Reachability** - prove whether the state can happen from the PR diff, current source, tests, schemas, API contracts, caller guards, or state-machine transitions.
3. **Support contract** - prove whether the state is required, unsupported, or out of scope from user journeys, requirements, locked decisions, documented API contracts, existing tests, or established product behavior.
4. **Boundary location** - if the state is unsupported but reachable, identify where it should be rejected or constrained before downstream code sees it.

Edge validity routing:

- Supported and unhandled -> `VERDICT: FIX` or `FIX_UNCLEAR`; `EDGE_VALIDITY: NONE`.
- Unsupported but reachable and not blocked early enough -> `VERDICT: FIX`; `EDGE_VALIDITY: FIX_FAIL_FAST`; route according to severity and complexity, but the fix must fail early or make the state impossible.
- Validity or support unclear -> `VERDICT: ASK_USER`; `EDGE_VALIDITY: ASK_USER_VALIDITY`; route `DECISION`.
- Impossible by construction -> `VERDICT: REJECT_FALSE_POSITIVE`; `EDGE_VALIDITY: REJECT_IMPOSSIBLE`; route `NO_ACTION`.
- Unsupported or out of scope with no current PR action -> `VERDICT: REJECT_WONT_FIX` or `FOLLOWUP_ONLY` based on whether follow-up work remains; `EDGE_VALIDITY: REJECT_UNSUPPORTED`.

Future-work classification rule:

- If a valid concern still needs action in another PR, phase, ticket, TODO, or cleanup commit, classify it as `FOLLOWUP_ONLY`, not `REJECT_WONT_FIX`.
- A later branch can justify `REJECT_ALREADY_FIXED` or `REJECT_WONT_FIX` only when the exact flagged code path is already removed or replaced and no remaining action is required before the stacked work ships.
- Phrases like "natural home", "will be handled by", "track in a TODO", "cleanup pending", or "before merging" describe follow-up work unless the exact action is already complete.
- Do not write `Follow-Up Only: None` while also saying an item will be handled by another PR, phase, ticket, TODO, or cleanup commit.

4. **Assign triage metadata** to every `review_item` and deduplicated issue group:
   - `VERDICT: FIX | FIX_UNCLEAR | ASK_USER | REJECT_FALSE_POSITIVE | REJECT_ALREADY_FIXED | REJECT_WONT_FIX | FOLLOWUP_ONLY`
   - `SEVERITY: BLOCKER | MAJOR | MINOR | INFO`
   - `COMPLEXITY: LOW | MEDIUM | HIGH`
   - `CONFIDENCE: HIGH | MEDIUM | LOW`
   - `EDGE_VALIDITY: FIX_FAIL_FAST | ASK_USER_VALIDITY | REJECT_IMPOSSIBLE | REJECT_UNSUPPORTED | NONE`
   - `EVIDENCE_RECEIPTS: source -> observed fact; source -> observed fact`
   - `REVIEW_ASSESSMENT: reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>`
   - `REVIEW_LEVEL: <level>`
   - `LEVEL_ROUTE: blocking-fix | follow-up | decision-needed | dismissed`
   - `FILE_OVERLAP_ONLY_DEFERRAL_CANDIDATE: true | false`
   - `ROUTE: CURRENT_PR_FIX | DECISION | FOLLOWUP | NO_ACTION`
   - `ROUTE_SCOPE: PLAN_REQUIRED | IMPLEMENT_ONLY | NONE`

Use `fixme-howto-importance` for the exact assessment dimensions, review-level routes, and pattern aggregation rule.

Do not route nonblocking project-rule violations, cleanup, doc/comment mismatch, raw JSON.parse usage by itself, or generic test-hygiene findings as `blocking-fix` without concrete impact evidence.

Keep the dimensions independent: severity decides importance, complexity decides execution shape, confidence decides autonomy. Do not use severity as a substitute for validity, and do not use low complexity as a substitute for importance. Severity itself is multi-dimensional - weight user impact, frequency, and reversibility together; do not let one topic match anchor the verdict.

**Severity is multi-axis, not topic-match.** Before assigning a bucket, answer all three forcing questions:

1. **User impact** - does an end user observe a wrong outcome, or is this internal-only (logs, metrics, dev ergonomics)?
2. **Frequency / trigger conditions** - does this fire on every request, only on a specific code path, or only during an already-degraded state (outage, rare race, deprecated flow)?
3. **Reversibility** - if shipped wrong, is the fix a one-line follow-up, or does it require migration, data repair, or a public-API change?

An issue that is internal-only, fires only during an existing outage, and is trivially reversible cannot be `MAJOR` even if its topic matches "reliability" or "maintainability." A topic match is necessary for a bucket but never sufficient.

**Severity definitions**:
- `BLOCKER`: Correctness, data loss, security, privacy, crash, migration, or public API risk that can break the PR goal or production behavior.
- `MAJOR`: Real behavioral, compatibility, reliability, test, or maintainability issue that should be fixed before this PR is accepted. **A topic match alone is insufficient**: the issue must affect a user-observable outcome, fire on a non-rare path, OR be costly to reverse later. If none of those hold, downgrade to `MINOR` or `INFO`.
- `MINOR`: Real issue with limited blast radius, mostly local cleanup, narrow readability, small test hardening, or low-risk consistency.
- `INFO`: Educational note, optional observation, or future improvement that should not block or drive a fix loop.

**Calibration example**: A duplicate warning log during a rare third-party outage is `INFO`, not `MAJOR`. It has zero user impact, fires only inside an already-active outage, and is a one-line fix later. The "reliability" topic match does not promote it.

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

**Anti-pattern self-check for `FOLLOWUP_ONLY`.** Before finalizing this verdict, scan your draft justification for these tokens: `touches`, `touches heavily`, `area is being reworked`, `same file`, `pr-N touches`, `stack-mate`. If they appear without naming the *specific code path* the other work supersedes, STOP. File overlap is not a defer reason. Either name the exact line range/symbol another PR replaces, or drop the stack reasoning and judge the finding on its own merits (severity, complexity, scope fit).

**Review level routing**:

Resolve PR-comment review level with:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --path pullRequestComments
```

LEVEL_ROUTE=follow-up uses VERDICT: FOLLOWUP_ONLY and ROUTE: FOLLOWUP. The follow-up ledger must include the source IDs, resolved review level value, and full `REVIEW_ASSESSMENT`.

Every triaged item and deduplicated group must include `REVIEW_ASSESSMENT`, `REVIEW_LEVEL`, and `LEVEL_ROUTE`. Use `decision-needed` for ASK_USER, `dismissed` for REJECT_* and REJECT_ALREADY_FIXED, and `follow-up` for file-overlap-only deferral candidates.

file-overlap-only deferral candidates are never hidden by review level. If `FILE_OVERLAP_ONLY_DEFERRAL_CANDIDATE: true`, keep the item visible and explain that review level cannot bypass the file-overlap-only deferral ban.

**Distinguishing FIX vs FIX_UNCLEAR**: A fix is `FIX` when there is exactly one
reasonable way to address it (e.g., "add missing null check", "fix typo in variable name",
"add missing import", "handle uncaught error"). A fix is `FIX_UNCLEAR` when ANY of these
apply:
- Multiple valid implementation strategies exist with different tradeoffs
- The fix touches architecture or design patterns where a choice must be made
- Performance vs. readability vs. correctness tradeoffs are involved
- The reviewer's suggestion conflicts with existing patterns and either direction is defensible
- Scope is unclear - the fix could be minimal or could warrant a broader refactor

When in doubt after applying the Decision Eligibility Gate above - the surviving approaches are material and you cannot pick a winner from rules and evidence - classify as `FIX_UNCLEAR`. If the surviving approaches are behavior-identical or strictly dominated, the gate fails and the correct verdict is `FIX`, not `FIX_UNCLEAR`. An unnecessary escalation is a defect of equal weight to silently picking the wrong approach.

**Distinguishing FIX_UNCLEAR vs ASK_USER**: After the Decision Eligibility Gate proves a genuine decision exists, use `FIX_UNCLEAR` when the issue is clearly valid (it IS a bug or a real problem) but the approach among material survivors is indeterminate. Use `ASK_USER` when validity or scope is the material, indeterminate part - you cannot determine whether the comment even identifies a real issue, perhaps the code behavior is intentional, or the context is insufficient to judge. When validity is the material, indeterminate question, use `ASK_USER`. When validity is settled but the approach among material survivors is indeterminate, use `FIX_UNCLEAR`.

#### Present categorization to the user

After analyzing all comments, present the results using the format below. This format is
mandatory - follow it exactly regardless of any other presentation guidelines.

**All file references in the report MUST be clickable markdown links with absolute file paths
and line numbers**, e.g. `[config.ts:42-58](/absolute/path/to/config.ts#L42-L58)`. This applies
to every file mentioned anywhere in the report - problem descriptions, fix descriptions, file
lists, decision context, options, everything. No plain-text file paths.

**Every summary surface in this skill MUST start with a clickable PR link**, in the form
`**PR**: [{owner}/{repo}#{pr_number}]({pr_html_url})`. This is non-negotiable and applies to
the Step 4 `## PR Comment Analysis` report, the Step 8 `## Ready to Execute` confirmation, and
the Step 15 `Run summary` output. The link is the first non-heading line so the user can jump
to the PR from any summary surface without scrolling. Use the canonical GitHub PR URL
(`https://github.com/{owner}/{repo}/pull/{pr_number}`) - never a plain-text PR reference.

**Structure**: Start with the outcome, not the ledger. Expand only the actionable buckets in priority order, then close with the ledger. Do not start the report with a markdown table. Section order is fixed:

1. PR Comment Analysis (one-sentence outcome + next action)
2. Decisions Needed
3. Current PR Fixes
4. Follow-Up Only
5. Accounting Ledger

Already-fixed and not-actionable items appear ONLY as ledger lines. Do not expand them as evidence cards - the ledger's per-ID accounting is sufficient and the detailed cards are pure duplication. If the user asks about a specific already-fixed or rejected item, look it up by ID on demand.

For each expanded item in Decisions / Current PR Fixes / Follow-Up Only, describe it top-down: problem, context, impact, recommended action, and why this route is the right tradeoff.

```
## PR Comment Analysis

**PR**: [{owner}/{repo}#{pr_number}](https://github.com/{owner}/{repo}/pull/{pr_number})

{One sentence with the outcome: "N review items from 3 fetched surfaces were grouped into G issues: X current PR fixes, Y decisions, Z follow-ups, A already fixed, B no-action."}

**Recommended next action**: {one sentence naming exactly what should happen next, such as "Proceed with B1 and B2 only."}

**Why**: {one sentence explaining the main risk/cost tradeoff behind the recommendation.}

### Highest Priority First

Expand full evidence cards for BLOCKER, MAJOR, FIX_UNCLEAR, ASK_USER, LOW confidence, or PLAN_REQUIRED groups. Lower-risk already-fixed and not-actionable groups stay in the Accounting Ledger unless the user asks for a specific ID.

### Decisions Needed

{If there are no `FIX_UNCLEAR`, `ASK_USER`, or `ROUTE: DECISION` groups, write "None." and skip this section.}

{For each decision group, put `**Review route**: {REVIEW_LEVEL}; {LEVEL_ROUTE}` immediately before the decision card.}

{For each decision group, use `fixme-howto-present-decisions` exactly. Do not restate, summarize, or locally redefine its decision-card fields in this skill.}

{Do not put workflow-status preamble before or between decision cards (e.g. "Only D1 is blocking the flow", "PR #2-#6 don't change the count"). If status context is genuinely needed, put it in the one-sentence outcome line above, not inside the decision section.}

### Current PR Fixes

{If there are no `ROUTE: CURRENT_PR_FIX` groups, write "None." and skip this section.}

{List only groups with `ROUTE: CURRENT_PR_FIX`, sorted by severity, then complexity, then dependency order.}

**G{N}. {Issue title}** [`{VERDICT}`] [`{SEVERITY}`] [`{COMPLEXITY}`] [`{CONFIDENCE}`] [`{ROUTE_SCOPE}`]

**Review route**: {REVIEW_LEVEL}; {LEVEL_ROUTE}

**Problem**: {The actual problem in one sentence. Do not start with a file path or implementation detail.}

**Context**: {2-3 sentences explaining where we are in the product/system flow and what the affected code is responsible for.}

**Impact if not fixed**: {Concrete user-visible or system-visible impact. If latent, state the exact condition that triggers it.}

**Recommended action**: {The intended fix behavior, including test/codegen/verification expectation when relevant.}

**Why this route**: {Why this is CURRENT_PR_FIX over FOLLOWUP_ONLY. Must point to one of: (a) reviewer-blocking pressure on this PR, (b) cohesion with files already touched in this PR's diff, or (c) concrete operational pain. "The workflow is waiting" or "the reviewer left a comment" are NOT valid reasons - those are tautologies. If none of (a)/(b)/(c) apply, the verdict is FOLLOWUP_ONLY, not CURRENT_PR_FIX.}

**Evidence receipts**: {Source -> observed fact for the essential premises. For duplicate/equivalent-parameter claims, include the consumer contract and semantic-equivalence proof.}

**Sources**: {N source items: T1 reviewer, I2 claude[bot], R1 chatgpt-codex-connector[bot]. Include clickable file references.}

#### Execution Batches

{Subsection inside Current PR Fixes. Skip if Current PR Fixes is empty. Batch by implementation dependency cluster, not by comment source. Use bullets, not a table.}

**B{N}. {batch title}**

- **Groups**: {G1, G2, ...}
- **Execution shape**: {implementation repair | plan-required change}
- **Review shape**: full code review
- **Why batched together**: {shared files, shared behavior, or same root cause}

### Follow-Up Only

{If there are no `FOLLOWUP_ONLY` groups, write "None." and skip this section.}

{List valid but deferred groups. These are not rejections. For each:}

**G{N}. {Issue title}** [`FOLLOWUP_ONLY`] [`{SEVERITY}`] [`{COMPLEXITY}`]

**Review route**: {REVIEW_LEVEL}; {LEVEL_ROUTE}

**Problem**: {The valid concern in one sentence.}

**Impact if not fixed now**: {The concrete risk of deferring it.}

**Why not in this PR**: {Why the valid concern is disproportionate for the current PR fix loop. Tie this to severity, complexity, PR goal, and blast radius.}

- **Follow-up action**: {Concrete follow-up title or "No durable follow-up artifact created" if the project has no follow-up backend in this workflow.}

### Accounting Ledger

{Use bullets, not a markdown table. Every review_item must appear exactly once. Counts must sum to the total. The ledger is the ONLY place already-fixed and not-actionable items are enumerated - do not expand them above.}

- **Total**: {N review items from 3 fetched surfaces: T inline review threads, I issue comments, R pull request reviews}
- **Decisions needed**: {G1 (T22, I3), G2 (T24) or None}
- **Current PR fixes**: {G3 (T15), G4 (T7, I2) or None}
- **Follow-up only**: {G5 (T9) or None}
- **Follow-up by review level: {number routed to follow-up, with group IDs or None}**
- **Already fixed**: {G6 (T1, T2, T5)... or None. One short reason per group, e.g. "fixed in commit abc123"}
- **Not actionable**: {G7 (T11, I4)... or None. One short reason per group, e.g. "false positive: code already validates input"}
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

**12. Defer reasons must name what makes the fix unnecessary or disproportionate, not just where it lives.**
`FOLLOWUP_ONLY` justifications must describe the *reason* deferral is correct - low blast
radius, scope creep, supersession by a specific code path, etc. They must not lean on
file-level overlap with other PRs as a standalone reason.

- BAD: "File is touched heavily by pr-4 and pr-5 - defer."
- BAD: "This module is being reworked downstream."
- GOOD: "Minor perf, low blast radius, no user-visible impact - defer to a follow-up PR."
- GOOD: "Cleanup of the same hook is in flight in PR #4321 (lines 115-128 are being
  rewritten); this exact line is removed there."
- GOOD: "Out of scope for this PR's goal (renaming X). Worth a separate PR but no concrete
  owner yet."

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

#### Discussion Mode at Step 6 Consultation Pause

From the moment the decision write-up is presented to the user to the moment all decisions are resolved, the orchestrator is in a **decision pause**. During this pause it IS the user's interlocutor, not a dispatcher.

The user is owed a competent collaborator who can:

- **Read source code** (Read, Grep, Glob) and run **read-only Bash** (git log, git show, etc.) to verify claims, surface evidence, or answer clarifying questions about the PR comments and the affected code
- **Answer follow-up questions inline** about the codebase, the decision options, the tradeoffs, or how a chosen option would land
- **Re-frame a decision** when the user reveals new context (product intent, related PR threads, prior decisions) that makes the original framing wrong - then re-present the decision card with the corrected framing

If the user asks a clarifying question that requires reading the codebase, **answer it directly with Read/Grep/Glob** - do NOT dispatch a sub-agent for it. Sub-agent dispatch during a Step 6 pause is the failure mode this carve-out exists to prevent.

What stays forbidden even during a Step 6 pause:

- Editing source files (the pipeline still owns implementation - all fixes go through fixme-task)
- Touching `<fixme-dir>` files (still owned exclusively by fixme-task)
- Auto-resolving decisions or merging into routed groups before the user has actually answered
- Pre-dispatching fixme-task before consultation is complete

The pause ends when the user has resolved all decision points (or said "go with recommendations"). At that point, merge decisions into routed groups and proceed to the next step.

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

**PR**: [{owner}/{repo}#{pr_number}](https://github.com/{owner}/{repo}/pull/{pr_number})

{For each current PR fix group, one line:}
{N}. **{Issue title}** [`{severity}`] [`{complexity}`] [`{ROUTE_SCOPE}`] [{REVIEW_LEVEL}; {LEVEL_ROUTE}] - {the planned fix action} -> [{files affected}]

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

**PIPELINE GATE (self-check before proceeding):** Your next action MUST be building the `prepare-child` payload file, calling `lifecycle parent prepare-child --data-file`, and launching only through the returned `launch.transport`. If you are about to call Read, Edit, Write, Grep, or Bash on source files instead, STOP - you are bypassing the pipeline. There is no "quick fix" path, no "just this one change" exception, no size-based threshold. The returned launch branch is the ONLY implementation entry point you use in this step.

**BLOCKING GATE (manifest check):** Manifest Step 4 (Present `## PR Comment Analysis`) MUST be marked `completed` in live manifest task list before this dispatch can run. If Step 4 is still `pending` or `in_progress`, you have skipped the analysis-presentation gate. Stop. Present the analysis, mark Step 4 `completed`, then proceed. This gate is independent of `--pause` - the analysis report is always required, even when execution proceeds automatically.

#### Invoke fixme-task from launch transport

Build one prepare-child payload file and let the CLI perform the stable parent-state choreography. The CLI saves or reuses the child task handoff before returning, writes heavy PR-comment payload data to a durable `child-handoff-payload` preparation artifact, persists `activeChild`, advances the parent to `awaitFixmeTask`, and returns a `launch` block only. The CLI does not invoke the model, Skill, or agent; the runtime adapter performs the launch from `launch.transport` and `launch.promptBlocks`.

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>
```

The payload must use this shape. Keep group ids as JSON values, never object keys:

`child.handoff.taskSaveData` is the saved task handoff. `child.handoff.payload` is the heavy sidecar payload registered as a `child-handoff-payload` preparation artifact. `child.promptInputs` contains only lightweight summary/count/reference fields.

```json
{"parent":{"parentSkill":"fixme-pr-comments","idempotencyKey":"<stable-parent-key>","lookupInput":{"pullRequestRef":{"host":"github.com","owner":"owner","repo":"repo","number":123},"normalizedFlags":{"pause":false,"skipCommit":false,"skipPush":false,"skipResolve":false,"skipResponse":false}},"payload":{"flags":{},"reviewItems":{"currentPrFix":[]},"analysis":{},"routedGroups":[{"groupId":"G1","route":"currentPrFix","sourceIds":["G1"],"title":"Fix reviewed behavior"}]}},"child":{"idempotencyKey":"<stable-child-key>","agentName":"fixme-task","runtime":"codex","transport":"agent","parentInvocationId":"<usageInvocationId>","pipelineRunId":"<pipelineRunId>","parentStatusId":"<parentStatusId>","handoff":{"mode":"createOrReuse","taskSaveData":{"title":"Address current PR review fixes","slug":"pr-comments-current-fixes","taskGoal":"Apply the current PR review fixes from the durable child handoff payload.","agreedApproach":["Read the child-handoff-payload preparation artifact before planning."],"userVisibleBehavior":["The child task resumes from a saved task reference."],"scope":{"inScope":["current PR review fixes from the child handoff payload"],"outOfScope":["unrelated PR changes"]},"laterPlanningNotes":["Use the sidecar payload as the authoritative PR-comment scope."],"pipelineResolution":{"pipeline":"standard","source":"userProseIntent","evidence":"Parent PR-comments workflow selected standard before save-first child handoff.","reason":"The parent-provided PR-comment handoff is the user-visible intent for this saved child task."},"source":"fixme-pr-comments","tags":["fixme-pr-comments","parent-driven"]},"payload":{"source":"fixme-pr-comments","routedFixGroups":[],"allowedUnresolvedThreadIds":[],"mustResolveThreadIds":[]}},"promptInputs":{"summary":"Current PR review fixes","routedFixGroupsCount":0,"mustResolveThreadCount":0}},"parentContinuation":{"resumeStep":"awaitFixmeTaskResult"},"await":{"fixBatches":[],"activeBatchIndex":0,"ledger":{}},"recoverStaleParent":false}
```

Render the child prompt from the returned `promptBlocks`, plus `usageContext`; in the helper response those values live under `launch.promptBlocks` and `launch.usageContext`. Do not reconstruct these blocks manually from project, liveness, or fix-item fields. Persist exactly the returned `activeChild` handle before advancing parent state to `awaitFixmeTask`; `lifecycle parent prepare-child` performs that persistence before it returns. The child prompt must include the returned blocks in this shape and order:

```text
<launch.promptBlocks.taskStateOwner>
<launch.promptBlocks.parentContinuation>
<launch.promptBlocks.activeChild>
<launch.promptBlocks.project>
<launch.promptBlocks.liveness>
<launch.promptBlocks.taskInput>
<launch.usageContext>
```

Compatibility names for the returned prompt block members are `<promptBlocks.taskStateOwner>`, `<promptBlocks.parentContinuation>`, `<promptBlocks.activeChild>`, `<promptBlocks.project>`, `<promptBlocks.liveness>`, and `<promptBlocks.taskInput>` under `launch.promptBlocks`.

`launch.promptBlocks.taskStateOwner` identifies `fixme-task` as the task-state owner. The returned `promptBlocks.taskStateOwner`, `promptBlocks.parentContinuation`, and `promptBlocks.activeChild` are the continuation contract. `launch.promptBlocks.parentContinuation` carries `parentSkill`, `parentRunId`, `transport`, `resumeStep`, and `parentStatusId`. `launch.promptBlocks.activeChild` carries the exact returned active-child handle. `launch.usageContext` carries the returned pipeline and parent invocation context. Pass these returned blocks through verbatim, then append only parent-owned prose that is not already represented in `launch.promptBlocks.taskInput`.

If `launch.transport == "inline-skill"`, Claude executes the installed/source `fixme-task` skill with the rendered prompt:

```text
Skill(
  skill="fixme-task",
  args="<launch.promptBlocks.taskStateOwner>
<launch.promptBlocks.parentContinuation>
<launch.promptBlocks.activeChild>
<launch.promptBlocks.project>
<launch.promptBlocks.liveness>
<launch.promptBlocks.taskInput>
<launch.usageContext>"
)
```

If `launch.transport == "agent"`, Codex launches the registered `fixme-task` agent with the returned prompt and runtime settings:

```text
spawn_agent(agent_type="fixme-task", reasoning_effort=launch.runtimeSettings.reasoningEffort, message="<rendered launch.promptBlocks>")
```

The returned `launch.promptBlocks.liveness` contains the child run context, including `statusId: <fixmeTaskStatusId>`.

fixme-task runs the default pipeline (plan with review loop -> execute with review loop), handling plan writing, plan review, execution, and code review internally. In parent-driven mode, its substeps appear as `Step 9.1` ... `Step 9.8` between this skill's `Step 7` and `Step 10`, so when the pipeline finishes the model sees `Step 10 [verify]` as the next pending item and continues automatically.

The returned launch transport decides the execution path. Claude may use the `inline-skill` branch above. Codex must use the `agent` branch above, launching the registered `fixme-task` agent; that child task then owns its plan, execute, review, handler, research, investigation, and browser verification sub-agent dispatches.

When waiting or reporting status while the child pipeline is active, read liveness instead of inferring progress from git or CI. `awaitFixmeTask` polls child liveness and advances to `brokerChildAttention` on a pending attention or to `consumeTaskEvent` when a durable task event exists for the active batch:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run status --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId>
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle task-event consume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --next
```

Report the active agent, state, checkpoint, current command, and `updatedAt`. If `currentCommand` is `attention:<attention-id>`, follow the attention broker path before reporting coarse progress. When a durable task event exists for the active child, consume it with `lifecycle task-event consume --next`, record the child result summary path into the active batch (`ledger.childResultSummaryPaths`), and route per the cursor table (childFailed -> failed summarize; more batches -> increment + dispatch; all done -> verify). If `run status` fails, print a warning with `fixmeTaskStatusId` and then fall back to the previous coarse signals.

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
- **fixme-task invocation**: uses `lifecycle parent prepare-child --data-file` followed only by the returned `launch.transport` branch. Claude may execute the `inline-skill` branch when returned by the CLI. Codex must execute the `agent` branch and launch the registered `fixme-task` agent, which owns its downstream sub-agent dispatches.

## Review-Level PR Comment Metadata

Resolve with `config review-level resolve --path pullRequestComments`.

Each normalized review item includes `REVIEW_ASSESSMENT`, `REVIEW_LEVEL`, and `LEVEL_ROUTE`.

Routes:
- LEVEL_ROUTE=blocking-fix -> ROUTE: CURRENT_PR_FIX
- LEVEL_ROUTE=follow-up -> VERDICT: FOLLOWUP_ONLY and ROUTE: FOLLOWUP
- LEVEL_ROUTE=decision-needed -> ROUTE: DECISION
- LEVEL_ROUTE=dismissed -> ROUTE: NO_ACTION unless a reply is still needed

Follow-up by review level: {number followed up, with group IDs or None}
