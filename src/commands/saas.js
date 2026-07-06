const api = require('../api');
const ui = require('../ui');
const { checkResp } = require('../util');

const USAGE = 'Usage: mayar saas <activate|deactivate|verify> <licenseCode> <productId>';

async function run({ apiKey, flags, positional }) {
  const [sub, licenseCode, productId] = positional;
  if (!['activate', 'deactivate', 'verify'].includes(sub)) throw new Error(USAGE);
  if (!licenseCode || !productId) throw new Error(USAGE);
  // SaaS licensing lives under /saas/v2/license/* — NOT /hl/v2.
  const res = await api.request('POST', `/saas/v2/license/${sub}`, {
    apiKey, body: { licenseCode, productId },
  });
  checkResp(res); ui.jsonOut(res.body);
}

module.exports = { run };
