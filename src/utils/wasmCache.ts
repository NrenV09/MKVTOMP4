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
  EngineCacheStats,
} from './engineIndexedDBCache';

export const WASM_ENGINE_CACHE_NAME = 'ffmpeg-wasm-engine-v1';

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
  storageType?: 'indexeddb' | 'cache-storage';
}

/**
 * Checks if CacheStorage is supported in the current environment.
 */
export function isCacheStorageAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && typeof window.caches.open === 'function';
}

/**
 * Loads a WebAssembly binary or worker script from persistent IndexedDB storage.
 * If already cached in IndexedDB, it returns instantly without any network request.
 * If not yet cached, it fetches the binary from the server, saves it into IndexedDB,
 * and converts it to a Blob URL for WebAssembly execution.
 */
export async function getCachedWasmBlobURL(
  url: string,
  mimeType: string,
  fallbackUrl?: string
): Promise<CachedBinaryResult> {
  // 1. PRIMARY CHECK: Persistent IndexedDB Cache
  if (isIndexedDBAvailable()) {
    try {
      const cached = await getComponentFromIDB(url);
      if (cached && cached.data && cached.data.byteLength > 0) {
        const blobUrl = URL.createObjectURL(new Blob([cached.data], { type: mimeType }));
        return {
          blobUrl,
          fromCache: true,
          sizeBytes: cached.sizeBytes,
          source: 'indexeddb',
        };
      }
    } catch (idbErr) {
      console.warn(`IndexedDB read error for ${url}, will check secondary caches:`, idbErr);
    }
  }

  // 2. SECONDARY CHECK: CacheStorage (and migrate to IndexedDB if present)
  if (isCacheStorageAvailable()) {
    try {
      const cache = await window.caches.open(WASM_ENGINE_CACHE_NAME);
      const matchedResponse = await cache.match(url);
      if (matchedResponse) {
        const arrayBuffer = await matchedResponse.arrayBuffer();
        if (arrayBuffer && arrayBuffer.byteLength > 0) {
          // Migrate/save to IndexedDB for next time
          if (isIndexedDBAvailable()) {
            saveComponentToIDB(url, arrayBuffer.slice(0), mimeType).catch(() => {});
          }
          const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
          return {
            blobUrl,
            fromCache: true,
            sizeBytes: arrayBuffer.byteLength,
            source: 'cache-storage',
          };
        }
      }
    } catch {
      // ignore cache storage check error
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

  // Read binary as ArrayBuffer for IndexedDB storage
  const arrayBuffer = await fetchResponse.arrayBuffer();

  // Save to IndexedDB (Primary Persistent Engine Store)
  if (isIndexedDBAvailable()) {
    try {
      await saveComponentToIDB(url, arrayBuffer.slice(0), mimeType);
    } catch (saveErr) {
      console.warn(`Failed to save ${url} into IndexedDB:`, saveErr);
    }
  }

  // Also save to CacheStorage as secondary redundancy
  if (isCacheStorageAvailable()) {
    try {
      const cache = await window.caches.open(WASM_ENGINE_CACHE_NAME);
      await cache.put(
        url,
        new Response(arrayBuffer.slice(0), {
          headers: { 'Content-Type': mimeType },
        })
      );
    } catch {
      // ignore
    }
  }

  const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));

  return {
    blobUrl,
    fromCache: false,
    sizeBytes: arrayBuffer.byteLength,
    source: 'network',
  };
}

/**
 * Inspect the current state and size of the WebAssembly persistent IndexedDB cache.
 */
export async function getWasmCacheStats(): Promise<WasmCacheStats> {
  // First attempt IndexedDB stats
  if (isIndexedDBAvailable()) {
    try {
      const idbStats: EngineCacheStats = await getEngineIDBCacheStats();
      if (idbStats.itemCount > 0 || !isCacheStorageAvailable()) {
        return {
          isSupported: true,
          itemCount: idbStats.itemCount,
          totalSizeBytes: idbStats.totalSizeBytes,
          formattedSize: idbStats.formattedSize,
          cachedKeys: idbStats.cachedKeys,
          storageType: 'indexeddb',
        };
      }
    } catch {
      // fallback
    }
  }

  // Fallback to CacheStorage stats if IndexedDB is empty or unavailable
  if (isCacheStorageAvailable()) {
    try {
      const cache = await window.caches.open(WASM_ENGINE_CACHE_NAME);
      const requests = await cache.keys();
      let totalBytes = 0;
      const cachedKeys: string[] = [];

      for (const req of requests) {
        cachedKeys.push(req.url);
        const res = await cache.match(req);
        if (res) {
          const blob = await res.blob();
          totalBytes += blob.size;
        }
      }

      const mb = totalBytes / (1024 * 1024);
      return {
        isSupported: true,
        itemCount: requests.length,
        totalSizeBytes: totalBytes,
        formattedSize: `${mb.toFixed(1)} MB`,
        cachedKeys,
        storageType: 'cache-storage',
      };
    } catch {
      // ignore
    }
  }

  return {
    isSupported: isIndexedDBAvailable() || isCacheStorageAvailable(),
    itemCount: 0,
    totalSizeBytes: 0,
    formattedSize: '0 MB',
    cachedKeys: [],
    storageType: 'indexeddb',
  };
}

/**
 * Explicitly clears the WebAssembly engine cache from both IndexedDB and CacheStorage.
 */
export async function clearWasmEngineCache(): Promise<boolean> {
  let cleared = false;

  if (isIndexedDBAvailable()) {
    try {
      const ok = await clearAllEngineComponentsIDB();
      if (ok) cleared = true;
    } catch {}
  }

  if (isCacheStorageAvailable()) {
    try {
      const ok = await window.caches.delete(WASM_ENGINE_CACHE_NAME);
      if (ok) cleared = true;
    } catch {}
  }

  return cleared;
}
