// Tests for src/ui.js — table() and the color wrapper functions.
// Built-in node:test + node:assert/strict only.
//
// ui.js freezes `isTTY = !!process.stdout.isTTY` at module-load time, so the
// behaviour under test is fixed the moment we require('../src/ui'). The
// node:test runner runs with a non-TTY stdout (process.stdout.isTTY is
// undefined), so the wrappers must emit PLAIN text with no ANSI escape codes.
// The color/layout tests skip themselves on the rare chance stdout IS a TTY so
// the suite stays green either way; the precondition is asserted explicitly.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const ui = require('../src/ui');
const { captureOutput } = require('./helpers');

// True in the normal `node --test` run; gates the non-TTY assertions.
const NON_TTY = !process.stdout.isTTY;
const skip = NON_TTY ? false : 'requires a non-TTY stdout';

// Matches the start of any ANSI/CSI escape sequence (e.g. \x1b[31m, \x1b[0m).
const ANSI = /\x1b\[/;

describe('non-TTY precondition', () => {
  test('the test runner exposes a non-TTY stdout', () => {
    assert.ok(NON_TTY, 'expected process.stdout.isTTY to be falsy under node --test');
  });
});

describe('color wrappers (non-TTY → plain passthrough)', () => {
  const wrappers = ['dim', 'bold', 'red', 'green', 'yellow', 'cyan', 'magenta'];

  for (const name of wrappers) {
    test(`${name}() returns its input verbatim with no ANSI codes`, { skip }, () => {
      const out = ui[name]('hello');
      assert.equal(out, 'hello');
      assert.ok(!ANSI.test(out), `${name}() must not emit ANSI escapes in non-TTY mode`);
    });
  }

  test('wrappers coerce non-string input via String()', { skip }, () => {
    assert.equal(ui.red(42), '42');
    assert.equal(ui.bold(true), 'true');
    assert.equal(ui.dim(null), 'null');
    assert.equal(ui.green(undefined), 'undefined');
  });

  test('every wrapper is exported as a function', () => {
    for (const name of wrappers) {
      assert.equal(typeof ui[name], 'function', `${name} should be a function`);
    }
  });
});

describe('table()', () => {
  test('prints "(no rows)" for empty input, with no ANSI codes', { skip }, () => {
    const cap = captureOutput();
    try {
      ui.table([], ['a', 'b']);
      ui.table(null, ['a']);
      ui.table(undefined, ['a']);
    } finally {
      cap.restore();
    }
    assert.equal(cap.stdout, '(no rows)\n(no rows)\n(no rows)\n');
    assert.ok(!ANSI.test(cap.stdout));
  });

  test('lays out header, separator and rows with correct column widths', { skip }, () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 5 },
    ];
    const cap = captureOutput();
    try {
      ui.table(rows, ['name', 'age']);
    } finally {
      cap.restore();
    }

    // width(name) = max('name'=4, 'Alice'=5, 'Bob'=3) = 5
    // width(age)  = max('age'=3, '30'=2, '5'=1)       = 3
    // columns are joined with a two-space gutter and padded with padEnd.
    const expected =
      'name   age\n' +   // 'name '(5) + '  ' + 'age'(3)
      '─────  ───\n' +   // dim('─'×5) + '  ' + dim('─'×3)
      'Alice  30 \n' +   // 'Alice'(5) + '  ' + '30 '(3)
      'Bob    5  \n';    // 'Bob  '(5) + '  ' + '5  '(3)
    assert.equal(cap.stdout, expected);
    assert.ok(!ANSI.test(cap.stdout), 'table output must contain no ANSI escapes');
  });

  test('header width grows to fit the column name when cells are shorter', { skip }, () => {
    const cap = captureOutput();
    try {
      ui.table([{ header: 'x' }], ['header']);
    } finally {
      cap.restore();
    }
    const lines = cap.stdout.split('\n');
    assert.equal(lines[0], 'header');        // width = len('header') = 6
    assert.equal(lines[1], '──────');        // separator matches width 6
    assert.equal(lines[2], 'x     ');        // 'x'.padEnd(6)
  });

  test('renders nullish cells as empty but preserves zero', { skip }, () => {
    const cap = captureOutput();
    try {
      ui.table([{ v: 0 }, { v: null }, { v: undefined }, {}], ['v']);
    } finally {
      cap.restore();
    }
    const lines = cap.stdout.split('\n');
    // width(v) = max('v'=1, '0'=1, ''=0) = 1
    assert.equal(lines[0], 'v');
    assert.equal(lines[1], '─');
    assert.equal(lines[2], '0');   // 0 is kept (?? only swaps null/undefined)
    assert.equal(lines[3], ' ');   // null   → '' padded to width 1
    assert.equal(lines[4], ' ');   // undefined → ''
    assert.equal(lines[5], ' ');   // missing key → ''
  });

  test('caps column width at 48 and truncates long values with an ellipsis', { skip }, () => {
    const longValue = 'x'.repeat(50);
    const cap = captureOutput();
    try {
      ui.table([{ c: longValue }], ['c']);
    } finally {
      cap.restore();
    }
    const lines = cap.stdout.split('\n');
    // width capped at 48; header 'c' padded to 48.
    assert.equal(lines[0].length, 48);
    assert.equal(lines[0], 'c'.padEnd(48));
    assert.equal(lines[1], '─'.repeat(48));
    // value truncated to 47 chars + '…' = 48 display chars.
    assert.equal(lines[2], 'x'.repeat(47) + '…');
    assert.equal(lines[2].length, 48);
    assert.ok(!ANSI.test(cap.stdout));
  });
});
