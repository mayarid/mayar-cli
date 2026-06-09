# Phase 16 — Test Quality: unit-testing-suite

**Feature:** unit-testing-suite
**Work type:** MEDIUM
**Phase purpose:** No low-value tests, correct assertions
**Runner:** `node --test` (`node:test` + `node:assert/strict`, zero-dependency)
**Date:** 2026-06-09
**Verdict:** ✅ PASS — every test is high-signal; all assertions verified correct against source.

This is a **quality gate**, not a test-writing pass. No tests were added or changed. Each
of the 70 tests was read and cross-checked against the module it exercises.

---

## 1. Suite snapshot

```
$ node --test
ℹ tests 70   ℹ suites 15   ℹ pass 70   ℹ fail 0   ℹ skipped 0   ℹ todo 0
```

| Suite | Target | Tests |
|---|---|---|
| `test/util.test.js` | `checkResp` / `readData` / `maybeJson` | 19 |
| `test/cli.test.js` | `parseFlags` (exhaustive) | 20 |
| `test/config.test.js` | load/save/clear round-trip + legacy migration | 12 |
| `test/ui.test.js` | `table()` + color wrappers (non-TTY) | 15 |

## 2. Assertion-correctness audit (test ↔ source)

Every assertion checks **observable behavior**, and each was confirmed against the source:

| Test claim | Source (`src/…`) | Verdict |
|---|---|---|
| `checkResp` passes through 200–299, throws <200 and ≥300 | `util.js:5` `status >= 200 && status < 300` | ✅ exact |
| error carries `.status` / `.body`; `messages` preferred over `message`; falls back to `raw` then `''` | `util.js:6-9` `(body.messages \|\| body.message) \|\| raw \|\| ''` | ✅ exact (incl. `'API 500 — '` empty-msg case) |
| `readData` falsy→undefined, `@file`→read+parse, inline→parse, throws on bad JSON | `util.js:13-19` | ✅ exact |
| `maybeJson` json→writes `JSON.stringify(b,null,2)+'\n'`+true; fn fallback→called+true; none→false; non-fn→false | `util.js:22-31` + `ui.jsonOut` `ui.js:76-78` | ✅ exact |
| `parseFlags` `--k v`, `--k=v` (first `=` splits, empty preserved), booleans, `-h/-v`, unknown short→positional, `--` terminator, last-wins | `src/cli.js` `parseFlags` | ✅ exact — tests assert *real* behavior, not the task's generic flag taxonomy |
| `config` paths under temp XDG; round-trip; pretty 2-space; `clear()` true/false; malformed→null | `config.js:24-41` | ✅ exact |
| legacy `~/.mayar`→XDG migration; existing XDG wins (no migration) | `config.js:12-22` | ✅ exact |
| `table()` `(no rows)`; width = `min(48,max(header,cells))`; 2-space gutter; truncate to 47+`…`; `0` kept, null/undefined/missing→`''`; non-TTY = no ANSI | `ui.js:80-99`, `wrap` `ui.js:4` | ✅ exact |

No assertion is tautological (no `assert.ok(true)`, no `expect(mock).toHaveBeenCalled()`-style
mock-echo). Object equality uses `deepEqual`; string output uses exact `equal`, not loose
`match` where an exact value is knowable.

## 3. Low-value-test scan

Scanned for the usual smells — none material:

- **Mock-assertion theatre** (assert a stub was called instead of real behavior): **none** —
  the suite is mock-free by design; `maybeJson`'s stdout side effect is *captured*, not stubbed.
- **Trivial/always-true** asserts: **none**.
- **Redundant duplicates**: none meaningful. Two structural guards are intentional and cheap:
  - `ui.test.js` "non-TTY precondition" — asserts the runner's `stdout.isTTY` is falsy so the
    gated color/layout assertions are known to actually run (not silently skipped). Guard, kept.
  - `ui.test.js` "every wrapper is exported as a function" — runs **unconditionally**, so the
    export surface is still checked on the rare TTY run where the passthrough tests `skip`. Kept.
- **Over-broad** asserts (`doesNotThrow` with no value check): the one use (`checkResp` 2xx sweep)
  is paired with explicit `equal(...)===undefined` and throw-side tests, so it adds a loop over
  the range without weakening precision. Acceptable.

## 4. Test-design quality notes

- **Determinism:** no clocks, no randomness, no network; `readData` `@file` and `config` use
  real temp dirs (`mkdtempSync`) with `finally`/`after` cleanup. 3× repeat = `70/0/0` (Phase 14).
- **Isolation correctness:** `config.test.js` sets `XDG_CONFIG_HOME` **and** `HOME` to temp dirs
  *before* `require('../src/config')` — matching the module's load-time path freeze (`config.js:5,9`).
  Confirmed no real `~/.config/mayar` or `~/.mayar` is touched (Phase 14 §2).
- **Edge coverage is real, not padded:** zero-vs-nullish, empty inline value, `=`-in-value,
  flag-override-last-wins, 48-col truncation boundary — each maps to a distinct source branch.

## 5. Verdict

**PASS.** The suite contains **no low-value tests**; **all assertions are correct** and were
verified line-by-line against `src/util.js`, `src/cli.js`, `src/config.js`, and `src/ui.js`.
Tests assert behavior (values, output, side effects), are deterministic and mock-free, and
exercise genuine edge branches. Ready for Phase 17 (completion).
