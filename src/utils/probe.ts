import {
  SourceMetadata,
  VideoTrackInfo,
  AudioTrackInfo,
  SubtitleTrackInfo,
  ChapterInfo,
  AttachmentInfo,
} from '../types';

const BITMAP_SUBTITLE_CODECS = [
  'hdmv_pgs_subtitle',
  'pgssub',
  'pgs',
  'dvd_subtitle',
  'dvdsub',
  'vobsub',
  'dvb_subtitle',
  'dvbsub',
  'xsub',
];

export function isBitmapSubtitleCodec(codec: string): boolean {
  const c = (codec || '').toLowerCase();
  return BITMAP_SUBTITLE_CODECS.some((b) => c.includes(b));
}

export function isMp4CompatibleAudioCodec(codec: string): boolean {
  const c = (codec || '').toLowerCase();
  return ['aac', 'mp3', 'ac3', 'eac3', 'alac', 'mp4a'].some((a) => c.includes(a));
}

/**
 * Parses FFmpeg stderr logs produced during inspection (-i input)
 * Extracts all video tracks, audio tracks, subtitle tracks, chapters, and attachments.
 */
export function parseFFmpegProbeLogs(logs: string[]): Partial<SourceMetadata> {
  const videoTracks: VideoTrackInfo[] = [];
  const audioTracks: AudioTrackInfo[] = [];
  const subtitleTracks: SubtitleTrackInfo[] = [];
  const chapters: ChapterInfo[] = [];
  const attachments: AttachmentInfo[] = [];

  const meta: Partial<SourceMetadata> = {
    hasVideo: false,
    hasAudio: false,
    parsedStreams: [],
    videoTracks,
    audioTracks,
    subtitleTracks,
    chapters,
    attachments,
  };

  const combined = logs.join('\n');
  const allLines = combined.split('\n');

  // Match Duration: 00:01:23.45, start: 0.000000, bitrate: 2450 kb/s
  const durationMatch = combined.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (durationMatch) {
    const hours = parseFloat(durationMatch[1]);
    const minutes = parseFloat(durationMatch[2]);
    const seconds = parseFloat(durationMatch[3]);
    meta.duration = hours * 3600 + minutes * 60 + seconds;
  }

  // Match overall bitrate: bitrate: 2450 kb/s
  const bitrateMatch = combined.match(/bitrate:\s*(\d+)\s*kb\/s/i);
  if (bitrateMatch) {
    meta.bitrate = parseInt(bitrateMatch[1], 10);
  }

  let videoTypeCounter = 0;
  let audioTypeCounter = 0;
  let subtitleTypeCounter = 0;
  let attachmentTypeCounter = 0;

  let activeBlock:
    | { kind: 'video'; item: VideoTrackInfo }
    | { kind: 'audio'; item: AudioTrackInfo }
    | { kind: 'subtitle'; item: SubtitleTrackInfo }
    | { kind: 'attachment'; item: AttachmentInfo }
    | { kind: 'chapter'; item: ChapterInfo }
    | null = null;

  for (let i = 0; i < allLines.length; i++) {
    const rawLine = allLines[i];
    const trimmed = rawLine.trim();

    // Parse Chapter lines:
    // Chapter #0:0: start 0.000000, end 342.120000
    const chapterMatch = trimmed.match(/Chapter #0:(\d+):\s*start\s*([\d.]+),\s*end\s*([\d.]+)/i);
    if (chapterMatch) {
      const chap: ChapterInfo = {
        index: parseInt(chapterMatch[1], 10),
        start: parseFloat(chapterMatch[2]),
        end: parseFloat(chapterMatch[3]),
      };
      chapters.push(chap);
      activeBlock = { kind: 'chapter', item: chap };
      continue;
    }

    // Parse Stream lines:
    // Stream #0:0(eng): Video: hevc (Main 10), yuv420p10le(tv), 3840x2160, 23.98 fps (default)
    // Stream #0:1[0x1100](jpn): Audio: dts (DTS-HD MA), 48000 Hz, 5.1(side), s32p (default)
    // Stream #0:2(eng): Subtitle: subrip (default) (forced)
    // Stream #0:3: Attachment: ttf
    const streamMatch = trimmed.match(
      /^Stream #0:(\d+)(?:\[[^\]]+\])?(?:\(([^)]+)\))?(?:\[[^\]]+\])?:\s*(Video|Audio|Subtitle|Attachment|Data):\s*(.*)$/i
    );

    if (streamMatch) {
      meta.parsedStreams!.push(trimmed);
      const streamIndex = parseInt(streamMatch[1], 10);
      const langRaw = streamMatch[2] ? streamMatch[2].toLowerCase() : undefined;
      const language = langRaw && langRaw !== 'und' ? langRaw : undefined;
      const streamKind = streamMatch[3].toLowerCase();
      const details = streamMatch[4] || '';

      const isDefault = /\(default\)/i.test(details);
      const isForced = /\(forced\)/i.test(details);
      const cleanDetails = details.replace(/\((default|forced|visual impaired|hearing impaired|original|comment)\)/gi, '').trim();
      const parts = cleanDetails.split(',').map((p) => p.trim());
      const firstToken = parts[0] || '';
      const codec = (firstToken.split(' ')[0] || 'unknown').toLowerCase();
      const profileMatch = firstToken.match(/\(([^)]+)\)/);
      const profile = profileMatch ? profileMatch[1] : undefined;

      if (streamKind === 'video') {
        // Ignore attached cover art marked as mjpeg/png video unless it's the only video stream
        const isAttachedPic = /\(attached pic\)/i.test(details);
        let width: number | undefined;
        let height: number | undefined;
        let fps: number | undefined;
        let pixelFormat: string | undefined;
        let streamBitrate: number | undefined;

        for (const part of parts) {
          const resMatch = part.match(/(\d{2,5})x(\d{2,5})/);
          if (resMatch) {
            width = parseInt(resMatch[1], 10);
            height = parseInt(resMatch[2], 10);
          }
          const fpsMatch = part.match(/(\d+(?:\.\d+)?)\s*fps/i);
          if (fpsMatch) {
            fps = Math.round(parseFloat(fpsMatch[1]) * 100) / 100;
          }
          const pixMatch = part.match(/(yuv[\w]+|rgb[\w]+|bgr[\w]+|nv12|p010[\w]*)/i);
          if (pixMatch) {
            pixelFormat = pixMatch[1].toLowerCase();
          }
          const brMatch = part.match(/(\d+)\s*kb\/s/i);
          if (brMatch) {
            streamBitrate = parseInt(brMatch[1], 10);
          }
        }

        const is10Bit = Boolean(
          details.includes('10le') ||
            details.includes('Main 10') ||
            details.includes('High 10') ||
            (pixelFormat && pixelFormat.includes('10'))
        );

        if (!isAttachedPic) {
          const vTrack: VideoTrackInfo = {
            streamIndex,
            typeIndex: videoTypeCounter++,
            codec,
            profile,
            pixelFormat,
            width,
            height,
            fps,
            bitrate: streamBitrate,
            language,
            isDefault,
            isForced,
            is10Bit,
            rawInfo: cleanDetails,
          };
          videoTracks.push(vTrack);
          activeBlock = { kind: 'video', item: vTrack };

          // Populate primary video metadata from first video track
          if (!meta.hasVideo) {
            meta.hasVideo = true;
            meta.videoCodec = codec;
            meta.width = width;
            meta.height = height;
            meta.fps = fps ? Math.round(fps) : undefined;
            meta.pixelFormat = pixelFormat;
            meta.is10Bit = is10Bit;
            meta.is4K = Boolean((width && width >= 3840) || (height && height >= 2160));
            if ((meta.bitrate && meta.bitrate >= 15000) || (streamBitrate && streamBitrate >= 15000)) {
              meta.isHighBitrate = true;
            }
          }
        } else {
          // FFmpeg still indexes attached cover art as a video stream specifier (0:v:N),
          // so advance videoTypeCounter to keep subsequent 0:v:X indices aligned.
          videoTypeCounter++;
          // Treat attached cover image as attachment
          const att: AttachmentInfo = {
            streamIndex,
            typeIndex: attachmentTypeCounter++,
            codec,
            filename: `cover_art.${codec === 'png' ? 'png' : 'jpg'}`,
            mimetype: codec === 'png' ? 'image/png' : 'image/jpeg',
          };
          attachments.push(att);
          activeBlock = { kind: 'attachment', item: att };
        }
      } else if (streamKind === 'audio') {
        let sampleRate: number | undefined;
        let channels: number | undefined;
        let channelLayout: string | undefined;
        let streamBitrate: number | undefined;

        for (const part of parts) {
          const srMatch = part.match(/(\d{4,6})\s*Hz/i);
          if (srMatch) {
            sampleRate = parseInt(srMatch[1], 10);
          }
          const brMatch = part.match(/(\d+)\s*kb\/s/i);
          if (brMatch) {
            streamBitrate = parseInt(brMatch[1], 10);
          }
          if (part.includes('stereo') || part === '2 channels') {
            channels = 2;
            channelLayout = 'Stereo (2.0)';
          } else if (part.includes('mono') || part === '1 channels') {
            channels = 1;
            channelLayout = 'Mono (1.0)';
          } else if (part.includes('5.1')) {
            channels = 6;
            channelLayout = '5.1 Surround';
          } else if (part.includes('7.1')) {
            channels = 8;
            channelLayout = '7.1 Surround';
          } else if (part.includes('quad') || part.includes('4.0')) {
            channels = 4;
            channelLayout = 'Quad (4.0)';
          }
        }

        const aTrack: AudioTrackInfo = {
          streamIndex,
          typeIndex: audioTypeCounter++,
          codec,
          profile,
          sampleRate,
          channels,
          channelLayout,
          bitrate: streamBitrate,
          language,
          isDefault,
          isForced,
          isMp4Compatible: isMp4CompatibleAudioCodec(codec),
          rawInfo: cleanDetails,
        };
        audioTracks.push(aTrack);
        activeBlock = { kind: 'audio', item: aTrack };

        if (!meta.hasAudio) {
          meta.hasAudio = true;
          meta.audioCodec = codec;
          meta.audioSampleRate = sampleRate;
          meta.audioChannels = channels;
        }
      } else if (streamKind === 'subtitle') {
        const formatType = isBitmapSubtitleCodec(codec) ? 'bitmap' : 'text';
        const sTrack: SubtitleTrackInfo = {
          streamIndex,
          typeIndex: subtitleTypeCounter++,
          codec,
          formatType,
          language,
          isDefault,
          isForced,
          rawInfo: cleanDetails,
        };
        subtitleTracks.push(sTrack);
        activeBlock = { kind: 'subtitle', item: sTrack };
      } else if (streamKind === 'attachment') {
        const att: AttachmentInfo = {
          streamIndex,
          typeIndex: attachmentTypeCounter++,
          codec,
        };
        attachments.push(att);
        activeBlock = { kind: 'attachment', item: att };
      } else {
        activeBlock = null;
      }
      continue;
    }

    // Parse Metadata key/value lines inside an active Stream or Chapter block
    if (activeBlock) {
      // If we hit a top-level section header like "Input #", "Output #", "Stream mapping:", exit block
      if (/^(Input #|Output #|Stream mapping:|Press \[q\])/i.test(trimmed)) {
        activeBlock = null;
        continue;
      }

      const kvMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].toLowerCase();
        const val = kvMatch[2].trim();

        if (key === 'title' && val) {
          if (
            activeBlock.kind === 'video' ||
            activeBlock.kind === 'audio' ||
            activeBlock.kind === 'subtitle' ||
            activeBlock.kind === 'chapter'
          ) {
            if (!activeBlock.item.title) {
              activeBlock.item.title = val;
            }
          }
        } else if (key === 'filename' && activeBlock.kind === 'attachment') {
          activeBlock.item.filename = val;
        } else if (key === 'mimetype' && activeBlock.kind === 'attachment') {
          activeBlock.item.mimetype = val;
        } else if (key.startsWith('bps') && (activeBlock.kind === 'video' || activeBlock.kind === 'audio')) {
          const bps = parseInt(val, 10);
          if (!isNaN(bps) && bps > 0 && !activeBlock.item.bitrate) {
            activeBlock.item.bitrate = Math.round(bps / 1000);
          }
        }
      }
    }
  }

  return meta;
}

