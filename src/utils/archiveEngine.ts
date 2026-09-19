import {
  zip,
  unzip,
  gzip,
  gunzip,
  AsyncZipOptions,
  AsyncGzipOptions,
  AsyncGunzipOptions,
  AsyncUnzipOptions,
  Zippable,
  ZippableFile,
  strFromU8,
  strToU8,
} from 'fflate';
import { create7zArchive, extractWithSevenZip } from './sevenZipEngine';
import { extractRarArchive } from './rarEngine';

export interface StagedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export type CompressionFormat = 'zip' | '7z' | 'tar.gz' | 'tar' | 'gz';
export type CompressionLevel = 0 | 1 | 4 | 6 | 9; // 0: Store, 1: Fast, 4: Balanced, 6: High, 9: Maximum

export interface CompressionResult {
  blob: Blob;
  outputName: string;
  originalSize: number;
  compressedSize: number;
  ratio: number; // e.g. 45.2% saved
  elapsedMs: number;
  format: CompressionFormat;
  fileCount: number;
}

export interface ExtractedArchiveItem {
  id: string;
  path: string;
  name: string;
  size: number;
  compressedSize?: number;
  isDir: boolean;
  lastModified: Date;
  mimeType: string;
  data: Uint8Array;
  url?: string;
  previewType: 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'other';
}

export interface ExtractionResult {
  archiveName: string;
  archiveSize: number;
  totalUncompressedSize: number;
  files: ExtractedArchiveItem[];
  elapsedMs: number;
  formatDetected: string;
}

/**
 * Format bytes to readable string
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Determine file preview type based on path/name
 */
export function getPreviewType(filename: string): 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'other' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'weba'].includes(ext)) return 'audio';
  if (['txt', 'json', 'md', 'csv', 'ts', 'tsx', 'js', 'jsx', 'html', 'css', 'xml', 'yaml', 'yml', 'log', 'sh', 'env'].includes(ext)) return 'text';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

/**
 * Guess MIME type from file extension
 */
export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    txt: 'text/plain',
    json: 'application/json',
    md: 'text/markdown',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'text/plain',
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Simple POSIX TAR writer
 */
function createTarArchive(files: { name: string; data: Uint8Array; mtime: number }[]): Uint8Array {
  const blocks: Uint8Array[] = [];

  for (const f of files) {
    const header = new Uint8Array(512);
    // name (100)
    const nameBytes = strToU8(f.name.slice(0, 100));
    header.set(nameBytes, 0);

    // mode (8): 0000644\0
    header.set(strToU8('0000644\0'), 100);
    // uid (8): 0000000\0
    header.set(strToU8('0000000\0'), 108);
    // gid (8): 0000000\0
    header.set(strToU8('0000000\0'), 116);

    // size (12) in octal
    const sizeStr = f.data.length.toString(8).padStart(11, '0') + ' ';
    header.set(strToU8(sizeStr), 124);

    // mtime (12) in octal
    const mtimeSec = Math.floor(f.mtime / 1000);
    const mtimeStr = mtimeSec.toString(8).padStart(11, '0') + ' ';
    header.set(strToU8(mtimeStr), 136);

    // chksum (8) initial spaces
    header.set(strToU8('        '), 148);

    // typeflag (1): '0' normal file
    header[156] = 48; // '0'

    // magic (6): ustar\0
    header.set(strToU8('ustar\0'), 257);
    // version (2): 00
    header.set(strToU8('00'), 263);

    // Compute checksum
    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += header[i];
    }
    const chkStr = sum.toString(8).padStart(6, '0') + '\0 ';
    header.set(strToU8(chkStr), 148);

    blocks.push(header);
    blocks.push(f.data);

    // Padding to 512 bytes
    const rem = f.data.length % 512;
    if (rem > 0) {
      blocks.push(new Uint8Array(512 - rem));
    }
  }

  // End of archive: 1024 zero bytes (two 512-byte blocks)
  blocks.push(new Uint8Array(1024));

  // Combine into single Uint8Array
  const totalLen = blocks.reduce((acc, b) => acc + b.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of blocks) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

