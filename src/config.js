const fs = require('fs');
const path = require('path');
const os = require('os');

const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const dir = path.join(xdgConfigHome, 'mayar');
const file = path.join(dir, 'config.json');

const legacyDir = path.join(os.homedir(), '.mayar');
const legacyFile = path.join(legacyDir, 'config.json');

function migrateLegacy() {
  if (fs.existsSync(file)) return;
  if (!fs.existsSync(legacyFile)) return;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(legacyFile, file);
    try { fs.chmodSync(file, 0o600); } catch (_) {}
    fs.unlinkSync(legacyFile);
    try { fs.rmdirSync(legacyDir); } catch (_) {}
  } catch (_) {}
}

function load() {
  migrateLegacy();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function save(data) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  try { fs.chmodSync(file, 0o600); } catch (_) {}
}

function clear() {
  try { fs.unlinkSync(file); return true; } catch (_) { return false; }
}

// Environment resolution -----------------------------------------------------
// Priority chain for endpoint resolution:
//   1. Runtime override (setRuntimeEndpoint) — from --sandbox/--production flags
//   2. NODE_ENV=development → sandbox
//   3. Stored endpoint in config.json (defaults to 'production')
//
// Explicit env vars (MAYAR_API_URL / MAYAR_AUTH_URL) always take precedence
// over the resolved endpoint for their respective base URLs.

let _runtimeEndpoint = null;

function setRuntimeEndpoint(ep) {
  if (ep !== null && ep !== 'sandbox' && ep !== 'production') {
    throw new Error(`Invalid endpoint: ${ep}. Must be 'sandbox', 'production', or null.`);
  }
  _runtimeEndpoint = ep;
}

function resolveEndpoint() {
  if (_runtimeEndpoint !== null) return _runtimeEndpoint;
  if (process.env.NODE_ENV === 'development') return 'sandbox';
  const cfg = load();
  return cfg?.endpoint || 'production';
}

function isDev() {
  return resolveEndpoint() === 'sandbox';
}

// Hosts per environment. The sandbox moved from *.mayar.club to *.mayar.io;
// the old domain answers but does not work. It is reachable only when
// MAYAR_SANDBOX_LEGACY=1 is set, and then a warning is printed.
const HOSTS = {
  production: { api: 'https://api.mayar.id', auth: 'https://auth.mayar.id', web: 'https://web.mayar.id' },
  sandbox: { api: 'https://api.mayar.io', auth: 'https://auth.mayar.io', web: 'https://web.mayar.io' },
  legacySandbox: { api: 'https://api.mayar.club', auth: 'https://auth.mayar.club', web: 'https://web.mayar.club' },
};

let legacyWarned = false;
function warnLegacy(url) {
  if (legacyWarned) return;
  legacyWarned = true;
  process.stderr.write(`Warning: ${url} is the old Mayar sandbox domain and is deprecated. ` +
    'Use the sandbox at api.mayar.io (default for --sandbox).\n');
}

function hostsFor(endpoint) {
  if (endpoint !== 'sandbox') return HOSTS.production;
  return process.env.MAYAR_SANDBOX_LEGACY === '1' ? HOSTS.legacySandbox : HOSTS.sandbox;
}

function pick(override, kind) {
  const url = override || hostsFor(resolveEndpoint())[kind];
  let host = '';
  try { host = new URL(url).hostname; } catch (_) { /* invalid override: let the request fail */ }
  if (/(^|\.)mayar\.club$/i.test(host)) warnLegacy(url);
  return url;
}

function apiBaseUrl() { return pick(process.env.MAYAR_API_URL, 'api'); }
function authBaseUrl() { return pick(process.env.MAYAR_AUTH_URL, 'auth'); }

// Dashboard URL (where users get API keys) for an endpoint name.
function webBaseUrl(endpoint = resolveEndpoint()) { return hostsFor(endpoint).web; }

function _resetLegacyWarning() { legacyWarned = false; }

module.exports = {
  load, save, clear, file, dir, isDev,
  apiBaseUrl, authBaseUrl, webBaseUrl,
  setRuntimeEndpoint, resolveEndpoint,
  _resetLegacyWarning,
};
