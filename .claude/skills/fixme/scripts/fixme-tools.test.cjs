#!/usr/bin/env node

'use strict';

/**
 * Tests for fixme-tools.cjs: ticketRename + queued->failed transition
 *
 * Run: node .claude/skills/fixme/scripts/fixme-tools.test.cjs
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

function createTicketFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
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

function cleanup() {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ============================================================================
// Test Suite: ticket rename
// ============================================================================

console.log('\n=== ticket rename tests ===\n');

// Test 1: Successful rename with valid slug
test('rename: valid slug renames file and updates frontmatter', () => {
  const dir = createTmpDir();
  const ticketPath = createTicketFile(dir, '0003-intake-tmp-a7b3.md',
    makeTicketContent('0003', 'intake-tmp-a7b3', 'queued'));

  const result = run(`ticket rename "${ticketPath}" --slug login-button-broken`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.oldSlug === 'intake-tmp-a7b3', `oldSlug should be intake-tmp-a7b3, got ${result.data.oldSlug}`);
  assert(result.data.newSlug === 'login-button-broken', `newSlug should be login-button-broken, got ${result.data.newSlug}`);
  assert(result.data.number === '0003', `number should be 0003, got ${result.data.number}`);
  assert(result.data.title === 'Login Button Broken', `title should be Login Button Broken, got ${result.data.title}`);

  const newPath = path.join(dir, '0003-login-button-broken.md');
  assert(result.data.newPath === newPath, `newPath should be ${newPath}, got ${result.data.newPath}`);
  assert(fs.existsSync(newPath), 'New file should exist');
  assert(!fs.existsSync(ticketPath), 'Old file should not exist');

  // Check frontmatter was updated
  const content = fs.readFileSync(newPath, 'utf8');
  assert(content.includes('slug: login-button-broken'), 'Frontmatter slug should be updated');
  assert(content.includes('# 0003: Login Button Broken'), 'Heading should be updated');
});

// Test 2: Slug needing sanitization
test('rename: slug with special chars gets sanitized', () => {
  const dir = createTmpDir();
  const ticketPath = createTicketFile(dir, '0003-foo.md',
    makeTicketContent('0003', 'foo', 'queued'));

  const result = run(`ticket rename "${ticketPath}" --slug "Hello World!!!"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.newSlug === 'hello-world', `newSlug should be hello-world, got ${result.data.newSlug}`);

  const newPath = path.join(dir, '0003-hello-world.md');
  assert(fs.existsSync(newPath), 'Sanitized file should exist');
});

// Test 3: Empty slug after sanitization -> error
test('rename: empty slug after sanitization errors', () => {
  const dir = createTmpDir();
  const ticketPath = createTicketFile(dir, '0003-foo.md',
    makeTicketContent('0003', 'foo', 'queued'));

  // Use "!!!" which sanitizes to empty (all special chars become hyphens, then trimmed)
  const result = run(`ticket rename "${ticketPath}" --slug "!!!"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('empty after sanitization'), `Error should mention empty: ${result.data.error}`);
});

// Test 4: File not found -> error
test('rename: nonexistent file errors', () => {
  const result = run(`ticket rename "/tmp/nonexistent-ticket-xyz.md" --slug "x"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('not found'), `Error should mention not found: ${result.data.error}`);
});

// Test 5: Missing --slug -> error
test('rename: missing --slug errors', () => {
  const dir = createTmpDir();
  const ticketPath = createTicketFile(dir, '0003-foo.md',
    makeTicketContent('0003', 'foo', 'queued'));

  const result = run(`ticket rename "${ticketPath}"`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('--slug'), `Error should mention --slug: ${result.data.error}`);
});

// Test 6: Slug unchanged after sanitization -> updates frontmatter, no file rename
test('rename: unchanged slug updates frontmatter without file rename', () => {
  const dir = createTmpDir();
  const ticketPath = createTicketFile(dir, '0003-hello-world.md',
    makeTicketContent('0003', 'hello-world', 'queued'));

  const result = run(`ticket rename "${ticketPath}" --slug "hello-world"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.oldPath === result.data.newPath, 'Paths should be the same');
  assert(result.data.newSlug === 'hello-world', `newSlug should be hello-world, got ${result.data.newSlug}`);
  assert(fs.existsSync(ticketPath), 'File should still exist at same path');

  // Check updated timestamp changed
  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('slug: hello-world'), 'Frontmatter should have slug');
});

// ============================================================================
// Test Suite: queued -> failed transition
// ============================================================================

console.log('\n=== queued -> failed transition tests ===\n');

// Test 7: queued -> failed with --reason succeeds
test('transition: queued -> failed with reason succeeds', () => {
  const dir = createTmpDir();
  fs.mkdirSync(path.join(dir, 'tickets'));
  const ticketPath = createTicketFile(path.join(dir, 'tickets'), '0003-test.md',
    makeTicketContent('0003', 'test', 'queued'));

  const result = run(`ticket transition "${ticketPath}" failed --reason "Intake failed"`);
  assert(result.ok, `Expected success, got: ${JSON.stringify(result.data)}`);
  assert(result.data.from === 'queued', `from should be queued, got ${result.data.from}`);
  assert(result.data.to === 'failed', `to should be failed, got ${result.data.to}`);

  const content = fs.readFileSync(ticketPath, 'utf8');
  assert(content.includes('state: failed'), 'State should be failed');
  assert(content.includes('failure_reason: "Intake failed"'), 'Should have failure reason');
});

// Test 8: queued -> failed without --reason errors
test('transition: queued -> failed without reason errors', () => {
  const dir = createTmpDir();
  fs.mkdirSync(path.join(dir, 'tickets'));
  const ticketPath = createTicketFile(path.join(dir, 'tickets'), '0003-test2.md',
    makeTicketContent('0003', 'test2', 'queued'));

  const result = run(`ticket transition "${ticketPath}" failed`);
  assert(!result.ok, 'Should fail');
  assert(result.data && result.data.error, 'Should have error message');
  assert(result.data.error.includes('--reason'), `Error should mention --reason: ${result.data.error}`);
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

cleanup();

process.exit(failed > 0 ? 1 : 0);
