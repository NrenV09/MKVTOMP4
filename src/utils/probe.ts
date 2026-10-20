import { SourceMetadata } from '../types';

/**
 * Parses FFmpeg stderr logs produced during inspection (-i input)
 */
export function parseFFmpegProbeLogs(logs: string[]): Partial<SourceMetadata> {
  const meta: Partial<SourceMetadata> = {
    hasVideo: false,
    hasAudio: false,
    parsedStreams: [],
  };

  const combined = logs.join('\n');

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

  // Find Streams
  // Stream #0:0(eng): Video: h264 (High), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 23.98 fps
  // Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s
  const streamLines = combined.split('\n').filter((l) => l.includes('Stream #'));
  meta.parsedStreams = streamLines.map((l) => l.trim());

  for (const line of streamLines) {
    if (line.includes('Video:')) {
      meta.hasVideo = true;
      const videoPart = line.split('Video:')[1];
      if (videoPart) {
        const parts = videoPart.split(',').map((p) => p.trim());
        meta.videoCodec = parts[0]?.split(' ')[0]?.toLowerCase();

        // Resolution: e.g. 1920x1080 or 1280x720
        for (const part of parts) {
          const resMatch = part.match(/(\d{3,5})x(\d{3,5})/);
          if (resMatch) {
            meta.width = parseInt(resMatch[1], 10);
            meta.height = parseInt(resMatch[2], 10);
          }
          // FPS
          const fpsMatch = part.match(/(\d+(?:\.\d+)?)\s*fps/);
          if (fpsMatch) {
            meta.fps = Math.round(parseFloat(fpsMatch[1]));
          }
          // Pixel Format (e.g. yuv420p, yuv420p10le, yuv444p)
          const pixMatch = part.match(/(yuv[\w]+)/i);
          if (pixMatch) {
            meta.pixelFormat = pixMatch[1].toLowerCase();
          }
        }

        // 10-bit / HDR Detection
        const is10 = line.includes('10le') || line.includes('Main 10') || line.includes('High 10') || (meta.pixelFormat && meta.pixelFormat.includes('10'));
        meta.is10Bit = Boolean(is10);

        // 4K UHD Detection
        const is4k = (meta.width && meta.width >= 3840) || (meta.height && meta.height >= 2160);
        meta.is4K = Boolean(is4k);

        // High Bitrate Detection (>15000 kbps)
        if (meta.bitrate && meta.bitrate >= 15000) {
          meta.isHighBitrate = true;
        }
      }
    }

    if (line.includes('Audio:')) {
      meta.hasAudio = true;
      const audioPart = line.split('Audio:')[1];
      if (audioPart) {
        const parts = audioPart.split(',').map((p) => p.trim());
        meta.audioCodec = parts[0]?.split(' ')[0]?.toLowerCase();

        for (const part of parts) {
          // Sample rate: e.g. 48000 Hz
          const srMatch = part.match(/(\d{4,6})\s*Hz/i);
          if (srMatch) {
            meta.audioSampleRate = parseInt(srMatch[1], 10);
          }
          // Channels
          if (part.includes('stereo')) meta.audioChannels = 2;
          else if (part.includes('mono')) meta.audioChannels = 1;
          else if (part.includes('5.1')) meta.audioChannels = 6;
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

    // Detect Video Codec from FourCC (MP4/MOV) or CodecID (MKV/WebM)
    if (!isAudioOnly) {
      if (scanText.includes('V_MPEGH/ISO/HEVC') || /\b(hvc1|hev1)\b/.test(scanText)) {
        result.videoCodec = 'hevc';
      } else if (scanText.includes('V_MPEG4/ISO/AVC') || /\b(avc1|avc3)\b/.test(scanText)) {
        result.videoCodec = 'h264';
      } else if (scanText.includes('V_AV1') || /\bav01\b/.test(scanText)) {
        result.videoCodec = 'av1';
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
  const isNonBrowserContainer = ['.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.vob'].includes(ext);
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
