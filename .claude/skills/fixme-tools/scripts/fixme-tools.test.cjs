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

const TOOLS_PATH = path.join(__dirname, 'fixme-tools.cjs');
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
    return { ok: true, data: JSON.parse(result.trim()) };
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

function runInDirWithEnv(args, cwd, env = {}) {
  return runToolPath(TOOLS_PATH, args, { cwd, env });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
    env: { HOME: homeDir },
    projectEvents: path.join(projectRoot, '.fixme', 'usage', 'events.jsonl'),
    globalEvents: path.join(homeDir, '.fixme', 'usage', 'events.jsonl'),
  };
}

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-test-'));
  tmpDirs.push(dir);
  return dir;
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
          { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
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

function createLegacyPipelineConfig(baseDir) {
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
  createTicketFolder(sessionDir, '0002', 'bug-b', 'investigating');

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
  createTicketFolder(sessionDir, '0002', 'bug-b', 'investigating');
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
  createTicketFolder(sessionDir, '0001', 'bug-a', 'investigating');
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
  createTicketFolder(sessionDir, '0001', 'bug-a', 'investigating');

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

test('transition: queued -> investigating works with ticket.md in folder', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'my-bug', 'queued');

  const result = run(`ticket transition "${ticketPath}" investigating`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'investigating', `to should be investigating, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: investigating'), 'State should be investigating');
});

test('transition: queued -> failed with reason succeeds', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'test', 'queued');

  const result = run(`ticket transition "${ticketPath}" failed --reason "Intake failed"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'failed', `to should be failed, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
  assert(content.includes('failure_reason: "Intake failed"'), 'Should have failure reason');
});

test('transition: queued -> failed without reason errors', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0003', 'test2', 'queued');

  const result = run(`ticket transition "${ticketPath}" failed`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('--reason'), `Error should mention --reason: ${result.data.error}`);
});

test('transition: directory path auto-resolves to ticket.md', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'dir-test', 'queued');
  const ticketDir = path.dirname(ticketPath);

  const result = run(`ticket transition "${ticketDir}" investigating`);
  assert(result.ok, `Expected success with dir path, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'investigating', `to should be investigating, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: investigating'), 'State should be investigating');
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
  assert(/^run_[A-Za-z0-9_-]+$/.test(result.data.status_id), `status_id should be generated run id, got ${result.data.status_id}`);
  assert(result.data.status_path === path.join(fixmeDir, 'runs', result.data.status_id, 'status.json'), `status_path should be under fixme runs dir, got ${result.data.status_path}`);
  assert(fs.existsSync(result.data.status_path), 'status.json should exist');

  const status = readJson(result.data.status_path);
  assert(status.schema_version === 1, 'schema_version should be 1');
  assert(status.status_id === result.data.status_id, 'status_id should match');
  assert(status.agent === 'fixme-review-code', `agent should be fixme-review-code, got ${status.agent}`);
  assert(status.state === 'running', `state should be running, got ${status.state}`);
  assert(status.checkpoint === 'dispatched', `checkpoint should be dispatched, got ${status.checkpoint}`);
  assert(status.current_command === null, 'current_command should be null');
  assert(typeof status.updated_at === 'string' && !Number.isNaN(Date.parse(status.updated_at)), `updated_at should be ISO timestamp, got ${status.updated_at}`);
});

test('run ping and status: updates and reads current liveness status', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-execute-plan`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const pinged = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.status_id} --state running --checkpoint working --current-command "yarn test"`);
  assert(pinged.ok, `run ping should succeed, got: ${JSON.stringify(pinged.data)}`);
  assert(pinged.data.status_path === started.data.status_path, 'ping should return same status_path');

  const read = run(`run status --fixme-dir "${fixmeDir}" --status-id ${started.data.status_id}`);
  assert(read.ok, `run status should succeed, got: ${JSON.stringify(read.data)}`);
  assert(read.data.status_id === started.data.status_id, 'status_id should match');
  assert(read.data.agent === 'fixme-execute-plan', `agent should be preserved, got ${read.data.agent}`);
  assert(read.data.state === 'running', `state should be running, got ${read.data.state}`);
  assert(read.data.checkpoint === 'working', `checkpoint should be working, got ${read.data.checkpoint}`);
  assert(read.data.current_command === 'yarn test', `current_command should be yarn test, got ${read.data.current_command}`);
  assert(read.data.updated_at >= started.data.updated_at, 'updated_at should not move backwards');
});

test('run ping: accepts null current command and terminal state', () => {
  const base = createTmpDir();
  const fixmeDir = path.join(base, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  const started = run(`run start --fixme-dir "${fixmeDir}" --agent fixme-task`);
  assert(started.ok, `run start should succeed, got: ${JSON.stringify(started.data)}`);

  const pinged = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.status_id} --state completed --checkpoint done --current-command null`);

  assert(pinged.ok, `run ping should succeed, got: ${JSON.stringify(pinged.data)}`);
  assert(pinged.data.state === 'completed', `state should be completed, got ${pinged.data.state}`);
  assert(pinged.data.checkpoint === 'done', `checkpoint should be done, got ${pinged.data.checkpoint}`);
  assert(pinged.data.current_command === null, 'current_command should be null');
});

test('run start: rejects non-agent skills and invalid fixme-dir paths', () => {
  const invalidAgent = run('run start --fixme-dir "/tmp/fixme-test" --agent fixme-usage');
  assert(!invalidAgent.ok, 'fixme-usage should not be accepted as a run agent');
  assert(invalidAgent.data.error.includes('Unsupported run agent'), `error should mention unsupported agent, got ${invalidAgent.data.error}`);

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

  const badState = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.status_id} --state paused --checkpoint working --current-command null`);
  assert(!badState.ok, 'invalid state should be rejected');
  assert(badState.data.error.includes('Unsupported run state'), `error should mention unsupported state, got ${badState.data.error}`);

  const badCheckpoint = run(`run ping --fixme-dir "${fixmeDir}" --status-id ${started.data.status_id} --state running --checkpoint task-execution --current-command null`);
  assert(!badCheckpoint.ok, 'invalid checkpoint should be rejected');
  assert(badCheckpoint.data.error.includes('Unsupported run checkpoint'), `error should mention unsupported checkpoint, got ${badCheckpoint.data.error}`);
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

test('task save: writes FIXME-labelled task brief and camelCase checkpoint', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Resume Fixme Task',
    taskGoal: 'Make fixme-task resumable from a stable task reference.',
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
    pipelineHint: 'standard',
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
  assert(state.pipelineResolution.source === 'legacyPipelineHint', `pipelineResolution.source should be legacyPipelineHint, got ${state.pipelineResolution && state.pipelineResolution.source}`);
  assert(state.pipelineResolution.evidence === 'pipelineHint', `pipelineResolution.evidence should be pipelineHint, got ${state.pipelineResolution && state.pipelineResolution.evidence}`);
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

test('task resolve: resolves FIXME label and legacy task path to canonical state paths', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });

  const data = JSON.stringify({
    title: 'Resolve Saved Task',
    taskGoal: 'Resolve a saved task by label.',
    agreedApproach: ['Save a standalone task, then resolve it by visible label, task path, and state path.'],
    userVisibleBehavior: ['A user can resume the same saved task through each supported reference form.'],
    scope: {
      inScope: ['Standalone task save and task reference resolution'],
      outOfScope: ['Ticket-backed task resolution'],
    },
    laterPlanningNotes: ['Assert each reference resolves to the same canonical task and state paths.'],
    pipelineHint: 'plan-only',
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

test('task init: creates ticket-backed task state and resolves ticket folder', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0001', 'resume-ticket', 'queued');
  const ticketDir = path.dirname(ticketPath);

  const initialized = runInDir(`task init --ticket "${ticketPath}" --pipeline standard --project-root "${projectRoot}"`, projectRoot);

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

test('task init: rejects non-markdown task paths without overwriting input', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const taskPath = path.join(projectRoot, 'not-a-task.txt');
  fs.writeFileSync(taskPath, 'keep this content');

  const initialized = runInDir(`task init --task "${taskPath}" --pipeline standard --project-root "${projectRoot}"`, projectRoot);

  assert(!initialized.ok, 'task init should reject non-markdown task paths');
  assert(initialized.data.error.includes('Task path must end with .md'), `error should mention .md task path, got ${initialized.data.error}`);
  assert(fs.readFileSync(taskPath, 'utf8') === 'keep this content', 'task init should not overwrite non-markdown input');
});

test('task checkpoint: merges allowed camelCase state fields and rejects invalid keys', () => {
  const projectRoot = createTmpDir();
  fs.mkdirSync(path.join(projectRoot, '.fixme'), { recursive: true });
  const sessionDir = path.join(projectRoot, '.fixme', 'sessions', 'test-session');
  const ticketPath = createTicketFolder(sessionDir, '0002', 'checkpoint-ticket', 'queued');
  const initialized = runInDir(`task init --ticket "${ticketPath}" --pipeline standard --project-root "${projectRoot}"`, projectRoot);
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
});

// ============================================================================
// Test Suite: new state transitions -- happy path through all 9 states
// ============================================================================

console.log('\n=== new state transitions: happy path ===\n');

test('happy path: queued -> investigating -> researching -> planning -> implementing -> verifying -> done', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'full-path', 'queued');

  const states = ['investigating', 'researching', 'planning', 'implementing', 'verifying', 'done'];
  for (const nextState of states) {
    const result = run(`ticket transition "${ticketPath}" ${nextState}`);
    assert(result.ok, `Transition to ${nextState} should succeed, got: ${JSON.stringify(result.data)}`);
  }

  // Verify final state
  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: done'), 'Final state should be done');

  // Verify transitions log has 6 entries
  // Parse the ticket to check transitions count
  const transitions = content.match(/from:/g);
  assert(transitions && transitions.length === 6, `Should have 6 transitions, got ${transitions ? transitions.length : 0}`);
});

// ============================================================================
// Test Suite: retry path (verifying -> planning)
// ============================================================================

console.log('\n=== retry path: verifying -> planning ===\n');

test('retry: verifying -> planning with --reason succeeds and increments attempt', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'retry-test', 'queued');

  // Walk to verifying
  const walkStates = ['investigating', 'researching', 'planning', 'implementing', 'verifying'];
  for (const s of walkStates) {
    const r = run(`ticket transition "${ticketPath}" ${s}`);
    assert(r.ok, `Walk to ${s} should succeed`);
  }

  // Retry: verifying -> planning with reason
  const result = run(`ticket transition "${ticketPath}" planning --reason "Build failed"`);
  assert(result.ok, `Retry transition should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'verifying', `from should be verifying, got ${result.data.from}`);
  assert(result.data.to === 'planning', `to should be planning, got ${result.data.to}`);

  // Verify current_attempt incremented
  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('current_attempt: 1'), `current_attempt should be 1, content: ${content.substring(0, 500)}`);

  // Verify reason appears in transitions log
  assert(content.includes('Build failed'), 'Reason should appear in transitions');
});

