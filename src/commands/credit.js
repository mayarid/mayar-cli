const api = require('../api');
const ui = require('../ui');
const { checkResp, readData } = require('../util');

const USAGE = 'Usage: mayar credit <balance|add|spend|history|register-usage|register-membership|checkout>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'balance': {
      if (!flags.customerId) throw new Error('mayar credit balance requires --customerId <id>');
      if (!flags.productId)  throw new Error('mayar credit balance requires --productId <id>');
      const res = await api.request('GET', '/hl/v2/credit/customer/balance', {
        apiKey,
        query: {
          customerId: flags.customerId,
          productId: flags.productId,
          membershipTierId: flags.tierId || flags.membershipTierId,
        },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'add': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar credit add requires --data <json|@file> ({customerId,productId,amount})');
      const res = await api.request('POST', '/hl/v2/credit/customer/add-credit', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'spend': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar credit spend requires --data <json|@file> ({customerId,productId,amount})');
      const res = await api.request('POST', '/hl/v2/credit/customer/spend', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'history': {
      if (!rest[0]) throw new Error('Usage: mayar credit history <customerId> --productId <id>');
      if (!flags.productId) throw new Error('mayar credit history requires --productId <id>');
      const res = await api.request('GET', `/hl/v2/credit/customer/paginate-credit-history/${encodeURIComponent(rest[0])}`, {
        apiKey,
        query: {
          productId: flags.productId,
          page: flags.page,
          limit: flags.limit,
        },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'register-usage': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar credit register-usage requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/credit/credit-usage/customer/regist', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'register-membership': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar credit register-membership requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/credit/membership/customer/regist', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'checkout':
    case 'generate-checkout': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar credit checkout requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/credit/generate/immutable/checkout', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
