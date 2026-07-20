const ui = require('./ui');
const config = require('./config');

const VERSION = require('../package.json').version;

const HELP = () => `${ui.bold('mayar')} ${ui.dim('— Mayar API CLI (v2)')}

${ui.bold('Usage:')}
  mayar <command> [args] [flags]

${ui.bold('Setup:')}
  init                                Run first-time setup (or re-configure API key)
  login [--no-browser]                Sign in via browser (Google OAuth) and save auth token
  api-key <key>                       Save API key non-interactively
  config show                         Show config path and masked API key
  config reset                        Remove the saved API key

${ui.bold('Agent Skills:')}
  skill install [--target <all|agents|claude|opencode|codex|cursor>] [--force]
                                              Install Mayar SKILL.md into AI agent directories

${ui.bold('Account:')}
  whoami                              Show identity behind the saved API key
  balance                             Get account balance

${ui.bold('Invoices:')}
  invoice list [--limit N --after CURSOR]
  invoice get <id>
  invoice close <id>
  invoice reopen <id>
  invoice status <id> <open|close|active|closed|unlisted>
  invoice edit <id> --data <json|@file>
  invoice filter --email <email> [--limit N --after CURSOR]
  invoice create --data <json|@file>

${ui.bold('Products:')}
  product list [--limit N --after CURSOR --search Q --type T]
  product search <keyword>
  product type <ebook|course|membership|saas|event|webinar|...>
  product get <id>
  product close <id>
  product reopen <id>
  product status <id> <open|close|active|closed|unlisted>
  product transactions <id> [--limit N --after CURSOR]
  product create --type <T> --data <json|@file>
  product edit <id> --data <json|@file>
  product sort <generic_link|event|webinar|digital_product> [--limit --after]

${ui.bold('Payment links (alt route):')}
  payment-link edit <id> --data <json|@file>   Alias for /hl/v2/payment-links/{id}/update

${ui.bold('Single payment requests:')}
  payment list [--limit N --after CURSOR --status paid|unpaid|closed]
  payment get <id>
  payment status <id> <open|close|active|closed|unlisted>
  payment edit <id> --data <json|@file>
  payment create --data <json|@file>

${ui.bold('Customers:')}
  customer list
  customer create --data <json|@file>
  customer search <email>
  customer update <fromEmail> <toEmail>
  customer magic-link <email>

${ui.bold('Transactions:')}
  tx list [--limit N --after CURSOR --status --customerId --startAt --endAt]
  tx unpaid [--limit N --after CURSOR]
  tx daily
  tx product <productId> [--limit N --after CURSOR]

${ui.bold('Reviews:')}
  review list [--limit N --after CURSOR --status --paymentLinkId --rating]
  review stats [productId]
  review create --data <json|@file>
  review update <id> --data <json|@file>
  review bulk-status --data <json|@file>       (array of {id,status})
  review product <paymentLinkId> [--limit N --after CURSOR]
  review product-customer <paymentLinkId> --customerId <id>

${ui.bold('Discounts (coupons):')}
  discount create --data <json|@file>
  discount get <id>
  discount validate <code> <paymentLinkId>
  discount check <code>

${ui.bold('Bundling:')}
  bundling list [--limit N --after CURSOR]
  bundling get <id>

${ui.bold('Installments:')}
  installment list [--limit N --after CURSOR]
  installment get <id>
  installment create --data <json|@file>

${ui.bold('Memberships:')}
  membership members --productId <id> [--limit N --after CURSOR]
  membership tiers   --productId <id> [--limit N --after CURSOR]
  membership register --data <json|@file>
  membership get <memberId> --productId <id>
  membership update <memberId> --productId <id> [--data <json|@file>]
  membership cancel <memberId> --productId <id>
  membership create-invoice <memberId> --productId <id>

${ui.bold('Credit wallets:')}
  credit balance --customerId <id> --productId <id> [--tierId <id>]
  credit add    --data <json|@file>       ({customerId, productId, amount})
  credit spend  --data <json|@file>       ({customerId, productId, amount})
  credit history <customerId> --productId <id> [--page N --limit N]
  credit register-usage      --data <json|@file>
  credit register-membership --data <json|@file>
  credit checkout            --data <json|@file>

${ui.bold('SaaS licensing:')}
  saas activate   <licenseCode> <productId>
  saas deactivate <licenseCode> <productId>
  saas verify     <licenseCode> <productId>

${ui.bold('Software licensing:')}
  software verify <licenseCode> <productId>

${ui.bold('QR & payment channels:')}
  qrcode <amount>                     Dynamic QR for the given amount
  qrcode static                       Merchant's static QRIS image
  qrcode channels                     List enabled payment channels

${ui.bold('Webhooks:')}
  webhook register <url>
  webhook test <url>
  webhook history [--limit N --after CURSOR]
  webhook new-history [--limit N --after CURSOR]
  webhook retry <historyId>

${ui.bold('Global flags:')}
  --json                Output raw JSON instead of formatted tables
  --api-key <key>       Use this API key for the run (overrides env + saved config)
  --sandbox             Target the sandbox environment (api.mayar.club)
  --production          Target the production environment (api.mayar.id)
  --env <value>         Target environment: sandbox or production
  --limit N             Page size (v2, default 10, max 50)
  --after CURSOR        Cursor for next page (from previous response's nextStartingAfter)
  --pageSize N          Alias for --limit
  --data <json|@file>   Inline JSON or @path to a JSON file
  -h, --help            Show help
  -v, --version         Show version

${ui.bold('Environment:')}
  MAYAR_API_KEY         Used when --api-key is not given and no config is saved
  MAYAR_API_URL         Override API base URL
  MAYAR_AUTH_URL        Override auth server base URL (used by 'login')
  NODE_ENV=development  Target the sandbox (api/auth .mayar.club) instead of production

${ui.dim('Resolution order: --api-key flag > MAYAR_API_KEY env > saved config.')}
${ui.dim('Endpoint: --sandbox/--production/--env > NODE_ENV=development > stored endpoint (default production).')}
${ui.dim('Priority:  invocation flags → NODE_ENV → config.json → production (default)')}
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
    else if (a === '--sandbox') flags.sandbox = true;
    else if (a === '--production') flags.production = true;
    else if (a === '--api-key') flags.apiKey = argv[++i];
    else if (a.startsWith('--api-key=')) flags.apiKey = a.slice('--api-key='.length);
    else if (a === '--page') flags.page = argv[++i];
    else if (a === '--pageSize' || a === '--page-size') flags.pageSize = argv[++i];
    else if (a === '--limit') flags.limit = argv[++i];
    else if (a === '--after' || a === '--starting-after' || a === '--startingAfter') flags.after = argv[++i];
    else if (a === '--data') flags.data = argv[++i];
    else if (a === '--env') flags.env = argv[++i];
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
  ui.printBanner();
  process.stdout.write(`${ui.bold('Welcome to Mayar CLI.')}\n`);
  process.stdout.write(`No API key found. Get yours from ${ui.cyan('https://web.mayar.id')} → Integration → API Key.\n\n`);
  if (!process.stdin.isTTY) {
    process.stderr.write(ui.red('Stdin is not a TTY — cannot prompt. Run `mayar init` interactively or pass --api-key.\n'));
    process.exit(1);
  }
  const key = await ui.askSecret(ui.bold('Paste your production API key: '));
  if (!key.trim()) { process.stderr.write(ui.red('No key provided. Aborting.\n')); process.exit(1); }
  config.save({ apiKey: key.trim(), endpoint: config.resolveEndpoint(), savedAt: new Date().toISOString() });
  process.stdout.write(ui.green(`✓ Saved to ${config.file}`) + '\n\n');
  return key.trim();
}

async function run(argv) {
  const { flags, positional } = parseFlags(argv);

  // Resolve endpoint override from flags
  if (flags.sandbox && flags.production) {
    process.stderr.write(ui.red('Error: --sandbox and --production cannot be used together.\n'));
    process.exit(1);
  }
  if (flags.sandbox) config.setRuntimeEndpoint('sandbox');
  else if (flags.production) config.setRuntimeEndpoint('production');
  else if (flags.env) {
    const v = flags.env.toLowerCase();
    if (v !== 'sandbox' && v !== 'production') {
      process.stderr.write(ui.red(`Error: Invalid --env value: ${flags.env}. Must be 'sandbox' or 'production'.\n`));
      process.exit(1);
    }
    config.setRuntimeEndpoint(v);
  } else {
    config.setRuntimeEndpoint(null);
  }

  if (flags.version) { process.stdout.write(VERSION + '\n'); return; }
  if (!positional.length || (flags.help && !positional.length)) { process.stdout.write(HELP()); return; }

  const [cmd, sub, ...rest] = positional;

  try {
    if (cmd === 'help') { process.stdout.write(HELP()); return; }
    if (cmd === 'init') { return await require('./commands/init').run({ flags }); }
    if (cmd === 'login') { return await require('./commands/login').run({ flags }); }
    if (cmd === 'api-key' || cmd === 'apikey') {
      return await require('./commands/apikey').run({ positional: [sub, ...rest].filter((x) => x !== undefined) });
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
      invoices:     './commands/invoice',
      product:      './commands/product',
      products:     './commands/product',
      payment:      './commands/payment',
      payments:     './commands/payment',
      customer:     './commands/customer',
      customers:    './commands/customer',
      tx:           './commands/transaction',
      transaction:  './commands/transaction',
      transactions: './commands/transaction',
      qr:           './commands/qrcode',
      qrcode:       './commands/qrcode',
      webhook:      './commands/webhook',
      webhooks:     './commands/webhook',
      review:       './commands/review',
      reviews:      './commands/review',
      discount:     './commands/discount',
      discounts:    './commands/discount',
      coupon:       './commands/discount',
      coupons:      './commands/discount',
      bundling:     './commands/bundling',
      bundlings:    './commands/bundling',
      installment:  './commands/installment',
      installments: './commands/installment',
      membership:   './commands/membership',
      memberships:  './commands/membership',
      credit:       './commands/credit',
      credits:      './commands/credit',
      saas:         './commands/saas',
      skill:        './commands/skill',
      software:     './commands/software',
      'payment-link':  './commands/payment-link',
      paymentlink:     './commands/payment-link',
      'payment-links': './commands/payment-link',
      plink:           './commands/payment-link',
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
