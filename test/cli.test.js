// Tests for parseFlags exported from src/cli.js.
// Built-in node:test + node:assert/strict only — parseFlags is pure (no I/O,
// no process.exit), so every case is a direct call + deepEqual on the result.
//
// Tests assert the ACTUAL parseFlags behaviour rather than the generic flag
// taxonomy in the task description: the only short flags are the booleans
// -h/-v, and unknown short tokens (e.g. -f) fall through to positionals — both
// are covered explicitly below.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { parseFlags } = require('../src/cli');
const membership = require('../src/commands/membership');

describe('parseFlags — long flags with a value (--flag value)', () => {
  test('--api-key consumes the following argument', () => {
    assert.deepEqual(parseFlags(['--api-key', 'secret123']), {
      flags: { apiKey: 'secret123' },
      positional: [],
    });
  });

  test('--page and --pageSize keep values as strings', () => {
    assert.deepEqual(parseFlags(['--page', '2', '--pageSize', '50']), {
      flags: { page: '2', pageSize: '50' },
      positional: [],
    });
  });

  test('--page-size is an alias for --pageSize', () => {
    assert.deepEqual(parseFlags(['--page-size', '25']), {
      flags: { pageSize: '25' },
      positional: [],
    });
  });

  test('--data consumes the following argument', () => {
    assert.deepEqual(parseFlags(['--data', '{"a":1}']), {
      flags: { data: '{"a":1}' },
      positional: [],
    });
  });

  test('an unknown long flag consumes the next token as its value', () => {
    assert.deepEqual(parseFlags(['--custom', 'val']), {
      flags: { custom: 'val' },
      positional: [],
    });
  });

  test('a long flag at the end with no value yields undefined', () => {
    assert.deepEqual(parseFlags(['--api-key']), {
      flags: { apiKey: undefined },
      positional: [],
    });
  });
});

describe('parseFlags — --key=value form', () => {
  test('--api-key=value uses the inline value', () => {
    assert.deepEqual(parseFlags(['--api-key=secret123']), {
      flags: { apiKey: 'secret123' },
      positional: [],
    });
  });

  test('an unknown --key=value sets flags[key] to value', () => {
    assert.deepEqual(parseFlags(['--name=alice']), {
      flags: { name: 'alice' },
      positional: [],
    });
  });

  test('value may itself contain = signs (only the first splits)', () => {
    assert.deepEqual(parseFlags(['--token=a=b=c']), {
      flags: { token: 'a=b=c' },
      positional: [],
    });
  });

  test('an empty inline value is preserved as an empty string', () => {
    assert.deepEqual(parseFlags(['--name=']), {
      flags: { name: '' },
      positional: [],
    });
  });
});

describe('parseFlags — boolean flags', () => {
  test('--json sets json to true', () => {
    assert.deepEqual(parseFlags(['--json']), {
      flags: { json: true },
      positional: [],
    });
  });

  test('--force sets force to true', () => {
    assert.deepEqual(parseFlags(['--force']), {
      flags: { force: true },
      positional: [],
    });
  });

  test('multiple boolean flags combine without consuming neighbours', () => {
    assert.deepEqual(parseFlags(['--json', '--force']), {
      flags: { json: true, force: true },
      positional: [],
    });
  });
});

describe('parseFlags — short flags', () => {
  test('-h and --help both set help to true', () => {
    assert.deepEqual(parseFlags(['-h']), { flags: { help: true }, positional: [] });
    assert.deepEqual(parseFlags(['--help']), { flags: { help: true }, positional: [] });
  });

  test('-v and --version both set version to true', () => {
    assert.deepEqual(parseFlags(['-v']), { flags: { version: true }, positional: [] });
    assert.deepEqual(parseFlags(['--version']), { flags: { version: true }, positional: [] });
  });

  test('an unrecognised short token falls through to positionals', () => {
    // There is no generic "-f value" handling: -f is not a known short flag and
    // does not start with "--", so both it and its "value" become positionals.
    assert.deepEqual(parseFlags(['-f', 'value']), {
      flags: {},
      positional: ['-f', 'value'],
    });
  });
});

