---
name: mayar
display_name: Mayar (moved)
version: "1.3.0"
description: >
  This skill has moved. The official Mayar agent skill is `mayar-v2` in
  https://github.com/mayarid/skills. Use it for Mayar payments, billing and
  the Mayar CLI. Install it before you do any Mayar work.
license: MIT
homepage: https://github.com/mayarid/skills
---

# This skill has moved

This file is kept only so that `mayar skill install` on mayar-cli 1.2.0 and
older does not fail. Its instructions are out of date. Do not use it for Mayar
work.

Install the official skill, `mayar-v2`:

```bash
npx skills add mayarid/skills --skill mayar-v2 -y
```

Or upgrade the CLI, which installs the same skill:

```bash
npx -y mayar@latest skill install
```

After you install `mayar-v2`, delete this `mayar` skill folder.
