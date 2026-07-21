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


<!-- jonggrang:appended 2026-07-20T10:46:24.307Z -->
## Appended 2026-07-20T10:46:24.307Z

# Plan: login-env-and-skill-install — Extension

## Approach
Add a `mayar docs [topic]` command that browses and displays Mayar API documentation directly in the terminal. The canonical source of truth for the documentation index is `https://docs.mayar.id/llms.txt` — a structured Markdown file maintained by the docs team that lists every documentation page with its title, URL, and description. The CLI fetches this file on demand, parses it into a structured topic map grouped by section (`Docs`, `OpenAPI Specs`, `Optional`), and caches the raw llms.txt content locally at `~/.config/mayar/cache/llms.txt` with a 24-hour TTL so repeated invocations are fast and offline-tolerant. A `--refresh` flag forces a fresh fetch (ignoring the cache).

The core UX is terminal-native — no browser opening:
- **No arguments (TTY)**: displays an interactive numbered list of documentation categories and topics that the user can navigate and select. Selecting a topic fetches and renders the actual documentation page content from `docs.mayar.id` directly in the terminal.
- **With a topic keyword** (e.g. `mayar docs invoice`): filters the parsed topic index by keyword (case-insensitive, partial match against title and description) and displays matching entries with summaries. If exactly one match is found, fetches and renders the full documentation page content inline.
- **Non-TTY / piped**: when stdout is not a TTY, the interactive prompt is skipped. Instead, the command prints the categorized topic list (without arguments) or filtered matches (with a topic), making it usable in scripts and pipes.
- **`--json` flag**: outputs structured JSON (the full topic index, filtered matches, or a single topic's metadata and page content) — intended for AI agents and programmatic consumers.

When a documentation page is displayed in the terminal, the CLI fetches the HTML page from `docs.mayar.id`, extracts the main content (stripping navigation, headers, and footers to keep output focused), and renders it with basic terminal formatting (headings, code blocks, lists). The page content is not cached — only the llms.txt index is cached — because users expect fresh documentation on each view.

No new npm dependencies are required. Fetching uses Node's built-in `https` module (already used by `src/api.js`). HTML-to-text extraction is done with simple regex/string processing — no external parser needed since `docs.mayar.id` pages are Markdown-rendered and the main content area is predictable.

## Phases
1. **Docs command module** — Create `src/commands/docs.js` with a `run()` function. On invocation, fetch `https://docs.mayar.id/llms.txt` (if cache is missing, expired, or `--refresh` is set), parse the Markdown into a structured topic map grouped by section (`Docs`, `OpenAPI Specs`, `Optional`), and cache the raw response to `~/.config/mayar/cache/llms.txt` alongside a `fetchedAt` timestamp in a companion `~/.config/mayar/cache/llms-meta.json` file. Each parsed entry stores: normalized topic slug (dashed-lowercase from the link title), display title, URL, description, and parent section. Implement the three UX paths: (a) interactive numbered selection when TTY and no topic given, (b) keyword-filtered display when a topic argument is provided, (c) plain text listing when non-TTY. Implement topic resolution: case-insensitive, dashed-normalized matching with a "did you mean?" suggestion on no exact match. If the fetch fails and no cache exists, print an error with a link to `https://docs.mayar.id` for manual browsing. If the fetch fails but a stale cache exists, use it with a `dim` warning.
2. **Interactive selection helper** — Add a small `pickFromList(items, { displayKey, descriptionKey })` utility to `src/ui.js` that renders a numbered list, prompts the user for a number (or `q` to quit), validates input, and returns the selected item. Uses the existing `ask()` readline pattern already present in `src/ui.js`.
3. **Content fetcher and renderer** — Implement `fetchPageContent(url)` and `renderContent(html)` within `src/commands/docs.js`. `fetchPageContent` uses `https.get` to retrieve the documentation page HTML. `renderContent` extracts the main content region (targeting the `<main>` or `<article>` element, or the Markdown-rendered body area), strips HTML tags, decodes entities, and formats output for the terminal: headings in `bold`, code blocks indented, lists preserved, and horizontal rules as `dim` separators. Page fetches respect a short timeout (10s) and print a clear error if unreachable.
4. **CLI registration and help** — Register `docs` as a command in `src/cli.js` (handlers map) and add a `Documentation` section to the `HELP()` text showing `docs [topic] [--json] [--refresh]` with a short description. Also parse the `--refresh` flag in `parseFlags()` so it is available globally.
5. **JSON mode** — When `--json` is passed alongside `docs`: without a topic, output `{ topics: [{ slug, title, url, description, section }] }`. With a topic that has a single exact match, fetch the page content and output `{ topic, title, url, content: "<extracted text>" }`. With a topic that has multiple matches, output `{ matches: [{ topic, title, url, description }] }`. This enables AI agents and scripts to discover and consume documentation programmatically.

## Key Decisions
- **Terminal-first UX**: documentation is displayed inline in the terminal rather than opened in a browser. This is the primary differentiator from the original plan — users and AI agents can browse, search, and read Mayar API documentation without leaving the terminal. The browser is never opened; if the user wants the web view, they can copy the URL from the rendered output.
- **`llms.txt` as source of truth**: the topic-to-URL mapping is not hardcoded in the CLI. Instead it is fetched from `https://docs.mayar.id/llms.txt` at runtime and cached locally. This ensures the CLI always surfaces the latest docs structure without requiring a CLI release, and keeps the llms.txt file as the single source of truth shared by all Mayar tooling (AI agents, MCP servers, the CLI).
- **Local cache with TTL**: llms.txt is cached at `~/.config/mayar/cache/llms.txt` with metadata at `~/.config/mayar/cache/llms-meta.json` containing the `fetchedAt` timestamp. Default TTL is 24 hours. The cache directory is created under the existing `~/.config/mayar/` config directory. A `--refresh` flag lets users explicitly bypass the cache.
- **Page content fetched on demand, not cached**: only the llms.txt index is cached. Individual documentation pages are fetched live on each view to ensure users see the latest content. This keeps the cache lightweight and avoids stale page content issues.
- **Topic slugs derived from link titles**: llms.txt link titles (e.g. `Create Invoice`, `Get Customer`, `Account Setup`) are normalized into dashed lowercase slugs (`create-invoice`, `get-customer`, `account-setup`) for discovery. Users can also pass partial matches; the command prints a "did you mean?" suggestion on no exact match. The interactive list helps users discover exact names.
- **Interactive selection via readline**: uses the same `readline`-based `ask()` pattern already in `src/ui.js` rather than a full TUI framework. This keeps the CLI lightweight with zero new dependencies.
- **HTML-to-text via simple extraction**: rather than pulling in a full HTML parser like cheerio, the content extractor uses regex to find the main content area and strips tags. `docs.mayar.id` pages have a predictable structure (Markdown rendered to HTML), making this approach reliable without adding dependencies.
- **`--json` flag** returns structured output for agents and scripts — consistent with the global `--json` convention used by all other commands. When a topic is matched, the JSON payload includes the extracted page content so agents can consume the full documentation text.

## Out of Scope
- `mayar docs search <query>` (full-text search across all documentation page content — only topic title/description matching is implemented)
- Offline/cached documentation page content (only the llms.txt index is cached; page content is always fetched live)
- `mayar docs open` as an alias (just `mayar docs <topic>` is sufficient)
- Localized documentation (always fetches from the default docs.mayar.id locale; if llms.txt later adds locale-specific sections, the parser can be extended)
- Auto-refresh in the background (explicit `--refresh` is sufficient for a CLI tool)
- Opening documentation in a browser (the command is terminal-only; users can manually open URLs from the rendered output if desired)
- Rich terminal rendering (syntax highlighting, markdown tables, or colored output beyond basic bold/dim — the focus is on readable plain text extraction)

## Dependencies
Builds on the existing plan's work. Uses the global flag parsing (`--json`), UI helpers (`green`, `cyan`, `bold`, `dim`, `ask` from `src/ui.js`), the config directory path (`src/config.js`'s `dir` for cache storage at `~/.config/mayar/cache/`), and the command registration pattern established by all other commands in `src/cli.js`. The fetch uses Node's built-in `https` module (already used by `src/api.js`), so no new runtime dependencies are needed. Adds a small `pickFromList()` helper to `src/ui.js` for the interactive selection UX. No changes to the auth flow or API layer required.
