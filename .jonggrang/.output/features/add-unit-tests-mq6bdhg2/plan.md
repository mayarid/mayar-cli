---
feature: add-unit-tests
branch: feat/add-unit-tests
work_type: MEDIUM
description: Add a zero-dependency unit test foundation using node:test, covering pure helpers first
created_at: 2026-06-09T07:23:16.800Z
depth: deep
---

# Plan: Add Unit Tests

## Approach
Establish the project's first test foundation using Node's built-in `node:test` + `node:assert` runner (`node --test`), the only approach that preserves the project's zero-dependency invariant. Tests live in a top-level `test/` mirror of `src/` (kept out of the published `files` array). The committed first slice covers the highest-ROI pure-ish helpers — `util.checkResp/readData/maybeJson` and `parseFlags` — with `parseFlags` made testable via a single additive export from `src/cli.js`. Config and docs are wired to `node --test` so later command/config/ui tests can be added incrementally without rework.

## Phases
1. Test harness setup — add `"test": "node --test"` to `package.json` scripts; confirm `node --test` discovers `test/*.test.js`; keep tests out of the published `files` array.
2. Enable testability — add `parseFlags` to `module.exports` in `src/cli.js` (one-line additive change; `run` stays exported).
3. Core pure-function tests — `test/util.test.js` (`checkResp` happy/error with `.status`/`.body`, `readData`, `maybeJson`) and `test/cli.test.js` (`parseFlags`: `--`, `--api-key`/`=`, `--page`, `--data`, generic `--k v` / `--k=v`, positionals).
4. Config/doc wiring — update `.jonggrang/jonggrang.json` testing block (`framework`/`command`) and the `AGENTS.md` Testing section to reflect `node --test`; align `CLAUDE.md`/pre_commit references.
5. Validate & commit — run `node --test`, ensure green and deterministic, single atomic `test(...)` commit; log learnings in `.jonggrang/progress.txt`.
6. (Optional / follow-up) Extend to I/O seams — `config` (temp `XDG_CONFIG_HOME`), `ui` (stdout capture), representative commands (stub `api.request`) toward the 80 threshold.

## Key Decisions
- Decision: Use Node's built-in `node:test` + `node:assert` (`node --test`) — only option that preserves the zero-dependency invariant; no Jest/Vitest/Mocha.
- Decision: Place tests in a top-level `test/` mirror of `src/` rather than co-located `src/**/*.test.js` — the published `files` array lists `src` wholesale, so co-located tests would ship to npm.
- Decision: Export `parseFlags` from `src/cli.js` (additive) to make it unit-testable; do not refactor `run`.
- Decision: Set env (`XDG_CONFIG_HOME`, `MAYAR_API_URL`) before `require` and use `delete require.cache` where module-load-time reads matter; never touch the real `~/.config/mayar` or `api.mayar.id`.
- Decision: Avoid exercising `process.exit` paths (`cli.run`, `ui.askSecret`) directly; test pure helpers or stub `process.exit` if a `run()` path is later covered.
- Decision: Scope the first commit to pure-function coverage (util + parseFlags) + harness/doc wiring; treat 80% coverage as aspirational, not blocking.
- Decision: Commit with `test(...)` prefix, one atomic commit.

## Affected Areas
- `src/cli.js` — add `parseFlags` to `module.exports` (additive; `run` unchanged).
- `package.json` — add `"test": "node --test"` to `scripts`; `files` array stays `bin`/`src`/`README`/`LICENSE`.
- `test/util.test.js` (new) — covers `util.checkResp`, `readData`, `maybeJson`.
- `test/cli.test.js` (new) — covers `parseFlags` branching.
- `.jonggrang/jonggrang.json` — update testing block (`framework`, `command`).
- `AGENTS.md` — fill in Testing section to reflect `node --test`.
- `CLAUDE.md` / pre_commit hook — align test-command references.
- `.jonggrang/progress.txt` — log learnings.

## Risks
- Risk: Adding a test framework would break the zero-dependency promise — mitigated by using only built-in `node:test`/`node:assert`, no new packages.
- Risk: `parseFlags` is not exported, so it cannot be tested as-is — mitigated by a one-line additive export in `src/cli.js` that leaves `run` untouched.
- Risk: `config.js` and `api.js` read env (`XDG_CONFIG_HOME`, `MAYAR_API_URL`, package version) at module-load time — mitigated by setting env before `require` and using `delete require.cache` where needed; deferred to the optional follow-up phase.
- Risk: Side-effecting functions write to stdout/fs/network — mitigated by capturing `process.stdout.write`, using `os.tmpdir()` temp dirs, and stubbing `api.request`; the first slice avoids these by testing pure helpers.
- Risk: `process.exit` calls in `cli.run`/`ui.askSecret` could terminate the test process — mitigated by avoiding those paths in this slice (or stubbing `process.exit` if covered later).

## Alternatives Considered
- Option 2 (Broad coverage via I/O stubbing): also covers `config`, `ui`, and 2-3 commands by stubbing `api.request`/`process.stdout.write`/`XDG_CONFIG_HOME` — not chosen for the first commit because of higher effort, more flake surface (env-at-require-time, `require.cache`, `process.exit` paths), and a larger single commit; retained as the optional follow-up direction.
- Option 3 (Full suite incl. api.js network layer): adds testing `api.request` against a local server or `https` mock — not chosen because `api.js` hardcodes `https`, requiring TLS gymnastics or a refactor disproportionate to one 46-line file, expanding scope beyond "add unit tests."

## Out of Scope
- Adding any test/dev dependency (Jest, Vitest, Mocha, chai) — violates the zero-dependency promise.
- Testing `api.js` against real or mocked network/TLS in this slice (deferred; would need a small injection seam).
- CI setup (`ci.provider: none`) — not requested.
- Refactoring source logic, changing the module system, or adding TypeScript (scaffolding mislabels the stack; real code is plain CommonJS JS).
- Enforcing the 80% coverage threshold as a gate; `:coverage` script is optional.
- Including tests in the published npm package (`files` array stays `bin`/`src`/`README`/`LICENSE`).

## Dependencies
- Node's built-in `node:test` + `node:assert` runner (Node `>=18`; runtime here is v24.16.0) — no external packages.
- Existing I/O seams that make code testable: `api.request(method, pathname, opts)` in `src/api.js`, `config.*` in `src/config.js`, and `ui.*` in `src/ui.js`.
- The command contract `async function run(ctx)` with `ctx = { apiKey, flags, positional }` and `util.checkResp(res)` error semantics (`.status`/`.body`) — relied on for future command-level tests.
- Pure-function targets `src/util.js` and `parseFlags` in `src/cli.js` as the highest-ROI first slice.
