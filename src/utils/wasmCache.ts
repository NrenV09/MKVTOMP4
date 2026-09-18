/**
 * Persistent Browser Cache Management for FFmpeg WebAssembly Engine.
 * 
 * Stores the ~32MB .wasm binaries, runtime scripts, and web workers in the browser's
 * persistent CacheStorage API so they persist across reloads and offline sessions.
 */

export const WASM_ENGINE_CACHE_NAME = 'ffmpeg-wasm-engine-v1';

export interface CachedBinaryResult {
  blobUrl: string;
  fromCache: boolean;
  sizeBytes: number;
}

export interface WasmCacheStats {
  isSupported: boolean;
  itemCount: number;
  totalSizeBytes: number;
  formattedSize: string;
  cachedKeys: string[];
}

/**
 * Checks if CacheStorage is supported and permitted in the current environment.
 */
export function isCacheStorageAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && typeof window.caches.open === 'function';
}

/**
 * Loads a WebAssembly binary or worker script from the persistent CacheStorage.
 * If already cached, it returns instantly without a network request.
 * If not cached, it fetches the binary from the server, saves a clone to the persistent cache,
 * and converts it to a Blob URL for WebAssembly execution.
 */
export async function getCachedWasmBlobURL(
  url: string,
  mimeType: string,
  fallbackUrl?: string
): Promise<CachedBinaryResult> {
  // If CacheStorage is unavailable (e.g. in restricted third-party iframes), fallback to direct fetch
  if (!isCacheStorageAvailable()) {
    return fetchDirectly(url, mimeType, fallbackUrl);
  }

  try {
    const cache = await window.caches.open(WASM_ENGINE_CACHE_NAME);
    
    // 1. Check if binary is already present in persistent cache
    let matchedResponse = await cache.match(url);
    if (matchedResponse) {
      const blob = await matchedResponse.blob();
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));
      return {
        blobUrl,
        fromCache: true,
        sizeBytes: blob.size,
      };
    }

    // 2. Not yet cached: fetch from local server/origin
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

    // Clone response so we can store in cache AND read it as blob
    try {
      await cache.put(url, fetchResponse.clone());
    } catch (putErr) {
      console.warn('CacheStorage put error (will continue in-memory):', putErr);
    }

    const blob = await fetchResponse.blob();
    const blobUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));

    return {
      blobUrl,
      fromCache: false,
      sizeBytes: blob.size,
    };
  } catch (err) {
    console.warn(`CacheStorage error for ${url}, falling back to direct fetch:`, err);
    return fetchDirectly(url, mimeType, fallbackUrl);
  }
}

/**
 * Fallback direct in-memory fetch
 */
async function fetchDirectly(
  url: string,
  mimeType: string,
  fallbackUrl?: string
): Promise<CachedBinaryResult> {
  try {
    const res = await fetch(url);
    if (!res.ok && fallbackUrl) {
      const fallbackRes = await fetch(fallbackUrl);
      const blob = await fallbackRes.blob();
      return {
        blobUrl: URL.createObjectURL(new Blob([blob], { type: mimeType })),
        fromCache: false,
        sizeBytes: blob.size,
      };
    }
    const blob = await res.blob();
    return {
      blobUrl: URL.createObjectURL(new Blob([blob], { type: mimeType })),
      fromCache: false,
      sizeBytes: blob.size,
    };
  } catch (err) {
    if (fallbackUrl) {
      const res = await fetch(fallbackUrl);
      const blob = await res.blob();
      return {
        blobUrl: URL.createObjectURL(new Blob([blob], { type: mimeType })),
        fromCache: false,
        sizeBytes: blob.size,
      };
    }
    throw err;
  }
}

/**
 * Inspect the current state and size of the WebAssembly persistent cache.
 */
export async function getWasmCacheStats(): Promise<WasmCacheStats> {
  if (!isCacheStorageAvailable()) {
    return {
      isSupported: false,
      itemCount: 0,
      totalSizeBytes: 0,
      formattedSize: '0 MB',
      cachedKeys: [],
    };
  }

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
    };
  } catch (err) {
    console.warn('Error reading WebAssembly cache stats:', err);
    return {
      isSupported: false,
      itemCount: 0,
      totalSizeBytes: 0,
      formattedSize: '0 MB',
      cachedKeys: [],
    };
  }
}

/**
 * Explicitly clears ONLY the WebAssembly engine cache (if the user wants to re-download binaries).
 */
export async function clearWasmEngineCache(): Promise<boolean> {
  if (!isCacheStorageAvailable()) return false;
  try {
    return await window.caches.delete(WASM_ENGINE_CACHE_NAME);
  } catch {
    return false;
  }
}
