const { MayarAuth } = require('@mayaross/auth');
const config = require('../config');
const ui = require('../ui');
const { decodeJwt } = require('../jwt');

async function run({ flags }) {
  if (!flags.json) {
    ui.printBanner();
    await ui.selectEnvironment(flags);
  }

  const authUrl = config.authBaseUrl();
  const auth = new MayarAuth(authUrl);

  if (!flags.json) {
    process.stdout.write(`${ui.bold('Sign in to Mayar')}\n`);
    process.stdout.write(`${ui.dim('Auth server:')} ${authUrl}\n`);
    process.stdout.write(`${ui.dim('Endpoint:')} ${config.resolveEndpoint()}\n\n`);
    process.stdout.write('Opening your browser to complete Google sign-in…\n');
  }

  const token = await auth.login({
    openBrowser: !flags['no-browser'],
    onUrl: ({ url }) => {
      if (flags.json) return;
      if (flags['no-browser']) {
        process.stdout.write('\nOpen this URL in your browser to sign in:\n');
      } else {
        process.stdout.write('\nIf your browser did not open automatically, visit:\n');
      }
      process.stdout.write(ui.cyan(url) + '\n\n');
      process.stdout.write(ui.dim('Waiting for you to finish signing in…') + '\n');
    },
  });

  // The SDK returns "authToken,refreshToken".
  const [authToken, refreshToken] = String(token).split(',');
  const claims = decodeJwt(authToken) || {};
  const email = claims.sub || claims.email || null;
  const name = claims.name || null;
  const expiresAt = claims.exp ? new Date(claims.exp * 1000).toISOString() : null;

  const existing = config.load() || {};
  config.save({
    ...existing,
    endpoint: config.resolveEndpoint(),
    auth: {
      authToken,
      refreshToken: refreshToken || null,
      email,
      name,
      expiresAt,
      authUrl,
      savedAt: new Date().toISOString(),
    },
  });

  if (flags.json) {
    ui.jsonOut({ ok: true, email, name, expiresAt, authUrl, endpoint: config.resolveEndpoint() });
    return;
  }

  process.stdout.write('\n' + ui.green(`✓ Signed in${name ? ` as ${ui.safe(name)}` : ''}${email ? ` (${ui.safe(email)})` : ''}`) + '\n');
  if (expiresAt) process.stdout.write(`${ui.bold('Token expires:')} ${expiresAt}\n`);
  process.stdout.write(ui.dim(`Credentials saved to ${config.file}`) + '\n');
}

module.exports = { run };
