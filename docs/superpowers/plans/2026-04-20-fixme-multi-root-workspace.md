# Fixme Multi-Root Workspace Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support placing `.fixme/` in a parent directory (workspace root) while preserving the original per-project location, so multi-root VSCode workspaces can share a single `.fixme/` directory across sub-repos.

**Architecture:** Add `findFixmeRoot(startDir)` to `fixme-tools.cjs` that walks up the directory tree looking for a parent `.fixme/` directory (similar to GSD's `findProjectRoot()`). Resolution priority: local `.fixme/` first, then parent `.fixme/` with git-repo heuristic. A new `root` CLI subcommand exposes the resolved path. All existing CLI commands auto-resolve. Skills receive the resolved path via dispatch prompts or resolve it themselves.

**Tech Stack:** Node.js (fixme-tools.cjs), Markdown (SKILL.md files)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs` | Add `findFixmeRoot()`, `root` command, wire into existing commands |
| Modify | `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs` | Tests for root resolution |
| Modify | `.claude/skills/fixme-task/SKILL.md` | Resolve fixme root, pass in dispatch prompts |
| Modify | `.claude/skills/fixme-session/SKILL.md` | Resolve fixme root for session paths |
| Modify | `.claude/skills/fixme-config/SKILL.md` | Resolve fixme root for config paths |
| Modify | `.claude/skills/fixme-tickets/SKILL.md` | Resolve fixme root for backend routing |
| Modify | `.claude/skills/fixme-tickets-md/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-write-plan/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-execute-plan/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-review-plan/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-review-code/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-handle-plan-review/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-handle-code-review/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-investigate/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-research/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-browser-verify/SKILL.md` | Accept fixme dir from dispatch |
| Modify | `.claude/skills/fixme-ticket/SKILL.md` | Resolve fixme root standalone |
| Modify | `.claude/skills/fixme-rebase/SKILL.md` | Resolve fixme root standalone |

---

### Task 1: Add `findFixmeRoot()` function with unit tests

**Files:**
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs`
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs`

- [ ] **Step 1: Write failing tests for `findFixmeRoot()`**

Add the following test suite at the end of the test file (before `cleanup()`). The tests import `findFixmeRoot` from the module exports.

```javascript
// ============================================================================
// Test Suite: findFixmeRoot resolution
// ============================================================================

console.log('\n=== findFixmeRoot resolution ===\n');

test('findFixmeRoot: returns startDir when .fixme/ exists locally', () => {
  const root = createTmpDir();
  fs.mkdirSync(path.join(root, '.fixme'), { recursive: true });
  const result = findFixmeRoot(root);
  assert(result === root, `Should return startDir when .fixme/ exists locally, got ${result}`);
});

test('findFixmeRoot: walks up to parent with .fixme/ when sub-dir has .git', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  const subRepo = path.join(workspace, 'app');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });
  const result = findFixmeRoot(subRepo);
  assert(result === workspace, `Should return parent workspace, got ${result}`);
});

test('findFixmeRoot: respects sub_repos config', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    sub_repos: ['frontend', 'backend']
  }));
  const subRepo = path.join(workspace, 'frontend');
  fs.mkdirSync(subRepo, { recursive: true });
  // No .git needed when sub_repos matches
  const result = findFixmeRoot(subRepo);
  assert(result === workspace, `Should return parent via sub_repos match, got ${result}`);
});

test('findFixmeRoot: ignores parent .fixme/ when sub_repos does not match', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    sub_repos: ['frontend', 'backend']
  }));
  const unrelated = path.join(workspace, 'scripts');
  fs.mkdirSync(unrelated, { recursive: true });
  // No .git and not in sub_repos
  const result = findFixmeRoot(unrelated);
  assert(result === unrelated, `Should NOT match unrelated dir, got ${result}`);
});

test('findFixmeRoot: prefers local .fixme/ over parent .fixme/', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  const subRepo = path.join(workspace, 'app');
  fs.mkdirSync(path.join(subRepo, '.fixme'), { recursive: true });
  const result = findFixmeRoot(subRepo);
  assert(result === subRepo, `Should prefer local .fixme/, got ${result}`);
});

test('findFixmeRoot: falls back to startDir when no .fixme/ found', () => {
  const isolated = createTmpDir();
  const result = findFixmeRoot(isolated);
  assert(result === isolated, `Should fall back to startDir, got ${result}`);
});

