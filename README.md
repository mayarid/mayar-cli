# mayar

Command-line interface for the [Mayar](https://docs.mayar.id) API. Production-only (`https://api.mayar.id`). Zero runtime dependencies — Node.js 18+ stdlib only.

## Install

```bash
npm install -g mayar
# or run without installing:
npx mayar --help
```

Or from source:

```bash
git clone https://github.com/mayarid/mayar-cli.git
cd mayar-cli
npm link        # exposes a `mayar` command on your PATH
```

## First run

The first time you invoke any command, the CLI prints an ASCII banner and asks for your production API key (input is masked). Paste it once; it's stored at `~/.config/mayar/config.json` (chmod 600, follows the [XDG Base Directory](https://specification.freedesktop.org/basedir-spec/latest/) spec) and reused on subsequent runs.

```bash
mayar balance
# ███╗   ███╗ █████╗ ██╗   ██╗ █████╗ ██████╗
# ...
# Welcome to Mayar CLI.
# No API key found. Get yours from https://web.mayar.id → Integration → API Key.
# Paste your production API key: ************
# ✓ Saved to /Users/you/.config/mayar/config.json
```

You can also run `mayar init` explicitly to (re-)configure the key, or pass `--api-key <key>` on any invocation to override.

## Commands

```
Setup
  init                                  Run first-time setup (interactive, masked input)
  api-key <key>                         Save API key non-interactively (e.g. for scripts)
  config show                           Show masked saved key
  config reset                          Remove the saved key

Account
  whoami                                Show merchant identity (decoded from JWT key) + verify
  balance                               GET /hl/v1/balance

Invoices
  invoice list [--page N --pageSize N]  GET /hl/v1/invoice
  invoice get <id>                      GET /hl/v1/invoice/{id}
  invoice close <id>                    GET /hl/v1/invoice/close/{id}
  invoice reopen <id>                   GET /hl/v1/invoice/open/{id}
  invoice create --data <json|@file>    POST /hl/v1/invoice/create

Products
  product list [--page N --pageSize N]  GET /hl/v1/product
  product search <keyword>              GET /hl/v1/product?search=...
  product type <type> [--page ...]      GET /hl/v1/product/type/{type}
  product get <id>                      GET /hl/v1/product/{id}
  product close <id>                    GET /hl/v1/product/close/{id}
  product reopen <id>                   GET /hl/v1/product/open/{id}

Single payment requests
  payment list                          GET /hl/v1/payment
  payment get <id>                      GET /hl/v1/payment/{id}
  payment close <id>                    GET /hl/v1/payment/close/{id}
  payment reopen <id>                   GET /hl/v1/payment/open/{id}
  payment create --data <json|@file>    POST /hl/v1/payment/create

Customers
  customer list [--page ...]            GET /hl/v1/customer
  customer create --data <json|@file>   POST /hl/v1/customer/create
  customer search <email>               GET /hl/v1/customer/detail?email=
  customer update <from> <to>           POST /hl/v1/customer/update
  customer magic-link <email>           POST /hl/v1/customer/login/portal

Transactions
  tx list   [--page ...]                GET /hl/v1/transactions          (paid)
  tx unpaid [--page ...]                GET /hl/v1/transactions/unpaid
  tx daily                              GET /hl/v1/transactions/daily

Reviews
  review list [--page ...]              GET /hl/v1/reviews

Dynamic QR
  qrcode <amount>                       POST /hl/v1/qrcode/create

Webhooks
  webhook register <url>                GET /hl/v1/webhook/register
  webhook test <url>                    POST /hl/v1/webhook/test
  webhook history [--page ...]          GET /hl/v1/webhook/history

Global flags
  --json                Output raw JSON instead of pretty tables
  --api-key <key>       Use this API key for the run (also accepts --api-key=KEY)
  --page N              Pagination page (default 1)
  --pageSize N          Pagination page size (default 10)
  -h, --help            Show help
  -v, --version         Show version

Environment
  MAYAR_API_KEY         Used when --api-key is not given and no config is saved
```

Resolution order: `--api-key` flag → `MAYAR_API_KEY` env → saved config.

## Examples

```bash
# Account balance
mayar balance

# Paginated lists
mayar invoice list --page 1 --pageSize 20
mayar product type ebook --pageSize 50

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
mayar webhook history --page 1 --pageSize 20

# Pipe raw JSON to jq
mayar invoice list --json | jq '.data[] | {id, status}'
```

## Config

| Key      | Value                                      |
| -------- | ------------------------------------------ |
| Path     | `$XDG_CONFIG_HOME/mayar/config.json`, defaulting to `~/.config/mayar/config.json` (chmod 600) |
| Endpoint | `https://api.mayar.id` (production, fixed) |

Legacy installs that wrote to `~/.mayar/config.json` are migrated automatically on first run.

To rotate keys: `mayar config reset && mayar init`.

## Notes

- Sandbox is intentionally not supported — this CLI hits production only.
- All requests use `Authorization: Bearer <key>`. Errors print `API <status> — <message>` and exit non-zero.
- `--data @file.json` reads from disk; `--data '{...}'` reads inline JSON.