/**
 * Simple POSIX TAR parser
 */
function parseTarArchive(data: Uint8Array): { name: string; data: Uint8Array; mtime: number }[] {
  const result: { name: string; data: Uint8Array; mtime: number }[] = [];
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);

    // Check for two consecutive empty blocks (end of archive)
    let isZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isZero = false;
        break;
      }
    }
    if (isZero) break;

    // Read name
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++;
    const name = strFromU8(header.subarray(0, nameEnd));

    // Read size (octal)
    let sizeEnd = 124;
    while (sizeEnd < 136 && header[sizeEnd] !== 0 && header[sizeEnd] !== 32) sizeEnd++;
    const sizeStr = strFromU8(header.subarray(124, sizeEnd)).trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Read mtime (octal)
    let mtimeEnd = 136;
    while (mtimeEnd < 148 && header[mtimeEnd] !== 0 && header[mtimeEnd] !== 32) mtimeEnd++;
    const mtimeStr = strFromU8(header.subarray(136, mtimeEnd)).trim();
    const mtime = (parseInt(mtimeStr, 8) || 0) * 1000;

    // Type flag
    const typeFlag = String.fromCharCode(header[156]);

    offset += 512;

    if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '') {
      if (offset + size <= data.length) {
        const fileData = data.slice(offset, offset + size);
        result.push({ name, data: fileData, mtime: mtime || Date.now() });
      }
    }

    // Skip to next 512-byte boundary
    const rem = size % 512;
    offset += size + (rem > 0 ? 512 - rem : 0);
  }

  return result;
}

/**
 * Compress staged files into selected archive format
 */
