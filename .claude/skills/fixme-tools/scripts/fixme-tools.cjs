#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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
const REMOVED_WORKFLOW_NAMES = Object.freeze(['default', 'plan', 'execute', 'idea-to-production']);
const OBSOLETE_REVIEW_KEYS = Object.freeze(['softness', 'mode']);
const REVIEW_LEVELS = Object.freeze(['strict', 'standard', 'lenient', 'fast-track', 'critical']);
const VALID_REVIEW_LEVELS = new Set(REVIEW_LEVELS);
const VALID_MODEL_PROFILES = new Set(['quality', 'balanced', 'budget', 'inherit']);
const VALID_MODEL_VALUES = new Set(['opus', 'sonnet', 'haiku', 'inherit']);
const VALID_RUNTIME_VALUES = new Set(['claude', 'codex']);
const VALID_TICKET_BACKENDS = new Set(['fixme-tickets-md']);
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

const KNOWN_FIXME_AGENTS = new Set([
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
  'fixme-write-plan',
  'fixme-write-product-spec',
  'fixme-write-technical-spec',
]);

const RESUMABLE_PRODUCER_AGENTS = new Set([
  'fixme-write-product-spec',
  'fixme-write-technical-spec',
  'fixme-write-plan',
  'fixme-execute-plan',
]);

const PRODUCER_CONTINUATION_STATUSES = new Set(['available', 'bad']);
const RUNTIME_HANDLE_KINDS_BY_RUNTIME = Object.freeze({
  codex: 'codexAgentId',
  claude: 'claudeAgentId',
});

const RUN_STATES = Object.freeze(['running', 'waiting', 'blocked', 'completed', 'failed']);
const RUN_CHECKPOINTS = Object.freeze(['dispatched', 'started', 'working', 'waiting', 'finalizing', 'done']);
const RUN_ATTENTION_ANSWER_MODES = Object.freeze(['freeform', 'decision-card', 'multiple-choice']);
const RUN_ATTENTION_ANSWER_KINDS = Object.freeze(['decision', 'clarificationRequest']);
const RUN_ATTENTION_RECORD_STATUSES = Object.freeze(['waiting', 'answered']);
const RUN_STATUS_FIELDS = new Set([
  'schemaVersion',
  'statusId',
  'agent',
  'state',
  'checkpoint',
  'currentCommand',
  'failure',
  'updatedAt',
]);
const RUN_ATTENTION_RECORD_FIELDS = new Set([
  'attentionId',
  'ownerSkill',
  'sourceSkill',
  'parentSkill',
  'kind',
  'resumeRef',
  'taskStatePath',
  'promptMarkdown',
  'answerMode',
  'metadata',
  'status',
  'answer',
  'createdAt',
  'answeredAt',
]);
const RUN_ATTENTION_ANSWER_FIELDS = new Set([
  'answer',
  'answeredBy',
  'answerKind',
]);

