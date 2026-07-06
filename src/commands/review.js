const api = require('../api');
const ui = require('../ui');
const { checkResp } = require('../util');

const USAGE = 'Usage: mayar review <list|stats>';

function fmtDate(v) {
  if (v == null) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
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
      const res = await api.request('GET', '/hl/v1/reviews', {
        apiKey, query: { page: flags.page, pageSize: flags.pageSize },
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((r) => ({
        id: r.id,
        rating: r.rating,
        customer: (r.customer && (r.customer.name || r.customer.email)) || '',
        message: r.message || '',
        status: r.status || '',
        createdAt: fmtDate(r.createdAt),
      }));
      ui.table(rows, ['id', 'rating', 'customer', 'message', 'status', 'createdAt']);
      const m = res.body || {};
      process.stdout.write(ui.dim(`page ${m.page ?? '?'} / ${m.pageCount ?? '?'} · total ${m.total ?? data.length}`) + '\n');
      return;
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
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
