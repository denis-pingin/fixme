#!/usr/bin/env node

'use strict';

/**
 * Tests for fixme-tools.cjs: ticket-centric directory layout
 *
 * Run: node ~/.claude/skills/fixme-tools/scripts/fixme-tools.test.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const TOOLS_PATH = path.join(__dirname, 'fixme-tools.cjs');
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const {
  buildTransitionsFromPhases,
  findFixmeRoot,
  STANDARD_PIPELINES,
  defaultReviewCyclesForPhase,
} = require(TOOLS_PATH);

let passed = 0;
let failed = 0;
let tmpDirs = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function isPlainObjectForTest(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
  }
}

function run(args) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    const stdout = result;
    let data = null;
    try { data = JSON.parse(result.trim()); } catch (_) {}
    return { ok: true, data, stdout };
  } catch (e) {
    const stdout = e.stdout ? e.stdout.trim() : '';
    let data = null;
    try { data = JSON.parse(stdout); } catch (_) {}
    return { ok: false, data, stderr: e.stderr || '', exitCode: e.status };
  }
}

function runInDir(args, cwd) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, {
      encoding: 'utf8',
      timeout: 5000,
      cwd: cwd,
    });
    return { ok: true, data: JSON.parse(result.trim()) };
  } catch (e) {
    const stdout = e.stdout ? e.stdout.trim() : '';
    let data = null;
    try { data = JSON.parse(stdout); } catch (_) {}
    return { ok: false, data, stderr: e.stderr || '', exitCode: e.status };
  }
}

function cliErrorMessage(result) {
  const cliError = result.data?.error;
  if (typeof cliError === 'string') return cliError;
  if (cliError && typeof cliError.message === 'string') return cliError.message;
  if (cliError) return JSON.stringify(cliError);
  return result.stderr || result.stdout || '';
}

function pipelineResolutionFlag(pipeline, fields = {}) {
  const resolution = {
    pipeline,
    source: 'explicitPipelineArg',
    evidence: `--pipeline ${pipeline}`,
    reason: 'Test supplies the selected workflow explicitly.',
    ...fields,
  };
  return `--pipeline-resolution '${JSON.stringify(resolution)}'`;
}

function runToolPath(toolPath, args, options = {}) {
  try {
    const result = execSync(`node "${toolPath}" ${args}`, {
      encoding: 'utf8',
      timeout: options.timeout || 5000,
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
    });
    return { ok: true, data: JSON.parse(result.trim()) };
  } catch (e) {
    const stdout = e.stdout ? e.stdout.trim() : '';
    let data = null;
    try { data = JSON.parse(stdout); } catch (_) {}
    return { ok: false, data, stderr: e.stderr || '', exitCode: e.status };
  }
}

function runToolPathWithInput(toolPath, args, input, options = {}) {
  try {
    const result = execSync(`node "${toolPath}" ${args}`, {
      encoding: 'utf8',
      timeout: options.timeout || 5000,
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      input,
    });
    return { ok: true, data: JSON.parse(result.trim()) };
  } catch (e) {
    const stdout = e.stdout ? e.stdout.trim() : '';
    let data = null;
    try { data = JSON.parse(stdout); } catch (_) {}
    return { ok: false, data, stderr: e.stderr || '', exitCode: e.status };
  }
}

function runInDirWithEnv(args, cwd, env = {}) {
  return runToolPath(TOOLS_PATH, args, { cwd, env });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFixture(dir, name, value) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
  return filePath;
}

function assertNoSnakeCaseKeys(value, label, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSnakeCaseKeys(item, label, pathParts.concat(String(index))));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const currentPath = pathParts.concat(key).join('.');
    assert(!key.includes('_'), `${label} should use camelCase JSON keys, found ${currentPath}`);
    assertNoSnakeCaseKeys(child, label, pathParts.concat(key));
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function createUsageWorkspace() {
  const projectRoot = createTmpDir();
  const homeDir = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, '.fixme', 'config.json'), '{}\n');
  return {
    projectRoot,
    homeDir,
    fixmeDir: path.join(projectRoot, '.fixme'),
    env: {
      HOME: homeDir,
      CODEX_SESSION_FILE: '',
      CODEX_SQLITE_HOME: '',
      CODEX_THREAD_ID: '',
      CLAUDE_CODE_SESSION_ID: '',
      CLAUDE_TRANSCRIPT_PATH: '',
      FIXME_USAGE_SOURCE_PATH: '',
    },
    projectEvents: path.join(projectRoot, '.fixme', 'usage', 'events.jsonl'),
    globalEvents: path.join(homeDir, '.fixme', 'usage', 'events.jsonl'),
  };
}

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-test-'));
  tmpDirs.push(dir);
  return dir;
}

function withHomeDir(homeDir, fn) {
  const previousHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return fn();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
}

function createCodexLinkedWorktreeFixture(config = {}) {
  const homeDir = fs.realpathSync(createTmpDir());
  const workspace = fs.realpathSync(createTmpDir());
  const fixmeDir = path.join(workspace, '.fixme');
  const primaryRoot = path.join(workspace, 'alpha-2');
  const gitDir = path.join(primaryRoot, '.git');
  const worktreeGitDir = path.join(gitDir, 'worktrees', 'codex-alpha-2');
  const codexRoot = path.join(homeDir, '.codex', 'worktrees', 'c392', 'alpha-2');

  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    subRepos: ['alpha-2'],
    ...config,
  }));
  fs.mkdirSync(worktreeGitDir, { recursive: true });
  fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n');
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.writeFileSync(path.join(codexRoot, '.git'), `gitdir: ${worktreeGitDir}\n`);
  fs.mkdirSync(path.join(codexRoot, '.fixme'), { recursive: true });

  return {
    homeDir,
    workspace,
    fixmeDir,
    primaryRoot,
    codexRoot,
  };
}

function createObsoleteSubReposCwd() {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    sub_repos: ['frontend'],
  }, null, 2));
  const cwd = path.join(workspace, 'frontend');
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}

function writeProjectConfig(baseDir, config) {
  const fixmeDir = path.join(baseDir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

function readProjectConfig(baseDir) {
  return JSON.parse(fs.readFileSync(path.join(baseDir, '.fixme', 'config.json'), 'utf8'));
}

function phaseNames(workflow) {
  return workflow.phases.map(phase => phase.name).join(' -> ');
}

function workflowWithPhases(phases, extra = {}) {
  return {
    outerMaxCycles: extra.outerMaxCycles || 2,
    ...extra,
    phases,
  };
}

function createAgentFile(agentsDir, name, description, body) {
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, `${name}.md`), `---
name: ${name}
description: ${description}
tools: Read, Write, Bash
skills:
  - ${name}
effort: high
---

${body}
`);
}

function createSkillFile(skillsDir, name, body) {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: ${name}
description: Test ${name}
---

${body}
`);
  return skillDir;
}

function createPipelineConfig(baseDir) {
  const fixmeDir = path.join(baseDir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    workflows: {
      standard: {
        outerMaxCycles: 2,
        phases: [
          { name: 'plan', skills: ['fixme-write-plan'], review: { readiness: 'fixme-plan-readiness', skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
          { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 } }
        ]
      },
      bugfix: {
        outerMaxCycles: 2,
        phases: [
          { name: 'investigate', skills: ['fixme-investigate'] },
          { name: 'research', skills: ['fixme-research'] },
          { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
          { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 } },
          { name: 'verify', skills: ['fixme-browser-verify'] }
        ]
      },
      full: {
        outerMaxCycles: 2,
        phases: [
          { name: 'product-spec', skills: ['fixme-write-product-spec'], review: { skills: ['fixme-review-spec', 'fixme-handle-spec-review'], maxCycles: 3 } },
          { name: 'technical-spec', skills: ['fixme-write-technical-spec'], review: { skills: ['fixme-review-spec', 'fixme-handle-spec-review'], maxCycles: 3 } },
          { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
          { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 } },
          { name: 'verify', skills: ['fixme-browser-verify'] }
        ]
      }
    }
  }, null, 2));
  return fixmeDir;
}

function createObsoletePipelineConfig(baseDir) {
  const fixmeDir = path.join(baseDir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    pipelines: {
      default: [
        { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
        { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 } }
      ],
      full: [
        { name: 'investigate', skills: ['fixme-investigate'] },
        { name: 'research', skills: ['fixme-research'] },
        { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
        { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 } },
        { name: 'verify', skills: ['fixme-browser-verify'] }
      ]
    },
    workflowControls: {
      default: { outerMaxCycles: 2 },
      full: { outerMaxCycles: 2 }
    }
  }, null, 2));
  return fixmeDir;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function makeTicketContent(number, slug, state) {
  const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `---
number: "${number}"
slug: "${slug}"
session: "test-session"
state: ${state}
created: "2026-02-20T10:00:00Z"
updated: "2026-02-20T10:00:00Z"
url:
commit_hash:
failure_reason:
related: []
max_attempts: 3
current_attempt: 0
files_changed: []
transitions: []
durations: {}
---

# ${number}: ${title}

## Original Report

Test report content.
`;
}

/**
 * Create a ticket folder with ticket.md in the new layout.
 * Returns the path to ticket.md.
 */
function createTicketFolder(sessionDir, number, slug, state) {
  const folderName = `${number}-${slug}`;
  const ticketDir = path.join(sessionDir, folderName);
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'research'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'plans'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'verifications'), { recursive: true });
  const ticketPath = path.join(ticketDir, 'ticket.md');
  fs.writeFileSync(ticketPath, makeTicketContent(number, slug, state));
  return ticketPath;
}

function setTicketFrontmatterField(ticketPath, key, value) {
  const content = fs.readFileSync(ticketPath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert(match, 'ticket should have YAML frontmatter');

  const lines = match[1].split('\n');
  const nextLine = `${key}: ${value}`;
  const index = lines.findIndex(line => line.startsWith(`${key}:`));
  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    lines.push(nextLine);
  }

  fs.writeFileSync(ticketPath, content.replace(match[0], `---\n${lines.join('\n')}\n---\n`));
}

function readTicketFrontmatterLines(ticketPath) {
  const content = fs.readFileSync(ticketPath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert(match, 'ticket should have YAML frontmatter');
  return match[1].split('\n');
}

function cleanup() {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

const REPO_CONFIG_PATH = path.join(__dirname, '..', '..', '..', '..', '.fixme', 'config.json');
test('config test command points at the real fixme-tools test file', () => {
  if (!fs.existsSync(REPO_CONFIG_PATH)) {
    // Running from an installed copy (~/.claude/skills/fixme-tools/scripts):
    // the four-`..` repo-root path resolves to ~/.claude/.fixme/config.json, which does not exist.
    // The source-tree assertion below is the real check; skip cleanly when not in the source tree.
    console.log(`  (skipped: repo config not found at ${REPO_CONFIG_PATH}; running from an installed copy)`);
    return;
  }
  const config = JSON.parse(fs.readFileSync(REPO_CONFIG_PATH, 'utf8'));
  assert(config.project && config.project.test, 'config.project.test must exist');
  assert(
    config.project.test.command === 'node .claude/skills/fixme-tools/scripts/fixme-tools.test.cjs',
    `project.test.command must point at the real suite, got ${config.project.test.command}`
  );
});

// ============================================================================
// Test Suite: ticket create (new layout)
// ============================================================================

console.log('\n=== ticket create tests (ticket-centric layout) ===\n');

test('create: produces NNNN-slug/ticket.md with subdirectories', () => {
  const base = createTmpDir();
  // Create a session first
  const sessionResult = run(`session create "${base}" --name test-session`);
  assert(sessionResult.ok, `Session create failed: ${JSON.stringify(sessionResult.data)}`);
  const sessionDir = sessionResult.data.path;

  const result = run(`ticket create "${sessionDir}" --slug my-bug`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.number === '0001', `number should be 0001, got ${result.data.number}`);
  assert(result.data.slug === 'my-bug', `slug should be my-bug, got ${result.data.slug}`);
  assert(result.data.state === 'queued', `state should be queued, got ${result.data.state}`);
  assert(result.data.dir !== undefined, 'Should have dir field');

  // Check ticket.md exists in folder
  const ticketPath = result.data.path;
  assert(ticketPath.endsWith('/0001-my-bug/ticket.md'), `path should end with 0001-my-bug/ticket.md, got ${ticketPath}`);
  assert(fs.existsSync(ticketPath), 'ticket.md should exist');

  // Check subdirectories
  const ticketDir = result.data.dir;
  assert(fs.existsSync(path.join(ticketDir, 'assets')), 'assets/ should exist');
  assert(fs.existsSync(path.join(ticketDir, 'research')), 'research/ should exist');
  assert(fs.existsSync(path.join(ticketDir, 'plans')), 'plans/ should exist');
  assert(fs.existsSync(path.join(ticketDir, 'verifications')), 'verifications/ should exist');
});

test('create: sequential numbering works', () => {
  const base = createTmpDir();
  const sessionResult = run(`session create "${base}" --name test-session`);
  const sessionDir = sessionResult.data.path;

  const r1 = run(`ticket create "${sessionDir}" --slug first-bug`);
  assert(r1.ok && r1.data.number === '0001', 'First ticket should be 0001');

  const r2 = run(`ticket create "${sessionDir}" --slug second-bug`);
  assert(r2.ok && r2.data.number === '0002', `Second ticket should be 0002, got ${r2.data.number}`);

  const r3 = run(`ticket create "${sessionDir}" --slug third-bug`);
  assert(r3.ok && r3.data.number === '0003', `Third ticket should be 0003, got ${r3.data.number}`);
});

test('create: session no longer has tickets/ or assets/ dirs', () => {
  const base = createTmpDir();
  const sessionResult = run(`session create "${base}" --name test-session`);
  const sessionDir = sessionResult.data.path;

  assert(!fs.existsSync(path.join(sessionDir, 'tickets')), 'tickets/ should NOT exist');
  assert(!fs.existsSync(path.join(sessionDir, 'assets')), 'assets/ should NOT exist');
  assert(fs.existsSync(path.join(sessionDir, 'session.md')), 'session.md should exist');
});

// ============================================================================
// Test Suite: ticket list (new layout)
// ============================================================================

console.log('\n=== ticket list tests (ticket-centric layout) ===\n');

test('list: scans NNNN-slug/ticket.md folders', () => {
  const sessionDir = createTmpDir();
  fs.writeFileSync(path.join(sessionDir, 'session.md'), '---\nname: test\n---\n');
  createTicketFolder(sessionDir, '0001', 'bug-a', 'queued');
  createTicketFolder(sessionDir, '0002', 'bug-b', 'plan');

  const result = run(`ticket list "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.length === 2, `Should have 2 tickets, got ${result.data.length}`);
  assert(result.data[0].number === '0001', 'First ticket should be 0001');
  assert(result.data[0].dir !== undefined, 'Should have dir field');
  assert(result.data[0].path.endsWith('/ticket.md'), 'path should end with ticket.md');
  assert(result.data[1].number === '0002', 'Second ticket should be 0002');
});

test('list: filters by state', () => {
  const sessionDir = createTmpDir();
  fs.writeFileSync(path.join(sessionDir, 'session.md'), '---\nname: test\n---\n');
  createTicketFolder(sessionDir, '0001', 'bug-a', 'queued');
  createTicketFolder(sessionDir, '0002', 'bug-b', 'plan');
  createTicketFolder(sessionDir, '0003', 'bug-c', 'queued');

  const result = run(`ticket list "${sessionDir}" --state queued`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.length === 2, `Should have 2 queued tickets, got ${result.data.length}`);
});

test('list: empty session returns empty array', () => {
  const sessionDir = createTmpDir();
  fs.writeFileSync(path.join(sessionDir, 'session.md'), '---\nname: test\n---\n');

  const result = run(`ticket list "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.length === 0, `Should have 0 tickets, got ${result.data.length}`);
});

// ============================================================================
// Test Suite: ticket next (new layout)
// ============================================================================

console.log('\n=== ticket next tests (ticket-centric layout) ===\n');

test('next: returns first queued ticket', () => {
  const sessionDir = createTmpDir();
  createTicketFolder(sessionDir, '0001', 'bug-a', 'plan');
  createTicketFolder(sessionDir, '0002', 'bug-b', 'queued');
  createTicketFolder(sessionDir, '0003', 'bug-c', 'queued');

  const result = run(`ticket next "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.number === '0002', `Should return 0002, got ${result.data.number}`);
  assert(result.data.path.endsWith('/ticket.md'), 'path should end with ticket.md');
  assert(result.data.dir !== undefined, 'Should have dir field');
});

test('next: returns null when no queued tickets', () => {
  const sessionDir = createTmpDir();
  createTicketFolder(sessionDir, '0001', 'bug-a', 'plan');

  const result = run(`ticket next "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.path === null, 'path should be null');
});

// ============================================================================
// Test Suite: ticket rename (new layout -- renames parent directory)
// ============================================================================

console.log('\n=== ticket rename tests (ticket-centric layout) ===\n');

test('rename: renames ticket folder and updates frontmatter', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'intake-tmp-a7b3', 'queued');

  const result = run(`ticket rename "${ticketPath}" --slug login-button-broken`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.oldSlug === 'intake-tmp-a7b3', `oldSlug should be intake-tmp-a7b3, got ${result.data.oldSlug}`);
  assert(result.data.newSlug === 'login-button-broken', `newSlug should be login-button-broken, got ${result.data.newSlug}`);
  assert(result.data.number === '0003', `number should be 0003, got ${result.data.number}`);
  assert(result.data.title === 'Login Button Broken', `title should be Login Button Broken, got ${result.data.title}`);

  // Old folder should be gone, new folder should exist
  assert(!fs.existsSync(path.join(sessionDir, '0003-intake-tmp-a7b3')), 'Old folder should not exist');
  const newDir = path.join(sessionDir, '0003-login-button-broken');
  assert(fs.existsSync(newDir), 'New folder should exist');
  assert(fs.existsSync(path.join(newDir, 'ticket.md')), 'ticket.md should exist in new folder');
  assert(fs.existsSync(path.join(newDir, 'assets')), 'assets/ should exist in new folder');

  // Check frontmatter updated
  const content = fs.readFileSync(path.join(newDir, 'ticket.md'), 'utf8');
  assert(content.includes('slug: login-button-broken'), 'Frontmatter slug should be updated');
  assert(content.includes('# 0003: Login Button Broken'), 'Heading should be updated');
});

test('rename: slug with special chars gets sanitized', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'foo', 'queued');

  const result = run(`ticket rename "${ticketPath}" --slug "Hello World!!!"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.newSlug === 'hello-world', `newSlug should be hello-world, got ${result.data.newSlug}`);

  const newDir = path.join(sessionDir, '0003-hello-world');
  assert(fs.existsSync(newDir), 'Sanitized folder should exist');
  assert(fs.existsSync(path.join(newDir, 'ticket.md')), 'ticket.md should exist');
});

test('rename: empty slug after sanitization errors', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'foo', 'queued');

  const result = run(`ticket rename "${ticketPath}" --slug "!!!"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('empty after sanitization'), `Error should mention empty: ${result.data.error}`);
});

test('rename: nonexistent file errors', () => {
  const result = run(`ticket rename "/tmp/nonexistent-ticket-xyz/ticket.md" --slug "x"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('not found'), `Error should mention not found: ${result.data.error}`);
});

test('rename: missing --slug errors', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'foo', 'queued');

  const result = run(`ticket rename "${ticketPath}"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('--slug'), `Error should mention --slug: ${result.data.error}`);
});

test('rename: unchanged slug updates frontmatter without folder rename', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'hello-world', 'queued');

  const result = run(`ticket rename "${ticketPath}" --slug "hello-world"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.oldDir === result.data.newDir, 'Dirs should be the same');
  assert(result.data.newSlug === 'hello-world', `newSlug should be hello-world, got ${result.data.newSlug}`);
  assert(fs.existsSync(ticketPath), 'ticket.md should still exist at same path');

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('slug: hello-world'), 'Frontmatter should have slug');
});

// ============================================================================
// Test Suite: dead code removal -- ticket dir should be rejected
// ============================================================================

console.log('\n=== dead code removal tests (ticket dir rejected) ===\n');

test('dir: ticket dir subcommand is rejected as unknown', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'my-bug', 'queued');

  const result = run(`ticket dir "${ticketPath}"`);
  assert(!result.ok, 'ticket dir should fail (removed subcommand)');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Unknown ticket subcommand'), `Error should mention unknown subcommand: ${result.data.error}`);
  // The valid subcommand list (after "Valid:") should not include "dir"
  const validListMatch = result.data.error.match(/Valid:\s*(.*)/);
  assert(validListMatch, 'Error should list valid subcommands');
  assert(!validListMatch[1].includes('dir'), `Valid-list should not mention dir: ${validListMatch[1]}`);
});

// ============================================================================
// Test Suite: ticket transition (still works with new layout)
// ============================================================================

console.log('\n=== ticket transition tests (new layout) ===\n');

test('transition: queued -> plan works with ticket.md in folder', () => {
  const base = createTmpDir();
  const ticketPath = createTicketFolder(base, '0001', 'my-bug', 'queued');

  const result = runInDir(`ticket transition "${ticketPath}" plan`, base);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'plan', `to should be plan, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: plan'), 'State should be plan');
});

test('transition: queued -> failed with reason succeeds', () => {
  const base = createTmpDir();
  const ticketPath = createTicketFolder(base, '0003', 'test', 'queued');

  const result = runInDir(`ticket transition "${ticketPath}" failed --reason "Intake failed"`, base);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'failed', `to should be failed, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
  assert(content.includes('failure_reason: "Intake failed"'), 'Should have failure reason');
});

test('transition: queued -> failed without reason errors', () => {
  const base = createTmpDir();
  const ticketPath = createTicketFolder(base, '0003', 'test2', 'queued');

  const result = runInDir(`ticket transition "${ticketPath}" failed`, base);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('--reason'), `Error should mention --reason: ${result.data.error}`);
});

test('transition: directory path auto-resolves to ticket.md', () => {
  const base = createTmpDir();
  const ticketPath = createTicketFolder(base, '0001', 'dir-test', 'queued');
  const ticketDir = path.dirname(ticketPath);

  const result = runInDir(`ticket transition "${ticketDir}" plan`, base);
  assert(result.ok, `Expected success with dir path, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'plan', `to should be plan, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: plan'), 'State should be plan');
});

test('rename: directory path auto-resolves to ticket.md', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'rename-dir-test', 'queued');
  const ticketDir = path.dirname(ticketPath);

  const result = run(`ticket rename "${ticketDir}" --slug "dir-rename-result"`);
  assert(result.ok, `Expected success with dir path, got: ${JSON.stringify(result.data)}`);
  assert(result.data.newSlug === 'dir-rename-result', `newSlug should be dir-rename-result, got ${result.data.newSlug}`);
});

// ============================================================================
// Test Suite: session create (no tickets/ or assets/)
// ============================================================================

console.log('\n=== session create tests (no tickets/assets dirs) ===\n');

test('session create: only creates session.md, no tickets/ or assets/', () => {
  const base = createTmpDir();
  const result = run(`session create "${base}" --name clean-session`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);

  const sessionDir = result.data.path;
  assert(fs.existsSync(path.join(sessionDir, 'session.md')), 'session.md should exist');
  assert(!fs.existsSync(path.join(sessionDir, 'tickets')), 'tickets/ should NOT exist');
  assert(!fs.existsSync(path.join(sessionDir, 'assets')), 'assets/ should NOT exist');
});

// ============================================================================
// Test Suite: session list + summary (new layout)
// ============================================================================

console.log('\n=== session list/summary tests (new layout) ===\n');

test('session list: counts tickets from NNNN-slug/ticket.md', () => {
  const base = createTmpDir();
  const sessionResult = run(`session create "${base}" --name test-session`);
  const sessionDir = sessionResult.data.path;

  // Create tickets using the tool
  run(`ticket create "${sessionDir}" --slug bug-a`);
  run(`ticket create "${sessionDir}" --slug bug-b`);

  const result = run(`session list "${base}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.length === 1, `Should have 1 session, got ${result.data.length}`);
  assert(result.data[0].ticket_counts.queued === 2, `Should have 2 queued tickets, got ${JSON.stringify(result.data[0].ticket_counts)}`);
});

test('session summary: scans NNNN-slug/ticket.md', () => {
  const base = createTmpDir();
  const sessionResult = run(`session create "${base}" --name test-session`);
  const sessionDir = sessionResult.data.path;

  run(`ticket create "${sessionDir}" --slug bug-a`);
  run(`ticket create "${sessionDir}" --slug bug-b`);

  const result = run(`session summary "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.total_tickets === 2, `Should have 2 tickets, got ${result.data.total_tickets}`);
  assert(result.data.counts.queued === 2, `Should have 2 queued, got ${JSON.stringify(result.data.counts)}`);
});

// ============================================================================
// Test Suite: run liveness status
// ============================================================================

console.log('\n=== run liveness status tests ===\n');

test('run start: creates dispatched status for a known fixme agent', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });

  const result = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-review-code`);

  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(/^run_[A-Za-z0-9_-]+$/.test(result.data.statusId), `statusId should be generated run id, got ${result.data.statusId}`);
  assert(result.data.statusPath === path.join(fixmeDir, 'runs', result.data.statusId, 'status.json'), `statusPath should be under fixme runs dir, got ${result.data.statusPath}`);
  assert(fs.existsSync(result.data.statusPath), 'status.json should exist');

  const status = readJson(result.data.statusPath);
  assert(status.schemaVersion === 1, 'schemaVersion should be 1');
  assert(status.statusId === result.data.statusId, 'statusId should match');
  assert(status.agent === 'fixme-review-code', `agent should be fixme-review-code, got ${status.agent}`);
  assert(status.state === 'running', `state should be running, got ${status.state}`);
  assert(status.checkpoint === 'dispatched', `checkpoint should be dispatched, got ${status.checkpoint}`);
  assert(status.currentCommand === null, 'currentCommand should be null');
  assert(typeof status.updatedAt === 'string' && !Number.isNaN(Date.parse(status.updatedAt)), `updatedAt should be ISO timestamp, got ${status.updatedAt}`);
});

test('run start --help prints schema and does not create liveness state', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });

  const result = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task --help`);

  assert(result.ok, `run start --help should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.command === 'run start', `help should describe run start, got ${JSON.stringify(result.data)}`);
  assert(!Object.prototype.hasOwnProperty.call(result.data, 'statusId'), 'help must not create a statusId');
  assert(!fs.existsSync(path.join(fixmeDir, 'runs')), 'help must not create a runs directory');
});

test('run commands: explicit fixmeDir is independent from cwd config resolution', () => {
  const target = createTmpDir();
  const fixmeDir = path.join(target, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });

  const pollutedWorkspace = createTmpDir();
  const pollutedFixmeDir = path.join(pollutedWorkspace, '.fixme');
  fs.mkdirSync(pollutedFixmeDir, { recursive: true });
  fs.writeFileSync(path.join(pollutedFixmeDir, 'config.json'), JSON.stringify({
    sub_repos: ['frontend']
  }, null, 2));
  const pollutedCwd = path.join(pollutedWorkspace, 'frontend');
  fs.mkdirSync(pollutedCwd, { recursive: true });

  const started = runInDir(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`, pollutedCwd);
  assert(started.ok, `run start should use explicit fixmeDir instead of cwd config, got: ${JSON.stringify(started.data)}`);

  const status = runInDir(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`, pollutedCwd);
  assert(status.ok, `run status should use explicit fixmeDir instead of cwd config, got: ${JSON.stringify(status.data)}`);
  assert(status.data.statusId === started.data.statusId, `statusId should match, got ${JSON.stringify(status.data)}`);
});

test('run status: uses camelCase liveness JSON and rejects snake_case files', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });

  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);
  assert(started.data.statusId, `run start should return statusId, got: ${JSON.stringify(started.data)}`);
  assert(started.data.statusPath, `run start should return statusPath, got: ${JSON.stringify(started.data)}`);
  assert(!Object.prototype.hasOwnProperty.call(started.data, 'status_id'), 'run start should not return status_id');
  assert(!Object.prototype.hasOwnProperty.call(started.data, 'status_path'), 'run start should not return status_path');

  const status = readJson(started.data.statusPath);
  assert(status.schemaVersion === 1, `status file should use schemaVersion, got ${JSON.stringify(status)}`);
  assert(status.statusId === started.data.statusId, `status file should use statusId, got ${JSON.stringify(status)}`);
  assert(status.currentCommand === null, `status file should use currentCommand, got ${JSON.stringify(status)}`);
  assert(typeof status.updatedAt === 'string' && !Number.isNaN(Date.parse(status.updatedAt)), `status file should use updatedAt, got ${JSON.stringify(status)}`);
  assert(!Object.prototype.hasOwnProperty.call(status, 'schema_version'), 'status file should not use schema_version');
  assert(!Object.prototype.hasOwnProperty.call(status, 'status_id'), 'status file should not use status_id');
  assert(!Object.prototype.hasOwnProperty.call(status, 'current_command'), 'status file should not use current_command');
  assert(!Object.prototype.hasOwnProperty.call(status, 'updated_at'), 'status file should not use updated_at');

  const obsoleteStatusId = 'run_obsoleteSnakeCase';
  const obsoleteStatusPath = path.join(fixmeDir, 'runs', obsoleteStatusId, 'status.json');
  fs.mkdirSync(path.dirname(obsoleteStatusPath), { recursive: true });
  fs.writeFileSync(obsoleteStatusPath, JSON.stringify({
    schema_version: 1,
    status_id: obsoleteStatusId,
    agent: 'fixme-task',
    state: 'waiting',
    checkpoint: 'waiting',
    current_command: 'attention:attn_obsolete',
    updated_at: new Date().toISOString(),
  }, null, 2) + '\n');

  const readObsolete = run(`run status --fixme-dir "${fixmeDir}" --status-id ${obsoleteStatusId}`);
  assert(!readObsolete.ok, 'snake_case run status should be rejected');
  assert(readObsolete.data.error.includes('must use camelCase JSON keys'), `snake_case status error should mention camelCase, got ${readObsolete.data.error}`);

  const missingStatusId = 'run_missingStatusId';
  const missingStatusPath = path.join(fixmeDir, 'runs', missingStatusId, 'status.json');
  fs.mkdirSync(path.dirname(missingStatusPath), { recursive: true });
  fs.writeFileSync(missingStatusPath, JSON.stringify({
    schemaVersion: 1,
    agent: 'fixme-task',
    state: 'waiting',
    checkpoint: 'waiting',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n');

  const readMissingStatusId = run(`run status --fixme-dir "${fixmeDir}" --status-id ${missingStatusId}`);
  assert(!readMissingStatusId.ok, 'run status should reject files missing statusId');
  assert(readMissingStatusId.data.error.includes('run status statusId is required'), `missing statusId error should mention statusId, got ${readMissingStatusId.data.error}`);

  const mismatchedStatusId = 'run_mismatchedStatusId';
  const mismatchedStatusPath = path.join(fixmeDir, 'runs', mismatchedStatusId, 'status.json');
  fs.mkdirSync(path.dirname(mismatchedStatusPath), { recursive: true });
  fs.writeFileSync(mismatchedStatusPath, JSON.stringify({
    schemaVersion: 1,
    statusId: 'run_differentStatusId',
    agent: 'fixme-task',
    state: 'waiting',
    checkpoint: 'waiting',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
  }, null, 2) + '\n');

  const readMismatchedStatusId = run(`run status --fixme-dir "${fixmeDir}" --status-id ${mismatchedStatusId}`);
  assert(!readMismatchedStatusId.ok, 'run status should reject files whose statusId does not match the requested run');
  assert(readMismatchedStatusId.data.error.includes('run status statusId does not match requested statusId'), `mismatched statusId error should mention mismatch, got ${readMismatchedStatusId.data.error}`);

  const unknownFieldStatusId = 'run_unknownField';
  const unknownFieldStatusPath = path.join(fixmeDir, 'runs', unknownFieldStatusId, 'status.json');
  fs.mkdirSync(path.dirname(unknownFieldStatusPath), { recursive: true });
  fs.writeFileSync(unknownFieldStatusPath, JSON.stringify({
    schemaVersion: 1,
    statusId: unknownFieldStatusId,
    agent: 'fixme-task',
    state: 'waiting',
    checkpoint: 'waiting',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
    oldStatus: 'waiting-for-user',
  }, null, 2) + '\n');

  const readUnknownFieldStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${unknownFieldStatusId}`);
  assert(!readUnknownFieldStatus.ok, 'run status should reject unknown camelCase fields');
  assert(readUnknownFieldStatus.data.error.includes('Unsupported run status field: oldStatus'), `unknown field error should mention oldStatus, got ${readUnknownFieldStatus.data.error}`);
});

test('run ping and status: updates and reads current liveness status', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-execute-plan`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const pinged = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state running --checkpoint working --current-command "yarn test"`);
  assert(pinged.ok, `run ping should succeed, got: ${JSON.stringify(pinged.data)}`);
  assert(pinged.data.statusPath === started.data.statusPath, 'ping should return same statusPath');

  const read = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(read.ok, `run status should succeed, got: ${JSON.stringify(read.data)}`);
  assert(read.data.statusId === started.data.statusId, 'statusId should match');
  assert(read.data.agent === 'fixme-execute-plan', `agent should be preserved, got ${read.data.agent}`);
  assert(read.data.state === 'running', `state should be running, got ${read.data.state}`);
  assert(read.data.checkpoint === 'working', `checkpoint should be working, got ${read.data.checkpoint}`);
  assert(read.data.currentCommand === 'yarn test', `currentCommand should be yarn test, got ${read.data.currentCommand}`);
  assert(read.data.updatedAt >= started.data.updatedAt, 'updatedAt should not move backwards');
});

test('obsolete liveness ping alias maps to run ping and infers fixmeDir from cwd', () => {
  const projectRoot = createTmpDir();
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = runInDir(`run start --fixme-dir "${fixmeDir}" --agent fixme-write-plan`, projectRoot);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const pinged = runInDir(`liveness ping --status-id ${started.data.statusId} --phase working --message "Writing plan and code map artifacts"`, projectRoot);
  assert(pinged.ok, `obsolete liveness ping should succeed, got: ${JSON.stringify(pinged.data)}`);
  assert(pinged.data.state === 'running', `obsolete liveness ping should map to running state, got ${pinged.data.state}`);
  assert(pinged.data.checkpoint === 'working', `phase should map to checkpoint, got ${pinged.data.checkpoint}`);
  assert(pinged.data.currentCommand === 'Writing plan and code map artifacts', `message should map to currentCommand, got ${pinged.data.currentCommand}`);

  const status = runInDir(`liveness status --status-id ${started.data.statusId}`, projectRoot);
  assert(status.ok, `obsolete liveness status should succeed, got: ${JSON.stringify(status.data)}`);
  assert(status.data.statusId === started.data.statusId, 'statusId should match');
  assert(status.data.currentCommand === 'Writing plan and code map artifacts', 'status should read same liveness file');
});

test('run ping: accepts null current command and terminal state', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const pinged = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state completed --checkpoint done --current-command null`);

  assert(pinged.ok, `run ping should succeed, got: ${JSON.stringify(pinged.data)}`);
  assert(pinged.data.state === 'completed', `state should be completed, got ${pinged.data.state}`);
  assert(pinged.data.checkpoint === 'done', `checkpoint should be done, got ${pinged.data.checkpoint}`);
  assert(pinged.data.currentCommand === null, 'currentCommand should be null');
});

test('run start: rejects non-agent skills and invalid fixme-dir paths', () => {
  const invalidAgent = run('run start --fixme-dir "/tmp/fixme-test" --agent fixme-usage');
  assert(!invalidAgent.ok, 'fixme-usage should not be accepted as a run agent');
  assert(invalidAgent.data.error.includes('Unsupported run owner'), `error should mention unsupported run owner, got ${invalidAgent.data.error}`);

  const relativeDir = run('run start --fixme-dir ".fixme" --agent fixme-task');
  assert(!relativeDir.ok, 'relative fixme-dir should be rejected');
  assert(relativeDir.data.error.includes('--fixme-dir must be an absolute path'), `error should mention absolute fixme-dir, got ${relativeDir.data.error}`);
});

test('run ping: rejects invalid state and checkpoint values', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const badState = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state paused --checkpoint working --current-command null`);
  assert(!badState.ok, 'invalid state should be rejected');
  assert(badState.data.error.includes('Unsupported run state'), `error should mention unsupported state, got ${badState.data.error}`);

  const badCheckpoint = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state running --checkpoint task-execution --current-command null`);
  assert(!badCheckpoint.ok, 'invalid checkpoint should be rejected');
  assert(badCheckpoint.data.error.includes('Unsupported run checkpoint'), `error should mention unsupported checkpoint, got ${badCheckpoint.data.error}`);
});

test('run attention: stores prompt, records answer, and clears durable attention', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-13',
    taskStatePath: path.join(fixmeDir, 'tasks', '2026-06-05-FIXME-13-demo.state.json'),
    promptMarkdown: '## Review Classification\n\nPlease provide your decision.',
    answerMode: 'freeform',
  });

  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);

  assert(set.ok, `run attention set should succeed, got: ${JSON.stringify(set.data)}`);
  assertNoSnakeCaseKeys(set.data, 'run attention set output');
  assert(/^attn_[A-Za-z0-9_-]+$/.test(set.data.attentionId), `attentionId should be generated, got ${set.data.attentionId}`);
  assert(set.data.statusId === started.data.statusId, 'attention output should include statusId');
  assert(set.data.status === 'waiting', `attention status should be waiting, got ${set.data.status}`);
  assert(fs.existsSync(set.data.attentionPath), 'attention file should exist');

  const runStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(runStatus.ok, `run status should succeed, got: ${JSON.stringify(runStatus.data)}`);
  assert(runStatus.data.state === 'waiting', `run state should be waiting, got ${runStatus.data.state}`);
  assert(runStatus.data.checkpoint === 'waiting', `run checkpoint should be waiting, got ${runStatus.data.checkpoint}`);
  assert(runStatus.data.currentCommand === `attention:${set.data.attentionId}`, `currentCommand should point at attention id, got ${runStatus.data.currentCommand}`);

  const shown = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id ${set.data.attentionId}`);
  assert(shown.ok, `run attention show should succeed, got: ${JSON.stringify(shown.data)}`);
  assertNoSnakeCaseKeys(shown.data, 'run attention show output');
  assert(shown.data.promptMarkdown.includes('Please provide your decision.'), 'promptMarkdown should be preserved');
  assert(shown.data.ownerSkill === 'fixme-task', `ownerSkill should be fixme-task, got ${shown.data.ownerSkill}`);
  assert(shown.data.status === 'waiting', `shown status should be waiting, got ${shown.data.status}`);

  const answerData = JSON.stringify({ answer: '1: A', answeredBy: 'user', answerKind: 'decision' });
  const answered = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id ${set.data.attentionId} --data '${answerData}'`);
  assert(answered.ok, `run attention answer should succeed, got: ${JSON.stringify(answered.data)}`);
  assertNoSnakeCaseKeys(answered.data, 'run attention answer output');
  assert(answered.data.status === 'answered', `answered status should be answered, got ${answered.data.status}`);
  assert(answered.data.answer.answer === '1: A', `answer should be stored, got ${JSON.stringify(answered.data.answer)}`);
  assert(typeof answered.data.answeredAt === 'string' && !Number.isNaN(Date.parse(answered.data.answeredAt)), `answeredAt should be ISO, got ${answered.data.answeredAt}`);

  const cleared = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id ${set.data.attentionId}`);
  assert(cleared.ok, `run attention clear should succeed, got: ${JSON.stringify(cleared.data)}`);
  assertNoSnakeCaseKeys(cleared.data, 'run attention clear output');
  assert(!fs.existsSync(set.data.attentionPath), 'attention file should be removed after clear');

  const finalStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(finalStatus.ok, `run status after attention clear should succeed, got: ${JSON.stringify(finalStatus.data)}`);
  assert(finalStatus.data.state === 'running', `run state should return to running, got ${finalStatus.data.state}`);
  assert(finalStatus.data.checkpoint === 'working', `run checkpoint should return to working, got ${finalStatus.data.checkpoint}`);
  assert(finalStatus.data.currentCommand === null, `currentCommand should be cleared, got ${finalStatus.data.currentCommand}`);
});

test('run attention: rejects blank prompts and malformed metadata', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });

  const blankPromptRun = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(blankPromptRun.ok, `run start should succeed, got: ${JSON.stringify(blankPromptRun.data)}`);
  const blankPrompt = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-blank-prompt',
    taskStatePath: path.join(fixmeDir, 'tasks', 'blank-prompt.state.json'),
    promptMarkdown: '   ',
    answerMode: 'decision-card',
  });

  const blankPromptSet = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${blankPromptRun.data.statusId} --data '${blankPrompt}'`);
  assert(!blankPromptSet.ok, 'attention set with blank promptMarkdown should fail');
  assert(blankPromptSet.data.error.includes('run attention data requires non-empty promptMarkdown'), `blank prompt error should mention promptMarkdown, got ${blankPromptSet.data.error}`);

  const metadataRun = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(metadataRun.ok, `run start should succeed, got: ${JSON.stringify(metadataRun.data)}`);
  const malformedMetadata = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-metadata',
    taskStatePath: path.join(fixmeDir, 'tasks', 'metadata.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
    metadata: ['lost-routing-context'],
  });

  const malformedMetadataSet = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${metadataRun.data.statusId} --data '${malformedMetadata}'`);
  assert(!malformedMetadataSet.ok, 'attention set with non-object metadata should fail');
  assert(malformedMetadataSet.data.error.includes('run attention data metadata must be a JSON object'), `metadata error should mention object metadata, got ${malformedMetadataSet.data.error}`);
});

test('run attention: rejects blank optional routing fields when provided', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const baseData = {
    ownerSkill: 'fixme-session',
    kind: 'sessionDecision',
    promptMarkdown: 'Session decision prompt.',
  };
  const blankFields = [
    ['sourceSkill', 'run attention data sourceSkill must be a non-empty string'],
    ['parentSkill', 'run attention data parentSkill must be a non-empty string'],
    ['resumeRef', 'run attention data resumeRef must be a non-empty string'],
    ['taskStatePath', 'run attention data taskStatePath must be a non-empty string'],
    ['answerMode', 'run attention data answerMode must be a non-empty string'],
  ];

  for (const [field, expectedError] of blankFields) {
    const data = JSON.stringify({ ...baseData, [field]: '   ' });
    const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${data}'`);
    assert(!set.ok, `attention set with blank ${field} should fail`);
    assert(set.data.error.includes(expectedError), `blank ${field} error should mention non-empty field, got ${set.data.error}`);
  }

  const nullParentSkill = JSON.stringify({ ...baseData, parentSkill: null });
  const nullSet = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${nullParentSkill}'`);
  assert(!nullSet.ok, 'attention set with null parentSkill should fail');
  assert(nullSet.data.error.includes('run attention data parentSkill must be a non-empty string'), `null parentSkill error should mention non-empty field, got ${nullSet.data.error}`);
});

test('run attention: rejects invalid provided attention ids instead of generating replacements', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });

  const baseData = {
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-attention-id',
    taskStatePath: path.join(fixmeDir, 'tasks', 'attention-id.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  };
  const invalidIds = [
    ['   ', 'attentionId must be a non-empty string'],
    [null, 'attentionId must be a non-empty string'],
    [' attn_with_padding ', 'attentionId must not contain surrounding whitespace'],
  ];

  for (const [attentionId, expectedError] of invalidIds) {
    const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
    assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);
    const data = JSON.stringify({ ...baseData, attentionId });
    const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${data}'`);
    assert(!set.ok, `attention set with invalid attentionId ${JSON.stringify(attentionId)} should fail`);
    assert(set.data.error.includes(expectedError), `attentionId error should mention non-empty id, got ${set.data.error}`);
  }
});

test('run attention: rejects duplicate attention ids and answer overwrite', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_duplicate_test',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-write-plan',
    kind: 'planDecision',
    resumeRef: 'FIXME-duplicate',
    taskStatePath: path.join(fixmeDir, 'tasks', 'duplicate.state.json'),
    promptMarkdown: 'Choose a plan option.',
    answerMode: 'decision-card',
  });
  const first = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(first.ok, `first run attention set should succeed, got: ${JSON.stringify(first.data)}`);

  const duplicate = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(!duplicate.ok, 'duplicate run attention set should fail');
  assert(duplicate.data.error.includes('Run attention already exists'), `duplicate error should mention existing attention, got ${duplicate.data.error}`);

  const firstAnswer = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_duplicate_test --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(firstAnswer.ok, `first run attention answer should succeed, got: ${JSON.stringify(firstAnswer.data)}`);

  const secondAnswer = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_duplicate_test --data '${JSON.stringify({ answer: 'B', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(!secondAnswer.ok, 'second run attention answer should fail');
  assert(secondAnswer.data.error.includes('Run attention already answered'), `second answer error should mention already answered, got ${secondAnswer.data.error}`);
});

test('run attention: set replaces stale unreferenced attention records', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const runDir = path.join(fixmeDir, 'runs', started.data.statusId);
  const attentionDir = path.join(runDir, 'attention');
  const attentionPath = path.join(attentionDir, 'attn_stale_replace.json');
  fs.mkdirSync(attentionDir, { recursive: true });
  fs.writeFileSync(attentionPath, JSON.stringify({
    attentionId: 'attn_stale_replace',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-stale-old',
    taskStatePath: path.join(fixmeDir, 'tasks', 'stale-old.state.json'),
    promptMarkdown: 'Stale prompt.',
    answerMode: 'decision-card',
    metadata: {},
    status: 'answered',
    answer: { answer: 'old', answeredBy: 'user', answerKind: 'decision' },
    createdAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
  }, null, 2) + '\n');

  const attentionData = JSON.stringify({
    attentionId: 'attn_stale_replace',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-stale-new',
    taskStatePath: path.join(fixmeDir, 'tasks', 'stale-new.state.json'),
    promptMarkdown: 'Fresh prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should replace stale unreferenced records, got: ${JSON.stringify(set.data)}`);
  assert(set.data.promptMarkdown === 'Fresh prompt.', `fresh prompt should replace stale prompt, got ${set.data.promptMarkdown}`);

  const shown = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_stale_replace`);
  assert(shown.ok, `replaced attention should be showable, got: ${JSON.stringify(shown.data)}`);
  assert(shown.data.promptMarkdown === 'Fresh prompt.', `shown prompt should be fresh, got ${shown.data.promptMarkdown}`);
  assert(shown.data.resumeRef === 'FIXME-stale-new', `resumeRef should be fresh, got ${shown.data.resumeRef}`);
});

test('run attention: rejects attention records whose embedded id does not match the requested id', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_integrity_check',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-integrity',
    taskStatePath: path.join(fixmeDir, 'tasks', 'integrity.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const corruptedRecord = readJson(set.data.attentionPath);
  fs.writeFileSync(set.data.attentionPath, JSON.stringify({
    ...corruptedRecord,
    attentionId: 'attn_wrong_record',
  }, null, 2) + '\n');

  const shown = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_integrity_check`);
  assert(!shown.ok, 'show should reject mismatched attention record ids');
  assert(shown.data.error.includes('Run attention record id mismatch'), `mismatch error should mention record id mismatch, got ${shown.data.error}`);
});

test('run attention: rejects attention records with unsupported persisted status', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_status_integrity',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-status-integrity',
    taskStatePath: path.join(fixmeDir, 'tasks', 'status-integrity.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const corruptedRecord = readJson(set.data.attentionPath);
  fs.writeFileSync(set.data.attentionPath, JSON.stringify({
    ...corruptedRecord,
    status: 'halfAnswered',
  }, null, 2) + '\n');

  const shown = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_status_integrity`);
  assert(!shown.ok, 'show should reject unsupported stored attention status');
  assert(shown.data.error.includes('Unsupported run attention record status'), `status error should mention unsupported status, got ${shown.data.error}`);
});

test('run attention: rejects malformed persisted attention records', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_shape_integrity',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-shape-integrity',
    taskStatePath: path.join(fixmeDir, 'tasks', 'shape-integrity.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const validRecord = readJson(set.data.attentionPath);
  fs.writeFileSync(set.data.attentionPath, JSON.stringify({
    ...validRecord,
    oldPromptPath: '/tmp/old-prompt.md',
  }, null, 2) + '\n');

  const shownWithUnknownField = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_shape_integrity`);
  assert(!shownWithUnknownField.ok, 'show should reject unknown camelCase attention fields');
  assert(shownWithUnknownField.data.error.includes('Unsupported run attention record field: oldPromptPath'), `unknown field error should mention oldPromptPath, got ${shownWithUnknownField.data.error}`);

  const missingPromptRecord = { ...validRecord };
  delete missingPromptRecord.promptMarkdown;
  fs.writeFileSync(set.data.attentionPath, JSON.stringify(missingPromptRecord, null, 2) + '\n');

  const shownWithoutPrompt = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_shape_integrity`);
  assert(!shownWithoutPrompt.ok, 'show should reject records missing promptMarkdown');
  assert(shownWithoutPrompt.data.error.includes('run attention record promptMarkdown is required'), `missing prompt error should mention promptMarkdown, got ${shownWithoutPrompt.data.error}`);

  const answeredRecordWithUnknownAnswerField = {
    ...validRecord,
    status: 'answered',
    answer: {
      answer: 'A',
      answeredBy: 'user',
      answerKind: 'decision',
      oldDecisionId: 'D1',
    },
    answeredAt: new Date().toISOString(),
  };
  fs.writeFileSync(set.data.attentionPath, JSON.stringify(answeredRecordWithUnknownAnswerField, null, 2) + '\n');

  const shownWithUnknownAnswerField = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_shape_integrity`);
  assert(!shownWithUnknownAnswerField.ok, 'show should reject unknown camelCase answer fields');
  assert(shownWithUnknownAnswerField.data.error.includes('Unsupported run attention record answer field: oldDecisionId'), `unknown answer field error should mention oldDecisionId, got ${shownWithUnknownAnswerField.data.error}`);
});

test('run attention: normal pings cannot overwrite pending attention markers', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_ping_guard',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-write-plan',
    kind: 'planDecision',
    resumeRef: 'FIXME-ping-guard',
    taskStatePath: path.join(fixmeDir, 'tasks', 'ping-guard.state.json'),
    promptMarkdown: 'Choose a plan option.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `run attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const pinged = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state running --checkpoint working --current-command "waiting for fixme-write-plan"`);
  assert(!pinged.ok, 'run ping should not overwrite pending attention');
  assert(pinged.data.error.includes('Run has pending attention'), `ping error should mention pending attention, got ${pinged.data.error}`);

  const status = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(status.ok, `run status should succeed, got: ${JSON.stringify(status.data)}`);
  assert(status.data.state === 'waiting', `run state should still be waiting, got ${status.data.state}`);
  assert(status.data.currentCommand === 'attention:attn_ping_guard', `currentCommand should still point at attention, got ${status.data.currentCommand}`);

  const answered = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_ping_guard --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answered.ok, `answer should still succeed after rejected ping, got: ${JSON.stringify(answered.data)}`);
});

test('run attention: show rejects stale prompts when run is no longer waiting', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_show_stale',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-show-stale',
    taskStatePath: path.join(fixmeDir, 'tasks', 'show-stale.state.json'),
    promptMarkdown: 'Stale question.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `run attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const failed = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state failed --checkpoint done --current-command null`);
  assert(failed.ok, `terminal failure cleanup should succeed, got: ${JSON.stringify(failed.data)}`);

  const shown = run(`run attention show --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_show_stale`);
  assert(!shown.ok, 'run attention show should not render stale prompts');
  assert(shown.data.error.includes('Run is not waiting on attention'), `stale show error should mention run wait state, got ${shown.data.error}`);
});

test('run attention: rejects overlapping pending attention and stale answers', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const firstData = JSON.stringify({
    attentionId: 'attn_first_pending',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-overlap',
    taskStatePath: path.join(fixmeDir, 'tasks', 'overlap.state.json'),
    promptMarkdown: 'First question.',
    answerMode: 'freeform',
  });
  const secondData = JSON.stringify({
    attentionId: 'attn_second_pending',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-overlap',
    taskStatePath: path.join(fixmeDir, 'tasks', 'overlap.state.json'),
    promptMarkdown: 'Second question.',
    answerMode: 'freeform',
  });

  const first = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${firstData}'`);
  assert(first.ok, `first attention set should succeed, got: ${JSON.stringify(first.data)}`);

  const second = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${secondData}'`);
  assert(!second.ok, 'second pending attention should fail');
  assert(second.data.error.includes('Run already has pending attention'), `overlap error should mention pending attention, got ${second.data.error}`);

  const staleStatus = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state failed --checkpoint done --current-command null`);
  assert(staleStatus.ok, `terminal failure cleanup should succeed, got: ${JSON.stringify(staleStatus.data)}`);

  const staleAnswer = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_first_pending --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(!staleAnswer.ok, 'stale attention answer should fail after terminal failure cleanup');
  assert(staleAnswer.data.error.includes('Run is not waiting on attention'), `stale answer error should mention run wait state, got ${staleAnswer.data.error}`);
});

test('run attention: failed set removes invisible attention record', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_set_recovery',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-set-recovery',
    taskStatePath: path.join(fixmeDir, 'tasks', 'set-recovery.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });

  const runDir = path.join(fixmeDir, 'runs', started.data.statusId);
  const attentionDir = path.join(runDir, 'attention');
  const attentionPath = path.join(attentionDir, 'attn_set_recovery.json');
  const statusPath = path.join(runDir, 'status.json');
  const status = readJson(statusPath);
  fs.writeFileSync(statusPath, JSON.stringify({ ...status, agent: 'not-a-fixme-agent' }, null, 2) + '\n');

  const failedSet = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(!failedSet.ok, 'set should fail when status cannot be updated');
  assert(!fs.existsSync(attentionPath), 'failed set should remove the unreferenced attention record');
});

test('run attention: clear rejects unanswered and stale attention', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_clear_guard',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-clear-guard',
    taskStatePath: path.join(fixmeDir, 'tasks', 'clear-guard.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const unansweredClear = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_guard`);
  assert(!unansweredClear.ok, 'clear should fail before the attention has an answer');
  assert(unansweredClear.data.error.includes('Run attention is not answered'), `unanswered clear error should mention unanswered attention, got ${unansweredClear.data.error}`);

  const answered = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_guard --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answered.ok, `attention answer should succeed, got: ${JSON.stringify(answered.data)}`);

  const staleStatus = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state failed --checkpoint done --current-command null`);
  assert(staleStatus.ok, `terminal failure cleanup should succeed, got: ${JSON.stringify(staleStatus.data)}`);

  const staleClear = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_guard`);
  assert(!staleClear.ok, 'clear should fail after terminal failure cleanup');
  assert(staleClear.data.error.includes('Run is not waiting on attention'), `stale clear error should mention stale attention, got ${staleClear.data.error}`);
  assert(fs.existsSync(set.data.attentionPath), 'stale clear should leave the answered attention record for recovery');
});

test('run attention: failed clear preserves answered record for recovery', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_clear_recovery',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-clear-recovery',
    taskStatePath: path.join(fixmeDir, 'tasks', 'clear-recovery.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const answered = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_recovery --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answered.ok, `attention answer should succeed, got: ${JSON.stringify(answered.data)}`);

  const runDir = path.join(fixmeDir, 'runs', started.data.statusId);
  const statusPath = path.join(runDir, 'status.json');
  const previousStatus = readJson(statusPath);
  fs.writeFileSync(statusPath, JSON.stringify({ ...previousStatus, agent: 'not-a-fixme-agent' }, null, 2) + '\n');

  const failedClear = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_recovery`);
  assert(!failedClear.ok, 'clear should fail when status cannot be updated');
  assert(fs.existsSync(set.data.attentionPath), 'failed clear should preserve the answered attention record');

  const status = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(status.ok, `run status should remain readable, got: ${JSON.stringify(status.data)}`);
  assert(status.data.currentCommand === 'attention:attn_clear_recovery', `status should still point at attention, got ${status.data.currentCommand}`);
});

test('run attention: clear succeeds with warning when stale record cleanup fails', () => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    return;
  }

  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_clear_cleanup_warning',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-clear-cleanup-warning',
    taskStatePath: path.join(fixmeDir, 'tasks', 'clear-cleanup-warning.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const answered = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_cleanup_warning --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answered.ok, `attention answer should succeed, got: ${JSON.stringify(answered.data)}`);

  const attentionDir = path.dirname(set.data.attentionPath);
  try {
    fs.chmodSync(attentionDir, 0o555);

    const cleared = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_clear_cleanup_warning`);
    assert(cleared.ok, `clear should succeed after restoring status, got: ${JSON.stringify(cleared.data)}`);
    assertNoSnakeCaseKeys(cleared.data, 'run attention cleanup-warning output');
    assert(cleared.data.cleared === true, 'clear output should report cleared');
    assert(cleared.data.recordRemoved === false, 'clear output should report the stale record was not removed');
    assert(cleared.data.warnings.some(w => w.code === 'ATTENTION_RECORD_CLEANUP_FAILED'), 'clear output should warn about failed record cleanup');

    const status = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
    assert(status.ok, `run status should succeed after cleanup warning, got: ${JSON.stringify(status.data)}`);
    assert(status.data.currentCommand === null, `currentCommand should be cleared, got ${status.data.currentCommand}`);
  } finally {
    try { fs.chmodSync(attentionDir, 0o755); } catch (_) {}
  }
});

test('run attention: answer requires explicit decision or clarification kind', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const attentionData = JSON.stringify({
    attentionId: 'attn_answer_kind_required',
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-answer-kind',
    taskStatePath: path.join(fixmeDir, 'tasks', 'answer-kind.state.json'),
    promptMarkdown: 'Decision prompt.',
    answerMode: 'decision-card',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `attention set should succeed, got: ${JSON.stringify(set.data)}`);

  const missingKind = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: 'A' })}'`);
  assert(!missingKind.ok, 'attention answer without answerKind should fail');
  assert(missingKind.data.error.includes('run attention answer data requires answerKind'), `missing kind error should mention answerKind, got ${missingKind.data.error}`);

  const invalidKind = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'maybe' })}'`);
  assert(!invalidKind.ok, 'attention answer with invalid answerKind should fail');
  assert(invalidKind.data.error.includes('Unsupported run attention answerKind'), `invalid kind error should mention supported values, got ${invalidKind.data.error}`);

  const missingActor = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: 'A', answerKind: 'decision' })}'`);
  assert(!missingActor.ok, 'attention answer without answeredBy should fail');
  assert(missingActor.data.error.includes('run attention answer data requires answeredBy'), `missing actor error should mention answeredBy, got ${missingActor.data.error}`);

  const nonUserActor = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: 'A', answeredBy: 'assistant', answerKind: 'decision' })}'`);
  assert(!nonUserActor.ok, 'attention answer not attributed to the user should fail');
  assert(nonUserActor.data.error.includes('run attention answer data answeredBy must be user'), `non-user actor error should mention user attribution, got ${nonUserActor.data.error}`);

  const blankAnswer = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: '   ', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(!blankAnswer.ok, 'attention answer with blank answer should fail');
  assert(blankAnswer.data.error.includes('run attention answer data requires non-empty answer'), `blank answer error should mention answer content, got ${blankAnswer.data.error}`);

  const extraAnswerField = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision', oldDecisionId: 'D1' })}'`);
  assert(!extraAnswerField.ok, 'attention answer with unsupported fields should fail');
  assert(extraAnswerField.data.error.includes('Unsupported run attention answer data field: oldDecisionId'), `extra answer field error should mention oldDecisionId, got ${extraAnswerField.data.error}`);

  const clarification = run(`run attention answer --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --attention-id attn_answer_kind_required --data '${JSON.stringify({ answer: 'What does option A mean?', answeredBy: 'user', answerKind: 'clarificationRequest' })}'`);
  assert(clarification.ok, `clarification answer should succeed, got: ${JSON.stringify(clarification.data)}`);
  assert(clarification.data.answer.answerKind === 'clarificationRequest', `answerKind should be stored, got ${JSON.stringify(clarification.data.answer)}`);
});

test('run attention: rejects terminal run states', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const completed = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state completed --checkpoint done --current-command null`);
  assert(completed.ok, `run ping completed should succeed, got: ${JSON.stringify(completed.data)}`);

  const attentionData = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-terminal',
    taskStatePath: path.join(fixmeDir, 'tasks', 'terminal.state.json'),
    promptMarkdown: 'Question after completion.',
    answerMode: 'freeform',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(!set.ok, 'run attention set should fail for completed run');
  assert(set.data.error.includes('Cannot set attention for terminal run state'), `terminal state error should mention terminal state, got ${set.data.error}`);
});

test('run attention: fixme-task owner requires resumable task references', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const missingReferences = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    promptMarkdown: 'Question without resume data.',
    answerMode: 'freeform',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${missingReferences}'`);
  assert(!set.ok, 'fixme-task attention without resume references should fail');
  assert(set.data.error.includes('run attention data requires resumeRef for fixme-task owner'), `error should mention missing resumeRef, got ${set.data.error}`);

  const blankResumeRef = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: '   ',
    taskStatePath: path.join(fixmeDir, 'tasks', 'blank-resume.state.json'),
    promptMarkdown: 'Question with blank resume data.',
    answerMode: 'freeform',
  });
  const blankResume = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${blankResumeRef}'`);
  assert(!blankResume.ok, 'fixme-task attention with blank resumeRef should fail');
  assert(blankResume.data.error.includes('run attention data requires resumeRef for fixme-task owner'), `error should mention blank resumeRef, got ${blankResume.data.error}`);

  const relativeStatePath = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-relative-state',
    taskStatePath: 'tasks/relative.state.json',
    promptMarkdown: 'Question with a relative state path.',
    answerMode: 'freeform',
  });
  const relativeState = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${relativeStatePath}'`);
  assert(!relativeState.ok, 'fixme-task attention with relative taskStatePath should fail');
  assert(relativeState.data.error.includes('run attention data taskStatePath must be absolute for fixme-task owner'), `error should mention absolute taskStatePath, got ${relativeState.data.error}`);
});

test('run attention: fixme-task owner requires source skill and supported answer mode', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const missingSourceSkill = JSON.stringify({
    ownerSkill: 'fixme-task',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-source-skill',
    taskStatePath: path.join(fixmeDir, 'tasks', 'source-skill.state.json'),
    promptMarkdown: 'Question without source skill.',
    answerMode: 'freeform',
  });
  const missingSource = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${missingSourceSkill}'`);
  assert(!missingSource.ok, 'fixme-task attention without sourceSkill should fail');
  assert(missingSource.data.error.includes('run attention data requires sourceSkill for fixme-task owner'), `error should mention missing sourceSkill, got ${missingSource.data.error}`);

  const blankSourceSkill = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: '   ',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-source-skill',
    taskStatePath: path.join(fixmeDir, 'tasks', 'source-skill.state.json'),
    promptMarkdown: 'Question with blank source skill.',
    answerMode: 'freeform',
  });
  const blankSource = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${blankSourceSkill}'`);
  assert(!blankSource.ok, 'fixme-task attention with blank sourceSkill should fail');
  assert(blankSource.data.error.includes('run attention data requires sourceSkill for fixme-task owner'), `error should mention blank sourceSkill, got ${blankSource.data.error}`);

  const missingAnswerMode = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-answer-mode',
    taskStatePath: path.join(fixmeDir, 'tasks', 'answer-mode.state.json'),
    promptMarkdown: 'Question without answer mode.',
  });
  const missingMode = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${missingAnswerMode}'`);
  assert(!missingMode.ok, 'fixme-task attention without answerMode should fail');
  assert(missingMode.data.error.includes('run attention data requires answerMode for fixme-task owner'), `error should mention missing answerMode, got ${missingMode.data.error}`);

  const invalidAnswerMode = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-answer-mode',
    taskStatePath: path.join(fixmeDir, 'tasks', 'answer-mode.state.json'),
    promptMarkdown: 'Question with invalid answer mode.',
    answerMode: 'checkbox',
  });
  const invalidMode = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${invalidAnswerMode}'`);
  assert(!invalidMode.ok, 'fixme-task attention with invalid answerMode should fail');
  assert(invalidMode.data.error.includes('Unsupported run attention answerMode'), `error should mention unsupported answerMode, got ${invalidMode.data.error}`);
});

// ============================================================================
// Test Suite: task save and resolve
// ============================================================================

console.log('\n=== task save/resolve tests ===\n');

test('pipeline resolve: ignores assistant-authored candidates and falls back to standard', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    candidates: [
      {
        pipeline: 'full',
        source: 'assistantMenuText',
        evidence: 'Run configured fixme-task workflow',
        reason: 'Assistant-authored menu label is not user intent.',
      },
    ],
  });

  const result = runInDir(`pipeline resolve --data '${data}'`, projectRoot);

  assert(result.ok, `pipeline resolve should succeed, got: ${JSON.stringify(result.data)}`);
  assertNoSnakeCaseKeys(result.data, 'pipeline resolve output');
  assert(result.data.pipeline === 'standard', `pipeline should default to standard, got ${result.data.pipeline}`);
  assert(result.data.source === 'default', `source should be default, got ${result.data.source}`);
  assert(result.data.evidence === null, `evidence should be null, got ${result.data.evidence}`);
  assert(Array.isArray(result.data.candidates), 'candidates should be an array');
  assert(result.data.candidates.length === 0, `assistant candidates should be excluded, got ${JSON.stringify(result.data.candidates)}`);
});

test('pipeline resolve: selects highest-priority eligible pipeline candidate', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    candidates: [
      {
        pipeline: 'full',
        source: 'assistantSummary',
        evidence: 'Previously summarized as full workflow.',
        reason: 'Assistant text is not eligible evidence.',
      },
      {
        pipeline: 'technical-spec',
        source: 'userProseIntent',
        evidence: 'write a technical specification',
        reason: 'Latest user invocation asks for a technical specification.',
      },
    ],
  });

  const result = runInDir(`pipeline resolve --data '${data}'`, projectRoot);

  assert(result.ok, `pipeline resolve should succeed, got: ${JSON.stringify(result.data)}`);
  assertNoSnakeCaseKeys(result.data, 'pipeline resolve output');
  assert(result.data.pipeline === 'technical-spec', `pipeline should be technical-spec, got ${result.data.pipeline}`);
  assert(result.data.source === 'userProseIntent', `source should be userProseIntent, got ${result.data.source}`);
  assert(result.data.evidence === 'write a technical specification', `evidence should be preserved, got ${result.data.evidence}`);
  assert(result.data.candidates.length === 1, `only eligible candidate should remain, got ${JSON.stringify(result.data.candidates)}`);
});

test('pipeline resolve: rejects removed workflow aliases and obsolete config', () => {
  const aliasRoot = createTmpDir();
  fs.mkdirSync(path.join(aliasRoot, '.fixme'), { recursive: true });
  const aliasData = JSON.stringify({
    candidates: [
      {
        pipeline: 'default',
        source: 'explicitPipelineArg',
        evidence: '--pipeline default',
        reason: 'Removed workflow aliases are not valid workflow names.',
      },
    ],
  });

  const aliasResult = runInDir(`pipeline resolve --data '${aliasData}'`, aliasRoot);
  assert(!aliasResult.ok, 'removed workflow alias should fail pipeline resolution');
  assert(aliasResult.data.error.includes('pipeline resolution workflow not found'), `alias error should fail workflow lookup, got ${aliasResult.data.error}`);

  const obsoleteConfigRoot = createTmpDir();
  createObsoletePipelineConfig(obsoleteConfigRoot);
  const defaultData = JSON.stringify({ candidates: [] });
  const obsoleteResult = runInDir(`pipeline resolve --data '${defaultData}'`, obsoleteConfigRoot);
  assert(!obsoleteResult.ok, 'obsolete config should fail pipeline resolution');
  assert(obsoleteResult.data.error === 'unsupported_obsolete_config', `obsolete config should return JSON error, got ${JSON.stringify(obsoleteResult.data)}`);
  assert(obsoleteResult.data.configPath === 'pipelines', `obsolete config should report pipelines path, got ${JSON.stringify(obsoleteResult.data)}`);
});

test('task save: writes FIXME-labelled task brief and camelCase checkpoint', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Resume Fixme Task',
    taskGoal: 'Make fixme-task resumable from a stable task reference.',
    settledSolutionShape: 'Save a standalone task brief with a sibling low-level task state file, while keeping ticket state reserved for session scheduling.',
    agreedApproach: [
      'Use a separate low-level task state file.',
      'Keep ticket state as the session scheduler state.',
    ],
    userVisibleBehavior: [
      'A user can resume a saved task by FIXME label.',
    ],
    scope: {
      inScope: ['task CLI save and resolve'],
      outOfScope: ['ticket alias refs'],
    },
    lockedDecisions: [
      { title: 'Use camelCase JSON', answer: 'All new JSON fields are camelCase.', status: 'confirmed' },
    ],
    constraints: ['No numbered durable manifest.'],
    knownContext: ['Existing saved task labels use FIXME-N.'],
    openQuestions: [],
    pipelineResolution: {
      pipeline: 'standard',
      source: 'explicitPipelineArg',
      evidence: '--pipeline standard',
      reason: 'Test supplies the selected workflow explicitly.',
    },
    laterPlanningNotes: ['Persist only fields needed for the next dispatch.'],
    source: 'test',
  });

  const result = runInDir(`task save --data '${data}'`, projectRoot);

  assert(result.ok, `task save should succeed, got: ${JSON.stringify(result.data)}`);
  assertNoSnakeCaseKeys(result.data, 'task save output');
  assert(result.data.mode === 'standalone', `mode should be standalone, got ${result.data.mode}`);
  assert(result.data.taskRef === 'FIXME-1', `taskRef should be FIXME-1, got ${result.data.taskRef}`);
  assert(result.data.taskPath.endsWith('.md'), `taskPath should end with .md, got ${result.data.taskPath}`);
  assert(result.data.statePath.endsWith('.state.json'), `statePath should end with .state.json, got ${result.data.statePath}`);

  const taskName = path.basename(result.data.taskPath);
  assert(/^\d{4}-\d{2}-\d{2}-FIXME-1-resume-fixme-task\.md$/.test(taskName), `task filename should include date, FIXME label, and slug, got ${taskName}`);
  assert(path.basename(result.data.statePath) === taskName.replace(/\.md$/, '.state.json'), 'state filename should be sibling .state.json');
  assert(fs.existsSync(result.data.taskPath), 'task markdown should exist');
  assert(fs.existsSync(result.data.statePath), 'state JSON should exist');

  const taskMarkdown = fs.readFileSync(result.data.taskPath, 'utf8');
  assert(/^label:\s+"?FIXME-1"?$/m.test(taskMarkdown), 'task frontmatter should include label');
  assert(taskMarkdown.includes('# FIXME-1: Resume Fixme Task'), 'task heading should include label and title');

  const state = readJson(result.data.statePath);
  assertNoSnakeCaseKeys(state, 'task state');
  assert(state.schemaVersion === 1, 'schemaVersion should be 1');
  assert(fs.realpathSync(state.projectRoot) === fs.realpathSync(projectRoot), `projectRoot should be ${projectRoot}, got ${state.projectRoot}`);
  assert(state.status === 'running', `status should be running, got ${state.status}`);
  assert(state.pipeline === 'standard', `pipeline should be standard, got ${state.pipeline}`);
  assert(state.pipelineResolution.pipeline === 'standard', `pipelineResolution.pipeline should be standard, got ${state.pipelineResolution && state.pipelineResolution.pipeline}`);
  assert(state.pipelineResolution.source === 'explicitPipelineArg', `pipelineResolution.source should be explicitPipelineArg, got ${state.pipelineResolution && state.pipelineResolution.source}`);
  assert(state.pipelineResolution.evidence === '--pipeline standard', `pipelineResolution.evidence should be --pipeline standard, got ${state.pipelineResolution && state.pipelineResolution.evidence}`);
  assert(state.cursor.phase === 'plan', `cursor.phase should be plan, got ${state.cursor.phase}`);
  assert(state.cursor.stage === 'execute', `cursor.stage should be execute, got ${state.cursor.stage}`);
  assert(state.cursor.skill === 'fixme-write-plan', `cursor.skill should be fixme-write-plan, got ${state.cursor.skill}`);
  assert(state.cursor.dispatchMode === 'normal', `dispatchMode should be normal, got ${state.cursor.dispatchMode}`);
  assert(Object.prototype.hasOwnProperty.call(state.artifacts, 'productSpecificationPath'), 'artifacts should include productSpecificationPath');
  assert(Object.prototype.hasOwnProperty.call(state.artifacts, 'technicalSpecificationPath'), 'artifacts should include technicalSpecificationPath');
  assert(Object.prototype.hasOwnProperty.call(state.artifacts, 'planPath'), 'artifacts should include planPath');
  assert(Object.prototype.hasOwnProperty.call(state.artifacts, 'codeMapPath'), 'artifacts should include codeMapPath');
  assert(Object.prototype.hasOwnProperty.call(state.handoff, 'executionSummary'), 'handoff should include executionSummary');
  assert(Object.prototype.hasOwnProperty.call(state.handoff, 'reviewFindings'), 'handoff should include reviewFindings');
  assert(Object.prototype.hasOwnProperty.call(state.handoff, 'handlerResult'), 'handoff should include handlerResult');
  assert(Array.isArray(state.handoff.followUpItems), 'handoff.followUpItems should be an array');
  assert(Array.isArray(state.loops.phaseReviewCycles), 'loops.phaseReviewCycles should be an array');
  assert(state.loops.outerCycles === 0, 'loops.outerCycles should default to 0');
  assert(state.pendingDecision === null, 'pendingDecision should default to null');
  assert(typeof state.updatedAt === 'string' && !Number.isNaN(Date.parse(state.updatedAt)), `updatedAt should be ISO, got ${state.updatedAt}`);
  assert(!Object.prototype.hasOwnProperty.call(state, 'currentSpecificationPath'), 'state should not include currentSpecificationPath');
  assert(!Object.prototype.hasOwnProperty.call(state, 'currentStep'), 'state should not include currentStep');
  assert(!Object.prototype.hasOwnProperty.call(state, 'manifest'), 'state should not include manifest');
  assert(!Object.prototype.hasOwnProperty.call(state.artifacts, 'decisionLogPath'), 'artifacts should not include decisionLogPath');
});

test('task save: preserves settled solution shape as a freeform handoff section', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const settledSolutionShape = [
    '### Import command flow',
    '',
    '- Keep the staged parser contract unchanged: `parse -> normalize -> validate -> commit`.',
    '- Preserve the brainstormed fallback: if validation cannot prove safety, stop before commit and show the collected evidence.',
    '- Do not replace the parser with a broad regex pass; that alternative was rejected because it would lose field-level diagnostics.',
  ].join('\n');
  const dataPath = writeJsonFixture(projectRoot, 'save-lossless-task.json', {
    title: 'Save Lossless Import Shape',
    taskGoal: 'Save the settled import command solution shape without losing artifact-level detail.',
    settledSolutionShape,
    agreedApproach: [
      'Use the staged parser contract that was already settled in the brainstorm artifact.',
      'Keep the rejected broad-regex alternative visible for the future planner.',
    ],
    userVisibleBehavior: [
      'A future run can plan from the saved task without recovering chat history or the brainstorm artifact.',
    ],
    scope: {
      inScope: ['Saved task markdown handoff for the import command flow'],
      outOfScope: ['Implementing the import command flow'],
    },
    laterPlanningNotes: ['Treat the settled solution shape as authoritative unless codebase evidence contradicts it.'],
    pipelineResolution: {
      pipeline: 'standard',
      source: 'explicitPipelineArg',
      evidence: '--pipeline standard',
      reason: 'Test supplies the selected workflow explicitly.',
    },
    source: 'test',
  });

  const result = runInDir(`task save --data-file "${dataPath}"`, projectRoot);

  assert(result.ok, `task save should succeed, got: ${JSON.stringify(result.data)}`);
  const taskMarkdown = fs.readFileSync(result.data.taskPath, 'utf8');
  assert(taskMarkdown.includes(`## Settled Solution Shape\n\n${settledSolutionShape}\n\n## Agreed Approach`), 'saved task should preserve the freeform settled solution shape');
  assert(!taskMarkdown.includes('## Open Questions'), 'saved task should omit Open Questions when all questions are resolved before save');
});

test('task save: rejects unresolved open questions before writing artifacts', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const dataPath = writeJsonFixture(projectRoot, 'save-open-questions-task.json', {
    title: 'Reject Unresolved Questions',
    taskGoal: 'Require save mode to resolve unclear handoff details before writing a task.',
    settledSolutionShape: 'Use the discussed settings editor flow after clarifying the remaining ownership question.',
    agreedApproach: ['Clarify unresolved ownership questions before saving the task.'],
    userVisibleBehavior: ['Saved task briefs do not contain unresolved planning questions.'],
    scope: {
      inScope: ['Saved task handoff validation'],
      outOfScope: ['Answering the user question in the CLI test'],
    },
    openQuestions: ['Which team owns the persisted settings document?'],
    laterPlanningNotes: ['Save only after the answer has been integrated across the task brief.'],
    pipelineResolution: {
      pipeline: 'standard',
      source: 'explicitPipelineArg',
      evidence: '--pipeline standard',
      reason: 'Test supplies the selected workflow explicitly.',
    },
    source: 'test',
  });

  const result = runInDir(`task save --data-file "${dataPath}"`, projectRoot);

  assert(!result.ok, 'task save should reject unresolved open questions');
  assert(cliErrorMessage(result).includes('resolve openQuestions before saving'), `error should require question resolution, got ${cliErrorMessage(result)}`);
  assert(!fs.existsSync(path.join(projectRoot, '.fixme', 'tasks', '.counter')), 'counter should not advance when unresolved questions block save');
});

test('task save: rejects obsolete pipelineHint and pipeline fields', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const baseData = {
    title: 'Reject Pipeline Hint',
    taskGoal: 'Ensure task save uses final pipeline resolution data.',
    settledSolutionShape: 'Require callers to provide pipelineResolution instead of obsolete shortcut fields.',
    agreedApproach: ['Use pipelineResolution only.'],
    userVisibleBehavior: ['Old task-save pipeline fields are rejected.'],
    scope: { inScope: ['task CLI save'], outOfScope: [] },
    laterPlanningNotes: ['Validate final pipeline resolution before planning.'],
  };

  for (const field of ['pipelineHint', 'pipeline']) {
    const data = JSON.stringify({ ...baseData, [field]: 'standard' });
    const result = runInDir(`task save --data '${data}'`, projectRoot);
    assert(!result.ok, `task save with ${field} should fail`);
    assert(result.data.error.includes('task save data no longer accepts pipelineHint or pipeline'), `error should mention final pipelineResolution, got ${result.data.error}`);
  }
});

test('task save: requires pipelineResolution before writing artifacts', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Require Pipeline Resolution',
    taskGoal: 'Ensure task save does not infer a workflow.',
    settledSolutionShape: 'Save mode must receive an already-resolved workflow before any task artifacts are written.',
    agreedApproach: ['Resolve the workflow before saving task state.'],
    userVisibleBehavior: ['Missing pipeline resolution fails visibly.'],
    scope: { inScope: ['task CLI save'], outOfScope: [] },
    laterPlanningNotes: ['Pass the selected pipelineResolution from the orchestrator.'],
  });

  const result = runInDir(`task save --data '${data}'`, projectRoot);
  const taskDir = path.join(projectRoot, '.fixme', 'tasks');

  assert(!result.ok, 'task save without pipelineResolution should fail');
  assert(result.data.error.includes('task save requires pipelineResolution'), `error should require pipelineResolution, got ${result.data.error}`);
  assert(!fs.existsSync(taskDir) || fs.readdirSync(taskDir).length === 0, 'missing pipelineResolution should not write task artifacts');
});

test('task save: rejects invalid pipeline resolution before writing artifacts', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Reject Removed Alias',
    taskGoal: 'Ensure task save does not create artifacts for invalid workflows.',
    settledSolutionShape: 'Validate the final workflow name before reserving a saved-task label or writing artifacts.',
    agreedApproach: ['Validate the selected workflow before reserving a task number.'],
    userVisibleBehavior: ['Invalid saved-task workflow input fails without creating a saved task.'],
    scope: { inScope: ['task CLI save'], outOfScope: [] },
    laterPlanningNotes: ['Use final workflow names only.'],
    pipelineResolution: {
      pipeline: 'default',
      source: 'explicitPipelineArg',
      evidence: '--pipeline default',
      reason: 'Removed workflow aliases are not valid workflow names.',
    },
  });

  const result = runInDir(`task save --data '${data}'`, projectRoot);
  const taskDir = path.join(projectRoot, '.fixme', 'tasks');

  assert(!result.ok, 'task save with invalid workflow should fail');
  assert(result.data.error.includes('task save pipeline resolution workflow not found'), `error should mention failed workflow lookup, got ${result.data.error}`);
  assert(!fs.existsSync(path.join(taskDir, '.counter')), 'counter should not advance when pipeline resolution is invalid');
  assert(!fs.existsSync(taskDir) || fs.readdirSync(taskDir).length === 0, 'invalid pipeline resolution should not write task artifacts');
});

test('task save: rejects skeletal handoffs that are not self-contained', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Fix Bridge Issues',
    taskGoal: 'Fix live bridge indexing and fee estimation.',
    pipelineResolution: {
      pipeline: 'bugfix',
      source: 'userProseIntent',
      evidence: 'User asked to save a bugfix task.',
      reason: 'The requested work is a bugfix.',
    },
  });

  const result = runInDir(`task save --data '${data}'`, projectRoot);

  assert(!result.ok, 'task save should reject a skeletal handoff');
  assert(String(result.data.error).includes('self-contained handoff'), `error should explain the handoff requirement, got ${JSON.stringify(result.data)}`);
  assert(!fs.existsSync(path.join(projectRoot, '.fixme', 'tasks', '.counter')), 'counter should not advance when save is rejected');
});

test('task save: persists explicit pipeline resolution in task state', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Write Technical Specification',
    taskGoal: 'Create a technical specification from a product specification.',
    settledSolutionShape: 'Resume the technical-spec workflow from the saved task state using the explicit pipeline resolution.',
    agreedApproach: ['Use the technical-spec workflow to turn the product specification into deterministic implementation guidance.'],
    userVisibleBehavior: ['A future run can resume the saved specification-writing task without chat context.'],
    scope: {
      inScope: ['Saved task state and technical-spec pipeline resolution'],
      outOfScope: ['Executing the specification-writing phase in this test'],
    },
    laterPlanningNotes: ['Verify the resumed task starts at the technical-spec workflow cursor.'],
    pipelineResolution: {
      pipeline: 'technical-spec',
      source: 'userProseIntent',
      evidence: 'write a technical specification',
      reason: 'Latest user invocation selected specification writing.',
      candidates: [
        {
          pipeline: 'technical-spec',
          source: 'userProseIntent',
          evidence: 'write a technical specification',
          reason: 'Latest user invocation selected specification writing.',
        },
      ],
    },
    source: 'test',
  });

  const result = runInDir(`task save --data '${data}'`, projectRoot);

  assert(result.ok, `task save should succeed, got: ${JSON.stringify(result.data)}`);
  const state = readJson(result.data.statePath);
  assertNoSnakeCaseKeys(state, 'task state');
  assert(state.pipeline === 'technical-spec', `pipeline should be technical-spec, got ${state.pipeline}`);
  assert(state.pipelineResolution.pipeline === 'technical-spec', `pipelineResolution.pipeline should be technical-spec, got ${state.pipelineResolution && state.pipelineResolution.pipeline}`);
  assert(state.pipelineResolution.source === 'userProseIntent', `source should be userProseIntent, got ${state.pipelineResolution && state.pipelineResolution.source}`);
  assert(state.pipelineResolution.evidence === 'write a technical specification', `evidence should be preserved, got ${state.pipelineResolution && state.pipelineResolution.evidence}`);
  assert(state.cursor.phase === 'technical-spec', `cursor should use technical-spec workflow first phase, got ${state.cursor.phase}`);
});

test('task supersede: marks a saved task and state durably and blocks re-init', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const saveDataPath = writeJsonFixture(projectRoot, 'save-task.json', {
    title: 'Superseded Saved Task',
    taskGoal: 'Persist that a saved task was replaced.',
    settledSolutionShape: 'Mark replaced saved tasks through durable frontmatter and sibling state updates.',
    agreedApproach: ['Use a dedicated supersede command instead of prose-only notes.'],
    userVisibleBehavior: ['A replaced saved task no longer resumes as active work.'],
    scope: {
      inScope: ['Saved task supersession state'],
      outOfScope: ['Ticket state transitions'],
    },
    laterPlanningNotes: ['The replacement task contains the corrected scope.'],
    pipelineResolution: {
      pipeline: 'standard',
      source: 'explicitPipelineArg',
      evidence: '--pipeline standard',
      reason: 'Test supplies the selected workflow explicitly.',
    },
    source: 'test',
  });
  const saved = runInDir(`task save --data-file "${saveDataPath}"`, projectRoot);
  assert(saved.ok, `task save should succeed, got: ${JSON.stringify(saved.data)}`);

  const superseded = runInDir('task supersede --task FIXME-1 --by FIXME-2 --reason "Replaced by corrected saved task"', projectRoot);
  assert(superseded.ok, `task supersede should succeed, got: ${JSON.stringify(superseded.data)}`);
  assertNoSnakeCaseKeys(superseded.data, 'task supersede output');
  assert(superseded.data.status === 'superseded', `status should be superseded, got ${superseded.data.status}`);
  assert(superseded.data.supersededBy === 'FIXME-2', `supersededBy should be FIXME-2, got ${superseded.data.supersededBy}`);
  assert(superseded.data.stateUpdated === true, 'task supersede should update sibling state JSON');

  const taskMarkdown = fs.readFileSync(saved.data.taskPath, 'utf8');
  assert(/^status:\s+"?superseded"?$/m.test(taskMarkdown), 'task frontmatter should be marked superseded');
  assert(/^supersededBy:\s+"?FIXME-2"?$/m.test(taskMarkdown), 'task frontmatter should record replacement reference');
  assert(taskMarkdown.includes('supersedeReason: "Replaced by corrected saved task"'), 'task frontmatter should record supersede reason');

  const state = readJson(saved.data.statePath);
  assertNoSnakeCaseKeys(state, 'superseded task state');
  assert(state.status === 'superseded', `state status should be superseded, got ${state.status}`);
  assert(state.supersededBy === 'FIXME-2', `state supersededBy should be FIXME-2, got ${state.supersededBy}`);
  assert(state.supersedeReason === 'Replaced by corrected saved task', `state reason should be preserved, got ${state.supersedeReason}`);

  const initialized = runInDir(`task init --task "${saved.data.taskPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(!initialized.ok, 'task init should reject superseded saved task briefs');
  assert(cliErrorMessage(initialized).includes('is superseded by FIXME-2'), `error should mention replacement task, got ${cliErrorMessage(initialized)}`);
});

test('task resolve: resolves FIXME label and task path to canonical state paths', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Resolve Saved Task',
    taskGoal: 'Resolve a saved task by label.',
    settledSolutionShape: 'Keep the task markdown and sibling state as the canonical references for every supported resume form.',
    agreedApproach: ['Save a standalone task, then resolve it by visible label, task path, and state path.'],
    userVisibleBehavior: ['A user can resume the same saved task through each supported reference form.'],
    scope: {
      inScope: ['Standalone task save and task reference resolution'],
      outOfScope: ['Ticket-backed task resolution'],
    },
    laterPlanningNotes: ['Assert each reference resolves to the same canonical task and state paths.'],
    pipelineResolution: {
      pipeline: 'plan-only',
      source: 'explicitPipelineArg',
      evidence: '--pipeline plan-only',
      reason: 'Test supplies the selected workflow explicitly.',
    },
    source: 'test',
  });

  const saved = runInDir(`task save --data '${data}'`, projectRoot);
  assert(saved.ok, `task save should succeed, got: ${JSON.stringify(saved.data)}`);

  const byLabel = runInDir('task resolve FIXME-1', projectRoot);
  assert(byLabel.ok, `task resolve label should succeed, got: ${JSON.stringify(byLabel.data)}`);
  assertNoSnakeCaseKeys(byLabel.data, 'task resolve label output');
  assert(byLabel.data.mode === 'standalone', `mode should be standalone, got ${byLabel.data.mode}`);
  assert(byLabel.data.taskRef === 'FIXME-1', `taskRef should be FIXME-1, got ${byLabel.data.taskRef}`);
  assert(byLabel.data.taskPath === saved.data.taskPath, 'label resolve should return saved task path');
  assert(byLabel.data.statePath === saved.data.statePath, 'label resolve should return saved state path');

  const byTaskPath = runInDir(`task resolve "${saved.data.taskPath}"`, projectRoot);
  assert(byTaskPath.ok, `task resolve path should succeed, got: ${JSON.stringify(byTaskPath.data)}`);
  assert(byTaskPath.data.taskPath === saved.data.taskPath, 'path resolve should return saved task path');
  assert(byTaskPath.data.statePath === saved.data.statePath, 'path resolve should return saved state path');

  const byStatePath = runInDir(`task resolve "${saved.data.statePath}"`, projectRoot);
  assert(byStatePath.ok, `task resolve state path should succeed, got: ${JSON.stringify(byStatePath.data)}`);
  assert(byStatePath.data.taskPath === saved.data.taskPath, 'state resolve should return saved task path');
  assert(byStatePath.data.statePath === saved.data.statePath, 'state resolve should return saved state path');
});

test('task attach-artifact: indexes preparation artifact on saved task brief and state', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Prepare Saved Task',
    taskGoal: 'Prepare a saved task for implementation.',
    settledSolutionShape: 'Attach preparation artifacts directly to the saved task instead of relying on chat history or filesystem recency.',
    agreedApproach: ['Attach preparation artifacts to the saved task instead of relying on chat history.'],
    userVisibleBehavior: ['A future resume can discover the attached preparation artifact from the saved task.'],
    scope: {
      inScope: ['Saved task preparation artifact indexing'],
      outOfScope: ['Executing the prepared task'],
    },
    laterPlanningNotes: ['Read the attached preparation artifacts before planning execution.'],
    pipelineResolution: {
      pipeline: 'standard',
      source: 'explicitPipelineArg',
      evidence: '--pipeline standard',
      reason: 'Test supplies the selected workflow explicitly.',
    },
    source: 'test',
  });

  const saved = runInDir(`task save --data '${data}'`, projectRoot);
  assert(saved.ok, `task save should succeed, got: ${JSON.stringify(saved.data)}`);

  const researchDir = path.join(projectRoot, '.fixme', 'research', '2026-06-05-prepare-saved-task');
  fs.mkdirSync(researchDir, { recursive: true });
  const researchPath = path.join(researchDir, 'research.md');
  fs.writeFileSync(researchPath, '# Research\n\nEvidence-backed approach.\n');

  const artifactData = JSON.stringify({
    artifactType: 'research',
    artifactPath: researchPath,
    title: 'Validate approach',
    summary: [
      'Checked the saved task approach against codebase evidence.',
      'Planner should use the attached research before execution.',
    ],
    sourceSkill: 'fixme-research',
    status: 'current',
  });

  const attached = runInDir(`task attach-artifact --task FIXME-1 --data '${artifactData}'`, projectRoot);

  assert(attached.ok, `task attach-artifact should succeed, got: ${JSON.stringify(attached.data)}`);
  assertNoSnakeCaseKeys(attached.data, 'task attach-artifact output');
  assert(attached.data.taskRef === 'FIXME-1', `taskRef should be FIXME-1, got ${attached.data.taskRef}`);
  assert(attached.data.taskPath === saved.data.taskPath, 'attach output should include saved task path');
  assert(attached.data.artifact.artifactType === 'research', `artifactType should be research, got ${attached.data.artifact && attached.data.artifact.artifactType}`);
  assert(attached.data.artifact.artifactPath === researchPath, 'artifact path should be preserved');

  const taskMarkdown = fs.readFileSync(saved.data.taskPath, 'utf8');
  assert(taskMarkdown.includes('## Preparation Artifacts'), 'saved task brief should include preparation artifact section');
  assert(taskMarkdown.includes('### Research: Validate approach'), 'artifact title should be indexed in markdown');
  assert(taskMarkdown.includes(`- **Path:** \`${researchPath}\``), 'artifact path should be indexed in markdown');
  assert(taskMarkdown.includes('- Checked the saved task approach against codebase evidence.'), 'artifact summary should be indexed in markdown');

  const state = readJson(saved.data.statePath);
  assertNoSnakeCaseKeys(state, 'task state with preparation artifact');
  assert(Array.isArray(state.artifacts.preparationArtifacts), 'state should track preparation artifacts');
  assert(state.artifacts.preparationArtifacts.length === 1, `state should have one preparation artifact, got ${state.artifacts.preparationArtifacts.length}`);
  assert(state.artifacts.preparationArtifacts[0].artifactPath === researchPath, 'state artifact path should match');
});

test('task init: creates ticket-backed task state and resolves ticket folder', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'resume-ticket', 'queued');
  const ticketDir = path.dirname(ticketPath);

  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);

  assert(initialized.ok, `task init should succeed, got: ${JSON.stringify(initialized.data)}`);
  assertNoSnakeCaseKeys(initialized.data, 'task init output');
  assert(initialized.data.mode === 'ticket', `mode should be ticket, got ${initialized.data.mode}`);
  assert(initialized.data.taskRef === null, `taskRef should be null, got ${initialized.data.taskRef}`);
  assert(initialized.data.taskPath === null, `taskPath should be null, got ${initialized.data.taskPath}`);
  assert(initialized.data.ticketPath === ticketPath, 'ticketPath should match input ticket path');
  assert(initialized.data.statePath === path.join(ticketDir, 'task-state.json'), 'statePath should be beside ticket.md');
  assert(fs.existsSync(initialized.data.statePath), 'ticket task state should exist');

  const state = readJson(initialized.data.statePath);
  assertNoSnakeCaseKeys(state, 'ticket task state');
  assert(state.schemaVersion === 1, 'schemaVersion should be 1');
  assert(fs.realpathSync(state.projectRoot) === fs.realpathSync(projectRoot), `projectRoot should be ${projectRoot}, got ${state.projectRoot}`);
  assert(state.pipeline === 'standard', `pipeline should be standard, got ${state.pipeline}`);
  assert(state.pipelineResolution.pipeline === 'standard', `pipelineResolution.pipeline should be standard, got ${state.pipelineResolution && state.pipelineResolution.pipeline}`);
  assert(state.pipelineResolution.source === 'explicitPipelineArg', `pipelineResolution.source should be explicitPipelineArg, got ${state.pipelineResolution && state.pipelineResolution.source}`);
  assert(state.pipelineResolution.evidence === '--pipeline standard', `pipelineResolution.evidence should mention --pipeline standard, got ${state.pipelineResolution && state.pipelineResolution.evidence}`);
  assert(state.cursor.phase === 'plan', `cursor.phase should be plan, got ${state.cursor.phase}`);

  const resolved = runInDir(`task resolve "${ticketDir}"`, projectRoot);
  assert(resolved.ok, `task resolve ticket folder should succeed, got: ${JSON.stringify(resolved.data)}`);
  assertNoSnakeCaseKeys(resolved.data, 'task resolve ticket output');
  assert(resolved.data.mode === 'ticket', `mode should be ticket, got ${resolved.data.mode}`);
  assert(resolved.data.ticketPath === ticketPath, 'resolved ticketPath should match ticket path');
  assert(resolved.data.statePath === initialized.data.statePath, 'resolved statePath should match initialized state path');
});

test('task init: rejects obsolete --pipeline shortcut', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0002', 'shortcut-ticket', 'queued');

  const initialized = runInDir(`task init --ticket "${ticketPath}" --pipeline standard --project-root "${projectRoot}"`, projectRoot);

  assert(!initialized.ok, 'task init should reject obsolete --pipeline shortcut');
  assert(initialized.data.error.includes('task init no longer accepts --pipeline'), `error should mention --pipeline-resolution, got ${initialized.data.error}`);
  assert(!fs.existsSync(path.join(path.dirname(ticketPath), 'task-state.json')), 'rejected shortcut must not write task state');
});

test('task init: requires pipeline resolution before writing task state', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0003', 'missing-resolution-ticket', 'queued');

  const initialized = runInDir(`task init --ticket "${ticketPath}" --project-root "${projectRoot}"`, projectRoot);

  assert(!initialized.ok, 'task init without pipeline resolution should fail');
  assert(initialized.data.error.includes('task init requires --pipeline-resolution'), `error should require --pipeline-resolution, got ${initialized.data.error}`);
  assert(!fs.existsSync(path.join(path.dirname(ticketPath), 'task-state.json')), 'missing pipeline resolution must not write task state');
});

test('task init: persists provided pipeline resolution in ticket-backed task state', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0003', 'bug-ticket', 'queued');
  const resolution = JSON.stringify({
    pipeline: 'bugfix',
    source: 'userProseIntent',
    evidence: 'debug checkout failure',
    reason: 'Latest user invocation reports a bug that needs investigation.',
    candidates: [
      {
        pipeline: 'bugfix',
        source: 'userProseIntent',
        evidence: 'debug checkout failure',
        reason: 'Latest user invocation reports a bug that needs investigation.',
      },
    ],
  });

  const initialized = runInDir(`task init --ticket "${ticketPath}" --pipeline-resolution '${resolution}' --project-root "${projectRoot}"`, projectRoot);

  assert(initialized.ok, `task init should succeed, got: ${JSON.stringify(initialized.data)}`);
  const state = readJson(initialized.data.statePath);
  assertNoSnakeCaseKeys(state, 'ticket task state');
  assert(state.pipeline === 'bugfix', `pipeline should be bugfix, got ${state.pipeline}`);
  assert(state.pipelineResolution.pipeline === 'bugfix', `pipelineResolution.pipeline should be bugfix, got ${state.pipelineResolution && state.pipelineResolution.pipeline}`);
  assert(state.pipelineResolution.source === 'userProseIntent', `source should be userProseIntent, got ${state.pipelineResolution && state.pipelineResolution.source}`);
  assert(state.pipelineResolution.evidence === 'debug checkout failure', `evidence should be preserved, got ${state.pipelineResolution && state.pipelineResolution.evidence}`);
  assert(state.cursor.phase === 'investigate', `cursor should use bugfix workflow first phase, got ${state.cursor.phase}`);
});

test('task init: cursor uses custom workflow first phase skill', () => {
  const projectRoot = createTmpDir();
  writeProjectConfig(projectRoot, {
    workflows: {
      custom: workflowWithPhases([
        { name: 'triage', skills: ['fixme-research'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
      ]),
    },
  });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0004', 'custom-ticket', 'queued');

  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('custom')} --project-root "${projectRoot}"`, projectRoot);

  assert(initialized.ok, `task init should succeed, got: ${JSON.stringify(initialized.data)}`);
  const state = readJson(initialized.data.statePath);
  assert(state.pipeline === 'custom', `pipeline should be custom, got ${state.pipeline}`);
  assert(state.cursor.phase === 'triage', `cursor phase should use first custom phase, got ${state.cursor.phase}`);
  assert(state.cursor.skill === 'fixme-research', `cursor skill should use first custom phase skill, got ${state.cursor.skill}`);
});

test('task init: rejects non-markdown task paths without overwriting input', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const taskPath = path.join(projectRoot, 'not-a-task.txt');
  fs.writeFileSync(taskPath, 'keep this content');

  const initialized = runInDir(`task init --task "${taskPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);

  assert(!initialized.ok, 'task init should reject non-markdown task paths');
  assert(initialized.data.error.includes('Task path must end with .md'), `error should mention .md task path, got ${initialized.data.error}`);
  assert(fs.readFileSync(taskPath, 'utf8') === 'keep this content', 'task init should not overwrite non-markdown input');
});

test('task checkpoint: merges allowed camelCase state fields and rejects invalid keys', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0002', 'checkpoint-ticket', 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(initialized.ok, `task init should succeed, got: ${JSON.stringify(initialized.data)}`);

  const patch = JSON.stringify({
    cursor: {
      phase: 'implement',
      stage: 'review',
      skill: 'fixme-review-code',
      dispatchMode: 'normal',
    },
    artifacts: {
      planPath: '/abs/.fixme/plans/resume.md',
    },
    handoff: {
      executionSummary: 'Plan executed and verification passed.',
      followUpItems: ['Track low-risk cleanup separately.'],
    },
    loops: {
      phaseReviewCycles: [{ phase: 'plan', cycles: 1 }],
      outerCycles: 0,
    },
  });

  const checkpointed = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '${patch}'`, projectRoot);

  assert(checkpointed.ok, `task checkpoint should succeed, got: ${JSON.stringify(checkpointed.data)}`);
  assertNoSnakeCaseKeys(checkpointed.data, 'task checkpoint output');
  assert(checkpointed.data.statePath === initialized.data.statePath, 'checkpoint should return same statePath');
  const state = readJson(initialized.data.statePath);
  assertNoSnakeCaseKeys(state, 'checkpointed task state');
  assert(state.cursor.phase === 'implement', `cursor.phase should be implement, got ${state.cursor.phase}`);
  assert(state.cursor.stage === 'review', `cursor.stage should be review, got ${state.cursor.stage}`);
  assert(state.artifacts.planPath === '/abs/.fixme/plans/resume.md', `planPath should be updated, got ${state.artifacts.planPath}`);
  assert(state.artifacts.productSpecificationPath === null, 'checkpoint should preserve productSpecificationPath');
  assert(state.handoff.executionSummary === 'Plan executed and verification passed.', 'executionSummary should be updated');
  assert(state.handoff.reviewFindings === null, 'checkpoint should preserve reviewFindings');
  assert(state.handoff.followUpItems.length === 1, 'followUpItems should be updated');
  assert(Array.isArray(state.loops.phaseReviewCycles), 'phaseReviewCycles should remain an array');
  assert(state.loops.phaseReviewCycles[0].phase === 'plan', `phaseReviewCycles[0].phase should be plan, got ${state.loops.phaseReviewCycles[0].phase}`);
  assert(state.loops.phaseReviewCycles[0].cycles === 1, `phaseReviewCycles[0].cycles should be 1, got ${state.loops.phaseReviewCycles[0].cycles}`);
  assert(typeof state.updatedAt === 'string' && !Number.isNaN(Date.parse(state.updatedAt)), `updatedAt should be ISO, got ${state.updatedAt}`);

  const unknownKey = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"taskPath":"/not-allowed"}'`, projectRoot);
  assert(!unknownKey.ok, 'unknown top-level checkpoint key should fail');
  assert(unknownKey.data.error.includes('Unsupported task checkpoint field'), `error should mention unsupported field, got ${unknownKey.data.error}`);

  const snakeKey = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"current_step":5}'`, projectRoot);
  assert(!snakeKey.ok, 'snake_case checkpoint key should fail');
  assert(snakeKey.data.error.includes('camelCase'), `error should mention camelCase, got ${snakeKey.data.error}`);

  const dynamicPhaseKey = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"loops":{"phaseReviewCycles":{"product-spec":1}}}'`, projectRoot);
  assert(!dynamicPhaseKey.ok, 'hyphenated dynamic phase key should fail');
  assert(dynamicPhaseKey.data.error.includes('camelCase'), `error should mention camelCase, got ${dynamicPhaseKey.data.error}`);

  const nestedCurrentStep = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"cursor":{"currentStep":5}}'`, projectRoot);
  assert(!nestedCurrentStep.ok, 'nested currentStep checkpoint field should fail');
  assert(nestedCurrentStep.data.error.includes('Unsupported task checkpoint field'), `error should mention unsupported field, got ${nestedCurrentStep.data.error}`);
  assert(nestedCurrentStep.data.error.includes('cursor.currentStep'), `error should include nested path, got ${nestedCurrentStep.data.error}`);

  const nestedCurrentSpecificationPath = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"artifacts":{"currentSpecificationPath":"/abs/spec.md"}}'`, projectRoot);
  assert(!nestedCurrentSpecificationPath.ok, 'nested currentSpecificationPath checkpoint field should fail');
  assert(nestedCurrentSpecificationPath.data.error.includes('Unsupported task checkpoint field'), `error should mention unsupported field, got ${nestedCurrentSpecificationPath.data.error}`);
  assert(nestedCurrentSpecificationPath.data.error.includes('artifacts.currentSpecificationPath'), `error should include nested path, got ${nestedCurrentSpecificationPath.data.error}`);

  const nestedManifest = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"pendingDecision":{"manifest":[{"step":1}]}}'`, projectRoot);
  assert(!nestedManifest.ok, 'nested manifest checkpoint field should fail');
  assert(nestedManifest.data.error.includes('Unsupported task checkpoint field'), `error should mention unsupported field, got ${nestedManifest.data.error}`);
  assert(nestedManifest.data.error.includes('pendingDecision.manifest'), `error should include nested path, got ${nestedManifest.data.error}`);

  const invalidStatus = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"status":{"state":"running"}}'`, projectRoot);
  assert(!invalidStatus.ok, 'object status checkpoint value should fail');
  assert(invalidStatus.data.error.includes('status must be a non-empty string'), `status error should mention string value, got ${invalidStatus.data.error}`);

  const invalidCursor = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"cursor":"implement"}'`, projectRoot);
  assert(!invalidCursor.ok, 'string cursor checkpoint value should fail');
  assert(invalidCursor.data.error.includes('cursor must be a JSON object'), `cursor error should mention object value, got ${invalidCursor.data.error}`);

  const invalidCursorPhase = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"cursor":{"phase":{}}}'`, projectRoot);
  assert(!invalidCursorPhase.ok, 'object cursor.phase checkpoint value should fail');
  assert(invalidCursorPhase.data.error.includes('cursor.phase must be a non-empty string'), `cursor phase error should mention string value, got ${invalidCursorPhase.data.error}`);

  const invalidOuterCycles = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"loops":{"outerCycles":-1}}'`, projectRoot);
  assert(!invalidOuterCycles.ok, 'negative outerCycles checkpoint value should fail');
  assert(invalidOuterCycles.data.error.includes('loops.outerCycles must be a non-negative integer'), `outerCycles error should mention non-negative integer, got ${invalidOuterCycles.data.error}`);

  const invalidPendingDecision = runInDir(`task checkpoint --state "${initialized.data.statePath}" --data '{"pendingDecision":"ask user"}'`, projectRoot);
  assert(!invalidPendingDecision.ok, 'string pendingDecision checkpoint value should fail');
  assert(invalidPendingDecision.data.error.includes('pendingDecision must be null or a JSON object'), `pendingDecision error should mention null or object, got ${invalidPendingDecision.data.error}`);
});

function initTaskState(slug) {
  const projectRoot = createTmpDir();
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const sessionDir = path.join(fixmeDir, 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', slug, 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(initialized.ok, `task init should succeed, got: ${JSON.stringify(initialized.data)}`);
  return { projectRoot, fixmeDir, statePath: initialized.data.statePath };
}

test('task state initializes parentContinuation/decisions/terminalResult', () => {
  const { statePath } = initTaskState('schema-init');
  const state = readJson(statePath);
  assert(state.parentContinuation === null, `parentContinuation should default null, got ${JSON.stringify(state.parentContinuation)}`);
  assert(Array.isArray(state.decisions) && state.decisions.length === 0, `decisions should default [], got ${JSON.stringify(state.decisions)}`);
  assert(state.terminalResult === null, `terminalResult should default null, got ${JSON.stringify(state.terminalResult)}`);
});

test('task state initializes and validates producer continuation entries', () => {
  const { projectRoot, statePath } = initTaskState('producer-continuation-schema');
  let state = readJson(statePath);

  assert(Array.isArray(state.producerContinuations), 'producerContinuations should default to an array');
  assert(state.producerContinuations.length === 0, 'producerContinuations should default empty');

  const availableHandle = {
    producerContinuations: [
      {
        agentName: 'fixme-write-plan',
        runtime: 'codex',
        runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_1' },
        status: 'available',
        lastDispatchId: 'dispatch_plan_1',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
    ],
  };

  let result = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify(availableHandle)}'`,
    projectRoot,
  );
  assert(result.ok, `expected valid producer continuation to checkpoint: ${result.stderr || result.stdout}`);

  state = readJson(statePath);
  assert(state.producerContinuations[0].runtimeHandle.id === 'agent_plan_1', 'should persist exact handle id');

  const nonResumableHandle = {
    producerContinuations: [
      {
        agentName: 'fixme-review-plan',
        runtime: 'codex',
        runtimeHandle: { kind: 'codexAgentId', id: 'agent_review_1' },
        status: 'available',
        lastDispatchId: 'dispatch_review_1',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
    ],
  };

  result = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify(nonResumableHandle)}'`,
    projectRoot,
  );
  assert(!result.ok, 'checkpoint should reject non-resumable producer continuation entries');
  assert(
    cliErrorMessage(result).includes('producerContinuations[0].agentName'),
    'error should identify the invalid producer continuation agent',
  );

  const mismatchedHandle = {
    producerContinuations: [
      {
        agentName: 'fixme-write-plan',
        runtime: 'codex',
        runtimeHandle: { kind: 'claudeAgentId', id: 'agent_wrong_runtime' },
        status: 'available',
        lastDispatchId: 'dispatch_wrong_runtime',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
    ],
  };

  result = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify(mismatchedHandle)}'`,
    projectRoot,
  );
  assert(!result.ok, 'checkpoint should reject runtime handle kind mismatches');
  assert(
    cliErrorMessage(result).includes('runtimeHandle.kind'),
    'error should identify the mismatched runtime handle kind',
  );

  const dualRuntimeHandles = {
    producerContinuations: [
      {
        agentName: 'fixme-write-plan',
        runtime: 'codex',
        runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_codex' },
        status: 'available',
        lastDispatchId: 'dispatch_plan_codex',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
      {
        agentName: 'fixme-write-plan',
        runtime: 'claude',
        runtimeHandle: { kind: 'claudeAgentId', id: 'agent_plan_claude' },
        status: 'available',
        lastDispatchId: 'dispatch_plan_claude',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
    ],
  };

  result = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify(dualRuntimeHandles)}'`,
    projectRoot,
  );
  assert(result.ok, `same producer across different runtimes should checkpoint: ${JSON.stringify(result.data)}`);

  const duplicateRuntimeHandles = {
    producerContinuations: [
      {
        agentName: 'fixme-write-plan',
        runtime: 'codex',
        runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_codex_1' },
        status: 'available',
        lastDispatchId: 'dispatch_plan_codex_1',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
      {
        agentName: 'fixme-write-plan',
        runtime: 'codex',
        runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_codex_2' },
        status: 'available',
        lastDispatchId: 'dispatch_plan_codex_2',
        badReason: null,
        updatedAt: '2026-06-12T00:00:00.000Z',
      },
    ],
  };

  result = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify(duplicateRuntimeHandles)}'`,
    projectRoot,
  );
  assert(!result.ok, 'checkpoint should reject duplicate producer continuation entries for the same agent/runtime');
  assert(
    cliErrorMessage(result).includes('duplicate producerContinuations entry for fixme-write-plan/codex'),
    `duplicate error should name the duplicate agent/runtime, got: ${cliErrorMessage(result)}`,
  );
});

test('dispatch prepare selects exact producer continuation handles and reports fresh fallback reasons', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('producer-continuation-select');

  const checkpoint = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify({
      producerContinuations: [
        {
          agentName: 'fixme-write-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_1' },
          status: 'available',
          lastDispatchId: 'dispatch_plan_1',
          badReason: null,
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
      ],
    })}'`,
    projectRoot,
  );
  assert(checkpoint.ok, `expected checkpoint setup to pass: ${checkpoint.stderr || checkpoint.stdout}`);

  const resume = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-resume-plan',
      agentName: 'fixme-write-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'plan' },
    })}'`,
    projectRoot,
  );

  assert(resume.ok, `expected dispatch prepare to pass: ${resume.stderr || resume.stdout}`);
  assert(resume.data.continuation.mode === 'resume', 'expected exact handle to resume');
  assert(resume.data.continuation.reason === 'exactHandle', 'expected exactHandle reason');
  assert(resume.data.continuation.runtimeHandle.id === 'agent_plan_1', 'expected exact stored handle id');
  assert(
    resume.data.promptBlocks.continuation.runtimeHandle.id === 'agent_plan_1',
    'prompt blocks should carry the continuation decision for dispatch instructions',
  );

  const nonResumable = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-review-fresh',
      agentName: 'fixme-review-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'review' },
    })}'`,
    projectRoot,
  );

  assert(nonResumable.ok, `expected non-resumable prepare to pass: ${nonResumable.stderr || nonResumable.stdout}`);
  assert(nonResumable.data.continuation.mode === 'fresh', 'reviewer should always dispatch fresh');
  assert(nonResumable.data.continuation.reason === 'agentNotResumable', 'reviewer should report non-resumable reason');

  const missingHandle = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-executor-no-handle',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );

  assert(missingHandle.ok, `expected missing-handle prepare to pass: ${missingHandle.stderr || missingHandle.stdout}`);
  assert(missingHandle.data.continuation.mode === 'fresh', 'missing exact handle should dispatch fresh');
  assert(missingHandle.data.continuation.reason === 'noStoredHandle', 'missing exact handle should be recorded');
});

test('dispatch prepare durable inputs include producer continuation controls', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('producer-continuation-idempotency-controls');

  const allowFirst = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-idempotency-allow',
      agentName: 'fixme-write-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: false,
      promptInputs: { mode: 'plan' },
    })}'`,
    projectRoot,
  );
  assert(allowFirst.ok, `first allow-control prepare should pass: ${JSON.stringify(allowFirst.data)}`);

  const allowConflict = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-idempotency-allow',
      agentName: 'fixme-write-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'plan' },
    })}'`,
    projectRoot,
  );
  assert(
    !allowConflict.ok && allowConflict.data?.error?.code === 'conflictingDuplicate',
    `changed allowProducerContinuation should conflict, got ${JSON.stringify(allowConflict.data)}`,
  );

  const forcedFirst = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-idempotency-force',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      forceFreshReason: 'runtimeResumeFailed',
      promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );
  assert(forcedFirst.ok, `first forceFreshReason prepare should pass: ${JSON.stringify(forcedFirst.data)}`);

  const forcedConflict = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-idempotency-force',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      forceFreshReason: 'producerContinuationRejected',
      promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );
  assert(
    !forcedConflict.ok && forcedConflict.data?.error?.code === 'conflictingDuplicate',
    `changed forceFreshReason should conflict, got ${JSON.stringify(forcedConflict.data)}`,
  );

  assert(fs.readdirSync(path.join(fixmeDir, 'runs')).length === 2, 'conflicting same-key prepares should not create extra child run statuses');
});

test('dispatch complete stores runtime handles for resumable producers only', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('producer-continuation-complete');

  const prepare = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-complete-plan',
      agentName: 'fixme-write-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'plan' },
    })}'`,
    projectRoot,
  );
  assert(prepare.ok, `expected prepare to pass: ${prepare.stderr || prepare.stdout}`);

  const complete = runInDir(
    `lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      dispatchId: prepare.data.dispatchId,
      statusId: prepare.data.statusId,
      status: 'completed',
      runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_after_success' },
    })}'`,
    projectRoot,
  );
  assert(complete.ok, `expected complete with runtime handle to pass: ${complete.stderr || complete.stdout}`);

  const state = readJson(statePath);
  assert(state.producerContinuations.length === 1, 'expected one producer continuation entry');
  assert(state.producerContinuations[0].agentName === 'fixme-write-plan', 'expected plan producer entry');
  assert(state.producerContinuations[0].runtime === 'codex', 'expected Codex runtime entry');
  assert(state.producerContinuations[0].runtimeHandle.id === 'agent_plan_after_success', 'expected stored runtime handle id');
  assert(state.producerContinuations[0].lastDispatchId === prepare.data.dispatchId, 'expected last dispatch id to be recorded');

  const nextPrepare = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-complete-next',
      agentName: 'fixme-write-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'plan-repair' },
    })}'`,
    projectRoot,
  );
  assert(nextPrepare.ok, `expected next prepare to pass: ${nextPrepare.stderr || nextPrepare.stdout}`);
  assert(nextPrepare.data.continuation.mode === 'resume', 'next producer dispatch should resume stored handle');
  assert(nextPrepare.data.continuation.runtimeHandle.id === 'agent_plan_after_success', 'next dispatch should use stored handle');
});

test('dispatch complete rejects runtime handles for non-resumable agents', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('producer-continuation-reviewer-reject');

  const prepare = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-review-complete',
      agentName: 'fixme-review-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'review' },
    })}'`,
    projectRoot,
  );
  assert(prepare.ok, `expected reviewer prepare to pass: ${prepare.stderr || prepare.stdout}`);
  assert(prepare.data.continuation.mode === 'fresh', 'reviewer should prepare fresh');

  const complete = runInDir(
    `lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      dispatchId: prepare.data.dispatchId,
      statusId: prepare.data.statusId,
      status: 'completed',
      runtimeHandle: { kind: 'codexAgentId', id: 'agent_review_after_success' },
    })}'`,
    projectRoot,
  );
  assert(!complete.ok, 'reviewer completion should reject runtime handle recording');
  assert(
    cliErrorMessage(complete).includes('runtimeHandle'),
    'error should identify invalid runtime handle recording',
  );
  const rejectedStatus = readJson(prepare.data.statusPath);
  assert(rejectedStatus.state === 'running', 'rejected runtime handle should leave child status running');
  assert(rejectedStatus.checkpoint !== 'done', 'rejected runtime handle should not mark child checkpoint done');
});

test('dispatch prepare falls back for bad handles and forced fresh dispatch', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('producer-continuation-fallback');

  const checkpoint = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify({
      producerContinuations: [
        {
          agentName: 'fixme-execute-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_executor_1' },
          status: 'available',
          lastDispatchId: 'dispatch_executor_1',
          badReason: null,
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
      ],
    })}'`,
    projectRoot,
  );
  assert(checkpoint.ok, `expected available handle checkpoint to pass: ${checkpoint.stderr || checkpoint.stdout}`);

  const resume = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-fallback-resume',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );
  assert(resume.ok, `expected resume prepare to pass: ${resume.stderr || resume.stdout}`);
  assert(resume.data.continuation.mode === 'resume', 'available executor handle should resume');

  const markBad = runInDir(
    `task producer-continuation mark-bad --state "${statePath}" --agent-name fixme-execute-plan --runtime codex --reason "resume_agent failed"`,
    projectRoot,
  );
  assert(markBad.ok, `expected mark-bad helper to pass: ${markBad.stderr || markBad.stdout}`);

  const badHandle = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-fallback-bad',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );
  assert(badHandle.ok, `expected bad-handle prepare to pass: ${badHandle.stderr || badHandle.stdout}`);
  assert(badHandle.data.continuation.mode === 'fresh', 'bad handle should dispatch fresh');
  assert(badHandle.data.continuation.reason === 'storedHandleBad', 'bad handle reason should be recorded');

  const forceFresh = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-fallback-force-fresh',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      forceFreshReason: 'runtimeResumeFailed',
      promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );
  assert(forceFresh.ok, `expected forced-fresh prepare to pass: ${forceFresh.stderr || forceFresh.stdout}`);
  assert(forceFresh.data.continuation.mode === 'fresh', 'forced fresh should bypass any stored handle');
  assert(forceFresh.data.continuation.reason === 'forcedFresh', 'forced fresh reason should be recorded');
  assert(forceFresh.data.continuation.forceFreshReason === 'runtimeResumeFailed', 'specific forced-fresh reason should be preserved');
});

test('task producer-continuation mark-bad preserves sibling handles', () => {
  const { projectRoot, statePath } = initTaskState('producer-continuation-preserve-siblings');

  const checkpoint = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify({
      producerContinuations: [
        {
          agentName: 'fixme-write-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_sibling' },
          status: 'available',
          lastDispatchId: 'dispatch_plan_sibling',
          badReason: null,
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
        {
          agentName: 'fixme-execute-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_executor_bad' },
          status: 'available',
          lastDispatchId: 'dispatch_executor_bad',
          badReason: null,
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
      ],
    })}'`,
    projectRoot,
  );
  assert(checkpoint.ok, `expected two-handle setup to pass: ${checkpoint.stderr || checkpoint.stdout}`);

  const markBad = runInDir(
    `task producer-continuation mark-bad --state "${statePath}" --agent-name fixme-execute-plan --runtime codex --reason "resume_agent failed"`,
    projectRoot,
  );
  assert(markBad.ok, `expected mark-bad helper to pass: ${markBad.stderr || markBad.stdout}`);

  const state = readJson(statePath);
  assert(state.producerContinuations.length === 2, 'mark-bad should preserve both continuation entries');

  const plan = state.producerContinuations.find((entry) => entry.agentName === 'fixme-write-plan');
  const executor = state.producerContinuations.find((entry) => entry.agentName === 'fixme-execute-plan');

  assert(plan && plan.status === 'available', 'sibling plan handle should remain available');
  assert(plan.runtimeHandle.id === 'agent_plan_sibling', 'sibling plan handle id should be preserved');
  assert(executor && executor.status === 'bad', 'matching executor handle should be marked bad');
  assert(executor.badReason === 'resume_agent failed', 'bad reason should be recorded on matching handle');
});

test('executor continuation survives changed prompt inputs for plan-required rework', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('producer-continuation-executor-rework');

  const checkpoint = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify({
      producerContinuations: [
        {
          agentName: 'fixme-execute-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_executor_rework' },
          status: 'available',
          lastDispatchId: 'dispatch_executor_rework',
          badReason: null,
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
      ],
    })}'`,
    projectRoot,
  );
  assert(checkpoint.ok, `expected executor handle checkpoint to pass: ${checkpoint.stderr || checkpoint.stdout}`);

  const implementationRepair = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-executor-repair',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'implementation-repair', codeReview: 'repair current implementation' },
    })}'`,
    projectRoot,
  );
  assert(implementationRepair.ok, `expected repair prepare to pass: ${implementationRepair.stderr || implementationRepair.stdout}`);
  assert(implementationRepair.data.continuation.mode === 'resume', 'implementation repair should resume exact executor handle');
  assert(implementationRepair.data.continuation.runtimeHandle.id === 'agent_executor_rework', 'repair should use exact executor handle');

  const planRequiredRework = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'producer-continuation-executor-plan-required',
      agentName: 'fixme-execute-plan',
      transport: 'agent',
      runtime: 'codex',
      taskStatePath: statePath,
      allowProducerContinuation: true,
      promptInputs: { mode: 'plan-required-rework', planPath: '/tmp/current-plan.md', codeMapPath: '/tmp/current-code-map.md' },
    })}'`,
    projectRoot,
  );
  assert(planRequiredRework.ok, `expected plan-required prepare to pass: ${planRequiredRework.stderr || planRequiredRework.stdout}`);
  assert(planRequiredRework.data.continuation.mode === 'resume', 'plan-required rework should resume exact executor handle');
  assert(planRequiredRework.data.continuation.runtimeHandle.id === 'agent_executor_rework', 'plan-required rework should use exact executor handle');
});

test('task checkpoint accepts well-formed parentContinuation', () => {
  const { projectRoot, statePath } = initTaskState('schema-pc-ok');
  const data = JSON.stringify({
    parentContinuation: {
      parentSkill: 'fixme-pr-comments',
      parentRunId: 'parent_x',
      transport: 'inline-skill',
      resumeStep: 'verify',
      parentStatusId: 'run_x',
    },
  });
  const result = runInDir(`task checkpoint --state "${statePath}" --data '${data}'`, projectRoot);
  assert(result.ok, `checkpoint should accept parentContinuation, got: ${JSON.stringify(result.data)}`);
  const state = readJson(statePath);
  assert(state.parentContinuation.parentSkill === 'fixme-pr-comments', 'parentContinuation persisted');
  assert(state.parentContinuation.transport === 'inline-skill', 'transport persisted');
});

test('task checkpoint rejects malformed parentContinuation', () => {
  const { projectRoot, statePath } = initTaskState('schema-pc-bad');
  const emptySkill = runInDir(`task checkpoint --state "${statePath}" --data '{"parentContinuation":{"parentSkill":""}}'`, projectRoot);
  assert(!emptySkill.ok, 'empty parentSkill should fail');
  assert(emptySkill.data.error.includes('must be'), `error should mention must be, got ${emptySkill.data.error}`);

  const unknownField = runInDir(`task checkpoint --state "${statePath}" --data '{"parentContinuation":{"parentSkill":"fixme-task","parentRunId":"p","transport":"agent","resumeStep":"s","parentStatusId":"r","bogus":"x"}}'`, projectRoot);
  assert(!unknownField.ok, 'unknown parentContinuation field should fail');
  assert(unknownField.data.error.includes('Unsupported parentContinuation field'), `error should mention unsupported, got ${unknownField.data.error}`);

  const badTransport = runInDir(`task checkpoint --state "${statePath}" --data '{"parentContinuation":{"parentSkill":"fixme-task","parentRunId":"p","transport":"rocket","resumeStep":"s","parentStatusId":"r"}}'`, projectRoot);
  assert(!badTransport.ok, 'invalid transport should fail');
  assert(badTransport.data.error.includes('transport must be one of'), `error should mention transport, got ${badTransport.data.error}`);
});

test('task checkpoint accepts terminalResult and decisions array', () => {
  const { projectRoot, statePath } = initTaskState('schema-tr');
  const tr = runInDir(`task checkpoint --state "${statePath}" --data '{"terminalResult":{"terminalResultId":"terminalResult_x","status":"completed"}}'`, projectRoot);
  assert(tr.ok, `terminalResult checkpoint should succeed, got: ${JSON.stringify(tr.data)}`);
  const decisions = runInDir(`task checkpoint --state "${statePath}" --data '{"decisions":[]}'`, projectRoot);
  assert(decisions.ok, `decisions array checkpoint should succeed, got: ${JSON.stringify(decisions.data)}`);
  const badTr = runInDir(`task checkpoint --state "${statePath}" --data '{"terminalResult":{"terminalResultId":"t","status":"weird"}}'`, projectRoot);
  assert(!badTr.ok, 'invalid terminalResult.status should fail');
  assert(badTr.data.error.includes('terminalResult.status must be one of'), `error should mention status, got ${badTr.data.error}`);
});

function completeDecision(id, overrides = {}) {
  return JSON.stringify({
    id,
    attentionId: `attn_${id}`,
    sourceSkill: 'fixme-handle-code-review',
    prompt: `prompt ${id}`,
    answer: `answer ${id}`,
    interpretation: `interpretation ${id}`,
    status: 'active',
    supersedesDecisionIds: [],
    supersededByDecisionId: null,
    createdAt: '2026-06-08T00:00:00.000Z',
    ...overrides,
  });
}

function completeDecisionObject(id, overrides = {}) {
  return JSON.parse(completeDecision(id, overrides));
}

console.log('\n=== task decision append/list tests ===\n');

test('task decision append writes structured decision and returns merged context', () => {
  const { projectRoot, statePath } = initTaskState('decision-basic');
  const result = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1')}'`, projectRoot);
  assert(result.ok, `append should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.ok === true, 'envelope ok:true');
  assert(result.data.decision && result.data.decision.id === 'decision_1', 'decision returned');
  assert(Array.isArray(result.data.taskDecisions) && result.data.taskDecisions.some(d => d.id === 'decision_1'), 'active list contains it');
  assert(typeof result.data.projectDecisionMarkdown === 'string', 'projectDecisionMarkdown present');
  assert(typeof result.data.mergedMarkdown === 'string', 'mergedMarkdown present');
  const state = readJson(statePath);
  assert(state.decisions.length === 1 && state.decisions[0].id === 'decision_1', 'persisted into task state');
});

test('task decision append compact output omits merged markdown context', () => {
  const { projectRoot, statePath } = initTaskState('decision-compact');
  const result = runInDir(`task decision append --state "${statePath}" --compact --data '${completeDecision('decision_compact')}'`, projectRoot);
  assert(result.ok, `compact append should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.ok === true, 'envelope ok:true');
  assert(result.data.compact === true, 'compact marker present');
  assert(result.data.decision && result.data.decision.id === 'decision_compact', 'decision metadata returned');
  assert(result.data.taskDecisions === undefined, `compact output should omit taskDecisions, got ${JSON.stringify(result.data)}`);
  assert(result.data.projectDecisionMarkdown === undefined, 'compact output should omit projectDecisionMarkdown');
  assert(result.data.mergedMarkdown === undefined, 'compact output should omit mergedMarkdown');
  const state = readJson(statePath);
  assert(state.decisions.length === 1 && state.decisions[0].id === 'decision_compact', 'compact append still persists state');
});

test('task decision append supersession marks prior decision superseded', () => {
  const { projectRoot, statePath } = initTaskState('decision-supersede');
  runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1')}'`, projectRoot);
  const second = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_2', { supersedesDecisionIds: ['decision_1'] })}'`, projectRoot);
  assert(second.ok, `second append should succeed, got: ${JSON.stringify(second.data)}`);
  const state = readJson(statePath);
  const first = state.decisions.find(d => d.id === 'decision_1');
  assert(first.status === 'superseded', `first should be superseded, got ${first.status}`);
  assert(first.supersededByDecisionId === 'decision_2', `supersededByDecisionId should be decision_2, got ${first.supersededByDecisionId}`);

  const listDefault = runInDir(`task decision list --state "${statePath}"`, projectRoot);
  assert(listDefault.data.taskDecisions.every(d => d.id !== 'decision_1'), 'default list excludes superseded');
  const listAll = runInDir(`task decision list --state "${statePath}" --include-superseded`, projectRoot);
  assert(listAll.data.taskDecisions.some(d => d.id === 'decision_1'), 'include-superseded includes it');
});

test('task decision append rejects status superseded on append', () => {
  const { projectRoot, statePath } = initTaskState('decision-status');
  const result = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1', { status: 'superseded' })}'`, projectRoot);
  assert(!result.ok, 'status superseded on append should fail');
  assert(result.data.error.code === 'invalidInput', `code should be invalidInput, got ${JSON.stringify(result.data)}`);
});

test('task decision append idempotent and conflict by id', () => {
  const { projectRoot, statePath } = initTaskState('decision-idem');
  runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1')}'`, projectRoot);
  const replay = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1')}'`, projectRoot);
  assert(replay.ok, `identical replay should be ok, got: ${JSON.stringify(replay.data)}`);
  const conflict = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1', { answer: 'different' })}'`, projectRoot);
  assert(!conflict.ok, 'conflicting data should fail');
  assert(conflict.data.error.code === 'conflictingDuplicate', `code should be conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
});

test('task decision append rejects unknown task-owned supersede reference', () => {
  const { projectRoot, statePath } = initTaskState('decision-badref');
  const result = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_2', { supersedesDecisionIds: ['decision_missing'] })}'`, projectRoot);
  assert(!result.ok, 'missing task-owned ref should fail');
  assert(['invalidInput', 'stateNotFound'].includes(result.data.error.code), `code should be invalidInput/stateNotFound, got ${JSON.stringify(result.data)}`);
});

test('task decision append validates project decision reference', () => {
  const { projectRoot, statePath } = initTaskState('decision-projref');
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.writeFileSync(path.join(fixmeDir, 'decisions.md'), '# Decision Log\n\n### Decision 11\n- something\n');
  const bad = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1', { supersedesProjectDecisionRefs: ['Decision 99'] })}'`, projectRoot);
  assert(!bad.ok, 'unknown project ref should fail');
  assert(bad.data.error.code === 'invalidInput', `code should be invalidInput, got ${JSON.stringify(bad.data)}`);
  const ok = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_2', { supersedesProjectDecisionRefs: ['Decision 11'] })}'`, projectRoot);
  assert(ok.ok, `known project ref should succeed, got: ${JSON.stringify(ok.data)}`);
  assert(ok.data.mergedMarkdown.includes('Decision 11'), 'merged markdown renders supersession');
});

test('task decision append rejects unknown and missing fields', () => {
  const { projectRoot, statePath } = initTaskState('decision-fields');
  const unknown = runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1', { bogus: 'x' })}'`, projectRoot);
  assert(!unknown.ok, 'unknown field should fail');
  assert(unknown.data.error.code === 'unknownField', `code should be unknownField, got ${JSON.stringify(unknown.data)}`);
  const missing = runInDir(`task decision append --state "${statePath}" --data '{"id":"decision_1","status":"active","supersedesDecisionIds":[],"supersededByDecisionId":null}'`, projectRoot);
  assert(!missing.ok, 'missing required field should fail');
  assert(missing.data.error.code === 'missingRequiredField', `code should be missingRequiredField, got ${JSON.stringify(missing.data)}`);
});

test('task decision list markdown format and task-owned-only', () => {
  const { projectRoot, statePath } = initTaskState('decision-list');
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.writeFileSync(path.join(fixmeDir, 'decisions.md'), '# Decision Log\n\n### Decision 1\n- project decision\n');
  runInDir(`task decision append --state "${statePath}" --data '${completeDecision('decision_1')}'`, projectRoot);
  const md = runInDir(`task decision list --state "${statePath}" --format markdown`, projectRoot);
  assert(md.ok && typeof md.data.markdown === 'string', 'markdown field present');
  assert(md.data.markdown === md.data.mergedMarkdown, 'markdown equals mergedMarkdown');
  assert(md.data.markdown.includes('project decision'), 'merged includes project markdown');
  const owned = runInDir(`task decision list --state "${statePath}" --task-owned-only`, projectRoot);
  assert(owned.ok && owned.data.taskDecisions.length === 1, 'task-owned-only returns task decisions');
});

test('task decision list without fixme-dir reads parent project decisions for subproject task state', () => {
  const workspaceRoot = createTmpDir();
  const fixmeDir = path.join(workspaceRoot, '.fixme');
  const subprojectRoot = path.join(workspaceRoot, 'packages', 'app');
  fs.mkdirSync(path.join(fixmeDir, 'sessions', 'test-session'), { recursive: true });
  fs.mkdirSync(subprojectRoot, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'decisions.md'), '# Decision Log\n\n### Decision 41\n- parent project decision\n');
  const ticketPath = createTicketFolder(path.join(fixmeDir, 'sessions', 'test-session'), '0001', 'decision-subproject', 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${subprojectRoot}"`, subprojectRoot);
  assert(initialized.ok, `task init in subproject should succeed, got: ${JSON.stringify(initialized.data)}`);

  const listed = runInDir(`task decision list --state "${initialized.data.statePath}" --format markdown`, subprojectRoot);
  assert(listed.ok, `task decision list should succeed, got: ${JSON.stringify(listed.data)}`);
  assert(listed.data.projectDecisionMarkdown.includes('parent project decision'), `project markdown should come from parent fixme dir, got ${JSON.stringify(listed.data)}`);
  assert(listed.data.markdown.includes('Decision 41'), `merged markdown should include parent decision, got ${listed.data.markdown}`);
});

test('cli help emits command schemas before required validation', () => {
  const cases = [
    {
      args: 'task decision append --help',
      command: 'task decision append',
      requiredFlags: ['state'],
      requiredDataFields: ['id', 'attentionId', 'sourceSkill', 'prompt', 'answer', 'interpretation', 'status', 'supersedesDecisionIds', 'supersededByDecisionId', 'createdAt'],
      optionalDataFields: ['supersedesProjectDecisionRefs'],
    },
    {
      args: 'run attention answer --help',
      command: 'run attention answer',
      requiredFlags: ['fixme-dir', 'status-id', 'attention-id'],
      requiredDataFields: ['answer', 'answeredBy', 'answerKind'],
      optionalDataFields: [],
      enumChecks: [['answerKind', ['decision', 'clarificationRequest']]],
      audience: 'owner/internal',
      guidanceIncludes: 'lifecycle attention broker answer',
    },
    {
      args: 'lifecycle attention broker answer --help',
      command: 'lifecycle attention broker answer',
      requiredFlags: ['fixme-dir', 'status-id', 'attention-id'],
      requiredDataFields: ['answer', 'answeredBy', 'answerKind'],
      optionalDataFields: [],
      enumChecks: [['answerKind', ['decision', 'clarificationRequest']]],
      audience: 'parent-facing',
      guidanceIncludes: 'record raw user answers',
    },
    {
      args: 'lifecycle attention broker resume --help',
      command: 'lifecycle attention broker resume',
      requiredFlags: ['fixme-dir', 'parent-run-id', 'status-id', 'attention-id'],
      requiredDataFields: ['answer', 'answeredBy', 'answerKind'],
      optionalDataFields: [],
      enumChecks: [['answerKind', ['decision', 'clarificationRequest']]],
      audience: 'parent-facing',
      guidanceIncludes: 'returns only the fixme-task resume message',
    },
    {
      args: 'lifecycle attention broker acknowledge-resume --help',
      command: 'lifecycle attention broker acknowledge-resume',
      requiredFlags: ['fixme-dir', 'parent-run-id', 'status-id', 'attention-id'],
      requiredDataFields: ['resumeMessage', 'transport', 'runtime'],
      optionalDataFields: ['runtimeHandle'],
      enumChecks: [
        ['transport', ['agent', 'inline-skill', 'background', 'direct']],
        ['runtime', ['claude', 'codex']],
      ],
      audience: 'parent-facing',
      guidanceIncludes: 'records resume-dispatch evidence and returns the parent to waitingForChild',
    },
    {
      args: 'lifecycle attention open --help',
      command: 'lifecycle attention open',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['statusId', 'taskStatePath', 'checkpointData', 'attention'],
      optionalDataFields: [],
      enumChecks: [['attention.answerMode', ['freeform', 'decision-card', 'multiple-choice']]],
    },
    {
      args: 'lifecycle attention consume --help',
      command: 'lifecycle attention consume',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['statusId', 'taskStatePath', 'attentionId', 'checkpointData'],
      optionalDataFields: ['decisionRecords', 'mode'],
      enumChecks: [['mode', ['resolvedDecision', 'clarificationRequest', 'partialDecision']]],
      audience: 'owner/internal',
      guidanceIncludes: 'fixme-task',
    },
    {
      args: 'lifecycle dispatch prepare --help',
      command: 'lifecycle dispatch prepare',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['idempotencyKey', 'agentName', 'transport', 'promptInputs'],
      optionalDataFields: ['parentStatusId', 'parentInvocationId', 'pipelineRunId', 'taskStatePath', 'parentContinuation', 'runtime'],
      enumChecks: [['transport', ['agent', 'inline-skill', 'background', 'direct']]],
    },
    {
      args: 'lifecycle dispatch complete --help',
      command: 'lifecycle dispatch complete',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['dispatchId', 'statusId', 'status'],
      optionalDataFields: ['parentStatusId', 'currentCommand', 'failure', 'runtimeHandle'],
    },
    {
      args: 'lifecycle parent create --help',
      command: 'lifecycle parent create',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['parentSkill', 'idempotencyKey', 'lookupInput', 'status', 'cursor', 'payload'],
      optionalDataFields: [],
    },
    {
      args: 'lifecycle parent checkpoint --help',
      command: 'lifecycle parent checkpoint',
      requiredFlags: ['fixme-dir', 'parent-run-id'],
      requiredDataFields: ['idempotencyKey', 'expectedRevision', 'status', 'cursor', 'payload', 'ledger'],
      optionalDataFields: ['failure'],
    },
    {
      args: 'lifecycle parent resolve --help',
      command: 'lifecycle parent resolve',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: [],
      optionalDataFields: ['parentSkill', 'lookupInput'],
    },
    {
      args: 'lifecycle parent prepare-child --help',
      command: 'lifecycle parent prepare-child',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['parent', 'child', 'await'],
      optionalDataFields: ['parentContinuation', 'recoverStaleParent'],
      enumChecks: [['child.transport', ['agent', 'inline-skill', 'background', 'direct']]],
    },
    {
      args: 'lifecycle parent abandon --help',
      command: 'lifecycle parent abandon',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['parentRunId', 'idempotencyKey', 'reason', 'message'],
      optionalDataFields: ['preserveLedger'],
    },
    {
      args: 'lifecycle task-event record --help',
      command: 'lifecycle task-event record',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['parentRunId', 'taskRunId', 'taskStatePath', 'resultSummaryPath', 'terminalResultId', 'status'],
      optionalDataFields: [],
    },
    {
      args: 'lifecycle task-event consume --help',
      command: 'lifecycle task-event consume',
      requiredFlags: ['fixme-dir', 'parent-run-id'],
      requiredDataFields: [],
      optionalDataFields: ['event-id', 'next'],
    },
  ];

  for (const item of cases) {
    const result = run(item.args);
    assert(result.ok, `${item.command} --help should succeed before validation, got ${JSON.stringify(result.data)}`);
    assertNoSnakeCaseKeys(result.data, `${item.command} help`);
    assert(result.data.ok === true, `${item.command} help ok:true`);
    assert(result.data.command === item.command, `${item.command} help command mismatch, got ${result.data.command}`);
    assert(Array.isArray(result.data.requiredFlags), `${item.command} help requiredFlags array`);
    assert(Array.isArray(result.data.requiredDataFields), `${item.command} help requiredDataFields array`);
    assert(Array.isArray(result.data.optionalDataFields), `${item.command} help optionalDataFields array`);
    assert(isPlainObjectForTest(result.data.enumValues), `${item.command} help enumValues object`);
    assert(isPlainObjectForTest(result.data.example), `${item.command} help example object`);
    for (const field of item.requiredFlags) {
      assert(result.data.requiredFlags.includes(field), `${item.command} help missing required flag ${field}`);
    }
    for (const field of item.requiredDataFields) {
      assert(result.data.requiredDataFields.includes(field), `${item.command} help missing required data field ${field}`);
    }
    for (const field of item.optionalDataFields) {
      assert(result.data.optionalDataFields.includes(field), `${item.command} help missing optional data field ${field}`);
    }
    for (const [enumName, values] of (item.enumChecks || [])) {
      assert(Array.isArray(result.data.enumValues[enumName]), `${item.command} help missing enum ${enumName}`);
      for (const value of values) {
        assert(result.data.enumValues[enumName].includes(value), `${item.command} help enum ${enumName} missing ${value}`);
      }
    }
    if (item.audience) {
      assert(result.data.audience === item.audience, `${item.command} help audience should be ${item.audience}, got ${result.data.audience}`);
    }
    if (item.guidanceIncludes) {
      assert(typeof result.data.guidance === 'string' && result.data.guidance.includes(item.guidanceIncludes), `${item.command} help guidance should mention ${item.guidanceIncludes}, got ${result.data.guidance}`);
    }
  }
});

console.log('\n=== lifecycle envelope tests ===\n');

test('lifecycle unknown subcommand returns unsupportedCommand envelope', () => {
  const r = run(`lifecycle bogus`);
  assert(!r.ok, 'unknown lifecycle subcommand should exit nonzero');
  assert(r.data && r.data.ok === false, 'should emit ok:false envelope');
  assert(r.data.error && r.data.error.code === 'unsupportedCommand', `code should be unsupportedCommand, got ${JSON.stringify(r.data)}`);
});

test('every lifecycle/task-decision helper named in any installed skill exists in the CLI', () => {
  const SUPPORTED_HELPERS = new Set([
    'lifecycle invocation start', 'lifecycle invocation finish',
    'lifecycle dispatch prepare', 'lifecycle dispatch complete',
    'lifecycle attention open', 'lifecycle attention consume', 'lifecycle attention broker show', 'lifecycle attention broker answer',
    'lifecycle attention broker resume',
    'lifecycle attention broker acknowledge-resume',
    'lifecycle wait begin', 'lifecycle wait end',
    'lifecycle parent create', 'lifecycle parent checkpoint', 'lifecycle parent resolve', 'lifecycle parent prepare-child', 'lifecycle parent abandon',
    'lifecycle task-event record', 'lifecycle task-event consume',
    'task decision append', 'task decision list',
    'task result write',
  ]);
  const skillsRoot = path.resolve(__dirname, '..', '..');
  const skillDirs = fs.readdirSync(skillsRoot).filter(name => name.startsWith('fixme-'));
  // Match `fixme-tools.cjs <namespace> <verb> [<action>]` for lifecycle/task decision/task result.
  const pattern = /fixme-tools\.cjs\s+(lifecycle|task)\s+([a-z-]+)(?:\s+([a-z-]+))?(?:\s+([a-z-]+))?/g;
  for (const dir of skillDirs) {
    const skillPath = path.join(skillsRoot, dir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const text = fs.readFileSync(skillPath, 'utf8');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const namespace = match[1];
      if (namespace === 'task' && !['decision', 'result'].includes(match[2])) {
        // Other task subcommands (save/init/checkpoint/resolve/attach-artifact) are not gated here.
        continue;
      }
      // Build the candidate helper token, trying the longest match first.
      const parts = [namespace, match[2], match[3], match[4]].filter(Boolean);
      let recognized = false;
      for (let len = parts.length; len >= 2; len--) {
        const candidate = parts.slice(0, len).join(' ');
        if (SUPPORTED_HELPERS.has(candidate)) { recognized = true; break; }
      }
      if (namespace === 'lifecycle' || (namespace === 'task' && ['decision', 'result'].includes(match[2]))) {
        assert(recognized, `Skill ${dir} names unsupported helper: '${parts.join(' ')}'`);
      }
    }
  }
});

test('run start CLI stdout schema unchanged after core extraction', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const r = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(r.ok, `run start should succeed, got: ${JSON.stringify(r.data)}`);
  const keys = Object.keys(r.data).sort();
  assert(JSON.stringify(keys) === JSON.stringify(['agent', 'checkpoint', 'currentCommand', 'schemaVersion', 'state', 'statusId', 'statusPath', 'updatedAt']),
    `run start keys unchanged, got ${JSON.stringify(keys)}`);
  assert(r.data.schemaVersion === 1, 'schemaVersion 1');
  assert(r.data.agent === 'fixme-task', 'agent fixme-task');
  assert(r.data.state === 'running', 'state running');
  assert(r.data.checkpoint === 'dispatched', 'checkpoint dispatched');
  assert(r.data.currentCommand === null, 'currentCommand null');
});

test('run attention set CLI stdout schema unchanged after core extraction', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  const attentionData = JSON.stringify({
    ownerSkill: 'fixme-task',
    sourceSkill: 'fixme-handle-code-review',
    kind: 'reviewDecision',
    resumeRef: 'FIXME-13',
    taskStatePath: path.join(fixmeDir, 'tasks', 'demo.state.json'),
    promptMarkdown: '## Decision\n\nPick.',
    answerMode: 'freeform',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  assert(set.ok, `run attention set should succeed, got: ${JSON.stringify(set.data)}`);
  assert(set.data.status === 'waiting', `status should be waiting, got ${set.data.status}`);
  assert(set.data.answer === null, `answer should be null, got ${JSON.stringify(set.data.answer)}`);
  assert(set.data.statusId === started.data.statusId, 'statusId echoed');
  assert(typeof set.data.attentionPath === 'string', 'attentionPath present');
});

test('usage start to finish round trip schema unchanged after core extraction', () => {
  const workspace = createUsageWorkspace();
  const start = runInDirWithEnv(`usage start --skill fixme-task --runtime claude --role orchestrator --fixme-dir "${workspace.fixmeDir}"`, workspace.projectRoot, workspace.env);
  assert(start.ok, `usage start should succeed, got: ${JSON.stringify(start.data)}`);
  assert(/^usage_/.test(start.data.invocationId), 'invocationId generated');
  assert(typeof start.data.finishCommand === 'string' && start.data.finishCommand.includes('usage finish'), 'finishCommand present');
  assert(start.data.usageSourcePath === null, `usageSourcePath should be null when no source is bound, got ${JSON.stringify(start.data.usageSourcePath)}`);
  const startKeys = Object.keys(start.data).sort();
  assert(JSON.stringify(startKeys) === JSON.stringify(['finishCommand', 'invocationId', 'pendingPath', 'pipelineRunId', 'runtime', 'startedAt', 'usageSourcePath']),
    `usage start keys unchanged, got ${JSON.stringify(startKeys)}`);
  const finish = runInDirWithEnv(`usage finish --invocation-id ${start.data.invocationId} --outcome complete --fixme-dir "${workspace.fixmeDir}"`, workspace.projectRoot, workspace.env);
  assert(finish.ok, `usage finish should succeed, got: ${JSON.stringify(finish.data)}`);
  assert(finish.data.invocationId === start.data.invocationId, 'invocationId matches');
  assert(finish.data.outcome === 'complete', `outcome complete, got ${finish.data.outcome}`);
  assert(Object.prototype.hasOwnProperty.call(finish.data, 'reportLine'), 'reportLine present');
  assert(Object.prototype.hasOwnProperty.call(finish.data, 'reportLineSuppressed'), 'reportLineSuppressed present');
});

console.log('\n=== lifecycle invocation tests ===\n');

function countDirEntries(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).length;
}

test('invocation start wraps usage and returns invocationId', () => {
  const w = createUsageWorkspace();
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'k1' });
  const r = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  assert(r.ok, `invocation start should succeed, got: ${JSON.stringify(r.data)}`);
  assert(r.data.ok === true, 'envelope ok');
  assert(/^usage_/.test(r.data.invocationId), 'invocationId returned');
  assert(typeof r.data.usageFinishCommand === 'string', 'usageFinishCommand present');
  assert(!Object.prototype.hasOwnProperty.call(r.data, 'statusId'), 'no statusId without createRunStatusForAgent');
  assert(countDirEntries(path.join(w.fixmeDir, 'runs')) === 0, 'no run-status created');
});

test('invocation start with createRunStatusForAgent returns a self-owned status', () => {
  const w = createUsageWorkspace();
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'k2', createRunStatusForAgent: 'fixme-task' });
  const r = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  assert(r.ok, `should succeed, got: ${JSON.stringify(r.data)}`);
  assert(typeof r.data.statusId === 'string' && typeof r.data.statusPath === 'string', 'statusId/statusPath present');
  assert(fs.existsSync(r.data.statusPath), 'run status file exists');
  const status = readJson(r.data.statusPath);
  assert(status.agent === 'fixme-task', `agent should be fixme-task, got ${status.agent}`);
});

test('invocation start binds explicit usageSourcePath for parent-driven Codex task usage', () => {
  const w = createUsageWorkspace();
  const sourcePath = path.join(w.projectRoot, 'codex-parent-driven-task.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 },
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 }
    ),
  ]);
  const data = JSON.stringify({
    skill: 'fixme-task',
    runtime: 'codex',
    role: 'orchestrator',
    idempotencyKey: 'k-source-path',
    pipelineRunId: 'usage_parent_pipeline',
    parentInvocationId: 'usage_parent_invocation',
    usageSourcePath: sourcePath,
  });
  const started = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, { ...w.env, CODEX_THREAD_ID: '', CODEX_SESSION_FILE: '', FIXME_USAGE_SOURCE_PATH: '' });
  assert(started.ok, `invocation start with usageSourcePath should succeed, got: ${JSON.stringify(started.data)}`);
  assert(started.data.usageSourcePath === sourcePath, `start output should echo usageSourcePath, got ${JSON.stringify(started.data)}`);
  const pending = readJson(path.join(w.fixmeDir, 'usage', 'pending', `${started.data.invocationId}.json`));
  assert(pending.sourceSnapshot.source.path === sourcePath, `pending usage should bind explicit source path, got ${JSON.stringify(pending.sourceSnapshot)}`);
});

test('invocation start binds Codex source from CODEX_SQLITE_HOME state database', () => {
  const w = createUsageWorkspace();
  const threadId = 'thread_20260616_lifecycle_sqlite_home';
  const sqliteHome = path.join(w.homeDir, '.codex', 'sqlite');
  const sourcePath = codexSessionPath(w, 'rollout-lifecycle-sqlite-home');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 },
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 }
    ),
  ]);
  writeCodexStateThread(w, threadId, sourcePath, { sqliteHome });

  const data = JSON.stringify({
    skill: 'fixme-task',
    runtime: 'codex',
    role: 'orchestrator',
    idempotencyKey: 'k-sqlite-home-source',
  });
  const started = runInDirWithEnv(
    `lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`,
    w.projectRoot,
    { ...w.env, CODEX_THREAD_ID: threadId, CODEX_SQLITE_HOME: sqliteHome }
  );
  assert(started.ok, `invocation start should bind configured sqlite source, got: ${JSON.stringify(started.data)}`);
  assert(started.data.usageSourcePath === sourcePath, `start output should use CODEX_SQLITE_HOME source path, got ${JSON.stringify(started.data)}`);
  const pending = readJson(path.join(w.fixmeDir, 'usage', 'pending', `${started.data.invocationId}.json`));
  assert(pending.sourceSnapshot.source.path === sourcePath, `pending usage should bind configured sqlite source path, got ${JSON.stringify(pending.sourceSnapshot)}`);
});

test('invocation start retry with same idempotencyKey returns existing invocation and status', () => {
  const w = createUsageWorkspace();
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'k3', createRunStatusForAgent: 'fixme-task' });
  const first = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  assert(first.ok, `first should succeed, got: ${JSON.stringify(first.data)}`);
  const second = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  assert(second.ok, `retry should succeed, got: ${JSON.stringify(second.data)}`);
  assert(second.data.invocationId === first.data.invocationId, 'same invocationId');
  assert(second.data.statusId === first.data.statusId, 'same statusId');
  assert(countDirEntries(path.join(w.fixmeDir, 'runs')) === 1, 'only one run-status directory');
  assert(countDirEntries(path.join(w.fixmeDir, 'usage', 'pending')) === 1, 'only one pending usage file');

  const conflictData = JSON.stringify({ skill: 'fixme-pr-comments', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'k3' });
  const conflict = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${conflictData}'`, w.projectRoot, w.env);
  assert(!conflict.ok, 'conflicting durable inputs should fail');
  assert(conflict.data.error.code === 'conflictingDuplicate', `code should be conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
});

test('invocation finish returns usage finish fields', () => {
  const w = createUsageWorkspace();
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'kf1' });
  const start = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  const finish = runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id ${start.data.invocationId} --outcome complete`, w.projectRoot, w.env);
  assert(finish.ok, `finish should succeed, got: ${JSON.stringify(finish.data)}`);
  assert(finish.data.ok === true, 'envelope ok');
  assert(finish.data.outcome === 'complete', `outcome complete, got ${finish.data.outcome}`);
  assert(Object.prototype.hasOwnProperty.call(finish.data, 'reportLine'), 'reportLine present');
  assert(typeof finish.data.projectEventPath === 'string', 'projectEventPath present');
});

test('invocation finish replay after pending deleted returns finalized usage event', () => {
  const w = createUsageWorkspace();
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'kf2' });
  const start = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  const first = runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id ${start.data.invocationId} --outcome complete`, w.projectRoot, w.env);
  assert(first.ok, `first finish should succeed, got: ${JSON.stringify(first.data)}`);
  const replay = runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id ${start.data.invocationId} --outcome complete`, w.projectRoot, w.env);
  assert(replay.ok, `replay should succeed, got: ${JSON.stringify(replay.data)}`);
  assert(replay.data.error === undefined, 'should not be stateNotFound');
  assert(replay.data.outcome === 'complete' && replay.data.eventId === first.data.eventId, `replay matches first, got ${JSON.stringify(replay.data)}`);
});

test('invocation finish conflicting outcome returns conflictingDuplicate', () => {
  const w = createUsageWorkspace();
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'kf3' });
  const start = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id ${start.data.invocationId} --outcome complete`, w.projectRoot, w.env);
  const conflict = runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id ${start.data.invocationId} --outcome failed --reason runtime_error`, w.projectRoot, w.env);
  assert(!conflict.ok, 'different outcome should fail');
  assert(conflict.data.error.code === 'conflictingDuplicate', `code should be conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
});

test('invocation finish unknown invocation returns stateNotFound', () => {
  const w = createUsageWorkspace();
  const r = runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id usage_20260101_000000_deadbeef --outcome complete`, w.projectRoot, w.env);
  assert(!r.ok, 'unknown invocation should fail');
  assert(r.data.error.code === 'stateNotFound', `code should be stateNotFound, got ${JSON.stringify(r.data)}`);
});

test('invocation finish returns null reportLine when suppressed', () => {
  const w = createUsageWorkspace();
  fs.writeFileSync(path.join(w.fixmeDir, 'config.json'), JSON.stringify({ usage: { printAfterFinish: false } }) + '\n');
  const data = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'kf4' });
  const start = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${data}'`, w.projectRoot, w.env);
  const finish = runInDirWithEnv(`lifecycle invocation finish --fixme-dir "${w.fixmeDir}" --invocation-id ${start.data.invocationId} --outcome complete`, w.projectRoot, w.env);
  assert(finish.ok, `finish should succeed, got: ${JSON.stringify(finish.data)}`);
  assert(finish.data.reportLine === null, `reportLine should be null when suppressed, got ${JSON.stringify(finish.data.reportLine)}`);
  assert(finish.data.reportLineSuppressed === true, 'reportLineSuppressed true');
});

test('invocation start validates required and unknown fields', () => {
  const w = createUsageWorkspace();
  const unknown = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '{"skill":"fixme-task","idempotencyKey":"u1","bogus":"x"}'`, w.projectRoot, w.env);
  assert(!unknown.ok && unknown.data.error.code === 'unknownField', `unknown field, got ${JSON.stringify(unknown.data)}`);
  const noKey = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '{"skill":"fixme-task"}'`, w.projectRoot, w.env);
  assert(!noKey.ok && noKey.data.error.code === 'missingRequiredField', `missing idempotencyKey, got ${JSON.stringify(noKey.data)}`);
  const noSkill = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '{"idempotencyKey":"u2"}'`, w.projectRoot, w.env);
  assert(!noSkill.ok && noSkill.data.error.code === 'missingRequiredField', `missing skill, got ${JSON.stringify(noSkill.data)}`);
});

console.log('\n=== lifecycle dispatch tests ===\n');

function makeFixmeDir() {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  return fixmeDir;
}

test('safe JSON sources support direct file stdin and reject ambiguous sources', () => {
  const projectRoot = createTmpDir();
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), '{}\n');
  const payload = { candidates: [{ pipeline: 'standard', source: 'userProseIntent', evidence: "quote-safe user's payload", reason: 'safe JSON source test' }] };
  const directPayload = { candidates: [{ pipeline: 'standard', source: 'userProseIntent', evidence: 'direct payload', reason: 'safe JSON source test' }] };
  const payloadPath = writeJsonFixture(projectRoot, 'pipeline-payload.json', payload);
  const direct = runInDir(`pipeline resolve --data '${JSON.stringify(directPayload)}'`, projectRoot);
  assert(direct.ok, `direct JSON should work, got ${JSON.stringify(direct.data)}`);
  const file = runInDir(`pipeline resolve --data-file "${payloadPath}"`, projectRoot);
  assert(file.ok, `data-file JSON should work, got ${JSON.stringify(file.data)}`);
  const stdin = runToolPathWithInput(TOOLS_PATH, 'pipeline resolve --data-stdin', JSON.stringify(payload), { cwd: projectRoot });
  assert(stdin.ok, `data-stdin JSON should work, got ${JSON.stringify(stdin.data)}`);

  const ambiguous = runInDir(`pipeline resolve --data '${JSON.stringify(directPayload)}' --data-file "${payloadPath}"`, projectRoot);
  assert(!ambiguous.ok, 'direct plus file should fail');
  assert(cliErrorMessage(ambiguous).includes('Only one JSON source is allowed for --data'), `ambiguous error should name data source, got ${JSON.stringify(ambiguous.data)}`);
  const relative = runInDir('pipeline resolve --data-file pipeline-payload.json', projectRoot);
  assert(!relative.ok, 'relative data-file should fail');
  assert(cliErrorMessage(relative).includes('--data-file must be an absolute path'), `relative path error should name data-file, got ${JSON.stringify(relative.data)}`);
});

test('safe JSON sources support named task init inputs and one stdin source per process', () => {
  const projectRoot = createTmpDir();
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.mkdirSync(path.join(fixmeDir, 'sessions', 'json-source'), { recursive: true });
  const ticketPath = createTicketFolder(path.join(fixmeDir, 'sessions', 'json-source'), '0001', 'safe-json-task', 'queued');
  const pipelineResolution = {
    pipeline: 'standard',
    source: 'userProseIntent',
    evidence: 'named file source',
    reason: 'Safe JSON test supplies pipeline resolution from a file.',
  };
  const parentContinuation = {
    parentSkill: 'fixme-pr-comments',
    parentRunId: 'parent_json_source',
    transport: 'agent',
    resumeStep: 'awaitFixmeTaskResult',
    parentStatusId: 'run_parent_json_source',
  };
  const pipelinePath = writeJsonFixture(projectRoot, 'pipeline-resolution.json', pipelineResolution);
  const continuationPath = writeJsonFixture(projectRoot, 'parent-continuation.json', parentContinuation);
  const statePath = path.join(fixmeDir, 'tasks', 'safe-json-task.state.json');
  const initialized = runInDir(
    `task init --state "${statePath}" --pipeline-resolution-file "${pipelinePath}" --parent-continuation-file "${continuationPath}" --project-root "${projectRoot}"`,
    projectRoot
  );
  assert(initialized.ok, `named JSON file flags should initialize task, got ${JSON.stringify(initialized.data)}`);
  const state = readJson(initialized.data.statePath);
  assert(state.pipelineResolution.source === 'userProseIntent', 'pipeline resolution came from named file');
  assert(state.parentContinuation.transport === 'agent', 'parent continuation came from named file');

  const twoStdin = runToolPathWithInput(
    TOOLS_PATH,
    `task init --state "${path.join(fixmeDir, 'tasks', 'two-stdin.state.json')}" --pipeline-resolution-stdin --parent-continuation-stdin --project-root "${projectRoot}"`,
    JSON.stringify(pipelineResolution),
    { cwd: projectRoot }
  );
  assert(!twoStdin.ok, 'two stdin JSON sources should fail');
  assert(cliErrorMessage(twoStdin).includes('Only one JSON argument may use stdin'), `two stdin error should be explicit, got ${JSON.stringify(twoStdin.data)}`);
});

test('dispatch prepare returns runtime settings banner status and prompt blocks', () => {
  const fixmeDir = makeFixmeDir();
  const data = JSON.stringify({ idempotencyKey: 'd1', agentName: 'fixme-write-plan', transport: 'agent', promptInputs: { goal: 'x' } });
  const r = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(r.ok, `dispatch prepare should succeed, got: ${JSON.stringify(r.data)}`);
  assert(typeof r.data.dispatchId === 'string', 'dispatchId present');
  assert(typeof r.data.statusId === 'string' && fs.existsSync(r.data.statusPath), 'statusId/statusPath present');
  assert(readJson(r.data.statusPath).agent === 'fixme-write-plan', 'child agent set');
  assert(r.data.runtimeSettings && r.data.runtimeSettings.runtime && r.data.runtimeSettings.model && r.data.runtimeSettings.profile, 'runtimeSettings present');
  assert(typeof r.data.bannerMarkdown === 'string' && r.data.bannerMarkdown.length > 0, 'bannerMarkdown present');
  assert(r.data.usageContext && Object.prototype.hasOwnProperty.call(r.data.usageContext, 'pipelineRunId'), 'usageContext present');
  assert(r.data.promptBlocks && typeof r.data.promptBlocks === 'object', 'promptBlocks present');
});

test('dispatch prepare honors explicit Codex runtime in durable payload', () => {
  const fixmeDir = makeFixmeDir();
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({ models: { profile: 'balanced' } }) + '\n');
  const data = JSON.stringify({ idempotencyKey: 'd1-codex', agentName: 'fixme-write-plan', transport: 'agent', runtime: 'codex', promptInputs: {} });
  const r = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(r.ok, `dispatch prepare should succeed, got: ${JSON.stringify(r.data)}`);
  assert(r.data.runtimeSettings.runtime === 'codex', `runtime should be codex, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.runtimeSettings.model === null, `Codex model should be null, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.runtimeSettings.reasoningEffort === 'xhigh', `planner reasoning should be xhigh, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(!Object.prototype.hasOwnProperty.call(r.data.runtimeSettings, 'reasoning_effort'), `runtimeSettings should be camelCase, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.bannerMarkdown.includes('- Runtime: codex'), `banner should show codex runtime, got ${r.data.bannerMarkdown}`);

  const conflictData = JSON.stringify({ idempotencyKey: 'd1-codex', agentName: 'fixme-write-plan', transport: 'agent', runtime: 'claude', promptInputs: {} });
  const conflict = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `runtime mismatch should conflict, got ${JSON.stringify(conflict.data)}`);
});

test('dispatch prepare propagates Codex usage source from parent invocation to nested agent prompts', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-parent-source.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const parent = runInDirWithEnv(`usage start --skill fixme-task --runtime codex --role orchestrator --source-path "${sourcePath}"`, ctx.projectRoot, ctx.env);
  assert(parent.ok, `parent usage start should succeed, got ${JSON.stringify(parent.data)}`);

  const dispatchEnv = { ...ctx.env, CODEX_THREAD_ID: '', CODEX_SESSION_FILE: '', FIXME_USAGE_SOURCE_PATH: '' };
  const dispatchPayload = {
    idempotencyKey: 'd1-codex-usage-source',
    agentName: 'fixme-review-plan',
    transport: 'inline-skill',
    runtime: 'codex',
    parentInvocationId: parent.data.invocationId,
    pipelineRunId: parent.data.pipelineRunId,
    promptInputs: { phase: 'plan-review' },
  };
  const prepared = runInDirWithEnv(`lifecycle dispatch prepare --fixme-dir "${ctx.fixmeDir}" --data '${JSON.stringify(dispatchPayload)}'`, ctx.projectRoot, dispatchEnv);
  assert(prepared.ok, `dispatch prepare should succeed without Codex env source, got ${JSON.stringify(prepared.data)}`);
  assert(prepared.data.usageContext.usageSourcePath === sourcePath, `usageContext should carry parent source path, got ${JSON.stringify(prepared.data.usageContext)}`);
  assert(prepared.data.promptBlocks.usageContext.usageSourcePath === sourcePath, `promptBlocks should carry usageSourcePath, got ${JSON.stringify(prepared.data.promptBlocks.usageContext)}`);

  const child = runInDirWithEnv(
    `usage start --skill fixme-review-plan --runtime codex --role reviewer --pipeline-run-id ${prepared.data.usageContext.pipelineRunId} --parent-invocation-id ${prepared.data.usageContext.parentInvocationId} --source-path "${prepared.data.usageContext.usageSourcePath}"`,
    ctx.projectRoot,
    dispatchEnv
  );
  assert(child.ok, `child usage start should accept propagated source path, got ${JSON.stringify(child.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 50, cached_input_tokens: 5, output_tokens: 12, reasoning_output_tokens: 7, total_tokens: 74 },
      { input_tokens: 20, cached_input_tokens: 2, output_tokens: 8, reasoning_output_tokens: 5, total_tokens: 35 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${child.data.invocationId} --outcome complete`, ctx.projectRoot, dispatchEnv);
  assert(finished.ok, `child usage finish should succeed, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents).find(event => event.invocationId === child.data.invocationId);
  assert(row && row.status === 'measured', `child usage should be measured from propagated source path, got ${JSON.stringify(row)}`);
  assert(row.pipelineRunId === parent.data.pipelineRunId, `child pipelineRunId should stay inherited, got ${JSON.stringify(row)}`);
  assert(row.parentInvocationId === parent.data.invocationId, `child parentInvocationId should stay inherited, got ${JSON.stringify(row)}`);
  assert(row.source.path === sourcePath, `child usage source should be the propagated source path, got ${JSON.stringify(row.source)}`);
});

test('dispatch prepare banner renders omitted Codex controls as preserved or inherited', () => {
  const fixmeDir = makeFixmeDir();
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({ models: { profile: 'inherit' } }) + '\n');
  const data = JSON.stringify({ idempotencyKey: 'd1-codex-inherit', agentName: 'fixme-write-plan', transport: 'agent', runtime: 'codex', promptInputs: {} });
  const r = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(r.ok, `dispatch prepare should succeed, got: ${JSON.stringify(r.data)}`);
  assert(r.data.runtimeSettings.runtime === 'codex', `runtime should be codex, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.runtimeSettings.model === null, `machine model should remain null for Codex, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.runtimeSettings.reasoningEffort === null, `machine reasoning should remain null for inherit, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.bannerMarkdown.includes('- Model: preserved (user-selected Codex model)'), `banner should explain preserved model, got ${r.data.bannerMarkdown}`);
  assert(r.data.bannerMarkdown.includes('- Reasoning effort: inherited (current Codex setting)'), `banner should explain inherited reasoning, got ${r.data.bannerMarkdown}`);
  assert(!r.data.bannerMarkdown.includes('Model: null'), `banner should not expose raw null model, got ${r.data.bannerMarkdown}`);
  assert(!r.data.bannerMarkdown.includes('Reasoning effort: null'), `banner should not expose raw null reasoning, got ${r.data.bannerMarkdown}`);
});

test('dispatch prepare auto-detects Codex runtime from installed tool path', () => {
  const projectRoot = createTmpDir();
  const fixmeDir = path.join(projectRoot, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({ models: { profile: 'balanced' } }) + '\n');

  const homeDir = createTmpDir();
  const codexTool = path.join(homeDir, '.codex', 'skills', 'fixme-tools', 'scripts', 'fixme-tools.cjs');
  fs.mkdirSync(path.dirname(codexTool), { recursive: true });
  fs.copyFileSync(TOOLS_PATH, codexTool);

  const data = JSON.stringify({ idempotencyKey: 'd1-codex-auto', agentName: 'fixme-write-plan', transport: 'agent', promptInputs: {} });
  const r = runToolPath(codexTool, `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`, { cwd: projectRoot, env: { HOME: homeDir } });
  assert(r.ok, `dispatch prepare should succeed, got: ${JSON.stringify(r.data)}`);
  assert(r.data.runtimeSettings.runtime === 'codex', `installed Codex tool should auto-detect codex runtime, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.runtimeSettings.model === null, `installed Codex tool should omit model, got ${JSON.stringify(r.data.runtimeSettings)}`);
  assert(r.data.runtimeSettings.reasoningEffort === 'xhigh', `installed Codex tool should set planner reasoning, got ${JSON.stringify(r.data.runtimeSettings)}`);
});

test('dispatch prepare retry with same idempotencyKey returns existing', () => {
  const fixmeDir = makeFixmeDir();
  const data = JSON.stringify({ idempotencyKey: 'd2', agentName: 'fixme-write-plan', transport: 'agent', promptInputs: {} });
  const first = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  const second = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(second.ok, `retry should succeed, got: ${JSON.stringify(second.data)}`);
  assert(second.data.dispatchId === first.data.dispatchId, 'same dispatchId');
  assert(second.data.statusId === first.data.statusId, 'same statusId');
  assert(fs.readdirSync(path.join(fixmeDir, 'runs')).length === 1, 'only one child run-status');
});

test('dispatch prepare for parent-driven fixme-task returns activeChild checkpoint handle', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    extra: {
      cursor: 'dispatchFixmeTask',
      payload: {
        fixBatches: [[{ id: 'comment-1' }]],
        activeBatchIndex: 0,
        parentContinuation: {
          parentSkill: 'fixme-pr-comments',
          parentRunId: 'parent_pending',
          transport: 'inline-skill',
          resumeStep: 'verify',
          parentStatusId: 'run_parent',
        },
      },
    },
  })}'`);
  assert(parent.ok, `parent create should succeed, got: ${JSON.stringify(parent.data)}`);
  const parentContinuation = {
    parentSkill: 'fixme-pr-comments',
    parentRunId: parent.data.parentRunId,
    transport: 'inline-skill',
    resumeStep: 'verify',
    parentStatusId: 'run_parent',
  };
  const prepData = JSON.stringify({
    idempotencyKey: 'd-active-child',
    agentName: 'fixme-task',
    transport: 'inline-skill',
    parentContinuation,
    promptInputs: { routedFixGroups: [{ id: 'comment-1' }] },
  });
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${prepData}'`);
  assert(prep.ok, `dispatch prepare should succeed, got: ${JSON.stringify(prep.data)}`);
  const activeChild = prep.data.activeChild;
  assert(activeChild && typeof activeChild === 'object', `activeChild returned, got ${JSON.stringify(prep.data)}`);
  assert(activeChild.statusId === prep.data.statusId, 'activeChild.statusId matches child status');
  assert(typeof activeChild.taskRunId === 'string' && activeChild.taskRunId.startsWith('taskRun_'), `taskRunId generated, got ${activeChild.taskRunId}`);
  assert(path.isAbsolute(activeChild.taskStatePath), `taskStatePath absolute, got ${activeChild.taskStatePath}`);
  assert(activeChild.taskStatePath.endsWith('.state.json'), `taskStatePath reserves task state, got ${activeChild.taskStatePath}`);
  assert(activeChild.resumeRef === activeChild.taskStatePath, `resumeRef uses reserved state path, got ${activeChild.resumeRef}`);
  assert(JSON.stringify(prep.data.promptBlocks.activeChild) === JSON.stringify(activeChild), 'promptBlocks includes exact activeChild handle');
  assert(prep.data.promptBlocks.liveness && prep.data.promptBlocks.liveness.statusId === prep.data.statusId, `promptBlocks.liveness should expose child statusId, got ${JSON.stringify(prep.data.promptBlocks.liveness)}`);
  assert(JSON.stringify(prep.data.promptBlocks.taskInput) === JSON.stringify({ routedFixGroups: [{ id: 'comment-1' }] }), `promptBlocks.taskInput should preserve routed promptInputs, got ${JSON.stringify(prep.data.promptBlocks.taskInput)}`);

  const checkpoint = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${parent.data.parentRunId} --data '${JSON.stringify({
    idempotencyKey: 'await-active-child',
    expectedRevision: 0,
    status: 'waitingForChild',
    cursor: 'awaitFixmeTask',
    payload: {
      fixBatches: [[{ id: 'comment-1' }]],
      activeBatchIndex: 0,
      activeChild,
    },
    ledger: {},
  })}'`);
  assert(checkpoint.ok, `parent should checkpoint awaitFixmeTask using returned activeChild, got ${JSON.stringify(checkpoint.data)}`);
  assert(JSON.stringify(checkpoint.data.payload.activeChild) === JSON.stringify(activeChild), 'parent persisted exact activeChild handle');
});

function prepareChildPayload(overrides = {}) {
  const runtime = overrides.runtime || 'codex';
  const transport = overrides.transport || 'agent';
  const suffix = overrides.suffix || runtime;
  return {
    parent: {
      parentSkill: overrides.parentSkill || 'fixme-pr-comments',
      idempotencyKey: `prepare-parent-${suffix}`,
      lookupInput: overrides.lookupInput || prLookupInput(),
      payload: overrides.parentPayload || {
        flags: {},
        reviewItems: {
          currentPrFix: [
            {
              id: 'G1',
              source: 'pullRequestReviewThread',
              verdict: 'currentPrFix',
              authorType: 'human',
              body: "Full review body lives in durable payload, not prompt blocks.",
            },
          ],
        },
        analysis: { currentPrFixCount: 1, allowedUnresolvedThreadIds: [], mustResolveThreadIds: ['PRRT_example'] },
        routedGroups: [{ groupId: 'G1', route: 'currentPrFix', sourceIds: ['G1'], title: 'Fix reviewed behavior' }],
      },
    },
    child: {
      idempotencyKey: `prepare-child-${suffix}`,
      agentName: 'fixme-task',
      runtime,
      transport,
      parentInvocationId: 'usage_parent_prepare_child',
      pipelineRunId: 'usage_parent_prepare_child',
      parentStatusId: 'run_parent_prepare_child',
      handoff: {
        mode: 'createOrReuse',
        taskSaveData: {
          title: 'Address current PR review fixes',
          slug: `prepare-child-${suffix}`,
          taskGoal: 'Apply the current PR review fixes from the durable child handoff payload.',
          settledSolutionShape: 'Use the durable child handoff payload as the authoritative saved solution shape for the current PR review fixes.',
          agreedApproach: ['Read the child-handoff-payload preparation artifact before planning.'],
          userVisibleBehavior: ['The child task resumes from a saved task reference.'],
          scope: { inScope: ['current PR review fixes from the child handoff payload'], outOfScope: ['unrelated PR changes'] },
          laterPlanningNotes: ['Use the sidecar payload as the authoritative PR-comment scope.'],
          pipelineResolution: {
            pipeline: 'standard',
            source: 'userProseIntent',
            evidence: 'Parent PR-comments workflow selected standard before save-first child handoff.',
            reason: 'The parent-provided PR-comment handoff is the user-visible intent for this saved child task.',
          },
          source: 'fixme-pr-comments',
          tags: ['fixme-pr-comments', 'parent-driven'],
        },
        payload: {
          source: 'fixme-pr-comments',
          routedFixGroups: [
            {
              groupId: 'G1',
              sourceIds: ['PRRT_example'],
              threadId: 'PRRT_example',
              commentIds: ['PRRC_example'],
              title: 'Fix reviewed behavior',
              problem: 'The implementation does not satisfy the current PR review thread.',
              requiredBehavior: ['Apply the requested current PR review fix.'],
              instructions: 'Detailed implementation instructions live only in the child handoff payload sidecar.',
              evidence: [{ path: 'apps/example.ts', line: 42, summary: 'Evidence lives in sidecar payload.' }],
            },
          ],
          allowedUnresolvedThreadIds: [],
          mustResolveThreadIds: ['PRRT_example'],
        },
      },
      promptInputs: { summary: 'Current PR review fixes', routedFixGroupsCount: 1, mustResolveThreadCount: 1 },
    },
    parentContinuation: { resumeStep: 'awaitFixmeTaskResult' },
    await: { fixBatches: [{ id: 'batch-0', summary: 'example' }], activeBatchIndex: 0, ledger: {} },
    recoverStaleParent: true,
    ...overrides.extra,
  };
}

test('parent prepare-child saves child handoff first and returns lightweight Codex agent launch', () => {
  const fixmeDir = makeFixmeDir();
  const payload = prepareChildPayload();
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child.json', payload);
  const first = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(first.ok, `prepare-child should succeed, got ${JSON.stringify(first.data)}`);
  assert(first.data.launch.transport === 'agent', `Codex PR-comments launch should use agent, got ${JSON.stringify(first.data.launch)}`);
  assert(first.data.launch.promptBlocks.parentContinuation.transport === 'agent', 'parent continuation transport is agent');
  assert(first.data.launch.runtimeSettings.reasoningEffort !== undefined, `runtimeSettings uses reasoningEffort, got ${JSON.stringify(first.data.launch.runtimeSettings)}`);
  assert(!Object.prototype.hasOwnProperty.call(first.data.launch.runtimeSettings, 'reasoning_effort'), 'runtimeSettings should not contain reasoning_effort');
  assert(first.data.childTask && fs.existsSync(first.data.childTask.taskPath), 'saved child task exists before launch');
  assert(fs.existsSync(first.data.childTask.statePath), 'saved child state exists before launch');
  assert(fs.existsSync(first.data.childTask.handoffPayloadPath), 'handoff payload sidecar exists before launch');
  const handoffPayload = readJson(first.data.childTask.handoffPayloadPath);
  assert(handoffPayload.routedFixGroups[0].groupId === 'G1', 'group id is a JSON value');
  assert(handoffPayload.routedFixGroups[0].instructions.includes('sidecar'), 'heavy instructions live in sidecar');
  const childState = readJson(first.data.childTask.statePath);
  assert(childState.pipelineResolution.source === 'userProseIntent', 'saved child uses accepted pipeline resolution source');
  assert(childState.artifacts.preparationArtifacts.some(a => a.artifactType === 'child-handoff-payload' && a.artifactPath === first.data.childTask.handoffPayloadPath), 'state registers child handoff artifact');
  const taskMarkdown = fs.readFileSync(first.data.childTask.taskPath, 'utf8');
  assert(taskMarkdown.includes('child-handoff-payload'), 'task markdown registers child handoff artifact');
  const promptText = JSON.stringify(first.data.launch.promptBlocks);
  assert(promptText.includes(first.data.childTask.handoffPayloadPath), 'prompt blocks point at handoff payload path');
  assert(!promptText.includes('Full review body lives in durable payload'), 'prompt blocks omit full review body');
  assert(!promptText.includes('Detailed implementation instructions live only'), 'prompt blocks omit detailed instructions');
  assert(!promptText.includes('"evidence"'), 'prompt blocks omit evidence arrays');
  assert(!Object.prototype.hasOwnProperty.call(first.data, 'promptBlocks'), 'prepare-child does not expose top-level promptBlocks');
  const parent = parentState(fixmeDir, first.data.parentRunId);
  assert(parent.status === 'waitingForChild' && parent.cursor === 'awaitFixmeTask', `parent waits for child, got ${JSON.stringify(parent)}`);
  assert(JSON.stringify(parent.payload.activeChild) === JSON.stringify(first.data.activeChild), 'parent persisted exact activeChild');

  const replay = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(replay.ok, `prepare-child replay should succeed, got ${JSON.stringify(replay.data)}`);
  assert(replay.data.parentRunId === first.data.parentRunId, 'replay reuses parent');
  assert(replay.data.dispatchId === first.data.dispatchId, 'replay reuses dispatch');
  assert(replay.data.statusId === first.data.statusId, 'replay reuses child run status');
  assert(replay.data.childTask.taskPath === first.data.childTask.taskPath, 'replay reuses saved task');
});

test('parent prepare-child saved task init preserves handoff artifact and parentContinuation', () => {
  const fixmeDir = makeFixmeDir();
  const projectRoot = path.dirname(fixmeDir);
  const payload = prepareChildPayload({ suffix: 'saved-task-init' });
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-saved-task-init.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `prepare-child should succeed, got ${JSON.stringify(prepared.data)}`);

  const beforeState = readJson(prepared.data.childTask.statePath);
  assert(
    beforeState.artifacts.preparationArtifacts.some(a => a.artifactType === 'child-handoff-payload' && a.artifactPath === prepared.data.childTask.handoffPayloadPath),
    'state should register child handoff artifact before init'
  );
  assert(beforeState.parentContinuation === null, 'prepare-child saved task state starts without parentContinuation');

  const parentContinuation = prepared.data.launch.promptBlocks.parentContinuation;
  const init = runInDir(
    `task init --task "${prepared.data.childTask.taskPath}" --pipeline-resolution '${JSON.stringify(beforeState.pipelineResolution)}' --project-root "${projectRoot}" --parent-continuation '${JSON.stringify(parentContinuation)}'`,
    projectRoot
  );

  assert(init.ok, `saved task init should succeed, got ${JSON.stringify(init.data)}`);
  assert(init.data.mode === 'standalone', `saved handoff init mode should be standalone, got ${init.data.mode}`);
  assert(init.data.taskPath === prepared.data.childTask.taskPath, 'init should use saved task path');
  assert(init.data.statePath === prepared.data.childTask.statePath, 'init should reuse saved task state path');

  const afterState = readJson(prepared.data.childTask.statePath);
  assert(
    afterState.artifacts.preparationArtifacts.some(a => a.artifactType === 'child-handoff-payload' && a.artifactPath === prepared.data.childTask.handoffPayloadPath),
    'task init --task should preserve child handoff artifact'
  );
  assert(JSON.stringify(afterState.parentContinuation) === JSON.stringify(parentContinuation), 'task init --task should persist parentContinuation');
  assert(afterState.cursor.phase === beforeState.cursor.phase, 'task init --task should preserve cursor');
  assert(afterState.pipelineResolution.source === beforeState.pipelineResolution.source, 'task init --task should preserve saved pipelineResolution');
});

test('task init --task is idempotent for existing saved state and rejects conflicts', () => {
  const fixmeDir = makeFixmeDir();
  const projectRoot = path.dirname(fixmeDir);
  const saveData = prepareChildPayload({ suffix: 'task-init-idempotent' }).child.handoff.taskSaveData;
  const saved = runInDir(`task save --data '${JSON.stringify(saveData)}'`, projectRoot);
  assert(saved.ok, `task save should succeed, got ${JSON.stringify(saved.data)}`);

  const original = readJson(saved.data.statePath);
  const durablePatch = {
    cursor: { phase: 'implement', stage: 'review', skill: 'fixme-review-code', dispatchMode: 'repair' },
    artifacts: {
      preparationArtifacts: [{
        artifactType: 'child-handoff-payload',
        artifactPath: saved.data.taskPath.replace(/\.md$/, '.handoff.json'),
        title: 'Preserved handoff',
        summary: ['Must survive task init.'],
        sourceSkill: 'fixme-pr-comments',
        status: 'current',
      }],
    },
    loops: { phaseReviewCycles: [{ phase: 'implement', cycles: 2 }], outerCycles: 1 },
    decisions: [{ id: 'decision_preserve', status: 'active' }],
    terminalResult: { terminalResultId: 'terminal_preserve', status: 'completed' },
  };
  const checkpoint = runInDir(`task checkpoint --state "${saved.data.statePath}" --data '${JSON.stringify(durablePatch)}'`, projectRoot);
  assert(checkpoint.ok, `checkpoint should seed durable state, got ${JSON.stringify(checkpoint.data)}`);

  const parentContinuation = {
    parentSkill: 'fixme-pr-comments',
    parentRunId: 'parent_preserve',
    transport: 'agent',
    resumeStep: 'awaitFixmeTaskResult',
    parentStatusId: 'run_preserve',
  };
  const init = runInDir(
    `task init --task "${saved.data.taskPath}" --pipeline-resolution '${JSON.stringify(original.pipelineResolution)}' --project-root "${projectRoot}" --parent-continuation '${JSON.stringify(parentContinuation)}'`,
    projectRoot
  );
  assert(init.ok, `existing saved task init should succeed, got ${JSON.stringify(init.data)}`);
  assert(init.data.statePath === saved.data.statePath, 'existing saved task init should reuse state path');

  const state = readJson(saved.data.statePath);
  assert(JSON.stringify(state.parentContinuation) === JSON.stringify(parentContinuation), 'parentContinuation should be merged');
  assert(JSON.stringify(state.cursor) === JSON.stringify(durablePatch.cursor), 'cursor should be preserved');
  assert(JSON.stringify(state.loops) === JSON.stringify(durablePatch.loops), 'loops should be preserved');
  assert(JSON.stringify(state.decisions) === JSON.stringify(durablePatch.decisions), 'decisions should be preserved');
  assert(JSON.stringify(state.terminalResult) === JSON.stringify(durablePatch.terminalResult), 'terminalResult should be preserved');
  assert(state.artifacts.preparationArtifacts[0].artifactType === 'child-handoff-payload', 'preparation artifact should be preserved');

  const replay = runInDir(
    `task init --task "${saved.data.taskPath}" --pipeline-resolution '${JSON.stringify(original.pipelineResolution)}' --project-root "${projectRoot}" --parent-continuation '${JSON.stringify(parentContinuation)}'`,
    projectRoot
  );
  assert(replay.ok, `equivalent saved task init replay should succeed, got ${JSON.stringify(replay.data)}`);

  const conflictingParent = { ...parentContinuation, parentRunId: 'parent_conflict' };
  const conflict = runInDir(
    `task init --task "${saved.data.taskPath}" --pipeline-resolution '${JSON.stringify(original.pipelineResolution)}' --project-root "${projectRoot}" --parent-continuation '${JSON.stringify(conflictingParent)}'`,
    projectRoot
  );
  assert(!conflict.ok, 'conflicting parentContinuation should fail');
  assert(cliErrorMessage(conflict).includes('Saved task state has a different parentContinuation'), `conflict error should mention parentContinuation, got ${JSON.stringify(conflict.data)}`);

  const pipelineConflict = runInDir(`task init --task "${saved.data.taskPath}" ${pipelineResolutionFlag('bugfix')} --project-root "${projectRoot}"`, projectRoot);
  assert(!pipelineConflict.ok, 'conflicting pipelineResolution should fail');
  assert(cliErrorMessage(pipelineConflict).includes('Saved task state conflicts with requested task initialization'), `pipeline conflict error should mention saved task state conflict, got ${JSON.stringify(pipelineConflict.data)}`);
});

test('parent prepare-child rejects malformed PR-comments launch payloads before state mutation', () => {
  const fixmeDir = makeFixmeDir();
  const assertNoCreatedState = (message) => {
    assert(!fs.existsSync(path.join(fixmeDir, 'parents')) || fs.readdirSync(path.join(fixmeDir, 'parents')).filter(name => name !== 'index').length === 0, `${message}: no parent state created`);
    assert(!fs.existsSync(path.join(fixmeDir, 'tasks')) || fs.readdirSync(path.join(fixmeDir, 'tasks')).length === 0, `${message}: no child task state created`);
  };

  const groupIdsOnly = prepareChildPayload({ suffix: 'invalid-child-group-ids' });
  groupIdsOnly.child.handoff.payload.routedFixGroups = ['G1'];
  const groupIdsOnlyPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-invalid-child-group-ids.json', groupIdsOnly);
  const groupIdsOnlyResult = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${groupIdsOnlyPath}"`);
  assert(!groupIdsOnlyResult.ok, 'child handoff group ids should fail');
  assert(groupIdsOnlyResult.data.error.code === 'invalidInput', `child handoff group ids should be invalidInput, got ${JSON.stringify(groupIdsOnlyResult.data)}`);
  assert(groupIdsOnlyResult.data.error.message.includes('child.handoff.payload.routedFixGroups[0] must be an object'), `child handoff group id error should identify object requirement, got ${JSON.stringify(groupIdsOnlyResult.data)}`);
  assertNoCreatedState('group ids only');

  const emptyActionableDetail = prepareChildPayload({ suffix: 'empty-child-actionable-detail' });
  const emptyDetailGroup = emptyActionableDetail.child.handoff.payload.routedFixGroups[0];
  delete emptyDetailGroup.instructions;
  delete emptyDetailGroup.recommendedAction;
  emptyDetailGroup.requiredBehavior = [];
  const emptyActionableDetailPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-empty-actionable-detail.json', emptyActionableDetail);
  const emptyActionableDetailResult = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${emptyActionableDetailPath}"`);
  assert(!emptyActionableDetailResult.ok, 'child handoff group with empty actionable detail should fail');
  assert(emptyActionableDetailResult.data.error.code === 'missingRequiredField', `empty actionable detail should be missingRequiredField, got ${JSON.stringify(emptyActionableDetailResult.data)}`);
  assert(emptyActionableDetailResult.data.error.message.includes('must include instructions, requiredBehavior, or recommendedAction'), `empty actionable detail error should identify actionable detail requirement, got ${JSON.stringify(emptyActionableDetailResult.data)}`);
  assertNoCreatedState('empty actionable detail');

  const missingPipelineRunId = prepareChildPayload({ suffix: 'missing-pipeline-run-id' });
  delete missingPipelineRunId.child.pipelineRunId;
  const missingPipelineRunIdPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-missing-pipeline-run-id.json', missingPipelineRunId);
  const missingPipelineRunIdResult = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${missingPipelineRunIdPath}"`);
  assert(!missingPipelineRunIdResult.ok, 'PR-comments child pipelineRunId should be required');
  assert(missingPipelineRunIdResult.data.error.code === 'missingRequiredField', `missing pipelineRunId should be missingRequiredField, got ${JSON.stringify(missingPipelineRunIdResult.data)}`);
  assert(missingPipelineRunIdResult.data.error.message.includes('child.pipelineRunId is required'), `missing pipelineRunId error should identify child.pipelineRunId, got ${JSON.stringify(missingPipelineRunIdResult.data)}`);
  assertNoCreatedState('missing pipelineRunId');

  const unsupportedLedgerSlots = prepareChildPayload({ suffix: 'unsupported-await-ledger' });
  unsupportedLedgerSlots.await.ledger.currentPrFixGroups = [{ groupId: 'G1' }];
  unsupportedLedgerSlots.await.ledger.mustResolveThreadIds = ['PRRT_example'];
  const unsupportedLedgerSlotsPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-unsupported-await-ledger.json', unsupportedLedgerSlots);
  const unsupportedLedgerSlotsResult = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${unsupportedLedgerSlotsPath}"`);
  assert(!unsupportedLedgerSlotsResult.ok, 'unsupported await ledger slots should fail');
  assert(unsupportedLedgerSlotsResult.data.error.code === 'invalidInput', `unsupported await ledger slot should be invalidInput, got ${JSON.stringify(unsupportedLedgerSlotsResult.data)}`);
  assert(unsupportedLedgerSlotsResult.data.error.message.includes('Unsupported ledger slot: currentPrFixGroups'), `unsupported ledger error should identify the bad slot, got ${JSON.stringify(unsupportedLedgerSlotsResult.data)}`);
  assertNoCreatedState('unsupported ledger slots');
});

test('parent prepare-child sanitizes heavy child prompt inputs before launch', () => {
  const fixmeDir = makeFixmeDir();
  const payload = prepareChildPayload({
    suffix: 'heavy-prompt-inputs',
    extra: {
      child: {
        ...prepareChildPayload({ suffix: 'heavy-prompt-inputs-inner' }).child,
        idempotencyKey: 'prepare-child-heavy-prompt-inputs',
        promptInputs: {
          summary: 'Current PR review fixes',
          routedFixGroupsCount: 1,
          mustResolveThreadCount: 1,
          routedFixGroups: [{ groupId: 'G1', instructions: 'do not leak implementation instructions' }],
          evidence: [{ path: 'apps/example.ts', line: 42, summary: 'do not leak evidence arrays' }],
          instructions: 'do not leak instructions',
          fullReviewBody: 'do not leak full review bodies',
          nestedContext: { body: 'do not leak unknown nested heavy objects' },
        },
      },
    },
  });
  payload.child.handoff.taskSaveData.slug = 'prepare-child-heavy-prompt-inputs';
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-heavy-prompt-inputs.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `heavy prompt input payload should succeed with sanitization, got ${JSON.stringify(prepared.data)}`);
  const promptInputs = prepared.data.launch.promptBlocks.promptInputs;
  assert(promptInputs.summary === 'Current PR review fixes', 'lightweight summary survives sanitization');
  assert(promptInputs.routedFixGroupsCount === 1, 'lightweight count survives sanitization');
  assert(promptInputs.resumeRef === prepared.data.childTask.resumeRef, 'resumeRef is appended after sanitization');
  assert(promptInputs.taskPath === prepared.data.childTask.taskPath, 'taskPath is appended after sanitization');
  assert(promptInputs.statePath === prepared.data.childTask.statePath, 'statePath is appended after sanitization');
  assert(promptInputs.handoffPayloadPath === prepared.data.childTask.handoffPayloadPath, 'handoffPayloadPath is appended after sanitization');
  const promptText = JSON.stringify(prepared.data.launch.promptBlocks);
  assert(!promptText.includes('do not leak'), `heavy prompt inputs should not leak, got ${promptText}`);
  assert(!Object.prototype.hasOwnProperty.call(promptInputs, 'routedFixGroups'), 'routed fix detail arrays are omitted from promptInputs');
  assert(!Object.prototype.hasOwnProperty.call(promptInputs, 'evidence'), 'evidence arrays are omitted from promptInputs');
  assert(!Object.prototype.hasOwnProperty.call(promptInputs, 'nestedContext'), 'unknown nested objects are omitted from promptInputs');
});

test('parent prepare-child replay digest ignores stripped heavy prompt inputs only', () => {
  const fixmeDir = makeFixmeDir();
  const firstPayload = prepareChildPayload({
    suffix: 'heavy-prompt-replay',
    extra: {
      child: {
        ...prepareChildPayload({ suffix: 'heavy-prompt-replay-inner' }).child,
        idempotencyKey: 'prepare-child-heavy-prompt-replay',
        promptInputs: {
          summary: 'Current PR review fixes',
          routedFixGroupsCount: 1,
          mustResolveThreadCount: 1,
          routedFixGroups: [{ groupId: 'G1', instructions: 'heavy instructions v1' }],
          evidence: [{ path: 'apps/example.ts', line: 42, summary: 'heavy evidence v1' }],
        },
      },
    },
  });
  firstPayload.child.handoff.taskSaveData.slug = 'prepare-child-heavy-prompt-replay';
  const firstPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-heavy-prompt-replay-1.json', firstPayload);
  const first = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${firstPath}"`);
  assert(first.ok, `initial prepare-child should succeed, got ${JSON.stringify(first.data)}`);

  const heavyOnlyReplayPayload = JSON.parse(JSON.stringify(firstPayload));
  heavyOnlyReplayPayload.child.promptInputs.routedFixGroups = [{ groupId: 'G1', instructions: 'heavy instructions v2' }];
  heavyOnlyReplayPayload.child.promptInputs.evidence = [{ path: 'apps/example.ts', line: 99, summary: 'heavy evidence v2' }];
  heavyOnlyReplayPayload.child.promptInputs.fullReviewBody = 'heavy body omitted from launch';
  const heavyOnlyPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-heavy-prompt-replay-2.json', heavyOnlyReplayPayload);
  const heavyOnlyReplay = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${heavyOnlyPath}"`);
  assert(heavyOnlyReplay.ok, `heavy-only prompt replay should reuse handoff, got ${JSON.stringify(heavyOnlyReplay.data)}`);
  assert(heavyOnlyReplay.data.childTask.taskPath === first.data.childTask.taskPath, 'heavy-only prompt replay reuses saved task');
  assert(heavyOnlyReplay.data.dispatchId === first.data.dispatchId, 'heavy-only prompt replay reuses dispatch');

  const lightweightConflictPayload = JSON.parse(JSON.stringify(firstPayload));
  lightweightConflictPayload.child.promptInputs.summary = 'Different lightweight summary';
  const conflictPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-heavy-prompt-replay-conflict.json', lightweightConflictPayload);
  const conflict = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${conflictPath}"`);
  assert(!conflict.ok, 'changed lightweight prompt input should conflict');
  assert(conflict.data.error.code === 'conflictingDuplicate', `changed lightweight prompt conflict should be conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
});

test('parent prepare-child handles stale natural-key parent before create-digest conflicts', () => {
  const fixmeDir = makeFixmeDir();
  const staleCreate = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    idempotencyKey: 'stale-before-conflict',
    extra: {
      cursor: 'presentAnalysis',
      payload: {
        flags: {},
        reviewItems: { currentPrFix: [] },
        analysis: { currentPrFixCount: 0 },
        routedGroups: [],
      },
    },
  })}'`);
  assert(staleCreate.ok, `stale seed parent should create, got ${JSON.stringify(staleCreate.data)}`);
  const staleState = parentState(fixmeDir, staleCreate.data.parentRunId);
  staleState.status = 'waitingForChild';
  staleState.cursor = 'awaitFixmeTask';
  staleState.payload = { fixBatches: [{ id: 'batch-stale' }], activeBatchIndex: 0 };
  staleState.updatedAt = new Date().toISOString();
  writeParentState(fixmeDir, staleCreate.data.parentRunId, staleState);

  const payload = prepareChildPayload({
    suffix: 'recover-stale-before-conflict',
    extra: { recoverStaleParent: true },
  });
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-recover-stale.json', payload);
  const repaired = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(repaired.ok, `stale recovery should win before create conflict, got ${JSON.stringify(repaired.data)}`);
  assert(repaired.data.parentRunId !== staleCreate.data.parentRunId, 'recovery creates a fresh parent run after abandoning stale state');
  const abandoned = parentState(fixmeDir, staleCreate.data.parentRunId);
  assert(abandoned.status === 'failed', `stale parent should be abandoned, got ${JSON.stringify(abandoned)}`);
  assert(abandoned.failure.reason === 'staleParentMissingActiveChild', `stale failure reason should persist, got ${JSON.stringify(abandoned.failure)}`);
});

test('parent prepare-child recovers stale natural-key parent after consumed terminal child event', () => {
  const fixmeDir = makeFixmeDir();
  const staleCreate = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    idempotencyKey: 'stale-consumed-child',
    extra: {
      cursor: 'presentAnalysis',
      payload: {
        flags: {},
        reviewItems: { currentPrFix: [{ id: 'old' }] },
        analysis: { currentPrFixCount: 1 },
        routedGroups: [{ groupId: 'old', route: 'currentPrFix', sourceIds: ['old'] }],
      },
    },
  })}'`);
  assert(staleCreate.ok, `stale consumed-child seed parent should create, got ${JSON.stringify(staleCreate.data)}`);
  const staleState = parentState(fixmeDir, staleCreate.data.parentRunId);
  staleState.status = 'waitingForChild';
  staleState.cursor = 'awaitFixmeTask';
  staleState.payload = {
    fixBatches: [{ id: 'old-batch' }],
    activeBatchIndex: 0,
    activeChild: {
      statusId: 'run_old_child',
      taskRunId: 'taskRun_old_child',
      taskStatePath: path.join(fixmeDir, 'tasks', 'old.state.json'),
      resumeRef: path.join(fixmeDir, 'tasks', 'old.md'),
    },
    consumedTaskEvent: {
      eventId: 'taskEvent_old_child',
      terminalResultId: 'terminalResult_old_child',
      resultSummaryPath: path.join(fixmeDir, 'tasks', 'old.result.json'),
      status: 'completed',
    },
  };
  staleState.updatedAt = new Date().toISOString();
  writeParentState(fixmeDir, staleCreate.data.parentRunId, staleState);

  const payload = prepareChildPayload({
    suffix: 'recover-consumed-child',
    extra: { recoverStaleParent: true },
  });
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-recover-consumed-child.json', payload);
  const repaired = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(repaired.ok, `consumed child recovery should win before create conflict, got ${JSON.stringify(repaired.data)}`);
  assert(repaired.data.parentRunId !== staleCreate.data.parentRunId, 'recovery creates a fresh parent run after abandoning consumed-child stale state');
  const abandoned = parentState(fixmeDir, staleCreate.data.parentRunId);
  assert(abandoned.status === 'failed', `consumed-child stale parent should be abandoned, got ${JSON.stringify(abandoned)}`);
  assert(abandoned.failure.reason === 'staleParentConsumedTaskEvent', `stale consumed-child reason should persist, got ${JSON.stringify(abandoned.failure)}`);
});

test('parent prepare-child preserves session ledger defaults in persisted parent state', () => {
  const fixmeDir = makeFixmeDir();
  const sessionTaskRef = {
    sessionPath: path.join(fixmeDir, 'sessions', 's1'),
    ticketPath: path.join(fixmeDir, 'sessions', 's1', '0001-ticket'),
  };
  const fixBatches = [{ id: 'session-batch', summary: 'session dispatch' }];
  const payload = prepareChildPayload({
    suffix: 'session-ledger',
    parentSkill: 'fixme-session',
    lookupInput: { sessionTaskRef },
    parentPayload: {},
    transport: 'background',
    extra: {
      await: {
        fixBatches,
        activeBatchIndex: 0,
        ledger: { reviewItems: { carried: true } },
      },
    },
  });
  payload.child.runtime = 'codex';
  payload.child.handoff.taskSaveData.source = 'fixme-session';
  payload.child.handoff.taskSaveData.tags = ['fixme-session', 'parent-driven'];
  payload.child.handoff.payload.source = 'fixme-session';
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-session-ledger.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `session prepare-child should succeed, got ${JSON.stringify(prepared.data)}`);
  const persisted = parentState(fixmeDir, prepared.data.parentRunId);
  assert(JSON.stringify(persisted.ledger.sessionTaskRef) === JSON.stringify(sessionTaskRef), `sessionTaskRef ledger should persist, got ${JSON.stringify(persisted.ledger)}`);
  assert(JSON.stringify(persisted.ledger.fixBatches) === JSON.stringify(fixBatches), `fixBatches ledger should persist, got ${JSON.stringify(persisted.ledger)}`);
  assert(persisted.ledger.reviewItems.carried === true, `caller ledger should be preserved, got ${JSON.stringify(persisted.ledger)}`);
});

test('parent prepare-child rejects dynamic group keys before state mutation and preserves Claude inline transport', () => {
  const fixmeDir = makeFixmeDir();
  const invalidPayload = prepareChildPayload({
    suffix: 'bad-groups',
    parentPayload: {
      flags: {},
      reviewItems: { currentPrFix: [] },
      analysis: {},
      routedGroups: { G1: { route: 'currentPrFix', sourceIds: ['G1'] } },
    },
  });
  const invalidPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-invalid.json', invalidPayload);
  const invalid = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${invalidPath}"`);
  assert(!invalid.ok, 'dynamic group-key payload should fail');
  assert((invalid.data.error.code === 'invalidInput' || invalid.data.error.code === 'unknownField'), `invalid grouped payload error, got ${JSON.stringify(invalid.data)}`);
  assert(!fs.existsSync(path.join(fixmeDir, 'parents')) || fs.readdirSync(path.join(fixmeDir, 'parents')).filter(name => name !== 'index').length === 0, 'invalid grouped payload does not create parent');
  assert(!fs.existsSync(path.join(fixmeDir, 'tasks')) || fs.readdirSync(path.join(fixmeDir, 'tasks')).length === 0, 'invalid grouped payload does not create child task');

  const claudePayload = prepareChildPayload({ suffix: 'claude', runtime: 'claude', transport: 'inline-skill' });
  const claudePath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-claude.json', claudePayload);
  const claude = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${claudePath}"`);
  assert(claude.ok, `Claude inline prepare-child should succeed, got ${JSON.stringify(claude.data)}`);
  assert(claude.data.launch.transport === 'inline-skill', 'Claude launch transport stays inline-skill');
  assert(claude.data.launch.promptBlocks.parentContinuation.transport === 'inline-skill', 'Claude parent continuation transport stays inline-skill');
});

test('parent-driven fixme-task materializes and completes from activeChild state handle', () => {
  const fixmeDir = makeFixmeDir();
  const projectRoot = path.dirname(fixmeDir);
  const parentContinuationTemplate = {
    parentSkill: 'fixme-pr-comments',
    parentRunId: 'parent_pending',
    transport: 'inline-skill',
    resumeStep: 'verify',
    parentStatusId: 'run_parent',
  };
  const parent = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    extra: {
      cursor: 'dispatchFixmeTask',
      payload: {
        fixBatches: [[{ id: 'comment-1' }]],
        activeBatchIndex: 0,
        parentContinuation: parentContinuationTemplate,
      },
    },
  })}'`);
  assert(parent.ok, `parent create should succeed, got: ${JSON.stringify(parent.data)}`);
  const parentContinuation = {
    parentSkill: 'fixme-pr-comments',
    parentRunId: parent.data.parentRunId,
    transport: 'inline-skill',
    resumeStep: 'verify',
    parentStatusId: 'run_parent',
  };
  const prepareData = JSON.stringify({
    idempotencyKey: 'd-active-child-materialize',
    agentName: 'fixme-task',
    transport: 'inline-skill',
    parentContinuation,
    promptInputs: { routedFixGroups: [{ id: 'comment-1' }] },
  });
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${prepareData}'`);
  assert(prep.ok, `dispatch prepare should succeed, got: ${JSON.stringify(prep.data)}`);
  const activeChild = prep.data.activeChild;
  assert(activeChild && activeChild.resumeRef === activeChild.taskStatePath, `activeChild should be resumable by reserved state path, got ${JSON.stringify(activeChild)}`);

  const checkpoint = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${parent.data.parentRunId} --data '${JSON.stringify({
    idempotencyKey: 'await-active-child-materialize',
    expectedRevision: 0,
    status: 'waitingForChild',
    cursor: 'awaitFixmeTask',
    payload: {
      fixBatches: [[{ id: 'comment-1' }]],
      activeBatchIndex: 0,
      activeChild,
    },
    ledger: {},
  })}'`);
  assert(checkpoint.ok, `parent should persist activeChild before child work, got ${JSON.stringify(checkpoint.data)}`);

  const init = runInDir(
    `task init --state "${activeChild.taskStatePath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}" --parent-continuation '${JSON.stringify(parentContinuation)}'`,
    projectRoot
  );
  assert(init.ok, `reserved activeChild.taskStatePath should initialize child task state, got ${JSON.stringify(init.data)}`);
  assert(init.data.statePath === activeChild.taskStatePath, `init should use activeChild.taskStatePath, got ${JSON.stringify(init.data)}`);
  assert(init.data.taskPath === null && init.data.ticketPath === null, `reserved state init should not invent task/ticket paths, got ${JSON.stringify(init.data)}`);
  const childState = readJson(activeChild.taskStatePath);
  assert(JSON.stringify(childState.parentContinuation) === JSON.stringify(parentContinuation), 'parentContinuation is persisted before child work');

  const resolved = runInDir(`task resolve "${activeChild.resumeRef}"`, projectRoot);
  assert(resolved.ok, `activeChild.resumeRef should resolve, got ${JSON.stringify(resolved.data)}`);
  assert(resolved.data.statePath === activeChild.taskStatePath, `resumeRef should resolve to same task state path, got ${JSON.stringify(resolved.data)}`);

  const resultData = JSON.stringify({ status: 'completed', summaryMarkdown: 'child done', changedFiles: [], artifactPaths: [] });
  const result = runInDir(`task result write --state "${activeChild.taskStatePath}" --data '${resultData}'`, projectRoot);
  assert(result.ok, `task result should write against activeChild.taskStatePath, got ${JSON.stringify(result.data)}`);
  activeChild.terminalResultId = result.data.terminalResultId;

  const recordData = JSON.stringify({
    parentRunId: parent.data.parentRunId,
    taskRunId: activeChild.taskRunId,
    taskStatePath: activeChild.taskStatePath,
    resultSummaryPath: result.data.resultSummaryPath,
    terminalResultId: result.data.terminalResultId,
    status: 'completed',
  });
  const recorded = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${recordData}'`);
  assert(recorded.ok, `terminal event should record with exact activeChild handle, got ${JSON.stringify(recorded.data)}`);
  assert(recorded.data.event.taskRunId === activeChild.taskRunId, 'event uses activeChild.taskRunId');
  assert(recorded.data.event.taskStatePath === activeChild.taskStatePath, 'event uses activeChild.taskStatePath');

  const parentStateBeforeConsume = parentState(fixmeDir, parent.data.parentRunId);
  parentStateBeforeConsume.payload.activeChild = activeChild;
  writeParentState(fixmeDir, parent.data.parentRunId, parentStateBeforeConsume);

  const consumed = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parent.data.parentRunId} --next`);
  assert(consumed.ok, `--next should consume the active child event, got ${JSON.stringify(consumed.data)}`);
  assert(consumed.data.event.taskRunId === activeChild.taskRunId, 'consume returns exact activeChild.taskRunId event');
  assert(consumed.data.event.taskStatePath === activeChild.taskStatePath, 'consume returns exact activeChild.taskStatePath event');
});

test('reserved task-state init rejects paths outside Fixme tasks and saved-task conflicts', () => {
  const fixmeDir = makeFixmeDir();
  const projectRoot = path.dirname(fixmeDir);
  const outside = path.join(projectRoot, 'outside.state.json');
  const outsideResult = runInDir(`task init --state "${outside}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(!outsideResult.ok, `reserved state outside tasks should fail, got ${JSON.stringify(outsideResult.data)}`);

  const taskPath = path.join(fixmeDir, 'tasks', 'taskRun_conflict.md');
  fs.mkdirSync(path.dirname(taskPath), { recursive: true });
  fs.writeFileSync(taskPath, '---\nlabel: FIXME-1\n---\n\n# Conflict\n');
  const conflictStatePath = taskPath.replace(/\.md$/, '.state.json');
  const conflict = runInDir(`task init --state "${conflictStatePath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(!conflict.ok, `reserved state colliding with saved task markdown should fail, got ${JSON.stringify(conflict.data)}`);
});

test('dispatch prepare preserves active attention guard', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  const attentionData = JSON.stringify({
    ownerSkill: 'fixme-task', sourceSkill: 'fixme-handle-code-review', kind: 'reviewDecision',
    resumeRef: 'FIXME-1', taskStatePath: path.join(fixmeDir, 'tasks', 't.state.json'),
    promptMarkdown: '## D', answerMode: 'freeform',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId} --data '${attentionData}'`);
  const attentionCommand = `attention:${set.data.attentionId}`;
  const data = JSON.stringify({ idempotencyKey: 'd3', agentName: 'fixme-task', transport: 'agent', parentStatusId: parent.data.statusId, promptInputs: {} });
  run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  const parentStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId}`);
  assert(parentStatus.data.currentCommand === attentionCommand, `parent attention marker preserved, got ${parentStatus.data.currentCommand}`);
});

test('dispatch complete finalizes child status and rejects conflicting completion', () => {
  const fixmeDir = makeFixmeDir();
  const data = JSON.stringify({ idempotencyKey: 'd4', agentName: 'fixme-task', transport: 'agent', promptInputs: {} });
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${data}'`);
  const completeData = JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: prep.data.statusId, status: 'completed' });
  const complete = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(complete.ok, `dispatch complete should succeed, got: ${JSON.stringify(complete.data)}`);
  const childStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${prep.data.statusId}`);
  assert(childStatus.data.state === 'completed', `child should be completed, got ${childStatus.data.state}`);
  const replay = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(replay.ok, 'idempotent complete should succeed');
  const conflictData = JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: prep.data.statusId, status: 'failed' });
  const conflict = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `conflicting completion, got ${JSON.stringify(conflict.data)}`);
});

test('dispatch complete resolves prepared dispatch by dispatchId and validates statusId', () => {
  const fixmeDir = makeFixmeDir();
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ idempotencyKey: 'd4-keyed', agentName: 'fixme-task', transport: 'agent', promptInputs: {} })}'`);
  assert(prep.ok, `prepare should succeed, got: ${JSON.stringify(prep.data)}`);
  const stray = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(stray.ok, `stray run should succeed, got: ${JSON.stringify(stray.data)}`);

  const bogus = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ dispatchId: 'dispatch_missing', statusId: prep.data.statusId, status: 'completed' })}'`);
  assert(!bogus.ok && bogus.data.error.code === 'stateNotFound', `bogus dispatchId should be rejected, got ${JSON.stringify(bogus.data)}`);

  const mismatch = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: stray.data.statusId, status: 'completed' })}'`);
  assert(!mismatch.ok && mismatch.data.error.code === 'invalidInput', `mismatched statusId should be rejected, got ${JSON.stringify(mismatch.data)}`);
  const strayStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${stray.data.statusId}`);
  assert(strayStatus.data.state === 'running', `mismatched complete must not finalize stray status, got ${strayStatus.data.state}`);
});

test('dispatch complete persists failure payload and rejects conflicting replay', () => {
  const fixmeDir = makeFixmeDir();
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ idempotencyKey: 'd4-failed', agentName: 'fixme-task', transport: 'agent', promptInputs: {} })}'`);
  assert(prep.ok, `prepare should succeed, got: ${JSON.stringify(prep.data)}`);
  const failure = { reason: 'childFailed', message: 'child failed', details: { taskStatePath: '/tmp/task.state.json' } };
  const completeData = JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: prep.data.statusId, status: 'failed', currentCommand: 'node test.js', failure });
  const complete = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(complete.ok, `failed complete should succeed, got: ${JSON.stringify(complete.data)}`);
  assert(complete.data.failure && complete.data.failure.message === 'child failed', `failure should be returned, got ${JSON.stringify(complete.data)}`);
  assert(complete.data.currentCommand === 'node test.js', `currentCommand should be returned, got ${JSON.stringify(complete.data)}`);
  const childStatus = readJson(prep.data.statusPath);
  assert(childStatus.state === 'failed', `child should be failed, got ${childStatus.state}`);
  assert(childStatus.currentCommand === 'node test.js', `child currentCommand should persist, got ${childStatus.currentCommand}`);
  assert(childStatus.failure && childStatus.failure.message === 'child failed', `child failure should persist, got ${JSON.stringify(childStatus)}`);

  const replay = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(replay.ok, `identical failed replay should succeed, got ${JSON.stringify(replay.data)}`);
  const conflictData = JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: prep.data.statusId, status: 'failed', currentCommand: 'node test.js', failure: { ...failure, message: 'different failure' } });
  const conflict = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `different failure replay should conflict, got ${JSON.stringify(conflict.data)}`);
});

test('dispatch complete partial-write recovery rejects conflicting terminal replay', () => {
  function completeThenRemoveCompletionRecord(label, completePatch = {}) {
    const fixmeDir = makeFixmeDir();
    const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ idempotencyKey: `d4-partial-${label}`, agentName: 'fixme-task', transport: 'agent', promptInputs: {} })}'`);
    assert(prep.ok, `prepare should succeed, got: ${JSON.stringify(prep.data)}`);
    const failure = { reason: 'childFailed', message: 'original failure' };
    const completeData = {
      dispatchId: prep.data.dispatchId,
      statusId: prep.data.statusId,
      status: 'failed',
      currentCommand: 'original command',
      failure,
      ...completePatch,
    };
    const complete = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${JSON.stringify(completeData)}'`);
    assert(complete.ok, `failed complete should succeed, got: ${JSON.stringify(complete.data)}`);
    const idempotencyDir = path.join(fixmeDir, 'dispatch', 'idempotency');
    const recordPath = path.join(idempotencyDir, fs.readdirSync(idempotencyDir)[0]);
    const record = readJson(recordPath);
    delete record.completion;
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    return { fixmeDir, prep, failure, completeData };
  }

  const failureCase = completeThenRemoveCompletionRecord('failure');
  const failureConflict = run(`lifecycle dispatch complete --fixme-dir "${failureCase.fixmeDir}" --data '${JSON.stringify({
    ...failureCase.completeData,
    failure: { ...failureCase.failure, message: 'different failure' },
  })}'`);
  assert(!failureConflict.ok && failureConflict.data.error.code === 'conflictingDuplicate', `different failure should conflict after partial write, got ${JSON.stringify(failureConflict.data)}`);

  const commandCase = completeThenRemoveCompletionRecord('command');
  const commandConflict = run(`lifecycle dispatch complete --fixme-dir "${commandCase.fixmeDir}" --data '${JSON.stringify({
    ...commandCase.completeData,
    currentCommand: 'different command',
  })}'`);
  assert(!commandConflict.ok && commandConflict.data.error.code === 'conflictingDuplicate', `different currentCommand should conflict after partial write, got ${JSON.stringify(commandConflict.data)}`);

  const identicalCase = completeThenRemoveCompletionRecord('identical');
  const identicalReplay = run(`lifecycle dispatch complete --fixme-dir "${identicalCase.fixmeDir}" --data '${JSON.stringify(identicalCase.completeData)}'`);
  assert(identicalReplay.ok, `identical replay should recover missing completion record, got ${JSON.stringify(identicalReplay.data)}`);
});

test('dispatch prepare replay with different durable inputs returns conflictingDuplicate', () => {
  const fixmeDir = makeFixmeDir();
  const first = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ idempotencyKey: 'd5', agentName: 'fixme-write-plan', transport: 'agent', promptInputs: {} })}'`);
  assert(first.ok, `first prepare should succeed, got: ${JSON.stringify(first.data)}`);
  // Same idempotencyKey, different agentName -> conflictingDuplicate. The replay
  // must not silently hand back the original agent's dispatch.
  const conflict = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ idempotencyKey: 'd5', agentName: 'fixme-execute-plan', transport: 'agent', promptInputs: {} })}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `conflicting durable inputs, got ${JSON.stringify(conflict.data)}`);
  assert(fs.readdirSync(path.join(fixmeDir, 'runs')).length === 1, 'no extra child run-status created on conflict');
});

test('dispatch complete with parentStatusId clears the parent wait marker', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  const prepData = JSON.stringify({ idempotencyKey: 'd6', agentName: 'fixme-write-plan', transport: 'agent', parentStatusId: parent.data.statusId, promptInputs: {} });
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${prepData}'`);
  assert(prep.ok, `prepare should succeed, got: ${JSON.stringify(prep.data)}`);
  const waiting = run(`run status --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId}`);
  assert(waiting.data.currentCommand === 'dispatching fixme-write-plan', `parent marker set by prepare, got ${waiting.data.currentCommand}`);
  const completeData = JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: prep.data.statusId, status: 'completed', parentStatusId: parent.data.statusId });
  const complete = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(complete.ok, `complete should succeed, got: ${JSON.stringify(complete.data)}`);
  const cleared = run(`run status --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId}`);
  assert(cleared.data.currentCommand === null, `parent wait marker cleared, got ${cleared.data.currentCommand}`);
  assert(cleared.data.state === 'running' && cleared.data.checkpoint === 'working', `parent reset to working, got ${cleared.data.state}/${cleared.data.checkpoint}`);
});

test('dispatch prepare rejects same-agent parent recursion', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-write-plan`);
  assert(parent.ok, `parent run should start, got: ${JSON.stringify(parent.data)}`);

  const prepareData = JSON.stringify({
    idempotencyKey: 'same-agent-recursion',
    agentName: 'fixme-write-plan',
    transport: 'agent',
    parentStatusId: parent.data.statusId,
    promptInputs: {},
  });
  const result = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${prepareData}'`);

  assert(!result.ok, `same-agent parent dispatch should be rejected, got ${JSON.stringify(result.data)}`);
  assert(result.data.error.code === 'invalidInput', `same-agent dispatch should be invalid input, got ${JSON.stringify(result.data)}`);
  assert(
    cliErrorMessage(result).includes('cannot dispatch child agent fixme-write-plan from parent agent fixme-write-plan'),
    `same-agent error should name parent and child agents, got ${cliErrorMessage(result)}`,
  );
  const parentStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId}`);
  assert(parentStatus.data.currentCommand === null, `rejected prepare must not set parent wait marker, got ${parentStatus.data.currentCommand}`);
  assert(fs.readdirSync(path.join(fixmeDir, 'runs')).length === 1, 'rejected prepare must not create a child run status');
});

test('dispatch complete leaves an active parent attention marker untouched', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  // Put the parent on an attention marker.
  const attentionData = JSON.stringify({
    ownerSkill: 'fixme-task', sourceSkill: 'fixme-handle-code-review', kind: 'reviewDecision',
    resumeRef: 'FIXME-1', taskStatePath: path.join(fixmeDir, 'tasks', 't.state.json'),
    promptMarkdown: '## D', answerMode: 'freeform',
  });
  const set = run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId} --data '${attentionData}'`);
  const attentionCommand = `attention:${set.data.attentionId}`;
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({ idempotencyKey: 'd7', agentName: 'fixme-write-plan', transport: 'agent', promptInputs: {} })}'`);
  assert(prep.ok, `prepare should succeed, got: ${JSON.stringify(prep.data)}`);
  const completeData = JSON.stringify({ dispatchId: prep.data.dispatchId, statusId: prep.data.statusId, status: 'completed', parentStatusId: parent.data.statusId });
  const complete = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(complete.ok, `complete should still finalize child, got: ${JSON.stringify(complete.data)}`);
  const childStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${prep.data.statusId}`);
  assert(childStatus.data.state === 'completed', `child finalized, got ${childStatus.data.state}`);
  const parentStatus = run(`run status --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId}`);
  assert(parentStatus.data.currentCommand === attentionCommand, `parent attention marker preserved, got ${parentStatus.data.currentCommand}`);
});

console.log('\n=== lifecycle attention tests ===\n');

function initTaskWithRunStatus(slug) {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const fixmeDir = path.join(projectRoot, '.fixme');
  const sessionDir = path.join(fixmeDir, 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', slug, 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(initialized.ok, `task init should succeed, got: ${JSON.stringify(initialized.data)}`);
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  return { projectRoot, fixmeDir, statePath: initialized.data.statePath, statusId: started.data.statusId };
}

function attentionOpenData(statusId, statePath, overrides = {}) {
  return JSON.stringify({
    statusId,
    taskStatePath: statePath,
    checkpointData: { status: 'waitingForUser', pendingDecision: { kind: 'plan-decision' } },
    attention: {
      ownerSkill: 'fixme-task',
      sourceSkill: 'fixme-handle-code-review',
      kind: 'plan-decision',
      resumeRef: 'FIXME-1',
      taskStatePath: statePath,
      answerMode: 'decision-card',
      promptMarkdown: '## Decision\n\nPick.',
      ...overrides,
    },
  });
}

function ownerAttentionOpenData(statusId, statePath, attentionId, options = {}) {
  const checkpointData = options.checkpointData || {
    status: 'waitingForUser',
    pendingDecision: {
      attentionId,
      attentionStatusId: statusId,
      kind: 'plan-decision',
    },
  };
  return JSON.stringify({
    statusId,
    taskStatePath: statePath,
    checkpointData,
    attention: {
      ownerSkill: 'fixme-task',
      sourceSkill: 'fixme-handle-code-review',
      kind: 'plan-decision',
      resumeRef: 'FIXME-1',
      taskStatePath: statePath,
      answerMode: 'decision-card',
      promptMarkdown: '## Decision\n\nPick.',
      attentionId,
      ...(options.attention || {}),
    },
  });
}

function consumeAttentionData(statusId, statePath, attentionId, mode, checkpointData, decisionRecords) {
  const data = {
    statusId,
    taskStatePath: statePath,
    attentionId,
    mode,
    checkpointData,
  };
  if (decisionRecords !== undefined) {
    data.decisionRecords = decisionRecords;
  }
  return JSON.stringify(data);
}

test('attention open checkpoints first then creates attention', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-open');
  const r = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath)}'`);
  assert(r.ok, `attention open should succeed, got: ${JSON.stringify(r.data)}`);
  assert(typeof r.data.attentionId === 'string', 'attentionId present');
  assert(fs.existsSync(r.data.attentionPath), 'attention file exists');
  assert(typeof r.data.directive === 'string' && r.data.directive.includes('FIXME_ATTENTION_REQUIRED'), `directive present, got ${r.data.directive}`);
  const state = readJson(statePath);
  assert(state.status === 'waitingForUser', `task checkpointed, got ${state.status}`);
});

test('attention open restores task state when attention creation fails', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-fail');
  // Make the run status terminal so runAttentionSetCore rejects.
  run(`run ping --fixme-dir "${fixmeDir}" --status-id ${statusId} --state failed --checkpoint done --current-command null`);
  const before = readJson(statePath).status;
  const r = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath)}'`);
  assert(!r.ok, 'attention open should fail');
  assert(r.data.error.code === 'attentionBlocked', `code should be attentionBlocked, got ${JSON.stringify(r.data)}`);
  assert(r.data.repaired === true, 'repaired true');
  const after = readJson(statePath).status;
  assert(after === before, `task state restored, before=${before} after=${after}`);
});

test('attention open idempotent for same open request returns existing directive', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-idem');
  const data = attentionOpenData(statusId, statePath, { attentionId: 'attn_fixed1' });
  const first = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(first.ok, `first open should succeed, got: ${JSON.stringify(first.data)}`);
  const mtimeBefore = fs.statSync(first.data.attentionPath).mtimeMs;
  const second = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(second.ok, `replay should succeed, got: ${JSON.stringify(second.data)}`);
  assert(second.data.attentionId === 'attn_fixed1', 'same attentionId');
  const mtimeAfter = fs.statSync(first.data.attentionPath).mtimeMs;
  assert(mtimeBefore === mtimeAfter, 'attention file not rewritten on replay');
});

test('attention open conflicting prompt returns conflictingDuplicate', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-conflict');
  const data = attentionOpenData(statusId, statePath, { attentionId: 'attn_fixed2' });
  const first = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(first.ok, `first open should succeed, got: ${JSON.stringify(first.data)}`);
  const conflictData = attentionOpenData(statusId, statePath, { attentionId: 'attn_fixed2', promptMarkdown: '## Different\n\nPick.' });
  const conflict = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${conflictData}'`);
  assert(!conflict.ok, 'conflicting prompt should fail');
  assert(conflict.data.error.code === 'conflictingDuplicate', `code should be conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
});

test('attention broker show and answer record answer without interpreting', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-broker');
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath, { attentionId: 'attn_brk1' })}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const show = run(`lifecycle attention broker show --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_brk1`);
  assert(show.ok && show.data.attentionId === 'attn_brk1', `broker show returns record, got ${JSON.stringify(show.data)}`);
  const answerData = JSON.stringify({ answer: 'go with option A', answeredBy: 'user', answerKind: 'decision' });
  const answer = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_brk1 --data '${answerData}'`);
  assert(answer.ok, `broker answer should succeed, got: ${JSON.stringify(answer.data)}`);
  assert(answer.data.status === 'answered', `status answered, got ${answer.data.status}`);
  // task state must not be cleared or interpreted by the broker.
  const state = readJson(statePath);
  assert(state.status === 'waitingForUser', `task state unchanged by broker, got ${state.status}`);
  const conflictData = JSON.stringify({ answer: 'different', answeredBy: 'user', answerKind: 'decision' });
  const conflict = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_brk1 --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `conflicting answer, got ${JSON.stringify(conflict.data)}`);
});

test('attention broker show does not expose task-owned decision state', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-broker-leak');
  // The open carries checkpointData with a pendingDecision; it is persisted on
  // the durable record under metadata.openCheckpointData for the open-replay
  // compare, but the broker (parent-facing) must not surface it.
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath, { attentionId: 'attn_leak1' })}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const show = run(`lifecycle attention broker show --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_leak1`);
  assert(show.ok, `broker show should succeed, got: ${JSON.stringify(show.data)}`);
  assert(show.data.attentionId === 'attn_leak1', `broker show returns display fields, got ${JSON.stringify(show.data)}`);
  assert(typeof show.data.promptMarkdown === 'string' && show.data.answerMode === 'decision-card', 'display fields present');
  const serialized = JSON.stringify(show.data);
  assert(!serialized.includes('openCheckpointData'), `broker show must not expose openCheckpointData, got ${serialized}`);
  assert(!serialized.includes('pendingDecision'), `broker show must not expose pendingDecision, got ${serialized}`);
  assert(show.data.metadata === undefined, `broker show must not return raw metadata, got ${JSON.stringify(show.data.metadata)}`);
  // The durable record still carries openCheckpointData so a repeat idempotent
  // open compares cleanly.
  const reopen = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath, { attentionId: 'attn_leak1' })}'`);
  assert(reopen.ok && reopen.data.attentionId === 'attn_leak1', `idempotent reopen should succeed, got ${JSON.stringify(reopen.data)}`);
  // broker answer still works (reads the durable record directly, not the projection).
  const answer = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_leak1 --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answer.ok && answer.data.status === 'answered', `broker answer should succeed, got ${JSON.stringify(answer.data)}`);
  // After answering, broker show exposes the answer but still no decision state.
  const showAnswered = run(`lifecycle attention broker show --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_leak1`);
  assert(showAnswered.ok && showAnswered.data.answer && showAnswered.data.answer.answer === 'A', `answered broker show exposes answer, got ${JSON.stringify(showAnswered.data)}`);
  assert(!JSON.stringify(showAnswered.data).includes('openCheckpointData'), 'answered broker show still hides openCheckpointData');
});

test('attention broker answer first response does not expose task-owned decision state', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-broker-answer-leak');
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath, { attentionId: 'attn_answer_leak1' })}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const show = run(`lifecycle attention broker show --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_answer_leak1`);
  assert(show.ok, `broker show should succeed, got: ${JSON.stringify(show.data)}`);
  const answerPayload = { answer: 'A', answeredBy: 'user', answerKind: 'decision' };
  const answer = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_answer_leak1 --data '${JSON.stringify(answerPayload)}'`);
  assert(answer.ok, `broker answer should succeed, got: ${JSON.stringify(answer.data)}`);
  const expected = { ...show.data, status: 'answered', answer: answerPayload };
  assert(JSON.stringify(answer.data) === JSON.stringify({ ok: true, ...expected }), `broker answer should match show projection plus answer, got ${JSON.stringify(answer.data)}`);
  for (const forbidden of ['metadata', 'openCheckpointData', 'pendingDecision', 'resumeRef', 'taskStatePath']) {
    assert(!JSON.stringify(answer.data).includes(forbidden), `broker answer must not expose ${forbidden}, got ${JSON.stringify(answer.data)}`);
  }
});

test('attention broker answer replay does not expose task-owned decision state', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-broker-answer-replay-leak');
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${attentionOpenData(statusId, statePath, { attentionId: 'attn_answer_leak2' })}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const answerPayload = { answer: 'A', answeredBy: 'user', answerKind: 'decision' };
  const first = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_answer_leak2 --data '${JSON.stringify(answerPayload)}'`);
  assert(first.ok, `first broker answer should succeed, got: ${JSON.stringify(first.data)}`);
  const replay = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_answer_leak2 --data '${JSON.stringify(answerPayload)}'`);
  assert(replay.ok, `broker answer replay should succeed, got: ${JSON.stringify(replay.data)}`);
  assert(JSON.stringify(replay.data) === JSON.stringify(first.data), `broker answer replay should match first projection, got ${JSON.stringify(replay.data)} vs ${JSON.stringify(first.data)}`);
  for (const forbidden of ['metadata', 'openCheckpointData', 'pendingDecision', 'resumeRef', 'taskStatePath']) {
    assert(!JSON.stringify(replay.data).includes(forbidden), `broker answer replay must not expose ${forbidden}, got ${JSON.stringify(replay.data)}`);
  }
});

test('attention broker resume records raw answer and returns minimal existing-task launch', () => {
  const fixmeDir = makeFixmeDir();
  const payload = prepareChildPayload({ suffix: 'broker-resume-success' });
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-broker-resume.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `prepare-child should succeed, got ${JSON.stringify(prepared.data)}`);

  const activeChild = prepared.data.activeChild;
  const attentionId = 'attn_broker_resume_success';
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(activeChild.statusId, activeChild.taskStatePath, attentionId, {
    attention: {
      resumeRef: activeChild.resumeRef,
      taskStatePath: activeChild.taskStatePath,
      promptMarkdown: '## Decision\n\nChoose A or B.',
    },
  })}'`);
  assert(open.ok, `attention open should succeed, got ${JSON.stringify(open.data)}`);

  const answerPayload = { answer: 'A', answeredBy: 'user', answerKind: 'decision' };
  const resume = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify(answerPayload)}'`);
  assert(resume.ok, `broker resume should succeed, got ${JSON.stringify(resume.data)}`);
  assert(resume.data.resume.agentName === 'fixme-task', `resume should target fixme-task, got ${JSON.stringify(resume.data.resume)}`);
  assert(resume.data.resume.message === `--resume ${activeChild.resumeRef} --answer-attention ${attentionId}`, `resume message should be minimal, got ${resume.data.resume.message}`);
  assert(resume.data.resume.liveness.statusId === activeChild.statusId, `resume liveness should reuse active child status, got ${JSON.stringify(resume.data.resume.liveness)}`);
  assert(fs.existsSync(resume.data.resume.liveness.statusPath), 'resume liveness statusPath should exist');

  const serializedResume = JSON.stringify(resume.data.resume);
  for (const forbidden of [
    'Full review body lives in durable payload',
    'Detailed implementation instructions live only',
    'Choose A or B',
    'pendingDecision',
    'openCheckpointData',
    'promptMarkdown',
    'taskStatePath',
    'handoffPayloadPath',
    '"answer":"A"',
  ]) {
    assert(!serializedResume.includes(forbidden), `resume output must not contain ${forbidden}, got ${serializedResume}`);
  }

  const durableAttention = readJson(open.data.attentionPath);
  assert(durableAttention.status === 'answered', `attention should be answered, got ${durableAttention.status}`);
  assert(durableAttention.answer.answer === 'A', `raw answer should be stored durably, got ${JSON.stringify(durableAttention.answer)}`);
  const childState = readJson(activeChild.taskStatePath);
  assert(childState.status === 'waitingForUser', `broker must not consume task state, got ${childState.status}`);
  assert(Array.isArray(childState.decisions) && childState.decisions.length === 0, `broker must not append decisions, got ${JSON.stringify(childState.decisions)}`);
  const parent = parentState(fixmeDir, prepared.data.parentRunId);
  assert(parent.status === 'waitingForUser' && parent.cursor === 'brokerChildAttention', `parent should checkpoint brokerChildAttention, got ${JSON.stringify(parent)}`);
  assert(parent.payload.activeChild.attentionId === attentionId, `parent activeChild should record attention id, got ${JSON.stringify(parent.payload.activeChild)}`);

  const acknowledgementPayload = {
    resumeMessage: resume.data.resume.message,
    transport: 'agent',
    runtime: 'codex',
    runtimeHandle: { kind: 'codexAgentId', id: 'agent_broker_resume_success' },
  };
  const acknowledged = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify(acknowledgementPayload)}'`);
  assert(acknowledged.ok, `acknowledge-resume should succeed after launch, got ${JSON.stringify(acknowledged.data)}`);
  const acknowledgedParent = parentState(fixmeDir, prepared.data.parentRunId);
  assert(acknowledgedParent.status === 'waitingForChild' && acknowledgedParent.cursor === 'awaitFixmeTask', `parent should return to child wait after acknowledgement, got ${JSON.stringify(acknowledgedParent)}`);
  assert(acknowledgedParent.payload.activeChild.attentionId === attentionId, `acknowledged activeChild should retain attention id, got ${JSON.stringify(acknowledgedParent.payload.activeChild)}`);
  assert(acknowledgedParent.payload.activeChild.resumeDispatch.resumeMessage === resume.data.resume.message, `resumeDispatch should record resume message, got ${JSON.stringify(acknowledgedParent.payload.activeChild.resumeDispatch)}`);
  assert(acknowledgedParent.payload.activeChild.resumeDispatch.statusId === activeChild.statusId, `resumeDispatch should record status id, got ${JSON.stringify(acknowledgedParent.payload.activeChild.resumeDispatch)}`);
  assert(acknowledgedParent.payload.activeChild.resumeDispatch.attentionId === attentionId, `resumeDispatch should record attention id, got ${JSON.stringify(acknowledgedParent.payload.activeChild.resumeDispatch)}`);
  assert(acknowledgedParent.payload.activeChild.resumeDispatch.transport === 'agent', `resumeDispatch should record transport, got ${JSON.stringify(acknowledgedParent.payload.activeChild.resumeDispatch)}`);
  assert(acknowledgedParent.payload.activeChild.resumeDispatch.runtime === 'codex', `resumeDispatch should record runtime, got ${JSON.stringify(acknowledgedParent.payload.activeChild.resumeDispatch)}`);
  assert(acknowledgedParent.payload.activeChild.resumeDispatch.runtimeHandle.id === 'agent_broker_resume_success', `resumeDispatch should record runtime handle, got ${JSON.stringify(acknowledgedParent.payload.activeChild.resumeDispatch)}`);
});

test('attention broker resume replaces prior resume dispatch for second attention on same active child', () => {
  const fixmeDir = makeFixmeDir();
  const payload = prepareChildPayload({ suffix: 'broker-resume-second-attention' });
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-broker-resume-second-attention.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `prepare-child should succeed, got ${JSON.stringify(prepared.data)}`);

  const activeChild = prepared.data.activeChild;
  const firstAttentionId = 'attn_broker_resume_first';
  const firstOpen = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(activeChild.statusId, activeChild.taskStatePath, firstAttentionId, {
    attention: {
      resumeRef: activeChild.resumeRef,
      taskStatePath: activeChild.taskStatePath,
    },
  })}'`);
  assert(firstOpen.ok, `first attention should open, got ${JSON.stringify(firstOpen.data)}`);

  const firstAnswerPayload = { answer: 'Need more context', answeredBy: 'user', answerKind: 'clarificationRequest' };
  const firstResume = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${firstAttentionId} --data '${JSON.stringify(firstAnswerPayload)}'`);
  assert(firstResume.ok, `first broker resume should succeed, got ${JSON.stringify(firstResume.data)}`);
  const firstAckPayload = {
    resumeMessage: firstResume.data.resume.message,
    transport: 'agent',
    runtime: 'codex',
    runtimeHandle: { kind: 'codexAgentId', id: 'agent_broker_resume_first' },
  };
  const firstAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${firstAttentionId} --data '${JSON.stringify(firstAckPayload)}'`);
  assert(firstAck.ok, `first acknowledgement should succeed, got ${JSON.stringify(firstAck.data)}`);
  const afterFirstAck = parentState(fixmeDir, prepared.data.parentRunId);
  assert(afterFirstAck.status === 'waitingForChild' && afterFirstAck.cursor === 'awaitFixmeTask', `parent should wait for child after first ack, got ${JSON.stringify(afterFirstAck)}`);
  assert(afterFirstAck.payload.activeChild.resumeDispatch.attentionId === firstAttentionId, `first resumeDispatch should record first attention, got ${JSON.stringify(afterFirstAck.payload.activeChild.resumeDispatch)}`);

  const firstClear = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${activeChild.statusId} --attention-id ${firstAttentionId}`);
  assert(firstClear.ok, `owner-side clear should allow replacement attention, got ${JSON.stringify(firstClear.data)}`);

  const secondAttentionId = 'attn_broker_resume_second';
  const secondOpen = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(activeChild.statusId, activeChild.taskStatePath, secondAttentionId, {
    attention: {
      resumeRef: activeChild.resumeRef,
      taskStatePath: activeChild.taskStatePath,
      promptMarkdown: '## Follow-up\n\nChoose C or D.',
    },
  })}'`);
  assert(secondOpen.ok, `second attention should open for same active child, got ${JSON.stringify(secondOpen.data)}`);

  const secondAnswerPayload = { answer: 'C', answeredBy: 'user', answerKind: 'decision' };
  const secondResume = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${secondAttentionId} --data '${JSON.stringify(secondAnswerPayload)}'`);
  assert(secondResume.ok, `second broker resume should succeed, got ${JSON.stringify(secondResume.data)}`);
  const brokerParent = parentState(fixmeDir, prepared.data.parentRunId);
  assert(brokerParent.status === 'waitingForUser' && brokerParent.cursor === 'brokerChildAttention', `second broker resume should move parent to brokerChildAttention, got ${JSON.stringify(brokerParent)}`);
  assert(brokerParent.payload.activeChild.attentionId === secondAttentionId, `activeChild should point at second attention, got ${JSON.stringify(brokerParent.payload.activeChild)}`);
  assert(!Object.prototype.hasOwnProperty.call(brokerParent.payload.activeChild, 'resumeDispatch'), `brokerChildAttention payload should not retain stale resumeDispatch, got ${JSON.stringify(brokerParent.payload.activeChild)}`);

  const secondAckPayload = {
    resumeMessage: secondResume.data.resume.message,
    transport: 'agent',
    runtime: 'codex',
    runtimeHandle: { kind: 'codexAgentId', id: 'agent_broker_resume_second' },
  };
  const secondAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${secondAttentionId} --data '${JSON.stringify(secondAckPayload)}'`);
  assert(secondAck.ok, `second acknowledgement should replace prior dispatch evidence, got ${JSON.stringify(secondAck.data)}`);
  const afterSecondAck = parentState(fixmeDir, prepared.data.parentRunId);
  assert(afterSecondAck.status === 'waitingForChild' && afterSecondAck.cursor === 'awaitFixmeTask', `parent should return to awaitFixmeTask after second ack, got ${JSON.stringify(afterSecondAck)}`);
  assert(afterSecondAck.payload.activeChild.resumeDispatch.attentionId === secondAttentionId, `resumeDispatch should record second attention id, got ${JSON.stringify(afterSecondAck.payload.activeChild.resumeDispatch)}`);
  assert(afterSecondAck.payload.activeChild.resumeDispatch.runtimeHandle.id === 'agent_broker_resume_second', `resumeDispatch should record second runtime handle, got ${JSON.stringify(afterSecondAck.payload.activeChild.resumeDispatch)}`);
});

test('attention broker resume is idempotent and fails closed for stale child state', () => {
  const fixmeDir = makeFixmeDir();
  const payload = prepareChildPayload({ suffix: 'broker-resume-idempotent' });
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-broker-resume-idempotent.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `prepare-child should succeed, got ${JSON.stringify(prepared.data)}`);

  const activeChild = prepared.data.activeChild;
  const attentionId = 'attn_broker_resume_idempotent';
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(activeChild.statusId, activeChild.taskStatePath, attentionId, {
    attention: {
      resumeRef: activeChild.resumeRef,
      taskStatePath: activeChild.taskStatePath,
    },
  })}'`);
  assert(open.ok, `attention open should succeed, got ${JSON.stringify(open.data)}`);

  const answerPayload = { answer: 'A', answeredBy: 'user', answerKind: 'decision' };
  const first = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify(answerPayload)}'`);
  assert(first.ok, `first broker resume should succeed, got ${JSON.stringify(first.data)}`);
  const replay = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify(answerPayload)}'`);
  assert(replay.ok, `replayed broker resume should succeed, got ${JSON.stringify(replay.data)}`);
  assert(JSON.stringify(replay.data.resume) === JSON.stringify(first.data.resume), `replay should return same resume launch, got ${JSON.stringify(replay.data.resume)} vs ${JSON.stringify(first.data.resume)}`);

  const ackPayload = { resumeMessage: first.data.resume.message, transport: 'background', runtime: 'claude', runtimeHandle: { kind: 'claudeAgentId', id: 'agent_broker_resume_idempotent' } };
  const malformedFirstAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify({ ...ackPayload, resumeMessage: '--resume FIXME-wrong --answer-attention attn_wrong' })}'`);
  assert(!malformedFirstAck.ok && malformedFirstAck.data.error.code === 'staleState', `malformed first acknowledgement should fail staleState, got ${JSON.stringify(malformedFirstAck.data)}`);
  const firstAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify(ackPayload)}'`);
  assert(firstAck.ok, `first acknowledgement should succeed, got ${JSON.stringify(firstAck.data)}`);
  const replayAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify(ackPayload)}'`);
  assert(replayAck.ok, `replayed acknowledgement should succeed, got ${JSON.stringify(replayAck.data)}`);
  const reorderedHandleReplayAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify({ ...ackPayload, runtimeHandle: { id: 'agent_broker_resume_idempotent', kind: 'claudeAgentId' } })}'`);
  assert(reorderedHandleReplayAck.ok, `replayed acknowledgement should accept semantically identical runtimeHandle with reordered keys, got ${JSON.stringify(reorderedHandleReplayAck.data)}`);
  const missingHandleReplayAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify({ resumeMessage: first.data.resume.message, transport: 'background', runtime: 'claude' })}'`);
  assert(!missingHandleReplayAck.ok && missingHandleReplayAck.data.error.code === 'conflictingDuplicate', `omitting a previously recorded runtimeHandle should conflict, got ${JSON.stringify(missingHandleReplayAck.data)}`);
  const replayedParent = parentState(fixmeDir, prepared.data.parentRunId);
  assert(replayedParent.status === 'waitingForChild' && replayedParent.cursor === 'awaitFixmeTask', `replayed ack should leave parent waiting for child, got ${JSON.stringify(replayedParent)}`);
  const badAck = run(`lifecycle attention broker acknowledge-resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify({ ...ackPayload, resumeMessage: '--resume FIXME-wrong --answer-attention attn_wrong' })}'`);
  assert(!badAck.ok && badAck.data.error.code === 'conflictingDuplicate', `different acknowledged resume message should conflict, got ${JSON.stringify(badAck.data)}`);

  const conflict = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${attentionId} --data '${JSON.stringify({ answer: 'B', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `different answer should conflict, got ${JSON.stringify(conflict.data)}`);

  const wrongRun = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(wrongRun.ok, `stray run should start, got ${JSON.stringify(wrongRun.data)}`);
  const wrongStatus = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${wrongRun.data.statusId} --attention-id ${attentionId} --data '${JSON.stringify(answerPayload)}'`);
  assert(!wrongStatus.ok && wrongStatus.data.error.code === 'staleState', `wrong status id should fail staleState, got ${JSON.stringify(wrongStatus.data)}`);

  const mismatchClear = run(`run attention clear --fixme-dir "${fixmeDir}" --status-id ${activeChild.statusId} --attention-id ${attentionId}`);
  assert(mismatchClear.ok, `owner-side clear should allow mismatch attention setup, got ${JSON.stringify(mismatchClear.data)}`);
  const mismatchAttentionId = 'attn_broker_resume_mismatch';
  const mismatchOpen = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(activeChild.statusId, activeChild.taskStatePath, mismatchAttentionId, {
    attention: {
      resumeRef: 'FIXME-wrong',
      taskStatePath: activeChild.taskStatePath,
    },
  })}'`);
  assert(mismatchOpen.ok, `mismatched attention should open before helper validation, got ${JSON.stringify(mismatchOpen.data)}`);
  const persistedParent = parentState(fixmeDir, prepared.data.parentRunId);
  assert(persistedParent.payload.activeChild.statusId === activeChild.statusId, `mismatch setup should use the persisted active child status, got ${JSON.stringify(persistedParent.payload.activeChild)}`);
  assert(persistedParent.payload.activeChild.taskStatePath === activeChild.taskStatePath, `mismatch setup should use the persisted active child task state, got ${JSON.stringify(persistedParent.payload.activeChild)}`);
  const mismatch = run(`lifecycle attention broker resume --fixme-dir "${fixmeDir}" --parent-run-id ${prepared.data.parentRunId} --status-id ${activeChild.statusId} --attention-id ${mismatchAttentionId} --data '${JSON.stringify(answerPayload)}'`);
  assert(!mismatch.ok && mismatch.data.error.code === 'staleState', `resumeRef mismatch should fail staleState, got ${JSON.stringify(mismatch.data)}`);
  const mismatchRecord = readJson(mismatchOpen.data.attentionPath);
  assert(mismatchRecord.status === 'waiting', `mismatched helper must not store answer, got ${JSON.stringify(mismatchRecord)}`);
});

test('attention consume resolved decision appends decision, checkpoints state, and clears attention', () => {
  const { fixmeDir, statePath, statusId } = initTaskWithRunStatus('attn-consume-resolved');
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(statusId, statePath, 'attn_consume_resolved')}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const answer = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_consume_resolved --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answer.ok, `answer should succeed, got: ${JSON.stringify(answer.data)}`);
  const decision = completeDecisionObject('decision_consume_resolved', {
    attentionId: 'attn_consume_resolved',
    answer: 'A',
    interpretation: 'Use option A.',
  });
  const checkpointData = { status: 'running', pendingDecision: null };
  const consume = run(`lifecycle attention consume --fixme-dir "${fixmeDir}" --data '${consumeAttentionData(statusId, statePath, 'attn_consume_resolved', 'resolvedDecision', checkpointData, [decision])}'`);
  assert(consume.ok, `consume should succeed, got: ${JSON.stringify(consume.data)}`);
  assert(consume.data.mode === 'resolvedDecision', `mode returned, got ${consume.data.mode}`);
  assert(consume.data.decisionCount === 1, `decision count returned, got ${JSON.stringify(consume.data)}`);
  assert(!fs.existsSync(open.data.attentionPath), 'consume removes attention record');
  const state = readJson(statePath);
  assert(state.status === 'running', `state status should be running, got ${state.status}`);
  assert(state.pendingDecision === null, `pendingDecision should clear, got ${JSON.stringify(state.pendingDecision)}`);
  assert(state.decisions.length === 1 && state.decisions[0].id === 'decision_consume_resolved', `decision persisted, got ${JSON.stringify(state.decisions)}`);
  const status = run(`run status --fixme-dir "${fixmeDir}" --status-id ${statusId}`);
  assert(status.ok, `status should read, got ${JSON.stringify(status.data)}`);
  assert(status.data.currentCommand === null, `attention marker cleared, got ${status.data.currentCommand}`);
  assert(status.data.state === 'running' && status.data.checkpoint === 'working', `run status restored, got ${status.data.state}/${status.data.checkpoint}`);

  const replay = run(`lifecycle attention consume --fixme-dir "${fixmeDir}" --data '${consumeAttentionData(statusId, statePath, 'attn_consume_resolved', 'resolvedDecision', checkpointData, [decision])}'`);
  assert(replay.ok, `consume replay after clear should succeed, got: ${JSON.stringify(replay.data)}`);
  const replayState = readJson(statePath);
  assert(replayState.decisions.length === 1, `replay must not duplicate decisions, got ${JSON.stringify(replayState.decisions)}`);
});

test('attention consume is idempotent after decision append partial success', () => {
  const { fixmeDir, projectRoot, statePath, statusId } = initTaskWithRunStatus('attn-consume-decision-written');
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(statusId, statePath, 'attn_consume_written')}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const answer = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_consume_written --data '${JSON.stringify({ answer: 'B', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(answer.ok, `answer should succeed, got: ${JSON.stringify(answer.data)}`);
  const decision = completeDecisionObject('decision_consume_written', {
    attentionId: 'attn_consume_written',
    answer: 'B',
    interpretation: 'Use option B.',
  });
  const appended = runInDir(`task decision append --state "${statePath}" --compact --data '${JSON.stringify(decision)}'`, projectRoot);
  assert(appended.ok, `partial decision append should succeed, got: ${JSON.stringify(appended.data)}`);

  const checkpointData = { status: 'running', pendingDecision: null };
  const consume = run(`lifecycle attention consume --fixme-dir "${fixmeDir}" --data '${consumeAttentionData(statusId, statePath, 'attn_consume_written', 'resolvedDecision', checkpointData, [decision])}'`);
  assert(consume.ok, `consume after decision append should succeed, got: ${JSON.stringify(consume.data)}`);
  const state = readJson(statePath);
  assert(state.decisions.length === 1 && state.decisions[0].id === 'decision_consume_written', `decision should not duplicate, got ${JSON.stringify(state.decisions)}`);
  assert(state.pendingDecision === null, 'checkpoint applied after partial decision append');
  assert(!fs.existsSync(open.data.attentionPath), 'attention cleared after partial decision append');
});

test('attention consume accepts equivalent checkpoint replay and clears consumed attention', () => {
  const { fixmeDir, projectRoot, statePath, statusId } = initTaskWithRunStatus('attn-consume-checkpoint-written');
  const open = run(`lifecycle attention open --fixme-dir "${fixmeDir}" --data '${ownerAttentionOpenData(statusId, statePath, 'attn_consume_checkpoint')}'`);
  assert(open.ok, `open should succeed, got: ${JSON.stringify(open.data)}`);
  const answer = run(`lifecycle attention broker answer --fixme-dir "${fixmeDir}" --status-id ${statusId} --attention-id attn_consume_checkpoint --data '${JSON.stringify({ answer: 'question?', answeredBy: 'user', answerKind: 'clarificationRequest' })}'`);
  assert(answer.ok, `answer should succeed, got: ${JSON.stringify(answer.data)}`);
  const checkpointData = {
    status: 'running',
    pendingDecision: {
      kind: 'plan-decision',
      clarificationContext: {
        answer: 'question?',
      },
    },
  };
  const checkpointed = runInDir(`task checkpoint --state "${statePath}" --data '${JSON.stringify(checkpointData)}'`, projectRoot);
  assert(checkpointed.ok, `partial checkpoint should succeed, got: ${JSON.stringify(checkpointed.data)}`);
  const consume = run(`lifecycle attention consume --fixme-dir "${fixmeDir}" --data '${consumeAttentionData(statusId, statePath, 'attn_consume_checkpoint', 'clarificationRequest', checkpointData, [])}'`);
  assert(consume.ok, `consume after checkpoint should succeed, got: ${JSON.stringify(consume.data)}`);
  const state = readJson(statePath);
  assert(state.status === 'running', `state running, got ${state.status}`);
  assert(state.pendingDecision && state.pendingDecision.clarificationContext.answer === 'question?', `clarification context preserved, got ${JSON.stringify(state.pendingDecision)}`);
  assert(!fs.existsSync(open.data.attentionPath), 'attention cleared after checkpoint replay');
});

test('attention consume clarification and partial modes checkpoint pendingDecision without decisions', () => {
  const clarification = initTaskWithRunStatus('attn-consume-clarification');
  const clarificationOpen = run(`lifecycle attention open --fixme-dir "${clarification.fixmeDir}" --data '${ownerAttentionOpenData(clarification.statusId, clarification.statePath, 'attn_consume_clarification')}'`);
  assert(clarificationOpen.ok, `clarification open should succeed, got: ${JSON.stringify(clarificationOpen.data)}`);
  const clarificationAnswer = run(`lifecycle attention broker answer --fixme-dir "${clarification.fixmeDir}" --status-id ${clarification.statusId} --attention-id attn_consume_clarification --data '${JSON.stringify({ answer: 'What about C?', answeredBy: 'user', answerKind: 'clarificationRequest' })}'`);
  assert(clarificationAnswer.ok, `clarification answer should succeed, got: ${JSON.stringify(clarificationAnswer.data)}`);
  const clarificationCheckpoint = {
    status: 'running',
    pendingDecision: {
      kind: 'plan-decision',
      clarificationContext: { answer: 'What about C?' },
    },
  };
  const clarificationConsume = run(`lifecycle attention consume --fixme-dir "${clarification.fixmeDir}" --data '${consumeAttentionData(clarification.statusId, clarification.statePath, 'attn_consume_clarification', 'clarificationRequest', clarificationCheckpoint, [])}'`);
  assert(clarificationConsume.ok, `clarification consume should succeed, got: ${JSON.stringify(clarificationConsume.data)}`);
  const clarificationState = readJson(clarification.statePath);
  assert(clarificationState.decisions.length === 0, `clarification should not append decisions, got ${JSON.stringify(clarificationState.decisions)}`);
  assert(clarificationState.pendingDecision.clarificationContext.answer === 'What about C?', `clarification context persisted, got ${JSON.stringify(clarificationState.pendingDecision)}`);
  assert(!fs.existsSync(clarificationOpen.data.attentionPath), 'clarification consume clears old attention');

  const partial = initTaskWithRunStatus('attn-consume-partial');
  const partialOpen = run(`lifecycle attention open --fixme-dir "${partial.fixmeDir}" --data '${ownerAttentionOpenData(partial.statusId, partial.statePath, 'attn_consume_partial')}'`);
  assert(partialOpen.ok, `partial open should succeed, got: ${JSON.stringify(partialOpen.data)}`);
  const partialAnswer = run(`lifecycle attention broker answer --fixme-dir "${partial.fixmeDir}" --status-id ${partial.statusId} --attention-id attn_consume_partial --data '${JSON.stringify({ answer: '1=A, still unsure on 2', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(partialAnswer.ok, `partial answer should succeed, got: ${JSON.stringify(partialAnswer.data)}`);
  const partialCheckpoint = {
    status: 'running',
    pendingDecision: {
      kind: 'plan-decision',
      partialAnswers: {
        first: 'A',
      },
    },
  };
  const partialConsume = run(`lifecycle attention consume --fixme-dir "${partial.fixmeDir}" --data '${consumeAttentionData(partial.statusId, partial.statePath, 'attn_consume_partial', 'partialDecision', partialCheckpoint, [])}'`);
  assert(partialConsume.ok, `partial consume should succeed, got: ${JSON.stringify(partialConsume.data)}`);
  const partialState = readJson(partial.statePath);
  assert(partialState.decisions.length === 0, `partial should not append final decisions, got ${JSON.stringify(partialState.decisions)}`);
  assert(partialState.pendingDecision.partialAnswers.first === 'A', `partial answers persisted, got ${JSON.stringify(partialState.pendingDecision)}`);
  assert(!fs.existsSync(partialOpen.data.attentionPath), 'partial consume clears old attention');
});

test('attention consume fails closed for unanswered, mismatched, and stale attention', () => {
  const unanswered = initTaskWithRunStatus('attn-consume-unanswered');
  const unansweredOpen = run(`lifecycle attention open --fixme-dir "${unanswered.fixmeDir}" --data '${ownerAttentionOpenData(unanswered.statusId, unanswered.statePath, 'attn_consume_unanswered')}'`);
  assert(unansweredOpen.ok, `unanswered open should succeed, got: ${JSON.stringify(unansweredOpen.data)}`);
  const unansweredConsume = run(`lifecycle attention consume --fixme-dir "${unanswered.fixmeDir}" --data '${consumeAttentionData(unanswered.statusId, unanswered.statePath, 'attn_consume_unanswered', 'resolvedDecision', { status: 'running', pendingDecision: null }, [])}'`);
  assert(!unansweredConsume.ok, 'unanswered attention should fail');
  assert(unansweredConsume.data.error.code === 'invalidInput', `unanswered should be invalidInput, got ${JSON.stringify(unansweredConsume.data)}`);
  assert(unansweredConsume.data.error.message.includes('answered'), `unanswered error should mention answered state, got ${JSON.stringify(unansweredConsume.data)}`);

  const mismatched = initTaskWithRunStatus('attn-consume-mismatch');
  const mismatchedOpen = run(`lifecycle attention open --fixme-dir "${mismatched.fixmeDir}" --data '${ownerAttentionOpenData(mismatched.statusId, mismatched.statePath, 'attn_consume_mismatch')}'`);
  assert(mismatchedOpen.ok, `mismatch open should succeed, got: ${JSON.stringify(mismatchedOpen.data)}`);
  const mismatchedAnswer = run(`lifecycle attention broker answer --fixme-dir "${mismatched.fixmeDir}" --status-id ${mismatched.statusId} --attention-id attn_consume_mismatch --data '${JSON.stringify({ answer: 'A', answeredBy: 'user', answerKind: 'decision' })}'`);
  assert(mismatchedAnswer.ok, `mismatch answer should succeed, got: ${JSON.stringify(mismatchedAnswer.data)}`);
  const otherStatePath = path.join(mismatched.fixmeDir, 'tasks', 'other.state.json');
  fs.mkdirSync(path.dirname(otherStatePath), { recursive: true });
  fs.writeFileSync(otherStatePath, JSON.stringify(readJson(mismatched.statePath), null, 2) + '\n');
  const badStatePath = run(`lifecycle attention consume --fixme-dir "${mismatched.fixmeDir}" --data '${consumeAttentionData(mismatched.statusId, otherStatePath, 'attn_consume_mismatch', 'resolvedDecision', { status: 'running', pendingDecision: null }, [])}'`);
  assert(!badStatePath.ok, 'mismatched taskStatePath should fail');
  assert(badStatePath.data.error.code === 'invalidInput', `mismatch should be invalidInput, got ${JSON.stringify(badStatePath.data)}`);

  const staleAttention = run(`lifecycle attention consume --fixme-dir "${mismatched.fixmeDir}" --data '${consumeAttentionData(mismatched.statusId, mismatched.statePath, 'attn_missing_consume', 'resolvedDecision', { status: 'running', pendingDecision: null }, [])}'`);
  assert(!staleAttention.ok, 'missing attention should fail');
  assert(staleAttention.data.error.code === 'stateNotFound', `missing attention should be stateNotFound, got ${JSON.stringify(staleAttention.data)}`);
});

console.log('\n=== lifecycle wait tests ===\n');

test('wait begin sets working command marker and wait end clears it', () => {
  const fixmeDir = makeFixmeDir();
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  const begin = run(`lifecycle wait begin --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --label "yarn test"`);
  assert(begin.ok, `wait begin should succeed, got: ${JSON.stringify(begin.data)}`);
  const afterBegin = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(afterBegin.data.state === 'running' && afterBegin.data.checkpoint === 'working', 'running/working');
  assert(afterBegin.data.currentCommand === 'yarn test', `command set, got ${afterBegin.data.currentCommand}`);
  const end = run(`lifecycle wait end --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(end.ok, `wait end should succeed, got: ${JSON.stringify(end.data)}`);
  const afterEnd = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(afterEnd.data.currentCommand === null, `command cleared, got ${afterEnd.data.currentCommand}`);
});

test('wait begin same label updates and different label rejects', () => {
  const fixmeDir = makeFixmeDir();
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  run(`lifecycle wait begin --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --label "cmd-a"`);
  const same = run(`lifecycle wait begin --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --label "cmd-a"`);
  assert(same.ok, `same label should update, got: ${JSON.stringify(same.data)}`);
  const diff = run(`lifecycle wait begin --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --label "cmd-b"`);
  assert(!diff.ok && diff.data.error.code === 'staleState', `different label should be staleState, got ${JSON.stringify(diff.data)}`);
});

test('wait begin and end reject while attention marker active', () => {
  const fixmeDir = makeFixmeDir();
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  const attentionData = JSON.stringify({
    ownerSkill: 'fixme-task', sourceSkill: 'fixme-handle-code-review', kind: 'reviewDecision',
    resumeRef: 'FIXME-1', taskStatePath: path.join(fixmeDir, 'tasks', 't.state.json'),
    promptMarkdown: '## D', answerMode: 'freeform',
  });
  run(`run attention set --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --data '${attentionData}'`);
  const begin = run(`lifecycle wait begin --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --label "cmd"`);
  assert(!begin.ok && begin.data.error.code === 'activeAttention', `begin should be activeAttention, got ${JSON.stringify(begin.data)}`);
  const end = run(`lifecycle wait end --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(!end.ok && end.data.error.code === 'activeAttention', `end should be activeAttention, got ${JSON.stringify(end.data)}`);
});

test('wait end after cleared returns current status idempotently', () => {
  const fixmeDir = makeFixmeDir();
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  run(`lifecycle wait begin --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --label "cmd"`);
  run(`lifecycle wait end --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  const again = run(`lifecycle wait end --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId}`);
  assert(again.ok, `repeated wait end should be idempotent, got: ${JSON.stringify(again.data)}`);
  assert(again.data.currentCommand === null, 'currentCommand stays null');
});

console.log('\n=== lifecycle parent tests ===\n');

function prLookupInput(overrides = {}) {
  return {
    pullRequestRef: {
      host: 'GitHub.com', owner: 'Acme', repo: 'App', number: 42,
      headOwner: 'Acme', headRepo: 'App', headRef: 'feature/x',
      ...(overrides.pullRequestRef || {}),
    },
    normalizedFlags: {
      pause: false, skipCommit: false, skipPush: false, skipResolve: false, skipResponse: false,
      ...(overrides.normalizedFlags || {}),
    },
  };
}

function parentCreateData(overrides = {}) {
  return JSON.stringify({
    parentSkill: 'fixme-pr-comments',
    idempotencyKey: overrides.idempotencyKey || 'p1',
    lookupInput: overrides.lookupInput || prLookupInput(),
    status: 'running',
    cursor: 'fetchReviewItems',
    payload: { flags: {}, pullRequestRef: prLookupInput().pullRequestRef },
    ...(overrides.extra || {}),
  });
}

test('parent create computes normalized lookup keys and empty ledger', () => {
  const fixmeDir = makeFixmeDir();
  const r = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  assert(r.ok, `parent create should succeed, got: ${JSON.stringify(r.data)}`);
  assert(typeof r.data.parentRunId === 'string', 'parentRunId present');
  assert(r.data.revision === 0, `revision 0, got ${r.data.revision}`);
  assert(r.data.normalizedLookupInput.pullRequestRef.host === 'github.com', 'host lowercased');
  assert(r.data.normalizedLookupInput.pullRequestRef.owner === 'acme', 'owner lowercased');
  assert(typeof r.data.parentNaturalKey === 'string' && Array.isArray(r.data.lookupKeys), 'keys present');
  assert(JSON.stringify(r.data.ledger) === '{}', 'empty ledger');
  assert(fs.existsSync(path.join(fixmeDir, 'parents', r.data.parentRunId, 'state.json')), 'state file exists');
  assert(fs.readdirSync(path.join(fixmeDir, 'parents', 'index')).length >= 1, 'index files exist');
});

test('parent create idempotent and conflict semantics', () => {
  const fixmeDir = makeFixmeDir();
  const first = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const same = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  assert(same.ok && same.data.parentRunId === first.data.parentRunId, 'same idempotencyKey returns same run');
  // Same natural key, different idempotencyKey, identical create digest -> existing nonterminal.
  const sameNaturalKey = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({ idempotencyKey: 'p2' })}'`);
  assert(sameNaturalKey.ok && sameNaturalKey.data.parentRunId === first.data.parentRunId, 'same natural key returns existing nonterminal run');
  const equivalentNaturalKey = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({ idempotencyKey: 'p3', lookupInput: prLookupInput({ pullRequestRef: { host: 'github.com', owner: 'acme', repo: 'app', headOwner: 'ACME', headRepo: 'APP' } }) })}'`);
  assert(equivalentNaturalKey.ok && equivalentNaturalKey.data.parentRunId === first.data.parentRunId, 'normalized-equivalent natural key returns existing nonterminal run');
});

test('parent create rejects same idempotency key with changed durable create inputs', () => {
  const fixmeDir = makeFixmeDir();
  run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  for (const changed of [
    { label: 'status', extra: { status: 'waitingForChild' } },
    { label: 'cursor', extra: { cursor: 'analyzeReviewItems', payload: { flags: {}, reviewItems: [] } } },
    { label: 'payload', extra: { payload: { flags: { pause: true }, pullRequestRef: prLookupInput().pullRequestRef } } },
  ]) {
    const conflict = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({ extra: changed.extra })}'`);
    assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `${changed.label} change with same idempotency key -> conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
  }
});

test('parent create rejects natural-key duplicate with changed durable create inputs', () => {
  const fixmeDir = makeFixmeDir();
  run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  for (const changed of [
    { label: 'status', extra: { status: 'waitingForChild' } },
    { label: 'cursor', extra: { cursor: 'analyzeReviewItems', payload: { flags: {}, reviewItems: [] } } },
    { label: 'payload', extra: { payload: { flags: { pause: true }, pullRequestRef: prLookupInput().pullRequestRef } } },
  ]) {
    const conflict = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({ idempotencyKey: `natural-${changed.label}`, extra: changed.extra })}'`);
    assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `${changed.label} change with same natural key -> conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
  }
});

test('parent create skipCommit canonicalizes skipPush', () => {
  const fixmeDir = makeFixmeDir();
  const r = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({ lookupInput: prLookupInput({ normalizedFlags: { skipCommit: true } }) })}'`);
  assert(r.ok, `should succeed, got: ${JSON.stringify(r.data)}`);
  assert(r.data.normalizedLookupInput.normalizedFlags.skipPush === true, 'skipPush canonicalized to true');
});

test('parent create rejects malformed inputs', () => {
  const fixmeDir = makeFixmeDir();
  const badRef = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({ lookupInput: prLookupInput({ pullRequestRef: { headRef: 'refs/heads/x' } }) })}'`);
  assert(!badRef.ok && badRef.data.error.code === 'invalidInput', `full ref rejected, got ${JSON.stringify(badRef.data)}`);
  const badCursor = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '{"parentSkill":"fixme-pr-comments","idempotencyKey":"pc","lookupInput":${JSON.stringify(prLookupInput())},"status":"running","cursor":"bogusCursor","payload":{}}'`);
  assert(!badCursor.ok && badCursor.data.error.code === 'invalidInput', `bad cursor rejected, got ${JSON.stringify(badCursor.data)}`);
  const badSkill = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '{"parentSkill":"fixme-bogus","idempotencyKey":"ps","lookupInput":${JSON.stringify(prLookupInput())},"status":"running","cursor":"fetchReviewItems","payload":{}}'`);
  assert(!badSkill.ok && badSkill.data.error.code === 'invalidInput', `bad parentSkill rejected, got ${JSON.stringify(badSkill.data)}`);
});

test('parent create rejects missing required fields for high-risk cursor payloads', () => {
  const fixmeDir = makeFixmeDir();
  const cases = [
    { cursor: 'awaitFixmeTask', payload: { fixBatches: [], activeBatchIndex: 0, activeChild: { statusId: 'run_1', taskRunId: 'task_1', taskStatePath: '/tmp/t.state.json' } }, missing: 'activeChild.resumeRef' },
    { cursor: 'brokerChildAttention', payload: { fixBatches: [], activeBatchIndex: 0, activeChild: { statusId: 'run_1', attentionId: 'attn_1' } }, missing: 'activeChild.resumeRef' },
    { cursor: 'consumeTaskEvent', payload: { fixBatches: [], activeBatchIndex: 0, activeChild: { taskRunId: 'task_1' }, taskEvent: { eventId: 'evt_1' } }, missing: 'taskEvent.resultSummaryPath' },
    { cursor: 'verify', payload: { childResultSummaryPaths: [], routedGroups: {} }, missing: 'flags' },
    { cursor: 'commit', payload: { verificationResults: {}, changedFiles: [], expectedHeadSha: 'abc123', flags: {} }, missing: 'changedFilesDigest' },
    { cursor: 'summarize', payload: { unexpectedCarryForward: true }, missing: 'no payload fields', errorCode: 'invalidInput' },
  ];

  for (const item of cases) {
    const data = parentCreateData({
      idempotencyKey: `missing-${item.cursor}`,
      extra: { cursor: item.cursor, payload: item.payload },
    });
    const result = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${data}'`);
    const expectedCode = item.errorCode || 'missingRequiredField';
    assert(!result.ok && result.data.error.code === expectedCode, `${item.cursor} missing ${item.missing} should fail, got ${JSON.stringify(result.data)}`);
  }
});

test('parent checkpoint advances revision and rejects stale', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const checkpointData = JSON.stringify({
    idempotencyKey: 'c1', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems',
    payload: { flags: {}, reviewItems: [{ id: 'r1' }] }, ledger: { reviewItems: [{ id: 'r1' }] },
  });
  const cp = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${checkpointData}'`);
  assert(cp.ok, `checkpoint should succeed, got: ${JSON.stringify(cp.data)}`);
  assert(cp.data.revision === 1, `revision 1, got ${cp.data.revision}`);
  assert(cp.data.normalizedLookupInput.pullRequestRef.host === 'github.com', 'immutable fields preserved');
  const stale = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'c2', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems', payload: { flags: {}, reviewItems: [] }, ledger: { reviewItems: [{ id: 'r1' }] } })}'`);
  assert(!stale.ok && stale.data.error.code === 'staleState', `stale expectedRevision, got ${JSON.stringify(stale.data)}`);
});

test('parent checkpoint rejects invalid cursor transitions and nested missing fields', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const invalidTransition = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'bad-transition', expectedRevision: 0, status: 'running', cursor: 'verify', payload: { childResultSummaryPaths: [], routedGroups: {}, flags: {} }, ledger: {} })}'`);
  assert(!invalidTransition.ok && invalidTransition.data.error.code === 'invalidInput', `fetchReviewItems -> verify should be rejected, got ${JSON.stringify(invalidTransition.data)}`);

  const analyzed = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'to-analyze', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems', payload: { flags: {}, reviewItems: [] }, ledger: { reviewItems: [] } })}'`);
  assert(analyzed.ok, `valid analyze checkpoint should succeed, got ${JSON.stringify(analyzed.data)}`);
  const missingNested = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'missing-nested', expectedRevision: 1, status: 'running', cursor: 'presentAnalysis', payload: { flags: {}, reviewItems: [], analysis: {} }, ledger: { reviewItems: [], analysis: {} } })}'`);
  assert(!missingNested.ok && missingNested.data.error.code === 'missingRequiredField', `presentAnalysis missing routedGroups should fail, got ${JSON.stringify(missingNested.data)}`);
});

test('parent checkpoint same-key replay is idempotent for identical inputs and conflicts on different inputs', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const checkpointData = JSON.stringify({
    idempotencyKey: 'ck1', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems',
    payload: { flags: {}, reviewItems: [{ id: 'r1' }] }, ledger: { reviewItems: [{ id: 'r1' }] },
  });
  const first = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${checkpointData}'`);
  assert(first.ok && first.data.revision === 1, `first checkpoint should advance to revision 1, got ${JSON.stringify(first.data)}`);
  // Identical replay under the same key is a no-op returning the current state.
  const identical = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${checkpointData}'`);
  assert(identical.ok && identical.data.revision === 1, `identical replay returns current state, got ${JSON.stringify(identical.data)}`);
  // Same idempotencyKey, different durable inputs (cursor/payload) -> conflict.
  const conflictData = JSON.stringify({
    idempotencyKey: 'ck1', expectedRevision: 0, status: 'running', cursor: 'presentAnalysis',
    payload: { flags: {}, reviewItems: [{ id: 'r1' }], analysis: {}, routedGroups: {} }, ledger: { reviewItems: [{ id: 'r1' }] },
  });
  const conflict = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `same key conflicting inputs -> conflictingDuplicate, got ${JSON.stringify(conflict.data)}`);
});

test('parent checkpoint same-key replay compares failure details', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const failedData = JSON.stringify({
    idempotencyKey: 'ck-failure', expectedRevision: 0, status: 'failed', cursor: 'summarize',
    payload: {}, ledger: { unresolvedAccounting: { fetchComplete: true } },
    failure: { reason: 'fetchFailed', message: 'network unavailable' },
  });
  const first = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${failedData}'`);
  assert(first.ok && first.data.failure.reason === 'fetchFailed', `failed checkpoint should succeed, got ${JSON.stringify(first.data)}`);
  const identical = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${failedData}'`);
  assert(identical.ok && identical.data.revision === first.data.revision, `identical failure replay should be idempotent, got ${JSON.stringify(identical.data)}`);
  const conflictData = JSON.stringify({
    idempotencyKey: 'ck-failure', expectedRevision: 0, status: 'failed', cursor: 'summarize',
    payload: {}, ledger: { unresolvedAccounting: { fetchComplete: true } },
    failure: { reason: 'fetchFailed', message: 'different failure' },
  });
  const conflict = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `changed failure under same key should conflict, got ${JSON.stringify(conflict.data)}`);
});

test('parent checkpoint rejects clearing populated ledger slot', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'c1', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems', payload: { flags: {}, reviewItems: [{ id: 'r1' }] }, ledger: { reviewItems: [{ id: 'r1' }] } })}'`);
  const clear = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'c2', expectedRevision: 1, status: 'running', cursor: 'presentAnalysis', payload: { flags: {}, reviewItems: [{ id: 'r1' }], analysis: {}, routedGroups: {} }, ledger: {} })}'`);
  assert(!clear.ok && clear.data.error.code === 'invalidInput', `clearing populated ledger slot rejected, got ${JSON.stringify(clear.data)}`);
});

test('task-event consume reports stale parent when awaiting child without activeChild', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    idempotencyKey: 'stale-await-parent',
    extra: {
      cursor: 'dispatchFixmeTask',
      payload: { fixBatches: [{ id: 'batch-0', summary: 'missing active child' }], activeBatchIndex: 0, parentContinuation: { parentSkill: 'fixme-pr-comments', parentRunId: 'parent_pending', transport: 'agent', resumeStep: 'awaitFixmeTaskResult' } },
    },
  })}'`);
  assert(parent.ok, `parent create should succeed, got ${JSON.stringify(parent.data)}`);
  const staleState = parentState(fixmeDir, parent.data.parentRunId);
  staleState.status = 'waitingForChild';
  staleState.cursor = 'awaitFixmeTask';
  staleState.payload = { fixBatches: [{ id: 'batch-0', summary: 'missing active child' }], activeBatchIndex: 0 };
  writeParentState(fixmeDir, parent.data.parentRunId, staleState);
  const consumed = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parent.data.parentRunId} --next`);
  assert(!consumed.ok, 'consume should fail for stale parent');
  assert(consumed.data.error.code === 'staleState', `expected staleState, got ${JSON.stringify(consumed.data)}`);
  assert(consumed.data.parentRunId === parent.data.parentRunId, 'stale response includes parentRunId');
  assert(consumed.data.cursor === 'awaitFixmeTask', 'stale response includes cursor');
  assert(consumed.data.status === 'waitingForChild', 'stale response includes status');
  assert(consumed.data.recovery.safeAutomaticRecovery === false, 'stale recovery is not automatic');
  assert(consumed.data.recovery.commands.abandon.includes('lifecycle parent abandon'), 'stale response includes abandon command');
  assert(consumed.data.recovery.commands.prepareChild.includes('lifecycle parent prepare-child'), 'stale response includes prepare-child command');
});

test('parent abandon preserves ledger and is idempotent without weakening checkpoint ledger guard', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const checkpoint = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({
    idempotencyKey: 'ledger-populate',
    expectedRevision: 0,
    status: 'running',
    cursor: 'analyzeReviewItems',
    payload: { flags: {}, reviewItems: [{ id: 'G1' }] },
    ledger: { reviewItems: { currentPrFix: [{ id: 'G1' }] }, routedGroups: [{ groupId: 'G1', route: 'currentPrFix', sourceIds: ['G1'] }] },
  })}'`);
  assert(checkpoint.ok, `ledger checkpoint should succeed, got ${JSON.stringify(checkpoint.data)}`);
  const clearing = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({
    idempotencyKey: 'ledger-clear',
    expectedRevision: 1,
    status: 'running',
    cursor: 'presentAnalysis',
    payload: { flags: {}, reviewItems: [{ id: 'G1' }], analysis: {}, routedGroups: [{ groupId: 'G1', route: 'currentPrFix', sourceIds: ['G1'] }] },
    ledger: {},
  })}'`);
  assert(!clearing.ok, 'public checkpoint must still reject ledger clearing');
  assert(cliErrorMessage(clearing).includes('Cannot clear populated ledger slot: reviewItems'), `ledger clearing should be rejected, got ${JSON.stringify(clearing.data)}`);

  const abandonData = {
    parentRunId: created.data.parentRunId,
    idempotencyKey: 'abandon-stale-parent',
    reason: 'staleParentMissingActiveChild',
    message: 'Parent is waiting for a child but has no activeChild handle',
  };
  const abandonPath = writeJsonFixture(path.dirname(fixmeDir), 'abandon.json', abandonData);
  const abandoned = run(`lifecycle parent abandon --fixme-dir "${fixmeDir}" --data-file "${abandonPath}"`);
  assert(abandoned.ok, `abandon should succeed, got ${JSON.stringify(abandoned.data)}`);
  assert(abandoned.data.status === 'failed', 'abandon closes parent as failed');
  assert(abandoned.data.cursor === 'summarize', 'abandon closes at summarize');
  assert(abandoned.data.failure.reason === 'staleParentMissingActiveChild', 'abandon records reason');
  assert(Array.isArray(abandoned.data.ledger.routedGroups), 'abandon preserves populated ledger');
  const replay = run(`lifecycle parent abandon --fixme-dir "${fixmeDir}" --data-file "${abandonPath}"`);
  assert(replay.ok && replay.data.parentRunId === created.data.parentRunId, `abandon replay should be idempotent, got ${JSON.stringify(replay.data)}`);
});

test('parent checkpoint requires failure when status failed', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const noFailure = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'cf', expectedRevision: 0, status: 'failed', cursor: 'summarize', payload: {}, ledger: { unresolvedAccounting: { fetchComplete: true } } })}'`);
  assert(!noFailure.ok && noFailure.data.error.code === 'invalidInput', `failed status requires failure, got ${JSON.stringify(noFailure.data)}`);
  const withFailure = run(`lifecycle parent checkpoint --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'cf2', expectedRevision: 0, status: 'failed', cursor: 'summarize', payload: {}, ledger: { unresolvedAccounting: { fetchComplete: true } }, failure: { reason: 'fetchFailed', message: 'boom' } })}'`);
  assert(withFailure.ok, `failed with failure should succeed, got: ${JSON.stringify(withFailure.data)}`);
});

test('parent resolve by id and lookup', () => {
  const fixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData()}'`);
  const byId = run(`lifecycle parent resolve --fixme-dir "${fixmeDir}" --parent-run-id ${created.data.parentRunId}`);
  assert(byId.ok && byId.data.parentRunId === created.data.parentRunId, 'resolve by id');
  const exactData = JSON.stringify({ parentSkill: 'fixme-pr-comments', lookupInput: prLookupInput() });
  const exact = run(`lifecycle parent resolve --fixme-dir "${fixmeDir}" --data '${exactData}'`);
  assert(exact.ok && exact.data.parentRunId === created.data.parentRunId, 'resolve by exact natural key');
  const broadData = JSON.stringify({ parentSkill: 'fixme-pr-comments', lookupInput: { pullRequestRef: prLookupInput().pullRequestRef } });
  const broad = run(`lifecycle parent resolve --fixme-dir "${fixmeDir}" --data '${broadData}'`);
  assert(broad.ok && broad.data.parentRunId === created.data.parentRunId, 'resolve by broad PR identity');
  const missingData = JSON.stringify({ parentSkill: 'fixme-pr-comments', lookupInput: prLookupInput({ pullRequestRef: { number: 999 } }) });
  const missing = run(`lifecycle parent resolve --fixme-dir "${fixmeDir}" --data '${missingData}'`);
  assert(!missing.ok && missing.data.error.code === 'stateNotFound', `missing resolve, got ${JSON.stringify(missing.data)}`);
});

console.log('\n=== task result write tests ===\n');

test('task terminal result writes result summary co-located with task state', () => {
  const { statePath, projectRoot } = initTaskState('result-completed');
  const data = JSON.stringify({ status: 'completed', summaryMarkdown: 'all done', changedFiles: [], artifactPaths: [] });
  const r = runInDir(`task result write --state "${statePath}" --data '${data}'`, projectRoot);
  assert(r.ok, `task result write should succeed, got: ${JSON.stringify(r.data)}`);
  assert(typeof r.data.terminalResultId === 'string', 'terminalResultId present');
  assert(r.data.resultSummaryPath.endsWith('.result.json'), `resultSummaryPath ends with .result.json, got ${r.data.resultSummaryPath}`);
  assert(fs.existsSync(r.data.resultSummaryPath), 'result file exists');
  const summary = readJson(r.data.resultSummaryPath);
  assert(summary.schemaVersion === 1, 'schemaVersion 1');
  assert(summary.terminalResultId === r.data.terminalResultId, 'terminalResultId matches');
  assert(summary.status === 'completed', 'status completed');
  assert(summary.failure === null, 'completed has null failure');
  assert(typeof summary.createdAt === 'string', 'createdAt present');
  const state = readJson(statePath);
  assert(state.terminalResult.terminalResultId === r.data.terminalResultId, 'task state stamped');
});

test('terminal result failed requires valid failure reason', () => {
  const { statePath, projectRoot } = initTaskState('result-failed');
  const noFailure = runInDir(`task result write --state "${statePath}" --data '{"status":"failed","summaryMarkdown":"x"}'`, projectRoot);
  assert(!noFailure.ok && noFailure.data.error.code === 'invalidInput', `failed without failure rejected, got ${JSON.stringify(noFailure.data)}`);
  const badReason = runInDir(`task result write --state "${statePath}" --data '{"status":"failed","summaryMarkdown":"x","failure":{"reason":"nope","message":"m"}}'`, projectRoot);
  assert(!badReason.ok && badReason.data.error.code === 'invalidInput', `invalid reason rejected, got ${JSON.stringify(badReason.data)}`);
  const ok = runInDir(`task result write --state "${statePath}" --data '{"status":"failed","summaryMarkdown":"x","failure":{"reason":"workflowBlocked","message":"blocked"}}'`, projectRoot);
  assert(ok.ok, `valid failure should succeed, got: ${JSON.stringify(ok.data)}`);
  const summary = readJson(ok.data.resultSummaryPath);
  assert(summary.failure.reason === 'workflowBlocked', 'failure recorded');
});

test('terminalResultId is stable across retry', () => {
  const { statePath, projectRoot } = initTaskState('result-stable');
  const data = JSON.stringify({ status: 'completed', summaryMarkdown: 'done', changedFiles: [], artifactPaths: [] });
  const first = runInDir(`task result write --state "${statePath}" --data '${data}'`, projectRoot);
  const second = runInDir(`task result write --state "${statePath}" --data '${data}'`, projectRoot);
  assert(second.ok && second.data.terminalResultId === first.data.terminalResultId, `terminalResultId stable, got ${first.data.terminalResultId} vs ${second.data.terminalResultId}`);
});

test('terminal result replay accepts identical payload and rejects conflicting durable fields', () => {
  const { statePath, projectRoot } = initTaskState('result-conflicts');
  const base = { status: 'completed', summaryMarkdown: 'done', changedFiles: ['a.js'], artifactPaths: ['report.md'] };
  const first = runInDir(`task result write --state "${statePath}" --data '${JSON.stringify(base)}'`, projectRoot);
  assert(first.ok, `first result write should succeed, got ${JSON.stringify(first.data)}`);
  const replay = runInDir(`task result write --state "${statePath}" --data '${JSON.stringify(base)}'`, projectRoot);
  assert(replay.ok && replay.data.terminalResultId === first.data.terminalResultId, `same payload replay should succeed, got ${JSON.stringify(replay.data)}`);

  for (const item of [
    { label: 'status', payload: { status: 'failed', summaryMarkdown: 'done', changedFiles: ['a.js'], artifactPaths: ['report.md'], failure: { reason: 'workflowBlocked', message: 'blocked' } } },
    { label: 'summaryMarkdown', payload: { ...base, summaryMarkdown: 'different' } },
    { label: 'failure', payload: { status: 'failed', summaryMarkdown: 'done', changedFiles: ['a.js'], artifactPaths: ['report.md'], failure: { reason: 'workflowBlocked', message: 'blocked' } } },
    { label: 'changedFiles', payload: { ...base, changedFiles: ['b.js'] } },
    { label: 'artifactPaths', payload: { ...base, artifactPaths: ['other.md'] } },
  ]) {
    const conflict = runInDir(`task result write --state "${statePath}" --data '${JSON.stringify(item.payload)}'`, projectRoot);
    assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `${item.label} conflict should reject, got ${JSON.stringify(conflict.data)}`);
  }
});

test('terminal result retry recovers existing summary when task state lacks terminalResult', () => {
  const { statePath, projectRoot } = initTaskState('result-partial-write');
  const summaryPath = statePath.endsWith('task-state.json')
    ? statePath.replace(/task-state\.json$/, 'task-state.result.json')
    : statePath.replace(/\.state\.json$/, '.result.json');
  const existingSummary = {
    schemaVersion: 1,
    terminalResultId: 'terminalResult_partial',
    taskStatePath: statePath,
    status: 'completed',
    summaryMarkdown: 'done after partial write',
    failure: null,
    changedFiles: ['a.js'],
    artifactPaths: ['report.md'],
    createdAt: '2026-06-11T00:00:00.000Z',
  };
  fs.writeFileSync(summaryPath, JSON.stringify(existingSummary, null, 2));

  const matching = { status: 'completed', summaryMarkdown: 'done after partial write', changedFiles: ['a.js'], artifactPaths: ['report.md'] };
  const retry = runInDir(`task result write --state "${statePath}" --data '${JSON.stringify(matching)}'`, projectRoot);
  assert(retry.ok, `matching retry should recover from summary, got ${JSON.stringify(retry.data)}`);
  assert(retry.data.terminalResultId === 'terminalResult_partial', `retry should reuse summary terminalResultId, got ${retry.data.terminalResultId}`);
  const state = readJson(statePath);
  assert(state.terminalResult.terminalResultId === 'terminalResult_partial', `task state should be checkpointed with summary id, got ${JSON.stringify(state.terminalResult)}`);

  const conflict = runInDir(`task result write --state "${statePath}" --data '${JSON.stringify({ ...matching, summaryMarkdown: 'different' })}'`, projectRoot);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `conflicting retry should reject, got ${JSON.stringify(conflict.data)}`);
  assert(readJson(summaryPath).terminalResultId === 'terminalResult_partial', 'summary terminalResultId stays stable after conflict');
});

console.log('\n=== lifecycle task-event tests ===\n');

function setupTaskEventScenario(slug) {
  const { statePath, projectRoot, fixmeDir } = initTaskWithRunStatus(slug);
  // Write a terminal result for the task.
  const resultData = JSON.stringify({ status: 'completed', summaryMarkdown: 'done', changedFiles: [], artifactPaths: [] });
  const result = runInDir(`task result write --state "${statePath}" --data '${resultData}'`, projectRoot);
  assert(result.ok, `task result write should succeed, got: ${JSON.stringify(result.data)}`);
  // Create a parent run with activeChild pointing at this task.
  const taskRunId = 'taskRun_x';
  const parentData = JSON.stringify({
    parentSkill: 'fixme-pr-comments', idempotencyKey: `pe-${slug}`,
    lookupInput: prLookupInput(), status: 'waitingForChild', cursor: 'awaitFixmeTask',
    payload: {
      fixBatches: [{}], activeBatchIndex: 0,
      activeChild: { statusId: 'run_x', taskRunId, taskStatePath: statePath, resumeRef: 'FIXME-1' },
    },
  });
  const parent = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentData}'`);
  assert(parent.ok, `parent create should succeed, got: ${JSON.stringify(parent.data)}`);
  return { statePath, projectRoot, fixmeDir, parentRunId: parent.data.parentRunId, terminalResultId: result.data.terminalResultId, resultSummaryPath: result.data.resultSummaryPath, taskRunId };
}

test('task-event record rejects when result summary missing', () => {
  const { statePath, fixmeDir, parentRunId } = setupTaskEventScenario('te-missing');
  const data = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath: path.join(path.dirname(statePath), 'nonexistent.result.json'),
    terminalResultId: 'terminalResult_missing', status: 'completed',
  });
  const r = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(!r.ok && r.data.error.code === 'stateNotFound', `missing result -> stateNotFound, got ${JSON.stringify(r.data)}`);
});

test('task-event record rejects when terminalResultId mismatch', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath } = setupTaskEventScenario('te-mismatch');
  const data = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId: 'terminalResult_wrong', status: 'completed',
  });
  const r = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(!r.ok && r.data.error.code === 'conflictingDuplicate', `mismatch -> conflictingDuplicate, got ${JSON.stringify(r.data)}`);
});

test('task-event record rejects first write when result summary status mismatches event status', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath, terminalResultId } = setupTaskEventScenario('te-summary-status-mismatch');
  const data = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'failed',
  });
  const r = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(!r.ok && r.data.error.code === 'conflictingDuplicate', `summary status mismatch -> conflictingDuplicate, got ${JSON.stringify(r.data)}`);
});

test('task-event record rejects first write when task terminal result status mismatches event status', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath, terminalResultId } = setupTaskEventScenario('te-state-status-mismatch');
  const summary = readJson(resultSummaryPath);
  fs.writeFileSync(resultSummaryPath, JSON.stringify({ ...summary, status: 'failed' }, null, 2));
  const data = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'failed',
  });
  const r = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(!r.ok && r.data.error.code === 'conflictingDuplicate', `task terminal result status mismatch -> conflictingDuplicate, got ${JSON.stringify(r.data)}`);
});

test('task-event record succeeds and is idempotent', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath, terminalResultId } = setupTaskEventScenario('te-ok');
  const data = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'completed',
  });
  const r = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(r.ok, `record should succeed, got: ${JSON.stringify(r.data)}`);
  assert(r.data.event && r.data.event.eventId, 'event returned');
  const replay = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${data}'`);
  assert(replay.ok && replay.data.event.eventId === r.data.event.eventId, 'idempotent record');
  const conflictData = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'failed',
  });
  const conflict = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${conflictData}'`);
  assert(!conflict.ok && conflict.data.error.code === 'conflictingDuplicate', `conflicting status, got ${JSON.stringify(conflict.data)}`);
});

test('task-event consume records into parent state and is idempotent', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath, terminalResultId } = setupTaskEventScenario('te-consume');
  const recordData = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'completed',
  });
  run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${recordData}'`);
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(consume.ok, `consume should succeed, got: ${JSON.stringify(consume.data)}`);
  assert(consume.data.event && consume.data.event.consumedAt, 'event consumed');
  // Parent state recorded the event.
  const parent = run(`lifecycle parent resolve --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId}`);
  assert(parent.data.payload.consumedTaskEvent && parent.data.payload.consumedTaskEvent.eventId === consume.data.event.eventId, 'parent recorded the event');
  const retry = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(retry.ok && retry.data.event.eventId === consume.data.event.eventId, 'idempotent re-consume returns recorded event');
});

test('task-event consume with no pending event returns noPendingEvent', () => {
  const { fixmeDir, parentRunId } = setupTaskEventScenario('te-none');
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(!consume.ok && consume.data.error.code === 'noPendingEvent', `no event -> noPendingEvent, got ${JSON.stringify(consume.data)}`);
});

// Build a durable task-event file directly on disk. Fixture construction only:
// the production `record` path enforces that an event's terminalResultId matches
// the real task result, so edge-case events (extra child, mismatched
// terminalResultId) must be staged on disk before driving the consume CLI.
function writeTaskEventFile(fixmeDir, parentRunId, event) {
  const dir = path.join(fixmeDir, 'task-events', parentRunId);
  fs.mkdirSync(dir, { recursive: true });
  const record = {
    schemaVersion: 1,
    parentRunId,
    createdAt: new Date().toISOString(),
    consumedAt: null,
    consumedBy: null,
    ...event,
  };
  fs.writeFileSync(path.join(dir, `${record.eventId}.json`), JSON.stringify(record, null, 2));
  return record;
}

function parentState(fixmeDir, parentRunId) {
  return readJson(path.join(fixmeDir, 'parents', parentRunId, 'state.json'));
}

function writeParentState(fixmeDir, parentRunId, state) {
  fs.writeFileSync(path.join(fixmeDir, 'parents', parentRunId, 'state.json'), JSON.stringify(state, null, 2));
}

// Critical Invariant 2 proof: a crash between the parent checkpoint and the
// event-file consumed marker must recover. The parent already recorded the
// event while the event file's consumedAt is still null; the retry must return
// the parent-recorded event and complete the missing consumed marker.
test('task-event consume retry after partial write returns parent-recorded event', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath, terminalResultId } = setupTaskEventScenario('te-partial');
  const recordData = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'completed',
  });
  const recorded = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${recordData}'`);
  assert(recorded.ok, `record should succeed, got: ${JSON.stringify(recorded.data)}`);
  const eventId = recorded.data.event.eventId;

  // Consume once to record the event into parent state, then simulate a partial
  // write: reset the event file's consumed marker back to null.
  const first = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(first.ok && first.data.event.eventId === eventId, `first consume records event, got ${JSON.stringify(first.data)}`);
  const eventFilePath = path.join(fixmeDir, 'task-events', parentRunId, `${eventId}.json`);
  const eventRecord = readJson(eventFilePath);
  eventRecord.consumedAt = null;
  eventRecord.consumedBy = null;
  fs.writeFileSync(eventFilePath, JSON.stringify(eventRecord, null, 2));
  assert(readJson(eventFilePath).consumedAt === null, 'partial write left consumedAt null');
  assert(parentState(fixmeDir, parentRunId).payload.consumedTaskEvent.eventId === eventId, 'parent still has recorded event');

  const retry = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(retry.ok && retry.data.event.eventId === eventId, `retry returns parent-recorded event, got ${JSON.stringify(retry.data)}`);
  assert(readJson(eventFilePath).consumedAt, 'retry re-sets the missing consumed marker');
});

test('task-event consume scopes the recovery branch to the active child across batches', () => {
  const { statePath, fixmeDir, parentRunId } = setupTaskEventScenario('te-cross-batch');
  // Simulate batch 1 already consumed: parent.payload.consumedTaskEvent points at
  // a prior-batch event whose file still exists. Then advance activeChild to a
  // batch-2 child and stage a fresh batch-2 event.
  const batch1Event = writeTaskEventFile(fixmeDir, parentRunId, {
    eventId: 'taskEvent_batch1',
    taskRunId: 'taskRun_x',
    taskStatePath: statePath,
    resultSummaryPath: path.join(path.dirname(statePath), 'batch1.result.json'),
    terminalResultId: 'terminalResult_batch1',
    status: 'completed',
  });
  // Mark the batch-1 event already consumed so it is not eligible for fresh
  // selection (the bug being guarded is the recovery branch returning it anyway).
  batch1Event.consumedAt = new Date().toISOString();
  batch1Event.consumedBy = parentRunId;
  fs.writeFileSync(path.join(fixmeDir, 'task-events', parentRunId, `${batch1Event.eventId}.json`), JSON.stringify(batch1Event, null, 2));

  const batch2StatePath = path.join(path.dirname(statePath), 'batch2.state.json');
  const batch2Event = writeTaskEventFile(fixmeDir, parentRunId, {
    eventId: 'taskEvent_batch2',
    taskRunId: 'taskRun_batch2',
    taskStatePath: batch2StatePath,
    resultSummaryPath: path.join(path.dirname(statePath), 'batch2.result.json'),
    terminalResultId: 'terminalResult_batch2',
    status: 'completed',
  });

  const state = parentState(fixmeDir, parentRunId);
  // Parent still records the batch-1 consumed event from the prior batch.
  state.payload.consumedTaskEvent = {
    eventId: batch1Event.eventId,
    terminalResultId: batch1Event.terminalResultId,
    resultSummaryPath: batch1Event.resultSummaryPath,
    status: batch1Event.status,
  };
  // activeChild has advanced to batch 2.
  state.payload.activeChild = { statusId: 'run_b2', taskRunId: 'taskRun_batch2', taskStatePath: batch2StatePath, resumeRef: 'FIXME-1' };
  writeParentState(fixmeDir, parentRunId, state);

  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(consume.ok, `consume should succeed, got: ${JSON.stringify(consume.data)}`);
  assert(consume.data.event.eventId === batch2Event.eventId, `consume returns the batch-2 event, not the stale batch-1 event, got ${JSON.stringify(consume.data.event.eventId)}`);
  assert(parentState(fixmeDir, parentRunId).payload.consumedTaskEvent.eventId === batch2Event.eventId, 'parent now records the batch-2 event');
});

test('task-event consume by explicit event-id consumes the matching event', () => {
  const { statePath, fixmeDir, parentRunId, resultSummaryPath, terminalResultId } = setupTaskEventScenario('te-explicit');
  const recordData = JSON.stringify({
    parentRunId, taskRunId: 'taskRun_x', taskStatePath: statePath,
    resultSummaryPath, terminalResultId, status: 'completed',
  });
  const recorded = run(`lifecycle task-event record --fixme-dir "${fixmeDir}" --data '${recordData}'`);
  const eventId = recorded.data.event.eventId;
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --event-id ${eventId}`);
  assert(consume.ok, `explicit consume should succeed, got: ${JSON.stringify(consume.data)}`);
  assert(consume.data.event.eventId === eventId, 'explicit consume returns the named event');
  assert(consume.data.event.consumedAt, 'explicit consume marks event consumed');
  assert(parentState(fixmeDir, parentRunId).payload.consumedTaskEvent.eventId === eventId, 'parent recorded the explicit event');
});

test('task-event consume by explicit event-id for a different child returns staleState', () => {
  const { statePath, fixmeDir, parentRunId } = setupTaskEventScenario('te-explicit-stale');
  // Stage an event belonging to a different child (different taskRunId/state).
  const otherEvent = writeTaskEventFile(fixmeDir, parentRunId, {
    eventId: 'taskEvent_other',
    taskRunId: 'taskRun_other',
    taskStatePath: path.join(path.dirname(statePath), 'other.state.json'),
    resultSummaryPath: path.join(path.dirname(statePath), 'other.result.json'),
    terminalResultId: 'terminalResult_other',
    status: 'completed',
  });
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --event-id ${otherEvent.eventId}`);
  assert(!consume.ok && consume.data.error.code === 'staleState', `different child -> staleState, got ${JSON.stringify(consume.data)}`);
});

test('task-event consume by explicit event-id with terminalResultId mismatch returns staleState', () => {
  const { statePath, fixmeDir, parentRunId } = setupTaskEventScenario('te-explicit-trid');
  // Pin a terminalResultId on the active child, then stage an event that matches
  // the child's taskRunId/state but carries a different terminalResultId.
  const state = parentState(fixmeDir, parentRunId);
  state.payload.activeChild.terminalResultId = 'terminalResult_expected';
  writeParentState(fixmeDir, parentRunId, state);
  const mismatch = writeTaskEventFile(fixmeDir, parentRunId, {
    eventId: 'taskEvent_trid',
    taskRunId: 'taskRun_x',
    taskStatePath: statePath,
    resultSummaryPath: path.join(path.dirname(statePath), 'x.result.json'),
    terminalResultId: 'terminalResult_different',
    status: 'completed',
  });
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --event-id ${mismatch.eventId}`);
  assert(!consume.ok && consume.data.error.code === 'staleState', `terminalResultId mismatch -> staleState, got ${JSON.stringify(consume.data)}`);
});

test('task-event consume with no active child returns staleState recovery diagnostics', () => {
  const { fixmeDir, parentRunId } = setupTaskEventScenario('te-no-child');
  const state = parentState(fixmeDir, parentRunId);
  delete state.payload.activeChild;
  writeParentState(fixmeDir, parentRunId, state);
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(!consume.ok && consume.data.error.code === 'staleState', `no active child -> staleState, got ${JSON.stringify(consume.data)}`);
  assert(consume.data.recovery.commands.abandon.includes('lifecycle parent abandon'), 'stale response includes abandon command');
});

test('task-event consume with multiple matching unacknowledged events returns conflictingDuplicate', () => {
  const { statePath, fixmeDir, parentRunId } = setupTaskEventScenario('te-dup');
  // Stage two unacknowledged events that both match the active child.
  const common = {
    taskRunId: 'taskRun_x',
    taskStatePath: statePath,
    resultSummaryPath: path.join(path.dirname(statePath), 'dup.result.json'),
    status: 'completed',
  };
  writeTaskEventFile(fixmeDir, parentRunId, { ...common, eventId: 'taskEvent_dup1', terminalResultId: 'terminalResult_dup1' });
  writeTaskEventFile(fixmeDir, parentRunId, { ...common, eventId: 'taskEvent_dup2', terminalResultId: 'terminalResult_dup2' });
  const consume = run(`lifecycle task-event consume --fixme-dir "${fixmeDir}" --parent-run-id ${parentRunId} --next`);
  assert(!consume.ok && consume.data.error.code === 'conflictingDuplicate', `multiple matches -> conflictingDuplicate, got ${JSON.stringify(consume.data)}`);
});

// ============================================================================
// Test Suite: final workflow state transitions
// ============================================================================

console.log('\n=== final workflow state transitions ===\n');

function createBugfixWorkflowTicket(slug, overrides = {}) {
  const base = createTmpDir();
  const sessionDir = path.join(base, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', slug, 'queued');

  let content = fs.readFileSync(ticketPath, 'utf8');
  if (overrides.removeMaxAttempts) {
    content = content.replace(/max_attempts: 3\n/, '');
  }
  if (overrides.max_attempts !== undefined) {
    content = content.replace(/max_attempts: 3/, `max_attempts: ${overrides.max_attempts}`);
  }
  if (overrides.current_attempt !== undefined) {
    content = content.replace(/current_attempt: 0/, `current_attempt: ${overrides.current_attempt}`);
  }
  fs.writeFileSync(ticketPath, content);

  return { base, sessionDir, ticketPath };
}

function transitionTicket(base, ticketPath, nextState, suffix = '') {
  return runInDir(`ticket transition "${ticketPath}" ${nextState}${suffix}`, base);
}

function walkBugfixTicket(base, ticketPath, states, slug = path.basename(path.dirname(ticketPath))) {
  for (const [index, state] of states.entries()) {
    const suffix = index === 0 && state === 'investigate' ? ' --pipeline bugfix' : '';
    const result = transitionTicket(base, ticketPath, state, suffix);
    assert(result.ok, `Walk to ${state} should succeed for ${slug}, got: ${JSON.stringify(result.data)}`);
  }
}

function walkToVerify(slug, overrides = {}) {
  const context = createBugfixWorkflowTicket(slug, overrides);
  walkBugfixTicket(context.base, context.ticketPath, ['investigate', 'research', 'plan', 'implement', 'verify'], slug);
  return context;
}

test('happy path: queued -> investigate -> research -> plan -> implement -> verify -> done', () => {
  const { base, ticketPath } = createBugfixWorkflowTicket('full-path');

  walkBugfixTicket(base, ticketPath, ['investigate', 'research', 'plan', 'implement', 'verify', 'done'], 'full-path');

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: done'), 'Final state should be done');
  const transitions = content.match(/from:/g);
  assert(transitions && transitions.length === 6, `Should have 6 transitions, got ${transitions ? transitions.length : 0}`);
});

test('retry: verify -> plan with --reason succeeds and increments attempt', () => {
  const { base, ticketPath } = walkToVerify('retry-test');

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Build failed"');
  assert(result.ok, `Retry transition should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'verify', `from should be verify, got ${result.data.from}`);
  assert(result.data.to === 'plan', `to should be plan, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('current_attempt: 1'), `current_attempt should be 1, content: ${content.substring(0, 500)}`);
  assert(content.includes('Build failed'), 'Reason should appear in transitions');
});

test('invalid: investigate -> fixing is rejected', () => {
  const { base, ticketPath } = createBugfixWorkflowTicket('invalid-test');

  walkBugfixTicket(base, ticketPath, ['investigate'], 'invalid-test');

  const result = transitionTicket(base, ticketPath, 'fixing');
  assert(!result.ok, 'investigate -> fixing should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Valid transitions from'), `Error should list valid transitions: ${result.data.error}`);
});

test('failure: research -> failed with --reason succeeds', () => {
  const { base, ticketPath } = createBugfixWorkflowTicket('fail-research');

  walkBugfixTicket(base, ticketPath, ['investigate', 'research'], 'fail-research');

  const pre = fs.readFileSync(ticketPath, 'utf8');
  assert(pre.includes('state: research'), 'Should be in research state before failure test');

  const result = transitionTicket(base, ticketPath, 'failed', ' --reason "No root cause found"');
  assert(result.ok, `research -> failed should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'research', `from should be research, got ${result.data.from}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
});

test('failure: plan -> failed with --reason succeeds', () => {
  const { base, ticketPath } = createBugfixWorkflowTicket('fail-plan');

  walkBugfixTicket(base, ticketPath, ['investigate', 'research', 'plan'], 'fail-plan');

  const pre = fs.readFileSync(ticketPath, 'utf8');
  assert(pre.includes('state: plan'), 'Should be in plan state before failure test');

  const result = transitionTicket(base, ticketPath, 'failed', ' --reason "No viable fix"');
  assert(result.ok, `plan -> failed should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'plan', `from should be plan, got ${result.data.from}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
});

test('failure: implement -> failed with --reason succeeds', () => {
  const { base, ticketPath } = createBugfixWorkflowTicket('fail-impl');

  walkBugfixTicket(base, ticketPath, ['investigate', 'research', 'plan', 'implement'], 'fail-impl');

  const pre = fs.readFileSync(ticketPath, 'utf8');
  assert(pre.includes('state: implement'), 'Should be in implement state before failure test');

  const result = transitionTicket(base, ticketPath, 'failed', ' --reason "Implementation blocked"');
  assert(result.ok, `implement -> failed should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'implement', `from should be implement, got ${result.data.from}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
});

test('cumulative: plan duration preserved across retry', () => {
  const { base, ticketPath } = createBugfixWorkflowTicket('cumul-test');

  walkBugfixTicket(base, ticketPath, ['investigate', 'research', 'plan'], 'cumul-test');

  const content1 = fs.readFileSync(ticketPath, 'utf8');
  assert(content1.includes('plan:'), 'Should have plan duration entry after first visit');

  walkBugfixTicket(base, ticketPath, ['implement', 'verify'], 'cumul-test');

  const content2 = fs.readFileSync(ticketPath, 'utf8');
  assert(content2.includes('plan:'), 'plan duration should still exist');

  transitionTicket(base, ticketPath, 'plan', ' --reason "Tests failed"');

  const content3 = fs.readFileSync(ticketPath, 'utf8');
  assert(content3.includes('plan:'), 'plan duration should exist after re-entry');
  assert(content3.includes('prior_seconds:'), 'plan should have prior_seconds field for cumulative tracking');
});

console.log('\n=== max_attempts enforcement ===\n');

test('max_attempts: allows retry when current_attempt=0, max_attempts=3', () => {
  const { base, ticketPath } = walkToVerify('allow-retry-0of3');

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Tests failed"');
  assert(result.ok, `Should allow retry at attempt 0/3, got: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'plan', `Should transition to plan, got ${result.data.to}`);
});

test('max_attempts: allows retry when current_attempt=1, max_attempts=3', () => {
  const { base, ticketPath } = walkToVerify('allow-retry-1of3', { current_attempt: 1 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Tests failed again"');
  assert(result.ok, `Should allow retry at attempt 1/3, got: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'plan', `Should transition to plan, got ${result.data.to}`);
});

test('max_attempts: rejects retry when current_attempt=2, max_attempts=3', () => {
  const { base, ticketPath } = walkToVerify('reject-retry-2of3', { current_attempt: 2 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Tests failed yet again"');
  assert(!result.ok, 'Should reject retry at attempt 2/3');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

test('max_attempts: rejects retry when current_attempt=0, max_attempts=1', () => {
  const { base, ticketPath } = walkToVerify('reject-retry-0of1', { max_attempts: 1 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Only one attempt allowed"');
  assert(!result.ok, 'Should reject retry at attempt 0/1');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

test('max_attempts: allows retry when current_attempt=0, max_attempts=2', () => {
  const { base, ticketPath } = walkToVerify('allow-retry-0of2', { max_attempts: 2 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Second chance"');
  assert(result.ok, `Should allow retry at attempt 0/2, got: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'plan', `Should transition to plan, got ${result.data.to}`);
});

test('max_attempts: rejects retry when current_attempt=1, max_attempts=2', () => {
  const { base, ticketPath } = walkToVerify('reject-retry-1of2', { current_attempt: 1, max_attempts: 2 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "No more retries"');
  assert(!result.ok, 'Should reject retry at attempt 1/2');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

test('max_attempts: error message contains attempt count and max', () => {
  const { base, ticketPath } = walkToVerify('error-msg-check', { current_attempt: 2, max_attempts: 3 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Check message"');
  assert(!result.ok, 'Should reject retry');
  assert(result.data.error.includes('3 of 3'), `Error should contain attempt counts: ${result.data.error}`);
  assert(result.data.error.includes('verify -> plan denied'), `Error should mention denied transition: ${result.data.error}`);
});

test('max_attempts: defaults to max_attempts=3 when field missing', () => {
  const { base, ticketPath } = walkToVerify('no-max-field', { removeMaxAttempts: true, current_attempt: 2 });

  const result = transitionTicket(base, ticketPath, 'plan', ' --reason "Defaults test"');
  assert(!result.ok, 'Should reject when defaulting to max_attempts=3 with current_attempt=2');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

// ============================================================================
// Test Suite: ticket list: files_changed field
// ============================================================================

console.log('\n=== ticket list: files_changed field ===\n');

test('list: includes files_changed from frontmatter', () => {
  const sessionDir = createTmpDir();
  fs.writeFileSync(path.join(sessionDir, 'session.md'), '---\nname: test\n---\n');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'fc-test', 'queued');

  // Edit ticket.md to set files_changed in frontmatter
  let content = fs.readFileSync(ticketPath, 'utf8');
  content = content.replace('files_changed: []', 'files_changed: ["src/app.tsx", "src/utils.ts"]');
  fs.writeFileSync(ticketPath, content);

  const result = run(`ticket list "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(Array.isArray(result.data[0].files_changed), 'files_changed should be an array');
  assert(result.data[0].files_changed.length === 2, `Should have 2 files, got ${result.data[0].files_changed.length}`);
  assert(result.data[0].files_changed[0] === 'src/app.tsx', `First file should be src/app.tsx, got ${result.data[0].files_changed[0]}`);
  assert(result.data[0].files_changed[1] === 'src/utils.ts', `Second file should be src/utils.ts, got ${result.data[0].files_changed[1]}`);
});

test('list: files_changed defaults to empty array when not in frontmatter', () => {
  const sessionDir = createTmpDir();
  fs.writeFileSync(path.join(sessionDir, 'session.md'), '---\nname: test\n---\n');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'fc-missing', 'queued');

  // Remove files_changed line entirely from frontmatter
  let content = fs.readFileSync(ticketPath, 'utf8');
  content = content.replace(/files_changed: \[\]\n/, '');
  fs.writeFileSync(ticketPath, content);

  const result = run(`ticket list "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(Array.isArray(result.data[0].files_changed), 'files_changed should be an array');
  assert(result.data[0].files_changed.length === 0, `Should be empty array, got ${result.data[0].files_changed.length}`);
});

test('list: files_changed with empty array returns empty array', () => {
  const sessionDir = createTmpDir();
  fs.writeFileSync(path.join(sessionDir, 'session.md'), '---\nname: test\n---\n');
  // Default template has files_changed: [] -- just use createTicketFolder as-is
  createTicketFolder(sessionDir, '0001', 'fc-empty', 'queued');

  const result = run(`ticket list "${sessionDir}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(Array.isArray(result.data[0].files_changed), 'files_changed should be an array');
  assert(result.data[0].files_changed.length === 0, `Should be empty array, got ${result.data[0].files_changed.length}`);
});

// ============================================================================
// Dynamic State Machine Tests (unit)
// ============================================================================

console.log('\n=== dynamic state machine: buildTransitionsFromPhases ===\n');

test('buildTransitions: default pipeline [plan, implement]', () => {
  const phases = ['plan', 'implement'];
  const t = buildTransitionsFromPhases(phases);

  assert(arraysEqual(t['queued'], ['plan', 'skipped', 'failed']),
    `queued should -> plan, skipped, failed. Got: ${t['queued']}`);
  assert(arraysEqual(t['plan'], ['implement', 'failed']),
    `plan should -> implement, failed. Got: ${t['plan']}`);
  assert(arraysEqual(t['implement'], ['done', 'plan', 'failed']),
    `implement (last) should -> done, plan, failed. Got: ${t['implement']}`);
  assert(arraysEqual(t['done'], []), 'done should be terminal');
  assert(arraysEqual(t['failed'], []), 'failed should be terminal');
  assert(arraysEqual(t['skipped'], []), 'skipped should be terminal');
});

test('buildTransitions: full pipeline [investigate, research, plan, implement, verify]', () => {
  const phases = ['investigate', 'research', 'plan', 'implement', 'verify'];
  const t = buildTransitionsFromPhases(phases);

  assert(arraysEqual(t['queued'], ['investigate', 'skipped', 'failed']),
    `queued should -> investigate. Got: ${t['queued']}`);
  assert(arraysEqual(t['investigate'], ['research', 'failed']),
    `investigate (first) has no backward. Got: ${t['investigate']}`);
  assert(arraysEqual(t['research'], ['plan', 'investigate', 'failed']),
    `research can go backward. Got: ${t['research']}`);
  assert(arraysEqual(t['plan'], ['implement', 'investigate', 'research', 'failed']),
    `plan can go backward. Got: ${t['plan']}`);
  assert(arraysEqual(t['implement'], ['verify', 'investigate', 'research', 'plan', 'failed']),
    `implement can go backward. Got: ${t['implement']}`);
  assert(t['verify'].includes('done'), 'verify (last) can go to done');
  assert(t['verify'].includes('plan'), 'verify can go backward to plan');
  assert(t['verify'].includes('failed'), 'verify can go to failed');
});

// ============================================================================
// Dynamic State Machine Tests (integration via CLI)
// ============================================================================

console.log('\n=== dynamic state machine: CLI integration ===\n');

test('pipeline flag: rejects removed default workflow alias', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name pipe-session`, base);
  const sessionDir = sessionResult.data.path;
  const createResult = runInDir(`ticket create "${sessionDir}" --slug pipeline-test`, base);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, base);
  assert(!t1.ok, 'removed default workflow alias should fail');
  assert(t1.data.error.includes('Workflow not found or has no enabled phases'), `removed alias should fail workflow lookup, got ${t1.data.error}`);

  const frontmatterLines = readTicketFrontmatterLines(ticketPath);
  assert(!frontmatterLines.includes('pipeline: standard'), 'failed alias transition should not write standard pipeline');
  assert(!frontmatterLines.includes('pipeline: default'), 'failed alias transition should not write default pipeline');
});

test('pipeline flag: removed alias cannot take terminal transition', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name alias-terminal-session`, base);
  const sessionDir = sessionResult.data.path;
  const createResult = runInDir(`ticket create "${sessionDir}" --slug alias-terminal-test`, base);
  const ticketPath = createResult.data.path;

  const result = runInDir(`ticket transition "${ticketPath}" failed --pipeline default --reason "Blocked"`, base);

  assert(!result.ok, 'removed workflow alias should not allow terminal transitions');
  assert(result.data.error.includes('Workflow not found or has no enabled phases'), `removed alias should fail workflow lookup, got ${result.data.error}`);
  const frontmatterLines = readTicketFrontmatterLines(ticketPath);
  assert(!frontmatterLines.includes('state: failed'), 'failed alias transition should not update state');
  assert(!frontmatterLines.includes('pipeline: default'), 'failed alias transition should not write removed alias');
});

test('pipeline frontmatter: rejects removed default workflow alias', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name stored-alias-session`, base);
  const sessionDir = sessionResult.data.path;
  const createResult = runInDir(`ticket create "${sessionDir}" --slug stored-alias-test`, base);
  const ticketPath = createResult.data.path;
  setTicketFrontmatterField(ticketPath, 'pipeline', 'default');

  const beforeFrontmatter = readTicketFrontmatterLines(ticketPath);
  assert(beforeFrontmatter.includes('pipeline: default'), 'test setup should store removed alias in frontmatter');

  const t1 = runInDir(`ticket transition "${ticketPath}" plan`, base);
  assert(!t1.ok, 'stored removed alias should not transition');
  assert(t1.data.error.includes('Workflow not found or has no enabled phases'), `stored alias should fail workflow lookup, got ${t1.data.error}`);

  const afterFrontmatter = readTicketFrontmatterLines(ticketPath);
  assert(afterFrontmatter.includes('pipeline: default'), 'failed transition should not rewrite frontmatter alias');
  assert(!afterFrontmatter.includes('pipeline: standard'), 'failed transition should not normalize alias');
});

test('pipeline flag: bugfix is the final investigate workflow and full is feature lifecycle', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name workflow-session`, base);
  const sessionDir = sessionResult.data.path;

  const bugfixTicket = runInDir(`ticket create "${sessionDir}" --slug bugfix-test`, base).data.path;
  const bugfixStart = runInDir(`ticket transition "${bugfixTicket}" investigate --pipeline bugfix`, base);
  assert(bugfixStart.ok, `bugfix should start at investigate: ${JSON.stringify(bugfixStart.data)}`);

  const fullTicket = runInDir(`ticket create "${sessionDir}" --slug full-test`, base).data.path;
  const wrongFullStart = runInDir(`ticket transition "${fullTicket}" investigate --pipeline full`, base);
  assert(!wrongFullStart.ok, 'final full should not start at investigate');

  const fullStart = runInDir(`ticket transition "${fullTicket}" product-spec --pipeline full`, base);
  assert(fullStart.ok, `final full should start at product-spec: ${JSON.stringify(fullStart.data)}`);
});

test('pipeline flag: rejects invalid forward skip', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name skip-session`, base);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug skip-test`, base);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" investigate --pipeline bugfix`, base);
  assert(t1.ok, `First transition failed: ${JSON.stringify(t1.data)}`);

  const t2 = runInDir(`ticket transition "${ticketPath}" plan`, base);
  assert(!t2.ok, 'investigate -> plan should fail (must go through research)');
  assert(t2.data && t2.data.error, 'Should have error message');
  assert(t2.data.error.includes('Invalid transition'), `Expected invalid transition error. Got: ${t2.data.error}`);
});

test('pipeline: backward transition requires reason and increments attempt', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name back-session`, base);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug backward-test`, base);
  const ticketPath = createResult.data.path;

  runInDir(`ticket transition "${ticketPath}" plan --pipeline standard`, base);
  runInDir(`ticket transition "${ticketPath}" implement`, base);

  const t1 = runInDir(`ticket transition "${ticketPath}" plan`, base);
  assert(!t1.ok, 'backward without reason should fail');
  assert(t1.data.error.includes('--reason'), `Should require reason. Got: ${t1.data.error}`);

  const t2 = runInDir(`ticket transition "${ticketPath}" plan --reason "Code review found issues"`, base);
  assert(t2.ok, `Backward with reason should succeed: ${JSON.stringify(t2.data)}`);
  assert(t2.data.from === 'implement', `from should be implement, got ${t2.data.from}`);
  assert(t2.data.to === 'plan', `to should be plan, got ${t2.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('current_attempt: 1'), 'current_attempt should be 1 after backward transition');
});

test('pipeline: obsolete pipelines config is rejected before migration', () => {
  const base = createTmpDir();
  createObsoletePipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name obsolete-pipeline-session`, base);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug obsolete-pipeline-test`, base);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, base);
  assert(!t1.ok, 'obsolete pipelines config should not be readable');
  assert(t1.data.error === 'unsupported_obsolete_config', `obsolete pipelines config should return JSON error, got ${JSON.stringify(t1.data)}`);
  assert(t1.data.configPath === 'pipelines', `obsolete pipelines config should report pipelines path, got ${JSON.stringify(t1.data)}`);
});

test('fallback: no config uses final standard workflow transitions', () => {
  const base = createTmpDir();
  // No createPipelineConfig -- no config.json exists
  const ticketPath = createTicketFolder(base, '0001', 'fallback-test', 'queued');

  const oldResult = runInDir(`ticket transition "${ticketPath}" investigating`, base);
  assert(!oldResult.ok, 'old no-config transition state should fail');
  assert(oldResult.data.error.includes('Invalid transition'), `old transition should be invalid, got ${oldResult.data.error}`);

  const result = runInDir(`ticket transition "${ticketPath}" plan`, base);
  assert(result.ok, `Fallback standard transition should succeed: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'plan', `Should transition to plan, got ${result.data.to}`);
});

test('workflow config: malformed config fails instead of using built-in standard', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), 'not valid json {{{');
  const sessionDir = path.join(fixmeDir, 'sessions', 'bad-config-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'bad-config-test', 'queued');

  const result = runInDir(`ticket transition "${ticketPath}" plan`, base);

  assert(!result.ok, 'malformed config should not fall back to built-in standard');
  assert(result.data.error.includes('Invalid config.json'), `error should mention invalid config, got ${result.data.error}`);
  assert(readTicketFrontmatterLines(ticketPath).includes('state: queued'), 'malformed config should not update ticket state');
});

// ── context commands (config.json migration) ─────────────────────────
console.log('\n── context commands ──');

test('context detect outputs camelCase project format with yarn', () => {
  const tmp = createTmpDir();
  // Create a minimal package.json + yarn.lock
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    scripts: { dev: 'next dev', build: 'next build', test: 'jest', lint: 'eslint .' },
    dependencies: { next: '^14.0.0', react: '^18.0.0' },
    devDependencies: { jest: '^29.0.0' }
  }));
  fs.writeFileSync(path.join(tmp, 'yarn.lock'), '');
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

test('context detect uses bun when bun.lockb exists', () => {
  const tmp = createTmpDir();
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    scripts: { dev: 'next dev', build: 'next build', test: 'vitest', lint: 'eslint .' },
    dependencies: { next: '^14.0.0' },
    devDependencies: { vitest: '^1.0.0' }
  }));
  fs.writeFileSync(path.join(tmp, 'bun.lockb'), '');
  const result = runInDir('context detect', tmp);
  assert(result.ok, 'context detect should succeed');
  const d = result.data;
  assert(d.devServer.command === 'bun dev', 'devServer.command should be bun dev');
  assert(d.build === 'bun build', 'build should be bun build');
  assert(d.test.command === 'bun test', 'test.command should be bun test');
  assert(d.lint === 'bun lint', 'lint should be bun lint');
  assert(d.install === 'bun install --frozen-lockfile', 'install should use bun locked install');
});

test('context detect emits locked install commands from lockfiles', () => {
  const cases = [
    ['bun.lock', 'bun install --frozen-lockfile'],
    ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
    ['yarn.lock', 'yarn install --frozen-lockfile'],
    ['package-lock.json', 'npm ci'],
  ];

  for (const [lockfile, installCommand] of cases) {
    const tmp = createTmpDir();
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      scripts: { test: 'vitest' },
      devDependencies: { vitest: '^1.0.0' }
    }));
    fs.writeFileSync(path.join(tmp, lockfile), '');

    const result = runInDir('context detect', tmp);
    assert(result.ok, `context detect should succeed for ${lockfile}`);
    assert(
      result.data.install === installCommand,
      `${lockfile} should produce ${installCommand}, got ${result.data.install}`
    );
  }
});

test('context detect falls back to npm run when no lockfile', () => {
  const tmp = createTmpDir();
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    scripts: { build: 'tsc', test: 'jest' },
    devDependencies: { jest: '^29.0.0' }
  }));
  const result = runInDir('context detect', tmp);
  assert(result.ok, 'context detect should succeed');
  const d = result.data;
  assert(d.build === 'npm run build', 'build should be npm run build');
  assert(d.test.command === 'npm run test', 'test.command should be npm run test');
  assert(d.install === 'npm install', 'install should fall back to npm install without a lockfile');
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
  // Must NOT have created the obsolete yaml context file
  const obsoleteYamlPath = path.join(fixmeDir, ['project', 'context.yaml'].join('-'));
  assert(!fs.existsSync(obsoleteYamlPath), 'obsolete yaml file must not exist');
});

test('context save preserves existing config keys', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  // Write existing config with workflows and models
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    ticketBackend: 'fixme-tickets-md',
    models: { profile: 'balanced' },
    workflows: { standard: { outerMaxCycles: 2, phases: [{ name: 'plan', skills: ['fixme-write-plan'] }] } }
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
  assert(config.workflows.standard.phases.length === 1, 'workflows preserved under final standard name');
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
  assert(/\/fixme-config/.test(result.data.error), 'error should mention /fixme-config');
});

test('context load fails when config.json has no project key', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({}, null, 2));
  const result = runInDir('context load', tmp);
  assert(!result.ok, 'should fail');
  assert(result.data && result.data.error, 'should have error message');
  assert(
    /config\.json|fixme-config/.test(result.data.error),
    'error should mention config.json or fixme-config'
  );
});

// ── config commands ─────────────────────────────────────────────────
console.log('\n── config commands ──');

test('config migrate creates final standard workflows and review level defaults', () => {
  const tmp = createTmpDir();
  const result = runInDir('config migrate', tmp);
  assert(result.ok, `config migrate should succeed: ${JSON.stringify(result.data)}`);

  const config = readProjectConfig(tmp);
  const workflowNames = Object.keys(config.workflows).sort();
  assert(arraysEqual(workflowNames, ['bugfix', 'execute-only', 'full', 'plan-only', 'product-spec', 'quick', 'standard', 'technical-spec']), `unexpected workflows: ${workflowNames.join(', ')}`);
  assert(config.review.level === 'standard', 'review.level should default to standard');
  assert(!config.review.softness, 'review.softness must not be written in final config');
  assert(config.workflows.standard.phases[0].review.maxCycles === 3, 'standard plan review should use 3 cycles');
  assert(config.workflows.standard.phases[0].review.readiness === 'fixme-plan-readiness', 'standard plan review should use readiness triage before full review escalation');
  assert(config.workflows.standard.phases[1].review.maxCycles === 3, 'standard implement review should use 3 cycles');
  assert(!config.workflows.quick.phases.some(phase => phase.review), 'quick should have no review blocks');
  assert(phaseNames(config.workflows.full) === 'product-spec -> technical-spec -> plan -> implement -> verify', `full phases should be feature lifecycle, got ${phaseNames(config.workflows.full)}`);
  assert(phaseNames(config.workflows.bugfix) === 'investigate -> research -> plan -> implement -> verify', `bugfix phases should be investigate workflow, got ${phaseNames(config.workflows.bugfix)}`);
  assert(!config.workflows.default, 'removed default workflow should not be written');
  assert(!config.workflows.plan, 'removed plan workflow should not be written');
  assert(!config.workflows.execute, 'removed execute workflow should not be written');
  assert(!config.workflows['idea-to-production'], 'removed idea-to-production workflow should not be written');
});

test('config migrate upgrades legacy standard workflow with plan readiness', () => {
  const tmp = createTmpDir();
  const generated = runInDir('config migrate', tmp);
  assert(generated.ok, `initial config migrate should succeed: ${JSON.stringify(generated.data)}`);

  const config = readProjectConfig(tmp);
  delete config.workflows.standard.phases[0].review.readiness;
  config.workflows.standard.phases[0].review.maxCycles = 5;
  writeProjectConfig(tmp, config);

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `config migrate should upgrade legacy standard workflow: ${JSON.stringify(result.data)}`);
  assert(result.data.migrated === true, 'migration should report a config write');
  assert(result.data.addedWorkflows.length === 0, 'legacy standard upgrade should not add workflows');

  const migrated = readProjectConfig(tmp);
  assert(migrated.workflows.standard.phases[0].review.readiness === 'fixme-plan-readiness', 'legacy standard plan review should gain readiness triage');
  assert(migrated.workflows.standard.phases[0].review.maxCycles === 5, 'legacy standard migration should preserve existing plan maxCycles');
});

test('config migrate leaves custom standard workflow without readiness unchanged', () => {
  const tmp = createTmpDir();
  const generated = runInDir('config migrate', tmp);
  assert(generated.ok, `initial config migrate should succeed: ${JSON.stringify(generated.data)}`);

  const config = readProjectConfig(tmp);
  config.workflows.standard.phases[0].review.skills = ['custom-plan-review', 'fixme-handle-plan-review'];
  delete config.workflows.standard.phases[0].review.readiness;
  writeProjectConfig(tmp, config);

  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  assert(result.ok, `config migrate should accept custom standard workflow: ${JSON.stringify(result.data)}`);
  assert(result.data.migrated === false, 'custom standard workflow should not be migrated');

  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  assert(after === before, 'custom standard workflow config should not be rewritten');
});

test('task init auto-migrates legacy standard workflow on first use', () => {
  const projectRoot = createTmpDir();
  const generated = runInDir('config migrate', projectRoot);
  assert(generated.ok, `initial config migrate should succeed: ${JSON.stringify(generated.data)}`);

  const config = readProjectConfig(projectRoot);
  delete config.workflows.standard.phases[0].review.readiness;
  writeProjectConfig(projectRoot, config);

  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'legacy-standard-ticket', 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(initialized.ok, `task init should succeed and migrate config, got: ${JSON.stringify(initialized.data)}`);

  const migrated = readProjectConfig(projectRoot);
  assert(migrated.workflows.standard.phases[0].review.readiness === 'fixme-plan-readiness', 'first standard workflow use should add readiness triage');
});

test('task init does not rewrite current config on first use', () => {
  const projectRoot = createTmpDir();
  const generated = runInDir('config migrate', projectRoot);
  assert(generated.ok, `initial config migrate should succeed: ${JSON.stringify(generated.data)}`);

  const before = fs.readFileSync(path.join(projectRoot, '.fixme', 'config.json'), 'utf8');
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'current-config-ticket', 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" ${pipelineResolutionFlag('standard')} --project-root "${projectRoot}"`, projectRoot);
  assert(initialized.ok, `task init should succeed without migrating config, got: ${JSON.stringify(initialized.data)}`);

  const after = fs.readFileSync(path.join(projectRoot, '.fixme', 'config.json'), 'utf8');
  assert(after === before, 'current config should not be rewritten on workflow use');
});

test('config migrate rejects obsolete config keys without conversion', () => {
  const cases = [
    {
      name: 'pipelines',
      expectedConfigPath: 'pipelines',
      config: { pipelines: { standard: [{ name: 'plan', skills: ['fixme-write-plan'] }] } },
    },
    {
      name: 'workflowControls',
      expectedConfigPath: 'workflowControls',
      config: { workflowControls: { standard: { outerMaxCycles: 3 } } },
    },
    {
      name: 'sub_repos',
      expectedConfigPath: 'sub_repos',
      config: { sub_repos: ['frontend'] },
    },
    {
      name: 'workflow alias default',
      expectedConfigPath: 'workflows.default',
      config: { workflows: { default: workflowWithPhases([{ name: 'plan', skills: ['fixme-write-plan'] }]) } },
    },
    {
      name: 'workflow alias default empty object',
      expectedConfigPath: 'workflows.default',
      config: { workflows: { default: {} } },
    },
    {
      name: 'workflow alias plan',
      expectedConfigPath: 'workflows.plan',
      config: { workflows: { plan: workflowWithPhases([{ name: 'plan', skills: ['fixme-write-plan'] }]) } },
    },
    {
      name: 'workflow alias execute',
      expectedConfigPath: 'workflows.execute',
      config: { workflows: { execute: workflowWithPhases([{ name: 'implement', skills: ['fixme-execute-plan'] }]) } },
    },
    {
      name: 'workflow alias idea-to-production',
      expectedConfigPath: 'workflows.idea-to-production',
      config: { workflows: { 'idea-to-production': workflowWithPhases([{ name: 'product-spec', skills: ['fixme-write-product-spec'] }]) } },
    },
    {
      name: 'review softness',
      expectedConfigPath: 'review.softness',
      config: { review: { softness: { default: 'default' } } },
    },
  ];

  for (const testCase of cases) {
    const tmp = createTmpDir();
    writeProjectConfig(tmp, testCase.config);
    const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
    const result = runInDir('config migrate', tmp);
    const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

    assert(!result.ok, `${testCase.name} should fail`);
    assert(result.data && result.data.error === 'unsupported_obsolete_config', `${testCase.name} should return unsupported_obsolete_config: ${JSON.stringify(result.data)}`);
    assert(result.data.configPath === testCase.expectedConfigPath, `${testCase.name} should report ${testCase.expectedConfigPath}, got ${JSON.stringify(result.data)}`);
    assert(before === after, `${testCase.name} failed migration should not write config`);
  }
});

test('config read commands reject obsolete config keys without conversion', () => {
  const commands = [
    'config get',
    'config review-level resolve',
  ];

  for (const command of commands) {
    const tmp = createTmpDir();
    writeProjectConfig(tmp, {
      workflows: { standard: workflowWithPhases([{ name: 'plan', skills: ['fixme-write-plan'] }]) },
      pipelines: { standard: [{ name: 'plan', skills: ['fixme-write-plan'] }] },
    });
    const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
    const result = runInDir(command, tmp);
    const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

    assert(!result.ok, `${command} should reject obsolete config`);
    assert(result.data && result.data.error === 'unsupported_obsolete_config', `${command} should return unsupported_obsolete_config: ${JSON.stringify(result.data)}`);
    assert(result.data.configPath === 'pipelines', `${command} should report pipelines path: ${JSON.stringify(result.data)}`);
    assert(before === after, `${command} should not write config`);
  }
});

test('config migrate rejects non-final full workflow shapes without conversion', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      full: workflowWithPhases(STANDARD_PIPELINES.full.slice(0, 4)),
    },
  });
  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

  assert(!result.ok, 'non-final full workflow should fail instead of being converted');
  assert(result.data && result.data.error === 'workflow_name_conflict', `expected workflow_name_conflict, got ${JSON.stringify(result.data)}`);
  assert(path.isAbsolute(result.data.path), `workflow conflict should include absolute path, got ${JSON.stringify(result.data)}`);
  assert(before === after, 'failed migration should not write config');
});

test('config migrate requires exact final full phase names and primary skills', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      full: workflowWithPhases([
        { name: 'product-spec', skills: ['fixme-write-product-spec'] },
        { name: 'technical-spec', skills: ['fixme-write-plan'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
        { name: 'implement', skills: ['fixme-execute-plan'] },
        { name: 'verify', skills: ['fixme-browser-verify'] },
      ]),
    },
  });
  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

  assert(!result.ok, 'final full with wrong primary skill should fail instead of being accepted');
  assert(result.data && result.data.error === 'workflow_name_conflict', `expected workflow_name_conflict, got ${JSON.stringify(result.data)}`);
  assert(path.isAbsolute(result.data.path), `workflow conflict should include absolute path, got ${JSON.stringify(result.data)}`);
  assert(before === after, 'failed migration should not write config');
});

test('config migrate rejects invalid final review levels before writing', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    review: { level: 'panic' },
  });
  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

  assert(!result.ok, 'invalid final review.level should fail');
  assert(result.data && result.data.error === 'invalid_review_level', `expected JSON invalid_review_level, got ${JSON.stringify(result.data)}`);
  assert(path.isAbsolute(result.data.path), `invalid review.level error should include absolute path, got ${JSON.stringify(result.data)}`);
  assert(before === after, 'invalid final review.level should not be written');
});

test('config migrate invalid final review-level errors include absolute path for every final surface', () => {
  const cases = [
    {
      name: 'workflow',
      config: { workflows: { standard: workflowWithPhases([{ name: 'plan', skills: ['fixme-write-plan'] }], { review: { level: 'panic' } }) } },
    },
    {
      name: 'phase',
      config: { workflows: { standard: workflowWithPhases([{ name: 'plan', skills: ['fixme-write-plan'], review: { level: 'panic' } }]) } },
    },
    {
      name: 'pullRequestComments',
      config: { pullRequestComments: { review: { level: 'panic' } } },
    },
  ];

  for (const testCase of cases) {
    const tmp = createTmpDir();
    writeProjectConfig(tmp, testCase.config);
    const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
    const result = runInDir('config migrate', tmp);
    const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

    assert(!result.ok, `${testCase.name} invalid review level should fail`);
    assert(result.data && result.data.error === 'invalid_review_level', `${testCase.name} should return invalid_review_level: ${JSON.stringify(result.data)}`);
    assert(path.isAbsolute(result.data.path), `${testCase.name} invalid review-level error should include absolute path: ${JSON.stringify(result.data)}`);
    assert(before === after, `${testCase.name} invalid migration should not write config`);
  }
});

test('config set and workflow configure validate final review level fields', () => {
  const tmp = createTmpDir();

  let result = runInDir('config set review.level "\\"lenient\\""', tmp);
  assert(result.ok, `review.level should be accepted: ${JSON.stringify(result.data)}`);
  result = runInDir('config set workflows.standard.review.level "\\"strict\\""', tmp);
  assert(result.ok, `workflow review.level should be accepted: ${JSON.stringify(result.data)}`);
  result = runInDir('config set pullRequestComments.review.level "\\"fast-track\\""', tmp);
  assert(result.ok, `PR review.level should be accepted: ${JSON.stringify(result.data)}`);

  const workflow = JSON.stringify({
    review: { level: 'critical' },
    phases: [
      { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan'], level: 'strict' } },
    ],
  });
  result = runInDir(`config workflow configure custom --data '${workflow}'`, tmp);
  assert(result.ok, `workflow configure should accept review levels: ${JSON.stringify(result.data)}`);

  const config = readProjectConfig(tmp);
  assert(config.review.level === 'lenient', 'top-level review.level should be written');
  assert(config.workflows.standard.review.level === 'strict', 'workflow review.level should be written');
  assert(config.pullRequestComments.review.level === 'fast-track', 'PR review.level should be written');
  assert(config.workflows.custom.review.level === 'critical', 'workflow configure should preserve workflow-level review.level');
  assert(config.workflows.custom.phases[0].review.level === 'strict', 'workflow configure should preserve phase review.level');

  result = runInDir('config set review.level "\\"panic\\""', tmp);
  assert(!result.ok, 'invalid review.level should fail');
  const obsoleteReviewKey = ['review', 'softness', 'default'].join('.');
  result = runInDir(`config set ${obsoleteReviewKey} "\\"strict\\""`, tmp);
  assert(!result.ok, 'obsolete review filter key should be unsupported');
  const obsoleteModeKey = ['review', 'mode'].join('.');
  result = runInDir(`config set ${obsoleteModeKey} "\\"lenient\\""`, tmp);
  assert(!result.ok, 'obsolete review mode key should be unsupported');
  const obsoleteScopeKey = ['fix', 'Scope', 'default'].join('.');
  result = runInDir(`config set ${obsoleteScopeKey} "\\"current\\""`, tmp);
  assert(!result.ok, 'obsolete scope key should be unsupported');
});

test('config set ticketBackend rejects fixme-tickets-linear with a clear error', () => {
  const workspace = createTmpDir();
  const result = runInDir(`config set ticketBackend '"fixme-tickets-linear"'`, workspace);
  assert(!result.ok, 'config set fixme-tickets-linear should fail');
  assert(
    result.data && typeof result.data.error === 'string' &&
      result.data.error.includes('fixme-tickets-md') &&
      !result.data.error.includes('fixme-tickets-linear'),
    `error must name only fixme-tickets-md, got ${JSON.stringify(result.data)}`
  );
  const ok = runInDir(`config set ticketBackend '"fixme-tickets-md"'`, workspace);
  assert(ok.ok, `fixme-tickets-md must still be accepted, got ${JSON.stringify(ok.data)}`);
});

test('config set accepts subRepos and rejects obsolete sub_repos', () => {
  const tmp = createTmpDir();

  let result = runInDir(`config set subRepos '["frontend","backend"]'`, tmp);
  assert(result.ok, `subRepos should be accepted: ${JSON.stringify(result.data)}`);

  const config = readProjectConfig(tmp);
  assert(arraysEqual(config.subRepos, ['frontend', 'backend']), `subRepos should be written as camelCase: ${JSON.stringify(config)}`);
  assert(!Object.prototype.hasOwnProperty.call(config, 'sub_repos'), 'config set must not write sub_repos');

  const obsoleteRoot = createTmpDir();
  result = runInDir(`config set sub_repos '["frontend"]'`, obsoleteRoot);
  assert(!result.ok, 'obsolete sub_repos should be rejected');
  assert(result.data.error.includes('Unsupported config key'), `sub_repos error should be unsupported key, got ${result.data.error}`);
  assert(!fs.existsSync(path.join(obsoleteRoot, '.fixme', 'config.json')), 'rejected sub_repos write should not create config');
});

test('config writes and migration reject obsolete nested review fields', () => {
  const basePhase = { name: 'plan', skills: ['fixme-write-plan'] };
  const phaseSoftnessWorkflow = JSON.stringify({
    phases: [
      { ...basePhase, review: { skills: ['fixme-review-plan'], softness: 'lenient' } },
    ],
  });
  const workflowSoftnessWorkflow = JSON.stringify({
    review: { softness: 'strict' },
    phases: [basePhase],
  });
  const workflowModeWorkflow = JSON.stringify({
    review: { mode: 'lenient' },
    phases: [basePhase],
  });

  const writeCases = [
    {
      name: 'workflow configure phase review softness',
      command: `config workflow configure custom --data '${phaseSoftnessWorkflow}'`,
      expectedNeedle: 'softness',
    },
    {
      name: 'workflow configure workflow review softness',
      command: `config workflow configure custom --data '${workflowSoftnessWorkflow}'`,
      expectedNeedle: 'softness',
    },
    {
      name: 'workflow configure workflow review mode',
      command: `config workflow configure custom --data '${workflowModeWorkflow}'`,
      expectedNeedle: 'mode',
    },
    {
      name: 'config set workflow object with phase review softness',
      command: `config set workflows.custom '${phaseSoftnessWorkflow}'`,
      expectedNeedle: 'softness',
    },
  ];

  for (const testCase of writeCases) {
    const tmp = createTmpDir();
    const result = runInDir(testCase.command, tmp);
    assert(!result.ok, `${testCase.name} should fail`);
    assert(result.data.error.includes(testCase.expectedNeedle), `${testCase.name} error should name obsolete field: ${result.data.error}`);
    assert(!fs.existsSync(path.join(tmp, '.fixme', 'config.json')), `${testCase.name} should not create config`);
  }

  const migrateCases = [
    {
      name: 'top-level review mode',
      expectedConfigPath: 'review.mode',
      config: { review: { mode: 'lenient' } },
    },
    {
      name: 'workflow review softness',
      expectedConfigPath: 'workflows.standard.review.softness',
      config: { workflows: { standard: workflowWithPhases([basePhase], { review: { softness: 'strict' } }) } },
    },
    {
      name: 'workflow review mode',
      expectedConfigPath: 'workflows.standard.review.mode',
      config: { workflows: { standard: workflowWithPhases([basePhase], { review: { mode: 'lenient' } }) } },
    },
    {
      name: 'phase review softness',
      expectedConfigPath: 'workflows.standard.phases[0].review.softness',
      config: { workflows: { standard: workflowWithPhases([{ ...basePhase, review: { skills: ['fixme-review-plan'], softness: 'lenient' } }]) } },
    },
    {
      name: 'phase review mode',
      expectedConfigPath: 'workflows.standard.phases[0].review.mode',
      config: { workflows: { standard: workflowWithPhases([{ ...basePhase, review: { skills: ['fixme-review-plan'], mode: 'lenient' } }]) } },
    },
    {
      name: 'pull request review softness',
      expectedConfigPath: 'pullRequestComments.review.softness',
      config: { pullRequestComments: { review: { softness: 'fast-track' } } },
    },
    {
      name: 'pull request review mode',
      expectedConfigPath: 'pullRequestComments.review.mode',
      config: { pullRequestComments: { review: { mode: 'lenient' } } },
    },
  ];

  for (const testCase of migrateCases) {
    const tmp = createTmpDir();
    writeProjectConfig(tmp, testCase.config);
    const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
    const result = runInDir('config migrate', tmp);
    const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

    assert(!result.ok, `${testCase.name} should fail migration`);
    assert(result.data.error === 'unsupported_obsolete_config', `${testCase.name} should return unsupported_obsolete_config: ${JSON.stringify(result.data)}`);
    assert(result.data.configPath === testCase.expectedConfigPath, `${testCase.name} should report ${testCase.expectedConfigPath}, got ${JSON.stringify(result.data)}`);
    assert(before === after, `${testCase.name} failed migration should not write config`);
  }
});

test('config review-level resolve uses selector validation and fallback order', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    review: { level: 'lenient' },
    workflows: {
      standard: workflowWithPhases([
        { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan'], level: 'strict' } },
        { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code'] } },
      ], { review: { level: 'fast-track' } }),
    },
    pullRequestComments: { review: { level: 'critical' } },
  });

  let result = runInDir('config review-level resolve --workflow standard --phase plan', tmp);
  assert(result.ok, `phase level should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.level === 'strict' && result.data.source === 'phase', 'phase selector should use phase review.level');

  result = runInDir('config review-level resolve --workflow standard --phase implement', tmp);
  assert(result.ok, `workflow level should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.level === 'fast-track' && result.data.source === 'workflow', 'phase without level should use workflow review.level');

  result = runInDir('config review-level resolve', tmp);
  assert(result.ok, `global level should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.level === 'lenient' && result.data.source === 'global', 'no selector should use global review.level');

  result = runInDir('config review-level resolve --path pullRequestComments', tmp);
  assert(result.ok, `PR level should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.level === 'critical' && result.data.source === 'pullRequestComments', 'PR selector should use pullRequestComments review.level');

  result = runInDir('config review-level resolve --workflow nope', tmp);
  assert(!result.ok && result.data.error === 'unknown_workflow', `unknown workflow should return JSON error: ${JSON.stringify(result.data)}`);
  result = runInDir('config review-level resolve --workflow standard --phase nope', tmp);
  assert(!result.ok && result.data.error === 'unknown_phase', `unknown phase should return JSON error: ${JSON.stringify(result.data)}`);
  result = runInDir('config review-level resolve --path nope', tmp);
  assert(!result.ok && result.data.error === 'unknown_review_path', `unknown path should return JSON error: ${JSON.stringify(result.data)}`);
});

test('config review-level resolve warns and skips invalid hand-edited levels', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    review: { level: 'lenient' },
    workflows: {
      standard: workflowWithPhases([
        { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan'], level: 'panic' } },
      ], { review: { level: 'bogus' } }),
    },
  });

  const result = runInDir('config review-level resolve --workflow standard --phase plan', tmp);
  assert(result.ok, `resolver should skip invalid hand edits: ${JSON.stringify(result.data)}`);
  assert(result.data.level === 'lenient', `resolver should fall back to global lenient, got ${result.data.level}`);
  assert(result.data.source === 'global', `resolver source should be global, got ${result.data.source}`);
  assert(result.data.warnings.some(warning => warning.includes('workflows.standard.phases[0].review.level')), 'warning should name invalid phase path');
  assert(result.data.warnings.some(warning => warning.includes('workflows.standard.review.level')), 'warning should name invalid workflow path');
});

test('config review-level resolve handles missing config and obsolete review command', () => {
  const tmp = createTmpDir();

  let result = runInDir('config review-level resolve', tmp);
  assert(result.ok, `missing config should resolve to builtin: ${JSON.stringify(result.data)}`);
  assert(result.data.level === 'standard', 'missing config should use builtin standard');
  assert(result.data.source === 'builtin', 'missing config should report builtin source');
  assert(result.data.configExists === false, 'missing config should report configExists false');

  result = runInDir(`config ${['soft', 'ness'].join('')} resolve`, tmp);
  assert(!result.ok, 'obsolete review resolver should fail');
  assert(result.data.error.includes('config review-level resolve'), `obsolete command should point to new resolver: ${result.data.error}`);
});

test('defaultReviewCyclesForPhase uses 3 cycles for implement', () => {
  assert(defaultReviewCyclesForPhase('implement') === 3, 'implement review cycles should default to 3');
  assert(defaultReviewCyclesForPhase('plan') === 3, 'plan review cycles should default to 3');
});

test('STANDARD_PIPELINES exports final workflow names', () => {
  const names = Object.keys(STANDARD_PIPELINES).sort();
  assert(arraysEqual(names, ['bugfix', 'execute-only', 'full', 'plan-only', 'product-spec', 'quick', 'standard', 'technical-spec']), `unexpected exported workflows: ${names.join(', ')}`);
  assert(phaseNames({ phases: STANDARD_PIPELINES.standard }) === 'plan -> implement', 'standard should be plan -> implement');
  assert(STANDARD_PIPELINES.standard[0].review.readiness === 'fixme-plan-readiness', 'standard plan review should dispatch readiness triage first');
  assert(arraysEqual(STANDARD_PIPELINES.standard[0].review.skills, ['fixme-review-plan', 'fixme-handle-plan-review']), 'standard full plan review escalation chain should remain available');
  assert(!Object.prototype.hasOwnProperty.call(STANDARD_PIPELINES.full[2].review, 'readiness'), 'full workflow should keep explicit full plan review by default');
  assert(!Object.prototype.hasOwnProperty.call(STANDARD_PIPELINES.bugfix[2].review, 'readiness'), 'bugfix workflow should keep explicit full plan review by default');
  assert(phaseNames({ phases: STANDARD_PIPELINES.full }) === 'product-spec -> technical-spec -> plan -> implement -> verify', 'full should be feature lifecycle');
  assert(phaseNames({ phases: STANDARD_PIPELINES.bugfix }) === 'investigate -> research -> plan -> implement -> verify', 'bugfix should be investigate workflow');
  assert(!STANDARD_PIPELINES.quick.some(phase => phase.review), 'quick should have no review blocks');
});

test('config workflow configure rejects invalid cycle counts', () => {
  const tmp = createTmpDir();
  const workflow = JSON.stringify({
    phases: [
      {
        name: 'plan',
        skills: ['fixme-write-plan'],
        review: {
          skills: ['fixme-review-plan'],
          maxCycles: 0
        }
      }
    ],
    outerMaxCycles: 2
  });

  const result = runInDir(`config workflow configure standard --data '${workflow}'`, tmp);
  assert(!result.ok, 'invalid review maxCycles should fail');
  assert(result.data && result.data.error, 'error should be returned');
  assert(result.data.error.includes('positive integer'), `error should explain cycle count: ${result.data.error}`);
});

test('config workflow configure validates plan readiness skill field', () => {
  const tmp = createTmpDir();
  const workflow = JSON.stringify({
    phases: [
      {
        name: 'plan',
        skills: ['fixme-write-plan'],
        review: {
          readiness: 'fixme-plan-readiness',
          skills: ['fixme-review-plan', 'fixme-handle-plan-review'],
          maxCycles: 3,
        },
      },
    ],
  });

  let result = runInDir(`config workflow configure custom --data '${workflow}'`, tmp);
  assert(result.ok, `workflow configure should accept readiness triage: ${JSON.stringify(result.data)}`);
  assert(!result.data.warnings.some(warning => warning.includes('fixme-plan-readiness')), `readiness skill should be known, got warnings ${JSON.stringify(result.data.warnings)}`);
  const config = readProjectConfig(tmp);
  assert(config.workflows.custom.phases[0].review.readiness === 'fixme-plan-readiness', 'readiness skill should be preserved');

  const invalidRoot = createTmpDir();
  const invalidWorkflow = JSON.stringify({
    phases: [
      {
        name: 'plan',
        skills: ['fixme-write-plan'],
        review: {
          readiness: 42,
          skills: ['fixme-review-plan'],
        },
      },
    ],
  });
  result = runInDir(`config workflow configure custom --data '${invalidWorkflow}'`, invalidRoot);
  assert(!result.ok, 'non-string readiness should fail');
  assert(cliErrorMessage(result).includes('review.readiness must be a non-empty string'), `error should explain readiness type, got ${cliErrorMessage(result)}`);
});

test('config workflow writes and migration reject obsolete pipeline phase alias', () => {
  const tmp = createTmpDir();
  const workflow = JSON.stringify({
    pipeline: [
      { name: 'plan', skills: ['fixme-write-plan'] },
    ],
  });

  let result = runInDir(`config workflow configure custom --data '${workflow}'`, tmp);

  assert(!result.ok, 'workflow configure should reject data.pipeline alias');
  assert(result.data.error.includes('workflow configure data must use phases'), `error should mention phases, got ${result.data.error}`);
  assert(!fs.existsSync(path.join(tmp, '.fixme', 'config.json')), 'rejected workflow alias should not create config');

  const workflowWithPhasesAndPipeline = JSON.stringify({
    phases: [
      { name: 'plan', skills: ['fixme-write-plan'] },
    ],
    pipeline: [
      { name: 'implement', skills: ['fixme-execute-plan'] },
    ],
  });

  const setRoot = createTmpDir();
  result = runInDir(`config set workflows.custom '${workflowWithPhasesAndPipeline}'`, setRoot);
  assert(!result.ok, 'config set workflow object should reject data.pipeline alias');
  assert(result.data.error.includes('workflows.custom.pipeline'), `config set error should name obsolete pipeline alias, got ${result.data.error}`);
  assert(!fs.existsSync(path.join(setRoot, '.fixme', 'config.json')), 'rejected workflow object alias should not create config');

  const migrateRoot = createTmpDir();
  writeProjectConfig(migrateRoot, {
    workflows: {
      custom: {
        phases: [
          { name: 'plan', skills: ['fixme-write-plan'] },
        ],
        pipeline: [
          { name: 'implement', skills: ['fixme-execute-plan'] },
        ],
      },
    },
  });
  const before = fs.readFileSync(path.join(migrateRoot, '.fixme', 'config.json'), 'utf8');
  result = runInDir('config migrate', migrateRoot);
  const after = fs.readFileSync(path.join(migrateRoot, '.fixme', 'config.json'), 'utf8');
  assert(!result.ok, 'config migrate should reject workflow data.pipeline alias');
  assert(result.data.error === 'unsupported_obsolete_config', `workflow data.pipeline should return unsupported_obsolete_config: ${JSON.stringify(result.data)}`);
  assert(result.data.configPath === 'workflows.custom.pipeline', `workflow data.pipeline should report path, got ${JSON.stringify(result.data)}`);
  assert(before === after, 'failed workflow data.pipeline migration should not write config');
});

test('config write commands reject removed workflow names before writing config', () => {
  const workflow = JSON.stringify({
    phases: [
      { name: 'plan', skills: ['fixme-write-plan'] },
    ],
  });
  const removedWorkflowNames = ['default', 'plan', 'execute', 'idea-to-production'];

  for (const workflowName of removedWorkflowNames) {
    const setWorkflowRoot = createTmpDir();
    let result = runInDir(`config set workflows.${workflowName} '${workflow}'`, setWorkflowRoot);
    assert(!result.ok, `config set should reject removed workflow name ${workflowName}`);
    assert(result.data.error.includes('Unsupported config key'), `error should reject removed workflow key ${workflowName}, got ${result.data.error}`);
    assert(!fs.existsSync(path.join(setWorkflowRoot, '.fixme', 'config.json')), `rejected removed workflow set should not create config for ${workflowName}`);

    const setWorkflowFieldRoot = createTmpDir();
    result = runInDir(`config set workflows.${workflowName}.outerMaxCycles 4`, setWorkflowFieldRoot);
    assert(!result.ok, `config set nested workflow field should reject removed workflow name ${workflowName}`);
    assert(result.data.error.includes('Unsupported config key'), `nested error should reject removed workflow key ${workflowName}, got ${result.data.error}`);
    assert(!fs.existsSync(path.join(setWorkflowFieldRoot, '.fixme', 'config.json')), `rejected removed workflow field set should not create config for ${workflowName}`);

    const configureRoot = createTmpDir();
    result = runInDir(`config workflow configure ${workflowName} --data '${workflow}'`, configureRoot);
    assert(!result.ok, `workflow configure should reject removed workflow name ${workflowName}`);
    assert(result.data.error.includes('Removed workflow name is not supported'), `workflow configure error should mention removed name ${workflowName}, got ${result.data.error}`);
    assert(!fs.existsSync(path.join(configureRoot, '.fixme', 'config.json')), `rejected removed workflow configure should not create config for ${workflowName}`);
  }
});

test('config workflow configure duplicate phase error uses workflows path', () => {
  const tmp = createTmpDir();
  const workflow = JSON.stringify({
    phases: [
      { name: 'plan', skills: ['fixme-write-plan'] },
      { name: 'plan', skills: ['fixme-review-plan'] },
    ],
  });

  const result = runInDir(`config workflow configure custom --data '${workflow}'`, tmp);

  assert(!result.ok, 'workflow configure should reject duplicate phase names');
  assert(result.data.error.includes('workflows.custom.phases has duplicate phase name'), `error should use workflows path, got ${result.data.error}`);
  assert(!result.data.error.includes('pipelines.'), `error should not mention obsolete pipelines path, got ${result.data.error}`);
});

test('config set validates and writes workflow outerMaxCycles', () => {
  const tmp = createTmpDir();
  const result = runInDir('config set workflows.standard.outerMaxCycles 6', tmp);
  assert(result.ok, `config set should succeed: ${JSON.stringify(result.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(config.workflows.standard.outerMaxCycles === 6, 'outerMaxCycles should be written');
  assert(Array.isArray(config.workflows.standard.phases), 'config set should migrate standard workflows');
  assert(config.workflowControls === undefined, 'config set must not write obsolete workflowControls');
});

test('config set rejects unknown config keys', () => {
  const tmp = createTmpDir();
  const result = runInDir('config set nope.someKey true', tmp);
  assert(!result.ok, 'unknown config key should fail');
  assert(result.data && result.data.error, 'error should be returned');
  assert(result.data.error.includes('Unsupported config key'), `error should mention unsupported key: ${result.data.error}`);
});

test('config set rejects unsupported ticket backend', () => {
  const tmp = createTmpDir();
  const result = runInDir('config set ticketBackend "made-up-backend"', tmp);
  assert(!result.ok, 'unsupported ticket backend should fail');
  assert(result.data && result.data.error, 'error should be returned');
  assert(result.data.error.includes('ticketBackend'), `error should mention ticketBackend: ${result.data.error}`);
});

test('config set validates Linear default priority metadata', () => {
  const tmp = createTmpDir();
  const ok = runInDir(`config set linear.defaultPriority '{"value":3,"label":"Normal"}'`, tmp);
  assert(ok.ok, `linear default priority should be accepted: ${JSON.stringify(ok.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(config.linear.defaultPriority.value === 3, 'default priority value should be written');
  assert(config.linear.defaultPriority.label === 'Normal', 'default priority label should be written');

  const badValue = runInDir(`config set linear.defaultPriority '{"value":0,"label":"None"}'`, tmp);
  assert(!badValue.ok, 'No priority should not be accepted as a default priority');
  assert(badValue.data && badValue.data.error, 'error should be returned');
  assert(badValue.data.error.includes('linear.defaultPriority.value'), `error should mention priority value: ${badValue.data.error}`);

  const badLabel = runInDir(`config set linear.defaultPriority '{"value":2,"label":""}'`, tmp);
  assert(!badLabel.ok, 'empty default priority label should fail');
  assert(badLabel.data && badLabel.data.error, 'error should be returned');
  assert(badLabel.data.error.includes('linear.defaultPriority.label'), `error should mention priority label: ${badLabel.data.error}`);
});

test('config set rejects unsupported model override', () => {
  const tmp = createTmpDir();
  const result = runInDir('config set models.overrides.fixme-task "made-up-model"', tmp);
  assert(!result.ok, 'unsupported model override should fail');
  assert(result.data && result.data.error, 'error should be returned');
  assert(result.data.error.includes('models.overrides.fixme-task'), `error should mention override key: ${result.data.error}`);
});

test('config set validates model runtime', () => {
  const tmp = createTmpDir();
  const ok = runInDir('config set models.runtime "codex"', tmp);
  assert(ok.ok, `codex runtime should be accepted: ${JSON.stringify(ok.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(config.models.runtime === 'codex', `runtime should be codex: ${config.models.runtime}`);

  const bad = runInDir('config set models.runtime "made-up-runtime"', tmp);
  assert(!bad.ok, 'unsupported runtime should fail');
  assert(bad.data && bad.data.error, 'error should be returned');
  assert(bad.data.error.includes('models.runtime'), `error should mention runtime key: ${bad.data.error}`);
});

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

test('findFixmeRoot: respects subRepos config', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    subRepos: ['frontend', 'backend']
  }));
  const subRepo = path.join(workspace, 'frontend');
  fs.mkdirSync(subRepo, { recursive: true });
  // No .git needed when subRepos matches
  const result = findFixmeRoot(subRepo);
  assert(result === workspace, `Should return parent via subRepos match, got ${result}`);
});

test('findFixmeRoot: rejects obsolete sub_repos config', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    sub_repos: ['frontend', 'backend']
  }));
  const subRepo = path.join(workspace, 'frontend');
  fs.mkdirSync(subRepo, { recursive: true });

  let threw = false;
  try {
    findFixmeRoot(subRepo);
  } catch (error) {
    threw = true;
    assert(error instanceof Error, 'obsolete sub_repos should throw an error object');
    assert(error.payload && error.payload.error === 'unsupported_obsolete_config', `sub_repos should throw JSON error payload, got ${JSON.stringify(error.payload)}`);
    assert(error.payload.configPath === 'sub_repos', `sub_repos should report config path, got ${JSON.stringify(error.payload)}`);
  }
  assert(threw, 'obsolete sub_repos should fail root resolution');
});

test('root command reports obsolete sub_repos as JSON error', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    sub_repos: ['frontend']
  }));
  const subRepo = path.join(workspace, 'frontend');
  fs.mkdirSync(subRepo, { recursive: true });

  const result = runInDir('root', subRepo);
  assert(!result.ok, 'root command should fail on obsolete sub_repos');
  assert(result.data && result.data.error === 'unsupported_obsolete_config', `root command should return JSON error, got ${JSON.stringify(result)}`);
  assert(result.data.configPath === 'sub_repos', `root command should report obsolete key, got ${JSON.stringify(result.data)}`);
  assert(!result.stderr || !result.stderr.includes('Error:'), `root command should not leak an uncaught stack, got ${result.stderr}`);
});

test('findFixmeRoot: ignores parent .fixme/ when subRepos does not match', () => {
  const workspace = createTmpDir();
  const fixmeDir = path.join(workspace, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    subRepos: ['frontend', 'backend']
  }));
  const unrelated = path.join(workspace, 'scripts');
  fs.mkdirSync(unrelated, { recursive: true });
  // No .git and not in subRepos
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

test('findFixmeRoot: Codex-linked worktree uses canonical workspace .fixme over local stale .fixme', () => {
  const fixture = createCodexLinkedWorktreeFixture();
  withHomeDir(fixture.homeDir, () => {
    const result = findFixmeRoot(fixture.codexRoot);
    assert(result === fixture.workspace, `Should use canonical workspace .fixme, got ${result}`);
  });
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
  assert(result === subDir, `Should fall back when no .git and no subRepos match, got ${result}`);
});

// ============================================================================
// Test Suite: root CLI command
// ============================================================================

console.log('\n=== root CLI command ===\n');

test('root: returns camelCase fixmeRoot and fixmeDir for local .fixme/', () => {
  const tmp = fs.realpathSync(createTmpDir());
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  const result = runInDir('root', tmp);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixmeRoot === tmp, `fixmeRoot should be ${tmp}, got ${result.data.fixmeRoot}`);
  assert(result.data.fixmeDir === path.join(tmp, '.fixme'), `fixmeDir should end with .fixme, got ${result.data.fixmeDir}`);
  assert(!Object.prototype.hasOwnProperty.call(result.data, 'fixme_root'), 'root output should not expose fixme_root');
  assert(!Object.prototype.hasOwnProperty.call(result.data, 'fixme_dir'), 'root output should not expose fixme_dir');
});

test('root: resolves to parent when .fixme/ is in parent and sub-dir has .git', () => {
  const workspace = fs.realpathSync(createTmpDir());
  fs.mkdirSync(path.join(workspace, '.fixme'), { recursive: true });
  const subRepo = path.join(workspace, 'myapp');
  fs.mkdirSync(subRepo, { recursive: true });
  fs.mkdirSync(path.join(subRepo, '.git'), { recursive: true });
  const result = runInDir('root', subRepo);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixmeRoot === workspace, `fixmeRoot should be workspace, got ${result.data.fixmeRoot}`);
  assert(result.data.fixmeDir === path.join(workspace, '.fixme'), `fixmeDir should be in workspace, got ${result.data.fixmeDir}`);
});

test('root: Codex-linked worktree reports canonical workspace .fixme over local stale .fixme', () => {
  const fixture = createCodexLinkedWorktreeFixture();
  withHomeDir(fixture.homeDir, () => {
    const result = runInDir('root', fixture.codexRoot);
    assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
    assert(result.data.fixmeRoot === fixture.workspace, `fixmeRoot should be canonical workspace, got ${result.data.fixmeRoot}`);
    assert(result.data.fixmeDir === fixture.fixmeDir, `fixmeDir should be canonical .fixme, got ${result.data.fixmeDir}`);
  });
});

test('root: falls back to CWD when no .fixme/ found', () => {
  const tmp = fs.realpathSync(createTmpDir());
  const result = runInDir('root', tmp);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixmeRoot === tmp, `fixmeRoot should be CWD, got ${result.data.fixmeRoot}`);
  assert(result.data.fixmeDir === path.join(tmp, '.fixme'), `fixmeDir should be CWD/.fixme, got ${result.data.fixmeDir}`);
});

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
  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline standard`, subRepo);
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

test('multi-root: context load from Codex-linked worktree reads canonical workspace config', () => {
  const fixture = createCodexLinkedWorktreeFixture({
    project: { build: 'bun run build', framework: 'Monorepo (Bun workspaces)' },
  });

  withHomeDir(fixture.homeDir, () => {
    const result = runInDir('context load', fixture.codexRoot);
    assert(result.ok, `context load should succeed, got: ${JSON.stringify(result.data)}`);
    assert(result.data.framework === 'Monorepo (Bun workspaces)', `Should load canonical config, got ${result.data.framework}`);
  });
});

// ============================================================================
// resolve-model tests
// ============================================================================

test('resolve-model: no config returns opus/quality/default', () => {
  const dir = createTmpDir();
  const res = runInDir('resolve-model fixme-write-plan', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.agent === 'fixme-write-plan', `agent: ${res.data.agent}`);
  assert(res.data.runtime === 'claude', `runtime: ${res.data.runtime}`);
  assert(res.data.model === 'opus', `model: ${res.data.model}`);
  assert(res.data.reasoning_effort === 'xhigh', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'medium', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(executor.data.reasoning_effort === 'medium', `executor reasoning_effort: ${executor.data.reasoning_effort}`);
  assert(executor.data.profile === 'balanced', `executor profile: ${executor.data.profile}`);
  assert(executor.data.source === 'profile', `executor source: ${executor.data.source}`);

  const planner = runInDir('resolve-model fixme-write-plan', dir);
  assert(planner.ok, `exit: ${JSON.stringify(planner)}`);
  assert(planner.data.model === 'opus', `planner model: ${planner.data.model}`);
  assert(planner.data.reasoning_effort === 'xhigh', `planner reasoning_effort: ${planner.data.reasoning_effort}`);
  assert(planner.data.profile === 'balanced', `planner profile: ${planner.data.profile}`);

  const productSpecWriter = runInDir('resolve-model fixme-write-product-spec', dir);
  assert(productSpecWriter.ok, `exit: ${JSON.stringify(productSpecWriter)}`);
  assert(productSpecWriter.data.model === 'opus', `product spec writer model: ${productSpecWriter.data.model}`);
  assert(productSpecWriter.data.profile === 'balanced', `product spec writer profile: ${productSpecWriter.data.profile}`);

  const technicalSpecWriter = runInDir('resolve-model fixme-write-technical-spec', dir);
  assert(technicalSpecWriter.ok, `exit: ${JSON.stringify(technicalSpecWriter)}`);
  assert(technicalSpecWriter.data.model === 'opus', `technical spec writer model: ${technicalSpecWriter.data.model}`);
  assert(technicalSpecWriter.data.profile === 'balanced', `technical spec writer profile: ${technicalSpecWriter.data.profile}`);
});

test('resolve-model: codex quality controls effort only and omits model', () => {
  const dir = createTmpDir();
  const res = runInDir('resolve-model fixme-execute-plan --runtime codex', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.runtime === 'codex', `runtime: ${res.data.runtime}`);
  assert(res.data.model === null, `codex model should be null, got: ${res.data.model}`);
  assert(res.data.reasoning_effort === 'medium', `reasoning_effort: ${res.data.reasoning_effort}`);
  assert(res.data.profile === 'quality', `profile: ${res.data.profile}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: codex balanced maps planners to xhigh and executors to medium', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'balanced' }
  }));

  const planner = runInDir('resolve-model fixme-write-plan --runtime codex', dir);
  assert(planner.ok, `exit: ${JSON.stringify(planner)}`);
  assert(planner.data.model === null, `planner codex model should be null, got: ${planner.data.model}`);
  assert(planner.data.reasoning_effort === 'xhigh', `planner reasoning_effort: ${planner.data.reasoning_effort}`);
  assert(planner.data.source === 'profile', `planner source: ${planner.data.source}`);

  const reviewer = runInDir('resolve-model fixme-review-code --runtime codex', dir);
  assert(reviewer.ok, `exit: ${JSON.stringify(reviewer)}`);
  assert(reviewer.data.model === null, `reviewer codex model should be null, got: ${reviewer.data.model}`);
  assert(reviewer.data.reasoning_effort === 'xhigh', `reviewer reasoning_effort: ${reviewer.data.reasoning_effort}`);

  const executor = runInDir('resolve-model fixme-execute-plan --runtime codex', dir);
  assert(executor.ok, `exit: ${JSON.stringify(executor)}`);
  assert(executor.data.model === null, `executor codex model should be null, got: ${executor.data.model}`);
  assert(executor.data.reasoning_effort === 'medium', `executor reasoning_effort: ${executor.data.reasoning_effort}`);

  const browserVerifier = runInDir('resolve-model fixme-browser-verify --runtime codex', dir);
  assert(browserVerifier.ok, `exit: ${JSON.stringify(browserVerifier)}`);
  assert(browserVerifier.data.model === null, `browser verifier codex model should be null, got: ${browserVerifier.data.model}`);
  assert(browserVerifier.data.reasoning_effort === 'high', `browser verifier reasoning_effort: ${browserVerifier.data.reasoning_effort}`);
});

test('resolve-model: codex budget maps heavy agents to high and execution agents to medium', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'budget' }
  }));

  const planner = runInDir('resolve-model fixme-write-plan --runtime codex', dir);
  assert(planner.ok, `exit: ${JSON.stringify(planner)}`);
  assert(planner.data.reasoning_effort === 'high', `planner reasoning_effort: ${planner.data.reasoning_effort}`);

  const executor = runInDir('resolve-model fixme-execute-plan --runtime codex', dir);
  assert(executor.ok, `exit: ${JSON.stringify(executor)}`);
  assert(executor.data.reasoning_effort === 'medium', `executor reasoning_effort: ${executor.data.reasoning_effort}`);
});

test('resolve-model: inherit profile omits runtime controls', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'inherit' }
  }));

  const claude = runInDir('resolve-model fixme-write-plan', dir);
  assert(claude.ok, `exit: ${JSON.stringify(claude)}`);
  assert(claude.data.model === 'inherit', `claude model: ${claude.data.model}`);
  assert(claude.data.reasoning_effort === null, `claude reasoning_effort: ${claude.data.reasoning_effort}`);
  assert(claude.data.source === 'profile', `claude source: ${claude.data.source}`);

  const codex = runInDir('resolve-model fixme-write-plan --runtime codex', dir);
  assert(codex.ok, `exit: ${JSON.stringify(codex)}`);
  assert(codex.data.model === null, `codex model: ${codex.data.model}`);
  assert(codex.data.reasoning_effort === null, `codex reasoning_effort: ${codex.data.reasoning_effort}`);
  assert(codex.data.source === 'profile', `codex source: ${codex.data.source}`);
});

test('resolve-model uses review-grade effort for plan readiness checker', () => {
  const tmp = createTmpDir();

  let result = runInDir('resolve-model fixme-plan-readiness --runtime claude', tmp);
  assert(result.ok, `Claude readiness model should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.model === 'opus', `quality readiness model should be opus, got ${result.data.model}`);
  assert(result.data.reasoning_effort === 'xhigh', `readiness checker should use xhigh Claude reasoning, got ${result.data.reasoning_effort}`);

  result = runInDir('resolve-model fixme-plan-readiness --runtime codex', tmp);
  assert(result.ok, `Codex readiness model should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.model === null, 'Codex readiness model should not pin a model');
  assert(result.data.reasoning_effort === 'xhigh', `readiness checker should use xhigh Codex reasoning, got ${result.data.reasoning_effort}`);

  const budgetRoot = createTmpDir();
  writeProjectConfig(budgetRoot, { models: { profile: 'budget' } });
  result = runInDir('resolve-model fixme-plan-readiness --runtime claude', budgetRoot);
  assert(result.ok, `budget readiness model should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.model === 'sonnet', `budget readiness model should be sonnet, got ${result.data.model}`);
  assert(result.data.reasoning_effort === 'xhigh', `budget readiness should keep xhigh reasoning, got ${result.data.reasoning_effort}`);
});

test('resolve-model: spec reviewer follows reviewer profile mapping', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'budget' }
  }));
  const res = runInDir('resolve-model fixme-review-spec', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.model === 'sonnet', `model: ${res.data.model}`);
  assert(res.data.reasoning_effort === 'xhigh', `reasoning_effort: ${res.data.reasoning_effort}`);
  assert(res.data.profile === 'budget', `profile: ${res.data.profile}`);
  assert(res.data.source === 'profile', `source: ${res.data.source}`);
});

test('resolve-model: spec writers follow writer profile mapping', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'budget' }
  }));

  const productSpecWriter = runInDir('resolve-model fixme-write-product-spec', dir);
  assert(productSpecWriter.ok, `exit: ${JSON.stringify(productSpecWriter)}`);
  assert(productSpecWriter.data.model === 'sonnet', `product spec writer model: ${productSpecWriter.data.model}`);
  assert(productSpecWriter.data.reasoning_effort === 'xhigh', `product spec writer reasoning_effort: ${productSpecWriter.data.reasoning_effort}`);
  assert(productSpecWriter.data.profile === 'budget', `product spec writer profile: ${productSpecWriter.data.profile}`);
  assert(productSpecWriter.data.source === 'profile', `product spec writer source: ${productSpecWriter.data.source}`);

  const technicalSpecWriter = runInDir('resolve-model fixme-write-technical-spec', dir);
  assert(technicalSpecWriter.ok, `exit: ${JSON.stringify(technicalSpecWriter)}`);
  assert(technicalSpecWriter.data.model === 'sonnet', `technical spec writer model: ${technicalSpecWriter.data.model}`);
  assert(technicalSpecWriter.data.reasoning_effort === 'xhigh', `technical spec writer reasoning_effort: ${technicalSpecWriter.data.reasoning_effort}`);
  assert(technicalSpecWriter.data.profile === 'budget', `technical spec writer profile: ${technicalSpecWriter.data.profile}`);
  assert(technicalSpecWriter.data.source === 'profile', `technical spec writer source: ${technicalSpecWriter.data.source}`);
});

test('resolve-model: spec review handler follows handler profile mapping', () => {
  const dir = createTmpDir();
  const fixmeDir = path.join(dir, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    models: { profile: 'budget' }
  }));
  const res = runInDir('resolve-model fixme-handle-spec-review', dir);
  assert(res.ok, `exit: ${JSON.stringify(res)}`);
  assert(res.data.model === 'sonnet', `model: ${res.data.model}`);
  assert(res.data.reasoning_effort === 'xhigh', `reasoning_effort: ${res.data.reasoning_effort}`);
  assert(res.data.profile === 'budget', `profile: ${res.data.profile}`);
  assert(res.data.source === 'profile', `source: ${res.data.source}`);
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
  assert(res.data.reasoning_effort === 'medium', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'xhigh', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'high', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'xhigh', `reasoning_effort: ${res.data.reasoning_effort}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: rejects obsolete config keys instead of silently using models', () => {
  const dir = createTmpDir();
  writeProjectConfig(dir, {
    models: { profile: 'budget' },
    pipelines: { standard: [{ name: 'plan', skills: ['fixme-write-plan'] }] },
  });

  const res = runInDir('resolve-model fixme-write-plan', dir);
  assert(!res.ok, 'obsolete config should fail model resolution');
  assert(res.data && res.data.error === 'unsupported_obsolete_config', `resolve-model should return unsupported_obsolete_config, got ${JSON.stringify(res.data)}`);
  assert(res.data.configPath === 'pipelines', `resolve-model should report obsolete config path, got ${JSON.stringify(res.data)}`);
});

// ============================================================================
// Codex agent install tests
// ============================================================================

test('codex-agents install: registers agents with working [agents.name] config shape', () => {
  const dir = createTmpDir();
  const agentsSrc = path.join(dir, 'source-agents');
  const codexDir = path.join(dir, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'config.toml'), `[agents]
max_threads = 12
max_depth = 3

# GSD Agent Configuration - managed by get-shit-done installer

[agents.gsd-executor]
description = "Keep existing GSD registration"
config_file = "/Users/denis/.codex/agents/gsd-executor.toml"
`);

  createAgentFile(
    agentsSrc,
    'fixme-task',
    'Config-driven pipeline orchestrator.',
    '<role>\nRead $HOME/.claude/skills/fixme-task/SKILL.md before dispatching.\n</role>'
  );
  createAgentFile(
    agentsSrc,
    'fixme-review-code',
    'Read-only code reviewer.',
    '<role>\nRead ~/.claude/skills/fixme-review-code/SKILL.md before reviewing.\n</role>'
  );
  createAgentFile(
    agentsSrc,
    'fixme-execute-plan',
    'Plan executor.',
    '<role>\nRead ~/.claude/skills/fixme-execute-plan/SKILL.md before executing.\n</role>'
  );

  const result = run(`codex-agents install --agents-src "${agentsSrc}" --codex-dir "${codexDir}"`);
  assert(result.ok, `install should succeed, got: ${JSON.stringify(result)}`);
  assert(result.data.installed === 3, `installed count: ${result.data.installed}`);

  const config = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
  assert(config.includes('[agents.gsd-executor]'), 'existing GSD agent registration should be preserved');
  assert(config.includes('[agents.fixme-task]'), 'fixme-task should use [agents.fixme-task]');
  assert(config.includes('[agents.fixme-review-code]'), 'fixme-review-code should use [agents.fixme-review-code]');
  assert(config.includes('[agents.fixme-execute-plan]'), 'fixme-execute-plan should use [agents.fixme-execute-plan]');
  assert(!config.includes('[[agents]]'), 'Codex config must not use [[agents]] array tables');
  assert(config.includes(`config_file = "${path.join(codexDir, 'agents', 'fixme-task.toml').replace(/\\/g, '/')}"`), 'config_file should be absolute');
  assert(config.indexOf('# Fixme Agent Configuration') < config.indexOf('# GSD Agent Configuration'), 'Fixme block should be inserted before GSD-managed tail block');

  const taskToml = fs.readFileSync(path.join(codexDir, 'agents', 'fixme-task.toml'), 'utf8');
  assert(taskToml.includes('name = "fixme-task"'), 'agent TOML should include name');
  assert(taskToml.includes('description = "Config-driven pipeline orchestrator."'), 'agent TOML should include description');
  assert(taskToml.includes('sandbox_mode = "workspace-write"'), 'fixme-task should get workspace-write sandbox');
  assert(taskToml.includes('model_reasoning_effort = "xhigh"'), 'Codex agent TOML should default to extra-high reasoning');
  assert(taskToml.includes('spawn_agent(agent_type=..., reasoning_effort=..., message=...)'), 'agent TOML should include Codex dispatch adapter with reasoning effort');
  assert(taskToml.includes('resume_agent'), 'agent TOML should mention resume_agent');
  assert(taskToml.includes('send_input'), 'agent TOML should mention send_input');
  assert(taskToml.includes('close_agent'), 'agent TOML should mention close_agent');
  assert(taskToml.includes('runtimeHandle'), 'agent TOML should mention runtimeHandle recording');
  assert(!taskToml.includes('\nmodel = '), 'Codex agent TOML must not pin a model');
  assert(taskToml.includes('$HOME/.codex/skills/fixme-task/SKILL.md'), 'agent TOML should rewrite Claude skill paths to Codex paths');

  const executeToml = fs.readFileSync(path.join(codexDir, 'agents', 'fixme-execute-plan.toml'), 'utf8');
  assert(executeToml.includes('model_reasoning_effort = "medium"'), 'Codex execute agent TOML should default to medium reasoning');
});

test('codex-agents install: removes stale Fixme agent registrations and TOML files', () => {
  const dir = createTmpDir();
  const agentsSrc = path.join(dir, 'source-agents');
  const codexDir = path.join(dir, '.codex');
  const codexAgentsDir = path.join(codexDir, 'agents');
  fs.mkdirSync(codexAgentsDir, { recursive: true });
  fs.writeFileSync(path.join(codexAgentsDir, 'fixme-stale.toml'), 'name = "fixme-stale"\n');
  fs.writeFileSync(path.join(codexAgentsDir, 'fixme-stale.md'), 'stale\n');
  fs.writeFileSync(path.join(codexDir, 'config.toml'), `# user config

[agents.fixme-stale]
description = "Old stale agent"
config_file = "/tmp/fixme-stale.toml"

# Fixme Agent Configuration - managed by fixme installer

[agents.fixme-old]
description = "Old managed agent"
config_file = "/tmp/fixme-old.toml"
# /Fixme Agent Configuration
`);

  createAgentFile(
    agentsSrc,
    'fixme-task',
    'Config-driven pipeline orchestrator.',
    '<role>\nCurrent task agent.\n</role>'
  );

  const result = run(`codex-agents install --agents-src "${agentsSrc}" --codex-dir "${codexDir}"`);
  assert(result.ok, `install should succeed, got: ${JSON.stringify(result)}`);

  const config = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
  assert(!config.includes('[agents.fixme-stale]'), 'leaked stale Fixme registration should be removed');
  assert(!config.includes('[agents.fixme-old]'), 'old managed Fixme registration should be removed');
  assert(config.includes('[agents.fixme-task]'), 'current Fixme registration should be present');
  assert(!fs.existsSync(path.join(codexAgentsDir, 'fixme-stale.toml')), 'stale Fixme TOML should be removed');
  assert(!fs.existsSync(path.join(codexAgentsDir, 'fixme-stale.md')), 'stale Fixme markdown should be removed');
  assert(fs.existsSync(path.join(codexAgentsDir, 'fixme-task.toml')), 'current Fixme TOML should be written');
});

// ============================================================================
// Codex skill install tests
// ============================================================================

test('codex-skills install: writes Codex-adapted skills and cleans stale copies', () => {
  const dir = createTmpDir();
  const skillsSrc = path.join(dir, 'source-skills');
  const codexDir = path.join(dir, '.codex');
  const codexSkillsDir = path.join(codexDir, 'skills');
  fs.mkdirSync(path.join(codexSkillsDir, 'fixme-stale'), { recursive: true });
  fs.writeFileSync(path.join(codexSkillsDir, 'fixme-stale', 'SKILL.md'), 'stale\n');

  const taskDir = createSkillFile(
    skillsSrc,
    'fixme-task',
    [
      'Dispatch with Agent(subagent_type="fixme-write-plan", prompt="write plan").',
      'Then call Skill("fixme-review-plan", args="review").',
      'Prepare with node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare --data \'{"runtime":"claude","agentName":"fixme-task"}\'.',
      'Read $HOME/.claude/skills/fixme-task/SKILL.md and ~/.claude/rules/spec-review-rules.md.',
    ].join('\n')
  );
  fs.mkdirSync(path.join(taskDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'references', 'dispatch.md'), 'Use .claude/skills/fixme-task/SKILL.md\n');

  const ticketsDir = createSkillFile(
    skillsSrc,
    'fixme-tickets-md',
    'Ticket backend skill.'
  );
  createSkillFile(skillsSrc, 'fixme-handle-plan-review', 'Handler.');
  fs.mkdirSync(path.join(ticketsDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(ticketsDir, 'scripts', 'private.cjs'), 'console.log("do not install");\n');

  const result = run(`codex-skills install --skills-src "${skillsSrc}" --codex-dir "${codexDir}"`);
  assert(result.ok, `install should succeed, got: ${JSON.stringify(result)}`);
  assert(result.data.installed === 3, `installed count: ${result.data.installed}`);
  assert(result.data.removed === 1, `removed count: ${result.data.removed}`);

  const installedTask = fs.readFileSync(path.join(codexSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const installedHandler = fs.readFileSync(path.join(codexSkillsDir, 'fixme-handle-plan-review', 'SKILL.md'), 'utf8');
  assert(installedTask.includes('<codex_skill_adapter>'), 'installed skill should include Codex adapter');
  assert(installedTask.includes('spawn_agent(agent_type="X", reasoning_effort="{resolved-reasoning-effort}", message="Y")'), 'adapter should map Agent dispatch to spawn_agent with reasoning effort');
  assert(installedTask.includes('resume_agent'), 'installed Codex task skill should mention resume_agent');
  assert(installedTask.includes('send_input'), 'installed Codex task skill should mention send_input');
  assert(installedTask.includes('close_agent'), 'installed Codex task skill should mention close_agent');
  assert(installedTask.includes('runtimeHandle'), 'installed Codex task skill should mention runtimeHandle recording');
  assert(installedTask.includes('resolve-model X --runtime codex'), 'adapter should resolve Codex runtime profile settings');
  assert(installedTask.includes('include `"runtime":"codex"` in every `lifecycle dispatch prepare` JSON payload'), 'adapter should force Codex runtime into lifecycle dispatch prepare payloads');
  assert(installedTask.includes('When Fixme source instructions require a live manifest task list, use Codex `update_plan`'), 'adapter should map live manifest task lists to Codex update_plan');
  assert(installedTask.includes('If `update_plan` is unavailable, stop with a manifest-tool blocker instead of tracking the manifest in prose'), 'adapter should fail closed when Codex manifest tooling is unavailable');
  assert(installedTask.includes('"runtime":"codex","agentName":"fixme-task"'), 'Codex installed skill bodies should rewrite lifecycle runtime payloads to codex');
  assert(installedTask.includes('Skill("name", args)'), 'adapter should map Skill invocation');
  assert(installedTask.includes('take precedence over lower source instructions'), 'adapter should declare precedence over Claude-native source rules');
  assert(installedTask.includes('In Codex Plan mode'), 'adapter should limit request_user_input to Plan mode');
  assert(installedTask.includes('do not call `request_user_input`'), 'adapter should forbid request_user_input outside Plan mode');
  assert(installedTask.includes('ask in normal text'), 'adapter should require plain text fallback outside Plan mode');
  assert(installedTask.includes('$HOME/.codex/skills/fixme-task/SKILL.md'), 'source skill body should rewrite Claude paths to Codex paths');
  assert(installedTask.includes('~/.codex/rules/spec-review-rules.md'), 'tilde Claude paths should rewrite to Codex paths');
  assert(!installedTask.includes('$HOME/.claude/'), 'installed skill should not retain Claude home paths');
  assert(!installedTask.includes('## Fixme Usage Tracking'), 'fixme-task owns native usage reporting and should not receive generated usage block');
  assert(!installedTask.includes('## Fixme Agent Liveness'), 'fixme-task owns native lifecycle liveness and should not receive generated liveness block');
  assert(!installedTask.includes('liveness ping --status-id'), 'Codex task skill should not use obsolete liveness ping');
  assert(!installedTask.includes('fixme-tools.cjs liveness'), 'Codex task skill should not call obsolete liveness namespace');
  assert(!installedTask.includes('--runtime auto'), 'Codex task skill should not pass --runtime auto');
  assert(!installedTask.includes('--task'), 'usage block must not pass --task');
  assert(!installedTask.includes('pipeline_run_id'), 'Codex installed skill should not use snake_case pipeline_run_id prompt metadata');
  assert(!installedTask.includes('parent_invocation_id'), 'Codex installed skill should not use snake_case parent_invocation_id prompt metadata');
  assert(installedHandler.includes('## Fixme Usage Tracking'), 'handler should include generated usage block');
  assert(installedHandler.includes('## Fixme Agent Liveness'), 'handler should include liveness block');
  assert(installedHandler.includes('run ping --fixme-dir <fixme-dir> --status-id <statusId>'), 'handler liveness block should use run ping');
  assert(installedHandler.includes('If the dispatch prompt does not include `statusId`, skip this liveness block.'), 'handler liveness block should be optional when no statusId exists');
  assert(installedHandler.includes('If `run status` shows `currentCommand` starting with `attention:`'), 'handler liveness block should not ping over active attention');
  assert(installedHandler.includes('--runtime codex'), 'handler usage block should pass --runtime codex');
  assert(installedHandler.includes('--pipeline-run-id <pipelineRunId>'), 'handler usage block should map camelCase prompt metadata to CLI flag');
  assert(installedHandler.includes('If it includes a non-empty `usageSourcePath`, include `--source-path <usageSourcePath>`'), 'handler usage block should propagate runtime counter source paths');
  assert(installedHandler.includes('Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive.'), 'handler usage report line must come before terminal directives');

  const usageBlockCount = (installedTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(usageBlockCount === 0, `fixme-task should not get generated usage blocks, got ${usageBlockCount}`);
  const livenessBlockCount = (installedTask.match(/## Fixme Agent Liveness/g) || []).length;
  assert(livenessBlockCount === 0, `fixme-task should not get generated liveness blocks, got ${livenessBlockCount}`);

  const installedReference = fs.readFileSync(path.join(codexSkillsDir, 'fixme-task', 'references', 'dispatch.md'), 'utf8');
  assert(installedReference.includes('.codex/skills/fixme-task/SKILL.md'), 'markdown references should be path-converted');

  assert(!fs.existsSync(path.join(codexSkillsDir, 'fixme-stale')), 'stale Fixme skill copy should be removed');
  assert(!fs.existsSync(path.join(codexSkillsDir, 'fixme-tickets-md', 'scripts')), 'fixme-tickets-md scripts should not be installed into Codex skills');

  const reinstall = run(`codex-skills install --skills-src "${skillsSrc}" --codex-dir "${codexDir}"`);
  assert(reinstall.ok, `reinstall should succeed, got: ${JSON.stringify(reinstall)}`);
  const reinstalledTask = fs.readFileSync(path.join(codexSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const adapterCount = (reinstalledTask.match(/<codex_skill_adapter>/g) || []).length;
  assert(adapterCount === 1, `adapter should be idempotent, got ${adapterCount}`);
  const reinstallUsageBlockCount = (reinstalledTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(reinstallUsageBlockCount === 0, `fixme-task should still omit generated usage blocks after reinstall, got ${reinstallUsageBlockCount}`);
});

test('claude-skills install: writes Claude skills with usage tracking and cleans stale copies', () => {
  const dir = createTmpDir();
  const skillsSrc = path.join(dir, 'source-skills');
  const claudeDir = path.join(dir, '.claude');
  const claudeSkillsDir = path.join(claudeDir, 'skills');
  fs.mkdirSync(path.join(claudeSkillsDir, 'fixme-stale'), { recursive: true });
  fs.writeFileSync(path.join(claudeSkillsDir, 'fixme-stale', 'SKILL.md'), 'stale\n');

  createSkillFile(skillsSrc, 'fixme-task', 'Task orchestrator.');
  createSkillFile(skillsSrc, 'fixme-review-code', 'Reviewer.');
  createSkillFile(skillsSrc, 'fixme-handle-plan-review', 'Handler.');
  createSkillFile(skillsSrc, 'fixme-howto-code-map', 'Reference.');
  const ticketsDir = createSkillFile(skillsSrc, 'fixme-tickets-md', 'Ticket backend skill.');
  fs.mkdirSync(path.join(ticketsDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(ticketsDir, 'scripts', 'private.cjs'), 'console.log("do not install");\n');

  const result = run(`claude-skills install --skills-src "${skillsSrc}" --claude-dir "${claudeDir}"`);
  assert(result.ok, `install should succeed, got: ${JSON.stringify(result)}`);
  assert(result.data.installed === 5, `installed count: ${result.data.installed}`);
  assert(result.data.removed === 1, `removed count: ${result.data.removed}`);

  const task = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const reviewer = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-review-code', 'SKILL.md'), 'utf8');
  const handler = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-handle-plan-review', 'SKILL.md'), 'utf8');
  const reference = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-howto-code-map', 'SKILL.md'), 'utf8');

  assert(!task.includes('## Fixme Usage Tracking'), 'Claude fixme-task owns native usage reporting and should not receive generated usage block');
  assert(!task.includes('## Fixme Agent Liveness'), 'Claude fixme-task owns native lifecycle liveness and should not receive generated liveness block');
  assert(!task.includes('liveness ping --status-id'), 'Claude liveness block should not use obsolete liveness ping');
  assert(!task.includes('fixme-tools.cjs liveness'), 'Claude liveness block should not call obsolete liveness namespace');
  assert(!task.includes('--runtime auto'), 'Claude usage block should not pass --runtime auto');
  assert(!task.includes('--task'), 'usage block must not pass --task');
  assert(!task.includes('pipeline_run_id'), 'Claude installed skill should not use snake_case pipeline_run_id prompt metadata');
  assert(!task.includes('parent_invocation_id'), 'Claude installed skill should not use snake_case parent_invocation_id prompt metadata');
  assert(reviewer.includes('--role reviewer'), 'fixme-review-* role mapping');
  assert(handler.includes('--role handler'), 'fixme-handle-* role mapping');
  assert(handler.includes('Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive.'), 'handler usage report line must come before terminal directives');
  assert(reviewer.includes('## Fixme Agent Liveness'), 'reviewer should include liveness block');
  assert(handler.includes('## Fixme Agent Liveness'), 'handler should include liveness block');
  assert(reference.includes('--role reference'), 'fixme-howto-* role mapping');
  assert(reference.includes('Only run this block when `fixme-howto-code-map` is the active skill invocation.'), 'reference guard');
  assert(!fs.existsSync(path.join(claudeSkillsDir, 'fixme-tickets-md', 'scripts')), 'fixme-tickets-md scripts should not install');
  const settings = readJson(path.join(claudeDir, 'settings.json'));
  const userPromptHooks = settings.hooks && settings.hooks.UserPromptSubmit;
  assert(Array.isArray(userPromptHooks), 'Claude install should configure UserPromptSubmit hooks');
  assert(
    JSON.stringify(userPromptHooks).includes('usage claude-hook'),
    'Claude install should register the Fixme usage hook that records transcript_path'
  );

  const reinstall = run(`claude-skills install --skills-src "${skillsSrc}" --claude-dir "${claudeDir}"`);
  assert(reinstall.ok, `reinstall should succeed, got: ${JSON.stringify(reinstall)}`);
  const reinstalledTask = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const blockCount = (reinstalledTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(blockCount === 0, `fixme-task should still omit generated usage blocks after reinstall, got ${blockCount}`);
  const livenessBlockCount = (reinstalledTask.match(/## Fixme Agent Liveness/g) || []).length;
  assert(livenessBlockCount === 0, `fixme-task should still omit generated liveness blocks after reinstall, got ${livenessBlockCount}`);
  const reinstalledSettings = readJson(path.join(claudeDir, 'settings.json'));
  const hookConfig = JSON.stringify(reinstalledSettings.hooks.UserPromptSubmit);
  const hookCount = (hookConfig.match(/usage claude-hook/g) || []).length;
  assert(hookCount === 1, `Claude usage hook should be idempotent, got ${hookCount}`);
});

// ============================================================================
// Skill contract tests
// ============================================================================

test('fixme bootstrap skill: routes Fixme-shaped requests to concrete entry points', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme', 'SKILL.md');
  const readmePath = path.resolve(__dirname, '..', '..', '..', '..', 'README.md');
  const claudePath = path.resolve(__dirname, '..', '..', '..', '..', 'CLAUDE.md');
  assert(fs.existsSync(skillPath), 'fixme bootstrap skill should exist');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const claude = fs.readFileSync(claudePath, 'utf8');

  assert(skill.includes('name: fixme'), 'frontmatter name');
  assert(skill.includes('Use first for Fixme-related requests'), 'description should make Fixme routing an early skill-selection trigger');
  assert(skill.includes('FIXME-9 followed by FIXME-10, both standard pipeline'), 'bootstrap should cover bare sequential FIXME references');
  assert(skill.includes('Skill("fixme-task", "--pipeline standard --resume FIXME-9")'), 'first sequential task should route to fixme-task with standard pipeline');
  assert(skill.includes('Skill("fixme-task", "--pipeline standard --resume FIXME-10")'), 'second sequential task should route to fixme-task with standard pipeline');
  assert(skill.includes('Skill("fixme-session"'), 'bug-session requests should route to fixme-session');
  assert(skill.includes('Skill("fixme-pr-comments"'), 'PR comment requests should route to fixme-pr-comments');
  assert(skill.includes('Skill("fixme-rebase"'), 'rebase requests should route to fixme-rebase');
  assert(skill.includes('Skill("fixme-ticket"'), 'ticket creation requests should route to fixme-ticket');
  assert(skill.includes('Skill("fixme-brainstorm"'), 'ambiguous idea requests should route to fixme-brainstorm');
  assert(skill.includes('Do not dispatch more than one `fixme-task` at a time.'), 'sequential task routing should forbid concurrent fixme-task dispatch');
  assert(readme.includes('`/fixme`'), 'README should document the bootstrap router');
  assert(readme.includes('/fixme FIXME-9 followed by FIXME-10, both standard pipeline'), 'README should document sequential FIXME routing');
  assert(claude.includes('fixme/'), 'CLAUDE should list the bootstrap router in the skill suite');
});

test('fixme-ticket skill: defaults tickets without priority signals from config', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-ticket', 'SKILL.md');
  assert(fs.existsSync(skillPath), 'fixme-ticket skill should exist');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('linear.defaultPriority'), 'skill should read the configured default priority');
  assert(skill.includes('No signals -> `linear.defaultPriority.value`'), 'missing priority signals should use configured default priority');
  assert(skill.includes('Do not hardcode `3 - Medium`'), 'skill should forbid hardcoded Medium defaults');
  assert(skill.includes('<defaultPriority.value> - <defaultPriority.label> (config default)'), 'ticket preview should show configured default priority');
});

test('fixme-config skill: configures Linear default issue priority', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-config', 'SKILL.md');
  const schemaPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'references', 'config-schema.md');
  assert(fs.existsSync(skillPath), 'fixme-config skill should exist');
  assert(fs.existsSync(schemaPath), 'config schema should exist');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assert(skill.includes('linear.defaultPriority'), 'fixme-config should mention default priority');
  assert(skill.includes('Configure the default Linear issue priority'), 'fixme-config should ask for a default priority');
  assert(skill.includes('config set linear.defaultPriority'), 'fixme-config should write default priority through fixme-tools');
  assert(skill.includes('Default Linear Priority'), 'confirmation should show the configured priority');
  assert(!skill.includes('This round configures ONLY `linear.teamId` and `linear.teamName`'), 'Linear round must no longer be team-only');
  assert(schema.includes('"defaultPriority": { "value": 3, "label": "Normal" }'), 'schema example should include default priority object');
  assert(schema.includes('| `linear.defaultPriority.value` | number | No | Default non-zero issue priority sent by `/fixme-ticket` when no priority signal is detected. |'), 'schema should document default priority value');
});

test('fixme-usage skill: delegates reports to fixme-tools and never parses JSONL directly', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-usage', 'SKILL.md');
  assert(fs.existsSync(skillPath), 'fixme-usage skill should exist');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('name: fixme-usage'), 'frontmatter name');
  assert(skill.includes('allowed-tools: Bash'), 'only Bash is required');
  assert(skill.includes('usage report --scope'), 'skill should call usage report');
  assert(skill.includes('run the selected report command once as a pre-finalization measurement pass'), 'skill should perform a measurement report before quiet finish');
  assert(skill.includes('usage finish --invocation-id <invocationId> --outcome complete --quiet'), 'skill should finish quietly before rendering report');
  assert(skill.includes('Render only the displayed report JSON'), 'skill should render only the post-finalization report');
  assert(skill.includes('last row labeled `**Total**`'), 'overview By Skill table should put total row at the bottom');
  assert(skill.includes('| **Total** | **3** | **2** | **1** | **145,000** | **20,000** | **165,000** |'), 'overview By Skill total row should bold every cell');
  assert(skill.includes('`totalUsage.nonCachedTokens`, `totalUsage.cachedTokens`, and `totalUsage.totalTokens` from the report JSON'), 'total row should use report token buckets');
  assert(skill.includes('| Skill | Invocations | Measured | Unmeasured | Non-cached usage | Cached input | Total usage |'), 'usage table should separate cached and non-cached usage');
  assert(skill.includes('### By Project'), 'overview should include a By Project section');
  assert(skill.includes('| Project | Invocations | Measured | Unmeasured | Non-cached usage | Cached input | Total usage |'), 'project table should separate cached and non-cached usage');
  assert(skill.includes('byProject[]'), 'project table should render from byProject');
  assert(skill.includes('Sort `bySkill[]` and `byProject[]` rows by `totalUsage.nonCachedTokens` descending'), 'overview should not rank rows by cache-inclusive total only');
  assert(skill.includes('Never parse JSONL directly.'), 'skill should not parse JSONL');
  assert(skill.includes('Never inspect runtime transcripts directly.'), 'skill should not inspect transcripts');
  assert(skill.includes('Do not display `outcomeReason`'), 'markdown reports should hide outcomeReason');
  assert(skill.includes('/fixme-usage global pipeline <pipeline-run-id>'), 'global pipeline form documented');
});

test('documentation: README and fixme-tools skill mention usage reporting', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'README.md'), 'utf8');
  const toolsSkill = fs.readFileSync(path.resolve(__dirname, '..', 'SKILL.md'), 'utf8');
  assert(readme.includes('`/fixme-usage`'), 'README should list /fixme-usage');
  assert(readme.includes('usage report --scope project'), 'README should document usage report command');
  assert(toolsSkill.includes('usage start --skill'), 'fixme-tools skill should document usage start');
  assert(toolsSkill.includes('usage finish --invocation-id'), 'fixme-tools skill should document usage finish');
  assert(toolsSkill.includes('usage report --scope'), 'fixme-tools skill should document usage report');
  assert(toolsSkill.includes('run start --fixme-dir'), 'fixme-tools skill should document run start');
  assert(toolsSkill.includes('run ping --fixme-dir'), 'fixme-tools skill should document run ping');
  assert(toolsSkill.includes('run ping` refuses non-terminal updates that would replace an active `currentCommand: attention:<attentionId>`'), 'fixme-tools skill should document that pings cannot hide pending attention');
  assert(toolsSkill.includes('run status --fixme-dir'), 'fixme-tools skill should document run status');
  assert(toolsSkill.includes('`run status` reads the current JSON file and rejects stored status files with unsupported top-level fields'), 'fixme-tools skill should document persisted run status shape checks');
  assert(toolsSkill.includes('task save --data-file'), 'fixme-tools skill should document task save via data-file');
  assert(toolsSkill.includes('task save` rejects skeletal inputs that are not self-contained handoffs'), 'fixme-tools skill should document task save handoff validation');
  assert(toolsSkill.includes('It also rejects non-empty `openQuestions`'), 'fixme-tools skill should document open question rejection');
  assert(toolsSkill.includes('task init --ticket'), 'fixme-tools skill should document task init for tickets');
  assert(toolsSkill.includes('`task save` and `task init` both require the caller to pass a resolved `pipelineResolution`'), 'fixme-tools skill should document resolved pipeline requirement');
  assert(toolsSkill.includes('task checkpoint --state'), 'fixme-tools skill should document task checkpoint');
  assert(toolsSkill.includes('`task checkpoint` atomically merges allowed camelCase JSON state fields, validates `status`, `cursor`, `loops`, `pendingDecision`, and `producerContinuations` resume-control shapes, and rejects live or derived task-state fields such as `currentSpecificationPath`, `currentStep`, and `manifest` at any depth'), 'fixme-tools skill should document checkpoint shape and forbidden field validation');
  assert(toolsSkill.includes('task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>'), 'fixme-tools skill should document task resolve');
  assert(toolsSkill.includes('task supersede --task <FIXME-N|task.md|state.json> --by <replacement-ref> --reason <reason>'), 'fixme-tools skill should document durable task supersession');
  assert(toolsSkill.includes('run attention set --fixme-dir'), 'fixme-tools skill should document run attention set');
  assert(toolsSkill.includes('run attention answer --fixme-dir'), 'fixme-tools skill should document run attention answer');
  assert(toolsSkill.includes('`run attention set` requires non-empty `ownerSkill`, `kind`, and `promptMarkdown`'), 'fixme-tools skill should document required attention prompt fields');
  assert(toolsSkill.includes('Provided `attentionId` values must be non-empty strings starting with `attn_` and must not contain surrounding whitespace'), 'fixme-tools skill should document provided attention id validation');
  assert(toolsSkill.includes('requires every provided routing string field to be non-empty'), 'fixme-tools skill should document routing field string validation');
  assert(toolsSkill.includes('rejects malformed `metadata` unless it is a JSON object'), 'fixme-tools skill should document attention metadata shape');
  assert(toolsSkill.includes('`run attention set` rejects overlapping pending attention and terminal run states'), 'fixme-tools skill should document attention set invariants');
  assert(toolsSkill.includes("`run attention answer` stores the user's non-empty answer"), 'fixme-tools skill should document non-empty answer requirements');
  assert(toolsSkill.includes('`run attention answer` only accepts the attention currently referenced by `currentCommand`'), 'fixme-tools skill should document stale answer protection');
  assert(toolsSkill.includes('`run attention answer` requires `answerKind: "decision"` or `answerKind: "clarificationRequest"`'), 'fixme-tools skill should document explicit answer kind requirements');
  assert(toolsSkill.includes('`run attention answer` requires `answeredBy: "user"`'), 'fixme-tools skill should document answer attribution requirements');
  assert(toolsSkill.includes('`run attention answer` rejects unsupported answer fields; answer payloads are exactly `answer`, `answeredBy`, and `answerKind`'), 'fixme-tools skill should document closed answer payload shape');
  assert(toolsSkill.includes('For `ownerSkill: "fixme-task"`, `run attention set` also requires `resumeRef` and `taskStatePath`'), 'fixme-tools skill should document fixme-task attention resume requirements');
  assert(toolsSkill.includes('fixme-task `taskStatePath` must be absolute'), 'fixme-tools skill should document absolute task state paths for fixme-task attention');
  assert(toolsSkill.includes('For `ownerSkill: "fixme-task"`, `run attention set` also requires `sourceSkill` and a supported `answerMode`'), 'fixme-tools skill should document fixme-task attention source and answer mode requirements');
  assert(toolsSkill.includes('`run attention show` only renders the attention currently referenced by `currentCommand`'), 'fixme-tools skill should document attention show safety requirements');
  assert(toolsSkill.includes('Attention reads reject stored records with unsupported top-level fields, missing `promptMarkdown`, malformed `metadata`, invalid timestamps, answer-shape mismatches, mismatched `attentionId`, or unsupported `status`.'), 'fixme-tools skill should document persisted attention record integrity checks');
  assert(toolsSkill.includes('`run attention clear` only clears an answered attention record that is still referenced by `currentCommand`'), 'fixme-tools skill should document attention clear safety requirements');
});

test('fixme-tools skill documents producer continuation lifecycle fields', () => {
  const skill = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-tools/SKILL.md'), 'utf8');

  assert(skill.includes('producerContinuations'), 'fixme-tools docs should mention producer continuation task state');
  assert(skill.includes('allowProducerContinuation'), 'fixme-tools docs should mention dispatch prepare continuation opt-in');
  assert(skill.includes('forceFreshReason'), 'fixme-tools docs should mention forced fresh fallback');
  assert(skill.includes('runtimeHandle'), 'fixme-tools docs should mention dispatch complete runtime handle recording');
});

test('fixme-task skill: propagates usage pipeline IDs to child skill prompts', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('usageInvocationId'), 'fixme-task should name its usage invocation state');
  assert(skill.includes('pipelineRunId'), 'fixme-task should name the shared pipelineRunId state');
  assert(skill.includes('usageSourcePath'), 'fixme-task should name the runtime counter source path state');
  assert(skill.includes('pipelineRunId: <pipelineRunId>'), 'child prompts should include camelCase pipelineRunId');
  assert(skill.includes('parentInvocationId: <usageInvocationId>'), 'child prompts should include camelCase parentInvocationId');
  assert(skill.includes('usageSourcePath: <usageSourcePath>'), 'child prompts should include camelCase usageSourcePath when known');
  assert(skill.includes('child `lifecycle dispatch prepare` JSON as `usageSourcePath`'), 'child dispatch prepare should receive usageSourcePath');
  assert(skill.includes('Parent-driven `fixme-task` receives `pipelineRunId`'), 'parent-driven pipeline ID reuse should be explicit');
  assert(skill.includes('ownerSkill: fixme-task'), 'task-state owner prompt should use camelCase ownerSkill');
  assert(skill.includes('resumeRef: <FIXME-N|task-path|state-path|ticket-path>'), 'task-state owner prompt should use camelCase resumeRef');
  assert(skill.includes('taskStatePath: <task-state-path>'), 'task-state owner prompt should use camelCase taskStatePath');
  assert(!skill.includes('pipeline_run_id'), 'fixme-task prompt contract should not use snake_case pipeline_run_id');
  assert(!skill.includes('parent_invocation_id'), 'fixme-task prompt contract should not use snake_case parent_invocation_id');
  assert(!skill.includes('owner_skill:'), 'fixme-task prompt contract should not use snake_case owner_skill');
  assert(!skill.includes('resume_ref:'), 'fixme-task prompt contract should not use snake_case resume_ref');
  assert(!skill.includes('task_state_path:'), 'fixme-task prompt contract should not use snake_case task_state_path');
});

test('fixme-task skill: creates liveness status for every dispatched agent', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('lifecycle dispatch prepare --fixme-dir <fixme-dir>'), 'fixme-task should prepare dispatch (and child liveness) before each Agent dispatch');
  assert(skill.includes('<liveness>'), 'child prompts should include liveness block');
  assert(skill.includes('statusId: <statusId from lifecycle dispatch prepare>'), 'child prompts should include statusId');
  assert(skill.includes('Do not dispatch the agent if `lifecycle dispatch prepare` fails'), 'fixme-task should fail closed when dispatch prepare fails');
  assert(skill.includes('lifecycle dispatch complete --fixme-dir <fixme-dir>'), 'fixme-task should finalize child liveness after dispatch returns');
});

test('fixme-task skill documents exact producer continuation with fresh fallback', () => {
  const skill = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-task/SKILL.md'), 'utf8');

  assert(
    skill.includes('Resumable producer agents are exactly `fixme-write-product-spec`, `fixme-write-technical-spec`, `fixme-write-plan`, and `fixme-execute-plan`'),
    'fixme-task should define the exact resumable producer allowlist',
  );
  assert(
    skill.includes('Never search for a compatible agent'),
    'fixme-task should forbid compatible-agent search',
  );
  assert(
    skill.includes('continuation.mode: "resume"'),
    'fixme-task should branch on resume decisions from lifecycle dispatch prepare',
  );
  assert(
    skill.includes('forceFreshReason'),
    'fixme-task should document forced fresh fallback after resume failure',
  );
  assert(
    skill.includes('One idempotency key identifies exactly one concrete child dispatch attempt'),
    'fixme-task should document one key per concrete dispatch attempt',
  );
  assert(
    skill.includes('Retries of the same exact attempt reuse the same idempotency key'),
    'fixme-task should document retry key reuse',
  );
  assert(
    skill.includes('Every new producer attempt, review-cycle rework, repair attempt, and forced-fresh fallback uses a distinct idempotency key'),
    'fixme-task should document distinct keys for new attempts and fallbacks',
  );
  assert(
    skill.includes('Same-key conflicts protect against retry drift; they do not replace distinct attempt keys'),
    'fixme-task should document same-key conflicts as misuse protection, not normal attempt routing',
  );
  assert(
    skill.includes('Complete the failed resume dispatch before marking the handle bad'),
    'fixme-task should finalize failed resume dispatch attempts before fallback',
  );
  assert(
    skill.includes('task producer-continuation mark-bad'),
    'fixme-task should use the full-array-preserving mark-bad helper',
  );
  assert(
    skill.includes('close_agent'),
    'fixme-task should close completed Codex producers before later resume',
  );
  assert(
    skill.includes('resume_agent resumes a previously closed agent'),
    'fixme-task should document Codex closed-then-resumed lifecycle semantics',
  );
  assert(
    skill.includes('PRODUCER_CONTINUATION_REJECTED'),
    'fixme-task should handle producer reconciliation rejection',
  );
  assert(
    skill.includes('failure: { "reason": "producerContinuationRejected", "message": "<short concrete producer rejection>", "details": { "agentName": "<agent>", "runtime": "<runtime>", "handleId": "<id>" } }'),
    'fixme-task should document full producerContinuationRejected failure payload with message',
  );
  assert(
    skill.includes('failure: { "reason": "missingProducerDirective", "message": "<short concrete missing directive description>", "details": { "agentName": "<agent>", "runtime": "<runtime>", "statusId": "<statusId>" } }'),
    'fixme-task should document full missingProducerDirective failure payload with message',
  );
  assert(
    skill.includes('Reviewers, handlers, investigation, research, browser verification, and `fixme-task` stay fresh'),
    'fixme-task should document non-resumable roles',
  );
});

test('resumable producer skills document durable artifact precedence on continuation', () => {
  const producerSkills = [
    'fixme-write-product-spec',
    'fixme-write-technical-spec',
    'fixme-write-plan',
    'fixme-execute-plan',
  ];

  for (const skillName of producerSkills) {
    const skill = fs.readFileSync(path.join(repoRoot, `.claude/skills/${skillName}/SKILL.md`), 'utf8');
    assert(skill.includes('## Producer Continuation Resume Contract'), `${skillName} should document resume contract`);
    assert(
      skill.includes('Live context is an optimization cache only'),
      `${skillName} should state that live context is cache only`,
    );
    assert(
      skill.includes('Re-read the current authoritative artifacts'),
      `${skillName} should require current artifact reads on resume`,
    );
    assert(
      skill.includes('PRODUCER_CONTINUATION_REJECTED'),
      `${skillName} should expose a deterministic rejection directive`,
    );
    assert(
      skill.includes('Producer skills must never call `lifecycle dispatch prepare`'),
      `${skillName} should forbid child dispatch from producer skills`,
    );
    assert(
      skill.includes('Do not load or execute `fixme-task` orchestration workflow instructions'),
      `${skillName} should forbid acting as the fixme-task orchestrator`,
    );
  }

  const executor = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-execute-plan/SKILL.md'), 'utf8');
  assert(
    executor.includes('On resume after implementation-only repair or plan-required rework'),
    'executor should document repair and plan-required rework resume behavior',
  );
  assert(
    executor.includes('Read the current plan and code map before deciding the next action'),
    'executor should treat revised plan and code map as authoritative',
  );
});

test('fixme-task skill: refreshes its own liveness while waiting on dispatched agents', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('Before every Agent dispatch wait, ping the current fixme-task invocation'), 'fixme-task should refresh its inherited liveness before waiting on child agents');
  assert(skill.includes('--current-command waiting-for:<agent-name>'), 'fixme-task should report the child agent it is waiting on with a shell-safe marker');
  assert(!skill.includes('--current-command "waiting for <agent-name>"'), 'fixme-task should not use a quoted spaced liveness wait marker');
  assert(skill.includes('After the dispatched agent returns, ping the current fixme-task invocation again'), 'fixme-task should refresh its inherited liveness after child agents return');
});

test('fixme-task skill: documents dispatch prepare payload contract without response-only inputs', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Dispatch prepare request payload has exactly these required fields:'), 'fixme-task should define the dispatch prepare request contract');
  assert(skill.includes('Required: `idempotencyKey`, `agentName`, `transport`, `promptInputs`.'), 'fixme-task should list the exact required dispatch prepare inputs');
  assert(skill.includes('Response-only: `usageContext`, `promptBlocks`, `activeChild`, `runtimeSettings`'), 'fixme-task should identify response-only dispatch prepare fields');
  assert(skill.includes('Never pass `usageContext` or `promptBlocks` inside the dispatch prepare request payload.'), 'fixme-task should forbid response-only fields as inputs');
});

test('fixme-task skill: keeps dispatch idempotency stable across validation retries', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('A CLI validation failure does not create a new logical dispatch attempt. Fix the payload and retry with the same idempotency key.'), 'validation retries should reuse the same dispatch key');
  assert(skill.includes('Use a new idempotency key only after a recorded dispatch conflict, bad continuation, completed prior dispatch, or intentional fresh fallback.'), 'new keys should be limited to recorded fresh attempts');
});

test('fixme-task skill: requires a complete terminal child lifecycle before final directives', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Before emitting `TASK_EVENT_RECORDED` or any final directive, verify exactly one terminal child handoff sequence has completed'), 'fixme-task should gate final directives on a complete terminal handoff');
  for (const command of [
    'lifecycle dispatch complete',
    'task checkpoint',
    'task result write',
    'lifecycle task-event record',
    'lifecycle invocation finish',
  ]) {
    assert(skill.includes(command), `terminal lifecycle checklist should include ${command}`);
  }
  assert(skill.includes('Emit the usage report line and terminal task-event directive exactly once.'), 'fixme-task should forbid duplicate terminal usage/directive output');
});

test('fixme-task skill: uses data-file payloads for nested workflow JSON', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Inline `--data` JSON is allowed only for tiny flat examples; workflow payloads with nested objects or arrays must be written to an absolute JSON file and passed with `--data-file`.'), 'fixme-task should require data-file payloads for nested workflow JSON');
  assert(skill.includes('task save --data-file <task-save.json>'), 'save mode should use data-file for nested save payloads');
  assert(skill.includes('task checkpoint --state <task-state-path> --data-file <checkpoint.json>'), 'checkpoint examples should use data-file for nested patches');
  assert(skill.includes('lifecycle dispatch prepare --fixme-dir <fixme-dir> --data-file <dispatch-prepare.json>'), 'dispatch prepare should use data-file for nested prompt payloads');
  assert(skill.includes('task init --state <activeChild.taskStatePath>'), 'parent-driven init should still use the reserved active child state path');
});

test('fixme-task skill separates saved handoff task init from reserved state init', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  for (const required of [
    'If `launch.promptBlocks.taskInput.source === "savedTaskWithHandoffPayload"`',
    'task init --task <taskPath> --pipeline-resolution-file <pipeline-resolution.json> --project-root <project-root> --parent-continuation-file <parent-continuation.json>',
    'Otherwise, initialize the reserved state path',
    'task init --state <activeChild.taskStatePath> --pipeline-resolution-file <pipeline-resolution.json> --project-root <project-root> --parent-continuation-file <parent-continuation.json>',
    'Saved handoff children must not be initialized through `--state` because the reserved state path may collide with saved task markdown.',
    'Reserved-state children must not call `task init --task` because no saved task markdown is the boundary.',
  ]) {
    assert(skill.includes(required), `fixme-task should document boundary: ${required}`);
  }

  const savedIndex = skill.indexOf('If `launch.promptBlocks.taskInput.source === "savedTaskWithHandoffPayload"`');
  const reservedIndex = skill.indexOf('Otherwise, initialize the reserved state path');
  assert(savedIndex !== -1 && reservedIndex !== -1 && savedIndex < reservedIndex, 'saved handoff branch should be documented before reserved-state fallback');
});

test('review synthesize-clean-handler emits deterministic clean routing blocks', () => {
  const plan = run('review synthesize-clean-handler --kind plan');
  assert(plan.ok, `plan clean handler synthesis should succeed: ${JSON.stringify(plan.data)}`);
  assert(plan.data.handlerResult === 'CLEAN', `plan handlerResult should be CLEAN, got ${plan.data.handlerResult}`);
  assert(plan.data.nextAction === 'DONE', `plan nextAction should be DONE, got ${plan.data.nextAction}`);
  assert(plan.data.routingBlock.includes('HANDLER_RESULT: CLEAN'), 'plan routing block should include CLEAN directive');
  assert(plan.data.routingBlock.includes('PLAN_REQUIRED_COUNT: 0'), 'plan routing block should include plan-required count');
  assert(plan.data.routingBlock.includes('IMPLEMENT_ONLY_COUNT: 0'), 'plan routing block should include implement-only count');
  assertNoSnakeCaseKeys(plan.data, 'plan clean handler synthesis output');

  const code = run('review synthesize-clean-handler --kind code');
  assert(code.ok, `code clean handler synthesis should succeed: ${JSON.stringify(code.data)}`);
  assert(code.data.routingBlock.includes('PLAN_REQUIRED_COUNT: 0'), 'code routing block should include plan-required count');
  assert(code.data.routingBlock.includes('IMPLEMENT_ONLY_COUNT: 0'), 'code routing block should include implement-only count');
  assertNoSnakeCaseKeys(code.data, 'code clean handler synthesis output');

  const specification = run('review synthesize-clean-handler --kind specification');
  assert(specification.ok, `spec clean handler synthesis should succeed: ${JSON.stringify(specification.data)}`);
  assert(specification.data.routingBlock.includes('HANDLER_RESULT: CLEAN'), 'spec routing block should include CLEAN directive');
  assert(!specification.data.routingBlock.includes('PLAN_REQUIRED_COUNT'), 'spec routing block should not include plan-required count');
  assert(!specification.data.routingBlock.includes('IMPLEMENT_ONLY_COUNT'), 'spec routing block should not include implement-only count');
  assertNoSnakeCaseKeys(specification.data, 'spec clean handler synthesis output');
});

test('review synthesize-clean-handler rejects unsupported kinds', () => {
  const result = run('review synthesize-clean-handler --kind nonsense');
  assert(!result.ok, 'unsupported review kind should fail');
  assert(cliErrorMessage(result).includes('--kind must be one of: plan, code, specification'), `unsupported kind error should name allowed kinds, got ${cliErrorMessage(result)}`);
});

test('review validate-plan-readiness validates route consistency and camelCase JSON', () => {
  const validOutput = [
    '## Plan Readiness Triage',
    '',
    '**Summary**: Plan is concrete, complete, and low risk.',
    '',
    '---',
    'READINESS_RESULT: EXECUTE',
    'SUMMARY: Plan is concrete, complete, and low risk.',
    'BLOCKING_FINDING_COUNT: 0',
    'QUESTION_COUNT: 0',
    'RISK_LEVEL: low',
  ].join('\n');
  const validPath = writeJsonFixture(createTmpDir(), 'readiness.json', { output: validOutput });
  const valid = run(`review validate-plan-readiness --data-file "${validPath}"`);
  assert(valid.ok, `valid readiness output should pass: ${JSON.stringify(valid.data)}`);
  assert(valid.data.result === 'EXECUTE', `result should be EXECUTE, got ${valid.data.result}`);
  assert(valid.data.summary === 'Plan is concrete, complete, and low risk.', `summary should be parsed, got ${valid.data.summary}`);
  assert(valid.data.blockingFindingCount === 0, 'blockingFindingCount should be parsed');
  assert(valid.data.questionCount === 0, 'questionCount should be parsed');
  assert(valid.data.riskLevel === 'low', 'riskLevel should be parsed');
  assert(Array.isArray(valid.data.blockingFindings), 'blockingFindings should be an array');
  assert(valid.data.blockingFindings.length === 0, 'EXECUTE should return no blocking findings');
  assertNoSnakeCaseKeys(valid.data, 'readiness validation output');

  const reviseOutput = [
    '## Plan Readiness Triage',
    '',
    '**Summary**: Plan needs one concrete test step before execution.',
    '',
    '### Blocking Findings',
    '',
    '1. **Missing TDD failure step**',
    '   Problem: The plan writes implementation before proving the expected test failure.',
    '   Required plan change: Add a test-first step and an expected failure assertion before the implementation step.',
    '   Evidence: [plan.md:42](/tmp/plan.md#L42)',
    '   Affected plan sections: Task 1 Step 1',
    '',
    '---',
    'READINESS_RESULT: REVISE_PLAN',
    'SUMMARY: Plan needs one concrete test step before execution.',
    'BLOCKING_FINDING_COUNT: 1',
    'QUESTION_COUNT: 0',
    'RISK_LEVEL: low',
  ].join('\n');
  const revisePath = writeJsonFixture(createTmpDir(), 'revise-readiness.json', { output: reviseOutput });
  const revise = run(`review validate-plan-readiness --data-file "${revisePath}"`);
  assert(revise.ok, `REVISE_PLAN readiness output should pass: ${JSON.stringify(revise.data)}`);
  assert(revise.data.result === 'REVISE_PLAN', `result should be REVISE_PLAN, got ${revise.data.result}`);
  assert(revise.data.blockingFindings.length === 1, `one blocking finding should be parsed, got ${JSON.stringify(revise.data.blockingFindings)}`);
  assert(revise.data.blockingFindings[0].title === 'Missing TDD failure step', `title should be parsed, got ${JSON.stringify(revise.data.blockingFindings[0])}`);
  assert(revise.data.blockingFindings[0].problem === 'The plan writes implementation before proving the expected test failure.', 'problem should be parsed');
  assert(revise.data.blockingFindings[0].requiredPlanChange === 'Add a test-first step and an expected failure assertion before the implementation step.', 'requiredPlanChange should be parsed');
  assert(revise.data.blockingFindings[0].evidence === '[plan.md:42](/tmp/plan.md#L42)', 'evidence should be parsed');
  assert(revise.data.blockingFindings[0].affectedPlanSections === 'Task 1 Step 1', 'affectedPlanSections should be parsed');
  assertNoSnakeCaseKeys(revise.data, 'revise readiness validation output');

  const mismatchedReviseOutput = reviseOutput.replace('BLOCKING_FINDING_COUNT: 1', 'BLOCKING_FINDING_COUNT: 2');
  const mismatchedRevisePath = writeJsonFixture(createTmpDir(), 'bad-revise-count.json', { output: mismatchedReviseOutput });
  const mismatchedRevise = run(`review validate-plan-readiness --data-file "${mismatchedRevisePath}"`);
  assert(!mismatchedRevise.ok, 'REVISE_PLAN with mismatched parsed finding count should fail');
  assert(cliErrorMessage(mismatchedRevise).includes('REVISE_PLAN requires BLOCKING_FINDING_COUNT to match parsed blocking findings'), `error should explain count mismatch, got ${cliErrorMessage(mismatchedRevise)}`);

  const missingFieldReviseOutput = reviseOutput.replace('   Required plan change: Add a test-first step and an expected failure assertion before the implementation step.\n', '');
  const missingFieldRevisePath = writeJsonFixture(createTmpDir(), 'bad-revise-field.json', { output: missingFieldReviseOutput });
  const missingFieldRevise = run(`review validate-plan-readiness --data-file "${missingFieldRevisePath}"`);
  assert(!missingFieldRevise.ok, 'REVISE_PLAN missing a required finding field should fail');
  assert(cliErrorMessage(missingFieldRevise).includes('requiredPlanChange'), `error should name missing requiredPlanChange, got ${cliErrorMessage(missingFieldRevise)}`);

  const invalidOutput = [
    '---',
    'READINESS_RESULT: EXECUTE',
    'SUMMARY: Bad route.',
    'BLOCKING_FINDING_COUNT: 1',
    'QUESTION_COUNT: 0',
    'RISK_LEVEL: low',
  ].join('\n');
  const invalidPath = writeJsonFixture(createTmpDir(), 'bad-readiness.json', { output: invalidOutput });
  const invalid = run(`review validate-plan-readiness --data-file "${invalidPath}"`);
  assert(!invalid.ok, 'EXECUTE with blocking findings should fail');
  assert(cliErrorMessage(invalid).includes('EXECUTE requires BLOCKING_FINDING_COUNT: 0'), `error should explain fail-closed rule, got ${cliErrorMessage(invalid)}`);

  const extraKeyOutput = validOutput.concat('\nNEXT_ACTION: DONE');
  const extraKeyPath = writeJsonFixture(createTmpDir(), 'extra-readiness-key.json', { output: extraKeyOutput });
  const extraKey = run(`review validate-plan-readiness --data-file "${extraKeyPath}"`);
  assert(!extraKey.ok, 'readiness output with extra directive keys should fail');
  assert(cliErrorMessage(extraKey).includes('unexpected directive key NEXT_ACTION'), `error should name unexpected key, got ${cliErrorMessage(extraKey)}`);

  const fullReviewOutput = [
    '---',
    'READINESS_RESULT: FULL_PLAN_REVIEW',
    'SUMMARY: Plan is structurally complete but high risk.',
    'BLOCKING_FINDING_COUNT: 0',
    'QUESTION_COUNT: 0',
    'RISK_LEVEL: high',
  ].join('\n');
  const fullReviewPath = writeJsonFixture(createTmpDir(), 'full-review-readiness.json', { output: fullReviewOutput });
  const fullReview = run(`review validate-plan-readiness --data-file "${fullReviewPath}"`);
  assert(fullReview.ok, `FULL_PLAN_REVIEW with high risk should pass: ${JSON.stringify(fullReview.data)}`);
  assert(fullReview.data.result === 'FULL_PLAN_REVIEW', `result should be FULL_PLAN_REVIEW, got ${fullReview.data.result}`);
});

test('fixme reviewers emit machine-readable review result footer for clean fast path', () => {
  const reviewerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-review-spec', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md'),
  ];

  for (const skillPath of reviewerPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('REVIEW_RESULT: CLEAN | HAS_ITEMS'), `${skillPath} should emit a machine-readable review result`);
    assert(skill.includes('FINDING_COUNT: <number>'), `${skillPath} should emit a finding count`);
    assert(skill.includes('QUESTION_COUNT: <number>'), `${skillPath} should emit a question count`);
    assert(skill.includes('Only use `REVIEW_RESULT: CLEAN` when `FINDING_COUNT: 0` and `QUESTION_COUNT: 0`.'), `${skillPath} should gate clean result on zero findings and questions`);
  }
});

test('plan readiness skill and agent define compact independent triage contract', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-plan-readiness', 'SKILL.md');
  const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', 'fixme-plan-readiness.md');

  assert(fs.existsSync(skillPath), 'fixme-plan-readiness skill should exist');
  assert(fs.existsSync(agentPath), 'fixme-plan-readiness agent should exist');

  const skill = fs.readFileSync(skillPath, 'utf8');
  const agent = fs.readFileSync(agentPath, 'utf8');

  assert(skill.includes('READINESS_RESULT: EXECUTE | REVISE_PLAN | ASK_USER | FULL_PLAN_REVIEW'), 'readiness skill should define the route directive');
  assert(skill.includes('fail closed'), 'readiness skill should require fail-closed routing');
  assert(skill.includes('must not rewrite the plan'), 'readiness skill should forbid plan rewriting');
  assert(skill.includes('task decision list --state <task-state-path> --format markdown'), 'readiness skill should consume task decisions through the task API');
  assert(skill.includes('Task Coverage'), 'readiness skill should check task coverage');
  assert(skill.includes('TDD Completeness'), 'readiness skill should check TDD completeness');
  assert(skill.includes('Full Plan Review Escalation'), 'readiness skill should define full review escalation');
  assert(skill.includes('Required plan change'), 'readiness skill should structure findings for plan revision');
  assert(skill.includes('Affected plan sections'), 'readiness skill should identify sections the planner must revise');

  assert(agent.includes('name: fixme-plan-readiness'), 'agent frontmatter should use the readiness name');
  assert(agent.includes('tools: Read, Bash, Grep, Glob'), 'agent should be read-only');
  assert(agent.includes('- fixme-plan-readiness'), 'agent should preload readiness skill');
  assert(agent.includes('- fixme-howto-present-decisions'), 'agent should preload decision presentation');
  assert(agent.includes('You are a fixme plan readiness checker'), 'agent role should identify readiness checker');
  assert(agent.includes('Never modify files'), 'agent should forbid file modifications');
});

test('fixme-task synthesizes clean handler output only for machine-clean reviews', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('## Synthetic Clean Handler Fast Path'), 'fixme-task should document the synthetic clean handler fast path');
  assert(skill.includes('REVIEW_RESULT: CLEAN'), 'fixme-task should require reviewer clean footer before synthesis');
  assert(skill.includes('FINDING_COUNT: 0'), 'fixme-task should require zero findings before synthesis');
  assert(skill.includes('QUESTION_COUNT: 0'), 'fixme-task should require zero questions before synthesis');
  assert(skill.includes('review synthesize-clean-handler --kind <plan|code|specification>'), 'fixme-task should use deterministic helper for synthetic handler output');
  assert(skill.includes('dispatchMode: "syntheticClean"'), 'fixme-task should checkpoint synthetic handler steps distinctly');
  assert(skill.includes('Do not synthesize a handler result from prose such as "no issues" or "looks clean".'), 'fixme-task should forbid prose-parsed clean synthesis');
  assert(skill.includes('A valid `REVIEW_RESULT: HAS_ITEMS` footer, non-zero count footer, or custom review output without an exact clean footer dispatches the configured handler normally.'), 'fixme-task should fail closed to normal handler dispatch');
});

test('fixme-task skill routes plan readiness before optional full plan review', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const normalizedSkill = skill.replace(/\s+/g, ' ').trim();
  const includesNormalized = expected => normalizedSkill.includes(expected.replace(/\s+/g, ' ').trim());
  const allowlistMatch = skill.match(/## Orchestrator Tool Allowlist[\s\S]*?Any Bash command with a literal `\.fixme\/` argument is forbidden\./);

  assert(skill.includes('fixme-plan-readiness'), 'fixme-task should dispatch the plan readiness checker');
  assert(skill.includes('READINESS_RESULT: EXECUTE | REVISE_PLAN | ASK_USER | FULL_PLAN_REVIEW'), 'fixme-task should document readiness routes');
  assert(allowlistMatch, 'fixme-task should have an extractable orchestrator allowlist section');
  assert(allowlistMatch[0].includes('review validate-plan-readiness --data-file <readiness-validation.json>'), 'fixme-task Bash allowlist should permit readiness validation');
  assert(skill.includes('review validate-plan-readiness --data-file <readiness-validation.json>'), 'fixme-task should validate readiness output through the CLI helper');
  assert(skill.includes('READINESS_RESULT: EXECUTE` marks the full plan review steps completed as skipped by readiness'), 'EXECUTE should skip full plan review only through an explicit readiness route');
  assert(skill.includes('READINESS_RESULT: FULL_PLAN_REVIEW` advances to `fixme-review-plan`'), 'FULL_PLAN_REVIEW should preserve full plan review escalation');
  assert(skill.includes('READINESS_RESULT: REVISE_PLAN` re-dispatches `fixme-write-plan` in readiness revision mode'), 'REVISE_PLAN should use the writer readiness-revision contract');
  assert(skill.includes('readiness blocking findings are not handler-classified FIX items'), 'fixme-task should not pass readiness findings as handler output');
  assert(skill.includes('READINESS_RESULT: ASK_USER` stores the readiness decision prompt through `lifecycle attention open`'), 'ASK_USER should use durable task-owned attention');
  assert(includesNormalized('Step 2 [plan/readiness] Dispatch fixme-plan-readiness'), 'default manifest should include readiness before full plan review');
  assert(includesNormalized('Step 3 [plan/readiness] Route on READINESS_RESULT'), 'default manifest should include readiness route');
  assert(includesNormalized('Step 4 [plan/review] Dispatch fixme-review-plan'), 'default manifest should keep full plan review after readiness');
});

test('fixme-task scopes reviewer footer validation to built-in reviewers', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Built-in reviewer (`fixme-review-spec`, `fixme-review-plan`, `fixme-review-code`)'), 'directive validation should scope reviewer footer requirements to built-in reviewers');
  assert(skill.includes('This built-in reviewer row does not apply to custom review skills.'), 'custom review skills should not inherit the hard built-in reviewer footer contract');
  assert(skill.includes('For custom or unknown review skills, a missing or malformed footer only disables synthetic clean routing and the next configured handler runs normally.'), 'custom review skills without a footer should fall through to their configured handler');
  assert(skill.includes('For built-in reviewers, a missing or malformed footer follows the missing-directive recovery procedure.'), 'built-in reviewers should still fail closed when their required footer is absent');
});

test('source skills document prepare-child handoff and safe JSON contracts', () => {
  const prSkill = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-pr-comments/SKILL.md'), 'utf8');
  assert(prSkill.includes('lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>'), 'PR comments should use prepare-child data-file handoff');
  assert(!prSkill.includes('Codex inline mode'), 'PR comments should not describe Codex inline mode');
  assert(prSkill.includes('launch.transport == "inline-skill"'), 'PR comments should preserve Claude inline launch wording');
  assert(prSkill.includes('launch.transport == "agent"'), 'PR comments should document Codex agent launch wording');
  assert(prSkill.includes('spawn_agent(agent_type="fixme-task"'), 'PR comments should launch registered Codex fixme-task agent');
  assert(prSkill.includes('launch.promptBlocks'), 'PR comments should read prompt data from launch.promptBlocks');
  assert(prSkill.includes('child.handoff.taskSaveData'), 'PR comments should document saved task handoff data');
  assert(prSkill.includes('child.handoff.payload'), 'PR comments should document durable sidecar payload');
  assert(prSkill.includes('child-handoff-payload'), 'PR comments should document child handoff payload artifact');
  assert(prSkill.includes('Do not call lifecycle `--help` during normal execution'), 'PR comments should not probe lifecycle help during normal execution');
  assert(prSkill.includes('`await.ledger` MUST be `{}` at launch'), 'PR comments should keep prepare-child launch ledger empty');
  assert(prSkill.includes('Do not put `currentPrFixGroups`, `mustResolveThreadIds`, or any other ad hoc routing keys under `await.ledger`'), 'PR comments should route fix metadata through child handoff payload, not await ledger');
  assert(prSkill.includes('MUST contain full routed group objects, not group IDs'), 'PR comments should forbid id-only child routedFixGroups');
  assert(prSkill.includes('"routedGroups": ['), 'PR comments should show group ids as values');
  assert(prSkill.includes('"routedFixGroups": ['), 'PR comments should document child routedFixGroups');
  assert(prSkill.includes('"problem": "The implementation does not satisfy the current PR review thread."'), 'PR comments should include problem detail in child handoff groups');
  assert(prSkill.includes('"requiredBehavior": ["Apply the requested current PR review fix."]'), 'PR comments should include required behavior detail in child handoff groups');
  assert(prSkill.includes('"pipelineRunId": "<pipelineRunId>"'), 'PR comments should require child pipelineRunId');
  assert(prSkill.includes('"recoverStaleParent": true'), 'PR comments should enable automatic stale-parent recovery');
  assert(!prSkill.includes('"recoverStaleParent": false'), 'PR comments should not document disabled stale-parent recovery');
  assert(!prSkill.includes('"ledger": {"currentPrFixGroups"'), 'PR comments should not put currentPrFixGroups in await ledger JSON');
  assert(!prSkill.includes('"ledger": {"mustResolveThreadIds"'), 'PR comments should not put mustResolveThreadIds in await ledger JSON');
  const staleNormalDispatchPhrases = [
    'Invoking `Skill("fixme-task", ...)` with the routed `CURRENT_PR_FIX` groups as a text argument',
    'Pass the routed current PR fix groups as text in the `Skill("fixme-task", args=...)` invocation',
    'pass the routed current PR fix groups as text inputs to `Skill("fixme-task", args=...)`',
    'Your next action MUST be liveness setup followed by a `Skill("fixme-task")` invocation',
    'The Skill tool is the ONLY implementation tool you use in this step',
    'node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs run start --fixme-dir <fixme-dir> --agent fixme-task',
    'node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle dispatch prepare --fixme-dir <fixme-dir> --data',
    'node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent create --fixme-dir <fixme-dir> --data',
    'node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs lifecycle parent checkpoint --fixme-dir <fixme-dir>',
  ];
  for (const phrase of staleNormalDispatchPhrases) {
    assert(!prSkill.includes(phrase), `PR comments should not contain stale normal-dispatch phrase: ${phrase}`);
  }
  const normalSection = prSkill.slice(prSkill.indexOf('#### Invoke fixme-task'), prSkill.indexOf('### 4. Verify All Changes'));
  assert(!normalSection.includes('lifecycle dispatch prepare --fixme-dir'), 'normal PR handoff should not call dispatch prepare directly');
  assert(!normalSection.includes('lifecycle parent checkpoint --fixme-dir'), 'normal PR handoff should not call parent checkpoint directly');
  assert(!normalSection.includes('inline-skill transport, parent-driven'), 'normal PR handoff heading should not imply inline-only dispatch');
  assert(!normalSection.includes('fixme-task runs inline in this session'), 'normal PR handoff should not contain inline-only execution note');
  assert(normalSection.indexOf('If `launch.transport == "inline-skill"`') < normalSection.indexOf('If `launch.transport == "agent"`'), 'normal PR handoff should branch from returned launch transport');

  const sessionSkill = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-session/SKILL.md'), 'utf8');
  assert(sessionSkill.includes('lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>'), 'session should use prepare-child data-file handoff');
  assert(sessionSkill.includes('parentSkill: "fixme-session"'), 'session should document fixme-session parentSkill');
  assert(sessionSkill.includes('sessionTaskRef'), 'session should document sessionTaskRef lookup');
  assert(sessionSkill.includes('launch.transport'), 'session should use helper-returned launch transport');

  const taskSkill = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-task/SKILL.md'), 'utf8');
  assert(taskSkill.includes('--pipeline-resolution-file <pipeline-resolution.json>'), 'fixme-task should prefer pipeline-resolution file flag');
  assert(taskSkill.includes('--parent-continuation-file <parent-continuation.json>'), 'fixme-task should prefer parent-continuation file flag');
  assert(taskSkill.includes('inline-skill`, `agent`, and `background`'), 'fixme-task should list parent-driven transports');
  assert(taskSkill.includes('runtimeSettings.reasoningEffort'), 'fixme-task should document camelCase runtimeSettings');
  assert(!taskSkill.includes('runtimeSettings` contains `runtime`/`model`/`reasoning_effort`'), 'fixme-task should not document snake_case runtimeSettings');

  const toolsSkill = fs.readFileSync(path.join(repoRoot, '.claude/skills/fixme-tools/SKILL.md'), 'utf8');
  const claudeDoc = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  for (const [name, content] of [['fixme-tools', toolsSkill], ['CLAUDE', claudeDoc], ['README', readme]]) {
    assert(content.includes('--data-file'), `${name} should document --data-file`);
    assert(content.includes('--data-stdin'), `${name} should document --data-stdin`);
    assert(content.includes('lifecycle parent prepare-child'), `${name} should document prepare-child`);
    assert(content.includes('lifecycle parent abandon'), `${name} should document abandon`);
    assert(content.includes('lifecycle attention broker resume'), `${name} should document broker resume`);
    assert(content.includes('lifecycle attention broker acknowledge-resume'), `${name} should document broker acknowledge-resume`);
  }
});

test('fixme-task skill: checkpoints review loop counters under loops', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('Persist review loop counters only under `loops.phaseReviewCycles`; never send a top-level `phaseReviewCycles` field to `task checkpoint`.'), 'fixme-task should forbid top-level phaseReviewCycles checkpoints');
  assert(skill.includes('{"loops":{"phaseReviewCycles":[{"phase":"plan","cycles":2}]}}'), 'fixme-task should show the supported phaseReviewCycles checkpoint shape');
});

test('fixme workflow manifests use runtime-neutral live task-list tooling', () => {
  const howtoPath = path.resolve(__dirname, '..', '..', 'fixme-howto-workflow-manifest', 'SKILL.md');
  assert(fs.existsSync(howtoPath), 'shared workflow manifest howto should exist');
  const howto = fs.readFileSync(howtoPath, 'utf8');
  assert(howto.includes('live manifest task list'), 'shared howto should name the live manifest abstraction');
  assert(howto.includes('TaskCreate'), 'shared howto should document Claude TaskCreate mapping');
  assert(howto.includes('TaskUpdate'), 'shared howto should document Claude TaskUpdate mapping');
  assert(howto.includes('TaskList'), 'shared howto should document Claude TaskList mapping');
  assert(howto.includes('TaskGet'), 'shared howto should document Claude TaskGet mapping');
  assert(howto.includes('update_plan'), 'shared howto should document Codex update_plan mapping');
  assert(howto.includes('stop with a manifest-tool blocker'), 'shared howto should fail closed when no manifest tool is available');
  assert(howto.includes('not durable workflow state'), 'shared howto should distinguish live task lists from durable state');

  const taskSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md'), 'utf8');
  const prSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md'), 'utf8');
  const taskAgent = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'agents', 'fixme-task.md'), 'utf8');

  for (const [name, content] of [
    ['fixme-task skill', taskSkill],
    ['fixme-pr-comments skill', prSkill],
    ['fixme-task agent', taskAgent],
  ]) {
    assert(content.includes('live manifest task list'), `${name} should use the runtime-neutral manifest contract`);
    assert(!content.includes('TodoWrite'), `${name} should not depend on TodoWrite`);
  }

  assert(taskSkill.includes('Parent and child live manifest task lists stay separate'), 'fixme-task should keep parent and child manifests separate');
  assert(taskSkill.includes('Do not inspect, merge, replace, or advance the parent manifest from `fixme-task`'), 'fixme-task should forbid child mutation of parent manifest');
  assert(taskSkill.includes('record a durable terminal task event for the parent to consume'), 'fixme-task should hand off parent-driven completion through task events');
  assert(!taskSkill.includes('latest todo state in conversation history'), 'fixme-task should not read parent todo state from conversation history');
  assert(!taskSkill.includes('Begin executing the parent\'s next step'), 'fixme-task should not start parent-owned verification after child completion');
});

test('fixme-task skill: owns durable attention requests and answer resume', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('--answer-attention <attention-id>'), 'fixme-task should document answer-attention resume input');
  assert(skill.includes('FIXME_ATTENTION_REQUIRED: <attention-id>'), 'fixme-task should return a machine-readable attention directive');
  assert(skill.includes('state `waitingForUser` with `pendingDecision.attentionId`'), 'fixme-task should checkpoint waiting state with attention id');
  assert(skill.includes('pendingDecision.attentionStatusId'), 'fixme-task should store the run status id that owns the attention record');
  assert(skill.includes('Generate the attention id before checkpointing task state'), 'fixme-task should allocate the attention id before writing resumable state');
  assert(skill.includes('which checkpoints task state before creating the attention record (checkpoint-first)'), 'fixme-task should make resume metadata durable before exposing the prompt');
  assert(skill.includes('absolute `taskStatePath`'), 'fixme-task should pass an absolute task state path to attention records');
  assert(skill.includes('"taskStatePath":"<absolute-task-state-path>"'), 'fixme-task attention example should use an absolute task state path placeholder');
  assert(!skill.includes('store the Agent Escalation block with `run attention set`, checkpoint'), 'agent escalation instructions should not expose attention before checkpointing');
  assert(!skill.includes('store the Pipeline Escalation block with `run attention set`, checkpoint'), 'loop guard instructions should not expose attention before checkpointing');
  assert(!skill.includes('store the complete Review Classification block with `run attention set`, checkpoint'), 'review decision instructions should not expose attention before checkpointing');
  assert(skill.includes('Load the answered attention record from `pendingDecision.attentionStatusId`'), 'answer resume should load attention from task state, not implicit current status');
  assert(skill.includes('If `status` is `waitingForUser` and `answerAttentionId` is present, follow Durable Attention Requests instead of presenting `pendingDecision` directly.'), 'answer-attention resumes should not present pendingDecision directly');
  assert(skill.includes('Consume `--answer-attention` before any normal liveness ping, Agent dispatch, or status reset so the runtime does not reject the liveness update while the active `currentCommand: attention:<attention-id>` marker is still pending'), 'answer resume should clear pending attention before normal liveness resumes');
  assert(skill.includes('lifecycle attention consume --fixme-dir <fixme-dir>'), 'answer resume should use the owner-only consume helper');
  assert(skill.includes('persist decision records through `lifecycle attention consume` for every answered attention decision that constrains task behavior'), 'answer resume should persist task-constraining child decisions through consume');
  assert(!skill.includes('persist the decision with `task decision append --state <task-state-path> --data \'<decision-record-json>\'`'), 'answer resume should not instruct manual decision append after attention');
  assert(skill.includes('re-dispatch the same child step with the answered input'), 'answer resume should feed child attention answers back to the child step');
  assert(skill.includes('Only `fixme-task` interprets the answer and consumes it through `lifecycle attention consume` after an attention answer'), 'fixme-task should preserve decision ownership');
  assert(skill.includes('Use `answer.answerKind` to distinguish `decision` from `clarificationRequest`'), 'answer resume should use explicit answer kind');
  assert(skill.includes('If the answered attention record contains `answerKind: "clarificationRequest"`, treat it as Discussion Mode input.'), 'answer resume should support clarification turns without treating them as decisions');
  assert(skill.includes('clear the consumed attention before creating the replacement attention'), 'clarification replacement attention should avoid overlapping pending attention');
  assert(skill.includes('For a clarification turn, build the replacement prompt and open the replacement attention with another `lifecycle attention open`, and return'), 'clarification turns should re-prompt through checkpoint-first durable attention');
  assert(skill.includes('If `answer.answerKind` is `decision` but only some decision points are resolved, keep the parsed partial answers in `pendingDecision.partialAnswers`'), 'partial attention decisions should be preserved before re-prompting unresolved points');
  assert(skill.includes('For partial decision answers, build the replacement prompt for only the unresolved decision points and open the replacement attention with another `lifecycle attention open`, and return'), 'partial attention decisions should re-prompt through checkpoint-first durable attention');
  assert(!skill.includes('Then create a new durable attention prompt with the clarification answer plus the still-unresolved decision points, checkpoint'), 'clarification turns should not create replacement attention before checkpointing');
  assert(!skill.includes('clear the consumed attention before creating a replacement prompt for only the unresolved decision points, checkpoint'), 'partial decisions should not create replacement attention before checkpointing');
  assert(skill.includes('resume an existing task continuation, never save a new task'), 'resume mode should forbid duplicate saved-task creation');
  assert(skill.includes('Attention Resume Examples'), 'fixme-task should include concrete attention resume examples');
  assert(skill.includes('Attention examples use the same checkpoint-first order'), 'fixme-task examples should explicitly preserve checkpoint-first ordering');
  assert(!skill.includes('Then it checkpoints `pendingDecision.attentionId` and returns:'), 'fixme-task examples should not checkpoint after exposing attention');
  assert(skill.includes('lifecycle attention broker resume'), 'fixme-task should document broker resume as the parent answer path');
  assert(skill.includes('returns `resume.message`'), 'fixme-task should say the broker helper returns resume.message');
  assert(skill.includes('with the returned `resume.message` only'), 'fixme-task should launch only the helper-returned resume message');
  assert(skill.includes('lifecycle attention broker acknowledge-resume'), 'fixme-task should document post-launch acknowledgement');
  assert(skill.includes('activeChild.resumeDispatch'), 'fixme-task should document resume-dispatch evidence');
  assert(skill.includes('Parent brokers do not hand-compose the message'), 'fixme-task should forbid hand-composed resume messages');
  assert(!skill.includes('Skill("fixme-task", "--resume FIXME-13 --answer-attention attn_review_123")'), 'fixme-task should not keep the old Claude inline hand-composed resume assertion');
  assert(!skill.includes('--nested'), 'fixme-task should no longer reference --nested');
  assert(!skill.includes('Legacy installed-skill resume references may mention `$HOME/.codex/skills/fixme-task/SKILL.md`; parent-driven Codex execution now uses the registered agent transport.'), 'fixme-task should not keep the old Codex installed-skill hand-composed resume assertion');
  assert(!skill.includes('Agent(subagent_type="fixme-task", ...)'), 'fixme-task should not keep the old Claude background hand-composed resume assertion');
  assert(!skill.includes('spawn_agent(agent_type="fixme-task", message=...)'), 'fixme-task should not keep the old Codex background hand-composed resume assertion');
  assert(skill.includes('The status id is context, not a command-line flag.'), 'fixme-task should clarify how liveness status is carried on resume');
  const ticketModeSentences = skill.match(/^Ticket mode\. The orchestrator tracks pipeline progress via ticket state transitions\.$/gm) || [];
  assert(ticketModeSentences.length === 1, `ticket mode intro should appear once, got ${ticketModeSentences.length}`);
});

test('fixme-task skill: native ASK_USER pauses use durable attention when not user-facing', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('If `fixme-task` is running in a non-user-facing context (a parent-provided `parentContinuation` (transport `inline-skill` or `background`) or any parent-provided `<liveness>` status id), do not wait on normal text output.'), 'parent-driven/background native ASK_USER should not wait on hidden output');
  assert(skill.includes('Use the `lifecycle attention open` path below to store the complete Review Classification block'), 'native ASK_USER should store the full review block through checkpoint-first attention');
  assert(skill.includes('Direct user-facing runs may print the block and wait normally'), 'direct fixme-task should still allow normal user-facing prompts');
  assert(skill.includes('If attention mode is required but no current fixme-task liveness status id is available, stop with `FIXME_ATTENTION_BLOCKED`'), 'attention mode should fail closed without a task liveness id');
  assert(skill.includes('After a successful `lifecycle attention open`, do not send any ordinary `run ping` before returning `FIXME_ATTENTION_REQUIRED`'), 'attention mode should not ping over an active attention marker');
  assert(skill.includes('In attention mode, `--answer-attention` supplies the answer for ASK_USER Batching'), 'answer-attention should feed native ASK_USER batching');
  assert(skill.includes('Agent escalation prompts are user-input prompts. In attention mode, use the `lifecycle attention open` path'), 'agent escalation should use checkpoint-first durable attention when parent-driven');
  assert(skill.includes('Loop guard escalations are user-input prompts. In attention mode, use the `lifecycle attention open` path'), 'loop guard escalation should use checkpoint-first durable attention when parent-driven');
  assert(skill.includes('A loop guard escalation in parent-driven mode returns `FIXME_ATTENTION_REQUIRED: <attention-id>`, not a Run Summary'), 'parent-driven loop guard should not output a hidden run summary');
  assert(skill.includes('or after a loop guard triggers in direct standalone mode'), 'top-level run-summary rule should not imply nested loop guards emit summaries');
  assert(skill.includes('If a later user-input prompt needs attention, the missing parent status id triggers `FIXME_ATTENTION_BLOCKED`'), 'missing parent liveness fallback should not hide later prompt failures');
  assert(!skill.includes('Every review handler classification must be printed to the main conversation'), 'review visibility should not assume nested output reaches the main conversation');
  assert(!skill.includes('HAS_ASK_USER->ask then re-run'), 'manifest shorthand should not imply direct asking');
  assert(!skill.includes('batch questions to user (see ASK_USER Batching)'), 'native ASK_USER routing should not use stale direct-wait wording');
  assert(!skill.includes('or after a loop guard triggers. If you feel'), 'top-level run-summary rule should not keep unconditional loop-guard wording');
});

test('fixme-task skill: converts child attention requests into owned durable attention', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('FIXME_CHILD_ATTENTION_REQUIRED'), 'fixme-task should define child attention request directives');
  assert(skill.includes('convert the child request into `lifecycle attention open`'), 'fixme-task should create durable attention for child requests');
  assert(skill.includes('Child skills never persist task-owned decisions'), 'child skills should not own decision persistence');
});

test('fixme-pr-comments skill: brokers nested fixme-task attention without owning decisions', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('If child `fixme-task` returns `FIXME_ATTENTION_REQUIRED`'), 'PR comments should detect child task attention directives');
  assert(skill.includes('lifecycle attention broker show --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId>'), 'PR comments should render attention through the lifecycle broker');
  assert(skill.includes('lifecycle attention broker resume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --status-id <fixmeTaskStatusId>'), 'PR comments should answer and resume through broker resume');
  assert(skill.includes('Launch `fixme-task` with the returned `resume.message` only'), 'PR comments should launch only the helper-returned resume message');
  assert(skill.includes('lifecycle attention broker acknowledge-resume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --status-id <fixmeTaskStatusId>'), 'PR comments should acknowledge launched resume messages');
  assert(skill.includes('Do not compose `--resume <activeChild.resumeRef> --answer-attention <attention-id>` by hand'), 'PR comments should not hand-compose resume messages');
  assert(!skill.includes('Use the `resumeRef` returned by `lifecycle attention broker show`'), 'PR comments must not expect broker show to return resumeRef');
  assert(!skill.includes('call `lifecycle attention broker answer` with `{ "answer": "<user answer>", "answeredBy": "user", "answerKind": "decision" }`.'), 'PR comments should not document manual broker answer as the normal path');
  assert(!skill.includes('--nested'), 'PR comments should no longer reference --nested');
  assert(skill.includes('The status id is context, not a command-line flag.'), 'PR comments should clarify liveness status is not a CLI argument');
  assert(skill.includes('If the user response is a clarifying question, call the same command with `{ "answer": "<user answer>", "answeredBy": "user", "answerKind": "clarificationRequest" }`.'), 'PR comments should scope clarification requests at the answer-write step');
  assert(skill.includes('If the user asks a clarifying question instead of giving a decision, record it with `answerKind: "clarificationRequest"`'), 'PR comments should broker clarification requests without answering them');
  assert(skill.includes('If `lifecycle attention broker show` returns `status: "answered"`, do not print the prompt again.'), 'PR comments should resume already answered attention instead of re-prompting');
  assert(skill.includes('If the resumed `fixme-task` returns another `FIXME_ATTENTION_REQUIRED`, broker that new prompt the same way'), 'PR comments should broker clarification follow-up attention prompts');
  assert(skill.includes('Do not persist any task-owned decision; `fixme-task` resumes and writes decisions itself.'), 'PR comments should not own child task decisions');
});

test('fixme-pr-comments skill: dispatches fixme-task with returned prompt blocks', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const dispatchSection = skill.slice(
    skill.indexOf('#### Invoke fixme-task from launch transport'),
    skill.indexOf('When waiting or reporting status while the child pipeline is active')
  );
  assert(dispatchSection.length > 0, 'dispatch section should be found');
  assert(dispatchSection.includes('promptBlocks.taskStateOwner'), 'dispatch should include returned promptBlocks.taskStateOwner');
  assert(dispatchSection.includes('promptBlocks.parentContinuation'), 'dispatch should include returned promptBlocks.parentContinuation');
  assert(dispatchSection.includes('promptBlocks.activeChild'), 'dispatch should include returned promptBlocks.activeChild');
  assert(dispatchSection.includes('usageContext'), 'dispatch should include returned usageContext');
  assert(dispatchSection.includes('Render the child prompt from the returned `promptBlocks`'), 'dispatch should render returned promptBlocks instead of rebuilding prompt text');
  assert(dispatchSection.includes('Do not reconstruct these blocks manually from project, liveness, or fix-item fields'), 'dispatch should forbid manual reconstruction of returned prompt blocks');
  assert(dispatchSection.includes('Persist exactly the returned `activeChild` handle before advancing parent state to `awaitFixmeTask`'), 'dispatch should persist the exact returned activeChild before awaitFixmeTask');
  assert(!dispatchSection.includes('<liveness>\n      statusId: <fixmeTaskStatusId>\n      </liveness>'), 'dispatch should not hand-render the child liveness block');
});

test('fixme-task skill: task-state docs include the durable runtime fields', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const taskStateSection = skill.slice(skill.indexOf('## Task Resume State'), skill.indexOf('Resume mode:'));
  assert(taskStateSection.includes('"parentContinuation": null'), 'task-state example should include parentContinuation');
  assert(taskStateSection.includes('"decisions": []'), 'task-state example should include decisions array');
  assert(taskStateSection.includes('"terminalResult": null'), 'task-state example should include terminalResult');
  assert(taskStateSection.includes('The checkpoint data may update only `status`, `cursor`, `artifacts`, `handoff`, `loops`, `pendingDecision`, `parentContinuation`, `producerContinuations`, `decisions`, and `terminalResult`.'), 'checkpoint prose should include every durable field accepted by runtime validation');
  assert(taskStateSection.includes('Task-owned decisions are normally written with `task decision append`'), 'docs should prefer task decision append for task-owned decisions');
  assert(taskStateSection.includes('terminal task results are normally written with `task result write`'), 'docs should prefer task result write for terminal task results');
  assert(taskStateSection.includes('checkpoint validation supports the complete durable state shape'), 'docs should clarify checkpoint validation still accepts the complete durable shape');
});

function assertTaskBoundDecisionReader(skillDir, guardrailPhrase) {
  const skillPath = path.resolve(__dirname, '..', '..', skillDir, 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('task decision list --state <task-state-path> --format markdown'), `${skillDir} should name task decision list --format markdown on its task-bound read path`);
  assert(skill.includes('`markdown` field'), `${skillDir} should instruct reading the markdown field`);
  assert(skill.includes(guardrailPhrase), `${skillDir} should preserve its do-not-write guardrail`);
}

test('task-bound plan/review/handler readers consume decisions via task decision list', () => {
  assertTaskBoundDecisionReader('fixme-write-plan', 'Do not write `<fixme-dir>/decisions.md`');
  assertTaskBoundDecisionReader('fixme-review-plan', 'do not write `<fixme-dir>/decisions.md`');
  assertTaskBoundDecisionReader('fixme-handle-plan-review', 'do not write `<fixme-dir>/decisions.md`');
  assertTaskBoundDecisionReader('fixme-handle-code-review', 'do not write `<fixme-dir>/decisions.md`');
  assertTaskBoundDecisionReader('fixme-handle-spec-review', 'do not write `<fixme-dir>/decisions.md`');
});

test('task-bound spec-writer readers consume decisions via task decision list', () => {
  assertTaskBoundDecisionReader('fixme-write-product-spec', 'Do not write `<fixme-dir>/decisions.md`');
  assertTaskBoundDecisionReader('fixme-write-technical-spec', 'Do not write `<fixme-dir>/decisions.md`');
});

test('fixme-write-plan accepts readiness-driven plan revision inputs distinctly from handler fixes', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-write-plan', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('### Readiness-Driven Plan Revision Mode'), 'write-plan should define readiness-driven revision mode');
  assert(skill.includes('READINESS_RESULT: REVISE_PLAN'), 'write-plan should name the readiness revision trigger');
  assert(skill.includes('readiness blocking findings'), 'write-plan should accept readiness blocking findings');
  assert(skill.includes('Do not treat readiness findings as handler-classified FIX items.'), 'write-plan should keep readiness input distinct from handler output');
  assert(skill.includes('title, required plan change, evidence file references, and affected plan sections'), 'readiness findings should have required fields');
});

test('every task-bound reader names task decision list and the markdown field on its task-bound path', () => {
  const readers = [
    'fixme-write-plan', 'fixme-review-plan', 'fixme-handle-plan-review',
    'fixme-handle-code-review', 'fixme-handle-spec-review',
    'fixme-write-product-spec', 'fixme-write-technical-spec',
  ];
  for (const dir of readers) {
    const skill = fs.readFileSync(path.resolve(__dirname, '..', '..', dir, 'SKILL.md'), 'utf8');
    // The task-bound decision-read path must name the structured API and the markdown field,
    // and must gate the standalone direct-read on the task-state-owner contract.
    assert(skill.includes('task decision list --state <task-state-path> --format markdown'),
      `${dir} must name the structured task decision list call on its task-bound read path`);
    assert(/task decision list[\s\S]{0,400}?`markdown` field|`markdown` field[\s\S]{0,400}?task decision list/.test(skill),
      `${dir} must instruct reading the markdown field alongside the structured call`);
  }
});

test('lifecycle durable create/checkpoint helpers honor the retry contract', () => {
  // invocation start: identical replay returns existing; conflicting -> conflictingDuplicate
  const w = createUsageWorkspace();
  const startData = JSON.stringify({ skill: 'fixme-task', runtime: 'claude', role: 'orchestrator', idempotencyKey: 'sweep1' });
  const s1 = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${startData}'`, w.projectRoot, w.env);
  const s2 = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${startData}'`, w.projectRoot, w.env);
  assert(s1.ok && s2.ok && s1.data.invocationId === s2.data.invocationId, 'invocation start identical replay returns existing');
  const sConflict = runInDirWithEnv(`lifecycle invocation start --fixme-dir "${w.fixmeDir}" --data '${JSON.stringify({ skill: 'fixme-pr-comments', idempotencyKey: 'sweep1' })}'`, w.projectRoot, w.env);
  assert(!sConflict.ok && sConflict.data.error.code === 'conflictingDuplicate', 'invocation start conflict -> conflictingDuplicate');

  // dispatch prepare: identical replay returns existing dispatchId
  const fixmeDir = makeFixmeDir();
  const dData = JSON.stringify({ idempotencyKey: 'sweepd', agentName: 'fixme-task', transport: 'agent', promptInputs: {} });
  const d1 = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${dData}'`);
  const d2 = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${dData}'`);
  assert(d1.ok && d2.ok && d1.data.dispatchId === d2.data.dispatchId, 'dispatch prepare identical replay returns existing');

  // parent create + checkpoint: stale expectedRevision -> staleState
  const pFixmeDir = makeFixmeDir();
  const created = run(`lifecycle parent create --fixme-dir "${pFixmeDir}" --data '${parentCreateData()}'`);
  const cp1 = run(`lifecycle parent checkpoint --fixme-dir "${pFixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'sc1', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems', payload: { flags: {}, reviewItems: [{ id: 'r1' }] }, ledger: { reviewItems: [{ id: 'r1' }] } })}'`);
  assert(cp1.ok && cp1.data.revision === 1, 'parent checkpoint advances revision');
  const stale = run(`lifecycle parent checkpoint --fixme-dir "${pFixmeDir}" --parent-run-id ${created.data.parentRunId} --data '${JSON.stringify({ idempotencyKey: 'sc2', expectedRevision: 0, status: 'running', cursor: 'presentAnalysis', payload: { flags: {}, reviewItems: [{ id: 'r1' }], analysis: {}, routedGroups: {} }, ledger: { reviewItems: [{ id: 'r1' }] } })}'`);
  assert(!stale.ok && stale.data.error.code === 'staleState', 'parent checkpoint stale -> staleState');
});

test('documentation: durable attention broker and owner boundaries are consistent', () => {
  const brokerProhibition = 'Parent brokers must not run `task decision append`, `task checkpoint`, `run attention clear`, or `lifecycle dispatch prepare` after recording an attention answer.';
  const ownerConsumeRule = '`fixme-task` must consume answered attention with `lifecycle attention consume` before any liveness ping, status reset, or child dispatch.';
  const brokerResumeCommand = 'lifecycle attention broker resume';
  const brokerAckCommand = 'lifecycle attention broker acknowledge-resume';
  const brokerResumeRule = 'Parent brokers answer attention through `lifecycle attention broker resume`, launch the returned `resume.message`, then call `lifecycle attention broker acknowledge-resume` to persist resume-dispatch evidence.';
  const dataFlowBoundary = 'The broker answer path is `lifecycle attention broker resume` followed by `lifecycle attention broker acknowledge-resume`';
  const codexBrokerRule = 'When acting as a Fixme attention broker, call `lifecycle attention broker resume` to record or reuse the raw answer, launch the returned `fixme-task` resume message, then call `lifecycle attention broker acknowledge-resume`.';

  const fixmeSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme', 'SKILL.md'), 'utf8');
  const sessionSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-session', 'SKILL.md'), 'utf8');
  const prCommentsSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md'), 'utf8');
  const taskSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md'), 'utf8');
  const taskAgent = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'agents', 'fixme-task.md'), 'utf8');
  const toolsSkill = fs.readFileSync(path.resolve(__dirname, '..', 'SKILL.md'), 'utf8');
  const dataFlow = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-session', 'docs', 'data-flow.md'), 'utf8');
  const toolsSource = fs.readFileSync(TOOLS_PATH, 'utf8');

  for (const [name, content] of [
    ['fixme', fixmeSkill],
    ['fixme-session', sessionSkill],
    ['fixme-pr-comments', prCommentsSkill],
    ['fixme-task', taskSkill],
  ]) {
    assert(content.includes(brokerProhibition), `${name} should include the parent broker prohibition`);
    assert(content.includes(brokerResumeCommand), `${name} should name lifecycle attention broker resume`);
    assert(content.includes(brokerAckCommand), `${name} should name lifecycle attention broker acknowledge-resume`);
  }
  assert(taskSkill.includes(ownerConsumeRule), 'fixme-task skill should require lifecycle attention consume before resume work');
  assert(taskAgent.includes(ownerConsumeRule), 'fixme-task agent role should require lifecycle attention consume before resume work');
  assert(toolsSkill.includes(brokerResumeRule), 'fixme-tools docs should define the broker resume launch boundary');
  assert(toolsSkill.includes('lifecycle attention consume --fixme-dir'), 'fixme-tools docs should document lifecycle attention consume');
  assert(dataFlow.includes(dataFlowBoundary), 'session data-flow should document raw broker answer and task-owned consume/resume');
  assert(toolsSource.includes(codexBrokerRule), 'Codex adapter generation should include the broker safety rule');
});

test('fixme-session skill: tracks background fixme-task liveness status id', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('activeRunStatusId'), 'fixme-session should track activeRunStatusId');
  assert(skill.includes('lifecycle dispatch prepare --fixme-dir <fixme-dir>'), 'fixme-session should prepare the background dispatch via the lifecycle helper');
  assert(skill.includes('"transport":"background"'), 'fixme-session should dispatch fixme-task with background transport');
  assert(skill.includes('run status --fixme-dir <fixme-dir> --status-id <activeRunStatusId>'), 'status flow should read liveness status');
});

test('fixme-session data flow: documents background liveness state', () => {
  const dataFlowPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'docs', 'data-flow.md');
  const dataFlow = fs.readFileSync(dataFlowPath, 'utf8');
  assert(dataFlow.includes('`activeRunStatusId`'), 'session data-flow doc should name activeRunStatusId');
  assert(dataFlow.includes('The active background `fixme-task` run status id used for liveness and attention brokering.'), 'session data-flow doc should describe activeRunStatusId ownership');
  assert(dataFlow.includes('`activeParentRunId`'), 'session data-flow doc should name activeParentRunId');
  assert(dataFlow.includes('The parent run id used by `lifecycle attention broker resume` to validate the active background child.'), 'session data-flow doc should describe activeParentRunId ownership');
  assert(dataFlow.includes('`activeChild.resumeDispatch`'), 'session data-flow doc should describe resumeDispatch evidence');
  assert(dataFlow.includes('records `active_task`, `activeParentRunId`, and `activeRunStatusId`'), 'session dispatch flow should record all active task fields');
  assert(dataFlow.includes('clears `active_task` and `activeRunStatusId`'), 'session completion flow should clear both active task fields');
  assert(dataFlow.includes('Session file, ticket list, task output, run status'), 'session refresh points should include run status reads');
  assert(!dataFlow.includes('Legacy fallback states'), 'session data-flow doc must not document removed legacy fallback states');
  assert(!dataFlow.includes('investigating -> researching -> planning -> implementing -> verifying'), 'session data-flow doc must not document removed historical state chain');
});

test('fixme-session skill: brokers background fixme-task attention without owning decisions', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('If `run status` reports `currentCommand` in the form `attention:<attention-id>`'), 'session should detect background task attention');
  assert(skill.includes('lifecycle attention broker show --fixme-dir <fixme-dir> --status-id <activeRunStatusId>'), 'session should render attention through the lifecycle broker');
  assert(skill.includes('activeParentRunId'), 'session should persist the parent run id returned by prepare-child');
  assert(skill.includes('lifecycle attention broker resume --fixme-dir <fixme-dir> --parent-run-id <activeParentRunId> --status-id <activeRunStatusId>'), 'session should answer and resume through broker resume');
  assert(skill.includes('Launch the background `fixme-task` with the returned `resume.message` only'), 'session should launch only the helper-returned resume message');
  assert(skill.includes('lifecycle attention broker acknowledge-resume --fixme-dir <fixme-dir> --parent-run-id <activeParentRunId> --status-id <activeRunStatusId>'), 'session should acknowledge launched resume messages');
  assert(skill.includes('Do not compose `--resume <active_task> --answer-attention <attention-id>` by hand'), 'session should not hand-compose resume messages');
  assert(!skill.includes('Use the `resumeRef` returned by `lifecycle attention broker show`'), 'session must not expect broker show to return resumeRef');
  assert(skill.includes('The status id is context, not a command-line flag.'), 'session should clarify liveness status is not a CLI argument');
  assert(skill.includes('If the user response is a clarifying question, write `{ "answer": "<user answer>", "answeredBy": "user", "answerKind": "clarificationRequest" }` with the same command.'), 'session should scope clarification requests at the answer-write step');
  assert(!skill.includes('write `{ "answer": "<user answer>", "answeredBy": "user", "answerKind": "decision" }` with `lifecycle attention broker answer`.'), 'session should not document manual broker answer as the normal path');
  assert(skill.includes('If the user asks a clarifying question instead of giving a decision, record it with `answerKind: "clarificationRequest"`'), 'session should broker clarification requests without answering them');
  assert(skill.includes('If `lifecycle attention broker show` returns `status: "answered"`, do not print the prompt again.'), 'session should resume already answered attention instead of re-prompting');
  assert(skill.includes('If the resumed background `fixme-task` returns another `FIXME_ATTENTION_REQUIRED`, broker that new prompt the same way'), 'session should broker clarification follow-up attention prompts');
  assert(skill.includes('Do not persist any task-owned decision; the background `fixme-task` resumes and writes decisions itself.'), 'session should not own background task decisions');
});

test('fixme-session skill: dispatches background fixme-task with returned prompt blocks', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const dispatchSection = skill.slice(
    skill.indexOf('6. **Dispatch fixme-task in background:**'),
    skill.indexOf('7. **Return to conversation loop:**')
  );
  assert(dispatchSection.length > 0, 'session background dispatch section should be found');
  for (const fragment of [
    'launch.promptBlocks.taskStateOwner',
    'launch.promptBlocks.parentContinuation',
    'launch.promptBlocks.activeChild',
    'launch.promptBlocks.project',
    'launch.promptBlocks.liveness',
    'launch.promptBlocks.taskInput',
    'launch.usageContext',
  ]) {
    assert(dispatchSection.includes(fragment), `session dispatch should include ${fragment}`);
  }
  assert(dispatchSection.includes('Render the child prompt from the returned `launch.promptBlocks` plus `launch.usageContext`'), 'session dispatch should render returned prompt blocks and usage context');
  assert(dispatchSection.includes('Do not reconstruct these blocks manually'), 'session dispatch should forbid manual prompt reconstruction');
  assert(!dispatchSection.includes('<task>\n       Execute this task:'), 'session dispatch should not hand-render the task prompt block');
  assert(!dispatchSection.includes('<project>\n       Fixme dir: <fixme-dir>'), 'session dispatch should not hand-render the project prompt block');
  assert(!dispatchSection.includes('<liveness>\n       statusId: <statusId from lifecycle dispatch prepare>'), 'session dispatch should not hand-render the liveness prompt block');
  assert(!dispatchSection.includes('statusId: <statusId from lifecycle dispatch prepare>'), 'session dispatch should not reference lifecycle dispatch prepare status placeholders');
});

test('fixme-pr-comments skill: tracks nested fixme-task liveness status id', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('Parent run state (via `lifecycle parent *`), liveness, and attention brokering are the runtime-state carve-outs'), 'PR comments should permit parent-state, liveness, and attention carve-outs');
  assert(!skill.includes('except for liveness commands'), 'PR comments should not keep stale liveness-only carve-out wording');
  assert(!skill.includes('except for the liveness carve-out'), 'PR comments should not keep stale liveness-only carve-out prose');
  assert(!skill.includes('except for liveness carve-out'), 'PR comments should not keep stale liveness-only hard-constraint prose');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root'), 'PR comments should resolve the fixme dir for liveness');
  assert(skill.includes('lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>'), 'PR comments should persist parent state and prepare child launch through prepare-child');
  assert(!skill.includes('run start --fixme-dir <fixme-dir> --agent fixme-task'), 'PR comments should not pre-create child liveness outside prepare-child');
  assert(!skill.includes('lifecycle dispatch prepare --fixme-dir <fixme-dir>'), 'PR comments should not dispatch fixme-task through manual dispatch prepare');
  assert(skill.includes('lifecycle task-event consume --fixme-dir <fixme-dir> --parent-run-id <parentRunId> --next'), 'PR comments should consume terminal task events');
  assert(skill.includes('fixmeTaskStatusId'), 'PR comments should name the child fixme-task status id');
  assert(skill.includes('statusId: <fixmeTaskStatusId>'), 'child fixme-task args should include statusId');
  assert(skill.includes('run status --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId>'), 'parent wait loop should read child fixme-task liveness');
  assert(skill.includes('If `currentCommand` is `attention:<attention-id>`, follow the attention broker path before reporting coarse progress'), 'parent wait loop should broker attention instead of just reporting it');
});

test('fixme-brainstorm skill: tracks selected downstream fixme-task liveness', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('For `Run configured fixme-task workflow`, set `<selected-fixme-agent>` to `fixme-task`.'), 'brainstorm should map the fixme-task menu option to the fixme-task agent');
  assert(skill.includes('run start --fixme-dir <fixme-dir> --agent <selected-fixme-agent>'), 'brainstorm should create liveness before downstream dispatch');
  assert(skill.includes('statusId: <statusId from run start>'), 'brainstorm downstream args should include liveness statusId');
  assert(skill.includes('Do not dispatch the downstream skill if `run start` fails.'), 'brainstorm should fail closed when liveness setup fails');
});

test('fixme-brainstorm skill: labels routing options in B A C order with configured fixme-task recommended', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const menuStart = skill.indexOf('Options (single-select):');
  const menuEnd = skill.indexOf('`Run configured fixme-task workflow` is the recommended option.', menuStart);
  const menu = skill.slice(menuStart, menuEnd);
  const optionB = menu.indexOf('B. Run configured fixme-task workflow - recommended');
  const optionA = menu.indexOf('A. Write implementation plan');
  const optionC = menu.indexOf('C. Save only');

  assert(menuStart !== -1 && menuEnd !== -1, 'brainstorm routing menu should be present');
  assert(optionB !== -1, 'configured fixme-task option should be labeled B and recommended');
  assert(optionA !== -1, 'write plan option should be labeled A');
  assert(optionC !== -1, 'save only option should be labeled C');
  assert(optionB < optionA && optionA < optionC, 'routing options should be presented in B, A, C order');
  assert(!menu.includes('Run full fixme-task workflow'), 'routing menu should not imply the workflow named full');
});

test('fixme-brainstorm skill: dispatch and resumed task modes never show save or routing menus', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('In standalone direct mode, write the brainstorm document and present the routing menu.'), 'routing menu hard constraint should be scoped to standalone direct mode');
  assert(!skill.includes('Always write the brainstorm document and present the routing menu.'), 'routing menu hard constraint should not contradict dispatch mode');
  assert(skill.includes('### Step 9: Present the routing menu (standalone direct mode only)'), 'routing menu process step should be scoped to standalone direct mode');
  assert(skill.includes('Skip this step in dispatch mode or resumed saved-task mode.'), 'routing menu process step should explicitly skip dispatch and resumed saved-task modes');
  assert(skill.includes('In dispatch mode, never present the routing menu.'), 'dispatch mode should not show downstream routing choices');
  assert(skill.includes('If `resumeRef:` is present, treat this as an existing saved task continuation.'), 'brainstorm should recognize resumed saved task context');
  assert(skill.includes('Do not offer `Save only`, `Write implementation plan`, or `Run configured fixme-task workflow` in resumed or dispatch mode.'), 'resumed or dispatch mode should forbid duplicate save/routing options');
  assert(skill.includes('return `FIXME_CHILD_ATTENTION_REQUIRED`'), 'brainstorm should hand user prompts back to fixme-task when not user-facing');
});

test('fixme child skills: task-bound non-user-facing prompts return child attention requests', () => {
  for (const name of [
    'fixme-brainstorm',
    'fixme-investigate',
    'fixme-research',
    'fixme-write-product-spec',
    'fixme-write-technical-spec',
    'fixme-write-plan',
    'fixme-execute-plan',
    'fixme-browser-verify',
  ]) {
    const skillPath = path.resolve(__dirname, '..', '..', name, 'SKILL.md');
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('Task-Bound User Input Contract'), `${name} should define task-bound input routing`);
    assert(skill.includes('with `ownerSkill: fixme-task`'), `${name} should detect task-bound mode with camelCase ownerSkill`);
    assert(!skill.includes('owner_skill: fixme-task'), `${name} should not use snake_case owner_skill in task-bound mode detection`);
    assert(skill.includes('FIXME_CHILD_ATTENTION_REQUIRED'), `${name} should return child attention directives`);
    assert(skill.includes('Do not call AskUserQuestion or wait directly when running under `fixme-task`'), `${name} should not pause directly under fixme-task`);
  }
});

test('fixme review handlers: ASK_USER output never pauses directly', () => {
  for (const name of [
    'fixme-handle-spec-review',
    'fixme-handle-plan-review',
    'fixme-handle-code-review',
  ]) {
    const skillPath = path.resolve(__dirname, '..', '..', name, 'SKILL.md');
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('Handlers do not pause for user input; `fixme-task` presents ASK_USER and FIX_UNCLEAR questions.'), `${name} should leave user pauses to fixme-task`);
  }
});

test('fixme reviewers: task-bound uncertainty stays in report output', () => {
  for (const name of [
    'fixme-review-spec',
    'fixme-review-plan',
    'fixme-review-code',
  ]) {
    const skillPath = path.resolve(__dirname, '..', '..', name, 'SKILL.md');
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('Reviewers do not pause for task-bound user decisions.'), `${name} should not pause for task-bound user decisions`);
    assert(skill.includes('When running under `fixme-task`, put unresolved choices in the report'), `${name} should hand uncertainty to the handler`);
  }
});

test('fixme agent roles: task-bound user input follows durable attention contracts', () => {
  for (const name of [
    'fixme-write-product-spec',
    'fixme-write-technical-spec',
    'fixme-write-plan',
    'fixme-execute-plan',
    'fixme-investigate',
    'fixme-research',
    'fixme-browser-verify',
  ]) {
    const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', `${name}.md`);
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert(agent.includes('FIXME_CHILD_ATTENTION_REQUIRED'), `${name} agent should name the child attention directive`);
    assert(agent.includes('Do not call AskUserQuestion or wait directly when task-bound'), `${name} agent should forbid direct task-bound pauses`);
  }

  for (const name of [
    'fixme-review-spec',
    'fixme-review-plan',
    'fixme-review-code',
  ]) {
    const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', `${name}.md`);
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert(agent.includes('Reviewers do not pause for task-bound user decisions.'), `${name} agent should keep task-bound uncertainty in report output`);
  }

  for (const name of [
    'fixme-handle-spec-review',
    'fixme-handle-plan-review',
    'fixme-handle-code-review',
  ]) {
    const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', `${name}.md`);
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert(agent.includes('Handlers do not pause for user input; `fixme-task` presents ASK_USER and FIX_UNCLEAR questions.'), `${name} agent should leave user pauses to fixme-task`);
  }

  const taskAgentPath = path.resolve(__dirname, '..', '..', '..', 'agents', 'fixme-task.md');
  const taskAgent = fs.readFileSync(taskAgentPath, 'utf8');
  assert(taskAgent.includes('FIXME_CHILD_ATTENTION_REQUIRED'), 'fixme-task agent should route child attention directives');
  assert(taskAgent.includes('FIXME_ATTENTION_REQUIRED'), 'fixme-task agent should name the parent-visible attention directive');
  assert(taskAgent.includes('native review decisions, agent escalations, and loop guard escalations'), 'fixme-task agent should route every task-owned prompt through attention when nested');
  assert(taskAgent.includes('clarifying questions in attention answers'), 'fixme-task agent should handle clarification turns without decision-log writes');
  assert(taskAgent.includes('--answer-attention'), 'fixme-task agent should support answer-attention resumes');
});

test('fixme shared decision howtos: define format without overriding task-bound transport', () => {
  for (const name of [
    'fixme-howto-present-decisions',
    'fixme-howto-importance',
    'fixme-howto-write-product-spec',
    'fixme-howto-write-technical-spec',
    'fixme-howto-review-spec',
  ]) {
    const skillPath = path.resolve(__dirname, '..', '..', name, 'SKILL.md');
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('Transport is owned by the caller'), `${name} should not own prompt routing`);
    assert(skill.includes('Task-bound runs under `fixme-task` use the Task-Bound User Input Contract'), `${name} should point task-bound decisions to durable attention`);
  }
});

test('fixme-brainstorm skill: artifact does not write a downstream pipeline hint', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const templateStart = skill.indexOf('Document shape:');
  const templateEnd = skill.indexOf('### Step 9: Present the routing menu', templateStart);
  const template = skill.slice(templateStart, templateEnd);

  assert(templateStart !== -1 && templateEnd !== -1, 'brainstorm document template should be present');
  assert(!template.includes('## Recommended Next Step'), 'brainstorm artifact should not contain a recommended next-step route hint');
  assert(template.includes('## Handoff'), 'brainstorm artifact should contain a neutral handoff section');
  assert(template.includes('not a fixme-task pipeline hint'), 'handoff section should state it is not pipeline evidence');
});

test('fixme-task skill: ignores brainstorm handoff text for pipeline resolution', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Brainstorm document handoff sections are assistant-authored metadata, not pipeline evidence.'), 'fixme-task should treat brainstorm handoff text as ineligible pipeline evidence');
  assert(skill.includes('Do not select `plan-only` because a brainstorm artifact says to write an implementation plan.'), 'fixme-task should not convert brainstorm handoff text into plan-only');
  assert(skill.includes('Do not call `task save` or `task init` without `pipelineResolution`.'), 'fixme-task should require resolved pipeline data before task save/init');
});

test('fixme router: routes natural-language saved task preparation sequences', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Preparation work for a saved task mentioned in natural language'), 'router should define saved task preparation routing');
  assert(skill.includes('extract the saved task ref from any `FIXME-N` label in the prompt'), 'router should bind natural-language prep to FIXME labels');
  assert(skill.includes('Fixme Research followed by Fixme Brainstorm'), 'router should preserve research then brainstorm sequencing');
  assert(skill.includes('Skill("fixme-research", "--task <ref>'), 'router should dispatch research with task binding');
  assert(skill.includes('Skill("fixme-brainstorm", "--task <ref>'), 'router should dispatch brainstorm with task binding');
});

test('fixme preparation skills: attach artifacts to implicit saved task refs', () => {
  const brainstormPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const researchPath = path.resolve(__dirname, '..', '..', 'fixme-research', 'SKILL.md');
  const brainstorm = fs.readFileSync(brainstormPath, 'utf8');
  const research = fs.readFileSync(researchPath, 'utf8');

  for (const [name, skill] of [['fixme-brainstorm', brainstorm], ['fixme-research', research]]) {
    assert(skill.includes('Saved Task Binding'), `${name} should define saved task binding`);
    assert(skill.includes('extract a `FIXME-N` label from the natural-language prompt'), `${name} should bind implicit FIXME labels`);
    assert(skill.includes('task attach-artifact --task <ref> --data'), `${name} should attach generated artifacts through fixme-tools`);
    assert(skill.includes('Do not search by recency for a task to attach to'), `${name} should reject recency-based task attachment`);
  }
});

test('fixme-brainstorm skill: only presents verified feasible approach options', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('### Step 6: Feasibility gate'), 'brainstorm should gate approaches before presenting options');
  assert(skill.includes('Only present approaches whose hard requirements have been verified.'), 'brainstorm should require verified feasibility for selectable approaches');
  assert(skill.includes('Do not ask the user to choose between an unverified option and a verified option.'), 'brainstorm should not mix unverified and verified options');
  assert(skill.includes('If fewer than two verified approaches remain, recommend the single verified route instead of manufacturing a choice.'), 'brainstorm should allow a single verified route');
  assert(skill.includes('unproven alternatives'), 'brainstorm should park unverified routes outside the option menu');
});

test('fixme-research skill: approach candidates require feasibility evidence', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-research', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('### Phase 4: Verify Feasibility and Identify Approach Candidates'), 'research should verify feasibility before naming candidates');
  assert(skill.includes('A route is an approach candidate only after every hard requirement has supporting evidence.'), 'research candidates should require evidence for hard requirements');
  assert(skill.includes('If a route depends on an SDK, package, external API, runtime, build target, or deployment owner you have not verified, it is not a candidate yet.'), 'research should reject unverified dependency and runtime routes');
  assert(skill.includes('Do not put unproven routes in `## Approach Candidates`.'), 'research should keep unproven routes out of candidate list');
  assert(skill.includes('## Unproven Alternatives'), 'research output should have a place for unverified routes');
});

test('fixme-task skill: Run Summary includes usage block backed by usage report', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('### Usage'), 'Run Summary template should include Usage section');
  assert(skill.includes('usage report --scope project --pipeline-run-id <pipelineRunId> --format json'), 'Run Summary should call usage report for pipeline');
  assert(skill.includes('orchestrator overhead'), 'usage summary should mention orchestrator overhead');
  assert(skill.includes('child usage subtotal'), 'usage summary should mention child usage subtotal');
  assert(skill.includes('v1 does not include per-phase usage'), 'per-phase usage should remain out of scope');
});

test('fixme-task skill: --save stops only when no continue intent is present', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('## Save Mode'), 'fixme-task should document save mode');
  assert(skill.includes('/fixme-task --save'), 'save mode invocation should be documented');
  assert(skill.includes('Save to `<fixme-dir>/tasks/<date>-FIXME-<number>-<slug>.md`'), 'saved tasks should include the FIXME label in the filename');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data-file <task-save.json>'), 'save mode should delegate saved task writes to fixme-tools with a data-file');
  assert(skill.includes('### Save Mode Lossless Handoff Gate'), 'save mode should define the lossless handoff gate');
  assert(skill.includes('### Save Mode Question Resolution Gate'), 'save mode should define question resolution before saving');
  assert(skill.includes('A future run must be able to plan and execute from the task file alone, with no chat history.'), 'save mode should state the task file is the context boundary');
  assert(skill.includes('Do not compress a rich discussion into only a title and one-sentence goal.'), 'save mode should forbid lossy save summaries');
  assert(skill.includes('The CLI rejects skeletal handoffs that omit concrete `settledSolutionShape`, `agreedApproach`, `userVisibleBehavior`, `scope.inScope`, or `laterPlanningNotes`.'), 'save mode should document the CLI fail-closed guard');
  assert(skill.includes('It also rejects non-empty `openQuestions`.'), 'save mode should document unresolved question rejection');
  assert(skill.includes('task init --ticket <ticket-path> --pipeline-resolution-file <pipeline-resolution.json> --project-root <project-root>'), 'ticket mode should initialize task state through fixme-tools with a data-file');
  assert(skill.includes('task checkpoint --state <task-state-path> --data-file <checkpoint.json>'), 'fixme-task should checkpoint resumable state through fixme-tools with a data-file');
  assert(skill.includes('task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>'), 'resume mode should resolve task references through fixme-tools');
  assert(skill.includes('camelCase JSON keys only'), 'task state JSON requirement should be explicit');
  assert(skill.includes('Do not persist `currentSpecificationPath`, numbered manifest steps, or `currentStep`'), 'task state should exclude derived aliases and numbered manifest data');
  assert(skill.includes('The title is always auto-generated from the resolved task context.'), 'title generation should be automatic');
  assert(skill.includes('Do not ask the user for a title.'), 'save mode should not prompt for titles');
  assert(skill.includes('If no task, issue, solution approach, agreed shape, or explicit artifact exists in arguments, IDE selection, or conversation context, abort'), 'save mode should abort when there is no task context');
  assert(skill.includes('Save intent can be terminal or non-terminal depending on the rest of the instruction.'), 'save mode should not be unconditionally terminal');
  assert(skill.includes('If the user only asks to save, write the saved task brief and stop before manifest creation, config loading, ticket transitions, or agent dispatch.'), 'save-only instructions should remain terminal');
  assert(skill.includes('If the user explicitly asks to continue, proceed, run, plan, execute, implement, or otherwise continue the workflow after saving, write the saved task brief first, then continue into the selected or auto-detected pipeline using the saved task brief as task context.'), 'save-and-continue instructions should continue after saving');
  assert(skill.includes('If save intent and continuation intent are ambiguous, stop and ask the user which behavior they want. Do not guess.'), 'ambiguous save instructions should ask instead of guessing');
  assert(skill.includes('No-ticket mode, including parent-driven dispatches (transport `inline-skill`/`background` with `parentContinuation`), must still create or reuse durable task state before the first phase dispatch.'), 'no-ticket parent-driven dispatches should still have durable task state');
  assert(skill.includes('task init --state <activeChild.taskStatePath>'), 'parent-driven no-ticket runs should materialize the reserved activeChild task state');
  assert(skill.includes('Use `activeChild.resumeRef` for later `--answer-attention` resumes.'), 'nested no-ticket attention should resume from the activeChild boundary');
  assert(skill.includes('Do not dispatch agents, create a manifest, transition tickets, or enter Config Loading only when save is terminal.'), 'terminal save output should be conditional');
  assert(skill.includes('TASK_PATH: <absolute path to saved task brief>'), 'save mode should output a task path directive');
  assert(skill.includes('Label: `FIXME-<number>`'), 'save mode should generate a visible task label');
  assert(skill.includes('The counter file stores the next available task number.'), 'save mode should define counter semantics');
  assert(skill.includes('The CLI reads and updates `<fixme-dir>/tasks/.counter`'), 'save mode should delegate counter handling to the CLI');
  assert(skill.includes('If the counter file is missing, the CLI uses `1` as the next number.'), 'save mode should initialize missing counters');
  assert(skill.includes('If the counter file exists but is not a positive integer, the CLI aborts'), 'save mode should not guess on corrupt counters');
  assert(skill.includes('Saved [FIXME-<number>](<absolute path to saved task brief>)'), 'save mode should print a clickable label link');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data-file <task-save.json>'), 'orchestrator allowlist should permit task save through data-file');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task checkpoint --state <task-state-path> --data-file <checkpoint.json>'), 'orchestrator allowlist should permit task checkpoint through data-file');
});

test('fixme-rebase skill: clean verified rebase pushes by default unless --no-push is set', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('argument-hint: "[branch-to-rebase] [--base <branch>] [--no-push] [--confirm]"'), 'argument hint should document branch-to-rebase, --base, --no-push, and --confirm');
  assert(skill.includes('Push is default when `--no-push` is absent and verification passed.'), 'auto-push default should be explicit');
  assert(skill.includes('If `--no-push` is present: do not push automatically. Present the exact push command and wait for confirmation.'), '--no-push should restore confirmation flow');
  assert(skill.includes('git push --force-with-lease origin <branch>'), 'force-with-lease command should remain documented');
  assert(!skill.includes('**Wait for explicit confirmation. Do not push.**'), 'old default confirmation gate should be removed');
});

test('fixme-rebase skill: --confirm is the only pre-execution confirmation gate', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Treat `--confirm` as a workflow flag.'), '--confirm should be parsed as a workflow flag');
  assert(skill.includes('Set `CONFIRM_BEFORE_EXECUTION=true` when present, `CONFIRM_BEFORE_EXECUTION=false` when absent.'), '--confirm should enable pre-execution confirmation and default off');
  assert(skill.includes('That argument is the **branch to rebase** (the branch that will be moved), NOT the base.'), 'positional argument should be the branch to rebase, not the base');
  assert(skill.includes('By default, Phase 2.5 is informational, not a confirmation gate.'), 'onto detection should not pause by default');
  assert(skill.includes('If `--confirm` is absent and detection result is DETECTED, set `REBASE_MODE` = "onto" and proceed to Phase 3 with the detected `FORK_POINT`.'), 'detected onto rebase should proceed by default');
  assert(skill.includes('When `--confirm` is present, this summary becomes the single pre-execution confirmation gate.'), '--confirm should add one pre-execution gate after analysis');
  assert(skill.includes('When `--confirm` is absent, proceed directly to Phase 4 after presenting the summary.'), 'default path should proceed after analysis summary');
  assert(!skill.includes('mandatory, non-negotiable user confirmation gate for any `--onto` recommendation'), 'old unconditional onto confirmation gate should be removed');
  assert(!skill.includes('The user always confirms before execution.'), 'old unconditional confirmation statement should be removed');
});

test('fixme-rebase skill: stale current upstream recommends verified force-push reconciliation', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Use `Cause: verified - previous local rebase was not pushed` only when'), 'stale upstream cause should name the previous unpushed rebase only when verified');
  assert(skill.includes('Cause: remote-only commits are represented locally, but the exact divergence cause is unverified'), 'fallback cause should avoid over-claiming an unpushed rebase');
  assert(!skill.includes('Cause: <verified|likely> - previous local rebase was not pushed'), 'status template must not label unverified causes as likely unpushed rebases');
  assert(skill.includes('git for-each-ref --format'), 'stale upstream check should inspect previous rebase backup refs');
  assert(skill.includes('Recommended reconciliation'), 'stale upstream gate should recommend the concrete reconciliation step');
  assert(skill.includes('git push --force-with-lease <remote> <branch>'), 'stale upstream gate should give the exact force-push shape');
  assert(skill.includes('wait for explicit approval before running the force-push'), 'mid-flow force-push should remain an explicit approval gate');
  assert(skill.includes('Do not use a `D1` decision card'), 'stale upstream handling should not fabricate a decision card');
});

test('fixme-rebase skill: positional argument is the branch to rebase and --base sets the target', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  // --base provides the rebase target; positional provides the branch to move.
  assert(skill.includes('Treat `--base <branch>` (or `--base=<branch>`) as the base branch to rebase ONTO.'), '--base should set the rebase target');
  assert(skill.includes('Set `BASE_ARG` to its value'), '--base value should be captured as BASE_ARG');
  assert(skill.includes('the branch to rebase defaults to the current branch'), 'missing positional should default the rebased branch to current');

  // The four documented interpretations.
  assert(skill.includes('`/fixme-rebase` -> rebase current branch onto auto-detected base.'), 'no-arg interpretation documented');
  assert(skill.includes('`/fixme-rebase feat/x` -> rebase `feat/x` onto auto-detected base.'), 'positional-only interpretation documented');
  assert(skill.includes('`/fixme-rebase --base develop` -> rebase current branch onto `develop`.'), '--base-only interpretation documented');
  assert(skill.includes('`/fixme-rebase feat/x --base develop` -> rebase `feat/x` onto `develop`.'), 'positional-plus-base interpretation documented');

  // A named branch that does not exist is an error, not a fallback to current.
  assert(skill.includes('a named branch that doesn\'t exist is an error, not a default'), 'nonexistent rebase branch should stop, not default to current');

  // Phase 1 resolves the base from --base, not from a positional.
  assert(skill.includes('Check for an explicit `--base` argument:'), 'Phase 1 should resolve base from --base');
  assert(!skill.includes('argument-hint: "[base-branch] [--no-push] [--confirm]"'), 'old base-branch-positional argument hint should be gone');
});

test('fixme-rebase skill: off-current-branch checkout stays on the rebased branch', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Switch to the branch to rebase (only if it differs from the current branch):'), 'skill should check out the named branch when it differs');
  assert(skill.includes('git checkout <REBASE_BRANCH>'), 'checkout of the rebased branch should be documented');
  assert(skill.includes('never switches back to `<STARTED_ON_BRANCH>`'), 'skill should stay on the rebased branch, never restoring the original');
  assert(skill.includes('Record `STARTED_ON_BRANCH`'), 'the starting branch should be recorded');
  // Protected check applies to the branch being rebased, not the base.
  assert(skill.includes('a protected branch is fine as the `--base` target'), 'protected base should be allowed');
});

test('fixme-rebase skill: dirty tree stops and asks with stash/discard/abort and same-branch pop rule', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  // No silent auto-stash anymore - stop and ask.
  assert(skill.includes('Handle uncommitted changes (stop and ask - never auto-stash or auto-discard):'), 'dirty tree should stop and ask, never auto-stash');
  assert(skill.includes('1. Stash - save them with `git stash`, then proceed'), 'stash option documented');
  assert(skill.includes('2. Discard - permanently delete them, then proceed'), 'discard option documented');
  assert(skill.includes('3. Abort - do nothing, leave the working tree exactly as it is'), 'abort option documented');
  assert(skill.includes('git reset --hard HEAD'), 'discard should reset tracked changes');
  assert(skill.includes('git clean -fd'), 'discard should remove untracked files');

  // Stash pop rule: pop only when the rebased branch is the started-on branch.
  assert(skill.includes('Record `STASH_IS_SAME_BRANCH = (REBASE_BRANCH == STARTED_ON_BRANCH)`'), 'stash pop rule flag should be recorded');
  assert(skill.includes('the stash is popped only when the rebased branch is the one the user started on'), 'same-branch pop rule should be documented');
  assert(skill.includes('**`STASH_IS_SAME_BRANCH=false`**'), 'cross-branch case should be handled explicitly');

  // The dirty-tree gate fires an alert and is listed as a user-pause gate.
  assert(skill.includes('Phase 0 dirty-tree choice (stash / discard / abort)'), 'dirty-tree gate should be registered as a user-pause gate');
});

test('fixme-rebase skill: same-or-worse merge fallback continues rebase without route prompt', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Compare the rebase conflict set with the merge alternative before asking the user.'), 'skill should compare conflict sets before route prompt');
  assert(skill.includes('If the merge conflict set is identical to or more complex than the rebase conflict set, do not ask for a route choice. Continue with rebase conflict resolution.'), 'same-or-worse merge should auto-continue rebase');
  assert(skill.includes('Present route options only when merge is materially cleaner than rebase.'), 'route prompt should be limited to cleaner merge fallback');
  assert(!skill.includes('3. **Present options to user:**'), 'old unconditional route prompt should be removed');
});

test('fixme-pr-comments skill: fetches three GitHub surfaces and normalizes review items', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Fetch three GitHub API surfaces'), 'skill should define GitHub storage surfaces generically');
  assert(skill.includes('inline_review_threads'), 'skill should include inline review thread surface');
  assert(skill.includes('issue_comments'), 'skill should include PR issue comment surface');
  assert(skill.includes('pull_request_reviews'), 'skill should include top-level PR review body surface');
  assert(skill.includes('gh api repos/{owner}/{repo}/pulls/{number}/reviews --paginate'), 'skill should fetch PR reviews endpoint with pagination');
  assert(skill.includes('Normalize every fetched container into `review_item` records'), 'skill should normalize fetched containers before analysis');
  assert(skill.includes('chatgpt-codex-connector[bot]'), 'Codex connector reviews should be explicitly covered');
  assert(skill.includes('pull_request_review: reply target is the PR issue comment stream'), 'reply table should include PR review body handling');
  assert(!skill.includes('Source E:'), 'skill should not grow the old source taxonomy');
  assert(!skill.includes('Fetch Sources A-E'), 'manifest should not use source-letter fetching');
});

test('fixme-pr-comments skill: triages comments by risk, complexity, confidence, and route', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('VERDICT: FIX | FIX_UNCLEAR | ASK_USER | REJECT_FALSE_POSITIVE | REJECT_ALREADY_FIXED | REJECT_WONT_FIX | FOLLOWUP_ONLY'), 'PR comments should include follow-up-only verdicts');
  assert(skill.includes('SEVERITY: BLOCKER | MAJOR | MINOR | INFO'), 'PR comments should classify severity');
  assert(skill.includes('COMPLEXITY: LOW | MEDIUM | HIGH'), 'PR comments should classify implementation complexity');
  assert(skill.includes('CONFIDENCE: HIGH | MEDIUM | LOW'), 'PR comments should classify analysis confidence');
  assert(skill.includes('ROUTE: CURRENT_PR_FIX | DECISION | FOLLOWUP | NO_ACTION'), 'PR comments should classify execution route');
  assert(skill.includes('ROUTE_SCOPE: PLAN_REQUIRED | IMPLEMENT_ONLY | NONE'), 'PR comments should classify route scope');
  assert(skill.includes('severity decides importance, complexity decides execution shape, confidence decides autonomy'), 'triage dimensions should have separate responsibilities');
  assert(skill.includes('BLOCKER findings always route to CURRENT_PR_FIX.'), 'blockers should always enter current PR fix scope');
  assert(skill.includes('MAJOR + LOW or MEDIUM complexity + HIGH confidence routes to CURRENT_PR_FIX.'), 'low-cost high-confidence major fixes should run now');
  assert(skill.includes('MINOR + MEDIUM or HIGH complexity routes to FOLLOWUP unless the user explicitly asks to include it.'), 'high-cost minor items should not consume the PR fix loop by default');
  assert(skill.includes('INFO never triggers fixme-task dispatch.'), 'info items should never dispatch fixme-task');
  assert(skill.includes('LOW confidence on validity routes to ASK_USER.'), 'low-confidence validity should require user input');
  assert(skill.includes('Start with the outcome'), 'presentation should start with the reader outcome');
  assert(skill.includes('**Recommended next action**:'), 'presentation should include a clear recommendation near the top');
  assert(skill.includes('Section order is fixed:'), 'presentation should prioritize important items before accounting');
  assert(skill.includes('### Current PR Fixes'), 'presentation should include current PR fixes after the priority summary');
  assert(skill.includes('**Problem**:'), 'issue cards should name the actual problem');
  assert(skill.includes('**Impact if not fixed**:'), 'issue cards should explain impact');
  assert(skill.includes('**Why this route**:'), 'issue cards should explain routing tradeoffs');
  assert(skill.includes('### Accounting Ledger'), 'full accounting should move to the end');
  assert(skill.includes('Use bullets, not a markdown table.'), 'presentation should forbid table-first output');
  assert(!skill.includes('ID | Items | Verdict | Severity | Complexity | Confidence | Route | Scope | Files'), 'old table-first triage format should be removed');
  assert(skill.includes('Do not expand them as evidence cards'), 'presentation should avoid expanding every low-risk item');
  assert(skill.includes('For each decision group, use `fixme-howto-present-decisions` exactly.'), 'PR comment decisions should reuse the shared decision presentation skill');
  assert(skill.includes('Do not restate, summarize, or locally redefine its decision-card fields in this skill.'), 'PR comment skill should not duplicate decision-card formatting');
  assert(skill.includes('If after consultation zero `CURRENT_PR_FIX` groups remain'), 'routing should dispatch only current PR fixes');
  assert(skill.includes('## Current-Fix Proof Gate'), 'PR comment triage should require decisive proof before current-fix routing');
  assert(skill.includes("State the claim as one falsifiable sentence, without the reviewer's proposed fix."), 'proof gate should strip reviewer fix anchoring from the core claim');
  assert(skill.includes('Identify the one decisive code/API/runtime fact.'), 'proof gate should force the decisive fact before routing');
  assert(skill.includes('Local shape is a lead, not proof.'), 'proof gate should reject local-shape-only evidence');
  assert(skill.includes('For key, ID, dedupe, cache, queue, lock, retry, or refresh comments, the decisive fact is usually the downstream side effect keyed by that value, not the payload shape.'), 'proof gate should point key and dedupe comments at downstream side effects');
});

test('fixme-pr-comments skill: zero current fixes proceeds to reply resolution without confirmation', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('When zero `CURRENT_PR_FIX` groups remain and replies are needed, Step 14 runs in the same turn as the Step 4 presentation.'), 'zero-fix route should run Step 14 immediately');
  assert(skill.includes('Do not ask whether to proceed with replies, thread resolution, or hand-picked fixes.'), 'zero-fix route should forbid reply confirmation prompts');
  assert(skill.includes('The Step 14 reply/resolve execution is the closing action - not a prompt to the user.'), 'Step 14 should close with action, not confirmation');
});

test('fixme-pr-comments skill: late-thread recheck runs only after reply and resolve', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const manifest = skill.slice(skill.indexOf('### The Manifest'), skill.indexOf('### Routing Rules'));
  const step14 = manifest.indexOf('Step 14  [resolve]');
  const step15 = manifest.indexOf('Step 15  [final-check]');
  const step16 = manifest.indexOf('Step 16  [done]');

  assert(step14 !== -1, 'manifest should keep Step 14 as reply/resolve');
  assert(step15 !== -1, 'manifest should include final late-comment check after resolve');
  assert(step16 !== -1, 'manifest should move run summary to Step 16');
  assert(step14 < step15 && step15 < step16, 'final late-comment check should be ordered after reply/resolve and before done');
  assert(skill.includes('Do not run the final unresolved-thread check until Step 14 has posted every required reply, completed every allowed `resolveReviewThread` mutation, and verified those target thread states.'), 'final check should be blocked until reply/resolve work is complete');
  assert(skill.includes('If late unresolved threads are found, restart the fetch/analyze path from Step 1 using all three GitHub surfaces; do not handle them as ad hoc one-offs.'), 'late threads should restart the normal fetch/analyze path');
  assert(skill.includes('Step 13 (resolve/route)**: If `--skip-resolve` is set, jump to Step 16.'), 'skip-resolve should bypass the final unresolved-thread loop');
});

test('fixme-pr-comments skill: future-phase handling is follow-up, not rejection', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('If a valid concern still needs action in another PR, phase, ticket, TODO, or cleanup commit, classify it as `FOLLOWUP_ONLY`, not `REJECT_WONT_FIX`.'), 'future work should be follow-up, not rejection');
  assert(skill.includes('Do not write `Follow-Up Only: None` while also saying an item will be handled by another PR, phase, ticket, TODO, or cleanup commit.'), 'follow-up section should not contradict deferred handling');
  assert(skill.includes('A later branch can justify `REJECT_ALREADY_FIXED` or `REJECT_WONT_FIX` only when the exact flagged code path is already removed or replaced and no remaining action is required before the stacked work ships.'), 'supersession rejection should require already-complete replacement');
});

test('fixme review workflows require evidence before accepting reviewer claim premises', () => {
  const prCommentsPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const handlerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-handle-spec-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-plan-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md'),
  ];
  const reviewerPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const planReviewerPath = path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md');
  const prComments = fs.readFileSync(prCommentsPath, 'utf8');
  const handlers = handlerPaths.map(handlerPath => fs.readFileSync(handlerPath, 'utf8'));
  const reviewer = fs.readFileSync(reviewerPath, 'utf8');
  const planReviewer = fs.readFileSync(planReviewerPath, 'utf8');

  for (const skill of [prComments, ...handlers]) {
    assert(skill.includes('## Review Claim Verification Gate'), 'classification should include a review claim verification gate');
    assert(skill.includes('A reviewer claim is a hypothesis, not evidence.'), 'classification should treat reviewer claims as hypotheses');
    assert(skill.includes('Break the finding into atomic premises before assigning any FIX'), 'classification should decompose findings into premises');
    assert(skill.includes('If an essential premise is unverified, contradicted, or only supported by lexical similarity, do not route the item'), 'classification should block unverified premise routing');
    assert(skill.includes('For duplicate, redundant, or equivalent-parameter claims, prove semantic equivalence before accepting the finding.'), 'classification should verify duplicate/equivalent-parameter claims');
    assert(skill.includes('Lexical similarity is not evidence of duplication.'), 'classification should reject surface similarity as evidence');
    assert(skill.includes('Evidence receipts'), 'classification output should expose evidence receipts');
  }

  for (const handler of handlers) {
    assert(handler.includes('## Fix Classification Proof Gate'), 'review handlers should require decisive proof before fix classification');
    assert(handler.includes("State the claim as one falsifiable sentence, without the reviewer's proposed fix."), 'review handlers should strip reviewer fix anchoring from the core claim');
    assert(handler.includes('Identify the one decisive code/spec/API/runtime fact.'), 'review handlers should force the decisive fact before classification');
    assert(handler.includes('Local shape is a lead, not proof.'), 'review handlers should reject local-shape-only evidence');
    assert(handler.includes('For key, ID, dedupe, cache, queue, lock, retry, or refresh findings, the decisive fact is usually the downstream side effect keyed by that value, not the payload shape.'), 'review handlers should point key and dedupe findings at downstream side effects');
  }

  assert(reviewer.includes('## Semantic Equivalence Gate for Duplication Findings'), 'reviewer should gate duplicate findings on semantic equivalence');
  assert(reviewer.includes('Do not report duplicate, redundant, or equivalent parameters until semantic equivalence is proven.'), 'reviewer should not report duplicate parameters without proof');
  assert(reviewer.includes('Two values that look similar may encode different protocol versions, transports, network roles, runtime layers, or consumer contracts.'), 'reviewer should account for distinct semantics behind similar values');
  assert(reviewer.includes('If semantic equivalence is not proven, do not emit a finding.'), 'reviewer should suppress unproven duplication findings');
  assert(planReviewer.includes('## Semantic Equivalence Gate for Plan-Level Duplication Findings'), 'plan reviewer should gate plan-level duplication findings on semantic equivalence');
  assert(planReviewer.includes('Do not report plan-level duplicate, redundant, or equivalent parameters until semantic equivalence is proven.'), 'plan reviewer should not report duplicate planned parameters without proof');
  assert(planReviewer.includes('Lexical similarity is not evidence of duplication.'), 'plan reviewer should reject surface similarity as evidence');
});

test('fixme-review-code skill requires inventory-driven first-pass completeness checks', () => {
  const reviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const review = fs.readFileSync(reviewPath, 'utf8');

  for (const required of [
    '### First-Pass Completeness Protocol',
    'Build a compact review inventory before identifying findings.',
    'changed source files',
    'changed test files',
    'plan steps',
    'critical invariants',
    'touched side effects',
    'new helpers, types, config keys, generated artifacts, public surfaces, and external contracts',
    'Risk-rank every inventory item before reviewing it.',
    'Deep review is mandatory for lifecycle and state transitions, retries, auth, deletion, generated artifacts, config or schema changes, tests, duplicated helpers, public APIs, and behavior with side effects or broad blast radius.',
    'Run fixed-order dimension passes over the inventory:',
    'lifecycle and critical invariants',
    'plan compliance',
    'artifact wiring and data flow',
    'test quality',
    'stub detection',
    'correctness',
    'duplication and simplicity',
    'conventions and anti-patterns',
    'Every changed file with no finding must have a terse Verified OK note naming what was checked.',
    'Every high-risk dimension with no finding must have a terse Verified OK note naming why it passed.',
    'The phrase "looks good" is not a valid Verified OK note.',
    '### Mandatory Pre-Output Self-Challenge',
    'Which touched file produced no findings?',
    'Which high-risk dimension produced no findings?',
    'Which plan step changed behavior but produced no finding or Verified OK note?',
    'Which test could be wrong even if production code is right?',
    'Which finding category was not exercised at all?',
  ]) {
    assert(review.includes(required), `review code skill should require: ${required}`);
  }

  for (const uniqueHeading of [
    '### Pass 1: Investigation',
    '### Mandatory Pre-Output Self-Challenge',
    '### Pass 2: Report',
  ]) {
    const firstIndex = review.indexOf(uniqueHeading);
    assert(firstIndex !== -1, `${uniqueHeading} should exist`);
    assert(firstIndex === review.lastIndexOf(uniqueHeading), `${uniqueHeading} should appear exactly once`);
  }

  const processIndex = review.indexOf('## Two-Pass Review Process');
  const pass1Index = review.indexOf('### Pass 1: Investigation');
  const challengeIndex = review.indexOf('### Mandatory Pre-Output Self-Challenge');
  const pass2Index = review.indexOf('### Pass 2: Report');
  const reviewAssessmentIndex = review.indexOf('## Review assessment');
  assert(processIndex !== -1 && reviewAssessmentIndex !== -1, 'process and review assessment headings should exist');
  assert(pass1Index < challengeIndex && challengeIndex < pass2Index, 'self-challenge should run after Pass 1 investigation and before Pass 2 report');
  assert(processIndex < pass1Index && pass2Index < reviewAssessmentIndex, 'Review assessment should remain after the single new process block');
});

test('fixme decision presentation skill: uses visually scannable cards', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-howto-present-decisions', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('## Visual Layout Contract'), 'decision skill should define a visual layout contract');
  assert(skill.includes('Decision cards must read like designed cards, not logs.'), 'decision cards should optimize for readability');
  assert(skill.includes('**Recommendation**: {specific recommendation}'), 'recommendation should be near the top of every card');
  assert(skill.includes('**At a glance**:'), 'cards should include an at-a-glance summary block');
  assert(skill.includes('- **Context**: {where we are in the product, workflow, or system}'), 'at-a-glance block should include context');
  assert(skill.includes('- **Problem**: {the concrete issue or ambiguity}'), 'at-a-glance block should include the problem');
  assert(skill.includes('- **Impact**: {what breaks, degrades, or remains blocked if undecided}'), 'at-a-glance block should include impact');
  assert(skill.includes('- **Why now**:'), 'at-a-glance block should include urgency');
  assert(skill.includes('Each option is a mini-card.'), 'options should be visually separated mini-cards');
  assert(skill.includes('**Tradeoff**: {the decisive cost or compromise of this option}'), 'options should explicitly name tradeoffs');
  assert(skill.includes('Do not place more than one sentence after a bold label.'), 'decision cards should avoid dense label paragraphs');
});

test('fixme-task skill: consumes PR comment triage metadata to reduce unnecessary cycles', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Incoming PR comment fix items may include VERDICT, SEVERITY, COMPLEXITY, CONFIDENCE, ROUTE, and ROUTE_SCOPE metadata.'), 'fixme-task should accept PR triage metadata');
  assert(skill.includes('Only items with ROUTE: CURRENT_PR_FIX enter the producer/review loop.'), 'fixme-task should ignore follow-up-only items for producer loops');
  assert(skill.includes('FOLLOWUP_ONLY and INFO items are recorded in the run summary and never trigger planning, execution, or loop counters.'), 'follow-up and info should not consume loops');
  assert(skill.includes('Batch CURRENT_PR_FIX items by dependency cluster, not by comment source.'), 'fixme-task should batch by implementation dependency rather than reviewer source');
  assert(skill.includes('Split dispatch only when a high-complexity PLAN_REQUIRED fix touches an unrelated subsystem or blocks low-risk fixes.'), 'fixme-task should split only for meaningful risk isolation');
  assert(skill.includes('`ROUTE_SCOPE` governs review-loop routing only - it does not shortcut entry into the pipeline.'), 'fixme-task should clarify that ROUTE_SCOPE applies to review-loop routing, not entry-point shortcuts');
  assert(skill.includes('A fresh fixme-task entry always starts at the plan phase regardless of incoming `ROUTE_SCOPE`'), 'fixme-task should always start at the plan phase on fresh entry');
  assert(skill.includes('When the dispatch input already contains a complete pre-planned recipe'), 'fixme-task should describe pre-planned input handoff to the planner');
  assert(skill.includes('IMPLEMENT_ONLY repair keeps the current plan but returns to a full code review before the pipeline can advance.'), 'implementation-only repairs should keep full code review as the terminal gate');
  assert(!skill.includes('low-risk IMPLEMENT_ONLY repair gets focused re-review'), 'implementation-only repairs should not use focused re-review');
});

test('fixme review handlers: classify blocking severity and route scope separately', () => {
  const planHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-plan-review', 'SKILL.md');
  const codeHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md');
  const planHandler = fs.readFileSync(planHandlerPath, 'utf8');
  const codeHandler = fs.readFileSync(codeHandlerPath, 'utf8');

  for (const skill of [planHandler, codeHandler]) {
    assert(skill.includes('SEVERITY: BLOCKER | MAJOR | MINOR | INFO'), 'handler should require severity in each finding');
    assert(skill.includes('ROUTE_SCOPE: PLAN_REQUIRED | IMPLEMENT_ONLY | FOLLOWUP | NONE'), 'handler should require route scope in each finding');
    assert(skill.includes('HANDLER_RESULT: CLEAN | HAS_BLOCKING_FIX | HAS_NONBLOCKING_FINDINGS | HAS_ASK_USER'), 'handler routing should separate blocking and nonblocking outcomes');
    assert(skill.includes('BLOCKING_FIX_COUNT: <number>'), 'handler should count blocking fixes');
    assert(skill.includes('NONBLOCKING_COUNT: <number>'), 'handler should count nonblocking findings');
    assert(skill.includes('PLAN_REQUIRED_COUNT: <number>'), 'handler should count plan-required fixes');
    assert(skill.includes('IMPLEMENT_ONLY_COUNT: <number>'), 'handler should count implementation-only fixes');
    assert(skill.includes('MINOR and INFO findings never trigger a revision loop by themselves'), 'handler should keep nonblocking findings out of loops');
  }
});

test('fixme review loop has an explicit edge-case validity gate', () => {
  const planReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md');
  const codeReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const specReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-spec', 'SKILL.md');
  const specReviewRubricPath = path.resolve(__dirname, '..', '..', 'fixme-howto-review-spec', 'SKILL.md');
  const planHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-plan-review', 'SKILL.md');
  const codeHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md');
  const specHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-spec-review', 'SKILL.md');
  const prCommentsPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const taskPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const decisionPath = path.resolve(__dirname, '..', '..', 'fixme-howto-present-decisions', 'SKILL.md');

  const planReview = fs.readFileSync(planReviewPath, 'utf8');
  const codeReview = fs.readFileSync(codeReviewPath, 'utf8');
  const specReview = fs.readFileSync(specReviewPath, 'utf8');
  const specReviewRubric = fs.readFileSync(specReviewRubricPath, 'utf8');
  const planHandler = fs.readFileSync(planHandlerPath, 'utf8');
  const codeHandler = fs.readFileSync(codeHandlerPath, 'utf8');
  const specHandler = fs.readFileSync(specHandlerPath, 'utf8');
  const prComments = fs.readFileSync(prCommentsPath, 'utf8');
  const task = fs.readFileSync(taskPath, 'utf8');
  const decision = fs.readFileSync(decisionPath, 'utf8');

  for (const reviewer of [planReview, codeReview, specReview, specReviewRubric]) {
    assert(reviewer.includes('## Edge-Case Validity Gate'), 'reviewer should require explicit edge-case validity analysis');
    assert(reviewer.includes('Do not promote an edge-case candidate to a finding until you have identified the exact state'), 'reviewer should define the exact reported state before flagging');
    assert(reviewer.includes('Should this state be supported?'), 'reviewer should frame fuzzy edge cases as support decisions');
  }

  for (const handler of [planHandler, codeHandler, specHandler]) {
    assert(handler.includes('FIX_FAIL_FAST'), 'handler should support fail-fast fixes for unsupported-but-reachable states');
    assert(handler.includes('ASK_USER_VALIDITY'), 'handler should support validity questions distinct from approach questions');
    assert(handler.includes('REJECT_IMPOSSIBLE'), 'handler should explicitly reject impossible edge cases');
    assert(handler.includes('REJECT_UNSUPPORTED'), 'handler should explicitly reject unsupported edge cases');
    assert(handler.includes('## Edge-Case Validity Gate'), 'handler should verify edge-case validity before classification');
    assert(handler.includes('Only classify support, unsupported, or impossible when concrete evidence proves that route.'), 'handler should require an evidence threshold before deciding validity');
    assert(handler.includes('If validity is fuzzy, classify ASK_USER_VALIDITY.'), 'handler should ask instead of guessing when support is unclear');
    assert(handler.includes('FIX_FAIL_FAST_COUNT: <number>'), 'handler should count fail-fast fixes in the routing block');
    assert(handler.includes('ASK_USER_VALIDITY_COUNT: <number>'), 'handler should count validity questions in the routing block');
  }

  assert(prComments.includes('EDGE_VALIDITY: FIX_FAIL_FAST | ASK_USER_VALIDITY | REJECT_IMPOSSIBLE | REJECT_UNSUPPORTED | NONE'), 'PR comments should expose edge-case validity metadata');
  assert(prComments.includes('For edge-case review items, run the Edge-Case Validity Gate before assigning VERDICT.'), 'PR comments should gate edge-case verdicts before route assignment');
  assert(prComments.includes('If edge-case validity is fuzzy, set VERDICT: ASK_USER and EDGE_VALIDITY: ASK_USER_VALIDITY.'), 'PR comments should ask on fuzzy validity instead of guessing');
  assert(task.includes('FIX_FAIL_FAST counts as a blocking fix'), 'orchestrator should map fail-fast fixes into normal fix routing');
  assert(task.includes('ASK_USER_VALIDITY counts as a decision needed'), 'orchestrator should map validity questions into user decision routing');
  assert(decision.includes('Edge-case validity questions ask whether the reported state should be supported'), 'decision cards should frame validity questions directly');
});

test('fixme-handle-spec-review uses the same unified routing contract as plan/code handlers', () => {
  const specHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-spec-review', 'SKILL.md');
  const specAgentPath = path.resolve(__dirname, '..', '..', '..', 'agents', 'fixme-handle-spec-review.md');
  const specHandler = fs.readFileSync(specHandlerPath, 'utf8');
  const specAgent = fs.readFileSync(specAgentPath, 'utf8');

  assert(specHandler.includes('SEVERITY: BLOCKER | MAJOR | MINOR | INFO'), 'spec handler should require severity in each finding');
  assert(specHandler.includes('HANDLER_RESULT: CLEAN | HAS_BLOCKING_FIX | HAS_NONBLOCKING_FINDINGS | HAS_ASK_USER'), 'spec handler routing should match plan/code three-state contract');
  assert(specHandler.includes('BLOCKING_FIX_COUNT: <number>'), 'spec handler should count blocking fixes');
  assert(specHandler.includes('NONBLOCKING_COUNT: <number>'), 'spec handler should count nonblocking findings');
  assert(specHandler.includes('NEXT_ACTION: DONE | SPEC_REVISION | ASK_USER_BATCH | FOLLOWUP_ONLY'), 'spec handler next-action should include SPEC_REVISION and FOLLOWUP_ONLY');
  assert(specHandler.includes('MINOR and INFO findings never trigger a revision loop by themselves'), 'spec handler should keep nonblocking findings out of loops');
  assert(!specHandler.includes('HANDLER_RESULT: CLEAN | HAS_FIX | HAS_ASK_USER'), 'spec handler should no longer emit the obsolete two-state directive');
  assert(!specHandler.includes('SPEC_LOOP_EXIT'), 'spec handler should no longer use SPEC_LOOP_EXIT; CLEAN with DONE replaces it');

  assert(specAgent.includes('HAS_BLOCKING_FIX'), 'spec handler agent role text should enumerate HAS_BLOCKING_FIX');
  assert(specAgent.includes('HAS_NONBLOCKING_FINDINGS'), 'spec handler agent role text should enumerate HAS_NONBLOCKING_FINDINGS');
  assert(!/Output HANDLER_RESULT: CLEAN, HAS_FIX, or HAS_ASK_USER/.test(specAgent), 'spec handler agent role text should not enumerate the obsolete two-state directive');
});

test('fixme review handler agents enumerate the unified three-state directive', () => {
  const agentNames = ['fixme-handle-spec-review', 'fixme-handle-plan-review', 'fixme-handle-code-review'];
  for (const agentName of agentNames) {
    const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', `${agentName}.md`);
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert(agent.includes('HAS_BLOCKING_FIX'), `${agentName} role text should enumerate HAS_BLOCKING_FIX`);
    assert(agent.includes('HAS_NONBLOCKING_FINDINGS'), `${agentName} role text should enumerate HAS_NONBLOCKING_FINDINGS`);
    assert(!/Output HANDLER_RESULT: CLEAN, HAS_FIX, or HAS_ASK_USER/.test(agent), `${agentName} role text should not enumerate the obsolete two-state directive`);
  }
});

test('fixme review assessment rubric defines dimensions and review-level gate', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-howto-importance', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  const skillBody = skill.replace(/^---[\s\S]*?---\n/, '');

  assert(skill.includes('# Review Assessment and Review Level Gate'), 'rubric should use final title');
  for (const dimension of ['reachability', 'state_contract', 'trigger_window', 'target_scale', 'impact', 'fix_risk', 'confidence']) {
    assert(skill.includes(dimension), `rubric should define ${dimension}`);
  }
  assert(skill.includes('blocking-fix | follow-up | decision-needed | dismissed'), 'rubric should define level route values');
  assert(skill.includes('Malformed assessment data routes to decision-needed'), 'rubric should route malformed assessment data to decision-needed');
  assert(!skillBody.includes('Importance'), 'rubric body must not use old Importance output wording');
  assert(!skillBody.includes('harm_class'), 'rubric body must not use old harm_class axis');
  assert(!skillBody.includes('resolved_float'), 'rubric body must not use old resolved_float metadata');
  assert(!skillBody.includes('<score>'), 'rubric body must not use old score metadata');
  assert(!skillBody.includes('suppressed'), 'rubric body must not use old suppressed routing');
  assert(!skill.includes('softness'), 'rubric must not use old softness wording');
  assert(!skill.includes('numeric score'), 'rubric must not use numeric scores');
});

test('fixme reviewers require review assessment dimensions', () => {
  const reviewerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-review-spec', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md'),
  ];
  const reviewSpecHowto = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-howto-review-spec', 'SKILL.md'), 'utf8');

  for (const skillPath of reviewerPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('fixme-howto-importance'), `${skillPath} should load the shared importance rubric`);
    assert(skill.includes('Review assessment'), `${skillPath} should require Review assessment`);
    assert(skill.includes('reachability=<value>; state_contract=<value>; trigger_window=<value>; target_scale=<value>; impact=<value>; fix_risk=<value>; confidence=<value>'), `${skillPath} should emit final assessment shape`);
    assert(skill.includes('Reviewers do not assign handler classification, level route, numeric scores, or suppression.'), `${skillPath} should not assign handler routing`);
    assert(!skill.includes('Importance axes'), `${skillPath} should not require old importance axes`);
    assert(!skill.includes('harm_class:'), `${skillPath} should not emit old harm_class`);
    assert(!skill.includes('softness'), `${skillPath} should not mention old softness`);
  }
  assert(reviewSpecHowto.includes('Review assessment'), 'shared review spec howto should require Review assessment');
});

test('fixme handlers resolve review level and remove suppression counts', () => {
  const handlerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-handle-spec-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-plan-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md'),
  ];

  for (const skillPath of handlerPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('fixme-howto-importance'), `${skillPath} should load the shared importance rubric`);
    assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config review-level resolve --workflow <workflow> --phase <phase>'), `${skillPath} should resolve review level`);
    assert(skill.includes('Review level'), `${skillPath} should include Review level field`);
    assert(skill.includes('Level route'), `${skillPath} should include Level route field`);
    assert(skill.includes('Route scope'), `${skillPath} should include Route scope field`);
    assert(skill.includes('DISMISSED_COUNT: <number>'), `${skillPath} should include dismissed count`);
    assert(skill.includes('WARNING: Missing review assessment dimensions: confidence'), `${skillPath} should warn on missing dimensions`);
    assert(!skill.includes('Importance'), `${skillPath} should not use old Importance output wording`);
    assert(!skill.includes('harm_class'), `${skillPath} should not use old harm_class axis`);
    assert(!skill.includes('resolved_float'), `${skillPath} should not use old resolved_float metadata`);
    assert(!skill.includes('<score>'), `${skillPath} should not use old score metadata`);
    assert(!skill.includes('suppressed'), `${skillPath} should not use old suppressed routing`);
    assert(!skill.includes('SUPPRESSED_COUNT'), `${skillPath} should remove suppressed count`);
    assert(!skill.includes('config softness resolve'), `${skillPath} should not call obsolete resolver`);
    assert(!skill.includes('Importance: floor / softness'), `${skillPath} should remove old importance output`);
  }
});

test('fixme handlers keep one routing directive block after review-level changes', () => {
  const handlerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-handle-spec-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-plan-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md'),
  ];

  for (const skillPath of handlerPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    const dismissedCountDirectives = skill.match(/^DISMISSED_COUNT: <number>$/gm) || [];
    assert(dismissedCountDirectives.length === 1, `${skillPath} should declare DISMISSED_COUNT exactly once in the routing block`);
    assert(!skill.includes('## Review Level Routing Contract'), `${skillPath} should not append a second routing contract after the directive`);
  }
});

test('fixme-pr-comments records review assessment and review-level routing metadata', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('fixme-howto-importance'), 'PR comments skill should use shared importance rubric');
  assert(skill.includes('REVIEW_ASSESSMENT'), 'PR comments should require review assessment metadata');
  assert(skill.includes('REVIEW_LEVEL'), 'PR comments should record review level');
  assert(skill.includes('LEVEL_ROUTE'), 'PR comments should record level route');
  assert(skill.includes('config review-level resolve --path pullRequestComments'), 'PR comments should use PR review-level resolver');
  assert(skill.includes('LEVEL_ROUTE=follow-up'), 'PR comments should expose follow-up route');
  assert(skill.includes('Follow-up by review level'), 'PR comments should report visible follow-up routing');
  assert(!skill.includes('Importance'), 'PR comments should not use old Importance output wording');
  assert(!skill.includes('harm_class'), 'PR comments should not use old harm_class axis');
  assert(!skill.includes('resolved_float'), 'PR comments should not use old resolved_float metadata');
  assert(!skill.includes('<score>'), 'PR comments should not use old score metadata');
  assert(!skill.includes('suppressed'), 'PR comments should not use old suppressed routing');
  assert(!skill.includes('IMPORTANCE_AXES'), 'PR comments should remove old importance axes');
  assert(!skill.includes('Suppressed by softness'), 'PR comments should remove old suppression label');
  assert(!skill.includes('config softness resolve'), 'PR comments should not call obsolete resolver');
  assert(skill.includes('FILE_OVERLAP_ONLY_DEFERRAL_CANDIDATE: true | false'), 'PR comments should explicitly mark file-overlap-only deferral candidates');
});

test('fixme-session defaults bug sessions to final bugfix workflow', () => {
  const sessionPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'SKILL.md');
  const investigationAgentPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'agents', 'investigation-agent.md');
  const session = fs.readFileSync(sessionPath, 'utf8');
  const investigationAgent = fs.readFileSync(investigationAgentPath, 'utf8');

  assert(session.includes('Default: `"bugfix"` for bug fix sessions'), 'session dispatch should default bug fixes to bugfix');
  assert(session.includes('ticket transition <ticket-folder>/ticket.md investigate --pipeline <pipeline name from step 4>'), 'session investigation pre-phase should transition to investigate with selected pipeline');
  assert(session.includes('| 0002 | sidebar-overflow | implement |'), 'session status example should use final workflow phase names');
  assert(!session.includes('Default: `"full"` for bug fix sessions'), 'session dispatch must not default bug fixes to full');
  assert(!session.includes('ticket transition <ticket-folder>/ticket.md investigating'), 'session dispatch must not use non-phase state investigating');
  assert(!session.includes('| 0002 | sidebar-overflow | implementing |'), 'session status example must not use removed legacy state names');
  assert(!session.includes('ticket transition <ticket-folder>/ticket.md investigate`'), 'session dispatch must not use bare investigate transition without pipeline');
  assert(investigationAgent.includes('transitioned to `investigate`'), 'investigation agent should refer to final investigate phase');
  assert(!investigationAgent.includes('transitioned to "investigating"'), 'investigation agent must not refer to removed investigating state');
});

test('fixme-task and fixme-config document final review-level workflows', () => {
  const taskPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const configPath = path.resolve(__dirname, '..', '..', 'fixme-config', 'SKILL.md');
  const task = fs.readFileSync(taskPath, 'utf8');
  const config = fs.readFileSync(configPath, 'utf8');

  for (const doc of [task, config]) {
    assert(doc.includes('standard'), 'docs should include standard workflow');
    assert(doc.includes('plan-only'), 'docs should include plan-only workflow');
    assert(doc.includes('execute-only'), 'docs should include execute-only workflow');
    assert(doc.includes('bugfix'), 'docs should include bugfix workflow');
    assert(doc.includes('review.level'), 'docs should include review.level');
    assert(doc.includes('pullRequestComments.review.level'), 'docs should include PR comment review level');
    assert(doc.includes('strict | standard | lenient | fast-track | critical'), 'docs should list final review levels');
    assert(!doc.includes('config softness resolve'), 'docs must not mention obsolete softness resolver');
    assert(!doc.includes('review.softness.default'), 'docs must not write old softness default');
    assert(!doc.includes('review.softness.labels'), 'docs must not write old label mapping');
  }

  assert(task.includes('--plan` -> pipeline `plan-only`'), 'task docs should map --plan to plan-only');
  assert(task.includes('--execute` -> pipeline `execute-only`'), 'task docs should map --execute to execute-only');
  assert(task.includes('/fixme-task --pipeline full'), 'task docs should use final full workflow selection');
  assert(!task.includes('--idea-to-production'), 'task docs must not mention removed idea-to-production flag');
  assert(!task.includes('compatibility alias'), 'task docs must not preserve compatibility alias wording');
  assert(task.includes('Plain `/fixme-task ...` defaults to `standard`'), 'task docs should default plain tasks to standard');
  assert(task.includes('use the hardcoded `standard` workflow'), 'config loading should fall back to standard');
  assert(!task.includes('use the hardcoded `default` workflow'), 'config loading must not mention hardcoded default workflow');
  assert(task.includes('implement phase (default 3)'), 'loop guard should document implement default 3');
  assert(!task.includes('implement phase (default 2)'), 'loop guard must not document implement default 2');
  assert(config.includes('Review level'), 'fixme-config should present review level settings');
  assert(config.includes('config set review.level'), 'fixme-config should write top-level review.level');
  assert(config.includes('config set workflows.<selectedWorkflow>.review.level'), 'fixme-config should write workflow review.level');
  assert(config.includes('config set pullRequestComments.review.level'), 'fixme-config should write PR comment review.level');
  assert(config.includes('Review cycles default to `3` for code and implement review phases.'), 'fixme-config should document code and implement review cycles at 3');
});

test('README, CLAUDE, config schema, and data flow document review level', () => {
  const dataFlow = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-session', 'docs', 'data-flow.md'), 'utf8');
  const docs = [
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'README.md'), 'utf8'),
    fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'CLAUDE.md'), 'utf8'),
    fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-session', 'references', 'config-schema.md'), 'utf8'),
    dataFlow,
  ];

  for (const doc of docs) {
    assert(doc.includes('review.level'), 'doc should mention review.level');
    assert(doc.includes('config review-level resolve'), 'doc should mention review-level resolver');
    assert(doc.includes('standard'), 'doc should mention standard workflow');
    assert(doc.includes('bugfix'), 'doc should mention bugfix workflow');
    assert(!doc.includes('config softness resolve'), 'doc must not mention obsolete softness resolver');
    assert(!doc.includes('review softness'), 'doc must not use old review softness wording');
  }

  assert(dataFlow.includes('`full` uses `product-spec`, `technical-spec`, `plan`, `implement`, and `verify`'), 'data-flow should document final full feature lifecycle');
  assert(!dataFlow.includes('Standard `full` uses `investigate`'), 'data-flow must not describe full as the bugfix lifecycle');
});

test('README, CLAUDE, config schema, and fixme-config document plan readiness triage', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const claude = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  const configSchema = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-session', 'references', 'config-schema.md'), 'utf8');
  const configSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-config', 'SKILL.md'), 'utf8');
  const toolsSkill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'fixme-tools', 'SKILL.md'), 'utf8');

  for (const doc of [readme, claude, configSchema, configSkill]) {
    assert(doc.includes('fixme-plan-readiness'), 'doc should mention the readiness checker skill');
    assert(doc.includes('full plan review'), 'doc should preserve full plan review escalation language');
  }

  for (const configDoc of [readme, configSchema, configSkill]) {
    assert(configDoc.includes('"readiness": "fixme-plan-readiness"'), 'config-facing docs should show the readiness config key');
  }

  assert(readme.includes('plan -> readiness -> execute -> code review'), 'README quick start should describe the lean standard path');
  assert(readme.includes('Review gates catch what confidence blinds you to. Routine standard runs use readiness before execution, and high-risk plans escalate to full plan review.'), 'README design principle should describe readiness plus escalation');
  assert(claude.includes('| fixme-plan-readiness | Plan readiness checker | Read-only, compact route decision | opus | xhigh | xhigh |'), 'CLAUDE agent table should include readiness checker');
  assert(claude.includes('fixme-plan-readiness/   # Compact independent plan readiness triage'), 'CLAUDE skill layout should include readiness skill');
  assert(configSchema.includes('| `review.readiness` | string | No | - | Optional compact readiness checker dispatched before `review.skills`. |'), 'config schema should document review.readiness');
  assert(toolsSkill.includes('Validate compact plan-readiness routing blocks'), 'fixme-tools skill docs should mention readiness validation');
});

test('fixme reviewer and handler agents preload importance rubric', () => {
  const agentNames = [
    'fixme-review-spec',
    'fixme-review-plan',
    'fixme-review-code',
    'fixme-handle-spec-review',
    'fixme-handle-plan-review',
    'fixme-handle-code-review',
  ];

  for (const agentName of agentNames) {
    const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', `${agentName}.md`);
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert(agent.includes('- fixme-howto-importance'), `${agentName} should preload fixme-howto-importance`);
  }
});

test('fixme-task skill: routes implementation-only code review fixes without outer plan loop', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('HAS_BLOCKING_FIX'), 'orchestrator should understand blocking fix handler result');
  assert(skill.includes('NEXT_ACTION: DONE | SPEC_REVISION | PLAN_REVISION | IMPLEMENT_REPAIR | ASK_USER_BATCH | FOLLOWUP_ONLY'), 'orchestrator should support spec revision, implement repair, and follow-up routes');
  assert(skill.includes('PLAN_REQUIRED findings use the outer loop and count against outerMaxCycles.'), 'plan-required findings should still use outer loop');
  assert(skill.includes('IMPLEMENT_ONLY findings route to fixme-execute-plan repair mode and do not count against outerMaxCycles.'), 'implementation-only findings should avoid plan loop');
  assert(skill.includes('MINOR and INFO findings are reported as follow-up-only and do not trigger loop counters.'), 'nonblocking findings should not trigger loops');
  assert(skill.includes('If the unresolved blocking issue count is not lower than the previous comparable cycle, stop the loop and escalate as stalled.'), 'loop should stop when issue count does not improve');
  assert(skill.includes('Implementation-only repairs return to full code review and do not count against outerMaxCycles.'), 'code review should stay full-scope after repair');
  assert(!skill.includes('Focused re-review mode reviews fixes since last review plus directly affected call sites.'), 'code review should not support focused re-review after repair');
});

test('fixme execute/review skills: support repair mode and full post-repair review', () => {
  const executePath = path.resolve(__dirname, '..', '..', 'fixme-execute-plan', 'SKILL.md');
  const reviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const execute = fs.readFileSync(executePath, 'utf8');
  const review = fs.readFileSync(reviewPath, 'utf8');

  assert(execute.includes('Repair Mode'), 'executor should document repair mode');
  assert(execute.includes('Repair items come from implementation-only code review findings'), 'repair mode should be limited to implementation-only findings');
  assert(execute.includes('Do not redesign the plan in repair mode.'), 'executor should not replan implementation-only repairs');
  assert(review.includes('## Post-Repair Full Review'), 'code reviewer should document full post-repair review');
  assert(review.includes('Post-repair review starts with the repair items, then reviews the full changed surface.'), 'post-repair review should start with repair items without limiting scope');
  assert(review.includes('Repair context is an ordering hint, not a scope limiter.'), 'repair context should not limit review scope');
  assert(!review.includes('Focused Re-Review Mode'), 'code reviewer should not document focused re-review mode');
  assert(!review.includes('focused re-review'), 'code reviewer should remove focused re-review wording');
});

test('fixme plan and review skills require critical invariant receipts', () => {
  const writePlanPath = path.resolve(__dirname, '..', '..', 'fixme-write-plan', 'SKILL.md');
  const executePath = path.resolve(__dirname, '..', '..', 'fixme-execute-plan', 'SKILL.md');
  const planReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md');
  const codeReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const writePlan = fs.readFileSync(writePlanPath, 'utf8');
  const execute = fs.readFileSync(executePath, 'utf8');
  const planReview = fs.readFileSync(planReviewPath, 'utf8');
  const codeReview = fs.readFileSync(codeReviewPath, 'utf8');

  assert(writePlan.includes('### Critical Invariants'), 'planner should require a Critical Invariants section');
  assert(writePlan.includes('A stored value is not enforcement unless a later production call consumes it.'), 'planner should reject storage-only enforcement');
  assert(writePlan.includes('outbound method or operation and required fields'), 'planner should require exact external request contracts');
  assert(writePlan.includes('Every critical invariant maps to exact production enforcement and a behavioral proof'), 'planner final checklist should require invariant proof');

  assert(execute.includes('Critical Invariant Receipts'), 'executor should require critical invariant receipts');
  assert(execute.includes('Never satisfy a critical invariant with storage-only or prose-only work.'), 'executor should reject storage-only completion');
  assert(execute.includes('production enforcement file/function/call path'), 'executor receipts should cite production enforcement');
  assert(execute.includes('A value, marker, status, artifact, or record is computed or stored but never consumed by the live path.'), 'executor should catch computed-but-unused safety values');

  assert(planReview.includes('Dimension 0: Critical Invariant Coverage'), 'plan reviewer should check critical invariants before ordinary dimensions');
  assert(planReview.includes('translating "consume durable evidence before advancing state" into only "store durable evidence."'), 'plan reviewer should catch storage-only plan gaps');
  assert(planReview.includes('The plan must specify the consumer of every safety value'), 'plan reviewer should require safety value consumers');

  assert(codeReview.includes('Dimension 0: Critical Invariant Trace'), 'code reviewer should trace critical invariants before plan compliance');
  assert(codeReview.includes('trace the live production path from entrypoint to side effect or state transition'), 'code reviewer should trace production paths');
  assert(codeReview.includes('computed or stored but not consumed by the live path'), 'code reviewer should catch computed-but-unused safety values');
});

test('fixme workflow skills require universal effect lifecycle contracts', () => {
  const technicalSpecHowtoPath = path.resolve(__dirname, '..', '..', 'fixme-howto-write-technical-spec', 'SKILL.md');
  const writeTechnicalSpecPath = path.resolve(__dirname, '..', '..', 'fixme-write-technical-spec', 'SKILL.md');
  const reviewSpecPath = path.resolve(__dirname, '..', '..', 'fixme-review-spec', 'SKILL.md');
  const writePlanPath = path.resolve(__dirname, '..', '..', 'fixme-write-plan', 'SKILL.md');
  const executePath = path.resolve(__dirname, '..', '..', 'fixme-execute-plan', 'SKILL.md');
  const planReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md');
  const codeReviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const codeHandlerPath = path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md');

  const technicalSpecHowto = fs.readFileSync(technicalSpecHowtoPath, 'utf8');
  const writeTechnicalSpec = fs.readFileSync(writeTechnicalSpecPath, 'utf8');
  const reviewSpec = fs.readFileSync(reviewSpecPath, 'utf8');
  const writePlan = fs.readFileSync(writePlanPath, 'utf8');
  const execute = fs.readFileSync(executePath, 'utf8');
  const planReview = fs.readFileSync(planReviewPath, 'utf8');
  const codeReview = fs.readFileSync(codeReviewPath, 'utf8');
  const codeHandler = fs.readFileSync(codeHandlerPath, 'utf8');

  assert(technicalSpecHowto.includes('## Effect Lifecycle Contracts'), 'technical spec rubric should define effect lifecycle contracts');
  assert(technicalSpecHowto.includes('A stateful effect is any operation where correctness depends on more than local code returning a value.'), 'technical spec rubric should define stateful effects generically');
  assert(technicalSpecHowto.includes('Boundary'), 'effect lifecycle contract should require the operation boundary');
  assert(technicalSpecHowto.includes('State meanings'), 'effect lifecycle contract should require exact state meanings');
  assert(technicalSpecHowto.includes('Source of truth'), 'effect lifecycle contract should require a source of truth');
  assert(technicalSpecHowto.includes('Durable evidence'), 'effect lifecycle contract should require durable evidence');
  assert(technicalSpecHowto.includes('Consumer path'), 'effect lifecycle contract should require consumer paths');
  assert(technicalSpecHowto.includes('Repeat behavior'), 'effect lifecycle contract should require repeat behavior');
  assert(technicalSpecHowto.includes('Advancement gate'), 'effect lifecycle contract should require advancement gates');
  assert(technicalSpecHowto.includes('Failure signal'), 'effect lifecycle contract should require observable failure signals');
  assert(technicalSpecHowto.includes('Behavioral proof'), 'effect lifecycle contract should require behavioral proof');

  assert(writeTechnicalSpec.includes('stateful effect'), 'technical spec writer should identify stateful effects');
  assert(writeTechnicalSpec.includes('Effect Lifecycle Contract'), 'technical spec writer should require effect lifecycle contracts');
  assert(writeTechnicalSpec.includes('terminal state, public visibility, deletion, acknowledgement, unlock, commit, publish, or irreversible transition'), 'technical spec writer should gate irreversible/public advancement');

  assert(reviewSpec.includes('Effect Lifecycle Contract'), 'spec reviewer should review effect lifecycle contracts');
  assert(reviewSpec.includes('stored but not consumed'), 'spec reviewer should catch storage-only safety work');
  assert(reviewSpec.includes('status name is stronger than its evidence'), 'spec reviewer should catch over-strong state names');

  assert(writePlan.includes('stateful effect'), 'planner should identify stateful effects');
  assert(writePlan.includes('Effect Lifecycle Contract'), 'planner should translate effect lifecycle contracts');
  assert(writePlan.includes('Every generated key, marker, status, artifact, or record must name the production path that consumes it.'), 'planner should require consumer paths for safety artifacts');

  assert(execute.includes('Effect Lifecycle Contract'), 'executor should enforce effect lifecycle contracts');
  assert(planReview.includes('Effect Lifecycle Contract'), 'plan reviewer should check effect lifecycle contract translation');
  assert(codeReview.includes('Effect Lifecycle Contract'), 'code reviewer should trace effect lifecycle contracts');
  assert(codeHandler.includes('spec omitted the lifecycle contract'), 'code review handler should route spec omissions separately');
  assert(codeHandler.includes('plan omitted or weakened it'), 'code review handler should route plan omissions separately');
  assert(codeHandler.includes('implementation omitted or bypassed it'), 'code review handler should route executor omissions separately');
});

// ============================================================================
// resolveAlert
// ============================================================================

const { resolveAlert: _resolveAlert } = require(TOOLS_PATH);

test('resolveAlert: defaults on darwin with empty config', () => {
  const r = _resolveAlert('user_input', {}, 'darwin');
  assert(r.enabled === true, 'should be enabled');
  assert(r.command === 'afplay', `expected afplay, got ${r.command}`);
  assert(r.args[0] === '/System/Library/Sounds/Glass.aiff', `expected Glass.aiff, got ${r.args[0]}`);
  assert(r.platform === 'darwin', 'platform should be darwin');
});

test('resolveAlert: custom sound on darwin', () => {
  const cfg = { alerts: { sounds: { user_input: 'Ping' } } };
  const r = _resolveAlert('user_input', cfg, 'darwin');
  assert(r.args[0] === '/System/Library/Sounds/Ping.aiff', `expected Ping.aiff, got ${r.args[0]}`);
});

test('resolveAlert: disabled when alerts.enabled is false', () => {
  const r = _resolveAlert('user_input', { alerts: { enabled: false } }, 'darwin');
  assert(r.enabled === false, 'should be disabled');
  assert(r.reason === 'alerts disabled', `unexpected reason: ${r.reason}`);
});

test('resolveAlert: unknown event returns disabled', () => {
  const r = _resolveAlert('nonsense', {}, 'darwin');
  assert(r.enabled === false, 'unknown event should disable');
  assert(/unknown event/.test(r.reason), `unexpected reason: ${r.reason}`);
});

test('resolveAlert: unsupported platform returns disabled', () => {
  const r = _resolveAlert('user_input', {}, 'aix');
  assert(r.enabled === false, 'aix should be unsupported');
  assert(/unsupported platform/.test(r.reason), `unexpected reason: ${r.reason}`);
});

test('resolveAlert: linux maps Glass -> bell', () => {
  const r = _resolveAlert('user_input', {}, 'linux');
  assert(r.enabled === true, 'linux should be enabled');
  assert(r.command === 'paplay', `expected paplay, got ${r.command}`);
  assert(r.args[0] === '/usr/share/sounds/freedesktop/stereo/bell.oga', `unexpected path: ${r.args[0]}`);
});

test('resolveAlert: win32 builds powershell command with mapped name', () => {
  const r = _resolveAlert('task_failed', {}, 'win32');
  assert(r.enabled === true, 'win32 should be enabled');
  assert(r.command === 'powershell', `expected powershell, got ${r.command}`);
  const joined = r.args.join(' ');
  assert(/Windows Critical Stop/.test(joined), `command should reference mapped sound, got: ${joined}`);
});

test('resolveAlert: linux unmapped sound falls back to default for event', () => {
  const cfg = { alerts: { sounds: { user_input: 'Submarine' } } };
  const r = _resolveAlert('user_input', cfg, 'linux');
  assert(r.enabled === true, 'should still be enabled');
  assert(r.args[0].endsWith('bell.oga') || r.args[0].endsWith('message.oga'), `should fall back to a known linux sound, got ${r.args[0]}`);
});

test('CLI: alert --resolve user_input returns JSON spec', () => {
  const result = run('alert user_input --resolve');
  assert(result.ok, `expected success, got: ${result.stderr || JSON.stringify(result.data)}`);
  assert(typeof result.data.enabled === 'boolean', 'enabled should be boolean');
  assert(result.data.event === 'user_input', `event should echo input, got ${result.data.event}`);
  assert(typeof result.data.platform === 'string', 'platform should be present');
});

test('CLI: alert <event> exits 0 on supported platform', () => {
  if (process.platform !== 'darwin') {
    console.log('  SKIP: requires darwin to verify spawn (current platform: ' + process.platform + ')');
    return;
  }
  // Use --resolve to avoid actually playing during tests
  const result = run('alert task_finished --resolve');
  assert(result.ok, `expected success, got: ${result.stderr}`);
  assert(result.data.enabled === true, 'task_finished should be enabled by default on darwin');
});

test('CLI: alert with unknown event exits non-zero', () => {
  const result = run('alert nonsense --resolve');
  assert(!result.ok, 'unknown event should fail');
});

test('CLI: alert without event exits non-zero', () => {
  const result = run('alert');
  assert(!result.ok, 'missing event should fail');
});

test('CLI: alert --list-sounds returns catalog for current platform', () => {
  const result = run('alert --list-sounds');
  assert(result.ok, `expected success, got: ${result.stderr}`);
  assert(typeof result.data.platform === 'string', 'platform must be string');
  assert(Array.isArray(result.data.sounds), 'sounds must be array');
  assert(Array.isArray(result.data.events), 'events must be array');
  assert(result.data.events.includes('user_input'), 'events must include user_input');
  assert(result.data.events.includes('task_finished'), 'events must include task_finished');
  assert(result.data.events.includes('task_failed'), 'events must include task_failed');
  assert(result.data.defaults && result.data.defaults.user_input === 'Glass', 'default user_input should be Glass');
});

// ============================================================================
// applyConfigMigration: alerts defaults
// ============================================================================

const { applyConfigMigration: _applyConfigMigration } = require(TOOLS_PATH);

test('migration: empty config gets alerts defaults', () => {
  const cfg = {};
  _applyConfigMigration(cfg);
  assert(cfg.alerts, 'alerts section should be created');
  assert(cfg.alerts.enabled === true, 'alerts should default to enabled');
  assert(cfg.alerts.sounds.user_input === 'Glass', `user_input default wrong: ${cfg.alerts.sounds.user_input}`);
  assert(cfg.alerts.sounds.task_finished === 'Hero', `task_finished default wrong: ${cfg.alerts.sounds.task_finished}`);
  assert(cfg.alerts.sounds.task_failed === 'Basso', `task_failed default wrong: ${cfg.alerts.sounds.task_failed}`);
});

test('migration: preserves explicit alerts.enabled=false', () => {
  const cfg = { alerts: { enabled: false } };
  _applyConfigMigration(cfg);
  assert(cfg.alerts.enabled === false, 'should not override user disabling');
  assert(cfg.alerts.sounds.user_input === 'Glass', 'sounds should still be filled in');
});

test('migration: preserves custom sound choices and fills missing ones', () => {
  const cfg = { alerts: { sounds: { user_input: 'Ping' } } };
  _applyConfigMigration(cfg);
  assert(cfg.alerts.sounds.user_input === 'Ping', 'custom sound should be preserved');
  assert(cfg.alerts.sounds.task_finished === 'Hero', 'missing entries should be filled');
});

test('CLI: config set alerts.enabled false works', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-alert-cfg-'));
  tmpDirs.push(tmp);
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.fixme', 'config.json'), '{}');

  const result = runInDir('config set alerts.enabled false', tmp);
  assert(result.ok, `expected success, got: ${result.stderr}`);
  const written = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(written.alerts.enabled === false, 'should persist enabled=false');
});

test('CLI: config set alerts.sounds.user_input Ping works', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-alert-cfg-'));
  tmpDirs.push(tmp);
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.fixme', 'config.json'), '{}');

  const result = runInDir('config set alerts.sounds.user_input Ping', tmp);
  assert(result.ok, `expected success, got: ${result.stderr}`);
  const written = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(written.alerts.sounds.user_input === 'Ping', `expected Ping, got ${written.alerts.sounds.user_input}`);
});

test('CLI: config set alerts.sounds.unknown_event rejected', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-alert-cfg-'));
  tmpDirs.push(tmp);
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.fixme', 'config.json'), '{}');

  const result = runInDir('config set alerts.sounds.bogus_event Glass', tmp);
  assert(!result.ok, 'unknown event key should be rejected');
});

test('CLI: config set alerts.sounds.user_input ZzzNotARealSound rejected', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-alert-cfg-'));
  tmpDirs.push(tmp);
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.fixme', 'config.json'), '{}');

  const result = runInDir('config set alerts.sounds.user_input ZzzNotARealSound', tmp);
  assert(!result.ok, 'unknown sound name should be rejected');
});

test('CLI: config get alerts returns the alerts section', () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-alert-cfg-'));
  tmpDirs.push(tmp);
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.fixme', 'config.json'), JSON.stringify({
    alerts: { enabled: true, sounds: { user_input: 'Pop', task_finished: 'Hero', task_failed: 'Basso' } },
  }));

  const result = runInDir('config get alerts', tmp);
  assert(result.ok, `expected success, got: ${result.stderr}`);
  assert(result.data.value.enabled === true, 'enabled in output');
  assert(result.data.value.sounds.user_input === 'Pop', 'user_input should be Pop');
});

// ============================================================================
// Usage start and config tests
// ============================================================================

console.log('\n=== usage start and config tests ===\n');

test('usage start: creates pending state for direct skill with null pipelineRunId', () => {
  const ctx = createUsageWorkspace();
  const result = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(result.ok, `usage start should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.invocationId.startsWith('usage_'), `invocationId should use usage_ prefix: ${result.data.invocationId}`);
  assert(result.data.pipelineRunId === null, `pipelineRunId should be null, got ${result.data.pipelineRunId}`);
  assert(result.data.runtime === 'codex', 'runtime should be codex');
  assert(fs.existsSync(result.data.pendingPath), 'pending file should exist');

  const pending = readJson(result.data.pendingPath);
  assert(pending.schemaVersion === 1, 'pending schema version');
  assert(pending.skill === 'fixme-write-plan', 'pending skill');
  assert(pending.role === 'skill', 'default role');
  assert(pending.runtime === 'codex', 'pending runtime');
  assert(pending.pipelineRunId === null, 'pending pipelineRunId');
  assert(pending.parentInvocationId === null, 'pending parentInvocationId');
  assert(pending.finalizedEvent === null, 'pending finalizedEvent starts null');
  assert(pending.appendState.projectWritten === false, 'projectWritten starts false');
  assert(pending.appendState.globalWritten === false, 'globalWritten starts false');
  assert(!fs.existsSync(ctx.projectEvents), 'start must not write project events');
  assert(!fs.existsSync(ctx.globalEvents), 'start must not write global events');
});

test('usage start: standalone fixme-task uses own invocation as pipelineRunId', () => {
  const ctx = createUsageWorkspace();
  const result = runInDirWithEnv('usage start --skill fixme-task --role orchestrator --runtime claude', ctx.projectRoot, ctx.env);
  assert(result.ok, `usage start should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.pipelineRunId === result.data.invocationId, 'fixme-task standalone pipelineRunId should equal invocationId');
  const pending = readJson(result.data.pendingPath);
  assert(pending.role === 'orchestrator', 'role should be orchestrator');
  assert(pending.pipelineRunId === result.data.invocationId, 'pending pipelineRunId should match invocationId');
});

test('usage start: nested fixme-task reuses provided pipelineRunId', () => {
  const ctx = createUsageWorkspace();
  const result = runInDirWithEnv('usage start --skill fixme-task --role orchestrator --runtime codex --pipeline-run-id usage_parent --parent-invocation-id usage_grandparent', ctx.projectRoot, ctx.env);
  assert(result.ok, `usage start should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.pipelineRunId === 'usage_parent', 'pipelineRunId should be reused');
  const pending = readJson(result.data.pendingPath);
  assert(pending.pipelineRunId === 'usage_parent', 'pending pipelineRunId');
  assert(pending.parentInvocationId === 'usage_grandparent', 'pending parentInvocationId');
});

test('usage start: repo-source auto runtime is unresolved and writes no state', () => {
  const ctx = createUsageWorkspace();
  const result = runInDirWithEnv('usage start --skill fixme-write-plan --runtime auto', ctx.projectRoot, ctx.env);
  assert(!result.ok, 'auto runtime from source tree should fail');
  assert(result.data.code === 'AUTO_RUNTIME_UNRESOLVED', `expected AUTO_RUNTIME_UNRESOLVED, got ${JSON.stringify(result.data)}`);
  assert(!fs.existsSync(path.join(ctx.fixmeDir, 'usage', 'pending')), 'pending directory should not be created');
});

test('usage start: installed Claude and Codex paths resolve explicit runtimes', () => {
  const ctx = createUsageWorkspace();
  const claudeTool = path.join(ctx.homeDir, '.claude', 'skills', 'fixme-tools', 'scripts', 'fixme-tools.cjs');
  const codexTool = path.join(ctx.homeDir, '.codex', 'skills', 'fixme-tools', 'scripts', 'fixme-tools.cjs');
  fs.mkdirSync(path.dirname(claudeTool), { recursive: true });
  fs.mkdirSync(path.dirname(codexTool), { recursive: true });
  fs.copyFileSync(TOOLS_PATH, claudeTool);
  fs.copyFileSync(TOOLS_PATH, codexTool);

  const claude = runToolPath(claudeTool, 'usage start --skill fixme-write-plan --runtime claude', { cwd: ctx.projectRoot, env: ctx.env });
  const codex = runToolPath(codexTool, 'usage start --skill fixme-write-plan --runtime codex', { cwd: ctx.projectRoot, env: ctx.env });
  assert(claude.ok && claude.data.runtime === 'claude', `Claude runtime failed: ${JSON.stringify(claude.data)}`);
  assert(codex.ok && codex.data.runtime === 'codex', `Codex runtime failed: ${JSON.stringify(codex.data)}`);
});

test('usage start: --task is rejected before pending state is created', () => {
  const ctx = createUsageWorkspace();
  const result = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex --task "review spec"', ctx.projectRoot, ctx.env);
  assert(!result.ok, 'usage start with --task should fail');
  assert(result.data.code === 'UNSUPPORTED_USAGE_TASK', `expected UNSUPPORTED_USAGE_TASK, got ${JSON.stringify(result.data)}`);
  assert(!fs.existsSync(path.join(ctx.fixmeDir, 'usage', 'pending')), 'pending directory should not exist');
});

test('config set usage.printAfterFinish accepts only booleans', () => {
  const ctx = createUsageWorkspace();
  const ok = runInDirWithEnv('config set usage.printAfterFinish false', ctx.projectRoot, ctx.env);
  assert(ok.ok, `boolean write should succeed, got ${JSON.stringify(ok.data)}`);
  assert(readJson(path.join(ctx.fixmeDir, 'config.json')).usage.printAfterFinish === false, 'boolean should persist');

  const bad = runInDirWithEnv('config set usage.printAfterFinish "\\"false\\""', ctx.projectRoot, ctx.env);
  assert(!bad.ok, 'string false should be rejected');
  assert(String(bad.data.error).includes('usage.printAfterFinish must be a boolean'), `unexpected error: ${JSON.stringify(bad.data)}`);
});

test('config migrate preserves existing usage keys and defaults printAfterFinish', () => {
  const ctx = createUsageWorkspace();
  fs.writeFileSync(path.join(ctx.fixmeDir, 'config.json'), JSON.stringify({ usage: { customFutureKey: 'keep-me' } }, null, 2));
  const result = runInDirWithEnv('config migrate', ctx.projectRoot, ctx.env);
  assert(result.ok, `config migrate should succeed, got ${JSON.stringify(result.data)}`);
  const written = readJson(path.join(ctx.fixmeDir, 'config.json'));
  assert(written.usage.customFutureKey === 'keep-me', 'unknown usage key should be preserved');
  assert(written.usage.printAfterFinish === true, 'printAfterFinish should default true');
});

test('config workflow configure treats fixme-usage as a known Fixme skill', () => {
  const ctx = createUsageWorkspace();
  const data = JSON.stringify({ phases: [{ name: 'report', skills: ['fixme-usage'] }] });
  const result = runInDirWithEnv(`config workflow configure reporting --data '${data}'`, ctx.projectRoot, ctx.env);
  assert(result.ok, `workflow configure should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.warnings.length === 0, `fixme-usage should not warn as unknown: ${JSON.stringify(result.data.warnings)}`);
});

// ============================================================================
// Usage finish tests
// ============================================================================

console.log('\n=== usage finish tests ===\n');

function startUsage(ctx, extra = '') {
  const result = runInDirWithEnv(`usage start --skill fixme-write-plan --runtime codex ${extra}`, ctx.projectRoot, ctx.env);
  assert(result.ok, `usage start failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

test('usage start and finish: explicit fixmeDir is independent from cwd config resolution', () => {
  const ctx = createUsageWorkspace();
  const pollutedCwd = createObsoleteSubReposCwd();

  const started = runInDirWithEnv(`usage start --skill fixme-write-plan --runtime codex --fixme-dir "${ctx.fixmeDir}" --project-root "${ctx.projectRoot}"`, pollutedCwd, ctx.env);
  assert(started.ok, `usage start should use explicit fixmeDir instead of cwd config, got: ${JSON.stringify(started.data)}`);
  assert(started.data.finishCommand.includes(`--fixme-dir "${ctx.fixmeDir}"`), `finishCommand should carry explicit fixmeDir, got: ${started.data.finishCommand}`);
  assert(fs.existsSync(started.data.pendingPath), 'pending file should exist under explicit fixmeDir');

  const pending = readJson(started.data.pendingPath);
  assert(pending.fixmeDir === ctx.fixmeDir, `pending fixmeDir should be explicit path, got ${pending.fixmeDir}`);
  assert(pending.projectRoot === ctx.projectRoot, `pending projectRoot should be explicit path, got ${pending.projectRoot}`);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete --fixme-dir "${ctx.fixmeDir}"`, pollutedCwd, ctx.env);
  assert(finished.ok, `usage finish should use explicit fixmeDir instead of cwd config, got: ${JSON.stringify(finished.data)}`);
  assert(readJsonl(ctx.projectEvents).length === 1, 'finish should append one project event');
  assert(readJsonl(ctx.globalEvents).length === 1, 'finish should append one global event');
});

test('usage start: valueless fixmeDir flag is rejected before creating pending state', () => {
  const ctx = createUsageWorkspace();
  const result = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex --fixme-dir', ctx.projectRoot, ctx.env);
  assert(!result.ok, 'valueless --fixme-dir should fail');
  assert(result.data.code === 'INVALID_USAGE_PATH', `expected INVALID_USAGE_PATH, got ${JSON.stringify(result.data)}`);
  assert(!fs.existsSync(path.join(ctx.projectRoot, 'true')), 'valueless flag must not create a literal true directory');
  assert(!fs.existsSync(path.join(ctx.fixmeDir, 'usage', 'pending')), 'pending directory should not exist');
});

test('usage finish: missing counters appends one unmeasured row to project and global events', () => {
  const ctx = createUsageWorkspace();
  const started = startUsage(ctx);
  const result = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(result.ok, `usage finish should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.status === 'unmeasured', `expected unmeasured, got ${result.data.status}`);
  assert(result.data.outcomeReason === null, 'complete outcomeReason should be null');
  assert(result.data.reportLine && result.data.reportLine.includes('Usage: fixme-write-plan unmeasured (COUNTERS_UNAVAILABLE)'), `unmeasured report line should include warning code, got ${result.data.reportLine}`);
  assert(!result.data.reportLine.includes('fixme-write-plan unavailable'), `unmeasured report line should not hide the warning behind unavailable wording: ${result.data.reportLine}`);
  assert(result.data.reportLineSuppressed === false, 'report line should not be suppressed by default');
  assert(!fs.existsSync(started.pendingPath), 'pending file should be removed after both appends complete');

  const projectRows = readJsonl(ctx.projectEvents);
  const globalRows = readJsonl(ctx.globalEvents);
  assert(projectRows.length === 1, `project rows: ${projectRows.length}`);
  assert(globalRows.length === 1, `global rows: ${globalRows.length}`);
  assert(JSON.stringify(projectRows[0]) === JSON.stringify(globalRows[0]), 'project and global rows should be identical');
  assert(projectRows[0].status === 'unmeasured', 'row status unmeasured');
  assert(projectRows[0].tokens === null, 'unmeasured row tokens null');
  assert(projectRows[0].cost === null, 'cost null');
  assert(projectRows[0].warnings.some(w => w.code === 'COUNTERS_UNAVAILABLE'), 'unmeasured row warning');
  assert(!Object.prototype.hasOwnProperty.call(projectRows[0], 'task'), 'usage row must not contain task field');
});

test('usage finish: measured compact report line separates cached and non-cached buckets', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-report-line.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 10, cached_input_tokens: 2, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 10 },
      { input_tokens: 10, cached_input_tokens: 2, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 10 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 40, cached_input_tokens: 5, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 45 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 35 }
    ),
  ]);
  const result = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(result.ok, `usage finish should succeed, got: ${JSON.stringify(result.data)}`);
  assert(
    result.data.reportLine === 'Usage: fixme-write-plan non-cached 32 tokens, cached input 3 tokens, total 35 tokens | project non-cached 32 tokens, cached input 3 tokens, total 35 tokens',
    `unexpected report line: ${result.data.reportLine}`
  );
  assert(!result.data.reportLine.includes('+35 tokens'), `report line should not include plus prefix: ${result.data.reportLine}`);
});

test('usage finish: failed and aborted outcomes accept only closed reason enum values', () => {
  const accepted = ['verification_failed', 'user_aborted', 'usage_tracking_failed', 'runtime_error', 'dispatch_failed', 'timeout', 'invalid_usage_request', 'unknown'];
  for (const reason of accepted) {
    const ctx = createUsageWorkspace();
    const started = startUsage(ctx);
    const result = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome failed --reason ${reason}`, ctx.projectRoot, ctx.env);
    assert(result.ok, `reason ${reason} should succeed, got ${JSON.stringify(result.data)}`);
    const row = readJsonl(ctx.projectEvents)[0];
    assert(row.outcome === 'failed', 'outcome failed');
    assert(row.outcomeReason === reason, `outcomeReason should be ${reason}`);
  }

  const abortedCtx = createUsageWorkspace();
  const abortedStart = startUsage(abortedCtx);
  const aborted = runInDirWithEnv(`usage finish --invocation-id ${abortedStart.invocationId} --outcome aborted --reason user_aborted`, abortedCtx.projectRoot, abortedCtx.env);
  assert(aborted.ok, `aborted outcome should succeed, got ${JSON.stringify(aborted.data)}`);
  assert(readJsonl(abortedCtx.projectEvents)[0].outcome === 'aborted', 'outcome aborted');
});

test('usage finish: invalid reason forms append no rows and do not finalize pending state', () => {
  const cases = [
    { args: '--outcome failed', code: 'INVALID_REASON' },
    { args: '--outcome aborted --reason not_in_enum', code: 'INVALID_REASON' },
    { args: '--outcome complete --reason verification_failed', code: 'INVALID_REASON' },
  ];

  for (const item of cases) {
    const ctx = createUsageWorkspace();
    const started = startUsage(ctx);
    const result = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} ${item.args}`, ctx.projectRoot, ctx.env);
    assert(!result.ok, `finish should fail for ${item.args}`);
    assert(result.data.code === item.code, `expected ${item.code}, got ${JSON.stringify(result.data)}`);
    assert(!fs.existsSync(ctx.projectEvents), 'project events should not exist');
    assert(!fs.existsSync(ctx.globalEvents), 'global events should not exist');
    assert(readJson(started.pendingPath).finalizedEvent === null, 'pending should not be finalized');
  }
});

test('usage finish: --quiet and config false suppress compact report line', () => {
  const quietCtx = createUsageWorkspace();
  const quietStart = startUsage(quietCtx);
  const quiet = runInDirWithEnv(`usage finish --invocation-id ${quietStart.invocationId} --outcome complete --quiet`, quietCtx.projectRoot, quietCtx.env);
  assert(quiet.ok, `quiet finish should succeed, got ${JSON.stringify(quiet.data)}`);
  assert(quiet.data.reportLine === null, 'quiet reportLine null');
  assert(quiet.data.reportLineSuppressed === true, 'quiet reportLineSuppressed true');

  const cfgCtx = createUsageWorkspace();
  fs.writeFileSync(path.join(cfgCtx.fixmeDir, 'config.json'), JSON.stringify({ usage: { printAfterFinish: false } }, null, 2));
  const cfgStart = startUsage(cfgCtx);
  const cfg = runInDirWithEnv(`usage finish --invocation-id ${cfgStart.invocationId} --outcome complete`, cfgCtx.projectRoot, cfgCtx.env);
  assert(cfg.ok, `config-suppressed finish should succeed, got ${JSON.stringify(cfg.data)}`);
  assert(cfg.data.reportLine === null, 'config suppressed reportLine null');
  assert(cfg.data.reportLineSuppressed === true, 'config suppressed reportLineSuppressed true');
});

test('usage finish: retry after global append failure writes exact finalized event once', () => {
  const ctx = createUsageWorkspace();
  const badHomeFile = path.join(createTmpDir(), 'home-file');
  fs.writeFileSync(badHomeFile, 'not a directory');
  const started = startUsage(ctx);

  const first = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, { HOME: badHomeFile });
  assert(!first.ok, 'first finish should fail because global append path is invalid');
  assert(first.data.code === 'DESTINATION_APPEND_FAILED', `expected DESTINATION_APPEND_FAILED, got ${JSON.stringify(first.data)}`);
  assert(readJsonl(ctx.projectEvents).length === 1, 'project row should remain after global failure');
  const pendingAfterFailure = readJson(started.pendingPath);
  assert(pendingAfterFailure.finalizedEvent, 'finalized event should be persisted');
  assert(pendingAfterFailure.appendState.projectWritten === true, 'project should be marked written');
  assert(pendingAfterFailure.appendState.globalWritten === false, 'global should remain missing');

  const retry = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(retry.ok, `retry should succeed, got ${JSON.stringify(retry.data)}`);
  assert(readJsonl(ctx.projectEvents).length === 1, 'retry must not duplicate project row');
  assert(readJsonl(ctx.globalEvents).length === 1, 'retry should write one global row');
  assert(!fs.existsSync(started.pendingPath), 'pending should be removed after retry converges');
});

test('usage finish: destination conflict exits non-zero and appends nothing', () => {
  const ctx = createUsageWorkspace();
  const badHomeFile = path.join(createTmpDir(), 'home-file');
  fs.writeFileSync(badHomeFile, 'not a directory');
  const started = startUsage(ctx);
  const first = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, { HOME: badHomeFile });
  assert(!first.ok, 'first finish should leave pending after global failure');

  const conflicting = { ...readJsonl(ctx.projectEvents)[0], status: 'measured', tokens: { totalTokens: 1 } };
  fs.writeFileSync(ctx.projectEvents, JSON.stringify(conflicting) + '\n');
  const retry = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(!retry.ok, 'retry should fail on conflicting project row');
  assert(retry.data.code === 'DESTINATION_EVENT_CONFLICT', `expected conflict, got ${JSON.stringify(retry.data)}`);
  assert(!fs.existsSync(ctx.globalEvents), 'global row should not be appended after conflict');
  assert(fs.existsSync(started.pendingPath), 'pending should remain for manual repair');
});

// ============================================================================
// Usage report tests
// ============================================================================

console.log('\n=== usage report tests ===\n');

function usageEvent(overrides = {}) {
  const invocationId = overrides.invocationId || `usage_test_${Math.random().toString(16).slice(2)}`;
  const eventId = overrides.eventId || `event_test_${Math.random().toString(16).slice(2)}`;
  return {
    schemaVersion: 1,
    eventType: 'skill_invocation',
    eventId,
    invocationId,
    parentInvocationId: overrides.parentInvocationId === undefined ? null : overrides.parentInvocationId,
    pipelineRunId: overrides.pipelineRunId === undefined ? null : overrides.pipelineRunId,
    skill: overrides.skill || 'fixme-write-plan',
    role: overrides.role || 'skill',
    runtime: overrides.runtime || 'codex',
    status: overrides.status || 'measured',
    outcome: overrides.outcome || 'complete',
    outcomeReason: overrides.outcomeReason === undefined ? null : overrides.outcomeReason,
    startedAt: overrides.startedAt || '2026-05-26T10:00:00Z',
    finishedAt: overrides.finishedAt || '2026-05-26T10:01:00Z',
    durationMs: overrides.durationMs || 60000,
    projectRoot: overrides.projectRoot || '/tmp/project',
    fixmeDir: overrides.fixmeDir || '/tmp/project/.fixme',
    tokens: overrides.tokens === undefined ? {
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheCreationInputTokens: 8,
      cacheReadInputTokens: 12,
      outputTokens: 30,
      reasoningOutputTokens: 5,
      totalTokens: 135,
    } : overrides.tokens,
    cost: null,
    source: overrides.source || { kind: 'test_fixture', path: null, startCursor: null, finishCursor: null },
    warnings: overrides.warnings || [],
  };
}

function writeUsageEvents(filePath, rows, trailing = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + (trailing ? '\n' : ''));
}

test('usage report: explicit fixmeDir and global scope are independent from cwd config resolution', () => {
  const ctx = createUsageWorkspace();
  const event = usageEvent({ eventId: 'event_explicit_report', invocationId: 'usage_explicit_report', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  writeUsageEvents(ctx.projectEvents, [event]);
  writeUsageEvents(ctx.globalEvents, [event]);
  const pollutedCwd = createObsoleteSubReposCwd();

  const project = runInDirWithEnv(`usage report --scope project --fixme-dir "${ctx.fixmeDir}"`, pollutedCwd, ctx.env);
  assert(project.ok, `project report should use explicit fixmeDir instead of cwd config, got: ${JSON.stringify(project.data)}`);
  assert(project.data.totalUsage.totalTokens === 135, `project total should be 135, got ${project.data.totalUsage.totalTokens}`);

  const global = runInDirWithEnv('usage report --scope global', pollutedCwd, ctx.env);
  assert(global.ok, `global report should not resolve cwd config, got: ${JSON.stringify(global.data)}`);
  assert(global.data.totalUsage.totalTokens === 135, `global total should be 135, got ${global.data.totalUsage.totalTokens}`);
});

test('usage: unknown subcommand lists all valid usage subcommands', () => {
  const result = run('usage wat');
  assert(!result.ok, 'unknown usage subcommand should fail');
  assert(String(result.data.error).includes('Valid: start, finish, report'), `valid subcommands should be complete, got ${JSON.stringify(result.data)}`);
});

test('usage report: project totals exclude unmeasured rows and include not-included count', () => {
  const ctx = createUsageWorkspace();
  const complete = usageEvent({ eventId: 'event_complete', invocationId: 'usage_complete', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const unmeasured = usageEvent({
    eventId: 'event_unmeasured',
    invocationId: 'usage_unmeasured',
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
    status: 'unmeasured',
    tokens: null,
    warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }],
  });
  writeUsageEvents(ctx.projectEvents, [complete, unmeasured]);

  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.totalUsage.totalTokens === 135, `total tokens should be 135, got ${result.data.totalUsage.totalTokens}`);
  assert(result.data.totalUsage.nonCachedTokens === 115, `non-cached tokens should be 115, got ${result.data.totalUsage.nonCachedTokens}`);
  assert(result.data.totalUsage.cachedTokens === 20, `cached tokens should be 20, got ${result.data.totalUsage.cachedTokens}`);
  assert(result.data.totalUsage.nonCachedTokens + result.data.totalUsage.cachedTokens === result.data.totalUsage.totalTokens, 'derived buckets should sum to total tokens');
  assert(result.data.notIncludedInTotal.invocationCount === 1, 'one unmeasured invocation excluded');
  assert(result.data.notIncludedInTotal.eventIds.includes('event_unmeasured'), 'unmeasured event listed');
  assert(result.data.warningSummary.some(w => w.code === 'COUNTERS_UNAVAILABLE' && w.count === 1), 'warning summary includes unmeasured warning');
});

test('usage report: unsupported status rows are excluded with warnings', () => {
  const ctx = createUsageWorkspace();
  writeUsageEvents(ctx.projectEvents, [
    usageEvent({
      eventId: 'event_unknown_status',
      invocationId: 'usage_unknown_status',
      projectRoot: ctx.projectRoot,
      fixmeDir: ctx.fixmeDir,
      status: 'unknownStatus',
    }),
  ]);

  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.recent.length === 0, 'unsupported status row should not appear in recent rows');
  assert(result.data.totalUsage.totalTokens === 0, `unsupported status should not count tokens, got ${result.data.totalUsage.totalTokens}`);
  assert(result.data.notIncludedInTotal.invocationCount === 1, 'unsupported status should be excluded from totals');
  assert(result.data.notIncludedInTotal.eventIds.includes('event_unknown_status'), 'unsupported status event should be listed');
  assert(result.data.bySkill.length === 0, 'unsupported status row should not create skill groups');
  assert(result.data.warningSummary.some(w => w.code === 'UNSUPPORTED_USAGE_STATUS' && w.eventIds.includes('event_unknown_status')), 'unsupported status warning should be summarized');

  const text = runInDirWithEnv('usage report --scope project --format text', ctx.projectRoot, ctx.env);
  assert(text.ok, `text report should succeed, got ${JSON.stringify(text.data)}`);
  assert(text.data.includes('Warnings: UNSUPPORTED_USAGE_STATUS'), `text report should show unsupported status warning, got ${text.data}`);
  assert(!text.data.includes('unavailable exact counters'), `unsupported status should not be described as unavailable counters, got ${text.data}`);
});

test('usage report: identical duplicates count once and conflicting duplicates are excluded', () => {
  const ctx = createUsageWorkspace();
  const one = usageEvent({ eventId: 'event_one', invocationId: 'usage_dup', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const identical = JSON.parse(JSON.stringify(one));
  const conflict = usageEvent({
    eventId: 'event_conflict',
    invocationId: 'usage_conflict',
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
    tokens: { inputTokens: 1, cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0, totalTokens: 2 },
  });
  const conflictOther = { ...conflict, eventId: 'event_conflict_other', tokens: { ...conflict.tokens, totalTokens: 999 } };
  writeUsageEvents(ctx.projectEvents, [one, identical, conflict, conflictOther]);

  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.totalUsage.totalTokens === 135, `only identical duplicate should count once, got ${result.data.totalUsage.totalTokens}`);
  assert(result.data.notIncludedInTotal.invocationCount === 1, 'one conflicting invocation excluded');
  assert(result.data.warningSummary.some(w => w.code === 'DUPLICATE_INVOCATION_CONFLICT' && w.count === 1), 'conflict warning summary');
  assert(!result.data.recent.some(row => row.invocationId === 'usage_conflict'), 'conflict omitted from recent');
});

test('usage report: date filters use finishedAt with inclusive since and exclusive until', () => {
  const ctx = createUsageWorkspace();
  const included = usageEvent({ eventId: 'event_included', invocationId: 'usage_included', finishedAt: '2026-05-01T00:00:00Z', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const excluded = usageEvent({ eventId: 'event_excluded', invocationId: 'usage_excluded', finishedAt: '2026-05-02T00:00:00Z', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  writeUsageEvents(ctx.projectEvents, [included, excluded]);

  const result = runInDirWithEnv('usage report --scope project --since 2026-05-01 --until 2026-05-01', ctx.projectRoot, ctx.env);
  assert(result.ok, `date report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.recent.length === 1, `expected one row, got ${result.data.recent.length}`);
  assert(result.data.recent[0].eventId === 'event_included', 'since boundary included and until next-day boundary excluded');
});

test('usage report: pipeline report splits orchestrator overhead and child usage', () => {
  const ctx = createUsageWorkspace();
  const pipelineRunId = 'usage_pipeline';
  const orchestrator = usageEvent({
    eventId: 'event_orchestrator',
    invocationId: 'usage_orchestrator',
    skill: 'fixme-task',
    role: 'orchestrator',
    pipelineRunId,
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
    tokens: { inputTokens: 10, cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 0, totalTokens: 15 },
  });
  const child = usageEvent({
    eventId: 'event_child',
    invocationId: 'usage_child',
    skill: 'fixme-write-plan',
    role: 'skill',
    pipelineRunId,
    parentInvocationId: 'usage_orchestrator',
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
    tokens: { inputTokens: 100, cachedInputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 25, reasoningOutputTokens: 5, totalTokens: 130 },
  });
  writeUsageEvents(ctx.projectEvents, [orchestrator, child]);

  const result = runInDirWithEnv(`usage report --scope project --pipeline-run-id ${pipelineRunId}`, ctx.projectRoot, ctx.env);
  assert(result.ok, `pipeline report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.totalUsage.totalTokens === 145, 'pipeline total');
  assert(result.data.byPipeline[0].orchestratorUsage.totalTokens === 15, 'orchestrator overhead');
  assert(result.data.byPipeline[0].childUsage.totalTokens === 130, 'child usage');
});

test('usage report: global JSON groups usage by projectRoot', () => {
  const ctx = createUsageWorkspace();
  const otherProjectRoot = path.join(ctx.projectRoot, 'other-project');
  const otherFixmeDir = path.join(otherProjectRoot, '.fixme');
  const projectComplete = usageEvent({
    eventId: 'event_project_complete',
    invocationId: 'usage_project_complete',
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
    tokens: { inputTokens: 70, cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 25, reasoningOutputTokens: 5, totalTokens: 100 },
  });
  const otherComplete = usageEvent({
    eventId: 'event_other_complete',
    invocationId: 'usage_other_complete',
    projectRoot: otherProjectRoot,
    fixmeDir: otherFixmeDir,
    tokens: { inputTokens: 150, cachedInputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 40, reasoningOutputTokens: 10, totalTokens: 200 },
  });
  const otherUnmeasured = usageEvent({
    eventId: 'event_other_unmeasured',
    invocationId: 'usage_other_unmeasured',
    projectRoot: otherProjectRoot,
    fixmeDir: otherFixmeDir,
    status: 'unmeasured',
    tokens: null,
    warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }],
  });
  const projectConflict = usageEvent({
    eventId: 'event_project_conflict',
    invocationId: 'usage_project_conflict',
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
  });
  const projectConflictOther = { ...projectConflict, eventId: 'event_project_conflict_other', tokens: { ...projectConflict.tokens, totalTokens: 999 } };
  writeUsageEvents(ctx.globalEvents, [projectComplete, otherComplete, otherUnmeasured, projectConflict, projectConflictOther]);

  const result = runInDirWithEnv('usage report --scope global', ctx.projectRoot, ctx.env);
  assert(result.ok, `global report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.totalUsage.totalTokens === 300, `global total should include measured rows only, got ${result.data.totalUsage.totalTokens}`);
  assert(Array.isArray(result.data.byProject), 'global report should include byProject');

  const byCurrentProject = result.data.byProject.find(row => row.projectRoot === ctx.projectRoot);
  assert(byCurrentProject.invocationCount === 1, `current project invocationCount ${byCurrentProject && byCurrentProject.invocationCount}`);
  assert(byCurrentProject.measuredCount === 1, `current project measuredCount ${byCurrentProject.measuredCount}`);
  assert(byCurrentProject.unmeasuredCount === 0, `current project unmeasuredCount ${byCurrentProject.unmeasuredCount}`);
  assert(byCurrentProject.totalUsage.totalTokens === 100, `current project total ${byCurrentProject.totalUsage.totalTokens}`);
  assert(byCurrentProject.notIncludedInTotal.invocationCount === 1, `current project excluded count ${byCurrentProject.notIncludedInTotal.invocationCount}`);
  assert(byCurrentProject.warningSummary.some(w => w.code === 'DUPLICATE_INVOCATION_CONFLICT' && w.count === 1), 'current project warning summary includes duplicate conflict group');

  const byOtherProject = result.data.byProject.find(row => row.projectRoot === otherProjectRoot);
  assert(byOtherProject.invocationCount === 2, `other project invocationCount ${byOtherProject && byOtherProject.invocationCount}`);
  assert(byOtherProject.measuredCount === 1, `other project measuredCount ${byOtherProject.measuredCount}`);
  assert(byOtherProject.unmeasuredCount === 1, `other project unmeasuredCount ${byOtherProject.unmeasuredCount}`);
  assert(byOtherProject.totalUsage.totalTokens === 200, `other project total ${byOtherProject.totalUsage.totalTokens}`);
  assert(byOtherProject.notIncludedInTotal.invocationCount === 1, `other project excluded count ${byOtherProject.notIncludedInTotal.invocationCount}`);
  assert(byOtherProject.warningSummary.some(w => w.code === 'COUNTERS_UNAVAILABLE' && w.count === 1), 'other project warning summary includes unmeasured warning');
});

test('usage report: text output separates cached and non-cached usage', () => {
  const ctx = createUsageWorkspace();
  writeUsageEvents(ctx.projectEvents, [
    usageEvent({ invocationId: 'usage_complete', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir }),
    usageEvent({ eventId: 'event_unmeasured', invocationId: 'usage_unmeasured', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir, status: 'unmeasured', tokens: null, warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }] }),
  ]);
  const result = runInDirWithEnv('usage report --scope project --format text', ctx.projectRoot, ctx.env);
  assert(result.ok, `text report should succeed, got ${JSON.stringify(result.data)}`);
  assert(typeof result.data === 'string', 'text format returns raw string data in tests');
  assert(result.data.includes('Non-cached usage: 115 tokens'), `missing non-cached usage line: ${result.data}`);
  assert(result.data.includes('Cached input: 20 tokens'), `missing cached input line: ${result.data}`);
  assert(result.data.includes('Total usage: 135 tokens'), `missing total usage line: ${result.data}`);
  assert(result.data.includes('Not included in total: 1 invocation with unavailable exact counters'), `missing not-included line: ${result.data}`);
});

test('usage report: corrupt and trailing incomplete JSONL lines are skipped with warnings', () => {
  const ctx = createUsageWorkspace();
  fs.mkdirSync(path.dirname(ctx.projectEvents), { recursive: true });
  fs.writeFileSync(ctx.projectEvents, JSON.stringify(usageEvent({ projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir })) + '\n{"bad":\n{"trailing"');
  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `corrupt report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.totalUsage.totalTokens === 135, 'valid row should still count');
  assert(result.data.warnings.some(w => w.code === 'CORRUPT_JSONL_LINE'), 'corrupt line warning');
  assert(result.data.warnings.some(w => w.code === 'TRAILING_INCOMPLETE_LINE'), 'trailing incomplete warning');
});

test('usage report: JSON grouping schema includes documented counts and exclusions', () => {
  const ctx = createUsageWorkspace();
  const pipelineRunId = 'usage_pipeline_schema';
  const complete = usageEvent({
    eventId: 'event_schema_complete',
    invocationId: 'usage_schema_complete',
    skill: 'fixme-write-plan',
    pipelineRunId,
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
  });
  const unmeasured = usageEvent({
    eventId: 'event_schema_unmeasured',
    invocationId: 'usage_schema_unmeasured',
    skill: 'fixme-write-plan',
    pipelineRunId,
    status: 'unmeasured',
    tokens: null,
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
    warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }],
  });
  const conflict = usageEvent({
    eventId: 'event_schema_conflict',
    invocationId: 'usage_schema_conflict',
    skill: 'fixme-write-plan',
    pipelineRunId,
    projectRoot: ctx.projectRoot,
    fixmeDir: ctx.fixmeDir,
  });
  const conflictOther = { ...conflict, eventId: 'event_schema_conflict_other', tokens: { ...conflict.tokens, totalTokens: 999 } };
  writeUsageEvents(ctx.projectEvents, [complete, unmeasured, conflict, conflictOther]);

  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `report should succeed, got ${JSON.stringify(result.data)}`);
  const recent = result.data.recent.find(row => row.eventId === 'event_schema_unmeasured');
  assert(recent && Object.prototype.hasOwnProperty.call(recent, 'outcomeReason'), 'recent rows include outcomeReason');
  assert(Array.isArray(recent.warningCodes), 'recent rows include warningCodes array');
  assert(!Object.prototype.hasOwnProperty.call(recent, 'warnings'), 'recent rows should not expose raw warnings field');
  assert(recent.status === 'unmeasured', `recent unmeasured row status ${recent.status}`);

  const bySkill = result.data.bySkill.find(row => row.skill === 'fixme-write-plan');
  assert(bySkill.invocationCount === 2, `bySkill invocationCount should exclude duplicate-conflict groups, got ${bySkill.invocationCount}`);
  assert(bySkill.measuredCount === 1, `bySkill measuredCount ${bySkill.measuredCount}`);
  assert(bySkill.unmeasuredCount === 1, `bySkill unmeasuredCount ${bySkill.unmeasuredCount}`);
  assert(
    Object.keys(bySkill).filter(key => key.endsWith('Count')).every(key => ['invocationCount', 'measuredCount', 'unmeasuredCount'].includes(key)),
    'bySkill should expose only documented count fields'
  );
  assert(bySkill.notIncludedInTotal.invocationCount === 2, `bySkill excluded count ${bySkill.notIncludedInTotal.invocationCount}`);
  assert(bySkill.warningSummary.some(w => w.code === 'DUPLICATE_INVOCATION_CONFLICT' && w.count === 1), 'bySkill warning summary includes duplicate conflict group');
  assert(!Object.prototype.hasOwnProperty.call(bySkill, 'invocations'), 'bySkill should not expose obsolete invocations field');
  assert(bySkill.totalUsage.nonCachedTokens === 115, `bySkill non-cached tokens ${bySkill.totalUsage.nonCachedTokens}`);
  assert(bySkill.totalUsage.cachedTokens === 20, `bySkill cached tokens ${bySkill.totalUsage.cachedTokens}`);
  assert(bySkill.totalUsage.nonCachedTokens + bySkill.totalUsage.cachedTokens === bySkill.totalUsage.totalTokens, 'bySkill derived buckets should sum to total tokens');

  const byPipeline = result.data.byPipeline.find(row => row.pipelineRunId === pipelineRunId);
  assert(byPipeline.invocationCount === 2, `byPipeline invocationCount should exclude duplicate-conflict groups, got ${byPipeline && byPipeline.invocationCount}`);
  assert(byPipeline.measuredCount === 1, `byPipeline measuredCount ${byPipeline.measuredCount}`);
  assert(byPipeline.unmeasuredCount === 1, `byPipeline unmeasuredCount ${byPipeline.unmeasuredCount}`);
  assert(
    Object.keys(byPipeline).filter(key => key.endsWith('Count')).every(key => ['invocationCount', 'measuredCount', 'unmeasuredCount'].includes(key)),
    'byPipeline should expose only documented count fields'
  );
  assert(byPipeline.notIncludedInTotal.invocationCount === 2, `byPipeline excluded count ${byPipeline.notIncludedInTotal.invocationCount}`);
  assert(byPipeline.warningSummary.some(w => w.code === 'COUNTERS_UNAVAILABLE' && w.count === 1), 'byPipeline warning summary includes unmeasured warning');
  assert(byPipeline.orchestratorUsage.totalTokens === 0, 'byPipeline includes orchestratorUsage subtotal object');
  assert(byPipeline.childUsage.totalTokens === 135, 'byPipeline includes childUsage subtotal object');
  assert(byPipeline.totalUsage.nonCachedTokens === 115, `byPipeline non-cached tokens ${byPipeline.totalUsage.nonCachedTokens}`);
  assert(byPipeline.totalUsage.cachedTokens === 20, `byPipeline cached tokens ${byPipeline.totalUsage.cachedTokens}`);
  assert(byPipeline.totalUsage.nonCachedTokens + byPipeline.totalUsage.cachedTokens === byPipeline.totalUsage.totalTokens, 'byPipeline derived buckets should sum to total tokens');
});

test('usage report: text output uses duplicate-conflict not-included language', () => {
  const ctx = createUsageWorkspace();
  const complete = usageEvent({ eventId: 'event_text_complete', invocationId: 'usage_text_complete', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const conflict = usageEvent({ eventId: 'event_text_conflict', invocationId: 'usage_text_conflict', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const conflictOther = { ...conflict, eventId: 'event_text_conflict_other', tokens: { ...conflict.tokens, totalTokens: 999 } };
  writeUsageEvents(ctx.projectEvents, [complete, conflict, conflictOther]);

  const result = runInDirWithEnv('usage report --scope project --format text', ctx.projectRoot, ctx.env);
  assert(result.ok, `text report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.includes('Non-cached usage: 115 tokens'), `missing non-cached usage line: ${result.data}`);
  assert(result.data.includes('Cached input: 20 tokens'), `missing cached input line: ${result.data}`);
  assert(result.data.includes('Total usage: 135 tokens'), `missing total usage line: ${result.data}`);
  assert(result.data.includes('Not included in total: 1 invocation'), `missing duplicate not-included line: ${result.data}`);
  assert(!result.data.includes('with unavailable exact counters'), `duplicate conflicts should not use unavailable-counters language: ${result.data}`);
  assert(result.data.includes('Warnings: DUPLICATE_INVOCATION_CONFLICT'), `missing duplicate warning line: ${result.data}`);
});

// ============================================================================
// Usage runtime adapter tests
// ============================================================================

console.log('\n=== usage runtime adapter tests ===\n');

function appendJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}

function loadNodeSqliteDatabaseSyncForTests() {
  const previousEmitWarning = process.emitWarning;
  process.emitWarning = function emitWarningWithoutSqliteExperimentalNoise(warning, ...args) {
    const message = typeof warning === 'string' ? warning : (warning && warning.message) || '';
    if (message.includes('SQLite is an experimental feature')) return;
    return previousEmitWarning.call(process, warning, ...args);
  };
  try {
    return require('node:sqlite').DatabaseSync;
  } finally {
    process.emitWarning = previousEmitWarning;
  }
}

function writeCodexStateThread(ctx, threadId, rolloutPath, options = {}) {
  const DatabaseSync = loadNodeSqliteDatabaseSyncForTests();
  const dbRoot = options.sqliteHome || path.join(ctx.homeDir, '.codex');
  const dbPath = path.join(dbRoot, 'state_5.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL)');
    db.prepare('INSERT INTO threads (id, rollout_path) VALUES (?, ?)').run(threadId, rolloutPath);
  } finally {
    db.close();
  }
}

function codexTokenCount(total, last) {
  return { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last } } };
}

function codexSessionMeta(projectRoot) {
  return { type: 'session_meta', payload: { cwd: projectRoot } };
}

function claudeTranscriptMeta(projectRoot, extra = {}) {
  return { type: 'transcript_metadata', cwd: projectRoot, ...extra };
}

function codexSessionPath(ctx, name) {
  return path.join(ctx.homeDir, '.codex', 'sessions', '2026', '05', '26', `${name}.jsonl`);
}

function claudeTranscriptPath(ctx, name) {
  return path.join(ctx.homeDir, '.claude', 'projects', 'synthetic-project', `${name}.jsonl`);
}

test('runtime adapter: Codex cumulative total_token_usage deltas are authoritative', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 },
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 250, cached_input_tokens: 55, output_tokens: 40, reasoning_output_tokens: 15, total_tokens: 305 },
      { input_tokens: 150, cached_input_tokens: 35, output_tokens: 30, reasoning_output_tokens: 10, total_tokens: 190 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.inputTokens === 150, `input delta ${row.tokens.inputTokens}`);
  assert(row.tokens.cachedInputTokens === 35, `cached delta ${row.tokens.cachedInputTokens}`);
  assert(row.tokens.outputTokens === 30, `output delta ${row.tokens.outputTokens}`);
  assert(row.tokens.reasoningOutputTokens === 10, `reasoning delta ${row.tokens.reasoningOutputTokens}`);
  assert(row.tokens.totalTokens === 190, `total delta ${row.tokens.totalTokens}`);
  assert(row.source.kind === 'codex_jsonl', 'source kind');
});

test('runtime adapter: Codex cumulative delta tolerates omitted optional per-turn cache metadata', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-omitted-cache.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 },
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 250, cached_input_tokens: 55, output_tokens: 40, reasoning_output_tokens: 15, total_tokens: 305 },
      { input_tokens: 150, output_tokens: 30, reasoning_output_tokens: 10, total_tokens: 190 }
    ),
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.cachedInputTokens === 35, `expected cumulative cached delta 35, got ${row.tokens.cachedInputTokens}`);
  assert(row.tokens.totalTokens === 190, `expected cumulative total delta 190, got ${row.tokens.totalTokens}`);
  assert(!row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'optional cache metadata mismatch should not be a counter conflict');
});

test('runtime adapter: Codex cumulative delta tolerates per-turn cache metadata disagreement', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-cache-disagreement.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 },
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 250, cached_input_tokens: 55, output_tokens: 40, reasoning_output_tokens: 15, total_tokens: 305 },
      { input_tokens: 150, cached_input_tokens: 99, output_tokens: 30, reasoning_output_tokens: 10, total_tokens: 190 }
    ),
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.cachedInputTokens === 35, `expected cumulative cached delta 35, got ${row.tokens.cachedInputTokens}`);
  assert(row.tokens.totalTokens === 190, `expected cumulative total delta 190, got ${row.tokens.totalTokens}`);
  assert(!row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'cache metadata disagreement should not make usage unavailable');
});

test('runtime adapter: Codex cumulative delta tolerates per-turn total-only anomalies', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-total-anomaly.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 },
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 150, cached_input_tokens: 35, output_tokens: 20, reasoning_output_tokens: 8, total_tokens: 170 },
      { input_tokens: 50, cached_input_tokens: 15, output_tokens: 10, reasoning_output_tokens: 3, total_tokens: 60 }
    ),
    codexTokenCount(
      { input_tokens: 150, cached_input_tokens: 35, output_tokens: 20, reasoning_output_tokens: 8, total_tokens: 170 },
      { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 27473 }
    ),
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.inputTokens === 50, `expected cumulative input delta 50, got ${row.tokens.inputTokens}`);
  assert(row.tokens.outputTokens === 10, `expected cumulative output delta 10, got ${row.tokens.outputTokens}`);
  assert(row.tokens.reasoningOutputTokens === 3, `expected cumulative reasoning delta 3, got ${row.tokens.reasoningOutputTokens}`);
  assert(row.tokens.totalTokens === 60, `expected cumulative total delta 60, got ${row.tokens.totalTokens}`);
  assert(!row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'total-only per-turn anomaly should not make usage unavailable');
});

test('runtime adapter: Codex finish uses bounded persisted cumulative start snapshot', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-large-prefix.jsonl');
  const sparsePrefixBytes = 5 * 1024 * 1024 * 1024;
  const startSnapshot = codexTokenCount(
    { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 135 },
    { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 135 }
  );
  const startLine = `\n${JSON.stringify(startSnapshot)}\n`;
  const fd = fs.openSync(sourcePath, 'w');
  try {
    fs.writeSync(fd, startLine, sparsePrefixBytes - Buffer.byteLength(startLine), 'utf8');
  } finally {
    fs.closeSync(fd);
  }

  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 250, cached_input_tokens: 55, output_tokens: 40, reasoning_output_tokens: 15, total_tokens: 360 },
      { input_tokens: 150, cached_input_tokens: 35, output_tokens: 30, reasoning_output_tokens: 10, total_tokens: 225 }
    ),
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish should not read the unbounded pre-start prefix, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 225, `expected bounded cumulative delta 225, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.tokens.inputTokens === 150, `input delta ${row.tokens.inputTokens}`);
});

test('runtime adapter: Codex negative cumulative deltas create unmeasured row', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-negative-delta.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 200, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 20, total_tokens: 290 },
      { input_tokens: 200, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 20, total_tokens: 290 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 150, cached_input_tokens: 35, output_tokens: 25, reasoning_output_tokens: 15, total_tokens: 225 },
      { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish should append unmeasured row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', 'negative cumulative delta should be unmeasured');
  assert(row.tokens === null, 'unmeasured tokens null');
  assert(row.warnings.some(w => w.code === 'NEGATIVE_DELTA'), 'NEGATIVE_DELTA warning expected');
});

test('runtime adapter: Codex zero cumulative deltas create NO_NEW_USAGE unmeasured row', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-zero-delta.jsonl');
  const snapshot = { input_tokens: 200, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 20, total_tokens: 290 };
  appendJsonl(sourcePath, [
    codexTokenCount(snapshot, { input_tokens: 200, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 20, total_tokens: 290 }),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(snapshot, undefined),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish should append unmeasured row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', 'zero cumulative delta should be unmeasured');
  assert(row.tokens === null, 'unmeasured tokens null');
  assert(row.warnings.some(w => w.code === 'NO_NEW_USAGE'), 'NO_NEW_USAGE warning expected');
  assert(!row.warnings.some(w => w.code === 'NEGATIVE_DELTA'), 'zero delta must not be classified as NEGATIVE_DELTA');
  assert(!row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'zero delta without after-start usage must not be classified as COUNTER_CONFLICT');
});

test('runtime adapter: Codex sums each last_token_usage event when cumulative snapshots are absent', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-last-only.jsonl');
  fs.writeFileSync(sourcePath, '');
  const started = runInDirWithEnv('usage start --skill fixme-review-code --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 14 } } } },
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 20, cached_input_tokens: 4, output_tokens: 6, reasoning_output_tokens: 2, total_tokens: 28 } } } },
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', 'last usage rows should produce measured counters');
  assert(row.tokens.totalTokens === 42, `expected 42, got ${row.tokens.totalTokens}`);
});

test('runtime adapter: Codex binds source from CODEX_THREAD_ID rollout path at start', () => {
  const ctx = createUsageWorkspace();
  const threadId = 'thread_20260607_codex_probe';
  const sourcePath = codexSessionPath(ctx, 'rollout-thread-bound');
  const decoyPath = codexSessionPath(ctx, 'rollout-decoy');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  appendJsonl(decoyPath, [
    codexSessionMeta(ctx.projectRoot),
    codexTokenCount(
      { input_tokens: 900, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 900 },
      { input_tokens: 900, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 900 }
    ),
  ]);
  writeCodexStateThread(ctx, threadId, sourcePath);

  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, CODEX_THREAD_ID: threadId });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  const pending = readJson(started.data.pendingPath);
  assert(pending.sourceSnapshot.source.path === sourcePath, 'start should bind source path from CODEX_THREAD_ID');
  assert(pending.sourceSnapshot.source.discovery === 'codexThreadId', `discovery should be codexThreadId, got ${pending.sourceSnapshot.source.discovery}`);
  assert(pending.sourceSnapshot.cursor.path === sourcePath, 'start should capture bounded cursor for rollout path');
  assert(pending.sourceSnapshot.codexCumulativeStartTokens.totalTokens === 39, 'start should capture cumulative token snapshot');

  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);
  appendJsonl(decoyPath, [
    codexTokenCount(
      { input_tokens: 999, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 999 },
      { input_tokens: 99, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 99 }
    ),
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, CODEX_THREAD_ID: threadId });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 25, `expected rollout-path total 25, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.path === sourcePath, 'finish should use the CODEX_THREAD_ID-bound rollout path');
});

test('runtime adapter: Codex binds source from CODEX_THREAD_ID in CODEX_SQLITE_HOME state database', () => {
  const ctx = createUsageWorkspace();
  const threadId = 'thread_20260616_codex_sqlite_home';
  const sqliteHome = path.join(ctx.homeDir, '.codex', 'sqlite');
  const sourcePath = codexSessionPath(ctx, 'rollout-thread-sqlite-home');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  writeCodexStateThread(ctx, threadId, sourcePath, { sqliteHome });

  const started = runInDirWithEnv(
    'usage start --skill fixme-research --runtime codex',
    ctx.projectRoot,
    { ...ctx.env, CODEX_THREAD_ID: threadId, CODEX_SQLITE_HOME: sqliteHome }
  );
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  const pending = readJson(started.data.pendingPath);
  assert(pending.sourceSnapshot.source.path === sourcePath, `start should bind source path from CODEX_SQLITE_HOME, got ${JSON.stringify(pending.sourceSnapshot)}`);
  assert(pending.sourceSnapshot.source.discovery === 'codexThreadId', `discovery should stay codexThreadId, got ${pending.sourceSnapshot.source.discovery}`);

  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);

  const finished = runInDirWithEnv(
    `usage finish --invocation-id ${started.data.invocationId} --outcome complete`,
    ctx.projectRoot,
    { ...ctx.env, CODEX_THREAD_ID: threadId, CODEX_SQLITE_HOME: sqliteHome }
  );
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 25, `expected sqlite-home total 25, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.path === sourcePath, 'finish should use the CODEX_SQLITE_HOME-bound rollout path');
});

test('runtime adapter: Codex does not infer source from HOME sessions without thread binding', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = codexSessionPath(ctx, 'rollout-single-unbound');
  appendJsonl(sourcePath, [
    codexSessionMeta(ctx.projectRoot),
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  const pending = readJson(started.data.pendingPath);
  assert(pending.sourceSnapshot.source === null, 'start should not scan HOME sessions for an inferred source');

  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', `expected unmeasured, got ${row.status}`);
  assert(row.tokens === null, 'unbound source must not report inferred tokens');
  assert(row.source.path === null, 'unavailable source path should stay null');
});

test('runtime adapter: source discovery failures append unmeasured row instead of failing finish', () => {
  const ctx = createUsageWorkspace();
  const sessionsPath = path.join(ctx.homeDir, '.codex', 'sessions');
  fs.mkdirSync(path.dirname(sessionsPath), { recursive: true });
  fs.writeFileSync(sessionsPath, 'not a directory\n');
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should append unmeasured row after source discovery failure, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', 'source discovery failure should produce unmeasured row');
  assert(row.tokens === null, 'unmeasured tokens null');
  assert(row.warnings.some(w => w.code === 'COUNTERS_UNAVAILABLE'), 'COUNTERS_UNAVAILABLE warning expected');
});

test('usage finish: unmeasured pipeline compact line uses pipeline not-included count', () => {
  const ctx = createUsageWorkspace();
  writeUsageEvents(ctx.projectEvents, [
    usageEvent({
      eventId: 'event_other_partial',
      invocationId: 'usage_other_partial',
      status: 'unmeasured',
      tokens: null,
      projectRoot: ctx.projectRoot,
      fixmeDir: ctx.fixmeDir,
      warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }],
    }),
  ]);
  const started = startUsage(ctx, '--pipeline-run-id usage_pipeline_compact');
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should succeed, got ${JSON.stringify(finished.data)}`);
  assert(finished.data.reportLine.includes('not included: 1 invocation(s)'), `pipeline compact line should use pipeline exclusion count: ${finished.data.reportLine}`);
});

test('runtime adapter: Codex dedupes repeated token_count snapshots before comparing summed last usage', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-duplicate-token-count.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
      { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);

  const repeated = codexTokenCount(
    { input_tokens: 100, cached_input_tokens: 10, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 125 },
    { input_tokens: 100, cached_input_tokens: 10, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 125 }
  );
  appendJsonl(sourcePath, [repeated, repeated]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish should succeed, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `duplicate token_count snapshots should be measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 125, `expected cumulative total delta 125, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.tokens.inputTokens === 100, `expected cumulative input delta 100, got ${row.tokens && row.tokens.inputTokens}`);
  assert(!row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'duplicate token_count replay should not create COUNTER_CONFLICT');
});

test('runtime adapter: Codex keeps identical last-only token_count rows when cumulative snapshots are absent', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-last-only-identical.jsonl');
  fs.writeFileSync(sourcePath, '');
  const started = runInDirWithEnv('usage start --skill fixme-review-code --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);

  const lastOnly = { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 14 } } } };
  appendJsonl(sourcePath, [lastOnly, lastOnly]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `last-only duplicate rows should remain measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 28, `expected both last-only rows to count for total 28, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.tokens.inputTokens === 20, `expected both last-only rows to count for input 20, got ${row.tokens && row.tokens.inputTokens}`);
  assert(!row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'last-only fallback should not create COUNTER_CONFLICT');
});

test('runtime adapter: Codex cumulative and summed last usage conflicts create unmeasured row', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-conflict.jsonl');
  appendJsonl(sourcePath, [codexTokenCount({ input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 }, { input_tokens: 0, total_tokens: 0 })]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 100, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 100 },
      { input_tokens: 99, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 99 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish should append unmeasured row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', 'conflicting counters should be unmeasured');
  assert(row.warnings.some(w => w.code === 'COUNTER_CONFLICT'), 'COUNTER_CONFLICT warning expected');
  assert(finished.data.reportLine.includes('Usage: fixme-write-plan unmeasured (COUNTER_CONFLICT)'), `compact report line should show COUNTER_CONFLICT, got ${finished.data.reportLine}`);
  assert(!finished.data.reportLine.includes('fixme-write-plan unavailable'), `compact report line should not use generic unavailable wording: ${finished.data.reportLine}`);
});

test('runtime adapter: Codex exec turn.completed.usage maps normalized tokens', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-exec.jsonl');
  fs.writeFileSync(sourcePath, '');
  const started = runInDirWithEnv('usage start --skill fixme-execute-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  appendJsonl(sourcePath, [
    { type: 'turn.completed', usage: { input_tokens: 5, cached_input_tokens: 1, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 11 } },
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', 'exec usage should produce measured row');
  assert(row.tokens.totalTokens === 11, 'exec total tokens');
});

test('runtime adapter: Claude message.usage maps cache buckets and derived cachedInputTokens', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'claude-transcript.jsonl');
  fs.writeFileSync(sourcePath, '');
  const started = runInDirWithEnv('usage start --skill fixme-review-plan --runtime claude', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    { type: 'assistant', message: { usage: { input_tokens: 7, cache_creation_input_tokens: 3, cache_read_input_tokens: 4, output_tokens: 6 } }, content: 'must be ignored' },
    { type: 'assistant', message: { usage: { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 1, output_tokens: 2 } }, tool_output: 'must be ignored' },
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', 'Claude usage should produce measured row');
  assert(row.tokens.inputTokens === 12, 'Claude input sum');
  assert(row.tokens.cacheCreationInputTokens === 3, 'Claude cache creation sum');
  assert(row.tokens.cacheReadInputTokens === 5, 'Claude cache read sum');
  assert(row.tokens.cachedInputTokens === 8, 'Claude cachedInputTokens derived sum');
  assert(row.tokens.outputTokens === 8, 'Claude output sum');
  assert(row.tokens.totalTokens === 28, `Claude fallback total should be 28, got ${row.tokens.totalTokens}`);
  assert(row.source.kind === 'claude_jsonl', 'source kind');
  assert(!JSON.stringify(row).includes('must be ignored'), 'content-bearing fixture values must not be stored');
});

test('runtime adapter: Claude hook source maps session id to transcript path with zero cursor', () => {
  const ctx = createUsageWorkspace();
  const sessionId = '7203a77f-dad2-4fb3-bfb4-0c0cfb4b8f16';
  const sourcePath = claudeTranscriptPath(ctx, sessionId);
  const hookInput = JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    session_id: sessionId,
    transcript_path: sourcePath,
    cwd: ctx.projectRoot,
  });
  const hook = runToolPathWithInput(TOOLS_PATH, 'usage claude-hook', hookInput, { cwd: ctx.projectRoot, env: ctx.env });
  assert(hook.ok, `hook should succeed, got ${JSON.stringify(hook)}`);
  assert(hook.data.recorded === true, `hook should record transcript path, got ${JSON.stringify(hook.data)}`);

  const started = runInDirWithEnv('usage start --skill fixme-review-plan --runtime claude', ctx.projectRoot, { ...ctx.env, CLAUDE_CODE_SESSION_ID: sessionId });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  const pending = readJson(started.data.pendingPath);
  assert(pending.sourceSnapshot.source.path === sourcePath, 'start should bind source path from hook session id');
  assert(pending.sourceSnapshot.source.discovery === 'claudeHook', `discovery should be claudeHook, got ${pending.sourceSnapshot.source.discovery}`);
  assert(pending.sourceSnapshot.cursor.path === sourcePath, 'start should persist a bounded cursor for the hook path');
  assert(pending.sourceSnapshot.cursor.size === 0, `missing transcript at start should use zero cursor, got ${pending.sourceSnapshot.cursor.size}`);

  appendJsonl(sourcePath, [
    claudeTranscriptMeta(ctx.projectRoot),
    { type: 'assistant', cwd: ctx.projectRoot, message: { usage: { input_tokens: 7, cache_creation_input_tokens: 3, cache_read_input_tokens: 4, output_tokens: 6 } }, content: 'must be ignored' },
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, CLAUDE_CODE_SESSION_ID: sessionId });
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 20, `expected hook transcript total 20, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.path === sourcePath, 'finish should use the Claude hook transcript path');
  assert(!JSON.stringify(row).includes('must be ignored'), 'content-bearing fixture values must not be stored');
});

test('runtime adapter: no inferred runtime source appends unmeasured row', () => {
  const ctx = createUsageWorkspace();
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should append unmeasured row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', 'missing runtime source should be unmeasured');
  assert(row.tokens === null, 'unmeasured tokens null');
  assert(row.warnings.some(w => w.code === 'COUNTERS_UNAVAILABLE'), 'COUNTERS_UNAVAILABLE warning expected');
});

// ============================================================================
// FIXME-10: Lifecycle handoff and producer release semantics
// ============================================================================

test('run start accepts parent/orchestrator run owners while preserving the agent field name', () => {
  const fixmeDir = makeFixmeDir();
  for (const owner of ['fixme-pr-comments', 'fixme-session']) {
    const started = run(`run start --fixme-dir "${fixmeDir}" --agent ${owner}`);
    assert(started.ok, `run start should accept owner ${owner}, got ${JSON.stringify(started.data)}`);
    assert(started.data.agent === owner, `status agent should remain ${owner}, got ${started.data.agent}`);
    const status = readJson(started.data.statusPath);
    assert(status.agent === owner, `status.json agent field name preserved as ${owner}`);
    const pinged = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.statusId} --state running --checkpoint working --current-command null`);
    assert(pinged.ok, `run ping should accept owner ${owner}, got ${JSON.stringify(pinged.data)}`);
  }
  const bad = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-not-a-real-owner`);
  assert(!bad.ok, 'unknown run owner is still rejected');
  const generated = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-write-plan`);
  assert(generated.ok, 'existing generated agents still accepted as run owners');
});

test('prepare-child without child.parentStatusId creates parent liveness owned by fixme-pr-comments', () => {
  const fixmeDir = makeFixmeDir();
  const payload = prepareChildPayload({ suffix: 'no-parent-status' });
  delete payload.child.parentStatusId;
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-no-parent-status.json', payload);
  const prepared = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(prepared.ok, `prepare-child should succeed without child.parentStatusId, got ${JSON.stringify(prepared.data)}`);
  const continuationStatusId = prepared.data.launch.promptBlocks.parentContinuation.parentStatusId;
  assert(typeof continuationStatusId === 'string' && continuationStatusId.startsWith('run_'), `continuation carries a CLI-created parentStatusId, got ${continuationStatusId}`);
  const parentStatus = readJson(path.join(fixmeDir, 'runs', continuationStatusId, 'status.json'));
  assert(parentStatus.agent === 'fixme-pr-comments', `created parent liveness owner is fixme-pr-comments, got ${parentStatus.agent}`);
  assert(prepared.data.activeChild.parentStatusId === undefined || prepared.data.launch.promptBlocks.activeChild, 'launch carries activeChild');
  assertNoSnakeCaseKeys(prepared.data, 'prepare-child output');

  const replay = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(replay.ok, `replay should succeed, got ${JSON.stringify(replay.data)}`);
  assert(replay.data.launch.promptBlocks.parentContinuation.parentStatusId === continuationStatusId, 'replay reuses the same created parentStatusId');
  assert(replay.data.statusId === prepared.data.statusId, 'replay reuses the child run status');
});

test('prepare-child auto-recovers a consumed-terminal-child parent for a distinct new attempt', () => {
  const fixmeDir = makeFixmeDir();
  const staleCreate = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    idempotencyKey: 'auto-recover-consumed-child',
    extra: {
      cursor: 'presentAnalysis',
      payload: {
        flags: {},
        reviewItems: { currentPrFix: [{ id: 'old' }] },
        analysis: { currentPrFixCount: 1 },
        routedGroups: [{ groupId: 'old', route: 'currentPrFix', sourceIds: ['old'] }],
      },
    },
  })}'`);
  assert(staleCreate.ok, `seed parent should create, got ${JSON.stringify(staleCreate.data)}`);
  const staleState = parentState(fixmeDir, staleCreate.data.parentRunId);
  staleState.status = 'waitingForChild';
  staleState.cursor = 'awaitFixmeTask';
  staleState.payload = {
    fixBatches: [{ id: 'old-batch' }],
    activeBatchIndex: 0,
    activeChild: {
      statusId: 'run_old_child',
      taskRunId: 'taskRun_old_child',
      taskStatePath: path.join(fixmeDir, 'tasks', 'old.state.json'),
      resumeRef: path.join(fixmeDir, 'tasks', 'old.md'),
    },
    consumedTaskEvent: {
      eventId: 'taskEvent_old_child',
      terminalResultId: 'terminalResult_old_child',
      resultSummaryPath: path.join(fixmeDir, 'tasks', 'old.result.json'),
      status: 'completed',
    },
  };
  staleState.updatedAt = new Date().toISOString();
  writeParentState(fixmeDir, staleCreate.data.parentRunId, staleState);

  const payload = prepareChildPayload({ suffix: 'auto-recover-consumed' });
  delete payload.recoverStaleParent;
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-auto-recover-consumed.json', payload);
  const repaired = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(repaired.ok, `auto recovery should succeed without recoverStaleParent, got ${JSON.stringify(repaired.data)}`);
  assert(repaired.data.parentRunId !== staleCreate.data.parentRunId, 'auto recovery creates a distinct new parent run');
  const abandoned = parentState(fixmeDir, staleCreate.data.parentRunId);
  assert(abandoned.status === 'failed', `consumed-child stale parent should be auto-abandoned, got ${JSON.stringify(abandoned)}`);
  assert(abandoned.failure.reason === 'staleParentConsumedTaskEvent', `stale reason should persist, got ${JSON.stringify(abandoned.failure)}`);
});

test('prepare-child still blocks recovery over live unconsumed child work', () => {
  const fixmeDir = makeFixmeDir();
  const liveCreate = run(`lifecycle parent create --fixme-dir "${fixmeDir}" --data '${parentCreateData({
    idempotencyKey: 'live-unconsumed-child',
    extra: {
      cursor: 'presentAnalysis',
      payload: {
        flags: {},
        reviewItems: { currentPrFix: [{ id: 'live' }] },
        analysis: { currentPrFixCount: 1 },
        routedGroups: [{ groupId: 'live', route: 'currentPrFix', sourceIds: ['live'] }],
      },
    },
  })}'`);
  assert(liveCreate.ok, `seed live parent should create, got ${JSON.stringify(liveCreate.data)}`);
  const liveState = parentState(fixmeDir, liveCreate.data.parentRunId);
  liveState.status = 'waitingForChild';
  liveState.cursor = 'awaitFixmeTask';
  liveState.payload = {
    fixBatches: [{ id: 'live-batch' }],
    activeBatchIndex: 0,
    activeChild: {
      statusId: 'run_live_child',
      taskRunId: 'taskRun_live_child',
      taskStatePath: path.join(fixmeDir, 'tasks', 'live.state.json'),
      resumeRef: path.join(fixmeDir, 'tasks', 'live.md'),
    },
  };
  liveState.updatedAt = new Date().toISOString();
  writeParentState(fixmeDir, liveCreate.data.parentRunId, liveState);

  const payload = prepareChildPayload({ suffix: 'live-unconsumed' });
  delete payload.recoverStaleParent;
  const payloadPath = writeJsonFixture(path.dirname(fixmeDir), 'prepare-child-live-unconsumed.json', payload);
  const repaired = run(`lifecycle parent prepare-child --fixme-dir "${fixmeDir}" --data-file "${payloadPath}"`);
  assert(!repaired.ok, `live unconsumed child work must block recovery, got ${JSON.stringify(repaired.data)}`);
  const stillLive = parentState(fixmeDir, liveCreate.data.parentRunId);
  assert(stillLive.status !== 'failed', `live parent must not be auto-abandoned, got ${JSON.stringify(stillLive.status)}`);
});

test('Codex agent dispatch does not inherit parent invocation usage source', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-parent-source-no-inherit.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const parent = runInDirWithEnv(`usage start --skill fixme-task --runtime codex --role orchestrator --source-path "${sourcePath}"`, ctx.projectRoot, ctx.env);
  assert(parent.ok, `parent usage start should succeed, got ${JSON.stringify(parent.data)}`);

  const dispatchEnv = { ...ctx.env, CODEX_THREAD_ID: '', CODEX_SESSION_FILE: '', FIXME_USAGE_SOURCE_PATH: '' };
  const agentPayload = {
    idempotencyKey: 'codex-agent-no-inherit', agentName: 'fixme-plan-readiness', transport: 'agent', runtime: 'codex',
    parentInvocationId: parent.data.invocationId, pipelineRunId: parent.data.pipelineRunId, promptInputs: { phase: 'readiness' },
  };
  const agentPrepared = runInDirWithEnv(`lifecycle dispatch prepare --fixme-dir "${ctx.fixmeDir}" --data '${JSON.stringify(agentPayload)}'`, ctx.projectRoot, dispatchEnv);
  assert(agentPrepared.ok, `codex agent dispatch should succeed, got ${JSON.stringify(agentPrepared.data)}`);
  assert(agentPrepared.data.usageContext.usageSourcePath === null, `codex agent dispatch must not inherit parent source, got ${JSON.stringify(agentPrepared.data.usageContext)}`);

  const backgroundPayload = { ...agentPayload, idempotencyKey: 'codex-background-no-inherit', transport: 'background' };
  const backgroundPrepared = runInDirWithEnv(`lifecycle dispatch prepare --fixme-dir "${ctx.fixmeDir}" --data '${JSON.stringify(backgroundPayload)}'`, ctx.projectRoot, dispatchEnv);
  assert(backgroundPrepared.ok, `codex background dispatch should succeed, got ${JSON.stringify(backgroundPrepared.data)}`);
  assert(backgroundPrepared.data.usageContext.usageSourcePath === null, `codex background dispatch must not inherit parent source, got ${JSON.stringify(backgroundPrepared.data.usageContext)}`);

  const explicitPayload = { ...agentPayload, idempotencyKey: 'codex-agent-explicit-source', usageSourcePath: sourcePath };
  const explicitPrepared = runInDirWithEnv(`lifecycle dispatch prepare --fixme-dir "${ctx.fixmeDir}" --data '${JSON.stringify(explicitPayload)}'`, ctx.projectRoot, dispatchEnv);
  assert(explicitPrepared.ok, `codex agent dispatch with explicit source should succeed, got ${JSON.stringify(explicitPrepared.data)}`);
  assert(explicitPrepared.data.usageContext.usageSourcePath === sourcePath, `explicit usageSourcePath is still honored, got ${JSON.stringify(explicitPrepared.data.usageContext)}`);

  const inlinePayload = { ...agentPayload, idempotencyKey: 'codex-inline-inherit', transport: 'inline-skill' };
  const inlinePrepared = runInDirWithEnv(`lifecycle dispatch prepare --fixme-dir "${ctx.fixmeDir}" --data '${JSON.stringify(inlinePayload)}'`, ctx.projectRoot, dispatchEnv);
  assert(inlinePrepared.ok, `codex inline-skill dispatch should succeed, got ${JSON.stringify(inlinePrepared.data)}`);
  assert(inlinePrepared.data.usageContext.usageSourcePath === sourcePath, `codex inline-skill dispatch still inherits parent source, got ${JSON.stringify(inlinePrepared.data.usageContext)}`);
});

test('dispatch prepare exposes structured banner context for producer continuation modes', () => {
  const { projectRoot, fixmeDir, statePath } = initTaskState('banner-context-modes');

  const checkpoint = runInDir(
    `task checkpoint --state "${statePath}" --data '${JSON.stringify({
      producerContinuations: [
        {
          agentName: 'fixme-write-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_plan_banner' },
          status: 'available',
          lastDispatchId: 'dispatch_plan_banner',
          badReason: null,
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
        {
          agentName: 'fixme-execute-plan',
          runtime: 'codex',
          runtimeHandle: { kind: 'codexAgentId', id: 'agent_exec_bad' },
          status: 'bad',
          lastDispatchId: 'dispatch_exec_bad',
          badReason: 'resumeFailed',
          updatedAt: '2026-06-12T00:00:00.000Z',
        },
      ],
    })}'`,
    projectRoot,
  );
  assert(checkpoint.ok, `banner-context checkpoint setup should pass: ${checkpoint.stderr || checkpoint.stdout}`);

  const resume = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'banner-resume', agentName: 'fixme-write-plan', transport: 'agent', runtime: 'codex',
      taskStatePath: statePath, allowProducerContinuation: true, promptInputs: { mode: 'plan' },
    })}'`,
    projectRoot,
  );
  assert(resume.ok, `resume prepare should pass: ${resume.stderr || resume.stdout}`);
  assert(resume.data.bannerContext.continuationMode === 'resume', `resume bannerContext mode, got ${JSON.stringify(resume.data.bannerContext)}`);
  assert(resume.data.bannerContext.storedHandleStatus === 'available', `resume storedHandleStatus available, got ${resume.data.bannerContext.storedHandleStatus}`);
  assert(resume.data.bannerMarkdown.includes('resume existing producer'), `resume banner labels mode, got ${resume.data.bannerMarkdown}`);
  assert(resume.data.bannerMarkdown.includes('stored resumable producer handle'), `resume banner labels handle, got ${resume.data.bannerMarkdown}`);
  assertNoSnakeCaseKeys(resume.data.bannerContext, 'bannerContext');

  const forced = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'banner-forced', agentName: 'fixme-write-plan', transport: 'agent', runtime: 'codex',
      taskStatePath: statePath, allowProducerContinuation: true, forceFreshReason: 'userRequestedFresh', promptInputs: { mode: 'plan' },
    })}'`,
    projectRoot,
  );
  assert(forced.ok, `forced-fresh prepare should pass: ${forced.stderr || forced.stdout}`);
  assert(forced.data.bannerContext.continuationReason === 'forcedFresh', `forced reason, got ${forced.data.bannerContext.continuationReason}`);
  assert(forced.data.bannerMarkdown.includes('fresh producer'), `forced banner says fresh, got ${forced.data.bannerMarkdown}`);
  assert(forced.data.bannerMarkdown.includes('forced fresh'), `forced banner labels forced fresh, got ${forced.data.bannerMarkdown}`);

  const bad = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'banner-bad', agentName: 'fixme-execute-plan', transport: 'agent', runtime: 'codex',
      taskStatePath: statePath, allowProducerContinuation: true, promptInputs: { mode: 'execute' },
    })}'`,
    projectRoot,
  );
  assert(bad.ok, `bad-handle prepare should pass: ${bad.stderr || bad.stdout}`);
  assert(bad.data.bannerContext.continuationReason === 'storedHandleBad', `bad reason, got ${bad.data.bannerContext.continuationReason}`);
  assert(bad.data.bannerMarkdown.includes('bad stored handle'), `bad banner labels bad handle, got ${bad.data.bannerMarkdown}`);

  const notResumable = runInDir(
    `lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${JSON.stringify({
      idempotencyKey: 'banner-not-resumable', agentName: 'fixme-task', transport: 'agent', runtime: 'codex',
      taskStatePath: statePath, promptInputs: { mode: 'task' },
    })}'`,
    projectRoot,
  );
  assert(notResumable.ok, `not-resumable prepare should pass: ${notResumable.stderr || notResumable.stdout}`);
  assert(notResumable.data.bannerContext.continuationReason === 'agentNotResumable', `not-resumable reason, got ${notResumable.data.bannerContext.continuationReason}`);
  assert(!notResumable.data.bannerMarkdown.includes('stored resumable producer handle'), `not-resumable banner must not claim a producer handle, got ${notResumable.data.bannerMarkdown}`);
});

test('dispatch prepare returns a completion template carrying dispatchId, statusId, parentStatusId and currentCommand null', () => {
  const fixmeDir = makeFixmeDir();
  const parent = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  const prepData = JSON.stringify({ idempotencyKey: 'completion-template', agentName: 'fixme-write-plan', transport: 'agent', parentStatusId: parent.data.statusId, promptInputs: {} });
  const prep = run(`lifecycle dispatch prepare --fixme-dir "${fixmeDir}" --data '${prepData}'`);
  assert(prep.ok, `prepare should succeed, got ${JSON.stringify(prep.data)}`);
  const template = prep.data.completionTemplate;
  assert(template && typeof template === 'object', `completionTemplate present, got ${JSON.stringify(template)}`);
  assert(template.dispatchId === prep.data.dispatchId, `template dispatchId matches, got ${template.dispatchId}`);
  assert(template.statusId === prep.data.statusId, `template statusId matches, got ${template.statusId}`);
  assert(template.parentStatusId === parent.data.statusId, `template parentStatusId matches, got ${template.parentStatusId}`);
  assert(template.currentCommand === null, `template currentCommand null, got ${template.currentCommand}`);
  assertNoSnakeCaseKeys(prep.data, 'dispatch prepare output');

  const completeData = JSON.stringify({ ...template, status: 'completed' });
  const complete = run(`lifecycle dispatch complete --fixme-dir "${fixmeDir}" --data '${completeData}'`);
  assert(complete.ok, `complete built from template should succeed, got ${JSON.stringify(complete.data)}`);
  const cleared = run(`run status --fixme-dir "${fixmeDir}" --status-id ${parent.data.statusId}`);
  assert(cleared.data.currentCommand === null, `parent wait marker cleared, got ${cleared.data.currentCommand}`);
});

test('stale explicit Codex source finalizes unmeasured with STALE_COUNTER_SOURCE', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-stale-source.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 },
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 }
    ),
  ]);
  // Start AFTER the only row exists: the bounded scan from the start cursor finds
  // no token counters at or after start, making this explicit source stale.
  const started = runInDirWithEnv(`usage start --skill fixme-write-plan --runtime codex --source-path "${sourcePath}"`, ctx.projectRoot, ctx.env);
  assert(started.ok, `usage start should succeed, got ${JSON.stringify(started.data)}`);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `usage finish should append a row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents).find(event => event.invocationId === started.data.invocationId);
  assert(row && row.status === 'unmeasured', `stale explicit source should be unmeasured, got ${JSON.stringify(row)}`);
  assert(row.warnings.length === 1 && row.warnings[0].code === 'STALE_COUNTER_SOURCE', `warning code should be STALE_COUNTER_SOURCE, got ${JSON.stringify(row.warnings)}`);
  assert(row.warnings[0].message.includes(sourcePath), `stale warning should name the source path, got ${row.warnings[0].message}`);
});

test('valid explicit Codex source remains measured', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-valid-source.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 },
      { input_tokens: 10, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 13 }
    ),
  ]);
  const started = runInDirWithEnv(`usage start --skill fixme-write-plan --runtime codex --source-path "${sourcePath}"`, ctx.projectRoot, ctx.env);
  assert(started.ok, `usage start should succeed, got ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 40, cached_input_tokens: 5, output_tokens: 12, reasoning_output_tokens: 7, total_tokens: 64 },
      { input_tokens: 30, cached_input_tokens: 4, output_tokens: 10, reasoning_output_tokens: 6, total_tokens: 51 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `usage finish should succeed, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents).find(event => event.invocationId === started.data.invocationId);
  assert(row && row.status === 'measured', `valid explicit source with a countable row after start should be measured, got ${JSON.stringify(row)}`);
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

cleanup();

process.exit(failed > 0 ? 1 : 0);
