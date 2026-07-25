import { getDb } from './db';
import { appEventBus } from './eventBus';

// ── Types ──────────────────────────────────────────────────────────────

export interface ChatMessageAttachment {
  data: string;
  mimeType: string;
  fileName?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatMessageAttachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

// Stored types (without nested messages, with sessionId FK)
export interface ChatSessionStored {
  id: string;
  title: string;
  updatedAt: number;
}

export interface ChatMessageStored {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments_json: string; // JSON-stringified ChatMessageAttachment[]
  createdAt: number;
}

const SESSIONS_STORE = 'chat_sessions' as const;
const MESSAGES_STORE = 'chat_messages' as const;
const LEGACY_LS_KEY = 'kollektiv_chat_sessions';
const MIGRATION_FLAG_KEY = 'migrated_chat_v2';

// ── Sync cache ─────────────────────────────────────────────────────────

let _sessionsCache: ChatSessionStored[] = [];
let _messagesCache = new Map<string, ChatMessageStored[]>();
let _initialized = false;

/** @internal test hook — resets module state. Not for production use. */
export const _testReset = (): void => {
  _sessionsCache = [];
  _messagesCache = new Map();
  _initialized = false;
};

// ── Boot init — called once from App boot sequence ────────────────────

export async function initChatStore(): Promise<void> {
  if (_initialized) return;

  let alreadyMigrated = false;
  try {
    const db = await getDb();
    alreadyMigrated = !!(await db.get('keyval', MIGRATION_FLAG_KEY));
  } catch {
    // IDB unavailable
  }

  // Try reading from IDB — only load sessions, NOT all messages
  // (messages are loaded on demand via loadRecentMessages / loadMessagesBefore)
  try {
    const db = await getDb();
    _sessionsCache = await db.getAll(SESSIONS_STORE);
    _sessionsCache.sort((a, b) => b.updatedAt - a.updatedAt);

    if (alreadyMigrated) {
      _initialized = true;
      return;
    }
  } catch {
    _sessionsCache = [];
  }

  // One-shot migration from localStorage
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      const sessions: ChatSession[] = JSON.parse(raw);
      // Defensive content coercion (from original code)
      for (const session of sessions) {
        for (const msg of session.messages || []) {
          if (typeof msg.content !== 'string') {
            msg.content = msg.content == null ? '' : String(msg.content);
          }
        }
      }

      const db = await getDb();
      for (const session of sessions) {
        // Write session (without messages)
        const sessionStored: ChatSessionStored = {
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
        };
        await db.add(SESSIONS_STORE, sessionStored).catch(() => {});

        // Write individual messages
        const messages: ChatMessageStored[] = (session.messages || []).map((msg, idx) => ({
          id: `${session.id}-msg-${idx}`,
          sessionId: session.id,
          role: msg.role,
          content: msg.content,
          attachments_json: msg.attachments ? JSON.stringify(msg.attachments) : '[]',
          createdAt: session.updatedAt - (session.messages.length - idx) * 1000, // approximate
        }));
        for (const msg of messages) {
          await db.add(MESSAGES_STORE, msg).catch(() => {});
        }
        _messagesCache.set(session.id, messages);
      }
      _sessionsCache = sessions
        .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const db = await getDb();
    await db.put('keyval', true, MIGRATION_FLAG_KEY).catch(() => {});
  } catch (e) {
    console.error(`[migration] Failed to migrate ${LEGACY_LS_KEY}:`, e);
  }

  _initialized = true;
}

// ── Sync reads ─────────────────────────────────────────────────────────

export function getChatSessionsSync(): ChatSessionStored[] {
  return _sessionsCache;
}

export function getChatMessagesSync(sessionId: string): ChatMessageStored[] {
  return _messagesCache.get(sessionId) || [];
}

// ── Chunked / paginated reads ─────────────────────────────────────────

const CHUNK_SIZE = 50;

/**
 * Load the latest N messages for a session.
 * Returns the messages, total count, and whether older messages exist.
 */
export async function loadRecentMessages(
  sessionId: string,
  limit = CHUNK_SIZE,
): Promise<{
  messages: ChatMessageStored[];
  totalCount: number;
  hasMore: boolean;
}> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(MESSAGES_STORE, 'by_sessionId', sessionId);
    all.sort((a, b) => a.createdAt - b.createdAt);

    const totalCount = all.length;
    const hasMore = all.length > limit;
    const recent = all.slice(-limit);

    // Update the sync cache with just this chunk (not all messages)
    _messagesCache.set(sessionId, recent);

    return { messages: recent, totalCount, hasMore };
  } catch {
    return { messages: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Load messages older than a given timestamp (cursor-based pagination).
 * Returns the batch and whether even older messages exist.
 */
export async function loadMessagesBefore(
  sessionId: string,
  beforeCreatedAt: number,
  limit = CHUNK_SIZE,
): Promise<{
  messages: ChatMessageStored[];
  hasMore: boolean;
}> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(MESSAGES_STORE, 'by_sessionId', sessionId);
    const older = all.filter((m) => m.createdAt < beforeCreatedAt);
    older.sort((a, b) => a.createdAt - b.createdAt);

    const hasMore = older.length > limit;
    const batch = older.slice(-limit);
    return { messages: batch, hasMore };
  } catch {
    return { messages: [], hasMore: false };
  }
}