// ============================================================================
// Test Suite: invalid old transition (investigating -> fixing)
// ============================================================================

console.log('\n=== invalid old transitions ===\n');

test('invalid: investigating -> fixing is rejected', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'invalid-test', 'queued');

  // Walk to investigating
  const r = run(`ticket transition "${ticketPath}" investigating`);
  assert(r.ok, 'Walk to investigating should succeed');

  // Try the old invalid transition
  const result = run(`ticket transition "${ticketPath}" fixing`);
  assert(!result.ok, 'investigating -> fixing should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Valid transitions from'), `Error should list valid transitions: ${result.data.error}`);
});

// ============================================================================
// Test Suite: new failure paths (researching/planning/implementing -> failed)
// ============================================================================

console.log('\n=== new failure paths ===\n');

test('failure: researching -> failed with --reason succeeds', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'fail-research', 'queued');

  const r1 = run(`ticket transition "${ticketPath}" investigating`);
  assert(r1.ok, 'Walk to investigating should succeed');
  const r2 = run(`ticket transition "${ticketPath}" researching`);
  assert(r2.ok, 'Walk to researching should succeed');

  // Verify we're actually in researching before testing failure path
  const pre = fs.readFileSync(ticketPath, 'utf8');
  assert(pre.includes('state: researching'), 'Should be in researching state before failure test');

  const result = run(`ticket transition "${ticketPath}" failed --reason "No root cause found"`);
  assert(result.ok, `researching -> failed should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'researching', `from should be researching, got ${result.data.from}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
});

test('failure: planning -> failed with --reason succeeds', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'fail-plan', 'queued');

  const r1 = run(`ticket transition "${ticketPath}" investigating`);
  assert(r1.ok, 'Walk to investigating should succeed');
  const r2 = run(`ticket transition "${ticketPath}" researching`);
  assert(r2.ok, 'Walk to researching should succeed');
  const r3 = run(`ticket transition "${ticketPath}" planning`);
  assert(r3.ok, 'Walk to planning should succeed');

  // Verify we're actually in planning
  const pre = fs.readFileSync(ticketPath, 'utf8');
  assert(pre.includes('state: planning'), 'Should be in planning state before failure test');

  const result = run(`ticket transition "${ticketPath}" failed --reason "No viable fix"`);
  assert(result.ok, `planning -> failed should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'planning', `from should be planning, got ${result.data.from}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
});

test('failure: implementing -> failed with --reason succeeds', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'fail-impl', 'queued');

  const r1 = run(`ticket transition "${ticketPath}" investigating`);
  assert(r1.ok, 'Walk to investigating should succeed');
  const r2 = run(`ticket transition "${ticketPath}" researching`);
  assert(r2.ok, 'Walk to researching should succeed');
  const r3 = run(`ticket transition "${ticketPath}" planning`);
  assert(r3.ok, 'Walk to planning should succeed');
  const r4 = run(`ticket transition "${ticketPath}" implementing`);
  assert(r4.ok, 'Walk to implementing should succeed');

  // Verify we're actually in implementing
  const pre = fs.readFileSync(ticketPath, 'utf8');
  assert(pre.includes('state: implementing'), 'Should be in implementing state before failure test');

  const result = run(`ticket transition "${ticketPath}" failed --reason "Implementation blocked"`);
  assert(result.ok, `implementing -> failed should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'implementing', `from should be implementing, got ${result.data.from}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
});

// ============================================================================
// Test Suite: cumulative durations on state re-entry
// ============================================================================

console.log('\n=== cumulative durations on re-entry ===\n');

test('cumulative: planning duration preserved across retry', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'cumul-test', 'queued');

  // Walk to planning
  run(`ticket transition "${ticketPath}" investigating`);
  run(`ticket transition "${ticketPath}" researching`);
  run(`ticket transition "${ticketPath}" planning`);

  // Read the ticket to note the first planning.entered timestamp
  const content1 = fs.readFileSync(ticketPath, 'utf8');
  // The planning duration entry should exist with an entered timestamp
  assert(content1.includes('planning:'), 'Should have planning duration entry after first visit');

  // Continue through implementing -> verifying
  run(`ticket transition "${ticketPath}" implementing`);
  run(`ticket transition "${ticketPath}" verifying`);

  // Read ticket -- planning should now have seconds computed (exited when going to implementing)
  const content2 = fs.readFileSync(ticketPath, 'utf8');
  // planning entry should have seconds field (even if 0, since transitions are fast)
  assert(content2.includes('planning:'), 'planning duration should still exist');

  // Retry: verifying -> planning
  run(`ticket transition "${ticketPath}" planning --reason "Tests failed"`);

  // Read ticket after re-entry
  const content3 = fs.readFileSync(ticketPath, 'utf8');
  // The planning entry should have a NEW entered timestamp
  assert(content3.includes('planning:'), 'planning duration should exist after re-entry');
  // Check for prior_seconds field (cumulative tracking)
  assert(content3.includes('prior_seconds:'), 'planning should have prior_seconds field for cumulative tracking');
});

// ============================================================================
// Test Suite: max_attempts enforcement on verifying -> planning
// ============================================================================

console.log('\n=== max_attempts enforcement ===\n');

/**
 * Helper: create a ticket and walk it to verifying state.
 * Optionally set current_attempt and max_attempts in frontmatter before the walk.
 */
function walkToVerifying(sessionDir, slug, overrides) {
  const ticketPath = createTicketFolder(sessionDir, '0001', slug, 'queued');

  // Apply frontmatter overrides before walking
  if (overrides) {
    let content = fs.readFileSync(ticketPath, 'utf8');
    if (overrides.max_attempts !== undefined) {
      content = content.replace(/max_attempts: 3/, `max_attempts: ${overrides.max_attempts}`);
    }
    if (overrides.current_attempt !== undefined) {
      content = content.replace(/current_attempt: 0/, `current_attempt: ${overrides.current_attempt}`);
    }
    fs.writeFileSync(ticketPath, content);
  }

  // Walk to verifying
  const walkStates = ['investigating', 'researching', 'planning', 'implementing', 'verifying'];
  for (const s of walkStates) {
    const r = run(`ticket transition "${ticketPath}" ${s}`);
    assert(r.ok, `Walk to ${s} should succeed for ${slug}`);
  }

  return ticketPath;
}

test('max_attempts: allows retry when current_attempt=0, max_attempts=3', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'allow-retry-0of3', {});

  const result = run(`ticket transition "${ticketPath}" planning --reason "Tests failed"`);
  assert(result.ok, `Should allow retry at attempt 0/3, got: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'planning', `Should transition to planning, got ${result.data.to}`);
});

test('max_attempts: allows retry when current_attempt=1, max_attempts=3', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'allow-retry-1of3', { current_attempt: 1 });

  const result = run(`ticket transition "${ticketPath}" planning --reason "Tests failed again"`);
  assert(result.ok, `Should allow retry at attempt 1/3, got: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'planning', `Should transition to planning, got ${result.data.to}`);
});

test('max_attempts: rejects retry when current_attempt=2, max_attempts=3', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'reject-retry-2of3', { current_attempt: 2 });

  const result = run(`ticket transition "${ticketPath}" planning --reason "Tests failed yet again"`);
  assert(!result.ok, 'Should reject retry at attempt 2/3');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

test('max_attempts: rejects retry when current_attempt=0, max_attempts=1', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'reject-retry-0of1', { max_attempts: 1 });

  const result = run(`ticket transition "${ticketPath}" planning --reason "Only one attempt allowed"`);
  assert(!result.ok, 'Should reject retry at attempt 0/1');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

