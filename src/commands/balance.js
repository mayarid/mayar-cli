const api = require('../api');
const ui = require('../ui');

// `apiKey` comes from config.resolveCredential, like every other command.
async function run({ apiKey, flags }) {
  const res = await api.request('GET', '/hl/v2/balances', { apiKey });
  if (flags.json) return ui.jsonOut(res.body);
  const d = (res.body && res.body.data) || {};
  if (!Object.keys(d).length) return ui.jsonOut(res.body);
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('id-ID') : String(n ?? '?'));
  const rows = Object.entries(d).map(([k, v]) => ({ field: k, value: fmt(v) }));
  ui.table(rows, ['field', 'value']);
}

module.exports = { run };
