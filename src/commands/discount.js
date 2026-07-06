const api = require('../api');
const ui = require('../ui');
const { checkResp } = require('../util');

const USAGE = 'Usage: mayar discount <validate> <couponCode> <paymentLinkId>';

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'validate': {
      if (!rest[0] || !rest[1]) throw new Error('Usage: mayar discount validate <couponCode> <paymentLinkId>');
      const res = await api.request('POST', '/hl/v2/coupons/validate', {
        apiKey, body: { couponCode: rest[0], paymentLinkId: rest[1] },
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const d = (res.body && res.body.data) || {};
      const c = d.coupon || {};
      const valid = d.valid ? ui.green('✓ valid') : ui.red('✗ invalid');
      process.stdout.write(`${ui.bold('Result:')}         ${valid}\n`);
      if (c.code)          process.stdout.write(`${ui.bold('Code:')}           ${c.code}\n`);
      if (c.discountType)  process.stdout.write(`${ui.bold('Discount type:')} ${c.discountType}\n`);
      if (c.discountValue != null) process.stdout.write(`${ui.bold('Discount:')}       ${c.discountValue}${c.discountType === 'percentage' ? '%' : ''}\n`);
      if (c.minimumPurchase != null) process.stdout.write(`${ui.bold('Min. purchase:')} ${c.minimumPurchase}\n`);
      if (c.eligibleCustomerType) process.stdout.write(`${ui.bold('Eligible:')}       ${c.eligibleCustomerType}\n`);
      return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