test('max_attempts: allows retry when current_attempt=0, max_attempts=2', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'allow-retry-0of2', { max_attempts: 2 });

  const result = run(`ticket transition "${ticketPath}" planning --reason "Second chance"`);
  assert(result.ok, `Should allow retry at attempt 0/2, got: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'planning', `Should transition to planning, got ${result.data.to}`);
});

test('max_attempts: rejects retry when current_attempt=1, max_attempts=2', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'reject-retry-1of2', { current_attempt: 1, max_attempts: 2 });

  const result = run(`ticket transition "${ticketPath}" planning --reason "No more retries"`);
  assert(!result.ok, 'Should reject retry at attempt 1/2');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('Retry limit reached'), `Error should mention retry limit: ${result.data.error}`);
});

test('max_attempts: error message contains attempt count and max', () => {
  const sessionDir = createTmpDir();
  const ticketPath = walkToVerifying(sessionDir, 'error-msg-check', { current_attempt: 2, max_attempts: 3 });

  const result = run(`ticket transition "${ticketPath}" planning --reason "Check message"`);
  assert(!result.ok, 'Should reject retry');
  assert(result.data.error.includes('3 of 3'), `Error should contain attempt counts: ${result.data.error}`);
  assert(result.data.error.includes('verifying -> planning denied'), `Error should mention denied transition: ${result.data.error}`);
});

test('max_attempts: defaults to max_attempts=3 when field missing', () => {
  const sessionDir = createTmpDir();
  // Create ticket without max_attempts in frontmatter
  const ticketPath = createTicketFolder(sessionDir, '0001', 'no-max-field', 'queued');

  // Remove max_attempts line from frontmatter entirely
  let content = fs.readFileSync(ticketPath, 'utf8');
  content = content.replace(/max_attempts: 3\n/, '');
  content = content.replace(/current_attempt: 0/, 'current_attempt: 2');
  fs.writeFileSync(ticketPath, content);

  // Walk to verifying
  const walkStates = ['investigating', 'researching', 'planning', 'implementing', 'verifying'];
  for (const s of walkStates) {
    const r = run(`ticket transition "${ticketPath}" ${s}`);
    assert(r.ok, `Walk to ${s} should succeed`);
  }

  // Should reject -- current_attempt=2 >= max_attempts(3) - 1
  const result = run(`ticket transition "${ticketPath}" planning --reason "Defaults test"`);
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

test('pipeline flag: legacy default alias stores final standard pipeline name', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name pipe-session`, base);
  const sessionDir = sessionResult.data.path;
  const createResult = runInDir(`ticket create "${sessionDir}" --slug pipeline-test`, base);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, base);
  assert(t1.ok, `Transition failed: ${JSON.stringify(t1.data)}`);
  assert(t1.data.to === 'plan', `to should be plan, got ${t1.data.to}`);

  const frontmatterLines = readTicketFrontmatterLines(ticketPath);
  assert(frontmatterLines.includes('pipeline: standard'), 'legacy default alias should be stored as standard in frontmatter');
  assert(!frontmatterLines.includes('pipeline: default'), 'legacy default alias should be removed from frontmatter');
});

