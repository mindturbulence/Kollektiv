import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initChatStore,
  getChatSessionsSync,
  getChatMessagesSync,
  loadChatSessions,
  saveChatSession,
  deleteChatSession,
  clearAllChatSessions,
  getChatSessionWithMessages,
  _testReset,
  ChatSession,
} from './chatStorage';

const _store = vi.hoisted(() => new Map<string, any>());
const _lsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('./db', () => ({
  getDb: vi.fn(() =>
    Promise.resolve({
      get: async (table: string, key: string) => _store.get(`${table}:${key}`),
      put: async (table: string, value: any) => { _store.set(`${table}:${value.id}`, value); },
      add: async (table: string, value: any) => { _store.set(`${table}:${value.id}`, value); },
      delete: async (table: string, key: string) => { _store.delete(`${table}:${key}`); },
      getAll: async (table: string) => {
        const items: any[] = [];
        for (const [k, v] of _store) if (k.startsWith(`${table}:`)) items.push(v);
        return items;
      },
      getAllFromIndex: async (table: string, index: string, value: string) => {
        if (index === 'by_sessionId') {
          const items: any[] = [];
          for (const [k, v] of _store) {
            if (k.startsWith(`${table}:`) && v.sessionId === value) items.push(v);
          }
          return items;
        }
        return [];
      },
      clear: async (table: string) => {
        for (const k of _store.keys()) if (k.startsWith(`${table}:`)) _store.delete(k);
      },
    })
  ),
}));

vi.mock('./eventBus', () => ({
  appEventBus: { emit: vi.fn(), on: vi.fn(() => () => {}), off: vi.fn() },
}));

const _idCounter = vi.hoisted(() => ({ value: 0 }));

