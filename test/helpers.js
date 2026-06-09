// Reusable test utilities for the node:test suite.
// Zero dependencies — built-in node: modules only.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// (1) stdout/stderr capture.
// Monkey-patches process.stdout.write, process.stderr.write, console.log and
// console.error so anything written during the test is collected instead of
// printed. Returns an object whose .stdout / .stderr getters expose the
// captured text, plus a .restore() that puts the originals back.
//
//   const cap = captureOutput();
//   console.log('hi');
//   cap.restore();
//   assert.equal(cap.stdout, 'hi\n');
function captureOutput() {
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origLog = console.log;
  const origError = console.error;

  let out = '';
  let err = '';
  let restored = false;

  process.stdout.write = (chunk, encoding, cb) => {
    out += typeof chunk === 'string' ? chunk : chunk.toString(encoding || 'utf8');
    if (typeof encoding === 'function') encoding();
    else if (typeof cb === 'function') cb();
    return true;
  };
  process.stderr.write = (chunk, encoding, cb) => {
    err += typeof chunk === 'string' ? chunk : chunk.toString(encoding || 'utf8');
    if (typeof encoding === 'function') encoding();
    else if (typeof cb === 'function') cb();
    return true;
  };
  // Route console.* through the patched writers so formatting matches Node's.
  console.log = (...args) => process.stdout.write(formatLog(args) + '\n');
  console.error = (...args) => process.stderr.write(formatLog(args) + '\n');

  function restore() {
    if (restored) return;
    restored = true;
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    console.log = origLog;
    console.error = origError;
  }

  return {
    get stdout() { return out; },
    get stderr() { return err; },
    reset() { out = ''; err = ''; },
    restore,
  };
}

function formatLog(args) {
  return args
    .map((a) => (typeof a === 'string' ? a : require('node:util').inspect(a)))
    .join(' ');
}

// (2) temp XDG_CONFIG_HOME helper.
// Creates a unique temp directory and (by default) points XDG_CONFIG_HOME at it
// so config.js writes there instead of the developer's real home. Returns
// { dir, cleanup }. cleanup() restores the prior env value and removes the dir.
//
//   const tmp = tempConfigHome();   // sets process.env.XDG_CONFIG_HOME
//   // ... require('../src/config') AFTER this call ...
//   tmp.cleanup();
function tempConfigHome(opts = {}) {
  const { setEnv = true } = opts;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mayar-test-'));

  const hadEnv = Object.prototype.hasOwnProperty.call(process.env, 'XDG_CONFIG_HOME');
  const prevEnv = process.env.XDG_CONFIG_HOME;
  if (setEnv) process.env.XDG_CONFIG_HOME = dir;

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (setEnv) {
      if (hadEnv) process.env.XDG_CONFIG_HOME = prevEnv;
      else delete process.env.XDG_CONFIG_HOME;
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }

  return { dir, cleanup };
}

// (3) optional local HTTP server helper.
// Starts an http server on an ephemeral port. `handler` is the standard
// (req, res) listener; if omitted, a 200 "{}" responder is used. Returns a
// promise resolving to { url, port, server, close }. close() shuts it down.
//
//   const srv = await startServer((req, res) => { res.end('ok'); });
//   // fetch(srv.url) ...
//   await srv.close();
function startServer(handler) {
  const server = http.createServer(
    handler || ((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    })
  );

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Port 0 → OS assigns a free ephemeral port; 127.0.0.1 keeps it local.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}`;
      function close() {
        return new Promise((res) => server.close(() => res()));
      }
      resolve({ url, port, server, close });
    });
  });
}

module.exports = { captureOutput, tempConfigHome, startServer };
