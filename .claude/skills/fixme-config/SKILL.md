---
name: fixme-config
description: "Interactive configuration for fixme workflows, workflow skills, loop limits, model profiles, project settings, and Linear integration. Creates or updates <fixme-dir>/config.json."
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
argument-hint: "[init]"
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`).

**Short version:** run `node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root` and use the `fixme_dir` field from the JSON output as `<fixme-dir>`. Never use a literal `.fixme/` path in any Bash command, Read/Write/Edit path, or Grep/Glob pattern.

# Fixme Config

Interactive configuration of fixme settings: model profile, workflow selection, workflow skills, loop limits, ticket backend, project commands, and Linear integration. Updates `<fixme-dir>/config.json`.

## Prerequisites

**Linear MCP is required only when the user selects the Linear ticket backend.** If the user picks Linear and any Linear MCP tool call fails with a "tool not found" or connection error, stop the skill immediately and tell the user:

> "Linear MCP is not available. I need it to configure the Linear backend. Please enable it and tell me to continue."

Do NOT fall back to manual entry, do NOT skip the Linear round, do NOT write partial Linear settings. The user must enable Linear MCP first.

If the user selects the markdown backend, Linear MCP is not required and the Linear round is skipped entirely.

## Process

### Step 1: Load current config

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config migrate
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config get
```

`config migrate` is required on every `/fixme-config` run. It creates `<fixme-dir>/config.json` when missing, migrates legacy `pipelines` plus `workflowControls` into unified `workflows`, backfills newly added standard workflows, and preserves existing custom workflows and unknown keys.

Use the `config` object from `config get` as the current config. Do not read and rewrite `config.json` manually.

Parse current values (defaults if not present):
- `models.profile` - model profile for agents (default: absent, meaning `quality`)
- `models.overrides` - per-agent model overrides (default: `{}`)
- `ticketBackend` - ticket backend (default: `fixme-tickets-md`)
- `workflows` - named workflow definitions. Each workflow has `phases` and `outerMaxCycles` (default: absent, meaning standard workflows)
- `project.devServer.url` - dev server URL (default: null)
- `project.devServer.command` - dev server start command (default: null)
- `project.devServer.hmr` - Hot Module Replacement support (default: false)
- `project.install` - dependency install command (default: null)
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
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs context detect
```

Parse the JSON output. This becomes the starting values for the project section in the questions below.

If `project` section already has values, skip detection - use existing values as defaults.

### Step 3: Present settings (Round 1 - Global settings and workflow selection)

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
    question: "Ticket backend?",
    header: "Backend",
    multiSelect: false,
    options: [
      { label: "Markdown (Recommended)", description: "Local markdown files in <fixme-dir>/sessions/" },
      { label: "Linear", description: "Linear issue tracker (requires Linear MCP)" }
    ]
  },
  {
    question: "Which workflow do you want to configure?",
    header: "Workflow",
    multiSelect: false,
    options: [
      { label: "{current/default workflow} (Recommended)", description: "{phase summary, skills, review cycle summary}" },
      { label: "{next configured or standard workflow}", description: "{phase summary}" },
      { label: "{next configured or standard workflow}", description: "{phase summary}" }
    ]
  }
])
```

Map answers:
- Model: "Quality" -> `"quality"`, "Balanced" -> `"balanced"`, "Budget" -> `"budget"`, "Inherit" -> `"inherit"`
- Backend: "Markdown" -> `"fixme-tickets-md"`, "Linear" -> `"fixme-tickets-linear"`
- Workflow: selected label -> `selectedWorkflow`

Workflow option rules:

- A workflow is one named object under `workflows`, for example `default`, `product-spec`, or `idea-to-production`.
- Present configured workflows first, preserving config order.
- Then present standard workflows not already configured: `default`, `full`, `quick`, `product-spec`, `technical-spec`, `plan`, `execute`, `idea-to-production`.
- Put the recommended workflow first. If the user did not name a workflow, recommend `default` when present; otherwise recommend the first configured workflow; otherwise recommend `default`.
- Every option description must summarize the workflow shape: `phase -> phase`, execute skills, review skills, per-phase review cycles, and outer workflow cycles.
- If more workflows exist than fit comfortably in AskUserQuestion, print the full numbered workflow list before the question, show the three most likely choices in AskUserQuestion, and use Other/free-text for a workflow name or number from the printed list.
- This question only selects the workflow to configure now. It does not configure all workflows in one run.

