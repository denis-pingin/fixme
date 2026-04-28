---
name: fixme-config
description: "Interactive configuration for fixme pipelines, model profiles, project settings, and Linear integration. Creates or updates <fixme-dir>/config.json."
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
argument-hint: "[init]"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`).

**Short version:** run `node ~/.claude/skills/fixme-tickets-md/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output as `<fixme-dir>`. Never use a literal `.fixme/` path in any Bash command, Read/Write/Edit path, or Grep/Glob pattern.

# Fixme Config

Interactive configuration of fixme settings: model profile, pipeline selection, ticket backend, project commands, and Linear integration. Updates `<fixme-dir>/config.json`.

## Prerequisites

**Linear MCP is required only when the user selects the Linear ticket backend.** If the user picks Linear and any Linear MCP tool call fails with a "tool not found" or connection error, stop the skill immediately and tell the user:

> "Linear MCP is not available. I need it to configure the Linear backend. Please enable it and tell me to continue."

Do NOT fall back to manual entry, do NOT skip the Linear round, do NOT write partial Linear settings. The user must enable Linear MCP first.

If the user selects the markdown backend, Linear MCP is not required and the Linear round is skipped entirely.

## Process

### Step 1: Load current config

```bash
cat <fixme-dir>/config.json 2>/dev/null || echo '{}'
```

Parse current values (defaults if not present):
- `models.profile` - model profile for agents (default: absent, meaning `quality`)
- `models.overrides` - per-agent model overrides (default: `{}`)
- `ticketBackend` - ticket backend (default: `fixme-tickets-md`)
- `pipelines` - named pipeline definitions (default: absent, meaning hardcoded `default` pipeline)
- `project.devServer.url` - dev server URL (default: null)
- `project.devServer.command` - dev server start command (default: null)
- `project.devServer.hmr` - Hot Module Replacement support (default: false)
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
      { label: "Markdown (Recommended)", description: "Local markdown files in <fixme-dir>/sessions/" },
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
| Hot Module Reload  | {hmr}                    |
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

If "I need to adjust": collect corrections in two steps.

**Step 4a - Identify which settings to change.** All 8 settings listed explicitly across 2 multi-select questions. Test command and test runner are ALWAYS separate items:

```
AskUserQuestion([
  {
    question: "Which server/build settings need adjustment?",
    header: "Server & Build",
    multiSelect: true,
    options: [
      { label: "Dev server URL", description: "Currently: {url or 'not set'}" },
      { label: "Dev server command", description: "Currently: {command or 'not set'}" },
      { label: "Build command", description: "Currently: {build or 'not set'}" },
      { label: "Hot Module Replacement", description: "Currently: {hmr}" }
    ]
  },
  {
    question: "Which test/lint/framework settings need adjustment?",
    header: "Test & Lint",
    multiSelect: true,
    options: [
      { label: "Test command", description: "Currently: {test.command or 'not set'}" },
      { label: "Test runner", description: "Currently: {test.runner or 'unknown'}" },
      { label: "Lint command", description: "Currently: {lint or 'not set'}" },
      { label: "Framework", description: "Currently: {framework or 'unknown'}" }
    ]
  }
])
```

**Step 4b - Collect new values.** Present AskUserQuestion calls (up to 4 questions each) with one question per setting selected in Step 4a. Each selected setting gets its own dedicated question - never merge multiple settings into one question.

Text settings (all except Hot Module Replacement) show the current value as first option plus "Not set" to clear:

```
{
  question: "Test command?",
  header: "Test",
  multiSelect: false,
  options: [
    { label: "{current test.command or 'not set'}", description: "Keep current" },
    { label: "Not set", description: "Clear this setting" }
  ]
}
```

Hot Module Replacement uses Yes/No:

```
{
  question: "Hot Module Replacement?",
  header: "Hot Module Replacement",
  multiSelect: false,
  options: [
    { label: "Yes", description: "Dev server supports Hot Module Replacement" },
    { label: "No", description: "No Hot Module Replacement support" }
  ]
}
```

### Step 5: Linear discovery round (conditional)

**Run this round ONLY if the Backend answer in Round 1 was "Linear" (`fixme-tickets-linear`). Skip entirely otherwise.**

This round configures ONLY `linear.teamId` and `linear.teamName`. Labels and project defaults are NOT written by fixme-config - users who want them can hand-edit config.json, and fixme-ticket handles per-ticket label/project selection at creation time.

#### Step 5a: Discover and select team (Decision 13 hybrid flow)

Call `mcp__claude_ai_Linear__list_teams` with no filters.

**If the call fails** with "tool not found", a connection error, or any error indicating Linear MCP is not available, STOP the skill immediately and report:

> "Linear MCP is not available. I need it to configure the Linear backend. Please enable it and tell me to continue."

Do NOT proceed. Do NOT write any Linear fields. Do NOT save the config.

**If the call succeeds**, parse the response into an array of `{ id, name, key }` objects. Preserve the order returned by the API as the canonical discovered list.

Branch on team count:

**Zero teams returned:** STOP the skill and report:

> "No Linear teams visible to this MCP connection. Please create or grant access to at least one team in Linear, then run /fixme-config again."

Do NOT proceed. Do NOT write any Linear fields.

**Exactly one team returned:** Use it automatically. Set `selectedTeam = teams[0]`. Print `Using Linear team: {name} ({key})`. Proceed to Step 5b.

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

#### Step 5b: Stage Linear values

After Step 5a resolves `selectedTeam`, hold these values in memory for the merge in Step 7:

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

Write to `<fixme-dir>/config.json`:

```bash
mkdir -p <fixme-dir>
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
Config saved to <fixme-dir>/config.json
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
