// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { BlockedHostError, checkCaptureUrl, isPublicAddress, resolvePublicAddress, type LookupAll } from './captureUrlValidation';

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8', '1.1.1.1', '93.184.215.14', '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0',
    '169.253.255.255', '192.167.255.255', '223.255.255.255',
    '2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '[2606:4700::6810:84e5]',
  ])('allows public %s', (ip) => expect(isPublicAddress(ip)).toBe(true));

  it.each([
    // IPv4 special-purpose ranges
    '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.255.255.254',
    '169.254.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1', '192.88.99.1',
    '192.168.0.1', '192.168.255.255', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9',
    '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    // IPv6: loopback, unspecified, ULA, link-local, multicast, mapped/compat, NAT64, documentation, 6to4, Teredo
    '::1', '[::1]', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '[::ffff:7f00:1]', '::ffff:8.8.8.8', '::127.0.0.1', '64:ff9b::808:808',
    '2001:db8::1', '3fff::1', '2002:7f00:1::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2',
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(['example.com', '', '1.2.3', '1.2.3.4.5', '256.1.1.1', 'not-an-ip'])('treats non-IP %j as not public', (v) =>
    expect(isPublicAddress(v)).toBe(false));
});

describe('checkCaptureUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.com/path?q=1#x', 'http://example.com/path?q=1#x'],
    ['  https://Example.COM/A  ', 'https://example.com/A'],
    ['https://example.com./', 'https://example.com./'],
    ['https://example.com:443/', 'https://example.com/'],
    ['http://example.com:80/', 'http://example.com/'],
    ['https://example.com:80/', 'https://example.com:80/'],
    ['https://bücher.de/', 'https://xn--bcher-kva.de/'],
    ['https://xn--bcher-kva.de/', 'https://xn--bcher-kva.de/'],
    ['https://sub.domain.co.uk/', 'https://sub.domain.co.uk/'],
  ])('accepts %j', (raw, href) => {
    const r = checkCaptureUrl(raw);
    expect(r.ok && r.url.href).toBe(href);
  });

  it.each([
    'file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/', 'chrome://settings',
    'about:blank', 'ws://example.com/', 'gopher://example.com/', 'view-source:https://example.com',
    'example.com', '//example.com', '', 'http://', 'https://exa mple.com/', 'http://1.2.3.4.5/',
    'http://user:pass@example.com/', 'https://user@example.com/', 'https://:pw@example.com/',
  ])('rejects %j as invalid_url', (raw) => {
    const r = checkCaptureUrl(raw);
    expect(r.ok ? 'ok' : r.code).toBe('invalid_url');
  });

  it.each([
    // numeric host forms all canonicalise to an IP literal
    'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://0x7f000001/', 'http://127.1/', 'http://017700000001/',
    'http://0177.0.0.1/', 'http://0/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://8.8.8.8/',
    'http://134744072/',
    // IPv6 literals, any kind
    'http://[::1]/', 'http://[0:0:0:0:0:0:0:1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[::]/',
    'http://[fe80::1]/', 'http://[fd00::1]/', 'http://[2606:4700::1]/',
    // internal names
    'http://localhost/', 'http://LOCALHOST./', 'http://localhost:7500/', 'http://app.localhost/', 'http://printer.local/',
    'http://metadata.google.internal/', 'http://router.lan/', 'http://nas.home.arpa/', 'http://intranet/', 'http://wiki.corp/',
    // ports
    'http://example.com:8080/', 'https://example.com:7500/', 'http://example.com:22/', 'https://example.com:0/',
  ])('rejects %j as blocked_host', (raw) => {
    const r = checkCaptureUrl(raw);
    expect(r.ok ? 'ok' : r.code).toBe('blocked_host');
  });
});

describe('resolvePublicAddress', () => {
  const lookupOf = (...addresses: string[]): LookupAll => vi.fn(async () => addresses.map((address) => ({ address })));

  it('returns the first address when every resolved address is public', async () => {
    await expect(resolvePublicAddress('example.com', lookupOf('93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c')))
      .resolves.toBe('93.184.215.14');
  });

  it.each([
    [['127.0.0.1']], [['10.0.0.5']], [['169.254.169.254']], [['::1']], [['::ffff:127.0.0.1']],
    [['93.184.215.14', '192.168.1.1']], // one private answer poisons the whole name
    [[]],
  ])('blocks a name resolving to %j', async (addresses) => {
    await expect(resolvePublicAddress('rebind.example', lookupOf(...addresses))).rejects.toBeInstanceOf(BlockedHostError);
  });

  it('checks IP literals directly without DNS', async () => {
    const lookup = lookupOf('8.8.8.8');
    await expect(resolvePublicAddress('[2606:4700::1]', lookup)).resolves.toBe('2606:4700::1');
    await expect(resolvePublicAddress('1.1.1.1', lookup)).resolves.toBe('1.1.1.1');
    await expect(resolvePublicAddress('127.0.0.1', lookup)).rejects.toBeInstanceOf(BlockedHostError);
    await expect(resolvePublicAddress('[::ffff:7f00:1]', lookup)).rejects.toBeInstanceOf(BlockedHostError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('blocks internal names without asking DNS', async () => {
    const lookup = lookupOf('8.8.8.8');
    for (const host of ['localhost', 'LOCALHOST.', 'x.localhost', 'nas.local', 'intranet', '']) {
      await expect(resolvePublicAddress(host, lookup)).rejects.toBeInstanceOf(BlockedHostError);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('passes DNS failures through unchanged', async () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND nope.example'), { code: 'ENOTFOUND' });
    await expect(resolvePublicAddress('nope.example', () => Promise.reject(err))).rejects.toBe(err);
  });
});