export const AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma', '.opus',
  '.aiff', '.aif', '.alac', '.ac3', '.eac3', '.dts', '.pcm', '.caf',
  '.mka', '.ra', '.voc', '.amr', '.weba', '.mid', '.midi'
];

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot < 0) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Inspects the first 4 KB of a File to determine its container extension when Android
 * Scoped Storage / MediaPicker returns an extensionless content:// filename (e.g. "1000018294").
 */
export async function detectFileExtensionFromMagicBytes(file: File): Promise<string> {
  const existing = getFileExtension(file.name);
  if (existing && existing.length <= 6) return existing;

  // Check MIME type first as fast hint
  const mime = (file.type || '').toLowerCase();
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'video/x-matroska' || mime === 'video/matroska') return '.mkv';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/x-msvideo' || mime === 'video/avi') return '.avi';
  if (mime === 'video/mp2t') return '.ts';
  if (mime === 'video/av1' || mime === 'video/x-ivf') return '.ivf';
  if (mime === 'audio/mpeg') return '.mp3';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return '.wav';
  if (mime === 'audio/flac') return '.flac';
  if (mime === 'audio/ogg') return '.ogg';
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return '.m4a';

  try {
    const headerBuf = await file.slice(0, Math.min(file.size, 4096)).arrayBuffer();
    const u8 = new Uint8Array(headerBuf);
    if (u8.length < 12) return '';

    // 1. EBML Header (Matroska .mkv or .webm)
    if (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) {
      let ascii = '';
      for (let i = 0; i < Math.min(u8.length, 256); i++) {
        ascii += u8[i] >= 32 && u8[i] <= 126 ? String.fromCharCode(u8[i]) : ' ';
      }
      if (ascii.toLowerCase().includes('webm')) return '.webm';
      return '.mkv';
    }

    // 2. ISO BMFF ('ftyp' at byte offset 4) -> MP4 / MOV / M4A
    if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
      const brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]).toLowerCase();
      if (brand.startsWith('qt')) return '.mov';
      if (brand === 'm4a ' || brand === 'm4b ') return '.m4a';
      return '.mp4';
    }

    // 3. RIFF Container (AVI / WAV)
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) {
      const fourcc = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
      if (fourcc === 'AVI ') return '.avi';
      if (fourcc === 'WAVE') return '.wav';
    }

    // 4. FLV ('FLV\x01')
    if (u8[0] === 0x46 && u8[1] === 0x4c && u8[2] === 0x56 && u8[3] === 0x01) {
      return '.flv';
    }

    // 4.5. On2 IVF ('DKIF') — standard raw AV1 (av01) / VP9 container
    if (u8[0] === 0x44 && u8[1] === 0x4b && u8[2] === 0x49 && u8[3] === 0x46) {
      return '.ivf';
    }

    // 5. MPEG-TS (0x47 sync byte every 188 bytes) or M2TS (every 192 bytes at offset 4)
    if (u8.length > 380) {
      if (u8[0] === 0x47 && u8[188] === 0x47 && u8[376] === 0x47) {
        return '.ts';
      }
      if (u8[4] === 0x47 && u8[196] === 0x47 && u8[388] === 0x47) {
        return '.m2ts';
      }
    }

    // 6. Audio headers (FLAC, Ogg, MP3)
    if (u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43) return '.flac';
    if (u8[0] === 0x4f && u8[1] === 0x67 && u8[2] === 0x67 && u8[3] === 0x53) return '.ogg';
    if (
      (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) ||
      (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0)
    ) {
      return '.mp3';
    }
  } catch {
    // Ignore slice read failure
  }

  return '';
}

