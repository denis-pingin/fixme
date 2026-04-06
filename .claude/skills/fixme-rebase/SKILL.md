---
name: fixme-rebase
description: Safely rebase current branch onto its base branch with conflict resolution, verification, and data protection. Detects base branch from PR target or merge-base, analyzes divergence, backs up when needed, resolves conflicts with intent awareness, and runs full verification before declaring done.
argument-hint: "[base-branch]"
---

# Rebase Branch

Rebase the current branch onto its base branch. Safety, clarity, and verification at every step.

## Hard Constraints

- **Never push without explicit user confirmation.** Offer to push, then wait. Force-push implications must be stated.
- **Never rebase main, master, or develop.** If on a protected branch, stop immediately and tell the user.
- **Never lose uncommitted work.** Stash before rebase, unstash after. Verify stash succeeded.
- **Never proceed through ambiguity.** If the base branch is unclear, the user's intent is unclear, or a conflict resolution is uncertain - stop and ask.
- **Never skip post-rebase verification.** Build, lint, and tests must run after rebase completes. Regressions introduced by conflict resolution must be caught.
- **Never commit a merge before verification passes.** When falling back from rebase to merge, the resolved-but-uncommitted state is an opportunity: run the full verification suite BEFORE `git commit`. This is the critical difference between merge and rebase - rebase auto-commits via `git rebase --continue`, but merge lets you verify first. Use that advantage.
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
   Determine protected branches dynamically:
   - **Check `.fixme/config.json`** for a `protectedBranches` array (if present).
   - **Check remote default branch:** `git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'`
   - **Fallback heuristic:** check which of `main`, `master`, `develop` exist locally or on the remote.
   - Combine all sources into the protected set.

   If the current branch is in the protected set - stop. Tell the user: "You're on `<branch>`, which is a protected branch. Rebasing it rewrites shared history. Switch to your feature branch first."

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

0. **Check for user-provided argument:**
   If a base branch argument was provided (e.g., `/fixme-rebase develop`):
   ```bash
   # Check local first
   git rev-parse --verify <argument> 2>/dev/null
   # Then remote
   git rev-parse --verify origin/<argument> 2>/dev/null
   ```
   - If the branch exists locally: use the local branch name as `BASE_BRANCH`. Skip to the freshness step (step 5).
   - If only on remote: `git fetch origin <argument> && git branch <argument> origin/<argument>` to create a local tracking branch. Use as `BASE_BRANCH`. Skip to step 5.
   - If neither: tell the user "`<argument>` doesn't exist locally or on origin. Falling back to auto-detection." Continue to step 1.

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

