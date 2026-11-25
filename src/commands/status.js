const config = require('../config');
const ui = require('../ui');
const { decodeJwt } = require('../jwt');

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
  const apiKey = cred ? cred.value : null;
  const maskedApiKey = maskKey(apiKey);

  // Decode JWT if apiKey is a JWT
  const jwtPayload = decodeJwt(apiKey);

  // Auth session info from login
  const authSession = cfg.auth || null;

  // Extract user info
  const name =
    authSession?.name ||
    jwtPayload?.name ||
    jwtPayload?.merchantName ||
    jwtPayload?.fullName ||
    null;

  const email =
    authSession?.email ||
    jwtPayload?.email ||
    jwtPayload?.merchantEmail ||
    null;

  const accountId =
    jwtPayload?.accountId ||
    jwtPayload?.userId ||
    jwtPayload?.sub ||
    jwtPayload?.id ||
    null;

  if (flags.json) {
    ui.jsonOut({
      environment: endpoint,
      apiBaseUrl,
      authBaseUrl,
      apiKey: maskedApiKey,
      hasApiKey: !!apiKey,
      credentialSource: cred ? cred.source : null,
      user: {
        name,
        email,
        accountId,
      },
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
  process.stdout.write(`${ui.bold('Environment:')}   ${endpoint} ${ui.dim('(' + apiBaseUrl + ')')}\n`);
  process.stdout.write(`${ui.bold('Auth Server:')}   ${authBaseUrl}\n`);
  process.stdout.write(
    `${ui.bold('Credential:')}    ${maskedApiKey ? maskedApiKey + ui.green(` (${cred.source})`) : ui.dim('(not configured)')}\n`,
  );

  if (name) {
    process.stdout.write(`${ui.bold('User Name:')}     ${ui.safe(name)}\n`);
  }
  if (email) {
    process.stdout.write(`${ui.bold('User Email:')}    ${ui.safe(email)}\n`);
  }
  if (accountId) {
    process.stdout.write(`${ui.bold('Account ID:')}    ${ui.safe(accountId)}\n`);
  }
  if (authSession && authSession.expiresAt) {
    process.stdout.write(`${ui.bold('Token Expires:')} ${ui.safe(authSession.expiresAt)}\n`);
  }

  process.stdout.write(`${ui.bold('Config Path:')}   ${config.file}\n`);
}

module.exports = { run };
