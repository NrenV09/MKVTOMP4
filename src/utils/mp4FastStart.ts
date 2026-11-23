/**
 * Zero-Copy ISO 14496-12 MP4/MOV Fast-Start Relocator
 *
 * Moves the `moov` atom from the end of an MP4/MOV file to the front (immediately before the
 * first `mdat` atom) without copying a single byte of media payload (`mdat`).
 *
 * Instead of FFmpeg's `-movflags +faststart` performing a full 2nd multi-GB read+write pass
 * over device storage (which doubles remux time on Snapdragon/MediaTek mobile flash storage),
 * this patches only the small `moov` chunk offset tables (`stco` / `co64`) in memory and
 * returns a zero-copy `Blob` composed of lazy `Blob.slice()` views.
 */

export interface FastStartResult {
  blob: Blob;
  status: 'relocated' | 'already-faststart' | 'skipped';
  elapsedMs: number;
  moovBytes?: number;
  patchedOffsets?: number;
}

interface TopLevelBox {
  type: string;
  start: number;
  size: number;
  headerSize: number;
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function readUint64AsNumber(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  return hi * 4294967296 + lo;
}

async function readSliceBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const slice = blob.slice(start, end);
  if (typeof slice.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  const reader = new FileReader();
  const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('Blob slice read failed'));
    reader.readAsArrayBuffer(slice);
  });
  return new Uint8Array(ab);
}

/**
 * Scan only the 16-byte headers of top-level ISO BMFF boxes.
 * Reads < 512 bytes total even for a 10 GB file.
 */
async function scanTopLevelBoxes(blob: Blob): Promise<TopLevelBox[] | null> {
  const totalSize = blob.size;
  if (totalSize < 16) return null;

  const boxes: TopLevelBox[] = [];
  let offset = 0;
  let guard = 0;

  while (offset + 8 <= totalSize && guard < 256) {
    guard++;
    const headerLen = Math.min(16, totalSize - offset);
    const hdr = await readSliceBytes(blob, offset, offset + headerLen);
    const view = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);

    const size32 = view.getUint32(0, false);
    const type = readFourCC(view, 4);

    let boxSize = size32;
    let headerSize = 8;

    if (size32 === 1) {
      if (headerLen < 16) return null;
      boxSize = readUint64AsNumber(view, 8);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = totalSize - offset;
    }

    if (!Number.isFinite(boxSize) || boxSize < headerSize || offset + boxSize > totalSize) {
      return null;
    }

    boxes.push({ type, start: offset, size: boxSize, headerSize });
    offset += boxSize;
  }

  return boxes.length > 0 ? boxes : null;
}

/**
 * Strictly walks ISO 14496-12 container hierarchy inside `moov`:
 *   moov -> trak -> mdia -> minf -> stbl -> (stco | co64)
 *
 * Returns number of patched chunk offsets, or -1 if patching must be aborted
 * (e.g. fragmented MP4 `mvex` detected or 32-bit `stco` overflow).
 */
