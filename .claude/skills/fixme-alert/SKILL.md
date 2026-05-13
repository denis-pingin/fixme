---
name: fixme-alert
description: Play an audible alert sound to notify the user that attention is needed. Supports three events (user_input, task_finished, task_failed), each with its own configurable sound. Cross-platform via fixme-tools.cjs, with macOS, Linux, and Windows backends. Configure via fixme-config.
allowed-tools: Bash
---

## Fixme Directory

Use `<fixme-dir>` for any path under the fixme directory. Resolution rules and the prohibition against literal `.fixme/` paths are defined in `fixme-howto-find-fixme-dir` (read at `~/.claude/skills/fixme-howto-find-fixme-dir/SKILL.md`).

# Fixme Alert

Play an audible alert when the user needs to look at the terminal. Three events are supported, each mapped to a separately configurable sound.

## Events

| Event | When to fire | Default sound (macOS) |
| --- | --- | --- |
| `user_input` | The workflow paused for a decision, question, or confirmation. | Glass |
| `task_finished` | A workflow phase, ticket, or interactive skill ran to successful completion. | Hero |
| `task_failed` | The workflow halted on an error, unrecoverable verification failure, or user-rejected outcome. | Basso |

## How to Run

From any context where attention is needed:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_finished
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert task_failed
```

The command is fire-and-forget. The sound plays in a detached subprocess and the command returns immediately. Other skills should call this directly via the Bash tool; do NOT invoke this skill through the Skill tool for every alert.

To inspect what would play without playing it:

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert user_input --resolve
```

To list available sounds and current defaults (used by `fixme-config`):

```bash
node ~/.claude/skills/fixme-tools/scripts/fixme-tools.cjs alert --list-sounds
```

## Configuration

Configure interactively with `/fixme-config` (Alerts round) or edit `<fixme-dir>/config.json` directly:

```json
{
  "alerts": {
    "enabled": true,
    "sounds": {
      "user_input": "Glass",
      "task_finished": "Hero",
      "task_failed": "Basso"
    }
  }
}
```

Sound names are drawn from the canonical macOS standard library catalog: `Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink`. On Linux and Windows, canonical names map to native equivalents automatically.

Set `alerts.enabled` to `false` to silence everything without losing the per-event preferences.

## Platform Support

| Platform | Player | Sound directory |
| --- | --- | --- |
| macOS (`darwin`) | `afplay` | `/System/Library/Sounds` (`.aiff`) |
| Linux | `paplay` | `/usr/share/sounds/freedesktop/stereo` (`.oga`) |
| Windows (`win32`) | `powershell` Media.SoundPlayer | `%SystemRoot%\Media\*.wav` |
| Any other | no-op (silent) | none |

Missing players or sound files cause a graceful no-op; the calling skill never errors on alert failure.

## When NOT to Use

- Do not chain alerts in tight loops. Fire one alert per attention event.
- Do not replace user-facing output with an alert. The alert supplements text output; it does not replace it.
- Do not emit `intermediate` or "progress" alerts. Only the three events above are supported by design (no idling without sound, but also no spam).