describe('parseFlags — positional arguments', () => {
  test('bare tokens collect in order into positional', () => {
    assert.deepEqual(parseFlags(['invoice', 'get', 'abc123']), {
      flags: {},
      positional: ['invoice', 'get', 'abc123'],
    });
  });

  test('empty argv yields empty flags and positionals', () => {
    assert.deepEqual(parseFlags([]), { flags: {}, positional: [] });
  });

  test('"--" terminator pushes the remainder as positionals verbatim', () => {
    assert.deepEqual(parseFlags(['cmd', '--', '--json', '-h', 'tail']), {
      flags: {},
      positional: ['cmd', '--json', '-h', 'tail'],
    });
  });
});

describe('parseFlags — mixed-order combinations', () => {
  test('command, value flag, and boolean flag interleaved', () => {
    assert.deepEqual(parseFlags(['invoice', 'list', '--page', '2', '--json']), {
      flags: { page: '2', json: true },
      positional: ['invoice', 'list'],
    });
  });

  test('flags before, between, and after positionals', () => {
    assert.deepEqual(
      parseFlags(['--json', 'product', '--page', '3', 'search', '--force', 'shoes']),
      {
        flags: { json: true, page: '3', force: true },
        positional: ['product', 'search', 'shoes'],
      },
    );
  });

  test('mixes --key=value, --flag value, boolean, and positionals', () => {
    assert.deepEqual(
      parseFlags(['customer', '--api-key=k1', 'create', '--data', '{"x":1}', '--json']),
      {
        flags: { apiKey: 'k1', data: '{"x":1}', json: true },
        positional: ['customer', 'create'],
      },
    );
  });

  test('a later occurrence of a flag overwrites an earlier one', () => {
    assert.deepEqual(parseFlags(['--page', '1', '--page', '9']), {
      flags: { page: '9' },
      positional: [],
    });
  });
});

// ---------------------------------------------------------------------------
// membership product/tier sub-command routing.
//
// The new `membership product <create|get>` and `membership tier <create|get>`
// sub-namespaces validate their inputs BEFORE any api.request call — every case
// below throws synchronously on a missing --data body, missing positional id,
// missing --productId, or an unknown sub-action. So these assertions never hit
// the network: run() rejects on the usage/error path first. We assert on the
// exact Error message. apiKey is a dummy — it is never read on these paths.
//
// run() is async, so a thrown Error surfaces as a rejected promise; the
// validator form of assert.rejects lets us pin the message exactly (the strings
// contain regex-special |()<> so an equality check beats a RegExp).

// Invoke membership.run() with the given positional/flags and assert it rejects
// with exactly `message`. Positional mirrors parseFlags output: for these
// sub-namespaces rest[0] is the action and rest[1] is the id.
async function rejectsWith(positional, flags, message) {
  await assert.rejects(
    membership.run({ apiKey: 'test-key', flags, positional }),
    (err) => {
      assert.equal(err.message, message);
      return true;
    },
  );
}

describe('membership product sub-command routing', () => {
  test('product create with no --data throws the required-data error', async () => {
    await rejectsWith(
      ['product', 'create'], {},
      'mayar membership product create requires --data <json|@file>',
    );
  });

  test('product get with no id throws the usage error', async () => {
    await rejectsWith(
      ['product', 'get'], {},
      'Usage: mayar membership product get <productId>',
    );
  });

  test('an unknown product sub-action throws the <create|get> usage error', async () => {
    await rejectsWith(
      ['product', 'frobnicate'], {},
      'Usage: mayar membership product <create|get>',
    );
  });
});

describe('membership tier sub-command routing', () => {
  test('tier create with no --data throws the required-data error', async () => {
    await rejectsWith(
      ['tier', 'create'], {},
      'mayar membership tier create requires --data <json|@file>',
    );
  });

  test('tier get with no id throws the usage error', async () => {
    await rejectsWith(
      ['tier', 'get'], {},
      'Usage: mayar membership tier get <tierId> --productId <id>',
    );
  });

  test('tier get with an id but no --productId throws the productId error', async () => {
    await rejectsWith(
      ['tier', 'get', 'tier-123'], {},
      'mayar membership tier get requires --productId <id>',
    );
  });

  test('an unknown tier sub-action throws the <create|get> usage error', async () => {
    await rejectsWith(
      ['tier', 'frobnicate'], {},
      'Usage: mayar membership tier <create|get>',
    );
  });
});

