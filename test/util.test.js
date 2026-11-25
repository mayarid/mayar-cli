// Tests for src/util.js — readData, maybeJson, confirmPlainText.
// Response checking is tested in test/response.test.js.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readData, maybeJson, confirmPlainText } = require('../src/util');
const { captureOutput } = require('./helpers');

describe('readData', () => {
  test('returns undefined for falsy input', () => {
    assert.equal(readData(undefined), undefined);
    assert.equal(readData(''), undefined);
    assert.equal(readData(null), undefined);
  });

  test('parses an inline JSON object string', () => {
    assert.deepEqual(readData('{"a":1,"b":"two"}'), { a: 1, b: 'two' });
  });

  test('parses inline JSON arrays and primitives', () => {
    assert.deepEqual(readData('[1,2,3]'), [1, 2, 3]);
    assert.equal(readData('42'), 42);
    assert.equal(readData('true'), true);
  });

  test('reads and parses JSON from an @file reference', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readdata-test-'));
    const file = path.join(dir, 'payload.json');
    fs.writeFileSync(file, '{"from":"file","n":7}');
    try {
      assert.deepEqual(readData('@' + file), { from: 'file', n: 7 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('throws on malformed inline JSON', () => {
    assert.throws(() => readData('{not json}'), /Invalid JSON in --data: .*Pass inline JSON in single quotes/);
  });

  test('throws when an @file reference points at a missing file', () => {
    const missing = path.join(os.tmpdir(), 'readdata-does-not-exist-12345.json');
    assert.throws(() => readData('@' + missing), /Cannot read --data file .*: ENOENT\./);
  });

  test('runs the guards on the parsed body', () => {
    assert.throws(() => readData('{"amount":10.5}'), /amount must be a whole number above 0.*Nothing was sent/);
    assert.throws(() => readData('{"expiredAt":"2001-01-01T00:00:00Z"}'), /expiredAt is in the past/);
  });
});

describe('maybeJson', () => {
  test('when flags.json is set: writes JSON to stdout and returns true', () => {
    const body = { hello: 'world' };
    const cap = captureOutput();
    let result;
    try {
      result = maybeJson({ json: true }, body, () => {
        throw new Error('fallback must not run when json flag is set');
      });
    } finally {
      cap.restore();
    }
    assert.equal(result, true);
    assert.equal(cap.stdout, JSON.stringify(body, null, 2) + '\n');
  });

  test('when not json and fallback is a function: calls it and returns true', () => {
    let called = 0;
    const result = maybeJson({ json: false }, { ignored: true }, () => {
      called += 1;
    });
    assert.equal(called, 1);
    assert.equal(result, true);
  });

  test('when not json and no fallback: returns false and writes nothing', () => {
    const cap = captureOutput();
    let result;
    try {
      result = maybeJson({}, { some: 'body' }, undefined);
    } finally {
      cap.restore();
    }
    assert.equal(result, false);
    assert.equal(cap.stdout, '');
  });

  test('non-function fallback is ignored, returning false', () => {
    assert.equal(maybeJson({ json: false }, {}, 'not-a-function'), false);
  });
});

describe('confirmPlainText', () => {
  const body = { name: '<script>x</script>' };
  test('passes plain text without asking', async () => {
    let asked = false;
    await confirmPlainText({ name: 'Budi' }, ['name'], { isTTY: true, ask: async () => { asked = true; } });
    assert.equal(asked, false);
  });
  test('refuses HTML-like text without a TTY', async () => {
    await assert.rejects(confirmPlainText(body, ['name'], { isTTY: false }), /HTML-like content in name.*Nothing was sent/);
  });
  test('asks in a TTY: yes sends, no cancels', async () => {
    const cap = captureOutput();
    try {
      await confirmPlainText(body, ['name'], { isTTY: true, ask: async () => 'y' });
      await assert.rejects(confirmPlainText(body, ['name'], { isTTY: true, ask: async () => '' }), /Cancelled\. Nothing was sent/);
    } finally { cap.restore(); }
    assert.match(cap.stderr, /Warning: HTML-like content in name/);
  });
});
