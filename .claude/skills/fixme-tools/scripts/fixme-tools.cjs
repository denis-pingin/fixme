#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// Model Profile Table
// ============================================================================

const MODEL_PROFILES = {
  quality: {
    'fixme-write-plan': 'opus',
    'fixme-write-product-spec': 'opus',
    'fixme-write-technical-spec': 'opus',
    'fixme-review-spec': 'opus',
    'fixme-review-plan': 'opus',
    'fixme-review-code': 'opus',
    'fixme-investigate': 'opus',
    'fixme-research': 'opus',
    'fixme-handle-spec-review': 'opus',
    'fixme-handle-plan-review': 'opus',
    'fixme-handle-code-review': 'opus',
    'fixme-execute-plan': 'opus',
    'fixme-task': 'opus',
    'fixme-browser-verify': 'opus',
  },
  balanced: {
    'fixme-write-plan': 'opus',
    'fixme-write-product-spec': 'opus',
    'fixme-write-technical-spec': 'opus',
    'fixme-review-spec': 'opus',
    'fixme-review-plan': 'opus',
    'fixme-review-code': 'opus',
    'fixme-investigate': 'opus',
    'fixme-research': 'opus',
    'fixme-handle-spec-review': 'opus',
    'fixme-handle-plan-review': 'opus',
    'fixme-handle-code-review': 'opus',
    'fixme-execute-plan': 'sonnet',
    'fixme-task': 'sonnet',
    'fixme-browser-verify': 'sonnet',
  },
  budget: {
    'fixme-write-plan': 'sonnet',
    'fixme-write-product-spec': 'sonnet',
    'fixme-write-technical-spec': 'sonnet',
    'fixme-review-spec': 'sonnet',
    'fixme-review-plan': 'sonnet',
    'fixme-review-code': 'sonnet',
    'fixme-investigate': 'sonnet',
    'fixme-research': 'sonnet',
    'fixme-handle-spec-review': 'sonnet',
    'fixme-handle-plan-review': 'sonnet',
    'fixme-handle-code-review': 'sonnet',
    'fixme-execute-plan': 'sonnet',
    'fixme-task': 'haiku',
    'fixme-browser-verify': 'haiku',
  },
};

const DEFAULT_MODEL = 'opus';
const DEFAULT_PROFILE = 'quality';

const STANDARD_PIPELINES = {
  default: [
    {
      name: 'plan',
      skills: ['fixme-write-plan'],
      review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 },
    },
    {
      name: 'implement',
      skills: ['fixme-execute-plan'],
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 },
    },
  ],
  full: [
    { name: 'investigate', skills: ['fixme-investigate'] },
    { name: 'research', skills: ['fixme-research'] },
    {
      name: 'plan',
      skills: ['fixme-write-plan'],
      review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 },
    },
    {
      name: 'implement',
      skills: ['fixme-execute-plan'],
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 },
    },
    { name: 'verify', skills: ['fixme-browser-verify'] },
  ],
  quick: [
    { name: 'plan', skills: ['fixme-write-plan'] },
    { name: 'implement', skills: ['fixme-execute-plan'] },
  ],
  'product-spec': [
    {
      name: 'product-spec',
      skills: ['fixme-write-product-spec'],
      review: { skills: ['fixme-review-spec', 'fixme-handle-spec-review'], maxCycles: 3 },
    },
  ],
  'technical-spec': [
    {
      name: 'technical-spec',
      skills: ['fixme-write-technical-spec'],
      review: { skills: ['fixme-review-spec', 'fixme-handle-spec-review'], maxCycles: 3 },
    },
  ],
  plan: [
    {
      name: 'plan',
      skills: ['fixme-write-plan'],
      review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 },
    },
  ],
  execute: [
    {
      name: 'implement',
      skills: ['fixme-execute-plan'],
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 },
    },
  ],
  'idea-to-production': [
    {
      name: 'product-spec',
      skills: ['fixme-write-product-spec'],
      review: { skills: ['fixme-review-spec', 'fixme-handle-spec-review'], maxCycles: 3 },
    },
    {
      name: 'technical-spec',
      skills: ['fixme-write-technical-spec'],
      review: { skills: ['fixme-review-spec', 'fixme-handle-spec-review'], maxCycles: 3 },
    },
    {
      name: 'plan',
      skills: ['fixme-write-plan'],
      review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 },
    },
    {
      name: 'implement',
      skills: ['fixme-execute-plan'],
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 2 },
    },
  ],
};

const STANDARD_OUTER_MAX_CYCLES = 2;
const STANDARD_PIPELINE_NAMES = Object.keys(STANDARD_PIPELINES);
const VALID_MODEL_PROFILES = new Set(['quality', 'balanced', 'budget', 'inherit']);
const VALID_MODEL_VALUES = new Set(['opus', 'sonnet', 'haiku', 'inherit']);
const VALID_TICKET_BACKENDS = new Set(['fixme-tickets-md', 'fixme-tickets-linear']);
const FIXME_CODEX_MARKER = '# Fixme Agent Configuration - managed by fixme installer';
const FIXME_CODEX_CLOSE_MARKER = '# /Fixme Agent Configuration';
const GSD_CODEX_MARKER_PREFIX = '# GSD Agent Configuration';
const FIXME_CODEX_SKILL_ADAPTER_OPEN = '<codex_skill_adapter>';
const FIXME_CODEX_SKILL_ADAPTER_CLOSE = '</codex_skill_adapter>';

const KNOWN_FIXME_SKILLS = new Set([
  'fixme-browser-verify',
  'fixme-execute-plan',
  'fixme-handle-code-review',
  'fixme-handle-plan-review',
  'fixme-handle-spec-review',
  'fixme-investigate',
  'fixme-research',
  'fixme-review-code',
  'fixme-review-plan',
  'fixme-review-spec',
  'fixme-write-plan',
  'fixme-write-product-spec',
  'fixme-write-technical-spec',
]);

/**
 * Resolve the model for a sub-agent based on config.
 * Resolution order:
 *   1. models.overrides[agent] (source = 'override')
 *   2. MODEL_PROFILES[models.profile][agent] (source = 'profile')
 *   3. Default: opus (source = 'default')
 * Profile is reported as-is from config even when the agent isn't in the table
 * (so the user's selection stays visible in the banner).
 */
function resolveModel(agentName, fixmeRoot) {
  const result = { agent: agentName, model: DEFAULT_MODEL, profile: DEFAULT_PROFILE, source: 'default' };

  const configPath = path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return result;
  }

  const models = (config && typeof config.models === 'object') ? config.models : null;
  if (!models) return result;

  const rawProfile = typeof models.profile === 'string' ? models.profile : null;
  const profileKnown = rawProfile && Object.prototype.hasOwnProperty.call(MODEL_PROFILES, rawProfile);
  result.profile = profileKnown ? rawProfile : DEFAULT_PROFILE;

  const overrides = (models.overrides && typeof models.overrides === 'object') ? models.overrides : {};
  if (Object.prototype.hasOwnProperty.call(overrides, agentName) && typeof overrides[agentName] === 'string') {
    result.model = overrides[agentName];
    result.source = 'override';
    if (rawProfile) result.profile = rawProfile;
    return result;
  }

  if (profileKnown) {
    const table = MODEL_PROFILES[rawProfile];
    if (Object.prototype.hasOwnProperty.call(table, agentName)) {
      result.model = table[agentName];
      result.source = 'profile';
      return result;
    }
    result.profile = rawProfile;
  }

  return result;
}

// ============================================================================
// YAML Frontmatter Parser/Serializer
// ============================================================================

/**
 * Extract frontmatter and body from a markdown file content string.
 * Returns { frontmatter: object, body: string, rawFields: string[] }
 * rawFields preserves field ordering for serialization.
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return { frontmatter: {}, body: content, rawFields: [] };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: {}, body: content, rawFields: [] };
  }

  const fmLines = lines.slice(1, endIndex);
  const body = lines.slice(endIndex + 1).join('\n');
  const { obj, fieldOrder } = parseYamlLines(fmLines);

  return { frontmatter: obj, body, rawFields: fieldOrder };
}

/**
 * Parse simple YAML lines into an object.
 * Handles: scalars, inline arrays, multiline arrays, nested objects (2 levels),
 * and arrays of objects (transitions).
 */
function parseYamlLines(lines) {
  const obj = {};
  const fieldOrder = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
    if (!topMatch) {
      i++;
      continue;
    }

    const key = topMatch[1];
    const valueStr = topMatch[2].trim();
    fieldOrder.push(key);

    // Inline value present
    if (valueStr !== '') {
      // Inline array: [a, b, c]
      if (valueStr.startsWith('[')) {
        obj[key] = parseInlineArray(valueStr);
        i++;
        continue;
      }
      // Inline object: { key: val, ... }
      if (valueStr.startsWith('{')) {
        obj[key] = parseInlineObject(valueStr);
        i++;
        continue;
      }
      // Scalar value
      obj[key] = parseScalar(valueStr);
      i++;
      continue;
    }

    // No inline value — check for nested content
    i++;
    const nested = collectNestedLines(lines, i);

    if (nested.lines.length === 0) {
      // Empty value (like `url:` with nothing after)
      obj[key] = null;
      continue;
    }

    // Check if nested lines are array items
    if (nested.lines[0].trimStart().startsWith('- ')) {
      obj[key] = parseNestedArray(nested.lines, nested.baseIndent);
      i = nested.nextIndex;
      continue;
    }

    // Otherwise it's a nested object
    obj[key] = parseNestedObject(nested.lines, nested.baseIndent);
    i = nested.nextIndex;
  }

  return { obj, fieldOrder };
}

/**
 * Collect lines that are indented (nested) under the current key.
 */
