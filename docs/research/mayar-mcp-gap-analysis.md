# mayar-cli vs mayar-mcp: gap analysis

- **Date:** 2026-11-24
- **mayar-cli:** `5ca7c5e8885c6bfaf6cc2ebacf3f5be1dc92e52c` (branch `main`, version 1.2.0)
- **mayar-mcp:** `81607095f55099924b2d31d5d1ab478759a088aa` (branch `main`, cloned from https://github.com/mayarid/mayar-mcp)
- **Scope:** What mayar-mcp does well that mayar-cli lacks or does worse. Axes: endpoint coverage, auth, errors, validation, security, rate limits, tests, docs, release, packaging, config, other.
- **Citation format:** `path:line` is mayar-cli. `mayar-mcp/path:line` is mayar-mcp (commit above).
- **Method:** I read both source trees. I did not run, build or install mayar-mcp. I ran only `node --test --experimental-test-coverage` in mayar-cli (81 tests pass).
- **Dedupe:** I read the approved but not built plan `.jonggrang/.output/features/cli-security-hardening-msfsg6vk/plan.md`. Call it "the security plan". Gaps it covers are marked "covered by security-hardening plan, phase N".
- **Source quality note:** `mayar-mcp/docs/parity.md` is mayar-mcp's own QA notes. It is a secondary source. I used it only as a lead, and I label every claim that depends on it. I did not call the live Mayar API (no key), so all "live behavior" claims are **unverified**.
- **Mayar docs checked:** https://docs.mayar.id/api-reference-v2/migration-from-v1.md, https://docs.mayar.id/api-reference-v2/credit/balance.md, https://docs.mayar.id/api-reference-v2/customer/update.md, https://docs.mayar.id/api-reference-v2/reviews/merchantreviewstats.md, https://docs.mayar.id/llms.txt.

---

## 0. Live verification (added 2026-11-25)

The sandbox dashboard (web.mayar.io) was down, so no sandbox key was
available. The path drift (G03) was checked on production `api.mayar.id`
without changing data: GET calls with the saved key (which Mayar refused with
401), and POST calls with a deliberately fake key. Mayar checks the route
before the key, so **404 means the path does not exist** and **401 means it
exists**. Controls: `/hl/v2/this-path-does-not-exist` → 404,
`/hl/v2/invoices/create` → 401.

| CLI path (before 1.3.0) | Result | Correct path | Result |
|---|---|---|---|
| `GET /hl/v1/balance` (whoami) | timeout (30s) | `GET /hl/v2/balances` | 401 |
| `GET /hl/v2/merchants/reviews/stats` | 404 | `GET /hl/v2/reviews/stats` | 401 |
| `POST /hl/v2/invoices/{id}/close`, `/open` | 404 | `POST /hl/v2/products/{id}/close` | 401 |
| `POST /hl/v2/customers/update` | 404 | `POST /hl/v2/customers/{id}/update` | 401 |
| `/hl/v2/credit/...` (all 7) | 404 | `/credit/v2/credit/...` | 401, or HTTP 200 with `statusCode: 401` in the body |

The `credit` routes answer a bad key with HTTP 200 and `statusCode: 401` in the
body: a live example of a rejected response (G01). All five drifts are fixed in
1.3.0. Still unverified: `product list --stock` (needs a valid key) and sandbox
login on `auth.mayar.io` (needs the sandbox).

## 1. Executive summary

- mayar-mcp is built as a safe layer for an AI agent. It checks input before it sends anything. mayar-cli sends whatever the user types. The biggest difference is **input validation on money, dates and names** (G02).
- mayar-mcp treats an HTTP 200 with a failure body as an error. mayar-cli only checks the HTTP status, so it can print "success" and exit 0 on a failed call (G01).
- Several mayar-cli endpoint paths differ from the Mayar docs (credit, invoice close/reopen, customer update, whoami). The docs confirm the differences. Whether they fail live is unverified (G03).
- mayar-mcp has CI (typecheck, lint, tests, build dry-run) and a strict TypeScript setup. mayar-cli has no CI, no lint and no types (G05, G12).
- The security plan already covers: SSRF checks, output sanitizing, HTML warnings, throttle and 429 backoff, the 401 hint, and the sandbox domain. mayar-mcp lacks SSRF checks, sanitizing and 429 handling too, so the plan goes further than mayar-mcp there.
- mayar-mcp already moved sandbox to `api.mayar.io` and gives a 401 "wrong environment" hint. This confirms the plan's direction.
- The plan does **not** cover: request timeout, 200-with-failure bodies, pre-flight validation, endpoint path drift, the `whoami` bug, key-precedence bugs, CI, and several README errors.
- Neither repo has a request timeout, a retry on 429, or a changelog. These are shared gaps, not mayar-mcp wins.

---

## 2. Prioritized gap table

Severity: High / Med / Low. Effort: S (under a day), M (a few days), L (a week or more).

| ID | Axis | Gap | Sev | Effort | Evidence (mayar-cli) | Evidence (mayar-mcp) | Overlap with security plan |
|---|---|---|---|---|---|---|---|
| G01 | Errors | HTTP 200 with a failure body is treated as success | High | M | `src/util.js:19` (only checks status 2xx) | `mayar-mcp/src/utils/apiClient.ts:111-145`, `:272-281` | None. Plan phase 5 covers 5xx and unparseable bodies only (`plan.md:54-63`). |
| G02 | Validation | No pre-flight checks on money, dates, product names or required fields | High | M | `src/commands/qrcode.js:38-39` (only `> 0`); `src/util.js:28-35` (`readData` passes JSON through); `src/commands/payment.js:54-58`, `src/commands/invoice.js:72-77` | `mayar-mcp/src/utils/money.ts:21-25`; `mayar-mcp/src/utils/productName.ts:15-39`; `mayar-mcp/src/utils/dates.ts:14-22`; `mayar-mcp/src/lean/actions.ts:154-187` | None. Plan lists a general validation framework as out of scope (`plan.md:109-111`). |
| G03 | Endpoint coverage | Some CLI paths differ from the Mayar docs | High | S to M | `src/commands/credit.js:13-64`; `src/commands/invoice.js:53,61`; `src/commands/customer.js:36-38`; `src/commands/review.js:63`; `src/commands/whoami.js:26` | `mayar-mcp/src/lean/actions.ts:281-282`, `:563-611`, `:658` | None |
| G04 | Rate limit / timeout | `api.js` has no request timeout | Med | S | `src/api.js:30-43` (no timeout); compare `src/commands/docs.js:123`, `:626` | Also missing: `mayar-mcp/src/utils/apiClient.ts:245-253` | Adjacent. Phase 4 adds throttle and 429 backoff, not a timeout. |
| G05 | CI / quality | No CI, no lint, no typecheck, no coverage gate | Med | S | no `.github/` dir; `package.json:9-13` (only `start`, `test`, `test:coverage`) | `mayar-mcp/.github/workflows/ci.yml:11-25`; `mayar-mcp/package.json:5-17`; `mayar-mcp/tsconfig.json:15` | None. Plan excludes CI gates (`plan.md:112`). |
| G06 | Bugs | `whoami` prints `Endpoint: undefined` | Med | S | `src/commands/whoami.js:42` reads `api.BASE_URL`; `src/api.js:46` exports only `request` (I confirmed `BASE_URL` is `undefined`) | n/a | None |
| G07 | Auth | Key handling is inconsistent across commands | Med | S | `src/commands/balance.js:8` vs `src/cli.js:205-210`; `src/commands/status.js:30`; `src/commands/apikey.js:14`; `src/api.js:21` | `mayar-mcp/src/utils/apiClient.ts:216-217` (`bearerHeader`) | Plan excludes "auth redesign" (`plan.md:108`). These are small fixes, not a redesign. |
| G08 | Errors | Error messages lack endpoint, hint and size cap; bad `--data` JSON gives a raw parser error | Med | S | `src/util.js:7-26`, `:28-35`; `src/api.js:40` | `mayar-mcp/src/utils/apiClient.ts:23-42`, `:44-45`, `:183-202` | Partly covered by security-hardening plan, phase 5 (401, 5xx text). Size cap, endpoint name and `--data` message are not covered. |
| G09 | Release | `make release-*` publishes with no test gate; no changelog; no CI publish | Med | S | `Makefile:37-48`; no `CHANGELOG*` in `git ls-files` | Also no changelog or tags (`git tag` is empty). Version is split: `mayar-mcp/package.json:3-4` vs `mayar-mcp/src/constants.ts:3` | Phase 6 bumps the version only (`plan.md:64-67`). |
| G10 | Tests | Tests skip the HTTP layer and almost all commands | Med | M | coverage run: `api.js` 17%, `cli.js` 14%; only `membership.js` is loaded; `test/helpers.js:108-128` (`startServer`) is never used by a test | `mayar-mcp/test/apiClient.test.ts:15-153`; `mayar-mcp/test/roundtrip.test.ts`; `mayar-mcp/test/apiCoverage.test.ts` (77 cases) | Phase 6 adds tests for new code only. |
| G11 | Endpoint coverage | Documented endpoints with no CLI command | Low to Med | S each | no match in `src/commands/*` | `mayar-mcp/src/lean/actions.ts:246` (`/hl/v2/statistics`), `:356` (`/hl/v2/transactions/{id}`); `mayar-mcp/src/tools/coupons/getCouponsList.ts:40-42` (coupon list); `mayar-mcp/src/lean/register.ts:472-500` (read webhook URL) | None |
| G12 | Packaging | Node 18 floor; `SKILL.md` not in the npm package; installer has no integrity check | Low to Med | S | `package.json:14-16`, `:35-40`; `install.sh:45-56`; `src/commands/skill.js:6-7` | `mayar-mcp/package.json:33-35` (Node >= 22) | None. Plan excludes security scanning (`plan.md:112`). |
| G13 | Docs | README and SKILL.md have wrong or stale statements; AGENTS.md is an empty template | Low to Med | S | `README.md:3` vs `package.json:17-19`; `README.md:16-17`; `README.md:423` vs `src/commands/whoami.js:26`; `SKILL.md:30,108,401`; `AGENTS.md:14,22,42` | `mayar-mcp/README.md:118-142` (troubleshooting table, agent rules) | Partly covered by security-hardening plan, phase 6 (README, SKILL.md for new behavior and sandbox domain). Other errors are not. |
| G14 | Config | Sandbox domain is stale in code and docs | High | S | `src/config.js:74,79`; `src/cli.js:146,161,213`; `src/ui.js:173`; `src/commands/init.js:16` | `mayar-mcp/src/constants.ts:7`; `mayar-mcp/src/environment.ts:58`; `mayar-mcp/docs/spec/01-foundation.md:29-31` | Covered by security-hardening plan, phase 5 for `config.js` and the `--sandbox` help. **Not covered:** `web.mayar.club` links at `src/cli.js:213`, `src/ui.js:173`, `src/commands/init.js:16`, and `SKILL.md:30,108,401`. |
| G15 | Errors / config | Wrong-environment 401 hint | Med | S | `src/util.js:18-26` | `mayar-mcp/src/utils/apiClient.ts:170-181`, `:199-200` | Covered by security-hardening plan, phase 5 |
| G16 | Security | SSRF check on webhook URL | High | M | `src/commands/webhook.js:28-33`, `:36-40` | mayar-mcp has **no** such check: `mayar-mcp/src/tools/webhook/updateWebhookUrl.ts:15` (`z.string().url()` only) | Covered by security-hardening plan, phases 1 and 2 |
| G17 | Security | Terminal output sanitizing | Med | M | `src/ui.js:80-99`, `:76-78` | no equivalent (mayar-mcp returns JSON to a model, so it cares less) | Covered by security-hardening plan, phases 1 and 3 |
| G18 | Rate limit | Throttle, 429 backoff, `X-RateLimit-*` | Med | M | `src/api.js:7-44` | none in mayar-mcp (`grep` for retry, 429, backoff finds only the webhook-retry tool) | Covered by security-hardening plan, phase 4 |
| G19 | Maintainability | `decodeJwt` copied into three files | Low | S | `src/commands/login.js:6`, `src/commands/whoami.js:4`, `src/commands/status.js:4` | n/a | Adjacent. Plan phase 5 needs JWT decoding (`plan.md:54-58`). Put it in one shared module first. |
| G20 | Pagination | `--limit` is not checked or clamped; `product list --stock` is sent | Low | S | `src/util.js:40-47`; `src/cli.js:149` (help says max 50); `src/commands/product.js:53` | `mayar-mcp/src/utils/helper.ts:110-112`; `mayar-mcp/src/lean/register.ts:237-240`; `stock` removed per `mayar-mcp/docs/parity.md` product list row (secondary) | None |

---

## 3. Detail by axis

### 3.1 API endpoint coverage

**What each repo calls.** mayar-cli calls about 70 path/method pairs. They are in `src/commands/*.js` (`grep "api.request"` lists them). Almost all are `/hl/v2/*`. Exceptions: `/saas/v2/license/*` (`src/commands/saas.js:12`), `/software/v2/license/verify` (`src/commands/software.js:11`), and `/hl/v1/balance` (`src/commands/whoami.js:26`). mayar-mcp calls the same set through the `/hl/v2`, `/mcp/v2`, `/credit/v2`, `/saas/v2` and `/software/v2` bases (`mayar-mcp/src/constants.ts:4-30`, `mayar-mcp/src/lean/actions.ts`).

**Endpoints mayar-mcp calls that mayar-cli does not (G11).**

| Endpoint | mayar-mcp | Mayar docs |
|---|---|---|
| `GET /hl/v2/statistics` | `mayar-mcp/src/lean/actions.ts:246` | https://docs.mayar.id/api-reference-v2/statistics/statistics.md (from llms.txt) |
| `GET /hl/v2/transactions/{id}` | `mayar-mcp/src/lean/actions.ts:356` | https://docs.mayar.id/api-reference-v2/transaction/detail.md (from llms.txt) |
| `GET /coupons` list (cursor) | `mayar-mcp/src/tools/coupons/getCouponsList.ts:40-42` | https://docs.mayar.id/api-reference-v2/discount/index.md (from llms.txt) |
| Read the registered webhook URL, derived from `customer detail data.user.urlHook` | `mayar-mcp/src/lean/register.ts:472-500` | no dedicated endpoint (comment at `register.ts:470-472`) |

mayar-cli has `discount get/check/validate/create` but no coupon list (`src/commands/discount.js:7-50`).

**Endpoints mayar-cli has that mayar-mcp lacks:** none in API terms. `mayar-mcp/docs/parity.md` (secondary) says it has "0 missing" CLI rows. CLI-only features are local: `login`, `init`, `skill install`, `docs`, `config` (`src/cli.js:255-280`).

**Path drift (G03).** These CLI paths differ from the Mayar docs. Live behavior is **unverified**.

| CLI call | CLI cite | Docs say | mayar-mcp uses |
|---|---|---|---|
| `GET/POST /hl/v2/credit/...` | `src/commands/credit.js:13,26,32,38,51,57,64` | `/credit/v2/credit/customer/balance` (https://docs.mayar.id/api-reference-v2/credit/balance.md); migration table: `/credit/v1/*` to `/credit/v2/*` | `mayar-mcp/src/lean/actions.ts:563-611` |
| `POST /hl/v2/invoices/{id}/close` and `/open`, plus `/{status}` | `src/commands/invoice.js:53,61` | Migration guide: `POST /hl/v2/products/{uuid}/{action}`. No v2 invoice-close page exists (llms.txt). | `mayar-mcp/src/lean/actions.ts:281-282` |
| `POST /hl/v2/customers/update` with `fromEmail`, `toEmail` | `src/commands/customer.js:35-40` | `POST /hl/v2/customers/{uuid}/update` with `toEmail` (https://docs.mayar.id/api-reference-v2/customer/update.md) | forwards to `update_customer`: `mayar-mcp/src/lean/actions.ts:321` |
| `GET /hl/v2/merchants/reviews/stats` | `src/commands/review.js:63` | The docs conflict. The page `reviews/merchantreviewstats.md` says `/hl/v2/merchants/reviews/stats`. The migration guide says `GET /hl/v2/reviews/stats`. | `/hl/v2/reviews/stats` (`mayar-mcp/src/lean/actions.ts:658`). Its comment says the other path 404s live (mayar-mcp QA; unverified here). |
| `GET /hl/v1/balance` for `whoami` | `src/commands/whoami.js:26` | v2 is `/hl/v2/balances` (used by `src/commands/balance.js:9`) | `/mcp/v2/balances` |

The CLI paths may work because Mayar may keep aliases. Check against the live sandbox before you change them.

### 3.2 Auth and API key handling (G07)

- **CLI resolution order.** `src/cli.js:205-210`: `--api-key`, then `MAYAR_API_KEY`, then `config.apiKey`, then `config.auth.authToken`.
- **Inconsistencies.**
  - `balance` uses `authToken` before the resolved key (`src/commands/balance.js:8`). If both a saved key and a login token exist, `balance` and `invoice list` use different credentials.
  - `status` ignores `authToken` (`src/commands/status.js:30`).
  - `mayar api-key` always writes `endpoint: 'production'`, even if you passed `--sandbox` (`src/commands/apikey.js:14`).
  - `Authorization: Bearer ${apiKey}` (`src/api.js:21`) breaks if the user pastes `Bearer xyz`. mayar-mcp normalizes it (`mayar-mcp/src/utils/apiClient.ts:216-217`, tested at `mayar-mcp/test/apiClient.test.ts:34-52`).
- **Storage.** `src/config.js:33-37` writes the file with default mode, then runs `chmod 600`. The directory is created with `0o700` (`:34`). The file is briefly readable. Pass `{ mode: 0o600 }` to `writeFileSync`. (My analysis from reading the code; not tested.)
- **mayar-mcp storage.** It strips the token before saving props to Durable Object storage (`mayar-mcp/src/index.ts:28-38`). It redacts query strings in observability (`mayar-mcp/wrangler.jsonc:30-35`). Different threat model (server, not laptop), but the "never persist the token" idea is worth copying where it fits.
- **Login in sandbox.** `mayar-mcp/src/auth/mayar.ts:9-10` says a sandbox JWT from `auth.mayar.io` got 401 on `api.mayar.io`, so mayar-mcp limits sign-in to production. mayar-cli lets `login` run against the sandbox auth host (`src/config.js:77-80`, `src/commands/login.js:24-25`). See open question 3.

### 3.3 Error handling and messages (G01, G08, G15)

- **CLI.** `checkResp` throws only when status is outside 2xx (`src/util.js:18-26`). The message is `API <status> — <msg>` plus a JSON dump of `errors`, `error`, `details`, `validation` or `data` (`src/util.js:9`, `:22`). There is no length cap. There is no endpoint name. Network errors are passed through as they are (`src/api.js:40`).
- **mayar-mcp.** An `ApiError` carries `status`, `endpoint`, `mayarMessage`, `details` (`mayar-mcp/src/utils/apiClient.ts:23-42`). It caps the message at 300 chars and details at 500 (`:44-45`). It reduces validation detail to field names (`:64-109`). It scrubs emails on license endpoints (`:158-168`).
- **200 with failure body (G01).** mayar-mcp checks `statusCode` 400-599 inside a 2xx body (`:111-116`, `:272-277`), and bodies with `success:false`, `status:false`, error keys or failure wording (`:132-145`, `:278-281`). The error text then starts with "Mayar rejected the request" (`:192-194`). mayar-mcp's QA notes give examples (product update, static QR) in `mayar-mcp/docs/parity.md` (secondary; **unverified** by me). Risk in mayar-cli: a write command could print a failure body and exit 0, which breaks scripts and agents.
- **Hints.** mayar-mcp adds a wrong-environment hint to a 401 only when a key was sent (`:170-181`, `:219-221`). mayar-cli has none. Covered by security-hardening plan, phase 5.
- **Bad `--data`.** `readData` calls `JSON.parse` directly (`src/util.js:28-35`). The user sees a raw parser message with no hint about `--data` or the `@file` path. The unit tests pin the throw (`test/util.test.js:112-120`) but not the wording.
- **Exit and output on failure.** `src/cli.js:333-336` prints `Error: ...` and exits 1. This is fine. Many write commands print the raw API body with `ui.jsonOut` and no human summary (for example `src/commands/invoice.js:54`). mayar-mcp answers state changes with `{ok, action, ...}` (`mayar-mcp/src/lean/actions.ts:54-58`). Whether the CLI prints an empty `{}` for these is **unverified**.

### 3.4 Input validation (G02, G20)

- **CLI.** It checks that a required positional or flag exists, and it checks enums for `status` (for example `src/commands/invoice.js:56-60`) and for `product create --type` (`src/commands/product.js:105-114`). It sends the rest of the body unchanged. `qrcode` checks `amount > 0` only (`src/commands/qrcode.js:38-39`).
- **mayar-mcp.** Checks run before any request, and every refusal says "Nothing was sent". Examples:
  - Amount must be an integer from 500 (product, payment) up to a 1,000,000,000 cap. QRIS is 1 to 10,000,000 (`mayar-mcp/src/utils/money.ts:21-25`, `:58-60`).
  - Product names with `: / ? # % \` are refused because Mayar copies the name into the public link (`mayar-mcp/src/utils/productName.ts:15-39`, secondary evidence in `docs/parity.md` "Product names that break the link").
  - `expiredAt` in the past is refused (`mayar-mcp/src/utils/dates.ts:14-22`).
  - Link slug rules (`mayar-mcp/src/utils/productLink.ts`).
  - Unknown fields on edit calls are refused (`mayar-mcp/src/lean/actions.ts:131-140`, `:154-187`).
  - Required fields come from a one-line signature per action (`mayar-mcp/src/lean/actions.ts:1-9`, `docs/parity.md` "Required fields").
- **Caveat.** Some limits come from mayar-mcp QA of the sandbox (`money.ts:6-17`). The 1e9 cap is mayar-mcp's own choice, not a Mayar rule (`money.ts:19-20`). Copy only limits you can confirm.
- **Pagination.** mayar-mcp clamps `limit` to 50 (`mayar-mcp/src/utils/helper.ts:110-112`, `mayar-mcp/src/lean/register.ts:237-240`). mayar-cli forwards any `--limit` (`src/util.js:40-47`) while its help says max 50 (`src/cli.js:149`). `product list` also sends `stock` (`src/commands/product.js:53`); mayar-mcp's notes say Mayar answers HTTP 500 for it (secondary, **unverified**).
- The security plan covers input checks only for webhook URLs and HTML in customer fields (phases 2 and 3), and says a general framework is out of scope (`plan.md:109-111`). A small, shared "guards" module for money and dates is a natural next step after the plan.

### 3.5 Security (G16, G17, secrets in logs)

- **Secrets in logs.** mayar-cli does not log keys. `MAYAR_DEBUG` prints the raw response body (`src/util.js:21`), not the key. The `whoami` and `config show` output masks keys (`src/commands/whoami.js:24`, `src/cli.js:266`). mayar-mcp logs only the path and never the query string or token, and tests this (`mayar-mcp/src/utils/apiClient.ts:240-241`, `mayar-mcp/test/apiClient.test.ts:102-117`). Equal in practice.
- **SSRF.** mayar-mcp does **not** check webhook URLs beyond `z.string().url()` (`mayar-mcp/src/tools/webhook/updateWebhookUrl.ts:15`). So there is nothing to copy. The security plan is ahead.
- **Output sanitizing.** Neither repo strips terminal escapes. mayar-mcp truncates long strings (`mayar-mcp/src/lean/compact.ts:27-33`), which is size control, not sanitizing. Covered by security-hardening plan, phases 1 and 3.
- **Tool-call safety for agents.** mayar-mcp blocks old tool names on the new surface because they skipped the guards (`mayar-mcp/src/lean/register.ts:442-467`). It marks tools read-only or destructive with annotations (`mayar-mcp/docs/spec/01-foundation.md:66-80`). The CLI has no confirm step for destructive writes (for example `membership cancel`, `src/commands/membership.js:132-138`). That fits a CLI, but an agent that uses the CLI gets no guard. See open question 5.
- **Install path.** `install.sh` downloads a tarball from npm and runs `npm install` with no integrity check (`install.sh:45-69`). `skill install` fetches `SKILL.md` from the `main` branch with no pin, no timeout and no size limit (`src/commands/skill.js:6-7`, `:10-51`). `SKILL.md` is not in the npm `files` list (`package.json:39-44`). Not covered by the plan (G12).

### 3.6 Rate limit, retry, timeout (G04, G18)

- **CLI.** One `https.request`, no timeout, no retry (`src/api.js:30-43`). A stuck connection hangs the process. `docs.js` does set a 10 s timeout (`src/commands/docs.js:123`, `:626`), so the project already has the pattern.
- **mayar-mcp.** No timeout and no retry either (`mayar-mcp/src/utils/apiClient.ts:245-253`). Its only timeout is for the sign-in stream (`mayar-mcp/src/auth/oauth.ts:423`). Not a win for mayar-mcp.
- **Plan.** Throttle, 429 backoff and rate-limit headers are covered by security-hardening plan, phase 4. Add a socket/request timeout in the same change. It is a few lines and is not in the plan.

### 3.7 Tests and coverage (G10)

| | mayar-cli | mayar-mcp |
|---|---|---|
| Framework | `node:test`, no dev deps (`package.json:9-13`) | vitest 5 (`mayar-mcp/package.json:5-17`, `mayar-mcp/vitest.config.ts`) |
| Size | 81 tests (my run) | about 334 `it(` calls by static count in 24 files (`it.each` not expanded) |
| Coverage tool | `node --test --experimental-test-coverage` (`package.json:12`). Run: 67% lines overall, `api.js` 17%, `cli.js` 14%, `ui.js` 29%. | none configured in `vitest.config.ts` |
| What is tested | flag parsing (`test/cli.test.js:16-215`), config load/save (`test/config.test.js`), `checkResp`/`readData` (`test/util.test.js`), table output (`test/ui.test.js`), membership routing (`test/cli.test.js:217-354`) | HTTP client and error mapping (`mayar-mcp/test/apiClient.test.ts`), full in-memory client round trip with mocked `fetch` (`mayar-mcp/test/roundtrip.test.ts`), per-endpoint path/body checks (`mayar-mcp/test/apiCoverage.test.ts`), schema drift against a fixture (`mayar-mcp/test/baseline.test.ts`), tool-list token budget (`mayar-mcp/test/tokenBudget.test.ts`), regression tests per QA round (`mayar-mcp/test/qaRound*.test.ts`) |
| Gaps | No test of `api.request`. 23 of 24 command modules are not loaded by any test. The local HTTP server helper exists (`test/helpers.js:108-128`) but no test uses it. | Coverage is not measured. |

Useful ideas to copy: one test per endpoint that asserts method, path, body and query (stub `api.request` as `test/cli.test.js:290-307` already does for membership); a drift fixture for the command list in `HELP`; red-then-green regression tests per bug.

### 3.8 Docs and README (G13)

- **mayar-mcp** has a quick-start with an environment table (`mayar-mcp/README.md:8-19`), a troubleshooting table keyed by the exact error text (`:118-126`), rules for AI agents (`:128-142`), a tools table (`:151-167`), and design notes (`mayar-mcp/docs/spec/01-foundation.md`, `mayar-mcp/docs/parity.md`).
- **mayar-cli problems.**
  - `README.md:3` says "Zero runtime dependencies". `package.json:17-19` depends on `@mayaross/auth`.
  - `README.md:16-17` shows `MAYAR_VERSION=0.1.9 ... curl ... | sh`. In a shell, the variables apply to `curl`, not to `sh`, so the pin does not reach `install.sh`. (Shell semantics; not run.)
  - `README.md:423` says `whoami` verifies against `/hl/v2/balances`. The code uses `/hl/v1/balance` (`src/commands/whoami.js:26`, `:56`).
  - `README.md:223`, `SKILL.md:30`, `:108`, `:401`, `src/cli.js:146` name `api.mayar.club` as the sandbox.
  - `AGENTS.md:14`, `:22`, `:42` are still template TODOs, but `CLAUDE.md` tells agents to follow `AGENTS.md`.
  - There is no troubleshooting section and no error-to-fix table.

### 3.9 Release, versioning, CI (G05, G09)

- **mayar-cli.** Manual: `make release-patch|minor|major` bumps, tags, runs `npm publish --access public` and pushes (`Makefile:37-48`). The release targets do not run `npm test`. `version-*` commits only `package.json` (`Makefile:16-35`). No CI (no `.github`). No changelog. Commit style is set by `CLAUDE.md`.
- **mayar-mcp.** CI runs typecheck, lint, tests and `wrangler deploy --dry-run` on every PR and on `main` (`mayar-mcp/.github/workflows/ci.yml:11-25`), with `contents: read` permission (`:8-9`). Deploy is manual (`mayar-mcp/package.json:6`). It has no changelog and no git tags. The version is out of sync: `package.json` says `0.0.0` and `private: true` (`:3-4`), while the server reports `1.0.0` (`mayar-mcp/src/constants.ts:3`). So mayar-mcp's edge is CI only, not release hygiene.
- **Suggested minimum.** A GitHub Actions workflow that runs `npm test` on Node 20 and 22. A `prepublishOnly` script that runs tests. Publish from CI with npm provenance. (Suggestions, not mayar-mcp facts.)

### 3.10 Packaging

- **CLI.** CommonJS JavaScript, no build, one runtime dependency (`package.json:17-19`, lock at `package-lock.json:21-27`), Node `>=18` (`package.json:14-16`). Node 18 reached end of life in April 2025 (general knowledge; not from a repo source). `files` ships `bin`, `src`, `README.md`, `LICENSE` (`package.json:39-44`), not `SKILL.md`. The three install paths (npm, `install.sh`, source) are documented (`README.md:5-34`).
- **mayar-mcp.** TypeScript on Cloudflare Workers. Deployed with Wrangler, not published to npm (`mayar-mcp/package.json:4`, `mayar-mcp/wrangler.jsonc`). Node `>=22` (`mayar-mcp/package.json:33-35`). Dependencies are pinned for the SDK (`mayar-mcp/package.json:26-32`, reason in `docs/spec/01-foundation.md:46-58`).
- The `@mayaross/auth` dependency is a fair cost: browser login needs it. Do not drop it only to match the README claim; fix the README instead.

### 3.11 Config: sandbox vs production domains (G14, G15)

- **CLI.** Sandbox is `api.mayar.club` and `auth.mayar.club` (`src/config.js:74`, `:79`), with web links `web.mayar.club` (`src/cli.js:213`, `src/ui.js:173`, `src/commands/init.js:16`). The help text repeats it (`src/cli.js:146`, `:161`).
- **mayar-mcp.** Sandbox is `api.mayar.io` for every API base (`mayar-mcp/src/constants.ts:7,13,22,27`). Key page is `web.mayar.io/api-keys` (`mayar-mcp/src/environment.ts:56-59`). Its spec says `api.mayar.club` "returns a plain 404 on every path, so sandbox calls never worked" (`mayar-mcp/docs/spec/01-foundation.md:29-31`; mayar-mcp's claim, **unverified** by me). The Mayar docs confirm `api.mayar.io` as the sandbox base (https://docs.mayar.id/api-reference-v2/migration-from-v1.md, https://docs.mayar.id/api-reference-v2/credit/balance.md).
- **Plan fit.** Security-hardening plan, phase 5 repoints `config.js` and the help text. Add to its checklist the three `web.mayar.club` links, `SKILL.md`, and `README.md:223`. mayar-mcp uses the host `web.mayar.io`.
- **Also unverified.** The plan lists `auth.mayar.io` as a dependency to confirm (`plan.md:124`). `mayar-mcp/src/auth/mayar.ts:9-10` names `auth.mayar.io` as a real host, but says its token got 401 on `api.mayar.io`.
- **Environment safety.** mayar-mcp refuses unknown environment values and unexpanded placeholders such as `${ENVIRONMENT}` (`mayar-mcp/src/environment.ts:27-49`) so a typo cannot hit production. The CLI refuses a bad `--env` (`src/cli.js:237-243`) but silently falls back to `production` for any stored value (`src/config.js:65`). A config file with `"endpoint": "sandbx"` becomes production (my reading; not tested). Small fix: validate the stored endpoint.

### 3.12 Other

- **Output formats.** CLI: tables plus `--json` raw (`src/util.js:64-74`). mayar-mcp returns compact JSON and a `full: true` switch for raw (`mayar-mcp/src/lean/compact.ts:1-75`, `mayar-mcp/src/lean/register.ts:331`). A `--compact` flag exists only for `docs` in the CLI (`src/cli.js:178`). A compact mode for list output would help agent users of the CLI. Low priority.
- **Pagination.** Both use cursor pagination (`startingAfter`, `nextStartingAfter`). The CLI prints a cursor footer (`src/util.js:51-62`). mayar-mcp's notes list two upstream paging bugs (`mayar-mcp/docs/parity.md` "Known upstream paging bugs", secondary). CLI users can hit them too.
- **Typing.** mayar-cli is plain JavaScript. mayar-mcp is strict TypeScript (`mayar-mcp/tsconfig.json:15`) with Biome lint (`mayar-mcp/biome.json`). Adding JSDoc types with `// @ts-check` and `tsc --noEmit` would catch bugs like G06 without a rewrite.
- **Unknown flags.** `parseFlags` takes the next token as the value of any unknown `--flag` (`src/cli.js:194-198`, tested at `test/cli.test.js:45-58`). A typo such as `--jsno` swallows the next argument silently. mayar-mcp has no CLI flags to compare.

---

## 4. Things mayar-cli does better than mayar-mcp

- **Complete command surface for people.** `init`, `login`, `status`, `config`, `skill install`, and a `docs` command with ranking, cache and stale-cache fallback (`src/cli.js:6-167`, `src/commands/docs.js:136-163`). mayar-mcp has no local setup flow and its sign-in is on hold (`mayar-mcp/wrangler.jsonc:13-15`).
- **Browser login works for production.** `src/commands/login.js:18-78`. mayar-mcp turned it off (`mayar-mcp/docs/parity.md` "Sign-in (OAuth)", secondary).
- **Config file permissions and legacy migration.** `src/config.js:9-37` (dir `0o700`, file `chmod 600`, move from `~/.mayar`), with tests (`test/config.test.js:107-139`).
- **Human-readable output.** Tables, color only on a TTY, cursor footer (`src/ui.js:3-11`, `:80-99`, `src/util.js:51-62`).
- **Configurable base URL.** `MAYAR_API_URL` and `MAYAR_AUTH_URL` (`src/config.js:72-80`). mayar-mcp fixes the base per environment (`mayar-mcp/src/constants.ts:4-30`) and has a `local` option that points to `localhost`.
- **Few moving parts.** One runtime dependency, no build step, three install paths, no server to run.
- **Sees the whole API surface first.** mayar-mcp's own parity doc is built from the CLI's commands (`mayar-mcp/docs/parity.md:1-6`). The CLI was the reference.

---

## 5. Open questions for the maintainer

1. **Path drift (G03).** Do the CLI paths for credit, invoice close/reopen, customer update and merchant review stats work on live production and sandbox? Do you have a sandbox key to test them? Mayar's own docs disagree with each other on merchant review stats.
2. **200-with-failure (G01).** Should a failure body inside HTTP 200 make the CLI exit non-zero? mayar-mcp says yes. This changes exit codes for scripts that rely on today's behavior.
3. **Sandbox login.** `mayar-mcp/src/auth/mayar.ts:9-10` says a sandbox login token was rejected by `api.mayar.io`. Should `mayar login --sandbox` be blocked, or should it warn? Does the security plan's `auth.mayar.io` pairing (`plan.md:124`) hold?
4. **`webhook test` meaning.** The plan treats `webhook test <url>` as a live request to the given URL (`plan.md:35-37`). mayar-mcp says Mayar needs a valid `urlHook` but sends the test to the URL already registered (`mayar-mcp/src/tools/webhook/testWebhook.ts:19`, and the `webhook test` row of `docs/parity.md`). Which is true? If mayar-mcp is right, the plan's rationale for blocking `test` changes. (The SSRF risk then sits on `register`, and the `test` argument is only a presence check.)
5. **Agent users.** Is the CLI meant to be driven by AI agents (`SKILL.md` says yes)? If so, do you want guards like mayar-mcp's (money limits, "Nothing was sent" refusals, a `--yes` confirm for destructive writes)? Or should the CLI stay a thin client?
6. **Scope of validation.** The plan puts a general validation framework out of scope (`plan.md:109-111`). Do you want a second feature for money, date and name guards (G02)? Which of mayar-mcp's limits do you accept (minimum 500, QRIS 10,000,000, the 1e9 cap)?
7. **CI and release.** Do you want GitHub Actions (tests on Node 20/22, publish with provenance) and a `CHANGELOG.md`? Should Node 18 support end?
8. **`whoami` endpoint.** Keep `/hl/v1/balance` for the key check, or move to `/hl/v2/balances` as the README says? Fix `api.BASE_URL` in the same change (G06).
9. **Key precedence (G07).** Which credential wins when both an API key and a login token exist? Should `balance` follow `src/cli.js:205-210`?
10. **Docs ownership.** `AGENTS.md` is a template (`AGENTS.md:14-80`). Do you want it filled in so agents follow real conventions (CommonJS, `checkResp`, `readData`, `node --test`)?
