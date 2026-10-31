import { ListenSchedule, StorageInfo, StorageStatus, Track, UserPlaylist } from '../types';

const DB_NAME = 'ogm-db';
/** v4: force-create `schedules` if a v3 open ran before that store existed. */
const DB_VERSION = 4;
const STORE_NAME = 'tracks';
const PLAYLIST_STORE = 'playlists';
const SCHEDULE_STORE = 'schedules';

function ensureStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
    db.createObjectStore(PLAYLIST_STORE, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(SCHEDULE_STORE)) {
    db.createObjectStore(SCHEDULE_STORE, { keyPath: 'id' });
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      ensureStores(request.result);
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
  const lists = await getAllPlaylists();
  for (const list of lists) {
    if (list.trackIds.includes(id)) {
      await savePlaylist({ ...list, trackIds: list.trackIds.filter((tid) => tid !== id) });
    }
  }
}

function playlistTx<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
        resolve([] as unknown as T);
        return;
      }
      const tx = db.transaction(PLAYLIST_STORE, mode);
      const store = tx.objectStore(PLAYLIST_STORE);
      const req = callback(store);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  });
}

export async function getAllPlaylists(): Promise<UserPlaylist[]> {
  try {
    const records = await playlistTx<UserPlaylist[]>('readonly', (store) => store.getAll());
    return (records || []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function savePlaylist(playlist: UserPlaylist): Promise<void> {
  await playlistTx('readwrite', (store) => store.put(playlist));
}

export async function deletePlaylist(id: string): Promise<void> {
  await playlistTx('readwrite', (store) => store.delete(id));
}

export async function createPlaylist(name: string): Promise<UserPlaylist> {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const playlist: UserPlaylist = {
    id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed || 'Untitled mix',
    trackIds: [],
    createdAt: Date.now(),
  };
  await savePlaylist(playlist);
  return playlist;
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<UserPlaylist | null> {
  const lists = await getAllPlaylists();
  const list = lists.find((p) => p.id === playlistId);
  if (!list) return null;
  if (!list.trackIds.includes(trackId)) {
    list.trackIds = [...list.trackIds, trackId];
    await savePlaylist(list);
  }
  return list;
}

function scheduleTx<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(SCHEDULE_STORE)) {
        reject(new Error('Reminders store is missing. Reload the page to upgrade the library.'));
        return;
      }
      const tx = db.transaction(SCHEDULE_STORE, mode);
      const store = tx.objectStore(SCHEDULE_STORE);
      const req = callback(store);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getAllSchedules(): Promise<ListenSchedule[]> {
  try {
    const records = await scheduleTx<ListenSchedule[]>('readonly', (store) => store.getAll());
    return (records || []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function saveSchedule(schedule: ListenSchedule): Promise<void> {
  await scheduleTx('readwrite', (store) => store.put(schedule));
}

export async function deleteSchedule(id: string): Promise<void> {
  await scheduleTx('readwrite', (store) => store.delete(id));
}

export async function createSchedule(
  partial: Omit<ListenSchedule, 'id' | 'createdAt' | 'lastFiredKey'>
): Promise<ListenSchedule> {
  const trimmed = partial.name.replace(/\s+/g, ' ').trim();
  const schedule: ListenSchedule = {
    ...partial,
    name: trimmed || 'Untitled reminder',
    id: `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  await saveSchedule(schedule);
  return schedule;
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
