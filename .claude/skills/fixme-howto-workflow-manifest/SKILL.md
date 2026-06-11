---
name: fixme-howto-workflow-manifest
description: Shared workflow manifest rules for runtime-neutral live task-list tooling.
---

# Workflow Manifest

A live manifest task list is the runtime-visible checklist used to drive a Fixme workflow in the current conversation. It is not durable workflow state; durable state belongs in Fixme task state, parent state, task events, tickets, specs, plans, and decision logs.

Use the live manifest task list whenever a workflow says to create, update, inspect, or advance the manifest.

## Runtime Mappings

- Claude: create the live manifest task list with `TaskCreate`, update entries with `TaskUpdate`, inspect current entries with `TaskList`, and read one entry with `TaskGet`.
- Codex: create and update the live manifest task list with `update_plan`.

If the current runtime does not expose the required manifest tool, stop with a manifest-tool blocker instead of tracking the manifest in prose. Do not emulate the live manifest task list in ordinary markdown because it will not provide the same execution guardrails.

## Ownership

Parent and child live manifest task lists stay separate unless a workflow explicitly says otherwise. A child workflow must not inspect, merge, replace, or advance the parent manifest. When the parent needs to continue after a child finishes, the child must record durable state or a durable terminal task event for the parent to consume.

## Status Rules

Build the full live manifest task list before dispatching workflow work. Mark exactly one active step `in_progress`, mark completed steps `completed`, and leave future steps `pending`.

The manifest is only a live execution guard. It must never be treated as the source of truth for resumable state across turns, restarts, or parent-child boundaries.
