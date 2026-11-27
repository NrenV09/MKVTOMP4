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
import {
  demuxMp4VideoTrack,
  createSampleSliceReader,
  sampleHasAv1SequenceHeaderObu,
} from './mp4Demuxer';

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
 * Seals completed pages (> 4 pages behind tail, except page 0 needed for mdat size patch)
 * into immutable Blobs so multi-hour / multi-GB 8-hour exports use <= 20 MB of JS heap RAM.
 */
class PagedBlobWriter {
  private readonly pageSize = 4 * 1024 * 1024;
  private readonly keepTailPages = 4;
  private pages: (Uint8Array | null)[] = [];
  private sealedBlobs: (Blob | null)[] = [];
  private maxPageIdx = 0;
  private totalSize = 0;

  private ensurePage(pageIdx: number): { u8: Uint8Array | null; sealed: Blob | null } {
    if (pageIdx > this.maxPageIdx) {
      this.maxPageIdx = pageIdx;
    }
    while (this.pages.length <= pageIdx) {
      this.pages.push(null);
      this.sealedBlobs.push(null);
    }

    // Seal older middle pages into Blobs to keep RAM bounded on 8-hour videos
    const sealCutoff = this.maxPageIdx - this.keepTailPages;
    for (let i = 1; i < sealCutoff; i++) {
      const p = this.pages[i];
      if (p) {
        this.sealedBlobs[i] = new Blob([p as Uint8Array<ArrayBuffer>]);
        this.pages[i] = null;
      }
    }

    if (this.sealedBlobs[pageIdx]) {
      return { u8: null, sealed: this.sealedBlobs[pageIdx] };
    }
    if (!this.pages[pageIdx]) {
      this.pages[pageIdx] = new Uint8Array(this.pageSize);
    }
    return { u8: this.pages[pageIdx], sealed: null };
  }

