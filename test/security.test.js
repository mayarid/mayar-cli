const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  checkWebhookUrl, classifyIp, UnsafeUrlError,
  stripControl, escapeJsonText, looksLikeHtml, findHtml,
} = require('../src/security');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const lookupTo = (address) => async () => [{ address, family: address.includes(':') ? 6 : 4 }];

describe('classifyIp', () => {
  const cases = [
    ['127.0.0.1', 'loopback address'],
    ['127.255.1.2', 'loopback address'],
    ['::1', 'loopback address'],
    ['::ffff:127.0.0.1', 'loopback address'],
    ['::ffff:7f00:1', 'loopback address'],
    ['10.1.2.3', 'private network address'],
    ['172.16.0.1', 'private network address'],
    ['172.31.255.255', 'private network address'],
    ['192.168.1.1', 'private network address'],
    ['100.64.0.1', 'private network address'],
    ['fd12:3456::1', 'private network address'],
    ['169.254.169.254', 'cloud metadata address'],
    ['fd00:ec2::254', 'cloud metadata address'],
    ['169.254.10.10', 'link-local address'],
    ['fe80::1', 'link-local address'],
    ['0.0.0.0', 'unspecified address'],
    ['::', 'unspecified address'],
    ['224.0.0.1', 'reserved address'],
    ['255.255.255.255', 'reserved address'],
  ];
  for (const [ip, label] of cases) {
    test(`${ip} → ${label}`, () => assert.equal(classifyIp(ip), label));
  }
  test('public addresses pass', () => {
    assert.equal(classifyIp('93.184.216.34'), null);
    assert.equal(classifyIp('172.32.0.1'), null);
    assert.equal(classifyIp('2606:4700::1111'), null);
  });
});

describe('checkWebhookUrl', () => {
  test('accepts a public https URL', async () => {
    const url = await checkWebhookUrl('https://hooks.example.com/mayar', { lookup: publicLookup });
    assert.equal(url.hostname, 'hooks.example.com');
  });

  const refused = [
    ['ftp://example.com/x', /scheme not allowed/],
    ['file:///etc/passwd', /scheme not allowed/],
    ['gopher://example.com', /scheme not allowed/],
    ['not a url', /not a valid URL/],
    ['http://user:pw@example.com', /credentials/],
    ['http://example.com:22/', /blocked port.*SSH/],
    ['http://example.com:6379/', /blocked port.*Redis/],
    ['http://127.0.0.1/hook', /loopback/],
    ['http://[::1]:8080/', /loopback/],
    ['http://[::ffff:127.0.0.1]/', /loopback/],
    ['http://[::127.0.0.1]/', /loopback/], // IPv4-compatible form, rewritten to [::7f00:1]
    ['http://[::ffff:a9fe:a9fe]/', /cloud metadata/],
    ['http://[::a00:1]/', /private network/],
    ['http://localhost:3000/', /loopback/],
    ['http://api.localhost/', /loopback/],
    ['http://169.254.169.254/latest/meta-data', /cloud metadata/],
    ['http://10.0.0.5/', /private network/],
    ['http://2130706433/', /loopback/], // decimal form of 127.0.0.1, normalised by URL
  ];
  for (const [input, re] of refused) {
    test(`refuses ${input}`, async () => {
      await assert.rejects(checkWebhookUrl(input, { lookup: publicLookup }), (err) => {
        assert.ok(err instanceof UnsafeUrlError);
        assert.match(err.message, re);
        assert.match(err.message, /Nothing was sent/);
        return true;
      });
    });
  }

  test('refuses a host name that resolves to a private address', async () => {
    await assert.rejects(
      checkWebhookUrl('https://rebind.example.com/', { lookup: lookupTo('192.168.0.10') }),
      /private network address \(rebind\.example\.com resolves to 192\.168\.0\.10\)/,
    );
  });

  test('refuses when any resolved address is unsafe', async () => {
    const lookup = async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }];
    await assert.rejects(checkWebhookUrl('https://mixed.example.com/', { lookup }), /loopback/);
  });

  test('refuses a host name that does not resolve', async () => {
    const lookup = async () => { const e = new Error('nope'); e.code = 'ENOTFOUND'; throw e; };
    await assert.rejects(checkWebhookUrl('https://nx.example.invalid/', { lookup }), /does not resolve \(ENOTFOUND\)/);
  });
});

describe('stripControl', () => {
  test('removes CSI color and cursor sequences', () => {
    assert.equal(stripControl('\x1b[31mred\x1b[0m \x1b[2J\x1b[Hok'), 'red ok');
  });
  test('removes OSC sequences such as hyperlinks and title changes', () => {
    assert.equal(stripControl('\x1b]0;pwned\x07title'), 'title');
    assert.equal(stripControl('\x1b]8;;http://evil\x1b\\link\x1b]8;;\x1b\\'), 'link');
  });
  test('removes C1 controls, DEL, bare controls and bidi overrides', () => {
    assert.equal(stripControl('a\x9b31mb\x7fc\x07d\x00e‮f'), 'a' + 'b' + 'c' + 'd' + 'e' + 'f');
  });
  test('keeps tabs, newlines and normal Unicode', () => {
    assert.equal(stripControl('Budi\tSantoso\nRp 10.000 ✓ é'), 'Budi\tSantoso\nRp 10.000 ✓ é');
  });
  test('passes null and undefined through, converts numbers', () => {
    assert.equal(stripControl(null), null);
    assert.equal(stripControl(undefined), undefined);
    assert.equal(stripControl(42), '42');
  });
});

describe('escapeJsonText', () => {
  test('escapes C1 controls and bidi overrides but keeps the same data', () => {
    const data = { name: 'a\x9bb‮c\x7f', ok: 'é ✓' };
    const out = escapeJsonText(JSON.stringify(data));
    assert.doesNotMatch(out, /[\x7f-\x9f‮]/);
    assert.deepEqual(JSON.parse(out), data);
  });
});

describe('looksLikeHtml / findHtml', () => {
  test('detects tags, javascript: URLs and event handlers', () => {
    assert.ok(looksLikeHtml('<script>alert(1)</script>'));
    assert.ok(looksLikeHtml('<img src=x onerror=alert(1)>'));
    assert.ok(looksLikeHtml('javascript:alert(1)'));
    assert.ok(looksLikeHtml('x onload=alert(1)'));
  });
  test('does not flag plain names and maths', () => {
    assert.equal(looksLikeHtml('Budi <budi@example.com>'), false);
    assert.equal(looksLikeHtml('PT Maju & Jaya'), false);
    assert.equal(looksLikeHtml('3 < 5 and 7 > 2'), false);
    assert.equal(looksLikeHtml('Online course'), false);
  });
  test('finds nested and array paths', () => {
    const body = {
      name: 'ok',
      customer: { name: '<b>x</b>' },
      items: [{ description: 'fine' }, { description: '<svg onload=1>' }],
    };
    assert.deepEqual(findHtml(body, ['name', 'customer.name', 'items.*.description']),
      ['customer.name', 'items.1.description']);
  });
});
