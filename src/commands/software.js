const api = require('../api');
const ui = require('../ui');
const { checkResp } = require('../util');

const USAGE = 'Usage: mayar software verify <licenseCode> <productId>';

async function run({ apiKey, flags, positional }) {
  const [sub, licenseCode, productId] = positional;
  if (sub !== 'verify') throw new Error(USAGE);
  if (!licenseCode || !productId) throw new Error(USAGE);
  const res = await api.request('POST', '/software/v2/license/verify', {
    apiKey, body: { licenseCode, productId },
  });
  checkResp(res); ui.jsonOut(res.body);
}

module.exports = { run };
