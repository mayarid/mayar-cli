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

function apiBaseUrl() {
  if (process.env.MAYAR_API_URL) return process.env.MAYAR_API_URL;
  return resolveEndpoint() === 'sandbox' ? 'https://api.mayar.club' : 'https://api.mayar.id';
}

function authBaseUrl() {
  if (process.env.MAYAR_AUTH_URL) return process.env.MAYAR_AUTH_URL;
  return resolveEndpoint() === 'sandbox' ? 'https://auth.mayar.club' : 'https://auth.mayar.id';
}

module.exports = { load, save, clear, file, dir, isDev, apiBaseUrl, authBaseUrl, setRuntimeEndpoint, resolveEndpoint };
