---
name: fixme-alert
description: Play an audible alert sound on macOS to notify the user that attention is needed. Use when a long-running fixme workflow has finished, paused at a decision gate, hit an error, or otherwise needs the user to look at the terminal.
allowed-tools: Bash
---

# Fixme Alert

Play an audible alert so the user knows something needs their attention.

## When to Use

Trigger this skill when the user is likely away from the terminal and something just happened that they need to see, such as:

- A fixme workflow finished and is waiting on the next instruction
- A decision gate paused execution and needs a user response
- An error halted a long-running task
- Verification finished after a multi-minute build/test run

## How to Run

Run exactly one command:

```bash
afplay /System/Library/Sounds/Submarine.aiff
```

That is all the skill does. Do not chain additional commands, do not loop the sound, and do not change the sound file unless the user asks.

## Constraints

- macOS only. `afplay` and the system sound paths only exist on Darwin. If the platform is not Darwin, skip the alert and continue without erroring.
- Fire once per attention event. Do not spam alerts in tight loops or for routine progress updates.
- Never replace the user-facing message with just an alert. The alert is in addition to the normal output, not instead of it.
