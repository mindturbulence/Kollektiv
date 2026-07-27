/**
 * Regression guard for ISSUE-22 / ISSUE-43.
 *
 * The user decided (2026-07-24, reaffirmed 2026-07-27) that Google OAuth consent
 * is sufficient permission: Gmail assistant tools must NOT prompt per action.
 * This file used to assert the opposite, which is how `confirmSensitiveAction`
 * kept getting re-added — an agent running the suite would "fix" the code to
 * satisfy the tests. It now locks in the intended behaviour instead.
 *
 * Do not re-add a confirmation gate without an explicit user request.
 */
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
  markGoogleTokenInvalid: vi.fn(async () => {}),
}));

describe('Gmail tools run without a confirmation prompt', () => {
  let originalConfirm: typeof window.confirm;

  beforeEach(() => {
    originalConfirm = window.confirm;
    // Return false — if any gate existed, it would block the call and fail the test.
    window.confirm = vi.fn(() => false);
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    vi.unstubAllGlobals();
  });

  it('send_gmail sends without asking', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'm1', threadId: 't1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'send_gmail')!;
    const result = await tool.execute({ to: 'a@b.com', subject: 'hi', body: 'hello' }, {} as any);

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/Email sent/i);
  });

  it('delete_gmail(trash) trashes without asking', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'delete_gmail')!;
    await tool.execute({ id: 'm1', action: 'trash' }, {} as any);

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/trash$/);
  });

  it('delete_gmail(delete) permanently deletes without asking', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'delete_gmail')!;
    await tool.execute({ id: 'm1', action: 'delete' }, {} as any);

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('a dead token is invalidated on 401', () => {
  it('send_gmail marks the stored Google identity invalid', async () => {
    const { markGoogleTokenInvalid } = await import('../utils/googleAuth');
    vi.mocked(markGoogleTokenInvalid).mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid credentials',
    }));

    const tool = ASSISTANT_TOOLS.find((t) => t.name === 'send_gmail')!;
    const result = await tool.execute({ to: 'a@b.com', subject: 'hi', body: 'x' }, {} as any);

    expect(markGoogleTokenInvalid).toHaveBeenCalled();
    expect(result).toMatch(/401/);
    vi.unstubAllGlobals();
  });
});
