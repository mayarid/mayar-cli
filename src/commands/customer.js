const api = require('../api');
const ui = require('../ui');
const { readData, confirmPlainText } = require('../util');

const USAGE = 'Usage: mayar customer <list|create|search|update|magic-link>';
const CUSTOMER_TEXT_FIELDS = ['name', 'email', 'mobile', 'address', 'description'];

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'list': {
      const res = await api.request('GET', '/hl/v2/customers', { apiKey });
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
      await confirmPlainText(body, CUSTOMER_TEXT_FIELDS);
      const res = await api.request('POST', '/hl/v2/customers/create', { apiKey, body });
      ui.jsonOut(res.body); return;
    }
    case 'search': {
      if (!rest[0]) throw new Error('Usage: mayar customer search <email>');
      const res = await api.request('GET', '/hl/v2/customers/detail', {
        apiKey, query: { email: rest[0] },
      });
      ui.jsonOut(res.body); return;
    }
    case 'update': {
      if (rest.length < 2) throw new Error('Usage: mayar customer update <customerId> <newEmail>');
      // v2 updates by customer ID: POST /hl/v2/customers/{id}/update. The old
      // /hl/v2/customers/update (by email) answers 404 (checked 2026-11-25).
      if (rest[0].includes('@')) {
        throw new Error('mayar customer update needs the customer ID, not the email. ' +
          `Find the ID with: mayar customer search ${rest[0]}`);
      }
      await confirmPlainText({ toEmail: rest[1] }, ['toEmail']);
      const res = await api.request('POST', `/hl/v2/customers/${encodeURIComponent(rest[0])}/update`, {
        apiKey, body: { toEmail: rest[1] },
      });
      ui.jsonOut(res.body); return;
    }
    case 'magic-link':
    case 'magiclink': {
      if (!rest[0]) throw new Error('Usage: mayar customer magic-link <email>');
      const res = await api.request('POST', '/hl/v2/customers/portal-login', {
        apiKey, body: { email: rest[0] },
      });
      ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
