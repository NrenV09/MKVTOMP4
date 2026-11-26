/**
 * Zero-Copy ISO 14496-12 MP4 Video Track Demuxer for WebCodecs VideoDecoder
 *
 * Reads only the `moov` atom into memory (< 2 MB) and exposes exact byte offsets,
 * timestamps, durations, keyframe flags, and WebCodecs codec configuration strings
 * for AV1 (`av01`), H.264 (`avc1`/`avc3`), HEVC (`hvc1`/`hev1`), and VP9 (`vp09`).
 *
 * Enables sequential GPU/WebCodecs decoding (`EncodedVideoChunk -> VideoDecoder -> VideoFrame -> VideoEncoder`)
 * at 10x-40x real-time speed without slow `<video>` frame seeking (especially critical for long-GOP AV1).
 */

export interface DemuxedSample {
  type: 'key' | 'delta';
  timestampUs: number;
  durationUs: number;
  offset: number;
  size: number;
}

export interface DemuxedVideoTrack {
  codec: string;
  fourcc: string;
  codedWidth: number;
  codedHeight: number;
  timescale: number;
  durationSeconds: number;
  fps: number;
  description?: Uint8Array;
  samples: DemuxedSample[];
}

interface BoxRef {
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

function readUint64(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  return hi * 4294967296 + lo;
}

function toHex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, '0');
}

function reverseBits32(v: number): number {
  let out = 0;
  for (let i = 0; i < 32; i++) {
    out = (out << 1) | ((v >>> i) & 1);
  }
  return out >>> 0;
}

async function readBlobRange(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const slice = blob.slice(start, end);
  if (typeof slice.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  const reader = new FileReader();
  const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('Failed reading Blob slice'));
    reader.readAsArrayBuffer(slice);
  });
  return new Uint8Array(ab);
}

function iterChildBoxes(
  view: DataView,
  start: number,
  end: number
): BoxRef[] {
  const boxes: BoxRef[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    const size32 = view.getUint32(pos, false);
    const type = readFourCC(view, pos + 4);
    let boxSize = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (pos + 16 > end) break;
      boxSize = readUint64(view, pos + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - pos;
    }
    if (!Number.isFinite(boxSize) || boxSize < headerSize || pos + boxSize > end) {
      break;
    }
    boxes.push({ type, start: pos, size: boxSize, headerSize });
    pos += boxSize;
  }
  return boxes;
}

function buildAv1CodecString(av1C: Uint8Array): string {
  // AV1CodecConfigurationRecord (ISO BMFF AV1 binding):
  // byte 0: marker(1)=1 | version(7)=1
  // byte 1: seq_profile(3) | seq_level_idx_0(5)
  // byte 2: seq_tier_0(1) | high_bitdepth(1) | twelve_bit(1) | monochrome(1) | ...
  if (av1C.byteLength < 4) return 'av01.0.08M.08';
  const seqProfile = (av1C[1] >>> 5) & 0x07;
  const seqLevelIdx0 = av1C[1] & 0x1f;
  const seqTier0 = (av1C[2] >>> 7) & 0x01;
  const highBitdepth = (av1C[2] >>> 6) & 0x01;
  const twelveBit = (av1C[2] >>> 5) & 0x01;
  const bitDepth = highBitdepth ? (twelveBit ? 12 : 10) : 8;
  const tier = seqTier0 ? 'H' : 'M';
  return `av01.${seqProfile}.${String(seqLevelIdx0).padStart(2, '0')}${tier}.${String(bitDepth).padStart(2, '0')}`;
}

function buildAvcCodecString(fourcc: string, avcC: Uint8Array): string {
  if (avcC.byteLength < 4) return `${fourcc}.64002a`;
  return `${fourcc}.${toHex2(avcC[1])}${toHex2(avcC[2])}${toHex2(avcC[3])}`;
}

