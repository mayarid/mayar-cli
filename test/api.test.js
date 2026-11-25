// Tests for src/api.js over a local HTTP server (MAYAR_API_URL), so no request
// leaves the machine.

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { tempConfigHome, startServer, captureOutput } = require('./helpers');

const xdg = tempConfigHome(); // before any src require: config reads it
const config = require('../src/config');
const api = require('../src/api');
const { ApiError } = require('../src/response');

const ENV_KEYS = ['MAYAR_API_URL', 'MAYAR_TIMEOUT_MS', 'NODE_ENV'];
const savedEnv = {};
before(() => { for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; } });
after(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  config.setRuntimeEndpoint(null);
  xdg.cleanup();
});

function makeJwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`;
}

// Replace sleep so retries and the throttle do not slow the suite down.
const realClock = { ...api.clock };
function fakeSleep() {
  const waits = [];
  api.clock.sleep = async (ms) => { waits.push(ms); };
  api.clock.random = () => 0;
  return waits;
}
function restoreClock() { Object.assign(api.clock, realClock); api.resetThrottle(); }

const quiet = async (fn) => {
  const cap = captureOutput();
  try { return await fn(); } finally { cap.restore(); }
};

describe('api.request', () => {
  let srv;
  let handler;
  before(async () => { srv = await startServer((req, res) => handler(req, res)); });
  after(async () => { await srv.close(); });
  beforeEach(() => {
    process.env.MAYAR_API_URL = srv.url;
    config.setRuntimeEndpoint('production');
    restoreClock();
  });

  const reply = (status, body, headers = {}) => (req, res) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  test('sends method, path, query, body and headers; parses JSON', async () => {
    let seen;
    handler = (req, res) => {
      let b = '';
      req.on('data', (c) => { b += c; });
      req.on('end', () => {
        seen = { method: req.method, url: req.url, auth: req.headers.authorization, ua: req.headers['user-agent'], body: b };
        reply(200, { ok: true })(req, res);
      });
    };
    const res = await api.request('POST', '/hl/v2/things', { apiKey: 'k1', body: { a: 1 }, query: { limit: 5, skip: '' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(seen.method, 'POST');
    assert.equal(seen.url, '/hl/v2/things?limit=5');
    assert.equal(seen.auth, 'Bearer k1');
    assert.match(seen.ua, /^mayar-cli\//);
    assert.equal(seen.body, '{"a":1}');
  });

  test('removes a pasted "Bearer " prefix from the key', async () => {
    let auth;
    handler = (req, res) => { auth = req.headers.authorization; reply(200, {})(req, res); };
    await api.request('GET', '/x', { apiKey: '  Bearer abc.def.ghi ' });
    assert.equal(auth, 'Bearer abc.def.ghi');
  });

  test('throws ApiError on an HTTP error, naming the request', async () => {
    handler = reply(404, { statusCode: 404, messages: 'Not Found' });
    await assert.rejects(api.request('GET', '/hl/v2/nope', { apiKey: 'k' }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.match(err.message, /^GET \/hl\/v2\/nope failed \(404\) — Not Found/);
      return true;
    });
  });

  test('throws on a rejected response (HTTP 200 with a failure body)', async () => {
    handler = reply(200, { statusCode: 401, messages: 'Failed authentication!' });
    await assert.rejects(api.request('GET', '/credit/v2/credit/customer/balance', { apiKey: 'k' }), (err) => {
      assert.equal(err.rejected, true);
      assert.equal(err.status, 401);
      assert.match(err.message, /failed \(401\) — Mayar rejected the request: Failed authentication!/);
      assert.match(err.message, /Hint: The API key is invalid or expired/);
      return true;
    });
  });

  test('the 401 hint names who the key claims to be, never the key', async () => {
    handler = reply(401, { messages: 'Unauthorized' });
    const key = makeJwt({ email: 'who@example.com' });
    await assert.rejects(api.request('GET', '/x', { apiKey: key }), (err) => {
      assert.match(err.message, /rejected the key for who@example\.com/);
      assert.equal(err.message.includes(key), false);
      return true;
    });
  });

  test('hint5xx replaces the generic server-error hint', async () => {
    handler = reply(500, { messages: 'Internal Server Error' });
    await assert.rejects(api.request('POST', '/x', { apiKey: 'k', hint5xx: 'Check the payment link.' }), (err) => {
      assert.equal((err.message.match(/Hint:/g) || []).length, 1);
      assert.match(err.message, /Hint: Check the payment link\./);
      return true;
    });
  });

  test('adds _rateLimit to a successful body only when Mayar sends the headers', async () => {
    handler = reply(200, { data: [] }, { 'x-ratelimit-remaining': '49' });
    assert.deepEqual((await api.request('GET', '/x', { apiKey: 'k' })).body._rateLimit, { remaining: 49 });
    handler = reply(200, { data: [] });
    assert.equal('_rateLimit' in (await api.request('GET', '/x', { apiKey: 'k' })).body, false);
  });

  test('retries a 429 with backoff, then succeeds', async () => {
    const waits = fakeSleep();
    let n = 0;
    handler = (req, res) => { n += 1; (n < 3 ? reply(429, {}) : reply(200, { ok: 1 }))(req, res); };
    const res = await quiet(() => api.request('GET', '/x', { apiKey: 'k' }));
    restoreClock();
    assert.equal(res.status, 200);
    assert.ok(waits.includes(1000) && waits.includes(2000), `waits: ${waits}`);
  });

  test('honours Retry-After in seconds', async () => {
    const waits = fakeSleep();
    let n = 0;
    handler = (req, res) => { n += 1; (n === 1 ? reply(429, undefined, { 'retry-after': '7' }) : reply(200, {}))(req, res); };
    await quiet(() => api.request('GET', '/x', { apiKey: 'k' }));
    restoreClock();
    assert.ok(waits.includes(7000), `waits: ${waits}`);
  });

  test('gives up after 3 retries and reports the rate-limit headers', async () => {
    fakeSleep();
    let n = 0;
    handler = (req, res) => { n += 1; reply(429, {}, { 'x-ratelimit-limit': '50', 'x-ratelimit-remaining': '0' })(req, res); };
    await assert.rejects(quiet(() => api.request('GET', '/x', { apiKey: 'k' })),
      /failed \(429\) — rate limited\n {2}Hint: Gave up after 3 retries\. .*Rate limit: \{"limit":50,"remaining":0\}/);
    restoreClock();
    assert.equal(n, 4);
  });

  test('gives up at once when Retry-After is longer than 30s', async () => {
    fakeSleep();
    let n = 0;
    handler = (req, res) => { n += 1; reply(429, undefined, { 'retry-after': '120' })(req, res); };
    await assert.rejects(api.request('GET', '/x', { apiKey: 'k' }), /Gave up after 0 retries\. Try again in 120s\./);
    restoreClock();
    assert.equal(n, 1);
  });

  test('times out a server that never answers', async () => {
    process.env.MAYAR_TIMEOUT_MS = '50';
    handler = () => { /* never answer */ };
    try {
      await assert.rejects(api.request('GET', '/slow', { apiKey: 'k' }),
        /Request timed out after 0s: GET \/slow\. .*MAYAR_TIMEOUT_MS/);
    } finally { delete process.env.MAYAR_TIMEOUT_MS; }
  });

  test('the timeout covers the whole request, not only idle time', async () => {
    process.env.MAYAR_TIMEOUT_MS = '300';
    let timer;
    handler = (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"a":"');
      timer = setInterval(() => res.write('x'), 100); // one byte every 100 ms, never ends
      req.on('close', () => clearInterval(timer));
    };
    try {
      await assert.rejects(api.request('GET', '/trickle', { apiKey: 'k' }), /Request timed out/);
    } finally { clearInterval(timer); delete process.env.MAYAR_TIMEOUT_MS; }
  });

  test('throttles back-to-back requests', async () => {
    const waits = [];
    let t = 1_000_000;
    api.clock.now = () => t;
    api.clock.sleep = async (ms) => { waits.push(ms); t += ms; };
    handler = reply(200, {});
    try {
      await api.request('GET', '/a', { apiKey: 'k' });
      await api.request('GET', '/b', { apiKey: 'k' });
    } finally { restoreClock(); }
    assert.deepEqual(waits, [250]);
  });

  test('a network error names the request', async () => {
    process.env.MAYAR_API_URL = 'http://127.0.0.1:1';
    await assert.rejects(api.request('GET', '/x', { apiKey: 'k' }), /Network error on GET \/x \(127\.0\.0\.1:1\): ECONNREFUSED/);
  });
});

describe('parseRetryAfter', () => {
  test('reads seconds and HTTP dates', () => {
    assert.equal(api.parseRetryAfter('3'), 3000);
    assert.equal(api.parseRetryAfter(''), null);
    assert.equal(api.parseRetryAfter('soon'), null);
    const ms = api.parseRetryAfter(new Date(Date.now() + 10_000).toUTCString());
    assert.ok(ms > 8000 && ms <= 10_000, String(ms));
  });
});
