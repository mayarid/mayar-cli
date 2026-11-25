const api = require('../api');
const ui = require('../ui');
const { checkResp, readData } = require('../util');

const USAGE = 'Usage: mayar discount <create|get|validate|check>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'create': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar discount create requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/coupons/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'get':
    case 'detail': {
      if (!rest[0]) throw new Error('Usage: mayar discount get <id>');
      const res = await api.request('GET', `/hl/v2/coupons/${encodeURIComponent(rest[0])}`, { apiKey });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'validate': {
      if (!rest[0] || !rest[1]) throw new Error('Usage: mayar discount validate <couponCode> <paymentLinkId>');
      const res = await api.request('POST', '/hl/v2/coupons/validate', {
        apiKey, body: { couponCode: rest[0], paymentLinkId: rest[1] },
      });
      try {
        checkResp(res);
      } catch (err) {
        // Mayar answers 500 (not 404) when the payment link does not exist.
        if (err.status >= 500) {
          err.message += `\n  Hint: Check that payment link ${rest[1]} exists ` +
            '(`mayar product get <id>`). Mayar returns 500 instead of 404 for an unknown payment link.';
        }
        throw err;
      }
      if (flags.json) return ui.jsonOut(res.body);
      const d = (res.body && res.body.data) || {};
      const c = d.coupon || {};
      const valid = d.valid ? ui.green('✓ valid') : ui.red('✗ invalid');
      process.stdout.write(`${ui.bold('Result:')}         ${valid}\n`);
      if (c.code)          process.stdout.write(`${ui.bold('Code:')}           ${ui.safe(c.code)}\n`);
      if (c.discountType)  process.stdout.write(`${ui.bold('Discount type:')} ${ui.safe(c.discountType)}\n`);
      if (c.discountValue != null) process.stdout.write(`${ui.bold('Discount:')}       ${ui.safe(c.discountValue)}${c.discountType === 'percentage' ? '%' : ''}\n`);
      if (c.minimumPurchase != null) process.stdout.write(`${ui.bold('Min. purchase:')} ${ui.safe(c.minimumPurchase)}\n`);
      if (c.eligibleCustomerType) process.stdout.write(`${ui.bold('Eligible:')}       ${ui.safe(c.eligibleCustomerType)}\n`);
      return;
    }
    case 'check': {
      if (!rest[0]) throw new Error('Usage: mayar discount check <couponCode>');
      const res = await api.request('POST', '/hl/v2/coupons/check', {
        apiKey, body: { couponCode: rest[0] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
