import net from 'net';
import { bareHost, isPublicAddress } from './captureUrlValidation';

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

/**
 * Pure predicate: does this hostname resolve to (or look like) a private,
 * loopback, or link-local address? Exported separately from
 * `isAllowedProxyTarget` so other server-side routes that fetch an
 * arbitrary caller-supplied URL (e.g. the RSS reach channel) can reuse the
 * SSRF check without pulling in `/proxy-remote`'s host allowlist, which
 * exists for a different purpose (bounding blast radius for model-controlled
 * proxy targets specifically).
 */
export const isDisallowedAddress = (hostname: string): boolean => {
  // URL.hostname keeps IPv6 brackets ("[::1]"), which net.isIP rejects, so strip them first.
  const host = bareHost(hostname);
  // IP literal: only public unicast passes (covers CGNAT, IPv4-mapped/NAT64 IPv6, reserved ranges).
  if (net.isIP(host)) return !isPublicAddress(host);
  // Hostname literal: only block obvious loopback names; no DNS lookup here, so a public name
  // that resolves privately still passes (scrapers use resolvePublicAddress for that). Users can
  // add `localhost` to their per-user allowlist if they really need it.
  return host === 'localhost' || host.endsWith('.localhost');
};
