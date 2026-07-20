---
feature_id: login-env-and-skill-install-mrsuauk9
feature_name: login-env-and-skill-install-mrsuauk9
tags: [docs, cli, ui, caching, html-rendering]
updated_at: 2026-07-20T11:02:27.435Z
---

## Context

This feature adds a `mayar docs` command that fetches, caches, and parses
`llms.txt` from `docs.mayar.id`, supports interactive and non-interactive topic
browsing, fetches and renders full HTML documentation pages in the terminal, and
provides a machine-readable `--json` output mode. The feature also adds a
`pickFromList()` interactive selection helper to `src/ui.js` that the docs
command (and future commands) can reuse.

All work tracked under [login-env-and-skill-install-mrsuauk9](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/);
raw notes in [progress](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/progress.txt).

## Facts

- **Project**: mayar-cli (Node.js / TypeScript-idiom CommonJS, zero external
  deps beyond Node builtins).
- **Test suite**: 70 tests, 0 failures across `test/{helpers,util,cli,config,ui}.test.js`.
  The suite gates every commit via `node --test` in the pre-commit hook.
  The 70 tests deliberately cover only pure / near-pure functions; interactive
  paths, HTTP calls, and `run()` dispatch are deferred (see Lessons).
- **UI conventions**: `src/ui.js` freezes `isTTY` at module load; `dim()`,
  `bold()`, `red()`, `green()`, `yellow()`, `cyan()`, `magenta()` all coerce
  via `String()`. `table()` uses width-cap 48, `??` for missing cells, and
  `slice(0,width-1)+'…'` truncation.
- **Config conventions**: `src/config.js` freezes both XDG (`XDG_CONFIG_HOME`)
  and legacy (`$HOME`) paths at module load. Tests for config must set both
  env vars *before* `require('../src/config')`.
- **CLI conventions**: `src/cli.js` exports `{ run, parseFlags }`.
  `parseFlags` is pure; no generic short-flag handling exists (only `-h`/`-v`
  are recognized as short booleans; unknown short tokens fall through to
  positionals). `run()` dispatches commands via a handlers map + a few
  special-case `if` blocks (`init`, `login`, `docs`) that bypass `ensureKey()`.

## What Done & Why

1. **`pickFromList()` interactive helper** ([task-001](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json)) —
   Added async `pickFromList(items, { displayKey, descriptionKey })` to
   `src/ui.js`. Renders a 1-indexed numbered list, prompts `Pick a number (or
   q to quit): ` in a loop (rejects NaN, partial-match like `"12abc"`, and
   out-of-range), returns the selected item or `null` on `q`/`Q`. Empty input
   → `dim('(no items)')` → `null`. Why: needed a reusable interactive
   selection primitive for the docs command and any future picker UX.

2. **Docs command infrastructure** ([task-002](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json)) —
   Created `src/commands/docs.js` with: `getCacheDir()`, `getCachedLLMsTxt()`
   (24h TTL via `llms-meta.json`), `readStaleCache()`, `fetchLLMsTxt()`
   (`https.get`, 10s timeout, follows 301/302 up to 3 hops, writes cache),
   `fetchOrGetLLMsTxt(refresh)` (orchestrates cache/fetch with stale-fallback),
   `parseTitleUrl(line)` (regex on `- [Title](URL)`), `slugify(title)`
   (lowercase, replace `[^a-z0-9]+` with `-`, trim dashes), `parseLLMsTxt(raw)`
   (splits by `##` sections, parses list items into `{ sections: [{ name,
   topics: [{slug,title,url,description,section}] }] }`). Wired `docs` into
   `src/cli.js` (routing before `ensureKey()`, `--refresh` flag, help text).
   Why: documentation browsing is public and should not require an API key.

3. **Content fetcher + HTML renderer** ([task-003](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json)) —
   Added `fetchPageContent(url)` (follows 301/302/307/308, accepts all 2xx,
   10s timeout) and `renderContent(html)` — extracts `<main>` → `<article>` →
   `<div class="*content*">` → `<body>` → raw via regex; strips tags; decodes
   HTML entities in a single pass (avoiding `&amp;` → `&` → re-decode);
   collapses 3+ blank lines to 2; trims per-line whitespace; applies terminal
   formatting (markdown headings → `bold()`, code fences → 2-space indent,
   horizontal rules → `dim('─'×40)`). `renderContent` is pure (string →
   string) — trivially testable.

4. **Docs command UX** ([task-004](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json)) —
   Rewrote `run()` with 6 UX paths: (1) fetch+parse → flat `allTopics[]`;
   (2) topic resolution via `slugify(input)` → `slug.includes()` +
   `title.toLowerCase().includes()`; (3a) single match → fetch page + render
   content + header/footer; (3b) multi-match → numbered list with title,
   section, description; (3c) no match → error + `similarityScore()` fuzzy
   "Did you mean?" (prefix bonus + ordered shared-character count, top 3);
   (4) TTY no-arg → section headers + `pickFromList()`; (5) non-TTY no-arg →
   plain `## SectionName` / `  - Title — description` listing; (6) `--json`
   stub. All output via `process.stdout.write`.

5. **CLI registration + help + `--refresh`** ([task-005](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json)) —
   Most wiring was already done by task-002. Delta: added `--refresh` to the
   Global flags help section; added `docs: './commands/docs'` to the handlers
   map (unreachable due to the explicit `if` check, but serves as documentation
   and future-proofing).