beforeEach(() => {
  _testReset();
  vi.clearAllMocks();
  _store.clear();
  _lsStore.clear();
  _idCounter.value = 0;
  (globalThis as any).localStorage = {
    getItem: (k: string) => _lsStore.get(k) ?? null,
    setItem: (k: string, v: string) => { _lsStore.set(k, v); },
    removeItem: (k: string) => { _lsStore.delete(k); },
    clear: () => _lsStore.clear(),
  };
});

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: `session-${++_idCounter.value}`,
    title: 'Test Session',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('chatStorage round-trip', () => {
  // ── Session metadata ──

  it('saveChatSession + getChatSessionsSync returns session metadata', async () => {
    await initChatStore();
    const session = makeSession();
    await saveChatSession(session);

    const sessions = getChatSessionsSync();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
    expect(sessions[0].title).toBe(session.title);
    // SessionStored must NOT contain messages
    expect((sessions[0] as any).messages).toBeUndefined();
  });

  it('saveChatSession + loadChatSessions returns sessions sorted by updatedAt (newest first)', async () => {
    await initChatStore();
    const old = makeSession({ title: 'Old' });
    await saveChatSession(old);
    // Ensure distinct timestamps between saves
    await new Promise(r => setTimeout(r, 5));
    const recent = makeSession({ title: 'Recent' });
    await saveChatSession(recent);

    const sessions = await loadChatSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].title).toBe('Recent');
    expect(sessions[1].title).toBe('Old');
  });

  // ── Messages round-trip ──

  it('saveChatSession stores messages in separate store', async () => {
    await initChatStore();
    const session = makeSession();
    await saveChatSession(session);

    const storedMessages = getChatMessagesSync(session.id);
    expect(storedMessages).toHaveLength(2);
    expect(storedMessages[0].role).toBe('user');
    expect(storedMessages[0].content).toBe('Hello');
    expect(storedMessages[0].sessionId).toBe(session.id);
    expect(storedMessages[1].role).toBe('assistant');
    expect(storedMessages[1].content).toBe('Hi there!');
  });

  it('getChatSessionWithMessages reconstructs full ChatSession', async () => {
    await initChatStore();
    const session = makeSession({
      messages: [
        { role: 'user', content: 'What is TDD?' },
        { role: 'assistant', content: 'Test driven development.' },
      ],
    });
    await saveChatSession(session);

    const reconstructed = await getChatSessionWithMessages(session.id);
    expect(reconstructed).not.toBeNull();
    expect(reconstructed!.id).toBe(session.id);
    expect(reconstructed!.messages).toHaveLength(2);
    expect(reconstructed!.messages[0].content).toBe('What is TDD?');
    expect(reconstructed!.messages[1].content).toBe('Test driven development.');
  });

  it('saves attachments as JSON string and round-trips correctly', async () => {
    await initChatStore();
    const session = makeSession({
      messages: [
        {
          role: 'user',
          content: 'Check this image',
          attachments: [{ data: 'base64...', mimeType: 'image/png', fileName: 'test.png' }],
        },
      ],
    });
    await saveChatSession(session);

    const storedMessages = getChatMessagesSync(session.id);
    expect(storedMessages[0].attachments_json).toBe(
      JSON.stringify([{ data: 'base64...', mimeType: 'image/png', fileName: 'test.png' }])
    );

    const reconstructed = await getChatSessionWithMessages(session.id);
    expect(reconstructed!.messages[0].attachments).toHaveLength(1);
    expect(reconstructed!.messages[0].attachments![0].fileName).toBe('test.png');
  });

  // ── Cascade delete ──

  it('deleteChatSession removes session and all its messages', async () => {
    await initChatStore();
    const session = makeSession();
    // Add a second session to verify isolation
    const other = makeSession({ id: 'other-session' });
    await saveChatSession(session);
    await saveChatSession(other);

    await deleteChatSession(session.id);

    const sessions = getChatSessionsSync();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(other.id);
    expect(getChatMessagesSync(session.id)).toHaveLength(0);
    expect(getChatMessagesSync(other.id)).toHaveLength(2);
  });

  it('deleteChatSession of unknown id is safe', async () => {
    await initChatStore();
    await expect(deleteChatSession('nonexistent')).resolves.toBeUndefined();
  });

  // ── Clear all ──

  it('clearAllChatSessions removes all sessions and messages', async () => {
    await initChatStore();
    await saveChatSession(makeSession());
    await saveChatSession(makeSession());

    await clearAllChatSessions();

    expect(getChatSessionsSync()).toHaveLength(0);
  });

  // ── Content coercion ──

  it('coerces non-string message content to string', async () => {
    await initChatStore();
    const session = makeSession({
      messages: [
        { role: 'user', content: null as any },
        { role: 'assistant', content: 42 as any },
      ],
    });
    await saveChatSession(session);

    const storedMessages = getChatMessagesSync(session.id);
    expect(storedMessages[0].content).toBe('');
    expect(storedMessages[1].content).toBe('42');
  });

  // ── Idempotent save ──

  it('saveChatSession overwrites existing session messages', async () => {
    await initChatStore();
    const session = makeSession({ id: 'stable-id', messages: [{ role: 'user', content: 'v1' }] });
    await saveChatSession(session);

    // Save again with different messages
    session.messages = [
      { role: 'user', content: 'v2' },
      { role: 'assistant', content: 'response' },
    ];
    await saveChatSession(session);

    const storedMessages = getChatMessagesSync('stable-id');
    expect(storedMessages).toHaveLength(2);
    expect(storedMessages[0].content).toBe('v2');
    // Old messages should be gone
    expect(storedMessages.map((m) => m.content)).not.toContain('v1');
  });

  // ── Dual-write to localStorage ──

  describe('dual-write contract', () => {
    const LEGACY_KEY = 'kollektiv_chat_sessions';

    it('saveChatSession writes the legacy nested-format to localStorage', async () => {
      await initChatStore();
      const session = makeSession({
        id: 'ls-test-1',
        title: 'Legacy Test',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      });

      await saveChatSession(session);

      const ls = localStorage.getItem(LEGACY_KEY);
      expect(ls).not.toBeNull();
      const parsed = JSON.parse(ls!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('ls-test-1');
      expect(parsed[0].title).toBe('Legacy Test');
      // Legacy format has nested messages array
      expect(Array.isArray(parsed[0].messages)).toBe(true);
      expect(parsed[0].messages).toHaveLength(2);
      expect(parsed[0].messages[0].role).toBe('user');
      expect(parsed[0].messages[0].content).toBe('Hello');
    });

    it('localStorage update reflects the latest messages after a second save', async () => {
      await initChatStore();
      const session = makeSession({
        id: 'ls-test-2',
        messages: [{ role: 'user', content: 'first' }],
      });
      await saveChatSession(session);

      session.messages = [{ role: 'user', content: 'second' }];
      await saveChatSession(session);

      const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY)!);
      const target = parsed.find((s: any) => s.id === 'ls-test-2');
      expect(target.messages).toHaveLength(1);
      expect(target.messages[0].content).toBe('second');
    });

    it('deleteChatSession removes session from localStorage', async () => {
      await initChatStore();
      await saveChatSession(makeSession({ id: 'to-keep' }));
      await saveChatSession(makeSession({ id: 'to-delete' }));

      await deleteChatSession('to-delete');

      const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY)!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('to-keep');
    });

    it('clearAllChatSessions removes the localStorage key', async () => {
      await initChatStore();
      await saveChatSession(makeSession({ id: 'clear-1' }));

      expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
      await clearAllChatSessions();
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });
  });

  // ── Idempotency ──

  it('does not re-read localStorage on second call (same-session early return)', async () => {
    const legacyData = [{ id: 'cs1', title: 'legacy', updatedAt: 100, messages: [{ role: 'user', content: 'hi' }] }];
    _lsStore.set('kollektiv_chat_sessions', JSON.stringify(legacyData));

    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem');

    await initChatStore();
    expect(getItemSpy).toHaveBeenCalledWith('kollektiv_chat_sessions');
    expect(getChatSessionsSync()).toHaveLength(1);
    getItemSpy.mockClear();

    await initChatStore();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(getChatSessionsSync()).toHaveLength(1);
  });

  it('does not re-migrate after _testReset when migration flag exists', async () => {
    const legacyData = [{ id: 'cs2', title: 'persisted', updatedAt: 200, messages: [{ role: 'user', content: 'persist' }] }];
    _lsStore.set('kollektiv_chat_sessions', JSON.stringify(legacyData));
    await initChatStore();
    expect(getChatSessionsSync()).toHaveLength(1);

    _store.set('keyval:migrated_chat_v2', true);

    _testReset();
    _lsStore.clear();

    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem');

    await initChatStore();
    expect(getItemSpy).not.toHaveBeenCalledWith('kollektiv_chat_sessions');
    expect(getChatSessionsSync()).toHaveLength(1);
    expect(getChatSessionsSync()[0].title).toBe('persisted');
  });
});