import { relocateMoovToFrontZeroCopy } from '../utils/mp4FastStart';

declare function importScripts(...urls: string[]): void;
declare class FileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer;
}

const CORE_URL = '/ffmpeg/core/ffmpeg-core.js';

const FFMessageType = {
  LOAD: 'LOAD',
  EXEC: 'EXEC',
  FFPROBE: 'FFPROBE',
  WRITE_FILE: 'WRITE_FILE',
  READ_FILE: 'READ_FILE',
  DELETE_FILE: 'DELETE_FILE',
  RENAME: 'RENAME',
  CREATE_DIR: 'CREATE_DIR',
  LIST_DIR: 'LIST_DIR',
  DELETE_DIR: 'DELETE_DIR',
  ERROR: 'ERROR',
  DOWNLOAD: 'DOWNLOAD',
  PROGRESS: 'PROGRESS',
  LOG: 'LOG',
  MOUNT: 'MOUNT',
  UNMOUNT: 'UNMOUNT',
} as const;

const ERROR_UNKNOWN_MESSAGE_TYPE = new Error('unknown message type');
const ERROR_NOT_LOADED = new Error('ffmpeg is not loaded, call `await ffmpeg.load()` first');
const ERROR_IMPORT_FAILURE = new Error('failed to import ffmpeg-core.js');

/**
 * Adaptive I/O buffer & page sizing:
 * - Mobile (Snapdragon / MediaTek / iOS): 4 MB buffered I/O windows + 8 MB paged fallback (strict <= 48 MB RAM)
 * - Desktop / iPad M-Series: 8 MB buffered I/O windows + 16 MB paged fallback
 *
 * Batching tiny 4 KB - 32 KB FFmpeg avio syscalls into 4 MB - 8 MB bulk reads/writes cuts
 * Android ContentProvider (WORKERFS) and UFS/Mojo (OPFS) IPC round-trips by 100x - 500x.
 */
const IS_ANDROID_WORKER =
  typeof self !== 'undefined' && /Android/i.test((self as any).navigator?.userAgent || '');
const IS_MOBILE_WORKER =
  typeof self !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test((self as any).navigator?.userAgent || '');

const PAGE_SIZE = IS_MOBILE_WORKER ? 8 * 1024 * 1024 : 16 * 1024 * 1024; // 8 MB mobile / 16 MB desktop
const MAX_RAM_PAGES = 4; // Max 32 MB (mobile) or 64 MB (desktop) active pages per file
const WORKERFS_READ_AHEAD_BYTES = IS_MOBILE_WORKER ? 4 * 1024 * 1024 : 8 * 1024 * 1024; // 4 MB mobile / 8 MB desktop
const OPFS_WRITE_BUF_BYTES = IS_MOBILE_WORKER ? 4 * 1024 * 1024 : 8 * 1024 * 1024; // 4 MB mobile / 8 MB desktop
const OPFS_READ_AHEAD_BYTES = IS_MOBILE_WORKER ? 4 * 1024 * 1024 : 8 * 1024 * 1024;

interface DiskPage {
  u8: Uint8Array | null;
  blob: Blob | null;
  lastAccess: number;
}

interface OpfsEntry {
  fileHandle: FileSystemFileHandle;
  syncHandle: any;
  opfsName: string;
}

let ffmpeg: any;
let syncReader: FileReaderSync | null = null;
let accessTick = 0;

// Map of filename -> pre-allocated OPFS SyncAccessHandle for 0-RAM direct SSD output
const opfsHandleByName = new Map<string, OpfsEntry>();
const activeOpfsFileNames = new Set<string>();

// Reusable worker-level non-shared buffers to eliminate per-call GC allocations on mobile
let sharedOpfsWriteBuf: Uint8Array | null = null;
let sharedOpfsReadBuf: Uint8Array | null = null;
let sharedWorkerFsReadBuf: Uint8Array | null = null;
let activeOpfsWriteNode: any = null;
let activeOpfsReadNode: any = null;
let activeWorkerFsNode: any = null;
let activeWorkerFsStart = 0;
let activeWorkerFsLen = 0;

// Throttle state for worker -> main thread progress/status messages
let lastProgressPostAt = 0;
let lastStatusLogPostAt = 0;
let isProbeExec = false;

function getSyncReader(): FileReaderSync {
  if (!syncReader) {
    syncReader = new FileReaderSync();
  }
  return syncReader;
}

function getOpfsWriteBuf(): Uint8Array {
  if (!sharedOpfsWriteBuf) {
    sharedOpfsWriteBuf = new Uint8Array(OPFS_WRITE_BUF_BYTES);
  }
  return sharedOpfsWriteBuf;
}

