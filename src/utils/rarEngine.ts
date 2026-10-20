import { createExtractorFromData } from 'node-unrar-js';
import { ExtractedArchiveItem, guessMimeType, getPreviewType } from './archiveEngine';
import { extractWithSevenZip } from './sevenZipEngine';
import { getComponentFromIDB, saveComponentToIDB } from './engineIndexedDBCache';
import { getComponentFromCacheStorage, saveComponentToCacheStorage } from './wasmCache';
import { ensureRarsWasmLoaded, RarFile } from './rarWriter';

let cachedUnrarWasmBinary: ArrayBuffer | null = null;

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

function isValidWasm(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 4) return false;
  const u8 = new Uint8Array(buf.slice(0, 4));
  return (
    u8[0] === WASM_MAGIC[0] &&
    u8[1] === WASM_MAGIC[1] &&
    u8[2] === WASM_MAGIC[2] &&
    u8[3] === WASM_MAGIC[3]
  );
}

async function fetchWasmCandidate(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (isValidWasm(buf)) {
      return buf;
    }
  } catch {
    // try next
  }
  return null;
}

async function getUnrarWasmBinary(
  onProgress?: (percent: number, status: string) => void
): Promise<ArrayBuffer> {
  if (cachedUnrarWasmBinary && isValidWasm(cachedUnrarWasmBinary)) {
    return cachedUnrarWasmBinary.slice(0);
  }

  // 1. Try IndexedDB persistent cache first
  try {
    const idbComponent = await getComponentFromIDB('rar/unrar.wasm');
    if (idbComponent && idbComponent.data && isValidWasm(idbComponent.data)) {
      cachedUnrarWasmBinary = idbComponent.data;
      onProgress?.(35, 'UnRAR WebAssembly core loaded from IndexedDB cache.');
      return idbComponent.data.slice(0);
    }
  } catch (idbErr) {
    console.warn('[rar-wasm] IndexedDB check error:', idbErr);
  }

  // 2. Try CacheStorage (and migrate to IndexedDB if found)
  try {
    const cacheItem = await getComponentFromCacheStorage('rar/unrar.wasm');
    if (cacheItem && isValidWasm(cacheItem.data)) {
      cachedUnrarWasmBinary = cacheItem.data;
      saveComponentToIDB('rar/unrar.wasm', cacheItem.data.slice(0), 'application/wasm', 'UnRAR WebAssembly Core').catch(() => {});
      return cacheItem.data.slice(0);
    }
  } catch {
    // ignore
  }

  const candidates: string[] = [];
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL.replace(/\/$/, '')
      : '';
  if (base) {
    candidates.push(`${base}/rar/unrar.wasm`);
  }

  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      candidates.push(new URL('rar/unrar.wasm', document.baseURI).href);
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined' && window.location) {
    try {
      candidates.push(new URL('./rar/unrar.wasm', window.location.href).href);
      candidates.push(
        new URL('rar/unrar.wasm', window.location.origin + window.location.pathname).href
      );
      candidates.push(`${window.location.origin}/rar/unrar.wasm`);
    } catch {
      // ignore
    }
  }

  // Standard local self-contained paths (zero external network requests)
  candidates.push('/rar/unrar.wasm');
  candidates.push('./rar/unrar.wasm');
  candidates.push('rar/unrar.wasm');

  const uniqueCandidates = Array.from(new Set(candidates));

  for (let i = 0; i < uniqueCandidates.length; i++) {
    const url = uniqueCandidates[i];
    onProgress?.(
      20 + Math.floor((i / uniqueCandidates.length) * 10),
      'Preparing UnRAR engine...'
    );
    const buf = await fetchWasmCandidate(url);
    if (buf) {
      cachedUnrarWasmBinary = buf;

      // 1. Persist to IndexedDB
      try {
        await saveComponentToIDB('rar/unrar.wasm', buf.slice(0), 'application/wasm', 'UnRAR WebAssembly Core');
      } catch (idbSaveErr) {
        console.warn('[rar-wasm] Failed to save to IndexedDB:', idbSaveErr);
      }

      // 2. Also persist to CacheStorage
      try {
        await saveComponentToCacheStorage('rar/unrar.wasm', buf.slice(0), 'application/wasm');
      } catch {
        // ignore
      }
      return buf.slice(0);
    }
  }

  throw new Error('Failed to load unrar WebAssembly binary from all sources.');
}

function dosTimestampToDate(dosTime?: number): Date {
  if (dosTime === undefined) return new Date();
  const datePart = dosTime >>> 16;
  const timePart = dosTime & 0xffff;
  const day = datePart & 0x1f;
  const month = (datePart >>> 5) & 0x0f;
  const year = ((datePart >>> 9) & 0x7f) + 1980;
  const second = (timePart & 0x1f) * 2;
  const minute = (timePart >>> 5) & 0x3f;
  const hour = (timePart >>> 11) & 0x1f;
  return new Date(Date.UTC(year, Math.max(0, month - 1), Math.max(1, day), hour, minute, second));
}

/**
 * Extract RAR archive (supporting RAR v1.5, v2, v3, v4, and modern RAR5 + AES-256)
 */
