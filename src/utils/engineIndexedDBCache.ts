/**
 * Persistent IndexedDB Storage for WebAssembly Engine Components.
 * 
 * Stores WebAssembly binaries (.wasm), runtime scripts (.js), and worker threads
 * directly inside IndexedDB for 100% offline persistence, fast zero-copy loading,
 * and resistance to CacheStorage eviction or iframe restrictions.
 */

export const ENGINE_IDB_DATABASE_NAME = 'engine_components_v1';
export const ENGINE_IDB_STORE_NAME = 'components';

export interface StoredEngineComponent {
  key: string;
  normalizedKey: string;
  data: ArrayBuffer;
  mimeType: string;
  sizeBytes: number;
  timestamp: number;
  label?: string;
}

export interface EngineComponentMeta {
  key: string;
  normalizedKey: string;
  mimeType: string;
  sizeBytes: number;
  timestamp: number;
  label?: string;
}

export interface EngineCacheStats {
  isSupported: boolean;
  itemCount: number;
  totalSizeBytes: number;
  formattedSize: string;
  cachedKeys: string[];
  components: EngineComponentMeta[];
  storageType: 'indexeddb';
}

/**
 * Checks if IndexedDB is available and usable in the current browser environment.
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      'indexedDB' in window &&
      window.indexedDB !== null &&
      typeof window.indexedDB.open === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL or path to a canonical component key.
 * Example: 'http://localhost:3000/ffmpeg/core/ffmpeg-core.wasm?v=1' -> 'ffmpeg/core/ffmpeg-core.wasm'
 */
export function normalizeComponentKey(key: string): string {
  try {
    if (key.startsWith('http://') || key.startsWith('https://')) {
      const url = new URL(key);
      return url.pathname.replace(/^\/+/, '');
    }
  } catch {
    // ignore URL parsing error
  }
  return key.replace(/^\.?\/+/, '').split('?')[0].split('#')[0];
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens or reuses the IndexedDB database instance.
 */
export function openEngineDB(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(ENGINE_IDB_DATABASE_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ENGINE_IDB_STORE_NAME)) {
        const store = db.createObjectStore(ENGINE_IDB_STORE_NAME, { keyPath: 'key' });
        store.createIndex('normalizedKey', 'normalizedKey', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB engine database'));
    };
  });

  return dbPromise;
}

/**
 * Retrieves an engine component binary from IndexedDB.
 * Checks both the exact key and the normalized key.
 */
export async function getComponentFromIDB(key: string): Promise<StoredEngineComponent | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = await openEngineDB();
    const normalized = normalizeComponentKey(key);

    return await new Promise<StoredEngineComponent | null>((resolve) => {
      const tx = db.transaction(ENGINE_IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(ENGINE_IDB_STORE_NAME);

      // 1. Try exact key
      const exactReq = store.get(key);

      exactReq.onsuccess = () => {
        if (exactReq.result && exactReq.result.data) {
          resolve(exactReq.result as StoredEngineComponent);
          return;
        }

        // 2. Try normalized key via index
        try {
          const index = store.index('normalizedKey');
          const indexReq = index.get(normalized);
          indexReq.onsuccess = () => {
            if (indexReq.result && indexReq.result.data) {
              resolve(indexReq.result as StoredEngineComponent);
            } else {
              // 3. Fallback: try with leading slash removed or added
              const altReq = store.get(normalized);
              altReq.onsuccess = () => {
                resolve(altReq.result ? (altReq.result as StoredEngineComponent) : null);
              };
              altReq.onerror = () => resolve(null);
            }
          };
          indexReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };

      exactReq.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn(`[IDB Engine] Error reading component "${key}":`, err);
    return null;
  }
}

/**
 * Persists an engine component (ArrayBuffer) into IndexedDB.
 */
export async function saveComponentToIDB(
  key: string,
  data: ArrayBuffer,
  mimeType: string,
  label?: string
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = await openEngineDB();
    const normalizedKey = normalizeComponentKey(key);

    const record: StoredEngineComponent = {
      key,
      normalizedKey,
      data,
      mimeType,
      sizeBytes: data.byteLength,
      timestamp: Date.now(),
      label: label || deriveLabel(normalizedKey),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ENGINE_IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(ENGINE_IDB_STORE_NAME);

      const putReq = store.put(record);

      // If the normalized key is different from the input key, also store a copy
      // with normalizedKey so future relative/absolute fetches hit immediately
      if (normalizedKey !== key) {
        store.put({
          ...record,
          key: normalizedKey,
        });
      }

      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error || new Error('Failed to save component to IndexedDB'));
      tx.onerror = () => reject(tx.error || new Error('Transaction error saving component'));
    });
  } catch (err) {
    console.warn(`[IDB Engine] Error saving component "${key}":`, err);
  }
}

/**
 * Derives a human-readable label for common engine components.
 */