test('pipeline frontmatter: legacy stored default remains transitionable and normalizes on write', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name stored-alias-session`, base);
  const sessionDir = sessionResult.data.path;
  const createResult = runInDir(`ticket create "${sessionDir}" --slug stored-alias-test`, base);
  const ticketPath = createResult.data.path;
  setTicketFrontmatterField(ticketPath, 'pipeline', 'default');

  const beforeFrontmatter = readTicketFrontmatterLines(ticketPath);
  assert(beforeFrontmatter.includes('pipeline: default'), 'test setup should store legacy alias in frontmatter');

  const t1 = runInDir(`ticket transition "${ticketPath}" plan`, base);
  assert(t1.ok, `Stored alias transition should succeed: ${JSON.stringify(t1.data)}`);

  const afterFrontmatter = readTicketFrontmatterLines(ticketPath);
  assert(afterFrontmatter.includes('pipeline: standard'), 'stored legacy alias should normalize after successful transition');
  assert(!afterFrontmatter.includes('pipeline: default'), 'stored legacy alias should be removed from frontmatter after normalization');
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

test('pipeline: legacy pipelines config remains readable before migration', () => {
  const base = createTmpDir();
  createLegacyPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name legacy-pipeline-session`, base);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug legacy-pipeline-test`, base);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, base);
  assert(t1.ok, `Legacy pipeline transition should succeed: ${JSON.stringify(t1.data)}`);
  assert(t1.data.to === 'plan', `to should be plan, got ${t1.data.to}`);
});

test('fallback: legacy transitions when no --pipeline and no pipeline in frontmatter', () => {
  const base = createTmpDir();
  // No createPipelineConfig -- no config.json exists
  const ticketPath = createTicketFolder(base, '0001', 'fallback-test', 'queued');

  const result = run(`ticket transition "${ticketPath}" investigating`);
  assert(result.ok, `Fallback transition should succeed: ${JSON.stringify(result.data)}`);
  assert(result.data.to === 'investigating', `Should transition to investigating, got ${result.data.to}`);
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
  // Must NOT have created the legacy yaml context file
  const legacyYamlPath = path.join(fixmeDir, ['project', 'context.yaml'].join('-'));
  assert(!fs.existsSync(legacyYamlPath), 'legacy yaml file must not exist');
});

test('context save preserves existing config keys', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  // Write existing config with workflows and models
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    ticketBackend: 'fixme-tickets-md',
    models: { profile: 'balanced' },
    workflows: { default: { outerMaxCycles: 2, phases: [{ name: 'plan', skills: ['fixme-write-plan'] }] } }
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
  assert(config.workflows.standard.phases[1].review.maxCycles === 3, 'standard implement review should use 3 cycles');
  assert(!config.workflows.quick.phases.some(phase => phase.review), 'quick should have no review blocks');
  assert(phaseNames(config.workflows.full) === 'product-spec -> technical-spec -> plan -> implement -> verify', `full phases should be feature lifecycle, got ${phaseNames(config.workflows.full)}`);
  assert(phaseNames(config.workflows.bugfix) === 'investigate -> research -> plan -> implement -> verify', `bugfix phases should be investigate workflow, got ${phaseNames(config.workflows.bugfix)}`);
  assert(!config.workflows.default, 'default legacy workflow should not be written');
  assert(!config.workflows.plan, 'plan legacy workflow should not be written');
  assert(!config.workflows.execute, 'execute legacy workflow should not be written');
  assert(!config.workflows['idea-to-production'], 'idea-to-production legacy workflow should not be written');
});

test('config migrate renames legacy workflow names and moves legacy full bugfix workflow', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      default: workflowWithPhases([{ name: 'legacy-standard', skills: ['legacy-standard-skill'] }], { outerMaxCycles: 7 }),
      plan: workflowWithPhases([{ name: 'legacy-plan', skills: ['legacy-plan-skill'] }]),
      execute: workflowWithPhases([{ name: 'legacy-execute', skills: ['legacy-execute-skill'] }]),
      'idea-to-production': workflowWithPhases([
        { name: 'product-spec', skills: ['fixme-write-product-spec'] },
        { name: 'technical-spec', skills: ['fixme-write-technical-spec'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
        { name: 'implement', skills: ['fixme-execute-plan'] },
      ]),
      full: workflowWithPhases([
        { name: 'investigate', skills: ['fixme-investigate'] },
        { name: 'research', skills: ['fixme-research'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
        { name: 'implement', skills: ['fixme-execute-plan'] },
        { name: 'verify', skills: ['fixme-browser-verify'] },
      ], { outerMaxCycles: 5 }),
    },
  });

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `migration should succeed: ${JSON.stringify(result.data)}`);
  const config = readProjectConfig(tmp);

  assert(config.workflows.standard.phases[0].name === 'legacy-standard', 'default should rename to standard');
  assert(config.workflows.standard.outerMaxCycles === 7, 'renamed standard should keep outerMaxCycles');
  assert(config.workflows['plan-only'].phases[0].name === 'legacy-plan', 'plan should rename to plan-only');
  assert(config.workflows['execute-only'].phases[0].name === 'legacy-execute', 'execute should rename to execute-only');
  assert(phaseNames(config.workflows.full) === 'product-spec -> technical-spec -> plan -> implement -> verify', 'idea-to-production should rename to final full and add verify');
  assert(config.workflows.bugfix.phases[0].name === 'investigate', 'old full bugfix workflow should move to bugfix');
  assert(!config.workflows.default && !config.workflows.plan && !config.workflows.execute && !config.workflows['idea-to-production'], 'legacy workflow keys should be removed');
  assert(result.data.renamedWorkflows.some(entry => entry.from === 'full' && entry.to === 'bugfix'), 'migration result should report full -> bugfix move');
});

test('config migrate upgrades legacy feature full workflow by adding verify', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      full: workflowWithPhases([
        { name: 'product-spec', skills: ['fixme-write-product-spec'] },
        { name: 'technical-spec', skills: ['fixme-write-technical-spec'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
        { name: 'implement', skills: ['fixme-execute-plan'] },
      ]),
    },
  });

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `migration should succeed: ${JSON.stringify(result.data)}`);
  const config = readProjectConfig(tmp);

  assert(phaseNames(config.workflows.full) === 'product-spec -> technical-spec -> plan -> implement -> verify', `full phases should add verify, got ${phaseNames(config.workflows.full)}`);
  assert(config.workflows.full.phases[4].skills[0] === 'fixme-browser-verify', 'added verify phase should use browser verification skill');
});

test('config migrate rejects custom idea-to-production instead of writing invalid full workflow', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      'idea-to-production': workflowWithPhases([{ name: 'legacy-full', skills: ['legacy-full-skill'] }]),
    },
  });
  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

  assert(!result.ok, 'custom idea-to-production should fail instead of becoming reserved full');
  assert(result.data && result.data.error === 'workflow_name_conflict', `expected workflow_name_conflict, got ${JSON.stringify(result.data)}`);
  assert(result.data.workflow === 'full', `expected full workflow conflict, got ${JSON.stringify(result.data)}`);
  assert(!('from' in result.data) || result.data.from !== result.data.to, `reserved workflow conflict should not report a self-rename: ${JSON.stringify(result.data)}`);
  assert(before === after, 'failed migration should not write config');
});

test('config migrate aborts conflicting custom full workflow without writing', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      full: workflowWithPhases([{ name: 'custom-one', skills: ['custom-skill'] }]),
      'idea-to-production': workflowWithPhases([{ name: 'product-spec', skills: ['fixme-write-product-spec'] }]),
    },
  });
  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

  assert(!result.ok, 'conflicting full workflow should fail');
  assert(result.data && result.data.error === 'workflow_name_conflict', `expected JSON workflow_name_conflict, got ${JSON.stringify(result.data)}`);
  assert(before === after, 'conflicting migration should not write config');
});

test('config migrate requires exact old bugfix full phase names and primary skills', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      full: workflowWithPhases([
        { name: 'custom-investigate', skills: ['fixme-investigate'] },
        { name: 'research', skills: ['fixme-research'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
        { name: 'implement', skills: ['fixme-execute-plan'] },
        { name: 'verify', skills: ['fixme-browser-verify'] },
      ]),
    },
  });
  const before = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');
  const result = runInDir('config migrate', tmp);
  const after = fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8');

  assert(!result.ok, 'legacy full with custom phase names should fail instead of moving to bugfix');
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

test('config migrate converts legacy review softness to final review levels', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    review: {
      softness: {
        default: 'default',
        surfaces: { 'pr-comments': 'tactical' },
        workflows: {
          default: {
            default: 'lenient',
            phases: { plan: 'strict', implement: 'panic' },
          },
        },
      },
    },
  });

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `migration should succeed: ${JSON.stringify(result.data)}`);
  const config = readProjectConfig(tmp);

  assert(config.review.level === 'standard', 'legacy global default should convert to standard');
  assert(config.workflows.standard.review.level === 'lenient', 'legacy workflow softness should convert to workflow review.level');
  assert(config.workflows.standard.phases.find(phase => phase.name === 'plan').review.level === 'strict', 'legacy phase strict should convert to phase review.level');
  assert(config.workflows.standard.phases.find(phase => phase.name === 'implement').review.level === 'critical', 'legacy phase panic should convert to critical');
  assert(config.pullRequestComments.review.level === 'fast-track', 'legacy PR tactical surface should convert to fast-track');
  assert(!config.review.softness, 'legacy softness config should be removed');
});

test('config migrate converts legacy float softness and review surfaces into review-enabled phases', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    review: {
      softness: {
        default: 0.9,
        surfaces: {
          'spec-review': 'lenient',
          'plan-review': 'strict',
          'code-review': 'panic',
          'pr-comments': 'tactical',
        },
        workflows: {
          standard: { phases: { plan: 'default' } },
        },
      },
    },
  });

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `migration should succeed: ${JSON.stringify(result.data)}`);
  const config = readProjectConfig(tmp);

  assert(config.review.level === 'fast-track', `legacy float 0.9 should convert to fast-track, got ${config.review.level}`);
  assert(config.workflows.standard.phases.find(phase => phase.name === 'plan').review.level === 'standard', 'legacy phase override should beat plan-review surface');
  assert(config.workflows.standard.phases.find(phase => phase.name === 'implement').review.level === 'critical', 'code-review surface should convert into implement review-enabled phases');
  assert(config.workflows['plan-only'].phases.find(phase => phase.name === 'plan').review.level === 'strict', 'plan-review surface should convert into plan review-enabled phases');
  assert(config.workflows.full.phases.find(phase => phase.name === 'product-spec').review.level === 'lenient', 'spec-review surface should convert into product spec phase');
  assert(config.workflows.full.phases.find(phase => phase.name === 'technical-spec').review.level === 'lenient', 'spec-review surface should convert into technical spec phase');
  assert(config.pullRequestComments.review.level === 'fast-track', 'PR review surface should still convert to pullRequestComments.review.level');
});

test('config migrate converts legacy float softness using final review-level bands', () => {
  const cases = [
    [0, 'strict'],
    [0.15, 'strict'],
    [0.1501, 'standard'],
    [0.45, 'standard'],
    [0.4501, 'lenient'],
    [0.725, 'lenient'],
    [0.7251, 'fast-track'],
    [0.9249, 'fast-track'],
    [0.925, 'critical'],
    [1, 'critical'],
  ];

  for (const [value, expectedLevel] of cases) {
    const tmp = createTmpDir();
    writeProjectConfig(tmp, {
      review: {
        softness: {
          default: value,
        },
      },
    });

    const result = runInDir('config migrate', tmp);
    assert(result.ok, `migration should succeed for ${value}: ${JSON.stringify(result.data)}`);
    const config = readProjectConfig(tmp);
    assert(config.review.level === expectedLevel, `legacy float ${value} should convert to ${expectedLevel}, got ${config.review.level}`);
  }
});

test('config migrate warns for invalid present legacy softness values and falls through', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    review: {
      softness: {
        default: 'bogus',
        surfaces: {
          'plan-review': 1.1,
          'pr-comments': -0.01,
        },
        workflows: {
          standard: {
            default: 'wat',
            phases: {
              plan: 2,
            },
          },
        },
      },
    },
  });

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `migration should succeed with warnings: ${JSON.stringify(result.data)}`);
  const config = readProjectConfig(tmp);
  const warnings = result.data.warnings || [];

  assert(config.review.level === 'standard', `invalid global softness should fall through to final default standard, got ${config.review.level}`);
  assert(!config.workflows.standard.review || config.workflows.standard.review.level === undefined, 'invalid workflow softness should not write workflow review.level');
  assert(config.workflows.standard.phases.find(phase => phase.name === 'plan').review.level === undefined, 'invalid phase and surface softness should not write phase review.level');
  assert(!config.pullRequestComments || !config.pullRequestComments.review || config.pullRequestComments.review.level === undefined, 'invalid PR softness should not write pullRequestComments.review.level');
  assert(warnings.some(warning => warning.configPath === 'review.softness.default'), `missing warning for review.softness.default: ${JSON.stringify(warnings)}`);
  assert(warnings.some(warning => warning.configPath === 'review.softness.workflows.standard.default'), `missing warning for workflow default: ${JSON.stringify(warnings)}`);
  assert(warnings.some(warning => warning.configPath === 'review.softness.workflows.standard.phases.plan'), `missing warning for workflow phase: ${JSON.stringify(warnings)}`);
  assert(warnings.some(warning => warning.configPath === 'review.softness.surfaces.plan-review'), `missing warning for plan-review surface: ${JSON.stringify(warnings)}`);
  assert(warnings.some(warning => warning.configPath === 'review.softness.surfaces.pr-comments'), `missing warning for PR comments surface: ${JSON.stringify(warnings)}`);
});

test('config migrate uses actual workflow moves for legacy workflow review softness', () => {
  const tmp = createTmpDir();
  writeProjectConfig(tmp, {
    workflows: {
      full: workflowWithPhases([
        { name: 'investigate', skills: ['fixme-investigate'] },
        { name: 'research', skills: ['fixme-research'] },
        { name: 'plan', skills: ['fixme-write-plan'] },
        { name: 'implement', skills: ['fixme-execute-plan'] },
        { name: 'verify', skills: ['fixme-browser-verify'] },
      ], { outerMaxCycles: 5 }),
    },
    review: {
      softness: {
        default: 'default',
        workflows: {
          full: { default: 'panic' },
        },
      },
    },
  });

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `migration should succeed: ${JSON.stringify(result.data)}`);
  const config = readProjectConfig(tmp);

  assert(config.workflows.bugfix.review.level === 'critical', 'legacy full workflow softness should move to final bugfix review.level');
  assert(!config.workflows.full.review || config.workflows.full.review.level !== 'critical', 'final full must not inherit old bugfix full softness');
  assert(result.data.renamedWorkflows.some(entry => entry.from === 'full' && entry.to === 'bugfix'), 'migration result should report full -> bugfix move');
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
  const legacyReviewKey = ['review', 'softness', 'default'].join('.');
  result = runInDir(`config set ${legacyReviewKey} "\\"strict\\""`, tmp);
  assert(!result.ok, 'legacy review filter key should be unsupported');
  const legacyModeKey = ['review', 'mode'].join('.');
  result = runInDir(`config set ${legacyModeKey} "\\"lenient\\""`, tmp);
  assert(!result.ok, 'legacy review mode key should be unsupported');
  const legacyScopeKey = ['fix', 'Scope', 'default'].join('.');
  result = runInDir(`config set ${legacyScopeKey} "\\"current\\""`, tmp);
  assert(!result.ok, 'legacy scope key should be unsupported');
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

test('config set validates and writes workflow outerMaxCycles', () => {
  const tmp = createTmpDir();
  const result = runInDir('config set workflows.standard.outerMaxCycles 6', tmp);
  assert(result.ok, `config set should succeed: ${JSON.stringify(result.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(config.workflows.standard.outerMaxCycles === 6, 'outerMaxCycles should be written');
  assert(Array.isArray(config.workflows.standard.phases), 'config set should migrate standard workflows');
  assert(config.workflowControls === undefined, 'config set must not write legacy workflowControls');
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

// ============================================================================
// Test Suite: root CLI command
// ============================================================================

console.log('\n=== root CLI command ===\n');

test('root: returns fixme_root and fixme_dir for local .fixme/', () => {
  const tmp = fs.realpathSync(createTmpDir());
  fs.mkdirSync(path.join(tmp, '.fixme'), { recursive: true });
  const result = runInDir('root', tmp);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixme_root === tmp, `fixme_root should be ${tmp}, got ${result.data.fixme_root}`);
  assert(result.data.fixme_dir === path.join(tmp, '.fixme'), `fixme_dir should end with .fixme, got ${result.data.fixme_dir}`);
});

test('root: resolves to parent when .fixme/ is in parent and sub-dir has .git', () => {
  const workspace = fs.realpathSync(createTmpDir());
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
  const tmp = fs.realpathSync(createTmpDir());
  const result = runInDir('root', tmp);
  assert(result.ok, `root command should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.fixme_root === tmp, `fixme_root should be CWD, got ${result.data.fixme_root}`);
  assert(result.data.fixme_dir === path.join(tmp, '.fixme'), `fixme_dir should be CWD/.fixme, got ${result.data.fixme_dir}`);
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
  assert(installedTask.includes('resolve-model X --runtime codex'), 'adapter should resolve Codex runtime profile settings');
  assert(installedTask.includes('Skill("name", args)'), 'adapter should map Skill invocation');
  assert(installedTask.includes('take precedence over lower source instructions'), 'adapter should declare precedence over Claude-native source rules');
  assert(installedTask.includes('In Codex Plan mode'), 'adapter should limit request_user_input to Plan mode');
  assert(installedTask.includes('do not call `request_user_input`'), 'adapter should forbid request_user_input outside Plan mode');
  assert(installedTask.includes('ask in normal text'), 'adapter should require plain text fallback outside Plan mode');
  assert(installedTask.includes('$HOME/.codex/skills/fixme-task/SKILL.md'), 'source skill body should rewrite Claude paths to Codex paths');
  assert(installedTask.includes('~/.codex/rules/spec-review-rules.md'), 'tilde Claude paths should rewrite to Codex paths');
  assert(!installedTask.includes('$HOME/.claude/'), 'installed skill should not retain Claude home paths');
  assert(installedTask.includes('## Fixme Usage Tracking'), 'installed Codex skill should include usage tracking block');
  assert(installedTask.includes('## Fixme Agent Liveness'), 'installed Codex skill should include liveness block');
  assert(installedTask.includes('run ping --fixme-dir <fixme-dir> --status-id <status_id>'), 'Codex liveness block should use run ping');
  assert(installedTask.includes('If the dispatch prompt does not include `status_id`, skip this liveness block.'), 'Codex liveness block should be optional when no status_id exists');
  assert(installedTask.includes('--runtime codex'), 'Codex usage block should pass --runtime codex');
  assert(!installedTask.includes('--runtime auto'), 'Codex usage block should not pass --runtime auto');
  assert(!installedTask.includes('--task'), 'usage block must not pass --task');
  assert(installedTask.includes('Only run this block when `fixme-task` is the active skill invocation.'), 'usage block should have active-skill guard');
  assert(installedTask.includes('--role orchestrator'), 'fixme-task should be instrumented as orchestrator');
  assert(installedTask.includes('Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive.'), 'usage report line must come before terminal directives');
  assert(installedHandler.includes('Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive.'), 'handler usage report line must come before terminal directives');
  assert(installedHandler.includes('## Fixme Agent Liveness'), 'handler should include liveness block');

  const usageBlockCount = (installedTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(usageBlockCount === 1, `usage block should be idempotent, got ${usageBlockCount}`);
  const livenessBlockCount = (installedTask.match(/## Fixme Agent Liveness/g) || []).length;
  assert(livenessBlockCount === 1, `liveness block should be idempotent, got ${livenessBlockCount}`);

  const installedReference = fs.readFileSync(path.join(codexSkillsDir, 'fixme-task', 'references', 'dispatch.md'), 'utf8');
  assert(installedReference.includes('.codex/skills/fixme-task/SKILL.md'), 'markdown references should be path-converted');

  assert(!fs.existsSync(path.join(codexSkillsDir, 'fixme-stale')), 'stale Fixme skill copy should be removed');
  assert(!fs.existsSync(path.join(codexSkillsDir, 'fixme-tickets-md', 'scripts')), 'fixme-tickets-md scripts should not be installed into Codex skills');

  const reinstall = run(`codex-skills install --skills-src "${skillsSrc}" --codex-dir "${codexDir}"`);
  assert(reinstall.ok, `reinstall should succeed, got: ${JSON.stringify(reinstall)}`);
  const reinstalledTask = fs.readFileSync(path.join(codexSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const adapterCount = (reinstalledTask.match(/<codex_skill_adapter>/g) || []).length;
  assert(adapterCount === 1, `adapter should be idempotent, got ${adapterCount}`);
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

  assert(task.includes('## Fixme Usage Tracking'), 'Claude task skill should include usage tracking block');
  assert(task.includes('## Fixme Agent Liveness'), 'Claude task skill should include liveness block');
  assert(task.includes('run ping --fixme-dir <fixme-dir> --status-id <status_id>'), 'Claude liveness block should use run ping');
  assert(task.includes('If the dispatch prompt does not include `status_id`, skip this liveness block.'), 'Claude liveness block should be optional when no status_id exists');
  assert(task.includes('--runtime claude'), 'Claude usage block should pass --runtime claude');
  assert(!task.includes('--runtime auto'), 'Claude usage block should not pass --runtime auto');
  assert(!task.includes('--task'), 'usage block must not pass --task');
  assert(task.includes('--role orchestrator'), 'fixme-task role mapping');
  assert(reviewer.includes('--role reviewer'), 'fixme-review-* role mapping');
  assert(handler.includes('--role handler'), 'fixme-handle-* role mapping');
  assert(task.includes('Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive.'), 'usage report line must come before terminal directives');
  assert(handler.includes('Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive.'), 'handler usage report line must come before terminal directives');
  assert(reviewer.includes('## Fixme Agent Liveness'), 'reviewer should include liveness block');
  assert(handler.includes('## Fixme Agent Liveness'), 'handler should include liveness block');
  assert(reference.includes('--role reference'), 'fixme-howto-* role mapping');
  assert(reference.includes('Only run this block when `fixme-howto-code-map` is the active skill invocation.'), 'reference guard');
  assert(!fs.existsSync(path.join(claudeSkillsDir, 'fixme-tickets-md', 'scripts')), 'fixme-tickets-md scripts should not install');

  const reinstall = run(`claude-skills install --skills-src "${skillsSrc}" --claude-dir "${claudeDir}"`);
  assert(reinstall.ok, `reinstall should succeed, got: ${JSON.stringify(reinstall)}`);
  const reinstalledTask = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const blockCount = (reinstalledTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(blockCount === 1, `usage block should be idempotent, got ${blockCount}`);
  const livenessBlockCount = (reinstalledTask.match(/## Fixme Agent Liveness/g) || []).length;
  assert(livenessBlockCount === 1, `liveness block should be idempotent, got ${livenessBlockCount}`);
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
  assert(toolsSkill.includes('run status --fixme-dir'), 'fixme-tools skill should document run status');
  assert(toolsSkill.includes('task save --data'), 'fixme-tools skill should document task save');
  assert(toolsSkill.includes('task save` rejects skeletal inputs that are not self-contained handoffs'), 'fixme-tools skill should document task save handoff validation');
  assert(toolsSkill.includes('task init --ticket'), 'fixme-tools skill should document task init for tickets');
  assert(toolsSkill.includes('task checkpoint --state'), 'fixme-tools skill should document task checkpoint');
  assert(toolsSkill.includes('task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>'), 'fixme-tools skill should document task resolve');
});

test('fixme-task skill: propagates usage pipeline IDs to child skill prompts', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('usageInvocationId'), 'fixme-task should name its usage invocation state');
  assert(skill.includes('pipelineRunId'), 'fixme-task should name the shared pipelineRunId state');
  assert(skill.includes('pipeline_run_id: <pipelineRunId>'), 'child prompts should include pipeline_run_id');
  assert(skill.includes('parent_invocation_id: <usageInvocationId>'), 'child prompts should include parent_invocation_id');
  assert(skill.includes('Nested `fixme-task` receives a `pipeline_run_id`'), 'nested pipeline ID reuse should be explicit');
});

