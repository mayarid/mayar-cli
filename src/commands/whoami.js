const api = require('../api');
const ui = require('../ui');
const { decodeJwt, identity } = require('../jwt');
const { ApiError } = require('../response');

// /hl/v1/balance does not answer (timed out, checked 2026-11-25).
const VERIFY_PATH = '/hl/v2/balances';

// Check the key live. A refused key is a result here, not an error; network
// problems still throw.
async function verify(apiKey) {
  try {
    const res = await api.request('GET', VERIFY_PATH, { apiKey });
    return { valid: true, status: res.status, balance: res.body && res.body.data, error: null };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    const msg = (err.body && (err.body.messages || err.body.message)) || null;
    return { valid: false, status: err.status, balance: null, error: msg };
  }
}

async function run({ apiKey, flags }) {
  const masked = apiKey.slice(0, 6) + '…' + apiKey.slice(-4);
  const endpoint = api.baseUrl();
  const result = await verify(apiKey);

  if (flags.json) {
    ui.jsonOut({ apiKey: masked, endpoint, ...result, decoded: decodeJwt(apiKey) });
    return;
  }

  const who = identity(apiKey) || {};
  ui.fields([
    ['API key', masked],
    ['Endpoint', endpoint],
    ['Name', who.name],
    ['Email', who.email],
    ['Account ID', who.accountId],
    ['Expires', who.expiresAt],
  ]);
  if (!identity(apiKey)) {
    process.stdout.write(ui.dim('(API key is not a decodable JWT — skipping local profile)') + '\n');
  }

  if (result.valid) {
    process.stdout.write(ui.green(`✓ Key is valid (verified via ${VERIFY_PATH})`) + '\n');
  } else {
    process.stdout.write(ui.red(`✗ Key rejected (status ${result.status}) — ${ui.safe(result.error || '')}`) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { run };
