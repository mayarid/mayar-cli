---
feature_id: membership-product-tier-write-ms7ik3nx
feature_name: membership-product-tier-write-ms7ik3nx
tags: [membership, cli, headless-v2, product-tier, dispatch-routing]
updated_at: 2026-07-30T13:02:00.448Z
---

## Context
Adds CLI write/get support for membership **products** and **tiers** to `mayar-cli`, wrapping four fixed Headless v2 endpoints that have no public REST equivalent. The feature is a thin CLI over the rich Headless v2 wrapper contract; it exposes new singular `product` and `tier` sub-namespaces under `membership`. Full feature folder: [membership-product-tier-write-ms7ik3nx](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/). Raw learnings: [progress](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/progress.txt).

## Facts
The fixed 4-endpoint contract, locked verbatim in-code near the `USAGE` constant in `src/commands/membership.js` ([task-001](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/jonggrang-tasks.json)):
1. **POST** `/hl/v2/memberships/products/create` — body `{name, description, redirectUrl?, coverImage?, hidePortalAccessInEmails?, membershipInfo:{showMembers, type, creditValue?, enableCreditTopup?, isAccumulateCredit?, isAccumulateTopupCredit?, minCreditTopup?, maxCreditTopup?}}`.
2. **GET** `/hl/v2/memberships/products/:productId`.
3. **POST** `/hl/v2/memberships/tiers/create` — body `{productId, name, description, notes?, limit?, upfrontFee?, finishMembershipAt?, gracePeriodInDays?, trialPeriodInDays?, trialCredit?, isTrialAvailable?, redirectUrl?, periods:[{monthPeriod?, amount?, credit?, isLifetime?, status?}]}`.
4. **GET** `/hl/v2/memberships/tiers/:tierId?productId=...`.

Dispatch facts:
- Existing switch cases: `members`, `tiers` (plural = tier LIST), `register`, `get`/`detail`, `update`, `cancel`, `create-invoice`/`createinvoice`/`invoice`. There is **NO** bare `create` case — creates are per-resource.
- New singular keys `product` and `tier` do NOT collide with any existing case.
- **Positional layout for the new sub-namespaces:** `rest[0]`=action, `rest[1]`=id. This DIFFERS from the flat member cases (`register`/`get`/`cancel`) where `rest[0]` is the id.
- The only shape difference between the two new sub-namespaces: **tier get requires `--productId`** (query scope, mirroring the plural tier-list scoping); **product get does NOT** (takes just `<productId>`).
- Endpoints do not exist yet — they ship in `api-custom-paymenlink`; the CLI cannot run end-to-end until then.
- Validation for this repo = `node --test` (`npm test` just runs it) plus `node -c` syntax checks; there is no configured tsc/lint. `readData(undefined)` returns `undefined` (falsy guard in `util.js`).

