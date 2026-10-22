/**
 * db.ts
 * IndexedDB persistence layer with atomic commit support for finalized raffle sessions.
 *
 * Database: "babyhouse-lucky-draw"  version: 2
 * Object stores:
 *   settings     – key/value app settings (keyPath: "key")
 *   inputData    – single record with the current participant dataset (keyPath: "id")
 *   sessions     – DrawSession records (keyPath: "id")
 *   winners      – WinnerRecord records (keyPath: "id"), index on sessionId
 *   pendingDraw  – in-flight draw session awaiting animation completion (keyPath: "id")
 */

import type {
  AppSettings,
  DrawSession,
  PendingDrawData,
  PersistedInputData,
  WinnerRecord,
} from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = 'babyhouse-lucky-draw';
const DB_VERSION = 2;

const STORE_SETTINGS = 'settings';
const STORE_INPUT = 'inputData';
const STORE_SESSIONS = 'sessions';
const STORE_WINNERS = 'winners';
const STORE_PENDING = 'pendingDraw';

// ─── Open DB ─────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_INPUT)) {
        db.createObjectStore(STORE_INPUT, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_WINNERS)) {
        const store = db.createObjectStore(STORE_WINNERS, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

function tx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode = 'readonly'
): IDBTransaction {
  return db.transaction(stores, mode);
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await openDB();
  const t = tx(db, STORE_SETTINGS, 'readwrite');
  const store = t.objectStore(STORE_SETTINGS);
  await req(store.put({ key: 'appSettings', ...settings }));
}

export async function loadSettings(): Promise<AppSettings | null> {
  const db = await openDB();
  const t = tx(db, STORE_SETTINGS);
  const store = t.objectStore(STORE_SETTINGS);
  const record = await req<{ key: string } & AppSettings>(store.get('appSettings'));
  if (!record) return null;
  const { key: _key, ...settings } = record;
  return settings as AppSettings;
}

// ─── Input data ──────────────────────────────────────────────────────────────

export async function saveInputData(data: PersistedInputData): Promise<void> {
  const db = await openDB();
  const t = tx(db, STORE_INPUT, 'readwrite');
  const store = t.objectStore(STORE_INPUT);
  await req(store.put({ id: 'current', ...data }));
}

export async function loadInputData(): Promise<PersistedInputData | null> {
  const db = await openDB();
  const t = tx(db, STORE_INPUT);
  const store = t.objectStore(STORE_INPUT);
  const record = await req<({ id: string } & PersistedInputData) | undefined>(
    store.get('current')
  );
  if (!record) return null;
  const { id: _id, ...data } = record;
  return data as PersistedInputData;
}

export async function clearInputData(): Promise<void> {
  const db = await openDB();
  const t = tx(db, STORE_INPUT, 'readwrite');
  const store = t.objectStore(STORE_INPUT);
  await req(store.delete('current'));
}

// ─── Pending Draw (Pre-animation persistence) ────────────────────────────────

export async function savePendingDraw(session: DrawSession, winners: WinnerRecord[]): Promise<void> {
  const db = await openDB();
  const t = tx(db, STORE_PENDING, 'readwrite');
  const store = t.objectStore(STORE_PENDING);
  const data: PendingDrawData = {
    id: 'current',
    session,
    winners,
    createdAt: new Date().toISOString(),
  };
  await req(store.put(data));
}

export async function loadPendingDraw(): Promise<PendingDrawData | null> {
  const db = await openDB();
  const t = tx(db, STORE_PENDING);
  const store = t.objectStore(STORE_PENDING);
  const record = await req<PendingDrawData | undefined>(store.get('current'));
  return record ?? null;
}

export async function clearPendingDraw(): Promise<void> {
  const db = await openDB();
  const t = tx(db, STORE_PENDING, 'readwrite');
  const store = t.objectStore(STORE_PENDING);
  await req(store.delete('current'));
}

/**
 * Atomically commits a completed draw session and its winners to history,
 * and clears the pending draw store in the same transaction.
 */
export async function commitPendingDraw(
  session: DrawSession,
  winners: WinnerRecord[]
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_SESSIONS, STORE_WINNERS, STORE_PENDING], 'readwrite');

    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);

    const sessionStore = t.objectStore(STORE_SESSIONS);
    const winnerStore = t.objectStore(STORE_WINNERS);
    const pendingStore = t.objectStore(STORE_PENDING);

    sessionStore.put(session);
    for (const w of winners) {
      winnerStore.put(w);
    }
    pendingStore.delete('current');
  });
}

// ─── Draw sessions & Winners (Completed only) ────────────────────────────────

export async function saveSession(session: DrawSession): Promise<void> {
  const db = await openDB();
  const t = tx(db, STORE_SESSIONS, 'readwrite');
  const store = t.objectStore(STORE_SESSIONS);
  await req(store.put(session));
}

export async function loadSessions(): Promise<DrawSession[]> {
  const db = await openDB();
  const t = tx(db, STORE_SESSIONS);
  const store = t.objectStore(STORE_SESSIONS);
  return req<DrawSession[]>(store.getAll());
}

export async function saveWinners(winners: WinnerRecord[]): Promise<void> {
  if (winners.length === 0) return;
  const db = await openDB();
  const t = tx(db, STORE_WINNERS, 'readwrite');
  const store = t.objectStore(STORE_WINNERS);
  await Promise.all(winners.map((w) => req(store.put(w))));
}

export async function loadWinners(): Promise<WinnerRecord[]> {
  const db = await openDB();
  const t = tx(db, STORE_WINNERS);
  const store = t.objectStore(STORE_WINNERS);
  return req<WinnerRecord[]>(store.getAll());
}

export async function clearHistory(): Promise<void> {
  const db = await openDB();
  const t = tx(db, [STORE_SESSIONS, STORE_WINNERS, STORE_PENDING], 'readwrite');
  await Promise.all([
    req(t.objectStore(STORE_SESSIONS).clear()),
    req(t.objectStore(STORE_WINNERS).clear()),
    req(t.objectStore(STORE_PENDING).clear()),
  ]);
}

// ─── Convenience: load all history ───────────────────────────────────────────

export interface HistoryData {
  sessions: DrawSession[];
  winners: WinnerRecord[];
  pending: PendingDrawData | null;
}

export async function loadHistory(): Promise<HistoryData> {
  const [sessions, winners, pending] = await Promise.all([
    loadSessions(),
    loadWinners(),
    loadPendingDraw(),
  ]);
  return { sessions, winners, pending };
}

// ─── Highest session number ───────────────────────────────────────────────────

export async function getNextSessionNumber(): Promise<number> {
  const sessions = await loadSessions();
  if (sessions.length === 0) return 1;
  return Math.max(...sessions.map((s) => s.sessionNumber)) + 1;
}