test('fixme-task skill: creates liveness status for every dispatched agent', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('run start --fixme-dir <fixme-dir> --agent <agent-name>'), 'fixme-task should create liveness status before each Agent dispatch');
  assert(skill.includes('<liveness>'), 'child prompts should include liveness block');
  assert(skill.includes('status_id: <status_id from run start>'), 'child prompts should include status_id');
  assert(skill.includes('Do not dispatch the agent if `run start` fails.'), 'fixme-task should fail closed when liveness setup fails');
});

test('fixme-task skill: refreshes its own liveness while waiting on dispatched agents', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('Before every Agent dispatch wait, ping the current fixme-task invocation'), 'fixme-task should refresh its inherited liveness before waiting on child agents');
  assert(skill.includes('--current-command "waiting for <agent-name>"'), 'fixme-task should report the child agent it is waiting on');
  assert(skill.includes('After the dispatched agent returns, ping the current fixme-task invocation again'), 'fixme-task should refresh its inherited liveness after child agents return');
});

test('fixme-session skill: tracks background fixme-task liveness status id', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-session', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('active_run_status_id'), 'fixme-session should track active_run_status_id');
  assert(skill.includes('run start --fixme-dir <fixme-dir> --agent fixme-task'), 'fixme-session should create liveness status before background fixme-task');
  assert(skill.includes('status_id: <status_id from run start>'), 'background prompt should include status_id');
  assert(skill.includes('run status --fixme-dir <fixme-dir> --status-id <active_run_status_id>'), 'status flow should read liveness status');
});