// ---------------------------------------------------------------------------
// membership product/tier happy-path dispatch.
//
// The routing tests above all throw before reaching the network, so the actual
// HTTP dispatch (method, path, body, query) each sub-command sends was
// untested. The four endpoint paths are a FIXED build contract (see the
// ENDPOINT CONTRACT comment in src/commands/membership.js) — a typo in a path
// or query key would ship silently. These tests close that gap by stubbing
// api.request on the shared module object (membership.js does
// `const api = require('../api')` and calls `api.request(...)` by property at
// call time, so replacing the property intercepts the dispatch — no network,
// no dependency injection). The stub records the call and returns a 2xx so
// checkResp passes; ui.jsonOut's stdout write is suppressed to keep the test
// output clean. The original request fn is restored in a finally per case.

const api = require('../src/api');

// Run membership.run() with api.request stubbed and stdout suppressed; resolve
// to the single recorded { method, pathname, opts } call. Restores both the
// original api.request and process.stdout.write even if run() throws.
async function dispatch(positional, flags) {
  const calls = [];
  const originalRequest = api.request;
  const originalWrite = process.stdout.write;
  api.request = (method, pathname, opts) => {
    calls.push({ method, pathname, opts });
    return { status: 200, body: { ok: true }, raw: '' };
  };
  process.stdout.write = () => true;
  try {
    await membership.run({ apiKey: 'test-key', flags, positional });
  } finally {
    api.request = originalRequest;
    process.stdout.write = originalWrite;
  }
  assert.equal(calls.length, 1, 'expected exactly one api.request call');
  return calls[0];
}

describe('membership product sub-command dispatch (happy path)', () => {
  test('product create POSTs the parsed --data body to the products/create endpoint', async () => {
    const payload = { name: 'Pro', description: 'd', membershipInfo: { showMembers: true, type: 'x' } };
    const { method, pathname, opts } = await dispatch(
      ['product', 'create'], { data: JSON.stringify(payload) },
    );
    assert.equal(method, 'POST');
    assert.equal(pathname, '/hl/v2/memberships/products/create');
    assert.deepEqual(opts.body, payload);
    assert.equal(opts.apiKey, 'test-key');
    assert.equal(opts.query, undefined);
  });

  test('product get GETs the detail endpoint with an encodeURIComponent-encoded id', async () => {
    const { method, pathname, opts } = await dispatch(['product', 'get', 'a b/c'], {});
    assert.equal(method, 'GET');
    assert.equal(pathname, '/hl/v2/memberships/products/a%20b%2Fc');
    assert.equal(opts.apiKey, 'test-key');
    // product get carries no query (productId scoping is tier-only).
    assert.equal(opts.query, undefined);
  });
});

describe('membership tier sub-command dispatch (happy path)', () => {
  test('tier create POSTs the parsed --data body to the tiers/create endpoint', async () => {
    const payload = { productId: 'p1', name: 'Gold', description: 'd', periods: [{ amount: 1000 }] };
    const { method, pathname, opts } = await dispatch(
      ['tier', 'create'], { data: JSON.stringify(payload) },
    );
    assert.equal(method, 'POST');
    assert.equal(pathname, '/hl/v2/memberships/tiers/create');
    assert.deepEqual(opts.body, payload);
    assert.equal(opts.apiKey, 'test-key');
    assert.equal(opts.query, undefined);
  });

  test('tier get GETs the encoded tier id with the productId query forwarded', async () => {
    const { method, pathname, opts } = await dispatch(
      ['tier', 'get', 't/1'], { productId: 'prod-9' },
    );
    assert.equal(method, 'GET');
    assert.equal(pathname, '/hl/v2/memberships/tiers/t%2F1');
    assert.equal(opts.apiKey, 'test-key');
    assert.deepEqual(opts.query, { productId: 'prod-9' });
  });
});
