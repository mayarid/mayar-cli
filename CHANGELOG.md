# Changelog

All notable changes to `mayar` (mayar-cli) are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Node.js 22 or later is now required (was 18). Node 18 and 20 no longer get
  security fixes.
- `--sandbox` now uses `api.mayar.io`, `auth.mayar.io` and `web.mayar.io`. The
  old `*.mayar.club` domain did not work. Set `MAYAR_SANDBOX_LEGACY=1` to reach
  it on purpose; the CLI then prints a deprecation warning.
- New error format: `<METHOD> <path> failed (<status>) — <message>`, with the
  detail capped at 500 characters and a `Hint:` line when there is a known fix.
  A 401 names the host and the account the key claims to be, and suggests the
  other environment. 5xx and non-JSON replies no longer print stack traces or
  HTML pages (use `MAYAR_DEBUG=1`).

### Security

- `webhook register` and `webhook test` refuse non-http(s), private, loopback,
  link-local, cloud-metadata and reserved targets (also after DNS lookup), and
  well-known non-HTTP ports. Nothing is sent when a URL is refused.
- Text from the API is cleaned of terminal escape sequences before it is
  printed. `--json` output escapes them and keeps the same data.
- `customer create`, `customer update` and `invoice create` ask before they send
  HTML-like text in customer-facing fields, and refuse it without a terminal.

### Added

- Requests time out after 30 seconds (`MAYAR_TIMEOUT_MS` to change).
- HTTP 429: up to 3 retries with exponential backoff and jitter, honouring
  `Retry-After`. `X-RateLimit-*` headers, when Mayar sends them, appear as
  `_rateLimit` in `--json` output.
- `MAYAR_API_URL` accepts `http://` URLs and ports.

- CI runs the test suite on Node 22 and 24 for every pull request and every
  push to `main`.
- `npm publish` and `make release-*` run the tests first. A failing test stops
  the release.

### Fixed

- `whoami` printed `Endpoint: undefined`.
- `make version-*` and `make release-*` used the old version in the commit
  message and the tag, and did not commit `package-lock.json`.
- README: the CLI has one runtime dependency (`@mayaross/auth`), not zero.
- README: the `MAYAR_VERSION` and `MAYAR_BIN_DIR` example for `install.sh` now
  passes the variables to `sh`, not to `curl`.

## [1.2.0]

Last release before this changelog was started. See the git history for older
changes.

---

## Release checklist

1. Move the `[Unreleased]` entries under a new version heading with the date.
2. Run `make release-patch`, `make release-minor` or `make release-major`. It
   runs the tests, bumps the version, tags, publishes and pushes.
3. If the release changes how the CLI behaves (commands, flags, output, exit
   codes, Node version, endpoints), open one PR on
   [mayarid/skills](https://github.com/mayarid/skills) to update the `mayar-v2`
   skill. Open it **after** the release is on npm, not before. See
   `docs/adr/0002-official-skill-lives-in-mayarid-skills.md`.