function collectNestedLines(lines, startIndex) {
  const result = [];
  let baseIndent = -1;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) break; // Back to top level

    if (baseIndent === -1) baseIndent = indent;
    if (indent < baseIndent) break;

    result.push(line);
    i++;
  }

  return { lines: result, baseIndent, nextIndex: i };
}

/**
 * Parse an inline array like [a, b, c] or ["a", "b"]
 */
function parseInlineArray(str) {
  const inner = str.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map(item => parseScalar(item.trim()));
}

/**
 * Parse nested array items (lines starting with -)
 * Handles simple arrays and arrays of objects (like transitions).
 */
function parseNestedArray(lines, baseIndent) {
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (!trimmed.startsWith('- ')) {
      i++;
      continue;
    }

    const itemContent = trimmed.slice(2).trim();

    // Inline object: - { from: x, to: y, ... }
    if (itemContent.startsWith('{')) {
      result.push(parseInlineObject(itemContent));
      i++;
      continue;
    }

    // Check if next lines are indented (nested object in array)
    const itemIndent = line.match(/^(\s*)/)[1].length;
    let j = i + 1;
    const subLines = [];

    // If the item line itself has a key: value
    if (itemContent.includes(':')) {
      // This is the first field of a nested object
      subLines.push('  '.repeat(baseIndent) + '  ' + itemContent);
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trimStart();
        const nextIndent = nextLine.match(/^(\s*)/)[1].length;

        if (nextTrimmed.startsWith('- ') && nextIndent <= itemIndent) break;
        if (nextIndent <= itemIndent && nextTrimmed !== '') break;

        subLines.push(nextLine);
        j++;
      }

      if (subLines.length > 0) {
        const nestedObj = {};
        // Parse first field from itemContent
        const firstField = itemContent.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
        if (firstField) {
          nestedObj[firstField[1]] = parseScalar(firstField[2].trim());
        }
        // Parse remaining fields
        for (const sl of subLines.slice(1)) {
          const fieldMatch = sl.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
          if (fieldMatch) {
            nestedObj[fieldMatch[1]] = parseScalar(fieldMatch[2].trim());
          }
        }
        result.push(nestedObj);
        i = j;
        continue;
      }
    }

    // Simple scalar array item
    result.push(parseScalar(itemContent));
    i++;
  }

  return result;
}

/**
 * Parse a nested object (indented key: value lines).
 * Supports 2-level nesting for durations: { queued: { entered: ..., exited: ..., seconds: ... } }
 */
function parseNestedObject(lines, baseIndent) {
  const obj = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const indent = line.match(/^(\s*)/)[1].length;
    if (indent < baseIndent) break;

    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
    if (!match) {
      i++;
      continue;
    }

    const key = match[1];
    const valueStr = match[2].trim();

    if (valueStr !== '') {
      // Inline object: { entered: ..., exited: ..., seconds: ... }
      if (valueStr.startsWith('{')) {
        obj[key] = parseInlineObject(valueStr);
        i++;
        continue;
      }
      if (valueStr.startsWith('[')) {
        obj[key] = parseInlineArray(valueStr);
        i++;
        continue;
      }
      obj[key] = parseScalar(valueStr);
      i++;
      continue;
    }

    // Check for deeper nesting
    i++;
    const deeper = collectNestedLines(lines.slice(i).map((l, idx) => {
      // Re-index relative to current position
      return l;
    }), 0);

    // Actually, let's just look ahead manually
    const subLines = [];
    let j = i;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === '') { j++; continue; }
      const nextIndent = nextLine.match(/^(\s*)/)[1].length;
      if (nextIndent <= indent) break;
      subLines.push(nextLine);
      j++;
    }

    if (subLines.length > 0 && subLines[0].trimStart().startsWith('- ')) {
      obj[key] = parseNestedArray(subLines, indent + 2);
    } else if (subLines.length > 0) {
      // Sub-object
      const subObj = {};
      for (const sl of subLines) {
        const subMatch = sl.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
        if (subMatch) {
          subObj[subMatch[1]] = parseScalar(subMatch[2].trim());
        }
      }
      obj[key] = subObj;
    } else {
      obj[key] = null;
    }

    i = j;
  }

  return obj;
}

/**
 * Parse an inline object like { from: queued, to: investigating, timestamp: "2026-...", reason: null }
 */
function parseInlineObject(str) {
  const inner = str.slice(1, -1).trim();
  if (inner === '') return {};
  const obj = {};

  // Split by comma, respecting quoted strings
  const parts = splitRespectingQuotes(inner, ',');
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.slice(0, colonIdx).trim();
    const val = part.slice(colonIdx + 1).trim();
    obj[key] = parseScalar(val);
  }

  return obj;
}

/**
 * Split a string by delimiter, respecting quoted substrings.
 */
function splitRespectingQuotes(str, delimiter) {
  const parts = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === delimiter) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

/**
 * Parse a scalar YAML value.
 */
function parseScalar(str) {
  if (str === '' || str === '~' || str === 'null') return null;
  if (str === 'true') return true;
  if (str === 'false') return false;

  // Quoted string
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  // Number (but NOT zero-padded like "0001" — those stay as strings)
  if (/^-?[1-9]\d*$/.test(str) || str === '0') return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);

  return str;
}

// ============================================================================
// YAML Serializer
// ============================================================================

/**
 * Serialize frontmatter object back to YAML string.
 * Preserves field ordering from rawFields, appends new fields.
 */
function serializeFrontmatter(obj, rawFields) {
  const lines = [];
  const written = new Set();

  // Write fields in original order
  for (const key of rawFields) {
    if (key in obj) {
      writeField(lines, key, obj[key], 0);
      written.add(key);
    }
  }

  // Write new fields
  for (const key of Object.keys(obj)) {
    if (!written.has(key)) {
      writeField(lines, key, obj[key], 0);
    }
  }

  return lines.join('\n');
}

function writeField(lines, key, value, indent) {
  const prefix = '  '.repeat(indent);

  if (value === null || value === undefined) {
    lines.push(`${prefix}${key}:`);
    return;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    lines.push(`${prefix}${key}: ${value}`);
    return;
  }

  if (typeof value === 'string') {
    if (needsQuoting(value)) {
      lines.push(`${prefix}${key}: "${escapeYamlString(value)}"`);
    } else {
      lines.push(`${prefix}${key}: ${value}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${prefix}${key}: []`);
      return;
    }

    // Check if array of objects (transitions)
    if (typeof value[0] === 'object' && value[0] !== null) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        lines.push(`${prefix}  - ${serializeInlineObject(item)}`);
      }
      return;
    }

    // Simple array
    lines.push(`${prefix}${key}: [${value.map(v => serializeScalar(v)).join(', ')}]`);
    return;
  }

  if (typeof value === 'object') {
    lines.push(`${prefix}${key}:`);
    for (const subKey of Object.keys(value)) {
      const subVal = value[subKey];
      if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal)) {
        // Nested object (e.g., durations.queued: { entered, exited, seconds })
        lines.push(`${prefix}  ${subKey}: ${serializeInlineObject(subVal)}`);
      } else {
        writeField(lines, subKey, subVal, indent + 1);
      }
    }
  }
}

function serializeInlineObject(obj) {
  const parts = [];
  for (const [key, val] of Object.entries(obj)) {
    parts.push(`${key}: ${serializeScalar(val)}`);
  }
  return `{ ${parts.join(', ')} }`;
}

function serializeScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (needsQuoting(value)) return `"${escapeYamlString(value)}"`;
    return value;
  }
  return String(value);
}

