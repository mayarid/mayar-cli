const readline = require('readline');

const isTTY = !!process.stdout.isTTY;
const wrap = (n) => (s) => isTTY ? `\x1b[${n}m${s}\x1b[0m` : String(s);
const dim = wrap('2');
const bold = wrap('1');
const red = wrap('31');
const green = wrap('32');
const yellow = wrap('33');
const cyan = wrap('36');
const magenta = wrap('35');

const BANNER = `\x1b[35m
███╗   ███╗ █████╗ ██╗   ██╗ █████╗ ██████╗
████╗ ████║██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗
██╔████╔██║███████║ ╚████╔╝ ███████║██████╔╝
██║╚██╔╝██║██╔══██║  ╚██╔╝  ██╔══██║██╔══██╗
██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║  ██║
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝\x1b[0m
\x1b[36m         command line interface · production\x1b[0m
`;

function printBanner() {
  if (isTTY) process.stdout.write(BANNER + '\n');
  else process.stdout.write('Mayar CLI\n\n');
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

function askSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw === true;
    stdin.resume();
    stdin.setEncoding('utf8');
    if (stdin.setRawMode) stdin.setRawMode(true);
    let buf = '';
    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
    };
    const onData = (key) => {
      if (key === '') {
        cleanup();
        process.stdout.write('\n');
        process.exit(130);
      }
      if (key === '\r' || key === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(buf);
        return;
      }
      if (key === '' || key === '\b') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (key.charCodeAt(0) < 32) return;
      buf += key;
      process.stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

function jsonOut(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function table(rows, columns) {
  if (!rows || !rows.length) {
    process.stdout.write(dim('(no rows)') + '\n');
    return;
  }
  const widths = columns.map((col) =>
    Math.min(48, Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))),
  );
  const head = columns.map((col, i) => bold(col.padEnd(widths[i]))).join('  ');
  process.stdout.write(head + '\n');
  process.stdout.write(columns.map((_, i) => dim('─'.repeat(widths[i]))).join('  ') + '\n');
  for (const r of rows) {
    const line = columns.map((col, i) => {
      let v = String(r[col] ?? '');
      if (v.length > widths[i]) v = v.slice(0, widths[i] - 1) + '…';
      return v.padEnd(widths[i]);
    }).join('  ');
    process.stdout.write(line + '\n');
  }
}

async function pickFromList(items, opts = {}) {
  const { displayKey, descriptionKey } = opts;
  const n = items.length;

  // Render numbered list
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const display = item[displayKey] ?? '';
    process.stdout.write(`${i + 1}. ${display}\n`);
    if (descriptionKey && item[descriptionKey]) {
      process.stdout.write(`   ${dim(item[descriptionKey])}\n`);
    }
  }

  if (n === 0) {
    process.stdout.write(dim('(no items)') + '\n');
    return null;
  }

  // Prompt and validate in a loop
  while (true) {
    const answer = await ask('Pick a number (or q to quit): ');

    if (answer === 'q' || answer === 'Q') {
      return null;
    }

    const trimmed = answer.trim();
    const num = parseInt(trimmed, 10);

    if (isNaN(num) || String(num) !== trimmed) {
      process.stdout.write(dim('Please enter a number or q to quit') + '\n');
      continue;
    }

    if (num < 1 || num > n) {
      process.stdout.write(dim(`Invalid selection (1-${n})`) + '\n');
      continue;
    }

    return items[num - 1];
  }
}

module.exports = {
  printBanner, ask, askSecret, jsonOut, table, pickFromList,
  dim, bold, red, green, yellow, cyan, magenta,
};
