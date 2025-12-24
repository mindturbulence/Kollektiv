import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface KollektivDB extends DBSchema {
  'keyval': {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<KollektivDB>>;

const getDb = (): Promise<IDBPDatabase<KollektivDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<KollektivDB>('kollektiv-db', 1, {
      upgrade(db) {
        db.createObjectStore('keyval');
      },
    });
  }
  return dbPromise;
};

export const getHandle = async <T>(key: string): Promise<T | undefined> => {
  const db = await getDb();
  return db.get('keyval', key);
};

export const setHandle = async (key: string, val: any): Promise<void> => {
  const db = await getDb();
  await db.put('keyval', val, key);
};

export const delHandle = async (key: string): Promise<void> => {
  const db = await getDb();
  await db.delete('keyval', key);
};

export const clearAllHandles = async (): Promise<void> => {
  const db = await getDb();
  await db.clear('keyval');
};