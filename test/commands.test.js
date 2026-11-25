// One test per command: run it with api.request stubbed and check the method,
// path, body and query it sends. No network. When a Mayar path changes on
// purpose, change the row here in the same commit.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { tempConfigHome } = require('./helpers');

const xdg = tempConfigHome();
process.on('exit', () => xdg.cleanup());

const api = require('../src/api');

const D = '{"name":"Budi","amount":10000}';
const BODY = { name: 'Budi', amount: 10000 };

// [command module, positional, flags, expected { method, path, body?, query? }]
const CASES = [
  ['balance', [], {}, { method: 'GET', path: '/hl/v2/balances' }],
  ['whoami', [], {}, { method: 'GET', path: '/hl/v2/balances' }],
  ['bundling', ['list'], {}, { method: 'GET', path: '/hl/v2/bundling' }],
  ['bundling', ['get', 'B1'], {}, { method: 'GET', path: '/hl/v2/bundling/B1' }],
  ['credit', ['balance'], { customerId: 'C1', productId: 'P1' }, { method: 'GET', path: '/credit/v2/credit/customer/balance', query: { customerId: 'C1', productId: 'P1' } }],
  ['credit', ['add'], { data: D }, { method: 'POST', path: '/credit/v2/credit/customer/add-credit', body: BODY }],
  ['credit', ['spend'], { data: D }, { method: 'POST', path: '/credit/v2/credit/customer/spend', body: BODY }],
  ['credit', ['history', 'C1'], { productId: 'P1', limit: '5' }, { method: 'GET', path: '/credit/v2/credit/customer/paginate-credit-history/C1', query: { productId: 'P1', limit: 5 } }],
  ['credit', ['register-usage'], { data: D }, { method: 'POST', path: '/credit/v2/credit/credit-usage/customer/regist', body: BODY }],
  ['credit', ['register-membership'], { data: D }, { method: 'POST', path: '/credit/v2/credit/membership/customer/regist', body: BODY }],
  ['credit', ['checkout'], { data: D }, { method: 'POST', path: '/credit/v2/credit/generate/immutable/checkout', body: BODY }],
  ['customer', ['list'], {}, { method: 'GET', path: '/hl/v2/customers' }],
  ['customer', ['create'], { data: D }, { method: 'POST', path: '/hl/v2/customers/create', body: BODY }],
  ['customer', ['search', 'a@x.co'], {}, { method: 'GET', path: '/hl/v2/customers/detail', query: { email: 'a@x.co' } }],
  ['customer', ['update', 'CU1', 'b@x.co'], {}, { method: 'POST', path: '/hl/v2/customers/CU1/update', body: { toEmail: 'b@x.co' } }],
  ['customer', ['magic-link', 'a@x.co'], {}, { method: 'POST', path: '/hl/v2/customers/portal-login', body: { email: 'a@x.co' } }],
  ['discount', ['create'], { data: D }, { method: 'POST', path: '/hl/v2/coupons/create', body: BODY }],
  ['discount', ['get', 'D1'], {}, { method: 'GET', path: '/hl/v2/coupons/D1' }],
  ['discount', ['validate', 'CODE', 'PL1'], {}, { method: 'POST', path: '/hl/v2/coupons/validate', body: { couponCode: 'CODE', paymentLinkId: 'PL1' } }],
  ['discount', ['check', 'CODE'], {}, { method: 'POST', path: '/hl/v2/coupons/check', body: { couponCode: 'CODE' } }],
  ['installment', ['list'], {}, { method: 'GET', path: '/hl/v2/installments' }],
  ['installment', ['get', 'I1'], {}, { method: 'GET', path: '/hl/v2/installments/I1' }],
  ['installment', ['create'], { data: D }, { method: 'POST', path: '/hl/v2/installments/create', body: BODY }],
  ['invoice', ['list'], {}, { method: 'GET', path: '/hl/v2/invoices' }],
  ['invoice', ['filter'], { email: 'a@x.co' }, { method: 'GET', path: '/hl/v2/invoices/filter', query: { email: 'a@x.co' } }],
  ['invoice', ['get', 'V1'], {}, { method: 'GET', path: '/hl/v2/invoices/V1' }],
  ['invoice', ['close', 'V1'], {}, { method: 'POST', path: '/hl/v2/products/V1/close' }],
  ['invoice', ['reopen', 'V1'], {}, { method: 'POST', path: '/hl/v2/products/V1/open' }],
  ['invoice', ['status', 'V1', 'unlisted'], {}, { method: 'POST', path: '/hl/v2/products/V1/unlisted' }],
  ['invoice', ['edit', 'V1'], { data: D }, { method: 'POST', path: '/hl/v2/invoices/V1/update', body: { ...BODY, id: 'V1' } }],
  ['invoice', ['create'], { data: D }, { method: 'POST', path: '/hl/v2/invoices/create', body: BODY }],
  ['membership', ['members'], { productId: 'P1' }, { method: 'GET', path: '/hl/v2/memberships/members', query: { productId: 'P1' } }],
  ['membership', ['tiers'], { productId: 'P1' }, { method: 'GET', path: '/hl/v2/memberships/tiers', query: { productId: 'P1' } }],
  ['membership', ['register'], { data: D }, { method: 'POST', path: '/hl/v2/memberships/members/create', body: BODY }],
  ['membership', ['get', 'M1'], { productId: 'P1' }, { method: 'GET', path: '/hl/v2/memberships/members/M1', query: { productId: 'P1' } }],
  ['membership', ['update', 'M1'], { productId: 'P1' }, { method: 'POST', path: '/hl/v2/memberships/members/M1/update', body: { productId: 'P1' } }],
  ['membership', ['cancel', 'M1'], { productId: 'P1' }, { method: 'POST', path: '/hl/v2/memberships/members/M1/cancel', body: { productId: 'P1' } }],
  ['membership', ['create-invoice', 'M1'], { productId: 'P1' }, { method: 'POST', path: '/hl/v2/memberships/members/M1/invoice/create', body: { productId: 'P1' } }],
  ['payment-link', ['edit', 'PL1'], { data: D }, { method: 'POST', path: '/hl/v2/payment-links/PL1/update', body: { ...BODY, id: 'PL1' } }],
  ['payment', ['list'], {}, { method: 'GET', path: '/hl/v2/payments' }],
  ['payment', ['get', 'Y1'], {}, { method: 'GET', path: '/hl/v2/payments/Y1' }],
  ['payment', ['close', 'Y1'], {}, { method: 'POST', path: '/hl/v2/payments/Y1/close' }],
  ['payment', ['reopen', 'Y1'], {}, { method: 'POST', path: '/hl/v2/payments/Y1/open' }],
  ['payment', ['status', 'Y1', 'open'], {}, { method: 'POST', path: '/hl/v2/payments/Y1/open' }],
  ['payment', ['edit', 'Y1'], { data: D }, { method: 'POST', path: '/hl/v2/payments/Y1/update', body: { ...BODY, id: 'Y1' } }],
  ['payment', ['create'], { data: D }, { method: 'POST', path: '/hl/v2/payments/create', body: BODY }],
  ['product', ['list'], {}, { method: 'GET', path: '/hl/v2/products' }],
  ['product', ['search', 'kelas'], {}, { method: 'GET', path: '/hl/v2/products', query: { search: 'kelas' } }],
  ['product', ['type', 'ebook'], {}, { method: 'GET', path: '/hl/v2/products/types/ebook' }],
  ['product', ['get', 'R1'], {}, { method: 'GET', path: '/hl/v2/products/R1' }],
  ['product', ['transactions', 'R1'], {}, { method: 'GET', path: '/hl/v2/products/R1/transactions' }],
  ['product', ['close', 'R1'], {}, { method: 'POST', path: '/hl/v2/products/R1/close' }],
  ['product', ['reopen', 'R1'], {}, { method: 'POST', path: '/hl/v2/products/R1/open' }],
  ['product', ['status', 'R1', 'closed'], {}, { method: 'POST', path: '/hl/v2/products/R1/closed' }],
  ['product', ['create'], { type: 'ebook', data: D }, { method: 'POST', path: '/hl/v2/products/digital-product/create', body: BODY }],
  ['product', ['sort', 'event'], { limit: '5', after: 'c1' }, { method: 'POST', path: '/hl/v2/payment-links/sort/event', query: { limit: 5, starting_after: 'c1' } }],
  ['product', ['edit', 'R1'], { type: 'ebook', data: D }, { method: 'POST', path: '/hl/v2/products/digital-product/R1/update', body: { ...BODY, id: 'R1' } }],
  ['qrcode', ['10000'], {}, { method: 'POST', path: '/hl/v2/qr-codes/create', body: { amount: 10000 } }],
  ['qrcode', ['static'], {}, { method: 'GET', path: '/hl/v2/qr-codes/static' }],
  ['qrcode', ['channels'], {}, { method: 'GET', path: '/hl/v2/payment-channels' }],
  ['review', ['list'], {}, { method: 'GET', path: '/hl/v2/reviews' }],
  ['review', ['stats'], {}, { method: 'GET', path: '/hl/v2/reviews/stats' }],
  ['review', ['stats', 'R1'], {}, { method: 'GET', path: '/hl/v2/products/R1/reviews/stats' }],
  ['review', ['create'], { data: D }, { method: 'POST', path: '/hl/v2/reviews/create', body: BODY }],
  ['review', ['update', 'W1'], { data: D }, { method: 'POST', path: '/hl/v2/reviews/W1/update', body: { ...BODY, id: 'W1' } }],
  ['review', ['bulk-status'], { data: '[{"id":"W1","status":"approved"}]' }, { method: 'POST', path: '/hl/v2/reviews/bulk-status/update', body: { input: [{ id: 'W1', status: 'approved' }] } }],
  ['review', ['product', 'PL1'], {}, { method: 'GET', path: '/hl/v2/products/PL1/reviews' }],
  ['review', ['product-customer', 'PL1'], { customerId: 'C1' }, { method: 'GET', path: '/hl/v2/products/PL1/reviews/customer', query: { customerId: 'C1' } }],
  ['saas', ['activate', 'L1', 'P1'], {}, { method: 'POST', path: '/saas/v2/license/activate', body: { licenseCode: 'L1', productId: 'P1' } }],
  ['saas', ['deactivate', 'L1', 'P1'], {}, { method: 'POST', path: '/saas/v2/license/deactivate', body: { licenseCode: 'L1', productId: 'P1' } }],
  ['saas', ['verify', 'L1', 'P1'], {}, { method: 'POST', path: '/saas/v2/license/verify', body: { licenseCode: 'L1', productId: 'P1' } }],
  ['software', ['verify', 'L1', 'P1'], {}, { method: 'POST', path: '/software/v2/license/verify', body: { licenseCode: 'L1', productId: 'P1' } }],
  ['transaction', ['list'], {}, { method: 'GET', path: '/hl/v2/transactions' }],
  ['transaction', ['paid'], {}, { method: 'GET', path: '/hl/v2/transactions' }],
  ['transaction', ['unpaid'], {}, { method: 'GET', path: '/hl/v2/transactions/unpaid' }],
  ['transaction', ['daily'], {}, { method: 'GET', path: '/hl/v2/transactions/daily' }],
  ['transaction', ['product', 'R1'], {}, { method: 'GET', path: '/hl/v2/products/R1/transactions' }],
  ['webhook', ['register', 'https://93.184.216.34/h'], {}, { method: 'POST', path: '/hl/v2/webhooks/update', body: { urlHook: 'https://93.184.216.34/h' } }],
  ['webhook', ['test', 'https://93.184.216.34/h'], {}, { method: 'POST', path: '/hl/v2/webhooks/test', body: { urlHook: 'https://93.184.216.34/h' } }],
  ['webhook', ['history'], {}, { method: 'GET', path: '/hl/v2/webhooks/history' }],
  ['webhook', ['new-history'], {}, { method: 'GET', path: '/hl/v2/webhooks/new-history' }],
  ['webhook', ['retry', 'H1'], {}, { method: 'POST', path: '/hl/v2/webhooks/retry', body: { webhookHistoryId: 'H1' } }],
];

