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
  assert(res.data.reasoning_effort === 'high', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'high', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(executor.data.reasoning_effort === 'high', `executor reasoning_effort: ${executor.data.reasoning_effort}`);
  assert(executor.data.profile === 'balanced', `executor profile: ${executor.data.profile}`);
  assert(executor.data.source === 'profile', `executor source: ${executor.data.source}`);

  const planner = runInDir('resolve-model fixme-write-plan', dir);
  assert(planner.ok, `exit: ${JSON.stringify(planner)}`);
  assert(planner.data.model === 'opus', `planner model: ${planner.data.model}`);
  assert(planner.data.reasoning_effort === 'high', `planner reasoning_effort: ${planner.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'xhigh', `reasoning_effort: ${res.data.reasoning_effort}`);
  assert(res.data.profile === 'quality', `profile: ${res.data.profile}`);
  assert(res.data.source === 'default', `source: ${res.data.source}`);
});

test('resolve-model: codex balanced maps planners to xhigh and executors to high', () => {
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
  assert(executor.data.reasoning_effort === 'high', `executor reasoning_effort: ${executor.data.reasoning_effort}`);

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
  assert(productSpecWriter.data.profile === 'budget', `product spec writer profile: ${productSpecWriter.data.profile}`);
  assert(productSpecWriter.data.source === 'profile', `product spec writer source: ${productSpecWriter.data.source}`);

  const technicalSpecWriter = runInDir('resolve-model fixme-write-technical-spec', dir);
  assert(technicalSpecWriter.ok, `exit: ${JSON.stringify(technicalSpecWriter)}`);
  assert(technicalSpecWriter.data.model === 'sonnet', `technical spec writer model: ${technicalSpecWriter.data.model}`);
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
  assert(res.data.reasoning_effort === 'high', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'high', `reasoning_effort: ${res.data.reasoning_effort}`);
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
  assert(res.data.reasoning_effort === 'high', `reasoning_effort: ${res.data.reasoning_effort}`);
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

  const result = run(`codex-agents install --agents-src "${agentsSrc}" --codex-dir "${codexDir}"`);
  assert(result.ok, `install should succeed, got: ${JSON.stringify(result)}`);
  assert(result.data.installed === 2, `installed count: ${result.data.installed}`);

  const config = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
  assert(config.includes('[agents.gsd-executor]'), 'existing GSD agent registration should be preserved');
  assert(config.includes('[agents.fixme-task]'), 'fixme-task should use [agents.fixme-task]');
  assert(config.includes('[agents.fixme-review-code]'), 'fixme-review-code should use [agents.fixme-review-code]');
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

// ============================================================================
// Skill contract tests
// ============================================================================

test('fixme-rebase skill: clean verified rebase pushes by default unless --no-push is set', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('argument-hint: "[base-branch] [--no-push]"'), 'argument hint should document --no-push');
  assert(skill.includes('Push is default when `--no-push` is absent and verification passed.'), 'auto-push default should be explicit');
  assert(skill.includes('If `--no-push` is present: do not push automatically. Present the exact push command and wait for confirmation.'), '--no-push should restore confirmation flow');
  assert(skill.includes('git push --force-with-lease origin <branch>'), 'force-with-lease command should remain documented');
  assert(!skill.includes('**Wait for explicit confirmation. Do not push.**'), 'old default confirmation gate should be removed');
});

test('fixme-rebase skill: same-or-worse merge fallback continues rebase without route prompt', () => {
  const skillPath = path.resolve(__dirname, '..', '..', 'fixme-rebase', 'SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');

  assert(skill.includes('Compare the rebase conflict set with the merge alternative before asking the user.'), 'skill should compare conflict sets before route prompt');
  assert(skill.includes('If the merge conflict set is identical to or more complex than the rebase conflict set, do not ask for a route choice. Continue with rebase conflict resolution.'), 'same-or-worse merge should auto-continue rebase');
  assert(skill.includes('Present route options only when merge is materially cleaner than rebase.'), 'route prompt should be limited to cleaner merge fallback');
  assert(!skill.includes('3. **Present options to user:**'), 'old unconditional route prompt should be removed');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

cleanup();

process.exit(failed > 0 ? 1 : 0);
