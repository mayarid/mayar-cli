const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar installment <list|get|create>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case undefined:
    case 'list': {
      const res = await api.request('GET', '/hl/v2/installments', {
        apiKey, query: pagination(flags, { status: flags.status, customerId: flags.customerId }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((i) => ({
        id: i.id, name: i.name, email: i.email,
        amount: i.amount, tenure: (i.installment && i.installment.tenure) || '',
        status: i.status,
      }));
      ui.table(rows, ['id', 'name', 'email', 'amount', 'tenure', 'status']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'get':
    case 'detail': {
      if (!rest[0]) throw new Error('Usage: mayar installment get <id>');
      const res = await api.request('GET', `/hl/v2/installments/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar installment create requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/installments/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
