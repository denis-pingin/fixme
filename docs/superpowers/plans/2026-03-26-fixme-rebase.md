# fixme-rebase Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `/fixme-rebase` skill that safely rebases the current branch onto its base branch with intelligent conflict resolution, data protection, full verification, and user-facing summaries.

**Architecture:** Single SKILL.md file in `.claude/skills/fixme-rebase/`. No sub-agents, no orchestrator pattern - this is a focused specialist skill that executes a multi-phase git rebase workflow directly. The skill follows the established fixme-* skill format (YAML frontmatter, Hard Constraints, phased process) and will be auto-deployed by the existing `install.sh` glob (`fixme*`).

**Tech Stack:** Git CLI, `gh` CLI (for PR detection), project verification commands (build/lint/test)

---

## File Map

- **Create:** `.claude/skills/fixme-rebase/SKILL.md` - The complete skill definition

No other files need creation or modification. `install.sh` already deploys all `fixme*` directories automatically.

---

### Task 1: Create the skill directory

**Files:**
- Create: `.claude/skills/fixme-rebase/` (directory)

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .claude/skills/fixme-rebase
```

- [ ] **Step 2: Verify directory exists alongside siblings**

```bash
ls .claude/skills/ | grep fixme
```

Expected: `fixme-rebase` appears in the listing alongside `fixme-execute-plan`, `fixme-review-code`, etc.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-rebase
git commit --allow-empty -m "chore: create fixme-rebase skill directory"
```

---

### Task 2: Write the SKILL.md

This is the core deliverable. The SKILL.md defines the complete rebase workflow.

**Files:**
- Create: `.claude/skills/fixme-rebase/SKILL.md`

- [ ] **Step 1: Write the complete SKILL.md**

Create `.claude/skills/fixme-rebase/SKILL.md` with this exact content:

````markdown
---
name: fixme-rebase
description: Safely rebase current branch onto its base branch with conflict resolution, verification, and data protection. Detects base branch from PR target or merge-base, analyzes divergence, backs up when needed, resolves conflicts with intent awareness, and runs full verification before declaring done.
---

# Rebase Branch

Rebase the current branch onto its base branch. Safety, clarity, and verification at every step.

## Hard Constraints

- **Never push without explicit user confirmation.** Offer to push, then wait. Force-push implications must be stated.
- **Never rebase main, master, or develop.** If on a protected branch, stop immediately and tell the user.
- **Never lose uncommitted work.** Stash before rebase, unstash after. Verify stash succeeded.
- **Never proceed through ambiguity.** If the base branch is unclear, the user's intent is unclear, or a conflict resolution is uncertain - stop and ask.
- **Never skip post-rebase verification.** Build, lint, and tests must run after rebase completes. Regressions introduced by conflict resolution must be caught.
- **Never silently discard commits.** If rebase would drop, squash, or duplicate commits, surface this to the user before proceeding.

## Process

### Phase 0: Pre-Flight Safety

Before anything else, capture the full current state. This is the recovery baseline.

1. **Check for in-progress rebase or merge:**
   ```bash
   git status
   ```
   If output mentions "rebase in progress", "merge in progress", or "cherry-pick in progress" - stop and ask the user how to handle it (abort, continue, or skip this skill).

2. **Verify not on a protected branch:**
   ```bash
   git branch --show-current
   ```
   If on `main`, `master`, or `develop` - stop. Tell the user: "You're on `<branch>`. Rebasing a protected branch rewrites shared history. Switch to your feature branch first."

3. **Record recovery point:**
   ```bash
   git rev-parse HEAD
   ```
   Save this as `ORIGINAL_HEAD`. This is the commit to restore if anything goes wrong.

4. **Handle uncommitted changes:**
   ```bash
   git status --porcelain
   ```
   - If output is empty: clean working tree, proceed.
   - If output is non-empty:
     - Show the user what's uncommitted (modified files, untracked files).
     - Stash everything: `git stash push -u -m "fixme-rebase: auto-stash before rebase"`.
     - Verify stash succeeded: `git stash list` - confirm the stash appears at top.
     - Record that we stashed (need to unstash in Phase 7).

5. **Record current branch state:**
   ```bash
   git log --oneline -20
   git branch -vv
   ```
   This snapshot is used for the final summary comparison.

### Phase 1: Base Branch Detection

Determine what to rebase onto. Priority order:

1. **Check for an open PR:**
   ```bash
   gh pr view --json baseRefName,url -q '"\(.baseRefName) \(.url)"' 2>/dev/null
   ```
   - If a PR exists: use the PR's base branch. Note the PR URL for the summary.
   - If `gh` fails or no PR: continue to step 2.

2. **Detect default/main branch:**
   ```bash
   git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'
   ```
   This gives the remote's default branch (usually `main` or `master`).

3. **Find merge-base candidates:**
   For each candidate branch (`main`, `master`, `develop`, and the detected default):
   ```bash
   git merge-base HEAD origin/<candidate> 2>/dev/null
   ```
   Pick the candidate whose merge-base is closest to HEAD (fewest commits between merge-base and HEAD). This is the most likely branch we forked from.

4. **If ambiguous or no clear base:** Present findings to the user. Show which branches were checked, the merge-base for each, and how many commits diverge. Ask which one to use.

5. **Fetch the latest from the chosen base branch:**
   ```bash
   git fetch origin <base-branch>
   ```

Record the chosen base branch as `BASE_BRANCH` and `origin/<base-branch>` as the rebase target.

### Phase 2: Branch Analysis

Understand the scope of what's about to happen.

1. **Find the common ancestor:**
   ```bash
   git merge-base HEAD origin/<BASE_BRANCH>
   ```
   Record as `MERGE_BASE`.

2. **Our commits (to be rebased):**
   ```bash
   git log --oneline --no-merges <MERGE_BASE>..HEAD
   git log --oneline --merges <MERGE_BASE>..HEAD
   ```
   Record commit count (regular + merges separately).

