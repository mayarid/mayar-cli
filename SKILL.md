---
name: mayar
display_name: Mayar CLI
version: "1.2.0"
description: >
  Mayar API & CLI integration skill.
  - APP INTEGRATION: Use `mayar docs <topic>` to read REST API specs (endpoints, schemas), then write native HTTP requests (fetch/axios) in user app code. Do NOT run CLI inside backend scripts.
  - DIRECT SHELL / ADMIN TASKS: Use Mayar CLI commands directly (`mayar invoice list`, `mayar balance`, `mayar product create`, `mayar status`, etc.) for direct operational and testing tasks in terminal.
  Targets Mayar API v2. Node.js 18+.
author: Mayar bot
license: MIT
homepage: https://github.com/mayarid/mayar-cli
repository: https://github.com/mayarid/mayar-cli.git
tags:
  - payments
  - invoices
  - mayar
  - indonesia
  - cli
  - tool
runtime: node>=18
install_command: npx -y mayar@latest
invoke_prefix: npx -y mayar@latest
env:
  MAYAR_API_KEY:
    description: Mayar API key. Obtain from web.mayar.id → Integration → API Key.
    required: false
    secret: true
  MAYAR_API_URL:
    description: Override API base URL. Defaults to https://api.mayar.id (or api.mayar.club for sandbox).
    required: false
    default: https://api.mayar.id
  MAYAR_AUTH_URL:
    description: Override Auth server base URL for login.
    required: false
auth:
  type: bearer
  resolution_order:
    - flag: --api-key
    - env: MAYAR_API_KEY
    - file: ~/.config/mayar/config.json
capabilities:
  - docs
  - agent-skills
  - environment-switching
  - invoices
  - invoice-status
  - products
  - product-status
  - product-creation
  - payment-links
  - payments
  - payment-status
  - customers
  - transactions
  - reviews
  - reviews-crud
  - webhooks
  - qrcode
  - static-qris
  - payment-channels
  - balance
  - whoami
  - bundling
  - installments
  - membership
  - credit-wallets
  - discounts
  - saas-licensing
  - software-licensing
---

# Mayar CLI — Agent Skill

This document describes how AI agents (Claude Code, OpenClaw, Codex, Cursor, and others)
should install, authenticate, select environments, search docs, and execute commands using the `mayar` CLI tool.

## AI Agent Usage Guidelines & Decision Matrix

AI agents MUST distinguish between **coding application integrations** vs **direct shell administration & testing**:

| User Intent / Task | Correct Action | Recommended Tool / Command |
| --- | --- | --- |
| **A. Implementing Mayar API in Application Code** (e.g. Node.js, Express, Next.js, FastAPI, Laravel) | 1. Read API specs & schemas via `mayar docs`<br>2. Write native HTTP requests (`fetch`, `axios`) in app source code.<br>*(Do NOT wrap CLI commands in backend handlers)* | `npx -y mayar@latest docs <topic> [--json]` |
| **B. Direct Shell Operations & Administrative Tasks** (e.g. check balance, list invoices, create test product, register webhook) | Execute Mayar CLI commands directly in terminal for fast, convenient administration & testing | `npx -y mayar@latest balance`<br>`npx -y mayar@latest invoice list`<br>`npx -y mayar@latest product create`<br>`npx -y mayar@latest status` |

## Quick start for agents

```bash
# Always use the latest version — no install step required
npx -y mayar@latest whoami
```

## Setup & Authentication

**Step 1 — Detect active user & environment**

Run `whoami` to check if a valid API key is already configured:

```bash
npx -y mayar@latest whoami --json
```

Successful output contains `"valid": true` and merchant details (`name`, `email`, `accountId`).

**Step 2 — Environment selection (Production vs Sandbox)**

Target production (`api.mayar.id`) or sandbox (`api.mayar.club`) via flags or environment variables:

```bash
# Production (default)
npx -y mayar@latest --production whoami

# Sandbox
npx -y mayar@latest --sandbox whoami
# OR
npx -y mayar@latest --env sandbox whoami
```

> **Endpoint Resolution Order:**
> Invocation flags (`--sandbox` / `--production` / `--env`) → `MAYAR_API_URL` → `NODE_ENV=development` → saved config (`~/.config/mayar/config.json`) → Production (`api.mayar.id`).

