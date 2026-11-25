const api = require('../api');
const ui = require('../ui');
const { readData } = require('../util');

const USAGE = 'Usage: mayar discount <create|get|validate|check>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar discount create requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/coupons/create', { apiKey, body });
      ui.jsonOut(res.body); return;
    }
    case 'get':
    case 'detail': {
      if (!rest[0]) throw new Error('Usage: mayar discount get <id>');
      const res = await api.request('GET', `/hl/v2/coupons/${encodeURIComponent(rest[0])}`, { apiKey });
      ui.jsonOut(res.body); return;
    }
    case 'validate': {
      if (!rest[0] || !rest[1]) throw new Error('Usage: mayar discount validate <couponCode> <paymentLinkId>');
      const res = await api.request('POST', '/hl/v2/coupons/validate', {
        apiKey,
        body: { couponCode: rest[0], paymentLinkId: rest[1] },
        // Mayar answers 500 (not 404) when the payment link does not exist.
        hint5xx: `Check that payment link ${rest[1]} exists (\`mayar product get <id>\`). ` +
          'Mayar returns 500 instead of 404 for an unknown payment link.',
      });
      if (flags.json) return ui.jsonOut(res.body);
      const d = (res.body && res.body.data) || {};
      const c = d.coupon || {};
      ui.fields([
        ['Result', d.valid ? '✓ valid' : '✗ invalid'],
        ['Code', c.code],
        ['Discount type', c.discountType],
        ['Discount', c.discountValue != null ? `${c.discountValue}${c.discountType === 'percentage' ? '%' : ''}` : null],
        ['Min. purchase', c.minimumPurchase],
        ['Eligible', c.eligibleCustomerType],
      ]);
      return;
    }
    case 'check': {
      if (!rest[0]) throw new Error('Usage: mayar discount check <couponCode>');
      const res = await api.request('POST', '/hl/v2/coupons/check', {
        apiKey, body: { couponCode: rest[0] },
      });
      ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
