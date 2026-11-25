// Tests for src/util.js — checkResp, readData, maybeJson.
// Built-in node:test + node:assert/strict only. Mock-free and deterministic:
// readData's file branch uses a real temp file; maybeJson's stdout side effect
// is captured (not stubbed) via the shared captureOutput helper.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkResp, readData, maybeJson } = require('../src/util');
const { captureOutput } = require('./helpers');

describe('checkResp', () => {
  test('returns undefined for a 200 response (passes through)', () => {
    assert.equal(checkResp({ status: 200, body: { foo: 1 } }), undefined);
  });

  test('passes through across the whole 2xx range', () => {
    for (const status of [200, 201, 204, 299]) {
      assert.doesNotThrow(() => checkResp({ status, body: {} }));
    }
  });

  test('throws for status just below 200', () => {
    assert.throws(() => checkResp({ status: 199, body: {} }));
  });

  test('throws for status at 300 and above', () => {
    assert.throws(() => checkResp({ status: 300, body: {} }));
    assert.throws(() => checkResp({ status: 404, body: {} }));
    assert.throws(() => checkResp({ status: 500, body: {} }));
  });

  test('thrown error carries .status and .body', () => {
    const body = { message: 'Not found' };
    let thrown;
    try {
      checkResp({ status: 404, body });
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.equal(thrown.status, 404);
    assert.equal(thrown.body, body);
  });

  test('message prefers body.messages over body.message', () => {
    assert.throws(
      () => checkResp({ status: 400, body: { messages: 'first', message: 'second' } }),
      /Error: API request failed \(400\) — first/,
    );
  });

  test('message falls back to body.message when messages is absent', () => {
    assert.throws(
      () => checkResp({ status: 400, body: { message: 'bad request' } }),
      /failed \(400\) — bad request/,
    );
  });

  test('names the method and path when the request is known', () => {
    const res = { status: 404, body: { messages: 'Not Found' }, request: { method: 'GET', path: '/hl/v2/invoices/x' } };
    assert.throws(() => checkResp(res), /Error: GET \/hl\/v2\/invoices\/x failed \(404\) — Not Found/);
  });

  test('message tolerates a missing body', () => {
    let thrown;
    try {
      checkResp({ status: 500 });
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.equal(thrown.status, 500);
    assert.equal(thrown.body, undefined);
    assert.match(thrown.message, /^API request failed \(500\) — server error/);
  });

  test('caps the message at 300 chars and the detail at 500', () => {
    const res = { status: 400, body: { messages: 'm'.repeat(1000), errors: 'd'.repeat(1000) } };
    let thrown;
    try { checkResp(res); } catch (e) { thrown = e; }
    const [first, second] = thrown.message.split('\n');
    assert.ok(first.length < 340, `first line too long: ${first.length}`);
    assert.ok(second.length <= 502 + 2, `detail too long: ${second.length}`);
  });

  test('does not print a non-JSON body (HTML page or stack trace)', () => {
    const raw = '<html><body>TypeError: Cannot read properties of null at /srv/app.js:12</body></html>';
    assert.throws(
      () => checkResp({ status: 500, body: raw, raw }),
      (e) => {
        assert.match(e.message, /unexpected non-JSON response \(\d+ bytes\)/);
        assert.doesNotMatch(e.message, /TypeError|\/srv\/app\.js/);
        assert.match(e.message, /Hint: This is an error on the Mayar side/);
        return true;
      },
    );
  });

  test('hides 5xx details (often a stack trace) unless MAYAR_DEBUG is set', () => {
    const res = { status: 500, body: { messages: 'Internal', error: 'at Object.<anonymous> (/srv/x.js:1)' }, raw: 'RAW' };
    assert.throws(() => checkResp(res), (e) => !/srv\/x\.js/.test(e.message));
    process.env.MAYAR_DEBUG = '1';
    try {
      assert.throws(() => checkResp(res), /Raw response: RAW/);
    } finally {
      delete process.env.MAYAR_DEBUG;
    }
  });

  test('401 with a JWT key names the host, the identity and the other environment', () => {
    const res = {
      status: 401, body: { messages: 'Unauthorized' },
      request: {
        method: 'GET', path: '/hl/v2/balances', host: 'api.mayar.id', endpoint: 'production',
        keyIdentity: { email: 'shop@example.com', expiresAt: '2999-01-01T00:00:00.000Z' },
      },
    };
    assert.throws(() => checkResp(res),
      /Hint: api\.mayar\.id \(production\) rejected the key for shop@example\.com\. If it is a sandbox key, run again with --sandbox\./);
  });

  test('401 with an expired JWT says when it expired', () => {
    const res = {
      status: 401, body: {},
      request: { method: 'GET', path: '/x', host: 'api.mayar.io', endpoint: 'sandbox', keyIdentity: { accountId: 'a1', expiresAt: '2020-01-01T00:00:00.000Z' } },
    };
    assert.throws(() => checkResp(res), /--production\. The key expired at 2020-01-01/);
  });

  test('401 with a non-JWT key says invalid or expired', () => {
    const res = { status: 401, body: {}, request: { method: 'GET', path: '/x', host: 'api.mayar.id', endpoint: 'production', keyIdentity: null } };
    assert.throws(() => checkResp(res), /Hint: The API key is invalid or expired\. .*web\.mayar\.id/);
  });

  test('429 after retries explains the give-up', () => {
    const res = { status: 429, body: null, retries: 3, retryAfterMs: 12_000, rateLimit: { limit: 50, remaining: 0 } };
    assert.throws(() => checkResp(res),
      /failed \(429\) — rate limited\n {2}Hint: Gave up after 3 retries\. Try again in 12s\. Rate limit: \{"limit":50,"remaining":0\}/);
  });

  test('adds _rateLimit to a 2xx object body only when headers were sent', () => {
    const body = { data: [] };
    checkResp({ status: 200, body, rateLimit: { remaining: 49 } });
    assert.deepEqual(body._rateLimit, { remaining: 49 });
    const plain = { data: [] };
    checkResp({ status: 200, body: plain, rateLimit: null });
    assert.equal('_rateLimit' in plain, false);
  });
});

describe('readData', () => {
  test('returns undefined for falsy input', () => {
    assert.equal(readData(undefined), undefined);
    assert.equal(readData(''), undefined);
    assert.equal(readData(null), undefined);
  });

  test('parses an inline JSON object string', () => {
    assert.deepEqual(readData('{"a":1,"b":"two"}'), { a: 1, b: 'two' });
  });

  test('parses inline JSON arrays and primitives', () => {
    assert.deepEqual(readData('[1,2,3]'), [1, 2, 3]);
    assert.equal(readData('42'), 42);
    assert.equal(readData('true'), true);
  });

  test('reads and parses JSON from an @file reference', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readdata-test-'));
    const file = path.join(dir, 'payload.json');
    fs.writeFileSync(file, '{"from":"file","n":7}');
    try {
      assert.deepEqual(readData('@' + file), { from: 'file', n: 7 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('throws on malformed inline JSON', () => {
    assert.throws(() => readData('{not json}'), /Invalid JSON in --data: .*Pass inline JSON in single quotes/);
  });

  test('throws when an @file reference points at a missing file', () => {
    const missing = path.join(os.tmpdir(), 'readdata-does-not-exist-12345.json');
    assert.throws(() => readData('@' + missing), /Cannot read --data file .*: ENOENT\./);
  });

  test('runs the guards on the parsed body', () => {
    assert.throws(() => readData('{"amount":10.5}'), /amount must be a whole number above 0.*Nothing was sent/);
    assert.throws(() => readData('{"expiredAt":"2001-01-01T00:00:00Z"}'), /expiredAt is in the past/);
  });
});

describe('maybeJson', () => {
  test('when flags.json is set: writes JSON to stdout and returns true', () => {
    const body = { hello: 'world' };
    const cap = captureOutput();
    let result;
    try {
      result = maybeJson({ json: true }, body, () => {
        throw new Error('fallback must not run when json flag is set');
      });
    } finally {
      cap.restore();
    }
    assert.equal(result, true);
    assert.equal(cap.stdout, JSON.stringify(body, null, 2) + '\n');
  });

  test('when not json and fallback is a function: calls it and returns true', () => {
    let called = 0;
    const result = maybeJson({ json: false }, { ignored: true }, () => {
      called += 1;
    });
    assert.equal(called, 1);
    assert.equal(result, true);
  });

  test('when not json and no fallback: returns false and writes nothing', () => {
    const cap = captureOutput();
    let result;
    try {
      result = maybeJson({}, { some: 'body' }, undefined);
    } finally {
      cap.restore();
    }
    assert.equal(result, false);
    assert.equal(cap.stdout, '');
  });

  test('non-function fallback is ignored, returning false', () => {
    assert.equal(maybeJson({ json: false }, {}, 'not-a-function'), false);
  });
});
