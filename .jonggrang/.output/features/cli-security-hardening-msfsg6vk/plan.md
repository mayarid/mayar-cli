---
feature: cli-security-hardening
branch: feat/cli-security-hardening
base: "main"
work_type: MEDIUM
description: Client-side security hardening for mayar-cli — SSRF pre-flight URL validation, safe terminal output, throttling, and clearer 401/5xx/sandbox messaging
created_at: 2026-08-05T07:43:28.131Z
---

# Plan: CLI Security Hardening (stress-test response)

## Approach
The stress-test findings are defects in the Mayar API server, which lives in a different
codebase; this repo is the HTTP client only. So the deliverable here is a defence-in-depth
layer inside the CLI: a new shared security module holding pure validators and sanitizers,
wired into the two request-shaping seams that already exist — `src/api.js` (transport:
throttle, 429 backoff, rate-limit header surfacing, error classification) and
`src/ui.js`/`src/util.js` (rendering and error surfacing). Command modules (`webhook.js`,
`customer.js`, `invoice.js`) gain pre-flight checks that reject dangerous input before a
request is ever sent. Separately, the full report supplies a fact the earlier Q&A did not:
the working sandbox is **`api.mayar.io`** (dashboard `web.mayar.io`) as of August 2026, and
`api.mayar.club` — which `src/config.js:74`/`:79` still hardcodes for both API and auth — is
a stale domain that answers but returns `data: null` for `/payment-channels`. So `--sandbox`
is repointed to the working domain, with the legacy domain kept reachable behind an explicit
opt-in plus the deprecation warning the user asked for. Everything new is a pure function
where possible so it is testable under the existing `node --test` harness.

## Phases
1. **Security primitives module** — Add a single security helper module with pure,
   unit-tested functions: webhook URL validation (scheme allowlist, DNS/literal IP
   classification for loopback, RFC1918, link-local, cloud-metadata `169.254.169.254`,
   IPv6 equivalents including `[::1]`, plus a well-known non-HTTP port blocklist — 22,
   3306, 6379, 5432, 27017 and peers — resolving hostnames before the verdict so a
   DNS-rebinding name is caught too), terminal-output sanitization (strip ANSI/control
   sequences), and HTML/script payload detection for user-supplied text fields. No
   command wiring yet.
2. **Webhook SSRF hard block** — Wire the URL validator into `webhook register` and
   `webhook test` so unsafe targets fail locally with an explanatory error naming which
   rule tripped, and a non-zero exit, before any API call. No override flag. `webhook test`
   is treated as a live request, not a dry run, because the report's `new-history` evidence
   confirms the server actually dials the target.
3. **Safe output & input warnings** — Route API-returned strings through the sanitizer in
   table rendering and JSON output so server-stored payloads cannot emit escape sequences
   into the user's terminal; warn (and require confirmation in TTY, hard-fail in non-TTY)
   when HTML-looking content appears in customer-facing fields on `customer create/update`
   **and** on `invoice create` — the report's reproduction was via invoice creation, whose
   nested `customer.name`/`description` is the same payload surface.
4. **Transport resilience in api.js** — Add a conservative client-side request throttle
   and 429 retry-with-exponential-backoff plus jitter, honouring `Retry-After` when the
   server sends it, with a bounded retry ceiling and a clear give-up message. Also capture
   `X-RateLimit-*` response headers and surface them in `--json` output (and on the
   throttle/give-up messages) so integrators can self-throttle — the report notes the
   documented 50 req/min was never observed and no limit headers reach the user today.
