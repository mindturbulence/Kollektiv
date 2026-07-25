import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface AssistantNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'assistant' | 'user';
}

interface MemoryEntry {
  id: string;
  fact: string;
  createdAt: number;
}

interface ChatSessionStored {
  id: string;
  title: string;
  updatedAt: number;
}

interface ChatMessageStored {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments_json: string;
  createdAt: number;
}

export interface KollektivDB extends DBSchema {
  // v1 — keep for backward compatibility
  'keyval': {
    key: string;
    value: any;
  };

  // v2 — new stores
  'notes': {
    key: string;
    value: AssistantNote;
    indexes: {
      'by_updatedAt': number;
      'by_source': string;
      'by_createdAt': number;
    };
  };

  'memories': {
    key: string;
    value: MemoryEntry;
    indexes: {
      'by_createdAt': number;
    };
  };

  'chat_sessions': {
    key: string;
    value: ChatSessionStored;
    indexes: {
      'by_updatedAt': number;
    };
  };

  'chat_messages': {
    key: string;
    value: ChatMessageStored;
    indexes: {
      'by_sessionId': string;
      'by_createdAt': number;
    };
  };

  'search_index': {
    key: string;
    value: any;
  };
}

export type StoreName = keyof KollektivDB;

let _dbPromise: Promise<IDBPDatabase<KollektivDB>> | null = null;

export const getDb = (): Promise<IDBPDatabase<KollektivDB>> => {
  if (!_dbPromise) {
    _dbPromise = openDB<KollektivDB>('kollektiv-db', 3, {
      upgrade(db, oldVersion, _newVersion, _transaction) {
        // v1: keyval store
        if (oldVersion < 1) {
          db.createObjectStore('keyval');
        }

        // v2: notes, memories, chat_sessions, chat_messages
        if (oldVersion < 2) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
          notesStore.createIndex('by_source', 'source', { unique: false });
          notesStore.createIndex('by_createdAt', 'createdAt', { unique: false });

          const memoriesStore = db.createObjectStore('memories', { keyPath: 'id' });
          memoriesStore.createIndex('by_createdAt', 'createdAt', { unique: false });

          const sessionsStore = db.createObjectStore('chat_sessions', { keyPath: 'id' });
          sessionsStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });

          const messagesStore = db.createObjectStore('chat_messages', { keyPath: 'id' });
          messagesStore.createIndex('by_sessionId', 'sessionId', { unique: false });
          messagesStore.createIndex('by_createdAt', 'createdAt', { unique: false });
        }

        // v3: search_index for vaultSearch
        if (oldVersion < 3) {
          db.createObjectStore('search_index');
        }
      },
    });
  }
  return _dbPromise;
};

export const getHandle = async <T>(key: string): Promise<T | undefined> => {
  const db = await getDb();
  return db.get('keyval', key);
};

export const setHandle = async (key: string, val: any): Promise<void> => {
  const db = await getDb();
  await db.put('keyval', val, key);
};

export const clearAllHandles = async (): Promise<void> => {
  const db = await getDb();
  await db.clear('keyval');
};