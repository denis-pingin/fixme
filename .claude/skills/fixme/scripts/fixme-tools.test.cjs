#!/usr/bin/env node

'use strict';

/**
 * Tests for fixme-tools.cjs: ticket-centric directory layout
 *
 * Run: node ~/.claude/skills/fixme/scripts/fixme-tools.test.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, 'fixme-tools.cjs');

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

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixme-test-'));
  tmpDirs.push(dir);
  return dir;
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
// Summary
// ============================================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

cleanup();

process.exit(failed > 0 ? 1 : 0);