**Step 3 — Handle missing or invalid key**

If `whoami` exits non-zero or returns `"valid": false`, authentication is needed:

> **Option A — Non-interactive API key command (recommended for agents):**
> ```bash
> npx -y mayar@latest api-key <your_api_key>
> ```
>
> **Option B — Environment variable:**
> ```bash
> export MAYAR_API_KEY=<your_api_key>
> ```
>
> **Option C — Pass key per invocation:**
> ```bash
> npx -y mayar@latest --api-key <your_api_key> whoami
> ```
>
> **Option D — Browser OAuth login (interactive sessions):**
> ```bash
> npx -y mayar@latest login [--no-browser]
> ```
>
> **Option E — Interactive wizard:**
> ```bash
> npx -y mayar@latest init
> ```

Get an API key at: **https://web.mayar.id → Integration → API Key**

---

## Agent Skills Installation

Agents can install Mayar SKILL.md instructions into local workspace/agent configuration directories:

```bash
# Install to all supported agent directories
npx -y mayar@latest skill install --target all

# Target specific agent frameworks (claude, opencode, codex, cursor, agents)
npx -y mayar@latest skill install --target claude
npx -y mayar@latest skill install --target cursor --force
```

---

## Documentation Search (`docs`)

Search or browse Mayar API documentation directly from the CLI:

```bash
# Search topics with relevance ranking (returns top 5 matches by default)
npx -y mayar@latest docs payment

# Fetch full documentation content for a specific slug/topic
npx -y mayar@latest docs create-payment-link

# Filter by section/category
npx -y mayar@latest docs --section "Invoice"

# JSON output with compact topic metadata (saves ~65% tokens for LLM context)
npx -y mayar@latest docs payment --json --compact --limit 3

# Show all matching topics without capping
npx -y mayar@latest docs payment --all

# Force refresh cached llms.txt index
npx -y mayar@latest docs --refresh
```

---

## Usage Reference

### Setup & Config

```bash
npx -y mayar@latest init                                # Interactive setup (key + env)
npx -y mayar@latest login [--no-browser]                # Browser OAuth sign-in
npx -y mayar@latest status                              # Show environment, user identity, & API key status
npx -y mayar@latest api-key <key>                       # Save API key non-interactively
npx -y mayar@latest config show                         # Show config path & masked key
npx -y mayar@latest config reset                        # Reset saved API key & config
```

### Account

```bash
npx -y mayar@latest status              # Show active environment, identity, & API key
npx -y mayar@latest whoami              # Verify key + show identity
npx -y mayar@latest balance             # Get account balance
```

### Invoices

```bash
npx -y mayar@latest invoice list [--limit N --after CURSOR]
npx -y mayar@latest invoice get <id>
npx -y mayar@latest invoice create --data '<json|@file>'
npx -y mayar@latest invoice edit <id> --data '<json|@file>'
npx -y mayar@latest invoice status <id> <open|close|active|closed|unlisted>
npx -y mayar@latest invoice close <id>
npx -y mayar@latest invoice reopen <id>
npx -y mayar@latest invoice filter --email <email> [--limit N --after CURSOR]
```

### Products & Payment Links

```bash
npx -y mayar@latest product list [--limit N --after CURSOR --search Q --type T]
npx -y mayar@latest product search <keyword>
npx -y mayar@latest product type <ebook|course|membership|saas|event|webinar>
npx -y mayar@latest product get <id>
npx -y mayar@latest product create --type <T> --data '<json|@file>'
npx -y mayar@latest product edit <id> --data '<json|@file>'
npx -y mayar@latest product status <id> <open|close|active|closed|unlisted>
npx -y mayar@latest product close <id>
npx -y mayar@latest product reopen <id>
npx -y mayar@latest product transactions <id> [--limit N --after CURSOR]
npx -y mayar@latest payment-link edit <id> --data '<json|@file>'
```

### Single Payments

```bash
npx -y mayar@latest payment list [--limit N --after CURSOR --status paid|unpaid|closed]
npx -y mayar@latest payment get <id>
npx -y mayar@latest payment create --data '<json|@file>'
npx -y mayar@latest payment edit <id> --data '<json|@file>'
npx -y mayar@latest payment status <id> <open|close|active|closed|unlisted>
```

### Customers

