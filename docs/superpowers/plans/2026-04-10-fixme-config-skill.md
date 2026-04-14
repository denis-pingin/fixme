# Fixme Config Skill + Project Context Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an interactive `/fixme-config` skill for managing `.fixme/config.json`, and fully migrate from `.fixme/project-context.yaml` to the `project` section of `config.json`, deleting all yaml-related code and references.

**Architecture:** Pure skill approach (no new CLI subcommands). The skill reads config.json, presents settings via `AskUserQuestion`, validates inline, and writes back. The `context detect` command in `fixme-tools.cjs` is updated to output config.json's `project` format instead of yaml format. `context save` and `context load` are updated to read/write config.json. The yaml serialization code is deleted.

**Tech Stack:** Claude Code skills (SKILL.md), Node.js (fixme-tools.cjs), AskUserQuestion tool, Linear MCP (for the conditional Linear configuration round)

---

## File Structure

```
Create: .claude/skills/fixme-config/SKILL.md          -- Interactive config management skill
Modify: .claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs  -- Migrate context commands to config.json
Modify: .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs -- Add tests for config commands
Modify: .claude/skills/fixme-session/references/config-schema.md -- Expand project section schema
Modify: .claude/skills/fixme-session/SKILL.md          -- Remove project-context.yaml references
Modify: .claude/skills/fixme-session/docs/data-flow.md -- Update data flow docs (yaml + Fix-Verifier cleanup)
Modify: .claude/skills/fixme-session/agents/investigation-agent.md -- Remove yaml references
Modify: .claude/skills/fixme-task/SKILL.md             -- Remove yaml fallback
Modify: .claude/skills/fixme-investigate/SKILL.md      -- Remove yaml fallback
Modify: .claude/skills/fixme-rebase/SKILL.md           -- Switch to config.json
Modify: .claude/skills/fixme-tickets/SKILL.md          -- Update context operation descriptions
Modify: .claude/skills/fixme-tickets-md/SKILL.md       -- Update context operations
Modify: .claude/skills/fixme-tickets-md/references/project-context-schema.md -- Delete or replace
Modify: .claude/agents/fixme-task.md                   -- Remove yaml from Read allowlist
Modify: CLAUDE.md                                      -- Add /fixme-config, remove yaml references
```

---

### Task 1: Expand config.json `project` schema

The current `project` section in config-schema.md is minimal (`devServer`, `build`, `lint`, `test` as strings). Expand it to cover all fields that agents actually use from the old yaml, plus `framework` for context.

**Files:**
- Modify: [config-schema.md](.claude/skills/fixme-session/references/config-schema.md)

- [ ] **Step 1: Update the project section in config-schema.md**

Replace the `project` section in the schema JSON example (lines 12-21) with:

```json
"project": {
  "devServer": {
    "url": "http://localhost:3000",
    "command": "yarn dev",
    "hmr": true
  },
  "build": "yarn build",
  "lint": "yarn lint",
  "test": {
    "command": "yarn test",
    "runner": "vitest"
  },
  "framework": "next.js"
}
```

Update the Field Reference table. Replace ONLY the existing `project.*` rows at lines 139-145 with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project` | object | No | Project settings. If absent, auto-detected via `/fixme-config` or `context detect`. |
| `project.devServer.url` | string | No | Dev server base URL |
| `project.devServer.command` | string | No | Shell command to start dev server |
| `project.devServer.hmr` | boolean | No | Whether HMR is supported |
| `project.build` | string | No | Build command |
| `project.lint` | string | No | Lint command |
| `project.test` | string\|object | No | Test command (string) or test config object |
| `project.test.command` | string | No | Test command (when using object form) |
| `project.test.runner` | string | No | Test runner: `vitest`, `jest`, `mocha`, or null |
| `project.framework` | string | No | Detected framework: `next.js`, `nuxt`, `angular`, `svelte`, `vue`, `react` |

**CAUTION:** Do NOT modify the `linear.*` rows (lines 148-152) or `ticketTemplate.*` rows (lines 153-158). They are adjacent to `project.*` rows but are out of scope per Decision 8 (fixme-config does not configure ticketTemplate) and are managed by Decision 11 (Linear settings written by the Linear discovery round, not the schema migration). The `ticketBackend` row (line 146) and `pipelines` row (line 147) also stay unchanged.

- [ ] **Step 2: Remove the yaml fallback note**

Delete the existing yaml fallback line at line 164 (the last line of the file): "If `project` is absent, fixme-task reads `.fixme/project-context.yaml` as fallback (backwards compatible)."

Replace with: "If `project` is absent, run `/fixme-config` to auto-detect and configure project settings."

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-session/references/config-schema.md
git commit -m "docs: expand config.json project section schema"
```

---

### Task 2: Update `fixme-tools.cjs` context commands to use config.json

Migrate `context detect`, `context save`, and `context load` from writing/reading `.fixme/project-context.yaml` to writing/reading `.fixme/config.json`'s `project` section. Delete all yaml serialization code.

**Files:**
- Modify: [fixme-tools.cjs](.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs)

- [ ] **Step 1: Write failing tests for the new behavior**

Add tests to [fixme-tools.test.cjs](.claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs) at the end of the file, before the cleanup/summary section. These tests verify:

