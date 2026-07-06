const api = require('../api');
const ui = require('../ui');
const { checkResp } = require('../util');

const USAGE = 'Usage: mayar product <list|get|close|reopen|status|search|type>';
const STATUS_ACTIONS = ['open', 'close', 'active', 'closed', 'unlisted'];

function renderList(body) {
  const data = (body && body.data) || [];
  const rows = data.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    amount: p.amount,
    status: p.status,
    productLink: p.linkUrl || '',
    checkoutLink: p.linkPayment || '',
  }));
  ui.table(rows, ['id', 'name', 'type', 'amount', 'status', 'productLink', 'checkoutLink']);
  const m = body || {};
  process.stdout.write(ui.dim(`page ${m.page ?? '?'} / ${m.pageCount ?? '?'} · total ${m.total ?? data.length}`) + '\n');
}

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'list': {
      const res = await api.request('GET', '/hl/v1/product', {
        apiKey, query: { page: flags.page, pageSize: flags.pageSize },
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'search': {
      if (!rest[0]) throw new Error('Usage: mayar product search <keyword>');
      const search = rest.join(' ');
      const res = await api.request('GET', '/hl/v1/product', {
        apiKey, query: { search, page: flags.page, pageSize: flags.pageSize },
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'type': {
      if (!rest[0]) throw new Error('Usage: mayar product type <ebook|course|membership|saas|event|webinar|...>');
      const res = await api.request('GET', `/hl/v1/product/type/${encodeURIComponent(rest[0])}`, {
        apiKey, query: { page: flags.page, pageSize: flags.pageSize },
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'get': {
      if (!rest[0]) throw new Error('Usage: mayar product get <id>');
      const res = await api.request('GET', `/hl/v1/product/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'close': {
      if (!rest[0]) throw new Error('Usage: mayar product close <id>');
      const res = await api.request('GET', `/hl/v1/product/close/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'reopen': {
      if (!rest[0]) throw new Error('Usage: mayar product reopen <id>');
      const res = await api.request('GET', `/hl/v1/product/open/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'status': {
      if (!rest[0] || !rest[1]) throw new Error(`Usage: mayar product status <id> <${STATUS_ACTIONS.join('|')}>`);
      const action = rest[1];
      if (!STATUS_ACTIONS.includes(action)) {
        throw new Error(`Invalid action "${action}". Must be one of: ${STATUS_ACTIONS.join(', ')}`);
      }
      const res = await api.request(
        'POST',
        `/hl/v2/products/${encodeURIComponent(rest[0])}/${action}`,
        { apiKey },
      );
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