/** Get the total message count for a session. */
export async function getMessageCount(sessionId: string): Promise<number> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(MESSAGES_STORE, 'by_sessionId', sessionId);
    return all.length;
  } catch {
    return 0;
  }
}

// ── Async reads ────────────────────────────────────────────────────────

export async function loadChatSessions(): Promise<ChatSessionStored[]> {
  try {
    const db = await getDb();
    _sessionsCache = await db.getAll(SESSIONS_STORE);
    _sessionsCache.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    _sessionsCache = [];
  }
  return _sessionsCache;
}

export async function loadChatMessages(sessionId: string): Promise<ChatMessageStored[]> {
  try {
    const db = await getDb();
    const messages = await db.getAllFromIndex(MESSAGES_STORE, 'by_sessionId', sessionId);
    messages.sort((a, b) => a.createdAt - b.createdAt);
    _messagesCache.set(sessionId, messages);
    return messages;
  } catch {
    return [];
  }
}

// ── Mutations ──────────────────────────────────────────────────────────

export async function saveChatSession(session: ChatSession): Promise<void> {
  const now = Date.now();
  const db = await getDb();

  // Defensive content coercion
  for (const msg of session.messages || []) {
    if (typeof msg.content !== 'string') {
      msg.content = msg.content == null ? '' : String(msg.content);
    }
  }

  // Write session metadata
  const sessionStored: ChatSessionStored = {
    id: session.id,
    title: session.title,
    updatedAt: now,
  };

  // Cascade: delete old messages first, then write new ones
  const existingMessages = await db.getAllFromIndex(MESSAGES_STORE, 'by_sessionId', session.id);
  for (const msg of existingMessages) {
    await db.delete(MESSAGES_STORE, msg.id);
  }

  await db.put(SESSIONS_STORE, sessionStored);

  // Write individual messages
  const messages: ChatMessageStored[] = session.messages.map((msg, idx) => ({
    id: `${session.id}-msg-${idx}`,
    sessionId: session.id,
    role: msg.role,
    content: msg.content,
    attachments_json: msg.attachments ? JSON.stringify(msg.attachments) : '[]',
    createdAt: now - (session.messages.length - idx) * 1000,
  }));

  for (const msg of messages) {
    await db.put(MESSAGES_STORE, msg);
  }

  // Update caches
  _sessionsCache = [
    sessionStored,
    ..._sessionsCache.filter((s) => s.id !== session.id),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  _messagesCache.set(session.id, messages);

  // Dual-write to localStorage (flattened back to nested format)
  dualWriteToLocalStorage(
    _sessionsCache.map((s) => ({
      ...s,
      messages: reconstructMessages(_messagesCache.get(s.id) || []),
    }))
  );

  appEventBus.emit('chatSessionsChanged');
}

export async function deleteChatSession(id: string): Promise<void> {
  const db = await getDb();

  // Delete session metadata
  await db.delete(SESSIONS_STORE, id);

  // Delete all messages for this session
  const messages = await db.getAllFromIndex(MESSAGES_STORE, 'by_sessionId', id);
  for (const msg of messages) {
    await db.delete(MESSAGES_STORE, msg.id);
  }

  // Update caches
  _sessionsCache = _sessionsCache.filter((s) => s.id !== id);
  _messagesCache.delete(id);

  // Dual-write
  dualWriteToLocalStorage(
    _sessionsCache.map((s) => ({
      ...s,
      messages: reconstructMessages(_messagesCache.get(s.id) || []),
    }))
  );

  appEventBus.emit('chatSessionsChanged');
}

export async function clearAllChatSessions(): Promise<void> {
  const db = await getDb();
  await db.clear(SESSIONS_STORE);
  await db.clear(MESSAGES_STORE);

  _sessionsCache = [];
  _messagesCache.clear();

  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    // non-fatal
  }

  appEventBus.emit('chatSessionsChanged');
}

// ── Dual-write helper ─────────────────────────────────────────────────

function dualWriteToLocalStorage(sessions: { id: string; title: string; messages: ChatMessage[]; updatedAt: number }[]): void {
  try {
    localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

function reconstructMessages(stored: ChatMessageStored[]): ChatMessage[] {
  return stored.map((msg) => ({
    role: msg.role,
    content: msg.content,
    attachments: msg.attachments_json ? JSON.parse(msg.attachments_json) : undefined,
  }));
}

// ── Backward-compat helper ─────────────────────────────────────────────

/** Reconstruct a full ChatSession (with messages) from the split stores. */
export async function getChatSessionWithMessages(id: string): Promise<ChatSession | null> {
  const session = _sessionsCache.find((s) => s.id === id);
  if (!session) return null;
  const messages = await loadChatMessages(id);
  return {
    ...session,
    messages: reconstructMessages(messages),
  };
}