const ui = require('./ui');
const config = require('./config');

const VERSION = require('../package.json').version;

const HELP = () => `${ui.bold('mayar')} ${ui.dim('— Mayar API CLI (production)')}

${ui.bold('Usage:')}
  mayar <command> [args] [flags]

${ui.bold('Setup:')}
  init                                Run first-time setup (or re-configure API key)
  login [--no-browser]                Sign in via browser (Google OAuth) and save auth token
  api-key <key>                       Save API key non-interactively
  config show                         Show config path and masked API key
  config reset                        Remove the saved API key

${ui.bold('Account:')}
  whoami                              Show identity behind the saved API key
  balance                             Get account balance

${ui.bold('Invoices:')}
  invoice list [--page N --pageSize N]
  invoice get <id>
  invoice close <id>
  invoice reopen <id>
  invoice create --data <json|@file.json>

${ui.bold('Products:')}
  product list [--page N --pageSize N]
  product search <keyword>
  product type <ebook|course|membership|saas|event|webinar|...>
  product get <id>
  product close <id>
  product reopen <id>
  product status <id> <open|close|active|closed|unlisted>   [v2, adds unlisted]

${ui.bold('Single payment requests:')}
  payment list
  payment get <id>
  payment close <id>
  payment reopen <id>
  payment create --data <json|@file.json>

${ui.bold('Customers:')}
  customer list [--page N --pageSize N]
  customer create --data <json|@file.json>
  customer search <email>             Look up a customer by email
  customer update <fromEmail> <toEmail>
  customer magic-link <email>         Email a portal login link to the customer

${ui.bold('Transactions:')}
  tx list [--page N --pageSize N]     Paid transactions
  tx unpaid [--page N --pageSize N]   Unpaid transactions
  tx daily                            Today's totals (volume + count)

${ui.bold('Reviews:')}
  review list [--page N --pageSize N]
  review stats [productId]            Aggregated ratings (merchant-wide or per product) [v2]

${ui.bold('Discounts:')}
  discount validate <code> <paymentLinkId>   Check if a coupon applies to a checkout [v2]

${ui.bold('QR & Payment Channels:')}
  qrcode <amount>                     Dynamic QR for the given amount
  qrcode static                       Merchant's static QRIS image [v2]
  qrcode channels                     List enabled payment channels [v2]

${ui.bold('Webhooks:')}
  webhook register <url>
  webhook test <url>
  webhook history [--page N --pageSize N]

${ui.bold('Global flags:')}
  --json                Output raw JSON instead of formatted tables
  --api-key <key>       Use this API key for the run (overrides env + saved config)
  --page N              Pagination page (default 1)
  --pageSize N          Pagination page size (default 10)
  -h, --help            Show help
  -v, --version         Show version

${ui.bold('Environment:')}
  MAYAR_API_KEY         Used when --api-key is not given and no config is saved
  MAYAR_API_URL         Override API base URL
  MAYAR_AUTH_URL        Override auth server base URL (used by 'login')
  NODE_ENV=development  Target the sandbox (api/auth .mayar.club) instead of production

${ui.dim('Resolution order: --api-key flag > MAYAR_API_KEY env > saved config.')}
${ui.dim('API endpoint:  MAYAR_API_URL, else NODE_ENV=development → api.mayar.club, else api.mayar.id')}
${ui.dim('Auth endpoint: MAYAR_AUTH_URL, else NODE_ENV=development → auth.mayar.club, else auth.mayar.id')}
${ui.dim('Config:   ~/.config/mayar/config.json (chmod 600)')}
`;

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (a === '--json') flags.json = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--no-browser') flags['no-browser'] = true;
    else if (a === '--api-key') flags.apiKey = argv[++i];
    else if (a.startsWith('--api-key=')) flags.apiKey = a.slice('--api-key='.length);
    else if (a === '--page') flags.page = argv[++i];
    else if (a === '--pageSize' || a === '--page-size') flags.pageSize = argv[++i];
    else if (a === '--data') flags.data = argv[++i];
    else if (a === '-h' || a === '--help') flags.help = true;
    else if (a === '-v' || a === '--version') flags.version = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = argv[++i];
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function ensureKey(flags) {
  if (flags.apiKey) return flags.apiKey;
  if (process.env.MAYAR_API_KEY) return process.env.MAYAR_API_KEY;
  const cfg = config.load();
  if (cfg && cfg.apiKey) return cfg.apiKey;
  // First-run flow
  ui.printBanner();
  process.stdout.write(`${ui.bold('Welcome to Mayar CLI.')}\n`);
  process.stdout.write(`No API key found. Get yours from ${ui.cyan('https://web.mayar.id')} → Integration → API Key.\n\n`);
  if (!process.stdin.isTTY) {
    process.stderr.write(ui.red('Stdin is not a TTY — cannot prompt. Run `mayar init` interactively or pass --api-key.\n'));
    process.exit(1);
  }
  const key = await ui.askSecret(ui.bold('Paste your production API key: '));
  if (!key.trim()) { process.stderr.write(ui.red('No key provided. Aborting.\n')); process.exit(1); }
  config.save({ apiKey: key.trim(), endpoint: 'production', savedAt: new Date().toISOString() });
  process.stdout.write(ui.green(`✓ Saved to ${config.file}`) + '\n\n');
  return key.trim();
}

