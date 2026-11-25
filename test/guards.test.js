const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { checkData, checkLimit, checkAmount, GuardError } = require('../src/guards');
const { checkResp, isRejected, pagination } = require('../src/util');

const NOW = Date.parse('2026-06-01T00:00:00Z');

describe('checkData: money', () => {
  test('accepts whole positive amounts, also as numeric strings and nested', () => {
    const body = { amount: 10000, items: [{ rate: '25000', quantity: 1 }], price: 500 };
    assert.equal(checkData(body, { now: NOW }), body);
  });
  for (const bad of [0, -1, 10.5, '10.5', 'abc', '', true]) {
    test(`refuses amount ${JSON.stringify(bad)}`, () => {
      assert.throws(() => checkData({ amount: bad }, { now: NOW }), (e) => {
        assert.ok(e instanceof GuardError);
        assert.match(e.message, /amount must be a whole number above 0.*Nothing was sent to Mayar\./);
        return true;
      });
    });
  }
  test('names the nested path', () => {
    assert.throws(() => checkData({ items: [{ rate: 1 }, { rate: -5 }] }, { now: NOW }), /items\.1\.rate/);
  });
  test('ignores null money fields and other numbers', () => {
    assert.doesNotThrow(() => checkData({ amount: null, quantity: 0, discountValue: 12.5 }, { now: NOW }));
  });
});

describe('checkData: expiredAt', () => {
  test('accepts a future ISO date, epoch seconds and epoch ms', () => {
    assert.doesNotThrow(() => checkData({ expiredAt: '2026-07-01T00:00:00Z' }, { now: NOW }));
    assert.doesNotThrow(() => checkData({ expiredAt: Date.parse('2027-01-01') / 1000 }, { now: NOW }));
    assert.doesNotThrow(() => checkData({ expiredAt: Date.parse('2027-01-01') }, { now: NOW }));
  });
  test('refuses a past date', () => {
    assert.throws(() => checkData({ expiredAt: '2026-05-31T23:59:59Z' }, { now: NOW }), /expiredAt is in the past \(2026-05-31T23:59:59\.000Z\)/);
    assert.throws(() => checkData({ expiredAt: String(Date.parse('2020-01-01')) }, { now: NOW }), /in the past/);
  });
  test('leaves unparseable dates to the server', () => {
    assert.doesNotThrow(() => checkData({ expiredAt: 'next tuesday' }, { now: NOW }));
  });
});

describe('checkLimit / pagination', () => {
  test('accepts 1..50', () => {
    assert.equal(checkLimit('1'), 1);
    assert.equal(checkLimit(50), 50);
    assert.equal(checkLimit(undefined), undefined);
  });
  for (const bad of ['0', '51', '-1', '2.5', 'ten']) {
    test(`refuses --limit ${bad}`, () => assert.throws(() => checkLimit(bad), /--limit must be a whole number from 1 to 50/));
  }
  test('pagination applies the limit guard and the alias', () => {
    assert.deepEqual(pagination({ pageSize: '20', after: 'c1' }), { limit: 20, startingAfter: 'c1' });
    assert.throws(() => pagination({ limit: '100' }), /--limit/);
  });
});

describe('checkAmount', () => {
  test('returns a number for a whole positive value', () => assert.equal(checkAmount('10000'), 10000));
  test('refuses a decimal', () => assert.throws(() => checkAmount('99.9'), /amount must be a whole number/));
});

describe('rejected responses (HTTP 2xx with a failure body)', () => {
  const req = { method: 'POST', path: '/hl/v2/product/update' };
  const rejectedBodies = [
    ['statusCode 400 in the envelope', { statusCode: 400, messages: 'Bad Request' }, 400],
    ['success:false', { success: false, messages: 'nope' }, 200],
    ['status:false', { status: false, message: 'Gagal membuat QR' }, 200],
    ['only an error key', { error: 'something broke' }, 200],
    ['failure message without data', { messages: "The 'name' field is required" }, 200],
    ['"failed" with field errors in data', { messages: 'failed', data: [{ field: 'amount' }] }, 200],
    ['Indonesian failure word', { messages: 'Data tidak ditemukan' }, 200],
  ];
  for (const [label, body, status] of rejectedBodies) {
    test(`treats ${label} as rejected`, () => {
      const res = { status: 200, body, request: req };
      assert.equal(isRejected(res), true);
      assert.throws(() => checkResp(res), (e) => {
        assert.match(e.message, new RegExp(`POST /hl/v2/product/update failed \\(${status}\\) — Mayar rejected the request`));
        assert.equal(e.rejected, true);
        assert.equal(e.status, status);
        return true;
      });
    });
  }

  const okBodies = [
    ['plain success', { statusCode: 200, messages: 'success', data: { id: 1 } }],
    ['"Data not found" with data', { messages: 'Data not found', data: [] }],
    ['empty object', {}],
    ['no body', null],
    ['array body', [1, 2]],
    ['success message without data', { statusCode: 200, messages: 'success' }],
  ];
  for (const [label, body] of okBodies) {
    test(`keeps ${label} as success`, () => {
      assert.equal(isRejected({ status: 200, body }), false);
      assert.doesNotThrow(() => checkResp({ status: 200, body }));
    });
  }

  test('an envelope 401 gets the 401 hint', () => {
    const res = {
      status: 200, body: { statusCode: 401, messages: 'Unauthorized' },
      request: { method: 'GET', path: '/x', host: 'api.mayar.id', endpoint: 'production', keyIdentity: null },
    };
    assert.throws(() => checkResp(res), /failed \(401\).*\n.*Hint: The API key is invalid or expired/);
  });

  test('does not repeat an error string as detail', () => {
    let thrown;
    try { checkResp({ status: 200, body: { error: 'boom' } }); } catch (e) { thrown = e; }
    assert.equal(thrown.message, 'API request failed (200) — Mayar rejected the request: boom');
  });
});