function buildHevcCodecString(fourcc: string, hvcC: Uint8Array): string {
  // HEVCDecoderConfigurationRecord (ISO/IEC 14496-15):
  // byte 1: general_profile_space(2) | general_tier_flag(1) | general_profile_idc(5)
  // bytes 2..5: general_profile_compatibility_flags (32-bit)
  // bytes 6..11: general_constraint_indicator_flags (6 bytes)
  // byte 12: general_level_idc
  if (hvcC.byteLength < 13) return `${fourcc}.1.6.L120.90`;
  const view = new DataView(hvcC.buffer, hvcC.byteOffset, hvcC.byteLength);
  const b1 = hvcC[1];
  const profileSpaceNum = (b1 >>> 6) & 0x03;
  const profileSpace = ['', 'A', 'B', 'C'][profileSpaceNum] || '';
  const tierFlag = ((b1 >>> 5) & 0x01) ? 'H' : 'L';
  const profileIdc = b1 & 0x1f;
  const compatFlags = reverseBits32(view.getUint32(2, false)).toString(16);
  const levelIdc = hvcC[12];

  const constraints: string[] = [];
  let lastNonZero = 5;
  while (lastNonZero > 0 && hvcC[6 + lastNonZero] === 0) {
    lastNonZero--;
  }
  for (let i = 0; i <= lastNonZero; i++) {
    constraints.push(hvcC[6 + i].toString(16));
  }

  return `${fourcc}.${profileSpace}${profileIdc}.${compatFlags}.${tierFlag}${levelIdc}.${constraints.join('.')}`;
}

function buildVp9CodecString(vpcC: Uint8Array): string {
  // FullBox vpcC: 4 bytes version+flags, then profile(1), level(1), bitDepth(4 bits)
  if (vpcC.byteLength < 7) return 'vp09.00.10.08';
  const profile = vpcC[4];
  const level = vpcC[5];
  const bitDepth = (vpcC[6] >>> 4) & 0x0f;
  return `vp09.${String(profile).padStart(2, '0')}.${String(level).padStart(2, '0')}.${String(bitDepth || 8).padStart(2, '0')}`;
}

interface TrexDefaults {
  defaultSampleDuration: number;
  defaultSampleSize: number;
  defaultSampleFlags: number;
}

/**
 * Zero-copy fragmented MP4 (`moof`/`traf`/`trun`) sample table reader.
 * Scans only top-level box headers and `moof` atoms (< 8 KB each), never loading `mdat`.
 */
