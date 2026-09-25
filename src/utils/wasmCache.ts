/**
 * Persistent IndexedDB & Browser Cache Management for WebAssembly Engines.
 * 
 * Stores the WebAssembly binaries (.wasm), runtime scripts (.js), and web workers
 * in the browser's persistent IndexedDB storage so they persist across reloads
 * and offline sessions with zero network latency.
 */

import {
  getComponentFromIDB,
  saveComponentToIDB,
  getEngineIDBCacheStats,
  clearAllEngineComponentsIDB,
  isIndexedDBAvailable,
  normalizeComponentKey,
  EngineCacheStats,
} from './engineIndexedDBCache';

export const WASM_ENGINE_CACHE_NAME = 'ffmpeg-wasm-engine-v1';
export const WASM_RUNTIME_CACHE_NAME = 'ffmpeg-wasm-runtime-cache';

export interface CachedBinaryResult {
  blobUrl: string;
  fromCache: boolean;
  sizeBytes: number;
  source?: 'indexeddb' | 'cache-storage' | 'network';
}

export interface WasmCacheStats {
  isSupported: boolean;
  itemCount: number;
  totalSizeBytes: number;
  formattedSize: string;
  cachedKeys: string[];
  storageType?: 'indexeddb' | 'cache-storage' | 'dual';
  inCacheStorage: boolean;
  inIndexedDB: boolean;
}

// In-memory cache map for zero-millisecond instant lookup within the session
const memoryBlobUrlMap = new Map<string, CachedBinaryResult>();

// In-flight request deduplication map to prevent multiple concurrent downloads
const inFlightRequests = new Map<string, Promise<CachedBinaryResult>>();

/**
 * Checks if CacheStorage is supported in the current environment.
 */
export function isCacheStorageAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && typeof window.caches.open === 'function';
}

/**
 * Stores a WebAssembly binary or runtime script into the browser's CacheStorage.
 * Saves to both full URL and canonical relative paths across engine cache partitions.
 */
export async function saveComponentToCacheStorage(
  url: string,
  data: ArrayBuffer,
  mimeType: string
): Promise<boolean> {
  if (!isCacheStorageAvailable()) return false;

  try {
    const fullUrl = typeof window !== 'undefined' ? new URL(url, window.location.href).href : url;
    let pathname = '';
    try {
      pathname = new URL(fullUrl).pathname;
    } catch {}

    const createResponse = () =>
      new Response(data.slice(0), {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': data.byteLength.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Wasm-Engine-Cache': 'true',
        },
      });

    // Save to primary WebAssembly engine cache partition
    const primaryCache = await window.caches.open(WASM_ENGINE_CACHE_NAME);
    await primaryCache.put(fullUrl, createResponse());
    if (pathname && pathname !== fullUrl) {
      try {
        await primaryCache.put(pathname, createResponse());
      } catch {}
    }

    // Also mirror to runtime cache partition for workbox service worker compatibility
    try {
      const runtimeCache = await window.caches.open(WASM_RUNTIME_CACHE_NAME);
      await runtimeCache.put(fullUrl, createResponse());
      if (pathname && pathname !== fullUrl) {
        await runtimeCache.put(pathname, createResponse());
      }
    } catch {}

    return true;
  } catch (err) {
    console.warn(`[CacheStorage] Failed to store ${url} in cache:`, err);
    return false;
  }
}

/**
 * Retrieves a WebAssembly binary or script from browser CacheStorage.
 */
export async function getComponentFromCacheStorage(
  url: string
): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  if (!isCacheStorageAvailable()) return null;

  try {
    const fullUrl = typeof window !== 'undefined' ? new URL(url, window.location.href).href : url;
    let pathname = '';
    try {
      pathname = new URL(fullUrl).pathname;
    } catch {}

    const cacheNames = [WASM_ENGINE_CACHE_NAME, WASM_RUNTIME_CACHE_NAME];
    for (const cName of cacheNames) {
      try {
        const cache = await window.caches.open(cName);
        let res = await cache.match(fullUrl);
        if (!res && pathname) {
          res = await cache.match(pathname);
        }
        if (!res) {
          res = await cache.match(url);
        }

        if (res) {
          const defaultMime = url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
          const mimeType = res.headers.get('Content-Type') || defaultMime;
          const data = await res.arrayBuffer();
          if (data && data.byteLength > 0) {
            return { data, mimeType };
          }
        }
      } catch {}
    }
  } catch {}

  return null;
}