test('findFixmeRoot: works with nested sub-dirs (walks up through multiple levels)', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  const deepPath = path.join(workspace, 'app', 'src', 'modules');
  fs.mkdirSync(deepPath, { recursive: true });
  // Put .git in the app dir (sub-repo root)
  fs.mkdirSync(path.join(workspace, 'app', '.git'), { recursive: true });
  const result = findFixmeRoot(deepPath);
  assert(result === workspace, `Should walk up through nested dirs, got ${result}`);
});

test('findFixmeRoot: parent .fixme/ without config.json uses git heuristic', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  // No config.json in .fixme/
  const subRepo = path.join(workspace, 'api');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });
  const result = findFixmeRoot(subRepo);
  assert(result === workspace, `Should use git heuristic when no config.json, got ${result}`);
});

test('findFixmeRoot: parent .fixme/ without config.json AND no .git falls back', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  // No config.json, no .git anywhere
  const subDir = path.join(workspace, 'scripts');
  fs.mkdirSync(subDir, { recursive: true });
  const result = findFixmeRoot(subDir);
  assert(result === subDir, `Should fall back when no .git and no sub_repos match, got ${result}`);
});
```

Update the import line at the top of the test file to include `findFixmeRoot`:

```javascript
const { buildTransitionsFromPhases, parseFrontmatter, findFixmeRoot } = require(TOOLS_PATH);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30`

Expected: Multiple FAIL lines for `findFixmeRoot` tests (function not exported / not defined).

- [ ] **Step 3: Implement `findFixmeRoot()` in fixme-tools.cjs**

Add this function after the `buildTransitionsFromPhases` function (around line 575), before `loadPipelinePhases`:

```javascript
// ============================================================================
// Fixme Root Resolution
// ============================================================================

/**
 * Find the project root that contains the .fixme/ directory.
 *
 * Resolution order:
 * 1. If startDir has .fixme/ -> return startDir (local takes priority)
 * 2. Walk up ancestors looking for a parent with .fixme/:
 *    a. If parent .fixme/config.json has sub_repos and startDir matches -> return parent
 *    b. If startDir (or any dir between startDir and parent) has .git -> return parent
 * 3. Never go above $HOME or filesystem root
 * 4. Fallback: return startDir
 */
