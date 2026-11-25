// Tests for src/guards.js (and pagination(), which applies the --limit guard).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { checkData, checkLimit, checkAmount, GuardError } = require('../src/guards');
const { pagination } = require('../src/util');

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