/**
 * Ultra-lightweight binary slice inspector for large files (> 150 MB).
 * Reads at most 4 MB from the start (and 4 MB from the end if MP4 moov is at the tail)
 * so iPadOS Safari / WebKit NEVER maps a 2-3 GB blob:// URL into AVFoundation memory.
 */
async function probeLargeFileSlices(file: File, isAudioOnly: boolean): Promise<Partial<SourceMetadata>> {
  const result: Partial<SourceMetadata> = {
    hasVideo: !isAudioOnly,
    hasAudio: true,
  };

  try {
    const SLICE_BYTES = 4 * 1024 * 1024; // 4 MB max slice
    const headBuf = await file.slice(0, Math.min(file.size, SLICE_BYTES)).arrayBuffer();
    const headU8 = new Uint8Array(headBuf);

    let tailU8: Uint8Array | null = null;
    if (file.size > SLICE_BYTES * 2) {
      const tailBuf = await file.slice(file.size - SLICE_BYTES, file.size).arrayBuffer();
      tailU8 = new Uint8Array(tailBuf);
    }

    const asciiFrom = (u8: Uint8Array) => {
      // Sample printable ASCII markers for fast FourCC / EBML codec identification
      let out = '';
      const limit = Math.min(u8.length, 1024 * 1024);
      for (let i = 0; i < limit; i++) {
        const c = u8[i];
        out += c >= 32 && c <= 126 ? String.fromCharCode(c) : ' ';
      }
      return out;
    };

    const scanText = asciiFrom(headU8) + (tailU8 ? ' ' + asciiFrom(tailU8) : '');

    // Detect Video Codec from FourCC (MP4/MOV/IVF) or CodecID (MKV/WebM)
    if (!isAudioOnly) {
      if (scanText.includes('V_AV1') || /\b(av01|AV01)\b/.test(scanText)) {
        result.videoCodec = 'av01';
      } else if (scanText.includes('V_MPEGH/ISO/HEVC') || /\b(hvc1|hev1)\b/.test(scanText)) {
        result.videoCodec = 'hevc';
      } else if (scanText.includes('V_MPEG4/ISO/AVC') || /\b(avc1|avc3)\b/.test(scanText)) {
        result.videoCodec = 'h264';
      } else if (scanText.includes('V_VP9') || /\bvp09\b/.test(scanText)) {
        result.videoCodec = 'vp9';
      } else if (scanText.includes('V_VP8') || /\bvp08\b/.test(scanText)) {
        result.videoCodec = 'vp8';
      }
    }

    // Detect Audio Codec from FourCC (MP4/MOV) or CodecID (MKV/WebM)
    if (scanText.includes('A_AAC') || /\bmp4a\b/.test(scanText)) {
      result.audioCodec = 'aac';
    } else if (scanText.includes('A_EAC3') || /\bec-3\b/.test(scanText)) {
      result.audioCodec = 'eac3';
    } else if (scanText.includes('A_AC3') || /\bac-3\b/.test(scanText)) {
      result.audioCodec = 'ac3';
    } else if (scanText.includes('A_OPUS') || /\bOpus\b/.test(scanText)) {
      result.audioCodec = 'opus';
    } else if (scanText.includes('A_VORBIS')) {
      result.audioCodec = 'vorbis';
    } else if (scanText.includes('A_FLAC') || /\bfLaC\b/.test(scanText)) {
      result.audioCodec = 'flac';
    } else if (scanText.includes('A_MPEG/L3') || /\b\.mp3\b/.test(scanText)) {
      result.audioCodec = 'mp3';
    } else if (/\balac\b/.test(scanText)) {
      result.audioCodec = 'alac';
    }

    // Parse MP4/MOV 'mvhd' box for exact duration & 'tkhd' for resolution if present
    const parseMp4Atoms = (u8: Uint8Array) => {
      const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      for (let i = 0; i < u8.length - 120; i++) {
        // 'mvhd' = 0x6d 0x76 0x68 0x64
        if (
          !result.duration &&
          u8[i] === 0x6d &&
          u8[i + 1] === 0x76 &&
          u8[i + 2] === 0x68 &&
          u8[i + 3] === 0x64
        ) {
          const version = u8[i + 4];
          if (version === 0 && i + 24 <= u8.length) {
            const timescale = view.getUint32(i + 16, false);
            const durationUnits = view.getUint32(i + 20, false);
            if (timescale > 0 && durationUnits > 0 && durationUnits < 0xffffffff) {
              const dur = durationUnits / timescale;
              if (dur > 0.1 && dur < 86400 * 3) {
                result.duration = dur;
              }
            }
          } else if (version === 1 && i + 32 <= u8.length) {
            const timescale = view.getUint32(i + 24, false);
            const high = view.getUint32(i + 28, false);
            const low = view.getUint32(i + 32, false);
            const durationUnits = high * 4294967296 + low;
            if (timescale > 0 && durationUnits > 0) {
              const dur = durationUnits / timescale;
              if (dur > 0.1 && dur < 86400 * 3) {
                result.duration = dur;
              }
            }
          }
        }
        // 'tkhd' = 0x74 0x6b 0x68 0x64
        if (
          !result.width &&
          u8[i] === 0x74 &&
          u8[i + 1] === 0x6b &&
          u8[i + 2] === 0x68 &&
          u8[i + 3] === 0x64
        ) {
          const version = u8[i + 4];
          const widthOffset = version === 1 ? i + 92 : i + 80;
          if (widthOffset + 8 <= u8.length) {
            const w = view.getUint16(widthOffset, false);
            const h = view.getUint16(widthOffset + 4, false);
            if (w >= 64 && w <= 16384 && h >= 64 && h <= 16384) {
              result.width = w;
              result.height = h;
              result.is4K = w >= 3840 || h >= 2160;
            }
          }
        }
      }
    };

    parseMp4Atoms(headU8);
    if (tailU8 && (!result.duration || !result.width)) {
      parseMp4Atoms(tailU8);
    }

    if (result.duration && result.duration > 0) {
      result.bitrate = Math.round((file.size * 8) / result.duration / 1000);
      result.isHighBitrate = result.bitrate >= 15000;
    }
  } catch {
    // Ignore slice inspection errors; FFmpeg WORKERFS header probe will inspect streams
  }

  return result;
}

