const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const jwt = require('../src/jwt');

function makeJwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`;
}

describe('jwt', () => {
  test('decodes the payload and picks the identity', () => {
    const t = makeJwt({ name: 'Toko', email: 'a@b.co', sub: 'u1', exp: 4102444800 });
    assert.equal(jwt.decodeJwt(t).sub, 'u1');
    assert.deepEqual(jwt.identity(t), { name: 'Toko', email: 'a@b.co', accountId: 'u1', expiresAt: '2100-01-01T00:00:00.000Z' });
  });
  test('returns null for non-JWT input', () => {
    for (const v of [null, '', 'plain-key', 'a.b', 'a.!!!.c', makeJwt([1, 2])]) {
      assert.equal(jwt.identity(v), null, String(v));
    }
  });
});
