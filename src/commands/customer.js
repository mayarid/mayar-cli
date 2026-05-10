const api = require('../api');
const ui = require('../ui');
const { checkResp, readData } = require('../util');

const USAGE = 'Usage: mayar customer <list|create|search|update|magic-link>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'list': {
      const res = await api.request('GET', '/hl/v1/customer', {
        apiKey, query: { page: flags.page, pageSize: flags.pageSize },
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((c) => ({
        id: c.id, name: c.name, email: c.email, mobile: c.mobile, status: c.status,
      }));
      ui.table(rows, ['id', 'name', 'email', 'mobile', 'status']);
      return;
    }
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar customer create requires --data \'{"name":"...","email":"...","mobile":"..."}\'');
      const res = await api.request('POST', '/hl/v1/customer/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'search': {
      if (!rest[0]) throw new Error('Usage: mayar customer search <email>');
      const res = await api.request('GET', '/hl/v1/customer/detail', {
        apiKey, query: { email: rest[0] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'update': {
      if (rest.length < 2) throw new Error('Usage: mayar customer update <fromEmail> <toEmail>');
      const res = await api.request('POST', '/hl/v1/customer/update', {
        apiKey, body: { fromEmail: rest[0], toEmail: rest[1] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'magic-link':
    case 'magiclink': {
      if (!rest[0]) throw new Error('Usage: mayar customer magic-link <email>');
      const res = await api.request('POST', '/hl/v1/customer/login/portal', {
        apiKey, body: { email: rest[0] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
