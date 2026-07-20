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
