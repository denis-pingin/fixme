# Agent Dispatch Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Agent-tool dispatch across fixme orchestrators emit a one-line visibility banner showing the resolved model and profile, by centralising resolution in a new `resolve-model` CLI command.

**Architecture:** Add a pure, side-effect-free `resolve-model` subcommand to `fixme-tools.cjs` that reads `.fixme/config.json` and returns `{agent, model, profile, source}` JSON. Update orchestrator SKILL.md files (fixme-task, fixme-session) so every Agent dispatch first calls `resolve-model`, then prints a standardised banner, then passes the resolved model to the Agent tool. Orchestrators can't dispatch without first asking the tool for a model, so the banner becomes a natural side effect of the dispatch flow.

**Tech Stack:** Node.js (CommonJS), Markdown skill files. No new dependencies.

---

## File Structure

**Modify:**
- `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs` - add `resolve-model` command and profile table
- `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs` - add tests for the new command
- `.claude/skills/fixme-task/SKILL.md` - replace ad-hoc Model Resolution section with CLI-call + banner flow
- `.claude/skills/fixme-session/SKILL.md` - add CLI-call + banner before each of its two Agent dispatches (fixme-investigate, fixme-task)

**No changes needed:**
- `install.sh` - already copies `fixme-tickets-md/scripts/` contents
- Agent definition files in `.claude/agents/` - they don't specify model; orchestrator passes it per-dispatch
- Other orchestrators (fixme-pr-comments dispatches fixme-task via `Skill` tool, not Agent; fixme-rebase doesn't dispatch agents)

---

## Task 1: Add profile table and resolve-model implementation to fixme-tools.cjs

**Files:**
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs` - add `MODEL_PROFILES`, `resolveModel()`, router case
- Test: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs` - append new tests

- [ ] **Step 1: Write the failing tests**

Append to `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs` (just before the summary / exit block at the bottom of the file - look for the line that prints `Passed: ${passed}` and insert before it):

```javascript
// ============================================================================
// resolve-model tests
// ============================================================================

test('resolve-model: no config returns opus/quality/default', () => {
  const dir = createTmpDir();
  const res = runInDir('resolve-model fixme-write-plan', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.agent === 'fixme-write-plan', `agent: ${res.data.agent}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.profile === 'quality', `profile: ${res.data.profile}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: empty models object returns quality defaults', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({ models: {} }));
  const res = runInDir('resolve-model fixme-execute-plan', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.profile === 'quality', `profile: ${res.data.profile}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: balanced profile returns per-agent mapping', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'balanced' }
  }));
  const executor = runInDir('resolve-model fixme-execute-plan', dir);
  assert(executor.ok, `exit: ${JSON.stringify(executor)}`);
  assert(executor.data.model === 'sonnet', `executor model: ${executor.data.model}`);
  assert(executor.data.profile === 'balanced', `executor profile: ${executor.data.profile}`);
  assert(executor.data.source === 'profile', `executor source: ${executor.data.source}`);

  const planner = runInDir('resolve-model fixme-write-plan', dir);
  assert(planner.ok, `exit: ${JSON.stringify(planner)}`);
  assert(planner.data.model === 'opus', `planner model: ${planner.data.model}`);
  assert(planner.data.profile === 'balanced', `planner profile: ${planner.data.profile}`);
});

test('resolve-model: budget profile', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'budget' }
  }));
  const verify = runInDir('resolve-model fixme-browser-verify', dir);
  assert(verify.ok, `exit: ${JSON.stringify(verify)}`);
  assert(verify.data.model === 'haiku', `verify model: ${verify.data.model}`);
  assert(verify.data.profile === 'budget', `verify profile: ${verify.data.profile}`);
});

test('resolve-model: override beats profile', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: {
      profile: 'budget',
      overrides: { 'fixme-execute-plan': 'opus' }
    }
  }));
  const res = runInDir('resolve-model fixme-execute-plan', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.profile === 'budget', `profile: ${res.data.profile}`);
  assert(res.data.source === 'override', `source: ${res.data.source}`);
});

