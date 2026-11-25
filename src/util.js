const fs = require('fs');
const ui = require('./ui');
const config = require('./config');
const { findHtml } = require('./security');
const { checkData, checkLimit } = require('./guards');

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

// --- Rejected responses -----------------------------------------------------
// Mayar sometimes answers HTTP 2xx with a body that says the request failed
// (a "rejected response", see GLOSSARY.md). The rules follow mayar-mcp
// (src/utils/apiClient.ts), which found these shapes in sandbox QA.

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function mayarMessage(body) {
  if (!isRecord(body)) return undefined;
  const m = body.messages ?? body.message;
  return typeof m === 'string' && m.trim() ? m : undefined;
}

// statusCode 4xx/5xx inside a 2xx body.
function envelopeErrorStatus(body) {
  if (!isRecord(body)) return undefined;
  const code = Number(body.statusCode);
  return Number.isInteger(code) && code >= 400 && code <= 599 ? code : undefined;
}

const FAILURE_TEXT = /\b(required|invalid|must|not found|failed|error|forbidden|unauthori[sz]ed|tidak|wajib|gagal|belum)\b/i;
const FAILURE_LEAD = /^\s*(fail(ed|ure)?|gagal|error)\b/i;

// success:false or status:false; or, with no data, an error key or a failure
// message; or, with data, a message that opens with a failure word. So
// "success" or "Data not found" next to data stays a success.
function isFailureBody(body) {
  if (!isRecord(body)) return false;
  if (body.success === false || body.status === false) return true;
  if (body.data !== undefined && body.data !== null) {
    const m = mayarMessage(body);
    return m !== undefined && FAILURE_LEAD.test(m);
  }
  if ([body.error, body.errors].some((e) => e !== undefined && e !== null && e !== '' && e !== false)) return true;
  const m = mayarMessage(body);
  return m !== undefined && FAILURE_TEXT.test(m);
}

// True when a 2xx reply is really a failure.
function isRejected(res) {
  if (!(res.status >= 200 && res.status < 300)) return false;
  return envelopeErrorStatus(res.body) !== undefined || isFailureBody(res.body);
}

// Turn a failed reply into one error with this shape:
//   <METHOD> <path> failed (<status>) — <message>
//     <details, max 500 chars>
//     Hint: <what to do>
// A rejected response uses the same shape, with "Mayar rejected the request"
// as the message. MAYAR_DEBUG=1 adds the full raw body.
function checkResp(res) {
  const ok = res.status >= 200 && res.status < 300;
  if (ok && !isRejected(res)) {
    // Surface rate-limit headers in --json output, only when Mayar sends them.
    if (res.rateLimit && isRecord(res.body)) res.body._rateLimit = res.rateLimit;
    return;
  }
  const rejected = ok;
  const status = rejected ? (envelopeErrorStatus(res.body) ?? res.status) : res.status;

  const req = res.request || null;
  const where = req ? `${req.method} ${req.path}` : 'API request';
  const isJson = res.body !== null && typeof res.body === 'object';
  const serverError = status >= 500;

  let msg = isJson ? (res.body.messages || res.body.message || '') : '';
  if (typeof msg !== 'string') msg = JSON.stringify(msg);
  if (!msg && rejected && typeof res.body?.error === 'string') msg = res.body.error;
  if (!msg && typeof res.body === 'string' && res.body) {
    // An HTML error page or a stack trace: do not print it.
    msg = `unexpected non-JSON response (${Buffer.byteLength(res.raw || res.body)} bytes)`;
  }
  if (!msg && status === 429) msg = 'rate limited';
  if (!msg && serverError) msg = 'server error';
  const summary = msg;
  if (rejected) msg = 'Mayar rejected the request' + (msg ? `: ${msg}` : '');

  const lines = [`${where} failed (${status})` + (msg ? ` — ${cap(msg, MAX_MESSAGE)}` : '')];

  // Field-level detail. A 5xx detail is often a stack trace, so keep it for
  // MAYAR_DEBUG only.
  if (!serverError) {
    const detail = errorDetail(isJson ? res.body : null, summary);
    if (detail) lines.push(`  ${cap(detail, MAX_DETAIL)}`);
  }

  if (status === 401 && req) lines.push(`  Hint: ${hint401(req)}`);
  else if (status === 429) lines.push(`  Hint: ${hint429(res)}`);
  else if (serverError) {
    lines.push('  Hint: This is an error on the Mayar side, not in your command. ' +
      'Try again later. If it keeps failing, run with MAYAR_DEBUG=1 and report the output to Mayar.');
  }

  if (process.env.MAYAR_DEBUG && res.raw) lines.push(`  Raw response: ${res.raw}`);

  const err = new Error(lines.join('\n'));
  err.status = status;
  err.httpStatus = res.status;
  err.rejected = rejected;
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

const DATA_USAGE = 'Pass inline JSON in single quotes (--data \'{"name":"x"}\') or a file (--data @payload.json).';

// Parse --data (inline JSON or @file), then run the guards on it.
function readData(value) {
  if (!value) return undefined;
  let text = value;
  let source = '--data';
  if (value.startsWith('@')) {
    const file = value.slice(1);
    source = `--data file ${file}`;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`Cannot read ${source}: ${err.code || err.message}. ${DATA_USAGE}`);
    }
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in ${source}: ${err.message}. ${DATA_USAGE}`);
  }
  return checkData(body);
}

// Build a v2 cursor pagination query from flags.
// v2 uses limit + startingAfter. --pageSize is accepted as an alias for --limit,
// --after is the short form of --starting-after.
function pagination(flags, extra) {
  const q = { ...(extra || {}) };
  const limit = checkLimit(flags.limit ?? flags.pageSize);
  const after = flags.after ?? flags.startingAfter ?? flags['starting-after'];
  if (limit !== undefined) q.limit = limit;
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

module.exports = { checkResp, isRejected, readData, maybeJson, pagination, cursorFooter, confirmPlainText };