async function parseFragmentedSamples(
  blob: Blob,
  videoTrackId: number,
  timescale: number,
  trex: TrexDefaults
): Promise<{ samples: DemuxedSample[]; durationSeconds: number } | null> {
  const totalSize = blob.size;
  const rawSamples: {
    type: 'key' | 'delta';
    pts: number;
    dur: number;
    offset: number;
    size: number;
  }[] = [];

  let offset = 0;
  let guard = 0;
  let runningDecodeTime = 0;
  let minPts = Infinity;

  while (offset + 8 <= totalSize && guard < 100000) {
    guard++;
    const hdrLen = Math.min(16, totalSize - offset);
    const hdr = await readBlobRange(blob, offset, offset + hdrLen);
    const hdrView = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
    const size32 = hdrView.getUint32(0, false);
    const type = readFourCC(hdrView, 4);
    let boxSize = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (hdrLen < 16) break;
      boxSize = readUint64(hdrView, 8);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = totalSize - offset;
    }
    if (!Number.isFinite(boxSize) || boxSize < headerSize || offset + boxSize > totalSize) {
      break;
    }

    if (type === 'moof' && boxSize <= 16 * 1024 * 1024) {
      const moofBytes = await readBlobRange(blob, offset, offset + boxSize);
      const view = new DataView(moofBytes.buffer, moofBytes.byteOffset, moofBytes.byteLength);
      const moofChildren = iterChildBoxes(view, headerSize, moofBytes.byteLength);

      for (const traf of moofChildren) {
        if (traf.type !== 'traf') continue;
        const trafChildren = iterChildBoxes(view, traf.start + traf.headerSize, traf.start + traf.size);
        const tfhd = trafChildren.find((b) => b.type === 'tfhd');
        if (!tfhd || tfhd.size < tfhd.headerSize + 8) continue;

        const tfhdBody = tfhd.start + tfhd.headerSize;
        const tfhdFlags =
          (view.getUint8(tfhdBody + 1) << 16) |
          (view.getUint8(tfhdBody + 2) << 8) |
          view.getUint8(tfhdBody + 3);
        const trackId = view.getUint32(tfhdBody + 4, false);
        if (trackId !== videoTrackId) continue;

        let tfhdPos = tfhdBody + 8;
        let baseDataOffset = offset; // default-base-is-moof / moof start
        if (tfhdFlags & 0x000001) {
          baseDataOffset = readUint64(view, tfhdPos);
          tfhdPos += 8;
        }
        if (tfhdFlags & 0x000002) {
          tfhdPos += 4; // sample_description_index
        }
        let defaultDuration = trex.defaultSampleDuration;
        if (tfhdFlags & 0x000008) {
          defaultDuration = view.getUint32(tfhdPos, false);
          tfhdPos += 4;
        }
        let defaultSize = trex.defaultSampleSize;
        if (tfhdFlags & 0x000010) {
          defaultSize = view.getUint32(tfhdPos, false);
          tfhdPos += 4;
        }
        let defaultFlags = trex.defaultSampleFlags;
        if (tfhdFlags & 0x000020) {
          defaultFlags = view.getUint32(tfhdPos, false);
          tfhdPos += 4;
        }

        // tfdt (track fragment decode time)
        const tfdt = trafChildren.find((b) => b.type === 'tfdt');
        let decodeTime = runningDecodeTime;
        if (tfdt && tfdt.size >= tfdt.headerSize + 8) {
          const tfdtBody = tfdt.start + tfdt.headerSize;
          const tfdtVer = view.getUint8(tfdtBody);
          if (tfdtVer === 1 && tfdt.size >= tfdt.headerSize + 12) {
            decodeTime = readUint64(view, tfdtBody + 4);
          } else {
            decodeTime = view.getUint32(tfdtBody + 4, false);
          }
        }

        let currentDataOffset = baseDataOffset;
        for (const trun of trafChildren) {
          if (trun.type !== 'trun' || trun.size < trun.headerSize + 8) continue;
          const trunBody = trun.start + trun.headerSize;
          const trunVer = view.getUint8(trunBody);
          const trunFlags =
            (view.getUint8(trunBody + 1) << 16) |
            (view.getUint8(trunBody + 2) << 8) |
            view.getUint8(trunBody + 3);
          const sampleCount = view.getUint32(trunBody + 4, false);
          let pos = trunBody + 8;

          if (trunFlags & 0x000001) {
            const dataOffset = view.getInt32(pos, false);
            currentDataOffset = baseDataOffset + dataOffset;
            pos += 4;
          }
          let firstSampleFlags: number | null = null;
          if (trunFlags & 0x000004) {
            firstSampleFlags = view.getUint32(pos, false);
            pos += 4;
          }

          const hasDur = Boolean(trunFlags & 0x000100);
          const hasSize = Boolean(trunFlags & 0x000200);
          const hasFlags = Boolean(trunFlags & 0x000400);
          const hasCto = Boolean(trunFlags & 0x000800);

          const trunEnd = trun.start + trun.size;
          for (let i = 0; i < sampleCount; i++) {
            const needed = (hasDur ? 4 : 0) + (hasSize ? 4 : 0) + (hasFlags ? 4 : 0) + (hasCto ? 4 : 0);
            if (pos + needed > trunEnd) break;

            const dur = hasDur ? view.getUint32(pos, false) : defaultDuration;
            if (hasDur) pos += 4;
            const size = hasSize ? view.getUint32(pos, false) : defaultSize;
            if (hasSize) pos += 4;
            let flags = defaultFlags;
            if (hasFlags) {
              flags = view.getUint32(pos, false);
              pos += 4;
            } else if (i === 0 && firstSampleFlags !== null) {
              flags = firstSampleFlags;
            }
            let cto = 0;
            if (hasCto) {
              cto = trunVer === 1 ? view.getInt32(pos, false) : view.getUint32(pos, false);
              pos += 4;
            }

            const pts = decodeTime + cto;
            if (pts < minPts) minPts = pts;

            // ISO 14496-12: bit 16 (0x00010000) is sample_is_non_sync_sample
            // bits 24..25 (0x03000000): sample_depends_on === 2 means does not depend on others (I-frame)
            const isNonSync = (flags & 0x00010000) !== 0;
            const dependsOn = (flags >>> 24) & 0x03;
            const isKey = rawSamples.length === 0 || (!isNonSync && dependsOn !== 1);

            rawSamples.push({
              type: isKey ? 'key' : 'delta',
              pts,
              dur: dur || Math.round(timescale / 30),
              offset: currentDataOffset,
              size,
            });

            currentDataOffset += size;
            decodeTime += dur || Math.round(timescale / 30);
          }
        }
        runningDecodeTime = decodeTime;
      }
    }

    offset += boxSize;
  }

  if (rawSamples.length === 0) return null;

  const basePts = Number.isFinite(minPts) ? minPts : 0;
  const samples: DemuxedSample[] = rawSamples.map((s, idx) => ({
    type: idx === 0 ? 'key' : s.type,
    timestampUs: Math.max(0, Math.round(((s.pts - basePts) * 1_000_000) / timescale)),
    durationUs: Math.max(1, Math.round((s.dur * 1_000_000) / timescale)),
    offset: s.offset,
    size: s.size,
  }));

  const durationSeconds =
    runningDecodeTime > basePts
      ? (runningDecodeTime - basePts) / timescale
      : rawSamples.reduce((acc, s) => acc + s.dur, 0) / timescale;

  return { samples, durationSeconds: Math.max(0.05, durationSeconds) };
}

