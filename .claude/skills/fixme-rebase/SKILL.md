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

6. **Detect shallow clone:**
   ```bash
   git rev-parse --is-shallow-repository
   ```
   - **Returns `false`:** Set `SHALLOW_CLONE=false`. Proceed.
   - **Returns `true`:** Set `SHALLOW_CLONE=true`. Inform the user:

     "This is a shallow clone. Fork-point detection is less reliable beyond the shallow boundary, and the content walk in Phase 2.5 cannot run safely against truncated history.

     Options:
     1. Run `git fetch --unshallow` now and continue with full detection (may be a large download)
     2. Proceed in degraded detection mode (content walk skipped, Phase 2.5 confidence downgraded by one level)"

     **Wait for user choice.**

     - If user picks option 1: run `git fetch --unshallow origin`, verify success with `git rev-parse --is-shallow-repository` returning `false`, then set `SHALLOW_CLONE=false` and proceed.
     - If user picks option 2: keep `SHALLOW_CLONE=true` and proceed. Downstream phases honor this flag inline: Phase 1 Step 5a aborts auto-reset on missing commits, Phase 2.5 Step 5 content walk is skipped entirely, Phase 2.5 Steps 1-3 downgrade confidence by one level.

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

5. **Freshen both branches (MUST happen before any early-exit checks):**

   **CRITICAL: Do NOT evaluate edge cases (already up-to-date, empty rebase, etc.) until AFTER this step completes.** The local base branch may be stale or diverged from its remote. Any comparison against a stale local ref is meaningless. Step 6 performs those checks after freshening.

   Before rebasing, ensure both the base branch and the current branch are up-to-date with their remotes. These checks ONLY apply when a branch has a remote tracking branch - local-only branches are fine as-is.

   **a. Freshen the base branch:**

   Resolve the tracked upstream name dynamically - never hardcode `origin`:
   ```bash
   UPSTREAM=$(git rev-parse --abbrev-ref <BASE_BRANCH>@{upstream} 2>/dev/null)
   ```
   - **No upstream (local-only):** Skip - use the local ref as-is. Set `BASE_WAS_REWRITTEN=false`.
   - **Has upstream:** Fetch and compare:
     ```bash
     git fetch $(echo "$UPSTREAM" | cut -d/ -f1) $(echo "$UPSTREAM" | cut -d/ -f2-)
     git rev-list <BASE_BRANCH>...$UPSTREAM --count --left-right
     ```
     - **Behind only (0 ahead, N behind):** Fast-forward silently: `git branch -f <BASE_BRANCH> $UPSTREAM`. Set `BASE_WAS_REWRITTEN=false`.
     - **Up-to-date (0, 0):** Set `BASE_WAS_REWRITTEN=false`. Proceed.
     - **Diverged (N ahead, M behind):** Run the ancestry check BEFORE stopping. The local base may simply be stale relative to an upstream that was rewritten (rebase, amend, force-push), in which case every "local-ahead" commit is actually an ancestor of HEAD and the local ref is safe to reset.

       **Ancestry check (single Bash invocation with an internal shell loop):**
       ```bash
       diverged=$(git rev-list $UPSTREAM..<BASE_BRANCH>)
       all_ancestors=true
       missing=false
       for c in $diverged; do
         if ! git cat-file -e "$c^{commit}" 2>/dev/null; then
           missing=true
           break
         fi
         if ! git merge-base --is-ancestor "$c" HEAD 2>/dev/null; then
           all_ancestors=false
           break
         fi
       done
       echo "all_ancestors=$all_ancestors missing=$missing"
       ```

       **Decision:**

       - **`missing=true`** (shallow clone with commits beyond the boundary - `SHALLOW_CLONE=true` triggers this path): abort the auto-reset. Fall through to the diverged STOP below. Do not guess.
       - **`all_ancestors=true`** (every local-only commit is reachable from HEAD, i.e., the base branch's "extra" commits are identical-or-older to what we already contain): safe to reset automatically.
         1. Record the pre-reset SHA: `PRE_RESET_SHA=$(git rev-parse <BASE_BRANCH>)`
         2. Create a backup branch: `git branch backup/fixme-rebase/<BASE_BRANCH>-$(date -u +%Y%m%dT%H%M%SZ) <BASE_BRANCH>`
         3. Reset: `git branch -f <BASE_BRANCH> $UPSTREAM`
         4. Set `BASE_WAS_REWRITTEN=true`
         5. Announce to the user: "Local `<BASE_BRANCH>` had N commits that are already contained in HEAD. Upstream appears to have been rewritten. Reset local `<BASE_BRANCH>` to `$UPSTREAM` (was at `<PRE_RESET_SHA>`). Backup saved as `backup/fixme-rebase/<BASE_BRANCH>-<timestamp>`."
         6. Continue to Phase 1 step 6.
       - **`all_ancestors=false`** (at least one local-only commit is real local work not present in HEAD): fall through to the diverged STOP below - the base branch holds genuine work that must not be discarded.

       **Diverged STOP (only reached when ancestry check says auto-reset is unsafe):** Tell the user: "Base branch `<BASE_BRANCH>` has diverged from its upstream `$UPSTREAM` (N local commits ahead, M remote commits behind) and the local-ahead commits are not all reachable from HEAD. Cannot auto-reset. Please reconcile `<BASE_BRANCH>` with its upstream first." Do not proceed.

   **b. Freshen the current branch:**

   Resolve the tracked upstream dynamically - never hardcode `origin`:
   ```bash
   CUR_UPSTREAM=$(git rev-parse --abbrev-ref @{upstream} 2>/dev/null)
   ```
   - **No upstream (local-only or not yet pushed):** Skip - nothing to check.
   - **Has upstream:** Fetch and compare:
     ```bash
     git fetch $(echo "$CUR_UPSTREAM" | cut -d/ -f1) $(echo "$CUR_UPSTREAM" | cut -d/ -f2-)
     git rev-list HEAD...$CUR_UPSTREAM --count --left-right
     ```
     - **Behind only (0 ahead, N behind):** **STOP.** Tell the user: "Your branch is behind `$CUR_UPSTREAM` by N commits. Pull or fast-forward before rebasing to avoid losing remote changes."
     - **Up-to-date or ahead-only:** Good, proceed.
     - **Diverged (N ahead, M behind):** **STOP.** Tell the user: "Your branch has diverged from `$CUR_UPSTREAM` (N ahead, M behind). This is unusual. Reconcile with your upstream before rebasing."

Record the chosen base branch as `BASE_BRANCH`. The rebase target is always the local ref `<BASE_BRANCH>` (guaranteed fresh by step 5).

6. **Check for early-exit conditions (ONLY after freshening):**

   Now that the base branch is guaranteed fresh, check whether a rebase is actually needed:

   ```bash
   git merge-base HEAD <BASE_BRANCH>
   git rev-parse <BASE_BRANCH>
   ```

   - **Already up-to-date:** If `merge-base HEAD <BASE_BRANCH>` equals `<BASE_BRANCH>` HEAD, the branch already contains everything on the base. Tell user: "Branch is already up-to-date with `<BASE_BRANCH>`. No rebase needed." Stop.
   - **Empty rebase:** If all our commits are marked `=` in cherry-mark output (checked in Phase 2 step 6), all commits are already on the base. Tell user and stop. (This is a preliminary check - full cherry-mark analysis happens in Phase 2.)
   - Otherwise: proceed to Phase 2.

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

### Phase 2.5: Already-Represented Ancestor Detection

Detect scenarios where the current branch carries commits already represented on the target branch, so the rebase can switch to `git rebase --onto <target> <fork-point>` and replay only the current branch's own work. Two scenarios are in scope:

1. **Squash merge via PR** - a parent feature branch was merged to the target via GitHub's squash-merge. The current branch still holds the parent's individual commits; a normal rebase tries to replay all of them and hits massive conflicts because the target already contains those changes in squashed form.
2. **Upstream rewrite of the base branch** - the base branch was rewritten in place on its upstream (force-push after `git rebase`, `git commit --amend`, interactive rebase, etc.). After Phase 1 Step 5a resets local `<BASE_BRANCH>` to the rewritten upstream, commits on our side of the merge-base may be identical-content copies of pre-rewrite base commits that now live on the new base under different SHAs. A normal rebase replays them and produces either empty commits or conflicts.

This phase runs a cascade of increasingly expensive detection steps, short-circuiting when a definitive answer is found. If an already-represented ancestor is detected, the rebase switches to `--onto` mode. The user always confirms before execution.

**Prohibition on prose rationalization:** Once a detection step begins executing (particularly the Step 5 content walk), it MUST complete. Do not bail out of a running step based on narrative interpretation of the intermediate data ("this looks like organic refactors", "too much file overlap", "probably not a squash"). The algorithmic signal (inflection analysis, message-match partition, cherry-mark count) is authoritative. Prose reasoning about the data is not a substitute for running the algorithm to completion.

**When to skip the phase entirely:** If the commit count from Phase 2 step 2 is 5 or fewer in `MERGE_BASE..HEAD` AND the cherry-mark analysis from Phase 2 step 6 shows no `=`-marked commits AND `BASE_WAS_REWRITTEN` is false, skip this phase - the scenario is unlikely and detection cost isn't justified. Proceed directly to Phase 3. When `BASE_WAS_REWRITTEN=true`, never skip: the rewrite itself is independent evidence that already-represented commits likely exist.

#### Step 1: Local Branch Check

Check if any local branch shares a more recent merge-base with the current branch than the target branch does. This detects the parent branch when it still exists locally (even if deleted on the remote).

```bash
# Get the merge-base with target (already computed in Phase 2 as MERGE_BASE)
# For each non-target local branch, compute merge-base with HEAD
git branch --format='%(refname:short)' | grep -v "^$(git branch --show-current)$" | grep -v "^${BASE_BRANCH}$"
```

For each candidate branch:
```bash
candidate_mb=$(git merge-base HEAD <candidate> 2>/dev/null)
# Is this merge-base NEWER (descendant of) the target merge-base?
git merge-base --is-ancestor $MERGE_BASE $candidate_mb 2>/dev/null
```

If `candidate_mb` is a descendant of `MERGE_BASE`, it means the current branch and `<candidate>` diverged at a point AFTER the target merge-base. This candidate is likely the parent branch (or a sibling that shares the parent).

**Note:** Do NOT verify whether the candidate's tip is an ancestor of BASE_BRANCH. After a squash merge, the original branch's commits are unreachable from the target (the squash commit is a new single-parent commit). An `--is-ancestor` check would reject all valid squash-merge candidates - the exact scenario this phase exists to detect. The merge-base proximity check above is sufficient signal for a candidate to proceed to user confirmation. Step 2 (GitHub PR metadata) provides independent verification.

**If a match is found** (a local branch whose merge-base with HEAD is a strict descendant of MERGE_BASE):
- Record `FORK_POINT` = `candidate_mb` (where current branch diverged from the parent)
- Record `SQUASH_PARENT` = `<candidate>` (the parent branch name)
- Record `DETECTION_METHOD` = "local branch check"
- Record confidence: **MEDIUM** (topology-only evidence without independent squash-merge verification)
- Short-circuit: skip to the Findings Presentation section below

**If no match found:** Continue to Step 2.

**Note on deleted branches:** The common case after squash-merge is that the parent branch was deleted. In that case, no local branch will match and this step produces no result. That's expected - Steps 2-4 handle this case.

#### Step 2: GitHub PR Metadata

**Empty result is expected when `BASE_WAS_REWRITTEN=true`.** The upstream rewrite scenario typically involves no PR - the base branch was rewritten locally and force-pushed by an author, not merged via a pull request. If Step 2 returns no matching PRs in this case, that is expected data, NOT a negative detection signal. Do not lower the overall Phase 2.5 confidence on the basis of a Step 2 miss when `BASE_WAS_REWRITTEN=true`.

Query GitHub for recently merged PRs whose squash-merge commit is on the target branch and whose source branch shares history with the current branch. This is the highest-value detection step because squash merges almost always happen through PRs, and the PR metadata directly gives us the original branch name and the squash commit SHA.

```bash
# Find merged PRs targeting BASE_BRANCH, most recent first
gh api "repos/{owner}/{repo}/pulls?state=closed&base=${BASE_BRANCH}&sort=updated&direction=desc&per_page=30" \
  --jq '.[] | select(.merged_at != null and .merge_commit_sha != null) | "\(.number) \(.head.ref) \(.merge_commit_sha) \(.title)"'
```

For each merged PR:
1. Check if the PR was squash-merged (the merge commit has exactly one parent):
   ```bash
   git cat-file -p <merge_commit_sha> | grep -c "^parent"
   ```
   If parent count is 1: squash merge. If parent count is 2: regular merge. Skip regular merges.

2. Check if the current branch shares history with the PR's source branch. The PR's source branch may be deleted, but its commits are reachable through the squash commit's ancestry. Check if any commit in `MERGE_BASE..HEAD` is reachable from the PR's pre-squash history:
   ```bash
   # The squash commit on target replaces all commits from the PR branch.
   # If our branch forked from the PR branch, our merge-base with target
   # should be at or before the point where the PR branch diverged from target.
   # More directly: check if any of our commits' parent trees match.
   
   # Get the tree of each commit in our branch and see if the squash commit's
   # tree is a progression of our older commits' trees.
   # Simpler approach: check the commit message or PR branch name.
   
   # If we can find the original branch ref:
   git rev-parse --verify "refs/remotes/origin/${pr_head_ref}" 2>/dev/null
   ```
   
   If the PR's source branch ref still exists on the remote:
   ```bash
   pr_branch_mb=$(git merge-base HEAD "origin/${pr_head_ref}" 2>/dev/null)
   git merge-base --is-ancestor $MERGE_BASE $pr_branch_mb 2>/dev/null
   ```
   If true: the current branch shares a more recent ancestor with the PR's source branch than with the target. This PR's source branch is likely our parent.

   If the PR's source branch ref is deleted (common): fall back to content comparison. The squash commit's diff against its parent should closely match the combined diff of commits between MERGE_BASE and the fork point. This is expensive, so instead record the PR as a **candidate** and let Step 4 (content walk) confirm the fork point.

3. **If a definitive match is found** (PR source branch still exists and merge-base confirms ancestry):
   - Record `FORK_POINT` = `pr_branch_mb`
   - Record `SQUASH_PARENT` = PR #N (`<pr_head_ref>`, squash-merged in `<merge_commit_sha>`)
   - Record `DETECTION_METHOD` = "GitHub PR metadata"
   - Record confidence: **HIGH**
   - Short-circuit: skip to Findings Presentation

4. **If candidates found but not definitive** (branch deleted, can't confirm via merge-base):
   - Record each candidate PR with its number, branch name, squash commit SHA, and title
   - Record `DETECTION_METHOD` = "GitHub PR metadata (candidate)"
   - Record confidence: **MEDIUM** - need Step 3/4 to confirm
   - Continue to Step 3

**If no candidates found:** Continue to Step 3.

#### Step 3: Commit-Message Match

Compare our branch's commits against the base side's commits using an identity key derived from the commit message and author metadata. This catches the upstream-rewrite scenario because a rewrite that changes SHAs (`git rebase <upstream>`, `git rebase -i`, `git commit --amend`, force-push) preserves commit messages verbatim unless the developer explicitly used `reword` or `squash`. Patch-IDs can fail when conflict resolution during upstream rebase altered patches, but messages stay identical. Comparing message+author identity between both sides directly reveals which of our commits were inherited from a pre-rewrite base.

This step strictly dominates patch-ID matching and is the primary detector for the upstream-rewrite scenario.

**Identity key:** subject + `\t` + author_email + `\t` + authored_date (as Unix timestamp). The tab separator avoids subject collisions when two commits share a subject line but have different authors or dates, and is safe because git log format placeholders never emit a literal tab in `%s`, `%ae`, or `%at`.

**Algorithm (single Bash invocation with internal shell loop):**

```bash
MERGE_BASE=$(git merge-base HEAD <BASE_BRANCH>)

# Collect identity keys on the base side (unique). Tab-separated.
git log --format='%s%x09%ae%x09%at' $MERGE_BASE..<BASE_BRANCH> | sort -u > /tmp/fixme_base_keys

# Label each of our commits INHERITED or OWN, in topological order.
git log --reverse --format='%H%x09%s%x09%ae%x09%at' $MERGE_BASE..HEAD \
  | while IFS=$'\t' read -r sha subject email authored_date; do
      key=$(printf '%s\t%s\t%s' "$subject" "$email" "$authored_date")
      if grep -Fxq "$key" /tmp/fixme_base_keys; then
        echo "INHERITED $sha $subject"
      else
        echo "OWN $sha $subject"
      fi
    done > /tmp/fixme_labels

cat /tmp/fixme_labels
```

The output is a labeled sequence showing every commit in `MERGE_BASE..HEAD` as INHERITED or OWN, preserving topological order.

**Fork-point determination:** The candidate fork point is the SHA of the LAST INHERITED commit in topological order (equivalently, the commit just before the first OWN commit in the labeled sequence).

**Partition analysis:**

- **Clean partition** - the sequence is `[INHERITED...][OWN...]` with no OWN commit preceding any INHERITED commit.
- **Interleaved** - at least one OWN commit is followed later by an INHERITED commit. Count the interleavings.

**Confidence assignment:**

- **HIGH** - clean partition AND INHERITED count >= 5. Record `FORK_POINT` = last INHERITED SHA; `DETECTION_METHOD` = "commit-message match"; `SQUASH_DETECTED` = true. Downgrade to MEDIUM if `SHALLOW_CLONE=true`.
- **MEDIUM** - mostly clean (1-2 interleavings, typically from `--reword` or `--fixup` noise during the upstream rewrite) AND INHERITED count >= 5. Candidate fork point is the SHA immediately before the FIRST commit of the trailing uninterrupted OWN run. Record the candidate and continue to Step 4.
- **No result** - INHERITED count < 5 OR severe interleaving (>= 3 interleavings). Record nothing. Proceed to Step 4.

**Short-circuit on HIGH confidence:** Skip Steps 4 and 5 entirely. Go directly to Findings Presentation.

**What Step 3 does NOT do:** it does not look at commit-message prefixes, naming conventions, ticket IDs, or any other formatting patterns. It only does exact identity matching on actual message content between both sides. Patch-ID matching is not part of the cascade - message match strictly dominates it.

#### Step 4: Content-Based Diff-Size Walk

For each commit in `MERGE_BASE..HEAD` (oldest to newest), compute the total change size of `git diff --stat <BASE_BRANCH> <commit>`. Track how this size changes across the commit sequence.

**The insight:** Inherited commits (from the squash-merged parent) produce diffs against the target that SHRINK as we walk forward in time. This is because each inherited commit brings the branch closer to the state that was squash-merged. At the fork point (where the current branch's own commits begin), the diff starts GROWING because new work is diverging from the target.

```bash
# List commits oldest to newest
git rev-list --reverse <MERGE_BASE>..HEAD
```

For each commit in that list:
```bash
# Get total lines changed (insertions + deletions)
git diff --stat <BASE_BRANCH> <commit> | tail -1
```

Parse the "N files changed, M insertions(+), K deletions(-)" line. Record total_changes = M + K for each commit.

**Finding the inflection point:**

Walk the sequence and look for the point where the diff size transitions from shrinking (or roughly stable) to growing:

1. Compute the diff sizes for all commits: `sizes[0], sizes[1], ..., sizes[N-1]`
2. For each position `i` from 1 to N-1, compute:
   - `left_trend` = average change in size for commits 0..i (is the diff shrinking?)
   - `right_trend` = average change in size for commits i..N-1 (is the diff growing?)
3. The optimal inflection point is the position `i` where `left_trend` is most negative (shrinking) and `right_trend` is most positive (growing). More precisely, maximize: `right_trend - left_trend`.
4. The commit at position `i` is the first own commit (the inflection point). The FORK_POINT is the commit at position `i-1` (the last inherited commit, i.e., the parent of the inflection). This is because `git rebase --onto <target> <FORK_POINT>` replays `FORK_POINT..HEAD`, which excludes FORK_POINT itself. Recording `i-1` ensures the first own commit at position `i` is included in the replay range.
5. **Edge case: `i == 0`.** If the inflection is at the very first commit in the range, there are no inherited commits detected by the content walk. Record `SQUASH_DETECTED` = "uncertain" and note that the walk couldn't distinguish inherited from own commits. Do not record a FORK_POINT from this step - fall through to Findings Presentation with the uncertain result.

**Validation:**
- The fork point (commit at `i-1`) should produce a significantly smaller diff against target than either the first or last commit in the range. If not, the inflection is weak and the result is uncertain.
- If PR candidates exist from Step 2, check whether the fork point aligns with the PR's squash commit (the fork point commit should be on or near the PR branch's history).

**Record results (only when `i > 0`):**
- `FORK_POINT` = the commit hash at position `i-1` (the last inherited commit, parent of the inflection point)
- `DETECTION_METHOD` = "content-based diff walk"
- Record confidence:
  - **HIGH** if the inflection is sharp (diff at fork point is <30% of diff at first commit, and subsequent commits grow steadily)
  - **MEDIUM** if the inflection exists but is gradual
  - **LOW** if the inflection is ambiguous (multiple possible fork points, or the trend isn't clear)
- If a PR candidate from Step 2 exists and aligns with the fork point: upgrade confidence by one level

**If no clear inflection is found:** Record `SQUASH_DETECTED` = "uncertain", include all collected data in findings.

#### Findings Presentation

**This is a mandatory user confirmation gate. Never proceed to rebase without explicit user approval.**

Present ALL findings from the detection steps, regardless of which step produced the definitive answer:

```
## Squash-Merged Ancestor Detection

**Detection result:** <DETECTED / UNCERTAIN / NOT DETECTED>
**Detection method:** <which step(s) produced evidence>
**Confidence:** <HIGH / MEDIUM / LOW>

### Evidence

<For each detection step that ran, show what was found:>

**Step 1 - Local Branch Check:** <result - found parent branch X / no matching branches>
**Step 2 - GitHub PR Metadata:** <result - PR #N squash-merged branch X / no matching PRs / candidates found>
**Step 3 - Heuristic Signals:** <result - actual diff is N% of cumulative (signal strength)>
**Step 4 - Content Walk:** <result - inflection at commit <hash> with diff shrinking from N to M lines, then growing to K>

### Recommended Action

**Fork point:** `<FORK_POINT>` (<short description - e.g., "where current branch diverged from feat/parent-feature">)
**Commits to replay:** N (commits from fork point to HEAD - the current branch's own work)
**Commits to skip:** M (inherited commits between MERGE_BASE and fork point)

**Rebase command:** `git rebase --onto <BASE_BRANCH> <FORK_POINT> <current-branch>`

This will:
1. Take commits from `<FORK_POINT>..HEAD` (your N own commits)
2. Replay them onto `<BASE_BRANCH>` (the target)
3. Skip the M inherited commits (already on target via squash merge)
```

**Ask the user:** "Proceed with `--onto` rebase using the detected fork point? You can also specify a different fork point if the detection is off."

**If user confirms:** Record `REBASE_MODE` = "onto", `FORK_POINT` = confirmed fork point. Proceed to Phase 3.
**If user specifies a different fork point:** Use that instead. Record `REBASE_MODE` = "onto", `FORK_POINT` = user-specified.
**If user says no / wants normal rebase:** Record `REBASE_MODE` = "normal". Proceed to Phase 3 with standard rebase flow.
**If detection result is NOT DETECTED:** Skip the confirmation entirely, proceed to Phase 3 with `REBASE_MODE` = "normal".

#### Deep Hierarchy Handling

The branch hierarchy can be deep: `master -> feat-1 -> feat-2 -> current`. If both `feat-1` and `feat-2` were squash-merged to master, the detection needs to find where the current branch's own commits begin - which is the fork point from `feat-2` (the most recent parent).

The detection steps naturally handle this:
- **Step 1** finds the closest parent branch by checking merge-base proximity
- **Step 2** finds the most recently merged PR whose branch shares history
- **Step 3** heuristic signals are the same regardless of depth
- **Step 4** content walk finds the inflection point regardless of how many ancestors were squashed - inherited commits still shrink the diff, own commits still grow it

The fork point from any detection step is the point where the CURRENT branch's own commits begin, which is correct for `--onto` regardless of hierarchy depth. We don't need to identify or enumerate intermediate ancestors.

If Step 2 finds multiple PR candidates that could be ancestors in a chain, note all of them in the findings for user context, but the recommended fork point is still the one closest to HEAD (most recent ancestor's divergence point).

### Phase 3: Pre-Rebase Summary

Present an informational summary before attempting the rebase. This is NOT a confirmation gate - proceed directly to Phase 4 after presenting.

**Format:**

```
## Rebasing onto <base-branch>

**Current branch:** <branch> at <short-hash>
**Base branch:** <base-branch> (from: PR #N / merge-base detection)
**Common ancestor:** <merge-base-short-hash> (<how far back>)
**Rebase mode:** <normal / --onto (squash-merge detected)>

### Scope
- **Our commits:** N commits to rebase
  <list of commit onelines>
- **Their commits:** M new commits on <base-branch> since divergence
  <list of commit onelines>

<If REBASE_MODE is "onto":>
### Squash-Merge Adjustment
- **Fork point:** <FORK_POINT short hash> (detected via: <DETECTION_METHOD>)
- **Commits to replay:** N (own commits from fork point to HEAD)
- **Commits to skip:** M (inherited from squash-merged parent)
- **Command:** git rebase --onto <BASE_BRANCH> <FORK_POINT> <current-branch>

### Flags
- [ ] Branch has been pushed - force-push will be required after rebase
- [ ] Merge commits detected - will use --rebase-merges
- [ ] fixup!/squash! commits detected - will use --autosquash
- [ ] N cherry-picked commits will be dropped (already on base)
- [ ] Uncommitted changes were stashed
- [ ] Squash-merged ancestor detected - using --onto rebase mode

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

Build the rebase command based on Phase 2 analysis and squash-merge detection:

**Normal mode** (`REBASE_MODE` = "normal"):
```bash
git rebase \
  $(test -n "$HAS_MERGE_COMMITS" && echo "--rebase-merges") \
  $(test -n "$HAS_FIXUP_COMMITS" && echo "--autosquash") \
  <BASE_BRANCH>
```

**Onto mode** (`REBASE_MODE` = "onto"):
```bash
git rebase --onto <BASE_BRANCH> <FORK_POINT> \
  $(test -n "$HAS_MERGE_COMMITS" && echo "--rebase-merges") \
  $(test -n "$HAS_FIXUP_COMMITS" && echo "--autosquash")
```

The `--onto` form replays only commits from `FORK_POINT..HEAD` onto `BASE_BRANCH`, skipping inherited commits that are already on the target via squash merge. The `FORK_POINT` was confirmed by the user in Phase 2.5.

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

   f. **Record conflict details for the final report.** For every conflict resolved (whether by you or by the user), record all of the following. This data feeds Phase 8's Conflict Resolution Report and must not be summarized or discarded:

   - **File and location** - exact file path (absolute) and the function/class/block where the conflict occurred, with line numbers.
   - **Code-path context** - what this area of code is responsible for. What feature, flow, or subsystem does it belong to? A reader with no codebase knowledge must understand the domain before reading the conflict details.
   - **Our branch's intent** - what we were trying to accomplish with our change, citing specific commits.
   - **Base branch's intent** - what the base branch changed and why, citing specific commits.
   - **Nature of the overlap** - why these changes conflicted. Were they editing the same lines, restructuring the same function, renaming the same symbol, changing the same config, etc.?
   - **Resolution chosen** - exactly what the resolved code now does. Which parts came from which branch, what was adapted, what was dropped.
   - **Rationale** - why this resolution is correct. What makes it faithful to both intents, or why one intent takes precedence.
   - **Ripple-risk assessment** - are there OTHER call sites, importers, tests, configs, or consumers of the code touched by this conflict that may need updating as a consequence of the resolution? Search concretely for references (grep for function names, imports, usages). List every affected location with file path and line number. If you checked and found none, say so explicitly with what you searched for. This is the most critical part - silent breakage at distant call sites is the #1 risk of conflict resolution.

   g. After resolving, stage the file:
   ```bash
   git add <file>
   ```

   h. Continue rebase:
   ```bash
   git rebase --continue
   ```

   i. Repeat for each conflicted commit until rebase completes.

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
   - Full conflict resolution details as recorded in Phase 6 step f (all fields, unabridged)
   - Ripple-risk assessment per conflict with concrete file/line references
   - Overall confidence rating and remaining risks
   - Verification baseline vs post-rebase comparison
   - Any regressions found and how they were resolved

### Phase 8: Summary & Push Offer

Present the complete summary. **All file references in the report MUST be clickable markdown links with absolute file paths and line numbers**, e.g. `[config.ts:42-58](/absolute/path/to/config.ts#L42-L58)`. This applies to every file mentioned anywhere in the report - conflict locations, ripple-risk references, verification failures, everything.

#### Part 1: Overview

```
## Rebase Complete

**Branch:** <branch>
**Rebased onto:** <base-branch>
**Rebase mode:** <normal / --onto (squash-merged ancestor: <SQUASH_PARENT>)>
**Commits rebased:** N (M conflicts resolved, K cherry-picked commits dropped)
<If onto mode:>
**Inherited commits skipped:** M (from squash-merged parent, already on target)
**Fork point:** <FORK_POINT> (detected via: <DETECTION_METHOD>)
```

#### Part 2: Conflict Resolution Report

If there were no conflicts, state "No conflicts encountered" and skip to Part 3.

If conflicts were resolved, present the full report using the data collected in Phase 6 step f. This is the most important section of the summary - the reader needs to evaluate whether the rebase was done correctly and whether any gaps remain.

##### Presentation Rules (NON-NEGOTIABLE)

These rules govern how every word in the conflict report is written. The reader is a developer who works on this codebase but cannot hold it all in their head at once. They are reading this report to decide whether the rebase was done correctly. Every conflict entry must be independently comprehensible without referring to any other part of the report or the codebase.

**1. Establish context before referencing anything.**
Every conflict entry starts by explaining WHERE we are in the codebase and WHAT this code does, in plain language. The reader must build a mental model of the domain before encountering any specifics about the conflict.

- BAD: "Conflict in `handleThreshold` - our branch changed the comparison operator."
  (What is a threshold? What does this function do? What is it part of? Comparison of what?)
- GOOD: "This file implements the usage alerting system. When a customer's API usage approaches their plan limit, `handleThreshold` checks the current usage percentage against configured warning levels (80%, 90%, 100%) and triggers email notifications. The conflict is in the comparison logic that decides which alert tier to fire."

**2. Never reference code symbols without explaining what they represent.**
Every variable, function, class, config key, or technical term must be introduced with what it IS and what it DOES before it's used in the explanation. Assume the reader last looked at this file weeks ago.

- BAD: "Base branch renamed `svc` to `configService` and changed the return type."
  (What is svc? What service? What does it return? Why does the return type matter?)
- GOOD: "The base branch renamed the `svc` variable (which holds the singleton instance of the configuration service - the central registry for feature flags, plan limits, and rate-limit settings) to `configService`, and changed its `getLimit()` method to return a `Result<Limit>` instead of a raw `Limit` value. This means every caller now needs to unwrap the result and handle the error case."

**3. Explain intent as user-visible behavior, not code mechanics.**
When describing what each branch was trying to do, frame it in terms of what changes for the user or the system, not what lines of code were edited.

- BAD: "Our branch added a new parameter to the constructor and updated the call in line 45."
  (What does the parameter do? Why was it added? What behavior does it enable?)
- GOOD: "Our branch added support for custom alert thresholds per customer (previously all customers used the same 80/90/100% levels). This required passing the customer's configured thresholds into the alerting constructor, so each customer's alerts fire at their chosen percentages."

**4. Make resolutions self-evident, not assertive.**
Don't just state "took ours" or "merged both." Describe the resulting behavior so the reader can independently judge whether it's correct.

- BAD: "Resolution: merged both changes, keeping our validation with their new service name."
  (What does the code actually do now? Can I tell if this is correct?)
- GOOD: "The resolved code now: (1) uses the renamed `configService` from the base branch, (2) unwraps the new `Result<Limit>` return type with an error log on failure, and (3) passes customer-specific thresholds from our branch into the comparison. The net effect: custom thresholds work correctly on top of the refactored config service. If `getLimit()` fails, the alert is skipped for that cycle and a warning is logged with the customer ID."

**5. Ground ripple-risk in behavior, not just locations.**
When listing other files that might be affected, explain WHY they might need changes - what assumption they make that might now be violated.

- BAD: "Ripple risk: `billing.ts:120` also calls `getLimit()`."
  (So what? Does it need to change? Why or why not?)
- GOOD: "Ripple risk: [`billing.ts:120`](/abs/path/billing.ts#L120) also calls `configService.getLimit()` - this call was added by the base branch and already handles the `Result<Limit>` unwrapping, so no change needed. Verified by reading the call site."

**6. One idea per paragraph. No compound explanations.**
Each point should convey exactly one thing. If a sentence has "and also" or "additionally" or packs two concepts, split it.

**7. No hedging without specifics.**
Don't write "there might be implications" or "this could affect other areas." Either you checked and found specific impacts (list them), or you checked and found nothing (say what you searched for and that it came back clean). Vague warnings are noise.

##### Report Structure

Top-down, abstract to concrete. Start with the big picture, then drill into each conflict.

```
### Conflict Resolution Report

**N conflicts across M files.** <One-sentence overall characterization: were these
mostly mechanical (renames, imports) or substantive (logic changes, API changes)?>

---

#### Conflict 1: <short descriptive title that describes the domain, not the git mechanics>

**Where:** [<file>:<lines>](<absolute-path>#L<start>-L<end>) - `<function/class/block name>`

**What this code does:** <Establish the domain. What feature or system does this
file/function belong to? What is its job? What would break if it disappeared?
Write this for someone who hasn't opened this file in weeks. Define every
concept and symbol before using it in subsequent sections. This is the
foundation - everything below builds on the mental model created here.>

**Our branch** (`<branch-name>`, <commit-hash>):
<What user-visible behavior or system behavior we were adding/fixing/modifying.
Frame as intent and outcome, not as "changed line X.">

**Base branch** (`<base-branch>`, <commit-hash>):
<Same - what they were trying to accomplish, framed as behavior, not line edits.
If they refactored/renamed things, explain WHY (was it a broader migration?
a prerequisite for another feature?) so the reader understands the motivation.>

**Why it conflicted:** <Concrete, specific explanation. Don't just say "both
edited the same lines" - say what each side was doing to those lines and
why the two changes are incompatible.>

**Resolution - what the code does now:** <Describe the RESULTING behavior, not
the merge mechanics. The reader should be able to judge correctness from this
description alone, without looking at the code. Be specific: what happens on
success, what happens on failure, what inputs produce what outputs.>

**Why this resolution is correct:** <Connect back to both branches' intents.
Explain how the resolution preserves what both sides were trying to achieve,
or why one side's intent takes precedence. If this was a judgment call,
say so explicitly and explain the reasoning.>

**Impact on the rest of the codebase:**
<For each symbol, API, type, config key, or behavior that changed in this
conflict, report what you found when searching for other consumers:>
- [<file>:<line>](<absolute-path>#L<line>) - `<symbol>` uses `<thing that changed>`:
  <needs update / verified OK / already updated> - <why: what does this call site
  do with the result, and is it still correct?>
- ...
<If nothing found: "Searched for callers of `X` and importers of `Y` -
no other consumers found outside this file.">

---
```

Repeat for each conflict. After all individual conflicts:

```
### Overall Assessment

**Confidence:** <HIGH / MEDIUM / LOW> - <one-sentence justification grounded in
what was found, not a vague feeling>

**Items requiring attention:**
<Only list items where the reader may need to act or verify something.
For each item, explain what it is and why it matters - no bare file references.>
- <Description of what might be wrong, where, and what to check>
- ...

<If confidence is HIGH and nothing requires attention: "All conflicts were
mechanical or had unambiguous intent on both sides. Verification passed.
No manual review needed.">

<If confidence is MEDIUM or LOW: Explain specifically what makes you
uncertain and what the reader should check to gain confidence.>
```

#### Part 3: Verification

```
### Verification
- Build: PASS / FAIL (was: PASS / FAIL)
- Lint: PASS / FAIL (was: PASS / FAIL)
- Tests: PASS (N passing) / FAIL (was: PASS / FAIL)
<If pre-existing failures: "N pre-existing test failures unchanged">
<If regressions were found and fixed: list each regression and its fix>
```

#### Part 4: History

```
### Before / After
<git log --oneline --graph -10, showing the new linear history>
```

#### Part 5: Push Offer

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
**This check is performed in Phase 1 step 6, AFTER freshening the base branch in step 5.** Never evaluate this before the base branch has been freshened - a stale local ref makes this check meaningless.

If `git merge-base HEAD <BASE_BRANCH>` equals `<BASE_BRANCH>` HEAD:
"Branch is already up-to-date with `<base-branch>`. No rebase needed."
Stop.

### Empty rebase (all commits cherry-picked)
If all our commits are marked `=` in cherry-mark output:
"All commits on this branch are already present on `<base-branch>` (cherry-picked or equivalent). Rebase would result in an empty branch. No action taken."
Stop.

### Shallow clone

Shallow clone detection and user prompting happens in **Phase 0 Step 6**. If the user chooses degraded mode there, the `SHALLOW_CLONE=true` flag is honored inline at each downstream step: Phase 1 Step 5a ancestry check aborts auto-reset on missing commits, Phase 2.5 Step 5 content walk is skipped entirely, and any Phase 2.5 verdict has its confidence downgraded by one level. The Findings Presentation includes a "Detection ran on a shallow clone. Content walk was skipped. Accuracy reduced." warning.

A shallow clone is a partial copy of the repository that only includes recent commit history (created with `git clone --depth N`). The merge-base - the common ancestor commit where the current branch diverged from the base branch - may lie beyond the shallow boundary. Without the merge-base, git cannot determine which commits belong to the branch vs the base, and the rebase will fail. The fix offered in Phase 0 is `git fetch --unshallow origin`.

### Squash-merged ancestor with no evidence

If Phase 2.5 detects `SQUASH_DETECTED` = "uncertain" or "not detected", but the user suspects a squash-merge scenario based on the volume of conflicts encountered during Phase 6:

1. Abort the rebase: `git rebase --abort`
2. Tell the user: "The high conflict count may indicate a squash-merged ancestor that wasn't detected. You can re-run with a manually specified fork point."
3. Help the user identify the fork point interactively:
   - Ask what the parent branch was called
   - Search `git log --oneline --all` for the branch name
   - If found, use that commit as the fork point
   - If not found, offer to run the content-based diff walk (Phase 2.5 Step 4) with relaxed thresholds
4. Re-run with `REBASE_MODE` = "onto" and the user-specified fork point

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
