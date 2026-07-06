const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar review <list|stats|create|update|bulk-status|product|product-customer>';

function fmtDate(v) {
  if (v == null) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
}

function renderList(body) {
  const data = (body && body.data) || [];
  const rows = data.map((r) => ({
    id: r.id,
    rating: r.rating,
    customer: (r.customer && (r.customer.name || r.customer.email)) || '',
    message: r.message || '',
    status: r.status || '',
    createdAt: fmtDate(r.createdAt),
  }));
  ui.table(rows, ['id', 'rating', 'customer', 'message', 'status', 'createdAt']);
  cursorFooter(body, data.length);
}

function renderStats(body) {
  const d = (body && body.data) || {};
  process.stdout.write(`${ui.bold('Total reviews:')}  ${d.total ?? 0}\n`);
  process.stdout.write(`${ui.bold('Average rating:')} ${d.average ?? '—'}\n`);
  if (Array.isArray(d.stats) && d.stats.length) {
    process.stdout.write('\n');
    ui.table(
      d.stats.map((s) => ({
        rating: s.rating,
        totalRating: s.totalRating,
        percentage: typeof s.percentage === 'number' ? `${s.percentage}%` : String(s.percentage ?? ''),
      })),
      ['rating', 'totalRating', 'percentage'],
    );
  }
}

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case undefined:
    case 'list': {
      const res = await api.request('GET', '/hl/v2/reviews', {
        apiKey,
        query: pagination(flags, {
          status: flags.status, paymentLinkId: flags.paymentLinkId, rating: flags.rating,
        }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'stats': {
      const productId = rest[0];
      const path = productId
        ? `/hl/v2/products/${encodeURIComponent(productId)}/reviews/stats`
        : '/hl/v2/merchants/reviews/stats';
      const res = await api.request('GET', path, { apiKey });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderStats(res.body); return;
    }
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar review create requires --data <json|@file> ({paymentLinkId,customerEmail,rating})');
      const res = await api.request('POST', '/hl/v2/reviews/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'update': {
      if (!rest[0]) throw new Error('Usage: mayar review update <id> --data <json|@file>');
      const body = readData(flags.data);
      if (!body) throw new Error('mayar review update requires --data <json|@file>');
      body.id = body.id || rest[0];
      const res = await api.request('POST', `/hl/v2/reviews/${encodeURIComponent(rest[0])}/update`, { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'bulk-status':
    case 'bulkstatus': {
      const data = readData(flags.data);
      if (!data) throw new Error('mayar review bulk-status requires --data <json|@file> (array of {id,status})');
      const body = Array.isArray(data) ? { input: data } : data;
      const res = await api.request('POST', '/hl/v2/reviews/bulk-status/update', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'product': {
      if (!rest[0]) throw new Error('Usage: mayar review product <paymentLinkId>');
      const res = await api.request('GET', `/hl/v2/products/${encodeURIComponent(rest[0])}/reviews`, {
        apiKey, query: pagination(flags, { rating: flags.rating, prioritizeMessage: flags.prioritizeMessage }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'product-customer':
    case 'productcustomer': {
      if (!rest[0]) throw new Error('Usage: mayar review product-customer <paymentLinkId> --customerId <id>');
      if (!flags.customerId) throw new Error('mayar review product-customer requires --customerId <id>');
      const res = await api.request('GET', `/hl/v2/products/${encodeURIComponent(rest[0])}/reviews/customer`, {
        apiKey, query: { customerId: flags.customerId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