const USAGE_RUNTIMES = Object.freeze(['claude', 'codex', 'auto']);
const USAGE_ROLES = Object.freeze(['skill', 'orchestrator', 'reviewer', 'handler', 'reporter', 'reference']);
const USAGE_OUTCOMES = Object.freeze(['complete', 'failed', 'aborted']);
const USAGE_STATUS = Object.freeze({
  MEASURED: 'measured',
  UNMEASURED: 'unmeasured',
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
  UNSUPPORTED_USAGE_STATUS: 'UNSUPPORTED_USAGE_STATUS',
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

function realpathOrResolve(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch (_) {
    return path.resolve(filePath || '');
  }
}

function inferInstalledRuntimeFromPath(scriptPath) {
  const resolvedScript = realpathOrResolve(scriptPath);
  const homes = [...new Set([os.homedir(), process.env.HOME].filter(Boolean).map(home => realpathOrResolve(home)))];
  for (const home of homes) {
    const codexRoot = path.join(home, '.codex', 'skills') + path.sep;
    const claudeRoot = path.join(home, '.claude', 'skills') + path.sep;
    if (resolvedScript.startsWith(codexRoot)) return 'codex';
    if (resolvedScript.startsWith(claudeRoot)) return 'claude';
  }
  return null;
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
  if (!isPlainObject(config)) {
    return applyRuntimeSettings(result, agentName, DEFAULT_MODEL);
  }
  assertNoObsoleteConfigKeys(config, configPath);

  const models = isPlainObject(config.models) ? config.models : null;
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
 * Parse an inline object like { from: queued, to: plan, timestamp: "2026-...", reason: null }
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
    'queued': phases[0] ? [phases[0], 'skipped', 'failed'] : ['skipped', 'failed'],
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
 * 1. If startDir is a Codex-linked git worktree, resolve via the primary checkout
 *    so shared workspace .fixme/ state wins over stale worktree-local state
 * 2. If startDir has .fixme/ -> return startDir (local takes priority)
 * 3. Walk up ancestors looking for a parent with .fixme/:
 *    a. If parent .fixme/config.json has subRepos and startDir matches -> return parent
 *    b. If startDir (or any dir between startDir and parent) has .git -> return parent
 * 4. Never go above $HOME or filesystem root
 * 5. Fallback: return startDir
 */
function findFixmeRoot(startDir) {
  const codexLinkedRoot = findCodexLinkedWorktreeFixmeRoot(startDir);
  if (codexLinkedRoot) {
    return codexLinkedRoot;
  }
  return findFixmeRootFromFilesystem(startDir);
}

function findFixmeRootFromFilesystem(startDir) {
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
      // Check config.json for subRepos.
      const configPath = path.join(parentFixme, 'config.json');
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (isPlainObject(config) && Object.prototype.hasOwnProperty.call(config, 'sub_repos')) {
          throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: 'sub_repos' });
        }
        const subRepos = isPlainObject(config) ? (config.subRepos || []) : [];

        if (Array.isArray(subRepos) && subRepos.length > 0) {
          const relPath = path.relative(parent, resolved);
          const topSegment = relPath.split(path.sep)[0];
          if (subRepos.includes(topSegment)) {
            return parent;
          }
        }
      } catch (error) {
        if (error instanceof CliJsonError) {
          throw error;
        }
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

function findCodexLinkedWorktreeFixmeRoot(startDir) {
  const resolved = path.resolve(startDir);
  const codexWorktreesRoot = path.join(os.homedir(), '.codex', 'worktrees');
  if (!isPathInside(resolved, codexWorktreesRoot)) {
    return null;
  }

  const linkedWorktree = findLinkedWorktreePrimaryRoot(resolved);
  if (!linkedWorktree) {
    return null;
  }

  const relativePath = path.relative(linkedWorktree.worktreeRoot, resolved);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  const primaryStartDir = path.join(linkedWorktree.primaryRoot, relativePath);
  const canonicalRoot = findFixmeRootFromFilesystem(primaryStartDir);
  return directoryExists(path.join(canonicalRoot, '.fixme')) ? canonicalRoot : null;
}

function findLinkedWorktreePrimaryRoot(startDir) {
  const linkedGitFile = findContainingLinkedGitFile(startDir);
  if (!linkedGitFile) {
    return null;
  }

  const gitDir = readGitFileDirectory(linkedGitFile.gitFilePath);
  if (!gitDir) {
    return null;
  }

  const commonGitDir = readCommonGitDirectory(gitDir);
  if (!commonGitDir || path.basename(commonGitDir) !== '.git') {
    return null;
  }

  const primaryRoot = path.dirname(commonGitDir);
  if (primaryRoot === linkedGitFile.worktreeRoot || !directoryExists(commonGitDir)) {
    return null;
  }

  return {
    worktreeRoot: linkedGitFile.worktreeRoot,
    primaryRoot,
  };
}

function findContainingLinkedGitFile(startDir) {
  const resolved = path.resolve(startDir);
  const root = path.parse(resolved).root;
  let dir = resolved;

  while (dir !== root) {
    const gitPath = path.join(dir, '.git');
    if (fileExists(gitPath)) {
      return { worktreeRoot: dir, gitFilePath: gitPath };
    }
    if (directoryExists(gitPath)) {
      return null;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

function readGitFileDirectory(gitFilePath) {
  const contents = fs.readFileSync(gitFilePath, 'utf8').trim();
  const match = contents.match(/^gitdir:\s*(.+)$/);
  if (!match) {
    return null;
  }
  return resolveGitMetadataPath(match[1].trim(), path.dirname(gitFilePath));
}

function readCommonGitDirectory(gitDir) {
  const commonDirPath = path.join(gitDir, 'commondir');
  if (!fileExists(commonDirPath)) {
    return null;
  }

  const contents = fs.readFileSync(commonDirPath, 'utf8').trim();
  if (!contents) {
    return null;
  }
  return resolveGitMetadataPath(contents, gitDir);
}

function resolveGitMetadataPath(value, baseDir) {
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(baseDir, value));
}

function isPathInside(childPath, parentPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || Boolean(relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function directoryExists(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function loadPipelineWorkflow(pipelineName, fixmeRoot) {
  const configPath = path.join(fixmeRoot || process.cwd(), '.fixme', 'config.json');
  const normalizedName = normalizeWorkflowName(pipelineName);
  if (!fs.existsSync(configPath)) {
    return STANDARD_PIPELINES[normalizedName] ? makeStandardWorkflow(normalizedName) : null;
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
  assertNoObsoleteConfigKeys(config, configPath);
  let workflow = getWorkflowDefinition(config, normalizedName);
  if (!workflow && STANDARD_PIPELINES[normalizedName]) {
    workflow = makeStandardWorkflow(normalizedName);
  }
  if (!workflow || !Array.isArray(workflow.phases)) return null;
  const normalizedWorkflow = cloneJson(workflow);
  // Filter out disabled phases (enabled defaults to true)
  normalizedWorkflow.phases = normalizedWorkflow.phases
    .filter(phase => phase.enabled !== false && phase.name);
  return normalizedWorkflow;
}

/**
 * Load pipeline phase names from config.
 * Returns array of phase name strings, or null if pipeline not found.
 */
function loadPipelinePhases(pipelineName, fixmeRoot) {
  const workflow = loadPipelineWorkflow(pipelineName, fixmeRoot);
  return workflow ? workflow.phases.map(phase => phase.name).filter(Boolean) : null;
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
  return name;
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

function hasWorkflowPhases(workflow) {
  return isPlainObject(workflow) && Array.isArray(workflow.phases);
}

function getWorkflowDefinition(config, workflowName) {
  if (isPlainObject(config.workflows) && hasWorkflowPhases(config.workflows[workflowName])) {
    return config.workflows[workflowName];
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
  assertNoObsoleteConfigKeys(config, configPath);

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

const FINAL_FULL_WORKFLOW_TUPLES = [
  ['product-spec', 'fixme-write-product-spec'],
  ['technical-spec', 'fixme-write-technical-spec'],
  ['plan', 'fixme-write-plan'],
  ['implement', 'fixme-execute-plan'],
  ['verify', 'fixme-browser-verify'],
];

function workflowPrimarySkillTuples(workflow) {
  return workflow.phases.map(phase => [
    phase && phase.name,
    Array.isArray(phase && phase.skills) ? phase.skills[0] : null,
  ]);
}

function workflowMatchesTuples(workflow, tuples) {
  if (!hasWorkflowPhases(workflow)) return false;
  return jsonEqual(workflowPrimarySkillTuples(workflow), tuples);
}

function isFinalFullWorkflow(workflow) {
  return workflowMatchesTuples(workflow, FINAL_FULL_WORKFLOW_TUPLES);
}

function obsoleteReviewKeyPath(review, reviewPath) {
  if (!isPlainObject(review)) return null;
  for (const key of OBSOLETE_REVIEW_KEYS) {
    if (Object.prototype.hasOwnProperty.call(review, key)) {
      return `${reviewPath}.${key}`;
    }
  }
  return null;
}

function assertNoObsoleteReviewKeysForWrite(review, reviewPath) {
  const obsoletePath = obsoleteReviewKeyPath(review, reviewPath);
  if (obsoletePath) {
    throw new Error(`Unsupported obsolete config key: ${obsoletePath}`);
  }
}

function assertNoObsoleteReviewKeysForConfig(review, reviewPath, configPath) {
  const obsoletePath = obsoleteReviewKeyPath(review, reviewPath);
  if (obsoletePath) {
    throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: obsoletePath });
  }
}

function ensureFinalFullWorkflow(config, result) {
  const workflow = config.workflows && config.workflows.full;
  if (!hasWorkflowPhases(workflow)) return;
  if (!isFinalFullWorkflow(workflow)) {
    throw new CliJsonError({
      error: 'workflow_name_conflict',
      path: result.configPath,
      workflow: 'full',
      reason: 'reserved_workflow_shape_mismatch',
    });
  }
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

function assertNoObsoleteConfigKeys(config, configPath = null) {
  if (Object.prototype.hasOwnProperty.call(config, 'pipelines')) {
    throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: 'pipelines' });
  }

  if (Object.prototype.hasOwnProperty.call(config, 'workflowControls')) {
    throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: 'workflowControls' });
  }

  if (Object.prototype.hasOwnProperty.call(config, 'sub_repos')) {
    throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: 'sub_repos' });
  }

  if (isPlainObject(config.workflows)) {
    for (const workflowName of REMOVED_WORKFLOW_NAMES) {
      if (Object.prototype.hasOwnProperty.call(config.workflows, workflowName)) {
        throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: `workflows.${workflowName}` });
      }
    }
  }

  assertNoObsoleteReviewKeysForConfig(config.review, 'review', configPath);

  if (isPlainObject(config.pullRequestComments)) {
    assertNoObsoleteReviewKeysForConfig(config.pullRequestComments.review, 'pullRequestComments.review', configPath);
  }

  if (isPlainObject(config.workflows)) {
    for (const [workflowName, workflow] of Object.entries(config.workflows)) {
      if (!isPlainObject(workflow)) continue;
      if (Object.prototype.hasOwnProperty.call(workflow, 'pipeline')) {
        throw new CliJsonError({ error: 'unsupported_obsolete_config', path: configPath, configPath: `workflows.${workflowName}.pipeline` });
      }
      assertNoObsoleteReviewKeysForConfig(workflow.review, `workflows.${workflowName}.review`, configPath);
      if (!Array.isArray(workflow.phases)) continue;
      workflow.phases.forEach((phase, index) => {
        if (!isPlainObject(phase)) return;
        assertNoObsoleteReviewKeysForConfig(phase.review, `workflows.${workflowName}.phases[${index}].review`, configPath);
      });
    }
  }
}

function applyConfigMigration(config, configPath = null) {
  const result = {
    migrated: false,
    addedWorkflows: [],
    warnings: [],
    configPath,
  };
  if (!isPlainObject(config.workflows)) {
    config.workflows = {};
    result.migrated = true;
  }

  validateFinalReviewLevels(config, configPath);
  assertNoObsoleteConfigKeys(config, configPath);

  ensureFinalFullWorkflow(config, result);

  if (!isPlainObject(config.review)) {
    config.review = {};
    result.migrated = true;
  }

  if (!Object.prototype.hasOwnProperty.call(config.review, 'level')) {
    config.review.level = 'standard';
    result.migrated = true;
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

function isRemovedWorkflowName(value) {
  return REMOVED_WORKFLOW_NAMES.includes(value);
}

function assertWorkflowNameNotRemoved(workflowName) {
  if (isRemovedWorkflowName(workflowName)) {
    throw new Error(`Removed workflow name is not supported: ${workflowName}`);
  }
}

function isSupportedConfigKey(parts) {
  const [top, second, third] = parts;

  if (top === 'ticketBackend') return parts.length === 1;
  if (top === 'subRepos') return parts.length === 1;
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
    if (isRemovedWorkflowName(second)) return false;
    if (parts.length === 2) return true;
    if (parts.length === 3) return ['phases', 'outerMaxCycles'].includes(third);
    if (parts.length === 4 && third === 'review' && parts[3] === 'level') return true;
    return false;
  }

  if (top === 'linear') {
    return ['teamId', 'teamName', 'defaultLabels', 'defaultProject', 'defaultPriority'].includes(second) && parts.length === 2;
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

function validateLinearDefaultPriority(value) {
  if (!isPlainObject(value)) {
    throw new Error('linear.defaultPriority must be an object with value and label');
  }
  if (!isPositiveInteger(value.value)) {
    throw new Error('linear.defaultPriority.value must be a positive integer');
  }
  if (typeof value.label !== 'string' || value.label.trim() === '') {
    throw new Error('linear.defaultPriority.label must be a non-empty string');
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
      throw new Error(`workflows.${workflowName}.phases has duplicate phase name '${phase.name}'`);
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
      assertNoObsoleteReviewKeysForWrite(normalizedPhase.review, `${fieldPrefix}.review`);
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
  assertWorkflowNameNotRemoved(workflowName);
  if (!isPlainObject(workflow)) {
    throw new Error(`workflows.${workflowName} must be an object`);
  }
  if (Object.prototype.hasOwnProperty.call(workflow, 'pipeline')) {
    throw new Error(`Unsupported obsolete config key: workflows.${workflowName}.pipeline`);
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
    assertNoObsoleteReviewKeysForWrite(normalized.review, `workflows.${workflowName}.review`);
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
      throw new Error("ticketBackend must be one of: fixme-tickets-md");
    }
  }

  if (top === 'subRepos') {
    validateStringArray(value, 'subRepos', true);
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
    } else if (second === 'defaultPriority') {
      validateLinearDefaultPriority(value);
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
  assertNoObsoleteConfigKeys(config, configPath);

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
  assertWorkflowNameNotRemoved(workflowName);
  try {
    var data = resolveJsonArgument(flags, 'data', { missingMessage: '--data is required for config workflow configure' });
  } catch (e) {
    if (e.message.startsWith('--data must be valid JSON')) {
      throw new Error(`Invalid JSON in --data: ${e.message.replace(/^--data must be valid JSON: /, '')}`);
    }
    throw e;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'pipeline')) {
    throw new Error('workflow configure data must use phases; pipeline is not supported');
  }

  const phases = data.phases;
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
    assertNoObsoleteReviewKeysForWrite(data.review, `workflows.${workflowName}.review`);
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
 * Priority: --pipeline flag -> ticket frontmatter pipeline -> standard workflow.
 */
function resolveTransitions(fm, flags, fixmeRoot) {
  // 1. Check --pipeline flag (also stores it in frontmatter for future use)
  const pipelineFlag = flags.pipeline || null;
  // 2. Check ticket frontmatter
  const rawPipelineName = pipelineFlag || fm.pipeline || null;

  if (rawPipelineName) {
    const phases = loadPipelinePhases(rawPipelineName, fixmeRoot);
    if (!phases || phases.length === 0) {
      throw new Error(`Workflow not found or has no enabled phases: ${rawPipelineName}`);
    }
    const pipelineName = normalizeWorkflowName(rawPipelineName);
    return { transitions: buildTransitionsFromPhases(phases), phases, pipelineName };
  }

  // 3. Fallback to the final standard workflow
  const phases = loadPipelinePhases('standard', fixmeRoot) || STANDARD_PIPELINES.standard.map(phase => phase.name);
  return { transitions: buildTransitionsFromPhases(phases), phases, pipelineName: 'standard' };
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

  // Preserve cumulative seconds for states visited multiple times (e.g., plan on retry)
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
// Subcommands: task
// ============================================================================

function taskDirectory(fixmeRoot) {
  return path.join(fixmeRoot, '.fixme', 'tasks');
}

function readNextTaskNumber(taskDir) {
  const counterPath = path.join(taskDir, '.counter');
  if (!fs.existsSync(counterPath)) return 1;

  const raw = fs.readFileSync(counterPath, 'utf8').trim();
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`The saved-task counter at ${counterPath} is invalid. Fix it to contain the next positive integer, then run task save again.`);
  }
  return parseInt(raw, 10);
}

function writeTaskCounter(taskDir, nextNumber) {
  fs.writeFileSync(path.join(taskDir, '.counter'), `${nextNumber}\n`);
}

function sanitizeTaskSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function normalizeTaskTextArray(value) {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined).map(item => String(item));
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

function markdownList(items, fallback) {
  const normalized = normalizeTaskTextArray(items);
  if (normalized.length === 0) return `- ${fallback}`;
  return normalized.map(item => `- ${item}`).join('\n');
}

function hasTaskDetail(value) {
  return normalizeTaskTextArray(value).some(item => item.trim().length > 0);
}

function validateTaskSaveHandoffData(data) {
  const scope = isPlainObject(data.scope) ? data.scope : {};
  const missing = [];
  if (String(data.taskGoal || '').trim().length === 0) missing.push('taskGoal');
  if (!hasTaskDetail(data.agreedApproach)) missing.push('agreedApproach');
  if (!hasTaskDetail(data.userVisibleBehavior)) missing.push('userVisibleBehavior');
  if (!hasTaskDetail(scope.inScope)) missing.push('scope.inScope');
  if (!hasTaskDetail(data.laterPlanningNotes)) missing.push('laterPlanningNotes');

  if (missing.length > 0) {
    throw new Error(`task save requires a self-contained handoff; missing concrete ${missing.join(', ')}. Include the settled solution shape, observable behavior, scope, and planning notes before saving.`);
  }
}

function formatLockedDecisions(decisions) {
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return '- None recorded.';
  }
  return decisions.map((decision, index) => {
    if (isPlainObject(decision)) {
      const title = decision.title || `Decision ${index + 1}`;
      const answer = decision.answer || decision.decision || 'Recorded in saved task input.';
      const status = decision.status || 'confirmed';
      return `${index + 1}. **${title}**\n   - **Answer:** ${answer}\n   - **Status:** ${status}`;
    }
    return `${index + 1}. ${String(decision)}`;
  }).join('\n');
}

function buildTaskMarkdown(data, taskRef, slug, date) {
  const title = data.title || titleFromSlug(slug) || 'Saved Fixme Task';
  const pipeline = data.pipelineResolution.pipeline;
  const frontmatter = {
    title,
    label: taskRef,
    slug,
    created: date,
    updated: date,
    status: 'saved',
    source: data.source || 'conversation',
    pipeline,
    tags: Array.isArray(data.tags) ? data.tags : [],
  };

  const scope = isPlainObject(data.scope) ? data.scope : {};
  const body = `# ${taskRef}: ${title}

## Task Goal

${data.taskGoal || 'Saved fixme task.'}

## Agreed Approach

${markdownList(data.agreedApproach, 'Use the saved task context.')}

## User-Visible Behavior

${markdownList(data.userVisibleBehavior, 'Resume or execute the saved task.')}

## Scope

### In Scope

${markdownList(scope.inScope, 'The saved task described above.')}

### Out Of Scope

${markdownList(scope.outOfScope, 'Unrelated cleanup.')}

## Locked Decisions

${formatLockedDecisions(data.lockedDecisions)}

## Constraints

${markdownList(data.constraints, 'Follow project instructions.')}

## Known Context

${markdownList(data.knownContext, 'No extra context recorded.')}

## Open Questions

${markdownList(data.openQuestions, 'None.')}

## Suggested Pipeline

\`${pipeline}\`

## Later Planning Notes

${markdownList(data.laterPlanningNotes, 'Plan from this saved task brief.')}
`;

  return buildContent(frontmatter, body, []);
}

function firstPipelineCursor(pipelineName, fixmeRoot) {
  const normalizedPipeline = normalizeWorkflowName(pipelineName || 'standard');
  const workflow = loadPipelineWorkflow(normalizedPipeline, fixmeRoot);
  if (!workflow || !Array.isArray(workflow.phases) || workflow.phases.length === 0) {
    throw new Error(`Workflow not found or has no enabled phases: ${normalizedPipeline}`);
  }
  const configuredPhase = workflow.phases[0];
  const phase = configuredPhase.name;
  const skill = configuredPhase && Array.isArray(configuredPhase.skills) && configuredPhase.skills.length > 0
    ? configuredPhase.skills[0]
    : null;
  return {
    phase,
    stage: 'execute',
    skill,
    dispatchMode: 'normal',
  };
}

function defaultTaskState({ projectRoot, pipeline, pipelineResolution, fixmeRoot, now }) {
  return {
    schemaVersion: 1,
    projectRoot,
    status: 'running',
    pipeline,
    pipelineResolution,
    cursor: firstPipelineCursor(pipeline, fixmeRoot),
    artifacts: {
      productSpecificationPath: null,
      technicalSpecificationPath: null,
      planPath: null,
      codeMapPath: null,
      preparationArtifacts: [],
    },
    handoff: {
      executionSummary: null,
      reviewFindings: null,
      handlerResult: null,
      followUpItems: [],
    },
    loops: {
      phaseReviewCycles: [],
      outerCycles: 0,
    },
    pendingDecision: null,
    parentContinuation: null,
    producerContinuations: [],
    decisions: [],
    terminalResult: null,
    updatedAt: now,
  };
}

function parseTaskData(rawData) {
  if (!rawData || rawData === true) {
    throw new Error('--data is required');
  }
  let data;
  try {
    data = JSON.parse(rawData);
  } catch (e) {
    throw new Error(`--data must be valid JSON: ${e.message}`);
  }
  if (!isPlainObject(data)) {
    throw new Error('--data must be a JSON object');
  }
  return data;
}

let stdinJsonArgumentName = null;
let stdinJsonCache = null;

function resolveJsonArgument(flags, logicalName, options = {}) {
  const directFlag = logicalName;
  const fileFlag = `${logicalName}-file`;
  const stdinFlag = `${logicalName}-stdin`;
  const display = `--${logicalName}`;
  const sources = [];
  if (Object.prototype.hasOwnProperty.call(flags, directFlag) && flags[directFlag] !== undefined) sources.push('direct');
  if (Object.prototype.hasOwnProperty.call(flags, fileFlag) && flags[fileFlag] !== undefined) sources.push('file');
  if (Object.prototype.hasOwnProperty.call(flags, stdinFlag) && flags[stdinFlag] !== undefined) sources.push('stdin');

  if (sources.length === 0) {
    if (options.required === false) return undefined;
    throw new Error(options.missingMessage || `${display} is required`);
  }
  if (sources.length > 1) {
    throw new Error(`Only one JSON source is allowed for ${display}`);
  }

  let raw;
  if (sources[0] === 'direct') {
    raw = flags[directFlag];
    if (raw === true || raw === '') {
      throw new Error(`${display} requires a JSON object`);
    }
  } else if (sources[0] === 'file') {
    const rawPath = flags[fileFlag];
    if (rawPath === true || rawPath === '') {
      throw new Error(`--${fileFlag} requires a path value`);
    }
    const filePath = String(rawPath);
    if (!path.isAbsolute(filePath)) {
      throw new Error(`--${fileFlag} must be an absolute path`);
    }
    raw = fs.readFileSync(filePath, 'utf8');
  } else {
    if (flags[stdinFlag] !== true && flags[stdinFlag] !== '') {
      throw new Error(`--${stdinFlag} does not accept a value`);
    }
    if (stdinJsonArgumentName && stdinJsonArgumentName !== logicalName) {
      throw new Error('Only one JSON argument may use stdin in a single command');
    }
    stdinJsonArgumentName = logicalName;
    if (stdinJsonCache === null) {
      stdinJsonCache = fs.readFileSync(0, 'utf8');
    }
    raw = stdinJsonCache;
  }

  const previous = raw === undefined ? undefined : flags[directFlag];
  flags[directFlag] = raw;
  try {
    return parseTaskData(raw);
  } catch (e) {
    if (sources[0] === 'direct') throw e;
    throw new Error(e.message.replace(/^--data/, display));
  } finally {
    if (previous === undefined) {
      delete flags[directFlag];
    } else {
      flags[directFlag] = previous;
    }
  }
}

function assertCamelCaseJsonKeys(value, label, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCamelCaseJsonKeys(item, label, pathParts.concat(String(index))));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const currentPath = pathParts.concat(key).join('.');
    if (!/^[a-z][A-Za-z0-9]*$/.test(key)) {
      throw new Error(`${label} must use camelCase JSON keys; found ${currentPath}`);
    }
    assertCamelCaseJsonKeys(child, label, pathParts.concat(key));
  }
}

function assertKnownJsonFields(value, label, allowedFields) {
  for (const key of Object.keys(value || {})) {
    if (!allowedFields.has(key)) {
      throw new Error(`Unsupported ${label} field: ${key}`);
    }
  }
}

const PIPELINE_RESOLUTION_SOURCE_PRIORITY = Object.freeze({
  explicitPipelineArg: 100,
  intentFlag: 95,
  firstArgumentPipelineName: 90,
  userProseIntent: 80,
  artifact: 70,
  resumeState: 60,
  default: 0,
});

const INELIGIBLE_PIPELINE_RESOLUTION_SOURCES = new Set([
  'assistantMenuText',
  'assistantSummary',
  'assistantText',
  'previousAssistantMessage',
  'assistantContext',
]);

function normalizePipelineEvidence(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizePipelineCandidate(candidate, index) {
  if (!isPlainObject(candidate)) {
    throw new Error(`pipeline candidate ${index + 1} must be an object`);
  }

  const source = candidate.source === undefined || candidate.source === null
    ? ''
    : String(candidate.source);
  if (INELIGIBLE_PIPELINE_RESOLUTION_SOURCES.has(source)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(PIPELINE_RESOLUTION_SOURCE_PRIORITY, source)) {
    throw new Error(`Unsupported pipeline candidate source: ${source || '<missing>'}`);
  }

  const pipelineValue = candidate.pipeline === undefined || candidate.pipeline === null
    ? ''
    : String(candidate.pipeline).trim();
  if (!pipelineValue) {
    throw new Error(`pipeline candidate ${index + 1} must include pipeline`);
  }

  const pipeline = normalizeWorkflowName(pipelineValue);
  return {
    pipeline,
    source,
    evidence: normalizePipelineEvidence(candidate.evidence),
    reason: candidate.reason ? String(candidate.reason) : `Selected from ${source}.`,
    priority: PIPELINE_RESOLUTION_SOURCE_PRIORITY[source],
  };
}

function candidateForOutput(candidate) {
  return {
    pipeline: candidate.pipeline,
    source: candidate.source,
    evidence: candidate.evidence,
    reason: candidate.reason,
  };
}

function defaultPipelineResolution(reason = 'No eligible pipeline candidate was provided.') {
  return {
    pipeline: 'standard',
    source: 'default',
    evidence: null,
    reason,
    candidates: [],
  };
}

function resolvePipelineCandidates(candidates) {
  const normalizedCandidates = [];
  for (const [index, candidate] of candidates.entries()) {
    const normalizedCandidate = normalizePipelineCandidate(candidate, index);
    if (normalizedCandidate) normalizedCandidates.push(normalizedCandidate);
  }

  if (normalizedCandidates.length === 0) {
    return defaultPipelineResolution();
  }

  normalizedCandidates.sort((a, b) => b.priority - a.priority);
  const selected = normalizedCandidates[0];
  const conflicting = normalizedCandidates.find(candidate =>
    candidate.priority === selected.priority && candidate.pipeline !== selected.pipeline
  );
  if (conflicting) {
    throw new Error(`Ambiguous pipeline resolution: ${selected.source} selects ${selected.pipeline}, but ${conflicting.source} selects ${conflicting.pipeline}`);
  }

  return {
    pipeline: selected.pipeline,
    source: selected.source,
    evidence: selected.evidence,
    reason: selected.reason,
    candidates: normalizedCandidates.map(candidateForOutput),
  };
}

function validatePipelineResolutionWorkflow(pipelineResolution, fixmeRoot, context) {
  const pipeline = pipelineResolution && pipelineResolution.pipeline;
  const phases = loadPipelinePhases(pipeline, fixmeRoot);
  if (!phases || phases.length === 0) {
    throw new Error(`${context} workflow not found or has no enabled phases: ${pipeline}`);
  }
  return pipelineResolution;
}

function normalizeProvidedPipelineResolution(value) {
  if (!isPlainObject(value)) {
    throw new Error('pipelineResolution must be an object');
  }
  const selected = normalizePipelineCandidate(value, 0);
  if (!selected) {
    throw new Error('pipelineResolution source is not eligible');
  }
  const candidates = Array.isArray(value.candidates)
    ? value.candidates
      .map((candidate, index) => normalizePipelineCandidate(candidate, index))
      .filter(Boolean)
      .map(candidateForOutput)
    : (selected.source === 'default' ? [] : [candidateForOutput(selected)]);

  return {
    pipeline: selected.pipeline,
    source: selected.source,
    evidence: selected.evidence,
    reason: selected.reason,
    candidates,
  };
}

function resolvePipelineFromData(data, fixmeRoot) {
  assertCamelCaseJsonKeys(data, 'pipeline resolve data');
  const pipelineResolution = isPlainObject(data.pipelineResolution)
    ? normalizeProvidedPipelineResolution(data.pipelineResolution)
    : resolvePipelineCandidates(Array.isArray(data.candidates) ? data.candidates : []);
  return validatePipelineResolutionWorkflow(pipelineResolution, fixmeRoot, 'pipeline resolution');
}

function pipelineResolutionForTaskSaveData(data, fixmeRoot) {
  if (Object.prototype.hasOwnProperty.call(data, 'pipelineHint') || Object.prototype.hasOwnProperty.call(data, 'pipeline')) {
    throw new Error('task save data no longer accepts pipelineHint or pipeline; use pipelineResolution');
  }
  if (!isPlainObject(data.pipelineResolution)) {
    throw new Error('task save requires pipelineResolution');
  }
  return validatePipelineResolutionWorkflow(
    normalizeProvidedPipelineResolution(data.pipelineResolution),
    fixmeRoot,
    'task save pipeline resolution',
  );
}

function pipelineResolutionForTaskInitFlags(flags, fixmeRoot) {
  if (Object.prototype.hasOwnProperty.call(flags, 'pipeline')) {
    throw new Error('task init no longer accepts --pipeline; use --pipeline-resolution');
  }

  const data = resolveJsonArgument(flags, 'pipeline-resolution', { missingMessage: 'task init requires --pipeline-resolution' });
  assertCamelCaseJsonKeys(data, '--pipeline-resolution');
  return validatePipelineResolutionWorkflow(
    normalizeProvidedPipelineResolution(data),
    fixmeRoot,
    'task init pipeline resolution',
  );
}

function pipelineResolve(flags, fixmeRoot) {
  const data = resolveJsonArgument(flags, 'data');
  return output(resolvePipelineFromData(data, fixmeRoot));
}

function taskSave(flags, fixmeRoot) {
  const data = resolveJsonArgument(flags, 'data');
  assertCamelCaseJsonKeys(data, '--data');
  validateTaskSaveHandoffData(data);
  const pipelineResolution = pipelineResolutionForTaskSaveData(data, fixmeRoot);
  const pipeline = pipelineResolution.pipeline;
  const taskDir = taskDirectory(fixmeRoot);
  fs.mkdirSync(taskDir, { recursive: true });

  const number = readNextTaskNumber(taskDir);
  const taskRef = `FIXME-${number}`;
  const title = data.title || 'Saved Fixme Task';
  const slug = sanitizeTaskSlug(data.slug || title);
  if (!slug) {
    throw new Error('Task slug is empty after sanitization');
  }

  const date = new Date().toISOString().slice(0, 10);
  const taskPath = path.join(taskDir, `${date}-${taskRef}-${slug}.md`);
  const statePath = path.join(taskDir, `${date}-${taskRef}-${slug}.state.json`);
  const now = new Date().toISOString();
  const taskData = {
    ...data,
    pipelineResolution,
  };
  const state = defaultTaskState({
    projectRoot: fixmeRoot,
    pipeline,
    pipelineResolution,
    fixmeRoot,
    now,
  });

  writeTaskCounter(taskDir, number + 1);
  fs.writeFileSync(taskPath, buildTaskMarkdown(taskData, taskRef, slug, date));
  writeJsonAtomic(statePath, state);

  return output({
    mode: 'standalone',
    taskRef,
    taskPath,
    ticketPath: null,
    statePath,
  });
}

function saveStandaloneTaskCore(fixmeRoot, data) {
  assertCamelCaseJsonKeys(data, 'task save data');
  validateTaskSaveHandoffData(data);
  const pipelineResolution = pipelineResolutionForTaskSaveData(data, fixmeRoot);
  const pipeline = pipelineResolution.pipeline;
  const taskDir = taskDirectory(fixmeRoot);
  fs.mkdirSync(taskDir, { recursive: true });
  const number = readNextTaskNumber(taskDir);
  const taskRef = `FIXME-${number}`;
  const title = data.title || 'Saved Fixme Task';
  const slug = sanitizeTaskSlug(data.slug || title);
  if (!slug) {
    throw new Error('Task slug is empty after sanitization');
  }
  const date = new Date().toISOString().slice(0, 10);
  const taskPath = path.join(taskDir, `${date}-${taskRef}-${slug}.md`);
  const statePath = path.join(taskDir, `${date}-${taskRef}-${slug}.state.json`);
  const now = new Date().toISOString();
  const taskData = { ...data, pipelineResolution };
  const state = defaultTaskState({ projectRoot: fixmeRoot, pipeline, pipelineResolution, fixmeRoot, now });
  writeTaskCounter(taskDir, number + 1);
  fs.writeFileSync(taskPath, buildTaskMarkdown(taskData, taskRef, slug, date));
  writeJsonAtomic(statePath, state);
  return { mode: 'standalone', taskRef, taskPath, ticketPath: null, statePath };
}

function taskStatePathForTicket(ticketPath) {
  return path.join(path.dirname(ticketPath), 'task-state.json');
}

function taskStatePathForTask(taskPath) {
  if (!taskPath.endsWith('.md')) {
    throw new Error(`Task path must end with .md: ${taskPath}`);
  }
  return taskPath.replace(/\.md$/, '.state.json');
}

function normalizePathForContainment(value) {
  const resolved = path.resolve(value);
  if (process.platform === 'darwin' && resolved.startsWith('/var/')) {
    return `/private${resolved}`;
  }
  return resolved;
}

function isPathInsideDirectory(parentDir, childPath) {
  const relative = path.relative(normalizePathForContainment(parentDir), normalizePathForContainment(childPath));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveReservedTaskStatePath(rawStatePath, fixmeRoot) {
  if (!rawStatePath || rawStatePath === true) {
    throw new Error('--state requires a path value');
  }
  const statePath = String(rawStatePath);
  if (!path.isAbsolute(statePath)) {
    throw new Error('--state reserved task path must be absolute');
  }
  const resolvedStatePath = path.resolve(statePath);
  const tasksDir = taskDirectory(fixmeRoot);
  if (!isPathInsideDirectory(tasksDir, resolvedStatePath)) {
    throw new Error(`--state reserved task path must be under ${tasksDir}`);
  }
  if (!resolvedStatePath.endsWith('.state.json')) {
    throw new Error('--state reserved task path must end with .state.json');
  }
  const conflictingTaskPath = resolvedStatePath.replace(/\.state\.json$/, '.md');
  if (fs.existsSync(conflictingTaskPath)) {
    throw new Error(`--state reserved task path conflicts with saved task markdown: ${conflictingTaskPath}`);
  }
  return resolvedStatePath;
}

function parseParentContinuationFlag(flags) {
  const parentContinuation = resolveJsonArgument(flags, 'parent-continuation', { required: false });
  if (parentContinuation === undefined) {
    return undefined;
  }
  const patch = { parentContinuation };
  assertCamelCaseJsonKeys(patch, 'task init parentContinuation');
  assertTaskCheckpointShape(patch);
  return parentContinuation;
}

function taskInit(flags, fixmeRoot) {
  const pipelineResolution = pipelineResolutionForTaskInitFlags(flags, fixmeRoot);
  const pipeline = pipelineResolution.pipeline;
  const projectRoot = flags['project-root'] && flags['project-root'] !== true
    ? path.resolve(String(flags['project-root']))
    : fixmeRoot;
  const now = new Date().toISOString();
  const state = defaultTaskState({
    projectRoot,
    pipeline,
    pipelineResolution,
    fixmeRoot,
    now,
  });

  if (flags.state && flags.state !== true) {
    const statePath = resolveReservedTaskStatePath(flags.state, fixmeRoot);
    const parentContinuation = parseParentContinuationFlag(flags);
    const nextState = parentContinuation === undefined
      ? state
      : mergeTaskState(state, { parentContinuation });

    if (fs.existsSync(statePath)) {
      const existing = readJsonFileStrict(statePath);
      if (existing.projectRoot !== projectRoot || existing.pipeline !== pipeline || !jsonEqual(existing.pipelineResolution, pipelineResolution)) {
        throw new Error(`Reserved task state conflicts with requested task initialization: ${statePath}`);
      }
      if (parentContinuation !== undefined) {
        if (existing.parentContinuation !== null && !jsonEqual(existing.parentContinuation, parentContinuation)) {
          throw new Error(`Reserved task state has a different parentContinuation: ${statePath}`);
        }
        if (existing.parentContinuation === null) {
          const updated = mergeTaskState(existing, { parentContinuation });
          assertCamelCaseJsonKeys(updated, 'task state');
          writeJsonAtomic(statePath, updated);
        }
      }
      return output({
        mode: 'reserved-state',
        taskRef: null,
        taskPath: null,
        ticketPath: null,
        statePath,
      });
    }

    assertCamelCaseJsonKeys(nextState, 'task state');
    writeJsonAtomic(statePath, nextState);
    return output({
      mode: 'reserved-state',
      taskRef: null,
      taskPath: null,
      ticketPath: null,
      statePath,
    });
  }

  if (flags.ticket && flags.ticket !== true) {
    const ticketPath = resolveTicketPath(String(flags.ticket));
    if (!fs.existsSync(ticketPath)) {
      throw new Error(`Ticket file not found: ${ticketPath}`);
    }
    const statePath = taskStatePathForTicket(ticketPath);
    writeJsonAtomic(statePath, state);
    return output({
      mode: 'ticket',
      taskRef: null,
      taskPath: null,
      ticketPath,
      statePath,
    });
  }

  if (flags.task && flags.task !== true) {
    const taskPath = path.resolve(String(flags.task));
    if (!fs.existsSync(taskPath)) {
      throw new Error(`Task file not found: ${taskPath}`);
    }
    const statePath = taskStatePathForTask(taskPath);
    writeJsonAtomic(statePath, state);
    return output({
      mode: 'standalone',
      taskRef: parseTaskRefFromMarkdown(taskPath),
      taskPath,
      ticketPath: null,
      statePath,
    });
  }

  throw new Error('task init requires --ticket <ticket.md|ticket-folder> or --task <task.md>');
}

function parseTaskRefFromMarkdown(taskPath) {
  const content = fs.readFileSync(taskPath, 'utf8');
  const { frontmatter: fm } = parseFrontmatter(content);
  if (typeof fm.label === 'string' && /^FIXME-\d+$/.test(fm.label)) {
    return fm.label;
  }
  const match = path.basename(taskPath).match(/(^|-)FIXME-\d+(?=-|\.md$)/);
  if (match) {
    return match[0].replace(/^-/, '');
  }
  return null;
}

function resolveTicketTask(input) {
  const resolvedInput = path.resolve(input);
  let ticketPath = null;
  let statePath = null;

  if (fs.existsSync(resolvedInput) && fs.statSync(resolvedInput).isDirectory()) {
    const candidate = path.join(resolvedInput, 'ticket.md');
    if (fs.existsSync(candidate)) {
      ticketPath = candidate;
      statePath = taskStatePathForTicket(ticketPath);
    }
  } else if (path.basename(resolvedInput) === 'ticket.md') {
    ticketPath = resolvedInput;
    statePath = taskStatePathForTicket(ticketPath);
  } else if (path.basename(resolvedInput) === 'task-state.json') {
    statePath = resolvedInput;
    const candidate = path.join(path.dirname(resolvedInput), 'ticket.md');
    if (fs.existsSync(candidate)) {
      ticketPath = candidate;
    }
  }

  if (!ticketPath) return null;
  if (!fs.existsSync(ticketPath)) {
    throw new Error(`Ticket file not found: ${ticketPath}`);
  }
  if (!fs.existsSync(statePath)) {
    throw new Error(`Task state file not found: ${statePath}`);
  }

  return {
    mode: 'ticket',
    taskRef: null,
    taskPath: null,
    ticketPath,
    statePath,
  };
}

function listTaskMarkdownFiles(taskDir) {
  if (!fs.existsSync(taskDir)) return [];
  return fs.readdirSync(taskDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(taskDir, file))
    .filter(filePath => fs.statSync(filePath).isFile());
}

function resolveStandaloneTask(input, fixmeRoot) {
  const taskDir = taskDirectory(fixmeRoot);
  let taskPath = null;
  let statePath = null;

  if (/^FIXME-\d+$/.test(input)) {
    const filenameMatches = listTaskMarkdownFiles(taskDir)
      .filter(filePath => path.basename(filePath).includes(`-${input}-`));
    const matches = filenameMatches.length > 0
      ? filenameMatches
      : listTaskMarkdownFiles(taskDir).filter(filePath => parseTaskRefFromMarkdown(filePath) === input);

    if (matches.length === 0) {
      throw new Error(`Saved task not found: ${input}`);
    }
    if (matches.length > 1) {
      throw new Error(`Multiple saved tasks match ${input}: ${matches.join(', ')}`);
    }
    taskPath = matches[0];
    statePath = taskStatePathForTask(taskPath);
  } else {
    const resolvedInput = path.resolve(input);
    if (resolvedInput.endsWith('.state.json')) {
      statePath = resolvedInput;
      taskPath = resolvedInput.replace(/\.state\.json$/, '.md');
    } else {
      taskPath = resolvedInput;
      statePath = taskStatePathForTask(resolvedInput);
    }
  }

  if (statePath && fs.existsSync(statePath) && !fs.existsSync(taskPath)) {
    if (!isPathInsideDirectory(taskDir, statePath)) {
      throw new Error(`Reserved task state path must be under ${taskDir}: ${statePath}`);
    }
    return {
      mode: 'reserved-state',
      taskRef: null,
      taskPath: null,
      ticketPath: null,
      statePath,
    };
  }

  if (!taskPath || !fs.existsSync(taskPath)) {
    throw new Error(`Task file not found: ${taskPath || input}`);
  }
  if (!statePath || !fs.existsSync(statePath)) {
    throw new Error(`Task state file not found: ${statePath || input}`);
  }

  return {
    mode: 'standalone',
    taskRef: parseTaskRefFromMarkdown(taskPath),
    taskPath,
    ticketPath: null,
    statePath,
  };
}

function resolveTask(input, fixmeRoot) {
  if (!input) {
    throw new Error('task resolve requires a FIXME ref, task path, state path, ticket path, or ticket folder');
  }
  const ticketTask = resolveTicketTask(input);
  return ticketTask || resolveStandaloneTask(input, fixmeRoot);
}

function taskResolve(input, fixmeRoot) {
  return output(resolveTask(input, fixmeRoot));
}

function singleLine(value, fallback = '') {
  const text = value === null || value === undefined ? fallback : String(value);
  return text.replace(/\s+/g, ' ').trim();
}

function titleFromArtifactType(type) {
  return String(type || 'artifact')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Artifact';
}

function normalizePreparationArtifactData(data) {
  const artifactType = singleLine(data.artifactType).toLowerCase();
  const artifactPath = singleLine(data.artifactPath);
  if (!artifactType) {
    throw new Error('artifactType is required');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(artifactType)) {
    throw new Error(`artifactType must be lowercase kebab-case: ${artifactType}`);
  }
  if (!artifactPath) {
    throw new Error('artifactPath is required');
  }

  const title = singleLine(data.title, titleFromArtifactType(artifactType));
  const status = singleLine(data.status, 'current') || 'current';
  const sourceSkill = singleLine(data.sourceSkill);
  const summary = normalizeTaskTextArray(data.summary)
    .map(item => singleLine(item))
    .filter(Boolean);
  const now = new Date().toISOString();

  return {
    artifactType,
    artifactPath,
    title,
    summary,
    sourceSkill: sourceSkill || null,
    status,
    updatedAt: now,
  };
}

function markdownEscapeInline(value) {
  return String(value || '').replace(/`/g, '\\`');
}

function renderPreparationArtifact(artifact) {
  const headingType = titleFromArtifactType(artifact.artifactType);
  const lines = [
    `### ${headingType}: ${artifact.title || headingType}`,
    '',
    `- **Path:** \`${markdownEscapeInline(artifact.artifactPath)}\``,
    `- **Status:** ${artifact.status || 'current'}`,
  ];
  if (artifact.sourceSkill) {
    lines.push(`- **Source:** \`${markdownEscapeInline(artifact.sourceSkill)}\``);
  }
  if (artifact.updatedAt) {
    lines.push(`- **Updated:** ${artifact.updatedAt}`);
  }
  if (Array.isArray(artifact.summary) && artifact.summary.length > 0) {
    lines.push('- **Summary:**');
    artifact.summary.forEach(item => lines.push(`  - ${item}`));
  }
  return lines.join('\n');
}

function renderPreparationArtifactsSection(artifacts) {
  const renderedArtifacts = artifacts.map(renderPreparationArtifact).join('\n\n');
  return `## Preparation Artifacts

<!-- fixme-preparation-artifacts:start -->
${renderedArtifacts}
<!-- fixme-preparation-artifacts:end -->`;
}

function replacePreparationArtifactsSection(body, artifacts) {
  const section = renderPreparationArtifactsSection(artifacts);
  const pattern = /\n*## Preparation Artifacts\n\n<!-- fixme-preparation-artifacts:start -->[\s\S]*?<!-- fixme-preparation-artifacts:end -->\n*/;
  if (pattern.test(body)) {
    return body.replace(pattern, `\n\n${section}\n`);
  }
  return `${body.replace(/\s*$/, '')}\n\n${section}\n`;
}

function upsertPreparationArtifact(existingArtifacts, artifact) {
  const artifacts = Array.isArray(existingArtifacts) ? existingArtifacts.slice() : [];
  const existingIndex = artifacts.findIndex(candidate =>
    candidate
      && candidate.artifactType === artifact.artifactType
      && candidate.artifactPath === artifact.artifactPath
  );
  if (existingIndex === -1) {
    artifacts.push(artifact);
  } else {
    artifacts[existingIndex] = {
      ...artifacts[existingIndex],
      ...artifact,
    };
  }
  return artifacts;
}

function taskAttachArtifact(flags, fixmeRoot) {
  const taskRef = flags.task && flags.task !== true ? String(flags.task) : null;
  if (!taskRef) {
    throw new Error('task attach-artifact requires --task <FIXME-N|task.md|state.json|ticket.md|ticket-folder>');
  }
  const data = resolveJsonArgument(flags, 'data');
  assertCamelCaseJsonKeys(data, '--data');
  const resolved = resolveTask(taskRef, fixmeRoot);
  const targetPath = resolved.taskPath || resolved.ticketPath;
  if (!targetPath) {
    throw new Error(`No markdown target found for task reference: ${taskRef}`);
  }

  const artifact = normalizePreparationArtifactData(data);
  const state = readJsonFileStrict(resolved.statePath);
  const previousArtifacts = state.artifacts && Array.isArray(state.artifacts.preparationArtifacts)
    ? state.artifacts.preparationArtifacts
    : [];
  const preparationArtifacts = upsertPreparationArtifact(previousArtifacts, artifact);
  const nextState = {
    ...state,
    artifacts: {
      ...(isPlainObject(state.artifacts) ? state.artifacts : {}),
      preparationArtifacts,
    },
    updatedAt: new Date().toISOString(),
  };

  const content = fs.readFileSync(targetPath, 'utf8');
  const { frontmatter, body, rawFields } = parseFrontmatter(content);
  const nextBody = replacePreparationArtifactsSection(body, preparationArtifacts);

  writeJsonAtomic(resolved.statePath, nextState);
  fs.writeFileSync(targetPath, buildContent(frontmatter, nextBody, rawFields));

  return output({
    ...resolved,
    artifact,
  });
}

function mergePlainObjects(previous, patch) {
  const next = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(previous[key])) {
      next[key] = mergePlainObjects(previous[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

const TASK_CHECKPOINT_FIELDS = new Set([
  'status',
  'cursor',
  'artifacts',
  'handoff',
  'loops',
  'pendingDecision',
  'parentContinuation',
  'producerContinuations',
  'decisions',
  'terminalResult',
]);

const PARENT_CONTINUATION_FIELDS = new Set([
  'parentSkill',
  'parentRunId',
  'transport',
  'resumeStep',
  'parentStatusId',
]);

const PARENT_CONTINUATION_TRANSPORTS = new Set(['agent', 'inline-skill', 'background', 'direct']);

const PRODUCER_CONTINUATION_FIELDS = new Set([
  'agentName',
  'runtime',
  'runtimeHandle',
  'status',
  'lastDispatchId',
  'badReason',
  'updatedAt',
]);

const TERMINAL_RESULT_FIELDS = new Set([
  'terminalResultId',
  'status',
]);

const TASK_CHECKPOINT_FORBIDDEN_FIELDS = new Set([
  'currentSpecificationPath',
  'currentStep',
  'manifest',
]);

function assertSupportedTaskCheckpointFields(value, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSupportedTaskCheckpointFields(item, pathParts.concat(String(index))));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const currentPath = pathParts.concat(key).join('.');
    if (pathParts.length === 0 && !TASK_CHECKPOINT_FIELDS.has(key)) {
      throw new Error(`Unsupported task checkpoint field: ${currentPath}`);
    }
    if (TASK_CHECKPOINT_FORBIDDEN_FIELDS.has(key)) {
      throw new Error(`Unsupported task checkpoint field: ${currentPath}`);
    }
    assertSupportedTaskCheckpointFields(child, pathParts.concat(key));
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function assertCheckpointObject(value, fieldPath) {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldPath} must be a JSON object`);
  }
}

function assertCheckpointNullableObject(value, fieldPath) {
  if (value !== null && !isPlainObject(value)) {
    throw new Error(`${fieldPath} must be null or a JSON object`);
  }
}

function assertCheckpointString(value, fieldPath) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldPath} must be a non-empty string`);
  }
}

function producerContinuationKey(entry) {
  return `${entry.agentName}/${entry.runtime}`;
}

function validateRuntimeHandle(runtime, runtimeHandle, pathLabel) {
  if (!VALID_RUNTIME_VALUES.has(runtime)) {
    throw new Error(`${pathLabel}.runtime must be one of: claude, codex`);
  }
  if (!isPlainObject(runtimeHandle)) {
    throw new Error(`${pathLabel}.runtimeHandle must be a JSON object`);
  }
  assertKnownJsonFields(runtimeHandle, `${pathLabel}.runtimeHandle`, new Set(['kind', 'id']));
  const expectedKind = RUNTIME_HANDLE_KINDS_BY_RUNTIME[runtime];
  if (runtimeHandle.kind !== expectedKind) {
    throw new Error(`${pathLabel}.runtimeHandle.kind must be ${expectedKind} for runtime ${runtime}`);
  }
  if (!isNonEmptyString(runtimeHandle.id)) {
    throw new Error(`${pathLabel}.runtimeHandle.id must be a non-empty string`);
  }
}

function validateProducerContinuations(value, pathLabel = 'producerContinuations') {
  if (!Array.isArray(value)) {
    throw new Error(`${pathLabel} must be an array`);
  }

  const seen = new Set();
  value.forEach((entry, index) => {
    const entryPath = `${pathLabel}[${index}]`;
    if (!isPlainObject(entry)) {
      throw new Error(`${entryPath} must be a JSON object`);
    }
    assertKnownJsonFields(entry, entryPath, PRODUCER_CONTINUATION_FIELDS);
    if (!RESUMABLE_PRODUCER_AGENTS.has(entry.agentName)) {
      throw new Error(`${entryPath}.agentName must be a resumable producer agent`);
    }
    if (!VALID_RUNTIME_VALUES.has(entry.runtime)) {
      throw new Error(`${entryPath}.runtime must be one of: claude, codex`);
    }
    validateRuntimeHandle(entry.runtime, entry.runtimeHandle, entryPath);
    if (!PRODUCER_CONTINUATION_STATUSES.has(entry.status)) {
      throw new Error(`${entryPath}.status must be one of: available, bad`);
    }
    if (entry.status === 'bad') {
      assertCheckpointString(entry.badReason, `${entryPath}.badReason`);
    } else if (entry.badReason !== null) {
      throw new Error(`${entryPath}.badReason must be null for available handles`);
    }
    if (entry.lastDispatchId !== null && !isNonEmptyString(entry.lastDispatchId)) {
      throw new Error(`${entryPath}.lastDispatchId must be null or a non-empty string`);
    }
    assertCheckpointString(entry.updatedAt, `${entryPath}.updatedAt`);

    const key = producerContinuationKey(entry);
    if (seen.has(key)) {
      throw new Error(`duplicate producerContinuations entry for ${key}`);
    }
    seen.add(key);
  });
}

function upsertProducerContinuation(taskState, { agentName, runtime, runtimeHandle, lastDispatchId, updatedAt }) {
  const producerContinuations = Array.isArray(taskState.producerContinuations)
    ? taskState.producerContinuations
    : [];
  validateProducerContinuations(producerContinuations);
  const replacement = {
    agentName,
    runtime,
    runtimeHandle,
    status: 'available',
    lastDispatchId,
    badReason: null,
    updatedAt,
  };
  validateProducerContinuations([replacement]);

  let replaced = false;
  const nextContinuations = producerContinuations.map((entry) => {
    if (entry.agentName === agentName && entry.runtime === runtime) {
      replaced = true;
      return replacement;
    }
    return entry;
  });
  if (!replaced) {
    nextContinuations.push(replacement);
  }
  validateProducerContinuations(nextContinuations);
  return {
    ...taskState,
    producerContinuations: nextContinuations,
    updatedAt,
  };
}

function markProducerContinuationBad(taskState, { agentName, runtime, badReason, updatedAt }) {
  const producerContinuations = Array.isArray(taskState.producerContinuations)
    ? taskState.producerContinuations
    : [];
  validateProducerContinuations(producerContinuations);
  let matched = false;
  const nextContinuations = producerContinuations.map((entry) => {
    if (entry.agentName === agentName && entry.runtime === runtime) {
      matched = true;
      return {
        ...entry,
        status: 'bad',
        badReason,
        updatedAt,
      };
    }
    return entry;
  });
  if (!matched) {
    throw new CliJsonError({
      ok: false,
      error: {
        code: 'stateNotFound',
        message: `No producer continuation found for ${agentName}/${runtime}`,
      },
    });
  }
  validateProducerContinuations(nextContinuations);
  return {
    ...taskState,
    producerContinuations: nextContinuations,
    updatedAt,
  };
}

function assertTaskCheckpointShape(patch) {
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    assertCheckpointString(patch.status, 'status');
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'cursor')) {
    assertCheckpointObject(patch.cursor, 'cursor');
    for (const field of ['phase', 'stage', 'dispatchMode']) {
      if (Object.prototype.hasOwnProperty.call(patch.cursor, field)) {
        assertCheckpointString(patch.cursor[field], `cursor.${field}`);
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(patch.cursor, 'skill') &&
      patch.cursor.skill !== null
    ) {
      assertCheckpointString(patch.cursor.skill, 'cursor.skill');
    }
  }

  for (const field of ['artifacts', 'handoff']) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      assertCheckpointObject(patch[field], field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'loops')) {
    assertCheckpointObject(patch.loops, 'loops');
    if (
      Object.prototype.hasOwnProperty.call(patch.loops, 'outerCycles') &&
      !isNonNegativeInteger(patch.loops.outerCycles)
    ) {
      throw new Error('loops.outerCycles must be a non-negative integer');
    }
    if (Object.prototype.hasOwnProperty.call(patch.loops, 'phaseReviewCycles')) {
      if (!Array.isArray(patch.loops.phaseReviewCycles)) {
        throw new Error('loops.phaseReviewCycles must be an array');
      }
      patch.loops.phaseReviewCycles.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          throw new Error(`loops.phaseReviewCycles.${index} must be a JSON object`);
        }
        if (Object.prototype.hasOwnProperty.call(entry, 'phase')) {
          assertCheckpointString(entry.phase, `loops.phaseReviewCycles.${index}.phase`);
        }
        if (
          Object.prototype.hasOwnProperty.call(entry, 'cycles') &&
          !isNonNegativeInteger(entry.cycles)
        ) {
          throw new Error(`loops.phaseReviewCycles.${index}.cycles must be a non-negative integer`);
        }
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'pendingDecision')) {
    assertCheckpointNullableObject(patch.pendingDecision, 'pendingDecision');
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'parentContinuation')) {
    assertCheckpointNullableObject(patch.parentContinuation, 'parentContinuation');
    if (patch.parentContinuation !== null) {
      assertKnownJsonFields(patch.parentContinuation, 'parentContinuation', PARENT_CONTINUATION_FIELDS);
      for (const field of ['parentSkill', 'parentRunId', 'transport', 'resumeStep', 'parentStatusId']) {
        assertCheckpointString(patch.parentContinuation[field], `parentContinuation.${field}`);
      }
      if (!PARENT_CONTINUATION_TRANSPORTS.has(patch.parentContinuation.transport)) {
        throw new Error('parentContinuation.transport must be one of: agent, inline-skill, background, direct');
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'producerContinuations')) {
    validateProducerContinuations(patch.producerContinuations);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'terminalResult')) {
    assertCheckpointNullableObject(patch.terminalResult, 'terminalResult');
    if (patch.terminalResult !== null) {
      assertKnownJsonFields(patch.terminalResult, 'terminalResult', TERMINAL_RESULT_FIELDS);
      assertCheckpointString(patch.terminalResult.terminalResultId, 'terminalResult.terminalResultId');
      if (patch.terminalResult.status !== 'completed' && patch.terminalResult.status !== 'failed') {
        throw new Error('terminalResult.status must be one of: completed, failed');
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'decisions')) {
    if (!Array.isArray(patch.decisions)) {
      throw new Error('decisions must be an array');
    }
    patch.decisions.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        throw new Error(`decisions.${index} must be a JSON object`);
      }
    });
  }
}

function mergeTaskState(previous, patch) {
  assertSupportedTaskCheckpointFields(patch);
  assertTaskCheckpointShape(patch);
  return {
    ...mergePlainObjects(previous, patch),
    updatedAt: new Date().toISOString(),
  };
}

function taskCheckpoint(flags) {
  const statePath = flags.state && flags.state !== true ? path.resolve(String(flags.state)) : null;
  if (!statePath) {
    throw new Error('--state is required');
  }
  if (!fs.existsSync(statePath)) {
    throw new Error(`Task state file not found: ${statePath}`);
  }

  const patch = resolveJsonArgument(flags, 'data');
  assertCamelCaseJsonKeys(patch, 'task checkpoint data');
  const previous = readJsonFileStrict(statePath);
  const next = mergeTaskState(previous, patch);
  assertCamelCaseJsonKeys(next, 'task state');
  writeJsonAtomic(statePath, next);
  return output({ statePath });
}

