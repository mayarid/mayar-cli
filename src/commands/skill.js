const https = require('https');
const fs = require('fs');
const path = require('path');
const ui = require('../ui');

const SKILL_URL =
  'https://raw.githubusercontent.com/mayarid/mayar-cli/refs/heads/main/SKILL.md';

const VALID_TARGETS = new Set([
  'all',
  'agents',
  'claude',
  'opencode',
  'codex',
  'cursor',
]);

const TARGET_PATHS = {
  agents: '.agents/skills/mayar/SKILL.md',
  claude: '.claude/skills/mayar/SKILL.md',
  opencode: '.opencode/skills/mayar/SKILL.md',
  codex: '.codex/skills/mayar/SKILL.md',
  cursor: '.cursor/rules/mayar.mdc',
};

function usage() {
  process.stdout.write(`${ui.bold('mayar skill install')}  ${ui.dim('— install SKILL.md to AI agent directories')}

${ui.bold('Usage:')}
  mayar skill install [flags]

${ui.bold('Flags:')}
  --target <name>   Install to a specific target (default: all)
                    Valid: all, agents, claude, opencode, codex, cursor
  --force           Overwrite existing files
  --json            Output JSON
`);
}

function generateCursorMdc(skillContent) {
  let body = skillContent;
  const lines = body.split('\n');

  // Strip the SKILL.md's own YAML frontmatter between `---` delimiters.
  if (lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        body = lines.slice(i + 1).join('\n');
        break;
      }
    }
  }

  const frontmatter = `---
alwaysApply: true
description: Mayar API & CLI integration skill. For App Integration, use \`mayar docs <topic>\` to read REST API specs and write native HTTP (fetch/axios) in app code. For Direct Shell Tasks & Admin Operations, execute Mayar CLI commands directly (\`mayar balance\`, \`mayar invoice list\`, etc.).
globs:
  - "**/*"
---
`;

  return frontmatter + '\n' + body.trim() + '\n';
}

/**
 * Fetch SKILL.md from the GitHub raw URL.
 * Follows 301/302 redirects up to 3 hops.
 */
function fetchSkill() {
  return new Promise((resolve, reject) => {
    function doFetch(url, redirects) {
      https
        .get(url, (res) => {
          // Follow redirects
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            if (redirects >= 3) {
              res.resume();
              reject(new Error('Too many redirects'));
              return;
            }
            const nextUrl = new URL(res.headers.location, url).href;
            res.resume();
            doFetch(nextUrl, redirects + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
          res.on('error', reject);
        })
        .on('error', reject);
    }

    doFetch(SKILL_URL, 0);
  });
}

async function run(ctx) {
  const { flags, positional } = ctx;
  const [sub] = positional;

  if (!sub || sub === 'help') {
    usage();
    return;
  }

  if (sub !== 'install') {
    process.stderr.write(
      ui.red(`Unknown subcommand: mayar skill ${sub}`) + '\n',
    );
    process.exit(1);
  }

  const target = flags.target || 'all';
  if (!VALID_TARGETS.has(target)) {
    process.stderr.write(
      ui.red(
        `Error: Invalid --target value: ${target}. Valid values: all, agents, claude, opencode, codex, cursor`,
      ) + '\n',
    );
    process.exit(1);
  }

  let content;
  try {
    content = await fetchSkill();
  } catch (err) {
    process.stderr.write(
      ui.red(`Error: Failed to fetch SKILL.md: ${err.message}`) + '\n',
    );
    process.exit(1);
  }

  const targets =
    target === 'all'
      ? ['agents', 'claude', 'opencode', 'codex', 'cursor']
      : [target];

  const results = [];

  for (const t of targets) {
    const relPath = TARGET_PATHS[t];
    const filePath = path.resolve(relPath);
    const dir = path.dirname(filePath);

    fs.mkdirSync(dir, { recursive: true });

    const fileContent = t === 'cursor' ? generateCursorMdc(content) : content;

    if (fs.existsSync(filePath) && !flags.force) {
      if (!flags.json) {
        process.stdout.write(
          `Skipping: ${relPath} (use --force to overwrite)\n`,
        );
      }
      results.push({ target: t, path: filePath, status: 'skipped' });
    } else {
      fs.writeFileSync(filePath, fileContent);
      if (!flags.json) {
        const label = t === 'cursor' ? 'Installed (Cursor .mdc)' : 'Installed';
        process.stdout.write(`${label}: ${relPath}\n`);
      }
      results.push({ target: t, path: filePath, status: 'installed' });
    }
  }

  if (flags.json) {
    ui.jsonOut(results);
  }
}

module.exports = { run };
