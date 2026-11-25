// Tests for src/response.js: rejected-response detection and the ApiError text.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { ApiError, isRejected, isFailure, toError } = require('../src/response');

const CTX = { method: 'POST', path: '/hl/v2/product/update' };

describe('isFailure / isRejected', () => {
  test('a 2xx with a plain body is not a failure', () => {
    for (const status of [200, 201, 204, 299]) assert.equal(isFailure({ status, body: {} }), false);
  });
  test('non-2xx is a failure but not a rejected response', () => {
    for (const status of [199, 300, 404, 500]) {
      assert.equal(isFailure({ status, body: {} }), true);
      assert.equal(isRejected({ status, body: {} }), false);
    }
  });

  const rejectedBodies = [
    ['statusCode 400 in the envelope', { statusCode: 400, messages: 'Bad Request' }],
    ['success:false', { success: false, messages: 'nope' }],
    ['status:false', { status: false, message: 'Gagal membuat QR' }],
    ['only an error key', { error: 'something broke' }],
    ['failure message without data', { messages: "The 'name' field is required" }],
    ['"failed" with field errors in data', { messages: 'failed', data: [{ field: 'amount' }] }],
    ['Indonesian failure word', { messages: 'Data tidak ditemukan' }],
  ];
  for (const [label, body] of rejectedBodies) {
    test(`treats ${label} as rejected`, () => assert.equal(isRejected({ status: 200, body }), true));
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
    test(`keeps ${label} as success`, () => assert.equal(isFailure({ status: 200, body }), false));
  }
});

describe('toError', () => {
  test('returns an ApiError with status, httpStatus, rejected and body', () => {
    const body = { message: 'Not found' };
    const err = toError({ status: 404, body });
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    assert.equal(err.httpStatus, 404);
    assert.equal(err.rejected, false);
    assert.equal(err.body, body);
  });

  test('prefers body.messages over body.message', () => {
    assert.match(toError({ status: 400, body: { messages: 'first', message: 'second' } }).message, /^API request failed \(400\) — first/);
  });

  test('names the method and path when known', () => {
    assert.match(toError({ status: 404, body: { messages: 'Not Found' } }, { method: 'GET', path: '/hl/v2/invoices/x' }).message,
      /^GET \/hl\/v2\/invoices\/x failed \(404\) — Not Found/);
  });

  test('tolerates a missing body', () => {
    assert.match(toError({ status: 500 }).message, /^API request failed \(500\) — server error/);
  });

  test('caps the message at 300 chars and the detail at 500', () => {
    const [first, second] = toError({ status: 400, body: { messages: 'm'.repeat(1000), errors: 'd'.repeat(1000) } }).message.split('\n');
    assert.ok(first.length < 340, `first line too long: ${first.length}`);
    assert.ok(second.length <= 504, `detail too long: ${second.length}`);
  });

  test('does not print a non-JSON body (HTML page or stack trace)', () => {
    const raw = '<html><body>TypeError: Cannot read properties of null at /srv/app.js:12</body></html>';
    const msg = toError({ status: 500, body: raw, raw }).message;
    assert.match(msg, /unexpected non-JSON response \(\d+ bytes\)/);
    assert.doesNotMatch(msg, /TypeError|\/srv\/app\.js/);
    assert.match(msg, /Hint: This is an error on the Mayar side/);
  });

  test('hides 5xx details unless MAYAR_DEBUG is set', () => {
    const res = { status: 500, body: { messages: 'Internal', error: 'at Object.<anonymous> (/srv/x.js:1)' }, raw: 'RAW' };
    assert.doesNotMatch(toError(res).message, /srv\/x\.js/);
    process.env.MAYAR_DEBUG = '1';
    try { assert.match(toError(res).message, /Raw response: RAW/); } finally { delete process.env.MAYAR_DEBUG; }
  });

  test('hint5xx replaces the generic 5xx hint (one hint only)', () => {
    const msg = toError({ status: 500, body: {} }, { hint5xx: 'Check that payment link PL1 exists.' }).message;
    assert.equal((msg.match(/Hint:/g) || []).length, 1);
    assert.match(msg, /Hint: Check that payment link PL1 exists\./);
  });

  const at = (endpoint, keyIdentity) => ({ method: 'GET', path: '/x', host: endpoint === 'sandbox' ? 'api.mayar.io' : 'api.mayar.id', endpoint, webUrl: 'https://web.mayar.id', keyIdentity });

  test('401 with a JWT key names the host, the identity and the other environment', () => {
    const msg = toError({ status: 401, body: { messages: 'Unauthorized' } }, at('production', { email: 'shop@example.com', expiresAt: '2999-01-01T00:00:00.000Z' })).message;
    assert.match(msg, /Hint: api\.mayar\.id \(production\) rejected the key for shop@example\.com\. If it is a sandbox key, run again with --sandbox\./);
  });

  test('401 with an expired JWT says when it expired', () => {
    assert.match(toError({ status: 401, body: {} }, at('sandbox', { accountId: 'a1', expiresAt: '2020-01-01T00:00:00.000Z' })).message,
      /--production\. The key expired at 2020-01-01/);
  });

  test('401 with a non-JWT key says invalid or expired', () => {
    assert.match(toError({ status: 401, body: {} }, at('production', null)).message, /Hint: The API key is invalid or expired\. .*web\.mayar\.id/);
  });

  test('429 after retries explains the give-up', () => {
    assert.match(toError({ status: 429, body: null }, { retries: 3, retryAfterMs: 12_000, rateLimit: { limit: 50, remaining: 0 } }).message,
      /failed \(429\) — rate limited\n {2}Hint: Gave up after 3 retries\. Try again in 12s\. Rate limit: \{"limit":50,"remaining":0\}/);
  });

  test('a rejected response uses the envelope status and says so', () => {
    const err = toError({ status: 200, body: { statusCode: 400, messages: 'Bad Request' } }, CTX);
    assert.match(err.message, /^POST \/hl\/v2\/product\/update failed \(400\) — Mayar rejected the request: Bad Request/);
    assert.equal(err.rejected, true);
    assert.equal(err.status, 400);
    assert.equal(err.httpStatus, 200);
  });

  test('an envelope 401 gets the 401 hint', () => {
    assert.match(toError({ status: 200, body: { statusCode: 401, messages: 'Unauthorized' } }, at('production', null)).message,
      /failed \(401\).*\n.*Hint: The API key is invalid or expired/);
  });

  test('does not repeat an error string as detail', () => {
    assert.equal(toError({ status: 200, body: { error: 'boom' } }).message, 'API request failed (200) — Mayar rejected the request: boom');
  });
});