function getOpfsReadBuf(): Uint8Array {
  if (!sharedOpfsReadBuf) {
    sharedOpfsReadBuf = new Uint8Array(OPFS_READ_AHEAD_BYTES);
  }
  return sharedOpfsReadBuf;
}

function getWorkerFsReadBuf(): Uint8Array {
  if (!sharedWorkerFsReadBuf) {
    sharedWorkerFsReadBuf = new Uint8Array(WORKERFS_READ_AHEAD_BYTES);
  }
  return sharedWorkerFsReadBuf;
}

function clearWorkerFsReadAhead(): void {
  activeWorkerFsNode = null;
  activeWorkerFsStart = 0;
  activeWorkerFsLen = 0;
}

function invalidateOpfsReadCache(node: any): void {
  if (!node) return;
  node._opfsReadStart = 0;
  node._opfsReadLen = 0;
}

/**
 * Flush any buffered sequential writes on an OPFS node in ONE single bulk syscall.
 * Because `sharedOpfsWriteBuf` is always backed by a regular (non-shared) ArrayBuffer,
 * `syncHandle.write()` works natively on both Android Chrome and iOS Safari/WebKit.
 */
function flushOpfsWriteBuffer(node: any): void {
  if (!node || !node.opfsSyncHandle || !node._opfsWriteLen) return;
  const buf: Uint8Array = node._opfsWriteBuf || getOpfsWriteBuf();
  const len: number = node._opfsWriteLen;
  const startPos: number = node._opfsWriteStart || 0;

  let writtenTotal = 0;
  while (writtenTotal < len) {
    const view = buf.subarray(writtenTotal, len);
    const written = node.opfsSyncHandle.write(view, { at: startPos + writtenTotal });
    writtenTotal += written > 0 ? written : len - writtenTotal;
  }

  node._opfsWriteLen = 0;
  if (activeOpfsWriteNode === node) {
    activeOpfsWriteNode = null;
  }
  invalidateOpfsReadCache(node);
}

/**
 * Attempt to pre-allocate an OPFS FileSystemSyncAccessHandle before ffmpeg.exec runs
 * so all output writes stream directly to device UFS/SSD with minimal RAM.
 */
