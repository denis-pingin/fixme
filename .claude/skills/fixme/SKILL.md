---
name: fixme
description: Use first for Fixme-related requests, including bare FIXME-N labels, saved task or ticket refs, named Fixme pipelines, Fixme skill selection, sessions, PR comments, rebases, tickets, configuration, usage reports, and ambiguous ideas that need routing to the right Fixme workflow.
argument-hint: "[request]"
---

# Fixme Router

Select the right Fixme skill for the user's request, then invoke that skill with the normalized arguments. This skill is a router only. It does not investigate, plan, edit code, review, rebase, create tickets, or mutate workflow state itself.

## When To Use

Use this skill before other Fixme skills when the request is Fixme-shaped but not already an explicit single skill invocation.

Fixme-shaped signals include:

- A saved task or ticket label such as `FIXME-9`
- Multiple labels such as `FIXME-9 followed by FIXME-10`
- Pipeline words such as `standard pipeline`, `bugfix pipeline`, `full pipeline`, `plan-only`, or `execute-only`
- A request to choose which Fixme skill to use
- A request about Fixme sessions, PR comments, rebasing, tickets, configuration, usage, alerts, or brainstorming
- A bare task request in a repo that has a Fixme workflow and the user asks to run it through Fixme

If the user explicitly invokes a concrete skill such as `/fixme-task`, `/fixme-session`, or `/fixme-pr-comments`, use that concrete skill directly. Do not insert this router between an explicit invocation and the target skill.

## Hard Constraints

- Route to a concrete Fixme skill as soon as the correct target is clear.
- Do not dispatch more than one `fixme-task` at a time. For multiple `FIXME-N` labels, invoke `fixme-task` sequentially in the user's stated order and wait for each run to finish before starting the next.
- Do not reinterpret a requested pipeline. Preserve explicit pipeline names such as `standard`, `bugfix`, `full`, `product-spec`, `technical-spec`, `plan-only`, and `execute-only`.
- Parent brokers must not run `task decision append`, `task checkpoint`, `run attention clear`, or `lifecycle dispatch prepare` after recording an attention answer.
- If the current context is brokering a pending `fixme-task` attention answer, route the answer through `lifecycle attention broker resume`, launch only the returned `resume.message`, then call `lifecycle attention broker acknowledge-resume`; do not route the message as a fresh saved task or one-off implementation workflow.
- If two routes are plausible and they have different side effects, ask one concise question before dispatching.
- If authoritative Linear ticket content is needed and Linear MCP is unavailable, stop per the repository Linear MCP rule instead of guessing.

## Routing Table

| User intent | Route |
| --- | --- |
| Run or resume a saved task, ticket, or `FIXME-N` label | `Skill("fixme-task", "<pipeline args if any> --resume <ref>")` |
| Preparation work for a saved task mentioned in natural language | Extract the saved task ref and dispatch the requested preparation skills with `--task <ref>` in the user's stated order |
| Run a normal one-off implementation workflow | `Skill("fixme-task", "<request>")` |
| Run a named pipeline | `Skill("fixme-task", "--pipeline <name> <request>")` |
| Start, resume, report, stop, or check a bug-fix session | `Skill("fixme-session", "<request>")` |
| Address PR review comments or CI review feedback comments | `Skill("fixme-pr-comments", "<flags if any>")` |
| Rebase a branch | `Skill("fixme-rebase", "<branch/base/flags if any>")` |
| Create a Linear ticket | `Skill("fixme-ticket", "<description and flags>")` |
| Explore an idea before choosing a workflow | `Skill("fixme-brainstorm", "<topic>")` |
| Configure workflows, models, review level, Linear, ticket backend, commands, or alerts | `Skill("fixme-config", "<request>")` |
| Show token or usage reports | `Skill("fixme-usage", "<scope/view args>")` |
| Verify a completed browser-facing change | `Skill("fixme-browser-verify", "<verification target>")` |

## Parsing Rules

1. Extract every `FIXME-N` label in the order the user wrote it.
2. Extract one explicit pipeline if present. Accept `standard`, `bugfix`, `full`, `product-spec`, `technical-spec`, `plan-only`, and `execute-only`.
3. If the user says `both`, `all`, or otherwise applies one pipeline to multiple labels, pass that same pipeline to each routed invocation.
4. If the user says `followed by`, `then`, `after that`, or gives an ordered list, preserve that order.
5. If no pipeline is supplied for a `FIXME-N` label, route with `--resume <ref>` only and let `fixme-task` resolve the saved pipeline or default.
6. If the request includes non-Fixme work plus a Fixme route, route the Fixme work first only when the user made sequencing explicit. Otherwise ask which should happen first.

### Saved Task Preparation Parsing

Preparation work for a saved task mentioned in natural language must attach its artifacts to that saved task, even when the user did not pass explicit `--task` flags.

Use this rule when the prompt includes:

- A saved task ref, usually a `FIXME-N` label. If the prompt also names a Linear ticket such as `ALP-304 / FIXME-13`, extract the saved task ref from any `FIXME-N` label in the prompt and use it as `<ref>`.
- A preparation intent such as "prepare for execution", "preparing for implementation", "check if you can find issues", "validate the approach against hard evidence", "make sure everything is implementable", "do Fixme Research", or "do Fixme Brainstorm".
- One or more preparation skills in prose, especially ordered phrases such as "Fixme Research followed by Fixme Brainstorm".

Routing:

```text
Fixme Research followed by Fixme Brainstorm for FIXME-13
Route:
Skill("fixme-research", "--task <ref> <specific research request from prompt>")
wait for completion
Skill("fixme-brainstorm", "--task <ref> <specific brainstorm request from prompt>")
```

If the user gives non-Fixme prerequisites before the preparation sequence, such as "switch to master and refresh it first", perform those prerequisites first when they are safe and explicit. Then route the preparation skills in the stated order. Do not start `fixme-task --resume <ref>` unless the user explicitly asks to execute or resume the saved task after preparation.

## Canonical Examples

Bare sequential labels with one shared pipeline:

```text
User: FIXME-9 followed by FIXME-10, both standard pipeline
Route:
Skill("fixme-task", "--pipeline standard --resume FIXME-9")
wait for completion
Skill("fixme-task", "--pipeline standard --resume FIXME-10")
```

Single saved task or ticket:

```text
User: resume FIXME-12
Route:
Skill("fixme-task", "--resume FIXME-12")
```

Named pipeline:

```text
User: run bugfix pipeline for the Safari checkout failure
Route:
Skill("fixme-task", "--pipeline bugfix the Safari checkout failure")
```

Session request:

```text
User: start a Fixme session and queue this bug
Route:
Skill("fixme-session", "report <bug description>")
```

PR comments:

```text
User: address PR comments without pushing
Route:
Skill("fixme-pr-comments", "--skip-push")
```

Rebase:

```text
User: rebase this branch onto develop
Route:
Skill("fixme-rebase", "--base develop")
```

Ticket creation:

```text
User: create a Linear ticket for the mobile login bug
Route:
Skill("fixme-ticket", "mobile login bug")
```

Ambiguous idea:

```text
User: I have an idea for improving imports but I am not sure how to scope it
Route:
Skill("fixme-brainstorm", "improving imports")
```

## Output Style

Keep the user-facing explanation short:

```text
Using `fixme` to route this to `<target-skill>`.
```

When the route is obvious, do not present a menu. Invoke the target skill immediately. Use a menu only when the user is actually choosing between different side effects, such as creating a ticket versus running an implementation workflow.
