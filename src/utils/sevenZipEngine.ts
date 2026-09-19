import SevenZip, { SevenZipModule } from '7z-wasm';
import { ExtractedArchiveItem, guessMimeType, getPreviewType } from './archiveEngine';

let cached7zWasmBinary: ArrayBuffer | null = null;
let cachedBlobUrl: string | null = null;

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]; // \0asm

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
    // try next candidate
  }
  return null;
}

/**
 * Fetch and verify the 7zz.wasm binary with multi-source fallback (local base, root, CDN)
 */
export async function get7zWasmBinary(
  onProgress?: (percent: number, msg: string) => void
): Promise<ArrayBuffer> {
  if (cached7zWasmBinary && isValidWasm(cached7zWasmBinary)) {
    return cached7zWasmBinary.slice(0);
  }

  onProgress?.(15, 'Locating 7-Zip WebAssembly core...');

  // 1. Try CacheStorage first (if available and offline)
  const CACHE_NAME = 'archive-wasm-runtime-cache';
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const matched = await cache.match('7z/7zz.wasm');
      if (matched) {
        const buf = await matched.arrayBuffer();
        if (isValidWasm(buf)) {
          cached7zWasmBinary = buf;
          return buf.slice(0);
        }
      }
    } catch {
      // ignore cache check error
    }
  }

  // 2. Build candidate URLs
  const candidates: string[] = [];

  // Vite base path
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL.replace(/\/$/, '')
      : '';
  if (base) {
    candidates.push(`${base}/7z/7zz.wasm`);
  }

  // Document base URI
  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      candidates.push(new URL('7z/7zz.wasm', document.baseURI).href);
    } catch {
      // ignore
    }
  }

  // Window location paths
  if (typeof window !== 'undefined' && window.location) {
    try {
      candidates.push(new URL('./7z/7zz.wasm', window.location.href).href);
      candidates.push(
        new URL('7z/7zz.wasm', window.location.origin + window.location.pathname).href
      );
      candidates.push(`${window.location.origin}/7z/7zz.wasm`);
    } catch {
      // ignore
    }
  }

  // Standard root and relative paths
  candidates.push('/7z/7zz.wasm');
  candidates.push('./7z/7zz.wasm');
  candidates.push('7z/7zz.wasm');

  // Fast, reliable public CDN fallbacks
  candidates.push('https://cdn.jsdelivr.net/npm/7z-wasm@1.2.0/7zz.wasm');
  candidates.push('https://unpkg.com/7z-wasm@1.2.0/7zz.wasm');
  candidates.push('https://fastly.jsdelivr.net/npm/7z-wasm@1.2.0/7zz.wasm');

  // De-duplicate candidate list
  const uniqueCandidates = Array.from(new Set(candidates));

  for (let i = 0; i < uniqueCandidates.length; i++) {
    const url = uniqueCandidates[i];
    onProgress?.(
      20 + Math.floor((i / uniqueCandidates.length) * 15),
      'Preparing 7-Zip engine...'
    );
    const buf = await fetchWasmCandidate(url);
    if (buf) {
      cached7zWasmBinary = buf;

      // Persist to CacheStorage for offline operation
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await window.caches.open(CACHE_NAME);
          await cache.put(
            '7z/7zz.wasm',
            new Response(buf.slice(0), {
              headers: { 'Content-Type': 'application/wasm' },
            })
          );
        } catch {
          // ignore cache put error
        }
      }

      return buf.slice(0);
    }
  }

  throw new Error(
    'Unable to load 7-Zip WebAssembly core (7zz.wasm). Please check network connection or reload the page.'
  );
}

/**
 * Initialize or get 7z-wasm WebAssembly instance
 */
