/**
 * Hardware Acceleration & WebGPU Engine
 * Integrates:
 * 1. WebGPU (navigator.gpu) - GPU device, adapter, limits, hardware shader/texture pipeline
 * 2. WebCodecs (VideoEncoder, VideoDecoder) with hardwareAcceleration: 'prefer-hardware'
 * 3. MP4-Muxer for zero-copy hardware multiplexing
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

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
}

export interface HardwareCapabilities {
  webgpu: WebGPUInfo;
  webcodecs: WebCodecsInfo;
  hardwareAccelerationSupported: boolean;
}

let cachedCapabilities: HardwareCapabilities | null = null;
let activeGpuDevice: GPUDevice | null = null;

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

        // Check adapter info
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

  // 2. WebCodecs Probing (with prefer-hardware)
  const webcodecs: WebCodecsInfo = {
    available: typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoDecoder' in window,
    hwH264: false,
    hwHEVC: false,
    hwVP9: false,
    hwAV1: false,
  };

  if (webcodecs.available && typeof VideoEncoder.isConfigSupported === 'function') {
    // Check H.264 hardware encoding (AVC High Profile)
    try {
      const h264Res = await VideoEncoder.isConfigSupported({
        codec: 'avc1.640033', // High Profile Level 5.1 (supports 4K)
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 60,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (h264Res.supported) webcodecs.hwH264 = true;
    } catch {
      // Try baseline H.264
      try {
        const h264Base = await VideoEncoder.isConfigSupported({
          codec: 'avc1.42001f',
          width: 1280,
          height: 720,
          bitrate: 2_000_000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware',
        });
        if (h264Base.supported) webcodecs.hwH264 = true;
      } catch {}
    }

    // Check HEVC (H.265) hardware encoding (Apple Silicon VideoToolbox)
    try {
      const hevcRes = await VideoEncoder.isConfigSupported({
        codec: 'hvc1.1.6.L120.90',
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 60,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (hevcRes.supported) webcodecs.hwHEVC = true;
    } catch {}

    // Check VP9
    try {
      const vp9Res = await VideoEncoder.isConfigSupported({
        codec: 'vp09.00.10.08',
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 60,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (vp9Res.supported) webcodecs.hwVP9 = true;
    } catch {}

    // Check AV1
    try {
      const av1Res = await VideoEncoder.isConfigSupported({
        codec: 'av01.0.08M.08',
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 60,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (av1Res.supported) webcodecs.hwAV1 = true;
    } catch {}
  }

  const result: HardwareCapabilities = {
    webgpu,
    webcodecs,
    hardwareAccelerationSupported: webgpu.available || webcodecs.hwH264 || webcodecs.hwHEVC,
  };

  cachedCapabilities = result;
  return result;
}

export function getActiveWebGPUDevice(): GPUDevice | null {
  return activeGpuDevice;
}

/**
 * Transcodes a browser-playable video blob using WebCodecs hardware accelerated pipeline and WebGPU canvas
 */
