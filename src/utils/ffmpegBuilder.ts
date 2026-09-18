import { EncodingConfig, SourceMetadata, ContainerFormat } from '../types';

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '--:--';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getRecommendedExtension(container: ContainerFormat): string {
  switch (container) {
    case 'mp4': return '.mp4';
    case 'webm': return '.webm';
    case 'mkv': return '.mkv';
    case 'mov': return '.mov';
    case 'avi': return '.avi';
    case 'gif': return '.gif';
    case 'mp3': return '.mp3';
    case 'm4a': return '.m4a';
    case 'wav': return '.wav';
    case 'flac': return '.flac';
    case 'ogg': return '.ogg';
    default: return `.${container}`;
  }
}

export function getMimeType(container: ContainerFormat): string {
  switch (container) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mkv': return 'video/x-matroska';
    case 'mov': return 'video/quicktime';
    case 'avi': return 'video/x-msvideo';
    case 'gif': return 'image/gif';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    case 'flac': return 'audio/flac';
    case 'ogg': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}

export interface CompatibilityCheck {
  isCompatible: boolean;
  warning?: string;
  suggestion?: string;
}

export function checkCompatibility(
  source: SourceMetadata | null,
  config: EncodingConfig
): CompatibilityCheck {
  if (!source) return { isCompatible: true };

  // Audio extraction
  if (config.targetCategory === 'audio') {
    if (!source.hasAudio) {
      return {
        isCompatible: false,
        warning: 'Source file does not contain an audio track to extract.',
      };
    }
    if (config.audioCodec === 'copy') {
      const srcAudio = (source.audioCodec || '').toLowerCase();
      if (config.container === 'mp3' && !srcAudio.includes('mp3')) {
        return {
          isCompatible: false,
          warning: `Cannot stream-copy ${srcAudio || 'unknown'} audio into MP3 container.`,
          suggestion: 'Switch Audio Encoder to MP3 (libmp3lame).',
        };
      }
      if (config.container === 'm4a' && !srcAudio.includes('aac')) {
        return {
          isCompatible: false,
          warning: `Cannot stream-copy ${srcAudio || 'unknown'} audio into M4A container.`,
          suggestion: 'Switch Audio Encoder to AAC.',
        };
      }
      if (config.container === 'ogg' && !srcAudio.includes('opus') && !srcAudio.includes('vorbis')) {
        return {
          isCompatible: false,
          warning: `Cannot stream-copy ${srcAudio || 'unknown'} audio into OGG container.`,
          suggestion: 'Switch Audio Encoder to Opus.',
        };
      }
    }
    return { isCompatible: true };
  }

  // Video targets
  if (config.container === 'gif') {
    return { isCompatible: true };
  }

  // Source has no video track
  if (!source.hasVideo && source.hasAudio) {
    return {
      isCompatible: false,
      warning: 'Source file contains only audio tracks (no video).',
      suggestion: 'Switch target format to MP3, M4A, or WAV audio.',
    };
  }

  // Stream Copy checks
  if (config.videoCodec === 'copy') {
    const srcVideo = (source.videoCodec || '').toLowerCase();

    if (config.container === 'webm' && !srcVideo.includes('vp8') && !srcVideo.includes('vp9') && !srcVideo.includes('av1')) {
      return {
        isCompatible: false,
        warning: `WebM requires VP8/VP9/AV1 video codecs. Source appears to be ${srcVideo || 'H.264/HEVC'}.`,
        suggestion: 'Switch Video Encoder to VP9 or switch container to MP4/MKV.',
      };
    }

    if (config.container === 'mp4') {
      const isMp4VideoCompatible = ['h264', 'avc1', 'hevc', 'h265', 'mpeg4', 'av1'].some((c) => srcVideo.includes(c));
      if (srcVideo && !isMp4VideoCompatible) {
        return {
          isCompatible: false,
          warning: `MP4 container cannot stream-copy '${srcVideo}' video codec.`,
          suggestion: 'Switch Video Encoder to H.264 (libx264) for clean re-encoding.',
        };
      }
    }
  }

  if (config.audioCodec === 'copy' && source.hasAudio) {
    const srcAudio = (source.audioCodec || '').toLowerCase();
    if (config.container === 'webm' && !srcAudio.includes('opus') && !srcAudio.includes('vorbis')) {
      return {
        isCompatible: false,
        warning: `WebM requires Opus or Vorbis audio. Source audio appears to be ${srcAudio || 'AAC/AC3'}.`,
        suggestion: 'Switch Audio Encoder to Opus.',
      };
    }
    if (config.container === 'mp4') {
      const isMp4AudioCompatible = ['aac', 'mp3', 'ac3', 'eac3', 'alac', 'opus'].some((c) => srcAudio.includes(c));
      if (srcAudio && !isMp4AudioCompatible) {
        return {
          isCompatible: false,
          warning: `MP4 container cannot stream-copy '${srcAudio}' audio codec.`,
          suggestion: 'Switch Audio Encoder to AAC for universal playback.',
        };
      }
    }
  }

  return { isCompatible: true };
}

