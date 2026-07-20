---
feature: login-env-and-skill-install
branch: feat/login-env-and-skill-install
base: "main"
work_type: MEDIUM
description: Environment selection (sandbox/production) for `mayar login` and `mayar init`, plus a new `mayar skill install` command that installs SKILL.md into agent directories
created_at: 2026-07-20T06:22:34.925Z
---

# Plan: Login Environment Selection & Skill Install Command

## Approach
Add `--sandbox`/`--production`/`--env` flags and an interactive TTY prompt to both `mayar login` and `mayar init` so users can choose between the sandbox (`web.mayar.club`) and production (`web.mayar.id`) environments. The chosen endpoint is persisted in `config.json` and resolved at runtime by `config.apiBaseUrl()`/`config.authBaseUrl()` via a priority chain: explicit env vars → invocation flags → NODE_ENV → stored config. Additionally, introduce `mayar skill install` which fetches SKILL.md from the GitHub raw URL and installs it into multiple AI agent skill directories (`.agents/`, `.claude/`, `.opencode/`, `.codex/`, `.cursor/`) with a Cursor-adapted `.mdc` variant.

## Phases
1. **Config layer endpoint resolution** — Refactor `config.js` to resolve endpoint from a flag-aware `resolveEndpoint()` helper that checks an optional runtime override (from `--sandbox`/`--production` flags), then NODE_ENV, then the stored `endpoint` in config.json. Fix `api.js` to call `config.apiBaseUrl()` dynamically on each request instead of snapshotting the base URL at module load time.
2. **Login environment selection** — Add `--sandbox`, `--production`, and `--env <sandbox|production>` flag handling in the login path. When run interactively in TTY mode without flags, present a numbered prompt ("Production / Sandbox") defaulting to production. Pass the resolved endpoint into config so `auth` and `endpoint` are saved together in `config.json`.
3. **Init environment selection** — Mirror the same `--sandbox`/`--production`/`--env` flags and interactive prompt into `mayar init`, saving `endpoint` alongside `apiKey` in `config.json` so first-time setup captures the user's preferred environment.
4. **Skill install command (fetch + target dirs)** — Create `src/commands/skill.js` implementing `mayar skill install`. Fetch SKILL.md from `https://raw.githubusercontent.com/mayarid/mayar-cli/refs/heads/main/SKILL.md`. Write the raw content to `.agents/skills/mayar/SKILL.md`, `.claude/skills/mayar/SKILL.md`, `.opencode/skills/mayar/SKILL.md`, and `.codex/skills/mayar/SKILL.md`. Support `--target <all|agents|claude|opencode|codex|cursor>` for selective install and `--force` to overwrite existing files.
5. **Cursor .mdc adaptation** — When `--target all` or `--target cursor` is selected, generate `.cursor/rules/mayar.mdc` with Cursor-specific `.mdc` frontmatter (YAML delimiters, `alwaysApply: true`, `description`, `globs`) wrapping an adapted version of the SKILL.md content so Cursor discovers and applies it as a project rule.
6. **CLI registration and help** — Register the `skill` command handler in `src/cli.js` (`mayar skill install` → `./commands/skill`), update `HELP()` text, and add `--sandbox`/`--production`/`--env` to the global flags documentation.

## Key Decisions
- **Endpoint resolution priority**: env vars (`MAYAR_API_URL`/`MAYAR_AUTH_URL`) > invocation flags (`--sandbox`/`--production`) > `NODE_ENV=development` > stored `endpoint` in config.json. Flag-based overrides win over NODE_ENV for the current invocation only.
- **SKILL.md source**: fetched from the GitHub raw URL at install time rather than bundled with the CLI, ensuring the latest agent instructions are always installed.
- **Cursor variant**: a separate `.mdc` file with Cursor-specific frontmatter rather than a symlink to the standard SKILL.md, since Cursor expects rule-format metadata.

## Out of Scope
- Environment selection for commands other than `login` and `init` (e.g., `balance`, `invoice` — they inherit the stored endpoint from config).
- `mayar skill remove` or `mayar skill update` subcommands (only `install` is implemented).
- Offline/cached SKILL.md fallback — network fetch is required; no bundled copy.
- Automatic skill installation during `mayar init` (users run `mayar skill install` separately).

## Dependencies
- Existing `src/config.js` (`load`/`save`/`apiBaseUrl`/`authBaseUrl`) — extended, not replaced.
- Existing `src/ui.js` (`ask`, `printBanner`, `dim`/`bold`/`green`/`cyan` helpers) — reused for the interactive prompt.
- Existing `src/cli.js` (`parseFlags`, `ensureKey`, `run`) — extended with new flags and command routing.
- `@mayaross/auth` SDK — already used by `login.js`; environment-aware `authBaseUrl()` is passed to it.
- No new npm dependencies required.

<!-- jonggrang:clarifications -->
## Clarifications
_Captured from the planning Q&A:_

Goal: Add environment selection (sandbox vs production) to `mayar login` and a new `mayar skill install` command that copies SKILL.md into target agent directories (.agents, .claude, .opencode, .codex, .cursor) for universal AI agent compatibility.

