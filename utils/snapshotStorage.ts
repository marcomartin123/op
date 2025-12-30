import { DashboardSnapshot } from '../types';

export type SnapshotSource = 'auto' | 'manual' | 'imported';

export interface StoredSnapshotRecord {
  id: string;
  savedAt: string;
  source: SnapshotSource;
  asset: string;
  snapshot: DashboardSnapshot;
  sizeBytes: number;
}

const DB_NAME = 'trader-dashboard';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

const isIndexedDbAvailable = () => {
  return typeof window !== 'undefined' && !!window.indexedDB;
};

const openSnapshotDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB indisponivel.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB.'));
  });
};

const requestToPromise = <T,>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha em requisicao IndexedDB.'));
  });
};

const transactionDone = (tx: IDBTransaction): Promise<void> => {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha na transacao IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacao IndexedDB abortada.'));
  });
};

const calculateSnapshotSize = (snapshot: DashboardSnapshot): number => {
  try {
    const json = JSON.stringify(snapshot);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }
    return json.length;
  } catch {
    return 0;
  }
};

const buildRecord = (snapshot: DashboardSnapshot, source: SnapshotSource): StoredSnapshotRecord => {
  const savedAt = snapshot.savedAt || new Date().toISOString();
  const recordSnapshot = { ...snapshot, savedAt };
  const idSuffix = Math.random().toString(36).slice(2, 9);
  return {
    id: `${savedAt}-${idSuffix}`,
    savedAt,
    source,
    asset: snapshot.selectedAsset || '',
    snapshot: recordSnapshot,
    sizeBytes: calculateSnapshotSize(recordSnapshot)
  };
};

const sortBySavedAtDesc = (records: StoredSnapshotRecord[]) => {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a.savedAt);
    const bTime = Date.parse(b.savedAt);
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return b.savedAt.localeCompare(a.savedAt);
    }
    return bTime - aTime;
  });
};

export const listSnapshotRecords = async (): Promise<StoredSnapshotRecord[]> => {
  if (!isIndexedDbAvailable()) return [];
  const db = await openSnapshotDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const records = await requestToPromise(store.getAll());
    await transactionDone(tx);
    const normalized = ((records as StoredSnapshotRecord[]) || []).map((record) => {
      if (typeof record.sizeBytes === 'number') return record;
      return {
        ...record,
        sizeBytes: calculateSnapshotSize(record.snapshot)
      };
    });
    return sortBySavedAtDesc(normalized);
  } finally {
    db.close();
  }
};

export const saveSnapshotRecord = async (snapshot: DashboardSnapshot, source: SnapshotSource): Promise<void> => {
  const db = await openSnapshotDb();
  try {
    const record = buildRecord(snapshot, source);
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await requestToPromise(store.put(record));
    await transactionDone(tx);
  } finally {
    db.close();
  }
};

export const deleteSnapshotRecord = async (id: string): Promise<void> => {
  const db = await openSnapshotDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await transactionDone(tx);
  } finally {
    db.close();
  }
};

export const clearSnapshotRecords = async (): Promise<void> => {
  const db = await openSnapshotDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    await transactionDone(tx);
  } finally {
    db.close();
  }
};
