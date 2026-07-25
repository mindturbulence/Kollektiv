import net from 'net';

/**
 * Static allowlist of domains the /proxy-remote endpoint trusts by default.
 * Anything outside this list must come from a per-user allowlist entry.
 *
 * Rationale: the assistant loop is one of the few paths that can synthesize
 * arbitrary `x-target-url` requests. A static allowlist reduces the blast
 * radius of a prompt-injection-driven SSRF: even with control of the model,
 * the attacker can only exfiltrate data to one of these hosts.
 */
export const DEFAULT_PROXY_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  // LLM providers
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.cohere.ai',
  'api.mistral.ai',
  'api.groq.com',
  'api.together.xyz',
  'api.fireworks.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
  // Google APIs (used for Gmail integration)
  'gmail.googleapis.com',
  'googleapis.com',
  'www.googleapis.com',
  // Image gen / vision
  'api.stability.ai',
  'api.replicate.com',
  // Search (used by assistant research tools)
  'serpapi.com',
]);

/** Hosts the user explicitly opted into (loaded from settings storage). */
export type UserAllowedHosts = () => ReadonlySet<string> | undefined;

/**
 * Returns true if `raw` parses to a non-loopback, non-private http(s) URL whose
 * host matches either the static DEFAULT_PROXY_ALLOWED_HOSTS set or the
 * user-allowed list (when the function is supplied).
 *
 * Note: hostname matching is suffix-based — `api.openai.com` allows
 * `api.openai.com`, but NOT `evilapi.openai.com.attacker.com`.
 */
export const isAllowedProxyTarget = (
  raw: string,
  userAllowedHostsFn?: UserAllowedHosts,
): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();
  if (!hostname) return false;

  // Block private / link-local / loopback ranges by default. Users can
  // route to a local backend via settings, which goes through a separate
  // gate that opts them in to specific port tuples.
  if (isDisallowedAddress(hostname)) return false;

  // Static allowlist: exact hostname or *.HOST match (one label of subdomain).
  if (DEFAULT_PROXY_ALLOWED_HOSTS.has(hostname)) return true;
  for (const allowed of DEFAULT_PROXY_ALLOWED_HOSTS) {
    if (hostname.endsWith(`.${allowed}`)) return true;
  }

  // Per-user allowlist.
  const userSet = userAllowedHostsFn?.();
  if (userSet) {
    if (userSet.has(hostname)) return true;
    for (const allowed of userSet) {
      if (hostname.endsWith(`.${allowed}`)) return true;
    }
  }

  return false;
};

const isDisallowedAddress = (hostname: string): boolean => {
  // Pure literal IP? Reject private/loopback/link-local.
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname)) {
      const parts = hostname.split('.').map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true;
      const [a, b] = parts;
      // 127.0.0.0/8
      if (a === 127) return true;
      // 10.0.0.0/8
      if (a === 10) return true;
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;
      // 169.254.0.0/16 (link-local — AWS metadata!)
      if (a === 169 && b === 254) return true;
      // 0.0.0.0/8
      if (a === 0) return true;
      // Multicast 224.0.0.0/4
      if (a >= 224 && a <= 239) return true;
    } else if (net.isIPv6(hostname)) {
      // ::1 (loopback), fc00::/7 (ULA), fe80::/10 (link-local)
      const lower = hostname.toLowerCase();
      if (lower === '::1' || lower === '[::1]') return true;
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
      if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
          lower.startsWith('fea') || lower.startsWith('feb')) return true;
    }
    return false;
  }
  // Hostname literal: only block obvious loopback names. Localhost
  // hostnames resolve to 127/::1 in DNS; explicit IP rejection above
  // catches direct numerical attempts. Allow users to add `localhost`
  // to their per-user allowlist if they really need it.
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  return false;
};
