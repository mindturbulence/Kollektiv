import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROXY_ALLOWED_HOSTS,
  isAllowedProxyTarget,
} from './proxyTargetValidation';

describe('isAllowedProxyTarget', () => {
  describe('URL parseability', () => {
    it('rejects malformed URLs', () => {
      expect(isAllowedProxyTarget('not-a-url')).toBe(false);
      expect(isAllowedProxyTarget('')).toBe(false);
    });

    it('rejects non-http(s) protocols', () => {
      expect(isAllowedProxyTarget('file:///etc/passwd')).toBe(false);
      expect(isAllowedProxyTarget('ftp://example.com/x')).toBe(false);
      expect(isAllowedProxyTarget('javascript:alert(1)')).toBe(false);
      expect(isAllowedProxyTarget('data:text/plain,hello')).toBe(false);
    });
  });

  describe('static allowlist', () => {
    it('allows URLs whose host is in DEFAULT_PROXY_ALLOWED_HOSTS', () => {
      for (const host of DEFAULT_PROXY_ALLOWED_HOSTS) {
        expect(isAllowedProxyTarget(`https://${host}/v1/chat`)).toBe(true);
      }
    });

    it('allows one-level subdomains of an allowed host', () => {
      expect(isAllowedProxyTarget('https://api.openai.com/v1/chat')).toBe(true);
      expect(isAllowedProxyTarget('https://beta.api.openai.com/v1/chat')).toBe(true);
    });

    it('rejects lookalike domains that share a TLD with an allowed host', () => {
      // evil.com pretending to be openai
      expect(isAllowedProxyTarget('https://openai.com.attacker.com/x')).toBe(false);
      // subdomain impersonation: attacker-takes-over-subdomain.attacker.com
      expect(isAllowedProxyTarget('https://api.openai.com.attacker.com/x')).toBe(false);
    });

    it('rejects arbitrary user-input hosts not on the allowlist', () => {
      expect(isAllowedProxyTarget('https://example.com/x')).toBe(false);
      expect(isAllowedProxyTarget('https://my-llm-server.example.org/x')).toBe(false);
    });
  });

  describe('private/loopback IP blocking', () => {
    it('blocks IPv4 loopback', () => {
      expect(isAllowedProxyTarget('http://127.0.0.1:11434/api')).toBe(false);
      expect(isAllowedProxyTarget('http://127.5.5.5:80/')).toBe(false);
    });

    it('blocks IPv4 private ranges (10/8, 172.16/12, 192.168/16)', () => {
      expect(isAllowedProxyTarget('http://10.0.0.5/x')).toBe(false);
      expect(isAllowedProxyTarget('http://172.16.0.1/x')).toBe(false);
      expect(isAllowedProxyTarget('http://172.24.5.5/x')).toBe(false);
      expect(isAllowedProxyTarget('http://172.31.255.255/x')).toBe(false);
      expect(isAllowedProxyTarget('http://192.168.1.1/x')).toBe(false);
    });

    it('blocks the AWS metadata link-local 169.254.169.254', () => {
      expect(isAllowedProxyTarget('http://169.254.169.254/latest/meta-data/')).toBe(false);
    });

    it('blocks 0.0.0.0/8 broad-cast loopback', () => {
      expect(isAllowedProxyTarget('http://0.0.0.0/x')).toBe(false);
    });

    it('blocks IPv6 loopback ::1', () => {
      expect(isAllowedProxyTarget('http://[::1]/x')).toBe(false);
    });

    it('blocks IPv6 unique-local fc00::/7', () => {
      expect(isAllowedProxyTarget('http://[fc00::1]/x')).toBe(false);
      expect(isAllowedProxyTarget('http://[fd12:3456::1]/x')).toBe(false);
    });

    it('blocks IPv6 link-local fe80::/10', () => {
      expect(isAllowedProxyTarget('http://[fe80::1]/x')).toBe(false);
      expect(isAllowedProxyTarget('http://[feb0::1]/x')).toBe(false);
    });

    it('blocks the literal hostname "localhost"', () => {
      expect(isAllowedProxyTarget('http://localhost:11434/api')).toBe(false);
      expect(isAllowedProxyTarget('http://api.localhost/x')).toBe(false);
    });

    it('blocks IPv4 multicast 224.0.0.0/4', () => {
      expect(isAllowedProxyTarget('http://224.0.0.1/x')).toBe(false);
      expect(isAllowedProxyTarget('http://239.255.255.250/x')).toBe(false);
    });
  });

  describe('user allowlist', () => {
    it('honors a user-added host via the callback', () => {
      const userSet = new Set(['my-custom-llm.example']);
      expect(isAllowedProxyTarget('https://my-custom-llm.example/v1/x', () => userSet)).toBe(true);
    });

    it('honors a user-added host subdomain via the callback', () => {
      const userSet = new Set(['example.com']);
      expect(isAllowedProxyTarget('https://api.example.com/v1/x', () => userSet)).toBe(true);
    });

    it('rejects user-allowed host for unallowed private IP tunneling', () => {
      // Even when on user allowlist, private IPs are still blocked.
      const userSet = new Set(['192.168.1.10']);
      expect(isAllowedProxyTarget('http://192.168.1.10/x', () => userSet)).toBe(false);
    });

    it('falls through when no callback is supplied', () => {
      // example.com is not in static allowlist and no user list supplied
      expect(isAllowedProxyTarget('https://example.com/x')).toBe(false);
    });
  });
});