  write(data: Uint8Array, position: number): void {
    let remaining = data.byteLength;
    let srcOffset = 0;
    let dstPos = position;

    while (remaining > 0) {
      const pageIdx = Math.floor(dstPos / this.pageSize);
      const pageOffset = dstPos % this.pageSize;
      const chunkLen = Math.min(remaining, this.pageSize - pageOffset);
      const slice = data.subarray(srcOffset, srcOffset + chunkLen);

      const slot = this.ensurePage(pageIdx);
      if (slot.u8) {
        slot.u8.set(slice, pageOffset);
      } else if (slot.sealed) {
        // Rare random-access patch to a sealed page: splice synchronously with Blob.slice
        const copy = new Uint8Array(slice);
        this.sealedBlobs[pageIdx] = new Blob([
          slot.sealed.slice(0, pageOffset),
          copy,
          slot.sealed.slice(pageOffset + chunkLen),
        ]);
      }

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
    const count = Math.max(this.pages.length, this.sealedBlobs.length);
    for (let i = 0; i < count && left > 0; i++) {
      const len = Math.min(left, this.pageSize);
      const sealed = this.sealedBlobs[i];
      const page = this.pages[i];
      if (sealed) {
        parts.push(len === this.pageSize ? sealed : sealed.slice(0, len));
      } else if (page) {
        parts.push((len === this.pageSize ? page : page.subarray(0, len)) as Uint8Array<ArrayBuffer>);
      } else {
        parts.push(new Uint8Array(len));
      }
      left -= len;
    }
    const blob = new Blob(parts, { type: mimeType });
    // Release references to page buffers as soon as Blob wraps them
    this.pages = [];
    this.sealedBlobs = [];
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
    for (const hevcProfile of [
      'hvc1.1.6.L120.B0',
      'hvc1.1.6.L120.90',
      'hvc1.1.6.L93.B0',
      'hev1.1.6.L120.B0',
      'hev1.1.6.L120.90',
    ]) {
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
  onStatus?: (status: string) => void;
  onLog?: (message: string) => void;
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

interface EncoderExtraOptions {
  bitrateMode?: BitrateMode;
  latencyMode?: LatencyMode;
  avc?: { format: 'avc' | 'annexb' };
  hevc?: { format: 'hevc' | 'annexb' };
}

async function selectVideoEncoderProfile(
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
  options: HardwareTranscodeOptions,
  probeOpts: { preferDefaultLatency?: boolean } = {}
): Promise<{
  selectedCodec: string;
  selectedAccel: HardwareAcceleration;
  isHardware: boolean;
  isAv1: boolean;
  isHevc: boolean;
  muxerVideoCodec: 'av1' | 'hevc' | 'avc';
  encoderConfigExtras: EncoderExtraOptions;
}> {
  const pixels = width * height;
  const isAbove1080p = pixels > 1920 * 1080;
  const isHighFrameOrRes = isAbove1080p || (pixels >= 1920 * 1080 && framerate > 32);

  const av1Candidates =
    pixels >= 2560 * 1440
      ? ['av01.0.12M.08', 'av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08']
      : ['av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08'];

  // Full HEVC Main profile matrix covering 480p -> 4K60 across Safari VideoToolbox, Chrome, and MediaCodec
  const hevcCandidates = isHighFrameOrRes
    ? [
        'hvc1.1.6.L153.B0',
        'hvc1.1.6.L150.B0',
        'hvc1.1.6.L150.90',
        'hvc1.1.6.L123.B0',
        'hvc1.1.6.L120.B0',
        'hvc1.1.6.L120.90',
        'hev1.1.6.L150.B0',
        'hev1.1.6.L120.B0',
        'hev1.1.6.L120.90',
      ]
    : [
        'hvc1.1.6.L120.B0',
        'hvc1.1.6.L120.90',
        'hvc1.1.6.L93.B0',
        'hvc1.1.6.L150.B0',
        'hev1.1.6.L120.B0',
        'hev1.1.6.L120.90',
      ];

  // Prefer Level 4.2 High / Main / Baseline for <=1080p for broad mobile MediaCodec & desktop compatibility
  const h264Candidates = isAbove1080p
    ? ['avc1.640033', 'avc1.64002a', 'avc1.4d0029', 'avc1.42001f']
    : ['avc1.64002a', 'avc1.4d002a', 'avc1.4d0029', 'avc1.42001f', 'avc1.640033'];

  const wantHw = options.preferHardware !== false;
  let selectedCodec: string | null = null;
  let selectedAccel: HardwareAcceleration = wantHw ? 'prefer-hardware' : 'no-preference';
  let isHardware = wantHw;
  let encoderConfigExtras: EncoderExtraOptions = {};

  const buildExtrasForCodec = (candidate: string): EncoderExtraOptions[] => {
    const isH264 = candidate.startsWith('avc1');
    const isH265 = candidate.startsWith('hvc1') || candidate.startsWith('hev1');
    const formatExtra: EncoderExtraOptions = isH264
      ? { avc: { format: 'avc' } }
      : isH265
      ? { hevc: { format: 'hevc' } }
      : {};

    if (probeOpts.preferDefaultLatency) {
      return [
        { ...formatExtra, bitrateMode: 'variable' },
        { ...formatExtra },
        { bitrateMode: 'variable' },
        {},
      ];
    }

    // Prefer 'realtime' latencyMode so Apple VideoToolbox / mobile hardware encoders
    // avoid deep lookahead stalls, while explicitly requesting AVCC/HVCC format for mp4-muxer.
    return [
      { ...formatExtra, bitrateMode: 'variable', latencyMode: 'realtime' },
      { ...formatExtra, bitrateMode: 'variable' },
      { bitrateMode: 'variable', latencyMode: 'realtime' },
      { bitrateMode: 'variable' },
      { ...formatExtra },
      {},
    ];
  };

  const probeCandidates = async (
    candidates: string[],
    accel: HardwareAcceleration
  ): Promise<{ codec: string; extras: EncoderExtraOptions } | null> => {
    if (typeof VideoEncoder.isConfigSupported !== 'function') {
      return candidates[0] ? { codec: candidates[0], extras: {} } : null;
    }
    for (const candidate of candidates) {
      const variants = buildExtrasForCodec(candidate);
      for (const extras of variants) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec: candidate,
            width,
            height,
            bitrate,
            framerate,
            hardwareAcceleration: accel,
            ...(extras as any),
          });
          if (support.supported) {
            return { codec: candidate, extras };
          }
        } catch {}
      }
    }
    return null;
  };

  const tryAccelList = async (candidates: string[]) => {
    if (wantHw) {
      const hwRes = await probeCandidates(candidates, 'prefer-hardware');
      if (hwRes) {
        selectedCodec = hwRes.codec;
        encoderConfigExtras = hwRes.extras;
        selectedAccel = 'prefer-hardware';
        isHardware = true;
        return true;
      }
    }
    const swRes = await probeCandidates(candidates, 'no-preference');
    if (swRes) {
      selectedCodec = swRes.codec;
      encoderConfigExtras = swRes.extras;
      selectedAccel = 'no-preference';
      isHardware = false;
      return true;
    }
    return false;
  };

  if (options.codec) {
    await tryAccelList([options.codec]);
  } else if (options.preferredCodec === 'av01') {
    await tryAccelList(av1Candidates);
  } else if (options.preferredCodec === 'hevc') {
    // Always exhaust HEVC hardware AND default/software profiles before falling back to H.264
    const gotHevc = await tryAccelList(hevcCandidates);
    if (!gotHevc) {
      options.onLog?.(
        'Browser WebCodecs does not expose an HEVC (hvc1) encoder profile; falling back to H.264 (avc1).'
      );
      await tryAccelList(h264Candidates);
    }
  } else {
    await tryAccelList(h264Candidates);
  }

