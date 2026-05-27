#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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
const DEFAULT_RUNTIME = 'claude';
const CLAUDE_REASONING_EFFORT = 'high';
const CLAUDE_MEDIUM_REASONING_EFFORT = 'medium';
const CLAUDE_EXTRA_HIGH_REASONING_EFFORT = 'xhigh';

const CLAUDE_EXTRA_HIGH_AGENTS = new Set([
  'fixme-write-plan',
  'fixme-write-product-spec',
  'fixme-write-technical-spec',
  'fixme-review-spec',
  'fixme-review-plan',
  'fixme-review-code',
  'fixme-handle-spec-review',
  'fixme-handle-plan-review',
  'fixme-handle-code-review',
]);

const CLAUDE_MEDIUM_AGENTS = new Set([
  'fixme-execute-plan',
]);

const CODEX_REASONING_PROFILES = {
  quality: {
    default: 'xhigh',
    'fixme-execute-plan': 'medium',
  },
  balanced: {
    default: 'xhigh',
    'fixme-execute-plan': 'medium',
    'fixme-browser-verify': 'high',
  },
  budget: {
    default: 'high',
    'fixme-execute-plan': 'medium',
    'fixme-task': 'medium',
    'fixme-browser-verify': 'medium',
  },
};

const STANDARD_PIPELINES = {
  standard: [
    {
      name: 'plan',
      skills: ['fixme-write-plan'],
      review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 },
    },
    {
      name: 'implement',
      skills: ['fixme-execute-plan'],
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 },
    },
  ],
  full: [
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
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 },
    },
    { name: 'verify', skills: ['fixme-browser-verify'] },
  ],
  bugfix: [
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
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 },
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
  'plan-only': [
    {
      name: 'plan',
      skills: ['fixme-write-plan'],
      review: { skills: ['fixme-review-plan', 'fixme-handle-plan-review'], maxCycles: 3 },
    },
  ],
  'execute-only': [
    {
      name: 'implement',
      skills: ['fixme-execute-plan'],
      review: { skills: ['fixme-review-code', 'fixme-handle-code-review'], maxCycles: 3 },
    },
  ],
};

const STANDARD_OUTER_MAX_CYCLES = 2;
const STANDARD_PIPELINE_NAMES = Object.keys(STANDARD_PIPELINES);
const REVIEW_LEVELS = Object.freeze(['strict', 'standard', 'lenient', 'fast-track', 'critical']);
const VALID_REVIEW_LEVELS = new Set(REVIEW_LEVELS);
const LEGACY_WORKFLOW_ALIASES = Object.freeze({
  default: 'standard',
  plan: 'plan-only',
  execute: 'execute-only',
  'idea-to-production': 'full',
});
const LEGACY_SOFTNESS_LABEL_TO_LEVEL = Object.freeze({
  strict: 'strict',
  default: 'standard',
  lenient: 'lenient',
  tactical: 'fast-track',
  panic: 'critical',
});
const VALID_MODEL_PROFILES = new Set(['quality', 'balanced', 'budget', 'inherit']);
const VALID_MODEL_VALUES = new Set(['opus', 'sonnet', 'haiku', 'inherit']);
const VALID_RUNTIME_VALUES = new Set(['claude', 'codex']);
const VALID_TICKET_BACKENDS = new Set(['fixme-tickets-md', 'fixme-tickets-linear']);
const FIXME_CODEX_MARKER = '# Fixme Agent Configuration - managed by fixme installer';
const FIXME_CODEX_CLOSE_MARKER = '# /Fixme Agent Configuration';
const GSD_CODEX_MARKER_PREFIX = '# GSD Agent Configuration';
const FIXME_CODEX_SKILL_ADAPTER_OPEN = '<codex_skill_adapter>';
const FIXME_CODEX_SKILL_ADAPTER_CLOSE = '</codex_skill_adapter>';
const FIXME_USAGE_TRACKING_OPEN = '<!-- fixme-usage-tracking:start -->';
const FIXME_USAGE_TRACKING_CLOSE = '<!-- fixme-usage-tracking:end -->';

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
  'fixme-task',
  'fixme-usage',
  'fixme-write-plan',
  'fixme-write-product-spec',
  'fixme-write-technical-spec',
]);

const USAGE_RUNTIMES = Object.freeze(['claude', 'codex', 'auto']);
const USAGE_ROLES = Object.freeze(['skill', 'orchestrator', 'reviewer', 'handler', 'reporter', 'reference']);
const USAGE_OUTCOMES = Object.freeze(['complete', 'failed', 'aborted']);
const USAGE_STATUS = Object.freeze({
  MEASURED: 'measured',
  UNMEASURED: 'unmeasured',
  LEGACY_COMPLETE: 'complete',
  LEGACY_PARTIAL: 'partial',
});
const USAGE_REASON_VALUES = Object.freeze([
  'verification_failed',
  'user_aborted',
  'usage_tracking_failed',
  'runtime_error',
  'dispatch_failed',
  'timeout',
  'invalid_usage_request',
  'unknown',
]);
const USAGE_WARNING_CODES = Object.freeze({
  COUNTERS_UNAVAILABLE: 'COUNTERS_UNAVAILABLE',
  NO_NEW_USAGE: 'NO_NEW_USAGE',
  NEGATIVE_DELTA: 'NEGATIVE_DELTA',
  COUNTER_CONFLICT: 'COUNTER_CONFLICT',
  AMBIGUOUS_COUNTER_SOURCE: 'AMBIGUOUS_COUNTER_SOURCE',
  DUPLICATE_INVOCATION_CONFLICT: 'DUPLICATE_INVOCATION_CONFLICT',
  CORRUPT_JSONL_LINE: 'CORRUPT_JSONL_LINE',
  TRAILING_INCOMPLETE_LINE: 'TRAILING_INCOMPLETE_LINE',
  DESTINATION_APPEND_FAILED: 'DESTINATION_APPEND_FAILED',
});
const USAGE_SOURCE_SNAPSHOT_SCAN_BYTES = 1024 * 1024;
const USAGE_SOURCE_DISCOVERY_SCAN_BYTES = 256 * 1024;
const USAGE_TOKEN_BUCKETS = Object.freeze([
  'inputTokens',
  'cachedInputTokens',
  'cacheCreationInputTokens',
  'cacheReadInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
  'totalTokens',
]);

const ALERT_EVENTS = Object.freeze(['user_input', 'task_finished', 'task_failed']);

const ALERT_DEFAULT_SOUNDS = Object.freeze({
  user_input: 'Glass',
  task_finished: 'Hero',
  task_failed: 'Basso',
});

const ALERT_PLATFORM_DEFAULTS = Object.freeze({
  darwin: {
    player: 'afplay',
    soundDir: '/System/Library/Sounds',
    extension: '.aiff',
    soundCatalog: ['Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink'],
    soundNameMap: null,
    fallbackSound: 'Glass',
  },
  linux: {
    player: 'paplay',
    soundDir: '/usr/share/sounds/freedesktop/stereo',
    extension: '.oga',
    soundCatalog: ['bell', 'complete', 'dialog-error', 'message', 'service-login', 'service-logout'],
    soundNameMap: {
      Glass: 'bell',
      Hero: 'complete',
      Basso: 'dialog-error',
      Ping: 'message',
      Sosumi: 'dialog-error',
      Funk: 'message',
      Pop: 'bell',
      Tink: 'message',
      Purr: 'message',
      Blow: 'message',
      Bottle: 'message',
      Frog: 'message',
      Morse: 'message',
    },
    fallbackSound: 'bell',
  },
  win32: {
    player: 'powershell',
    commandTemplate: ['-NoProfile', '-Command', '(New-Object Media.SoundPlayer "$env:SystemRoot\\Media\\{file}.wav").PlaySync()'],
    soundCatalog: ['Windows Notify', 'Windows Logon', 'Windows Critical Stop', 'Windows Ding', 'Windows Default'],
    soundNameMap: {
      Glass: 'Windows Notify',
      Hero: 'Windows Logon',
      Basso: 'Windows Critical Stop',
      Ping: 'Windows Ding',
      Submarine: 'Windows Logon',
      Sosumi: 'Windows Critical Stop',
      Funk: 'Windows Ding',
      Pop: 'Windows Ding',
      Tink: 'Windows Ding',
      Purr: 'Windows Default',
      Blow: 'Windows Default',
      Bottle: 'Windows Default',
      Frog: 'Windows Default',
      Morse: 'Windows Default',
    },
    fallbackSound: 'Windows Notify',
  },
});

/**
 * Resolve runtime-specific agent settings based on config.
 *
 * Claude receives short model names plus agent-specific reasoning effort. Codex
 * receives reasoning effort only so the user's selected Codex model remains in force.
 *
 * Resolution order:
 *   1. models.overrides[agent] (source = 'override')
 *   2. profile table lookup (source = 'profile')
 *   3. Default profile settings (source = 'default')
 * Profile is reported as-is from config even when the agent isn't in the table
 * (so the user's selection stays visible in the banner).
 */
function resolveRuntime(rawRuntime) {
  return VALID_RUNTIME_VALUES.has(rawRuntime) ? rawRuntime : DEFAULT_RUNTIME;
}

function isKnownProfile(profile) {
  return profile === 'inherit' || Object.prototype.hasOwnProperty.call(MODEL_PROFILES, profile);
}

function applyRuntimeSettings(result, agentName, modelOrNull) {
  if (result.runtime === 'codex') {
    result.model = null;
    result.reasoning_effort = modelOrNull === 'inherit'
      ? null
      : codexReasoningEffortForAgent(result.profile, agentName);
    return result;
  }

  result.model = modelOrNull || DEFAULT_MODEL;
  result.reasoning_effort = result.model === 'inherit' ? null : claudeReasoningEffortForAgent(agentName);
  return result;
}

function claudeReasoningEffortForAgent(agentName) {
  if (CLAUDE_MEDIUM_AGENTS.has(agentName)) return CLAUDE_MEDIUM_REASONING_EFFORT;
  return CLAUDE_EXTRA_HIGH_AGENTS.has(agentName)
    ? CLAUDE_EXTRA_HIGH_REASONING_EFFORT
    : CLAUDE_REASONING_EFFORT;
}

function codexReasoningEffortForAgent(profile, agentName) {
  if (profile === 'inherit') return null;
  const table = CODEX_REASONING_PROFILES[profile] || CODEX_REASONING_PROFILES[DEFAULT_PROFILE];
  return table[agentName] || table.default;
}

function resolveModel(agentName, fixmeRoot, options = {}) {
  const requestedRuntime = typeof options.runtime === 'string' ? options.runtime : null;
  const result = {
    agent: agentName,
    runtime: resolveRuntime(requestedRuntime),
    model: DEFAULT_MODEL,
    reasoning_effort: CLAUDE_REASONING_EFFORT,
    profile: DEFAULT_PROFILE,
    source: 'default',
  };

  const configPath = path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return applyRuntimeSettings(result, agentName, DEFAULT_MODEL);
  }

  const models = (config && typeof config.models === 'object') ? config.models : null;
  if (!requestedRuntime && models && typeof models.runtime === 'string') {
    result.runtime = resolveRuntime(models.runtime);
  }
  if (!models) return applyRuntimeSettings(result, agentName, DEFAULT_MODEL);

  const rawProfile = typeof models.profile === 'string' ? models.profile : null;
  const profileKnown = rawProfile && isKnownProfile(rawProfile);
  result.profile = profileKnown ? rawProfile : DEFAULT_PROFILE;

  const overrides = (models.overrides && typeof models.overrides === 'object') ? models.overrides : {};
  if (result.runtime === 'claude' && Object.prototype.hasOwnProperty.call(overrides, agentName) && typeof overrides[agentName] === 'string') {
    result.model = overrides[agentName];
    result.source = 'override';
    if (rawProfile) result.profile = rawProfile;
    return applyRuntimeSettings(result, agentName, result.model);
  }

  if (profileKnown && rawProfile === 'inherit') {
    result.source = 'profile';
    return applyRuntimeSettings(result, agentName, 'inherit');
  }

  if (profileKnown) {
    const table = MODEL_PROFILES[rawProfile];
    if (Object.prototype.hasOwnProperty.call(table, agentName)) {
      result.model = table[agentName];
      result.source = 'profile';
      return applyRuntimeSettings(result, agentName, result.model);
    }
    result.profile = rawProfile;
  }

  return applyRuntimeSettings(result, agentName, DEFAULT_MODEL);
}