test('resolve-model: unknown profile falls back to quality', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'bogus' }
  }));
  const res = runInDir('resolve-model fixme-write-plan', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.profile === 'quality', `profile: ${res.data.profile}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: unknown agent falls back to opus/default', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'budget' }
  }));
  const res = runInDir('resolve-model fixme-nonexistent', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.agent === 'fixme-nonexistent', `agent: ${res.data.agent}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.profile === 'budget', `profile: ${res.data.profile}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: missing agent arg errors', () => {
  const dir = createTmpDir();
  const res = runInDir('resolve-model', dir);
  assert(!res.ok, 'expected non-zero exit');
  assert(res.data && res.data.error, `expected error field: ${JSON.stringify(res)}`);
});

test('resolve-model: malformed config falls back gracefully', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), 'not valid json {{{');
  const res = runInDir('resolve-model fixme-write-plan', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
node /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -40
```

Expected: All 9 new tests FAIL with `Unknown command: 'resolve-model'` or similar.

- [ ] **Step 3: Add the profile table constant**

In `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs`, find the section header `// YAML Frontmatter Parser/Serializer` (around line 8). Insert ABOVE that header (i.e., after the `require` statements near line 6):

```javascript
// ============================================================================
// Model Profile Table
// ============================================================================

const MODEL_PROFILES = {
  quality: {
    'fixme-write-plan': 'opus',
    'fixme-review-plan': 'opus',
    'fixme-review-code': 'opus',
    'fixme-investigate': 'opus',
    'fixme-research': 'opus',
    'fixme-handle-plan-review': 'opus',
    'fixme-handle-code-review': 'opus',
    'fixme-execute-plan': 'opus',
    'fixme-task': 'opus',
    'fixme-browser-verify': 'opus',
  },
  balanced: {
    'fixme-write-plan': 'opus',
    'fixme-review-plan': 'opus',
    'fixme-review-code': 'opus',
    'fixme-investigate': 'opus',
    'fixme-research': 'opus',
    'fixme-handle-plan-review': 'opus',
    'fixme-handle-code-review': 'opus',
    'fixme-execute-plan': 'sonnet',
    'fixme-task': 'sonnet',
    'fixme-browser-verify': 'sonnet',
  },
  budget: {
    'fixme-write-plan': 'sonnet',
    'fixme-review-plan': 'sonnet',
    'fixme-review-code': 'sonnet',
    'fixme-investigate': 'sonnet',
    'fixme-research': 'sonnet',
    'fixme-handle-plan-review': 'sonnet',
    'fixme-handle-code-review': 'sonnet',
    'fixme-execute-plan': 'sonnet',
    'fixme-task': 'haiku',
    'fixme-browser-verify': 'haiku',
  },
};

const DEFAULT_MODEL = 'opus';
const DEFAULT_PROFILE = 'quality';

/**
 * Resolve the model for a sub-agent based on config.
 * Resolution order:
 *   1. models.overrides[agent] (source = 'override')
 *   2. MODEL_PROFILES[models.profile][agent] (source = 'profile')
 *   3. Default: opus (source = 'default')
 * Profile is reported as-is from config even when the agent isn't in the table
 * (so the user's selection stays visible in the banner).
 */
function resolveModel(agentName, fixmeRoot) {
  const result = { agent: agentName, model: DEFAULT_MODEL, profile: DEFAULT_PROFILE, source: 'default' };

  const configPath = path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return result;
  }

  const models = (config && typeof config.models === 'object') ? config.models : null;
  if (!models) return result;

  const rawProfile = typeof models.profile === 'string' ? models.profile : null;
  const profileKnown = rawProfile && Object.prototype.hasOwnProperty.call(MODEL_PROFILES, rawProfile);
  result.profile = rawProfile || DEFAULT_PROFILE;

  const overrides = (models.overrides && typeof models.overrides === 'object') ? models.overrides : {};
  if (Object.prototype.hasOwnProperty.call(overrides, agentName) && typeof overrides[agentName] === 'string') {
    result.model = overrides[agentName];
    result.source = 'override';
    return result;
  }

  if (profileKnown) {
    const table = MODEL_PROFILES[rawProfile];
    if (Object.prototype.hasOwnProperty.call(table, agentName)) {
      result.model = table[agentName];
      result.source = 'profile';
      return result;
    }
  } else {
    // Unknown profile: keep DEFAULT_PROFILE for reporting
    result.profile = DEFAULT_PROFILE;
  }

  return result;
}
```

- [ ] **Step 4: Wire the router case**

Still in `fixme-tools.cjs`, find the `main()` function's switch statement. After the `case 'root':` block (around line 1545) and BEFORE the `default:` case, insert:

```javascript
      case 'resolve-model': {
        const agentName = args[0];
        if (!agentName) {
          return error('Usage: fixme-tools.cjs resolve-model <agent-name>');
        }
        return output(resolveModel(agentName, fixmeRoot));
      }
```

Then update the `default:` case error message in the same switch (around line 1549) from `'Valid: ticket, session, context, root'` to `'Valid: ticket, session, context, root, resolve-model'`.

- [ ] **Step 5: Export resolveModel for unit testing**

At the bottom of `fixme-tools.cjs`, find the existing `module.exports = { buildTransitionsFromPhases, parseFrontmatter, findFixmeRoot };` line (around line 1562) and replace with:

```javascript
module.exports = { buildTransitionsFromPhases, parseFrontmatter, findFixmeRoot, resolveModel, MODEL_PROFILES };
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
node /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -40
```

Expected: All 9 new `resolve-model` tests PASS. All pre-existing tests continue to PASS.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
git commit -m "feat: add resolve-model command to fixme-tools.cjs"
```

---

## Task 2: Replace ad-hoc Model Resolution with CLI-call + dispatch banner in fixme-task

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md:264-338` - rewrite the "Sub-Skill Dispatch" section's model handling

- [ ] **Step 1: Open the file and locate the section**

Open `.claude/skills/fixme-task/SKILL.md`. Find two regions that need editing:
1. The dispatch contract block around line 274-293 that currently says `Resolve the model for each agent from <fixme-dir>/config.json (see Model Resolution below). Default: opus for all agents.` and shows the `Agent(subagent_type=..., model="{resolved-model}", prompt=...)` example.
2. The `### Model Resolution` subsection around line 301-338 that documents resolution order, the profile table, and the config example.

- [ ] **Step 2: Rewrite the dispatch contract block**

Replace the paragraph starting `Resolve the model for each agent from <fixme-dir>/config.json` (line 274) and the code example that follows (through line 295, ending with `The agent's role and operational procedures are already loaded by its agent definition. The dispatch prompt only contains task-specific inputs.`) with:

```markdown
**Before every Agent dispatch, resolve the model via the CLI and print a visibility banner.**

Step 1 - Resolve:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model <agent-name>
```

This returns JSON like `{"agent":"fixme-write-plan","model":"opus","profile":"quality","source":"profile"}`. The command reads `<fixme-dir>/config.json` (or returns defaults if none exists). You MUST call it before each dispatch - do not hardcode models or skip the call.

Step 2 - Print the banner (one line, before the Agent tool call):

```
→ dispatching fixme-write-plan (model: opus, profile: quality, source: profile)
```

The banner is non-negotiable visibility for the user. If you dispatch without it, you are hiding state the user needs to audit model selection.

Step 3 - Dispatch. The prompt structure for every sub-skill:

```
Agent(
  subagent_type="{skill-name}",
  model="{resolved-model}",
  prompt="
    <task>
    [operation description with specific inputs]
    </task>

    <project>
    Project root: [path]
    Fixme dir: [fixme_dir from root resolution]
    </project>
  "
)
```

The agent's role and operational procedures are already loaded by its agent definition. The dispatch prompt only contains task-specific inputs.
```

- [ ] **Step 3: Replace the Model Resolution subsection with a thin reference**

Replace the entire `### Model Resolution` subsection (from the `### Model Resolution` heading through the end of the `Valid model values: opus, sonnet, haiku, inherit.` line) with:

```markdown
### Model Resolution

Model resolution is performed by `fixme-tools.cjs resolve-model` (see the dispatch contract above). The CLI is the authoritative source for the profile table and the `override > profile > default` order. When `models.profile` is not set or `models` is missing from config, the CLI returns `opus` with `profile: quality` and `source: default`.

Profile quick reference (authoritative table lives in `fixme-tools.cjs`):

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| fixme-write-plan | opus | opus | sonnet |
| fixme-review-plan | opus | opus | sonnet |
| fixme-review-code | opus | opus | sonnet |
| fixme-investigate | opus | opus | sonnet |
| fixme-research | opus | opus | sonnet |
| fixme-handle-plan-review | opus | opus | sonnet |
| fixme-handle-code-review | opus | opus | sonnet |
| fixme-execute-plan | opus | sonnet | sonnet |
| fixme-task | opus | sonnet | haiku |
| fixme-browser-verify | opus | sonnet | haiku |

Config example:

```json
{
  "models": {
    "profile": "balanced",
    "overrides": {
      "fixme-execute-plan": "opus"
    }
  }
}
```

Valid model values: `opus`, `sonnet`, `haiku`, `inherit`. The CLI does not validate the model string - it returns whatever is configured so malformed values surface at Agent dispatch time rather than being silently dropped.
```

- [ ] **Step 4: Verify the file still parses as sensible markdown**

Run:
```bash
head -340 /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-task/SKILL.md | tail -80
```

Expected: The new dispatch-contract block flows cleanly before "Tool restrictions", and the rewritten Model Resolution subsection sits cleanly before "Ticket transition dispatch". No stray old paragraphs, no duplicated headings.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "feat: make fixme-task dispatch model via resolve-model CLI and print banner"
```

---

## Task 3: Add CLI-call + banner to the two Agent dispatches in fixme-session

**Files:**
- Modify: `.claude/skills/fixme-session/SKILL.md` at two dispatch sites: the fixme-investigate block (around line 214-223) and the fixme-task block (around line 240-259)

- [ ] **Step 1: Update the fixme-investigate dispatch block**

In `.claude/skills/fixme-session/SKILL.md`, find the block that starts with `Task tool dispatch (subagent_type: "fixme-investigate"):` (around line 215). Replace everything from that line through the closing triple-backtick of that code block (through the line that says `</task>` followed by ```` ``` ````) with:

```markdown
   **Resolve model and print visibility banner before dispatch:**

   ```bash
   node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model fixme-investigate
   ```

   Print a one-line banner to the user (before calling the Agent tool):

   ```
   → dispatching fixme-investigate (model: {model}, profile: {profile}, source: {source})
   ```

   Then dispatch:

   ```
   Agent(
     subagent_type: "fixme-investigate",
     model: "{resolved-model}",
     prompt: |
       <task>
       Investigate this bug:
       - Task description: <title and description from ticket>
       - Dev server URL: <devServer.url from project config>
       - Output directory: <ticket-folder>/research/
       </task>
   )
   ```
```

- [ ] **Step 2: Update the fixme-task dispatch block**

Still in `fixme-session/SKILL.md`, find the block starting with `Task tool dispatch:` followed by `description: "Execute pipeline for ticket #NNNN"` (around line 240). Replace everything from that `Task tool dispatch:` line through the closing triple-backtick of that code block (the block ends after the closing `</task>` line) with:

```markdown
   **Resolve model and print visibility banner before dispatch:**

   ```bash
   node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model fixme-task
   ```

   Print a one-line banner to the user:

   ```
   → dispatching fixme-task in background (model: {model}, profile: {profile}, source: {source})
   ```

   Then dispatch:

   ```
   Agent(
     description: "Execute pipeline for ticket #NNNN",
     run_in_background: true,
     subagent_type: "fixme-task",
     model: "{resolved-model}",
     prompt: |
       <task>
       Execute this task:
       - Task: <task description from ticket title + investigation findings summary>
       - Pipeline: <pipeline name from step 4>
       - Ticket: <ticket-folder>/ticket.md
       - Config: .fixme/config.json

       When complete, write a summary to <ticket-folder>/task-result.md with:
       - status: "completed" or "failed"
       - files_changed: [list of files]
       - summary: <one-line description of what was done>
       - failure_reason: <if failed, why>
       </task>
   )
   ```
```