function taskProducerContinuationMarkBad(flags) {
  const statePath = flags.state && flags.state !== true ? path.resolve(String(flags.state)) : null;
  const agentName = flags['agent-name'] && flags['agent-name'] !== true ? String(flags['agent-name']) : null;
  const runtime = flags.runtime && flags.runtime !== true ? String(flags.runtime) : null;
  const reason = flags.reason && flags.reason !== true ? String(flags.reason) : null;

  if (!statePath) {
    throw new Error('--state is required');
  }
  if (!fs.existsSync(statePath)) {
    throw new Error(`Task state file not found: ${statePath}`);
  }
  if (!RESUMABLE_PRODUCER_AGENTS.has(agentName)) {
    throw new Error('--agent-name must be a resumable producer agent');
  }
  if (!VALID_RUNTIME_VALUES.has(runtime)) {
    throw new Error('--runtime must be one of: claude, codex');
  }
  if (!isNonEmptyString(reason)) {
    throw new Error('--reason is required');
  }

  const previous = readJsonFileStrict(statePath);
  const updatedAt = new Date().toISOString();
  const next = markProducerContinuationBad(previous, {
    agentName,
    runtime,
    badReason: reason,
    updatedAt,
  });
  assertCamelCaseJsonKeys(next, 'task state');
  writeJsonAtomic(statePath, next);

  const updatedEntry = next.producerContinuations.find(entry => entry.agentName === agentName && entry.runtime === runtime);
  return output({
    statePath,
    updatedEntry,
    preservedCount: next.producerContinuations.length - 1,
  });
}

// ============================================================================
// Subcommands: task decision
// ============================================================================

const DECISION_RECORD_FIELDS = new Set([
  'id',
  'attentionId',
  'sourceSkill',
  'prompt',
  'answer',
  'interpretation',
  'status',
  'supersedesDecisionIds',
  'supersedesProjectDecisionRefs',
  'supersededByDecisionId',
  'createdAt',
]);

const DECISION_REQUIRED_STRING_FIELDS = ['id', 'attentionId', 'sourceSkill', 'prompt', 'answer', 'interpretation', 'createdAt'];

function resolveTaskStatePathForDecision(flags) {
  const statePath = flags.state && flags.state !== true ? path.resolve(String(flags.state)) : null;
  if (!statePath) {
    lifecycleError('invalidInput', '--state is required');
  }
  if (!fs.existsSync(statePath)) {
    lifecycleError('stateNotFound', `Task state file not found: ${statePath}`);
  }
  return statePath;
}

