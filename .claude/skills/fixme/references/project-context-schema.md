# Project Context Schema Reference

## Purpose

The project context provides operational information that agents need to work with a codebase: how to start the dev server, run tests, build the project, and check linting. This is supplementary to CLAUDE.md -- agents already inherit CLAUDE.md through normal Claude Code mechanisms. The project context captures only the operational details that CLAUDE.md may not explicitly provide.

This is NOT a place for coding conventions, style guides, or architectural decisions. Those belong in CLAUDE.md.

## Storage

- **File:** `.fixme/project-context.yaml`
- **Scope:** Per-project (shared across all sessions in the same project)
- **Format:** YAML

## Schema

```yaml
dev_server:
  command: "yarn dev"           # Command to start the development server
  url: "http://localhost:3000"  # Base URL of the running dev server
  hmr: true                     # Whether Hot Module Replacement is available

build:
  command: "yarn build"         # Command to build the project

test:
  runner: "vitest"              # Test runner: vitest, jest, mocha, or null
  command: "yarn test"          # Command to run all tests
  filter_by_file: "yarn test -- {file}"    # Pattern to run tests for a specific file
  filter_by_name: "yarn test -- -t '{name}'"  # Pattern to run tests matching a name
  init_command: null            # Pre-test setup command (e.g., "docker compose up -d")

lint:
  command: "yarn lint"          # Command to run the linter

framework: "next.js"           # Detected framework name
detected_from:                  # Source files used for detection
  - "package.json"
  - "next.config.js"
detected_at: "2026-02-18T14:30:00Z"  # ISO timestamp of detection
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dev_server.command` | string | Yes | Shell command to start the dev server |
| `dev_server.url` | string | Yes | Base URL where the dev server is accessible |
| `dev_server.hmr` | boolean | Yes | Whether HMR is supported (affects agent refresh strategy) |
| `build.command` | string | Yes | Shell command to build the project |
| `test.runner` | string\|null | No | Test runner name: `vitest`, `jest`, `mocha`, or `null` if no tests |
| `test.command` | string\|null | No | Shell command to run all tests |
| `test.filter_by_file` | string\|null | No | Command pattern with `{file}` placeholder for file-specific tests |
| `test.filter_by_name` | string\|null | No | Command pattern with `{name}` placeholder for name-filtered tests |
| `test.init_command` | string\|null | No | Setup command before tests (e.g., start database container) |
| `lint.command` | string\|null | No | Shell command to run the linter |
| `framework` | string\|null | No | Detected framework name (e.g., `next.js`, `vue`, `angular`, `svelte`, `react`) |
| `detected_from` | string[] | Yes | List of source files that were used for detection |
| `detected_at` | string | Yes | ISO 8601 timestamp of when detection was performed |

## Detection Sources

The `fixme-tools.cjs context detect` command auto-detects project context from these sources, in order of priority:

| Source | Fields Detected | Priority |
|--------|-----------------|----------|
| `package.json` (`scripts`) | `dev_server.command`, `build.command`, `test.command`, `lint.command` | 1 (primary) |
| `package.json` (`dependencies`, `devDependencies`) | `framework`, `test.runner` | 1 |
| `vite.config.ts` / `vite.config.js` | `dev_server.hmr` (true), dev server port | 2 |
| `next.config.js` / `next.config.mjs` | `dev_server.hmr` (true), framework confirmation | 2 |
| `webpack.config.js` | `dev_server.hmr` (depends on config) | 2 |
| `.env` / `.env.local` | `dev_server.url` (PORT variable) | 3 |
| `tsconfig.json` / `jsconfig.json` | Framework hints (jsx settings) | 4 (supplementary) |

### Detection Logic

1. **Dev server command:** If `package.json` has a `dev` script, use `yarn dev` (or `npm run dev` based on lockfile).
2. **Dev server URL:** Default `http://localhost:3000`. Override if PORT found in `.env`.
3. **HMR:** True if Vite or Next.js config file exists. These frameworks have HMR by default.
4. **Build command:** From `package.json` `build` script.
5. **Test runner:** Detect from devDependencies: `vitest` > `jest` > `mocha`.
6. **Test command:** From `package.json` `test` script.
7. **Test filter patterns:** Inferred from runner (e.g., vitest uses `-- {file}`, jest uses `-- --testPathPattern {file}`).
8. **Lint command:** From `package.json` `lint` script.
9. **Framework:** Detected from dependencies: `next` -> `next.js`, `nuxt` -> `nuxt`, `@angular/core` -> `angular`, `svelte`/`@sveltejs/kit` -> `svelte`, `vue` -> `vue`, `react` -> `react`.

## Lifecycle

### First Run (No Existing Context)

1. `fixme-tools.cjs context detect` scans the project and produces a YAML config.
2. The orchestrator presents the detected config to the user for review.
3. The user confirms or provides corrections.
4. `fixme-tools.cjs context save` writes the confirmed config to `.fixme/project-context.yaml`.

### Subsequent Runs

1. `fixme-tools.cjs context load` reads `.fixme/project-context.yaml`.
2. The config is used silently. No prompt to the user.

### Agent Corrections

If an agent discovers the project context is wrong during operation (e.g., the dev server runs on port 5173, not 3000):

1. The agent proposes an update to the orchestrator.
2. The orchestrator presents the proposed change to the user.
3. The user confirms or rejects.
4. If confirmed, `fixme-tools.cjs context save` writes the updated config.

**No silent writes.** The project context is never modified without user confirmation. This prevents agents from accidentally corrupting the config.

## Example: Next.js Project

```yaml
dev_server:
  command: "yarn dev"
  url: "http://localhost:3000"
  hmr: true
build:
  command: "yarn build"
test:
  runner: "jest"
  command: "yarn test"
  filter_by_file: "yarn test -- --testPathPattern {file}"
  filter_by_name: "yarn test -- -t '{name}'"
  init_command: null
lint:
  command: "yarn lint"
framework: "next.js"
detected_from:
  - "package.json"
  - "next.config.js"
detected_at: "2026-02-18T14:30:00Z"
```

## Example: Vite + React Project

```yaml
dev_server:
  command: "yarn dev"
  url: "http://localhost:5173"
  hmr: true
build:
  command: "yarn build"
test:
  runner: "vitest"
  command: "yarn test"
  filter_by_file: "yarn test -- {file}"
  filter_by_name: "yarn test -- -t '{name}'"
  init_command: null
lint:
  command: "yarn lint"
framework: "react"
detected_from:
  - "package.json"
  - "vite.config.ts"
detected_at: "2026-02-18T15:00:00Z"
```
