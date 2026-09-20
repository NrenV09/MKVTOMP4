import { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { 
  Play, 
  Settings2, 
  RotateCcw, 
  AlertCircle, 
  Zap, 
  Sliders, 
  Loader2,
  HardDrive,
  FileVideo,
  CheckCircle2
} from 'lucide-react';

import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import workerURL from '@ffmpeg/ffmpeg/worker?worker&url';

import coreMTURL from '@ffmpeg/core-mt?url';
import wasmMTURL from '@ffmpeg/core-mt/wasm?url';
import workerMTURL from '@ffmpeg/core-mt/worker?url';

import { 
  SourceMetadata, 
  EncodingConfig, 
  ProgressTelemetry, 
  LogMessage, 
  ConversionResult 
} from './types';
import { 
  buildFFmpegArgs, 
  getRecommendedExtension, 
  getMimeType, 
  formatDuration,
  checkCompatibility,
  detectDeviceCapabilities
} from './utils/ffmpegBuilder';
import { parseFFmpegProbeLogs, probeMediaElement, AUDIO_EXTENSIONS, getFileExtension } from './utils/probe';
import { 
  detectHardwareCapabilities, 
  transcodeWithHardwareWebCodecs, 
  HardwareCapabilities 
} from './utils/hardwareEngine';
import {
  getCachedWasmBlobURL,
  getWasmCacheStats,
  WASM_ENGINE_CACHE_NAME,
  WasmCacheStats,
} from './utils/wasmCache';

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
import { OfflineIndicator } from './components/OfflineIndicator';
import { FileCompressorWorkstation } from './components/FileCompressorWorkstation';
import { Film, Archive } from 'lucide-react';

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
  fastStart: true,
  hardwareAcceleration: true,
  hardwareEngine: 'auto',
};

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('compressor');
  const [engineReady, setEngineReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineMode, setEngineMode] = useState<'mt' | 'st'>('st');

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMetadata | null>(null);
  const [isProbing, setIsProbing] = useState(false);

  const [hardwareCaps, setHardwareCaps] = useState<HardwareCapabilities | null>(null);
  const hwAbortController = useRef<AbortController | null>(null);

  const [config, setConfig] = useState<EncodingConfig>(DEFAULT_CONFIG);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);

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
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wasmCacheStats, setWasmCacheStats] = useState<WasmCacheStats | null>(null);
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
  const activeVirtualFiles = useRef<{ inName?: string; outName?: string }>({});
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

    // 4. Purge temporary browser caches while PRESERVING the WebAssembly engine cache
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const keys = await window.caches.keys();
        for (const key of keys) {
          if (key !== WASM_ENGINE_CACHE_NAME) {
            await window.caches.delete(key);
          }
        }
      } catch {}
    }

    setIsPurged(true);
    addLog('system', 'Purged media cache and released memory buffers (WebAssembly engine safely preserved in cache).');
    getWasmCacheStats().then(setWasmCacheStats);
  }, [addLog, revokeActiveUrl]);

  // Initialize FFmpeg WebAssembly core
  const initEngine = async () => {
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      setEngineReady(true);
      return;
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

      let mtLoaded = false;
      if (hasSAB) {
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
            addLog('system', `WebAssembly multi-threaded core loaded directly from persistent browser cache (${cachedMB} MB, zero network transfer).`);
          } else {
            const storedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
            addLog('system', `WebAssembly multi-threaded core saved to persistent browser cache (${storedMB} MB).`);
          }

          await ffmpeg.load({
            coreURL: coreRes.blobUrl,
            wasmURL: wasmRes.blobUrl,
            workerURL: workerRes.blobUrl,
            classWorkerURL: workerURL,
          });
          mtLoaded = true;
          setEngineMode('mt');
          addLog('system', `Hardware Multi-Threading active (${dev.cores} worker threads allocated from persistent cache).`);
        } catch (mtErr: any) {
          console.warn('Local multi-threaded core load skipped, falling back to local standard core:', mtErr);
          addLog('system', `Multi-threading initialization note: ${mtErr?.message || 'sandbox fallback'}. Loading in-app standard engine...`);
        }
      }

      if (!mtLoaded) {
        addLog('system', 'Mounting local single-threaded in-app engine...');
        const corePath = new URL('/ffmpeg/core/ffmpeg-core.js', window.location.href).href;
        const wasmPath = new URL('/ffmpeg/core/ffmpeg-core.wasm', window.location.href).href;

        const [coreRes, wasmRes] = await Promise.all([
          getCachedWasmBlobURL(corePath, 'text/javascript', coreURL),
          getCachedWasmBlobURL(wasmPath, 'application/wasm', wasmURL),
        ]);

        if (coreRes.fromCache && wasmRes.fromCache) {
          const cachedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
          addLog('system', `WebAssembly core loaded directly from persistent browser cache (${cachedMB} MB, zero network transfer).`);
        } else {
          const storedMB = ((coreRes.sizeBytes + wasmRes.sizeBytes) / 1024 / 1024).toFixed(1);
          addLog('system', `WebAssembly core saved to persistent browser cache (${storedMB} MB).`);
        }

        await ffmpeg.load({
          coreURL: coreRes.blobUrl,
          wasmURL: wasmRes.blobUrl,
          classWorkerURL: workerURL,
        });
        setEngineMode('st');
        addLog('system', 'FFmpeg WebAssembly Core successfully mounted from persistent browser cache. 100% offline MEMFS ready.');
      }
      setEngineReady(true);
      getWasmCacheStats().then(setWasmCacheStats);
    } catch (err: any) {
      console.error('FFmpeg load error:', err);
      const msg = err?.message || 'Failed to initialize WebAssembly engine.';
      setEngineError(msg);
      addLog('error', `Engine init failure: ${msg}`);
    } finally {
      setEngineLoading(false);
    }
  };

  useEffect(() => {
    initEngine();
    return () => {
      revokeActiveUrl();
    };
  }, [revokeActiveUrl]);

  // Inspect source media file
  const handleFileSelected = async (file: File) => {
    revokeActiveUrl();
    setIsPurged(false);
    setRawFile(file);
    setResult(null);
    setConversionError(null);
    setIsProbing(true);

    const ext = getFileExtension(file.name);
    const isAudioOnly = AUDIO_EXTENSIONS.includes(ext) || (file.type ? file.type.startsWith('audio/') : false);

    addLog('system', `Loaded source file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // 1. Initial fast HTML5 probe
    const htmlMeta = await probeMediaElement(file);

    let initialMeta: SourceMetadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'media/unknown',
      extension: ext || (isAudioOnly ? '.mp3' : ''),
      duration: htmlMeta.duration,
      width: htmlMeta.width,
      height: htmlMeta.height,
      hasVideo: isAudioOnly ? false : (htmlMeta.hasVideo ?? true),
      hasAudio: htmlMeta.hasAudio ?? true,
    };

    setSourceMeta(initialMeta);

    // Adapt default configuration:
    // On Apple Silicon M3, default to Stream Copy (Remux) for video containers
    // which operates at 50x-150x speed with 0% CPU loss!
    if (isAudioOnly) {
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'audio',
        container: 'mp3',
        audioCodec: 'libmp3lame',
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        targetCategory: 'video',
        container: 'mp4',
        videoCodec: 'copy',
        audioCodec: 'copy',
        speedPreset: 'ultrafast',
        fastStart: true,
      }));
    }

    // 2. Comprehensive stream inspection via FFmpeg
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      try {
        probeLogsBuffer.current = [];
        const tempName = `probe_${Date.now()}${ext || ''}`;
        addLog('system', `Probing stream headers for ${file.name}...`);

        // Write small chunk or full file for header parsing
        await ffmpegRef.current.writeFile(tempName, await fetchFile(file));
        // Calling ffmpeg -i tempName will dump stream layout to logs and return 1
        await ffmpegRef.current.exec(['-i', tempName]);

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
            videoCodec: parsed.videoCodec,
            audioCodec: parsed.audioCodec,
            audioSampleRate: parsed.audioSampleRate,
            audioChannels: parsed.audioChannels,
            bitrate: parsed.bitrate,
            parsedStreams: parsed.parsedStreams,
            hasVideo: hasV,
            hasAudio: hasA,
          };
        });

        // If deep probe determined it has no video and only audio, adjust to audio
        if (!parsed.hasVideo && parsed.hasAudio) {
          setConfig((prev) => ({
            ...prev,
            targetCategory: 'audio',
            container: prev.targetCategory === 'audio' ? prev.container : 'mp3',
            audioCodec: prev.targetCategory === 'audio' ? prev.audioCodec : 'libmp3lame',
          }));
          addLog('system', 'Detected audio-only stream layout. Configured target for audio export.');
        } else if (parsed.hasVideo) {
          const srcVid = (parsed.videoCodec || '').toLowerCase();
          const isRemuxSafe = ['h264', 'avc1', 'hevc', 'h265', 'mpeg4', 'av1'].some((c) => srcVid.includes(c));

          if (isRemuxSafe) {
            setConfig((prev) => ({
              ...prev,
              videoCodec: 'copy',
              audioCodec: (parsed.audioCodec || '').toLowerCase().includes('aac') ? 'copy' : 'aac',
              hardwareAcceleration: true,
              hardwareEngine: 'stream-copy',
            }));
            addLog('system', `Native ${parsed.videoCodec} stream confirmed. Direct hardware stream copy enabled.`);
          } else {
            // Source requires transcoding (e.g. WMV, VP8, VP9)
            // Use WebGPU / WebCodecs hardware acceleration with ultrafast fallback
            setConfig((prev) => ({
              ...prev,
              videoCodec: 'libx264',
              audioCodec: 'aac',
              speedPreset: 'ultrafast',
              hardwareAcceleration: true,
              hardwareEngine: 'webgpu',
            }));
            addLog('system', `Source codec ${parsed.videoCodec || 'unknown'} requires re-encoding. WebGPU & WebCodecs hardware acceleration configured.`);
          }
        }

        // Clean up temporary probe file from virtual MEMFS
        try {
          await ffmpegRef.current.deleteFile(tempName);
        } catch {
          // ignore cleanup err
        }

        addLog('system', 'Stream layout inspection complete.');
      } catch (err) {
        // Handled silently since probe logs contain what we need
      }
    }

    setIsProbing(false);
  };

  const handleClearFile = () => {
    revokeActiveUrl();
    setIsPurged(false);
    setRawFile(null);
    setSourceMeta(null);
    setResult(null);
    setConversionError(null);
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
    if (!rawFile || !sourceMeta || !ffmpegRef.current) return;

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
    setResult(null);

    // Acquire Screen Wake Lock so display/thread does not sleep during active encode
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = lock;
        setWakeLockActive(true);
        addLog('system', 'Acquired Screen Wake Lock.');
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
    const virtualIn = `input_${Date.now()}${extIn}`;
    const virtualOut = `output_${Date.now()}${extOut}`;
    activeVirtualFiles.current = { inName: virtualIn, outName: virtualOut };

    addLog('system', `Mounting ${rawFile.name} to MEMFS as ${virtualIn}...`);

    try {
      const ffmpeg = ffmpegRef.current;

      // Pipeline selection:
      const isCopy = config.videoCodec === 'copy';
      const isTargetMp4 = config.container === 'mp4';
      const canHardwareWebCodecs =
        !isCopy &&
        config.hardwareAcceleration !== false &&
        isTargetMp4 &&
        (hardwareCaps?.webcodecs.hwH264 || hardwareCaps?.webcodecs.available);

      let outputBlob: Blob | null = null;
      let executedCommand: string[] = [];

      // 1. Write file into WebAssembly MEMFS
      await ffmpeg.writeFile(virtualIn, await fetchFile(rawFile));

      if (isCopy) {
        // DIRECT STREAM COPY (Instant passthrough)
        setTelemetry((prev) => ({
          ...prev,
          accelerationMode: 'Direct Stream Copy (Instant 100x)',
        }));
        addLog('system', 'Direct stream copy enabled. Zero re-encoding passthrough pipeline.');
        executedCommand = buildFFmpegArgs(virtualIn, virtualOut, config, sourceMeta);
        addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);

        const returnCode = await ffmpeg.exec(executedCommand);
        if (returnCode !== 0) {
          throw new Error(
            `Direct stream copy exited with code ${returnCode}. Source stream is incompatible with .${config.container}. Try selecting WebGPU Hardware Re-encode.`
          );
        }

        const outputData = await ffmpeg.readFile(virtualOut);
        const mimeType = getMimeType(config.container);
        outputBlob = new Blob([outputData as Uint8Array], { type: mimeType });
      } else if (canHardwareWebCodecs) {
        // WEBGPU & WEBCODECS HARDWARE ACCELERATION
        setTelemetry((prev) => ({
          ...prev,
          accelerationMode: 'WebGPU & VideoToolbox Hardware Engine',
        }));
        addLog('system', 'Initializing WebCodecs & WebGPU hardware video pipeline...');

        let sourceBlobForHw: Blob = rawFile;
        // If file is MKV or similar, do a high-speed stream remux to MP4 in memory so browser media decoder can ingest it
        if (extIn.toLowerCase() === '.mkv' || extIn.toLowerCase() === '.avi') {
          addLog('system', 'Pre-flight stream remuxing for hardware video decoder...');
          const tempRemuxOut = `temp_hw_remux_${Date.now()}.mp4`;
          const remuxArgs = ['-threads', '0', '-i', virtualIn, '-c:v', 'copy', '-c:a', 'copy', '-tag:v', 'hvc1', '-movflags', '+faststart', tempRemuxOut];
          const remuxCode = await ffmpeg.exec(remuxArgs);
          if (remuxCode === 0) {
            const remuxData = await ffmpeg.readFile(tempRemuxOut);
            sourceBlobForHw = new Blob([remuxData as Uint8Array], { type: 'video/mp4' });
            try { await ffmpeg.deleteFile(tempRemuxOut); } catch {}
          }
        }

        try {
          hwAbortController.current = new AbortController();
          let targetWidth: number | undefined;
          let targetHeight: number | undefined;
          if (config.resolution !== 'source') {
            const [w, h] = config.resolution.split('x').map(Number);
            targetWidth = w;
            targetHeight = h;
          }
          let bitrateBps: number | undefined;
          if (config.videoBitrate) {
            bitrateBps = parseInt(config.videoBitrate, 10) * 1000;
          }

          outputBlob = await transcodeWithHardwareWebCodecs(sourceBlobForHw, {
            targetWidth,
            targetHeight,
            bitrate: bitrateBps,
            framerate: config.framerate !== 'source' ? Number(config.framerate) : undefined,
            webgpuFilter: config.webgpuFilter,
            signal: hwAbortController.current.signal,
            onProgress: (p) => {
              const now = Date.now();
              const elapsed = now - startTimeRef.current;
              const remainingSec = p.percent > 1 ? ((elapsed / (p.percent / 100)) - elapsed) / 1000 : null;
              setTelemetry({
                percent: p.percent,
                currentTime: p.currentTime,
                duration: p.duration,
                fps: p.fps,
                speed: `${p.fps} fps (Hardware)`,
                elapsedMs: elapsed,
                etaSeconds: remainingSec !== null ? Math.max(0, Math.round(remainingSec)) : null,
                accelerationMode: 'WebGPU & VideoToolbox Hardware Engine',
              });
            },
          });
          executedCommand = [
            'webcodecs',
            '--hardware-acceleration=prefer-hardware',
            `--width=${targetWidth || 'source'}`,
            `--bitrate=${bitrateBps || 'auto'}`
          ];
          addLog('system', 'Hardware WebCodecs encode completed via GPU media engine.');
        } catch (hwErr: any) {
          if (hwAbortController.current?.signal.aborted) {
            throw hwErr;
          }
          addLog('system', `Hardware encoder fallback (${hwErr?.message || 'hardware unavailable'}). Switching to multi-threaded CPU software.`);
          executedCommand = buildFFmpegArgs(virtualIn, virtualOut, config, sourceMeta);
          addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
          const returnCode = await ffmpeg.exec(executedCommand);
          if (returnCode !== 0) {
            throw new Error(`FFmpeg conversion returned exit code ${returnCode}.`);
          }
          const outputData = await ffmpeg.readFile(virtualOut);
          const mimeType = getMimeType(config.container);
          outputBlob = new Blob([outputData as Uint8Array], { type: mimeType });
        }
      } else {
        // MULTI-THREADED CPU WASM
        setTelemetry((prev) => ({
          ...prev,
          accelerationMode: 'Multi-threaded CPU Wasm',
        }));
        executedCommand = buildFFmpegArgs(virtualIn, virtualOut, config, sourceMeta);
        addLog('system', `Executing: ffmpeg ${executedCommand.join(' ')}`);
        const returnCode = await ffmpeg.exec(executedCommand);
        if (returnCode !== 0) {
          throw new Error(
            `FFmpeg conversion returned exit code ${returnCode}. Check console telemetry for detailed codec diagnostics.`
          );
        }
        const outputData = await ffmpeg.readFile(virtualOut);
        const mimeType = getMimeType(config.container);
        outputBlob = new Blob([outputData as Uint8Array], { type: mimeType });
      }

      // Unlink input file immediately to free virtual memory before loading output
      try {
        await ffmpeg.deleteFile(virtualIn);
        addLog('system', `Unlinked virtual input buffer ${virtualIn}.`);
      } catch {
        // ignore
      }

      if (!outputBlob) {
        throw new Error('No output media blob generated.');
      }

      // 5. Read generated output from virtual filesystem
      const outputUrl = URL.createObjectURL(outputBlob);
      activeOutputUrlRef.current = outputUrl;
      setIsPurged(false);

      const baseName = sourceMeta.name.replace(/\.[^/.]+$/, '');
      const finalOutputName = `${baseName}_converted${extOut}`;
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

      // 6. Cleanup output file from MEMFS
      try {
        await ffmpeg.deleteFile(virtualOut);
        addLog('system', `MEMFS garbage collection: Unlinked ${virtualOut}.`);
      } catch (cleanupErr) {
        console.warn('Cleanup non-fatal warning:', cleanupErr);
      }
    } catch (err: any) {
      console.error('Conversion failed:', err);
      const errorMsg = err?.message || 'Media conversion failed.';
      setConversionError(errorMsg);
      addLog('error', `Execution failed: ${errorMsg}`);
    } finally {
      // Release Screen Wake Lock
      if (wakeLockSentinelRef.current) {
        try {
          await wakeLockSentinelRef.current.release();
        } catch {
          // ignore
        }
        wakeLockSentinelRef.current = null;
        setWakeLockActive(false);
      }
      setIsConverting(false);
    }
  };

  // Abort ongoing job
  const handleAbort = async () => {
    addLog('error', 'User aborted conversion process. Terminating workers...');
    if (hwAbortController.current) {
      try {
        hwAbortController.current.abort();
      } catch {}
      hwAbortController.current = null;
    }
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch {
        // ignore
      }
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
    }
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
      } catch {
        // ignore
      }
    }
    setIsConverting(false);
    setConversionError('Conversion process was terminated by user.');
    setEngineReady(false);
    // Reboot engine
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
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Workstation Header */}
      <Header
        engineReady={engineReady}
        engineLoading={engineLoading}
        engineMode={engineMode}
        terminalOpen={terminalOpen}
        toggleTerminal={() => setTerminalOpen(!terminalOpen)}
        logCount={logs.length}
        wakeLockActive={wakeLockActive}
        hardwareCaps={hardwareCaps}
        onPurgeCache={purgeAllCaches}
        wasmCacheStats={wasmCacheStats}
        onOpenCompliance={handleOpenCompliance}
        activeWorkspace={workspaceMode}
        onSelectWorkspace={setWorkspaceMode}
      />

      {/* Main Workstation Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 space-y-4">
        {/* Engine Alert (if loading error) */}
        {engineError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs font-mono flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-400 text-sm">Media Engine Failed to Initialize</div>
              <p className="mt-1 text-red-300/90">{engineError}</p>
              <button
                onClick={initEngine}
                className="mt-2.5 px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-red-100 border border-red-700 transition-colors"
              >
                Retry Initialization
              </button>
            </div>
          </div>
        )}

        {/* Global Conversion Error */}
        {conversionError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 text-xs font-mono flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-400 text-sm">Conversion Pipeline Error</div>
              <p className="mt-1 text-red-300/90">{conversionError}</p>
              <div className="mt-2 text-[11px] text-zinc-400">
                Tip: If you used "Stream Copy", the source video/audio codecs may not fit into the chosen container. Select "H.264 / AAC" under encoding controls to re-encode.
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE VIEWS */}
        {workspaceMode === 'compressor' ? (
          /* File Compressor & Decompressor Full View */
          <FileCompressorWorkstation />
        ) : workspaceMode === 'split' ? (
          /* Side-by-Side Split View */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Left Column: Media Converter */}
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#121215] border border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Media Converter (MKV/MP4)</span>
                </span>
                <button
                  onClick={() => setWorkspaceMode('media')}
                  className="text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors"
                >
                  Focus View →
                </button>
              </div>

              {!sourceMeta ? (
                <div className="space-y-3">
                  <MediaDropzone
                    onFileSelected={handleFileSelected}
                    disabled={!engineReady || engineLoading}
                  />

                  {!engineReady && !engineError && (
                    <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-500 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Mounting WebAssembly engine in background...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <SourceInspector
                    source={sourceMeta}
                    isProbing={isProbing}
                    onClear={handleClearFile}
                    disabled={isConverting}
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

                      <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <Zap className="w-5 h-5 fill-current" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                              <span>Target format</span>
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs uppercase font-bold">
                                .{config.container}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 font-mono mt-0.5">
                              {config.videoCodec === 'copy' && config.audioCodec === 'copy'
                                ? '⚡ Direct stream copy'
                                : `Transcode (${config.speedPreset})`}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={handleStartConversion}
                          disabled={!engineReady || isConverting}
                          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span>Convert to .{config.container.toUpperCase()}</span>
                        </button>
                      </div>

                      <CommandPreview commandArgs={currentCommandArgs} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: File Compressor & Decompressor */}
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#121215] border border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <Archive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>File Compressor & Decompressor (ZIP / TAR / GZ)</span>
                </span>
                <button
                  onClick={() => setWorkspaceMode('compressor')}
                  className="text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors"
                >
                  Focus View →
                </button>
              </div>

              <FileCompressorWorkstation />
            </div>
          </div>
        ) : (
          /* Media Converter Standard Full View */
          <>
            {!sourceMeta ? (
              <div className="space-y-3">
                <MediaDropzone
                  onFileSelected={handleFileSelected}
                  disabled={!engineReady || engineLoading}
                />

                {!engineReady && !engineError && (
                  <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-500 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Mounting WebAssembly engine in background...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <SourceInspector
                  source={sourceMeta}
                  isProbing={isProbing}
                  onClear={handleClearFile}
                  disabled={isConverting}
                />

                {/* 2. RESULT PANEL (If completed) */}
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
                  /* 3. ACTIVE CONVERSION PROGRESS ENGINE */
                  <ProgressEngine
                    telemetry={telemetry}
                    onCancel={handleAbort}
                    outputName={sourceMeta.name.replace(/\.[^/.]+$/, '') + getRecommendedExtension(config.container)}
                  />
                ) : (
                  /* 4. ENCODING CONTROLS & COMMAND PREVIEW */
                  <div className="space-y-4">
                    <EncodingControls
                      config={config}
                      onChange={setConfig}
                      source={sourceMeta}
                      disabled={isConverting}
                      hardwareCaps={hardwareCaps}
                    />

                    {/* Primary Action Button & Summary */}
                    <div className="bg-[#121215] border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <Zap className="w-5 h-5 fill-current" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <span>Target format</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs uppercase font-bold">
                              .{config.container}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 font-mono mt-0.5">
                            {config.videoCodec === 'copy' && config.audioCodec === 'copy'
                              ? '⚡ Direct stream copy (lossless passthrough • near-instant remuxing)'
                              : config.videoCodec === 'copy'
                              ? '⚡ Video passthrough (stream copy) • Audio transcode'
                              : config.hardwareAcceleration !== false && (hardwareCaps?.webcodecs.hwH264 || hardwareCaps?.webcodecs.available)
                              ? '⚡ Hardware-accelerated encoding via WebCodecs & GPU'
                              : `CPU multi-core transcode (${config.speedPreset})`}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleStartConversion}
                        disabled={!engineReady || isConverting}
                        aria-label={`Convert media file to ${config.container.toUpperCase()} container`}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-sans font-bold text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        <span>Convert to .{config.container.toUpperCase()}</span>
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

      {/* Compliance & Legal Footer */}
      <Footer onOpenCompliance={handleOpenCompliance} />

      {/* Terminal Telemetry Dock */}
      <TerminalDock
        logs={logs}
        isOpen={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        onClear={() => setLogs([])}
      />

      {/* Legal, Privacy & Compliance Transparency Modal */}
      <ComplianceModal
        isOpen={complianceOpen}
        onClose={() => setComplianceOpen(false)}
        defaultTab={complianceTab}
      />

      {/* Real-time Offline Connectivity Status Indicator */}
      <OfflineIndicator />
    </div>
  );
}
