import { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  AlertCircle,
  Zap,
  Loader2,
  Film,
  Archive,
} from 'lucide-react';

import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import workerURL from './vendor/ffmpeg-worker?worker&url';

import coreMTURL from '@ffmpeg/core-mt?url';
import wasmMTURL from '@ffmpeg/core-mt/wasm?url';
import workerMTURL from '@ffmpeg/core-mt/worker?url';

import {
  SourceMetadata,
  EncodingConfig,
  ProgressTelemetry,
  LogMessage,
  ConversionResult,
  SubtitleTrackInfo,
  FFmpegDiagnostic,
} from './types';
import {
  buildFFmpegArgs,
  getRecommendedExtension,
  getMimeType,
  checkCompatibility,
  detectDeviceCapabilities,
  diagnoseFFmpegFailure,
} from './utils/ffmpegBuilder';
import {
  parseFFmpegProbeLogs,
  probeMediaElement,
  AUDIO_EXTENSIONS,
  getFileExtension,
  detectFileExtensionFromMagicBytes,
} from './utils/probe';
import {
  detectHardwareCapabilities,
  transcodeWithHardwareWebCodecs,
  computeTargetVideoBitrateBps,
  HardwareCapabilities,
} from './utils/hardwareEngine';
import {
  getCachedWasmBlobURL,
  WASM_ENGINE_CACHE_NAME,
  WASM_RUNTIME_CACHE_NAME,
  ARCHIVE_RUNTIME_CACHE_NAME,
} from './utils/wasmCache';
import { preloadAllEnginesToIDB } from './utils/engineIndexedDBCache';

import { Header, WorkspaceMode } from './components/Header';
import { MediaDropzone } from './components/MediaDropzone';
import { SourceInspector } from './components/SourceInspector';
import { EncodingControls } from './components/EncodingControls';
import { CommandPreview } from './components/CommandPreview';
import { ProgressEngine } from './components/ProgressEngine';
import { ResultPanel } from './components/ResultPanel';
import { TerminalDock } from './components/TerminalDock';
import { Footer } from './components/Footer';
import { ComplianceModal, ComplianceTab } from './components/ComplianceModal';
import { FileCompressorWorkstation } from './components/FileCompressorWorkstation';
import { PdfLockerWorkstation } from './components/PdfLockerWorkstation';

