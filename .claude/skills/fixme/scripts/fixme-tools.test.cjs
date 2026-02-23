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
reporter_context:
commit_hash:
failure_reason:
related: []
max_attempts: 3
current_attempt: 0
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
// Test Suite: ticket dir
// ============================================================================

console.log('\n=== ticket dir tests ===\n');

test('dir: returns parent directory of ticket.md', () => {
  const sessionDir = createTmpDir();
  const ticketPath = createTicketFolder(sessionDir, '0001', 'my-bug', 'queued');

  const result = run(`ticket dir "${ticketPath}"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.dir === path.join(sessionDir, '0001-my-bug'), `dir should be ticket folder, got ${result.data.dir}`);
});

test('dir: nonexistent file errors', () => {
  const result = run(`ticket dir "/tmp/nonexistent/ticket.md"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
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
// Summary
// ============================================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

cleanup();

process.exit(failed > 0 ? 1 : 0);
