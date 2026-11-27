/**
 * Hardware Acceleration & WebCodecs Compression Engine
 * Integrates:
 * 1. WebGPU / WebGL GPU adapter probing (Snapdragon Adreno, MediaTek Mali/Immortalis, Apple Silicon)
 * 2. WebCodecs (VideoEncoder, VideoDecoder) with hardwareAcceleration: 'prefer-hardware'
 * 3. Chunked StreamTarget MP4-Muxer + zero-copy MP4 fast-start for low-RAM mobile compression
 */

import { Muxer, StreamTarget } from 'mp4-muxer';
import { EncodingConfig, ResolutionPreset, SourceMetadata } from '../types';
import { relocateMoovToFrontZeroCopy } from './mp4FastStart';
import { demuxMp4VideoTrack, createSampleSliceReader } from './mp4Demuxer';

// Stub missing WebGPU types for TS compilation
type GPUDevice = any;

export interface WebGPUInfo {
  available: boolean;
  adapterName: string;
  vendor: string;
  architecture: string;
  device?: GPUDevice;
  description: string;
}

export interface WebCodecsInfo {
  available: boolean;
  hwH264: boolean;
  hwHEVC: boolean;
  hwVP9: boolean;
  hwAV1: boolean;
  swAV1: boolean;
  av1Available: boolean;
}

export interface HardwareCapabilities {
  webgpu: WebGPUInfo;
  webcodecs: WebCodecsInfo;
  hardwareAccelerationSupported: boolean;
}

export interface CompressionEstimate {
  estimatedBytes: number;
  savingsPercent: number;
  targetVideoBps: number;
  targetAudioBps: number;
}

export interface HardwareEncodeResult {
  blob: Blob;
  codecUsed: string;
  isHevc: boolean;
  isAv1: boolean;
  isHardware: boolean;
  width: number;
  height: number;
  bitrateBps: number;
  decodeMode: 'webcodecs-sequential' | 'video-element';
}

let cachedCapabilities: HardwareCapabilities | null = null;
let activeGpuDevice: GPUDevice | null = null;

/**
 * Parses a human bitrate string ("2500k", "4M", "2.5m", "1500000") into bits per second.
 */
export function parseBitrateToBps(value?: string): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([km])?(?:bps|b\/s)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = match[2];
  if (unit === 'm') return Math.round(num * 1_000_000);
  if (unit === 'k') return Math.round(num * 1_000);
  return num < 100_000 ? Math.round(num * 1_000) : Math.round(num);
}

/**
 * Resolves output dimensions preserving source aspect ratio (portrait or landscape),
 * without upscaling above source dimensions, rounded to even pixels for H.264/HEVC.
 */
export function resolveTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  resolution: ResolutionPreset
): { width: number; height: number } {
  const safeSrcW = Math.max(2, Math.round((sourceWidth || 1920) / 2) * 2);
  const safeSrcH = Math.max(2, Math.round((sourceHeight || 1080) / 2) * 2);

  if (resolution === 'source') {
    return { width: safeSrcW, height: safeSrcH };
  }

  const parts = resolution.split('x').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { width: safeSrcW, height: safeSrcH };
  }

  const isPortrait = safeSrcH > safeSrcW;
  const maxW = isPortrait ? Math.min(parts[0], parts[1]) : Math.max(parts[0], parts[1]);
  const maxH = isPortrait ? Math.max(parts[0], parts[1]) : Math.min(parts[0], parts[1]);

  // Never upscale during compression
  if (safeSrcW <= maxW && safeSrcH <= maxH) {
    return { width: safeSrcW, height: safeSrcH };
  }

  const scale = Math.min(maxW / safeSrcW, maxH / safeSrcH);
  const width = Math.max(2, Math.round((safeSrcW * scale) / 2) * 2);
  const height = Math.max(2, Math.round((safeSrcH * scale) / 2) * 2);
  return { width, height };
}

/**
 * Estimates effective audio bitrate in bps for compression size calculations.
 */
export function parseAudioBitrateBps(
  config: EncodingConfig,
  source?: SourceMetadata | null
): number {
  if (config.audioCodec === 'none' || (source && !source.hasAudio)) return 0;

  const trackCount =
    config.selectedAudioTrackIndices !== undefined
      ? Math.max(0, config.selectedAudioTrackIndices.length)
      : source?.audioTracks?.length || (source?.hasAudio ? 1 : 0);

  if (trackCount === 0) return 0;

  if (config.audioCodec === 'copy') {
    const selectedTracks =
      source?.audioTracks?.filter((t) =>
        config.selectedAudioTrackIndices
          ? config.selectedAudioTrackIndices.includes(t.typeIndex)
          : true
      ) || [];
    if (selectedTracks.length > 0) {
      return selectedTracks.reduce((sum, t) => sum + ((t.bitrate || 192) * 1000), 0);
    }
    return 192_000 * trackCount;
  }

  if (config.audioBitrate === 'lossless') return 1_000_000 * trackCount;
  const parsed = parseBitrateToBps(config.audioBitrate) || 128_000;
  return parsed * trackCount;
}

/**
 * Computes the target video bitrate (in bps) from Target Size MB, explicit Bitrate,
 * or CRF + resolution + codec efficiency — capped intelligently below source bitrate
 * so compression reliably reduces file size on both GPU WebCodecs and CPU fallback.
 */
