// Tests for src/config.js — load/save/clear round-trip + legacy migration.
// Built-in node:test + node:assert/strict only. Mock-free.
//
// CRITICAL: src/config.js computes its paths at module load:
//   - the XDG path from XDG_CONFIG_HOME (line 5)
//   - the legacy path from os.homedir() i.e. $HOME (line 9)
// So both env vars MUST be set to temp dirs BEFORE require('../src/config'),
// otherwise the suite could read or clobber the developer's real config and
// the migration test could touch the real ~/.mayar. We set XDG_CONFIG_HOME via
// the shared tempConfigHome() helper and HOME via a second temp dir here.

const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { tempConfigHome } = require('./helpers');

// --- env isolation, BEFORE the config require -------------------------------
const xdg = tempConfigHome(); // sets process.env.XDG_CONFIG_HOME → temp dir

// Isolate HOME too so the legacy (~/.mayar) path resolves inside a temp dir.
const hadHome = Object.prototype.hasOwnProperty.call(process.env, 'HOME');
const prevHome = process.env.HOME;
const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mayar-home-'));
process.env.HOME = homeDir;

const config = require('../src/config'); // paths frozen now — env is in place

const legacyDir = path.join(homeDir, '.mayar');
const legacyFile = path.join(legacyDir, 'config.json');

// Reset all on-disk state to a clean slate between tests.
function wipe() {
  try { fs.rmSync(config.file, { force: true }); } catch (_) {}
  try { fs.rmSync(legacyDir, { recursive: true, force: true }); } catch (_) {}
}

beforeEach(wipe);

after(() => {
  wipe();
  xdg.cleanup(); // restores XDG_CONFIG_HOME + removes its temp dir
  if (hadHome) process.env.HOME = prevHome;
  else delete process.env.HOME;
  try { fs.rmSync(homeDir, { recursive: true, force: true }); } catch (_) {}
});

describe('config paths', () => {
  test('resolve inside the temp XDG dir, not the real home', () => {
    assert.ok(config.file.startsWith(xdg.dir), `${config.file} not under ${xdg.dir}`);
    assert.ok(config.dir.startsWith(xdg.dir));
    assert.equal(path.basename(config.file), 'config.json');
    assert.equal(path.basename(config.dir), 'mayar');
  });
});

describe('load / save / clear round-trip', () => {
  test('load() returns null when nothing has been saved', () => {
    assert.equal(config.load(), null);
  });

  test('save() then load() returns the same data', () => {
    const data = { apiKey: 'secret-123', baseUrl: 'https://api.example.test' };
    config.save(data);
    assert.deepEqual(config.load(), data);
  });

  test('save() persists a file on disk at config.file', () => {
    assert.equal(fs.existsSync(config.file), false);
    config.save({ token: 'abc' });
    assert.equal(fs.existsSync(config.file), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(config.file, 'utf8')), { token: 'abc' });
  });

  test('save() overwrites previously saved data', () => {
    config.save({ apiKey: 'first' });
    config.save({ apiKey: 'second', extra: true });
    assert.deepEqual(config.load(), { apiKey: 'second', extra: true });
  });

  test('save() writes pretty-printed JSON (2-space indent)', () => {
    config.save({ a: 1 });
    assert.equal(fs.readFileSync(config.file, 'utf8'), JSON.stringify({ a: 1 }, null, 2));
  });

  test('clear() removes the saved config and returns true', () => {
    config.save({ apiKey: 'wipe-me' });
    assert.equal(config.clear(), true);
    assert.equal(fs.existsSync(config.file), false);
    assert.equal(config.load(), null);
  });

  test('clear() returns false when there is no config to remove', () => {
    assert.equal(fs.existsSync(config.file), false);
    assert.equal(config.clear(), false);
  });

  test('load() returns null when the config file is malformed JSON', () => {
    fs.mkdirSync(config.dir, { recursive: true });
    fs.writeFileSync(config.file, '{ not valid json ');
    assert.equal(config.load(), null);
  });
});

describe('legacy migration (~/.mayar/config.json → XDG)', () => {
  function writeLegacy(data) {
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(legacyFile, JSON.stringify(data));
  }

  test('load() migrates legacy config to the XDG location and returns it', () => {
    const data = { apiKey: 'legacy-key', from: 'old-home' };
    writeLegacy(data);
    assert.equal(fs.existsSync(config.file), false);

    assert.deepEqual(config.load(), data);

    // Migrated: new file exists, legacy file (and dir) removed.
    assert.equal(fs.existsSync(config.file), true);
    assert.equal(fs.existsSync(legacyFile), false);
    assert.equal(fs.existsSync(legacyDir), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(config.file, 'utf8')), data);
  });

  test('an existing XDG config takes precedence over legacy (no migration)', () => {
    config.save({ apiKey: 'current' });
    writeLegacy({ apiKey: 'legacy' });

    assert.deepEqual(config.load(), { apiKey: 'current' });
    // Legacy left untouched because the XDG file already existed.
    assert.equal(fs.existsSync(legacyFile), true);
  });

  test('load() returns null when neither XDG nor legacy config exists', () => {
    assert.equal(fs.existsSync(config.file), false);
    assert.equal(fs.existsSync(legacyFile), false);
    assert.equal(config.load(), null);
  });
});