async function prepareOpfsForOutput(outputFilename: string): Promise<void> {
  if (!outputFilename || outputFilename.startsWith('-')) return;
  const cleanName = outputFilename.split('/').filter(Boolean).pop() || outputFilename;
  if (!cleanName || cleanName.startsWith('.')) return;

  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();

    // Clean up any stale OPFS files from older runs
    for (const oldName of Array.from(activeOpfsFileNames)) {
      try {
        await root.removeEntry(oldName);
      } catch {}
      activeOpfsFileNames.delete(oldName);
    }

    const opfsName = `ffmpeg_out_${Date.now()}_${cleanName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fileHandle = await root.getFileHandle(opfsName, { create: true });
    if (typeof (fileHandle as any).createSyncAccessHandle !== 'function') return;

    const syncHandle = await (fileHandle as any).createSyncAccessHandle();
    syncHandle.truncate(0);

    activeOpfsFileNames.add(opfsName);
    opfsHandleByName.set(cleanName, { fileHandle, syncHandle, opfsName });
  } catch {
    // OPFS SyncAccessHandle unavailable (e.g. cross-origin iframe or private mode);
    // Paged Blob Storage automatically handles the file.
  }
}

function ensurePageInRam(node: any, pageIdx: number): Uint8Array {
  if (!node.pages) {
    node.pages = [] as DiskPage[];
  }
  let page: DiskPage = node.pages[pageIdx];
  if (!page) {
    page = {
      u8: new Uint8Array(PAGE_SIZE),
      blob: null,
      lastAccess: ++accessTick,
    };
    node.pages[pageIdx] = page;
  } else if (!page.u8 && page.blob) {
    const ab = getSyncReader().readAsArrayBuffer(page.blob);
    const u8 = new Uint8Array(PAGE_SIZE);
    u8.set(new Uint8Array(ab));
    page.u8 = u8;
    page.blob = null;
  }
  page.lastAccess = ++accessTick;

  // Enforce strict RAM ceiling: seal least-recently-used pages into disk-backed Blobs
  let ramPageCount = 0;
  for (let i = 0; i < node.pages.length; i++) {
    if (node.pages[i] && node.pages[i].u8 !== null) {
      ramPageCount++;
    }
  }

  while (ramPageCount > MAX_RAM_PAGES) {
    let victimIdx = -1;
    let oldestAccess = Infinity;
    for (let i = 0; i < node.pages.length; i++) {
      const p = node.pages[i];
      // Keep page 0 (container header) and current pageIdx in RAM
      if (p && p.u8 !== null && i !== pageIdx && i !== 0) {
        if (p.lastAccess < oldestAccess) {
          oldestAccess = p.lastAccess;
          victimIdx = i;
        }
      }
    }
    if (victimIdx === -1) break;
    const victim = node.pages[victimIdx];
    victim.blob = new Blob([victim.u8!]);
    victim.u8 = null;
    ramPageCount--;
  }

  return page.u8!;
}

function freeNodeStorage(node: any): void {
  if (!node) return;
  if (node.opfsSyncHandle) {
    try {
      flushOpfsWriteBuffer(node);
    } catch {}
    try {
      node.opfsSyncHandle.flush();
    } catch {}
    try {
      node.opfsSyncHandle.close();
    } catch {}
    node.opfsSyncHandle = null;
  }
  node._opfsWriteBuf = null;
  node._opfsWriteLen = 0;
  node._opfsReadStart = 0;
  node._opfsReadLen = 0;

  if (node.pages) {
    for (let i = 0; i < node.pages.length; i++) {
      if (node.pages[i]) {
        node.pages[i].u8 = null;
        node.pages[i].blob = null;
      }
    }
    node.pages = [];
  }
  node.contents = null;
  node.usedBytes = 0;
}

/**
 * Installs a 4 MB / 8 MB sequential read-ahead buffer in front of Emscripten's WORKERFS.
 * Turns 100,000+ tiny Android ContentProvider / FileReaderSync IPC calls into ~250 bulk reads.
 */
function installBufferedWorkerFS(ffmpegInstance: any): void {
  const FS = ffmpegInstance?.FS;
  const WORKERFS = FS?.filesystems?.WORKERFS;
  if (!FS || !WORKERFS || !WORKERFS.stream_ops?.read) return;

  const origWorkerRead = WORKERFS.stream_ops.read;

  const bufferedWorkerRead = function (
    stream: any,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ): number {
    const node = stream?.node;
    const blob: Blob | undefined = node?.contents;
    if (!blob || typeof blob.slice !== 'function') {
      return origWorkerRead(stream, buffer, offset, length, position);
    }

    const fileSize = typeof node.size === 'number' ? node.size : blob.size;
    if (position >= fileSize || length <= 0) return 0;

    const toRead = Math.min(length, fileSize - position);

    // Very large single reads (>= window size) go directly in one bulk FileReaderSync call
    if (toRead >= WORKERFS_READ_AHEAD_BYTES) {
      const ab = getSyncReader().readAsArrayBuffer(blob.slice(position, position + toRead));
      const u8 = new Uint8Array(ab);
      buffer.set(u8, offset);
      return u8.byteLength;
    }

    // Fast path: requested range is fully inside our active read-ahead window (0 IPC!)
    if (
      activeWorkerFsNode === node &&
      position >= activeWorkerFsStart &&
      position + toRead <= activeWorkerFsStart + activeWorkerFsLen
    ) {
      const raBuf = getWorkerFsReadBuf();
      const rel = position - activeWorkerFsStart;
      buffer.set(raBuf.subarray(rel, rel + toRead), offset);
      return toRead;
    }

    // Cache miss: refill one full 4 MB / 8 MB sequential read-ahead block in a single IPC call
    const fetchEnd = Math.min(fileSize, position + WORKERFS_READ_AHEAD_BYTES);
    const ab = getSyncReader().readAsArrayBuffer(blob.slice(position, fetchEnd));
    const fetched = new Uint8Array(ab);
    const raBuf = getWorkerFsReadBuf();
    raBuf.set(fetched, 0);

    activeWorkerFsNode = node;
    activeWorkerFsStart = position;
    activeWorkerFsLen = fetched.byteLength;

    const actual = Math.min(toRead, fetched.byteLength);
    buffer.set(raBuf.subarray(0, actual), offset);
    return actual;
  };

  WORKERFS.stream_ops.read = bufferedWorkerRead;
  if (WORKERFS.ops_table?.file?.stream) {
    WORKERFS.ops_table.file.stream.read = bufferedWorkerRead;
  }
}

/**
 * Upgrades Emscripten's MEMFS inside ffmpeg.FS so that files of ANY size (2 GB, 3 GB, 10 GB)
 * stream via buffered 4 MB/8 MB OPFS write-back (or Paged Blob Storage fallback) with low RAM
 * and minimal Android flash IPC overhead.
 */
function installLargeFilePagedFS(ffmpegInstance: any): void {
  const FS = ffmpegInstance?.FS;
  const MEMFS = FS?.filesystems?.MEMFS;
  if (!FS || !MEMFS) return;

  const origCreateNode = MEMFS.createNode.bind(MEMFS);
  MEMFS.createNode = function (parent: any, name: string, mode: number, dev: number) {
    const node = origCreateNode(parent, name, mode, dev);
    if (FS.isFile(node.mode)) {
      node.pages = [] as DiskPage[];
      node.usedBytes = 0;
      node.contents = null;
      node._opfsWriteLen = 0;
      node._opfsWriteStart = 0;
      node._opfsReadStart = 0;
      node._opfsReadLen = 0;
      const opfs = opfsHandleByName.get(name);
      if (opfs) {
        node.opfsSyncHandle = opfs.syncHandle;
        node.opfsFileHandle = opfs.fileHandle;
        node.opfsName = opfs.opfsName;
        opfsHandleByName.delete(name);
      }
    }
    return node;
  };

  MEMFS.expandFileStorage = function (node: any, newCapacity: number) {
    if (node.opfsSyncHandle) return;
    if (!node.pages) node.pages = [];
    if (newCapacity > 0) {
      const lastPageIdx = Math.floor((newCapacity - 1) / PAGE_SIZE);
      ensurePageInRam(node, lastPageIdx);
    }
  };

  MEMFS.resizeFileStorage = function (node: any, newSize: number) {
    if (node.opfsSyncHandle) {
      flushOpfsWriteBuffer(node);
      invalidateOpfsReadCache(node);
      try {
        node.opfsSyncHandle.truncate(newSize);
      } catch {}
      node.usedBytes = newSize;
      return;
    }
    if (newSize === 0) {
      if (node.pages) {
        for (let i = 0; i < node.pages.length; i++) {
          if (node.pages[i]) {
            node.pages[i].u8 = null;
            node.pages[i].blob = null;
          }
        }
        node.pages = [];
      }
      node.contents = null;
      node.usedBytes = 0;
      return;
    }
    if (node.pages && newSize < node.usedBytes) {
      const keepPages = Math.ceil(newSize / PAGE_SIZE);
      for (let i = keepPages; i < node.pages.length; i++) {
        if (node.pages[i]) {
          node.pages[i].u8 = null;
          node.pages[i].blob = null;
        }
      }
      node.pages.length = keepPages;
    }
    node.usedBytes = newSize;
  };

  MEMFS.getFileDataAsTypedArray = function (node: any): Uint8Array {
    if (!node || !node.usedBytes) return new Uint8Array(0);
    if (node.opfsSyncHandle) {
      flushOpfsWriteBuffer(node);
      node.opfsSyncHandle.flush();
      const out = new Uint8Array(node.usedBytes);
      node.opfsSyncHandle.read(out, { at: 0 });
      return out;
    }
    if (node.pages && node.pages.length > 0) {
      const out = new Uint8Array(node.usedBytes);
      let pos = 0;
      let rem = node.usedBytes;
      while (rem > 0) {
        const pageIdx = Math.floor(pos / PAGE_SIZE);
        const pageOff = pos - pageIdx * PAGE_SIZE;
        const chunk = Math.min(rem, PAGE_SIZE - pageOff);
        const p = node.pages[pageIdx];
        if (p) {
          if (p.u8) {
            out.set(p.u8.subarray(pageOff, pageOff + chunk), pos);
          } else if (p.blob) {
            const ab = getSyncReader().readAsArrayBuffer(p.blob.slice(pageOff, pageOff + chunk));
            out.set(new Uint8Array(ab), pos);
          }
        }
        pos += chunk;
        rem -= chunk;
      }
      return out;
    }
    if (node.contents && node.contents.subarray) {
      return node.contents.subarray(0, node.usedBytes);
    }
    return new Uint8Array(0);
  };

  const customStreamRead = function (
    stream: any,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ): number {
    const node = stream.node;
    if (position >= node.usedBytes || length <= 0) return 0;
    const size = Math.min(node.usedBytes - position, length);

    if (node.opfsSyncHandle) {
      // Flush pending writes first so reads always see coherent bytes
      if (node._opfsWriteLen > 0) {
        flushOpfsWriteBuffer(node);
      }

      const readBuf = getOpfsReadBuf();
      const readStart: number = node._opfsReadStart || 0;
      const readLen: number = node._opfsReadLen || 0;

      // Fast path: serve from 4 MB / 8 MB OPFS read-ahead buffer (0 IPC!)
      if (
        activeOpfsReadNode === node &&
        size <= OPFS_READ_AHEAD_BYTES &&
        position >= readStart &&
        position + size <= readStart + readLen
      ) {
        const rel = position - readStart;
        buffer.set(readBuf.subarray(rel, rel + size), offset);
        return size;
      }

      // Medium/small miss: refill 4 MB / 8 MB read-ahead buffer in one bulk syscall
      if (size < OPFS_READ_AHEAD_BYTES) {
        const toFetch = Math.min(OPFS_READ_AHEAD_BYTES, node.usedBytes - position);
        const got = node.opfsSyncHandle.read(readBuf.subarray(0, toFetch), { at: position });
        activeOpfsReadNode = node;
        node._opfsReadStart = position;
        node._opfsReadLen = got > 0 ? got : 0;
        const actual = Math.min(size, node._opfsReadLen);
        if (actual > 0) {
          buffer.set(readBuf.subarray(0, actual), offset);
        }
        return actual;
      }

      // Large read (>= window): stream in 4 MB / 8 MB chunks via non-shared readBuf
      activeOpfsReadNode = null;
      invalidateOpfsReadCache(node);
      let totalRead = 0;
      while (totalRead < size) {
        const step = Math.min(size - totalRead, OPFS_READ_AHEAD_BYTES);
        const got = node.opfsSyncHandle.read(readBuf.subarray(0, step), { at: position + totalRead });
        if (got <= 0) break;
        buffer.set(readBuf.subarray(0, got), offset + totalRead);
        totalRead += got;
        if (got < step) break;
      }
      return totalRead;
    }

    let remaining = size;
    let curPos = position;
    let curOffset = offset;
    while (remaining > 0) {
      const pageIdx = Math.floor(curPos / PAGE_SIZE);
      const pageOff = curPos - pageIdx * PAGE_SIZE;
      const chunk = Math.min(remaining, PAGE_SIZE - pageOff);
      const page: DiskPage | undefined = node.pages ? node.pages[pageIdx] : undefined;

      if (!page) {
        buffer.fill(0, curOffset, curOffset + chunk);
      } else if (page.u8) {
        page.lastAccess = ++accessTick;
        buffer.set(page.u8.subarray(pageOff, pageOff + chunk), curOffset);
      } else if (page.blob) {
        const slice = page.blob.slice(pageOff, pageOff + chunk);
        const ab = getSyncReader().readAsArrayBuffer(slice);
        buffer.set(new Uint8Array(ab), curOffset);
      }

      curPos += chunk;
      curOffset += chunk;
      remaining -= chunk;
    }
    return size;
  };

  const customStreamWrite = function (
    stream: any,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ): number {
    if (length <= 0) return 0;
    const node = stream.node;
    node.timestamp = Date.now();

    // Attach pre-allocated OPFS handle if registered for this filename
    if (!node.opfsSyncHandle && node.name && opfsHandleByName.has(node.name)) {
      const opfs = opfsHandleByName.get(node.name)!;
      node.opfsSyncHandle = opfs.syncHandle;
      node.opfsFileHandle = opfs.fileHandle;
      node.opfsName = opfs.opfsName;
      node._opfsWriteLen = 0;
      node._opfsWriteStart = 0;
      opfsHandleByName.delete(node.name);
    }

    if (node.opfsSyncHandle) {
      if (activeOpfsWriteNode && activeOpfsWriteNode !== node) {
        flushOpfsWriteBuffer(activeOpfsWriteNode);
      }
      const wBuf = getOpfsWriteBuf();
      activeOpfsWriteNode = node;
      node._opfsWriteBuf = wBuf;

      let curSrcOffset = offset;
      let curPos = position;
      let remaining = length;

      while (remaining > 0) {
        const curLen: number = node._opfsWriteLen || 0;
        const curStart: number = node._opfsWriteStart || 0;

        // If buffer has data and incoming write is non-contiguous (e.g. header seek), flush first
        if (curLen > 0 && curPos !== curStart + curLen) {
          flushOpfsWriteBuffer(node);
        }

        const afterFlushLen: number = node._opfsWriteLen || 0;
        if (afterFlushLen === 0) {
          node._opfsWriteStart = curPos;
        }

        const spaceLeft = OPFS_WRITE_BUF_BYTES - afterFlushLen;
        const copyLen = Math.min(remaining, spaceLeft);

        // Copy from WASM heap (even SharedArrayBuffer) into non-shared wBuf
        wBuf.set(buffer.subarray(curSrcOffset, curSrcOffset + copyLen), afterFlushLen);
        node._opfsWriteLen = afterFlushLen + copyLen;

        curSrcOffset += copyLen;
        curPos += copyLen;
        remaining -= copyLen;

        // Bulk flush once the 4 MB / 8 MB buffer is completely full
        if (node._opfsWriteLen >= OPFS_WRITE_BUF_BYTES) {
          flushOpfsWriteBuffer(node);
        }
      }

      if (position + length > node.usedBytes) {
        node.usedBytes = position + length;
      }
      return length;
    }

    let remaining = length;
    let curPos = position;
    let curOffset = offset;
    while (remaining > 0) {
      const pageIdx = Math.floor(curPos / PAGE_SIZE);
      const pageOff = curPos - pageIdx * PAGE_SIZE;
      const chunk = Math.min(remaining, PAGE_SIZE - pageOff);
      const pageU8 = ensurePageInRam(node, pageIdx);
      pageU8.set(buffer.subarray(curOffset, curOffset + chunk), pageOff);

      curPos += chunk;
      curOffset += chunk;
      remaining -= chunk;
    }

    if (position + length > node.usedBytes) {
      node.usedBytes = position + length;
    }
    return length;
  };

  const customStreamAllocate = function (stream: any, offset: number, length: number): void {
    const newEnd = offset + length;
    if (newEnd > stream.node.usedBytes) {
      stream.node.usedBytes = newEnd;
    }
  };

  const customUnlink = function (parent: any, name: string): void {
    const node = parent.contents ? parent.contents[name] : null;
    if (node) {
      freeNodeStorage(node);
    }
    delete parent.contents[name];
    parent.timestamp = Date.now();
  };

  MEMFS.stream_ops.read = customStreamRead;
  MEMFS.stream_ops.write = customStreamWrite;
  MEMFS.stream_ops.allocate = customStreamAllocate;
  MEMFS.node_ops.unlink = customUnlink;

  if (MEMFS.ops_table) {
    if (MEMFS.ops_table.file && MEMFS.ops_table.file.stream) {
      MEMFS.ops_table.file.stream.read = customStreamRead;
      MEMFS.ops_table.file.stream.write = customStreamWrite;
      MEMFS.ops_table.file.stream.allocate = customStreamAllocate;
    }
    if (MEMFS.ops_table.dir && MEMFS.ops_table.dir.node) {
      MEMFS.ops_table.dir.node.unlink = customUnlink;
    }
  }
}

/**
 * Zero-copy export of an output file in MEMFS/OPFS directly as a Blob, optionally
 * relocating the MP4/MOV `moov` atom to the front in ~5 ms without copying `mdat`.
 */
async function exportOutputFileAsBlob(
  path: string,
  mimeType: string,
  applyZeroCopyFastStart = false
): Promise<Blob> {
  const lookup = ffmpeg.FS.lookupPath(path);
  const node = lookup?.node;
  if (!node) {
    throw new Error(`Output file not found: ${path}`);
  }

  let rawBlob: Blob;

  // 1. If backed by OPFS FileSystemSyncAccessHandle, flush write-back buffer & return disk-backed File Blob (0 MB RAM!)
  if (node.opfsSyncHandle || node.opfsFileHandle) {
    if (node.opfsSyncHandle) {
      try {
        flushOpfsWriteBuffer(node);
      } catch {}
      try {
        node.opfsSyncHandle.flush();
      } catch {}
      try {
        node.opfsSyncHandle.close();
      } catch {}
      node.opfsSyncHandle = null;
    }
    if (node.opfsFileHandle) {
      const diskFile: File = await node.opfsFileHandle.getFile();
      rawBlob = mimeType ? diskFile.slice(0, diskFile.size, mimeType) : diskFile;
    } else {
      rawBlob = new Blob([], { type: mimeType || 'application/octet-stream' });
    }
  } else {
    // 2. If backed by Paged Blob Storage, assemble Blob directly from page Blobs & free RAM immediately
    const totalBytes: number = node.usedBytes || 0;
    if (totalBytes === 0) {
      return new Blob([], { type: mimeType || 'application/octet-stream' });
    }

    if (node.pages && node.pages.length > 0) {
      const totalPages = Math.ceil(totalBytes / PAGE_SIZE);
      const parts: BlobPart[] = [];
      for (let i = 0; i < totalPages; i++) {
        const validLen = i === totalPages - 1 ? totalBytes - i * PAGE_SIZE : PAGE_SIZE;
        const p: DiskPage | undefined = node.pages[i];
        if (!p) {
          parts.push(new Uint8Array(validLen));
        } else if (p.blob) {
          parts.push(validLen < PAGE_SIZE ? p.blob.slice(0, validLen) : p.blob);
          p.blob = null;
        } else if (p.u8) {
          const sub = validLen < PAGE_SIZE ? p.u8.subarray(0, validLen) : p.u8;
          parts.push(new Blob([sub]));
          p.u8 = null;
        }
      }
      node.pages = [];
      node.usedBytes = 0;
      rawBlob = new Blob(parts, { type: mimeType || 'application/octet-stream' });
    } else {
      // 3. Fallback for legacy small files
      const u8 = ffmpeg.FS.readFile(path);
      rawBlob = new Blob([u8], { type: mimeType || 'application/octet-stream' });
    }
  }

  // Zero-copy MP4/MOV fast-start relocation (replaces FFmpeg's slow 2nd full-file copy pass)
  if (applyZeroCopyFastStart && rawBlob.size > 0) {
    const fsRes = await relocateMoovToFrontZeroCopy(rawBlob, mimeType);
    if (fsRes.status === 'relocated') {
      self.postMessage({
        type: FFMessageType.LOG,
        data: {
          type: 'system',
          message: `Zero-copy MP4 fast-start completed in ${fsRes.elapsedMs} ms (${fsRes.patchedOffsets || 0} chunk offsets updated, 0 bytes copied).`,
        },
      });
    }
    return fsRes.blob;
  }

  return rawBlob;
}

const load = async ({
  coreURL: _coreURL,
  wasmURL: _wasmURL,
  workerURL: _workerURL,
}: {
  coreURL?: string;
  wasmURL?: string;
  workerURL?: string;
}) => {
  const first = !ffmpeg;
  try {
    if (!_coreURL) _coreURL = CORE_URL;
    importScripts(_coreURL);
  } catch {
    if (!_coreURL) _coreURL = CORE_URL;
    (self as any).createFFmpegCore = (await import(/* @vite-ignore */ _coreURL)).default;
    if (!(self as any).createFFmpegCore) {
      throw ERROR_IMPORT_FAILURE;
    }
  }

  const coreURL = _coreURL;
  const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/.js$/g, '.wasm');
  const workerURL = _workerURL ? _workerURL : _coreURL.replace(/.js$/g, '.worker.js');
  const mainScriptUrlOrBlob = `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`;

  // Android Snapdragon/MediaTek Chrome renderers can throw OOM on 256 MB contiguous WASM memory.
  // Use 128 MB on Android and gracefully step down to 64 MB if needed.
  const initialMemoryTargets = IS_ANDROID_WORKER
    ? [134217728, 67108864, undefined]
    : [268435456, 134217728, undefined];

  let lastLoadErr: any = null;
  for (const initialMem of initialMemoryTargets) {
    try {
      const moduleArgs: Record<string, any> = { mainScriptUrlOrBlob };
      if (initialMem !== undefined) {
        moduleArgs.INITIAL_MEMORY = initialMem;
      }
      ffmpeg = await (self as any).createFFmpegCore(moduleArgs);
      lastLoadErr = null;
      break;
    } catch (memErr) {
      lastLoadErr = memErr;
    }
  }

  if (lastLoadErr && !ffmpeg) {
    throw lastLoadErr;
  }

  // Upgrade BOTH MEMFS (buffered OPFS / Paged Blob Storage) and WORKERFS (4-8 MB read-ahead cache)
  installLargeFilePagedFS(ffmpeg);
  installBufferedWorkerFS(ffmpeg);

  ffmpeg.setLogger((data: any) => {
    const msg: string = data?.message || '';
    // During conversion (not probing), throttle repetitive frame=/size= status ticks to 4 Hz
    // so mobile UI thread & GPU compositor are never starved by postMessage floods
    if (!isProbeExec && (msg.includes('frame=') || msg.includes('size=')) && msg.includes('time=')) {
      const now = Date.now();
      if (now - lastStatusLogPostAt < 250) {
        return;
      }
      lastStatusLogPostAt = now;
    }
    self.postMessage({ type: FFMessageType.LOG, data });
  });

  ffmpeg.setProgress((data: any) => {
    const now = Date.now();
    const prog = typeof data?.progress === 'number' ? data.progress : 0;
    if (prog < 0.99 && now - lastProgressPostAt < 100) {
      return;
    }
    lastProgressPostAt = now;
    self.postMessage({
      type: FFMessageType.PROGRESS,
      data,
    });
  });

  return first;
};

const exec = async ({ args, timeout = -1 }: { args: string[]; timeout?: number }) => {
  lastProgressPostAt = 0;
  lastStatusLogPostAt = 0;

  // Detect header-only probe commands (`-i <file>` with no output file after `-i`)
  const lastArg = Array.isArray(args) && args.length > 0 ? args[args.length - 1] : '';
  const prevArg = Array.isArray(args) && args.length > 1 ? args[args.length - 2] : '';
  isProbeExec = prevArg === '-i' || (Array.isArray(args) && args.length <= 2);

  // Pre-allocate OPFS disk handle for real output files (not header probes)
  if (!isProbeExec && typeof lastArg === 'string' && !lastArg.startsWith('-')) {
    await prepareOpfsForOutput(lastArg);
  }

  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  isProbeExec = false;
  return ret;
};

const ffprobe = ({ args, timeout = -1 }: { args: string[]; timeout?: number }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.ffprobe(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({ path, data }: { path: string; data: Uint8Array }) => {
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = async ({ path, encoding }: { path: string; encoding?: string }) => {
  if (typeof encoding === 'string' && encoding.startsWith('blob+faststart')) {
    const mimeType = encoding.includes(':') ? encoding.slice(encoding.indexOf(':') + 1) : 'video/mp4';
    return await exportOutputFileAsBlob(path, mimeType, true);
  }
  if (typeof encoding === 'string' && encoding.startsWith('blob')) {
    const mimeType = encoding.includes(':') ? encoding.slice(encoding.indexOf(':') + 1) : 'application/octet-stream';
    return await exportOutputFileAsBlob(path, mimeType, false);
  }
  return ffmpeg.FS.readFile(path, { encoding });
};

const deleteFile = ({ path }: { path: string }) => {
  try {
    const lookup = ffmpeg.FS.lookupPath(path);
    if (lookup?.node) {
      freeNodeStorage(lookup.node);
    }
  } catch {}
  ffmpeg.FS.unlink(path);
  return true;
};

const rename = ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({ path }: { path: string }) => {
  try {
    ffmpeg.FS.mkdir(path);
  } catch {}
  return true;
};

const listDir = ({ path }: { path: string }) => {
  const names = ffmpeg.FS.readdir(path);
  const nodes = [];
  for (const name of names) {
    const stat = ffmpeg.FS.stat(`${path}/${name}`);
    const isDir = ffmpeg.FS.isDir(stat.mode);
    nodes.push({ name, isDir });
  }
  return nodes;
};

const deleteDir = ({ path }: { path: string }) => {
  try {
    ffmpeg.FS.rmdir(path);
  } catch {}
  return true;
};

const mount = ({
  fsType,
  options,
  mountPoint,
}: {
  fsType: string;
  options: any;
  mountPoint: string;
}) => {
  try {
    clearWorkerFsReadAhead();
    const fs = ffmpeg.FS.filesystems[fsType];
    if (!fs) return false;
    ffmpeg.FS.mount(fs, options, mountPoint);
    return true;
  } catch {
    return false;
  }
};

const unmount = ({ mountPoint }: { mountPoint: string }) => {
  try {
    clearWorkerFsReadAhead();
    ffmpeg.FS.unmount(mountPoint);
  } catch {}
  return true;
};

self.onmessage = async ({ data: { id, type, data: _data } }: MessageEvent) => {
  const trans: Transferable[] = [];
  let data: any;
  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;
    switch (type) {
      case FFMessageType.LOAD:
        data = await load(_data);
        break;
      case FFMessageType.EXEC:
        data = await exec(_data);
        break;
      case FFMessageType.FFPROBE:
        data = ffprobe(_data);
        break;
      case FFMessageType.WRITE_FILE:
        data = writeFile(_data);
        break;
      case FFMessageType.READ_FILE:
        data = await readFile(_data);
        break;
      case FFMessageType.DELETE_FILE:
        data = deleteFile(_data);
        break;
      case FFMessageType.RENAME:
        data = rename(_data);
        break;
      case FFMessageType.CREATE_DIR:
        data = createDir(_data);
        break;
      case FFMessageType.LIST_DIR:
        data = listDir(_data);
        break;
      case FFMessageType.DELETE_DIR:
        data = deleteDir(_data);
        break;
      case FFMessageType.MOUNT:
        data = mount(_data);
        break;
      case FFMessageType.UNMOUNT:
        data = unmount(_data);
        break;
      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch (e: any) {
    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: e?.toString ? e.toString() : String(e),
    });
    return;
  }
  if (data instanceof Uint8Array) {
    trans.push(data.buffer);
  }
  (self as any).postMessage({ id, type, data }, trans);
};
