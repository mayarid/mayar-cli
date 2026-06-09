# Phase 15 — Coverage: unit-testing-suite

**Feature:** unit-testing-suite
**Work type:** MEDIUM
**Runner:** `node --test --experimental-test-coverage` (Node v24.16.0, zero-dependency)
**Configured threshold:** `testing.coverage_threshold = 80`
**Date:** 2026-06-09
**Verdict:** ⚠️ Threshold **NOT met** — gap is **intentional, documented, and accepted** (see §3 of `13-test-plan.md`, §4 of `14-testing.md`). This phase measures and certifies the number; it does not change scope.

---

## 1. Measurement method

Node's coverage tool only instruments modules **actually loaded** during the run.
The real test suite loads `util`, `cli` (`parseFlags`), `config`, and `ui` — so the
default report shows only those four and an aggregate of **44.21% line**.

To report an **honest whole-project** figure, coverage was re-measured with a temporary
probe test that `require()`s every `src/**` module (probe removed afterward; not committed).
This adds `api.js` and all 13 `commands/*` modules to the denominator at their true (~0%
function) coverage.

## 2. Whole-project coverage (all 17 source files)

```
file             | line % | branch % | funcs % | uncovered lines
-----------------------------------------------------------------
src/api.js       |  17.39 |  100.00  |   0.00  | 7-44
src/cli.js       |  18.59 |  100.00  |  25.00  | 7-80 109-127 129-197
src/config.js    | 100.00 |   73.33  | 100.00  | —
src/ui.js        |  51.92 |   94.74  |  75.00  | 23-26 28-33 35-74
src/util.js      | 100.00 |  100.00  | 100.00  | —
commands/apikey  |  22.73 |  100.00  |   0.00  | 4-20
commands/balance |  37.50 |  100.00  |   0.00  | 5-14
commands/customer|  14.29 |  100.00  |   0.00  | 7-54
commands/init    |  20.00 |  100.00  |   0.00  | 4-23
commands/invoice |  14.55 |  100.00  |   0.00  | 7-53
commands/payment |  16.33 |  100.00  |   0.00  | 7-47
commands/product |  12.33 |  100.00  |   0.00  | 7-21 23-71
commands/qrcode  |  31.58 |  100.00  |   0.00  | 5-17
commands/review  |  21.43 |  100.00  |   0.00  | 7-11 13-40
commands/txn     |  15.63 |  100.00  |   0.00  | 7-11 13-25 27-62
commands/webhook |  18.60 |  100.00  |   0.00  | 7-41
commands/whoami  |  10.94 |  100.00  |   0.00  | 4-15 17-21 23-62
-----------------------------------------------------------------
ALL FILES        |  27.78 |   94.79  |  40.48  |
```

| Metric | Whole-project | Loaded-modules view | Threshold | Met? |
|---|---|---|---|---|
| Line %   | **27.78** | 44.21 | 80 | ❌ |
| Branch % | **94.79** | 93.98 | 80 | ✅ |
| Funcs %  | **40.48** | 73.91 | 80 | ❌ |

## 3. What IS fully covered (the targeted first-pass scope)

These pure / near-pure modules were the deliberate target — high signal, mock-free, zero flakiness:

- **`src/util.js` — 100% line / 100% branch / 100% funcs** (`checkResp`, `readData`, `maybeJson`)
- **`src/config.js` — 100% line / 100% funcs** (round-trip + legacy XDG/HOME migration); the
  26.67% uncovered branch is defensive fallbacks (e.g. missing-env edge paths) that can't be
  hit without faking process internals.
- **`src/cli.js` `parseFlags` — exhaustively covered**; the 18.59% file line figure is dominated
  by the uncovered `run()` dispatch + command table (lines 7-80, 109-197), not `parseFlags`.
- **`src/ui.js` — `table()` + color wrappers 100%** in non-TTY; uncovered 23-74 are the
  interactive `ask`/`askSecret`/`ensureKey` raw-stdin + `process.exit` paths.

Branch coverage across the project is **94.79%** — the tested code is thoroughly exercised;
the line/func gap is **breadth** (untested modules), not **depth** (weak tests).

## 4. What is uncovered, and why (by design)

| Area | Lines | Why deferred |
|---|---|---|
| `src/api.js` HTTP layer | 7-44 | Needs a live transport or injectable `https`; covered honestly only via local-server integration tests (helper already built — see §5). |
| `src/commands/*` (13 files) | bodies | Each wires `api` + `ui` together with no DI seam; honest coverage needs a behavior-preserving refactor to inject fakes. Forcing it now = brittle `require.cache` surgery asserting "mock was called", not real behavior. |
| `cli.run()` dispatch | 7-80,109-197 | Top-level command routing + interactive `ensureKey`/`process.exit`. |
| `ui.ask*` / `ensureKey` | 23-74 | Drive raw stdin and call `process.exit`; need core extraction or a child-process harness. |

**Decision (carried from Phases 13–14, re-affirmed here):** the suite optimizes for *honest,
durable* coverage of testable-without-mocks code over a green threshold number. The 80 target
is retained as the documented goal for the next layers.

## 5. Path to close the gap (ROI order — unchanged from progress.txt)

1. **Command-level tests via a DI seam** — biggest lever (13 modules → ~0% today). Export
   commands as factories taking `{api, ui}` (behavior-preserving refactor), then run against fakes.
2. **Local HTTP integration** — `test/helpers.js startServer()` (port 0) already exists; point
   `MAYAR_API_URL` at it **before** `require('../src/api')` (BASE_URL freezes at load) to exercise
   `request` + `checkResp` end-to-end with no external network.
3. **Interactive paths** — extract testable cores of `ensureKey`/`ask`/`askSecret` or use a
   child-process harness feeding stdin and asserting exit codes. Lowest ROI, do last.

## 6. Verdict

- Suite: **70 tests, 0 fail, deterministic** (Phase 14 confirmed).
- Coverage: **line 27.78% / branch 94.79% / funcs 40.48%** (whole project).
- Against `coverage_threshold = 80`: **line & funcs do NOT meet it; branch does.**
- Status: this is the **accepted, pre-documented** outcome of a pure-function first pass —
  not a regression or a missed criterion. Threshold remains the target for the follow-up
  layers in §5. Phase 15 = measured, certified, and documented.