function needsQuoting(str) {
  // Quote if contains special chars, starts with special, or looks like a number/bool/null
  if (/[:{}\[\],&*?|>!%@`#]/.test(str)) return true;
  if (/^(true|false|null|~|\d)/.test(str)) return true;
  if (str.includes(' ') && !str.startsWith('"')) return true;
  return false;
}

function escapeYamlString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Reconstruct full file content with updated frontmatter.
 */
function buildContent(frontmatter, body, rawFields) {
  const yamlStr = serializeFrontmatter(frontmatter, rawFields);
  // Ensure body starts with newline for clean separation from closing ---
  const separator = body.startsWith('\n') ? '' : '\n';
  return `---\n${yamlStr}\n---${separator}${body}`;
}

/**
 * Extract a human-readable title from a ticket's markdown body.
 * Tries the first heading (# NNNN: Title), falls back to slug-to-title conversion.
 */
function extractTitle(body, slug) {
  const headingMatch = body.match(/^#\s+\d+:\s+(.+)/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ============================================================================
// Transition Matrix
// ============================================================================

const TRANSITIONS = {
  'queued':         ['investigating', 'skipped', 'failed'],
  'investigating':  ['researching', 'skipped', 'failed'],
  'researching':    ['planning', 'failed'],
  'planning':       ['implementing', 'failed'],
  'implementing':   ['verifying', 'failed'],
  'verifying':      ['done', 'planning', 'failed'],
  'done':           [],
  'failed':         [],
  'skipped':        [],
};

/**
 * Build a transition map from an ordered list of pipeline phase names.
 *
 * Rules:
 * - queued -> first phase, skipped, failed
 * - phase[i] -> phase[i+1] (forward one step), any phase[j] where j < i (backward), failed
 * - phase[last] -> done, any earlier phase (backward), failed
 * - Terminal states (done, failed, skipped) -> nothing
 */
function buildTransitionsFromPhases(phases) {
  const t = {
    'queued': [phases[0], 'skipped', 'failed'],
    'done': [],
    'failed': [],
    'skipped': [],
  };

  for (let i = 0; i < phases.length; i++) {
    const valid = [];
    // Forward: next phase (or done if last)
    if (i < phases.length - 1) {
      valid.push(phases[i + 1]);
    } else {
      valid.push('done');
    }
    // Backward: any earlier phase
    for (let j = 0; j < i; j++) {
      valid.push(phases[j]);
    }
    // Terminal
    valid.push('failed');
    t[phases[i]] = valid;
  }
  return t;
}

// ============================================================================
// Fixme Root Resolution
// ============================================================================

/**
 * Find the project root that contains the .fixme/ directory.
 *
 * Resolution order:
 * 1. If startDir has .fixme/ -> return startDir (local takes priority)
 * 2. Walk up ancestors looking for a parent with .fixme/:
 *    a. If parent .fixme/config.json has sub_repos and startDir matches -> return parent
 *    b. If startDir (or any dir between startDir and parent) has .git -> return parent
 * 3. Never go above $HOME or filesystem root
 * 4. Fallback: return startDir
 */
function findFixmeRoot(startDir) {
  const resolved = path.resolve(startDir);
  const root = path.parse(resolved).root;
  const homedir = require('os').homedir();

  // If startDir already contains .fixme/, it IS the project root.
  const ownFixme = path.join(resolved, '.fixme');
  if (fs.existsSync(ownFixme) && fs.statSync(ownFixme).isDirectory()) {
    return startDir;
  }

  // Check if startDir or any ancestor up to candidateParent contains .git
  function isInsideGitRepo(candidateParent) {
    let d = resolved;
    while (d !== root) {
      if (fs.existsSync(path.join(d, '.git'))) return true;
      if (d === candidateParent) break;
      d = path.dirname(d);
    }
    return false;
  }

  let dir = resolved;
  while (dir !== root) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    if (parent === homedir) break;

    const parentFixme = path.join(parent, '.fixme');
    if (fs.existsSync(parentFixme) && fs.statSync(parentFixme).isDirectory()) {
      // Check config.json for sub_repos
      const configPath = path.join(parentFixme, 'config.json');
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const subRepos = config.sub_repos || [];

        if (Array.isArray(subRepos) && subRepos.length > 0) {
          const relPath = path.relative(parent, resolved);
          const topSegment = relPath.split(path.sep)[0];
          if (subRepos.includes(topSegment)) {
            return parent;
          }
        }
      } catch {
        // config.json missing or malformed - fall back to .git heuristic
      }

      // Heuristic: parent has .fixme/ and startDir is inside a git repo
      if (isInsideGitRepo(parent)) {
        return parent;
      }
    }
    dir = parent;
  }
  return startDir;
}

/**
 * Load pipeline phase names from config.
 * Returns array of phase name strings, or null if pipeline not found.
 */
function loadPipelinePhases(pipelineName, fixmeRoot) {
  const configPath = path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
  if (!fs.existsSync(configPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const workflow = getWorkflowDefinition(config, pipelineName);
    if (!workflow || !Array.isArray(workflow.phases)) return null;
    // Filter out disabled phases (enabled defaults to true)
    return workflow.phases
      .filter(phase => phase.enabled !== false)
      .map(phase => phase.name)
      .filter(Boolean);
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Config Helpers
// ============================================================================

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function configPathForRoot(fixmeRoot) {
  return path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
}

function makeStandardWorkflow(name) {
  return {
    outerMaxCycles: STANDARD_OUTER_MAX_CYCLES,
    phases: cloneJson(STANDARD_PIPELINES[name]),
  };
}

function getLegacyOuterMaxCycles(config, workflowName) {
  if (!isPlainObject(config.workflowControls)) return null;
  const controls = config.workflowControls[workflowName];
  if (!isPlainObject(controls)) return null;
  return isPositiveInteger(controls.outerMaxCycles) ? controls.outerMaxCycles : null;
}

function hasWorkflowPhases(workflow) {
  return isPlainObject(workflow) && Array.isArray(workflow.phases);
}

function getWorkflowDefinition(config, workflowName) {
  if (isPlainObject(config.workflows) && hasWorkflowPhases(config.workflows[workflowName])) {
    return config.workflows[workflowName];
  }

  // Legacy read support: old configs stored phases under pipelines.<name>
  // and workflow-level controls under workflowControls.<name>.
  if (isPlainObject(config.pipelines) && Array.isArray(config.pipelines[workflowName])) {
    return {
      outerMaxCycles: getLegacyOuterMaxCycles(config, workflowName) || STANDARD_OUTER_MAX_CYCLES,
      phases: config.pipelines[workflowName],
    };
  }

  return null;
}

function readConfigForWrite(fixmeRoot) {
  const configPath = configPathForRoot(fixmeRoot);
  const fixmeDir = path.dirname(configPath);
  const existed = fs.existsSync(configPath);

  if (!fs.existsSync(fixmeDir)) {
    fs.mkdirSync(fixmeDir, { recursive: true });
  }

  if (!existed) {
    return { config: {}, configPath, existed };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid config.json: ${e.message}`);
  }

  if (!isPlainObject(config)) {
    throw new Error('Invalid config.json: top-level value must be an object');
  }

  return { config, configPath, existed };
}

function readConfigForGet(fixmeRoot) {
  const configPath = configPathForRoot(fixmeRoot);
  if (!fs.existsSync(configPath)) {
    throw new Error("No config.json found. Run '/fixme-config' or `config migrate` first.");
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(`Invalid config.json: ${e.message}`);
  }

  if (!isPlainObject(config)) {
    throw new Error('Invalid config.json: top-level value must be an object');
  }

  return { config, configPath };
}

function writeConfigAtomic(configPath, config) {
  const tmpPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(tmpPath, configPath);
}

