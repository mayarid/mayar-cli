# AGENTS.md — mayar-cli

> This file is human-curated project knowledge for AI agents.
> Agents may propose updates, but humans approve them.
> Research shows human-written AGENTS.md improves agent success ~4%.

---

## Project Overview

- **Name**: mayar-cli
- **Type**: CLI (an HTTP client for the Mayar payment API v2)
- **Stack**: plain Node.js JavaScript, CommonJS (`require`), no build step, no TypeScript
- **Node**: 22 or later (`package.json` `engines`)
- **Description**: The `mayar` command. People and AI agents use it to manage
  Mayar products, invoices, customers, webhooks and more. Published to npm as
  `mayar`.
- **Domain words**: read `GLOSSARY.md` first, and use its terms.

---

## Conventions

### File Structure
```
bin/mayar.js          # entry point, calls src/cli.js run()
src/cli.js            # HELP text, parseFlags, credential resolution, command dispatch
src/api.js            # the only HTTP transport (https.request) for the Mayar API
src/config.js         # config file (~/.config/mayar/config.json) + sandbox/production base URLs
src/util.js           # checkResp, readData (--data), pagination, cursorFooter, maybeJson
src/ui.js             # colors, tables, jsonOut, prompts, banner
src/commands/<name>.js  # one module per top-level command, exports run({ apiKey, flags, positional })
test/*.test.js        # node:test suites
test/helpers.js       # captureOutput, temp config dir, local HTTP server
docs/adr/             # architecture decisions
docs/research/        # research notes
```

### Naming Conventions
- Files: `kebab-case.js` (for example `payment-link.js`)
- Functions and variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` (for example `USAGE`, `STATUS_ACTIONS`)
- Command names and flags: kebab-case on the command line

### Code Patterns
- A command module has one `async function run({ apiKey, flags, positional })`
  with a `switch` on the subcommand. Register a new command in the `handlers`
  map and in the `HELP` text in `src/cli.js`, and in `README.md`.
- Every API call goes through `api.request(method, path, { apiKey, body, query })`.
  Call `checkResp(res)` right after it. Do not call `https` directly from a command.
- Encode path parts with `encodeURIComponent`.
- Read `--data` with `readData(flags.data)` (inline JSON or `@file`).
- Use `pagination(flags, extra)` for list queries and `cursorFooter` after a table.
- Output: `--json` prints the raw body with `ui.jsonOut`; otherwise print a
  table with `ui.table`. Errors are `throw new Error(...)`; `src/cli.js` prints
  them to stderr and exits 1.
- Usage errors throw `Usage: mayar <command> ...` messages.

### Testing Conventions
- Framework: `node:test` and `node:assert/strict`. No test dependencies.
- Command: `npm test` (coverage: `npm run test:coverage`)
- Pattern: to test a command without network, replace `api.request` with a stub
  that records `{ method, pathname, opts }`, run the command, and restore the
  stub in `finally`. See the membership tests in `test/cli.test.js`.
- To test `src/api.js`, use the local HTTP server in `test/helpers.js` with
  `MAYAR_API_URL`.
- Never call the real Mayar API from a test.

---

## Known Gotchas

- `--sandbox` must point to `api.mayar.io`. `api.mayar.club` is an old domain.
- `parseFlags` takes the next argument as the value of any unknown `--flag`.
- A Mayar reply can have HTTP 200 and still say the request failed (a
  "rejected response" in `GLOSSARY.md`).
- `ui.js` decides colors once, from `process.stdout.isTTY`, when it loads.
- Config is read on every `config.load()` call. Tests must point
  `XDG_CONFIG_HOME` to a temp folder (see `test/helpers.js`).

---

## Architecture Decisions

See `docs/adr/`. In short:

- The CLI is a thin client with a few guards. It is not a copy of mayar-mcp's
  guard layer (`docs/adr/0001-thin-client-with-few-guards.md`).
- The official agent skill lives in `mayarid/skills`, not in this repo
  (`docs/adr/0002-official-skill-lives-in-mayarid-skills.md`).

---

## Dependencies & Integrations

- Mayar API v2: production `https://api.mayar.id`, sandbox `https://api.mayar.io`.
  Override with `MAYAR_API_URL`. Docs: https://docs.mayar.id
- `@mayaross/auth`: the only runtime dependency. It does the browser sign-in for
  `mayar login`.
- Credentials: `--api-key`, then `MAYAR_API_KEY`, then the saved API key, then
  the saved login token.
