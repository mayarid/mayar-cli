// Tests for src/util.js — checkResp, readData, maybeJson.
// Built-in node:test + node:assert/strict only. Mock-free and deterministic:
// readData's file branch uses a real temp file; maybeJson's stdout side effect
// is captured (not stubbed) via the shared captureOutput helper.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkResp, readData, maybeJson } = require('../src/util');
const { captureOutput } = require('./helpers');

describe('checkResp', () => {
  test('returns undefined for a 200 response (passes through)', () => {
    assert.equal(checkResp({ status: 200, body: { foo: 1 } }), undefined);
  });

  test('passes through across the whole 2xx range', () => {
    for (const status of [200, 201, 204, 299]) {
      assert.doesNotThrow(() => checkResp({ status, body: {} }));
    }
  });

  test('throws for status just below 200', () => {
    assert.throws(() => checkResp({ status: 199, body: {} }));
  });

  test('throws for status at 300 and above', () => {
    assert.throws(() => checkResp({ status: 300, body: {} }));
    assert.throws(() => checkResp({ status: 404, body: {} }));
    assert.throws(() => checkResp({ status: 500, body: {} }));
  });

  test('thrown error carries .status and .body', () => {
    const body = { message: 'Not found' };
    let thrown;
    try {
      checkResp({ status: 404, body });
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.equal(thrown.status, 404);
    assert.equal(thrown.body, body);
  });

  test('message prefers body.messages over body.message', () => {
    assert.throws(
      () => checkResp({ status: 400, body: { messages: 'first', message: 'second' } }),
      /API 400 — first/,
    );
  });

  test('message falls back to body.message when messages is absent', () => {
    assert.throws(
      () => checkResp({ status: 400, body: { message: 'bad request' } }),
      /API 400 — bad request/,
    );
  });

  test('message falls back to res.raw when body has no message fields', () => {
    assert.throws(
      () => checkResp({ status: 500, body: {}, raw: 'raw text' }),
      /API 500 — raw text/,
    );
  });

  test('message tolerates a missing body (empty message)', () => {
    let thrown;
    try {
      checkResp({ status: 500 });
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.equal(thrown.status, 500);
    assert.equal(thrown.body, undefined);
    assert.equal(thrown.message, 'API 500 — ');
  });
});

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
    assert.throws(() => readData('{not json}'), SyntaxError);
  });

  test('throws when an @file reference points at a missing file', () => {
    const missing = path.join(os.tmpdir(), 'readdata-does-not-exist-12345.json');
    assert.throws(() => readData('@' + missing));
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