function deriveLabel(normalizedKey: string): string {
  if (normalizedKey.includes('ffmpeg-core.wasm')) {
    return normalizedKey.includes('core-mt') ? 'FFmpeg Core MT (WASM)' : 'FFmpeg Core (WASM)';
  }
  if (normalizedKey.includes('ffmpeg-core.js')) {
    return normalizedKey.includes('core-mt') ? 'FFmpeg Core MT Runtime (JS)' : 'FFmpeg Core Runtime (JS)';
  }
  if (normalizedKey.includes('ffmpeg-core.worker.js')) {
    return 'FFmpeg Core MT Worker (JS)';
  }
  if (normalizedKey.includes('7zz.wasm')) {
    return '7-Zip WebAssembly Core';
  }
  if (normalizedKey.includes('unrar.wasm')) {
    return 'UnRAR WebAssembly Core';
  }
  return normalizedKey;
}

/**
 * Calculates current statistics of components stored in IndexedDB.
 */
export async function getEngineIDBCacheStats(): Promise<EngineCacheStats> {
  if (!isIndexedDBAvailable()) {
    return {
      isSupported: false,
      itemCount: 0,
      totalSizeBytes: 0,
      formattedSize: '0 MB',
      cachedKeys: [],
      components: [],
      storageType: 'indexeddb',
    };
  }

  try {
    const db = await openEngineDB();

    return await new Promise<EngineCacheStats>((resolve) => {
      const tx = db.transaction(ENGINE_IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(ENGINE_IDB_STORE_NAME);
      const req = store.openCursor();

      let totalBytes = 0;
      const seenNormalized = new Set<string>();
      const cachedKeys: string[] = [];
      const components: EngineComponentMeta[] = [];

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value as StoredEngineComponent;
          // Avoid double counting if exact key and normalized key both exist
          const norm = item.normalizedKey || item.key;
          if (!seenNormalized.has(norm)) {
            seenNormalized.add(norm);
            totalBytes += item.sizeBytes || 0;
            cachedKeys.push(item.key);
            components.push({
              key: item.key,
              normalizedKey: norm,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              timestamp: item.timestamp,
              label: item.label,
            });
          }
          cursor.continue();
        } else {
          const mb = totalBytes / (1024 * 1024);
          resolve({
            isSupported: true,
            itemCount: components.length,
            totalSizeBytes: totalBytes,
            formattedSize: `${mb.toFixed(1)} MB`,
            cachedKeys,
            components,
            storageType: 'indexeddb',
          });
        }
      };

      req.onerror = () => {
        resolve({
          isSupported: true,
          itemCount: 0,
          totalSizeBytes: 0,
          formattedSize: '0 MB',
          cachedKeys: [],
          components: [],
          storageType: 'indexeddb',
        });
      };
    });
  } catch {
    return {
      isSupported: false,
      itemCount: 0,
      totalSizeBytes: 0,
      formattedSize: '0 MB',
      cachedKeys: [],
      components: [],
      storageType: 'indexeddb',
    };
  }
}

/**
 * Clears all cached engine components from IndexedDB.
 */
export async function clearAllEngineComponentsIDB(): Promise<boolean> {
  if (!isIndexedDBAvailable()) return false;

  try {
    const db = await openEngineDB();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(ENGINE_IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(ENGINE_IDB_STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Checks if a buffer has the standard WebAssembly magic number (\0asm).
 */
export function isValidWasmBuffer(buf: ArrayBuffer | null | undefined): boolean {
  if (!buf || buf.byteLength < 4) return false;
  const header = new Uint8Array(buf.slice(0, 4));
  return (
    header[0] === 0x00 &&
    header[1] === 0x61 &&
    header[2] === 0x73 &&
    header[3] === 0x6d
  );
}

/**
 * Background preloader to ensure both archive WebAssembly cores (7z & unrar)
 * are cached in IndexedDB for immediate offline use.
 */
export async function preloadArchiveCoresToIDB(): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    // 1. Check 7-Zip core
    const existing7z = await getComponentFromIDB('7z/7zz.wasm');
    if (!existing7z || !isValidWasmBuffer(existing7z.data)) {
      try {
        const res = await fetch('/7z/7zz.wasm');
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (isValidWasmBuffer(buf)) {
            await saveComponentToIDB('7z/7zz.wasm', buf, 'application/wasm', '7-Zip WebAssembly Core');
          }
        }
      } catch {
        // ignore background fetch error
      }
    }

    // 2. Check UnRAR core
    const existingRar = await getComponentFromIDB('rar/unrar.wasm');
    if (!existingRar || !isValidWasmBuffer(existingRar.data)) {
      try {
        const res = await fetch('/rar/unrar.wasm');
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (isValidWasmBuffer(buf)) {
            await saveComponentToIDB('rar/unrar.wasm', buf, 'application/wasm', 'UnRAR WebAssembly Core');
          }
        }
      } catch {
        // ignore background fetch error
      }
    }
  } catch {
    // ignore
  }
}