test('fixme-pr-comments skill: tracks nested fixme-task liveness status id', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('Liveness is the only allowed `<fixme-dir>` carve-out'), 'PR comments should permit only the liveness carve-out');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs root'), 'PR comments should resolve the fixme dir for liveness');
  assert(skill.includes('run start --fixme-dir <fixme-dir> --agent fixme-task'), 'PR comments should create liveness status before nested fixme-task');
  assert(skill.includes('fixmeTaskStatusId'), 'PR comments should name the nested fixme-task status id');
  assert(skill.includes('status_id: <fixmeTaskStatusId>'), 'nested fixme-task args should include status_id');
  assert(skill.includes('run status --fixme-dir <fixme-dir> --status-id <fixmeTaskStatusId>'), 'parent wait loop should read nested fixme-task liveness');
});

test('fixme-brainstorm skill: tracks selected downstream fixme-task liveness', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-brainstorm', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('For `Run configured fixme-task workflow`, set `<selected-fixme-agent>` to `fixme-task`.'), 'brainstorm should map the fixme-task menu option to the fixme-task agent');
  assert(skill.includes('run start --fixme-dir <fixme-dir> --agent <selected-fixme-agent>'), 'brainstorm should create liveness before downstream dispatch');
  assert(skill.includes('status_id: <status_id from run start>'), 'brainstorm downstream args should include liveness status_id');
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
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data'), 'save mode should delegate saved task writes to fixme-tools');
  assert(skill.includes('### Save Mode Lossless Handoff Gate'), 'save mode should define the lossless handoff gate');
  assert(skill.includes('A future run must be able to plan and execute from the task file alone, with no chat history.'), 'save mode should state the task file is the context boundary');
  assert(skill.includes('Do not compress a rich discussion into only a title and one-sentence goal.'), 'save mode should forbid lossy save summaries');
  assert(skill.includes('The CLI rejects skeletal handoffs that omit concrete `agreedApproach`, `userVisibleBehavior`, `scope.inScope`, or `laterPlanningNotes`.'), 'save mode should document the CLI fail-closed guard');
  assert(skill.includes("task init --ticket <ticket-path> --pipeline-resolution '<pipeline-resolution-json>' --project-root <project-root>"), 'ticket mode should initialize task state through fixme-tools');
  assert(skill.includes('task checkpoint --state <task-state-path> --data'), 'fixme-task should checkpoint resumable state through fixme-tools');
  assert(skill.includes('task resolve <FIXME-N|task.md|state.json|ticket.md|ticket-folder>'), 'resume mode should resolve task references through fixme-tools');
  assert(skill.includes('camelCase JSON keys only'), 'task state JSON requirement should be explicit');
  assert(skill.includes('Do not persist `currentSpecificationPath`, numbered manifest steps, or `currentStep`'), 'task state should exclude derived aliases and numbered manifest data');
  assert(skill.includes('The title is always auto-generated from the resolved task context.'), 'title generation should be automatic');
  assert(skill.includes('Do not ask the user for a title.'), 'save mode should not prompt for titles');
  assert(skill.includes('If no task, issue, solution approach, or agreed shape exists in arguments, IDE selection, or conversation context, abort'), 'save mode should abort when there is no task context');
  assert(skill.includes('Save intent can be terminal or non-terminal depending on the rest of the instruction.'), 'save mode should not be unconditionally terminal');
  assert(skill.includes('If the user only asks to save, write the saved task brief and stop before manifest creation, config loading, ticket transitions, or agent dispatch.'), 'save-only instructions should remain terminal');
  assert(skill.includes('If the user explicitly asks to continue, proceed, run, plan, execute, implement, or otherwise continue the workflow after saving, write the saved task brief first, then continue into the selected or auto-detected pipeline using the saved task brief as task context.'), 'save-and-continue instructions should continue after saving');
  assert(skill.includes('If save intent and continuation intent are ambiguous, stop and ask the user which behavior they want. Do not guess.'), 'ambiguous save instructions should ask instead of guessing');
  assert(skill.includes('Do not dispatch agents, create a manifest, transition tickets, or enter Config Loading only when save is terminal.'), 'terminal save output should be conditional');
  assert(skill.includes('TASK_PATH: <absolute path to saved task brief>'), 'save mode should output a task path directive');
  assert(skill.includes('Label: `FIXME-<number>`'), 'save mode should generate a visible task label');
  assert(skill.includes('The counter file stores the next available task number.'), 'save mode should define counter semantics');
  assert(skill.includes('The CLI reads and updates `<fixme-dir>/tasks/.counter`'), 'save mode should delegate counter handling to the CLI');
  assert(skill.includes('If the counter file is missing, the CLI uses `1` as the next number.'), 'save mode should initialize missing counters');
  assert(skill.includes('If the counter file exists but is not a positive integer, the CLI aborts'), 'save mode should not guess on corrupt counters');
  assert(skill.includes('Saved [FIXME-<number>](<absolute path to saved task brief>)'), 'save mode should print a clickable label link');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task save --data'), 'orchestrator allowlist should permit task save');
  assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs task checkpoint --state <task-state-path> --data'), 'orchestrator allowlist should permit task checkpoint');
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
  assert(!specHandler.includes('HANDLER_RESULT: CLEAN | HAS_FIX | HAS_ASK_USER'), 'spec handler should no longer emit the legacy two-state directive');
  assert(!specHandler.includes('SPEC_LOOP_EXIT'), 'spec handler should no longer use SPEC_LOOP_EXIT; CLEAN with DONE replaces it');

  assert(specAgent.includes('HAS_BLOCKING_FIX'), 'spec handler agent role text should enumerate HAS_BLOCKING_FIX');
  assert(specAgent.includes('HAS_NONBLOCKING_FINDINGS'), 'spec handler agent role text should enumerate HAS_NONBLOCKING_FINDINGS');
  assert(!/Output HANDLER_RESULT: CLEAN, HAS_FIX, or HAS_ASK_USER/.test(specAgent), 'spec handler agent role text should not enumerate the legacy two-state directive');
});

