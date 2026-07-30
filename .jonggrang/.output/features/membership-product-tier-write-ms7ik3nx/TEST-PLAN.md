# Test Plan — membership product & tier write/get

Feature: `membership-product-tier-write-ms7ik3nx`
Phase: 13 (test-planning)
Scope: `membership product <create|get>` and `membership tier <create|get>` sub-namespaces in `src/commands/membership.js`, plus the `src/cli.js` usage/help line.

## 1. Test framework & harness

- Runner: built-in `node:test` + `node:assert/strict` (command: `node --test`). No new deps.
- Existing conventions (from `test/cli.test.js`): direct module import, `describe`/`test`, no test framework globals, pure/synchronous assertions where possible.
- `membership.run()` is `async` — thrown validation `Error`s surface as rejected promises; use `assert.rejects` with a validator function to pin the exact message (the strings contain regex-special `|()<>`, so equality beats `RegExp`). This pattern already exists as the `rejectsWith` helper.

## 2. What is already covered (commit 8e28129) — no action needed

Validation / routing error paths (throw BEFORE any network call, `apiKey` is a dummy):
- `product create` with no `--data` → required-data error
- `product get` with no id → usage error
- unknown `product` sub-action → `<create|get>` usage error
- `tier create` with no `--data` → required-data error
- `tier get` with no id → usage error
- `tier get` with id but no `--productId` → productId error
- unknown `tier` sub-action → `<create|get>` usage error

Supporting units already covered elsewhere: `parseFlags`, `checkResp`, `readData`, `maybeJson`.

## 3. Coverage gaps (the actual test work)

The routing tests never reach `api.request`, so the **happy-path dispatch is untested**: which HTTP method, path, body, and query each sub-command sends. This is the highest-value gap because the endpoint paths are a fixed build contract (see the ENDPOINT CONTRACT comment in `membership.js`) and a typo in a path/query would ship silently.

### Mocking strategy
`membership.js` invokes `api.request(...)` on the required module object (line 1: `const api = require('../api')`; line 195 exports `run`). Tests can override `require('../api').request` with a stub that records `{ method, pathname, opts }` and returns a canned `{ status: 200, body: {...}, raw: '...' }`. Restore the original in a `finally` / after each case. No dependency injection or network needed.

Note: `checkResp` runs on the mock response and `ui.jsonOut(res.body)` writes to stdout — stub returns a 2xx so `checkResp` passes; stdout write is harmless (or capture `process.stdout.write` if asserting output is desired, but that is out of scope).

### Happy-path cases to add
1. `product create --data '{...}'` → asserts `POST`, path `/hl/v2/memberships/products/create`, `body` equals the parsed `--data`, `apiKey` forwarded.
2. `product get <productId>` → asserts `GET`, path `/hl/v2/memberships/products/<productId>`, productId `encodeURIComponent`-encoded (test with an id containing a special char, e.g. `a/b` or a space).
3. `tier create --data '{...}'` → asserts `POST`, path `/hl/v2/memberships/tiers/create`, `body` equals parsed `--data`.
4. `tier get <tierId> --productId <id>` → asserts `GET`, path `/hl/v2/memberships/tiers/<tierId>` (encoded), `query: { productId }` forwarded.

### Edge cases
5. `product create --data '@file'` path — readData reads/parses a file. Covered indirectly by `readData` unit tests; optional to re-assert here.
6. `product create --data '<malformed json>'` → propagates `readData`'s JSON parse error (not swallowed). Optional — already exercised by `readData` unit tests.
7. Non-2xx API response → `checkResp` throws `API <status> — <msg>`. Covered by existing `checkResp` unit tests; a single integration-style assertion through `run()` (mock returns `{status: 404}`) is nice-to-have, not required.

### CLI wiring (light)
8. Regression guard that `membership` dispatch reaches the `product`/`tier` cases — already implicitly covered by the routing tests (they call `membership.run` with those positionals). The `src/cli.js` help-text line is documentation only; no assertion needed beyond it existing.

## 4. Prioritization

| Priority | Cases | Rationale |
|----------|-------|-----------|
| P0 (must) | 1–4 happy-path dispatch | Verifies the fixed endpoint contract (path/method/body/query) — the only currently-untested behaviour of the feature. |
| P1 (should) | encodeURIComponent on ids (2, 4) | Guards URL injection / breakage on special-char ids. Fold into P0 cases by choosing special-char ids. |
| P2 (optional) | 5–7 error propagation through run() | Underlying units already covered; low marginal value. |

## 5. Exit criteria

- `node --test` green (currently 77 pass / 0 fail).
- P0 cases 1–4 added and passing; the api.request mock is installed and torn down per case (no leak across tests).
- No network access during the suite (verified by the mock recording calls instead of dispatching).

## 6. Out of scope

- `src/api.js` real HTTP behaviour (would require an HTTP server/nock — not warranted for this feature; the module is unchanged).
- Backend implementation of the four Headless v2 endpoints (separate service `api-custom-paymenlink`).
- Snapshot/golden tests of `ui.jsonOut` formatting.
