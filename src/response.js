// Response checking: decide if a Mayar reply failed, and turn a failed reply
// into one ApiError. Pure functions; src/api.js calls them for every request,
// so no command can forget to check a reply.
//
// Error shape:
//   <METHOD> <path> failed (<status>) — <message>
//     <details, max 500 chars>
//     Hint: <what to do>
// A rejected response (HTTP 2xx with a failure body, see GLOSSARY.md) uses the
// same shape, with "Mayar rejected the request" as the message.

const MAX_MESSAGE = 300;
const MAX_DETAIL = 500;

class ApiError extends Error {
  constructor(message, { status, httpStatus, rejected, body }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;         // the status that counts (envelope statusCode for a rejected response)
    this.httpStatus = httpStatus; // the HTTP status line
    this.rejected = rejected;
    this.body = body;
  }
}

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function cap(text, max) {
  const s = String(text);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// --- Rejected responses -----------------------------------------------------
// The rules follow mayar-mcp (src/utils/apiClient.ts), which found these
// shapes in sandbox QA.

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

const is2xx = (status) => status >= 200 && status < 300;

// True when a 2xx reply is really a failure.
function isRejected(res) {
  return is2xx(res.status) && (envelopeErrorStatus(res.body) !== undefined || isFailureBody(res.body));
}

function isFailure(res) {
  return !is2xx(res.status) || isRejected(res);
}

// --- Error text -------------------------------------------------------------

// Pull the field-level part out of the envelope. Mayar puts the summary in
// `messages`/`message` and the useful bit (which field failed) in a sibling.
function errorDetail(body, summary) {
  if (!isRecord(body)) return '';
  const detail = body.errors ?? body.error ?? body.details ?? body.validation ?? body.data;
  if (detail === undefined || detail === null) return '';
  if (typeof detail === 'string') return detail === summary ? '' : detail;
  try {
    const json = JSON.stringify(detail);
    return json === '{}' || json === '[]' ? '' : json;
  } catch (_) { return ''; }
}

function summaryOf(res, status, rejected) {
  const body = res.body;
  let msg = isRecord(body) ? (body.messages || body.message || '') : '';
  if (typeof msg !== 'string') msg = JSON.stringify(msg);
  if (!msg && rejected && typeof body?.error === 'string') msg = body.error;
  if (!msg && typeof body === 'string' && body) {
    // An HTML error page or a stack trace: do not print it.
    msg = `unexpected non-JSON response (${Buffer.byteLength(res.raw || body)} bytes)`;
  }
  if (!msg && status === 429) msg = 'rate limited';
  if (!msg && status >= 500) msg = 'server error';
  return msg;
}

// Explain a 401: name the host and the identity the key claims, so a key for
// the other environment is easy to spot.
function hint401({ host, endpoint, webUrl, keyIdentity: who }) {
  if (!who) {
    return 'The API key is invalid or expired. Check it with `mayar whoami`, ' +
      `or get a new key at ${webUrl} → Integration → API Key.`;
  }
  const label = who.email || who.name || who.accountId || 'this account';
  const other = endpoint === 'sandbox' ? 'production' : 'sandbox';
  const head = `${host} (${endpoint}) rejected the key for ${label}. If it is a ${other} key, run again with --${other}.`;
  return who.expiresAt && Date.parse(who.expiresAt) < Date.now()
    ? `${head} The key expired at ${who.expiresAt}.`
    : `${head} Otherwise the key was revoked; get a new one at ${webUrl}.`;
}

function hint429({ retries = 0, retryAfterMs, rateLimit }) {
  return [
    `Gave up after ${retries} retr${retries === 1 ? 'y' : 'ies'}.`,
    retryAfterMs ? `Try again in ${Math.ceil(retryAfterMs / 1000)}s.` : 'Wait a minute, then try again.',
    rateLimit ? `Rate limit: ${JSON.stringify(rateLimit)}.` : null,
  ].filter(Boolean).join(' ');
}

const HINT_5XX = 'This is an error on the Mayar side, not in your command. ' +
  'Try again later. If it keeps failing, run with MAYAR_DEBUG=1 and report the output to Mayar.';

function hintFor(status, ctx) {
  if (status === 401 && ctx.host) return hint401(ctx);
  if (status === 429) return hint429(ctx);
  if (status >= 500) return ctx.hint5xx || HINT_5XX;
  return null;
}

// Build the ApiError for a failed reply. `ctx` describes the request:
//   { method, path, host, endpoint, webUrl, keyIdentity, retries,
//     retryAfterMs, rateLimit, hint5xx }
// All fields are optional; a missing method/path prints "API request".
function toError(res, ctx = {}) {
  const rejected = is2xx(res.status);
  const status = rejected ? (envelopeErrorStatus(res.body) ?? res.status) : res.status;
  const summary = summaryOf(res, status, rejected);
  const msg = rejected ? 'Mayar rejected the request' + (summary ? `: ${summary}` : '') : summary;
  const where = ctx.method ? `${ctx.method} ${ctx.path}` : 'API request';

  const lines = [`${where} failed (${status})` + (msg ? ` — ${cap(msg, MAX_MESSAGE)}` : '')];
  // A 5xx detail is often a stack trace, so keep it for MAYAR_DEBUG only.
  if (status < 500) {
    const detail = errorDetail(res.body, summary);
    if (detail) lines.push(`  ${cap(detail, MAX_DETAIL)}`);
  }
  const hint = hintFor(status, ctx);
  if (hint) lines.push(`  Hint: ${hint}`);
  if (process.env.MAYAR_DEBUG && res.raw) lines.push(`  Raw response: ${res.raw}`);

  return new ApiError(lines.join('\n'), { status, httpStatus: res.status, rejected, body: res.body });
}

module.exports = { ApiError, isRejected, isFailure, toError, isRecord };