function resolveAlert(event, config, platform) {
  const effectivePlatform = platform || process.platform;

  if (!ALERT_EVENTS.includes(event)) {
    return { enabled: false, event, reason: `unknown event: ${event}` };
  }

  const alerts = isPlainObject(config && config.alerts) ? config.alerts : {};
  if (alerts.enabled === false) {
    return { enabled: false, event, reason: 'alerts disabled' };
  }

  const platformDefaults = ALERT_PLATFORM_DEFAULTS[effectivePlatform];
  if (!platformDefaults) {
    return { enabled: false, event, reason: `unsupported platform: ${effectivePlatform}` };
  }

  const userPlayers = isPlainObject(alerts.players) ? alerts.players : {};
  const userPlatform = isPlainObject(userPlayers[effectivePlatform]) ? userPlayers[effectivePlatform] : {};
  const platformConfig = { ...platformDefaults, ...userPlatform };

  const userSounds = isPlainObject(alerts.sounds) ? alerts.sounds : {};
  const canonicalName = userSounds[event] || ALERT_DEFAULT_SOUNDS[event];

  let nativeName;
  if (platformConfig.soundNameMap) {
    nativeName = platformConfig.soundNameMap[canonicalName] || platformConfig.fallbackSound;
  } else {
    nativeName = canonicalName;
  }

  let command, args;
  if (effectivePlatform === 'win32') {
    command = platformConfig.player;
    args = platformConfig.commandTemplate.map(s => s.replace('{file}', nativeName));
  } else {
    command = platformConfig.player;
    args = [path.join(platformConfig.soundDir, nativeName + platformConfig.extension)];
  }

  return {
    enabled: true,
    event,
    canonicalName,
    nativeName,
    command,
    args,
    platform: effectivePlatform,
  };
}

function runAlert(event, fixmeRoot, options = {}) {
  let config = {};
  if (fixmeRoot) {
    try {
      const loaded = readConfigForResolve(fixmeRoot);
      config = loaded.config || {};
    } catch (e) {
      // Bad config should not block the alert; degrade to defaults.
      config = {};
    }
  }

  const resolved = resolveAlert(event, config);
  if (options.resolveOnly) {
    return resolved;
  }
  if (!resolved.enabled) {
    return resolved;
  }

  const { spawn } = require('child_process');
  try {
    const child = spawn(resolved.command, resolved.args, {
      stdio: 'ignore',
      detached: true,
    });
    child.on('error', () => {});
    child.unref();
    return { ...resolved, spawned: true };
  } catch (e) {
    return { ...resolved, spawned: false, reason: `spawn failed: ${e.message}` };
  }
}

