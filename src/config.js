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
// NODE_ENV=development targets the *.mayar.club sandbox; anything else targets
// production *.mayar.id. Explicit env overrides always win.
function isDev() {
  return process.env.NODE_ENV === 'development';
}

function apiBaseUrl() {
  if (process.env.MAYAR_API_URL) return process.env.MAYAR_API_URL;
  return isDev() ? 'https://api.mayar.club' : 'https://api.mayar.id';
}

function authBaseUrl() {
  if (process.env.MAYAR_AUTH_URL) return process.env.MAYAR_AUTH_URL;
  return isDev() ? 'https://auth.mayar.club' : 'https://auth.mayar.id';
}

module.exports = { load, save, clear, file, dir, isDev, apiBaseUrl, authBaseUrl };
