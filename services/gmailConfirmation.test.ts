import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ASSISTANT_TOOLS } from './assistantTools';

// --- Google auth mock (pretend user is connected) ---
vi.mock('../utils/settingsStorage', () => ({
  loadLLMSettings: vi.fn(() => ({
    googleIdentity: {
      isConnected: true,
      accessToken: 'fake-token-123',
      expiresAt: Date.now() + 3600_000,
      email: 'test@example.com',
    },
  })),
}));

vi.mock('../utils/googleAuth', () => ({
  isGoogleAuthValid: (identity: any) =>
    !!identity?.accessToken && (identity?.expiresAt ?? 0) > Date.now(),
  trySilentRefreshWithWait: vi.fn(async () => null),
}));

describe('Gmail confirmation gate', () => {
  let originalConfirm: typeof window.confirm;

  beforeEach(() => {
    originalConfirm = window.confirm;
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    vi.unstubAllGlobals();
  });

  it('send_gmail blocks the network call when user declines', async () => {
    window.confirm = vi.fn(() => false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'send_gmail')!;
    const result = await tool.execute(
      { to: 'a@b.com', subject: 'hi', body: 'hello' },
      {} as any,
    );

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatch(/declined/i);
  });

  it('send_gmail proceeds when user confirms', async () => {
    window.confirm = vi.fn(() => true);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'm1', threadId: 't1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'send_gmail')!;
    const result = await tool.execute(
      { to: 'a@b.com', subject: 'hi', body: 'hello' },
      {} as any,
    );

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/Email sent/i);
  });

  it('delete_gmail(trash) blocks when user declines', async () => {
    window.confirm = vi.fn(() => false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'delete_gmail')!;
    const result = await tool.execute(
      { id: 'm1', action: 'trash' },
      {} as any,
    );

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatch(/declined/i);
  });

  it('delete_gmail(delete) shows a permanent warning label', async () => {
    window.confirm = vi.fn(() => false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'delete_gmail')!;
    await tool.execute({ id: 'm1', action: 'delete' }, {} as any);

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/PERMANENT/i),
    );
  });

  it('delete_gmail(trash) shows undoable label, not permanent', async () => {
    window.confirm = vi.fn(() => false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'delete_gmail')!;
    await tool.execute({ id: 'm1', action: 'trash' }, {} as any);

    expect(window.confirm).not.toHaveBeenCalledWith(
      expect.stringMatching(/PERMANENT/i),
    );
  });
});
