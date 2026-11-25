# The Mayar skill lives in mayarid/skills, not in this repo

This repo used to ship its own `SKILL.md`, and `mayar skill install` downloaded it from this repo's `main` branch. The official skill, `mayar-v2`, is kept in `mayarid/skills`. It is a folder with a playbook, references and scripts, and it has its own installer (`npx skills add`). Two skills for the same product gave agents conflicting instructions. We decided that `mayar skill install` runs the official installer, and we deleted this repo's `SKILL.md`. Do not add a skill file back here. Change `mayarid/skills` instead.

## Consequences

- `mayar skill install` needs `npx` and network access.
- The skill describes how the published CLI behaves. After each CLI release that changes behavior, open one PR on `mayarid/skills`. Do not open it before the release: agents run `mayar@latest`, so a skill that changes first gives them wrong instructions.
