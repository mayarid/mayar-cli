const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar payment <list|get|close|reopen|status|edit|create>';
const STATUS_ACTIONS = ['open', 'close', 'active', 'closed', 'unlisted'];

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'list': {
      const res = await api.request('GET', '/hl/v2/payments', {
        apiKey, query: pagination(flags, { status: flags.status }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((p) => ({
        id: p.id, name: p.name, amount: p.amount, status: p.status,
        createdAt: typeof p.createdAt === 'number' ? new Date(p.createdAt).toISOString() : (p.createdAt || ''),
      }));
      ui.table(rows, ['id', 'name', 'amount', 'status', 'createdAt']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'get': {
      if (!rest[0]) throw new Error('Usage: mayar payment get <id>');
      const res = await api.request('GET', `/hl/v2/payments/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'close':
    case 'reopen': {
      if (!rest[0]) throw new Error(`Usage: mayar payment ${sub} <id>`);
      const action = sub === 'reopen' ? 'open' : 'close';
      const res = await api.request('POST', `/hl/v2/payments/${encodeURIComponent(rest[0])}/${action}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'status': {
      if (!rest[0] || !rest[1]) throw new Error(`Usage: mayar payment status <id> <${STATUS_ACTIONS.join('|')}>`);
      if (!STATUS_ACTIONS.includes(rest[1])) {
        throw new Error(`Invalid action "${rest[1]}". Must be one of: ${STATUS_ACTIONS.join(', ')}`);
      }
      const res = await api.request('POST', `/hl/v2/payments/${encodeURIComponent(rest[0])}/${rest[1]}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'edit': {
      if (!rest[0]) throw new Error('Usage: mayar payment edit <id> --data <json|@file>');
      const body = readData(flags.data);
      if (!body) throw new Error('mayar payment edit requires --data <json|@file>');
      body.id = body.id || rest[0];
      const res = await api.request('POST', `/hl/v2/payments/${encodeURIComponent(rest[0])}/update`, { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar payment create requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/payments/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
