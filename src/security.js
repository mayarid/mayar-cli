// Security primitives: pure checks and cleaners, shared by every command.
//
//   checkWebhookUrl  refuse webhook targets that point at private, loopback,
//                    link-local or cloud-metadata addresses (SSRF guard)
//   stripControl     remove terminal escape and control sequences from text
//   escapeJsonText   make JSON text safe for a terminal without losing data
//   findHtml         find HTML-looking text in customer-facing fields

const net = require('net');
const dns = require('dns');

// --- Webhook URL check ------------------------------------------------------

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

// Well-known ports of non-HTTP services. A webhook on one of these is almost
// always an attempt to reach an internal service through Mayar's servers.
const BLOCKED_PORTS = new Map([
  [21, 'FTP'], [22, 'SSH'], [23, 'Telnet'], [25, 'SMTP'], [53, 'DNS'],
  [110, 'POP3'], [111, 'RPC'], [135, 'MSRPC'], [139, 'NetBIOS'], [143, 'IMAP'],
  [389, 'LDAP'], [445, 'SMB'], [465, 'SMTPS'], [587, 'SMTP'], [636, 'LDAPS'],
  [993, 'IMAPS'], [995, 'POP3S'], [1433, 'MSSQL'], [1521, 'Oracle'],
  [2375, 'Docker API'], [2376, 'Docker API'], [2379, 'etcd'], [3306, 'MySQL'],
  [3389, 'RDP'], [5432, 'PostgreSQL'], [5672, 'AMQP'], [5984, 'CouchDB'],
  [6379, 'Redis'], [6443, 'Kubernetes API'], [9200, 'Elasticsearch'],
  [10250, 'Kubelet'], [11211, 'Memcached'], [27017, 'MongoDB'],
]);

// Each rule: [label, list of [network, prefix, family]]. The first match wins,
// so the metadata rule comes before the wider link-local rule.
const RULES = [
  ['cloud metadata address', [
    ['169.254.169.254', 32, 'ipv4'],
    ['169.254.170.2', 32, 'ipv4'],
    ['100.100.100.200', 32, 'ipv4'],
    ['fd00:ec2::254', 128, 'ipv6'],
  ]],
  ['unspecified address', [
    ['0.0.0.0', 8, 'ipv4'],
    ['::', 128, 'ipv6'],
  ]],
  ['loopback address', [
    ['127.0.0.0', 8, 'ipv4'],
    ['::1', 128, 'ipv6'],
  ]],
  ['private network address', [
    ['10.0.0.0', 8, 'ipv4'],
    ['172.16.0.0', 12, 'ipv4'],
    ['192.168.0.0', 16, 'ipv4'],
    ['100.64.0.0', 10, 'ipv4'], // carrier-grade NAT
    ['fc00::', 7, 'ipv6'],
  ]],
  ['link-local address', [
    ['169.254.0.0', 16, 'ipv4'],
    ['fe80::', 10, 'ipv6'],
  ]],
  ['reserved address', [
    ['192.0.0.0', 24, 'ipv4'],
    ['198.18.0.0', 15, 'ipv4'],
    ['224.0.0.0', 4, 'ipv4'], // multicast
    ['240.0.0.0', 4, 'ipv4'], // reserved, includes broadcast
    ['ff00::', 8, 'ipv6'], // multicast
  ]],
];

const BLOCKLISTS = RULES.map(([label, nets]) => {
  const list = new net.BlockList();
  for (const [addr, prefix, family] of nets) list.addSubnet(addr, prefix, family);
  return [label, list];
});

// Turn IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) IPv6
// forms into plain IPv4, so they are checked as IPv4. The URL parser rewrites
// both to hex ("[::7f00:1]", "[::ffff:7f00:1]"), so the hex form matters most.
function unwrapIp(ip) {
  const m = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m) return m[1];
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return ip;
}

// Return the rule label an IP address falls under, or null for a public IP.
function classifyIp(ip) {
  const addr = unwrapIp(String(ip).replace(/^\[|\]$/g, '').split('%')[0]);
  const family = net.isIP(addr);
  if (!family) return 'invalid IP address';
  const type = family === 4 ? 'ipv4' : 'ipv6';
  for (const [label, list] of BLOCKLISTS) {
    if (list.check(addr, type)) return label;
  }
  return null;
}

class UnsafeUrlError extends Error {
  constructor(url, rule, detail) {
    super(`Refused webhook URL ${url}: ${rule}${detail ? ` (${detail})` : ''}. ` +
      'A webhook must be a public http(s) address. Nothing was sent to Mayar.');
    this.name = 'UnsafeUrlError';
    this.rule = rule;
  }
}