function applyConfigMigration(config) {
  const result = {
    migrated: false,
    addedWorkflows: [],
    migratedLegacyWorkflows: [],
    removedLegacyKeys: [],
  };

  if (!isPlainObject(config.workflows)) {
    config.workflows = {};
    result.migrated = true;
  }

  if (isPlainObject(config.pipelines)) {
    for (const [name, phases] of Object.entries(config.pipelines)) {
      if (!Array.isArray(phases) || hasWorkflowPhases(config.workflows[name])) continue;
      config.workflows[name] = {
        outerMaxCycles: getLegacyOuterMaxCycles(config, name) || STANDARD_OUTER_MAX_CYCLES,
        phases: cloneJson(phases),
      };
      result.migrated = true;
      result.migratedLegacyWorkflows.push(name);
    }
  }

  if (isPlainObject(config.workflowControls)) {
    for (const [name, controls] of Object.entries(config.workflowControls)) {
      if (!hasWorkflowPhases(config.workflows[name])) continue;
      if (isPositiveInteger(config.workflows[name].outerMaxCycles)) continue;
      if (isPlainObject(controls) && isPositiveInteger(controls.outerMaxCycles)) {
        config.workflows[name].outerMaxCycles = controls.outerMaxCycles;
        result.migrated = true;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(config, 'pipelines')) {
    delete config.pipelines;
    result.migrated = true;
    result.removedLegacyKeys.push('pipelines');
  }

  if (Object.prototype.hasOwnProperty.call(config, 'workflowControls')) {
    delete config.workflowControls;
    result.migrated = true;
    result.removedLegacyKeys.push('workflowControls');
  }

  for (const name of STANDARD_PIPELINE_NAMES) {
    if (!hasWorkflowPhases(config.workflows[name])) {
      config.workflows[name] = makeStandardWorkflow(name);
      result.migrated = true;
      result.addedWorkflows.push(name);
    }
  }

  for (const [name, workflow] of Object.entries(config.workflows)) {
    if (!hasWorkflowPhases(workflow)) continue;
    if (!isPositiveInteger(workflow.outerMaxCycles)) {
      workflow.outerMaxCycles = STANDARD_OUTER_MAX_CYCLES;
      result.migrated = true;
    }
  }

  return result;
}

function splitConfigKey(keyPath) {
  if (!keyPath || typeof keyPath !== 'string') {
    throw new Error('Config key path is required');
  }

  const parts = keyPath.split('.');
  for (const part of parts) {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) {
      throw new Error(`Invalid config key segment: '${part}'`);
    }
    if (part === '__proto__' || part === 'prototype' || part === 'constructor') {
      throw new Error(`Invalid config key segment: '${part}'`);
    }
  }
  return parts;
}

function isWorkflowName(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

function isSupportedConfigKey(parts) {
  const [top, second, third] = parts;

  if (top === 'ticketBackend') return parts.length === 1;
  if (top === 'sub_repos') return parts.length === 1;
  if (top === 'project') return parts.length >= 1;

  if (top === 'models') {
    if (second === 'profile') return parts.length === 2;
    if (second === 'overrides' && parts.length === 3) return true;
    return false;
  }

  if (top === 'workflows') {
    if (!isWorkflowName(second)) return false;
    if (parts.length === 2) return true;
    if (parts.length === 3) return ['phases', 'outerMaxCycles'].includes(third);
    return false;
  }

  if (top === 'linear') {
    return ['teamId', 'teamName', 'defaultLabels', 'defaultProject'].includes(second) && parts.length === 2;
  }

  if (top === 'ticketTemplate') {
    return parts.length >= 2;
  }

  return false;
}

function parseConfigValue(rawValue) {
  if (rawValue === undefined) {
    throw new Error('Config value is required');
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

function validateStringArray(value, fieldName, allowEmpty = false) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new Error(`${fieldName} must contain at least one skill`);
  }
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${fieldName} must be an array of non-empty strings`);
    }
  }
}

function collectUnknownSkillWarnings(skills, warnings, fieldName) {
  for (const skill of skills) {
    if (!KNOWN_FIXME_SKILLS.has(skill)) {
      warnings.push(`Unknown skill '${skill}' in ${fieldName}; saved because custom skills are allowed`);
    }
  }
}

function defaultReviewCyclesForPhase(phaseName) {
  if (phaseName === 'implement') return 2;
  return 3;
}

function validatePipeline(pipeline, workflowName) {
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    throw new Error(`workflows.${workflowName}.phases must be a non-empty array of phase objects`);
  }

  const seenPhaseNames = new Set();
  const warnings = [];
  const normalized = pipeline.map((phase, index) => {
    const fieldPrefix = `workflows.${workflowName}.phases[${index}]`;
    if (!isPlainObject(phase)) {
      throw new Error(`${fieldPrefix} must be an object`);
    }
    if (typeof phase.name !== 'string' || phase.name.trim() === '') {
      throw new Error(`${fieldPrefix}.name must be a non-empty string`);
    }
    if (seenPhaseNames.has(phase.name)) {
      throw new Error(`pipelines.${workflowName} has duplicate phase name '${phase.name}'`);
    }
    seenPhaseNames.add(phase.name);

    if (phase.enabled !== undefined && typeof phase.enabled !== 'boolean') {
      throw new Error(`${fieldPrefix}.enabled must be a boolean when present`);
    }

    validateStringArray(phase.skills, `${fieldPrefix}.skills`);
    collectUnknownSkillWarnings(phase.skills, warnings, `${fieldPrefix}.skills`);

    const normalizedPhase = cloneJson(phase);
    if (normalizedPhase.review !== undefined) {
      if (!isPlainObject(normalizedPhase.review)) {
        throw new Error(`${fieldPrefix}.review must be an object when present`);
      }
      if (normalizedPhase.review.enabled !== undefined && typeof normalizedPhase.review.enabled !== 'boolean') {
        throw new Error(`${fieldPrefix}.review.enabled must be a boolean when present`);
      }
      if (normalizedPhase.review.skills !== undefined) {
        validateStringArray(normalizedPhase.review.skills, `${fieldPrefix}.review.skills`);
        collectUnknownSkillWarnings(normalizedPhase.review.skills, warnings, `${fieldPrefix}.review.skills`);
      } else if (normalizedPhase.review.enabled !== false) {
        throw new Error(`${fieldPrefix}.review.skills must be an array of strings`);
      }
      if (normalizedPhase.review.maxCycles === undefined) {
        normalizedPhase.review.maxCycles = defaultReviewCyclesForPhase(phase.name);
      }
      if (!isPositiveInteger(normalizedPhase.review.maxCycles)) {
        throw new Error(`${fieldPrefix}.review.maxCycles must be a positive integer`);
      }
    }

    return normalizedPhase;
  });

  return { pipeline: normalized, warnings };
}

function validateWorkflow(workflow, workflowName) {
  if (!isPlainObject(workflow)) {
    throw new Error(`workflows.${workflowName} must be an object`);
  }

  const validation = validatePipeline(workflow.phases, workflowName);
  const normalized = cloneJson(workflow);
  normalized.phases = validation.pipeline;
  if (normalized.outerMaxCycles === undefined) {
    normalized.outerMaxCycles = STANDARD_OUTER_MAX_CYCLES;
  }
  if (!isPositiveInteger(normalized.outerMaxCycles)) {
    throw new Error(`workflows.${workflowName}.outerMaxCycles must be a positive integer`);
  }

  return { workflow: normalized, warnings: validation.warnings };
}

function validateConfigSetValue(parts, value) {
  const [top, second, third] = parts;

  if (top === 'ticketBackend') {
    if (typeof value !== 'string' || !VALID_TICKET_BACKENDS.has(value)) {
      throw new Error("ticketBackend must be one of: fixme-tickets-md, fixme-tickets-linear");
    }
  }

  if (top === 'sub_repos') {
    validateStringArray(value, 'sub_repos', true);
  }

  if (top === 'models' && second === 'profile') {
    if (!VALID_MODEL_PROFILES.has(value)) {
      throw new Error("models.profile must be one of: quality, balanced, budget, inherit");
    }
  }

  if (top === 'models' && second === 'overrides') {
    if (typeof value !== 'string' || !VALID_MODEL_VALUES.has(value)) {
      throw new Error(`models.overrides.${third} must be one of: opus, sonnet, haiku, inherit`);
    }
  }

  if (top === 'workflows') {
    if (parts.length === 2) {
      return validateWorkflow(value, second);
    }
    if (third === 'phases') {
      return validatePipeline(value, second);
    }
    if (third === 'outerMaxCycles' && !isPositiveInteger(value)) {
      throw new Error(`workflows.${second}.outerMaxCycles must be a positive integer`);
    }
  }

  if (top === 'linear') {
    if (second === 'defaultLabels') {
      validateStringArray(value, 'linear.defaultLabels', true);
    } else if (value !== null && typeof value !== 'string') {
      throw new Error(`linear.${second} must be a string or null`);
    }
  }

  if (top === 'ticketTemplate' && parts.length === 2 && second === 'default' && typeof value !== 'string') {
    throw new Error('ticketTemplate.default must be a string');
  }

  return { warnings: [] };
}

function deepGet(value, parts) {
  let current = value;
  for (const part of parts) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function deepSet(target, parts, value) {
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function configMigrate(fixmeRoot) {
  const { config, configPath, existed } = readConfigForWrite(fixmeRoot);
  const migration = applyConfigMigration(config);
  if (migration.migrated || !existed) {
    writeConfigAtomic(configPath, config);
  }
  return output({
    path: configPath,
    created: !existed,
    migrated: migration.migrated || !existed,
    addedWorkflows: migration.addedWorkflows,
    migratedLegacyWorkflows: migration.migratedLegacyWorkflows,
    removedLegacyKeys: migration.removedLegacyKeys,
  });
}

function configGet(keyPath, fixmeRoot) {
  const { config, configPath } = readConfigForGet(fixmeRoot);
  if (!keyPath) {
    return output({ path: configPath, config });
  }

  const parts = splitConfigKey(keyPath);
  if (!isSupportedConfigKey(parts)) {
    throw new Error(`Unsupported config key: ${keyPath}`);
  }

  const value = deepGet(config, parts);
  return output({
    path: configPath,
    key: keyPath,
    value: value === undefined ? null : value,
  });
}

function configSet(keyPath, rawValue, fixmeRoot) {
  const parts = splitConfigKey(keyPath);
  if (!isSupportedConfigKey(parts)) {
    throw new Error(`Unsupported config key: ${keyPath}`);
  }

  const value = parseConfigValue(rawValue);
  const validation = validateConfigSetValue(parts, value);
  const { config, configPath, existed } = readConfigForWrite(fixmeRoot);
  const migration = applyConfigMigration(config);

  let valueToWrite = value;
  if (parts[0] === 'workflows' && parts.length === 2) {
    valueToWrite = validation.workflow;
  } else if (parts[0] === 'workflows' && parts[2] === 'phases') {
    valueToWrite = validation.pipeline;
  }
  deepSet(config, parts, valueToWrite);
  writeConfigAtomic(configPath, config);

  return output({
    path: configPath,
    created: !existed,
    migrated: migration.migrated,
    key: keyPath,
    value: valueToWrite,
    warnings: validation.warnings || [],
  });
}

function configWorkflowConfigure(workflowName, flags, fixmeRoot) {
  if (!isWorkflowName(workflowName)) {
    throw new Error('Workflow name is required and must contain only letters, numbers, underscores, or hyphens');
  }
  if (!flags.data) {
    throw new Error('--data is required for config workflow configure');
  }

  let data;
  try {
    data = JSON.parse(flags.data);
  } catch (e) {
    throw new Error(`Invalid JSON in --data: ${e.message}`);
  }
  if (!isPlainObject(data)) {
    throw new Error('--data must be a JSON object');
  }

  const phases = data.phases || data.pipeline;
  const validation = validatePipeline(phases, workflowName);
  const hasOuterMaxCycles = Object.prototype.hasOwnProperty.call(data, 'outerMaxCycles');
  if (hasOuterMaxCycles && !isPositiveInteger(data.outerMaxCycles)) {
    throw new Error('outerMaxCycles must be a positive integer');
  }

  const { config, configPath, existed } = readConfigForWrite(fixmeRoot);
  const migration = applyConfigMigration(config);

  const existingWorkflow = isPlainObject(config.workflows[workflowName]) ? config.workflows[workflowName] : {};
  if (hasOuterMaxCycles) {
    existingWorkflow.outerMaxCycles = data.outerMaxCycles;
  } else if (!isPositiveInteger(existingWorkflow.outerMaxCycles)) {
    existingWorkflow.outerMaxCycles = STANDARD_OUTER_MAX_CYCLES;
  }
  existingWorkflow.phases = validation.pipeline;
  config.workflows[workflowName] = existingWorkflow;

  writeConfigAtomic(configPath, config);

  return output({
    path: configPath,
    created: !existed,
    migrated: migration.migrated,
    workflow: workflowName,
    phases: validation.pipeline.length,
    outerMaxCycles: config.workflows[workflowName].outerMaxCycles,
    warnings: validation.warnings,
  });
}

/**
 * Resolve the transition map for a given ticket.
 * Priority: --pipeline flag -> ticket frontmatter pipeline -> hardcoded default.
 */
function resolveTransitions(fm, flags, fixmeRoot) {
  // 1. Check --pipeline flag (also stores it in frontmatter for future use)
  const pipelineFlag = flags.pipeline || null;
  // 2. Check ticket frontmatter
  const pipelineName = pipelineFlag || fm.pipeline || null;

  if (pipelineName) {
    const phases = loadPipelinePhases(pipelineName, fixmeRoot);
    if (phases && phases.length > 0) {
      return { transitions: buildTransitionsFromPhases(phases), phases, pipelineName };
    }
  }

  // 3. Fallback to hardcoded default
  return { transitions: TRANSITIONS, phases: null, pipelineName: null };
}

/**
 * Check if a transition requires a reason.
 */
function requiresReason(fromState, toState, phases) {
  if (toState === 'failed') return true;
  if (toState === 'skipped') return true;
  // Backward transition: target phase index < current phase index
  if (phases) {
    const fromIdx = phases.indexOf(fromState);
    const toIdx = phases.indexOf(toState);
    if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) return true;
  } else {
    // Legacy fallback: hardcoded retry check
    if (fromState === 'verifying' && toState === 'planning') return true;
  }
  return false;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(argv) {
  const args = [];
  const flags = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is a value (not another flag)
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[key] = argv[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      args.push(arg);
      i++;
    }
  }

  return { args, flags };
}

// ============================================================================
// Subcommands: ticket
// ============================================================================

function ticketCreate(sessionDir, flags) {
  const slug = flags.slug;
  if (!slug) {
    return error('--slug is required for ticket create');
  }

  // Scan sessionDir for existing ticket folders matching /^\d{4}-/ with ticket.md
  const existing = fs.readdirSync(sessionDir)
    .filter(d => {
      const dirPath = path.join(sessionDir, d);
      return fs.statSync(dirPath).isDirectory() && /^\d{4}-/.test(d);
    })
    .map(d => parseInt(d.match(/^(\d+)-/)[1], 10))
    .sort((a, b) => a - b);

  const nextNumber = existing.length > 0 ? existing[existing.length - 1] + 1 : 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');

  // Create ticket folder with subdirectories
  const ticketFolderName = `${paddedNumber}-${slug}`;
  const ticketDir = path.join(sessionDir, ticketFolderName);
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'research'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'plans'), { recursive: true });
  fs.mkdirSync(path.join(ticketDir, 'verifications'), { recursive: true });

  // Read template
  const templatePath = path.join(__dirname, '..', 'templates', 'ticket.md');
  if (!fs.existsSync(templatePath)) {
    return error(`Ticket template not found: ${templatePath}`);
  }

  let template = fs.readFileSync(templatePath, 'utf8');

  // Derive title from slug
  const title = slug.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  // Derive session name from sessionDir
  const sessionName = path.basename(sessionDir);

  const now = new Date().toISOString();
  const maxAttempts = flags['max-attempts'] ? parseInt(flags['max-attempts'], 10) : 3;

  // Replace placeholders
  template = template.replace(/\{NUMBER\}/g, paddedNumber);
  template = template.replace(/\{SLUG\}/g, slug);
  template = template.replace(/\{SESSION\}/g, sessionName);
  template = template.replace(/\{TIMESTAMP\}/g, now);
  template = template.replace(/\{TITLE\}/g, title);

  // Parse the filled template to set initial durations
  const parsed = parseFrontmatter(template);
  parsed.frontmatter.durations = {
    queued: { entered: now }
  };
  if (maxAttempts !== 3) {
    parsed.frontmatter.max_attempts = maxAttempts;
  }

  const finalContent = buildContent(parsed.frontmatter, parsed.body, parsed.rawFields);

  // Write ticket.md inside the ticket folder
  const ticketPath = path.join(ticketDir, 'ticket.md');
  fs.writeFileSync(ticketPath, finalContent);

  return output({ path: ticketPath, dir: ticketDir, number: paddedNumber, slug, state: 'queued' });
}

function resolveTicketPath(inputPath) {
  if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
    return path.join(inputPath, 'ticket.md');
  }
  return inputPath;
}

function ticketTransition(ticketPath, newState, flags, fixmeRoot) {
  ticketPath = resolveTicketPath(ticketPath);
  if (!fs.existsSync(ticketPath)) {
    return error(`Ticket file not found: ${ticketPath}`);
  }

  const content = fs.readFileSync(ticketPath, 'utf8');
  const { frontmatter: fm, body, rawFields } = parseFrontmatter(content);

  const currentState = fm.state;
  if (!currentState) {
    return error('Ticket has no state field in frontmatter');
  }

  // Resolve transition map
  const { transitions: transMap, phases, pipelineName } = resolveTransitions(fm, flags, fixmeRoot);

  // Store pipeline in frontmatter if provided via flag
  if (flags.pipeline && !fm.pipeline) {
    fm.pipeline = flags.pipeline;
  }

  // Validate transition
  const validNext = transMap[currentState];
  if (!validNext || validNext.length === 0) {
    return error(
      `Invalid transition: ${currentState} -> ${newState}. ` +
      `'${currentState}' is a terminal state with no valid transitions.`
    );
  }

  if (!validNext.includes(newState)) {
    return error(
      `Invalid transition: ${currentState} -> ${newState}. ` +
      `Valid transitions from '${currentState}': ${validNext.join(', ')}`
    );
  }

  // Enforce max_attempts on backward transitions
  if (phases) {
    const fromIdx = phases.indexOf(currentState);
    const toIdx = phases.indexOf(newState);
    if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
      const currentAttempt = fm.current_attempt || 0;
      const maxAttempts = fm.max_attempts || 3;
      if (currentAttempt >= maxAttempts - 1) {
        return error(
          `Retry limit reached: attempt ${currentAttempt + 1} of ${maxAttempts} (max_attempts). ` +
          `Backward transition ${currentState} -> ${newState} denied.`
        );
      }
    }
  } else {
    // Legacy fallback
    if (currentState === 'verifying' && newState === 'planning') {
      const currentAttempt = fm.current_attempt || 0;
      const maxAttempts = fm.max_attempts || 3;
      if (currentAttempt >= maxAttempts - 1) {
        return error(
          `Retry limit reached: attempt ${currentAttempt + 1} of ${maxAttempts} (max_attempts). ` +
          `Transition verifying -> planning denied.`
        );
      }
    }
  }

  // Check reason requirement
  const reason = flags.reason || null;
  if (requiresReason(currentState, newState, phases) && !reason) {
    return error(
      `Transition from '${currentState}' to '${newState}' requires a --reason`
    );
  }

  const now = new Date().toISOString();

  // Append to transitions log
  const transitions = fm.transitions || [];
  transitions.push({
    from: currentState,
    to: newState,
    timestamp: now,
    reason: reason
  });

  // Update durations
  const durations = fm.durations || {};
  if (durations[currentState] && durations[currentState].entered) {
    const entered = new Date(durations[currentState].entered);
    durations[currentState].exited = now;
    durations[currentState].seconds = Math.round((new Date(now) - entered) / 1000);
  }

  // Preserve cumulative seconds for states visited multiple times (e.g., planning on retry)
  const hadPriorEntry = durations[newState] && durations[newState].entered;
  const priorSeconds = (durations[newState] && typeof durations[newState].seconds === 'number') ? durations[newState].seconds : 0;
  const priorAccumulated = (durations[newState] && typeof durations[newState].prior_seconds === 'number') ? durations[newState].prior_seconds : 0;
  durations[newState] = { entered: now };
  if (hadPriorEntry) {
    durations[newState].prior_seconds = priorSeconds + priorAccumulated;
  }

  // Update frontmatter fields
  fm.state = newState;
  fm.updated = now;
  fm.transitions = transitions;
  fm.durations = durations;

  // Set failure_reason for failed/skipped
  if (reason && (newState === 'failed' || newState === 'skipped')) {
    fm.failure_reason = reason;
  }

  // Increment attempt on backward transition
  if (phases) {
    const fromIdx = phases.indexOf(currentState);
    const toIdx = phases.indexOf(newState);
    if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
      fm.current_attempt = (fm.current_attempt || 0) + 1;
    }
  } else {
    // Legacy fallback
    if (currentState === 'verifying' && newState === 'planning') {
      fm.current_attempt = (fm.current_attempt || 0) + 1;
    }
  }

  // Write back
  const updated = buildContent(fm, body, rawFields);
  fs.writeFileSync(ticketPath, updated);

  return output({ from: currentState, to: newState, timestamp: now, path: ticketPath });
}

function ticketList(sessionDir, flags) {
  if (!fs.existsSync(sessionDir)) {
    return output([]);
  }

  const stateFilter = flags.state || null;

  // Scan for ticket folders (NNNN-*/) containing ticket.md
  const entries = fs.readdirSync(sessionDir)
    .filter(d => {
      const dirPath = path.join(sessionDir, d);
      return fs.statSync(dirPath).isDirectory()
        && /^\d{4}-/.test(d)
        && fs.existsSync(path.join(dirPath, 'ticket.md'));
    })
    .sort();

  const tickets = entries.map(d => {
    const ticketPath = path.join(sessionDir, d, 'ticket.md');
    const content = fs.readFileSync(ticketPath, 'utf8');
    const { frontmatter: fm, body } = parseFrontmatter(content);
    const slug = fm.slug || d.replace(/^\d+-/, '');
    return {
      number: fm.number || d.match(/^(\d+)-/)?.[1] || '0000',
      slug,
      state: fm.state || 'unknown',
      title: extractTitle(body, slug),
      files_changed: Array.isArray(fm.files_changed) ? fm.files_changed : [],
      path: ticketPath,
      dir: path.join(sessionDir, d),
    };
  });

  const filtered = stateFilter
    ? tickets.filter(t => t.state === stateFilter)
    : tickets;

  return output(filtered);
}

function ticketNext(sessionDir) {
  if (!fs.existsSync(sessionDir)) {
    return output({ path: null });
  }

  // Scan for ticket folders (NNNN-*/) containing ticket.md
  const entries = fs.readdirSync(sessionDir)
    .filter(d => {
      const dirPath = path.join(sessionDir, d);
      return fs.statSync(dirPath).isDirectory()
        && /^\d{4}-/.test(d)
        && fs.existsSync(path.join(dirPath, 'ticket.md'));
    })
    .sort();

  const tickets = entries.map(d => {
    const ticketPath = path.join(sessionDir, d, 'ticket.md');
    const content = fs.readFileSync(ticketPath, 'utf8');
    const { frontmatter: fm, body } = parseFrontmatter(content);
    const slug = fm.slug || d.replace(/^\d+-/, '');
    return {
      number: fm.number || d.match(/^(\d+)-/)?.[1] || '0000',
      slug,
      state: fm.state || 'unknown',
      title: extractTitle(body, slug),
      path: ticketPath,
      dir: path.join(sessionDir, d),
    };
  });

  const queued = tickets.filter(t => t.state === 'queued');
  if (queued.length === 0) {
    return output({ path: null });
  }

  const next = queued[0];
  return output({ path: next.path, dir: next.dir, number: next.number, slug: next.slug, title: next.title });
}

function ticketRename(ticketPath, flags) {
  ticketPath = resolveTicketPath(ticketPath);
  const newSlug = flags.slug;
  if (!newSlug || typeof newSlug !== 'string') {
    return error('--slug is required for ticket rename');
  }

  if (!fs.existsSync(ticketPath)) {
    return error(`Ticket file not found: ${ticketPath}`);
  }

  // Validate/sanitize slug
  const sanitized = newSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')   // Replace invalid chars with hyphens
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-|-$/g, '')          // Trim leading/trailing hyphens
    .slice(0, 60);                  // Max 60 chars

  if (!sanitized) {
    return error('Slug is empty after sanitization');
  }

  // Read ticket to get number and update slug
  const content = fs.readFileSync(ticketPath, 'utf8');
  const { frontmatter: fm, body, rawFields } = parseFrontmatter(content);

  const number = fm.number || path.basename(path.dirname(ticketPath)).match(/^(\d+)-/)?.[1] || '0000';
  const oldSlug = fm.slug || null;

  // Update frontmatter
  fm.slug = sanitized;
  fm.updated = new Date().toISOString();

  // Derive new title from slug
  const title = sanitized.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  // Update body heading if it contains old title
  let updatedBody = body;
  if (oldSlug) {
    const oldTitle = oldSlug.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    updatedBody = body.replace(
      `# ${number}: ${oldTitle}`,
      `# ${number}: ${title}`
    );
  }

  const updatedContent = buildContent(fm, updatedBody, rawFields);

  // Write updated content back to ticket.md
  fs.writeFileSync(ticketPath, updatedContent);

  // Rename the parent directory (ticket folder)
  const oldDir = path.dirname(ticketPath);
  const parentDir = path.dirname(oldDir);
  const newFolderName = `${number}-${sanitized}`;
  const newDir = path.join(parentDir, newFolderName);
  const newPath = path.join(newDir, 'ticket.md');

  if (oldDir !== newDir) {
    fs.renameSync(oldDir, newDir);
  }

  return output({
    oldPath: ticketPath,
    newPath,
    oldDir,
    newDir,
    oldSlug: oldSlug,
    newSlug: sanitized,
    number,
    title
  });
}