1. `context detect` outputs a `project` object in config.json format (camelCase keys: `devServer`, not `dev_server`)
2. `context save --data '<json>'` writes to `.fixme/config.json` under the `project` key, preserving existing config keys
3. `context load` reads from `.fixme/config.json`'s `project` key
4. `context save` merges into existing config (doesn't overwrite `pipelines`, `models`, etc.)
5. `context load` returns error when no config.json exists

```javascript
// ── context commands (config.json migration) ─────────────────────────
console.log('\n── context commands ──');

test('context detect outputs camelCase project format', () => {
  const tmp = createTmpDir();
  // Create a minimal package.json
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    scripts: { dev: 'next dev', build: 'next build', test: 'jest', lint: 'eslint .' },
    dependencies: { next: '^14.0.0', react: '^18.0.0' },
    devDependencies: { jest: '^29.0.0' }
  }));
  const result = runInDir('context detect', tmp);
  assert(result.ok, 'context detect should succeed');
  const d = result.data;
  // Must use config.json camelCase format
  assert(d.devServer !== undefined, 'should have devServer key (camelCase)');
  assert(d.devServer.command === 'yarn dev', 'devServer.command should be yarn dev');
  assert(d.devServer.url === 'http://localhost:3000', 'devServer.url should default to localhost:3000');
  assert(d.build === 'yarn build', 'build should be yarn build');
  assert(d.test.command === 'yarn test', 'test.command should be yarn test');
  assert(d.test.runner === 'jest', 'test.runner should be jest');
  assert(d.lint === 'yarn lint', 'lint should be yarn lint');
  assert(d.framework === 'next.js', 'framework should be next.js');
  // Must NOT have old yaml-style keys
  assert(d.dev_server === undefined, 'should NOT have dev_server (snake_case)');
});

test('context save writes to config.json project key', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const projectData = JSON.stringify({
    devServer: { url: 'http://localhost:3000', command: 'yarn dev', hmr: true },
    build: 'yarn build', lint: 'yarn lint',
    test: { command: 'yarn test', runner: 'vitest' },
    framework: 'react'
  });
  const result = runInDir(`context save --data '${projectData}'`, tmp);
  assert(result.ok, 'context save should succeed');
  // Verify config.json was written
  const configPath = path.join(fixmeDir, 'config.json');
  assert(fs.existsSync(configPath), 'config.json should exist');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(config.project !== undefined, 'config should have project key');
  assert(config.project.devServer.url === 'http://localhost:3000', 'project.devServer.url correct');
  assert(config.project.framework === 'react', 'project.framework correct');
  // Must NOT have created project-context.yaml
  assert(!fs.existsSync(path.join(fixmeDir, 'project-context.yaml')), 'yaml file must not exist');
});

test('context save preserves existing config keys', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  // Write existing config with pipelines and models
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    ticketBackend: 'fixme-tickets-md',
    models: { profile: 'balanced' },
    pipelines: { default: [{ name: 'plan', skills: ['fixme-write-plan'] }] }
  }, null, 2));
  const projectData = JSON.stringify({
    devServer: { url: 'http://localhost:5173', command: 'yarn dev', hmr: true },
    build: 'yarn build'
  });
  const result = runInDir(`context save --data '${projectData}'`, tmp);
  assert(result.ok, 'context save should succeed');
  const config = JSON.parse(fs.readFileSync(path.join(fixmeDir, 'config.json'), 'utf8'));
  assert(config.ticketBackend === 'fixme-tickets-md', 'ticketBackend preserved');
  assert(config.models.profile === 'balanced', 'models preserved');
  assert(config.pipelines.default.length === 1, 'pipelines preserved');
  assert(config.project.devServer.url === 'http://localhost:5173', 'project updated');
});

test('context load reads from config.json project key', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    project: {
      devServer: { url: 'http://localhost:4000', command: 'npm run dev', hmr: false },
      build: 'npm run build',
      test: { command: 'npm test', runner: 'vitest' }
    }
  }, null, 2));
  const result = runInDir('context load', tmp);
  assert(result.ok, 'context load should succeed');
  assert(result.data.devServer.url === 'http://localhost:4000', 'loaded correct url');
  assert(result.data.build === 'npm run build', 'loaded correct build');
  assert(result.data.test.runner === 'vitest', 'loaded correct test runner');
});

test('context load fails when no config.json exists', () => {
  const tmp = createTmpDir();
  const result = runInDir('context load', tmp);
  assert(!result.ok, 'should fail');
  assert(result.data && result.data.error, 'should have error message');
});
```

- [ ] **Step 2: Run tests, verify the new tests fail**

```bash
node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30
```

Expected: The 5 new context tests all FAIL (context detect still outputs snake_case yaml format, context save still writes yaml, context load still reads yaml).

- [ ] **Step 3: Update `contextDetect` to output config.json format**

In [fixme-tools.cjs](.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs), replace the `contextDetect` function (starts around line 1230). The function currently builds a `context` object with snake_case keys (`dev_server`, `build.command`, `test.runner`, etc.) and returns it. Change it to build a camelCase `project` object matching the config.json schema:

```javascript
function contextDetect(flags) {
  const projectDir = flags['project-dir'] || process.cwd();

  const project = {
    devServer: { command: null, url: null, hmr: false },
    build: null,
    lint: null,
    test: { command: null, runner: null },
    framework: null,
  };

  // 1. package.json
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts || {};

      if (scripts.dev) project.devServer.command = 'yarn dev';
      if (scripts.build) project.build = 'yarn build';
      if (scripts.test) project.test.command = 'yarn test';
      if (scripts.lint) project.lint = 'yarn lint';

      // Framework detection from dependencies
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (allDeps['next']) project.framework = 'next.js';
      else if (allDeps['nuxt']) project.framework = 'nuxt';
      else if (allDeps['@angular/core']) project.framework = 'angular';
      else if (allDeps['svelte'] || allDeps['@sveltejs/kit']) project.framework = 'svelte';
      else if (allDeps['vue']) project.framework = 'vue';
      else if (allDeps['react']) project.framework = 'react';

      // Test runner detection
      if (allDeps['vitest']) {
        project.test.runner = 'vitest';
      } else if (allDeps['jest']) {
        project.test.runner = 'jest';
      } else if (allDeps['mocha']) {
        project.test.runner = 'mocha';
      }
    } catch (e) {
      // Invalid package.json - skip
    }
  }

  // 2. Config files for HMR detection
  const hmrConfigs = [
    'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
  ];
  for (const cfg of hmrConfigs) {
    if (fs.existsSync(path.join(projectDir, cfg))) {
      project.devServer.hmr = true;
      break;
    }
  }

  // 3. .env for PORT
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(projectDir, envFile);
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) {
        project.devServer.url = `http://localhost:${portMatch[1]}`;
        break;
      }
    }
  }

  // Default URL
  if (project.devServer.command && !project.devServer.url) {
    project.devServer.url = 'http://localhost:3000';
  }

  return output(project);
}
```

- [ ] **Step 4: Update `contextSave` to write config.json**

Replace the `contextSave` function (starts around line 1323). Instead of writing yaml to `project-context.yaml`, it now reads existing `config.json`, merges the data under the `project` key, and writes back:

```javascript
function contextSave(flags) {
  const projectDir = flags['project-dir'] || process.cwd();
  const dataStr = flags.data || null;

  if (!dataStr) {
    return error('--data is required for context save (JSON string)');
  }

  let data;
  try {
    data = JSON.parse(dataStr);
  } catch (e) {
    return error(`Invalid JSON in --data: ${e.message}`);
  }

  // Ensure .fixme/ directory
  const fixmeDir = path.join(projectDir, '.fixme');
  if (!fs.existsSync(fixmeDir)) {
    fs.mkdirSync(fixmeDir, { recursive: true });
  }

  // Read existing config.json if it exists, merge project into it
  const configPath = path.join(fixmeDir, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      // Corrupted config.json - start fresh but warn
      config = {};
    }
  }

  config.project = data;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  return output({ path: configPath, saved: true });
}
```

- [ ] **Step 5: Update `contextLoad` to read config.json**

Replace the `contextLoad` function (starts around line 1352):

```javascript
function contextLoad(flags) {
  const projectDir = flags['project-dir'] || process.cwd();
  const configPath = path.join(projectDir, '.fixme', 'config.json');

  if (!fs.existsSync(configPath)) {
    return error("No project config found. Run '/fixme-config' to set up.");
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return error(`Invalid config.json: ${e.message}`);
  }

  if (!config.project) {
    return error("No project settings in config.json. Run '/fixme-config' to configure.");
  }

  return output(config.project);
}
```

- [ ] **Step 6: Delete project-context yaml serialization code**

Delete ONLY the project-context-specific YAML functions: `jsonToYaml` (starts around line 1373) and `yamlToJson` (starts around line 1430), plus the "YAML <-> JSON for project context" comment block.

**Do NOT delete** `parseScalar`, `parseInlineArray`, `serializeScalar`, `needsQuoting`, or `escapeYamlString` - these are shared with the ticket frontmatter parser/serializer and are used throughout the file for ticket operations.

Also remove the `detected_from` and `detected_at` fields from the detect output - they were yaml metadata cruft. The detect function above already omits them.

- [ ] **Step 7: Run tests, verify all pass**

```bash
node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -30
```

Expected: ALL tests pass (both existing and new context tests).

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs
git commit -m "feat: migrate context commands from project-context.yaml to config.json"
```