3. **Find merge-base among all local branches:**
   The current branch may have been forked from another feature branch, not just main/master/develop. Scan ALL local branches to find the true parent.

   ```bash
   # All local branches except current
   git branch --format='%(refname:short)' | grep -v "^$(git branch --show-current)$"
   ```

   For each candidate, compute the merge-base and count how many of OUR commits sit above it:
   ```bash
   mb=$(git merge-base HEAD <candidate> 2>/dev/null)
   git rev-list --count $mb..HEAD
   ```

   **Ranking:** The branch whose merge-base produces the FEWEST commits on our side (`merge-base..HEAD`) is the most likely parent. This works because:
   - If we forked from `feat/alp-84`, the merge-base with it is close to HEAD (only our new commits above it).
   - If we check `master`, the merge-base is much further back (all of `feat/alp-84`'s commits plus ours).

   **Tie-breaking:** If two branches produce the same commit count, prefer the one whose merge-base is also closest to ITS OWN tip (smallest `git rev-list --count $mb..<candidate>`). This distinguishes the direct parent from a sibling branch.

   Record the top 3 candidates with their commit counts for the summary.

4. **If ambiguous or no clear base:** Present the top candidates to the user. Show each branch, its merge-base, and how many commits diverge on each side. Ask which one to use.

5. **Freshen both branches:**
   Before rebasing, ensure both the base branch and the current branch are up-to-date with their remotes. These checks ONLY apply when a branch has a remote tracking branch - local-only branches are fine as-is.

   **a. Freshen the base branch:**
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name <BASE_BRANCH>@{upstream} 2>/dev/null
   ```
   - **No upstream (local-only):** Skip - use the local ref as-is.
   - **Has upstream:** Fetch and compare:
     ```bash
     git fetch origin <BASE_BRANCH>
     git rev-list <BASE_BRANCH>...origin/<BASE_BRANCH> --count --left-right
     ```
     - **Behind only (0 ahead, N behind):** Fast-forward silently: `git branch -f <BASE_BRANCH> origin/<BASE_BRANCH>`.
     - **Up-to-date (0, 0):** Good, proceed.
     - **Diverged (N ahead, M behind):** **STOP.** Tell the user: "Base branch `<BASE_BRANCH>` has diverged from `origin/<BASE_BRANCH>` (N local commits ahead, M remote commits behind). Cannot rebase onto a diverged base. Please reconcile `<BASE_BRANCH>` with its remote first." Do not proceed.

   **b. Freshen the current branch:**
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null
   ```
   - **No upstream (local-only or not yet pushed):** Skip - nothing to check.
   - **Has upstream:** Fetch and compare:
     ```bash
     git fetch origin $(git branch --show-current)
     git rev-list HEAD...@{upstream} --count --left-right
     ```
     - **Behind only (0 ahead, N behind):** **STOP.** Tell the user: "Your branch is behind `origin/<branch>` by N commits. Pull or fast-forward before rebasing to avoid losing remote changes."
     - **Up-to-date or ahead-only:** Good, proceed.
     - **Diverged (N ahead, M behind):** **STOP.** Tell the user: "Your branch has diverged from `origin/<branch>` (N ahead, M behind). This is unusual. Reconcile with your remote before rebasing."

Record the chosen base branch as `BASE_BRANCH`. The rebase target is always the local ref `<BASE_BRANCH>` (guaranteed fresh by step 5).

### Phase 2: Branch Analysis

Understand the scope of what's about to happen.

1. **Find the common ancestor:**
   ```bash
   git merge-base HEAD <BASE_BRANCH>
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
   git log --oneline <MERGE_BASE>..<BASE_BRANCH> | head -30
   ```
   Record commit count and brief summary.

4. **Set up working directory:**
   ```bash
   REBASE_DIR=".fixme/rebase/$(date -u +%Y%m%dT%H%M%SZ)-$(git branch --show-current)-$(echo <BASE_BRANCH> | tr '/' '-')"
   mkdir -p "$REBASE_DIR"
   ```
   Record `REBASE_DIR` - all working files go here.

5. **Check if branch has been pushed:**
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null
   git rev-list HEAD...@{upstream} --count --left-right 2>/dev/null
   ```
   If the branch tracks a remote and has pushed commits: flag that push after rebase will require `--force-with-lease`.

6. **Check for already-rebased or cherry-picked commits:**
   ```bash
   git log --oneline --cherry-mark <MERGE_BASE>...HEAD
   ```
   Commits marked with `=` are already present on the base branch (cherry-picked or equivalent). These will be dropped during rebase. Note them for the user.

7. **Check for merge commits in our branch:**
   If merge commits exist in our history since `MERGE_BASE`, note that `--rebase-merges` will be needed to preserve merge topology, OR that merges will be linearized. This affects the rebase strategy.

8. **Check for fixup/squash commits:**
   ```bash
   git log --oneline <MERGE_BASE>..HEAD | grep -E '^[a-f0-9]+ (fixup!|squash!)'
   ```
   If found, note that `--autosquash` should be used.

### Phase 3: Pre-Rebase Summary

Present an informational summary before attempting the rebase. This is NOT a confirmation gate - proceed directly to Phase 4 after presenting.

**Format:**

```
## Rebasing onto <base-branch>

**Current branch:** <branch> at <short-hash>
**Base branch:** <base-branch> (from: PR #N / merge-base detection)
**Common ancestor:** <merge-base-short-hash> (<how far back>)

### Scope
- **Our commits:** N commits to rebase
  <list of commit onelines>
- **Their commits:** M new commits on <base-branch> since divergence
  <list of commit onelines>

### Flags
- [ ] Branch has been pushed - force-push will be required after rebase
- [ ] Merge commits detected - will use --rebase-merges
- [ ] fixup!/squash! commits detected - will use --autosquash
- [ ] N cherry-picked commits will be dropped (already on base)
- [ ] Uncommitted changes were stashed

Attempting rebase...
```

Proceed immediately to Phase 4.

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

1. **Load project verification commands:**
   - **First**, check `.fixme/project-context.yaml` for `build.command`, `lint.command`, and `test.command`. If present, use those.
   - **Fallback:** detect from CLAUDE.md, package.json, Makefile, or convention.

2. **Run each and record results:**
   ```bash
   <build-command> 2>&1 | tail -150
   <lint-command> 2>&1 | tail -150
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
  <BASE_BRANCH>
```

#### If rebase succeeds cleanly:
Proceed to Phase 7.

#### If rebase hits conflicts:

Leave the rebase paused. Do NOT abort.

1. **Identify conflicted files:**
   ```bash
   git diff --name-only --diff-filter=U
   ```

2. **Assess merge alternative** using the ORIGINAL_HEAD recorded in Phase 0 (not current HEAD, which has moved mid-rebase):
   ```bash
   git merge-tree --write-tree <BASE_BRANCH> <ORIGINAL_HEAD>
   ```
   - Exit 0: merge would be clean
   - Exit 1: merge would also conflict (parse stdout for conflict list)

3. **Present options to user:**

   ```
   Rebase paused - N conflicted files.
   <list of conflicted files>

   Merge assessment: clean (0 conflicts) / N conflicts (<file list>)

   Options:
   1. Resolve conflicts and continue rebase
   2. Abort rebase, merge instead [(clean) / (N conflicts)]
   3. Abort (do nothing)
   ```

   **Wait for user choice.**

4. **If user chooses option 1 (resolve and continue):**

   For each conflicted file, understand intent before resolving:

   a. Read the conflict markers in the file.

   b. Understand OUR side's intent:
   ```bash
   git log --oneline -3 <ORIGINAL_HEAD> -- <file>
   ```
   Read the commits that changed this file on our branch. What were we trying to do?

   c. Understand THEIR side's intent:
   ```bash
   git log --oneline -3 <BASE_BRANCH> -- <file>
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

   g. Continue rebase:
   ```bash
   git rebase --continue
   ```

   h. Repeat for each conflicted commit until rebase completes.

5. **If user chooses option 2 (merge instead):**
   ```bash
   git rebase --abort
   git merge <BASE_BRANCH>
   ```
   If merge has conflicts, resolve them using the same intent-based approach above. After resolving all conflicts, stage files with `git add` but **DO NOT run `git commit` yet.** The merge stays uncommitted. Proceed to Phase 7 - verification runs first, commit happens only after verification passes.

6. **If user chooses option 3 (abort):**
   ```bash
   git rebase --abort
   ```
   If stash was created in Phase 0, unstash: `git stash pop`.
   Stop here.

#### If rebase fails catastrophically:

```bash
git rebase --abort
```

Tell the user: "Rebase aborted. Branch is back to its original state at `<ORIGINAL_HEAD>`. The issue was: <description>."

If stash was created in Phase 0, unstash: `git stash pop`.

Stop here. Do not retry without user guidance.

### Phase 7: Verification, Commit & Cleanup

1. **Unstash if applicable:**
   If we stashed in Phase 0:
   ```bash
   git stash pop
   ```
   If pop fails due to conflicts: `git stash drop` is NOT safe. Tell the user: "Stash couldn't be applied cleanly. Your stashed changes are still in `git stash list`. Apply manually with `git stash apply` after resolving."

2. **Reinstall dependencies if lockfile changed:**
   The rebase may have brought in commits that changed dependency lockfiles. Stale dependencies cause false verification failures that appear "pre-existing" but aren't.

   ```bash
   git diff --name-only <ORIGINAL_HEAD> HEAD -- \
     'bun.lockb' 'package-lock.json' 'yarn.lock' 'pnpm-lock.yaml' \
     'Gemfile.lock' 'Cargo.lock' 'go.sum' 'poetry.lock' 'composer.lock'
   ```

   If any lockfile changed:
   - Check `.fixme/project-context.yaml` for `install.command`. If present, use it.
   - Otherwise detect from lockfile: `bun.lockb` → `bun install`, `package-lock.json` → `npm install`, `yarn.lock` → `yarn install`, `pnpm-lock.yaml` → `pnpm install`, etc.
   - Run the install command and confirm it succeeds before proceeding.

3. **Run full verification suite:**
   Same commands as Phase 5. Compare results with baseline.

   - If results match baseline (same passes, same pre-existing failures): verification passes.
   - If NEW failures appear (failures not in baseline): these are regressions from conflict resolution.
     - Investigate each regression.
     - Fix if the cause is clear (wrong conflict resolution, missing import, etc.).
     - After fixing, re-run full verification.
     - If after 3 fix attempts a regression persists: present it to the user. Offer to abort (restore from backup or `git reset --hard <ORIGINAL_HEAD>`).

4. **Commit post-rebase fixes if any:**
   After verification passes, check for uncommitted changes left by regression fixes:
   ```bash
   git status --porcelain
   ```
   If there are staged or unstaged changes (from fixing verification regressions, resolving unused imports, updating type signatures, etc.):
   - Stage all modified tracked files: `git add -u`
   - Commit with a message following the project's commit conventions (check CLAUDE.md, recent git log, or `.fixme/project-context.yaml` for the expected format).
   - Do NOT leave uncommitted changes for the user to discover later.

   This step is a no-op if verification passed without needing fixes.

5. **Commit the merge (merge fallback path only):**
   If the operation was a merge (Phase 6 option 2), the merge is still uncommitted at this point. Only after verification passes:
   ```bash
   git commit --no-edit
   ```
   This is intentional - merge allows verifying before committing, unlike rebase where `git rebase --continue` auto-commits. If verification failed and couldn't be fixed, abort with `git merge --abort` instead of committing broken code.

6. **Record result** in `$REBASE_DIR/result.md`:
   - Branch, base branch, commit counts
   - Conflict resolutions (file + one-line description each)
   - Verification baseline vs post-rebase comparison
   - Any regressions found and how they were resolved

### Phase 8: Summary & Push Offer

Present the complete summary:

```
## Rebase Complete

**Branch:** <branch>
**Rebased onto:** <base-branch>
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
If `git merge-base HEAD <BASE_BRANCH>` equals `<BASE_BRANCH>` HEAD:
"Branch is already up-to-date with `<base-branch>`. No rebase needed."
Stop.

### Empty rebase (all commits cherry-picked)
If all our commits are marked `=` in cherry-mark output:
"All commits on this branch are already present on `<base-branch>` (cherry-picked or equivalent). Rebase would result in an empty branch. No action taken."
Stop.

### Shallow clone
If `git rev-parse --is-shallow-repository` returns `true`:

A shallow clone is a partial copy of the repository that only includes recent commit history (created with `git clone --depth N`). The merge-base - the common ancestor commit where the current branch diverged from the base branch - may lie beyond the shallow boundary. Without the merge-base, git cannot determine which commits belong to the branch vs the base, and the rebase will fail.

The fix is `git fetch --unshallow origin`, which downloads the full history. This can be a large download on repos with extensive history.

Tell the user: "This is a shallow clone. The merge-base needed for rebase may be beyond the shallow boundary. Running `git fetch --unshallow origin` is required, but may be a large download depending on repo size. Proceed?"

**Wait for user confirmation before deepening.**

## Error Recovery

At any point if something goes wrong, **present the situation and recovery options to the user.** Never execute destructive recovery commands without explicit confirmation.

Present to the user:

"Something went wrong during rebase. Here's the current state and recovery options:"

1. **If rebase is in progress:** "A rebase is still in progress. I can abort it with `git rebase --abort`, which restores the branch to its pre-rebase state."
2. **If HEAD has moved but rebase completed incorrectly:** "HEAD is at `<current>` but should be at `<ORIGINAL_HEAD>`. I can restore with `git reset --hard <ORIGINAL_HEAD>`, which discards all changes since the rebase started."
3. **If backup branch exists:** "A backup exists at `<backup-branch>`. I can restore with `git reset --hard <backup-branch>`."
4. **If stash exists:** "You have stashed changes from before the rebase in `git stash list`. They can be applied with `git stash apply`."

"Which recovery action should I take?"

**Wait for explicit confirmation before running any destructive command (`git reset --hard`, `git rebase --abort`).**

After recovery, tell the user exactly what was done and what state the branch is in now.
