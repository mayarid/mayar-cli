const config = require('../config');
const ui = require('../ui');

async function run({ flags }) {
  ui.printBanner();
  const existing = config.load();
  if (existing && existing.apiKey && !flags.force) {
    const masked = existing.apiKey.slice(0, 6) + '…' + existing.apiKey.slice(-4);
    process.stdout.write(ui.dim(`A key is already configured (${masked}).`) + '\n');
    const ans = await ui.ask('Overwrite? [y/N] ');
    if (!/^y/i.test(ans.trim())) { process.stdout.write('Cancelled.\n'); return; }
  }

  // Interactive environment selection
  const endpoint = await ui.selectEnvironment(flags);
  const webUrl = endpoint === 'sandbox' ? 'https://web.mayar.club' : 'https://web.mayar.id';

  process.stdout.write('\n' + `${ui.bold('Welcome to Mayar CLI.')}\n`);
  process.stdout.write(`Get your key from ${ui.cyan(webUrl)} → Integration → API Key.\n\n`);
  const key = await ui.askSecret(ui.bold(`Paste your ${endpoint} API key: `));
  if (!key.trim()) { process.stderr.write(ui.red('No key provided.\n')); process.exit(1); }
  config.save({ apiKey: key.trim(), endpoint, savedAt: new Date().toISOString() });
  process.stdout.write(ui.green(`✓ Saved to ${config.file}`) + '\n');
  process.stdout.write(`${ui.dim('Endpoint:')} ${endpoint}\n\n`);
  process.stdout.write('Try:\n');
  process.stdout.write('  mayar balance\n');
  process.stdout.write('  mayar invoice list\n');
  process.stdout.write('  mayar product list\n');
}

module.exports = { run };