test('fixme review handler agents enumerate the unified three-state directive', () => {
  const agentNames = ['fixme-handle-spec-review', 'fixme-handle-plan-review', 'fixme-handle-code-review'];
  for (const agentName of agentNames) {
    const agentPath = path.resolve(__dirname, '..', '..', '..', 'agents', `${agentName}.md`);
    const agent = fs.readFileSync(agentPath, 'utf8');
    assert(agent.includes('HAS_BLOCKING_FIX'), `${agentName} role text should enumerate HAS_BLOCKING_FIX`);
    assert(agent.includes('HAS_NONBLOCKING_FINDINGS'), `${agentName} role text should enumerate HAS_NONBLOCKING_FINDINGS`);
    assert(!/Output HANDLER_RESULT: CLEAN, HAS_FIX, or HAS_ASK_USER/.test(agent), `${agentName} role text should not enumerate the legacy two-state directive`);
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
  assert(!session.includes('Default: `"full"` for bug fix sessions'), 'session dispatch must not default bug fixes to full');
  assert(!session.includes('ticket transition <ticket-folder>/ticket.md investigating'), 'session dispatch must not use non-phase state investigating');
  assert(!session.includes('ticket transition <ticket-folder>/ticket.md investigate`'), 'session dispatch must not use bare investigate transition without pipeline');
  assert(investigationAgent.includes('transitioned to `investigate`'), 'investigation agent should refer to final investigate phase');
  assert(!investigationAgent.includes('transitioned to "investigating"'), 'investigation agent must not refer to legacy investigating state');
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
  assert(task.includes('`--idea-to-production` remains accepted as a compatibility alias for `full`'), 'task docs should keep idea-to-production as alias only');
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

test('usage finish: missing counters appends one unmeasured row to project and global events', () => {
  const ctx = createUsageWorkspace();
  const started = startUsage(ctx);
  const result = runInDirWithEnv(`usage finish --invocation-id ${started.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(result.ok, `usage finish should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.status === 'unmeasured', `expected unmeasured, got ${result.data.status}`);
  assert(result.data.outcomeReason === null, 'complete outcomeReason should be null');
  assert(result.data.reportLine && result.data.reportLine.includes('Usage: fixme-write-plan unavailable'), 'unmeasured report line should be present');
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

test('usage finish: measured compact report line has no delta plus prefix', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = path.join(ctx.projectRoot, 'codex-session-report-line.jsonl');
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 10, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 10 },
      { input_tokens: 10, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 10 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 40, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 45 },
      { input_tokens: 30, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 35 }
    ),
  ]);
  const result = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, { ...ctx.env, FIXME_USAGE_SOURCE_PATH: sourcePath });
  assert(result.ok, `usage finish should succeed, got: ${JSON.stringify(result.data)}`);
  assert(result.data.reportLine === 'Usage: fixme-write-plan 35 tokens | project total 35 tokens', `unexpected report line: ${result.data.reportLine}`);
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
  assert(result.data.totalUsage.nonCachedTokens === 135, `non-cached tokens should be 135, got ${result.data.totalUsage.nonCachedTokens}`);
  assert(result.data.totalUsage.cachedTokens === 20, `cached tokens should be 20, got ${result.data.totalUsage.cachedTokens}`);
  assert(result.data.notIncludedInTotal.invocationCount === 1, 'one unmeasured invocation excluded');
  assert(result.data.notIncludedInTotal.eventIds.includes('event_unmeasured'), 'unmeasured event listed');
  assert(result.data.warningSummary.some(w => w.code === 'COUNTERS_UNAVAILABLE' && w.count === 1), 'warning summary includes unmeasured warning');
});

test('usage report: legacy partial rows are displayed as unmeasured', () => {
  const ctx = createUsageWorkspace();
  writeUsageEvents(ctx.projectEvents, [
    usageEvent({
      eventId: 'event_legacy_partial',
      invocationId: 'usage_legacy_partial',
      projectRoot: ctx.projectRoot,
      fixmeDir: ctx.fixmeDir,
      status: 'partial',
      tokens: null,
      warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }],
    }),
  ]);

  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.recent[0].status === 'unmeasured', `legacy partial should report as unmeasured, got ${result.data.recent[0].status}`);
  assert(result.data.bySkill[0].unmeasuredCount === 1, 'legacy partial row should count as unmeasured');
  assert(!Object.prototype.hasOwnProperty.call(result.data.bySkill[0], 'partialCount'), 'report should not expose partialCount');
});

test('usage report: legacy complete rows are displayed as measured', () => {
  const ctx = createUsageWorkspace();
  writeUsageEvents(ctx.projectEvents, [
    usageEvent({
      eventId: 'event_legacy_complete',
      invocationId: 'usage_legacy_complete',
      projectRoot: ctx.projectRoot,
      fixmeDir: ctx.fixmeDir,
      status: 'complete',
    }),
  ]);

  const result = runInDirWithEnv('usage report --scope project', ctx.projectRoot, ctx.env);
  assert(result.ok, `report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.recent[0].status === 'measured', `legacy complete should report as measured, got ${result.data.recent[0].status}`);
  assert(result.data.bySkill[0].measuredCount === 1, 'legacy complete row should count as measured');
  assert(!Object.prototype.hasOwnProperty.call(result.data.bySkill[0], 'completeCount'), 'report should not expose completeCount');
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
  assert(result.data.includes('Non-cached usage: 135 tokens'), `missing non-cached usage line: ${result.data}`);
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
  assert(!Object.prototype.hasOwnProperty.call(bySkill, 'completeCount'), 'bySkill should not expose completeCount');
  assert(!Object.prototype.hasOwnProperty.call(bySkill, 'partialCount'), 'bySkill should not expose partialCount');
  assert(bySkill.notIncludedInTotal.invocationCount === 2, `bySkill excluded count ${bySkill.notIncludedInTotal.invocationCount}`);
  assert(bySkill.warningSummary.some(w => w.code === 'DUPLICATE_INVOCATION_CONFLICT' && w.count === 1), 'bySkill warning summary includes duplicate conflict group');
  assert(!Object.prototype.hasOwnProperty.call(bySkill, 'invocations'), 'bySkill should not expose legacy invocations field');
  assert(bySkill.totalUsage.nonCachedTokens === 135, `bySkill non-cached tokens ${bySkill.totalUsage.nonCachedTokens}`);
  assert(bySkill.totalUsage.cachedTokens === 20, `bySkill cached tokens ${bySkill.totalUsage.cachedTokens}`);

  const byPipeline = result.data.byPipeline.find(row => row.pipelineRunId === pipelineRunId);
  assert(byPipeline.invocationCount === 2, `byPipeline invocationCount should exclude duplicate-conflict groups, got ${byPipeline && byPipeline.invocationCount}`);
  assert(byPipeline.measuredCount === 1, `byPipeline measuredCount ${byPipeline.measuredCount}`);
  assert(byPipeline.unmeasuredCount === 1, `byPipeline unmeasuredCount ${byPipeline.unmeasuredCount}`);
  assert(!Object.prototype.hasOwnProperty.call(byPipeline, 'completeCount'), 'byPipeline should not expose completeCount');
  assert(!Object.prototype.hasOwnProperty.call(byPipeline, 'partialCount'), 'byPipeline should not expose partialCount');
  assert(byPipeline.notIncludedInTotal.invocationCount === 2, `byPipeline excluded count ${byPipeline.notIncludedInTotal.invocationCount}`);
  assert(byPipeline.warningSummary.some(w => w.code === 'COUNTERS_UNAVAILABLE' && w.count === 1), 'byPipeline warning summary includes unmeasured warning');
  assert(byPipeline.orchestratorUsage.totalTokens === 0, 'byPipeline includes orchestratorUsage subtotal object');
  assert(byPipeline.childUsage.totalTokens === 135, 'byPipeline includes childUsage subtotal object');
  assert(byPipeline.totalUsage.nonCachedTokens === 135, `byPipeline non-cached tokens ${byPipeline.totalUsage.nonCachedTokens}`);
  assert(byPipeline.totalUsage.cachedTokens === 20, `byPipeline cached tokens ${byPipeline.totalUsage.cachedTokens}`);
});

test('usage report: text output uses duplicate-conflict not-included language', () => {
  const ctx = createUsageWorkspace();
  const complete = usageEvent({ eventId: 'event_text_complete', invocationId: 'usage_text_complete', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const conflict = usageEvent({ eventId: 'event_text_conflict', invocationId: 'usage_text_conflict', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const conflictOther = { ...conflict, eventId: 'event_text_conflict_other', tokens: { ...conflict.tokens, totalTokens: 999 } };
  writeUsageEvents(ctx.projectEvents, [complete, conflict, conflictOther]);

  const result = runInDirWithEnv('usage report --scope project --format text', ctx.projectRoot, ctx.env);
  assert(result.ok, `text report should succeed, got ${JSON.stringify(result.data)}`);
  assert(result.data.includes('Non-cached usage: 135 tokens'), `missing non-cached usage line: ${result.data}`);
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

test('runtime adapter: inferred Codex session under HOME sessions is used when exactly one candidate matches', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = codexSessionPath(ctx, 'rollout-good');
  appendJsonl(sourcePath, [
    codexSessionMeta(ctx.projectRoot),
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 25, `expected inferred total 25, got ${row.tokens.totalTokens}`);
  assert(row.source.kind === 'codex_jsonl', 'source kind');
  assert(row.source.discovery === 'inferred', 'source discovery should be inferred');
  assert(row.source.candidateCount === 1, 'exactly one inferred candidate should be recorded');
  assert(row.source.path === sourcePath, 'source path identifies the single inferred local counter source');
});

test('runtime adapter: inferred Codex session under project subdirectory matches project root', () => {
  const ctx = createUsageWorkspace();
  const subProjectRoot = path.join(ctx.projectRoot, 'alpha-2');
  fs.mkdirSync(subProjectRoot, { recursive: true });
  const sourcePath = codexSessionPath(ctx, 'rollout-subproject');
  appendJsonl(sourcePath, [
    codexSessionMeta(subProjectRoot),
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 25, `expected inferred total 25, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.path === sourcePath, 'source path should identify the subproject session');
});

test('runtime adapter: inferred Codex discovery parses complete long first JSONL line', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = codexSessionPath(ctx, 'rollout-long-first-line');
  appendJsonl(sourcePath, [
    { ...codexSessionMeta(ctx.projectRoot), padding: 'x'.repeat(30000) },
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 25, `expected inferred total 25, got ${row.tokens && row.tokens.totalTokens}`);
});

