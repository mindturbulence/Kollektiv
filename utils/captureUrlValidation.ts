import net from 'net';

/**
 * SSRF policy for "Import from site" (SD-09). Server-only (uses `net`).
 * `checkCaptureUrl` vets the URL the user typed; `resolvePublicAddress` vets every host the
 * capture browser contacts (through the filtering proxy in services/siteCapture.ts).
 */

export const CAPTURE_ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443]);

// IANA special-purpose IPv4 ranges (RFC 6890 and successors). Anything here is not a public website.
const BLOCKED_V4 = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast 255.255.255.255
] as const) BLOCKED_V4.addSubnet(prefix, bits, 'ipv4');

// IPv6 is allow-listed: only global unicast 2000::/3, minus the special blocks inside it.
// Everything else (::1, ::, fc00::/7, fe80::/10, ff00::/8, ::ffff:0:0/96 IPv4-mapped, 64:ff9b::/96 NAT64) fails.
const GLOBAL_V6 = new net.BlockList();
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6');
const BLOCKED_V6 = new net.BlockList();
for (const [prefix, bits] of [
  ['2001::', 23], // IETF protocol assignments, incl. Teredo 2001::/32
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an arbitrary IPv4 address)
  ['3fff::', 20], // documentation
] as const) BLOCKED_V6.addSubnet(prefix, bits, 'ipv6');

/** Lower-cased host without IPv6 brackets or one trailing dot ("Example.COM." → "example.com"). */
export const bareHost = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '');

/** True only for a public unicast IP literal. Non-IP input is false. */
export function isPublicAddress(ip: string): boolean {
  const host = bareHost(ip);
  const family = net.isIP(host);
  if (family === 4) return !BLOCKED_V4.check(host, 'ipv4');
  if (family === 6) return GLOBAL_V6.check(host, 'ipv6') && !BLOCKED_V6.check(host, 'ipv6');
  return false;
}

const INTERNAL_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home.arpa', 'intranet', 'corp'];

/** Names that only make sense on a private network (or are not names at all). Expects `bareHost` output. */
const isInternalName = (host: string): boolean =>
  !host.includes('.') || INTERNAL_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));

export class BlockedHostError extends Error {
  constructor(host: string) {
    super(`Blocked host: ${host}`);
    this.name = 'BlockedHostError';
  }
}

export type CaptureUrlCheck =
  | { ok: true; url: URL }
  | { ok: false; code: 'invalid_url' | 'blocked_host'; message: string };

/**
 * Static checks on the URL the user typed. WHATWG URL parsing already canonicalises numeric hosts
 * (2130706433, 0x7f.1, 127.1, 017700000001 → 127.0.0.1), lower-cases names and punycodes IDNs,
 * so the checks below run on the canonical host. Every IP literal is refused: a design reference
 * is a website, and a literal skips the DNS-based checks entirely.
 */
export function checkCaptureUrl(raw: string): CaptureUrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, code: 'invalid_url', message: 'Not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'invalid_url', message: 'Only http:// and https:// URLs can be captured.' };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'invalid_url', message: 'URLs with a user name or password are not allowed.' };
  }
  if (url.port && !CAPTURE_ALLOWED_PORTS.has(Number(url.port))) {
    return { ok: false, code: 'blocked_host', message: 'Only the standard ports 80 and 443 are allowed.' };
  }
  const host = bareHost(url.hostname);
  if (!host) return { ok: false, code: 'invalid_url', message: 'The URL has no host.' };
  if (net.isIP(host)) {
    return { ok: false, code: 'blocked_host', message: 'IP addresses are not allowed; use the site’s domain name.' };
  }
  if (isInternalName(host)) {
    return { ok: false, code: 'blocked_host', message: 'Local and private network hosts are not allowed.' };
  }
  return { ok: true, url };
}

export type LookupAll = (hostname: string) => Promise<ReadonlyArray<{ address: string }>>;

/**
 * Resolves `hostname` and returns one address to connect to, only if EVERY resolved address is
 * public (a name that also resolves privately is refused). Public IP literals pass through, so
 * page sub-resources on a public IP still load. Throws BlockedHostError when refused; lookup
 * failures (ENOTFOUND, …) propagate unchanged.
 */
export async function resolvePublicAddress(hostname: string, lookup: LookupAll): Promise<string> {
  const host = bareHost(hostname);
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new BlockedHostError(host);
    return host;
  }
  if (!host || isInternalName(host)) throw new BlockedHostError(host);
  const addresses = await lookup(host);
  if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) throw new BlockedHostError(host);
  return addresses[0].address;
}
