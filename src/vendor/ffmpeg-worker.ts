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
 * 16 MB Page size for Paged Blob Storage fallback when OPFS SyncAccessHandle is unavailable.
 * Caps active Uint8Array memory at <= 64 MB (4 pages) even when remuxing 2-10 GB files!
 */
const PAGE_SIZE = 16 * 1024 * 1024; // 16 MB
const MAX_RAM_PAGES = 4; // Max 64 MB of active Uint8Array buffers in RAM per file

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
const nonSharedScratch = new Uint8Array(65536);

function getSyncReader(): FileReaderSync {
  if (!syncReader) {
    syncReader = new FileReaderSync();
  }
  return syncReader;
}

/**
 * Copy a potentially SharedArrayBuffer-backed view into a regular ArrayBuffer view
 * so Safari/WebKit FileSystemSyncAccessHandle.write/read never throws on SharedArrayBuffer.
 */
function toNonSharedSubarray(buffer: Uint8Array, offset: number, length: number): Uint8Array {
  const isShared =
    typeof SharedArrayBuffer !== 'undefined' && buffer.buffer instanceof SharedArrayBuffer;
  if (!isShared) {
    return buffer.subarray(offset, offset + length);
  }
  if (length <= nonSharedScratch.byteLength) {
    nonSharedScratch.set(buffer.subarray(offset, offset + length), 0);
    return nonSharedScratch.subarray(0, length);
  }
  const copy = new Uint8Array(length);
  copy.set(buffer.subarray(offset, offset + length), 0);
  return copy;
}

/**
 * Attempt to pre-allocate an OPFS FileSystemSyncAccessHandle before ffmpeg.exec runs
 * so all output writes stream directly to the device SSD with 0 MB RAM.
 */
async function prepareOpfsForOutput(outputFilename: string): Promise<void> {
  if (!outputFilename || outputFilename.startsWith('-')) return;
  const cleanName = outputFilename.split('/').filter(Boolean).pop() || outputFilename;
  if (!cleanName || cleanName.startsWith('.')) return;

  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();

    // Clean up any stale OPFS files from older runs (keep only active ones)
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
    // Paged Blob Storage (16 MB pages, <= 64 MB RAM cap) will automatically handle the file.
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
      node.opfsSyncHandle.flush();
    } catch {}
    try {
      node.opfsSyncHandle.close();
    } catch {}
    node.opfsSyncHandle = null;
  }
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
 * Upgrades Emscripten's MEMFS inside ffmpeg.FS so that files of ANY size (2 GB, 3 GB, 10 GB)
 * never allocate a single contiguous Uint8Array or overflow 32-bit capacity shifts.
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
      const isShared =
        typeof SharedArrayBuffer !== 'undefined' && buffer.buffer instanceof SharedArrayBuffer;
      if (!isShared) {
        return node.opfsSyncHandle.read(buffer.subarray(offset, offset + size), { at: position });
      }
      let totalRead = 0;
      while (totalRead < size) {
        const step = Math.min(size - totalRead, nonSharedScratch.byteLength);
        const targetSlice = nonSharedScratch.subarray(0, step);
        const got = node.opfsSyncHandle.read(targetSlice, { at: position + totalRead });
        if (got <= 0) break;
        buffer.set(nonSharedScratch.subarray(0, got), offset + totalRead);
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

    // Check if an OPFS handle was registered for this node's filename
    if (!node.opfsSyncHandle && node.name && opfsHandleByName.has(node.name)) {
      const opfs = opfsHandleByName.get(node.name)!;
      node.opfsSyncHandle = opfs.syncHandle;
      node.opfsFileHandle = opfs.fileHandle;
      node.opfsName = opfs.opfsName;
      opfsHandleByName.delete(node.name);
    }

    if (node.opfsSyncHandle) {
      let totalWritten = 0;
      while (totalWritten < length) {
        const step = Math.min(length - totalWritten, 65536);
        const chunkView = toNonSharedSubarray(buffer, offset + totalWritten, step);
        const written = node.opfsSyncHandle.write(chunkView, { at: position + totalWritten });
        totalWritten += written > 0 ? written : step;
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
 * Zero-copy export of an output file in MEMFS/OPFS directly as a Blob
 * without ever allocating a contiguous multi-gigabyte Uint8Array.
 */
async function exportOutputFileAsBlob(path: string, mimeType: string): Promise<Blob> {
  const lookup = ffmpeg.FS.lookupPath(path);
  const node = lookup?.node;
  if (!node) {
    throw new Error(`Output file not found: ${path}`);
  }

  // 1. If backed by OPFS FileSystemSyncAccessHandle, flush & close handle and return disk-backed File Blob (0 MB RAM!)
  if (node.opfsSyncHandle || node.opfsFileHandle) {
    if (node.opfsSyncHandle) {
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
      return mimeType ? diskFile.slice(0, diskFile.size, mimeType) : diskFile;
    }
  }

  // 2. If backed by 16 MB Paged Blob Storage, assemble Blob directly from page Blobs & free RAM immediately
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
    return new Blob(parts, { type: mimeType || 'application/octet-stream' });
  }

  // 3. Fallback for legacy small files
  const u8 = ffmpeg.FS.readFile(path);
  return new Blob([u8], { type: mimeType || 'application/octet-stream' });
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

  ffmpeg = await (self as any).createFFmpegCore({
    // Cap initial SharedArrayBuffer memory at 256 MB (instead of 1024 MB default)
    // so iPadOS Safari / WebKit retains 768 MB of extra headroom for multi-GB operations.
    INITIAL_MEMORY: 268435456,
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
  });

  // Upgrade MEMFS to support multi-gigabyte files via OPFS + 16 MB Paged Blob Storage
  installLargeFilePagedFS(ffmpeg);

  ffmpeg.setLogger((data: any) => self.postMessage({ type: FFMessageType.LOG, data }));
  ffmpeg.setProgress((data: any) =>
    self.postMessage({
      type: FFMessageType.PROGRESS,
      data,
    })
  );
  return first;
};

const exec = async ({ args, timeout = -1 }: { args: string[]; timeout?: number }) => {
  // If executing an encode/remux (more than just `-i input` probe), pre-allocate OPFS disk handle for the output file
  if (Array.isArray(args) && args.length > 2) {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'string' && !lastArg.startsWith('-')) {
      await prepareOpfsForOutput(lastArg);
    }
  }

  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
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
  if (typeof encoding === 'string' && encoding.startsWith('blob')) {
    const mimeType = encoding.includes(':') ? encoding.slice(encoding.indexOf(':') + 1) : 'application/octet-stream';
    return await exportOutputFileAsBlob(path, mimeType);
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
  const fs = ffmpeg.FS.filesystems[fsType];
  if (!fs) return false;
  ffmpeg.FS.mount(fs, options, mountPoint);
  return true;
};

const unmount = ({ mountPoint }: { mountPoint: string }) => {
  try {
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
