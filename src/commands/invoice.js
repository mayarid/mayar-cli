const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar invoice <list|get|close|reopen|status|edit|filter|create>';
const STATUS_ACTIONS = ['open', 'close', 'active', 'closed', 'unlisted'];

function renderList(body) {
  const data = (body && body.data) || [];
  const rows = data.map((i) => ({
    id: i.id,
    customer: (i.customer && (i.customer.name || i.customer.email)) || '',
    amount: i.amount,
    status: i.status,
    createdAt: typeof i.createdAt === 'number' ? new Date(i.createdAt).toISOString() : (i.createdAt || ''),
  }));
  ui.table(rows, ['id', 'customer', 'amount', 'status', 'createdAt']);
  cursorFooter(body, data.length);
}

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'list': {
      const res = await api.request('GET', '/hl/v2/invoices', {
        apiKey,
        query: pagination(flags, { status: flags.status, search: flags.search }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'filter': {
      if (!flags.email) throw new Error('mayar invoice filter requires --email <email>');
      const res = await api.request('GET', '/hl/v2/invoices/filter', {
        apiKey,
        query: pagination(flags, { email: flags.email, status: flags.status, search: flags.search }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'get': {
      if (!rest[0]) throw new Error('Usage: mayar invoice get <id>');
      const res = await api.request('GET', `/hl/v2/invoices/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'close':
    case 'reopen': {
      if (!rest[0]) throw new Error(`Usage: mayar invoice ${sub} <id>`);
      const action = sub === 'reopen' ? 'open' : 'close';
      // v2 consolidates status changes under a single action endpoint.
      const res = await api.request('POST', `/hl/v2/invoices/${encodeURIComponent(rest[0])}/${action}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'status': {
      if (!rest[0] || !rest[1]) throw new Error(`Usage: mayar invoice status <id> <${STATUS_ACTIONS.join('|')}>`);
      if (!STATUS_ACTIONS.includes(rest[1])) {
        throw new Error(`Invalid action "${rest[1]}". Must be one of: ${STATUS_ACTIONS.join(', ')}`);
      }
      const res = await api.request('POST', `/hl/v2/invoices/${encodeURIComponent(rest[0])}/${rest[1]}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'edit': {
      if (!rest[0]) throw new Error('Usage: mayar invoice edit <id> --data <json|@file>');
      const body = readData(flags.data);
      if (!body) throw new Error('mayar invoice edit requires --data <json|@file>');
      body.id = body.id || rest[0];
      const res = await api.request('POST', `/hl/v2/invoices/${encodeURIComponent(rest[0])}/update`, { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar invoice create requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/invoices/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