---

### Task 3: Create the fixme-config skill

The interactive config management skill. Follows the GSD `/gsd:settings` pattern: read config, present via `AskUserQuestion`, validate, write back, confirm.

**Files:**
- Create: [.claude/skills/fixme-config/SKILL.md](.claude/skills/fixme-config/SKILL.md)

- [ ] **Step 1: Create the skill file**

```markdown
---
name: fixme-config
description: "Interactive configuration for fixme pipelines, model profiles, project settings, and Linear integration. Creates or updates .fixme/config.json."
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
argument-hint: "[init]"
---

# Fixme Config

Interactive configuration of fixme settings: model profile, pipeline selection, ticket backend, project commands, and Linear integration. Updates `.fixme/config.json`.

## Prerequisites

**Linear MCP is required only when the user selects the Linear ticket backend.** If the user picks Linear and any Linear MCP tool call fails with a "tool not found" or connection error, stop the skill immediately and tell the user:

> "Linear MCP is not available. I need it to configure the Linear backend. Please enable it and tell me to continue."

Do NOT fall back to manual entry, do NOT skip the Linear round, do NOT write partial Linear settings. The user must enable Linear MCP first.

If the user selects the markdown backend, Linear MCP is not required and the Linear round is skipped entirely.

## Process

### Step 1: Load current config

```bash
cat .fixme/config.json 2>/dev/null || echo '{}'
```

Parse current values (defaults if not present):
- `models.profile` - model profile for agents (default: absent, meaning `quality`)
- `models.overrides` - per-agent model overrides (default: `{}`)
- `ticketBackend` - ticket backend (default: `fixme-tickets-md`)
- `pipelines` - named pipeline definitions (default: absent, meaning hardcoded `default` pipeline)
- `project.devServer.url` - dev server URL (default: null)
- `project.devServer.command` - dev server start command (default: null)
- `project.devServer.hmr` - HMR support (default: false)
- `project.build` - build command (default: null)
- `project.lint` - lint command (default: null)
- `project.test` - test command or object (default: null)
- `project.test.runner` - test runner name (default: null)
- `project.framework` - detected framework (default: null)
- `linear.teamId` - Linear team ID (default: null)
- `linear.teamName` - Linear team name (default: null)

### Step 2: Auto-detect project settings (first run only)

If `project` section is absent or empty (all null values), run auto-detection:

```bash
node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs context detect
```

Parse the JSON output. This becomes the starting values for the project section in the questions below.

If `project` section already has values, skip detection - use existing values as defaults.

### Step 3: Present settings (Round 1 - Pipeline & Models)

Use AskUserQuestion with current values pre-selected:

```
AskUserQuestion([
  {
    question: "Which model profile for fixme agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus for all agents (highest cost, best results)" },
      { label: "Balanced (Recommended)", description: "Opus for planning/review, Sonnet for execution" },
      { label: "Budget", description: "Sonnet for writing, Haiku for execution (lowest cost)" },
      { label: "Inherit", description: "Use current session model for all agents" }
    ]
  },
  {
    question: "Which pipeline to use by default?",
    header: "Pipeline",
    multiSelect: false,
    options: [
      { label: "Default (Recommended)", description: "Plan with review -> Implement with review" },
      { label: "Full", description: "Investigate -> Research -> Plan -> Implement -> Browser Verify" },
      { label: "Quick", description: "Plan -> Implement (no review loops)" }
    ]
  },
  {
    question: "Ticket backend?",
    header: "Backend",
    multiSelect: false,
    options: [
      { label: "Markdown (Recommended)", description: "Local markdown files in .fixme/sessions/" },
      { label: "Linear", description: "Linear issue tracker (requires Linear MCP)" }
    ]
  }
])
```

Map answers:
- Model: "Quality" -> `"quality"`, "Balanced" -> `"balanced"`, "Budget" -> `"budget"`, "Inherit" -> `"inherit"`
- Pipeline: "Default" -> ensure `default` pipeline in config, "Full" -> ensure `full` pipeline, "Quick" -> ensure `quick` pipeline
- Backend: "Markdown" -> `"fixme-tickets-md"`, "Linear" -> `"fixme-tickets-linear"`

### Step 4: Present settings (Round 2 - Project commands)

Display the auto-detected or existing values in a table first:

```
Detected project settings:
| Setting           | Value                    |
|-------------------|--------------------------|
| Framework         | {framework or 'unknown'} |
| Dev server URL    | {url or 'not set'}       |
| Dev server cmd    | {command or 'not set'}   |
| Build command     | {build or 'not set'}     |
| Test command      | {test cmd or 'not set'}  |
| Test runner       | {runner or 'unknown'}    |
| Lint command      | {lint or 'not set'}      |
| HMR               | {hmr}                    |
```

Then ask:

```
AskUserQuestion([
  {
    question: "Do these project settings look correct?",
    header: "Project",
    multiSelect: false,
    options: [
      { label: "Looks correct", description: "Save these settings as-is" },
      { label: "I need to adjust", description: "I'll provide corrections" }
    ]
  }
])
```

If "I need to adjust": ask follow-up questions one at a time for each value the user wants to change. Use AskUserQuestion with the current value shown, and an "Other" option for custom input. After each correction, confirm and move to the next.

### Step 5: Linear discovery round (conditional)

**Run this round ONLY if the Backend answer in Round 1 was "Linear" (`fixme-tickets-linear`). Skip entirely otherwise.**

Per Decision 13, this round configures ONLY `linear.teamId` and `linear.teamName`. Labels and project defaults are NOT written by fixme-config - users who want them can hand-edit config.json, and fixme-ticket handles per-ticket label/project selection at creation time.

#### Step 5a: Verify Linear MCP availability

Make a probe call to a Linear MCP tool (`mcp__claude_ai_Linear__list_teams` with no filters). If the call fails with "tool not found", a connection error, or any error indicating Linear MCP is not available, STOP the skill immediately and report:

> "Linear MCP is not available. I need it to configure the Linear backend. Please enable it and tell me to continue."

Do NOT proceed to Step 5b. Do NOT write any Linear fields. Do NOT save the config.

#### Step 5b: Discover and select team (Decision 13 hybrid flow)

Call `mcp__claude_ai_Linear__list_teams`. Parse the response into an array of `{ id, name, key }` objects. Preserve the order returned by the API as the canonical discovered list.

Branch on team count:

**Zero teams returned:** STOP the skill and report:

> "No Linear teams visible to this MCP connection. Please create or grant access to at least one team in Linear, then run /fixme-config again."

Do NOT proceed. Do NOT write any Linear fields.

**Exactly one team returned:** Use it automatically. Set `selectedTeam = teams[0]`. Print `Using Linear team: {name} ({key})`. Proceed to Step 5c.

**Two or more teams returned:** Use the hybrid flow below.

1. **Print the FULL numbered team list as plain text skill output BEFORE calling AskUserQuestion.** This output is unbounded and not inside AskUserQuestion. Use this exact format (one team per line, 1-indexed, matching the API response order):

   ```
   Discovered Linear teams:
   Team 1: {teams[0].name} [key: {teams[0].key}]
   Team 2: {teams[1].name} [key: {teams[1].key}]
   Team 3: {teams[2].name} [key: {teams[2].key}]
   ...
   Team N: {teams[N-1].name} [key: {teams[N-1].key}]
   ```

2. **Call AskUserQuestion with up to 3 most-probable options plus "Other" as the 4th.** The "most probable" heuristic is: the first 3 teams in the API response order (i.e. `teams.slice(0, 3)`). The 4th option is always "Other" with free-text input. If there are fewer than 3 teams (i.e. exactly 2), present 2 team options plus "Other" (3 options total). Example for 3+ teams:

   ```
   AskUserQuestion([
     {
       question: "Which Linear team should new tickets be created in?",
       header: "Team",
       multiSelect: false,
       options: [
         { label: "{teams[0].name}", description: "key: {teams[0].key}" },
         { label: "{teams[1].name}", description: "key: {teams[1].key}" },
         { label: "{teams[2].name}", description: "key: {teams[2].key}" },
         { label: "Other", description: "Type a team number (e.g. 5) or team name/key from the list above" }
       ]
     }
   ])
   ```

3. **Resolve the answer:**

   - If the user clicked one of the first 3 team labels: match by `team.name` against `teams.slice(0, 3)`. Set `selectedTeam` to that team.
   - If the user clicked "Other" and typed free-text: parse the typed value:
     - **If the typed value is a pure integer** (matches `/^\d+$/`): treat it as a 1-indexed team number. Look up `teams[parseInt(value, 10) - 1]`. If the index is out of range (< 1 or > `teams.length`), the input is invalid - re-prompt (see below).
     - **If the typed value is a string:** match case-insensitively against `team.name` first, then against `team.key`, across the full `teams` array. First match wins. If no match, the input is invalid - re-prompt.
   - **On invalid typed input:** print `Could not resolve "{value}" to a team. Please try again.` and repeat the full flow from step 1 of this sub-step (re-print the full numbered list, then re-call AskUserQuestion with the same 3 options + "Other"). Do NOT silently fall back to a default.

4. **Set the resolved values:** `selectedTeam = <the matched team object>`. Print `Selected Linear team: {selectedTeam.name} ({selectedTeam.key})`.

#### Step 5c: Stage Linear values

After Step 5b resolves `selectedTeam`, hold these values in memory for the merge in Step 7:

- `linear.teamId` = `selectedTeam.id`
- `linear.teamName` = `selectedTeam.name`

No other Linear fields are staged. `linear.defaultLabels` and `linear.defaultProject` are NOT configured by this skill (Decision 13).

### Step 6: Validate

Before writing, validate the config:

1. **Model profile** must be one of: `quality`, `balanced`, `budget`, `inherit`
2. **Model overrides** values must be one of: `opus`, `sonnet`, `haiku`, `inherit`
3. **Pipeline phases** must have unique `name` values within each pipeline
4. **Pipeline skills** should reference known fixme skill names (warn on unknown, don't block)
5. **Review config** `maxCycles` must be a positive integer if present
6. **Ticket backend** must be one of: `fixme-tickets-md`, `fixme-tickets-linear`
7. **Linear fields** (only if backend is `fixme-tickets-linear`):
   - `linear.teamId` must be a non-empty string
   - `linear.teamName` must be a non-empty string

If validation fails, display errors and re-prompt for the specific invalid settings.

### Step 7: Write config

Merge new settings into existing config.json (preserving any keys not covered by this skill). Include the `linear` object only when the backend is `fixme-tickets-linear`:

```json
{
  ...existing_config,
  "project": {
    "devServer": { "url": "<value>", "command": "<value>", "hmr": <bool> },
    "build": "<value>",
    "lint": "<value>",
    "test": { "command": "<value>", "runner": "<value>" },
    "framework": "<value>"
  },
  "ticketBackend": "<value>",
  "models": {
    "profile": "<value>",
    "overrides": { ...existing_overrides }
  },
  "pipelines": { ...pipeline_definitions },
  "linear": {
    "teamId": "<value>",
    "teamName": "<value>"
  }
}
```

When backend is `fixme-tickets-md`, leave the existing `linear` object (if any) untouched - do not delete or overwrite it.

Write to `.fixme/config.json`:

```bash
mkdir -p .fixme
```

Write the config file using the Write tool.

### Step 8: Confirm

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FIXME CONFIG UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value                    |
|----------------------|--------------------------|
| Model Profile        | {quality/balanced/budget/inherit} |
| Default Pipeline     | {default/full/quick}     |
| Ticket Backend       | {fixme-tickets-md/linear}|
| Framework            | {value}                  |
| Dev Server URL       | {value}                  |
| Dev Server Command   | {value}                  |
| Build Command        | {value}                  |
| Test Command         | {value}                  |
| Lint Command         | {value}                  |
```

