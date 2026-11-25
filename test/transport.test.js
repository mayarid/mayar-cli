// Tests for src/api.js (transport), src/config.js hosts, src/jwt.js and the
// security wiring in commands. The HTTP tests use a local server through
// MAYAR_API_URL, so no request leaves the machine.

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { tempConfigHome, startServer, captureOutput } = require('./helpers');

const xdg = tempConfigHome(); // before any src require: config reads it
const config = require('../src/config');
const api = require('../src/api');
const jwt = require('../src/jwt');
const ui = require('../src/ui');
const { confirmPlainText } = require('../src/util');

const ENV_KEYS = ['MAYAR_API_URL', 'MAYAR_AUTH_URL', 'MAYAR_SANDBOX_LEGACY', 'MAYAR_TIMEOUT_MS', 'NODE_ENV'];
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

describe('config hosts', () => {
  beforeEach(() => { config._resetLegacyWarning(); delete process.env.MAYAR_SANDBOX_LEGACY; });

  test('production uses mayar.id hosts', () => {
    config.setRuntimeEndpoint('production');
    assert.equal(config.apiBaseUrl(), 'https://api.mayar.id');
    assert.equal(config.authBaseUrl(), 'https://auth.mayar.id');
    assert.equal(config.webBaseUrl(), 'https://web.mayar.id');
  });

  test('--sandbox uses mayar.io hosts', () => {
    config.setRuntimeEndpoint('sandbox');
    assert.equal(config.apiBaseUrl(), 'https://api.mayar.io');
    assert.equal(config.authBaseUrl(), 'https://auth.mayar.io');
    assert.equal(config.webBaseUrl(), 'https://web.mayar.io');
  });

  test('MAYAR_SANDBOX_LEGACY=1 uses mayar.club and warns once', () => {
    config.setRuntimeEndpoint('sandbox');
    process.env.MAYAR_SANDBOX_LEGACY = '1';
    const cap = captureOutput();
    try {
      assert.equal(config.apiBaseUrl(), 'https://api.mayar.club');
      assert.equal(config.authBaseUrl(), 'https://auth.mayar.club');
    } finally { cap.restore(); }
    assert.equal((cap.stderr.match(/deprecated/g) || []).length, 1);
  });

  test('an explicit MAYAR_API_URL on mayar.club also warns', () => {
    process.env.MAYAR_API_URL = 'https://api.mayar.club';
    const cap = captureOutput();
    try { config.apiBaseUrl(); } finally { cap.restore(); delete process.env.MAYAR_API_URL; }
    assert.match(cap.stderr, /old Mayar sandbox domain/);
  });

  test('a look-alike host does not warn', () => {
    process.env.MAYAR_API_URL = 'https://notmayar.club.example.com';
    const cap = captureOutput();
    try { config.apiBaseUrl(); } finally { cap.restore(); delete process.env.MAYAR_API_URL; }
    assert.equal(cap.stderr, '');
  });
});

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