```bash
npx -y mayar@latest customer list [--limit N --after CURSOR]
npx -y mayar@latest customer get <id>
npx -y mayar@latest customer create --data '<json|@file>'
npx -y mayar@latest customer search <email>
npx -y mayar@latest customer update <fromEmail> <toEmail>
npx -y mayar@latest customer magic-link <email>
```

### Transactions

```bash
npx -y mayar@latest tx list   [--limit N --after CURSOR --status --customerId --startAt --endAt]
npx -y mayar@latest tx unpaid [--limit N --after CURSOR]
npx -y mayar@latest tx daily
npx -y mayar@latest tx product <productId> [--limit N --after CURSOR]
```

### Reviews

```bash
npx -y mayar@latest review list [--limit N --after CURSOR --status --paymentLinkId --rating]
npx -y mayar@latest review stats [productId]
npx -y mayar@latest review create --data '<json|@file>'
npx -y mayar@latest review update <id> --data '<json|@file>'
npx -y mayar@latest review bulk-status --data '<json|@file>'
```

### QR & Payment Channels

```bash
npx -y mayar@latest qrcode <amount_in_idr>     # Dynamic QRIS
npx -y mayar@latest qrcode static              # Static QRIS image
npx -y mayar@latest qrcode channels            # Enabled payment channels
```

### Webhooks

```bash
npx -y mayar@latest webhook register <url>
npx -y mayar@latest webhook test <url>
npx -y mayar@latest webhook history [--limit N --after CURSOR]
npx -y mayar@latest webhook new-history [--limit N --after CURSOR]
npx -y mayar@latest webhook retry <historyId>
```

### Memberships & Licensing

```bash
# Memberships
npx -y mayar@latest membership members --productId <id>
npx -y mayar@latest membership tiers --productId <id>
npx -y mayar@latest membership register --data '<json|@file>'

# SaaS & Software Licensing
npx -y mayar@latest saas activate <licenseCode> <productId>
npx -y mayar@latest saas deactivate <licenseCode> <productId>
npx -y mayar@latest saas verify <licenseCode> <productId>
npx -y mayar@latest software verify <licenseCode> <productId>
```

---

## Global Flags

| Flag | Description |
| --- | --- |
| `--json` | Output raw JSON (machine-readable) |
| `--compact` | Compact JSON output (slug, title, section only for docs) |
| `--limit N` | Page size / result limit (v2 pagination, default 10, max 50) |
| `--after CURSOR` | Cursor for pagination (`nextStartingAfter` from previous response) |
| `--api-key <key>` | Override API key for invocation |
| `--sandbox` | Target sandbox environment (`api.mayar.club`) |
| `--production` | Target production environment (`api.mayar.id`) |
| `--env <value>` | Set environment: `sandbox` or `production` |
| `--data <json|@file>` | Inline JSON string or path to JSON file (`@file.json`) |
| `--refresh` | Force re-fetch cached data (for `docs`) |
| `-v, --version` | Print version |
| `-h, --help` | Print help |

---

## JSON Output Examples

Always use `--json` when parsing programmatically:

```bash
# List active invoices
npx -y mayar@latest invoice list --json | jq '.data[] | {id, status, amount}'

# Check merchant identity
npx -y mayar@latest whoami --json | jq '{valid, name: .decoded.name}'

# Query documentation in compact JSON mode
npx -y mayar@latest docs payment --json --compact --limit 3
```

---

## Error Handling

- **Non-zero exit code**: Command failed or invalid parameters.
- **`"valid": false`**: API key missing or unauthorized.
- **HTTP Errors**: Standardized error format `{ "statusCode": 400, "messages": "..." }`.

---

## Agent Decision Tree

```
START: Determine User Intent
  │
  ├─► TASK A: Writing Application Code (Backend / Frontend / Script)
  │     ├─ 1. Run: npx -y mayar@latest docs <topic> [--json]
  │     └─ 2. Write native HTTP requests (fetch/axios) in user app source files
  │
  └─► TASK B: Direct Shell Administration, Testing, & Operations
        ├─ 1. Check Auth: npx -y mayar@latest whoami --json
        │     ├─ valid=true  →  Execute CLI command directly (e.g. mayar balance, mayar invoice list)
        │     └─ valid=false →  Prompt user for API Key or run: mayar api-key <KEY> / mayar login / MAYAR_API_KEY
```
