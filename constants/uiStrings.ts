/**
 * User-facing strings reused across the app.
 *
 * Rule of thumb for adding to this file:
 *  - Only add strings that appear in 2+ distinct files/components.
 *  - One-off contextual messages should stay inline at their call site.
 *
 * Naming: SNAKE_UPPER_CASE for string keys.
 */

/** Used by Google OAuth error paths in services, settings UI, and the OAuth callback. */
export const UI_STRINGS = {
  // ── Google OAuth ───────────────────────────────────────────────────
  googleNotConnected:
    'No Google Identity connected. Go to Settings > Integrations > Google and authorize your account.',
  googleSessionExpired:
    'Your Google session has expired and could not be refreshed. Go to Settings > Integrations > Google and re-authenticate.',
  googleSessionExpiredReconnecting: 'Your Google session has expired. Reconnecting...',
  googleConnectFirst: 'Connect your Google account first.',
  googleRefreshing: 'Refreshing Google session...',

  // ── Gmail tool returns (sent back to the language model) ───────────
  gmailSendDeclined: 'User declined: the email was NOT sent. Do not retry unless the user explicitly asks again.',
  gmailDeleteDeclined: 'User declined: the message was NOT modified. Do not retry unless the user explicitly asks again.',

  // ── Proxy denial (server-side) ────────────────────────────────────
  proxyTargetNotAllowed:
    'Target host is not in the proxy allowlist. Add the host in Settings > Integrations, or route through a configured backend.',
} as const;

export type UiStringKey = keyof typeof UI_STRINGS;