If the backend is `fixme-tickets-linear`, append a Linear block to the table:

```
| Linear Team          | {teamName} ({teamId})    |
```

Then print:

```
Config saved to .fixme/config.json
```

## Pipeline Definitions

When writing pipelines to config, use these definitions:

**default:**
```json
[
  { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } },
  { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 2 } }
]
```

**full:**
```json
[
  { "name": "investigate", "skills": ["fixme-investigate"] },
  { "name": "research", "skills": ["fixme-research"] },
  { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } },
  { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 2 } },
  { "name": "verify", "skills": ["fixme-browser-verify"] }
]
```

**quick:**
```json
[
  { "name": "plan", "skills": ["fixme-write-plan"] },
  { "name": "implement", "skills": ["fixme-execute-plan"] }
]
```
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-config/SKILL.md
git commit -m "feat: add fixme-config interactive configuration skill"
```

---

### Task 4: Update fixme-session to use config.json instead of project-context.yaml

**Files:**
- Modify: [fixme-session/SKILL.md](.claude/skills/fixme-session/SKILL.md)
- Modify: [fixme-session/agents/investigation-agent.md](.claude/skills/fixme-session/agents/investigation-agent.md)
- Modify: [fixme-session/docs/data-flow.md](.claude/skills/fixme-session/docs/data-flow.md)

- [ ] **Step 1: Update session start flow in SKILL.md**

In [fixme-session/SKILL.md](.claude/skills/fixme-session/SKILL.md), find the "Load or detect project context" section (lines 62-67). Replace it with:

```markdown
2. **Load or detect project config:**
   Invoke fixme-tickets: `context load`
   - If project config found: use it silently, do not prompt user.
   - If NOT found: invoke fixme-tickets: `context detect`
     Parse the JSON output. **Output** the detected configuration as a formatted markdown table in text (framework, dev server URL, build/lint/test commands). Then call AskUserQuestion with a short plain-text prompt: "Does this project configuration look correct?" with options "Looks correct" and "I need to adjust something". If the user needs adjustments, ask follow-up questions to get the correct values, then manually adjust the JSON.
     After confirmation, invoke fixme-tickets: `context save --data '<JSON from detect output>'`
