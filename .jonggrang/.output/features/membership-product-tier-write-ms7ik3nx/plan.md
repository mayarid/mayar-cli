---
feature: membership-product-tier-write
branch: feat/membership-product-tier-write
base: "main"
work_type: MEDIUM
description: Add CLI commands to create and get membership products and tiers under the membership command
created_at: 2026-07-30T12:51:19.693Z
---

# Plan: Membership Product & Tier Create/Get Commands

## Approach
Extend the existing `src/commands/membership.js` handler with two new nested
sub-namespaces — `membership product <create|get>` and `membership tier
<create|get>` — that wrap four Headless v2 endpoints (product create/get, tier
create/get). Writes take a JSON body via the established `--data <json|@file>`
pattern (`readData` + `POST .../create`); gets are `GET .../:id` calls, with tier
get scoped by `--productId`. No new source module is introduced: this reuses
`api.request`, `checkResp`, `readData`, and `ui.jsonOut` exactly as the existing
`register`/`get`/`create-invoice` cases do. The four endpoints are defined by the
authoritative clarification contract (they are new wrapper endpoints, not
inferred REST paths), so the CLI is built against that fixed contract.

## Phases
1. Endpoint contract lock — record the four endpoint paths and required/optional body fields from the clarification as the build contract; confirm they do not collide with the existing plural `membership tiers` list command.
2. Membership product commands — add `membership product create` (POST /hl/v2/memberships/products/create, body via --data) and `membership product get <id>` (GET /hl/v2/memberships/products/:id) dispatch in membership.js.
3. Membership tier commands — add `membership tier create` (POST /hl/v2/memberships/tiers/create) and `membership tier get <id> --productId <id>` (GET /hl/v2/memberships/tiers/:id?productId=...) dispatch in membership.js.
4. Help & docs — update the Memberships section of the CLI help in src/cli.js, plus README.md and SKILL.md, with the new commands and their required flags/bodies.
5. Tests & validation — add coverage for the new sub-command routing/usage errors, run typecheck/tests/lint, and log learnings.

## Key Decisions
- Namespace: singular `membership product` / `membership tier` sub-namespaces sit alongside the existing plural `membership tiers` list — avoids overloading the list command while keeping everything under `membership`, per clarification.
- Input shape: creates use the existing `--data <json|@file>` convention (like `register`/`invoice create`) rather than many typed flags, keeping the CLI thin over the rich membershipInfo/periods bodies.
- Dedicated get commands for both product and tier (not reusing `product get`), per clarification; tier get requires `--productId` and mirrors the existing tier-list scoping.
- Output: default to `ui.jsonOut` for create/get (structured objects), consistent with `register`/`get` cases; table formatting is reserved for the existing list commands.

## Out of Scope
- Implementing the backend wrapper endpoints themselves in `api-custom-paymenlink` (separate repo/service) — this plan consumes that contract; the CLI cannot function end-to-end until those endpoints ship.
- Update/delete/close operations for membership products or tiers.
- Typed per-field flags or interactive prompts for building the create bodies.
- Changes to the existing `membership members`/`tiers`/`register`/`update`/`cancel`/`create-invoice` behavior.

## Dependencies
Existing `src/commands/membership.js` dispatch pattern, `api.request` (src/api.js),
and `checkResp`/`readData`/`ui.jsonOut` helpers. External runtime dependency: the
four new Headless v2 wrapper endpoints must be implemented in `api-custom-paymenlink`
before the commands work against a live environment.

<!-- jonggrang:clarifications -->
## Clarifications
_Captured from the planning Q&A:_

Goal: The user wants to extend mayar-cli with commands to create a Membership Product and create a Tier (plus get/retrieve each), alongside the existing read-only membership commands. The blocker is that Mayar's public Headless v2 docs describe membership-product and tier creation as dashboard-UI-only, and the current CLI only lists tiers/members and has no membership-product create path — so the real API surface for these write operations is unconfirmed.

- **The public Headless v2 docs describe membership-product and tier creation as dashboard-only. What is the source of truth for the create/get endpoints we should build against?** → Source of truth: implement new Headless v2 wrapper endpoints in api-custom-paymenlink, based on the existing dashboard GraphQL mutations. Do not infer live undocumented REST      endpoints. The current public REST API does not expose create membership product/tier yet.
- **If you can provide it (or already know it), give the exact create endpoints and required body fields for (a) creating a membership product and (b) creating a tier, plus any get-by-id paths.** → These endpoints do not exist yet; add them first:

     POST /hl/v2/memberships/products/create
     Body:
     - name
     - description
     - redirectUrl?
     - coverImage?
     - hidePortalAccessInEmails?
     - membershipInfo: {
         showMembers,
         type,
         creditValue?,
         enableCreditTopup?,
         isAccumulateCredit?,
         isAccumulateTopupCredit?,
         minCreditTopup?,
         maxCreditTopup?
       }

     GET /hl/v2/memberships/products/:productId
     Can wrap/reuse existing product detail logic.

     POST /hl/v2/memberships/tiers/create
     Body:
     - productId
     - name
     - description
     - notes?
     - limit?
     - upfrontFee?
     - finishMembershipAt?
     - gracePeriodInDays?
     - trialPeriodInDays?
     - trialCredit?
     - isTrialAvailable?
     - redirectUrl?
     - periods: [
         {
           monthPeriod?,
           amount?,
           credit?,
           isLifetime?,
           status?
         }
       ]

     GET /hl/v2/memberships/tiers/:tierId?productId=...
     Or implement by filtering existing GET /hl/v2/memberships/tiers?productId=...
- **Where should the new commands live?** → Under `membership` — e.g. `membership tier create`, `membership tier get <id>`, `membership product create`, `membership product get <id>`
- **For the 'get/retrieve' half: is retrieving a single membership product adequately served by the existing `product get <id>`, or do you want dedicated membership-product and tier get commands?** → Add dedicated get commands for both membership product and tier
