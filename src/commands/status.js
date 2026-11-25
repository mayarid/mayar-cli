const config = require('../config');
const ui = require('../ui');
const { identity } = require('../jwt');

function maskKey(key) {
  if (!key) return null;
  if (key.length <= 10) return '***';
  return key.slice(0, 6) + '…' + key.slice(-4);
}

async function run({ flags }) {
  const cfg = config.load() || {};
  const endpoint = config.resolveEndpoint();
  const apiBaseUrl = config.apiBaseUrl();
  const authBaseUrl = config.authBaseUrl();

  // Same credential order as every other command.
  const cred = config.resolveCredential(flags, cfg);
  const maskedApiKey = maskKey(cred && cred.value);
  const authSession = cfg.auth || null;

  // The login session knows the name and email; the key's JWT may add more.
  const who = identity(cred && cred.value) || {};
  const user = {
    name: authSession?.name || who.name || null,
    email: authSession?.email || who.email || null,
    accountId: who.accountId || null,
  };

  if (flags.json) {
    ui.jsonOut({
      environment: endpoint,
      apiBaseUrl,
      authBaseUrl,
      apiKey: maskedApiKey,
      hasApiKey: !!cred,
      credentialSource: cred ? cred.source : null,
      user,
      authSession: authSession
        ? {
            loggedIn: true,
            email: authSession.email || null,
            name: authSession.name || null,
            expiresAt: authSession.expiresAt || null,
          }
        : { loggedIn: false },
      configFile: config.file,
    });
    return;
  }

  process.stdout.write(ui.bold('Mayar CLI Status') + '\n\n');
  ui.fields([
    ['Environment', `${endpoint} (${apiBaseUrl})`],
    ['Auth Server', authBaseUrl],
    ['Credential', cred ? `${maskedApiKey} (${cred.source})` : '(not configured)'],
    ['User Name', user.name],
    ['User Email', user.email],
    ['Account ID', user.accountId],
    ['Token Expires', authSession && authSession.expiresAt],
    ['Config Path', config.file],
  ]);
}

module.exports = { run };