```

The logic is identical - only the file format changed internally. The important difference is the field names in the output are now camelCase. Update the "Session Environment Setup" section (line 119) to use camelCase keys:

Replace:
```
Extract `dev_server.url` and `dev_server.command` from the output.
```
With:
```
Extract `devServer.url` and `devServer.command` from the output.
```

- [ ] **Step 1b: Replace remaining `dev_server.*` references in SKILL.md**

Replace ALL remaining `dev_server.url` -> `devServer.url` and `dev_server.command` -> `devServer.command` placeholder references in fixme-session/SKILL.md. These appear inside fenced code blocks and narrative text at the following lines (verified via `grep -n dev_server`):

- Line 123: `playwright-cli open <dev_server.url>` -> `playwright-cli open <devServer.url>`
- Line 129: `<dev_server.command> &` -> `<devServer.command> &`
- Line 131: `playwright-cli open <dev_server.url>` -> `playwright-cli open <devServer.url>`
- Line 132: `playwright-cli open <dev_server.url>` -> `playwright-cli open <devServer.url>`
- Line 206: `Dev server URL: <dev_server.url from project context>` -> `Dev server URL: <devServer.url from project config>`
- Line 308: `playwright-cli open <dev_server.url>` -> `playwright-cli open <devServer.url>`
- Line 315: `<dev_server.command> &` -> `<devServer.command> &`

After replacing, run:

```bash
grep -n "dev_server" .claude/skills/fixme-session/SKILL.md
```

Expected: zero matches.

- [ ] **Step 2: Update the dispatch prompt in SKILL.md**

Find the fixme-task dispatch template (around line 237). Replace:
```
- Project context: .fixme/project-context.yaml
```
With:
```
- Config: .fixme/config.json
```

- [ ] **Step 3: Update investigation-agent.md**

In [investigation-agent.md](.claude/skills/fixme-session/agents/investigation-agent.md):

Line 17 - Replace:
```
2. **Project context path** -- `.fixme/project-context.yaml` for dev server URL, framework info
```
With:
```
2. **Project config** -- `.fixme/config.json` for dev server URL, framework info
```

Line 35 - Replace:
```
- Read `.fixme/project-context.yaml` for dev server URL
```
With:
```
- Read `.fixme/config.json` and extract `project.devServer.url` for dev server URL
```

- [ ] **Step 3b: Update References pointer in fixme-session/SKILL.md (line 501)**

In [fixme-session/SKILL.md](.claude/skills/fixme-session/SKILL.md), line 501 currently reads:

```
- **Project context format:** See `~/.claude/skills/fixme-tickets-md/references/project-context-schema.md` for the YAML schema, detection sources, and lifecycle rules.
```

Replace it with:

```
- **Project config format:** See `~/.claude/skills/fixme-session/references/config-schema.md` for the `project` section schema, detection sources, and lifecycle rules.
```

This entry must point at config-schema.md (which already documents the migrated `project` section after Task 1) and not at the deprecated project-context-schema.md (which Task 9 reduces to a deprecation stub).

- [ ] **Step 4: Update data-flow.md (yaml -> config.json migration)**

In [data-flow.md](.claude/skills/fixme-session/docs/data-flow.md):

Replace the section header and table at lines 63-73. Change "Project Context (`.fixme/project-context.yaml`)" to "Project Config (`.fixme/config.json` `project` section)". Update field names to camelCase. Note that the Read By columns in this replacement intentionally drop `Fix-Verifier` (it is not a current agent) - those references are handled in Step 4b below by replacing them with the modern equivalents:

```markdown
### 3. Project Config (`.fixme/config.json` `project` section)

