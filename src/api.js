const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('./config');
const { identity } = require('./jwt');

const VERSION = require('../package.json').version;

// Transport limits. Conservative on purpose: one CLI run seldom sends more
// than a few requests, so these only matter for loops and scripts.
const MIN_GAP_MS = 250;            // at most 4 requests per second per process
const MAX_RETRIES = 3;             // retries after a 429, then give up
const BACKOFF_BASE_MS = 1000;      // 1s, 2s, 4s (+ jitter)
const MAX_WAIT_MS = 30_000;        // never wait longer than this for one retry
const DEFAULT_TIMEOUT_MS = 30_000; // whole request, override with MAYAR_TIMEOUT_MS

// Replaceable in tests.
const clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: () => Math.random(),
};

let lastRequestAt = 0;

function timeoutMs() {
  const v = Number(process.env.MAYAR_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TIMEOUT_MS;
}

async function throttle() {
  const wait = lastRequestAt + MIN_GAP_MS - clock.now();
  if (wait > 0) await clock.sleep(wait);
  lastRequestAt = clock.now();
}

// Retry-After is either seconds or an HTTP date. Return milliseconds, or null.
function parseRetryAfter(value) {
  if (value === undefined || value === null || value === '') return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, at - clock.now());
  return null;
}

// Pick out X-RateLimit-* headers. Return null when the server sends none, so
// nothing is invented.
function rateLimitFrom(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const m = /^x-ratelimit-(.+)$/i.exec(k);
    if (!m) continue;
    const n = Number(v);
    out[m[1].toLowerCase()] = Number.isFinite(n) ? n : v;
  }
  return Object.keys(out).length ? out : null;
}

function sendOnce(method, url, headers, data) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'http:' ? http : https;
    const req = mod.request({
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: text });
      });
      res.on('error', reject);
    });
    const ms = timeoutMs();
    req.setTimeout(ms, () => {
      const err = new Error(`Request timed out after ${Math.round(ms / 1000)}s: ${method} ${url.pathname}. ` +
        'Mayar did not answer. Try again, or set MAYAR_TIMEOUT_MS to wait longer.');
      err.code = 'ETIMEDOUT';
      req.destroy(err);
    });
    req.on('error', (err) => {
      if (err.code === 'ETIMEDOUT') return reject(err);
      const e = new Error(`Network error on ${method} ${url.pathname} (${url.host}): ${err.code || err.message}`);
      e.code = err.code;
      e.cause = err;
      reject(e);
    });
    if (data) req.write(data);
    req.end();
  });
}

async function request(method, pathname, { apiKey, body, query } = {}) {
  const base = config.apiBaseUrl();
  const url = new URL(base.replace(/\/+$/, '') + pathname);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'User-Agent': `mayar-cli/${VERSION}`,
  };
  if (data) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = data.length;
  }

  let res;
  let retries = 0;
  for (;;) {
    await throttle();
    res = await sendOnce(method, url, headers, data);
    if (res.status !== 429 || retries >= MAX_RETRIES) break;

    const hinted = parseRetryAfter(res.headers['retry-after']);
    if (hinted !== null && hinted > MAX_WAIT_MS) break; // too long: give up now
    const backoff = BACKOFF_BASE_MS * 2 ** retries + Math.floor(clock.random() * 250);
    const wait = Math.min(MAX_WAIT_MS, hinted ?? backoff);
    retries += 1;
    process.stderr.write(`Rate limited by Mayar (429). Retry ${retries}/${MAX_RETRIES} in ${(wait / 1000).toFixed(1)}s…\n`);
    await clock.sleep(wait);
  }

  res.retries = retries;
  res.rateLimit = rateLimitFrom(res.headers);
  res.retryAfterMs = res.status === 429 ? parseRetryAfter(res.headers['retry-after']) : null;
  res.request = {
    method,
    path: url.pathname,
    host: url.host,
    endpoint: config.resolveEndpoint(),
    keyIdentity: identity(apiKey), // who the key claims to be; never the key itself
  };
  return res;
}

function resetThrottle() { lastRequestAt = 0; }

module.exports = {
  request,
  baseUrl: () => config.apiBaseUrl(),
  parseRetryAfter,
  rateLimitFrom,
  clock,
  resetThrottle,
  MAX_RETRIES,
};
