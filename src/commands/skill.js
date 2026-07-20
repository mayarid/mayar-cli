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
  process.stdout.write(
    ui.bold('mayar skill install') +
      '  ' +
      ui.dim('— install SKILL.md to AI agent directories') +
      '\n\n',
  );
  process.stdout.write(ui.bold('Usage:') + '\n');
  process.stdout.write('  mayar skill install [flags]\n\n');
  process.stdout.write(ui.bold('Flags:') + '\n');
  process.stdout.write(
    '  --target <name>   Install to a specific target (default: all)\n',
  );
  process.stdout.write(
    '                    Valid: all, agents, claude, opencode, codex, cursor\n',
  );
  process.stdout.write('  --force           Overwrite existing files\n');
  process.stdout.write('  --json            Output JSON\n');
}

/**
 * Strip the SKILL.md's own YAML frontmatter (lines between the first `---`
 * and second `---`) and prepend Cursor .mdc frontmatter.
 * If the original frontmatter can't be parsed, the raw content is included as-is.
 */
function generateCursorMdc(skillContent) {
  let body = skillContent;
  const lines = body.split('\n');

  // Check if file starts with YAML frontmatter (--- on line 0)
  if (lines[0].trim() === '---') {
    // Find closing ---
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        // Remove frontmatter including both --- delimiter lines
        body = lines.slice(i + 1).join('\n');
        break;
      }
    }
  }

  const frontmatter =
    '---\n' +
    'alwaysApply: true\n' +
    'description: Mayar CLI — interact with the Mayar payment platform (invoices, products, payments, customers, transactions, webhooks, QR codes, memberships, credit wallets, discounts, installments, bundling, SaaS/software licensing).\n' +
    'globs:\n' +
    '  - "**/*"\n' +
    '---\n';

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

    // Use Cursor-adapted .mdc content for the cursor target
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