### Step 4: Configure the selected workflow

Use the selected workflow from Step 3. Start from the current configured workflow when it exists. If it is missing and the selected name is a standard workflow, seed it from the standard definition in Pipeline Definitions. If it is missing and not standard, ask the user for phase names and skill names instead of inventing a workflow.

Print the current workflow before asking questions:

```
Workflow selected: {selectedWorkflow}

Phases:
- {phase.name}
  - Execute skills: {phase.skills}
  - Review skills: {phase.review.skills or "none"}
  - Review max cycles: {phase.review.maxCycles or default 3}

Workflow controls:
- Outer max cycles: {workflows[selectedWorkflow].outerMaxCycles or 2}
```

Then configure this workflow only.

#### Step 4a: Configure execute and review skills

Ask one question per phase for execute skills. The first option must always preserve the current value. If the workflow or phase is newly seeded and has no current configured value yet, the first option is `Use standard default (Recommended)` instead.

```
AskUserQuestion([
  {
    question: "Execute skills for {selectedWorkflow}/{phase.name}?",
    header: "Execute Skills",
    multiSelect: false,
    options: [
      { label: "Keep current (Recommended)", description: "{current phase.skills}" },
      { label: "Use standard default", description: "{standard phase.skills if available}" },
      { label: "Disable phase", description: "Set enabled=false for this phase" }
    ]
  }
])
```

Use the platform-provided Other/free-text answer for custom skills:

- Accept comma-separated skill names, for example `fixme-write-plan, fixme-custom-review`.
- Trim whitespace and preserve order.
- Empty free-text means "Keep current".
- Warn on unknown skill names during validation, but do not block.

For each phase that currently has a review loop or has one in the standard workflow, ask one question for review skills. The first option must preserve the current value when one exists; otherwise the first option must use the standard default.

```
AskUserQuestion([
  {
    question: "Review skills for {selectedWorkflow}/{phase.name}?",
    header: "Review Skills",
    multiSelect: false,
    options: [
      { label: "Keep current (Recommended)", description: "{current review.skills or 'no review loop'}" },
      { label: "Use standard default", description: "{standard review.skills if available}" },
      { label: "No review loop", description: "Remove the review block for this phase" }
    ]
  }
])
```

Use Other/free-text for custom review skills with the same comma-separated parsing rules. If the user chooses "No review loop", remove the entire `review` object for that phase.

#### Step 4b: Configure cycle limits

Ask for each review loop's `maxCycles` separately. There can be several review cycle limits in a single workflow because each phase can have its own review loop. The first option keeps the current value when one exists; otherwise it uses the standard suggestion.

For every phase with a review loop after Step 4a:

```
AskUserQuestion([
  {
    question: "Review cycles for {selectedWorkflow}/{phase.name}?",
    header: "Review Cycles",
    multiSelect: false,
    options: [
      { label: "Keep current (Recommended)", description: "Currently {current maxCycles or default 3}" },
      { label: "{standard suggestion}", description: "Use the standard value for this workflow phase" },
      { label: "1", description: "One review pass before escalation" },
      { label: "2", description: "Two review passes before escalation" },
      { label: "3", description: "Three review passes before escalation" }
    ]
  }
])
```

Standard suggestions:

- Product specification review: `3`
- Technical specification review: `3`
- Plan review: `3`
- Code review / implement review: `2`
- Custom review phase: `3`

Use Other/free-text for any positive integer. Empty free-text means "Keep current".

Then ask for the workflow outer loop limit. The first option keeps the current value when one exists; otherwise it uses the standard `2` suggestion.

