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
const { buildTransitionsFromPhases, findFixmeRoot } = require(TOOLS_PATH);

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
      default: {
        outerMaxCycles: 2,
        phases: [
          { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
          { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 } }
        ]
      },
      full: {
        outerMaxCycles: 2,
        phases: [
          { name: 'investigate', skills: ['fixme-investigate'] },
          { name: 'research', skills: ['fixme-research'] },
          { name: 'plan', skills: ['fixme-write-plan'], review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 } },
          { name: 'implement', skills: ['fixme-execute-plan'], review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 } },
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

test('pipeline flag: --pipeline stores pipeline name in ticket frontmatter', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name pipe-session`, base);
  assert(sessionResult.ok, `Session create failed: ${JSON.stringify(sessionResult.data)}`);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug pipeline-test`, base);
  assert(createResult.ok, `Ticket create failed: ${JSON.stringify(createResult.data)}`);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, base);
  assert(t1.ok, `Transition failed: ${JSON.stringify(t1.data)}`);
  assert(t1.data.from === 'queued', `from should be queued, got ${t1.data.from}`);
  assert(t1.data.to === 'plan', `to should be plan, got ${t1.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('pipeline: default'), 'pipeline should be stored in frontmatter');
});

test('pipeline flag: rejects invalid forward skip', () => {
  const base = createTmpDir();
  createPipelineConfig(base);
  const sessionResult = runInDir(`session create "${base}" --name skip-session`, base);
  const sessionDir = sessionResult.data.path;

  const createResult = runInDir(`ticket create "${sessionDir}" --slug skip-test`, base);
  const ticketPath = createResult.data.path;

  const t1 = runInDir(`ticket transition "${ticketPath}" investigate --pipeline full`, base);
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

  runInDir(`ticket transition "${ticketPath}" plan --pipeline default`, base);
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
  assert(config.workflows.default.phases.length === 1, 'workflows preserved');
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

test('config migrate creates config.json with unified standard workflows', () => {
  const tmp = createTmpDir();
  const result = runInDir('config migrate', tmp);
  assert(result.ok, `config migrate should succeed: ${JSON.stringify(result.data)}`);

  const configPath = path.join(tmp, '.fixme', 'config.json');
  assert(fs.existsSync(configPath), 'config.json should exist after migration');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(Array.isArray(config.workflows.default.phases), 'default workflow phases should exist');
  assert(Array.isArray(config.workflows['product-spec'].phases), 'product-spec workflow phases should exist');
  assert(Array.isArray(config.workflows['technical-spec'].phases), 'technical-spec workflow phases should exist');
  assert(Array.isArray(config.workflows['idea-to-production'].phases), 'idea-to-production workflow phases should exist');
  assert(config.workflows.default.outerMaxCycles === 2, 'default outerMaxCycles should be 2');
  assert(config.workflows['product-spec'].outerMaxCycles === 2, 'product-spec outerMaxCycles should be 2');
  assert(config.pipelines === undefined, 'new config must not write legacy pipelines');
  assert(config.workflowControls === undefined, 'new config must not write legacy workflowControls');
  assert(result.data.migrated === true, 'result should report migration');
});

test('config migrate seeds review softness defaults', () => {
  const tmp = createTmpDir();
  const result = runInDir('config migrate', tmp);
  assert(result.ok, `config migrate should succeed: ${JSON.stringify(result.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  const softness = config.review && config.review.softness;
  assert(softness && typeof softness === 'object', 'review.softness should be created');
  assert(softness.default === 'default', `global softness should default to label default, got ${softness.default}`);
  assert(softness.labels.strict === 0.0, 'strict label should resolve to 0.0');
  assert(softness.labels.default === 0.3, 'default label should resolve to 0.3');
  assert(softness.labels.lenient === 0.6, 'lenient label should resolve to 0.6');
  assert(softness.labels.tactical === 0.85, 'tactical label should resolve to 0.85');
  assert(softness.labels.panic === 1.0, 'panic label should resolve to 1.0');
  assert(softness.surfaces['spec-review'] === 'strict', 'spec-review should default to strict softness');
  assert(softness.surfaces['plan-review'] === 'lenient', 'plan-review should default to lenient softness');
  assert(softness.surfaces['code-review'] === 'lenient', 'code-review should default to lenient softness');
  assert(softness.surfaces['pr-comments'] === 'lenient', 'pr-comments should default to lenient softness');
});

test('config migrate converts legacy pipelines and controls into unified workflows', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    ticketBackend: 'fixme-tickets-md',
    unknownTopLevel: { keep: true },
    models: { profile: 'balanced' },
    pipelines: {
      default: [
        { name: 'custom-plan', skills: ['custom-plan-skill'] }
      ]
    },
    workflowControls: {
      default: { outerMaxCycles: 7 }
    }
  }, null, 2));

  const result = runInDir('config migrate', tmp);
  assert(result.ok, `config migrate should succeed: ${JSON.stringify(result.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(fixmeDir, 'config.json'), 'utf8'));
  assert(config.ticketBackend === 'fixme-tickets-md', 'ticketBackend should be preserved');
  assert(config.unknownTopLevel.keep === true, 'unknown top-level keys should be preserved');
  assert(config.models.profile === 'balanced', 'models profile should be preserved');
  assert(config.workflows.default.phases[0].name === 'custom-plan', 'custom default workflow should be preserved');
  assert(config.workflows.default.phases[0].skills[0] === 'custom-plan-skill', 'custom workflow skills should be preserved');
  assert(config.workflows.default.outerMaxCycles === 7, 'legacy workflow control should move into workflow');
  assert(Array.isArray(config.workflows.full.phases), 'missing full workflow should be backfilled');
  assert(Array.isArray(config.workflows['product-spec'].phases), 'missing product-spec workflow should be backfilled');
  assert(config.pipelines === undefined, 'legacy pipelines should be removed after migration');
  assert(config.workflowControls === undefined, 'legacy workflowControls should be removed after migration');
});

test('config workflow configure updates selected workflow and preserves unrelated config', () => {
  const tmp = createTmpDir();
  const fixmeDir = path.join(tmp, '.fixme');
  fs.mkdirSync(fixmeDir, { recursive: true });
  fs.writeFileSync(path.join(fixmeDir, 'config.json'), JSON.stringify({
    ticketBackend: 'fixme-tickets-md',
    models: { profile: 'budget' },
    workflows: {
      default: {
        outerMaxCycles: 2,
        phases: [
          { name: 'old', skills: ['old-skill'] }
        ],
        customWorkflowKey: 'keep'
      }
    }
  }, null, 2));

  const workflow = JSON.stringify({
    phases: [
      {
        name: 'plan',
        skills: ['fixme-write-plan'],
        review: {
          skills: ['fixme-review-plan', 'fixme-handle-plan-review'],
          maxCycles: 4
        }
      },
      {
        name: 'implement',
        skills: ['fixme-execute-plan'],
        review: {
          skills: ['fixme-review-code', 'fixme-handle-code-review'],
          maxCycles: 3
        }
      }
    ],
    outerMaxCycles: 5
  });

  const result = runInDir(`config workflow configure default --data '${workflow}'`, tmp);
  assert(result.ok, `workflow configure should succeed: ${JSON.stringify(result.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(fixmeDir, 'config.json'), 'utf8'));
  assert(config.ticketBackend === 'fixme-tickets-md', 'ticketBackend should be preserved');
  assert(config.models.profile === 'budget', 'models should be preserved');
  assert(config.workflows.default.phases.length === 2, 'default workflow phases should be replaced');
  assert(config.workflows.default.phases[0].review.maxCycles === 4, 'plan review cycles should be updated');
  assert(config.workflows.default.phases[1].review.maxCycles === 3, 'implementation review cycles should be updated');
  assert(config.workflows.default.outerMaxCycles === 5, 'outerMaxCycles should be updated');
  assert(config.workflows.default.customWorkflowKey === 'keep', 'unknown workflow keys should be preserved');
  assert(Array.isArray(config.workflows['product-spec'].phases), 'standard missing workflow should be backfilled');
  assert(config.pipelines === undefined, 'workflow configure must not write legacy pipelines');
  assert(config.workflowControls === undefined, 'workflow configure must not write legacy workflowControls');
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

  const result = runInDir(`config workflow configure default --data '${workflow}'`, tmp);
  assert(!result.ok, 'invalid review maxCycles should fail');
  assert(result.data && result.data.error, 'error should be returned');
  assert(result.data.error.includes('positive integer'), `error should explain cycle count: ${result.data.error}`);
});