export async function transcodeWithHardwareWebCodecs(
  videoBlob: Blob,
  options: {
    targetWidth?: number;
    targetHeight?: number;
    bitrate?: number; // in bps, e.g. 6_000_000 for 6Mbps
    framerate?: number;
    codec?: 'avc1.640033' | 'avc1.4d002a' | 'hvc1.1.6.L120.90';
    webgpuFilter?: 'none' | 'grayscale';
    onProgress?: (progress: { percent: number; currentTime: number; duration: number; fps: number }) => void;
    signal?: AbortSignal;
  }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(videoUrl);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video element for hardware decoding.'));
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 1;
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        let width = options.targetWidth || sourceWidth;
        let height = options.targetHeight || sourceHeight;

        // Even dimensions required for H.264/HEVC
        width = Math.round(width / 2) * 2;
        height = Math.round(height / 2) * 2;

        const framerate = options.framerate || 30;
        const bitrate = options.bitrate || Math.min(25_000_000, Math.round(width * height * framerate * 0.1));

        // Selected codec (defaults to H.264 High Profile)
        const codec = options.codec || 'avc1.640033';

        // Setup MP4 Muxer with ArrayBufferTarget
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: {
            codec: codec.startsWith('hvc1') ? 'hevc' : 'avc',
            width,
            height,
          },
          fastStart: 'in-memory',
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
            cleanup();
            reject(err);
          },
        });

        encoder.configure({
          codec,
          width,
          height,
          bitrate,
          framerate,
          hardwareAcceleration: 'prefer-hardware', // HARDWARE ACCELERATION DIRECT TO GPU
        });

        // Setup offscreen canvas or WebGPU texture for frame grabbing
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let gpuDevice: GPUDevice | null = null;
        let computePipeline: any = null;
        let gpuContext: any = null;

        if (options.webgpuFilter === 'grayscale' && (navigator as any).gpu) {
          const adapter = await (navigator as any).gpu.requestAdapter();
          if (adapter) {
            gpuDevice = await adapter.requestDevice();
            gpuContext = canvas.getContext('webgpu' as any);
            if (gpuContext) {
              gpuContext.configure({
                device: gpuDevice,
                format: (navigator as any).gpu.getPreferredCanvasFormat(),
                usage: 0x02 /* GPUTextureUsage.STORAGE_BINDING */ | 0x10 /* GPUTextureUsage.RENDER_ATTACHMENT */,
              });

              const shaderModule = gpuDevice.createShaderModule({
                code: `
                  @group(0) @binding(0) var inputTex: texture_external;
                  @group(0) @binding(1) var outputTex: texture_storage_2d<bgra8unorm, write>;

                  @compute @workgroup_size(16, 16)
                  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                    let dims = textureDimensions(inputTex);
                    if (id.x >= dims.x || id.y >= dims.y) {
                      return;
                    }
                    let color = textureLoad(inputTex, vec2<i32>(id.xy));
                    let brightness = 1.1;
                    let luma = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
                    let adjusted = vec4<f32>(vec3<f32>(luma * brightness), color.a);
                    textureStore(outputTex, vec2<i32>(id.xy), adjusted);
                  }
                `,
              });

              computePipeline = await gpuDevice.createComputePipelineAsync({
                layout: 'auto',
                compute: {
                  module: shaderModule,
                  entryPoint: 'main',
                },
              });
            } else {
              console.warn('WebGPU context not available on canvas, falling back to 2D.');
            }
          }
        }

        let ctx: CanvasRenderingContext2D | null = null;
        if (!gpuContext) {
          ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) {
            throw new Error('Failed to initialize 2D rendering context for hardware frame processing.');
          }
        }

        const totalSteps = Math.ceil(duration * framerate);
        const timeInterval = 1 / framerate;

        let frameIndex = 0;
        const startTime = Date.now();

        const stepThrough = async () => {
          if (options.signal?.aborted) {
            cleanup();
            reject(new Error('Hardware transcode cancelled by user.'));
            return;
          }

          if (encoderFailed) return;

          const targetTime = frameIndex * timeInterval;
          if (targetTime >= duration || frameIndex >= totalSteps) {
            // Finished feeding all frames
            await encoder.flush();
            muxer.finalize();

            const buffer = muxer.target.buffer;
            const finalBlob = new Blob([buffer], { type: 'video/mp4' });
            cleanup();
            resolve(finalBlob);
            return;
          }

          // Seek video to frame timestamp
          video.currentTime = targetTime;
          await new Promise<void>((r) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              r();
            };
            video.addEventListener('seeked', onSeeked);
          });

          // Draw to canvas and construct hardware VideoFrame
          const timestampMicros = Math.round(targetTime * 1_000_000);
          const durationMicros = Math.round(timeInterval * 1_000_000);
          let frame: VideoFrame;

          if (gpuContext && gpuDevice && computePipeline) {
            // WEBGPU ZERO-COPY PIPELINE
            const rawFrame = new VideoFrame(video, {
              timestamp: timestampMicros,
              duration: durationMicros,
            });

            const sourceTexture = gpuDevice.importExternalTexture({ source: rawFrame });
            const outputTexture = gpuContext.getCurrentTexture();

            const bindGroup = gpuDevice.createBindGroup({
              layout: computePipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: sourceTexture },
                { binding: 1, resource: outputTexture.createView() },
              ],
            });

            const commandEncoder = gpuDevice.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(computePipeline);
            passEncoder.setBindGroup(0, bindGroup);
            const workgroupsX = Math.ceil(width / 16);
            const workgroupsY = Math.ceil(height / 16);
            passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY);
            passEncoder.end();

            gpuDevice.queue.submit([commandEncoder.finish()]);

            frame = new VideoFrame(canvas, {
              timestamp: timestampMicros,
              duration: durationMicros,
            });
            rawFrame.close();
          } else if (ctx) {
            // 2D CANVAS PIPELINE
            ctx.drawImage(video, 0, 0, width, height);
            frame = new VideoFrame(canvas, {
              timestamp: timestampMicros,
              duration: durationMicros,
            });
          } else {
             throw new Error('No rendering context available');
          }

          const keyFrame = frameIndex % (framerate * 2) === 0;
          encoder.encode(frame, { keyFrame });
          frame.close();

          encodedFramesCount++;
          frameIndex++;

          // Telemetry
          if (options.onProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const currentFps = elapsed > 0 ? Math.round(encodedFramesCount / elapsed) : 0;
            const percent = Math.min(99.5, (targetTime / duration) * 100);
            options.onProgress({
              percent,
              currentTime: targetTime,
              duration,
              fps: currentFps,
            });
          }

          // Allow event loop to process
          requestAnimationFrame(stepThrough);
        };

        // Start frame capture loop
        stepThrough();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
  });
}