export function computeTargetVideoBitrateBps(
  source: SourceMetadata | null | undefined,
  config: EncodingConfig
): number {
  const duration = source?.duration && source.duration > 0 ? source.duration : 0;
  const audioBps = parseAudioBitrateBps(config, source);
  const isCompressing = config.compressEnabled !== false;

  // 1. Target Size (MB) mode (only when video compressor is enabled)
  if (
    isCompressing &&
    config.compressionPreset === 'target-size' &&
    config.targetSizeMB &&
    config.targetSizeMB > 0 &&
    duration > 0
  ) {
    const totalTargetBits = config.targetSizeMB * 8 * 1024 * 1024 * 0.95; // 5% container + margin
    const availableVideoBits = Math.max(duration * 180_000, totalTargetBits - audioBps * duration);
    const computedBps = Math.round(availableVideoBits / duration);
    return Math.min(35_000_000, Math.max(180_000, computedBps));
  }

  // 2. Explicit constant/average bitrate mode
  if (config.rateControl === 'bitrate') {
    const parsed = parseBitrateToBps(config.videoBitrate);
    if (parsed) {
      return Math.min(50_000_000, Math.max(180_000, parsed));
    }
  }

  // 3. Perceptual CRF-driven bitrate curve for hardware WebCodecs & size estimation
  const { width, height } = resolveTargetDimensions(
    source?.width || 1920,
    source?.height || 1080,
    config.resolution
  );
  const fps =
    config.framerate !== 'source'
      ? Math.max(15, Number(config.framerate) || 30)
      : Math.min(60, Math.max(24, source?.fps || 30));

  // Baseline H.264 CRF 23 ≈ 0.06 bits/pixel-frame (~3.7 Mbps at 1080p30, ~1.65 Mbps at 720p30)
  // When converting codecs without compression, target high visual fidelity (CRF ~19)
  const crf = isCompressing
    ? Math.min(34, Math.max(16, config.crf || 23))
    : Math.min(22, Math.max(16, config.crf || 19));
  const crfFactor = Math.pow(2, (23 - crf) / 6);
  const codecFactor =
    config.videoCodec === 'av01'
      ? 0.58
      : config.videoCodec === 'libx265'
      ? 0.68
      : config.videoCodec === 'libvpx-vp9'
      ? 0.72
      : 1.0;

  let estimatedBps = Math.round(width * height * fps * 0.06 * crfFactor * codecFactor);

  // Estimate source video bitrate
  let sourceTotalBps = 0;
  if (source?.bitrate && source.bitrate > 0) {
    sourceTotalBps = source.bitrate * 1000; // probe.ts stores bitrate in kb/s
  } else if (source?.size && duration > 0) {
    sourceTotalBps = Math.round((source.size * 8) / duration);
  }

  if (sourceTotalBps > 0 && isCompressing) {
    const sourceVideoBps = Math.max(250_000, sourceTotalBps - audioBps);
    const maxRatio =
      config.compressionPreset === 'strong' || crf >= 28
        ? 0.42
        : config.compressionPreset === 'balanced' || crf >= 23
        ? 0.62
        : 0.85;
    estimatedBps = Math.min(estimatedBps, Math.round(sourceVideoBps * maxRatio));
  }

  return Math.min(35_000_000, Math.max(220_000, estimatedBps));
}

/**
 * Estimates final compressed file size and percentage reduction for live UI preview.
 */
export function estimateCompressedSizeBytes(
  source: SourceMetadata | null | undefined,
  config: EncodingConfig
): CompressionEstimate | null {
  if (!source || !source.size || !source.duration || source.duration <= 0) return null;
  if (config.targetCategory !== 'video' || config.container === 'gif') return null;

  const targetAudioBps = parseAudioBitrateBps(config, source);

  if (config.videoCodec === 'copy') {
    return {
      estimatedBytes: source.size,
      savingsPercent: 0,
      targetVideoBps: Math.max(0, Math.round((source.size * 8) / source.duration) - targetAudioBps),
      targetAudioBps,
    };
  }

  const targetVideoBps = computeTargetVideoBitrateBps(source, config);
  const rawBytes = ((targetVideoBps + targetAudioBps) / 8) * source.duration * 1.03; // 3% mux overhead
  const estimatedBytes = Math.max(64 * 1024, Math.round(rawBytes));
  const savingsPercent = Math.round((1 - estimatedBytes / source.size) * 100);

  return {
    estimatedBytes,
    savingsPercent,
    targetVideoBps,
    targetAudioBps,
  };
}

/**
 * Paged 4 MB block writer for mp4-muxer StreamTarget.
 * Avoids allocating a single massive contiguous ArrayBuffer on mobile RAM while
 * supporting random-access header patches (e.g. mdat size fixup at finalize()).
 */
class PagedBlobWriter {
  private readonly pageSize = 4 * 1024 * 1024;
  private pages: Uint8Array[] = [];
  private totalSize = 0;

  write(data: Uint8Array, position: number): void {
    let remaining = data.byteLength;
    let srcOffset = 0;
    let dstPos = position;

    while (remaining > 0) {
      const pageIdx = Math.floor(dstPos / this.pageSize);
      const pageOffset = dstPos % this.pageSize;
      while (this.pages.length <= pageIdx) {
        this.pages.push(new Uint8Array(this.pageSize));
      }
      const chunkLen = Math.min(remaining, this.pageSize - pageOffset);
      this.pages[pageIdx].set(data.subarray(srcOffset, srcOffset + chunkLen), pageOffset);
      srcOffset += chunkLen;
      dstPos += chunkLen;
      remaining -= chunkLen;
    }

    if (position + data.byteLength > this.totalSize) {
      this.totalSize = position + data.byteLength;
    }
  }

  toBlob(mimeType = 'video/mp4'): Blob {
    if (this.totalSize === 0) return new Blob([], { type: mimeType });
    const parts: BlobPart[] = [];
    let left = this.totalSize;
    for (let i = 0; i < this.pages.length && left > 0; i++) {
      const len = Math.min(left, this.pageSize);
      const page = this.pages[i];
      parts.push(len === this.pageSize ? page : page.subarray(0, len));
      left -= len;
    }
    const blob = new Blob(parts, { type: mimeType });
    // Release references to page buffers as soon as Blob wraps them
    this.pages = [];
    return blob;
  }
}

/**
 * Probe WebGPU and WebCodecs hardware acceleration support
 */
