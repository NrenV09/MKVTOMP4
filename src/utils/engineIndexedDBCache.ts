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
 * Checks the normalized key first (fast O(1) primary key), then raw key as fallback.
 */
export async function getComponentFromIDB(key: string): Promise<StoredEngineComponent | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = await openEngineDB();
    const normalized = normalizeComponentKey(key);

    return await new Promise<StoredEngineComponent | null>((resolve) => {
      const tx = db.transaction(ENGINE_IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(ENGINE_IDB_STORE_NAME);

      // 1. Check normalized key directly (primary key)
      const exactReq = store.get(normalized);

      exactReq.onsuccess = () => {
        if (exactReq.result && exactReq.result.data) {
          resolve(exactReq.result as StoredEngineComponent);
          return;
        }

        // 2. Fallback: check original key if it differed
        if (key !== normalized) {
          const rawReq = store.get(key);
          rawReq.onsuccess = () => {
            if (rawReq.result && rawReq.result.data) {
              resolve(rawReq.result as StoredEngineComponent);
              return;
            }
            // 3. Fallback: query index
            try {
              const index = store.index('normalizedKey');
              const indexReq = index.get(normalized);
              indexReq.onsuccess = () => {
                resolve(indexReq.result ? (indexReq.result as StoredEngineComponent) : null);
              };
              indexReq.onerror = () => resolve(null);
            } catch {
              resolve(null);
            }
          };
          rawReq.onerror = () => resolve(null);
        } else {
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
 * Uses normalizedKey as the primary key to avoid storing multiple 30MB+ duplicate copies.
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
      key: normalizedKey, // Canonical primary key
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

import {
  saveComponentToCacheStorage,
  getComponentFromCacheStorage,
  isCacheStorageAvailable,
} from './wasmCache';

/**
 * Background preloader to ensure both archive WebAssembly cores (7z & unrar)
 * are cached in IndexedDB and CacheStorage for immediate offline use.
 */
export async function preloadArchiveCoresToIDB(): Promise<void> {
  const isIDBAvail = isIndexedDBAvailable();
  const isCacheAvail = isCacheStorageAvailable();
  if (!isIDBAvail && !isCacheAvail) return;

  try {
    const archiveTargets = [
      { url: '7z/7zz.wasm', label: '7-Zip WebAssembly Core' },
      { url: 'rar/unrar.wasm', label: 'UnRAR WebAssembly Core' },
    ];

    for (const item of archiveTargets) {
      try {
        let buf: ArrayBuffer | null = null;

        // Check IndexedDB
        if (isIDBAvail) {
          const existingIDB = await getComponentFromIDB(item.url);
          if (existingIDB && isValidWasmBuffer(existingIDB.data)) {
            buf = existingIDB.data;
          }
        }

        // Check CacheStorage
        if (!buf && isCacheAvail) {
          const existingCache = await getComponentFromCacheStorage(item.url);
          if (existingCache && isValidWasmBuffer(existingCache.data)) {
            buf = existingCache.data;
          }
        }

        // If not in either, fetch from origin
        if (!buf) {
          const res = await fetch(`/${item.url}`);
          if (res.ok) {
            const fetchedBuf = await res.arrayBuffer();
            if (isValidWasmBuffer(fetchedBuf)) {
              buf = fetchedBuf;
            }
          }
        }

        // Commit to both IndexedDB and CacheStorage
        if (buf) {
          if (isIDBAvail) {
            await saveComponentToIDB(item.url, buf, 'application/wasm', item.label);
          }
          if (isCacheAvail) {
            await saveComponentToCacheStorage(item.url, buf, 'application/wasm');
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

/**
 * Checks if the current browser environment can support multi-threaded WebAssembly.
 */
export function detectEngineNeedsMultiThreading(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof window !== 'undefined' &&
      !!(window as any).crossOriginIsolated
    );
  } catch {
    return false;
  }
}

/**
 * Eagerly preloads and caches the FFmpeg media converter WebAssembly engine
 * into persistent CacheStorage AND IndexedDB on the first visit.
 * Fetches the required core runtime, worker, and binary in parallel, verifies integrity,
 * and commits them directly to both persistent CacheStorage and IndexedDB.
 */
export async function preloadMediaEngineToIDB(): Promise<void> {
  const isIDBAvail = isIndexedDBAvailable();
  const isCacheAvail = isCacheStorageAvailable();
  if (!isIDBAvail && !isCacheAvail) return;

  try {
    const hasSAB = detectEngineNeedsMultiThreading();
    const prefix = hasSAB ? '/ffmpeg/core-mt/' : '/ffmpeg/core/';
    const targets = hasSAB
      ? [
          { url: `${prefix}ffmpeg-core.js`, type: 'text/javascript', label: 'FFmpeg Core MT Runtime (JS)' },
          { url: `${prefix}ffmpeg-core.wasm`, type: 'application/wasm', label: 'FFmpeg Core MT (WASM)' },
          { url: `${prefix}ffmpeg-core.worker.js`, type: 'text/javascript', label: 'FFmpeg Core MT Worker (JS)' },
        ]
      : [
          { url: `${prefix}ffmpeg-core.js`, type: 'text/javascript', label: 'FFmpeg Core Runtime (JS)' },
          { url: `${prefix}ffmpeg-core.wasm`, type: 'application/wasm', label: 'FFmpeg Core (WASM)' },
        ];

    // Fetch and store uncached components concurrently into both CacheStorage and IndexedDB
    await Promise.all(
      targets.map(async (t) => {
        try {
          let buf: ArrayBuffer | null = null;

          // Check if already in IndexedDB
          if (isIDBAvail) {
            const existingIDB = await getComponentFromIDB(t.url);
            if (existingIDB && existingIDB.data && existingIDB.data.byteLength > 0) {
              buf = existingIDB.data;
            }
          }

          // Check if already in CacheStorage
          if (!buf && isCacheAvail) {
            const existingCache = await getComponentFromCacheStorage(t.url);
            if (existingCache && existingCache.data && existingCache.data.byteLength > 0) {
              buf = existingCache.data;
            }
          }

          // If neither has it, fetch over network
          if (!buf) {
            const res = await fetch(t.url);
            if (res.ok) {
              buf = await res.arrayBuffer();
            }
          }

          if (buf && buf.byteLength > 0) {
            if (t.type === 'application/wasm' && !isValidWasmBuffer(buf)) {
              console.warn(`[Engine Cache] Invalid WebAssembly binary received for ${t.url}`);
              return;
            }

            // Save to IndexedDB
            if (isIDBAvail) {
              await saveComponentToIDB(t.url, buf, t.type, t.label);
            }

            // Save to CacheStorage
            if (isCacheAvail) {
              await saveComponentToCacheStorage(t.url, buf, t.type);
            }
          }
        } catch (err) {
          console.warn(`[Engine Cache] Preload fetch failed for ${t.url}:`, err);
        }
      })
    );
  } catch (err) {
    console.warn('[Engine Cache] Media converter preload failed:', err);
  }
}

/**
 * Master eager loader: Preloads both media conversion and archive engine components
 * into persistent CacheStorage & IndexedDB on startup.
 */
export async function preloadAllEnginesToIDB(): Promise<void> {
  // 1. High priority: Media converter engine into CacheStorage & IndexedDB
  await preloadMediaEngineToIDB();
  // 2. Background priority: Archive engines (7-Zip & UnRAR)
  preloadArchiveCoresToIDB().catch(() => {});
}
