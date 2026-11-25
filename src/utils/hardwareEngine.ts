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

  // 1. Target Size (MB) mode
  if (
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
  const crf = Math.min(34, Math.max(16, config.crf || 23));
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

  // Estimate source video bitrate so compressing an already-compressed clip actually shrinks it
  let sourceTotalBps = 0;
  if (source?.bitrate && source.bitrate > 0) {
    sourceTotalBps = source.bitrate * 1000; // probe.ts stores bitrate in kb/s
  } else if (source?.size && duration > 0) {
    sourceTotalBps = Math.round((source.size * 8) / duration);
  }

  if (sourceTotalBps > 0) {
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

/**
 * Compresses/transcodes a browser-playable video blob using WebCodecs hardware-accelerated
 * VideoEncoder (Snapdragon Adreno / MediaTek MediaCodec / Apple VideoToolbox / GPU NVENC/QSV)
 * with paged low-RAM MP4 muxing and optional zero-copy fast-start.
 */
export async function transcodeWithHardwareWebCodecs(
  videoBlob: Blob,
  options: {
    resolution?: ResolutionPreset;
    targetWidth?: number;
    targetHeight?: number;
    bitrate?: number; // in bps, e.g. 2_500_000 for 2.5 Mbps
    framerate?: number;
    preferredCodec?: 'avc' | 'hevc' | 'av01';
    preferHardware?: boolean;
    codec?: string;
    fastStart?: boolean;
    webgpuFilter?: 'none' | 'grayscale';
    onProgress?: (progress: { percent: number; currentTime: number; duration: number; fps: number }) => void;
    signal?: AbortSignal;
  }
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
      fail(new Error('Failed to load video element for hardware decoding.'));
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        if (!sourceWidth || !sourceHeight) {
          throw new Error('Source video has invalid dimensions for hardware encoding.');
        }

        // Preserve aspect ratio cleanly (portrait or landscape) without stretching
        let width: number;
        let height: number;
        if (options.resolution) {
          const resolved = resolveTargetDimensions(sourceWidth, sourceHeight, options.resolution);
          width = resolved.width;
          height = resolved.height;
        } else if (options.targetWidth && options.targetHeight) {
          const isPortrait = sourceHeight > sourceWidth;
          const maxW = isPortrait
            ? Math.min(options.targetWidth, options.targetHeight)
            : Math.max(options.targetWidth, options.targetHeight);
          const maxH = isPortrait
            ? Math.max(options.targetWidth, options.targetHeight)
            : Math.min(options.targetWidth, options.targetHeight);
          if (sourceWidth <= maxW && sourceHeight <= maxH) {
            width = Math.max(2, Math.round(sourceWidth / 2) * 2);
            height = Math.max(2, Math.round(sourceHeight / 2) * 2);
          } else {
            const scale = Math.min(maxW / sourceWidth, maxH / sourceHeight);
            width = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2);
            height = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2);
          }
        } else {
          width = Math.max(2, Math.round(sourceWidth / 2) * 2);
          height = Math.max(2, Math.round(sourceHeight / 2) * 2);
        }

        const framerate = Math.min(60, Math.max(15, options.framerate || 30));
        const bitrate = Math.min(
          35_000_000,
          Math.max(180_000, options.bitrate || Math.round(width * height * framerate * 0.06))
        );

        // Pick the highest AV1 / HEVC / H.264 profile accepted by Snapdragon / MediaTek / Apple / Desktop GPU
        const av1Candidates =
          width * height >= 2560 * 1440
            ? ['av01.0.12M.08', 'av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08']
            : ['av01.0.08M.08', 'av01.0.05M.08', 'av01.0.04M.08'];
        const hevcCandidates = ['hvc1.1.6.L120.90', 'hev1.1.6.L120.90'];
        const h264Candidates = ['avc1.640033', 'avc1.64002a', 'avc1.4d0029', 'avc1.42001f'];

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
          // For AV1 (av01): try hardware silicon first, then browser's built-in WebCodecs AV1 encoder
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
            codec: muxerVideoCodec,
            width,
            height,
            frameRate: framerate,
          },
          fastStart: false,
        });

        // Initialize WebCodecs VideoEncoder
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
          codec: selectedCodec,
          width,
          height,
          bitrate,
          framerate,
          bitrateMode: 'variable',
          hardwareAcceleration: selectedAccel,
          latencyMode: 'quality',
        });

        // Zero-copy GPU VideoFrame path when dimensions match and no canvas filter is active
        const canDirectZeroCopyFrame =
          width === sourceWidth && height === sourceHeight && options.webgpuFilter !== 'grayscale';

        let canvas: HTMLCanvasElement | null = null;
        let ctx: CanvasRenderingContext2D | null = null;
        if (!canDirectZeroCopyFrame) {
          canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
            throw new Error('Failed to initialize 2D rendering context for hardware frame scaling.');
          }
          if (options.webgpuFilter === 'grayscale') {
            ctx.filter = 'grayscale(100%)';
          }
        }

        const totalSteps = Math.max(1, Math.ceil(duration * framerate));
        const timeInterval = 1 / framerate;

        let frameIndex = 0;
        const startTime = Date.now();
        let lastProgressAt = 0;

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
              codecUsed: selectedCodec!,
              isHevc,
              isAv1,
              isHardware,
              width,
              height,
              bitrateBps: bitrate,
            });
          }
        };

        const stepThrough = async () => {
          if (settled || encoderFailed) return;

          if (options.signal?.aborted) {
            fail(new Error('Hardware compression cancelled by user.'));
            return;
          }

          // Respect hardware encoder queue backpressure without artificial 60fps display VSync cap
          if (encoder.encodeQueueSize > 6) {
            setTimeout(stepThrough, 4);
            return;
          }

          const targetTime = frameIndex * timeInterval;
          if (targetTime >= duration || frameIndex >= totalSteps) {
            try {
              await finalizeEncode();
            } catch (flushErr: any) {
              fail(flushErr instanceof Error ? flushErr : new Error(String(flushErr)));
            }
            return;
          }

          // Seek video to frame timestamp with timeout safeguard against unseekable EOF frames
          const seekOk = await new Promise<boolean>((r) => {
            let done = false;
            const timer = setTimeout(() => {
              if (!done) {
                done = true;
                video.removeEventListener('seeked', onSeeked);
                r(false);
              }
            }, 2500);
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
            // If we already encoded frames and hit an unseekable tail, finalize cleanly
            if (encodedFramesCount > 0) {
              try {
                await finalizeEncode();
              } catch (flushErr: any) {
                fail(flushErr instanceof Error ? flushErr : new Error(String(flushErr)));
              }
              return;
            }
            fail(new Error('Hardware decoder could not seek source video container.'));
            return;
          }

          if (settled || encoderFailed || options.signal?.aborted) {
            if (options.signal?.aborted) fail(new Error('Hardware compression cancelled by user.'));
            return;
          }

          const timestampMicros = Math.round(targetTime * 1_000_000);
          const durationMicros = Math.round(timeInterval * 1_000_000);
          let frame: VideoFrame;

          if (canDirectZeroCopyFrame) {
            // Direct GPU texture handoff from Android MediaCodec / VideoToolbox decoder -> VideoEncoder
            frame = new VideoFrame(video, {
              timestamp: timestampMicros,
              duration: durationMicros,
            });
          } else if (ctx && canvas) {
            ctx.drawImage(video, 0, 0, width, height);
            frame = new VideoFrame(canvas, {
              timestamp: timestampMicros,
              duration: durationMicros,
            });
          } else {
            throw new Error('No frame source available');
          }

          const keyFrame = frameIndex % Math.max(1, Math.round(framerate * 2)) === 0;
          encoder.encode(frame, { keyFrame });
          frame.close();

          encodedFramesCount++;
          frameIndex++;

          // Throttled UI telemetry (10 Hz) so mobile compositor never stalls
          const now = Date.now();
          if (options.onProgress && now - lastProgressAt >= 100) {
            lastProgressAt = now;
            const elapsed = (now - startTime) / 1000;
            const currentFps = elapsed > 0 ? Math.round(encodedFramesCount / elapsed) : 0;
            const percent = Math.min(99.5, (targetTime / duration) * 100);
            options.onProgress({
              percent,
              currentTime: targetTime,
              duration,
              fps: currentFps,
            });
          }

          // Schedule next frame immediately without VSync 60fps cap
          setTimeout(stepThrough, 0);
        };

        stepThrough();
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };
  });
}
