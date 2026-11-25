// Command helpers: read --data, build pagination queries, print list footers,
// and check customer-facing text. Response checking lives in src/response.js.

const fs = require('fs');
const ui = require('./ui');
const { findHtml } = require('./security');
const { checkData, checkLimit } = require('./guards');

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
// v2 uses limit + startingAfter. --pageSize is an alias for --limit; the
// parser maps --starting-after and --startingAfter to flags.after.
function pagination(flags, extra) {
  const q = { ...(extra || {}) };
  const limit = checkLimit(flags.limit ?? flags.pageSize);
  const after = flags.after;
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

module.exports = { readData, maybeJson, pagination, cursorFooter, confirmPlainText };