## What Done & Why
- **task-001** — Locked the contract as an in-code comment block near `USAGE` in `src/commands/membership.js`, listing all four endpoints + bodies verbatim and documenting that `product`/`tier` are new dispatch keys. Comment-only, no behavior change; done so later tasks build against exact paths/bodies rather than inferring REST. ([task-001](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/jonggrang-tasks.json))
- **task-002** — Added the `product` sub-namespace: a `product` switch case nesting a second switch on `rest[0]`. `create` = `readData(flags.data)` → POST `products/create` → `checkResp` → `ui.jsonOut`; `get` = `rest[1]` productId → GET `products/:productId`. Unknown action throws `Usage: mayar membership product <create|get>`. Updated top `USAGE` to advertise `product|tier`. Exposes the wrapper contract through the CLI's dispatch pattern. ([task-002](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/jonggrang-tasks.json))
- **task-003** — Added the singular `tier` sub-namespace mirroring product's nested-switch. `create` → POST `tiers/create`; `get` = `rest[1]` tierId, requires `--productId`, GET `tiers/:tierId?productId=`. Unknown action throws `Usage: mayar membership tier <create|get>`. Plural `tiers` LIST case left untouched (still GETs `/hl/v2/memberships/tiers`). Completes the fixed 4-endpoint contract. ([task-003](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/jonggrang-tasks.json))
- **task-004** — Documented the four new commands across three surfaces, each in its own local style: `src/cli.js` Memberships help block (bare grammar), `README.md` Memberships list (column-aligned `--flag` annotations), `SKILL.md` Memberships block (`npx -y mayar@latest membership ...` examples). Required-flag accuracy: `--data` on both creates, `--productId` on tier get only. Keeps all documented surfaces in sync with the dispatch. ([task-004](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/jonggrang-tasks.json))
- **task-005** — Added two `describe` blocks to `test/cli.test.js` covering the 7 usage/error paths (product create no `--data`, product get no id, unknown product action; tier create no `--data`, tier get no id, tier get id-but-no-`--productId`, unknown tier action). Each asserts the exact thrown `Error` message. Locks the dispatch/validation contract. `node --test` / `npm test` green: 77 tests (7 new), 0 fail. ([task-005](.jonggrang/.output/features/membership-product-tier-write-ms7ik3nx/jonggrang-tasks.json))

## Lessons Learned
- **`tier` (singular, create/get) vs `tiers` (plural, list)** — two distinct switch keys; never merge them. Watch this collision when editing.
- **Positional layout** for the new sub-namespaces is `rest[0]`=action, `rest[1]`=id — differs from flat member cases where `rest[0]` is the id (the extra sub-namespace level shifts everything).
- **Only shape difference** between the sub-namespaces: tier get needs `--productId` (query scope); product get does not.
- **Every new usage/error path throws BEFORE `api.request`** — tests need no live API, no network stub, no HTTP harness. Just call `membership.run()` and assert on the rejected promise.
- `membership.run()` is async → thrown Errors surface as **rejected promises**. Use `assert.rejects(promise, validatorFn)` with `assert.equal(err.message, ...)`; messages contain regex-special chars `|()<>` so exact equality beats a RegExp matcher. Tests pass positional arrays mirroring `parseFlags` output, e.g. `['tier','get','tier-123']`.
- `readData(undefined)` returns `undefined` (falsy guard in `util.js`), so a missing `--data` on create throws the required-data error before any POST.
- **`src/cli.js` help is a template literal** — validate edits with `node -c` (a stray backtick/`${}` breaks it), unlike plain-markdown README/SKILL.
- **Three doc surfaces each have their own style** (cli.js = bare grammar, README = column-aligned `--flag` annotations, SKILL = `npx -y mayar@latest ...`): match neighbor entries rather than imposing one uniform format.
- No real test/lint suite: validation = `node -c` + module-load (exports stay `{run}`) + a stubbed-network smoke harness (stub `api.request`/`ui.jsonOut`, assert paths/bodies/queries and error throws pre-network); `npm test` is `node --test`.

## Open Questions / What Next
- Contract fully implemented (product create/get + tier create/get). CLI cannot run end-to-end until the `api-custom-paymenlink` Headless v2 wrapper endpoints exist — integration/e2e is out of scope until then.
- If update/delete for products or tiers ships later, extend the same three doc surfaces the same way and follow the existing nested-switch + positional layout.

## Promotion Candidates
- **`tier` vs `tiers` distinction** and the **`rest[0]`=action / `rest[1]`=id** positional layout for sub-namespaces — reusable dispatch conventions for future nested `membership` (or similar) commands.
- **Pre-network error paths → no-network tests** pattern: async `run()` + `assert.rejects` with exact-message validators is the repo's standard for CLI dispatch/validation coverage.
- **Multi-surface doc sync** (cli.js template literal + README + SKILL, each in local style, validated with `node -c` for the template literal) as the standard when adding user-facing commands.