| Field | Written By | Read By |
|-------|-----------|---------|
| `project.devServer.url` | `context detect` + user confirmation | SKILL.md (browser setup, passed to agents), Investigation Agent, fixme-browser-verify |
| `project.devServer.command` | `context detect` + user confirmation | SKILL.md (server start) |
| `project.build` | `context detect` + user confirmation | fixme-execute-plan |
| `project.lint` | `context detect` + user confirmation | fixme-execute-plan |
| `project.test` | `context detect` + user confirmation | fixme-execute-plan |
| `project.framework`, `project.devServer.hmr` | `context detect` + user confirmation | Investigation Agent (context) |
```

In the happy-path flow table (lines 297-343), replace all occurrences of `project-context.yaml` with `config.json`. Specifically:
- Line 301: `project-context.yaml` -> `config.json`
- Line 309: `project-context.yaml` -> `config.json`
- Line 315: `project-context.yaml` -> `config.json`

The retry-path flow table (lines 363-372) has no standalone `project-context.yaml` occurrences to point-replace in this step.

**Note:** Lines 333 and 367 are NOT touched in this step - they're inside Fix-Verifier row blocks that Step 4b replaces wholesale with fixme-browser-verify rows containing `config.json`.

In the CLI reference table (lines 436-438), update:
```
| `context detect` | SKILL.md (first run) | Auto-detects project config |
| `context load` | SKILL.md (every start/resume) | Reads config.json project section |
| `context save` | SKILL.md (after user confirmation) | Writes config.json project section |
```

(Note: line 437 in the source currently shows `Fix-Verifier` as a co-caller of `context load`. The Fix-Verifier reference is removed in Step 4b - the replacement table above lists only `SKILL.md (every start/resume)`.)

- [ ] **Step 4b: Clean Fix-Verifier references in data-flow.md (Decision 12)**

Per Decision 12, all `Fix-Verifier` occurrences in data-flow.md must be replaced with the appropriate modern agent (`fixme-browser-verify` for browser contexts, `fixme-execute-plan` for build/lint/test gates) or removed entirely if no modern equivalent exists. The current occurrences (verified via `grep -n "Fix-Verifier" .claude/skills/fixme-session/docs/data-flow.md`) and their replacements:

| Line | Current text fragment | Replacement |
|------|----------------------|-------------|
| 48 | `Fix-Verifier (Phase 5 -- expected/actual behavior)` | `fixme-browser-verify` |
| 49 | `Fix-Verifier (Phase 5 -- repro steps)` | `fixme-browser-verify` |
| 67 | `Fix-Verifier` (in `dev_server.url` Read By) | (already removed in Step 4 by the replacement table above; no separate edit needed) |
| 69 | `Fix-Verifier (Phase 3a)` (build.command Read By) | (already removed in Step 4 by the replacement table above) |
| 70 | `Fix-Verifier (Phase 3b)` (lint.command Read By) | (already removed in Step 4 by the replacement table above) |
| 71 | `Fix-Verifier (Phase 3c)` (test.command Read By) | (already removed in Step 4 by the replacement table above) |
| 88 | Plan File Read By: `Fix-Verifier (Phase 1 + Phase 4 plan coverage)` | `fixme-execute-plan` |
| 96 | Verification Report `Written By: Fix-Verifier (Phase 6, one per attempt)` and `Read By: Fix-Agent (Step 4d -- verdict + failure summary), Fix-Planner (Phase 1 on retry), Fix-Implementer (Phase 1 on re-cycle)` | The entire "### 6. Verification Report" file section (lines 92-96) has no modern equivalent (per-attempt verification report files are not produced in the current pipeline). Remove the entire `### 6. Verification Report (...)` subsection (heading + table). Renumber the subsequent "### 7. Screenshots / Assets" subsection to "### 6. Screenshots / Assets". |
| 102 | `repro-*.png` Read By `Fix-Verifier (comparison reference)` | `fixme-browser-verify (comparison reference)` |
| 104 | `verify-*.png` Written By `Fix-Verifier (Phase 5c)` | `fixme-browser-verify (Phase 5c)` |
| 243 | `### Fix-Verifier` heading | (see lines 243-267 below) |
| 244-267 | The full `### Fix-Verifier` agent-by-agent I/O code block (lines 243-267) | Remove the entire `### Fix-Verifier` subsection (heading, INPUTS/OUTPUTS code block, and the `**State transitions owned:** implementing -> verifying` line at line 267). It describes an agent that no longer exists. The modern split (build/lint/test gates -> `fixme-execute-plan`; browser checks -> `fixme-browser-verify`) is documented in their own SKILL.md files. |
| 330-333 | Step 16 row in happy-path table: `Fix-Verifier ... plans/NNNN-plan-1.md ... verifications/NNNN-verify-1.md ... project-context ...` | Replace the entire 4-line row block with: `16    fixme-browser-verify  plans/NNNN-plan-1.md            assets/verify-*.png            verifying` followed by `                                            ticket.md (repro steps)         (browser verification report)` and `                                            config.json                     in agent return value` and `                                            source files (Read)`. This collapses the verification step to the modern browser-verify agent. |
| 366-368 | Retry-path table step 22: `22    Fix-Verifier       plans/NNNN-plan-2.md           verifications/NNNN-verify-2.md verifying` and the continuation lines `                         ticket.md, project-context     assets/verify-*.png` and `                         browser` | Replace with: `22    fixme-browser-verify  plans/NNNN-plan-2.md            assets/verify-*.png            verifying` and the continuation `                                            ticket.md (repro steps)         (browser verification`  and `                                            config.json                       report in return value)` and `                                            browser` |
| 391 | `Fix-Verifier | Phase 1 | Plan file | Expected changes |` | `fixme-browser-verify | Phase 1 | Plan file | Expected changes |` |
| 392 | `Fix-Verifier | Phase 5 | Ticket file (repro steps, expected/actual) | Browser verification script |` | `fixme-browser-verify | Phase 5 | Ticket file (repro steps, expected/actual) | Browser verification script |` |
| 437 | `\| `context load` | SKILL.md (every start/resume), Fix-Verifier | Reads project-context.yaml |` | `\| `context load` | SKILL.md (every start/resume) | Reads `.fixme/config.json` project section |` |

