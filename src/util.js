const fs = require('fs');
const ui = require('./ui');

function checkResp(res) {
  if (res.status >= 200 && res.status < 300) return;
  const msg = (res.body && (res.body.messages || res.body.message)) || res.raw || '';
  const err = new Error(`API ${res.status} — ${msg}`);
  err.status = res.status;
  err.body = res.body;
  throw err;
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

module.exports = { checkResp, readData, maybeJson, pagination, cursorFooter };
