/**
 * Gmail integration tools for the assistant.
 *
 * All tools require Google Identity to be connected
 * (Settings > App > Storage > Authorize Drive).
 */
import type { AssistantTool } from './types';
import { loadLLMSettings } from '../../utils/settingsStorage';
import { isGoogleAuthValid } from '../../utils/googleAuth';
import { UI_STRINGS } from '../../constants/uiStrings';

// ── Helpers ──

/** Try to obtain a valid Google access token, attempting silent refresh if stale. */
async function ensureGoogleToken(): Promise<{ token: string } | string> {
  const identity = loadLLMSettings().googleIdentity;
  if (isGoogleAuthValid(identity)) {
    return { token: identity.accessToken };
  }
  if (!identity?.isConnected) {
    return `Error: ${UI_STRINGS.googleNotConnected}`;
  }
  // Token expired — attempt silent refresh
  try {
    const { trySilentRefreshWithWait } = await import('../../utils/googleAuth');
    const refreshed = await trySilentRefreshWithWait(identity, 5000, 300);
    if (refreshed?.accessToken) {
      return { token: refreshed.accessToken };
    }
  } catch { /* fall through */ }
  return `Error: ${UI_STRINGS.googleSessionExpired}`;
}

/** Blocking, per-action user confirmation for destructive external actions. */
const confirmSensitiveAction = (summary: string): boolean => {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return false;
  }
  return window.confirm(`The assistant wants to:\n\n${summary}\n\nAllow this?`);
};

// ── Tools ──

