---
feature: unit-testing-suite
branch: feat/unit-testing-suite
work_type: MEDIUM
description: Stand up a zero-dependency unit-test suite using the built-in node:test runner
created_at: 2026-06-09T08:14:33.125Z
depth: deep
---

# Plan: Unit Testing Suite

## Approach
Establish a unit-test suite from scratch using Node's built-in `node:test` runner and `node:assert/strict`, preserving the project's zero-dependency guarantee. Tests live in a top-level `test/` directory mirroring `src/`, with a small `test/helpers.js` for stdout capture, temp `XDG_CONFIG_HOME` isolation, and an optional local HTTP server. The first pass targets pure/near-pure functions (`util.*`, `cli.parseFlags`, `config` round-trip, `ui.table`) for reliable, mock-free coverage. One minimal enabling change is required: export `parseFlags` from `src/cli.js`.

## Phases
1. Infrastructure setup — Create `test/` directory; add `"test": "node --test"` and `"test:coverage": "node --test --experimental-test-coverage"` to `package.json`; write `test/helpers.js` (stdout capture, temp `XDG_CONFIG_HOME`, optional local `http` server).
2. Enable testability — Export `parseFlags` from `src/cli.js` (minimal, additive change; keep `ensureKey` private to avoid `process.exit`/stdin coupling).
3. Util tests — `test/util.test.js` covering `checkResp` (2xx pass / non-2xx throw with `.status`/`.body`), `readData`, `maybeJson`.
4. CLI parse tests — `test/cli.test.js` exhaustively exercising `parseFlags` (long/short flags, `--key=value`, boolean flags, positionals, mixed order).
5. Config & UI tests — `test/config.test.js` round-trip (load/save/clear, legacy migration) under a temp `XDG_CONFIG_HOME` set before require; `test/ui.test.js` asserting `table()` and color wrappers produce plain output in non-TTY mode.
6. Wire-up & docs — Update the pre-commit hook to run the new test command; record coverage reality and follow-up options (command mocking / integration) in `.jonggrang/progress.txt`.

## Key Decisions
- Decision: Use built-in `node:test` + `node:assert/strict`, no test framework — preserves the zero-dependency guarantee; the built-in runner needs nothing installed.
- Decision: Place tests in a top-level `test/` directory mirroring `src/` — no co-location precedent exists, and `test/` is already excluded from the published `files` array.
- Decision: Export `parseFlags` from `src/cli.js`; do not export/unit-test `ensureKey` or `ui.askSecret` — they call `process.exit` and manipulate raw stdin, making them unsafe to unit-test directly.
- Decision: Isolate filesystem/env side effects by setting `XDG_CONFIG_HOME` (and `MAYAR_API_URL` if used) before requiring the module under test, since `config.js`/`api.js` compute paths and `BASE_URL` at load time.
- Decision: Scope the first pass to pure/near-pure functions and explicitly accept that the 80% `coverage_threshold` will not be met yet — document the gap rather than introduce brittle CommonJS mocking now.
- Decision: Only modify files within the task's `files` array; the plan lists `package.json` and `src/cli.js` so the enabling edits are in scope.

## Affected Areas
New files:
- `test/helpers.js` — stdout capture, temp `XDG_CONFIG_HOME`, optional local `http` server.
- `test/util.test.js` — tests for `src/util.js` (`checkResp`, `readData`, `maybeJson`).
- `test/cli.test.js` — tests for `parseFlags` in `src/cli.js`.
- `test/config.test.js` — round-trip tests for `src/config.js` (`load`/`save`/`clear`, legacy migration).
- `test/ui.test.js` — tests for `src/ui.js` `table()` and color wrappers (non-TTY).

Edited files:
- `src/cli.js` — export `parseFlags` (additive, keeps `ensureKey` private).
- `package.json` — add `test` and `test:coverage` scripts.
- Pre-commit hook — update to run the new test command.

## Risks
- Risk: Adding a test framework would break the zero-dependency promise. Mitigation: use only the built-in `node:test`/`node:assert`; no runtime or dev deps.
- Risk: `config.js` writes to the real home dir and could clobber a developer's config. Mitigation: set a temp `XDG_CONFIG_HOME` before requiring the module.
- Risk: `config.js`/`api.js` compute paths and `BASE_URL` at module load, so late env changes have no effect. Mitigation: set env vars before `require`.
- Risk: CommonJS has no DI for `api`/`ui`, making command-level tests brittle. Mitigation: restrict first pass to pure functions; defer command tests.
- Risk: The configured 80% coverage threshold won't be met by pure-function tests alone. Mitigation: document the gap and list follow-up layers rather than force brittle mocks.
- Risk: Interactive/`process.exit` paths (`ensureKey`, `ui.ask`, `ui.askSecret`) are unsafe to unit-test. Mitigation: leave them out of scope.

## Alternatives Considered
- Option 2 (Full coverage with module mocking): Rejected for the first pass — CommonJS has no DI, so mocks rely on brittle `require.cache` surgery or monkey-patching; large maintenance surface and risk of false confidence, with edits likely spilling beyond the task's `files` array.
- Option 3 (Local HTTP integration tests): Rejected as the foundation — slower and flakier than pure tests, more setup/teardown, lower ROI as a first pass, and doesn't move command coverage much. Valid as a later layer.

## Out of Scope
- Command-level tests for `src/commands/*` (requires `api`/`ui` mocking — deferred).
- Integration tests hitting a local HTTP server via `MAYAR_API_URL` (valid follow-up, not the foundation).
- Migrating the codebase to TypeScript or adding any TS tooling.
- Adding any runtime or dev dependency (jest/vitest/mocha).
- Achieving the full 80% coverage threshold on this pass.
- Testing interactive/`process.exit` paths (`ensureKey`, `ui.ask`, `ui.askSecret`).
- Refactoring source for dependency injection or otherwise changing runtime behavior.

## Dependencies
Builds on the existing CommonJS module structure (`require`/`module.exports`) and these patterns from discovery: env-driven config isolation via `XDG_CONFIG_HOME` (config path computed at load in `src/config.js`); `MAYAR_API_URL`/`BASE_URL` override in `src/api.js`; the pure helpers in `src/util.js` (`checkResp`, `readData`, `maybeJson`); `parseFlags` in `src/cli.js`; and `ui.table`/color wrappers in `src/ui.js`. Uses Node v24.16.0's built-in `node:test` runner and `node:assert/strict` (no installs). The published `package.json` `files` array already excludes `test/`.