After applying all replacements, verify zero remaining matches:

```bash
grep -n "Fix-Verifier" .claude/skills/fixme-session/docs/data-flow.md
```

Expected: zero matches.

**Note on other Fix-* references (Fix-Agent, Fix-Researcher, Fix-Planner, Fix-Implementer):** These also exist throughout data-flow.md and describe a sub-coordinator topology that no longer exists in the current pipeline. Decision 12 only authorizes Fix-Verifier cleanup. Do NOT touch Fix-Agent, Fix-Researcher, Fix-Planner, or Fix-Implementer references in this task. They remain a known stale-doc issue to be addressed in a separate plan with explicit user approval.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/fixme-session/SKILL.md .claude/skills/fixme-session/agents/investigation-agent.md .claude/skills/fixme-session/docs/data-flow.md
git commit -m "refactor: update fixme-session to use config.json instead of project-context.yaml"
```

---

### Task 5: Update fixme-task to remove yaml fallback

**Files:**
- Modify: [fixme-task/SKILL.md](.claude/skills/fixme-task/SKILL.md)
- Modify: [.claude/agents/fixme-task.md](.claude/agents/fixme-task.md)

- [ ] **Step 1: Remove yaml fallback from config loading**

In [fixme-task/SKILL.md](.claude/skills/fixme-task/SKILL.md), find line 98:
```
5. **Extract project settings** from config's `project` field. If absent, fall back to `.fixme/project-context.yaml`
```
Replace with:
```
5. **Extract project settings** from config's `project` field. If absent, project settings are unavailable (agents will detect from CLAUDE.md and project files).
```

- [ ] **Step 2: Remove yaml from tool allowlist in SKILL.md**

Find line 148:
```
- **Read** - ONLY on `.fixme/config.json`, `.fixme/plans/*.md`, `.fixme/decisions.md`, `.fixme/project-context.yaml`, or plan files referenced in conversation
```
Replace with:
```
- **Read** - ONLY on `.fixme/config.json`, `.fixme/plans/*.md`, `.fixme/decisions.md`, or plan files referenced in conversation
```

- [ ] **Step 3: Remove yaml from agent definition Read allowlist**

In [.claude/agents/fixme-task.md](.claude/agents/fixme-task.md), find line 15:
```
- NEVER use Read on source code files (only .fixme/config.json, .fixme/plans/*.md, .fixme/decisions.md, .fixme/project-context.yaml)
```
Replace with:
```
- NEVER use Read on source code files (only .fixme/config.json, .fixme/plans/*.md, .fixme/decisions.md)
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-task/SKILL.md .claude/agents/fixme-task.md
git commit -m "refactor: remove project-context.yaml fallback from fixme-task"
```

---

### Task 6: Update fixme-investigate to remove yaml fallback

**Files:**
- Modify: [fixme-investigate/SKILL.md](.claude/skills/fixme-investigate/SKILL.md)

- [ ] **Step 1: Remove yaml from dev server URL resolution**

In [fixme-investigate/SKILL.md](.claude/skills/fixme-investigate/SKILL.md), find lines 23-26:
```
**Dev server URL:** Resolve in order:
1. `.fixme/config.json` field `project.devServer.url`
2. `.fixme/project-context.yaml` field `dev_server.url`
3. Ask the user
```
Replace with:
```
**Dev server URL:** Resolve in order:
1. `.fixme/config.json` field `project.devServer.url`
2. Ask the user
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-investigate/SKILL.md
git commit -m "refactor: remove project-context.yaml fallback from fixme-investigate"
```

---

### Task 7: Update fixme-rebase to use config.json

**Files:**
- Modify: [fixme-rebase/SKILL.md](.claude/skills/fixme-rebase/SKILL.md)

- [ ] **Step 1: Update verification command loading**

In [fixme-rebase/SKILL.md](.claude/skills/fixme-rebase/SKILL.md), find lines 723-725:
```
1. **Load project verification commands:**
   - **First**, check `.fixme/project-context.yaml` for `build.command`, `lint.command`, and `test.command`. If present, use those.
   - **Fallback:** detect from CLAUDE.md, package.json, Makefile, or convention.
```
Replace with:
```
1. **Load project verification commands:**
   - **First**, check `.fixme/config.json` field `project` for `build`, `lint`, and `test.command` (or `test` if it's a string). If present, use those.
   - **Fallback:** detect from CLAUDE.md, package.json, Makefile, or convention.
```

- [ ] **Step 2: Update lockfile install reference**

Find lines 889-891:
```
   If any lockfile changed:
   - Check `.fixme/project-context.yaml` for `install.command`. If present, use it.
   - Otherwise detect from lockfile: `bun.lockb` → `bun install`, `package-lock.json` → `npm install`, `yarn.lock` → `yarn install`, `pnpm-lock.yaml` → `pnpm install`, etc.
```

Replace with:
```
   If any lockfile changed:
   - Detect install command from lockfile: `bun.lockb` → `bun install`, `package-lock.json` → `npm install`, `yarn.lock` → `yarn install`, `pnpm-lock.yaml` → `pnpm install`, `Gemfile.lock` → `bundle install`, `Cargo.lock` → `cargo build`, `go.sum` → `go mod download`, `poetry.lock` → `poetry install`, `composer.lock` → `composer install`.
   - Run the install command and confirm it succeeds before proceeding.
```

The `project.install` field does NOT exist in the config-schema.md `project` section (verified by reading lines 139-145 of `.claude/skills/fixme-session/references/config-schema.md`). Lockfile detection is the sole source of truth - do not introduce a phantom config field.

- [ ] **Step 3: Update commit convention reference**

Find line 911:
```
   - Commit with a message following the project's commit conventions (check CLAUDE.md, recent git log, or `.fixme/project-context.yaml` for the expected format).
```
Replace with:
```
   - Commit with a message following the project's commit conventions (check CLAUDE.md or recent git log for the expected format).
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/fixme-rebase/SKILL.md
git commit -m "refactor: update fixme-rebase to use config.json instead of project-context.yaml"
```

---

### Task 8: Update ticket interface skills

Keep context operations in both the abstract ticket interface and the md backend - they still route correctly since `fixme-tools.cjs` now reads/writes config.json internally. Just update descriptions. The session SKILL.md continues to dispatch context operations through fixme-tickets as before.

**Files:**
- Modify: [fixme-tickets/SKILL.md](.claude/skills/fixme-tickets/SKILL.md)
- Modify: [fixme-tickets-md/SKILL.md](.claude/skills/fixme-tickets-md/SKILL.md)

- [ ] **Step 1: Update context operation descriptions in fixme-tickets**

In [fixme-tickets/SKILL.md](.claude/skills/fixme-tickets/SKILL.md), update the "Context Operations" table descriptions (lines 42-48):

| Operation | Arguments | Description |
|-----------|-----------|-------------|
| `context detect` | _(none)_ | Auto-detect project config (outputs config.json project format) |
| `context load` | _(none)_ | Load project config from `.fixme/config.json` |
| `context save` | `--data '<json>'` | Save project config to `.fixme/config.json` (merges into existing config) |

- [ ] **Step 2: Update fixme-tickets-md context docs**

In [fixme-tickets-md/SKILL.md](.claude/skills/fixme-tickets-md/SKILL.md), find the `context detect`, `context load`, and `context save` documentation (around lines 101-123). Update the descriptions:

For `context detect` (line 107):
Replace: `Scans the project for package.json, framework config files, etc. and outputs a YAML project context.`
With: `Scans the project and outputs a JSON project config object (camelCase keys matching config.json project section).`

For `context load` (line 115):
Replace: `Reads .fixme/project-context.yaml and returns it.`
With: `Reads .fixme/config.json and returns the project section.`

For `context save` (line 123):
Replace: `Writes the provided JSON data as .fixme/project-context.yaml.`
With: `Writes the provided JSON data to the project section of .fixme/config.json, preserving other config keys.`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fixme-tickets/SKILL.md .claude/skills/fixme-tickets-md/SKILL.md
git commit -m "refactor: update ticket skills for config.json context commands"
```

---

### Task 9: Delete project-context-schema.md

The entire schema doc is for the yaml format. Delete it and replace with a pointer to config-schema.md.

**Files:**
- Delete content of: [project-context-schema.md](.claude/skills/fixme-tickets-md/references/project-context-schema.md)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of [project-context-schema.md](.claude/skills/fixme-tickets-md/references/project-context-schema.md) with:

```markdown
# Project Context Schema Reference

**Deprecated.** Project context is now stored in `.fixme/config.json` under the `project` key.

See [config-schema.md](../../fixme-session/references/config-schema.md) for the current schema.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fixme-tickets-md/references/project-context-schema.md
git commit -m "docs: deprecate project-context-schema.md in favor of config-schema.md"
```

---

### Task 10: Update CLAUDE.md

`install.sh` already uses `"$SKILLS_SRC"/fixme*` glob, so `fixme-config` is picked up automatically. No install.sh changes needed.

**Files:**
- Modify: [CLAUDE.md](CLAUDE.md)

- [ ] **Step 1: Add /fixme-config and remove yaml references from CLAUDE.md**

In [CLAUDE.md](CLAUDE.md), insert the new skill into the Skill Suite Layout tree. The anchor is the existing `fixme-ticket/` line at line 78:

Find the line at line 78:
```
  fixme-ticket/             # Create Linear tickets from description or context (standalone)
```

Insert the following block IMMEDIATELY BEFORE that line (i.e. as the new line 78, pushing the existing `fixme-ticket/` block down):
```
  fixme-config/             # Interactive configuration management (standalone)
```

(The Skill Suite Layout tree uses one-line entries with a trailing inline comment - no nested indentation for sub-files. Match that format exactly. Do NOT add a SKILL.md sub-line.)

Add a brief usage note to the `## Commands` section. The anchor is the existing "### fixme-tools.cjs CLI" subsection at line 33. Insert a new subsection IMMEDIATELY BEFORE the `### fixme-tools.cjs CLI` heading, so the order in `## Commands` becomes: Running Tests -> Installing Skills -> **Configuring fixme** (new) -> fixme-tools.cjs CLI.

The new subsection content:
```markdown
### Configuring fixme

```bash
# Interactive setup of pipelines, models, project commands, and Linear backend
/fixme-config
```

Updates `.fixme/config.json` via AskUserQuestion prompts. Auto-detects project commands from package.json on first run. The Linear configuration round runs only when the user selects the Linear backend and requires Linear MCP to be available.
```

Update the Skill Suite Layout tree at line 82 - change:
```
    references/             # state-machine.md, project-context-schema.md
```
To:
```
    references/             # state-machine.md
```

Update the Runtime State Locations section (around line 142) - remove the line:
```
- `.fixme/project-context.yaml` - Detected project configuration (fallback)
```

- [ ] **Step 2: Run install.sh to verify it works**

```bash
./install.sh
```

Expected: completes without errors, `~/.claude/skills/fixme-config/` exists.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add fixme-config to CLAUDE.md"
```

---

### Task 11: Run full test suite and verify

- [ ] **Step 1: Run the test suite**

```bash
node .claude/skills/fixme-tickets-md/scripts/fixme-tools.test.cjs 2>&1 | tail -50
```

Expected: ALL tests pass, including the 5 new context tests from Task 2.

- [ ] **Step 2: Verify no remaining yaml or stale schema references**

Search for any remaining references to `project-context.yaml`, `project-context`, or `project context` (hyphenated and space-separated, case-insensitive) in skill files:

```bash
grep -rE -i "project[- ]context" .claude/skills/ --include="*.md" --include="*.cjs" --exclude=project-context-schema.md
```

Expected: zero matches. The deprecation stub file `project-context-schema.md` is excluded from the search. No SKILL.md or .cjs file should reference `project-context.yaml`, `project-context-schema.md`, or any "Project context" phrasing (I/O block labels, inline prose, etc.).

Also verify no stale Fix-Verifier references remain in data-flow.md:

```bash
grep -n "Fix-Verifier" .claude/skills/fixme-session/docs/data-flow.md
```

Expected: zero matches.

- [ ] **Step 3: Verify install works end-to-end**

```bash
./install.sh
ls ~/.claude/skills/fixme-config/SKILL.md
```