// ============================================================================
// Subcommands: session
// ============================================================================

function sessionCreate(baseDir, flags) {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // Determine session name
  let name = flags.name || null;
  if (!name) {
    const now = new Date();
    const pad = (n, len) => String(n).padStart(len, '0');
    name = `fix-${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}-${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  }

  // Handle name collision
  let sessionDir = path.join(baseDir, name);
  if (fs.existsSync(sessionDir)) {
    let counter = 2;
    while (fs.existsSync(path.join(baseDir, `${name}-${counter}`))) {
      counter++;
    }
    name = `${name}-${counter}`;
    sessionDir = path.join(baseDir, name);
  }

  // Create session directory (ticket folders are created by ticketCreate)
  fs.mkdirSync(sessionDir, { recursive: true });

  // Read session template
  const templatePath = path.join(__dirname, '..', 'templates', 'session.md');
  const now = new Date().toISOString();

  let sessionContent;
  if (fs.existsSync(templatePath)) {
    sessionContent = fs.readFileSync(templatePath, 'utf8');
    sessionContent = sessionContent.replace(/\{SESSION_NAME\}/g, name);
    sessionContent = sessionContent.replace(/\{TIMESTAMP\}/g, now);
  } else {
    // Minimal session template if none exists yet
    sessionContent = `---\nname: ${name}\ncreated: "${now}"\nstatus: active\n---\n\n# Session: ${name}\n\nStarted: ${now}\n`;
  }

  fs.writeFileSync(path.join(sessionDir, 'session.md'), sessionContent);

  return output({ path: sessionDir, name, created: now });
}