/**
 * Loads a WebAssembly binary or worker script from persistent storage (IndexedDB & CacheStorage).
 * If already cached, it returns instantly without any network request.
 * If not yet cached, it fetches the binary from the server, saves it into BOTH IndexedDB
 * and CacheStorage concurrently in the background, and converts it to a Blob URL
 * immediately for instant WebAssembly compilation.
 */
export async function getCachedWasmBlobURL(
  url: string,
  mimeType: string,
  fallbackUrl?: string
): Promise<CachedBinaryResult> {
  const normalizedKey = normalizeComponentKey(url);

  // 0. MEMORY CACHE (0ms Instant Return)
  const memCached = memoryBlobUrlMap.get(normalizedKey);
  if (memCached) {
    return memCached;
  }

  // 1. IN-FLIGHT DEDUPLICATION (attach to active download if already running)
  const pending = inFlightRequests.get(normalizedKey);
  if (pending) {
    return pending;
  }

  const loadPromise = (async (): Promise<CachedBinaryResult> => {
    // 1. PRIMARY CHECK: Persistent IndexedDB Cache
    if (isIndexedDBAvailable()) {
      try {
        const cached = await getComponentFromIDB(url);
        if (cached && cached.data && cached.data.byteLength > 0) {
          // Synchronize to CacheStorage in background if missing
          if (isCacheStorageAvailable()) {
            saveComponentToCacheStorage(url, cached.data, mimeType).catch(() => {});
          }

          const blobUrl = URL.createObjectURL(new Blob([cached.data], { type: mimeType }));
          const res: CachedBinaryResult = {
            blobUrl,
            fromCache: true,
            sizeBytes: cached.sizeBytes,
            source: 'indexeddb',
          };
          memoryBlobUrlMap.set(normalizedKey, res);
          return res;
        }
      } catch (idbErr) {
        console.warn(`IndexedDB read error for ${url}, will check secondary cache:`, idbErr);
      }
    }

    // 2. SECONDARY CHECK: CacheStorage
    if (isCacheStorageAvailable()) {
      try {
        const cachedFromStorage = await getComponentFromCacheStorage(url);
        if (cachedFromStorage && cachedFromStorage.data && cachedFromStorage.data.byteLength > 0) {
          // Synchronize to IndexedDB in background
          if (isIndexedDBAvailable()) {
            saveComponentToIDB(url, cachedFromStorage.data, mimeType).catch(() => {});
          }

          const blobUrl = URL.createObjectURL(new Blob([cachedFromStorage.data], { type: mimeType }));
          const res: CachedBinaryResult = {
            blobUrl,
            fromCache: true,
            sizeBytes: cachedFromStorage.data.byteLength,
            source: 'cache-storage',
          };
          memoryBlobUrlMap.set(normalizedKey, res);
          return res;
        }
      } catch (cacheErr) {
        console.warn(`CacheStorage read error for ${url}:`, cacheErr);
      }
    }

    // 3. Not in IndexedDB or CacheStorage: Fetch from network/origin
    let fetchTarget = url;
    let fetchResponse: Response;
    try {
      fetchResponse = await fetch(fetchTarget);
      if (!fetchResponse.ok) {
        throw new Error(`HTTP ${fetchResponse.status} ${fetchResponse.statusText}`);
      }
    } catch (primaryErr) {
      if (fallbackUrl) {
        fetchTarget = fallbackUrl;
        fetchResponse = await fetch(fallbackUrl);
        if (!fetchResponse.ok) {
          throw new Error(`HTTP ${fetchResponse.status} ${fetchResponse.statusText} from fallback`);
        }
      } else {
        throw primaryErr;
      }
    }

    // Read binary as ArrayBuffer
    const arrayBuffer = await fetchResponse.arrayBuffer();

    // Create Blob URL IMMEDIATELY so consumer (FFmpeg engine) compiles without waiting for disk I/O
    const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
    const result: CachedBinaryResult = {
      blobUrl,
      fromCache: false,
      sizeBytes: arrayBuffer.byteLength,
      source: 'network',
    };

    // Store in memory for instant reuse
    memoryBlobUrlMap.set(normalizedKey, {
      ...result,
      fromCache: true,
    });

    // Save to IndexedDB (Persistent Engine Store) asynchronously in background
    if (isIndexedDBAvailable()) {
      saveComponentToIDB(url, arrayBuffer, mimeType).catch((saveErr) => {
        console.warn(`Failed to save ${url} into IndexedDB:`, saveErr);
      });
    }

    // ALSO save to CacheStorage asynchronously in background
    if (isCacheStorageAvailable()) {
      saveComponentToCacheStorage(url, arrayBuffer, mimeType).catch((saveErr) => {
        console.warn(`Failed to save ${url} into CacheStorage:`, saveErr);
      });
    }

    return result;
  })();

  inFlightRequests.set(normalizedKey, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightRequests.delete(normalizedKey);
  }
}