export interface DeviceCapabilities {
  isIPad: boolean;
  isApple: boolean;
  cores: number;
  isMSeries: boolean;
  hasWakeLock: boolean;
  hasSharedArrayBuffer: boolean;
  hasWebCodecs: boolean;
  chipLabel: string;
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  if (typeof navigator === 'undefined') {
    return {
      isIPad: false,
      isApple: false,
      cores: 4,
      isMSeries: false,
      hasWakeLock: false,
      hasSharedArrayBuffer: false,
      hasWebCodecs: false,
      chipLabel: 'Standard CPU',
    };
  }
  const ua = navigator.userAgent || '';
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isApple = /Mac|iPad|iPhone/.test(ua) || isIPad;
  const cores = navigator.hardwareConcurrency || 4;
  const isMSeries = isApple && cores >= 8;
  const hasWakeLock = 'wakeLock' in navigator;
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && (typeof window !== 'undefined' && (window as any).crossOriginIsolated);
  const hasWebCodecs = typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined';

  let chipLabel = 'Multi-Core CPU';
  if (isIPad) {
    chipLabel = cores >= 8 ? 'Apple M3 / M-Series (iPad Air)' : 'Apple Silicon (iPad)';
  } else if (isApple) {
    chipLabel = cores >= 8 ? 'Apple M-Series Silicon' : 'Apple Silicon';
  }

  return {
    isIPad,
    isApple,
    cores,
    isMSeries,
    hasWakeLock,
    hasSharedArrayBuffer,
    hasWebCodecs,
    chipLabel,
  };
}