async function run(argv) {
  const { flags, positional } = parseFlags(argv);

  if (flags.version) { process.stdout.write(VERSION + '\n'); return; }
  if (!positional.length || (flags.help && !positional.length)) { process.stdout.write(HELP()); return; }

  const [cmd, sub, ...rest] = positional;

  try {
    if (cmd === 'help') { process.stdout.write(HELP()); return; }
    if (cmd === 'init') {
      const init = require('./commands/init');
      return await init.run({ flags });
    }
    if (cmd === 'login') {
      const login = require('./commands/login');
      return await login.run({ flags });
    }
    if (cmd === 'api-key' || cmd === 'apikey') {
      const apikey = require('./commands/apikey');
      return await apikey.run({ positional: [sub, ...rest].filter((x) => x !== undefined) });
    }
    if (cmd === 'config') {
      if (sub === 'show') {
        const cfg = config.load();
        if (!cfg) { process.stdout.write(ui.dim('(no config saved)') + '\n'); return; }
        const masked = cfg.apiKey ? cfg.apiKey.slice(0, 6) + '…' + cfg.apiKey.slice(-4) : '(none)';
        process.stdout.write(`Path:     ${config.file}\n`);
        process.stdout.write(`API Key:  ${masked}\n`);
        process.stdout.write(`Endpoint: ${cfg.endpoint || 'production'}\n`);
        process.stdout.write(`Saved at: ${cfg.savedAt || ''}\n`);
        return;
      }
      if (sub === 'reset') {
        const ok = config.clear();
        process.stdout.write((ok ? ui.green('✓ Config cleared.') : ui.dim('(no config to clear)')) + '\n');
        return;
      }
      process.stdout.write('Usage: mayar config <show|reset>\n');
      return;
    }

    const handlers = {
      whoami:       './commands/whoami',
      balance:      './commands/balance',
      invoice:      './commands/invoice',
      product:      './commands/product',
      payment:      './commands/payment',
      customer:     './commands/customer',
      tx:           './commands/transaction',
      transaction:  './commands/transaction',
      transactions: './commands/transaction',
      qr:           './commands/qrcode',
      qrcode:       './commands/qrcode',
      webhook:      './commands/webhook',
      review:       './commands/review',
      reviews:      './commands/review',
      discount:     './commands/discount',
      discounts:    './commands/discount',
      coupon:       './commands/discount',
    };
    const handler = handlers[cmd];
    if (!handler) {
      process.stderr.write(ui.red(`Unknown command: ${cmd}`) + '\n\n');
      process.stdout.write(HELP());
      process.exit(1);
    }

    const apiKey = await ensureKey(flags);
    const ctx = { apiKey, flags, positional: [sub, ...rest].filter((x) => x !== undefined) };
    return await require(handler).run(ctx);
  } catch (err) {
    process.stderr.write(ui.red('Error: ' + (err.message || String(err))) + '\n');
    process.exit(1);
  }
}

module.exports = { run, parseFlags };
