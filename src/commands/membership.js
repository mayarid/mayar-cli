const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar membership <members|tiers|register|get|update|cancel|create-invoice>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'members': {
      if (!flags.productId) throw new Error('mayar membership members requires --productId <id>');
      const res = await api.request('GET', '/hl/v2/memberships/members', {
        apiKey, query: pagination(flags, { productId: flags.productId }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((m) => ({
        id: m.id,
        customer: (m.customer && (m.customer.name || m.customer.email)) || '',
        tier: (m.membershipTier && m.membershipTier.name) || m.membershipTierId || '',
        period: m.membershipMonthlyPeriod ?? '',
        status: m.status || '',
      }));
      ui.table(rows, ['id', 'customer', 'tier', 'period', 'status']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'tiers': {
      if (!flags.productId) throw new Error('mayar membership tiers requires --productId <id>');
      const res = await api.request('GET', '/hl/v2/memberships/tiers', {
        apiKey, query: pagination(flags, { productId: flags.productId }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((t) => ({
        id: t.id, name: t.name, amount: t.amount, status: t.status,
      }));
      ui.table(rows, ['id', 'name', 'amount', 'status']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'register': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar membership register requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/memberships/members/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'get':
    case 'detail': {
      if (!rest[0]) throw new Error('Usage: mayar membership get <memberId> --productId <id>');
      if (!flags.productId) throw new Error('mayar membership get requires --productId <id>');
      const res = await api.request('GET', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}`, {
        apiKey, query: { productId: flags.productId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'update': {
      if (!rest[0]) throw new Error('Usage: mayar membership update <memberId> --productId <id> [--data <json|@file>]');
      if (!flags.productId) throw new Error('mayar membership update requires --productId <id>');
      const body = readData(flags.data) || {};
      body.productId = body.productId || flags.productId;
      const res = await api.request('POST', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}/update`, {
        apiKey, body,
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'cancel': {
      if (!rest[0]) throw new Error('Usage: mayar membership cancel <memberId> --productId <id>');
      if (!flags.productId) throw new Error('mayar membership cancel requires --productId <id>');
      const res = await api.request('POST', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}/cancel`, {
        apiKey, body: { productId: flags.productId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'create-invoice':
    case 'createinvoice':
    case 'invoice': {
      if (!rest[0]) throw new Error('Usage: mayar membership create-invoice <memberId> --productId <id>');
      if (!flags.productId) throw new Error('mayar membership create-invoice requires --productId <id>');
      const res = await api.request('POST', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}/invoice/create`, {
        apiKey, body: { productId: flags.productId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
