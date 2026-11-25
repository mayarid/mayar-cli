// Guards: input checks that run before a request is sent. When a guard
// refuses, nothing is sent to Mayar (see GLOSSARY.md and
// docs/adr/0001-thin-client-with-few-guards.md). Only checks that are certain
// live here; limits that depend on Mayar's rules wait for a sandbox check.

const MONEY_KEYS = new Set(['amount', 'price', 'rate']);
const DATE_KEYS = new Set(['expiredAt']);
const MAX_LIMIT = 50;

class GuardError extends Error {
  constructor(message) {
    super(`${message} Nothing was sent to Mayar.`);
    this.name = 'GuardError';
  }
}

function isWholePositive(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

// Epoch numbers below 1e12 are seconds, above are milliseconds.
function toTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v.trim()) {
    if (/^\d+$/.test(v.trim())) return toTime(Number(v));
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

// Walk a --data body. Refuse money fields that are not whole positive numbers
// and expiry dates in the past. `now` is injectable for tests.
function checkData(body, { now = Date.now() } = {}) {
  const walk = (node, trail) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, [...trail, String(i)])); return; }
    if (node === null || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      const at = [...trail, k].join('.');
      if (MONEY_KEYS.has(k) && v !== null && v !== undefined && typeof v !== 'object') {
        if (!isWholePositive(v)) {
          throw new GuardError(`${at} must be a whole number above 0 (Rupiah has no decimals), got ${JSON.stringify(v)}.`);
        }
      } else if (DATE_KEYS.has(k) && v !== null && v !== undefined && v !== '') {
        const t = toTime(v);
        if (t !== null && t <= now) {
          throw new GuardError(`${at} is in the past (${new Date(t).toISOString()}). Use a future date.`);
        }
      } else {
        walk(v, [...trail, k]);
      }
    }
  };
  walk(body, []);
  return body;
}

// --limit must be a whole number from 1 to 50 (the Mayar v2 page size).
function checkLimit(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!/^\d+$/.test(String(value).trim()) || n < 1 || n > MAX_LIMIT) {
    throw new GuardError(`--limit must be a whole number from 1 to ${MAX_LIMIT}, got ${JSON.stringify(value)}.`);
  }
  return n;
}

// A positional amount (for example `mayar qrcode 10000`).
function checkAmount(value, label = 'amount') {
  if (!isWholePositive(value)) {
    throw new GuardError(`${label} must be a whole number above 0 (Rupiah has no decimals), got ${JSON.stringify(value)}.`);
  }
  return Number(value);
}

module.exports = { checkData, checkLimit, checkAmount, GuardError, MAX_LIMIT };