const DEFAULT_CONFIG: EncodingConfig = {
  targetCategory: 'video',
  container: 'mp4',
  videoCodec: 'copy',
  rateControl: 'crf',
  crf: 22,
  videoBitrate: '4000k',
  resolution: 'source',
  framerate: 'source',
  speedPreset: 'ultrafast',
  audioCodec: 'copy',
  audioBitrate: '192k',
  audioChannels: 'source',
  audioSampleRate: 'source',
  subtitleMode: 'convert',
  preserveMetadataTags: true,
  conditionalAudioTranscode: true,
  fastStart: true,
  hardwareAcceleration: true,
  hardwareEngine: 'auto',
};

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('media');
  const [engineReady, setEngineReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMetadata | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [extractingSubtitleIndex, setExtractingSubtitleIndex] = useState<number | null>(null);

  const [hardwareCaps, setHardwareCaps] = useState<HardwareCapabilities | null>(null);
  const hwAbortController = useRef<AbortController | null>(null);

  const [config, setConfig] = useState<EncodingConfig>(DEFAULT_CONFIG);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [conversionDiagnostic, setConversionDiagnostic] = useState<FFmpegDiagnostic | null>(null);

  const [telemetry, setTelemetry] = useState<ProgressTelemetry>({
    percent: 0,
    currentTime: 0,
    duration: 0,
    fps: 0,
    speed: '',
    elapsedMs: 0,
    etaSeconds: null,
  });

  const [result, setResult] = useState<ConversionResult | null>(null);
  const [isPurged, setIsPurged] = useState(false);

  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [complianceTab, setComplianceTab] = useState<ComplianceTab>('privacy');

  const handleOpenCompliance = useCallback((tab: ComplianceTab = 'privacy') => {
    setComplianceTab(tab);
    setComplianceOpen(true);
  }, []);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const startTimeRef = useRef<number>(0);
  const sourceMetaRef = useRef<SourceMetadata | null>(null);
  const probeLogsBuffer = useRef<string[]>([]);
  const activeVirtualFiles = useRef<{ inMountDir?: string; inName?: string; outName?: string }>({});
  const activeOutputUrlRef = useRef<string | null>(null);
  const wakeLockSentinelRef = useRef<any>(null);

  useEffect(() => {
    sourceMetaRef.current = sourceMeta;
  }, [sourceMeta]);

  const addLog = useCallback((type: 'stdout' | 'stderr' | 'system' | 'error', text: string) => {
    const time = new Date().toTimeString().split(' ')[0] + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
    setLogs((prev) => [
      ...prev.slice(-400), // Keep last 400 entries to maintain high performance
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: time,
        type,
        text,
      },
    ]);
  }, []);

  // Hardware capabilities detection (WebGPU & WebCodecs)
  useEffect(() => {
    detectHardwareCapabilities().then((caps) => {
      setHardwareCaps(caps);
      if (caps.webgpu.available) {
        addLog('system', `WebGPU hardware adapter initialized: ${caps.webgpu.description || caps.webgpu.adapterName}`);
      }
      if (caps.webcodecs.available) {
        addLog(
          'system',
          `WebCodecs GPU media engine ready (H.264: ${caps.webcodecs.hwH264 ? 'Hardware' : 'No'}, HEVC: ${caps.webcodecs.hwHEVC ? 'Hardware' : 'No'})`
        );
      }
    });
  }, [addLog]);

  // Safely revoke object URLs to prevent browser/WebKit disk cache & System Data growth
  const revokeActiveUrl = useCallback(() => {
    if (activeOutputUrlRef.current) {
      try {
        URL.revokeObjectURL(activeOutputUrlRef.current);
      } catch {}
      activeOutputUrlRef.current = null;
    }
  }, []);

  const purgeAllCaches = useCallback(async () => {
    // 1. Revoke active object URL
    revokeActiveUrl();

    // 2. Unload hardware decoders on any active video/audio elements in DOM
    if (typeof document !== 'undefined') {
      document.querySelectorAll('video, audio').forEach((el) => {
        try {
          (el as HTMLMediaElement).pause();
          el.removeAttribute('src');
          (el as HTMLMediaElement).load();
        } catch {}
      });
    }

    // 3. Unlink any lingering files in MEMFS
    if (ffmpegRef.current) {
      try {
        const active = activeVirtualFiles.current;
        if (active.inName) await ffmpegRef.current.deleteFile(active.inName).catch(() => {});
        if (active.outName) await ffmpegRef.current.deleteFile(active.outName).catch(() => {});
        activeVirtualFiles.current = {};
      } catch {}
    }

    // 4. Preserve all persistent WebAssembly engine & PWA offline caches
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const preservedCaches = new Set([
          WASM_ENGINE_CACHE_NAME,
          WASM_RUNTIME_CACHE_NAME,
          ARCHIVE_RUNTIME_CACHE_NAME,
          'local-assets-cache',
        ]);
        const keys = await window.caches.keys();
        for (const key of keys) {
          if (
            !preservedCaches.has(key) &&
            !key.startsWith('workbox-') &&
            !key.includes('wasm')
          ) {
            await window.caches.delete(key);
          }
        }
      } catch {}
    }

    setIsPurged(true);
    addLog('system', 'Cleared temporary media buffers from memory.');
  }, [addLog, revokeActiveUrl]);

  // Initialize FFmpeg WebAssembly core on-demand
  const initEngine = async (): Promise<boolean> => {
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      setEngineReady(true);
      return true;
    }

    setEngineLoading(true);
    setEngineError(null);
    addLog('system', 'Bootstrapping FFmpeg WebAssembly Core v0.12...');

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ type, message }) => {
        addLog(type || 'stderr', message);

        // Feed into probe log buffer during file inspection
        if (probeLogsBuffer.current) {
          probeLogsBuffer.current.push(message);
        }

        // Live speed / frame parsing from ffmpeg stderr
        if (message.includes('frame=') || message.includes('fps=') || message.includes('size=')) {
          const fpsMatch = message.match(/fps=\s*([\d.]+)/);
          const speedMatch = message.match(/speed=\s*([\d.x]+)/);
          const timeMatch = message.match(/time=\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);

          if (fpsMatch || speedMatch || timeMatch) {
            setTelemetry((prev) => {
              let curTime = prev.currentTime;
              if (timeMatch) {
                const h = parseFloat(timeMatch[1]);
                const m = parseFloat(timeMatch[2]);
                const s = parseFloat(timeMatch[3]);
                curTime = h * 3600 + m * 60 + s;
              }

              const dur = sourceMetaRef.current?.duration || prev.duration || 0;
              let calcPercent = prev.percent;
              let eta = prev.etaSeconds;

              if (dur > 0 && curTime > 0) {
                calcPercent = Math.min(99.5, Math.max(prev.percent, (curTime / dur) * 100));
                if (speedMatch) {
                  const spNum = parseFloat(speedMatch[1].replace('x', ''));
                  if (spNum > 0 && dur > curTime) {
                    eta = Math.max(0, Math.round((dur - curTime) / spNum));
                  }
                }
              }

              return {
                ...prev,
                duration: dur > 0 ? dur : prev.duration,
                fps: fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : prev.fps,
                speed: speedMatch ? speedMatch[1] : prev.speed,
                currentTime: curTime,
                percent: calcPercent,
                etaSeconds: eta,
              };
            });
          }
        }
      });

      ffmpeg.on('progress', ({ progress, time }) => {
        const rawPercent = progress > 1 ? progress : progress * 100;
        const now = Date.now();
        const elapsed = now - startTimeRef.current;
        const curSec = time > 0 ? time / 1000000 : 0;

        setTelemetry((prev) => {
          const dur = sourceMetaRef.current?.duration || prev.duration || 0;
          let newPercent = Math.max(prev.percent, rawPercent > 0 ? Math.min(99.5, rawPercent) : 0);
          if (dur > 0 && curSec > 0) {
            newPercent = Math.min(99.5, Math.max(newPercent, (curSec / dur) * 100));
          }

          let eta = prev.etaSeconds;
          if (newPercent > 2 && elapsed > 1000) {
            const totalEst = elapsed / (newPercent / 100);
            eta = Math.max(0, Math.round((totalEst - elapsed) / 1000));
          }

          return {
            ...prev,
            duration: dur > 0 ? dur : prev.duration,
            percent: newPercent,
            elapsedMs: elapsed,
            etaSeconds: eta,
            currentTime: curSec > 0 ? curSec : prev.currentTime,
          };
        });
      });

      const dev = detectDeviceCapabilities();
      const hasSAB = typeof SharedArrayBuffer !== 'undefined' && (typeof window !== 'undefined' && (window as any).crossOriginIsolated);
      addLog('system', `Detected hardware: ${dev.chipLabel} (${dev.cores} concurrent threads, Cross-Origin Isolation: ${hasSAB ? 'Active' : 'Standby'}).`);
      addLog('system', 'Loading self-contained in-app FFmpeg binaries (zero internet connection required)...');

      // On Android Snapdragon & MediaTek phones, SharedArrayBuffer pthread pools (core-mt) frequently trigger
      // 32-bit/LMKD memory exhaustion or Big.LITTLE Atomics stalls while providing 0x benefit to stream-copy remuxing.
      // Prefer the low-memory single-threaded I/O worker on Android for rock-solid remuxing.
      const preferAndroidSafeSingleThread = dev.isAndroid;
      if (preferAndroidSafeSingleThread && hasSAB) {
        addLog(
          'system',
          `Android SoC safeguard (${dev.chipLabel}): using low-memory single-thread I/O core for stable multi-GB remuxing.`
        );
      }

      let mtLoaded = false;
      if (hasSAB && !preferAndroidSafeSingleThread) {
        try {
          addLog('system', `Mounting local multi-threaded engine for all ${dev.cores} hardware CPU cores...`);
          // Resolve local in-app URLs served directly from the app
          const corePath = new URL('/ffmpeg/core-mt/ffmpeg-core.js', window.location.href).href;
          const wasmPath = new URL('/ffmpeg/core-mt/ffmpeg-core.wasm', window.location.href).href;
          const workerPath = new URL('/ffmpeg/core-mt/ffmpeg-core.worker.js', window.location.href).href;

          // Load from persistent browser cache (or download and cache permanently for offline reuse)
          const [coreRes, wasmRes, workerRes] = await Promise.all([
            getCachedWasmBlobURL(corePath, 'text/javascript', coreMTURL),
            getCachedWasmBlobURL(wasmPath, 'application/wasm', wasmMTURL),
            getCachedWasmBlobURL(workerPath, 'text/javascript', workerMTURL),
          ]);

          if (coreRes.fromCache && wasmRes.fromCache) {
            const cachedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
            const srcLabel = coreRes.source === 'cache-storage' ? 'Cache Storage' : coreRes.source === 'indexeddb' ? 'IndexedDB cache' : 'persistent cache';
            addLog('system', `WebAssembly multi-threaded core loaded directly from ${srcLabel} (${cachedMB} MB, zero network transfer).`);
          } else {
            const storedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
            addLog('system', `WebAssembly multi-threaded core cached in persistent storage (${storedMB} MB).`);
          }

          await ffmpeg.load({
            coreURL: coreRes.blobUrl,
            wasmURL: wasmRes.blobUrl,
            workerURL: workerRes.blobUrl,
            classWorkerURL: workerURL,
          });
          mtLoaded = true;
          addLog('system', `Multi-threaded engine ready (${dev.cores} threads).`);
        } catch (mtErr: any) {
          console.warn('Local multi-threaded core load skipped, falling back to local standard core:', mtErr);
          addLog('system', `Falling back to single-threaded engine: ${mtErr?.message || 'sandbox fallback'}.`);
        }
      }

      if (!mtLoaded) {
        addLog('system', 'Loading single-threaded engine...');
        const corePath = new URL('/ffmpeg/core/ffmpeg-core.js', window.location.href).href;
        const wasmPath = new URL('/ffmpeg/core/ffmpeg-core.wasm', window.location.href).href;

        const [coreRes, wasmRes] = await Promise.all([
          getCachedWasmBlobURL(corePath, 'text/javascript', coreURL),
          getCachedWasmBlobURL(wasmPath, 'application/wasm', wasmURL),
        ]);

        if (coreRes.fromCache && wasmRes.fromCache) {
          const cachedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
          const srcLabel = coreRes.source === 'cache-storage' ? 'Cache Storage' : coreRes.source === 'indexeddb' ? 'IndexedDB' : 'cache';
          addLog('system', `Engine loaded from ${srcLabel} (${cachedMB} MB).`);
        } else {
          const storedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
          addLog('system', `Engine cached locally (${storedMB} MB).`);
        }

        await ffmpeg.load({
          coreURL: coreRes.blobUrl,
          wasmURL: wasmRes.blobUrl,
          classWorkerURL: workerURL,
        });
        addLog('system', 'FFmpeg engine ready.');
      }
      setEngineReady(true);
      return true;
    } catch (err: any) {
      console.error('FFmpeg load error:', err);
      const msg = err?.message || 'Failed to initialize media engine.';
      setEngineError(msg);
      addLog('error', `Engine init failure: ${msg}`);
      return false;
    } finally {
      setEngineLoading(false);
    }
  };

  useEffect(() => {
    preloadAllEnginesToIDB().catch(() => {});

    return () => {
      revokeActiveUrl();
    };
  }, [revokeActiveUrl]);

  // Inspect source media file immediately upon selection
  const handleFileSelected = async (file: File) => {
    revokeActiveUrl();
    setIsPurged(false);
    setRawFile(file);
    setResult(null);
    setConversionError(null);
    setConversionDiagnostic(null);
    setIsProbing(true);

    const detectedExt = await detectFileExtensionFromMagicBytes(file);
    const ext = detectedExt || getFileExtension(file.name);
    const isAudioOnly = AUDIO_EXTENSIONS.includes(ext) || (file.type ? file.type.startsWith('audio/') : false);

    addLog(
      'system',
      `Loaded source file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB${ext ? `, container ${ext}` : ''})`
    );

    // 1. Initial fast probe (4 MB binary slice for >150 MB files, HTML5 metadata for small files)
    const htmlMeta = await probeMediaElement(file);

    let initialMeta: SourceMetadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'media/unknown',
      extension: ext || (isAudioOnly ? '.mp3' : ''),
      duration: htmlMeta.duration,
      width: htmlMeta.width,
      height: htmlMeta.height,
      videoCodec: htmlMeta.videoCodec,
      audioCodec: htmlMeta.audioCodec,
      bitrate: htmlMeta.bitrate,
      is4K: htmlMeta.is4K,
      isHighBitrate: htmlMeta.isHighBitrate,
      hasVideo: isAudioOnly ? false : (htmlMeta.hasVideo ?? true),
      hasAudio: htmlMeta.hasAudio ?? true,
    };

    setSourceMeta(initialMeta);

    if (isAudioOnly) {
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'audio',
        container: 'mp3',
        audioCodec: 'libmp3lame',
        selectedVideoTrackIndices: undefined,
        selectedAudioTrackIndices: [0],
        selectedSubtitleTrackIndices: [],
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'copy',
        audioCodec: 'copy',
        conditionalAudioTranscode: true,
        subtitleMode: 'convert',
        preserveMetadataTags: true,
        speedPreset: 'ultrafast',
        fastStart: true,
        selectedVideoTrackIndices: undefined,
        selectedAudioTrackIndices: undefined,
        selectedSubtitleTrackIndices: undefined,
      }));
    }

    // 2. Ensure FFmpeg worker engine is loaded so we can run full container stream inspection (-i) before conversion
    if (!ffmpegRef.current || !ffmpegRef.current.loaded) {
      await initEngine();
    }

    // 3. Comprehensive stream inspection via FFmpeg WORKERFS (0 MB RAM zero-copy mount)
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      const probeMountDir = `/probe_mnt_${Date.now()}`;
      const tempFileName = `probe${ext || '.media'}`;
      const probeVirtualPath = `${probeMountDir}/${tempFileName}`;
      try {
        probeLogsBuffer.current = [];
        addLog('system', `Probing all container tracks for ${file.name} via zero-copy WORKERFS...`);

        await ffmpegRef.current.createDir(probeMountDir);
        const mounted = await ffmpegRef.current.mount(
          'WORKERFS' as any,
          { blobs: [{ name: tempFileName, data: file }] },
          probeMountDir
        );

        if (mounted) {
          // Fast header-only probe via buffered WORKERFS (0 MB RAM, bounded probesize for instant multi-GB inspection)
          await ffmpegRef.current.exec([
            '-hide_banner',
            '-nostdin',
            '-probesize',
            '4M',
            '-analyzeduration',
            '2000000',
            '-i',
            probeVirtualPath,
          ]);
        }

        const parsed = parseFFmpegProbeLogs(probeLogsBuffer.current);

        setSourceMeta((prev) => {
          if (!prev) return null;
          const hasV = parsed.hasVideo ?? prev.hasVideo;
          const hasA = parsed.hasAudio ?? prev.hasAudio;
          return {
            ...prev,
            duration: parsed.duration || prev.duration,
            width: parsed.width || prev.width,
            height: parsed.height || prev.height,
            fps: parsed.fps || prev.fps,
            videoCodec: parsed.videoCodec || prev.videoCodec,
            audioCodec: parsed.audioCodec || prev.audioCodec,
            audioSampleRate: parsed.audioSampleRate || prev.audioSampleRate,
            audioChannels: parsed.audioChannels || prev.audioChannels,
            bitrate: parsed.bitrate || prev.bitrate,
            pixelFormat: parsed.pixelFormat || prev.pixelFormat,
            is10Bit: parsed.is10Bit ?? prev.is10Bit,
            is4K: parsed.is4K ?? prev.is4K,
            isHighBitrate: parsed.isHighBitrate ?? prev.isHighBitrate,
            parsedStreams: parsed.parsedStreams || prev.parsedStreams,
            videoTracks: parsed.videoTracks || prev.videoTracks,
            audioTracks: parsed.audioTracks || prev.audioTracks,
            subtitleTracks: parsed.subtitleTracks || prev.subtitleTracks,
            chapters: parsed.chapters || prev.chapters,
            attachments: parsed.attachments || prev.attachments,
            hasVideo: hasV,
            hasAudio: hasA,
          };
        });

        const vTracks = parsed.videoTracks || [];
        const aTracks = parsed.audioTracks || [];
        const sTracks = parsed.subtitleTracks || [];

        // If deep probe determined it has no video and only audio, adjust to audio
        if (!parsed.hasVideo && parsed.hasAudio) {
          setConfig((prev) => ({
            ...prev,
            targetCategory: 'audio',
            container: prev.targetCategory === 'audio' ? prev.container : 'mp3',
            audioCodec: prev.targetCategory === 'audio' ? prev.audioCodec : 'libmp3lame',
            selectedAudioTrackIndices: aTracks.length > 0 ? [aTracks[0].typeIndex] : [0],
          }));
          addLog('system', 'Detected audio-only stream layout. Configured target for audio export.');
        } else if (parsed.hasVideo) {
          const srcVid = (parsed.videoCodec || '').toLowerCase();
          const isRemuxSafe = ['h264', 'avc1', 'hevc', 'h265', 'hvc1', 'hev1', 'mpeg4', 'av1', 'av01'].some((c) =>
            srcVid.includes(c)
          );

          // Pre-select first video track, all audio tracks, and all text subtitle tracks
          const defaultVideoIndices = vTracks.length > 0 ? [vTracks[0].typeIndex] : [0];
          const defaultAudioIndices = aTracks.map((a) => a.typeIndex);
          const defaultSubIndices = sTracks
            .filter((s) => s.formatType === 'text')
            .map((s) => s.typeIndex);

          if (isRemuxSafe) {
            setConfig((prev) => ({
              ...prev,
              videoCodec: 'copy',
              audioCodec: 'copy',
              conditionalAudioTranscode: true,
              subtitleMode: 'convert',
              preserveMetadataTags: true,
              fastStart: true,
              selectedVideoTrackIndices: defaultVideoIndices,
              selectedAudioTrackIndices: defaultAudioIndices,
              selectedSubtitleTrackIndices: defaultSubIndices,
              hardwareAcceleration: true,
              hardwareEngine: 'stream-copy',
            }));
            addLog(
              'system',
              `Probed ${vTracks.length} video, ${aTracks.length} audio, ${sTracks.length} subtitle tracks. Smart Stream-Copy Remux ready.`
            );
          } else {
            // Source requires transcoding (e.g. WMV, VP8, VP9 in MP4)
            setConfig((prev) => ({
              ...prev,
              videoCodec: 'libx264',
              audioCodec: 'aac',
              speedPreset: 'ultrafast',
              subtitleMode: 'convert',
              preserveMetadataTags: true,
              fastStart: true,
              selectedVideoTrackIndices: defaultVideoIndices,
              selectedAudioTrackIndices: defaultAudioIndices,
              selectedSubtitleTrackIndices: defaultSubIndices,
              hardwareAcceleration: true,
              hardwareEngine: 'webgpu',
            }));
            addLog(
              'system',
              `Source codec ${parsed.videoCodec || 'unknown'} requires re-encoding for MP4. Configured H.264 + AAC preset.`
            );
          }
        }

        addLog('system', 'Stream layout inspection complete.');
      } catch {
        // Handled silently since FFmpeg -i exits with code 1 when no output file is specified
      } finally {
        try {
          await ffmpegRef.current.unmount(probeMountDir);
        } catch {}
        try {
          await ffmpegRef.current.deleteDir(probeMountDir);
        } catch {}
      }
    }

    setIsProbing(false);
  };

  // Extract a specific text subtitle track as a standalone .SRT file via zero-copy WORKERFS
  const handleExtractSubtitleSrt = async (track: SubtitleTrackInfo) => {
    if (!rawFile || !sourceMeta) return;
    setExtractingSubtitleIndex(track.typeIndex);

    if (!ffmpegRef.current || !ffmpegRef.current.loaded) {
      const ok = await initEngine();
      if (!ok || !ffmpegRef.current) {
        setExtractingSubtitleIndex(null);
        return;
      }
    }

    const ffmpeg = ffmpegRef.current;
    const extIn = sourceMeta.extension || '.mkv';
    const subMountDir = `/sub_mnt_${Date.now()}`;
    const inFileName = `sub_src_${Date.now()}${extIn}`;
    const virtualIn = `${subMountDir}/${inFileName}`;
    const baseName = sourceMeta.name.replace(/\.[^/.]+$/, '');
    const langSuffix = track.language ? `.${track.language}` : `.track${track.typeIndex}`;
    const outSrtName = `${baseName}${langSuffix}.srt`;
    const virtualOutSrt = `extracted_${Date.now()}.srt`;

    try {
      addLog('system', `Extracting subtitle track #0:s:${track.typeIndex} (${track.codec.toUpperCase()}) to ${outSrtName}...`);
      await ffmpeg.createDir(subMountDir);
      await ffmpeg.mount(
        'WORKERFS' as any,
        { blobs: [{ name: inFileName, data: rawFile }] },
        subMountDir
      );

      const code = await ffmpeg.exec([
        '-threads',
        '0',
        '-i',
        virtualIn,
        '-map',
        `0:s:${track.typeIndex}`,
        '-c:s',
        'srt',
        virtualOutSrt,
      ]);

      if (code === 0) {
        const res = await ffmpeg.readFile(virtualOutSrt, 'blob:text/plain;charset=utf-8' as any);
        const srtBlob =
          res instanceof Blob
            ? res
            : new Blob([res as Uint8Array], { type: 'text/plain;charset=utf-8' });
        const srtUrl = URL.createObjectURL(srtBlob);
        const a = document.createElement('a');
        a.href = srtUrl;
        a.download = outSrtName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
          try {
            URL.revokeObjectURL(srtUrl);
          } catch {}
        }, 10000);
        addLog('system', `Exported standalone subtitle file: ${outSrtName} (${(srtBlob.size / 1024).toFixed(1)} KB).`);
      } else {
        addLog('error', `Could not convert subtitle track #0:s:${track.typeIndex} to .SRT (exit code ${code}).`);
      }
    } catch (err: any) {
      addLog('error', `Subtitle extraction error: ${err?.message || 'Failed'}`);
    } finally {
      try {
        await ffmpeg.deleteFile(virtualOutSrt);
      } catch {}
      try {
        await ffmpeg.unmount(subMountDir);
      } catch {}
      try {
        await ffmpeg.deleteDir(subMountDir);
      } catch {}
      setExtractingSubtitleIndex(null);
    }
  };

  const handleClearFile = () => {
    revokeActiveUrl();
    setIsPurged(false);
    setRawFile(null);
    setSourceMeta(null);
    setResult(null);
    setConversionError(null);
    setConversionDiagnostic(null);
    setTelemetry({
      percent: 0,
      currentTime: 0,
      duration: 0,
      fps: 0,
      speed: '',
      elapsedMs: 0,
      etaSeconds: null,
    });
  };

  // Convert execution
  const handleStartConversion = async () => {
    if (!rawFile || !sourceMeta) return;

    // Safety validation
    const compat = checkCompatibility(sourceMeta, config);
    if (!compat.isCompatible && compat.warning?.includes('does not contain an audio track')) {
      setConversionError(compat.warning);
      return;
    }

    revokeActiveUrl();
    setIsPurged(false);
    setIsConverting(true);
    setConversionError(null);
    setConversionDiagnostic(null);
    setResult(null);

    // On-demand engine initialization if not yet mounted
    if (!ffmpegRef.current || !engineReady) {
      addLog('system', 'Initializing local conversion engine...');
      const ready = await initEngine();
      if (!ready || !ffmpegRef.current) {
        setIsConverting(false);
        setConversionError('Could not initialize media conversion engine. Please check system console.');
        return;
      }
    }

    // Acquire Screen Wake Lock so display/thread does not sleep during active encode
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = lock;
      } catch (wakeErr) {
        console.warn('Wake Lock request skipped:', wakeErr);
      }
    }

    startTimeRef.current = Date.now();
    setTelemetry({
      percent: 0,
      currentTime: 0,
      duration: sourceMeta.duration || 0,
      fps: 0,
      speed: '',
      elapsedMs: 0,
      etaSeconds: null,
    });

    const extIn = sourceMeta.extension || '';
    const extOut = getRecommendedExtension(config.container);
    const inputMountDir = `/in_mnt_${Date.now()}`;
    const inputFileName = `input_${Date.now()}${extIn}`;
    let virtualIn = `${inputMountDir}/${inputFileName}`;
    const virtualOut = `output_${Date.now()}${extOut}`;
    activeVirtualFiles.current = {
      inMountDir: inputMountDir,
      inName: virtualIn,
      outName: virtualOut,
    };

    const fileSizeMB = (rawFile.size / 1024 / 1024).toFixed(1);
    addLog('system', `Mounting ${rawFile.name} (${fileSizeMB} MB) via zero-copy WORKERFS stream (${virtualIn})...`);

    try {
      const ffmpeg = ffmpegRef.current;

      // 1. Mount input file zero-copy via WORKERFS (0 MB RAM used, streams directly from disk via FileReaderSync)
      await ffmpeg.createDir(inputMountDir);
      const isMounted = await ffmpeg.mount(
        'WORKERFS' as any,
        { blobs: [{ name: inputFileName, data: rawFile }] },
        inputMountDir
      );

      if (!isMounted) {
        // Fallback only if WORKERFS was unavailable
        virtualIn = inputFileName;
        activeVirtualFiles.current = { inName: virtualIn, outName: virtualOut };
        await ffmpeg.writeFile(virtualIn, await fetchFile(rawFile));
      }

      // 2. If stream codecs haven't been probed yet, run a fast header probe on virtualIn (0 MB RAM via WORKERFS)
      let effectiveMeta: SourceMetadata = sourceMeta;
      if (!effectiveMeta.videoCodec && !effectiveMeta.audioCodec) {
        try {
          probeLogsBuffer.current = [];
          await ffmpeg.exec([
            '-hide_banner',
            '-nostdin',
            '-probesize',
            '4M',
            '-analyzeduration',
            '2000000',
            '-i',
            virtualIn,
          ]);
          const parsed = parseFFmpegProbeLogs(probeLogsBuffer.current);
          effectiveMeta = {
            ...effectiveMeta,
            duration: parsed.duration || effectiveMeta.duration,
            width: parsed.width || effectiveMeta.width,
            height: parsed.height || effectiveMeta.height,
            fps: parsed.fps || effectiveMeta.fps,
            videoCodec: parsed.videoCodec || effectiveMeta.videoCodec,
            audioCodec: parsed.audioCodec || effectiveMeta.audioCodec,
            audioSampleRate: parsed.audioSampleRate || effectiveMeta.audioSampleRate,
            audioChannels: parsed.audioChannels || effectiveMeta.audioChannels,
            bitrate: parsed.bitrate || effectiveMeta.bitrate,
            pixelFormat: parsed.pixelFormat || effectiveMeta.pixelFormat,
            is10Bit: parsed.is10Bit ?? effectiveMeta.is10Bit,
            is4K: parsed.is4K ?? effectiveMeta.is4K,
            isHighBitrate: parsed.isHighBitrate ?? effectiveMeta.isHighBitrate,
            parsedStreams: parsed.parsedStreams || effectiveMeta.parsedStreams,
            videoTracks: parsed.videoTracks || effectiveMeta.videoTracks,
            audioTracks: parsed.audioTracks || effectiveMeta.audioTracks,
            subtitleTracks: parsed.subtitleTracks || effectiveMeta.subtitleTracks,
            chapters: parsed.chapters || effectiveMeta.chapters,
            attachments: parsed.attachments || effectiveMeta.attachments,
            hasVideo: parsed.hasVideo ?? effectiveMeta.hasVideo,
            hasAudio: parsed.hasAudio ?? effectiveMeta.hasAudio,
          };
          setSourceMeta(effectiveMeta);
        } catch {}
      }

      const isMp4OrMov = config.container === 'mp4' || config.container === 'mov';
      const useZeroCopyFastStart = isMp4OrMov && config.fastStart !== false;
      const execBuildOptions = { deferFastStartToWorker: useZeroCopyFastStart };

      // Helper to export output file as a disk/paged Blob (with instant zero-copy faststart when enabled)
      const readOutputAsBlob = async (
        outPath: string,
        mime: string,
        applyFastStart = false
      ): Promise<Blob> => {
        const enc = applyFastStart ? `blob+faststart:${mime}` : `blob:${mime}`;
        const res = await ffmpeg.readFile(outPath, enc as any);
        if (res instanceof Blob) {
          return res;
        }
        return new Blob([res as Uint8Array], { type: mime });
      };

      // Pipeline selection:
      const devCaps = detectDeviceCapabilities();
      // Paged 4 MB StreamTarget allows large mobile files to compress safely in hardware GPU mode
      const hwMaxBytes = devCaps.isAndroid ? 600 * 1024 * 1024 : 1500 * 1024 * 1024;
      const isVideoTarget = config.targetCategory === 'video' && config.container !== 'gif';
      const isCopy = isVideoTarget && config.videoCodec === 'copy';
      const isHwContainer = config.container === 'mp4' || config.container === 'mov';
      const canHardwareWebCodecs =
        rawFile.size <= hwMaxBytes &&
        isVideoTarget &&
        !isCopy &&
        isHwContainer &&
        config.hardwareAcceleration !== false &&
        config.hardwareEngine !== 'cpu' &&
        Boolean(
          hardwareCaps?.webcodecs.hwH264 ||
            hardwareCaps?.webcodecs.hwHEVC ||
            hardwareCaps?.webcodecs.available
        );

      let outputBlob: Blob | null = null;
      let executedCommand: string[] = [];

      if (isCopy) {
        // DIRECT STREAM COPY (Single-pass buffered I/O + zero-copy fast-start)
        setTelemetry((prev) => ({
          ...prev,
          accelerationMode: devCaps.isAndroid
            ? `Direct Stream Copy (${devCaps.chipLabel})`
            : 'Direct Stream Copy (Single-Pass Zero-Copy)',
        }));
        addLog('system', 'Single-pass direct stream copy enabled (buffered 4-8 MB I/O + zero-copy fast-start).');
        probeLogsBuffer.current = [];
        executedCommand = buildFFmpegArgs(virtualIn, virtualOut, config, effectiveMeta, execBuildOptions);
        addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);

        let returnCode = await ffmpeg.exec(executedCommand);

        // Fallback 0a: If MPEG-TS/FLV/MKV AAC ADTS bitstream filter is required for MP4/MOV
        const recentErrLog = probeLogsBuffer.current.slice(-40).join('\n').toLowerCase();
        if (
          returnCode !== 0 &&
          (config.container === 'mp4' || config.container === 'mov') &&
          !executedCommand.includes('aac_adtstoasc') &&
          (recentErrLog.includes('aac_adtstoasc') || recentErrLog.includes('malformed aac'))
        ) {
          addLog('system', 'Detected raw ADTS AAC stream. Applying -bsf:a aac_adtstoasc bitstream filter for MP4...');
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          const bsfCmd = [
            ...executedCommand.slice(0, -1),
            '-bsf:a',
            'aac_adtstoasc',
            executedCommand[executedCommand.length - 1],
          ];
          executedCommand = bsfCmd;
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          returnCode = await ffmpeg.exec(executedCommand);
        }

        // Fallback 0b: If MP4/MOV subtitle conversion (mov_text) caused mux failure, retry stream copy without subtitles
        if (
          returnCode !== 0 &&
          config.subtitleMode !== 'drop' &&
          (effectiveMeta.subtitleTracks?.length || 0) > 0
        ) {
          addLog(
            'system',
            `Subtitle stream incompatible with .${config.container} remux. Retrying lossless video+audio copy with subtitles omitted (-sn)...`
          );
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          probeLogsBuffer.current = [];
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            { ...config, subtitleMode: 'drop', selectedSubtitleTrackIndices: [] },
            effectiveMeta,
            execBuildOptions
          );
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          returnCode = await ffmpeg.exec(executedCommand);
        }

        // Fallback 0c: If an explicit -map specifier failed to resolve, retry with safe auto stream mapping
        const mapErrLog = probeLogsBuffer.current.slice(-40).join('\n').toLowerCase();
        if (returnCode !== 0 && mapErrLog.includes('matches no streams')) {
          addLog('system', 'Explicit track index mismatch detected; retrying with container auto stream mapping...');
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          probeLogsBuffer.current = [];
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            {
              ...config,
              selectedVideoTrackIndices: undefined,
              selectedAudioTrackIndices: undefined,
              selectedSubtitleTrackIndices: [],
              subtitleMode: 'drop',
            },
            {
              ...effectiveMeta,
              videoTracks: undefined,
              audioTracks: undefined,
              subtitleTracks: undefined,
            },
            execBuildOptions
          );
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          returnCode = await ffmpeg.exec(executedCommand);
        }

        // Fallback A: If direct stream copy failed and audio was 'copy', transcode audio to AAC/Opus while keeping video stream copy
        if (returnCode !== 0 && config.audioCodec === 'copy' && effectiveMeta.hasAudio) {
          const fallbackAudioCodec = config.container === 'webm' ? 'libopus' : 'aac';
          addLog(
            'system',
            `Audio stream copy incompatible with .${config.container}. Retrying with video stream copy + ${fallbackAudioCodec.toUpperCase()} audio encode...`
          );
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            { ...config, audioCodec: fallbackAudioCodec, audioBitrate: '192k' },
            effectiveMeta,
            execBuildOptions
          );
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          returnCode = await ffmpeg.exec(executedCommand);
        }

        // Fallback B: If stream copy still failed (e.g. VP8/VP9/WMV video inside MP4), automatically transcode video + audio
        if (returnCode !== 0) {
          const fallbackVideoCodec = config.container === 'webm' ? 'libvpx-vp9' : 'libx264';
          const fallbackAudioCodec =
            config.audioCodec === 'none'
              ? 'none'
              : config.container === 'webm'
              ? 'libopus'
              : 'aac';
          addLog(
            'system',
            `Source video codec (${effectiveMeta.videoCodec || 'stream'}) cannot be stream-copied into .${config.container}. Automatically transcoding with ${fallbackVideoCodec}...`
          );
          setTelemetry((prev) => ({
            ...prev,
            accelerationMode: 'Auto-Transcode Fallback (CPU Wasm)',
          }));
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            {
              ...config,
              videoCodec: fallbackVideoCodec,
              audioCodec: fallbackAudioCodec,
              speedPreset: 'ultrafast',
            },
            effectiveMeta,
            execBuildOptions
          );
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          returnCode = await ffmpeg.exec(executedCommand);
        }

        if (returnCode !== 0) {
          throw new Error(
            `Conversion exited with code ${returnCode}. Check console logs for stream details.`
          );
        }

        const mimeType = getMimeType(config.container);
        outputBlob = await readOutputAsBlob(virtualOut, mimeType, useZeroCopyFastStart);
      } else if (canHardwareWebCodecs) {
        // HARDWARE GPU VIDEO COMPRESSION (WebCodecs VideoEncoder + prefer-hardware)
        const preferredHwCodec: 'avc' | 'hevc' =
          config.videoCodec === 'libx265' ? 'hevc' : 'avc';
        const gpuEngineLabel = devCaps.isAndroid
          ? `Hardware GPU (${devCaps.chipLabel})`
          : hardwareCaps?.webgpu.description &&
            hardwareCaps.webgpu.description !== 'WebGPU Not Supported'
          ? `Hardware GPU (${hardwareCaps.webgpu.description})`
          : 'Hardware GPU Media Engine';

        setTelemetry((prev) => ({
          ...prev,
          accelerationMode: gpuEngineLabel,
        }));
        addLog('system', `Initializing hardware GPU compression pipeline (${gpuEngineLabel})...`);

        let sourceBlobForHw: Blob = rawFile;
        const lowerExtIn = extIn.toLowerCase();
        if (['.mkv', '.avi', '.flv', '.ts', '.m2ts', '.mts'].includes(lowerExtIn)) {
          addLog('system', 'Pre-flight stream remuxing for hardware video decoder...');
          const tempRemuxOut = `temp_hw_remux_${Date.now()}.mp4`;
          const remuxArgs = [
            '-hide_banner',
            '-nostdin',
            '-threads',
            '1',
            '-fflags',
            '+genpts',
            '-i',
            virtualIn,
            '-c:v',
            'copy',
            '-an',
            '-sn',
            '-dn',
            tempRemuxOut,
          ];
          const remuxCode = await ffmpeg.exec(remuxArgs);
          if (remuxCode === 0) {
            sourceBlobForHw = await readOutputAsBlob(tempRemuxOut, 'video/mp4', true);
            try { await ffmpeg.deleteFile(tempRemuxOut); } catch {}
          }
        }

        try {
          hwAbortController.current = new AbortController();
          const bitrateBps = computeTargetVideoBitrateBps(effectiveMeta, config);
          const targetFramerate =
            config.framerate !== 'source'
              ? Number(config.framerate)
              : effectiveMeta.fps && effectiveMeta.fps >= 15 && effectiveMeta.fps <= 60
              ? Math.round(effectiveMeta.fps)
              : 30;

          // Determine selected audio and text subtitle tracks to mux after hardware video compression
          const probedAudioSet = new Set((effectiveMeta.audioTracks || []).map((a) => a.typeIndex));
          const rawAudioIndices =
            config.audioCodec === 'none' || !effectiveMeta.hasAudio
              ? []
              : config.selectedAudioTrackIndices !== undefined
              ? config.selectedAudioTrackIndices
              : effectiveMeta.audioTracks && effectiveMeta.audioTracks.length > 0
              ? effectiveMeta.audioTracks.map((a) => a.typeIndex)
              : [0];
          const validAudioIndices =
            probedAudioSet.size > 0
              ? rawAudioIndices.filter((idx) => probedAudioSet.has(idx))
              : rawAudioIndices;

          const validTextSubtitles =
            config.subtitleMode === 'drop'
              ? []
              : (effectiveMeta.subtitleTracks || []).filter((s) => {
                  if (s.formatType !== 'text') return false;
                  if (config.selectedSubtitleTrackIndices !== undefined) {
                    return config.selectedSubtitleTrackIndices.includes(s.typeIndex);
                  }
                  return true;
                });

          const needsFinalMux =
            validAudioIndices.length > 0 ||
            validTextSubtitles.length > 0 ||
            config.container === 'mov';

          addLog(
            'system',
            `Hardware GPU target: ${config.resolution === 'source' ? 'Original resolution' : config.resolution} @ ${(
              bitrateBps / 1_000_000
            ).toFixed(2)} Mbps (${preferredHwCodec === 'hevc' ? 'HEVC / H.265' : 'H.264 / AVC'}, ${targetFramerate} fps).`
          );

          const hwResult = await transcodeWithHardwareWebCodecs(sourceBlobForHw, {
            resolution: config.resolution,
            bitrate: bitrateBps,
            framerate: targetFramerate,
            preferredCodec: preferredHwCodec,
            fastStart: !needsFinalMux && useZeroCopyFastStart,
            webgpuFilter: config.webgpuFilter,
            signal: hwAbortController.current.signal,
            onProgress: (p) => {
              const now = Date.now();
              const elapsed = now - startTimeRef.current;
              const remainingSec =
                p.percent > 1 ? (elapsed / (p.percent / 100) - elapsed) / 1000 : null;
              setTelemetry({
                percent: needsFinalMux ? Math.min(94, p.percent * 0.94) : p.percent,
                currentTime: p.currentTime,
                duration: p.duration,
                fps: p.fps,
                speed: `${p.fps} fps (GPU)`,
                elapsedMs: elapsed,
                etaSeconds:
                  remainingSec !== null ? Math.max(0, Math.round(remainingSec)) : null,
                accelerationMode: gpuEngineLabel,
              });
            },
          });

          const mimeType = getMimeType(config.container);

          if (needsFinalMux) {
            addLog(
              'system',
              `Muxing compressed ${hwResult.isHevc ? 'HEVC' : 'H.264'} video with ${validAudioIndices.length} audio & ${validTextSubtitles.length} subtitle track(s) into .${config.container.toUpperCase()}...`
            );
            const hwMountDir = `/hw_mnt_${Date.now()}`;
            const hwVideoName = `hw_video_${Date.now()}.mp4`;
            const hwVirtualPath = `${hwMountDir}/${hwVideoName}`;
            await ffmpeg.createDir(hwMountDir);
            await ffmpeg.mount(
              'WORKERFS' as any,
              { blobs: [{ name: hwVideoName, data: hwResult.blob }] },
              hwMountDir
            );

            const buildHwMuxArgs = (includeSubtitles: boolean): string[] => {
              const args: string[] = [
                '-hide_banner',
                '-nostdin',
                '-threads',
                '1',
                '-i',
                hwVirtualPath,
                '-i',
                virtualIn,
                '-map',
                '0:v:0',
              ];

              for (const aIdx of validAudioIndices) {
                args.push('-map', `1:a:${aIdx}?`);
              }

              if (includeSubtitles && validTextSubtitles.length > 0) {
                for (const sTrack of validTextSubtitles) {
                  args.push('-map', `1:s:${sTrack.typeIndex}`);
                }
              }

              args.push('-c:v', 'copy');
              if (hwResult.isHevc) {
                args.push('-tag:v', 'hvc1');
              }

              if (validAudioIndices.length === 0) {
                args.push('-an');
              } else if (config.audioCodec === 'copy') {
                const selectedAudioObjs =
                  effectiveMeta.audioTracks?.filter((a) =>
                    validAudioIndices.includes(a.typeIndex)
                  ) || [];
                const allCompatible =
                  selectedAudioObjs.length > 0 &&
                  selectedAudioObjs.every((a) => a.isMp4Compatible);
                if (allCompatible) {
                  args.push('-c:a', 'copy');
                } else {
                  args.push(
                    '-c:a',
                    'aac',
                    '-b:a',
                    config.audioBitrate === 'lossless' ? '192k' : config.audioBitrate
                  );
                }
              } else {
                const safeAudioCodec =
                  config.audioCodec === 'aac' || config.audioCodec === 'libmp3lame'
                    ? config.audioCodec
                    : 'aac';
                args.push(
                  '-c:a',
                  safeAudioCodec,
                  '-b:a',
                  config.audioBitrate === 'lossless' ? '192k' : config.audioBitrate
                );
                if (config.audioChannels === 'mono') args.push('-ac', '1');
                else if (config.audioChannels === 'stereo') args.push('-ac', '2');
                else if (config.audioChannels === '5.1') args.push('-ac', '6');
                if (config.audioSampleRate !== 'source') args.push('-ar', config.audioSampleRate);
              }

              if (includeSubtitles && validTextSubtitles.length > 0) {
                args.push('-c:s', 'mov_text');
              } else {
                args.push('-sn');
              }

              args.push('-dn', '-avoid_negative_ts', 'make_zero', '-max_muxing_queue_size', '4096', '-shortest', virtualOut);
              return args;
            };

            try {
              let muxCode = await ffmpeg.exec(buildHwMuxArgs(true));
              if (muxCode !== 0 && validTextSubtitles.length > 0) {
                try { await ffmpeg.deleteFile(virtualOut); } catch {}
                addLog('system', 'Retrying hardware video + audio mux without incompatible subtitles...');
                muxCode = await ffmpeg.exec(buildHwMuxArgs(false));
              }
              if (muxCode === 0) {
                outputBlob = await readOutputAsBlob(virtualOut, mimeType, useZeroCopyFastStart);
              } else {
                outputBlob = hwResult.blob;
              }
            } finally {
              try { await ffmpeg.unmount(hwMountDir); } catch {}
              try { await ffmpeg.deleteDir(hwMountDir); } catch {}
            }
          } else {
            outputBlob = hwResult.blob;
          }

          executedCommand = [
            'webcodecs-gpu',
            `--codec=${hwResult.codecUsed}`,
            `--resolution=${hwResult.width}x${hwResult.height}`,
            `--bitrate=${Math.round(hwResult.bitrateBps / 1000)}k`,
            '--hardware-acceleration=prefer-hardware',
          ];
          addLog(
            'system',
            `Hardware GPU compression finished (${hwResult.codecUsed}, ${hwResult.width}x${hwResult.height}, ${(
              hwResult.bitrateBps / 1_000_000
            ).toFixed(2)} Mbps).`
          );
        } catch (hwErr: any) {
          if (hwAbortController.current?.signal.aborted) {
            throw hwErr;
          }
          addLog(
            'system',
            `Hardware GPU encoder fallback (${hwErr?.message || 'hardware unavailable'}). Switching to CPU Wasm encoder.`
          );
          setTelemetry((prev) => ({
            ...prev,
            accelerationMode: 'CPU Wasm Fallback',
          }));
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            config,
            effectiveMeta,
            execBuildOptions
          );
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          const returnCode = await ffmpeg.exec(executedCommand);
          if (returnCode !== 0) {
            throw new Error(`FFmpeg conversion returned exit code ${returnCode}.`);
          }
          const mimeType = getMimeType(config.container);
          outputBlob = await readOutputAsBlob(virtualOut, mimeType, useZeroCopyFastStart);
        }
      } else {
        // MULTI-THREADED CPU WASM (Video or Audio conversion)
        setTelemetry((prev) => ({
          ...prev,
          accelerationMode: 'CPU Wasm',
        }));
        probeLogsBuffer.current = [];
        executedCommand = buildFFmpegArgs(virtualIn, virtualOut, config, effectiveMeta, execBuildOptions);
        addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
        let returnCode = await ffmpeg.exec(executedCommand);

        // If explicit -map specifier failed to resolve, retry with safe container auto stream mapping
        const cpuMapErr = probeLogsBuffer.current.slice(-40).join('\n').toLowerCase();
        if (returnCode !== 0 && cpuMapErr.includes('matches no streams')) {
          addLog('system', 'Explicit track index mismatch detected; retrying with container auto stream mapping...');
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          probeLogsBuffer.current = [];
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            {
              ...config,
              selectedVideoTrackIndices: undefined,
              selectedAudioTrackIndices: undefined,
              selectedSubtitleTrackIndices: [],
              subtitleMode: 'drop',
            },
            {
              ...effectiveMeta,
              videoTracks: undefined,
              audioTracks: undefined,
              subtitleTracks: undefined,
            },
            execBuildOptions
          );
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          returnCode = await ffmpeg.exec(executedCommand);
        }

        // If audio stream copy failed during audio extraction or video encode, retry with native container audio codec
        if (returnCode !== 0 && config.audioCodec === 'copy') {
          const fallbackAudio =
            config.container === 'mp3'
              ? 'libmp3lame'
              : config.container === 'ogg' || config.container === 'webm'
              ? 'libopus'
              : config.container === 'wav'
              ? 'pcm_s16le'
              : config.container === 'flac'
              ? 'flac'
              : 'aac';
          addLog('system', `Audio stream copy incompatible with .${config.container}. Retrying with ${fallbackAudio} encoder...`);
          try { await ffmpeg.deleteFile(virtualOut); } catch {}
          executedCommand = buildFFmpegArgs(
            virtualIn,
            virtualOut,
            { ...config, audioCodec: fallbackAudio as any },
            effectiveMeta,
            execBuildOptions
          );
          returnCode = await ffmpeg.exec(executedCommand);
        }

        if (returnCode !== 0) {
          throw new Error(
            `FFmpeg conversion returned exit code ${returnCode}. Check console logs for codec details.`
          );
        }
        const mimeType = getMimeType(config.container);
        outputBlob = await readOutputAsBlob(virtualOut, mimeType, useZeroCopyFastStart);
      }

      // Unmount WORKERFS input stream immediately
      try {
        await ffmpeg.unmount(inputMountDir);
        await ffmpeg.deleteDir(inputMountDir);
        addLog('system', `Unmounted zero-copy input stream ${inputMountDir}.`);
      } catch {
        try { await ffmpeg.deleteFile(virtualIn); } catch {}
      }

      if (!outputBlob) {
        throw new Error('No output media blob generated.');
      }

      // 5. Create download object URL from disk-backed / paged Blob
      const outputUrl = URL.createObjectURL(outputBlob);
      activeOutputUrlRef.current = outputUrl;
      setIsPurged(false);

      const baseName = sourceMeta.name.replace(/\.[^/.]+$/, '');
      const outputSuffix = isCopy
        ? '_remuxed'
        : isVideoTarget
        ? '_compressed'
        : '_converted';
      const finalOutputName = `${baseName}${outputSuffix}${extOut}`;
      const elapsed = Date.now() - startTimeRef.current;

      setResult({
        outputUrl,
        blob: outputBlob,
        outputName: finalOutputName,
        outputSize: outputBlob.size,
        durationSeconds: sourceMeta.duration,
        container: config.container,
        elapsedMs: elapsed,
        command: executedCommand,
      });

      addLog('system', `Conversion finished successfully in ${(elapsed / 1000).toFixed(1)}s.`);

      // 6. Cleanup output file node from virtual FS
      try {
        await ffmpeg.deleteFile(virtualOut);
        addLog('system', `Virtual FS garbage collection: Unlinked ${virtualOut}.`);
      } catch (cleanupErr) {
        console.warn('Cleanup non-fatal warning:', cleanupErr);
      }
    } catch (err: any) {
      try {
        await ffmpegRef.current?.unmount(inputMountDir);
        await ffmpegRef.current?.deleteDir(inputMountDir);
      } catch {}
      try {
        await ffmpegRef.current?.deleteFile(virtualOut);
      } catch {}
      console.error('Conversion failed:', err);
      const errorMsg = err?.message || 'Media conversion failed.';
      const diag = diagnoseFFmpegFailure(
        errorMsg,
        probeLogsBuffer.current,
        config,
        sourceMeta
      );
      setConversionDiagnostic(diag);
      setConversionError(`${diag.title}: ${diag.explanation}`);
      addLog('error', `Execution failed: ${errorMsg}`);
    } finally {
      if (wakeLockSentinelRef.current) {
        try {
          await wakeLockSentinelRef.current.release();
        } catch {}
        wakeLockSentinelRef.current = null;
      }
      setIsConverting(false);
    }
  };

  // Abort ongoing job
  const handleAbort = async () => {
    addLog('error', 'Conversion canceled.');
    if (hwAbortController.current) {
      try {
        hwAbortController.current.abort();
      } catch {}
      hwAbortController.current = null;
    }
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch {}
      wakeLockSentinelRef.current = null;
    }
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
      } catch {}
    }
    setIsConverting(false);
    setConversionError('Conversion was canceled.');
    setEngineReady(false);
    initEngine();
  };

  // Generate current command preview args
  const currentCommandArgs = buildFFmpegArgs(
    sourceMeta ? `input${sourceMeta.extension || ''}` : 'input.media',
    `output${getRecommendedExtension(config.container)}`,
    config,
    sourceMeta
  );

  return (
    <div className="min-h-screen text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      <Header
        terminalOpen={terminalOpen}
        toggleTerminal={() => setTerminalOpen(!terminalOpen)}
        logCount={logs.length}
        activeWorkspace={workspaceMode}
        onSelectWorkspace={setWorkspaceMode}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-4">
        {engineError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs font-mono flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-400 text-sm">Engine Failed to Load</div>
              <p className="mt-1 text-red-300/90">{engineError}</p>
              <button
                onClick={initEngine}
                className="mt-2.5 px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-red-100 border border-red-700 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {conversionError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs font-mono flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-400 text-sm">
                {conversionDiagnostic ? conversionDiagnostic.title : 'Conversion Error'}
              </div>
              <p className="mt-1 text-red-300/90">
                {conversionDiagnostic ? conversionDiagnostic.explanation : conversionError}
              </p>
              <div className="mt-2 text-[11px] text-amber-300/90 bg-red-950/60 border border-red-800/50 rounded px-2.5 py-1.5">
                <strong>Try this:</strong>{' '}
                {conversionDiagnostic
                  ? conversionDiagnostic.suggestion
                  : 'Switch to H.264 / AAC or drop incompatible subtitle tracks.'}
              </div>
            </div>
          </div>
        )}

        {workspaceMode === 'pdf' ? (
          <PdfLockerWorkstation onLog={addLog} />
        ) : workspaceMode === 'compressor' ? (
          <FileCompressorWorkstation />
        ) : workspaceMode === 'split' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <div className="p-3 rounded-xl cyber-panel flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Media</span>
                </span>
                <button
                  onClick={() => setWorkspaceMode('media')}
                  className="text-[11px] font-mono text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  Expand →
                </button>
              </div>

              {!sourceMeta ? (
                <MediaDropzone onFileSelected={handleFileSelected} disabled={false} />
              ) : (
                <div className="space-y-4">
                  <SourceInspector
                    source={sourceMeta}
                    isProbing={isProbing}
                    onClear={handleClearFile}
                    disabled={isConverting}
                    config={config}
                    onChangeConfig={setConfig}
                    onExtractSubtitle={handleExtractSubtitleSrt}
                    extractingSubtitleIndex={extractingSubtitleIndex}
                  />

                  {result ? (
                    <ResultPanel
                      result={result}
                      source={sourceMeta}
                      onReset={handleClearFile}
                      onAdjustSettings={() => {
                        revokeActiveUrl();
                        setIsPurged(false);
                        setResult(null);
                      }}
                      onPurgeCache={purgeAllCaches}
                      isPurged={isPurged}
                    />
                  ) : isConverting ? (
                    <ProgressEngine
                      telemetry={telemetry}
                      onCancel={handleAbort}
                      outputName={sourceMeta.name.replace(/\.[^/.]+$/, '') + getRecommendedExtension(config.container)}
                    />
                  ) : (
                    <div className="space-y-4">
                      <EncodingControls
                        config={config}
                        onChange={setConfig}
                        source={sourceMeta}
                        disabled={isConverting}
                        hardwareCaps={hardwareCaps}
                      />

                      <div className="cyber-panel rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                            <Zap className="w-5 h-5 fill-current" />
                          </div>
                          <div>
                            <div className="text-sm font-mono font-bold text-zinc-100 flex items-center gap-2">
                              <span>Output</span>
                              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono text-xs uppercase font-bold">
                                .{config.container}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 font-mono mt-0.5">
                              {config.targetCategory === 'video' && config.container !== 'gif'
                                ? config.videoCodec === 'copy'
                                  ? 'Remux (Direct stream copy)'
                                  : config.hardwareAcceleration !== false &&
                                    config.hardwareEngine !== 'cpu' &&
                                    (config.container === 'mp4' || config.container === 'mov') &&
                                    (hardwareCaps?.webcodecs.hwH264 ||
                                      hardwareCaps?.webcodecs.hwHEVC ||
                                      hardwareCaps?.webcodecs.available)
                                  ? `Compress (Hardware GPU • ${config.videoCodec === 'libx265' ? 'HEVC' : 'H.264'})`
                                  : `Compress (CPU • ${config.speedPreset})`
                                : `Convert to .${config.container.toUpperCase()}`}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={handleStartConversion}
                          disabled={!rawFile || isConverting || engineLoading}
                          className="cyber-btn-primary w-full sm:w-auto px-6 py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {engineLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                              <span>Loading...</span>
                            </>
                          ) : (
                            <span>
                              {config.targetCategory === 'video' && config.container !== 'gif'
                                ? config.videoCodec === 'copy'
                                  ? `Remux to .${config.container.toUpperCase()}`
                                  : `Compress to .${config.container.toUpperCase()}`
                                : `Convert to .${config.container.toUpperCase()}`}
                            </span>
                          )}
                        </button>
                      </div>

                      <CommandPreview commandArgs={currentCommandArgs} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-xl cyber-panel flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                  <Archive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Archive</span>
                </span>
                <button
                  onClick={() => setWorkspaceMode('compressor')}
                  className="text-[11px] font-mono text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Expand →
                </button>
              </div>

              <FileCompressorWorkstation />
            </div>
          </div>
        ) : (
          <>
            {!sourceMeta ? (
              <MediaDropzone onFileSelected={handleFileSelected} disabled={false} />
            ) : (
              <div className="space-y-4">
                <SourceInspector
                  source={sourceMeta}
                  isProbing={isProbing}
                  onClear={handleClearFile}
                  disabled={isConverting}
                  config={config}
                  onChangeConfig={setConfig}
                  onExtractSubtitle={handleExtractSubtitleSrt}
                  extractingSubtitleIndex={extractingSubtitleIndex}
                />

                {result ? (
                  <ResultPanel
                    result={result}
                    source={sourceMeta}
                    onReset={handleClearFile}
                    onAdjustSettings={() => {
                      revokeActiveUrl();
                      setIsPurged(false);
                      setResult(null);
                    }}
                    onPurgeCache={purgeAllCaches}
                    isPurged={isPurged}
                  />
                ) : isConverting ? (
                  <ProgressEngine
                    telemetry={telemetry}
                    onCancel={handleAbort}
                    outputName={sourceMeta.name.replace(/\.[^/.]+$/, '') + getRecommendedExtension(config.container)}
                  />
                ) : (
                  <div className="space-y-4">
                    <EncodingControls
                      config={config}
                      onChange={setConfig}
                      source={sourceMeta}
                      disabled={isConverting}
                      hardwareCaps={hardwareCaps}
                    />

                    <div className="cyber-panel rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_15px_rgba(0,240,255,0.18)]">
                          <Zap className="w-5 h-5 fill-current" />
                        </div>
                        <div>
                          <div className="text-sm font-mono font-bold text-zinc-100 flex items-center gap-2">
                            <span>Output</span>
                            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono text-xs uppercase font-bold">
                              .{config.container}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 font-mono mt-0.5">
                            {config.targetCategory === 'video' && config.container !== 'gif'
                              ? config.videoCodec === 'copy' && config.audioCodec === 'copy'
                                ? 'Remux (Direct copy, no re-encoding)'
                                : config.videoCodec === 'copy'
                                ? 'Remux (Video copy + audio convert)'
                                : config.hardwareAcceleration !== false &&
                                  config.hardwareEngine !== 'cpu' &&
                                  (config.container === 'mp4' || config.container === 'mov') &&
                                  (hardwareCaps?.webcodecs.hwH264 ||
                                    hardwareCaps?.webcodecs.hwHEVC ||
                                    hardwareCaps?.webcodecs.available)
                                ? `Compress (Hardware GPU • ${config.videoCodec === 'libx265' ? 'HEVC' : 'H.264'})`
                                : `Compress (CPU • ${config.speedPreset})`
                              : `Convert to .${config.container.toUpperCase()}`}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleStartConversion}
                        disabled={!rawFile || isConverting || engineLoading}
                        aria-label={`Process media file to ${config.container.toUpperCase()}`}
                        className="cyber-btn-primary w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm tracking-wide transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                      >
                        {engineLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <span>
                            {config.targetCategory === 'video' && config.container !== 'gif'
                              ? config.videoCodec === 'copy'
                                ? `Remux to .${config.container.toUpperCase()}`
                                : `Compress to .${config.container.toUpperCase()}`
                              : `Convert to .${config.container.toUpperCase()}`}
                          </span>
                        )}
                      </button>
                    </div>

                    <CommandPreview commandArgs={currentCommandArgs} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <Footer onOpenCompliance={handleOpenCompliance} />

      <TerminalDock
        logs={logs}
        isOpen={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        onClear={() => setLogs([])}
      />

      <ComplianceModal
        isOpen={complianceOpen}
        onClose={() => setComplianceOpen(false)}
        defaultTab={complianceTab}
      />
    </div>
  );
}
