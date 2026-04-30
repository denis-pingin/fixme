---
name: fixme-howto-write-product-spec
description: Shared product specification writing guidelines for the fixme pipeline. Defines how to write user-facing behavioral specifications that capture what a feature does and why it exists without implementation details. Preloaded into specification-writing agents and usable standalone in other contexts.
---

# Product Specification Writing Guidelines

These guidelines govern how product specifications are written before technical design or implementation planning. A product specification defines user-visible behavior and intent, not implementation.

When writing requires a user decision, present the decision with `fixme-howto-present-decisions`. Do not leave unresolved questions in the final specification.

## Core Principle

A product specification is ready when it makes exactly one valid product behavior possible for every declared user role, user action, screen state, error state, permission boundary, and acceptance criterion.

The best product specification is exhaustive about user behavior and silent about implementation.

## Writing Workflow

1. Identify the feature purpose, target users, and product problem.
2. Read relevant existing product docs, tickets, designs, screenshots, and behavior in the app.
3. Use existing code only to understand current user-visible behavior. Do not copy implementation details into the product specification.
4. Define scope, non-goals, roles, permissions, and terms before writing requirements.
5. Inventory all user journeys, visible states, edge cases, interruptions, and recovery paths.
6. Write requirements with stable IDs and observable outcomes.
7. Write acceptance criteria that can be tested without reading implementation.
8. Resolve every ambiguity with decision cards before finalizing.
9. Run the readiness check at the end.

## Product Surface Inventory

Before writing requirements, enumerate the product surfaces the feature touches:

- target users, roles, ownership, and permissions
- entry points, navigation paths, deep links, and unavailable routes
- screens, panels, dialogs, menus, forms, and controls
- loading, empty, success, error, disabled, read-only, and partial states
- user actions, cancellations, retries, undo/redo, and interruptions
- messages, labels, confirmations, warnings, and validation copy
- notifications, emails, exports, imports, and external handoffs
- legacy behavior, compatibility expectations, and deleted or collapsed concepts
- analytics or audit events only when they are product-visible requirements

## Required Output Shape

Use this structure unless the caller supplies a stricter template:

```md
---
title: [Concise feature title]
date_created: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
tags: [short, relevant, tags]
---

# [Feature Name]

[One to three sentences explaining what the feature is, who it is for, and why it exists.]

## 1. Purpose and Scope

[What this specification covers, what it excludes, and who the target users are.]

## 2. Definitions

- **[Term]**: [Concrete definition]

## 3. Users, Roles, and Permissions

- **ROLE-001**: [Role or permission rule]

## 4. User Journeys

### 4.1 [Journey Name]

1. [User action]
2. [System response visible to the user]
3. [Next user action or terminal outcome]

## 5. Product Requirements

- **REQ-001**: [Observable product behavior]

## 6. States and Messages

- **STATE-001**: [State trigger] -> [What the user sees and can do]
- **MSG-001**: [Trigger] -> [Message copy or copy intent]

## 7. Edge Cases and Error States

- **EDG-001**: [Scenario] -> [Expected behavior and recovery path]

## 8. Acceptance Criteria

- **AC-001**: Given [context], when [user action], then [observable outcome]

## 9. Out of Scope

- [Behavior, user group, surface, or follow-up intentionally excluded]
```

Do not use markdown tables in the default template. Tables render poorly in common agent surfaces and make context switching harder.

## Requirement Rules

- Every requirement must describe observable product behavior.
- Every requirement must be testable through UI, user-visible response, notification, export, or durable product state.
- Requirement IDs must be stable and unique within the document.
- Requirements must not hide decisions behind words like "appropriate", "as needed", "etc.", "existing behavior", or "similar".
- If a requirement depends on current behavior, restate the exact current behavior.
- If a requirement removes, replaces, or collapses old behavior, state what happens to every old entry point and old state.

## Acceptance Criteria Rules

Acceptance criteria must use this shape:

```md
Given [user role and current product state]
When [user action or external event]
Then [observable outcome]
```

Every critical requirement needs at least one acceptance criterion. Error, empty, permission, stale, and legacy paths need acceptance criteria when they affect user behavior.

## What To Exclude

Do not include:

- APIs, functions, classes, components, schemas, database tables, queues, or file paths
- architecture, infrastructure, dependency, or package decisions
- implementation steps or pseudocode
- test framework choices or automation strategy
- internal state names unless the state is a named product concept visible to users

## Readiness Check

Before finalizing, verify:

- the specification answers what happens for every declared user action and role
- every requirement has one valid interpretation
- every edge case has a recovery path or terminal outcome
- acceptance criteria cover the happy path, negative paths, and legacy behavior
- no implementation details leaked into the document
- no open questions remain
- any user-facing decision was presented with `fixme-howto-present-decisions`
