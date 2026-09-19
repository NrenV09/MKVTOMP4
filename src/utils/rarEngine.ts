import { createExtractorFromData } from 'node-unrar-js';
import { ExtractedArchiveItem, guessMimeType, getPreviewType } from './archiveEngine';
import { extractWithSevenZip } from './sevenZipEngine';

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

  const CACHE_NAME = 'archive-wasm-runtime-cache';
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const matched = await cache.match('rar/unrar.wasm');
      if (matched) {
        const buf = await matched.arrayBuffer();
        if (isValidWasm(buf)) {
          cachedUnrarWasmBinary = buf;
          return buf.slice(0);
        }
      }
    } catch {
      // ignore
    }
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

  candidates.push('/rar/unrar.wasm');
  candidates.push('./rar/unrar.wasm');
  candidates.push('rar/unrar.wasm');
  candidates.push('https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/dist/js/unrar.wasm');
  candidates.push('https://unpkg.com/node-unrar-js@2.0.2/dist/js/unrar.wasm');

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
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await window.caches.open(CACHE_NAME);
          await cache.put(
            'rar/unrar.wasm',
            new Response(buf.slice(0), {
              headers: { 'Content-Type': 'application/wasm' },
            })
          );
        } catch {
          // ignore
        }
      }
      return buf.slice(0);
    }
  }

  throw new Error('Failed to load unrar WebAssembly binary from all sources.');
}

/**
 * Extract RAR archive (supporting RAR v1.5, v2, v3, v4, and modern RAR5)
 */
export async function extractRarArchive(
  archiveBytes: Uint8Array,
  password?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedArchiveItem[]> {
  onProgress?.(20, 'Loading UnRAR WebAssembly module...');

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

    // If zero items were returned, throw to trigger fallback
    throw new Error('Zero files returned from primary UnRAR engine');
  } catch (err: any) {
    console.warn('Primary UnRAR engine notice:', err?.message, '- Trying 7-Zip fallback...');

    // If it's a missing password error, inform user clearly
    if (err?.message?.includes('ERAR_MISSING_PASSWORD') || err?.message?.includes('ERAR_BAD_PASSWORD')) {
      throw new Error(
        err?.message?.includes('ERAR_BAD_PASSWORD')
          ? 'Incorrect RAR password provided. Please check the password and try again.'
          : 'This RAR archive is password-protected. Please enter the archive password to extract.'
      );
    }

    // Fallback to 7-Zip engine which natively supports RAR4 and RAR5 extraction
    onProgress?.(40, 'Attempting RAR extraction via 7-Zip WASM core...');
    return await extractWithSevenZip(archiveBytes, 'rar', password, onProgress);
  }
}