function sessionList(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return output([]);
  }

  const sessions = fs.readdirSync(baseDir)
    .filter(d => {
      const dirPath = path.join(baseDir, d);
      return fs.statSync(dirPath).isDirectory() && fs.existsSync(path.join(dirPath, 'session.md'));
    })
    .map(d => {
      const sessionDir = path.join(baseDir, d);
      const sessionContent = fs.readFileSync(path.join(sessionDir, 'session.md'), 'utf8');
      const { frontmatter: fm } = parseFrontmatter(sessionContent);

      // Count tickets by state -- scan for NNNN-*/ticket.md
      const ticketCounts = {};
      const ticketDirs = fs.readdirSync(sessionDir)
        .filter(d => {
          const dp = path.join(sessionDir, d);
          return fs.statSync(dp).isDirectory()
            && /^\d{4}-/.test(d)
            && fs.existsSync(path.join(dp, 'ticket.md'));
        });
      for (const d of ticketDirs) {
        const content = fs.readFileSync(path.join(sessionDir, d, 'ticket.md'), 'utf8');
        const { frontmatter: tfm } = parseFrontmatter(content);
        const state = tfm.state || 'unknown';
        ticketCounts[state] = (ticketCounts[state] || 0) + 1;
      }

      return {
        name: fm.name || d,
        path: sessionDir,
        created: fm.created || null,
        ticket_counts: ticketCounts,
      };
    });

  return output(sessions);
}

function sessionSummary(sessionDir) {
  const sessionMdPath = path.join(sessionDir, 'session.md');
  if (!fs.existsSync(sessionMdPath)) {
    return error(`Session file not found: ${sessionMdPath}`);
  }

  const sessionContent = fs.readFileSync(sessionMdPath, 'utf8');
  const { frontmatter: fm, body, rawFields } = parseFrontmatter(sessionContent);

  // Read all tickets -- scan for NNNN-*/ticket.md
  const tickets = [];
  const stateCounts = {};
  let totalSeconds = 0;

  const ticketDirs = fs.readdirSync(sessionDir)
    .filter(d => {
      const dp = path.join(sessionDir, d);
      return fs.statSync(dp).isDirectory()
        && /^\d{4}-/.test(d)
        && fs.existsSync(path.join(dp, 'ticket.md'));
    })
    .sort();

  for (const d of ticketDirs) {
    const content = fs.readFileSync(path.join(sessionDir, d, 'ticket.md'), 'utf8');
    const { frontmatter: tfm, body: ticketBody } = parseFrontmatter(content);

    const state = tfm.state || 'unknown';
    stateCounts[state] = (stateCounts[state] || 0) + 1;

    // Compute total seconds for this ticket across all durations
    let ticketSeconds = 0;
    if (tfm.durations && typeof tfm.durations === 'object') {
      for (const [, dur] of Object.entries(tfm.durations)) {
        if (dur && typeof dur === 'object' && typeof dur.seconds === 'number') {
          ticketSeconds += dur.seconds;
        }
      }
    }

    // For active states, add time since entered
    if (tfm.durations && typeof tfm.durations === 'object') {
      const currentDur = tfm.durations[state];
      if (currentDur && currentDur.entered && !currentDur.exited) {
        const entered = new Date(currentDur.entered);
        ticketSeconds += Math.round((Date.now() - entered.getTime()) / 1000);
      }
    }

    totalSeconds += ticketSeconds;

    const slug = tfm.slug || d.replace(/^\d+-/, '');
    tickets.push({
      number: tfm.number || d.match(/^(\d+)-/)?.[1] || '0000',
      slug,
      state,
      title: extractTitle(ticketBody, slug),
      total_seconds: ticketSeconds,
    });
  }

  // Compute session duration
  const sessionCreated = fm.created ? new Date(fm.created) : null;
  const sessionDurationSeconds = sessionCreated
    ? Math.round((Date.now() - sessionCreated.getTime()) / 1000)
    : 0;

  // Update session.md frontmatter with summary stats
  const now = new Date().toISOString();
  fm.completed = now;
  fm.duration_seconds = sessionDurationSeconds;
  fm.tickets_done = stateCounts['done'] || 0;
  fm.tickets_failed = stateCounts['failed'] || 0;
  fm.tickets_skipped = stateCounts['skipped'] || 0;
  fm.tickets_total = tickets.length;

  const updatedContent = buildContent(fm, body, rawFields);
  fs.writeFileSync(sessionMdPath, updatedContent);

  return output({
    session: fm.name || path.basename(sessionDir),
    created: fm.created || null,
    completed: now,
    duration_seconds: sessionDurationSeconds,
    total_tickets: tickets.length,
    counts: stateCounts,
    tickets,
  });
}

// ============================================================================
// Subcommands: context
// ============================================================================