  if (!selectedCodec) {
    throw new Error(
      options.preferredCodec === 'av01'
        ? 'This browser does not support WebCodecs AV1 (av01) encoding.'
        : 'No supported WebCodecs VideoEncoder profile found for target resolution/codec.'
    );
  }

  const finalCodec: string = selectedCodec;
  const isAv1 = finalCodec.startsWith('av01');
  const isHevc = finalCodec.startsWith('hvc1') || finalCodec.startsWith('hev1');
  const muxerVideoCodec: 'av1' | 'hevc' | 'avc' = isAv1 ? 'av1' : isHevc ? 'hevc' : 'avc';

  return {
    selectedCodec: finalCodec,
    selectedAccel,
    isHardware,
    isAv1,
    isHevc,
    muxerVideoCodec,
    encoderConfigExtras,
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
    // Per W3C WebCodecs AV1 Registration, `description` is omitted for AV1 (Sequence Header OBU
    // is carried in-band in keyframe 0, and we auto-inject av1C configOBUs if missing from sample 0).
    // Always try in-band (no description) FIRST across prefer-hardware & no-preference (dav1d),
    // and only try with `description: av1C` as a secondary fallback.
    for (const accel of accels) {
      raw.push({
        codec: track.codec,
        codedWidth: track.codedWidth,
        codedHeight: track.codedHeight,
        hardwareAcceleration: accel,
      });
    }
    if (track.description) {
      for (const accel of accels) {
        raw.push({
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          description: track.description,
          hardwareAcceleration: accel,
        });
      }
    }
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

interface SequentialAttemptResult {
  result: HardwareEncodeResult | null;
  decodedFramesCount: number;
  encodedFramesCount: number;
  encodedChunksOutputCount: number;
  encoderStalled: boolean;
  failureReason?: string;
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
  options: HardwareTranscodeOptions,
  attemptOpts: { forceCanvas?: boolean; prependAv1ConfigObus?: boolean } = {}
): Promise<SequentialAttemptResult> {
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
    firstTimestampBehavior: 'offset',
  });

  // 4 MB sequential read-ahead buffer minimizes Blob slice IPC on large MP4s
  const reader = createSampleSliceReader(videoBlob, 4 * 1024 * 1024);
  let encoder: VideoEncoder | null = null;
  let decoder: VideoDecoder | null = null;
  let fatalError: Error | null = null;
  let encodedFramesCount = 0;
  let decodedFramesCount = 0;
  let encodedChunksOutputCount = 0;
  let baseDecodedTsUs = -1;
  let lastEncodedTsUs = -1;
  let lastActivityAt = Date.now();
  let firstChunkFedAt = 0;
  let firstFrameEncodedAt = 0;
  let autoCanvasFallback = Boolean(attemptOpts.forceCanvas);

  const shouldDecimateFps =
    !options.preserveSourceFramerate &&
    Boolean(options.framerate && track.fps > 0 && options.framerate < track.fps * 0.96);
  const targetStepUs =
    shouldDecimateFps && options.framerate ? Math.round(1_000_000 / options.framerate) : 0;
  let nextAllowedTsUs = 0;

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;

