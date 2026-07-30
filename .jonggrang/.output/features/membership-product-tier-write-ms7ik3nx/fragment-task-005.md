# Fragment — task-005: Tests for membership product/tier sub-command routing

## What Done
Added two `describe` blocks to `test/cli.test.js` covering all seven usage/error
paths of the new `membership product <create|get>` and `membership tier
<create|get>` sub-namespaces: product create with no `--data`, product get with
no id, unknown product action; tier create with no `--data`, tier get with no id,
tier get with id but no `--productId`, and unknown tier action. Each asserts on
the exact thrown `Error` message. Validation (`node --test` / `npm test`) green:
77 tests, 0 fail (7 new).

## Why
Final tests-and-validation phase of the feature. Locks the dispatch/validation
contract so future edits to `membership.js` cannot silently change the CLI's
error surface.

## Tradeoffs
None. Every tested path throws before `api.request`, so no live API, no network
stub, no HTTP harness needed — just call `membership.run()` and assert on the
rejected promise.

## What Next
Feature CLI work is complete pending the backend wrapper endpoints in
`api-custom-paymenlink` (out of scope). No further CLI tasks queued.

## Lessons / Promotion Candidates
- `membership.run()` is async → thrown Errors surface as rejected promises. Use
  `assert.rejects(promise, validatorFn)` with `assert.equal(err.message, ...)`;
  the messages contain regex-special chars `|()<>` so exact equality beats a
  RegExp matcher.
- Positional layout for these sub-namespaces: `rest[0]`=action, `rest[1]`=id —
  differs from flat member cases where `rest[0]` is the id. Tests pass positional
  arrays mirroring `parseFlags` output, e.g. `['tier','get','tier-123']`.
- `readData(undefined)` returns `undefined` (falsy guard in util.js), so a
  missing `--data` on create throws the required-data error before any POST.
- No tsc/lint configured beyond `node --test`; `npm test` just runs `node --test`.
