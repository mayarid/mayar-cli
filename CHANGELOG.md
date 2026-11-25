# Changelog

All notable changes to `mayar` (mayar-cli) are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Node.js 22 or later is now required (was 18). Node 18 and 20 no longer get
  security fixes.

### Added

- CI runs the test suite on Node 22 and 24 for every pull request and every
  push to `main`.
- `npm publish` and `make release-*` run the tests first. A failing test stops
  the release.

### Fixed

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