// Drop empty query keys, the same way api.request does.
function cleanQuery(q) {
  if (!q) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

async function dispatch(cmd, positional, flags) {
  const calls = [];
  const orig = api.request;
  const write = process.stdout.write;
  api.request = async (method, path, opts = {}) => {
    calls.push({ method, path, body: opts.body, query: cleanQuery(opts.query), apiKey: opts.apiKey });
    return { status: 200, body: { data: [] } };
  };
  process.stdout.write = () => true;
  try {
    await require(`../src/commands/${cmd}`).run({ apiKey: 'test-key', flags, positional });
  } finally {
    api.request = orig;
    process.stdout.write = write;
  }
  return calls;
}

describe('every command sends the expected request', () => {
  for (const [cmd, positional, flags, want] of CASES) {
    test(`${cmd} ${positional.join(' ')}`.trim(), async () => {
      const calls = await dispatch(cmd, positional, flags);
      assert.equal(calls.length, 1, 'expected exactly one request');
      const [c] = calls;
      assert.equal(c.method, want.method);
      assert.equal(c.path, want.path);
      assert.deepEqual(c.body, want.body);
      assert.deepEqual(c.query, want.query);
      assert.equal(c.apiKey, 'test-key');
    });
  }
});

test('customer update refuses an email where the customer ID belongs', async () => {
  await assert.rejects(dispatch('customer', ['update', 'a@x.co', 'b@x.co'], {}), /needs the customer ID.*mayar customer search a@x\.co/);
});

describe('credential order', () => {
  const config = require('../src/config');
  const env = process.env.MAYAR_API_KEY;
  const reset = () => { if (env === undefined) delete process.env.MAYAR_API_KEY; else process.env.MAYAR_API_KEY = env; };

  test('--api-key > MAYAR_API_KEY > saved API key > login token', () => {
    const cfg = { apiKey: 'saved', auth: { authToken: 'login' } };
    try {
      process.env.MAYAR_API_KEY = 'env';
      assert.deepEqual(config.resolveCredential({ apiKey: 'flag' }, cfg), { value: 'flag', source: '--api-key' });
      assert.deepEqual(config.resolveCredential({}, cfg), { value: 'env', source: 'MAYAR_API_KEY' });
      delete process.env.MAYAR_API_KEY;
      assert.deepEqual(config.resolveCredential({}, cfg), { value: 'saved', source: 'saved API key' });
      assert.deepEqual(config.resolveCredential({}, { auth: { authToken: 'login' } }), { value: 'login', source: 'login token' });
      assert.equal(config.resolveCredential({}, null), null);
    } finally { reset(); }
  });

  test('balance uses the resolved credential, not the login token first', async () => {
    const calls = await dispatch('balance', [], {});
    assert.equal(calls[0].apiKey, 'test-key');
  });
});

describe('api-key saves the chosen environment', () => {
  const config = require('../src/config');
  const apikey = require('../src/commands/apikey');
  const quiet = async (fn) => { const w = process.stdout.write; process.stdout.write = () => true; try { await fn(); } finally { process.stdout.write = w; } };

  test('--sandbox saves a sandbox key', async () => {
    config.setRuntimeEndpoint('sandbox');
    try { await quiet(() => apikey.run({ positional: ['sk_test'], flags: { sandbox: true } })); } finally { config.setRuntimeEndpoint(null); }
    assert.equal(config.load().endpoint, 'sandbox');
  });

  test('no flag saves a production key', async () => {
    await quiet(() => apikey.run({ positional: ['pk_live'], flags: {} }));
    assert.equal(config.load().endpoint, 'production');
  });
});

describe('small fixes', () => {
  const fs = require('node:fs');
  const config = require('../src/config');

  test('config file is created with mode 0600', { skip: process.platform === 'win32' }, () => {
    config.clear();
    config.save({ apiKey: 'x' });
    assert.equal(fs.statSync(config.file).mode & 0o777, 0o600);
  });

  test('an invalid stored endpoint is refused, not treated as production', () => {
    config.save({ apiKey: 'x', endpoint: 'sandbx' });
    config.setRuntimeEndpoint(null);
    const prev = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      assert.throws(() => config.resolveEndpoint(), /Invalid endpoint "sandbx".*mayar config reset/);
    } finally {
      if (prev !== undefined) process.env.NODE_ENV = prev;
      config.clear();
    }
  });

  test('unknown flags are reported; known ones are not', () => {
    const { parseFlags, unknownFlags } = require('../src/cli');
    const { flags } = parseFlags(['invoice', 'list', '--jsno', 'x', '--productId', 'P1', '--json', '--global']);
    assert.deepEqual(unknownFlags(flags), [{ name: 'jsno', value: 'x' }]);
  });

  test('skill install builds the official installer command', () => {
    const { installArgs } = require('../src/commands/skill');
    assert.deepEqual(installArgs({ target: 'claude' }),
      ['-y', 'skills', 'add', 'mayarid/skills', '--skill', 'mayar-v2', '-y', '-a', 'claude-code']);
    assert.deepEqual(installArgs({ target: 'all', global: true }).slice(7),
      ['-a', 'claude-code', '-a', 'codex', '-a', 'cursor', '-a', 'opencode', '-g']);
    assert.throws(() => installArgs({ target: 'vim' }), /Invalid --target "vim"/);
  });

  test('skill install runs the installer and reports failure', async () => {
    const skill = require('../src/commands/skill');
    const w = process.stdout.write;
    process.stdout.write = () => true;
    let seen;
    try {
      await skill.run({ flags: { target: 'cursor' }, positional: ['install'] }, { exec: async (args) => { seen = args; return { code: 0, output: '' }; } });
      await assert.rejects(
        skill.run({ flags: {}, positional: ['install'] }, { exec: async () => ({ code: 2, output: '' }) }),
        /skills installer failed \(exit code 2\)/,
      );
    } finally { process.stdout.write = w; }
    assert.deepEqual(seen.slice(-2), ['-a', 'cursor']);
  });
});
