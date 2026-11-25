const api = require('../api');
const ui = require('../ui');
const { checkAmount } = require('../guards');

const USAGE = 'Usage: mayar qrcode <amount> | mayar qrcode static | mayar qrcode channels';

async function run({ apiKey, flags, positional }) {
  const [first] = positional;

  if (first === 'static') {
    const res = await api.request('GET', '/hl/v2/qr-codes/static', { apiKey });
    if (flags.json) return ui.jsonOut(res.body);
    const d = (res.body && res.body.data) || {};
    if (!ui.fields([['Static QRIS', d.url]])) ui.jsonOut(res.body);
    return;
  }

  if (first === 'channels') {
    const res = await api.request('GET', '/hl/v2/payment-channels', { apiKey });
    if (flags.json) return ui.jsonOut(res.body);
    const body = res.body || {};
    const channels = (body.data && body.data.channels) || body.data || [];
    if (!Array.isArray(channels)) return ui.jsonOut(res.body);
    const rows = channels.map((c) => ({
      name: c.name || '',
      type: c.type || '',
      code: c.code || '',
      status: c.status === true ? 'enabled' : (c.status === false ? 'disabled' : String(c.status ?? '')),
    }));
    ui.table(rows, ['name', 'type', 'code', 'status']);
    return;
  }

  if (!first) throw new Error(USAGE);
  const amount = checkAmount(first);
  const res = await api.request('POST', '/hl/v2/qr-codes/create', { apiKey, body: { amount } });
  if (flags.json) return ui.jsonOut(res.body);
  const d = (res.body && res.body.data) || {};
  ui.fields([['QR amount', d.amount ?? amount], ['QR image', d.url]]);
  if (!d.url) ui.jsonOut(res.body);
}

module.exports = { run };
