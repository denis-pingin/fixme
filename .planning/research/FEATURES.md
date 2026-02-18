# Feature Research

**Domain:** Bug fix orchestration / automated debugging for Claude Code skill systems
**Researched:** 2026-02-18
**Confidence:** HIGH (domain is well-understood; novel combination of known patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Bug report intake to structured ticket** | The whole point. User says "X is broken" and it becomes a trackable item. Without this, there's nothing to orchestrate. | LOW | Background agent writes numbered MD file. Parse user text + optional screenshots into title, repro steps, expected vs actual. |
| **Sequential dispatch queue** | If bugs pile up, they must process in order. Without queuing, the second report kills the first fix mid-work. | LOW | FIFO by arrival order. Numbered filenames (001-*, 002-*) for sort stability. |
| **Ticket state machine** | Users need to know what's happening. "Is my bug being worked on?" is the first question after reporting. | LOW | States: `queued` -> `investigating` -> `fixing` -> `verifying` -> `done` / `failed`. Stored in ticket MD frontmatter. |
| **Investigation phase** | Agents that jump straight to fixing without understanding the bug produce garbage patches. SWE-bench research shows root cause analysis is the bottleneck. | MEDIUM | Agent reads codebase, reproduces in browser, identifies root cause. Writes investigation notes to ticket. |
| **Browser-based reproduction** | You can't fix what you can't see. Playwright MCP is the agent's eyes. Without reproduction, agents guess at fixes. | MEDIUM | Navigate to URL, interact with UI, capture state. Depends on project CLAUDE.md providing dev server URL. |
| **Browser-based verification** | Research shows 18% of AI-generated fixes fail existing tests or introduce regressions. Verification closes the loop. | MEDIUM | After fix, agent re-navigates and confirms the bug is gone. Must check the specific behavior described in the report. |
| **One commit per fix** | Atomic commits per bug. If fix 3 breaks something, you revert fix 3, not fixes 1-5. Non-negotiable for any dev workflow. | LOW | `git add` + `git commit` with ticket reference in message. |
| **Project context discovery** | Agent needs to know: where's the app running, how to build, does HMR work. Without this, every fix starts from zero. | LOW | Read target project's CLAUDE.md for dev server URL, build commands, HMR support, project structure. |
| **Failure handling with move-on** | A stuck agent blocks the entire queue. Must mark failed, capture why, move to next bug. | LOW | Timeout or error -> set ticket to `failed` with reason -> dequeue next ticket. |
| **Fix details and evidence recording** | Users need to review what the agent did. Blind trust in AI patches is how you ship regressions. | LOW | Record: files changed, diff summary, investigation notes, verification screenshots/snapshots in ticket MD. |
| **Timestamp and duration tracking** | "How long did this take?" is basic operational visibility. Also needed for timeout detection. | LOW | Record timestamp at each state transition. Calculate duration per phase and total. |
| **Orchestrator context efficiency** | Main loop runs for entire session. If it bloats, context compaction destroys state. This is a constraint, not a feature, but failing here = system death. | MEDIUM | Push ALL heavy work to subagents via Task tool. Ticket files as persistent state. Orchestrator reads only status, not investigation details. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Streaming intake (accept bugs mid-fix)** | Users don't wait for current fix to finish before reporting the next bug. This is the core UX innovation -- bugs flow in continuously while fixes flow out sequentially. No existing tool does this within a single Claude Code session. | MEDIUM | Background intake agent captures report while implementation agent works. Requires careful orchestrator loop design to interleave intake with dispatch. |
| **HMR-aware verification** | Skip page refresh when project supports hot module replacement. Saves tokens (no reload commands), saves time (no wait for full page load), produces more reliable verification (tests against live-updated state). | LOW | Read HMR support from CLAUDE.md. If true, after code edit, wait briefly then verify. If false, run build command and/or refresh. |
| **Visual before/after evidence** | Screenshots or accessibility snapshots captured before fix (showing bug) and after fix (showing resolution). Provides proof chain that the fix actually worked. Goes beyond "tests pass" to "I can see it's fixed." | MEDIUM | Playwright `browser_take_screenshot` or `browser_snapshot` at reproduction and verification stages. Store in ticket or adjacent files. Diff comparison possible but not required for v1. |
| **Investigation report per ticket** | Not just "fixed it" but "here's what I found, here's the root cause, here's why this fix is correct." Enables human review of agent reasoning, catches wrong-cause-right-symptom fixes. | LOW | Agent writes structured notes during investigation: hypothesis, code paths examined, root cause identified. Stored in ticket MD body. |
| **Git rollback on failed verification** | If verification fails after code changes, automatically `git checkout` the changed files before retrying or moving on. Prevents half-applied broken patches from accumulating. | LOW | Track files modified during fix attempt. On verification failure, `git checkout -- <files>`. Clean slate for retry or next bug. |
| **Retry with different approach** | When first fix attempt fails verification, agent tries a different approach (up to N attempts) before marking failed. Mimics how a human developer iterates. | MEDIUM | Config: max_retries (default 2). On verification failure, rollback, re-investigate with "previous approach X failed because Y" context. |
| **Summary dashboard at session end** | After all bugs processed (or on demand), show: N fixed, M failed, total time, per-bug breakdown. Gives user a "what happened" overview without reading every ticket. | LOW | Aggregate ticket statuses. Format as table. Include links to ticket files for details. |
| **Duplicate/related bug detection** | When ingesting a new report, compare against existing queue items. Flag potential duplicates before wasting an agent on a fix that's already in progress or done. | MEDIUM | Semantic comparison of bug descriptions against existing tickets. Could be simple keyword overlap or LLM-based similarity. |
| **Priority override** | Let user mark a bug as urgent to jump the queue. Default is FIFO, but sometimes bug 5 is blocking a demo in 10 minutes. | LOW | Optional `priority: urgent` flag on intake. Urgent bugs get dispatched next, ahead of FIFO queue. |
| **Test-aware verification** | Beyond browser verification, run project's test suite after fix to catch regressions. Uses build/test commands from CLAUDE.md. | MEDIUM | Run `yarn test` (or project equivalent) after fix. Parse output for failures. If tests fail that passed before, rollback. Requires knowing the project's test command. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Parallel implementation agents** | "Fix bugs faster by working on multiple simultaneously" | Merge conflicts between concurrent fixes. Shared browser instance contention. Dramatically harder state management. Git history becomes non-linear. Context cost multiplies. v1 must be sequential to be reliable. | Design architecture to support future parallelism (separate branches per agent), but ship sequential only. |
| **Automated bug detection / monitoring** | "Find bugs before users report them" | Completely different problem domain. Requires understanding of intended behavior, which only humans know. Scope explosion. | Fixme fixes what humans find. Separate tool for automated testing/monitoring. |
| **External issue tracker integration** | "Sync with Jira/Linear/GitHub Issues" | Adds auth complexity, API rate limits, sync state management, schema mapping. Every tracker has different fields and workflows. Massive scope increase for marginal v1 value. | Ticket MD files are the source of truth. Users can manually copy to trackers. Build integration later if validated. |
| **Cross-browser testing** | "Verify fix works in Chrome AND Firefox AND Safari" | Single browser instance per agent is already complex. Multi-browser multiplies verification time and token cost. Different browsers may have different bugs. | Single Chromium instance via Playwright. Cross-browser is a QA concern, not a bug-fix concern. |
| **Autonomous bug prioritization** | "AI should decide which bug to fix first" | AI doesn't know business context. "Button color is wrong" might be blocking a $1M client demo. User-defined priority is the only reliable signal. | FIFO default + user priority override. Let humans decide importance. |
| **Full visual regression suite** | "Compare every page against baseline screenshots" | Baseline management is a project unto itself. Screenshot comparison is brittle (font rendering, animation state, viewport size). Token-expensive to process all those images. | Targeted before/after screenshots for the specific bug being fixed. Not a regression suite. |
| **CI/CD integration** | "Run the fix through CI pipeline" | Fixme operates in local dev environment. CI pipelines have different configs, environments, secrets. Adding CI awareness is a different product. | Run local tests and builds. CI integration is out of scope. |
| **Natural language bug reports only** | "Just paste the error message and let AI figure it out" | Error messages without context (URL, page, expected behavior) produce garbage investigation. Structured intake with minimum required fields is more reliable. | Accept free-form text but extract/prompt for: where (URL/page), what's wrong, what should happen. Don't require forms, but parse intelligently. |

## Feature Dependencies

```
[Project context discovery]
    |
    +--requires--> [Browser-based reproduction]
    |                  |
    |                  +--requires--> [Browser-based verification]
    |                  |                  |
    |                  |                  +--enables--> [Visual before/after evidence]
    |                  |                  +--enables--> [Git rollback on failed verification]
    |                  |                  +--enables--> [Retry with different approach]
    |                  |
    |                  +--enables--> [Investigation report per ticket]
    |
    +--requires--> [HMR-aware verification]

[Bug report intake to structured ticket]
    |
    +--requires--> [Ticket state machine]
    |                  |
    |                  +--enables--> [Timestamp and duration tracking]
    |                  +--enables--> [Summary dashboard]
    |
    +--requires--> [Sequential dispatch queue]
    |                  |
    |                  +--enables--> [Priority override]
    |                  +--enables--> [Duplicate/related bug detection]
    |
    +--enables--> [Streaming intake (accept bugs mid-fix)]

[One commit per fix] --independent-- (no dependencies, always available)

[Orchestrator context efficiency] --cross-cutting-- (affects all features)

[Test-aware verification] --enhances--> [Browser-based verification]
```

### Dependency Notes

- **Browser reproduction requires project context:** Agent needs dev server URL and navigation context before it can open a browser.
- **Verification requires reproduction:** You verify by re-running the reproduction scenario and confirming the bug is gone.
- **Visual evidence requires verification:** Screenshots are captured during the verification flow.
- **Rollback requires verification:** Only triggered when verification detects the fix didn't work.
- **Retry requires rollback:** Must clean up failed attempt before trying again.
- **Streaming intake requires basic intake working:** Can't accept mid-fix reports until single-report intake is solid.
- **HMR awareness requires project context:** Must know whether HMR is supported before deciding to skip refresh.
- **Priority override requires queue:** Can't reorder what doesn't exist.
- **Duplicate detection requires existing tickets:** Can't compare without prior reports.
- **Test-aware verification enhances browser verification:** Complementary, not dependent. Either can work alone.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept.

- [ ] **Bug report intake to structured ticket** -- the entry point for everything
- [ ] **Sequential dispatch queue** -- ordered processing of multiple bugs
- [ ] **Ticket state machine** -- visibility into what's happening
- [ ] **Project context discovery** -- agents need to know where/how to work
- [ ] **Investigation phase** -- understand before fixing
- [ ] **Browser-based reproduction** -- see the bug with Playwright
- [ ] **Browser-based verification** -- confirm the fix with Playwright
- [ ] **One commit per fix** -- atomic, reviewable changes
- [ ] **Failure handling with move-on** -- don't block queue on stuck bugs
- [ ] **Fix details and evidence recording** -- audit trail per ticket
- [ ] **Timestamp and duration tracking** -- operational visibility
- [ ] **Orchestrator context efficiency** -- system survival requirement
- [ ] **Streaming intake (accept bugs mid-fix)** -- core differentiator, include in v1

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **HMR-aware verification** -- when users report token/time waste on non-HMR refresh cycles
- [ ] **Visual before/after evidence** -- when users want proof of fix beyond "verified"
- [ ] **Investigation report per ticket** -- when users want to review agent reasoning
- [ ] **Git rollback on failed verification** -- when failed fixes leave dirty state
- [ ] **Retry with different approach** -- when single-attempt success rate is too low
- [ ] **Summary dashboard** -- when users process enough bugs to need an overview
- [ ] **Priority override** -- when FIFO isn't sufficient for real workflows

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Duplicate/related bug detection** -- needs enough ticket volume to matter
- [ ] **Test-aware verification** -- requires robust test command discovery, project-specific
- [ ] **Parallel implementation agents** -- architectural support in v1, implementation in v2+
- [ ] **External tracker integration** -- only if MD tickets prove insufficient

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bug report intake to structured ticket | HIGH | LOW | P1 |
| Sequential dispatch queue | HIGH | LOW | P1 |
| Ticket state machine | HIGH | LOW | P1 |
| Project context discovery | HIGH | LOW | P1 |
| Investigation phase | HIGH | MEDIUM | P1 |
| Browser-based reproduction | HIGH | MEDIUM | P1 |
| Browser-based verification | HIGH | MEDIUM | P1 |
| One commit per fix | HIGH | LOW | P1 |
| Failure handling with move-on | HIGH | LOW | P1 |
| Fix details and evidence recording | MEDIUM | LOW | P1 |
| Timestamp and duration tracking | MEDIUM | LOW | P1 |
| Orchestrator context efficiency | HIGH | MEDIUM | P1 |
| Streaming intake (accept bugs mid-fix) | HIGH | MEDIUM | P1 |
| HMR-aware verification | MEDIUM | LOW | P2 |
| Visual before/after evidence | MEDIUM | MEDIUM | P2 |
| Investigation report per ticket | MEDIUM | LOW | P2 |
| Git rollback on failed verification | MEDIUM | LOW | P2 |
| Retry with different approach | MEDIUM | MEDIUM | P2 |
| Summary dashboard | LOW | LOW | P2 |
| Priority override | LOW | LOW | P2 |
| Duplicate/related bug detection | LOW | MEDIUM | P3 |
| Test-aware verification | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | SWE-agent | Codex (OpenAI) | Devin | Claude Code (manual) | **Fixme (our approach)** |
|---------|-----------|----------------|-------|---------------------|--------------------------|
| Bug intake from user | GitHub issue parsing | Chat-based | Chat-based | User describes in prompt | Structured ticket from free text, background intake agent |
| Queue/batch processing | Single issue per run | Parallel agents per task | Single task per session | None (one at a time) | Streaming queue with sequential dispatch |
| Investigation | Codebase exploration via shell | Codebase exploration | Full environment access | User-directed | Autonomous investigation with browser reproduction |
| Browser verification | None (test suite only) | None (sandbox only) | Browser via Devin's VM | Manual Playwright MCP | Automated Playwright verification per ticket |
| Fix isolation | Patch file | Branch per fix | Branch per fix | User manages commits | One commit per fix, atomic |
| Failure recovery | Retry with different prompt | Retry internally | Human fallback | Manual | Mark failed, record reason, move to next |
| State persistence | None (stateless) | Task state in cloud | Session state | Conversation context (lost on compaction) | MD ticket files survive context compaction |
| Multi-bug workflow | Run N times manually | Multiple parallel agents | One at a time | One at a time | Core design: streaming multi-bug orchestration |
| Context efficiency | N/A (short-lived) | Cloud-managed | Cloud-managed | User's problem | Orchestrator stays lean, subagents get fresh context |

**Key insight:** No existing tool combines streaming bug intake + sequential autonomous fixing + browser-based verification in a single local Claude Code session. SWE-agent is closest in autonomous fixing but lacks browser verification and multi-bug orchestration. Codex can parallelize but runs in the cloud and lacks browser interaction. Devin has the most capabilities but is a full environment, not a lightweight skill.

## Sources

- [SWE-agent GitHub](https://github.com/SWE-agent/SWE-agent) -- agent architecture reference
- [Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf?hsLang=en) -- planner/worker/judge pattern
- [AI Coding Agents: Coherence Through Orchestration](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) -- orchestration over autonomy
- [Why AI Agent Fix PRs Remain Unmerged](https://arxiv.org/html/2602.00164) -- 18% failure rate on test validation
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- skill system architecture
- [Claude Code Skills Deep Dive](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/) -- progressive disclosure, token efficiency
- [Best AI Coding Agents 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026) -- agent capabilities comparison
- [Playwright Visual Regression Testing](https://testgrid.io/blog/playwright-visual-regression-testing/) -- screenshot comparison patterns
- [AI-Driven Design: Playwright MCP Screenshots and Visual Diffs](https://egghead.io/ai-driven-design-workflow-playwright-mcp-screenshots-visual-diffs-and-cursor-rules~aulxx) -- before/after capture workflow
- [Giving Your Agent Eyes Is Not Enough](https://qckfx.com/blog/giving-your-agent-eyes-is-not-enough) -- visual diff for agent verification
- [Best Practices for Claude Code Subagents](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) -- subagent orchestration patterns
- [Claude Code Subagent Nested Task Tool Issue](https://github.com/anthropics/claude-code/issues/4182) -- Task tool limitations
- [Claude Code Context Preservation Issue](https://github.com/anthropics/claude-code/issues/9963) -- context loss on compaction

---
*Feature research for: Bug fix orchestration / automated debugging (Claude Code skill system)*
*Researched: 2026-02-18*
