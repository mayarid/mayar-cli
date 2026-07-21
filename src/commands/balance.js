const api = require('../api');
const ui = require('../ui');
const config = require('../config');
const { checkResp } = require('../util');

async function run({ apiKey, flags }) {
  const cfg = config.load();
  const token = flags.apiKey || process.env.MAYAR_API_KEY || cfg?.auth?.authToken || apiKey;
  const res = await api.request('GET', '/hl/v2/balances', { apiKey: token });
  checkResp(res);
  if (flags.json) return ui.jsonOut(res.body);
  const d = (res.body && res.body.data) || {};
  if (!Object.keys(d).length) return ui.jsonOut(res.body);
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('id-ID') : String(n ?? '?'));
  const rows = Object.entries(d).map(([k, v]) => ({ field: k, value: fmt(v) }));
  ui.table(rows, ['field', 'value']);
}

module.exports = { run };