6. **`--json` output mode** ([task-006](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json)) —
   Four JSON cases: (1) no topic → `{ topics: [...] }`; (2) single match →
   fetch page + render → `{ topic, title, url, content }`; (3) multi-match →
   `{ matches: [...] }` (no prompt); (4) no match → `{ error, suggestions }`
   + `process.exitCode = 1` (no `process.exit()`). Stale-cache warnings go to
   `process.stderr.write`. JSON mode short-circuits all interactive/plain-text
   paths.

## Lessons Learned

- **Interactive functions are hard to test without DI seams.**
  `pickFromList()` is async and reads stdin via the existing `ask()` readline
  pattern. It is not covered by the 70-test suite. This fits the
  "interactive-path coverage" bucket deferred in the earlier infrastructure
  work. Future testing needs either a mockable `ask()` seam or a child-process
  harness. ([task-001](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **DisplayKey fallback pattern.** Both `pickFromList()` and `table()` use
  `item[displayKey] ?? ''` to safely handle missing keys. Consistent across
  the codebase. ([task-001](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Docs command bypasses `ensureKey()`.** Documentation browsing is a public
  endpoint — added as a special case alongside `init`/`login` in `cli.js`
  before the auth guard. ([task-002](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Redirect-following pattern is shared.** Both `fetchLLMsTxt()` and
  `fetchPageContent()` use the same `doFetch` recursion pattern (redirect
  counter, `new URL(relative, base).href` resolution) as the existing
  `skill.js`. Timeout uses `req.setTimeout()` for Node 18+ compat rather than
  `options.timeout`. ([task-002](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json),
  [task-003](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Cache writes are non-fatal.** Wrapped in `try/catch` — if the cache dir is
  unwritable (permissions), the data is still returned to the caller. The
  warning goes to stderr so it doesn't pollute JSON stdout.
  ([task-002](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Single-pass entity decoding avoids the `&amp;` pitfall.** Chained
  `.replace()` calls would decode `&amp;lt;` → `&lt;` → `<` incorrectly. A
  single regex with a map callback handles all entities in one pass.
  ([task-003](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **`renderContent` is pure (string → string).** No I/O, no process writes —
  makes it trivially testable without any mocking.
  ([task-003](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Topic resolution uses slug inclusion, not raw substring.** `slugify(input)`
  → `topic.slug.includes(inputSlug)` catches cases like `create-invoice`
  matching `create-invoice-link`. Title matching uses case-insensitive
  `includes()` on the raw input. ([task-004](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **`similarityScore` uses ordered matching.** Characters from the input must
  appear in sequence in the title (not just a character-set intersection).
  This gives `'invoic'` a score of 6 against `'Create Invoice'` and `'xyz'` a
  score of 0 — more robust for typo detection.
  ([task-004](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Task preconditions can be stale — always re-read source.** Task-005
  described three changes to `cli.js`, but most were already implemented by
  task-002. The task became a small delta rather than a full implementation.
  ([task-005](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **JSON mode uses `process.exitCode`, not `process.exit()`.** Setting
  `exitCode = 1` allows `ui.jsonOut()` to flush its output before the process
  exits naturally. Calling `process.exit(1)` would hide the JSON error
  response. ([task-006](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **Stale-cache warnings go to stderr in JSON mode.** If a stale-cache warning
  were written to stdout, it would corrupt the JSON output. Using
  `process.stderr.write` keeps stdout clean for `ui.jsonOut()`.
  ([task-006](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

## Open Questions / What Next

- **Interactive-path tests.** `pickFromList()`, the docs TTY prompt flow, and
  `ensureKey` / `ui.ask` / `ui.askSecret` all remain untested. The 70-test
  suite deliberately scoped to pure functions. Closing this gap requires
  either a DI seam (extract `ask` as an injectable dependency) or a
  child-process harness that feeds stdin and asserts stdout/exit codes.
  Lowest ROI but needed for full coverage.

- **Network-dependent tests.** `fetchLLMsTxt()` and `fetchPageContent()` make
  real HTTP calls. The `test/helpers.js` `startServer()` helper (already
  built) can provide a local HTTP server on port 0, but `src/api.js` and
  `src/commands/docs.js` freeze their URLs at module load — pointing them at
  a test server requires env var injection *before* `require()`. A second
  integration-test layer.

- **Coverage threshold gap.** The `jonggrang.json` threshold is 80; the
  current suite is well below that by design (see progress log rationale).
  The next layers (command-level tests with DI, local HTTP integration) are
  the high-ROI path to closing the gap without resorting to brittle
  `require.cache` surgery.

- **`pickFromList` generalization.** Currently hardcodes prompt text `Pick a
  number (or q to quit)`. Could accept an optional `prompt` parameter for
  reuse in other picker contexts (e.g., "Select a plan").

## Promotion Candidates

- **`pickFromList()` pattern** — reusable interactive selection primitive for
  any command that needs a numbered picker (e.g., plan selection, project
  switching). Already extracted into `src/ui.js` and exported.
  ([task-001](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **`fetchOrGetLLMsTxt()` caching pattern** — 24h TTL, stale-fallback on fetch
  failure, non-fatal cache writes. Reusable for any cacheable remote content
  (skill registry, templates, etc.). ([task-002](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **`renderContent()` pure HTML→terminal pipeline** — extraction → tag
  stripping → entity decoding → whitespace collapse → terminal formatting.
  Reusable for rendering any fetched HTML page in the terminal.
  ([task-003](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))

- **`similarityScore()` fuzzy matching** — prefix bonus + ordered
  shared-character count. Reusable for any "Did you mean?" suggestion feature
  (command typos, topic search, etc.). ([task-004](.jonggrang/.output/features/login-env-and-skill-install-mrsuauk9/jonggrang-tasks.json))