export async function compressFiles(
  stagedFiles: StagedFile[],
  format: CompressionFormat,
  level: CompressionLevel,
  customArchiveName?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<CompressionResult> {
  if (stagedFiles.length === 0) {
    throw new Error('No files provided for compression.');
  }

  const startTime = Date.now();
  let totalOriginalSize = 0;
  onProgress?.(5, 'Reading input files into memory...');

  // Read all files to memory
  const loadedFiles: { name: string; data: Uint8Array; mtime: number }[] = [];
  for (let i = 0; i < stagedFiles.length; i++) {
    const sf = stagedFiles[i];
    const arrayBuffer = await sf.file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    loadedFiles.push({
      name: sf.name,
      data,
      mtime: sf.lastModified,
    });
    totalOriginalSize += data.length;
    onProgress?.(
      5 + Math.round(((i + 1) / stagedFiles.length) * 20),
      `Loaded ${sf.name} (${formatBytes(data.length)})`
    );
  }

  let finalBlob: Blob;
  let defaultExt = '.zip';

  if (format === 'zip') {
    defaultExt = '.zip';
    onProgress?.(30, `Compressing into ZIP archive (Level: ${level})...`);

    const zippableObj: Zippable = {};
    for (const f of loadedFiles) {
      zippableObj[f.name] = [
        f.data,
        {
          level: level as 0 | 1 | 4 | 6 | 9,
          mtime: new Date(f.mtime),
        },
      ];
    }

    const compressedU8 = await new Promise<Uint8Array>((resolve, reject) => {
      zip(
        zippableObj,
        { level: level as 0 | 1 | 4 | 6 | 9 },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });

    finalBlob = new Blob([compressedU8], { type: 'application/zip' });
  } else if (format === '7z') {
    defaultExt = '.7z';
    onProgress?.(30, `Compressing files into .7z archive using 7-Zip LZMA2 (Level: ${level})...`);
    const sevenZipBytes = await create7zArchive(loadedFiles, level, onProgress);
    finalBlob = new Blob([sevenZipBytes], { type: 'application/x-7z-compressed' });
  } else if (format === 'tar') {
    defaultExt = '.tar';
    onProgress?.(40, 'Packaging into POSIX TAR archive...');
    const tarData = createTarArchive(loadedFiles);
    finalBlob = new Blob([tarData], { type: 'application/x-tar' });
  } else if (format === 'tar.gz') {
    defaultExt = '.tar.gz';
    onProgress?.(30, 'Packaging files into TAR buffer...');
    const tarData = createTarArchive(loadedFiles);

    onProgress?.(50, `Gzip compressing TAR archive (Level: ${level})...`);
    const gzippedU8 = await new Promise<Uint8Array>((resolve, reject) => {
      gzip(
        tarData,
        { level: level as 0 | 1 | 4 | 6 | 9, mtime: new Date() },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });

    finalBlob = new Blob([gzippedU8], { type: 'application/gzip' });
  } else if (format === 'gz') {
    defaultExt = '.gz';
    // If multiple files in gz, bundle as tar first
    if (loadedFiles.length > 1) {
      defaultExt = '.tar.gz';
      const tarData = createTarArchive(loadedFiles);
      onProgress?.(45, `Compressing multiple files with Gzip...`);
      const gzippedU8 = await new Promise<Uint8Array>((resolve, reject) => {
        gzip(
          tarData,
          { level: level as 0 | 1 | 4 | 6 | 9 },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });
      finalBlob = new Blob([gzippedU8], { type: 'application/gzip' });
    } else {
      const single = loadedFiles[0];
      onProgress?.(40, `Compressing ${single.name} with Gzip...`);
      const gzippedU8 = await new Promise<Uint8Array>((resolve, reject) => {
        gzip(
          single.data,
          { level: level as 0 | 1 | 4 | 6 | 9, filename: single.name },
          (err, data) => {
            if (err) reject(err);
            else resolve(data);
          }
        );
      });
      finalBlob = new Blob([gzippedU8], { type: 'application/gzip' });
    }
  } else {
    throw new Error(`Unsupported compression format: ${format}`);
  }

  onProgress?.(95, 'Finalizing output archive...');

  let outputName = customArchiveName?.trim();
  if (!outputName) {
    if (loadedFiles.length === 1) {
      const base = loadedFiles[0].name.replace(/\.[^/.]+$/, '');
      outputName = `${base}${defaultExt}`;
    } else {
      outputName = `archive_${new Date().toISOString().slice(0, 10)}${defaultExt}`;
    }
  } else if (!outputName.toLowerCase().endsWith(defaultExt)) {
    outputName = `${outputName}${defaultExt}`;
  }

  const elapsedMs = Date.now() - startTime;
  const compressedSize = finalBlob.size;
  const ratio =
    totalOriginalSize > 0
      ? Math.max(0, Math.round(((totalOriginalSize - compressedSize) / totalOriginalSize) * 1000) / 10)
      : 0;

  onProgress?.(100, 'Compression complete!');

  return {
    blob: finalBlob,
    outputName,
    originalSize: totalOriginalSize,
    compressedSize,
    ratio,
    elapsedMs,
    format,
    fileCount: loadedFiles.length,
  };
}

/**
 * Decompress / extract any supported archive file
 */
export async function decompressArchive(
  archiveFile: File,
  options?: { password?: string } | ((percent: number, status: string) => void),
  maybeProgress?: (percent: number, status: string) => void
): Promise<ExtractionResult> {
  // Support both (file, onProgress) and (file, { password }, onProgress)
  const password = typeof options === 'object' && options !== null ? options.password : undefined;
  const onProgress = typeof options === 'function' ? options : maybeProgress;

  const startTime = Date.now();
  const archiveName = archiveFile.name;
  const archiveSize = archiveFile.size;

  onProgress?.(10, `Reading archive "${archiveName}" (${formatBytes(archiveSize)})...`);
  const arrayBuffer = await archiveFile.arrayBuffer();
  const rawBytes = new Uint8Array(arrayBuffer);

  const lowerName = archiveName.toLowerCase();
  const items: ExtractedArchiveItem[] = [];
  let formatDetected = 'ZIP';

  // Check magic bytes for 7z ('7z\xBC\xAF\x27\x1C')
  const is7z =
    (rawBytes.length >= 6 &&
      rawBytes[0] === 0x37 &&
      rawBytes[1] === 0x7a &&
      rawBytes[2] === 0xbc &&
      rawBytes[3] === 0xaf &&
      rawBytes[4] === 0x27 &&
      rawBytes[5] === 0x1c) ||
    lowerName.endsWith('.7z');

  // Check magic bytes for RAR ('Rar!\x1A\x07')
  const isRar =
    (rawBytes.length >= 7 &&
      rawBytes[0] === 0x52 &&
      rawBytes[1] === 0x61 &&
      rawBytes[2] === 0x72 &&
      rawBytes[3] === 0x21 &&
      rawBytes[4] === 0x1a &&
      rawBytes[5] === 0x07) ||
    lowerName.endsWith('.rar');

  // Check magic bytes for ZIP ('PK\x03\x04')
  const isZip =
    rawBytes.length >= 4 &&
    rawBytes[0] === 0x50 &&
    rawBytes[1] === 0x4b &&
    (rawBytes[2] === 0x03 || rawBytes[2] === 0x05 || rawBytes[2] === 0x07);

  const isGzip = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
  const isTar = lowerName.endsWith('.tar') || (!isZip && !isGzip && !is7z && !isRar && rawBytes.length >= 512);

  if (is7z) {
    formatDetected = '7-Zip Archive (.7z)';
    onProgress?.(20, 'Opening .7z archive with 7-Zip WebAssembly core...');
    const extractedItems = await extractWithSevenZip(rawBytes, '7z', password, onProgress);
    items.push(...extractedItems);
  } else if (isRar) {
    formatDetected = 'RAR Archive (.rar)';
    onProgress?.(20, 'Opening .rar archive with UnRAR WebAssembly core...');
    const extractedItems = await extractRarArchive(rawBytes, password, onProgress);
    items.push(...extractedItems);
  } else if (isZip || lowerName.endsWith('.zip')) {
    formatDetected = 'ZIP Archive';
    onProgress?.(30, 'Unzipping archive records...');

    const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(rawBytes, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    onProgress?.(70, 'Building extracted file structure...');

    let index = 0;
    for (const [pathKey, fileData] of Object.entries(unzipped)) {
      index++;
      const isDir = pathKey.endsWith('/');
      const cleanPath = pathKey.replace(/^\/+/, '');
      const name = cleanPath.split('/').filter(Boolean).pop() || cleanPath;

      if (!isDir && fileData.length > 0) {
        const mime = guessMimeType(name);
        const blob = new Blob([fileData], { type: mime });
        const preview = getPreviewType(name);

        items.push({
          id: `zip-item-${index}-${Date.now()}`,
          path: cleanPath,
          name,
          size: fileData.length,
          isDir: false,
          lastModified: new Date(archiveFile.lastModified || Date.now()),
          mimeType: mime,
          data: fileData,
          url: URL.createObjectURL(blob),
          previewType: preview,
        });
      }
    }
  } else if (isGzip || lowerName.endsWith('.gz') || lowerName.endsWith('.tgz')) {
    onProgress?.(30, 'Decompressing GZIP stream...');

    const decompressedU8 = await new Promise<Uint8Array>((resolve, reject) => {
      gunzip(rawBytes, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Check if decompressed stream is a TAR archive
    const isInnerTar =
      lowerName.endsWith('.tar.gz') ||
      lowerName.endsWith('.tgz') ||
      (decompressedU8.length >= 512 &&
        String.fromCharCode(...decompressedU8.subarray(257, 262)) === 'ustar');

    if (isInnerTar) {
      formatDetected = 'TAR.GZ Archive';
      onProgress?.(60, 'Parsing nested TAR archive records...');
      const tarRecords = parseTarArchive(decompressedU8);

      let idx = 0;
      for (const rec of tarRecords) {
        idx++;
        const mime = guessMimeType(rec.name);
        const blob = new Blob([rec.data], { type: mime });
        items.push({
          id: `tar-item-${idx}-${Date.now()}`,
          path: rec.name,
          name: rec.name.split('/').filter(Boolean).pop() || rec.name,
          size: rec.data.length,
          isDir: false,
          lastModified: new Date(rec.mtime),
          mimeType: mime,
          data: rec.data,
          url: URL.createObjectURL(blob),
          previewType: getPreviewType(rec.name),
        });
      }
    } else {
      formatDetected = 'GZIP Single File';
      onProgress?.(70, 'Preparing decompressed file...');

      let targetName = archiveName.replace(/\.gz$/i, '');
      if (targetName === archiveName) targetName = `${archiveName}_extracted`;

      const mime = guessMimeType(targetName);
      const blob = new Blob([decompressedU8], { type: mime });
      items.push({
        id: `gz-single-${Date.now()}`,
        path: targetName,
        name: targetName,
        size: decompressedU8.length,
        isDir: false,
        lastModified: new Date(archiveFile.lastModified || Date.now()),
        mimeType: mime,
        data: decompressedU8,
        url: URL.createObjectURL(blob),
        previewType: getPreviewType(targetName),
      });
    }
  } else if (isTar) {
    formatDetected = 'POSIX TAR Archive';
    onProgress?.(40, 'Extracting TAR archive records...');
    const tarRecords = parseTarArchive(rawBytes);

    let idx = 0;
    for (const rec of tarRecords) {
      idx++;
      const mime = guessMimeType(rec.name);
      const blob = new Blob([rec.data], { type: mime });
      items.push({
        id: `tar-item-${idx}-${Date.now()}`,
        path: rec.name,
        name: rec.name.split('/').filter(Boolean).pop() || rec.name,
        size: rec.data.length,
        isDir: false,
        lastModified: new Date(rec.mtime),
        mimeType: mime,
        data: rec.data,
        url: URL.createObjectURL(blob),
        previewType: getPreviewType(rec.name),
      });
    }
  } else {
    // Attempt fallback unzip or gunzip
    try {
      formatDetected = 'Auto-Detected Archive';
      onProgress?.(30, 'Attempting auto-decompression...');
      const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(rawBytes, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      let index = 0;
      for (const [pathKey, fileData] of Object.entries(unzipped)) {
        index++;
        const cleanPath = pathKey.replace(/^\/+/, '');
        const name = cleanPath.split('/').filter(Boolean).pop() || cleanPath;
        if (!cleanPath.endsWith('/') && fileData.length > 0) {
          const mime = guessMimeType(name);
          const blob = new Blob([fileData], { type: mime });
          items.push({
            id: `item-${index}-${Date.now()}`,
            path: cleanPath,
            name,
            size: fileData.length,
            isDir: false,
            lastModified: new Date(),
            mimeType: mime,
            data: fileData,
            url: URL.createObjectURL(blob),
            previewType: getPreviewType(name),
          });
        }
      }
    } catch (e: any) {
      if (e?.message && !e.message.includes('unexpected end of file')) {
        throw e;
      }
      throw new Error(
        'Unable to unpack archive. Ensure the file is a valid .7z, .rar, .zip, .tar.gz, .tgz, .tar, or .gz file.'
      );
    }
  }

  const totalUncompressedSize = items.reduce((sum, item) => sum + item.size, 0);
  const elapsedMs = Date.now() - startTime;
  onProgress?.(100, `Successfully extracted ${items.length} files in ${(elapsedMs / 1000).toFixed(1)}s.`);

  return {
    archiveName,
    archiveSize,
    totalUncompressedSize,
    files: items,
    elapsedMs,
    formatDetected,
  };
}
