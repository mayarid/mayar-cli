const config = require('../config');
const ui = require('../ui');

// Save an API key. The key is saved for the environment chosen with
// --sandbox, --production or --env; without one of those it is production.
async function run({ positional, flags = {} }) {
  const [key] = positional;
  if (!key || !key.trim()) {
    throw new Error('Usage: mayar api-key <your-api-key> [--sandbox]');
  }
  const trimmed = key.trim();
  const explicit = flags.sandbox || flags.production || flags.env;
  const endpoint = explicit ? config.resolveEndpoint() : 'production';
  const existing = config.load() || {};
  config.save({
    ...existing,
    apiKey: trimmed,
    endpoint,
    savedAt: new Date().toISOString(),
  });
  const masked = trimmed.slice(0, 6) + '…' + trimmed.slice(-4);
  process.stdout.write(ui.green(`✓ ${endpoint} API key saved (${masked})`) + '\n');
  process.stdout.write(ui.dim(config.file) + '\n');
}

module.exports = { run };
