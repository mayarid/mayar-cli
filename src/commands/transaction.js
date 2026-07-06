const api = require('../api');
const ui = require('../ui');
const { checkResp, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar tx <list|unpaid|daily|product>';

function fmtDate(v) {
  if (v == null) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
}

function renderTx(body) {
  const data = (body && body.data) || [];
  const rows = data.map((t) => ({
    id: t.id,
    customer: (t.customer && (t.customer.name || t.customer.email))
      || (t.paymentLink && t.paymentLink.name)
      || t.customerName || '',
    amount: t.credit ?? t.amount ?? '',
    status: t.status || '',
    createdAt: fmtDate(t.createdAt),
  }));
  ui.table(rows, ['id', 'customer', 'amount', 'status', 'createdAt']);
  cursorFooter(body, data.length);
}

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case undefined:
    case 'list':
    case 'paid': {
      const res = await api.request('GET', '/hl/v2/transactions', {
        apiKey,
        query: pagination(flags, {
          status: flags.status,
          customerId: flags.customerId,
          type: flags.type,
          paymentLinkId: flags.paymentLinkId,
          startAt: flags.startAt,
          endAt: flags.endAt,
          fields: flags.fields,
        }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderTx(res.body); return;
    }
    case 'unpaid': {
      const res = await api.request('GET', '/hl/v2/transactions/unpaid', {
        apiKey,
        query: pagination(flags, {
          status: flags.status,
          customerId: flags.customerId,
          paymentLinkId: flags.paymentLinkId,
          startAt: flags.startAt,
          endAt: flags.endAt,
          fields: flags.fields,
        }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderTx(res.body); return;
    }
    case 'daily': {
      const res = await api.request('GET', '/hl/v2/transactions/daily', { apiKey });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const d = (res.body && res.body.data) || {};
      if (d.date)     process.stdout.write(`${ui.bold('Date:')}          ${d.date}\n`);
      if (d.tpvCount != null) process.stdout.write(`${ui.bold('Total volume:')} ${Number(d.tpvCount).toLocaleString('id-ID')}\n`);
      if (d.trxCount != null) process.stdout.write(`${ui.bold('Transactions:')} ${d.trxCount}\n`);
      if (!d.date && d.tpvCount == null && d.trxCount == null) ui.jsonOut(res.body);
      return;
    }
    case 'product': {
      if (!rest[0]) throw new Error('Usage: mayar tx product <productId>');
      const res = await api.request('GET', `/hl/v2/products/${encodeURIComponent(rest[0])}/transactions`, {
        apiKey, query: pagination(flags, { status: flags.status, customerId: flags.customerId, fields: flags.fields }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderTx(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