function inferFixmeDirFromTaskStatePath(statePath) {
  let dir = path.dirname(path.resolve(statePath));
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (path.basename(dir) === '.fixme' && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function resolveFixmeDirForTaskState(flags, state, statePath = null) {
  if (Object.prototype.hasOwnProperty.call(flags, 'fixme-dir')) {
    const raw = flags['fixme-dir'];
    if (raw === true || raw === '') {
      lifecycleError('invalidInput', '--fixme-dir requires a path value');
    }
    return path.resolve(String(raw));
  }
  if (statePath) {
    const inferred = inferFixmeDirFromTaskStatePath(statePath);
    if (inferred) {
      return inferred;
    }
  }
  if (state && isNonEmptyString(state.projectRoot)) {
    return path.join(state.projectRoot, '.fixme');
  }
  lifecycleError('invalidInput', 'Cannot resolve fixme directory: task state lacks projectRoot and no --fixme-dir supplied');
}

function readProjectDecisionMarkdown(fixmeDir) {
  const decisionsPath = path.join(fixmeDir, 'decisions.md');
  if (!fs.existsSync(decisionsPath)) {
    return '';
  }
  return fs.readFileSync(decisionsPath, 'utf8');
}

function projectDecisionRefExists(projectMarkdown, ref) {
  // Project decisions use `### Decision N` headings. A ref like "Decision 11"
  // matches the heading `### Decision 11`.
  const pattern = new RegExp(`^###\\s+${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  return pattern.test(projectMarkdown);
}

function renderTaskDecisionMarkdown(decisions) {
  if (!decisions.length) {
    return '';
  }
  const lines = ['## Task-Owned Decisions', ''];
  for (const d of decisions) {
    lines.push(`### ${d.id}`);
    lines.push(`- **Prompt**: ${d.prompt}`);
    lines.push(`- **Answer**: ${d.answer}`);
    lines.push(`- **Interpretation**: ${d.interpretation}`);
    if (Array.isArray(d.supersedesDecisionIds) && d.supersedesDecisionIds.length) {
      lines.push(`- **Supersedes**: ${d.supersedesDecisionIds.join(', ')}`);
    }
    if (Array.isArray(d.supersedesProjectDecisionRefs) && d.supersedesProjectDecisionRefs.length) {
      lines.push(`- **Supersedes project decisions**: ${d.supersedesProjectDecisionRefs.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function buildMergedDecisionMarkdown(projectMarkdown, activeDecisions) {
  const taskMarkdown = renderTaskDecisionMarkdown(activeDecisions);
  const parts = [];
  if (projectMarkdown.trim()) {
    parts.push(projectMarkdown.trim());
  }
  if (taskMarkdown) {
    parts.push(taskMarkdown);
  }
  return parts.join('\n\n');
}

function buildDecisionContext(state, fixmeDir, { includeSuperseded = false } = {}) {
  const all = Array.isArray(state.decisions) ? state.decisions : [];
  const taskDecisions = includeSuperseded ? all : all.filter(d => d.status === 'active');
  const activeDecisions = all.filter(d => d.status === 'active');
  const projectDecisionMarkdown = readProjectDecisionMarkdown(fixmeDir);
  const taskDecisionMarkdown = renderTaskDecisionMarkdown(activeDecisions);
  const mergedMarkdown = buildMergedDecisionMarkdown(projectDecisionMarkdown, activeDecisions);
  return { taskDecisions, taskDecisionMarkdown, projectDecisionMarkdown, mergedMarkdown };
}

function validateTaskDecisionRecord(record) {
  try {
    assertCamelCaseJsonKeys(record, 'task decision');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  try {
    assertKnownJsonFields(record, 'task decision', DECISION_RECORD_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }

  for (const field of DECISION_REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(record[field])) {
      lifecycleError('missingRequiredField', `task decision field '${field}' must be a non-empty string`);
    }
  }
  if (!Array.isArray(record.supersedesDecisionIds)) {
    lifecycleError('missingRequiredField', "task decision field 'supersedesDecisionIds' must be an array");
  }
  if (Object.prototype.hasOwnProperty.call(record, 'supersedesProjectDecisionRefs') && !Array.isArray(record.supersedesProjectDecisionRefs)) {
    lifecycleError('invalidInput', "task decision field 'supersedesProjectDecisionRefs' must be an array");
  }
  if (record.status !== 'active') {
    lifecycleError('invalidInput', "task decision 'status' must be 'active' on append");
  }
  if (record.supersededByDecisionId !== null && record.supersededByDecisionId !== undefined) {
    lifecycleError('invalidInput', "task decision 'supersededByDecisionId' must be null on append");
  }
}

function appendTaskDecisionRecordToState(state, fixmeDir, record) {
  const decisions = Array.isArray(state.decisions) ? state.decisions.map(cloneJson) : [];

  // Idempotency by id.
  const existing = decisions.find(d => d.id === record.id);
  if (existing) {
    const incoming = normalizeDecisionForCompare(record);
    if (jsonEqual(normalizeDecisionForCompare(existing), incoming)) {
      return { state, decision: existing, changed: false, alreadyExisting: true };
    }
    lifecycleError('conflictingDuplicate', `task decision '${record.id}' already exists with different data`);
  }

  // Validate task-owned supersede references.
  for (const refId of record.supersedesDecisionIds) {
    const target = decisions.find(d => d.id === refId);
    if (!target) {
      lifecycleError('invalidInput', `supersedesDecisionIds references unknown task-owned decision '${refId}'`);
    }
    if (target.status !== 'active') {
      lifecycleError('invalidInput', `supersedesDecisionIds references already-superseded task-owned decision '${refId}'`);
    }
  }

  // Validate project decision references.
  const projectMarkdown = readProjectDecisionMarkdown(fixmeDir);
  const projectRefs = Array.isArray(record.supersedesProjectDecisionRefs) ? record.supersedesProjectDecisionRefs : [];
  for (const ref of projectRefs) {
    if (!isNonEmptyString(ref) || !projectDecisionRefExists(projectMarkdown, ref)) {
      lifecycleError('invalidInput', `supersedesProjectDecisionRefs references unknown project decision '${ref}'`);
    }
  }

  // Apply supersession atomically.
  for (const refId of record.supersedesDecisionIds) {
    const target = decisions.find(d => d.id === refId);
    target.status = 'superseded';
    target.supersededByDecisionId = record.id;
  }
  const newRecord = cloneJson(record);
  if (!Array.isArray(newRecord.supersedesProjectDecisionRefs)) {
    newRecord.supersedesProjectDecisionRefs = [];
  }
  newRecord.supersededByDecisionId = null;
  decisions.push(newRecord);

  const nextState = { ...state, decisions, updatedAt: new Date().toISOString() };
  assertCamelCaseJsonKeys(nextState, 'task state');
  return { state: nextState, decision: newRecord, changed: true, alreadyExisting: false };
}

function taskDecisionAppendPayload(decision, state, fixmeDir, compact = false) {
  if (compact) {
    return { decision, compact: true };
  }
  return { decision, ...buildDecisionContext(state, fixmeDir) };
}

function taskDecisionAppend(flags) {
  const statePath = resolveTaskStatePathForDecision(flags);
  let record;
  try {
    record = resolveJsonArgument(flags, 'data');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  validateTaskDecisionRecord(record);

  const state = readJsonFileStrict(statePath);
  const fixmeDir = resolveFixmeDirForTaskState(flags, state, statePath);
  const result = appendTaskDecisionRecordToState(state, fixmeDir, record);
  if (result.changed) {
    writeJsonAtomic(statePath, result.state);
  }

  return lifecycleOk(taskDecisionAppendPayload(
    result.decision,
    result.state,
    fixmeDir,
    Object.prototype.hasOwnProperty.call(flags, 'compact')
  ));
}

function normalizeDecisionForCompare(record) {
  const copy = cloneJson(record);
  // Status and supersededByDecisionId are mutated by later supersession, so compare durable inputs only.
  delete copy.status;
  delete copy.supersededByDecisionId;
  if (!Array.isArray(copy.supersedesProjectDecisionRefs)) {
    copy.supersedesProjectDecisionRefs = [];
  }
  return copy;
}

function taskDecisionList(flags) {
  const statePath = resolveTaskStatePathForDecision(flags);
  const state = readJsonFileStrict(statePath);
  const fixmeDir = resolveFixmeDirForTaskState(flags, state, statePath);
  const includeSuperseded = Object.prototype.hasOwnProperty.call(flags, 'include-superseded');
  const context = buildDecisionContext(state, fixmeDir, { includeSuperseded });

  if (Object.prototype.hasOwnProperty.call(flags, 'task-owned-only')) {
    const all = Array.isArray(state.decisions) ? state.decisions : [];
    const taskDecisions = includeSuperseded ? all : all.filter(d => d.status === 'active');
    return lifecycleOk({ taskDecisions, taskDecisionMarkdown: context.taskDecisionMarkdown });
  }

  const result = {
    taskDecisions: context.taskDecisions,
    taskDecisionMarkdown: context.taskDecisionMarkdown,
    projectDecisionMarkdown: context.projectDecisionMarkdown,
    mergedMarkdown: context.mergedMarkdown,
  };
  if (flags.format === 'markdown') {
    result.markdown = context.mergedMarkdown;
  }
  return lifecycleOk(result);
}

// ============================================================================
// Subcommands: task result
// ============================================================================

const TASK_RESULT_FAILURE_REASONS = new Set([
  'userAborted', 'verificationFailed', 'usageTrackingFailed', 'runtimeError', 'dispatchFailed',
  'timeout', 'invalidUsageRequest', 'attentionBlocked', 'workflowBlocked', 'childFailed',
  'toolUnavailable', 'unknown',
]);

const TASK_RESULT_FIELDS = new Set(['status', 'summaryMarkdown', 'changedFiles', 'artifactPaths', 'failure']);

function taskResultSummaryPath(taskStatePath) {
  if (taskStatePath.endsWith('task-state.json')) {
    return taskStatePath.replace(/task-state\.json$/, 'task-state.result.json');
  }
  if (taskStatePath.endsWith('.state.json')) {
    return taskStatePath.replace(/\.state\.json$/, '.result.json');
  }
  if (taskStatePath.endsWith('.json')) {
    return taskStatePath.replace(/\.json$/, '.result.json');
  }
  return `${taskStatePath}.result.json`;
}

function normalizeTaskResultDurableFields(summary) {
  return {
    status: summary.status,
    summaryMarkdown: isNonEmptyString(summary.summaryMarkdown) ? summary.summaryMarkdown : '',
    failure: summary.failure === undefined ? null : summary.failure,
    changedFiles: Array.isArray(summary.changedFiles) ? summary.changedFiles : [],
    artifactPaths: Array.isArray(summary.artifactPaths) ? summary.artifactPaths : [],
  };
}

function taskResultWrite(flags) {
  const statePath = resolveTaskStatePathForDecision(flags);
  const data = resolveLifecycleData(flags);
  try {
    assertKnownJsonFields(data, 'task result', TASK_RESULT_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  if (data.status !== 'completed' && data.status !== 'failed') {
    lifecycleError('invalidInput', 'status must be one of: completed, failed');
  }
  let failure = null;
  if (data.status === 'failed') {
    if (!isPlainObject(data.failure) || !TASK_RESULT_FAILURE_REASONS.has(data.failure.reason) || !isNonEmptyString(data.failure.message)) {
      lifecycleError('invalidInput', 'failed result requires failure with a valid reason and non-empty message');
    }
    failure = { reason: data.failure.reason, message: data.failure.message };
    if (data.failure.details !== undefined) {
      if (!isPlainObject(data.failure.details)) {
        lifecycleError('invalidInput', 'failure.details must be a JSON object');
      }
      try {
        assertCamelCaseJsonKeys(data.failure.details, 'failure.details');
      } catch (e) {
        lifecycleError('invalidInput', e.message);
      }
      failure.details = data.failure.details;
    }
  } else if (data.failure !== undefined && data.failure !== null) {
    lifecycleError('invalidInput', 'completed result must not include failure');
  }

  const state = readJsonFileStrict(statePath);
  const summaryPath = taskResultSummaryPath(statePath);
  const incomingDurableFields = normalizeTaskResultDurableFields({
    status: data.status,
    summaryMarkdown: data.summaryMarkdown,
    changedFiles: data.changedFiles,
    artifactPaths: data.artifactPaths,
    failure,
  });

  const existingTerminalResultId = state.terminalResult && state.terminalResult.terminalResultId;
  if (fs.existsSync(summaryPath)) {
    const existingSummary = readJsonFileStrict(summaryPath);
    if (!isNonEmptyString(existingSummary.terminalResultId)) {
      lifecycleError('invalidInput', 'existing result summary missing terminalResultId');
    }
    if (isNonEmptyString(existingTerminalResultId) && existingTerminalResultId !== existingSummary.terminalResultId) {
      lifecycleError('conflictingDuplicate', `task state terminalResultId '${existingTerminalResultId}' conflicts with existing result summary '${existingSummary.terminalResultId}'`);
    }
    const existingDurableFields = normalizeTaskResultDurableFields(existingSummary);
    if (jsonEqual(existingDurableFields, incomingDurableFields)) {
      const nextState = mergeTaskState(state, {
        status: existingSummary.status,
        terminalResult: { terminalResultId: existingSummary.terminalResultId, status: existingSummary.status },
      });
      assertCamelCaseJsonKeys(nextState, 'task state');
      writeJsonAtomic(statePath, nextState);
      return lifecycleOk({ terminalResultId: existingSummary.terminalResultId, resultSummaryPath: summaryPath, status: existingSummary.status });
    }
    lifecycleError('conflictingDuplicate', `terminal result '${existingSummary.terminalResultId}' already exists with different data`);
  }

  const terminalResultId = isNonEmptyString(existingTerminalResultId)
    ? existingTerminalResultId
    : generateUsageId('terminalResult');

  const summary = {
    schemaVersion: 1,
    terminalResultId,
    taskStatePath: statePath,
    ...incomingDurableFields,
    createdAt: new Date().toISOString(),
  };
  assertCamelCaseJsonKeys(summary, 'task result summary');
  writeJsonAtomic(summaryPath, summary);

  const nextState = mergeTaskState(state, {
    status: data.status,
    terminalResult: { terminalResultId, status: data.status },
  });
  assertCamelCaseJsonKeys(nextState, 'task state');
  writeJsonAtomic(statePath, nextState);

  return lifecycleOk({ terminalResultId, resultSummaryPath: summaryPath, status: data.status });
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
  let data;
  try {
    data = resolveJsonArgument(flags, 'data', { missingMessage: '--data is required for context save (JSON string)' });
  } catch (e) {
    if (e.message.startsWith('--data must be valid JSON')) {
      return error(`Invalid JSON in --data: ${e.message.replace(/^--data must be valid JSON: /, '')}`);
    }
    return error(e.message);
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
    .replace(/\.claude\//g, '.codex/')
    .replace(/"runtime"\s*:\s*"claude"/g, '"runtime":"codex"');
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
    '- When you call `lifecycle dispatch prepare`, include `"runtime":"codex"` in every `lifecycle dispatch prepare` JSON payload.',
    '- `resume_agent` resumes a previously closed agent so it can receive `send_input` and `wait_agent` calls.',
    '- When `lifecycle dispatch prepare` returns `continuation.mode: "resume"` and `runtimeHandle.kind: "codexAgentId"`, call `resume_agent({ id })`, then `send_input({ target: id, message })`, then `wait_agent({ targets: [id] })`.',
    '- When fresh-dispatching a resumable producer with `spawn_agent`, preserve the returned agent id and pass it as `runtimeHandle` to `lifecycle dispatch complete`.',
    '- After a fresh or resumed producer reaches a terminal result and lifecycle completion is recorded, call `close_agent({ target: id })`; do not keep producer agents open between phases.',
    '- On runtime resume failure, call `lifecycle dispatch complete` with `status: "failed"` and a concrete `failure` payload, then mark the handle bad via `task producer-continuation mark-bad`, then prepare a fresh fallback with `forceFreshReason`.',
    '- If the requested Fixme agent type is unavailable, use the workflow documented fallback. If no fallback is documented, stop with a dispatch blocker.',
    '',
    '## Attention Brokers',
    '',
    '- When acting as a Fixme attention broker, record only the raw answer with `lifecycle attention broker answer`; do not run `task decision append`, `task checkpoint`, `run attention clear`, or `lifecycle dispatch prepare`.',
    '- Resume the existing `fixme-task` with `--resume <ref> --answer-attention <attention-id>` and let `fixme-task` consume the answer.',
    '',
    '## Workflow Manifests',
    '',
    '- When Fixme source instructions require a live manifest task list, use Codex `update_plan`.',
    '- If `update_plan` is unavailable, stop with a manifest-tool blocker instead of tracking the manifest in prose.',
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
    'If the dispatch prompt includes `pipelineRunId`, include `--pipeline-run-id <pipelineRunId>`. If it includes `parentInvocationId`, include `--parent-invocation-id <parentInvocationId>`. Never pass the reserved task flag.',
    '',
    'Store the returned `invocationId`. On normal completion, run `usage finish --invocation-id <invocationId> --outcome complete`. On failure, use `--outcome failed --reason <reason>`. On abort, use `--outcome aborted --reason <reason>`. Reasons must be one of: `verification_failed`, `user_aborted`, `usage_tracking_failed`, `runtime_error`, `dispatch_failed`, `timeout`, `invalid_usage_request`, or `unknown`.',
    '',
    'If usage start or finish fails, print a warning with the skill name, invocation ID when known, failed operation, and fallback, then continue the normal skill completion path.',
    '',
    'Run `usage finish` and relay any returned `reportLine` before writing any required final routing or status directive. The final routing/status directive must remain the last content in the skill output. If `usage finish` is suppressed, do not invent a usage line.',
    '',
    '## Fixme Agent Liveness',
    '',
    'If the dispatch prompt does not include `statusId`, skip this liveness block.',
    '',
    'If the dispatch prompt includes `statusId`, use the `Fixme dir:` value from the `<project>` block as `<fixme-dir>`. Ping liveness through the same installed runtime tool path:',
    '',
    '```bash',
    `node ${toolPath} run ping --fixme-dir <fixme-dir> --status-id <statusId> --state running --checkpoint started --current-command null`,
    '```',
    '',
    'Use only these states: `running`, `waiting`, `blocked`, `completed`, `failed`.',
    'Use only these checkpoints: `dispatched`, `started`, `working`, `waiting`, `finalizing`, `done`.',
    '',
    'Ping `running/working` before main work. Before any shell command that may take more than a few seconds, ping `running/working` with `--current-command "<command>"`; after it finishes, ping again with `--current-command null`.',
    'Before waiting on any Agent, Skill, or child dispatch, ping `running/working` with `--current-command "waiting for <child-name>"`; after the child returns, ping again with `--current-command null`.',
    '',
    'If `run status` shows `currentCommand` starting with `attention:`, do not send ordinary `run ping` until the owning skill consumes the answer with `run attention clear`. Attention records own their waiting status; after `run attention set` succeeds, return or broker the attention directive directly.',
    '',
    'Before pausing for user input or parent instruction, ping `waiting/waiting`. If blocked, ping `blocked/waiting`. Before normal final output, ping `completed/done`. On failure, ping `failed/done`.',
    '',
    'Do not relay liveness command JSON to the user unless it fails. If a liveness ping fails, print a warning with the skill name, `statusId`, failed operation, and fallback, then continue the normal skill path.',
    '',
    'Example ping shape:',
    '',
    '```bash',
    `node ${toolPath} run ping --fixme-dir <fixme-dir> --status-id <statusId> --state running --checkpoint working --current-command "yarn test"`,
    '```',
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
  lines.push('- When calling `lifecycle dispatch prepare`, include `"runtime":"codex"` in the JSON payload so lifecycle runtime settings match Codex dispatch.');
  lines.push('- `resume_agent` resumes a previously closed agent so it can receive `send_input` and `wait_agent` calls.');
  lines.push('- When `lifecycle dispatch prepare` returns `continuation.mode: "resume"` and `runtimeHandle.kind: "codexAgentId"`, call `resume_agent({ id })`, then `send_input({ target: id, message })`, then `wait_agent({ targets: [id] })`.');
  lines.push('- When fresh-dispatching a resumable producer with `spawn_agent`, preserve the returned agent id and pass it as `runtimeHandle` to `lifecycle dispatch complete`.');
  lines.push('- After a fresh or resumed producer reaches a terminal result and lifecycle completion is recorded, call `close_agent({ target: id })`; do not keep producer agents open between phases.');
  lines.push('- On runtime resume failure, call `lifecycle dispatch complete` with `status: "failed"` and a concrete `failure` payload, then mark the handle bad via `task producer-continuation mark-bad`, then prepare a fresh fallback with `forceFreshReason`.');
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

function buildClaudeUsageHookCommand(claudeDir) {
  const toolPath = path.join(claudeDir, 'skills', 'fixme-tools', 'scripts', 'fixme-tools.cjs');
  return `node ${JSON.stringify(toolPath)} usage claude-hook`;
}

function removeManagedClaudeUsageHooks(groups) {
  if (!Array.isArray(groups)) return [];
  const cleaned = [];
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const hooks = Array.isArray(group.hooks)
      ? group.hooks.filter(hook => {
        if (!hook || typeof hook !== 'object') return true;
        return !(hook.type === 'command' && typeof hook.command === 'string' && hook.command.includes('usage claude-hook'));
      })
      : [];
    if (hooks.length > 0) cleaned.push({ ...group, hooks });
  }
  return cleaned;
}

function installClaudeUsageHook(claudeDir) {
  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = readJsonFileStrict(settingsPath);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error(`Claude settings must be a JSON object: ${settingsPath}`);
    }
  }
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }

  const existing = removeManagedClaudeUsageHooks(settings.hooks.UserPromptSubmit);
  existing.push({
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: buildClaudeUsageHookCommand(claudeDir),
      },
    ],
  });
  settings.hooks.UserPromptSubmit = existing;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeJsonAtomic(settingsPath, settings);
  return settingsPath;
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
  const settingsPath = installClaudeUsageHook(claudeDir);

  return {
    claudeDir: path.resolve(claudeDir),
    skillsDir: path.resolve(skillsDir),
    settingsPath: path.resolve(settingsPath),
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

function usageClaudeHook() {
  let input;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    return output({ recorded: false, reason: `Invalid hook JSON: ${e.message}` });
  }
  if (!input || typeof input !== 'object') {
    return output({ recorded: false, reason: 'Hook input was not an object' });
  }

  const hookEventName = typeof input.hook_event_name === 'string' ? input.hook_event_name : null;
  if (hookEventName !== 'UserPromptSubmit') {
    return output({ recorded: false, reason: 'Unsupported hook event', hookEventName });
  }

  const rawSessionId = input.session_id || input.sessionId;
  const sessionId = typeof rawSessionId === 'string' && /^[A-Za-z0-9_-]+$/.test(rawSessionId)
    ? rawSessionId
    : null;
  const rawSourcePath = input.agent_transcript_path || input.transcript_path || input.agentTranscriptPath || input.transcriptPath;
  const sourcePath = typeof rawSourcePath === 'string' && rawSourcePath.trim()
    ? path.resolve(expandHomePath(rawSourcePath))
    : null;
  const cwd = typeof input.cwd === 'string' && input.cwd.trim()
    ? path.resolve(expandHomePath(input.cwd))
    : null;

  if (!sessionId || !sourcePath) {
    return output({
      recorded: false,
      reason: 'Hook input did not include session id and transcript path',
      hasSessionId: !!sessionId,
      hasSourcePath: !!sourcePath,
      hookEventName,
    });
  }

  const statePath = claudeSessionSourcePath(sessionId);
  const state = {
    schemaVersion: 1,
    sessionId,
    sourcePath,
    cwd,
    hookEventName,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeJsonAtomic(statePath, state);

  return output({
    recorded: true,
    sessionId,
    sourcePath,
    statePath,
  });
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

// ============================================================================
// Subcommands: run
// ============================================================================

function validateRunFixmeDir(rawFixmeDir) {
  if (!rawFixmeDir || rawFixmeDir === true) {
    throw new Error('--fixme-dir is required');
  }
  if (!path.isAbsolute(rawFixmeDir)) {
    throw new Error('--fixme-dir must be an absolute path');
  }
  return rawFixmeDir;
}

function validateRunAgent(agent) {
  if (!agent || agent === true) {
    throw new Error('--agent is required');
  }
  if (!KNOWN_FIXME_AGENTS.has(agent)) {
    throw new Error(`Unsupported run agent: ${agent}`);
  }
  return agent;
}

function validateRequiredRunId(rawStatusId) {
  const statusId = validateUsageId(rawStatusId, 'statusId');
  if (!statusId) {
    throw new Error('--status-id is required');
  }
  return statusId;
}

function validateRunState(state) {
  if (!state || state === true) {
    throw new Error('--state is required');
  }
  if (!RUN_STATES.includes(state)) {
    throw new Error(`Unsupported run state: ${state}`);
  }
  return state;
}

function validateRunCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint === true) {
    throw new Error('--checkpoint is required');
  }
  if (!RUN_CHECKPOINTS.includes(checkpoint)) {
    throw new Error(`Unsupported run checkpoint: ${checkpoint}`);
  }
  return checkpoint;
}

function normalizeRunCurrentCommand(rawCurrentCommand) {
  if (rawCurrentCommand === undefined) {
    throw new Error('--current-command is required');
  }
  if (rawCurrentCommand === true || rawCurrentCommand === '' || rawCurrentCommand === 'null') {
    return null;
  }
  return String(rawCurrentCommand);
}

function runStatusPath(fixmeDir, statusId) {
  return path.join(fixmeDir, 'runs', statusId, 'status.json');
}

function normalizeRunStatusRecord(rawStatus, expectedStatusId = null) {
  assertKnownJsonFields(rawStatus, 'run status', RUN_STATUS_FIELDS);
  if (rawStatus.schemaVersion !== 1) {
    throw new Error('run status schemaVersion must be 1');
  }
  if (typeof rawStatus.statusId !== 'string' || !rawStatus.statusId.trim()) {
    throw new Error('run status statusId is required');
  }
  if (expectedStatusId && rawStatus.statusId !== expectedStatusId) {
    throw new Error('run status statusId does not match requested statusId');
  }
  if (typeof rawStatus.agent !== 'string' || !rawStatus.agent.trim()) {
    throw new Error('run status agent is required');
  }
  if (!RUN_STATES.includes(rawStatus.state)) {
    throw new Error(`Unsupported run state: ${rawStatus.state}`);
  }
  if (!RUN_CHECKPOINTS.includes(rawStatus.checkpoint)) {
    throw new Error(`Unsupported run checkpoint: ${rawStatus.checkpoint}`);
  }
  if (!Object.prototype.hasOwnProperty.call(rawStatus, 'currentCommand')) {
    throw new Error('run status currentCommand is required');
  }
  if (rawStatus.currentCommand !== null && typeof rawStatus.currentCommand !== 'string') {
    throw new Error('run status currentCommand must be a string or null');
  }
  let failure;
  if (rawStatus.failure !== undefined) {
    if (!isPlainObject(rawStatus.failure) || !isNonEmptyString(rawStatus.failure.message)) {
      throw new Error('run status failure must be an object with a non-empty message');
    }
    failure = cloneJson(rawStatus.failure);
  }
  if (typeof rawStatus.updatedAt !== 'string' || Number.isNaN(Date.parse(rawStatus.updatedAt))) {
    throw new Error('run status updatedAt must be an ISO timestamp');
  }
  const normalized = {
    schemaVersion: rawStatus.schemaVersion,
    statusId: rawStatus.statusId,
    agent: rawStatus.agent,
    state: rawStatus.state,
    checkpoint: rawStatus.checkpoint,
    currentCommand: rawStatus.currentCommand,
    updatedAt: rawStatus.updatedAt,
  };
  if (failure !== undefined) {
    normalized.failure = failure;
  }
  return normalized;
}

function readRunStatusFile(statusPath, statusId = null) {
  const rawStatus = readJsonFileStrict(statusPath);
  assertCamelCaseJsonKeys(rawStatus, 'run status');
  return normalizeRunStatusRecord(rawStatus, statusId);
}

function runAttentionDirectory(fixmeDir, statusId) {
  return path.join(fixmeDir, 'runs', statusId, 'attention');
}

function runAttentionPath(fixmeDir, statusId, attentionId) {
  return path.join(runAttentionDirectory(fixmeDir, statusId), `${attentionId}.json`);
}

function validateAttentionId(rawAttentionId) {
  const attentionId = validateUsageId(rawAttentionId, 'attentionId');
  if (!attentionId) {
    throw new Error('--attention-id is required');
  }
  if (!attentionId.startsWith('attn_')) {
    throw new Error('attentionId must start with attn_');
  }
  return attentionId;
}

function normalizeOptionalAttentionId(data) {
  if (!Object.prototype.hasOwnProperty.call(data, 'attentionId')) {
    return generateUsageId('attn');
  }
  if (typeof data.attentionId !== 'string') {
    throw new Error('attentionId must be a non-empty string');
  }
  if (!data.attentionId.trim()) {
    throw new Error('attentionId must be a non-empty string');
  }
  if (data.attentionId.trim() !== data.attentionId) {
    throw new Error('attentionId must not contain surrounding whitespace');
  }
  return validateAttentionId(data.attentionId);
}

function requireRecordString(record, key, label) {
  if (typeof record[key] !== 'string' || record[key].trim().length === 0) {
    throw new Error(`${label} ${key} is required`);
  }
  return record[key];
}

function requireOptionalRecordString(record, key, label) {
  if (record[key] === null || record[key] === undefined) return null;
  if (typeof record[key] !== 'string' || record[key].trim().length === 0) {
    throw new Error(`${label} ${key} must be a non-empty string or null`);
  }
  return record[key];
}

function requireRecordIsoTimestamp(record, key, label) {
  if (typeof record[key] !== 'string' || Number.isNaN(Date.parse(record[key]))) {
    throw new Error(`${label} ${key} must be an ISO timestamp`);
  }
}

function normalizeRunAttentionRecord(record, attentionId) {
  assertKnownJsonFields(record, 'run attention record', RUN_ATTENTION_RECORD_FIELDS);
  if (record.attentionId !== attentionId) {
    const actualAttentionId = typeof record.attentionId === 'string' ? record.attentionId : String(record.attentionId);
    throw new Error(`Run attention record id mismatch: expected ${attentionId}, got ${actualAttentionId}`);
  }

  const ownerSkill = requireRecordString(record, 'ownerSkill', 'run attention record');
  const kind = requireRecordString(record, 'kind', 'run attention record');
  const sourceSkill = requireOptionalRecordString(record, 'sourceSkill', 'run attention record');
  const parentSkill = requireOptionalRecordString(record, 'parentSkill', 'run attention record');
  const resumeRef = requireOptionalRecordString(record, 'resumeRef', 'run attention record');
  const taskStatePath = requireOptionalRecordString(record, 'taskStatePath', 'run attention record');
  const answerMode = requireRecordString(record, 'answerMode', 'run attention record');
  if (typeof record.promptMarkdown !== 'string' || record.promptMarkdown.trim().length === 0) {
    throw new Error('run attention record promptMarkdown is required');
  }
  if (!RUN_ATTENTION_ANSWER_MODES.includes(answerMode)) {
    throw new Error(`Unsupported run attention answerMode: ${answerMode}`);
  }
  if (ownerSkill === 'fixme-task' && !sourceSkill) {
    throw new Error('run attention record sourceSkill is required for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !resumeRef) {
    throw new Error('run attention record resumeRef is required for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !taskStatePath) {
    throw new Error('run attention record taskStatePath is required for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !path.isAbsolute(taskStatePath)) {
    throw new Error('run attention record taskStatePath must be absolute for fixme-task owner');
  }
  if (!isPlainObject(record.metadata)) {
    throw new Error('run attention record metadata must be a JSON object');
  }
  if (!RUN_ATTENTION_RECORD_STATUSES.includes(record.status)) {
    throw new Error(`Unsupported run attention record status: ${record.status}`);
  }
  requireRecordIsoTimestamp(record, 'createdAt', 'run attention record');
  if (record.status === 'waiting') {
    if (record.answer !== null) {
      throw new Error('run attention record answer must be null while waiting');
    }
    if (record.answeredAt !== null) {
      throw new Error('run attention record answeredAt must be null while waiting');
    }
  } else {
    if (!isPlainObject(record.answer)) {
      throw new Error('run attention record answer must be a JSON object when answered');
    }
    assertKnownJsonFields(record.answer, 'run attention record answer', RUN_ATTENTION_ANSWER_FIELDS);
    if (typeof record.answer.answer !== 'string' || record.answer.answer.trim().length === 0) {
      throw new Error('run attention record answer.answer must be a non-empty string');
    }
    if (!RUN_ATTENTION_ANSWER_KINDS.includes(record.answer.answerKind)) {
      throw new Error(`Unsupported run attention answerKind: ${record.answer.answerKind}`);
    }
    if (record.answer.answeredBy !== 'user') {
      throw new Error('run attention record answer.answeredBy must be user');
    }
    requireRecordIsoTimestamp(record, 'answeredAt', 'run attention record');
  }

  return {
    attentionId: record.attentionId,
    ownerSkill,
    sourceSkill,
    parentSkill,
    kind,
    resumeRef,
    taskStatePath,
    promptMarkdown: record.promptMarkdown,
    answerMode,
    metadata: record.metadata,
    status: record.status,
    answer: record.answer,
    createdAt: record.createdAt,
    answeredAt: record.answeredAt,
  };
}

function readRunStatusForAttention(fixmeDir, statusId) {
  const statusPath = runStatusPath(fixmeDir, statusId);
  if (!fs.existsSync(statusPath)) {
    throw new Error(`Run status not found: ${statusId}`);
  }
  return { statusPath, status: readRunStatusFile(statusPath, statusId) };
}

function requireRunReadyForAttentionSet(status) {
  if (status.currentCommand && String(status.currentCommand).startsWith('attention:')) {
    throw new Error(`Run already has pending attention: ${status.currentCommand}`);
  }
  if (status.state === 'completed' || status.state === 'failed') {
    throw new Error(`Cannot set attention for terminal run state: ${status.state}`);
  }
}

function requireRunWaitingOnAttention(status, attentionId) {
  if (status.state !== 'waiting' || status.currentCommand !== `attention:${attentionId}`) {
    throw new Error(`Run is not waiting on attention: ${attentionId}`);
  }
}

function isRunAttentionCommand(command) {
  return typeof command === 'string' && command.startsWith('attention:');
}

function requireRunPingCanUpdate(previous, nextState, nextCurrentCommand) {
  if (!isRunAttentionCommand(previous.currentCommand)) {
    return;
  }

  const keepsSameAttention = nextState === 'waiting' && nextCurrentCommand === previous.currentCommand;
  const terminalFailure = nextState === 'failed';
  if (!keepsSameAttention && !terminalFailure) {
    throw new Error(`Run has pending attention: ${previous.currentCommand}; use run attention clear before updating liveness`);
  }
}

function writeRunStatus(statusPath, status) {
  assertCamelCaseJsonKeys(status, 'run status');
  writeJsonAtomic(statusPath, status);
  return { ...status, statusPath };
}

function runStartCore(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const agent = validateRunAgent(flags.agent);
  const statusId = generateUsageId('run');
  const statusPath = runStatusPath(fixmeDir, statusId);
  return writeRunStatus(statusPath, {
    schemaVersion: 1,
    statusId,
    agent,
    state: 'running',
    checkpoint: 'dispatched',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
  });
}

function runStart(flags) {
  return output(runStartCore(flags));
}

function runPing(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const statusId = validateRequiredRunId(flags['status-id']);
  const state = validateRunState(flags.state);
  const checkpoint = validateRunCheckpoint(flags.checkpoint);
  const currentCommand = normalizeRunCurrentCommand(flags['current-command']);
  const statusPath = runStatusPath(fixmeDir, statusId);
  if (!fs.existsSync(statusPath)) {
    return error(`Run status not found: ${statusId}`);
  }

  const previous = readRunStatusFile(statusPath, statusId);
  requireRunPingCanUpdate(previous, state, currentCommand);
  const next = {
    schemaVersion: 1,
    statusId,
    agent: validateRunAgent(previous.agent),
    state,
    checkpoint,
    currentCommand,
    updatedAt: new Date().toISOString(),
  };
  return output(writeRunStatus(statusPath, next));
}

function runStatus(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const statusId = validateRequiredRunId(flags['status-id']);
  const statusPath = runStatusPath(fixmeDir, statusId);
  if (!fs.existsSync(statusPath)) {
    return error(`Run status not found: ${statusId}`);
  }
  return output({ ...readRunStatusFile(statusPath, statusId), statusPath });
}

function resolveLivenessCompatFixmeDir(flags) {
  if (Object.prototype.hasOwnProperty.call(flags, 'fixme-dir')) {
    return validateRunFixmeDir(flags['fixme-dir']);
  }
  return path.join(findFixmeRoot(process.cwd()), '.fixme');
}

function normalizeLivenessCompatCheckpoint(rawPhase) {
  const checkpoint = rawPhase && rawPhase !== true ? String(rawPhase) : 'working';
  return validateRunCheckpoint(checkpoint);
}

function defaultRunStateForCheckpoint(checkpoint) {
  if (checkpoint === 'waiting') return 'waiting';
  if (checkpoint === 'done') return 'completed';
  return 'running';
}

function livenessCompatPing(flags) {
  const fixmeDir = resolveLivenessCompatFixmeDir(flags);
  const checkpoint = normalizeLivenessCompatCheckpoint(flags.phase || flags.checkpoint);
  const state = flags.state && flags.state !== true
    ? validateRunState(String(flags.state))
    : defaultRunStateForCheckpoint(checkpoint);
  const currentCommand = Object.prototype.hasOwnProperty.call(flags, 'current-command')
    ? flags['current-command']
    : (Object.prototype.hasOwnProperty.call(flags, 'message') ? flags.message : 'null');
  return runPing({
    'fixme-dir': fixmeDir,
    'status-id': flags['status-id'],
    state,
    checkpoint,
    'current-command': currentCommand,
  });
}

function livenessCompatStatus(flags) {
  return runStatus({
    'fixme-dir': resolveLivenessCompatFixmeDir(flags),
    'status-id': flags['status-id'],
  });
}

function normalizeRequiredAttentionDataString(data, key, errorMessage) {
  const value = data[key];
  if (typeof value !== 'string') {
    throw new Error(errorMessage);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(errorMessage);
  }
  return normalized;
}

function normalizeOptionalAttentionDataString(data, key, errorMessage) {
  if (!Object.prototype.hasOwnProperty.call(data, key)) {
    return null;
  }
  if (typeof data[key] !== 'string') {
    throw new Error(errorMessage);
  }
  const normalized = data[key].trim();
  if (!normalized) {
    throw new Error(errorMessage);
  }
  return normalized;
}

function normalizeAttentionSetData(rawData) {
  const data = isPlainObject(rawData) ? rawData : parseTaskData(rawData);
  assertCamelCaseJsonKeys(data, 'run attention data');

  const ownerSkill = normalizeRequiredAttentionDataString(data, 'ownerSkill', 'run attention data requires ownerSkill');
  const kind = normalizeRequiredAttentionDataString(data, 'kind', 'run attention data requires kind');
  const sourceSkill = normalizeOptionalAttentionDataString(
    data,
    'sourceSkill',
    ownerSkill === 'fixme-task'
      ? 'run attention data requires sourceSkill for fixme-task owner'
      : 'run attention data sourceSkill must be a non-empty string',
  );
  const parentSkill = normalizeOptionalAttentionDataString(data, 'parentSkill', 'run attention data parentSkill must be a non-empty string');
  const resumeRef = normalizeOptionalAttentionDataString(
    data,
    'resumeRef',
    ownerSkill === 'fixme-task'
      ? 'run attention data requires resumeRef for fixme-task owner'
      : 'run attention data resumeRef must be a non-empty string',
  );
  const taskStatePath = normalizeOptionalAttentionDataString(
    data,
    'taskStatePath',
    ownerSkill === 'fixme-task'
      ? 'run attention data requires taskStatePath for fixme-task owner'
      : 'run attention data taskStatePath must be a non-empty string',
  );
  const answerMode = normalizeOptionalAttentionDataString(
    data,
    'answerMode',
    ownerSkill === 'fixme-task'
      ? 'run attention data requires answerMode for fixme-task owner'
      : 'run attention data answerMode must be a non-empty string',
  );

  if (typeof data.promptMarkdown !== 'string' || data.promptMarkdown.trim().length === 0) {
    throw new Error('run attention data requires non-empty promptMarkdown');
  }
  if (ownerSkill === 'fixme-task' && !sourceSkill) {
    throw new Error('run attention data requires sourceSkill for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !resumeRef) {
    throw new Error('run attention data requires resumeRef for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !taskStatePath) {
    throw new Error('run attention data requires taskStatePath for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !path.isAbsolute(taskStatePath)) {
    throw new Error('run attention data taskStatePath must be absolute for fixme-task owner');
  }
  if (ownerSkill === 'fixme-task' && !answerMode) {
    throw new Error('run attention data requires answerMode for fixme-task owner');
  }
  if (answerMode && !RUN_ATTENTION_ANSWER_MODES.includes(answerMode)) {
    throw new Error(`Unsupported run attention answerMode: ${answerMode}`);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'metadata') && !isPlainObject(data.metadata)) {
    throw new Error('run attention data metadata must be a JSON object');
  }

  const now = new Date().toISOString();
  const attentionId = normalizeOptionalAttentionId(data);

  return {
    attentionId,
    ownerSkill,
    sourceSkill,
    parentSkill,
    kind,
    resumeRef,
    taskStatePath,
    promptMarkdown: data.promptMarkdown,
    answerMode: answerMode || 'freeform',
    metadata: data.metadata || {},
    status: 'waiting',
    answer: null,
    createdAt: now,
    answeredAt: null,
  };
}

function attentionOutput(record, fixmeDir, statusId) {
  return {
    ...record,
    statusId,
    attentionPath: runAttentionPath(fixmeDir, statusId, record.attentionId),
  };
}

function runAttentionSetCore(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const statusId = validateRequiredRunId(flags['status-id']);
  const { statusPath, status } = readRunStatusForAttention(fixmeDir, statusId);
  const record = normalizeAttentionSetData(resolveJsonArgument(flags, 'data'));
  const attentionPath = runAttentionPath(fixmeDir, statusId, record.attentionId);
  const attentionCommand = `attention:${record.attentionId}`;
  if (fs.existsSync(attentionPath) && status.currentCommand === attentionCommand) {
    throw new Error(`Run attention already exists: ${record.attentionId}`);
  }
  requireRunReadyForAttentionSet(status);

  writeJsonAtomic(attentionPath, record);
  try {
    writeRunStatus(statusPath, {
      schemaVersion: 1,
      statusId,
      agent: validateRunAgent(status.agent),
      state: 'waiting',
      checkpoint: 'waiting',
      currentCommand: attentionCommand,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    try {
      fs.rmSync(attentionPath, { force: true });
    } catch (cleanupError) {
      throw new Error(`${error.message}; failed to remove unreferenced attention record ${attentionPath}: ${cleanupError.message}`);
    }
    throw error;
  }

  return attentionOutput(record, fixmeDir, statusId);
}

function runAttentionSet(flags) {
  return output(runAttentionSetCore(flags));
}

function readAttentionRecord(fixmeDir, statusId, rawAttentionId) {
  const { status } = readRunStatusForAttention(fixmeDir, statusId);
  const attentionId = validateAttentionId(rawAttentionId);
  const attentionPath = runAttentionPath(fixmeDir, statusId, attentionId);
  if (!fs.existsSync(attentionPath)) {
    throw new Error(`Run attention not found: ${attentionId}`);
  }
  const record = readJsonFileStrict(attentionPath);
  assertCamelCaseJsonKeys(record, 'run attention record');
  return { attentionId, attentionPath, record: normalizeRunAttentionRecord(record, attentionId), runStatus: status };
}

function runAttentionShowCore(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const statusId = validateRequiredRunId(flags['status-id']);
  const { attentionId, record, runStatus } = readAttentionRecord(fixmeDir, statusId, flags['attention-id']);
  requireRunWaitingOnAttention(runStatus, attentionId);
  return attentionOutput(record, fixmeDir, statusId);
}

function runAttentionShow(flags) {
  return output(runAttentionShowCore(flags));
}

function runAttentionAnswerCore(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const statusId = validateRequiredRunId(flags['status-id']);
  const { attentionId, attentionPath, record, runStatus } = readAttentionRecord(fixmeDir, statusId, flags['attention-id']);
  requireRunWaitingOnAttention(runStatus, attentionId);
  if (record.status === 'answered') {
    throw new Error(`Run attention already answered: ${record.attentionId}`);
  }
  const answer = resolveJsonArgument(flags, 'data');
  assertCamelCaseJsonKeys(answer, 'run attention answer data');
  assertKnownJsonFields(answer, 'run attention answer data', RUN_ATTENTION_ANSWER_FIELDS);
  if (!Object.prototype.hasOwnProperty.call(answer, 'answer')) {
    throw new Error('run attention answer data requires answer');
  }
  if (typeof answer.answer !== 'string' || answer.answer.trim().length === 0) {
    throw new Error('run attention answer data requires non-empty answer');
  }
  if (!answer.answerKind || typeof answer.answerKind !== 'string') {
    throw new Error('run attention answer data requires answerKind');
  }
  if (!RUN_ATTENTION_ANSWER_KINDS.includes(answer.answerKind)) {
    throw new Error(`Unsupported run attention answerKind: ${answer.answerKind}`);
  }
  if (!answer.answeredBy || typeof answer.answeredBy !== 'string') {
    throw new Error('run attention answer data requires answeredBy');
  }
  if (answer.answeredBy !== 'user') {
    throw new Error('run attention answer data answeredBy must be user');
  }

  const next = {
    ...record,
    status: 'answered',
    answer,
    answeredAt: new Date().toISOString(),
  };
  writeJsonAtomic(attentionPath, next);
  return attentionOutput(next, fixmeDir, statusId);
}

function runAttentionAnswer(flags) {
  return output(runAttentionAnswerCore(flags));
}

function runAttentionClearCore(flags) {
  const fixmeDir = validateRunFixmeDir(flags['fixme-dir']);
  const statusId = validateRequiredRunId(flags['status-id']);
  const { attentionId, attentionPath, record, runStatus } = readAttentionRecord(fixmeDir, statusId, flags['attention-id']);
  requireRunWaitingOnAttention(runStatus, attentionId);
  if (record.status !== 'answered') {
    throw new Error(`Run attention is not answered: ${attentionId}`);
  }

  const statusPath = runStatusPath(fixmeDir, statusId);
  writeRunStatus(statusPath, {
    schemaVersion: 1,
    statusId,
    agent: validateRunAgent(runStatus.agent),
    state: 'running',
    checkpoint: 'working',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
  });
  const warnings = [];
  let recordRemoved = true;
  try {
    fs.rmSync(attentionPath, { force: true });
  } catch (error) {
    recordRemoved = false;
    warnings.push({
      code: 'ATTENTION_RECORD_CLEANUP_FAILED',
      message: `Run attention status was cleared, but the stale attention record could not be removed: ${error.message}`,
      attentionPath,
    });
  }

  return {
    statusId,
    attentionId,
    cleared: true,
    recordRemoved,
    warnings,
  };
}

function runAttentionClear(flags) {
  return output(runAttentionClearCore(flags));
}

function runAttention(args, flags) {
  const action = args[0] || '';
  switch (action) {
    case 'set':
      return runAttentionSet(flags);
    case 'show':
      return runAttentionShow(flags);
    case 'answer':
      return runAttentionAnswer(flags);
    case 'clear':
      return runAttentionClear(flags);
    default:
      return error(`Unknown run attention action: '${action}'. Valid: set, show, answer, clear`);
  }
}

function expandHomePath(value) {
  if (!value || typeof value !== 'string') return null;
  if (value === '~') return os.homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
  return value;
}

function loadNodeSqliteDatabaseSync() {
  const previousEmitWarning = process.emitWarning;
  process.emitWarning = function emitWarningWithoutSqliteExperimentalNoise(warning, ...args) {
    const message = typeof warning === 'string' ? warning : (warning && warning.message) || '';
    if (message.includes('SQLite is an experimental feature')) return;
    return previousEmitWarning.call(process, warning, ...args);
  };
  try {
    return require('node:sqlite').DatabaseSync;
  } catch (_) {
    return null;
  } finally {
    process.emitWarning = previousEmitWarning;
  }
}

function runtimeStateDir() {
  return path.join(os.homedir(), '.fixme', 'usage', 'runtime');
}

function claudeSessionSourcePath(sessionId) {
  if (!sessionId || !/^[A-Za-z0-9_-]+$/.test(String(sessionId))) return null;
  return path.join(runtimeStateDir(), 'claude-sessions', `${sessionId}.json`);
}

function readClaudeHookSourceRef() {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  const sourceStatePath = claudeSessionSourcePath(sessionId);
  if (!sourceStatePath || !fs.existsSync(sourceStatePath)) return null;
  try {
    const state = readJsonFileStrict(sourceStatePath);
    const sourcePath = typeof state.sourcePath === 'string' ? expandHomePath(state.sourcePath) : null;
    if (!sourcePath) return null;
    return { path: path.resolve(sourcePath), discovery: 'claudeHook' };
  } catch (_) {
    return null;
  }
}

function readCodexThreadSourceRef() {
  const threadId = process.env.CODEX_THREAD_ID;
  if (!threadId) return null;
  const dbPath = path.join(os.homedir(), '.codex', 'state_5.sqlite');
  if (!fs.existsSync(dbPath)) return null;
  const DatabaseSync = loadNodeSqliteDatabaseSync();
  if (!DatabaseSync) return null;
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare('SELECT rollout_path FROM threads WHERE id = ?').get(threadId);
    const rolloutPath = row && typeof row.rollout_path === 'string' ? expandHomePath(row.rollout_path) : null;
    if (!rolloutPath) return null;
    return { path: path.resolve(rolloutPath), discovery: 'codexThreadId' };
  } catch (_) {
    return null;
  } finally {
    if (db) db.close();
  }
}

function explicitUsageSourceRef(runtime, explicitPath) {
  const directPath = explicitPath
    || process.env.FIXME_USAGE_SOURCE_PATH
    || (runtime === 'codex' ? process.env.CODEX_SESSION_FILE : process.env.CLAUDE_TRANSCRIPT_PATH)
    || null;
  if (directPath) return { path: path.resolve(expandHomePath(String(directPath))), discovery: 'explicit' };
  if (runtime === 'codex') return readCodexThreadSourceRef();
  if (runtime === 'claude') return readClaudeHookSourceRef();
  return null;
}

function explicitUsageSourcePath(runtime, explicitPath) {
  const sourceRef = explicitUsageSourceRef(runtime, explicitPath);
  return sourceRef ? sourceRef.path : null;
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
  const sourceRef = explicitUsageSourceRef(runtime, explicitPath);
  const sourcePath = sourceRef && sourceRef.path ? sourceRef.path : null;
  let cursor = null;
  if (sourcePath && fs.existsSync(sourcePath)) {
    const stat = fs.statSync(sourcePath);
    cursor = { path: sourcePath, size: stat.size, mtimeMs: stat.mtimeMs };
  } else if (runtime === 'claude' && sourcePath) {
    cursor = { path: sourcePath, size: 0, mtimeMs: 0 };
  }
  const snapshot = {
    runtime,
    explicitPath: sourcePath,
    source: sourcePath ? { kind: `${runtime}_jsonl`, path: sourcePath, discovery: sourceRef.discovery } : null,
    cursor,
    codexCumulativeStartTokens: null,
  };
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

function findStringCursor(filePath, needle) {
  const needleBuffer = Buffer.from(String(needle || ''));
  if (needleBuffer.length === 0) return null;
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const chunkSize = 64 * 1024;
  const overlapSize = Math.max(0, needleBuffer.length - 1);
  let offset = 0;
  let carry = Buffer.alloc(0);
  try {
    while (offset < stat.size) {
      const toRead = Math.min(chunkSize, stat.size - offset);
      const buffer = Buffer.alloc(toRead);
      const bytesRead = fs.readSync(fd, buffer, 0, toRead, offset);
      if (bytesRead <= 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      const combined = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
      const foundAt = combined.indexOf(needleBuffer);
      if (foundAt !== -1) {
        const combinedStartOffset = offset - carry.length;
        const size = combinedStartOffset + foundAt + needleBuffer.length;
        return { path: filePath, size: Math.max(0, Math.min(size, stat.size)), mtimeMs: stat.mtimeMs };
      }
      carry = overlapSize > 0
        ? combined.subarray(Math.max(0, combined.length - overlapSize))
        : Buffer.alloc(0);
      offset += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
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

function totalTokensEqual(a, b) {
  return (a && a.totalTokens || 0) === (b && b.totalTokens || 0);
}

function primaryTokenBucketsCompatible(a, b) {
  let compared = false;
  for (const key of ['inputTokens', 'outputTokens', 'reasoningOutputTokens']) {
    const aValue = a && a[key] !== null && a[key] !== undefined ? a[key] : null;
    const bValue = b && b[key] !== null && b[key] !== undefined ? b[key] : null;
    if (aValue === null || bValue === null) continue;
    compared = true;
    if (aValue !== bValue) return false;
  }
  return compared ? true : totalTokensEqual(a, b);
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
    if (summedLast && hasPositiveToken(summedLast) && !primaryTokenBucketsCompatible(delta.result, summedLast)) {
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
  function pathMatchesProjectRoot(value, expected) {
    if (!value || !expected) return false;
    if (value === expected) return true;
    const relative = path.relative(expected, value);
    return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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
  return values.some(value => pathMatchesProjectRoot(value, expected));
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

function disambiguateRuntimeCounterSourcesByInvocationId(discovery, runtime, invocationId) {
  if (!discovery || discovery.status !== 'many') return discovery;
  const matches = [];
  for (const candidate of discovery.candidates) {
    let startCursor;
    try {
      startCursor = findStringCursor(candidate.path, invocationId);
    } catch (_) {
      startCursor = null;
    }
    if (!startCursor) continue;
    const match = { ...candidate, startCursor };
    if (runtime === 'codex') {
      try {
        match.codexCumulativeStartTokens = captureCodexCumulativeStartSnapshot(candidate.path, startCursor);
      } catch (_) {
        match.codexCumulativeStartTokens = null;
      }
    }
    matches.push(match);
  }
  if (matches.length !== 1) return discovery;
  return { status: 'one', candidates: matches };
}

function resolveUsageRuntime(rawRuntime, scriptPath) {
  const runtime = rawRuntime || 'auto';
  if (!USAGE_RUNTIMES.includes(runtime)) {
    const err = new Error(`Unsupported usage runtime: ${runtime}`);
    err.code = 'UNSUPPORTED_USAGE_RUNTIME';
    throw err;
  }
  if (runtime === 'claude' || runtime === 'codex') return runtime;

  const inferred = inferInstalledRuntimeFromPath(scriptPath);
  if (inferred) return inferred;

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

function hasUsageFixmeDirFlag(flags) {
  return Object.prototype.hasOwnProperty.call(flags, 'fixme-dir');
}

function resolveUsageFixmeDir(flags, fixmeRoot) {
  if (hasUsageFixmeDirFlag(flags)) {
    const rawFixmeDir = flags['fixme-dir'];
    if (rawFixmeDir === true || rawFixmeDir === '') {
      const err = new Error('--fixme-dir requires a path value');
      err.code = 'INVALID_USAGE_PATH';
      throw err;
    }
    return path.resolve(String(rawFixmeDir));
  }
  if (!fixmeRoot) {
    const err = new Error('--fixme-dir is required when no Fixme root was resolved');
    err.code = 'MISSING_USAGE_FIXME_DIR';
    throw err;
  }
  return path.join(fixmeRoot, '.fixme');
}

function usageStartCore(flags, fixmeRoot) {
  if (Object.prototype.hasOwnProperty.call(flags, 'task')) {
    return { ok: false, code: 'UNSUPPORTED_USAGE_TASK', message: '--task is reserved for a future usage schema and is not supported in v1' };
  }
  if (!flags.skill) {
    return { ok: false, code: 'MISSING_USAGE_SKILL', message: '--skill is required for usage start' };
  }

  const role = flags.role || 'skill';
  if (!USAGE_ROLES.includes(role)) {
    return { ok: false, code: 'UNSUPPORTED_USAGE_ROLE', message: `Unsupported usage role: ${role}` };
  }

  let runtime;
  try {
    runtime = resolveUsageRuntime(flags.runtime || 'auto', process.argv[1]);
  } catch (e) {
    return { ok: false, code: e.code || 'USAGE_RUNTIME_ERROR', message: e.message };
  }

  let fixmeDir;
  try {
    fixmeDir = resolveUsageFixmeDir(flags, fixmeRoot);
  } catch (e) {
    return { ok: false, code: e.code || 'INVALID_USAGE_PATH', message: e.message };
  }
  const projectRoot = flags['project-root'] ? path.resolve(String(flags['project-root'])) : path.dirname(fixmeDir);
  if (!path.isAbsolute(fixmeDir) || !path.isAbsolute(projectRoot)) {
    return { ok: false, code: 'INVALID_USAGE_PATH', message: '--fixme-dir and --project-root must resolve to absolute paths' };
  }

  let pipelineRunId;
  let parentInvocationId;
  try {
    pipelineRunId = validateUsageId(flags['pipeline-run-id'], 'pipelineRunId');
    parentInvocationId = validateUsageId(flags['parent-invocation-id'], 'parentInvocationId');
  } catch (e) {
    return { ok: false, code: e.code || 'INVALID_USAGE_ID', message: e.message };
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

  return {
    ok: true,
    result: {
      invocationId,
      pipelineRunId,
      parentInvocationId,
      fixmeDir,
      pendingPath,
      runtime,
      startedAt,
      finishCommand: `node "${process.argv[1]}" usage finish --invocation-id ${invocationId} --outcome complete --fixme-dir "${fixmeDir}"`,
    },
  };
}

function usageStart(flags, fixmeRoot) {
  const core = usageStartCore(flags, fixmeRoot);
  if (!core.ok) {
    return usageCliError(core.code, core.message, core.extra || {});
  }
  const { invocationId, pipelineRunId, pendingPath, runtime, startedAt, finishCommand } = core.result;
  return output({ invocationId, pipelineRunId, pendingPath, runtime, startedAt, finishCommand });
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

function findPendingPath(invocationId, fixmeDir) {
  const id = validateUsageId(invocationId, 'invocationId');
  if (!id) {
    const err = new Error('--invocation-id is required');
    err.code = 'MISSING_INVOCATION_ID';
    throw err;
  }
  return path.join(usagePendingDir(fixmeDir), `${id}.json`);
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

function stableHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
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
  const persistedSource = pending.sourceSnapshot && pending.sourceSnapshot.source && pending.sourceSnapshot.source.path
    ? pending.sourceSnapshot.source
    : null;
  let discovery;
  if (persistedSource) {
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
    discovery = { status: 'none', candidates: [] };
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
  const hasPersistedCursor = !!(pending.sourceSnapshot && pending.sourceSnapshot.cursor && pending.sourceSnapshot.cursor.path === candidate.path);
  const hasInvocationCursor = !!candidate.startCursor;
  const source = sourceMetadata(kind, candidate.path, candidate.discovery, 1, candidate.attributionSkill ? { attributionSkill: candidate.attributionSkill } : {});
  if (!hasPersistedCursor && !hasInvocationCursor) {
    return counterUnmeasured(
      pending,
      USAGE_WARNING_CODES.COUNTERS_UNAVAILABLE,
      'Runtime counter source was inferred at finish, but no bounded start cursor was available.',
      source
    );
  }
  const startCursor = hasPersistedCursor
    ? pending.sourceSnapshot.cursor
    : candidate.startCursor;
  try {
    if (pending.runtime === 'codex') {
      const startTokens = hasPersistedCursor
        ? pending.sourceSnapshot.codexCumulativeStartTokens
        : candidate.codexCumulativeStartTokens
          ? candidate.codexCumulativeStartTokens
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

function usagePrintAfterFinishForFixmeDir(fixmeDir) {
  const configPath = path.join(fixmeDir, 'config.json');
  try {
    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : {};
    if (!isPlainObject(config)) {
      throw new Error('top-level value must be an object');
    }
    applyConfigMigration(config, configPath);
    return config.usage.printAfterFinish !== false;
  } catch (e) {
    process.stderr.write(`Warning: failed to read usage.printAfterFinish from ${configPath}; using default true: ${e.message}\n`);
    return true;
  }
}

function usageFinishCore(flags, fixmeRoot) {
  if (!flags['invocation-id']) {
    return { ok: false, code: 'MISSING_INVOCATION_ID', message: '--invocation-id is required for usage finish' };
  }
  if (!flags.outcome) {
    return { ok: false, code: 'MISSING_OUTCOME', message: '--outcome is required for usage finish' };
  }

  let pendingPath;
  try {
    pendingPath = findPendingPath(flags['invocation-id'], resolveUsageFixmeDir(flags, fixmeRoot));
  } catch (e) {
    return { ok: false, code: e.code || 'INVALID_USAGE_REQUEST', message: e.message };
  }
  if (!fs.existsSync(pendingPath)) {
    return { ok: false, code: 'PENDING_USAGE_NOT_FOUND', message: `Pending usage invocation not found: ${flags['invocation-id']}` };
  }

  const pending = readJsonFileStrict(pendingPath);
  const outcomeResult = validateOutcomeAndReason(flags.outcome, flags.reason);
  if (!outcomeResult.ok) {
    return { ok: false, code: outcomeResult.code, message: outcomeResult.message };
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
    return { ok: false, code: 'DESTINATION_READ_FAILED', message: e.message };
  }

  if (projectState === 'conflict' || globalState === 'conflict') {
    return { ok: false, code: 'DESTINATION_EVENT_CONFLICT', message: 'A usage destination already contains a different event for this invocation' };
  }

  try {
    if (projectState === 'missing') {
      appendUsageEvent(projectEventPath, finalizedEvent);
    }
    pending.appendState.projectWritten = true;
    writeJsonAtomic(pendingPath, pending);
  } catch (e) {
    return { ok: false, code: USAGE_WARNING_CODES.DESTINATION_APPEND_FAILED, message: `Failed to append project usage event: ${e.message}` };
  }

  try {
    if (globalState === 'missing') {
      appendUsageEvent(globalEventPath, finalizedEvent);
    }
    pending.appendState.globalWritten = true;
    writeJsonAtomic(pendingPath, pending);
  } catch (e) {
    return {
      ok: false,
      code: USAGE_WARNING_CODES.DESTINATION_APPEND_FAILED,
      message: `Failed to append global usage event: ${e.message}`,
      extra: { warnings: [{ code: USAGE_WARNING_CODES.DESTINATION_APPEND_FAILED, message: 'Project usage was written, but global usage is incomplete.' }] },
    };
  }

  fs.rmSync(pendingPath, { force: true });

  const suppressed = flags.quiet === true || flags.quiet === '' || !usagePrintAfterFinishForFixmeDir(pending.fixmeDir);
  const reportLine = suppressed ? null : buildCompactUsageReportLine(finalizedEvent, projectEventPath);
  return {
    ok: true,
    result: {
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
    },
  };
}

function usageFinish(flags, fixmeRoot) {
  const core = usageFinishCore(flags, fixmeRoot);
  if (!core.ok) {
    return usageCliError(core.code, core.message, core.extra || {});
  }
  return usageCliResult(core.result);
}

// ============================================================================
// Subcommands: lifecycle invocation
// ============================================================================

const LIFECYCLE_INVOCATION_START_FIELDS = new Set([
  'skill', 'runtime', 'role', 'idempotencyKey', 'pipelineRunId',
  'parentInvocationId', 'taskStatePath', 'createRunStatusForAgent',
]);

function usageIdempotencyPath(fixmeDir, keyHash) {
  return path.join(fixmeDir, 'usage', 'idempotency', `${keyHash}.json`);
}

function resolveLifecycleData(flags) {
  let data;
  try {
    data = resolveJsonArgument(flags, 'data');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  try {
    assertCamelCaseJsonKeys(data, 'lifecycle data');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  return data;
}

function lifecycleInvocationStart(flags, fixmeRoot) {
  const data = resolveLifecycleData(flags);
  try {
    assertKnownJsonFields(data, 'invocation start', LIFECYCLE_INVOCATION_START_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  if (!isNonEmptyString(data.idempotencyKey)) {
    lifecycleError('missingRequiredField', 'idempotencyKey is required');
  }
  if (!isNonEmptyString(data.skill)) {
    lifecycleError('missingRequiredField', 'skill is required');
  }

  let fixmeDir;
  try {
    fixmeDir = resolveUsageFixmeDir(flags, fixmeRoot);
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }

  const durableInputs = {
    skill: data.skill,
    runtime: data.runtime || null,
    role: data.role || null,
    pipelineRunId: data.pipelineRunId || null,
    parentInvocationId: data.parentInvocationId || null,
    taskStatePath: data.taskStatePath || null,
    createRunStatusForAgent: data.createRunStatusForAgent || null,
  };
  const keyHash = stableHash({ idempotencyKey: data.idempotencyKey });
  const recordPath = usageIdempotencyPath(fixmeDir, keyHash);

  if (fs.existsSync(recordPath)) {
    const existing = readJsonFileStrict(recordPath);
    if (!jsonEqual(existing.durableInputs, durableInputs)) {
      lifecycleError('conflictingDuplicate', `invocation idempotencyKey '${data.idempotencyKey}' already used with different inputs`);
    }
    const out = {
      invocationId: existing.invocationId,
      pipelineRunId: existing.pipelineRunId,
      fixmeDir,
      usageFinishCommand: existing.usageFinishCommand,
    };
    if (existing.statusId) {
      out.statusId = existing.statusId;
      out.statusPath = existing.statusPath;
    }
    return lifecycleOk(out);
  }

  const usageFlags = {
    skill: data.skill,
    runtime: data.runtime || 'auto',
    role: data.role,
    'fixme-dir': fixmeDir,
    'pipeline-run-id': data.pipelineRunId,
    'parent-invocation-id': data.parentInvocationId,
  };
  const startCore = usageStartCore(usageFlags, fixmeRoot);
  if (!startCore.ok) {
    lifecycleError('invalidInput', startCore.message);
  }
  const startResult = startCore.result;

  let statusId = null;
  let statusPath = null;
  if (data.createRunStatusForAgent) {
    const runResult = runStartCore({ 'fixme-dir': fixmeDir, agent: data.createRunStatusForAgent });
    statusId = runResult.statusId;
    statusPath = runResult.statusPath;
  }

  const record = {
    schemaVersion: 1,
    idempotencyKey: data.idempotencyKey,
    invocationId: startResult.invocationId,
    statusId,
    statusPath,
    usageFinishCommand: startResult.finishCommand,
    pipelineRunId: startResult.pipelineRunId,
    durableInputs,
    createdAt: new Date().toISOString(),
  };
  writeJsonAtomic(recordPath, record);

  const out = {
    invocationId: startResult.invocationId,
    pipelineRunId: startResult.pipelineRunId,
    fixmeDir,
    usageFinishCommand: startResult.finishCommand,
  };
  if (statusId) {
    out.statusId = statusId;
    out.statusPath = statusPath;
  }
  return lifecycleOk(out);
}

function lifecycleInvocationFinish(flags, fixmeRoot) {
  if (!isNonEmptyString(flags['invocation-id'])) {
    lifecycleError('invalidInput', '--invocation-id is required');
  }
  let fixmeDir;
  try {
    fixmeDir = resolveUsageFixmeDir(flags, fixmeRoot);
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }

  const core = usageFinishCore(flags, fixmeRoot);
  if (core.ok) {
    return lifecycleOk(core.result);
  }

  if (core.code === 'PENDING_USAGE_NOT_FOUND') {
    const rows = readUsageRowsForInvocation(usageProjectEventPath(fixmeDir), flags['invocation-id']);
    if (rows.length === 0) {
      lifecycleError('stateNotFound', `No pending usage and no finalized usage row for invocation: ${flags['invocation-id']}`);
    }
    if (rows.length > 1) {
      lifecycleError('conflictingDuplicate', `Multiple finalized usage rows for invocation: ${flags['invocation-id']}`);
    }
    const row = rows[0];
    const outcomeResult = validateOutcomeAndReason(flags.outcome, flags.reason);
    if (!outcomeResult.ok) {
      lifecycleError('invalidInput', outcomeResult.message);
    }
    const requestedReason = outcomeResult.outcomeReason !== undefined ? outcomeResult.outcomeReason : null;
    const rowReason = row.outcomeReason !== undefined ? row.outcomeReason : null;
    if (row.outcome !== outcomeResult.outcome || rowReason !== requestedReason) {
      lifecycleError('conflictingDuplicate', `Finalized usage outcome differs for invocation: ${flags['invocation-id']}`);
    }
    const suppressed = !usagePrintAfterFinishForFixmeDir(fixmeDir);
    return lifecycleOk({
      eventId: row.eventId,
      invocationId: row.invocationId,
      status: row.status,
      outcome: row.outcome,
      outcomeReason: rowReason,
      projectEventPath: usageProjectEventPath(fixmeDir),
      globalEventPath: usageGlobalEventPath(),
      reportLine: suppressed ? null : buildCompactUsageReportLine(row, usageProjectEventPath(fixmeDir)),
      reportLineSuppressed: suppressed,
      warnings: row.warnings || [],
    });
  }

  if (core.code === 'DESTINATION_EVENT_CONFLICT') {
    lifecycleError('conflictingDuplicate', core.message);
  }
  if (core.code === 'INVALID_OUTCOME' || core.code === 'INVALID_REASON' || core.code === 'MISSING_OUTCOME') {
    lifecycleError('invalidInput', core.message);
  }
  lifecycleError('invalidInput', core.message);
}

// ============================================================================
// Subcommands: lifecycle dispatch
// ============================================================================

const LIFECYCLE_DISPATCH_PREPARE_FIELDS = new Set([
  'idempotencyKey', 'agentName', 'transport', 'parentStatusId', 'parentInvocationId',
  'pipelineRunId', 'taskStatePath', 'parentContinuation', 'promptInputs', 'runtime',
  'allowProducerContinuation', 'forceFreshReason',
]);

const LIFECYCLE_DISPATCH_COMPLETE_FIELDS = new Set(['dispatchId', 'statusId', 'status', 'parentStatusId', 'currentCommand', 'failure', 'runtimeHandle']);

const DISPATCH_TRANSPORTS = new Set(['agent', 'inline-skill', 'background', 'direct']);

const LIFECYCLE_PARENT_PREPARE_CHILD_FIELDS = new Set(['parent', 'child', 'parentContinuation', 'await', 'recoverStaleParent']);
const PREPARE_CHILD_PARENT_FIELDS = new Set(['parentSkill', 'idempotencyKey', 'lookupInput', 'payload']);
const PREPARE_CHILD_CHILD_FIELDS = new Set(['idempotencyKey', 'agentName', 'runtime', 'transport', 'parentInvocationId', 'pipelineRunId', 'parentStatusId', 'handoff', 'promptInputs']);
const PREPARE_CHILD_HANDOFF_FIELDS = new Set(['mode', 'taskSaveData', 'payload']);
const PREPARE_CHILD_AWAIT_FIELDS = new Set(['fixBatches', 'activeBatchIndex', 'ledger']);

function dispatchIdempotencyPath(fixmeDir, keyHash) {
  return path.join(fixmeDir, 'dispatch', 'idempotency', `${keyHash}.json`);
}

function childHandoffIndexPath(fixmeDir, childIdempotencyKey) {
  return path.join(fixmeDir, 'tasks', 'child-handoffs', `${stableHash({ childIdempotencyKey })}.json`);
}

function childHandoffInputDigest(child) {
  return stableHash({
    agentName: child.agentName,
    runtime: child.runtime,
    transport: child.transport,
    taskSaveData: child.handoff.taskSaveData,
    payload: child.handoff.payload,
    promptInputs: child.promptInputs || {},
  });
}

function preflightChildHandoffIndex(fixmeDir, child) {
  const indexPath = childHandoffIndexPath(fixmeDir, child.idempotencyKey);
  const durableInputDigest = childHandoffInputDigest(child);
  if (!fs.existsSync(indexPath)) {
    return { mode: 'create', indexPath, durableInputDigest };
  }
  const index = readJsonFileStrict(indexPath);
  if (index.durableInputDigest !== durableInputDigest) {
    lifecycleError('conflictingDuplicate', `child idempotencyKey '${child.idempotencyKey}' already used with different durable handoff input`);
  }
  for (const fileField of ['taskPath', 'statePath', 'handoffPayloadPath']) {
    if (!isNonEmptyString(index[fileField]) || !fs.existsSync(index[fileField])) {
      lifecycleError('staleState', `Child handoff index is stale; missing ${fileField}`, {
        childIdempotencyKey: child.idempotencyKey,
        indexPath,
        recovery: {
          safeAutomaticRecovery: false,
          commands: {
            prepareChild: 'lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>',
          },
        },
      });
    }
  }
  return { mode: 'reuse', indexPath, durableInputDigest, index };
}

function attachPreparationArtifactCore(taskPath, statePath, artifactData) {
  const artifact = normalizePreparationArtifactData(artifactData);
  const state = readJsonFileStrict(statePath);
  const previousArtifacts = state.artifacts && Array.isArray(state.artifacts.preparationArtifacts)
    ? state.artifacts.preparationArtifacts
    : [];
  const preparationArtifacts = upsertPreparationArtifact(previousArtifacts, artifact);
  const nextState = {
    ...state,
    artifacts: {
      ...(isPlainObject(state.artifacts) ? state.artifacts : {}),
      preparationArtifacts,
    },
    updatedAt: new Date().toISOString(),
  };
  const content = fs.readFileSync(taskPath, 'utf8');
  const { frontmatter, body, rawFields } = parseFrontmatter(content);
  const nextBody = replacePreparationArtifactsSection(body, preparationArtifacts);
  writeJsonAtomic(statePath, nextState);
  fs.writeFileSync(taskPath, buildContent(frontmatter, nextBody, rawFields));
  return artifact;
}

function saveOrReuseChildHandoff(fixmeDir, child, preflight) {
  if (preflight.mode === 'reuse') {
    return {
      taskRef: preflight.index.taskRef,
      taskPath: preflight.index.taskPath,
      statePath: preflight.index.statePath,
      resumeRef: preflight.index.resumeRef,
      handoffPayloadPath: preflight.index.handoffPayloadPath,
      source: preflight.index.source,
    };
  }
  const saved = saveStandaloneTaskCore(path.dirname(fixmeDir), child.handoff.taskSaveData);
  const handoffPayloadPath = saved.taskPath.replace(/\.md$/, '.handoff.json');
  writeJsonAtomic(handoffPayloadPath, child.handoff.payload);
  attachPreparationArtifactCore(saved.taskPath, saved.statePath, {
    artifactType: 'child-handoff-payload',
    artifactPath: handoffPayloadPath,
    title: 'Current PR review fix payload',
    summary: ['Contains routedFixGroups and PR-comment resolution metadata.'],
    sourceSkill: child.handoff.taskSaveData.source || 'fixme-pr-comments',
    status: 'current',
  });
  const now = new Date().toISOString();
  const index = {
    schemaVersion: 1,
    childIdempotencyKey: child.idempotencyKey,
    durableInputDigest: preflight.durableInputDigest,
    taskRef: saved.taskRef,
    taskPath: saved.taskPath,
    statePath: saved.statePath,
    resumeRef: saved.taskPath,
    handoffPayloadPath,
    source: child.handoff.taskSaveData.source || 'fixme-pr-comments',
    createdAt: now,
    updatedAt: now,
  };
  writeJsonAtomic(preflight.indexPath, index);
  return {
    taskRef: index.taskRef,
    taskPath: index.taskPath,
    statePath: index.statePath,
    resumeRef: index.resumeRef,
    handoffPayloadPath: index.handoffPayloadPath,
    source: index.source,
  };
}

function findDispatchRecordById(fixmeDir, dispatchId) {
  const dir = path.join(fixmeDir, 'dispatch', 'idempotency');
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const recordPath = path.join(dir, entry);
    const record = readJsonFileStrict(recordPath);
    if (record.dispatchId === dispatchId) {
      return { recordPath, record };
    }
  }
  return null;
}

function resolveLifecycleFixmeDir(flags) {
  if (!Object.prototype.hasOwnProperty.call(flags, 'fixme-dir')) {
    lifecycleError('invalidInput', '--fixme-dir is required');
  }
  const raw = flags['fixme-dir'];
  if (raw === true || raw === '') {
    lifecycleError('invalidInput', '--fixme-dir requires a path value');
  }
  return path.resolve(String(raw));
}

function formatDispatchBannerModel(runtimeSettings) {
  if (runtimeSettings.runtime === 'codex' && runtimeSettings.model === null) {
    return 'preserved (user-selected Codex model)';
  }
  if (runtimeSettings.model === null || runtimeSettings.model === undefined) {
    return 'inherited';
  }
  return String(runtimeSettings.model);
}

function formatDispatchBannerReasoning(runtimeSettings) {
  if (runtimeSettings.runtime === 'codex' && runtimeSettings.reasoningEffort === null) {
    return 'inherited (current Codex setting)';
  }
  if (runtimeSettings.reasoningEffort === null || runtimeSettings.reasoningEffort === undefined) {
    return 'inherited';
  }
  return String(runtimeSettings.reasoningEffort);
}

function buildDispatchBannerMarkdown(agentName, runtimeSettings) {
  return [
    `## Dispatch: ${agentName}`,
    `- Runtime: ${runtimeSettings.runtime}`,
    `- Model: ${formatDispatchBannerModel(runtimeSettings)}`,
    `- Reasoning effort: ${formatDispatchBannerReasoning(runtimeSettings)}`,
    `- Profile: ${runtimeSettings.profile}`,
    `- Config source: ${runtimeSettings.source}`,
  ].join('\n');
}

function resolveLifecycleDispatchRuntime(data, flags) {
  const rawRuntime = isNonEmptyString(data.runtime)
    ? data.runtime
    : (isNonEmptyString(flags.runtime) ? flags.runtime : null);
  if (rawRuntime) {
    if (!VALID_RUNTIME_VALUES.has(rawRuntime)) {
      lifecycleError('invalidInput', `Unsupported dispatch runtime: ${rawRuntime}`);
    }
    return rawRuntime;
  }
  return inferInstalledRuntimeFromPath(__filename) || DEFAULT_RUNTIME;
}

function freshProducerContinuation(agentName, runtime, reason, extra = {}) {
  return {
    mode: 'fresh',
    reason,
    agentName,
    runtime,
    runtimeHandle: null,
    ...extra,
  };
}

function selectProducerContinuation({ agentName, runtime, taskStatePath, allowProducerContinuation, forceFreshReason }) {
  if (!RESUMABLE_PRODUCER_AGENTS.has(agentName)) {
    return freshProducerContinuation(agentName, runtime, 'agentNotResumable');
  }
  if (allowProducerContinuation !== true) {
    return freshProducerContinuation(agentName, runtime, 'disabledForDispatch');
  }
  if (forceFreshReason) {
    return freshProducerContinuation(agentName, runtime, 'forcedFresh', { forceFreshReason });
  }
  if (!isNonEmptyString(taskStatePath)) {
    return freshProducerContinuation(agentName, runtime, 'missingTaskStatePath');
  }

  const resolvedTaskStatePath = path.resolve(String(taskStatePath));
  let state;
  try {
    state = readJsonFileStrict(resolvedTaskStatePath);
    validateProducerContinuations(state.producerContinuations || []);
  } catch (e) {
    return freshProducerContinuation(agentName, runtime, 'invalidStoredHandle', {
      detail: `${agentName} continuation state invalid at ${resolvedTaskStatePath}: ${e.message}`,
    });
  }

  const continuations = state.producerContinuations || [];
  const sameAgentEntries = continuations.filter(entry => entry.agentName === agentName);
  const exactEntries = sameAgentEntries.filter(entry => entry.runtime === runtime);

  if (exactEntries.length === 0) {
    if (sameAgentEntries.length > 0) {
      return freshProducerContinuation(agentName, runtime, 'runtimeMismatch');
    }
    return freshProducerContinuation(agentName, runtime, 'noStoredHandle');
  }
  if (exactEntries.length > 1) {
    return freshProducerContinuation(agentName, runtime, 'invalidStoredHandle', {
      detail: `duplicate producerContinuations entry for ${agentName}/${runtime} at ${resolvedTaskStatePath}`,
    });
  }

  const entry = exactEntries[0];
  if (entry.status === 'bad') {
    return freshProducerContinuation(agentName, runtime, 'storedHandleBad', { badReason: entry.badReason });
  }

  return {
    mode: 'resume',
    reason: 'exactHandle',
    agentName,
    runtime,
    runtimeHandle: entry.runtimeHandle,
  };
}

function preflightProducerContinuationFromCompletion(dispatchRecord, runtimeHandle, now) {
  if (runtimeHandle === undefined) {
    return null;
  }

  const durableInputs = dispatchRecord.record.durableInputs || {};
  const { agentName, runtime, taskStatePath } = durableInputs;
  if (!RESUMABLE_PRODUCER_AGENTS.has(agentName)) {
    lifecycleError('invalidInput', `runtimeHandle is only valid for resumable producer agents, got ${agentName}`);
  }
  if (!isNonEmptyString(taskStatePath)) {
    lifecycleError('invalidInput', 'runtimeHandle requires taskStatePath on the prepared dispatch');
  }
  try {
    validateRuntimeHandle(runtime, runtimeHandle, 'dispatch complete');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }

  const statePath = path.resolve(String(taskStatePath));
  let previous;
  try {
    previous = readJsonFileStrict(statePath);
  } catch (e) {
    lifecycleError('stateNotFound', `Task state file not found for runtimeHandle recording: ${statePath}`);
  }
  let next;
  try {
    next = upsertProducerContinuation(previous, {
      agentName,
      runtime,
      runtimeHandle,
      lastDispatchId: dispatchRecord.record.dispatchId,
      updatedAt: now,
    });
    assertCamelCaseJsonKeys(next, 'task state');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  return {
    taskStatePath: statePath,
    nextTaskState: next,
    producerContinuation: next.producerContinuations.find(entry => entry.agentName === agentName && entry.runtime === runtime),
  };
}

function recordProducerContinuationFromCompletion(preflight) {
  if (!preflight) {
    return null;
  }
  writeJsonAtomic(preflight.taskStatePath, preflight.nextTaskState);
  return {
    taskStatePath: preflight.taskStatePath,
    producerContinuation: preflight.producerContinuation,
  };
}

function dispatchRuntimeSettingsForOutput(settings) {
  const outputSettings = { ...settings };
  outputSettings.reasoningEffort = Object.prototype.hasOwnProperty.call(settings, 'reasoning_effort')
    ? settings.reasoning_effort
    : (settings.reasoningEffort === undefined ? null : settings.reasoningEffort);
  delete outputSettings.reasoning_effort;
  return outputSettings;
}

function dispatchPrepareCore(fixmeDir, data, flags = {}) {
  try {
    assertKnownJsonFields(data, 'dispatch prepare', LIFECYCLE_DISPATCH_PREPARE_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['idempotencyKey', 'agentName', 'transport']) {
    if (!isNonEmptyString(data[field])) {
      lifecycleError('missingRequiredField', `${field} is required`);
    }
  }
  if (!isPlainObject(data.promptInputs)) {
    lifecycleError('missingRequiredField', 'promptInputs is required');
  }
  if (!DISPATCH_TRANSPORTS.has(data.transport)) {
    lifecycleError('invalidInput', `transport must be one of: ${[...DISPATCH_TRANSPORTS].join(', ')}`);
  }
  if (!KNOWN_FIXME_AGENTS.has(data.agentName)) {
    lifecycleError('invalidInput', `Unknown agent: ${data.agentName}`);
  }
  const runtime = resolveLifecycleDispatchRuntime(data, flags);

  const durableInputs = {
    agentName: data.agentName,
    runtime,
    transport: data.transport,
    parentInvocationId: data.parentInvocationId || null,
    pipelineRunId: data.pipelineRunId || null,
    taskStatePath: data.taskStatePath || null,
    parentContinuation: isPlainObject(data.parentContinuation) ? data.parentContinuation : null,
    allowProducerContinuation: data.allowProducerContinuation === true,
    forceFreshReason: data.forceFreshReason || null,
    promptInputs: data.promptInputs,
  };
  const keyHash = stableHash({ idempotencyKey: data.idempotencyKey });
  const recordPath = dispatchIdempotencyPath(fixmeDir, keyHash);
  if (fs.existsSync(recordPath)) {
    const existing = readJsonFileStrict(recordPath);
    if (!jsonEqual(existing.durableInputs, durableInputs)) {
      lifecycleError('conflictingDuplicate', `dispatch idempotencyKey '${data.idempotencyKey}' already used with different inputs`);
    }
    return existing.output;
  }

  const runtimeSettings = dispatchRuntimeSettingsForOutput(resolveModel(data.agentName, path.dirname(fixmeDir), { runtime }));
  const continuation = selectProducerContinuation({
    agentName: data.agentName,
    runtime,
    taskStatePath: data.taskStatePath,
    allowProducerContinuation: data.allowProducerContinuation,
    forceFreshReason: data.forceFreshReason,
  });
  const child = runStartCore({ 'fixme-dir': fixmeDir, agent: data.agentName });
  const dispatchId = generateUsageId('dispatch');
  let activeChild = null;
  if (data.agentName === 'fixme-task' && isPlainObject(data.parentContinuation)) {
    const taskRunId = generateUsageId('taskRun');
    const taskStatePath = isNonEmptyString(data.taskStatePath)
      ? path.resolve(String(data.taskStatePath))
      : path.join(fixmeDir, 'tasks', `${taskRunId}.state.json`);
    activeChild = {
      statusId: child.statusId,
      taskRunId,
      taskStatePath,
      resumeRef: taskStatePath,
    };
  }

  // Parent heartbeat: only ping when the parent is not on an attention marker.
  if (isNonEmptyString(data.parentStatusId)) {
    const parentPath = runStatusPath(fixmeDir, data.parentStatusId);
    if (fs.existsSync(parentPath)) {
      const parentStatus = readRunStatusFile(parentPath, data.parentStatusId);
      if (!isRunAttentionCommand(parentStatus.currentCommand)) {
        writeRunStatus(parentPath, {
          schemaVersion: 1,
          statusId: data.parentStatusId,
          agent: validateRunAgent(parentStatus.agent),
          state: 'running',
          checkpoint: 'working',
          currentCommand: `dispatching ${data.agentName}`,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  const usageContext = {
    pipelineRunId: data.pipelineRunId || null,
    parentInvocationId: data.parentInvocationId || null,
  };
  const promptBlocks = {
    project: { projectRoot: path.dirname(fixmeDir), fixmeDir },
    usageContext,
    taskStateOwner: activeChild
      ? { ownerSkill: 'fixme-task', taskStatePath: activeChild.taskStatePath }
      : null,
    parentContinuation: isPlainObject(data.parentContinuation) ? data.parentContinuation : null,
    continuation,
    activeChild,
    promptInputs: data.promptInputs,
    liveness: { statusId: child.statusId, statusPath: child.statusPath },
    taskInput: data.promptInputs,
  };

  const out = {
    dispatchId,
    fixmeDir,
    agentName: data.agentName,
    transport: data.transport,
    statusId: child.statusId,
    statusPath: child.statusPath,
    runtimeSettings,
    bannerMarkdown: buildDispatchBannerMarkdown(data.agentName, runtimeSettings),
    continuation,
    usageContext,
    activeChild,
    promptBlocks,
  };

  writeJsonAtomic(recordPath, {
    schemaVersion: 1,
    dispatchId,
    idempotencyKey: data.idempotencyKey,
    statusId: child.statusId,
    durableInputs,
    output: out,
    createdAt: new Date().toISOString(),
  });

  return out;
}

function lifecycleDispatchPrepare(flags, fixmeRoot) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  return lifecycleOk(dispatchPrepareCore(fixmeDir, data, flags));
}

function lifecycleDispatchComplete(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  try {
    assertKnownJsonFields(data, 'dispatch complete', LIFECYCLE_DISPATCH_COMPLETE_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['dispatchId', 'statusId', 'status']) {
    if (!isNonEmptyString(data[field])) {
      lifecycleError('missingRequiredField', `${field} is required`);
    }
  }
  if (data.status !== 'completed' && data.status !== 'failed') {
    lifecycleError('invalidInput', 'status must be one of: completed, failed');
  }
  if (data.currentCommand !== undefined && data.currentCommand !== null && typeof data.currentCommand !== 'string') {
    lifecycleError('invalidInput', 'currentCommand must be a string or null');
  }
  if (data.failure !== undefined) {
    if (data.status !== 'failed') {
      lifecycleError('invalidInput', 'failure is only allowed when status is failed');
    }
    if (!isPlainObject(data.failure) || !isNonEmptyString(data.failure.message)) {
      lifecycleError('invalidInput', 'failure must be an object with a non-empty message');
    }
  }

  const dispatchRecord = findDispatchRecordById(fixmeDir, data.dispatchId);
  if (!dispatchRecord) {
    lifecycleError('stateNotFound', `Prepared dispatch not found: ${data.dispatchId}`);
  }
  if (dispatchRecord.record.statusId !== data.statusId) {
    lifecycleError('invalidInput', `statusId ${data.statusId} does not match prepared dispatch ${data.dispatchId}`);
  }
  if (data.runtimeHandle !== undefined && data.status !== 'completed') {
    lifecycleError('invalidInput', 'runtimeHandle is only allowed when status is completed');
  }

  const completionInputs = {
    status: data.status,
    currentCommand: data.currentCommand === undefined ? null : data.currentCommand,
    failure: data.failure === undefined ? null : data.failure,
    runtimeHandle: data.runtimeHandle === undefined ? null : data.runtimeHandle,
  };
  if (dispatchRecord.record.completion !== undefined) {
    if (!jsonEqual(dispatchRecord.record.completion.inputs, completionInputs)) {
      lifecycleError('conflictingDuplicate', `dispatch ${data.dispatchId} already completed with different inputs`);
    }
    clearDispatchParentWaitMarker(fixmeDir, data.parentStatusId);
    return lifecycleOk(dispatchRecord.record.completion.output);
  }

  const statusPath = runStatusPath(fixmeDir, data.statusId);
  if (!fs.existsSync(statusPath)) {
    lifecycleError('stateNotFound', `Child run status not found: ${data.statusId}`);
  }
  const previous = readRunStatusFile(statusPath, data.statusId);

  // Never overwrite an active attention marker.
  if (isRunAttentionCommand(previous.currentCommand)) {
    lifecycleError('activeAttention', `Child run has pending attention: ${previous.currentCommand}`);
  }

  const isTerminal = previous.state === 'completed' || previous.state === 'failed';
  if (isTerminal) {
    if (previous.state === data.status) {
      const persistedCompletionInputs = {
        status: previous.state,
        currentCommand: previous.currentCommand === undefined ? null : previous.currentCommand,
        failure: previous.failure === undefined ? null : previous.failure,
        runtimeHandle: data.runtimeHandle === undefined ? null : data.runtimeHandle,
      };
      if (!jsonEqual(persistedCompletionInputs, completionInputs)) {
        lifecycleError('conflictingDuplicate', `dispatch ${data.dispatchId} already completed with different inputs`);
      }
      const producerContinuationPreflight = preflightProducerContinuationFromCompletion(
        dispatchRecord,
        data.runtimeHandle,
        new Date().toISOString(),
      );
      const producerContinuationResult = recordProducerContinuationFromCompletion(producerContinuationPreflight);
      const outputData = {
        dispatchId: data.dispatchId,
        statusId: data.statusId,
        status: previous.state,
        currentCommand: previous.currentCommand,
        statusPath,
      };
      if (previous.failure !== undefined) {
        outputData.failure = previous.failure;
      }
      if (producerContinuationResult) {
        outputData.producerContinuation = producerContinuationResult.producerContinuation;
      }
      dispatchRecord.record.completion = {
        inputs: completionInputs,
        output: outputData,
        completedAt: new Date().toISOString(),
      };
      writeJsonAtomic(dispatchRecord.recordPath, dispatchRecord.record);
      clearDispatchParentWaitMarker(fixmeDir, data.parentStatusId);
      return lifecycleOk(outputData);
    }
    lifecycleError('conflictingDuplicate', `Child already finalized as ${previous.state}, cannot mark ${data.status}`);
  }

  const nextStatus = {
    schemaVersion: 1,
    statusId: data.statusId,
    agent: validateRunAgent(previous.agent),
    state: data.status,
    checkpoint: 'done',
    currentCommand: completionInputs.currentCommand,
    updatedAt: new Date().toISOString(),
  };
  if (completionInputs.failure !== null) {
    nextStatus.failure = completionInputs.failure;
  }
  const producerContinuationPreflight = preflightProducerContinuationFromCompletion(
    dispatchRecord,
    data.runtimeHandle,
    new Date().toISOString(),
  );
  const next = writeRunStatus(statusPath, nextStatus);
  clearDispatchParentWaitMarker(fixmeDir, data.parentStatusId);
  const producerContinuationResult = recordProducerContinuationFromCompletion(producerContinuationPreflight);
  const outputData = {
    dispatchId: data.dispatchId,
    statusId: data.statusId,
    status: next.state,
    currentCommand: next.currentCommand,
    statusPath,
  };
  if (next.failure !== undefined) {
    outputData.failure = next.failure;
  }
  if (producerContinuationResult) {
    outputData.producerContinuation = producerContinuationResult.producerContinuation;
  }
  dispatchRecord.record.completion = {
    inputs: completionInputs,
    output: outputData,
    completedAt: new Date().toISOString(),
  };
  writeJsonAtomic(dispatchRecord.recordPath, dispatchRecord.record);
  return lifecycleOk(outputData);
}

// Reset a parent's "dispatching <agent>" wait marker back to a working idle
// state after a child finalizes. Never overwrites an active attention marker:
// attention records own the parent's waiting status until they are answered.
function clearDispatchParentWaitMarker(fixmeDir, parentStatusId) {
  if (!isNonEmptyString(parentStatusId)) return;
  const parentPath = runStatusPath(fixmeDir, parentStatusId);
  if (!fs.existsSync(parentPath)) return;
  const parentStatus = readRunStatusFile(parentPath, parentStatusId);
  if (isRunAttentionCommand(parentStatus.currentCommand)) return;
  writeRunStatus(parentPath, {
    schemaVersion: 1,
    statusId: parentStatusId,
    agent: validateRunAgent(parentStatus.agent),
    state: 'running',
    checkpoint: 'working',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
  });
}

// ============================================================================
// Subcommands: lifecycle attention
// ============================================================================

const LIFECYCLE_ATTENTION_OPEN_FIELDS = new Set(['statusId', 'taskStatePath', 'checkpointData', 'attention']);
const LIFECYCLE_BROKER_ANSWER_FIELDS = new Set(['answer', 'answeredBy', 'answerKind']);
const LIFECYCLE_ATTENTION_CONSUME_FIELDS = new Set(['statusId', 'taskStatePath', 'attentionId', 'mode', 'decisionRecords', 'checkpointData']);
const LIFECYCLE_ATTENTION_CONSUME_MODES = Object.freeze(['resolvedDecision', 'clarificationRequest', 'partialDecision']);

function normalizeLifecycleAttentionConsumeData(flags) {
  const data = resolveLifecycleData(flags);
  try {
    assertCamelCaseJsonKeys(data, 'attention consume data');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  try {
    assertKnownJsonFields(data, 'attention consume', LIFECYCLE_ATTENTION_CONSUME_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  if (!isNonEmptyString(data.statusId)) {
    lifecycleError('missingRequiredField', 'statusId is required');
  }
  if (!isNonEmptyString(data.taskStatePath)) {
    lifecycleError('missingRequiredField', 'taskStatePath is required');
  }
  if (!isNonEmptyString(data.attentionId)) {
    lifecycleError('missingRequiredField', 'attentionId is required');
  }
  if (!isPlainObject(data.checkpointData)) {
    lifecycleError('missingRequiredField', 'checkpointData is required');
  }
  const mode = data.mode || 'resolvedDecision';
  if (!LIFECYCLE_ATTENTION_CONSUME_MODES.includes(mode)) {
    lifecycleError('invalidInput', `mode must be one of: ${LIFECYCLE_ATTENTION_CONSUME_MODES.join(', ')}`);
  }
  const decisionRecords = Object.prototype.hasOwnProperty.call(data, 'decisionRecords') ? data.decisionRecords : [];
  if (!Array.isArray(decisionRecords)) {
    lifecycleError('invalidInput', 'decisionRecords must be an array');
  }
  if (mode !== 'resolvedDecision' && decisionRecords.length > 0) {
    lifecycleError('invalidInput', `${mode} consume must not include final decisionRecords`);
  }
  for (const [index, record] of decisionRecords.entries()) {
    if (!isPlainObject(record)) {
      lifecycleError('invalidInput', `decisionRecords.${index} must be a JSON object`);
    }
    validateTaskDecisionRecord(record);
  }
  let attentionId;
  try {
    attentionId = validateAttentionId(data.attentionId);
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  const statePath = path.resolve(String(data.taskStatePath));
  if (!fs.existsSync(statePath)) {
    lifecycleError('stateNotFound', `Task state file not found: ${statePath}`);
  }
  return {
    statusId: data.statusId,
    statePath,
    attentionId,
    mode,
    decisionRecords,
    checkpointData: data.checkpointData,
  };
}

function taskStateMatchesCheckpointData(state, checkpointData) {
  for (const [key, value] of Object.entries(checkpointData)) {
    if (!jsonEqual(state[key], value)) {
      return false;
    }
  }
  return true;
}

function taskStateIncludesDecisionRecords(state, decisionRecords) {
  const decisions = Array.isArray(state.decisions) ? state.decisions : [];
  for (const record of decisionRecords) {
    const existing = decisions.find(decision => decision.id === record.id);
    if (!existing || !jsonEqual(normalizeDecisionForCompare(existing), normalizeDecisionForCompare(record))) {
      return false;
    }
  }
  return true;
}

function taskStateReflectsConsume(state, checkpointData, decisionRecords) {
  return taskStateMatchesCheckpointData(state, checkpointData)
    && taskStateIncludesDecisionRecords(state, decisionRecords);
}

function lifecycleAttentionConsumeReplayPayload(statusId, statePath, attentionId, mode, decisionRecords, extras = {}) {
  return lifecycleOk({
    statusId,
    taskStatePath: statePath,
    attentionId,
    mode,
    decisionCount: decisionRecords.length,
    decisions: decisionRecords.map(record => ({ id: record.id, attentionId: record.attentionId, status: 'active' })),
    consumed: true,
    cleared: true,
    replay: true,
    ...extras,
  });
}

function lifecycleAttentionOpen(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  try {
    assertKnownJsonFields(data, 'attention open', LIFECYCLE_ATTENTION_OPEN_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  if (!isNonEmptyString(data.statusId)) {
    lifecycleError('missingRequiredField', 'statusId is required');
  }
  if (!isNonEmptyString(data.taskStatePath)) {
    lifecycleError('missingRequiredField', 'taskStatePath is required');
  }
  if (!isPlainObject(data.attention)) {
    lifecycleError('missingRequiredField', 'attention is required');
  }
  if (!isPlainObject(data.checkpointData)) {
    lifecycleError('missingRequiredField', 'checkpointData is required');
  }

  const statePath = path.resolve(String(data.taskStatePath));
  if (!fs.existsSync(statePath)) {
    lifecycleError('stateNotFound', `Task state file not found: ${statePath}`);
  }

  // Resolve the attention id (carried in attention.attentionId or generated).
  let attentionId;
  try {
    attentionId = isNonEmptyString(data.attention.attentionId)
      ? validateAttentionId(data.attention.attentionId)
      : generateUsageId('attn');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }

  const attentionPath = runAttentionPath(fixmeDir, data.statusId, attentionId);

  // FIX 4 idempotency pre-check: an existing record for statusId+attentionId.
  if (fs.existsSync(attentionPath)) {
    const existing = readJsonFileStrict(attentionPath);
    const existingCheckpoint = existing.metadata && existing.metadata.openCheckpointData;
    const samePrompt = existing.promptMarkdown === data.attention.promptMarkdown;
    const sameTaskState = existing.taskStatePath === statePath;
    const sameCheckpoint = jsonEqual(existingCheckpoint || null, data.checkpointData || null);
    if (samePrompt && sameTaskState && sameCheckpoint) {
      return lifecycleOk({
        attentionId,
        statusId: data.statusId,
        taskStatePath: statePath,
        attentionPath,
        directive: `FIXME_ATTENTION_REQUIRED: ${attentionId}`,
      });
    }
    lifecycleError('conflictingDuplicate', `attention ${attentionId} already open with different prompt/state/checkpoint`);
  }

  // Snapshot, checkpoint-first, then create attention.
  const snapshot = readJsonFileStrict(statePath);
  let checkpointed;
  try {
    checkpointed = mergeTaskState(snapshot, data.checkpointData);
    assertCamelCaseJsonKeys(checkpointed, 'task state');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  writeJsonAtomic(statePath, checkpointed);

  const attentionData = {
    ...data.attention,
    attentionId,
    taskStatePath: statePath,
    metadata: { ...(isPlainObject(data.attention.metadata) ? data.attention.metadata : {}), openCheckpointData: data.checkpointData },
  };

  try {
    runAttentionSetCore({
      'fixme-dir': fixmeDir,
      'status-id': data.statusId,
      data: JSON.stringify(attentionData),
    });
  } catch (setError) {
    // Restore the pre-open snapshot.
    try {
      writeJsonAtomic(statePath, snapshot);
    } catch (restoreError) {
      lifecycleError('ioFailure', `Attention creation failed and task-state restore failed: ${restoreError.message}`, { repaired: false, taskStatePath: statePath, attentionId });
    }
    lifecycleError('attentionBlocked', setError.message, { repaired: true, failedCommand: 'run attention set', attentionId });
  }

  return lifecycleOk({
    attentionId,
    statusId: data.statusId,
    taskStatePath: statePath,
    attentionPath,
    directive: `FIXME_ATTENTION_REQUIRED: ${attentionId}`,
  });
}

function lifecycleAttentionBrokerProjection(record) {
  // Whitelist projection: the broker is the parent-facing surface and must not
  // expose task-owned decision state. metadata.openCheckpointData carries the
  // task's pendingDecision and is consumed only internally by the attention-open
  // replay compare, never via broker show or answer.
  const projection = {
    attentionId: record.attentionId,
    statusId: record.statusId,
    status: record.status,
    promptMarkdown: record.promptMarkdown,
    answerMode: record.answerMode,
    sourceSkill: record.sourceSkill,
    kind: record.kind,
    createdAt: record.createdAt,
  };
  if (record.status === 'answered' && record.answer !== undefined) {
    projection.answer = record.answer;
  }
  return projection;
}

function lifecycleAttentionBrokerShow(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  try {
    const record = runAttentionShowCore({
      'fixme-dir': fixmeDir,
      'status-id': flags['status-id'],
      'attention-id': flags['attention-id'],
    });
    return lifecycleOk(lifecycleAttentionBrokerProjection(record));
  } catch (e) {
    if (/not found/i.test(e.message)) {
      lifecycleError('stateNotFound', e.message);
    }
    lifecycleError('invalidInput', e.message);
  }
}

function lifecycleAttentionBrokerAnswer(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  try {
    assertKnownJsonFields(data, 'attention broker answer', LIFECYCLE_BROKER_ANSWER_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }

  // Idempotency: if already answered, compare durable answer inputs.
  let existingRecord = null;
  try {
    existingRecord = runAttentionShowCore({
      'fixme-dir': fixmeDir,
      'status-id': flags['status-id'],
      'attention-id': flags['attention-id'],
    });
  } catch (e) {
    if (/not found/i.test(e.message)) {
      lifecycleError('stateNotFound', e.message);
    }
    lifecycleError('invalidInput', e.message);
  }
  if (existingRecord.status === 'answered') {
    const prior = existingRecord.answer || {};
    if (prior.answer === data.answer && prior.answeredBy === data.answeredBy && prior.answerKind === data.answerKind) {
      return lifecycleOk(lifecycleAttentionBrokerProjection(existingRecord));
    }
    lifecycleError('conflictingDuplicate', `attention ${flags['attention-id']} already answered with different answer`);
  }

  try {
    const answered = runAttentionAnswerCore({
      'fixme-dir': fixmeDir,
      'status-id': flags['status-id'],
      'attention-id': flags['attention-id'],
      data: JSON.stringify(data),
    });
    return lifecycleOk(lifecycleAttentionBrokerProjection(answered));
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
}

function lifecycleAttentionConsume(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const { statusId, statePath, attentionId, mode, decisionRecords, checkpointData } = normalizeLifecycleAttentionConsumeData(flags);
  const state = readJsonFileStrict(statePath);
  const alreadyApplied = taskStateReflectsConsume(state, checkpointData, decisionRecords);
  const attentionPath = runAttentionPath(fixmeDir, statusId, attentionId);

  if (!fs.existsSync(attentionPath)) {
    if (alreadyApplied) {
      return lifecycleAttentionConsumeReplayPayload(statusId, statePath, attentionId, mode, decisionRecords, { recordRemoved: true });
    }
    lifecycleError('stateNotFound', `Run attention not found: ${attentionId}`);
  }

  let attentionRecord;
  let runStatus;
  try {
    const read = readAttentionRecord(fixmeDir, statusId, attentionId);
    attentionRecord = read.record;
    runStatus = read.runStatus;
  } catch (e) {
    if (/not found/i.test(e.message)) {
      if (alreadyApplied) {
        return lifecycleAttentionConsumeReplayPayload(statusId, statePath, attentionId, mode, decisionRecords, { recordRemoved: true });
      }
      lifecycleError('stateNotFound', e.message);
    }
    lifecycleError('invalidInput', e.message);
  }

  if (attentionRecord.taskStatePath !== statePath) {
    lifecycleError('invalidInput', `attention taskStatePath does not match requested taskStatePath: ${attentionRecord.taskStatePath}`);
  }
  if (attentionRecord.status !== 'answered') {
    lifecycleError('invalidInput', `Run attention must be answered before consume: ${attentionId}`);
  }
  const expectedCommand = `attention:${attentionId}`;
  if (runStatus.currentCommand !== expectedCommand) {
    if (alreadyApplied) {
      let staleRecordRemoved = false;
      try {
        fs.rmSync(attentionPath, { force: true });
        staleRecordRemoved = true;
      } catch (_) {}
      return lifecycleAttentionConsumeReplayPayload(statusId, statePath, attentionId, mode, decisionRecords, { recordRemoved: staleRecordRemoved });
    }
    lifecycleError('staleState', `Run is not waiting on attention ${attentionId}`);
  }

  const pendingDecision = isPlainObject(state.pendingDecision) ? state.pendingDecision : null;
  if (!alreadyApplied) {
    if (!pendingDecision || pendingDecision.attentionId !== attentionId) {
      lifecycleError('staleState', `Task state pendingDecision does not match attention ${attentionId}`);
    }
    if (isNonEmptyString(pendingDecision.attentionStatusId) && pendingDecision.attentionStatusId !== statusId) {
      lifecycleError('staleState', `Task state pendingDecision.attentionStatusId does not match run status ${statusId}`);
    }
  }

  if (mode === 'clarificationRequest' && attentionRecord.answer && attentionRecord.answer.answerKind !== 'clarificationRequest') {
    lifecycleError('invalidInput', 'clarificationRequest consume requires an answered clarificationRequest attention');
  }
  if ((mode === 'resolvedDecision' || mode === 'partialDecision') && attentionRecord.answer && attentionRecord.answer.answerKind !== 'decision') {
    lifecycleError('invalidInput', `${mode} consume requires an answered decision attention`);
  }

  let nextState = state;
  const consumedDecisions = [];
  for (const record of decisionRecords) {
    const result = appendTaskDecisionRecordToState(nextState, fixmeDir, record);
    nextState = result.state;
    consumedDecisions.push(result.decision);
  }

  let checkpointed;
  try {
    checkpointed = mergeTaskState(nextState, checkpointData);
    assertCamelCaseJsonKeys(checkpointed, 'task state');
  } catch (e) {
    lifecycleError('invalidInput', e.message);
  }
  writeJsonAtomic(statePath, checkpointed);

  let clearResult;
  try {
    clearResult = runAttentionClearCore({
      'fixme-dir': fixmeDir,
      'status-id': statusId,
      'attention-id': attentionId,
    });
  } catch (e) {
    const currentState = readJsonFileStrict(statePath);
    if (taskStateReflectsConsume(currentState, checkpointData, decisionRecords) && /not found|not waiting/i.test(e.message)) {
      return lifecycleAttentionConsumeReplayPayload(statusId, statePath, attentionId, mode, decisionRecords, { clearWarning: e.message });
    }
    lifecycleError('invalidInput', e.message);
  }

  return lifecycleOk({
    statusId,
    taskStatePath: statePath,
    attentionId,
    mode,
    decisionCount: consumedDecisions.length,
    decisions: consumedDecisions.map(record => ({ id: record.id, attentionId: record.attentionId, status: record.status })),
    consumed: true,
    cleared: clearResult.cleared,
    recordRemoved: clearResult.recordRemoved,
    warnings: clearResult.warnings,
  });
}

// ============================================================================
// Subcommands: lifecycle wait
// ============================================================================

function readLifecycleRunStatusForWait(fixmeDir, statusId) {
  const statusPath = runStatusPath(fixmeDir, statusId);
  if (!fs.existsSync(statusPath)) {
    lifecycleError('stateNotFound', `Run status not found: ${statusId}`);
  }
  return { statusPath, status: readRunStatusFile(statusPath, statusId) };
}

function lifecycleWaitBegin(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const statusId = flags['status-id'];
  if (!isNonEmptyString(statusId)) {
    lifecycleError('invalidInput', '--status-id is required');
  }
  const label = flags.label;
  if (!isNonEmptyString(label) || label === true) {
    lifecycleError('invalidInput', '--label is required');
  }
  const { statusPath, status } = readLifecycleRunStatusForWait(fixmeDir, statusId);
  if (isRunAttentionCommand(status.currentCommand)) {
    lifecycleError('activeAttention', `Run has pending attention: ${status.currentCommand}`);
  }
  if (status.currentCommand !== null && status.currentCommand !== label) {
    lifecycleError('staleState', `Run already waiting on a different command: ${status.currentCommand}`);
  }
  const next = writeRunStatus(statusPath, {
    schemaVersion: 1,
    statusId,
    agent: validateRunAgent(status.agent),
    state: 'running',
    checkpoint: 'working',
    currentCommand: String(label),
    updatedAt: new Date().toISOString(),
  });
  return lifecycleOk(next);
}

function lifecycleWaitEnd(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const statusId = flags['status-id'];
  if (!isNonEmptyString(statusId)) {
    lifecycleError('invalidInput', '--status-id is required');
  }
  const { statusPath, status } = readLifecycleRunStatusForWait(fixmeDir, statusId);
  if (isRunAttentionCommand(status.currentCommand)) {
    lifecycleError('activeAttention', `Run has pending attention: ${status.currentCommand}`);
  }
  const next = writeRunStatus(statusPath, {
    schemaVersion: 1,
    statusId,
    agent: validateRunAgent(status.agent),
    state: 'running',
    checkpoint: 'working',
    currentCommand: null,
    updatedAt: new Date().toISOString(),
  });
  return lifecycleOk(next);
}

// ============================================================================
// Subcommands: lifecycle parent
// ============================================================================

const PARENT_SKILLS = new Set(['fixme-pr-comments', 'fixme-session']);

const PR_PARENT_STATUSES = new Set(['running', 'waitingForUser', 'waitingForChild', 'completed', 'failed']);
const PR_TERMINAL_STATUSES = new Set(['completed', 'failed']);

const PR_PARENT_CURSORS = new Set([
  'fetchReviewItems', 'analyzeReviewItems', 'consultUser', 'presentAnalysis', 'confirmExecution',
  'dispatchFixmeTask', 'awaitFixmeTask', 'brokerChildAttention', 'consumeTaskEvent', 'verify',
  'commit', 'push', 'replyComments', 'resolveThreads', 'summarize',
]);

const PR_PARENT_CURSOR_SPECS = Object.freeze({
  fetchReviewItems: { required: ['flags', 'pullRequestRef'], next: ['analyzeReviewItems', 'summarize'] },
  analyzeReviewItems: { required: ['flags', 'reviewItems'], next: ['consultUser', 'presentAnalysis'] },
  consultUser: { required: ['reviewItems', 'analysis', 'pendingConsultation'], next: ['presentAnalysis'] },
  presentAnalysis: { required: ['reviewItems', 'analysis', 'routedGroups', 'flags'], next: ['confirmExecution', 'dispatchFixmeTask', 'replyComments', 'summarize'] },
  confirmExecution: { required: ['analysis', 'routedGroups', 'flags', 'pendingConfirmation'], next: ['presentAnalysis', 'dispatchFixmeTask', 'summarize'] },
  dispatchFixmeTask: { required: ['fixBatches', 'activeBatchIndex', 'parentContinuation'], next: ['awaitFixmeTask'] },
  awaitFixmeTask: {
    required: ['fixBatches', 'activeBatchIndex', 'activeChild.statusId', 'activeChild.taskRunId', 'activeChild.taskStatePath', 'activeChild.resumeRef'],
    next: ['brokerChildAttention', 'consumeTaskEvent'],
  },
  brokerChildAttention: {
    required: ['fixBatches', 'activeBatchIndex', 'activeChild.statusId', 'activeChild.attentionId', 'activeChild.resumeRef'],
    next: ['awaitFixmeTask'],
  },
  consumeTaskEvent: {
    required: ['fixBatches', 'activeBatchIndex', 'activeChild.taskRunId', 'taskEvent.eventId', 'taskEvent.resultSummaryPath'],
    next: ['dispatchFixmeTask', 'verify', 'summarize'],
  },
  verify: { required: ['childResultSummaryPaths', 'routedGroups', 'flags'], next: ['commit', 'replyComments', 'summarize'] },
  commit: { required: ['verificationResults', 'changedFiles', 'expectedHeadSha', 'changedFilesDigest', 'flags'], next: ['push', 'replyComments', 'summarize'] },
  push: { required: ['commitSha', 'pushRemote', 'pushRef', 'pushTarget', 'flags'], next: ['replyComments', 'summarize'] },
  replyComments: { required: ['analysis', 'routedGroups', 'replyExecutionTable', 'flags'], next: ['resolveThreads', 'summarize'] },
  resolveThreads: { required: ['replyExecutionTable', 'allowedUnresolvedSet', 'flags'], next: ['summarize'] },
  summarize: { required: [], next: [] },
});

const PARENT_LEDGER_SLOTS = new Set([
  'reviewItems', 'analysis', 'routedGroups', 'childResultSummaryPaths', 'verificationResults',
  'commitResult', 'pushResult', 'replyExecutionTable', 'unresolvedAccounting',
  'sessionTaskRef', 'fixBatches',
]);

const PARENT_FAILURE_REASONS = new Set([
  'userAborted', 'fetchFailed', 'analysisFailed', 'taskDispatchFailed', 'childFailed',
  'verificationFailed', 'commitFailed', 'pushFailed', 'replyFailed', 'resolveFailed',
  'usageTrackingFailed', 'toolUnavailable', 'runtimeError', 'staleParentMissingActiveChild', 'unknown',
]);

const PARENT_CREATE_FIELDS = new Set(['parentSkill', 'idempotencyKey', 'lookupInput', 'status', 'cursor', 'payload']);
const PARENT_CHECKPOINT_FIELDS = new Set(['idempotencyKey', 'expectedRevision', 'status', 'cursor', 'payload', 'ledger', 'failure']);
const PARENT_ABANDON_FIELDS = new Set(['parentRunId', 'idempotencyKey', 'reason', 'message', 'preserveLedger']);
const PR_LOOKUP_REF_FIELDS = new Set(['host', 'owner', 'repo', 'number', 'headOwner', 'headRepo', 'headRef']);
const PR_NORMALIZED_FLAG_FIELDS = new Set(['pause', 'skipCommit', 'skipPush', 'skipResolve', 'skipResponse']);
const SESSION_TASK_REF_FIELDS = new Set(['sessionPath', 'ticketPath']);

function parentStatePath(fixmeDir, parentRunId) {
  return path.join(fixmeDir, 'parents', parentRunId, 'state.json');
}

function parentIndexPath(fixmeDir, lookupKeyHash) {
  return path.join(fixmeDir, 'parents', 'index', `${lookupKeyHash}.json`);
}

function isValidBranchName(name) {
  // Reject full refs, whitespace, and clearly invalid branch names.
  if (typeof name !== 'string' || name.trim() !== name || name === '') return false;
  if (name.startsWith('refs/')) return false;
  if (/[\s~^:?*[\\]/.test(name)) return false;
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.lock') || name.includes('..')) return false;
  return true;
}

function normalizePrLookupInput(lookupInput) {
  if (!isPlainObject(lookupInput) || !isPlainObject(lookupInput.pullRequestRef)) {
    lifecycleError('invalidInput', 'lookupInput.pullRequestRef is required');
  }
  const ref = lookupInput.pullRequestRef;
  try {
    assertKnownJsonFields(ref, 'pullRequestRef', PR_LOOKUP_REF_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  const lowerFields = ['host', 'owner', 'repo'];
  const normalizedRef = {};
  for (const field of lowerFields) {
    if (!isNonEmptyString(ref[field]) || ref[field].trim() !== ref[field]) {
      lifecycleError('invalidInput', `pullRequestRef.${field} must be a non-empty string without surrounding whitespace`);
    }
    normalizedRef[field] = ref[field].toLowerCase();
  }
  if (!Number.isInteger(ref.number) || ref.number <= 0) {
    lifecycleError('invalidInput', 'pullRequestRef.number must be a positive integer');
  }
  normalizedRef.number = ref.number;
  for (const field of ['headOwner', 'headRepo']) {
    if (ref[field] !== undefined) {
      if (!isNonEmptyString(ref[field]) || ref[field].trim() !== ref[field]) {
        lifecycleError('invalidInput', `pullRequestRef.${field} must be a non-empty string without surrounding whitespace`);
      }
      normalizedRef[field] = ref[field].toLowerCase();
    }
  }
  if (ref.headRef !== undefined) {
    if (!isValidBranchName(ref.headRef)) {
      lifecycleError('invalidInput', 'pullRequestRef.headRef must be a non-empty branch name, not a full ref');
    }
    normalizedRef.headRef = ref.headRef;
  }

  let normalizedFlags = {};
  if (lookupInput.normalizedFlags !== undefined) {
    if (!isPlainObject(lookupInput.normalizedFlags)) {
      lifecycleError('invalidInput', 'lookupInput.normalizedFlags must be an object');
    }
    try {
      assertKnownJsonFields(lookupInput.normalizedFlags, 'normalizedFlags', PR_NORMALIZED_FLAG_FIELDS);
    } catch (e) {
      lifecycleError('unknownField', e.message);
    }
    for (const field of PR_NORMALIZED_FLAG_FIELDS) {
      const value = lookupInput.normalizedFlags[field];
      if (value !== undefined && typeof value !== 'boolean') {
        lifecycleError('invalidInput', `normalizedFlags.${field} must be a boolean`);
      }
      normalizedFlags[field] = value === true;
    }
    if (normalizedFlags.skipCommit) {
      normalizedFlags.skipPush = true;
    }
  } else {
    for (const field of PR_NORMALIZED_FLAG_FIELDS) normalizedFlags[field] = false;
  }

  return { pullRequestRef: normalizedRef, normalizedFlags };
}

function normalizeSessionLookupInput(lookupInput) {
  if (!isPlainObject(lookupInput) || !isPlainObject(lookupInput.sessionTaskRef)) {
    lifecycleError('invalidInput', 'lookupInput.sessionTaskRef is required');
  }
  try {
    assertKnownJsonFields(lookupInput.sessionTaskRef, 'sessionTaskRef', SESSION_TASK_REF_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  const sessionPath = lookupInput.sessionTaskRef.sessionPath;
  const ticketPath = lookupInput.sessionTaskRef.ticketPath;
  if (!isNonEmptyString(sessionPath) || !path.isAbsolute(sessionPath)) {
    lifecycleError('invalidInput', 'sessionTaskRef.sessionPath must be an absolute path');
  }
  if (!isNonEmptyString(ticketPath) || !path.isAbsolute(ticketPath)) {
    lifecycleError('invalidInput', 'sessionTaskRef.ticketPath must be an absolute path');
  }
  return { sessionTaskRef: { sessionPath: path.resolve(sessionPath), ticketPath: path.resolve(ticketPath) } };
}

function normalizeParentLookupInput(parentSkill, lookupInput) {
  if (parentSkill === 'fixme-pr-comments') return normalizePrLookupInput(lookupInput);
  if (parentSkill === 'fixme-session') return normalizeSessionLookupInput(lookupInput);
  lifecycleError('invalidInput', `Unsupported parentSkill: ${parentSkill}`);
}

function parentNaturalKeyFor(parentSkill, normalizedLookupInput) {
  if (parentSkill === 'fixme-session') {
    const ref = normalizedLookupInput.sessionTaskRef;
    return stableHash({ parentSkill, sessionTaskRef: { sessionPath: ref.sessionPath, ticketPath: ref.ticketPath } });
  }
  const ref = normalizedLookupInput.pullRequestRef;
  return stableHash({
    parentSkill,
    prIdentity: { host: ref.host, owner: ref.owner, repo: ref.repo, number: ref.number },
    normalizedFlags: normalizedLookupInput.normalizedFlags,
  });
}

function parentBroadKeyFor(parentSkill, normalizedLookupInput) {
  if (parentSkill === 'fixme-session') {
    return parentNaturalKeyFor(parentSkill, normalizedLookupInput);
  }
  const ref = normalizedLookupInput.pullRequestRef;
  return stableHash({
    parentSkill,
    prIdentity: { host: ref.host, owner: ref.owner, repo: ref.repo, number: ref.number },
  });
}

function parentCreateDigest(createInput) {
  return stableHash(createInput);
}

function appendParentIndexEntry(fixmeDir, lookupKeyHash, parentRunId) {
  const indexPath = parentIndexPath(fixmeDir, lookupKeyHash);
  let entries = [];
  if (fs.existsSync(indexPath)) {
    entries = readJsonFileStrict(indexPath).parentRunIds || [];
  }
  if (!entries.includes(parentRunId)) {
    entries.push(parentRunId);
  }
  writeJsonAtomic(indexPath, { schemaVersion: 1, lookupKeyHash, parentRunIds: entries });
}

function readParentIndexEntries(fixmeDir, lookupKeyHash) {
  const indexPath = parentIndexPath(fixmeDir, lookupKeyHash);
  if (!fs.existsSync(indexPath)) return [];
  return readJsonFileStrict(indexPath).parentRunIds || [];
}

function findIdempotencyParentRun(fixmeDir, parentSkill, idempotencyKey) {
  const idemHash = stableHash({ parentSkill, idempotencyKey });
  const entries = readParentIndexEntries(fixmeDir, `idem-${idemHash}`);
  return entries.length ? entries[0] : null;
}

function hasNestedPayloadField(payload, fieldPath) {
  let cursor = payload;
  for (const part of fieldPath.split('.')) {
    if (!isPlainObject(cursor) && !Array.isArray(cursor)) return false;
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) return false;
    cursor = cursor[part];
  }
  return cursor !== undefined && cursor !== null;
}

function validatePrCursorPayload(cursor, payload) {
  if (!PR_PARENT_CURSORS.has(cursor)) {
    lifecycleError('invalidInput', `Unsupported cursor: ${cursor}`);
  }
  if (!isPlainObject(payload)) {
    lifecycleError('invalidInput', 'payload must be a JSON object');
  }
  const spec = PR_PARENT_CURSOR_SPECS[cursor];
  for (const fieldPath of spec.required) {
    if (!hasNestedPayloadField(payload, fieldPath)) {
      lifecycleError('missingRequiredField', `payload.${fieldPath} is required for cursor ${cursor}`);
    }
  }
  if (cursor === 'summarize' && Object.keys(payload).length > 0) {
    lifecycleError('invalidInput', 'summarize payload must be empty; use ledger and failure for summary inputs');
  }
}

function validatePrCursorTransition(fromCursor, toCursor) {
  if (fromCursor === toCursor) return;
  const spec = PR_PARENT_CURSOR_SPECS[fromCursor];
  if (!spec || !spec.next.includes(toCursor)) {
    lifecycleError('invalidInput', `Invalid parent cursor transition: ${fromCursor} -> ${toCursor}`);
  }
}

function parentCreateCore(fixmeDir, data) {
  try {
    assertKnownJsonFields(data, 'parent create', PARENT_CREATE_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['parentSkill', 'idempotencyKey', 'status', 'cursor']) {
    if (!isNonEmptyString(data[field])) {
      lifecycleError('missingRequiredField', `${field} is required`);
    }
  }
  if (!PARENT_SKILLS.has(data.parentSkill)) {
    lifecycleError('invalidInput', `Unsupported parentSkill: ${data.parentSkill}`);
  }
  if (!PR_PARENT_STATUSES.has(data.status)) {
    lifecycleError('invalidInput', `Unsupported status: ${data.status}`);
  }
  validatePrCursorPayload(data.cursor, data.payload);

  const normalizedLookupInput = normalizeParentLookupInput(data.parentSkill, data.lookupInput);
  const parentNaturalKey = parentNaturalKeyFor(data.parentSkill, normalizedLookupInput);
  const broadKey = parentBroadKeyFor(data.parentSkill, normalizedLookupInput);
  const durableCreateInput = {
    parentSkill: data.parentSkill,
    normalizedLookupInput,
    status: data.status,
    cursor: data.cursor,
    payload: data.payload,
  };
  const createInputDigest = parentCreateDigest(durableCreateInput);

  // Idempotency by idempotencyKey.
  const existingByIdem = findIdempotencyParentRun(fixmeDir, data.parentSkill, data.idempotencyKey);
  if (existingByIdem) {
    const existing = readJsonFileStrict(parentStatePath(fixmeDir, existingByIdem));
    if (existing.createInputDigest !== createInputDigest) {
      lifecycleError('conflictingDuplicate', `parent create idempotencyKey '${data.idempotencyKey}' already used with different inputs`);
    }
    return existing;
  }

  // Natural-key dedup: return an existing nonterminal run with the same create digest.
  const naturalEntries = readParentIndexEntries(fixmeDir, `nat-${parentNaturalKey}`);
  for (const runId of naturalEntries) {
    const candidate = readJsonFileStrict(parentStatePath(fixmeDir, runId));
    if (PR_TERMINAL_STATUSES.has(candidate.status)) continue;
    if (candidate.createInputDigest === createInputDigest) {
      // Map this idempotency key to the existing run too.
      const idemHash = stableHash({ parentSkill: data.parentSkill, idempotencyKey: data.idempotencyKey });
      appendParentIndexEntry(fixmeDir, `idem-${idemHash}`, candidate.parentRunId);
      return candidate;
    }
    lifecycleError('conflictingDuplicate', `A nonterminal parent run with the same natural key has different create inputs`);
  }

  const parentRunId = generateUsageId('parent');
  const now = new Date().toISOString();
  const lookupKeys = [`nat-${parentNaturalKey}`, `broad-${broadKey}`];
  const state = {
    schemaVersion: 1,
    parentRunId,
    parentSkill: data.parentSkill,
    normalizedLookupInput,
    parentNaturalKey,
    lookupKeys,
    createInputDigest,
    status: data.status,
    cursor: data.cursor,
    revision: 0,
    payload: data.payload,
    ledger: {},
    createdAt: now,
    updatedAt: now,
  };
  assertCamelCaseJsonKeys(state, 'parent state');
  writeJsonAtomic(parentStatePath(fixmeDir, parentRunId), state);
  appendParentIndexEntry(fixmeDir, `nat-${parentNaturalKey}`, parentRunId);
  appendParentIndexEntry(fixmeDir, `broad-${broadKey}`, parentRunId);
  const idemHash = stableHash({ parentSkill: data.parentSkill, idempotencyKey: data.idempotencyKey });
  appendParentIndexEntry(fixmeDir, `idem-${idemHash}`, parentRunId);

  return state;
}

function lifecycleParentCreate(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  return lifecycleOk(parentCreateCore(fixmeDir, data));
}

// Full parent-checkpoint validation and write. Returns the next state object
// (or the current state on an identical idempotent replay) instead of exiting,
// so both the public CLI command and the internal task-event consume path share
// one implementation: the ledger-regression guard, the camelCase assertion, and
// the same-key conflict detection all apply on every path.
function parentCheckpointCore(fixmeDir, parentRunId, data) {
  if (!isNonEmptyString(parentRunId)) {
    lifecycleError('invalidInput', '--parent-run-id is required');
  }
  const statePath = parentStatePath(fixmeDir, parentRunId);
  if (!fs.existsSync(statePath)) {
    lifecycleError('stateNotFound', `Parent run not found: ${parentRunId}`);
  }
  try {
    assertKnownJsonFields(data, 'parent checkpoint', PARENT_CHECKPOINT_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['idempotencyKey', 'status', 'cursor']) {
    if (!isNonEmptyString(data[field])) {
      lifecycleError('missingRequiredField', `${field} is required`);
    }
  }
  if (!Number.isInteger(data.expectedRevision)) {
    lifecycleError('missingRequiredField', 'expectedRevision is required and must be an integer');
  }
  if (!PR_PARENT_STATUSES.has(data.status)) {
    lifecycleError('invalidInput', `Unsupported status: ${data.status}`);
  }
  validatePrCursorPayload(data.cursor, data.payload);
  if (!isPlainObject(data.ledger)) {
    lifecycleError('invalidInput', 'ledger must be a JSON object');
  }
  for (const slot of Object.keys(data.ledger)) {
    if (!PARENT_LEDGER_SLOTS.has(slot)) {
      lifecycleError('invalidInput', `Unsupported ledger slot: ${slot}`);
    }
  }
  if (data.status === 'failed') {
    if (!isPlainObject(data.failure) || !isNonEmptyString(data.failure.message) || !PARENT_FAILURE_REASONS.has(data.failure.reason)) {
      lifecycleError('invalidInput', 'failure with valid reason and non-empty message is required when status is failed');
    }
  } else if (data.failure !== undefined) {
    lifecycleError('invalidInput', 'failure is only allowed when status is failed');
  }

  const current = readJsonFileStrict(statePath);

  // Digest of the durable inputs this checkpoint applies. On a same-key replay
  // we compare against the digest recorded when the key was first applied so an
  // identical replay is a no-op while a same-key call with different durable
  // inputs is rejected as a conflict.
  const appliedDigest = stableHash({
    status: data.status,
    cursor: data.cursor,
    payload: data.payload,
    ledger: data.ledger,
    failure: data.failure === undefined ? null : data.failure,
  });

  // Idempotent replay by idempotencyKey: identical inputs return current state,
  // conflicting inputs under the same key are a conflictingDuplicate.
  if (current.lastCheckpointKey === data.idempotencyKey) {
    if (current.lastCheckpointDigest !== undefined && current.lastCheckpointDigest !== appliedDigest) {
      lifecycleError('conflictingDuplicate', `parent checkpoint idempotencyKey '${data.idempotencyKey}' already applied with different inputs`);
    }
    return current;
  }
  if (data.expectedRevision !== current.revision) {
    lifecycleError('staleState', `expectedRevision ${data.expectedRevision} does not match current revision ${current.revision}`);
  }
  validatePrCursorTransition(current.cursor, data.cursor);

  // Reject clearing a populated ledger slot.
  for (const slot of Object.keys(current.ledger || {})) {
    const wasPopulated = current.ledger[slot] !== null && current.ledger[slot] !== undefined;
    const nowMissing = !Object.prototype.hasOwnProperty.call(data.ledger, slot) ||
      data.ledger[slot] === null || data.ledger[slot] === undefined;
    if (wasPopulated && nowMissing) {
      lifecycleError('invalidInput', `Cannot clear populated ledger slot: ${slot}`);
    }
  }

  const next = {
    schemaVersion: current.schemaVersion,
    parentRunId: current.parentRunId,
    parentSkill: current.parentSkill,
    normalizedLookupInput: current.normalizedLookupInput,
    parentNaturalKey: current.parentNaturalKey,
    lookupKeys: current.lookupKeys,
    createInputDigest: current.createInputDigest,
    status: data.status,
    cursor: data.cursor,
    revision: current.revision + 1,
    payload: data.payload,
    ledger: data.ledger,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    lastCheckpointKey: data.idempotencyKey,
    lastCheckpointDigest: appliedDigest,
  };
  if (data.failure !== undefined) {
    next.failure = data.failure;
  }
  assertCamelCaseJsonKeys(next, 'parent state');
  writeJsonAtomic(statePath, next);
  return next;
}

function lifecycleParentCheckpoint(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  return lifecycleOk(parentCheckpointCore(fixmeDir, flags['parent-run-id'], data));
}

function lifecycleParentResolve(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  if (isNonEmptyString(flags['parent-run-id'])) {
    const statePath = parentStatePath(fixmeDir, flags['parent-run-id']);
    if (!fs.existsSync(statePath)) {
      lifecycleError('stateNotFound', `Parent run not found: ${flags['parent-run-id']}`);
    }
    return lifecycleOk(readJsonFileStrict(statePath));
  }

  const data = resolveLifecycleData(flags);
  if (!isNonEmptyString(data.parentSkill) || !isPlainObject(data.lookupInput)) {
    lifecycleError('invalidInput', 'parentSkill and lookupInput are required to resolve');
  }
  const normalizedLookupInput = normalizeParentLookupInput(data.parentSkill, data.lookupInput);
  const hasFlags = isPlainObject(data.lookupInput.normalizedFlags);
  const lookupKeyHash = hasFlags
    ? `nat-${parentNaturalKeyFor(data.parentSkill, normalizedLookupInput)}`
    : `broad-${parentBroadKeyFor(data.parentSkill, normalizedLookupInput)}`;

  const entries = readParentIndexEntries(fixmeDir, lookupKeyHash);
  const nonterminal = [];
  for (const runId of entries) {
    const statePath = parentStatePath(fixmeDir, runId);
    if (!fs.existsSync(statePath)) continue;
    const candidate = readJsonFileStrict(statePath);
    if (!PR_TERMINAL_STATUSES.has(candidate.status)) {
      nonterminal.push(candidate);
    }
  }
  if (nonterminal.length === 0) {
    lifecycleError('stateNotFound', 'No nonterminal parent run matches the lookup');
  }
  if (nonterminal.length > 1) {
    lifecycleError('conflictingDuplicate', 'Multiple nonterminal parent runs match the lookup', {
      parentRunIds: nonterminal.map(r => r.parentRunId),
    });
  }
  return lifecycleOk(nonterminal[0]);
}

function parentStaleStateError(parentState, details = {}) {
  lifecycleError('staleState', details.message || 'Parent state is stale', {
    parentRunId: parentState.parentRunId,
    cursor: parentState.cursor,
    status: parentState.status,
    recovery: {
      safeAutomaticRecovery: false,
      commands: {
        prepareChild: 'lifecycle parent prepare-child --fixme-dir <fixme-dir> --data-file <prepare-child-payload.json>',
        abandon: 'lifecycle parent abandon --fixme-dir <fixme-dir> --data-file <abandon-payload.json>',
      },
    },
    ...details.extra,
  });
}

function parentAbandonCore(fixmeDir, data) {
  try {
    assertKnownJsonFields(data, 'parent abandon', PARENT_ABANDON_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['parentRunId', 'idempotencyKey', 'reason', 'message']) {
    if (!isNonEmptyString(data[field])) {
      lifecycleError('missingRequiredField', `${field} is required`);
    }
  }
  if (data.preserveLedger === false) {
    lifecycleError('invalidInput', 'preserveLedger cannot be false');
  }
  if (!PARENT_FAILURE_REASONS.has(data.reason)) {
    lifecycleError('invalidInput', `Unsupported parent failure reason: ${data.reason}`);
  }
  const statePath = parentStatePath(fixmeDir, data.parentRunId);
  if (!fs.existsSync(statePath)) {
    lifecycleError('stateNotFound', `Parent run not found: ${data.parentRunId}`);
  }
  const current = readJsonFileStrict(statePath);
  const failure = {
    reason: data.reason,
    message: data.message,
    closedAt: current.failure && current.failure.closedAt ? current.failure.closedAt : new Date().toISOString(),
  };
  const appliedDigest = stableHash({ status: 'failed', cursor: 'summarize', payload: {}, ledger: current.ledger || {}, failure });
  if (current.lastCheckpointKey === data.idempotencyKey) {
    if (current.lastCheckpointDigest !== undefined && current.lastCheckpointDigest !== appliedDigest) {
      lifecycleError('conflictingDuplicate', `parent abandon idempotencyKey '${data.idempotencyKey}' already applied with different inputs`);
    }
    return current;
  }
  if (PR_TERMINAL_STATUSES.has(current.status)) {
    lifecycleError('staleState', `Parent run is already terminal: ${data.parentRunId}`);
  }
  const next = {
    ...current,
    status: 'failed',
    cursor: 'summarize',
    revision: current.revision + 1,
    payload: {},
    ledger: current.ledger || {},
    updatedAt: new Date().toISOString(),
    failure,
    lastCheckpointKey: data.idempotencyKey,
    lastCheckpointDigest: appliedDigest,
  };
  assertCamelCaseJsonKeys(next, 'parent state');
  writeJsonAtomic(statePath, next);
  return next;
}

function lifecycleParentAbandon(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  return lifecycleOk(parentAbandonCore(fixmeDir, data));
}

function parentIsMissingActiveChild(state) {
  return state.status === 'waitingForChild' &&
    state.cursor === 'awaitFixmeTask' &&
    !isPlainObject(state.payload && state.payload.activeChild);
}

function findNonterminalParentsForLookup(fixmeDir, parentSkill, lookupInput) {
  const normalizedLookupInput = normalizeParentLookupInput(parentSkill, lookupInput);
  const naturalKey = parentNaturalKeyFor(parentSkill, normalizedLookupInput);
  const entries = readParentIndexEntries(fixmeDir, `nat-${naturalKey}`);
  const states = [];
  for (const runId of entries) {
    const statePath = parentStatePath(fixmeDir, runId);
    if (!fs.existsSync(statePath)) continue;
    const candidate = readJsonFileStrict(statePath);
    if (!PR_TERMINAL_STATUSES.has(candidate.status)) {
      states.push(candidate);
    }
  }
  return states;
}

function recoverStaleParentBeforeCreate(fixmeDir, data) {
  const nonterminal = findNonterminalParentsForLookup(fixmeDir, data.parent.parentSkill, data.parent.lookupInput);
  for (const candidate of nonterminal) {
    if (!parentIsMissingActiveChild(candidate)) continue;
    if (data.recoverStaleParent !== true) {
      parentStaleStateError(candidate, { message: 'Parent is waiting for child without activeChild' });
    }
    parentAbandonCore(fixmeDir, {
      parentRunId: candidate.parentRunId,
      idempotencyKey: `${data.parent.idempotencyKey}:recover-stale:${candidate.parentRunId}`,
      reason: 'staleParentMissingActiveChild',
      message: 'Recovered stale parent missing activeChild during prepare-child',
    });
  }
}

function prepareChildLedger(parentState, data) {
  const defaults = {};
  if (data.parent.parentSkill === 'fixme-session') {
    if (isPlainObject(data.parent.lookupInput) && isPlainObject(data.parent.lookupInput.sessionTaskRef)) {
      defaults.sessionTaskRef = data.parent.lookupInput.sessionTaskRef;
    }
    defaults.fixBatches = data.await.fixBatches;
  }
  return {
    ...defaults,
    ...(parentState.ledger || {}),
    ...(data.await.ledger || {}),
  };
}

const PREPARE_CHILD_LIGHTWEIGHT_PROMPT_INPUT_FIELDS = new Set([
  'summary',
  'title',
  'source',
  'route',
  'batchId',
  'activeBatchIndex',
  'routedFixGroupsCount',
  'mustResolveThreadCount',
  'allowedUnresolvedThreadCount',
  'currentPrFixCount',
  'followupCount',
  'infoCount',
  'noActionCount',
  'mustResolveThreadIds',
  'allowedUnresolvedThreadIds',
]);

function isLightweightPromptValue(value) {
  if (value === null) return true;
  if (['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) {
    return value.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item));
  }
  return false;
}

function sanitizePrepareChildPromptInputs(promptInputs) {
  const sanitized = {};
  for (const [key, value] of Object.entries(promptInputs || {})) {
    if (!PREPARE_CHILD_LIGHTWEIGHT_PROMPT_INPUT_FIELDS.has(key)) continue;
    if (!isLightweightPromptValue(value)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function validatePrepareChildData(data) {
  try {
    assertKnownJsonFields(data, 'parent prepare-child', LIFECYCLE_PARENT_PREPARE_CHILD_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  if (!isPlainObject(data.parent)) lifecycleError('missingRequiredField', 'parent is required');
  if (!isPlainObject(data.child)) lifecycleError('missingRequiredField', 'child is required');
  if (!isPlainObject(data.await)) lifecycleError('missingRequiredField', 'await is required');
  try {
    assertKnownJsonFields(data.parent, 'prepare-child parent', PREPARE_CHILD_PARENT_FIELDS);
    assertKnownJsonFields(data.child, 'prepare-child child', PREPARE_CHILD_CHILD_FIELDS);
    assertKnownJsonFields(data.child.handoff || {}, 'prepare-child handoff', PREPARE_CHILD_HANDOFF_FIELDS);
    assertKnownJsonFields(data.await, 'prepare-child await', PREPARE_CHILD_AWAIT_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['parentSkill', 'idempotencyKey']) {
    if (!isNonEmptyString(data.parent[field])) lifecycleError('missingRequiredField', `parent.${field} is required`);
  }
  for (const field of ['idempotencyKey', 'agentName', 'runtime', 'transport']) {
    if (!isNonEmptyString(data.child[field])) lifecycleError('missingRequiredField', `child.${field} is required`);
  }
  if (data.child.agentName !== 'fixme-task') {
    lifecycleError('invalidInput', 'child.agentName must be fixme-task');
  }
  if (!VALID_RUNTIME_VALUES.has(data.child.runtime)) {
    lifecycleError('invalidInput', `Unsupported child.runtime: ${data.child.runtime}`);
  }
  if (!DISPATCH_TRANSPORTS.has(data.child.transport)) {
    lifecycleError('invalidInput', `child.transport must be one of: ${[...DISPATCH_TRANSPORTS].join(', ')}`);
  }
  if (data.parent.parentSkill === 'fixme-pr-comments' && data.child.runtime === 'codex' && data.child.transport !== 'agent') {
    lifecycleError('invalidInput', 'Codex fixme-pr-comments prepare-child must use child.transport agent');
  }
  if (!isPlainObject(data.child.handoff) || !isPlainObject(data.child.handoff.taskSaveData) || !isPlainObject(data.child.handoff.payload)) {
    lifecycleError('missingRequiredField', 'child.handoff.taskSaveData and child.handoff.payload are required');
  }
  if (!isPlainObject(data.child.promptInputs)) {
    lifecycleError('missingRequiredField', 'child.promptInputs is required');
  }
}

function validatePrepareChildGroupedPayload(parent) {
  if (parent.parentSkill !== 'fixme-pr-comments') return;
  const payload = parent.payload || {};
  if (payload.routedGroups !== undefined && !Array.isArray(payload.routedGroups)) {
    lifecycleError('invalidInput', 'parent.payload.routedGroups must be an array of objects with groupId values');
  }
  for (const [index, group] of (payload.routedGroups || []).entries()) {
    if (!isPlainObject(group)) lifecycleError('invalidInput', `parent.payload.routedGroups[${index}] must be an object`);
    if (!isNonEmptyString(group.groupId)) lifecycleError('missingRequiredField', `parent.payload.routedGroups[${index}].groupId is required`);
    if (!isNonEmptyString(group.route)) lifecycleError('missingRequiredField', `parent.payload.routedGroups[${index}].route is required`);
    if (!Array.isArray(group.sourceIds)) lifecycleError('missingRequiredField', `parent.payload.routedGroups[${index}].sourceIds is required`);
  }
}

function lifecycleParentPrepareChild(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  validatePrepareChildData(data);
  validatePrepareChildGroupedPayload(data.parent);

  const childPreflight = preflightChildHandoffIndex(fixmeDir, data.child);
  recoverStaleParentBeforeCreate(fixmeDir, data);

  const parentCreateData = data.parent.parentSkill === 'fixme-session'
    ? {
      parentSkill: data.parent.parentSkill,
      idempotencyKey: data.parent.idempotencyKey,
      lookupInput: data.parent.lookupInput,
      status: 'running',
      cursor: 'dispatchFixmeTask',
      payload: {
        fixBatches: data.await.fixBatches,
        activeBatchIndex: data.await.activeBatchIndex,
        parentContinuation: { parentSkill: data.parent.parentSkill, parentRunId: 'parent_pending', transport: data.child.transport, ...(data.parentContinuation || {}) },
      },
    }
    : {
      parentSkill: data.parent.parentSkill,
      idempotencyKey: data.parent.idempotencyKey,
      lookupInput: data.parent.lookupInput,
      status: 'running',
      cursor: 'presentAnalysis',
      payload: data.parent.payload,
    };

  let parentState = parentCreateCore(fixmeDir, parentCreateData);
  if (parentIsMissingActiveChild(parentState)) {
    if (data.recoverStaleParent !== true) {
      parentStaleStateError(parentState, { message: 'Parent is waiting for child without activeChild' });
    }
    parentAbandonCore(fixmeDir, {
      parentRunId: parentState.parentRunId,
      idempotencyKey: `${data.parent.idempotencyKey}:recover-stale:${parentState.parentRunId}`,
      reason: 'staleParentMissingActiveChild',
      message: 'Recovered stale parent missing activeChild during prepare-child',
    });
    parentState = parentCreateCore(fixmeDir, parentCreateData);
  }

  const childTask = saveOrReuseChildHandoff(fixmeDir, data.child, childPreflight);
  const parentContinuation = {
    parentSkill: data.parent.parentSkill,
    parentRunId: parentState.parentRunId,
    transport: data.child.transport,
    resumeStep: (data.parentContinuation && data.parentContinuation.resumeStep) || 'awaitFixmeTaskResult',
    parentStatusId: data.child.parentStatusId || null,
  };
  const lightweightPromptInputs = {
    ...sanitizePrepareChildPromptInputs(data.child.promptInputs),
    resumeRef: childTask.resumeRef,
    taskPath: childTask.taskPath,
    statePath: childTask.statePath,
    handoffPayloadPath: childTask.handoffPayloadPath,
  };
  const dispatchData = {
    idempotencyKey: `${data.child.idempotencyKey}:dispatch`,
    agentName: 'fixme-task',
    runtime: data.child.runtime,
    transport: data.child.transport,
    parentInvocationId: data.child.parentInvocationId,
    pipelineRunId: data.child.pipelineRunId,
    parentStatusId: data.child.parentStatusId,
    taskStatePath: childTask.statePath,
    parentContinuation,
    promptInputs: lightweightPromptInputs,
  };

  let launch = dispatchPrepareCore(fixmeDir, dispatchData, flags);
  launch = {
    ...launch,
    runtime: data.child.runtime,
    promptBlocks: {
      ...launch.promptBlocks,
      parentContinuation,
      promptInputs: lightweightPromptInputs,
      taskInput: {
        resumeRef: childTask.resumeRef,
        taskPath: childTask.taskPath,
        statePath: childTask.statePath,
        handoffPayloadPath: childTask.handoffPayloadPath,
        source: 'savedTaskWithHandoffPayload',
      },
    },
  };
  const activeChild = {
    ...launch.activeChild,
    taskStatePath: childTask.statePath,
    resumeRef: childTask.resumeRef,
  };
  launch.activeChild = activeChild;
  launch.promptBlocks.activeChild = activeChild;
  launch.promptBlocks.taskStateOwner = { ownerSkill: 'fixme-task', taskStatePath: childTask.statePath };

  if (!(parentState.status === 'waitingForChild' && parentState.cursor === 'awaitFixmeTask')) {
    if (parentState.cursor !== 'dispatchFixmeTask') {
      parentState = parentCheckpointCore(fixmeDir, parentState.parentRunId, {
        idempotencyKey: `${data.parent.idempotencyKey}:dispatch`,
        expectedRevision: parentState.revision,
        status: 'running',
        cursor: 'dispatchFixmeTask',
        payload: {
          fixBatches: data.await.fixBatches,
          activeBatchIndex: data.await.activeBatchIndex,
          parentContinuation,
        },
        ledger: prepareChildLedger(parentState, data),
      });
    }
    parentState = parentCheckpointCore(fixmeDir, parentState.parentRunId, {
      idempotencyKey: `${data.parent.idempotencyKey}:await`,
      expectedRevision: parentState.revision,
      status: 'waitingForChild',
      cursor: 'awaitFixmeTask',
      payload: {
        fixBatches: data.await.fixBatches,
        activeBatchIndex: data.await.activeBatchIndex,
        activeChild,
      },
      ledger: prepareChildLedger(parentState, data),
    });
  }

  return lifecycleOk({
    parentRunId: parentState.parentRunId,
    parentStatePath: parentStatePath(fixmeDir, parentState.parentRunId),
    dispatchId: launch.dispatchId,
    statusId: launch.statusId,
    statusPath: launch.statusPath,
    activeChild,
    childTask,
    launch,
  });
}

// ============================================================================
// Subcommands: lifecycle task-event
// ============================================================================

const TASK_EVENT_RECORD_FIELDS = new Set(['parentRunId', 'taskRunId', 'taskStatePath', 'resultSummaryPath', 'terminalResultId', 'status']);

function taskEventDirectory(fixmeDir, parentRunId) {
  return path.join(fixmeDir, 'task-events', parentRunId);
}

function taskEventPath(fixmeDir, parentRunId, eventId) {
  return path.join(taskEventDirectory(fixmeDir, parentRunId), `${eventId}.json`);
}

function listTaskEvents(fixmeDir, parentRunId) {
  const dir = taskEventDirectory(fixmeDir, parentRunId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => readJsonFileStrict(path.join(dir, name)));
}

function lifecycleTaskEventRecord(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const data = resolveLifecycleData(flags);
  try {
    assertKnownJsonFields(data, 'task-event record', TASK_EVENT_RECORD_FIELDS);
  } catch (e) {
    lifecycleError('unknownField', e.message);
  }
  for (const field of ['parentRunId', 'taskRunId', 'taskStatePath', 'resultSummaryPath', 'terminalResultId', 'status']) {
    if (!isNonEmptyString(data[field])) {
      lifecycleError('missingRequiredField', `${field} is required`);
    }
  }
  if (data.status !== 'completed' && data.status !== 'failed') {
    lifecycleError('invalidInput', 'status must be one of: completed, failed');
  }

  // The result summary must exist and match the terminalResultId.
  if (!fs.existsSync(data.resultSummaryPath)) {
    lifecycleError('stateNotFound', `Result summary not found: ${data.resultSummaryPath}`);
  }
  const summary = readJsonFileStrict(data.resultSummaryPath);
  if (summary.terminalResultId !== data.terminalResultId) {
    lifecycleError('conflictingDuplicate', 'Result summary terminalResultId does not match');
  }
  if (summary.status !== data.status) {
    lifecycleError('conflictingDuplicate', 'Result summary status does not match task event status');
  }
  // Terminal task state must also match.
  if (!fs.existsSync(data.taskStatePath)) {
    lifecycleError('stateNotFound', `Task state not found: ${data.taskStatePath}`);
  }
  const taskState = readJsonFileStrict(data.taskStatePath);
  if (!taskState.terminalResult || taskState.terminalResult.terminalResultId !== data.terminalResultId) {
    lifecycleError('conflictingDuplicate', 'Task state terminalResultId does not match');
  }
  if (taskState.terminalResult.status !== data.status) {
    lifecycleError('conflictingDuplicate', 'Task state terminal result status does not match task event status');
  }

  // Idempotency by parentRunId + terminalResultId.
  const existing = listTaskEvents(fixmeDir, data.parentRunId)
    .find(e => e.terminalResultId === data.terminalResultId);
  if (existing) {
    const durableMatch = existing.status === data.status &&
      existing.resultSummaryPath === data.resultSummaryPath &&
      existing.taskStatePath === data.taskStatePath &&
      existing.taskRunId === data.taskRunId;
    if (durableMatch) {
      return lifecycleOk({ event: existing });
    }
    lifecycleError('conflictingDuplicate', 'A task event for this terminalResultId already exists with different data');
  }

  const eventId = generateUsageId('taskEvent');
  const event = {
    schemaVersion: 1,
    eventId,
    parentRunId: data.parentRunId,
    taskRunId: data.taskRunId,
    taskStatePath: data.taskStatePath,
    resultSummaryPath: data.resultSummaryPath,
    status: data.status,
    terminalResultId: data.terminalResultId,
    createdAt: new Date().toISOString(),
    consumedAt: null,
    consumedBy: null,
  };
  writeJsonAtomic(taskEventPath(fixmeDir, data.parentRunId, eventId), event);
  return lifecycleOk({ event });
}

function lifecycleTaskEventConsume(flags) {
  const fixmeDir = resolveLifecycleFixmeDir(flags);
  const parentRunId = flags['parent-run-id'];
  if (!isNonEmptyString(parentRunId)) {
    lifecycleError('invalidInput', '--parent-run-id is required');
  }
  const statePath = parentStatePath(fixmeDir, parentRunId);
  if (!fs.existsSync(statePath)) {
    lifecycleError('stateNotFound', `Parent run not found: ${parentRunId}`);
  }
  const parent = readJsonFileStrict(statePath);
  const activeChild = parent.payload && parent.payload.activeChild;
  if (!isPlainObject(activeChild) || !isNonEmptyString(activeChild.taskRunId)) {
    parentStaleStateError(parent, { message: 'Parent run is waiting for a child but has no activeChild handle' });
  }

  const events = listTaskEvents(fixmeDir, parentRunId);

  // If parent already recorded a consumed event for THIS active child, return it
  // idempotently and ensure the consumed marker on the event file is set. The
  // recorded event must belong to the current active child: across multi-batch
  // runs the activeChild advances, so a recorded event from a prior batch must
  // not be returned for a later batch. When it does not match, fall through to
  // fresh selection scoped to the active child.
  const recorded = parent.payload.consumedTaskEvent;
  if (isPlainObject(recorded) && isNonEmptyString(recorded.eventId)) {
    const eventPath = taskEventPath(fixmeDir, parentRunId, recorded.eventId);
    if (fs.existsSync(eventPath)) {
      const eventRecord = readJsonFileStrict(eventPath);
      const belongsToActiveChild =
        eventRecord.taskRunId === activeChild.taskRunId &&
        eventRecord.taskStatePath === activeChild.taskStatePath &&
        (!isNonEmptyString(activeChild.terminalResultId) || eventRecord.terminalResultId === activeChild.terminalResultId);
      if (belongsToActiveChild) {
        if (!eventRecord.consumedAt) {
          eventRecord.consumedAt = new Date().toISOString();
          eventRecord.consumedBy = parentRunId;
          writeJsonAtomic(eventPath, eventRecord);
        }
        return lifecycleOk({ event: eventRecord });
      }
    }
  }

  // Select the matching unacknowledged event.
  const matches = events.filter(e =>
    !e.consumedAt &&
    e.taskRunId === activeChild.taskRunId &&
    e.taskStatePath === activeChild.taskStatePath &&
    (!isNonEmptyString(activeChild.terminalResultId) || e.terminalResultId === activeChild.terminalResultId));

  let selected = null;
  if (Object.prototype.hasOwnProperty.call(flags, 'event-id') && flags['event-id'] !== true) {
    const requested = events.find(e => e.eventId === flags['event-id']);
    if (!requested) {
      lifecycleError('stateNotFound', `Task event not found: ${flags['event-id']}`);
    }
    if (requested.taskRunId !== activeChild.taskRunId ||
        requested.taskStatePath !== activeChild.taskStatePath ||
        (isNonEmptyString(activeChild.terminalResultId) && requested.terminalResultId !== activeChild.terminalResultId)) {
      lifecycleError('staleState', 'Requested event does not belong to the active child');
    }
    selected = requested;
  } else {
    if (matches.length === 0) {
      lifecycleError('noPendingEvent', 'No unacknowledged task event for the active child');
    }
    if (matches.length > 1) {
      lifecycleError('conflictingDuplicate', 'Multiple unacknowledged task events match the active child');
    }
    selected = matches[0];
  }

  // Record the event into parent state FIRST (crash-safe), then mark consumed.
  // Use the shared checkpoint core so the ledger-regression guard and camelCase
  // assertion run on the consume path too.
  const nextPayload = { ...parent.payload, consumedTaskEvent: { eventId: selected.eventId, terminalResultId: selected.terminalResultId, resultSummaryPath: selected.resultSummaryPath, status: selected.status } };
  parentCheckpointCore(fixmeDir, parentRunId, {
    idempotencyKey: `consume-${selected.eventId}`,
    expectedRevision: parent.revision,
    status: parent.status,
    cursor: parent.cursor,
    payload: nextPayload,
    ledger: parent.ledger || {},
  });

  const eventPath = taskEventPath(fixmeDir, parentRunId, selected.eventId);
  const eventRecord = readJsonFileStrict(eventPath);
  eventRecord.consumedAt = new Date().toISOString();
  eventRecord.consumedBy = parentRunId;
  writeJsonAtomic(eventPath, eventRecord);

  return lifecycleOk({ event: eventRecord });
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

function nonCachedTokenCount(tokens) {
  if (!tokens) return 0;
  const totalTokens = typeof tokens.totalTokens === 'number' && Number.isFinite(tokens.totalTokens)
    ? tokens.totalTokens
    : null;
  if (totalTokens !== null) return Math.max(0, totalTokens - cachedTokenCount(tokens));
  return (tokens.inputTokens || 0)
    + (tokens.outputTokens || 0)
    + (tokens.reasoningOutputTokens || 0);
}

function cachedTokenCount(tokens) {
  if (!tokens) return 0;
  if (typeof tokens.cachedInputTokens === 'number' && Number.isFinite(tokens.cachedInputTokens)) {
    return tokens.cachedInputTokens;
  }
  return (tokens.cacheCreationInputTokens || 0) + (tokens.cacheReadInputTokens || 0);
}

function usageWithDerivedTokenBuckets(tokens) {
  if (!tokens) return tokens;
  return {
    ...tokens,
    nonCachedTokens: nonCachedTokenCount(tokens),
    cachedTokens: cachedTokenCount(tokens),
  };
}

function formatTokenCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatUsageBucketSummary(label, tokens) {
  const usage = usageWithDerivedTokenBuckets(tokens || emptyTokenUsage());
  return `${label} non-cached ${formatTokenCount(usage.nonCachedTokens)} tokens, cached input ${formatTokenCount(usage.cachedTokens)} tokens, total ${formatTokenCount(usage.totalTokens)} tokens`;
}

function isMeasuredUsageRow(row) {
  return row.status === USAGE_STATUS.MEASURED && !!row.tokens;
}

function isSupportedUsageStatus(row) {
  return row && (row.status === USAGE_STATUS.MEASURED || row.status === USAGE_STATUS.UNMEASURED);
}

function usageSummaryRow(event) {
  const tokens = usageWithDerivedTokenBuckets(event.tokens);
  return {
    eventId: event.eventId,
    invocationId: event.invocationId,
    skill: event.skill,
    role: event.role,
    runtime: event.runtime,
    status: event.status,
    outcome: event.outcome,
    outcomeReason: event.outcomeReason,
    startedAt: event.startedAt,
    finishedAt: event.finishedAt,
    durationMs: event.durationMs,
    pipelineRunId: event.pipelineRunId,
    parentInvocationId: event.parentInvocationId,
    nonCachedTokens: tokens && typeof tokens.nonCachedTokens === 'number' ? tokens.nonCachedTokens : null,
    cachedTokens: tokens && typeof tokens.cachedTokens === 'number' ? tokens.cachedTokens : null,
    totalTokens: tokens && typeof tokens.totalTokens === 'number' ? tokens.totalTokens : null,
    warningCodes: (event.warnings || []).map(warning => warning.code).filter(Boolean),
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
  const totalUsage = emptyTokenUsage();
  const notIncludedEventIds = [];
  const warningEvents = [...fileWarnings];
  const completeRows = [];
  const reportRows = [];

  for (const row of normalized.rows) {
    if (!isSupportedUsageStatus(row)) {
      if (row.eventId) notIncludedEventIds.push(row.eventId);
      warningEvents.push({
        code: USAGE_WARNING_CODES.UNSUPPORTED_USAGE_STATUS,
        eventId: row.eventId,
        message: `Unsupported usage status for ${row.invocationId || row.eventId || 'unknown invocation'}: ${row.status}`,
      });
      continue;
    }
    reportRows.push(row);
  }

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

  function finalizeGroupUsage(group) {
    const finalized = {
      ...group,
      totalUsage: usageWithDerivedTokenBuckets(group.totalUsage),
    };
    if (Object.prototype.hasOwnProperty.call(group, 'orchestratorUsage')) {
      finalized.orchestratorUsage = usageWithDerivedTokenBuckets(group.orchestratorUsage);
      finalized.childUsage = usageWithDerivedTokenBuckets(group.childUsage);
    }
    return finalized;
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

  const byProjectMap = new Map();
  function groupForProject(projectRoot) {
    if (!projectRoot) return null;
    if (!byProjectMap.has(projectRoot)) {
      byProjectMap.set(projectRoot, newGroup('projectRoot', projectRoot));
    }
    return byProjectMap.get(projectRoot);
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
    addRowToGroup(groupForProject(row.projectRoot), row);
    addRowToGroup(groupForPipeline(row.pipelineRunId), row);
  }

  for (const conflict of normalized.conflicts) {
    const first = conflict.rows[0] || {};
    const groups = [groupForSkill(first.skill), groupForProject(first.projectRoot), groupForPipeline(first.pipelineRunId)].filter(Boolean);
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
    totalUsage: usageWithDerivedTokenBuckets(totalUsage),
    notIncludedInTotal: {
      invocationCount: new Set(notIncludedEventIds.filter(Boolean).map(eventId => {
        const row = [...reportRows, ...filtered].find(item => item.eventId === eventId);
        return row ? row.invocationId : eventId;
      })).size,
      eventIds: [...new Set(notIncludedEventIds.filter(Boolean))],
    },
    bySkill: [...bySkillMap.values()].map(finalizeGroupUsage).sort((a, b) => a.skill.localeCompare(b.skill)),
    byProject: [...byProjectMap.values()].map(finalizeGroupUsage).sort((a, b) => a.projectRoot.localeCompare(b.projectRoot)),
    byPipeline: [...byPipelineMap.values()].map(finalizeGroupUsage).sort((a, b) => a.pipelineRunId.localeCompare(b.pipelineRunId)),
    recent,
    warnings: warningEvents,
    warningSummary: warningSummaryFromWarnings(warningEvents),
  };
}

function formatUsageReportText(report) {
  const lines = [
    `Non-cached usage: ${formatTokenCount(report.totalUsage.nonCachedTokens)} tokens`,
    `Cached input: ${formatTokenCount(report.totalUsage.cachedTokens)} tokens`,
    `Total usage: ${formatTokenCount(report.totalUsage.totalTokens)} tokens`,
  ];
  if (report.notIncludedInTotal.invocationCount > 0) {
    const plural = report.notIncludedInTotal.invocationCount === 1 ? 'invocation' : 'invocations';
    const warningCodes = report.warningSummary.map(warning => warning.code);
    if (
      warningCodes.includes(USAGE_WARNING_CODES.DUPLICATE_INVOCATION_CONFLICT) ||
      warningCodes.includes(USAGE_WARNING_CODES.UNSUPPORTED_USAGE_STATUS)
    ) {
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

  let eventPath;
  try {
    eventPath = scope === 'project'
      ? usageProjectEventPath(resolveUsageFixmeDir(flags, fixmeRoot))
      : usageGlobalEventPath();
  } catch (e) {
    return usageCliError(e.code || 'INVALID_USAGE_REQUEST', e.message);
  }
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
    const base = formatUsageBucketSummary(`Usage: ${event.skill}`, event.tokens);
    if (pipelineReport) {
      return `${base} | ${formatUsageBucketSummary('pipeline', pipelineReport.totalUsage)} | ${formatUsageBucketSummary('project', projectReport.totalUsage)}`;
    }
    return `${base} | ${formatUsageBucketSummary('project', projectReport.totalUsage)}`;
  }
  const notIncluded = pipelineReport
    ? pipelineReport.notIncludedInTotal.invocationCount
    : projectReport.notIncludedInTotal.invocationCount;
  if (pipelineReport) {
    return `Usage: ${event.skill} unavailable | ${formatUsageBucketSummary('pipeline', pipelineReport.totalUsage)} | ${formatUsageBucketSummary('project', projectReport.totalUsage)} | not included: ${notIncluded} invocation(s)`;
  }
  return `Usage: ${event.skill} unavailable | ${formatUsageBucketSummary('project', projectReport.totalUsage)} | not included: ${notIncluded} invocation(s)`;
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

const LIFECYCLE_ERROR_CODES = Object.freeze(new Set([
  'invalidInput', 'unknownField', 'missingRequiredField', 'stateNotFound',
  'staleState', 'conflictingDuplicate', 'activeAttention', 'attentionBlocked',
  'unsupportedCommand', 'ioFailure', 'noPendingEvent',
]));

function lifecycleOk(data) {
  return output({ ok: true, ...data });
}

function lifecycleError(code, message, extra = {}) {
  if (!LIFECYCLE_ERROR_CODES.has(code)) {
    throw new Error(`Internal: unknown lifecycle error code ${code}`);
  }
  throw new CliJsonError({ ok: false, error: { code, message }, ...extra });
}

function errorPayload(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(1);
}

// ============================================================================
// Main Router
// ============================================================================

function setValues(setOrArray) {
  return Array.from(setOrArray);
}

function commandHelpPayload({
  command,
  requiredFlags = [],
  requiredDataFields = [],
  optionalDataFields = [],
  enumValues = {},
  example = {},
  audience = null,
  guidance = null,
}) {
  const payload = {
    ok: true,
    command,
    requiredFlags,
    requiredDataFields,
    optionalDataFields,
    enumValues,
    example,
  };
  if (audience) payload.audience = audience;
  if (guidance) payload.guidance = guidance;
  return payload;
}

function commandHelpSchema(command, subcommand, args) {
  if (command === 'task' && subcommand === 'decision' && args[0] === 'append') {
    return commandHelpPayload({
      command: 'task decision append',
      requiredFlags: ['state'],
      requiredDataFields: [
        ...DECISION_REQUIRED_STRING_FIELDS,
        'status',
        'supersedesDecisionIds',
        'supersededByDecisionId',
      ],
      optionalDataFields: ['supersedesProjectDecisionRefs'],
      enumValues: { status: ['active'] },
      example: {
        flags: { state: '/absolute/task.state.json', compact: true },
        data: {
          id: 'decision_...',
          attentionId: 'attn_...',
          sourceSkill: 'fixme-handle-code-review',
          prompt: 'Decision prompt',
          answer: 'User answer',
          interpretation: 'How fixme-task will proceed',
          status: 'active',
          supersedesDecisionIds: [],
          supersedesProjectDecisionRefs: [],
          supersededByDecisionId: null,
          createdAt: '2026-06-08T00:00:00.000Z',
        },
      },
    });
  }
  if (command === 'run' && subcommand === 'attention' && args[0] === 'answer') {
    return commandHelpPayload({
      command: 'run attention answer',
      requiredFlags: ['fixme-dir', 'status-id', 'attention-id'],
      requiredDataFields: setValues(RUN_ATTENTION_ANSWER_FIELDS),
      optionalDataFields: [],
      enumValues: {
        answerKind: setValues(RUN_ATTENTION_ANSWER_KINDS),
        answeredBy: ['user'],
      },
      example: {
        flags: { fixmeDir: '/absolute/.fixme', statusId: 'run_...', attentionId: 'attn_...' },
        data: { answer: 'Raw user answer', answeredBy: 'user', answerKind: 'decision' },
      },
      audience: 'owner/internal',
      guidance: 'Owner/internal API. Parent brokers should record raw user answers with lifecycle attention broker answer instead.',
    });
  }
  if (command === 'lifecycle' && subcommand === 'attention' && args[0] === 'broker' && args[1] === 'answer') {
    return commandHelpPayload({
      command: 'lifecycle attention broker answer',
      requiredFlags: ['fixme-dir', 'status-id', 'attention-id'],
      requiredDataFields: setValues(LIFECYCLE_BROKER_ANSWER_FIELDS),
      optionalDataFields: [],
      enumValues: {
        answerKind: setValues(RUN_ATTENTION_ANSWER_KINDS),
        answeredBy: ['user'],
      },
      example: {
        flags: { fixmeDir: '/absolute/.fixme', statusId: 'run_...', attentionId: 'attn_...' },
        data: { answer: 'Raw user answer', answeredBy: 'user', answerKind: 'decision' },
      },
      audience: 'parent-facing',
      guidance: 'Parent-facing brokers record raw user answers only; fixme-task interprets and consumes them.',
    });
  }
  if (command === 'lifecycle' && subcommand === 'attention' && args[0] === 'open') {
    return commandHelpPayload({
      command: 'lifecycle attention open',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: setValues(LIFECYCLE_ATTENTION_OPEN_FIELDS),
      optionalDataFields: [],
      enumValues: {
        'attention.answerMode': setValues(RUN_ATTENTION_ANSWER_MODES),
      },
      example: {
        flags: { fixmeDir: '/absolute/.fixme' },
        data: {
          statusId: 'run_...',
          taskStatePath: '/absolute/task.state.json',
          checkpointData: { status: 'waitingForUser', pendingDecision: { attentionId: 'attn_...' } },
          attention: {
            ownerSkill: 'fixme-task',
            sourceSkill: 'fixme-handle-code-review',
            kind: 'reviewDecision',
            resumeRef: 'FIXME-1',
            taskStatePath: '/absolute/task.state.json',
            answerMode: 'decision-card',
            promptMarkdown: '## Decision',
          },
        },
      },
    });
  }
  if (command === 'lifecycle' && subcommand === 'attention' && args[0] === 'consume') {
    return commandHelpPayload({
      command: 'lifecycle attention consume',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['statusId', 'taskStatePath', 'attentionId', 'checkpointData'],
      optionalDataFields: ['decisionRecords', 'mode'],
      enumValues: {
        mode: setValues(LIFECYCLE_ATTENTION_CONSUME_MODES),
      },
      example: {
        flags: { fixmeDir: '/absolute/.fixme' },
        data: {
          statusId: 'run_...',
          taskStatePath: '/absolute/task.state.json',
          attentionId: 'attn_...',
          mode: 'resolvedDecision',
          decisionRecords: [],
          checkpointData: { status: 'running', pendingDecision: null },
        },
      },
      audience: 'owner/internal',
      guidance: 'Owner-only helper for fixme-task. It consumes answered attention before liveness pings, status resets, or child dispatch.',
    });
  }
  if (command === 'lifecycle' && subcommand === 'dispatch' && args[0] === 'prepare') {
    return commandHelpPayload({
      command: 'lifecycle dispatch prepare',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['idempotencyKey', 'agentName', 'transport', 'promptInputs'],
      optionalDataFields: setValues(LIFECYCLE_DISPATCH_PREPARE_FIELDS)
        .filter(field => !['idempotencyKey', 'agentName', 'transport', 'promptInputs'].includes(field)),
      enumValues: {
        transport: setValues(DISPATCH_TRANSPORTS),
      },
      example: {
        flags: { fixmeDir: '/absolute/.fixme' },
        data: {
          idempotencyKey: 'dispatch-key',
          agentName: 'fixme-task',
          transport: 'inline-skill',
          promptInputs: {},
        },
      },
    });
  }
  if (command === 'lifecycle' && subcommand === 'dispatch' && args[0] === 'complete') {
    return commandHelpPayload({
      command: 'lifecycle dispatch complete',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['dispatchId', 'statusId', 'status'],
      optionalDataFields: ['parentStatusId', 'currentCommand', 'failure', 'runtimeHandle'],
      enumValues: { status: ['completed', 'failed'] },
      example: { flags: { fixmeDir: '/absolute/.fixme' }, data: { dispatchId: 'dispatch_...', statusId: 'run_...', status: 'completed' } },
    });
  }
  if (command === 'lifecycle' && subcommand === 'parent' && args[0] === 'create') {
    return commandHelpPayload({
      command: 'lifecycle parent create',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: setValues(PARENT_CREATE_FIELDS),
      optionalDataFields: [],
      enumValues: { status: setValues(PR_PARENT_STATUSES), cursor: setValues(PR_PARENT_CURSORS) },
      example: { flags: { fixmeDir: '/absolute/.fixme' }, data: { parentSkill: 'fixme-pr-comments', idempotencyKey: 'parent-key', lookupInput: {}, status: 'running', cursor: 'fetchReviewItems', payload: {} } },
    });
  }
  if (command === 'lifecycle' && subcommand === 'parent' && args[0] === 'checkpoint') {
    return commandHelpPayload({
      command: 'lifecycle parent checkpoint',
      requiredFlags: ['fixme-dir', 'parent-run-id'],
      requiredDataFields: ['idempotencyKey', 'expectedRevision', 'status', 'cursor', 'payload', 'ledger'],
      optionalDataFields: ['failure'],
      enumValues: { status: setValues(PR_PARENT_STATUSES), cursor: setValues(PR_PARENT_CURSORS) },
      example: { flags: { fixmeDir: '/absolute/.fixme', parentRunId: 'parent_...' }, data: { idempotencyKey: 'checkpoint-key', expectedRevision: 0, status: 'running', cursor: 'analyzeReviewItems', payload: {}, ledger: {} } },
    });
  }
  if (command === 'lifecycle' && subcommand === 'parent' && args[0] === 'resolve') {
    return commandHelpPayload({
      command: 'lifecycle parent resolve',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: [],
      optionalDataFields: ['parentSkill', 'lookupInput'],
      enumValues: {},
      example: { flags: { fixmeDir: '/absolute/.fixme', parentRunId: 'parent_...' }, data: { parentSkill: 'fixme-pr-comments', lookupInput: {} } },
    });
  }
  if (command === 'lifecycle' && subcommand === 'parent' && args[0] === 'prepare-child') {
    return commandHelpPayload({
      command: 'lifecycle parent prepare-child',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['parent', 'child', 'await'],
      optionalDataFields: ['parentContinuation', 'recoverStaleParent'],
      enumValues: { 'child.transport': setValues(DISPATCH_TRANSPORTS) },
      example: { flags: { fixmeDir: '/absolute/.fixme', dataFile: '/absolute/prepare-child.json' }, data: { parent: {}, child: {}, await: {} } },
      guidance: 'Returns a launch block only; the runtime adapter performs the returned launch action.',
    });
  }
  if (command === 'lifecycle' && subcommand === 'parent' && args[0] === 'abandon') {
    return commandHelpPayload({
      command: 'lifecycle parent abandon',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: ['parentRunId', 'idempotencyKey', 'reason', 'message'],
      optionalDataFields: ['preserveLedger'],
      enumValues: { reason: setValues(PARENT_FAILURE_REASONS) },
      example: { flags: { fixmeDir: '/absolute/.fixme', dataFile: '/absolute/abandon.json' }, data: { parentRunId: 'parent_...', idempotencyKey: 'abandon-key', reason: 'staleParentMissingActiveChild', message: 'Parent is stale' } },
    });
  }
  if (command === 'lifecycle' && subcommand === 'task-event' && args[0] === 'record') {
    return commandHelpPayload({
      command: 'lifecycle task-event record',
      requiredFlags: ['fixme-dir'],
      requiredDataFields: setValues(TASK_EVENT_RECORD_FIELDS),
      optionalDataFields: [],
      enumValues: { status: ['completed', 'failed'] },
      example: { flags: { fixmeDir: '/absolute/.fixme' }, data: { parentRunId: 'parent_...', taskRunId: 'taskRun_...', taskStatePath: '/absolute/task.state.json', resultSummaryPath: '/absolute/result.json', terminalResultId: 'terminal_...', status: 'completed' } },
    });
  }
  if (command === 'lifecycle' && subcommand === 'task-event' && args[0] === 'consume') {
    return commandHelpPayload({
      command: 'lifecycle task-event consume',
      requiredFlags: ['fixme-dir', 'parent-run-id'],
      requiredDataFields: [],
      optionalDataFields: ['event-id', 'next'],
      enumValues: {},
      example: { flags: { fixmeDir: '/absolute/.fixme', parentRunId: 'parent_...', next: true } },
    });
  }
  return null;
}

function maybeShowCommandHelp(command, subcommand, args, flags) {
  if (!Object.prototype.hasOwnProperty.call(flags, 'help')) {
    return false;
  }
  const schema = commandHelpSchema(command, subcommand, args);
  if (!schema) {
    return false;
  }
  output(schema);
  return true;
}

function rootCommand() {
  const fixmeRoot = findFixmeRoot(process.cwd());
  return output({
    fixmeRoot,
    fixmeDir: path.join(fixmeRoot, '.fixme'),
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

  try {
    let resolvedFixmeRoot = null;
    const getFixmeRoot = () => {
      if (resolvedFixmeRoot === null) {
        resolvedFixmeRoot = findFixmeRoot(process.cwd());
      }
      return resolvedFixmeRoot;
    };

    if (maybeShowCommandHelp(command, subcommand, args, flags)) {
      return;
    }

    switch (command) {
      case 'ticket':
        switch (subcommand) {
          case 'create':
            return ticketCreate(args[0], flags);
          case 'transition':
            return ticketTransition(args[0], args[1], flags, getFixmeRoot());
          case 'list':
            return ticketList(args[0], flags);
          case 'next':
            return ticketNext(args[0]);
          case 'rename':
            return ticketRename(args[0], flags);
          default:
            return error(`Unknown ticket subcommand: '${subcommand}'. Valid: create, transition, list, next, rename`);
        }

      case 'task':
        switch (subcommand) {
          case 'save':
            return taskSave(flags, getFixmeRoot());
          case 'init':
            return taskInit(flags, getFixmeRoot());
          case 'checkpoint':
            return taskCheckpoint(flags);
          case 'producer-continuation':
            switch (args[0]) {
              case 'mark-bad':
                return taskProducerContinuationMarkBad(flags);
              default:
                return error(`Unknown task producer-continuation subcommand: '${args[0] || ''}'. Valid: mark-bad`);
            }
          case 'resolve':
            return taskResolve(args[0], getFixmeRoot());
          case 'attach-artifact':
            return taskAttachArtifact(flags, getFixmeRoot());
          case 'decision':
            switch (args[0]) {
              case 'append':
                return taskDecisionAppend(flags);
              case 'list':
                return taskDecisionList(flags);
              default:
                return error(`Unknown task decision subcommand: '${args[0] || ''}'. Valid: append, list`);
            }
          case 'result':
            switch (args[0]) {
              case 'write':
                return taskResultWrite(flags);
              default:
                return error(`Unknown task result subcommand: '${args[0] || ''}'. Valid: write`);
            }
          default:
            return error(`Unknown task subcommand: '${subcommand}'. Valid: save, init, checkpoint, producer-continuation, resolve, attach-artifact, decision, result`);
        }

      case 'lifecycle':
        switch (subcommand) {
          case 'invocation':
            switch (args[0]) {
              case 'start':
                return lifecycleInvocationStart(flags, getFixmeRoot());
              case 'finish':
                return lifecycleInvocationFinish(flags, getFixmeRoot());
              default:
                return lifecycleError('unsupportedCommand', `Unknown lifecycle invocation action: '${args[0] || ''}'`);
            }
          case 'dispatch':
            switch (args[0]) {
              case 'prepare':
                return lifecycleDispatchPrepare(flags, getFixmeRoot());
              case 'complete':
                return lifecycleDispatchComplete(flags);
              default:
                return lifecycleError('unsupportedCommand', `Unknown lifecycle dispatch action: '${args[0] || ''}'`);
            }
          case 'attention':
            switch (args[0]) {
              case 'open':
                return lifecycleAttentionOpen(flags);
              case 'consume':
                return lifecycleAttentionConsume(flags);
              case 'broker':
                switch (args[1]) {
                  case 'show':
                    return lifecycleAttentionBrokerShow(flags);
                  case 'answer':
                    return lifecycleAttentionBrokerAnswer(flags);
                  default:
                    return lifecycleError('unsupportedCommand', `Unknown lifecycle attention broker action: '${args[1] || ''}'`);
                }
              default:
                return lifecycleError('unsupportedCommand', `Unknown lifecycle attention action: '${args[0] || ''}'`);
            }
          case 'wait':
            switch (args[0]) {
              case 'begin':
                return lifecycleWaitBegin(flags);
              case 'end':
                return lifecycleWaitEnd(flags);
              default:
                return lifecycleError('unsupportedCommand', `Unknown lifecycle wait action: '${args[0] || ''}'`);
            }
          case 'parent':
            switch (args[0]) {
              case 'create':
                return lifecycleParentCreate(flags);
              case 'checkpoint':
                return lifecycleParentCheckpoint(flags);
              case 'resolve':
                return lifecycleParentResolve(flags);
              case 'prepare-child':
                return lifecycleParentPrepareChild(flags);
              case 'abandon':
                return lifecycleParentAbandon(flags);
              default:
                return lifecycleError('unsupportedCommand', `Unknown lifecycle parent action: '${args[0] || ''}'`);
            }
          case 'task-event':
            switch (args[0]) {
              case 'record':
                return lifecycleTaskEventRecord(flags);
              case 'consume':
                return lifecycleTaskEventConsume(flags);
              default:
                return lifecycleError('unsupportedCommand', `Unknown lifecycle task-event action: '${args[0] || ''}'`);
            }
          default:
            return lifecycleError('unsupportedCommand', `Unknown lifecycle subcommand: '${subcommand}'`);
        }

      case 'pipeline':
        switch (subcommand) {
          case 'resolve':
            return pipelineResolve(flags, getFixmeRoot());
          default:
            return error(`Unknown pipeline subcommand: '${subcommand}'. Valid: resolve`);
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
            return contextSave(flags, getFixmeRoot());
          case 'load':
            return contextLoad(flags, getFixmeRoot());
          default:
            return error(`Unknown context subcommand: '${subcommand}'. Valid: detect, save, load`);
        }

      case 'config':
        switch (subcommand) {
          case 'ensure':
          case 'migrate':
            return configMigrate(getFixmeRoot());
          case 'get':
            return configGet(args[0], getFixmeRoot());
          case 'set':
            return configSet(args[0], args[1], getFixmeRoot());
          case 'workflow':
            switch (args[0]) {
              case 'configure':
                return configWorkflowConfigure(args[1], flags, getFixmeRoot());
              default:
                return error(`Unknown config workflow subcommand: '${args[0] || ''}'. Valid: configure`);
            }
          case 'soft' + 'ness':
            return error("Unsupported config subcommand. Use `config review-level resolve`.");
          case 'review-level':
            switch (args[0]) {
              case 'resolve':
                return configReviewLevelResolve(flags, getFixmeRoot());
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
            return usageStart(flags, hasUsageFixmeDirFlag(flags) ? null : getFixmeRoot());
          case 'finish':
            return usageFinish(flags, hasUsageFixmeDirFlag(flags) ? null : getFixmeRoot());
          case 'report':
            return usageReport(flags, flags.scope === 'global' || hasUsageFixmeDirFlag(flags) ? null : getFixmeRoot());
          case 'claude-hook':
            return usageClaudeHook();
          default:
            return usageCliError('UNKNOWN_USAGE_SUBCOMMAND', `Unknown usage subcommand: '${subcommand}'. Valid: start, finish, report, claude-hook`);
        }

      case 'run':
        switch (subcommand) {
          case 'start':
            return runStart(flags);
          case 'ping':
            return runPing(flags);
          case 'status':
            return runStatus(flags);
          case 'attention':
            return runAttention(args, flags);
          default:
            return error(`Unknown run subcommand: '${subcommand}'. Valid: start, ping, status, attention`);
        }

      case 'liveness':
        switch (subcommand) {
          case 'ping':
            return livenessCompatPing(flags);
          case 'status':
            return livenessCompatStatus(flags);
          default:
            return error(`Unknown liveness subcommand: '${subcommand}'. Valid: ping, status`);
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
        const result = runAlert(event, getFixmeRoot(), { resolveOnly });
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
        return output(resolveModel(agentName, getFixmeRoot(), { runtime: flags.runtime }));
      }

      default:
        return error(`Unknown command: '${command}'. Valid: ticket, task, lifecycle, pipeline, session, context, config, codex-agents, codex-skills, claude-skills, usage, run, liveness, root, resolve-model, alert`);
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
  resolvePipelineFromData,
  resolveReviewLevel,
  KNOWN_FIXME_AGENTS,
  RUN_STATES,
  RUN_CHECKPOINTS,
};
