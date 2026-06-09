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
