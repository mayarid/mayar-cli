# Fragment — task-004: Document product/tier create/get commands

## What Done
Added the four new membership commands (product create/get, tier create/get) to
three doc surfaces: src/cli.js Memberships help block, README.md Memberships list,
and SKILL.md Memberships examples. Each edit follows the local format of its file.

## Why
Keep all three documented command surfaces in sync with the dispatch added in
tasks 002/003, so users see the new write/get commands wherever they look.

## Tradeoffs
None. Docs-only; no behavior change.

## What Next
Feature docs are complete for these four commands. If update/delete for products
or tiers ships later, extend the same three surfaces the same way.

## Lessons / Promotion Candidates
- src/cli.js help is a template literal — validate edits with `node -c` because a
  stray backtick/`${}` would break it, unlike plain-markdown README/SKILL.
- Three doc surfaces each have their own style: cli.js = bare grammar, README =
  column-aligned --flag annotations, SKILL = `npx -y mayar@latest ...` examples.
  Match the neighbor entries rather than one uniform format.