3. **Their commits (what we're rebasing onto):**
   ```bash
   git log --oneline <MERGE_BASE>..origin/<BASE_BRANCH> | head -30
   ```
   Record commit count and brief summary.

4. **Predict conflict areas:**
   ```bash
   # Files we changed
   git diff --name-only <MERGE_BASE>..HEAD > /tmp/fixme-rebase-ours.txt
   # Files they changed
   git diff --name-only <MERGE_BASE>..origin/<BASE_BRANCH> > /tmp/fixme-rebase-theirs.txt
   # Overlap = likely conflicts
   comm -12 <(sort /tmp/fixme-rebase-ours.txt) <(sort /tmp/fixme-rebase-theirs.txt)
   ```

5. **Check for already-rebased or cherry-picked commits:**
   ```bash
   git log --oneline --cherry-mark <MERGE_BASE>..HEAD
   ```
   Commits marked with `=` are already present on the base branch (cherry-picked or equivalent). These will be dropped during rebase. Note them for the user.

6. **Check if branch has been pushed:**
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null
   git rev-list HEAD...@{upstream} --count --left-right 2>/dev/null
   ```
   If the branch tracks a remote and has pushed commits: flag that push after rebase will require `--force-with-lease`.

7. **Check for merge commits in our branch:**
   If merge commits exist in our history since `MERGE_BASE`, note that `--rebase-merges` will be needed to preserve merge topology, OR that merges will be linearized. This affects the rebase strategy.

8. **Check for fixup/squash commits:**
   ```bash
   git log --oneline <MERGE_BASE>..HEAD | grep -E '^[a-f0-9]+ (fixup!|squash!)'
   ```
   If found, note that `--autosquash` should be used.

### Phase 3: State Presentation & User Confirmation

Present a clear summary to the user. This is the decision point.

**Format the output as:**

```
## Rebase Analysis

**Current branch:** <branch> at <short-hash>
**Base branch:** <base-branch> (from: PR #N / merge-base detection)
**Common ancestor:** <merge-base-short-hash> (<how far back>)

### Scope
- **Our commits:** N commits to rebase
  <list of commit onelines>
- **Their commits:** M new commits on <base-branch> since divergence
  <list of commit onelines, truncated at 15 with "...and N more">
- **Predicted conflicts:** K files changed on both sides
  <list of overlapping files>

### Flags
- [ ] Branch has been pushed - force-push will be required after rebase
- [ ] Merge commits detected - will use --rebase-merges
- [ ] fixup!/squash! commits detected - will use --autosquash
- [ ] N cherry-picked commits will be dropped (already on base)
- [ ] Uncommitted changes were stashed

### Action Plan
1. <backup step if applicable>
2. Run: git rebase [flags] origin/<base-branch>
3. Resolve conflicts if any (N files predicted)
4. Run full verification (build, lint, tests)

### Assessment
<If merge might be better, explain why:
 - "This branch has N merge commits from <base> and M conflicts predicted. A merge would preserve history and avoid conflict resolution. Rebase will linearize history but requires resolving each conflict per-commit."
 - Or: "Clean rebase candidate - linear history, no merge commits, minimal conflict surface.">
```

**Ask for confirmation:** "Proceed with rebase?" or "I'd recommend merge instead for the reason above - your call."

If the user wants merge instead: run `git merge origin/<BASE_BRANCH>` and skip to Phase 6 (verification). Adjust the summary accordingly.

**Wait for explicit confirmation before proceeding.**

### Phase 4: Safety Net

Create a backup only when there is genuine risk of data loss:
- Branch has been pushed (force-push could desync with collaborators)
- Complex history (merge commits, many conflicts predicted)
- The rebase involves more than 10 commits

If backup is warranted:

```bash
git branch backup/fixme-rebase/<branch>-<YYYYMMDD-HHMMSS>
```

Record the backup branch name. Tell the user: "Backup created at `backup/fixme-rebase/<branch>-<timestamp>`. Can be restored with `git reset --hard <backup-branch>` if needed."

If no backup is needed (simple, clean, few commits, not pushed): skip this step. Don't create unnecessary branches.

### Phase 5: Pre-Rebase Verification Baseline

Run the project's full verification suite BEFORE the rebase. This establishes what "working" looks like.

1. **Detect project verification commands** from CLAUDE.md, package.json, Makefile, or convention:
   - Build command
   - Lint command
   - Test command

2. **Run each and record results:**
   ```bash
   <build-command> 2>&1 | tail -50
   <lint-command> 2>&1 | tail -50
   <test-command> 2>&1 | tail -150
   ```

3. **Record baseline:**
   - If all pass: baseline is clean. Any post-rebase failure is a regression from conflict resolution.
   - If some fail: record exactly which tests/checks fail. These are pre-existing and should not block completion.

### Phase 6: Rebase Execution

Build the rebase command based on Phase 2 analysis:

```bash
git rebase \
  $(test -n "$HAS_MERGE_COMMITS" && echo "--rebase-merges") \
  $(test -n "$HAS_FIXUP_COMMITS" && echo "--autosquash") \
  origin/<BASE_BRANCH>
```

#### If rebase succeeds cleanly:
Proceed to Phase 7.

#### If rebase hits conflicts:

For each conflicted state:

1. **Identify conflicted files:**
   ```bash
   git diff --name-only --diff-filter=U
   ```

2. **For each conflicted file, understand intent before resolving:**

   a. Read the conflict markers in the file.

   b. Understand OUR side's intent:
   ```bash
   git log --oneline -3 -- <file>
   ```
   Read the commits that changed this file on our branch. What were we trying to do?

   c. Understand THEIR side's intent:
   ```bash
   git log --oneline -3 origin/<BASE_BRANCH> -- <file>
   ```
   Read the commits that changed this file on the base branch. What were they trying to do?

   d. Read the common ancestor version for context:
   ```bash
   git show <MERGE_BASE>:<file>
   ```

   e. **Resolve based on intent:**
   - If changes are to different logical sections: take both (merge non-overlapping changes).
   - If changes conflict on the same logic: determine which intent should win. Usually OUR changes are the "feature" and THEIR changes are the "foundation" - our feature should be adapted to work on their updated foundation.
   - If the resolution is unclear: **stop and present the conflict to the user.** Show both sides, explain the intent of each, and ask how to resolve.

   f. After resolving, stage the file:
   ```bash
   git add <file>
   ```

3. **Continue rebase:**
   ```bash
   git rebase --continue
   ```

4. Repeat for each conflicted commit until rebase completes.

#### If rebase fails catastrophically:

```bash
git rebase --abort
```

Tell the user: "Rebase aborted. Branch is back to its original state at `<ORIGINAL_HEAD>`. The issue was: <description>."

If stash was created in Phase 0, unstash: `git stash pop`.

Stop here. Do not retry without user guidance.

### Phase 7: Post-Rebase Verification & Cleanup

1. **Unstash if applicable:**
   If we stashed in Phase 0:
   ```bash
   git stash pop
   ```
   If pop fails due to conflicts: `git stash drop` is NOT safe. Tell the user: "Stash couldn't be applied cleanly. Your stashed changes are still in `git stash list`. Apply manually with `git stash apply` after resolving."

2. **Run full verification suite:**
   Same commands as Phase 5. Compare results with baseline.

   - If results match baseline (same passes, same pre-existing failures): verification passes.
   - If NEW failures appear (failures not in baseline): these are regressions from conflict resolution.
     - Investigate each regression.
     - Fix if the cause is clear (wrong conflict resolution, missing import, etc.).
     - After fixing, re-run full verification.
     - If after 3 fix attempts a regression persists: present it to the user. Offer to abort (restore from backup or `git reset --hard <ORIGINAL_HEAD>`).

3. **Clean up temp files:**
   ```bash
   rm -f /tmp/fixme-rebase-ours.txt /tmp/fixme-rebase-theirs.txt
   ```

### Phase 8: Summary & Push Offer

Present the complete summary:

```
## Rebase Complete

**Branch:** <branch>
**Rebased onto:** origin/<base-branch>
**Commits rebased:** N (M conflicts resolved, K cherry-picked commits dropped)

### Conflict Resolution Summary
<For each conflict:>
- **<file>**: <one-line description of what conflicted and how it was resolved>

### Verification
- Build: PASS / FAIL (was: PASS / FAIL)
- Lint: PASS / FAIL (was: PASS / FAIL)
- Tests: PASS (N passing) / FAIL (was: PASS / FAIL)
<If pre-existing failures: "N pre-existing test failures unchanged">

### Before / After
<git log --oneline --graph -10, showing the new linear history>
```

**If the branch was previously pushed:**
"This branch was previously pushed to `origin/<branch>`. Updating the remote requires force-push. I'll use `--force-with-lease` which is safe against overwriting someone else's changes."

**Always end with:**
"Ready to push? I'll run: `git push --force-with-lease origin <branch>`"

**Wait for explicit confirmation. Do not push.**

If the user confirms push:
```bash
git push --force-with-lease origin <branch>
```

If push succeeds and a backup branch was created:
"Push successful. Backup branch `backup/fixme-rebase/<branch>-<timestamp>` is no longer needed. Want me to delete it?"

## Edge Cases

### Already up-to-date
If `git merge-base HEAD origin/<BASE_BRANCH>` equals `origin/<BASE_BRANCH>` HEAD:
"Branch is already up-to-date with `<base-branch>`. No rebase needed."
Stop.

### Empty rebase (all commits cherry-picked)
If all our commits are marked `=` in cherry-mark output:
"All commits on this branch are already present on `<base-branch>` (cherry-picked or equivalent). Rebase would result in an empty branch. No action taken."
Stop.

### Diverged from remote tracking branch
If local branch has diverged from its remote tracking branch BEFORE we start:
Warn the user: "Your local branch has diverged from `origin/<branch>` (N ahead, M behind). This is unusual. Want to proceed with rebase anyway, or first reconcile with your remote?"

### Shallow clone
If `git rev-parse --is-shallow-repository` returns `true`:
"This is a shallow clone. Rebase may fail if the merge-base is beyond the shallow boundary. Deepening: `git fetch --unshallow origin`."
Deepen automatically, then proceed.

## Error Recovery

At any point if something goes wrong:

1. If rebase is in progress: `git rebase --abort`
2. If HEAD has moved but rebase completed incorrectly: `git reset --hard <ORIGINAL_HEAD>`
3. If backup branch exists: `git reset --hard <backup-branch>`
4. If stash exists: verify `git stash list`, apply if needed

Always tell the user exactly what recovery action was taken and what state the branch is in now.
````

- [ ] **Step 2: Verify the file was written correctly**

```bash
head -5 .claude/skills/fixme-rebase/SKILL.md
```

Expected: The YAML frontmatter opening with `---` and `name: fixme-rebase`.

```bash
wc -l .claude/skills/fixme-rebase/SKILL.md
```

Expected: Approximately 250-300 lines.

- [ ] **Step 3: Verify install.sh will pick it up**

```bash
bash -c 'for dir in .claude/skills/fixme*; do echo "$(basename "$dir")"; done'
```

Expected: `fixme-rebase` appears in the list.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-rebase/SKILL.md
git commit -m "feat: add fixme-rebase skill for safe branch rebasing"
```

---

### Task 3: Install and smoke-test the skill

**Files:** None (runtime verification)

- [ ] **Step 1: Run the installer**

```bash
./install.sh
```

Expected: Output includes `Installed fixme-rebase`.

- [ ] **Step 2: Verify skill is deployed**

```bash
ls ~/.claude/skills/fixme-rebase/SKILL.md
```

Expected: File exists.

- [ ] **Step 3: Verify skill frontmatter is valid**

```bash
head -4 ~/.claude/skills/fixme-rebase/SKILL.md
```

Expected:
```
---
name: fixme-rebase
description: Safely rebase current branch onto its base branch with conflict resolution, verification, and data protection. Detects base branch from PR target or merge-base, analyzes divergence, backs up when needed, resolves conflicts with intent awareness, and runs full verification before declaring done.
---
```

- [ ] **Step 4: Verify skill appears in Claude Code**

Invoke the skill in Claude Code to confirm it loads:
```
/fixme-rebase
```

Expected: The skill content loads. Since we're on `main` with no divergence, it should detect "already up-to-date" and stop gracefully.

- [ ] **Step 5: Commit if any adjustments were needed**

If any fixes were applied during smoke testing:
```bash
git add .claude/skills/fixme-rebase/SKILL.md
git commit -m "fix: adjust fixme-rebase skill after smoke test"
```

---

## Design Rationale

### Why single-file, no sub-agents?

Unlike fixme-task (which chains 6+ skills) or fixme-session (which dispatches investigation/fix/verify agents), rebase is a sequential, focused operation. Every phase depends on the previous one's output. Sub-agents would add latency and context-switching overhead without benefit. The skill runs in one agent context with full git state visibility.

### Why `--force-with-lease` instead of `--force`?

`--force-with-lease` checks that the remote ref hasn't been updated by someone else since our last fetch. If a collaborator pushed to the same branch, `--force-with-lease` fails safely instead of overwriting their work. `--force` would silently destroy their commits.

### Why backup only when warranted?

Creating backup branches for every trivial rebase (2 commits, no conflicts, never pushed) adds noise. The skill assesses risk factors (pushed branch, merge commits, many commits, predicted conflicts) and only backs up when there's genuine data loss potential. `ORIGINAL_HEAD` is always recorded regardless, providing a lightweight recovery path even without a named backup branch.

### Why intent-based conflict resolution?

Mechanical conflict resolution (pick ours/theirs, combine lines) produces code that compiles but doesn't work. When feature branch adds a function and base branch renames the module it's in, mechanical merge keeps the function in the old location. Intent-based resolution recognizes: "they renamed the module, we added a function - the function should go in the renamed module." This requires reading commit messages and surrounding code, not just the conflict markers.

### Why pre-rebase verification baseline?

Without a baseline, post-rebase test failures can't be attributed. A test that was already failing before rebase isn't a regression. A test that passes before but fails after is. The baseline makes this distinction objective.

### Why detect merge-commits and cherry-picks?

- **Merge commits:** Standard `git rebase` linearizes history, dropping merge commits. If the branch intentionally merged base into itself (to resolve conflicts earlier, to get a dependency), `--rebase-merges` preserves that topology. Dropping merges can re-introduce the conflicts they resolved.
- **Cherry-picks:** If a commit was cherry-picked to the base branch, rebasing will try to apply it again. Git usually detects this (patch-id matching) and skips it, but the user should know which commits were dropped and why.

### What the user didn't explicitly ask for but matters

1. **Shallow clone detection** - If repo was cloned with `--depth`, merge-base may not be reachable. Auto-deepen.
2. **In-progress rebase detection** - If a previous rebase was interrupted, starting a new one fails confusingly. Detect and offer recovery.
3. **Diverged remote tracking** - If local and remote of the same branch have diverged, rebase adds another layer of divergence. Surface this upfront.
4. **`--autosquash` for fixup commits** - If the branch has `fixup!` or `squash!` commits, they should be squashed during rebase rather than left as separate commits.
5. **`--rebase-merges` for merge topology** - Preserves intentional merge structure instead of flattening.
6. **Cherry-pick detection** - Prevents confusion when commits "disappear" during rebase.
7. **Stash pop failure handling** - `git stash pop` can itself conflict. The skill handles this instead of losing the stash.
8. **3-attempt regression fix limit** - Prevents infinite loops when a conflict resolution introduces a subtle bug.