function defaultLookup(hostname) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

// Check a webhook URL. Resolve with the parsed URL when it is safe; reject
// with UnsafeUrlError naming the rule that tripped. Host names are resolved
// first, and every address they resolve to must be public, so a name that
// points at 127.0.0.1 is caught too.
async function checkWebhookUrl(input, { lookup = defaultLookup } = {}) {
  const raw = String(input || '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new UnsafeUrlError(raw, 'not a valid URL');
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new UnsafeUrlError(raw, 'scheme not allowed', `${url.protocol.replace(':', '')}; use http or https`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError(raw, 'credentials in URL are not allowed');
  }
  const port = url.port ? Number(url.port) : null;
  if (port !== null && BLOCKED_PORTS.has(port)) {
    throw new UnsafeUrlError(raw, 'blocked port', `${port} is ${BLOCKED_PORTS.get(port)}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(unwrapIp(host))) {
    const rule = classifyIp(host);
    if (rule) throw new UnsafeUrlError(raw, rule, host);
    return url;
  }
  const lower = host.toLowerCase().replace(/\.$/, '');
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    throw new UnsafeUrlError(raw, 'loopback address', host);
  }

  let addrs;
  try {
    addrs = await lookup(host);
  } catch (err) {
    throw new UnsafeUrlError(raw, 'host name does not resolve', err.code || err.message);
  }
  const list = Array.isArray(addrs) ? addrs : [addrs];
  if (!list.length) throw new UnsafeUrlError(raw, 'host name does not resolve');
  for (const a of list) {
    const ip = typeof a === 'string' ? a : a.address;
    const rule = classifyIp(ip);
    if (rule) throw new UnsafeUrlError(raw, rule, `${host} resolves to ${ip}`);
  }
  return url;
}

// --- Terminal output --------------------------------------------------------

// ESC-based sequences: CSI (ESC [ ...), OSC (ESC ] ... BEL or ESC \), DCS/SOS/
// PM/APC strings, and two-byte ESC sequences. Also the 8-bit C1 forms.
// eslint-disable-next-line no-control-regex
const ESCAPE_SEQ = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|\x1b[@-Z\\-_]|\x9b[0-?]*[ -/]*[@-~]|\x9d[^\x07\x9c]*(?:\x07|\x9c)?/g;
// Remaining C0 controls (except tab and newline), DEL, C1 controls, and
// Unicode bidi overrides that can make text read in a false order.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/g;

// Remove escape sequences and control characters from text that came from
// the API, so it cannot move the cursor, change colors or rewrite the screen.
function stripControl(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(ESCAPE_SEQ, '').replace(CONTROL_CHARS, '');
}

// JSON.stringify already escapes C0 controls (including ESC). It leaves DEL,
// the C1 controls and the bidi overrides as raw characters. Escape those as
// \uXXXX too. The output is still valid JSON and parses to the same data.
// eslint-disable-next-line no-control-regex
const JSON_UNSAFE = /[\x7f-\x9f‪-‮⁦-⁩]/g;
function escapeJsonText(json) {
  return json.replace(JSON_UNSAFE, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// --- HTML-looking input -----------------------------------------------------

// A tag is "<name", optional attributes after a space, then ">" or "/>".
// "<budi@example.com>" is not a tag: "@" cannot follow a tag name.
const HTML_PATTERN = /<\s*\/?\s*[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>|<!--|javascript\s*:|\bon[a-z]+\s*=/i;

function looksLikeHtml(value) {
  return typeof value === 'string' && HTML_PATTERN.test(value);
}

// Walk `obj` along each dotted path ("customer.name", "items.*.description")
// and return the paths whose value looks like HTML.
function findHtml(obj, paths) {
  const hits = [];
  const walk = (node, parts, trail) => {
    if (node === null || node === undefined) return;
    if (!parts.length) {
      if (looksLikeHtml(node)) hits.push(trail.join('.'));
      return;
    }
    const [head, ...tail] = parts;
    if (head === '*') {
      if (Array.isArray(node)) node.forEach((item, i) => walk(item, tail, [...trail, String(i)]));
      return;
    }
    if (typeof node === 'object') walk(node[head], tail, [...trail, head]);
  };
  for (const p of paths) walk(obj, p.split('.'), []);
  return hits;
}

module.exports = {
  checkWebhookUrl,
  classifyIp,
  UnsafeUrlError,
  BLOCKED_PORTS,
  stripControl,
  escapeJsonText,
  looksLikeHtml,
  findHtml,
};
