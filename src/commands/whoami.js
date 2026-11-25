const api = require('../api');
const ui = require('../ui');
const { decodeJwt, identity } = require('../jwt');

const VERIFY_PATH = '/hl/v1/balance';

async function run({ apiKey, flags }) {
  const masked = apiKey.slice(0, 6) + '…' + apiKey.slice(-4);
  const decoded = decodeJwt(apiKey);
  const who = identity(apiKey);
  const endpoint = api.baseUrl();
  const res = await api.request('GET', VERIFY_PATH, { apiKey });
  const valid = res.status >= 200 && res.status < 300;

  if (flags.json) {
    ui.jsonOut({
      apiKey: masked,
      endpoint,
      valid,
      status: res.status,
      decoded,
      balance: valid ? (res.body && res.body.data) : null,
      error: valid ? null : (res.body && (res.body.messages || res.body.message)) || null,
    });
    return;
  }

  process.stdout.write(`${ui.bold('API key:')}    ${masked}\n`);
  process.stdout.write(`${ui.bold('Endpoint:')}   ${endpoint}\n`);
  if (who) {
    if (who.name)      process.stdout.write(`${ui.bold('Name:')}       ${ui.safe(who.name)}\n`);
    if (who.email)     process.stdout.write(`${ui.bold('Email:')}      ${ui.safe(who.email)}\n`);
    if (who.accountId) process.stdout.write(`${ui.bold('Account ID:')} ${ui.safe(who.accountId)}\n`);
    if (who.expiresAt) process.stdout.write(`${ui.bold('Expires:')}    ${who.expiresAt}\n`);
  } else {
    process.stdout.write(ui.dim('(API key is not a decodable JWT — skipping local profile)') + '\n');
  }

  if (valid) {
    process.stdout.write(ui.green(`✓ Key is valid (verified via ${VERIFY_PATH})`) + '\n');
  } else {
    const msg = (res.body && (res.body.messages || res.body.message)) || '';
    process.stdout.write(ui.red(`✗ Key rejected (HTTP ${res.status}) — ${ui.safe(msg)}`) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { run };