function contextDetect(flags) {
  const projectDir = flags['project-dir'] || process.cwd();

  const project = {
    devServer: { command: null, url: null, hmr: false },
    install: null,
    build: null,
    lint: null,
    test: { command: null, runner: null },
    framework: null,
  };

  // 1. Detect package manager from lockfile
  const pmDetect = [
    ['bun.lockb', 'bun', 'bun install --frozen-lockfile'],
    ['bun.lock', 'bun', 'bun install --frozen-lockfile'],
    ['pnpm-lock.yaml', 'pnpm', 'pnpm install --frozen-lockfile'],
    ['yarn.lock', 'yarn', 'yarn install --frozen-lockfile'],
    ['package-lock.json', 'npm', 'npm ci'],
  ];
  let pm = 'npm'; // fallback
  let installCommand = null;
  for (const [lockfile, name, lockedInstallCommand] of pmDetect) {
    if (fs.existsSync(path.join(projectDir, lockfile))) {
      pm = name;
      installCommand = lockedInstallCommand;
      break;
    }
  }
  const run = pm === 'npm' ? 'npm run' : pm;

  // 2. package.json
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts || {};
      project.install = installCommand || 'npm install';

      if (scripts.dev) project.devServer.command = `${run} dev`;
      if (scripts.build) project.build = `${run} build`;
      if (scripts.test) project.test.command = `${run} test`;
      if (scripts.lint) project.lint = `${run} lint`;

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

function contextSave(flags, fixmeRoot) {
  const projectDir = flags['project-dir'] || fixmeRoot || process.cwd();
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

  const { config, configPath } = readConfigForWrite(projectDir);
  applyConfigMigration(config);
  config.project = data;
  writeConfigAtomic(configPath, config);

  return output({ path: configPath, saved: true });
}

function contextLoad(flags, fixmeRoot) {
  const projectDir = flags['project-dir'] || fixmeRoot || process.cwd();
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

// ============================================================================
// Subcommands: codex-agents
// ============================================================================

function toSingleLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTomlPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function normalizeAgentList(value) {
  if (Array.isArray(value)) {
    return value.map(String).map(v => v.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function codexPathContent(content) {
  return content
    .replace(/\$HOME\/\.claude\//g, '$HOME/.codex/')
    .replace(/~\/\.claude\//g, '~/.codex/')
    .replace(/\.claude\//g, '.codex/');
}

function stripCodexSkillAdapter(content) {
  let result = content;
  while (true) {
    const start = result.indexOf(FIXME_CODEX_SKILL_ADAPTER_OPEN);
    if (start === -1) return result;

    const close = result.indexOf(FIXME_CODEX_SKILL_ADAPTER_CLOSE, start);
    if (close === -1) {
      return result.slice(0, start).trimEnd() + '\n';
    }

    let removeStart = start;
    while (removeStart > 0 && result[removeStart - 1] === '\n') {
      removeStart--;
    }

    let removeEnd = close + FIXME_CODEX_SKILL_ADAPTER_CLOSE.length;
    while (removeEnd < result.length && result[removeEnd] === '\n') {
      removeEnd++;
    }

    const before = result.slice(0, removeStart).trimEnd();
    const after = result.slice(removeEnd).replace(/^\n+/, '');
    result = before ? `${before}\n\n${after}` : after;
  }
}

function getCodexSkillAdapterHeader(skillName) {
  return [
    FIXME_CODEX_SKILL_ADAPTER_OPEN,
    '## Codex Runtime Adapter',
    '',
    `This is the Codex-installed copy of \`$${skillName}\`. The canonical source remains in \`.claude/skills/${skillName}/SKILL.md\`; this copy is generated by \`./install.sh\`.`,
    'These adapter rules take precedence over lower source instructions when Claude-native tool names or question mechanics conflict with Codex runtime behavior.',
    '',
    '## Skill Invocation',
    '',
    '- When Fixme source instructions say `Skill("name", args)`, load `$HOME/.codex/skills/name/SKILL.md` and run that skill workflow with the same arguments.',
    '- If a named skill requires isolation through a registered Fixme agent, dispatch that agent instead of running the workflow inline.',
    '',
    '## Agent Dispatch',
    '',
    '- When Fixme source instructions say `Agent(subagent_type="X", prompt="Y")`, use Codex `spawn_agent(agent_type="X", message="Y")`.',
    '- Omit Claude model arguments in Codex dispatch calls. Fixme agent models stay visible through config and generated agent files.',
    '- If the requested Fixme agent type is unavailable, use the workflow documented fallback. If no fallback is documented, stop with a dispatch blocker.',
    '',
    '## User Questions',
    '',
    '- In Codex Plan mode, translate Fixme `AskUserQuestion` calls to Codex `request_user_input`.',
    '- In Codex Default, Execute, or any non-Plan mode, do not call `request_user_input`; ask in normal text and wait for the user response.',
    '- For decision blocks, present the question with `$fixme-howto-present-decisions` before asking in normal text.',
    '- Do not choose a default after a question unless the source workflow explicitly marks the default as non-blocking.',
    FIXME_CODEX_SKILL_ADAPTER_CLOSE,
  ].join('\n');
}

function splitRawFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: '', body: content };
  }
  return {
    frontmatter: match[0].trimEnd(),
    body: content.slice(match[0].length),
  };
}

function convertCodexSkillMarkdown(content, skillName, isSkillEntry) {
  const converted = codexPathContent(stripCodexSkillAdapter(content));
  if (!isSkillEntry) return converted;

  const { frontmatter, body } = splitRawFrontmatter(converted);
  const adapter = getCodexSkillAdapterHeader(skillName);
  if (frontmatter) {
    return `${frontmatter}\n\n${adapter}\n\n${body.trimStart()}`;
  }
  return `${adapter}\n\n${converted.trimStart()}`;
}

function copyCodexSkillDir(sourceDir, targetDir, skillName) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyCodexSkillDir(sourcePath, targetPath, skillName);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(sourcePath, 'utf8');
      fs.writeFileSync(targetPath, convertCodexSkillMarkdown(content, skillName, entry.name === 'SKILL.md'));
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function codexSandboxForAgent(frontmatter) {
  const tools = normalizeAgentList(frontmatter.tools);
  const writeTools = new Set(['Write', 'Edit', 'Agent', 'TodoWrite']);
  return tools.some(tool => writeTools.has(tool)) ? 'workspace-write' : 'read-only';
}

function codexDeveloperInstructions(agentContent) {
  const { frontmatter, body } = parseFrontmatter(agentContent);
  const skills = normalizeAgentList(frontmatter.skills);
  const lines = [];

  lines.push('<codex_runtime>');
  lines.push('- When Fixme source instructions say `Agent(...)` or `subagent_type`, use Codex `spawn_agent(agent_type=..., message=...)` with the same agent name and task prompt.');
  lines.push('- When Fixme source instructions say `Skill("name", ...)` and no Skill tool exists, load `$HOME/.codex/skills/name/SKILL.md` and run that skill workflow in the current agent.');
  lines.push('- Do not convert a required Fixme dispatch into direct implementation work.');
  lines.push('</codex_runtime>');
  lines.push('');

  if (skills.length > 0) {
    lines.push('<required_skills>');
    lines.push('Before doing task-specific work, read and follow these installed skill files:');
    for (const skill of skills) {
      lines.push(`- $HOME/.codex/skills/${skill}/SKILL.md`);
    }
    lines.push('</required_skills>');
    lines.push('');
  }

  lines.push(body.trim());
  return lines.join('\n').trim();
}

function tomlLiteral(key, value) {
  if (!String(value).includes("'''")) {
    return `${key} = '''\n${value}\n'''`;
  }
  return `${key} = ${JSON.stringify(String(value))}`;
}

function generateCodexAgentToml(agentName, agentContent) {
  const { frontmatter } = parseFrontmatter(agentContent);
  const resolvedName = frontmatter.name || agentName;
  const description = toSingleLine(frontmatter.description || `Fixme agent ${resolvedName}`);
  const instructions = codexDeveloperInstructions(agentContent);
  return [
    `name = ${JSON.stringify(resolvedName)}`,
    `description = ${JSON.stringify(description)}`,
    `sandbox_mode = ${JSON.stringify(codexSandboxForAgent(frontmatter))}`,
    tomlLiteral('developer_instructions', instructions),
  ].join('\n') + '\n';
}

function getTomlTableSections(content) {
  const sections = [];
  const regex = /^[ \t]*(\[\[?)([A-Za-z0-9_.-]+)(\]\]?)[ \t]*(?:#.*)?$/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const open = match[1];
    const close = match[3];
    if ((open === '[[' && close !== ']]') || (open === '[' && close !== ']')) continue;
    sections.push({
      start: match.index,
      headerEnd: regex.lastIndex,
      end: content.length,
      path: match[2],
      array: open === '[[',
    });
  }

  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].end = sections[i + 1].start;
  }

  return sections;
}

function removeContentRanges(content, ranges) {
  let result = content;
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  for (const range of sorted) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return result;
}

function stripManagedFixmeCodexBlock(content) {
  let result = content;
  while (true) {
    const start = result.indexOf(FIXME_CODEX_MARKER);
    if (start === -1) return result;

    const close = result.indexOf(FIXME_CODEX_CLOSE_MARKER, start);
    let end;
    if (close === -1) {
      end = result.length;
    } else {
      const afterCloseLine = result.indexOf('\n', close + FIXME_CODEX_CLOSE_MARKER.length);
      end = afterCloseLine === -1 ? result.length : afterCloseLine + 1;
    }

    result = result.slice(0, start) + result.slice(end);
  }
}

function stripFixmeCodexAgentSections(content) {
  const sections = getTomlTableSections(content).filter(section => {
    if (!section.array && section.path.startsWith('agents.fixme-')) return true;
    if (section.array && section.path === 'agents') {
      const body = content.slice(section.headerEnd, section.end);
      const nameMatch = body.match(/^[ \t]*name[ \t]*=[ \t]*["']([^"']+)["']/m);
      return Boolean(nameMatch && nameMatch[1].startsWith('fixme-'));
    }
    return false;
  });

  return removeContentRanges(
    content,
    sections.map(({ start, end }) => ({ start, end }))
  );
}

function hasAgentsRootTable(content) {
  return getTomlTableSections(content).some(section => !section.array && section.path === 'agents');
}

function buildFixmeCodexConfigBlock(agents, codexDir) {
  const lines = [FIXME_CODEX_MARKER, ''];
  for (const agent of agents) {
    lines.push(`[agents.${agent.name}]`);
    lines.push(`description = ${JSON.stringify(agent.description)}`);
    lines.push(`config_file = ${JSON.stringify(normalizeTomlPath(path.join(codexDir, 'agents', `${agent.name}.toml`)))}`);
    lines.push('');
  }
  lines.push(FIXME_CODEX_CLOSE_MARKER);
  return lines.join('\n');
}

function mergeFixmeCodexConfig(existingContent, agents, codexDir) {
  let content = stripManagedFixmeCodexBlock(existingContent || '');
  content = stripFixmeCodexAgentSections(content);
  content = content.replace(/\n{3,}/g, '\n\n').trimEnd();

  if (!hasAgentsRootTable(content)) {
    const root = '[agents]\nmax_threads = 12\nmax_depth = 3';
    content = content ? `${content}\n\n${root}` : root;
  }

  const block = buildFixmeCodexConfigBlock(agents, codexDir);
  const gsdMarkerIndex = content.indexOf(GSD_CODEX_MARKER_PREFIX);
  if (gsdMarkerIndex !== -1) {
    const before = content.slice(0, gsdMarkerIndex).trimEnd();
    const after = content.slice(gsdMarkerIndex).trimStart();
    return `${before}\n\n${block}\n\n${after}\n`;
  }

  return `${content}\n\n${block}\n`;
}

function installCodexAgents(options) {
  const agentsSrc = options.agentsSrc;
  const codexDir = options.codexDir;
  if (!agentsSrc) throw new Error('--agents-src is required');
  if (!codexDir) throw new Error('--codex-dir is required');
  if (!fs.existsSync(agentsSrc) || !fs.statSync(agentsSrc).isDirectory()) {
    throw new Error(`Agents source not found: ${agentsSrc}`);
  }

  const agentsDir = path.join(codexDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  let removed = 0;
  for (const file of fs.readdirSync(agentsDir)) {
    if (file.startsWith('fixme-') && (file.endsWith('.toml') || file.endsWith('.md'))) {
      fs.rmSync(path.join(agentsDir, file), { force: true });
      removed++;
    }
  }

  const sourceFiles = fs.readdirSync(agentsSrc)
    .filter(file => file.startsWith('fixme-') && file.endsWith('.md'))
    .sort();
  const agents = [];

  for (const file of sourceFiles) {
    const sourcePath = path.join(agentsSrc, file);
    const convertedContent = codexPathContent(fs.readFileSync(sourcePath, 'utf8'));
    const { frontmatter } = parseFrontmatter(convertedContent);
    const name = frontmatter.name || file.replace(/\.md$/, '');
    const description = toSingleLine(frontmatter.description || `Fixme agent ${name}`);

    agents.push({ name, description });
    fs.writeFileSync(path.join(agentsDir, `${name}.md`), convertedContent);
    fs.writeFileSync(path.join(agentsDir, `${name}.toml`), generateCodexAgentToml(name, convertedContent));
  }

  const configPath = path.join(codexDir, 'config.toml');
  const existingConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(configPath, mergeFixmeCodexConfig(existingConfig, agents, codexDir));

  return {
    codexDir: path.resolve(codexDir),
    agentsDir: path.resolve(agentsDir),
    configPath: path.resolve(configPath),
    installed: agents.length,
    removed,
    agents: agents.map(agent => agent.name),
  };
}

function codexAgentsInstall(flags) {
  return output(installCodexAgents({
    agentsSrc: flags['agents-src'],
    codexDir: flags['codex-dir'],
  }));
}

function installCodexSkills(options) {
  const skillsSrc = options.skillsSrc;
  const codexDir = options.codexDir;
  if (!skillsSrc) throw new Error('--skills-src is required');
  if (!codexDir) throw new Error('--codex-dir is required');
  if (!fs.existsSync(skillsSrc) || !fs.statSync(skillsSrc).isDirectory()) {
    throw new Error(`Skills source not found: ${skillsSrc}`);
  }

  const skillsDir = path.join(codexDir, 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });

  let removed = 0;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('fixme')) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
      removed++;
    }
  }

  const sourceDirs = fs.readdirSync(skillsSrc, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('fixme'))
    .map(entry => entry.name)
    .sort();

  for (const name of sourceDirs) {
    copyCodexSkillDir(path.join(skillsSrc, name), path.join(skillsDir, name), name);
  }

  fs.rmSync(path.join(skillsDir, 'fixme-tickets-md', 'scripts'), { recursive: true, force: true });

  return {
    codexDir: path.resolve(codexDir),
    skillsDir: path.resolve(skillsDir),
    installed: sourceDirs.length,
    removed,
    skills: sourceDirs,
  };
}