export function buildFFmpegArgs(
  inputFilename: string,
  outputFilename: string,
  config: EncodingConfig,
  source?: SourceMetadata | null
): string[] {
  const args: string[] = [];

  // Multi-threading optimization: -threads 0 lets FFmpeg use all available WebAssembly worker threads
  args.push('-threads', '0');

  // Input file
  args.push('-i', inputFilename);

  // Multi-threaded encoder
  args.push('-threads', '0');

  // AUDIO ONLY EXTRACTION
  if (config.targetCategory === 'audio') {
    args.push('-vn'); // no video

    if (config.audioCodec === 'copy') {
      args.push('-c:a', 'copy');
    } else {
      args.push('-c:a', config.audioCodec);

      if (config.audioCodec !== 'flac' && config.audioCodec !== 'pcm_s16le') {
        if (config.audioBitrate !== 'lossless') {
          args.push('-b:a', config.audioBitrate);
        }
      }

      if (config.audioChannels === 'mono') {
        args.push('-ac', '1');
      } else if (config.audioChannels === 'stereo') {
        args.push('-ac', '2');
      } else if (config.audioChannels === '5.1') {
        args.push('-ac', '6');
      }

      if (config.audioSampleRate !== 'source') {
        args.push('-ar', config.audioSampleRate);
      }
    }

    args.push(outputFilename);
    return args;
  }

  // GIF EXPORT
  if (config.container === 'gif') {
    args.push('-an'); // No audio in GIF
    const scale = config.resolution === 'source' ? 'scale=trunc(iw/2)*2:trunc(ih/2)*2' : `scale=${config.resolution.replace('x', ':')}:flags=lanczos`;
    const fps = config.framerate === 'source' ? '15' : config.framerate;
    args.push('-vf', `fps=${fps},${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
    args.push(outputFilename);
    return args;
  }

  // VIDEO CONVERSION
  // 1. Video Codec
  const isAppleTarget = config.container === 'mp4' || config.container === 'mov';

  if (config.videoCodec === 'copy') {
    args.push('-c:v', 'copy');

    // Apple HEVC Stream Copy tag: Apple QuickTime and iPadOS require the 'hvc1' fourcc tag
    // to play HEVC streams inside an MP4 container. Without this, iOS/iPadOS will fail to play it.
    const isSourceHevc = source?.videoCodec?.toLowerCase().includes('hevc') || source?.videoCodec?.toLowerCase().includes('h265');
    if (isAppleTarget && isSourceHevc) {
      args.push('-tag:v', 'hvc1');
    }

    // Faststart: Move moov atom to beginning of file for instant scrubbing and playback on iPad
    if (isAppleTarget) {
      args.push('-movflags', '+faststart');
    }
  } else {
    args.push('-c:v', config.videoCodec);

    // Speed Preset
    if (['libx264', 'libx265'].includes(config.videoCodec)) {
      args.push('-preset', config.speedPreset);
      if (config.speedPreset === 'ultrafast' && config.videoCodec === 'libx264') {
        args.push('-tune', 'fastdecode');
      }
    }

    // Rate control
    if (config.rateControl === 'crf') {
      args.push('-crf', config.crf.toString());
    } else {
      args.push('-b:v', config.videoBitrate);
    }

    // Video filters (Resolution & Framerate)
    const filters: string[] = [];
    if (config.resolution !== 'source') {
      const [w, h] = config.resolution.split('x');
      // Ensure dimensions are divisible by 2 for H.264/H.265
      filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    } else {
      // Ensure even width/height
      filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    }

    if (config.framerate !== 'source') {
      filters.push(`fps=${config.framerate}`);
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    // Pixel format: Ensure 8-bit YUV420p for universal Apple Silicon / iPad hardware decoding
    // This is critical when input is 10-bit HDR (yuv420p10le) to prevent black screens or corrupted color matrices.
    if (['libx264', 'libx265'].includes(config.videoCodec)) {
      args.push('-pix_fmt', 'yuv420p');
    }

    // Profile & Level for H.264 Apple Silicon hardware compatibility
    if (config.videoCodec === 'libx264' && isAppleTarget) {
      args.push('-profile:v', 'high', '-level', '4.2');
    }

    // Apple HEVC Tag for QuickTime / iPadOS Photos / Safari native playback
    if (config.videoCodec === 'libx265' && isAppleTarget) {
      args.push('-tag:v', 'hvc1');
    }

    // Faststart for streaming MP4 on iPadOS Safari & Files app
    if (isAppleTarget) {
      args.push('-movflags', '+faststart');
    }
  }

  // 2. Audio Track
  if (config.audioCodec === 'none') {
    args.push('-an');
  } else if (config.audioCodec === 'copy') {
    const srcAudio = (source?.audioCodec || '').toLowerCase();
    const isMp4SafeAudio = ['aac', 'alac', 'mp3'].some((a) => srcAudio.includes(a));
    if (config.container === 'mp4' && srcAudio && !isMp4SafeAudio) {
      // Safely encode audio to AAC so stream copy of video doesn't fail due to incompatible audio container
      args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-c:a', 'copy');
    }
  } else {
    args.push('-c:a', config.audioCodec);

    if (config.audioCodec !== 'flac' && config.audioCodec !== 'pcm_s16le') {
      if (config.audioBitrate !== 'lossless') {
        args.push('-b:a', config.audioBitrate);
      }
    }

    if (config.audioChannels === 'mono') {
      args.push('-ac', '1');
    } else if (config.audioChannels === 'stereo') {
      args.push('-ac', '2');
    } else if (config.audioChannels === '5.1') {
      args.push('-ac', '6');
    }

    if (config.audioSampleRate !== 'source') {
      args.push('-ar', config.audioSampleRate);
    }
  }

  args.push(outputFilename);
  return args;
}
