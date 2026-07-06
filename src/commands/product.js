const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar product <list|search|type|get|close|reopen|status|transactions|create|edit>';
const STATUS_ACTIONS = ['open', 'close', 'active', 'closed', 'unlisted'];

// Map user-friendly --type values to their v2 endpoint paths.
const CREATE_PATHS = {
  ebook:             '/hl/v2/products/digital-product/create',
  digital:           '/hl/v2/products/digital-product/create',
  'digital-product': '/hl/v2/products/digital-product/create',
  event:             '/hl/v2/products/event/create',
  webinar:           '/hl/v2/products/webinar/create',
  generic:           '/hl/v2/products/create',
  'generic-link':    '/hl/v2/products/create',
  'payment-link':    '/hl/v2/products/payment-link/create',
  paymentlink:       '/hl/v2/products/payment-link/create',
};

const EDIT_PATHS = {
  ebook:             (id) => `/hl/v2/products/digital-product/${id}/update`,
  digital:           (id) => `/hl/v2/products/digital-product/${id}/update`,
  'digital-product': (id) => `/hl/v2/products/digital-product/${id}/update`,
  event:             (id) => `/hl/v2/products/event/${id}/update`,
  webinar:           (id) => `/hl/v2/products/webinar/${id}/update`,
  'payment-link':    (id) => `/hl/v2/products/payment-link/${id}/update`,
  paymentlink:       (id) => `/hl/v2/products/payment-link/${id}/update`,
};

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
  cursorFooter(body, data.length);
}

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'list': {
      const res = await api.request('GET', '/hl/v2/products', {
        apiKey,
        query: pagination(flags, { search: flags.search, type: flags.type, stock: flags.stock }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'search': {
      if (!rest[0]) throw new Error('Usage: mayar product search <keyword>');
      const res = await api.request('GET', '/hl/v2/products', {
        apiKey, query: pagination(flags, { search: rest.join(' ') }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'type': {
      if (!rest[0]) throw new Error('Usage: mayar product type <type>');
      const res = await api.request('GET', `/hl/v2/products/types/${encodeURIComponent(rest[0])}`, {
        apiKey, query: pagination(flags, { search: flags.search }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderList(res.body); return;
    }
    case 'get': {
      if (!rest[0]) throw new Error('Usage: mayar product get <id>');
      const res = await api.request('GET', `/hl/v2/products/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'transactions': {
      if (!rest[0]) throw new Error('Usage: mayar product transactions <id>');
      const res = await api.request('GET', `/hl/v2/products/${encodeURIComponent(rest[0])}/transactions`, {
        apiKey,
        query: pagination(flags, { status: flags.status, customerId: flags.customerId, fields: flags.fields }),
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'close':
    case 'reopen': {
      if (!rest[0]) throw new Error(`Usage: mayar product ${sub} <id>`);
      const action = sub === 'reopen' ? 'open' : 'close';
      const res = await api.request('POST', `/hl/v2/products/${encodeURIComponent(rest[0])}/${action}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'status': {
      if (!rest[0] || !rest[1]) throw new Error(`Usage: mayar product status <id> <${STATUS_ACTIONS.join('|')}>`);
      if (!STATUS_ACTIONS.includes(rest[1])) {
        throw new Error(`Invalid action "${rest[1]}". Must be one of: ${STATUS_ACTIONS.join(', ')}`);
      }
      const res = await api.request('POST', `/hl/v2/products/${encodeURIComponent(rest[0])}/${rest[1]}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'create': {
      const type = flags.type;
      if (!type) throw new Error(`mayar product create requires --type <${Object.keys(CREATE_PATHS).join('|')}>`);
      const path = CREATE_PATHS[type];
      if (!path) throw new Error(`Unknown type "${type}". Valid: ${Object.keys(CREATE_PATHS).join(', ')}`);
      const body = readData(flags.data);
      if (!body) throw new Error('mayar product create requires --data <json|@file>');
      const res = await api.request('POST', path, { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'edit': {
      if (!rest[0]) throw new Error('Usage: mayar product edit <id> --type <T> --data <json|@file>');
      const type = flags.type;
      if (!type) throw new Error(`mayar product edit requires --type <${Object.keys(EDIT_PATHS).join('|')}>`);
      const pathFn = EDIT_PATHS[type];
      if (!pathFn) throw new Error(`Unknown type "${type}". Valid: ${Object.keys(EDIT_PATHS).join(', ')}`);
      const body = readData(flags.data);
      if (!body) throw new Error('mayar product edit requires --data <json|@file>');
      body.id = body.id || rest[0];
      const res = await api.request('POST', pathFn(encodeURIComponent(rest[0])), { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