function codexSkillsInstall(flags) {
  return output(installCodexSkills({
    skillsSrc: flags['skills-src'],
    codexDir: flags['codex-dir'],
  }));
}

// ============================================================================
// Output Helpers
// ============================================================================

function output(data) {
  if (process.env.FIXME_RAW === '1' || process.argv.includes('--raw')) {
    if (typeof data === 'string') {
      process.stdout.write(data + '\n');
    } else {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    }
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
  process.exit(0);
}

function error(message) {
  process.stdout.write(JSON.stringify({ error: message }) + '\n');
  process.exit(1);
}

// ============================================================================
// Main Router
// ============================================================================

function rootCommand() {
  const fixmeRoot = findFixmeRoot(process.cwd());
  return output({
    fixme_root: fixmeRoot,
    fixme_dir: path.join(fixmeRoot, '.fixme'),
  });
}

function main() {
  const allArgs = process.argv.slice(2);
  if (allArgs.length === 0) {
    return error('Usage: fixme-tools.cjs <command> <subcommand> [args] [--flags]');
  }

  const command = allArgs[0];
  const subcommand = allArgs[1] || '';
  const { args, flags } = parseArgs(allArgs.slice(2));
  const fixmeRoot = findFixmeRoot(process.cwd());

  try {
    switch (command) {
      case 'ticket':
        switch (subcommand) {
          case 'create':
            return ticketCreate(args[0], flags);
          case 'transition':
            return ticketTransition(args[0], args[1], flags, fixmeRoot);
          case 'list':
            return ticketList(args[0], flags);
          case 'next':
            return ticketNext(args[0]);
          case 'rename':
            return ticketRename(args[0], flags);
          default:
            return error(`Unknown ticket subcommand: '${subcommand}'. Valid: create, transition, list, next, rename`);
        }

      case 'session':
        switch (subcommand) {
          case 'create':
            return sessionCreate(args[0], flags);
          case 'list':
            return sessionList(args[0]);
          case 'summary':
            return sessionSummary(args[0]);
          default:
            return error(`Unknown session subcommand: '${subcommand}'. Valid: create, list, summary`);
        }

      case 'context':
        switch (subcommand) {
          case 'detect':
            return contextDetect(flags);
          case 'save':
            return contextSave(flags, fixmeRoot);
          case 'load':
            return contextLoad(flags, fixmeRoot);
          default:
            return error(`Unknown context subcommand: '${subcommand}'. Valid: detect, save, load`);
        }

      case 'config':
        switch (subcommand) {
          case 'ensure':
          case 'migrate':
            return configMigrate(fixmeRoot);
          case 'get':
            return configGet(args[0], fixmeRoot);
          case 'set':
            return configSet(args[0], args[1], fixmeRoot);
          case 'workflow':
            switch (args[0]) {
              case 'configure':
                return configWorkflowConfigure(args[1], flags, fixmeRoot);
              default:
                return error(`Unknown config workflow subcommand: '${args[0] || ''}'. Valid: configure`);
            }
          default:
            return error(`Unknown config subcommand: '${subcommand}'. Valid: ensure, migrate, get, set, workflow`);
        }

      case 'codex-agents':
        switch (subcommand) {
          case 'install':
            return codexAgentsInstall(flags);
          default:
            return error(`Unknown codex-agents subcommand: '${subcommand}'. Valid: install`);
        }

      case 'codex-skills':
        switch (subcommand) {
          case 'install':
            return codexSkillsInstall(flags);
          default:
            return error(`Unknown codex-skills subcommand: '${subcommand}'. Valid: install`);
        }

      case 'root':
        return rootCommand();

      case 'resolve-model': {
        // subcommand slot holds the agent name for this single-arg command
        const agentName = subcommand;
        if (!agentName) {
          return error('Usage: fixme-tools.cjs resolve-model <agent-name>');
        }
        return output(resolveModel(agentName, fixmeRoot));
      }

      default:
        return error(`Unknown command: '${command}'. Valid: ticket, session, context, config, codex-agents, codex-skills, root, resolve-model`);
    }
  } catch (e) {
    return error(e.message);
  }
}

// Guard main() so require() doesn't execute the CLI
if (require.main === module) {
  main();
}

// Exports for testing
module.exports = {
  buildTransitionsFromPhases,
  parseFrontmatter,
  findFixmeRoot,
  resolveModel,
  MODEL_PROFILES,
  STANDARD_PIPELINES,
  applyConfigMigration,
  generateCodexAgentToml,
  mergeFixmeCodexConfig,
  installCodexAgents,
  convertCodexSkillMarkdown,
  installCodexSkills,
};