describe('api.request over a local server', () => {
  let srv;
  let handler;
  before(async () => {
    srv = await startServer((req, res) => handler(req, res));
  });
  after(async () => { await srv.close(); });
  beforeEach(() => {
    process.env.MAYAR_API_URL = srv.url;
    config.setRuntimeEndpoint('production');
    restoreClock();
  });

  test('sends method, path, query, body and headers; parses JSON', async () => {
    let seen;
    handler = (req, res) => {
      let b = '';
      req.on('data', (c) => { b += c; });
      req.on('end', () => {
        seen = { method: req.method, url: req.url, auth: req.headers.authorization, ua: req.headers['user-agent'], body: b };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
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
    assert.equal(res.request.method, 'POST');
    assert.equal(res.request.path, '/hl/v2/things');
    assert.equal(res.request.endpoint, 'production');
  });

  test('removes a pasted "Bearer " prefix from the key', async () => {
    let auth;
    handler = (req, res) => { auth = req.headers.authorization; res.writeHead(200); res.end('{}'); };
    await api.request('GET', '/x', { apiKey: '  Bearer abc.def.ghi ' });
    assert.equal(auth, 'Bearer abc.def.ghi');
  });

  test('keeps the key identity, never the key, on the response', async () => {
    handler = (req, res) => { res.writeHead(401); res.end('{}'); };
    const key = makeJwt({ email: 'who@example.com' });
    const res = await api.request('GET', '/x', { apiKey: key });
    assert.equal(res.request.keyIdentity.email, 'who@example.com');
    assert.equal(JSON.stringify(res.request).includes(key), false);
  });

  test('retries a 429 with backoff, then succeeds', async () => {
    const waits = fakeSleep();
    let n = 0;
    handler = (req, res) => {
      n += 1;
      if (n < 3) { res.writeHead(429); res.end('{}'); return; }
      res.writeHead(200); res.end('{"ok":1}');
    };
    const cap = captureOutput();
    let res;
    try { res = await api.request('GET', '/x', { apiKey: 'k' }); } finally { cap.restore(); restoreClock(); }
    assert.equal(res.status, 200);
    assert.equal(res.retries, 2);
    assert.ok(waits.includes(1000) && waits.includes(2000), `waits: ${waits}`);
    assert.match(cap.stderr, /Retry 1\/3/);
  });

  test('honours Retry-After in seconds', async () => {
    const waits = fakeSleep();
    let n = 0;
    handler = (req, res) => {
      n += 1;
      if (n === 1) { res.writeHead(429, { 'retry-after': '7' }); res.end(); return; }
      res.writeHead(200); res.end('{}');
    };
    const cap = captureOutput();
    try { await api.request('GET', '/x', { apiKey: 'k' }); } finally { cap.restore(); restoreClock(); }
    assert.ok(waits.includes(7000), `waits: ${waits}`);
  });

  test('gives up after 3 retries and reports rate-limit headers', async () => {
    fakeSleep();
    let n = 0;
    handler = (req, res) => {
      n += 1;
      res.writeHead(429, { 'x-ratelimit-limit': '50', 'x-ratelimit-remaining': '0' });
      res.end('{}');
    };
    const cap = captureOutput();
    let res;
    try { res = await api.request('GET', '/x', { apiKey: 'k' }); } finally { cap.restore(); restoreClock(); }
    assert.equal(n, 4);
    assert.equal(res.status, 429);
    assert.equal(res.retries, 3);
    assert.deepEqual(res.rateLimit, { limit: 50, remaining: 0 });
  });

  test('gives up at once when Retry-After is longer than 30s', async () => {
    fakeSleep();
    let n = 0;
    handler = (req, res) => { n += 1; res.writeHead(429, { 'retry-after': '120' }); res.end(); };
    const res = await api.request('GET', '/x', { apiKey: 'k' });
    restoreClock();
    assert.equal(n, 1);
    assert.equal(res.retryAfterMs, 120000);
  });

  test('times out with a clear message', async () => {
    process.env.MAYAR_TIMEOUT_MS = '50';
    handler = () => { /* never answer */ };
    try {
      await assert.rejects(api.request('GET', '/slow', { apiKey: 'k' }),
        /Request timed out after 0s: GET \/slow\. .*MAYAR_TIMEOUT_MS/);
    } finally { delete process.env.MAYAR_TIMEOUT_MS; }
  });

  test('throttles back-to-back requests', async () => {
    const waits = [];
    let t = 1_000_000;
    api.clock.now = () => t;
    api.clock.sleep = async (ms) => { waits.push(ms); t += ms; };
    handler = (req, res) => { res.writeHead(200); res.end('{}'); };
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

  test('parseRetryAfter reads seconds and HTTP dates', () => {
    assert.equal(api.parseRetryAfter('3'), 3000);
    assert.equal(api.parseRetryAfter(''), null);
    assert.equal(api.parseRetryAfter('soon'), null);
    const inTen = new Date(Date.now() + 10_000).toUTCString();
    const ms = api.parseRetryAfter(inTen);
    assert.ok(ms > 8000 && ms <= 10_000, String(ms));
  });
});

describe('safe output', () => {
  test('table strips escape sequences from cells', () => {
    const cap = captureOutput();
    try { ui.table([{ name: '\x1b[2J\x1b]0;pwn\x07Budi' }], ['name']); } finally { cap.restore(); }
    assert.doesNotMatch(cap.stdout, /\x1b\[2J|\x1b\]0/);
    assert.match(cap.stdout, /Budi/);
  });
  test('jsonOut escapes C1 controls and stays valid JSON', () => {
    const cap = captureOutput();
    try { ui.jsonOut({ n: 'a\x9b2Jb' }); } finally { cap.restore(); }
    assert.doesNotMatch(cap.stdout, /\x9b/);
    assert.deepEqual(JSON.parse(cap.stdout), { n: 'a\x9b2Jb' });
  });
});

describe('confirmPlainText', () => {
  const body = { name: '<script>x</script>' };
  test('passes plain text without asking', async () => {
    let asked = false;
    await confirmPlainText({ name: 'Budi' }, ['name'], { isTTY: true, ask: async () => { asked = true; } });
    assert.equal(asked, false);
  });
  test('refuses HTML-like text without a TTY', async () => {
    await assert.rejects(confirmPlainText(body, ['name'], { isTTY: false }), /HTML-like content in name.*Nothing was sent/);
  });
  test('asks in a TTY: yes sends, no cancels', async () => {
    const cap = captureOutput();
    try {
      await confirmPlainText(body, ['name'], { isTTY: true, ask: async () => 'y' });
      await assert.rejects(confirmPlainText(body, ['name'], { isTTY: true, ask: async () => '' }), /Cancelled\. Nothing was sent/);
    } finally { cap.restore(); }
    assert.match(cap.stderr, /Warning: HTML-like content in name/);
  });
});

describe('commands refuse unsafe input before any request', () => {
  async function runWithStub(mod, positional, flags = {}) {
    const calls = [];
    const orig = api.request;
    api.request = async (...a) => { calls.push(a); return { status: 200, body: {} }; };
    const cap = captureOutput();
    try {
      await require(mod).run({ apiKey: 'k', flags, positional });
    } finally { api.request = orig; cap.restore(); }
    return calls;
  }

  for (const sub of ['register', 'test']) {
    test(`webhook ${sub} refuses a loopback URL`, async () => {
      const orig = api.request;
      let called = false;
      api.request = async () => { called = true; return { status: 200, body: {} }; };
      try {
        await assert.rejects(require('../src/commands/webhook').run({ apiKey: 'k', flags: {}, positional: [sub, 'http://127.0.0.1:8080/hook'] }),
          /Refused webhook URL .*loopback address.*Nothing was sent/);
      } finally { api.request = orig; }
      assert.equal(called, false);
    });
  }

  test('webhook register sends a public IP URL', async () => {
    const calls = await runWithStub('../src/commands/webhook', ['register', 'https://93.184.216.34/hook']);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][2].body, { urlHook: 'https://93.184.216.34/hook' });
  });

  test('invoice create refuses HTML in an item description without a TTY', async () => {
    const orig = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      await assert.rejects(
        runWithStub('../src/commands/invoice', ['create'], { data: '{"name":"Budi","items":[{"description":"<img src=x onerror=1>"}]}' }),
        /HTML-like content in items\.0\.description/,
      );
    } finally { process.stdin.isTTY = orig; }
  });
});
