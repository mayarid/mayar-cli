const { spawn } = require('child_process');
const ui = require('../ui');

// The official Mayar skill lives in mayarid/skills and has its own installer
// (`npx skills add`). This command runs that installer, so there is only one
// skill to keep up to date. See docs/adr/0002-official-skill-lives-in-mayarid-skills.md.

const SKILL_REPO = 'mayarid/skills';
const SKILL_NAME = 'mayar-v2';

// --target values, mapped to `skills add --agent` names.
const TARGET_AGENTS = {
  claude: ['claude-code'],
  codex: ['codex'],
  cursor: ['cursor'],
  opencode: ['opencode'],
  agents: ['codex'], // .agents/skills/ in the project
  all: ['claude-code', 'codex', 'cursor', 'opencode'],
};

function usage() {
  process.stdout.write(`${ui.bold('mayar skill install')}  ${ui.dim(`— install the official Mayar agent skill (${SKILL_NAME})`)}

${ui.bold('Usage:')}
  mayar skill install [flags]

${ui.bold('Flags:')}
  --target <name>   Agent to install for (default: all)
                    Valid: ${Object.keys(TARGET_AGENTS).join(', ')}
  --global          Install for your user, not only this project
  --json            Print the result as JSON

Runs: npx -y skills add ${SKILL_REPO} --skill ${SKILL_NAME} -y -a <agent> [-g]
Needs npx (comes with Node.js) and network access.
`);
}

// Build the npx arguments. Pure, for tests.
function installArgs({ target = 'all', global = false } = {}) {
  const agents = TARGET_AGENTS[target];
  if (!agents) {
    throw new Error(`Invalid --target "${target}". Valid: ${Object.keys(TARGET_AGENTS).join(', ')}`);
  }
  return [
    '-y', 'skills', 'add', SKILL_REPO,
    '--skill', SKILL_NAME,
    '-y',
    ...agents.flatMap((a) => ['-a', a]),
    ...(global ? ['-g'] : []),
  ];
}

function runNpx(args, { capture }) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: process.platform === 'win32',
    });
    let out = '';
    if (capture) {
      child.stdout.on('data', (c) => { out += c; });
      child.stderr.on('data', (c) => { out += c; });
    }
    child.on('error', (err) => {
      reject(new Error(err.code === 'ENOENT'
        ? 'npx was not found. Install Node.js (npx comes with it), then run again.'
        : `Could not start npx: ${err.message}`));
    });
    child.on('close', (code) => resolve({ code, output: out }));
  });
}

async function run({ flags, positional }, { exec = runNpx } = {}) {
  const [sub] = positional;
  if (flags.help || !sub) { usage(); return; }
  if (sub !== 'install') throw new Error('Usage: mayar skill install [--target <name>] [--global]');
  if (flags.force) {
    process.stderr.write(ui.dim('Note: --force is no longer needed; the installer replaces the skill.') + '\n');
  }

  const target = flags.target || 'all';
  const global = Boolean(flags.global);
  const args = installArgs({ target, global });
  const command = `npx ${args.join(' ')}`;
  if (!flags.json) process.stdout.write(ui.dim(`Running: ${command}`) + '\n');

  const { code, output } = await exec(args, { capture: Boolean(flags.json) });
  if (flags.json) {
    ui.jsonOut({ ok: code === 0, skill: `${SKILL_REPO}/${SKILL_NAME}`, target, global, command, exitCode: code, output: output.trim() });
    if (code !== 0) process.exitCode = 1;
    return;
  }
  if (code !== 0) throw new Error(`The skills installer failed (exit code ${code}). Command: ${command}`);
  process.stdout.write(ui.green(`✓ Installed ${SKILL_NAME} from ${SKILL_REPO}`) + '\n');
}

module.exports = { run, installArgs, TARGET_AGENTS };
