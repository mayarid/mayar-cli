const api = require('../api');
const ui = require('../ui');
const { checkResp, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar bundling <list|get>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case undefined:
    case 'list': {
      const res = await api.request('GET', '/hl/v2/bundling', {
        apiKey, query: pagination(flags),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((b) => ({
        id: b.id, name: b.name, amount: b.amount, status: b.status,
      }));
      ui.table(rows, ['id', 'name', 'amount', 'status']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'get':
    case 'detail': {
      if (!rest[0]) throw new Error('Usage: mayar bundling get <id>');
      const res = await api.request('GET', `/hl/v2/bundling/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