test('config set validates and writes workflow outerMaxCycles', () => {
  const tmp = createTmpDir();
  const result = runInDir('config set workflows.default.outerMaxCycles 6', tmp);
  assert(result.ok, `config set should succeed: ${JSON.stringify(result.data)}`);

  const config = JSON.parse(fs.readFileSync(path.join(tmp, '.fixme', 'config.json'), 'utf8'));
  assert(config.workflows.default.outerMaxCycles === 6, 'outerMaxCycles should be written');
  assert(Array.isArray(config.workflows.default.phases), 'config set should migrate standard workflows');
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

test('config softness resolves phase, workflow, surface, and global values', () => {
  const tmp = createTmpDir();

  let result = runInDir('config set review.softness.default 0.45', tmp);
  assert(result.ok, `raw float global softness should be accepted: ${JSON.stringify(result.data)}`);

  result = runInDir('config softness resolve', tmp);
  assert(result.ok, `global softness should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.value === 0.45, `global softness value should be 0.45, got ${result.data.value}`);
  assert(result.data.source === 'global', `global source should be reported, got ${result.data.source}`);
  assert(result.data.configured === 0.45, 'raw float should be used directly');

  result = runInDir('config set review.softness.labels.lenient 0.5', tmp);
  assert(result.ok, `label mapping update should be accepted: ${JSON.stringify(result.data)}`);

  result = runInDir('config softness resolve --surface pr-comments', tmp);
  assert(result.ok, `surface softness should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.value === 0.5, `pr-comments lenient label should resolve to 0.5, got ${result.data.value}`);
  assert(result.data.source === 'surface', `surface source should be reported, got ${result.data.source}`);
  assert(result.data.configured === 'lenient', 'surface configured label should be reported');

  result = runInDir('config set review.softness.surfaces.plan-review 0.7', tmp);
  assert(result.ok, `surface raw float softness should be accepted: ${JSON.stringify(result.data)}`);

  result = runInDir('config softness resolve --surface plan-review', tmp);
  assert(result.ok, `surface raw softness should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.value === 0.7, `plan-review surface raw float should resolve to 0.7, got ${result.data.value}`);
  assert(result.data.source === 'surface', `surface source should be reported for raw float, got ${result.data.source}`);

  result = runInDir('config set review.softness.workflows.default.default "\\"strict\\""', tmp);
  assert(result.ok, `workflow default softness should be accepted: ${JSON.stringify(result.data)}`);

  result = runInDir('config softness resolve --workflow default --phase plan --surface plan-review', tmp);
  assert(result.ok, `workflow softness should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.value === 0.0, `strict workflow label should resolve to 0.0, got ${result.data.value}`);
  assert(result.data.source === 'workflow', `workflow source should be reported, got ${result.data.source}`);

  result = runInDir('config set review.softness.workflows.default.phases.implement 0.8', tmp);
  assert(result.ok, `phase softness should be accepted: ${JSON.stringify(result.data)}`);

  result = runInDir('config softness resolve --workflow default --phase implement --surface code-review', tmp);
  assert(result.ok, `phase softness should resolve: ${JSON.stringify(result.data)}`);
  assert(result.data.value === 0.8, `phase raw float should resolve to 0.8, got ${result.data.value}`);
  assert(result.data.source === 'phase', `phase source should be reported, got ${result.data.source}`);
  assert(result.data.configured === 0.8, 'phase configured float should be reported');
});

test('config softness rejects out-of-range floats and unknown labels', () => {
  const tmp = createTmpDir();

  let result = runInDir('config set review.softness.default 1.5', tmp);
  assert(!result.ok, 'out-of-range softness should fail');
  assert(result.data.error.includes('Softness must be a float in [0.0, 1.0]'), `range error should be clear: ${result.data.error}`);

  result = runInDir('config set review.softness.default "\\"aggressive\\""', tmp);
  assert(!result.ok, 'unknown softness label should fail');
  assert(result.data.error.includes('Unknown softness label: aggressive'), `unknown label error should be clear: ${result.data.error}`);

  result = runInDir('config set review.softness.labels.lenient -0.1', tmp);
  assert(!result.ok, 'out-of-range label mapping should fail');
  assert(result.data.error.includes('review.softness.labels.lenient'), `label mapping error should name key: ${result.data.error}`);

  result = runInDir('config set review.softness.labels.aggressive 0.4', tmp);
  assert(!result.ok, 'unsupported label mapping key should fail');
  assert(result.data.error.includes('Unsupported softness label: aggressive'), `unsupported label error should be clear: ${result.data.error}`);
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
  fs.mkdirSync(path.join(ticketsDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(ticketsDir, 'scripts', 'private.cjs'), 'console.log("do not install");\n');

  const result = run(`codex-skills install --skills-src "${skillsSrc}" --codex-dir "${codexDir}"`);
  assert(result.ok, `install should succeed, got: ${JSON.stringify(result)}`);
  assert(result.data.installed === 2, `installed count: ${result.data.installed}`);
  assert(result.data.removed === 1, `removed count: ${result.data.removed}`);

  const installedTask = fs.readFileSync(path.join(codexSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
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
  assert(installedTask.includes('--runtime codex'), 'Codex usage block should pass --runtime codex');
  assert(!installedTask.includes('--runtime auto'), 'Codex usage block should not pass --runtime auto');
  assert(!installedTask.includes('--task'), 'usage block must not pass --task');
  assert(installedTask.includes('Only run this block when `fixme-task` is the active skill invocation.'), 'usage block should have active-skill guard');
  assert(installedTask.includes('--role orchestrator'), 'fixme-task should be instrumented as orchestrator');

  const usageBlockCount = (installedTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(usageBlockCount === 1, `usage block should be idempotent, got ${usageBlockCount}`);

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
  assert(task.includes('--runtime claude'), 'Claude usage block should pass --runtime claude');
  assert(!task.includes('--runtime auto'), 'Claude usage block should not pass --runtime auto');
  assert(!task.includes('--task'), 'usage block must not pass --task');
  assert(task.includes('--role orchestrator'), 'fixme-task role mapping');
  assert(reviewer.includes('--role reviewer'), 'fixme-review-* role mapping');
  assert(handler.includes('--role handler'), 'fixme-handle-* role mapping');
  assert(reference.includes('--role reference'), 'fixme-howto-* role mapping');
  assert(reference.includes('Only run this block when `fixme-howto-code-map` is the active skill invocation.'), 'reference guard');
  assert(!fs.existsSync(path.join(claudeSkillsDir, 'fixme-tickets-md', 'scripts')), 'fixme-tickets-md scripts should not install');

  const reinstall = run(`claude-skills install --skills-src "${skillsSrc}" --claude-dir "${claudeDir}"`);
  assert(reinstall.ok, `reinstall should succeed, got: ${JSON.stringify(reinstall)}`);
  const reinstalledTask = fs.readFileSync(path.join(claudeSkillsDir, 'fixme-task', 'SKILL.md'), 'utf8');
  const blockCount = (reinstalledTask.match(/## Fixme Usage Tracking/g) || []).length;
  assert(blockCount === 1, `usage block should be idempotent, got ${blockCount}`);
});

// ============================================================================
// Skill contract tests
// ============================================================================

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
  assert(skill.includes('first row labeled `**Total**`'), 'overview By Skill table should include a total row');
  assert(skill.includes('`totalUsage.totalTokens` from the report JSON'), 'total row should use report totalUsage');
  assert(skill.includes('| Skill | Invocations | Measured | Unmeasured | Total usage |'), 'usage table should use Measured/Unmeasured labels');
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

test('fixme-task skill: Run Summary includes usage block backed by usage report', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-task', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert(skill.includes('### Usage'), 'Run Summary template should include Usage section');
  assert(skill.includes('usage report --scope project --pipeline-run-id <pipelineRunId> --format json'), 'Run Summary should call usage report for pipeline');
  assert(skill.includes('orchestrator overhead'), 'usage summary should mention orchestrator overhead');
  assert(skill.includes('child usage subtotal'), 'usage summary should mention child usage subtotal');
  assert(skill.includes('v1 does not include per-phase usage'), 'per-phase usage should remain out of scope');
});

test('fixme-rebase skill: clean verified rebase pushes by default unless --no-push is set', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('argument-hint: "[base-branch] [--no-push] [--confirm]"'), 'argument hint should document --no-push and --confirm');
  assert(skill.includes('Push is default when `--no-push` is absent and verification passed.'), 'auto-push default should be explicit');
  assert(skill.includes('If `--no-push` is present: do not push automatically. Present the exact push command and wait for confirmation.'), '--no-push should restore confirmation flow');
  assert(skill.includes('git push --force-with-lease origin <branch>'), 'force-with-lease command should remain documented');
  assert(!skill.includes('**Wait for explicit confirmation. Do not push.**'), 'old default confirmation gate should be removed');
});

test('fixme-rebase skill: --confirm is the only pre-execution confirmation gate', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Treat `--confirm` as a workflow flag, not a base branch.'), '--confirm should be parsed as a workflow flag');
  assert(skill.includes('Set `CONFIRM_BEFORE_EXECUTION=true` when `--confirm` is present.'), '--confirm should enable pre-execution confirmation');
  assert(skill.includes('Set `CONFIRM_BEFORE_EXECUTION=false` when `--confirm` is absent.'), 'default should not require pre-execution confirmation');
  assert(skill.includes('Remove `--confirm` from the remaining arguments before resolving the optional base branch.'), '--confirm should not be treated as a branch');
  assert(skill.includes('By default, Phase 2.5 is informational, not a confirmation gate.'), 'onto detection should not pause by default');
  assert(skill.includes('If `--confirm` is absent and detection result is DETECTED, set `REBASE_MODE` = "onto" and proceed to Phase 3 with the detected `FORK_POINT`.'), 'detected onto rebase should proceed by default');
  assert(skill.includes('When `--confirm` is present, this summary becomes the single pre-execution confirmation gate.'), '--confirm should add one pre-execution gate after analysis');
  assert(skill.includes('When `--confirm` is absent, proceed directly to Phase 4 after presenting the summary.'), 'default path should proceed after analysis summary');
  assert(!skill.includes('mandatory, non-negotiable user confirmation gate for any `--onto` recommendation'), 'old unconditional onto confirmation gate should be removed');
  assert(!skill.includes('The user always confirms before execution.'), 'old unconditional confirmation statement should be removed');
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
  assert(skill.includes('Use severity and complexity to choose review depth: BLOCKER or high-complexity PLAN_REQUIRED work gets full review; low-risk IMPLEMENT_ONLY repair gets focused re-review.'), 'review intensity should follow risk and complexity');
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

test('fixme importance rubric defines softness axes, floor, scoring, and aggregation', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-howto-importance', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('softness 0.0 is loudest and softness 1.0 is most permissive'), 'rubric should define softness direction');
  assert(skill.includes('harm_class: correctness | security | privacy | data-loss | migration | test-fakeness | stub-claimed-complete | locked-decision-violation | none'), 'rubric should define harm_class axis');
  assert(skill.includes('user_impact: user-visible | internal-shippable | internal-dev-only'), 'rubric should define user_impact axis');
  assert(skill.includes('fire_rate: hot-path | warm-path | rare-path | only-during-existing-failure'), 'rubric should define fire_rate axis');
  assert(skill.includes('reversibility: cheap-later | costly-later | irreversible-once-shipped'), 'rubric should define reversibility axis');
  assert(skill.includes('fix_risk: localized | cross-cutting | speculative-rewrite'), 'rubric should define fix_risk axis');
  assert(skill.includes('softness=1.0 suppresses every non-floor finding regardless of computed importance'), 'rubric should make panic floor-only');
  assert(skill.includes('Aggregate only findings that share severity, category, surface, and harm_class'), 'rubric should aggregate before suppression without mixing harm classes');
  assert(skill.includes('Softness applies to FIX and FIX_UNCLEAR only'), 'rubric should state softness-eligible classifications');
  assert(skill.includes('Every classified review item must include an `Importance` line'), 'rubric should require importance output on every classified item');
  assert(skill.includes('Importance: floor / softness <resolved_float> -> survives'), 'rubric should define floor importance output');
  assert(skill.includes('Importance: <score> / softness <resolved_float> -> survives'), 'rubric should define surviving scored importance output');
  assert(skill.includes('Importance: <score> / softness <resolved_float> -> suppressed'), 'rubric should define suppressed scored importance output');
  assert(skill.includes('Importance: not-eligible / softness <resolved_float> -> not-eligible'), 'rubric should define not-eligible importance output');
  assert(skill.includes('A finding is floor only when the issue itself would ship one of the explicit floor harms.'), 'rubric should keep floor narrow');
  assert(skill.includes('Do not assign a floor harm_class for project-rule violations, style cleanup, duplicated branches, doc/comment mismatch, ordinary maintainability, generic test hygiene, or raw JSON parsing by itself.'), 'rubric should forbid floor overclassification for common non-floor findings');
  assert(skill.includes('BLOCKER severity does not imply floor.'), 'rubric should not derive floor from severity');
  assert(skill.includes('`test-fakeness` is narrow: tests that copy production or business logic, assert a reimplementation instead of exercising production code, or pass without the production behavior being wired.'), 'rubric should keep test-fakeness narrow');
  assert(skill.includes('Use ASCII `->` exactly. Do not use Unicode arrows.'), 'rubric should require ASCII importance arrows');
});

test('fixme reviewers and handlers use shared importance rubric', () => {
  const reviewerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-review-spec', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-review-plan', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md'),
  ];
  const handlerPaths = [
    path.resolve(__dirname, '..', '..', 'fixme-handle-spec-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-plan-review', 'SKILL.md'),
    path.resolve(__dirname, '..', '..', 'fixme-handle-code-review', 'SKILL.md'),
  ];

  for (const skillPath of reviewerPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('fixme-howto-importance'), `${skillPath} should load the shared importance rubric`);
    assert(skill.includes('Importance axes'), `${skillPath} should require importance axes per finding`);
    assert(skill.includes('harm_class: correctness | security | privacy | data-loss | migration | test-fakeness | stub-claimed-complete | locked-decision-violation | none'), `${skillPath} should emit harm_class`);
    assert(skill.includes('user_impact: user-visible | internal-shippable | internal-dev-only'), `${skillPath} should emit user_impact`);
    assert(skill.includes('fire_rate: hot-path | warm-path | rare-path | only-during-existing-failure'), `${skillPath} should emit fire_rate`);
    assert(skill.includes('reversibility: cheap-later | costly-later | irreversible-once-shipped'), `${skillPath} should emit reversibility`);
    assert(skill.includes('fix_risk: localized | cross-cutting | speculative-rewrite'), `${skillPath} should emit fix_risk`);
  }

  for (const skillPath of handlerPaths) {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert(skill.includes('fixme-howto-importance'), `${skillPath} should load the shared importance rubric`);
    assert(skill.includes('Apply softness after classification and pattern aggregation, before deriving HANDLER_RESULT counts.'), `${skillPath} should apply softness before routing counts`);
    assert(skill.includes('node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs config softness resolve'), `${skillPath} should resolve softness through fixme-tools`);
    assert(skill.includes('SUPPRESSED_COUNT: <number>'), `${skillPath} should report suppressed count`);
    assert(skill.includes('Suppressed at softness='), `${skillPath} should include suppressed ledger wording`);
    assert(skill.includes('Softness applies to FIX and FIX_UNCLEAR only'), `${skillPath} should not suppress ASK_USER or REJECT items`);
    assert(skill.includes('Every classified finding must include one of these `Importance` outputs:'), `${skillPath} should require importance output on every classified finding`);
    assert(skill.includes('Importance: floor / softness <resolved_float> -> survives'), `${skillPath} should include floor importance output`);
    assert(skill.includes('Importance: <score> / softness <resolved_float> -> survives'), `${skillPath} should include surviving scored importance output`);
    assert(skill.includes('Importance: <score> / softness <resolved_float> -> suppressed'), `${skillPath} should include suppressed scored importance output`);
    assert(skill.includes('Importance: not-eligible / softness <resolved_float> -> not-eligible'), `${skillPath} should include not-eligible importance output`);
  }
});

test('fixme-pr-comments records importance axes and softness routing metadata', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-pr-comments', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('fixme-howto-importance'), 'PR comments skill should use shared importance rubric');
  assert(skill.includes('IMPORTANCE_AXES'), 'PR comments should require importance axes metadata');
  assert(skill.includes('IMPORTANCE: floor / softness <resolved_float> -> survives | <score> / softness <resolved_float> -> survives | <score> / softness <resolved_float> -> suppressed | not-eligible / softness <resolved_float> -> not-eligible'), 'PR comments should require importance output on every triaged item');
  assert(skill.includes('Suppressed by softness: {number suppressed, with group IDs or None}'), 'PR comments should report suppressed count with a human-facing label');
  assert(!skill.includes('SUPPRESSED_COUNT'), 'PR comments should not leak handler-style uppercase counters into user-facing reports');
  assert(skill.includes('FILE_OVERLAP_ONLY_DEFERRAL_CANDIDATE: true | false'), 'PR comments should explicitly mark file-overlap-only deferral candidates');
  assert(skill.includes('Softness-suppressed groups use FOLLOWUP_ONLY'), 'softness should route suppressed PR findings to follow-up');
  assert(skill.includes('file-overlap-only deferral candidates are never softness-suppressed'), 'softness should not bypass the file-overlap-only ban');
  assert(skill.includes('Do not write `IMPORTANCE: floor` for non-floor project-rule violations, cleanup, doc/comment mismatch, raw JSON.parse usage by itself, or generic test-hygiene findings.'), 'PR comments should not mark ordinary valid issues as floor');
  assert(skill.includes('For non-floor findings, compute and print the numeric score so softness can visibly decide survives vs suppressed.'), 'PR comments should show numeric scores for non-floor findings');
});

test('fixme-config documents review softness prompts and CLI writes', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-config', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Review softness'), 'fixme-config should present review softness settings');
  assert(skill.includes('Softness accepts either a label or a raw float in [0.0, 1.0].'), 'fixme-config should explain accepted softness values');
  assert(skill.includes('config set review.softness.default'), 'fixme-config should write global softness through fixme-tools');
  assert(skill.includes('config set review.softness.surfaces.<surface>'), 'fixme-config should write surface softness through fixme-tools');
  assert(skill.includes('config set review.softness.labels.<label>'), 'fixme-config should write label mapping through fixme-tools');
  assert(skill.includes('config set review.softness.workflows.<selectedWorkflow>.default'), 'fixme-config should write workflow softness through fixme-tools');
  assert(skill.includes('config set review.softness.workflows.<selectedWorkflow>.phases.<phase>'), 'fixme-config should write phase softness through fixme-tools');
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
  assert(skill.includes('Focused re-review mode reviews fixes since last review plus directly affected call sites.'), 'code review should support focused re-review after repair');
});