/**
 * Demuxes the primary video track sample table from a standard or fragmented MP4/MOV Blob
 * without loading `mdat`. Returns `null` for non-MP4 or unsupported codecs so caller can fallback.
 */
export async function demuxMp4VideoTrack(blob: Blob): Promise<DemuxedVideoTrack | null> {
  try {
    const totalSize = blob.size;
    if (totalSize < 24) return null;

    // 1. Scan top-level boxes to locate `moov`
    let offset = 0;
    let moovBox: BoxRef | null = null;
    let guard = 0;
    while (offset + 8 <= totalSize && guard < 256) {
      guard++;
      const hdrLen = Math.min(16, totalSize - offset);
      const hdr = await readBlobRange(blob, offset, offset + hdrLen);
      const view = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
      const size32 = view.getUint32(0, false);
      const type = readFourCC(view, 4);
      let boxSize = size32;
      let headerSize = 8;
      if (size32 === 1) {
        if (hdrLen < 16) return null;
        boxSize = readUint64(view, 8);
        headerSize = 16;
      } else if (size32 === 0) {
        boxSize = totalSize - offset;
      }
      if (!Number.isFinite(boxSize) || boxSize < headerSize || offset + boxSize > totalSize) {
        return null;
      }
      if (type === 'moov') {
        moovBox = { type, start: offset, size: boxSize, headerSize };
        break;
      }
      offset += boxSize;
    }

    if (!moovBox || moovBox.size > 64 * 1024 * 1024) return null;

    // 2. Read `moov` into memory and inspect tracks
    const moovBytes = await readBlobRange(blob, moovBox.start, moovBox.start + moovBox.size);
    const view = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
    const moovChildren = iterChildBoxes(view, moovBox.headerSize, moovBytes.byteLength);

    // Parse optional `mvex` -> `trex` defaults for fragmented MP4s (e.g. YouTube/DASH AV1)
    const trexByTrackId = new Map<number, TrexDefaults>();
    const mvex = moovChildren.find((b) => b.type === 'mvex');
    if (mvex) {
      const mvexChildren = iterChildBoxes(view, mvex.start + mvex.headerSize, mvex.start + mvex.size);
      for (const box of mvexChildren) {
        if (box.type === 'trex' && box.size >= box.headerSize + 24) {
          const body = box.start + box.headerSize;
          const trackId = view.getUint32(body + 4, false);
          trexByTrackId.set(trackId, {
            defaultSampleDuration: view.getUint32(body + 12, false),
            defaultSampleSize: view.getUint32(body + 16, false),
            defaultSampleFlags: view.getUint32(body + 20, false),
          });
        }
      }
    }

    for (const trak of moovChildren) {
      if (trak.type !== 'trak') continue;
      const trakChildren = iterChildBoxes(view, trak.start + trak.headerSize, trak.start + trak.size);

      // Extract trackId from tkhd for fragmented MP4 matching
      let videoTrackId = 1;
      const tkhd = trakChildren.find((b) => b.type === 'tkhd');
      if (tkhd && tkhd.size >= tkhd.headerSize + 24) {
        const tkhdBody = tkhd.start + tkhd.headerSize;
        const tkhdVer = view.getUint8(tkhdBody);
        videoTrackId =
          tkhdVer === 1
            ? view.getUint32(tkhdBody + 20, false)
            : view.getUint32(tkhdBody + 12, false);
      }

      const mdia = trakChildren.find((b) => b.type === 'mdia');
      if (!mdia) continue;

      const mdiaChildren = iterChildBoxes(view, mdia.start + mdia.headerSize, mdia.start + mdia.size);
      const hdlr = mdiaChildren.find((b) => b.type === 'hdlr');
      if (!hdlr || hdlr.size < hdlr.headerSize + 12) continue;

      const handlerType = readFourCC(view, hdlr.start + hdlr.headerSize + 8);
      if (handlerType !== 'vide') continue;

      // Parse mdhd timescale & duration
      const mdhd = mdiaChildren.find((b) => b.type === 'mdhd');
      if (!mdhd) continue;
      const mdhdBody = mdhd.start + mdhd.headerSize;
      const mdhdVer = view.getUint8(mdhdBody);
      let timescale = 90000;
      let mdhdDuration = 0;
      if (mdhdVer === 1 && mdhd.size >= mdhd.headerSize + 32) {
        timescale = view.getUint32(mdhdBody + 20, false);
        mdhdDuration = readUint64(view, mdhdBody + 24);
      } else if (mdhd.size >= mdhd.headerSize + 20) {
        timescale = view.getUint32(mdhdBody + 12, false);
        mdhdDuration = view.getUint32(mdhdBody + 16, false);
      }
      if (!timescale || timescale <= 0) timescale = 90000;

      const minf = mdiaChildren.find((b) => b.type === 'minf');
      if (!minf) continue;
      const minfChildren = iterChildBoxes(view, minf.start + minf.headerSize, minf.start + minf.size);
      const stbl = minfChildren.find((b) => b.type === 'stbl');
      if (!stbl) continue;
      const stblChildren = iterChildBoxes(view, stbl.start + stbl.headerSize, stbl.start + stbl.size);

      // Parse stsd (codec string, width, height, codec configuration box)
      const stsd = stblChildren.find((b) => b.type === 'stsd');
      if (!stsd || stsd.size < stsd.headerSize + 16) continue;
      const stsdBody = stsd.start + stsd.headerSize;
      const entryCount = view.getUint32(stsdBody + 4, false);
      if (entryCount < 1) continue;

      const sampleEntryStart = stsdBody + 8;
      const sampleEntrySize = view.getUint32(sampleEntryStart, false);
      const fourcc = readFourCC(view, sampleEntryStart + 4);
      const sampleEntryEnd = Math.min(stsd.start + stsd.size, sampleEntryStart + sampleEntrySize);
      if (sampleEntryEnd - sampleEntryStart < 86) continue;

      const codedWidth = view.getUint16(sampleEntryStart + 32, false);
      const codedHeight = view.getUint16(sampleEntryStart + 34, false);

      // VisualSampleEntry fixed fields are 86 bytes from box start (8 header + 78 fields)
      const configBoxes = iterChildBoxes(view, sampleEntryStart + 86, sampleEntryEnd);

      let codec = '';
      let description: Uint8Array | undefined;

      if (fourcc === 'av01') {
        const av1C = configBoxes.find((b) => b.type === 'av1C');
        const payload = av1C
          ? moovBytes.slice(av1C.start + av1C.headerSize, av1C.start + av1C.size)
          : new Uint8Array(0);
        codec = buildAv1CodecString(payload);
        // Per W3C WebCodecs AV1 Codec Registration, description is omitted (OBUs are in-band)
        description = undefined;
      } else if (fourcc === 'avc1' || fourcc === 'avc3') {
        const avcC = configBoxes.find((b) => b.type === 'avcC');
        if (!avcC) continue;
        const payload = moovBytes.slice(avcC.start + avcC.headerSize, avcC.start + avcC.size);
        codec = buildAvcCodecString(fourcc, payload);
        description = payload;
      } else if (fourcc === 'hvc1' || fourcc === 'hev1') {
        const hvcC = configBoxes.find((b) => b.type === 'hvcC');
        if (!hvcC) continue;
        const payload = moovBytes.slice(hvcC.start + hvcC.headerSize, hvcC.start + hvcC.size);
        codec = buildHevcCodecString(fourcc, payload);
        description = payload;
      } else if (fourcc === 'vp09') {
        const vpcC = configBoxes.find((b) => b.type === 'vpcC');
        const payload = vpcC
          ? moovBytes.slice(vpcC.start + vpcC.headerSize, vpcC.start + vpcC.size)
          : new Uint8Array(0);
        codec = buildVp9CodecString(payload);
        description = undefined;
      } else {
        continue; // Unsupported codec for direct VideoDecoder demuxing
      }

      // Parse stsz (sample sizes)
      const stsz = stblChildren.find((b) => b.type === 'stsz');
      const stszBody = stsz ? stsz.start + stsz.headerSize : 0;
      const fixedSampleSize = stsz ? view.getUint32(stszBody + 4, false) : 0;
      const sampleCount = stsz ? view.getUint32(stszBody + 8, false) : 0;

      // Fragmented MP4 path (when moov stsz has 0 samples and mvex/moof fragments hold the samples)
      if (sampleCount === 0 && mvex) {
        const trex = trexByTrackId.get(videoTrackId) || {
          defaultSampleDuration: Math.round(timescale / 30),
          defaultSampleSize: 0,
          defaultSampleFlags: 0,
        };
        const frag = await parseFragmentedSamples(blob, videoTrackId, timescale, trex);
        if (!frag || frag.samples.length === 0) continue;
        const fps =
          frag.durationSeconds > 0
            ? Math.max(1, Math.round((frag.samples.length / frag.durationSeconds) * 100) / 100)
            : 30;
        return {
          codec,
          fourcc,
          codedWidth,
          codedHeight,
          timescale,
          durationSeconds: frag.durationSeconds,
          fps,
          description,
          samples: frag.samples,
        };
      }

      if (!stsz || sampleCount === 0 || sampleCount > 2_000_000) continue;

      const sampleSizes = new Uint32Array(sampleCount);
      if (fixedSampleSize > 0) {
        sampleSizes.fill(fixedSampleSize);
      } else {
        if (stszBody + 12 + sampleCount * 4 > stsz.start + stsz.size) continue;
        for (let i = 0; i < sampleCount; i++) {
          sampleSizes[i] = view.getUint32(stszBody + 12 + i * 4, false);
        }
      }

      // Parse stco or co64 (chunk offsets)
      const stco = stblChildren.find((b) => b.type === 'stco');
      const co64 = stblChildren.find((b) => b.type === 'co64');
      let chunkOffsets: number[] = [];
      if (stco) {
        const body = stco.start + stco.headerSize;
        const count = view.getUint32(body + 4, false);
        chunkOffsets = new Array(count);
        for (let i = 0; i < count; i++) {
          chunkOffsets[i] = view.getUint32(body + 8 + i * 4, false);
        }
      } else if (co64) {
        const body = co64.start + co64.headerSize;
        const count = view.getUint32(body + 4, false);
        chunkOffsets = new Array(count);
        for (let i = 0; i < count; i++) {
          chunkOffsets[i] = readUint64(view, body + 8 + i * 8);
        }
      } else {
        continue;
      }

      // Parse stsc (sample-to-chunk runs)
      const stsc = stblChildren.find((b) => b.type === 'stsc');
      if (!stsc) continue;
      const stscBody = stsc.start + stsc.headerSize;
      const stscCount = view.getUint32(stscBody + 4, false);
      const stscRuns: { firstChunk: number; samplesPerChunk: number }[] = [];
      for (let i = 0; i < stscCount; i++) {
        stscRuns.push({
          firstChunk: view.getUint32(stscBody + 8 + i * 12, false),
          samplesPerChunk: view.getUint32(stscBody + 12 + i * 12, false),
        });
      }
      if (stscRuns.length === 0) continue;

      // Compute sample byte offsets in O(C + R) linear time
      const sampleOffsets = new Float64Array(sampleCount);
      let sIdx = 0;
      let runIdx = 0;
      for (let c = 0; c < chunkOffsets.length && sIdx < sampleCount; c++) {
        const chunkNum1 = c + 1;
        while (runIdx + 1 < stscRuns.length && stscRuns[runIdx + 1].firstChunk <= chunkNum1) {
          runIdx++;
        }
        const spc = stscRuns[runIdx].samplesPerChunk;
        let curOff = chunkOffsets[c];
        for (let k = 0; k < spc && sIdx < sampleCount; k++) {
          sampleOffsets[sIdx] = curOff;
          curOff += sampleSizes[sIdx];
          sIdx++;
        }
      }
      if (sIdx === 0) continue;

      // Parse stts (decoding time deltas)
      const stts = stblChildren.find((b) => b.type === 'stts');
      if (!stts) continue;
      const sttsBody = stts.start + stts.headerSize;
      const sttsCount = view.getUint32(sttsBody + 4, false);
      const sampleDts = new Float64Array(sampleCount);
      const sampleDur = new Uint32Array(sampleCount);
      let dtsAcc = 0;
      let tIdx = 0;
      for (let i = 0; i < sttsCount && tIdx < sampleCount; i++) {
        const cnt = view.getUint32(sttsBody + 8 + i * 8, false);
        const delta = view.getUint32(sttsBody + 12 + i * 8, false);
        for (let k = 0; k < cnt && tIdx < sampleCount; k++) {
          sampleDts[tIdx] = dtsAcc;
          sampleDur[tIdx] = delta;
          dtsAcc += delta;
          tIdx++;
        }
      }

      // Parse optional ctts (composition time offsets for B-frames)
      const ctts = stblChildren.find((b) => b.type === 'ctts');
      const samplePts = new Float64Array(sampleCount);
      let minPts = Infinity;
      if (ctts) {
        const cttsBody = ctts.start + ctts.headerSize;
        const cttsVer = view.getUint8(cttsBody);
        const cttsCount = view.getUint32(cttsBody + 4, false);
        let cIdx = 0;
        for (let i = 0; i < cttsCount && cIdx < sampleCount; i++) {
          const cnt = view.getUint32(cttsBody + 8 + i * 8, false);
          const off =
            cttsVer === 1
              ? view.getInt32(cttsBody + 12 + i * 8, false)
              : view.getUint32(cttsBody + 12 + i * 8, false);
          for (let k = 0; k < cnt && cIdx < sampleCount; k++) {
            const pts = sampleDts[cIdx] + off;
            samplePts[cIdx] = pts;
            if (pts < minPts) minPts = pts;
            cIdx++;
          }
        }
        while (cIdx < sampleCount) {
          samplePts[cIdx] = sampleDts[cIdx];
          if (samplePts[cIdx] < minPts) minPts = samplePts[cIdx];
          cIdx++;
        }
      } else {
        for (let i = 0; i < sampleCount; i++) {
          samplePts[i] = sampleDts[i];
        }
        minPts = 0;
      }

      // Parse optional stss (keyframe indices, 1-based)
      const stss = stblChildren.find((b) => b.type === 'stss');
      let keySet: Set<number> | null = null;
      if (stss) {
        const stssBody = stss.start + stss.headerSize;
        const stssCount = view.getUint32(stssBody + 4, false);
        keySet = new Set<number>();
        for (let i = 0; i < stssCount; i++) {
          keySet.add(view.getUint32(stssBody + 8 + i * 4, false) - 1);
        }
      }

      // Assemble sample descriptors
      const samples: DemuxedSample[] = new Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const normPts = Math.max(0, samplePts[i] - (Number.isFinite(minPts) ? minPts : 0));
        const tsUs = Math.round((normPts * 1_000_000) / timescale);
        const durUs = Math.max(1, Math.round((sampleDur[i] * 1_000_000) / timescale));
        samples[i] = {
          type: keySet === null || keySet.has(i) || i === 0 ? 'key' : 'delta',
          timestampUs: tsUs,
          durationUs: durUs,
          offset: sampleOffsets[i],
          size: sampleSizes[i],
        };
      }

      const durationSeconds =
        dtsAcc > 0 ? dtsAcc / timescale : mdhdDuration > 0 ? mdhdDuration / timescale : 1;
      const fps = durationSeconds > 0 ? Math.max(1, Math.round((sampleCount / durationSeconds) * 100) / 100) : 30;

      return {
        codec,
        fourcc,
        codedWidth,
        codedHeight,
        timescale,
        durationSeconds,
        fps,
        description,
        samples,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Buffered 2 MB sequential read-ahead reader for MP4 samples.
 * Cuts Blob slice IPC calls by ~100x during WebCodecs VideoDecoder streaming.
 */
export function createSampleSliceReader(blob: Blob, windowBytes = 2 * 1024 * 1024) {
  let bufStart = 0;
  let bufEnd = 0;
  let buf: Uint8Array | null = null;

  return {
    async read(offset: number, size: number): Promise<Uint8Array> {
      if (size <= 0) return new Uint8Array(0);
      if (buf && offset >= bufStart && offset + size <= bufEnd) {
        const rel = offset - bufStart;
        return buf.subarray(rel, rel + size);
      }
      if (size > windowBytes) {
        return readBlobRange(blob, offset, Math.min(blob.size, offset + size));
      }
      bufStart = offset;
      bufEnd = Math.min(blob.size, offset + windowBytes);
      buf = await readBlobRange(blob, bufStart, bufEnd);
      const avail = Math.min(size, buf.byteLength);
      return buf.subarray(0, avail);
    },
    release() {
      buf = null;
      bufStart = 0;
      bufEnd = 0;
    },
  };
}
