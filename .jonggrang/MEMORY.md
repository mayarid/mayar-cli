---
updated_at: 2026-07-20T09:43:34.034Z
scope: project
tags: [cli-patterns, config-management, interactive-prompts, help-documentation]
---

## Conventions

- **Two-touchpoint rule for new CLI commands**: Adding a command to mayar-cli requires changes in both the `handlers` map (routing) and the `HELP()` function (documentation) in `src/cli.js`. Missing either results in an unreachable or undocumented command. Consider adding a lint rule or test that verifies every handler key has a corresponding HELP section. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

- **Uniform force/skip logic for file generation**: When a command generates files for multiple target types (each potentially with custom content generation), the force/overwrite vs skip-existing logic should be identical across all targets. Branch only on content generation, not on file-writing behavior. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

## Known Pitfalls

- **HELP text can silently drift from actual flag support**: Global flags and environment documentation in the `HELP()` function are manually maintained and have no automated validation against `parseFlags()` or the actual flag handling code. A test comparing supported flags against HELP text content would catch drift. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

- **Both CLI entrypoint and individual commands may call the same config setter**: When `cli.js` sets a runtime default (e.g., `setRuntimeEndpoint(null)`) and individual commands later call the same setter with user choices, the command's call wins only because it executes later in the same process. This temporal coupling is fragile — if dispatch order changes, defaults could clobber user choices. Document this dependency explicitly. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

## Architectural Decisions

- **Config resolution priority chain**: Environment variables always win (absolute precedence). Below that: runtime override (set programmatically) → stored config file → hardcoded default. This chain is applied uniformly across all URL resolution functions (`apiBaseUrl()`, `authBaseUrl()`, `resolveEndpoint()`). The `MAYAR_API_URL` and `MAYAR_AUTH_URL` env vars are checked first in their respective functions, before consulting the resolution chain. This absolute precedence is intentional and must be preserved. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

- **No caching layer in config resolution**: Calling `load()` (read from disk) on every resolution is simple, correct, and avoids staleness bugs. Performance is negligible for a small JSON config file. Resist adding in-memory caches unless profiling proves they are needed. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

- **Runtime endpoint set before dispatch**: Set the runtime environment/endpoint in `cli.js`'s `run()` before version/help/command dispatch so all commands — including early-exit paths like `--version` and `--help` — see the correct configuration. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

## Repeated Lessons

- **Interactive prompt layered guard pattern**: When adding an interactive TTY prompt to a command, layer the guard conditions from cheapest to most expensive: CLI flags first (explicit user intent bypasses prompt) → `stdin.isTTY` (don't prompt in pipes) → stored preference (respect prior choices where appropriate) → env vars (e.g., `NODE_ENV`). The exact guards vary by command semantics: recurring commands like `login` should check stored state and `NODE_ENV`; one-time setup commands like `init` should only check flags and TTY to always offer the choice. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

- **Redirect-following with internal closure for HTTP**: When fetching remote content with Node.js `https.get`, use an internal `doFetch` closure (not recursion on the outer function) to follow redirects. Resolve relative redirect URLs with `new URL(res.headers.location, originalUrl)`. Cap redirect hops (e.g., 3) to prevent infinite loops. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))

- **YAML frontmatter stripping by delimiter marker**: When adapting fetched Markdown content that carries its own YAML frontmatter (delimited by `---`), detect the opening and closing delimiters with `line.trim() === '---'` for robustness against trailing whitespace and carriage returns. This avoids nested `---` issues when prepending new frontmatter. ([login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/MEMORY.md))
