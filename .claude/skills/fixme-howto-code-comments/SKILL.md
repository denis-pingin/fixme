---
name: fixme-howto-code-comments
description: Rules for writing code comments in generated source code. Bans opaque planning tags, phase references, and forward-references. Preloaded into planner and executor agents via skills frontmatter.
---

# Code Comments Guidelines

These guidelines govern how code comments are written in generated source code (.ts, .tsx, .js, .jsx, and similar). Every skill that writes or modifies code comments MUST follow these rules.

## Three Rules (Non-Negotiable)

### Rule 1: No opaque planning tags

Never write planning-system identifiers into code comments. These tags are meaningless to anyone reading the code without access to the planning session that produced them.

**Banned patterns:**
- Decision tags: `D-1`, `D-2`, `P1`, `P-7`, `T-3`, `F-5`
- Skill/domain tags: `FED-12`, `MOB-3`, `AUT-7`, `BFL-2`, `FOL-1`, `CON-4`, `SEC-8`, `REA-5`, `FIX-3`
- Pitfall references: `Pitfall #3`, `Pitfall 7`
- Plan references: `Plan 24-03`, `Plan 27-04`
- Phase references with 2+ digit numbers: `Phase 24`, `Phase 12`
- Open questions: `Open Question 3`
- Research patterns: `RESEARCH Pattern 5`

**If the reference is load-bearing** (the comment would be meaningless without it), replace the tag with a concrete description of the mechanism, constraint, or rationale it refers to.

Before:
```typescript
// D-7: Use guard pattern here
// See Pitfall #3 for why we clone
// Phase 24 consumer - will be wired in FOL-2
```

After:
```typescript
// Guard pattern: return early when session is expired to avoid cascading null checks downstream
// Clone the config object - mutating the shared instance causes race conditions in concurrent requests
// Consumed by the notification dispatcher in services/notifications/sender.ts
```

### Rule 2: No phase references

Never reference planning phases, plan numbers, or planning-system artifacts as the reason code exists. The code outlives the plan that created it.

Before:
```typescript
// Phase 24 consumer
// Added in Plan 27-04
// Part of the Phase 12 migration
```

After:
```typescript
// Consumed by services/notifications/sender.ts
// Validates webhook signatures before processing (required by Stripe API v2024-06)
// Migrated from the legacy sync adapter in lib/legacy/sync.ts
```

### Rule 3: No forward-references to unfinished work

Never write comments that reference work that "will happen elsewhere" or "will be added later" unless they are actionable TODOs with a ticket reference.

Before:
```typescript
// Will be wired up in the next phase
// The handler for this will be added in FOL-2
// Placeholder - real implementation coming in Phase 25
```

After (if the work exists now):
```typescript
// Handler: src/handlers/webhook.ts:processPayment()
```

After (if the work doesn't exist yet):
```typescript
// TODO(ALP-XXX): Add payment webhook handler
```

## What Good Comments Look Like

Good comments explain **why**, not **what**. They describe constraints, non-obvious decisions, and context that the code alone can't convey.

```typescript
// Rate-limit to 10 req/s per tenant - higher rates trigger 429s from the upstream billing API
const limiter = createRateLimiter({ maxPerSecond: 10 });

// Intentionally not awaited - fire-and-forget analytics that must not block the checkout flow
void trackPurchaseEvent(order);

// Stripe requires idempotency keys for retry safety on payment intents
const key = `pi_${orderId}_${attempt}`;
```

## Applying These Rules

When writing or modifying any code comment:
1. Check: does it contain any banned pattern from Rule 1?
2. Check: does it reference a planning phase, plan number, or planning artifact?
3. Check: does it promise work that doesn't exist yet without a ticket reference?

If any check fails, rewrite the comment to be self-contained - describe the actual mechanism, constraint, or rationale in concrete terms that make sense to a developer reading this file for the first time with no access to planning documents.