export async function extractRarArchive(
  archiveBytes: Uint8Array,
  password?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedArchiveItem[]> {
  onProgress?.(20, 'Loading WinRAR 5.0 WebAssembly module...');

  // 1. Primary Engine: @bitplane/rars WebAssembly core (RAR 5.0 & RAR 4.0 + AES-256)
  try {
    await ensureRarsWasmLoaded(onProgress);
    const rf = new RarFile(archiveBytes, password || undefined);
    try {
      const entries = rf.entries();
      if (rf.needsPassword && !password) {
        for (const e of entries) {
          try { e.free(); } catch {}
        }
        throw new Error('ERAR_MISSING_PASSWORD: This RAR archive is password-protected. Please enter the archive password to extract.');
      }

      const items: ExtractedArchiveItem[] = [];
      for (let i = 0; i < entries.length; i++) {
        const info = entries[i];
        try {
          if (!info.isDirectory) {
            if (info.isEncrypted && !password) {
              throw new Error('ERAR_MISSING_PASSWORD: This RAR archive is password-protected. Please enter the archive password to extract.');
            }
            const filePath = info.name.replace(/\\/g, '/').replace(/^\/+/, '');
            const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
            const u8Data: Uint8Array = rf.readAt(i, password || undefined);
            const mime = guessMimeType(fileName);
            const preview = getPreviewType(fileName);
            const blob = new Blob([u8Data], { type: mime });

            items.push({
              id: `rars-item-${i}-${Date.now()}`,
              path: filePath,
              name: fileName,
              size: info.size || u8Data.length,
              compressedSize: info.packedSize,
              isDir: false,
              lastModified: dosTimestampToDate(info.fileTime),
              mimeType: mime,
              data: u8Data,
              url: URL.createObjectURL(blob),
              previewType: preview,
            });

            onProgress?.(
              40 + Math.min(50, Math.floor(((i + 1) / entries.length) * 50)),
              `Extracted ${fileName} (${info.size || u8Data.length} bytes)`
            );
          }
        } finally {
          try { info.free(); } catch {}
        }
      }

      if (items.length > 0) {
        return items;
      }
    } finally {
      try { rf.free(); } catch {}
    }
  } catch (rarsErr: any) {
    const msg = String(rarsErr?.message || rarsErr || '');
    if (
      msg.includes('ERAR_MISSING_PASSWORD') ||
      /password is required/i.test(msg)
    ) {
      throw new Error('This RAR archive is password-protected. Please enter the archive password to extract.');
    }
    if (
      msg.includes('ERAR_BAD_PASSWORD') ||
      /wrong password|corrupt encrypted|checksum mismatch/i.test(msg)
    ) {
      if (password) {
        throw new Error('Incorrect RAR password provided. Please check the password and try again.');
      }
      throw new Error('This RAR archive is password-protected. Please enter the archive password to extract.');
    }
    console.warn('Primary rars WASM engine notice:', msg, '- Trying UnRAR 6.x fallback...');
  }

  // 2. Secondary Engine: Official UnRAR 6.x WebAssembly (unrar.wasm)
  try {
    const wasmBinary = await getUnrarWasmBinary(onProgress);
    onProgress?.(35, 'Initializing official UnRAR 6.x engine...');

    const bufferCopy = new Uint8Array(archiveBytes.byteLength);
    bufferCopy.set(archiveBytes);
    const arrayBuffer = bufferCopy.buffer as ArrayBuffer;

    const extractor = await createExtractorFromData({
      data: arrayBuffer,
      wasmBinary,
      password: password || '',
    });

    onProgress?.(50, 'Extracting records from RAR archive...');
    const extracted = extractor.extract({
      password: password || '',
    });

    const items: ExtractedArchiveItem[] = [];
    let idx = 0;

    for (const file of extracted.files) {
      // Check if item is a file with extraction payload
      if (!file.fileHeader.flags.directory && file.extraction) {
        idx++;
        const filePath = file.fileHeader.name.replace(/\\/g, '/').replace(/^\/+/, '');
        const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
        const mime = guessMimeType(fileName);
        const preview = getPreviewType(fileName);
        const u8Data = file.extraction;
        const blob = new Blob([u8Data], { type: mime });

        items.push({
          id: `rar-item-${idx}-${Date.now()}`,
          path: filePath,
          name: fileName,
          size: file.fileHeader.unpSize || u8Data.length,
          compressedSize: file.fileHeader.packSize,
          isDir: false,
          lastModified: file.fileHeader.time ? new Date(file.fileHeader.time) : new Date(),
          mimeType: mime,
          data: u8Data,
          url: URL.createObjectURL(blob),
          previewType: preview,
        });

        onProgress?.(
          50 + Math.min(40, Math.floor(idx * 5)),
          `Extracted ${fileName} (${file.fileHeader.unpSize || u8Data.length} bytes)`
        );
      }
    }

    if (items.length > 0) {
      return items;
    }

    throw new Error('Zero files returned from UnRAR engine');
  } catch (err: any) {
    console.warn('UnRAR engine notice:', err?.message, '- Trying 7-Zip fallback...');

    if (err?.message?.includes('ERAR_MISSING_PASSWORD') || err?.message?.includes('ERAR_BAD_PASSWORD')) {
      throw new Error(
        err?.message?.includes('ERAR_BAD_PASSWORD')
          ? 'Incorrect RAR password provided. Please check the password and try again.'
          : 'This RAR archive is password-protected. Please enter the archive password to extract.'
      );
    }

    // 3. Tertiary Fallback: 7-Zip WASM engine
    onProgress?.(40, 'Attempting RAR extraction via 7-Zip WASM core...');
    return await extractWithSevenZip(archiveBytes, 'rar', password, onProgress);
  }
}