  const ensureCanvas = () => {
    if (canvas && ctx) return;
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to initialize 2D scaling context.');
    }
    if (options.webgpuFilter === 'grayscale') {
      ctx.filter = 'grayscale(100%)';
    }
  };

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

  const frameStepUs = Math.max(1000, Math.round(1_000_000 / effectiveFps));
  const submittedDtsUs: number[] = [];
  let lastRawDecodedTsUs = -1;
  let decodedWrapOffsetUs = 0;
  let lastMuxedDtsUs = -1;
  let muxWrapOffsetUs = 0;

  // Generous queue depth keeps AV1 (dav1d/VideoToolbox) + B-frame H.264/HEVC pipelines 100% saturated
  // without starving frame reordering or encoder lookahead.
  const DECODE_QUEUE_MAX = 24;
  const ENCODE_QUEUE_MAX = 16;

  try {
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          lastActivityAt = Date.now();
          const expectedDtsUs =
            submittedDtsUs.length > 0
              ? submittedDtsUs.shift()!
              : lastMuxedDtsUs >= 0
              ? lastMuxedDtsUs + frameStepUs
              : 0;

          let rawPtsUs = Number.isFinite(chunk.timestamp) ? Math.round(chunk.timestamp) : expectedDtsUs;
          if (lastMuxedDtsUs >= 0 && rawPtsUs + muxWrapOffsetUs < lastMuxedDtsUs - 2_000_000_000) {
            muxWrapOffsetUs += 4_294_967_296;
          }
          let ptsUs = Math.max(0, rawPtsUs + muxWrapOffsetUs);

          // If hardware encoder clamped/reset chunk.timestamp far away from expected DTS, trust expectedDtsUs
          if (Math.abs(ptsUs - expectedDtsUs) > 5_000_000) {
            ptsUs = expectedDtsUs;
          }

          const safeDtsUs =
            lastMuxedDtsUs >= 0
              ? Math.max(lastMuxedDtsUs + frameStepUs, expectedDtsUs)
              : Math.max(0, expectedDtsUs);
          const safePtsUs = Math.max(safeDtsUs, ptsUs);
          const ctoUs = safePtsUs - safeDtsUs;

          lastMuxedDtsUs = safeDtsUs;
          muxer.addVideoChunk(chunk, meta, safePtsUs, ctoUs);
          encodedChunksOutputCount++;
        } catch (outErr) {
          fatalError = outErr instanceof Error ? outErr : new Error(String(outErr));
        }
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
      hardwareAcceleration: encoderProfile.selectedAccel,
      ...(encoderProfile.encoderConfigExtras as any),
    });

    decoder = new VideoDecoder({
      output: (decodedFrame) => {
        try {
          decodedFramesCount++;
          lastActivityAt = Date.now();

          if (fatalError || options.signal?.aborted || !encoder || encoder.state === 'closed') {
            return;
          }

          let rawTs = Math.max(0, Math.round(decodedFrame.timestamp));
          if (lastRawDecodedTsUs >= 0 && rawTs + decodedWrapOffsetUs < lastRawDecodedTsUs - 2_000_000_000) {
            decodedWrapOffsetUs += 4_294_967_296;
          }
          rawTs += decodedWrapOffsetUs;
          lastRawDecodedTsUs = rawTs;

          // Normalize first decoded frame to t = 0 so mp4-muxer & players always start cleanly at 0
          if (baseDecodedTsUs < 0) {
            baseDecodedTsUs = rawTs;
          }
          const relTs = Math.max(0, rawTs - baseDecodedTsUs);

          if (shouldDecimateFps && encodedFramesCount > 0 && relTs < nextAllowedTsUs) {
            return;
          }
          if (shouldDecimateFps) {
            nextAllowedTsUs = relTs + targetStepUs;
          }

          const tsUs =
            encodedFramesCount > 0 && relTs <= lastEncodedTsUs
              ? lastEncodedTsUs + frameStepUs
              : relTs;
          const durUs =
            decodedFrame.duration && decodedFrame.duration > 0
              ? Math.round(decodedFrame.duration)
              : frameStepUs;

          const frameFmt = String((decodedFrame as any).format || '').toUpperCase();
          const isHighBitFrame =
            isSourceHighBitDepth ||
            frameFmt.includes('P10') ||
            frameFmt.includes('P12') ||
            frameFmt.includes('10') ||
            frameFmt.includes('12');

          const needsCanvas =
            autoCanvasFallback ||
            decodedFrame.displayWidth !== width ||
            decodedFrame.displayHeight !== height ||
            options.webgpuFilter === 'grayscale' ||
            (encoderProfile.muxerVideoCodec === 'avc' && isHighBitFrame);

          const keyFrame = encodedFramesCount % keyInterval === 0;

          if (firstFrameEncodedAt === 0) {
            firstFrameEncodedAt = Date.now();
          }

          const encodeViaCanvas = () => {
            ensureCanvas();
            ctx!.drawImage(decodedFrame, 0, 0, width, height);
            const scaledFrame = new VideoFrame(canvas!, {
              timestamp: tsUs,
              duration: durUs,
            });
            try {
              submittedDtsUs.push(tsUs);
              encoder!.encode(scaledFrame, { keyFrame });
            } finally {
              scaledFrame.close();
            }
          };

          if (!needsCanvas && tsUs === Math.round(decodedFrame.timestamp)) {
            submittedDtsUs.push(tsUs);
            encoder.encode(decodedFrame, { keyFrame });
          } else if (!needsCanvas) {
            try {
              const retimed = new VideoFrame(decodedFrame, {
                timestamp: tsUs,
                duration: durUs,
              });
              try {
                submittedDtsUs.push(tsUs);
                encoder.encode(retimed, { keyFrame });
              } finally {
                retimed.close();
              }
            } catch {
              // Safari WebKit IOSurface VideoFrame cloning fallback
              autoCanvasFallback = true;
              encodeViaCanvas();
            }
          } else {
            encodeViaCanvas();
          }

          lastEncodedTsUs = tsUs;
          encodedFramesCount++;

          const now = Date.now();
          if (options.onProgress && (encodedFramesCount === 1 || now - lastProgressAt >= 150)) {
            lastProgressAt = now;
            const elapsed = (now - startTime) / 1000;
            const currentFps = elapsed > 0 ? Math.round(encodedFramesCount / elapsed) : 0;
            const currentSec = Math.min(duration, tsUs / 1_000_000);
            const percent = Math.max(0.1, Math.min(99.5, (currentSec / duration) * 100));
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

    lastActivityAt = Date.now();
    let lastYieldAt = Date.now();
    let chunksFed = 0;

    const av1ConfigObus =
      track.fourcc === 'av01' && track.description && track.description.byteLength > 4
        ? track.description.subarray(4)
        : null;
    let shouldInjectAv1Obus = Boolean(attemptOpts.prependAv1ConfigObus);

    // Unconditional stall watchdog — works regardless of queue backpressure state
    const checkWatchdog = () => {
      const now = Date.now();
      const idleMs = now - lastActivityAt;
      if (decodedFramesCount === 0 && chunksFed > 0 && firstChunkFedAt > 0 && now - firstChunkFedAt > 2500) {
        throw new Error(
          `VideoDecoder (${decoderConfig.codec}, ${decoderConfig.hardwareAcceleration || 'default'}) produced 0 frames after 2.5s.`
        );
      }
      if (
        encodedFramesCount > 0 &&
        encodedChunksOutputCount === 0 &&
        firstFrameEncodedAt > 0 &&
        now - firstFrameEncodedAt > 3000
      ) {
        throw new Error(
          `VideoEncoder (${encoderProfile.selectedCodec}, ${encoderProfile.selectedAccel}) produced 0 chunks after 3.0s.`
        );
      }
      if (idleMs > 15000 && chunksFed > 0) {
        throw new Error('WebCodecs decode/encode pipeline stalled for >15s.');
      }
    };

    const {
      sampleCount,
      sampleOffsets,
      sampleSizes,
      sampleTimestampsUs,
      sampleDurationsUs,
      sampleIsKey,
    } = track;

    // Stream samples sequentially with high-throughput backpressure + wall-clock UI yields
    for (let i = 0; i < sampleCount; i++) {
      if (options.signal?.aborted) {
        throw new Error('Hardware compression cancelled by user.');
      }
      if (fatalError) {
        throw fatalError;
      }

      const now = Date.now();
      if (now - lastYieldAt >= 32) {
        lastYieldAt = now;
        await sleepMs(0);
      }

      checkWatchdog();

      while (
        (decoder.decodeQueueSize > DECODE_QUEUE_MAX || encoder.encodeQueueSize > ENCODE_QUEUE_MAX) &&
        !fatalError &&
        !options.signal?.aborted
      ) {
        checkWatchdog();
        await sleepMs(1);
      }

      if (options.signal?.aborted) {
        throw new Error('Hardware compression cancelled by user.');
      }
      if (fatalError) {
        throw fatalError;
      }

      const sz = sampleSizes[i];
      if (sz <= 0) continue;

      let bytes = await reader.read(sampleOffsets[i], sz);
      if (bytes.byteLength === 0) continue;

      const isKeySample = chunksFed === 0 || sampleIsKey[i] === 1;

      // Auto-detect missing Sequence Header OBU on AV1 sample 0 when using in-band WebCodecs decoding
      if (chunksFed === 0 && av1ConfigObus && !decoderConfig.description) {
        if (!sampleHasAv1SequenceHeaderObu(bytes)) {
          shouldInjectAv1Obus = true;
        }
      }

      if (isKeySample && shouldInjectAv1Obus && av1ConfigObus && !sampleHasAv1SequenceHeaderObu(bytes)) {
        const combined = new Uint8Array(av1ConfigObus.byteLength + bytes.byteLength);
        combined.set(av1ConfigObus, 0);
        combined.set(bytes, av1ConfigObus.byteLength);
        bytes = combined;
      }

      const chunk = new EncodedVideoChunk({
        type: isKeySample ? 'key' : 'delta',
        timestamp: sampleTimestampsUs[i],
        duration: sampleDurationsUs[i],
        data: bytes,
      });
      decoder.decode(chunk);
      if (firstChunkFedAt === 0) {
        firstChunkFedAt = Date.now();
      }
      chunksFed++;
    }

    if (options.signal?.aborted) {
      throw new Error('Hardware compression cancelled by user.');
    }
    if (fatalError) {
      throw fatalError;
    }

    const flushWithWatchdog = async (
      label: string,
      fn: () => Promise<void>,
      isZeroOutput: () => boolean
    ) => {
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
          if ((isZeroOutput() && idleMs > 2500) || idleMs > 15000) {
            settled = true;
            clearInterval(timer);
            reject(new Error(`${label} flush timed out without output.`));
          }
        }, 150);

        fn()
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
    };

    await flushWithWatchdog('VideoDecoder', () => decoder!.flush(), () => decodedFramesCount === 0);
    if (fatalError) throw fatalError;

    await flushWithWatchdog(
      'VideoEncoder',
      () => encoder!.flush(),
      () => encodedChunksOutputCount === 0
    );
    if (fatalError) throw fatalError;

    if (encodedChunksOutputCount === 0 || encodedFramesCount === 0) {
      cleanup();
      return {
        result: null,
        decodedFramesCount,
        encodedFramesCount,
        encodedChunksOutputCount: 0,
        encoderStalled: decodedFramesCount > 0,
      };
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
      decodedFramesCount,
      encodedFramesCount,
      encodedChunksOutputCount,
      encoderStalled: false,
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
    const reason = err instanceof Error ? err.message : String(err);
    if (encodedChunksOutputCount === 0) {
      return {
        result: null,
        decodedFramesCount,
        encodedFramesCount,
        encodedChunksOutputCount: 0,
        encoderStalled: decodedFramesCount > 0,
        failureReason: reason,
      };
    }
    throw err instanceof Error ? err : new Error(reason);
  }
}

/**
 * Fast-path zero-seek sequential WebCodecs pipeline:
 * MP4 Demuxer -> EncodedVideoChunk -> VideoDecoder -> VideoFrame -> VideoEncoder -> MP4 Muxer.
 * Automatically retries hardware -> software (`no-preference` / dav1d) decoder, 2D canvas normalization,
 * AV1 configOBU injection, and fallback encoder configurations on 0-frame stalls or driver errors.
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
    options.onLog?.('WebCodecs VideoDecoder/VideoEncoder APIs unavailable in this browser.');
    return null;
  }

  options.onStatus?.('Scanning MP4 sample table...');
  options.onLog?.('Scanning MP4 track sample table via zero-copy demuxer...');
  const track = await demuxMp4VideoTrack(videoBlob, options.onLog);
  if (!track || track.sampleCount === 0 || !track.codedWidth || !track.codedHeight) {
    options.onLog?.('MP4 sample table unavailable for direct WebCodecs decode; falling back to media capture.');
    return null;
  }

  options.onLog?.(
    `Demuxed ${track.sampleCount.toLocaleString()} video frames (${track.codec}, ${track.codedWidth}x${track.codedHeight}, ${track.fps} fps, ${Math.round(track.durationSeconds)}s).`
  );

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
    options.onLog?.(
      `Browser VideoDecoder reported no supported config for ${track.codec}; trying media element fallback.`
    );
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

  options.onStatus?.('Probing GPU encoder profile...');
  const primaryEncoderProfile = await selectVideoEncoderProfile(
    width,
    height,
    bitrate,
    effectiveFps,
    options
  );

  options.onLog?.(
    `Encoder ready: ${primaryEncoderProfile.selectedCodec} (${primaryEncoderProfile.selectedAccel}, ${
      primaryEncoderProfile.encoderConfigExtras.latencyMode || 'default'
    }). Testing ${Math.min(4, supportedDecoderConfigs.length)} decoder profile(s)...`
  );

  let workingDecoderConfig: VideoDecoderConfig | null = null;
  let lastFailureReason: string | undefined;

  // 1. Try top supported decoder configs (in-band prefer-hardware -> in-band dav1d -> with extradata)
  for (const decCfg of supportedDecoderConfigs.slice(0, 4)) {
    options.onStatus?.(`Hardware GPU · ${track.fourcc} → ${primaryEncoderProfile.muxerVideoCodec}`);
    options.onLog?.(
      `Attempting VideoDecoder: ${decCfg.codec} (${decCfg.hardwareAcceleration || 'default'}, ${
        decCfg.description ? 'with extradata' : 'in-band'
      })...`
    );
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
    if (attempt.failureReason) {
      lastFailureReason = attempt.failureReason;
      options.onLog?.(`WebCodecs attempt note: ${attempt.failureReason}`);
    }

    // If decoder produced frames cleanly but encoder stalled/rejected raw VideoFrame format,
    // immediately retry THIS working decoder with 2D canvas pixel-format normalization!
    if (attempt.decodedFramesCount > 0 && attempt.encodedChunksOutputCount === 0) {
      workingDecoderConfig = decCfg;
      options.onStatus?.('Normalizing pixel format for GPU encoder...');
      options.onLog?.(
        `Decoded ${attempt.decodedFramesCount} frames cleanly; retrying encoder with 2D canvas pixel normalization...`
      );
      const canvasAttempt = await runSequentialDecodeAttempt(
        videoBlob,
        track,
        decCfg,
        primaryEncoderProfile,
        width,
        height,
        bitrate,
        effectiveFps,
        options,
        { forceCanvas: true }
      );
      if (canvasAttempt.result) {
        return canvasAttempt.result;
      }
      if (canvasAttempt.failureReason) {
        lastFailureReason = canvasAttempt.failureReason;
        options.onLog?.(`Canvas-normalized encoder note: ${canvasAttempt.failureReason}`);
      }
      break;
    }
  }

  // 2. If decoder worked (or we have a fallback decoder), retry encoder with default latency + no-preference
  if (workingDecoderConfig || primaryEncoderProfile.selectedAccel === 'prefer-hardware') {
    try {
      const altEncoderProfile = await selectVideoEncoderProfile(
        width,
        height,
        bitrate,
        effectiveFps,
        { ...options, preferHardware: false },
        { preferDefaultLatency: true }
      );
      const bestDecCfg =
        workingDecoderConfig ||
        supportedDecoderConfigs.find((c) => c.hardwareAcceleration === 'no-preference') ||
        supportedDecoderConfigs[0];
      options.onStatus?.(`Retrying encoder (${altEncoderProfile.selectedCodec})...`);
      options.onLog?.(
        `Retrying with compatibility encoder ${altEncoderProfile.selectedCodec} (${altEncoderProfile.selectedAccel}, default latency, canvas-normalized)...`
      );
      const altAttempt = await runSequentialDecodeAttempt(
        videoBlob,
        track,
        bestDecCfg,
        altEncoderProfile,
        width,
        height,
        bitrate,
        effectiveFps,
        options,
        { forceCanvas: true }
      );
      if (altAttempt.result) {
        return altAttempt.result;
      }
      if (altAttempt.failureReason) {
        lastFailureReason = altAttempt.failureReason;
      }
    } catch {
      // Allow <video> element fallback below
    }
  }

  if (lastFailureReason) {
    options.onLog?.(`Direct WebCodecs decoder/encoder could not complete (${lastFailureReason}).`);
  }
  return null;
}

async function transcodeViaVideoElementCapture(
  videoBlob: Blob,
  options: HardwareTranscodeOptions
): Promise<HardwareEncodeResult> {
  options.onStatus?.('Switching to browser media decoder...');
  options.onLog?.('Initializing browser <video> element frame-capture fallback...');

  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // Keep mounted tiny offscreen so iOS/iPadOS Safari actually fires loadedmetadata & seeked
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.001';
    video.style.pointerEvents = 'none';
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(video);
    }

    let activeEncoder: VideoEncoder | null = null;
    let settled = false;
    let startedCapture = false;
    let metadataTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (metadataTimer) {
        clearTimeout(metadataTimer);
        metadataTimer = null;
      }
      try {
        if (activeEncoder && activeEncoder.state !== 'closed') {
          activeEncoder.close();
        }
      } catch {}
      activeEncoder = null;
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      } catch {}
      URL.revokeObjectURL(videoUrl);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    // Hard 8-second guard so detached/unsupported <video> can NEVER hang forever at 1%
    metadataTimer = setTimeout(() => {
      if (!startedCapture && !settled) {
        fail(
          new Error(
            'Browser media decoder timed out loading this video file (unsupported codec or file too large for <video> fallback).'
          )
        );
      }
    }, 8000);

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
      if (metadataTimer) {
        clearTimeout(metadataTimer);
        metadataTimer = null;
      }

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
          firstTimestampBehavior: 'offset',
        });

        let encodedFramesCount = 0;
        let encodedChunksOutputCount = 0;
        let firstFrameEncodedAt = 0;
        let encoderFailed = false;
        const fallbackStepUs = Math.max(1000, Math.round(1_000_000 / framerate));
        const fallbackDtsQueue: number[] = [];
        let fallbackLastMuxedDtsUs = -1;
        let fallbackWrapOffsetUs = 0;

        const encoder = new VideoEncoder({
          output: (chunk, meta) => {
            try {
              const expectedDtsUs =
                fallbackDtsQueue.length > 0
                  ? fallbackDtsQueue.shift()!
                  : fallbackLastMuxedDtsUs >= 0
                  ? fallbackLastMuxedDtsUs + fallbackStepUs
                  : 0;
              let rawPtsUs = Number.isFinite(chunk.timestamp) ? Math.round(chunk.timestamp) : expectedDtsUs;
              if (
                fallbackLastMuxedDtsUs >= 0 &&
                rawPtsUs + fallbackWrapOffsetUs < fallbackLastMuxedDtsUs - 2_000_000_000
              ) {
                fallbackWrapOffsetUs += 4_294_967_296;
              }
              let ptsUs = Math.max(0, rawPtsUs + fallbackWrapOffsetUs);
              if (Math.abs(ptsUs - expectedDtsUs) > 5_000_000) {
                ptsUs = expectedDtsUs;
              }
              const safeDtsUs =
                fallbackLastMuxedDtsUs >= 0
                  ? Math.max(fallbackLastMuxedDtsUs + fallbackStepUs, expectedDtsUs)
                  : Math.max(0, expectedDtsUs);
              const safePtsUs = Math.max(safeDtsUs, ptsUs);
              fallbackLastMuxedDtsUs = safeDtsUs;
              muxer.addVideoChunk(chunk, meta, safePtsUs, safePtsUs - safeDtsUs);
              encodedChunksOutputCount++;
            } catch (outErr) {
              encoderFailed = true;
              fail(outErr instanceof Error ? outErr : new Error(String(outErr)));
            }
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
          hardwareAcceleration: encoderProfile.selectedAccel,
          ...(encoderProfile.encoderConfigExtras as any),
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

        const finalizeEncode = async () => {
          if (settled || encoderFailed) return;
          await encoder.flush();
          if (encodedChunksOutputCount === 0) {
            fail(new Error('WebCodecs VideoEncoder produced 0 output chunks in media fallback mode.'));
            return;
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

            // Detect encoder stall inside media fallback mode
            if (
              encodedFramesCount > 0 &&
              encodedChunksOutputCount === 0 &&
              firstFrameEncodedAt > 0 &&
              Date.now() - firstFrameEncodedAt > 4000
            ) {
              fail(new Error(`VideoEncoder (${encoderProfile.selectedCodec}) stalled with 0 output chunks.`));
              return;
            }

            // Guard multi-hour videos from silently crawling at <1.5 fps via seek fallback
            if (duration > 600 && frameIndex === 12) {
              const elapsedSec = (Date.now() - startTime) / 1000;
              const measuredFps = elapsedSec > 0 ? frameIndex / elapsedSec : 0;
              if (measuredFps < 1.5) {
                fail(
                  new Error(
                    `Direct WebCodecs VideoDecoder was unavailable for this file and seek fallback is too slow (${measuredFps.toFixed(1)} fps) for a ${Math.round(duration / 60)}-minute video. Check Console logs for decoder details or try H.264.`
                  )
                );
                return;
              }
            }

            if (encoder.encodeQueueSize > 12) {
              setTimeout(() => {
                void stepThrough();
              }, 2);
              return;
            }

            const targetTime = frameIndex * timeInterval;
            if (targetTime >= duration || frameIndex >= totalSteps) {
              await finalizeEncode();
              return;
            }

            const needSeek = !(
              frameIndex === 0 &&
              video.readyState >= 2 &&
              Math.abs(video.currentTime) < 0.05
            );

            if (needSeek) {
              let seekOk = false;
              const seekTarget = Math.min(targetTime, Math.max(0, duration - 0.001));
              const seekTimeoutMs = duration > 300 && frameIndex <= 2 ? 3500 : 8000;
              for (let seekTry = 0; seekTry < 2 && !seekOk; seekTry++) {
                seekOk = await new Promise<boolean>((r) => {
                  let done = false;
                  const timer = setTimeout(() => {
                    if (!done) {
                      done = true;
                      video.removeEventListener('seeked', onSeeked);
                      r(false);
                    }
                  }, seekTimeoutMs);
                  const onSeeked = () => {
                    if (!done) {
                      done = true;
                      clearTimeout(timer);
                      video.removeEventListener('seeked', onSeeked);
                      r(true);
                    }
                  };
                  video.addEventListener('seeked', onSeeked);
                  video.currentTime = seekTarget;
                });
              }

              if (!seekOk) {
                if (encodedFramesCount > 0 && targetTime >= duration - 1.5) {
                  await finalizeEncode();
                  return;
                }
                fail(
                  new Error(
                    `Hardware decoder seek stalled at ${Math.floor(targetTime)}s of ${Math.floor(duration)}s.`
                  )
                );
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
            if (firstFrameEncodedAt === 0) {
              firstFrameEncodedAt = Date.now();
            }
            try {
              fallbackDtsQueue.push(timestampMicros);
              encoder.encode(frame, { keyFrame });
            } finally {
              frame.close();
            }

            encodedFramesCount++;
            frameIndex++;

            const now = Date.now();
            if (options.onProgress && (encodedFramesCount === 1 || now - lastProgressAt >= 150)) {
              lastProgressAt = now;
              const elapsed = (now - startTime) / 1000;
              const currentFps = elapsed > 0 ? Math.round(encodedFramesCount / elapsed) : 0;
              const percent = Math.max(0.1, Math.min(99.5, (targetTime / duration) * 100));
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
    video.src = videoUrl;
    video.load();
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