function listAlertSounds(platform) {
  const effectivePlatform = platform || process.platform;
  const platformDefaults = ALERT_PLATFORM_DEFAULTS[effectivePlatform];
  return {
    platform: effectivePlatform,
    supported: Boolean(platformDefaults),
    sounds: platformDefaults ? [...platformDefaults.soundCatalog] : [],
    canonicalSounds: [...ALERT_PLATFORM_DEFAULTS.darwin.soundCatalog],
    events: [...ALERT_EVENTS],
    defaults: { ...ALERT_DEFAULT_SOUNDS },
  };
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
  const homedir = os.homedir();

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
    const normalizedName = normalizeWorkflowName(pipelineName);
    let workflow = getWorkflowDefinition(config, normalizedName);
    if (!workflow && isPlainObject(config.pipelines) && Array.isArray(config.pipelines[pipelineName])) {
      workflow = {
        outerMaxCycles: getLegacyOuterMaxCycles(config, pipelineName) || STANDARD_OUTER_MAX_CYCLES,
        phases: config.pipelines[pipelineName],
      };
    }
    if (!workflow && STANDARD_PIPELINES[normalizedName]) {
      workflow = makeStandardWorkflow(normalizedName);
    }
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

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeWorkflowName(name) {
  return LEGACY_WORKFLOW_ALIASES[name] || name;
}

function isValidReviewLevel(value) {
  return typeof value === 'string' && VALID_REVIEW_LEVELS.has(value);
}

function validateReviewLevelValue(value, configPath) {
  if (!isValidReviewLevel(value)) {
    throw new Error(`${configPath} must be one of: ${REVIEW_LEVELS.join(', ')}`);
  }
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

function ensureAlertsConfig(config) {
  let changed = false;

  if (!isPlainObject(config.alerts)) {
    config.alerts = {};
    changed = true;
  }

  if (typeof config.alerts.enabled !== 'boolean') {
    config.alerts.enabled = true;
    changed = true;
  }

  if (!isPlainObject(config.alerts.sounds)) {
    config.alerts.sounds = {};
    changed = true;
  }

  for (const event of ALERT_EVENTS) {
    if (typeof config.alerts.sounds[event] !== 'string' || config.alerts.sounds[event].trim() === '') {
      config.alerts.sounds[event] = ALERT_DEFAULT_SOUNDS[event];
      changed = true;
    }
  }

  if (!isPlainObject(config.alerts.players)) {
    config.alerts.players = {};
    changed = true;
  }

  return changed;
}

function ensureUsageConfig(config) {
  let changed = false;

  if (!isPlainObject(config.usage)) {
    config.usage = {};
    changed = true;
  }

  if (typeof config.usage.printAfterFinish !== 'boolean') {
    config.usage.printAfterFinish = true;
    changed = true;
  }

  return changed;
}

function isOldBugfixWorkflow(workflow) {
  if (!hasWorkflowPhases(workflow)) return false;
  const tuples = workflow.phases.map(phase => [
    phase && phase.name,
    Array.isArray(phase && phase.skills) ? phase.skills[0] : null,
  ]);
  return jsonEqual(tuples, [
    ['investigate', 'fixme-investigate'],
    ['research', 'fixme-research'],
    ['plan', 'fixme-write-plan'],
    ['implement', 'fixme-execute-plan'],
    ['verify', 'fixme-browser-verify'],
  ]);
}

function isFinalFullWorkflow(workflow) {
  if (!hasWorkflowPhases(workflow)) return false;
  const tuples = workflow.phases.map(phase => [
    phase && phase.name,
    Array.isArray(phase && phase.skills) ? phase.skills[0] : null,
  ]);
  return jsonEqual(tuples, [
    ['product-spec', 'fixme-write-product-spec'],
    ['technical-spec', 'fixme-write-technical-spec'],
    ['plan', 'fixme-write-plan'],
    ['implement', 'fixme-execute-plan'],
    ['verify', 'fixme-browser-verify'],
  ]);
}

function setReviewLevel(target, level) {
  if (!isPlainObject(target.review)) target.review = {};
  if (target.review.level !== level) {
    target.review.level = level;
    return true;
  }
  return false;
}

function legacySoftnessToLevel(value) {
  if (Object.prototype.hasOwnProperty.call(LEGACY_SOFTNESS_LABEL_TO_LEVEL, value)) {
    return LEGACY_SOFTNESS_LABEL_TO_LEVEL[value];
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 1) return null;
    if (value <= 0.15) return 'strict';
    if (value <= 0.45) return 'standard';
    if (value <= 0.725) return 'lenient';
    if (value < 0.925) return 'fast-track';
    return 'critical';
  }
  return null;
}

function convertLegacySoftnessValue(value, configPath, result) {
  const level = legacySoftnessToLevel(value);
  if (level) return level;
  result.warnings.push({
    warning: 'invalid_legacy_review_softness',
    configPath,
    value,
    fallback: 'next review-level fallback',
  });
  return null;
}

function validateFinalReviewLevels(config, configFilePath) {
  const check = (value, configPath) => {
    if (value !== undefined && !isValidReviewLevel(value)) {
      throw new CliJsonError({ error: 'invalid_review_level', path: configFilePath, configPath, value });
    }
  };

  check(config.review && config.review.level, 'review.level');
  if (isPlainObject(config.pullRequestComments) && isPlainObject(config.pullRequestComments.review)) {
    check(config.pullRequestComments.review.level, 'pullRequestComments.review.level');
  }
  if (!isPlainObject(config.workflows)) return;
  for (const [workflowName, workflow] of Object.entries(config.workflows)) {
    if (!isPlainObject(workflow)) continue;
    check(workflow.review && workflow.review.level, `workflows.${workflowName}.review.level`);
    if (!Array.isArray(workflow.phases)) continue;
    workflow.phases.forEach((phase, index) => {
      if (isPlainObject(phase) && isPlainObject(phase.review)) {
        check(phase.review.level, `workflows.${workflowName}.phases[${index}].review.level`);
      }
    });
  }
}

function moveWorkflow(config, from, to, result, workflowMoveMap) {
  if (!hasWorkflowPhases(config.workflows[from])) return false;
  if (hasWorkflowPhases(config.workflows[to])) {
    if (!jsonEqual(config.workflows[from], config.workflows[to])) {
      throw new CliJsonError({ error: 'workflow_name_conflict', path: result.configPath, from, to });
    }
    delete config.workflows[from];
  } else {
    config.workflows[to] = config.workflows[from];
    delete config.workflows[from];
  }
  workflowMoveMap.set(from, to);
  result.renamedWorkflows.push({ from, to });
  result.migrated = true;
  return true;
}

function phaseReviewSurface(phase) {
  const reviewSkills = phase && phase.review && Array.isArray(phase.review.skills) ? phase.review.skills : [];
  if (reviewSkills.includes('fixme-review-spec')) return 'spec-review';
  if (reviewSkills.includes('fixme-review-plan')) return 'plan-review';
  if (reviewSkills.includes('fixme-review-code')) return 'code-review';
  return null;
}

function convertLegacySoftness(config, workflowMoveMap, result) {
  const softness = config.review && config.review.softness;
  if (!isPlainObject(softness)) return;

  if (Object.prototype.hasOwnProperty.call(softness, 'default')) {
    const globalLevel = convertLegacySoftnessValue(softness.default, 'review.softness.default', result);
    if (globalLevel && config.review.level !== globalLevel) {
      config.review.level = globalLevel;
      result.migrated = true;
      result.migratedReviewLevel = true;
    }
  }

  if (isPlainObject(softness.workflows)) {
    for (const [legacyWorkflowName, legacyWorkflow] of Object.entries(softness.workflows)) {
      if (!isPlainObject(legacyWorkflow)) continue;
      const workflowName = workflowMoveMap.get(legacyWorkflowName) || normalizeWorkflowName(legacyWorkflowName);
      if (!hasWorkflowPhases(config.workflows[workflowName]) && STANDARD_PIPELINES[workflowName]) {
        config.workflows[workflowName] = makeStandardWorkflow(workflowName);
        if (!result.addedWorkflows.includes(workflowName)) result.addedWorkflows.push(workflowName);
        result.migrated = true;
      }
      const workflow = config.workflows && config.workflows[workflowName];
      if (!hasWorkflowPhases(workflow)) continue;

      const workflowLevel = Object.prototype.hasOwnProperty.call(legacyWorkflow, 'default')
        ? convertLegacySoftnessValue(legacyWorkflow.default, `review.softness.workflows.${legacyWorkflowName}.default`, result)
        : null;
      if (workflowLevel && setReviewLevel(workflow, workflowLevel)) {
        result.migrated = true;
        result.migratedReviewLevel = true;
      }

      if (isPlainObject(legacyWorkflow.phases)) {
        for (const phase of workflow.phases) {
          if (!Object.prototype.hasOwnProperty.call(legacyWorkflow.phases, phase.name)) continue;
          const phaseLevel = convertLegacySoftnessValue(
            legacyWorkflow.phases[phase.name],
            `review.softness.workflows.${legacyWorkflowName}.phases.${phase.name}`,
            result
          );
          if (phaseLevel && setReviewLevel(phase, phaseLevel)) {
            result.migrated = true;
            result.migratedReviewLevel = true;
          }
        }
      }
    }
  }

  if (isPlainObject(softness.surfaces)) {
    for (const name of STANDARD_PIPELINE_NAMES) {
      if (!hasWorkflowPhases(config.workflows[name])) {
        config.workflows[name] = makeStandardWorkflow(name);
        if (!result.addedWorkflows.includes(name)) result.addedWorkflows.push(name);
        result.migrated = true;
      }
    }
    const surfaceLevels = {};
    for (const surface of ['spec-review', 'plan-review', 'code-review']) {
      if (Object.prototype.hasOwnProperty.call(softness.surfaces, surface)) {
        surfaceLevels[surface] = convertLegacySoftnessValue(softness.surfaces[surface], `review.softness.surfaces.${surface}`, result);
      }
    }
    for (const workflow of Object.values(config.workflows || {})) {
      if (!hasWorkflowPhases(workflow)) continue;
      for (const phase of workflow.phases) {
        if (!isPlainObject(phase) || !isPlainObject(phase.review)) continue;
        if (phase.review.level !== undefined) continue;
        if (workflow.review && workflow.review.level !== undefined) continue;
        const surface = phaseReviewSurface(phase);
        const surfaceLevel = surface && surfaceLevels[surface];
        if (surfaceLevel && setReviewLevel(phase, surfaceLevel)) {
          result.migrated = true;
          result.migratedReviewLevel = true;
        }
      }
    }
  }

  const prLevel = isPlainObject(softness.surfaces) && Object.prototype.hasOwnProperty.call(softness.surfaces, 'pr-comments')
    ? convertLegacySoftnessValue(softness.surfaces['pr-comments'], 'review.softness.surfaces.pr-comments', result)
    : null;
  if (prLevel) {
    if (!isPlainObject(config.pullRequestComments)) config.pullRequestComments = {};
    if (setReviewLevel(config.pullRequestComments, prLevel)) {
      result.migrated = true;
      result.migratedReviewLevel = true;
    }
  }

  delete config.review.softness;
  result.removedLegacyReviewKeys.push('review.softness');
  result.migrated = true;
}

function applyConfigMigration(config, configPath = null) {
  const result = {
    migrated: false,
    addedWorkflows: [],
    migratedLegacyWorkflows: [],
    removedLegacyKeys: [],
    renamedWorkflows: [],
    migratedReviewLevel: false,
    removedLegacyReviewKeys: [],
    warnings: [],
    configPath,
  };
  const workflowMoveMap = new Map();

  if (!isPlainObject(config.workflows)) {
    config.workflows = {};
    result.migrated = true;
  }

  validateFinalReviewLevels(config, configPath);

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

  if (hasWorkflowPhases(config.workflows.full)) {
    if (isOldBugfixWorkflow(config.workflows.full)) {
      moveWorkflow(config, 'full', 'bugfix', result, workflowMoveMap);
    } else if (!isFinalFullWorkflow(config.workflows.full)) {
      throw new CliJsonError({ error: 'workflow_name_conflict', path: configPath, from: 'full', to: 'full' });
    }
  }

  for (const [from, to] of Object.entries(LEGACY_WORKFLOW_ALIASES)) {
    moveWorkflow(config, from, to, result, workflowMoveMap);
  }

  if (!isPlainObject(config.review)) {
    config.review = {};
    result.migrated = true;
  }

  convertLegacySoftness(config, workflowMoveMap, result);

  if (!Object.prototype.hasOwnProperty.call(config.review, 'level')) {
    config.review.level = 'standard';
    result.migrated = true;
    result.migratedReviewLevel = true;
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

  if (ensureAlertsConfig(config)) {
    result.migrated = true;
  }

  if (ensureUsageConfig(config)) {
    result.migrated = true;
  }

  validateFinalReviewLevels(config, configPath);

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
  if (top === 'review') return parts.length === 2 && second === 'level';
  if (top === 'pullRequestComments') return parts.length === 3 && second === 'review' && third === 'level';
  if (top === ['fix', 'Scope'].join('')) return false;

  if (top === 'models') {
    if (second === 'profile') return parts.length === 2;
    if (second === 'runtime') return parts.length === 2;
    if (second === 'overrides' && parts.length === 3) return true;
    return false;
  }

  if (top === 'workflows') {
    if (!isWorkflowName(second)) return false;
    if (parts.length === 2) return true;
    if (parts.length === 3) return ['phases', 'outerMaxCycles'].includes(third);
    if (parts.length === 4 && third === 'review' && parts[3] === 'level') return true;
    return false;
  }

  if (top === 'linear') {
    return ['teamId', 'teamName', 'defaultLabels', 'defaultProject'].includes(second) && parts.length === 2;
  }

  if (top === 'ticketTemplate') {
    return parts.length >= 2;
  }

  if (top === 'alerts') {
    if (parts.length === 1) return true;
    if (second === 'enabled' && parts.length === 2) return true;
    if (second === 'sounds') {
      if (parts.length === 2) return true;
      if (parts.length === 3 && ALERT_EVENTS.includes(third)) return true;
      return false;
    }
    if (second === 'players') {
      // Allow free-form platform overrides; validation is permissive.
      return parts.length >= 2;
    }
    return false;
  }

  if (top === 'usage') {
    return parts.length === 2 && second === 'printAfterFinish';
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
      if (normalizedPhase.review.level !== undefined) {
        validateReviewLevelValue(normalizedPhase.review.level, `${fieldPrefix}.review.level`);
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
  if (normalized.review !== undefined) {
    if (!isPlainObject(normalized.review)) {
      throw new Error(`workflows.${workflowName}.review must be an object when present`);
    }
    if (normalized.review.level !== undefined) {
      validateReviewLevelValue(normalized.review.level, `workflows.${workflowName}.review.level`);
    }
  }

  return { workflow: normalized, warnings: validation.warnings };
}

function validateConfigSetValue(parts, value) {
  const [top, second, third] = parts;

  if (top === 'review') {
    validateReviewLevelValue(value, parts.join('.'));
    return { warnings: [] };
  }

  if (top === 'pullRequestComments') {
    validateReviewLevelValue(value, parts.join('.'));
    return { warnings: [] };
  }

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

  if (top === 'models' && second === 'runtime') {
    if (typeof value !== 'string' || !VALID_RUNTIME_VALUES.has(value)) {
      throw new Error("models.runtime must be one of: claude, codex");
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
    if (third === 'review' && parts[3] === 'level') {
      validateReviewLevelValue(value, parts.join('.'));
      return { warnings: [] };
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

  if (top === 'alerts') {
    if (parts.length === 1) {
      if (!isPlainObject(value)) {
        throw new Error('alerts must be an object');
      }
      return { warnings: [] };
    }
    if (second === 'enabled') {
      if (typeof value !== 'boolean') {
        throw new Error('alerts.enabled must be a boolean');
      }
      return { warnings: [] };
    }
    if (second === 'sounds' && parts.length === 3) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('alerts.sounds.<event> must be a non-empty string');
      }
      const validSounds = new Set(ALERT_PLATFORM_DEFAULTS.darwin.soundCatalog);
      if (!validSounds.has(value)) {
        throw new Error(`Unknown sound name: ${value}. Known: ${[...validSounds].join(', ')}`);
      }
      return { warnings: [] };
    }
    if (second === 'sounds' && parts.length === 2) {
      if (!isPlainObject(value)) {
        throw new Error('alerts.sounds must be an object');
      }
      for (const [event, sound] of Object.entries(value)) {
        if (!ALERT_EVENTS.includes(event)) {
          throw new Error(`Unknown alert event: ${event}. Known: ${ALERT_EVENTS.join(', ')}`);
        }
        const validSounds = new Set(ALERT_PLATFORM_DEFAULTS.darwin.soundCatalog);
        if (typeof sound !== 'string' || !validSounds.has(sound)) {
          throw new Error(`alerts.sounds.${event}: unknown sound '${sound}'`);
        }
      }
      return { warnings: [] };
    }
    if (second === 'players') {
      if (parts.length === 2 && !isPlainObject(value)) {
        throw new Error('alerts.players must be an object');
      }
      return { warnings: [] };
    }
  }

  if (top === 'usage') {
    if (second === 'printAfterFinish') {
      if (typeof value !== 'boolean') {
        throw new Error('usage.printAfterFinish must be a boolean');
      }
      return { warnings: [] };
    }
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
  const migration = applyConfigMigration(config, configPath);
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
    renamedWorkflows: migration.renamedWorkflows,
    migratedReviewLevel: migration.migratedReviewLevel,
    removedLegacyReviewKeys: migration.removedLegacyReviewKeys,
    warnings: migration.warnings,
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

function readConfigForResolve(fixmeRoot) {
  const configPath = configPathForRoot(fixmeRoot);
  if (!fs.existsSync(configPath)) {
    return { config: {}, configPath, existed: false };
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

  return { config, configPath, existed: true };
}

function invalidReviewLevelWarning(configPath, value) {
  return `Invalid review level at ${configPath}: ${JSON.stringify(value)}. Falling back to next layer.`;
}

function readReviewLevelCandidate(candidates, warnings) {
  for (const candidate of candidates) {
    if (candidate.value === undefined) continue;
    if (isValidReviewLevel(candidate.value)) return candidate;
    warnings.push(invalidReviewLevelWarning(candidate.configPath, candidate.value));
  }
  return {
    level: 'standard',
    source: 'builtin',
    configPath: null,
    value: 'standard',
  };
}

function resolveReviewLevel(config, options = {}) {
  const configForResolution = isPlainObject(config) ? config : {};
  const warnings = [];
  const workflowInput = options.workflow || null;
  const workflowName = workflowInput ? normalizeWorkflowName(workflowInput) : null;
  const phaseName = options.phase || null;
  const reviewPath = options.path || null;

  if (reviewPath && reviewPath !== 'pullRequestComments') {
    return { error: 'unknown_review_path', reviewPath, warnings };
  }

  if (workflowName) {
    const configuredWorkflow = configForResolution.workflows && configForResolution.workflows[workflowName];
    const builtinWorkflow = STANDARD_PIPELINES[workflowName]
      ? { outerMaxCycles: STANDARD_OUTER_MAX_CYCLES, phases: STANDARD_PIPELINES[workflowName] }
      : null;
    const workflow = hasWorkflowPhases(configuredWorkflow) ? configuredWorkflow : builtinWorkflow;
    if (!workflow) {
      return { error: 'unknown_workflow', workflow: workflowInput, warnings };
    }

    let phase = null;
    let phaseIndex = -1;
    if (phaseName) {
      phaseIndex = workflow.phases.findIndex(candidate => candidate.name === phaseName);
      if (phaseIndex < 0) {
        return { error: 'unknown_phase', workflow: workflowInput, phase: phaseName, warnings };
      }
      phase = workflow.phases[phaseIndex];
    }

    const candidates = [];
    if (phase) {
      candidates.push({
        level: phase.review && phase.review.level,
        value: phase.review && phase.review.level,
        source: 'phase',
        configPath: `workflows.${workflowName}.phases[${phaseIndex}].review.level`,
      });
    }
    candidates.push({
      level: workflow.review && workflow.review.level,
      value: workflow.review && workflow.review.level,
      source: 'workflow',
      configPath: `workflows.${workflowName}.review.level`,
    });
    candidates.push({
      level: configForResolution.review && configForResolution.review.level,
      value: configForResolution.review && configForResolution.review.level,
      source: 'global',
      configPath: 'review.level',
    });

    const resolved = readReviewLevelCandidate(candidates, warnings);
    return {
      level: resolved.value,
      source: resolved.source,
      workflow: workflowName,
      phase: phaseName,
      configPath: resolved.configPath,
      warnings,
    };
  }

  if (reviewPath === 'pullRequestComments') {
    const candidates = [
      {
        level: configForResolution.pullRequestComments
          && configForResolution.pullRequestComments.review
          && configForResolution.pullRequestComments.review.level,
        value: configForResolution.pullRequestComments
          && configForResolution.pullRequestComments.review
          && configForResolution.pullRequestComments.review.level,
        source: 'pullRequestComments',
        configPath: 'pullRequestComments.review.level',
      },
      {
        level: configForResolution.review && configForResolution.review.level,
        value: configForResolution.review && configForResolution.review.level,
        source: 'global',
        configPath: 'review.level',
      },
    ];
    const resolved = readReviewLevelCandidate(candidates, warnings);
    return {
      level: resolved.value,
      source: resolved.source,
      workflow: null,
      phase: null,
      configPath: resolved.configPath,
      warnings,
    };
  }

  const resolved = readReviewLevelCandidate([
    {
      level: configForResolution.review && configForResolution.review.level,
      value: configForResolution.review && configForResolution.review.level,
      source: 'global',
      configPath: 'review.level',
    },
  ], warnings);
  return {
    level: resolved.value,
    source: resolved.source,
    workflow: null,
    phase: null,
    configPath: resolved.configPath,
    warnings,
  };
}

function configReviewLevelResolve(flags, fixmeRoot) {
  const { config, configPath, existed } = readConfigForResolve(fixmeRoot);
  const resolution = resolveReviewLevel(config, {
    workflow: flags.workflow || null,
    phase: flags.phase || null,
    path: flags.path || null,
  });

  if (resolution.error) {
    const payload = { error: resolution.error, path: configPath };
    if (resolution.workflow) payload.workflow = resolution.workflow;
    if (resolution.phase) payload.phase = resolution.phase;
    if (resolution.reviewPath) payload.reviewPath = resolution.reviewPath;
    throw new CliJsonError(payload);
  }

  return output({
    path: configPath,
    level: resolution.level,
    source: resolution.source,
    workflow: resolution.workflow,
    phase: resolution.phase,
    configPath: resolution.configPath,
    configExists: existed,
    warnings: resolution.warnings,
  });
}

function configSet(keyPath, rawValue, fixmeRoot) {
  const parts = splitConfigKey(keyPath);
  if (!isSupportedConfigKey(parts)) {
    throw new Error(`Unsupported config key: ${keyPath}`);
  }

  const value = parseConfigValue(rawValue);
  const { config, configPath, existed } = readConfigForWrite(fixmeRoot);
  const migration = applyConfigMigration(config, configPath);
  const validation = validateConfigSetValue(parts, value);

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
  const migration = applyConfigMigration(config, configPath);

  const existingWorkflow = isPlainObject(config.workflows[workflowName]) ? config.workflows[workflowName] : {};
  if (data.review !== undefined) {
    if (!isPlainObject(data.review)) {
      throw new Error('review must be an object when present');
    }
    if (data.review.level !== undefined) {
      validateReviewLevelValue(data.review.level, `workflows.${workflowName}.review.level`);
    }
    existingWorkflow.review = cloneJson(data.review);
  }
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
  const rawPipelineName = pipelineFlag || fm.pipeline || null;

  if (rawPipelineName) {
    const phases = loadPipelinePhases(rawPipelineName, fixmeRoot);
    if (phases && phases.length > 0) {
      const pipelineName = normalizeWorkflowName(rawPipelineName);
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
  if (pipelineName && (flags.pipeline || fm.pipeline !== pipelineName)) {
    fm.pipeline = pipelineName;
  }

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
  applyConfigMigration(config, configPath);
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
    '- Before dispatching a Fixme agent, resolve its Codex runtime settings with `node $HOME/.codex/skills/fixme-tools/scripts/fixme-tools.cjs resolve-model X --runtime codex`.',
    '- When Fixme source instructions say `Agent(subagent_type="X", prompt="Y")`, use Codex `spawn_agent(agent_type="X", reasoning_effort="{resolved-reasoning-effort}", message="Y")` when the resolver returns a `reasoning_effort` value.',
    '- Omit `reasoning_effort` only when the resolver returns `null`. Always omit Claude `model` arguments in Codex dispatch calls so the user-selected Codex model prevails.',
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

function usageRoleForSkill(skillName) {
  if (skillName === 'fixme-task' || skillName === 'fixme-session') return 'orchestrator';
  if (skillName.startsWith('fixme-review-')) return 'reviewer';
  if (skillName.startsWith('fixme-handle-')) return 'handler';
  if (skillName === 'fixme-usage') return 'reporter';
  if (skillName.startsWith('fixme-howto-')) return 'reference';
  return 'skill';
}

function stripGeneratedUsageTrackingBlock(content) {
  let result = content;
  while (true) {
    const start = result.indexOf(FIXME_USAGE_TRACKING_OPEN);
    if (start === -1) return result;
    const close = result.indexOf(FIXME_USAGE_TRACKING_CLOSE, start);
    const end = close === -1 ? result.length : close + FIXME_USAGE_TRACKING_CLOSE.length;
    const before = result.slice(0, start).trimEnd();
    const after = result.slice(end).replace(/^\n+/, '');
    result = before ? `${before}\n\n${after}` : after;
  }
}

function getUsageTrackingBlock(skillName, runtime) {
  const role = usageRoleForSkill(skillName);
  const toolPath = runtime === 'codex'
    ? '~/.codex/skills/fixme-tools/scripts/fixme-tools.cjs'
    : '~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs';
  return [
    FIXME_USAGE_TRACKING_OPEN,
    '## Fixme Usage Tracking',
    '',
    `Only run this block when \`${skillName}\` is the active skill invocation. Do not run it when this file is loaded only as reference material by another skill.`,
    '',
    'At invocation start, run:',
    '',
    '```bash',
    `node ${toolPath} usage start --skill ${skillName} --runtime ${runtime} --role ${role}`,
    '```',
    '',
    'If the dispatch prompt includes `pipeline_run_id`, include `--pipeline-run-id <pipeline_run_id>`. If it includes `parent_invocation_id`, include `--parent-invocation-id <parent_invocation_id>`. Never pass the reserved task flag.',
    '',
    'Store the returned `invocationId`. On normal completion, run `usage finish --invocation-id <invocationId> --outcome complete`. On failure, use `--outcome failed --reason <reason>`. On abort, use `--outcome aborted --reason <reason>`. Reasons must be one of: `verification_failed`, `user_aborted`, `usage_tracking_failed`, `runtime_error`, `dispatch_failed`, `timeout`, `invalid_usage_request`, or `unknown`.',
    '',
    'If usage start or finish fails, print a warning with the skill name, invocation ID when known, failed operation, and fallback, then continue the normal skill completion path. If `usage finish` returns `reportLine`, relay it. If it is suppressed, do not invent one.',
    FIXME_USAGE_TRACKING_CLOSE,
  ].join('\n');
}

function injectUsageTrackingBlock(content, skillName, runtime, afterCodexAdapter) {
  const stripped = stripGeneratedUsageTrackingBlock(content);
  const block = getUsageTrackingBlock(skillName, runtime);
  const { frontmatter, body } = splitRawFrontmatter(stripped);
  if (afterCodexAdapter) {
    const adapterClose = body.indexOf(FIXME_CODEX_SKILL_ADAPTER_CLOSE);
    if (adapterClose !== -1) {
      const insertAt = adapterClose + FIXME_CODEX_SKILL_ADAPTER_CLOSE.length;
      const before = body.slice(0, insertAt).trimEnd();
      const after = body.slice(insertAt).trimStart();
      return frontmatter
        ? `${frontmatter}\n\n${before}\n\n${block}\n\n${after}`
        : `${before}\n\n${block}\n\n${after}`;
    }
  }
  return frontmatter
    ? `${frontmatter}\n\n${block}\n\n${body.trimStart()}`
    : `${block}\n\n${stripped.trimStart()}`;
}

function convertCodexSkillMarkdown(content, skillName, isSkillEntry) {
  const converted = codexPathContent(stripGeneratedUsageTrackingBlock(stripCodexSkillAdapter(content)));
  if (!isSkillEntry) return converted;

  const { frontmatter, body } = splitRawFrontmatter(converted);
  const adapter = getCodexSkillAdapterHeader(skillName);
  const withAdapter = frontmatter
    ? `${frontmatter}\n\n${adapter}\n\n${body.trimStart()}`
    : `${adapter}\n\n${converted.trimStart()}`;
  return injectUsageTrackingBlock(withAdapter, skillName, 'codex', true);
}

function convertClaudeSkillMarkdown(content, skillName, isSkillEntry) {
  const converted = stripGeneratedUsageTrackingBlock(content);
  if (!isSkillEntry) return converted;
  return injectUsageTrackingBlock(converted, skillName, 'claude', false);
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

function copyClaudeSkillDir(sourceDir, targetDir, skillName) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyClaudeSkillDir(sourcePath, targetPath, skillName);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(sourcePath, 'utf8');
      fs.writeFileSync(targetPath, convertClaudeSkillMarkdown(content, skillName, entry.name === 'SKILL.md'));
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
  lines.push('- When Fixme source instructions say `Agent(...)` or `subagent_type`, resolve Codex runtime settings with `node $HOME/.codex/skills/fixme-tools/scripts/fixme-tools.cjs resolve-model <agent-name> --runtime codex`, then use Codex `spawn_agent(agent_type=..., reasoning_effort=..., message=...)` with the same agent name and task prompt.');
  lines.push('- Always omit Claude `model` arguments in Codex dispatch calls so the user-selected Codex model prevails. Omit `reasoning_effort` only when the resolver returns `null`.');
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

function codexDefaultReasoningEffortForAgent(agentName) {
  return codexReasoningEffortForAgent(DEFAULT_PROFILE, agentName);
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
    `model_reasoning_effort = ${JSON.stringify(codexDefaultReasoningEffortForAgent(resolvedName))}`,
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

function installClaudeSkills(options) {
  const skillsSrc = options.skillsSrc;
  const claudeDir = options.claudeDir;
  if (!skillsSrc) throw new Error('--skills-src is required');
  if (!claudeDir) throw new Error('--claude-dir is required');
  if (!fs.existsSync(skillsSrc) || !fs.statSync(skillsSrc).isDirectory()) {
    throw new Error(`Skills source not found: ${skillsSrc}`);
  }

  const skillsDir = path.join(claudeDir, 'skills');
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
    copyClaudeSkillDir(path.join(skillsSrc, name), path.join(skillsDir, name), name);
  }

  fs.rmSync(path.join(skillsDir, 'fixme-tickets-md', 'scripts'), { recursive: true, force: true });

  return {
    claudeDir: path.resolve(claudeDir),
    skillsDir: path.resolve(skillsDir),
    installed: sourceDirs.length,
    removed,
    skills: sourceDirs,
  };
}

function claudeSkillsInstall(flags) {
  return output(installClaudeSkills({
    skillsSrc: flags['skills-src'],
    claudeDir: flags['claude-dir'],
  }));
}

// ============================================================================
// Subcommands: usage
// ============================================================================

function usageProjectDir(fixmeDir) {
  return path.join(fixmeDir, 'usage');
}

function usagePendingDir(fixmeDir) {
  return path.join(usageProjectDir(fixmeDir), 'pending');
}

function usageProjectEventPath(fixmeDir) {
  return path.join(usageProjectDir(fixmeDir), 'events.jsonl');
}

function usageGlobalEventPath() {
  return path.join(os.homedir(), '.fixme', 'usage', 'events.jsonl');
}

function normalizeNullableFlag(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  return value;
}

function validateUsageId(value, fieldName) {
  const normalized = normalizeNullableFlag(value);
  if (normalized === null) return null;
  if (typeof normalized !== 'string' || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    const err = new Error(`${fieldName} must contain only letters, numbers, underscores, and dashes`);
    err.code = 'INVALID_USAGE_ID';
    throw err;
  }
  return normalized;
}

function generateUsageId(prefix) {
  const stamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '_')
    .replace('Z', '');
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${stamp}_${random}`;
}

function readJsonFileStrict(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function explicitUsageSourcePath(runtime, explicitPath) {
  return explicitPath
    || process.env.FIXME_USAGE_SOURCE_PATH
    || (runtime === 'codex' ? process.env.CODEX_SESSION_FILE : process.env.CLAUDE_TRANSCRIPT_PATH)
    || null;
}

function captureCodexCumulativeStartSnapshot(sourcePath, cursor) {
  if (!sourcePath || !cursor || !cursor.size || cursor.size <= 0 || !fs.existsSync(sourcePath)) return null;
  const endByte = cursor.size;
  const startByte = Math.max(0, endByte - USAGE_SOURCE_SNAPSHOT_SCAN_BYTES);
  const rows = readJsonlSlice(sourcePath, startByte, endByte);
  const cumulative = [];
  for (const row of rows) {
    if (row.type === 'event_msg' && row.payload && row.payload.type === 'token_count' && row.payload.info && row.payload.info.total_token_usage) {
      cumulative.push(normalizeCodexUsage(row.payload.info.total_token_usage));
    }
  }
  return cumulative.length > 0 ? cumulative[cumulative.length - 1] : null;
}

function captureSourceSnapshot(runtime, explicitPath, projectRoot, skill, startedAt) {
  const sourcePath = explicitUsageSourcePath(runtime, explicitPath);
  const snapshot = {
    runtime,
    explicitPath: sourcePath,
    source: sourcePath ? { kind: `${runtime}_jsonl`, path: sourcePath, discovery: 'explicit' } : null,
    cursor: sourcePath && fs.existsSync(sourcePath)
      ? { path: sourcePath, size: fs.statSync(sourcePath).size, mtimeMs: fs.statSync(sourcePath).mtimeMs }
      : null,
    codexCumulativeStartTokens: null,
  };
  if (!sourcePath && projectRoot) {
    try {
      const discovery = discoverRuntimeCounterSources(runtime, projectRoot, skill, startedAt, startedAt, null);
      if (discovery.status === 'one') {
        const candidate = discovery.candidates[0];
        snapshot.source = sourceMetadata(
          `${runtime}_jsonl`,
          candidate.path,
          candidate.discovery,
          1,
          candidate.attributionSkill ? { attributionSkill: candidate.attributionSkill } : {}
        );
        snapshot.cursor = { ...candidate.cursor, path: candidate.path };
      }
    } catch (_) {
      snapshot.source = null;
      snapshot.cursor = null;
    }
  }
  if (runtime === 'codex' && snapshot.cursor) {
    try {
      snapshot.codexCumulativeStartTokens = captureCodexCumulativeStartSnapshot(snapshot.cursor.path, snapshot.cursor);
    } catch (_) {
      snapshot.codexCumulativeStartTokens = null;
    }
  }
  return snapshot;
}

function walkJsonlFiles(rootDir) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;
  const rootStat = fs.statSync(rootDir);
  if (!rootStat.isDirectory()) return results;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }
  return results;
}

function sanitizeRuntimeRow(raw) {
  const row = {};
  for (const key of ['type', 'cwd', 'projectRoot', 'project_root', 'timestamp', 'agentId', 'attributionAgent', 'attributionSkill']) {
    if (raw[key] !== undefined) row[key] = raw[key];
  }
  if (raw.payload && typeof raw.payload === 'object') {
    row.payload = {};
    for (const key of ['type', 'cwd', 'project_root']) {
      if (raw.payload[key] !== undefined) row.payload[key] = raw.payload[key];
    }
    if (raw.payload.info && typeof raw.payload.info === 'object') {
      row.payload.info = {};
      if (raw.payload.info.total_token_usage !== undefined) row.payload.info.total_token_usage = raw.payload.info.total_token_usage;
      if (raw.payload.info.last_token_usage !== undefined) row.payload.info.last_token_usage = raw.payload.info.last_token_usage;
    }
  }
  if (raw.message && typeof raw.message === 'object') {
    row.message = {};
    if (raw.message.cwd !== undefined) row.message.cwd = raw.message.cwd;
    if (raw.message.usage !== undefined) row.message.usage = raw.message.usage;
  }
  if (raw.usage !== undefined) row.usage = raw.usage;
  return row;
}

function readJsonlSlice(filePath, startByte = 0, endByte = null) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, Math.min(startByte || 0, stat.size));
  const end = endByte === null ? stat.size : Math.max(start, Math.min(endByte, stat.size));
  const length = end - start;
  if (length <= 0) return [];
  const fd = fs.openSync(filePath, 'r');
  let text;
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    text = buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
  return text.split('\n').filter(Boolean).map(line => {
    try {
      return sanitizeRuntimeRow(JSON.parse(line));
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

function readJsonlHeadRows(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const length = Math.min(stat.size, maxBytes);
  if (length <= 0) return [];
  const fd = fs.openSync(filePath, 'r');
  let text;
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    text = buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
  if (length < stat.size && !text.endsWith('\n')) {
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) return [];
    text = text.slice(0, lastNewline + 1);
  }
  return text.split('\n').filter(Boolean).map(line => {
    try {
      return sanitizeRuntimeRow(JSON.parse(line));
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

function tokenValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeCodexUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tokens = {
    inputTokens: tokenValue(raw.input_tokens),
    cachedInputTokens: tokenValue(raw.cached_input_tokens),
    cacheCreationInputTokens: tokenValue(raw.cache_creation_input_tokens),
    cacheReadInputTokens: tokenValue(raw.cache_read_input_tokens),
    outputTokens: tokenValue(raw.output_tokens),
    reasoningOutputTokens: tokenValue(raw.reasoning_output_tokens),
    totalTokens: tokenValue(raw.total_tokens),
  };
  return tokens;
}

function normalizeClaudeUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cacheCreationInputTokens = tokenValue(raw.cache_creation_input_tokens);
  const cacheReadInputTokens = tokenValue(raw.cache_read_input_tokens);
  const cachedInputTokens = cacheCreationInputTokens === null && cacheReadInputTokens === null
    ? null
    : (cacheCreationInputTokens || 0) + (cacheReadInputTokens || 0);
  const tokens = {
    inputTokens: tokenValue(raw.input_tokens),
    cachedInputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    outputTokens: tokenValue(raw.output_tokens),
    reasoningOutputTokens: tokenValue(raw.reasoning_output_tokens),
    totalTokens: tokenValue(raw.total_tokens),
  };
  if (tokens.totalTokens === null) {
    tokens.totalTokens = (tokens.inputTokens || 0)
      + (tokens.cacheCreationInputTokens || 0)
      + (tokens.cacheReadInputTokens || 0)
      + (tokens.outputTokens || 0)
      + (tokens.reasoningOutputTokens || 0);
  }
  return tokens;
}

function sumTokenUsageFromList(usages) {
  const total = {};
  for (const key of USAGE_TOKEN_BUCKETS) total[key] = null;
  for (const usage of usages) {
    if (!usage) continue;
    for (const key of USAGE_TOKEN_BUCKETS) {
      if (usage[key] !== null && usage[key] !== undefined) {
        total[key] = (total[key] || 0) + usage[key];
      }
    }
  }
  if (total.totalTokens === null) return null;
  return total;
}

function subtractTokenUsage(finish, start) {
  const result = {};
  let negative = false;
  for (const key of USAGE_TOKEN_BUCKETS) {
    const finishValue = finish && finish[key] !== null && finish[key] !== undefined ? finish[key] : null;
    const startValue = start && start[key] !== null && start[key] !== undefined ? start[key] : null;
    if (finishValue === null && startValue === null) {
      result[key] = null;
    } else {
      result[key] = (finishValue || 0) - (startValue || 0);
      if (result[key] < 0) negative = true;
    }
  }
  return { result, negative };
}

function hasPositiveToken(usage) {
  return !!usage && USAGE_TOKEN_BUCKETS.some(key => typeof usage[key] === 'number' && usage[key] > 0);
}

function tokensEqual(a, b) {
  for (const key of USAGE_TOKEN_BUCKETS) {
    if ((a[key] || 0) !== (b[key] || 0)) return false;
  }
  return true;
}

function counterUnmeasured(pending, code, message, source) {
  const result = buildUnmeasuredCounterResult(pending, code, message);
  if (source) result.source = source;
  return result;
}

function measuredCounterResult(tokens, source) {
  return { status: USAGE_STATUS.MEASURED, tokens, source, warnings: [] };
}

function sourceMetadata(kind, sourcePath, discovery, candidateCount, extra = {}) {
  return { kind, path: sourcePath, discovery, candidateCount, ...extra };
}

function extractCodexCountersFromJsonl(sourcePath, startCursor, skill, source, cumulativeStartTokens) {
  const startByte = startCursor && startCursor.size ? startCursor.size : 0;
  const afterStartRows = readJsonlSlice(sourcePath, startByte, null);
  const cumulativeAfter = [];
  const afterStartUsages = [];
  const execUsages = [];
  for (const row of afterStartRows) {
    if (row.type === 'event_msg' && row.payload && row.payload.type === 'token_count' && row.payload.info) {
      if (row.payload.info.total_token_usage) cumulativeAfter.push(normalizeCodexUsage(row.payload.info.total_token_usage));
      if (row.payload.info.last_token_usage) afterStartUsages.push(normalizeCodexUsage(row.payload.info.last_token_usage));
    }
    if (row.type === 'turn.completed' && row.usage) afterStartUsages.push(normalizeCodexUsage(row.usage));
    if (row.type === 'turn.completed' && row.usage) execUsages.push(normalizeCodexUsage(row.usage));
  }

  if (execUsages.length > 0) {
    const execTotal = sumTokenUsageFromList(execUsages);
    if (execTotal && hasPositiveToken(execTotal)) return measuredCounterResult(execTotal, source);
  }

  const summedLast = sumTokenUsageFromList(afterStartUsages);
  if (cumulativeAfter.length > 0) {
    const finishSnapshot = cumulativeAfter[cumulativeAfter.length - 1];
    const startSnapshot = cumulativeStartTokens || null;
    if (!startSnapshot && startByte > 0) {
      if (summedLast && hasPositiveToken(summedLast)) {
        return measuredCounterResult(summedLast, source);
      }
      return {
        status: USAGE_STATUS.UNMEASURED,
        tokens: null,
        source,
        warnings: [{ code: USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE, message: 'Cumulative runtime counters require a bounded start snapshot, but none was captured.' }],
      };
    }
    const delta = subtractTokenUsage(finishSnapshot, startSnapshot);
    if (delta.negative) {
      return { status: USAGE_STATUS.UNMEASURED, tokens: null, source, warnings: [{ code: USAGE_WARNING_CODES.NEGATIVE_DELTA, message: 'Cumulative runtime counters decreased during this invocation.' }] };
    }
    const modelWork = !String(skill || '').startsWith('fixme-howto-');
    if (modelWork && !hasPositiveToken(delta.result) && !hasPositiveToken(summedLast)) {
      return { status: USAGE_STATUS.UNMEASURED, tokens: null, source, warnings: [{ code: USAGE_WARNING_CODES.NO_NEW_USAGE, message: 'No new runtime usage was recorded for this model-work invocation.' }] };
    }
    if (summedLast && hasPositiveToken(summedLast) && !tokensEqual(delta.result, summedLast)) {
      return { status: USAGE_STATUS.UNMEASURED, tokens: null, source, warnings: [{ code: USAGE_WARNING_CODES.COUNTER_CONFLICT, message: 'Cumulative and per-turn runtime counters disagree.' }] };
    }
    return measuredCounterResult(delta.result, source);
  }

  if (summedLast && hasPositiveToken(summedLast)) {
    return measuredCounterResult(summedLast, source);
  }

  return { status: USAGE_STATUS.UNMEASURED, tokens: null, source, warnings: [{ code: USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE, message: 'Runtime token counters were unavailable.' }] };
}

function extractClaudeCountersFromJsonl(sourcePath, startCursor, source) {
  const rows = readJsonlSlice(sourcePath, startCursor && startCursor.size ? startCursor.size : 0, null);
  const usages = rows
    .filter(row => row.message && row.message.usage)
    .map(row => normalizeClaudeUsage(row.message.usage));
  const tokens = sumTokenUsageFromList(usages);
  if (tokens && hasPositiveToken(tokens)) return measuredCounterResult(tokens, source);
  return { status: USAGE_STATUS.UNMEASURED, tokens: null, source, warnings: [{ code: USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE, message: 'Runtime token counters were unavailable.' }] };
}

function runtimeProjectMatches(row, projectRoot) {
  function normalizeProjectPath(value) {
    if (!value || typeof value !== 'string') return null;
    try {
      return fs.realpathSync(value);
    } catch (_) {
      return path.resolve(value);
    }
  }
  const expected = normalizeProjectPath(projectRoot);
  const values = [
    row.cwd,
    row.projectRoot,
    row.project_root,
    row.payload && row.payload.cwd,
    row.payload && row.payload.project_root,
    row.message && row.message.cwd,
  ].map(normalizeProjectPath).filter(Boolean);
  return values.includes(expected);
}

function runtimeAttributionMatches(row, skill) {
  return [row.agentId, row.attributionAgent, row.attributionSkill].filter(Boolean).includes(skill);
}

function discoverRuntimeCounterSources(runtime, projectRoot, skill, startedAt, finishedAt, explicitPath) {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) return { status: 'none', candidates: [] };
    const stat = fs.statSync(explicitPath);
    return { status: 'one', candidates: [{ path: explicitPath, cursor: { size: stat.size, mtimeMs: stat.mtimeMs }, discovery: 'explicit' }] };
  }

  const root = runtime === 'codex'
    ? path.join(os.homedir(), '.codex', 'sessions')
    : path.join(os.homedir(), '.claude', 'projects');
  let files;
  try {
    files = walkJsonlFiles(root);
  } catch (e) {
    return { status: 'error', candidates: [], error: e };
  }
  const candidates = [];
  const startedMs = Date.parse(startedAt || '');
  const finishedMs = Date.parse(finishedAt || '');
  const windowStart = Number.isFinite(startedMs) ? startedMs - 1000 : null;
  const windowEnd = Number.isFinite(finishedMs) ? finishedMs + 1000 : null;
  for (const filePath of files) {
    let stat;
    let rows;
    try {
      stat = fs.statSync(filePath);
      if (windowStart !== null && stat.mtimeMs < windowStart) continue;
      if (windowEnd !== null && stat.mtimeMs > windowEnd) continue;
      rows = readJsonlHeadRows(filePath, USAGE_SOURCE_DISCOVERY_SCAN_BYTES);
    } catch (_) {
      continue;
    }
    const projectMatch = rows.some(row => runtimeProjectMatches(row, projectRoot));
    if (!projectMatch) continue;
    if (runtime === 'claude' && filePath.includes(`${path.sep}subagents${path.sep}`)) {
      const attributionRow = rows.find(row => runtimeAttributionMatches(row, skill));
      if (!attributionRow) continue;
      candidates.push({ path: filePath, cursor: { size: stat.size, mtimeMs: stat.mtimeMs }, discovery: 'inferred', attributionSkill: attributionRow.attributionSkill || attributionRow.agentId || attributionRow.attributionAgent || skill });
    } else {
      candidates.push({ path: filePath, cursor: { size: stat.size, mtimeMs: stat.mtimeMs }, discovery: 'inferred' });
    }
  }

  if (runtime === 'claude') {
    const attributed = candidates.filter(candidate => candidate.attributionSkill);
    if (attributed.length === 1) return { status: 'one', candidates: attributed };
    if (attributed.length > 1) return { status: 'many', candidates: attributed };
  }

  if (candidates.length === 0) return { status: 'none', candidates: [] };
  if (candidates.length > 1) return { status: 'many', candidates };
  return { status: 'one', candidates };
}

function resolveUsageRuntime(rawRuntime, scriptPath) {
  const runtime = rawRuntime || 'auto';
  if (!USAGE_RUNTIMES.includes(runtime)) {
    const err = new Error(`Unsupported usage runtime: ${runtime}`);
    err.code = 'UNSUPPORTED_USAGE_RUNTIME';
    throw err;
  }
  if (runtime === 'claude' || runtime === 'codex') return runtime;

  const resolvedScript = path.resolve(scriptPath || '');
  const home = os.homedir();
  const codexRoot = path.join(home, '.codex', 'skills') + path.sep;
  const claudeRoot = path.join(home, '.claude', 'skills') + path.sep;
  if (resolvedScript.startsWith(codexRoot)) return 'codex';
  if (resolvedScript.startsWith(claudeRoot)) return 'claude';

  const err = new Error('usage runtime auto cannot be resolved from this script path; pass --runtime claude or --runtime codex');
  err.code = 'AUTO_RUNTIME_UNRESOLVED';
  throw err;
}

function usageCliError(code, message, extra = {}) {
  process.stdout.write(JSON.stringify({ error: message, code, ...extra }) + '\n');
  process.exit(1);
}

function usageCliResult(data, exitCode = 0) {
  if (typeof data === 'string') {
    process.stdout.write(JSON.stringify(data) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
  process.exit(exitCode);
}

function usageStart(flags, fixmeRoot) {
  if (Object.prototype.hasOwnProperty.call(flags, 'task')) {
    return usageCliError('UNSUPPORTED_USAGE_TASK', '--task is reserved for a future usage schema and is not supported in v1');
  }
  if (!flags.skill) {
    return usageCliError('MISSING_USAGE_SKILL', '--skill is required for usage start');
  }

  const role = flags.role || 'skill';
  if (!USAGE_ROLES.includes(role)) {
    return usageCliError('UNSUPPORTED_USAGE_ROLE', `Unsupported usage role: ${role}`);
  }

  let runtime;
  try {
    runtime = resolveUsageRuntime(flags.runtime || 'auto', process.argv[1]);
  } catch (e) {
    return usageCliError(e.code || 'USAGE_RUNTIME_ERROR', e.message);
  }

  const fixmeDir = flags['fixme-dir'] ? path.resolve(flags['fixme-dir']) : path.join(fixmeRoot, '.fixme');
  const projectRoot = flags['project-root'] ? path.resolve(flags['project-root']) : path.dirname(fixmeDir);
  if (!path.isAbsolute(fixmeDir) || !path.isAbsolute(projectRoot)) {
    return usageCliError('INVALID_USAGE_PATH', '--fixme-dir and --project-root must resolve to absolute paths');
  }

  let pipelineRunId;
  let parentInvocationId;
  try {
    pipelineRunId = validateUsageId(flags['pipeline-run-id'], 'pipelineRunId');
    parentInvocationId = validateUsageId(flags['parent-invocation-id'], 'parentInvocationId');
  } catch (e) {
    return usageCliError(e.code || 'INVALID_USAGE_ID', e.message);
  }

  const invocationId = generateUsageId('usage');
  if (!pipelineRunId && flags.skill === 'fixme-task' && role === 'orchestrator') {
    pipelineRunId = invocationId;
  }

  const startedAt = new Date().toISOString();
  const pendingPath = path.join(usagePendingDir(fixmeDir), `${invocationId}.json`);
  const pending = {
    schemaVersion: 1,
    invocationId,
    pipelineRunId,
    parentInvocationId,
    skill: flags.skill,
    role,
    runtime,
    startedAt,
    projectRoot,
    fixmeDir,
    sourceSnapshot: captureSourceSnapshot(runtime, flags['source-path'], projectRoot, flags.skill, startedAt),
    finalizedEvent: null,
    appendState: {
      projectWritten: false,
      globalWritten: false,
    },
  };

  writeJsonAtomic(pendingPath, pending);

  return output({
    invocationId,
    pipelineRunId,
    pendingPath,
    runtime,
    startedAt,
    finishCommand: `node "${process.argv[1]}" usage finish --invocation-id ${invocationId} --outcome complete`,
  });
}

function validateOutcomeAndReason(outcome, rawReason) {
  if (!USAGE_OUTCOMES.includes(outcome)) {
    return { ok: false, code: 'INVALID_OUTCOME', message: `Unsupported usage outcome: ${outcome}` };
  }
  const hasReason = rawReason !== undefined && rawReason !== true;
  const reason = hasReason ? String(rawReason).trim() : '';
  if (outcome === 'complete') {
    if (hasReason) {
      return { ok: false, code: 'INVALID_REASON', message: '--reason is forbidden when --outcome complete' };
    }
    return { ok: true, outcome, outcomeReason: null };
  }
  if (!reason || !USAGE_REASON_VALUES.includes(reason)) {
    return { ok: false, code: 'INVALID_REASON', message: `--reason is required and must be one of: ${USAGE_REASON_VALUES.join(', ')}` };
  }
  return { ok: true, outcome, outcomeReason: reason };
}

function findPendingPath(invocationId, fixmeRoot) {
  const id = validateUsageId(invocationId, 'invocationId');
  if (!id) {
    const err = new Error('--invocation-id is required');
    err.code = 'MISSING_INVOCATION_ID';
    throw err;
  }
  return path.join(usagePendingDir(path.join(fixmeRoot, '.fixme')), `${id}.json`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function eventsEqual(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

function readUsageRowsForInvocation(eventPath, invocationId) {
  if (!fs.existsSync(eventPath)) return [];
  const text = fs.readFileSync(eventPath, 'utf8');
  return text.split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(row => row && row.invocationId === invocationId);
}

function destinationState(eventPath, finalizedEvent) {
  const rows = readUsageRowsForInvocation(eventPath, finalizedEvent.invocationId);
  if (rows.length === 0) return 'missing';
  if (rows.some(row => !eventsEqual(row, finalizedEvent))) return 'conflict';
  return 'same';
}

function appendUsageEvent(eventPath, finalizedEvent) {
  fs.mkdirSync(path.dirname(eventPath), { recursive: true });
  const fd = fs.openSync(eventPath, 'a');
  try {
    fs.writeSync(fd, JSON.stringify(finalizedEvent) + '\n');
  } finally {
    fs.closeSync(fd);
  }
}

function buildUnmeasuredCounterResult(pending, warningCode, message) {
  return {
    status: USAGE_STATUS.UNMEASURED,
    tokens: null,
    source: pending.sourceSnapshot && pending.sourceSnapshot.source
      ? pending.sourceSnapshot.source
      : { kind: `${pending.runtime}_jsonl`, path: null, discovery: 'unavailable' },
    warnings: [{ code: warningCode, message }],
  };
}

function resolveUsageCounters(pending) {
  const finishedAt = new Date().toISOString();
  const explicitPath = pending.sourceSnapshot && pending.sourceSnapshot.explicitPath
    ? pending.sourceSnapshot.explicitPath
    : explicitUsageSourcePath(pending.runtime, null);
  const persistedSource = pending.sourceSnapshot && pending.sourceSnapshot.source && pending.sourceSnapshot.source.path
    ? pending.sourceSnapshot.source
    : null;
  let discovery;
  if (!explicitPath && persistedSource) {
    if (fs.existsSync(persistedSource.path)) {
      const stat = fs.statSync(persistedSource.path);
      discovery = {
        status: 'one',
        candidates: [{
          path: persistedSource.path,
          cursor: { size: stat.size, mtimeMs: stat.mtimeMs },
          discovery: persistedSource.discovery || 'inferred',
          attributionSkill: persistedSource.attributionSkill,
        }],
      };
    } else {
      discovery = { status: 'none', candidates: [] };
    }
  } else {
    discovery = discoverRuntimeCounterSources(
      pending.runtime,
      pending.projectRoot,
      pending.skill,
      pending.startedAt,
      finishedAt,
      explicitPath
    );
  }
  const kind = `${pending.runtime}_jsonl`;
  if (discovery.status === 'error') {
    return counterUnmeasured(
      pending,
      USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE,
      `Runtime counter source discovery failed: ${discovery.error.message}`,
      sourceMetadata(kind, null, 'error', 0)
    );
  }
  if (discovery.status === 'none') {
    return counterUnmeasured(
      pending,
      USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE,
      'Runtime token counters were unavailable; this invocation is not included in total usage.',
      sourceMetadata(kind, null, 'none', 0)
    );
  }
  if (discovery.status === 'many') {
    return counterUnmeasured(
      pending,
      USAGE_WARNING_CODES.AMBIGUOUS_COUNTER_SOURCE,
      'Multiple runtime counter sources matched this invocation; no source was guessed.',
      sourceMetadata(kind, null, 'inferred', discovery.candidates.length)
    );
  }

  const candidate = discovery.candidates[0];
  const startCursor = pending.sourceSnapshot && pending.sourceSnapshot.cursor && pending.sourceSnapshot.cursor.path === candidate.path
    ? pending.sourceSnapshot.cursor
    : { ...candidate.cursor, size: 0 };
  const source = sourceMetadata(kind, candidate.path, candidate.discovery, 1, candidate.attributionSkill ? { attributionSkill: candidate.attributionSkill } : {});
  try {
    if (pending.runtime === 'codex') {
      const startTokens = pending.sourceSnapshot && pending.sourceSnapshot.cursor && pending.sourceSnapshot.cursor.path === candidate.path
        ? pending.sourceSnapshot.codexCumulativeStartTokens
        : null;
      return extractCodexCountersFromJsonl(candidate.path, startCursor, pending.skill, source, startTokens);
    }
    if (pending.runtime === 'claude') {
      return extractClaudeCountersFromJsonl(candidate.path, startCursor, source);
    }
  } catch (e) {
    return counterUnmeasured(pending, USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE, `Runtime counter extraction failed: ${e.message}`, source);
  }
  return counterUnmeasured(pending, USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE, 'Runtime token counters were unavailable.', source);
}

function buildFinalizedUsageEvent(pending, outcomeResult, counterResult) {
  const finishedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    eventType: 'skill_invocation',
    eventId: generateUsageId('event'),
    invocationId: pending.invocationId,
    parentInvocationId: pending.parentInvocationId,
    pipelineRunId: pending.pipelineRunId,
    skill: pending.skill,
    role: pending.role,
    runtime: pending.runtime,
    status: counterResult.status,
    outcome: outcomeResult.outcome,
    outcomeReason: outcomeResult.outcomeReason,
    startedAt: pending.startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(pending.startedAt)),
    projectRoot: pending.projectRoot,
    fixmeDir: pending.fixmeDir,
    tokens: counterResult.tokens,
    cost: null,
    source: counterResult.source,
    warnings: counterResult.warnings || [],
  };
}

function usagePrintAfterFinish(fixmeRoot) {
  try {
    const { config } = readConfigForWrite(fixmeRoot);
    applyConfigMigration(config, configPathForRoot(fixmeRoot));
    return config.usage.printAfterFinish !== false;
  } catch (_) {
    return true;
  }
}

function usageFinish(flags, fixmeRoot) {
  if (!flags['invocation-id']) {
    return usageCliError('MISSING_INVOCATION_ID', '--invocation-id is required for usage finish');
  }
  if (!flags.outcome) {
    return usageCliError('MISSING_OUTCOME', '--outcome is required for usage finish');
  }

  let pendingPath;
  try {
    pendingPath = findPendingPath(flags['invocation-id'], fixmeRoot);
  } catch (e) {
    return usageCliError(e.code || 'INVALID_USAGE_ID', e.message);
  }
  if (!fs.existsSync(pendingPath)) {
    return usageCliError('PENDING_USAGE_NOT_FOUND', `Pending usage invocation not found: ${flags['invocation-id']}`);
  }

  const pending = readJsonFileStrict(pendingPath);
  const outcomeResult = validateOutcomeAndReason(flags.outcome, flags.reason);
  if (!outcomeResult.ok) {
    return usageCliError(outcomeResult.code, outcomeResult.message);
  }

  let finalizedEvent = pending.finalizedEvent;
  if (!finalizedEvent) {
    const counterResult = resolveUsageCounters(pending);
    finalizedEvent = buildFinalizedUsageEvent(pending, outcomeResult, counterResult);
    pending.finalizedEvent = finalizedEvent;
    writeJsonAtomic(pendingPath, pending);
  }

  const projectEventPath = usageProjectEventPath(pending.fixmeDir);
  const globalEventPath = usageGlobalEventPath();

  let projectState;
  let globalState;
  try {
    projectState = destinationState(projectEventPath, finalizedEvent);
    globalState = destinationState(globalEventPath, finalizedEvent);
  } catch (e) {
    return usageCliError('DESTINATION_READ_FAILED', e.message);
  }

  if (projectState === 'conflict' || globalState === 'conflict') {
    return usageCliError('DESTINATION_EVENT_CONFLICT', 'A usage destination already contains a different event for this invocation');
  }

  try {
    if (projectState === 'missing') {
      appendUsageEvent(projectEventPath, finalizedEvent);
    }
    pending.appendState.projectWritten = true;
    writeJsonAtomic(pendingPath, pending);
  } catch (e) {
    return usageCliError(USAGE_WARNING_CODES.DESTINATION_APPEND_FAILED, `Failed to append project usage event: ${e.message}`);
  }

  try {
    if (globalState === 'missing') {
      appendUsageEvent(globalEventPath, finalizedEvent);
    }
    pending.appendState.globalWritten = true;
    writeJsonAtomic(pendingPath, pending);
  } catch (e) {
    return usageCliError(USAGE_WARNING_CODES.DESTINATION_APPEND_FAILED, `Failed to append global usage event: ${e.message}`, {
      warnings: [{ code: USAGE_WARNING_CODES.DESTINATION_APPEND_FAILED, message: 'Project usage was written, but global usage is incomplete.' }],
    });
  }

  fs.rmSync(pendingPath, { force: true });

  const suppressed = flags.quiet === true || flags.quiet === '' || !usagePrintAfterFinish(fixmeRoot);
  const reportLine = suppressed ? null : buildCompactUsageReportLine(finalizedEvent, projectEventPath);
  return usageCliResult({
    eventId: finalizedEvent.eventId,
    invocationId: finalizedEvent.invocationId,
    status: finalizedEvent.status,
    outcome: finalizedEvent.outcome,
    outcomeReason: finalizedEvent.outcomeReason,
    projectEventPath,
    globalEventPath,
    reportLine,
    reportLineSuppressed: suppressed,
    warnings: finalizedEvent.warnings,
  });
}

function emptyTokenUsage() {
  const usage = {};
  for (const key of USAGE_TOKEN_BUCKETS) usage[key] = 0;
  return usage;
}

function addTokenUsage(total, tokens) {
  if (!tokens) return total;
  for (const key of USAGE_TOKEN_BUCKETS) {
    if (typeof tokens[key] === 'number' && Number.isFinite(tokens[key])) {
      total[key] += tokens[key];
    }
  }
  return total;
}

function formatTokenCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function normalizeUsageStatus(status) {
  if (status === USAGE_STATUS.LEGACY_PARTIAL) return USAGE_STATUS.UNMEASURED;
  if (status === USAGE_STATUS.LEGACY_COMPLETE) return USAGE_STATUS.MEASURED;
  return status;
}

function normalizeUsageRowForReport(row) {
  const status = normalizeUsageStatus(row.status);
  return status === row.status ? row : { ...row, status };
}

function isMeasuredUsageRow(row) {
  return normalizeUsageStatus(row.status) === USAGE_STATUS.MEASURED && !!row.tokens;
}

function usageSummaryRow(event) {
  const normalizedEvent = normalizeUsageRowForReport(event);
  return {
    eventId: normalizedEvent.eventId,
    invocationId: normalizedEvent.invocationId,
    skill: normalizedEvent.skill,
    role: normalizedEvent.role,
    runtime: normalizedEvent.runtime,
    status: normalizedEvent.status,
    outcome: normalizedEvent.outcome,
    outcomeReason: normalizedEvent.outcomeReason,
    startedAt: normalizedEvent.startedAt,
    finishedAt: normalizedEvent.finishedAt,
    durationMs: normalizedEvent.durationMs,
    pipelineRunId: normalizedEvent.pipelineRunId,
    parentInvocationId: normalizedEvent.parentInvocationId,
    totalTokens: normalizedEvent.tokens && typeof normalizedEvent.tokens.totalTokens === 'number' ? normalizedEvent.tokens.totalTokens : null,
    warningCodes: (normalizedEvent.warnings || []).map(warning => warning.code).filter(Boolean),
  };
}

function parseUsageDateBound(raw, boundName) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid ${boundName}: ${raw}`);
    }
    if (boundName === 'until') {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return date.getTime();
  }
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const time = Date.parse(normalized);
  if (Number.isNaN(time)) {
    throw new Error(`Invalid ${boundName}: ${raw}`);
  }
  return time;
}

function readUsageEventFile(eventPath) {
  if (!fs.existsSync(eventPath)) return { rows: [], warnings: [] };
  const text = fs.readFileSync(eventPath, 'utf8');
  const lines = text.split('\n');
  const rows = [];
  const warnings = [];
  const endsWithNewline = text.endsWith('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (e) {
      const code = (!endsWithNewline && i === lines.length - 1)
        ? USAGE_WARNING_CODES.TRAILING_INCOMPLETE_LINE
        : USAGE_WARNING_CODES.CORRUPT_JSONL_LINE;
      warnings.push({ code, message: `${code} in ${eventPath} at line ${i + 1}` });
    }
  }
  return { rows, warnings };
}

function filterUsageRows(rows, filters) {
  return rows.filter(row => {
    if (filters.skill && row.skill !== filters.skill) return false;
    if (filters.pipelineRunId && row.pipelineRunId !== filters.pipelineRunId) return false;
    const finished = Date.parse(row.finishedAt || '');
    if (filters.since !== null && (!Number.isFinite(finished) || finished < filters.since)) return false;
    if (filters.until !== null && (!Number.isFinite(finished) || finished >= filters.until)) return false;
    return true;
  });
}

function normalizeUsageRows(rows) {
  const byInvocation = new Map();
  for (const row of rows) {
    if (!row || !row.invocationId) continue;
    if (!byInvocation.has(row.invocationId)) byInvocation.set(row.invocationId, []);
    byInvocation.get(row.invocationId).push(row);
  }

  const normalized = [];
  const conflicts = [];
  for (const [invocationId, group] of byInvocation.entries()) {
    const first = group[0];
    if (group.every(row => eventsEqual(row, first))) {
      normalized.push(first);
    } else {
      conflicts.push({
        invocationId,
        rows: group,
        eventIds: group.map(row => row.eventId).filter(Boolean),
      });
    }
  }
  return { rows: normalized, conflicts };
}

function warningSummaryFromWarnings(warnings) {
  const counts = new Map();
  for (const warning of warnings) {
    if (!warning || !warning.code) continue;
    if (!counts.has(warning.code)) counts.set(warning.code, { code: warning.code, count: 0, eventIds: [] });
    const item = counts.get(warning.code);
    item.count += warning.count || 1;
    for (const eventId of warning.eventIds || (warning.eventId ? [warning.eventId] : [])) {
      if (eventId && !item.eventIds.includes(eventId)) item.eventIds.push(eventId);
    }
  }
  return [...counts.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function buildUsageReport({ scope, eventPath, rows, fileWarnings, filters, limit }) {
  const filtered = filterUsageRows(rows, filters);
  const normalized = normalizeUsageRows(filtered);
  const reportRows = normalized.rows.map(normalizeUsageRowForReport);
  const totalUsage = emptyTokenUsage();
  const notIncludedEventIds = [];
  const warningEvents = [...fileWarnings];
  const completeRows = [];

  for (const conflict of normalized.conflicts) {
    notIncludedEventIds.push(...conflict.eventIds);
    warningEvents.push({
      code: USAGE_WARNING_CODES.DUPLICATE_INVOCATION_CONFLICT,
      count: 1,
      eventIds: conflict.eventIds,
      message: `Conflicting duplicate usage rows for ${conflict.invocationId}`,
    });
  }

  for (const row of reportRows) {
    for (const warning of row.warnings || []) warningEvents.push({ ...warning, eventId: row.eventId });
    if (isMeasuredUsageRow(row)) {
      addTokenUsage(totalUsage, row.tokens);
      completeRows.push(row);
    } else {
      notIncludedEventIds.push(row.eventId);
    }
  }

  function newGroup(keyName, keyValue) {
    return {
      [keyName]: keyValue,
      invocationCount: 0,
      measuredCount: 0,
      unmeasuredCount: 0,
      totalUsage: emptyTokenUsage(),
      notIncludedInTotal: { invocationCount: 0, eventIds: [] },
      warningSummary: [],
    };
  }

  function addGroupWarning(group, warning) {
    group.warningSummary = warningSummaryFromWarnings([
      ...group.warningSummary.flatMap(item => [{ code: item.code, count: item.count, eventIds: item.eventIds }]),
      warning,
    ]);
  }

  const bySkillMap = new Map();
  function groupForSkill(skill) {
    if (!bySkillMap.has(skill)) {
      bySkillMap.set(skill, newGroup('skill', skill));
    }
    return bySkillMap.get(skill);
  }

  const byPipelineMap = new Map();
  function groupForPipeline(pipelineRunId) {
    if (!pipelineRunId) return null;
    if (!byPipelineMap.has(pipelineRunId)) {
      byPipelineMap.set(pipelineRunId, {
        ...newGroup('pipelineRunId', pipelineRunId),
        orchestratorUsage: emptyTokenUsage(),
        childUsage: emptyTokenUsage(),
      });
    }
    return byPipelineMap.get(pipelineRunId);
  }

  function addRowToGroup(item, row) {
    if (!item) return;
    item.invocationCount++;
    if (isMeasuredUsageRow(row)) {
      item.measuredCount++;
      addTokenUsage(item.totalUsage, row.tokens);
      if (Object.prototype.hasOwnProperty.call(item, 'orchestratorUsage')) {
        addTokenUsage(row.role === 'orchestrator' ? item.orchestratorUsage : item.childUsage, row.tokens);
      }
    } else {
      item.unmeasuredCount++;
      item.notIncludedInTotal.invocationCount++;
      if (row.eventId) item.notIncludedInTotal.eventIds.push(row.eventId);
    }
    for (const warning of row.warnings || []) {
      addGroupWarning(item, { ...warning, eventId: row.eventId });
    }
  }

  for (const row of reportRows) {
    addRowToGroup(groupForSkill(row.skill), row);
    addRowToGroup(groupForPipeline(row.pipelineRunId), row);
  }

  for (const conflict of normalized.conflicts) {
    const first = conflict.rows[0] || {};
    const groups = [groupForSkill(first.skill), groupForPipeline(first.pipelineRunId)].filter(Boolean);
    for (const item of groups) {
      item.notIncludedInTotal.invocationCount++;
      for (const eventId of conflict.eventIds) {
        if (eventId) item.notIncludedInTotal.eventIds.push(eventId);
      }
      addGroupWarning(item, {
        code: USAGE_WARNING_CODES.DUPLICATE_INVOCATION_CONFLICT,
        count: 1,
        eventIds: conflict.eventIds,
      });
    }
  }

  const recent = reportRows
    .slice()
    .sort((a, b) => Date.parse(b.finishedAt || '') - Date.parse(a.finishedAt || ''))
    .slice(0, limit || 20)
    .map(usageSummaryRow);

  return {
    schemaVersion: 1,
    scope,
    eventPath,
    filters: {
      skill: filters.skill || null,
      pipelineRunId: filters.pipelineRunId || null,
    },
    totalUsage,
    notIncludedInTotal: {
      invocationCount: new Set(notIncludedEventIds.filter(Boolean).map(eventId => {
        const row = [...reportRows, ...filtered].find(item => item.eventId === eventId);
        return row ? row.invocationId : eventId;
      })).size,
      eventIds: [...new Set(notIncludedEventIds.filter(Boolean))],
    },
    bySkill: [...bySkillMap.values()].sort((a, b) => a.skill.localeCompare(b.skill)),
    byPipeline: [...byPipelineMap.values()].sort((a, b) => a.pipelineRunId.localeCompare(b.pipelineRunId)),
    recent,
    warnings: warningEvents,
    warningSummary: warningSummaryFromWarnings(warningEvents),
  };
}

function formatUsageReportText(report) {
  const lines = [
    `Total usage: ${formatTokenCount(report.totalUsage.totalTokens)} tokens`,
  ];
  if (report.notIncludedInTotal.invocationCount > 0) {
    const plural = report.notIncludedInTotal.invocationCount === 1 ? 'invocation' : 'invocations';
    const warningCodes = report.warningSummary.map(warning => warning.code);
    if (warningCodes.includes(USAGE_WARNING_CODES.DUPLICATE_INVOCATION_CONFLICT)) {
      lines.push(`Not included in total: ${report.notIncludedInTotal.invocationCount} ${plural}`);
      lines.push(`Warnings: ${warningCodes.join(', ')}`);
    } else {
      lines.push(`Not included in total: ${report.notIncludedInTotal.invocationCount} ${plural} with unavailable exact counters`);
    }
  }
  return lines.join('\n');
}

function usageReport(flags, fixmeRoot) {
  const scope = flags.scope || 'project';
  const format = flags.format || 'json';
  if (!['project', 'global'].includes(scope)) {
    return usageCliError('INVALID_USAGE_SCOPE', '--scope must be project or global');
  }
  if (!['json', 'text'].includes(format)) {
    return usageCliError('INVALID_USAGE_FORMAT', '--format must be json or text');
  }

  let since = null;
  let until = null;
  try {
    since = parseUsageDateBound(flags.since, 'since');
    until = parseUsageDateBound(flags.until, 'until');
  } catch (e) {
    return usageCliError('INVALID_USAGE_DATE', e.message);
  }

  const limit = flags.limit === undefined ? 20 : Number(flags.limit);
  if (!Number.isInteger(limit) || limit <= 0) {
    return usageCliError('INVALID_USAGE_LIMIT', '--limit must be a positive integer');
  }

  const eventPath = scope === 'project'
    ? usageProjectEventPath(path.join(fixmeRoot, '.fixme'))
    : usageGlobalEventPath();
  const file = readUsageEventFile(eventPath);
  const report = buildUsageReport({
    scope,
    eventPath,
    rows: file.rows,
    fileWarnings: file.warnings,
    filters: {
      since,
      until,
      skill: flags.skill || null,
      pipelineRunId: flags['pipeline-run-id'] || null,
    },
    limit,
  });

  return usageCliResult(format === 'text' ? formatUsageReportText(report) : report);
}

function buildCompactUsageReportLine(event, projectEventPath) {
  const file = readUsageEventFile(projectEventPath);
  const projectReport = buildUsageReport({
    scope: 'project',
    eventPath: projectEventPath,
    rows: file.rows,
    fileWarnings: file.warnings,
    filters: { since: null, until: null, skill: null, pipelineRunId: null },
    limit: 20,
  });
  const pipelineReport = event.pipelineRunId ? buildUsageReport({
    scope: 'project',
    eventPath: projectEventPath,
    rows: file.rows,
    fileWarnings: file.warnings,
    filters: { since: null, until: null, skill: null, pipelineRunId: event.pipelineRunId },
    limit: 20,
  }) : null;
  if (isMeasuredUsageRow(event)) {
    const base = `Usage: ${event.skill} +${formatTokenCount(event.tokens.totalTokens)} tokens`;
    if (pipelineReport) {
      return `${base} | pipeline total ${formatTokenCount(pipelineReport.totalUsage.totalTokens)} tokens | project total ${formatTokenCount(projectReport.totalUsage.totalTokens)} tokens`;
    }
    return `${base} | project total ${formatTokenCount(projectReport.totalUsage.totalTokens)} tokens`;
  }
  const notIncluded = pipelineReport
    ? pipelineReport.notIncludedInTotal.invocationCount
    : projectReport.notIncludedInTotal.invocationCount;
  if (pipelineReport) {
    return `Usage: ${event.skill} unavailable | pipeline total ${formatTokenCount(pipelineReport.totalUsage.totalTokens)} tokens | project total ${formatTokenCount(projectReport.totalUsage.totalTokens)} tokens | not included: ${notIncluded} invocation(s)`;
  }
  return `Usage: ${event.skill} unavailable | project total ${formatTokenCount(projectReport.totalUsage.totalTokens)} tokens | not included: ${notIncluded} invocation(s)`;
}

// ============================================================================
// Output Helpers
// ============================================================================

class CliJsonError extends Error {
  constructor(payload) {
    super(payload && payload.error ? payload.error : 'cli_json_error');
    this.payload = payload;
  }
}

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

function errorPayload(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
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
          case 'soft' + 'ness':
            return error("Unsupported config subcommand. Use `config review-level resolve`.");
          case 'review-level':
            switch (args[0]) {
              case 'resolve':
                return configReviewLevelResolve(flags, fixmeRoot);
              default:
                return error(`Unknown config review-level subcommand: '${args[0] || ''}'. Valid: resolve`);
            }
          default:
            return error(`Unknown config subcommand: '${subcommand}'. Valid: ensure, migrate, get, set, workflow, review-level`);
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

      case 'claude-skills':
        switch (subcommand) {
          case 'install':
            return claudeSkillsInstall(flags);
          default:
            return error(`Unknown claude-skills subcommand: '${subcommand}'. Valid: install`);
        }

      case 'usage':
        switch (subcommand) {
          case 'start':
            return usageStart(flags, fixmeRoot);
          case 'finish':
            return usageFinish(flags, fixmeRoot);
          case 'report':
            return usageReport(flags, fixmeRoot);
          default:
            return usageCliError('UNKNOWN_USAGE_SUBCOMMAND', `Unknown usage subcommand: '${subcommand}'. Valid: start`);
        }

      case 'root':
        return rootCommand();

      case 'alert': {
        if (subcommand === '--list-sounds') {
          return output(listAlertSounds());
        }
        const event = subcommand;
        if (!event) {
          return error('Usage: fixme-tools.cjs alert <event> [--resolve]\n  Events: user_input, task_finished, task_failed');
        }
        const resolveOnly = flags.resolve === true || flags.resolve === '';
        const result = runAlert(event, fixmeRoot, { resolveOnly });
        // Unknown event is a usage error; other disabled states (alerts disabled,
        // unsupported platform) are legitimate no-ops and exit cleanly.
        if (!result.enabled && result.reason && /^unknown event/.test(result.reason)) {
          return error(result.reason);
        }
        return output(result);
      }

      case 'resolve-model': {
        // subcommand slot holds the agent name for this single-arg command
        const agentName = subcommand;
        if (!agentName) {
          return error('Usage: fixme-tools.cjs resolve-model <agent-name>');
        }
        return output(resolveModel(agentName, fixmeRoot, { runtime: flags.runtime }));
      }

      default:
        return error(`Unknown command: '${command}'. Valid: ticket, session, context, config, codex-agents, codex-skills, claude-skills, usage, root, resolve-model, alert`);
    }
  } catch (e) {
    if (e instanceof CliJsonError) {
      return errorPayload(e.payload);
    }
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
  resolveAlert,
  MODEL_PROFILES,
  STANDARD_PIPELINES,
  applyConfigMigration,
  generateCodexAgentToml,
  mergeFixmeCodexConfig,
  installCodexAgents,
  convertCodexSkillMarkdown,
  convertClaudeSkillMarkdown,
  installCodexSkills,
  installClaudeSkills,
  defaultReviewCyclesForPhase,
  normalizeWorkflowName,
  resolveReviewLevel,
};
