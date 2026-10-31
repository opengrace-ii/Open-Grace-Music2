import { StorageInfo, StorageStatus, Track } from '../types';

const DB_NAME = 'ogm-db';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTx<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const req = callback(store);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  });
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export async function getStorageInfo(trackCount: number): Promise<StorageInfo> {
  let usedBytes = 0;
  let quotaBytes = 0;
  let isPersistent = false;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      if (navigator.storage.persisted) {
        isPersistent = await navigator.storage.persisted();
      }
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        usedBytes = est.usage || 0;
        quotaBytes = est.quota || 0;
      }
    } catch {
      // ignore
    }
  }

  return {
    usedBytes,
    quotaBytes,
    isPersistent,
    trackCount,
  };
}

export async function getAllTracksFromDB(): Promise<Track[]> {
  try {
    const records = await runTx<any[]>('readonly', (store) => store.getAll());
    if (!records) return [];

    return records.map((record) => {
      let audioUrl = record.audioUrl;
      if (record.blob) {
        try {
          audioUrl = URL.createObjectURL(record.blob);
        } catch {
          // fallback
        }
      }
      return {
        ...record,
        audioUrl,
      };
    }).sort((a, b) => b.addedAt - a.addedAt);
  } catch (err) {
    console.error('Failed to load tracks from IndexedDB:', err);
    return [];
  }
}

export async function saveMetadataTrackToDB(track: Track): Promise<Track> {
  const record: Track = {
    ...track,
    blob: undefined,
    audioUrl: undefined,
    storageStatus: 'DEVICE_LOCAL',
    sizeBytes: 0,
  };
  await runTx('readwrite', (store) => store.put(record));
  return record;
}

export async function saveTrackToDB(track: Track, blob: Blob): Promise<Track> {
  const isPersisted = await requestPersistentStorage();
  const initialStatus: StorageStatus = isPersisted ? 'PERSISTENT' : 'DEVICE_LOCAL';

  let status: StorageStatus = initialStatus;

  const recordToSave: Track & { blob: Blob } = {
    ...track,
    blob,
    storageStatus: status,
  };

  await runTx('readwrite', (store) => store.put(recordToSave));

  // Honest Verification: Read back from store and verify blob size
  try {
    const verified = await runTx<any>('readonly', (store) => store.get(track.id));
    if (verified && verified.blob && verified.blob.size === blob.size) {
      recordToSave.storageStatus = initialStatus;
    } else {
      recordToSave.storageStatus = 'FAILED';
      await runTx('readwrite', (store) => store.put(recordToSave));
    }
  } catch {
    recordToSave.storageStatus = 'FAILED';
  }

  const audioUrl = URL.createObjectURL(blob);
  return {
    ...recordToSave,
    audioUrl,
  };
}

export async function updateTrackInDB(track: Track): Promise<void> {
  const existing = await runTx<any>('readonly', (store) => store.get(track.id));
  if (existing) {
    const toSave = {
      ...existing,
      ...track,
      blob: existing.blob, // maintain the binary blob
    };
    await runTx('readwrite', (store) => store.put(toSave));
  }
}

export async function deleteTrackFromDB(id: string): Promise<void> {
  await runTx('readwrite', (store) => store.delete(id));
}

export async function toggleFavoriteInDB(id: string): Promise<boolean> {
  const existing = await runTx<any>('readonly', (store) => store.get(id));
  if (existing) {
    const nextFav = !existing.isFavorite;
    existing.isFavorite = nextFav;
    await runTx('readwrite', (store) => store.put(existing));
    return nextFav;
  }
  return false;
}