5. **Error UX: 401, 5xx, sandbox domain** — Disambiguate 401 using the locally decodable
   JWT: when the key parses structurally but the API rejects it, name the resolved endpoint
   and the identity in the token ("key for <sub> rejected by api.mayar.id — try `--sandbox`"),
   otherwise report it as invalid/expired. Catch 5xx and unparseable responses and print an
   actionable message with a request summary instead of the raw server stack trace (the
   `discount validate` null-deref is the reference case: report it as "payment link not
   found — server returned 500 instead of 404"). Repoint `--sandbox` to `api.mayar.io` /
   `auth.mayar.io`, keep `api.mayar.club` reachable via an explicit legacy opt-in, and emit
   a one-line stderr deprecation warning whenever the legacy domain resolves. Update the
   `--sandbox` help text, which currently names the stale domain.
6. **Tests, docs, and release** — Cover the new validators, header surfacing, and error
   paths with tests, update README, SKILL.md, and CLI help for the new behaviour, add a
   security notes section recording which findings are server-side and unfixable here
   (findings 1, 2, 3, 4) and which are addressed client-side, and bump the version.

## Key Decisions
- **Hard block, no override, on webhook URLs**: per user direction. An `--allow-private`
  escape hatch would be the first thing an attacker-supplied command line uses, and the
  legitimate case (webhook receivers are public by definition) does not need it.
- **Sanitize on output, warn on input**: the CLI cannot stop the server storing raw HTML,
  but it can guarantee the terminal is never driven by server-controlled bytes, and it can
  refuse to be the tool that plants the payload.
- **New shared module rather than per-command helpers**: validators must behave identically
  everywhere and be testable in isolation; scattering them invites drift.
- **Throttle client-side even though the server has no observed limit**: protects users from
  accidental self-inflicted floods and makes the CLI a good citizen if server-side limits
  land later. Surfacing `X-RateLimit-*` is additive — if the server never sends the headers,
  the JSON field is simply absent rather than fabricated.
- **Repoint `--sandbox` to `api.mayar.io`, keep `.club` as an explicit legacy flag**: this
  reconciles the earlier "keep it and warn" direction with the report's newer fact that
  `.club` is permanently broken and `.io` is the live sandbox. Nobody's `--sandbox` workflow
  breaks — it starts working — and anyone pinned to `.club` can still get there deliberately
  and will see the deprecation warning on every resolve.
- **Use the decodable JWT for the 401 hint, do not trust it for anything else**: the token
  payload tells us who the key claims to be, which is enough to say "wrong environment"
  instead of "unauthorized". It is never treated as proof of validity, and the decoded
  payload is sanitized before printing like any other untrusted string.
- **Version target is 1.3.0**: the discrepancy flagged in the previous draft is resolved —
  `main` is now at `1.2.0` (commit `8b90526`), matching the version the stress test cites,
  so these changes ship as the next minor.
- **Treat the report as internal**: it is marked not for distribution outside the Mayar team,
  so the CLI-side docs describe the hardening behaviour without reproducing payloads,
  endpoints, or the report itself, and no public advisory is published from this repo.

## Out of Scope
- Any fix to the Mayar API server: the SSRF execution itself, the raw-HTML storage in
  `customer.name`/`description`, the null-deref 500 on `discount validate`, and the absent
  or unenforced server-side rate limiting all require the API codebase and must be reported
  through Mayar's internal channel.
- Repairing the `api.mayar.club` payment-channel configuration, or decommissioning the
  domain — this plan only stops pointing users at it by default.
- Verifying whether the hosted invoice page or admin dashboard escapes `customer.name` on
  render — that is the frontend repos' question and determines whether finding 2 is a live
  stored XSS or only unsanitized storage.
- Any authentication or key-storage redesign (`login`, token handling, config permissions).
- A general-purpose input validation framework across all 24 command modules — only the
  fields implicated by the findings are touched. The areas the report confirmed solid
  (injection handling, length limits, enum whitelists, JSON parse errors) are left alone.
- Automated security scanning, CI security gates, or dependency auditing.
- Publishing a security advisory or coordinating external disclosure.

## Dependencies
- `src/api.js` — the single request funnel; throttle, backoff, rate-limit header capture, and status classification hook in here.
- `src/util.js` `checkResp()` — existing error-shaping seam for 401/5xx messaging.
- `src/ui.js` — `table()`, `jsonOut()`, and the existing TTY-aware color wrappers, for output sanitization.
- `src/config.js` `resolveEndpoint()`/`apiBaseUrl()`/`authBaseUrl()` (lines 74 and 79 hardcode `api.mayar.club`/`auth.mayar.club`) — endpoint resolution for the 401 disambiguation, the sandbox repoint, and the legacy deprecation warning.
- `src/cli.js` — the `--sandbox` flag help text naming the stale domain.
- `src/commands/webhook.js`, `customer.js`, `invoice.js`, `discount.js` — pre-flight validation and error-path wiring.
- Node built-ins only (`net`, `url`, `dns`) — the project has one runtime dependency and this plan adds none.
- Existing `node --test` harness and `test/helpers.js`.
- Confirmation that `auth.mayar.io` is the auth host paired with `api.mayar.io`; the report names the API and dashboard hosts but not the auth host.

<!-- jonggrang:clarifications -->
## Clarifications
_Captured from the planning Q&A:_

Goal: The user ran a security stress test against the Mayar API via mayar-cli v1.2.0 and found 2 critical (SSRF via webhook register/test, stored XSS in customer.name), 2 high (500 crash on discount validate with a non-existent payment link ID, no rate limiting), and 3 medium issues (stale broken sandbox domain api.mayar.club, ambiguous 401 messaging, webhook test without target validation), and now wants these addressed. However, this repository is the CLI client only (src/api.js talks to https://api.mayar.id) — every critical/high finding is a server-side defect in the Mayar API, so what can actually be built here must be scoped before planning.

- **What should this feature actually deliver in the mayar-cli repo, given the API server is a different codebase?** → CLI-side hardening only — pre-flight URL validation, safe terminal output, graceful 5xx/401 handling, sandbox warning
- **For CLI-side webhook URL validation (mayar webhook register/test), how strict should the block be?** → Hard block — reject non-http(s) schemes, loopback, RFC1918/private, link-local, and cloud metadata IPs with no override
- **The XSS finding is server-side storage of raw HTML. What is the CLI's responsibility here?** → Sanitize output — strip/escape ANSI and control characters from API-returned strings before printing to the terminal, Reject or warn on HTML-looking payloads in customer fields before sending them to the API
- **How should the CLI handle server faults it cannot fix — the 500 on discount validate, missing rate limiting, and the 401 that doesn't distinguish invalid key from environment mismatch?** → Friendly 5xx handling — catch server stack traces / null-deref errors and print an actionable message instead of leaking the raw response, Smarter 401 messaging — disambiguate 'invalid key' vs 'key belongs to the other environment' using the resolved sandbox/production endpoint, Client-side throttle plus 429 retry-with-backoff in src/api.js
- **The sandbox endpoint https://api.mayar.club is still online but permanently broken. What should the CLI do with it?** → Keep it but print a deprecation warning whenever the sandbox endpoint resolves
- **Any constraints I should know about — do you have access to a Mayar API server repo, is there a disclosure/embargo process for these findings, and what release version should the CLI changes target? (The stress test cites v1.2.0 but package.json on main reads 1.1.0.)** → Answered by the full stress-test report: the report is internal to the Mayar team (not for external distribution), no API server repo access is indicated, and `main` is now at 1.2.0 so these changes target 1.3.0. The report also supplies the working sandbox domain (`api.mayar.io`, dashboard `web.mayar.io`), which supersedes the assumption that `--sandbox` must stay on `api.mayar.club`.
