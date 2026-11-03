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
  autoRemuxNote?: string;
  droppedBitmapSubtitles?: string[];
  transcodedAudioTracks?: string[];
}

export function checkCompatibility(
  source: SourceMetadata | null,
  config: EncodingConfig
): CompatibilityCheck {
  if (!source) return { isCompatible: true };

  // Audio extraction
  if (config.targetCategory === 'audio') {
    if (!source.hasAudio && (!source.audioTracks || source.audioTracks.length === 0)) {
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
      if (config.container === 'm4a' && !srcAudio.includes('aac') && !srcAudio.includes('alac')) {
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

  const droppedBitmapSubtitles: string[] = [];
  const transcodedAudioTracks: string[] = [];
  const isMp4OrMov = config.container === 'mp4' || config.container === 'mov';

  // Check selected subtitle tracks for bitmap subtitles in MP4/MOV
  if (
    isMp4OrMov &&
    config.subtitleMode !== 'drop' &&
    source.subtitleTracks &&
    source.subtitleTracks.length > 0
  ) {
    const selectedSubIndices =
      config.selectedSubtitleTrackIndices ??
      source.subtitleTracks.filter((s) => s.formatType === 'text').map((s) => s.typeIndex);

    for (const sub of source.subtitleTracks) {
      if (selectedSubIndices.includes(sub.typeIndex) && sub.formatType === 'bitmap') {
        droppedBitmapSubtitles.push(
          `Track #0:s:${sub.typeIndex} (${sub.codec.toUpperCase()}${sub.language ? ` • ${sub.language.toUpperCase()}` : ''})`
        );
      }
    }
  }

  // Stream Copy checks
  if (config.videoCodec === 'copy') {
    const srcVideo = (source.videoCodec || '').toLowerCase();

    if (config.container === 'webm' && !srcVideo.includes('vp8') && !srcVideo.includes('vp9') && !srcVideo.includes('av1')) {
      return {
        isCompatible: false,
        warning: `WebM requires VP8/VP9/AV1 video codecs. Source appears to be ${srcVideo.toUpperCase() || 'H.264/HEVC'}.`,
        suggestion: 'Switch Video Encoder to VP9 or switch container to MP4/MKV.',
        droppedBitmapSubtitles,
      };
    }

    if (config.container === 'mp4') {
      const isMp4VideoCompatible = ['h264', 'avc1', 'hevc', 'h265', 'hvc1', 'hev1', 'mpeg4', 'av1', 'av01'].some((c) =>
        srcVideo.includes(c)
      );
      if (srcVideo && !isMp4VideoCompatible) {
        return {
          isCompatible: false,
          warning: `MP4 container cannot stream-copy '${srcVideo.toUpperCase()}' video codec.`,
          suggestion: 'Switch Video Encoder to H.264 (libx264) for clean re-encoding.',
          droppedBitmapSubtitles,
        };
      }
    }
  }

  // Audio compatibility & conditional transcode inspection
  if (config.audioCodec === 'copy' && source.hasAudio) {
    const srcAudio = (source.audioCodec || '').toLowerCase();
    if (config.container === 'webm' && !srcAudio.includes('opus') && !srcAudio.includes('vorbis')) {
      return {
        isCompatible: false,
        warning: `WebM requires Opus or Vorbis audio. Source audio appears to be ${srcAudio.toUpperCase() || 'AAC/AC3'}.`,
        suggestion: 'Switch Audio Encoder to Opus.',
        droppedBitmapSubtitles,
      };
    }

    if (isMp4OrMov) {
      if (source.audioTracks && source.audioTracks.length > 0) {
        const selectedAudIndices =
          config.selectedAudioTrackIndices ?? source.audioTracks.map((a) => a.typeIndex);
        for (const aud of source.audioTracks) {
          if (selectedAudIndices.includes(aud.typeIndex) && !aud.isMp4Compatible) {
            transcodedAudioTracks.push(
              `0:a:${aud.typeIndex} (${aud.codec.toUpperCase()}${aud.language ? ` • ${aud.language.toUpperCase()}` : ''})`
            );
          }
        }
      } else if (srcAudio) {
        const isMp4AudioCompatible = ['aac', 'mp3', 'ac3', 'eac3', 'alac', 'mp4a'].some((c) => srcAudio.includes(c));
        if (!isMp4AudioCompatible) {
          transcodedAudioTracks.push(`0:a:0 (${srcAudio.toUpperCase()})`);
        }
      }

      if (transcodedAudioTracks.length > 0 && config.conditionalAudioTranscode === false) {
        return {
          isCompatible: false,
          warning: `MP4 container cannot stream-copy incompatible audio (${transcodedAudioTracks.join(', ')}).`,
          suggestion: 'Enable Conditional Audio Transcode to AAC or switch Audio Encoder to AAC.',
          droppedBitmapSubtitles,
          transcodedAudioTracks,
        };
      }
    }
  }

  let autoRemuxNote: string | undefined;
  if (transcodedAudioTracks.length > 0 && config.conditionalAudioTranscode !== false) {
    autoRemuxNote = `Smart Remux: Video will stream-copy (-c:v copy) at full speed while incompatible audio (${transcodedAudioTracks.join(', ')}) transcodes to AAC.`;
  }

  return {
    isCompatible: true,
    autoRemuxNote,
    droppedBitmapSubtitles: droppedBitmapSubtitles.length > 0 ? droppedBitmapSubtitles : undefined,
    transcodedAudioTracks: transcodedAudioTracks.length > 0 ? transcodedAudioTracks : undefined,
  };
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

    // If user selected a specific audio track, map the first selected one
    if (
      source?.audioTracks &&
      source.audioTracks.length > 0 &&
      config.selectedAudioTrackIndices &&
      config.selectedAudioTrackIndices.length > 0
    ) {
      args.push('-map', `0:a:${config.selectedAudioTrackIndices[0]}`);
    }

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

  // ============================================================================
  // VIDEO CONVERSION / SMART REMUXING WITH SELECTIVE MULTI-TRACK MAPPING
  // ============================================================================
  const isAppleTarget = config.container === 'mp4' || config.container === 'mov';
  const hasProbedTracks = Boolean(
    source &&
      ((source.videoTracks && source.videoTracks.length > 0) ||
        (source.audioTracks && source.audioTracks.length > 0) ||
        (source.subtitleTracks && source.subtitleTracks.length > 0))
  );

  // Determine selected tracks when probed metadata is available
  const selectedVideoIndices =
    config.selectedVideoTrackIndices && config.selectedVideoTrackIndices.length > 0
      ? config.selectedVideoTrackIndices
      : source?.videoTracks && source.videoTracks.length > 0
      ? [source.videoTracks[0].typeIndex]
      : [0];

  const selectedAudioIndices =
    config.audioCodec === 'none'
      ? []
      : config.selectedAudioTrackIndices !== undefined
      ? config.selectedAudioTrackIndices
      : source?.audioTracks
      ? source.audioTracks.map((a) => a.typeIndex)
      : [0];

  // Filter subtitle tracks: drop bitmap subtitles (PGS/VobSub) when targeting MP4/MOV or WebM
  const rawSelectedSubIndices =
    config.subtitleMode === 'drop'
      ? []
      : config.selectedSubtitleTrackIndices !== undefined
      ? config.selectedSubtitleTrackIndices
      : source?.subtitleTracks
      ? source.subtitleTracks
          .filter((s) => (isAppleTarget || config.container === 'webm' ? s.formatType === 'text' : true))
          .map((s) => s.typeIndex)
      : [];

  const effectiveSubtitleTracks =
    source?.subtitleTracks?.filter((s) => {
      if (!rawSelectedSubIndices.includes(s.typeIndex)) return false;
      if ((isAppleTarget || config.container === 'webm') && s.formatType === 'bitmap') {
        return false; // Prevent MP4/WebM muxer crash on PGS/VobSub bitmap subtitles
      }
      return true;
    }) || [];

  // 1. Explicit Stream Mapping (-map 0:v:X, -map 0:a:X, -map 0:s:X)
  if (hasProbedTracks) {
    for (const vIdx of selectedVideoIndices) {
      args.push('-map', `0:v:${vIdx}`);
    }

    if (selectedAudioIndices.length > 0 && source?.hasAudio) {
      for (const aIdx of selectedAudioIndices) {
        args.push('-map', `0:a:${aIdx}`);
      }
    }

    for (const sTrack of effectiveSubtitleTracks) {
      args.push('-map', `0:s:${sTrack.typeIndex}`);
    }

    // Preserve chapters if present
    if (config.preserveMetadataTags !== false && source?.chapters && source.chapters.length > 0) {
      args.push('-map_chapters', '0');
    }
  }

  // 2. Video Codec Arguments
  if (config.videoCodec === 'copy') {
    args.push('-c:v', 'copy');

    // Apple HEVC Stream Copy tag: Apple QuickTime and iPadOS require the 'hvc1' fourcc tag
    // to play HEVC streams inside an MP4/MOV container.
    const isSourceHevc =
      source?.videoCodec?.toLowerCase().includes('hevc') ||
      source?.videoCodec?.toLowerCase().includes('h265') ||
      source?.videoTracks?.some(
        (v) =>
          selectedVideoIndices.includes(v.typeIndex) &&
          (v.codec.includes('hevc') || v.codec.includes('h265'))
      );

    if (isAppleTarget && isSourceHevc) {
      args.push('-tag:v', 'hvc1');
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
      filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    } else {
      filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    }

    if (config.framerate !== 'source') {
      filters.push(`fps=${config.framerate}`);
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    // Pixel format: Ensure 8-bit YUV420p for universal Apple Silicon / iPad hardware decoding
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
  }

  // 3. Audio Track Codec & Conditional Smart Remuxing
  if (config.audioCodec === 'none' || (hasProbedTracks && selectedAudioIndices.length === 0)) {
    args.push('-an');
  } else if (config.audioCodec === 'copy') {
    const selectedAudioObjects =
      source?.audioTracks?.filter((a) => selectedAudioIndices.includes(a.typeIndex)) || [];

    if (isAppleTarget && selectedAudioObjects.length > 0) {
      const hasIncompatible = selectedAudioObjects.some((a) => !a.isMp4Compatible);
      const hasCompatible = selectedAudioObjects.some((a) => a.isMp4Compatible);

      if (hasIncompatible && config.conditionalAudioTranscode !== false) {
        if (hasCompatible && selectedAudioObjects.length > 1) {
          // Per-stream smart remux: stream-copy compatible tracks (AAC/AC3/MP3) and transcode only incompatible tracks (DTS/TrueHD/FLAC/Opus) to AAC
          selectedAudioObjects.forEach((aTrack, outAudioIdx) => {
            if (aTrack.isMp4Compatible) {
              args.push(`-c:a:${outAudioIdx}`, 'copy');
            } else {
              args.push(`-c:a:${outAudioIdx}`, 'aac', `-b:a:${outAudioIdx}`, '192k');
            }
          });
        } else {
          // All selected audio tracks need conditional AAC transcoding
          args.push('-c:a', 'aac', '-b:a', '192k');
        }
      } else {
        args.push('-c:a', 'copy');
      }
    } else {
      const srcAudio = (source?.audioCodec || '').toLowerCase();
      const isMp4SafeAudio = ['aac', 'alac', 'mp3', 'ac3', 'eac3', 'mp4a'].some((a) => srcAudio.includes(a));
      if (isAppleTarget && srcAudio && !isMp4SafeAudio && config.conditionalAudioTranscode !== false) {
        args.push('-c:a', 'aac', '-b:a', '192k');
      } else {
        args.push('-c:a', 'copy');
      }
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

  // 4. Subtitle Track Handling (mov_text for MP4/MOV, webvtt for WebM, copy/srt for MKV)
  if (effectiveSubtitleTracks.length > 0 && config.subtitleMode !== 'drop') {
    if (isAppleTarget) {
      // MP4 / MOV requires mov_text for soft subtitles
      args.push('-c:s', 'mov_text');
    } else if (config.container === 'webm') {
      args.push('-c:s', 'webvtt');
    } else if (config.container === 'mkv') {
      args.push('-c:s', config.subtitleMode === 'convert' ? 'srt' : 'copy');
    } else {
      args.push('-c:s', 'copy');
    }
  } else if (config.subtitleMode === 'drop') {
    args.push('-sn');
  }

  // 5. Retain Language & Title Metadata Tags on Mapped Streams
  if (hasProbedTracks && config.preserveMetadataTags !== false) {
    // Video metadata
    const selectedVideoObjects =
      source?.videoTracks?.filter((v) => selectedVideoIndices.includes(v.typeIndex)) || [];
    selectedVideoObjects.forEach((vTrack, outIdx) => {
      if (vTrack.language) {
        args.push(`-metadata:s:v:${outIdx}`, `language=${vTrack.language}`);
      }
      if (vTrack.title) {
        args.push(`-metadata:s:v:${outIdx}`, `title=${vTrack.title}`);
      }
    });

    // Audio metadata
    const selectedAudioObjects =
      source?.audioTracks?.filter((a) => selectedAudioIndices.includes(a.typeIndex)) || [];
    selectedAudioObjects.forEach((aTrack, outIdx) => {
      if (aTrack.language) {
        args.push(`-metadata:s:a:${outIdx}`, `language=${aTrack.language}`);
      }
      if (aTrack.title) {
        args.push(`-metadata:s:a:${outIdx}`, `title=${aTrack.title}`);
      }
    });

    // Subtitle metadata
    effectiveSubtitleTracks.forEach((sTrack, outIdx) => {
      if (sTrack.language) {
        args.push(`-metadata:s:s:${outIdx}`, `language=${sTrack.language}`);
      }
      if (sTrack.title) {
        args.push(`-metadata:s:s:${outIdx}`, `title=${sTrack.title}`);
      }
    });
  }

  // 6. Always inject -movflags +faststart for MP4/MOV when fastStart is enabled (default true)
  // Places the MP4 moov atom at the front of the file for immediate playback and web compatibility
  if (isAppleTarget && config.fastStart !== false) {
    args.push('-movflags', '+faststart');
  }

  args.push(outputFilename);
  return args;
}

/**
 * Translates non-zero FFmpeg exit codes and WebAssembly runtime errors into
 * actionable, human-friendly diagnostics.
 */
export function diagnoseFFmpegFailure(
  exitCodeOrError: number | string,
  recentLogs: string[],
  config: EncodingConfig,
  source: SourceMetadata | null
): { title: string; explanation: string; suggestion: string } {
  const combined = (
    (typeof exitCodeOrError === 'string' ? exitCodeOrError : '') +
    '\n' +
    recentLogs.slice(-60).join('\n')
  ).toLowerCase();

  // 1. Out of Browser Memory / WebAssembly Heap Exhaustion
  if (
    combined.includes('out of memory') ||
    combined.includes('cannot enlarge memory') ||
    combined.includes('abort(oom)') ||
    combined.includes('rangeerror') ||
    combined.includes('allocation failed')
  ) {
    return {
      title: 'Out of Browser Memory (WebAssembly Heap Limit)',
      explanation:
        'The browser ran out of contiguous WebAssembly memory during processing. This typically happens when re-encoding high-bitrate 4K video in software mode instead of remuxing.',
      suggestion:
        'Use Direct Stream Copy (-c:v copy) for zero-memory remuxing, or click "Clear Memory" and lower the output resolution to 1080p/720p.',
    };
  }

  // 2. Incompatible Subtitle Codec for MP4
  if (
    combined.includes('subtitle codec') ||
    combined.includes('hdmv_pgs_subtitle') ||
    combined.includes('dvd_subtitle') ||
    (combined.includes('could not find tag for codec') &&
      (combined.includes('pgs') || combined.includes('sub') || combined.includes('ass')))
  ) {
    return {
      title: 'Incompatible Subtitle Codec for Target Container',
      explanation:
        'MP4 containers only support timed-text subtitles (mov_text) and cannot store image/bitmap subtitles (PGS or VobSub) natively.',
      suggestion:
        'Uncheck bitmap subtitle tracks in the Stream Inspector, set Subtitle Mode to "Convert Text to mov_text", or switch the target container to MKV.',
    };
  }

  // 3. Incompatible Audio Codec for MP4 Stream Copy
  if (
    combined.includes('could not find tag for codec') &&
    (combined.includes('dts') ||
      combined.includes('truehd') ||
      combined.includes('flac') ||
      combined.includes('vorbis') ||
      combined.includes('pcm'))
  ) {
    return {
      title: 'Incompatible Audio Stream for MP4 Remux',
      explanation: `The source audio track (${source?.audioCodec?.toUpperCase() || 'DTS/TrueHD/FLAC'}) is not natively supported in standard MP4 stream-copy mode.`,
      suggestion:
        'Enable "Conditional Audio Transcode to AAC" or switch the Audio Encoder to AAC while keeping Video on Stream Copy (-c:v copy).',
    };
  }

  // 4. Incompatible Video Codec for Stream Copy
  if (
    combined.includes('could not find tag for codec') ||
    combined.includes('codec not currently supported in container')
  ) {
    return {
      title: `Incompatible Stream Codec for .${config.container.toUpperCase()} Container`,
      explanation: `One or more source streams (${source?.videoCodec?.toUpperCase() || 'video'}/${source?.audioCodec?.toUpperCase() || 'audio'}) cannot be copied directly into a .${config.container.toUpperCase()} container without transcoding.`,
      suggestion:
        'Switch Video Codec to H.264 (libx264) and Audio Codec to AAC, or change the output container to .MKV which accepts virtually all codecs.',
    };
  }

  // 5. Invalid stream mapping
  if (combined.includes('matches no streams') || combined.includes('stream map')) {
    return {
      title: 'Selected Stream Track Not Found in Container',
      explanation:
        'One of the explicitly mapped video, audio, or subtitle tracks could not be resolved in the source container.',
      suggestion:
        'Review your checked Video, Audio, and Subtitle tracks in the Stream Inspector and try again.',
    };
  }

  return {
    title: typeof exitCodeOrError === 'number' ? `FFmpeg Exited with Code ${exitCodeOrError}` : 'Media Processing Pipeline Error',
    explanation:
      typeof exitCodeOrError === 'string' && exitCodeOrError.length < 220
        ? exitCodeOrError
        : 'The container streams encountered a muxing or codec constraint during processing.',
    suggestion:
      'If using Stream Copy on an MKV file, ensure Audio is set to AAC (or Conditional AAC) and bitmap subtitles (PGS/VobSub) are unchecked for MP4 output.',
  };
}