export async function detectHardwareCapabilities(): Promise<HardwareCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  // 1. WebGPU Probing
  const webgpu: WebGPUInfo = {
    available: false,
    adapterName: 'Unavailable',
    vendor: 'Standard CPU',
    architecture: 'Host',
    description: 'WebGPU Not Supported',
  };

  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        webgpu.available = true;
        try {
          const device = await adapter.requestDevice();
          activeGpuDevice = device;
          webgpu.device = device;
        } catch (devErr) {
          console.warn('WebGPU device request fallback:', devErr);
        }

        if (adapter.info) {
          webgpu.adapterName = adapter.info.device || adapter.info.description || 'GPU Adapter';
          webgpu.vendor = adapter.info.vendor || 'Hardware Vendor';
          webgpu.architecture = adapter.info.architecture || '';
          webgpu.description = `${webgpu.vendor} ${webgpu.adapterName}`.trim();
        } else if (adapter.requestAdapterInfo) {
          const info = await adapter.requestAdapterInfo();
          webgpu.adapterName = info.device || info.description || 'GPU Adapter';
          webgpu.vendor = info.vendor || 'Hardware Vendor';
          webgpu.architecture = info.architecture || '';
          webgpu.description = `${webgpu.vendor} ${webgpu.adapterName}`.trim();
        } else {
          webgpu.adapterName = 'Hardware WebGPU Adapter';
          webgpu.description = 'Active High-Performance GPU';
        }
      }
    } catch (e) {
      console.warn('WebGPU query note:', e);
    }
  }

  // Fallback to WebGL UNMASKED_RENDERER_WEBGL to surface Adreno (Snapdragon) / Mali (MediaTek) details
  if ((!webgpu.available || webgpu.adapterName === 'GPU Adapter') && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl2') as WebGLRenderingContext | null) ||
        (canvas.getContext('webgl') as WebGLRenderingContext | null);
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        if (typeof renderer === 'string' && renderer.trim()) {
          if (/adreno|qualcomm/i.test(renderer)) {
            webgpu.vendor = 'Qualcomm Snapdragon';
            webgpu.adapterName = renderer.trim();
            webgpu.description = `Qualcomm ${renderer.trim()}`;
          } else if (/mali|immortalis|powervr/i.test(renderer)) {
            webgpu.vendor = 'ARM / MediaTek';
            webgpu.adapterName = renderer.trim();
            webgpu.description = renderer.trim();
          } else if (!webgpu.available) {
            webgpu.adapterName = renderer.trim();
            webgpu.description = renderer.trim();
          }
        }
      }
    } catch {
      // ignore WebGL probe errors
    }
  }

  // 2. WebCodecs Probing (with prefer-hardware + AV1 WebCodecs software fallback check)
  const webcodecs: WebCodecsInfo = {
    available: typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoDecoder' in window,
    hwH264: false,
    hwHEVC: false,
    hwVP9: false,
    hwAV1: false,
    swAV1: false,
    av1Available: false,
  };

  if (webcodecs.available && typeof VideoEncoder.isConfigSupported === 'function') {
    // Check H.264 hardware encoding across High/Main/Baseline profiles (Desktop, Apple, Snapdragon, MediaTek)
    for (const h264Profile of ['avc1.640033', 'avc1.64002a', 'avc1.4d0029', 'avc1.42001f']) {
      try {
        const h264Res = await VideoEncoder.isConfigSupported({
          codec: h264Profile,
          width: 1280,
          height: 720,
          bitrate: 2_500_000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware',
        });
        if (h264Res.supported) {
          webcodecs.hwH264 = true;
          break;
        }
      } catch {}
    }

    // Check HEVC (H.265) hardware encoding (Apple VideoToolbox, Snapdragon/MediaTek MediaCodec)
    for (const hevcProfile of ['hvc1.1.6.L120.90', 'hev1.1.6.L120.90']) {
      try {
        const hevcRes = await VideoEncoder.isConfigSupported({
          codec: hevcProfile,
          width: 1280,
          height: 720,
          bitrate: 2_500_000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware',
        });
        if (hevcRes.supported) {
          webcodecs.hwHEVC = true;
          break;
        }
      } catch {}
    }

    // Check VP9
    try {
      const vp9Res = await VideoEncoder.isConfigSupported({
        codec: 'vp09.00.10.08',
        width: 1280,
        height: 720,
        bitrate: 2_500_000,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (vp9Res.supported) webcodecs.hwVP9 = true;
    } catch {}

    // Check AV1 (av01) hardware encoding first (Snapdragon 8 Gen 3+, Dimensity 9300+, M3+, RTX 40+, Arc)
    const av1Profiles = ['av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08'];
    for (const av1Profile of av1Profiles) {
      try {
        const av1Hw = await VideoEncoder.isConfigSupported({
          codec: av1Profile,
          width: 1280,
          height: 720,
          bitrate: 2_000_000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware',
        });
        if (av1Hw.supported) {
          webcodecs.hwAV1 = true;
          break;
        }
      } catch {}
    }

    // Also check built-in browser WebCodecs AV1 (av01) software encoding (Chrome/Edge/Firefox)
    for (const av1Profile of av1Profiles) {
      try {
        const av1Sw = await VideoEncoder.isConfigSupported({
          codec: av1Profile,
          width: 1280,
          height: 720,
          bitrate: 2_000_000,
          framerate: 30,
          hardwareAcceleration: 'no-preference',
        });
        if (av1Sw.supported) {
          webcodecs.swAV1 = true;
          break;
        }
      } catch {}
    }

    webcodecs.av1Available = webcodecs.hwAV1 || webcodecs.swAV1;
  }

  const result: HardwareCapabilities = {
    webgpu,
    webcodecs,
    hardwareAccelerationSupported:
      webgpu.available || webcodecs.hwH264 || webcodecs.hwHEVC || webcodecs.hwAV1,
  };

  cachedCapabilities = result;
  return result;
}

export function getActiveWebGPUDevice(): GPUDevice | null {
  return activeGpuDevice;
}

export interface HardwareTranscodeOptions {
  resolution?: ResolutionPreset;
  targetWidth?: number;
  targetHeight?: number;
  bitrate?: number; // in bps, e.g. 2_500_000 for 2.5 Mbps
  framerate?: number;
  preserveSourceFramerate?: boolean;
  preferredCodec?: 'avc' | 'hevc' | 'av01';
  preferHardware?: boolean;
  codec?: string;
  fastStart?: boolean;
  webgpuFilter?: 'none' | 'grayscale';
  onProgress?: (progress: { percent: number; currentTime: number; duration: number; fps: number }) => void;
  signal?: AbortSignal;
}

function resolveEncodeDimensions(
  sourceWidth: number,
  sourceHeight: number,
  options: HardwareTranscodeOptions
): { width: number; height: number } {
  if (options.resolution) {
    return resolveTargetDimensions(sourceWidth, sourceHeight, options.resolution);
  }
  if (options.targetWidth && options.targetHeight) {
    const isPortrait = sourceHeight > sourceWidth;
    const maxW = isPortrait
      ? Math.min(options.targetWidth, options.targetHeight)
      : Math.max(options.targetWidth, options.targetHeight);
    const maxH = isPortrait
      ? Math.max(options.targetWidth, options.targetHeight)
      : Math.min(options.targetWidth, options.targetHeight);
    if (sourceWidth <= maxW && sourceHeight <= maxH) {
      return {
        width: Math.max(2, Math.round(sourceWidth / 2) * 2),
        height: Math.max(2, Math.round(sourceHeight / 2) * 2),
      };
    }
    const scale = Math.min(maxW / sourceWidth, maxH / sourceHeight);
    return {
      width: Math.max(2, Math.round((sourceWidth * scale) / 2) * 2),
      height: Math.max(2, Math.round((sourceHeight * scale) / 2) * 2),
    };
  }
  return {
    width: Math.max(2, Math.round(sourceWidth / 2) * 2),
    height: Math.max(2, Math.round(sourceHeight / 2) * 2),
  };
}

async function selectVideoEncoderProfile(
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
  options: HardwareTranscodeOptions
): Promise<{
  selectedCodec: string;
  selectedAccel: HardwareAcceleration;
  isHardware: boolean;
  isAv1: boolean;
  isHevc: boolean;
  muxerVideoCodec: 'av1' | 'hevc' | 'avc';
}> {
  const isAbove1080p = width * height > 1920 * 1080;
  const av1Candidates =
    width * height >= 2560 * 1440
      ? ['av01.0.12M.08', 'av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08']
      : ['av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08'];
  const hevcCandidates = ['hvc1.1.6.L120.90', 'hev1.1.6.L120.90'];
  // Prefer Level 4.2 High / Main / Baseline for <=1080p for broad mobile MediaCodec & desktop compatibility
  const h264Candidates = isAbove1080p
    ? ['avc1.640033', 'avc1.64002a', 'avc1.4d0029', 'avc1.42001f']
    : ['avc1.64002a', 'avc1.4d002a', 'avc1.4d0029', 'avc1.42001f', 'avc1.640033'];

  const wantHw = options.preferHardware !== false;
  let selectedCodec: string | null = null;
  let selectedAccel: HardwareAcceleration = wantHw ? 'prefer-hardware' : 'no-preference';
  let isHardware = wantHw;

  const probeCandidates = async (
    candidates: string[],
    accel: HardwareAcceleration
  ): Promise<string | null> => {
    if (typeof VideoEncoder.isConfigSupported !== 'function') {
      return candidates[0] || null;
    }
    for (const candidate of candidates) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: candidate,
          width,
          height,
          bitrate,
          framerate,
          hardwareAcceleration: accel,
        });
        if (support.supported) return candidate;
      } catch {}
    }
    return null;
  };

  if (options.codec) {
    selectedCodec = await probeCandidates([options.codec], selectedAccel);
    if (!selectedCodec && selectedAccel === 'prefer-hardware') {
      selectedAccel = 'no-preference';
      isHardware = false;
      selectedCodec = await probeCandidates([options.codec], selectedAccel);
    }
  } else if (options.preferredCodec === 'av01') {
    if (wantHw) {
      selectedCodec = await probeCandidates(av1Candidates, 'prefer-hardware');
      if (selectedCodec) {
        selectedAccel = 'prefer-hardware';
        isHardware = true;
      }
    }
    if (!selectedCodec) {
      selectedCodec = await probeCandidates(av1Candidates, 'no-preference');
      if (selectedCodec) {
        selectedAccel = 'no-preference';
        isHardware = false;
      }
    }
  } else if (options.preferredCodec === 'hevc') {
    selectedCodec = await probeCandidates([...hevcCandidates, ...h264Candidates], selectedAccel);
    if (!selectedCodec && selectedAccel === 'prefer-hardware') {
      selectedAccel = 'no-preference';
      isHardware = false;
      selectedCodec = await probeCandidates([...hevcCandidates, ...h264Candidates], selectedAccel);
    }
  } else {
    selectedCodec = await probeCandidates(h264Candidates, selectedAccel);
    if (!selectedCodec && selectedAccel === 'prefer-hardware') {
      selectedAccel = 'no-preference';
      isHardware = false;
      selectedCodec = await probeCandidates(h264Candidates, selectedAccel);
    }
  }

  if (!selectedCodec) {
    throw new Error(
      options.preferredCodec === 'av01'
        ? 'This browser does not support WebCodecs AV1 (av01) encoding.'
        : 'No supported hardware VideoEncoder profile found for target resolution/codec.'
    );
  }

  const isAv1 = selectedCodec.startsWith('av01');
  const isHevc = selectedCodec.startsWith('hvc1') || selectedCodec.startsWith('hev1');
  const muxerVideoCodec: 'av1' | 'hevc' | 'avc' = isAv1 ? 'av1' : isHevc ? 'hevc' : 'avc';

  return {
    selectedCodec,
    selectedAccel,
    isHardware,
    isAv1,
    isHevc,
    muxerVideoCodec,
  };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildDecoderCandidateConfigs(
  track: NonNullable<Awaited<ReturnType<typeof demuxMp4VideoTrack>>>,
  wantHw: boolean
): VideoDecoderConfig[] {
  const raw: VideoDecoderConfig[] = [];
  const accels: HardwareAcceleration[] = wantHw
    ? ['prefer-hardware', 'no-preference']
    : ['no-preference'];

  if (track.fourcc === 'av01') {
    // If av1C has configOBUs (> 4 bytes), try WITH description first;
    // if av1C is 4-byte header only, OBUs are in-band so try WITHOUT description first.
    const hasConfigObus = Boolean(track.description && track.description.byteLength > 4);
    for (const accel of accels) {
      if (hasConfigObus && track.description) {
        raw.push({
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          description: track.description,
          hardwareAcceleration: accel,
        });
        raw.push({
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          hardwareAcceleration: accel,
        });
      } else {
        raw.push({
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          hardwareAcceleration: accel,
        });
        if (track.description) {
          raw.push({
            codec: track.codec,
            codedWidth: track.codedWidth,
            codedHeight: track.codedHeight,
            description: track.description,
            hardwareAcceleration: accel,
          });
        }
      }
    }
    // Generic AV1 fallback strings in case av1C reported an exotic level/tier
    for (const fallbackCodec of ['av01.0.08M.08', 'av01.0.04M.08']) {
      if (fallbackCodec !== track.codec) {
        raw.push({
          codec: fallbackCodec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          hardwareAcceleration: 'no-preference',
        });
      }
    }
  } else if (track.fourcc === 'vp09') {
    for (const accel of accels) {
      raw.push({
        codec: track.codec,
        codedWidth: track.codedWidth,
        codedHeight: track.codedHeight,
        hardwareAcceleration: accel,
      });
    }
  } else {
    for (const accel of accels) {
      if (track.description) {
        raw.push({
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          description: track.description,
          hardwareAcceleration: accel,
        });
      } else {
        raw.push({
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          hardwareAcceleration: accel,
        });
      }
    }
  }

  // Deduplicate by codec + description presence + acceleration preference
  const seen = new Set<string>();
  const deduped: VideoDecoderConfig[] = [];
  for (const cfg of raw) {
    const key = `${cfg.codec}|${cfg.description ? 'd' : 'n'}|${cfg.hardwareAcceleration}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(cfg);
    }
  }
  return deduped;
}

async function runSequentialDecodeAttempt(
  videoBlob: Blob,
  track: NonNullable<Awaited<ReturnType<typeof demuxMp4VideoTrack>>>,
  decoderConfig: VideoDecoderConfig,
  encoderProfile: Awaited<ReturnType<typeof selectVideoEncoderProfile>>,
  width: number,
  height: number,
  bitrate: number,
  effectiveFps: number,
  options: HardwareTranscodeOptions
): Promise<{ result: HardwareEncodeResult | null; encodedFramesCount: number }> {
  const pagedWriter = new PagedBlobWriter();
  const muxer = new Muxer({
    target: new StreamTarget({
      onData: (data, position) => {
        pagedWriter.write(data, position);
      },
      chunked: true,
      chunkSize: 4 * 1024 * 1024,
    }),
    video: {
      codec: encoderProfile.muxerVideoCodec,
      width,
      height,
      frameRate: effectiveFps,
    },
    fastStart: false,
  });

  const reader = createSampleSliceReader(videoBlob, 2 * 1024 * 1024);
  let encoder: VideoEncoder | null = null;
  let decoder: VideoDecoder | null = null;
  let fatalError: Error | null = null;
  let encodedFramesCount = 0;
  let decodedFramesCount = 0;
  let lastEncodedTsUs = -1;
  let lastActivityAt = Date.now();

  const shouldDecimateFps =
    !options.preserveSourceFramerate &&
    Boolean(options.framerate && track.fps > 0 && options.framerate < track.fps * 0.96);
  const targetStepUs =
    shouldDecimateFps && options.framerate ? Math.round(1_000_000 / options.framerate) : 0;
  let nextAllowedTsUs = 0;

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;

  const duration = track.durationSeconds > 0 ? track.durationSeconds : 1;
  const keyInterval = Math.max(1, Math.round(effectiveFps * 2));
  const startTime = Date.now();
  let lastProgressAt = 0;

  const isSourceHighBitDepth = track.codec.endsWith('.10') || track.codec.endsWith('.12');

  const cleanup = () => {
    reader.release();
    try {
      if (decoder && decoder.state !== 'closed') decoder.close();
    } catch {}
    try {
      if (encoder && encoder.state !== 'closed') encoder.close();
    } catch {}
    decoder = null;
    encoder = null;
  };

  try {
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        lastActivityAt = Date.now();
        muxer.addVideoChunk(chunk, meta);
      },
      error: (err) => {
        fatalError = err instanceof Error ? err : new Error(String(err));
      },
    });

    encoder.configure({
      codec: encoderProfile.selectedCodec,
      width,
      height,
      bitrate,
      framerate: effectiveFps,
      bitrateMode: 'variable',
      hardwareAcceleration: encoderProfile.selectedAccel,
      latencyMode: 'quality',
    });

    decoder = new VideoDecoder({
      output: (decodedFrame) => {
        try {
          decodedFramesCount++;
          lastActivityAt = Date.now();

          if (fatalError || options.signal?.aborted || !encoder || encoder.state === 'closed') {
            return;
          }

          const rawTs = Math.max(0, Math.round(decodedFrame.timestamp));
          if (shouldDecimateFps && encodedFramesCount > 0 && rawTs < nextAllowedTsUs) {
            return;
          }
          if (shouldDecimateFps) {
            nextAllowedTsUs = rawTs + targetStepUs;
          }

          const tsUs =
            encodedFramesCount > 0 && rawTs <= lastEncodedTsUs
              ? lastEncodedTsUs + Math.max(1000, Math.round(1_000_000 / effectiveFps))
              : rawTs;
          const durUs =
            decodedFrame.duration && decodedFrame.duration > 0
              ? Math.round(decodedFrame.duration)
              : Math.round(1_000_000 / effectiveFps);

          const frameFmt = String((decodedFrame as any).format || '').toUpperCase();
          const isHighBitFrame =
            isSourceHighBitDepth ||
            frameFmt.includes('P10') ||
            frameFmt.includes('P12') ||
            frameFmt.includes('10') ||
            frameFmt.includes('12');

          // H.264 (avc1) hardware encoders widely reject 10-bit/12-bit AV1 pixel formats (I420P10/P010);
          // drawing onto an 8-bit 2D canvas normalizes to SDR 8-bit seamlessly.
          const needsCanvas =
            decodedFrame.displayWidth !== width ||
            decodedFrame.displayHeight !== height ||
            options.webgpuFilter === 'grayscale' ||
            (encoderProfile.muxerVideoCodec === 'avc' && isHighBitFrame);

          const keyFrame = encodedFramesCount % keyInterval === 0;

          if (!needsCanvas && tsUs === rawTs) {
            encoder.encode(decodedFrame, { keyFrame });
          } else if (!needsCanvas) {
            const retimed = new VideoFrame(decodedFrame, {
              timestamp: tsUs,
              duration: durUs,
            });
            try {
              encoder.encode(retimed, { keyFrame });
            } finally {
              retimed.close();
            }
          } else {
            if (!canvas || !ctx) {
              canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              ctx = canvas.getContext('2d', { alpha: false });
              if (!ctx) {
                fatalError = new Error('Failed to initialize 2D scaling context.');
                return;
              }
              if (options.webgpuFilter === 'grayscale') {
                ctx.filter = 'grayscale(100%)';
              }
            }
            ctx.drawImage(decodedFrame, 0, 0, width, height);
            const scaledFrame = new VideoFrame(canvas, {
              timestamp: tsUs,
              duration: durUs,
            });
            try {
              encoder.encode(scaledFrame, { keyFrame });
            } finally {
              scaledFrame.close();
            }
          }

          lastEncodedTsUs = tsUs;
          encodedFramesCount++;

          const now = Date.now();
          if (options.onProgress && now - lastProgressAt >= 100) {
            lastProgressAt = now;
            const elapsed = (now - startTime) / 1000;
            const currentFps = elapsed > 0 ? Math.round(encodedFramesCount / elapsed) : 0;
            const currentSec = Math.min(duration, tsUs / 1_000_000);
            const percent = Math.max(1, Math.min(99.5, (currentSec / duration) * 100));
            options.onProgress({
              percent,
              currentTime: currentSec,
              duration,
              fps: currentFps,
            });
          }
        } catch (frameErr) {
          fatalError = frameErr instanceof Error ? frameErr : new Error(String(frameErr));
        } finally {
          decodedFrame.close();
        }
      },
      error: (err) => {
        fatalError = err instanceof Error ? err : new Error(String(err));
      },
    });

    decoder.configure(decoderConfig);

    // Emit immediate 1% tick so UI leaves 0% while feeding first GOP
    if (options.onProgress) {
      options.onProgress({
        percent: 1,
        currentTime: 0,
        duration,
        fps: 0,
      });
    }

    lastActivityAt = Date.now();
    let chunksFed = 0;

    // Stream samples sequentially with bounded queue backpressure + stall watchdog
    for (let i = 0; i < track.samples.length; i++) {
      if (options.signal?.aborted) {
        throw new Error('Hardware compression cancelled by user.');
      }
      if (fatalError) {
        throw fatalError;
      }

      while (
        (decoder.decodeQueueSize > 8 || encoder.encodeQueueSize > 6) &&
        !fatalError &&
        !options.signal?.aborted
      ) {
        const idleMs = Date.now() - lastActivityAt;
        if (decodedFramesCount === 0 && chunksFed > 0 && idleMs > 4500) {
          throw new Error(
            `VideoDecoder (${decoderConfig.hardwareAcceleration || 'default'}) stalled with 0 output frames.`
          );
        }
        if (idleMs > 15000) {
          throw new Error('WebCodecs decode/encode pipeline stalled.');
        }
        await sleepMs(4);
      }

      if (options.signal?.aborted) {
        throw new Error('Hardware compression cancelled by user.');
      }
      if (fatalError) {
        throw fatalError;
      }

      const sample = track.samples[i];
      if (sample.size <= 0) continue;

      const bytes = await reader.read(sample.offset, sample.size);
      if (bytes.byteLength === 0) continue;

      const chunk = new EncodedVideoChunk({
        type: sample.type,
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: bytes,
      });
      decoder.decode(chunk);
      chunksFed++;
    }

    if (options.signal?.aborted) {
      throw new Error('Hardware compression cancelled by user.');
    }
    if (fatalError) {
      throw fatalError;
    }

    // Flush decoder with stall watchdog so short clips cannot deadlock if GPU driver hangs on flush()
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setInterval(() => {
        if (settled) return;
        if (options.signal?.aborted) {
          settled = true;
          clearInterval(timer);
          reject(new Error('Hardware compression cancelled by user.'));
          return;
        }
        if (fatalError) {
          settled = true;
          clearInterval(timer);
          reject(fatalError);
          return;
        }
        const idleMs = Date.now() - lastActivityAt;
        if ((decodedFramesCount === 0 && idleMs > 4500) || idleMs > 15000) {
          settled = true;
          clearInterval(timer);
          reject(new Error('VideoDecoder flush timed out without output frames.'));
        }
      }, 150);

      decoder!
        .flush()
        .then(() => {
          if (!settled) {
            settled = true;
            clearInterval(timer);
            resolve();
          }
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            clearInterval(timer);
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
    });

    if (fatalError) {
      throw fatalError;
    }

    await encoder.flush();
    if (fatalError) {
      throw fatalError;
    }

    if (encodedFramesCount === 0) {
      cleanup();
      return { result: null, encodedFramesCount: 0 };
    }

    muxer.finalize();
    let finalBlob = pagedWriter.toBlob('video/mp4');
    if (options.fastStart) {
      try {
        const fastResult = await relocateMoovToFrontZeroCopy(finalBlob);
        finalBlob = fastResult.blob;
      } catch {
        // Keep non-faststart MP4 if relocation was unnecessary
      }
    }

    cleanup();
    return {
      encodedFramesCount,
      result: {
        blob: finalBlob,
        codecUsed: encoderProfile.selectedCodec,
        isHevc: encoderProfile.isHevc,
        isAv1: encoderProfile.isAv1,
        isHardware: encoderProfile.isHardware,
        width,
        height,
        bitrateBps: bitrate,
        decodeMode: 'webcodecs-sequential',
      },
    };
  } catch (err) {
    cleanup();
    if (options.signal?.aborted) {
      throw err instanceof Error ? err : new Error('Hardware compression cancelled by user.');
    }
    if (encodedFramesCount === 0) {
      return { result: null, encodedFramesCount: 0 };
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Fast-path zero-seek sequential WebCodecs pipeline:
 * MP4 Demuxer -> EncodedVideoChunk -> VideoDecoder -> VideoFrame -> VideoEncoder -> MP4 Muxer.
 * Automatically retries hardware -> software (`no-preference` / dav1d) decoder and encoder configs
 * on 0-frame stalls or driver errors.
 */
async function transcodeViaWebCodecsVideoDecoder(
  videoBlob: Blob,
  options: HardwareTranscodeOptions
): Promise<HardwareEncodeResult | null> {
  if (
    typeof VideoDecoder === 'undefined' ||
    typeof EncodedVideoChunk === 'undefined' ||
    typeof VideoEncoder === 'undefined'
  ) {
    return null;
  }

  const track = await demuxMp4VideoTrack(videoBlob);
  if (!track || track.samples.length === 0 || !track.codedWidth || !track.codedHeight) {
    return null;
  }

  const wantHw = options.preferHardware !== false;
  const rawCandidates = buildDecoderCandidateConfigs(track, wantHw);

  const supportedDecoderConfigs: VideoDecoderConfig[] = [];
  if (typeof VideoDecoder.isConfigSupported === 'function') {
    for (const cfg of rawCandidates) {
      try {
        const res = await VideoDecoder.isConfigSupported(cfg);
        if (res.supported) {
          supportedDecoderConfigs.push(cfg);
        }
      } catch {}
    }
  } else {
    supportedDecoderConfigs.push(...rawCandidates);
  }

  if (supportedDecoderConfigs.length === 0) {
    return null;
  }

  const { width, height } = resolveEncodeDimensions(track.codedWidth, track.codedHeight, options);
  const effectiveFps =
    options.preserveSourceFramerate || !options.framerate
      ? Math.min(60, Math.max(15, Math.round(track.fps || 30)))
      : Math.min(60, Math.max(15, options.framerate));
  const bitrate = Math.min(
    35_000_000,
    Math.max(180_000, options.bitrate || Math.round(width * height * effectiveFps * 0.06))
  );

  // Throws explicitly if target encoder (e.g. av01) is unsupported in this browser
  const primaryEncoderProfile = await selectVideoEncoderProfile(
    width,
    height,
    bitrate,
    effectiveFps,
    options
  );

  // 1. Try each supported decoder config (prefer-hardware first, then no-preference dav1d)
  for (const decCfg of supportedDecoderConfigs.slice(0, 4)) {
    const attempt = await runSequentialDecodeAttempt(
      videoBlob,
      track,
      decCfg,
      primaryEncoderProfile,
      width,
      height,
      bitrate,
      effectiveFps,
      options
    );
    if (attempt.result) {
      return attempt.result;
    }
  }

  // 2. If HW encoder failed/stalled with 0 frames, retry software/default encoder ('no-preference')
  if (primaryEncoderProfile.selectedAccel === 'prefer-hardware') {
    try {
      const swEncoderProfile = await selectVideoEncoderProfile(
        width,
        height,
        bitrate,
        effectiveFps,
        { ...options, preferHardware: false }
      );
      if (swEncoderProfile.selectedAccel !== primaryEncoderProfile.selectedAccel) {
        const bestDecCfg =
          supportedDecoderConfigs.find((c) => c.hardwareAcceleration === 'no-preference') ||
          supportedDecoderConfigs[0];
        const swAttempt = await runSequentialDecodeAttempt(
          videoBlob,
          track,
          bestDecCfg,
          swEncoderProfile,
          width,
          height,
          bitrate,
          effectiveFps,
          options
        );
        if (swAttempt.result) {
          return swAttempt.result;
        }
      }
    } catch {
      // Allow <video> element fallback below
    }
  }

  return null;
}

async function transcodeViaVideoElementCapture(
  videoBlob: Blob,
  options: HardwareTranscodeOptions
): Promise<HardwareEncodeResult> {
  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    let activeEncoder: VideoEncoder | null = null;
    let settled = false;
    let startedCapture = false;

    const cleanup = () => {
      try {
        if (activeEncoder && activeEncoder.state !== 'closed') {
          activeEncoder.close();
        }
      } catch {}
      activeEncoder = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(videoUrl);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    video.onerror = () => {
      fail(new Error('Failed to decode source video via browser media element.'));
    };

    const waitForFirstFrameReady = async (): Promise<void> => {
      if (video.readyState >= 2) return;
      await new Promise<void>((res, rej) => {
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          if (ok) res();
          else rej(new Error('Timed out waiting for browser decoder first video frame.'));
        };
        const onReady = () => finish(true);
        const timer = setTimeout(() => {
          finish(video.readyState >= 2);
        }, 6000);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('canplay', onReady);
      });
    };

    const beginCapture = async () => {
      if (startedCapture || settled) return;
      startedCapture = true;

      try {
        await waitForFirstFrameReady();
        if (settled) return;

        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        if (!sourceWidth || !sourceHeight) {
          throw new Error('Source video has invalid dimensions for hardware encoding.');
        }

        const { width, height } = resolveEncodeDimensions(sourceWidth, sourceHeight, options);
        const framerate = Math.min(60, Math.max(15, options.framerate || 30));
        const bitrate = Math.min(
          35_000_000,
          Math.max(180_000, options.bitrate || Math.round(width * height * framerate * 0.06))
        );

        const encoderProfile = await selectVideoEncoderProfile(
          width,
          height,
          bitrate,
          framerate,
          options
        );

        // Paged 4 MB StreamTarget keeps peak RAM low on Snapdragon/MediaTek phones
        const pagedWriter = new PagedBlobWriter();
        const muxer = new Muxer({
          target: new StreamTarget({
            onData: (data, position) => {
              pagedWriter.write(data, position);
            },
            chunked: true,
            chunkSize: 4 * 1024 * 1024,
          }),
          video: {
            codec: encoderProfile.muxerVideoCodec,
            width,
            height,
            frameRate: framerate,
          },
          fastStart: false,
        });

        let encodedFramesCount = 0;
        let encoderFailed = false;

        const encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: (err) => {
            console.error('WebCodecs VideoEncoder error:', err);
            encoderFailed = true;
            fail(err instanceof Error ? err : new Error(String(err)));
          },
        });
        activeEncoder = encoder;

        encoder.configure({
          codec: encoderProfile.selectedCodec,
          width,
          height,
          bitrate,
          framerate,
          bitrateMode: 'variable',
          hardwareAcceleration: encoderProfile.selectedAccel,
          latencyMode: 'quality',
        });

        let useCanvasFallback =
          width !== sourceWidth || height !== sourceHeight || options.webgpuFilter === 'grayscale';

        let canvas: HTMLCanvasElement | null = null;
        let ctx: CanvasRenderingContext2D | null = null;

        const ensureCanvas = () => {
          if (canvas && ctx) return;
          canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
            throw new Error('Failed to initialize 2D rendering context for frame scaling.');
          }
          if (options.webgpuFilter === 'grayscale') {
            ctx.filter = 'grayscale(100%)';
          }
        };

        if (useCanvasFallback) {
          ensureCanvas();
        }

        const totalSteps = Math.max(1, Math.ceil(duration * framerate));
        const timeInterval = 1 / framerate;

        let frameIndex = 0;
        const startTime = Date.now();
        let lastProgressAt = 0;

        if (options.onProgress) {
          options.onProgress({
            percent: 1,
            currentTime: 0,
            duration,
            fps: 0,
          });
        }

        const finalizeEncode = async () => {
          if (settled || encoderFailed) return;
          await encoder.flush();
          muxer.finalize();

          let finalBlob = pagedWriter.toBlob('video/mp4');
          if (options.fastStart) {
            try {
              const fastResult = await relocateMoovToFrontZeroCopy(finalBlob);
              finalBlob = fastResult.blob;
            } catch {
              // Keep non-faststart MP4 if relocation was unnecessary
            }
          }

          if (!settled) {
            settled = true;
            cleanup();
            resolve({
              blob: finalBlob,
              codecUsed: encoderProfile.selectedCodec,
              isHevc: encoderProfile.isHevc,
              isAv1: encoderProfile.isAv1,
              isHardware: encoderProfile.isHardware,
              width,
              height,
              bitrateBps: bitrate,
              decodeMode: 'video-element',
            });
          }
        };

        const stepThrough = async () => {
          try {
            if (settled || encoderFailed) return;

            if (options.signal?.aborted) {
              fail(new Error('Hardware compression cancelled by user.'));
              return;
            }

            if (encoder.encodeQueueSize > 6) {
              setTimeout(() => {
                void stepThrough();
              }, 4);
              return;
            }

            const targetTime = frameIndex * timeInterval;
            if (targetTime >= duration || frameIndex >= totalSteps) {
              await finalizeEncode();
              return;
            }

            // Frame 0 is already decoded at t≈0 once readyState >= 2; avoid stalling on a no-op seek to 0
            const needSeek = !(
              frameIndex === 0 &&
              video.readyState >= 2 &&
              Math.abs(video.currentTime) < 0.05
            );

            if (needSeek) {
              const seekOk = await new Promise<boolean>((r) => {
                let done = false;
                const timer = setTimeout(() => {
                  if (!done) {
                    done = true;
                    video.removeEventListener('seeked', onSeeked);
                    r(false);
                  }
                }, 3000);
                const onSeeked = () => {
                  if (!done) {
                    done = true;
                    clearTimeout(timer);
                    video.removeEventListener('seeked', onSeeked);
                    r(true);
                  }
                };
                video.addEventListener('seeked', onSeeked);
                video.currentTime = Math.min(targetTime, Math.max(0, duration - 0.001));
              });

              if (!seekOk) {
                if (encodedFramesCount > 0) {
                  await finalizeEncode();
                  return;
                }
                fail(new Error('Hardware decoder could not seek source video container.'));
                return;
              }
            }

            if (settled || encoderFailed || options.signal?.aborted) {
              if (options.signal?.aborted) fail(new Error('Hardware compression cancelled by user.'));
              return;
            }

            const timestampMicros = Math.round(targetTime * 1_000_000);
            const durationMicros = Math.round(timeInterval * 1_000_000);
            let frame: VideoFrame;

            if (!useCanvasFallback) {
              try {
                frame = new VideoFrame(video, {
                  timestamp: timestampMicros,
                  duration: durationMicros,
                });
              } catch {
                // Fallback to 8-bit canvas capture if direct VideoFrame(video) fails
                useCanvasFallback = true;
                ensureCanvas();
                ctx!.drawImage(video, 0, 0, width, height);
                frame = new VideoFrame(canvas!, {
                  timestamp: timestampMicros,
                  duration: durationMicros,
                });
              }
            } else {
              ensureCanvas();
              ctx!.drawImage(video, 0, 0, width, height);
              frame = new VideoFrame(canvas!, {
                timestamp: timestampMicros,
                duration: durationMicros,
              });
            }

            const keyFrame = frameIndex % Math.max(1, Math.round(framerate * 2)) === 0;
            try {
              encoder.encode(frame, { keyFrame });
            } finally {
              frame.close();
            }

            encodedFramesCount++;
            frameIndex++;

            const now = Date.now();
            if (options.onProgress && now - lastProgressAt >= 100) {
              lastProgressAt = now;
              const elapsed = (now - startTime) / 1000;
              const currentFps = elapsed > 0 ? Math.round(encodedFramesCount / elapsed) : 0;
              const percent = Math.max(1, Math.min(99.5, (targetTime / duration) * 100));
              options.onProgress({
                percent,
                currentTime: targetTime,
                duration,
                fps: currentFps,
              });
            }

            setTimeout(() => {
              void stepThrough();
            }, 0);
          } catch (stepErr: any) {
            fail(stepErr instanceof Error ? stepErr : new Error(String(stepErr)));
          }
        };

        void stepThrough();
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    video.onloadeddata = () => {
      void beginCapture();
    };
    video.onloadedmetadata = () => {
      void beginCapture();
    };
  });
}

/**
 * Compresses/transcodes a video blob using WebCodecs VideoEncoder (AV1 av01 / HEVC / H.264).
 * Prefers zero-seek sequential MP4 demuxing + VideoDecoder (essential for fast AV1 decoding),
 * and automatically falls back to `<video>` frame capture with automatic software-encoder retry.
 */
export async function transcodeWithHardwareWebCodecs(
  videoBlob: Blob,
  options: HardwareTranscodeOptions
): Promise<HardwareEncodeResult> {
  // 1. Try zero-seek sequential VideoDecoder pipeline first (10x-40x faster on AV1/HEVC/H.264 MP4/MOV)
  const sequentialResult = await transcodeViaWebCodecsVideoDecoder(videoBlob, options);
  if (sequentialResult) {
    return sequentialResult;
  }

  // 2. Fallback: HTMLVideoElement frame-capture pipeline for non-ISO-BMFF or unusual containers
  try {
    return await transcodeViaVideoElementCapture(videoBlob, options);
  } catch (err) {
    if (options.signal?.aborted) {
      throw err;
    }
    if (options.preferHardware !== false) {
      return await transcodeViaVideoElementCapture(videoBlob, {
        ...options,
        preferHardware: false,
      });
    }
    throw err;
  }
}
