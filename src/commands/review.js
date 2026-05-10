const api = require('../api');
const ui = require('../ui');
const { checkResp } = require('../util');

const USAGE = 'Usage: mayar review <list>';

function fmtDate(v) {
  if (v == null) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
}

async function run({ apiKey, flags, positional }) {
  const [sub] = positional;
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
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