test('runtime adapter: usage finish reuses inferred source captured at start', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = codexSessionPath(ctx, 'rollout-mtime-drift');
  appendJsonl(sourcePath, [
    codexSessionMeta(ctx.projectRoot),
    codexTokenCount(
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 },
      { input_tokens: 30, cached_input_tokens: 3, output_tokens: 4, reasoning_output_tokens: 2, total_tokens: 39 }
    ),
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    codexTokenCount(
      { input_tokens: 45, cached_input_tokens: 5, output_tokens: 9, reasoning_output_tokens: 5, total_tokens: 64 },
      { input_tokens: 15, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }
    ),
  ]);
  const future = new Date(Date.now() + 60000);
  fs.utimesSync(sourcePath, future, future);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 25, `expected inferred total 25, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.discovery === 'inferred', `expected inferred source, got ${row.source && row.source.discovery}`);
  assert(row.source.path === sourcePath, 'finish should use the source captured at start');
});

test('runtime adapter: inferred Codex last_token_usage excludes rows before invocation start', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = codexSessionPath(ctx, 'rollout-last-window');
  appendJsonl(sourcePath, [
    codexSessionMeta(ctx.projectRoot),
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 0, total_tokens: 120 } } } },
  ]);
  const started = runInDirWithEnv('usage start --skill fixme-review-code --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 } } } },
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 15, `inferred source should count only after-start last usage, got ${row.tokens.totalTokens}`);
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

test('runtime adapter: inferred Claude transcript under HOME projects is used when exactly one candidate matches', () => {
  const ctx = createUsageWorkspace();
  const sourcePath = claudeTranscriptPath(ctx, 'session-main');
  appendJsonl(sourcePath, [claudeTranscriptMeta(ctx.projectRoot)]);
  const started = runInDirWithEnv('usage start --skill fixme-review-plan --runtime claude', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourcePath, [
    { type: 'assistant', cwd: ctx.projectRoot, message: { usage: { input_tokens: 3, cache_creation_input_tokens: 1, cache_read_input_tokens: 2, output_tokens: 4 } }, content: 'must be ignored' },
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 10, `expected inferred total 10, got ${row.tokens.totalTokens}`);
  assert(row.source.kind === 'claude_jsonl', 'source kind');
  assert(row.source.discovery === 'inferred', 'source discovery should be inferred');
  assert(row.source.candidateCount === 1, 'exactly one inferred candidate should be recorded');
  assert(!JSON.stringify(row).includes('must be ignored'), 'content-bearing fixture values must not be stored');
  assert(row.source.path === sourcePath, 'source path identifies the single inferred local counter source');
});

test('runtime adapter: finish-time inferred Claude source without start cursor is unmeasured', () => {
  const ctx = createUsageWorkspace();
  const started = runInDirWithEnv('usage start --skill fixme-review-plan --runtime claude', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);

  const sourcePath = claudeTranscriptPath(ctx, 'session-created-after-start');
  appendJsonl(sourcePath, [
    claudeTranscriptMeta(ctx.projectRoot),
    { type: 'assistant', cwd: ctx.projectRoot, message: { usage: { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000, output_tokens: 50 } } },
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should append an unmeasured row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', `expected unmeasured, got ${row.status}`);
  assert(row.tokens === null, 'unbounded finish-time inference must not record transcript-wide tokens');
  assert(row.warnings.some(w => w.code === 'COUNTERS_UNAVAILABLE'), 'bounded start cursor warning expected');
  assert(row.source.path === sourcePath, 'source path should still identify the inferred runtime source');
});

test('runtime adapter: Claude subagent transcript attribution is used for the active skill', () => {
  const ctx = createUsageWorkspace();
  const parentPath = claudeTranscriptPath(ctx, 'session-parent');
  const subagentPath = path.join(path.dirname(parentPath), 'subagents', 'fixme-review-code.jsonl');
  appendJsonl(parentPath, [claudeTranscriptMeta(ctx.projectRoot)]);
  appendJsonl(subagentPath, [claudeTranscriptMeta(ctx.projectRoot, { attributionSkill: 'fixme-review-code', attributionAgent: 'fixme-review-code' })]);
  const started = runInDirWithEnv('usage start --skill fixme-review-code --runtime claude', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(subagentPath, [
    { type: 'assistant', cwd: ctx.projectRoot, attributionSkill: 'fixme-review-code', message: { usage: { input_tokens: 6, cache_creation_input_tokens: 0, cache_read_input_tokens: 2, output_tokens: 5 } }, tool_result: 'must be ignored' },
  ]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish failed: ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 13, `expected subagent total 13, got ${row.tokens.totalTokens}`);
  assert(row.source.kind === 'claude_jsonl', 'source kind');
  assert(row.source.discovery === 'inferred', 'source discovery should be inferred');
  assert(row.source.attributionSkill === 'fixme-review-code', 'source attributionSkill should be sanitized and preserved');
  assert(row.source.path === subagentPath, 'source path identifies the attributed local subagent source');
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

test('runtime adapter: ambiguous inferred Codex sources use invocation id marker', () => {
  const ctx = createUsageWorkspace();
  const sourceOne = codexSessionPath(ctx, 'rollout-marked');
  const sourceTwo = codexSessionPath(ctx, 'rollout-unmarked');
  appendJsonl(sourceOne, [
    codexSessionMeta(ctx.projectRoot),
    codexTokenCount(
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 },
      { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 115 }
    ),
  ]);
  appendJsonl(sourceTwo, [codexSessionMeta(ctx.projectRoot)]);

  const started = runInDirWithEnv('usage start --skill fixme-rebase --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourceOne, [
    { type: 'response_item', payload: { type: 'function_call_output', output: `{"invocationId":"${started.data.invocationId}"}` } },
    codexTokenCount(
      { input_tokens: 130, cached_input_tokens: 25, output_tokens: 17, reasoning_output_tokens: 7, total_tokens: 147 },
      { input_tokens: 30, cached_input_tokens: 5, output_tokens: 7, reasoning_output_tokens: 2, total_tokens: 32 }
    ),
  ]);
  appendJsonl(sourceTwo, [
    codexTokenCount(
      { input_tokens: 999, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 999 },
      { input_tokens: 999, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 999 }
    ),
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should succeed, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 32, `expected marked source delta 32, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.path === sourceOne, 'source path should be the file containing the invocation id marker');
});

test('runtime adapter: ambiguous inferred Claude sources use invocation id marker', () => {
  const ctx = createUsageWorkspace();
  const sourceOne = claudeTranscriptPath(ctx, 'session-unmarked');
  const sourceTwo = claudeTranscriptPath(ctx, 'session-marked');
  appendJsonl(sourceOne, [claudeTranscriptMeta(ctx.projectRoot)]);
  appendJsonl(sourceTwo, [claudeTranscriptMeta(ctx.projectRoot)]);

  const started = runInDirWithEnv('usage start --skill fixme-rebase --runtime claude', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourceOne, [
    { type: 'assistant', cwd: ctx.projectRoot, message: { usage: { input_tokens: 999, output_tokens: 1 } }, content: 'must be ignored' },
  ]);
  appendJsonl(sourceTwo, [
    { type: 'assistant', cwd: ctx.projectRoot, content: `{"invocationId":"${started.data.invocationId}"}` },
    { type: 'assistant', cwd: ctx.projectRoot, message: { usage: { input_tokens: 15, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 } }, content: 'must be ignored' },
  ]);

  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should succeed, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'measured', `expected measured, got ${row.status}`);
  assert(row.tokens.totalTokens === 24, `expected marked source usage 24, got ${row.tokens && row.tokens.totalTokens}`);
  assert(row.source.path === sourceTwo, 'source path should be the transcript containing the invocation id marker');
  assert(!JSON.stringify(row).includes('must be ignored'), 'content-bearing fixture values must not be stored');
});

test('runtime adapter: ambiguous inferred runtime sources append unmeasured row without guessing', () => {
  const ctx = createUsageWorkspace();
  const sourceOne = codexSessionPath(ctx, 'rollout-one');
  const sourceTwo = codexSessionPath(ctx, 'rollout-two');
  appendJsonl(sourceOne, [codexSessionMeta(ctx.projectRoot)]);
  appendJsonl(sourceTwo, [codexSessionMeta(ctx.projectRoot)]);
  const started = runInDirWithEnv('usage start --skill fixme-write-plan --runtime codex', ctx.projectRoot, ctx.env);
  assert(started.ok, `start failed: ${JSON.stringify(started.data)}`);
  appendJsonl(sourceOne, [codexTokenCount({ input_tokens: 1, total_tokens: 1 }, { input_tokens: 1, total_tokens: 1 })]);
  appendJsonl(sourceTwo, [codexTokenCount({ input_tokens: 2, total_tokens: 2 }, { input_tokens: 2, total_tokens: 2 })]);
  const finished = runInDirWithEnv(`usage finish --invocation-id ${started.data.invocationId} --outcome complete`, ctx.projectRoot, ctx.env);
  assert(finished.ok, `finish should append unmeasured row, got ${JSON.stringify(finished.data)}`);
  const row = readJsonl(ctx.projectEvents)[0];
  assert(row.status === 'unmeasured', 'ambiguous runtime sources should be unmeasured');
  assert(row.tokens === null, 'unmeasured tokens null');
  assert(row.warnings.some(w => w.code === 'AMBIGUOUS_COUNTER_SOURCE'), 'AMBIGUOUS_COUNTER_SOURCE warning expected');
  assert(row.source.candidateCount === 2, 'candidate count should be recorded without source paths');
  assert(row.source.path === null, 'ambiguous source path should be null');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

cleanup();

process.exit(failed > 0 ? 1 : 0);
