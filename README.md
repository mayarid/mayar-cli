# mayar

Command-line interface for the [Mayar](https://docs.mayar.id) API. Zero runtime dependencies — Node.js 18+ stdlib only.

## Install

**One-liner (no npm required):**

```bash
curl -fsSL https://raw.githubusercontent.com/mayarid/mayar-cli/main/install.sh | sh
```

Downloads the latest tarball from the npm registry, extracts to `~/.local/share/mayar`, and symlinks the binary to `~/.local/bin/mayar`. Requires only `node>=18`, `curl`, and `tar`. Override paths or pin a version:

```bash
MAYAR_VERSION=0.1.9 MAYAR_BIN_DIR=/usr/local/bin \
  curl -fsSL https://raw.githubusercontent.com/mayarid/mayar-cli/main/install.sh | sh
```

**Via npm:**

```bash
npm install -g mayar
# or run without installing:
npx mayar --help
```

**From source:**

```bash
git clone https://github.com/mayarid/mayar-cli.git
cd mayar-cli
npm link        # exposes a `mayar` command on your PATH
```

## Authentication

Resolution order: `--api-key` flag → `MAYAR_API_KEY` env → saved config file.

**Option 1 — environment variable (recommended for CI/agents):**

```bash
export MAYAR_API_KEY=your_api_key_here
mayar whoami
```

**Option 2 — saved config (interactive first run):**

The first time you invoke any command without a key configured, the CLI prompts for your production API key (input is masked). Paste it once; it's stored at `~/.config/mayar/config.json` (chmod 600, follows [XDG Base Directory](https://specification.freedesktop.org/basedir-spec/latest/)) and reused on subsequent runs.

```bash
mayar balance
# Welcome to Mayar CLI.
# No API key found. Get yours from https://web.mayar.id → Integration → API Key.
# Paste your production API key: ************
# ✓ Saved to /Users/you/.config/mayar/config.json
```

**Option 3 — non-interactive setup:**

```bash
mayar api-key YOUR_KEY_HERE
```

**Option 4 — per-command override:**

```bash
mayar --api-key YOUR_KEY_HERE balance
```

Get your API key from [web.mayar.id](https://web.mayar.id) → Integration → API Key.

> **v1.0.0 — Mayar API v2.** All commands now target `/hl/v2/...`. Pagination switched from `--page`/`--pageSize` to cursor-based `--limit`/`--after` (returned in the previous response's `nextStartingAfter`). The `--pageSize` flag is still accepted as an alias for `--limit`.

## Commands

```
Setup
  init                                  First-time setup (interactive, masked input)
  login [--no-browser]                  Sign in via Google OAuth
  api-key <key>                         Save API key non-interactively
  config show|reset                     Inspect or remove the saved config

Account
  whoami                                Merchant identity (JWT decode + live verify)
  balance                               GET  /hl/v2/balances

Invoices
  invoice list [--limit --after --status --search]
  invoice get <id>
  invoice close <id> | reopen <id>      POST /hl/v2/invoices/{id}/{open|close}
  invoice status <id> <action>          action ∈ open|close|active|closed|unlisted
  invoice edit <id> --data <json|@file>
  invoice filter --email <email> [--limit --after --status --search]
  invoice create --data <json|@file>

Products
  product list [--limit --after --search --type --stock]
  product search <keyword>
  product type <ebook|course|membership|saas|event|webinar|…>
  product get <id>
  product close | reopen | status <id> <action>
  product transactions <id> [--limit --after --status --customerId]
  product create --type <T> --data <json|@file>
                                        T ∈ ebook|digital|event|webinar|generic|payment-link
  product edit <id>   --type <T> --data <json|@file>
  product sort <generic_link|event|webinar|digital_product> [--limit --after]
                                        POST /hl/v2/payment-links/sort/{type}

Payment links (alt route)
  payment-link edit <id> --data <json|@file>
                                        POST /hl/v2/payment-links/{id}/update
                                        (alias for `product edit --type payment-link`)

Single payment requests
  payment list [--limit --after --status]
  payment get <id>
  payment close | reopen | status <id> <action>
  payment edit <id> --data <json|@file>
  payment create --data <json|@file>

Customers
  customer list                          GET  /hl/v2/customers
  customer create --data <json|@file>
  customer search <email>                GET  /hl/v2/customers/detail?email=
  customer update <fromEmail> <toEmail>
  customer magic-link <email>            POST /hl/v2/customers/portal-login

Transactions
  tx list   [--limit --after --status --customerId --type --startAt --endAt]
  tx unpaid [--limit --after --status --customerId --startAt --endAt]
  tx daily
  tx product <productId> [--limit --after --status]

Reviews
  review list [--limit --after --status --paymentLinkId --rating]
  review stats [productId]               merchant-wide or per-product
  review create --data <json|@file>
  review update <id> --data <json|@file>
  review bulk-status --data <json>       [{id,status: ACTIVE|ARCHIVED|INACTIVE}, …]
  review product <paymentLinkId> [--limit --after --rating]
  review product-customer <paymentLinkId> --customerId <id>

Discounts (coupons)
  discount create --data <json|@file>
  discount get <id>
  discount validate <code> <paymentLinkId>
  discount check <code>

Bundling
  bundling list [--limit --after]
  bundling get <id>

Installments
  installment list [--limit --after --status --customerId]
  installment get <id>
  installment create --data <json|@file>

Memberships
  membership members --productId <id> [--limit --after]
  membership tiers   --productId <id> [--limit --after]
  membership register --data <json|@file>
  membership get <memberId>            --productId <id>
  membership update <memberId>         --productId <id> [--data <json|@file>]
  membership cancel <memberId>         --productId <id>
  membership create-invoice <memberId> --productId <id>

Credit wallets
  credit balance  --customerId <id> --productId <id> [--tierId <id>]
  credit add      --data <json|@file>    {customerId, productId, amount}
  credit spend    --data <json|@file>    {customerId, productId, amount}
  credit history  <customerId> --productId <id> [--page N --limit N]
  credit register-usage      --data <json|@file>
  credit register-membership --data <json|@file>
  credit checkout            --data <json|@file>

SaaS licensing
  saas activate   <licenseCode> <productId>   POST /saas/v2/license/activate
  saas deactivate <licenseCode> <productId>   POST /saas/v2/license/deactivate
  saas verify     <licenseCode> <productId>   POST /saas/v2/license/verify

Software licensing
  software verify <licenseCode> <productId>   POST /software/v2/license/verify

QR & payment channels
  qrcode <amount>                        POST /hl/v2/qr-codes/create
  qrcode static                          GET  /hl/v2/qr-codes/static
  qrcode channels                        GET  /hl/v2/payment-channels

Webhooks
  webhook register <url>                 POST /hl/v2/webhooks/update
  webhook test <url>
  webhook history     [--limit --after --status --type --startAt --endAt]
  webhook new-history [--limit --after]
  webhook retry <historyId>

Global flags
  --json                Output raw JSON instead of pretty tables
  --api-key <key>       Use this API key for the run (also accepts --api-key=KEY)
  --limit N             Page size (default 10, max 50)
  --after CURSOR        Pagination cursor (from previous nextStartingAfter)
  --pageSize N          Alias for --limit
  --data <json|@file>   Inline JSON, or @path to a JSON file
  -h, --help            Show help
  -v, --version         Show version

Environment
  MAYAR_API_KEY         Used when --api-key is absent and no config is saved
  MAYAR_API_URL         Override API base URL
  MAYAR_AUTH_URL        Override auth server base URL (used by 'login')
  NODE_ENV=development  Target the sandbox (*.mayar.club) instead of production
```

## Examples

```bash
# Verify active user / API key
mayar whoami

# Account balance
mayar balance

# Paginated lists (v2 cursor pagination)
mayar invoice list --limit 20
mayar invoice list --limit 20 --after 1730000000000     # next page
mayar product type ebook --limit 50

# Search
mayar product search "kelas python"

# Create an invoice from a JSON file
cat > /tmp/inv.json <<'JSON'
{
  "name": "Andre",
  "email": "andre@example.com",
  "mobile": "08123456789",
  "redirectUrl": "https://example.com/thanks",
  "description": "Order #1234",
  "expiredAt": "2026-12-31T23:59:59.000Z",
  "items": [{ "quantity": 1, "rate": 50000, "description": "1x Course" }]
}
JSON
mayar invoice create --data @/tmp/inv.json

# Create a customer inline
mayar customer create --data '{"name":"Raihan","email":"r@example.com","mobile":"081234567890"}'

# Create a payment request
mayar payment create --data '{"name":"X","email":"x@y.com","amount":170000,"mobile":"08123","redirectUrl":"https://m.com","description":"Test","expiredAt":"2026-12-31T00:00:00.000Z"}'

# Dynamic QR for IDR 10,000
mayar qrcode 10000

# Webhooks
mayar webhook register https://example.com/hooks/mayar
mayar webhook test     https://example.com/hooks/mayar
mayar webhook history --limit 20

# Membership members
mayar membership members --productId prd-42 --limit 20

# SaaS license verify
mayar saas verify LIC-123 prd-42

# Pipe raw JSON to jq
mayar invoice list --json | jq '.data[] | {id, status}'
```

## Config

| Key      | Value                                                                                       |
| -------- | ------------------------------------------------------------------------------------------- |
| Path     | `$XDG_CONFIG_HOME/mayar/config.json`, defaulting to `~/.config/mayar/config.json` (chmod 600) |
| Endpoint | `MAYAR_API_URL` env or `https://api.mayar.id` (default)                                    |

Legacy installs that wrote to `~/.mayar/config.json` are migrated automatically on first run.

To rotate keys: `mayar config reset && mayar init`.

## Notes

- All requests use `Authorization: Bearer <key>`. Errors print `API <status> — <message>` and exit non-zero.
- `--data @file.json` reads from disk; `--data '{...}'` reads inline JSON.
- `MAYAR_API_URL` overrides the base URL — useful for staging or custom proxy environments.
- `mayar whoami` decodes the JWT locally and verifies the key live against `/hl/v2/balances`.
- **v1.0.0 migration**: all API paths moved from `/hl/v1/*` to `/hl/v2/*`. `--page` is no longer used (v2 has no page numbers); the cursor is returned as `nextStartingAfter` in each response and passed as `--after` for the next page.