- Sibling project: [mayar-mcp](https://github.com/mayarid/mayar-mcp), an MCP
  server for the same API. Gap analysis: `docs/research/mayar-mcp-gap-analysis.md`.

---

## Development Setup

```bash
npm install
npm test
node bin/mayar.js --help     # or: npm link, then: mayar --help
MAYAR_API_KEY=<sandbox key> node bin/mayar.js --sandbox balance
```

## Release

Follow the checklist at the end of `CHANGELOG.md`. Add an `[Unreleased]` entry
for every change a user can see.

---

## Jonggrang Workflow

Jonggrang uses a **two-phase planning** flow so humans can review and edit a plan before AI decomposes it into tasks.

### Full workflow

```bash
# Phase 1 — generate a human-readable draft plan
jonggrang plan "add JWT authentication"
# → AI writes .jonggrang/.drafts/<session>/plan.md (high-level, no tasks yet)
# → Interactive options:
#     Approve           → run Phase 2 immediately
#     Edit with AI      → describe changes, AI revises plan, loop back
#     Edit in $EDITOR   → open editor, loop back
#     Save draft        → exit, run "jonggrang approve" later
#     Abort             → discard the draft plan.md

# Resume after accidental close:
jonggrang plan
# → no description → shows list of pending + archived plans
# → pick one → shows plan + interactive options again

# Phase 2 — approve plan → decompose into tasks
jonggrang approve
# → AI reads .jonggrang/.drafts/<session>/plan.md → runs `jonggrang task import` to create tasks
# → plan.md is archived to .jonggrang/.output/features/<featureId>/plan.md

# Execute tasks
jonggrang work
```

### Shorthand options

```bash
# Plan + auto-approve + tasks in one shot (skips human review)
jonggrang plan "add JWT auth" --yes

# Deep mode: 3-phase analysis (discovery + brainstorm + condense) → enriched plan
# Adds Affected Areas, Risks, and Alternatives Considered sections to plan.md
jonggrang plan "add JWT auth" --deep

# Deep mode + auto-approve in one shot
jonggrang plan "add JWT auth" --deep --yes

# Full pipeline: plan → approve → execute in one shot
jonggrang work "add JWT auth" --yes

# Execute existing tasks only (skip pending plan warning)
jonggrang work --ignore-plan
```

### Modifying an approved plan

| Situation | Command |
|-----------|---------|
| Add new scope on top of done work | `jonggrang plan "also add rate limiting"` |
| Change remaining pending work | `jonggrang plan "use Passport.js instead"` |
| Undo completed tasks | Not supported — create new tasks to override |

**Rule: completed tasks are immutable.** They reflect real code. Any correction must be a new task that fixes/replaces the previous implementation.

### Plan file format

```markdown
---
feature: jwt-auth
branch: feat/jwt-auth
work_type: MEDIUM
description: JWT authentication with login, register, refresh
created_at: 2026-04-16T10:30:00Z
---

# Plan: JWT Authentication

## Approach
...

## Phases
1. DB schema — users + refresh_tokens
2. Auth service — register/login/refresh
3. JWT middleware
...

## Key Decisions
- Token storage: httpOnly cookie

## Out of Scope
- OAuth, 2FA, email verification
```

---

## Bug Reporting

When you discover a defect **outside the scope of your current task**, report it immediately:

```bash
# Report a bug and create a BUGFIX task in one shot
jonggrang bug "description of what is broken" --feature <feature_id>
# When asked "Create a task now?" → y

# Or save for later (batch convert)
jonggrang bug "description" --feature <feature_id>
# When asked "Create a task now?" → n
jonggrang bug convert --feature <feature_id>   # converts all open bugs to tasks later
```

Get the `feature_id` by running: `jonggrang task show <id>` — look for the `feature_id` field in the output.

**Rules:**
- Do NOT fix out-of-scope bugs inline — stay focused on your current task
- Report real defects only (crashes, wrong return values, broken edge cases)
- Do NOT report style issues, TODOs, or future features — those go in the plan

Bug reports are saved to `.jonggrang/.output/features/<feature_id>/bugs.md` and can be viewed with:
```bash
jonggrang bug list
```

---

## Task Management CLI

Use the `jonggrang task` CLI to manage tasks instead of editing `.jonggrang/jonggrang-tasks.json` directly.

### Commands

```bash
# List & inspect
jonggrang task list                         # list all tasks (JSON output)
jonggrang task list pending                 # filter by status
jonggrang task show task-001                # show task detail
jonggrang task next                         # show next eligible task

# Create & modify
jonggrang task add --title "Add login page" --priority 1
jonggrang task add --title "Write tests" --blocked-by task-001
jonggrang task update task-001 --status in_progress
jonggrang task update task-001 --files src/login.ts,src/login.test.ts

# Complete & block
jonggrang task done task-001                # mark completed + passes=true
jonggrang task block task-002 --reason "Waiting for API spec"

# Remove (cleans up blocked_by refs)
jonggrang task remove task-003
```

### Output

- Default output is **JSON** (machine-readable for agents)
- Add `--pretty` for human-readable table format
- Add `--json` to force JSON when in a TTY

### Available flags for add/update

| Flag | Description |
|------|-------------|
| `--title` | Task title |
| `--desc` | Task description |
| `--priority` | Priority (1 = highest) |
| `--status` | pending, in_progress, completed, blocked, waiting, skipped |
| `--skill` | Skill name |
| `--blocked-by` | Comma-separated dependency task IDs |
| `--files` | Comma-separated file paths |
| `--reason` | Reason (used with `block`) |

---

## Jonggrang Notes

This section is updated by Jonggrang during work sessions.
Human should review and curate periodically.

### Patterns Discovered
<!-- Agent appends here, human curates -->

### Gotchas Discovered
<!-- Agent appends here, human curates -->
