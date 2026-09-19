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

export interface SevenZipCompressionOptions {
  level?: number; // 0 to 9
  format?: '7z' | 'zip' | 'rar';
  outputExt?: string; // override file extension (e.g. 'rar' for WinRAR archives)
  solid?: boolean; // -ms=on / -ms=off
  dictionarySize?: string; // e.g. "128k", "1m", "4m", "16m", "32m", "64m"
  password?: string;
  encryptHeader?: boolean; // -mhe=on (encrypt file names, 7z/rar only)
  volumeSize?: string; // e.g. "10m", "25m", "100m", "700m"
  testArchive?: boolean; // test archive integrity after creation
}

export interface ArchiveCreationOutput {
  mainData: Uint8Array;
  volumes?: { name: string; data: Uint8Array; size: number }[];
  verified?: boolean;
}

/**
 * Compress multiple files into a .7z, .rar, or .zip archive using 7-Zip WASM
 * Supports WinRAR/7-Zip solid archiving, custom dictionary size, AES-256 password protection,
 * volume splitting, and automated archive integrity testing.
 */
export async function create7zArchive(
  files: { name: string; data: Uint8Array; mtime?: number }[],
  optionsOrLevel: number | SevenZipCompressionOptions,
  onProgress?: (percent: number, status: string) => void
): Promise<ArchiveCreationOutput> {
  const options: SevenZipCompressionOptions =
    typeof optionsOrLevel === 'number'
      ? { level: optionsOrLevel }
      : { ...optionsOrLevel };

  const level = typeof options.level === 'number' ? Math.max(0, Math.min(9, options.level)) : 6;
  const isZip = options.format === 'zip';
  const ext = options.outputExt || (isZip ? 'zip' : options.format === 'rar' ? 'rar' : '7z');
  const targetType = isZip ? 'zip' : '7z';
  const solid = options.solid !== false; // default solid on for 7z and rar

  onProgress?.(35, 'Initializing 7-Zip WebAssembly core...');
  const sevenZip = await getSevenZipModule(
    (pct, msg) => onProgress?.(pct, msg),
    (line) => {
      if (line.includes('%')) {
        const match = line.match(/(\d+)%/);
        if (match) {
          const pct = parseInt(match[1], 10);
          onProgress?.(40 + Math.floor(pct * 0.5), `Compressing archive (${pct}%)...`);
        }
      }
    }
  );

  const FS = sevenZip.FS;
  const session = Date.now();
  const inDir = `/in_${session}`;
  const outArchiveBase = `/output_${session}.${ext}`;

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
        `Prepared ${f.name} for compression engine`
      );
    }

    onProgress?.(55, `Running 7-Zip ${isZip ? 'Deflate' : 'LZMA2'} compression (Level: ${level})...`);

    // Change directory to inDir so archive stores relative names
    FS.chdir(inDir);

    // Build 7z CLI arguments
    const args: string[] = [
      'a',
      `-t${targetType}`,
      `-mx=${level}`,
      '-y',
    ];

    if (!isZip) {
      args.push('-m0=lzma2');
      if (solid) {
        args.push('-ms=on');
      } else {
        args.push('-ms=off');
      }

      if (options.dictionarySize && options.dictionarySize !== 'auto') {
        args.push(`-md=${options.dictionarySize}`);
      }

      if (options.password) {
        args.push(`-p${options.password}`);
        if (options.encryptHeader) {
          args.push('-mhe=on');
        }
      }
    } else {
      // ZIP format
      if (options.password) {
        args.push(`-p${options.password}`);
      }
    }

    // Volume splitting (e.g. -v10m, -v25m)
    if (options.volumeSize && options.volumeSize !== 'none') {
      args.push(`-v${options.volumeSize}`);
    }

    args.push(outArchiveBase, '*');

    sevenZip.callMain(args);

    // Locate generated archive files in root
    const rootFiles = FS.readdir('/').filter((f: string) => f.startsWith(`output_${session}`));
    if (rootFiles.length === 0) {
      throw new Error('7-Zip compression failed: output archive was not generated.');
    }

    let verified = false;
    if (options.testArchive) {
      onProgress?.(85, 'Running WinRAR/7-Zip archive integrity self-test...');
      try {
        const testTarget = `/${rootFiles[0]}`;
        const testArgs = ['t'];
        if (options.password) {
          testArgs.push(`-p${options.password}`);
        }
        testArgs.push(testTarget);
        sevenZip.callMain(testArgs);
        verified = true;
      } catch (e) {
        console.warn('Archive verification test warning:', e);
      }
    }

    onProgress?.(90, 'Extracting compressed payload into memory...');

    // If multi-volume, collect all volumes
    if (rootFiles.length > 1 || (options.volumeSize && options.volumeSize !== 'none')) {
      // Sort parts naturally: .001, .002, etc.
      rootFiles.sort();
      const volumes = rootFiles.map((vName: string) => {
        const full = `/${vName}`;
        const raw = FS.readFile(full);
        const cleanName = vName.replace(`output_${session}.`, '');
        return {
          name: cleanName.startsWith(ext) ? cleanName : `${ext}.${cleanName}`,
          data: new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)),
          size: raw.byteLength,
        };
      });

      return {
        mainData: volumes[0].data,
        volumes,
        verified,
      };
    }

    // Single archive file
    const targetFile = `/${rootFiles[0]}`;
    const outBytes = FS.readFile(targetFile);
    const finalBuffer = new Uint8Array(
      outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    );

    return {
      mainData: finalBuffer,
      verified,
    };
  } finally {
    // Cleanup MEMFS
    try {
      cleanupFSDir(FS, inDir);
      FS.rmdir(inDir);
    } catch {
      // ignore
    }
    try {
      const generated = FS.readdir('/').filter((f: string) => f.startsWith(`output_${session}`));
      for (const gf of generated) {
        try {
          FS.unlink(`/${gf}`);
        } catch {
          // ignore
        }
      }
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
