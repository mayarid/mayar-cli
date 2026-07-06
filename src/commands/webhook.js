const api = require('../api');
const ui = require('../ui');
const { checkResp, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar webhook <register|test|history|new-history|retry>';

function fmtDate(v) {
  if (v == null) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  return String(v);
}

function renderHistory(body) {
  const data = (body && body.data) || [];
  const rows = data.map((w) => ({
    id: w.id, type: w.type, status: w.status,
    urlDestination: w.urlDestination || '',
    createdAt: fmtDate(w.createdAt),
  }));
  ui.table(rows, ['id', 'type', 'status', 'urlDestination', 'createdAt']);
  cursorFooter(body, data.length);
}

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'register': {
      if (!rest[0]) throw new Error('Usage: mayar webhook register <url>');
      // v2: register is now POST /webhooks/update
      const res = await api.request('POST', '/hl/v2/webhooks/update', {
        apiKey, body: { urlHook: rest[0] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'test': {
      if (!rest[0]) throw new Error('Usage: mayar webhook test <url>');
      const res = await api.request('POST', '/hl/v2/webhooks/test', {
        apiKey, body: { urlHook: rest[0] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'history': {
      const res = await api.request('GET', '/hl/v2/webhooks/history', {
        apiKey,
        query: pagination(flags, {
          status: flags.status, type: flags.type,
          urlDestination: flags.urlDestination,
          startAt: flags.startAt, endAt: flags.endAt,
        }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderHistory(res.body); return;
    }
    case 'new-history':
    case 'newhistory': {
      const res = await api.request('GET', '/hl/v2/webhooks/new-history', {
        apiKey, query: pagination(flags),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      renderHistory(res.body); return;
    }
    case 'retry': {
      if (!rest[0]) throw new Error('Usage: mayar webhook retry <historyId>');
      const res = await api.request('POST', '/hl/v2/webhooks/retry', {
        apiKey, body: { webhookHistoryId: rest[0] },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