test('fixme execute/review skills: support repair mode and focused re-review', () => {
  const executePath = path.resolve(__dirname, '..', '..', 'fixme-execute-plan', 'SKILL.md');
  const reviewPath = path.resolve(__dirname, '..', '..', 'fixme-review-code', 'SKILL.md');
  const execute = fs.readFileSync(executePath, 'utf8');
  const review = fs.readFileSync(reviewPath, 'utf8');

  assert(execute.includes('Repair Mode'), 'executor should document repair mode');
  assert(execute.includes('Repair items come from implementation-only code review findings'), 'repair mode should be limited to implementation-only findings');
  assert(execute.includes('Do not redesign the plan in repair mode.'), 'executor should not replan implementation-only repairs');
  assert(review.includes('Focused Re-Review Mode'), 'code reviewer should document focused re-review mode');
  assert(review.includes('Focused re-review mode reviews fixes since last review plus directly affected call sites.'), 'focused review scope should be explicit');
  assert(review.includes('A focused re-review may still widen scope when the repair changes shared contracts or high-risk behavior.'), 'focused review should widen scope for risky changes');
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

test('usage report: text output uses required Total usage language', () => {
  const ctx = createUsageWorkspace();
  writeUsageEvents(ctx.projectEvents, [
    usageEvent({ invocationId: 'usage_complete', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir }),
    usageEvent({ eventId: 'event_unmeasured', invocationId: 'usage_unmeasured', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir, status: 'unmeasured', tokens: null, warnings: [{ code: 'COUNTERS_UNAVAILABLE', message: 'Counters unavailable.' }] }),
  ]);
  const result = runInDirWithEnv('usage report --scope project --format text', ctx.projectRoot, ctx.env);
  assert(result.ok, `text report should succeed, got ${JSON.stringify(result.data)}`);
  assert(typeof result.data === 'string', 'text format returns raw string data in tests');
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
});

test('usage report: text output uses duplicate-conflict not-included language', () => {
  const ctx = createUsageWorkspace();
  const complete = usageEvent({ eventId: 'event_text_complete', invocationId: 'usage_text_complete', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const conflict = usageEvent({ eventId: 'event_text_conflict', invocationId: 'usage_text_conflict', projectRoot: ctx.projectRoot, fixmeDir: ctx.fixmeDir });
  const conflictOther = { ...conflict, eventId: 'event_text_conflict_other', tokens: { ...conflict.tokens, totalTokens: 999 } };
  writeUsageEvents(ctx.projectEvents, [complete, conflict, conflictOther]);

  const result = runInDirWithEnv('usage report --scope project --format text', ctx.projectRoot, ctx.env);
  assert(result.ok, `text report should succeed, got ${JSON.stringify(result.data)}`);
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
