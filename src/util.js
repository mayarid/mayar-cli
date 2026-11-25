const fs = require('fs');
const ui = require('./ui');
const config = require('./config');
const { findHtml } = require('./security');

// Pull the field-level part of an error response out of the envelope. Mayar
// puts the human summary in `messages`/`message` ("Validation Error") and the
// useful bit — which field failed — in one of these siblings.
function errorDetail(body, summary) {
  if (!body || typeof body !== 'object') return '';
  const detail = body.errors ?? body.error ?? body.details ?? body.validation ?? body.data;
  if (detail === undefined || detail === null) return '';
  if (typeof detail === 'string') return detail === summary ? '' : detail;
  try {
    const json = JSON.stringify(detail);
    return json === '{}' || json === '[]' ? '' : json;
  } catch (_) { return ''; }
}

const MAX_MESSAGE = 300;
const MAX_DETAIL = 500;

function cap(text, max) {
  const s = String(text);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function otherEndpoint(endpoint) {
  return endpoint === 'sandbox' ? 'production' : 'sandbox';
}

// Explain a 401: name the host and the identity the key claims, so a key for
// the other environment is easy to spot.
function hint401(req) {
  const web = config.webBaseUrl(req.endpoint);
  const who = req.keyIdentity;
  if (!who) {
    return 'The API key is invalid or expired. Check it with `mayar whoami`, ' +
      `or get a new key at ${web} → Integration → API Key.`;
  }
  const label = who.email || who.name || who.accountId || 'this account';
  const other = otherEndpoint(req.endpoint);
  let text = `${req.host} (${req.endpoint}) rejected the key for ${label}. ` +
    `If it is a ${other} key, run again with --${other}.`;
  if (who.expiresAt && Date.parse(who.expiresAt) < Date.now()) {
    text += ` The key expired at ${who.expiresAt}.`;
  } else {
    text += ' Otherwise the key was revoked; get a new one at ' + web + '.';
  }
  return text;
}

function hint429(res) {
  const parts = [`Gave up after ${res.retries || 0} retr${res.retries === 1 ? 'y' : 'ies'}.`];
  if (res.retryAfterMs) parts.push(`Try again in ${Math.ceil(res.retryAfterMs / 1000)}s.`);
  else parts.push('Wait a minute, then try again.');
  if (res.rateLimit) parts.push(`Rate limit: ${JSON.stringify(res.rateLimit)}.`);
  return parts.join(' ');
}

// Turn a failed reply into one error with this shape:
//   <METHOD> <path> failed (<status>) — <message>
//     <details, max 500 chars>
//     Hint: <what to do>
// MAYAR_DEBUG=1 adds the full raw body.
function checkResp(res) {
  if (res.status >= 200 && res.status < 300) {
    // Surface rate-limit headers in --json output, only when Mayar sends them.
    if (res.rateLimit && res.body && typeof res.body === 'object' && !Array.isArray(res.body)) {
      res.body._rateLimit = res.rateLimit;
    }
    return;
  }

  const req = res.request || null;
  const where = req ? `${req.method} ${req.path}` : 'API request';
  const isJson = res.body !== null && typeof res.body === 'object';
  const serverError = res.status >= 500;

  let msg = isJson ? (res.body.messages || res.body.message || '') : '';
  if (typeof msg !== 'string') msg = JSON.stringify(msg);
  if (!msg && typeof res.body === 'string' && res.body) {
    // An HTML error page or a stack trace: do not print it.
    msg = `unexpected non-JSON response (${Buffer.byteLength(res.raw || res.body)} bytes)`;
  }
  if (!msg && res.status === 429) msg = 'rate limited';
  if (!msg && serverError) msg = 'server error';

  const lines = [`${where} failed (${res.status})` + (msg ? ` — ${cap(msg, MAX_MESSAGE)}` : '')];

  // Field-level detail. A 5xx detail is often a stack trace, so keep it for
  // MAYAR_DEBUG only.
  if (!serverError) {
    const detail = errorDetail(isJson ? res.body : null, msg);
    if (detail) lines.push(`  ${cap(detail, MAX_DETAIL)}`);
  }

  if (res.status === 401 && req) lines.push(`  Hint: ${hint401(req)}`);
  else if (res.status === 429) lines.push(`  Hint: ${hint429(res)}`);
  else if (serverError) {
    lines.push('  Hint: This is an error on the Mayar side, not in your command. ' +
      'Try again later. If it keeps failing, run with MAYAR_DEBUG=1 and report the output to Mayar.');
  }

  if (process.env.MAYAR_DEBUG && res.raw) lines.push(`  Raw response: ${res.raw}`);

  const err = new Error(lines.join('\n'));
  err.status = res.status;
  err.body = res.body;
  throw err;
}

// Customer-facing text should be plain text. If any of `paths` in `body` looks
// like HTML, ask before sending (TTY), or refuse (no TTY, for example an agent
// or a script). Mayar stores the text as it is, and a page that shows it
// without escaping would run it.
async function confirmPlainText(body, paths, { isTTY = process.stdin.isTTY, ask = ui.ask } = {}) {
  const hits = findHtml(body, paths);
  if (!hits.length) return;
  const fields = hits.join(', ');
  if (!isTTY) {
    throw new Error(`HTML-like content in ${fields}. Customer-facing fields must be plain text. ` +
      'Nothing was sent. Remove the markup, or run the command in a terminal to confirm it.');
  }
  process.stderr.write(ui.yellow(`Warning: HTML-like content in ${fields}. ` +
    'Customer-facing fields should be plain text.') + '\n');
  const ans = await ask('Send anyway? [y/N] ');
  if (!/^y/i.test(String(ans).trim())) throw new Error('Cancelled. Nothing was sent.');
}

function readData(value) {
  if (!value) return undefined;
  if (value.startsWith('@')) {
    const content = fs.readFileSync(value.slice(1), 'utf8');
    return JSON.parse(content);
  }
  return JSON.parse(value);
}

// Build a v2 cursor pagination query from flags.
// v2 uses limit + startingAfter. --pageSize is accepted as an alias for --limit,
// --after is the short form of --starting-after.
function pagination(flags, extra) {
  const q = { ...(extra || {}) };
  const limit = flags.limit ?? flags.pageSize;
  const after = flags.after ?? flags.startingAfter ?? flags['starting-after'];
  if (limit !== undefined && limit !== '') q.limit = limit;
  if (after !== undefined && after !== '') q.startingAfter = after;
  return q;
}

// Print the cursor footer after a paginated list. Mayar v2 returns
// nextStartingAfter + hasMore on the response envelope.
function cursorFooter(body, count) {
  const m = body || {};
  const parts = [];
  if (typeof m.pageSize === 'number' || typeof m.limit === 'number') {
    parts.push(`limit ${m.pageSize ?? m.limit}`);
  }
  if (typeof count === 'number') parts.push(`showing ${count}`);
  if (m.nextStartingAfter) parts.push(`next: --after ${m.nextStartingAfter}`);
  if (m.hasMore === true) parts.push('hasMore');
  if (!parts.length) return;
  process.stdout.write(ui.dim(parts.join(' · ')) + '\n');
}

function maybeJson(flags, body, fallback) {
  if (flags.json) {
    ui.jsonOut(body);
    return true;
  }
  if (typeof fallback === 'function') {
    fallback();
    return true;
  }
  return false;
}

module.exports = { checkResp, readData, maybeJson, pagination, cursorFooter, confirmPlainText };