function findFixmeRoot(startDir) {
  const resolved = path.resolve(startDir);
  const root = path.parse(resolved).root;
  const homedir = require('os').homedir();

  // If startDir already contains .fixme/, it IS the project root.
  const ownFixme = path.join(resolved, '.fixme');
  if (fs.existsSync(ownFixme) && fs.statSync(ownFixme).isDirectory()) {
    return startDir;
  }

  // Check if startDir or any ancestor up to candidateParent contains .git
  function isInsideGitRepo(candidateParent) {
    let d = resolved;
    while (d !== root) {
      if (fs.existsSync(path.join(d, '.git'))) return true;
      if (d === candidateParent) break;
      d = path.dirname(d);
    }
    return false;
  }

  let dir = resolved;
  while (dir !== root) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    if (parent === homedir) break;

    const parentFixme = path.join(parent, '.fixme');
    if (fs.existsSync(parentFixme) && fs.statSync(parentFixme).isDirectory()) {
      // Check config.json for sub_repos
      const configPath = path.join(parentFixme, 'config.json');
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const subRepos = config.sub_repos || [];

        if (Array.isArray(subRepos) && subRepos.length > 0) {
          const relPath = path.relative(parent, resolved);
          const topSegment = relPath.split(path.sep)[0];
          if (subRepos.includes(topSegment)) {
            return parent;
          }
        }
      } catch {
        // config.json missing or malformed - fall back to .git heuristic
      }

      // Heuristic: parent has .fixme/ and startDir is inside a git repo
      if (isInsideGitRepo(parent)) {
        return parent;
      }
    }
    dir = parent;
  }
  return startDir;
}
```

Add `findFixmeRoot` to the exports at the bottom of the file:

```javascript
module.exports = { buildTransitionsFromPhases, parseFrontmatter, findFixmeRoot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30`

Expected: All `findFixmeRoot` tests PASS. All pre-existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
git commit -m "feat: add findFixmeRoot() for multi-root workspace support"
```

---

### Task 2: Add `root` CLI subcommand with tests

**Files:**
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs`
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs`

- [ ] **Step 1: Write failing tests for the `root` command**

Add after the `findFixmeRoot` test suite:

```javascript
// ============================================================================
// Test Suite: root CLI command
// ============================================================================

console.log('\n=== root CLI command ===\n');

test('root: returns fixme_root and fixme_dir for local .fixme/', () => {
  const tmp = createTmpDir();
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  const result = runInDir('root', tmp);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixme_root === tmp, `fixme_root should be ${tmp}, got ${result.data.fixme_root}`);
  assert(result.data.fixme_dir === path.join(tmp, '.fixme'), `fixme_dir should end with .fixme, got ${result.data.fixme_dir}`);
});

test('root: resolves to parent when .fixme/ is in parent and sub-dir has .git', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  const subRepo = path.join(workspace, 'myapp');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });
  const result = runInDir('root', subRepo);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixme_root === workspace, `fixme_root should be workspace, got ${result.data.fixme_root}`);
  assert(result.data.fixme_dir === path.join(workspace, '.fixme'), `fixme_dir should be in workspace, got ${result.data.fixme_dir}`);
});

test('root: falls back to CWD when no .fixme/ found', () => {
  const tmp = createTmpDir();
  const result = runInDir('root', tmp);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixme_root === tmp, `fixme_root should be CWD, got ${result.data.fixme_root}`);
  assert(result.data.fixme_dir === path.join(tmp, '.fixme'), `fixme_dir should be CWD/.fixme, got ${result.data.fixme_dir}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30`

Expected: FAIL for `root` tests (unknown command).

- [ ] **Step 3: Add the `root` command to fixme-tools.cjs**

Add a `rootCommand` function before `main()`:

```javascript
function rootCommand() {
  const fixmeRoot = findFixmeRoot(process.cwd());
  return output({
    fixme_root: fixmeRoot,
    fixme_dir: path.join(fixmeRoot, '.fixme'),
  });
}
```

Add the case to the `main()` switch statement, after the `context` case:

```javascript
      case 'root':
        return rootCommand();
```

Also update the default error message in `main()` to include `root`:

```javascript
      default:
        return error(`Unknown command: '${command}'. Valid: ticket, session, context, root`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30`

Expected: All `root` tests PASS. All pre-existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
git commit -m "feat: add root CLI subcommand for fixme dir resolution"
```

---

### Task 3: Wire `findFixmeRoot` into existing CLI commands with integration tests

**Files:**
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs`
- Modify: `.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs`

- [ ] **Step 1: Write failing integration tests**

These tests verify that `loadPipelinePhases` and context commands resolve to a parent `.fixme/` when CWD is a sub-repo.

```javascript
// ============================================================================
// Test Suite: multi-root integration (CLI commands resolve parent .fixme/)
// ============================================================================

console.log('\n=== multi-root integration ===\n');

test('multi-root: ticket transition uses pipeline from parent .fixme/config.json', () => {
  const workspace = createTmpDir();
  createPipelineConfig(workspace); // creates workspace/.fixme/config.json
  const subRepo = path.join(workspace, 'myapp');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });

  // Create session and ticket in the workspace .fixme
  const sessionResult = runInDir(`session create "${path.join(workspace, '.fixme', 'sessions')}" --name multi-test`, subRepo);
  assert(sessionResult.ok, `Session create failed: ${JSON.stringify(sessionResult.data)}`);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug multi-root-bug`, subRepo);
  assert(createResult.ok, `Ticket create failed: ${JSON.stringify(createResult.data)}`);
  const ticketPath = createResult.data.path;

  // Transition using pipeline from parent config - CWD is subRepo
  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, subRepo);
  assert(t1.ok, `Transition should use parent config, got: ${JSON.stringify(t1.data)}`);
  assert(t1.data.to === 'plan', `Should transition to plan, got ${t1.data.to}`);
});

test('multi-root: context save writes to parent .fixme/config.json', () => {
  const workspace = createTmpDir();
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  const subRepo = path.join(workspace, 'myapp');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });

  const projectData = JSON.stringify({ build: 'yarn build', framework: 'react' });
  const result = runInDir(`context save --data '${projectData}'`, subRepo);
  assert(result.ok, `context save should succeed, got: ${JSON.stringify(result.data)}`);

  // Verify it wrote to workspace/.fixme/config.json, NOT subRepo/.fixme/config.json
  const parentConfig = path.join(workspace, '.fixme', 'config.json');
  assert(fs.existsSync(parentConfig), 'config.json should be in parent .fixme/');
  const localConfig = path.join(subRepo, '.fixme', 'config.json');
  assert(!fs.existsSync(localConfig), 'config.json should NOT be in subRepo .fixme/');

  const config = JSON.parse(fs.readFileSync(parentConfig, 'utf8'));
  assert(config.project.framework === 'react', 'project data should be written correctly');
});

test('multi-root: context load reads from parent .fixme/config.json', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    project: { build: 'yarn build', framework: 'next.js' }
  }));
  const subRepo = path.join(workspace, 'myapp');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });

  const result = runInDir('context load', subRepo);
  assert(result.ok, `context load should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.framework === 'next.js', `Should load parent config, got ${result.data.framework}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30`

Expected: FAIL - `loadPipelinePhases` uses `process.cwd()`, context commands default to `process.cwd()`.

- [ ] **Step 3: Wire `findFixmeRoot` into `loadPipelinePhases`**

Change `loadPipelinePhases` to accept an optional `fixmeRoot` parameter:

In `fixme-tools.cjs`, replace the current `loadPipelinePhases` function (around line 581):

```javascript
function loadPipelinePhases(pipelineName, fixmeRoot) {
  const configPath = path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
  if (!fs.existsSync(configPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.pipelines || !config.pipelines[pipelineName]) return null;
    const pipeline = config.pipelines[pipelineName];
    if (!Array.isArray(pipeline)) return null;
    return pipeline
      .filter(phase => phase.enabled !== false)
      .map(phase => phase.name)
      .filter(Boolean);
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 4: Resolve fixme root in `main()` and thread it through**

In `main()`, after parsing args, resolve the fixme root and pass it through. Add this line after `const { args, flags } = parseArgs(allArgs.slice(2));`:

```javascript
  const fixmeRoot = findFixmeRoot(process.cwd());
```

Pass `fixmeRoot` to `resolveTransitions` by updating how it calls `loadPipelinePhases`. In `resolveTransitions`, add a `fixmeRoot` parameter:

```javascript
function resolveTransitions(fm, flags, fixmeRoot) {
```

And pass it to `loadPipelinePhases`:

```javascript
    const phases = loadPipelinePhases(pipelineName, fixmeRoot);
```

Then in `ticketTransition` (which calls `resolveTransitions`), add `fixmeRoot` as a parameter and pass it through. Note: the existing parameter name is `newState` - keep it:

```javascript
function ticketTransition(ticketPath, newState, flags, fixmeRoot) {
```

And the call within ticketTransition (keep the existing destructured name `pipelineName`):

```javascript
  const { transitions: transMap, phases, pipelineName } = resolveTransitions(fm, flags, fixmeRoot);
```

Update the main() router to pass fixmeRoot to ticketTransition:

```javascript
          case 'transition':
            return ticketTransition(args[0], args[1], flags, fixmeRoot);
```

- [ ] **Step 5: Wire `findFixmeRoot` into context save/load commands**

Update `contextSave` and `contextLoad` to default `--project-dir` to the resolved fixme root. **Do NOT change `contextDetect`** - it scans for project files (`package.json`, lockfiles, `vite.config.ts`, `.env`) that live in the sub-repo CWD, not the workspace root. Only save/load interact with `.fixme/config.json`.

In `contextSave` and `contextLoad`, change the fallback from `process.cwd()` to accept a `fixmeRoot` parameter:

```javascript
function contextSave(flags, fixmeRoot) {
  const projectDir = flags['project-dir'] || fixmeRoot || process.cwd();
```

```javascript
function contextLoad(flags, fixmeRoot) {
  const projectDir = flags['project-dir'] || fixmeRoot || process.cwd();
```

`contextDetect` stays unchanged - it keeps using `flags['project-dir'] || process.cwd()`.

Update the main() router - only pass `fixmeRoot` to save and load:

```javascript
          case 'detect':
            return contextDetect(flags);
          case 'save':
            return contextSave(flags, fixmeRoot);
          case 'load':
            return contextLoad(flags, fixmeRoot);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -150`

Expected: ALL tests pass - both new multi-root tests and all pre-existing tests. The pre-existing tests should not be affected because `findFixmeRoot` returns CWD when no parent `.fixme/` exists, preserving original behavior.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
git commit -m "feat: wire findFixmeRoot into CLI commands for multi-root support"
```

---

### Task 4: Update fixme-task orchestrator to resolve and pass fixme dir

**Files:**
- Modify: `.claude/skills/fixme-task/SKILL.md`

The orchestrator resolves the fixme root once during config loading and passes it to all sub-agents in dispatch prompts.

- [ ] **Step 1: Add Fixme Root Resolution to Config Loading section**

In `.claude/skills/fixme-task/SKILL.md`, find the "Config Loading" section (line ~77). Insert a new step 0 before step 1:

Add after the `## Config Loading` heading and before `1. **Read .fixme/config.json**`:

```markdown
0. **Resolve fixme root:**
   ```bash
   node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
   ```
   This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Store `fixme_dir` - use it as the base for ALL `.fixme/` paths below and in dispatch prompts. If the command fails, fall back to `.fixme` relative to CWD.
```

- [ ] **Step 2: Update the dispatch prompt template**

In the "Dispatch contract" section (line ~270), update the dispatch prompt template to include `Fixme dir`:

Replace the existing template:

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
    </project>
  "
)
```

With:

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

- [ ] **Step 3: Update Orchestrator Tool Allowlist**

In the "Orchestrator Tool Allowlist" section (line ~152), update the paths to reference `<fixme-dir>` instead of hardcoded `.fixme`:

Replace:
```markdown
- **Read** - ONLY on `.fixme/config.json`, `.fixme/plans/*.md`, `.fixme/decisions.md`, or plan files referenced in conversation
- **Write** - ONLY on `.fixme/decisions.md`
- **Bash** - ONLY `mkdir -p .fixme/plans` or `mkdir -p .fixme`
```

With:
```markdown
- **Read** - ONLY on `<fixme-dir>/config.json`, `<fixme-dir>/plans/*.md`, `<fixme-dir>/decisions.md`, or plan files referenced in conversation
- **Write** - ONLY on `<fixme-dir>/decisions.md`
- **Bash** - ONLY `mkdir -p <fixme-dir>/plans` or `mkdir -p <fixme-dir>`, or `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root`
```

- [ ] **Step 4: Update all hardcoded `.fixme/` references in the skill**

Update these specific lines throughout the file (use find-and-replace, then verify each):

| Line | Old | New |
|------|-----|-----|
| ~3 | `from .fixme/config.json` | `from .fixme/config.json (resolved via fixme root)` |
| ~8 | `from .fixme/config.json` | `from the resolved fixme directory's config.json` |
| ~36 | `pipeline names in .fixme/config.json` | `pipeline names in <fixme-dir>/config.json` |
| ~61 | `.fixme/plans/` | `<fixme-dir>/plans/` |
| ~63 | `.fixme/plans/` | `<fixme-dir>/plans/` |
| ~68 | `.fixme/decisions.md` | `<fixme-dir>/decisions.md` |
| ~81 | `Read .fixme/config.json` | `Read <fixme-dir>/config.json` |
| ~296 | `Read .fixme/config.json` | `Read <fixme-dir>/config.json` |
| ~480 | `Persisted at .fixme/decisions.md` | `Persisted at <fixme-dir>/decisions.md` |

In the description frontmatter (line 3), keep the original text since descriptions shouldn't use template variables.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md
git commit -m "feat: fixme-task resolves fixme root and passes to sub-agents"
```

---

### Task 5: Update sub-agent skills to accept fixme dir from dispatch

**Files:**
- Modify: `.claude/skills/fixme-write-plan/SKILL.md`
- Modify: `.claude/skills/fixme-execute-plan/SKILL.md`
- Modify: `.claude/skills/fixme-review-plan/SKILL.md`
- Modify: `.claude/skills/fixme-review-code/SKILL.md`
- Modify: `.claude/skills/fixme-handle-plan-review/SKILL.md`
- Modify: `.claude/skills/fixme-handle-code-review/SKILL.md`
- Modify: `.claude/skills/fixme-investigate/SKILL.md`
- Modify: `.claude/skills/fixme-research/SKILL.md`
- Modify: `.claude/skills/fixme-browser-verify/SKILL.md`

All sub-agent skills receive `Fixme dir: <path>` in the dispatch prompt from fixme-task. They need a section explaining how to use it.

- [ ] **Step 1: Add Fixme Directory Resolution section to fixme-write-plan**

In `.claude/skills/fixme-write-plan/SKILL.md`, add after the frontmatter (after `---`) and before the first heading:

```markdown
## Fixme Directory

All `.fixme/` paths in this document are relative to the fixme root directory. When dispatched by fixme-task, the `Fixme dir` is provided in the `<project>` block of the dispatch prompt - use it as the base for all `.fixme/` paths (e.g., `<fixme-dir>/plans/`, `<fixme-dir>/decisions.md`). When running standalone, resolve by running `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and using the `fixme_dir` field.
```

- [ ] **Step 2: Add the same section to all other sub-agent skills**

Add the identical section (from Step 1) to each of these files, after the frontmatter `---` and before the first `#` heading:

- `.claude/skills/fixme-execute-plan/SKILL.md`
- `.claude/skills/fixme-review-plan/SKILL.md`
- `.claude/skills/fixme-review-code/SKILL.md`
- `.claude/skills/fixme-handle-plan-review/SKILL.md`
- `.claude/skills/fixme-handle-code-review/SKILL.md`
- `.claude/skills/fixme-investigate/SKILL.md`
- `.claude/skills/fixme-research/SKILL.md`
- `.claude/skills/fixme-browser-verify/SKILL.md`

Use the exact same text for consistency. Each skill already has `.fixme/` references in its body - those paths are now implicitly relative to the resolved fixme dir.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-write-plan/SKILL.md .claude/skills/fixme-execute-plan/SKILL.md .claude/skills/fixme-review-plan/SKILL.md .claude/skills/fixme-review-code/SKILL.md .claude/skills/fixme-handle-plan-review/SKILL.md .claude/skills/fixme-handle-code-review/SKILL.md .claude/skills/fixme-investigate/SKILL.md .claude/skills/fixme-research/SKILL.md .claude/skills/fixme-browser-verify/SKILL.md
git commit -m "feat: sub-agent skills accept fixme dir from dispatch context"
```

---

### Task 6: Update standalone skills to resolve fixme root

**Files:**
- Modify: `.claude/skills/fixme-session/SKILL.md`
- Modify: `.claude/skills/fixme-config/SKILL.md`
- Modify: `.claude/skills/fixme-ticket/SKILL.md`
- Modify: `.claude/skills/fixme-rebase/SKILL.md`
- Modify: `.claude/skills/fixme-tickets/SKILL.md`
- Modify: `.claude/skills/fixme-tickets-md/SKILL.md`

Standalone skills (user-invoked, not dispatched by fixme-task) need to resolve the fixme root themselves.

- [ ] **Step 1: Update fixme-session**

In `.claude/skills/fixme-session/SKILL.md`, add after the first paragraph (after "You are the Fixme orchestrator...") and before "## Ticket Operations via fixme-tickets":

```markdown
## Fixme Directory Resolution

At the start of any session operation, resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Use `fixme_dir` as the base for all `.fixme/` paths throughout this session (e.g., `<fixme-dir>/sessions` instead of `.fixme/sessions`). If the command fails, fall back to `.fixme` relative to CWD.
```

Then update the hardcoded `.fixme/sessions` references throughout the file to `<fixme-dir>/sessions`:

- Line 25: `session create .fixme/sessions` -> `session create <fixme-dir>/sessions`
- Line 60: `session create .fixme/sessions` -> `session create <fixme-dir>/sessions`
- Line 83: `session list .fixme/sessions` -> `session list <fixme-dir>/sessions`
- Line 96: `session list .fixme/sessions` -> `session list <fixme-dir>/sessions`
- Line 241: `Config: .fixme/config.json` -> `Config: <fixme-dir>/config.json`
- Line 296: `git clean -fd --exclude=.fixme/` -> `git clean -fd --exclude=<fixme-dir>/` (only if fixme-dir is relative; if absolute, use `--exclude=.fixme/` as before since git clean uses relative paths)

For the `git clean` line, keep `.fixme/` since git clean operates on relative paths within the repo and `.fixme/` may be outside the repo in multi-root setups (so it wouldn't be affected by git clean anyway).

- [ ] **Step 2: Update fixme-config**

In `.claude/skills/fixme-config/SKILL.md`, add after the frontmatter and before `## Prerequisites`:

```markdown
## Fixme Directory Resolution

Before loading config, resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Use `fixme_dir` as the base for all `.fixme/` paths in this skill. If the command fails, fall back to `.fixme` relative to CWD.
```

Update the Step 1 config loading command:

Replace:
```bash
cat .fixme/config.json 2>/dev/null || echo '{}'
```

With:
```bash
cat <fixme-dir>/config.json 2>/dev/null || echo '{}'
```

Update the config save path reference:

Replace:
```
Write to `.fixme/config.json`:
```

With:
```
Write to `<fixme-dir>/config.json`:
```

Update the final output message:

Replace:
```
Config saved to .fixme/config.json
```

With:
```
Config saved to <fixme-dir>/config.json
```

- [ ] **Step 3: Update fixme-ticket**

In `.claude/skills/fixme-ticket/SKILL.md`, add after the frontmatter and before the first section:

```markdown
## Fixme Directory Resolution

Before reading config, resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Use `fixme_dir` as the base for all `.fixme/` paths below. If the command fails, fall back to `.fixme` relative to CWD.
```

Update `.fixme/config.json` references throughout the file to `<fixme-dir>/config.json`.

- [ ] **Step 4: Update fixme-rebase**

In `.claude/skills/fixme-rebase/SKILL.md`, add after the frontmatter and before the first section:

```markdown
## Fixme Directory Resolution

Before accessing any `.fixme/` paths, resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Use `fixme_dir` as the base for all `.fixme/` paths below. If the command fails, fall back to `.fixme` relative to CWD.
```

Update `.fixme/config.json` references to `<fixme-dir>/config.json`.

Update the `REBASE_DIR` path:

Replace:
```
REBASE_DIR=".fixme/rebase/..."
```

With:
```
REBASE_DIR="<fixme-dir>/rebase/..."
```

- [ ] **Step 5: Update fixme-tickets abstraction**

In `.claude/skills/fixme-tickets/SKILL.md`, add after the frontmatter and before the first heading:

```markdown
## Fixme Directory Resolution

Before resolving the backend, resolve the fixme root:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root
```

This returns `{ "fixme_root": "<path>", "fixme_dir": "<path>/.fixme" }`. Use `fixme_dir` as the base for all `.fixme/` paths. Pass the resolved fixme root as `Project root` in backend dispatch prompts. If the command fails, fall back to `.fixme` relative to CWD.
```

Update `.fixme/config.json` references to `<fixme-dir>/config.json`.

- [ ] **Step 6: Update fixme-tickets-md**

In `.claude/skills/fixme-tickets-md/SKILL.md`, update references to `.fixme/config.json` to note that the path comes from the dispatch context:

Add after the frontmatter:

```markdown
## Fixme Directory

When dispatched by fixme-tickets, the `Project root` in the dispatch prompt determines where `.fixme/` lives. Use the provided project root as the base for all `.fixme/` paths. The CLI tool (`fixme-tools.cjs`) auto-resolves the fixme root internally, so paths passed to CLI commands are resolved automatically.
```

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/fixme-session/SKILL.md .claude/skills/fixme-config/SKILL.md .claude/skills/fixme-ticket/SKILL.md .claude/skills/fixme-rebase/SKILL.md .claude/skills/fixme-tickets/SKILL.md .claude/skills/fixme-tickets-md/SKILL.md
git commit -m "feat: standalone skills resolve fixme root for multi-root workspaces"
```

---

### Task 7: Run install and verify

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

Run: `node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -150`

Expected: ALL tests pass with 0 failures.

- [ ] **Step 2: Install skills**

Run: `./install.sh`

Expected: All fixme skill directories copied to `~/.claude/skills/` successfully.

- [ ] **Step 3: Verify installed fixme-tools.cjs has root command**

Run: `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root 2>&1`

Expected: JSON output with `fixme_root` and `fixme_dir` fields (pointing to CWD since this repo has no `.fixme/`).

- [ ] **Step 4: Commit (if install.sh is tracked)**

No commit needed - install.sh copies files, doesn't modify tracked sources.