function patchMoovChunkOffsets(
  moovBytes: Uint8Array,
  moovHeaderSize: number,
  shiftDelta: number,
  mdatRegionStart: number,
  mdatRegionEnd: number
): number {
  const view = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
  let patchedCount = 0;

  const walk = (start: number, end: number, expectedParent: 'moov' | 'trak' | 'mdia' | 'minf' | 'stbl'): boolean => {
    let pos = start;
    while (pos + 8 <= end) {
      const size32 = view.getUint32(pos, false);
      const type = readFourCC(view, pos + 4);

      let boxSize = size32;
      let hdrSize = 8;
      if (size32 === 1) {
        if (pos + 16 > end) return false;
        boxSize = readUint64AsNumber(view, pos + 8);
        hdrSize = 16;
      } else if (size32 === 0) {
        boxSize = end - pos;
      }

      if (boxSize < hdrSize || pos + boxSize > end) {
        return false;
      }

      const bodyStart = pos + hdrSize;
      const boxEnd = pos + boxSize;

      if (expectedParent === 'moov') {
        if (type === 'mvex') {
          // Fragmented MP4 — do not rewrite offsets
          return false;
        }
        if (type === 'trak') {
          if (!walk(bodyStart, boxEnd, 'trak')) return false;
        }
      } else if (expectedParent === 'trak') {
        if (type === 'mdia') {
          if (!walk(bodyStart, boxEnd, 'mdia')) return false;
        }
      } else if (expectedParent === 'mdia') {
        if (type === 'minf') {
          if (!walk(bodyStart, boxEnd, 'minf')) return false;
        }
      } else if (expectedParent === 'minf') {
        if (type === 'stbl') {
          if (!walk(bodyStart, boxEnd, 'stbl')) return false;
        }
      } else if (expectedParent === 'stbl') {
        if (type === 'stco') {
          // FullBox: 4 bytes version+flags, 4 bytes entry_count, entry_count * 4 bytes uint32
          if (bodyStart + 8 > boxEnd) return false;
          const entryCount = view.getUint32(bodyStart + 4, false);
          if (bodyStart + 8 + entryCount * 4 > boxEnd) return false;

          for (let i = 0; i < entryCount; i++) {
            const entryPos = bodyStart + 8 + i * 4;
            const oldOffset = view.getUint32(entryPos, false);
            if (oldOffset >= mdatRegionStart && oldOffset < mdatRegionEnd) {
              const newOffset = oldOffset + shiftDelta;
              if (newOffset > 0xffffffff) {
                // 32-bit stco overflow: abort safely so we never corrupt the file
                return false;
              }
              view.setUint32(entryPos, newOffset, false);
              patchedCount++;
            }
          }
        } else if (type === 'co64') {
          // FullBox: 4 bytes version+flags, 4 bytes entry_count, entry_count * 8 bytes uint64
          if (bodyStart + 8 > boxEnd) return false;
          const entryCount = view.getUint32(bodyStart + 4, false);
          if (bodyStart + 8 + entryCount * 8 > boxEnd) return false;

          const deltaBig = BigInt(shiftDelta);
          const regionStartBig = BigInt(mdatRegionStart);
          const regionEndBig = BigInt(mdatRegionEnd);

          for (let i = 0; i < entryCount; i++) {
            const entryPos = bodyStart + 8 + i * 8;
            const hi = BigInt(view.getUint32(entryPos, false));
            const lo = BigInt(view.getUint32(entryPos + 4, false));
            const oldOffset = (hi << 32n) | lo;

            if (oldOffset >= regionStartBig && oldOffset < regionEndBig) {
              const newOffset = oldOffset + deltaBig;
              view.setUint32(entryPos, Number((newOffset >> 32n) & 0xffffffffn), false);
              view.setUint32(entryPos + 4, Number(newOffset & 0xffffffffn), false);
              patchedCount++;
            }
          }
        }
      }

      pos = boxEnd;
    }
    return true;
  };

  const ok = walk(moovHeaderSize, moovBytes.byteLength, 'moov');
  return ok ? patchedCount : -1;
}

/**
 * Relocates `moov` before the first `mdat` atom in zero-copy O(1) memory.
 * Never copies `mdat` bytes; safe for 2 GB - 10 GB+ files on mobile devices.
 */
export async function relocateMoovToFrontZeroCopy(
  blob: Blob,
  mimeType = 'video/mp4'
): Promise<FastStartResult> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = () => Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0));

  try {
    const boxes = await scanTopLevelBoxes(blob);
    if (!boxes) {
      return { blob, status: 'skipped', elapsedMs: elapsed() };
    }

    const moovIndex = boxes.findIndex((b) => b.type === 'moov');
    const firstMdatIndex = boxes.findIndex((b) => b.type === 'mdat');

    if (moovIndex === -1 || firstMdatIndex === -1) {
      return { blob, status: 'skipped', elapsedMs: elapsed() };
    }

    // Already fast-start (`moov` precedes first `mdat`)
    if (moovIndex < firstMdatIndex) {
      return { blob, status: 'already-faststart', elapsedMs: elapsed() };
    }

    const moovBox = boxes[moovIndex];
    const firstMdatBox = boxes[firstMdatIndex];

    // Safety ceiling: normal moov atoms are 0.2 MB - 15 MB; cap at 64 MB to protect mobile RAM
    if (moovBox.size > 64 * 1024 * 1024) {
      return { blob, status: 'skipped', elapsedMs: elapsed() };
    }

    const moovBytes = await readSliceBytes(blob, moovBox.start, moovBox.start + moovBox.size);
    const patchedCount = patchMoovChunkOffsets(
      moovBytes,
      moovBox.headerSize,
      moovBox.size,
      firstMdatBox.start,
      moovBox.start
    );

    if (patchedCount < 0) {
      return { blob, status: 'skipped', elapsedMs: elapsed() };
    }

    // Zero-copy assembly: [ftyp + pre-mdat] + [patched moov] + [mdat...] + [trailing after moov]
    const parts: BlobPart[] = [];
    if (firstMdatBox.start > 0) {
      parts.push(blob.slice(0, firstMdatBox.start));
    }
    parts.push(moovBytes);
    parts.push(blob.slice(firstMdatBox.start, moovBox.start));
    const moovEnd = moovBox.start + moovBox.size;
    if (moovEnd < blob.size) {
      parts.push(blob.slice(moovEnd));
    }

    const fastBlob = new Blob(parts, { type: mimeType || blob.type || 'video/mp4' });
    return {
      blob: fastBlob,
      status: 'relocated',
      elapsedMs: elapsed(),
      moovBytes: moovBox.size,
      patchedOffsets: patchedCount,
    };
  } catch {
    return { blob, status: 'skipped', elapsedMs: elapsed() };
  }
}
