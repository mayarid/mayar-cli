const api = require('../api');
const ui = require('../ui');
const { checkResp, readData } = require('../util');

const USAGE = 'Usage: mayar payment-link edit <id> --data <json|@file>';

// Companion to `mayar product edit --type payment-link` — surfaces the alternate
// v2 route at /hl/v2/payment-links/{id}/update, which the docs confirm shares a
// handler with /hl/v2/products/payment-link/{id}/update.
async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  if (sub !== 'edit') throw new Error(USAGE);
  if (!rest[0]) throw new Error(USAGE);
  const body = readData(flags.data);
  if (!body) throw new Error('mayar payment-link edit requires --data <json|@file>');
  body.id = body.id || rest[0];
  const res = await api.request('POST', `/hl/v2/payment-links/${encodeURIComponent(rest[0])}/update`, {
    apiKey, body,
  });
  checkResp(res); ui.jsonOut(res.body);
}

module.exports = { run };