```
AskUserQuestion([
  {
    question: "Outer workflow cycles for {selectedWorkflow}?",
    header: "Outer Cycles",
    multiSelect: false,
    options: [
      { label: "Keep current (Recommended)", description: "Currently {workflows[selectedWorkflow].outerMaxCycles or 2}" },
      { label: "2", description: "Standard default: two cross-phase retries before escalation" },
      { label: "1", description: "Escalate after one cross-phase retry" },
      { label: "3", description: "Allow three cross-phase retries before escalation" }
    ]
  }
])
```

Use Other/free-text for any positive integer. Empty free-text means "Keep current". Store the result at `workflows[selectedWorkflow].outerMaxCycles`.

#### Step 4c: Stage workflow update

Stage only the selected workflow:

- `workflows[selectedWorkflow].phases = staged workflow phases`
- `workflows[selectedWorkflow].outerMaxCycles = staged outer cycle limit`

Preserve all other workflows exactly as they were.

### Step 5: Present settings (Round 2 - Project commands)

Display the auto-detected or existing values in a table first:

```
Detected project settings:
| Setting           | Value                    |
|-------------------|--------------------------|
| Framework         | {framework or 'unknown'} |
| Dev server URL    | {url or 'not set'}       |
| Dev server cmd    | {command or 'not set'}   |
| Install command   | {install or 'not set'}   |
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

**Step 5a - Identify which settings to change.** All 8 settings listed explicitly across 2 multi-select questions. Test command and test runner are ALWAYS separate items:

```
AskUserQuestion([
  {
    question: "Which server/build settings need adjustment?",
    header: "Server & Build",
    multiSelect: true,
    options: [
      { label: "Dev server URL", description: "Currently: {url or 'not set'}" },
      { label: "Dev server command", description: "Currently: {command or 'not set'}" },
      { label: "Install command", description: "Currently: {install or 'not set'}" },
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

**Step 5b - Collect new values.** Present AskUserQuestion calls (up to 4 questions each) with one question per setting selected in Step 5a. Each selected setting gets its own dedicated question - never merge multiple settings into one question.

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

### Step 6: Linear discovery round (conditional)

**Run this round ONLY if the Backend answer in Step 3 was "Linear" (`fixme-tickets-linear`). Skip entirely otherwise.**

This round configures ONLY `linear.teamId` and `linear.teamName`. Labels and project defaults are NOT written by fixme-config - users who want them can hand-edit config.json, and fixme-ticket handles per-ticket label/project selection at creation time.

#### Step 6a: Discover and select team (Decision 13 hybrid flow)

Call `mcp__claude_ai_Linear__list_teams` with no filters.

**If the call fails** with "tool not found", a connection error, or any error indicating Linear MCP is not available, STOP the skill immediately and report:

> "Linear MCP is not available. I need it to configure the Linear backend. Please enable it and tell me to continue."

Do NOT proceed. Do NOT write any Linear fields. Do NOT save the config.

**If the call succeeds**, parse the response into an array of `{ id, name, key }` objects. Preserve the order returned by the API as the canonical discovered list.

Branch on team count:

**Zero teams returned:** STOP the skill and report:

> "No Linear teams visible to this MCP connection. Please create or grant access to at least one team in Linear, then run /fixme-config again."

Do NOT proceed. Do NOT write any Linear fields.

**Exactly one team returned:** Use it automatically. Set `selectedTeam = teams[0]`. Print `Using Linear team: {name} ({key})`. Proceed to Step 6b.

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

#### Step 6b: Stage Linear values

After Step 6a resolves `selectedTeam`, hold these values in memory for the merge in Step 8:

- `linear.teamId` = `selectedTeam.id`
- `linear.teamName` = `selectedTeam.name`

No other Linear fields are staged. `linear.defaultLabels` and `linear.defaultProject` are NOT configured by this skill (Decision 13).

### Step 7: Validate

Before writing, validate the config:

1. **Model profile** must be one of: `quality`, `balanced`, `budget`, `inherit`
2. **Model overrides** values must be one of: `opus`, `sonnet`, `haiku`, `inherit`
3. **Workflow phases** must have unique `name` values within each workflow
4. **Workflow skills** should reference known fixme skill names (warn on unknown, don't block)
5. **Review config** `maxCycles` must be a positive integer if present
6. **Workflow outer loop** `workflows.<workflow>.outerMaxCycles` must be a positive integer if present
7. **Ticket backend** must be one of: `fixme-tickets-md`, `fixme-tickets-linear`
8. **Linear fields** (only if backend is `fixme-tickets-linear`):
   - `linear.teamId` must be a non-empty string
   - `linear.teamName` must be a non-empty string

If validation fails, display errors and re-prompt for the specific invalid settings.

### Step 8: Write config

All writes to `<fixme-dir>/config.json` must go through `fixme-tools.cjs`. Do not use the Write tool for config JSON. The CLI is the schema gate, migration owner, merge owner, and atomic writer.

Write global settings:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set models.profile '<json-string>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set ticketBackend '<json-string>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs context save --data '<project-json-object>'
```

Use JSON-encoded values inside the shell quotes. Examples:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set models.profile '"balanced"'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set ticketBackend '"fixme-tickets-md"'
```

Write the selected workflow only:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config workflow configure <selectedWorkflow> --data '<workflow-json-object>'
```

`<workflow-json-object>` must have this shape:

```json
{
  "phases": [ ...staged_workflow_phases ],
  "outerMaxCycles": <positive integer>
}
```

When backend is `fixme-tickets-linear`, write the resolved Linear team:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set linear.teamId '<json-string>'
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config set linear.teamName '<json-string>'
```

When backend is `fixme-tickets-md`, leave the existing `linear` object untouched - do not delete or overwrite it.

Write rules:

- Run `config migrate` before writing if it was not already run in Step 1.
- Do not rewrite all standard workflow definitions just because one workflow was configured.
- Do not delete unknown fields under other workflow names.
- If the selected workflow has only standard defaults and the user kept every default, still call `config workflow configure` for that selected workflow so future `/fixme-config` runs can show it as configured.
- If any CLI write returns JSON with an `error` field or exits non-zero, stop and show that exact error. Do not continue with partial settings.

### Step 9: Confirm

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FIXME CONFIG UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value                    |
|----------------------|--------------------------|
| Model Profile        | {quality/balanced/budget/inherit} |
| Configured Workflow  | {selectedWorkflow}       |
| Outer Max Cycles     | {workflows[selectedWorkflow].outerMaxCycles} |
| Ticket Backend       | {fixme-tickets-md/linear}|
| Framework            | {value}                  |
| Dev Server URL       | {value}                  |
| Dev Server Command   | {value}                  |
| Build Command        | {value}                  |
| Test Command         | {value}                  |
| Lint Command         | {value}                  |
```

Then print the selected workflow detail:

```
Workflow phases:
- {phase.name}: execute={phase.skills}; review={phase.review.skills or "none"}; maxCycles={phase.review.maxCycles or "n/a"}
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

When seeding a missing standard workflow or offering "Use standard default", use these definitions. Each standard workflow also has this workflow-level default:

```json
{ "outerMaxCycles": 2 }
```

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

**product-spec:**
```json
[
  { "name": "product-spec", "skills": ["fixme-write-product-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } }
]
```

**technical-spec:**
```json
[
  { "name": "technical-spec", "skills": ["fixme-write-technical-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } }
]
```

**plan:**
```json
[
  { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } }
]
```

**execute:**
```json
[
  { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 2 } }
]
```

**idea-to-production:**
```json
[
  { "name": "product-spec", "skills": ["fixme-write-product-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } },
  { "name": "technical-spec", "skills": ["fixme-write-technical-spec"], "review": { "skills": ["fixme-review-spec", "fixme-handle-spec-review"], "maxCycles": 3 } },
  { "name": "plan", "skills": ["fixme-write-plan"], "review": { "skills": ["fixme-review-plan", "fixme-handle-plan-review"], "maxCycles": 3 } },
  { "name": "implement", "skills": ["fixme-execute-plan"], "review": { "skills": ["fixme-review-code", "fixme-handle-code-review"], "maxCycles": 2 } }
]
```