export async function getSevenZipModule(
  onProgress?: (percent: number, msg: string) => void,
  onLog?: (line: string) => void
): Promise<SevenZipModule> {
  const wasmBinary = await get7zWasmBinary(onProgress);

  if (!cachedBlobUrl) {
    const blob = new Blob([wasmBinary], { type: 'application/wasm' });
    cachedBlobUrl = URL.createObjectURL(blob);
  }

  // Fresh module instance per major invocation prevents MEMFS collisions
  return await SevenZip({
    wasmBinary,
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return cachedBlobUrl || path;
      }
      return path;
    },
    print: (line: string) => {
      if (onLog) onLog(line);
    },
    printErr: (line: string) => {
      console.warn('[7z-wasm:err]', line);
    },
  });
}

/**
 * Clean up files in an Emscripten FS directory recursively
 */
function cleanupFSDir(FS: any, dirPath: string) {
  try {
    const entries = FS.readdir(dirPath).filter((e: string) => e !== '.' && e !== '..');
    for (const entry of entries) {
      const fullPath = dirPath === '/' ? `/${entry}` : `${dirPath}/${entry}`;
      try {
        const stat = FS.stat(fullPath);
        if (FS.isDir(stat.mode)) {
          cleanupFSDir(FS, fullPath);
          FS.rmdir(fullPath);
        } else {
          FS.unlink(fullPath);
        }
      } catch {
        // ignore individual unlink error
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Recursively collect files from an FS directory
 */
function collectExtractedFiles(FS: any, dirPath: string, prefix = ''): { relPath: string; data: Uint8Array }[] {
  const results: { relPath: string; data: Uint8Array }[] = [];
  const entries = FS.readdir(dirPath).filter((e: string) => e !== '.' && e !== '..');

  for (const entry of entries) {
    const fullPath = dirPath === '/' ? `/${entry}` : `${dirPath}/${entry}`;
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    const stat = FS.stat(fullPath);

    if (FS.isDir(stat.mode)) {
      results.push(...collectExtractedFiles(FS, fullPath, relPath));
    } else if (FS.isFile(stat.mode)) {
      const data = FS.readFile(fullPath);
      // Copy array buffer to ensure safe detached ownership
      const safeData = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      results.push({ relPath, data: safeData });
    }
  }

  return results;
}

/**
 * Compress multiple files into a .7z archive using LZMA2/7-Zip WASM
 */
export async function create7zArchive(
  files: { name: string; data: Uint8Array; mtime?: number }[],
  level: number, // 0 to 9
  onProgress?: (percent: number, status: string) => void
): Promise<Uint8Array> {
  onProgress?.(35, 'Initializing 7-Zip WebAssembly core...');
  const sevenZip = await getSevenZipModule(
    (pct, msg) => onProgress?.(pct, msg),
    (line) => {
      if (line.includes('%')) {
        const match = line.match(/(\d+)%/);
        if (match) {
          const pct = parseInt(match[1], 10);
          onProgress?.(40 + Math.floor(pct * 0.5), `7-Zip LZMA2 compressing (${pct}%)...`);
        }
      }
    }
  );

  const FS = sevenZip.FS;
  const inDir = `/in_${Date.now()}`;
  const outArchive = `/output_${Date.now()}.7z`;

  try {
    FS.mkdir(inDir);
    onProgress?.(40, 'Writing staged files into 7-Zip memory filesystem...');

    const fileNames: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const targetPath = `${inDir}/${f.name}`;
      // Ensure nested directories inside inDir if file has relative path
      const parts = f.name.split('/');
      if (parts.length > 1) {
        let cur = inDir;
        for (let p = 0; p < parts.length - 1; p++) {
          cur = `${cur}/${parts[p]}`;
          try {
            FS.mkdir(cur);
          } catch {
            // already exists
          }
        }
      }

      FS.writeFile(targetPath, f.data);
      fileNames.push(f.name);
      onProgress?.(
        40 + Math.floor(((i + 1) / files.length) * 15),
        `Prepared ${f.name} for 7-Zip engine`
      );
    }

    onProgress?.(55, `Running 7-Zip LZMA2 compression (Level: ${level})...`);

    // Change directory to inDir so archive stores relative names
    FS.chdir(inDir);

    // Build 7z CLI arguments
    // 'a' = add
    // '-t7z' = 7z format
    // '-mx=N' = compression level (0, 1, 4, 6, 9)
    // '-m0=lzma2' = LZMA2 compression
    // '-ms=on' = solid archive for maximum ratio
    // '-y' = assume yes
    const args = [
      'a',
      '-t7z',
      `-mx=${level}`,
      '-m0=lzma2',
      '-ms=on',
      '-y',
      outArchive,
      '*',
    ];

    sevenZip.callMain(args);

    onProgress?.(90, 'Extracting compressed 7z payload...');
    const outBytes = FS.readFile(outArchive);
    // Clone Uint8Array so memory isn't tied to MEMFS
    const finalBuffer = new Uint8Array(
      outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    );

    return finalBuffer;
  } finally {
    // Cleanup MEMFS
    try {
      cleanupFSDir(FS, inDir);
      FS.rmdir(inDir);
    } catch {
      // ignore
    }
    try {
      FS.unlink(outArchive);
    } catch {
      // ignore
    }
  }
}

/**
 * Extract an archive (.7z, .rar, etc.) using 7-Zip WASM
 */
export async function extractWithSevenZip(
  archiveBytes: Uint8Array,
  ext: string,
  password?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedArchiveItem[]> {
  onProgress?.(25, 'Spinning up 7-Zip WebAssembly extraction engine...');
  const sevenZip = await getSevenZipModule(
    (pct, msg) => onProgress?.(pct, msg),
    (line) => {
      if (line.includes('%')) {
        const match = line.match(/(\d+)%/);
        if (match) {
          const pct = parseInt(match[1], 10);
          onProgress?.(30 + Math.floor(pct * 0.5), `Unpacking archive (${pct}%)...`);
        }
      }
    }
  );

  const FS = sevenZip.FS;
  const session = Date.now();
  const archivePath = `/input_${session}.${ext.replace(/^\./, '')}`;
  const outDir = `/out_${session}`;

  try {
    onProgress?.(30, 'Mounting archive buffer in memory...');
    FS.writeFile(archivePath, archiveBytes);
    FS.mkdir(outDir);

    onProgress?.(45, 'Executing 7-Zip extraction command...');
    // 'x' = extract with full paths
    // '-o<dir>' = output directory (no space after -o)
    // '-y' = assume Yes on all queries
    // '-p<pass>' = password if provided
    const args = ['x', archivePath, `-o${outDir}`, '-y'];
    if (password) {
      args.push(`-p${password}`);
    }

    sevenZip.callMain(args);

    onProgress?.(75, 'Reading extracted files from virtual filesystem...');
    const extractedList = collectExtractedFiles(FS, outDir);

    if (extractedList.length === 0) {
      throw new Error(
        password
          ? 'Extraction produced no files. Password may be incorrect or archive is corrupt.'
          : 'Extraction produced no files. The archive may be encrypted or corrupted.'
      );
    }

    const items: ExtractedArchiveItem[] = [];
    for (let i = 0; i < extractedList.length; i++) {
      const file = extractedList[i];
      const name = file.relPath.split('/').filter(Boolean).pop() || file.relPath;
      const mime = guessMimeType(name);
      const preview = getPreviewType(name);
      const blob = new Blob([file.data], { type: mime });

      items.push({
        id: `7z-item-${i}-${Date.now()}`,
        path: file.relPath,
        name,
        size: file.data.length,
        isDir: false,
        lastModified: new Date(),
        mimeType: mime,
        data: file.data,
        url: URL.createObjectURL(blob),
        previewType: preview,
      });
    }

    return items;
  } finally {
    // Cleanup
    try {
      cleanupFSDir(FS, outDir);
      FS.rmdir(outDir);
    } catch {
      // ignore
    }
    try {
      FS.unlink(archivePath);
    } catch {
      // ignore
    }
  }
}