export const gmailTools: AssistantTool[] = [
  {
    name: 'read_gmail',
    description: 'Read the user\'s Gmail inbox — list recent messages, search by query, or read a specific email\'s full content (headers + body). Requires Google Identity to be connected (Settings > App > Storage > Authorize Drive).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'search', 'read'],
          description: '"list" = recent inbox messages, "search" = search by query, "read" = read full content by message id.',
        },
        query: { type: 'string', description: 'For "search": a Gmail search query (e.g. "from:john subject:invoice"). For "read": the message id to fetch.' },
        maxResults: { type: 'number', description: 'Max messages for list/search (1-20, default 10).' },
      },
      required: ['action'],
    },
    execute: async (args) => {
      const authResult = await ensureGoogleToken();
      if (typeof authResult === 'string') return authResult;
      const token = authResult.token;
      const BASE = '/google-api/gmail/v1/users/me';
      const headers = { Authorization: `Bearer ${token}` };
      try {
        if (args.action === 'list' || args.action === 'search') {
          const q = args.action === 'search' && args.query ? `&q=${encodeURIComponent(String(args.query))}` : '';
          const max = Math.min(Math.max(Number(args.maxResults) || 10, 1), 20);
          const res = await fetch(`${BASE}/messages?maxResults=${max}${q}&fields=messages(id,threadId,snippet,labelIds)`, { headers });
          if (!res.ok) return `Gmail API error: ${res.status} ${res.statusText}${res.status === 401 ? ' — token expired, re-authorize in Settings.' : ''}`;
          if (res.status === 204) return 'No messages found.';
          const data = await res.json();
          if (!data.messages?.length) return 'No messages found.';
          const out = await Promise.all(data.messages.slice(0, max).map(async (m: any) => {
            const detail = await fetch(`${BASE}/messages/${m.id}?format=metadata&fields=id,labelIds,payload/headers,snippet`, { headers }).then(r => r.json()).catch(() => ({}));
            const h = (hds: any[], name: string) => hds?.find((h: any) => h.name === name)?.value || '';
            const hs = detail.payload?.headers || [];
            return `[${m.id}] From: ${h(hs, 'From')} | To: ${h(hs, 'To')} | Subject: ${h(hs, 'Subject')} | Date: ${h(hs, 'Date')} | Labels: ${(m.labelIds || []).join(', ')} | Snippet: ${m.snippet || ''}`;
          }));
          return `Found ${data.messages.length} message(s):\n\n${out.join('\n')}` + (data.nextPageToken ? '\n\n(More results available — use a more specific query.)' : '');
        } else if (args.action === 'read') {
          if (!args.query) return 'Error: provide a message id as the "query" parameter.';
          const res = await fetch(`${BASE}/messages/${encodeURIComponent(String(args.query))}?format=full`, { headers });
          if (!res.ok) return `Gmail API error: ${res.status} ${res.statusText}`;
          const msg = await res.json();
          const h = (name: string) => msg.payload?.headers?.find((x: any) => x.name === name)?.value || '';
          const extractBody = (part: any): string => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              try { return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return '[could not decode body]'; }
            }
            if (part.parts) return part.parts.map(extractBody).filter(Boolean).join('\n---\n');
            return '';
          };
          const body = extractBody(msg.payload || {});
          return `From: ${h('From')}\nTo: ${h('To')}\nDate: ${h('Date')}\nSubject: ${h('Subject')}\n\n${body || '(no plain text body)'}`;
        } else {
          return `Error: unknown action "${args.action}". Use "list", "search", or "read".`;
        }
      } catch (e: any) {
        return `Gmail error: ${e?.message || e}`;
      }
    },
  },
  {
    name: 'send_gmail',
    description: 'Send an email from the user\'s Gmail account (the one connected via Google Identity). Use for composing and sending messages on the user\'s behalf.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address(es). Comma-separate multiple recipients.' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Email body text (plain text).' },
        cc: { type: 'string', description: 'Optional CC recipient(s).' },
        bcc: { type: 'string', description: 'Optional BCC recipient(s).' },
      },
      required: ['to', 'subject', 'body'],
    },
    execute: async (args) => {
      const authResult = await ensureGoogleToken();
      if (typeof authResult === 'string') return authResult;
      const token = authResult.token;
      const to = String(args.to || '');
      const subject = String(args.subject || '');
      if (!confirmSensitiveAction(`Send an email\nTo: ${to}\nSubject: ${subject}`)) {
        return UI_STRINGS.gmailSendDeclined;
      }
      try {
        const body = String(args.body || '');
        const cc = args.cc ? String(args.cc) : '';
        const bcc = args.bcc ? String(args.bcc) : '';
        if (!to) return 'Error: "to" is required.';
        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset="UTF-8"',
          'Content-Transfer-Encoding: 7bit',
        ];
        if (cc) headers.push(`Cc: ${cc}`);
        if (bcc) headers.push(`Bcc: ${bcc}`);
        const raw = headers.join('\r\n') + '\r\n\r\n' + body;
        const b64 = btoa(unescape(encodeURIComponent(raw)));
        const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const res = await fetch('/google-api/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: b64url }),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText);
          return `Failed to send email: ${res.status} ${err}`;
        }
        const result = await res.json();
        return `Email sent successfully. Message id: ${result.id}${result.threadId ? `, thread: ${result.threadId}` : ''}`;
      } catch (e: any) {
        return `Error sending email: ${e?.message || e}`;
      }
    },
  },
  {
    name: 'delete_gmail',
    description: 'Trash or permanently delete an email from Gmail. Requires the message id obtained from read_gmail (action "list" or "search").',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The Gmail message id to act on (from read_gmail).' },
        action: { type: 'string', enum: ['trash', 'delete'], description: '"trash" (default) moves to trash (undoable in Gmail UI). "delete" permanently deletes immediately (irreversible).' },
      },
      required: ['id'],
    },
    execute: async (args) => {
      const authResult = await ensureGoogleToken();
      if (typeof authResult === 'string') return authResult;
      const token = authResult.token;
      const wantsPermanent = args.action === 'delete';
      const summary = wantsPermanent
        ? `PERMANENTLY DELETE (irreversible)\nGmail message: ${String(args.id)}`
        : `Move to trash (undoable in Gmail UI)\nGmail message: ${String(args.id)}`;
      if (!confirmSensitiveAction(summary)) {
        return UI_STRINGS.gmailDeleteDeclined;
      }
      try {
        const msgId = encodeURIComponent(String(args.id));
        const isPermanent = wantsPermanent;
        const url = isPermanent
          ? `/google-api/gmail/v1/users/me/messages/${msgId}`
          : `/google-api/gmail/v1/users/me/messages/${msgId}/trash`;
        const res = await fetch(url, {
          method: isPermanent ? 'DELETE' : 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText);
          return `Failed to ${isPermanent ? 'delete' : 'trash'} message: ${res.status} ${err}`;
        }
        return isPermanent ? `Message ${args.id} permanently deleted.` : `Message ${args.id} moved to trash.`;
      } catch (e: any) {
        return `Error deleting message: ${e?.message || e}`;
      }
    },
  },
];