- [ ] **Step 3: Verify both sites read cleanly**

Run:
```bash
sed -n '200,280p' /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-session/SKILL.md
```

Expected: Both dispatch blocks now include a `resolve-model` CLI call, a banner line, and an Agent tool call. The surrounding narrative ("After dispatching fixme-task in background...", "After the investigation agent returns...") is preserved.

Note: the `general-purpose` intake-agent dispatch at line 381 is intentionally NOT updated - it runs a stock Claude sub-agent, not a fixme skill, so there is no configurable model to resolve.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-session/SKILL.md
git commit -m "feat: resolve and announce dispatch model in fixme-session"
```

---

## Task 4: Smoke-test the end-to-end flow and install

**Files:** none modified

- [ ] **Step 1: Install updated skills and CLI**

Run:
```bash
cd /Users/denis/projects/denis/ai/fixme && ./install.sh 2>&1 | tail -30
```

Expected: Each `fixme*` skill and each `fixme-*.md` agent prints `Installed ...`. No errors.

- [ ] **Step 2: Smoke-test resolve-model from the installed path**

Run (from any directory):
```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model fixme-write-plan
```

Expected: JSON output like `{"agent":"fixme-write-plan","model":"opus","profile":"quality","source":"default"}` (exact `source` depends on whether current dir is inside a fixme project with config; outside, it's `default`).

- [ ] **Step 3: Smoke-test with a config**

Run:
```bash
TMPD=$(mktemp -d) && mkdir -p "$TMPD/.fixme" && echo '{"models":{"profile":"balanced"}}' > "$TMPD/.fixme/config.json" && cd "$TMPD" && node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs resolve-model fixme-execute-plan
```

Expected: `{"agent":"fixme-execute-plan","model":"sonnet","profile":"balanced","source":"profile"}`.

Clean up:
```bash
rm -rf "$TMPD"
```

- [ ] **Step 4: Run the full test suite one more time from the source tree**

Run:
```bash
node /Users/denis/projects/denis/ai/fixme/.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -10
```

Expected: `Passed: N` where N equals the original count plus 9 new tests, `Failed: 0`.

- [ ] **Step 5: Commit (only if Task 4 produced any fixup edits; otherwise skip)**

If the smoke tests revealed bugs you fixed inline, commit them. Otherwise this step is a no-op.

---

## Self-Review Notes

- **Spec coverage:** The user asked for reliable printing of agent properties when dispatching. Task 1 builds the resolver, Task 2 wires the main orchestrator (fixme-task) through it with a banner, Task 3 wires the only other Agent-using dispatcher (fixme-session). `fixme-pr-comments` dispatches via `Skill`, not `Agent`, and therefore doesn't select a model - correctly left alone.
- **Placeholders:** None. Every step has exact paths, code, and expected output.
- **Type consistency:** `resolveModel()` returns `{agent, model, profile, source}` everywhere. Banner format is identical across fixme-task and fixme-session. Profile keys (`quality`, `balanced`, `budget`) match between CLI, SKILL.md table, and tests.