- **Where should `mayar skill install` get its SKILL.md content from?** → read from https://raw.githubusercontent.com/mayarid/mayar-cli/refs/heads/main/SKILL.md
- **For the Cursor target (.cursor/rules/mayar.mdc), should the content differ from the standard SKILL.md?** → Generate a Cursor-adapted version with .mdc-specific frontmatter and formatting
- **Should `mayar init` also gain environment selection (--sandbox / --production / interactive prompt)?** → Yes — add --sandbox / --production / interactive prompt to `mayar init` as well
- **When the user passes --sandbox or --production to `mayar login`, should that flag override NODE_ENV=development for the login invocation itself?** → The --sandbox/--production flag wins for this login invocation (overrides NODE_ENV)


<!-- jonggrang:appended 2026-07-20T10:27:59.275Z -->
## Appended 2026-07-20T10:27:59.275Z

# Plan: login-env-and-skill-install — Extension

## Approach
Introduce a `mayar docs` command that fetches `https://docs.mayar.id/llms.txt` as the canonical documentation index, parses it into browsable topic categories (Invoices, Products, Customers, Webhooks, Credit, Memberships, SaaS, etc.), and presents them interactively in the terminal. When run without arguments in a TTY, it shows a numbered menu of topics — selecting one fetches and displays the detailed Markdown documentation page. A keyword argument (e.g. `mayar docs invoice`) filters and displays matching endpoints directly. A `--json` flag outputs structured data for scripts and AI agents. The llms.txt index is cached locally under `~/.config/mayar/cache/llms.txt` with 24-hour automatic expiry and a `--refresh` flag to force re-fetch.

## Phases
1. **Create `src/commands/docs.js` — fetch, cache, and parse llms.txt** — Implement `fetchLlmsTxt()` using `https.get` with redirect following (same pattern as `skill.js`). Parse the llms.txt markdown into an array of `{ category, title, url, description }` entries grouped by `##` sections. Cache the raw index to `~/.config/mayar/cache/llms.txt` alongside a timestamp; on subsequent runs, reuse the cache unless it is older than 24 hours or `--refresh` is passed. On fetch failure with a fresh cache available, fall back to the cached copy gracefully.

2. **Interactive TTY browsing (`mayar docs` without arguments)** — When stdin is a TTY and no positional keyword is given, render a numbered list of categories extracted from llms.txt. Use `ui.ask()` to let the user pick a topic by number. On selection, fetch the documentation page URL, parse Markdown content, and print it with `ui.bold()` / `ui.dim()` formatting for readability. Support a "back" or "all" option to re-display the list.

3. **Keyword search (`mayar docs <topic>`)** — Filter parsed entries whose title, description, or URL path contains the keyword (case-insensitive). Display matches as a bullet list with title, URL, and snippet. If exactly one match, fetch and display the full page. If no matches, suggest running `mayar docs` without arguments to browse all topics.

4. **JSON output mode (`--json`)** — When `--json` is passed, output the parsed index (for `mayar docs`) or filtered matches (for `mayar docs <topic>`) as structured JSON via `ui.jsonOut()`. When combined with a keyword that yields a single match, include the fetched full-page content in the JSON payload.

5. **CLI registration and help** — Register `docs` as a command handled before the `ensureKey()` gate in `cli.js` (alongside `help`, `init`, `login`, `config`), since documentation is public and does not require an API key. Add a `Documentation:` section to the `HELP()` text listing `docs [topic]` with its description and flags.

## Key Decisions
- **No API key required**: The `docs` command is routed before `ensureKey()` in `run()`, matching the pattern of `help`, `init`, `login`, `api-key`, and `config`. Documentation is public.
- **llms.txt as canonical index**: The command fetches and parses `docs.mayar.id/llms.txt` at runtime rather than bundling a static list, ensuring the CLI always reflects the latest docs structure. Caching with 24h expiry avoids repeated network round-trips during active use.
- **Cache location**: `~/.config/mayar/cache/llms.txt` — a subdirectory of the existing Mayar config path, keeping all Mayar CLI state under one tree. Parent directories are created with `fs.mkdirSync({ recursive: true })`.
- **Graceful offline fallback**: If the network fetch fails but a valid cached copy exists, the command proceeds with the stale cache and prints a `dim` warning. Without any cache and no network, it errors with a clear message.
- **Markdown rendering**: Documentation pages are rendered as-is in the terminal (raw Markdown). No external Markdown renderer dependency is added — the existing `ui` helpers (`bold`, `dim`, `cyan`, `green`) are used for structural emphasis.

## Out of Scope
- A rendered/HTML view of documentation pages (raw Markdown only).
- Full-text search across documentation page bodies (only the llms.txt index entries are searched).
- `mayar docs open` or `mayar docs browser` to launch docs in a web browser.
- Automatic skill installation during docs browsing.
- Offline mode that bundles documentation with the CLI package.

## Dependencies
Builds on the existing plan's work — specifically the `src/ui.js` helpers (`ask`, `jsonOut`, `dim`, `bold`, `cyan`, `green`, `red`), the `https`-with-redirect-follow network pattern already established in `src/commands/skill.js`, and the `src/cli.js` `run()` command-routing structure (pre-`ensureKey` gate for public commands).
