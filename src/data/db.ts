/**
 * Ключ-значение поверх IndexedDB без зависимостей.
 * Если IndexedDB недоступен (приватный режим, старая прошивка) —
 * прозрачно падаем на localStorage, чтобы прогресс всё равно сохранялся.
 */

const DB_NAME = 'learn-anatomy';
const DB_VERSION = 1;
const STORE = 'kv';
const LS_PREFIX = 'learn-anatomy:';

let dbPromise: Promise<IDBDatabase> | null = null;
let useFallback = false;

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Если другая вкладка попросит апгрейд — не держим соединение.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB: ошибка открытия'));
    req.onblocked = () => reject(new Error('IndexedDB: открытие заблокировано другой вкладкой'));
  });
  return dbPromise;
}

function lsGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // квота кончилась или хранилище заблокировано — молча пропускаем
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (useFallback || !hasIndexedDb()) return lsGet<T>(key);
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    useFallback = true;
    return lsGet<T>(key);
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (useFallback || !hasIndexedDb()) {
    lsSet(key, value);
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    useFallback = true;
    lsSet(key, value);
  }
}

export async function kvDelete(key: string): Promise<void> {
  if (useFallback || !hasIndexedDb()) {
    try {
      localStorage.removeItem(LS_PREFIX + key);
    } catch {
      /* пусто */
    }
    return;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    useFallback = true;
  }
}

/** Диагностика для экрана настроек. */
export function storageBackend(): 'indexeddb' | 'localstorage' {
  return useFallback || !hasIndexedDb() ? 'localstorage' : 'indexeddb';
}

/**
 * Просим браузер не вычищать наши данные при нехватке места.
 * Без этого Android может стереть прогресс вместе с кэшем.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false;
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    if (typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch {
    /* не поддерживается */
  }
  return false;
}

/** Сколько места занято/доступно — показываем в настройках. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