/**
 * Inspect the current state and size of the WebAssembly cache across both IndexedDB and CacheStorage.
 */
export async function getWasmCacheStats(): Promise<WasmCacheStats> {
  let idbCount = 0;
  let idbBytes = 0;
  let idbKeys: string[] = [];

  if (isIndexedDBAvailable()) {
    try {
      const idbStats: EngineCacheStats = await getEngineIDBCacheStats();
      idbCount = idbStats.itemCount;
      idbBytes = idbStats.totalSizeBytes;
      idbKeys = idbStats.cachedKeys;
    } catch {}
  }

  let cacheCount = 0;
  let cacheBytes = 0;
  let cacheKeys: string[] = [];

  if (isCacheStorageAvailable()) {
    try {
      const cacheNames = [WASM_ENGINE_CACHE_NAME, WASM_RUNTIME_CACHE_NAME];
      const seenUrls = new Set<string>();

      for (const cName of cacheNames) {
        try {
          const cache = await window.caches.open(cName);
          const requests = await cache.keys();
          for (const req of requests) {
            const norm = normalizeComponentKey(req.url);
            if (!seenUrls.has(norm)) {
              seenUrls.add(norm);
              cacheKeys.push(norm);
              const res = await cache.match(req);
              if (res) {
                const blob = await res.blob();
                cacheBytes += blob.size;
              }
            }
          }
        } catch {}
      }
      cacheCount = seenUrls.size;
    } catch {}
  }

  const inIndexedDB = idbCount > 0;
  const inCacheStorage = cacheCount > 0;
  const maxBytes = Math.max(idbBytes, cacheBytes);
  const maxCount = Math.max(idbCount, cacheCount);
  const allKeys = Array.from(new Set([...idbKeys, ...cacheKeys]));

  const storageType: 'indexeddb' | 'cache-storage' | 'dual' =
    inIndexedDB && inCacheStorage ? 'dual' : inCacheStorage ? 'cache-storage' : 'indexeddb';

  return {
    isSupported: isIndexedDBAvailable() || isCacheStorageAvailable(),
    itemCount: maxCount,
    totalSizeBytes: maxBytes,
    formattedSize: maxBytes > 0 ? `${(maxBytes / (1024 * 1024)).toFixed(1)} MB` : '0 MB',
    cachedKeys: allKeys,
    storageType,
    inCacheStorage,
    inIndexedDB,
  };
}

/**
 * Explicitly clears the WebAssembly engine cache from both IndexedDB and CacheStorage.
 */
export async function clearWasmEngineCache(): Promise<boolean> {
  let cleared = false;

  // Revoke in-memory blob URLs and clear memory map
  for (const item of memoryBlobUrlMap.values()) {
    try {
      URL.revokeObjectURL(item.blobUrl);
    } catch {}
  }
  memoryBlobUrlMap.clear();

  if (isIndexedDBAvailable()) {
    try {
      const ok = await clearAllEngineComponentsIDB();
      if (ok) cleared = true;
    } catch {}
  }

  if (isCacheStorageAvailable()) {
    try {
      await window.caches.delete(WASM_ENGINE_CACHE_NAME);
      await window.caches.delete(WASM_RUNTIME_CACHE_NAME);
      cleared = true;
    } catch {}
  }

  return cleared;
}