/**
 * Attempts fast HTML5 media element inspection as a quick baseline with timeout safeguard.
 * For large files (> 150 MB), uses zero-copy 4 MB slice header inspection so iPadOS Safari
 * never buffers a multi-gigabyte blob:// URL into AVFoundation memory.
 */
export async function probeMediaElement(file: File): Promise<Partial<SourceMetadata>> {
  const ext = getFileExtension(file.name);
  const isAudioOnly = AUDIO_EXTENSIONS.includes(ext) || (file.type ? file.type.startsWith('audio/') : false);

  // CRITICAL iPadOS WebKit Jetsam Safeguard:
  // Never pass a > 150 MB file (e.g. 2-3 GB movie) to URL.createObjectURL + <video src="blob:...">
  // or non-native containers (.mkv, .avi, .flv, .wmv, .ts) of any large size.
  const isNonBrowserContainer = ['.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.vob', '.ivf', '.av1', '.obu'].includes(ext);
  if (file.size > 150 * 1024 * 1024 || (isNonBrowserContainer && file.size > 25 * 1024 * 1024)) {
    return probeLargeFileSlices(file, isAudioOnly);
  }

  return new Promise((resolve) => {
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve({
        hasVideo: !isAudioOnly,
        hasAudio: true,
      });
      return;
    }

    let isResolved = false;
    let timer: any = null;

    if (isAudioOnly) {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // ignore
        }
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      };

      const finish = (meta: Partial<SourceMetadata>) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve(meta);
      };

      timer = setTimeout(() => {
        finish({
          hasAudio: true,
          hasVideo: false,
        });
      }, 1200);

      audio.onloadedmetadata = () => {
        finish({
          duration: audio.duration,
          hasAudio: true,
          hasVideo: false,
        });
      };

      audio.onerror = () => {
        finish({
          hasAudio: true,
          hasVideo: false,
        });
      };

      audio.src = url;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {
          // ignore
        }
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      };

      const finish = (meta: Partial<SourceMetadata>) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve(meta);
      };

      timer = setTimeout(() => {
        finish({
          hasVideo: true,
          hasAudio: true,
        });
      }, 1200);

      video.onloadedmetadata = () => {
        finish({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          hasVideo: video.videoWidth > 0,
          hasAudio: true,
        });
      };

      video.onerror = () => {
        finish({
          hasVideo: true,
          hasAudio: true,
        });
      };

      video.src = url;
    }
  });
}
