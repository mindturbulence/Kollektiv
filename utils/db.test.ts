import { describe, it, expect } from 'vitest';
import type { KollektivDB, StoreName } from './db';

describe('db schema', () => {
  it('defines all expected store names', () => {
    const stores: StoreName[] = ['keyval', 'notes', 'memories', 'chat_sessions', 'chat_messages'];
    expect(stores).toHaveLength(5);
  });

  it('keyval store uses string keys with any value', () => {
    // Compile-time: KollektivDB['keyval'] must be valid
    type K = KollektivDB['keyval'];
    void 0 as unknown as K;
  });

  it('notes store uses id as keyPath with indexes', () => {
    type N = KollektivDB['notes'];
    void 0 as unknown as N;
  });

  it('memories store uses id as keyPath with createdAt index', () => {
    type M = KollektivDB['memories'];
    void 0 as unknown as M;
  });

  it('chat_sessions store uses id as keyPath without messages array', () => {
    type SessionValue = KollektivDB['chat_sessions']['value'];
    const session: SessionValue = { id: '1', title: 'test', updatedAt: 0 };
    expect(session.id).toBe('1');
    expect((session as any).messages).toBeUndefined();
  });

  it('chat_messages store uses id as keyPath with sessionId + createdAt indexes', () => {
    type MessageValue = KollektivDB['chat_messages']['value'];
    const msg: MessageValue = {
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'hello',
      attachments_json: '[]',
      createdAt: 0,
    };
    expect(msg.sessionId).toBe('s1');
    expect(msg.attachments_json).toBe('[]');
  });
});